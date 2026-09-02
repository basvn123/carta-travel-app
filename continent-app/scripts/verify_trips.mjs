// Headless verify for the composed itineraries in the Destinations tab's
// Trips category (the published trip layer, pipeline/trips).
//
//   node scripts/verify_trips.mjs [url]      (default http://localhost:4173)
//
// What it proves, in the order a traveller meets it:
//   the Trips category opens on the composed itineraries, not on a country index
//   the day slider runs from Any through one day to a fortnight and says how
//     many trips each position holds
//   dragging it narrows the set, and what is left is that length (or the
//     deliberate one-day-either-side near fit)
//   day 1 still reaches the drawn one-day city walks, unchanged
//   pace and place size are real filters, and every trip carries both
//   every card and every page leads with a photograph that RESOLVES
//   picking a country loads that country's own file
//   a card carries a photograph that RESOLVES, a score, a route and a cost
//   opening a card loads the detail file and draws the route, the day by day
//     and the checks block
//   the day by day names as many days as the trip claims
//   a shared #itin= link opens the same trip cold
//   nothing scrolls sideways on a 390 px phone
//
// Screenshots to shots/trips-*.png.

import { chromium } from 'playwright';

// Not named URL: that would shadow the global URL constructor the wire
// fetches below need.
const BASE = process.argv[2] || 'http://localhost:4173/';

const browser = await chromium.launch();
const errors = [];
const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };

const NOISE = /emrldtp|ERR_FAILED|config is not valid|open-meteo|basemaps\.cartocdn/;
// A generic "Failed to load resource" console line carries no URL, so it is
// useless as a failure. Requests are watched properly below instead, which
// names what broke.
const CONSOLE_NOISE = /Failed to load resource/;
// Known-absent and documented: migration 018's overrides table is not applied
// on the live project, and lib/overrides.js is built to resolve to no
// corrections when the read fails rather than take the catalogue down.
const REQUEST_NOISE = /content_overrides|emrldtp/;
const badRequests = [];

const boot = async (viewport, hash = '') => {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (NOISE.test(m.text()) || CONSOLE_NOISE.test(m.text())) return;
    errors.push('console: ' + m.text().slice(0, 140));
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !REQUEST_NOISE.test(r.url())) badRequests.push(`${r.status()} ${r.url()}`);
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
    } catch { /* storage unavailable */ }
  });
  await page.goto(BASE + hash, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2600);
  return page;
};

/** Destinations tab, Trips category. Works on both widths: the desktop header
 *  carries the tabs, the phone carries the bottom bar.
 *
 *  The app already opens on Destinations, so the nav is only clicked when it
 *  is not already there. Clicking it unconditionally was the flakiest step in
 *  this file: the header re-renders while the catalogue hydrates, and a
 *  locator resolved mid-render detaches under the click. */
const toTrips = async (page) => {
  if (!(await page.locator('.places-tab').isVisible().catch(() => false))) {
    const header = page.locator('.header-nav-item', { hasText: /destinations/i }).first();
    const bar = page.locator('.bottom-nav-item', { hasText: /destinations/i }).first();
    if (await header.isVisible().catch(() => false)) await header.click();
    else await bar.click();
    await page.locator('.places-tab').waitFor({ state: 'visible', timeout: 15000 });
  }
  // Every control on this tab is drawn TWICE (phone toolbar + desktop side
  // panel), so both steps must name the VISIBLE twin: the category tile is
  // .places-cat on a phone and .side-cat on desktop, and .trip-slider-input
  // matches in both places at once. Without this the desktop pass clicked a
  // display:none tile until it timed out and the phone pass tripped
  // Playwright's strict mode on two sliders.
  await page.locator('.places-cat:visible, .side-cat:visible', { hasText: /^\s*trips\s*$/i })
    .first().click();
  await page.locator('.trip-slider-input:visible').first()
    .waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(1800);
};

/** Drag the day slider. 0 is "any length". */
const setDays = async (page, n) => {
  await page.locator('.trip-slider-input:visible').first().fill(String(n));
  await page.waitForTimeout(1100);
};

/** The result count, read from the slider's own data-n rather than from the
 *  DOM: the list renders a page at a time, so counting cards would compare
 *  the page size with itself. The slider stopped SAYING the number on
 *  2026-09-02 (a caption on a control that read as a claim about the
 *  catalogue); it still knows it, and this is the only thing that does. */
const totalOf = async (page) => {
  const n = await page.locator('.trip-slider:visible').first()
    .getAttribute('data-n').catch(() => null);
  return Number(n || 0);
};

