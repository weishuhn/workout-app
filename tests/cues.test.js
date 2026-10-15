import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cueSchedule, cuesBetween, MAX_CUE_GAP_MS, totalMs, startTimer, position, workCompleted } from '../js/timer.js';
import { buildTimeline } from '../js/generator.js';
import { DEFAULT_SETTINGS } from '../js/settings.js';
import { ex } from './helpers.js';

const A = ex('a', 'push', 'none', { name: 'Side plank', sided: true });
const B = ex('b', 'legs', 'none', { name: 'Squats' });
// starts: 0, 10s, 30s, 35s, 55s, 70s; total 90s
const timeline = [
  { kind: 'prepare', duration: 10, round: 1, slot: 0, exercise: A },
  { kind: 'work', duration: 20, round: 1, slot: 0, exercise: A },
  { kind: 'changeover', duration: 5, round: 1, slot: 1, exercise: B },
  { kind: 'work', duration: 20, round: 1, slot: 1, exercise: B },
  { kind: 'roundBreak', duration: 15, round: 2, slot: 0, exercise: A },
  { kind: 'work', duration: 20, round: 2, slot: 0, exercise: A },
];

const types = (cues) => cues.map((c) => c.type);

test('the first tick announces the first exercise', () => {
  assert.deepEqual(cuesBetween(timeline, -1, 0), [{ atMs: 0, type: 'announceNext', text: 'Next: Side plank' }]);
});

test('countdown beeps 3, 2, 1 seconds before a phase ends', () => {
  const cues = cuesBetween(timeline, 6500, 8000).concat(cuesBetween(timeline, 8000, 9500));
  assert.deepEqual(cues.map((c) => [c.type, c.count, c.atMs]), [
    ['countdown', 3, 7000], ['countdown', 2, 8000], ['countdown', 1, 9000],
  ]);
});

test('work after a non-work phase plays go without repeating the name', () => {
  assert.deepEqual(types(cuesBetween(timeline, 9999, 10000)), ['go']);
});

test('sided exercises get a switch-sides cue at the halfway point', () => {
  assert.deepEqual(cuesBetween(timeline, 19999, 20000), [{ atMs: 20000, type: 'switchSides', text: 'Switch sides' }]);
});

test('round break announces the round, rest and next exercise', () => {
  const [cue] = cuesBetween(timeline, 54999, 55000);
  assert.equal(cue.text, 'Round 2 of 2. Rest. Next: Side plank');
});

test('finished fires at the very end', () => {
  const cues = cuesBetween(timeline, 89999, 90000);
  assert.deepEqual(cues.at(-1), { atMs: 90000, type: 'finished', text: 'Workout complete' });
});

test('work right after work announces the exercise name', () => {
  const tl = buildTimeline([A, B], { ...DEFAULT_SETTINGS, exercisesPerRound: 2, rounds: 1, changeoverSec: 0, workSec: 20 });
  // prepare 0-10s, work A 10-30s, work B 30-50s
  assert.deepEqual(types(cuesBetween(tl, 29999, 30000)), ['go', 'announceExercise']);
  assert.equal(cuesBetween(tl, 29999, 30000)[1].text, 'Squats');
});

test('every scheduled cue fires exactly once across many small ticks', () => {
  const fired = [];
  let prev = -1;
  for (let ms = 0; ms <= totalMs(timeline) + 100; ms += 16) {
    fired.push(...cuesBetween(timeline, prev, ms));
    prev = ms;
  }
  assert.deepEqual(fired, cueSchedule(timeline));
});

test('a gap larger than MAX_CUE_GAP_MS yields no cues', () => {
  assert.deepEqual(cuesBetween(timeline, 0, MAX_CUE_GAP_MS + 1), []);
  assert.ok(cuesBetween(timeline, 6999, 6999 + MAX_CUE_GAP_MS).length > 0);
});

test('time not moving forward yields no cues', () => {
  assert.deepEqual(cuesBetween(timeline, 7000, 7000), []);
  assert.deepEqual(cuesBetween(timeline, 8000, 7000), []);
});

test('returning after the workout ended: no stale cues, done, all work counted', () => {
  const state = startTimer(timeline, 0);
  const returnAt = 30 * 60 * 1000; // 30 minutes later
  assert.deepEqual(cuesBetween(timeline, 12000, returnAt), []);
  assert.equal(position(state, returnAt).done, true);
  assert.equal(workCompleted(state, returnAt), 3);
});

test('reps mode: prepare explains the format, then go, time callouts and finish', () => {
  const tl = buildTimeline([A, B], { ...DEFAULT_SETTINGS, mode: 'reps', capMin: 20, exercisesPerRound: 2 });
  // prepare 0-10s, amrap 10s-1210s
  const spoken = cueSchedule(tl).filter((c) => c.type !== 'countdown');
  assert.deepEqual(spoken.map((c) => [c.atMs, c.type, c.text]), [
    [0, 'announceNext', 'Get ready. 20 minutes, as many rounds as you can.'],
    [10000, 'go', undefined],
    [310000, 'timeLeft', '15 minutes left'],
    [610000, 'timeLeft', '10 minutes left'],
    [910000, 'timeLeft', '5 minutes left'],
    [1150000, 'timeLeft', '1 minute left'],
    [1180000, 'timeLeft', '30 seconds left'],
    [1210000, 'finished', 'Workout complete'],
  ]);
  const countdowns = cueSchedule(tl).filter((c) => c.type === 'countdown').map((c) => c.atMs);
  assert.deepEqual(countdowns, [7000, 8000, 9000, 1207000, 1208000, 1209000]);
});

test('reps mode with a 5-minute cap only calls out the last minute and 30 seconds', () => {
  const tl = buildTimeline([A, B], { ...DEFAULT_SETTINGS, mode: 'reps', capMin: 5, exercisesPerRound: 2 });
  const texts = cueSchedule(tl).filter((c) => c.type === 'timeLeft').map((c) => c.text);
  assert.deepEqual(texts, ['1 minute left', '30 seconds left']);
});

test('short changeovers never beep before the phase starts', () => {
  const tl = buildTimeline([A, B], { ...DEFAULT_SETTINGS, exercisesPerRound: 2, rounds: 1, changeoverSec: 2, workSec: 20 });
  // prepare 0-10s, work A 10-30s, changeover 30-32s, work B 32-52s
  const countdownsIn = (from, to) => cueSchedule(tl)
    .filter((c) => c.type === 'countdown' && c.atMs >= from && c.atMs < to)
    .map((c) => [c.count, c.atMs]);
  // Work A keeps its own 3-2-1; the 2s changeover only gets 2 and 1, both inside the changeover.
  assert.deepEqual(countdownsIn(27000, 30000), [[3, 27000], [2, 28000], [1, 29000]]);
  assert.deepEqual(countdownsIn(30000, 32000), [[2, 30000], [1, 31000]]);
});
