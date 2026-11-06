// Headless verify for the place page (browse/DestinationPage.jsx) and its
// PDF download (lib/destinationPdf.js), rendered from the dossier contract in
// public/dossier/. T1089: rewritten for the single-scroll place template
// (pt-* markup, T1019 onward); the four tabs, gallery slides and kit CostRow
// price card of the T429/T502 page are gone.
//
//   node scripts/verify_destination_page.mjs [url]
//
// Uses the URL argument or CARTA_PORT; otherwise spawns vite preview (dist/).
//
//   both     #dest= opens the page at boot; name, Score chip and tags in the
//            head; the jump bar; the intro; 4 to 6 key facts; the sections;
//            the price card (dates and party pills, a total, the day figure)
//            with the page's ONE primary "Plan a trip here"; a twelve month
//            strip; stay rows; similar places; no em dash or middot in the
//            page text; the PDF door downloads a .pdf or the paywall gates it.
//   desktop  the price card is a sticky side column; back names the list.
//   phone    covers the viewport, no horizontal scroll, the foot bar CTA.
//
// Screenshots to shots/destp-*.png.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';

// T385: CARTA_PORT points the harness at a preview a session already runs,
// so parallel sessions never test each other's build on a shared port.
const PORT = Number(process.env.CARTA_PORT) || 4207;
// T502: a URL argument (as the other harnesses take) wins over CARTA_PORT.
const BASE = process.argv[2] ? process.argv[2].replace(/\/?$/, '/') : `http://127.0.0.1:${PORT}/`;
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
  .filter((im) => im.complete && im.naturalWidth === 0 && !im.hidden
    && im.src.startsWith(location.origin)) // T1089: remote hosts are unreachable offline
  .map((im) => im.src.slice(0, 90)));
// The page first, then the dossier: a check run before the page mounts
// would find no loading block and pass too early.
const settle = async (page) => {
  await page.waitForSelector('.destp .pt-title', { timeout: 90000 });
  await page.waitForFunction(() => !document.querySelector('.destp-wait'), null, { timeout: 90000 });
};
const scrollTo = (page, sel) => page.evaluate((s) => {
  document.querySelector(s)?.scrollIntoView({ block: 'start' });
}, sel);
// T502: a direct load of #dest= drops the hash (known), so the page is
// opened the way a card link does it: the app boots, then the hash moves.
const openDest = async (page, id) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('.bottom-nav', { state: 'attached', timeout: 90000 });
  await page.waitForTimeout(2500);
  await page.evaluate((d) => { window.location.hash = `dest=${d}`; }, id);
  await settle(page);
};
// T502: the page is four tabs since T499 (Overview, Nearby, When to go,
// Practical); a section is only in the DOM on its own tab.
const tab = async (page, name) => {
  await page.locator('.destp [role="tab"]', { hasText: name }).first().click();
  await page.waitForTimeout(1500);
};
const openFold = async (page, id) => {
  const t = page.locator(`#sec-${id} .dsec-toggle`);
  if ((await t.getAttribute('aria-expanded').catch(() => 'true')) === 'false') await t.click();
  await page.waitForTimeout(500);
};

