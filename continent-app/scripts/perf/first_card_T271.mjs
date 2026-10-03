// Time to the first card on the default screens, with and without the rank
// tier (task T271).
//
//   node scripts/perf/first_card_T271.mjs              # RUNS=3, both arms
//
// T011's and T061's harnesses serve dist/ on loopback with no network
// throttle, which is right for comparing CPU cost but hides the thing T271
// changed: how many bytes the first paint waits for. This script measures
// that directly. It serves the same dist/ two ways in turn, A with
// /dest/_rank.json answered 404 (the app then loads every shard before its
// first paint, exactly the pre-T271 path) and B as built, and for each it
// loads the Destinations screen (/) and the Explore grid (/?tab=map) on
// T011's phone profile (390x844, 4x CPU) under a network throttle of 150 ms
// latency and 1.6 MB/s down (DevTools "Fast 4G" is 1.6 MB/s at 150 ms)
// with the browser's own compression (the static server gzips JSON).
// It records the time to the first card and the bytes the page received up
// to that moment.
//
// Results go to reports/first_card_T271.json.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = path.join(APP, 'dist');
const PORT = Number(process.env.PORT || 4235);
const BASE = `http://127.0.0.1:${PORT}`;
const RUNS = Number(process.env.RUNS || 3);
const DOWN = Number(process.env.DOWN_BPS || 1.6 * 1024 * 1024);
const LATENCY = Number(process.env.LATENCY_MS || 150);

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ is missing or empty. Run `npm run build` first.');
  process.exit(1);
}

let hideRank = false;
const gz = new Map();
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
};
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, BASE).pathname);
  if (hideRank && urlPath === '/dest/_rank.json') { res.writeHead(404).end('not found'); return; }
  let file = urlPath === '/' ? path.join(DIST, 'index.html') : path.join(DIST, urlPath.slice(1));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(urlPath)) { res.writeHead(404).end('not found'); return; }
    file = path.join(DIST, 'index.html');
  }
  const type = MIME[path.extname(file)] || 'application/octet-stream';
  const compress = /json|javascript|css|html|svg/.test(type) && /gzip/.test(req.headers['accept-encoding'] || '');
  if (!compress) {
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
    return;
  }
  if (!gz.has(file)) gz.set(file, zlib.gzipSync(fs.readFileSync(file), { level: 6 }));
  const body = gz.get(file);
  res.writeHead(200, {
    'content-type': type, 'content-encoding': 'gzip', 'content-length': body.length, 'cache-control': 'no-store',
  });
  res.end(body);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const SEEDS = () => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('carta.welcomeSeen.v1', '1');
  } catch { /* storage unavailable */ }
};
const SCREENS = [
  { key: 'destinations', url: '/', card: '.places-tab img, .places-tab [class*="card"]' },
  { key: 'explore', url: '/?tab=map', card: '.xcard' },
];
const med = (xs) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};

const browser = await chromium.launch({ args: ['--js-flags=--max-old-space-size=4096'] });
const rows = [];
for (const arm of ['A: no rank tier (pre-T271 path)', 'B: rank tier']) {
  hideRank = arm.startsWith('A');
  for (const sc of SCREENS) {
    const samples = [];
    for (let run = 0; run < RUNS; run += 1) {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, serviceWorkers: 'block',
      });
      const page = await ctx.newPage();
      await page.addInitScript(SEEDS);
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false, latency: LATENCY, downloadThroughput: DOWN, uploadThroughput: 750 * 1024,
      });
      let bytes = 0;
      let destFiles = 0;
      cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength || 0; });
      cdp.on('Network.responseReceived', (e) => {
        if (new URL(e.response.url).pathname.startsWith('/dest/')) destFiles += 1;
      });
      const t0 = Date.now();
      let ms = null;
      let at = { bytes: null, destFiles: null };
      try {
        await page.goto(BASE + sc.url, { waitUntil: 'domcontentloaded', timeout: 180000 });
        await page.locator(sc.card).first().waitFor({ state: 'visible', timeout: 240000 });
        ms = Date.now() - t0;
        at = { bytes, destFiles };   // what the first card waited for
      } catch { /* left null: the cell says INCOMPLETE */ }
      samples.push({ ms, bytes_kb: at.bytes == null ? null : Math.round(at.bytes / 1024), dest_files: at.destFiles });
      await ctx.close();
    }
    const r = {
      arm, screen: sc.key, runs: samples.length,
      first_card_ms: med(samples.map((s) => s.ms)),
      bytes_kb: med(samples.map((s) => s.bytes_kb)),
      dest_files: med(samples.map((s) => s.dest_files)),
      samples,
    };
    rows.push(r);
    console.log(`${arm.padEnd(34)} ${sc.key.padEnd(13)} first card ${String(r.first_card_ms ?? '-').padStart(6)} ms   `
      + `${String(r.bytes_kb).padStart(6)} KB on the wire   ${r.dest_files} dest files`);
  }
}
await browser.close();
server.close();
fs.writeFileSync(path.join(APP, 'reports', 'first_card_T271.json'), JSON.stringify({
  measured_at: new Date().toISOString(), runs_per_cell: RUNS, cpu_throttle: 4,
  network: { latency_ms: LATENCY, down_bytes_per_s: DOWN }, rows,
}, null, 2));
console.log('\nwrote reports/first_card_T271.json');
