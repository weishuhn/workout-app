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

const isEntryId = (id) => typeof id === 'string' || typeof id === 'number';

// Removes the first entry with this id (duplicates go one at a time). A missing, non-id or unknown id
// leaves the log as it was, and entries without an id are never matched.
export function deleteLogEntry(id, storage = browserStorage()) {
  const log = loadLog(storage);
  const index = isEntryId(id) ? log.findIndex((entry) => isEntryId(entry.id) && String(entry.id) === String(id)) : -1;
  if (index === -1) return log;
  const remaining = log.filter((_, i) => i !== index);
  writeJson(storage, LOG_KEY, remaining);
  return remaining;
}

export function clearLog(storage = browserStorage()) {
  writeJson(storage, LOG_KEY, []);
  return [];
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
