// Headless verify for the Trails list since G12 (Explore top, 2026-11-18).
//
//   node scripts/verify_trails.mjs [url] [CC]   (default http://localhost:$CARTA_PORT or 4173, SI)
//   CARTA_DATA_MIRROR=".../continent-app/public" fills a sparse worktree's data.
//
// G12 took the side facets, the phone Filters sheet, the loops chip and the
// sort select out of Explore's layers (the layers get their own filters in a
// later run), so those checks went. What still matters, at desktop and phone
// width:
//   reaching Trails  the Trails tab under the band; a country card picks the
//                    country (dn in the URL) and the band names it.
//   the list         a country lists many walks, each with its own 0-10
//                    rating, best first by default.
//   the photograph   a trail card shows a photograph of the TRAIL from
//                    Commons, or none, never a borrowed town hero.
//   the sort         Sort by length orders shortest first (the quick bar's
//                    Sort, the one sort left).
//   the page         a card opens its trail page with the same name; Back
//                    returns to the same country's list.
//   the GPX          the downloaded file is ONE continuous track with full
//                    geometry, elevation and the OSM credit (no teleports).
//   the layout       the band search over the list, no Settings, no side
//                    panel, nothing pushes the page sideways.
//
// Screenshots to shots/trails-*.png.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { mirrorData } from './lib/dataMirror.mjs';

const BASE = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;
// Slovenia by default: a few hundred curated routes and enough relief for
// the reasons to say something. Never asserted against a fixed count: a
// country's total is the sum of its regions' quotas.
const CC = (process.argv[3] || 'SI').toUpperCase();
const COUNTRY = new Intl.DisplayNames(['en'], { type: 'region' }).of(CC);
mkdirSync('shots', { recursive: true });

const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };
const errors = [];
// A local build fetches flights from R2, which answers CORS for its own hosts only.
const NOISE = /ERR_FAILED|config is not valid|content_overrides|Failed to load resource|Access to fetch at 'https:\/\/data\./;

async function open(view) {
  const phone = view === 'phone';
  const ctx = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    hasTouch: phone, isMobile: phone, serviceWorkers: 'block', acceptDownloads: true,
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
    // A headless Chromium that claims the Web Share API cannot show a share
    // sheet, so the GPX would never reach the download path.
    try {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    } catch { /* older engines */ }
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${view}: pageerror: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(`${view}: console: ${m.text().slice(0, 120)}`); });
  await page.goto(`${BASE}?tab=map`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.band-input', { timeout: 120000 });
  await page.waitForTimeout(3000);
  return page;
}
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const kmOf = (s) => parseFloat(((s.match(/([\d.,]+)\s*km/) || [])[1] || '').replace(',', '.'));

