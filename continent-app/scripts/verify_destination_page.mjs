// Headless verify for the full-screen destination page v3
// (browse/DestinationPage.jsx, T429) and its PDF download
// (lib/destinationPdf.js), both rendered from the dossier contract in
// public/dossier/.
//
//   npm run build, then: node scripts/verify_destination_page.mjs
//
// Spawns its own vite preview (dist/, port 4207), or uses CARTA_PORT. Build
// with `npm run build` (local data): a build:pages bundle fetches its data
// from the live data host, which does not answer localhost. The contract:
//
//   both      opening a card covers the screen with .destp; the gallery has
//             photographs, each named in full under it (no position figure);
//             the short intro reads from our own facts; the key facts band
//             renders; the price card prints the same day figure as the card
//             and the pin, its total is the sum of its lines, and it carries
//             the page's ONE primary; six sections are open with no toggle
//             and at most five rows fold; the map mounts once scrolled to;
//             photo tracks carry the things to do, the outdoors and the day
//             trips; the rating breakdown renders; no method sentence, count
//             line or "Set your dates" is left; every picture loaded; no em
//             dash or middot anywhere; Escape closes it.
//   lifestyle the price card's Stay opens the Lifestyle dialog ON TOP of the
//             page, and Escape closes the dialog, not the page.
//   phone     the back arrow is visible, the desktop cross is not, nothing
//             scrolls horizontally, the tracks swipe sideways.
//   desktop   the cross is visible, the back arrow is not; two columns; at
//             1280 x 720 the primary is in view without a scroll.
//   hash      #dest=gem:valbona opens the page directly at boot.
//   pdf       the export triggers a DOWNLOAD (not a print window) of a .pdf
//             above 20 KB, saved to shots/destp_guide.pdf; or the paywall
//             gates it for a guest.
//
// Screenshots to shots/destp-*.png.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';

// T385: CARTA_PORT points the harness at a preview a session already runs,
// so parallel sessions never test each other's build on a shared port.
const PORT = Number(process.env.CARTA_PORT) || 4207;
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
const NOISE = /ERR_FAILED|config is not valid|content_overrides|net::|favicon/;

const seed = (page) => page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('carta.welcomeSeen.v1', '1');
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
// The page first, then the dossier: a check run before the page mounts
// would find no loading block and pass too early.
const settle = async (page) => {
  await page.waitForSelector('.destp .destp-head', { timeout: 45000 });
  await page.waitForFunction(() => !document.querySelector('.destp-wait'), null, { timeout: 45000 });
};
const scrollTo = (page, sel) => page.evaluate((s) => {
  document.querySelector(s)?.scrollIntoView({ block: 'start' });
}, sel);
const openFold = async (page, id) => {
  const t = page.locator(`#sec-${id} .dsec-toggle`);
  if ((await t.getAttribute('aria-expanded').catch(() => 'true')) === 'false') await t.click();
  await page.waitForTimeout(500);
};

// ── Desktop ──────────────────────────────────────────────────────────────
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
wire(page);
await seed(page);
await page.goto(BASE + '#dest=gem:valbona', { waitUntil: 'domcontentloaded', timeout: 45000 });
await settle(page);
await page.waitForTimeout(1500);

const destp = page.locator('.destp');
check('hash #dest= opens the page at boot', await destp.isVisible());
check('city heading says Valbona', /valbona/i.test(await page.locator('.destp-city').textContent().catch(() => '')));

const galleryN = await page.locator('.destp-slide').count();
check('gallery has 5+ photographs', galleryN >= 5, `${galleryN} slides`);
check('every photograph names its place under it', await page.locator('.destp-slide-cap').count() === galleryN);
check('no position figure under the photographs', await page.locator('.destp-slide-pos').count() === 0);
const capCut = await page.evaluate(() => Array.from(document.querySelectorAll('.destp-slide-cap'))
  .filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent));
check('no photograph name is cut off', capCut.length === 0, capCut.slice(0, 2).join(' | '));
check('short intro renders from our facts', /valbona/i.test(await page.locator('.destp-short').textContent().catch(() => '')));
check('key facts render (4 to 6)', await (async () => {
  const n = await page.locator('.destp-keys .destp-key').count();
  return n >= 4 && n <= 6;
})(), `${await page.locator('.destp-keys .destp-key').count()} facts`);
check('score sits in the head', await page.locator('.destp-score .score-chip').count() === 1);

// The price card: one cost truth, a receipt that adds up, one primary.
check('price card renders', await page.locator('.dprice').count() === 1);
const sum = await page.evaluate(() => {
  const lines = Array.from(document.querySelectorAll('.dprice .frr-line:not(.frr-sum) dd[data-eur]'))
    .map((el) => Number(el.getAttribute('data-eur')));
  const total = Number(document.querySelector('.dprice .frr-sum-eur')?.getAttribute('data-eur'));
  return { lines, total, ok: Math.abs(lines.reduce((a, b) => a + b, 0) - total) < 0.011 };
});
check('price card total is the sum of its lines', sum.ok && sum.lines.length >= 2, JSON.stringify(sum));
check('one primary on the page', await page.locator('.destp .btn-primary:visible').count() === 1);
check('the primary is Plan a trip here', /plan a trip here/i.test(await page.locator('.destp .btn-primary').first().textContent().catch(() => '')));

