// Headless verify for the trip planner landing: the tab opens straight on the
// three "what are you looking for" options, with no locator map, no bottom
// sheet and no modal backdrop, and the app header still on screen.
//
//   node scripts/verify_trip_landing.mjs [url]   (default http://localhost:4173)
//
// Desktop 1440x900 plus a 390x844 phone pass. Screenshots to shots/trip-landing-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';
const browser = await chromium.launch();
const checks = [];
const errors = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const NOISE = /emrldtp|ERR_FAILED|config is not valid/;

async function openPlanner(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 120)); });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.mapGuideDismissed.v1', '1');
      localStorage.setItem('carta.welcomeSeen', '1');
    } catch { /* storage unavailable */ }
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);
  const guest = page.getByText(/continue without an account/i).first();
  if (await guest.isVisible().catch(() => false)) { await guest.click(); await page.waitForTimeout(1500); }
  for (const label of [/got it/i, /start here/i]) {
    const b = page.getByRole('button', { name: label }).first();
    if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(600); }
  }
  // Desktop reaches the planner from the header tabs; the phone bar has no
  // planner slot, it opens the plus chooser and picks "Trip planner" there.
  const top = page.locator('.header-tab, .app-nav-link, nav a, button', { hasText: /trip planner/i }).first();
  if (await top.isVisible().catch(() => false)) {
    await top.click();
  } else {
    await page.locator('.bottom-nav-plus').click();
    await page.waitForTimeout(600);
    await page.locator('.plan-chooser-item').first().click();
  }
  await page.waitForTimeout(2500);
  return page;
}

// ── Desktop ──
{
  const page = await openPlanner(1440, 900);
  check('planner opens on the guide', await page.locator('.trip-planner-blank').isVisible().catch(() => false));
  check('three options are on screen', await page.locator('.guide-path').count() === 3, String(await page.locator('.guide-path').count()));
  check('the question is the page title', /looking for/i.test(await page.locator('.guide-title').first().innerText().catch(() => '')));
  check('no locator map', await page.locator('.trip-map').count() === 0);
  check('no bottom sheet', await page.locator('.trip-sheet').count() === 0);
  check('no modal backdrop', await page.locator('.guide-overlay').count() === 0);
  check('inline shell renders', await page.locator('.guide-inline').isVisible().catch(() => false));
  check('app header still visible', await page.locator('.top-bar').isVisible().catch(() => false));
  check('no empty footer band', await page.locator('.guide-foot').count() === 0);
  check('no duplicate header strip', await page.locator('.guide-head').count() === 0);
  const box = await page.locator('.guide-path').first().boundingBox();
  const bar = await page.locator('.top-bar').boundingBox();
  check('cards sit below the header', box && bar && box.y > bar.y + bar.height - 2, JSON.stringify({ card: box?.y, bar: bar && bar.y + bar.height }));
  await page.screenshot({ path: 'shots/trip-landing-desktop.png' });

  // Picking an option moves on to the first question, with the step rail.
  await page.locator('.guide-path').first().click();
  await page.waitForTimeout(1500);
  check('picking a path advances', await page.locator('.wiz-steps').isVisible().catch(() => false));
  check('step view keeps the app header', await page.locator('.top-bar').isVisible().catch(() => false));
  check('step view has a back route', await page.locator('.guide-foot .guide-back').isVisible().catch(() => false));

  // ── Where step: photo cards by default, map one tap away ──
  // Step 1 is Trip basics now: pick a quick date range, then move on to Where.
  const days = page.locator('.cal-day:not(.disabled):not(.outside)');
  await days.nth(3).click();
  await days.nth(9).click();
  await page.waitForTimeout(300);
  await page.locator('.guide-next').click();
  await page.waitForTimeout(1500);
  check('where opens on photo cards', await page.locator('.guide-cgrid').isVisible().catch(() => false));
  check('no side-by-side map', await page.locator('.guide-split-side').count() === 0);
  check('no "tap countries" helper text', !/tap countries/i.test(await page.locator('.guide-canvas').innerText()));
  const cards = page.locator('.guide-ccard');
  check('every country is a card', await cards.count() > 30, String(await cards.count()));
  const withPhoto = await page.locator('.guide-ccard img.guide-ccard-img').count();
  check('cards carry photographs', withPhoto > 30, `${withPhoto} of ${await cards.count()}`);
  check('cards carry no blurb', await page.locator('.guide-ccard .guide-country-sub, .guide-ccard p').count() === 0);
  await page.locator('.guide-ccard').first().click();
  await page.waitForTimeout(400);
  check('picking a country marks the card', await page.locator('.guide-ccard.on').count() === 1);
  check('picking a country enables Next', await page.locator('.guide-next').isEnabled());
  await page.screenshot({ path: 'shots/trip-landing-where-list.png' });

  await page.locator('.guide-where-view button', { hasText: /^map$/i }).first().click();
  await page.waitForTimeout(2500);
  check('map view swaps in the map', await page.locator('.guide-where-map .cpm').isVisible().catch(() => false));
  check('map view hides the card grid', await page.locator('.guide-cgrid').count() === 0);
  const mapH = (await page.locator('.guide-where-map .cpm').boundingBox())?.height || 0;
  check('map is tall enough to read', mapH > 300, String(Math.round(mapH)));
  check('map view hides the list-only search', await page.locator('.guide-search').count() === 0);
  await page.screenshot({ path: 'shots/trip-landing-where-map.png' });
  await page.close();
}

// ── Phone ──
{
  const page = await openPlanner(390, 844);
  check('phone: three options', await page.locator('.guide-path').count() === 3);
  check('phone: no launcher card over a map', await page.locator('.trip-launcher').count() === 0);
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  check('phone: no horizontal scroll', scrollW <= 390, String(scrollW));
  await page.screenshot({ path: 'shots/trip-landing-phone.png' });
  await page.locator('.guide-path').first().click();
  await page.waitForTimeout(1500);
  const pdays = page.locator('.cal-day:not(.disabled):not(.outside)');
  await pdays.nth(3).click();
  await pdays.nth(9).click();
  await page.locator('.guide-next').click();
  await page.waitForTimeout(1500);
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
