// The Explore map view (ROADMAP G12, map view lane 2): the map page, its
// floating controls and its pins, checked in a browser.
//
//   cd continent-app
//   CARTA_APP=$PWD FAST_OUT=../.fastbuild-m2 node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
//   CARTA_DATA_MIRROR=".../Travel App/continent-app/public" node scripts/verify_map.mjs --build ../.fastbuild-m2
//        [--port 5451] [--perf-only] [--gpu] [--rate 4] [--shots <dir>]
//
// Its own static server (the build, then the data folder), Chromium through
// Playwright, the service worker blocked, Supabase answered locally (signed
// out), English, a return visit to ?tab=map&xw=map.
//
// What it checks:
//   overlaps   at 360x640, 390x844, 820x1180 and 1440x900 every floating
//              control of the map page (search, Ask, the chip row, the List
//              pill, the zoom buttons, the heart, the credits, the tap card,
//              the sheet) has its own box: no two overlap, none leaves the
//              screen; on a phone the tabs, the header, the heart and the
//              zoom buttons are gone
//   pins       the price pins are map layers (no DOM pin carries a figure)
//              and no drawn pin sits under a floating control
//   tap card   a tap on a pin picks it (umber, its name on it), the card
//              shows above the nav and the map keeps its height; swipe down
//              puts it away
//   sheet      the List pill opens the sheet; peek, half and full snap; a
//              flick moves one stop; Map brings the map back
//   hover      desktop: a card under the pointer lifts its pin, a pin under
//              the pointer outlines its card
//   camera     a settings or filter change keeps the camera where it was
//   speed      panning at CPU 4x: frames over 50 ms (--perf-only runs only
//              this, so an older build can be measured the same way)
//   round 2    photo pins at zoom 5, 7 and 9 in Burgundy; the style chip and
//              the settings in view on the phone map (six languages, 360
//              and 390); the List pill above a picked card; All lists more
//              than In view; the sorts order the figures; a quick chip
//              filters and counts; a Filters option's count is the result;
//              the match points add up to the %; no cut text for four long
//              names in six languages at six widths (--round2-only)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};
const flag = (name) => args.includes(`--${name}`);
const BUILD = path.resolve(arg('build', '../.fastbuild-m2'));
const PUBLIC = path.resolve(arg('public', process.env.CARTA_DATA_MIRROR || 'public'));
const PORT = Number(arg('port', 5451));
const RATE = Number(arg('rate', 4));
const PERF_ONLY = flag('perf-only');
const SHOTS = arg('shots', '');
const SIZES = arg('sizes', '360x640,390x844,820x1180,1440x900').split(',').map((s) => s.split('x').map(Number));

if (!fs.existsSync(path.join(BUILD, 'index.html'))) {
  console.error(`No build at ${BUILD} (pass --build <dir>)`);
  process.exit(2);
}
const require = createRequire(path.resolve('package.json'));
const { chromium } = require('playwright');

