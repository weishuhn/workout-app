import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAudio, TONES } from '../js/audio.js';

function fakes() {
  const tones = [];
  const spoken = [];
  class FakeContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; FakeContext.instances++; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createOscillator() {
      const osc = { type: '', frequency: { value: 0 }, connect() {}, start() { tones.push(osc.frequency.value); }, stop() {} };
      return osc;
    }
    createGain() {
      return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
    }
  }
  FakeContext.instances = 0;
  const speech = { speak: (u) => spoken.push(u.text), cancel() {} };
  class Utterance { constructor(text) { this.text = text; } }
  return { tones, spoken, FakeContext, speech, Utterance };
}

function setup({ muted = false } = {}) {
  const f = fakes();
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
