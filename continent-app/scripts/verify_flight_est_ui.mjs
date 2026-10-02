// Headless verify that every Carta flight price reads as an estimate on the
// screens (T256): a "~" before the figure and the "est." tag on both flight
// rows of the trip receipt. Written in T266 for register row T256-b, because
// T256 changed these rows and never saw them in a browser. (The sibling file
// verify_flight_estimates.mjs checks the pricing maths, not the screen.)
//
// It opens a shared two-stop trip from the share hash (BGY then VCE, from
// Charleroi, so the plan flies), opens it in the Trip planner and reads the
// receipt rows in the itinerary, on a desktop and on a 380px phone.
//
//   node scripts/verify_flight_est_ui.mjs [url]   (default http://127.0.0.1:$CARTA_PORT or 4173)
//
// Needs a server already running; it does not start one. Exits 1 on a failure.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || `http://127.0.0.1:${process.env.CARTA_PORT || 4173}/`;
mkdirSync('scripts/shots', { recursive: true });

const draft = {
  tripStart: '2026-08-24',
  stops: [
    { destinationId: 'BGY', nights: 2, activities: [] },
    { destinationId: 'VCE', nights: 2, activities: [] },
  ],
  groupSize: 2,
  transportPref: 'auto',
  pace: 'balanced',
  baggage: 'small',
  label: 'Estimate verify trip',
};
const hash = `trip=0.${Buffer.from(JSON.stringify(draft)).toString('base64url')}`;

let failures = 0;
const fail = (msg) => { console.error('FAIL:', msg); failures += 1; process.exitCode = 1; };
const ok = (msg) => console.log('ok  ', msg);

const browser = await chromium.launch();
try {
  for (const [tag, viewport] of [['desktop', { width: 1360, height: 900 }], ['phone', { width: 380, height: 820 }]]) {
    const page = await browser.newPage({ viewport });
    await page.addInitScript(() => {
      for (const k of ['continent.guestMode.v1', 'continent.mapGuideDismissed.v1', 'carta.fareNoticeSeen',
        'carta.welcomeSeen', 'carta.welcomeSeen.v1']) localStorage.setItem(k, '1');
      localStorage.setItem('continent.lang.v1', 'en');
    });
    await page.goto(`${BASE}?o=CRL#${hash}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.getByRole('button', { name: 'Open trip' }).click({ timeout: 120000 });
    await page.locator('.itin').waitFor({ timeout: 120000 });
    await page.waitForTimeout(1500);
    // A pass prompt can sit over the planner for a guest; close it like a person would.
    const pass = page.locator('.pass-overlay .day-saved-close');
    if (await pass.count()) { await pass.first().click(); await page.waitForTimeout(500); }

    await page.locator('.itin-breakdown-toggle').click();
    await page.locator('.itin-breakdown-body').waitFor({ timeout: 10000 });

    // The flight rows are the receipt rows that carry a fare tag.
    const rows = page.locator('.itin .trip-total-row', { has: page.locator('.fare-prov') });
    const n = await rows.count();
    if (n < 2) { fail(`[${tag}] expected a flight out and a flight home row, found ${n} rows with a fare tag`); await page.close(); continue; }
    ok(`[${tag}] the itinerary receipt has ${n} flight rows`);
    for (let i = 0; i < n; i += 1) {
      const row = rows.nth(i);
      const val = (await row.locator('.val').innerText()).trim();
      if (!val.startsWith('~')) fail(`[${tag}] flight row ${i + 1} reads "${val}", no "~" before the figure`);
      if (!(await row.locator('.fare-prov-est').count())) fail(`[${tag}] flight row ${i + 1} has no "est." tag`);
      if (/^\s*from\b/i.test(val)) fail(`[${tag}] flight row ${i + 1} says "from" on an estimate`);
    }
    ok(`[${tag}] every flight row was checked for "~", the est. tag and no "from"`);
    const title = await page.locator('.itin .trip-total-row .fare-prov-est').first().getAttribute('title');
    if (!/not a live quote/i.test(title || '')) fail(`[${tag}] the est. tag does not say it is not a live quote ("${title}")`);
    else ok(`[${tag}] the est. tag says it is not a live quote`);
    await page.screenshot({ path: `scripts/shots/flight-estimates-${tag}.png` });

    // 380px floor: the "~" rows must not push the page sideways.
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 1) fail(`[${tag}] ${over}px of sideways scroll with the receipt open`);
    await page.close();
  }
} catch (e) {
  fail(String(e.message || e).split('\n')[0]);
} finally {
  await browser.close();
}
console.log(failures ? `verify_flight_est_ui: ${failures} FAILURES` : 'verify_flight_est_ui OK');
