import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const sw = read('sw.js').toString();
const assetsBlock = sw.match(/const ASSETS = \[([\s\S]*?)\];/);
const assets = assetsBlock ? [...assetsBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];

test('service worker caches the page and the manifest', () => {
  for (const path of ['./', 'index.html', 'manifest.webmanifest']) assert.ok(assets.includes(path), path);
});

test('service worker caches every script, stylesheet and icon', () => {
  for (const dir of ['js', 'css', 'icons']) {
    for (const file of readdirSync(new URL(`${dir}/`, root))) {
      assert.ok(assets.includes(`${dir}/${file}`), `${dir}/${file} missing from sw.js ASSETS`);
    }
  }
});

test('every cached asset exists', () => {
  for (const path of assets.filter((p) => p !== './')) assert.ok(existsSync(new URL(path, root)), path);
});

function pngSize(path) {
  const bytes = read(path);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${path} is not a PNG`);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

test('manifest is valid and its icons exist at the declared sizes', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.length >= 2);
  for (const icon of manifest.icons) {
    const [w, h] = icon.sizes.split('x').map(Number);
    assert.deepEqual(pngSize(icon.src), [w, h], icon.src);
  }
  assert.deepEqual(pngSize('icons/apple-touch-icon.png'), [180, 180]);
});
