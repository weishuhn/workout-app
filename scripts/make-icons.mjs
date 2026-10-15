// Generates the app icons (a stopwatch on a dark square) as PNGs with no dependencies.
// Run: node scripts/make-icons.mjs

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const BG = [17, 18, 20];
const FG = [255, 90, 54];
const SAMPLES = 4; // 4x4 supersampling for smooth edges

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// x, y in [0, 1]. Shape kept inside the central 70% so it survives maskable cropping.
function isForeground(x, y) {
  const cx = 0.5;
  const cy = 0.55;
  const r = Math.hypot(x - cx, y - cy);
  const ring = r > 0.23 && r < 0.3;
  const stem = Math.abs(x - cx) < 0.04 && y > 0.18 && y < 0.26;
  const crown = Math.abs(x - cx) < 0.09 && y > 0.14 && y < 0.19;
  const angle = (40 * Math.PI) / 180;
  const hand = distanceToSegment(x, y, cx, cy, cx + 0.15 * Math.sin(angle), cy - 0.15 * Math.cos(angle)) < 0.028;
  const hub = r < 0.045;
  return ring || stem || crown || hand || hub;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function renderPng(size) {
  const rowBytes = size * 4 + 1;
  const raw = Buffer.alloc(rowBytes * size);
  for (let py = 0; py < size; py++) {
    raw[py * rowBytes] = 0; // filter: none
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          if (isForeground((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size)) hits++;
        }
      }
      const t = hits / (SAMPLES * SAMPLES);
      const offset = py * rowBytes + 1 + px * 4;
      for (let c = 0; c < 3; c++) raw[offset + c] = Math.round(BG[c] + (FG[c] - BG[c]) * t);
      raw[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = new URL('../icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(name, outDir), renderPng(size));
  console.log(`wrote icons/${name}`);
}
