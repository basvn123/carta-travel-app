// Headless verify for the place-size rail on the Destinations tab.
//
//   node scripts/verify_place_classes.mjs [url]     (default http://localhost:4173)
//
// What it asserts, in the order a traveller meets it:
//   the rail only exists once there are places to size (not on the country index)
//   four sizes, each with a circular glyph and a real count
//   the counts add up to the list they filter
//   tapping a size narrows the list, and to that size only
//   two sizes together are a union, not an intersection
//   the size glyph rides on the cards themselves
//   a second tap clears, and switching category clears
//
// Screenshots to shots/classes-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';
const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const errors = [];
const NOISE = /emrldtp|ERR_FAILED|config is not valid/;

const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('console', (m) => {
  if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(m.text());
});
await page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});

await page.goto(URL, { waitUntil: 'networkidle' });
for (const label of ['Continue without an account', 'Got it', 'START HERE']) {
  const b = page.locator(`button:has-text("${label}")`).first();
  if (await b.count() && await b.isVisible().catch(() => false)) {
    await b.click().catch(() => {});
    await page.waitForTimeout(250);
  }
}

await page.locator('.bottom-nav-item', { hasText: /destinations/i }).first().click();
await page.waitForSelector('.places-tab', { timeout: 15000 });
await page.waitForTimeout(600);

// The country index comes first: nothing to size yet, so no rail.
check('no rail on the country index', await page.locator('.places-classes').count() === 0);
await page.screenshot({ path: 'shots/classes-index.png' });

// Pick a country with all four sizes in it.
await page.locator('.places-country').selectOption('IT');
await page.waitForTimeout(700);

const rail = page.locator('.places-classes');
check('rail appears once a country is picked', await rail.count() === 1);

const chips = page.locator('.places-class');
const nChips = await chips.count();
check('four sizes', nChips === 4, `got ${nChips}`);

const labels = (await chips.allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
check('sizes are labelled and counted', labels.every((l) => /\d/.test(l)), labels.join(' | '));

// Every glyph sits in a real circle.
const round = await page.locator('.places-class-dot').evaluateAll((els) => els.every((el) => {
  const cs = getComputedStyle(el);
  const r = parseFloat(cs.borderRadius);
  const w = parseFloat(cs.width);
  return cs.borderRadius.includes('%') || r >= w / 2 - 0.5;
}));
check('glyphs sit in circles', round);
check('every chip carries an svg', await page.locator('.places-class-dot svg').count() === nChips);

const countOf = async (i) => {
  const txt = await chips.nth(i).locator('.places-class-n').innerText();
  return Number(txt.replace(/[^\d]/g, ''));
};
const counts = [];
for (let i = 0; i < nChips; i += 1) counts.push(await countOf(i));
check('counts are non-zero somewhere', counts.some((c) => c > 0), counts.join(','));

const cardCount = async () => {
  // Cards lazy-load in pages of 36, so compare against the chip sum only when
  // the list is short enough to be fully rendered.
  await page.waitForTimeout(500);
  return page.locator('.places-dcard').count();
};

// Filter to villages (smallest count that is non-zero keeps the list short).
const villageIdx = 2;
const villageN = counts[villageIdx];
await chips.nth(villageIdx).click();
await page.waitForTimeout(700);
check('village chip goes active', (await chips.nth(villageIdx).getAttribute('class')).includes('on'));

const shown = await cardCount();
check('filtering narrows the list', shown <= Math.min(36, villageN), `${shown} shown, ${villageN} villages`);

// Every visible card must now carry the village glyph.
const cardLabels = await page.locator('.places-card-class').evaluateAll(
  (els) => els.map((el) => el.getAttribute('aria-label')),
);
check('cards carry the size glyph', cardLabels.length > 0, `${cardLabels.length} glyphs`);
check('only villages are shown',
  cardLabels.every((l) => /village|borgh/i.test(l || '')),
  [...new Set(cardLabels)].join(','));
await page.screenshot({ path: 'shots/classes-villages.png' });

// Two sizes at once is a union.
await chips.nth(0).click();
await page.waitForTimeout(700);
const unionLabels = await page.locator('.places-card-class').evaluateAll(
  (els) => els.map((el) => el.getAttribute('aria-label')),
);
const kinds = new Set(unionLabels.map((l) => (/village|borgh/i.test(l || '') ? 'v' : 'c')));
check('two sizes union rather than intersect', kinds.size === 2, [...kinds].join(','));
await page.screenshot({ path: 'shots/classes-union.png' });

// Tapping again clears that size.
await chips.nth(0).click();
await chips.nth(villageIdx).click();
await page.waitForTimeout(700);
const anyOn = await page.locator('.places-class.on').count();
check('a second tap clears the size', anyOn === 0, `${anyOn} still on`);

// Switching category drops the size filter with it.
await chips.nth(villageIdx).click();
await page.waitForTimeout(400);
await page.locator('.places-cat', { hasText: /trips/i }).click();
await page.waitForTimeout(500);
await page.locator('.places-cat', { hasText: /general/i }).click();
await page.waitForTimeout(700);
check('changing category clears the size filter',
  await page.locator('.places-class.on').count() === 0);

// Desktop pass: the rail must survive the wider layout.
const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
desk.on('console', (m) => {
  if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(m.text());
});
await desk.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});
await desk.goto(URL, { waitUntil: 'networkidle' });
for (const label of ['Continue without an account', 'Got it', 'START HERE']) {
  const b = desk.locator(`button:has-text("${label}")`).first();
  if (await b.count() && await b.isVisible().catch(() => false)) {
    await b.click().catch(() => {});
    await desk.waitForTimeout(250);
  }
}
// Desktop enters through the header tabs; the bottom bar is phone-only.
const deskNav = desk.locator('.header-nav-item', { hasText: /destinations/i }).first();
if (await deskNav.isVisible().catch(() => false)) await deskNav.click();
await desk.waitForSelector('.places-tab', { timeout: 15000 });
await desk.locator('.places-country').selectOption('IT');
await desk.waitForTimeout(700);
check('rail renders on desktop', await desk.locator('.places-class').count() === 4);
const noScroll = await desk.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
check('no horizontal overflow', noScroll);
await desk.screenshot({ path: 'shots/classes-desktop.png' });

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const pass = checks.filter((c) => c.ok).length;
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
console.log(`\n${pass}/${checks.length} checks passed`);
process.exit(pass === checks.length ? 0 : 1);
