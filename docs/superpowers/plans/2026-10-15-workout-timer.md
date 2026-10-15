# Workout Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first, hands-free, installable workout timer that generates a whole-body bodyweight circuit with rotating muscle groups and runs it either as timed intervals or as a reps-based time-capped (AMRAP) list, with voice/beep cues and an on-device workout log.

**Architecture:** A static site of vanilla ES modules. All behavior that matters — circuit generation, the phase timeline, timer position, cue scheduling, display text, settings validation, storage and stats — lives in pure, unit-tested modules that take their clock, randomness and storage as arguments. Thin browser modules (`app.js`, `workout.js`, `history.js`, `audio.js`) render state and play sounds. A service worker makes it work offline.

**Tech Stack:** HTML, CSS, JavaScript ES modules (no framework, no build step, no runtime dependencies); Node 24 built-in test runner (`node --test`); Web Audio API; Speech Synthesis API; Screen Wake Lock API; Service Worker + Web App Manifest; GitHub Pages hosting.

**Spec:** `docs/superpowers/specs/2026-10-15-workout-timer-design.md`

## Global Constraints

- No runtime dependencies, no build step, no framework. Plain ES modules loaded with `<script type="module">`.
- All URLs/paths are relative (the site is served from a GitHub Pages sub-path).
- Tests: `npm test` runs `node --test tests/*.test.js`; `package.json` has no dependencies. Test-only helpers live in `tests/helpers.js` (not matched by `*.test.js`).
- Storage keys, verbatim: `workout.settings.v1`, `workout.log.v1`. Every `localStorage` access is wrapped in try/catch.
- Default settings, verbatim: `workSec 40, changeoverSec 5, exercisesPerRound 8, rounds 3, roundBreakSec 60, bar true, chair true, rings 'low', cardio false, muted false, mode 'timed', capMin 20`.
- Two modes: `timed` (intervals) and `reps` (10s prepare, then one `amrap` phase of `capMin * 60` seconds showing the full circuit list with targets).
- Hands-free: nothing on screen may require a tap between Start and the end of a workout in either mode; both modes end and log automatically.
- Mobile first: base CSS targets a ~375px portrait phone; wider screens only widen containers (no `max-width` media queries that restyle the phone layout).
- Rotation, verbatim: cardio off `push → legs → pull → core`; cardio on `push → legs → pull → cardio → core`.
- Prepare phase is a fixed 10 seconds before the first exercise.
- Exercises per round: `4/8/12` with cardio off, `5/10/15` with cardio on; toggling cardio maps by position (4↔5, 8↔10, 12↔15).
- Cue gap: if more than 2000 ms elapsed since the previous tick, no cues are played.
- UI: dark theme, works from 320px wide to desktop with no horizontal scroll, touch targets ≥ 56px on primary controls (≥ 44px for secondary links). Workout-screen text must be readable from 2–3 m on a phone.
- Every file under `js/`, `css/` and `icons/` must be listed in `sw.js` `ASSETS` (enforced by a test from Task 12 on).
- Commit after every task with a conventional-commit message.

## Review Focus

1. **Phone locks or tab backgrounds mid-workout, and the user returns after the workout's planned end** — expect no burst of stale beeps/speech, the workout shows as done, and all work phases count as completed. (Test added in Task 5.)
2. **Skip at the edges** — skip back during the first 2s of the workout, skip forward on the last phase, and skip forward again once done must clamp without throwing or going negative. (Tests added in Task 4.)
3. **Very short changeovers (1–2s)** — countdown beeps must never fire during the previous phase and the on-screen countdown must never read `0` or a negative number while a phase is running. (Tests added in Tasks 4 and 5.)
4. **The most restrictive equipment setup** — no bar, no chair, rings at waist height, cardio on, 15 per round — must still generate a full circuit with no repeats and no back-to-back groups. (Test added in Task 3.)
5. **Stale or foreign stored data** — settings saved with string numbers, an `exercisesPerRound` from the other cardio mode, or no `mode` at all (saved before reps mode existed), and log entries missing fields — must load without errors and render without `NaN`. (Tests added in Tasks 2, 6 and 7.)

---

## File Structure

```
package.json            "type": "module" + test script
index.html              all four screens as <section>s
css/styles.css          theme + layout for every screen
js/exercises.js         exercise library data (GROUPS, GROUP_LABELS, EXERCISES) incl. reps/hold targets
js/settings.js          defaults, allowed choices, normalizeSettings, applySetting
js/generator.js         rotationFor, isEligible, generateCircuit, buildTimeline, totalDuration
js/timer.js             timer state functions + cueSchedule/cuesBetween
js/display.js           formatDuration, formatTarget, nextWorkIndex, describePosition, ringNotice
js/storage.js           loadSettings/saveSettings, loadLog/appendLog, buildLogEntry
js/stats.js             workoutsThisWeek, currentStreak
js/audio.js             createAudio: beeps (Web Audio) + speech
js/history.js           renderHistory, renderDone (DOM)
js/workout.js           runWorkout: workout screen loop, controls, wake lock (DOM)
js/app.js               boot, setup screen, navigation, service worker registration (DOM)
manifest.webmanifest
sw.js
scripts/make-icons.mjs  generates icons/*.png
icons/                  icon-192.png, icon-512.png, apple-touch-icon.png
tests/helpers.js        seededRng, ex, memoryStorage, throwingStorage
tests/*.test.js         one file per pure module + sw/manifest checks
README.md
```

Note: the spec's file layout puts settings validation in `storage.js`; this plan splits it into `js/settings.js` (what settings are valid) so `storage.js` only persists. `formatDuration` lives in `js/display.js`.

---

### Task 1: Project scaffold and exercise library

**Files:**
- Create: `package.json`
- Create: `js/exercises.js`
- Test: `tests/exercises.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `GROUPS: string[]`, `EQUIPMENT: string[]`, `RING_HEIGHTS: string[]`, `GROUP_LABELS: Record<group, string>`, `EXERCISES: Exercise[]` where `Exercise = { id, name, group, equipment, sided: boolean, cue, ringHeight?, reps?, holdSec? }` (`ringHeight` present only when `equipment === 'rings'`; exactly one of `reps` / `holdSec`, a positive integer).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "workout-timer",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.js"
  }
}
```

- [ ] **Step 2: Write the failing test** — `tests/exercises.test.js`

```js
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../js/exercises.js'`.

- [ ] **Step 4: Write `js/exercises.js`**

```js
// Exercise library — data only. See docs/superpowers/specs/2026-10-15-workout-timer-design.md.

export const GROUPS = ['push', 'pull', 'legs', 'core', 'cardio'];
export const EQUIPMENT = ['none', 'bar', 'chair', 'rings'];
export const RING_HEIGHTS = ['low', 'waist'];

export const GROUP_LABELS = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  core: 'Core',
  cardio: 'Cardio',
};

// `target` is { reps: n } or { holdSec: n } — the default goal in reps mode.
function exercise(group, equipment, id, name, cue, target, { ringHeight, sided = false } = {}) {
  const record = { id, name, group, equipment, sided, cue, ...target };
  if (ringHeight) record.ringHeight = ringHeight;
  return record;
}

export const EXERCISES = [
  // Push
  exercise('push', 'none', 'push-ups', 'Push-ups', 'Body in one straight line, chest to the floor', { reps: 15 }),
  exercise('push', 'none', 'wide-push-ups', 'Wide push-ups', 'Hands wider than shoulders, lower slowly', { reps: 12 }),
  exercise('push', 'none', 'diamond-push-ups', 'Diamond push-ups', 'Hands together under chest, elbows tight', { reps: 10 }),
  exercise('push', 'none', 'pike-push-ups', 'Pike push-ups', 'Hips high, lower your head toward the floor', { reps: 10 }),
  exercise('push', 'chair', 'decline-push-ups', 'Decline push-ups', 'Feet on the chair, core braced', { reps: 12 }),
  exercise('push', 'chair', 'chair-dips', 'Chair dips', 'Shoulders down, elbows straight back', { reps: 15 }),
  exercise('push', 'rings', 'ring-push-ups', 'Ring push-ups', 'Rings close to your body, turn out at the top', { reps: 10 }, { ringHeight: 'low' }),
  exercise('push', 'rings', 'ring-dips', 'Ring dips', 'Knees bent, lean forward slightly, lock out at the top', { reps: 8 }, { ringHeight: 'waist' }),
  exercise('push', 'rings', 'ring-support-hold', 'Ring support hold', 'Arms locked, shoulders down, rings by your hips', { holdSec: 30 }, { ringHeight: 'waist' }),

  // Pull
  exercise('pull', 'none', 'superman-hold', 'Superman hold', 'Lift chest and legs, squeeze your glutes', { holdSec: 30 }),
  exercise('pull', 'none', 'reverse-snow-angels', 'Reverse snow angels', 'Face down, sweep arms from hips to overhead', { reps: 12 }),
  exercise('pull', 'none', 'prone-ytw-raises', 'Prone Y-T-W raises', 'Face down, thumbs up, squeeze shoulder blades', { reps: 8 }),
  exercise('pull', 'bar', 'pull-ups', 'Pull-ups', 'From a full hang to chin over the bar', { reps: 6 }),
  exercise('pull', 'bar', 'chin-ups', 'Chin-ups', 'Palms facing you, chest to the bar', { reps: 6 }),
  exercise('pull', 'bar', 'scapular-pull-ups', 'Scapular pull-ups', 'Straight arms, pull shoulders down and back', { reps: 10 }),
  exercise('pull', 'chair', 'table-rows', 'Table rows', 'Under the table, body straight, chest to the edge', { reps: 12 }),
  exercise('pull', 'rings', 'steep-ring-rows', 'Steep ring rows', 'Walk feet forward, body straight, rings to ribs', { reps: 10 }, { ringHeight: 'low' }),
  exercise('pull', 'rings', 'ring-rows', 'Ring rows', 'Body straight, pull the rings to your ribs', { reps: 12 }, { ringHeight: 'waist' }),
  exercise('pull', 'rings', 'ring-face-pulls', 'Ring face pulls', 'Pull rings to your forehead, elbows high', { reps: 12 }, { ringHeight: 'waist' }),
  exercise('pull', 'rings', 'ring-y-raises', 'Ring Y-raises', 'Straight arms, raise into a Y overhead', { reps: 10 }, { ringHeight: 'waist' }),

  // Legs
  exercise('legs', 'none', 'squats', 'Squats', 'Chest up, hips below knees', { reps: 20 }),
  exercise('legs', 'none', 'jump-squats', 'Jump squats', 'Squat deep, explode up, land softly', { reps: 12 }),
  exercise('legs', 'none', 'reverse-lunges', 'Reverse lunges', 'Alternate legs, back knee just off the floor', { reps: 16 }),
  exercise('legs', 'none', 'glute-bridges', 'Glute bridges', 'Drive through heels, squeeze at the top', { reps: 20 }),
  exercise('legs', 'none', 'single-leg-glute-bridge', 'Single-leg glute bridge', 'Hips level, drive through one heel', { reps: 10 }, { sided: true }),
  exercise('legs', 'none', 'wall-sit', 'Wall sit', 'Thighs parallel to the floor, back flat on the wall', { holdSec: 45 }),
  exercise('legs', 'chair', 'bulgarian-split-squats', 'Bulgarian split squats', 'Back foot on the chair, front knee over toes', { reps: 10 }, { sided: true }),
  exercise('legs', 'chair', 'step-ups', 'Step-ups', 'Drive through the top foot, stand tall', { reps: 12 }, { sided: true }),
  exercise('legs', 'rings', 'ring-bulgarian-split-squat', 'Ring Bulgarian split squat', 'Back foot in a ring, sink straight down', { reps: 10 }, { ringHeight: 'low', sided: true }),
  exercise('legs', 'rings', 'ring-hamstring-curls', 'Ring hamstring curls', 'Heels in the rings, hips up, curl heels in', { reps: 10 }, { ringHeight: 'low' }),

  // Core
  exercise('core', 'none', 'plank', 'Plank', 'Elbows under shoulders, squeeze glutes', { holdSec: 45 }),
  exercise('core', 'none', 'hollow-hold', 'Hollow hold', 'Lower back pressed down, arms and legs long', { holdSec: 30 }),
  exercise('core', 'none', 'mountain-climbers', 'Mountain climbers', 'Hips low, drive knees fast', { reps: 30 }),
  exercise('core', 'none', 'bicycle-crunches', 'Bicycle crunches', 'Elbow to opposite knee, slow and controlled', { reps: 20 }),
  exercise('core', 'none', 'side-plank', 'Side plank', 'Hips high, body in one line', { holdSec: 30 }, { sided: true }),
  exercise('core', 'bar', 'hanging-knee-raises', 'Hanging knee raises', 'No swinging, knees to chest', { reps: 10 }),
  exercise('core', 'rings', 'ring-fallouts', 'Ring fallouts', 'From your knees, roll out with a tight core', { reps: 10 }, { ringHeight: 'low' }),
  exercise('core', 'rings', 'ring-knee-tucks', 'Ring knee tucks', 'Feet in the rings, plank, pull knees to chest', { reps: 12 }, { ringHeight: 'low' }),

  // Cardio
  exercise('cardio', 'none', 'burpees', 'Burpees', 'Chest to the floor, jump at the top', { reps: 10 }),
  exercise('cardio', 'none', 'jumping-jacks', 'Jumping jacks', 'Stay light on the balls of your feet', { reps: 40 }),
  exercise('cardio', 'none', 'high-knees', 'High knees', 'Knees to hip height, pump your arms', { reps: 40 }),
  exercise('cardio', 'none', 'skaters', 'Skaters', 'Leap side to side, land soft on one foot', { reps: 20 }),
  exercise('cardio', 'none', 'squat-thrusts', 'Squat thrusts', 'Hands down, kick back to plank, jump in', { reps: 15 }),
  exercise('cardio', 'none', 'seal-jacks', 'Seal jacks', 'Clap arms wide in front, jump feet out', { reps: 30 }),
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 7 tests passing.

- [ ] **Step 6: Commit**

```bash
git add package.json js/exercises.js tests/exercises.test.js
git commit -m "feat: add exercise library and test setup"
```

---

### Task 2: Settings model

**Files:**
- Create: `js/settings.js`
- Test: `tests/settings.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `DEFAULT_SETTINGS` (frozen object, values in Global Constraints)
  - `SETTING_CHOICES = { workSec: number[], changeoverSec: number[], rounds: number[], roundBreakSec: number[], capMin: number[], rings: ['off','low','waist'], mode: ['timed','reps'] }`
  - `perRoundOptions(cardio: boolean): number[]`
  - `mapPerRound(value: number, toCardio: boolean): number`
  - `normalizeSettings(raw: unknown): Settings` — always returns a complete, valid settings object.
  - `applySetting(settings: Settings, key: string, value): Settings` — returns new normalized settings; toggling `cardio` remaps `exercisesPerRound`.

