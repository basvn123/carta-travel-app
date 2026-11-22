/**
 * My trips atlas proof (G12). For each savedmock variant and width it opens
 * My trips once, walks the three sub-tabs (Trips, Saved, Your Europe) and
 * checks on every tab: no horizontal overflow, no page errors, axe serious
 * and critical 0 inside the panel. Across the three tab switches the layout
 * shift (CLS, inputs excluded) stays under 0.05. At 390 it also checks that
 * opening an example never changes the tab counts, and with reduced motion
 * that no animation still runs 100 ms after a tab shows.
 *
 * Needs a build with VITE_E2E_SEAMS=1 served with the data (run recipe in
 * the run folder's progress.md):
 *   node scripts/verify_mytrips.mjs --port 5841 [--widths 360,390] [--variants one,lots]
 *     [--lang en-GB] [--out <dir>] [--shots]
 * --shots saves verify-<variant>-<tab>-<w>.png for each failure, plus one per
 * tab at 390 and 1440 for the first variant. Exit code 1 on any failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg('port', '5841');
const WIDTHS = arg('widths', '360,390,820,1180,1440,1920').split(',').map(Number);
const VARIANTS = arg('variants', 'guest,empty,one,statement,next,1,drafts,nopast,firstpast,lots,years,loading,error').split(',');
const LANG = arg('lang', 'en-GB');
const OUT = path.resolve(arg('out', 'verify-mytrips'));
const SHOTS = process.argv.includes('--shots');
const TABS = ['trips', 'saved', 'europe'];
const CONC = 3;
fs.mkdirSync(OUT, { recursive: true });

const url = (v) => `http://127.0.0.1:${PORT}/?tab=trips&savedmock=${encodeURIComponent(v)}`;

async function open(browser, v, w, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 700 ? 844 : 900 }, locale: LANG, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('carta.savedTripsTab', 'trips');
    // Layout shifts not caused by input, summed (CLS without session windows: stricter).
    window.__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
      .observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(url(v), { waitUntil: 'domcontentloaded' });
  await page.locator('.saved-trips-panel').waitFor({ timeout: 25000 });
  await page.waitForTimeout(1500);
  return { ctx, page, errors };
}

const tabs = (page) => page.locator('.saved-trips-panel [role="tab"]');
const tabTexts = (page) => tabs(page).allInnerTexts();

async function showTab(page, i) {
  const n = await tabs(page).count();
  if (n > i) { await tabs(page).nth(i).click(); return true; }
  return i === 0;
}

const overflow = (page) => page.evaluate(() => {
  const d = document.documentElement;
  const p = document.querySelector('.saved-trips-panel');
  return Math.max(d.scrollWidth - d.clientWidth, p ? p.scrollWidth - p.clientWidth : 0);
});

async function axe(page) {
  const r = await new AxeBuilder({ page }).include('.saved-trips-panel')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')
    .map((x) => `${x.id}(${x.nodes.length}): ${x.nodes[0]?.target?.join(' ')}`);
}

async function runOne(browser, v, w) {
  const rows = [];
  const { ctx, page, errors } = await open(browser, v, w);
  const cls0 = await page.evaluate(() => window.__cls);
  for (let i = 0; i < TABS.length; i++) {
    const shown = await showTab(page, i);
    await page.waitForTimeout(1200);
    if (!shown) { rows.push({ v, w, tab: TABS[i], skip: 'no tabs' }); continue; }
    const ov = await overflow(page);
    const ax = await axe(page);
    const row = { v, w, tab: TABS[i], overflow: ov, axe: ax, errors: [...errors] };
    row.ok = ov <= 1 && !ax.length && !errors.length;
    // Stamps (G12 judge round 3): a milestone's name never runs past its stamp, in any language.
    const stampSpill = await page.evaluate(() => [...document.querySelectorAll('.atlas-badge-l')].filter((l) => {
      const b = l.closest('.atlas-badge').getBoundingClientRect(), r = l.getBoundingClientRect();
      return l.scrollWidth > l.clientWidth + 1 || r.left < b.left - 1 || r.right > b.right + 1;
    }).map((l) => l.textContent));
    if (stampSpill.length) { row.stampSpill = stampSpill; row.ok = false; }
    // statement (G12 round 4): the DSA statement starts as one closed line
    // and its chevron opens every row of the ledger in place.
    if (v === 'statement' && i === 0) {
      const head = page.locator('.modnote-head').first();
      const closed = (await head.count()) === 1 && (await page.locator('.modnote-body').count()) === 0;
      if (closed) await head.click();
      const facts = closed ? await page.locator('.modnote-facts > div').count() : 0;
      const ax2 = facts ? await axe(page) : [];
      row.statement = { closed, facts, axe: ax2 };
      row.ok = row.ok && closed && facts >= 7 && !ax2.length;
      if (facts) await head.click();
    }
    const want = SHOTS && (!row.ok || (v === VARIANTS[0] && (w === 390 || w === 1440)));
    if (want) await page.screenshot({ path: path.join(OUT, `verify-${v}-${TABS[i]}-${w}.png`) });
    rows.push(row);
  }
  const cls = (await page.evaluate(() => window.__cls)) - cls0;
  rows.forEach((r) => { r.cls = cls; if (cls >= 0.05) r.ok = false; });
  await ctx.close();
  return rows;
}

// Examples are never counted: the tab labels (with their counts) stay the same.
async function exampleCounts(browser, v) {
  const { ctx, page } = await open(browser, v, 390);
  const before = await tabTexts(page);
  const res = [];
  for (let i = 0; i < TABS.length; i++) {
    if (!(await showTab(page, i))) break;
    await page.waitForTimeout(800);
    const btn = page.locator('.saved-trips-panel').getByRole('button', { name: /See an example|Bekijk een voorbeeld/ });
    let clicked = false;
    for (let k = 0; k < await btn.count() && !clicked; k++) {
      if (await btn.nth(k).isVisible()) { await btn.nth(k).click(); clicked = true; }
    }
    if (!clicked) continue;
    await page.waitForTimeout(1200);
    const after = await tabTexts(page);
    res.push({ tab: TABS[i], same: JSON.stringify(before) === JSON.stringify(after), before, after });
  }
  await ctx.close();
  return res;
}

async function reducedMotion(browser, v) {
  const { ctx, page } = await open(browser, v, 390, { reducedMotion: 'reduce' });
  const res = [];
  for (let i = 0; i < TABS.length; i++) {
    if (!(await showTab(page, i))) break;
    await page.waitForTimeout(100);
    const running = await page.evaluate(() => document.getAnimations()
      .filter((a) => a.playState === 'running' && Number(a.effect?.getComputedTiming?.().duration) > 1)
      // The global rule shortens every transition to 0.01 ms; one that starts as the map mounts is not motion.
      .map((a) => `${a.animationName || a.constructor.name}@${a.effect?.target?.className || ''}`.slice(0, 80)));
    res.push({ tab: TABS[i], running });
  }
  await ctx.close();
  return res;
}

// G12 wow: Your Europe's past trips sit under the map from 1100 x 720 (a
// focusable region inside the slot, after the content in the DOM) and stay
// inline in a shorter window.
async function pastPlacement(browser, v, height) {
  const { ctx, page } = await open(browser, v, 1440, { viewport: { width: 1440, height } });
  await showTab(page, 2);
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const h = document.getElementById('mt-past-h');
    const region = document.querySelector('.atlas-slot .atlas-past');
    const body = document.querySelector('.atlas-body');
    const kids = body ? [...body.children].map((c) => c.className) : [];
    return {
      heading: !!h,
      inSlot: !!(h && h.closest('.atlas-slot')),
      region: region ? { tabindex: region.getAttribute('tabindex'), role: region.getAttribute('role'), label: region.getAttribute('aria-labelledby') } : null,
      contentFirst: kids.findIndex((c) => c.includes('atlas-content')) < kids.findIndex((c) => c.includes('atlas-slot')),
      overscroll: region ? getComputedStyle(region).overscrollBehaviorY : '',
    };
  });
  await ctx.close();
  return { v, height, ...r };
}

const browser = await chromium.launch();
const jobs = [];
for (const v of VARIANTS) for (const w of WIDTHS) jobs.push(() => runOne(browser, v, w));
const results = [];
let next = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (next < jobs.length) {
    const j = jobs[next++];
    try { results.push(...await j()); } catch (e) { results.push({ v: '?', w: 0, tab: '?', ok: false, errors: [e.message] }); }
  }
}));
const extras = [];
if (WIDTHS.includes(390)) {
  for (const v of VARIANTS) {
    try { extras.push({ v, examples: await exampleCounts(browser, v), motion: await reducedMotion(browser, v) }); } catch (e) { extras.push({ v, error: e.message }); }
  }
}
const placement = [];
if (WIDTHS.includes(1440) && VARIANTS.includes('years')) {
  for (const hgt of [900, 700]) {
    try { placement.push(await pastPlacement(browser, 'years', hgt)); } catch (e) { placement.push({ v: 'years', height: hgt, error: e.message }); }
  }
}
await browser.close();
const placeBad = placement.filter((p) => p.error || !p.heading || (p.height >= 720
  ? !(p.inSlot && p.contentFirst && p.region?.tabindex === '0' && p.region?.role === 'region' && p.region?.label === 'mt-past-h' && p.overscroll !== 'contain')
  : p.inSlot));
console.log(`past list placement checks ${placement.length}, ${placeBad.length} fail`);
for (const p of placeBad) console.log(`FAIL placement ${JSON.stringify(p)}`);

const bad = results.filter((r) => !r.skip && !r.ok);
const exBad = extras.filter((x) => x.error || x.examples?.some((e) => !e.same) || x.motion?.some((m) => m.running.length));
fs.writeFileSync(path.join(OUT, `verify-mytrips-${WIDTHS.join('_')}.json`), JSON.stringify({ results, extras }, null, 2));
const maxCls = Math.max(0, ...results.map((r) => r.cls || 0));
console.log(`checked ${results.length} variant-tab-width cells, ${bad.length} fail; max CLS ${maxCls.toFixed(4)}; example and motion checks ${extras.length}, ${exBad.length} fail`);
for (const r of bad) console.log(`FAIL ${r.v} ${r.tab} ${r.w}: overflow ${r.overflow}, cls ${r.cls?.toFixed(4)}, axe ${JSON.stringify(r.axe)}, errors ${JSON.stringify(r.errors)}`);
for (const x of exBad) console.log(`FAIL ${x.v}: ${JSON.stringify(x)}`);
process.exit(bad.length || exBad.length || placeBad.length ? 1 : 0);
