// Headless verify for the Destinations tab v2 (.places-tab): five category
// tabs (Trips, Trails, Beaches, Lakes, Mountains, Cycling), photo cards
// everywhere, and the trip sheet with the route drawn on a real map. The
// General tab was removed in UX pass 1 (be4541c); Explore took over its job.
//
//   node scripts/verify_places_tab.mjs [url]      (default http://localhost:$CARTA_PORT or 4173)
//
// Phone viewport first (the tab enters through the bottom bar), then a
// desktop pass. Screenshots to shots/places-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;

// The country filter is the CountryPicker button and listbox now, not a
// <select>, so selectOption() throws. This drives it the way a person does:
// open it, type the name, click the option. A name of '' picks "All countries".
const COUNTRY_NAME = new Intl.DisplayNames(['en'], { type: 'region' });
async function pickCountry(scope, cc) {
  await scope.locator('.places-country:visible').first().click();
  await scope.waitForTimeout(400);
  const pop = scope.locator('.country-picker-pop:visible');
  if (!cc) {
    await pop.locator('.origin-opt').first().click();
  } else {
    const name = COUNTRY_NAME.of(cc);
    await pop.locator('.origin-search').fill(name);
    await scope.waitForTimeout(400);
    await pop.locator('.origin-opt', { hasText: new RegExp(`^${name}$`, 'i') }).first().click();
  }
  await scope.waitForTimeout(1200);
}

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
// Six: Trips, Trails, Beaches, Lakes, Mountains, Cycling. Asserted by NAME rather than by count, so the next category to
// arrive does not fail this check for existing.
const catNames = (await cats.allInnerTexts()).map((s) => s.trim().toLowerCase());
check('every category tab renders',
  ['trips', 'trails', 'beaches', 'lakes', 'mountains', 'cycling']
    .every((n) => catNames.some((c) => c.startsWith(n.slice(0, 5)))),
  catNames.join(', '));
check('Trips starts active', /trips/i.test(await page.locator('.places-cat.on').innerText().catch(() => '')));
check('there is no General tab', !catNames.some((c) => c.startsWith('gener')));

// ── Trips: the curated library, then the composed door, then the walks ──
//
// The category now opens on the curated trip library's style grid
// (see verify_journeys.mjs for the library itself). The composed multi-day
// itineraries live behind their own door at the end of the grid, and the
// one-day city walks this block covers are what the "1" chip on the day
// rail reaches, so that is how it gets there.
await page.locator('.places-cat', { hasText: /^trips$/i }).click();
await page.waitForTimeout(1600);
check('trips category opens on the style grid',
  await page.locator('.jstyle-card').count() === 10);
await page.locator('.jcomposed-card').click();
await page.waitForTimeout(1600);
check('the composed door opens the itineraries',
  await page.locator('.places-icard').count() > 0);
check('the day slider is there', await page.locator('.trip-slider-input:visible').isVisible());
await page.locator('.trip-slider-input:visible').fill('1');
await page.waitForTimeout(1600);
const tripIdx = await page.locator('.places-ccard').count();
check('one day shows the published-country index', tripIdx > 5, `${tripIdx} countries`);
await pickCountry(page, 'AL');
await page.waitForTimeout(1500);
const tcards = await page.locator('.places-tcard').count();
check('citytrip cards render for Albania', tcards >= 3, `${tcards} cards`);
const tKind = await page.locator('.places-tcard .places-card-kind').first().innerText().catch(() => '');
check('trip cards carry a kind chip', /day/i.test(tKind), tKind);
const tFacts = await page.locator('.places-tcard .places-card-facts').first().innerText().catch(() => '');
check('trip cards carry km and stops', /km/.test(tFacts) && /stop/i.test(tFacts), tFacts.replace(/\n/g, ' '));
// T256-b found the city-day card reachable (the one-day chip, then a
// country). T273: Carta does not price flights, so no card carries a flight
// estimate any more. A flying row's figure is the stay and the ground, with
// a title that says flights are not included; no card reads "~" or the old
// "not a live quote" title. Across Spain and Italy at least one card must be
// a flying row, or this check proves nothing about the rule.
let noFlightCards = 0; let otherCards = 0; let flightEst = 0;
for (const cc of ['ES', 'IT']) {
  await pickCountry(page, cc);
  const prices = await page.locator('.places-tcard .places-card-price').evaluateAll(
    (els) => els.map((e) => ({ text: e.innerText.trim(), title: e.title || '' })));
  for (const p of prices) {
    if (p.text.startsWith('~') || /not a live quote/i.test(p.title)) flightEst += 1;
    if (/flights are not included/i.test(p.title)) noFlightCards += 1; else otherCards += 1;
  }
}
check('city-day card prices: none reads as a flight estimate', flightEst === 0, `${flightEst} do`);
check('city-day cards: flying rows say flights are not included', noFlightCards >= 1, `${noFlightCards} say so, ${otherCards} others`);
await pickCountry(page, 'AL');
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/places-trips.png' });

