import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES, GROUPS, EQUIPMENT, RING_HEIGHTS, GROUP_LABELS } from '../js/exercises.js';

test('exercise ids are unique', () => {
  const ids = EXERCISES.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every exercise has a valid group, equipment, name, cue and sided flag', () => {
  for (const e of EXERCISES) {
    assert.ok(GROUPS.includes(e.group), `${e.id}: bad group ${e.group}`);
    assert.ok(EQUIPMENT.includes(e.equipment), `${e.id}: bad equipment ${e.equipment}`);
    assert.ok(e.name.length > 0, `${e.id}: missing name`);
    assert.ok(e.cue.length > 0, `${e.id}: missing cue`);
    assert.equal(typeof e.sided, 'boolean', `${e.id}: sided must be boolean`);
  }
});

test('ringHeight is present exactly when equipment is rings', () => {
  for (const e of EXERCISES) {
    if (e.equipment === 'rings') {
      assert.ok(RING_HEIGHTS.includes(e.ringHeight), `${e.id}: bad ringHeight`);
    } else {
      assert.equal('ringHeight' in e, false, `${e.id}: ringHeight on non-ring exercise`);
    }
  }
});

test('every group has at least three no-equipment exercises', () => {
  for (const group of GROUPS) {
    const count = EXERCISES.filter((e) => e.group === group && e.equipment === 'none').length;
    assert.ok(count >= 3, `${group} has only ${count} no-equipment exercises`);
  }
});

test('each ring height offers at least one exercise', () => {
  for (const height of RING_HEIGHTS) {
    assert.ok(EXERCISES.some((e) => e.equipment === 'rings' && e.ringHeight === height), height);
  }
});

test('every group has a label', () => {
  for (const group of GROUPS) assert.ok(GROUP_LABELS[group]);
});

test('every exercise has exactly one positive target: reps or holdSec', () => {
  for (const e of EXERCISES) {
    const hasReps = Number.isInteger(e.reps) && e.reps > 0;
    const hasHold = Number.isInteger(e.holdSec) && e.holdSec > 0;
    assert.ok(hasReps !== hasHold, `${e.id}: needs exactly one of reps / holdSec`);
    assert.equal('reps' in e && 'holdSec' in e, false, `${e.id}: has both reps and holdSec`);
  }
});
