// Headless verify for the AI day planner UI. Two scenarios against a running
// `vite preview` (default http://localhost:4173):
//
//   A. fresh day: the empty day's "Ask Carta" button opens the modal; as a guest
//      the sign-in note + built-in-planner fallback shows, and using it
//      actually drafts the day (numbered pins + timeline appear).
//   B. applied AI schedule (injected into localStorage the way applyAiResult
//      writes it): the schedule card renders in the rail and the external
//      discovery shows as a violet spark pin on the map.
//
// Run from continent-app:  node scripts/ai/verify_ai_ui.mjs [url] [shotdir]

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] || 'http://localhost:4173/';
const SHOTS = process.argv[3] || 'scripts/ai/shots';
mkdirSync(SHOTS, { recursive: true });

const PLAN = {
  id: 'local:aitest',
  label: 'Brussels AI test',
  startDate: '2026-08-04',
  stops: [{ destinationId: 'BRU', days: 2 }],
};
// Matches applyAiResult's stored shape: catalogue stops by original index
// (2 Grand Place, 0 Manneken Pis, 3 Atomium) plus one external discovery.
const AI_PREFS = {
  routeMode: 'manual',
  aiPlans: {
    '0:0': {
      summary: 'A classic old-town morning, cool indoor hours after lunch, and the Atomium as the grand finale.',
      stops: [
        { id: '2', name: 'Grand Place', lat: 50.84671, lon: 4.35251, arrive: '09:32', dwellMin: 30, why: 'Start in the heart of town before the crowds.', external: false, walkKmFromPrev: 0.1, walkMinFromPrev: 2 },
        { id: '0', name: 'Manneken Pis', lat: 50.84499, lon: 4.34999, arrive: '10:07', dwellMin: 10, why: 'Two minutes away, tick it off early.', external: false, walkKmFromPrev: 0.25, walkMinFromPrev: 5 },
        { name: 'Chez Leon', lat: 50.8471, lon: 4.3535, arrive: '12:30', dwellMin: 90, why: 'Roomy tables for a group of seven, book ahead.', external: true, walkKmFromPrev: 0.3, walkMinFromPrev: 6 },
        { id: '3', name: 'Atomium', lat: 50.89492, lon: 4.34152, arrive: '15:00', dwellMin: 75, why: 'The big finish, cooler by late afternoon.', external: false, walkKmFromPrev: 5.6, walkMinFromPrev: 88 },
      ],
      totals: { stops: 4, walkKm: 6.3, endTime: '16:15', lunchAfter: 2, lunchMin: 75 },
      meta: { model: 'test', optimized: true, dropped: 0, cached: false },
      appliedAt: 1,
    },
  },
};
const AI_ASSIGNMENTS = { 0: { 0: [2, 0, 3] } };

const errors = [];

async function boot(browser, { viewport, withAiState }) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => {
    const t = m.text();
    // Basemap tiles, the Travelpayouts affiliate beacon and the service
    // worker (absent from a bare preview) are network noise, not app errors.
    if (m.type() === 'error' && !/tile|cartocdn|ERR_|emrldtp|config is not valid|MIME type|Service worker/i.test(t)) {
      errors.push('console: ' + t.slice(0, 140));
    }
  });
  await page.addInitScript(({ plan, prefs, assignments }) => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.mapGuideDismissed.v1', '1');
      localStorage.setItem('carta.fareNoticeSeen', '1'); // budget-airline notice modal
      localStorage.setItem('carta.dayplans.v1', JSON.stringify([plan]));
      if (assignments) localStorage.setItem(`carta.dayplan.${plan.id}`, JSON.stringify(assignments));
      if (prefs) localStorage.setItem(`carta.dayprefs.${plan.id}`, JSON.stringify(prefs));
    } catch { /* storage unavailable */ }
  }, {
    plan: PLAN,
    prefs: withAiState ? AI_PREFS : null,
    assignments: withAiState ? AI_ASSIGNMENTS : null,
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);
  // Into the Day planner, open the seeded plan. On phones there is no header
  // nav: both planners live behind the bottom bar's raised plus.
  const plus = page.locator('.bottom-nav-plus');
  if (await plus.isVisible().catch(() => false)) {
    await plus.click();
    await page.locator('.plan-chooser-item').nth(1).click();
  } else {
    for (const btn of await page.getByRole('button').all()) {
      const t = (await btn.innerText().catch(() => '')).trim();
      if (/day planner/i.test(t) && (await btn.isVisible().catch(() => false))) { await btn.click(); break; }
    }
  }
  await page.waitForTimeout(1200);
  await page.getByText('Brussels AI test').first().click({ timeout: 8000 });
  await page.waitForTimeout(2500);
  return page;
}

