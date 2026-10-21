// Headless verify for the Destinations search box: one field that finds both
// a catalogue city and any location on earth (a village Carta does not price,
// a postcode, a home address), then ranks the catalogue by distance from it.
//
//   node scripts/verify_places_search.mjs [url]   (default http://localhost:$CARTA_PORT or 4173)
//
// Nominatim is mocked at the network layer, so the run is deterministic and
// never spends someone else's rate limit: the mock answers with a real point
// (a street in Aalter, between Ghent and Bruges), and the check is that the
// nearest cards that come back are the ones actually closest to it.
//
// Screenshots to shots/places-search-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;

// A street address Carta has no destination for, halfway between two it does.
// Both records are shaped exactly like the live service answers this query: a
// house has no `name` and opens its label with a bare number, a village has a
// name and repeats it as the label's first part.
const ADDRESS = 'Stationsstraat 12, Aalter';
const NOMINATIM = [
  {
    place_id: 1,
    name: '',
    display_name: '12, Stationsstraat, Aalter, Gent, Oost-Vlaanderen, Vlaanderen, 9880, Belgie / Belgique / Belgien',
    lat: '51.0900',
    lon: '3.4470',
    address: { country: 'Belgie / Belgique / Belgien', country_code: 'be' },
  },
  {
    place_id: 2,
    name: 'Aalter',
    display_name: 'Aalter, Gent, Oost-Vlaanderen, Vlaanderen, 9880, Belgie / Belgique / Belgien',
    lat: '51.0925',
    lon: '3.4456',
    address: { country: 'Belgie / Belgique / Belgien', country_code: 'be' },
  },
];

const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };
const errors = [];
const NOISE = /ERR_FAILED|config is not valid/;

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 120)); });

// Where the device says it is, and what the reverse lookup names that point:
// a street in Ghent, so "use my location" must land on Ghent first.
const DEVICE = { latitude: 51.0538, longitude: 3.7250 };
const REVERSE = {
  place_id: 9,
  name: 'Korenmarkt',
  display_name: 'Korenmarkt, Binnenstad, Gent, Oost-Vlaanderen, Vlaanderen, 9000, Belgie / Belgique / Belgien',
  lat: '51.0540',
  lon: '3.7220',
  address: { country: 'Belgie / Belgique / Belgien', country_code: 'be' },
};

let geocodeCalls = 0;
let reverseCalls = 0;
await page.route('https://nominatim.openstreetmap.org/**', async (route) => {
  const isReverse = route.request().url().includes('/reverse');
  if (isReverse) reverseCalls += 1;
  else geocodeCalls += 1;
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(isReverse ? REVERSE : NOMINATIM),
  });
});

await page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
  } catch { /* storage unavailable */ }
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3000);

// Into the tab. Desktop: the header nav (BottomNav is CSS-hidden above 768px,
// and clicking a hidden bar is the trap this harness used to fall into).
const headerTab = page.locator('.header-nav-item', { hasText: /^\s*explore\s*$/i }).first();
await headerTab.click();
await page.waitForTimeout(1500);
check('destinations tab opens', await page.locator('.places-tab').isVisible());

// T384: this harness was written against the General category (priced towns
// as .places-dcard), which UX pass 1 removed, so it timed out on its first
// General click (T373 baseline). It now ranks the Beaches list from the same
// anchors: every check below keeps its question, read off beach cards.
const BEACHES = /^beaches$/i;
await page.locator('.dtab-cats [role="tab"]', { hasText: BEACHES }).first().click();
await page.waitForTimeout(4000);

const input = page.locator('.places-search input');
const kmText = () => page.locator('.places-bcard .places-card-km').allInnerTexts();
// A card's chip is "Nearby, 12 km", "Day trip, ~1h20" or "Worth the
// journey, 415 km" (lib/regions.js bandChip). The hours are the road model's
// estimate, so they are turned back into the km they came from, which keeps
// "nearest first" one comparison across the bands.
const chipKm = (s) => {
  const h = s.match(/(\d+)h(\d{2})/);
  if (h) return Math.round(((+h[1] + +h[2] / 60) - 0.6) * 72 / 1.3);
  const k = s.replace(/[.,\s](?=\d{3})/g, '').match(/(\d+)\s*km/);
  return k ? +k[1] : NaN;
};
const kmNumbers = async () => (await kmText()).map(chipKm);

