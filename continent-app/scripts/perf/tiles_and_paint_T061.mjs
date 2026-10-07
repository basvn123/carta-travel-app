// Mobile first paint and Carto tiles-per-session (task T061).
//
//   node scripts/perf/tiles_and_paint_T061.mjs
//
// Two numbers CARTA_CLOUD_ARCHITECTURE.md section 5.4 and the Unit Economics
// plan both depend on and neither T011 nor any later report measured:
//
//   * First paint on the phone profile, because T011 recorded LCP but never
//     first-contentful-paint, and "first paint" is what section 5.4's basemap
//     call and the wire-split work are ultimately judged against.
//   * Vector tile requests to basemaps.cartocdn.com per Explore-map session,
//     because section 5.4 keeps Carto's hosted basemap only because it is
//     free; the day it is not, this is the number that prices the
//     alternative (self-hosting or a paid tile plan).
//
// Reuses T011's static-dist-server and phone-throttle approach
// (scripts/perf/baseline_vitals.mjs) so the two reports read side by side:
// same 390x844 viewport, same 4x CPU throttle as the stand-in for a
// mid-range phone, same cold context per run. Network is not throttled here
// either, for the same reason T011 gives: the point is to isolate payload
// and CPU cost, not round-trip time. See "What is still open" in the T061
// report for what a field measurement on a physical device would still need
// to add.
//
// The session simulated is: land on Explore (card grid), open the map view,
// let the basemap load, then pan and zoom three times each - the minimum a
// visitor does to look around before picking somewhere. Tile requests before
// that first interaction (the initial viewport) are counted separately from
// the ones the pan/zoom adds, because the two have different cost shapes:
// the first view is paid once per session no matter what, the pan/zoom count
// scales with how much a visitor explores.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = path.join(APP, 'dist');
const PORT = 4232;
const BASE = `http://127.0.0.1:${PORT}`;
const RUNS = Number(process.env.RUNS || 3);

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ is missing or empty. Run `npm run build` first.');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.pbf': 'application/x-protobuf',
  '.txt': 'text/plain', '.xml': 'application/xml',
};
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, BASE).pathname);
  let file = urlPath === '/' ? path.join(DIST, 'index.html') : path.join(DIST, urlPath.slice(1));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(urlPath)) { res.writeHead(404).end('not found'); return; }
    file = path.join(DIST, 'index.html');
  }
  res.writeHead(200, {
    'content-type': MIME[path.extname(file)] || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

// First-contentful-paint from the browser's own paint-timing entries, read
// through a buffered observer installed before any application code runs so
// an early paint cannot be missed.
const PROBE = () => {
  window.__fp = { fcp: 0 };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.name === 'first-contentful-paint') window.__fp.fcp = e.startTime;
      }
    }).observe({ type: 'paint', buffered: true });
  } catch { /* unsupported */ }
};

const SEEDS = () => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('carta.welcomeSeen.v1', '1');
  } catch { /* storage unavailable */ }
};

// Classify a Carto request by what it is, not just that it hit the host, so
// the vector tiles (the thing that would carry a bill) are countable apart
// from the style document, the sprite and the glyphs, which are each fetched
// once per session regardless of how much the visitor pans.
function classifyCarto(url) {
  if (!url.includes('cartocdn.com')) return null;
  if (url.includes('style.json')) return 'style';
  if (url.includes('/sprite')) return 'sprite';
  if (url.includes('/fonts/') || url.includes('glyphs')) return 'glyph';
  // The actual tile fetches go to tiles-{a..d}.basemaps.cartocdn.com/vectortiles/...
  // as {z}/{x}/{y}.mvt, per the style's own tiles.json - not .pbf as the vector
  // tile spec's generic name would suggest, so both extensions are matched.
  if (url.endsWith('.pbf') || url.endsWith('.mvt') || url.includes('/vectortiles/')) return 'tile';
  return 'other';
}

const browser = await chromium.launch({ args: ['--js-flags=--max-old-space-size=4096'] });
const samples = [];

