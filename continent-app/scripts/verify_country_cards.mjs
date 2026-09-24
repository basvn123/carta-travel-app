// Headless verify for the country cards on the Where step (prompt T3).
//
//   node scripts/verify_country_cards.mjs [url]   (default http://localhost:4173)
//
// Two claims to keep honest, and neither of them is visible by eye.
//
// BYTES. A country card is ~170 css px on a phone and ~240 on the desktop
// grid, but the wire ships every hero at Wikimedia's 960px rendering. This
// run watches the network and fails if a phone ever downloads a 960 (or
// wider) for a card, because that is three to five times the pixels it draws,
// forty-three times over, on the slowest connections. Wikimedia only renders
// 250/330/500/960/1280/1920, so the widths a phone is allowed to ask for are
// the first three.
//
// COPY. The photograph carries the flag and the country's name and nothing
// else: no place count, no cost band, no price. That is easy to re-add by
// accident, so it is asserted rather than trusted.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] || 'http://localhost:4173/';
mkdirSync('shots', { recursive: true });

const checks = [];
const errors = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const NOISE = /emrldtp|ERR_FAILED|config is not valid|maplibre|WebGL|tile/i;

/** The width a Wikimedia thumb URL is rendered at, or null. */
const thumbWidth = (url) => {
  const m = /\/(\d+)px-/.exec(url);
  return m ? Number(m[1]) : null;
};

const browser = await chromium.launch();

/** Open the app as a guest, walk to the Where step, open the hand picker. */
async function openHandPicker(page, onGridOpen = () => {}) {
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 140));
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('carta.welcomeSeen', '1');
      localStorage.removeItem('carta.plannerDraft.v1');
    } catch { /* storage unavailable */ }
  });
  await page.route('**nominatim.openstreetmap.org/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([{
      display_name: 'Ghent, East Flanders, Belgium',
      name: 'Ghent',
      address: { country: 'Belgium', country_code: 'be' },
      lat: '51.05',
      lon: '3.72',
    }]),
  }));

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);
  const guest = page.getByText(/continue without an account/i).first();
  if (await guest.isVisible().catch(() => false)) { await guest.click(); await page.waitForTimeout(1200); }
  const got = page.getByRole('button', { name: /got it/i }).first();
  if (await got.isVisible().catch(() => false)) { await got.click().catch(() => {}); await page.waitForTimeout(400); }
  // Wait for the chrome to paint before asking which of the two navs is on
  // screen. Asking too early got `false` from BOTH and sent a 1280 desktop
  // down the phone branch, where it waited 30s for a bottom bar that a
  // desktop never renders.
  const top = page.locator('.header-nav-item', { hasText: /trip planner/i }).first();
  const fab = page.locator('.bottom-nav-plus');
  await Promise.race([
    top.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {}),
    fab.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {}),
  ]);
  if (await top.isVisible().catch(() => false)) await top.click();
  else {
    await fab.click();
    await page.waitForTimeout(500);
    await page.locator('.plan-chooser-item').first().click();
  }
  await page.waitForTimeout(2000);

  const next = async () => {
    await page.locator('.guide-next').first().click();
    await page.waitForTimeout(1100);
  };

  await next();                                   // Booked -> From
  await page.locator('.guide-origin-home-card input.guide-search').fill('Ghent');
  await page.locator('.guide-origin-home-card .guide-carfrom-search').click();
  await page.waitForTimeout(600);
  await page.locator('.guide-origin-home-card .guide-city-btn').first().click();
  await page.waitForTimeout(800);
  await next();                                   // From -> When
  const days = page.locator('.cal-day:not(.disabled):not(.outside)');
  await days.nth(3).click();
  await days.nth(10).click();
  await page.waitForTimeout(300);
  await next();                                   // When -> Where
  await page.waitForTimeout(1200);

  // The second tab is the hand picker, which is where the country grid lives.
  // From here on, every Wikimedia request is a country card's.
  onGridOpen();
  await page.locator('.guide-wtabs [role="tab"]').nth(1).click();
  await page.waitForTimeout(1200);
  // Let the lazy images below the fold actually request something.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2500);
}

/**
 * One viewport: walk to the grid recording every Wikimedia thumb fetched,
 * then assert on the card markup and the widths that came down the wire.
 */
