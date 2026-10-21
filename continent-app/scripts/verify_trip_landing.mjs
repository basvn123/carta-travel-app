// Headless verify for the trip planner landing: the tab opens straight on the
// first question of the one flow (what is already booked, where from, when,
// who), with no locator map, no bottom sheet and no modal backdrop, and the
// app header still on screen.
//
//   node scripts/verify_trip_landing.mjs [url]   (default http://localhost:$CARTA_PORT or 4173)
//
// T502: the booked question is .wbook-tile tiles (plus "Nothing yet") on the
// Trip basics step since T500, and the wizard has six steps.
const BOOKED = '.ui-tile-group:has(.wbook-tile) .ui-tile';
//
// Desktop 1440x900 plus a 390x844 phone pass. Screenshots to shots/trip-landing-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;
const browser = await chromium.launch();
const checks = [];
const errors = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const NOISE = /ERR_FAILED|config is not valid/;

async function openPlanner(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 120)); });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('continent.mapGuideDismissed.v1', '1');
      localStorage.setItem('carta.welcomeSeen', '1');
    } catch { /* storage unavailable */ }
  });
  // T502: Plan's Trip door is its own address (?tab=plan&mode=trip, T496-T501).
  await page.goto(URL + '?tab=plan&mode=trip', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);
  const guest = page.getByText(/continue without an account/i).first();
  if (await guest.isVisible().catch(() => false)) { await guest.click(); await page.waitForTimeout(1500); }
  for (const label of [/got it/i, /start here/i]) {
    const b = page.getByRole('button', { name: label }).first();
    if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(600); }
  }
  await page.waitForTimeout(2500);
  return page;
}

