// Pre-migration Core Web Vitals baseline (task T011).
//
//   node scripts/perf/baseline_vitals.mjs
//
// Measures LCP and INP on the three pages the architecture plan cares about —
// the price map, a destination page and a trip page — on desktop and on a
// simulated mid-range phone. The numbers it prints are the "before" half of
// CARTA_CLOUD_ARCHITECTURE.md section 8 step 5 ("Measure LCP before and after"),
// and are meant to be re-run unchanged at the end of P3 and again at launch.
//
// Why it is built this way:
//
//   * It serves the real `dist/` over a plain static server rather than `vite
//     preview`, because another session on this machine has been known to hold
//     the preview port and serve a stale build. Serving dist ourselves means
//     the bytes measured are provably the bytes just built.
//   * LCP is read from the browser's own `largest-contentful-paint` entries,
//     not from a load event. It is sampled at the point the page has settled,
//     which for this app means after the app_data fetch, parse and first
//     render, so the LCP element is the real hero and not a loading screen.
//   * INP has no meaning without an interaction, so the script performs a
//     scripted, page-appropriate interaction and reads the resulting
//     `event`-timing entries. Chromium only reports an INP value once a real
//     discrete interaction has happened; a synthetic dispatchEvent does not
//     count, so every interaction here is a genuine Playwright click or type.
//   * The phone pass throttles CPU 4x and uses a 390x844 viewport. 4x is the
//     same stand-in for a mid-range phone that scripts/perf/profile.mjs
//     already uses; keeping the factor identical means the two scripts'
//     numbers can be read side by side.
//   * Each measurement runs in a fresh browser context with a cold cache, so
//     the figures describe a first visit. That is the visit the image ladder
//     and the wire split are supposed to improve.
//
// Everything is written to reports/perf_baseline_T011.json next to the
// existing reports, and printed as a table.
//
// LAYER-PAGE MODE (T052-e, committed in T266). LAYERS=1 measures the beach,
// lake and mountain pages instead of the three above, with the same method,
// once per picture flag in PIC (default "off,all"; the flag is the page's
// ?pic= parameter, see src/lib/pictureFlag.js). Results go to
// reports/perf_layers_T052.json, never over the T011 file. It needs a dist
// built with VITE_IMG_BASE=http://127.0.0.1:4232/img, and three more inputs,
// all optional, which are what made the T052 numbers repeatable:
//
//   CDN_DIR=<dir>      a folder holding an img/ tree (the derive run's output).
//                      It is served on CDN_PORT (default 4232) with the real
//                      CDN's Cache-Control: public, max-age=31536000, immutable,
//                      so a flag-on page is measured against a CDN stand-in
//                      and not against whatever the network does that minute.
//   PACE=<ms>,<kbps>   delays every CDN stand-in response by <ms> and streams
//                      it at <kbps> KB/s. "150,200" is roughly slow 4G on the
//                      image origin only. PACE=0 (default) is T011's condition.
//   OFFLINE=1          answers Supabase with an empty list and the Google Fonts
//                      sheet with an empty one, and refuses every other
//                      third-party request, identically in every state. Without
//                      it a single run ranged from 0.6 to 23 s in T052, from a
//                      Supabase retry and from Wikimedia latency.
//
// Example:
//   VITE_IMG_BASE=http://127.0.0.1:4232/img npm run build
//   LAYERS=1 CDN_DIR=/path/to/derive/run OFFLINE=1 RUNS=5 //     node scripts/perf/baseline_vitals.mjs

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = path.join(APP, 'dist');
const PORT = 4231;
const BASE = `http://127.0.0.1:${PORT}`;
const RUNS = Number(process.env.RUNS || 3);
const LAYERS = process.env.LAYERS === '1';
const OFFLINE = process.env.OFFLINE === '1';
const CDN_DIR = process.env.CDN_DIR || '';
const CDN_PORT = Number(process.env.CDN_PORT || 4232);
const [PACE_MS, PACE_KBPS] = String(process.env.PACE || '0').split(',').map(Number);

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ is missing or empty. Run `npm run build` first.');
  process.exit(1);
}

