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

  // The rail lives inside the Explore toolbar card now and wraps into equal
  // rows instead of scrolling sideways, so every row has to end exactly where
  // the search field under it does. A sideways scroller hid whatever did not
  // fit; rows show the whole vocabulary at once.
  const railFit = await page.evaluate(() => {
    const el = document.querySelector('.kind-rail-scroll');
    const search = document.querySelector('.explore-search');
    if (!el || !search) return null;
    const a = el.getBoundingClientRect(); const b = search.getBoundingClientRect();
    return {
      scrollable: el.scrollWidth > el.clientWidth + 1,
      inCard: !!el.closest('.explore-toolbar'),
      dLeft: Math.abs(a.left - b.left),
      dRight: Math.abs(a.right - b.right),
    };
  });
  check('phone: rail sits inside the toolbar card', !!railFit?.inCard);
  check('phone: rail wraps into rows, never scrolls sideways', railFit?.scrollable === false);
  check('phone: rail rows line up with the search field',
    !!railFit && railFit.dLeft < 2 && railFit.dRight < 2,
    railFit ? `dL=${railFit.dLeft.toFixed(1)} dR=${railFit.dRight.toFixed(1)}` : 'missing nodes');

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
    await page.locator('.explore-filter-btn').click();
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
  const segCount = await page.locator('.explore-filter-btn .filter-tray-badge')
    .textContent().catch(() => null);
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

  // The rail moved out of .top-bar and into the toolbar card, so it is no
  // longer chrome whose height --filter-h has to account for: it scrolls away
  // with the grid like every other control in that card.
  // On a wide screen the search field shares its row with the sorts and the
  // chips, so the card's own content box is what the rail has to span, not
  // the field. (On a phone they are the same thing, which is what the phone
  // pass above checks.)
  const geom = await page.evaluate(() => {
    const rail = document.querySelector('.kind-rail');
    const card = document.querySelector('.explore-toolbar');
    const search = document.querySelector('.explore-search');
    if (!rail || !card || !search) return null;
    const a = rail.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const cs = getComputedStyle(card);
    return {
      inCard: !!rail.closest('.explore-toolbar'),
      inTopBar: !!rail.closest('.top-bar'),
      dLeft: Math.abs(a.left - (c.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth))),
      dRight: Math.abs(a.right - (c.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth))),
      aboveSearch: a.bottom <= search.getBoundingClientRect().top + 1,
    };
  });
  check('desktop: rail lives in the toolbar card, not the top bar',
    !!geom && geom.inCard && !geom.inTopBar);
  check('desktop: rail sits directly above the search field', !!geom && geom.aboveSearch);
  check('desktop: rail rows span the card exactly',
    !!geom && geom.dLeft < 2 && geom.dRight < 2,
    geom ? `dL=${geom.dLeft.toFixed(1)} dR=${geom.dRight.toFixed(1)}` : 'missing nodes');

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
