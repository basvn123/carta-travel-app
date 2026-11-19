// G12, Explore top round 2 (owner 2026-11-19: "really check if everything
// still switches smoothly"): the layout shift of every switch and open/close
// on Explore, measured in a browser. Each action runs with a fresh
// layout-shift observer and every shift it causes is summed, including the
// ones right after the click (the browser's CLS leaves those out as
// "recent input", but a traveller still sees the page jump). Load counts too.
//
//   node scripts/verify_smooth.mjs      (a server at CARTA_PORT, default 5182)
//
// SIZES=390x844,1440x900 and LANGS=en,de pick the runs (default the five
// contract sizes in en). LIMIT (default 0.05) is the most any one action may
// shift. VERBOSE=1 prints the elements that moved.
import { chromium } from 'playwright';
import { mirrorData } from './lib/dataMirror.mjs';

const PORT = Number(process.env.CARTA_PORT) || 5182;
const BASE = `http://127.0.0.1:${PORT}/`;
const LIMIT = Number(process.env.LIMIT || 0.05);
const VERBOSE = !!process.env.VERBOSE;
const SIZES = (process.env.SIZES || '360x640,390x844,820x1180,1280x800,1440x900')
  .split(',').map((s) => s.split('x').map(Number));
const LANGS = (process.env.LANGS || 'en').split(',');

const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok: !!ok, note });

// Starts a fresh log of layout shifts with the elements that moved.
const watch = (page) => page.evaluate(() => {
  window.__shifts = [];
  window.__shiftObs?.disconnect();
  const name = (n) => {
    if (!n || n.nodeType !== 1) return n ? '#text' : '?';
    const cls = String(n.className || '').split(' ').filter(Boolean).slice(0, 2).join('.');
    return `${n.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`;
  };
  window.__shiftObs = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      window.__shifts.push({
        v: e.value,
        src: (e.sources || []).map((s) => `${name(s.node)} ${Math.round(s.previousRect.y)}->${Math.round(s.currentRect.y)} h${Math.round(s.previousRect.height)}->${Math.round(s.currentRect.height)}`),
      });
    }
  });
  window.__shiftObs.observe({ type: 'layout-shift' });
});
const read = (page) => page.evaluate(() => {
  const s = window.__shifts || [];
  return { sum: s.reduce((a, e) => a + e.v, 0), n: s.length, top: [...s].sort((a, b) => b.v - a.v).slice(0, 3) };
});

const visible = (page, sel) => page.locator(`${sel}:visible`).first();
const tab = (page, key) => visible(page, `[role="tab"]:has(.xcats-tab[data-cat="${key}"])`);

async function ready(page) {
  await page.waitForSelector('.hs-rail, .xrow, .xcard', { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(2500);
}

// The actions, each from Places at the top of the overview and back to it.
const ACTIONS = [
  ['tab Places to Trails', async (page) => { await tab(page, 'trails').click(); await page.waitForTimeout(2500); }],
  ['tab Trails to Places', async (page) => { await tab(page, 'places').click(); await page.waitForTimeout(2500); }],
  ['tab Places to Beaches and back', async (page) => {
    await tab(page, 'beaches').click(); await page.waitForTimeout(2500);
  }, async (page) => { await tab(page, 'places').click(); await page.waitForTimeout(2500); }],
  ['open search', async (page) => { await visible(page, '.band-input').click(); await page.waitForTimeout(1200); }],
  ['close search', async (page) => { await page.keyboard.press('Escape'); await page.mouse.click(5, 300); await page.waitForTimeout(1200); }],
  ['open Filters', async (page, phone) => { await openFilters(page, phone); await page.waitForTimeout(1200); }],
  ['close Filters', async (page) => { await visible(page, '.flt-close').click(); await page.waitForTimeout(1200); }],
  ['apply a filter', async (page, phone) => {
    await openFilters(page, phone);
    await page.waitForTimeout(800);
    await visible(page, '.flt [data-group="water"] .ui-chip-filter').click();
    await page.waitForTimeout(800);
    await visible(page, '.flt-show').click();
    await page.waitForTimeout(2500);
  }],
  ['clear the filter', async (page) => {
    // One chip on: its own remove (Clear all comes with two).
    const clear = page.locator('.xap-clear:visible, .xap-x:visible').first();
    await clear.click();
    await page.waitForTimeout(2500);
  }],
  ['open Settings', async (page, phone) => {
    await visible(page, phone ? '.band-chip:not(.is-style)' : '.band-settings').click();
    await page.waitForTimeout(1200);
  }],
  ['close Settings', async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(1200); }],
  ['open Ask', async (page) => { await visible(page, '.band-ask').click(); await page.waitForTimeout(1500); }],
  ['close Ask', async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(1500); }],
];

