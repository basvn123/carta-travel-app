// T860-T862 end check (plan flow v3, Batch C) on a NOPUBLIC build + public/.
//   node walk-c.mjs <port> <label> [outDir]
// 1. Tell Carta with a stay in the words: the stay chip names the type and
//    opens the stay types alone (the space Segmented fills its box, four
//    tiles each with a typical night, the stars only for Hotel); then the
//    setup asks how to get there and how far to an airport (rows by drive,
//    Liege "No prices yet", 2 hours ticks the covered ones), to the trip.
// 2. Door to door: a trip from Ghent with BRU and EIN ticked, EIN's sweep at
//    half BRU's fares. The cards fly from EIN, Review holds "To the airport
//    and back", the trip page's flight line names EIN and the saving
//    against BRU, one tap swaps to BRU; the stays book by type.
// 3. The settings line's From shows the same airports.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const APP = 'C:/Users/Gebruiker/Documents/Portfolio/Travel App/continent-app';
const { chromium } = await import(`file:///${APP}/node_modules/playwright/index.mjs`);
const { normalizeSettings, draftPatch } = await import(`file:///${APP}/src/planner/flow/tripSettings.js`);
const PORT = process.argv[2] || 5860;
const LABEL = process.argv[3] || 'after';
const OUT = process.argv[4] || `C:/Users/Gebruiker/Documents/Portfolio/Travel App/Execution/P15/T860-T862-walk/${LABEL}`;
const WIDTHS = (process.env.WIDTHS || '1440,375').split(',').map(Number);
mkdirSync(OUT, { recursive: true });
const fx = (n) => JSON.parse(readFileSync(`${APP}/tests/fixtures/${n}`, 'utf8'));
function sweep(from = 'BRU', factor = 1) {
  const f = fx('tf1-flights-BRU.json');
  const at = Math.floor(Date.now() / 60000) - 30;
  for (const side of [f.to, f.back]) for (const days of Object.values(side)) for (const v of Object.values(days)) if (Array.isArray(v)) { v[5] = at; v[0] = Math.round(v[0] * factor); }
  f.checked = at; f.from = from; return f;
}
const AIRLINES = readFileSync('C:/Users/Gebruiker/Documents/Portfolio/wt/t817-airlines-index.json', 'utf8');
const GHENT = { name: 'Ghent', lat: 51.054, lng: 3.717, countryCode: 'BE' };
const settings = (extra = {}) => normalizeSettings({
  answered: ['tell', 'booked', 'who', 'sleep', 'priority', 'when', 'from', 'way', 'airports'],
  party: { kind: 'couple', adults: 2 }, priority: 'balance', when: { mode: 'exact', start: '2026-11-21', end: '2026-11-28', nights: 7 },
  from: GHENT, way: 'plane',
  guide: { shapes: ['towns'], likes: ['hiking', 'food'], weather: 'mild', reach: 'short', avoid: ['crowds'], budget: { kind: 'total', eur: 1200 } },
  trip: { name: 'Door week', created: Date.now() },
  ...extra,
});
const draftOf = (s) => JSON.stringify({ version: 2, savedAt: Date.now(), ...draftPatch(s, {}) });
const results = []; const errors = [];
const ok = (w, label, v, note = '') => { results.push({ w, label, ok: !!v, note }); console.log(`${v ? 'PASS' : 'FAIL'} [${w}] ${label}${note ? `  (${note})` : ''}`); };
const NOISE = /ERR_FAILED|config is not valid|favicon|CORS|Access-Control|net::ERR|Failed to load resource|Download the React DevTools/;
const noSideways = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const browser = await chromium.launch();
const shot = async (page, name, full = false) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); };
const step = async (w, name, fn) => { try { await fn(); } catch (e) { ok(w, `${name} ran`, false, e.message.split('\n')[0]); } };
/** Every segment of every Segmented under `scope` keeps its words inside it. */
const segsFit = (page, scope) => page.evaluate((sc) => [...document.querySelectorAll(`${sc} .seg`)].every((seg) => {
  const box = seg.getBoundingClientRect();
  return [...seg.querySelectorAll('.seg-item')].every((it) => {
    const r = it.getBoundingClientRect();
    return it.scrollWidth <= it.clientWidth + 1 && r.right <= box.right + 1 && r.left >= box.left - 1;
  }) && box.right <= (seg.parentElement.getBoundingClientRect().right + 1);
}), scope);

