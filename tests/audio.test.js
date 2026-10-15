import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAudio, TONES } from '../js/audio.js';

function fakes({ initialState = 'suspended', resume = 'resolve' } = {}) {
  const tones = [];
  const spoken = [];
  const resumes = [];
  class FakeContext {
    constructor() { this.state = initialState; this.currentTime = 0; this.destination = {}; FakeContext.instances++; FakeContext.last = this; }
    resume() {
      resumes.push(this.state);
      if (resume === 'throw') throw new Error('resume failed');
      if (resume === 'reject') return Promise.reject(new Error('resume rejected'));
      this.state = 'running';
      return Promise.resolve();
    }
    createOscillator() {
      const osc = { type: '', frequency: { value: 0 }, connect() {}, start() { tones.push(osc.frequency.value); }, stop() {} };
      return osc;
    }
    createGain() {
      return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
    }
  }
  FakeContext.instances = 0;
  const speech = { speaking: false, pending: false, cancels: 0, speak: (u) => spoken.push(u.text), cancel() { this.cancels++; } };
  class Utterance { constructor(text) { this.text = text; } }
  return { tones, spoken, resumes, FakeContext, speech, Utterance };
}

function setup({ muted = false, ...options } = {}) {
  const f = fakes(options);
  const audio = createAudio({ isMuted: () => muted, AudioContextClass: f.FakeContext, speech: f.speech, Utterance: f.Utterance });
  return { ...f, audio };
}

test('unlock creates and resumes the audio context once and primes speech', () => {
  const { audio, FakeContext, spoken } = setup();
  audio.unlock();
  audio.unlock();
  assert.equal(FakeContext.instances, 1);
  assert.deepEqual(spoken, ['', '']);
});

test('countdown plays a short tone and says nothing', () => {
  const { audio, tones, spoken } = setup();
  audio.unlock();
  spoken.length = 0;
  audio.play({ type: 'countdown', count: 3, atMs: 0 });
  assert.deepEqual(tones, [TONES.countdown.frequency]);
  assert.deepEqual(spoken, []);
});

test('go plays the higher start tone', () => {
  const { audio, tones } = setup();
  audio.unlock();
  audio.play({ type: 'go', atMs: 0 });
  assert.deepEqual(tones, [TONES.go.frequency]);
  assert.ok(TONES.go.frequency > TONES.countdown.frequency);
});

test('announcements are spoken without a tone', () => {
  const { audio, tones, spoken } = setup();
  audio.unlock();
  spoken.length = 0;
  audio.play({ type: 'announceNext', atMs: 0, text: 'Next: Squats' });
  assert.deepEqual(tones, []);
  assert.deepEqual(spoken, ['Next: Squats']);
});

test('switch sides plays a tone and speaks', () => {
  const { audio, tones, spoken } = setup();
  audio.unlock();
  spoken.length = 0;
  audio.play({ type: 'switchSides', atMs: 0, text: 'Switch sides' });
  assert.equal(tones.length, 1);
  assert.deepEqual(spoken, ['Switch sides']);
});

test('muted plays nothing', () => {
  const { audio, tones, spoken } = setup({ muted: true });
  audio.unlock();
  spoken.length = 0;
  audio.play({ type: 'go', atMs: 0 });
  audio.play({ type: 'announceNext', atMs: 0, text: 'Next: Squats' });
  assert.deepEqual(tones, []);
  assert.deepEqual(spoken, []);
});

test('before unlock, tones are skipped but speech still works', () => {
  const { audio, tones, spoken } = setup();
  audio.play({ type: 'finished', atMs: 0, text: 'Workout complete' });
  assert.deepEqual(tones, []);
  assert.deepEqual(spoken, ['Workout complete']);
});

test('missing browser APIs never throw', () => {
  const audio = createAudio({ isMuted: () => false, AudioContextClass: undefined, speech: undefined, Utterance: undefined });
  assert.doesNotThrow(() => {
    audio.unlock();
    audio.play({ type: 'go', atMs: 0 });
    audio.play({ type: 'announceNext', atMs: 0, text: 'x' });
    audio.stopSpeech();
  });
});

test('unlock resumes a context iOS left interrupted', () => {
  const { audio, resumes, FakeContext } = setup({ initialState: 'interrupted' });
  audio.unlock();
  assert.deepEqual(resumes, ['interrupted']);
  audio.unlock();
  assert.deepEqual(resumes, ['interrupted'], 'a running context is not resumed again');
  assert.equal(FakeContext.instances, 1);
});

test('play resumes an interrupted context and still plays the tone', () => {
  const { audio, tones, resumes, FakeContext } = setup();
  audio.unlock();
  resumes.length = 0;
  // An iOS interruption (phone call, Siri) after Start.
  FakeContext.last.state = 'interrupted';
  audio.play({ type: 'go', atMs: 0 });
  assert.deepEqual(resumes, ['interrupted']);
  assert.equal(FakeContext.last.state, 'running');
  assert.deepEqual(tones, [TONES.go.frequency]);
  audio.play({ type: 'countdown', atMs: 0 });
  assert.deepEqual(resumes, ['interrupted'], 'a running context is not resumed again');
});

test('a rejected or throwing resume never throws and keeps the context', async () => {
  for (const resume of ['reject', 'throw']) {
    const { audio, tones, FakeContext } = setup({ resume });
    assert.doesNotThrow(() => audio.unlock());
    assert.doesNotThrow(() => audio.play({ type: 'countdown', atMs: 0 }));
    assert.equal(FakeContext.instances, 1, resume);
    assert.deepEqual(tones, [TONES.countdown.frequency], `${resume}: context kept, tone still scheduled`);
    audio.unlock();
    assert.equal(FakeContext.instances, 1, `${resume}: no second context`);
  }
  // Let any rejection surface; node:test fails the run on an unhandled rejection.
  await new Promise((resolve) => setImmediate(resolve));
});

test('speech is only cancelled when something is speaking or queued', () => {
  const { audio, speech, spoken } = setup();
  audio.play({ type: 'announceNext', atMs: 0, text: 'Next: Squats' });
  assert.equal(speech.cancels, 0);
  speech.speaking = true;
  audio.play({ type: 'announceNext', atMs: 0, text: 'Next: Lunges' });
  assert.equal(speech.cancels, 1);
  speech.speaking = false;
  speech.pending = true;
  audio.play({ type: 'announceNext', atMs: 0, text: 'Next: Plank' });
  assert.equal(speech.cancels, 2);
  assert.deepEqual(spoken, ['Next: Squats', 'Next: Lunges', 'Next: Plank']);
});