// ---- Static server: the build first, then the data ------------------------
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.pbf': 'application/x-protobuf', '.pmtiles': 'application/octet-stream',
};
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
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((ok) => server.listen(PORT, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${PORT}/`;

const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok: !!ok, note });
// --gpu draws WebGL on the machine's GPU (headless Chromium otherwise draws
// it in software, an upper bound on frame times, audit-map.md).
const browser = await chromium.launch(flag('gpu') ? { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] } : {});

async function boot(width, height, url = '?tab=map&xw=map', lang = 'en', styleSeed = '') {
  const phone = width < 769;
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: phone ? 3 : 1, isMobile: phone, hasTouch: phone, serviceWorkers: 'block',
  });
  await ctx.route(/supabase\.co\//, (r) => {
    if (/\/auth\/v1\/user/.test(r.request().url())) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"no session"}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  // --cors-maps: the data host refuses localhost (CORS), so the map falls
  // back to CARTO; this answers the basemap's requests through Playwright
  // with the header added, to measure the Carta (Protomaps) style itself.
  if (flag('cors-maps')) {
    await ctx.route(/data\.carta-europetravel\.com\/data\/maps\//, async (r) => {
      try {
        const res = await r.fetch();
        await r.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*', 'access-control-expose-headers': '*' } });
      } catch { await r.abort(); }
    });
  }
  // Round 2's photo pins load our own copies from the CDN, which answers CORS
  // for the production origin only; the local origin gets the same header.
  await ctx.route(/cdn\.carta-europetravel\.com\//, async (r) => {
    try {
      const res = await r.fetch();
      await r.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*' } });
    } catch { await r.abort().catch(() => {}); }
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  if (styleSeed) await page.addInitScript((seed) => { try { localStorage.setItem('carta.travelStyles.v1', seed); } catch { /* storage off */ } }, styleSeed);
  await page.addInitScript((lang) => {
    try {
      localStorage.setItem('continent.lang.v1', lang);
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
      localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    } catch { /* storage off */ }
  }, lang);
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => performance.getEntriesByName('carta:map-idle').length > 0, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  return { ctx, page, errors, phone };
}

// The map instance, through the verify seam on the canvas box.
const MAP = 'document.querySelector(".xcontent-map .xmap-canvas")._cartaMap';

async function frames(page, fn) {
  await page.evaluate(() => {
    window.__fr = []; let last = performance.now(); window.__frOn = true;
    const tick = (n) => { window.__fr.push(n - last); last = n; if (window.__frOn) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await fn();
  await page.evaluate(() => { window.__frOn = false; });
  const fr = (await page.evaluate(() => window.__fr)).slice(1);
  const s = [...fr].sort((a, b) => a - b);
  return {
    frames: fr.length,
    over50: fr.filter((x) => x > 50).length,
    p50: Math.round(s[Math.floor(s.length * 0.5)] || 0),
    p95: Math.round(s[Math.floor(s.length * 0.95)] || 0),
    max: Math.round(s.at(-1) || 0),
  };
}

// A pan: four strokes across the map's middle, a finger on a phone, a mouse
// drag on a desktop, each about 0.7 s.
async function pan(page, phone) {
  const box = await page.evaluate(`(() => { const b = ${MAP}.getCanvas().getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
  // The stroke starts on bare canvas: a finger that lands on a DOM pin (the
  // old build's labels) presses the pin instead of moving the map.
  const [cx, cy] = await page.evaluate(([b]) => {
    for (const fy of [0.5, 0.4, 0.6, 0.3, 0.7]) {
      for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7]) {
        const x = b.x + b.w * fx; const y = b.y + b.h * fy;
        if (document.elementFromPoint(x, y)?.tagName === 'CANVAS') return [x, y];
      }
    }
    return [b.x + b.w / 2, b.y + b.h / 2];
  }, [box]);
  // Two strokes left, two up, so the camera ends somewhere new and a pan
  // that never happened shows as `moved` 0.
  const strokes = [[-1, 0], [-1, 0], [0, -1], [0, -1]];
  if (phone) {
    const cdp = await page.context().newCDPSession(page);
    for (const [dx, dy] of strokes) {
      const len = Math.min(box.w, box.h) * 0.3;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
      for (let i = 1; i <= 24; i += 1) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + dx * len * i / 24, y: cy + dy * len * i / 24, id: 1 }] });
        await page.waitForTimeout(28);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(250);
    }
    await cdp.detach();
  } else {
    for (const [dx, dy] of strokes) {
      const len = Math.min(box.w, box.h) * 0.3;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      for (let i = 1; i <= 24; i += 1) {
        await page.mouse.move(cx + dx * len * i / 24, cy + dy * len * i / 24);
        await page.waitForTimeout(28);
      }
      await page.mouse.up();
      await page.waitForTimeout(250);
    }
  }
}

async function speed(width, height) {
  const { ctx, page, phone } = await boot(width, height);
  // Zoom to a busy middle zoom first (Alps and north Italy), unthrottled.
  await page.evaluate(`${MAP}.jumpTo({ center: [10, 46.5], zoom: 5 })`);
  await page.waitForTimeout(2500);
  // --hide a,b (a profiling aid): layers to hide before the pan; `base`
  // hides every basemap layer, `ours` every pin layer.
  const hide = arg('hide', '');
  if (hide) {
    await page.evaluate(`(() => { const m = ${MAP}; const want = ${JSON.stringify(hide.split(','))};
      const ours = ['dest-dots', 'xcluster', 'xpin', 'xpin-best', 'xpin-hot', 'xpin-picked'];
      for (const l of m.getStyle().layers) {
        const hit = want.includes(l.id) || (want.includes('ours') && ours.includes(l.id)) || (want.includes('base') && !ours.includes(l.id));
        if (hit) m.setLayoutProperty(l.id, 'visibility', 'none');
      } })()`);
    await page.waitForTimeout(1500);
  }
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  // --loaf (a profiling aid): the long animation frames of the pan, with
  // the scripts that took them.
  if (flag('loaf')) {
    await page.evaluate(() => {
      window.__loaf = [];
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__loaf.push({
        d: Math.round(e.duration), block: Math.round(e.blockingDuration), render: Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0),
        s: e.scripts.map((x) => `${x.invoker} ${x.sourceFunctionName}@${(x.sourceURL || '').split('/').pop()} ${Math.round(x.duration)}`).slice(0, 3),
      }))).observe({ type: 'long-animation-frame' });
    });
  }
  const c0 = await page.evaluate(`${MAP}.getCenter().toArray()`);
  const out = await frames(page, () => pan(page, phone));
  const c1 = await page.evaluate(`${MAP}.getCenter().toArray()`);
  out.moved = Math.round(Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) * 100) / 100;
  out.zoom = await page.evaluate(`${MAP}.getZoom()`);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const domPins = await page.evaluate(() => document.querySelectorAll('.xmap-kpin.is-label').length);
  const basemap = await page.evaluate(`${MAP}.getContainer().dataset.basemap`);
  if (flag('loaf')) {
    const lo = await page.evaluate(() => window.__loaf);
    lo.sort((x, y) => y.d - x.d);
    console.log(`loaf ${width}x${height}: ${lo.length}`, JSON.stringify(lo.slice(0, 8), null, 0));
  }
  await ctx.close();
  return { ...out, domPins, basemap };
}

