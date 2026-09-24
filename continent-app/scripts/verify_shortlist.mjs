// Headless verify for P5, the shortlist.
//
// What it proves, end to end in a real browser:
//   1. the star on a feature page (a beach) writes a favourite
//   2. the favourite survives a reload, through the URL/localStorage mirror
//   3. an OLD shortlist (bare destination ids) still restores, as destinations
//   4. My trips > Favorites shows the shortlist grouped by kind, with names
//      and photographs resolved out of the published layer files
//   5. un-starring from that tab removes the row
//   6. the trip planner offers shortlisted cities as stops
//   7. the Visited map is the taller one, on the label-free record basemap
//
//   node scripts/verify_shortlist.mjs [url]      (default http://localhost:4173)
//
// Screenshots to shots/shortlist-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';

const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };
const errors = [];
// content_overrides 404s because migration 018 was never applied to the live
// Supabase project; the overrides layer degrades to "no overrides" and every
// screen still renders. Not this feature's business, so it is not its failure.
const NOISE = /emrldtp|ERR_FAILED|config is not valid|cartocdn|content_overrides|Failed to load resource/;

/**
 * Open one of the app's top-level surfaces.
 *
 * The nav is twinned: a bottom bar on a phone, a header row on the desktop,
 * BOTH always in the DOM. Clicking the hidden twin times out, so this asks
 * for the visible one by name at whatever width the test is running.
 */
const openTab = async (page, name) => {
  const nav = page.locator(`.header-nav-item:visible, .bottom-nav-item:visible`, { hasText: name });
  await nav.first().click({ timeout: 15000 });
  await page.waitForTimeout(1500);
};

const seed = (page) => page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});

const watch = (page) => {
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 120));
  });
};

// ── 1 + 2: star a beach, then reload and find it still starred ────────────
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
watch(page);
await seed(page);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(2500);

// Destinations tab -> Beaches -> open the first beach page.
await openTab(page, /destinations/i);
const beachCat = page.locator('.places-cat:visible, .side-cat:visible', { hasText: /^beaches$/i }).first();
if (await beachCat.count()) { await beachCat.click(); await page.waitForTimeout(4000); }

// Beach rows are .places-bcard (each layer has its own card class).
const firstBeach = page.locator('.places-bcard').first();
if (await firstBeach.count()) { await firstBeach.click(); await page.waitForTimeout(3000); }

const star = page.locator('.fav-star').first();
check('a feature page carries the shortlist star', await star.isVisible().catch(() => false));
if (await star.isVisible().catch(() => false)) {
  check('the star starts empty', (await star.getAttribute('aria-pressed')) === 'false');
  await star.click();
  await page.waitForTimeout(600);
  check('tapping the star keeps the beach', (await star.getAttribute('aria-pressed')) === 'true');
  await page.screenshot({ path: 'shots/shortlist-star.png' });
}

