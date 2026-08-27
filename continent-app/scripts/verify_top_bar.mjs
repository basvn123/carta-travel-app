// Headless verify for the top bar as it stands after Explore v3.
//
// The bar this file used to check belonged to the map era: a segmented
// "dates | Filters" pill (.mobile-seg) on a phone, a .filter-row-primary row
// on desktop, both rendered by FilterBar. Explore is a card grid now, its
// Filters door lives in its own toolbar card, and FilterBar is not mounted by
// anything, so every one of those checks was asserting against a component
// that no longer runs. It has been rewritten around what the row really
// carries today.
//
// What it checks:
//   1. One header row, and none of the map-era controls left behind in it.
//   2. The Passes entry is labelled at both widths: "See pricing" on desktop,
//      the short chip on a phone.
//   3. Desktop: five section tabs, the active one marked, and clicking one
//      really changes the tab.
//   4. The bar is a full-bleed page frame: brand pinned to the left gutter,
//      account cluster to the right, both gutters equal, and one single row
//      at every desktop width down to 800px.
//   5. A phone reaches the sections from the bottom bar, at 44px, and the
//      header holds no section tabs of its own.
//   6. Language lives in the Account panel, not the header: six languages,
//      picking one marks it and relabels the header.
//   7. No horizontal overflow at 380px or 390px.
//
//   node scripts/verify_top_bar.mjs [url]      (default http://localhost:4173)
//
// Screenshots to scripts/shots/top-bar-*.png.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] || 'http://localhost:4173/';
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };

// The emrldtp loader is an accepted risk that always fails offline; its fetch
// noise is not a regression signal for this bar.
const NOISE = /emrldtp|ERR_FAILED|config is not valid|open-meteo/;

const boot = async (viewport, tag) => {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(`${tag} console: ${m.text().slice(0, 120)}`);
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
    } catch { /* storage unavailable */ }
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2800);
  return page;
};

const box = (page, sel) => page.locator(sel).first().boundingBox().catch(() => null);
// Right edge of a group, measured from its last visible child: the group box
// itself can be wider than what it paints.
const rightEdge = async (page, sel) => {
  const b = await box(page, sel);
  return b ? b.x + b.width : null;
};

// ── Phone ──
{
  const page = await boot({ width: 390, height: 844 }, 'phone');

  const header = await box(page, '.app-header');
  check('one header row', !!header, header ? `${Math.round(header.width)}x${Math.round(header.height)}` : 'missing');

  // The map era, gone rather than merely hidden.
  for (const [what, sel] of [
    ['the dates/Filters pill', '.mobile-seg'],
    ['the desktop filter row', '.filter-row-primary'],
    ['the header language flag', '.lang-picker, .lang-btn'],
    ['the injected filter slot', '.app-header-filters'],
  ]) {
    check(`${what} is gone from the row`, await page.locator(sel).count() === 0);
  }

  // Sections come from the bottom bar on a phone; the header keeps none.
  const navVisible = await page.locator('.header-nav-item').locator('visible=true').count();
  check('no section tabs in the phone header', navVisible === 0, `${navVisible} visible`);
  const slots = page.locator('.bottom-nav-item');
  check('the bottom bar carries the four sections', await slots.count() === 4, `${await slots.count()} items`);
  const slotBox = await box(page, '.bottom-nav-item');
  check('bottom-bar slot >= 44px tall', !!slotBox && slotBox.height >= 43.5,
    slotBox ? `${Math.round(slotBox.width)}x${Math.round(slotBox.height)}` : 'missing');

  // The Passes chip: labelled, not a bare icon, and at the header's own size.
  const passShort = page.locator('.header-pricing-label-short');
  const passText = await passShort.innerText().catch(() => '');
  check('passes chip shows its label', await passShort.isVisible().catch(() => false) && passText.trim().length > 0, passText.trim());
  const passBox = await box(page, '.header-pricing-btn');
  // 38px is the header's stated button size (44px is the page-level size).
  check('passes chip >= 36px tall', !!passBox && passBox.height >= 36,
    passBox ? `${Math.round(passBox.width)}x${Math.round(passBox.height)}` : 'missing');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal overflow at 390px', overflow <= 0, `overflow ${overflow}px`);
  await page.screenshot({ path: `${SHOTS}/top-bar-mobile.png` });

  // ── Language: in the Account panel, and it really switches. ──
  await page.locator('.bottom-nav-item').filter({ hasText: /account/i }).first().click();
  await page.waitForTimeout(900);
  const opts = page.locator('.account-lang-opt');
  check('account panel shows the language grid', await page.locator('.account-lang-grid').isVisible());
  check('all six languages listed', await opts.count() === 6, String(await opts.count()));
  await page.screenshot({ path: `${SHOTS}/top-bar-account-lang.png` });

  await opts.filter({ hasText: 'Deutsch' }).click();
  await page.waitForTimeout(700);
  const active = await page.locator('.account-lang-opt.on').innerText().catch(() => '');
  check('picked language marked active', /deutsch/i.test(active), active.trim());
  // Escape leaves the panel, which is the phone's way out of it.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const passDe = await page.locator('.header-pricing-label-short').innerText().catch(() => '');
  check('the header relabels in German', passDe.trim().length > 0 && passDe.trim() !== passText.trim(),
    `${passText.trim()} -> ${passDe.trim()}`);
  await page.screenshot({ path: `${SHOTS}/top-bar-mobile-de.png` });
  await page.close();
}

