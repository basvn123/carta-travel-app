// Headless verify for the origin-first wizard refactor: Trip basics (address
// -> nearby airports, dates, party, travel style), the Where step's live
// pricing badges, the Getting-there airport matrix with cheapest/fastest
// tags, curated Stay templates, the daily-spend estimate line, and the
// plannerStore draft that survives it all.
//
//   node scripts/verify_planner_v2.mjs [url]   (default http://localhost:4173)
//
// Nominatim is stubbed (no live geocoding in CI); fares come from the local
// /fares/*.json slices. Screenshots to shots/planner-v2-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';
const browser = await chromium.launch();
const checks = [];
const errors = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const NOISE = /emrldtp|ERR_FAILED|config is not valid/;

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 140)); });
await page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
  } catch { /* storage unavailable */ }
});
// Geocoding fixture: typing "Ghent" always finds Ghent.
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
await page.locator('button', { hasText: /trip planner/i }).first().click();
await page.waitForTimeout(2000);
await page.locator('.guide-path').first().click(); // Carta plans it start to end
await page.waitForTimeout(1200);

// ── Step 1: Trip basics ──
check('step 1 is Trip basics', /set up your trip/i.test(await page.locator('.guide-title').first().innerText().catch(() => '')));
check('origin card renders', await page.locator('.guide-origin-home-card').isVisible());

await page.locator('.guide-origin-home-card input.guide-search').fill('Ghent');
await page.locator('.guide-origin-home-card .guide-carfrom-search').click();
await page.waitForTimeout(600);
await page.locator('.guide-origin-home-card .guide-city-btn').first().click();
await page.waitForTimeout(800);
check('address picked', /ghent/i.test(await page.locator('.guide-origin-picked-main').innerText().catch(() => '')));
const chips = await page.locator('.guide-airport-chip').allInnerTexts();
check('airports within 200 km listed', chips.length >= 3, `${chips.length}: ${chips.slice(0, 3).join(' | ')}`);
check('chips carry distances', chips.every((c) => /\d+\s*km/.test(c)));

// Dates: a 7-night window.
const days = page.locator('.cal-day:not(.disabled):not(.outside)');
await days.nth(3).click();
await days.nth(10).click();
await page.waitForTimeout(300);

