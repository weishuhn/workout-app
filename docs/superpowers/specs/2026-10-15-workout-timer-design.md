# Workout Timer — Design

Date: 2026-10-15
Status: Approved in conversation; pending written-spec review

## Purpose

A personal, hands-free timer for a fast, intense, whole-body bodyweight workout.
Used by one person, primarily on a phone propped up a few meters away. Two workout
types:

- **Timed** (default): timed intervals that flow back-to-back with no rest; muscle
  groups rotate so each group recovers while another works.
- **Reps**: the screen lists the circuit with a rep/hold target per exercise and a
  countdown time cap; the user cycles through the list as many rounds as they can
  (AMRAP) until time runs out.

Neither type requires touching the phone between Start and the end of the workout.

### Success criteria

- Start a full workout in two taps (open app → Start) using remembered settings.
- Never need to touch the device between Start and the end of either workout type;
  audio + voice cues carry it, and both types end and log automatically.
- No muscle group appears in two consecutive work intervals, including across a
  round boundary.
- Never requires changing ring height during a workout.
- Works offline once loaded, installable to a phone home screen.
- Completed workouts are logged on the device.

### Non-goals

Accounts, sync, backend, rep counting, custom routine builder, editing individual
exercises in a generated circuit, data export (may be added later).

## Platform

**Mobile first.** Base styles target a ~375px-wide portrait phone; larger screens only
widen containers. Must work from 320px wide with no horizontal scroll.

Plain static site: HTML, CSS, vanilla JavaScript ES modules. No framework, no
build step, no runtime dependencies. Installable PWA (manifest + service worker).
Hosted on GitHub Pages from the repository root; all paths relative.

Tests run with Node's built-in runner (`node --test`). `package.json` exists only
to declare `"type": "module"` and a `test` script; it has no dependencies.

## Workout Model

### Muscle groups

`push`, `pull`, `legs`, `core`, and optional `cardio`.

Rotation order:

- Cardio off: `push → legs → pull → core` (repeat)
- Cardio on: `push → legs → pull → cardio → core` (repeat)

Push and pull are always separated by a legs/core/cardio slot. Cardio sits away
from push so burpees never directly precede push-ups.

### Exercise record

```js
{
  id: 'ring-rows',            // unique, kebab-case
  name: 'Ring rows',
  group: 'pull',              // push | pull | legs | core | cardio
  equipment: 'rings',         // none | bar | chair | rings
  ringHeight: 'waist',        // 'low' | 'waist' — present only when equipment === 'rings'
  sided: false,               // true → "Switch sides" cue at the halfway point
  cue: 'Body straight, pull rings to ribs',
  reps: 12,                   // target for reps mode — exactly one of reps / holdSec
  // holdSec: 30,             // for static holds (plank, wall sit, support hold...)
}
```

Every exercise has a default target. Displayed as "12 reps", "30s hold", with
" each side" appended for sided exercises.

`chair` covers both chairs and a sturdy table (one toggle).

### Exercise library (initial)

| Group | none | bar | chair/table | rings — low (knee) | rings — waist |
|---|---|---|---|---|---|
| push | Push-ups; Wide push-ups; Diamond push-ups; Pike push-ups | — | Decline push-ups; Chair dips | Ring push-ups | Ring dips; Ring support hold |
| pull | Superman hold; Reverse snow angels; Prone Y-T-W raises | Pull-ups; Chin-ups; Scapular pull-ups | Table rows | Steep ring rows | Ring rows; Ring face pulls; Ring Y-raises |
| legs | Squats; Jump squats; Reverse lunges; Glute bridges; Single-leg glute bridge (sided); Wall sit | — | Bulgarian split squats (sided); Step-ups (sided) | Ring Bulgarian split squat (sided); Ring hamstring curls | — |
| core | Plank; Hollow hold; Mountain climbers; Bicycle crunches; Side plank (sided) | Hanging knee raises | — | Ring fallouts; Ring knee tucks | — |
| cardio | Burpees; Jumping jacks; High knees; Skaters; Squat thrusts; Seal jacks | — | — | — | — |

Every group has at least three `none`-equipment exercises, so a circuit can always
be generated with all equipment disabled.

