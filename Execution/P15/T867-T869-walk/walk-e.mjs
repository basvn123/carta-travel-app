// T867-T869 end check (plan flow v3, Batch E) on a NOPUBLIC build + public/.
//   node walk-e.mjs <port> <label> [outDir]
// 1. Searching: the stages name the answers (the airports' towns and the
//    dates, who goes and the nights, the likes), three stages of real work,
//    no food stage; with the CPU slowed the first trips show under them.
// 2. Trips for you, layout A: "N trips for you", the answers in one line,
//    Edit answers; Sort (Best match, Cheapest, Shortest trip there); no
//    levers; a gallery three across at 1440, two at 800, one at 375, full
//    width; the Map toggle draws price pins and a pin picks the card.
// 3. The card: the photo with the match and the heart, name, country,
//    nights, bases, one line, the group total; Compare and Skip in a small
//    menu; Compare 2 opens the table; the whole card opens the trip.
// 4. Named places lead the answers line; settings saved with the old levers
//    load; the sort fits its box in German and French on a phone.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const APP = 'C:/Users/Gebruiker/Documents/Portfolio/Travel App/continent-app';
const { chromium } = await import(`file:///${APP}/node_modules/playwright/index.mjs`);
const { normalizeSettings, draftPatch } = await import(`file:///${APP}/src/planner/flow/tripSettings.js`);
const PORT = process.argv[2] || 5867;
const LABEL = process.argv[3] || 'after';
const OUT = process.argv[4] || `C:/Users/Gebruiker/Documents/Portfolio/Travel App/Execution/P15/T867-T869-walk/${LABEL}`;
const WIDTHS = (process.env.WIDTHS || '1440,375').split(',').map(Number);
mkdirSync(OUT, { recursive: true });
const fx = (n) => JSON.parse(readFileSync(`${APP}/tests/fixtures/${n}`, 'utf8'));
function sweep() {
  const f = fx('tf1-flights-BRU.json');
  const at = Math.floor(Date.now() / 60000) - 30;
  for (const side of [f.to, f.back]) for (const days of Object.values(side)) for (const v of Object.values(days)) if (Array.isArray(v)) v[5] = at;
  f.checked = at; f.from = 'BRU'; return f;
}
const AIRLINES = readFileSync('C:/Users/Gebruiker/Documents/Portfolio/wt/t817-airlines-index.json', 'utf8');
const GHENT = { name: 'Ghent', lat: 51.054, lng: 3.717, countryCode: 'BE' };
const settings = (extra = {}) => normalizeSettings({
  answered: ['tell', 'booked', 'who', 'sleep', 'priority', 'when', 'from'],
  party: { kind: 'couple', adults: 2 }, priority: 'balance', when: { mode: 'exact', start: '2026-11-21', end: '2026-11-28', nights: 7 },
  from: GHENT,
  guide: { shapes: ['towns'], likes: ['hiking', 'food'], weather: 'mild', reach: 'short', avoid: ['crowds'], budget: { kind: 'total', eur: 1200 }, ...(extra.guide || {}) },
  ...extra,
  trip: { name: 'Winter week', created: Date.now() },
});
const draftOf = (s, raw = null) => {
  const d = { version: 2, savedAt: Date.now(), ...draftPatch(s, {}) };
  // An old saved trip: the settings as T803 to T866 stored them, levers in.
  if (raw && d.settings) d.settings = { ...d.settings, guide: { ...d.settings.guide, levers: raw } };
  return JSON.stringify(d);
};
const results = []; const errors = [];
const ok = (w, label, v, note = '') => { results.push({ w, label, ok: !!v, note }); console.log(`${v ? 'PASS' : 'FAIL'} [${w}] ${label}${note ? `  (${note})` : ''}`); };
const NOISE = /ERR_FAILED|config is not valid|favicon|CORS|Access-Control|net::ERR|Failed to load resource|Download the React DevTools|basemaps|cartocdn|maplibre|WebGL|style/i;
const noSideways = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const n = (s) => Number(String(s).replace(/[^0-9]/g, ''));
const browser = await chromium.launch();
const shot = async (page, name, full = false) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); };
const step = async (w, name, fn) => { try { await fn(); } catch (e) { ok(w, `${name} ran`, false, e.message.split('\n')[0]); } };

