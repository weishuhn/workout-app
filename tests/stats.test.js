import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workoutsThisWeek, currentStreak } from '../js/stats.js';

// Local-time helpers so tests pass in any time zone. October 2026: the 12th is a Monday, the 15th a Thursday.
const at = (day, hour = 12, minute = 0) => new Date(2026, 9, day, hour, minute);
const entry = (day, hour = 12, minute = 0) => ({ startedAt: at(day, hour, minute).toISOString() });

test('counts workouts from Monday 00:00 of the current week', () => {
  const log = [entry(11, 23, 30), entry(12, 0, 30), entry(15, 8), entry(15, 18)];
  assert.equal(workoutsThisWeek(log, at(15)), 3);
});

test('Sunday still belongs to the week that started on Monday', () => {
  assert.equal(workoutsThisWeek([entry(12), entry(18, 20)], at(18, 21)), 2);
});

test('Monday at midnight starts a new week', () => {
  assert.equal(workoutsThisWeek([entry(18, 20), entry(19, 0)], at(19, 0)), 1);
});

test('empty log', () => {
  assert.equal(workoutsThisWeek([], at(15)), 0);
  assert.equal(currentStreak([], at(15)), 0);
});

test('streak counts consecutive days ending today', () => {
  assert.equal(currentStreak([entry(13), entry(14), entry(15, 7), entry(15, 19)], at(15, 20)), 3);
});

test('streak still counts when the last workout was yesterday', () => {
  assert.equal(currentStreak([entry(13), entry(14)], at(15, 20)), 2);
});

test('streak is zero when the last workout was two days ago', () => {
  assert.equal(currentStreak([entry(12), entry(13)], at(15, 20)), 0);
});

test('streak stops at the first gap', () => {
  assert.equal(currentStreak([entry(10), entry(12), entry(14), entry(15)], at(15, 20)), 2);
});

test('streak crosses month boundaries', () => {
  const log = [{ startedAt: new Date(2026, 8, 30, 12).toISOString() }, { startedAt: new Date(2026, 9, 1, 12).toISOString() }];
  assert.equal(currentStreak(log, new Date(2026, 9, 1, 20)), 2);
});