- [ ] **Step 1: Write the failing test** — `tests/settings.test.js`

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../js/settings.js'`.

- [ ] **Step 3: Write `js/settings.js`**

```js
// What settings exist, which values are allowed, and how to repair stored settings.

export const DEFAULT_SETTINGS = Object.freeze({
  workSec: 40,
  changeoverSec: 5,
  exercisesPerRound: 8,
  rounds: 3,
  roundBreakSec: 60,
  bar: true,
  chair: true,
  rings: 'low',
  cardio: false,
  muted: false,
  mode: 'timed',
  capMin: 20,
});

function range(min, max, step) {
  const values = [];
  for (let v = min; v <= max; v += step) values.push(v);
  return values;
}

export const SETTING_CHOICES = Object.freeze({
  workSec: range(20, 60, 5),
  changeoverSec: range(0, 10, 1),
  rounds: range(1, 6, 1),
  roundBreakSec: range(0, 120, 15),
  capMin: range(5, 40, 5),
  rings: ['off', 'low', 'waist'],
  mode: ['timed', 'reps'],
});

export function perRoundOptions(cardio) {
  return cardio ? [5, 10, 15] : [4, 8, 12];
}

// Map an exercisesPerRound value from the other cardio mode into the `toCardio` mode.
export function mapPerRound(value, toCardio) {
  const index = perRoundOptions(!toCardio).indexOf(value);
  return perRoundOptions(toCardio)[index === -1 ? 1 : index];
}

const pick = (value, choices, fallback) => (choices.includes(value) ? value : fallback);
const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

export function normalizeSettings(raw) {
  const r = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const d = DEFAULT_SETTINGS;
  const cardio = bool(r.cardio, d.cardio);
  const perRound = perRoundOptions(cardio);
  return {
    workSec: pick(r.workSec, SETTING_CHOICES.workSec, d.workSec),
    changeoverSec: pick(r.changeoverSec, SETTING_CHOICES.changeoverSec, d.changeoverSec),
    exercisesPerRound: pick(r.exercisesPerRound, perRound, perRound[1]),
    rounds: pick(r.rounds, SETTING_CHOICES.rounds, d.rounds),
    roundBreakSec: pick(r.roundBreakSec, SETTING_CHOICES.roundBreakSec, d.roundBreakSec),
    bar: bool(r.bar, d.bar),
    chair: bool(r.chair, d.chair),
    rings: pick(r.rings, SETTING_CHOICES.rings, d.rings),
    cardio,
    muted: bool(r.muted, d.muted),
    mode: pick(r.mode, SETTING_CHOICES.mode, d.mode),
    capMin: pick(r.capMin, SETTING_CHOICES.capMin, d.capMin),
  };
}

export function applySetting(settings, key, value) {
  if (key === 'cardio' && value !== settings.cardio) {
    return normalizeSettings({
      ...settings,
      cardio: value,
      exercisesPerRound: mapPerRound(settings.exercisesPerRound, value),
    });
  }
  return normalizeSettings({ ...settings, [key]: value });
}
```

Note: `normalizeSettings({ workSec: '40' })` falls back to the default 40 because `'40'` is not in the choices — the test asserts the result is the number 40.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all settings and exercises tests passing.

- [ ] **Step 5: Commit**

```bash
git add js/settings.js tests/settings.test.js
git commit -m "feat: add settings model with validation and cardio remapping"
```

---

### Task 3: Circuit generator and timeline

**Files:**
- Create: `js/generator.js`
- Create: `tests/helpers.js`
- Test: `tests/generator.test.js`

**Interfaces:**
- Consumes: `DEFAULT_SETTINGS`, `perRoundOptions` from `js/settings.js`; `EXERCISES`, `RING_HEIGHTS` from `js/exercises.js`.
- Produces:
  - `PREPARE_SEC = 10`
  - `rotationFor(cardio: boolean): string[]`
  - `isEligible(exercise, settings): boolean`
  - `generateCircuit(settings, library, rng = Math.random): Exercise[]` — throws `Error` if a group in the rotation has no eligible exercise.
  - `buildTimeline(circuit, settings): Phase[]` where `Phase = { kind: 'prepare'|'work'|'changeover'|'roundBreak'|'amrap', duration: number (sec, > 0), round: number (1-based), slot: number (0-based), exercise: Exercise }`. For non-work phases, `round/slot/exercise` describe the upcoming work phase. In reps mode (`settings.mode === 'reps'`) the timeline is exactly `[prepare 10s, amrap capMin*60s]`, both with `round 1, slot 0, exercise circuit[0]`.
  - `totalDuration(timeline): number` (seconds)
  - `tests/helpers.js`: `seededRng(seed): () => number`, `ex(id, group, equipment = 'none', extra = {}): Exercise`.

- [ ] **Step 1: Write `tests/helpers.js`**

```js
// Test-only helpers. Not a test file (does not match *.test.js).

// mulberry32: small deterministic PRNG returning numbers in [0, 1).
export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Minimal exercise record for hand-built libraries.
export function ex(id, group, equipment = 'none', extra = {}) {
  return { id, name: id, group, equipment, sided: false, cue: `${id} cue`, reps: 10, ...extra };
}
```

- [ ] **Step 2: Write the failing test** — `tests/generator.test.js`

```js
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../js/generator.js'`.

- [ ] **Step 4: Write `js/generator.js`**

```js
// Builds the circuit (which exercises, in what order) and the timeline (every timed phase).

export const PREPARE_SEC = 10;

const ROTATION = ['push', 'legs', 'pull', 'core'];
const CARDIO_ROTATION = ['push', 'legs', 'pull', 'cardio', 'core'];

export function rotationFor(cardio) {
  return [...(cardio ? CARDIO_ROTATION : ROTATION)];
}

export function isEligible(exercise, settings) {
  switch (exercise.equipment) {
    case 'none':
      return true;
    case 'bar':
      return settings.bar;
    case 'chair':
      return settings.chair;
    case 'rings':
      return settings.rings !== 'off' && exercise.ringHeight === settings.rings;
    default:
      return false;
  }
}

// One round of exercises. The same circuit repeats every round.
// Picks randomly among the least-used eligible exercises, so nothing repeats until a pool runs out.
export function generateCircuit(settings, library, rng = Math.random) {
  const rotation = rotationFor(settings.cardio);
  const uses = new Map();
  const circuit = [];
  for (let slot = 0; slot < settings.exercisesPerRound; slot++) {
    const group = rotation[slot % rotation.length];
    const pool = library.filter((e) => e.group === group && isEligible(e, settings));
    if (pool.length === 0) throw new Error(`No eligible exercises for group "${group}"`);
    const fewestUses = Math.min(...pool.map((e) => uses.get(e.id) ?? 0));
    const candidates = pool.filter((e) => (uses.get(e.id) ?? 0) === fewestUses);
    const choice = candidates[Math.floor(rng() * candidates.length)];
    uses.set(choice.id, fewestUses + 1);
    circuit.push(choice);
  }
  return circuit;
}

export function buildTimeline(circuit, settings) {
  if (settings.mode === 'reps') {
    return [
      { kind: 'prepare', duration: PREPARE_SEC, round: 1, slot: 0, exercise: circuit[0] },
      { kind: 'amrap', duration: settings.capMin * 60, round: 1, slot: 0, exercise: circuit[0] },
    ];
  }
  const phases = [];
  const add = (kind, duration, round, slot) => {
    if (duration > 0) phases.push({ kind, duration, round, slot, exercise: circuit[slot] });
  };
  for (let round = 1; round <= settings.rounds; round++) {
    for (let slot = 0; slot < circuit.length; slot++) {
      if (round === 1 && slot === 0) add('prepare', PREPARE_SEC, round, slot);
      else if (slot === 0 && settings.roundBreakSec > 0) add('roundBreak', settings.roundBreakSec, round, slot);
      else add('changeover', settings.changeoverSec, round, slot);
      add('work', settings.workSec, round, slot);
    }
  }
  return phases;
}

export function totalDuration(timeline) {
  return timeline.reduce((sum, phase) => sum + phase.duration, 0);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all generator tests passing.

- [ ] **Step 6: Commit**

```bash
git add js/generator.js tests/helpers.js tests/generator.test.js
git commit -m "feat: add circuit generator and phase timeline"
```

---

### Task 4: Timer state

**Files:**
- Create: `js/timer.js`
- Test: `tests/timer.test.js`

**Interfaces:**
- Consumes: `Phase[]` timelines (shape from Task 3). Tests also use `buildTimeline` from `js/generator.js`.
- Produces (all pure; `now` is a millisecond timestamp, e.g. `performance.now()`):
  - `TimerState = { timeline, elapsedBeforeMs: number, anchorMs: number | null }` (`anchorMs === null` ⇒ paused)
  - `startTimer(timeline, now): TimerState`
  - `isPaused(state): boolean`
  - `elapsedMs(state, now): number`
  - `pause(state, now): TimerState`, `resume(state, now): TimerState`
  - `phaseStartsMs(timeline): number[]`, `totalMs(timeline): number`
  - `position(state, now): { index, phase, remainingSec, phaseElapsedSec, done }`
  - `SKIP_BACK_GRACE_MS = 2000`
  - `skipForward(state, now): TimerState`, `skipBack(state, now): TimerState`
  - `workCompleted(state, now): number`

- [ ] **Step 1: Write the failing test** — `tests/timer.test.js`

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../js/timer.js'`.

