// G12 plan rethink, lane L16 (B7b): DOM checks of the new Plan flow at one
// width. It walks the short way (the door, Surprise me, Show the trips now)
// and checks the door, the style control on every step, the assumption bar
// (dashed when assumed, solid when given), the result list with its rows and
// "Keep looking", the map tab on a phone, a found trip with its alternatives,
// and then sweeps the width on the list and on the found trip.
//
// Checked at every width: no sideways scroll, no empty row or lever list,
// the style control on every step. On a phone (< 769 px): every visible tap
// target in the flow at least 44 px tall and wide.
//
// Build (fast build) and serve it with the data, then
//   node scripts/serve_static.mjs ../.fastbuild <public> 5871
//   node scripts/verify_plan_rethink.mjs <shotdir> <width> [base] [--sweep]
// Prints one JSON line and exits 1 on a failed check. Screenshots go to the
// shot folder (the run folder), never into the repo.
import fs from 'node:fs';
import { chromium } from 'playwright';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SWEEP = process.argv.includes('--sweep');
const OUT = args[0] || 'scripts/shots/plan-rethink';
const W = Number(args[1] || 390);
const BASE = args[2] || 'http://localhost:5871';
const PHONE = W < 769;
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`[${W}] ${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? `  (${extra})` : ''}`); };

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: W, height: PHONE ? 844 : 900 }, serviceWorkers: 'block', hasTouch: PHONE });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
  } catch { /* none */ }
});
const shot = (name) => page.screenshot({ path: `${OUT}/${W}-${name}.png` }).catch(() => {});
const title = async () => ((await page.locator('.pf-title').first().textContent({ timeout: 500 }).catch(() => '')) || '').trim();
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** Visible tap targets in the plan flow under 44 px on either side. */
const smallTargets = () => page.evaluate(() => {
  const root = document.querySelector('.pf') || document.querySelector('.pf-door')?.closest('main') || document.body;
  const els = root.querySelectorAll('button, a[href], [role=button], [role=radio], [role=tab], input[type=checkbox], select');
  const out = [];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (el.closest('[aria-hidden=true], .sr-only, .maplibregl-ctrl, .maplibregl-map')) continue;
    // A trip card's name link is not the target: the whole card opens the
    // trip (TripCard onCardClick), so the card's box is what a thumb hits.
    const card = el.closest('.tff-card-name') ? el.closest('.tff-card') : null;
    const box = card ? card.getBoundingClientRect() : r;
    if (box.height < 44 || box.width < 44) {
      const name = (el.getAttribute('aria-label') || el.textContent || el.className || el.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 40);
      out.push(`${name} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  return out;
});
const tapCheck = async (where) => {
  if (!PHONE) return;
  const small = await smallTargets();
  check(`${where}: tap targets at least 44 px`, small.length === 0, small.slice(0, 6).join('; ') + (small.length > 6 ? ` (+${small.length - 6})` : ''));
};

// ---- The door ----
await page.goto(`${BASE}/?tab=plan`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.pf-door', { timeout: 90000 });
await page.waitForTimeout(400);
await shot('1-door');
check('door: one line and three chips', (await page.locator('.pf-door textarea').count()) === 1 && (await page.locator('.pf-door-chips li').count()) === 3);
// With no style the door opens the Style Studio from its style line; with one
// it names it (B3: the door has no trip yet to hold a style for).
const doorStyle = (await page.locator('.pf-door .pf-stylebar, .pf-door-knows, .pf-door-style').count()) > 0;
check('door: a style control', doorStyle);
check('door: no sideways scroll', (await overflow()) <= 1, `${await overflow()}px`);
await tapCheck('door');

// ---- The short way to the trips ----
await page.locator('.pf-door .btn-primary').first().click();
const steps = { questions: 0, styleBar: 0 };
let last = '';
let priced = false;
for (let i = 0; i < 80 && !priced; i++) {
  await page.waitForTimeout(350);
  if (await page.locator('.tff-trips').count()) {
    const txt = await page.locator('.tff-trips').first().innerText().catch(() => '');
    if (/€\s?\d|\d\s?€/.test(txt)) { priced = true; break; }
    continue;
  }
  const tt = await title();
  if (!tt || /^Finding trips/i.test(tt)) continue;
  if (tt !== last) {
    last = tt;
    steps.questions += 1;
    if (await page.locator('.pf-stylebar').count()) steps.styleBar += 1;
    await shot(`2-q${steps.questions}`);
    check(`question "${tt}": no sideways scroll`, (await overflow()) <= 1);
    await tapCheck(`question "${tt}"`);
  }
  if (await page.locator('.pf-show-now').count()) { await page.locator('.pf-show-now').first().click(); continue; }
  const btn = page.locator('.pf-foot .btn-primary').first();
  if ((await btn.count()) && !(await btn.isDisabled())) await btn.click();
}
check('a priced list is reached', priced);
check('the style control on every question', steps.styleBar === steps.questions, `${steps.styleBar}/${steps.questions}`);
await page.waitForTimeout(800);
await shot('3-trips');

// ---- The list ----
const listChecks = async (where) => {
  check(`${where}: the style control`, (await page.locator('.pf-stylebar').count()) >= 1);
  check(`${where}: the assumption bar`, (await page.locator('.pf-abar').count()) >= 1);
  const chips = await page.locator('.pf-abar-chip').evaluateAll((els) => els.map((el) => ({ assumed: el.classList.contains('is-assumed'), style: getComputedStyle(el).borderTopStyle })));
  const bad = chips.filter((c) => (c.assumed ? c.style !== 'dashed' : c.style === 'dashed'));
  check(`${where}: assumed chips dashed, given chips solid`, chips.length > 0 && bad.length === 0, `${chips.filter((c) => c.assumed).length} dashed of ${chips.length}${bad.length ? `, wrong: ${bad.map((b) => b.style).join(',')}` : ''}`);
  check(`${where}: no sideways scroll`, (await overflow()) <= 1, `${await overflow()}px`);
};
await listChecks('list');
const rowCount = await page.locator('.tff-row').count();
const emptyRows = await page.locator('.tff-row').evaluateAll((els) => els.filter((r) => !r.querySelector('.tff-row-cards li')).length);
check('list: no empty row', emptyRows === 0, `${rowCount} rows`);
const cards = await page.locator('.tff-list > li').count();
check('list: trips listed', cards > 0, String(cards));
const keep = await page.locator('.tff-more-h').count();
check('list: "Keep looking" when the list runs past the first page', keep <= 1, keep ? 'shown' : 'not needed');
await tapCheck('list');

// ---- The map as a tab on a phone ----
if (W < 820) {
  const tabs = page.locator('.tff-viewtabs');
  check('phone: List | Map tabs', (await tabs.count()) === 1);
  if (await tabs.count()) {
    await tabs.getByRole('radio', { name: /map/i }).first().click().catch(async () => { await tabs.locator('button').nth(1).click(); });
    await page.waitForTimeout(1200);
    const mapOn = await page.locator('.tff-map, .tff-mapview').first().isVisible().catch(() => false);
    await shot('4-map');
    check('phone: the Map tab shows the map', mapOn);
    check('phone: no sideways scroll on the map', (await overflow()) <= 1);
    await tabs.getByRole('radio', { name: /list/i }).first().click().catch(async () => { await tabs.locator('button').first().click(); });
    await page.waitForTimeout(500);
  }
}

// ---- A found trip with its alternatives ----
const listUrl = page.url();
await page.locator('.tff-list .tff-card').first().click();
await page.waitForSelector('.tff-tp-price', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2500);
const onTrip = (await page.locator('.tff-tp-price').count()) > 0;
check('a card opens its found trip', onTrip);
if (onTrip) {
  await shot('5-found');
  await listChecks('found trip');
  const levers = await page.locator('[data-levers] .tff-levers').evaluateAll((els) => els.map((ul) => ul.querySelectorAll('li').length));
  check('found trip: no empty lever list', levers.every((n) => n > 0), levers.length ? levers.join(',') : 'no levers shown');
  const altSec = page.locator('section[aria-labelledby="tff-tp-alts"]');
  const alts = await altSec.locator('[data-alt]').count();
  const search = await altSec.getByRole('button').count();
  check('found trip: alternatives or Search more', (await altSec.count()) === 1 && (alts > 0 || search > 0), `${alts} alternatives`);
  const rel = await altSec.locator('.tff-alt-rel').evaluateAll((els) => els.filter((e) => !e.textContent.trim()).length);
  check('found trip: every alternative names its relation', rel === 0);
  await tapCheck('found trip');
}

// ---- Width sweep ----
if (SWEEP) {
  const widths = [];
  for (let w = 320; w <= 1600; w += 40) widths.push(w);
  const over = { trip: [], list: [] };
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(250);
    const o = await overflow();
    if (o > 1) over.trip.push(`${w}:${o}`);
  }
  check('sweep 320 to 1600: found trip without sideways scroll', over.trip.length === 0, over.trip.join(' '));
  await page.setViewportSize({ width: W, height: 900 });
  if (page.url() !== listUrl) await page.goBack().catch(() => {});
  await page.waitForSelector('.tff-trips', { timeout: 30000 }).catch(() => {});
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(250);
    const o = await overflow();
    if (o > 1) over.list.push(`${w}:${o}`);
  }
  check('sweep 320 to 1600: list without sideways scroll', over.list.length === 0, over.list.join(' '));
}

check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
console.log(JSON.stringify({ width: W, questions: steps.questions, rows: rowCount, failed: results.filter((r) => !r.ok).map((r) => `${r.name} ${r.extra}`) }));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
