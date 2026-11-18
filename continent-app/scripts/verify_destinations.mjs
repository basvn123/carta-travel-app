// The Destinations layers (Trails, Beaches, Lakes, Mountains, Cycling) since
// G12 (Explore top, 2026-11-18): the band's search sits over every tab, a
// layer has no Settings and no side panel, and the layer's own filters wait
// for a later run. What still matters for a traveller: the six tabs, the
// section opening (head, story rails with photographs, no bare counts, one
// closed Sources fold), the country track and its band, a link straight to a
// section and a country, a card that opens its page, German names, and no
// sideways scroll, at phone and desktop width.
//
//   node scripts/verify_destinations.mjs [url]   (default http://localhost:$CARTA_PORT or 4173)
//   CARTA_DATA_MIRROR=".../continent-app/public" fills a sparse worktree's data.
//
// Serve a LOCAL build (the fast build with a static server, or vite preview).
// The checks of the facet chips, the phone Filters row and the Trips tab went
// with the parts G12 removed (T428 and T431 wrote them).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { mirrorData } from './lib/dataMirror.mjs';

const BASE = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;
mkdirSync('shots', { recursive: true });
let pass = 0;
let fail = 0;
const check = (ok, name, detail = '') => {
  if (ok) pass += 1; else fail += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};
const errors = [];
// A local build fetches flights from R2, which answers CORS for its own hosts only.
const NOISE = /ERR_FAILED|config is not valid|content_overrides|Failed to load resource|Access to fetch at 'https:\/\/data\./;

const SEEDS = [['continent.guestMode.v1', '1'], ['continent.homeSeen.v1', '1'],
  ['continent.mapGuideDismissed.v1', '1'], ['carta.welcomeSeen.v1', '1']];

