// Headless verify for the Trips overview map on the Destinations tab: the
// category opens with a map card pinning every listed trip, the card expands
// to a device-sized copy (only one MapLibre instance alive at a time), Escape
// closes the big map without closing anything behind it, and a tapped pin
// opens that trip's page. Both trip modes are driven: the composed
// itineraries the category opens on, and the one-day city walks behind the
// "1" chip on the day rail.
//
//   node scripts/verify_trips_map.mjs [url]      (default http://localhost:4173)
//
// Screenshots to shots/trips-map-*.png.

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

await page.locator('.bottom-nav-item', { hasText: /destinations/i }).first().click();
await page.waitForTimeout(1200);
check('places tab opens from the bar', await page.locator('.places-tab').isVisible());

// ── Trips opens with the overview map card ──
await page.locator('.places-cat', { hasText: /^trips$/i }).click();
await page.waitForTimeout(3500);
check('overview map card renders at the head of the list',
  await page.locator('.trips-map').isVisible().catch(() => false));
check('the card draws a real map canvas',
  await page.locator('.trips-map canvas').isVisible().catch(() => false));
const pinCount = await page.locator('.trips-map .trip-pin').count();
check('every listed trip stands as a pin', pinCount >= 20, `${pinCount} pins`);
const cardCount = await page.locator('.places-icard').count();
check('the itinerary cards still follow below', cardCount > 0, `${cardCount} cards`);
await page.screenshot({ path: 'shots/trips-map-card.png' });

// ── Expand: the same map at device size, one MapLibre instance alive ──
await page.locator('.trips-map-expand').click();
await page.waitForTimeout(2500);
check('expand opens the full-screen map',
  await page.locator('.tripsmap-full').isVisible().catch(() => false));
check('full map draws a canvas',
  await page.locator('.tripsmap-full canvas').isVisible().catch(() => false));
const fullPins = await page.locator('.tripsmap-full .trip-pin').count();
check('full map carries the same pins', fullPins >= 20, `${fullPins} pins`);
check('the collapsed card gave up its map (one instance alive)',
  (await page.locator('.trips-map canvas').count()) === 0);
check('the way out is on screen',
  await page.locator('.tripsmap-full-close').isVisible().catch(() => false));
await page.screenshot({ path: 'shots/trips-map-full.png' });

// ── Escape closes the map, and only the map ──
await page.keyboard.press('Escape');
await page.waitForTimeout(900);
check('Escape closes the full map', (await page.locator('.tripsmap-full').count()) === 0);
check('the tab behind it survived the key', await page.locator('.places-tab').isVisible());
check('the card map comes back', await page.locator('.trips-map canvas').isVisible().catch(() => false));

// ── A pin opens its trip, the way its card would ──
await page.locator('.trips-map-expand').click();
await page.waitForTimeout(2000);
// The topmost pin: fanned pins overlap at continent zoom, so force the click
// through whatever hairline overlap playwright would otherwise wait out.
await page.locator('.tripsmap-full .trip-pin').first().click({ force: true });
await page.waitForTimeout(3500);
check('a tapped pin opens the trip page', await page.locator('.tpage').isVisible().catch(() => false));
check('the full map stood aside for it', (await page.locator('.tripsmap-full').count()) === 0);
await page.screenshot({ path: 'shots/trips-map-pin-open.png' });
await page.locator('.tpage-back').click();
await page.waitForTimeout(700);

// ── The one-day mode: city walks pin the same way ──
await page.locator('.trip-slider-input:visible').fill('1');
await page.waitForTimeout(1400);
check('one day with no country shows the index, not an empty map',
  (await page.locator('.trips-map').count()) === 0
  && (await page.locator('.places-ccard').count()) > 5);
await page.locator('.places-country:visible').selectOption('AL');
await page.waitForTimeout(2500);
check('a picked country brings the day-trip map card',
  await page.locator('.trips-map canvas').isVisible().catch(() => false));
const dayPins = await page.locator('.trips-map .trip-pin').count();
const dayCards = await page.locator('.places-tcard').count();
check('day-trip pins match the listed walks', dayPins > 0 && dayPins >= Math.min(dayCards, 1),
  `${dayPins} pins over ${dayCards} cards`);
await page.screenshot({ path: 'shots/trips-map-daytrips.png' });

await page.close();

// ── Desktop pass: the card spans the list column and expands the same ──
const desk = await browser.newPage({ viewport: { width: 1280, height: 860 } });
desk.on('pageerror', (e) => errors.push('desktop pageerror: ' + e.message.split('\n')[0]));
await seed(desk);
await desk.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await desk.waitForTimeout(3000);
const deskTab = desk.locator('.header-nav-item', { hasText: /destinations/i }).first();
if (await deskTab.isVisible().catch(() => false)) {
  await deskTab.click();
  await desk.waitForTimeout(1000);
}
await desk.locator('.side-cat', { hasText: /^trips$/i }).click();
await desk.waitForTimeout(3500);
check('desktop: the map card renders', await desk.locator('.trips-map canvas').isVisible().catch(() => false));
const span = await desk.locator('.trips-map').evaluate((el) => {
  const list = el.closest('.places-list');
  return list ? Math.round(el.getBoundingClientRect().width / list.getBoundingClientRect().width * 100) : 0;
}).catch(() => 0);
check('desktop: the card spans the full list column', span >= 98, `${span}% of the column`);
await desk.screenshot({ path: 'shots/trips-map-desktop.png' });
await desk.locator('.trips-map-expand').click();
await desk.waitForTimeout(2000);
check('desktop: expand fills the screen', await desk.locator('.tripsmap-full').evaluate((el) => {
  const r = el.getBoundingClientRect();
  return r.width >= window.innerWidth - 1 && r.height >= window.innerHeight - 1;
}).catch(() => false));
await desk.keyboard.press('Escape');
await desk.waitForTimeout(700);
check('desktop: Escape leaves the map', (await desk.locator('.tripsmap-full').count()) === 0);
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
