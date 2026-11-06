/**
 * verify_day_steps.mjs, the D5 gate: the Carta bot's reworked questions.
 *
 * What this asserts, and why each one is here rather than left to review:
 *
 *   1. The flow opens on a hard constraint (who is coming), not a preference.
 *      The whole point of the rework is that company and time decide what the
 *      day CAN be, and interests only rank inside that.
 *   2. Walking is asked and answered in STEPS. A regression to kilometres
 *      would be invisible in a screenshot diff and would quietly undo the
 *      one change travellers actually feel.
 *   3. The payload carries both units: steps for the prompt to quote back,
 *      maxWalkKm for the server's scheduler to enforce. Sending one without
 *      the other is the failure mode that looks fine until a day is 15 km.
 *   4. Nightlife is offered only when the day runs into the evening, because
 *      a day that ends at 18:00 cannot honour it.
 *   5. A past answer is editable: tapping it returns to its own question.
 *   6. The mood question is capped at three.
 *
 * T1089: rewritten for the current wizard. The chat is step 5 of the day
 * wizard (CartaChatPlanner, daychat-* markup: tiles and chips, answers go on
 * with the footer's Continue, past answers are the recap chips), and a plan
 * that succeeds opens as the day itself, so the old in-chat result line and
 * "fewer steps" nudge no longer exist here. Seven questions, not eight.
 *
 * T1089 needs: real data (the POI shards in public/poi: without them the app
 * answers too_few before it ever calls plan-day, so the payload checks SKIP).
 * The dev server must have E2E seams on (?paymock stands in for a signed-in
 * traveller on the bot's gate).
 *
 *   node scripts/verify_day_steps.mjs http://localhost:4173/
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;
const SHOTS = process.argv[3] || 'scripts/ai/shots';
mkdirSync(SHOTS, { recursive: true });

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log(`  ok   ${name}`); } else { fail += 1; console.log(`  FAIL ${name}${extra ? ` (${extra})` : ''}`); }
};

const GEOCODE = [{
  lat: '41.8996', lon: '12.4939', display_name: 'Hotel Artemide, Via Nazionale, Rome, Lazio, Italy',
  name: 'Hotel Artemide', category: 'tourism', type: 'hotel',
  address: { country: 'Italy', country_code: 'it' },
}];

const PROPOSAL = {
  summary: 'A short day on foot.',
  stops: [
    { id: '0', name: 'First stop', arrive: '09:45', dwellMin: 60, why: 'Close to the stay.', inCatalog: true, lat: 41.9, lon: 12.49 },
    { id: '1', name: 'Second stop', arrive: '11:15', dwellMin: 45, why: 'Next along the walk.', inCatalog: true, lat: 41.901, lon: 12.492 },
    { id: '2', name: 'Third stop', arrive: '13:00', dwellMin: 60, why: 'Lunch here.', inCatalog: true, lat: 41.902, lon: 12.495 },
  ],
  totals: { walkKm: 4.2, endTime: '16:30' },
  meta: { optimized: true },
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

await page.route('**/nominatim.openstreetmap.org/**', (r) => r.fulfill({
  status: 200, contentType: 'application/json', body: JSON.stringify(GEOCODE),
}));

// The one payload this harness is really about.
let payload = null;
await page.route('**/functions/v1/plan-day', async (route) => {
  payload = JSON.parse(route.request().postData() || '{}');
  await route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(PROPOSAL),
  });
});

await page.addInitScript(() => {
  for (const k of ['continent.homeSeen.v1', 'continent.guestMode.v1', 'continent.mapGuideDismissed.v1',
    'carta.welcomeSeen.v1', 'carta.welcomeSeen', 'continent.onboardingSeen.v1', 'carta.fareNoticeSeen']) localStorage.setItem(k, '1');
  localStorage.setItem('continent.lang.v1', 'en');
});
await page.goto(`${URL.replace(/\/$/, '')}/?tab=plan&mode=day&o=CRL&paymock=1`, { waitUntil: 'domcontentloaded' });