const results = [];
const check = (name, cond) => {
  results.push({ name, cond });
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`);
};

const browser = await chromium.launch();

/* ---- A: fresh day, modal, guest fallback ---- */
{
  const page = await boot(browser, { viewport: { width: 1440, height: 900 }, withAiState: false });
  await page.screenshot({ path: `${SHOTS}/a1-day-empty.png` });
  const aiBtn = page.locator('.dayp-empty .dayp-cta').first();
  check('A: Ask Carta leads the empty day', await aiBtn.isVisible().catch(() => false));
  // The route picker is gone: no second "ready-made route" call to action.
  check('A: ready-made route picker removed',
    (await page.getByRole('button', { name: /ready-made route/i }).count()) === 0);
  await aiBtn.click();
  await page.waitForTimeout(600);
  check('A: modal opens', await page.locator('.ai-plan-card').isVisible().catch(() => false));
  check('A: guest sees sign-in note', await page.locator('.ai-plan-note-warn').isVisible().catch(() => false));
  // The two facts that reshape a day now live in the form.
  check('A: date field present, prefilled',
    (await page.locator('.ai-plan-date').inputValue().catch(() => '')) === '2026-08-04');
  check('A: people stepper present', await page.locator('.ai-plan-people').isVisible().catch(() => false));
  check('A: events toggle present',
    (await page.getByText(/festivals and events/i).count()) >= 1);
  await page.screenshot({ path: `${SHOTS}/a2-modal.png` });
  // Bump the party size and tick events, so the screenshot shows a filled form.
  await page.locator('.ai-plan-people button').last().click().catch(() => {});
  await page.locator('.ai-plan-toggles input[type=checkbox]').last().check().catch(() => {});
  await page.waitForTimeout(400);
  check('A: events note appears when ticked',
    (await page.getByText(/cannot see live listings/i).count()) >= 1);
  await page.screenshot({ path: `${SHOTS}/a2b-modal-filled.png` });
  await page.getByRole('button', { name: /built-in planner/i }).first().click();
  await page.waitForTimeout(4000); // fallback draft fetches activities_full
  // The workspace opens on today's plan, so the route list is right there.
  await page.waitForTimeout(800);
  const stops = await page.locator('.dayr-list').count();
  check('A: fallback drafted the day (route list present)', stops > 0);
  await page.screenshot({ path: `${SHOTS}/a3-fallback-applied.png` });
  await page.close();
}

/* ---- B: applied AI schedule + discovery pin, desktop ---- */
{
  const page = await boot(browser, { viewport: { width: 1440, height: 900 }, withAiState: true });
  await page.waitForTimeout(800);
  check('B: the bot summary renders', await page.locator('.dayp-summary').isVisible().catch(() => false));
  // The bot's own listing is gone: its stops ARE the route list, and what
  // it had to say about the day is the one summary line above them.
  check('B: bot stops laid into the route list', (await page.locator('.dayr-row').count()) >= 3);
  check('B: discovery pin on map', (await page.locator('.dem-pin.ai-disc').count()) >= 1);
  check('B: numbered route pins on map', (await page.locator('.trip-pin').count()) >= 3);
  check('B: the Carta bot is reachable from the map', await page.locator('.dayws-bot-fab').first().isVisible().catch(() => false));
  await page.screenshot({ path: `${SHOTS}/b1-applied-desktop.png` });
  await page.close();
}

/* ---- C: mobile (390x844): applied state + modal ---- */
{
  const page = await boot(browser, { viewport: { width: 390, height: 844 }, withAiState: true });
  check('C: mobile discovery pin on map', (await page.locator('.dem-pin.ai-disc').count()) >= 1);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/c1-applied-mobile.png` });
  // Re-planning is the Carta bot's first predefined ask, reachable from
  // the map on every tab rather than from one button inside the plan.
  const fab = page.locator('.dayws-bot-fab').first();
  if (await fab.isVisible().catch(() => false)) {
    await fab.click();
    await page.locator('.dayws-bot-item').first().click();
    await page.waitForTimeout(600);
    check('C: mobile modal opens and fits', await page.locator('.ai-plan-card').isVisible().catch(() => false));
    await page.screenshot({ path: `${SHOTS}/c2-modal-mobile.png` });
  } else {
    check('C: mobile Carta bot reachable', false);
  }
  await page.close();
}

await browser.close();
const failed = results.filter((r) => !r.cond).length;
console.log(`\nchecks failed: ${failed}  |  console/page errors: ${errors.length}`);
errors.slice(0, 10).forEach((e) => console.log('  ' + e));
process.exit(failed || errors.length ? 1 : 0);
