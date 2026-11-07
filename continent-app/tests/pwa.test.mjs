// T1169 (ROADMAP I7): the installable app. The worker's never-cache rules,
// its entry precache list, the page's warm list, the manifest's install
// fields and the new pwa.* strings in all six languages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadedUrls } from '../src/pwa/registerServiceWorker.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = (f) => path.join(root, 'public', f);
const ORIGIN = 'https://www.carta-europetravel.com';

// public/sw.js is a classic worker script, not a module: run it in a sandbox
// with a stub `self` and read its top-level functions back.
function loadWorker() {
  const handlers = {};
  const self = { location: new URL(ORIGIN + '/'), addEventListener: (t, fn) => { handlers[t] = fn; }, skipWaiting() {}, clients: { claim() {} } };
  const ctx = vm.createContext({ self, URL, caches: { open: async () => ({ match: async () => undefined, put: async () => {}, keys: async () => [] }), match: async () => undefined }, fetch: () => Promise.reject(new Error('no net')), Promise, Set, console });
  vm.runInContext(fs.readFileSync(pub('sw.js'), 'utf8') + '\n;globalThis.__t = { entryUrls, chunkUrls, cacheable, NEVER, CACHE_VERSION };', ctx);
  return { ...ctx.__t, handlers };
}

test('the worker never caches the API, the account or the worker itself', () => {
  const { cacheable } = loadWorker();
  for (const u of ['/api/flights?o=AMS&d=LIS&date=2026-12-01', '/api/forecast?lat=1&lon=2', '/api/ask/answer', '/functions/v1/waitlist', '/auth/callback', '/sw.js', '/activities_full.json']) {
    assert.equal(cacheable(u, ORIGIN), false, u);
  }
  assert.equal(cacheable('https://abc.supabase.co/rest/v1/trips', ORIGIN), false);
  assert.equal(cacheable('https://tile.openstreetmap.org/1/1/1.png', ORIGIN), false);
  for (const u of ['/', '/boot.json', '/assets/index-abc.js', '/trips/trip/x.json', 'https://data.carta-europetravel.com/data/dest/IT.json?v=1']) {
    assert.equal(cacheable(u, ORIGIN), true, u);
  }
});

test('a live /api request and a credentialed request get no respondWith', () => {
  const { handlers } = loadWorker();
  const call = (url, headers = {}) => {
    let responded = false;
    const request = { method: 'GET', url, mode: 'cors', headers: new Map(Object.entries(headers)) };
    request.headers.has = request.headers.has.bind(request.headers);
    handlers.fetch({ request, respondWith: (p) => { responded = true; Promise.resolve(p).catch(() => {}); } });
    return responded;
  };
  assert.equal(call(ORIGIN + '/api/flights?o=AMS'), false);
  assert.equal(call(ORIGIN + '/boot.json', { authorization: 'Bearer x' }), false);
  assert.equal(call(ORIGIN + '/boot.json'), true);
});

test('install precaches every entry file index.html names', () => {
  const { entryUrls, CACHE_VERSION } = loadWorker();
  assert.notEqual(CACHE_VERSION, 'carta-v7');
  const html = '<link rel="preload" href="/boot.json" as="fetch"><link rel="preload" href="/fonts/Figtree-latin.woff2">'
    + '<script type="module" crossorigin src="/assets/index-u.js"></script><link rel="modulepreload" crossorigin href="/assets/react-B.js">'
    + '<link rel="stylesheet" crossorigin href="/assets/index-C.css"><link rel="canonical" href="https://www.carta-europetravel.com/">';
  assert.deepEqual([...entryUrls(html)].sort(), ['/assets/index-C.css', '/assets/index-u.js', '/assets/react-B.js', '/boot.json', '/fonts/Figtree-latin.woff2']);
});

test('the warm list keeps same-origin and data-host files, never the API', () => {
  const perf = { getEntriesByType: () => [
    { name: ORIGIN + '/boot.json' }, { name: ORIGIN + '/api/flights?o=A' }, { name: 'https://x.supabase.co/auth/v1/user' },
    { name: 'https://data.carta-europetravel.com/data/dest/IT.json?v=2' }, { name: 'not a url' },
  ] };
  assert.deepEqual(loadedUrls(perf, ORIGIN), [ORIGIN + '/boot.json', 'https://data.carta-europetravel.com/data/dest/IT.json?v=2']);
  assert.deepEqual(loadedUrls(undefined, ORIGIN), []);
});

test('the manifest meets the Chromium install criteria', () => {
  const m = JSON.parse(fs.readFileSync(pub('manifest.webmanifest'), 'utf8'));
  assert.ok(m.name && m.short_name);
  assert.equal(m.start_url, '/');
  assert.ok(['standalone', 'fullscreen', 'minimal-ui'].includes(m.display));
  assert.notEqual(m.prefer_related_applications, true);
  const png = (size, purpose) => m.icons.find((i) => i.sizes === size && i.type === 'image/png' && (i.purpose || 'any').split(' ').includes(purpose));
  for (const [size, purpose] of [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']]) {
    const icon = png(size, purpose);
    assert.ok(icon, `${size} ${purpose}`);
    assert.ok(fs.existsSync(pub(icon.src.slice(1))), icon.src);
  }
});

test('the pwa.* strings exist in all six languages', () => {
  for (const lang of ['en', 'nl', 'de', 'fr', 'es', 'it']) {
    const src = fs.readFileSync(path.join(root, 'src', 'i18n', `${lang}.js`), 'utf8');
    for (const k of ['pwa.offline.saved', 'pwa.offline.empty']) assert.match(src, new RegExp(`"${k.replace(/\./g, '\\.')}":`), `${lang} ${k}`);
  }
});

test('the lazy screens are read from the entry script, not the language bundles', () => {
  const { chunkUrls } = loadWorker();
  const js = 'const m=["assets/SavedTripsPanel-B.js","assets/SavedTripsPanel-C.css"];import("./fr-X.js");const n=`/assets/TripPage-D.js`;';
  assert.deepEqual([...chunkUrls(js)].sort(), ['/assets/SavedTripsPanel-B.js', '/assets/SavedTripsPanel-C.css', '/assets/TripPage-D.js']);
});
