// Load + interaction profiling of the browse experience at 1,570 vs 25,120
// destinations. The synthetic dataset is served via route interception; the
// repo is never touched. Variants: baseline, synthetic, synthetic + 4x CPU
// throttle (a stand-in for a mid-range phone).
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = path.join(APP, 'dist');
const SYNTH = path.join(os.tmpdir(), 'carta-perf', 'synthetic_app_data.json');
const PORT = 4174;
const BASE = `http://localhost:${PORT}`;
const require = createRequire(path.join(APP, 'package.json'));
const { chromium } = require('playwright');

// Tiny static server over the built app. When `synthMode` is on, requests for
// /app_data.json stream the 76 MB synthetic file instead. Streaming from disk
// sidesteps Playwright's route.fulfill, whose oversized protocol message is
// what killed the earlier interception attempt.
let synthMode = false;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, BASE).pathname);
  let file = urlPath === '/' ? path.join(DIST, 'index.html') : path.join(DIST, urlPath.slice(1));
  if (synthMode && urlPath === '/app_data.json') file = SYNTH;
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(PORT, resolve));

async function measure({ synthetic, throttle }) {
  const browser = await chromium.launch({ args: ['--js-flags=--max-old-space-size=4096'] });
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('crash', () => console.log('  !! page CRASHED (renderer died, likely out of memory)'));
  page.on('pageerror', (e) => console.log('  !! page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  !! console error:', m.text().slice(0, 200)); });
  await page.addInitScript(() => {
    localStorage.setItem('continent.guestMode.v1', '1');
    window.__lt = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__lt.push(e.duration);
      }).observe({ entryTypes: ['longtask'] });
    } catch { /* older engines */ }
  });
  synthMode = !!synthetic;
  if (throttle) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }

  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('.result-row').first().waitFor({ timeout: 240000 });
  const tRows = Date.now() - t0;
  await page.locator('.maplibregl-canvas').waitFor({ timeout: 120000 });
  const tMap = Date.now() - t0;
  const loadLongTasks = await page.evaluate(() => Math.round(window.__lt.reduce((a, b) => a + b, 0)));

  // Clear the first-visit welcome landing (formerly the fare notice) so
  // interactions are not blocked by the overlay.
  try { await page.getByRole('button', { name: 'Explore the map' }).click({ timeout: 5000 }); } catch { /* absent */ }
  try { await page.getByRole('button', { name: 'Got it' }).click({ timeout: 2000 }); } catch { /* absent */ }

  // Interaction 1: free-text search narrowing the whole set (180ms debounce
  // included in the raw number; reported with it subtracted).
  const search = page.locator('input[placeholder*="Search a city"]');
  await page.evaluate(() => { window.__lt.length = 0; });
  let t1 = Date.now();
  await search.fill('zzz-nothing');
  await page.locator('.results-empty').waitFor({ timeout: 60000 });
  const searchMs = Date.now() - t1 - 180;
  await search.fill('');
  await page.locator('.result-row').first().waitFor({ timeout: 60000 });

  // Interaction 2: Total -> Per person (relabels every price, rescales the
  // slider, rebuilds the map's price features).
  t1 = Date.now();
  await page.getByRole('button', { name: 'Per person' }).first().click();
  await page.locator('.result-price small').first().waitFor({ timeout: 60000 });
  const ppMs = Date.now() - t1;
  const interLongTasks = await page.evaluate(() => Math.round(window.__lt.reduce((a, b) => a + b, 0)));

  const heapMB = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null));
  const rowCount = await page.evaluate(() => document.querySelectorAll('.result-row').length);

  await browser.close();
  return { tRows, tMap, loadLongTasks, searchMs, ppMs, interLongTasks, heapMB, rowCount };
}

try {
  const only = process.argv[2] || '';
  const variants = [
    ['baseline 1,570', { synthetic: false, throttle: false }],
    ['synthetic 25,120', { synthetic: true, throttle: false }],
    ['synthetic 25,120 + 4x CPU throttle', { synthetic: true, throttle: true }],
  ].filter(([name]) => !only || name.includes(only));
  for (const [name, opts] of variants) {
    const m = await measure(opts);
    console.log(`\n== ${name} ==`);
    console.log(`  first rows visible:   ${m.tRows} ms`);
    console.log(`  map canvas up:        ${m.tMap} ms`);
    console.log(`  long tasks (load):    ${m.loadLongTasks} ms blocked`);
    console.log(`  search narrow:        ${m.searchMs} ms (debounce removed)`);
    console.log(`  total->pp toggle:     ${m.ppMs} ms`);
    console.log(`  long tasks (interact):${m.interLongTasks} ms blocked`);
    console.log(`  JS heap:              ${m.heapMB} MB, DOM rows: ${m.rowCount}`);
  }
} finally {
  server.close();
}
