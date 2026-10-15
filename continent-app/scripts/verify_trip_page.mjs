// Headless verify for the folded trip page (browse/TripPage.jsx) and the two
// blocks P2 added to it: the practical section (browse/TripPractical.jsx) and
// the per-day photo strip (browse/TripDayPhotos.jsx).
//
//   npm run build, then: node scripts/verify_trip_page.mjs
//
// Spawns its own vite preview (dist/, port 4209). The contract:
//
//   structure   #itin=<id> opens the page; every section is a <Fold>; the
//               practical sections (route, practical, days, cost) are open on
//               arrival and the narrative ones (why, checks, gallery) are
//               closed; a closed fold still carries its own summary.
//   nothing lost  opening every fold restores every block the flat page had:
//               the route list, the legs, the cost receipt, the reasons, the
//               checks and the gallery.
//   head        (T387) the photograph carries no text, no scrim and no
//               credit pill; the name sits in a caption band under it, and
//               no dot separator is left on the page.
//   days        each day is a one-line header plus chips, one card per day in
//               the shared day track (T387); the prose is behind "More about
//               this day", not mounted while closed, and back when opened.
//   cost        (T387) the cost fold is a receipt: every estimated figure
//               carries the tilde and "est.", no line is a flight, and the
//               fact row's day figure is the receipt's day line.
//   photos      each day carries a photo strip, every picture of it loaded,
//               every one is captioned, and each goes through srcset rather
//               than a bare src.
//   practical   parking, drives, beds and airports render as rows, each group
//               names its source, and no row says "unknown".
//   map         maplibre does NOT mount while the route fold is closed, and
//               does mount once it is opened.
//   phone       375px: nothing scrolls horizontally.
//
// Screenshots to shots/trip-*.png.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4209;
const BASE = `http://127.0.0.1:${PORT}/`;
mkdirSync('shots', { recursive: true });

// A chain trip with two stops, real legs, day trips and a full gallery.
const TRIP = process.env.TRIP_ID || 'at-salzburg-vienna-chain-6d';

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
  } catch { /* storage unavailable */ }
});
const wire = (page) => {
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 140));
  });
};

// ── Desktop ──────────────────────────────────────────────────────────────
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
wire(page);
await seed(page);
await page.goto(`${BASE}#itin=${TRIP}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(5000);

check('#itin= opens the trip page', await page.locator('.tpage.itin-page').isVisible());

const folds = await page.locator('.tpage .dsec').count();
check('the page is built from folds', folds >= 5, `${folds} folds`);

for (const id of ['route', 'practical', 'days', 'cost']) {
  check(`#sec-${id} is open on arrival`, await page.locator(`#sec-${id}.is-open`).count() === 1);
}
for (const id of ['why', 'checks', 'gallery']) {
  const present = await page.locator(`#sec-${id}`).count();
  if (!present) { check(`#sec-${id} present`, false, 'section missing'); continue; }
  check(`#sec-${id} is closed on arrival`, await page.locator(`#sec-${id}.is-open`).count() === 0);
}
check('a closed fold still carries its summary',
  await page.locator('.tpage .dsec:not(.is-open) .dsec-summary').count() > 0);

// The head (T387, brief V3.11 and the caption band rule): the old hero wrote
// the themes, the title, the countries and the score over a gradient scrim on
// the photograph. These assertions are new, for the new head: nothing is
// written on the photo, and the title is the h1 in the band under it.
const photoText = await page.locator('.itin-photohero').innerText().catch(() => 'missing');
check('no text on the photograph', photoText.trim() === '', JSON.stringify(photoText.slice(0, 40)));
check('no scrim over the photograph',
  await page.locator('.itin-photohero-scrim, .itin-photohero-text').count() === 0);
check('the caption band sits flush under the photo', await page.evaluate(() => {
  const photo = document.querySelector('.itin-photohero');
  const band = photo && photo.nextElementSibling;
  if (!band || !band.classList.contains('itin-capband')) return false;
  return Math.abs(band.getBoundingClientRect().top - photo.getBoundingClientRect().bottom) <= 1;
}));
check('the page title is the h1 in the band',
  await page.locator('.itin-capband h1').count() === 1);
check('no dot separators left on the page', await page.locator('.tpage .itin-dot').count() === 0);

// The map must not cost a WebGL context while the fold above it is closed.
await page.locator('#sec-route .dsec-toggle').click();
await page.waitForTimeout(600);
check('route fold closes', await page.locator('#sec-route.is-open').count() === 0);
check('maplibre unmounts with the fold', await page.locator('#sec-route canvas').count() === 0);
await page.locator('#sec-route .dsec-toggle').click();
await page.waitForTimeout(3000);
check('maplibre mounts when the route is opened', await page.locator('#sec-route canvas').count() > 0);

// Days: header, chips, photos, folded prose.
const days = await page.locator('.tday').count();
check('every day renders', days >= 4, `${days} days`);
// New with T387: the days run in the shared day track (DayTrack.jsx), one
// card per day, as on the journey page.
check('the days run in the day track',
  await page.locator('#sec-days .dtrack > .tday').count() === days,
  `${await page.locator('#sec-days .dtrack > .tday').count()} of ${days} in the track`);