async function context(W, { draft = null, files = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: W, height: W < 500 ? 812 : 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${W}] pageerror: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(`[${W}] console: ${m.text().slice(0, 200)}`); });
  await page.route('**/flights/*.json', (r) => {
    const code = r.request().url().match(/flights\/([A-Z_a-z]+)\.json/)?.[1];
    if (code === '_index') return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: AIRLINES });
    const f = code === 'BRU' ? sweep('BRU') : files[code];
    return f ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }) : r.fulfill({ status: 404, body: '' });
  });
  await page.route('**/api/flights**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.addInitScript((dd) => { try {
    localStorage.setItem('continent.lang.v1', 'en'); localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1'); localStorage.setItem('carta.welcomeSeen', '1'); localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    if (dd && !sessionStorage.getItem('seeded')) { localStorage.setItem('carta.plannerDraft.v1', dd); sessionStorage.setItem('seeded', '1'); }
  } catch { /* storage */ } }, draft);
  return { ctx, page };
}
const nav = (page, re) => page.locator('.header-nav-item:visible, nav.bottom-nav[aria-label="Sections"] .bottom-nav-item:visible').filter({ hasText: re }).first();
const title = (page) => page.locator('.pf-title').first().innerText().catch(() => '').then((x) => x.trim());
const prim = (page) => page.locator('.pf .pf-foot .btn-primary').last();