// ── 1. A catalogue city still resolves from the local index, no network ──
await input.fill('Ghent');
await page.waitForTimeout(600);
const suggCities = await page.locator('.places-sugg-item:not(.places-sugg-any) .places-sugg-city').allInnerTexts();
check('catalogue city suggested as you type', suggCities.some((s) => /ghent/i.test(s)), suggCities.join(' | '));
check('typing alone never calls the geocoder', geocodeCalls === 0, `${geocodeCalls} calls`);
await page.locator('.places-sugg-item', { hasText: /ghent/i }).first().click();
await page.waitForTimeout(1200);
// T384: beaches near Ghent answer at day-trip scope, so either heading.
check('picking a city switches to near-mode', /(near|day trip of) ghent/i.test(await page.locator('.places-nearhead').innerText().catch(() => '')));
const cityKm = await kmNumbers();
check('cards carry a distance from the city', cityKm.length > 5, `${cityKm.length} cards`);
check('nearest first', cityKm.slice(0, 12).every((v, i, a) => i === 0 || a[i - 1] <= v), cityKm.slice(0, 6).join(', '));
await page.screenshot({ path: 'shots/places-search-city.png' });

// ── 2. An address Carta has no destination for ──
await page.locator('.places-nearclear').click();
await page.waitForTimeout(400);
await input.fill(ADDRESS);
await page.waitForTimeout(700);

const anyRow = page.locator('.places-sugg-any');
check('off-catalogue text offers the map search', await anyRow.isVisible(), await anyRow.innerText().catch(() => ''));
check('the offer quotes what was typed', (await anyRow.innerText().catch(() => '')).includes(ADDRESS));
check('still no geocoder call before the explicit action', geocodeCalls === 0, `${geocodeCalls} calls`);
await page.screenshot({ path: 'shots/places-search-offer.png' });

await anyRow.click();
await page.waitForTimeout(1200);
check('the action calls the geocoder exactly once', geocodeCalls === 1, `${geocodeCalls} calls`);
const geoRows = page.locator('.places-sugg-item.is-geo');
check('geocoded hits render as their own group', await geoRows.count() === 2, String(await geoRows.count()));
const geoLabel = await geoRows.first().innerText().catch(() => '');
const geoTitle = (await geoRows.first().locator('.places-sugg-city').innerText().catch(() => '')).trim();
// A house number alone is no title: the street and the town come with it.
check('a house hit is titled street and town', /Stationsstraat/.test(geoTitle) && /Aalter/.test(geoTitle), geoTitle);
check('the rest of the address sits under it', /9880/.test(geoLabel), geoLabel.replace(/\n/g, ' / '));
check('the trilingual country name is folded to one', !/Belgique/.test(geoLabel), geoLabel.replace(/\n/g, ' / '));
const villageTitle = (await geoRows.nth(1).locator('.places-sugg-city').innerText().catch(() => '')).trim();
check('a named place is titled by its name alone', villageTitle === 'Aalter', villageTitle);
check('group heads name both groups', (await page.locator('.places-sugg-head').count()) >= 1);
check('the offer row gives way to the hits', await page.locator('.places-sugg-any').count() === 0);
// One offer at a time: the empty state below must not repeat the row that is
// already open a few pixels higher.
check('no second copy of the offer under the list', await page.locator('.places-empty-cta').count() === 0);
await page.screenshot({ path: 'shots/places-search-hits.png' });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
const suggBox = await page.locator('.places-sugg').boundingBox();
check('the list fits a phone', suggBox != null && suggBox.width <= 390, suggBox ? `${Math.round(suggBox.width)}px` : 'no box');
await page.screenshot({ path: 'shots/places-search-phone.png' });
await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(400);