for (let run = 0; run < RUNS; run++) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  await page.addInitScript(PROBE);
  await page.addInitScript(SEEDS);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const counts = { style: 0, sprite: 0, glyph: 0, tile: 0, other: 0 };
  let tilesAtInitialView = null;
  page.on('request', (req) => {
    const kind = classifyCarto(req.url());
    if (kind) counts[kind] += 1;
  });

  const t0 = Date.now();
  await page.goto(BASE + '/?tab=map', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('.xcard').first().waitFor({ timeout: 180000 });
  await page.waitForTimeout(1500);
  const fcp = await page.evaluate(() => window.__fp.fcp);
  const gridReady = Date.now() - t0;

  // Open the map view. T011 clicks the `.xbar` toggle, which is desktop-only
  // chrome; on a phone viewport that bar is not the reachable control, the
  // floating `.xview-fab` above the bottom nav is (ExploreTab.jsx:844). Using
  // the desktop selector on a 390px viewport silently never opens the map,
  // which is why this script's own first run needs its own selector rather
  // than reusing T011's unchanged.
  const toggle = page.locator('.xview-fab button');
  let opened = false;
  if (await toggle.count() > 1) {
    await toggle.nth(1).click({ timeout: 15000 }).catch(() => {});
    opened = await page.locator('.xcontent-map .maplibregl-canvas').waitFor({ timeout: 60000 })
      .then(() => true).catch(() => false);
  }

  if (opened) {
    // Let the initial viewport's tiles land before counting them separately
    // from what panning adds.
    await page.waitForTimeout(2500);
    tilesAtInitialView = counts.tile;

    const canvas = page.locator('.xcontent-map .maplibregl-canvas');
    const box = await canvas.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      // The map opens at zoom 3.7, all of Europe (ExploreMap.jsx:185), where
      // the whole continent is a handful of tiles. A drag at that zoom mostly
      // re-uses tiles already loaded around the viewport, so measuring only
      // that understates what a session actually costs. What a visitor
      // actually does is zoom from the continent toward a country and then a
      // city - map.on('click', 'clusters', ...) at ExploreMap.jsx:231 exists
      // for exactly that - and each step into a higher zoom band requests a
      // new, larger set of tiles. A double-click is the deterministic stand-in
      // for that: maplibre's built-in doubleClickZoom handler (on by default)
      // advances exactly one zoom level per click, where a synthetic wheel
      // event's step size maplibre interprets inconsistently outside a real
      // trackpad or mouse. Five double-clicks on the map centre walk from the
      // continent view to roughly a city view, then one pan at that zoom - the
      // representative "look around a destination" session this script counts.
      for (let i = 0; i < 5; i++) {
        await page.mouse.dblclick(cx, cy).catch(() => {});
        await page.waitForTimeout(900);
      }
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx - 100, cy - 80, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(1500);
    }
  }

  samples.push({
    run,
    fcp_ms: Math.round(fcp),
    grid_ready_ms: gridReady,
    map_opened: opened,
    tiles_initial_view: tilesAtInitialView,
    tiles_session_total: counts.tile,
    tiles_from_pan_zoom: opened && tilesAtInitialView != null ? counts.tile - tilesAtInitialView : null,
    style_requests: counts.style,
    sprite_requests: counts.sprite,
    glyph_requests: counts.glyph,
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
  cpu_throttle_phone: 4,
  viewport: '390x844',
  note: 'Network is not throttled and the server is on loopback, matching T011. '
      + 'FCP and tile counts here isolate payload/render cost and Carto request '
      + 'volume, not real-world RTT to basemaps.cartocdn.com.',
  fcp_ms_median: med(samples.map((s) => s.fcp_ms)),
  grid_ready_ms_median: med(samples.map((s) => s.grid_ready_ms)),
  tiles_initial_view_median: med(samples.map((s) => s.tiles_initial_view)),
  tiles_session_total_median: med(samples.map((s) => s.tiles_session_total)),
  tiles_from_pan_zoom_median: med(samples.map((s) => s.tiles_from_pan_zoom)),
  style_requests_median: med(samples.map((s) => s.style_requests)),
  sprite_requests_median: med(samples.map((s) => s.sprite_requests)),
  glyph_requests_median: med(samples.map((s) => s.glyph_requests)),
  samples,
};

const out = path.join(APP, 'reports', 'tiles_and_paint_T061.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(summary, null, 2));

console.log(`FCP (phone, median of ${samples.length}):        ${summary.fcp_ms_median} ms`);
console.log(`Grid ready (median):                 ${summary.grid_ready_ms_median} ms`);
console.log(`Tiles, initial map view (median):    ${summary.tiles_initial_view_median}`);
console.log(`Tiles, after pan/zoom (median):       +${summary.tiles_from_pan_zoom_median}`);
console.log(`Tiles, session total (median):        ${summary.tiles_session_total_median}`);
console.log(`Style/sprite/glyph requests (median): ${summary.style_requests_median}/${summary.sprite_requests_median}/${summary.glyph_requests_median}`);
console.log('\nwrote ' + path.relative(APP, out));
