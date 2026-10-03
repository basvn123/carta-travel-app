// INP on the trip page (task T271, register row T300-g).
//
//   node scripts/perf/trip_inp_T271.mjs          # RUNS=3 by default
//
// T011's baseline_vitals.mjs has never measured INP on the trip page: its
// generic sweep clicks the first three visible buttons, which on this page
// are the top bar's back and share controls and the planner hand-off, and it
// records zero qualifying event entries on every run. T271 was told to keep
// that harness unchanged so its numbers stay comparable, so this one sits
// beside it and uses the same method for everything except the interaction:
// the real dist/ over a plain static server, a buffered event-timing
// observer installed before the app runs, the same three localStorage
// seeds, a cold context per run, desktop at 1440x900 and a phone at 390x844
// with 4x CPU throttle, the median of the runs per cell, and INP read as the
// worst interaction (what web-vitals falls back to under 50 interactions).
//
// The interaction is what a reader does on this page: open and close the
// first three folds (the day list, the costs, the practical notes), then pick
// a stop on the route, then scroll. Each is a genuine Playwright click, so
// each produces an event-timing entry with an interactionId.
//
// Results go to reports/trip_inp_T271.json.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = path.join(APP, 'dist');
const PORT = Number(process.env.PORT || 4233);
const BASE = `http://127.0.0.1:${PORT}`;
const RUNS = Number(process.env.RUNS || 3);
const URL_PATH = '/#itin=at-salzburg-vienna-chain-6d';   // T011's trip page

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ is missing or empty. Run `npm run build` first.');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.txt': 'text/plain',
};
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, BASE).pathname);
  let file = urlPath === '/' ? path.join(DIST, 'index.html') : path.join(DIST, urlPath.slice(1));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(urlPath)) { res.writeHead(404).end('not found'); return; }
    file = path.join(DIST, 'index.html');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const PROBE = () => {
  window.__v = { lcp: 0, events: [], cls: 0 };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__v.lcp = e.startTime; })
      .observe({ type: 'largest-contentful-paint', buffered: true });
  } catch { /* unsupported */ }
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.interactionId) window.__v.events.push({ d: e.duration, n: e.name });
    }).observe({ type: 'event', buffered: true, durationThreshold: 0 });
  } catch { /* unsupported */ }
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__v.cls += e.value; })
      .observe({ type: 'layout-shift', buffered: true });
  } catch { /* unsupported */ }
};
const SEEDS = () => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('carta.welcomeSeen.v1', '1');
  } catch { /* storage unavailable */ }
};

// Each step is recorded with the worst interaction it caused, so a slow
// cell says which control is slow.
async function step(p, done, label, fn) {
  const before = await p.evaluate(() => window.__v.events.length);
  if (!(await fn().then(() => true, () => false))) return;
  await p.waitForTimeout(600);
  const worst = await p.evaluate((i) => Math.max(0, ...window.__v.events.slice(i).map((e) => e.d)), before);
  done.push(`${label}:${worst}`);
}

async function interact(p) {
  const done = [];
  const folds = p.locator('.dsec-toggle:visible');
  const n = Math.min(await folds.count(), 3);
  for (let i = 0; i < n; i += 1) {
    const label = (await folds.nth(i).innerText().catch(() => `fold${i}`)).split('\n')[0].slice(0, 24);
    await step(p, done, `open ${label}`, () => folds.nth(i).click({ timeout: 8000 }));
    await step(p, done, `close ${label}`, () => folds.nth(i).click({ timeout: 8000 }));
  }
  const stop = p.locator('.itin-stop-hit:visible').first();
  if (await stop.count()) await step(p, done, 'stop', () => stop.click({ timeout: 8000 }));
  await p.waitForTimeout(600);
  await p.mouse.wheel(0, 1800);
  await p.waitForTimeout(1200);
  return done;
}

const DEVICES = [
  { key: 'desktop', viewport: { width: 1440, height: 900 }, cpu: 1 },
  { key: 'phone', viewport: { width: 390, height: 844 }, cpu: 4, mobile: true },
];
const med = (xs) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};

const browser = await chromium.launch({ args: ['--js-flags=--max-old-space-size=4096'] });
const rows = [];
for (const dev of DEVICES) {
  const samples = [];
  for (let run = 0; run < RUNS; run += 1) {
    const ctx = await browser.newContext({
      viewport: dev.viewport, isMobile: !!dev.mobile, hasTouch: !!dev.mobile,
      deviceScaleFactor: dev.mobile ? 3 : 1, serviceWorkers: 'block',
    });
    const page = await ctx.newPage();
    await page.addInitScript(PROBE);
    await page.addInitScript(SEEDS);
    if (dev.cpu > 1) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: dev.cpu });
    }
    let ok = true;
    let done = [];
    try {
      await page.goto(BASE + URL_PATH, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.locator('.itin-photohero').first().waitFor({ timeout: 180000 });
      await page.waitForTimeout(3000);
      done = await interact(page);
    } catch (e) {
      ok = false;
      done.push('error: ' + String(e.message).split('\n')[0].slice(0, 100));
    }
    const v = await page.evaluate(() => window.__v);
    const worst = v.events.length ? v.events.reduce((a, b) => (b.d > a.d ? b : a)) : null;
    samples.push({
      ok, lcp: Math.round(v.lcp), cls: Number(v.cls.toFixed(4)),
      inp: worst ? worst.d : null, inp_event: worst?.n || null,
      interactions: v.events.length, done,
    });
    await ctx.close();
  }
  const r = {
    device: dev.key, url: URL_PATH, runs: samples.length, ok: samples.every((s) => s.ok),
    inp_ms: med(samples.map((s) => s.inp)), lcp_ms: med(samples.map((s) => s.lcp)),
    cls: med(samples.map((s) => s.cls)), interactions: med(samples.map((s) => s.interactions)), samples,
  };
  rows.push(r);
  console.log(`${dev.key.padEnd(8)} trip-page  INP ${String(r.inp_ms ?? '-').padStart(5)} ms   `
    + `LCP ${String(r.lcp_ms).padStart(6)} ms   CLS ${String(r.cls).padStart(6)}   `
    + `interactions ${r.interactions}${r.ok ? '' : '   [INCOMPLETE]'}`);
}
await browser.close();
server.close();

const out = path.join(APP, 'reports', 'trip_inp_T271.json');
fs.writeFileSync(out, JSON.stringify({
  measured_at: new Date().toISOString(), runs_per_cell: RUNS, cpu_throttle_phone: 4,
  note: 'Local dist over a static server on loopback, the method of baseline_vitals.mjs (T011) '
    + 'with a scripted trip-page interaction: three folds opened and closed, one stop picked, a scroll.',
  rows,
}, null, 2));
console.log('\nwrote ' + path.relative(APP, out));
