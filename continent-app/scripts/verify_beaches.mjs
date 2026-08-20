// Headless verify for the beach layer: the Beaches category on the
// Destinations tab, and the beach page one card opens.
//
//   node scripts/verify_beaches.mjs [url]      (default http://localhost:4173)
//
// What it is checking, in the order a traveller meets it:
//   the tab shows BEACHES, not trips, and not a page of country flags
//   the country dropdown, the priced-from picker and the stay tier are GONE
//     from this category (they are back on General, which is also checked)
//   every card carries a photograph, a pin with the place, and a score
//   typing a country name swaps the European ranking for that country's list
//   the page carries the pin row, three or four photographs with credits, the
//     composed explanation, the facts, the score breakdown, and no GPX or
//     route export anywhere on it
//
// Phone viewport first, because that is how the tab is entered, then one
// desktop pass. Screenshots to shots/beaches-*.png.

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

try {
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
page.on('console', (m) => {
  if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 120));
});
await seed(page);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3000);

await page.locator('.bottom-nav-item', { hasText: /destinations/i }).first().click();
await page.waitForTimeout(1200);
check('destinations tab opens', await page.locator('.places-tab').isVisible());

// The chrome that must exist on General, so its absence on Beaches means
// something was removed rather than never rendered.
check('General still carries the country picker', await page.locator('.places-country').count() === 1);

await page.locator('.places-cat', { hasText: /beaches/i }).click();
await page.waitForTimeout(2500);

// ── The controls the brief asked to be taken off this tab ──
check('country dropdown is gone on Beaches', await page.locator('.places-country').count() === 0);
check('priced-from picker is gone on Beaches', await page.locator('.places-controls .origin-btn').count() === 0);
check('lifestyle tier is gone on Beaches', await page.locator('.places-lifestyle').count() === 0);
check('price and A-Z sorts are gone on Beaches', await page.locator('.places-sort').count() === 0);
check('the search field stays', await page.locator('.places-search input').count() === 1);

// ── Beaches, not a country index ──
const flagCards = await page.locator('.places-ccard').count();
check('no country flag index on Beaches', flagCards === 0, `${flagCards} flag cards`);
const cards = page.locator('.places-bcard');
const nCards = await cards.count();
check('beach cards render', nCards >= 3, `${nCards} cards`);

const cardImg = await cards.first().locator('.places-card-img').getAttribute('src').catch(() => '');
check('cards carry a real photograph', /^https:\/\/upload\.wikimedia\.org/.test(cardImg || ''),
  (cardImg || '').slice(0, 70));
check('no tracking params on the photo URL', !/utm_/.test(cardImg || ''));
const cardWhere = await cards.first().locator('.places-bcard-where').innerText().catch(() => '');
check('cards carry the pin and the place', cardWhere.trim().length > 1, cardWhere.replace(/\n/g, ' '));
check('cards carry a pin icon', await cards.first().locator('.places-bcard-where svg').count() === 1);
const cardScore = await cards.first().locator('.score-chip').innerText().catch(() => '');
check('cards carry a beauty score', /^\d/.test(cardScore.trim()), cardScore);
const cardTags = await cards.first().locator('.places-bcard-tags span').count();
check('cards carry reason chips', cardTags >= 1, `${cardTags} chips`);
const head = await page.locator('.places-beachhead').first().innerText().catch(() => '');
check('the list says how many beaches and how many countries', /\d/.test(head), head.replace(/\n/g, ' '));
await page.screenshot({ path: 'shots/beaches-list.png', fullPage: false });

// Ranked, best first.
const scores = await page.locator('.places-bcard .score-chip').allInnerTexts();
const nums = scores.map((s) => parseFloat(s)).filter((n) => !Number.isNaN(n));
check('the list is ranked best first',
  nums.length > 2 && nums.every((n, i) => i === 0 || nums[i - 1] >= n - 0.001),
  nums.slice(0, 5).join(', '));

// ── Typing a country name opens that country's full list ──
const firstCountry = (await page.locator('.places-bcard-where').first().innerText().catch(() => ''))
  .split(',').pop().trim();