- [ ] **Step 3: Write `js/timer.js`**

```js
// Timer state derived from timestamps (never from counting ticks), so it cannot drift and
// catches up correctly after the page was throttled or backgrounded.

const MS = 1000;

export function startTimer(timeline, now) {
  return { timeline, elapsedBeforeMs: 0, anchorMs: now };
}

export function isPaused(state) {
  return state.anchorMs === null;
}

export function elapsedMs(state, now) {
  return state.elapsedBeforeMs + (isPaused(state) ? 0 : now - state.anchorMs);
}

export function pause(state, now) {
  if (isPaused(state)) return state;
  return { ...state, elapsedBeforeMs: elapsedMs(state, now), anchorMs: null };
}

export function resume(state, now) {
  if (!isPaused(state)) return state;
  return { ...state, anchorMs: now };
}

export function phaseStartsMs(timeline) {
  const starts = [];
  let t = 0;
  for (const phase of timeline) {
    starts.push(t);
    t += phase.duration * MS;
  }
  return starts;
}

export function totalMs(timeline) {
  return timeline.reduce((sum, phase) => sum + phase.duration * MS, 0);
}

// Index of the phase containing `ms` (assumes 0 <= ms < total).
function indexAt(starts, ms) {
  let index = 0;
  for (let i = 0; i < starts.length; i++) if (starts[i] <= ms) index = i;
  return index;
}

export function position(state, now) {
  const { timeline } = state;
  const total = totalMs(timeline);
  const ms = Math.max(0, elapsedMs(state, now));
  if (ms >= total) {
    const index = timeline.length - 1;
    const phase = timeline[index];
    return { index, phase, remainingSec: 0, phaseElapsedSec: phase.duration, done: true };
  }
  const starts = phaseStartsMs(timeline);
  const index = indexAt(starts, ms);
  const phase = timeline[index];
  const phaseElapsedMs = ms - starts[index];
  return {
    index,
    phase,
    remainingSec: Math.ceil((phase.duration * MS - phaseElapsedMs) / MS),
    phaseElapsedSec: phaseElapsedMs / MS,
    done: false,
  };
}

function withElapsed(state, ms, now) {
  return { ...state, elapsedBeforeMs: ms, anchorMs: isPaused(state) ? null : now };
}

export function skipForward(state, now) {
  const { timeline } = state;
  const total = totalMs(timeline);
  const ms = Math.max(0, elapsedMs(state, now));
  if (ms >= total) return withElapsed(state, total, now);
  const starts = phaseStartsMs(timeline);
  const next = indexAt(starts, ms) + 1;
  return withElapsed(state, next < timeline.length ? starts[next] : total, now);
}

export const SKIP_BACK_GRACE_MS = 2000;

export function skipBack(state, now) {
  const { timeline } = state;
  const total = totalMs(timeline);
  const starts = phaseStartsMs(timeline);
  const ms = Math.min(Math.max(0, elapsedMs(state, now)), total);
  const index = ms >= total ? timeline.length - 1 : indexAt(starts, ms);
  const withinGrace = ms - starts[index] < SKIP_BACK_GRACE_MS;
  const target = withinGrace && index > 0 ? starts[index - 1] : starts[index];
  return withElapsed(state, target, now);
}

export function workCompleted(state, now) {
  const ms = elapsedMs(state, now);
  const starts = phaseStartsMs(state.timeline);
  return state.timeline.filter((p, i) => p.kind === 'work' && starts[i] + p.duration * MS <= ms).length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/timer.js tests/timer.test.js
git commit -m "feat: add timestamp-based timer state with pause and skip"
```

---

### Task 5: Cue scheduling

**Files:**
- Modify: `js/timer.js` (append cue functions)
- Test: `tests/cues.test.js`

**Interfaces:**
- Consumes: `phaseStartsMs`, `totalMs` (same file); `Phase` shape from Task 3.
- Produces:
  - `MAX_CUE_GAP_MS = 2000`
  - `Cue = { atMs: number, type: 'countdown'|'go'|'announceNext'|'announceExercise'|'switchSides'|'timeLeft'|'finished', count?: 3|2|1, text?: string }` — `text` is present on every cue that should be spoken (`announceNext`, `announceExercise`, `switchSides`, `timeLeft`, `finished`) and absent otherwise. `timeLeft` cues only occur in `amrap` phases (reps mode).
  - `cueSchedule(timeline): Cue[]` (sorted by `atMs`, stable)
  - `cuesBetween(timeline, prevMs, currentMs): Cue[]` — cues with `prevMs < atMs <= currentMs`; `[]` if `currentMs <= prevMs` or the gap exceeds `MAX_CUE_GAP_MS`. Callers start with `prevMs = -1`, and after a skip set `prevMs = newElapsed - 1`.

- [ ] **Step 1: Write the failing test** — `tests/cues.test.js`

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `cueSchedule` is not exported from `js/timer.js`.

- [ ] **Step 3: Append to `js/timer.js`**

```js
// ---- Cues -----------------------------------------------------------------

export const MAX_CUE_GAP_MS = 2000;

// Remaining-time marks (seconds) called out in an amrap phase:
// every 5 minutes below the cap, then 1 minute and 30 seconds.
function timeLeftMarks(durationSec) {
  const marks = [];
  for (let sec = Math.floor((durationSec - 1) / 300) * 300; sec >= 300; sec -= 300) marks.push(sec);
  marks.push(60, 30);
  return marks.filter((sec) => sec < durationSec);
}

function timeLeftText(sec) {
  if (sec === 60) return '1 minute left';
  return sec > 60 ? `${sec / 60} minutes left` : `${sec} seconds left`;
}

export function cueSchedule(timeline) {
  const starts = phaseStartsMs(timeline);
  const rounds = Math.max(...timeline.map((p) => p.round));
  const cues = [];
  timeline.forEach((phase, i) => {
    const start = starts[i];
    const end = start + phase.duration * MS;
    const { name } = phase.exercise;
    if (phase.kind === 'work') {
      cues.push({ atMs: start, type: 'go' });
      const previous = timeline[i - 1];
      if (!previous || previous.kind === 'work') cues.push({ atMs: start, type: 'announceExercise', text: name });
      if (phase.exercise.sided) cues.push({ atMs: start + (phase.duration * MS) / 2, type: 'switchSides', text: 'Switch sides' });
    } else if (phase.kind === 'amrap') {
      cues.push({ atMs: start, type: 'go' });
      for (const sec of timeLeftMarks(phase.duration)) {
        cues.push({ atMs: end - sec * MS, type: 'timeLeft', text: timeLeftText(sec) });
      }
    } else if (phase.kind === 'roundBreak') {
      cues.push({ atMs: start, type: 'announceNext', text: `Round ${phase.round} of ${rounds}. Rest. Next: ${name}` });
    } else {
      const next = timeline[i + 1];
      const text = next?.kind === 'amrap'
        ? `Get ready. ${next.duration / 60} minutes, as many rounds as you can.`
        : `Next: ${name}`;
      cues.push({ atMs: start, type: 'announceNext', text });
    }
    for (const count of [3, 2, 1]) {
      const atMs = end - count * MS;
      if (atMs >= start) cues.push({ atMs, type: 'countdown', count });
    }
  });
  cues.push({ atMs: totalMs(timeline), type: 'finished', text: 'Workout complete' });
  return cues.sort((a, b) => a.atMs - b.atMs);
}

// Cues due in (prevMs, currentMs]. Large jumps (backgrounded tab) play nothing.
export function cuesBetween(timeline, prevMs, currentMs) {
  if (currentMs <= prevMs || currentMs - prevMs > MAX_CUE_GAP_MS) return [];
  return cueSchedule(timeline).filter((cue) => cue.atMs > prevMs && cue.atMs <= currentMs);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/timer.js tests/cues.test.js
git commit -m "feat: add cue schedule for beeps and announcements"
```

---

### Task 6: Display model

**Files:**
- Create: `js/display.js`
- Test: `tests/display.test.js`

**Interfaces:**
- Consumes: `GROUP_LABELS` from `js/exercises.js`; `position()` result shape from Task 4; `Settings` from Task 2.
- Produces:
  - `formatDuration(totalSec: unknown): string` — `m:ss`; non-finite or negative input renders `0:00`.
  - `formatTarget(exercise): string` — `'15 reps'`, `'30s hold'`, with `' each side'` appended when `sided`.
  - `nextWorkIndex(timeline, index): number` — index of the work phase after the one currently shown, or `-1`.
  - `describePosition(timeline, pos, settings): { kind, label, name, cue, time, next, progress, fraction }` — all strings except `fraction` (0–1). In reps mode `name`, `cue`, `next` are `''` and the amrap `time` is `m:ss`.
  - `ringNotice(settings): string` — `''` when rings are off.

- [ ] **Step 1: Write the failing test** — `tests/display.test.js`

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../js/display.js'`.

- [ ] **Step 3: Write `js/display.js`**

```js
// Turns timer state into the text the screens show.

import { GROUP_LABELS } from './exercises.js';

export function formatDuration(totalSec) {
  const sec = typeof totalSec === 'number' && Number.isFinite(totalSec) ? Math.max(0, Math.round(totalSec)) : 0;
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function formatTarget(exercise) {
  const base = exercise.holdSec ? `${exercise.holdSec}s hold` : `${exercise.reps} reps`;
  return exercise.sided ? `${base} each side` : base;
}

// Non-work phases show the upcoming work phase (index + 1), so "next" is the one after that.
export function nextWorkIndex(timeline, index) {
  const shown = timeline[index].kind === 'work' ? index : index + 1;
  for (let i = shown + 1; i < timeline.length; i++) {
    if (timeline[i].kind === 'work') return i;
  }
  return -1;
}

function labelFor(phase, rounds) {
  switch (phase.kind) {
    case 'prepare':
      return 'Get ready';
    case 'changeover':
      return 'Next up';
    case 'roundBreak':
      return `Rest · Round ${phase.round} of ${rounds} next`;
    default:
      return GROUP_LABELS[phase.exercise.group];
  }
}

export function describePosition(timeline, pos, settings) {
  const { phase, index } = pos;
  const fraction = Math.min(1, pos.phaseElapsedSec / phase.duration);
  if (settings.mode === 'reps') {
    return {
      kind: phase.kind,
      label: phase.kind === 'prepare' ? 'Get ready' : 'As many rounds as you can',
      name: '',
      cue: '',
      time: phase.kind === 'amrap' ? formatDuration(pos.remainingSec) : String(pos.remainingSec),
      next: '',
      progress: `${settings.capMin} min cap · ${settings.exercisesPerRound} exercises`,
      fraction,
    };
  }
  const nextIndex = nextWorkIndex(timeline, index);
  return {
    kind: phase.kind,
    label: labelFor(phase, settings.rounds),
    name: phase.exercise.name,
    cue: phase.exercise.cue,
    time: String(pos.remainingSec),
    next: nextIndex === -1 ? 'Last one!' : `Next: ${timeline[nextIndex].exercise.name}`,
    progress: `Round ${phase.round}/${settings.rounds} · ${phase.slot + 1}/${settings.exercisesPerRound}`,
    fraction,
  };
}

export function ringNotice(settings) {
  if (settings.rings === 'off') return '';
  return settings.rings === 'low' ? 'Set rings to: Low (knee height)' : 'Set rings to: Waist height';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/display.js tests/display.test.js
git commit -m "feat: add display model for workout screen text"
```

