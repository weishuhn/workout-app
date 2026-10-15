import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { EXERCISES } from '../js/exercises.js';
import { PHOTOS, photoFrames, photoFrame, viewerFrames } from '../js/photos.js';

const root = new URL('../', import.meta.url);
const ids = EXERCISES.map((e) => e.id);
const twoFrameId = Object.keys(PHOTOS).find((id) => PHOTOS[id].length === 2);
const oneFrameId = Object.keys(PHOTOS).find((id) => PHOTOS[id].length === 1);

test('every exercise has one or two pictures', () => {
  for (const id of ids) {
    const frames = photoFrames(id);
    assert.ok(frames.length >= 1 && frames.length <= 2, `${id}: ${frames.length} frames`);
  }
});

test('every picture key is a real exercise id', () => {
  for (const id of Object.keys(PHOTOS)) assert.ok(ids.includes(id), `${id} is not an exercise`);
});

test('every picture is a relative path under img/exercises/ and exists on disk', () => {
  for (const [id, frames] of Object.entries(PHOTOS)) {
    for (const path of frames) {
      assert.match(path, /^img\/exercises\/[\w-]+\.(jpg|gif)$/, `${id}: ${path}`);
      assert.ok(existsSync(new URL(path, root)), `${path} missing`);
    }
  }
});

test('photoFrames is empty for an unknown id', () => {
  assert.deepEqual(photoFrames('nope'), []);
  assert.deepEqual(photoFrames('toString'), []);
});

test('two-frame sets alternate every second', () => {
  assert.ok(twoFrameId, 'expected at least one two-frame exercise');
  const [a, b] = PHOTOS[twoFrameId];
  assert.equal(photoFrame(twoFrameId, 0.2), a);
  assert.equal(photoFrame(twoFrameId, 1.5), b);
  assert.equal(photoFrame(twoFrameId, 2.9), a);
});

test('a one-frame set always shows its frame', () => {
  assert.ok(oneFrameId, 'expected at least one one-frame exercise');
  for (const sec of [0, 1.5, 7]) assert.equal(photoFrame(oneFrameId, sec), PHOTOS[oneFrameId][0]);
});

test('photoFrame is null for an unknown id', () => {
  assert.equal(photoFrame('nope', 3), null);
});

test('non-finite or negative elapsed time shows the first frame', () => {
  const first = PHOTOS[twoFrameId][0];
  for (const sec of [NaN, Infinity, -Infinity, -1, -2.5, undefined]) assert.equal(photoFrame(twoFrameId, sec), first, String(sec));
});

test('viewerFrames labels two-frame sets Start and End', () => {
  const [a, b] = PHOTOS[twoFrameId];
  assert.deepEqual(viewerFrames(twoFrameId), [{ src: a, label: 'Start' }, { src: b, label: 'End' }]);
});

test('viewerFrames leaves a single picture unlabelled', () => {
  assert.deepEqual(viewerFrames(oneFrameId), [{ src: PHOTOS[oneFrameId][0], label: null }]);
});

test('viewerFrames is empty for an unknown id', () => {
  assert.deepEqual(viewerFrames('nope'), []);
});
