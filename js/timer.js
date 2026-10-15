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