// ---- through the wizard to the bot: Start, Days, Ideas, How ----
await page.locator('.day-flow-search input').fill('Hotel Artemide Rome');
await page.getByRole('button', { name: /^find$/i }).click();
await page.locator('.day-stay-result').first().click();
await page.locator('.guide-next').click();                 // Start -> Days
await page.waitForTimeout(600);
if (await page.locator('.guide-next').isDisabled()) {
  await page.locator('.dayw-chips button').first().click();
  await page.waitForTimeout(300);
}
await page.locator('.guide-next').click();                 // Days -> Ideas
await page.waitForTimeout(600);
await page.locator('.guide-next').click();                 // Ideas -> How (Skip)
await page.locator('.dayw-fork-card').first().waitFor({ timeout: 30000 });
await page.locator('.dayw-fork-card .card-open').first().click();   // Let Carta plan it
await page.locator('.daychat').waitFor({ timeout: 30000 });

const q = () => page.locator('.wiz-q-h').first().innerText().catch(() => '');
const prog = () => page.locator('.daychat-progress').innerText().catch(() => '');
const cont = async () => { await page.locator('.guide-foot .guide-next').click(); await page.waitForTimeout(450); };

// ---- 1: hard constraints first ----
check('opens on who is coming, not on a preference',
  await page.getByRole('radiogroup', { name: /who.s coming/i }).count() === 1);
check('progress reads as a count', /\d+ of \d+/i.test(await prog()), await prog());
await page.screenshot({ path: `${SHOTS}/d5-q1-companions.png` });
await page.locator('.daychat .ui-tile').first().click();   // just me
await page.waitForTimeout(250);
await cont();

// ---- window, with the start chips on the same screen ----
check('second question is the day window',
  await page.getByRole('radiogroup', { name: /how much of the day/i }).count() === 1
  || (await page.locator('.daychat .ui-tile').allInnerTexts()).some((t) => /full day/i.test(t)));
check('start chips ride along with the window question',
  (await page.locator('.daychat .ui-chip').count()) === 3);
// Take the FULL DAY AND EVENING answer, so nightlife must appear later.
await page.locator('.daychat .ui-tile').last().click();
await page.waitForTimeout(250);
await cont();

// ---- 2: walking is asked in steps ----
const walkTiles = await page.locator('.daychat .ui-tile').allInnerTexts();
check('third question is walking', walkTiles.length === 4 && walkTiles.every((t) => /steps/i.test(t)), walkTiles.join(' / '));
check('walk options are labelled in steps, never km',
  walkTiles.length >= 4 && walkTiles.every((t) => /steps/i.test(t) && !/\bkm\b/i.test(t)),
  walkTiles.join(' / '));
check('the step budgets are the four the brief names',
  ['5,000', '10,000', '15,000', '20,000'].every((n) => walkTiles.some((t) => t.includes(n))),
  walkTiles.join(' / '));
check('walking carries the hills toggle', (await page.locator('.daychat .ui-chip').count()) >= 1);
await page.screenshot({ path: `${SHOTS}/d5-q3-steps.png` });
// "Normal, about 10,000 steps".
await page.locator('.daychat .ui-tile').nth(1).click();
await page.waitForTimeout(250);
await cont();

// ---- 4: nightlife only when the evening is in the day ----
const moods = await page.locator('.daychat .ui-tile').allInnerTexts();
check('fourth question is mood', /pick up to/i.test(await page.locator('.daychat-hint').innerText().catch(() => '')), moods.join(' / '));
check('nightlife is offered because the day runs into the evening',
  moods.some((m) => /nightlife/i.test(m)), moods.join(' / '));
check('the mood cap is stated', /\b3\b/.test(await page.locator('.daychat-hint').innerText()));

