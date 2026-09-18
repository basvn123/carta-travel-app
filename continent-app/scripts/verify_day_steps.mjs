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
 * Run against a BUILT preview (the harness reads the real bundle):
 *   node scripts/verify_day_steps.mjs http://localhost:4196/
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] || 'http://localhost:4173/';
const SHOTS = process.argv[3] || 'scripts/ai/shots';
mkdirSync(SHOTS, { recursive: true });

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log(`  ok   ${name}`); } else { fail += 1; console.log(`  FAIL ${name}${extra ? ` (${extra})` : ''}`); }
};

const GEOCODE = [{
  lat: '51.0543', lon: '3.7174', display_name: '10 Wittewalle, Ghent, Belgium',
  address: { city: 'Ghent', country: 'Belgium', country_code: 'be' },
}];

const PROPOSAL = {
  summary: 'A short day on foot.',
  stops: [
    { id: '0', name: 'First stop', arrive: '09:45', dwellMin: 60, why: 'Close to the stay.', inCatalog: true, lat: 51.0543, lon: 3.7174 },
    { id: '1', name: 'Second stop', arrive: '11:15', dwellMin: 45, why: 'Next along the walk.', inCatalog: true, lat: 51.056, lon: 3.72 },
    { id: '2', name: 'Third stop', arrive: '13:00', dwellMin: 60, why: 'Lunch here.', inCatalog: true, lat: 51.0575, lon: 3.723 },
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

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
for (const btn of await page.getByRole('button').all()) {
  const label = (await btn.innerText().catch(() => '')).trim();
  if (/day planner/i.test(label) && (await btn.isVisible().catch(() => false))) { await btn.click(); break; }
}
await page.waitForTimeout(1500);

// ---- through the landing flow to the bot ----
await page.locator('.day-flow-search input').fill('10 Wittewalle Ghent');
await page.getByRole('button', { name: /^find$/i }).click();
await page.waitForTimeout(1200);
await page.locator('.day-stay-result').first().click();
await page.waitForTimeout(500);
await page.locator('.day-flow-next').click();
await page.waitForTimeout(600);
const nextBtn = page.locator('.day-flow-next');
if (await nextBtn.isDisabled()) {
  await page.locator('.day-flow-date input').first().fill('2026-08-04').catch(() => {});
  await page.waitForTimeout(400);
}
await nextBtn.click();
await page.waitForTimeout(600);
await page.locator('.day-ideas-choice').waitFor({ timeout: 30000 });
await page.getByRole('button', { name: /surprise me/i }).click();
await page.waitForTimeout(600);
await page.locator('.day-flow-card.primary').click();
await page.waitForTimeout(800);

// ---- 1: hard constraints first ----
const q1 = await page.locator('.chat-bubble-live').innerText();
check('opens on who is coming, not on a preference', /who.s coming/i.test(q1), q1);
check('progress reads as a count', /\d+ of \d+/i.test(await page.locator('.chat-progress').innerText()));
await page.screenshot({ path: `${SHOTS}/d5-q1-companions.png` });
await page.locator('.chat-opt').first().click();          // just me
await page.waitForTimeout(350);

// ---- window, with the start chips on the same screen ----
check('second question is the day window', /how much of the day/i.test(await page.locator('.chat-bubble-live').innerText()));
check('start chips ride along with the window question',
  (await page.locator('.chat-opts-start .carta-plan-chip').count()) === 3);
// Take the FULL DAY AND EVENING answer, so nightlife must appear later.
await page.locator('.chat-opt').last().click();
await page.waitForTimeout(350);

// ---- 2: walking is asked in steps ----
check('third question is walking', /how much walking/i.test(await page.locator('.chat-bubble-live').innerText()));
const walkSubs = await page.locator('.chat-opt .chat-opt-text small').allInnerTexts();
check('walk options are labelled in steps, never km',
  walkSubs.length >= 4 && walkSubs.every((s) => /steps/i.test(s) && !/\bkm\b/i.test(s)),
  walkSubs.join(' / '));
check('the step budgets are the four the brief names',
  ['5,000', '10,000', '15,000', '20,000'].every((n) => walkSubs.some((s) => s.includes(n))),
  walkSubs.join(' / '));
check('walking carries the hills and transit toggles',
  (await page.locator('.chat-opts-nudge .carta-plan-chip').count()) >= 2);
await page.screenshot({ path: `${SHOTS}/d5-q3-steps.png` });
// "Normal, about 10,000 steps", plus the transit toggle so the payload
// carries a true flag rather than only defaults.
await page.locator('.carta-plan-chip').last().click();
await page.waitForTimeout(150);
await page.locator('.chat-opt').nth(1).click();
await page.waitForTimeout(350);

// ---- 4: nightlife only when the evening is in the day ----
check('fourth question is mood', /in the mood for/i.test(await page.locator('.chat-bubble-live').innerText()));
const moods = await page.locator('.chat-opts-multi .chat-opt').allInnerTexts();
check('nightlife is offered because the day runs into the evening',
  moods.some((m) => /nightlife/i.test(m)), moods.join(' / '));
check('the mood cap is stated', /\b3\b/.test(await page.locator('.chat-opts-hint').innerText()));

// ---- 6: the cap actually holds ----
for (let i = 0; i < 4; i += 1) {
  await page.locator('.chat-opts-multi .chat-opt').nth(i).click();
  await page.waitForTimeout(120);
}
check('a fourth mood never makes four selections',
  (await page.locator('.chat-opts-multi .chat-opt.on').count()) === 3);
await page.screenshot({ path: `${SHOTS}/d5-q4-moods.png` });

// ---- 5: a past answer is editable ----
const firstAnswer = page.locator('.chat-bubble-edit').first();
check('past answers are buttons', (await firstAnswer.count()) === 1);
const answerText = await firstAnswer.innerText();
check('the walk answer reads back as steps, not a bare number',
  (await page.locator('.chat-bubble-edit').allInnerTexts()).some((s) => /steps/i.test(s)),
  (await page.locator('.chat-bubble-edit').allInnerTexts()).join(' / '));
await firstAnswer.click();
await page.waitForTimeout(300);
check('tapping a past answer returns to its own question',
  /who.s coming/i.test(await page.locator('.chat-bubble-live').innerText()), answerText);

// Walk forward again to the end and let it build.
for (let guard = 0; guard < 14; guard += 1) {
  if (await page.locator('.rbs').count()) break;
  if (await page.locator('.chat-free-final').count()) {
    await page.screenshot({ path: `${SHOTS}/d5-q8-extras.png` });
    // The extras screen is toggles plus free text, all optional.
    check('the last screen carries the events and crowds toggles',
      (await page.locator('.chat-toggle').count()) === 2);
    await page.locator('.chat-free-final .chat-send').click();
    break;
  }
  if (await page.locator('.chat-town-picker .chat-opt').count()) {
    await page.locator('.chat-town-picker .chat-opt').first().click();
  } else if (await page.locator('.chat-opts-multi').count()) {
    await page.locator('.chat-send-multi').click();
  } else {
    await page.locator('.chat-body .chat-opt:visible').first().click();
  }
  await page.waitForTimeout(280);
}

await page.waitForSelector('.chat-route', { timeout: 30000 });

// ---- 3: both units reach the server ----
// The editing check above walks the flow again from question 1, and the
// re-walk takes the first answer on every screen, so the budget that reaches
// the server is the FIRST one (5,000), not the 10,000 chosen before the edit.
// That is the app behaving correctly: an edited answer replaces the old one.
check('payload carries a step budget', Number(payload?.profile?.steps) === 5000,
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

// ---- the result line speaks steps ----
const stats = await page.locator('.chat-route-stats').innerText();
check('the result line counts stops and steps, not km',
  /steps/i.test(stats) && !/\bkm\b/i.test(stats), stats);
check('the result line names the number of stops', /\b3\b/.test(stats), stats);
check('the refine nudge asks for fewer steps, not less walking',
  (await page.getByRole('button', { name: /fewer steps/i }).count()) >= 1);
await page.screenshot({ path: `${SHOTS}/d5-result.png` });

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