// Six open sections, at most five folded rows.
const openN = await page.locator('section.dsec2').count();
check('open sections render (5 or 6) with no toggle', openN >= 5 && await page.locator('section.dsec2 .dsec-toggle').count() === 0, `${openN} open`);
const foldsN = await page.locator('.destp .dsec-toggle').count();
check('at most five folded rows', foldsN <= 5, `${foldsN} folds`);
check('When to go is open', await page.locator('#sec-when .climate-chart').count() === 1);

// The map mounts when its section comes near the view.
const mapFar = await page.evaluate(() => {
  const s = document.querySelector('#sec-highlights .dmap-slot');
  return s ? s.getBoundingClientRect().top > window.innerHeight + 320 : false;
});
const mapBefore = await page.locator('#sec-highlights .dmap canvas').count();
await scrollTo(page, '#sec-highlights');
await page.waitForTimeout(3500);
check('map waits while it is far below the view', !mapFar || mapBefore === 0, mapFar ? 'far' : 'near at load');
check('map mounts once scrolled to', await page.locator('#sec-highlights .dmap .maplibregl-canvas, #sec-highlights .dmap canvas').count() > 0);
check('map layers are tabs, without counts', await page.locator('#sec-highlights .ui-tab').count() >= 2
  && !(await page.locator('#sec-highlights .ui-tab-count').count()));

for (const [label, sel] of [
  ['highlight tiles', '#sec-highlights .dhl2'],
  ['numbered highlight marks', '.dhl2-n'],
  // T446: photo tiles where there are photographs, a hairline list for the rest.
  ['things to do tiles or rows', '#sec-do .card, #sec-do .ddo-list li'],
  ['walk and ride tiles', '#sec-routes .card'],
  ['day trip tiles', '#sec-trips .card'],
  ['booking exits', '.destp-exits .destp-exit'],
  ['photo credit links', '.destp-slide-credit'],
]) {
  const n = await page.locator(sel).count();
  check(`${label} present`, n > 0, `${n}`);
}
check('day trips carry a score', await page.locator('#sec-trips .score-chip').count() > 0);
await openFold(page, 'tips');
check('insider tips render on the deck', await page.locator('.destp-tips .flash-card').count() > 0);
await openFold(page, 'rating');
check('rating v2 breakdown renders', await page.locator('#sec-rating .rate-break-v2 .rb-parts .rb-part').count() >= 3);
check('rating scale has three ticks', await page.locator('#sec-rating .rb-tick').count() === 3);
// T474: one page bar on both sizes, back naming the list, no cross.
check('desktop back names the list', (await page.locator('.destp .ipage-back').innerText()).trim().length > 0);
check('desktop has no close cross', (await page.locator('.destp-close').count()) === 0);
const grid = await page.evaluate(() => {
  const g = document.querySelector('.destp-grid');
  return g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : 0;
});
check('desktop grid is two columns', grid === 2, `${grid}`);
await page.waitForTimeout(2000);
let broken = await brokenImages(page);
check('no broken image on the page (desktop)', broken.length === 0, broken.slice(0, 3).join(' | '));
const pageText = await destp.textContent();
check('no em or en dash in the page text', !/[—–]/.test(pageText));
check('no middot separators in the page text', !/[·•]/.test(pageText));
check('no method sentence or count line left',
  !/Set your dates|Priced for|figures here are measured|national basket|Tap a segment|\d+ ideas|\d+ sights|\d+ tips/i.test(pageText));
await page.screenshot({ path: 'shots/destp-desktop.png', fullPage: false });

// The section rail selects the section in view.
await scrollTo(page, '#sec-when');
await page.waitForTimeout(900);
check('the rail selects When at its section',
  /when/i.test(await page.locator('.srail a.is-active').first().textContent().catch(() => '')));
await page.screenshot({ path: 'shots/destp-desktop-scrolled.png' });

// The Lifestyle dialog opens over the page; Escape closes it, not the page.
await scrollTo(page, '.dprice');
await page.locator('.dprice-input[aria-haspopup="dialog"]').click();
await page.waitForTimeout(900);
const onTop = await page.evaluate(() => {
  const p = document.querySelector('.accom-panel.lifestyle-panel');
  if (!p) return false;
  const r = p.getBoundingClientRect();
  return p.contains(document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 200)));
});
check('Stay opens the Lifestyle dialog over the page', onTop);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
check('Escape closes the dialog and keeps the page',
  !(await page.locator('.accom-panel.lifestyle-panel').isVisible().catch(() => false)) && await destp.isVisible());

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

