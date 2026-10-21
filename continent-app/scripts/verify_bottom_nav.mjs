// Headless verify for the phone bottom nav (T496): Explore | Plan | My trips |
// Account, four slots of --tap-main, no plus; Plan with nothing in progress
// opens the "Plan something new" page with two tiles, Trip and One day.
//
//   node scripts/verify_bottom_nav.mjs [url]      (default http://localhost:$CARTA_PORT or 4173)
//
// Runs at a 390x844 phone viewport. Asserts: no Home slot, the four labelled
// slots render whole and at least 48 px tall, Plan opens the start page whose
// two tiles land on the trip and the day planner with Plan still marked, My
// trips and Account open their pages with their own address, and Back closes
// Account. Screenshots to shots/bottom-nav-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 120)); });

await page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3000);

const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };

const active = () => page.locator('.bottom-nav-item.active .bottom-nav-label').first().innerText().catch(() => '');

// Bar contents: Explore + Plan + My trips + Account, no plus.
const labels = await page.locator('.bottom-nav .bottom-nav-label').allInnerTexts();
check('bar labels are Explore | Plan | My trips | Account',
  labels.length === 4
  && /explore/i.test(labels[0]) && /^plan$/i.test(labels[1].trim())
  && /my trips/i.test(labels[2]) && /account/i.test(labels[3]), labels.join(' | '));
check('no Home item in the bar', !labels.some((l) => /home/i.test(l)));
check('no plus in the bar', (await page.locator('.bottom-nav-plus, .plan-chooser').count()) === 0);
const slotHeights = await page.locator('.bottom-nav-item').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
check('every slot is at least 48 px tall (--tap-main)', slotHeights.every((h) => h >= 48), slotHeights.join(', '));
const clipped = await page.locator('.bottom-nav-label').evaluateAll(
  (els) => els.filter((el) => el.scrollWidth > el.clientWidth).map((el) => el.textContent));
check('no label truncates', clipped.length === 0, clipped.join(' | '));
check('Explore is the default place', /explore/i.test(await active()));
await page.screenshot({ path: 'shots/bottom-nav-bar.png' });

// Plan with nothing in progress -> the start page.
await page.evaluate(() => { try { localStorage.removeItem('carta.tripDraft.v1'); } catch { /* */ } });
await page.locator('.bottom-nav-item').nth(1).click();
await page.waitForTimeout(800);
check('Plan opens "Plan something new"', /plan something new/i.test(await page.locator('.plan-start-h').innerText().catch(() => '')));
check('Plan marked active', /^plan$/i.test((await active()).trim()));
check('the address names Plan', /[?&]tab=plan/.test(page.url()), page.url());
const tiles = await page.evaluate(() => [...document.querySelectorAll('.plan-start-tile')].map((e) => {
  const r = e.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), art: !!e.querySelector('svg.plan-start-art'), text: e.innerText.trim() };
}));
check('two drawn tiles, Trip and One day, well over the touch floor',
  tiles.length === 2 && tiles.every((x) => x.art && x.h >= 88) && /trip/i.test(tiles[0].text) && /one day/i.test(tiles[1].text), JSON.stringify(tiles));
await page.screenshot({ path: 'shots/bottom-nav-planstart.png' });

await page.locator('.plan-start-tile').first().click();
await page.waitForTimeout(2500);
check('Trip planner mounts', await page.locator('.trip-planner-screen').first().isVisible().catch(() => false));
check('Plan still marked on the trip', /^plan$/i.test((await active()).trim()));

// Back to the start page, then One day.
await page.goBack();
await page.waitForTimeout(800);
check('Back returns to the start page', await page.locator('.plan-start').isVisible().catch(() => false));
await page.locator('.plan-start-tile').nth(1).click();
await page.waitForTimeout(2500);
check('One day opens the day planner inside Plan', /mode=day/.test(page.url()) && /^plan$/i.test((await active()).trim()), page.url());

// Explore.
await page.locator('.bottom-nav-item').nth(0).click();
await page.waitForTimeout(1500);
check('Explore opens Places', await page.locator('.explore-tab').isVisible().catch(() => false));

// My trips.
await page.locator('.bottom-nav-item').nth(2).click();
await page.waitForTimeout(1200);
check('My trips is marked and addressed', /my trips/i.test(await active()) && /[?&]tab=trips/.test(page.url()), page.url());
await page.screenshot({ path: 'shots/bottom-nav-saved.png' });

// Account (rightmost) opens the account page and takes the active state.
await page.locator('.bottom-nav-item').nth(3).click();
await page.waitForTimeout(1200);
check('Account opens the account page', await page.locator('.account-panel').isVisible());
check('Account item marked active', /account/i.test(await active()));
check('Account has an address', /[?&]tab=account/.test(page.url()), page.url());
check('Account carries "How Carta works"', /how carta works/i.test(await page.locator('.account-panel').innerText().catch(() => '')));
await page.screenshot({ path: 'shots/bottom-nav-account.png' });

// Back closes Account onto My trips (each page is a step in the history).
await page.goBack();
await page.waitForTimeout(800);
check('Back closes Account', !(await page.locator('.account-panel').isVisible().catch(() => false)));

const failed = checks.filter((c) => !c.ok);
console.log('=== bottom nav verify ===  target:', URL);
for (const c of checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.label}${c.note ? ' — ' + c.note : ''}`);
console.log(`TOTAL ERRORS: ${errors.length}  |  FAILED CHECKS: ${failed.length}`);
errors.slice(0, 10).forEach((e) => console.log('  ' + e));

await browser.close();
process.exit(errors.length || failed.length ? 1 : 0);