async function open(W, draft, { lang = 'en', height = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: W, height: height || (W < 500 ? 812 : 900) }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${W}] pageerror: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(`[${W}] console: ${m.text().slice(0, 200)}`); });
  await page.route('**/flights/*.json', (r) => {
    const code = r.request().url().match(/flights\/([A-Z_a-z]+)\.json/)?.[1];
    if (code === '_index') return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: AIRLINES });
    return code === 'BRU' ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sweep()) }) : r.fulfill({ status: 404, body: '' });
  });
  await page.route('**/api/flights**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.addInitScript(([dd, lg]) => { try {
    localStorage.setItem('continent.lang.v1', lg); localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1'); localStorage.setItem('carta.welcomeSeen', '1'); localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem('carta.plannerDraft.v1', dd); sessionStorage.setItem('seeded', '1'); }
  } catch { /* storage */ } }, [draft, lang]);
  await page.goto(`http://localhost:${PORT}/?o=BRU&oa=BRU&ah=p&dh=51.0540,3.7170,Ghent`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(2500);
  const nav = page.locator('.header-nav-item:visible, nav.bottom-nav .bottom-nav-item:visible').nth(1);
  await nav.click(); await page.waitForTimeout(1500);
  return { ctx, page };
}

/**
 * From the Plan home to Trips for you; with `watch`, the searching screen is
 * read on the way (its stage lines, whether the first trips showed under them).
 */
async function toFinder(page, { watch = false, cdp = null } = {}) {
  await page.locator('.pf-trip-link').first().click(); await page.waitForTimeout(1500);
  await page.locator('.pf .pf-home .btn-primary, .pf .pf-foot .btn-primary').first().click(); await page.waitForTimeout(600);
  // Named places preselect I know where; this walk takes Plan the whole trip.
  if (await page.locator('.pf-door[data-door="guide"]').count()) { await page.locator('.pf-door[data-door="guide"]').click(); await page.waitForTimeout(200); }
  await page.locator('.pf .pf-foot .btn-primary').last().click(); await page.waitForTimeout(400);
  const seen = { lines: null, early: 0, earlyShot: false };
  if (watch && cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 30 });
  // A page-side watcher: the stage lines as first drawn, and the most cards
  // shown under them (the searching screen can stand for well under a second).
  if (watch) await page.evaluate(() => {
    window.__seen = { lines: null, early: 0 };
    const look = () => {
      const checks = [...document.querySelectorAll('.tff-load .tff-check > span:nth-child(2)')];
      if (checks.length && !window.__seen.lines) window.__seen.lines = checks.map((e) => e.textContent.trim());
      if (checks.length) window.__seen.last = checks.map((e) => e.textContent.trim());
      window.__seen.early = Math.max(window.__seen.early, document.querySelectorAll('.tff-early .tff-card').length);
    };
    new MutationObserver(look).observe(document.body, { childList: true, subtree: true });
  });
  for (let i = 0; i < 12; i++) {
    if (await page.locator('.tff-trips, .tff-load').count()) break;
    const prim = page.locator('.pf .pf-foot .btn-primary').last();
    if (await prim.count() && await prim.isEnabled()) await prim.click(); else await page.locator('.pf .pf-foot button:not([disabled])').first().click().catch(() => {});
    await page.waitForTimeout(450);
  }
  if (watch) {
    const t0 = Date.now();
    while (Date.now() - t0 < 30000 && !(await page.locator('.tff-trips').count())) {
      if (!seen.earlyShot && await page.locator('.tff-early .tff-card').count()) {
        // The browser's own capture, quicker than Playwright's under a slowed CPU.
        seen.earlyShot = true;
        const shotData = await cdp.send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
        if (shotData?.data) writeFileSync(`${OUT}/01-searching-${page.viewportSize().width}.png`, Buffer.from(shotData.data, 'base64'));
      }
      await page.waitForTimeout(30);
    }
    Object.assign(seen, await page.evaluate(() => window.__seen));
    if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
  await page.locator('.tff-trips').waitFor({ timeout: 40000 });
  await page.waitForTimeout(1200);
  return seen;
}

