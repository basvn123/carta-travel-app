// Headless verify for the trail page (.tpage-v2) since G12 (Explore top,
// 2026-11-18): the page a trail card opens, its measured facts, the GPX, the
// share link, live following, Back, a shared link, and the desktop columns.
//
//   node scripts/verify_trail_page.mjs [url]   (default http://localhost:$CARTA_PORT or 4173)
//   CARTA_DATA_MIRROR=".../continent-app/public" fills a sparse worktree's data.
//
// Phone first (that is where a walker uses this), then a desktop pass. The
// trail is the first card of Albania's list; its route comes from its own
// GPX, so the run needs no wire file on disk. The KML door, the city-day
// stops and the Trips tab's sort chips left before or with G12 (T1089, T431),
// so their checks went. Screenshots to shots/trail-*.png.

import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { mirrorData } from './lib/dataMirror.mjs';

const BASE = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;
const ORIGIN = new URL(BASE).origin;
mkdirSync('shots', { recursive: true });

const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };
const errors = [];
// A local build fetches flights from R2, which answers CORS for its own hosts only.
const NOISE = /ERR_FAILED|config is not valid|content_overrides|Failed to load resource|Access to fetch at 'https:\/\/data\.|Geolocation/;

const browser = await chromium.launch();
async function newContext(viewport, geo) {
  const ctx = await browser.newContext({
    viewport, serviceWorkers: 'block', acceptDownloads: true,
    permissions: ['geolocation', 'clipboard-read', 'clipboard-write'], geolocation: geo,
  });
  await mirrorData(ctx);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
      localStorage.setItem('continent.mapGuideDismissed.v1', '1');
      localStorage.setItem('carta.mapGuideDone', '1');
    } catch { /* storage unavailable */ }
    // Force the download and clipboard paths: a headless Chromium that claims
    // the Web Share API cannot show a share sheet.
    try {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    } catch { /* older engines */ }
  });
  return ctx;
}
const watch = (page, tag) => {
  page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(`${tag} console: ${m.text().slice(0, 140)}`); });
};
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