// ---- 6: the cap actually holds ----
for (let i = 0; i < 4; i += 1) {
  await page.locator('.daychat .ui-tile').nth(i).click();
  await page.waitForTimeout(120);
}
check('a fourth mood never makes four selections',
  (await page.locator('.daychat .ui-tile.is-selected').count()) === 3);
await page.screenshot({ path: `${SHOTS}/d5-q4-moods.png` });

// ---- 5: a past answer is editable (the recap chips reopen their question) ----
const recap = page.locator('.guide-recap-chip.is-link');
const recapTexts = await recap.allInnerTexts();
check('past answers are buttons', (await recap.count()) >= 3, recapTexts.join(' / '));
check('the walk answer reads back as steps, not a bare number',
  recapTexts.some((s) => /steps/i.test(s)), recapTexts.join(' / '));
await recap.filter({ hasText: /just me/i }).first().click();
await page.waitForTimeout(400);
check('tapping a past answer returns to its own question',
  await page.getByRole('radiogroup', { name: /who.s coming/i }).count() === 1, recapTexts[0]);

// Walk forward again to the end. The answers are kept, so Continue goes on.
let reachedFinal = false;
for (let guard = 0; guard < 14; guard += 1) {
  if (await page.locator('.daychat-final').count()) {
    reachedFinal = true;
    await page.screenshot({ path: `${SHOTS}/d5-q8-extras.png` });
    // The last screen is toggles plus free text, all optional.
    check('the last screen carries the events and crowds toggles',
      (await page.locator('.daychat-final .ui-switch').count()) >= 2);
    break;
  }
  if (await page.locator('.dayw-town .ui-tile, .daychat-tiles').count() === 0) {
    // The town picker: take the first town it offers.
    const first = page.locator('.guide-canvas button[role="radio"], .guide-canvas .ui-tile').first();
    if (await first.count()) await first.click().catch(() => {});
  }
  await cont();
}
check('the questions end on the extras screen', reachedFinal);
await page.locator('.guide-foot .guide-next').click();    // Plan my day

// ---- 3: both units reach the server ----
// A plan needs the town's places from public/poi; without those shards the
// app answers too_few before it calls plan-day.
await page.waitForFunction(() => document.body.innerText.match(/could not plan this one|Your day|First stop/), null, { timeout: 30000 }).catch(() => {});
const noPoi = !existsSync('public/poi') && !payload;
if (noPoi) {
  console.log('  SKIP (needs real data): public/poi shards absent, the app answers too_few before calling plan-day');
} else {
  check('plan-day was called', !!payload);
  // The edit above walked the flow again with the answers kept, so the budget
  // is the 10,000 chosen before it.
  check('payload carries a step budget', Number(payload?.profile?.steps) === 10000,
    JSON.stringify(payload?.profile?.steps));
  check('payload carries the km the scheduler enforces',
    Number(payload?.profile?.maxWalkKm) > 0
    && Math.abs(payload.profile.steps / 1350 - payload.profile.maxWalkKm) < 1,
    JSON.stringify(payload?.profile?.maxWalkKm));
  check('payload carries who is coming', payload?.profile?.companions === 'solo');
  check('payload carries a start time as a clock',
    /^\d{2}:\d{2}$/.test(String(payload?.profile?.startTime)), String(payload?.profile?.startTime));
  check('payload carries the moods, within the cap of 3',
    Array.isArray(payload?.profile?.moods) && payload.profile.moods.length > 0
    && payload.profile.moods.length <= 3, JSON.stringify(payload?.profile?.moods));
  check('payload carries the transit answer as a boolean',
    typeof payload?.profile?.transitOk === 'boolean', String(payload?.profile?.transitOk));
  check('payload carries a mustInclude field', Array.isArray(payload?.mustInclude));
  // The proposal opens as the day itself (T433): its stops are on the page.
  check('the plan opens as the day, with its stops',
    /first stop/i.test(await page.locator('body').innerText()));
  await page.screenshot({ path: `${SHOTS}/d5-result.png` });
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
