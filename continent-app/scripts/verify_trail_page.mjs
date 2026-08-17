// Headless verify for the trail page (.tpage): the full page a trail card now
// opens, the composed explanation, the GPX/KML/link exports, live following,
// and the price chrome that Trails no longer shows.
//
//   node scripts/verify_trail_page.mjs [url]      (default http://localhost:4173)
//
// Phone viewport first (that is where a walker uses this), then a desktop pass.
// Screenshots to shots/trail-*.png.

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const APP_URL = process.argv[2] || 'http://localhost:4173/';
const ORIGIN = new URL(APP_URL).origin;

// The first hike of AL in wire order is the first card the Trails list shows.
const wire = JSON.parse(readFileSync('public/trails/AL.json', 'utf8'));
const hike = wire.trips.find((t) => t.category !== 'citytrip');
const line = hike.geometry.type === 'LineString' ? hike.geometry.coordinates : hike.geometry.coordinates[0];
const onRoute = line[Math.floor(line.length * 0.4)];   // a point the walker could be standing on
const offRoute = [line[0][0] + 0.02, line[0][1] + 0.02]; // ~2.5 km away

const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };
const errors = [];
const NOISE = /emrldtp|ERR_FAILED|config is not valid|Geolocation/;

const browser = await chromium.launch();

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  permissions: ['geolocation', 'clipboard-read', 'clipboard-write'],
  geolocation: { latitude: onRoute[1], longitude: onRoute[0], accuracy: 12 },
  acceptDownloads: true,
});
await context.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('carta.mapGuideDone', '1');
  } catch { /* storage unavailable */ }
  // Force the download path and the clipboard path: a headless Chromium that
  // claims the Web Share API cannot show a share sheet, so the test would
  // otherwise verify nothing.
  try {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  } catch { /* older engines */ }
});

const page = await context.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 140)); });

await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3000);
await page.locator('.bottom-nav-item', { hasText: /destinations/i }).first().click();
await page.waitForTimeout(1200);

// ── Trails: the price chrome is gone ──────────────────────────────────────
await page.locator('.places-cat', { hasText: /trails/i }).click();
await page.waitForTimeout(800);
await page.locator('.places-country').selectOption('AL');
await page.waitForTimeout(1800);

const cards = await page.locator('.places-tcard').count();
check('trail cards render for Albania', cards >= 3, `${cards} cards`);
check('no rating/price/A-Z chips on trails', await page.locator('.places-sort').count() === 0);
check('no priced-from origin picker on trails', await page.locator('.places-controls .origin-btn').count() === 0);
check('no lifestyle pill on trails', await page.locator('.places-lifestyle').count() === 0);
check('cards carry no clipped summary', await page.locator('.places-tcard-summary').count() === 0);
const cardText = await page.locator('.places-tcard').first().innerText();
check('card is facts only, no prose', !/waymarked|route in AL/i.test(cardText), cardText.replace(/\n/g, ' ').slice(0, 70));
await page.screenshot({ path: 'shots/trail-list.png' });

// Other categories keep their price chrome.
await page.locator('.places-cat', { hasText: /^trips$/i }).click();
await page.waitForTimeout(1200);
check('trips still show the sort chips', await page.locator('.places-sort').count() === 3);
check('trips still show the origin picker', await page.locator('.places-controls .origin-btn').count() === 1);
await page.locator('.places-cat', { hasText: /trails/i }).click();
await page.waitForTimeout(1200);

// ── The page opens ────────────────────────────────────────────────────────
await page.locator('.places-tcard').first().click();
await page.waitForTimeout(4500);
check('trail page opens full screen', await page.locator('.tpage').isVisible());
const box = await page.locator('.tpage').boundingBox();
check('page covers the viewport', box && box.height > 800, box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'none');
check('page draws the route on a real map', await page.locator('.tpage-map canvas').isVisible().catch(() => false));
check('page names the trail as a heading', (await page.locator('.tpage-title').innerText()).length > 3,
  await page.locator('.tpage-title').innerText());

const facts = await page.locator('.tpage-facts').innerText();
check('facts strip carries the measured numbers', /km/.test(facts) && /\bh\b/.test(facts), facts.replace(/\n/g, ' '));

check('the app names are on the page, not just file formats',
  /Komoot/.test(await page.locator('.tpage-note').first().innerText().catch(() => '')));
check('following says what it cannot do',
  /locks/i.test(await page.locator('.tpage-note').nth(1).innerText().catch(() => '')));

