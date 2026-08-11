// End-to-end verify of the AI planner LOOP without a deployed backend and
// without spending any AI quota: a fake Supabase session makes the app treat
// us as signed in, and the plan-day call is intercepted and answered with a
// canned payload shaped exactly like the real function's response.
//
// Covers what the plain UI test cannot reach: generating, the proposal view,
// refining it ("more food stops"), and importing onto the map.
//
//   node scripts/ai/verify_ai_flow.mjs [url] [shotdir]

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] || 'http://localhost:4173/';
const SHOTS = process.argv[3] || 'scripts/ai/shots';
mkdirSync(SHOTS, { recursive: true });

const PROJECT_REF = 'ntssxktaduxzpsmejwyv';
const PLAN = {
  id: 'local:aiflow',
  label: 'Ghent AI flow',
  startDate: '2026-08-04',
  stops: [{ destinationId: 'BRU', days: 2 }],
};

// Two canned proposals: the first generation, then the refined one. Indices
// 2/0/3 are Grand Place / Manneken Pis / Atomium in the BRU catalogue.
const stop = (id, name, lat, lon, arrive, dwellMin, why, extra = {}) => ({
  id, name, lat, lon, arrive, dwellMin, why, external: false,
  walkKmFromPrev: 0.3, walkMinFromPrev: 6, ...extra,
});
const PROPOSALS = [
  {
    summary: 'An old-town morning on foot, the hottest hours spent indoors, and the Atomium saved for the cooler late afternoon.',
    stops: [
      stop('2', 'Grand Place', 50.84671, 4.35251, '09:32', 30, 'Start in the heart of town before the crowds arrive.'),
      stop('0', 'Manneken Pis', 50.84499, 4.34999, '10:12', 10, 'Two minutes away, so tick it off while you are here.'),
      stop(null, 'Gentse Feesten', 50.8465, 4.352, '12:30', 120, 'Runs in this week most years, confirm this year dates before counting on it.', { external: true, isEvent: true }),
      stop('3', 'Atomium', 50.89492, 4.34152, '15:20', 75, 'The big finish, and cooler by late afternoon.', { walkKmFromPrev: 5.6, walkMinFromPrev: 88 }),
    ],
    totals: { stops: 4, walkKm: 6.3, endTime: '16:35', lunchAfter: 2, lunchMin: 75 },
    meta: { model: 'mock', optimized: true, dropped: 0, cached: false, refined: false, events: 1 },
  },
  {
    summary: 'Same spine, but with two proper eating stops worked in and the walking trimmed back.',
    stops: [
      stop('2', 'Grand Place', 50.84671, 4.35251, '09:35', 25, 'A short look before the square fills up.'),
      stop(null, 'Chez Leon', 50.8471, 4.3535, '11:00', 90, 'Roomy tables that can actually seat your group, worth booking ahead.', { external: true }),
      stop('0', 'Manneken Pis', 50.84499, 4.34999, '12:45', 10, 'A two minute detour on the way out of the old town.'),
      stop('3', 'Atomium', 50.89492, 4.34152, '15:00', 75, 'Late enough that the heat has broken.', { walkKmFromPrev: 5.6, walkMinFromPrev: 88 }),
    ],
    totals: { stops: 4, walkKm: 5.9, endTime: '16:15', lunchAfter: 1, lunchMin: 75 },
    meta: { model: 'mock', optimized: false, dropped: 0, cached: false, refined: true, events: 0 },
  },
];

const errors = [];
const results = [];
const check = (name, cond) => {
  results.push({ name, cond });
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
// The fake session is not a real JWT, so this run's writes to the REAL
// project (day_plans, user_settings) come back 401. That is the mock's own
// noise, not an app fault: the sync layer is meant to shrug and stay local,
// and a genuine session returns 200. Everything else is a hard failure.
const isMockAuthNoise = (s) => /401|day_plans|user_settings|Invalid (JWT|Refresh Token)|AuthApiError|JWSError/i.test(s);
page.on('pageerror', (e) => {
  const msg = (e && (e.message || e.toString())) || JSON.stringify(e);
  const detail = [msg, e?.name, e?.status, e?.code, e?.hint].filter(Boolean).join(' | ');
  if (!isMockAuthNoise(detail)) errors.push('pageerror: ' + detail.split('\n')[0]);
  else console.log('  (ignored mock-auth noise: ' + detail.slice(0, 90) + ')');
});
page.on('console', (m) => {
  const t = m.text();
  if (t.startsWith('UNHANDLED::')) {
    if (isMockAuthNoise(t)) console.log('  (ignored mock-auth rejection: ' + t.slice(11, 110) + ')');
    else errors.push('unhandled rejection: ' + t.slice(11, 200));
    return;
  }
  if (m.type() !== 'error') return;
  if (/tile|cartocdn|ERR_|emrldtp|config is not valid|MIME type|Service worker/i.test(t)) return;
  if (isMockAuthNoise(t)) return;
  errors.push('console: ' + t.slice(0, 140));
});

// Answer the Edge Function ourselves: proposal 1, then proposal 2 on refine.
let calls = 0;
await page.route('**/functions/v1/plan-day', async (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  const idx = body.refine ? 1 : 0;
  calls += 1;
  await new Promise((r) => setTimeout(r, 900)); // let the spinner be visible
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(PROPOSALS[idx]),
  });
});

