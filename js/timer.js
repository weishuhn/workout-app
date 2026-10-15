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