// ── The trail page: the route on a real map (see verify_trail_page.mjs for
//    the page itself: exports, following, the composed explanation) ──
await page.locator('.places-tcard').first().click();
await page.waitForTimeout(4500);
check('trip page opens', await page.locator('.tpage').isVisible());
check('page draws the route map', await page.locator('.tpage-map canvas').isVisible().catch(() => false));
const factsText = await page.locator('.tpage-facts').innerText().catch(() => '');
check('page facts carry the wire numbers', /km/.test(factsText) && /h/.test(factsText), factsText.replace(/\n/g, ' '));
const stopsCount = await page.locator('.tpage-stops li').count();
check('citytrip page lists its stops', stopsCount >= 3, `${stopsCount} stops`);
check('citytrip page offers the destination CTA', await page.locator('.tpage-cta').isVisible());
await page.screenshot({ path: 'shots/places-page-citytrip.png' });
await page.locator('.tpage-back').click();
await page.waitForTimeout(500);

// ── Trails: facts-only cards, the page gets an elevation profile ──
await page.locator('.places-cat', { hasText: /trails/i }).click();
await page.waitForTimeout(1500);
const hikeCards = await page.locator('.places-tcard').count();
check('hike cards render for Albania', hikeCards >= 3, `${hikeCards} cards`);
check('hike cards carry no clipped summary', await page.locator('.places-tcard-summary').count() === 0);
await page.screenshot({ path: 'shots/places-trails.png' });

await page.locator('.places-tcard').first().click();
await page.waitForTimeout(4500);
check('hike page shows the elevation profile', await page.locator('.tpage-elev-svg').isVisible().catch(() => false));
await page.screenshot({ path: 'shots/places-page-hike.png' });
await page.locator('.tpage-back').click();
await page.waitForTimeout(400);

// ── Beaches: its own published layer now, not a slice of the trips. The
//    category has no country dropdown and no trip cards at all; see
//    scripts/verify_beaches.mjs for the layer itself. ──
await page.locator('.places-cat', { hasText: /beaches/i }).click();
await page.waitForTimeout(2000);
const beachCards = await page.locator('.places-bcard').count();
check('beaches category shows published beaches', beachCards >= 1, `${beachCards} cards`);
check('beaches category carries the country picker', await page.locator('.places-country:visible').count() === 1);
await page.screenshot({ path: 'shots/places-beaches.png' });

// Mountains carries the country picker like every other tab now, and still
// narrows by a typed country name, which is the path this block drives.
await page.locator('.places-cat', { hasText: /mountains/i }).click();
await page.waitForTimeout(1600);
check('mountains category carries the country picker',
  await page.locator('.places-country:visible').count() === 1);
// The layer's own chips: the two ways up lead, and each carries its count.
const mtnChips = await page.locator('.places-facets .places-class').allInnerTexts();
check('mountain chips offer the ways up and the kinds',
  mtnChips.length >= 5 && /walk/i.test(mtnChips.join(' ')) && /climb/i.test(mtnChips.join(' ')),
  mtnChips.join(' | ').split(String.fromCharCode(10)).join(' '));
await page.locator('.places-search input').fill('Albania');
await page.waitForTimeout(1600);
const mtnCards = await page.locator('.places-mcard, .places-bcard, .places-tcard').count();
check('mountains category narrows by typed country', mtnCards >= 1, `${mtnCards} cards`);
await page.locator('.places-search input').fill('');
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/places-mountains.png' });