---

### Task 7: Storage and log entries

**Files:**
- Create: `js/storage.js`
- Modify: `tests/helpers.js` (append `memoryStorage`, `throwingStorage`)
- Test: `tests/storage.test.js`

**Interfaces:**
- Consumes: `normalizeSettings`, `DEFAULT_SETTINGS` from `js/settings.js`; `PREPARE_SEC` from `js/generator.js`.
- Produces:
  - `SETTINGS_KEY = 'workout.settings.v1'`, `LOG_KEY = 'workout.log.v1'`
  - `loadSettings(storage?): Settings`, `saveSettings(settings, storage?): boolean`
  - `loadLog(storage?): LogEntry[]`, `appendLog(entry, storage?): LogEntry[]`
  - `buildLogEntry({ startedAt: Date, endedAt: Date, activeMs, plannedSec, exercisesCompleted, circuit, settings }): LogEntry | null`
  - `LogEntry = { id, startedAt, endedAt, mode: 'timed'|'reps', activeSec, plannedSec, roundsCompleted: number|null, exercisesCompleted: number|null, circuit: string[], settings, partial }` — the two counts are `null` in reps mode. Reps mode returns `null` (not logged) when ended during the prepare phase (`activeMs <= PREPARE_SEC * 1000`).
  - `storage` defaults to `globalThis.localStorage` (or `null` if unavailable); any object with `getItem`/`setItem` works.
  - `tests/helpers.js`: `memoryStorage(initial = {})`, `throwingStorage()`.

- [ ] **Step 1: Append to `tests/helpers.js`**

```js
// In-memory stand-in for localStorage.
export function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

// localStorage that throws on every access (private mode, blocked storage, quota exceeded).
export function throwingStorage() {
  return {
    getItem() { throw new Error('storage denied'); },
    setItem() { throw new Error('quota exceeded'); },
  };
}
```

- [ ] **Step 2: Write the failing test** — `tests/storage.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SETTINGS_KEY, LOG_KEY, loadSettings, saveSettings, loadLog, appendLog, buildLogEntry,
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../js/storage.js'`.

- [ ] **Step 4: Write `js/storage.js`**

```js
// Persists settings and the workout log in localStorage. Never throws.

import { normalizeSettings } from './settings.js';
import { PREPARE_SEC } from './generator.js';

export const SETTINGS_KEY = 'workout.settings.v1';
export const LOG_KEY = 'workout.log.v1';

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readJson(storage, key) {
  try {
    const raw = storage?.getItem(key);
    return raw == null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeJson(storage, key, value) {
  try {
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadSettings(storage = browserStorage()) {
  return normalizeSettings(readJson(storage, SETTINGS_KEY));
}

export function saveSettings(settings, storage = browserStorage()) {
  return writeJson(storage, SETTINGS_KEY, settings);
}

function isLogEntry(entry) {
  return entry !== null && typeof entry === 'object'
    && typeof entry.startedAt === 'string' && !Number.isNaN(Date.parse(entry.startedAt));
}

export function loadLog(storage = browserStorage()) {
  const log = readJson(storage, LOG_KEY);
  return Array.isArray(log) ? log.filter(isLogEntry) : [];
}

export function appendLog(entry, storage = browserStorage()) {
  const log = [...loadLog(storage), entry];
  writeJson(storage, LOG_KEY, log);
  return log;
}

// Reps mode can't know how many exercises were done, so it records time only.
export function buildLogEntry({ startedAt, endedAt, activeMs, plannedSec, exercisesCompleted, circuit, settings }) {
  const reps = settings.mode === 'reps';
  if (reps ? activeMs <= PREPARE_SEC * 1000 : exercisesCompleted === 0) return null;
  const activeSec = Math.min(Math.round(activeMs / 1000), plannedSec);
  return {
    id: String(startedAt.getTime()),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    mode: settings.mode,
    activeSec,
    plannedSec,
    roundsCompleted: reps ? null : Math.floor(exercisesCompleted / settings.exercisesPerRound),
    exercisesCompleted: reps ? null : exercisesCompleted,
    circuit: circuit.map((e) => e.name),
    settings: { ...settings },
    partial: reps ? activeSec < plannedSec : exercisesCompleted < settings.exercisesPerRound * settings.rounds,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add js/storage.js tests/helpers.js tests/storage.test.js
git commit -m "feat: add settings and workout log storage"
```

---

### Task 8: History stats

**Files:**
- Create: `js/stats.js`
- Test: `tests/stats.test.js`

**Interfaces:**
- Consumes: `LogEntry[]` (only `startedAt` is read).
- Produces: `workoutsThisWeek(log, now = new Date()): number`, `currentStreak(log, now = new Date()): number`. Both use the device's local time zone; weeks start Monday.

- [ ] **Step 1: Write the failing test** — `tests/stats.test.js`

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../js/stats.js'`.

- [ ] **Step 3: Write `js/stats.js`**

```js
// Simple consistency stats over the workout log, in the device's local time.

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function startOfLocalDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfLocalWeek(now) {
  const d = startOfLocalDay(now);
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

export function workoutsThisWeek(log, now = new Date()) {
  const start = startOfLocalWeek(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return log.filter((entry) => {
    const t = new Date(entry.startedAt);
    return t >= start && t < end;
  }).length;
}

export function currentStreak(log, now = new Date()) {
  const days = new Set(log.map((entry) => dayKey(new Date(entry.startedAt))));
  const cursor = startOfLocalDay(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/stats.js tests/stats.test.js
git commit -m "feat: add weekly count and streak stats"
```

---

### Task 9: Audio cues

**Files:**
- Create: `js/audio.js`
- Test: `tests/audio.test.js`

**Interfaces:**
- Consumes: `Cue` shape from Task 5 (`type`, optional `text`).
- Produces: `createAudio({ isMuted, AudioContextClass, speech, Utterance } = {}): { unlock(): void, play(cue): void, stopSpeech(): void }`. Defaults use the browser globals (`AudioContext`/`webkitAudioContext`, `speechSynthesis`, `SpeechSynthesisUtterance`); every method is a safe no-op when an API is missing. `unlock()` must be called from a user gesture (the Start button). Exported `TONES` maps cue type → `{ frequency, durationMs }`.

- [ ] **Step 1: Write the failing test** — `tests/audio.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAudio, TONES } from '../js/audio.js';

function fakes() {
  const tones = [];
  const spoken = [];
  class FakeContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; FakeContext.instances++; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createOscillator() {
      const osc = { type: '', frequency: { value: 0 }, connect() {}, start() { tones.push(osc.frequency.value); }, stop() {} };
      return osc;
    }
    createGain() {
      return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
    }
  }
  FakeContext.instances = 0;
  const speech = { speak: (u) => spoken.push(u.text), cancel() {} };
  class Utterance { constructor(text) { this.text = text; } }
  return { tones, spoken, FakeContext, speech, Utterance };
}

function setup({ muted = false } = {}) {
  const f = fakes();
  const audio = createAudio({ isMuted: () => muted, AudioContextClass: f.FakeContext, speech: f.speech, Utterance: f.Utterance });
  return { ...f, audio };
}

test('unlock creates and resumes the audio context once and primes speech', () => {
  const { audio, FakeContext, spoken } = setup();
  audio.unlock();
  audio.unlock();
  assert.equal(FakeContext.instances, 1);
  assert.deepEqual(spoken, ['', '']);
});

test('countdown plays a short tone and says nothing', () => {
  const { audio, tones, spoken } = setup();
  audio.unlock();
  spoken.length = 0;
  audio.play({ type: 'countdown', count: 3, atMs: 0 });
  assert.deepEqual(tones, [TONES.countdown.frequency]);
  assert.deepEqual(spoken, []);
});

test('go plays the higher start tone', () => {
  const { audio, tones } = setup();
  audio.unlock();
  audio.play({ type: 'go', atMs: 0 });
  assert.deepEqual(tones, [TONES.go.frequency]);
  assert.ok(TONES.go.frequency > TONES.countdown.frequency);
});

test('announcements are spoken without a tone', () => {
  const { audio, tones, spoken } = setup();
  audio.unlock();
  spoken.length = 0;
  audio.play({ type: 'announceNext', atMs: 0, text: 'Next: Squats' });
  assert.deepEqual(tones, []);
  assert.deepEqual(spoken, ['Next: Squats']);
});

test('switch sides plays a tone and speaks', () => {
  const { audio, tones, spoken } = setup();
  audio.unlock();
  spoken.length = 0;
  audio.play({ type: 'switchSides', atMs: 0, text: 'Switch sides' });
  assert.equal(tones.length, 1);
  assert.deepEqual(spoken, ['Switch sides']);
});

test('muted plays nothing', () => {
  const { audio, tones, spoken } = setup({ muted: true });
  audio.unlock();
  spoken.length = 0;
  audio.play({ type: 'go', atMs: 0 });
  audio.play({ type: 'announceNext', atMs: 0, text: 'Next: Squats' });
  assert.deepEqual(tones, []);
  assert.deepEqual(spoken, []);
});

test('before unlock, tones are skipped but speech still works', () => {
  const { audio, tones, spoken } = setup();
  audio.play({ type: 'finished', atMs: 0, text: 'Workout complete' });
  assert.deepEqual(tones, []);
  assert.deepEqual(spoken, ['Workout complete']);
});

test('missing browser APIs never throw', () => {
  const audio = createAudio({ isMuted: () => false, AudioContextClass: undefined, speech: undefined, Utterance: undefined });
  assert.doesNotThrow(() => {
    audio.unlock();
    audio.play({ type: 'go', atMs: 0 });
    audio.play({ type: 'announceNext', atMs: 0, text: 'x' });
    audio.stopSpeech();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../js/audio.js'`.

- [ ] **Step 3: Write `js/audio.js`**

