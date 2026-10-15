import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PREPARE_SEC, rotationFor, isEligible, generateCircuit, buildTimeline, totalDuration,
} from '../js/generator.js';
import { DEFAULT_SETTINGS, perRoundOptions } from '../js/settings.js';
import { EXERCISES, RING_HEIGHTS } from '../js/exercises.js';
import { seededRng, ex } from './helpers.js';

const settingsWith = (overrides = {}) => ({ ...DEFAULT_SETTINGS, ...overrides });

// Every combination of equipment and cardio a user can pick, with every per-round size.
function allSettingCombos() {
  const combos = [];
  for (const cardio of [false, true]) {
    for (const exercisesPerRound of perRoundOptions(cardio)) {
      for (const bar of [false, true]) {
        for (const chair of [false, true]) {
          for (const rings of ['off', ...RING_HEIGHTS]) {
            combos.push(settingsWith({ cardio, exercisesPerRound, bar, chair, rings }));
          }
        }
      }
    }
  }
  return combos;
}

test('rotation order matches the spec', () => {
  assert.deepEqual(rotationFor(false), ['push', 'legs', 'pull', 'core']);
  assert.deepEqual(rotationFor(true), ['push', 'legs', 'pull', 'cardio', 'core']);
});

test('isEligible honours equipment toggles and ring height', () => {
  const s = settingsWith({ bar: false, chair: true, rings: 'low' });
  assert.equal(isEligible(ex('a', 'push'), s), true);
  assert.equal(isEligible(ex('b', 'pull', 'bar'), s), false);
  assert.equal(isEligible(ex('c', 'pull', 'chair'), s), true);
  assert.equal(isEligible(ex('d', 'pull', 'rings', { ringHeight: 'low' }), s), true);
  assert.equal(isEligible(ex('e', 'pull', 'rings', { ringHeight: 'waist' }), s), false);
  assert.equal(isEligible(ex('f', 'pull', 'rings', { ringHeight: 'low' }), settingsWith({ rings: 'off' })), false);
});

test('circuit follows the rotation for every size, with and without cardio', () => {
  for (const cardio of [false, true]) {
    for (const exercisesPerRound of perRoundOptions(cardio)) {
      const circuit = generateCircuit(settingsWith({ cardio, exercisesPerRound }), EXERCISES, seededRng(1));
      const rotation = rotationFor(cardio);
      assert.equal(circuit.length, exercisesPerRound);
      circuit.forEach((e, i) => assert.equal(e.group, rotation[i % rotation.length]));
    }
  }
});

test('no group appears back-to-back, including across the round wrap', () => {
  for (const settings of allSettingCombos()) {
    for (let seed = 1; seed <= 5; seed++) {
      const circuit = generateCircuit(settings, EXERCISES, seededRng(seed));
      for (let i = 0; i < circuit.length; i++) {
        const next = circuit[(i + 1) % circuit.length];
        assert.notEqual(circuit[i].group, next.group, `slot ${i} in ${JSON.stringify(settings)}`);
      }
    }
  }
});

test('only eligible exercises are chosen for every equipment setup', () => {
  for (const settings of allSettingCombos()) {
    const circuit = generateCircuit(settings, EXERCISES, seededRng(7));
    for (const e of circuit) assert.ok(isEligible(e, settings), `${e.id} not eligible`);
  }
});

test('no exercise repeats within a round with the real library, for every setup', () => {
  for (const settings of allSettingCombos()) {
    for (let seed = 1; seed <= 5; seed++) {
      const ids = generateCircuit(settings, EXERCISES, seededRng(seed)).map((e) => e.id);
      assert.equal(new Set(ids).size, ids.length, JSON.stringify(settings));
    }
  }
});

test('most restrictive setup (no bar, no chair, waist rings, cardio, 15) still builds a full circuit', () => {
  const settings = settingsWith({ bar: false, chair: false, rings: 'waist', cardio: true, exercisesPerRound: 15 });
  const circuit = generateCircuit(settings, EXERCISES, seededRng(3));
  assert.equal(circuit.length, 15);
  assert.equal(new Set(circuit.map((e) => e.id)).size, 15);
});

test('falls back to least-used exercises when a pool is too small', () => {
  const tiny = [
    ex('p1', 'push'), ex('p2', 'push'),
    ex('l1', 'legs'), ex('l2', 'legs'), ex('l3', 'legs'),
    ex('u1', 'pull'), ex('u2', 'pull'), ex('u3', 'pull'),
    ex('c1', 'core'), ex('c2', 'core'), ex('c3', 'core'),
  ];
  const circuit = generateCircuit(settingsWith({ exercisesPerRound: 12 }), tiny, seededRng(9));
  const pushCounts = ['p1', 'p2'].map((id) => circuit.filter((e) => e.id === id).length).sort();
  assert.deepEqual(pushCounts, [1, 2]);
});