check('a day has a one-line header', await page.locator('.tday .tday-title').count() === days);
check('days carry fact chips', await page.locator('.tday-chips .tday-chip').count() > 0);

const strips = await page.locator('.tday-shots').count();
check('days carry a photo strip', strips > 0, `${strips} of ${days} days`);
const shots = await page.locator('.tday-shot-img').count();
check('photo strips hold photographs', shots > 0, `${shots} photos`);
check('every day photo is captioned',
  await page.locator('.tday-shot-cap').count() === shots);
const bareSrc = await page.evaluate(() => Array.from(document.querySelectorAll('.tday-shot-img'))
  .filter((im) => !im.srcset).length);
check('day photos go through srcset', bareSrc === 0, `${bareSrc} bare`);
const genericCap = await page.evaluate(() => Array.from(document.querySelectorAll('.tday-shot-cap'))
  .map((el) => el.textContent.trim())
  .filter((tx) => !tx || /^day \d/i.test(tx)).length);
check('no generic day captions', genericCap === 0, `${genericCap}`);

// The prose is folded, not deleted. Before T387 these two checks failed:
// TripPage kept every day's .tday-prose mounted inside a CSS-collapsed panel
// (visibility hidden, a 0fr grid row), so the count was never 0. The page now
// mounts the prose only while its disclosure is open; the selectors are
// unchanged.
const moreBtns = await page.locator('.tday-more').count();
check('days offer "More about this day"', moreBtns > 0, `${moreBtns}`);
check('day prose is closed by default', await page.locator('.tday-prose').count() === 0);
await page.locator('.tday-more').first().click();
await page.waitForTimeout(400);
check('opening it restores the prose', await page.locator('.tday-prose').count() === 1);
check('the sights come back with it',
  await page.locator('.tday-prose .itin-sight, .tday-prose .itin-day-note, .tday-prose .itin-day-leg').count() > 0);

// Practical.
await page.waitForTimeout(2500); // the per-stop dossiers
const pracGroups = await page.locator('#sec-practical .tprac-group').count();
check('practical renders groups', pracGroups > 0, `${pracGroups} groups`);
check('practical rows render', await page.locator('#sec-practical .tprac-row').count() > 0);
check('every practical group names its source',
  await page.locator('#sec-practical .tprac-source').count() === pracGroups);
const pracText = await page.locator('#sec-practical').textContent().catch(() => '');
check('practical never says unknown', !/unknown/i.test(pracText));
check('parking rows link to directions',
  await page.locator('#sec-practical .tprac-row.is-link a[href*="google.com/maps"]').count() > 0);
check('practical sits above the day-by-day', await page.evaluate(() => {
  const p = document.querySelector('#sec-practical');
  const d = document.querySelector('#sec-days');
  if (!p || !d) return false;
  return p.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING;
}) !== 0);

// Nothing lost: open everything and confirm each old block is back.
for (const id of ['why', 'checks', 'gallery', 'outs']) {
  const tog = page.locator(`#sec-${id} .dsec-toggle`);
  if (await tog.count()) { await tog.click(); await page.waitForTimeout(250); }
}
await page.waitForTimeout(800);
for (const [label, sel] of [
  ['the route list', '#sec-route .itin-stop'],
  ['the legs', '#sec-route .itin-leg'],
  // Same selector after T387: the receipt keeps .itin-cost and its li lines.
  ['the cost receipt', '#sec-cost .itin-cost li'],
  ['the reasons', '#sec-why .itin-why li'],
  ['the checks', '#sec-checks .itin-check-pass'],
  ['the gallery', '#sec-gallery .itin-shot'],
]) {
  const n = await page.locator(sel).count();
  check(`${label} survived the restructure`, n > 0, `${n}`);
}

// The receipt (T387, brief row C10): every figure that is an estimate says so
// with the tilde and "est." in words, no line is a flight, and the fact row's
// day figure is the receipt's own day line (one day figure per page).
const receiptFigs = await page.locator('#sec-cost .itin-cost li b').allInnerTexts();
const unmarked = receiptFigs.filter((tx) => !/^~ .+ est\.$/.test(tx.trim()));
check('every receipt figure carries the tilde and "est."', receiptFigs.length > 0 && unmarked.length === 0,
  unmarked.slice(0, 3).join(' | ') || `${receiptFigs.length} figures`);
const receiptText = await page.locator('#sec-cost .itin-receipt').innerText().catch(() => '');
check('no flight in the receipt', receiptText !== '' && !/flight|fly|plane/i.test(receiptText));
check('the receipt has a total over a 2px rule',
  await page.locator('#sec-cost .itin-cost-sum').count() === 1);
