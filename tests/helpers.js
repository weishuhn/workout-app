// Test-only helpers. Not a test file (does not match *.test.js).

// mulberry32: small deterministic PRNG returning numbers in [0, 1).
export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Minimal exercise record for hand-built libraries.
export function ex(id, group, equipment = 'none', extra = {}) {
  return { id, name: id, group, equipment, sided: false, cue: `${id} cue`, reps: 10, ...extra };
}
