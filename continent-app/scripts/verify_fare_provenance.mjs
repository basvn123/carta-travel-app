// Headless verify for the fare provenance layer (FareProvenance.jsx):
// freshness chips, estimate styling, "from" phrasing and the booking-site
// warning, across the homepage, the results list, the destination sheet and
// the trip itinerary.
//
// No fare in the shipped data carries contract A fields yet, so the display
// layer's ?provmock= seam supplies them per page load:
//   (none)                       baseline: no chips, no tildes, from-words
//                                and booking notes present (unconditional)
//   provmock=age:3,exp:14        a real quote seen 3 days ago
//   provmock=age:3,exp:14,est:1  a model estimate (tilde + est. chip)
//
// Run from inside continent-app/ against a fresh build:
//   npm run build && node scripts/verify_fare_provenance.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4193;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const isUp = async () => {
  try { return (await fetch(BASE)).ok; } catch { return false; }
};
let srv = null;
const waitForServer = async () => {
  if (await isUp()) return;
  srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    shell: true, stdio: 'ignore',
  });
  for (let i = 0; i < 60; i += 1) {
    if (await isUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite preview never came up');
};

let failures = 0;
const fail = (msg) => { console.error('FAIL:', msg); failures += 1; process.exitCode = 1; };
const ok = (msg) => console.log('ok  ', msg);

// Chunk 2 (the fare write path) ships REAL contract A fields into the fare
// slices, and this repo may hold both states while that merge rolls out. The
// destination sheet reads the hydrated route directly, so its "renders
// nothing without fields" baseline only applies while CRL's slice is still
// provenance-free.
let crlHasProv = false;
const probeSlice = async () => {
  try {
    const slice = await (await fetch(`${BASE}/fares/CRL.json`)).json();
    crlHasProv = Object.values(slice).some((r) => r && (r.o != null || r.s != null));
    console.log(`CRL slice carries provenance fields: ${crlHasProv}`);
  } catch { /* keep false */ }
};

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
  label: 'Provenance verify trip',
};
const hash = `trip=0.${Buffer.from(JSON.stringify(draft)).toString('base64url')}`;

const browser = await (async () => {
  await waitForServer();
  return chromium.launch();
})();

async function newPage() {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await page.addInitScript(() => {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
  });
  return page;
}

const count = (page, sel) => page.locator(sel).count();

/** The trip itinerary via the share hash: receipt rows + a leg's links. */
async function checkTrip(page, mock, tag) {
  await page.goto(`${BASE}/?o=CRL${mock ? `&provmock=${mock}` : ''}#${hash}`);
  await page.getByRole('button', { name: 'Open trip' }).click({ timeout: 120000 });
  await page.locator('.itin').waitFor({ timeout: 120000 });
  await page.waitForTimeout(1500);

  // Expand the estimated-total receipt and the first inter-stop leg.
  await page.locator('.itin-breakdown-toggle').click();
  await page.locator('.itin-breakdown-body').waitFor({ timeout: 10000 });
  await page.locator('.itin-leg-main').first().click();
  await page.locator('.itin-leg .trip-leg-links').first().waitFor({ timeout: 15000 });

  const notes = await count(page, '.itin .booking-note');
  if (notes < 1) fail(`[trip ${tag}] no booking note near the leg's booking links`);
  else ok(`[trip ${tag}] booking note present near external links (${notes})`);

  // Ground legs ALREADY carry real est/src flags (transport.js attaches
  // est:true/src:'model' to distance-based fares), so est chips on leg rows
  // are correct without any mock. What must stay silent without fields are
  // the FLIGHT receipt rows (.trip-total-row) and every age chip.
  const ages = await count(page, '.itin .fare-prov-age');
  const legEsts = await count(page, '.itin .fare-prov-est');
  const flightTags = await count(page, '.itin .trip-total-row .fare-prov');
  const flightVals = await page.locator('.itin .trip-total-row .val').allInnerTexts();
  const flightTildes = flightVals.filter((v) => v.includes('~')).length;

  if (legEsts < 1) fail(`[trip ${tag}] ground legs carry real est flags but no est. chip rendered`);
  else ok(`[trip ${tag}] est. chips on genuinely estimated ground legs (${legEsts})`);

  if (!mock) {
    if (flightTags > 0) fail(`[trip ${tag}] flight rows rendered chips with no fields (${flightTags})`);
    else ok(`[trip ${tag}] flight rows silent without fields`);
    if (ages > 0) fail(`[trip ${tag}] age chips rendered with no fields (${ages})`);
    else ok(`[trip ${tag}] no age chips without fields`);
    if (flightTildes > 0) fail(`[trip ${tag}] flight prices carry a tilde with no fields`);
    else ok(`[trip ${tag}] no tilde on flight prices without fields`);
  } else if (mock.includes('est')) {
    if (await count(page, '.itin .trip-total-row .fare-prov-est') < 1) fail(`[trip ${tag}] est. chip missing on flight rows`);
    else ok(`[trip ${tag}] est. chip on mocked flight rows`);
    if (flightTildes < 1) fail(`[trip ${tag}] no ~€ flight prices in the receipt`);
    else ok(`[trip ${tag}] tilde on mocked flight prices (${flightTildes})`);
  } else {
    if (ages < 1) fail(`[trip ${tag}] age chip missing`);
    else {
      const txt = (await page.locator('.itin .fare-prov-age').first().innerText()).trim();
      if (txt !== 'seen 3 days ago') fail(`[trip ${tag}] age bucket reads "${txt}"`);
      else ok(`[trip ${tag}] age chips render: "${txt}" (${ages})`);
    }
    if (await count(page, '.itin .trip-total-row .fare-prov-est') > 0) fail(`[trip ${tag}] est. chip on a flight row for a non-estimate mock`);
    else ok(`[trip ${tag}] flight rows show age only, no est. chip`);
  }
  await page.screenshot({ path: `${SHOTS}/prov-trip-${tag}.png`, fullPage: false });
}