// Party: 2 adults + 1 child, budget style.
await page.locator('.guide-party-card .guide-people').nth(1).locator('button').nth(1).click(); // +1 child
await page.waitForTimeout(200);
check('children note is honest', /full travellers/i.test(await page.locator('.guide-party-card').innerText()));
await page.locator('.guide-style-card', { hasText: /budget/i }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/planner-v2-basics.png' });
check('next unlocks with dates set', await page.locator('.guide-next').isEnabled());
await page.locator('.guide-next').click();
await page.waitForTimeout(1800);

// ── Step 2: Where, with the pricing matrix ──
check('step 2 is Where', /where are we going/i.test(await page.locator('.guide-title').first().innerText().catch(() => '')));
await page.waitForTimeout(2500); // fare slices for the nearby airports
const badgeCount = await page.locator('.guide-ccard-badges').count();
check('country cards carry transit badges', badgeCount >= 10, String(badgeCount));
const estCount = await page.locator('.guide-ccard-est').count();
check('country cards carry all-in estimates', estCount >= 10, String(estCount));
check('matrix note explains the badges', await page.locator('.guide-matrix-note').isVisible());
check('recap carries origin + party', /ghent/i.test(await page.locator('.guide-recap').innerText().catch(() => '')) && /3 travellers/i.test(await page.locator('.guide-recap').innerText().catch(() => '')));
await page.screenshot({ path: 'shots/planner-v2-where.png' });
await page.locator('.guide-ccard', { hasText: 'France' }).first().click();
await page.waitForTimeout(400);
await page.locator('.guide-next').click();
await page.waitForTimeout(2000);

// ── Step 3: Getting there ──
check('fly card carries a compared price', /pp return/i.test(await page.locator('.guide-mode-card').first().innerText()));
const tagText = await page.locator('.guide-mode-cards').innerText();
check('cheapest/fastest tags present', /cheapest|fastest/i.test(tagText));
await page.locator('.guide-stay-view button', { hasText: /^list$/i }).click();
await page.waitForTimeout(800);
const groups = await page.locator('.guide-airport-group').count();
check('airport matrix groups departures', groups >= 2, String(groups));
await page.screenshot({ path: 'shots/planner-v2-matrix.png' });
// Pick a flight from the SECOND departure airport: the pair must be pickable
// and the row must show as selected.
const secondGroupRow = page.locator('.guide-airport-group').nth(1).locator('.guide-airport-row').first();
const rowCity = (await secondGroupRow.innerText()).split('\n')[0];
await secondGroupRow.click();
await page.waitForTimeout(800);
check('a pair from another airport is pickable', await page.locator('.guide-airport-row.on').count() === 1, rowCity);
check('route rows name the departure airport', /[A-Z]{3}\s*→\s*[A-Z]{3}/.test(await page.locator('.guide-route-list').innerText().catch(() => '')));
await page.locator('.guide-next').click();
await page.waitForTimeout(1500);

// ── Step 4: Stay, curated templates ──
check('step 4 is Stay', /sleep|stay/i.test(await page.locator('.guide-title').first().innerText().catch(() => '')));
const tpl = page.locator('.guide-template');
const tplCount = await tpl.count();
check('curated templates offered', tplCount >= 1, String(tplCount));
if (tplCount > 0) {
  const tplText = await tpl.first().innerText();
  check('template names cities and nights', /\d+n/.test(tplText), tplText.slice(0, 60).replace(/\n/g, ' '));
  await page.screenshot({ path: 'shots/planner-v2-stay.png' });
  await tpl.first().click();
  await page.waitForTimeout(800);
  check('template fills the route', /of \d+ nights planned|nights planned/i.test(await page.locator('.guide-foot').innerText()));
}
check('estimate includes daily spending', /food & fun/i.test(await page.locator('.guide-estimate-band').innerText().catch(() => '')));

// ── Steps 5+6: Getting home, Finish, and the planned overview ──
await page.locator('.guide-next').click();
await page.waitForTimeout(2000);
const onHome = /fly home|home/i.test(await page.locator('.guide-title').first().innerText().catch(() => ''));
if (onHome) {
  const homeRow = page.locator('.guide-route, .guide-side-idle-row').first();
  if (await homeRow.isVisible().catch(() => false)) { await homeRow.click(); await page.waitForTimeout(600); }
  await page.locator('.guide-next').click();
  await page.waitForTimeout(1500);
}
check('reaches the Finish step', /last touches|fly home/i.test(await page.locator('.guide-title').first().innerText().catch(() => '')));
await page.screenshot({ path: 'shots/planner-v2-finish.png' });
const arrange = page.locator('.guide-next', { hasText: /arrange/i }).last();
if (await arrange.isVisible().catch(() => false)) {
  await arrange.click();
  await page.waitForTimeout(3000);
  check('hands over to the planned overview', await page.locator('.trip-sheet').isVisible().catch(() => false));
  await page.screenshot({ path: 'shots/planner-v2-overview.png' });
}

// ── The planner store draft ──
const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('carta.plannerDraft.v1') || 'null'));
check('store: origin is Ghent', draft?.origin?.name?.toLowerCase().includes('ghent'), draft?.origin?.name);
check('store: nearby airports saved', (draft?.nearbyAirports?.length || 0) >= 3, String(draft?.nearbyAirports?.length));
check('store: travelers + style saved', draft?.travelers?.adults === 2 && draft?.travelers?.children === 1 && draft?.travelers?.lifestyle === 'budget', JSON.stringify(draft?.travelers));
check('store: dates saved', draft?.travelDates?.durationNights === 7, JSON.stringify(draft?.travelDates));
check('store: transit is a flight pair', draft?.selectedTransit?.type === 'flight' && /^[A-Z]{3}$/.test(draft?.selectedTransit?.departureAirport || ''), JSON.stringify(draft?.selectedTransit));
check('store: stops mirror the route', (draft?.stops?.length || 0) >= 2 && draft.stops.every((x) => x.nights > 0 && x.cityName), String(draft?.stops?.length));

await browser.close();
const pass = checks.filter((c) => c.ok).length;
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
console.log(`\n${pass}/${checks.length} checks passed`);
if (errors.length) console.log('errors:\n' + [...new Set(errors)].slice(0, 8).join('\n'));
process.exit(pass === checks.length && errors.length === 0 ? 0 : 1);