```js
// Plays cues: short Web Audio tones plus spoken text. Safe no-ops when an API is missing.

export const TONES = {
  countdown: { frequency: 660, durationMs: 120 },
  go: { frequency: 990, durationMs: 450 },
  switchSides: { frequency: 660, durationMs: 120 },
  timeLeft: { frequency: 880, durationMs: 150 },
  finished: { frequency: 990, durationMs: 700 },
};

export function createAudio({
  isMuted = () => false,
  AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext,
  speech = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
} = {}) {
  let context = null;

  // Must run inside a user gesture: iOS only allows audio and speech started from one.
  function unlock() {
    try {
      if (!context && AudioContextClass) context = new AudioContextClass();
      if (context?.state === 'suspended') context.resume();
    } catch {
      context = null;
    }
    try {
      if (speech && Utterance) speech.speak(new Utterance(''));
    } catch {
      // Speech unavailable; tones still work.
    }
  }

  function tone({ frequency, durationMs }) {
    if (!context) return;
    try {
      const start = context.currentTime;
      const end = start + durationMs / 1000;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.5, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(end + 0.02);
    } catch {
      // Ignore audio failures; the screen still shows everything.
    }
  }

  function say(text) {
    if (!speech || !Utterance) return;
    try {
      speech.cancel();
      const utterance = new Utterance(text);
      utterance.rate = 1.05;
      speech.speak(utterance);
    } catch {
      // Ignore speech failures.
    }
  }

  function play(cue) {
    if (isMuted()) return;
    if (TONES[cue.type]) tone(TONES[cue.type]);
    if (cue.text) say(cue.text);
  }

  function stopSpeech() {
    try {
      speech?.cancel();
    } catch {
      // Ignore.
    }
  }

  return { unlock, play, stopSpeech };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/audio.js tests/audio.test.js
git commit -m "feat: add audio cue playback with tones and speech"
```

---

### Task 10: Page shell, Setup and History screens

**Files:**
- Create: `index.html`
- Create: `css/styles.css`
- Create: `js/history.js`
- Create: `js/app.js`

**Interfaces:**
- Consumes: `EXERCISES`, `GROUP_LABELS` (Task 1); `SETTING_CHOICES`, `perRoundOptions`, `applySetting` (Task 2); `generateCircuit`, `buildTimeline`, `totalDuration` (Task 3); `formatDuration`, `formatTarget`, `ringNotice` (Task 6); `loadSettings`, `saveSettings`, `loadLog` (Task 7); `workoutsThisWeek`, `currentStreak` (Task 8).
- Produces:
  - DOM ids used by Task 11: `screen-workout`, `wo-progress`, `wo-mute`, `wo-label`, `wo-name`, `wo-cue`, `wo-time`, `wo-bar-fill`, `wo-list`, `wo-next`, `wo-tip`, `wo-tip-dismiss`, `wo-back`, `wo-pause`, `wo-fwd`, `wo-end`, `start`. The workout `<section>` uses `data-mode="timed|reps"` (set by Task 11) to switch layouts in CSS.
  - `js/history.js`: `renderHistory(log, now = new Date()): void`, `renderDone(entry): void`.
  - `js/app.js` module-level: `app` state object `{ settings, circuit }`, `showScreen(name: 'setup'|'workout'|'done'|'history')`, `renderSetup()`. (Task 11 adds the Start handler in this file.)

This task is UI wiring with no unit-testable logic of its own; it is verified with a headless-browser render.

- [ ] **Step 1: Write `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#111214">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="description" content="Hands-free bodyweight circuit timer">
  <title>Workout Timer</title>
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" href="icons/icon-192.png">
  <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
  <link rel="stylesheet" href="css/styles.css">
  <script type="module" src="js/app.js"></script>
</head>
<body>
  <section id="screen-setup" class="screen">
    <header class="bar">
      <h1>Workout</h1>
      <button id="open-history" class="btn-link" type="button">History</button>
    </header>

    <div class="panel">
      <h2>Settings</h2>
      <form id="settings-form" class="settings" autocomplete="off">
        <div class="mode" role="radiogroup" aria-label="Workout type">
          <label class="mode-option"><input type="radio" name="mode" value="timed"><span>Timed</span></label>
          <label class="mode-option"><input type="radio" name="mode" value="reps"><span>Reps</span></label>
        </div>
        <div class="field" data-mode="timed"><label for="workSec">Work</label><select id="workSec" name="workSec"></select></div>
        <div class="field" data-mode="timed"><label for="changeoverSec">Changeover</label><select id="changeoverSec" name="changeoverSec"></select></div>
        <div class="field" data-mode="reps"><label for="capMin">Time cap</label><select id="capMin" name="capMin"></select></div>
        <div class="field"><label for="exercisesPerRound">Exercises / round</label><select id="exercisesPerRound" name="exercisesPerRound"></select></div>
        <div class="field" data-mode="timed"><label for="rounds">Rounds</label><select id="rounds" name="rounds"></select></div>
        <div class="field" data-mode="timed"><label for="roundBreakSec">Round break</label><select id="roundBreakSec" name="roundBreakSec"></select></div>
        <div class="field"><label for="rings">Rings</label><select id="rings" name="rings"></select></div>
        <label class="toggle"><input type="checkbox" name="bar"><span>Pull-up bar</span></label>
        <label class="toggle"><input type="checkbox" name="chair"><span>Chair / table</span></label>
        <label class="toggle"><input type="checkbox" name="cardio"><span>Cardio group</span></label>
      </form>
    </div>

    <p id="ring-notice" class="notice" hidden></p>

    <div class="panel">
      <div class="panel-head">
        <h2>Circuit</h2>
        <button id="shuffle" class="btn btn-small" type="button">Shuffle</button>
      </div>
      <ol id="circuit-list" class="circuit"></ol>
    </div>

    <div class="start-bar">
      <button id="start" class="btn btn-primary btn-start" type="button">
        <span>Start</span><span id="total-time" class="total">0:00</span>
      </button>
    </div>
  </section>

  <section id="screen-workout" class="screen workout" data-phase="prepare" data-mode="timed" hidden>
    <div class="wo-top">
      <span id="wo-progress"></span>
      <button id="wo-mute" class="wo-chip" type="button" aria-pressed="false">Sound on</button>
    </div>
    <div class="wo-main">
      <p id="wo-label" class="wo-label"></p>
      <h2 id="wo-name" class="wo-name"></h2>
      <p id="wo-cue" class="wo-cue"></p>
      <div id="wo-time" class="wo-time" aria-live="off"></div>
      <div class="wo-bar"><span id="wo-bar-fill"></span></div>
      <ol id="wo-list" class="wo-list"></ol>
      <p id="wo-next" class="wo-next"></p>
    </div>
    <p id="wo-tip" class="wo-tip" hidden>
      <span>Tip: this browser can't keep the screen on. Turn off auto-lock while you work out.</span>
      <button id="wo-tip-dismiss" class="wo-chip" type="button">OK</button>
    </p>
    <div class="wo-controls">
      <button id="wo-back" class="wo-btn" type="button" aria-label="Previous">Back</button>
      <button id="wo-pause" class="wo-btn wo-btn-primary" type="button">Pause</button>
      <button id="wo-fwd" class="wo-btn" type="button" aria-label="Skip">Skip</button>
    </div>
    <button id="wo-end" class="wo-btn hold" type="button"><span>Hold to end</span></button>
  </section>

  <section id="screen-done" class="screen" hidden>
    <header class="bar"><h1 id="done-title">Workout complete</h1></header>
    <div class="stats">
      <div class="stat"><div id="done-time" class="stat-value">0:00</div><div class="stat-label">Active time</div></div>
      <div id="done-rounds-stat" class="stat"><div id="done-rounds" class="stat-value">0</div><div class="stat-label">Rounds</div></div>
      <div class="stat"><div id="done-exercises" class="stat-value">0</div><div class="stat-label">Exercises</div></div>
    </div>
    <div class="actions">
      <button id="done-home" class="btn btn-primary" type="button">Back to start</button>
      <button id="done-history" class="btn" type="button">History</button>
    </div>
  </section>

  <section id="screen-history" class="screen" hidden>
    <header class="bar">
      <button id="history-back" class="btn-link" type="button">‹ Back</button>
      <h1>History</h1>
    </header>
    <div class="stats">
      <div class="stat"><div id="stat-week" class="stat-value">0</div><div class="stat-label">This week</div></div>
      <div class="stat"><div id="stat-streak" class="stat-value">0</div><div id="stat-streak-label" class="stat-label">Day streak</div></div>
    </div>
    <ul id="history-list" class="history"></ul>
  </section>
</body>
</html>
```

- [ ] **Step 2: Write `css/styles.css`**

