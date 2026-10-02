/**
 * smoke.mjs, does the built app actually boot, on every route it has.
 *
 *   node scripts/ci/smoke.mjs
 *
 * Runs against dist/, not the dev server, because dist is what ships. It
 * serves dist with `vite preview` on a port of its own, loads each route in
 * headless Chromium, and asserts three things per route: no uncaught page
 * error, no failed request to a same-origin JSON file, and the boot payload
 * actually arrived.
 *
 * THE STALE DIST TRAP
 *
 * vite preview happily serves whatever is in dist, and if another session
 * already holds the default port 4173 it will bind elsewhere or, worse, the
 * page you load is a different session's older build. Two defences here: the
 * port is taken with --strictPort so a collision is a hard failure rather
 * than a silent move, and before any route is loaded the served index.html is
 * compared byte for byte with the dist/index.html on disk. If they differ,
 * something else is answering on this port and the run stops.
 *
 * THE TAB TRAP
 *
 * App.jsx routes tabs through goToTab, and the URL key is `tab`. Explore is
 * keyed 'map' though it is labelled Explore, and the absence of `tab`
 * entirely means Destinations, which is where the app opens. Clicking nav
 * items by index is a verify trap this repo has been caught by before, so
 * this script navigates by URL only and reads what is on screen, never by
 * pressing a button at a position.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.join(HERE, '..', '..');
const DIST = path.join(APP_ROOT, 'dist');

let failed = false;
const fail = (msg) => { failed = true; console.log(`  FAIL  ${msg}`); };
const pass = (msg) => console.log(`  ok    ${msg}`);

// The affiliate loader always fails without network, the weather endpoint is
// rate capped, and neither says anything about whether the app booted. Same
// exclusion list the other verify harnesses use, plus two additions found
// while writing this gate.
//
// supabase.co is the live backend. A shared trail link asks it for
// content_overrides, which 404s because that table is not deployed, and the
// app is written to shrug that off (the overrides are optional patches). A
// backend state is not a build regression, and a CI gate that goes red on it
// would be red on every machine without a deployed database. The same goes
// for any cross-origin failure: this gate asserts that OUR files load, and
// same-origin JSON is checked separately and strictly below.
const NOISE = /ERR_FAILED|ERR_INTERNET_DISCONNECTED|config is not valid|open-meteo|ERR_NAME_NOT_RESOLVED|supabase\.co/;

// What each route must show. Selectors are the ones the existing verify
// harnesses already assert on, so a class rename breaks one obvious place.
const ROUTES = [
  { label: 'Destinations (no tab key)', url: '/', body: '.places-tab' },
  { label: 'Explore (tab=map)', url: '/?tab=map', body: '.explore-tab' },
  { label: 'Destinations (tab=places)', url: '/?tab=places', body: '.places-tab' },
  { label: 'Trip planner (tab=trip)', url: '/?tab=trip', body: '.trip-planner-screen' },
  { label: 'Day planner (tab=day)', url: '/?tab=day', body: '.day-flow-screen' },
  // My trips and Account are pages laid over a tab, not tabs of their own.
  { label: 'My trips (?savedmock)', url: '/?savedmock=1', body: null },
  { label: 'a shared trail link', url: '/#trail=20050&tc=AT', body: null },
  { label: 'the terms page (?legal=terms)', url: '/?legal=terms', body: null },
  { label: 'the privacy page (?legal=privacy)', url: '/?legal=privacy', body: null },
];

// Anything the boot data drives. A route with no `body` of its own is settled
// once one of these is on screen.
const DATA_SIGNALS = '.place-card, .explore-card, .dest-card, .maplibregl-canvas, '
  + '.wiz-step, .day-flow-screen, .trip-planner-screen, .legal-modal, '
  + '.saved-trips-panel, .places-tab, .explore-tab';

const SEED = () => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
};

async function freePort(from = 4183) {
  for (let p = from; p < from + 60; p += 1) {
    const ok = await new Promise((res) => {
      const s = net.createServer();
      s.once('error', () => res(false));
      s.once('listening', () => s.close(() => res(true)));
      s.listen(p, '127.0.0.1');
    });
    if (ok) return p;
  }
  throw new Error('no free port in 4183..4242');
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/index.html is missing; run `npm run build` first.');
  process.exit(2);
}

console.log('smoke test\n');

const PORT = await freePort();
const BASE = `http://127.0.0.1:${PORT}`;
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const server = spawn(npx, ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: APP_ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32',
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });

const stop = () => { try { server.kill(); } catch { /* already gone */ } };
process.on('exit', stop);

