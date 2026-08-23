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
// Six since the Lakes layer shipped: General, Trips, Trails, Beaches, Lakes,
// Mountains. Asserted by NAME rather than by count, so the next category to
// arrive does not fail this check for existing.
const catNames = (await cats.allInnerTexts()).map((s) => s.trim().toLowerCase());
check('every category tab renders',
  ['general', 'trips', 'trails', 'beaches', 'lakes', 'mountains']
    .every((n) => catNames.some((c) => c.startsWith(n.slice(0, 5)))),
  catNames.join(', '));
check('General starts active', /general/i.test(await page.locator('.places-cat.on').innerText().catch(() => '')));

// ── General: country flag cards first ──
const ccards = await page.locator('.places-ccard').count();
check('country flag cards render', ccards > 20, `${ccards} flag cards`);
const firstCc = await page.locator('.places-ccard .places-card-name').first().innerText().catch(() => '');
check('flag cards carry the country name', firstCc.trim().length > 1, firstCc);
const ccSub = await page.locator('.places-ccard .places-card-sub').first().innerText().catch(() => '');
// The from-price came off the flag card before 6ff2192e and has stayed off
// through two later commits: browse surfaces no longer quote a fare, and the
// count is what the card is for. This check followed the price for a while
// after the code stopped showing one.
check('flag cards carry the places count', /places/.test(ccSub), ccSub);
await page.screenshot({ path: 'shots/places-general-countries.png' });

// ── General: pick a country -> photo cards + sort chips ──
await page.locator('.places-country').selectOption('IT');
await page.waitForTimeout(1200);
const sortChips = await page.locator('.places-sort').count();
check('sort chips appear once filtered', sortChips === 3, String(sortChips));
const dcards = await page.locator('.places-dcard').count();
check('destination photo cards render', dcards > 5, `${dcards} cards`);
// The photo card frame. A wide card crops its photograph to a horizontal
// band, and centred, that band is roofs, the near bank and the car park. The
// crop is pulled above the middle so the skyline, the ridge and the spire come
// back. Asserted as a ratio and as a focus, because a future height tweak that
// widened the box further without moving the crop would quietly bring the
// roofs back.
const frame = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('.places-dcard .places-card-img')]
    .filter((n) => n.tagName === 'IMG' && n.naturalWidth);
  if (!imgs.length) return null;
  const vis = imgs.map((n) => {
    const r = n.getBoundingClientRect();
    const box = r.width / r.height;
    const nat = n.naturalWidth / n.naturalHeight;
    return box > nat ? nat / box : box / nat;
  });
  const r = imgs[0].getBoundingClientRect();
  const focus = getComputedStyle(imgs[0]).objectPosition;
  return {
    box: r.width / r.height,
    avg: vis.reduce((a, v) => a + v, 0) / vis.length,
    n: vis.length,
    focus,
  };
});
check('cards keep the wide frame',
  !!frame && Math.abs(frame.box - 2.4) < 0.15, frame ? frame.box.toFixed(2) + ':1' : 'no loaded photo');
check('the crop sits above the middle of the photograph',
  !!frame && /(3[0-9]|4[0-2])(\.\d+)?%$/.test((frame.focus || '').split(' ')[1] || ''),
  frame ? frame.focus : '');
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

// ── Trips: the day rail, then the drawn city walks ──
//
// The category now opens on the composed multi-day itineraries (the published
// trip layer, see verify_trips.mjs). The one-day city walks this block covers
// are what the "1" chip on the day rail reaches, so that is how it gets there.
await page.locator('.places-country').selectOption('');
await page.waitForTimeout(600);
await page.locator('.places-cat', { hasText: /^trips$/i }).click();
await page.waitForTimeout(1600);
check('trips category opens on the composed itineraries',
  await page.locator('.places-icard').count() > 0);
check('the day slider is there', await page.locator('.trip-slider-input').isVisible());
await page.locator('.trip-slider-input').fill('1');
await page.waitForTimeout(1600);
const tripIdx = await page.locator('.places-ccard').count();
check('one day shows the published-country index', tripIdx > 5, `${tripIdx} countries`);
await page.locator('.places-country').selectOption('AL');
await page.waitForTimeout(1500);
const tcards = await page.locator('.places-tcard').count();
check('citytrip cards render for Albania', tcards >= 3, `${tcards} cards`);
const tKind = await page.locator('.places-tcard .places-card-kind').first().innerText().catch(() => '');
check('trip cards carry a kind chip', /day/i.test(tKind), tKind);
const tFacts = await page.locator('.places-tcard .places-card-facts').first().innerText().catch(() => '');
check('trip cards carry km and stops', /km/.test(tFacts) && /stop/i.test(tFacts), tFacts.replace(/\n/g, ' '));
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
check('beaches category carries the country picker', await page.locator('.places-country').count() === 1);
await page.screenshot({ path: 'shots/places-beaches.png' });

