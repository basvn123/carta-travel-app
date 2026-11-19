// Explore speed harness (ROADMAP G12, D10; explore-top-2 lane 1).
//
// Reruns the measurements of .work/2026-11-19-explore-top-2/audit-perf.md so a
// later lane or a judge can check a speed claim with the same method:
// a production-like fast build served with gzip, Chromium through Playwright,
// service worker blocked, Supabase stubbed, signed out, a return visit to
// ?tab=map, CPU throttled 4x (CDP), network unthrottled; phone 390x844 at DPR 3
// with touch and desktop 1440x900.
//
//   cd continent-app
//   FAST_OUT=../.fastbuild-perf node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
//   node scripts/perf_explore.mjs --build ../.fastbuild-perf [--public <dir>] [--port 5310]
//        [--sizes 390x844,1440x900] [--rate 4] [--out perf.json] [--quick]
//
// --public is the folder holding the data (default: this app's public/; from a
// sparse worktree pass the main checkout's continent-app/public). --quick skips
// the per-row settings walk and the place open, for a fast rerun.
//
// What it reports, per width:
//   load      FCP, LCP, first card, settled (no long task for 4 s), TBT,
//             long tasks after the first card (count over 200 ms, longest)
//   counts    catalogue re-prices (user-timing mark carta:reprice, App.jsx),
//             stays publishes (carta:stays-publish, lib/staysData.js), trip
//             search fare passes (carta:trip-fares, useDestinationSearch.js)
//   scroll    page, fast page and rail: frames, frames over 50 ms, p95, max
//   actions   open Settings, each settings row's change, typing (worst key),
//             tab switches: INP (Event Timing), the longest task and the time
//             until the main thread is quiet again ("done"), re-prices
// Every number depends on the machine; compare before and after on the same one.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};
const flag = (name) => args.includes(`--${name}`);

const BUILD = path.resolve(arg('build', '../.fastbuild'));
const PUBLIC = path.resolve(arg('public', process.env.CARTA_DATA_MIRROR || 'public'));
const PORT = Number(arg('port', 5310));
const SIZES = arg('sizes', '390x844,1440x900').split(',').map((s) => s.split('x').map(Number));
const RATE = Number(arg('rate', 4));
const OUT = arg('out', null);
const QUICK = flag('quick');

if (!fs.existsSync(path.join(BUILD, 'index.html'))) {
  console.error(`No build at ${BUILD} (pass --build <dir>)`);
  process.exit(2);
}

const require = createRequire(path.resolve('package.json'));
const { chromium } = require('playwright');

