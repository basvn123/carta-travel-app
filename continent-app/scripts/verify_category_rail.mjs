// Explore's trip styles (city, beach, nature and six more): where they live
// and that they filter. Self-hosts `vite preview` on 4198 unless argv[2]
// provides a URL. Run from continent-app/:  node scripts/verify_category_rail.mjs
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

const PORT = 4198;
const BASE = process.argv[2] || `http://127.0.0.1:${PORT}`;
const NOISE = /ERR_FAILED|config is not valid/;

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

// The trip styles are the rail's first group; its legend reads "Trip style".
const styleGroup = (page, scope) => page.locator(`${scope} details.xrail-group`, {
  has: page.locator('.xrail-styles'),
}).first();

// ── Phone pass ──────────────────────────────────────────────────────────────
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
  await page.locator('.xrow').first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(1500);

  // T383: the phone's top row is search and Filters only; the styles left it
  // (they held a full row of the first screen).
  check('phone: no trip-style strip in the top row',
    await page.locator('.explore-filterbar .xrail-styles, .explore-toolbar .kind-rail').count() === 0);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('phone: no horizontal page overflow', overflow <= 0, `delta=${overflow}px`);

  // The sheet's primary action carries the live count, so it is the cheapest
  // honest read of "did the filter bite".
  const openSheet = async () => {
    // The button is the shared .places-filter-btn (it was .explore-filter-btn).
    await page.locator('.explore-filterbar .places-filter-btn').first().click();
    await page.locator('.fsheet-explore').waitFor({ timeout: 15000 });
    await page.waitForTimeout(500);
  };
  const closeSheet = async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  };
  const sheetCount = async () => Number(((await page.locator('.fsheet-apply').innerText())
    .match(/[\d.,]{2,}/) || ['0'])[0].replace(/[.,]/g, ''));

  await openSheet();
  const group = styleGroup(page, '.fsheet-explore');
  check("phone: the styles are the sheet's first group",
    await page.locator('.fsheet-explore details.xrail-group').first().locator('.xrail-styles').count() === 1);
  check('phone: the style group starts open', (await group.getAttribute('open')) !== null);
  const chipCount = await group.locator('.xrail-toggle').count();
  check('phone: nine trip styles', chipCount === 9, `found ${chipCount}`);
  // T383: the house tap target (--tap, 44 px) on a coarse pointer, up from
  // the 36 px the tiles held.
  const chipBox = await group.locator('.xrail-toggle').first().boundingBox();
  check('phone: style toggle height >= 44px', !!chipBox && chipBox.height >= 43.5, `h=${chipBox?.height}`);
  await page.screenshot({ path: 'shots/category-rail-phone-off.png' });
  const before = await sheetCount();

  // Toggle Beach and confirm the filter bites: the toggle turns on, the shared
  // state moves (the URL carries it), and the count drops.
  const beach = group.locator('.xrail-toggle', { hasText: 'Beach' }).first();
  await beach.click();
  await page.waitForTimeout(1500);
  check('phone: Beach reports pressed', (await beach.getAttribute('aria-pressed')) === 'true');
  check('phone: the choice reaches shared state', /[?&]tk=beach/.test(page.url()), page.url().slice(-40));
  const after = await sheetCount();
  check('phone: the style narrows the board', after > 0 && after < before, `${before} -> ${after}`);
  await closeSheet();
  // T383: the opposite of the old check. The styles are in the sheet now, so
  // the Filters badge counts them like everything else it holds.
  const badge = await page.locator('.explore-filterbar .places-filter-btn .filter-tray-badge')
    .textContent().catch(() => null);
  check('phone: the Filters badge counts the style', badge === '1', `badge=${badge}`);
  // T383: a removable chip under the control bar replaces the strip's own
  // clear chip, and removing it resets the style.
  const chip = page.locator('.xchip:not(.xchip-clear)', { hasText: 'Beach' });
  check('phone: the style shows as a chip', await chip.count() === 1);
  await page.screenshot({ path: 'shots/category-rail-phone-on.png' });
  await chip.first().click();
  await page.waitForTimeout(800);
  check('phone: the chip clears the style', !/[?&]tk=/.test(page.url()), page.url().slice(-40));

  check('phone: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ── Desktop pass ────────────────────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => { if (!NOISE.test(String(e))) errors.push(String(e)); });
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(m.text());
  });
  await seed(page);
  await page.goto(`${BASE}/?tab=map`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('.xrow').first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(1500);

  // T383: the styles are the left panel's first fold (were a tile grid two
  // abreast above the rail), never in the top bar.
  const group = styleGroup(page, '.explore-side');
  check("desktop: the styles are the panel's first group",
    await page.locator('.explore-side details.xrail-group').first().locator('.xrail-styles').count() === 1);
  check('desktop: not in the top bar', await page.locator('.top-bar .xrail-styles').count() === 0);
  check('desktop: nine trip styles', await group.locator('.xrail-toggle').count() === 9);
  check("desktop: the phone's top row stays folded", await page.locator('.explore-filterbar').isHidden());
  check('desktop: the search rides in the header',
    await page.locator('.header-search-slot .results-search-input').isVisible().catch(() => false));

  const count = async () => Number((await page.locator('.xbar .xbar-count').innerText()).replace(/\D/g, ''));
  const before = await count();
  await group.locator('.xrail-toggle', { hasText: 'Beach' }).first().click();
  await page.waitForTimeout(1200);
  const after = await count();
  check('desktop: the style narrows the count', after > 0 && after < before, `${before} -> ${after}`);
  await page.locator('.explore-side .side-clear').click();
  await page.waitForTimeout(1000);
  check('desktop: Clear all resets the style', await group.locator('.xrail-toggle.on').count() === 0);

  await page.screenshot({ path: 'shots/category-rail-desktop.png' });

  // The Best time leg is gone: it walked the tabbed DetailPanel, and that
  // component is imported nowhere any more (the Explore hand-off opens the
  // ExplorePanel, whose when-to-go section verify_explore.mjs covers).

  check('desktop: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

await browser.close();
if (server) server.kill();

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