// ── static server over the real dist ────────────────────────────────────────
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
  // SPA fallback. Note this is exactly the trap recorded for the reach layer:
  // a missing .json comes back as a 200 of index.html, so a data miss is
  // invisible unless you check the content type. We keep the fallback for
  // routes only and 404 anything that looks like a data file.
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

// The CDN stand-in (layer-page mode only). It sends the headers the real CDN
// sends and, with PACE set, makes it behave like a slow link, so flag off and
// flag on differ only in bytes and markup.
let cdnServer = null;
if (LAYERS && CDN_DIR) {
  cdnServer = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    const file = path.resolve(CDN_DIR, rel);
    if (!file.startsWith(path.resolve(CDN_DIR)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    const send = () => {
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'public, max-age=31536000, immutable',
        'access-control-allow-origin': '*',
      });
      if (!PACE_KBPS) { fs.createReadStream(file).pipe(res); return; }
      const buf = fs.readFileSync(file);
      const chunk = Math.max(1024, Math.floor((PACE_KBPS * 1024) / 20));
      let at = 0;
      const tick = () => {
        if (at >= buf.length) { res.end(); return; }
        res.write(buf.subarray(at, at + chunk));
        at += chunk;
        setTimeout(tick, 50);
      };
      tick();
    };
    if (PACE_MS) setTimeout(send, PACE_MS); else send();
  });
  await new Promise((r) => cdnServer.listen(CDN_PORT, '127.0.0.1', r));
}

// Third parties, answered the same way in every state (OFFLINE=1).
const isLocal = (u) => /^(https?:\/\/)?(127\.0\.0\.1|localhost)[:/]/.test(u) || u.startsWith('data:') || u.startsWith('blob:');
const offlineRoute = (route) => {
  const u = route.request().url();
  if (isLocal(u)) return route.continue();
  if (/supabase\.co/.test(u)) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  if (/fonts\.googleapis\.com/.test(u)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  return route.abort();
};

// ── the vitals probe, installed before any app code runs ────────────────────
// Buffered observers catch entries emitted before the observer was created,
// which matters for LCP because the first candidate can land very early.
const PROBE = () => {
  window.__v = { lcp: 0, lcpEl: '', events: [], cls: 0 };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        window.__v.lcp = e.startTime;
        window.__v.lcpEl = e.element
          ? (e.element.tagName + (e.element.className ? '.' + String(e.element.className).split(' ')[0] : ''))
          : (e.url ? 'img:' + String(e.url).slice(-40) : '');
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch { /* unsupported */ }
  try {
    // durationThreshold 0 so short interactions are reported too; INP is the
    // high percentile of these, and on a fast desktop they are all short.
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.interactionId) window.__v.events.push({ d: e.duration, n: e.name });
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 0 });
  } catch { /* unsupported */ }
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__v.cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  } catch { /* unsupported */ }
};

// INP is defined as roughly the 98th percentile of interaction latencies, but
// with the handful of interactions a script performs the honest summary is the
// worst one. We report max and note the count, which is what the Web Vitals
// library itself falls back to below 50 interactions.
const inpOf = (events) => (events.length ? Math.max(...events.map((e) => e.d)) : null);

const SEEDS = () => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('carta.welcomeSeen.v1', '1');
  } catch { /* storage unavailable */ }
};