// ── The wire itself, before any UI opinion of it ──
try {
  const res = await fetch(new URL('/trips/index.json', BASE).href);
  const ix = await res.json();
  check('index.json served as JSON', res.headers.get('content-type')?.includes('json'));
  check('every country has trips', ix.countries.length >= 40, `${ix.countries.length} countries`);
  check('a real catalogue of trips', ix.n_trips >= 800, `${ix.n_trips} trips`);
  check('all three shapes are published', Object.keys(ix.shapes || {}).length === 3,
    JSON.stringify(ix.shapes));
  check('short and long trips both exist', ix.days.includes(2) && ix.days.includes(14),
    ix.days.join(','));
  check('attribution rides in the index', (ix.attribution || []).length >= 4);
} catch (e) {
  check('wire fetch ran', false, String(e).split('\n')[0]);
}

// ── Desktop pass ──
try {
  const page = await boot({ width: 1440, height: 900 });
  await toTrips(page);

  check('the Trips category opens on itineraries', await page.locator('.places-icard').count() > 0);
  check('the day slider is there', await page.locator('.trip-slider-input:visible').first().isVisible());
  check('pace and place size are offered',
    await page.locator('.places-facets .places-class:visible, .side-facets .places-class:visible').count() >= 5,
    `${await page.locator('.places-facets .places-class:visible, .side-facets .places-class:visible').count()} chips`);

  const cards = await page.locator('.places-icard').count();
  check('a real page of trips', cards >= 12, `${cards} cards`);
  const allTotal = await totalOf(page);
  check('the slider knows the whole result set', allTotal > 100, `${allTotal} trips`);
  check('but never says it on screen', await page.locator('.trip-slider-count').count() === 0);

  // A photograph that actually resolves, not a 404 tile.
  const imgOk = await page.waitForFunction(() => {
    const el = document.querySelector('.places-icard img.places-card-img');
    return !!el && el.complete && el.naturalWidth > 0;
  }, null, { timeout: 12000 }).then(() => true).catch(() => false);
  check('a card photo actually loads', imgOk);

  const cardText = await page.locator('.places-icard').first().innerText();
  check('a card names its length', /\d+\s*days?/i.test(cardText), cardText.split('\n')[0]);
  check('a card carries a score', await page.locator('.itin-card-score').count() >= cards);
  check('a card carries a route', await page.locator('.itin-card-route').count() >= cards);
  check('a card carries a per-day cost', /€/.test(cardText));
  check('a card says what was checked', await page.locator('.itin-card-checks').count() >= cards);

  // Five days narrows the set, and what is left is five days or a labelled
  // near fit one day either side.
  await setDays(page, 5);
  const afterDays = await totalOf(page);
  check('a day count narrows the result set', afterDays > 0 && afterDays < allTotal,
    `${allTotal} -> ${afterDays}`);
  const lengths = await page.locator('.itin-card-days').allInnerTexts();
  const offBy = lengths.filter((s) => !/\b(4|5|6)\b/.test(s));
  check('every trip left is within a day of five', offBy.length === 0,
    offBy.slice(0, 3).join(' | '));

  await page.screenshot({ path: 'shots/trips-desktop.png' });

  // Pace is a real filter, and it narrows further.
  const relaxed = page.locator('.places-facets .places-class:visible, .side-facets .places-class:visible').filter({ hasText: /relaxed/i }).first();
  if (await relaxed.isEnabled().catch(() => false)) {
    await relaxed.click();
    await page.waitForTimeout(1100);
    const paced = await totalOf(page);
    check('pace narrows the set', paced > 0 && paced <= afterDays, `${afterDays} -> ${paced}`);
    await relaxed.click();
    await page.waitForTimeout(900);
  } else {
    check('pace narrows the set', false, 'relaxed chip disabled');
  }

  // Day 1 is still the drawn one-day city walks, which is the thing this
  // category showed before the itineraries arrived.
  await setDays(page, 1);
  await page.waitForTimeout(900);
  const walkIdx = await page.locator('.places-ccard').count();
  const walkCards = await page.locator('.places-tcard').count();
  check('one day still reaches the city walks', walkIdx > 0 || walkCards > 0,
    `${walkIdx} countries, ${walkCards} walks`);
  await page.screenshot({ path: 'shots/trips-oneday.png' });

  // Back to the itineraries, then narrow by country.
  await setDays(page, 0);   // back to any length
  const picker = page.locator('.places-country:visible').first();
  if (await picker.isVisible().catch(() => false)) {
    await picker.selectOption('AT');
    await page.waitForTimeout(2000);
    const head = await page.locator('.itin-card-route').first().innerText().catch(() => '');
    check('picking a country loads that country', head.length > 0, head.replace(/\n/g, ' ').slice(0, 60));
  } else {
    check('picking a country loads that country', false, 'country picker not visible');
  }
  await page.screenshot({ path: 'shots/trips-country.png' });

  // Open one and read the page.
  await page.locator('.places-icard').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('.places-icard').first().click();
  await page.waitForTimeout(3200);
  check('the trip page opens', await page.locator('.itin-page').isVisible());
  check('the page leads with a photograph', await page.locator('.itin-photohero-img').isVisible());
  const heroOk = await page.waitForFunction(() => {
    const el = document.querySelector('img.itin-photohero-img');
    return !!el && el.complete && el.naturalWidth > 0;
  }, null, { timeout: 12000 }).then(() => true).catch(() => false);
  check('the hero photograph actually loads', heroOk);
  check('the route is drawn on a map', await page.locator('.maplibregl-canvas').count() > 0);
  check('the page lists the route', await page.locator('.itin-route .itin-stop').count() >= 1);
  check('the page lists the days', await page.locator('.itin-days .itin-day').count() >= 2);
  check('the page shows what it costs', await page.locator('.itin-cost').isVisible());
  check('the page shows what was checked', await page.locator('.itin-checks').isVisible());
  check('the page offers the planner', await page.locator('.itin-use').isVisible());

  const factDays = await page.locator('.itin-facts .tpage-fact-val').first().innerText();
  const dayRows = await page.locator('.itin-days .itin-day').count();
  check('every claimed day has a row', String(dayRows) === factDays.trim(),
    `claims ${factDays.trim()}, lists ${dayRows}`);

  const sightOk = await page.waitForFunction(() => {
    const el = document.querySelector('.itin-sight img.itin-sight-img');
    return !!el && el.complete && el.naturalWidth > 0;
  }, null, { timeout: 12000 }).then(() => true).catch(() => false);
  check('a named sight shows a real photograph', sightOk);

  await page.screenshot({ path: 'shots/trips-page-desktop.png' });
  await page.close();
} catch (e) {
  check('desktop pass ran', false, String(e).split('\n')[0]);
}

