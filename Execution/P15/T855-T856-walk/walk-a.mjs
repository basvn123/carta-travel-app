// T855-T856 end check (plan flow v3, Batch A) on a NOPUBLIC build + public/.
//   node walk-a.mjs <port> <label> [outDir]
// The trip finder at 5 to 12 December from BRU (the T795 sweep fixture has no
// fare for most exact days, so the cards price the nearest swept day). For
// each of the first five cards: the card's total, then Plan this trip,
// Getting there, Review (its total and any "Add your fare"), Finish and the
// trip page's total and its Itinerary. Then T856: Start planning over a
// stale draft, and the way of travel (?t=train) on Getting there.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const APP = 'C:/Users/Gebruiker/Documents/Portfolio/Travel App/continent-app';
const { chromium } = await import(`file:///${APP}/node_modules/playwright/index.mjs`);
const { normalizeSettings, draftPatch } = await import(`file:///${APP}/src/planner/flow/tripSettings.js`);
const PORT = process.argv[2] || 5856;
const LABEL = process.argv[3] || 'after';
const OUT = process.argv[4] || `C:/Users/Gebruiker/Documents/Portfolio/Travel App/Execution/P15/T855-T856-walk/${LABEL}`;
const WIDTHS = (process.env.WIDTHS || '1440,375').split(',').map(Number);
const TRIPS = Number(process.env.TRIPS || 5);
// WHEN=start,end and PICK=<card name part> walk one named card (row T802-c: Augsburg, 21 to 28 November).
const WHEN = (process.env.WHEN || '2026-12-05,2026-12-12').split(',');
const PICK = process.env.PICK || '';
mkdirSync(OUT, { recursive: true });
const fx = (n) => JSON.parse(readFileSync(`${APP}/tests/fixtures/${n}`, 'utf8'));
function sweep() {
  const f = fx('tf1-flights-BRU.json');
  const at = Math.floor(Date.now() / 60000) - 30;
  for (const side of [f.to, f.back]) for (const days of Object.values(side)) for (const v of Object.values(days)) if (Array.isArray(v)) v[5] = at;
  f.checked = at; return f;
}
const LIVE = fx('tf1-live-BRU-LJU.json');
const AIRLINES = readFileSync('C:/Users/Gebruiker/Documents/Portfolio/wt/t817-airlines-index.json', 'utf8');
const settings = (extra = {}) => normalizeSettings({
  answered: ['tell', 'booked', 'who', 'sleep', 'priority', 'when', 'from'],
  party: { kind: 'couple', adults: 2 }, priority: 'balance', when: { mode: 'exact', start: WHEN[0], end: WHEN[1], nights: 7 },
  guide: { shapes: ['towns'], likes: ['hiking', 'food'], weather: 'mild', reach: 'short', avoid: ['crowds'], budget: { kind: 'total', eur: 1200 } },
  trip: { name: 'Winter week', created: Date.now() },
  ...extra,
});
const draftOf = (s) => JSON.stringify({ version: 2, savedAt: Date.now(), ...draftPatch(s, {}) });
const results = []; const errors = []; const rows = [];
const ok = (w, label, v, note = '') => { results.push({ w, label, ok: !!v, note }); console.log(`${v ? 'PASS' : 'FAIL'} [${w}] ${label}${note ? `  (${note})` : ''}`); };
const NOISE = /ERR_FAILED|config is not valid|favicon|CORS|Access-Control|net::ERR|Failed to load resource|Download the React DevTools/;
const noSideways = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const n = (s) => Number(String(s).replace(/[^0-9.]/g, ''));
const browser = await chromium.launch();
const shot = async (page, name, full = false) => { await page.waitForTimeout(600); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); };
const step = async (w, name, fn) => { try { await fn(); } catch (e) { ok(w, `${name} ran`, false, e.message.split('\n')[0]); } };
const addFare = (page, scope) => page.locator(`${scope} :is(button,a):visible`).filter({ hasText: /^\s*Add your fare\s*$/ }).count();