// ── Phone: from Albania's list to the page ───────────────────────────────
const context = await newContext({ width: 390, height: 844 }, { latitude: 41.3, longitude: 19.8, accuracy: 12 });
const page = await context.newPage();
watch(page, 'phone');
await page.goto(`${BASE}?tab=places&dc=trails&dn=AL`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('.band-input', { timeout: 120000 });
await page.waitForTimeout(3500);

const cards = await page.locator('.places-tcard').count();
check('trail cards render for Albania', cards >= 3, `${cards} cards`);
check('trail cards carry no price', await page.locator('.places-tcard .places-card-price').count() === 0);
const cardText = await page.locator('.places-tcard').first().innerText();
check('a card is facts, not the wire summary', !/route in AL/i.test(cardText), cardText.replace(/\n/g, ' ').slice(0, 70));
await page.screenshot({ path: 'shots/trail-list.png' });

const cardName = (await page.locator('.places-tcard .places-card-name').first().innerText()).trim();
await page.locator('.places-tcard .card-open').first().click();
await page.locator('.tpage-v2').waitFor({ timeout: 30000 }).catch(() => {});
await page.waitForTimeout(3500);
check('trail page opens full screen', await page.locator('.tpage-v2').isVisible());
const box = await page.locator('.tpage-v2').boundingBox();
check('page covers the viewport', box && box.height > 800, box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'none');
const title = (await page.locator('.pt-title').first().innerText().catch(() => '')).trim();
check('page names the trail as its heading', title === cardName, `${cardName} -> ${title}`);
check('page carries the rating', /^\d/.test((await page.locator('.pt-score').first().innerText().catch(() => '')).trim()));
const facts = await page.locator('.pt-facts').first().innerText().catch(() => '');
check('the facts carry the measured numbers', /km/.test(facts) && /\bh\b/.test(facts), facts.replace(/\n/g, ' ').slice(0, 120));
check('page draws the route on a real map', await page.locator('.tpage-map canvas').count() > 0);
check('elevation profile renders', await page.locator('.tpage-elev-svg').count() > 0);
const text = await page.locator('.tpage-scroll').innerText().catch(() => '');
check('the GPX apps paragraph stays gone', !/Komoot, AllTrails, OsmAnd|mymaps\.google\.com/i.test(text));
check('the following-works paragraph stays gone', !/It stops when the phone locks/i.test(text));
check('explanation leaks no ISO2 country code', !/\bin AL\b|\broute in AL\b/.test(text));
check('phone: the page fits the screen', await sideways(page) <= 1, `${await sideways(page)} px`);
await page.screenshot({ path: 'shots/trail-page.png' });

// ── GPX ───────────────────────────────────────────────────────────────────
const gpxP = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
await page.locator('.ox-gpx').first().click();
const gpxDl = await gpxP;
const gpx = gpxDl ? readFileSync(await gpxDl.path(), 'utf8') : '';
check('GPX downloads with a route filename, no paywall', !!gpxDl && /\.gpx$/.test(gpxDl.suggestedFilename())
  && await page.locator('.pass-overlay:visible').count() === 0, gpxDl ? gpxDl.suggestedFilename() : 'no download');
check('GPX is a valid track', /<gpx version="1\.1"/.test(gpx) && /<trkpt lat="/.test(gpx), `${(gpx.match(/<trkpt/g) || []).length} points`);
check('GPX carries elevation', /<ele>/.test(gpx));
check('GPX keeps the OpenStreetMap credit', /OpenStreetMap contributors/.test(gpx));
check('GPX marks the start', /<wpt /.test(gpx));
const line = [...gpx.matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)"/g)].map((m) => [parseFloat(m[1]), parseFloat(m[2])]);

// ── Share link ────────────────────────────────────────────────────────────
await page.locator('.tpage-bar-act[aria-label="Share"]').first().click();
await page.waitForTimeout(700);
const copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
check('share copies a reopenable link', /#trail=\d+&tc=AL/.test(copied), copied.slice(-40));
check('a toast confirms the copy', /copied/i.test(await page.locator('.tpage-toast').innerText().catch(() => '')));

// ── Following ─────────────────────────────────────────────────────────────
if (line.length > 10) {
  const [lat, lon] = line[Math.floor(line.length * 0.4)];
  await context.setGeolocation({ latitude: lat, longitude: lon, accuracy: 12 });
}
await page.locator('.tpage-follow').first().click();
await page.waitForTimeout(3500);
check('following turns the page into the map', await page.locator('.tpage.following').count() === 1);
const hud = await page.locator('.tpage-hud-card').innerText().catch(() => '');
check('HUD reports progress along the route', /km walked/.test(hud) && /left/.test(hud), hud.replace(/\n/g, ' | ').slice(0, 120));
const doneKm = parseFloat(await page.locator('.tpage-hud-done').innerText().catch(() => 'NaN'));
check('progress is measured, not zero', doneKm > 0.2, `${doneKm} km walked`);
check('no off-route warning while on the line', await page.locator('.tpage-hud-off').count() === 0);
await page.screenshot({ path: 'shots/trail-follow.png' });
if (line.length) {
  await context.setGeolocation({ latitude: line[0][0] + 0.02, longitude: line[0][1] + 0.02, accuracy: 12 });
  await page.waitForTimeout(3000);
}
const off = await page.locator('.tpage-hud-off').innerText().catch(() => '');
check('wandering off the line warns with a distance', /\d+\s*m off the route/.test(off), off);
await page.locator('.tpage-hud-close').click();
await page.waitForTimeout(800);
check('stopping following returns to the page', await page.locator('.tpage.following').count() === 0);
// Following leaves the map full screen over the page bar; its own button
// closes it (the same on main before G12).
const closeMap = page.locator('.map-expand[aria-label="Close the full screen map"]').first();
await closeMap.waitFor({ timeout: 4000 }).catch(() => {});
if (await closeMap.count()) {
  await closeMap.click();
  await page.waitForTimeout(800);
}
await page.locator('.tpage-back').first().click();
await page.waitForTimeout(800);
check('Back closes the page onto the list', await page.locator('.tpage').count() === 0
  && await page.locator('.places-tcard').count() >= 3);

// ── A shared link opens the trail ─────────────────────────────────────────
const link = (copied.match(/#trail=\d+&tc=AL/) || [''])[0];
const deep = await context.newPage();
watch(deep, 'deeplink');
await deep.goto(`${ORIGIN}/${link}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await deep.locator('.tpage-v2').waitFor({ timeout: 60000 }).catch(() => {});
await deep.waitForTimeout(2500);
check('shared link opens the trail page', await deep.locator('.tpage-v2').isVisible().catch(() => false));
check('shared link opens the right trail', (await deep.locator('.pt-title').first().innerText().catch(() => '')).trim() === cardName);
check('shared link is stripped from the address bar', !deep.url().includes('trail='), deep.url());
await deep.close();
await context.close();

// ── Desktop pass ──────────────────────────────────────────────────────────
const deskCtx = await newContext({ width: 1280, height: 860 },
  line.length ? { latitude: line[Math.floor(line.length * 0.4)][0], longitude: line[Math.floor(line.length * 0.4)][1], accuracy: 12 } : undefined);
const desk = await deskCtx.newPage();
watch(desk, 'desktop');
await desk.goto(`${ORIGIN}/${link}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await desk.locator('.tpage-v2').waitFor({ timeout: 60000 }).catch(() => {});
await desk.waitForTimeout(3500);
check('desktop: shared link opens the page', await desk.locator('.tpage-v2').isVisible().catch(() => false));
const cols = await desk.evaluate(() => {
  const main = document.querySelector('.pt-main');
  const side = document.querySelector('.pt-side');
  if (!main || !side) return null;
  const m = main.getBoundingClientRect();
  return { mainW: Math.round(m.width), beside: side.getBoundingClientRect().left >= m.right, sticky: getComputedStyle(side).position };
});
check('desktop: the reading column stays readable', Boolean(cols && cols.mainW > 500 && cols.mainW <= 900), JSON.stringify(cols));
check('desktop: the walk card sits beside the column, sticky', Boolean(cols && cols.beside && cols.sticky === 'sticky'), JSON.stringify(cols));
check('desktop: the page fits the screen', await sideways(desk) <= 1, `${await sideways(desk)} px`);
await desk.screenshot({ path: 'shots/trail-desktop.png' });
// Following on a wide screen: the HUD is a card in the corner, not a banner.
await desk.locator('.tpage-follow').first().click();
await desk.waitForTimeout(2500);
const hudW = await desk.locator('.tpage-hud-card').evaluate((el) => el.getBoundingClientRect().width).catch(() => 0);
check('desktop: the HUD stays a corner card', hudW > 200 && hudW < 420, `${Math.round(hudW)} px`);
await desk.screenshot({ path: 'shots/trail-desktop-follow.png' });
await deskCtx.close();
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
console.log(failed === 0 && errors.length === 0 ? `\nAll ${checks.length} checks passed.` : `\n${failed} checks failed, ${errors.length} page errors.`);
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