```css
:root {
  --bg: #111214;
  --surface: #1b1d21;
  --surface-2: #25282d;
  --line: #33363c;
  --text: #f4f4f5;
  --muted: #a1a1aa;
  --accent: #ff5a36;
  --work: #e5482a;
  --prep: #f5a524;
  --rest: #2f6fde;
  --push: #ff7a59;
  --pull: #4cc9f0;
  --legs: #8ac926;
  --core: #ffca3a;
  --cardio: #c77dff;
  --radius: 14px;
  --tap: 56px;
  color-scheme: dark;
}

* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body {
  background: var(--bg);
  color: var(--text);
  font: 17px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-tap-highlight-color: transparent;
  overflow-x: hidden;
}
[hidden] { display: none !important; }
button, select, input { font: inherit; color: inherit; }
button { cursor: pointer; }
h1, h2 { margin: 0; }

/* Mobile first: these base styles are the phone layout; wider screens only widen containers. */

/* ---- Shared ---- */
.screen {
  max-width: 640px;
  margin: 0 auto;
  padding: max(16px, env(safe-area-inset-top)) 16px calc(112px + env(safe-area-inset-bottom));
}
.bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.bar h1 { font-size: 1.75rem; letter-spacing: -0.02em; }
.btn {
  min-height: var(--tap);
  padding: 0 20px;
  border-radius: var(--radius);
  border: 1px solid var(--line);
  background: var(--surface-2);
  font-weight: 650;
}
.btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn-small { min-height: 44px; padding: 0 16px; font-size: 0.95rem; }
.btn-link { min-height: 44px; padding: 0 8px; background: none; border: none; color: var(--muted); font-weight: 650; }
.btn:focus-visible, .btn-link:focus-visible, .wo-btn:focus-visible, .wo-chip:focus-visible, select:focus-visible, .toggle:focus-within {
  outline: 3px solid var(--prep);
  outline-offset: 2px;
}
.panel { background: var(--surface); border-radius: var(--radius); padding: 16px; margin-bottom: 16px; }
.panel h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 12px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.panel-head h2 { margin-bottom: 0; }

/* ---- Setup ---- */
.settings { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.field label { font-size: 0.85rem; color: var(--muted); }
.field select {
  min-height: 48px;
  width: 100%;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface-2);
}
.toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 0 12px;
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px solid var(--line);
}
.toggle input { width: 22px; height: 22px; margin: 0; accent-color: var(--accent); flex: none; }
.notice {
  margin: 0 0 16px;
  padding: 12px 14px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--prep) 16%, transparent);
  color: var(--prep);
  font-weight: 650;
}
.circuit { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; counter-reset: step; }
.circuit li {
  counter-increment: step;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--surface-2);
}
.circuit li::before { content: counter(step); min-width: 1.4em; color: var(--muted); font-variant-numeric: tabular-nums; }
.tag {
  flex: none;
  min-width: 4.6em;
  padding: 3px 8px;
  border-radius: 999px;
  text-align: center;
  font-size: 0.72rem;
  font-weight: 750;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--tag);
  background: color-mix(in srgb, var(--tag) 18%, transparent);
}
.tag-push { --tag: var(--push); }
.tag-pull { --tag: var(--pull); }
.tag-legs { --tag: var(--legs); }
.tag-core { --tag: var(--core); }
.tag-cardio { --tag: var(--cardio); }
.start-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 24px 16px calc(12px + env(safe-area-inset-bottom));
  background: linear-gradient(transparent, var(--bg) 40%);
  display: flex;
  justify-content: center;
}
.btn-start {
  width: 100%;
  max-width: 608px;
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 1.3rem;
  font-weight: 800;
}
.total { font-variant-numeric: tabular-nums; opacity: 0.85; }
.mode {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface-2);
}
.mode-option { position: relative; display: block; }
.mode-option input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.mode-option span {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  border-radius: 9px;
  color: var(--muted);
  font-weight: 750;
}
.mode-option input:checked + span { background: var(--accent); color: #fff; }
.mode-option input:focus-visible + span { outline: 3px solid var(--prep); outline-offset: 2px; }
.target { margin-left: auto; padding-left: 8px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }

/* ---- Workout ---- */
.workout {
  position: fixed;
  inset: 0;
  max-width: none;
  margin: 0;
  display: flex;
  flex-direction: column;
  padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
  background: var(--phase-bg);
  color: var(--phase-fg);
  transition: background-color 0.3s;
}
.workout[data-phase="work"], .workout[data-phase="amrap"] { --phase-bg: var(--work); --phase-fg: #fff; }
.workout[data-phase="prepare"], .workout[data-phase="changeover"] { --phase-bg: var(--prep); --phase-fg: #1a1205; }
.workout[data-phase="roundBreak"] { --phase-bg: var(--rest); --phase-fg: #fff; }
.wo-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-weight: 750; font-variant-numeric: tabular-nums; }
.wo-chip {
  min-height: 44px;
  padding: 0 14px;
  border-radius: 999px;
  border: 2px solid color-mix(in srgb, var(--phase-fg) 35%, transparent);
  background: transparent;
  color: var(--phase-fg);
  font-weight: 700;
  flex: none;
}
.wo-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
}
.wo-label { margin: 0; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.85; }
.wo-name { font-size: clamp(2rem, min(12vw, 8vh), 6rem); line-height: 1.02; font-weight: 850; letter-spacing: -0.02em; overflow-wrap: anywhere; }
.wo-cue { margin: 8px 0 0; font-size: clamp(1rem, 3.5vw, 1.4rem); opacity: 0.85; }
.wo-time { font-size: clamp(5rem, min(42vw, 30vh), 18rem); font-weight: 850; line-height: 1; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; }
.wo-bar { width: 100%; height: 8px; margin: 8px 0 12px; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--phase-fg) 22%, transparent); }
.wo-bar span { display: block; height: 100%; background: var(--phase-fg); transform-origin: left; transform: scaleX(0); }
.wo-next { margin: 0; font-size: clamp(1.1rem, 4.5vw, 1.8rem); font-weight: 750; }
.workout.paused .wo-time { opacity: 0.45; }
.wo-list { display: none; }
.workout[data-mode="reps"] .wo-name,
.workout[data-mode="reps"] .wo-cue,
.workout[data-mode="reps"] .wo-next { display: none; }
.workout[data-mode="reps"] .wo-main { justify-content: flex-start; padding-top: 8px; }
.workout[data-mode="reps"] .wo-time { font-size: clamp(4rem, min(20vw, 13vh), 10rem); }
.workout[data-mode="reps"] .wo-list {
  display: grid;
  gap: 6px;
  width: 100%;
  max-width: 640px;
  min-height: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  text-align: left;
}
.wo-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 12px;
  padding: 8px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--phase-fg) 14%, transparent);
  font-size: clamp(1.05rem, 4.6vw, 1.6rem);
  font-weight: 800;
  line-height: 1.15;
}
.wo-list .target { color: inherit; opacity: 0.85; font-weight: 700; }
.wo-tip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0 0 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgb(0 0 0 / 0.25);
  font-size: 0.95rem;
}
.wo-controls { display: grid; grid-template-columns: 1fr 1.6fr 1fr; gap: 10px; width: 100%; max-width: 640px; margin: 0 auto; }
.wo-btn {
  min-height: 64px;
  border-radius: var(--radius);
  border: 2px solid color-mix(in srgb, var(--phase-fg) 35%, transparent);
  background: color-mix(in srgb, var(--phase-fg) 12%, transparent);
  color: var(--phase-fg);
  font-size: 1.05rem;
  font-weight: 800;
}
.wo-btn-primary { background: var(--phase-fg); border-color: var(--phase-fg); color: var(--phase-bg); font-size: 1.3rem; }
.hold {
  position: relative;
  overflow: hidden;
  width: 100%;
  max-width: 640px;
  min-height: var(--tap);
  margin: 10px auto 0;
  display: block;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  touch-action: none;
}
.hold::before {
  content: "";
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--phase-fg) 35%, transparent);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.15s;
}
.hold.holding::before { transform: scaleX(1); transition: transform 1s linear; }
.hold span { position: relative; }

/* ---- Done & History ---- */
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 12px; margin-bottom: 16px; }
.stat { background: var(--surface); border-radius: var(--radius); padding: 16px; }
.stat-value { font-size: 2.4rem; font-weight: 850; line-height: 1; font-variant-numeric: tabular-nums; }
.stat-label { margin-top: 6px; color: var(--muted); font-size: 0.85rem; }
.actions { display: grid; gap: 10px; }
.history { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.history-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 12px;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--surface);
}
.history-date { font-weight: 700; }
.history-detail { grid-column: 1; color: var(--muted); font-size: 0.9rem; font-variant-numeric: tabular-nums; }
.badge {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: center;
  padding: 2px 8px;
  border: 1px solid currentColor;
  border-radius: 999px;
  color: var(--prep);
  font-size: 0.72rem;
  font-weight: 750;
  text-transform: uppercase;
}
.empty { padding: 24px; text-align: center; color: var(--muted); }

@media (prefers-reduced-motion: reduce) {
  .workout, .hold::before, .hold.holding::before { transition: none; }
}
```

- [ ] **Step 3: Write `js/history.js`**

```js
// Renders the Done and History screens.

import { workoutsThisWeek, currentStreak } from './stats.js';
import { formatDuration } from './display.js';

const $ = (id) => document.getElementById(id);

const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

const count = (value) => (Number.isFinite(value) ? value : 0);

function historyDetail(entry) {
  if (entry.mode === 'reps') {
    const exercises = Array.isArray(entry.circuit) ? entry.circuit.length : 0;
    return `${formatDuration(entry.activeSec)} · Reps · ${exercises} exercises`;
  }
  return `${formatDuration(entry.activeSec)} · ${count(entry.exercisesCompleted)} exercises · ${count(entry.roundsCompleted)} rounds`;
}

function historyItem(entry) {
  const item = element('li', 'history-item', '');
  const detail = historyDetail(entry);
  item.append(
    element('span', 'history-date', dateFormat.format(new Date(entry.startedAt))),
    element('span', 'history-detail', detail),
  );
  if (entry.partial) item.append(element('span', 'badge', 'Partial'));
  return item;
}

export function renderHistory(log, now = new Date()) {
  $('stat-week').textContent = String(workoutsThisWeek(log, now));
  const streak = currentStreak(log, now);
  $('stat-streak').textContent = String(streak);
  $('stat-streak-label').textContent = streak === 1 ? 'Day streak' : 'Days streak';
  const list = $('history-list');
  if (log.length === 0) {
    list.replaceChildren(element('li', 'empty', 'No workouts yet. Your first one will show up here.'));
    return;
  }
  list.replaceChildren(...[...log].reverse().map(historyItem));
}

export function renderDone(entry) {
  const reps = entry.mode === 'reps';
  $('done-title').textContent = entry.partial ? 'Workout ended' : 'Workout complete';
  $('done-time').textContent = formatDuration(entry.activeSec);
  $('done-rounds-stat').hidden = reps;
  $('done-rounds').textContent = String(entry.roundsCompleted ?? 0);
  $('done-exercises').textContent = String(reps ? entry.circuit.length : entry.exercisesCompleted);
}
```

- [ ] **Step 4: Write `js/app.js`**

```js
// Boots the app: Setup screen, navigation between screens.

import { EXERCISES, GROUP_LABELS } from './exercises.js';
import { SETTING_CHOICES, perRoundOptions, applySetting } from './settings.js';
import { generateCircuit, buildTimeline, totalDuration } from './generator.js';
import { formatDuration, formatTarget, ringNotice } from './display.js';
import { loadSettings, saveSettings, loadLog } from './storage.js';
import { renderHistory } from './history.js';

const $ = (id) => document.getElementById(id);

const CIRCUIT_KEYS = new Set(['exercisesPerRound', 'bar', 'chair', 'rings', 'cardio']);
const NUMERIC_KEYS = new Set(['workSec', 'changeoverSec', 'exercisesPerRound', 'rounds', 'roundBreakSec', 'capMin']);
const RING_LABELS = { off: 'Off', low: 'Low (knee)', waist: 'Waist height' };
const seconds = (value) => `${value}s`;
const minutes = (value) => `${value} min`;

export const app = { settings: loadSettings(), circuit: [] };
app.circuit = generateCircuit(app.settings, EXERCISES);

export function showScreen(name) {
  for (const section of document.querySelectorAll('.screen')) {
    section.hidden = section.id !== `screen-${name}`;
  }
  window.scrollTo(0, 0);
}

function fillSelect(select, values, format, selected) {
  select.replaceChildren(...values.map((value) => new Option(format(value), String(value), false, value === selected)));
}

function circuitItem(exercise, showTarget) {
  const item = document.createElement('li');
  const tag = document.createElement('span');
  tag.className = `tag tag-${exercise.group}`;
  tag.textContent = GROUP_LABELS[exercise.group];
  const name = document.createElement('span');
  name.textContent = exercise.name;
  item.append(tag, name);
  if (showTarget) {
    const target = document.createElement('span');
    target.className = 'target';
    target.textContent = formatTarget(exercise);
    item.append(target);
  }
  return item;
}

export function renderSetup() {
  const { settings, circuit } = app;
  const form = $('settings-form');
  const fields = form.elements;
  fields.mode.value = settings.mode;
  for (const node of form.querySelectorAll('[data-mode]')) node.hidden = node.dataset.mode !== settings.mode;
  fillSelect(fields.capMin, SETTING_CHOICES.capMin, minutes, settings.capMin);
  fillSelect(fields.workSec, SETTING_CHOICES.workSec, seconds, settings.workSec);
  fillSelect(fields.changeoverSec, SETTING_CHOICES.changeoverSec, seconds, settings.changeoverSec);
  fillSelect(fields.exercisesPerRound, perRoundOptions(settings.cardio), String, settings.exercisesPerRound);
  fillSelect(fields.rounds, SETTING_CHOICES.rounds, String, settings.rounds);
  fillSelect(fields.roundBreakSec, SETTING_CHOICES.roundBreakSec, seconds, settings.roundBreakSec);
  fillSelect(fields.rings, SETTING_CHOICES.rings, (value) => RING_LABELS[value], settings.rings);
  fields.bar.checked = settings.bar;
  fields.chair.checked = settings.chair;
  fields.cardio.checked = settings.cardio;

  $('circuit-list').replaceChildren(...circuit.map((exercise) => circuitItem(exercise, settings.mode === 'reps')));
  $('total-time').textContent = formatDuration(totalDuration(buildTimeline(circuit, settings)));
  const notice = ringNotice(settings);
  $('ring-notice').textContent = notice;
  $('ring-notice').hidden = notice === '';
}

function shuffle() {
  app.circuit = generateCircuit(app.settings, EXERCISES);
}

$('settings-form').addEventListener('change', (event) => {
  const field = event.target;
  const key = field.name;
  if (!key) return;
  const value = field.type === 'checkbox' ? field.checked : NUMERIC_KEYS.has(key) ? Number(field.value) : field.value;
  app.settings = applySetting(app.settings, key, value);
  saveSettings(app.settings);
  if (CIRCUIT_KEYS.has(key)) shuffle();
  renderSetup();
});
$('settings-form').addEventListener('submit', (event) => event.preventDefault());

$('shuffle').addEventListener('click', () => {
  shuffle();
  renderSetup();
});

function openHistory() {
  renderHistory(loadLog());
  showScreen('history');
}

function openSetup() {
  renderSetup();
  showScreen('setup');
}

$('open-history').addEventListener('click', openHistory);
$('history-back').addEventListener('click', openSetup);
$('done-home').addEventListener('click', openSetup);
$('done-history').addEventListener('click', openHistory);

renderSetup();
showScreen('setup');
```