// ---- Static server: the build first, then the data, gzip on text ---------
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.pbf': 'application/x-protobuf', '.geojson': 'application/geo+json',
};
const gzCache = new Map();
const fileIn = (root, rel) => {
  const f = path.normalize(path.join(root, rel));
  if (!f.startsWith(path.normalize(root))) return null;
  try { return fs.statSync(f).isFile() ? f : null; } catch { return null; }
};
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = fileIn(BUILD, rel) || fileIn(PUBLIC, rel) || (path.extname(rel) ? null : fileIn(BUILD, '/index.html'));
  if (!file) { res.writeHead(404); res.end(); return; }
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Cache-Control': rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' };
  if (/text|javascript|json|svg|manifest/.test(type) && /gzip/.test(req.headers['accept-encoding'] || '')) {
    let buf = gzCache.get(file);
    if (!buf) { buf = zlib.gzipSync(fs.readFileSync(file), { level: 6 }); gzCache.set(file, buf); }
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': buf.length });
    res.end(buf);
    return;
  }
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
});
await new Promise((ok) => server.listen(PORT, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${PORT}/`;

// ---- In-page observers ----------------------------------------------------
const OBSERVE = () => {
  window.__perf = { lt: [], ev: [], loaf: [], lcp: [], cls: 0, firstCard: null };
  const P = window.__perf;
  const obs = (type, fn, extra = {}) => {
    try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true, ...extra }); } catch { /* unsupported */ }
  };
  obs('longtask', (e) => P.lt.push({ t: e.startTime, d: e.duration }));
  obs('event', (e) => P.ev.push({ t: e.startTime, d: e.duration, name: e.name, id: e.interactionId }), { durationThreshold: 16 });
  obs('long-animation-frame', (e) => P.loaf.push({
    t: e.startTime, d: e.duration,
    scripts: e.scripts.map((s) => ({ inv: s.invoker, d: Math.round(s.duration), fl: Math.round(s.forcedStyleAndLayoutDuration), fn: s.sourceFunctionName }))
      .sort((a, b) => b.d - a.d).slice(0, 3),
  }));
  obs('largest-contentful-paint', (e) => P.lcp.push({ t: e.startTime, el: e.element?.className?.toString?.().slice(0, 40) }));
  obs('layout-shift', (e) => { if (!e.hadRecentInput) P.cls += e.value; });
  // The first place card, timed when it enters the DOM, not when a poll sees it.
  const mo = new MutationObserver(() => {
    if (P.firstCard == null && document.querySelector('.hs-rcard, .xrow')) { P.firstCard = performance.now(); mo.disconnect(); }
  });
  mo.observe(document, { childList: true, subtree: true });
};

const MARKS = ['carta:reprice', 'carta:stays-publish', 'carta:trip-fares'];
const marks = (page) => page.evaluate((names) => Object.fromEntries(names.map((n) => [n.split(':')[1], performance.getEntriesByName(n).length])), MARKS);
const diff = (a, b) => Object.fromEntries(Object.keys(b).map((k) => [k, b[k] - (a[k] || 0)]));

async function waitQuiet(page, quietMs, maxMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const quiet = await page.evaluate((q) => {
      const l = window.__perf.lt.at(-1);
      return !l || performance.now() - (l.t + l.d) > q;
    }, quietMs);
    if (quiet) return Date.now() - t0;
    await page.waitForTimeout(250);
  }
  return -1;
}

async function frames(page, fn) {
  await page.evaluate(() => {
    window.__fr = []; let last = performance.now(); window.__frOn = true;
    const tick = (n) => { window.__fr.push(n - last); last = n; if (window.__frOn) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await fn();
  await page.evaluate(() => { window.__frOn = false; });
  const fr = await page.evaluate(() => window.__fr);
  const s = [...fr].sort((a, b) => a - b);
  return {
    frames: fr.length,
    over50: fr.filter((x) => x > 50).length,
    p95: Math.round(s[Math.floor(s.length * 0.95)] || 0),
    max: Math.round(s.at(-1) || 0),
  };
}

// One interaction: INP from Event Timing; the longest task and the time until
// the thread is quiet for 1 s ("done") from Long Tasks, so work a transition
// moved off the input's frame is still counted.
async function interaction(page, label, fn) {
  const before = await page.evaluate(() => [window.__perf.ev.length, window.__perf.lt.length, performance.now()]);
  const m0 = await marks(page);
  try { await fn(); } catch (e) { return { label, error: e.message.split('\n')[0] }; }
  await page.waitForTimeout(300);
  await waitQuiet(page, 1000, 30000);
  const r = await page.evaluate(([e0, l0, t0]) => {
    const P = window.__perf;
    const inter = P.ev.slice(e0).filter((e) => e.id);
    const lts = P.lt.slice(l0).filter((x) => x.t >= t0 - 5);
    const end = lts.length ? Math.max(...lts.map((x) => x.t + x.d)) : t0;
    return {
      inp: inter.length ? Math.round(Math.max(...inter.map((e) => e.d))) : 0,
      longest: Math.round(Math.max(0, ...lts.map((x) => x.d))),
      busy: Math.round(lts.reduce((s, x) => s + x.d, 0)),
      done: Math.round(end - t0),
    };
  }, before);
  return { label, ...r, ...diff(m0, await marks(page)) };
}

const results = {};
const browser = await chromium.launch();
try {
  for (const [width, height] of SIZES) {
    const phone = width < 900;
    const tag = `${width}x${height}`;
    const ctx = await browser.newContext({
      viewport: { width, height }, deviceScaleFactor: phone ? 3 : 1, isMobile: phone, hasTouch: phone, serviceWorkers: 'block',
    });
    await ctx.route(/supabase\.co\//, (r) => {
      const url = r.request().url();
      if (/\/auth\/v1\/user/.test(url)) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"no session"}' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
    // Image bytes as the network sent them: a cross-origin photo reports no
    // size to the page.
    let imgBytes = 0;
    let imgCount = 0;
    page.on('response', async (res) => {
      if (res.request().resourceType() !== 'image') return;
      imgCount += 1;
      imgBytes += Number(await res.headerValue('content-length').catch(() => 0)) || 0;
    });
    await page.addInitScript(() => {
      try {
        // A return visit: the welcome, the home page and the map guide are done.
        localStorage.setItem('continent.lang.v1', 'en');
        localStorage.setItem('continent.guestMode.v1', '1');
        localStorage.setItem('continent.homeSeen.v1', '1');
        localStorage.setItem('carta.welcomeSeen.v1', '1');
        localStorage.setItem('continent.mapGuideDismissed.v1', '1');
      } catch { /* storage off */ }
    });
    await page.addInitScript(OBSERVE);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
    const r = { errors };

    // ---- Load
    await page.goto(`${BASE}?tab=map`, { waitUntil: 'load', timeout: 180000 });
    await page.waitForSelector('.hs-rcard, .xrow', { timeout: 180000 });
    await waitQuiet(page, 4000, 150000);
    r.load = await page.evaluate(() => {
      const P = window.__perf;
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      const after = P.lt.filter((e) => e.t + e.d > (P.firstCard ?? 0));
      const tbt = (list) => Math.round(list.reduce((s, e) => s + Math.max(0, e.d - 50), 0));
      const lastLt = P.lt.at(-1);
      return {
        fcp: Math.round(fcp?.startTime || 0),
        lcp: Math.round(P.lcp.at(-1)?.t || 0),
        firstCard: Math.round(P.firstCard || 0),
        settled: Math.round(lastLt ? lastLt.t + lastLt.d : 0),
        tbt: tbt(P.lt),
        longTasks: P.lt.length,
        longest: Math.round(Math.max(0, ...P.lt.map((e) => e.d))),
        afterFirstCard: { tbt: tbt(after), over200: after.filter((e) => e.d > 200).length, longest: Math.round(Math.max(0, ...after.map((e) => e.d))) },
        cls: +P.cls.toFixed(3),
        dom: document.getElementsByTagName('*').length,
        rails: document.querySelectorAll('.xrails-rail').length,
        cards: document.querySelectorAll('.hs-rcard').length,
        imgs: document.images.length,
        imgOversize: [...document.images].filter((i) => i.complete && i.naturalWidth && i.clientWidth
          && i.naturalWidth > i.clientWidth * devicePixelRatio * 1.5).length,
      };
    });
    r.load.counts = await marks(page);
    r.load.imgFetched = imgCount;
    r.load.imgBytes = imgBytes;

    // ---- Scroll (page, fast page, a rail sideways)
    const gesture = (x, y, xd, yd, speed = 1200) => cdp.send('Input.synthesizeScrollGesture', {
      x, y, xDistance: xd, yDistance: yd, speed, gestureSourceType: phone ? 'touch' : 'mouse', repeatCount: 1,
    });
    r.scrollPage = await frames(page, async () => {
      for (let i = 0; i < 3; i += 1) await gesture(width / 2, height * 0.7, 0, -height * 0.6);
      await page.waitForTimeout(400);
      for (let i = 0; i < 2; i += 1) await gesture(width / 2, height * 0.5, 0, height * 0.6);
      await page.waitForTimeout(800);
    });
    r.scrollFast = await frames(page, async () => {
      await gesture(width / 2, height * 0.7, 0, -height * 2.5, 3000);
      await page.waitForTimeout(800);
      await gesture(width / 2, height * 0.3, 0, height * 2.5, 3000);
      await page.waitForTimeout(800);
    });
    await page.evaluate(() => { const s = [...document.querySelectorAll('.explore-tab, .places-tab')].find((x) => x.offsetWidth > 0); if (s) s.scrollTop = 0; });
    await page.waitForTimeout(800);
    const rail = await page.evaluate(() => {
      const tracks = [...document.querySelectorAll('.xrails-rail *')]
        .filter((el) => el.scrollWidth > el.clientWidth + 20 && getComputedStyle(el).overflowX !== 'visible');
      const el = tracks.find((t) => { const b = t.getBoundingClientRect(); return b.top > 0 && b.bottom < innerHeight; }) || tracks[0];
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    });
    if (rail) {
      const y = Math.max(40, Math.min(height - 40, rail.y));
      r.scrollRail = await frames(page, async () => {
        for (let i = 0; i < 3; i += 1) await gesture(rail.x, y, -width * 0.6, 0);
        await page.waitForTimeout(400);
        await gesture(rail.x, y, width * 1.5, 0, 2000);
        await page.waitForTimeout(800);
      });
    }

    // ---- Interactions
    const ints = [];
    await page.evaluate(() => { const s = [...document.querySelectorAll('.explore-tab')].find((x) => x.offsetWidth); if (s) s.scrollTop = 0; });
    await page.waitForTimeout(1500);
    const openSettings = async () => {
      await page.click(phone ? '.band-chip:not(.is-style)' : '.band-settings', { timeout: 30000 });
      await page.waitForSelector('.set-view', { timeout: 30000 });
      const back = await page.$('.set-back');
      if (back && await back.isVisible()) await back.click();
      await page.waitForSelector('.set-row', { state: 'visible', timeout: 30000 });
    };
    // Back on the settings overview, whatever a row opened.
    const toOverview = async () => {
      for (let i = 0; i < 3; i += 1) {
        if (await page.locator('.set-row').first().isVisible().catch(() => false)) return;
        const back = await page.$('.set-back');
        if (back && await back.isVisible()) await back.click().catch(() => {}); else await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
      if (!await page.locator('.set-row').first().isVisible().catch(() => false)) await openSettings().catch(() => {});
    };
    ints.push(await interaction(page, 'open settings', openSettings));
    // The rows that move a price; the style row opens the studio, a page of its own.
    const rows = QUICK ? [] : (await page.$$eval('.set-row', (els) => els.map((e) => [...e.classList].find((c) => c.startsWith('set-row-'))).filter(Boolean)))
      .filter((k) => k !== 'set-row-style');
    for (const key of rows) {
      ints.push(await interaction(page, `open ${key}`, () => page.click(`.set-row.${key}`, { timeout: 30000 })));
      const opt = await page.evaluate(() => {
        const c = [...document.querySelectorAll('.set-view [role="radio"]:not([aria-checked="true"]), .set-view .set-pick:not(.is-on), .set-view .sst-tile:not(.is-on), .set-view .set-nights-ctl button')]
          .filter((e) => e.offsetWidth && !e.disabled);
        if (!c.length) return false;
        c[0].setAttribute('data-perf-pick', '1');
        return true;
      });
      if (opt) ints.push(await interaction(page, `change ${key}`, () => page.click('[data-perf-pick="1"]', { timeout: 30000 })));
      await page.evaluate(() => document.querySelector('[data-perf-pick]')?.removeAttribute('data-perf-pick'));
      await toOverview();
      await page.waitForTimeout(300);
    }
    ints.push(await interaction(page, 'close settings', async () => {
      const done = await page.$('.set-done');
      if (done && await done.isVisible()) await done.click(); else await page.keyboard.press('Escape');
    }));
    await page.waitForTimeout(1000);
    ints.push(await interaction(page, 'focus search', () => page.click('.band-input', { timeout: 30000 })));
    const typed = [];
    for (const ch of 'florence') typed.push(await interaction(page, `type ${ch}`, () => page.keyboard.type(ch, { delay: 0 })));
    ints.push({
      label: 'typing (worst key)',
      inp: Math.max(0, ...typed.map((x) => x.inp || 0)),
      longest: Math.max(0, ...typed.map((x) => x.longest || 0)),
      done: Math.max(0, ...typed.map((x) => x.done || 0)),
      reprice: typed.reduce((s, x) => s + (x.reprice || 0), 0),
    });
    ints.push(await interaction(page, 'search Escape x2', async () => { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); }));
    const TABS = '.band-cats button, .band-cats a, [class*="cats"] [role="tab"]';
    const tabs = await page.$$eval(TABS, (els) => els.filter((e) => e.offsetWidth).map((e, i) => { e.setAttribute('data-perf-tab', String(i)); return e.textContent.trim().slice(0, 20); }));
    for (let i = 1; i < Math.min(tabs.length, 4); i += 1) {
      ints.push(await interaction(page, `tab ${tabs[i]}`, () => page.click(`[data-perf-tab="${i}"]`, { timeout: 30000 })));
    }
    if (tabs.length) {
      await page.$$eval(TABS, (els) => els.filter((e) => e.offsetWidth).forEach((e, i) => e.setAttribute('data-perf-tab', String(i))));
      ints.push(await interaction(page, `tab ${tabs[0]}`, () => page.click('[data-perf-tab="0"]', { timeout: 30000 })));
    }
    if (!QUICK) {
      let opened = false;
      ints.push(await interaction(page, 'open a place', async () => {
        for (const c of await page.$$('.hs-rcard-link')) {
          if (await c.isVisible()) { await c.click({ timeout: 30000 }); opened = true; return; }
        }
      }));
      await page.waitForTimeout(1000);
      if (opened && (await page.evaluate(() => location.hash)).startsWith('#dest=')) {
        ints.push(await interaction(page, 'back from place', () => page.goBack()));
      }
    }
    r.interactions = ints;
    results[tag] = r;
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

// ---- Report
for (const [tag, r] of Object.entries(results)) {
  const L = r.load;
  console.log(`\n== ${tag} at CPU ${RATE}x`);
  console.log(`load: FCP ${L.fcp} ms, LCP ${L.lcp} ms, first card ${L.firstCard} ms, settled ${L.settled} ms, TBT ${L.tbt} ms, longest ${L.longest} ms, DOM ${L.dom}, CLS ${L.cls}`);
  console.log(`after first card: TBT ${L.afterFirstCard.tbt} ms, tasks over 200 ms ${L.afterFirstCard.over200}, longest ${L.afterFirstCard.longest} ms`);
  console.log(`counts at settle: re-prices ${L.counts.reprice}, stays publishes ${L.counts['stays-publish']}, trip fares ${L.counts['trip-fares']}; images ${L.imgs} in the page, ${L.imgFetched} fetched (${Math.round(L.imgBytes / 1024)} KB), ${L.imgOversize} over 1.5x their slot`);
  for (const k of ['scrollPage', 'scrollFast', 'scrollRail']) {
    if (r[k]) console.log(`${k}: ${r[k].frames} frames, ${r[k].over50} over 50 ms, p95 ${r[k].p95} ms, max ${r[k].max} ms`);
  }
  for (const x of r.interactions) {
    console.log(x.error ? `  ${x.label}: ERROR ${x.error}`
      : `  ${x.label}: INP ${x.inp} ms, longest task ${x.longest} ms, done ${x.done} ms, re-prices ${x.reprice ?? 0}`);
  }
  if (r.errors.length) console.log(`page errors: ${r.errors.slice(0, 3).join(' | ')}`);
}
if (OUT) { fs.writeFileSync(OUT, JSON.stringify(results, null, 1)); console.log(`\nwritten ${OUT}`); }