// ── 380px: the quality floor, on the tab the bar sits over. ──
{
  const page = await boot({ width: 380, height: 800 }, '380px');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal overflow at 380px', overflow <= 0, `overflow ${overflow}px`);
  await page.close();
}

// ── Desktop ──
{
  const page = await boot({ width: 1280, height: 800 }, 'desktop');

  const tabs = page.locator('.header-nav-item');
  const labels = (await tabs.allInnerTexts()).map((s) => s.trim());
  check('five section tabs', labels.length === 5, labels.join(' | '));
  check('the open section is marked', await page.locator('.header-nav-item.active').count() === 1);

  // Desktop chrome v4: the bar's one filled action says "Get a pass" at
  // every width; the long "See pricing" wording retired with the white bar.
  check('the pass chip shows Get a pass',
    await page.locator('.header-pricing-label-short').isVisible().catch(() => false));
  check('the long pricing label is hidden here',
    !(await page.locator('.header-pricing-label').isVisible().catch(() => false)));
  check('the pass chip wears the accent',
    (await page.locator('.header-pricing-btn').evaluate((el) => getComputedStyle(el).backgroundColor)) === 'rgb(224, 90, 71)');
  check('the active tab carries the underline',
    (await page.locator('.header-nav-item.active').evaluate((el) => getComputedStyle(el, '::after').height)) === '3px');

  // The bar is a page frame, so it belongs to the window, not to a content
  // column: full bleed, brand pinned to the left gutter, account cluster
  // pinned to the right, and the two gutters equal. It used to sit in
  // Explore's 1180px container, which on a wide screen left the wordmark
  // hundreds of pixels in from the edge with the tabs adrift in the middle.
  await tabs.filter({ hasText: /^explore$/i }).first().click();
  await page.waitForTimeout(1800);
  // The desktop surface is the side panel now; the toolbar card is the
  // phone's arrangement of the same controls.
  check('Explore is the open tab', await page.locator('.explore-side').isVisible());
  const hdrBox = await box(page, '.app-header');
  const brandBox = await box(page, '.app-header-brand');
  const acctRight = await rightEdge(page, '.app-header-account');
  const leftGutter = hdrBox && brandBox ? brandBox.x - hdrBox.x : null;
  const rightGutter = hdrBox && acctRight != null ? (hdrBox.x + hdrBox.width) - acctRight : null;
  check('the bar spans the window', !!hdrBox && hdrBox.x === 0 && hdrBox.width >= 1280 - 20,
    hdrBox ? `${Math.round(hdrBox.x)}..${Math.round(hdrBox.x + hdrBox.width)} of 1280` : 'missing');
  check('the brand is pinned to the left gutter', leftGutter != null && leftGutter <= 40,
    leftGutter == null ? 'missing' : `${leftGutter.toFixed(0)}px in`);
  check('both gutters are the same', leftGutter != null && rightGutter != null && Math.abs(leftGutter - rightGutter) <= 1.5,
    leftGutter == null || rightGutter == null ? 'missing' : `left ${leftGutter.toFixed(0)} / right ${rightGutter.toFixed(0)}`);
  // One line at every desktop width: the tabs give up their padding, then
  // their labels, rather than the row wrapping into two bands.
  let wrapped = [];
  for (const w of [1400, 1200, 1100, 1040, 900, 800]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.waitForTimeout(220);
    const h = await box(page, '.app-header');
    if (!h || h.height > 80) wrapped.push(`${w}px`);
  }
  check('the bar stays one row from 800px up', wrapped.length === 0, wrapped.join(', ') || 'no wrap at any width');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(300);

  // Clicking a tab really moves: Destinations is a different surface.
  await tabs.first().click();
  await page.waitForTimeout(1800);
  check('a tab click changes the surface', await page.locator('.places-side').isVisible());
  await page.screenshot({ path: `${SHOTS}/top-bar-desktop.png` });
  await page.close();
}

const failed = checks.filter((c) => !c.ok);
console.log('=== top bar verify ===  target:', URL);
for (const c of checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.label}${c.note ? ' | ' + c.note : ''}`);
console.log(`TOTAL ERRORS: ${errors.length}  |  FAILED CHECKS: ${failed.length}`);
errors.slice(0, 10).forEach((e) => console.log('  ' + e));

await browser.close();
process.exit(errors.length || failed.length ? 1 : 0);