- [ ] **Step 5: Run unit tests (regression check)**

Run: `npm test`
Expected: PASS (no new tests; existing ones still pass).

- [ ] **Step 6: Render-check in headless Chrome**

Headless Chrome enforces a minimum window width of about 500px, so a `--window-size=390,…` screenshot lays the page out at ~500px and crops it — it looks like horizontal overflow when there is none. Always render inside a phone-sized iframe with this throwaway harness (never commit these files):

```bash
cat > ./__check.html <<'EOF'
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="css/styles.css"></head><body></body>
<script type="module">
  const q = location.search;
  localStorage.setItem('workout.settings.v1', JSON.stringify(q.includes('reps') ? { mode: 'reps' } : {}));
  const html = await (await fetch('index.html')).text();
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
  await import('./js/app.js');
  if (q.includes('start')) document.getElementById('start').click();
</script></html>
EOF
cat > ./__frame.html <<'EOF'
<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#888}iframe{border:0;display:block}</style></head><body>
<script>
  const p = new URLSearchParams(location.search);
  const frame = document.createElement('iframe');
  frame.width = p.get('w'); frame.height = p.get('h');
  frame.src = '__check.html?' + (p.get('q') || '');
  document.body.append(frame);
</script></body></html>
EOF
python3 -m http.server 8765 >/dev/null 2>&1 & SERVER=$!
sleep 1
# shot <output.png> <width> <height> <query: '' | reps | start | start-reps>; perl alarm stops a hung Chrome after 40s.
shot() { perl -e 'alarm 40; exec @ARGV' "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=800,900 --virtual-time-budget=4000 --screenshot="$1" "http://localhost:8765/__frame.html?w=$2&h=$3&q=$4" 2>/dev/null; }
shot /tmp/workout-setup.png 390 844 ''
shot /tmp/workout-setup-reps.png 390 844 reps
shot /tmp/workout-setup-320.png 320 640 ''
perl -e 'alarm 40; exec @ARGV' "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --virtual-time-budget=3000 --dump-dom http://localhost:8765/ > /tmp/workout-dom.html
kill $SERVER
rm ./__check.html ./__frame.html
grep -c '<li><span class="tag tag-' /tmp/workout-dom.html
grep -o 'id="total-time" class="total">[0-9:]*' /tmp/workout-dom.html
```

Expected: the `grep -c` prints `8` (eight circuit items); total time shows `19:55`. Open the screenshots with the Read tool (the phone is the left part of each image; grey is the harness background):
- `/tmp/workout-setup.png`: Timed/Reps switch with Timed selected; two-column settings showing Work, Changeover, Exercises / round, Rounds, Round break, Rings (no Time cap); toggles; "Set rings to: Low (knee height)" notice; Circuit panel with Shuffle and colored group tags; Start bar pinned at the bottom showing `19:55`; nothing cut off on the right.
- `/tmp/workout-setup-reps.png`: Reps selected; Time cap visible and Work/Changeover/Rounds/Round break hidden; circuit items show targets such as "15 reps"; Start shows `20:10`.
- `/tmp/workout-setup-320.png`: same as the first at 320px, nothing cut off on the right.

(A 404 for `manifest.webmanifest`/icons is expected until Task 12.)

- [ ] **Step 7: Commit**

```bash
git add index.html css/styles.css js/history.js js/app.js
git commit -m "feat: add setup and history screens"
```

---

### Task 11: Workout runner and Done screen

**Files:**
- Create: `js/workout.js`
- Modify: `js/app.js` (imports + Start handler)

**Interfaces:**
- Consumes: `buildTimeline`, `totalDuration` (Task 3); `startTimer`, `elapsedMs`, `isPaused`, `pause`, `resume`, `position`, `skipForward`, `skipBack`, `workCompleted`, `cuesBetween` (Tasks 4–5); `describePosition`, `formatTarget` (Task 6); `buildLogEntry`, `appendLog` (Task 7); `createAudio` (Task 9); DOM ids, `app`, `showScreen`, `renderSetup` (Task 10); `renderDone` (Task 10, `js/history.js`).
- Produces: `runWorkout({ circuit, settings, audio, getMuted, setMuted, onExit }): void` — drives the Workout screen (timed or reps layout per `settings.mode`) until the workout completes or is ended, saves the log entry, then calls `onExit(entry | null)` exactly once. No tap is needed between Start and the end in either mode.

- [ ] **Step 1: Write `js/workout.js`**

```js
// Runs one workout on the Workout screen: render loop, cues, controls, wake lock, logging.

import { buildTimeline, totalDuration } from './generator.js';
import {
  startTimer, elapsedMs, isPaused, pause, resume, position, skipForward, skipBack, workCompleted, cuesBetween,
} from './timer.js';
import { describePosition, formatTarget } from './display.js';
import { buildLogEntry, appendLog } from './storage.js';

const HOLD_TO_END_MS = 1000;
const FALLBACK_TICK_MS = 250;
const WAKE_TIP_KEY = 'workout.wakeTipDismissed';

const $ = (id) => document.getElementById(id);

function setText(id, text) {
  const node = $(id);
  if (node.textContent !== text) node.textContent = text;
}

function repsItem(exercise) {
  const item = document.createElement('li');
  const name = document.createElement('span');
  name.textContent = exercise.name;
  const target = document.createElement('span');
  target.className = 'target';
  target.textContent = formatTarget(exercise);
  item.append(name, target);
  return item;
}

function createWakeLock() {
  const supported = 'wakeLock' in navigator;
  let sentinel = null;
  let active = true;
  async function request() {
    if (!supported || !active || document.visibilityState !== 'visible') return;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (active) sentinel = lock;
      else lock.release().catch(() => {});
    } catch {
      sentinel = null;
    }
  }
  function release() {
    active = false;
    sentinel?.release().catch(() => {});
    sentinel = null;
  }
  return { supported, request, release };
}

function readFlag(key) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // Not persisted; the tip may show again next time.
  }
}

export function runWorkout({ circuit, settings, audio, getMuted, setMuted, onExit }) {
  const timeline = buildTimeline(circuit, settings);
  const plannedSec = totalDuration(timeline);
  const startedAt = new Date();
  const screen = $('screen-workout');
  screen.dataset.mode = settings.mode;
  $('wo-list').replaceChildren(...(settings.mode === 'reps' ? circuit.map(repsItem) : []));
  const controller = new AbortController();
  const { signal } = controller;
  const on = (target, type, handler) => target.addEventListener(type, handler, { signal });
  const wakeLock = createWakeLock();

  let state = startTimer(timeline, performance.now());
  let prevMs = -1;
  let finished = false;
  let frame = 0;
  let holdTimer = 0;

  function render(pos) {
    const view = describePosition(timeline, pos, settings);
    screen.dataset.phase = view.kind;
    screen.classList.toggle('paused', isPaused(state));
    setText('wo-progress', view.progress);
    setText('wo-label', view.label);
    setText('wo-name', view.name);
    setText('wo-cue', view.cue);
    setText('wo-time', view.time);
    setText('wo-next', view.next);
    $('wo-bar-fill').style.transform = `scaleX(${view.fraction})`;
    setText('wo-pause', isPaused(state) ? 'Resume' : 'Pause');
    setText('wo-mute', getMuted() ? 'Sound off' : 'Sound on');
    $('wo-mute').setAttribute('aria-pressed', String(getMuted()));
  }

  function tick() {
    if (finished) return;
    const now = performance.now();
    const ms = elapsedMs(state, now);
    for (const cue of cuesBetween(timeline, prevMs, ms)) audio.play(cue);
    prevMs = ms;
    const pos = position(state, now);
    render(pos);
    if (pos.done) finish();
  }

  function loop() {
    tick();
    if (!finished) frame = requestAnimationFrame(loop);
  }

  function finish() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(frame);
    clearInterval(interval);
    clearTimeout(holdTimer);
    controller.abort();
    wakeLock.release();
    const now = performance.now();
    const entry = buildLogEntry({
      startedAt,
      endedAt: new Date(),
      activeMs: elapsedMs(state, now),
      plannedSec,
      exercisesCompleted: workCompleted(state, now),
      circuit,
      settings,
    });
    if (entry) appendLog(entry);
    onExit(entry);
  }

  // After a skip, only the landing phase's start cues should play.
  function jump(skip) {
    const now = performance.now();
    state = skip(state, now);
    prevMs = elapsedMs(state, now) - 1;
    tick();
  }

  on($('wo-pause'), 'click', () => {
    const now = performance.now();
    state = isPaused(state) ? resume(state, now) : pause(state, now);
    if (isPaused(state)) audio.stopSpeech();
    tick();
  });
  on($('wo-fwd'), 'click', () => jump(skipForward));
  on($('wo-back'), 'click', () => jump(skipBack));
  on($('wo-mute'), 'click', () => {
    setMuted(!getMuted());
    if (getMuted()) audio.stopSpeech();
    tick();
  });

  const endButton = $('wo-end');
  const cancelHold = () => {
    clearTimeout(holdTimer);
    endButton.classList.remove('holding');
  };
  const startHold = (event) => {
    event.preventDefault();
    endButton.classList.add('holding');
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      cancelHold();
      audio.stopSpeech();
      finish();
    }, HOLD_TO_END_MS);
  };
  on(endButton, 'pointerdown', startHold);
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) on(endButton, type, cancelHold);
  on(endButton, 'keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) startHold(event);
  });
  on(endButton, 'keyup', cancelHold);
  on(endButton, 'contextmenu', (event) => event.preventDefault());

  on(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      wakeLock.request();
      tick();
    }
  });

  const tip = $('wo-tip');
  tip.hidden = wakeLock.supported || readFlag(WAKE_TIP_KEY);
  on($('wo-tip-dismiss'), 'click', () => {
    tip.hidden = true;
    writeFlag(WAKE_TIP_KEY);
  });

  wakeLock.request();
  // rAF drives smooth updates; the interval keeps cues going when rAF is throttled.
  const interval = setInterval(tick, FALLBACK_TICK_MS);
  loop();
}
```

- [ ] **Step 2: Wire the Start button in `js/app.js`**

Replace the import block at the top of `js/app.js` with:

```js
import { EXERCISES, GROUP_LABELS } from './exercises.js';
import { SETTING_CHOICES, perRoundOptions, applySetting } from './settings.js';
import { generateCircuit, buildTimeline, totalDuration } from './generator.js';
import { formatDuration, formatTarget, ringNotice } from './display.js';
import { loadSettings, saveSettings, loadLog } from './storage.js';
import { renderHistory, renderDone } from './history.js';
import { createAudio } from './audio.js';
import { runWorkout } from './workout.js';
```

Then add, directly above the final `renderSetup();` line:

```js
const audio = createAudio({ isMuted: () => app.settings.muted });

$('start').addEventListener('click', () => {
  audio.unlock();
  showScreen('workout');
  runWorkout({
    circuit: app.circuit,
    settings: app.settings,
    audio,
    getMuted: () => app.settings.muted,
    setMuted: (muted) => {
      app.settings = applySetting(app.settings, 'muted', muted);
      saveSettings(app.settings);
    },
    onExit: (entry) => {
      if (entry) {
        renderDone(entry);
        showScreen('done');
      } else {
        openSetup();
      }
    },
  });
});
```


