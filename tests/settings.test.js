import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS, SETTING_CHOICES, perRoundOptions, mapPerRound, normalizeSettings, applySetting,
} from '../js/settings.js';

test('defaults match the spec', () => {
  assert.deepEqual({ ...DEFAULT_SETTINGS }, {
    workSec: 40, changeoverSec: 5, exercisesPerRound: 8, rounds: 3, roundBreakSec: 60,
    bar: true, chair: true, rings: 'low', cardio: false, muted: false, mode: 'timed', capMin: 20,
  });
});

test('choices cover the spec ranges', () => {
  assert.deepEqual(SETTING_CHOICES.workSec, [20, 25, 30, 35, 40, 45, 50, 55, 60]);
  assert.deepEqual(SETTING_CHOICES.changeoverSec, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(SETTING_CHOICES.rounds, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(SETTING_CHOICES.roundBreakSec, [0, 15, 30, 45, 60, 75, 90, 105, 120]);
  assert.deepEqual(SETTING_CHOICES.rings, ['off', 'low', 'waist']);
  assert.deepEqual(SETTING_CHOICES.capMin, [5, 10, 15, 20, 25, 30, 35, 40]);
  assert.deepEqual(SETTING_CHOICES.mode, ['timed', 'reps']);
});

test('settings saved before reps mode existed get timed mode and the default cap', () => {
  const result = normalizeSettings({ workSec: 30 });
  assert.equal(result.mode, 'timed');
  assert.equal(result.capMin, 20);
  assert.equal(normalizeSettings({ mode: 'amrap', capMin: 7 }).mode, 'timed');
  assert.equal(normalizeSettings({ mode: 'reps', capMin: 7 }).capMin, 20);
  assert.equal(normalizeSettings({ mode: 'reps', capMin: 35 }).capMin, 35);
});

test('per-round options depend on cardio', () => {
  assert.deepEqual(perRoundOptions(false), [4, 8, 12]);
  assert.deepEqual(perRoundOptions(true), [5, 10, 15]);
});

test('mapPerRound maps by position and falls back to the middle option', () => {
  assert.equal(mapPerRound(4, true), 5);
  assert.equal(mapPerRound(8, true), 10);
  assert.equal(mapPerRound(12, true), 15);
  assert.equal(mapPerRound(15, false), 12);
  assert.equal(mapPerRound(7, true), 10);
});

test('normalizeSettings returns defaults for non-objects', () => {
  for (const raw of [undefined, null, 42, 'x', []]) {
    assert.deepEqual(normalizeSettings(raw), { ...DEFAULT_SETTINGS });
  }
});

test('normalizeSettings keeps valid fields and replaces invalid ones individually', () => {
  const result = normalizeSettings({ workSec: 30, rounds: 99, rings: 'waist', bar: 'yes', changeoverSec: 0 });
  assert.equal(result.workSec, 30);
  assert.equal(result.rounds, DEFAULT_SETTINGS.rounds);
  assert.equal(result.rings, 'waist');
  assert.equal(result.bar, DEFAULT_SETTINGS.bar);
  assert.equal(result.changeoverSec, 0);
});

test('normalizeSettings rejects string numbers from old or foreign data', () => {
  const result = normalizeSettings({ workSec: '40', roundBreakSec: '60' });
  assert.equal(result.workSec, 40);
  assert.equal(result.roundBreakSec, 60);
  assert.equal(typeof result.workSec, 'number');
});

test('normalizeSettings falls back to the mode default when exercisesPerRound is from the other cardio mode', () => {
  assert.equal(normalizeSettings({ cardio: true, exercisesPerRound: 8 }).exercisesPerRound, 10);
  assert.equal(normalizeSettings({ cardio: false, exercisesPerRound: 15 }).exercisesPerRound, 8);
  assert.equal(normalizeSettings({ cardio: true, exercisesPerRound: 15 }).exercisesPerRound, 15);
});

test('applySetting changes one key and returns a new object', () => {
  const before = { ...DEFAULT_SETTINGS };
  const after = applySetting(before, 'workSec', 30);
  assert.equal(after.workSec, 30);
  assert.equal(before.workSec, 40);
  assert.notEqual(after, before);
});

test('applySetting remaps exercisesPerRound when cardio toggles', () => {
  const on = applySetting({ ...DEFAULT_SETTINGS, exercisesPerRound: 12 }, 'cardio', true);
  assert.equal(on.cardio, true);
  assert.equal(on.exercisesPerRound, 15);
  const off = applySetting(on, 'cardio', false);
  assert.equal(off.exercisesPerRound, 12);
});

test('applySetting ignores invalid values', () => {
  assert.equal(applySetting({ ...DEFAULT_SETTINGS }, 'rounds', 0).rounds, 3);
});
