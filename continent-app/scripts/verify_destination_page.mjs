// Headless verify for the full-screen destination page (browse/DestinationPage.jsx)
// and its PDF export (lib/destinationPdf.js), both rendered from the dossier
// contract in public/dossier/.
//
//   npm run build, then: node scripts/verify_destination_page.mjs
//
// Spawns its own vite preview (dist/, port 4207). The contract:
//
//   both      opening a card covers the screen with .destp; the gallery has
//             photographs; highlights, things to do, day trips, nearby
//             nature, cost, parking and explore-further render; NO rating
//             score is displayed; Escape closes it.
//   phone     the back arrow is visible, the desktop cross is not, nothing
//             scrolls horizontally.
//   desktop   the cross is visible, the back arrow is not; the two-column
//             grid holds.
//   hash      #dest=gem:valbona opens the page directly at boot.
//   pdf       the export opens a popup whose document carries the credits
//             page; saved to shots/destp_guide.pdf for eyes.
//
// Screenshots to shots/destp-*.png.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

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

// ── Desktop: open via the Destinations grid, no tab hop ──────────────────
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

await page.waitForTimeout(2500); // dossier sections + lazy map
const secText = await destp.textContent();
for (const [label, sel] of [
  ['highlight cards', '.destp-hl'],
  ['things to do rows', '.destp-do'],
  ['day trip cards', '.destp-trip'],
  ['nearby nature rows', '.destp-nat'],
  ['insider tips', '.destp-tip-list li'],
  ['explore further links', '.destp-further .xp-further-btn'],
  ['photo credit links', '.destp-slide-credit'],
]) {
  const n = await page.locator(sel).count();
  check(`${label} present`, n > 0, `${n}`);
}
check('map mounts', await page.locator('.dmap .maplibregl-canvas, .dmap canvas').count() > 0);
check('layer toggle shows day trips', await page.locator('.destp-layer', { hasText: /day trips/i }).count() > 0);
// D2 reversed the old brief: the verdict now leads the page, breakdown
// and confidence included, so the check asserts its presence.
check('the verdict card leads with the breakdown',
  await destp.locator('#sec-verdict .rate-break').count() === 1);
check('day trips carry a score', await page.locator('.destp-trip-score').count() > 0);
check('day trips explain themselves', await page.locator('.destp-trip-why').count() > 0);
check('desktop shows the cross', await page.locator('.destp-close').isVisible());
check('desktop hides the back arrow', !(await page.locator('.destp-back').isVisible()));
const grid = await page.evaluate(() => {
  const g = document.querySelector('.destp-grid');
  return g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : 0;
});
check('desktop grid is two columns', grid === 2, `${grid}`);
await page.screenshot({ path: 'shots/destp-desktop.png', fullPage: false });
await page.locator('.destp-scroll').evaluate((el) => { el.scrollTop = 900; });
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/destp-desktop-scrolled.png' });

// ── The PDF export ────────────────────────────────────────────────────────
const popupPromise = page.waitForEvent('popup', { timeout: 15000 }).catch(() => null);
await page.locator('.destp-pdf').click();
let popup = await popupPromise;
// Paywall phase 1 gates the export for guests: the correct behaviours are
// EITHER the PDF popup (entitled) or the pass dialog (guest). A silent
// nothing is the only failure.
if (!popup) {
  const gated = await page.locator('[role=dialog]').filter({ hasText: /pass/i }).first()
    .isVisible().catch(() => false);
  check('PDF popup opens, or the paywall gates it for a guest', gated);
  if (gated) {
    // the pass sheet closes on a backdrop click (PassModal's overlay
    // onClick), not on Escape. The BOTTOM corner: the destp bar renders
    // above the overlay near the top (pre-existing z-order), so a top
    // corner click hits the bar instead of the backdrop.
    const vp = page.viewportSize();
    await page.mouse.click(8, vp.height - 30);
    await page.waitForTimeout(500);
  }
} else {
  check('PDF popup opens, or the paywall gates it for a guest', true);
}
const pageHadParking = await page.locator('.destp-park').count() > 0;
// Valbona has no recorded festivals, and a section with nothing to say is
// not rendered. Only assert the printed section where the page has one.
const pageHadFests = await page.locator('.destp-fest').count() > 0;
if (popup) {
  await popup.waitForLoadState('domcontentloaded').catch(() => {});
  await popup.waitForTimeout(3500);
  const body = await popup.evaluate(() => document.body?.innerText || '').catch(() => '');
  check('PDF carries the credits page', /credits and sources/i.test(body));
  check('PDF carries things to do', /best things to do/i.test(body));
  // The redesign's contract: no printed map, must-sees under their own
  // heading, festivals as a section of their own.
  check('PDF prints no basemap crop', await popup.locator('.mapimg').count() === 0);
  check('PDF leads with the must-sees', await popup.locator('.hl-card img').count() >= 3);
  if (pageHadFests) check('PDF has a festivals section', /festivals and events/i.test(body));
  check('PDF trips carry a score', await popup.locator('.trip-score').count() > 0);
  check('PDF nature rows carry photos', await popup.locator('.nat img').count() > 0);
  if (pageHadParking) check('PDF carries parking deeplinks', /waze\.com/i.test(body));
  check('PDF shows no live forecast', !/weather this week/i.test(body));
  await popup.emulateMedia({ media: 'print' });
  await popup.pdf({ path: 'shots/destp_guide.pdf', format: 'A4', printBackground: true }).catch((e) => {
    check('popup.pdf renders', false, e.message.slice(0, 80));
  });
  await popup.close().catch(() => {});
}

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
  await page.locator('.destp').isVisible().catch(() => false),
  `dlg=${await page.locator('[role=dialog]').first().evaluate((e) => e.className + "|" + (e.offsetParent !== null)).catch(() => 'none')}`);

// A gateway record describes the CITY, not its airport, and carries the
// festival section with real months.
await page.goto(BASE + '#dest=CDG', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4500);
const aboutText = await page.locator('.destp-about').textContent().catch(() => '');
check('gateway record describes the city, not the airport',
  /paris/i.test(aboutText) && !/^\s*paris charles de gaulle airport/i.test(aboutText),
  aboutText.slice(0, 50));
check('festivals section renders', await page.locator('.destp-fest').count() > 0);
check('festivals carry a month', await page.locator('.destp-fest-when:not(.is-undated)').count() > 0);
check('gallery holds no crest or map',
  await page.evaluate(() => Array.from(document.querySelectorAll('.destp-slide img'))
    .every((im) => !/coat_of_arms|blason|wappen|_map|locator/i.test(im.src))));

// A city with parking carries the spot rows and both navigation deeplinks.
await page.goto(BASE + '#dest=TIA', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4200);
check('city parking rows render', await page.locator('.destp-park').count() > 0);
check('parking rows carry Waze deeplinks', await page.locator('.destp-park-nav a[href*="waze.com"]').count() > 0);
check('parking rows carry Google Maps deeplinks', await page.locator('.destp-park-nav a[href*="google.com/maps"]').count() > 0);
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
await phone.screenshot({ path: 'shots/destp-phone.png' });
await phone.locator('.destp-scroll').evaluate((el) => { el.scrollTop = 1400; });
await phone.waitForTimeout(600);
await phone.screenshot({ path: 'shots/destp-phone-scrolled.png' });
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
process.exit(fail || errors.length ? 1 : 0);
