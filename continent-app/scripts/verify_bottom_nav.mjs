// Headless verify for the mobile bottom nav: Destinations | Explore | plus |
// My trips | Account, with the raised plus opening the Trip planner / Day
// planner chooser.
//
//   node scripts/verify_bottom_nav.mjs [url]      (default http://localhost:4173)
//
// Runs at a 390x844 phone viewport. Asserts: no Home tab in the bar, the four
// labelled items render whole (no ellipsis truncation), the plus chooser
// opens/closes, both chooser options land on their planner tab, My trips opens
// the saved panel and Account opens the account panel. Screenshots to
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

// Bar contents: Destinations + Explore + My trips + Account around one plus.
const labels = await page.locator('.bottom-nav .bottom-nav-label').allInnerTexts();
check('bar labels are Destinations | Explore | My trips | Account',
  labels.length === 4
  && /destinations/i.test(labels[0]) && /explore/i.test(labels[1])
  && /my trips/i.test(labels[2]) && /account/i.test(labels[3]), labels.join(' | '));
check('no Home item in the bar', !labels.some((l) => /home/i.test(l)));
check('plus button renders', await page.locator('.bottom-nav-plus').isVisible());
// No label may truncate: a clipped DESTINATI... reads as a broken bar.
const clipped = await page.locator('.bottom-nav-label').evaluateAll(
  (els) => els.filter((el) => el.scrollWidth > el.clientWidth).map((el) => el.textContent));
check('no label truncates', clipped.length === 0, clipped.join(' | '));
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

// Destinations (leftmost) -> the places tab.
await page.locator('.bottom-nav-item').nth(0).click();
await page.waitForTimeout(1200);
check('Destinations opens the places tab', await page.locator('.places-tab').isVisible());
check('Destinations item marked active', await page.locator('.bottom-nav-item.active .bottom-nav-label').first()
  .innerText().then((t) => /destinations/i.test(t)).catch(() => false));

// Explore.
await page.locator('.bottom-nav-item').nth(1).click();
await page.waitForTimeout(1500);
check('Explore returns to the map', await page.locator('.bottom-nav-item.active .bottom-nav-label').first()
  .innerText().then((t) => /explore/i.test(t)).catch(() => false));

// My trips.
await page.locator('.bottom-nav-item').nth(2).click();
await page.waitForTimeout(1200);
check('My trips opens the saved panel', await page.locator('.bottom-nav-item.active .bottom-nav-label').first()
  .innerText().then((t) => /my trips/i.test(t)).catch(() => false));
await page.screenshot({ path: 'shots/bottom-nav-saved.png' });

// Account (rightmost) opens the account panel and takes the active state.
await page.locator('.bottom-nav-item').nth(3).click();
await page.waitForTimeout(1200);
check('Account opens the account panel', await page.locator('.account-panel').isVisible());
check('Account item marked active', await page.locator('.bottom-nav-item.active .bottom-nav-label').first()
  .innerText().then((t) => /account/i.test(t)).catch(() => false));
check('no account avatar in the mobile top bar', !(await page.locator('.account-avatar-btn').isVisible().catch(() => false)));
await page.screenshot({ path: 'shots/bottom-nav-account.png' });

// Tapping Account again closes the panel (a toggle, like a tab).
await page.locator('.bottom-nav-item').nth(3).click();
await page.waitForTimeout(600);
check('Account tap toggles the panel shut', !(await page.locator('.account-panel').isVisible().catch(() => false)));

const failed = checks.filter((c) => !c.ok);
console.log('=== bottom nav verify ===  target:', URL);
for (const c of checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.label}${c.note ? ' — ' + c.note : ''}`);
console.log(`TOTAL ERRORS: ${errors.length}  |  FAILED CHECKS: ${failed.length}`);
errors.slice(0, 10).forEach((e) => console.log('  ' + e));

await browser.close();
process.exit(errors.length || failed.length ? 1 : 0);