// ── the three pages ─────────────────────────────────────────────────────────
// Each names how to reach it, what to wait for before reading LCP, and what a
// representative interaction is. The interactions are deliberately the ones a
// visitor actually performs first on that page.
const PAGES = [
  {
    // The price map. Note the tab is still keyed 'map' in state and deep links
    // but is labelled "Explore" in the nav (src/components/AppHeader.jsx:12).
    // Since Explore v5 the tab lands on a card grid and the map lives behind
    // the view toggle in the control bar, so LCP here is the grid's first
    // paint — which is the correct thing to measure, because it is what a
    // visitor actually sees first. Opening the map is then treated as the
    // page's characteristic interaction rather than part of the load.
    key: 'price-map',
    url: '/?tab=map',
    settle: async (p) => {
      await p.locator('.xcard').first().waitFor({ timeout: 180000 });
      await p.waitForTimeout(2500);
    },
    interact: async (p) => {
      // Typing in the search box is the first thing most visitors do, and it
      // runs the whole catalogue filter behind a 180 ms debounce.
      const s = p.locator('input[placeholder*="Search"]:visible').first();
      if (await s.count()) {
        await s.click();
        await p.waitForTimeout(300);
        await s.type('lis', { delay: 120 });
        await p.waitForTimeout(1500);
      }
      // Then the view toggle, which mounts maplibre and is by far the most
      // expensive interaction the page offers.
      const toggle = p.locator('.xbar .xview-toggle button');
      if (await toggle.count() > 1) {
        await toggle.nth(1).click({ timeout: 15000 }).catch(() => {});
        await p.locator('.xcontent-map .maplibregl-canvas').waitFor({ timeout: 60000 }).catch(() => {});
        await p.waitForTimeout(2500);
      }
    },
  },
  {
    key: 'destination-page',
    url: '/#dest=gem:valbona',
    settle: async (p) => {
      await p.locator('.destp').waitFor({ timeout: 180000 });
      await p.waitForTimeout(3000);
    },
    interact: async (p) => {
      // Opening a fold is the page's characteristic interaction: it is what
      // the accordion sections exist for.
      const folds = p.locator('.destp button, .destp summary');
      const n = await folds.count();
      for (let i = 0; i < Math.min(n, 3); i++) {
        await folds.nth(i).click({ timeout: 8000 }).catch(() => {});
        await p.waitForTimeout(700);
      }
      await p.mouse.wheel(0, 1800);
      await p.waitForTimeout(1200);
    },
  },
  {
    key: 'trip-page',
    url: '/#itin=at-salzburg-vienna-chain-6d',
    settle: async (p) => {
      await p.waitForTimeout(6000);
    },
    interact: async (p) => {
      const b = p.locator('button:visible');
      const n = await b.count();
      for (let i = 0; i < Math.min(n, 3); i++) {
        await b.nth(i).click({ timeout: 8000 }).catch(() => {});
        await p.waitForTimeout(700);
      }
      await p.mouse.wheel(0, 1800);
      await p.waitForTimeout(1200);
    },
  },
];

// The layer pages (LAYERS=1). The ids are the ones T052 measured; their
// heroes are derived. Each page is run once per picture flag in PIC.
const LAYER_PAGES = [
  { key: 'beach-page', url: '#beach=es-cala-rovira-Q24021830&bc=ES', sel: '.bpage' },
  { key: 'lake-page', url: '#lake=si-lake-bled-Q648902&lc=SI', sel: '.tpage' },
  { key: 'mountain-page', url: '#mtn=ch-jungfrau-Q15312&mc=CH', sel: '.tpage' },
].map((p) => ({
  key: p.key,
  hash: p.url,
  settle: async (page) => {
    await page.locator(p.sel).first().waitFor({ timeout: 180000 });
    await page.waitForTimeout(4000);
  },
  interact: async (page) => {
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(1200);
  },
}));
const PICS = String(process.env.PIC || 'off,all').split(',').map((x) => x.trim()).filter(Boolean);
if (LAYERS) {
  PAGES.length = 0;
  for (const pic of PICS) {
    for (const p of LAYER_PAGES) {
      PAGES.push({ ...p, key: `${p.key}:pic-${pic}`, url: `/?pic=${pic}${p.hash}` });
    }
  }
}

const DEVICES = [
  { key: 'desktop', viewport: { width: 1440, height: 900 }, cpu: 1 },
  { key: 'phone', viewport: { width: 390, height: 844 }, cpu: 4, mobile: true },
];

const browser = await chromium.launch({ args: ['--js-flags=--max-old-space-size=4096'] });
const rows = [];

// ONLY=price-map re-runs a single cell without paying for the others again.
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;

