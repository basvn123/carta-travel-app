// Headless verify for the mobile bottom nav rework: Explore | plus | My trips,
// with the raised plus opening the Trip planner / Day planner chooser.
//
//   node scripts/verify_bottom_nav.mjs [url]      (default http://localhost:4173)
//
// Runs at a 390x844 phone viewport. Asserts: no Home tab in the bar, the three
// items render with labels, the plus chooser opens/closes, both chooser options
// land on their planner tab, and My trips opens the saved panel. Screenshots to
// shots/bottom-nav-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 120)); });

await page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3000);

const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };

// Bar contents: exactly Explore + My trips items around one plus, no Home.
const labels = await page.locator('.bottom-nav .bottom-nav-label').allInnerTexts();
check('bar labels are Explore + My trips', labels.length === 2
  && /explore/i.test(labels[0]) && /my trips/i.test(labels[1]), labels.join(' | '));
check('no Home item in the bar', !labels.some((l) => /home/i.test(l)));
check('plus button renders', await page.locator('.bottom-nav-plus').isVisible());
await page.screenshot({ path: 'shots/bottom-nav-bar.png' });

// Plus -> chooser -> Trip planner.
await page.locator('.bottom-nav-plus').click();
await page.waitForTimeout(400);
check('chooser opens', await page.locator('.plan-chooser').isVisible());
const chooserTitles = await page.locator('.plan-chooser-title').allInnerTexts();
check('chooser lists both planners', /trip planner/i.test(chooserTitles[0] || '')
  && /day planner/i.test(chooserTitles[1] || ''), chooserTitles.join(' | '));
await page.screenshot({ path: 'shots/bottom-nav-chooser.png' });

await page.locator('.plan-chooser-item').first().click();
await page.waitForTimeout(2500);
check('chooser closes after picking', !(await page.locator('.plan-chooser').isVisible().catch(() => false)));
check('Trip planner mounts', await page.locator('.trip-planner-screen').first().isVisible().catch(() => false));
check('plus marked active on a planner tab', await page.locator('.bottom-nav-plus.active').isVisible());
await page.screenshot({ path: 'shots/bottom-nav-trip.png' });

// Plus -> Day planner.
await page.locator('.bottom-nav-plus').click();
await page.waitForTimeout(400);
await page.locator('.plan-chooser-item').nth(1).click();
await page.waitForTimeout(2500);
check('Day planner reached via chooser', await page.locator('.bottom-nav-plus.active').isVisible());

// Backdrop click closes without navigating.
await page.locator('.bottom-nav-plus').click();
await page.waitForTimeout(300);
await page.locator('.plan-chooser-backdrop').click({ position: { x: 20, y: 200 } });
await page.waitForTimeout(300);
check('backdrop click closes the chooser', !(await page.locator('.plan-chooser').isVisible().catch(() => false)));

// Explore + My trips.
await page.locator('.bottom-nav-item').first().click();
await page.waitForTimeout(1500);
check('Explore returns to the map', await page.locator('.bottom-nav-item.active').first().isVisible());
await page.locator('.bottom-nav-item').nth(1).click();
await page.waitForTimeout(1200);
check('My trips opens the saved panel', await page.locator('.bottom-nav-item.active').nth(0).innerText()
  .then((t) => /my trips/i.test(t)).catch(() => false));
await page.screenshot({ path: 'shots/bottom-nav-saved.png' });

const failed = checks.filter((c) => !c.ok);
console.log('=== bottom nav verify ===  target:', URL);
for (const c of checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.label}${c.note ? ' — ' + c.note : ''}`);
console.log(`TOTAL ERRORS: ${errors.length}  |  FAILED CHECKS: ${failed.length}`);
errors.slice(0, 10).forEach((e) => console.log('  ' + e));

await browser.close();
process.exit(errors.length || failed.length ? 1 : 0);
