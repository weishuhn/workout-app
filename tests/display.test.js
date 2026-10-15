import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, formatTarget, nextWorkIndex, describePosition, ringNotice } from '../js/display.js';
import { DEFAULT_SETTINGS } from '../js/settings.js';
import { ex } from './helpers.js';

const A = ex('a', 'push', 'none', { name: 'Push-ups', cue: 'Chest to floor' });
const B = ex('b', 'legs', 'none', { name: 'Squats', cue: 'Hips low' });
const settings = { ...DEFAULT_SETTINGS, exercisesPerRound: 2, rounds: 2 };
const timeline = [
  { kind: 'prepare', duration: 10, round: 1, slot: 0, exercise: A },     // 0
  { kind: 'work', duration: 40, round: 1, slot: 0, exercise: A },        // 1
  { kind: 'changeover', duration: 5, round: 1, slot: 1, exercise: B },   // 2
  { kind: 'work', duration: 40, round: 1, slot: 1, exercise: B },        // 3
  { kind: 'roundBreak', duration: 60, round: 2, slot: 0, exercise: A },  // 4
  { kind: 'work', duration: 40, round: 2, slot: 0, exercise: A },        // 5
  { kind: 'changeover', duration: 5, round: 2, slot: 1, exercise: B },   // 6
  { kind: 'work', duration: 40, round: 2, slot: 1, exercise: B },        // 7
];
const pos = (index, remainingSec, phaseElapsedSec = 0) =>
  ({ index, phase: timeline[index], remainingSec, phaseElapsedSec, done: false });

test('formatDuration renders m:ss and survives bad input', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(1195), '19:55');
  assert.equal(formatDuration(59.6), '1:00');
  assert.equal(formatDuration(-3), '0:00');
  assert.equal(formatDuration(undefined), '0:00');
  assert.equal(formatDuration(NaN), '0:00');
  assert.equal(formatDuration('90'), '0:00');
});

test('nextWorkIndex skips past the exercise currently shown', () => {
  assert.equal(nextWorkIndex(timeline, 0), 3); // prepare shows A (1); next is B (3)
  assert.equal(nextWorkIndex(timeline, 1), 3);
  assert.equal(nextWorkIndex(timeline, 2), 5); // changeover shows B (3); next is A (5)
  assert.equal(nextWorkIndex(timeline, 6), -1);
  assert.equal(nextWorkIndex(timeline, 7), -1);
});

test('prepare shows the first exercise with a get-ready label', () => {
  const view = describePosition(timeline, pos(0, 10), settings);
  assert.deepEqual(view, {
    kind: 'prepare', label: 'Get ready', name: 'Push-ups', cue: 'Chest to floor', time: '10',
    next: 'Next: Squats', progress: 'Round 1/2 · 1/2', fraction: 0,
  });
});

test('work shows the group label and progress fraction', () => {
  const view = describePosition(timeline, pos(3, 30, 10), settings);
  assert.equal(view.kind, 'work');
  assert.equal(view.label, 'Legs');
  assert.equal(view.name, 'Squats');
  assert.equal(view.progress, 'Round 1/2 · 2/2');
  assert.equal(view.fraction, 0.25);
});

test('changeover and round break labels', () => {
  assert.equal(describePosition(timeline, pos(2, 5), settings).label, 'Next up');
  const rest = describePosition(timeline, pos(4, 60), settings);
  assert.equal(rest.label, 'Rest · Round 2 of 2 next');
  assert.equal(rest.progress, 'Round 2/2 · 1/2');
});

test('last exercise says so', () => {
  assert.equal(describePosition(timeline, pos(7, 40), settings).next, 'Last one!');
  assert.equal(describePosition(timeline, pos(6, 5), settings).next, 'Last one!');
});

test('formatTarget', () => {
  assert.equal(formatTarget({ reps: 15, sided: false }), '15 reps');
  assert.equal(formatTarget({ holdSec: 30, sided: false }), '30s hold');
  assert.equal(formatTarget({ reps: 10, sided: true }), '10 reps each side');
  assert.equal(formatTarget({ holdSec: 30, sided: true }), '30s hold each side');
});

test('reps mode shows the cap countdown as m:ss and no current exercise', () => {
  const reps = { ...DEFAULT_SETTINGS, mode: 'reps', capMin: 20, exercisesPerRound: 8 };
  const tl = [
    { kind: 'prepare', duration: 10, round: 1, slot: 0, exercise: A },
    { kind: 'amrap', duration: 1200, round: 1, slot: 0, exercise: A },
  ];
  const prep = describePosition(tl, { index: 0, phase: tl[0], remainingSec: 10, phaseElapsedSec: 0, done: false }, reps);
  assert.deepEqual(prep, {
    kind: 'prepare', label: 'Get ready', name: '', cue: '', time: '10', next: '',
    progress: '20 min cap · 8 exercises', fraction: 0,
  });
  const mid = describePosition(tl, { index: 1, phase: tl[1], remainingSec: 754, phaseElapsedSec: 446, done: false }, reps);
  assert.equal(mid.kind, 'amrap');
  assert.equal(mid.label, 'As many rounds as you can');
  assert.equal(mid.time, '12:34');
  assert.equal(mid.fraction, 446 / 1200);
});

test('ring notice', () => {
  assert.equal(ringNotice({ ...DEFAULT_SETTINGS, rings: 'off' }), '');
  assert.equal(ringNotice({ ...DEFAULT_SETTINGS, rings: 'low' }), 'Set rings to: Low (knee height)');
  assert.equal(ringNotice({ ...DEFAULT_SETTINGS, rings: 'waist' }), 'Set rings to: Waist height');
});