async function run(name, viewport, maxAllowedWidth) {
  const page = await browser.newPage({ viewport });
  // Only the grid's own traffic counts. The landing page ahead of it loads its
  // own heroes at 960, and attributing those to these cards would make the
  // check fail on something it does not govern.
  const widths = [];
  let counting = false;
  page.on('request', (r) => {
    const u = r.url();
    if (!counting || !u.includes('upload.wikimedia.org')) return;
    const w = thumbWidth(u);
    if (w) widths.push(w);
  });
  await openHandPicker(page, () => { counting = true; });

  const cards = page.locator('.guide-ccard');
  const n = await cards.count();
  check(`${name}: the grid renders country cards`, n >= 20, `${n} cards`);

  // ---- the photo is asked for at a card's size, not the wire's 960 ----
  //
  // currentSrc, not the request log: the Destinations tab stays mounted behind
  // .tab-keep-hidden and keeps loading its own 960px country strips while the
  // planner is open, so a count of Wikimedia requests would blame these cards
  // for another tab's bytes. What each card RESOLVED to is exact.
  const chosen = await page.evaluate(() => [...document.querySelectorAll('img.guide-ccard-img')]
    .map((el) => { const m = /\/(\d+)px-/.exec(el.currentSrc || el.src); return m ? Number(m[1]) : null; })
    .filter((w) => w));
  const tooBig = chosen.filter((w) => w > maxAllowedWidth);
  check(`${name}: no card photo wider than ${maxAllowedWidth}px`, chosen.length > 0 && tooBig.length === 0,
    `${tooBig.length} over; widths chosen: ${[...new Set(chosen)].sort((a, b) => a - b).join(', ') || 'none'}`);
  check(`${name}: photos actually loaded`, widths.length >= 10, `${widths.length} thumbs seen`);

  // Every card image must carry a srcset and a sizes, or the browser had no
  // choice to make and the width above was luck.
  const imgs = await page.evaluate(() => [...document.querySelectorAll('img.guide-ccard-img')]
    .map((el) => ({ srcset: el.srcset || '', sizes: el.sizes || '', w: el.getAttribute('width') })));
  check(`${name}: every card photo has a srcset`,
    imgs.length > 0 && imgs.every((i) => i.srcset.includes('330w') && i.srcset.includes('500w')),
    `${imgs.length} imgs`);
  check(`${name}: every card photo has sizes`, imgs.every((i) => i.sizes.length > 0));
  check(`${name}: every card photo is dimensioned`, imgs.every((i) => i.w === '4'));

  // ---- nothing on the photo but the flag and the name ----
  check(`${name}: the place count is gone`, await page.locator('.guide-ccard-n').count() === 0);
  check(`${name}: the cost band is gone`, await page.locator('.guide-ccard-band').count() === 0);
  const text = (await cards.first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  check(`${name}: no price on a card`, !/[€$£]|\d+\s*(a day|per day)/i.test(text), text.slice(0, 80));
  check(`${name}: no "N places" on a card`, !/\d+\s*places/i.test(text), text.slice(0, 80));

  // ---- the whole card is the selection target, and picking shows a tick ----
  const pick = page.locator('.guide-ccard-pick').first();
  const box = await pick.boundingBox();
  const cardBox = await cards.first().boundingBox();
  // The button sits inside the card's 1px border, so it is 2px short of the
  // border box on each axis. Anything more than that is a card with dead edges.
  check(`${name}: the whole card is the tap target`,
    !!box && !!cardBox && cardBox.width - box.width <= 2 && cardBox.height - box.height <= 2,
    box && cardBox ? `card ${Math.round(cardBox.width)}x${Math.round(cardBox.height)}, button ${Math.round(box.width)}x${Math.round(box.height)}` : 'no box');
  await pick.click();
  await page.waitForTimeout(400);
  check(`${name}: picking shows a check badge`, await page.locator('.guide-ccard.on .guide-ccard-check').count() >= 1);
  await pick.click();
  await page.waitForTimeout(300);

  // ---- no two cards show the same photograph ----
  const srcs = await page.evaluate(() => [...document.querySelectorAll('img.guide-ccard-img')]
    .map((el) => (el.currentSrc || el.src).replace(/\/\d+px-/, '/px-')));
  check(`${name}: no country reuses another's photo`,
    new Set(srcs).size === srcs.length, `${srcs.length - new Set(srcs).size} repeats`);

  if (viewport.width <= 768) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${name}: no sideways scroll`, overflow <= 1, `${overflow}px`);
    // Two columns, not "as many as fit": a 120px card is not a photograph.
    const cols = await page.evaluate(() => {
      const g = document.querySelector('.guide-cgrid');
      return g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : 0;
    });
    check(`${name}: two columns`, cols === 2, `${cols} columns`);
  }

  await page.screenshot({ path: `shots/ccards-${viewport.width}.png`, fullPage: false });
  await page.close();
}

// A 375px phone draws a card at ~170 css px, so at 2x it wants 330 and never
// more. A 1280 desktop draws ~240, so 500 is the ceiling.
await run('phone', { width: 375, height: 812 }, 500);
await run('desktop', { width: 1280, height: 900 }, 500);

await browser.close();

const bad = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
if (errors.length) {
  console.log('\npage errors:');
  for (const e of [...new Set(errors)].slice(0, 10)) console.log('  ' + e);
}
console.log(`\n${checks.length - bad.length}/${checks.length} checks passed`);
process.exit(bad.length || errors.length ? 1 : 0);