// Mountains carries the country picker like every other tab now, and still
// narrows by a typed country name, which is the path this block drives.
await page.locator('.places-cat', { hasText: /mountains/i }).click();
await page.waitForTimeout(1600);
check('mountains category carries the country picker',
  await page.locator('.places-country').count() === 1);
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
for (const [blankCat, blankRe] of [['general', /^general/i], ['trips', /^trips$/i],
  ['trails', /trails/i], ['beaches', /beaches/i], ['lakes', /^lakes$/i],
  ['mountains', /mountains/i]]) {
  await page.locator('.places-cat', { hasText: blankRe }).first().click();
  await page.waitForTimeout(2600);
  const seen = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(
      '.places-dcard, .places-ccard, .places-tcard, .places-bcard, .places-icard')];
    return {
      n: cards.length,
      blank: cards.filter((c) => c.querySelector('.hero-blank, .places-card-noimg')).length,
    };
  });
  if (seen.blank) blanks.push(`${blankCat}: ${seen.blank} of ${seen.n}`);
}
check('every card carries a picture', blanks.length === 0,
  blanks.length ? blanks.join(', ') : 'no blank cards on any category');
await page.locator('.places-cat', { hasText: /^general/i }).first().click();
await page.waitForTimeout(1500);

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

// ── Priced from: the origin every price here was computed from ──────────
const originBtn = desk.locator('.places-controls .origin-btn');
check('priced-from picker sits in the controls row', await originBtn.isVisible().catch(() => false),
  (await originBtn.innerText().catch(() => '')).replace(/\n/g, ' '));
const beforeOrigin = await desk.locator('.places-ccard .places-card-sub').first().innerText().catch(() => '');
await originBtn.click();
await desk.waitForTimeout(500);
await desk.locator('.origin-search').fill('Barcelona');
await desk.waitForTimeout(600);
await desk.locator('.origin-opt').first().click();
await desk.waitForTimeout(2500);
check('picking an origin names it on the button', /barcelona/i.test(await originBtn.innerText().catch(() => '')),
  (await originBtn.innerText().catch(() => '')).replace(/\n/g, ' '));
// The flag card no longer carries a price, so what proves the origin landed
// is the button naming it (checked just above) and the priced cards inside a
// country, not this subtitle. Kept as a smoke check that the list survives an
// origin change rather than as a price assertion.
const afterOrigin = await desk.locator('.places-ccard .places-card-sub').first().innerText().catch(() => '');
check('the catalogue still lists countries after an origin change',
  /places/.test(afterOrigin), `${beforeOrigin} -> ${afterOrigin}`);
await desk.screenshot({ path: 'shots/places-origin.png' });

// ── The trips index lost its intro paragraph ─────────────────────────────
await desk.locator('.places-cat', { hasText: /^trips$/i }).click();
await desk.waitForTimeout(1200);
check('trips index carries no intro paragraph', await desk.locator('.places-intro').count() === 0);
await desk.locator('.places-cat', { hasText: /general/i }).click();
await desk.waitForTimeout(800);

// ── Lifestyle: the stay tier every price here was computed at ────────────
const pill = desk.locator('.places-lifestyle');
check('lifestyle pill sits in the controls row', await pill.isVisible().catch(() => false));
check('pill names the current stay tier', /entire place/i.test(await pill.innerText().catch(() => '')),
  (await pill.innerText().catch(() => '')).replace(/\n/g, ' '));
// Brussels, one of the cities with measured tiers, so the dorm price is a
// real number rather than the entire-place fallback every village shows.
await desk.locator('.places-country').selectOption('BE');
await desk.waitForTimeout(1200);
const bru = desk.locator('.places-dcard', { hasText: 'Brussels' }).first();
const priceBefore = await bru.locator('.places-card-price').innerText().catch(() => '');
await pill.click();
await desk.waitForTimeout(700);
check('lifestyle panel opens over the destinations tab',
  await desk.locator('.accom-panel .lifestyle-stay-chips').isVisible().catch(() => false));
await desk.screenshot({ path: 'shots/places-lifestyle.png' });
await desk.locator('.lifestyle-stay-chips .chip', { hasText: 'Dorm bed' }).first().click();
await desk.waitForTimeout(1500);
const priceAfter = await bru.locator('.places-card-price').innerText().catch(() => '');
check('catalogue prices follow the stay tier', priceBefore !== priceAfter && /€/.test(priceAfter),
  `${priceBefore.replace(/\n/g, ' ')} -> ${priceAfter.replace(/\n/g, ' ')}`);
check('pill follows the new tier', /dorm bed/i.test(await pill.innerText().catch(() => '')),
  (await pill.innerText().catch(() => '')).replace(/\n/g, ' '));

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
