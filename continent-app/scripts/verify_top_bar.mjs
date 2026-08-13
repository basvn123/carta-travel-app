// Headless verify for the explore top bar rework: one segmented pill (dates
// value | labelled Filters) instead of three unlabelled icon circles, a
// labelled Passes chip, no language flag in the header (it moved to the
// Account panel), and 44px touch targets throughout.
//
//   node scripts/verify_top_bar.mjs [url]      (default http://localhost:4173)
//
// Runs at a 390x844 phone viewport plus a 1280px desktop pass. Screenshots to
// shots/top-bar-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';

const browser = await chromium.launch();
const errors = [];
const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };

const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
// The emrldtp loader is an accepted risk that always fails offline; its
// fetch noise is not a regression signal for this bar.
const NOISE = /emrldtp|ERR_FAILED|config is not valid/;
page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 120)); });

await page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3000);

// Make sure the Map tab (explore) is the active surface.
const exploreItem = page.locator('.bottom-nav-item').first();
if (await exploreItem.isVisible().catch(() => false)) {
  await exploreItem.click();
  await page.waitForTimeout(2000);
}

// ── The unified pill ──
check('segmented pill renders', await page.locator('.mobile-seg').isVisible());
const segBtns = page.locator('.mobile-seg-btn');
check('pill has exactly two segments', await segBtns.count() === 2, String(await segBtns.count()));
const datesText = await page.locator('.mobile-seg-value').innerText().catch(() => '');
check('dates segment carries a value', datesText.trim().length > 0, datesText);
const filtersText = await page.locator('.mobile-seg-label').innerText().catch(() => '');
check('filters segment is labelled', /filters/i.test(filtersText), filtersText);
check('old unlabelled icon circles are gone', await page.locator('.icon-btn').count() === 0);

// ── Right side: passes chip labelled, no language flag ──
check('no language flag in the header', await page.locator('.lang-picker, .lang-btn').count() === 0);
const passShort = page.locator('.header-pricing-label-short');
const passVisible = await passShort.isVisible().catch(() => false);
const passText = passVisible ? await passShort.innerText() : '';
check('passes chip shows its label', passVisible && /passes/i.test(passText), passText);

// ── Touch targets: every interactive element in the row is at least 44px ──
for (const [name, sel] of [
  ['dates segment', '.mobile-dates-anchor .mobile-seg-btn'],
  ['filters segment', '.mobile-seg > .mobile-seg-btn'],
  ['passes chip', '.app-header-account .header-pricing-btn'],
  ['account button', '.app-header-account .account-avatar-btn'],
]) {
  const box = await page.locator(sel).first().boundingBox().catch(() => null);
  check(`${name} target >= 44px tall`, !!box && box.height >= 43.5, box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'missing');
}

// No horizontal overflow of the top row.
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('no horizontal overflow at 390px', overflow <= 0, `overflow ${overflow}px`);
await page.screenshot({ path: 'shots/top-bar-mobile.png' });

// ── Dates popover opens from the pill ──
await page.locator('.mobile-dates-anchor .mobile-seg-btn').click();
await page.waitForTimeout(400);
check('dates popover opens', await page.locator('.mobile-dates-pop').isVisible());
await page.screenshot({ path: 'shots/top-bar-dates-pop.png' });
// Outside click on the header's dead space (not the map: a map tap opens a
// destination panel that would then cover the pill).
await page.mouse.click(370, 8);
await page.waitForTimeout(300);

// ── Filters sheet opens and carries the lifestyle entry ──
await page.locator('.mobile-seg > .mobile-seg-btn').click();
await page.waitForTimeout(500);
check('filter sheet opens', await page.locator('.filter-bar.mobile-open .filter-rows').isVisible());
check('lifestyle lives inside the sheet', await page.locator('.filter-bar.mobile-open .lifestyle-pill').isVisible());
await page.screenshot({ path: 'shots/top-bar-filter-sheet.png' });
await page.locator('.mobile-seg > .mobile-seg-btn').click();
await page.waitForTimeout(300);

// ── Language moved to the Account panel; switching works ──
await page.locator('.app-header-account .account-avatar-btn').click();
await page.waitForTimeout(800);
const langGrid = page.locator('.account-lang-grid');
check('account panel shows the language grid', await langGrid.isVisible());
check('all six languages listed', await page.locator('.account-lang-opt').count() === 6,
  String(await page.locator('.account-lang-opt').count()));
await page.screenshot({ path: 'shots/top-bar-account-lang.png' });
await page.locator('.account-lang-opt').filter({ hasText: 'Deutsch' }).click();
await page.waitForTimeout(600);
check('picked language marked active', await page.locator('.account-lang-opt.on').innerText()
  .then((s) => /deutsch/i.test(s)).catch(() => false));
// Close the panel and confirm the pill relabelled.
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
const panelStillOpen = await langGrid.isVisible().catch(() => false);
if (panelStillOpen) {
  await page.locator('.panel-close').first().click().catch(() => {});
  await page.waitForTimeout(400);
}
const filtersDe = await page.locator('.mobile-seg-label').innerText().catch(() => '');
check('pill relabels in German', /^filter$/i.test(filtersDe.trim()), filtersDe);
await page.screenshot({ path: 'shots/top-bar-mobile-de.png' });
await page.close();

// ── Desktop pass ──
const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
desk.on('pageerror', (e) => errors.push('desktop pageerror: ' + e.message.split('\n')[0]));
await desk.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});
await desk.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await desk.waitForTimeout(3000);
const deskMap = desk.locator('.header-nav-item').nth(1);
if (await deskMap.isVisible().catch(() => false)) { await deskMap.click(); await desk.waitForTimeout(2000); }
check('desktop: no language flag in header', await desk.locator('.lang-picker, .lang-btn').count() === 0);
const deskPricing = await desk.locator('.header-pricing-label').innerText().catch(() => '');
check('desktop: full See pricing label', /see pricing/i.test(deskPricing), deskPricing);
check('desktop: mobile pill hidden', !(await desk.locator('.mobile-seg').isVisible().catch(() => false)));
check('desktop: filter row still renders', await desk.locator('.filter-row-primary').isVisible());
await desk.screenshot({ path: 'shots/top-bar-desktop.png' });
await desk.close();

const failed = checks.filter((c) => !c.ok);
console.log('=== top bar verify ===  target:', URL);
for (const c of checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.label}${c.note ? ' | ' + c.note : ''}`);
console.log(`TOTAL ERRORS: ${errors.length}  |  FAILED CHECKS: ${failed.length}`);
errors.slice(0, 10).forEach((e) => console.log('  ' + e));

await browser.close();
process.exit(errors.length || failed.length ? 1 : 0);
