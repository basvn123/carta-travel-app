// The Destinations tab's contract after T428 (owner brief 2026-10-14):
// Explore's grammar, no catalogue counts, people in the section photos,
// country galleries with one line, the section and country in the URL.
//
//   CARTA_PORT=5298 node scripts/verify_destinations.mjs
//
// Serve a LOCAL build first (npx vite build, then npx vite preview --port N).
// Replaces scripts/verify_filter_sheet.mjs (row T440-a), which looked for
// facet chips this tab and Explore no longer draw.
import { chromium } from 'playwright';

const PORT = process.env.CARTA_PORT || '5298';
const BASE = `http://localhost:${PORT}/`;
let pass = 0;
let fail = 0;
const check = (ok, name, detail = '') => {
  if (ok) pass += 1; else fail += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

const SEEDS = [['continent.lang.v1', 'en'], ['continent.guestMode.v1', '1'], ['continent.homeSeen.v1', '1'],
  ['continent.mapGuideDismissed.v1', '1'], ['carta.welcomeSeen.v1', '1']];

async function open(browser, view, query) {
  const phone = view === 'phone';
  const page = await browser.newPage({
    viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: 1, hasTouch: phone, isMobile: phone,
  });
  await page.addInitScript((seeds) => {
    try { for (const [k, v] of seeds) localStorage.setItem(k, v); localStorage.removeItem('carta.places.v1'); } catch { /* */ }
  }, SEEDS);
  await page.goto(`${BASE}${query}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.dtab-cats', { timeout: 60000 });
  await page.waitForTimeout(3500);
  return page;
}

// Visible text nodes inside the tab that state a bare count: a standalone
// figure with no unit beside it.
const COUNT_SCAN = () => {
  const root = document.querySelector('.places-shell');
  const UNIT = /(€|km|\bm\b|days?|nights?|hours?|\bh\b|min|%|°|est\.|\d\.\d)/i;
  const hits = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.trim();
    const el = n.parentElement;
    if (!text || !el || el.closest('[aria-hidden="true"], .sr-only, .credit-fold, .money, .score-chip, .ui-chip-count')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (/^\d{1,4}$/.test(text) || /^(See all|Show all) \d/.test(text) || /\d+ (trips|walks|beaches|lakes|mountains|routes|countries|styles)\b/i.test(text)) {
      if (!UNIT.test(text)) hits.push(text);
    }
  }
  return hits;
};

const browser = await chromium.launch();
for (const view of ['phone', 'desk']) {
  const tag = `${view}: `;

  // Beaches at rest: the whole opening.
  let page = await open(browser, view, '?tab=places&dc=beaches');
  const tabs = await page.$$eval('.dtab-cats [role="tab"]', (els) => els.map((e) => ({ t: e.textContent.trim(), on: e.getAttribute('aria-selected') })));
  check(tabs.length === 6, `${tag}six section tabs`, String(tabs.length));
  check(tabs.find((x) => x.on === 'true')?.t === 'Beaches', `${tag}dc=beaches selects Beaches`);
  check(await page.$('.dtab-head img') !== null, `${tag}the section head has its photograph`);
  check((await page.$eval('.dtab-head .dtab-title', (e) => e.textContent.trim()).catch(() => '')).length > 0, `${tag}the head has a title`);
  const rails = await page.$$eval('.dtab-rails > .dtab-rail', (els) => els.length);
  check(rails >= 2 && rails <= (view === 'phone' ? 3 : 4), `${tag}two to ${view === 'phone' ? 3 : 4} rails`, String(rails));
  check(await page.$('.open-dots, .open-pos, .open-icons, .places-stripkey, .places-card-strip') === null, `${tag}no dots, position figure, strip or strip key`);
  const seeAll = await page.$$eval('.dtab-all', (els) => els.map((e) => e.textContent.trim()));
  check(seeAll.every((s) => !/\d/.test(s)), `${tag}"See all" carries no figure`, seeAll.slice(0, 2).join(','));
  const starters = await page.$$eval('.dtab-starter', (els) => els.length);
  check(starters >= 1, `${tag}"Try one" offers starters`, String(starters));
  const ids = await page.$$eval('.dtab-rails .dtab-item .card-title', (els) => els.map((e) => e.textContent.trim()));
  const dup = ids.length - new Set(ids).size;
  check(dup <= ids.length / 4, `${tag}rails mostly do not repeat each other`, `${dup} of ${ids.length}`);
  const cards = await page.$$eval('.dtab-bycountry .dgal-card', (els) => els.map((e) => ({
    cc: e.dataset.cc, imgs: e.querySelectorAll('.dgal-img').length, line: (e.querySelector('.dgal-line')?.textContent || '').trim(),
  })));
  check(cards.length >= 10, `${tag}the countries track`, String(cards.length));
  check(cards.every((c) => c.imgs >= 1 && c.imgs <= 3 && c.line.length > 10), `${tag}every country card has photographs and its line`);
  const be = await page.$eval('.dgal-card[data-cc="BE"] .dgal-img', (e) => e.getAttribute('src') || '').catch(() => '');
  check(/Rozenhoedkaai|Brugge|Bruges/i.test(be), `${tag}Belgium leads with Bruges, not a trail photo`, be.slice(-60));
  const counts = await page.evaluate(COUNT_SCAN);
  check(counts.length === 0, `${tag}no bare counts on the beaches opening`, counts.slice(0, 4).join(' | '));
  check(await page.$('.dtab-sources details:not([open])') !== null, `${tag}one closed Sources fold`);
  if (view === 'phone') {
    const hs = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(hs <= 1, `${tag}no sideways scroll`, String(hs));
    check(await page.$('.dtab-top .dtab-filters') !== null, `${tag}search and Filters share one row`);
  } else {
    check(await page.$('#header-search-slot .places-search') !== null, `${tag}the search sits in the header slot`);
    check(await page.$('.places-side .side-cats, .places-side .side-cat') === null, `${tag}the side panel holds no section grid`);
  }

  // Picking a country: the band, the URL, the Explore door.
  await page.click('.dtab-bycountry .dgal-card[data-cc="HR"] .card-open').catch(() => {});
  await page.waitForTimeout(2500);
  const url = page.url();
  check(/[?&]dn=HR\b/.test(url), `${tag}a country card writes dn to the URL`, url.split('?')[1] || '');
  const band = await page.$eval('.dtab-countryband-name', (e) => e.textContent.trim()).catch(() => '');
  check(band === 'Croatia', `${tag}the country band names it`, band);
  const go = await page.$('.dtab-countryband-go');
  check(go !== null, `${tag}the band has the door to Explore`);
  if (go) {
    await go.click();
    await page.waitForTimeout(2500);
    const exploreOn = await page.evaluate(() => new URLSearchParams(location.search).get('tab'));
    check(exploreOn === 'map' || exploreOn === null, `${tag}the door opens Explore`, String(exploreOn));
  }
  await page.close();

  // A link straight to a section and a country.
  page = await open(browser, view, '?tab=places&dc=lakes&dn=SI');
  const on = await page.$eval('.dtab-cats [aria-selected="true"]', (e) => e.textContent.trim()).catch(() => '');
  check(on === 'Lakes', `${tag}dc=lakes&dn=SI opens Lakes`, on);
  check((await page.$eval('.dtab-countryband-name', (e) => e.textContent.trim()).catch(() => '')) === 'Slovenia', `${tag}and Slovenia's band`);
  await page.close();

  // Trails at rest: the countries.
  page = await open(browser, view, '?tab=places&dc=trails');
  const grid = await page.$$eval('.dgal-grid .dgal-card', (els) => els.length);
  check(grid >= 30, `${tag}Trails opens on the country galleries`, String(grid));
  check(await page.$('.places-card-count') === null, `${tag}no walk count on a country`);
  const trailCounts = await page.evaluate(COUNT_SCAN);
  check(trailCounts.length === 0, `${tag}no bare counts on Trails`, trailCounts.slice(0, 4).join(' | '));
  await page.close();

  // Trips: ten styles, a line each, a price, no counts, no coverage sentence.
  page = await open(browser, view, '?tab=places&dc=trips');
  const styles = await page.$$eval('.jstyle-card', (els) => els.map((e) => ({
    desc: (e.querySelector('.jstyle-desc')?.textContent || '').trim(),
    fig: (e.querySelector('.jcap-fig')?.textContent || '').trim(),
  })));
  check(styles.length === 10, `${tag}ten trip styles`, String(styles.length));
  check(styles.every((s) => s.desc.length > 10), `${tag}every style has its one line`);
  check(styles.every((s) => /From|No written/.test(s.fig)), `${tag}every style has its from-price`);
  check(await page.$('.jsec-coverage, .jcap-count') === null, `${tag}no coverage sentence, no trip count`);
  const tripCounts = await page.evaluate(COUNT_SCAN);
  check(tripCounts.length === 0, `${tag}no bare counts on Trips`, tripCounts.slice(0, 4).join(' | '));
  const first = await page.$eval('.jstyle-card .jcap-name', (e) => e.textContent.trim()).catch(() => '');
  check(first === 'Hiking', `${tag}Hiking leads`, first);
  await page.close();
}
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
