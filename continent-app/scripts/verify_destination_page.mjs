// Headless verify for the full-screen destination page v2
// (browse/DestinationPage.jsx) and its PDF download (lib/destinationPdf.js),
// both rendered from the dossier contract in public/dossier/.
//
//   npm run build, then: node scripts/verify_destination_page.mjs
//
// Spawns its own vite preview (dist/, port 4207). The contract:
//
//   both      opening a card covers the screen with .destp; the gallery has
//             photographs and none of them is broken; the short intro reads
//             from our own facts; the four-fact strip renders; the folding
//             sections exist and a closed one carries a summary; highlights,
//             things to do, around-here rows, day trips, tips, parking and
//             explore-further render (after "expand all"); the rating
//             breakdown v2 renders; every picture on the page loaded (no
//             naturalWidth 0); no em dash or middot anywhere in the text;
//             Escape closes it.
//   phone     the back arrow is visible, the desktop cross is not, nothing
//             scrolls horizontally, the highlight strip swipes sideways.
//   desktop   the cross is visible, the back arrow is not; two columns.
//   hash      #dest=gem:valbona opens the page directly at boot.
//   pdf       the export triggers a DOWNLOAD (not a print window) of a .pdf
//             above 20 KB, saved to shots/destp_guide.pdf; or the paywall
//             gates it for a guest.
//
// Screenshots to shots/destp-*.png.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';

const PORT = 4207;
const BASE = `http://127.0.0.1:${PORT}/`;
mkdirSync('shots', { recursive: true });

const isUp = async () => {
  try { const r = await fetch(BASE); return r.ok; } catch { return false; }
};
let server = null;
if (!(await isUp())) {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { shell: true, stdio: 'ignore' });
  for (let i = 0; i < 90 && !(await isUp()); i++) await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const errors = [];
const NOISE = /emrldtp|ERR_FAILED|config is not valid|content_overrides|net::|favicon/;

const seed = (page) => page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});
const wire = (page) => {
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 140));
  });
};
const brokenImages = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.destp img'))
  .filter((im) => im.complete && im.naturalWidth === 0 && !im.hidden)
  .map((im) => im.src.slice(0, 90)));
const expandAll = async (page) => {
  const btn = page.locator('.destp-subnav-all');
  if (/expand/i.test(await btn.textContent().catch(() => ''))) await btn.click();
  await page.waitForTimeout(900);
};