for (const dev of DEVICES) {
  for (const pg of PAGES) {
    if (ONLY && !ONLY.includes(pg.key)) continue;
    const samples = [];
    for (let run = 0; run < RUNS; run++) {
      // A fresh context each run gives a cold HTTP cache and empty storage,
      // which is the first-visit case the migration is meant to improve.
      const ctx = await browser.newContext({
        viewport: dev.viewport,
        isMobile: !!dev.mobile,
        hasTouch: !!dev.mobile,
        deviceScaleFactor: dev.mobile ? 3 : 1,
        serviceWorkers: 'block',
      });
      if (OFFLINE) await ctx.route('**/*', offlineRoute);
      const page = await ctx.newPage();
      const failures = [];
      page.on('pageerror', (e) => failures.push(e.message.split('\n')[0].slice(0, 120)));
      await page.addInitScript(PROBE);
      await page.addInitScript(SEEDS);
      if (dev.cpu > 1) {
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: dev.cpu });
      }

      let transferred = 0;
      page.on('response', async (r) => {
        try {
          const h = await r.allHeaders();
          transferred += Number(h['content-length'] || 0);
        } catch { /* response gone */ }
      });

      const t0 = Date.now();
      let ok = true;
      try {
        await page.goto(BASE + pg.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await pg.settle(page);
      } catch (e) {
        ok = false;
        failures.push('settle: ' + String(e.message).split('\n')[0].slice(0, 100));
      }
      const settled = Date.now() - t0;

      const afterLoad = await page.evaluate(() => ({ lcp: window.__v.lcp, lcpEl: window.__v.lcpEl, cls: window.__v.cls }));

      if (ok) { try { await pg.interact(page); } catch { /* interaction absent */ } }
      const after = await page.evaluate(() => ({ events: window.__v.events, cls: window.__v.cls }));

      samples.push({
        ok,
        lcp: Math.round(afterLoad.lcp),
        lcpEl: afterLoad.lcpEl,
        settled,
        cls: Number(after.cls.toFixed(4)),
        inp: inpOf(after.events),
        interactions: after.events.length,
        failures: failures.slice(0, 3),
      });
      await ctx.close();
    }

    // Median across runs. With three runs the median is the middle value and
    // is far more stable than the mean when one run hits a GC pause.
    const med = (xs) => {
      const s = xs.filter((x) => x != null).sort((a, b) => a - b);
      return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
    };
    rows.push({
      device: dev.key,
      page: pg.key,
      url: pg.url,
      runs: samples.length,
      ok: samples.every((s) => s.ok),
      lcp_ms: med(samples.map((s) => s.lcp)),
      inp_ms: med(samples.map((s) => s.inp)),
      cls: med(samples.map((s) => s.cls)),
      settled_ms: med(samples.map((s) => s.settled)),
      lcp_element: samples.find((s) => s.lcpEl)?.lcpEl || '',
      interactions: med(samples.map((s) => s.interactions)),
      samples,
    });
    const r = rows[rows.length - 1];
    console.log(
      `${dev.key.padEnd(8)} ${pg.key.padEnd(18)} LCP ${String(r.lcp_ms).padStart(6)} ms   ` +
      `INP ${String(r.inp_ms ?? '-').padStart(5)} ms   CLS ${String(r.cls).padStart(6)}   ` +
      `settled ${String(r.settled_ms).padStart(6)} ms${r.ok ? '' : '   [INCOMPLETE]'}`,
    );
  }
}

await browser.close();
server.close();
if (cdnServer) cdnServer.close();

const out = path.join(APP, 'reports', LAYERS ? 'perf_layers_T052.json' : 'perf_baseline_T011.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
// With ONLY set, keep the cells this run did not re-measure rather than
// dropping them, so a single-cell re-run repairs the file instead of
// truncating it.
if (ONLY && fs.existsSync(out)) {
  try {
    const prev = JSON.parse(fs.readFileSync(out, 'utf8'));
    const fresh = new Set(rows.map((r) => r.device + '|' + r.page));
    for (const r of prev.rows || []) {
      if (!fresh.has(r.device + '|' + r.page)) rows.push(r);
    }
    rows.sort((a, b) => (a.device.localeCompare(b.device) || a.page.localeCompare(b.page)));
  } catch { /* previous file unreadable; write what we have */ }
}
fs.writeFileSync(out, JSON.stringify({
  measured_at: new Date().toISOString(),
  runs_per_cell: RUNS,
  cpu_throttle_phone: 4,
  note: 'Local dist over a static server on loopback. Network is not throttled, '
      + 'so these LCP figures are a floor: they isolate payload and CPU cost, not RTT.',
  mode: LAYERS ? { layers: true, pic: PICS, pace: process.env.PACE || '0', cdn_standin: !!CDN_DIR, offline: OFFLINE } : { layers: false },
  rows,
}, null, 2));
console.log('\nwrote ' + path.relative(APP, out));
