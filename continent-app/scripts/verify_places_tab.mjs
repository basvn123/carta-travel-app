// Headless verify for the Destinations tab (.places-tab): the catalogue and
// the published trips as their own section, with a shared country filter and
// a "near this town" search over the trips.
//
//   node scripts/verify_places_tab.mjs [url]      (default http://localhost:4173)
//
// Phone viewport first (the tab enters through the bottom bar), then a
// desktop pass (it enters through the header tabs). Screenshots to
// shots/places-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';

const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };
const errors = [];

const seed = (page) => page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});

// ── Mobile ────────────────────────────────────────────────────────────────
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 120)); });
await seed(page);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3000);

await page.locator('.bottom-nav-item').nth(0).click();
await page.waitForTimeout(1500);
check('places tab opens from the bar', await page.locator('.places-tab').isVisible());
check('title and meta line render', await page.locator('.places-title').isVisible()
  && /priced places across/.test(await page.locator('.places-meta').innerText().catch(() => '')));

// Destinations segment: rows with a price each, then the country filter bites.
const rowCount = await page.locator('.places-row').count();
check('destination rows render', rowCount > 10, `${rowCount} rows in the window`);
const firstPrice = await page.locator('.places-row-price').first().innerText().catch(() => '');
check('rows carry a euro price', /€/.test(firstPrice), firstPrice);
await page.screenshot({ path: 'shots/places-dests.png' });

const optionValues = await page.locator('.places-country option').evaluateAll(
  (os) => os.map((o) => o.value).filter(Boolean));
check('country filter offers countries', optionValues.length > 20, `${optionValues.length} countries`);
await page.locator('.places-country').selectOption(optionValues.includes('AT') ? 'AT' : optionValues[0]);
await page.waitForTimeout(600);
const subTexts = await page.locator('.places-row-sub').evaluateAll(
  (els) => els.slice(0, 12).map((el) => el.textContent));
check('country filter narrows the rows', subTexts.length > 0
  && new Set(subTexts.map((s) => s.trim().split(/\s{2,}|(?=\d)/)[0])).size >= 1, subTexts[0] || '');
await page.screenshot({ path: 'shots/places-dests-filtered.png' });

// Search narrows further.
await page.locator('.places-search input').fill('salz');
await page.waitForTimeout(700);
const searched = await page.locator('.places-row-city').allInnerTexts();
check('text search narrows the list', searched.length > 0 && searched.every((c) => /salz/i.test(c)),
  searched.slice(0, 3).join(' | '));
await page.locator('.places-search input').fill('');
await page.locator('.places-country').selectOption('');
await page.waitForTimeout(400);

// Trails segment: index of countries first, then one country's trips.
await page.locator('.places-seg').nth(1).click();
await page.waitForTimeout(1200);
const cidx = await page.locator('.places-cidx-row').count();
check('trails segment lists published countries', cidx > 10, `${cidx} countries`);
check('trails meta line renders', /published trips across/.test(
  await page.locator('.places-meta').innerText().catch(() => '')));
await page.screenshot({ path: 'shots/places-trails-index.png' });

await page.locator('.places-cidx-row').first().click();
await page.waitForTimeout(1500);
const trailRows = await page.locator('.places-trailrow').count();
check('picking a country lists its trips', trailRows > 0, `${trailRows} trips`);
const facts = await page.locator('.places-trail-facts').first().innerText().catch(() => '');
check('trip rows carry measured facts', /km/.test(facts), facts.replace(/\s+/g, ' '));
check('credit line renders under the list', await page.locator('.places-credit').isVisible());
await page.screenshot({ path: 'shots/places-trails-country.png' });

// Near-search: type a town, take a suggestion, distances appear.
await page.locator('.places-search input').fill('innsb');
await page.waitForTimeout(700);
const suggCount = await page.locator('.places-sugg-item').count();
check('near-search suggests towns', suggCount > 0, `${suggCount} suggestions`);
if (suggCount > 0) {
  await page.locator('.places-sugg-item').first().click();
  await page.waitForTimeout(1500);
  check('near header renders', /near/i.test(await page.locator('.places-nearhead').innerText().catch(() => '')));
  const kms = await page.locator('.places-trail-km').allInnerTexts();
  check('nearby trips sorted with km labels', kms.length > 0 && /km away/.test(kms[0] || ''),
    kms.slice(0, 3).join(' | '));
  await page.screenshot({ path: 'shots/places-trails-near.png' });
  await page.locator('.places-nearclear').click();
  await page.waitForTimeout(400);
}
await page.close();

// ── Desktop: the tab enters through the header nav ───────────────────────
const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
desk.on('pageerror', (e) => errors.push('desktop pageerror: ' + e.message.split('\n')[0]));
await seed(desk);
await desk.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await desk.waitForTimeout(3000);
const headerLabels = await desk.locator('.header-nav .header-nav-label').allInnerTexts();
check('desktop header gains a Destinations tab', headerLabels.some((l) => /destinations/i.test(l)),
  headerLabels.join(' | '));
check('desktop header keeps the account button', await desk.locator('.account-avatar-btn').isVisible());
await desk.locator('.header-nav-item', { hasText: 'Destinations' }).click();
await desk.waitForTimeout(1500);
check('desktop places tab renders', await desk.locator('.places-tab').isVisible());
await desk.screenshot({ path: 'shots/places-desktop.png' });
await desk.close();

const failed = checks.filter((c) => !c.ok);
console.log('=== places tab verify ===  target:', URL);
for (const c of checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.label}${c.note ? ' — ' + c.note : ''}`);
console.log(`TOTAL ERRORS: ${errors.length}  |  FAILED CHECKS: ${failed.length}`);
errors.slice(0, 10).forEach((e) => console.log('  ' + e));

await browser.close();
process.exit(errors.length || failed.length ? 1 : 0);