const storyLines = await page.locator('.tpage-story li').count();
const story = await page.locator('.tpage-story').innerText();
check('what to expect explains the route', storyLines >= 3, `${storyLines} lines`);
check('explanation leaks no ISO2 country code', !/\bin AL\b|\broute in AL\b/.test(story), story.replace(/\n/g, ' | ').slice(0, 160));
check('explanation is not the wire boilerplate', !/DIN 33466|derived from/i.test(story));
check('elevation profile renders', await page.locator('.tpage-elev-svg').isVisible().catch(() => false));
await page.screenshot({ path: 'shots/trail-page.png', fullPage: false });
await page.locator('.tpage-scroll').evaluate((el) => el.scrollTo(0, 700));
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/trail-page-body.png' });

// ── Exports ───────────────────────────────────────────────────────────────
// Leaving with the route is THE action on this page, so it owns the one
// primary button; the share sheet is stubbed out above, so it reads "Download
// GPX" here rather than "Send to a hiking app".
const primaryLabel = await page.locator('.tpage-primary').innerText();
check('the handoff is the primary action', /gpx|hiking app/i.test(primaryLabel), primaryLabel);
check('following is a secondary, not the primary', await page.locator('.tpage-primary.tpage-follow').count() === 0
  && await page.locator('.tpage-act.tpage-follow').count() === 1);
const [gpxDl] = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }),
  page.locator('.tpage-primary').click(),
]);
const gpxPath = await gpxDl.path();
const gpx = readFileSync(gpxPath, 'utf8');
check('GPX downloads with a route filename', /\.gpx$/.test(gpxDl.suggestedFilename()), gpxDl.suggestedFilename());
check('GPX is a valid track', /<gpx version="1\.1"/.test(gpx) && /<trkpt lat="/.test(gpx),
  `${(gpx.match(/<trkpt/g) || []).length} points`);
check('GPX carries elevation from the wire', /<ele>/.test(gpx));
check('GPX keeps the OpenStreetMap credit', /OpenStreetMap contributors/.test(gpx));
check('GPX marks the start', /<wpt /.test(gpx));

const [kmlDl] = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }),
  page.locator('.tpage-act', { hasText: /google maps/i }).first().click(),
]);
const kml = readFileSync(await kmlDl.path(), 'utf8');
check('KML downloads for Google My Maps', /\.kml$/.test(kmlDl.suggestedFilename()), kmlDl.suggestedFilename());
check('KML carries the drawn line', /<LineString>/.test(kml) && /<coordinates>/.test(kml));

