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

  const rail = page.locator('.kind-rail');
  check('phone: rail renders on the map tab', await rail.count() === 1);

  const chipCount = await page.locator('.kind-rail-chip:not(.kind-rail-clear)').count();
  check('phone: nine kind chips', chipCount === 9, `found ${chipCount}`);

  const scroll = await page.locator('.kind-rail-scroll').evaluate((el) => ({
    scrollable: el.scrollWidth > el.clientWidth,
  })).catch(() => null);
  check('phone: rail overflows horizontally (scrollable)', !!scroll?.scrollable);

  const chipBox = await page.locator('.kind-rail-chip').first().boundingBox();
  check('phone: chip height >= 36px', !!chipBox && chipBox.height >= 36, `h=${chipBox?.height}`);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('phone: no horizontal page overflow', overflow <= 0, `delta=${overflow}px`);

  await page.screenshot({ path: 'shots/category-rail-phone-off.png' });

  // How many places are on the board before the rail touches anything. The
  // sheet's primary action carries the live count, so it is the cheapest
  // honest read of "did the filter bite".
  const shownCount = async () => {
    await page.locator('.mobile-seg > .mobile-seg-btn').click();
    await page.locator('.fsheet').waitFor({ timeout: 15000 });
    await page.waitForTimeout(500);
    const txt = await page.locator('.fsheet-apply').innerText();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    return Number((txt.match(/[\d.,]{2,}/) || ['0'])[0].replace(/[.,]/g, ''));
  };
  const before = await shownCount();

  // Toggle Beach and confirm the filter actually bites: the chip turns on, the
  // shared state moves (the URL carries it), and the board shrinks.
  const beach = page.locator('.kind-rail-chip', { hasText: 'Beach' }).first();
  await beach.click();
  await page.waitForTimeout(1500);
  check('phone: Beach chip reports pressed', (await beach.getAttribute('aria-pressed')) === 'true');
  check('phone: the choice reaches shared state', /[?&]tk=beach/.test(page.url()), page.url().slice(-40));
  const after = await shownCount();
  check('phone: the rail narrows the board', after > 0 && after < before, `${before} -> ${after}`);
  // The Filters badge is for what the sheet holds. Trip style is not in there
  // any more (the rail IS the control), so a badge for it would point at a
  // sheet where the thing being counted cannot be found.
  const segCount = await page.locator('.mobile-seg-count').textContent().catch(() => null);
  check('phone: the Filters badge stays out of it', segCount == null, `badge=${segCount}`);
  check('phone: clear chip appears', await page.locator('.kind-rail-clear').count() === 1);
  await page.screenshot({ path: 'shots/category-rail-phone-on.png' });

  await page.locator('.kind-rail-clear').click();
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

  check('desktop: rail renders', await page.locator('.kind-rail').count() === 1);

  // The rail's height must be folded into --filter-h so the map is not covered.
  const geom = await page.evaluate(() => {
    const rail = document.querySelector('.kind-rail');
    const topBar = document.querySelector('.top-bar');
    const fh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--filter-h'));
    return rail && topBar ? { railBottom: rail.getBoundingClientRect().bottom, topBarH: topBar.offsetHeight, fh } : null;
  });
  check('desktop: --filter-h includes the rail', !!geom && Math.abs(geom.fh - geom.topBarH) < 2,
    geom ? `fh=${geom.fh} topBar=${geom.topBarH}` : 'missing nodes');

  const allin = page.locator('.legend-allin');
  check('desktop: legend states the all-inclusive price', await allin.count() === 1,
    (await allin.textContent().catch(() => '')) || '');

  await page.screenshot({ path: 'shots/category-rail-desktop.png' });

  // Best time tab: open a fare-rich destination through the Destinations tab
  // hand-off (same route verify_detail_sheet.mjs uses), then check the
  // monthly bars replaced the old fare line.
  const placesNav = page.locator('.header-nav-item', { hasText: /destinations/i });
  if (await placesNav.count()) {
    await placesNav.first().click();
    await page.waitForTimeout(1500);
    await page.locator('.places-search input').fill('valencia');
    await page.waitForTimeout(1200);
    const row = page.locator('.places-dcard').first();
    if (await row.count()) {
      await row.click();
      await page.waitForTimeout(3000);
      const tabs = page.locator('.panel-tabs button');
      if (await tabs.count() >= 2) {
        await tabs.nth(1).click();
        await page.waitForTimeout(2500);
        const cols = await page.locator('.month-chart .mo-col').count();
        const cheap = await page.locator('.mo-col.is-cheap').count();
        check('best time: monthly bars render', cols >= 3, `${cols} months`);
        check('best time: exactly one cheapest month', cheap === 1, `${cheap} green`);
        check('best time: old fare line gone', await page.locator('.bt-chart-wrap').count() === 0);
        if (cols > 0) {
          await page.locator('.month-chart').scrollIntoViewIfNeeded();
          await page.waitForTimeout(400);
        }
        await page.screenshot({ path: 'shots/best-time-monthbars.png' });
      } else {
        check('best time: panel tabs found', false, 'no .panel-tabs');
      }
    } else {
      check('best time: destination row found', false, 'no .places-dcard for valencia');
    }
  } else {
    check('best time: Destinations nav found', false);
  }

  check('desktop: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

await browser.close();
if (server) server.kill();

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
