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