for (const view of ['desk', 'phone']) {
  const tag = `${view}: `;
  const page = await open(view);

  // ── Reach Trails and pick the country ──
  await page.locator('[role="tablist"] [role="tab"]:visible', { hasText: /^\s*Trails\s*$/ }).first().click();
  await page.waitForTimeout(2000);
  check(`${tag}the Trails tab opens the Trails layer`, /[?&]cat=trails\b/.test(page.url())
    && await page.locator('.dtab-bycountry .dgal-card').count() >= 30, page.url().split('?')[1]?.slice(0, 50));
  check(`${tag}the band search stays over the list`, await page.locator('.band-input').isVisible());
  check(`${tag}a layer has no Settings button`, await page.locator('.band-settings').count() === 0);
  check(`${tag}no side panel`, await page.locator('.places-side, .explore-side, .side-panel').count() === 0);
  await page.locator(`.dtab-bycountry .dgal-card[data-cc="${CC}"] .card-open`).first().click();
  await page.waitForTimeout(2500);
  check(`${tag}a country card writes dn=${CC}`, new RegExp(`[?&]dn=${CC}\\b`).test(page.url()));
  check(`${tag}the country band names ${COUNTRY}`,
    (await page.locator('.dtab-countryband-name').innerText().catch(() => '')).trim() === COUNTRY);

  // ── The list and the rating ──
  const cards = page.locator('.places-tcard');
  const nCards = await cards.count();
  check(`${tag}the country lists many walks`, nCards >= 30, `${nCards} cards`);
  const scores = (await page.locator('.places-tcard .score-chip').allInnerTexts()).map((s) => parseFloat(s)).filter(Number.isFinite);
  check(`${tag}trail cards carry their own rating`, scores.length >= nCards * 0.9, `${scores.length} on ${nCards}`);
  check(`${tag}ratings are on the 0-10 scale`, scores.every((s) => s >= 0 && s <= 10), `${Math.min(...scores)} to ${Math.max(...scores)}`);
  check(`${tag}default order is best rated first`, scores.every((s, i) => i === 0 || scores[i - 1] >= s - 0.001), scores.slice(0, 5).join(', '));

  // ── The photograph: the trail's own or none ──
  const imgs = await page.locator('.places-tcard .places-card-img').evaluateAll(
    (els) => els.map((e) => (e.tagName === 'IMG' ? (e.currentSrc || e.getAttribute('src') || e.getAttribute('srcset') || '') : 'NOIMG')),
  );
  const real = imgs.filter((s) => s && s !== 'NOIMG');
  check(`${tag}trail cards show photographs`, real.length > 0, `${real.length} of ${imgs.length}`);
  check(`${tag}every trail photograph comes from Commons`, real.every((s) => /upload\.wikimedia\.org/.test(s)), real[0]?.slice(0, 80));
  check(`${tag}nothing pushes the list sideways`, await sideways(page) <= 1, `${await sideways(page)} px`);
  await page.screenshot({ path: `shots/trails-${view}-${CC.toLowerCase()}-list.png` });

  // ── Sort by length ──
  await page.locator('.qfbar-sort:visible').first().click();
  await page.waitForTimeout(500);
  await page.locator('.xsort-item:visible', { hasText: /^\s*Length\s*$/ }).first().click();
  await page.waitForTimeout(1200);
  const kms = (await page.locator('.places-tcard .places-card-facts').allInnerTexts()).map(kmOf).filter(Number.isFinite);
  check(`${tag}length sort orders shortest first`, kms.length >= 10 && kms.every((k, i) => i === 0 || kms[i - 1] <= k + 0.05),
    kms.slice(0, 5).join(', '));
  await page.locator('.qfbar-sort:visible').first().click();
  await page.waitForTimeout(500);
  await page.locator('.xsort-item:visible', { hasText: /^\s*Rating\s*$/ }).first().click();
  await page.waitForTimeout(1200);

  // ── The trail page ──
  const name = (await page.locator('.places-tcard .places-card-name').first().innerText()).trim();
  await page.locator('.places-tcard .card-open').first().click();
  await page.waitForTimeout(3500);
  check(`${tag}a card opens its trail page`, await page.locator('.tpage-v2').isVisible().catch(() => false));
  const title = (await page.locator('.pt-title').first().innerText().catch(() => '')).trim();
  check(`${tag}the page is the card's walk`, title === name, `${name} -> ${title}`);
  check(`${tag}the page carries the rating`, /^\d/.test((await page.locator('.pt-score').first().innerText().catch(() => '')).trim()));
  const body = await page.locator('.tpage-scroll').innerText().catch(() => '');
  check(`${tag}the GPX apps and following paragraphs stay gone`,
    !/Komoot, AllTrails, OsmAnd|mymaps\.google\.com|Following works while this page is open|It stops when the phone locks/i.test(body));
  check(`${tag}the trail page fits the screen`, await sideways(page) <= 1, `${await sideways(page)} px`);
  await page.screenshot({ path: `shots/trails-${view}-${CC.toLowerCase()}-page.png` });

  // ── The GPX must be one continuous track ──
  const dl = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  await page.locator('.ox-gpx').first().click();
  const download = await dl;
  if (download) {
    let gpx = '';
    for await (const chunk of await download.createReadStream()) gpx += chunk;
    const segs = (gpx.match(/<trkseg>/g) || []).length;
    const pts = (gpx.match(/<trkpt /g) || []).length;
    check(`${tag}GPX is a single continuous track segment`, segs === 1, `${segs} trkseg, ${pts} points`);
    check(`${tag}GPX carries full geometry, not the card sketch`, pts > 100, `${pts} points`);
    check(`${tag}GPX carries elevation and the OSM credit`, /<ele>/.test(gpx) && /OpenStreetMap contributors/.test(gpx));
    // The teleport test: no jump between consecutive points over a kilometre.
    const coords = [...gpx.matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)"/g)].map((m) => [parseFloat(m[1]), parseFloat(m[2])]);
    let worst = 0;
    for (let i = 1; i < coords.length; i += 1) {
      const [la1, lo1] = coords[i - 1];
      const [la2, lo2] = coords[i];
      const dy = (la2 - la1) * 111.32;
      const dx = (lo2 - lo1) * 111.32 * Math.cos((la1 * Math.PI) / 180);
      worst = Math.max(worst, Math.sqrt(dx * dx + dy * dy));
    }
    check(`${tag}GPX never teleports between points`, worst < 1, `largest step ${(worst * 1000).toFixed(0)} m`);
  } else {
    check(`${tag}GPX downloads`, false, 'no download event');
  }

  // ── Back to the same list ──
  await page.locator('.tpage-back').first().click();
  await page.waitForTimeout(1200);
  check(`${tag}Back closes the page onto the same country`, await page.locator('.tpage').count() === 0
    && new RegExp(`[?&]dn=${CC}\\b`).test(page.url()) && await page.locator('.places-tcard').count() >= 30);
  await page.context().close();
}

// ── Report ──
await browser.close();
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
}
if (errors.length) {
  console.log(`\n${errors.length} page error(s):`);
  for (const e of errors.slice(0, 8)) console.log('  ' + e);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed || errors.length ? 1 : 0);