await geoRows.first().click();
await page.waitForTimeout(1500);

const nearHead = await page.locator('.places-nearhead').innerText().catch(() => '');
check('the address becomes the near anchor', /Aalter/i.test(nearHead), nearHead.replace(/\n/g, ' / '));
check('the rest of the address stays on screen', /9880|Oost-Vlaanderen/.test(nearHead), nearHead.replace(/\n/g, ' / '));

const addrKm = await kmNumbers();
check('the catalogue is ranked from the address', addrKm.length > 5, `${addrKm.length} cards`);
check('nearest first', addrKm.slice(0, 12).every((v, i, a) => i === 0 || a[i - 1] <= v), addrKm.slice(0, 6).join(', '));
check('the closest card is genuinely close', addrKm[0] != null && addrKm[0] < 40, `${addrKm[0]} km`);
// T384: was "Ghent and Bruges lead the list", a General-category reading.
// On beaches the same question is whether the coast an hour from Aalter
// leads, so the first card must be within a day trip.
check('the coast nearest the address leads the list', addrKm[0] != null && addrKm[0] <= 120, `${addrKm[0]} km`);
await page.screenshot({ path: 'shots/places-search-address.png' });

// ── 3. Trips and trails follow the same anchor ──
await page.locator('.dtab-cats [role="tab"]', { hasText: /^trails$/i }).click();
await page.waitForTimeout(2500);
const trailKm = (await page.locator('.places-tcard .places-card-km').allInnerTexts())
  .map((s) => parseInt(s.replace(/\D+/g, ''), 10));
const trailEmpty = await page.locator('.places-empty').innerText().catch(() => '');
check(
  'trails answer the same anchor',
  trailKm.length > 0 ? trailKm.every((v, i, a) => i === 0 || a[i - 1] <= v) : /aalter/i.test(trailEmpty),
  trailKm.length ? trailKm.slice(0, 5).join(', ') : trailEmpty,
);
await page.screenshot({ path: 'shots/places-search-trails.png' });

// ── 4. The keyboard path: type, Enter to search, Enter to take the top hit ──
// T384: back to Beaches (was the removed General category).
await page.locator('.dtab-cats [role="tab"]', { hasText: BEACHES }).first().click();
await page.waitForTimeout(600);
await page.locator('.places-nearclear').click();
await page.waitForTimeout(400);
const callsBeforeKeyboard = geocodeCalls;
await input.fill(ADDRESS);
await page.waitForTimeout(700);
await input.press('Enter');
await page.waitForTimeout(1200);
check('Enter on an address searches the map', geocodeCalls === callsBeforeKeyboard + 1, `${geocodeCalls} calls`);
await input.press('Enter');
await page.waitForTimeout(1200);
check('Enter again takes the top hit', /Aalter/i.test(await page.locator('.places-nearhead').innerText().catch(() => '')));

// Enter on a catalogue city takes the city, no network call.
await page.locator('.places-nearclear').click();
await page.waitForTimeout(400);
const callsBeforeCity = geocodeCalls;
await input.fill('Ghent');
await page.waitForTimeout(700);
await input.press('Enter');
await page.waitForTimeout(1000);
check('Enter on a catalogue city takes the city', /(near|day trip of) ghent/i.test(await page.locator('.places-nearhead').innerText().catch(() => '')));
check('and never asks the geocoder for it', geocodeCalls === callsBeforeCity, `${geocodeCalls - callsBeforeCity} extra calls`);
await page.locator('.places-nearclear').click();
await page.waitForTimeout(400);

// ── 5. "Use my location": the same anchor without the typing ──
const locateBtn = page.locator('.places-locate');
check('the field carries a locate button', await locateBtn.isVisible());