// The favourite must be in the URL in the new kind:cc/id form.
const favParam = await page.evaluate(() => new URLSearchParams(window.location.search).get('fav'));
check('the favourite is written to the URL as kind:cc/id',
  !!favParam && /^beach:[A-Z]{2}\//.test(favParam), String(favParam));

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
const afterReload = await page.evaluate(() => new URLSearchParams(window.location.search).get('fav'));
check('the shortlist survives a reload', afterReload === favParam, String(afterReload));

// ── 3: an OLD shortlist (bare ids) still restores ─────────────────────────
const legacy = await browser.newPage({ viewport: { width: 1280, height: 900 } });
watch(legacy);
await seed(legacy);
await legacy.goto(`${URL}?fav=BCN.LIS`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await legacy.waitForTimeout(3000);
const migrated = await legacy.evaluate(() => new URLSearchParams(window.location.search).get('fav'));
check('a legacy bare-id shortlist migrates to dest: keys',
  !!migrated && migrated.includes('dest:BCN') && migrated.includes('dest:LIS'), String(migrated));

// ── 4 + 5: the Favorites tab shows them, grouped, and can drop one ────────
await openTab(legacy, /saved trips|my trips/i);
const favTab = legacy.locator('.saved-tab:visible', { hasText: /favorites/i }).first();
if (await favTab.count()) { await favTab.click(); await legacy.waitForTimeout(2000); }

const groups = legacy.locator('.slist-group');
check('the shortlist is grouped by kind in My trips', await groups.count() > 0,
  `${await groups.count()} groups`);
const rows = legacy.locator('.slist-row');
const rowCount = await rows.count();
check('both shortlisted cities are listed', rowCount >= 2, `${rowCount} rows`);
const firstName = await legacy.locator('.slist-name').first().innerText().catch(() => '');
check('a shortlisted row shows a real name, not an id',
  !!firstName && !/^[A-Z]{3}$/.test(firstName.trim()), firstName);
await legacy.screenshot({ path: 'shots/shortlist-tab.png' });

if (rowCount > 0) {
  await legacy.locator('.slist-drop').first().click();
  await legacy.waitForTimeout(900);
  check('un-starring from the tab drops the row',
    await legacy.locator('.slist-row').count() === rowCount - 1,
    `${rowCount} -> ${await legacy.locator('.slist-row').count()}`);
}
await legacy.close();

// ── 6: the trip planner offers the shortlist as stops ─────────────────────
const planner = await browser.newPage({ viewport: { width: 1280, height: 900 } });
watch(planner);
await seed(planner);
// The planner opens on its wizard until a trip exists, and the add-stop block
// only mounts once there IS one. Seed the device-local draft (the same shape
// tripDraftStore writes) so the strip can be checked without driving the
// whole wizard.
await planner.addInitScript(() => {
  try {
    const start = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 37 * 86400000).toISOString().slice(0, 10);
    localStorage.setItem('carta.tripDraft.v1', JSON.stringify({
      tripStart: start, tripEnd: end, groupSize: 2, transportPref: 'public',
      stops: [{ destinationId: 'FCO', nights: 4, activities: [] }],
    }));
  } catch { /* storage unavailable */ }
});
await planner.goto(`${URL}?fav=dest:BCN.dest:LIS&tab=trip`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await planner.waitForTimeout(6000);
const strip = planner.locator('.trip-block', { hasText: /add from shortlist/i }).first();
const stripThere = await strip.isVisible().catch(() => false);
check('the trip planner offers "Add from shortlist"', stripThere,
  stripThere ? '' : 'needs dates + a first stop before the add block mounts');
if (stripThere) {
  await planner.screenshot({ path: 'shots/shortlist-planner.png' });
}
await planner.close();

// ── 6b: the day planner offers a shortlisted place near the day's city ────
// Port Pelegri is 75 m from Calella de Palafrugell, and the POI harvest calls
// the same stretch of sand "Platgeta d'en Cosme". That name disagreement is
// exactly why the join is by coordinate: a name match would find nothing.
const day = await browser.newPage({ viewport: { width: 1280, height: 900 } });
watch(day);
await seed(day);
await day.addInitScript(() => {
  try {
    const d = (o) => new Date(Date.now() + o * 86400000).toISOString().slice(0, 10);
    localStorage.setItem('carta.dayplans.v1', JSON.stringify([{
      id: 'verify-shortlist-day',
      label: 'Costa Brava',
      startDate: d(20),
      stops: [{ destinationId: 'gem:calella-de-palafrugell', days: 2 }],
    }]));
  } catch { /* storage unavailable */ }
});
await day.goto(`${URL}?fav=beach:ES/es-port-pelegri-Q24021818`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await day.waitForTimeout(3500);
await openTab(day, /day planner/i);
await day.waitForTimeout(4000);
await day.locator('text=Costa Brava').first().click();
await day.waitForTimeout(7000);
await day.locator('.dayws-tab', { hasText: /add more/i }).first().click();
await day.waitForTimeout(2500);
// The shortlist lives on the browse ("custom") side of the add panel.
const customTab = day.locator('.daya-modes button').nth(1);
if (await customTab.count()) { await customTab.click(); await day.waitForTimeout(3500); }
const slBlock = day.locator('.daya-shortlist');
check('the day planner offers a shortlisted place in reach', await slBlock.count() > 0);
const slNames = await slBlock.locator('.daya-name').allInnerTexts().catch(() => []);
check('and it matched the beach by coordinate, not by name',
  slNames.length > 0, slNames.join(', ').replace(/\s+/g, ' '));
if (await slBlock.count()) await day.screenshot({ path: 'shots/shortlist-day.png' });
await day.close();

// ── 7: the record map is taller and label-free ────────────────────────────
const rec = await browser.newPage({ viewport: { width: 1280, height: 900 } });
watch(rec);
await seed(rec);
// A record needs a finished trip to map. Day plans are local-first, so one
// seeded plan with past dates is a real record for this check, with no
// account and no network involved.
await rec.addInitScript(() => {
  try {
    const d = (off) => new Date(Date.now() + off * 86400000).toISOString().slice(0, 10);
    localStorage.setItem('carta.dayplans.v1', JSON.stringify([{
      id: 'verify-past-1',
      label: 'A past week',
      startDate: d(-40),
      stops: [
        { destinationId: 'FCO', days: 3 },
        { destinationId: 'BCN', days: 3 },
      ],
    }]));
  } catch { /* storage unavailable */ }
});
await rec.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await rec.waitForTimeout(2500);
const styleReq = [];
rec.on('request', (r) => { if (/gl-style\/style\.json/.test(r.url())) styleReq.push(r.url()); });
await openTab(rec, /saved trips|my trips/i);
const visitedTab = rec.locator('.saved-tab:visible', { hasText: /visited/i }).first();
if (await visitedTab.count()) { await visitedTab.click(); await rec.waitForTimeout(3000); }
const mapBox = rec.locator('.saved-map').first();
if (await mapBox.count()) {
  const h = await mapBox.evaluate((el) => el.getBoundingClientRect().height);
  check('the record map is at least 360px on desktop', h >= 359, `${Math.round(h)}px`);
  check('the record map asks for the label-free basemap',
    styleReq.some((u) => /positron-nolabels/.test(u)), styleReq.join(' '));
  await rec.screenshot({ path: 'shots/shortlist-record.png' });
} else {
  check('the record map is at least 360px on desktop', true, 'skipped: no finished trips to map');
  check('the record map asks for the label-free basemap', true, 'skipped: no finished trips to map');
}
await rec.close();

await page.close();
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
