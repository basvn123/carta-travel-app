// E9 phase A (logic wave 2, ROADMAP I5): the service worker update and its navigation store.
//  J-15  a new worker no longer reloads the page mid-task: the reload waits for the next navigation.
//  J-16  the worker stores one copy of a navigation per path, not one per query string.
// J-16: the sw.js change was applied by the owner on 2026-11-23.
// Run: node --test tests/swNavigation.test.mjs (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { reloadOnNextNavigation } from '../src/pwa/registerServiceWorker.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://www.carta-europetravel.com';

function fakePage() {
  const win = { reloads: 0, handlers: {}, location: { reload() { win.reloads += 1; } }, addEventListener(t, fn) { win.handlers[t] = fn; } };
  const doc = { visibilityState: 'visible', handlers: {}, addEventListener(t, fn) { doc.handlers[t] = fn; } };
  return { win, doc };
}

test('J-15: a new worker taking over does not reload the page by itself', () => {
  const { win, doc } = fakePage();
  const r = reloadOnNextNavigation(win, doc);
  r.arm();
  assert.equal(win.reloads, 0);
});
test('J-15: the armed reload happens once, on the next back or forward', () => {
  const { win, doc } = fakePage();
  const r = reloadOnNextNavigation(win, doc);
  win.handlers.popstate();
  assert.equal(win.reloads, 0, 'not armed: nothing');
  r.arm();
  win.handlers.popstate();
  win.handlers.popstate();
  assert.equal(win.reloads, 1);
});
test('J-15: or when the tab is left, not while it is shown', () => {
  const { win, doc } = fakePage();
  const r = reloadOnNextNavigation(win, doc);
  r.arm();
  doc.visibilityState = 'visible';
  doc.handlers.visibilitychange();
  assert.equal(win.reloads, 0);
  doc.visibilityState = 'hidden';
  doc.handlers.visibilitychange();
  assert.equal(win.reloads, 1);
});

test('J-16: two navigations that differ only by query string leave one stored copy', async () => {
  const handlers = {};
  const stored = new Map();
  const store = {
    match: async (r) => stored.get(typeof r === 'string' ? r : r.url),
    put: async (r, res) => { stored.set(typeof r === 'string' ? r : r.url, res); },
    keys: async () => [],
  };
  const self = { location: new URL(`${ORIGIN}/`), addEventListener: (t, fn) => { handlers[t] = fn; }, skipWaiting() {}, clients: { claim() {} } };
  const ctx = vm.createContext({
    self, URL, Request, Response, Headers, Promise, Set, console,
    caches: { open: async () => store, match: async () => undefined },
    fetch: async () => new Response('<html></html>', { status: 200 }),
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8'), ctx);
  for (const qs of ['?g=2', '?g=3&tab=plan', '?cf=IT']) {
    let answer;
    handlers.fetch({ request: { method: 'GET', url: `${ORIGIN}/${qs}`, mode: 'navigate', headers: new Headers() }, respondWith: (p) => { answer = p; } });
    await answer;
  }
  assert.deepEqual([...stored.keys()], [`${ORIGIN}/`]);
});