### Settings

| Setting | Range | Default |
|---|---|---|
| `workSec` | 20–60, step 5 | 40 |
| `changeoverSec` | 0–10 | 5 |
| `exercisesPerRound` | multiple of active group count: 4/8/12 (cardio off) or 5/10/15 (cardio on) | 8 |
| `rounds` | 1–6 | 3 |
| `roundBreakSec` | 0–120, step 15 | 60 |
| `bar` | boolean | true |
| `chair` | boolean | true |
| `rings` | `'off' \| 'low' \| 'waist'` | `'low'` |
| `cardio` | boolean | false |
| `muted` | boolean | false |
| `mode` | `'timed' \| 'reps'` | `'timed'` |
| `capMin` | 5–40, step 5 (reps mode time cap, minutes) | 20 |

`workSec`, `changeoverSec`, `rounds` and `roundBreakSec` apply to timed mode only;
`capMin` applies to reps mode only. Circuit settings (`exercisesPerRound`,
equipment, `cardio`) apply to both.

When cardio is toggled, `exercisesPerRound` maps by position: 4↔5, 8↔10, 12↔15.
A stored `exercisesPerRound` that is invalid for the stored `cardio` value falls back
to the default for that mode (8 or 10).

A fixed 10-second `prepare` phase precedes the first exercise (not configurable).

### Circuit generation — `generateCircuit(settings, library, rng)`

Pure function. `rng` is a `() => number` in `[0, 1)`; tests pass a seeded PRNG.

1. Determine rotation from `settings.cardio`.
2. Eligible pool per group = exercises in that group whose equipment is enabled:
   `none` always; `bar` if `settings.bar`; `chair` if `settings.chair`; `rings`
   only if `settings.rings !== 'off'` and `exercise.ringHeight === settings.rings`.
3. For slot `i` in `0..exercisesPerRound-1`, group = `rotation[i % rotation.length]`;
   pick uniformly at random from that group's eligible pool, excluding exercises
   already used in this circuit. If none remain, pick from the least-used
   exercises in the pool.
4. Return the ordered array of exercise records (one round). The same circuit is
   repeated for every round.

Because `exercisesPerRound` is a multiple of the rotation length and consecutive
rotation entries differ, no group is back-to-back within a round or across the
round wrap (last slot = last rotation group, first slot = `push`).

The Setup screen's **Shuffle** button regenerates with a fresh random seed.

### Timeline — `buildTimeline(circuit, settings)`

Pure function returning a flat array of phases:

```js
{ kind: 'prepare' | 'work' | 'changeover' | 'roundBreak' | 'amrap',
  duration,          // seconds, always > 0
  round,             // 1-based
  slot,              // 0-based index into circuit
  exercise,          // for work: the current exercise; otherwise: the upcoming one
}
// For non-work phases, round/slot/exercise describe the upcoming work phase.
```

Construction (reps mode): exactly two phases — `prepare` (10s) then one `amrap`
phase of `capMin * 60` seconds (round 1, slot 0, exercise = first in circuit).

Construction (timed mode):

- `prepare` (10s) → first exercise.
- Between consecutive exercises within a round: `changeover` if `changeoverSec > 0`.
- Between rounds: `roundBreak` if `roundBreakSec > 0`; otherwise `changeover` if
  `changeoverSec > 0`; otherwise nothing.
- Zero-duration phases are never emitted.

`totalDuration(timeline)` sums durations; the Setup screen displays it as `m:ss`.

## Timer — `js/timer.js`

Pure state; the clock (`now` in ms) is always passed in. No `setInterval`
arithmetic — position is derived from timestamps so it never drifts and catches up
after the tab is backgrounded.

State: `{ timeline, elapsedBeforeMs, anchorMs | null }` (`anchorMs` null ⇒ paused).

- `elapsed(state, now) = elapsedBeforeMs + (anchor ? now - anchor : 0)`
- `start(timeline, now)`, `pause(state, now)`, `resume(state, now)`
- `skipForward(state, now)` / `skipBack(state, now)`: set elapsed to the start of
  the next phase / the start of the current phase (or the previous phase if within
  the first 2s of the current one).
