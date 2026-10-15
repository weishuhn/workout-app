import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import vm from 'node:vm';

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
    for (const file of readdirSync(new URL(`${dir}/`, root)).filter((name) => !name.startsWith('.'))) {
      assert.ok(assets.includes(`${dir}/${file}`), `${dir}/${file} missing from sw.js ASSETS`);
    }
  }
});

test('service worker caches every exercise picture', () => {
  const files = readdirSync(new URL('img/exercises/', root)).filter((name) => !name.startsWith('.') && !name.endsWith('.md'));
  assert.ok(files.length > 0);
  for (const file of files) assert.ok(assets.includes(`img/exercises/${file}`), `img/exercises/${file} missing from sw.js ASSETS`);
});

test('every cached asset exists', () => {
  for (const path of assets.filter((p) => p !== './')) assert.ok(existsSync(new URL(path, root)), path);
});

// Runs sw.js against fake service-worker globals and returns what install precached.
async function runInstall() {
  const handlers = {};
  const added = [];
  const opened = [];
  const sandbox = {
    self: { addEventListener: (type, handler) => { handlers[type] = handler; }, skipWaiting: () => Promise.resolve() },
    caches: { open: async (name) => { opened.push(name); return { addAll: async (requests) => { added.push(...requests); } }; } },
    Request: class { constructor(url, init = {}) { this.url = url; this.cache = init.cache; } },
  };
  vm.runInNewContext(sw, sandbox);
  let done;
  handlers.install({ waitUntil: (promise) => { done = promise; } });
  await done;
  return { added, opened };
}

test('install precaches every asset bypassing the HTTP cache', async () => {
  const { added, opened } = await runInstall();
  assert.equal(opened.length, 1);
  assert.match(opened[0], /^workout-timer-v\d+$/);
  assert.deepEqual(added.map((request) => request.url), assets);
  for (const request of added) assert.equal(request.cache, 'reload', request.url);
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