await page.addInitScript(({ plan, ref }) => {
  // Playwright reports a thrown plain object as an unhelpful "Object", so
  // capture the real shape in-page and surface it through the console.
  window.addEventListener('unhandledrejection', (e) => {
    let out;
    try { out = JSON.stringify(e.reason, Object.getOwnPropertyNames(Object(e.reason))); } catch { out = String(e.reason); }
    console.log('UNHANDLED::' + out);
  });
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.dayplans.v1', JSON.stringify([plan]));
    // A session supabase-js will accept from storage without a network call,
    // so the app renders its signed-in state.
    const year = Math.floor(Date.now() / 1000) + 31536000;
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
      access_token: 'mock.access.token',
      token_type: 'bearer',
      expires_in: 31536000,
      expires_at: year,
      refresh_token: 'mock-refresh',
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'preview@example.com',
        app_metadata: {},
        user_metadata: {},
        created_at: new Date(0).toISOString(),
      },
    }));
  } catch { /* storage unavailable */ }
}, { plan: PLAN, ref: PROJECT_REF });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(2500);
for (const btn of await page.getByRole('button').all()) {
  const t = (await btn.innerText().catch(() => '')).trim();
  if (/day planner/i.test(t) && (await btn.isVisible().catch(() => false))) { await btn.click(); break; }
}
await page.waitForTimeout(1200);
await page.getByText('Ghent AI flow').first().click({ timeout: 8000 });
await page.waitForTimeout(2500);

// ---- generate ----
await page.locator('.day-ai-hero').first().click();
await page.waitForTimeout(500);
check('signed-in state: generate button offered',
  (await page.getByRole('button', { name: /generate my day/i }).count()) === 1);
check('signed-in state: no sign-in warning',
  (await page.locator('.ai-plan-note-warn').count()) === 0);
await page.getByRole('button', { name: /generate my day/i }).click();
await page.waitForTimeout(350);
check('spinner shows while generating', await page.locator('.ai-plan-spinner').isVisible().catch(() => false));
await page.screenshot({ path: `${SHOTS}/f1-generating.png` });

await page.waitForSelector('.ai-sched', { timeout: 15000 });
check('proposal rendered', (await page.locator('.ai-sched-stop').count()) === 4);
check('proposal is labelled as not yet on the map',
  (await page.locator('.ai-plan-proposal-tag').innerText()).toLowerCase().includes('not on your map'));
check('event stop tagged', (await page.locator('.ai-event-tag').count()) >= 1);
check('event caveat shown', (await page.getByText(/not live listings/i).count()) >= 1);
check('refine box offered', await page.locator('.ai-refine-input').isVisible().catch(() => false));
check('import button offered', await page.locator('.ai-plan-import').isVisible().catch(() => false));
// The proposal draws its own preview map, so "not on your map yet" is now a
// claim about the TRIP map specifically: pins inside the proposal card do not
// count, pins on the map behind it would mean the import already happened.
const tripPins = async () => (await page.locator('.trip-pin').count())
  - (await page.locator('.ai-route-map .trip-pin').count());
check('nothing imported yet: the trip map has no numbered pins', (await tripPins()) === 0);
// The preview map loads its basemap before it can place pins.
await page.waitForSelector('.ai-route-map .trip-pin', { timeout: 20000 }).catch(() => {});
check('the proposal is drawn as a route on its own map',
  (await page.locator('.ai-route-map .trip-pin').count()) === 4);
check('every stop carries a thumbnail',
  (await page.locator('.ai-sched-stop .day-thumb').count()) === 4);
check('catalogue stops show their photo, not a glyph',
  (await page.locator('.ai-sched-stop .day-thumb:not(.day-thumb-empty)').count()) >= 1);
check('stop numbers tie the rows to the pins',
  (await page.locator('.ai-sched-no').allInnerTexts()).join(',') === '1,2,3,4');
// Row and pin are one thing: tapping the third row selects the third pin.
await page.locator('.ai-sched-main').nth(2).click();
await page.waitForTimeout(600);
check('tapping a row selects it', (await page.locator('.ai-sched-stop.on').count()) === 1);
check('tapping a row highlights its pin',
  (await page.locator('.ai-route-map .trip-pin.active .trip-pin-no').innerText()) === '3');
await page.screenshot({ path: `${SHOTS}/f2-proposal.png` });

// ---- refine ----
await page.getByRole('button', { name: /more food stops/i }).click();
await page.waitForTimeout(400);
await page.waitForSelector('.ai-sched', { timeout: 15000 });
check('refine issued a second call', calls === 2);
check('refined proposal replaced the first',
  (await page.locator('.ai-sched').innerText()).includes('Chez Leon'));
check('proposal counter advanced',
  (await page.locator('.ai-plan-proposal-tag').innerText()).includes('2'));
await page.screenshot({ path: `${SHOTS}/f3-refined.png` });

// ---- import ----
await page.locator('.ai-plan-import').click();
await page.waitForTimeout(2500);
check('modal closed after import', (await page.locator('.ai-plan-card').count()) === 0);
check('catalogue stops became numbered map pins', (await tripPins()) >= 3);
check('discovery pin on the map', (await page.locator('.dem-pin.ai-disc').count()) >= 1);
await page.locator('.day-plan-collapse .day-collapse-head').first().click().catch(() => {});
await page.waitForTimeout(800);
check('schedule card kept in the rail', await page.locator('.ai-day-panel').isVisible().catch(() => false));
await page.screenshot({ path: `${SHOTS}/f4-imported.png` });

await browser.close();
const failed = results.filter((r) => !r.cond).length;
console.log(`\nchecks failed: ${failed}  |  console/page errors: ${errors.length}`);
errors.slice(0, 10).forEach((e) => console.log('  ' + e));
process.exit(failed || errors.length ? 1 : 0);