// ---- 1. Tell Carta, the stay types, the way there and the airports ----
for (const W of WIDTHS) {
  await step(W, 'setup', async () => {
    const { ctx, page } = await context(W);
    await page.goto(`http://localhost:${PORT}/?o=BRU`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(2500);
    await nav(page, /Plan/).click(); await page.waitForTimeout(1500);
    await page.locator('.pf-open-start').click(); await page.waitForTimeout(900);
    await page.locator('.pf .pf-foot .btn-primary').first().click(); await page.waitForTimeout(900);
    const field = page.locator('#pf-tell');
    await field.click();
    await field.pressSequentially('A week in Portugal with my partner in May, from Ghent, in a flat', { delay: 6 });
    await page.waitForTimeout(900);
    const chips = await page.locator('.pf-read-chips .pf-read-chip').allInnerTexts();
    ok(W, 'the stay chip names the type', chips.some((c) => c.trim() === 'Apartment or holiday home'), chips.join(' | '));
    ok(W, 'the way there and the airports are dashed chips', chips.some((c) => /How to get there/.test(c)) && chips.some((c) => /Which airports/.test(c)), chips.filter((c) => /\?/.test(c)).join(' | '));
    // The stay chip opens the stay types alone.
    await page.locator('.pf-read-chip').filter({ hasText: 'Apartment or holiday home' }).click(); await page.waitForTimeout(1200);
    const pop = page.locator('.fsheet.pf-read-pop');
    ok(W, 'the stay chip opens the stay types alone (no spend, no counts)', await pop.locator('.pf-stay').count() === 1 && await pop.locator('.pf-ls-tune').count() === 0);
    ok(W, 'Either shows the four types', await pop.locator('.pf-stay-tiles .ui-tile').count() === 4);
    const prices = await pop.locator('.pf-stay-price').allInnerTexts();
    ok(W, 'every type has a typical night a person', prices.length === 4 && prices.every((p) => /a person a night/.test(p)), prices.join(' | '));
    ok(W, 'the space Segmented fills its box, no word spills', await segsFit(page, '.pf-read-pop'));
    ok(W, 'the apartment is picked (the words said a flat)', /Apartment/.test(await pop.locator('.ui-tile.is-selected').innerText()));
    await shot(page, `01-stay-types-${W}`);
    await pop.getByRole('radio', { name: 'A room' }).click(); await page.waitForTimeout(400);
    const rooms = await pop.locator('.pf-stay-tiles .ui-tile .pf-stay-name').allInnerTexts();
    ok(W, 'A room shows Hotel, Room in a home, Hostel', rooms.join('|') === 'Hotel|Room in a home|Hostel', rooms.join(' | '));
    await pop.locator('.pf-stay-tiles .ui-tile').filter({ hasText: 'Hotel' }).click(); await page.waitForTimeout(400);
    ok(W, 'the stars show for Hotel only', await pop.locator('.pf-stay-stars').count() === 1);
    ok(W, 'the stars fill their box too', await segsFit(page, '.pf-read-pop'));
    await shot(page, `02-stay-hotel-${W}`);
    await pop.locator('.pf-stay-tiles .ui-tile').filter({ hasText: 'Hostel' }).click(); await page.waitForTimeout(300);
    ok(W, 'no stars for Hostel', await pop.locator('.pf-stay-stars').count() === 0);
    await pop.getByRole('radio', { name: 'A whole place' }).click(); await page.waitForTimeout(300);
    ok(W, 'A whole place shows the apartment alone and picks it', await pop.locator('.pf-stay-tiles .ui-tile').count() === 1 && /Apartment/.test(await pop.locator('.ui-tile.is-selected').innerText()));
    await pop.getByRole('button', { name: 'Save' }).click(); await page.waitForTimeout(700);
    // Continue through the open questions to the way and the airports.
    await prim(page).click(); await page.waitForTimeout(900);
    const asked = [];
    for (let k = 0; k < 6; k++) {
      const tt = await title(page);
      asked.push(tt);
      if (/get there/i.test(tt)) break;
      await prim(page).click(); await page.waitForTimeout(900);
    }
    ok(W, 'the setup asks how to get there after the town', /How do you want to get there/.test(asked.at(-1)), asked.join(' | '));
    const ways = await page.locator('.pf .ui-crow .ui-crow-label').allInnerTexts();
    ok(W, 'four ways: Any way, Fly, Train, Car', ways.join('|') === 'Any way|Fly|Train|Car', ways.join(' | '));
    await page.locator('.pf .ui-crow').filter({ hasText: 'Fly' }).click();
    await shot(page, `03-way-${W}`);
    await prim(page).click(); await page.waitForTimeout(1200);
    ok(W, 'then how far to an airport', /How far would you go to an airport/.test(await title(page)), await title(page));
    const rows = await page.locator('.pf-reach .ui-crow').evaluateAll((els) => els.map((e) => ({ label: e.querySelector('.ui-crow-label').textContent, sub: e.querySelector('.ui-crow-sub')?.textContent || '', on: e.getAttribute('aria-checked') === 'true', off: e.disabled })));
    ok(W, 'airports in reach, nearest drive first, each with its drive', rows.length >= 6 && /Brussels \(BRU\)|Antwerp \(ANR\)/.test(rows[0].label) && rows.every((r) => /by car/.test(r.sub)), rows.map((r) => `${r.label} ${r.sub}`).slice(0, 4).join(' | '));
    const lgg = rows.find((r) => /LGG/.test(r.label));
    ok(W, 'Liege has no prices yet and cannot be ticked', lgg && lgg.off && /No prices yet/.test(lgg.sub) && !lgg.on, lgg ? `${lgg.label} ${lgg.sub}` : 'no LGG row');
    const ticked2 = rows.filter((r) => r.on).map((r) => r.label);
    ok(W, '2 hours is the default and ticks the covered airports inside it', await page.locator('.pf-reach .seg-item[aria-checked="true"]').innerText() === '2 hours' && ticked2.length >= 3 && ticked2.some((x) => /BRU/.test(x)) && ticked2.some((x) => /EIN/.test(x)), ticked2.join(', '));
    ok(W, 'the reach Segmented fills its box', await segsFit(page, '.pf-reach'));
    ok(W, 'airports: no sideways scroll', await noSideways(page));
    await shot(page, `04-airports-${W}`);
    await page.locator('.pf-reach').getByRole('radio', { name: '1 hour' }).click(); await page.waitForTimeout(300);
    const ticked1 = await page.locator('.pf-reach .ui-crow[aria-checked="true"]').count();
    ok(W, '1 hour ticks fewer', ticked1 >= 1 && ticked1 < ticked2.length, `${ticked1} against ${ticked2.length}`);
    await page.locator('.pf-reach .ui-crow').filter({ hasText: 'EIN' }).click(); await page.waitForTimeout(300);
    ok(W, 'a tap on a row switches to Pick', await page.locator('.pf-reach .seg-item[aria-checked="true"]').innerText() === 'Pick');
    await prim(page).click(); await page.waitForTimeout(1200);
    const url = page.url();
    ok(W, 'the airports are the app\'s own choice (oa and ah in the address)', /[?&]oa=[A-Z.]*EIN/.test(url) && /[?&]ah=p/.test(url), url.split('?')[1]?.slice(0, 120));
    for (let k = 0; k < 3 && !(await page.locator('.pf-home').count()); k++) {
      await page.locator('.pf .pf-foot .btn-primary:visible').last().click().catch(() => {}); await page.waitForTimeout(1200);
    }
    ok(W, 'the setup ends on the trip', await page.locator('.pf-home').count() > 0);
    await ctx.close();
  });
}

// ---- 2. Door to door from BRU and EIN ----
for (const W of WIDTHS) {
  await step(W, 'door to door', async () => {
    const files = { EIN: sweep('EIN', 0.5) };
    const { ctx, page } = await context(W, { draft: draftOf(settings()), files });
    await page.goto(`http://localhost:${PORT}/?o=BRU&oa=BRU.EIN&ah=p&dh=51.0540,3.7170,Ghent`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(2500);
    await nav(page, /Plan/).click(); await page.waitForTimeout(1500);
    await page.locator('.pf-trip-link').filter({ hasText: 'Door week' }).first().click(); await page.waitForTimeout(1500);
    await page.locator('.pf').getByRole('button', { name: 'Start planning' }).click(); await page.waitForTimeout(600);
    await page.locator('.pf .pf-foot').getByRole('button', { name: 'Continue' }).click();
    for (let i = 0; i < 9; i++) {
      await page.waitForTimeout(450);
      if (await page.locator('.tff-trips').count()) break;
      const p = prim(page);
      if (await p.count() && await p.isEnabled()) await p.click(); else await page.locator('.pf .pf-foot button:not([disabled])').first().click().catch(() => {});
    }
    await page.locator('.tff-trips').waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    await shot(page, `05-results-${W}`);
    const card = page.locator('.tff-card').first();
    await card.locator('.tff-card-meta').click(); await page.waitForTimeout(900);
    await page.locator('.tff-pv').getByRole('button', { name: 'Plan this trip' }).click(); await page.waitForTimeout(3500);
    for (let k = 0; k < 4 && !(await page.locator('#leg-out').count()); k++) {
      await page.locator('.guide-next:visible').first().click().catch(() => {}); await page.waitForTimeout(2000);
    }
    const legOut = ((await page.locator('body').innerText().catch(() => '')).match(/From Ghent \(([A-Z]{3})\)/) || [])[1] || '';
    ok(W, 'the first trip for you flies from Eindhoven (half the fare beats the longer drive), handed to Getting there', legOut === 'EIN', 'Getting there: From Ghent (' + legOut + ')');
    await shot(page, '06-getting-there-' + W);
    await page.locator('.guide-next:visible').first().click(); await page.waitForTimeout(2500);
    const lines = await page.locator('.wz-rev-lines').innerText().catch(() => '');
    ok(W, 'Review holds the way to the airport and back as its own line', /To the airport and back/.test(lines), lines.replace(/\s+/g, ' ').slice(0, 160));
    await shot(page, `06-review-${W}`);
    await page.locator('.guide-next:visible').first().click(); await page.waitForTimeout(3500);
    const tab = (name) => page.locator('.tpg-tabs [role="tab"]').filter({ hasText: name });
    if (await tab('Itinerary').count()) { await tab('Itinerary').click(); await page.waitForTimeout(2000); }
    const air = (await page.locator('.itin-air').innerText().catch(() => '')).trim();
    ok(W, 'the flight line names Eindhoven and the saving against Brussels', /Eindhoven \(EIN\)/.test(air) && /less door to door than Brussels \(BRU\)/.test(air), air);
    const finds = await page.locator('.itin-bed-acts .itin-find').allInnerTexts();
    ok(W, 'an apartment stay books on Booking.com apartments and Airbnb', finds.includes('Find on Booking.com') && finds.includes('Find on Airbnb'), finds.slice(0, 4).join(' | '));
    const href = await page.locator('.itin-bed-acts .itin-find').first().getAttribute('href');
    ok(W, 'the Booking.com link has the apartments filter', /nflt=ht_id%3D201/.test(href || ''), (href || '').slice(0, 90));
    ok(W, 'trip page: no sideways scroll', await noSideways(page));
    await page.locator('.itin-air').scrollIntoViewIfNeeded().catch(() => {});
    await shot(page, `07-trip-airport-${W}`);
    await page.locator('.itin-air-swap').click(); await page.waitForTimeout(2500);
    const air2 = (await page.locator('.itin-air').innerText().catch(() => '')).trim();
    ok(W, 'one tap swaps to Brussels, the nearest', /Flies from Brussels \(BRU\), your nearest airport/.test(air2), air2);
    if (await tab('Costs').count()) { await tab('Costs').click(); await page.waitForTimeout(1500); }
    const costs = await page.locator('.tpg-main').innerText().catch(() => '');
    ok(W, 'the costs hold the way to the airport and back', /To the airport and back/.test(costs));
    await ctx.close();
  });
}

// ---- 3. The settings line's From shows the same airports ----
for (const W of WIDTHS) {
  await step(W, 'settings line', async () => {
    const { ctx, page } = await context(W);
    await page.goto(`http://localhost:${PORT}/?o=BRU&oa=BRU.CRL.EIN&ah=2&dh=51.0540,3.7170,Ghent&tab=places`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(3000);
    if (W >= 769) {
      const from = page.locator('.settings-line .settings-slot-origin button').first();
      await from.click(); await page.waitForTimeout(700);
    } else {
      await page.locator('.settings-line button').first().click(); await page.waitForTimeout(900);
    }
    const sec = page.locator('.settings-airports:visible');
    ok(W, 'the From control shows the airports in reach', await sec.count() === 1);
    const on = await sec.locator('.ui-crow[aria-checked="true"]').allInnerTexts().catch(() => []);
    ok(W, 'with the planner\'s ticks', on.length >= 3, on.map((x) => x.split('\n')[0]).join(', '));
    ok(W, 'the From control: no sideways scroll', await noSideways(page));
    await shot(page, `08-settings-from-${W}`);
    await ctx.close();
  });
}

await browser.close();
const fails = results.filter((r) => !r.ok);
writeFileSync(`${OUT}/walk.json`, JSON.stringify({ results, errors }, null, 1));
console.log(`\n${results.length - fails.length}/${results.length} pass; errors: ${errors.length}`);
for (const e of errors.slice(0, 20)) console.log('  ', e);
