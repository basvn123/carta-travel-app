// Headless verify for the destination detail v2: on phones the panel is a
// bottom sheet over the map (half snap on open, tap the grip for full, cost
// groups and the about block fold), on desktop it stays the side panel.
//
//   node scripts/verify_detail_sheet.mjs [url]      (default http://localhost:4173)
//
// Screenshots to shots/detail-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';

const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };
const errors = [];
// Known third-party noise (the emrldtp loader is an accepted risk and fails
// by design on localhost); everything else still counts as an error.
const IGNORE = /emrldtp|ERR_FAILED|config is not valid/;
const logError = (msg) => { if (!IGNORE.test(msg)) errors.push(msg); };

const seed = (page) => page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});

// Open a destination's detail panel via the Destinations tab (search + row
// click hands over to the map tab, which opens the panel).
const openDetail = async (page, viaHeader) => {
  if (viaHeader) {
    await page.locator('.header-nav-item', { hasText: 'Destinations' }).click();
  } else {
    await page.locator('.bottom-nav-item').nth(0).click();
  }
  await page.waitForTimeout(1500);
  await page.locator('.places-search input').fill('malbork');
  await page.waitForTimeout(900);
  // The tab lists photo cards now (.places-dcard); the old .places-row markup
  // went with the Destinations rework.
  await page.locator('.places-dcard').first().click();
  await page.waitForTimeout(2500);
};

// ── Mobile: bottom sheet ──────────────────────────────────────────────────
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => logError('pageerror: ' + e.message.split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error') logError('console: ' + m.text().slice(0, 120)); });
await seed(page);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3000);

await openDetail(page, false);
const sheet = page.locator('.panel.dest-panel.open');
check('detail sheet opens', await sheet.isVisible());
let box = await sheet.boundingBox();
check('opens at the half snap, map visible above',
  !!box && box.height < 620 && box.y > 120, box ? `y=${Math.round(box.y)} h=${Math.round(box.height)}` : 'no box');
check('grip is shown on the phone sheet', await page.locator('.dest-grip').isVisible());
check('trails module is gone from the panel', (await page.locator('.trails-nearby').count()) === 0);
check('about block folded by default',
  (await page.locator('.panel-acc').count()) === 0
  || await page.locator('.panel-acc .acc-fold').first().getAttribute('aria-hidden') === 'true');
await page.screenshot({ path: 'shots/detail-sheet-half.png' });

// Tap the grip: half -> full.
await page.locator('.dest-grip-hit').click();
await page.waitForTimeout(600);
box = await sheet.boundingBox();
check('grip tap expands to full', !!box && box.y < 80, box ? `y=${Math.round(box.y)} h=${Math.round(box.height)}` : 'no box');
await page.screenshot({ path: 'shots/detail-sheet-full.png' });

// About accordion opens with content.
if (await page.locator('.panel-acc-head').count()) {
  await page.locator('.panel-acc-head').first().click();
  await page.waitForTimeout(500);
  check('about accordion opens',
    await page.locator('.panel-acc .acc-fold').first().getAttribute('aria-hidden') === 'false');
}

// First cost group folds open and shows rows.
const firstGroup = page.locator('.cost-group').first();
await firstGroup.locator('.cost-group-head').click();
await page.waitForTimeout(500);
check('cost group folds open',
  await firstGroup.locator('.acc-fold').getAttribute('aria-hidden') === 'false');
check('cost rows visible inside', await firstGroup.locator('.total-row').first().isVisible());
check('sticky total renders', await page.locator('.cost-total-val').isVisible());
await page.screenshot({ path: 'shots/detail-sheet-groups.png' });

// Best time tab: chart + swipeable climate strip.
await page.locator('.panel-tabs .tab').nth(1).click();
await page.waitForTimeout(1200);
const climate = page.locator('.dest-panel .climate-chart');
if (await climate.count()) {
  const scrollable = await climate.evaluate((el) => el.scrollWidth > el.clientWidth + 4);
  check('climate strip swipes horizontally', scrollable);
}
await page.screenshot({ path: 'shots/detail-sheet-besttime.png' });

// Grip tap back to half, then drag low to dismiss.
await page.locator('.dest-grip-hit').click();
await page.waitForTimeout(500);
const grip = await page.locator('.dest-grip-hit').boundingBox();
if (grip) {
  const cx = grip.x + grip.width / 2;
  await page.mouse.move(cx, grip.y + 6);
  await page.mouse.down();
  await page.mouse.move(cx, grip.y + 480, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  check('dragging low dismisses the sheet', !(await sheet.isVisible().catch(() => false)));
}
await page.close();

// ── Desktop: still the side panel, no grip ────────────────────────────────
const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
desk.on('pageerror', (e) => logError('desktop pageerror: ' + e.message.split('\n')[0]));
await seed(desk);
await desk.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await desk.waitForTimeout(3000);
await openDetail(desk, true);
const dsheet = desk.locator('.panel.dest-panel.open');
check('desktop panel opens', await dsheet.isVisible());
const dbox = await dsheet.boundingBox();
check('desktop stays a side panel', !!dbox && dbox.width < 520 && dbox.x > 900,
  dbox ? `x=${Math.round(dbox.x)} w=${Math.round(dbox.width)}` : 'no box');
check('grip hidden on desktop', !(await desk.locator('.dest-grip').isVisible().catch(() => false)));
check('close button stays put over the hero', await desk.locator('.panel-close').isVisible());
await desk.screenshot({ path: 'shots/detail-desktop.png' });
await desk.close();

const failed = checks.filter((c) => !c.ok);
console.log('=== detail sheet verify ===  target:', URL);
for (const c of checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.label}${c.note ? ' | ' + c.note : ''}`);
console.log(`TOTAL ERRORS: ${errors.length}  |  FAILED CHECKS: ${failed.length}`);
errors.slice(0, 10).forEach((e) => console.log('  ' + e));

await browser.close();
process.exit(errors.length || failed.length ? 1 : 0);
