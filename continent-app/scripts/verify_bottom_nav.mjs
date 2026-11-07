// Headless verify for the phone bottom nav (T496, refreshed T1089): Explore | Plan | My trips,
// three slots of --tap-main, Account in the header door, no plus; Plan with nothing in progress
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
// T1089: the container has no network; a blocked request is not an app error.
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED/.test(m.text())) errors.push('console: ' + m.text().slice(0, 120)); });

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

// Bar contents: Explore + Plan + My trips, no plus. T1089: Account left the
// bar for the header's account door (it stays on the phone), so the bar is
// three slots.
const labels = await page.locator('.bottom-nav .bottom-nav-label').allInnerTexts();
check('bar labels are Explore | Plan | My trips',
  labels.length === 3
  && /explore/i.test(labels[0]) && /^plan$/i.test(labels[1].trim())
  && /my trips/i.test(labels[2]), labels.join(' | '));
check('no Home item in the bar', !labels.some((l) => /home/i.test(l)));
check('no Account item in the bar', !labels.some((l) => /account/i.test(l)));
check('no plus in the bar', (await page.locator('.bottom-nav-plus, .plan-chooser').count()) === 0);
const slotHeights = await page.locator('.bottom-nav-item').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
check('every slot is at least 48 px tall (--tap-main)', slotHeights.every((h) => h >= 48), slotHeights.join(', '));
const clipped = await page.locator('.bottom-nav-label').evaluateAll(
  (els) => els.filter((el) => el.scrollWidth > el.clientWidth).map((el) => el.textContent));
check('no label truncates', clipped.length === 0, clipped.join(' | '));
check('Explore is the default place', /explore/i.test(await active()));
await page.screenshot({ path: 'shots/bottom-nav-bar.png' });

// Plan with nothing in progress -> the Plan home, whose "Start planning"
// opens the "What do you want to plan?" page (a new trip, or a trip under way).
await page.evaluate(() => { try { localStorage.removeItem('carta.tripDraft.v1'); } catch { /* */ } });
await page.locator('.bottom-nav-item').nth(1).click();
await page.waitForTimeout(1200);
check('Plan opens its home with "Start planning"', await page.locator('.pf-open-start').isVisible().catch(() => false));
check('Plan marked active', /^plan$/i.test((await active()).trim()));
check('the address names Plan', /[?&]tab=plan/.test(page.url()), page.url());
await page.locator('.pf-open-start').click();
await page.waitForTimeout(1200);
check('Start planning asks what to plan', /what do you want to plan/i.test(await page.locator('body').innerText()));
const rows = await page.locator('.ui-crow').allInnerTexts();
check('two answers, a new trip and a trip under way', rows.length === 2 && /new trip/i.test(rows[0]) && /on a trip now/i.test(rows[1]), rows.join(' | '));
check('Plan still marked on the start page', /^plan$/i.test((await active()).trim()));
await page.screenshot({ path: 'shots/bottom-nav-planstart.png' });

await page.getByRole('button', { name: /^continue$/i }).click();
await page.waitForTimeout(2500);
check('A new trip opens the plan flow', /tell carta about your trip/i.test(await page.locator('.pf').first().innerText().catch(() => '')));
check('Plan still marked on the trip', /^plan$/i.test((await active()).trim()));

// Explore.
await page.locator('.bottom-nav-item').nth(0).click();
await page.waitForTimeout(1500);
check('Explore opens Places', await page.locator('.explore-tab').isVisible().catch(() => false));

// My trips.
await page.locator('.bottom-nav-item').nth(2).click();
await page.waitForTimeout(1200);
check('My trips is marked and addressed', /my trips/i.test(await active()) && /[?&]tab=trips/.test(page.url()), page.url());
await page.screenshot({ path: 'shots/bottom-nav-saved.png' });

// Account is the header door: it opens the account page and the bar marks nothing.
await page.locator('.account-door[aria-label^="Account"]').click();
await page.waitForTimeout(1200);
check('Account opens the account page', await page.locator('.ac-panel').isVisible());
check('Account has an address', /[?&]tab=account/.test(page.url()), page.url());
check('Account carries "How Carta works"', /how carta works/i.test(await page.locator('.ac-panel').innerText().catch(() => '')));
await page.screenshot({ path: 'shots/bottom-nav-account.png' });

// Back closes Account (each page is a step in the history).
await page.goBack();
await page.waitForTimeout(800);
check('Back closes Account', !(await page.locator('.ac-panel').isVisible().catch(() => false)));

const failed = checks.filter((c) => !c.ok);
console.log('=== bottom nav verify ===  target:', URL);
for (const c of checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.label}${c.note ? ' — ' + c.note : ''}`);
console.log(`TOTAL ERRORS: ${errors.length}  |  FAILED CHECKS: ${failed.length}`);
errors.slice(0, 10).forEach((e) => console.log('  ' + e));

await browser.close();
process.exit(errors.length || failed.length ? 1 : 0);