// A gateway record describes the CITY, not its airport.
await page.goto(BASE + '#dest=FCO', { waitUntil: 'domcontentloaded' });
await settle(page);
await page.waitForTimeout(1500);
const shortText = await page.locator('.destp-short').textContent().catch(() => '');
check('Rome intro is short and names the place', /rome/i.test(shortText) && shortText.length < 460 && !/airport/i.test(shortText.slice(0, 60)), shortText.slice(0, 60));
const romeDay = await page.locator('.dprice-day .money').textContent().catch(() => '');
check('Rome prints its day figure with the estimate mark', /~€\d+ est\./.test(romeDay), romeDay);
// Rome's Pantheon (a Wikidata Special:FilePath image before the fix) loads.
await scrollTo(page, '#sec-highlights');
await page.waitForTimeout(1500);
await page.locator('#sec-highlights .dphoto-all').click().catch(() => {});
await page.waitForTimeout(800);
await page.evaluate(() => {
  const card = Array.from(document.querySelectorAll('#sec-highlights .dhl2')).find((c) => /Pantheon/i.test(c.textContent));
  card?.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(2500);
const pantheon = await page.evaluate(() => {
  const card = Array.from(document.querySelectorAll('#sec-highlights .dhl2')).find((c) => /Pantheon/i.test(c.textContent));
  const im = card?.querySelector('img');
  return im ? { complete: im.complete, w: im.naturalWidth, src: im.src.slice(0, 80) } : null;
});
check('Rome: the Pantheon photograph loads', !!pantheon && pantheon.w > 0, JSON.stringify(pantheon));
broken = await brokenImages(page);
check('no broken image on the page (Rome)', broken.length === 0, broken.slice(0, 3).join(' | '));
await openFold(page, 'festivals');
check('festivals section renders', await page.locator('.destp-fest').count() > 0);
check('festivals carry a month', await page.locator('.destp-fest-when:not(.is-undated)').count() > 0);
await openFold(page, 'practical');
check('city parking rows render', await page.locator('.destp-park').count() > 0);
check('parking rows carry Waze deeplinks', await page.locator('.destp-park-nav a[href*="waze.com"]').count() > 0);
check('parking rows carry Google Maps deeplinks', await page.locator('.destp-park-nav a[href*="google.com/maps"]').count() > 0);
check('parking carries the provenance line', /OpenStreetMap contributors/i.test(await page.locator('#sec-practical').textContent().catch(() => '')));
check('walk and ride lists cycling for Rome', await page.locator('#sec-routes .card', { hasText: /cycling/i }).count() > 0);
const cdgText = await (async () => {
  await page.goto(BASE + '#dest=CDG', { waitUntil: 'domcontentloaded' });
  await settle(page);
  return page.locator('.destp-short').textContent().catch(() => '');
})();
check('gateway record describes the city, not the airport',
  /paris/i.test(cdgText) && !/^\s*paris charles de gaulle airport/i.test(cdgText), cdgText.slice(0, 50));
await page.close();

// ── 1280 x 720: the primary in view at load ─────────────────────────────
const small = await browser.newPage({ viewport: { width: 1280, height: 720 } });
wire(small);
await seed(small);
await small.goto(BASE + '#dest=FCO', { waitUntil: 'domcontentloaded', timeout: 45000 });
await settle(small);
await small.waitForTimeout(1200);
const inView = await small.evaluate(() => {
  const b = document.querySelector('.destp .btn-primary')?.getBoundingClientRect();
  return b ? b.top >= 0 && b.bottom <= window.innerHeight : false;
});
check('1280 x 720: the primary is in view without a scroll', inView);
await small.close();

// ── Phone ────────────────────────────────────────────────────────────────
const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
wire(phone);
await seed(phone);
await phone.goto(BASE + '#dest=gem:valbona', { waitUntil: 'domcontentloaded', timeout: 45000 });
await settle(phone);
await phone.waitForTimeout(1500);
check('phone page opens', await phone.locator('.destp').isVisible());
check('phone back names the list', (await phone.locator('.destp .ipage-back').innerText()).trim().length > 0);
check('phone has no close cross', (await phone.locator('.destp-close').count()) === 0);
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
const tracksSwipe = await phone.evaluate(() => {
  const s = document.querySelector('#sec-do .dphoto-strip, #sec-routes .dphoto-strip');
  return s ? s.scrollWidth > s.clientWidth + 20 : false;
});
check('phone photo tracks swipe sideways', tracksSwipe);
const phoneScroll = await phone.evaluate(() => document.querySelector('.destp-scroll')?.scrollHeight || 0);
check('phone page stays within 7,000 px', phoneScroll < 7000, `${phoneScroll}px`);
await phone.screenshot({ path: 'shots/destp-phone.png' });
await phone.locator('.destp-scroll').evaluate((el) => { el.scrollTop = 900; });
await phone.waitForTimeout(600);
await phone.screenshot({ path: 'shots/destp-phone-scrolled.png' });
await phone.locator('.destp-scroll').evaluate((el) => { el.scrollTop = 1900; });
await phone.waitForTimeout(600);
await phone.screenshot({ path: 'shots/destp-phone-scrolled-2.png' });
await phone.locator('.destp .ipage-back').click();
await phone.waitForTimeout(400);
check('back closes on phone', !(await phone.locator('.destp').isVisible().catch(() => false)));
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
