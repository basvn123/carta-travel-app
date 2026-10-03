/**
 * Keyboard audit (T190). Walks every main surface with the Tab key, at a
 * phone width and a desktop width, and records for each stop whether focus is
 * visible, whether the focused thing can be seen at all, and whether the walk
 * gets stuck. It also counts what a mouse can click but a keyboard cannot
 * reach, and on the two maps it drives the map itself: canvas focus, arrow
 * keys and zoom keys, pin focus, and opening a pin with Enter.
 *
 * Visible focus is measured, not inferred from CSS: the focused element's box
 * (plus 6 px for an outline offset) is screenshotted focused and again after
 * blur. If the two images are byte-identical, focus left no mark on screen.
 * That catches every way a ring can go missing, including an `outline: none`
 * with nothing in its place and a ring clipped by an overflow parent.
 *
 * It does not start a server. Build and serve first, then point it at the port:
 *   npx vite build && npx vite preview --port 5210 --strictPort
 *   node scripts/verify_keyboard.mjs --port 5210 --out <dir outside the repo>
 * Options: --widths 380,1280   --only explore-map,destination   --max 220
 * Exit code 1 when any check fails; the JSON lands in <out>/keyboard-audit.json.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg('port', '5210');
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = arg('out', path.resolve('keyboard-audit'));
const WIDTHS = arg('widths', '380,1280').split(',').map(Number);
const ONLY = arg('only', '') ? arg('only', '').split(',') : null;
const MAX = Number(arg('max', '220'));
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot(p, q = '') {
  await p.goto(`${BASE}/${q}`, { waitUntil: 'commit', timeout: 180000 });
  await p.waitForSelector('.places-ccard, .xcard, .app', { timeout: 120000 });
  await sleep(2500);
  for (const sel of ['button:has-text("Accept")', 'button:has-text("Got it")']) {
    const e = p.locator(`${sel}:visible`).first();
    if (await e.count()) await e.click().catch(() => {});
  }
}
const vis = (p, sel) => p.locator(sel).locator('visible=true').first();

// Open every closed fold, accordion row and disclosure on the page, so the
// walk covers the controls inside them too (the journey page's day accordion,
// Good to know rows, pack grid and week plan all live in folds).
async function openAll(p, sel) {
  for (let round = 0; round < 6; round++) {
    const n = await p.evaluate((s) => {
      const els = [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length);
      els.forEach((e) => e.click());
      return els.length;
    }, sel);
    if (!n) break;
    await sleep(700);
  }
}
const FOLDS = 'button.dsec-toggle[aria-expanded="false"], button.tday-more[aria-expanded="false"], '
  + 'button.ls-tune-btn[aria-expanded="false"], button.panel-acc-head[aria-expanded="false"]';

// Each surface opens itself and says where the walk starts: null starts at
// the top of the document, a selector starts on that element.
const SURFACES = {
  destinations: async (p) => { await boot(p); await p.waitForSelector('.places-ccard'); return { start: null }; },
  'destinations-trails': async (p) => {
    await boot(p);
    await vis(p, '.side-cat:has-text("Trails"), .places-cat:has-text("Trails")').click();
    await sleep(2500);
    return { start: null };
  },
  journey: async (p) => {
    await boot(p);
    await vis(p, '.jstyle-card:has-text("Cycling")').click();
    await sleep(1500);
    await vis(p, '.jcard').click();
    await p.waitForSelector('.jpage-hook, .jpage', { timeout: 30000 });
    await sleep(2500);
    await openAll(p, FOLDS);
    return { start: null, max: 400 };
  },
  'explore-grid': async (p) => { await boot(p, '?tab=map'); await p.waitForSelector('.xcard'); await sleep(1500); return { start: null }; },
  'explore-map': async (p) => {
    await boot(p, '?tab=map');
    await p.waitForSelector('.xcard');
    await vis(p, '.xview-toggle button:nth-child(2)').click();
    await p.waitForSelector('.maplibregl-canvas', { timeout: 60000 });
    await sleep(6000);
    return { start: '.xview-toggle button:nth-child(2)', map: 'explore' };
  },
  lifestyle: async (p) => {
    await boot(p, '?tab=map');
    await p.waitForSelector('.xcard');
    await vis(p, '.lifestyle-btn').click();
    await sleep(1500);
    await openAll(p, FOLDS);
    // After the walk: Escape closes the panel and hands focus back to the
    // Lifestyle button that opened it.
    const after = async (pg) => {
      await pg.keyboard.press('Escape'); await sleep(600);
      return {
        escapeCloses: (await pg.locator('.lifestyle-panel').count()) === 0,
        focusReturns: await pg.evaluate(() => !!document.activeElement?.closest('.lifestyle-btn')),
      };
    };
    return { start: 'active', after };
  },
  destination: async (p) => {
    await boot(p, '?tab=map');
    await p.waitForSelector('.xcard');
    await vis(p, '.xcard-hit').click();
    await p.waitForSelector('.destp-grid', { timeout: 60000 });
    await sleep(4000);
    await openAll(p, FOLDS);
    await sleep(2000);
    // After the walk: the map's layer tabs move with the arrow keys.
    const after = async (pg, shot) => {
      const on = pg.locator('.destp-layer.on').first();
      if (!(await on.count())) return { layerTabs: 0 };
      const before = (await on.innerText()).trim();
      await on.focus(); await pg.keyboard.press('ArrowRight'); await sleep(1500);
      await shot('layer-arrow');
      const now = await pg.evaluate(() => ({
        on: document.querySelector('.destp-layer.on')?.innerText.trim(),
        focused: document.activeElement?.classList.contains('destp-layer'),
        stops: [...document.querySelectorAll('.destp-layer')].filter((b) => b.tabIndex === 0).length,
      }));
      return { layerTabs: await pg.locator('.destp-layer').count(), arrowSwitches: now.on !== before && now.focused, oneTabStop: now.stops === 1 };
    };
    return { start: 'active', map: 'dest', max: 400, after };
  },
  // A published multi-stop trip: the TripMap stop pins (numbered teardrops).
  'trip-page': async (p) => {
    await p.goto(`${BASE}/#itin=at-salzburg-vienna-chain-6d`, { waitUntil: 'commit', timeout: 180000 });
    await p.waitForSelector('.itin-route, .tpage, .jpage', { timeout: 120000 });
    await sleep(2500);
    await openAll(p, FOLDS);
    await p.waitForSelector('.itin-map .maplibregl-canvas', { timeout: 60000 }).catch(() => {});
    await sleep(5000);
    return { start: 'active', map: 'trip', max: 300 };
  },
  'trip-planner': async (p) => { await boot(p, '?tab=trip'); await sleep(2500); return { start: null }; },
  'day-planner': async (p) => { await boot(p, '?tab=day'); await sleep(2500); return { start: null }; },
};

// What a mouse can click that a keyboard cannot reach: a pointer cursor on an
// element that is not focusable, is not inside something focusable, and does
// not hold something focusable. Only the outermost such element counts.
const POINTER_ONLY = () => {
  const F = 'a[href],button,input,select,textarea,summary,label,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
  const out = [];
  for (const e of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(e);
    if (cs.cursor !== 'pointer' || cs.visibility === 'hidden') continue;
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (e.closest(F) || e.querySelector(F)) continue;
    const par = e.parentElement;
    if (par && par !== document.body && getComputedStyle(par).cursor === 'pointer') continue;
    out.push(`${e.tagName.toLowerCase()}.${String(e.className?.baseVal ?? e.className).trim().split(/\s+/).slice(0, 3).join('.')}`);
  }
  return out;
};

const FOCUS_INFO = () => {
  const e = document.activeElement;
  if (!e || e === document.body || e === document.documentElement) return null;
  if (!e.dataset.kbId) e.dataset.kbId = String(Math.random()).slice(2, 10);
  const r = e.getBoundingClientRect();
  const cls = String(e.className?.baseVal ?? e.className).trim().split(/\s+/).slice(0, 3).join('.');
  const label = (e.getAttribute('aria-label') || e.innerText || e.value || e.title || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const cs = getComputedStyle(e);
  const offscreen = r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth;
  // Covered: something else (a floating button, the bottom nav, a sticky
  // bar) is drawn over the middle of the focused control. Elements that let
  // the pointer through (the map's keyboard pin layer) cannot be hit-tested.
  let obscured = false;
  if (!offscreen && r.width && r.height && cs.pointerEvents !== 'none') {
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    // A map canvas draws its ring at its own edge; the pins drawn over its
    // middle are part of the map, not something covering it.
    const sameMap = e.classList.contains('maplibregl-canvas') && top?.closest('.maplibregl-map') === e.closest('.maplibregl-map');
    obscured = !!top && !sameMap && !(top === e || e.contains(top) || top.contains(e) || (e.labels && [...e.labels].some((l) => l.contains(top))));
  }
  return {
    id: e.dataset.kbId, sig: `${e.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`, label,
    role: e.getAttribute('role') || '', x: r.x, y: r.y, w: r.width, h: r.height,
    invisible: !r.width || !r.height || cs.visibility === 'hidden' || Number(cs.opacity) === 0 || offscreen,
    obscured,
  };
};

async function ringVisible(p, f, vw, vh) {
  const pad = 6;
  const x = Math.max(0, f.x - pad); const y = Math.max(0, f.y - pad);
  const w = Math.min(vw, f.x + f.w + pad) - x; const h = Math.min(vh, f.y + f.h + pad) - y;
  if (w < 1 || h < 1) return false;
  const clip = { x, y, width: w, height: h };
  const a = await p.screenshot({ clip, animations: 'disabled' });
  await p.evaluate(() => { window.__kb = document.activeElement; window.__kb?.blur(); });
  const b = await p.screenshot({ clip, animations: 'disabled' });
  await p.evaluate(() => window.__kb?.focus({ preventScroll: true }));
  return !a.equals(b);
}

async function walk(p, start, vw, vh, max = MAX) {
  if (start === null) await p.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  else if (start !== 'active') await p.locator(start).locator('visible=true').first().focus();
  const stops = []; const seen = new Set(); let stuck = false; let bodyHits = 0;
  for (let i = 0; i < max; i++) {
    await p.keyboard.press('Tab');
    await sleep(60);
    const f = await p.evaluate(FOCUS_INFO);
    if (!f) { if (++bodyHits > 2) break; continue; }
    if (stops.length && stops[stops.length - 1].id === f.id) { stuck = true; break; }
    if (seen.has(f.id)) break; // came round again
    seen.add(f.id);
    f.ring = f.invisible || f.obscured ? false : await ringVisible(p, f, vw, vh);
    stops.push(f);
  }
  return { stops, stuck, capped: stops.length >= max };
}

// Pixel change on the map canvas after a key: the map moved or zoomed.
async function canvasShot(p) {
  const c = p.locator('.maplibregl-canvas').locator('visible=true').first();
  return c.screenshot({ animations: 'disabled' });
}
async function mapChecks(p, kind, shot) {
  const res = {};
  const canvas = p.locator('.maplibregl-canvas').locator('visible=true').first();
  if (!(await canvas.count())) return { canvas: false };
  await canvas.focus();
  await shot('canvas-focus');
  res.canvasFocusable = await p.evaluate(() => document.activeElement?.classList.contains('maplibregl-canvas'));
  const before = await canvasShot(p);
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowDown']) { await p.keyboard.press(k); await sleep(250); }
  await sleep(800);
  res.arrowsPan = !before.equals(await canvasShot(p));
  const b2 = await canvasShot(p);
  await p.keyboard.press('Equal'); await sleep(1200);
  res.plusZooms = !b2.equals(await canvasShot(p));
  // Pins: every focusable thing inside the map that is not the canvas or a
  // built-in control. Then Enter on the first and see what happens.
  const pinSel = kind === 'explore' ? '.xmap-kpin' : kind === 'trip' ? '.trip-pin[tabindex="0"]' : '.dmap-pin[tabindex="0"]';
  res.pinStops = await p.locator(pinSel).count();
  if (!res.pinStops) return res;
  if (kind === 'explore') {
    // Enter on a cluster zooms into it and parks focus on the canvas; do it
    // until single places are on screen (at most four times).
    for (let i = 0; i < 4 && !(await p.locator('.xmap-kpin:not(.is-cluster)').count()); i++) {
      const c = p.locator('.xmap-kpin.is-cluster').first();
      if (!(await c.count())) break;
      await c.focus(); await p.keyboard.press('Enter'); await sleep(3000);
      res.clusterEnterKeepsMapFocus = await p.evaluate(() => document.activeElement?.classList.contains('maplibregl-canvas'));
    }
    const pin = p.locator('.xmap-kpin:not(.is-cluster)').first();
    if (!(await pin.count())) { res.placePins = 0; return res; }
    res.placePins = await p.locator('.xmap-kpin:not(.is-cluster)').count();
    await pin.focus(); await sleep(400);
    await shot('pin-focus');
    res.pinLabel = await pin.getAttribute('aria-label');
    res.pinTipOnFocus = (await p.locator('.maplibregl-popup').count()) > 0;
    await p.keyboard.press('Escape'); await sleep(300);
    res.escapeDismissesTip = (await p.locator('.maplibregl-popup').count()) === 0
      && await p.evaluate(() => document.activeElement?.classList.contains('xmap-kpin'));
    await p.keyboard.press('Enter'); await sleep(3000);
    res.pinEnterOpens = (await p.locator('.destp-grid').count()) > 0;
  } else {
    const pin = p.locator(pinSel).first();
    res.pinLabel = await pin.getAttribute('aria-label');
    await pin.focus(); await sleep(300);
    await shot('pin-focus');
    await p.keyboard.press('Enter'); await sleep(1200);
    res.pinEnterOpens = await p.evaluate((k) => !!document.querySelector(k === 'trip' ? '.itin-stop.on' : '.dhl.is-focus'), kind);
  }
  return res;
}

const browser = await chromium.launch();
const results = [];
let failures = 0;
for (const w of WIDTHS) {
  for (const [name, open] of Object.entries(SURFACES)) {
    if (ONLY && !ONLY.includes(name)) continue;
    const vh = w < 600 ? 820 : 900;
    const ctx = await browser.newContext({ viewport: { width: w, height: vh }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    const row = { surface: name, width: w };
    try {
      const how = await open(p);
      row.pointerOnly = await p.evaluate(POINTER_ONLY);
      const wk = await walk(p, how.start, w, vh, how.max || MAX);
      row.stops = wk.stops.length;
      row.stuck = wk.stuck;
      row.capped = wk.capped;
      row.noRing = wk.stops.filter((s) => !s.ring && !s.invisible && !s.obscured).map((s) => `${s.sig} "${s.label}"`);
      row.obscured = wk.stops.filter((s) => s.obscured).map((s) => `${s.sig} "${s.label}"`);
      row.invisible = wk.stops.filter((s) => s.invisible).map((s) => `${s.sig} "${s.label}"`);
      row.order = wk.stops.map((s) => `${s.obscured ? '[covered] ' : s.ring ? '' : '[no ring] '}${s.sig} "${s.label}"`);
      row.pinStopsInWalk = wk.stops.filter((s) => /xmap-kpin|dmap-pin/.test(s.sig)).length;
      const shot = (tag) => p.screenshot({ path: path.join(OUT, `${name}-${w}-${tag}.png`) });
      if (how.map) row.map = await mapChecks(p, how.map, shot);
      if (how.after) row.extra = await how.after(p, shot);
      await p.screenshot({ path: path.join(OUT, `${name}-${w}.png`) });
    } catch (e) {
      row.error = e.message.split('\n')[0];
    }
    row.pageErrors = errors;
    const bad = !!row.error || row.stuck || (row.noRing?.length || 0) > 0 || (row.invisible?.length || 0) > 0
      || (row.obscured?.length || 0) > 0
      || (row.extra && Object.values(row.extra).some((v) => v === false))
      || (row.pointerOnly?.length || 0) > 0
      || (row.map && (!row.map.canvasFocusable || !row.map.arrowsPan || !row.map.pinStops
        || !row.map.pinEnterOpens || /Map marker/.test(row.map.pinLabel || '')
        || (row.map.pinTipOnFocus === false) || (row.map.escapeDismissesTip === false)));
    row.ok = !bad;
    if (bad) failures++;
    results.push(row);
    console.log(`${row.ok ? 'PASS' : 'FAIL'} ${name} @${w}: stops ${row.stops ?? '-'}, no ring ${row.noRing?.length ?? '-'}, covered ${row.obscured?.length ?? '-'}, invisible ${row.invisible?.length ?? '-'}, pointer-only ${row.pointerOnly?.length ?? '-'}${row.stuck ? ', STUCK' : ''}${row.capped ? ', capped' : ''}${row.map ? `, map ${JSON.stringify(row.map)}` : ''}${row.extra ? `, ${JSON.stringify(row.extra)}` : ''}${row.error ? `, ERROR ${row.error}` : ''}`);
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'keyboard-audit.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failures}/${results.length} surface checks pass. Detail: ${path.join(OUT, 'keyboard-audit.json')}`);
process.exit(failures ? 1 : 0);