// The floating controls a traveller sees over the map, as rects.
const CONTROLS = {
  field: '.band.is-map .band-search', ask: '.band.is-map .band-ask', chips: '.band.is-map .band-strip',
  // Round 2: the third row (Filters and the quick chips).
  quick: '.band.is-map .band-quick',
  listPill: '.xmap-listpill', zoom: '.xcontent-map .maplibregl-ctrl-group', credit: '.xcontent-map .maplibregl-ctrl-attrib',
  heart: '.corner-slot--left .corner-btn', card: '.xmap-tapcard', column: '.mpp--float', nav: '.bottom-nav',
};
const rects = (page) => page.evaluate((sel) => {
  const out = {};
  for (const [k, q] of Object.entries(sel)) {
    const el = document.querySelector(q);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
    out[k] = { l: r.left, t: r.top, r: r.right, b: r.bottom };
  }
  return out;
}, CONTROLS);
const meet = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;
function overlaps(rs, w, h) {
  const bad = [];
  const ks = Object.keys(rs);
  for (let i = 0; i < ks.length; i += 1) {
    const a = rs[ks[i]];
    if (a.l < -1 || a.t < -1 || a.r > w + 1 || a.b > h + 1) bad.push(`${ks[i]} off screen`);
    for (let j = i + 1; j < ks.length; j += 1) {
      const pair = [ks[i], ks[j]].sort().join('+');
      if (meet(a, rs[ks[j]])) bad.push(pair);
    }
  }
  return bad;
}
// Drawn pills and bubbles whose box meets a floating control.
const pinsUnder = (page) => page.evaluate(`(() => {
  const m = ${MAP};
  const c = m.getCanvas().getBoundingClientRect();
  const sel = '.band.is-map .band-row, .band.is-map .band-strip, .band.is-map .band-quick, .xmap-listpill, .xmap-tapcard, .xsheet:not(.is-closed), .xcontent-map .maplibregl-ctrl-group, .xcontent-map .maplibregl-ctrl-attrib, .corner-slot--left, .xmap-quick';
  const ctl = [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
  const layers = ['xpin', 'xpin-best', 'xpin-photo', 'xcluster'].filter((l) => m.getLayer(l));
  const hits = [];
  for (const f of m.queryRenderedFeatures({ layers })) {
    // A bubble under the chrome is faded by feature state (drawn at opacity 0).
    if (f.layer.id === 'xcluster' && m.getFeatureState({ source: 'dests-c', id: f.id }).under) continue;
    const p = m.project(f.geometry.coordinates);
    const x = p.x + c.left; const y = p.y + c.top;
    if (ctl.some((r) => x > r.left && x < r.right && y > r.top && y < r.bottom)) hits.push(f.properties.fig || f.properties.point_count);
  }
  return hits;
})()`);

// The picked pin (its point and the pill's half height, 15 px) is not under
// the tap card.
const pickedClear = (page) => page.evaluate(`(() => {
  const m = ${MAP};
  const card = document.querySelector('.xmap-tapcard')?.getBoundingClientRect();
  const f = m.getLayer('xpin-picked') && m.queryRenderedFeatures({ layers: ['xpin-picked'] })[0];
  if (!card || !f) return !!card;
  const c = m.getCanvas().getBoundingClientRect();
  const p = m.project(f.geometry.coordinates);
  return p.y + c.top + 15 < card.top;
})()`);

// At rest: the map idle (its tiles in, the pins placed), then a beat longer
// than the pins' rest after a move (PIN_REST_MS, 0.6 s in ExploreMap.jsx).
const settle = (page) => page.evaluate(`new Promise((ok) => { const m = ${MAP}; const t = setTimeout(ok, 8000); m.once('idle', () => { clearTimeout(t); setTimeout(ok, 1000); }); m.triggerRepaint(); })`);

