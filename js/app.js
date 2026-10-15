// Boots the app: Setup screen, navigation between screens.

import { EXERCISES, GROUP_LABELS } from './exercises.js';
import { SETTING_CHOICES, perRoundOptions, applySetting } from './settings.js';
import { generateCircuit, buildTimeline, totalDuration } from './generator.js';
import { formatDuration, formatTarget, ringNotice } from './display.js';
import { loadSettings, saveSettings, loadLog, deleteLogEntry, clearLog } from './storage.js';
import { photoFrames } from './photos.js';
import { renderHistory, renderDone, formatEntryDate } from './history.js';
import { createAudio } from './audio.js';
import { runWorkout } from './workout.js';
import { openViewer } from './viewer.js';

const $ = (id) => document.getElementById(id);

const CIRCUIT_KEYS = new Set(['exercisesPerRound', 'bar', 'chair', 'rings', 'cardio']);
const NUMERIC_KEYS = new Set(['workSec', 'changeoverSec', 'exercisesPerRound', 'rounds', 'roundBreakSec', 'capMin']);
const RING_LABELS = { off: 'Off', low: 'Low', waist: 'Waist height' };
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
  const [photo] = photoFrames(exercise.id);
  if (photo) {
    const thumb = document.createElement('img');
    thumb.className = 'thumb';
    thumb.src = photo;
    thumb.alt = '';
    thumb.loading = 'lazy';
    const zoom = document.createElement('button');
    zoom.className = 'thumb-btn';
    zoom.type = 'button';
    zoom.setAttribute('aria-label', `Show larger picture of ${exercise.name}`);
    zoom.addEventListener('click', () => openViewer(exercise));
    zoom.append(thumb);
    item.prepend(zoom);
  }
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

// Re-reads the log so the list, "This week" and the streak always reflect what is stored.
function refreshHistory() {
  renderHistory(loadLog(), new Date(), (entry) => {
    if (window.confirm(`Delete this workout from ${formatEntryDate(entry)}?`)) {
      deleteLogEntry(entry.id);
      refreshHistory();
    }
  });
}

function openHistory() {
  refreshHistory();
  showScreen('history');
}

$('history-clear').addEventListener('click', () => {
  const total = loadLog().length;
  if (total > 0 && window.confirm(`Delete all ${total === 1 ? '1 workout' : `${total} workouts`}? This can't be undone.`)) {
    clearLog();
    refreshHistory();
  }
});

function openSetup() {
  renderSetup();
  showScreen('setup');
}

$('open-history').addEventListener('click', openHistory);
$('history-back').addEventListener('click', openSetup);
$('done-home').addEventListener('click', openSetup);
$('done-history').addEventListener('click', openHistory);

const audio = createAudio({ isMuted: () => app.settings.muted });

$('start').addEventListener('click', () => {
  // Mute is per workout: every workout starts with sound on.
  app.settings = applySetting(app.settings, 'muted', false);
  saveSettings(app.settings);
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

renderSetup();
showScreen('setup');

// Skipped on localhost so edits show up on reload during development; add ?sw to test offline locally.
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && (!isLocal || new URLSearchParams(location.search).has('sw'))) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
