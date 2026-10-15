// Runs one workout on the Workout screen: render loop, cues, controls, wake lock, logging.

import { buildTimeline, totalDuration } from './generator.js';
import {
  startTimer, elapsedMs, isPaused, pause, resume, position, skipForward, skipBack, workCompleted, cuesBetween,
} from './timer.js';
import { describePosition, formatTarget } from './display.js';
import { buildLogEntry, appendLog } from './storage.js';

const HOLD_TO_END_MS = 1000;
const FALLBACK_TICK_MS = 250;
const WAKE_TIP_KEY = 'workout.wakeTipDismissed';

const $ = (id) => document.getElementById(id);

function setText(id, text) {
  const node = $(id);
  if (node.textContent !== text) node.textContent = text;
}

function repsItem(exercise) {
  const item = document.createElement('li');
  const name = document.createElement('span');
  name.textContent = exercise.name;
  const target = document.createElement('span');
  target.className = 'target';
  target.textContent = formatTarget(exercise);
  item.append(name, target);
  return item;
}

function createWakeLock() {
  const supported = 'wakeLock' in navigator;
  let sentinel = null;
  let active = true;
  async function request() {
    if (!supported || !active || document.visibilityState !== 'visible') return;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (active) sentinel = lock;
      else lock.release().catch(() => {});
    } catch {
      sentinel = null;
    }
  }
  function release() {
    active = false;
    sentinel?.release().catch(() => {});
    sentinel = null;
  }
  return { supported, request, release };
}

function readFlag(key) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // Not persisted; the tip may show again next time.
  }
}

export function runWorkout({ circuit, settings, audio, getMuted, setMuted, onExit }) {
  const timeline = buildTimeline(circuit, settings);
  const plannedSec = totalDuration(timeline);
  const startedAt = new Date();
  const screen = $('screen-workout');
  screen.dataset.mode = settings.mode;
  $('wo-list').replaceChildren(...(settings.mode === 'reps' ? circuit.map(repsItem) : []));
  const controller = new AbortController();
  const { signal } = controller;
  const on = (target, type, handler) => target.addEventListener(type, handler, { signal });
  const wakeLock = createWakeLock();

  let state = startTimer(timeline, performance.now());
  let prevMs = -1;
  let finished = false;
  let frame = 0;
  let holdTimer = 0;

  function render(pos) {
    const view = describePosition(timeline, pos, settings);
    screen.dataset.phase = view.kind;
    screen.classList.toggle('paused', isPaused(state));
    setText('wo-progress', view.progress);
    setText('wo-label', view.label);
    setText('wo-name', view.name);
    setText('wo-cue', view.cue);
    setText('wo-time', view.time);
    setText('wo-next', view.next);
    $('wo-bar-fill').style.transform = `scaleX(${view.fraction})`;
    setText('wo-pause', isPaused(state) ? 'Resume' : 'Pause');
    setText('wo-mute', getMuted() ? 'Sound off' : 'Sound on');
    $('wo-mute').setAttribute('aria-pressed', String(getMuted()));
  }

  function tick() {
    if (finished) return;
    const now = performance.now();
    const ms = elapsedMs(state, now);
    for (const cue of cuesBetween(timeline, prevMs, ms)) audio.play(cue);
    prevMs = ms;
    const pos = position(state, now);
    render(pos);
    if (pos.done) finish();
  }

  function loop() {
    tick();
    if (!finished) frame = requestAnimationFrame(loop);
  }

  function finish() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(frame);
    clearInterval(interval);
    clearTimeout(holdTimer);
    controller.abort();
    wakeLock.release();
    const now = performance.now();
    const entry = buildLogEntry({
      startedAt,
      endedAt: new Date(),
      activeMs: elapsedMs(state, now),
      plannedSec,
      exercisesCompleted: workCompleted(state, now),
      circuit,
      settings,
    });
    if (entry) appendLog(entry);
    onExit(entry);
  }

  // After a skip, only the landing phase's start cues should play.
  function jump(skip) {
    const now = performance.now();
    state = skip(state, now);
    prevMs = elapsedMs(state, now) - 1;
    tick();
  }

  on($('wo-pause'), 'click', () => {
    const now = performance.now();
    state = isPaused(state) ? resume(state, now) : pause(state, now);
    if (isPaused(state)) audio.stopSpeech();
    tick();
  });
  on($('wo-fwd'), 'click', () => jump(skipForward));
  on($('wo-back'), 'click', () => jump(skipBack));
  on($('wo-mute'), 'click', () => {
    setMuted(!getMuted());
    if (getMuted()) audio.stopSpeech();
    tick();
  });

  const endButton = $('wo-end');
  const cancelHold = () => {
    clearTimeout(holdTimer);
    endButton.classList.remove('holding');
  };
  const startHold = (event) => {
    event.preventDefault();
    endButton.classList.add('holding');
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      cancelHold();
      audio.stopSpeech();
      finish();
    }, HOLD_TO_END_MS);
  };
  on(endButton, 'pointerdown', startHold);
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) on(endButton, type, cancelHold);
  on(endButton, 'keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) startHold(event);
  });
  on(endButton, 'keyup', cancelHold);
  on(endButton, 'contextmenu', (event) => event.preventDefault());

  on(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      wakeLock.request();
      tick();
    }
  });

  const tip = $('wo-tip');
  tip.hidden = wakeLock.supported || readFlag(WAKE_TIP_KEY);
  on($('wo-tip-dismiss'), 'click', () => {
    tip.hidden = true;
    writeFlag(WAKE_TIP_KEY);
  });

  wakeLock.request();
  // rAF drives smooth updates; the interval keeps cues going when rAF is throttled.
  const interval = setInterval(tick, FALLBACK_TICK_MS);
  loop();
}