test('same seed gives the same circuit; different seeds give variety', () => {
  const settings = settingsWith();
  const a = generateCircuit(settings, EXERCISES, seededRng(42)).map((e) => e.id);
  const b = generateCircuit(settings, EXERCISES, seededRng(42)).map((e) => e.id);
  assert.deepEqual(a, b);
  const distinct = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    distinct.add(generateCircuit(settings, EXERCISES, seededRng(seed)).map((e) => e.id).join(','));
  }
  assert.ok(distinct.size > 1);
});

test('throws when a rotation group has no eligible exercises', () => {
  const noCardio = EXERCISES.filter((e) => e.group !== 'cardio');
  assert.throws(
    () => generateCircuit(settingsWith({ cardio: true, exercisesPerRound: 5 }), noCardio, seededRng(1)),
    /cardio/,
  );
});

const fourCircuit = [ex('a', 'push'), ex('b', 'legs'), ex('c', 'pull'), ex('d', 'core')];

test('timeline with defaults-style settings: prepare, changeovers, round breaks', () => {
  const settings = settingsWith({ exercisesPerRound: 4, rounds: 2, workSec: 40, changeoverSec: 5, roundBreakSec: 60 });
  const timeline = buildTimeline(fourCircuit, settings);
  assert.deepEqual(timeline.map((p) => p.kind), [
    'prepare', 'work', 'changeover', 'work', 'changeover', 'work', 'changeover', 'work',
    'roundBreak', 'work', 'changeover', 'work', 'changeover', 'work', 'changeover', 'work',
  ]);
  assert.equal(timeline[0].duration, PREPARE_SEC);
  assert.equal(timeline[1].duration, 40);
  assert.equal(timeline[2].duration, 5);
  assert.equal(timeline[8].duration, 60);
});

test('non-work phases describe the upcoming exercise', () => {
  const timeline = buildTimeline(fourCircuit, settingsWith({ exercisesPerRound: 4, rounds: 2 }));
  assert.equal(timeline[0].exercise.id, 'a');
  assert.equal(timeline[2].exercise.id, 'b');
  assert.deepEqual([timeline[2].round, timeline[2].slot], [1, 1]);
  assert.deepEqual([timeline[8].kind, timeline[8].round, timeline[8].slot, timeline[8].exercise.id], ['roundBreak', 2, 0, 'a']);
});

test('zero changeover omits changeover phases', () => {
  const timeline = buildTimeline(fourCircuit, settingsWith({ exercisesPerRound: 4, rounds: 2, changeoverSec: 0 }));
  assert.deepEqual(timeline.map((p) => p.kind), [
    'prepare', 'work', 'work', 'work', 'work', 'roundBreak', 'work', 'work', 'work', 'work',
  ]);
});

test('zero round break uses a changeover between rounds', () => {
  const timeline = buildTimeline(fourCircuit, settingsWith({ exercisesPerRound: 4, rounds: 2, roundBreakSec: 0 }));
  assert.equal(timeline[8].kind, 'changeover');
  assert.equal(timeline[8].round, 2);
});

test('zero changeover and zero round break: works run back to back', () => {
  const timeline = buildTimeline(fourCircuit, settingsWith({ exercisesPerRound: 4, rounds: 2, changeoverSec: 0, roundBreakSec: 0 }));
  assert.deepEqual(timeline.map((p) => p.kind), ['prepare', ...Array(8).fill('work')]);
});

test('every phase has a positive duration', () => {
  const timeline = buildTimeline(fourCircuit, settingsWith({ exercisesPerRound: 4, changeoverSec: 0, roundBreakSec: 0 }));
  for (const phase of timeline) assert.ok(phase.duration > 0);
});

test('reps mode: prepare then one time-capped amrap phase', () => {
  const settings = settingsWith({ mode: 'reps', capMin: 20, exercisesPerRound: 4 });
  const timeline = buildTimeline(fourCircuit, settings);
  assert.deepEqual(timeline.map((p) => [p.kind, p.duration, p.round, p.slot, p.exercise.id]), [
    ['prepare', PREPARE_SEC, 1, 0, 'a'],
    ['amrap', 1200, 1, 0, 'a'],
  ]);
  assert.equal(totalDuration(timeline), 1210);
});

test('reps mode ignores the interval settings', () => {
  const a = buildTimeline(fourCircuit, settingsWith({ mode: 'reps', capMin: 5, rounds: 1, changeoverSec: 0 }));
  const b = buildTimeline(fourCircuit, settingsWith({ mode: 'reps', capMin: 5, rounds: 6, changeoverSec: 10 }));
  assert.deepEqual(a, b);
});

test('totalDuration with default settings is 1195 seconds', () => {
  const circuit = generateCircuit(settingsWith(), EXERCISES, seededRng(1));
  assert.equal(totalDuration(buildTimeline(circuit, settingsWith())), 10 + 24 * 40 + 21 * 5 + 2 * 60);
});
