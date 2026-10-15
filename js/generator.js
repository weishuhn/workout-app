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
