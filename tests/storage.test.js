import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SETTINGS_KEY, LOG_KEY, loadSettings, saveSettings, loadLog, appendLog, deleteLogEntry, clearLog, buildLogEntry,
} from '../js/storage.js';
import { DEFAULT_SETTINGS } from '../js/settings.js';
import { memoryStorage, throwingStorage, ex } from './helpers.js';

test('keys match the spec', () => {
  assert.equal(SETTINGS_KEY, 'workout.settings.v1');
  assert.equal(LOG_KEY, 'workout.log.v1');
});

test('loadSettings returns defaults when nothing is stored, storage is missing, or it throws', () => {
  assert.deepEqual(loadSettings(memoryStorage()), { ...DEFAULT_SETTINGS });
  assert.deepEqual(loadSettings(null), { ...DEFAULT_SETTINGS });
  assert.deepEqual(loadSettings(throwingStorage()), { ...DEFAULT_SETTINGS });
});

test('loadSettings survives corrupt JSON', () => {
  assert.deepEqual(loadSettings(memoryStorage({ [SETTINGS_KEY]: '{not json' })), { ...DEFAULT_SETTINGS });
});

test('loadSettings repairs individual fields', () => {
  const storage = memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ workSec: 30, rounds: 'many', cardio: true, exercisesPerRound: 8 }) });
  const settings = loadSettings(storage);
  assert.equal(settings.workSec, 30);
  assert.equal(settings.rounds, 3);
  assert.equal(settings.exercisesPerRound, 10);
});

test('saveSettings round-trips and reports failure without throwing', () => {
  const storage = memoryStorage();
  const settings = { ...DEFAULT_SETTINGS, workSec: 25, rings: 'waist' };
  assert.equal(saveSettings(settings, storage), true);
  assert.deepEqual(loadSettings(storage), settings);
  assert.equal(saveSettings(settings, throwingStorage()), false);
});

test('loadLog handles empty, corrupt, non-array and invalid entries', () => {
  assert.deepEqual(loadLog(memoryStorage()), []);
  assert.deepEqual(loadLog(memoryStorage({ [LOG_KEY]: 'garbage' })), []);
  assert.deepEqual(loadLog(memoryStorage({ [LOG_KEY]: '{"a":1}' })), []);
  assert.deepEqual(loadLog(throwingStorage()), []);
  const good = { id: '1', startedAt: '2026-10-15T10:00:00.000Z' };
  const stored = JSON.stringify([good, null, 5, { startedAt: 'not a date' }, { id: 'x' }]);
  assert.deepEqual(loadLog(memoryStorage({ [LOG_KEY]: stored })), [good]);
});

test('appendLog persists entries in order and never throws', () => {
  const storage = memoryStorage();
  const first = { id: '1', startedAt: '2026-10-14T10:00:00.000Z' };
  const second = { id: '2', startedAt: '2026-10-15T10:00:00.000Z' };
  appendLog(first, storage);
  assert.deepEqual(appendLog(second, storage), [first, second]);
  assert.deepEqual(loadLog(storage), [first, second]);
  assert.doesNotThrow(() => appendLog(first, throwingStorage()));
});

const day = (n) => ({ id: String(n), startedAt: `2026-10-${10 + n}T10:00:00.000Z`, mode: 'timed', partial: false });

test('deleteLogEntry removes exactly the matching entry and persists', () => {
  const [a, b, c] = [day(1), day(2), day(3)];
  const storage = memoryStorage({ [LOG_KEY]: JSON.stringify([a, b, c]) });
  assert.deepEqual(deleteLogEntry('2', storage), [a, c]);
  assert.deepEqual(loadLog(storage), [a, c]);
});

test('deleteLogEntry leaves the log unchanged for an unknown id', () => {
  const log = [day(1), day(2)];
  const storage = memoryStorage({ [LOG_KEY]: JSON.stringify(log) });
  assert.deepEqual(deleteLogEntry('99', storage), log);
  assert.deepEqual(loadLog(storage), log);
});

test('deleteLogEntry does not remove other entries that share fields', () => {
  const twin = { ...day(1), id: '2' };
  const log = [day(1), twin];
  const storage = memoryStorage({ [LOG_KEY]: JSON.stringify(log) });
  assert.deepEqual(deleteLogEntry('1', storage), [twin]);
});

test('deleteLogEntry with a nullish or non-id argument changes and writes nothing', () => {
  const log = [day(1), { startedAt: '2026-10-12T10:00:00.000Z' }];
  for (const id of [undefined, null, {}, [], true]) {
    const storage = memoryStorage({ [LOG_KEY]: JSON.stringify(log) });
    const writes = [];
    const spy = { getItem: storage.getItem, setItem: (...args) => { writes.push(args); storage.setItem(...args); } };
    assert.deepEqual(deleteLogEntry(id, spy), log);
    assert.equal(writes.length, 0);
  }
});

