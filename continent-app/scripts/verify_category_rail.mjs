// Explore's trip styles (city, beach, nature and six more): where they live
// and that they filter. Self-hosts `vite preview` on 4198 unless argv[2]
// provides a URL. Run from continent-app/:  node scripts/verify_category_rail.mjs
//
// T440 (2026-10-13): the trip styles are kit Tiles at the top of the rail,
// and the counts they used to move are gone (owner: no counts), so a filter
// "bites" when the first names on the list change.
//
// T383 (design wave V3, 2026-10-08) updated every check in this harness.
// It was written for the trip styles as a strip of tiles of their own (at the
// top of the phone toolbar, two abreast above the filter rail on desktop),
// outside the filter state: no chip, no Filters badge, a clear chip of their
// own. V3 made them the first group of the filter rail (brief V3-4 and V3-7),
// so on a phone they live in the Filters sheet and on desktop at the top of
// the left panel, and they make chips, count on the Filters badge and reset
// with Clear all like every other filter. Each check keeps the behaviour it
// guarded and reads it off today's controls, with a comment where the
// expectation itself changed. Before V3 it stopped at its first locator
// (row T384-e).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = Number(process.env.CARTA_PORT) || 4198;
const BASE = (process.argv[2] || `http://127.0.0.1:${PORT}`).replace(/\/$/, '');
const NOISE = /ERR_FAILED|ERR_TUNNEL_CONNECTION_FAILED|config is not valid/;

mkdirSync('shots', { recursive: true });

let server = null;
async function ensureServer() {
  if (process.argv[2]) return;
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(1500) });
    if (res.ok) return;
  } catch { /* not serving yet */ }
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(), shell: true, stdio: 'ignore',
  });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(BASE, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return;
    } catch { /* keep waiting */ }
  }
  throw new Error('preview server never came up');
}

const checks = [];
const check = (name, ok, note = '') => {
  checks.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const seed = (page) => page.addInitScript(() => {
  localStorage.setItem('continent.lang.v1', 'en');
  localStorage.setItem('continent.guestMode.v1', '1');
  localStorage.setItem('continent.homeSeen.v1', '1');
  localStorage.setItem('carta.welcomeSeen', '1');
  localStorage.setItem('carta.welcomeSeen.v1', '1');
  localStorage.setItem('carta.fareNoticeSeen', '1');
  localStorage.setItem('continent.onboardingSeen.v1', '1');
});

await ensureServer();
const browser = await chromium.launch();

// T1089: refreshed for Explore v6+. The trip styles are no longer kit Tiles at the top of the
// rail: they are the "Kind of place" chips (nine of them) in the filter pane, which opens from
// the overview's "All filters" chip on a desktop; the six category tabs (Places, Trails, ...)
// are a different row. A style still makes a chip, counts on the Filters badge, narrows the
// list, lands in the address as tk= and resets with Clear all. Phone: the sheet hangs off the
// dock's round button, so the phone pass drives the style through the address and checks the
// chip, the list and the overflow.
const firstNames = async (page) => (await page.locator('.xrow .xrow-name').allInnerTexts()).slice(0, 10).join('|');
const kindChip = (scope, label) => scope.locator('.xpane-chips .ui-chip', { hasText: label }).first();

// ── Phone pass ────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { if (!NOISE.test(String(e))) errors.push(String(e)); });
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(m.text());
  });
  await seed(page);
  await page.goto(`${BASE}/?tab=map`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('.xcats-bar').waitFor({ timeout: 90000 });
  await page.waitForTimeout(1500);
  check('phone: no trip-style tiles in a top row',
    await page.locator('.explore-filterbar .xrail-tiles, .explore-toolbar .kind-rail').count() === 0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('phone: no horizontal page overflow', overflow <= 0, `delta=${overflow}px`);
  check('phone: six category tabs', await page.locator('.xcats .ui-tab').count() === 6);

  // A style arrives as ?tk=: the list opens narrowed and wears a chip.
  await page.goto(`${BASE}/?tab=map&tk=beach`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('.xrow').first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(1500);
  const names = await firstNames(page);
  check('phone: the beach style narrows the list', names !== '' && !/^Rome/.test(names), names.slice(0, 40));
  const chip = page.locator('.xchip:not(.xchip-clear)', { hasText: 'Beach' });
  check('phone: the style shows as a chip', await chip.count() === 1);
  await page.screenshot({ path: 'shots/category-rail-phone-on.png' });
  await chip.first().click();
  await page.waitForTimeout(800);
  check('phone: the chip clears the style', !/[?&]tk=/.test(page.url()), page.url().slice(-40));

  check('phone: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ── Desktop pass ───────────────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => { if (!NOISE.test(String(e))) errors.push(String(e)); });
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(m.text());
  });
  await seed(page);
  await page.goto(`${BASE}/?tab=map`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('.xquick-filters').waitFor({ timeout: 90000 });
  await page.waitForTimeout(1500);

  check('desktop: not in the top bar', await page.locator('.top-bar .xrail-tiles').count() === 0);
  check("desktop: the phone's top row stays folded", await page.locator('.explore-filterbar').count() === 0 || await page.locator('.explore-filterbar').isHidden());
  // T1089: the search no longer rides in the header here; the overview carries its own field.
  check('desktop: the overview carries the search field',
    await page.locator('.xov-where-input').isVisible().catch(() => false));

  // The overview's "All filters" chip opens the pane; its first group of chips is the kind of place.
  await page.locator('.xquick-filters').click();
  await page.locator('.xpane').waitFor({ state: 'visible', timeout: 15000 });
  const pane = page.locator('.explore-side');
  const kinds = await pane.locator('.xpane-chips').first().locator('.ui-chip').count();
  check('desktop: nine trip styles in the pane', kinds === 9, `found ${kinds}`);

  await kindChip(pane, 'Beach').click();
  await page.waitForTimeout(2500);
  check('desktop: the choice reaches shared state', /[?&]tk=beach/.test(page.url()), page.url().slice(-40));
  const after = await firstNames(page);
  check('desktop: the style narrows the list', after !== '' && !/^Rome/.test(after), after.slice(0, 40));
  const badge = await page.locator('.xfilters-n').textContent().catch(() => null);
  check('desktop: the Filters button counts the style', badge === '1', `badge=${badge}`);
  check('desktop: the style shows as a chip', await page.locator('.xchip:not(.xchip-clear)', { hasText: 'Beach' }).count() === 1);
  // One "Clear all" since T444: the chips row above the list.
  await page.locator('.xchips .xchip-clear').click();
  await page.waitForTimeout(1000);
  check('desktop: Clear all resets the style', !/[?&]tk=/.test(page.url()), page.url().slice(-40));

  await page.screenshot({ path: 'shots/category-rail-desktop.png' });
  check('desktop: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

await browser.close();
if (server) server.kill();

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