async function open(W, draft, query = '') {
  const ctx = await browser.newContext({ viewport: { width: W, height: W < 500 ? 812 : 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${W}] pageerror: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(`[${W}] console: ${m.text().slice(0, 200)}`); });
  await page.route('**/flights/BRU.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sweep()) }));
  // The live search fails, as on a localhost build (T802-c's browser case).
  await page.route('**/api/flights**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.route('**/flights/_index.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: AIRLINES }));
  await page.addInitScript((dd) => { try {
    localStorage.setItem('continent.lang.v1', 'en'); localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1'); localStorage.setItem('carta.welcomeSeen', '1'); localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem('carta.plannerDraft.v1', dd); sessionStorage.setItem('seeded', '1'); }
  } catch { /* storage */ } }, draft);
  await page.goto(`http://localhost:${PORT}/?o=BRU${query}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(2500);
  const nav = (re) => page.locator('.header-nav-item:visible, nav.bottom-nav[aria-label="Sections"] .bottom-nav-item:visible').filter({ hasText: re }).first();
  await nav(/Plan/).click(); await page.waitForTimeout(1500);
  return { ctx, page };
}

/** From the Plan home: the seeded trip, Start planning, Help me choose, through the answered questions to Trips for you. */
async function toFinder(page) {
  await page.locator('.pf-trip-link').filter({ hasText: 'Winter week' }).first().click(); await page.waitForTimeout(1500);
  await page.locator('.pf').getByRole('button', { name: 'Start planning' }).click(); await page.waitForTimeout(600);
  await page.locator('.pf .pf-foot').getByRole('button', { name: 'Continue' }).click();
  for (let i = 0; i < 9; i++) {
    await page.waitForTimeout(450);
    if (await page.locator('.tff-trips').count()) break;
    const prim = page.locator('.pf .pf-foot .btn-primary').last();
    if (await prim.count() && await prim.isEnabled()) await prim.click(); else await page.locator('.pf .pf-foot button:not([disabled])').first().click().catch(() => {});
  }
  await page.locator('.tff-trips').waitFor({ timeout: 25000 });
  await page.waitForTimeout(1500);
}

/** The trip page's group total (the Overview band). */
async function pageTotal(page) {
  const tab = (name) => page.locator('.tpg-tabs [role="tab"]').filter({ hasText: name });
  if (await tab('Overview').count()) { await tab('Overview').click(); await page.waitForTimeout(700); }
  return Number(await page.locator('[data-total]').first().getAttribute('data-total').catch(() => 'NaN'));
}

for (const W of WIDTHS) {
  const count = W < 500 ? Math.min(2, TRIPS) : TRIPS;
  for (let i = 0; i < count; i++) {
    const { ctx, page } = await open(W, draftOf(settings()));
    await step(W, `trip ${i + 1}`, async () => {
      await toFinder(page);
      if (i === 0) { ok(W, 'no sideways scroll (results)', await noSideways(page)); await shot(page, `01-results-${W}`); }
      const card = PICK ? page.locator('.tff-card').filter({ hasText: PICK }).first() : page.locator('.tff-card').nth(i);
      const name = (await card.locator('.tff-card-name').innerText()).trim();
      const cardPp = n(await card.locator('.tff-total-eur').innerText());
      // A card priced with no flight says so ("without the flight"); T855 is about the ones with one.
      const cardFlight = !/without the flight/i.test(await card.locator('.tff-total').innerText());
      await card.locator('.tff-card-meta').click(); await page.waitForTimeout(900);
      await page.locator('.tff-pv').getByRole('button', { name: 'Plan this trip' }).click(); await page.waitForTimeout(3500);
      for (let k = 0; k < 4 && !(await page.locator('#leg-out').count()); k++) {
        await page.locator('.guide-next:visible').first().click().catch(() => {}); await page.waitForTimeout(2000);
      }
      const outMode = await page.evaluate(() => {
        const on = document.querySelector('#leg-out .wz-modes [aria-checked="true"], #leg-out .wz-modes [aria-pressed="true"]');
        return on ? on.textContent.trim() : '';
      });
      const getAdd = await addFare(page, '#leg-out, #leg-back');
      const flightRows = await page.locator('#leg-out .wz-fl').count();
      if (i === 0) { ok(W, 'no sideways scroll (Getting there)', await noSideways(page)); await shot(page, `02-getting-there-${W}`); await shot(page, `02-getting-there-full-${W}`, true); }
      await page.locator('.guide-next:visible').first().click(); await page.waitForTimeout(2500);
      const lines = await page.locator('.wz-rev-lines').innerText().catch(() => '');
      const reviewGroup = n((lines.match(/Total for \d+ people\s*(€[\d,.]+)/) || ['', ''])[1]);
      const reviewAdd = await addFare(page, '.wz-rev-lines');
      if (i === 0) { ok(W, 'no sideways scroll (Review)', await noSideways(page)); await shot(page, `03-review-${W}`); }
      await page.locator('.guide-next:visible').first().click(); await page.waitForTimeout(3500);
      const tripGroup = await pageTotal(page);
      const tab = page.locator('.tpg-tabs [role="tab"]').filter({ hasText: 'Itinerary' });
      if (await tab.count()) { await tab.click(); await page.waitForTimeout(2000); }
      const itin = await page.locator('.tpg-main').innerText().catch(() => '');
      const pageAdd = (itin.match(/Add your fare/g) || []).length;
      if (i === 0) { ok(W, 'no sideways scroll (trip page)', await noSideways(page)); await shot(page, `04-trip-itinerary-${W}`); }
      const row = { w: W, build: LABEL, i: i + 1, name, cardFlight, cardPp, cardGroup: cardPp * 2, reviewGroup, reviewAdd, tripGroup, pageAdd, outMode, getAdd, flightRows };
      rows.push(row);
      console.log(JSON.stringify(row));
      if (!cardFlight) { ok(W, `trip ${i + 1} ${name}: priced with no flight, recorded only`, true, `Review ${reviewGroup}, card ${cardPp} a person`); return; }
      ok(W, `trip ${i + 1} ${name}: Review total is the card's (whole euros)`, Math.abs(reviewGroup - cardPp * 2) <= 2, `Review ${reviewGroup}, card ${cardPp} a person`);
      ok(W, `trip ${i + 1} ${name}: trip page total is the card's`, Math.abs(tripGroup - cardPp * 2) <= 2, `trip page ${tripGroup}`);
      ok(W, `trip ${i + 1} ${name}: Review has no Add your fare`, reviewAdd === 0, String(reviewAdd));
      ok(W, `trip ${i + 1} ${name}: Getting there flies out`, /plane|fly|flight/i.test(outMode) && flightRows >= 1, `${outMode}, ${flightRows} rows`);
    });
    await ctx.close();
  }

  if (PICK) continue;
  // T856: Start planning over a stale draft (answers, no trip made) starts clean.
  await step(W, 'clean draft', async () => {
    const stale = JSON.stringify({ version: 2, savedAt: Date.now(), settings: { answered: ['tell', 'booked', 'who', 'sleep', 'priority'], party: { kind: 'couple', adults: 2 }, note: '', trip: { name: '', created: 0 } } });
    const { ctx, page } = await open(W, stale);
    await page.locator('.pf-open-start').click(); await page.waitForTimeout(900);
    // The kind sheet, then Tell Carta.
    await page.locator('.pf .pf-foot').getByRole('button', { name: 'Continue' }).click().catch(() => {}); await page.waitForTimeout(700);
    const field = page.locator('.pf textarea, .pf input[type="text"]').first();
    await field.fill('A family of four with two kids in July, cheap please');
    if (W === WIDTHS[0]) await shot(page, `05-tell-${W}`);
    await page.locator('.pf .pf-foot .btn-primary').last().click(); await page.waitForTimeout(900);
    const title = (await page.locator('.pf-title').first().innerText().catch(() => '')).trim();
    ok(W, 'after the words, the next screen is not Who (the words answered it)', !/who/i.test(title), title);
    // Through to the trip's page; it names the family.
    for (let k = 0; k < 10 && !(await page.locator('.pf-home').count()); k++) {
      const prim = page.locator('.pf .pf-foot .btn-primary:visible').first();
      if (await prim.count() && await prim.isEnabled()) await prim.click(); else await page.locator('.pf .pf-foot button:visible').first().click();
      await page.waitForTimeout(700);
    }
    const head = await page.locator('.pf-home').innerText().catch(() => '');
    ok(W, 'the new plan carries the words: a family with children', /child/i.test(head), head.replace(/\s+/g, ' ').slice(0, 120));
    await ctx.close();
  });

  // T856: the way of travel (?t=train) seeds the hops between stops, a finder
  // trip priced on a flight still flies there and home, and the origin the
  // setup gave (Ghent) is a settled line on Getting there, not a question.
  await step(W, 'way of travel', async () => {
    const { ctx, page } = await open(W, draftOf(settings({ from: { name: 'Ghent', lat: 51.05, lng: 3.72, countryCode: 'BE' } })), '&t=train');
    await toFinder(page);
    const card = page.locator('.tff-card').filter({ hasText: ' and ' }).first();
    await card.locator('.tff-card-meta').click(); await page.waitForTimeout(900);
    await page.locator('.tff-pv').getByRole('button', { name: 'Plan this trip' }).click(); await page.waitForTimeout(3500);
    for (let k = 0; k < 4 && !(await page.locator('#leg-out').count()); k++) {
      await page.locator('.guide-next:visible').first().click().catch(() => {}); await page.waitForTimeout(2000);
    }
    const modes = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.wz-leg')].map((l) => {
      const on = l.querySelector('.wz-modes [aria-checked="true"], .wz-modes [aria-pressed="true"]');
      return [l.id, on ? on.textContent.trim() : ''];
    })));
    ok(W, 'with the way set to train, the finder trip still flies out and home', /flight/i.test(modes['leg-out'] || '') && /flight/i.test(modes['leg-back'] || ''), JSON.stringify(modes));
    ok(W, 'with the way set to train, the hop between stops is a train', /train/i.test(modes['leg-leg0'] || ''), modes['leg-leg0'] || 'no hop');
    const line = await page.locator('.worigin').first().innerText().catch(() => '');
    ok(W, "the origin the setup gave is a line on Getting there naming the priced airport (no search field)", /Ghent \(BRU\)/.test(line) && !(await page.locator('#worigin-q:visible').count()), line.replace(/\s+/g, ' ').slice(0, 80));
    await shot(page, `06-getting-there-way-${W}`);
    await ctx.close();
  });
}
await browser.close();
const fails = results.filter((r) => !r.ok);
writeFileSync(`${OUT}/walk.json`, JSON.stringify({ results, rows, errors }, null, 1));
console.log(`\n${results.length - fails.length}/${results.length} pass; errors: ${errors.length}`);
for (const e of errors.slice(0, 20)) console.log('  ', e);
