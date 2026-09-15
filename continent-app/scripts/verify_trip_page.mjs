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
//   days        each day is a one-line header plus chips; the prose is behind
//               "More about this day" and is still there when opened.
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

// The prose is folded, not deleted.
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
  ['the cost receipt', '#sec-cost .itin-cost li'],
  ['the reasons', '#sec-why .itin-why li'],
  ['the checks', '#sec-checks .itin-check-pass'],
  ['the gallery', '#sec-gallery .itin-shot'],
]) {
  const n = await page.locator(sel).count();
  check(`${label} survived the restructure`, n > 0, `${n}`);
}

await page.waitForTimeout(2000);
const broken = await page.evaluate(() => Array.from(document.querySelectorAll('.tpage img'))
  .filter((im) => im.complete && im.naturalWidth === 0 && !im.hidden)
  .map((im) => im.src.slice(0, 90)));
check('no broken images', broken.length === 0, broken.slice(0, 3).join(' '));

// House rule: no em dashes, no en dashes, no middot or bullet separators.
const pageText = await page.locator('.tpage').innerText();
const banned = [...new Set([...pageText].filter((c) => '—–·•'.includes(c)))];
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
    const jfolds = await jp.locator('.jpage .dsec').count();
    check('the journey page is built from folds', jfolds >= 5, `${jfolds} folds`);
    check('the week at a glance opens on arrival',
      await jp.locator('#sec-facts.is-open').count() === 1);
    check('the day-by-day opens on arrival',
      await jp.locator('#sec-itin.is-open').count() === 1);
    check('the data sheet is closed on arrival',
      await jp.locator('#sec-spec').count() === 0
        || await jp.locator('#sec-spec.is-open').count() === 0);
    check('the safety advisory is never folded',
      await jp.locator('.lpage-hazards .dsec').count() === 0);

    const jdays = await jp.locator('.jpage-day').count();
    check('journey days render', jdays > 0, `${jdays} days`);
    check('day prose is folded', await jp.locator('.jpage .tday-prose').count() === 0);
    const jmore = jp.locator('.jpage .tday-more').first();
    if (await jmore.count()) {
      const before = await jp.locator('.jpage-day-text').count();
      await jmore.click();
      await jp.waitForTimeout(400);
      const after = await jp.locator('.jpage-day-text').count();
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