- `position(state, now)` → `{ index, phase, remainingSec, phaseElapsedSec, done }`.
  `done` when elapsed ≥ total.
- `workCompleted(state, now)` → count of fully elapsed `work` phases.

### Cues — `cuesBetween(timeline, prevElapsedMs, elapsedMs)`

Pure function returning cue events whose trigger time `t` satisfies
`prevElapsedMs < t ≤ elapsedMs`. Each cue therefore fires exactly once per
forward progression.

| Cue | Trigger | Output |
|---|---|---|
| `countdown` | 3s, 2s, 1s before each phase ends (only triggers at or after the phase's start) | short beep |
| `go` | start of each `work` phase | long higher tone |
| `announceNext` | start of each `prepare` / `changeover` / `roundBreak` | speech: "Next: {name}" (roundBreak: "Round {n} of {total}. Rest. Next: {name}"; prepare before `amrap`: "Get ready. {m} minutes, as many rounds as you can.") |
| `go` | start of the `amrap` phase | long higher tone |
| `timeLeft` | in `amrap`: at every 5-minute mark of remaining time below the cap, then 1 minute and 30 seconds left | tone + speech: "15 minutes left" / "1 minute left" / "30 seconds left" |
| `announceExercise` | start of a `work` phase not preceded by a non-work phase | speech: "{name}" |
| `switchSides` | halfway through a `work` phase whose exercise is `sided` | speech: "Switch sides" + short beep |
| `finished` | end of the last phase | speech: "Workout complete" |

If `elapsedMs - prevElapsedMs > 2000` (resumed from background), return no cues —
avoid a burst of stale sounds.

After a skip, the app sets its remembered previous elapsed to `newElapsed - 1`, so
only the landing phase's start cues (`go` / `announceNext` / `announceExercise`)
fire — never countdowns or cues from skipped-over phases.

## Audio — `js/audio.js`

- Beeps via Web Audio API oscillator. The `AudioContext` is created/resumed
  inside the Start button's click handler (required by iOS).
- Speech via `speechSynthesis`; if unavailable, speech cues are silently dropped
  (beeps still play).
- `muted` suppresses all output.

## Storage — `js/storage.js`

Browser `localStorage`, all access wrapped in try/catch; storage injected for tests.

- `workout.settings.v1`: settings object. On load, missing/invalid fields fall
  back to defaults individually; unparseable JSON ⇒ all defaults.
- `workout.log.v1`: array of log entries, newest last:

```js
{ id, startedAt, endedAt,           // ISO strings
  activeSec,                        // elapsed workout time excluding pauses
  plannedSec,
  roundsCompleted, exercisesCompleted,
  circuit: ['Push-ups', ...],       // names, one round
  settings: { ...snapshot },
  partial: boolean }
```

Entries also carry `mode`. In reps mode, `roundsCompleted` and
`exercisesCompleted` are `null` (not tracked), `partial` = `activeSec < plannedSec`,
and a workout ended during the prepare phase is not logged. Timed mode:

- `exercisesCompleted` = `workCompleted(...)` at end.
- `roundsCompleted` = `floor(exercisesCompleted / exercisesPerRound)`.
- `activeSec` = elapsed at end, capped at `plannedSec`.
- `partial` = `exercisesCompleted < exercisesPerRound * rounds`.

A workout ended with `exercisesCompleted === 0` is not logged. Natural completion
transitions automatically to the Done screen and saves the entry.

Stats (pure, in `js/stats.js`):

- `workoutsThisWeek(log, now)`: entries with `startedAt` in the current local week
  (Monday start).
- `currentStreak(log, now)`: consecutive local calendar days with ≥1 entry, ending
  today or yesterday; 0 otherwise. Partial workouts count.

Known risk: Safari may evict storage for sites unused for a long period; installing
to the home screen mitigates it. Export is a possible later addition.

## Screens — `index.html`, `css/styles.css`, `js/app.js`

One page; each screen is a `<section>` toggled via a `hidden` attribute.

1. **Setup** (home): a Timed / Reps mode switch; settings controls relevant to the
   mode; circuit preview (ordered list showing group + name, plus the target in
   reps mode) with **Shuffle**; total time; "Set rings to: Low/Waist height"
   notice when rings are enabled; large **Start**; link to History.
2. **Workout**: full-screen.
   - Huge current exercise name and countdown; one-line form cue; "Next: {name}";
     "Round r/R · e/E" (e = slot + 1, E = exercisesPerRound).
   - Phase colors: work = red/orange, prepare/changeover = amber, roundBreak = blue.
     Exercise name during non-work phases shows the upcoming exercise prefixed
     "Get ready" / "Next".
   - Controls: large Pause/Resume, Skip back, Skip forward, Mute toggle,
     **End** (requires press-and-hold ~1s).
   - Reps mode layout: label ("Get ready" / "As many rounds as you can"), large
     `m:ss` countdown, progress bar, and the full circuit list with targets in large
     type (scrolls only if it cannot fit). No current/next exercise.
   - Driven by `requestAnimationFrame` (plus a 250ms `setInterval` fallback when
     rAF is throttled); each tick computes position from the timer and plays
     `cuesBetween(prev, now)`.
3. **Done**: summary (active time, rounds, exercises; reps mode hides rounds and
   shows the circuit length); entry already saved; buttons
   to Setup and History.
4. **History**: workouts this week, current streak, list of entries newest first
   (date, duration, exercises, "partial" badge).

Design: dark theme, high contrast, readable at 2–3m; layout works from 320px
phone width to desktop; large touch targets (≥56px).

### Wake lock

Request `navigator.wakeLock` on Start; re-request on `visibilitychange` when
visible during a workout; release on Done/End. If unsupported, show a one-time
dismissible tip on the Workout screen to disable auto-lock.

## PWA

- `manifest.webmanifest`: name "Workout Timer", `display: standalone`, dark theme
  colors, icons 192px and 512px PNG plus `apple-touch-icon`.
- `sw.js`: cache-first for the app shell, versioned cache name (bump on each
  release), old caches deleted on activate.

## File Layout

```
index.html
css/styles.css
js/exercises.js     library data only
js/generator.js     generateCircuit, buildTimeline, totalDuration, rotationFor
js/timer.js         timer state functions + cuesBetween
js/stats.js         workoutsThisWeek, currentStreak
js/storage.js       loadSettings, saveSettings, loadLog, appendLog
js/audio.js         audio/speech output
js/app.js           UI wiring, screens, wake lock, rAF loop
manifest.webmanifest
sw.js
icons/
tests/              *.test.js for exercises, generator, timer, cues, stats, storage
package.json        { "type": "module", "scripts": { "test": "node --test tests/" } }
```

## Error Handling

- Empty eligible pool: impossible by library invariant (≥3 `none` per group);
  enforced by a library test.
- Pool smaller than slots needed: least-used repeats (never adjacent, since
  adjacent slots differ in group).
- No speech synthesis: beeps only.
- No wake lock: one-time tip.
- Corrupt storage: defaults / empty log.

## Testing

Unit (`node --test`):

- **exercises**: unique ids; valid group/equipment; `ringHeight` present iff rings;
  ≥3 `none` exercises per group.
- **generator**: rotation order with/without cardio; no adjacent same group
  including round wrap; equipment and ring-height filtering; no repeats within a
  round when pool allows; least-used fallback; determinism with seeded rng;
  timeline structure for zero changeover / zero round break; `totalDuration`.
- **timer**: elapsed with pause/resume; position at boundaries; skip forward/back;
  done detection; `workCompleted`.
- **reps mode**: timeline shape and duration; prepare announcement; `timeLeft`
  callouts for 20- and 5-minute caps; display text; log entry rules.
- **cues** (`cuesBetween` in timer.js): countdown/go/announce/switchSides/finished at correct times; each fires
  exactly once across many small ticks; >2s jump yields no cues; countdown never fires
  before a short phase's start.
- **stats**: week boundary (Monday), streak today/yesterday/broken.
- **storage**: defaults, per-field fallback, corrupt JSON, log append.

Manual: run in a desktop browser and a phone; complete a short workout
(20s work, 1 round) verifying cues, wake lock, logging, offline reload.