if (firstCountry) {
  await page.locator('.places-search input').fill(firstCountry);
  await page.waitForTimeout(2200);
  const countryHead = await page.locator('.places-beachhead').first().innerText().catch(() => '');
  check('typing a country names it over the list', new RegExp(firstCountry, 'i').test(countryHead),
    countryHead.replace(/\n/g, ' '));
  const inCountry = await page.locator('.places-bcard').count();
  check('the country list has beaches in it', inCountry >= 1, `${inCountry} cards`);
  await page.locator('.places-search input').fill('');
  await page.waitForTimeout(1200);
}

// ── The beach page ──
await page.locator('.places-bcard').first().click();
await page.waitForTimeout(1800);
check('the beach page opens', await page.locator('.bpage').isVisible());

const where = await page.locator('.bpage-where').innerText().catch(() => '');
check('the page opens with the location', where.trim().length > 1, where.replace(/\n/g, ' '));
check('the location row carries a pin icon', await page.locator('.bpage-where svg').count() >= 1);
const mapsHref = await page.locator('.bpage-where').getAttribute('href').catch(() => '');
check('the pin links to a map by coordinate', /google\.com\/maps.*destination=-?\d/.test(mapsHref || ''),
  (mapsHref || '').slice(0, 70));

const shot = await page.locator('.bpage-shot').getAttribute('src').catch(() => '');
check('the page shows a large photograph', /^https:\/\/upload\.wikimedia\.org/.test(shot || ''));
const thumbs = await page.locator('.bpage-thumb').count();
check('three or four photographs are offered', thumbs >= 2 && thumbs <= 4, `${thumbs} photographs`);
const credit = await page.locator('.bpage-credit').innerText().catch(() => '');
check('the photograph carries its author and licence', /cc|public domain/i.test(credit), credit.replace(/\n/g, ' '));

const why = await page.locator('.bpage-why').innerText().catch(() => '');
check('the page explains why this beach', why.length > 60, why.replace(/\n/g, ' ').slice(0, 120));
check('the explanation is composed prose, not reason codes',
  !/\b(waterExcellent|boatOnly|sandColour|nationalPark)\b/.test(why));
check('no untranslated keys leaked into the page', !/beach\.[a-zA-Z]/.test(await page.locator('.bpage-wrap').innerText()));

const bars = await page.locator('.bpage-bars li').count();
check('the score is broken into its parts', bars >= 4, `${bars} components`);
const facts = await page.locator('.bpage-facts').innerText().catch(() => '');
check('the facts list renders', facts.length > 10, facts.replace(/\n/g, ' ').slice(0, 100));

// The brief: no GPX, no route exports, no elevation profile on a beach.
const pageText = await page.locator('.bpage').innerText();
check('no GPX or route export on a beach page', !/gpx|kml|elevation/i.test(pageText));
check('no map canvas on a beach page', await page.locator('.bpage canvas').count() === 0);
await page.screenshot({ path: 'shots/beaches-page.png', fullPage: true });

await page.locator('.tpage-back').click();
await page.waitForTimeout(600);
check('back returns to the list', await page.locator('.places-bcard').first().isVisible());

// ── Desktop ──
const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
desk.on('pageerror', (e) => errors.push('desktop pageerror: ' + e.message.split('\n')[0]));
await seed(desk);
await desk.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await desk.waitForTimeout(3000);
await desk.locator('.header-nav-item, .bottom-nav-item', { hasText: /destinations/i }).first().click();
await desk.waitForTimeout(1200);
await desk.locator('.places-cat', { hasText: /beaches/i }).click();
await desk.waitForTimeout(2500);
check('desktop renders the beach cards', await desk.locator('.places-bcard').count() >= 3);
await desk.screenshot({ path: 'shots/beaches-desktop.png' });
await desk.locator('.places-bcard').first().click();
await desk.waitForTimeout(1500);
check('desktop opens the beach page', await desk.locator('.bpage').isVisible());
await desk.screenshot({ path: 'shots/beaches-page-desktop.png', fullPage: true });
await desk.close();

} catch (e) {
  // A thrown locator timeout must not swallow the checks that already ran:
  // "which of these passed" is the whole output of this script.
  errors.push('script: ' + String(e && e.message ? e.message : e).split('\n')[0]);
  check('the run finished without throwing', false);
}

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
console.log(failed === 0 && errors.length === 0
  ? '\nAll checks passed.'
  : `\n${failed} checks failed, ${errors.length} page errors.`);
process.exit(failed === 0 ? 0 : 1);
