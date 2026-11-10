import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SESSION_KEY, CIRCUIT_KEY, SESSION_MAX_AGE_MS, saveSession, loadSession, clearSession, saveCircuit, loadCircuit,
  SETTINGS_KEY,
} from '../js/storage.js';
import { DEFAULT_SETTINGS } from '../js/settings.js';
import { memoryStorage, throwingStorage, ex } from './helpers.js';

const library = [
  ex('a', 'push'), ex('b', 'legs'), ex('c', 'pull', 'bar'), ex('d', 'core'),
  ex('r', 'pull', 'rings', { ringHeight: 'waist' }),
];
const settings = { ...DEFAULT_SETTINGS, exercisesPerRound: 4 };
const circuit = [library[0], library[1], library[2], library[3]];
const NOW = Date.UTC(2026, 10, 10, 7, 30);
const startedAt = new Date(NOW - 60_000);

function saved(overrides = {}, storage = memoryStorage()) {
  saveSession({ circuit, settings, startedAt, elapsedMs: 50_000, paused: false, ...overrides }, NOW, storage);
  return storage;
}

test('session and circuit keys', () => {
  assert.equal(SESSION_KEY, 'workout.session.v1');
  assert.equal(CIRCUIT_KEY, 'workout.circuit.v1');
  assert.equal(SESSION_MAX_AGE_MS, 3 * 60 * 60 * 1000);
});

test('a running session resumes with the time that passed since it was saved', () => {
  const session = loadSession(library, NOW + 7_000, saved());
  assert.deepEqual(session.circuit, circuit);
  assert.deepEqual(session.settings, settings);
  assert.equal(session.startedAt.getTime(), startedAt.getTime());
  assert.equal(session.elapsedMs, 57_000);
  assert.equal(session.paused, false);
});

test('a paused session resumes at the saved time', () => {
  const session = loadSession(library, NOW + 7_000, saved({ paused: true }));
  assert.equal(session.elapsedMs, 50_000);
  assert.equal(session.paused, true);
});

test('the session stores exercise ids, not whole exercises', () => {
  const stored = JSON.parse(saved().data.get(SESSION_KEY));
  assert.deepEqual(stored.circuit, ['a', 'b', 'c', 'd']);
});

test('the mute setting is kept', () => {
  const session = loadSession(library, NOW, saved({ settings: { ...settings, muted: true } }));
  assert.equal(session.settings.muted, true);
});

test('a session saved more than 3 hours ago is stale', () => {
  const storage = saved();
  assert.ok(loadSession(library, NOW + SESSION_MAX_AGE_MS, storage));
  assert.equal(loadSession(library, NOW + SESSION_MAX_AGE_MS + 1, storage), null);
});

test('a clock that went backwards adds no time', () => {
  assert.equal(loadSession(library, NOW - 5_000, saved()).elapsedMs, 50_000);
});

test('missing, corrupt or invalid sessions load as null', () => {
  assert.equal(loadSession(library, NOW, memoryStorage()), null);
  assert.equal(loadSession(library, NOW, null), null);
  assert.equal(loadSession(library, NOW, throwingStorage()), null);
  assert.equal(loadSession(library, NOW, memoryStorage({ [SESSION_KEY]: '{oops' })), null);
  assert.equal(loadSession(library, NOW, memoryStorage({ [SESSION_KEY]: '[]' })), null);
  const valid = JSON.parse(saved().data.get(SESSION_KEY));
  const broken = [
    { ...valid, circuit: ['a', 'b', 'c', 'zzz'] },
    { ...valid, circuit: ['a', 'b'] },
    { ...valid, circuit: 'a' },
    { ...valid, startedAt: 'yesterday' },
    { ...valid, elapsedMs: -1 },
    { ...valid, elapsedMs: 'lots' },
    { ...valid, savedAt: null },
    { ...valid, paused: 'no' },
  ];
  for (const value of broken) {
    assert.equal(loadSession(library, NOW, memoryStorage({ [SESSION_KEY]: JSON.stringify(value) })), null, JSON.stringify(value));
  }
});

test('clearSession removes the session and nothing else', () => {
  const storage = saved();
  storage.setItem(SETTINGS_KEY, '{}');
  clearSession(storage);
  assert.equal(loadSession(library, NOW, storage), null);
  assert.equal(storage.data.get(SETTINGS_KEY), '{}');
});

test('session functions never throw', () => {
  assert.doesNotThrow(() => saved({}, throwingStorage()));
  assert.doesNotThrow(() => saveSession({ circuit, settings, startedAt, elapsedMs: 0, paused: false }, NOW, null));
  assert.doesNotThrow(() => clearSession(throwingStorage()));
  assert.doesNotThrow(() => clearSession(null));
});

test('the setup circuit round-trips', () => {
  const storage = memoryStorage();
  saveCircuit(circuit, storage);
  assert.deepEqual(JSON.parse(storage.data.get(CIRCUIT_KEY)), ['a', 'b', 'c', 'd']);
  assert.deepEqual(loadCircuit(settings, library, storage), circuit);
});

test('a saved circuit that no longer fits the settings is ignored', () => {
  const storage = memoryStorage();
  saveCircuit(circuit, storage);
  assert.equal(loadCircuit({ ...settings, exercisesPerRound: 8 }, library, storage), null);
  assert.equal(loadCircuit({ ...settings, bar: false }, library, storage), null);
  saveCircuit([library[0], library[1], library[4], library[3]], storage);
  assert.equal(loadCircuit({ ...settings, rings: 'low' }, library, storage), null);
  assert.ok(loadCircuit({ ...settings, rings: 'waist' }, library, storage));
});

test('a missing, corrupt or unknown saved circuit loads as null; circuit functions never throw', () => {
  assert.equal(loadCircuit(settings, library, memoryStorage()), null);
  assert.equal(loadCircuit(settings, library, memoryStorage({ [CIRCUIT_KEY]: 'nope' })), null);
  assert.equal(loadCircuit(settings, library, memoryStorage({ [CIRCUIT_KEY]: '["a","b","c","x"]' })), null);
  assert.equal(loadCircuit(settings, library, throwingStorage()), null);
  assert.equal(loadCircuit(settings, library, null), null);
  assert.doesNotThrow(() => saveCircuit(circuit, throwingStorage()));
  assert.doesNotThrow(() => saveCircuit(circuit, null));
});