// ── Desktop ──
{
  const page = await openPlanner(1440, 900);
  check('planner opens on the guide', await page.locator('.trip-planner-blank').isVisible().catch(() => false));
  check('it opens on step one, not a chooser', await page.locator('.guide-path').count() === 0
    && (await page.locator('.guide-title').first().innerText().catch(() => '')).length > 0); // T408: the title is the step's name now, not "Set up your trip"
  check('the first question is what is already booked',
    await page.locator(BOOKED).count() === 3, String(await page.locator(BOOKED).count()));
  check('no locator map', await page.locator('.trip-map').count() === 0);
  check('no bottom sheet', await page.locator('.trip-sheet').count() === 0);
  check('no modal backdrop', await page.locator('.guide-overlay').count() === 0);
  check('inline shell renders', await page.locator('.guide-inline').isVisible().catch(() => false));
  check('app header still visible', await page.locator('.top-bar').isVisible().catch(() => false));
  check('the step rail is up from the first screen', await page.locator('.wiz-steps').isVisible().catch(() => false));
  check('six steps when nothing is booked', await page.locator('.wiz-step').count() === 6, // T502: six since T500 (Trip basics, When, Where, Trips, Getting there, Review)
    String(await page.locator('.wiz-step').count()));
  check('no back button on the first screen', await page.locator('.guide-foot-actions .guide-back').count() === 0);
  const box = await page.locator(BOOKED).first().boundingBox();
  const bar = await page.locator('.top-bar').boundingBox();
  check('cards sit below the header', box && bar && box.y > bar.y + bar.height - 2, JSON.stringify({ card: box?.y, bar: bar && bar.y + bar.height }));
  await page.screenshot({ path: 'shots/trip-landing-desktop.png' });

  // Booking the beds drops the country step: three steps, and the third
  // screen is the traveller's own list.
  await page.locator('.wbook-tile', { hasText: /places to sleep/i }).click();
  await page.waitForTimeout(500);
  check('booked stays drop a step', await page.locator('.wiz-step').count() === 5, // T502: six minus Where and Trips, plus Your stays
    String(await page.locator('.wiz-step').count()));
  await page.locator('.wbook-tile', { hasText: /places to sleep/i }).click();
  await page.waitForTimeout(500);
  check('unticking brings it back', await page.locator('.wiz-step').count() === 6);

  // ── Where step: photo cards by default, map one tap away ──
  // T502: Trip basics (booked + who) is one step since T500; step over it.
  await page.locator('.guide-next').first().click();
  await page.waitForTimeout(800);
  const days = page.locator('.cal-day:not(.disabled):not(.outside)');
  await days.nth(3).click();
  await days.nth(9).click();
  await page.waitForTimeout(300);
  await page.locator('.guide-next').click();
  await page.waitForTimeout(1500);
  // T408: Where opens on the quiz and match cards since T383; the country
  // grid is the second tab, so the old "photo cards by default" checks now
  // run on that tab.
  await page.locator('.guide-wtabs [role="tab"]').nth(1).click().catch(() => {});
  await page.waitForTimeout(1200);
  check('where opens on photo cards', await page.locator('.guide-cgrid').isVisible().catch(() => false));
  check('no side-by-side map', await page.locator('.guide-split-side').count() === 0);
  check('no "tap countries" helper text', !/tap countries/i.test(await page.locator('.guide-canvas').innerText()));
  const cards = page.locator('.guide-ccard');
  check('every country is a card', await cards.count() > 30, String(await cards.count()));
  const withPhoto = await page.locator('.guide-ccard img.guide-ccard-img').count();
  check('cards carry photographs', withPhoto > 30, `${withPhoto} of ${await cards.count()}`);
  check('cards carry no blurb', await page.locator('.guide-ccard .guide-country-sub').count() === 0);
  await page.locator('.guide-ccard-pick').first().click();
  await page.waitForTimeout(400);
  check('picking a country marks the card', await page.locator('.guide-ccard.on').count() === 1);
  check('picking a country enables Next', await page.locator('.guide-next').isEnabled());
  await page.screenshot({ path: 'shots/trip-landing-where-list.png' });

  // T502: on a desktop the map stands in the wizard's aside beside the cards
  // since T500, so the Grid | Map toggle (and its swap checks) is phone-only.
  await page.waitForTimeout(1500);
  check('the aside map stands beside the cards', await page.locator('.wiz-aside-map .cpm').isVisible().catch(() => false)
    && await page.locator('.guide-cgrid').isVisible());
  const mapH = (await page.locator('.wiz-aside-map .cpm').boundingBox())?.height || 0;
  check('map is tall enough to read', mapH > 300, String(Math.round(mapH)));
  await page.screenshot({ path: 'shots/trip-landing-where-map.png' });
  await page.close();
}

// ── Phone ──
{
  const page = await openPlanner(390, 844);
  check('phone: opens on the first question', await page.locator(BOOKED).count() === 3);
  check('phone: no launcher card over a map', await page.locator('.trip-launcher').count() === 0);
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  check('phone: no horizontal scroll', scrollW <= 390, String(scrollW));
  await page.screenshot({ path: 'shots/trip-landing-phone.png' });
  await page.locator('.guide-next').first().click();
  await page.waitForTimeout(800);
  const pdays = page.locator('.cal-day:not(.disabled):not(.outside)');
  await pdays.nth(3).click();
  await pdays.nth(9).click();
  await page.locator('.guide-next').click();
  await page.waitForTimeout(1500);
  await page.locator('.guide-wtabs [role="tab"]').nth(1).click().catch(() => {}); // T408: grid is the second tab
  await page.waitForTimeout(1000);
  check('phone: where opens on photo cards', await page.locator('.guide-cgrid').isVisible().catch(() => false));
  const phoneScroll = await page.evaluate(() => document.documentElement.scrollWidth);
  check('phone: where step has no horizontal scroll', phoneScroll <= 390, String(phoneScroll));
  await page.screenshot({ path: 'shots/trip-landing-where-phone.png' });
  await page.close();
}

await browser.close();
const pass = checks.filter((c) => c.ok).length;
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
console.log(`\n${pass}/${checks.length} checks passed`);
if (errors.length) console.log('errors:\n' + [...new Set(errors)].slice(0, 8).join('\n'));
process.exit(pass === checks.length && errors.length === 0 ? 0 : 1);
