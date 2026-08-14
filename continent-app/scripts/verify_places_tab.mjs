// Headless verify for the Destinations tab v2 (.places-tab): five category
// tabs (General, Trips, Trails, Beaches, Mountains), photo cards everywhere,
// country flag cards as the index, sort chips, and the trip sheet with the
// route drawn on a real map.
//
//   node scripts/verify_places_tab.mjs [url]      (default http://localhost:4173)
//
// Phone viewport first (the tab enters through the bottom bar), then a
// desktop pass. Screenshots to shots/places-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';

const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };
const errors = [];
const NOISE = /emrldtp|ERR_FAILED|config is not valid/;

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
page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 120)); });
await seed(page);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3000);

const placesNav = page.locator('.bottom-nav-item', { hasText: /destinations/i }).first();
await placesNav.click();
await page.waitForTimeout(1500);
check('places tab opens from the bar', await page.locator('.places-tab').isVisible());

// ── Category bar ──
const cats = page.locator('.places-cat');
check('five category tabs render', await cats.count() === 5, String(await cats.count()));
check('General starts active', /general/i.test(await page.locator('.places-cat.on').innerText().catch(() => '')));

// ── General: country flag cards first ──
const ccards = await page.locator('.places-ccard').count();
check('country flag cards render', ccards > 20, `${ccards} flag cards`);
const firstCc = await page.locator('.places-ccard .places-card-name').first().innerText().catch(() => '');
check('flag cards carry the country name', firstCc.trim().length > 1, firstCc);
const ccSub = await page.locator('.places-ccard .places-card-sub').first().innerText().catch(() => '');
check('flag cards carry places count and from-price', /places/.test(ccSub) && /€/.test(ccSub), ccSub);
await page.screenshot({ path: 'shots/places-general-countries.png' });

// ── General: pick a country -> photo cards + sort chips ──
await page.locator('.places-country').selectOption('IT');
await page.waitForTimeout(1200);
const sortChips = await page.locator('.places-sort').count();
check('sort chips appear once filtered', sortChips === 3, String(sortChips));
const dcards = await page.locator('.places-dcard').count();
check('destination photo cards render', dcards > 5, `${dcards} cards`);
const dImg = await page.locator('.places-dcard .places-card-img').first().getAttribute('src').catch(() => '');
check('destination cards carry a real image', /upload\.wikimedia|^http/.test(dImg || ''), (dImg || '').slice(0, 60));
const dPrice = await page.locator('.places-dcard .places-card-price').first().innerText().catch(() => '');
check('destination cards carry a euro price', /€/.test(dPrice), dPrice);
const dRating = await page.locator('.places-dcard .score-chip').first().innerText().catch(() => '');
check('destination cards carry a rating chip', /^\d/.test(dRating.trim()), dRating);
// Default sort is rating: first card should be a strong score.
check('rating sort puts a high score first', parseFloat(dRating) >= 8, dRating);
await page.screenshot({ path: 'shots/places-general-cards.png' });

// Price sort flips the order to cheapest-first.
await page.locator('.places-sort', { hasText: /price/i }).click();
await page.waitForTimeout(800);
const p1 = await page.locator('.places-dcard .places-card-price').first().innerText().catch(() => '');
check('price sort resorts the cards', /€/.test(p1), p1);

// ── Trips: country photo index, then citytrip cards ──
await page.locator('.places-country').selectOption('');
await page.waitForTimeout(600);
await page.locator('.places-cat', { hasText: /^trips$/i }).click();
await page.waitForTimeout(1200);
const tripIdx = await page.locator('.places-ccard').count();
check('trips category shows the published-country index', tripIdx > 5, `${tripIdx} countries`);
await page.locator('.places-country').selectOption('AL');
await page.waitForTimeout(1500);
const tcards = await page.locator('.places-tcard').count();
check('citytrip cards render for Albania', tcards >= 3, `${tcards} cards`);
const tKind = await page.locator('.places-tcard .places-card-kind').first().innerText().catch(() => '');
check('trip cards carry a kind chip', /day/i.test(tKind), tKind);
const tFacts = await page.locator('.places-tcard .places-card-facts').first().innerText().catch(() => '');
check('trip cards carry km and stops', /km/.test(tFacts) && /stop/i.test(tFacts), tFacts.replace(/\n/g, ' '));
await page.screenshot({ path: 'shots/places-trips.png' });