async function layoutChecks(w, h) {
  const tag = `${w}x${h}`;
  const { ctx, page, errors, phone } = await boot(w, h);
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `map-${tag}-${name}.png`) }); };
  await shot('open');
  const dom = await page.evaluate(() => ({
    domPills: document.querySelectorAll('.xmap-kpin-label, .xmap-kpin.is-label').length,
    tabs: !!document.querySelector('.band .band-fold--tabs'),
    header: [...document.querySelectorAll('.band.is-map .band-fold-in > :not(.band-row)')].some((e) => e.getBoundingClientRect().height > 0),
  }));
  check(`${tag}: no DOM price pins`, dom.domPills === 0);
  if (phone) check(`${tag}: header and tabs leave the phone map view`, !dom.tabs && !dom.header);
  const r0 = await rects(page);
  if (phone) {
    check(`${tag}: heart and zoom buttons hidden`, !r0.heart && !r0.zoom, Object.keys(r0).join(' '));
    check(`${tag}: the map fills the screen to the nav`, await page.evaluate(`${MAP}.getCanvas().getBoundingClientRect().top`) <= 1);
  } else {
    // The heart in the map's bottom-left corner, 16 px in, clear of the
    // column's cards (owner, 2026-11-20).
    const hc = await page.evaluate(`(() => { const c = ${MAP}.getCanvas().getBoundingClientRect(); const d = document.querySelector('.corner-slot--left')?.getBoundingClientRect();
      if (!d || !d.width) return 'no heart';
      const cards = [...document.querySelectorAll('.mpp .xrow')].map((e) => e.getBoundingClientRect());
      const overCard = cards.some((r) => Math.min(r.right, d.right) - Math.max(r.left, d.left) > 1 && Math.min(r.bottom, d.bottom) - Math.max(r.top, d.top) > 1);
      const foot = Math.min(c.bottom, innerHeight);
      return [Math.round(d.left - c.left), Math.round(foot - d.bottom), overCard ? 'over a card' : ''].join(' ').trim(); })()`);
    check(`${tag}: the heart sits 16 px inside the map's bottom left`, /^1[5-7] 1[5-7]$/.test(hc), hc);
    check(`${tag}: zoom 40 px bottom right`, r0.zoom && Math.round(r0.zoom.r - r0.zoom.l) === 40 && r0.zoom.b > h - 120, JSON.stringify(r0.zoom));
  }
  check(`${tag}: no floating control overlaps another (open)`, overlaps(r0, w, h).length === 0, overlaps(r0, w, h).join(', '));
  // A busy middle zoom, then the pins and the chrome.
  await page.evaluate(`${MAP}.jumpTo({ center: [11, 44.5], zoom: 6.5 })`);
  await settle(page);
  const under = await pinsUnder(page);
  check(`${tag}: no pin or bubble under a floating control`, under.length === 0, under.join(' '));
  // No camera jump on a settings change: switch the price basis.
  const cam0 = await page.evaluate(`[${MAP}.getCenter().toArray(), ${MAP}.getZoom()]`);
  const filt = phone ? '.band-quick .xquick-filters' : '.band-filters';
  // The first option of the filters, flipped (run twice, it is undone).
  const flipFilter = async () => {
    await page.locator(filt).first().click();
    await page.waitForTimeout(800);
    const opt = page.locator('[role="dialog"] input[type="checkbox"], [role="dialog"] [aria-pressed], [role="dialog"] [role="switch"]').first();
    if (await opt.count()) await opt.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    // A desktop panel that Escape left open closes from its own button.
    if (await page.locator('.filter-sheet, .fsheet, [role="dialog"]').filter({ visible: true }).count()) {
      await page.locator(filt).first().click().catch(() => {});
    }
    await page.waitForTimeout(1200);
  };
  await flipFilter();
  const stillOpen = await page.locator('[role="dialog"]').filter({ visible: true }).count();
  const cam1 = await page.evaluate(`[${MAP}.getCenter().toArray(), ${MAP}.getZoom()]`);
  const moved = Math.hypot(cam1[0][0] - cam0[0][0], cam1[0][1] - cam0[0][1]) + Math.abs(cam1[1] - cam0[1]);
  check(`${tag}: a filter change keeps the camera`, moved < 1e-6, `moved ${moved.toFixed(6)}`);
  check(`${tag}: the filters close again`, stillOpen === 0, `${stillOpen} open`);
  // The flipped filter can leave no place on the map: undo it before the tap.
  await flipFilter();
  await settle(page);
  // Tap a pill: picked, umber with its name; phone: the card, map height kept.
  // A pill or the best pill; none here, a busier view is tried once. A size
  // with no pin fails: its tap, card and sheet checks must run (judgement-1).
  const findPin = () => page.evaluate(`(() => { const m = ${MAP}; const r = m.getCanvas().getBoundingClientRect();
    for (const f of m.queryRenderedFeatures({ layers: ['xpin', 'xpin-best'] })) {
      const p = m.project(f.geometry.coordinates); const x = p.x + r.left; const y = p.y + r.top - 14;
      if (document.elementFromPoint(x, y)?.tagName === 'CANVAS') return [x, y, f.properties.id];
    }
    return null; })()`);
  let pt = await findPin();
  if (!pt) {
    await page.evaluate(`${MAP}.jumpTo({ center: [10, 46.5], zoom: 6 })`);
    await settle(page);
    pt = await findPin();
  }
  const why = pt ? '' : await page.evaluate(`(() => { const m = ${MAP}; return JSON.stringify({ src: m.getSource('dests')?._data?.geojson?.features?.length, vis: m.getLayoutProperty('xpin', 'visibility'), drawn: m.queryRenderedFeatures({ layers: ['xcluster', 'dest-dots'] }).length, z: m.getZoom() }); })()`);
  check(`${tag}: a price pin to tap is drawn`, !!pt, why);
  if (pt) {
    if (phone) await page.touchscreen.tap(pt[0], pt[1]); else await page.mouse.click(pt[0], pt[1]);
    await page.waitForTimeout(1500);
    const picked = await page.evaluate(`${MAP}.queryRenderedFeatures({ layers: ['xpin-picked'] }).map((f) => f.properties.id)`);
    const xi = await page.evaluate(() => new URLSearchParams(location.search).get('xi'));
    check(`${tag}: a tap picks the pin (umber, named)`, picked.includes(pt[2]), `${pt[2]} at ${pt.slice(0, 2).map(Math.round)}, xi ${xi}, drawn ${picked.join()}`);
    await shot('picked');
    if (phone) {
      const r1 = await rects(page);
      check(`${tag}: the tap card shows above the nav`, r1.card && r1.nav && r1.card.b <= r1.nav.t, JSON.stringify(r1.card));
      check(`${tag}: no overlaps with the tap card`, overlaps(r1, w, h).length === 0, overlaps(r1, w, h).join(', '));
      await settle(page);
      const u = await pinsUnder(page);
      check(`${tag}: no pin under the tap card`, u.length === 0, u.join(' '));
      check(`${tag}: the tap card's name is whole`, await page.evaluate(() => { const n = document.querySelector('.xmap-tapcard .xrow-name'); return !!n && n.scrollWidth <= n.clientWidth + 1; }));
      check(`${tag}: the picked pin sits clear of the tap card`, await pickedClear(page));
      // Swipe the card down.
      // A finger, as on a phone (touch events, not a mouse).
      const c = r1.card;
      if (c) {
        const cdp = await page.context().newCDPSession(page);
        const x = (c.l + c.r) / 2; const y = c.t + 20;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
        for (let i = 1; i <= 8; i += 1) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 100 * i / 8, id: 1 }] });
          await page.waitForTimeout(16);
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
      }
      await page.waitForTimeout(800);
      check(`${tag}: a swipe down puts the card away`, !(await page.locator('.xmap-tapcard').count()));
      // The sheet: pill to half, grab to full, flick down to peek or closed.
      await page.locator('.xmap-listpill').click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(700);
      const half = await page.evaluate(() => document.querySelector('.xsheet')?.className || '');
      check(`${tag}: List opens the sheet half way`, /is-half/.test(half), half);
      await page.locator('.xsheet-grab').click();
      await page.waitForTimeout(700);
      check(`${tag}: the sheet goes full with a Map pill`, /is-full/.test(await page.evaluate(() => document.querySelector('.xsheet').className))
        && await page.locator('.xmap-listpill.is-map').count() === 1);
      await shot('sheet-full');
      const g = await page.locator('.xsheet-head').boundingBox();
      await page.mouse.move(g.x + g.width / 2, g.y + 30);
      await page.mouse.down();
      await page.mouse.move(g.x + g.width / 2, g.y + 130, { steps: 3 });
      await page.mouse.up();
      await page.waitForTimeout(700);
      const after = await page.evaluate(() => document.querySelector('.xsheet').className);
      check(`${tag}: a flick down moves the sheet one stop`, /is-half/.test(after), after);
    } else {
      // Hover sync: a card lifts its pin, a pin outlines its card.
      // The pick shows its place in the column: open the map without it, so
      // the column holds the cards again.
      await page.goto(BASE + '?tab=map&xw=map', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => performance.getEntriesByName('carta:map-idle').length > 0, null, { timeout: 120000 });
      await page.evaluate(`${MAP}.jumpTo({ center: [11, 44.5], zoom: 6.5 })`);
      await settle(page);
      await page.mouse.move(5, 5);
      const card = page.locator('.mpp .xrow').first();
      check(`${tag}: the column shows cards`, await card.count() > 0);
      if (await card.count()) {
        const id = await card.getAttribute('data-id');
        await card.hover();
        await page.waitForTimeout(800);
        // The lifted pin is the one feature of its own source.
        const hot = await page.evaluate(`JSON.stringify(${MAP}.getSource('dests-hot')._data?.geojson?.features?.map((f) => f.properties.id) || [])`);
        check(`${tag}: a card under the pointer lifts its pin`, hot.includes(`"${id}"`), `${id} ${hot}`);
        await shot('hover');
      }
      await page.mouse.click(5, h - 5).catch(() => {});
    }
  }
  check(`${tag}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
}

// The tap card and the sheet row on real places, opened by ?xi= (judgement-2):
// a priced place with a long name, two with no price yet and long names, and
// a short one, in six languages at 360 and 390. The card: its name whole and
// at least 40% of the text column, no two text boxes meeting, its top under
// the chip row, at most 40% of the screen high, the picked pin clear above
// it. The sheet row of a hidden gem with no price: no two text boxes meeting.
// --cards-only runs just this pass.
const CARD_PLACES = ['gem:moustiers-sainte-marie', 'gem:petra-tou-romiou', 'gem:picos-de-europa', 'gem:acquapendente'];
const SHEET_PLACE = 'gem:petra-tou-romiou';
const TEXT_PARTS = ['.xrow-name', '.hs-score', '.water-badge', '.country-flag', '.xrow-region', '.xrow-ctry', '.xrow-gem', '.xfig-amount', '.xfig-basis', '.xrow-save'];
const boxesMeet = (root, parts) => {
  const R = (e) => e.getBoundingClientRect();
  const els = parts.flatMap((q) => [...root.querySelectorAll(q)]).filter((e) => R(e).width && R(e).height);
  const bad = [];
  for (let i = 0; i < els.length; i += 1) {
    for (let j = i + 1; j < els.length; j += 1) {
      if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
      const rs = (e) => (getComputedStyle(e).display === 'inline' ? [...e.getClientRects()] : [R(e)]);
      const hit = rs(els[i]).some((a) => rs(els[j]).some((b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1));
      if (hit) bad.push(`${els[i].className.split(' ')[0]}+${els[j].className.split(' ')[0]}`);
    }
  }
  return bad;
};
async function cardPass() {
  for (const lang of ['en', 'nl', 'de', 'fr', 'es', 'it']) {
    for (const [w, h] of [[360, 640], [390, 844]]) {
      for (const id of CARD_PLACES) {
        const tag = `card ${lang} ${w} ${id.slice(4)}`;
        const { ctx, page, errors } = await boot(w, h, `?tab=map&xw=map&xi=${encodeURIComponent(id)}`, lang);
        await settle(page);
        await page.waitForTimeout(800);
        const r = await page.evaluate(`(() => {
          const meet = ${boxesMeet.toString()};
          const card = document.querySelector('.xmap-tapcard');
          if (!card) return { bad: ['no card'] };
          const R = (e) => e?.getBoundingClientRect();
          const cr = R(card); const n = card.querySelector('.xrow-name');
          const col = R(card.querySelector('.xtc-text'))?.width || cr.width;
          const strip = R(document.querySelector('.band.is-map .band-quick') || document.querySelector('.band.is-map .band-strip'));
          const bad = meet(card, ${JSON.stringify(TEXT_PARTS)});
          if (n.scrollWidth > n.clientWidth + 1) bad.push('name cut');
          if (R(n).width < col * 0.4) bad.push('name ' + Math.round(R(n).width) + ' of ' + Math.round(col));
          if (strip && cr.top < strip.bottom) bad.push('card top ' + Math.round(cr.top));
          if (cr.height > innerHeight * 0.4) bad.push('card ' + Math.round(cr.height) + ' high');
          return { bad, h: Math.round(cr.height), name: n.textContent };
        })()`);
        if (!r.bad.length && !(await pickedClear(page))) r.bad.push('picked pin under the card');
        check(`${tag}: whole, apart, clear`, r.bad.length === 0 && errors.length === 0, `${r.name || ''} h${r.h} ${r.bad.join(', ')} ${errors.slice(0, 1).join('')}`);
        if (SHOTS && lang === 'it' && w === 360) await page.screenshot({ path: path.join(SHOTS, `card-it-360-${id.slice(4)}.png`) });
        if (id === SHEET_PLACE) {
          // The sheet row of the same place: the card away, the list full.
          await page.keyboard.press('Escape');
          await page.waitForTimeout(600);
          // Close to the place, so its row is among the rows in view (a place
          // with no price ranks past the sheet's first rows at country zoom).
          await page.evaluate(`(() => { const m = ${MAP}; const f = (m.getSource('dests-c')._data?.geojson?.features || []).find((x) => x.properties.id === '${SHEET_PLACE}');
            if (f) m.jumpTo({ center: f.geometry.coordinates, zoom: 10 }); })()`);
          await settle(page);
          await page.locator('.xmap-listpill').click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(600);
          await page.locator('.xsheet-grab').click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(800);
          const s = await page.evaluate(`(() => {
            const meet = ${boxesMeet.toString()};
            const row = document.querySelector('.xsheet .xrow[data-id="${SHEET_PLACE}"]');
            if (!row) return ['no row'];
            row.scrollIntoView({ block: 'center' });
            const bad = meet(row, ${JSON.stringify(TEXT_PARTS)});
            const n = row.querySelector('.xrow-name');
            if (n.scrollWidth > n.clientWidth + 1) bad.push('name cut');
            return bad;
          })()`);
          check(`sheet ${lang} ${w} ${SHEET_PLACE.slice(4)}: row text apart`, s.length === 0, s.join(', '));
        }
        await ctx.close();
      }
    }
  }
}

// ---- Round 2 (G12, .work/2026-11-20-map-view-2): photo pins, the style row,
// the way back, In view | All, sorts, quick chips, the filter counts, the
// match points and no cut text. --round2-only runs just this pass.
// A travel style with a taste, so the match mark and Match 70%+ show.
const STYLE_SEED = JSON.stringify({ version: 1, list: [{ id: 'verify-style', name: 'The two of us', template: 'couple', tone: 'umber',
  who: { kind: 'couple', adults: 2, kids: 0, babies: 0, slowWalkers: false },
  explore: { shapes: ['towns'], personas: ['towns'], likes: ['beach', 'hiking', 'lakes'], avoid: ['crowds'], around: 'public', size: 'town', quiet: 'quiet' } }], active: 'verify-style' });
const STRESS = ['gem:santa-margherita-ligure', 'gem:nice-villefranche', 'gem:louhans-chateaurenaud', 'gem:petra-tou-romiou'];
const LANGS = ['en', 'nl', 'de', 'fr', 'es', 'it'];
// Every text element of a box whose words run past it (an ellipsis or a clip).
const cutIn = (sel) => `(() => {
  const out = [];
  for (const root of document.querySelectorAll(${JSON.stringify(sel)})) {
    for (const el of root.querySelectorAll('*')) {
      if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('.sr-only')) continue;
      if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible') out.push((el.className || el.tagName) + ': ' + el.textContent.trim().slice(0, 30));
      if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) out.push('ellipsis ' + el.textContent.trim().slice(0, 30));
    }
  }
  return out;
})()`;

// A slow cold start (the map idle can take over two minutes on a busy
// machine) is tried once more before it counts as a failure.
async function bootStyled(w, h, url, lang = 'en') {
  try {
    return await boot(w, h, url, lang, STYLE_SEED);
  } catch {
    return boot(w, h, url, lang, STYLE_SEED);
  }
}
// One check of the round 2 pass that throws records a failure, not a crash.
async function guard(label, fn) {
  try { await fn(); } catch (e) { check(label, false, String(e.message || e).split('\n')[0]); }
}

async function round2Pass() {
  // Photo pins by zoom, and the style row in view, at 390 in English.
  {
    const { ctx, page, errors } = await bootStyled(390, 844, '?tab=map&xw=map');
    for (const z of [5, 7, 9]) {
      await page.evaluate(`${MAP}.jumpTo({ center: [4.85, 46.9], zoom: ${z} })`);
      await settle(page);
      await page.waitForTimeout(2500);
      const n = await page.evaluate(`${MAP}.queryRenderedFeatures({ layers: ['xpin-photo'] }).length`);
      check(`round2 390 zoom ${z} Burgundy: photo pins drawn`, n > 0, `${n}`);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `r2-390-z${z}.png`) });
    }
    // In view | All: All lists more than In view at a town zoom.
    await page.locator('.xmap-listpill').first().click();
    await page.waitForTimeout(800);
    const scope = await page.evaluate(() => [...document.querySelectorAll('.xsheet-scope .xsheet-n')].map((e) => Number(e.textContent.replace(/\D/g, ''))));
    check('round2 390: All counts more than In view', scope.length === 2 && scope[1] > scope[0], scope.join(' / '));
    const inView = await page.locator('.xsheet .xmr').count();
    await page.locator('.xsheet-scope [role="radio"]').nth(1).click();
    await page.waitForTimeout(700);
    const allRows = await page.locator('.xsheet .xmr').count();
    check('round2 390: scope All lists more rows than In view', allRows > inView, `${inView} -> ${allRows}`);
    // The match points add up to the figure.
    const mark = page.locator('.xsheet .xmatch-mark').first();
    if (await mark.count()) {
      await mark.click();
      await page.waitForTimeout(700);
      const m = await page.evaluate(() => {
        const b = document.querySelector('[data-testid="why-points"]');
        if (!b) return null;
        const pts = [...b.querySelectorAll('.xwhy-row')].reduce((s, r) => s + Number(r.dataset.points || 0), 0);
        return [pts, Number(b.dataset.pct)];
      });
      check('round2 390: the match points add up to the %', m && m[0] === m[1], JSON.stringify(m));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'r2-390-why.png') });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else check('round2 390: a match mark to open', false, 'none in All');
    // The Filters sheet: an option's count is the result once it is on.
    await page.locator('.xsheet-filters').click();
    await page.waitForTimeout(900);
    const opt = page.locator('.flt [data-count]').filter({ hasText: /8\+/ }).first();
    const want = Number(await opt.getAttribute('data-count'));
    await opt.click();
    await page.waitForTimeout(900);
    const shown = await page.evaluate(() => Number((document.querySelector('.flt-show')?.textContent || '').replace(/\D/g, '')));
    check('round2 390: the Filters option count equals the result', want > 0 && want === shown, `${want} / ${shown}`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'r2-390-filters.png') });
    await opt.click();
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    check('round2 390 en: no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    await ctx.close();
  }
  // Quick chips filter and count; sorts order the list.
  {
    const { ctx, page } = await bootStyled(390, 844, '?tab=map&xw=map');
    const count0 = await page.evaluate(() => Number(document.querySelector('.band-quick .xquick-filters .band-count')?.textContent || 0));
    await page.locator('.band-quick [data-quick="score8"]').click();
    await page.waitForTimeout(1800);
    const q = await page.evaluate(() => ({
      on: document.querySelector('.band-quick .xquick-chip[data-quick]')?.dataset.quick,
      n: Number(document.querySelector('.band-quick .xquick-filters .band-count')?.textContent || 0),
      url: new URLSearchParams(location.search).get('xq'),
    }));
    check('round2 390: Score 8+ turns on, moves to the front and counts', q.on === 'score8' && q.n === count0 + 1 && q.url === '8', JSON.stringify(q));
    await page.locator('.xmap-listpill').first().click();
    await page.waitForTimeout(700);
    await page.locator('.xsheet-scope [role="radio"]').nth(1).click();
    await page.waitForTimeout(700);
    const scores = await page.evaluate(() => [...document.querySelectorAll('.xsheet .xmr .hs-score')].map((e) => Number((e.textContent.match(/\d+[.,]\d/) || ['0'])[0].replace(',', '.'))));
    check('round2 390: Score 8+ leaves only places of 8 and up', scores.length > 0 && scores.every((s) => s >= 8), scores.slice(0, 8).join(' '));
    await ctx.close();
    for (const [key, ok] of [['costDesc', (a) => a.every((x, i) => i === 0 || x <= a[i - 1])], ['cost', (a) => a.every((x, i) => i === 0 || x >= a[i - 1])]]) {
      const r = await bootStyled(390, 844, `?tab=map&xw=map&sort=${key}`);
      await r.page.locator('.xmap-listpill').first().click();
      await r.page.waitForTimeout(700);
      await r.page.locator('.xsheet-scope [role="radio"]').nth(1).click();
      await r.page.waitForTimeout(900);
      const figs = await r.page.evaluate(() => [...document.querySelectorAll('.xsheet .xmr .xfig-amount')].slice(0, 30).map((e) => Number(e.textContent.replace(/[^\d]/g, ''))).filter((x) => x > 0));
      check(`round2 390: sort ${key} orders the figures`, figs.length > 3 && ok(figs), figs.slice(0, 8).join(' '));
      await r.ctx.close();
    }
  }
  // The style chip and the settings chips stay in view on the phone map, and
  // a pick shows the List pill above the card; six languages at 360 and 390.
  for (const lang of LANGS) {
    for (const [w, h] of [[360, 640], [390, 844]]) {
      await guard(`round2 ${lang} ${w}: the style row and the List pill`, async () => {
      const { ctx, page, errors } = await bootStyled(w, h, `?tab=map&xw=map&xi=${encodeURIComponent(STRESS[1])}`, lang);
      await settle(page);
      const vis = await page.evaluate(() => {
        const seen = (el) => {
          if (!el) return 'missing';
          const r = el.getBoundingClientRect();
          if (r.left < -1 || r.right > innerWidth + 1 || r.top < 0 || r.bottom > innerHeight) return 'off screen';
          const at = document.elementFromPoint(r.left + Math.min(24, r.width / 2), r.top + r.height / 2);
          return at && el.contains(at) ? 'ok' : 'covered';
        };
        const style = document.querySelector('.band.is-map .band-chips-pin > .band-chip.is-style');
        const first = document.querySelector('.band.is-map .band-chips-pin .band-chips .band-chip');
        const pill = document.querySelector('.xmap-listpill')?.getBoundingClientRect();
        const card = document.querySelector('.xmap-tapcard')?.getBoundingClientRect();
        return { style: seen(style), settings: seen(first), pill: !!pill && !!card && pill.bottom <= card.top + 1 };
      });
      check(`round2 ${lang} ${w}: the style chip and the settings stay in view`, vis.style === 'ok' && vis.settings === 'ok', JSON.stringify(vis));
      check(`round2 ${lang} ${w}: the picked card shows the List pill above it`, vis.pill, JSON.stringify(vis));
      check(`round2 ${lang} ${w}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
      await ctx.close();
      });
    }
  }
  // No cut text for the stress names, six languages, six widths: the card
  // (phone) or the anchored card (wider) and the row in the list.
  for (const lang of LANGS) {
    for (const [w, h] of [[360, 640], [390, 844], [440, 900], [820, 1180], [1180, 820], [1440, 900]]) {
      const bad = [];
      for (const id of STRESS) {
        let ctx = null; let page = null;
        try { ({ ctx, page } = await bootStyled(w, h, `?tab=map&xw=map&xi=${encodeURIComponent(id)}`, lang)); } catch (e) { bad.push(`${id.slice(4)} did not open: ${String(e.message).split('\n')[0]}`); continue; }
        await settle(page);
        const cut = await page.evaluate(cutIn('.xmap-tapcard, .xmap-anchor-card, .xsheet .xmr, .mpp .xmr'));
        const some = await page.evaluate(() => !!document.querySelector('.xmap-tapcard, .xmap-anchor-card'));
        if (!some) bad.push(`${id.slice(4)} no card`);
        bad.push(...cut.map((c) => `${id.slice(4)} ${c}`));
        await ctx.close();
      }
      check(`round2 cut ${lang} ${w}: the stress names are whole`, bad.length === 0, bad.slice(0, 3).join(' | '));
    }
  }
}

