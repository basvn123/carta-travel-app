// Headless verify for the curated trip library: the Trips category's style
// grid, one style's list, the journey page, and the composed door.
//
//   node scripts/verify_journeys.mjs [url]      (default http://localhost:$CARTA_PORT or 4173)
//
// What it is checking, in the order a traveller meets it:
//   the Trips category opens on TEN style cards, each with a photograph
//   the composer's own door still exists at the end of the grid
//   a style opens its list: photo cards, a way back, a heading with a count
//   a card opens the journey page: hero, budget receipt, seven days, beds
//   the composed door still reaches the slider and the composed cards
//
// Then a data pass over the published wire: every card resolves to a detail
// file with seven authored days, every hero is a clean Wikimedia thumb (no
// utm tracking), and no shipped string carries an em dash.
//
// Phone viewport first, then one desktop pass. Screenshots to
// shots/journeys-*.png.

import { chromium } from 'playwright';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;
const WIRE = 'public/journeys';

const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };
const errors = [];
const NOISE = /ERR_FAILED|config is not valid|content_overrides/;

const seed = (page) => page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});

// ── The wire, read straight off disk ─────────────────────────────────────
try {
  const index = JSON.parse(readFileSync(`${WIRE}/index.json`, 'utf8'));
  const types = index.types || [];
  check('the journey wire is published', (index.n_trips || 0) > 0, `${index.n_trips} trips`);
  // T431: fifteen since the owner's five new styles (2026-10-15).
  check('fifteen styles are published', types.length === 15, `${types.length} styles`);
  check('every style has a hero photograph',
    types.every((t) => t.hero && t.hero.url), '');
  const sum = types.reduce((n, t) => n + (t.n || 0), 0);
  check('the style counts add up to the index total', sum === index.n_trips,
    `${sum} against ${index.n_trips}`);

  let cards = 0;
  const noHero = [];
  const noDetail = [];
  const badDays = [];
  for (const t of types) {
    const file = JSON.parse(readFileSync(`${WIRE}/type/${t.slug}.json`, 'utf8'));
    if ((file.trips || []).length !== t.n) badDays.push(`${t.slug}: count drift`);
    for (const c of file.trips || []) {
      cards += 1;
      if (!c.hero?.url) noHero.push(c.id);
      const path = `${WIRE}/journey/${c.id}.json`;
      if (!existsSync(path)) { noDetail.push(c.id); continue; }
      const d = JSON.parse(readFileSync(path, 'utf8'));
      const days = d.itinerary || [];
      if (days.length !== 7 || days.some((x) => !x.morning || !x.afternoon)) {
        badDays.push(c.id);
      }
    }
  }
  check('every card carries a hero photograph', noHero.length === 0,
    noHero.slice(0, 3).join(', '));
  check('every card resolves to a detail file', noDetail.length === 0,
    noDetail.slice(0, 3).join(', '));
  check('every journey has seven authored days', badDays.length === 0,
    badDays.slice(0, 3).join(', '));
  check('the country files add up to the index total', cards === index.n_trips,
    `${cards} cards`);

  // House rules over the whole wire: no tracking params on image URLs, no em
  // dashes in anything shipped, no [VERIFY markers left in display prose.
  let utm = 0; let dashes = 0; let verifyLeft = 0;
  const scan = (dir) => {
    for (const f of readdirSync(dir)) {
      const raw = readFileSync(`${dir}/${f}`, 'utf8');
      if (raw.includes('utm_source')) utm += 1;
      if (/—/.test(raw)) dashes += 1;
      if (raw.includes('[VERIFY')) verifyLeft += 1;
    }
  };
  scan(`${WIRE}/type`);
  scan(`${WIRE}/journey`);
  check('no image URL carries tracking parameters', utm === 0, `${utm} files`);
  check('no shipped string carries an em dash', dashes === 0, `${dashes} files`);
  check('no [VERIFY marker leaks into display prose', verifyLeft === 0,
    `${verifyLeft} files`);
} catch (e) {
  check('the wire pass ran', false, String(e.message || e).slice(0, 100));
}

