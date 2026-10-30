// T863-T866 end check (plan flow v3, Batch D) on a NOPUBLIC build + public/.
//   node walk-d.mjs <port> <label> [outDir]
// 1. The doors: Tell Carta with "just a cheap flight" preselects Find my
//    flight first; four tiles, a line icon and one title each, no subtext.
// 2. Find my flight first: a seeded trip (two, 21 to 28 Nov, from Ghent with
//    BRU) lists one row a place cheapest first with the airline, the times,
//    the stops and the fare for two; a pick lands on the trip page with that
//    flight, and Plan the rest opens the Itinerary's Add a stop.
// 3. I know where: two named towns preselected, a third added and taken
//    away, Draft my route lands on the trip page with the towns in order.
// 4. I've booked part of it: a flight there and home and a stay in Prague,
//    one more stay typed in; Plan around it lands on the trip page with the
//    booked parts marked Booked and the flight the traveller's own.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const APP = 'C:/Users/Gebruiker/Documents/Portfolio/Travel App/continent-app';
const { chromium } = await import(`file:///${APP}/node_modules/playwright/index.mjs`);
const { normalizeSettings, draftPatch } = await import(`file:///${APP}/src/planner/flow/tripSettings.js`);
const PORT = process.argv[2] || 5863;
const LABEL = process.argv[3] || 'after';
const OUT = process.argv[4] || `C:/Users/Gebruiker/Documents/Portfolio/Travel App/Execution/P15/T863-T866-walk/${LABEL}`;
const WIDTHS = (process.env.WIDTHS || '1440,375').split(',').map(Number);
mkdirSync(OUT, { recursive: true });
const fx = (n) => JSON.parse(readFileSync(`${APP}/tests/fixtures/${n}`, 'utf8'));
function sweep(from = 'BRU') {
  const f = fx('tf1-flights-BRU.json');
  const at = Math.floor(Date.now() / 60000) - 30;
  for (const side of [f.to, f.back]) for (const days of Object.values(side)) for (const v of Object.values(days)) if (Array.isArray(v)) v[5] = at;
  f.checked = at; f.from = from; return f;
}
const AIRLINES = readFileSync('C:/Users/Gebruiker/Documents/Portfolio/wt/t817-airlines-index.json', 'utf8');
const GHENT = { name: 'Ghent', lat: 51.054, lng: 3.717, countryCode: 'BE' };
const town = (id, name, iso2, country) => ({ kind: 'place', id, name, iso2, country });
const settings = (extra = {}) => normalizeSettings({
  answered: ['tell', 'booked', 'who', 'sleep', 'priority', 'when', 'from', 'way', 'airports'],
  party: { kind: 'couple', adults: 2 }, priority: 'balance', when: { mode: 'exact', start: '2026-11-21', end: '2026-11-28', nights: 7 },
  from: GHENT, way: 'plane',
  guide: { likes: [] },
  ...extra,
  trip: { name: 'Door week', created: Date.now(), ...(extra.trip || {}) },
});
const draftOf = (s) => JSON.stringify({ version: 2, savedAt: Date.now(), ...draftPatch(s, {}) });
const results = []; const errors = [];
const ok = (w, label, v, note = '') => { results.push({ w, label, ok: !!v, note }); console.log(`${v ? 'PASS' : 'FAIL'} [${w}] ${label}${note ? `  (${note})` : ''}`); };
const NOISE = /ERR_FAILED|config is not valid|favicon|CORS|Access-Control|net::ERR|Failed to load resource|Download the React DevTools/;
const noSideways = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const browser = await chromium.launch();
const shot = async (page, name, full = false) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); };
const step = async (w, name, fn) => { try { await fn(); } catch (e) { ok(w, `${name} ran`, false, e.message.split('\n')[0]); } };

async function context(W, { draft = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: W, height: W < 500 ? 812 : 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${W}] pageerror: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(`[${W}] console: ${m.text().slice(0, 200)}`); });
  await page.route('**/flights/*.json', (r) => {
    const code = r.request().url().match(/flights\/([A-Z_a-z]+)\.json/)?.[1];
    if (code === '_index') return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: AIRLINES });
    return code === 'BRU' ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sweep('BRU')) }) : r.fulfill({ status: 404, body: '' });
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
const URL0 = (p) => `http://localhost:${p}/?o=BRU&oa=BRU&ah=p&dh=51.0540,3.7170,Ghent`;