// ── Share link ────────────────────────────────────────────────────────────
await page.locator('.tpage-act', { hasText: /share/i }).click();
await page.waitForTimeout(700);
const copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
check('share copies a reopenable link', /#trail=\d+&tc=AL/.test(copied), copied.slice(-40));
check('a toast confirms the copy', await page.locator('.tpage-toast').isVisible().catch(() => false),
  await page.locator('.tpage-toast').innerText().catch(() => ''));

// ── Directions to the start ───────────────────────────────────────────────
const dirHref = await page.locator('.tpage-act-wide').getAttribute('href').catch(() => '');
check('directions to the start use coordinates', /google\.com\/maps\/dir\/.*destination=-?\d+\.\d+,-?\d+\.\d+/.test(dirHref || ''),
  (dirHref || '').slice(0, 80));

// ── Following ─────────────────────────────────────────────────────────────
await page.locator('.tpage-follow').click();
await page.waitForTimeout(3500);
check('following turns the page into the map', await page.locator('.tpage.following').count() === 1);
const hud = await page.locator('.tpage-hud-card').innerText().catch(() => '');
check('HUD reports progress along the route', /\d+(\.\d+)?\s*$|of [\d.]+ km walked/m.test(hud) && /left/.test(hud),
  hud.replace(/\n/g, ' | '));
const doneKm = parseFloat(await page.locator('.tpage-hud-done').innerText().catch(() => 'NaN'));
check('progress is measured, not zero', doneKm > 0.2, `${doneKm} km walked`);
check('no off-route warning while on the line', await page.locator('.tpage-hud-off').count() === 0);
await page.screenshot({ path: 'shots/trail-follow.png' });

await context.setGeolocation({ latitude: offRoute[1], longitude: offRoute[0], accuracy: 12 });
await page.waitForTimeout(3000);
const off = await page.locator('.tpage-hud-off').innerText().catch(() => '');
check('wandering off the line warns with a distance', /\d+\s*m off the route/.test(off), off);
await page.screenshot({ path: 'shots/trail-follow-off.png' });

// Scoped to the page: the hidden map tab keeps a maplibre control row of its own.
const creditBottom = await page.locator('.tpage .maplibregl-ctrl-bottom-right').evaluate(
  (el) => window.innerHeight - el.getBoundingClientRect().bottom,
).catch(() => -1);
check('basemap credit clears the HUD card', creditBottom > 100, `${Math.round(creditBottom)} px above the bottom`);

await page.locator('.tpage-hud-close').click();
await page.waitForTimeout(800);
check('stopping following returns to the page', await page.locator('.tpage.following').count() === 0
  && await page.locator('.tpage-follow').isVisible());

await page.locator('.tpage-back').click();
await page.waitForTimeout(600);
check('back closes the page', await page.locator('.tpage').count() === 0);

// ── A city day is the same page, with its stops ───────────────────────────
await page.locator('.places-cat', { hasText: /^trips$/i }).click();
await page.waitForTimeout(1500);
await page.locator('.places-tcard').first().click();
await page.waitForTimeout(4500);
const cityStops = await page.locator('.tpage-stops li').count();
check('city day lists its stops in order', cityStops >= 3, `${cityStops} stops`);
const cityStory = await page.locator('.tpage-story').innerText().catch(() => '');
check('city day explanation counts stops and walking', /stops/.test(cityStory) && /km on foot/.test(cityStory),
  cityStory.replace(/\n/g, ' | ').slice(0, 120));
check('city day offers the priced destination', await page.locator('.tpage-cta').isVisible().catch(() => false),
  (await page.locator('.tpage-cta').innerText().catch(() => '')).replace(/\n/g, ' '));
await page.screenshot({ path: 'shots/trail-citytrip.png' });
await page.locator('.tpage-back').click();
await page.waitForTimeout(500);

// ── A shared link opens the trail ─────────────────────────────────────────
const deep = await context.newPage();
deep.on('pageerror', (e) => errors.push('deeplink pageerror: ' + e.message.split('\n')[0]));
await deep.goto(`${ORIGIN}/#trail=${hike.id}&tc=AL`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await deep.waitForTimeout(6000);
check('shared link opens the trail page', await deep.locator('.tpage').isVisible().catch(() => false));
check('shared link opens the right trail', (await deep.locator('.tpage-title').innerText().catch(() => '')).includes(hike.name.slice(0, 12)),
  await deep.locator('.tpage-title').innerText().catch(() => ''));
check('shared link is stripped from the address bar', !deep.url().includes('trail='), deep.url());
await deep.screenshot({ path: 'shots/trail-deeplink.png' });
await deep.close();
await page.close();

// ── Desktop pass ──────────────────────────────────────────────────────────
const deskCtx = await browser.newContext({
  viewport: { width: 1280, height: 860 },
  permissions: ['geolocation'],
  geolocation: { latitude: onRoute[1], longitude: onRoute[0], accuracy: 12 },
});
await deskCtx.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('carta.mapGuideDone', '1');
  } catch { /* storage unavailable */ }
});
const desk = await deskCtx.newPage();
desk.on('pageerror', (e) => errors.push('desktop pageerror: ' + e.message.split('\n')[0]));
await desk.goto(`${ORIGIN}/#trail=${hike.id}&tc=AL`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await desk.waitForTimeout(6500);
check('desktop: shared link opens the page', await desk.locator('.tpage').isVisible().catch(() => false));
const colW = await desk.locator('.tpage-col').evaluate((el) => el.getBoundingClientRect().width).catch(() => 0);
check('desktop: the column stays readable', colW > 500 && colW <= 800, `${Math.round(colW)} px`);
await desk.screenshot({ path: 'shots/trail-desktop.png' });

// Following on a wide screen: the HUD is a card in the corner, not a banner.
await desk.locator('.tpage-follow').click();
await desk.waitForTimeout(2500);
const hudW = await desk.locator('.tpage-hud-card').evaluate((el) => el.getBoundingClientRect().width).catch(() => 0);
check('desktop: the HUD stays a corner card', hudW > 200 && hudW < 420, `${Math.round(hudW)} px`);
await desk.screenshot({ path: 'shots/trail-desktop-follow.png' });
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
