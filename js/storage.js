// Persists settings, the workout log and in-progress state (setup circuit, running workout) in localStorage.
// Never throws.

import { normalizeSettings } from './settings.js';
import { PREPARE_SEC, isEligible } from './generator.js';

export const SETTINGS_KEY = 'workout.settings.v1';
export const LOG_KEY = 'workout.log.v1';
export const SESSION_KEY = 'workout.session.v1';
export const CIRCUIT_KEY = 'workout.circuit.v1';
// A saved workout older than this is treated as abandoned rather than resumed.
export const SESSION_MAX_AGE_MS = 3 * 60 * 60 * 1000;

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

function removeKey(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {
    // Nothing to do; a stale value is ignored on load anyway.
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

// Exercise ids -> exercises from the library, or null if any id is unknown or the list isn't the expected length.
function exercisesFor(ids, library, length) {
  if (!Array.isArray(ids) || ids.length !== length) return null;
  const byId = new Map(library.map((e) => [e.id, e]));
  const circuit = ids.map((id) => byId.get(id));
  return circuit.every(Boolean) ? circuit : null;
}

// The circuit shown on Setup, so a reload doesn't reshuffle it.
export function saveCircuit(circuit, storage = browserStorage()) {
  return writeJson(storage, CIRCUIT_KEY, circuit.map((e) => e.id));
}

// The saved circuit, or null when there is none or it no longer fits the settings (size, equipment, ring height).
export function loadCircuit(settings, library, storage = browserStorage()) {
  const circuit = exercisesFor(readJson(storage, CIRCUIT_KEY), library, settings.exercisesPerRound);
  return circuit && circuit.every((e) => isEligible(e, settings)) ? circuit : null;
}

// Snapshot of a running workout. Elapsed time is stored with the wall-clock time it was taken at, so a
// running workout can be resumed at the right second after a reload.
export function saveSession({ circuit, settings, startedAt, elapsedMs, paused }, nowMs = Date.now(), storage = browserStorage()) {
  return writeJson(storage, SESSION_KEY, {
    circuit: circuit.map((e) => e.id),
    settings,
    startedAt: startedAt.getTime(),
    elapsedMs,
    paused,
    savedAt: nowMs,
  });
}

const isTime = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

// The workout to resume as { circuit, settings, startedAt, elapsedMs, paused }, or null when there is none,
// it is malformed, or it was saved more than SESSION_MAX_AGE_MS ago.
export function loadSession(library, nowMs = Date.now(), storage = browserStorage()) {
  const raw = readJson(storage, SESSION_KEY);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { startedAt, elapsedMs, paused, savedAt } = raw;
  if (!isTime(startedAt) || !isTime(elapsedMs) || !isTime(savedAt) || typeof paused !== 'boolean') return null;
  if (nowMs - savedAt > SESSION_MAX_AGE_MS) return null;
  const settings = normalizeSettings(raw.settings);
  const circuit = exercisesFor(raw.circuit, library, settings.exercisesPerRound);
  if (!circuit) return null;
  return {
    circuit,
    settings,
    startedAt: new Date(startedAt),
    elapsedMs: paused ? elapsedMs : elapsedMs + Math.max(0, nowMs - savedAt),
    paused,
  };
}

export function clearSession(storage = browserStorage()) {
  removeKey(storage, SESSION_KEY);
}