// ── Trip sheet: the route on a real map ──
await page.locator('.places-tcard').first().click();
await page.waitForTimeout(4500);
check('trip sheet opens', await page.locator('.tsheet').isVisible());
check('sheet draws the route map', await page.locator('.tsheet-map canvas').isVisible().catch(() => false));
const factsText = await page.locator('.tsheet-facts').innerText().catch(() => '');
check('sheet facts carry the wire numbers', /km/.test(factsText) && /h/.test(factsText), factsText.replace(/\n/g, ' '));
const stopsCount = await page.locator('.tsheet-stops li').count();
check('citytrip sheet lists its stops', stopsCount >= 3, `${stopsCount} stops`);
check('citytrip sheet offers the destination CTA', await page.locator('.tsheet-cta').isVisible());
await page.screenshot({ path: 'shots/places-sheet-citytrip.png' });
await page.locator('.tsheet-close').click();
await page.waitForTimeout(500);

// ── Trails: hike cards with summary, sheet gets an elevation profile ──
await page.locator('.places-cat', { hasText: /trails/i }).click();
await page.waitForTimeout(1500);
const hikeCards = await page.locator('.places-tcard').count();
check('hike cards render for Albania', hikeCards >= 3, `${hikeCards} cards`);
const hikeSummary = await page.locator('.places-tcard-summary').first().innerText().catch(() => '');
check('hike cards carry a summary', hikeSummary.length > 20, hikeSummary.slice(0, 50));
await page.screenshot({ path: 'shots/places-trails.png' });

await page.locator('.places-tcard').first().click();
await page.waitForTimeout(4500);
check('hike sheet shows the elevation profile', await page.locator('.tsheet-elev-svg').isVisible().catch(() => false));
await page.screenshot({ path: 'shots/places-sheet-hike.png' });
await page.locator('.tsheet-close').click();
await page.waitForTimeout(400);

// ── Beaches and Mountains: themed slices ──
await page.locator('.places-cat', { hasText: /beaches/i }).click();
await page.waitForTimeout(1500);
const beachCards = await page.locator('.places-tcard').count();
check('beaches category filters the trips', beachCards >= 1, `${beachCards} cards`);
await page.screenshot({ path: 'shots/places-beaches.png' });

await page.locator('.places-cat', { hasText: /mountains/i }).click();
await page.waitForTimeout(1500);
const mtnCards = await page.locator('.places-tcard').count();
check('mountains category filters the trips', mtnCards >= 1, `${mtnCards} cards`);
await page.screenshot({ path: 'shots/places-mountains.png' });

// ── Near search: suggestions then closest-first ──
await page.locator('.places-cat', { hasText: /general/i }).click();
await page.waitForTimeout(800);
await page.locator('.places-search input').fill('Tirana');
await page.waitForTimeout(900);
const suggCount = await page.locator('.places-sugg-item').count();
check('search offers city suggestions', suggCount >= 1, `${suggCount} suggestions`);
if (suggCount) {
  await page.locator('.places-sugg-item').first().click();
  await page.waitForTimeout(1200);
  check('near mode shows a header', /near/i.test(await page.locator('.places-nearhead').innerText().catch(() => '')));
  const km1 = await page.locator('.places-card-km').first().innerText().catch(() => '');
  check('near mode sorts closest first with km chips', /km/.test(km1), km1);
  await page.screenshot({ path: 'shots/places-near.png' });
}

await page.close();

// ── Desktop pass ────────────────────────────────────────────────────────
const desk = await browser.newPage({ viewport: { width: 1280, height: 860 } });
desk.on('pageerror', (e) => errors.push('desktop pageerror: ' + e.message.split('\n')[0]));
await seed(desk);
await desk.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await desk.waitForTimeout(3000);
const deskTab = desk.locator('.header-nav-item', { hasText: /destinations/i }).first();
if (await deskTab.isVisible().catch(() => false)) {
  await deskTab.click();
  await desk.waitForTimeout(1200);
}
check('desktop: places tab reachable', await desk.locator('.places-tab').isVisible().catch(() => false));
const deskCols = await desk.locator('.places-list').evaluate(
  (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length,
).catch(() => 0);
check('desktop: cards flow in two columns', deskCols === 2, `${deskCols} columns`);
await desk.screenshot({ path: 'shots/places-desktop.png' });
await desk.close();

await browser.close();

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  [${c.note}]` : ''}`);
}
if (errors.length) {
  console.log('\npage errors:');
  for (const e of errors) console.log('  ' + e);
}
console.log(failed === 0 && errors.length === 0 ? '\nAll checks passed.' : `\n${failed} checks failed, ${errors.length} page errors.`);
process.exit(failed === 0 ? 0 : 1);