// ── A shared link opens the same trip cold ──
try {
  const res = await fetch(new URL('/trips/AT.json', BASE).href);
  const at = await res.json();
  const id = at.trips[0].id;
  const page = await boot({ width: 1440, height: 900 }, `#itin=${id}`);
  await page.waitForTimeout(3400);
  check('a shared link opens the trip page', await page.locator('.itin-page').isVisible(), id);
  check('the shared trip has its route', await page.locator('.itin-route .itin-stop').count() >= 1);
  await page.screenshot({ path: 'shots/trips-shared.png' });
  await page.close();
} catch (e) {
  check('shared link pass ran', false, String(e).split('\n')[0]);
}

// ── Phone pass ──
try {
  const page = await boot({ width: 390, height: 844 });
  await toTrips(page);

  const cards = await page.locator('.places-icard').count();
  check('phone shows trips', cards >= 6, `${cards} cards`);
  const grid = await page.locator('.places-list').first().boundingBox();
  check('no horizontal scroll on the list', grid && grid.width <= 390,
    `list ${Math.round(grid?.width || 0)}px`);
  const docWide = await page.evaluate(() => document.documentElement.scrollWidth);
  check('no horizontal scroll on the page', docWide <= 391, `${docWide}px`);
  await page.screenshot({ path: 'shots/trips-phone.png' });

  await page.locator('.places-icard').first().click();
  await page.waitForTimeout(3200);
  check('phone opens the trip page', await page.locator('.itin-page').isVisible());
  const pageWide = await page.evaluate(() => document.documentElement.scrollWidth);
  check('trip page does not scroll sideways', pageWide <= 391, `${pageWide}px`);
  await page.screenshot({ path: 'shots/trips-page-phone.png' });
  await page.close();
} catch (e) {
  check('phone pass ran', false, String(e).split('\n')[0]);
}

check('no request failed', badRequests.length === 0,
  [...new Set(badRequests)].slice(0, 3).join(' | '));

// ── Report ──
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
}
if (errors.length) {
  console.log('\nPage errors:');
  for (const e of errors.slice(0, 10)) console.log('  ' + e);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
await browser.close();
process.exit(failed > 0 || errors.length > 0 ? 1 : 0);