async function open(browser, view, query, lang = 'en') {
  const phone = view === 'phone';
  const ctx = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: 1, hasTouch: phone, isMobile: phone, serviceWorkers: 'block',
  });
  await mirrorData(ctx);
  await ctx.addInitScript(([seeds, l]) => {
    try {
      for (const [k, v] of seeds) localStorage.setItem(k, v);
      localStorage.setItem('continent.lang.v1', l);
      localStorage.removeItem('carta.places.v1');
    } catch { /* storage unavailable */ }
  }, [SEEDS, lang]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${view} ${query}: pageerror: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(`${view} ${query}: console: ${m.text().slice(0, 120)}`); });
  await page.goto(`${BASE}${query}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.band-input', { timeout: 120000 });
  await page.waitForTimeout(3500);
  return page;
}
const close = (page) => page.context().close();
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const selectedTab = (page) => page.$$eval('[role="tablist"] [role="tab"]', (els) => (els.find((e) => e.getAttribute('aria-selected') === 'true'
  && e.getBoundingClientRect().width > 0)?.textContent || '').trim());

// Visible text nodes inside the tab that state a bare count: a standalone
// figure with no unit beside it.
const COUNT_SCAN = () => {
  const root = document.querySelector('.places-tab');
  const UNIT = /(€|km|\bm\b|days?|nights?|hours?|\bh\b|min|%|°|est\.|\d\.\d)/i;
  const hits = [];
  if (!root) return ['no .places-tab'];
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

// The story rails of a section opening: title, cards, photographs.
const RAILS = () => [...document.querySelectorAll('.dtab-open .storyr')]
  .filter((r) => r.getBoundingClientRect().width > 0)
  .map((r) => ({
    title: (r.querySelector('.storyr-title')?.textContent || '').trim(),
    cards: r.querySelectorAll('.storyr-card').length,
    imgs: r.querySelectorAll('.storyr-card img').length,
    names: [...r.querySelectorAll('.storyr-card .card-title')].map((e) => e.textContent.trim()),
  }));

const browser = await chromium.launch();
for (const view of ['phone', 'desk']) {
  const tag = `${view}: `;

  // ── Beaches at rest: the band, the six tabs, the opening ──
  let page = await open(browser, view, '?tab=places&dc=beaches');
  const tabs = await page.$$eval('[role="tablist"] [role="tab"]', (els) => els.filter((e) => e.getBoundingClientRect().width > 0).length);
  check(tabs === 6, `${tag}six section tabs`, String(tabs));
  check(await selectedTab(page) === 'Beaches', `${tag}dc=beaches selects Beaches`, await selectedTab(page));
  check(await page.locator('.band-input').isVisible(), `${tag}the band's search shows over a layer`);
  check(await page.locator('.band-settings').count() === 0, `${tag}a layer has no Settings button`);
  check(await page.locator('.places-side, .explore-side, .side-panel').count() === 0, `${tag}no side panel`);
  check((await page.$eval('.dtab-title', (e) => e.textContent.trim()).catch(() => '')).length > 0, `${tag}the section head has a title`);
  const rails = await page.evaluate(RAILS);
  check(rails.length >= 2 && rails.length <= 4, `${tag}two to four story rails`, rails.map((r) => r.title).join(' | '));
  check(rails.every((r) => r.cards >= 2 && r.imgs === r.cards), `${tag}every rail card carries a photograph`,
    rails.map((r) => `${r.imgs}/${r.cards}`).join(' '));
  const all = rails.flatMap((r) => r.names);
  const dup = all.length - new Set(all).size;
  check(dup <= all.length / 4, `${tag}rails mostly do not repeat each other`, `${dup} of ${all.length}`);
  const seeAll = await page.$$eval('.storyr-all', (els) => els.map((e) => e.textContent.trim()));
  check(seeAll.every((s) => !/\d/.test(s)), `${tag}"See all" carries no figure`, seeAll.slice(0, 2).join(','));
  check(await page.$('.open-dots, .open-pos, .places-stripkey, .places-card-strip') === null, `${tag}no dots, position figure or strip`);
  const counts = await page.evaluate(COUNT_SCAN);
  check(counts.length === 0, `${tag}no bare counts on the beaches opening`, counts.slice(0, 4).join(' | '));
  check(await page.$('.dtab-sources details:not([open])') !== null, `${tag}one closed Sources fold`);
  check(await sideways(page) <= 1, `${tag}no sideways scroll on Beaches`, String(await sideways(page)));
  await page.screenshot({ path: `shots/dest-${view}-beaches.png` });
  // A rail card opens its place's page.
  const firstName = rails[0]?.names[0] || '';
  await page.locator('.dtab-open .storyr-card .card-open').first().click();
  await page.waitForTimeout(3000);
  const pageTitle = await page.locator('.pt-title, [role="dialog"] h1').first().innerText().catch(() => '');
  check(pageTitle.length > 1 && (!firstName || pageTitle.includes(firstName.slice(0, 8))), `${tag}a rail card opens its page`,
    `${firstName} -> ${pageTitle}`);
  await close(page);

  // ── A link straight to a section and a country ──
  page = await open(browser, view, '?tab=places&dc=lakes&dn=SI');
  check(await selectedTab(page) === 'Lakes', `${tag}dc=lakes&dn=SI selects Lakes`, await selectedTab(page));
  check((await page.$eval('.dtab-countryband-name', (e) => e.textContent.trim()).catch(() => '')) === 'Slovenia', `${tag}and Slovenia's band`);
  const lakes = await page.$$eval('.places-lcard', (els) => els.map((e) => (e.querySelector('.card-title')?.textContent || '').trim()));
  check(lakes.length >= 3 && lakes.every((n) => n.length > 1), `${tag}Slovenia's lakes list with names`, lakes.slice(0, 3).join(', '));
  check(await sideways(page) <= 1, `${tag}no sideways scroll on a country`, String(await sideways(page)));
  await page.screenshot({ path: `shots/dest-${view}-lakes-si.png` });
  // T498: the band's door is the country's own page.
  const go = page.locator('.dtab-countryband-go').first();
  check(await go.count() === 1, `${tag}the band has the door to the country page`);
  if (await go.count()) {
    await go.click();
    await page.waitForTimeout(2500);
    const hash = await page.evaluate(() => location.hash);
    check(/country=SI/.test(hash) && await page.$('.cpg-page') !== null, `${tag}the door opens Slovenia's page`, hash);
  }
  await close(page);

  // ── Trails at rest: walk rails, then the country track ──
  page = await open(browser, view, '?tab=places&dc=trails');
  check(await selectedTab(page) === 'Trails', `${tag}dc=trails selects Trails`, await selectedTab(page));
  const walkRails = await page.evaluate(RAILS);
  check(walkRails.length >= 2, `${tag}Trails opens on walk rails`, walkRails.map((r) => r.title).join(' | '));
  check(walkRails.every((r) => r.cards >= 4 && r.imgs === r.cards), `${tag}every walk rail has four or more photographed walks`);
  const track = await page.$$eval('.dtab-bycountry .dgal-card', (els) => els.map((e) => ({
    cc: e.dataset.cc, imgs: e.querySelectorAll('.dgal-img').length, line: (e.querySelector('.dgal-line')?.textContent || '').trim(),
  })));
  check(track.length >= 30, `${tag}the country track`, String(track.length));
  check(track.every((c) => c.imgs >= 1 && c.imgs <= 3 && c.line.length > 10), `${tag}every country card has photographs and its line`);
  const trailsH = await page.evaluate(() => document.querySelector('.places-tab')?.scrollHeight || 0);
  check(trailsH > 0 && trailsH < 4000, `${tag}the Trails opening is short`, String(trailsH));
  check(await page.$('.places-card-count') === null, `${tag}no walk count on a country`);
  const trailCounts = await page.evaluate(COUNT_SCAN);
  check(trailCounts.length === 0, `${tag}no bare counts on Trails`, trailCounts.slice(0, 4).join(' | '));
  check(await sideways(page) <= 1, `${tag}no sideways scroll on Trails`, String(await sideways(page)));
  await page.screenshot({ path: `shots/dest-${view}-trails.png` });
  // Picking a country: the URL and the band.
  await page.locator('.dtab-bycountry .dgal-card[data-cc="HR"] .card-open').first().click();
  await page.waitForTimeout(2500);
  check(/[?&]dn=HR\b/.test(page.url()), `${tag}a country card writes dn to the URL`, page.url().split('?')[1]?.slice(0, 60) || '');
  check((await page.$eval('.dtab-countryband-name', (e) => e.textContent.trim()).catch(() => '')) === 'Croatia', `${tag}the country band names Croatia`);
  check(await page.locator('.places-tcard').count() >= 5, `${tag}Croatia's walks list`, String(await page.locator('.places-tcard').count()));
  await close(page);

  // A walk rail card opens its trail page.
  page = await open(browser, view, '?tab=places&dc=trails');
  await page.locator('.dtab-open .storyr-card .card-open').first().click();
  await page.waitForTimeout(3500);
  check(await page.locator('.tpage-v2').isVisible().catch(() => false), `${tag}a walk card opens its trail page`);
  await close(page);

  // ── Mountains: a rail's fact says what it measures ──
  page = await open(browser, view, '?tab=places&dc=mountains');
  const facts = await page.$$eval('.storyr-card .dtab-fact', (els) => els.slice(0, 6).map((e) => e.textContent.trim()));
  check(facts.length > 0 && facts.every((f) => /^[A-Za-z]/.test(f)), `${tag}rail facts carry their label`, facts.slice(0, 2).join(' | '));
  await close(page);

  // ── An old Trips link still lands on the trip styles ──
  page = await open(browser, view, '?tab=places&dc=trips');
  const styles = await page.$$eval('.jstyle-card', (els) => els.map((e) => (e.querySelector('.jcap-fig')?.textContent || '').trim()));
  check(styles.length === 15 && styles.every((s) => /From|No written/.test(s)), `${tag}dc=trips still shows the fifteen styles with a from-price`, String(styles.length));
  await close(page);

  // ── German: the country names are German, the flags are not read out ──
  page = await open(browser, view, '?tab=places&dc=trails', 'de');
  const deNames = await page.$$eval('.dgal-card .card-title', (els) => els.map((e) => e.textContent.trim()));
  check(deNames.includes('Albanien') || deNames.includes('Kroatien'), `${tag}German country names on the cards`, deNames.slice(0, 3).join(', '));
  check(await page.$('svg.country-flag[aria-label]') === null, `${tag}flags are decorative`);
  check(await sideways(page) <= 1, `${tag}no sideways scroll in German`, String(await sideways(page)));
  await close(page);
}
await browser.close();
if (errors.length) console.log('\nerrors:\n' + errors.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail || errors.length ? 1 : 0);