// ── Desktop ──────────────────────────────────────────────────────────────
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
wire(page);
await seed(page);
await page.goto(BASE + '#dest=gem:valbona', { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(4200);

const destp = page.locator('.destp');
check('hash #dest= opens the page at boot', await destp.isVisible());
check('city heading says Valbona', /valbona/i.test(await page.locator('.destp-city').textContent().catch(() => '')));

const galleryN = await page.locator('.destp-slide').count();
check('gallery has 5+ photographs', galleryN >= 5, `${galleryN} slides`);
check('short intro renders from our facts', /valbona/i.test(await page.locator('.destp-short').textContent().catch(() => '')));
check('fact strip renders', await page.locator('.dfacts .dfact').count() >= 2);
check('score sits in the head', await page.locator('.destp-score .score-chip').count() === 1);

await page.waitForTimeout(2500); // dossier sections + lazy map
const foldsN = await page.locator('.dsec').count();
check('folding sections render', foldsN >= 8, `${foldsN} folds`);
check('a closed section carries its summary', await page.locator('.dsec:not(.is-open) .dsec-summary').count() > 0);
check('highlights open by default', await page.locator('#sec-highlights.is-open').count() === 1);
check('map mounts', await page.locator('.dmap .maplibregl-canvas, .dmap canvas').count() > 0);
check('layer toggle shows within-20-km or trips', await page.locator('.destp-layer', { hasText: /20 km|day trips/i }).count() > 0);

await expandAll(page);
for (const [label, sel] of [
  ['highlight tiles', '.dhl'],
  ['numbered tile badges', '.dhl-n'],
  ['things to do cards', '.ddo'],
  ['evidence meters', '.ddo-ev-bar'],
  ['around-here tabs', '.dar-tab'],
  ['around-here rows', '.dar-row'],
  ['around-here pictures', '.dar-photo'],
  ['day trip cards', '.dtrip'],
  ['day trip photos', '.dtrip-photo'],
  ['insider tips', '.destp-tip-list li'],
  ['explore further links', '.destp-further .xp-further-btn'],
  ['photo credit links', '.destp-slide-credit'],
]) {
  const n = await page.locator(sel).count();
  check(`${label} present`, n > 0, `${n}`);
}
check('no lettered plates stand in for photos', await page.locator('.destp-hl-plate').count() === 0);
check('rating v2 breakdown renders', await page.locator('#sec-rating .rate-break-v2 .rb-parts .rb-part').count() >= 3);
check('rating scale has three ticks', await page.locator('#sec-rating .rb-tick').count() === 3);
check('day trips carry a score', await page.locator('.dtrip .score-chip').count() > 0);
check('day trips explain themselves', await page.locator('.dtrip-why').count() > 0);
check('desktop shows the cross', await page.locator('.destp-close').isVisible());
check('desktop hides the back arrow', !(await page.locator('.destp-back').isVisible()));
const grid = await page.evaluate(() => {
  const g = document.querySelector('.destp-grid');
  return g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : 0;
});
check('desktop grid is two columns', grid === 2, `${grid}`);
await page.waitForTimeout(2500);
let broken = await brokenImages(page);
check('no broken image on the page (desktop)', broken.length === 0, broken.slice(0, 3).join(' | '));
const pageText = await destp.textContent();
check('no em or en dash in the page text', !/[—–]/.test(pageText));
check('no middot separators in the page text', !/[·•]/.test(pageText));
check('the old crowding sentence is gone', !/Measured yearly by region/i.test(pageText));
await page.screenshot({ path: 'shots/destp-desktop.png', fullPage: false });
await page.locator('.destp-scroll').evaluate((el) => { el.scrollTop = 900; });
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/destp-desktop-scrolled.png' });

// ── The PDF download ─────────────────────────────────────────────────────
const dlPromise = page.waitForEvent('download', { timeout: 25000 }).catch(() => null);
await page.locator('.destp-pdf').click();
const dl = await dlPromise;
if (!dl) {
  const gated = await page.locator('[role=dialog]').filter({ hasText: /pass/i }).first()
    .isVisible().catch(() => false);
  check('PDF downloads, or the paywall gates it for a guest', gated, 'no download and no pass dialog');
  if (gated) {
    const vp = page.viewportSize();
    await page.mouse.click(8, vp.height - 30);
    await page.waitForTimeout(500);
  }
} else {
  await dl.saveAs('shots/destp_guide.pdf');
  const size = statSync('shots/destp_guide.pdf').size;
  check('PDF downloads, or the paywall gates it for a guest', true);
  check('PDF file name ends in .pdf', /\.pdf$/i.test(dl.suggestedFilename()), dl.suggestedFilename());
  check('PDF is a real document (> 20 KB)', size > 20000, `${size} bytes`);
}
check('no print window opened', page.context().pages().length === 1);

// Escape closes the page.
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
check('Escape closes the page', !(await destp.isVisible().catch(() => false)));

// Opening from the Explore grid covers the screen too.
await page.locator('button:has-text("Explore"):visible').first().click().catch(() => {});
await page.waitForTimeout(2600);
await page.locator('.explore-card, .xcard, .explore-grid button').first().click().catch(() => {});
await page.waitForTimeout(2600);
check('Explore card opens the full-screen page',
  await page.locator('.destp').isVisible().catch(() => false));

// A gateway record describes the CITY, not its airport; Rome's Pantheon
// (a Wikidata Special:FilePath image before the fix) now loads.
await page.goto(BASE + '#dest=FCO', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
const shortText = await page.locator('.destp-short').textContent().catch(() => '');
check('Rome intro is short and names the place', /rome/i.test(shortText) && shortText.length < 420 && !/airport/i.test(shortText.slice(0, 60)), shortText.slice(0, 60));
await expandAll(page);
await page.waitForTimeout(3500);
const pantheon = await page.evaluate(() => {
  const im = Array.from(document.querySelectorAll('.dhl img')).find((x) => /Pantheon/i.test(x.src));
  return im ? { complete: im.complete, w: im.naturalWidth, src: im.src.slice(0, 80) } : null;
});
check('Rome: the Pantheon photograph loads', !!pantheon && pantheon.w > 0, JSON.stringify(pantheon));
broken = await brokenImages(page);
check('no broken image on the page (Rome)', broken.length === 0, broken.slice(0, 3).join(' | '));
check('festivals section renders', await page.locator('.destp-fest').count() > 0);
check('festivals carry a month', await page.locator('.destp-fest-when:not(.is-undated)').count() > 0);
check('city parking rows render', await page.locator('.destp-park').count() > 0);
check('parking rows carry Waze deeplinks', await page.locator('.destp-park-nav a[href*="waze.com"]').count() > 0);
check('parking rows carry Google Maps deeplinks', await page.locator('.destp-park-nav a[href*="google.com/maps"]').count() > 0);
check('parking carries the provenance line', /OpenStreetMap contributors/i.test(await page.locator('#sec-park').textContent().catch(() => '')));
check('around-here lists cycling for Rome', await page.locator('.dar-tab', { hasText: /cycling/i }).count() > 0);
const cdgText = await (async () => {
  await page.goto(BASE + '#dest=CDG', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  return page.locator('.destp-short').textContent().catch(() => '');
})();
check('gateway record describes the city, not the airport',
  /paris/i.test(cdgText) && !/^\s*paris charles de gaulle airport/i.test(cdgText), cdgText.slice(0, 50));
await page.close();

// ── Phone ────────────────────────────────────────────────────────────────
const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
wire(phone);
await seed(phone);
await phone.goto(BASE + '#dest=gem:valbona', { waitUntil: 'domcontentloaded', timeout: 45000 });
await phone.waitForTimeout(4500);
check('phone page opens', await phone.locator('.destp').isVisible());
check('phone shows the back arrow', await phone.locator('.destp-back').isVisible());
check('phone hides the cross', !(await phone.locator('.destp-close').isVisible()));
const hscroll = await phone.evaluate(() => {
  const s = document.querySelector('.destp-scroll');
  return s ? s.scrollWidth - s.clientWidth : 0;
});
check('no horizontal scroll on phone', hscroll <= 1, `${hscroll}px overflow`);
const covers = await phone.evaluate(() => {
  const r = document.querySelector('.destp').getBoundingClientRect();
  return r.width >= window.innerWidth - 1 && r.height >= window.innerHeight - 1;
});
check('phone page covers the viewport', covers);
const stripSwipes = await phone.evaluate(() => {
  const s = document.querySelector('.dhl-strip');
  return s ? s.scrollWidth > s.clientWidth + 20 : false;
});
check('phone highlight tiles swipe sideways', stripSwipes);
const phoneScroll = await phone.evaluate(() => document.querySelector('.destp-scroll')?.scrollHeight || 0);
check('phone page is compact (default state under 6,500 px)', phoneScroll < 6500, `${phoneScroll}px`);
await phone.screenshot({ path: 'shots/destp-phone.png' });
await phone.locator('.destp-scroll').evaluate((el) => { el.scrollTop = 900; });
await phone.waitForTimeout(600);
await phone.screenshot({ path: 'shots/destp-phone-scrolled.png' });
await phone.locator('.destp-scroll').evaluate((el) => { el.scrollTop = 1900; });
await phone.waitForTimeout(600);
await phone.screenshot({ path: 'shots/destp-phone-scrolled-2.png' });
await phone.locator('.destp-back').click();
await phone.waitForTimeout(400);
check('back arrow closes on phone', !(await phone.locator('.destp').isVisible().catch(() => false)));
await phone.close();

await browser.close();
if (server) server.kill();

let fail = 0;
for (const c of checks) {
  if (!c.ok) fail++;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
}
if (errors.length) {
  console.log('\npage errors:');
  for (const e of [...new Set(errors)].slice(0, 12)) console.log('  ' + e);
}
console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed');