// Wait for the port to answer rather than sleeping a fixed amount.
let up = false;
for (let i = 0; i < 60 && !up; i += 1) {
  await new Promise((r) => setTimeout(r, 500));
  try {
    const r = await fetch(`${BASE}/index.html`);
    if (r.ok) up = true;
  } catch { /* not listening yet */ }
}
if (!up) {
  stop();
  console.error(`vite preview never answered on ${PORT}:\n${serverLog}`);
  process.exit(2);
}
pass(`vite preview is serving dist on ${PORT} (strictPort)`);

// The stale-dist check: what is served has to be what was just built.
{
  const servedRes = await fetch(`${BASE}/index.html`);
  const served = (await servedRes.text()).trim();
  const onDisk = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').trim();
  if (served !== onDisk) {
    fail('the index.html being served is not dist/index.html on disk; '
      + 'another process is answering on this port, or the dist changed mid-run');
  } else {
    const assets = [...onDisk.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
    pass(`served index.html matches dist/index.html (${assets.length} hashed assets)`);
  }
}

const browser = await chromium.launch();

for (const route of ROUTES) {
  const errors = [];
  const badJson = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (NOISE.test(text)) return;
    // Chromium logs a bare "Failed to load resource: ... 404" with no URL in
    // the message text, so NOISE cannot tell a cross-origin backend 404 from
    // one of ours. The URL is on the console message's location instead, and
    // anything not served from this preview is not this gate's business: the
    // same-origin JSON listener below is the strict check.
    if (/Failed to load resource/i.test(text)) {
      const from = m.location()?.url || '';
      if (!from.startsWith(BASE)) return;
    }
    errors.push(text.slice(0, 160));
  });
  // Only same-origin JSON matters. A third-party image or an affiliate script
  // failing offline says nothing about the contract; a 404 on our own
  // app_data.json, a fare slice or a layer wire says everything.
  page.on('response', (r) => {
    const u = r.url();
    if (!u.startsWith(BASE) || !/\.json(\?|$)/.test(u)) return;
    if (r.status() >= 400) badJson.push(`${r.status()} ${u.slice(BASE.length)}`);
  });
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (u.startsWith(BASE) && /\.json(\?|$)/.test(u)) {
      badJson.push(`failed ${u.slice(BASE.length)}`);
    }
  });

  await page.addInitScript(SEED);
  try {
    await page.goto(BASE + route.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Settle on the route's own signal instead of a fixed five seconds: the
    // run ends the moment the page is ready and still waits up to 30 s on a
    // slow machine. A route that never shows its signal falls through to the
    // assertions below, which report it. Then let the network go quiet (capped,
    // since map tiles may never idle) so a late JSON 404 is still caught.
    await page.waitForSelector(route.body || DATA_SIGNALS, { state: 'visible', timeout: 30000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  } catch (e) {
    fail(`${route.label}: navigation threw ${e.message.split('\n')[0]}`);
    await page.close();
    continue;
  }

  // The boot payload landed. Not a network assertion: the question is whether
  // the app got its data, so this reads the rendered result. A destination
  // count on screen, or any element the data drives, means app_data.json
  // resolved and hydrateForOrigin ran.
  const booted = await page.evaluate((sel) => {
    const root = document.getElementById('root');
    if (!root || root.children.length === 0) return { mounted: false, signals: 0 };
    const signals = document.querySelectorAll(sel).length;
    return { mounted: true, signals, text: (root.innerText || '').length };
  }, DATA_SIGNALS);

  if (!booted.mounted) {
    fail(`${route.label}: #root never mounted`);
  } else if (booted.signals === 0) {
    fail(`${route.label}: the app mounted but rendered nothing data-driven `
      + `(${booted.text} chars of text); app_data.json probably did not load`);
  } else if (route.body) {
    const shown = await page.evaluate((sel) => {
      const e = document.querySelector(sel);
      if (!e) return false;
      const r = e.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    }, route.body);
    if (shown) pass(`${route.label}: ${route.body} on screen, ${booted.signals} data nodes`);
    else fail(`${route.label}: ${route.body} is not on screen`);
  } else {
    pass(`${route.label}: booted, ${booted.signals} data nodes`);
  }

  if (errors.length) fail(`${route.label}: ${errors.length} page error(s): ${errors[0]}`);
  if (badJson.length) {
    fail(`${route.label}: ${badJson.length} same-origin JSON request(s) failed: `
      + badJson.slice(0, 3).join(', '));
  }
  await page.close();
}

await browser.close();
stop();

console.log(failed ? '\nsmoke FAILED' : '\nsmoke passed');
process.exit(failed ? 1 : 0);
