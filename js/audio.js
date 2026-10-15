// Plays cues: short Web Audio tones plus spoken text. Safe no-ops when an API is missing.

export const TONES = {
  countdown: { frequency: 660, durationMs: 120 },
  go: { frequency: 990, durationMs: 450 },
  switchSides: { frequency: 660, durationMs: 120 },
  timeLeft: { frequency: 880, durationMs: 150 },
  finished: { frequency: 990, durationMs: 700 },
};

export function createAudio({
  isMuted = () => false,
  AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext,
  speech = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
} = {}) {
  let context = null;

  // Must run inside a user gesture: iOS only allows audio and speech started from one.
  function unlock() {
    try {
      if (!context && AudioContextClass) context = new AudioContextClass();
      if (context?.state === 'suspended') context.resume();
    } catch {
      context = null;
    }
    try {
      if (speech && Utterance) speech.speak(new Utterance(''));
    } catch {
      // Speech unavailable; tones still work.
    }
  }

  function tone({ frequency, durationMs }) {
    if (!context) return;
    try {
      const start = context.currentTime;
      const end = start + durationMs / 1000;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.5, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(end + 0.02);
    } catch {
      // Ignore audio failures; the screen still shows everything.
    }
  }

  function say(text) {
    if (!speech || !Utterance) return;
    try {
      speech.cancel();
      const utterance = new Utterance(text);
      utterance.rate = 1.05;
      speech.speak(utterance);
    } catch {
      // Ignore speech failures.
    }
  }

  function play(cue) {
    if (isMuted()) return;
    if (TONES[cue.type]) tone(TONES[cue.type]);
    if (cue.text) say(cue.text);
  }

  function stopSpeech() {
    try {
      speech?.cancel();
    } catch {
      // Ignore.
    }
  }

  return { unlock, play, stopSpeech };
}
