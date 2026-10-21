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
//   node scripts/verify_planner_v2.mjs [url]   (default http://localhost:$CARTA_PORT or 4173)
//
// Nominatim is stubbed (no live geocoding in CI). Screenshots to
// shots/planner-v2-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;
const browser = await chromium.launch();
const checks = [];
const errors = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const NOISE = /ERR_FAILED|config is not valid/;

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 140)); });
await page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1');
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
// T398: the header tabs are links since shell V3 (rule "Navigation"), so the
// Trip planner tab is an <a>; the old button-only locator found nothing on desktop.
await page.locator('a, button', { hasText: /trip planner/i }).first().click();
await page.waitForTimeout(2000);
// No chooser any more: the planner opens on step one.
await page.waitForTimeout(600);

// The opening questions are one per step now (Booked, From, When), so
// this walk advances between the cards it used to scroll past. Every check
// below is the same check, taken on the step that now owns the card.
const nextStep = async () => {
  await page.locator('.guide-next').first().click();
  await page.waitForTimeout(1100);
};

// ── Step 1: Booked ──
check('step 1 asks what is booked', /booked already/i.test(await page.locator('.guide-title').first().innerText().catch(() => '')));
check('the rail names every step', (await page.locator('.wiz-step-name').allInnerTexts()).length >= 5,
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

// T388 (brief item 4): the party is asked here now, with the origin, so every
// estimate after this step prices the real party. These checks moved from the
// Finish card, which shows the party as a fact with a Change button instead.
const partyCard = page.locator('.wiz-party');
check('From asks who is going', await partyCard.isVisible().catch(() => false));
check('children stay folded until asked for', await partyCard.locator('.guide-kids-add').isVisible().catch(() => false));
await partyCard.locator('.wiz-party-stepper').first().locator('button').nth(1).click();   // 2 -> 3 adults
await page.waitForTimeout(300);
await partyCard.locator('.guide-kids-add').click();
await page.waitForTimeout(300);
check('the children stepper unfolds', (await partyCard.locator('.wiz-party-stepper').count()) === 2);
await partyCard.locator('.wiz-party-stepper').nth(1).locator('button').nth(1).click();  // +1 child
await page.waitForTimeout(300);
check('the children note is honest', /full travellers/i.test(await partyCard.innerText()));
const stepperBox = await partyCard.locator('.wiz-party-stepper button').first().boundingBox();
check('the party steppers are a real target', (stepperBox?.height || 0) >= 32, String(stepperBox?.height));

await nextStep();

// ── Step 3: When. A 7-night window. ──
check('step 3 asks when', /when are you going/i.test(await page.locator('.guide-title').first().innerText().catch(() => '')));
const days = page.locator('.cal-day:not(.disabled):not(.outside)');
await days.nth(3).click();
await days.nth(10).click();
await page.waitForTimeout(300);

check('next unlocks with dates set', await page.locator('.guide-next').isEnabled());
await nextStep();

// Party size and travel style are no longer asked here: the travellers
// stepper lives on the Finish summary card (checked at the end of this run),
// and the style follows the app's lifestyle panel until the Where quiz sets
// it. Where is step 4 now.
check('no Who step in the rail', !(await page.locator('.wiz-step-name').allInnerTexts()).some((x) => /^who$/i.test(x.trim())),
  (await page.locator('.wiz-step-name').allInnerTexts()).join(' | '));
await page.screenshot({ path: 'shots/planner-v2-basics.png' });

// ── Step 4: Where ──
check('the next step is Where', /where are we going/i.test(await page.locator('.guide-title').first().innerText().catch(() => '')));
await page.waitForTimeout(1200);
// The step opens on the quiz now (prompt T2). The country grid lives behind
// the second tab, so everything below has to ask for it.
check('the Where step opens on the quiz', await page.locator('.wq').isVisible());
await page.locator('.guide-wtabs [role="tab"]').nth(1).click();
await page.waitForTimeout(700);
// T388 (rule "Cost on cards"): the places line is gone; a country card now
// carries what a day there costs a person, under the photograph. The two
// checks that asked for the places line ask for the day cost instead.
const estCount = await page.locator('.wiz-ccard-cost').count();
check('country cards carry a day cost line', estCount >= 10, String(estCount));
const cardLine = await page.locator('.wiz-ccard-cost').first().innerText();
check('the line is a day per person in euros', /€\s?\d+/.test(cardLine) && /day/i.test(cardLine), cardLine);
check('no transit badge survives on a card', await page.locator('.guide-ccard-badges').count() === 0);
check('no city count on the cards', !/\d+ cities/i.test(await page.locator('.guide-cgrid').innerText()));
check('the country search box is gone', await page.locator('.guide-where-col input.guide-search').count() === 0);
const recapTxt = await page.locator('.guide-recap').innerText().catch(() => '');
// Three adults and a child were set on From (T388), so the party reads 4.
check('recap carries origin + party', /ghent/i.test(recapTxt) && /4 travellers/i.test(recapTxt), recapTxt.replace(/\s+/g, ' ').slice(0, 90));
check('recap no longer names a travel style', !/budget|standard|comfort/i.test(recapTxt), recapTxt.replace(/\s+/g, ' ').slice(0, 90));
await page.screenshot({ path: 'shots/planner-v2-where.png' });
await page.locator('.guide-ccard', { hasText: 'France' }).first().locator('.guide-ccard-pick').click();
await page.waitForTimeout(400);
await page.locator('.guide-next').click();
await page.waitForTimeout(2500);

// ── Step 5: build your own, where the curated templates live ──
// The old two-button mode switch (.wmode-btn) is gone; the way into the
// city picker is the "Build your own route" card at the end of the list.
await page.locator('.wready-own-card').first().click();
await page.waitForTimeout(2000);

check('step 5 becomes Stay', /sleep|stay/i.test(await page.locator('.guide-title').first().innerText().catch(() => '')));
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

// ── Step 6: Getting there, then Finish, and the planned overview ──
// Getting there sits between Stay and Finish on every path since the steps
// were split; T388 made it build its legs from the stops on the
// build-your-own path too (row T377-e), which is what this run checks.
await page.locator('.guide-next').click();
await page.waitForTimeout(2000);
check('build-your-own reaches Getting there with legs', await page.locator('.tlegs').isVisible().catch(() => false));
check('no "no trip chosen" on the build-your-own path', !(await page.locator('.guide-empty', { hasText: /no trip chosen/i }).isVisible().catch(() => false)));
await page.locator('.guide-next').click();
await page.waitForTimeout(2000);
check('reaches the Finish step', /last touches/i.test(await page.locator('.guide-title').first().innerText().catch(() => '')));

// T388: the party is a fact on the Finish card with a way back to From,
// not a stepper (it is asked on From, checked above).
const party = page.locator('.guide-summary-party');
check('the summary card states the party', /4\s+travellers/i.test(await party.innerText().catch(() => '')), await party.innerText().catch(() => ''));
check('the party has a way back to From', await party.locator('.guide-answered-edit').isVisible().catch(() => false));
check('the estimate says it is one', /~/.test(await page.locator('.guide-estimate-band').innerText().catch(() => '')) && /est\./i.test(await page.locator('.guide-estimate-band').innerText().catch(() => '')));
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
check('store: travelers saved from the From stepper', draft?.travelers?.adults === 3 && draft?.travelers?.children === 1, JSON.stringify(draft?.travelers));
check('store: style follows the app, unasked', Boolean(draft?.travelers?.lifestyle), JSON.stringify(draft?.travelers?.lifestyle));
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
