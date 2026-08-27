// Explore tab enhancements: the trip-kind category rail under the top bar,
// the legend's all-inclusive line, and the Best time tab's monthly price bars.
// Self-hosts `vite preview` on 4198 unless argv[2] provides a URL.
// Run from continent-app/:  node scripts/verify_category_rail.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4198;
const BASE = process.argv[2] || `http://127.0.0.1:${PORT}`;
const NOISE = /emrldtp|ERR_FAILED|config is not valid/;

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
  localStorage.setItem('carta.mapGuideDone', '1');
});

await ensureServer();
const browser = await chromium.launch();

// ── Phone pass ──────────────────────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => { if (!NOISE.test(String(e))) errors.push(String(e)); });
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(m.text());
  });
  await seed(page);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);
  const nav = page.locator('.bottom-nav-item', { hasText: /explore/i });
  if (await nav.count()) await nav.first().click();
  await page.waitForTimeout(2500);

  // The rail renders twice since desktop chrome v4 (toolbar card for the
  // phone, side panel for desktop); on a phone only the toolbar's shows.
  const rail = page.locator('.kind-rail:visible');
  check('phone: rail renders on the map tab', await rail.count() === 1);

  const chipCount = await page.locator('.explore-toolbar .kind-rail-chip:not(.kind-rail-clear)').count();
  check('phone: nine kind chips', chipCount === 9, `found ${chipCount}`);

  // Mobile chrome v4: the rail is one thumb-scrollable row of tiles, each
  // wearing a small accent tick, the tenth tile peeking past the edge to say
  // the row moves. (It used to wrap into equal rows; the mock this follows
  // scrolls, and nine wrapped tiles pushed the grid below the fold.)
  const railFit = await page.evaluate(() => {
    const el = document.querySelector('.explore-toolbar .kind-rail-scroll');
    const search = document.querySelector('.explore-toolbar .explore-search');
    if (!el || !search) return null;
    const a = el.getBoundingClientRect(); const b = search.getBoundingClientRect();
    return {
      scrollable: el.scrollWidth > el.clientWidth + 1,
      oneRow: a.height < 80,
      inCard: !!el.closest('.explore-toolbar'),
      dLeft: Math.abs(a.left - b.left),
      dRight: Math.abs(a.right - b.right),
    };
  });
  check('phone: rail sits inside the toolbar band', !!railFit?.inCard);
  check('phone: rail is one row and scrolls sideways',
    railFit?.scrollable === true && railFit?.oneRow === true);
  check('phone: rail spans the same column as the search field',
    !!railFit && railFit.dLeft < 4 && railFit.dRight < 4,
    railFit ? `dL=${railFit.dLeft.toFixed(1)} dR=${railFit.dRight.toFixed(1)}` : 'missing nodes');
  const tickH = await page.locator('.explore-toolbar .kind-rail-chip').first()
    .evaluate((el) => getComputedStyle(el, '::before').height).catch(() => '');
  check('phone: tiles carry the accent tick', tickH === '2px', tickH);

  const chipBox = await page.locator('.explore-toolbar .kind-rail-chip').first().boundingBox();
  check('phone: chip height >= 36px', !!chipBox && chipBox.height >= 36, `h=${chipBox?.height}`);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('phone: no horizontal page overflow', overflow <= 0, `delta=${overflow}px`);

  await page.screenshot({ path: 'shots/category-rail-phone-off.png' });

  // How many places are on the board before the rail touches anything. The
  // sheet's primary action carries the live count, so it is the cheapest
  // honest read of "did the filter bite".
  const shownCount = async () => {
    await page.locator('.explore-filter-btn:visible').first().click();
    await page.locator('.fsheet-explore').waitFor({ timeout: 15000 });
    await page.waitForTimeout(500);
    const txt = await page.locator('.fsheet-apply').innerText();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    return Number((txt.match(/[\d.,]{2,}/) || ['0'])[0].replace(/[.,]/g, ''));
  };
  const before = await shownCount();

  // Toggle Beach and confirm the filter actually bites: the chip turns on, the
  // shared state moves (the URL carries it), and the board shrinks.
  const beach = page.locator('.explore-toolbar .kind-rail-chip', { hasText: 'Beach' }).first();
  await beach.click();
  await page.waitForTimeout(1500);
  check('phone: Beach chip reports pressed', (await beach.getAttribute('aria-pressed')) === 'true');
  check('phone: the choice reaches shared state', /[?&]tk=beach/.test(page.url()), page.url().slice(-40));
  const after = await shownCount();
  check('phone: the rail narrows the board', after > 0 && after < before, `${before} -> ${after}`);
  // The Filters badge is for what the sheet holds. Trip style is not in there
  // any more (the rail IS the control), so a badge for it would point at a
  // sheet where the thing being counted cannot be found.
  const segCount = await page.locator('.explore-toolbar .explore-filter-btn .filter-tray-badge')
    .textContent().catch(() => null);
  check('phone: the Filters badge stays out of it', segCount == null, `badge=${segCount}`);
  check('phone: clear chip appears', await page.locator('.explore-toolbar .kind-rail-clear').count() === 1);
  await page.screenshot({ path: 'shots/category-rail-phone-on.png' });

  await page.locator('.explore-toolbar .kind-rail-clear').click();
  await page.waitForTimeout(800);
  check('phone: clear resets the rail', await page.locator('.kind-rail-chip.on').count() === 0);

  check('phone: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
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
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);
  const mapNav = page.locator('.header-nav-item', { hasText: /^explore$/i });
  if (await mapNav.count()) await mapNav.first().click();
  await page.waitForTimeout(2500);

  check('desktop: rail renders', await page.locator('.kind-rail:visible').count() === 1);

  // Desktop chrome v4: the rail stands in the left filter panel, two tiles
  // abreast, and the toolbar card (the phone's arrangement) stays folded.
  // The search field it used to align with rides in the app header now.
  const geom = await page.evaluate(() => {
    const rail = document.querySelector('.explore-side .kind-rail');
    const panel = document.querySelector('.explore-side');
    if (!rail || !panel) return null;
    const grid = rail.querySelector('.kind-rail-scroll');
    return {
      inTopBar: !!rail.closest('.top-bar'),
      cols: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
    };
  });
  check('desktop: rail lives in the side panel, not the top bar',
    !!geom && !geom.inTopBar);
  check('desktop: two tiles per panel row', !!geom && geom.cols === 2, `cols=${geom?.cols}`);
  check('desktop: the toolbar card stays folded', await page.locator('.explore-toolbar').isHidden());
  check('desktop: the search rides in the header',
    await page.locator('.header-search-slot .results-search-input').isVisible().catch(() => false));

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
