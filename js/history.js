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
const plural = (value, word) => `${value} ${word}${value === 1 ? '' : 's'}`;

function historyDetail(entry) {
  if (entry.mode === 'reps') {
    const exercises = Array.isArray(entry.circuit) ? entry.circuit.length : 0;
    return `${formatDuration(entry.activeSec)} · Reps · ${plural(exercises, 'exercise')}`;
  }
  return `${formatDuration(entry.activeSec)} · ${plural(count(entry.exercisesCompleted), 'exercise')} · ${plural(count(entry.roundsCompleted), 'round')}`;
}

export const formatEntryDate = (entry) => dateFormat.format(new Date(entry.startedAt));

function historyItem(entry, onDelete) {
  const item = element('li', 'history-item', '');
  const detail = historyDetail(entry);
  item.append(
    element('span', 'history-date', formatEntryDate(entry)),
    element('span', 'history-detail', detail),
  );
  if (entry.partial) item.append(element('span', 'badge', 'Partial'));
  const remove = element('button', 'history-delete', '✕');
  remove.type = 'button';
  remove.setAttribute('aria-label', `Delete workout from ${formatEntryDate(entry)}`);
  remove.addEventListener('click', () => onDelete(entry));
  item.append(remove);
  return item;
}

// onDelete(entry) is called when a row's delete button is tapped; confirming and storage live with the caller.
export function renderHistory(log, now = new Date(), onDelete = () => {}) {
  $('stat-week').textContent = String(workoutsThisWeek(log, now));
  const streak = currentStreak(log, now);
  $('stat-streak').textContent = String(streak);
  $('stat-streak-label').textContent = streak === 1 ? 'Day streak' : 'Days streak';
  const list = $('history-list');
  $('history-clear').hidden = log.length === 0;
  if (log.length === 0) {
    list.replaceChildren(element('li', 'empty', 'No workouts yet. Your first one will show up here.'));
    return;
  }
  list.replaceChildren(...[...log].reverse().map((entry) => historyItem(entry, onDelete)));
}

export function renderDone(entry) {
  const reps = entry.mode === 'reps';
  $('done-title').textContent = entry.partial ? 'Workout ended' : 'Workout complete';
  $('done-time').textContent = formatDuration(entry.activeSec);
  $('done-rounds-stat').hidden = reps;
  setStat('done-rounds', entry.roundsCompleted ?? 0, 'Round');
  setStat('done-exercises', reps ? entry.circuit.length : entry.exercisesCompleted, 'Exercise');
}

// Writes a Done stat and its label, singular for 1.
function setStat(id, value, label) {
  $(id).textContent = String(value);
  $(id).nextElementSibling.textContent = value === 1 ? label : `${label}s`;
}
