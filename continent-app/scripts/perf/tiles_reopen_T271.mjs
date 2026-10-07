// Carto tiles when the Explore map is closed and opened again (task T271,
// register row T061-b).
//
//   node scripts/perf/tiles_reopen_T271.mjs          # RUNS=3 by default
//
// T061's tiles_and_paint_T061.mjs counts the tiles of one session: open the
// map, five double-clicks toward a city, one pan. Its report left open what a
// visitor costs who closes the map and opens it again, which MapLibre's own
// tile cache or the browser's HTTP cache might serve for free. This script
// runs T061's session unchanged (same phone profile, same seeds, same
// classifier, same steps), then switches back to the list, opens the map a
// second time and repeats the same steps. It counts every tile request of
// each half, as T061 does, and how many of them the browser answered from
// its HTTP cache (see the timing rule below).
//
// Results go to reports/tiles_reopen_T271.json.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = path.join(APP, 'dist');
const PORT = Number(process.env.PORT || 4234);
const BASE = `http://127.0.0.1:${PORT}`;
const RUNS = Number(process.env.RUNS || 3);

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ is missing or empty. Run `npm run build` first.');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
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

const SEEDS = () => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('carta.welcomeSeen.v1', '1');
  } catch { /* storage unavailable */ }
};
// T061's classifier: only the vector tiles, not the style, sprite or glyphs.
const isTile = (url) => url.includes('cartocdn.com')
  && !url.includes('style.json') && !url.includes('/sprite') && !url.includes('/fonts/') && !url.includes('glyphs')
  && (url.endsWith('.pbf') || url.endsWith('.mvt') || url.includes('/vectortiles/'));

// T061's session: open the map, five double-clicks on the centre, one drag.
async function mapSession(page) {
  const toggle = page.locator('.xview-fab button');
  if (await toggle.count() < 2) return false;
  await toggle.nth(1).click({ timeout: 15000 }).catch(() => {});
  const opened = await page.locator('.xcontent-map .maplibregl-canvas').waitFor({ timeout: 60000 })
    .then(() => true).catch(() => false);
  if (!opened) return false;
  await page.waitForTimeout(2500);
  const box = await page.locator('.xcontent-map .maplibregl-canvas').boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    for (let i = 0; i < 5; i += 1) {
      await page.mouse.dblclick(cx, cy).catch(() => {});
      await page.waitForTimeout(900);
    }
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 100, cy - 80, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(1500);
  }
  return true;
}

const browser = await chromium.launch({ args: ['--js-flags=--max-old-space-size=4096'] });
const samples = [];
for (let run = 0; run < RUNS; run += 1) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  await page.addInitScript(SEEDS);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const half = { n: 0 };
  const counts = [{ tiles: 0, cached: 0 }, { tiles: 0, cached: 0 }];
  // MapLibre fetches tiles from a web worker, which the page's DevTools
  // Network domain does not see; Playwright's request events do (T061 counts
  // with them). A tile whose first byte came back within 5 ms of the request
  // was served by the browser's HTTP cache: Carto sends max-age=15552000, and
  // a round trip to its CDN takes tens of milliseconds.
  page.on('request', (req) => { if (isTile(req.url())) counts[half.n].tiles += 1; });
  page.on('response', (res) => {
    if (!isTile(res.url())) return;
    const t = res.request().timing();
    if (t.responseStart >= 0 && t.responseStart - Math.max(0, t.requestStart) < 5) counts[half.n].cached += 1;
  });

  await page.goto(BASE + '/?tab=map', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('.xcard').first().waitFor({ timeout: 180000 });
  await page.waitForTimeout(1500);
  const first = await mapSession(page);
  // Back to the list: the map view unmounts.
  await page.locator('.xview-fab button').nth(0).click({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  half.n = 1;
  const second = first ? await mapSession(page) : false;
  samples.push({
    run, opened: [first, second],
    first: counts[0], second: counts[1],
  });
  await ctx.close();
}
await browser.close();
server.close();

const med = (xs) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};
const summary = {
  measured_at: new Date().toISOString(),
  runs: samples.length,
  note: 'T061 session twice in one tab: open, zoom toward a city, pan; back to the list; the same again. '
    + 'Tile requests per half, and how many the browser served from its cache.',
  first_open_tiles_median: med(samples.map((s) => s.first.tiles)),
  reopen_tiles_median: med(samples.map((s) => s.second.tiles)),
  reopen_from_cache_median: med(samples.map((s) => s.second.cached)),
  samples,
};
fs.writeFileSync(path.join(APP, 'reports', 'tiles_reopen_T271.json'), JSON.stringify(summary, null, 2));
console.log(`first open: ${summary.first_open_tiles_median} tiles; reopen: ${summary.reopen_tiles_median} tile requests, `
  + `${summary.reopen_from_cache_median} served from the browser cache`);
console.log('wrote reports/tiles_reopen_T271.json');
