// T432: the trip's price is one figure from the first priced step to the
// planned trip. Walks the planner with several budget shapes and reads the
// price card on Getting there, after a typed fare, on Review, and on the
// planned overview; every reading for one trip must be the same figure, and
// a typed fare must move the total by exactly the fare.
//
//   node scripts/verify_trip_price_consistency.mjs --url=http://localhost:4240/
//
// Data and auth come through the ?paymock seam (lib/e2eSeams.js). Exits 1 on
// any mismatch; writes the readings to shots/price-consistency.json.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const BASE = (argv.url || 'http://localhost:4240/').replace(/\/?$/, '/');

const SCENARIOS = [
  { key: 'couple-easygoing', adults: 2, kids: 0, sleep: 'Entire place', spend: 'Easygoing', fare: 180 },
  { key: 'family-backpacker-dorm', adults: 2, kids: 2, sleep: 'Dorm bed', spend: 'Backpacker', fare: 420 },
  { key: 'solo-foodie-hotel', adults: 1, kids: 0, sleep: 'Hotel', spend: 'Foodie', fare: 95.5 },
  { key: 'group-nightlife-private', adults: 6, kids: 0, sleep: 'Private room', spend: 'Nightlife', fare: 900 },
  { key: 'couple-no-fare', adults: 2, kids: 0, sleep: 'Entire place', spend: 'Family', fare: 0 },
];

const euro = (s) => {
  const m = String(s || '').replace(/\s/g, '').match(/[\d.,]+/);
  if (!m) return null;
  let t = m[0];
  // 1,234.56 or 1.234,56
  if (/,\d{2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  return Number(t);
};

async function readTotal(page) {
  const loc = page.locator('.plan-total-n:visible').first();
  await loc.waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
  return euro(await loc.textContent());
}

async function next(page, ms = 1200) {
  await page.locator('.guide-next:visible').first().click();
  await page.waitForTimeout(ms);
}

async function setStepper(page, rowText, want) {
  const row = page.locator('.party-row').filter({ hasText: rowText }).first();
  for (let i = 0; i < 25; i += 1) {
    const cur = Number((await row.locator('.fstepper-value').first().textContent().catch(() => '0')).trim());
    if (cur === want) return;
    await row.locator('.fstepper-btn').nth(cur < want ? 1 : 0).click();
    await page.waitForTimeout(80);
  }
}

async function run(browser, sc) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen', '1');
      localStorage.setItem('continent.onboardingSeen.v1', '1');
    } catch { /* storage unavailable */ }
  });
  const out = { key: sc.key, readings: {} };
  try {
    await page.goto(`${BASE}?tab=trip&o=CRL&paymock`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.locator('.guide-next').first().waitFor({ timeout: 90000 });
    await page.getByText(/^Nothing yet$/).first().click();
    await next(page);
    await setStepper(page, 'Adults', sc.adults);
    await setStepper(page, 'Children', sc.kids);
    await page.locator('.wlife .ui-tile').filter({ hasText: sc.sleep }).first().click().catch(() => {});
    await page.locator('.wlife .ui-tile').filter({ hasText: sc.spend }).first().click().catch(() => {});
    await next(page); // Who
    await page.getByText(/I'm flexible/).first().click();
    await page.locator('.guide-month-grid .guide-chip').nth(1).click().catch(() => {});
    await next(page); // When
    await page.locator('.guide-wtabs [role="tab"]').nth(1).click();
    await page.waitForTimeout(800);
    await page.locator('.guide-ccard-pick').first().click();
    await next(page, 2500); // Where
    await page.locator('.wtrip-choose').first().waitFor({ timeout: 45000 });
    await page.locator('.wtrip-choose').first().click();
    await page.waitForTimeout(900);
    out.readings.card = euro(await page.locator('.wtrip.on .wtrip-total').first().textContent().catch(() => ''));
    await next(page, 2500); // Trips
    await page.locator('.tleg').first().waitFor({ timeout: 45000 });
    out.readings.getting = await readTotal(page);
    if (sc.fare) {
      const input = page.locator('#paid-out');
      await input.fill(String(sc.fare));
      await input.press('Enter');
      await page.waitForTimeout(700);
      out.readings.withFare = await readTotal(page);
    } else {
      out.readings.withFare = out.readings.getting;
    }
    await next(page, 1500); // Getting there
    out.readings.review = await readTotal(page);
    await page.locator('.guide-next:visible').first().click(); // Plan my trip
    await page.waitForTimeout(3000);
    if (await page.locator('.pass-overlay').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
    out.readings.overview = await readTotal(page);
    const r = out.readings;
    out.fareMovedBy = Math.round((r.withFare - r.getting) * 100) / 100;
    // The chosen trip's card prints whole euros of the same figure.
    out.ok = r.card != null && Math.abs(Math.round(r.getting) - r.card) <= 1
      && r.withFare === r.review && r.review === r.overview
      && Math.abs(out.fareMovedBy - sc.fare) < 0.011;
  } catch (e) {
    out.ok = false;
    out.error = String(e).split('\n')[0].slice(0, 200);
  }
  await ctx.close();
  return out;
}

const browser = await chromium.launch();
const results = [];
for (const sc of SCENARIOS) {
  const r = await run(browser, sc);
  results.push(r);
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${sc.key}  ${JSON.stringify(r.readings)}${r.error ? `  ${r.error}` : ''}`);
}
await browser.close();
mkdirSync('shots', { recursive: true });
writeFileSync('shots/price-consistency.json', JSON.stringify(results, null, 2));
const bad = results.filter((r) => !r.ok).length;
console.log(bad ? `${bad} of ${results.length} trips disagree` : `all ${results.length} trips show one figure from Getting there to the planned trip`);
process.exit(bad ? 1 : 0);