// ── The phone pass ───────────────────────────────────────────────────────
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => {
    const text = m.text();
    if (m.type() !== 'error' || NOISE.test(text)) return;
    if (/Failed to load resource/i.test(text)) return;
    errors.push('console: ' + text.slice(0, 120));
  });
  page.on('response', (r) => {
    if (r.status() < 400 || NOISE.test(r.url())) return;
    errors.push(`http ${r.status()} ${r.url().slice(0, 110)}`);
  });
  await seed(page);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);

  await page.locator('.bottom-nav-item', { hasText: /^\s*explore\s*$/i }).first().click();
  await page.waitForTimeout(1200);
  check('destinations tab opens', await page.locator('.places-tab').isVisible());

  await page.locator('.dtab-cats [role="tab"]', { hasText: /^trips$/i }).click();
  await page.waitForTimeout(2000);

  // ── The style grid ──
  const styles = page.locator('.jstyle-card');
  const nStyles = await styles.count();
  check('fifteen style cards render (T431)', nStyles === 15, `${nStyles} cards`);
  check('every style card shows a photograph',
    await page.locator('.jstyle-card .card-media').count() === nStyles);
  check('the composer keeps its own door',
    await page.locator('.jcomposed-card').count() === 1);
  check('no day slider on the style grid',
    await page.locator('.trip-slider:visible').count() === 0);
  check('no price chrome on the library',
    await page.locator('.lifestyle-btn:visible').count() === 0);
  // T387 (rule "Cost on cards"): every style card carries its from-price, a
  // euro figure a person, in the caption band under the photograph.
  await page.waitForTimeout(1500);
  check('every style card carries a from-price',
    await page.locator('.jstyle-card .jcap-fig', { hasText: '€' }).count() === nStyles);
  check('no text sits on a card photograph',
    await page.locator('.jstyle-card .places-card-scrim, .jstyle-card .places-card-overlay').count() === 0);
  await page.screenshot({ path: 'shots/journeys-home.png', fullPage: false });

  // ── One style's list ──
  await styles.first().click();
  await page.waitForTimeout(1500);
  check('the style heading renders', await page.locator('.tlib-head .dtab-title').isVisible());
  check('the way back to the styles renders',
    await page.locator('.jsec-back:visible').count() === 1);
  const jcards = page.locator('.jcard');
  const nCards = await jcards.count();
  check('trip cards render', nCards >= 5, `${nCards} cards`);
  check('every trip card shows a photograph',
    await page.locator('.jcard .card-media').count() === nCards);
  // T431 (owner, 2026-10-15): a trip card names the places it visits and
  // carries no day count and no difficulty word; the length control says the
  // length and the trip page explains the effort.
  const cardTexts = await jcards.evaluateAll((els) => els.map((e) => e.textContent));
  check('no trip card names its days or a difficulty word',
    cardTexts.every((x) => !/\b\d+ days\b|Demanding|Moderate|Expert\b/.test(x)), '');
  check('trip cards name the places they visit',
    await page.locator('.jcard .ttile-line').count() >= nCards * 2, '');
  // T387 (brief V3.3): one filter row instead of three stacked groups. The
  // first card's top is reported, not gated: the tab chrome above the list
  // (search, country, category tiles) belongs to the Destinations surface.
  const firstTop = await jcards.first().evaluate((el) => Math.round(el.getBoundingClientRect().top));
  check('the trip list has one filter row', await page.locator('.tf-bar').count() === 1,
    `first card at ${firstTop} px`);
  await page.screenshot({ path: 'shots/journeys-type.png', fullPage: false });

  // ── The journey page ──
  await jcards.first().click();
  await page.waitForTimeout(2500);
  check('the journey page opens', await page.locator('.jpage').isVisible());
  // T431 (owner, 2026-10-15): the page is rebuilt on the item pages'
  // system: a credited gallery, the price card with its lines behind "See
  // the breakdown", the days as cards with tonight's bed on each (Where to
  // sleep merged in), and Before you go as cards that swipe.
  check('the page leads with its gallery',
    await page.locator('.jpage .ipage-gallery .pgal').count() === 1);
  check('the price card carries the total a person and the party total',
    await page.locator('#sec-budget .tprice-fig').count() === 1
      && await page.locator('#sec-budget .tprice-line.is-total').count() === 1);
  check('the price card says what is and is not included',
    await page.locator('#sec-budget .iinc-row.is-out').count() >= 2);
  check('seven days render', await page.locator('.jpage .tday').count() === 7,
    `${await page.locator('.jpage .tday').count()} days`);
  check('the page has its own address',
    /^#journey=/.test(await page.evaluate(() => window.location.hash)));
  check('tonight is on the day cards', await page.locator('.jpage .tday-night').count() >= 5);
  check('pro tips render as cards', await page.locator('#sec-prep .gocard').count() >= 2);
  const bookH = await page.locator('.jpage-book-list label').evaluateAll(
    (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  check('every booking row is at least 44 px high', bookH.length > 0 && Math.min(...bookH) >= 44,
    `${bookH.length} rows, shortest ${Math.min(...bookH)} px`);
  const moreNames = await page.locator('.jpage .tday-more').evaluateAll(
    (els) => els.map((e) => e.getAttribute('aria-label') || e.textContent.trim()));
  check('the day disclosures have distinct names',
    moreNames.length >= 5 && new Set(moreNames).size === moreNames.length,
    `${new Set(moreNames).size} of ${moreNames.length}`);
  await page.emulateMedia({ media: 'print' });
  const printed = await page.evaluate(() => {
    const d = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).display : 'missing'; };
    return { bar: d('.jpage .tpage-bar'), rail: d('.jpage .srail'), track: d('.jpage .tweek .itrack-row'),
      pos: getComputedStyle(document.querySelector('.jpage')).position };
  });
  await page.emulateMedia({ media: 'screen' });
  check('print drops the bar and the rail and stacks the days',
    printed.bar === 'none' && printed.rail === 'none' && printed.track === 'grid',
    JSON.stringify(printed));
  await page.screenshot({ path: 'shots/journeys-page.png', fullPage: false });
  await page.screenshot({ path: 'shots/journeys-page-full.png', fullPage: true });

  // Escape closes the page, back returns to the grid.
  await page.locator('.tpage-back').click();
  await page.waitForTimeout(800);
  check('closing the page lands back on the list',
    await page.locator('.jcard').count() >= 5);
  await page.locator('.jsec-back').click();
  await page.waitForTimeout(800);
  check('the way back reaches the style grid',
    await page.locator('.jstyle-card').count() === 15);

  // ── The composed door ──
  await page.locator('.jcomposed-card').click();
  await page.waitForTimeout(2500);
  check('the composed view keeps its length control (a select since T428)',
    await page.locator('.dtab-length select:visible').count() >= 1);
  check('composed itinerary cards still render',
    await page.locator('.places-icard').count() >= 3,
    `${await page.locator('.places-icard').count()} cards`);
  check('the composed view carries a way back',
    await page.locator('.jsec-back-solo:visible').count() === 1);
  await page.locator('.jsec-back-solo').click();
  await page.waitForTimeout(800);
  check('leaving the composed view lands on the styles',
    await page.locator('.jstyle-card').count() === 15);
  await page.close();
} catch (e) {
  errors.push('script: ' + String(e && e.message ? e.message : e).split('\n')[0]);
  check('the phone pass finished without throwing', false);
}

