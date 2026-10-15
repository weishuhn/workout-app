import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startTimer, isPaused, elapsedMs, pause, resume, phaseStartsMs, totalMs,
  position, skipForward, skipBack, workCompleted,
} from '../js/timer.js';
import { buildTimeline } from '../js/generator.js';
import { DEFAULT_SETTINGS } from '../js/settings.js';
import { ex } from './helpers.js';

const A = ex('a', 'push');
const B = ex('b', 'legs');
// starts: 0, 10s, 30s, 35s; total 55s
const timeline = [
  { kind: 'prepare', duration: 10, round: 1, slot: 0, exercise: A },
  { kind: 'work', duration: 20, round: 1, slot: 0, exercise: A },
  { kind: 'changeover', duration: 5, round: 1, slot: 1, exercise: B },
  { kind: 'work', duration: 20, round: 1, slot: 1, exercise: B },
];
const T0 = 1000; // arbitrary clock origin

test('phase starts and total', () => {
  assert.deepEqual(phaseStartsMs(timeline), [0, 10000, 30000, 35000]);
  assert.equal(totalMs(timeline), 55000);
});

test('elapsed follows the clock while running', () => {
  const state = startTimer(timeline, T0);
  assert.equal(isPaused(state), false);
  assert.equal(elapsedMs(state, T0 + 1234), 1234);
});

test('pause freezes elapsed and resume excludes paused time', () => {
  let state = startTimer(timeline, T0);
  state = pause(state, T0 + 5000);
  assert.equal(isPaused(state), true);
  assert.equal(elapsedMs(state, T0 + 60000), 5000);
  state = resume(state, T0 + 60000);
  assert.equal(elapsedMs(state, T0 + 61000), 6000);
});

test('pause and resume are idempotent', () => {
  const running = startTimer(timeline, T0);
  assert.equal(resume(running, T0 + 10), running);
  const paused = pause(running, T0 + 100);
  assert.equal(pause(paused, T0 + 500), paused);
});

test('position at phase boundaries', () => {
  const state = startTimer(timeline, T0);
  const at = (ms) => position(state, T0 + ms);
  assert.deepEqual([at(0).index, at(0).remainingSec, at(0).done], [0, 10, false]);
  assert.deepEqual([at(9999).index, at(9999).remainingSec], [0, 1]);
  assert.deepEqual([at(10000).index, at(10000).remainingSec], [1, 20]);
  assert.equal(at(12500).phaseElapsedSec, 2.5);
  assert.deepEqual([at(54999).index, at(54999).remainingSec, at(54999).done], [3, 1, false]);
  assert.deepEqual([at(55000).index, at(55000).remainingSec, at(55000).done], [3, 0, true]);
  assert.equal(at(999999).done, true);
});

test('remainingSec is never 0 or negative while a phase is running, even for 1s phases', () => {
  const short = buildTimeline([A, B], { ...DEFAULT_SETTINGS, exercisesPerRound: 2, rounds: 2, changeoverSec: 1, roundBreakSec: 0, workSec: 20 });
  const state = startTimer(short, 0);
  for (let ms = 0; ms < totalMs(short); ms += 50) {
    const pos = position(state, ms);
    assert.equal(pos.done, false);
    assert.ok(pos.remainingSec >= 1 && pos.remainingSec <= pos.phase.duration, `ms=${ms} remaining=${pos.remainingSec}`);
  }
});

test('skipForward jumps to the next phase start', () => {
  const state = skipForward(startTimer(timeline, T0), T0 + 3000);
  assert.equal(elapsedMs(state, T0 + 3000), 10000);
});

test('skipForward on the last phase finishes; skipping again stays finished', () => {
  let state = startTimer(timeline, T0);
  state = skipForward(state, T0 + 40000);
  assert.equal(position(state, T0 + 40000).done, true);
  state = skipForward(state, T0 + 40000);
  assert.equal(elapsedMs(state, T0 + 40000), 55000);
});

test('skipBack restarts the current phase, or goes to the previous one within the grace period', () => {
  const start = startTimer(timeline, T0);
  assert.equal(elapsedMs(skipBack(start, T0 + 15000), T0 + 15000), 10000);
  assert.equal(elapsedMs(skipBack(start, T0 + 11000), T0 + 11000), 0);
});

test('skipBack at the very start stays at zero', () => {
  const state = skipBack(startTimer(timeline, T0), T0 + 500);
  assert.equal(elapsedMs(state, T0 + 500), 0);
});

test('skips keep a paused timer paused', () => {
  const paused = pause(startTimer(timeline, T0), T0 + 3000);
  const skipped = skipForward(paused, T0 + 9000);
  assert.equal(isPaused(skipped), true);
  assert.equal(elapsedMs(skipped, T0 + 20000), 10000);
});

test('workCompleted counts only fully elapsed work phases and ignores paused time', () => {
  let state = startTimer(timeline, T0);
  assert.equal(workCompleted(state, T0 + 29999), 0);
  assert.equal(workCompleted(state, T0 + 30000), 1);
  state = pause(state, T0 + 20000);
  assert.equal(workCompleted(state, T0 + 999999), 0);
  state = resume(state, T0 + 999999);
  assert.equal(workCompleted(state, T0 + 999999 + 35000), 2);
});