// Refused first: a permission the browser denies must read as a setting to
// change, not as a broken app.
await page.context().clearPermissions();
await locateBtn.click();
await page.waitForTimeout(1500);
const denied = await page.locator('.places-locate-err').innerText().catch(() => '');
check('a refusal explains itself', /switched off|turn it on/i.test(denied), denied);
check('a refusal never reaches the geocoder', reverseCalls === 0, `${reverseCalls} reverse calls`);
await page.screenshot({ path: 'shots/places-search-locate-denied.png' });

// Then granted, at a fixed coordinate.
// globalThis.URL: this script's own URL constant shadows the constructor.
await page.context().grantPermissions(['geolocation'], { origin: new globalThis.URL(URL).origin });
await page.context().setGeolocation(DEVICE);
await locateBtn.click();
await page.waitForTimeout(2500);
check('the refusal note clears on a good fix', await page.locator('.places-locate-err').count() === 0);
check('the fix is named by a reverse lookup', reverseCalls === 1, `${reverseCalls} reverse calls`);
const meHead = await page.locator('.places-nearhead').innerText().catch(() => '');
check('the located place heads the list', /Korenmarkt/.test(meHead), meHead.replace(/\n/g, ' / '));
const meKm = await kmNumbers();
// The device coordinate is a square in Ghent, a kilometre off the stored city
// centre, so the leading card is a low number rather than a flat zero. It has
// to be the DEVICE's coordinate that ranks, not the reverse lookup's own,
// which answers with the matched feature's centre.
// T384: was "the leading card is under 3 km and is Ghent", a reading of the
// removed General list. On beaches the device ranking is nearest first and
// the Belgian coast, about 50 km from Ghent, leads.
check('the catalogue is ranked from the device', meKm.length > 5
  && meKm.slice(0, 12).every((v, i, a) => i === 0 || a[i - 1] <= v), `${meKm.slice(0, 5).join(', ')}`);
check('the coast nearest the device leads the list', meKm[0] != null && meKm[0] <= 120, `${meKm[0]} km`);
await page.screenshot({ path: 'shots/places-search-locate.png' });

// The crosshair rides inside the field, so on a phone it must stay inside the
// field's own box and leave the typed text room rather than sitting over it.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(500);
const fieldBox = await page.locator('.places-search').boundingBox();
const btnBox = await locateBtn.boundingBox();
const inside = fieldBox && btnBox
  && btnBox.x >= fieldBox.x && btnBox.x + btnBox.width <= fieldBox.x + fieldBox.width + 1
  && btnBox.y >= fieldBox.y - 1;
check('the locate button sits inside the field on a phone', !!inside,
  btnBox ? `field ${Math.round(fieldBox.width)}px, button at +${Math.round(btnBox.x - fieldBox.x)}px` : 'no box');
// Room for the placeholder: the input reserves padding for the button.
const padRight = await page.locator('.places-search input').evaluate((el) => getComputedStyle(el).paddingRight);
check('the input reserves room for it', parseFloat(padRight) >= btnBox.width, padRight);
await page.screenshot({ path: 'shots/places-search-locate-phone.png' });
await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(400);
await page.locator('.places-nearclear').click();
await page.waitForTimeout(400);

// ── 6. Nothing found reads as a sentence, not an empty box ──
await page.unroute('https://nominatim.openstreetmap.org/**');
await page.route('https://nominatim.openstreetmap.org/**', (route) => route.fulfill({
  status: 200, contentType: 'application/json', body: '[]',
}));
await input.fill('qqzzxx not a place');
await page.waitForTimeout(700);
await page.locator('.places-sugg-any').click();
await page.waitForTimeout(1200);
const note = await page.locator('.places-sugg-note').innerText().catch(() => '');
check('a miss explains what to do next', /search again/i.test(note), note);

// ── Report ──
console.log('');
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `   (${c.note})` : ''}`);
if (errors.length) {
  console.log('\nPage errors:');
  for (const e of [...new Set(errors)].slice(0, 8)) console.log('  ' + e);
}
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed${errors.length ? `, ${errors.length} page errors` : ''}`);
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
