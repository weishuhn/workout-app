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

function historyDetail(entry) {
  if (entry.mode === 'reps') {
    const exercises = Array.isArray(entry.circuit) ? entry.circuit.length : 0;
    return `${formatDuration(entry.activeSec)} · Reps · ${exercises} exercises`;
  }
  return `${formatDuration(entry.activeSec)} · ${count(entry.exercisesCompleted)} exercises · ${count(entry.roundsCompleted)} rounds`;
}

function historyItem(entry) {
  const item = element('li', 'history-item', '');
  const detail = historyDetail(entry);
  item.append(
    element('span', 'history-date', dateFormat.format(new Date(entry.startedAt))),
    element('span', 'history-detail', detail),
  );
  if (entry.partial) item.append(element('span', 'badge', 'Partial'));
  return item;
}

export function renderHistory(log, now = new Date()) {
  $('stat-week').textContent = String(workoutsThisWeek(log, now));
  const streak = currentStreak(log, now);
  $('stat-streak').textContent = String(streak);
  $('stat-streak-label').textContent = streak === 1 ? 'Day streak' : 'Days streak';
  const list = $('history-list');
  if (log.length === 0) {
    list.replaceChildren(element('li', 'empty', 'No workouts yet. Your first one will show up here.'));
    return;
  }
  list.replaceChildren(...[...log].reverse().map(historyItem));
}

export function renderDone(entry) {
  const reps = entry.mode === 'reps';
  $('done-title').textContent = entry.partial ? 'Workout ended' : 'Workout complete';
  $('done-time').textContent = formatDuration(entry.activeSec);
  $('done-rounds-stat').hidden = reps;
  $('done-rounds').textContent = String(entry.roundsCompleted ?? 0);
  $('done-exercises').textContent = String(reps ? entry.circuit.length : entry.exercisesCompleted);
}