test('deleteLogEntry removes only one of several entries sharing an id', () => {
  const log = [day(1), { ...day(2), id: '1' }, day(3)];
  const storage = memoryStorage({ [LOG_KEY]: JSON.stringify(log) });
  assert.deepEqual(deleteLogEntry('1', storage), [log[1], log[2]]);
  assert.deepEqual(loadLog(storage), [log[1], log[2]]);
});

test('entries lacking an id are untouched by any single delete', () => {
  const idless = [{ startedAt: '2026-10-11T10:00:00.000Z' }, { startedAt: '2026-10-12T10:00:00.000Z' }];
  const storage = memoryStorage({ [LOG_KEY]: JSON.stringify([...idless, day(3)]) });
  for (const id of ['undefined', 'null', '', undefined, null]) deleteLogEntry(id, storage);
  assert.deepEqual(loadLog(storage), [...idless, day(3)]);
  assert.deepEqual(deleteLogEntry('3', storage), idless);
});

test('deleteLogEntry compares ids as strings', () => {
  const storage = memoryStorage({ [LOG_KEY]: JSON.stringify([day(1), day(2)]) });
  assert.deepEqual(deleteLogEntry(1, storage), [day(2)]);
});

test('clearLog empties and persists the log without touching settings', () => {
  const settings = JSON.stringify({ ...DEFAULT_SETTINGS, workSec: 25 });
  const storage = memoryStorage({ [LOG_KEY]: JSON.stringify([day(1), day(2)]), [SETTINGS_KEY]: settings });
  assert.deepEqual(clearLog(storage), []);
  assert.deepEqual(loadLog(storage), []);
  assert.equal(storage.getItem(SETTINGS_KEY), settings);
});

test('deleteLogEntry and clearLog never throw', () => {
  for (const storage of [throwingStorage(), null]) {
    assert.doesNotThrow(() => deleteLogEntry('1', storage));
    assert.deepEqual(clearLog(storage), []);
  }
  assert.deepEqual(deleteLogEntry('1', throwingStorage()), []);
});

const circuit = [ex('a', 'push', 'none', { name: 'Push-ups' }), ex('b', 'legs', 'none', { name: 'Squats' })];
const settings = { ...DEFAULT_SETTINGS, exercisesPerRound: 2, rounds: 3 };
const startedAt = new Date('2026-10-15T10:00:00.000Z');
const endedAt = new Date('2026-10-15T10:05:00.000Z');

test('buildLogEntry for a completed workout', () => {
  const entry = buildLogEntry({ startedAt, endedAt, activeMs: 250400, plannedSec: 250, exercisesCompleted: 6, circuit, settings });
  assert.deepEqual(entry, {
    id: String(startedAt.getTime()),
    startedAt: '2026-10-15T10:00:00.000Z',
    endedAt: '2026-10-15T10:05:00.000Z',
    mode: 'timed',
    activeSec: 250,
    plannedSec: 250,
    roundsCompleted: 3,
    exercisesCompleted: 6,
    circuit: ['Push-ups', 'Squats'],
    settings,
    partial: false,
  });
  assert.notEqual(entry.settings, settings);
});

test('buildLogEntry for a workout ended early', () => {
  const entry = buildLogEntry({ startedAt, endedAt, activeMs: 100600, plannedSec: 250, exercisesCompleted: 3, circuit, settings });
  assert.equal(entry.activeSec, 101);
  assert.equal(entry.roundsCompleted, 1);
  assert.equal(entry.partial, true);
});

test('buildLogEntry returns null when no exercise was completed', () => {
  assert.equal(buildLogEntry({ startedAt, endedAt, activeMs: 9000, plannedSec: 250, exercisesCompleted: 0, circuit, settings }), null);
});

const repsSettings = { ...DEFAULT_SETTINGS, mode: 'reps', capMin: 20, exercisesPerRound: 2 };

test('buildLogEntry in reps mode: completed run has time but no counts', () => {
  const entry = buildLogEntry({ startedAt, endedAt, activeMs: 1210300, plannedSec: 1210, exercisesCompleted: 0, circuit, settings: repsSettings });
  assert.equal(entry.mode, 'reps');
  assert.equal(entry.activeSec, 1210);
  assert.equal(entry.roundsCompleted, null);
  assert.equal(entry.exercisesCompleted, null);
  assert.deepEqual(entry.circuit, ['Push-ups', 'Squats']);
  assert.equal(entry.partial, false);
});

test('buildLogEntry in reps mode: ended early is partial; ended during prepare is not logged', () => {
  const early = buildLogEntry({ startedAt, endedAt, activeMs: 600000, plannedSec: 1210, exercisesCompleted: 0, circuit, settings: repsSettings });
  assert.equal(early.activeSec, 600);
  assert.equal(early.partial, true);
  assert.equal(buildLogEntry({ startedAt, endedAt, activeMs: 9000, plannedSec: 1210, exercisesCompleted: 0, circuit, settings: repsSettings }), null);
  assert.equal(buildLogEntry({ startedAt, endedAt, activeMs: 10000, plannedSec: 1210, exercisesCompleted: 0, circuit, settings: repsSettings }), null);
});