// ── The exit pass (T407, brief V5.3, row T387-g) ─────────────────────────
// Leaving through "See day prices in <town>" goes back through the history
// entry the page pushed before it runs the exit, so no #journey= address is
// left behind.
try {
  const ex = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await seed(ex);
  await ex.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await ex.waitForTimeout(3000);
  // T431: the town's day prices are offered only when the trip starts within
  // 30 km of that town, so the pass opens a city week (Prague, gateway PRG)
  // by its address instead of the first hiking week.
  await ex.goto(`${URL.split('#')[0]}${URL.includes('?') ? '&' : '?'}tab=places#journey=cz-city-prague-layered`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await ex.waitForTimeout(4000);
  const cta = ex.locator('.jpage .tgo-town');
  if (await cta.count()) {
    await cta.first().scrollIntoViewIfNeeded();
    await cta.first().click();
    await ex.waitForTimeout(1500);
    check('leaving through the town exit leaves no journey address behind',
      !/journey=/.test(await ex.evaluate(() => window.location.hash))
      && (await ex.locator('.jpage').count()) === 0);
  } else {
    check('the Prague week offers its town exit to test', false, 'no .tgo-town on the Prague week');
  }
  await ex.close();
} catch (e) {
  errors.push('script: ' + String(e && e.message ? e.message : e).split('\n')[0]);
  check('the exit pass finished without throwing', false);
}

// ── The desktop pass ─────────────────────────────────────────────────────
try {
  const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await seed(desk);
  await desk.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await desk.waitForTimeout(3000);
  await desk.locator('[class*="top-tab"]', { hasText: /destinations/i })
    .first().click().catch(() => {});
  await desk.waitForTimeout(1000);
  const deskCat = desk.locator('.dtab-cats [role="tab"]',
    { hasText: /^trips$/i });
  await deskCat.first().click();
  await desk.waitForTimeout(2000);
  check('desktop shows the fifteen styles',
    await desk.locator('.jstyle-card').count() === 15,
    `${await desk.locator('.jstyle-card').count()} cards`);
  await desk.screenshot({ path: 'shots/journeys-desktop.png' });
  await desk.locator('.jstyle-card').first().click();
  await desk.waitForTimeout(1500);
  await desk.locator('.jcard').first().click();
  await desk.waitForTimeout(2500);
  check('desktop opens the journey page',
    await desk.locator('.jpage').isVisible());
  await desk.screenshot({ path: 'shots/journeys-page-desktop.png' });
  await desk.close();
} catch (e) {
  errors.push('script: ' + String(e && e.message ? e.message : e).split('\n')[0]);
  check('the desktop pass finished without throwing', false);
}

await browser.close();

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  [${c.note}]` : ''}`);
}
if (errors.length) {
  console.log('\npage errors:');
  for (const e of errors) console.log('  ' + e);
}
console.log(failed === 0 && errors.length === 0
  ? '\nAll checks passed.'
  : `\n${failed} checks failed, ${errors.length} page errors.`);
process.exit(failed === 0 ? 0 : 1);