/** Homepage: receipt flight lines + the deck's cheapest-three rows. The app
 *  lands on the Map tab, so walk over via the HOME nav button. */
async function checkHome(page, mock, tag) {
  await page.goto(`${BASE}/?o=CRL${mock ? `&provmock=${mock}` : ''}`);
  await page.locator('.result-row, .home-page').first().waitFor({ timeout: 120000 });
  for (const btn of await page.getByRole('button').all()) {
    const txt = (await btn.innerText().catch(() => '')).trim();
    if (/^home$/i.test(txt) && (await btn.isVisible().catch(() => false))) { await btn.click(); break; }
  }
  await page.locator('.home-receipt').waitFor({ timeout: 120000 });
  await page.waitForTimeout(1000);

  const fromWords = await count(page, '.home-prev .prov-from');
  const tags = await count(page, '.home-receipt .fare-prov');
  const body = await page.locator('.home-r-body').innerText();

  if (!mock) {
    // Since the estimate bands shipped, the receipt's pick can be GENUINELY
    // estimate-priced with no mock: est chips are then correct, but only
    // when the tilde rides the flight lines too, and an age chip can never
    // appear without fields (only harvests and mocks produce observed_at).
    const ageChips = await count(page, '.home-receipt .fare-prov-age');
    const estChips = await count(page, '.home-receipt .fare-prov-est');
    const tilde = /~€/.test(body);
    if (ageChips > 0) fail(`[home ${tag}] age chips rendered with no fields`);
    else ok(`[home ${tag}] no age chips without fields`);
    if ((estChips > 0) !== tilde) {
      fail(`[home ${tag}] est chip/tilde mismatch (chips ${estChips}, tilde ${tilde})`);
    } else {
      ok(`[home ${tag}] est styling consistent (${estChips > 0 ? 'genuinely estimated receipt' : 'quoted receipt, no chips'})`);
    }
    if (fromWords < 1) fail(`[home ${tag}] discovery rows carry no "from" word`);
    else ok(`[home ${tag}] "from" phrasing on discovery rows (${fromWords})`);
  } else if (mock.includes('est')) {
    if (await count(page, '.home-receipt .fare-prov-est') < 1) fail(`[home ${tag}] est. chip missing on receipt flight lines`);
    else ok(`[home ${tag}] est. chip on receipt flight lines`);
    if (!/~/.test(body)) fail(`[home ${tag}] no tilde on estimated receipt lines`);
    else ok(`[home ${tag}] tilde on estimated receipt lines`);
    if (fromWords > 0) fail(`[home ${tag}] "from" phrasing kept on an estimate`);
    else ok(`[home ${tag}] estimates drop the "from" word`);
  } else {
    // Mocked age: the receipt shows the age chip, UNLESS its fare is
    // genuinely estimate-priced, in which case EST correctly replaces the
    // age (an estimate has no observed_at). Some chip must always render.
    const seenAges = await count(page, '.home-receipt .fare-prov-age');
    const seenEsts = await count(page, '.home-receipt .fare-prov-est');
    if (seenAges < 1 && seenEsts < 1) fail(`[home ${tag}] no chip at all on receipt flight lines`);
    else ok(`[home ${tag}] receipt chips render (age ${seenAges}, est ${seenEsts}; est replaces age on an estimated fare)`);
  }
  await page.locator('#home-total').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/prov-home-${tag}.png` });
}

/** Map tab: results list rows, then a destination sheet's flight group. */
async function checkBrowse(page, mock, tag) {
  await page.goto(`${BASE}/?o=CRL&t=plane${mock ? `&provmock=${mock}` : ''}`);
  // The Home tab is the landing surface; move to the map.
  for (const btn of await page.getByRole('button').all()) {
    const txt = (await btn.innerText().catch(() => '')).trim();
    if (/^map$/i.test(txt) && (await btn.isVisible().catch(() => false))) { await btn.click(); break; }
  }
  await page.locator('.result-row').first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(800);

  const fromWords = await count(page, '.result-price .prov-from');
  const firstPrice = (await page.locator('.result-price').first().innerText()).trim();

  if (!mock) {
    if (fromWords < 1) fail(`[browse ${tag}] result rows carry no "from" word`);
    else ok(`[browse ${tag}] "from" phrasing on result rows (${fromWords})`);
    if (firstPrice.includes('~')) fail(`[browse ${tag}] tilde with no fields: "${firstPrice}"`);
  } else if (mock.includes('est')) {
    if (!firstPrice.includes('~')) fail(`[browse ${tag}] estimated row price has no tilde: "${firstPrice}"`);
    else ok(`[browse ${tag}] estimated row price reads "${firstPrice}"`);
  }

  // The destination sheet: expand Getting there, check fare line + note.
  await page.locator('.result-row').first().click();
  await page.locator('.cost-group').first().waitFor({ timeout: 15000 });
  await page.locator('.cost-group-head').first().click();
  await page.waitForTimeout(400);
  const notes = await count(page, '.cost-group .booking-note');
  const links = await count(page, '.cost-group .cost-action');
  if (links > 0 && notes < 1) fail(`[browse ${tag}] booking links without the price-change note`);
  else ok(`[browse ${tag}] booking note near sheet links (links ${links}, notes ${notes})`);
  const sheetTags = await count(page, '.cost-group .fare-prov');
  if (!mock && sheetTags > 0 && !crlHasProv) fail(`[browse ${tag}] sheet provenance chips with no fields`);
  else if (!mock && sheetTags > 0) ok(`[browse ${tag}] sheet chip from REAL slice provenance (${sheetTags})`);
  if (mock && sheetTags < 1) fail(`[browse ${tag}] sheet fare line carries no provenance chip`);
  else if (mock) ok(`[browse ${tag}] sheet fare line chip renders (${sheetTags})`);

  // The selected map pin (DOM pill) shares the tilde derivation.
  if (mock && mock.includes('est')) {
    const pill = (await page.locator('.price-pill.selected').first().innerText().catch(() => '')).trim();
    if (pill && !pill.includes('~')) fail(`[browse ${tag}] selected pin pill has no tilde: "${pill}"`);
    else if (pill) ok(`[browse ${tag}] selected pin pill reads "${pill}"`);
  }
  await page.screenshot({ path: `${SHOTS}/prov-browse-${tag}.png` });
}

try {
  await probeSlice();
  const page = await newPage();
  // Baseline: no fields, nothing field-driven may render.
  await checkHome(page, '', 'plain');
  await checkBrowse(page, '', 'plain');
  await checkTrip(page, '', 'plain');
  // A real quote with a known age and expiry.
  await checkHome(page, 'age:3,exp:14', 'seen');
  await checkBrowse(page, 'age:3,exp:14', 'seen');
  await checkTrip(page, 'age:3,exp:14', 'seen');
  // A model estimate.
  await checkHome(page, 'age:3,exp:14,est:1', 'est');
  await checkBrowse(page, 'age:3,exp:14,est:1', 'est');
  await checkTrip(page, 'age:3,exp:14,est:1', 'est');
  await browser.close();
  console.log(failures ? `verify_fare_provenance: ${failures} FAILURES` : 'verify_fare_provenance OK');
} catch (err) {
  fail(err.message);
  await browser.close().catch(() => {});
} finally {
  if (srv) srv.kill();
}