/** Open the seeded trip from the Plan home and go to the doors. */
async function toDoors(page) {
  await page.goto(URL0(PORT), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(2500);
  await nav(page, /Plan/).click(); await page.waitForTimeout(1500);
  await page.locator('.pf-trip-link').filter({ hasText: 'Door week' }).first().click(); await page.waitForTimeout(1500);
  await page.locator('.pf').getByRole('button', { name: 'Start planning' }).click(); await page.waitForTimeout(700);
}
const doorState = (page) => page.locator('.pf-doors .pf-door').evaluateAll((els) => els.map((e) => ({
  door: e.dataset.door, text: e.innerText.trim(), on: e.getAttribute('aria-checked') === 'true', h: Math.round(e.getBoundingClientRect().height),
  svg: Boolean(e.querySelector('.ui-tile-icon svg')), labels: e.querySelectorAll('.ui-tile-label').length,
})));
/** The trip page's route rows as text. */
const routeText = (page) => page.locator('.ts-route').innerText().catch(() => '');

// ---- 1. The doors, preselected by the words ----
for (const W of WIDTHS) {
  await step(W, 'doors from the words', async () => {
    const { ctx, page } = await context(W);
    await page.goto(URL0(PORT), { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(2500);
    await nav(page, /Plan/).click(); await page.waitForTimeout(1500);
    await page.locator('.pf-open-start').click(); await page.waitForTimeout(900);
    await page.locator('.pf .pf-foot .btn-primary').first().click(); await page.waitForTimeout(900);
    const field = page.locator('#pf-tell');
    await field.click();
    await field.pressSequentially('Just a cheap flight for two in November from Ghent, nothing booked', { delay: 5 });
    await page.waitForTimeout(900);
    await prim(page).click(); await page.waitForTimeout(900);
    for (let k = 0; k < 9 && !(await page.locator('.pf-home').count()); k++) {
      await page.locator('.pf .pf-foot .btn-primary:visible').last().click().catch(() => {}); await page.waitForTimeout(1000);
    }
    ok(W, 'the setup ends on the trip', await page.locator('.pf-home').count() > 0);
    await page.locator('.pf').getByRole('button', { name: 'Start planning' }).click(); await page.waitForTimeout(800);
    ok(W, 'the doors ask how much Carta plans', /How much should Carta plan/.test(await title(page)), await title(page));
    const doors = await doorState(page);
    ok(W, 'four doors in order', doors.map((d) => d.door).join(',') === 'guide,flight,know,booked', doors.map((d) => d.door).join(','));
    ok(W, 'each door one title, no subtext', doors.map((d) => d.text).join('|') === "Plan the whole trip for me|Find my flight first|I know where I'm going|I've booked part of it" && doors.every((d) => d.labels === 1), doors.map((d) => d.text).join(' | '));
    ok(W, 'each door a line icon', doors.every((d) => d.svg));
    ok(W, '"just a cheap flight" preselects Find my flight first', doors.find((d) => d.on)?.door === 'flight', doors.find((d) => d.on)?.door);
    ok(W, 'the four tiles are one height', new Set(doors.map((d) => d.h)).size === 1, doors.map((d) => d.h).join(','));
    ok(W, 'the doors are a radio group (arrow keys move)', await page.locator('.pf-doors[role="radiogroup"]').count() === 1);
    ok(W, 'doors: no sideways scroll', await noSideways(page));
    await shot(page, `01-doors-${W}`);
    await ctx.close();
  });
}

// ---- 2. Find my flight first ----
for (const W of WIDTHS) {
  await step(W, 'flight first', async () => {
    const { ctx, page } = await context(W, { draft: draftOf(settings()) });
    await toDoors(page);
    const doors = await doorState(page);
    ok(W, 'nothing named, nothing booked: the whole trip is preselected', doors.find((d) => d.on)?.door === 'guide');
    await page.locator('.pf-door[data-door="flight"]').click(); await page.waitForTimeout(200);
    await prim(page).click();
    await page.locator('.ffl').waitFor({ timeout: 30000 });
    await page.waitForTimeout(800);
    ok(W, 'the flight results page', /Pick your flight/.test(await title(page)), await title(page));
    const rows = await page.locator('.ffl .ffl-card').evaluateAll((els) => els.map((e) => ({
      name: e.querySelector('.card-title')?.innerText.trim(),
      fare: Number((e.querySelector('.ffl-fare-n')?.innerText || '').replace(/[^\d]/g, '')),
      lbl: e.querySelector('.ffl-fare-lbl')?.innerText.trim(),
      legs: [...e.querySelectorAll('.ffl-leg')].map((l) => l.innerText.replace(/\s+/g, ' ').trim()),
      marks: e.querySelectorAll('.ffl-leg .airline-mark, .ffl-leg img, .ffl-leg [class*="airline"]').length,
    })));
    ok(W, 'one row a place, at least three', rows.length >= 3 && new Set(rows.map((r) => r.name)).size === rows.length, rows.map((r) => r.name).join(', '));
    ok(W, 'cheapest fare for the group first', rows.every((r, i) => i === 0 || rows[i - 1].fare <= r.fare), rows.map((r) => r.fare).join(' <= '));
    ok(W, 'each row: the fare for two', rows.every((r) => r.lbl === 'for 2' && r.fare > 0));
    ok(W, 'each row: out and back with times, the day and the stops', rows.every((r) => r.legs.length === 2 && /\d\d:\d\d to \d\d:\d\d/.test(r.legs[0]) && /Out Sat 21 Nov/.test(r.legs[0]) && /Back Sat 28 Nov/.test(r.legs[1]) && /(Direct|stop)/.test(r.legs[0])), rows[0]?.legs.join(' / '));
    ok(W, 'each leg carries the airline\'s mark', rows.every((r) => r.marks >= 2), rows.map((r) => r.marks).join(','));
    ok(W, 'the answers are echoed, from the own town', /From Ghent/.test(await page.locator('.tff-chips').innerText().catch(() => '')));
    ok(W, 'flights: no sideways scroll', await noSideways(page));
    await shot(page, `02-flights-${W}`);
    const first = rows[0];
    await page.locator('.ffl .ffl-card').first().locator('.card-open').click();
    await page.locator('.tpg').waitFor({ timeout: 30000 }); await page.waitForTimeout(2500);
    const route = await routeText(page);
    const times = first.legs[0].match(/(\d\d:\d\d) to (\d\d:\d\d)/);
    ok(W, 'a pick lands on the trip page at that place', (await page.locator('.tpg-chips').innerText()).includes(first.name), first.name);
    ok(W, 'with that flight there (its times)', times && route.includes(`${times[1]} to ${times[2]}`), times?.[0]);
    const rest = page.locator('.tpg-rest:visible');
    ok(W, 'the trip page offers Plan the rest', await rest.count() === 1);
    ok(W, 'trip page: no sideways scroll', await noSideways(page));
    await shot(page, `03-flight-trip-${W}`);
    await rest.click(); await page.waitForTimeout(1500);
    ok(W, 'Plan the rest opens the Itinerary with Add a stop open', await page.locator('.tpg-tabs [role="tab"][aria-selected="true"]').innerText() === 'Itinerary' && await page.locator('.itin-add .itin-add-body').count() === 1);
    await shot(page, `04-plan-rest-${W}`);
    await ctx.close();
  });
}

// ---- 3. I know where I'm going ----
for (const W of WIDTHS) {
  await step(W, 'know where', async () => {
    const places = [town('PRG', 'Prague', 'CZ', 'Czechia'), town('gem:cesky-krumlov', 'Český Krumlov', 'CZ', 'Czechia')];
    const { ctx, page } = await context(W, { draft: draftOf(settings({ places, sources: { places: 'words' }, answered: ['tell', 'booked', 'who', 'sleep', 'priority', 'when', 'from', 'way', 'airports', 'places'] })) });
    await toDoors(page);
    const doors = await doorState(page);
    ok(W, 'named towns preselect I know where', doors.find((d) => d.on)?.door === 'know');
    await prim(page).click(); await page.waitForTimeout(900);
    ok(W, 'Where are you going', /Where are you going/.test(await title(page)));
    const chips = await page.locator('.pf-know-chip').allInnerTexts();
    ok(W, 'the named towns are preselected (row T859-b)', chips.map((c) => c.trim()).join('|') === 'Prague|Český Krumlov', chips.join(' | '));
    await page.locator('.pf-place-input').fill('salzb'); await page.waitForTimeout(400);
    const hits = await page.locator('.pf-place-hit').allInnerTexts();
    ok(W, 'the search suggests the town', hits.some((h) => /Salzburg/.test(h)), hits.join(' | '));
    await page.locator('.pf-place-hit').filter({ hasText: 'Salzburg' }).first().click(); await page.waitForTimeout(300);
    ok(W, 'a picked town joins the chips', (await page.locator('.pf-know-chip').count()) === 3);
    await shot(page, `05-know-${W}`);
    await page.getByRole('button', { name: 'Remove Salzburg' }).click(); await page.waitForTimeout(300);
    ok(W, 'a chip takes its town away', (await page.locator('.pf-know-chip').count()) === 2);
    ok(W, 'know: no sideways scroll', await noSideways(page));
    await prim(page).click();
    await page.locator('.tpg').waitFor({ timeout: 30000 }); await page.waitForTimeout(2500);
    const route = await routeText(page);
    const iP = route.indexOf('Prague'); const iC = route.indexOf('Český Krumlov');
    ok(W, 'Draft my route lands on the trip page, the towns in the order named', iP >= 0 && iC > iP, `${iP} ${iC}`);
    const total = await page.locator('[data-testid="ts-total"] .tpg-band-n').innerText().catch(() => '');
    ok(W, 'the draft is priced', /\d/.test(total), total);
    ok(W, 'a known-place trip has no Plan the rest', await page.locator('.tpg-rest').count() === 0);
    await shot(page, `06-know-trip-${W}`);
    await ctx.close();
  });
}

// ---- 4. I've booked part of it ----
for (const W of WIDTHS) {
  await step(W, 'booked part', async () => {
    const imports = [
      { kind: 'flight_out', title: 'KLM', city: 'Prague', date: '2026-11-21', eur: 180 },
      { kind: 'stay', title: 'Hotel U Zlate', city: 'Prague', date: '2026-11-21', eur: 350 },
      { kind: 'flight_home', title: 'KLM', city: 'Prague', date: '2026-11-28', eur: 160 },
    ];
    const s = settings({ imports, booked: { flights: true, stays: true, car: false, tickets: false } });
    const { ctx, page } = await context(W, { draft: draftOf(s) });
    await toDoors(page);
    const doors = await doorState(page);
    ok(W, 'bookings preselect I\'ve booked part of it', doors.find((d) => d.on)?.door === 'booked');
    await prim(page).click(); await page.waitForTimeout(900);
    ok(W, 'What have you booked', /What have you booked/.test(await title(page)));
    const list = await page.locator('.pf-booked-list').innerText();
    ok(W, 'the bookings are listed with what was paid and the day', (await page.locator('.pf-booked-row').count()) === 3 && /180/.test(list) && /Sat 21 Nov/.test(list), list.replace(/\s+/g, ' ').slice(0, 120));
    await page.getByRole('button', { name: 'Type it in' }).click(); await page.waitForTimeout(300);
    await page.locator('.pf-booked-form').getByRole('radio', { name: 'Stay' }).click();
    await page.locator('.pf-booked-form .pf-place-input').fill('krumlov'); await page.waitForTimeout(400);
    await page.locator('.pf-booked-form .pf-place-hit').first().click(); await page.waitForTimeout(200);
    await page.locator('.pf-booked-form input[type="date"]').fill('2026-11-25');
    await page.locator('.pf-booked-form input[inputmode="decimal"]').fill('210');
    await shot(page, `07-booked-form-${W}`);
    await page.getByRole('button', { name: 'Add this booking' }).click(); await page.waitForTimeout(400);
    ok(W, 'a typed stay joins the list', (await page.locator('.pf-booked-row').count()) === 4);
    ok(W, 'booked: no sideways scroll', await noSideways(page));
    await shot(page, `08-booked-${W}`);
    await prim(page).click();
    await page.locator('.tpg').waitFor({ timeout: 30000 }); await page.waitForTimeout(2500);
    const route = await routeText(page);
    const iP = route.indexOf('Prague'); const iC = route.indexOf('Český Krumlov');
    ok(W, 'the booked stays are the stops, in check-in order', iP >= 0 && iC > iP, `${iP} ${iC}`);
    const marks = await page.locator('.ts-route .ts-booked').count();
    ok(W, 'the flight there, home and both stays are marked Booked', marks === 4, String(marks));
    ok(W, 'the flight is the traveller\'s own, no Google Flights fare', /Your own/.test(route) && !/\d\d:\d\d to \d\d:\d\d/.test(route), route.replace(/\s+/g, ' ').slice(0, 200));
    ok(W, 'the trip page offers Plan the rest', await page.locator('.tpg-rest:visible').count() === 1);
    ok(W, 'booked trip: no sideways scroll', await noSideways(page));
    await shot(page, `09-booked-trip-${W}`);
    await page.locator('.ts-route').scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollBy(0, -80));
    await shot(page, `10-booked-route-${W}`);
    await ctx.close();
  });
}

await browser.close();
const fails = results.filter((r) => !r.ok);
writeFileSync(`${OUT}/walk.json`, JSON.stringify({ results, errors }, null, 1));
console.log(`\n${results.length - fails.length}/${results.length} pass; errors: ${errors.length}`);
for (const e of errors.slice(0, 20)) console.log('  ', e);