const cards = (page) => page.locator('.tff-list .tff-card').evaluateAll((els) => els.map((e) => ({
  name: e.querySelector('.tff-card-name')?.innerText.trim(),
  pill: e.querySelector('.tff-card-pill')?.innerText.trim() || '',
  heart: Boolean(e.querySelector('.tff-card-heart')),
  photo: Boolean(e.querySelector('.tff-photos img, .tff-photos [class*="placeholder"], .tff-photos')),
  meta: e.querySelector('.tff-card-meta')?.innerText.replace(/\s+/g, ' ').trim(),
  line: e.querySelector('.tff-card-line')?.innerText.trim() || '',
  total: e.querySelector('.tff-card-total')?.innerText.replace(/\s+/g, ' ').trim(),
  eur: Number((e.querySelector('.tff-total-eur')?.innerText || '').replace(/[^0-9]/g, '')),
  more: Boolean(e.querySelector('.tff-card-more button[aria-haspopup="menu"]')),
  over: e.querySelector('.tff-card-over')?.innerText.trim() || '',
  old: e.querySelectorAll('.tff-card-see, .tff-cost-toggle, .tff-three, .tff-tick, .tff-budget').length,
  left: Math.round(e.closest('li').getBoundingClientRect().left),
})));

for (const W of WIDTHS) {
  await step(W, 'searching and results', async () => {
    const { ctx, page } = await open(W, draftOf(settings()));
    const cdp = await ctx.newCDPSession(page);
    const seen = await toFinder(page, { watch: true, cdp });
    const lines = seen.lines || [];
    ok(W, 'searching: three stages of real work', lines.length === 3, lines.join(' | '));
    ok(W, 'searching: the flights stage names the airport town and the dates', /^Flights from Brussels, .*21 Nov.* to .*28 Nov/.test(lines[0] || ''), lines[0]);
    ok(W, 'searching: the stays stage names who goes and the nights', /for 2 adults, 7 nights$/.test(lines[1] || ''), lines[1]);
    ok(W, 'searching: the stay type is named from the first frame, no line changes', JSON.stringify(seen.lines) === JSON.stringify(seen.last), `${seen.lines?.[1]} then ${seen.last?.[1]}`);
    ok(W, 'searching: the likes stage names the likes', /hiking, food and wine/.test(lines[2] || ''), lines[2]);
    ok(W, 'searching: no separate food stage', !lines.some((l) => /Food and getting around/.test(l)));
    ok(W, 'searching: the first trips show under the stages (CPU 30x)', seen.early > 0, `${seen.early} cards`);

    const head = await page.locator('.tff-title').innerText();
    ok(W, 'results: "N trips for you"', /^\d+ trips? for you$/.test(head.trim()), head);
    const sum = await page.locator('.tff-summary').innerText();
    ok(W, 'results: the answers in one line (from, when, who, likes)', /From Ghent/.test(sum) && /2 adults/.test(sum) && /hiking, food and wine/.test(sum), sum);
    ok(W, 'results: Edit answers', await page.locator('.tff-edit').count() === 1);
    ok(W, 'results: no levers', await page.locator('.tff-levers, .tff-lever, .tff-adjust, [aria-label="Trade-offs"]').count() === 0);
    const sorts = await page.locator('.tff-sort [role="radio"]').allInnerTexts();
    ok(W, 'results: Sort is Best match, Cheapest, Shortest trip there', sorts.join('|') === 'Best match|Cheapest|Shortest trip there', sorts.join('|'));
    const fits = await page.locator('.tff-sort .seg-item').evaluateAll((els) => els.every((e) => e.scrollWidth <= e.clientWidth + 1));
    ok(W, 'results: the sort fills its box, nothing spills', fits);
    ok(W, 'results: a Map toggle', (await page.locator('.tff-view').innerText()).trim() === 'Map');
    const list = await cards(page);
    const cols = new Set(list.slice(0, 3).map((c) => c.left)).size;
    ok(W, `results: ${W >= 1024 ? 'three' : 'one'} across`, cols === (W >= 1024 ? 3 : 1), `${cols} columns`);
    const sheet = await page.locator('.pf-sheet').evaluate((e) => Math.round(e.getBoundingClientRect().width));
    ok(W, 'results: full width', sheet >= W - 2 * 24 - 2, `${sheet} of ${W}`);
    const c0 = list[0];
    ok(W, 'card: photo, match pill and heart', c0.photo && /% match$/.test(c0.pill) && c0.heart, c0.pill);
    ok(W, 'card: country, nights and bases', /\d+ nights/.test(c0.meta) && /base/.test(c0.meta), c0.meta);
    ok(W, 'card: one reason and one catch in one line', list.every((c) => c.line.split('. ').length <= 3) && c0.line.length > 0, c0.line);
    ok(W, 'card: the total for the group', /for 2, (all in|without the flight)$/.test(c0.total) && c0.eur > 0, c0.total);
    const overs = list.filter((c) => c.eur / 2 > 1201);
    ok(W, 'card: a trip over the budget says so once (the catch or one quiet line)', overs.every((c) => (/over your budget/.test(c.line) ? 1 : 0) + (/over budget/.test(c.over) ? 1 : 0) === 1), `${overs.length} over: ${overs.map((c) => c.over || 'catch').join(', ')}`);
    ok(W, 'card: Compare and Skip only in the menu, no cost fold, no See the trip', list.every((c) => c.more && c.old === 0));
    ok(W, 'results: no sideways scroll', await noSideways(page));
    await shot(page, `02-results-${W}`);

    // The whole card opens the trip (today's TripPreview); its group total is the card's.
    await page.locator('.tff-list .tff-card .tff-card-meta').first().click(); await page.waitForTimeout(900);
    ok(W, 'card: a click on the card opens the trip', await page.locator('.tff-pv').count() === 1);
    const pvGroup = await page.locator('.tff-pv').innerText();
    const pvFig = (pvGroup.match(/For 2 people\s*€?([\d,]+)/) || [])[1];
    ok(W, 'card: the group total equals the trip\'s', pvFig ? Math.abs(n(pvFig) - c0.eur) <= 1 : false, `${pvFig} against ${c0.eur}`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    ok(W, 'card: Escape closes the trip', await page.locator('.tff-pv').count() === 0);

    // The menu: Compare on two, then the table; Skip one, then back.
    const menuOf = (i) => page.locator('.tff-list .tff-card').nth(i).locator('.tff-card-more button[aria-haspopup="menu"]');
    await menuOf(0).click(); await page.waitForTimeout(250);
    const items = await page.locator('.tff-card-pop [role^="menuitem"]').allInnerTexts();
    ok(W, 'menu: Compare and Skip for these answers', items.map((x) => x.trim()).join('|') === 'Compare|Skip for these answers', items.join('|'));
    ok(W, 'menu: focus moves into it', await page.evaluate(() => document.activeElement?.getAttribute('role')?.startsWith('menuitem')));
    await shot(page, `03-menu-${W}`);
    await page.locator('.tff-card-pop [role="menuitemcheckbox"]').click(); await page.waitForTimeout(250);
    await menuOf(1).click(); await page.waitForTimeout(250);
    await page.locator('.tff-card-pop [role="menuitemcheckbox"]').click(); await page.waitForTimeout(300);
    ok(W, 'compare: two ticked show In your comparison', await page.locator('.tff-card.is-ticked').count() === 2);
    const cmpBtn = page.locator('.tff-cmp-open');
    ok(W, 'compare: Compare 2 in the row', (await cmpBtn.innerText().catch(() => '')).trim() === 'Compare 2');
    await cmpBtn.click(); await page.waitForTimeout(800);
    ok(W, 'compare: the table opens', await page.locator('.tff-cmp-table').count() === 1);
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    const before = (await cards(page)).length;
    await menuOf(2).click(); await page.waitForTimeout(250);
    await page.locator('.tff-card-pop [role="menuitem"]').click(); await page.waitForTimeout(500);
    ok(W, 'skip: the trip leaves the list and the line counts it', await page.locator('.tff-hidden').count() === 1, await page.locator('.tff-hidden').innerText().catch(() => ''));
    await page.locator('.tff-hidden button').click(); await page.waitForTimeout(400);
    ok(W, 'skip: Show them again brings it back', (await cards(page)).length === before && await page.locator('.tff-hidden').count() === 0);

    // Sort.
    await page.locator('.tff-sort [role="radio"]').filter({ hasText: 'Cheapest' }).click(); await page.waitForTimeout(600);
    const cheap = (await cards(page)).filter((c) => /all in/.test(c.total)).map((c) => c.eur);
    ok(W, 'sort: Cheapest orders the whole totals up', cheap.every((v, i) => i === 0 || v >= cheap[i - 1]), cheap.join(','));
    await page.locator('.tff-sort [role="radio"]').filter({ hasText: 'Shortest trip there' }).click(); await page.waitForTimeout(600);
    ok(W, 'sort: Shortest trip there keeps every trip', (await cards(page)).length === before);
    await page.locator('.tff-sort [role="radio"]').filter({ hasText: 'Best match' }).click(); await page.waitForTimeout(600);
    ok(W, 'sort: Best match is the first order again', (await cards(page))[0].name === c0.name);

    // Map.
    await page.locator('.tff-view').click();
    await page.locator('.tff-pin').first().waitFor({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const pins = await page.locator('.tff-pin').count();
    ok(W, 'map: a price pin a trip', pins >= Math.min(before, 3), `${pins} pins`);
    ok(W, 'map: the toggle names List', (await page.locator('.tff-view').innerText()).trim() === 'List');
    const pinTxt = await page.locator('.tff-pin').first().innerText().catch(() => '');
    ok(W, 'map: the figure first, then the name', /^€[\d,]+/.test(pinTxt.trim()), pinTxt.replace(/\s+/g, ' '));
    ok(W, 'map: one best-value pin', await page.locator('.tff-pin.is-cheapest').count() === 1);
    const firstCard = await page.locator('.tff-mapcard .tff-card-name').innerText().catch(() => '');
    await page.locator('.tff-pin').nth(1).click({ force: true }).catch(() => {}); await page.waitForTimeout(400);
    const picked = await page.locator('.tff-mapcard .tff-card-name').innerText().catch(() => '');
    ok(W, 'map: a pin picks its trip, the card beside the map follows', picked && picked !== firstCard && await page.locator('.tff-pin.is-picked').count() === 1, `${firstCard} to ${picked}`);
    ok(W, 'map: no sideways scroll', await noSideways(page));
    await shot(page, `04-map-${W}`);
    await page.locator('.tff-view').click(); await page.waitForTimeout(500);
    ok(W, 'map: List brings the gallery back', await page.locator('.tff-list .tff-card').count() > 0);

    // Edit answers lists every answer, who and the likes included.
    await page.locator('.tff-edit').click(); await page.waitForTimeout(300);
    const chips = await page.locator('.tff-ansbar .tff-ans').allInnerTexts();
    ok(W, 'edit: every answer to reopen, who goes too', chips.includes('2 adults') && chips.length >= 6, chips.join(' | '));
    await ctx.close();
  });
}

// A tablet: two across.
await step(800, 'tablet', async () => {
  const { ctx, page } = await open(800, draftOf(settings()));
  await toFinder(page);
  const cols = new Set((await cards(page)).slice(0, 3).map((c) => c.left)).size;
  ok(800, 'results: two across on a tablet', cols === 2, `${cols} columns`);
  await shot(page, '05-results-800');
  await ctx.close();
});

// Named places lead the line; old levers load.
await step(1440, 'places and old levers', async () => {
  const s = settings({ places: [{ kind: 'country', id: 'SI', name: 'Slovenia', iso2: 'SI' }] });
  const { ctx, page } = await open(1440, draftOf(s, { flight: 'quickest', food: 'cook', bases: 'one' }));
  await toFinder(page);
  const sum = await page.locator('.tff-summary').innerText();
  ok(1440, 'the answers line names the places first (row T859-b)', /^Slovenia, From Ghent/.test(sum.trim()), sum);
  ok(1440, 'settings saved with the old levers load, no lever shows', await page.locator('.tff-list .tff-card').count() > 0 && await page.locator('.tff-lever').count() === 0);
  const names = (await cards(page)).map((c) => c.meta);
  ok(1440, 'named Slovenia: the trips are Slovenian', names.every((m) => /Slovenia/.test(m)), names.slice(0, 3).join(' / '));
  await shot(page, '06-places-1440');
  await ctx.close();
});

// The sort fits its box on a phone in the longer languages.
for (const lang of ['de', 'fr', 'nl', 'es', 'it']) {
  await step(375, `sort in ${lang}`, async () => {
    const { ctx, page } = await open(375, draftOf(settings()), { lang });
    await toFinder(page);
    const r = await page.locator('.tff-sort .seg-item').evaluateAll((els) => ({
      fits: els.every((e) => e.scrollWidth <= e.clientWidth + 1), h: els.map((e) => Math.round(e.getBoundingClientRect().height)), txt: els.map((e) => e.innerText.trim()),
    }));
    ok(375, `sort fills its box in ${lang}`, r.fits && new Set(r.h).size === 1, `${r.txt.join(' | ')} ${r.h.join(',')}`);
    ok(375, `no sideways scroll in ${lang}`, await noSideways(page));
    if (lang === 'de') await shot(page, '07-results-de-375');
    await ctx.close();
  });
}

await browser.close();
const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass} of ${results.length} checks pass; ${errors.length} console errors`);
for (const e of errors) console.log('  ', e);
writeFileSync(`${OUT}/walk.json`, JSON.stringify({ results, errors }, null, 2));