// ── A picture on every card, on every category ──
// The tab is a wall of photographs, so one grey hole reads as a broken card
// rather than as missing data. Three sources answer for it: the item's own
// photograph, the nearest catalogue place's (labelled on the card), and for a
// walk with neither, the shape of the walk drawn from its own geometry.
const blanks = [];
for (const [blankCat, blankRe] of [['trips', /^trips$/i],
  ['trails', /trails/i], ['beaches', /beaches/i], ['lakes', /^lakes$/i],
  ['mountains', /mountains/i]]) {
  await page.locator('.places-cat', { hasText: blankRe }).first().click();
  await page.waitForTimeout(2600);
  const seen = await page.evaluate(async () => {
    const cards = [...document.querySelectorAll(
      '.places-dcard, .places-ccard, .places-tcard, .places-bcard, .places-icard')];
    for (const c of cards.slice(0, 12)) {
      const img = c.querySelector('img');
      if (img) img.loading = 'eager';
    }
    await new Promise((r) => setTimeout(r, 2200));
    // A placeholder AND a picture that did not load. The second is the one
    // that hides: an image blocked by the served CSP, or a dead file, is still
    // an <img> with a src, and it counted as a picture until it was looked at.
    let broke = 0;
    for (const c of cards.slice(0, 12)) {
      const img = c.querySelector('img');
      if (img && img.complete && img.naturalWidth === 0) broke += 1;
    }
    return {
      n: cards.length,
      blank: cards.filter((c) => c.querySelector('.hero-blank, .places-card-noimg')).length,
      broke,
    };
  });
  if (seen.blank) blanks.push(`${blankCat}: ${seen.blank} placeholders of ${seen.n}`);
  if (seen.broke) blanks.push(`${blankCat}: ${seen.broke} pictures failed to load`);
}
check('every card carries a picture', blanks.length === 0,
  blanks.length ? blanks.join(', ') : 'no blank cards on any category');

// Every hero URL must be on the one host the served CSP allows images from.
// The dev server sends no CSP at all, so this cannot be seen by looking: the
// thirteen heroes pointing at commons.wikimedia.org/Special:FilePath rendered
// perfectly here and were blank grey cards in production.
const heroHosts = await page.evaluate(async () => {
  const r = await fetch('/app_data.json');
  const j = await r.json();
  const bad = [];
  for (const [id, d] of Object.entries(j.destinations || {})) {
    const u = d.image?.url;
    if (u && !u.startsWith('https://upload.wikimedia.org/')) bad.push(id);
  }
  return { bad: bad.slice(0, 5), n: bad.length };
});
check('every hero URL is on the host the CSP allows',
  heroHosts.n === 0, heroHosts.n ? `${heroHosts.n}: ${heroHosts.bad.join(', ')}` : 'all on upload.wikimedia.org');
await page.locator('.places-cat', { hasText: /^trips$/i }).first().click();
await page.waitForTimeout(1500);

// ── Near search: suggestions then closest-first ──
// On Trails, because the Trips category is the style grid and a style card
// has no distance to chip; the trail cards carry the km chips.
await page.locator('.places-cat', { hasText: /trails/i }).click();
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
await deskTab.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
if (await deskTab.isVisible().catch(() => false)) {
  await deskTab.click();
  await desk.waitForTimeout(1200);
}
await desk.locator('.places-tab').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
check('desktop: places tab reachable', await desk.locator('.places-tab').isVisible().catch(() => false));
const deskCols = await desk.locator('.places-list').evaluate(
  (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length,
).catch(() => 0);
// Three across on a desktop window: the tab moved off its 780px strip onto
// the same 1180px column Explore uses, which fits three cards at the width
// where the 2.6:1 photograph still reads as a photograph.
check('desktop: cards flow in three columns', deskCols === 3, `${deskCols} columns`);
await desk.screenshot({ path: 'shots/places-desktop.png' });

// ── Priced from: retired from this page's desktop chrome ────────────────
// Desktop chrome v4 moved every control into the left panel and left the
// origin picker out of it on purpose: the origin still governs the prices
// (the map's From picker and the phone toolbar still set it), but a
// "priced from" pill was one control too many on the browse surface.
check('no origin picker on the desktop page',
  (await desk.locator('.places-tab .origin-btn:visible').count()) === 0);
// The desktop chrome that replaced it: search at the head of the column, the category
// tiles and the filter panel on the left.
check('desktop: search heads the results column',
  await desk.locator('.places-searchrow .places-search input').isVisible().catch(() => false));
check('desktop: the side panel stands', await desk.locator('.places-side').isVisible().catch(() => false));

// ── The trips index lost its intro paragraph ─────────────────────────────
await desk.locator('.side-cat', { hasText: /^trips$/i }).click();
await desk.waitForTimeout(1200);
check('trips index carries no intro paragraph', await desk.locator('.places-intro').count() === 0);

// ── Lifestyle: not on the curated trip library ──────────────────────────
// With the General tab gone, no desktop list here is priced from the
// traveller's own bed and habits: the curated library's budgets are
// editorial ranges, so the Lifestyle pill is not drawn. (The pill itself,
// and the way it reprices a list, are covered by verify_lifestyle.mjs on
// Explore, where the prices are.)
check('the curated library draws no Lifestyle pill',
  await desk.locator('.places-side .lifestyle-btn:visible').count() === 0);

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