// ── Desktop ──────────────────────────────────────────────────────────────
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
wire(page);
await seed(page);
await page.goto(BASE + '#dest=gem:valbona', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.locator('.destp').waitFor({ timeout: 90000 }).catch(() => {});
const destp = page.locator('.destp');
check('hash #dest= opens the page at boot', await destp.isVisible());
await openDest(page, 'gem:valbona');
await page.waitForTimeout(1500);
check('title says Valbona', /valbona/i.test(await page.locator('.pt-title').textContent().catch(() => '')));
check('score chip sits in the head', await page.locator('.pt-head .score-chip').count() >= 1);
const jump = (await page.locator('.pt-jump-link').allInnerTexts()).map((s) => s.trim());
check('jump bar names the sections', jump.length >= 4 && jump[0] === 'Overview' && jump.includes('Practical'), jump.join('|'));
check('short intro reads from our facts', /valbona/i.test(await page.locator('.pt-lead-first').textContent().catch(() => '')));
const keyN = await page.locator('.pt-facts .dsk-kf').count();
check('key facts render (4 to 6)', keyN >= 4 && keyN <= 6, `${keyN} facts`);
const secs = (await page.locator('.pt-sec-title').allInnerTexts()).map((s) => s.trim());
check('sections render (Good to know, What to see, When to go, Practical)',
  ['Good to know', 'What to see', 'When to go', 'Practical'].every((n) => secs.includes(n)), secs.join('|'));

// The price card: one cost truth, one primary.
check('price card renders', await page.locator('.tcard').count() === 1);
check('price card has dates and party pills', await page.locator('.tcard .dpc-pill').count() === 2);
check('price card total is an amount', /€\s?\d/.test(await page.locator('.tcard-total .money').textContent().catch(() => '')));
check('price card says what a person pays a day', /a person a day/i.test(await page.locator('.tcard-each').textContent().catch(() => '')));
check('one primary on the page', await page.locator('.destp .btn-primary:visible').count() === 1);
check('the primary is Plan a trip here', /plan a trip here/i.test(await page.locator('.destp .btn-primary').first().textContent().catch(() => '')));
check('desktop: the price card is a side column', await page.locator('.pt-side .tcard').count() === 1);
check('desktop back names the list', (await page.locator('.destp .ipage-back').innerText()).trim().length > 0);

check('twelve month strip in When to go', await page.locator('.when-strip .when-m').count() === 12);
check('Where to stay lists stay kinds', await page.locator('.stay-kind').count() > 0);
check('Places like this lists places', await page.locator('.pt-sim').count() > 0);

let broken = await brokenImages(page);
check('no broken same-origin image on the page (desktop)', broken.length === 0, broken.slice(0, 3).join(' | '));
const pageText = await destp.textContent();
check('no em or en dash in the page text', !/[—–]/.test(pageText));
check('no middot separators in the page text', !/[·•]/.test(pageText));
const stale = pageText.match(/Set your dates|Priced for|figures here are measured|national basket|Tap a segment|\d+ ideas|\d+ tips/i);
check('no method sentence or count line left' + (stale ? ` [${pageText.slice(Math.max(0, stale.index - 30), stale.index + 40)}]` : ''),
  !/Set your dates|Priced for|figures here are measured|national basket|Tap a segment|\d+ ideas|\d+ tips/i.test(pageText));
await page.screenshot({ path: 'shots/destp-desktop.png', fullPage: false });

// The dates pill opens the shared editor over the page.
await page.locator('.tcard .dpc-pill').first().click();
await page.waitForTimeout(600);
check('the dates pill expands its editor', (await page.locator('.tcard .dpc-pill').first().getAttribute('aria-expanded')) === 'true');
await page.locator('.tcard .dpc-pill').first().click();

// ── The PDF download ─────────────────────────────────────────────────────
const dlPromise = page.waitForEvent('download', { timeout: 25000 }).catch(() => null);
await page.locator('.destp button[aria-label="Download PDF guide"]').click();
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
await openDest(page, 'FCO');
await page.waitForTimeout(1500);
const shortText = await page.locator('.pt-lead-first').textContent().catch(() => '');
check('Rome intro is short and names the place', /rome/i.test(shortText) && shortText.length < 460 && !/airport/i.test(shortText.slice(0, 60)), shortText.slice(0, 60));
const romeDay = await page.locator('.tcard-each .money').last().textContent().catch(() => '');
// Plan rule 2 (owner, 2026-10-24): the day figure is one amount, no tilde, no "est.".
check('Rome prints its day figure as a plain amount, no estimate mark',
  /€\s?\d/.test(romeDay) && !/~|\best\b/i.test(romeDay), romeDay);
check('Rome: sights are numbered spots', await page.locator('#pt-see .spot').count() >= 3);
const cdgText = await (async () => {
  await openDest(page, 'CDG');
  return page.locator('.pt-lead-first').textContent().catch(() => '');
})();
check('gateway record describes the city, not the airport',
  /paris/i.test(cdgText) && !/^\s*paris charles de gaulle airport/i.test(cdgText), cdgText.slice(0, 50));

// Opened from an Explore card, the page opens and back returns to the list.
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('a.card-open[href^="#dest="]', { timeout: 90000 });
await page.waitForTimeout(1500);
await page.locator('a.card-open[href^="#dest="]:visible').first().click();
await settle(page);
check('a card opens the place page', await page.locator('.destp .pt-title').isVisible());
await page.close();

// ── Phone ────────────────────────────────────────────────────────────────
const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
wire(phone);
await seed(phone);
await openDest(phone, 'gem:valbona');
await phone.waitForTimeout(1500);
check('phone page opens', await phone.locator('.destp').isVisible());
check('phone back names the list', (await phone.locator('.destp .ipage-back').innerText()).trim().length > 0);
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
check('phone: the foot bar carries the primary', await phone.locator('.pt-dock-cta').isVisible().catch(() => false));
await phone.screenshot({ path: 'shots/destp-phone.png' });
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
process.exit(fail ? 1 : 0);
