// Headless verify for the origin-first wizard: Trip basics (address -> nearby
// airports, dates, party, travel style), the Where step, the curated Stay
// templates on the build-your-own path, the daily-spend estimate line, and the
// plannerStore draft that survives it all.
//
// The fare badges, the Getting-there airport matrix and the return-flight step
// this script used to check are gone: Carta no longer prices anyone's
// transport. The flow that replaced them has its own script,
// scripts/verify_planner_v2_flow.mjs.
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
// No chooser any more: the planner opens on step one.
await page.waitForTimeout(600);

// The opening questions are one per step now (Booked, From, When, Who), so
// this walk advances between the cards it used to scroll past. Every check
// below is the same check, taken on the step that now owns the card.
const nextStep = async () => {
  await page.locator('.guide-next').first().click();
  await page.waitForTimeout(1100);
};

// ── Step 1: Booked ──
check('step 1 asks what is booked', /booked already/i.test(await page.locator('.guide-title').first().innerText().catch(() => '')));
check('the rail names every step', (await page.locator('.wiz-step-name').allInnerTexts()).length >= 6,
  (await page.locator('.wiz-step-name').allInnerTexts()).join(' | '));
await nextStep();

// ── Step 2: From ──
check('step 2 asks where the trip starts', /where does your trip start/i.test(await page.locator('.guide-title').first().innerText().catch(() => '')));
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

await nextStep();

// ── Step 3: When. A 7-night window. ──
check('step 3 asks when', /when are you going/i.test(await page.locator('.guide-title').first().innerText().catch(() => '')));
const days = page.locator('.cal-day:not(.disabled):not(.outside)');
await days.nth(3).click();
await days.nth(10).click();
await page.waitForTimeout(300);

check('next unlocks with dates set', await page.locator('.guide-next').isEnabled());
await nextStep();

// ── Step 4: Who. 2 adults + 1 child, budget style. ──
check('step 4 asks who travels', /who travels/i.test(await page.locator('.guide-title').first().innerText().catch(() => '')));
await page.locator('.guide-party-card .guide-people').nth(1).locator('button').nth(1).click(); // +1 child
await page.waitForTimeout(200);
check('children note is honest', /full travellers/i.test(await page.locator('.guide-party-card').innerText()));
await page.locator('.guide-style-card', { hasText: /budget/i }).click();
await page.waitForTimeout(200);

// The two counters line up: same right edge, whatever their labels read.
const stepperBoxes = await page.locator('.guide-party-row .guide-people').evaluateAll(
  (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { right: Math.round(r.right), top: Math.round(r.top) }; }),
);
const sameRow = stepperBoxes.every((b) => b.top === stepperBoxes[0].top);
const sameEdge = new Set(stepperBoxes.map((b) => b.right)).size === stepperBoxes.length
  ? sameRow // side by side: distinct right edges are fine when tops match
  : true;   // stacked: they share one right edge
check('party counters align', stepperBoxes.length === 2 && sameEdge, JSON.stringify(stepperBoxes));

// The lifestyle panel is reachable from the style presets.
const lsLink = page.locator('.guide-lifestyle-link');
check('lifestyle panel link offered', await lsLink.isVisible());
await lsLink.click();
await page.waitForTimeout(900);
// By a control the panel actually owns: [class*="lifestyle"] also matches the
// Explore tab's own hidden button, which is what this used to catch instead.
check('link opens the lifestyle panel', await page.locator('.lifestyle-stay-chips').first().isVisible().catch(() => false));
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
const closeLs = page.locator('.panel-close, .lifestyle-close').first();
if (await closeLs.isVisible().catch(() => false)) { await closeLs.click(); await page.waitForTimeout(500); }
await page.screenshot({ path: 'shots/planner-v2-basics.png' });
await page.locator('.guide-next').click();
await page.waitForTimeout(1800);

// ── Step 5: Where ──
check('the next step is Where', /where are we going/i.test(await page.locator('.guide-title').first().innerText().catch(() => '')));
await page.waitForTimeout(1200);
const estCount = await page.locator('.guide-ccard-n').count();
check('country cards carry a cost line', estCount >= 10, String(estCount));
const cardLine = await page.locator('.guide-ccard-n').first().innerText();
check('the line is what a day costs there', /a day|places/i.test(cardLine.trim()), cardLine);
check('no transit badge survives on a card', await page.locator('.guide-ccard-badges').count() === 0);
check('no city count on the cards', !/\d+ cities/i.test(await page.locator('.guide-cgrid').innerText()));
// The picking CTA and the search field belong together.
const gap = await page.evaluate(() => {
  const cta = document.querySelector('.guide-where-tools');
  const search = document.querySelector('.guide-picklist-head');
  if (!cta || !search) return null;
  return Math.round(search.getBoundingClientRect().top - cta.getBoundingClientRect().bottom);
});
check('CTA and search sit close', gap != null && gap <= 16, `${gap}px`);
check('recap carries origin + party', /ghent/i.test(await page.locator('.guide-recap').innerText().catch(() => '')) && /3 travellers/i.test(await page.locator('.guide-recap').innerText().catch(() => '')));
await page.screenshot({ path: 'shots/planner-v2-where.png' });
await page.locator('.guide-ccard', { hasText: 'France' }).first().locator('.guide-ccard-pick').click();
await page.waitForTimeout(400);
await page.locator('.guide-next').click();
await page.waitForTimeout(2500);

// ── Step 3: build your own, where the curated templates live ──
await page.locator('.wmode-btn').nth(1).click();
await page.waitForTimeout(2000);

check('step 3 becomes Stay', /sleep|stay/i.test(await page.locator('.guide-title').first().innerText().catch(() => '')));
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

// ── Step 4: Finish, and the planned overview ──
await page.locator('.guide-next').click();
await page.waitForTimeout(2000);
check('reaches the Finish step', /last touches/i.test(await page.locator('.guide-title').first().innerText().catch(() => '')));
check('the finish step asks how you get there', await page.locator('.tlegs').isVisible().catch(() => false));
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
// Nothing has been said about transport yet, and Carta invents none.
check('store: transit stays empty until the traveller says', draft?.selectedTransit == null, JSON.stringify(draft?.selectedTransit));
check('store: stops mirror the route', (draft?.stops?.length || 0) >= 2 && draft.stops.every((x) => x.nights > 0 && x.cityName), String(draft?.stops?.length));

await browser.close();
const pass = checks.filter((c) => c.ok).length;
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
console.log(`\n${pass}/${checks.length} checks passed`);
if (errors.length) console.log('errors:\n' + [...new Set(errors)].slice(0, 8).join('\n'));
process.exit(pass === checks.length && errors.length === 0 ? 0 : 1);