const dayLine = (await page.locator('#sec-cost .itin-cost-day b').innerText().catch(() => '')).trim();
const factDay = await page.evaluate(() => {
  const vals = Array.from(document.querySelectorAll('.itin-facts .tpage-fact-val'));
  const hit = vals.find((el) => /~/.test(el.textContent));
  return hit ? hit.textContent.trim() : '';
});
check('the fact row reads the day line of the receipt', dayLine !== '' && dayLine === factDay,
  `${factDay} vs ${dayLine}`);

await page.waitForTimeout(2000);
const broken = await page.evaluate(() => Array.from(document.querySelectorAll('.tpage img'))
  .filter((im) => im.complete && im.naturalWidth === 0 && !im.hidden)
  .map((im) => im.src.slice(0, 90)));
check('no broken images', broken.length === 0, broken.slice(0, 3).join(' '));

// House rule: no em dashes, no en dashes, no middot or bullet separators.
// The four characters are written as escapes (T387) so this file holds none
// of them itself; the set is the same as before.
const pageText = await page.locator('.tpage').innerText();
const banned = [...new Set([...pageText].filter((c) => '\u2014\u2013\u00b7\u2022'.includes(c)))];
check('no em dash, en dash, middot or bullet', banned.length === 0,
  banned.map((c) => 'U+' + c.charCodeAt(0).toString(16)).join(' '));

await page.screenshot({ path: 'shots/trip-desktop.png', fullPage: false });

// ── Phone ────────────────────────────────────────────────────────────────
const phone = await browser.newPage({ viewport: { width: 375, height: 780 }, isMobile: true, hasTouch: true });
wire(phone);
await seed(phone);
await phone.goto(`${BASE}#itin=${TRIP}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await phone.waitForTimeout(6000);

check('phone opens the trip page', await phone.locator('.tpage.itin-page').isVisible());
const overflow = await phone.evaluate(() => {
  const el = document.querySelector('.tpage-scroll') || document.scrollingElement;
  return el.scrollWidth - el.clientWidth;
});
check('nothing scrolls horizontally at 375px', overflow <= 1, `${overflow}px`);
const chipsWrap = await phone.locator('.tday-chip').count();
check('day chips render on a phone', chipsWrap > 0, `${chipsWrap}`);
await phone.screenshot({ path: 'shots/trip-phone.png', fullPage: false });
await phone.evaluate(() => document.querySelector('#sec-days')?.scrollIntoView());
await phone.waitForTimeout(1200);
await phone.screenshot({ path: 'shots/trip-phone-days.png', fullPage: false });

// ── Journey page (the same fold restructure, P2.2) ───────────────────────
const jp = await browser.newPage({ viewport: { width: 1440, height: 950 } });
wire(jp);
await seed(jp);
await jp.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
await jp.waitForTimeout(5000);

// Journeys have no deep link, so drive the Trips tab: a style card, then the
// first journey in it.
const style = jp.locator('.jstyle-card').first();
if (await style.count()) {
  await style.click();
  await jp.waitForTimeout(2000);
  const card = jp.locator('.jcard').first();
  if (await card.count()) {
    await card.click();
    await jp.waitForTimeout(4000);

    check('journey page opens', await jp.locator('.jpage').isVisible());
    // T431 (owner, 2026-10-15): the trip page is rebuilt on the item pages'
    // system. The folds and the data sheet are gone; the order is gallery,
    // head, fact band, why, the price card in the side column, fit, the
    // alternatives, the week, getting there and before you go.
    check('the trip page opens on its gallery and head',
      await jp.locator('.jpage .ipage-gallery').count() === 1 && await jp.locator('.jpage .ipage-head h1').count() === 1);
    check('the price card sits in the sticky side column',
      await jp.locator('.jpage .ipage-side #sec-budget').count() === 1);
    check('no suitability strip and no data sheet',
      await jp.locator('.jpage .dsk-strip, .jpage #sec-spec, .jpage .dsheet-row').count() === 0);
    check('the risks are never folded',
      await jp.locator('.jpage .dsec').count() === 0);

    const jdays = await jp.locator('.jpage .tday').count();
    check('journey days render', jdays > 0, `${jdays} days`);
    check('day prose is folded', await jp.locator('.jpage .tday-prose').count() === 0);
    const jmore = jp.locator('.jpage .tday-more').first();
    if (await jmore.count()) {
      const before = await jp.locator('.jpage .tday-text').count();
      await jmore.click();
      await jp.waitForTimeout(400);
      const after = await jp.locator('.jpage .tday-text').count();
      check('opening a day restores its authored prose', after > before, `${before} -> ${after}`);
    }
    await jp.screenshot({ path: 'shots/journey-desktop.png' });
  } else {
    check('a journey card was reachable', false, 'no .jcard found');
  }
} else {
  check('a journey style card was reachable', false, 'no .jstyle-card found');
}

await browser.close();
if (server) server.kill();

// ── Report ───────────────────────────────────────────────────────────────
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
}
if (errors.length) {
  console.log('\npage errors:');
  for (const e of [...new Set(errors)].slice(0, 12)) console.log('  ' + e);
}
console.log(`\n${checks.length - bad}/${checks.length} checks passed`);
process.exit(bad || errors.length ? 1 : 0);