async function openFilters(page, phone) {
  if (!phone) await visible(page, '.band-filters').click();
  else {
    await visible(page, '.band-input').click();
    await visible(page, '.sp-action:not(.sp-action--ask)').click();
  }
  await page.waitForSelector('.flt-show', { timeout: 10000 });
}

const browser = await chromium.launch();
const rows = [];

async function run(width, height, lang) {
  const phone = width <= 768;
  const tag = `${width}x${height} ${lang}`;
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', hasTouch: phone, isMobile: phone });
  await mirrorData(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.route(/supabase\.co\//, (r) => {
    const url = r.request().url();
    if (/\/auth\/v1\/user/.test(url)) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"no session"}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.addInitScript((l) => {
    try {
      localStorage.setItem('continent.lang.v1', l);
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
      localStorage.setItem('continent.mapGuideDismissed.v1', '1');
      localStorage.setItem('carta.styleStudio.seen.v1', '1');
    } catch { /* storage unavailable */ }
    // The load's own shifts, from the first paint on.
    window.__loadShifts = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__loadShifts.push({ v: e.value, t: e.startTime, src: (e.sources || []).map((s) => (s.node && s.node.className ? `${s.node.tagName.toLowerCase()}.${String(s.node.className).split(' ')[0]}` : '?')) });
      }).observe({ type: 'layout-shift', buffered: true });
    } catch { /* no observer */ }
  }, lang);
  await page.goto(`${BASE}?tab=explore`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await ready(page);
  await page.waitForTimeout(4000);
  const load = await page.evaluate(() => window.__loadShifts);
  const loadSum = load.reduce((a, e) => a + e.v, 0);
  rows.push({ tag, action: 'load', sum: loadSum, top: [...load].sort((a, b) => b.v - a.v).slice(0, 3) });
  check(`${tag}: load shifts ${loadSum.toFixed(3)}`, loadSum < 0.1);

  for (const [name, act, back] of ACTIONS) {
    await watch(page);
    let ok = true;
    try { await act(page, phone); } catch (e) { ok = false; rows.push({ tag, action: name, sum: NaN, top: [{ v: 0, src: [String(e.message).split('\n')[0]] }] }); }
    const r = await read(page);
    if (ok) rows.push({ tag, action: name, ...r });
    check(`${tag}: ${name} shifts ${ok ? r.sum.toFixed(3) : 'not run'}`, ok && r.sum < LIMIT);
    if (back) { try { await back(page, phone); } catch { /* next action starts from where it is */ } }
  }
  // The page never scrolls sideways.
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(`${tag}: no sideways scroll`, over <= 0, String(over));
  check(`${tag}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
}

for (const lang of LANGS) for (const [w, h] of SIZES) await run(w, h, lang);
await browser.close();

if (VERBOSE) {
  for (const r of rows) {
    if (!(r.sum >= 0.001) && !Number.isNaN(r.sum)) continue;
    console.log(`${r.tag} ${r.action}: ${Number.isNaN(r.sum) ? 'not run' : r.sum.toFixed(3)}`);
    for (const e of r.top) console.log(`    ${e.v.toFixed(3)} ${e.src.slice(0, 4).join(' | ')}`);
  }
}
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.label}${c.note ? ` (${c.note})` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
