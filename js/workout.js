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
// Reps-list font range (rem). The list is fitted to the largest size that shows every row without scrolling.
const LIST_FONT_MAX_REM = 2.6;
const LIST_FONT_MIN_REM = 0.85;
const LIST_FONT_STEP_REM = 0.02;
// Two columns (wrapped names, column-major order) are harder to scan, so they must win by this factor.
const TWO_COLUMN_GAIN = 1.1;

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

// Lays the reps list out in `columns` column-major columns at `rem` and reports whether every row fits.
function listFits(list, columns, rem) {
  list.style.setProperty('--list-columns', String(columns));
  list.style.setProperty('--list-rows', String(Math.ceil(list.children.length / columns)));
  list.style.setProperty('--list-font', `${rem}rem`);
  return list.scrollHeight <= list.clientHeight && list.scrollWidth <= list.clientWidth;
}

function largestFittingFont(list, columns) {
  if (listFits(list, columns, LIST_FONT_MAX_REM)) return LIST_FONT_MAX_REM;
  let low = LIST_FONT_MIN_REM;
  let high = LIST_FONT_MAX_REM;
  while (high - low > LIST_FONT_STEP_REM) {
    const mid = (low + high) / 2;
    if (listFits(list, columns, mid)) low = mid;
    else high = mid;
  }
  return low;
}

// One or two columns, whichever allows clearly larger text; below the minimum the list scrolls as a fallback.
function fitList(list) {
  if (list.children.length === 0 || list.clientHeight === 0) return;
  const one = largestFittingFont(list, 1);
  const two = one < LIST_FONT_MAX_REM ? largestFittingFont(list, 2) : 0;
  if (two >= one * TWO_COLUMN_GAIN) listFits(list, 2, two);
  else listFits(list, 1, one);
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
  const list = $('wo-list');
  list.replaceChildren(...(settings.mode === 'reps' ? circuit.map(repsItem) : []));
  const controller = new AbortController();
  const { signal } = controller;
  const on = (target, type, handler) => target.addEventListener(type, handler, { signal });
  // Refit the reps list whenever its space changes: resize/rotation, the tip, Back/Skip hiding for the AMRAP.
  const refit = () => {
    if (settings.mode === 'reps') fitList(list);
  };
  on(window, 'resize', refit);
  const tip = $('wo-tip');
  const showTip = (show) => {
    tip.hidden = !show;
    refit();
  };
  const wakeLock = createWakeLock();

  let state = startTimer(timeline, performance.now());
  let prevMs = -1;
  let finished = false;
  let frame = 0;
  let holdTimer = 0;
  let shownPhase = null;

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
    // Back/Skip hide when the AMRAP starts, which frees room for the reps list.
    if (view.kind !== shownPhase) {
      shownPhase = view.kind;
      refit();
    }
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

  // Taps and returning to the page re-arm audio that iOS may have interrupted.
  on($('wo-pause'), 'click', () => {
    audio.unlock();
    const now = performance.now();
    state = isPaused(state) ? resume(state, now) : pause(state, now);
    if (isPaused(state)) audio.stopSpeech();
    tick();
  });
  on($('wo-fwd'), 'click', () => jump(skipForward));
  on($('wo-back'), 'click', () => jump(skipBack));
  on($('wo-mute'), 'click', () => {
    audio.unlock();
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
      audio.unlock();
      wakeLock.request();
      refit();
      tick();
    }
  });

  showTip(!wakeLock.supported && !readFlag(WAKE_TIP_KEY));
  on($('wo-tip-dismiss'), 'click', () => {
    showTip(false);
    writeFlag(WAKE_TIP_KEY);
  });

  wakeLock.request();
  // rAF drives smooth updates; the interval keeps cues going when rAF is throttled.
  const interval = setInterval(tick, FALLBACK_TICK_MS);
  loop();
}