const perf = {};
// --layout-only skips the speed runs (a quick rerun of the layout checks).
if (!flag('layout-only') && !flag('round2-only')) for (const [w, h] of [[390, 844], [1440, 900]]) perf[`${w}x${h}`] = await speed(w, h);
console.log('speed (CPU %dx, pan)', RATE, JSON.stringify(perf, null, 1));

if (!PERF_ONLY) {
  for (const [k, v] of Object.entries(perf)) {
    check(`speed ${k}: 0 to 2 frames over 50 ms while panning at CPU ${RATE}x`, v.over50 <= 2, `${v.over50} of ${v.frames}, p95 ${v.p95}, max ${v.max}`);
    check(`speed ${k}: no DOM price pins`, v.domPins === 0, `${v.domPins}`);
  }
  if (!flag('cards-only') && !flag('round2-only')) for (const [w, h] of SIZES) await layoutChecks(w, h);
  if (!flag('round2-only')) await cardPass();
  if (!flag('cards-only')) await round2Pass();
}

await browser.close();
server.close();
if (!PERF_ONLY) {
  let bad = 0;
  for (const c of checks) {
    if (!c.ok) bad += 1;
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
  }
  console.log(`\n${checks.length - bad} of ${checks.length} passed`);
  process.exit(bad ? 1 : 0);
}