- [ ] **Step 3: Run unit tests and syntax checks**

Run: `npm test && node --check js/workout.js && node --check js/app.js`
Expected: PASS and no syntax errors.

- [ ] **Step 4: Render-check the workout screen in headless Chrome**

Headless Chrome cannot tap Start, so the harness clicks it for you.

Headless Chrome enforces a minimum window width of about 500px, so a `--window-size=390,…` screenshot lays the page out at ~500px and crops it — it looks like horizontal overflow when there is none. Always render inside a phone-sized iframe with this throwaway harness (never commit these files):

```bash
cat > ./__check.html <<'EOF'
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="css/styles.css"></head><body></body>
<script type="module">
  const q = location.search;
  localStorage.setItem('workout.settings.v1', JSON.stringify(q.includes('reps') ? { mode: 'reps' } : {}));
  const html = await (await fetch('index.html')).text();
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
  await import('./js/app.js');
  if (q.includes('start')) document.getElementById('start').click();
</script></html>
EOF
cat > ./__frame.html <<'EOF'
<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#888}iframe{border:0;display:block}</style></head><body>
<script>
  const p = new URLSearchParams(location.search);
  const frame = document.createElement('iframe');
  frame.width = p.get('w'); frame.height = p.get('h');
  frame.src = '__check.html?' + (p.get('q') || '');
  document.body.append(frame);
</script></body></html>
EOF
python3 -m http.server 8765 >/dev/null 2>&1 & SERVER=$!
sleep 1
# shot <output.png> <width> <height> <query: '' | reps | start | start-reps>; perl alarm stops a hung Chrome after 40s.
shot() { perl -e 'alarm 40; exec @ARGV' "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=800,900 --virtual-time-budget=4000 --screenshot="$1" "http://localhost:8765/__frame.html?w=$2&h=$3&q=$4" 2>/dev/null; }
shot /tmp/workout-run.png 390 844 start
shot /tmp/workout-run-reps.png 390 844 start-reps
shot /tmp/workout-run-320.png 320 640 start
kill $SERVER
rm ./__check.html ./__frame.html
```

Expected (open each with the Read tool; the phone is the left part of the image):
- `/tmp/workout-run.png`: amber "Get ready" screen with the first exercise name in large type, its form cue, a large countdown number, a progress bar, "Next: …", progress "Round 1/3 · 1/8", a "Sound on" chip, Back/Pause/Skip buttons and "Hold to end"; nothing cut off.
- `/tmp/workout-run-reps.png`: amber "Get ready" screen with progress "20 min cap · 8 exercises", a countdown, and all eight exercises listed with targets right-aligned (e.g. "15 reps", "30s hold"); no single exercise name or "Next:" line.
- `/tmp/workout-run-320.png`: the timed layout fits 320×640 with nothing cut off.

- [ ] **Step 5: Commit**

```bash
git add js/workout.js js/app.js
git commit -m "feat: add workout runner with cues, controls, wake lock and logging"
```

---

### Task 12: Installable offline app (PWA)

**Files:**
- Create: `scripts/make-icons.mjs`
- Create: `icons/icon-192.png`, `icons/icon-512.png`, `icons/apple-touch-icon.png` (generated)
- Create: `manifest.webmanifest`
- Create: `sw.js`
- Modify: `js/app.js` (service worker registration)
- Test: `tests/pwa.test.js`

**Interfaces:**
- Consumes: every file in `js/`, `css/`, `icons/`; `index.html`.
- Produces: `sw.js` with `const CACHE = 'workout-timer-v1'` and `const ASSETS = [...]`. Releasing a change later means bumping `CACHE`.

- [ ] **Step 1: Write the failing test** — `tests/pwa.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const sw = read('sw.js').toString();
const assetsBlock = sw.match(/const ASSETS = \[([\s\S]*?)\];/);
const assets = assetsBlock ? [...assetsBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];

test('service worker caches the page and the manifest', () => {
  for (const path of ['./', 'index.html', 'manifest.webmanifest']) assert.ok(assets.includes(path), path);
});

test('service worker caches every script, stylesheet and icon', () => {
  for (const dir of ['js', 'css', 'icons']) {
    for (const file of readdirSync(new URL(`${dir}/`, root))) {
      assert.ok(assets.includes(`${dir}/${file}`), `${dir}/${file} missing from sw.js ASSETS`);
    }
  }
});

test('every cached asset exists', () => {
  for (const path of assets.filter((p) => p !== './')) assert.ok(existsSync(new URL(path, root)), path);
});

function pngSize(path) {
  const bytes = read(path);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${path} is not a PNG`);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

test('manifest is valid and its icons exist at the declared sizes', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.length >= 2);
  for (const icon of manifest.icons) {
    const [w, h] = icon.sizes.split('x').map(Number);
    assert.deepEqual(pngSize(icon.src), [w, h], icon.src);
  }
  assert.deepEqual(pngSize('icons/apple-touch-icon.png'), [180, 180]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `ENOENT ... sw.js`.

- [ ] **Step 3: Write `scripts/make-icons.mjs`**

```js
// Generates the app icons (a stopwatch on a dark square) as PNGs with no dependencies.
// Run: node scripts/make-icons.mjs

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const BG = [17, 18, 20];
const FG = [255, 90, 54];
const SAMPLES = 4; // 4x4 supersampling for smooth edges

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// x, y in [0, 1]. Shape kept inside the central 70% so it survives maskable cropping.
function isForeground(x, y) {
  const cx = 0.5;
  const cy = 0.55;
  const r = Math.hypot(x - cx, y - cy);
  const ring = r > 0.23 && r < 0.3;
  const stem = Math.abs(x - cx) < 0.04 && y > 0.18 && y < 0.26;
  const crown = Math.abs(x - cx) < 0.09 && y > 0.14 && y < 0.19;
  const angle = (40 * Math.PI) / 180;
  const hand = distanceToSegment(x, y, cx, cy, cx + 0.15 * Math.sin(angle), cy - 0.15 * Math.cos(angle)) < 0.028;
  const hub = r < 0.045;
  return ring || stem || crown || hand || hub;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function renderPng(size) {
  const rowBytes = size * 4 + 1;
  const raw = Buffer.alloc(rowBytes * size);
  for (let py = 0; py < size; py++) {
    raw[py * rowBytes] = 0; // filter: none
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          if (isForeground((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size)) hits++;
        }
      }
      const t = hits / (SAMPLES * SAMPLES);
      const offset = py * rowBytes + 1 + px * 4;
      for (let c = 0; c < 3; c++) raw[offset + c] = Math.round(BG[c] + (FG[c] - BG[c]) * t);
      raw[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = new URL('../icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(name, outDir), renderPng(size));
  console.log(`wrote icons/${name}`);
}
```

- [ ] **Step 4: Generate the icons**

Run: `node scripts/make-icons.mjs`
Expected: prints `wrote icons/icon-192.png`, `wrote icons/icon-512.png`, `wrote icons/apple-touch-icon.png`. Open `icons/icon-512.png` with the Read tool and confirm an orange stopwatch on a near-black square.

- [ ] **Step 5: Write `manifest.webmanifest`**

```json
{
  "name": "Workout Timer",
  "short_name": "Workout",
  "description": "Hands-free bodyweight circuit timer",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#111214",
  "theme_color": "#111214",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 6: Write `sw.js`**

```js
// Cache-first service worker so the app works offline. Bump CACHE on every release.

const CACHE = 'workout-timer-v1';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/audio.js',
  'js/display.js',
  'js/exercises.js',
  'js/generator.js',
  'js/history.js',
  'js/settings.js',
  'js/stats.js',
  'js/storage.js',
  'js/timer.js',
  'js/workout.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => cached ?? fetch(request)));
});
```

- [ ] **Step 7: Register the service worker in `js/app.js`**

Add at the very end of `js/app.js` (after `showScreen('setup');`):

```js
// Skipped on localhost so edits show up on reload during development; add ?sw to test offline locally.
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && (!isLocal || new URLSearchParams(location.search).has('sw'))) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test`
Expected: PASS — including all four `pwa.test.js` tests.

- [ ] **Step 9: Commit**

```bash
git add scripts/make-icons.mjs icons manifest.webmanifest sw.js js/app.js tests/pwa.test.js
git commit -m "feat: make the app installable and offline-capable"
```

---

### Task 13: README and end-to-end verification

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: the whole app.
- Produces: documentation; a verified, working build.

- [ ] **Step 1: Write `README.md`**

```markdown
# Workout Timer

A hands-free, phone-first timer for a fast, whole-body bodyweight circuit. Muscle groups
rotate (push → legs → pull → core, plus optional cardio) so each group recovers while another
works. Two modes:

- **Timed** — exercises run back to back as timed intervals with no rest.
- **Reps** — the screen lists the circuit with rep targets and a countdown time cap; do as many
  rounds as you can.

Beeps and voice cues mean you never need to touch the phone once you press Start.

## Use

Open the site, pick Timed or Reps, check the settings and the generated circuit (Shuffle for a
new one), set your rings to the height shown, and press Start. Add it to your phone's home screen for offline use.

## Develop

No build step and no dependencies.

    python3 -m http.server 8000   # then open http://localhost:8000
    npm test                       # unit tests (Node 20+)
    node scripts/make-icons.mjs    # regenerate icons

The service worker is not registered on localhost (so edits show on reload); open
`http://localhost:8000/?sw` to test offline behaviour.

## Release

Bump `CACHE` in `sw.js`, commit, and push. Hosted with GitHub Pages from the repository root
(Settings → Pages → Deploy from branch → `main` / root).
```

- [ ] **Step 2: Full test run**

Run: `npm test`
Expected: all tests pass, 0 failures.

- [ ] **Step 3: Manual end-to-end check in a real browser**

Serve with `python3 -m http.server 8765` and, in a desktop browser with a phone-sized window (390×844), verify each item:

1. Setup: change Work to 20s, Changeover to 2s, Rounds to 1, Round break to 0s — total time updates; reload — settings persisted.
2. Toggle Cardio on — Exercises / round switches 8 → 10 and the circuit shows a Cardio slot between Pull and Core; toggle off — back to 8.
3. Set Rings to Waist — notice reads "Set rings to: Waist height" and only waist-height ring exercises appear; Shuffle changes the circuit.
4. Start — amber "Get ready" screen; "Next: …" speech; countdown beeps at 3-2-1; red work screen with a go tone; amber changeover between exercises.
5. Pause → "Resume", time frozen; Resume continues. Skip and Back move between phases without stale beeps. Mute silences cues.
6. Hold "Hold to end" for 1s after at least one exercise — Done screen says "Workout ended"; History shows the entry with a "Partial" badge, "This week" 1, streak 1.
7. Start again and end during "Get ready" — returns straight to Setup; History count unchanged.
8. Switch to Reps — Work/Changeover/Rounds/Round break hide, Time cap (20 min) shows, total reads `20:10`, and each circuit item shows a target. Set Time cap to 5 min and Start — the list with targets is shown under an `m:ss` countdown; "Get ready. 5 minutes, as many rounds as you can." is spoken, then a go tone. Use Skip once to jump to the end — Done shows active time and Exercises (no Rounds stat); History shows "Reps".
9. Resize to 320px wide — no horizontal scrolling on any screen, in either mode.
10. Confirm neither mode needs a tap between Start and the Done screen.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add README with usage, development and release notes"
```
