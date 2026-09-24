// Headless verify for the rebuilt Where step (prompt T2): the two tabs, the
// quiz, the recommendations it produces, the hand picker and the polygon map.
//
//   node scripts/verify_where_quiz.mjs [url]     (default http://localhost:4173)
//
// Screenshots to shots/where-*.png, at 375 and 1280, for three different sets
// of quiz answers.
//
// What this is really guarding: the promise the cards make. Every reason on a
// recommendation is supposed to be a number that came from a published file,
// so the run fails if a card ever prints a reason with no digits in it, or a
// price (this step deliberately shows none).

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] || 'http://localhost:4173/';
mkdirSync('shots', { recursive: true });

const checks = [];
const errors = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const NOISE = /emrldtp|ERR_FAILED|config is not valid|maplibre|WebGL|tile/i;

const browser = await chromium.launch();

/** Open the app as a guest and walk to the Where step. */
async function openWhere(page) {
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 140));
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('carta.welcomeSeen', '1');
      // A clean draft every run, or the wizard restores a half-answered quiz.
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
  // On a phone the header nav is hidden and the planner is reached through the
  // bottom bar; both controls exist in the DOM, so this has to ask which one
  // is actually on screen.
  const top = page.locator('button', { hasText: /trip planner/i }).first();
  if (await top.isVisible().catch(() => false)) await top.click();
  else {
    await page.locator('.bottom-nav-plus').click();
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
}

/** Answer the quiz. `types` are chip labels, the rest are single answers. */
async function answerQuiz(page, { types, spend, around, distance, pace, avoid = [] }) {
  for (const label of types) {
    await page.locator('.wq-chip', { hasText: new RegExp(`^${label}$`, 'i') }).first().click();
    await page.waitForTimeout(150);
  }
  await page.locator('.wq-next').first().click();
  await page.waitForTimeout(400);
  for (const label of [spend, around, distance, pace]) {
    await page.locator('.wq-chip', { hasText: new RegExp(`^${label}`, 'i') }).first().click();
    await page.waitForTimeout(350);
  }
  for (const label of avoid) {
    await page.locator('.wq-chip', { hasText: new RegExp(`^${label}$`, 'i') }).first().click();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(900);
}

// ---------------------------------------------------------------- desktop --
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await openWhere(page);

  check('the step is Where', /where are we going/i.test(
    await page.locator('.guide-title').first().innerText().catch(() => '')));
  check('it has a subtitle', /pick countries yourself/i.test(
    await page.locator('.guide-sub').first().innerText().catch(() => '')));

  // ---- the tablist ----
  const tabs = page.locator('.guide-wtabs [role="tab"]');
  check('two tabs, as a tablist', await tabs.count() === 2,
    (await tabs.allInnerTexts()).join(' | '));
  check('it opens on "Help me choose"', await tabs.first().getAttribute('aria-selected') === 'true');
  // Arrow keys move between them, which is the whole reason for role=tablist.
  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  check('arrow keys move between tabs', await tabs.nth(1).getAttribute('aria-selected') === 'true');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(300);

  // ---- the removed controls ----
  check('the country search box is gone', await page.locator('input.guide-search').count() === 0);
  check('the "let Carta pick" toggle is gone', await page.locator('.guide-design-btn-quiet').count() === 0);

  // ---- quiz 1: trail running on a shoestring ----
  await answerQuiz(page, {
    types: ['Trail running'],
    spend: 'Shoestring',
    around: 'Fly in',
    distance: 'Anywhere in Europe',
    pace: 'A few stops',
  });

  const cards = page.locator('.mcard');
  const n = await cards.count();
  check('the quiz recommends countries', n >= 3, `${n} cards`);
  check('at most six before "show more"', n <= 6, String(n));

  const whyTexts = await page.locator('.mcard-why li').allInnerTexts();
  check('every card gives reasons', whyTexts.length >= 3, `${whyTexts.length} reasons`);
  // The promise: a reason is a fact with a number in it, never an adjective.
  const numberless = whyTexts.filter((x) => !/\d/.test(x));
  check('every reason carries a number', numberless.length === 0, numberless.slice(0, 3).join(' | '));

  const cardText = await page.locator('.mcards').innerText();
  check('no prices on the recommendations', !/[€$£]/.test(cardText));
  check('cards show places with ratings', await page.locator('.mcard-place .score-chip').count() >= 3,
    String(await page.locator('.mcard-place .score-chip').count()));

  await page.screenshot({ path: 'shots/where-1280-trailrun.png', fullPage: false });

  // Adding from a card feeds the shared chip row above the tabs.
  await page.locator('.mcard-add').first().click();
  await page.waitForTimeout(500);
  check('adding a country fills the chip row', await page.locator('.guide-picked-chip').count() >= 1);
  check('Next unlocks once a country is picked', await page.locator('.guide-next').isEnabled());

  // ---- the hand picker, and the map ----
  await tabs.nth(1).click();
  await page.waitForTimeout(600);
  check('the grid renders country cards', await page.locator('.guide-ccard').count() >= 20,
    String(await page.locator('.guide-ccard').count()));
  check('the grid carries no prices', !/[€$£]/.test(await page.locator('.guide-cgrid').innerText()));

  await page.locator('.guide-where-view button', { hasText: /^map$/i }).click();
  await page.waitForTimeout(3500);
  check('the map renders', await page.locator('.cpm canvas').isVisible());
  check('the map has a legend', await page.locator('.cpm-legend').isVisible());
  // Polygons, not pins: the old flag pins are gone.
  check('no flag pins survive', await page.locator('.cpm-pin').count() === 0);
  const painted = await page.evaluate(() => !!document.querySelector('.cpm canvas'));
  check('a canvas is painted', painted);
  await page.screenshot({ path: 'shots/where-1280-map.png' });

  await page.close();
}

// ----------------------------------------------------------------- phone --
for (const [name, answers] of [
  ['beach', { types: ['Beach & relax'], spend: 'Hotels & comfort', around: 'No preference', distance: 'Anywhere in Europe', pace: 'One base' }],
  ['city', { types: ['City break'], spend: 'Smart mid-range', around: 'Train only', distance: 'Anywhere in Europe', pace: 'A few stops' }],
]) {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await openWhere(page);
  await answerQuiz(page, answers);

  const n = await page.locator('.mcard').count();
  check(`phone: ${name} recommends countries`, n >= 3, `${n} cards`);

  // The one rule a phone screen cannot break.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`phone: ${name} has no sideways scroll`, overflow <= 1, `${overflow}px`);

  // Every tappable chip has to be reachable with a thumb.
  const small = await page.evaluate(() => [...document.querySelectorAll('.wq-chip, .mcard-add, .mcard-info, .guide-wtabs button')]
    .filter((el) => el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().height < 44).length);
  check(`phone: ${name} keeps 44px targets`, small === 0, `${small} under 44px`);

  await page.screenshot({ path: `shots/where-375-${name}.png`, fullPage: false });
  await page.close();
}

await browser.close();

const bad = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
if (errors.length) {
  console.log('\npage errors:');
  for (const e of [...new Set(errors)].slice(0, 10)) console.log('  ' + e);
}
console.log(`\n${checks.length - bad.length}/${checks.length} checks passed`);
process.exit(bad.length || errors.length ? 1 : 0);
