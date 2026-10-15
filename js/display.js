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
