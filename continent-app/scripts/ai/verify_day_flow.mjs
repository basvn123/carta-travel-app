// Headless verify of the guided Day-planner landing: stay -> when -> how,
// then the Carta chat planner all the way to importing a route onto the map.
//
// Both external calls are intercepted so the run is deterministic and costs
// nothing: Nominatim (address search) and the plan-day Edge Function.
//
//   node scripts/ai/verify_day_flow.mjs [url] [shotdir]

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] || 'http://localhost:4173/';
const SHOTS = process.argv[3] || 'scripts/ai/shots';
mkdirSync(SHOTS, { recursive: true });

const PROJECT_REF = 'ntssxktaduxzpsmejwyv';

// Ghent, so the nearby-towns question has real options to offer.
const GEOCODE = [{
  display_name: '10, Wittewalle, Ghent, East Flanders, Belgium',
  lat: '51.0543', lon: '3.7174', type: 'house',
}];

const stop = (id, name, lat, lon, arrive, dwellMin, why, extra = {}) => ({
  id, name, lat, lon, arrive, dwellMin, why, external: false,
  walkKmFromPrev: 0.4, walkMinFromPrev: 6, ...extra,
});
const PROPOSALS = [
  {
    summary: 'A flat loop through the old centre, with the castle early and the water for the late afternoon.',
    stops: [
      stop('0', 'Gravensteen', 51.0574, 3.7200, '09:35', 60, 'The castle first, before the queues build.'),
      stop('1', 'Saint Bavo Cathedral', 51.0534, 3.7270, '11:05', 45, 'Ten minutes on foot, and cool inside.'),
      stop('2', 'Graslei', 51.0547, 3.7210, '12:30', 40, 'The classic waterfront, best in the middle of the day.'),
    ],
    totals: { stops: 3, walkKm: 2.1, endTime: '14:30', lunchAfter: 1, lunchMin: 75 },
    meta: { model: 'mock', optimized: true, dropped: 0, cached: false, events: 0 },
  },
  {
    summary: 'Same loop, with a proper lunch stop worked in halfway.',
    stops: [
      stop('0', 'Gravensteen', 51.0574, 3.7200, '09:35', 60, 'Still the best opener.'),
      stop(null, 'Markthal', 51.0540, 3.7235, '11:00', 60, 'Covered market for a relaxed bite, big tables.', { external: true }),
      stop('2', 'Graslei', 51.0547, 3.7210, '12:30', 40, 'Walk it off along the water.'),
    ],
    totals: { stops: 3, walkKm: 1.8, endTime: '13:40', lunchAfter: 1, lunchMin: 75 },
    meta: { model: 'mock', optimized: false, dropped: 0, cached: false, refined: true, events: 0 },
  },
];

const errors = [];
const results = [];
const check = (name, cond) => {
  results.push({ name, cond });
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`);
};
const isMockAuthNoise = (s) => /401|day_plans|user_settings|Invalid (JWT|Refresh Token)|AuthApiError|JWSError|PGRST301|JWT/i.test(s);

const browser = await chromium.launch();

async function run(label, viewport) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => {
    const msg = (e && (e.message || e.toString())) || 'unknown';
    if (!isMockAuthNoise(msg)) errors.push(`[${label}] pageerror: ${msg.split('\n')[0]}`);
  });
  page.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('UNHANDLED::')) { if (!isMockAuthNoise(t)) errors.push(`[${label}] rejection: ${t.slice(11, 160)}`); return; }
    if (m.type() !== 'error') return;
    if (/tile|cartocdn|ERR_|emrldtp|config is not valid|nominatim/i.test(t)) return;
    if (isMockAuthNoise(t)) return;
    errors.push(`[${label}] console: ${t.slice(0, 140)}`);
  });

  await page.route('**/nominatim.openstreetmap.org/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(GEOCODE),
  }));
  let calls = 0;
  await page.route('**/functions/v1/plan-day', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    calls += 1;
    // The chat must forward its structured profile, not just free text.
    if (calls === 1 && label === 'desktop') {
      check('chat sends the answer profile', !!body.profile && body.profile.maxWalkKm > 0);
      check('chat sends interests', Array.isArray(body.profile?.interests) && body.profile.interests.length > 0);
      check('chat sends terrain + day length', !!body.profile?.terrain && !!body.profile?.dayLength);
    }
    await new Promise((r) => setTimeout(r, 700));
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(PROPOSALS[body.refine ? 1 : 0]),
    });
  });

  await page.addInitScript(({ ref }) => {
    window.addEventListener('unhandledrejection', (e) => {
      let out; try { out = JSON.stringify(e.reason, Object.getOwnPropertyNames(Object(e.reason))); } catch { out = String(e.reason); }
      console.log('UNHANDLED::' + out);
    });
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.removeItem('carta.dayplans.v1');
    const year = Math.floor(Date.now() / 1000) + 31536000;
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
      access_token: 'mock.access.token', token_type: 'bearer', expires_in: 31536000,
      expires_at: year, refresh_token: 'mock-refresh',
      user: {
        id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated',
        role: 'authenticated', email: 'preview@example.com',
        app_metadata: {}, user_metadata: {}, created_at: new Date(0).toISOString(),
      },
    }));
  }, { ref: PROJECT_REF });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);
  for (const btn of await page.getByRole('button').all()) {
    const t = (await btn.innerText().catch(() => '')).trim();
    if (/day planner/i.test(t) && (await btn.isVisible().catch(() => false))) { await btn.click(); break; }
  }
  await page.waitForTimeout(1500);

  // ---- step 1: stay ----
  check(`${label}: step 1 asks one question`, (await page.locator('.day-flow-q').count()) === 1);
  check(`${label}: intro copy is not on screen`,
    (await page.getByText(/Carta pins it on the map/i).count()) === 0);
  check(`${label}: date field not shown yet`, (await page.locator('.day-flow-date').count()) === 0);
  await page.screenshot({ path: `${SHOTS}/g1-${label}-stay.png` });
  // Help button reveals the explanation that used to sit on the page.
  await page.locator('.day-flow-help').click();
  await page.waitForTimeout(400);
  check(`${label}: help button reveals the intro copy`,
    (await page.getByText(/Carta pins it on the map/i).count()) >= 1);
  await page.screenshot({ path: `${SHOTS}/g2-${label}-help.png` });
  await page.locator('.day-flow-help-close').click();
  await page.waitForTimeout(300);

  await page.locator('.day-flow-search input').fill('10 Wittewalle Ghent');
  await page.getByRole('button', { name: /^find$/i }).click();
  await page.waitForTimeout(1200);
  await page.locator('.day-stay-result').first().click();
  await page.waitForTimeout(500);
  check(`${label}: stay chosen`, await page.locator('.day-flow-chosen').isVisible().catch(() => false));
  await page.locator('.day-flow-next').click();
  await page.waitForTimeout(600);

  // ---- step 2: when ----
  check(`${label}: step 2 is the date`, (await page.locator('.day-flow-date').count()) === 1);
  check(`${label}: stay question is gone`,
    (await page.locator('.day-flow-search').count()) === 0);
  await page.screenshot({ path: `${SHOTS}/g3-${label}-when.png` });
  const nextBtn = page.locator('.day-flow-next');
  if (await nextBtn.isDisabled()) {
    await page.locator('.day-flow-date input').first().fill('2026-08-04').catch(() => {});
    await page.waitForTimeout(400);
  }
  await nextBtn.click();
  await page.waitForTimeout(600);

  // ---- step 3: how ----
  check(`${label}: step 3 offers exactly two ways`, (await page.locator('.day-flow-card').count()) === 2);
  await page.screenshot({ path: `${SHOTS}/g4-${label}-how.png` });
  await page.locator('.day-flow-card.primary').click();
  await page.waitForTimeout(700);

  // ---- chat ----
  check(`${label}: chat opens with one question`, (await page.locator('.chat-bubble-live').count()) === 1);
  check(`${label}: nearby towns offered`, (await page.locator('.chat-opt').count()) >= 1);
  // Every option must actually name its town: the name lives on the nested
  // destination record, so a shape change here silently empties the labels.
  const townLabels = await page.locator('.chat-opt .chat-opt-text b').allInnerTexts();
  check(`${label}: town options are named`,
    townLabels.length > 0 && townLabels.every((s) => s.trim().length > 1));
  await page.screenshot({ path: `${SHOTS}/g5-${label}-chat-q1.png` });

  // Walk the whole question set: single-selects advance on tap, the
  // multi-select and the free-text step need their own confirm.
  // The multi-select shot fires the FIRST time that step is reached, not at a
  // fixed loop index: the question order is not frozen, and a hardcoded index
  // silently stops overwriting the screenshot the day the order changes.
  let multiShot = false;
  for (let i = 0; i < 12; i += 1) {
    if (await page.locator('.chat-typing').count()) break;
    if (await page.locator('.chat-free-input').count()) {
      await page.locator('.chat-send').click();
      break;
    }
    if (await page.locator('.chat-opts-multi').count()) {
      await page.locator('.chat-opts-multi .chat-opt').first().click();
      await page.waitForTimeout(150);
      await page.locator('.chat-opts-multi .chat-opt').nth(1).click();
      await page.waitForTimeout(150);
      if (!multiShot) {
        multiShot = true;
        await page.screenshot({ path: `${SHOTS}/g6-${label}-chat-multi.png` });
      }
      await page.locator('.chat-send-multi').click();
    } else {
      await page.locator('.chat-opt').first().click();
    }
    await page.waitForTimeout(350);
  }

  await page.waitForSelector('.chat-route', { timeout: 20000 });
  check(`${label}: route proposed`, (await page.locator('.chat-route .ai-sched-stop').count()) === 3);
  check(`${label}: transcript kept`, (await page.locator('.chat-bubble.me').count()) >= 5);
  check(`${label}: import offered`, await page.locator('.chat-import').isVisible().catch(() => false));
  await page.screenshot({ path: `${SHOTS}/g7-${label}-chat-route.png` });

  // ---- refine ----
  await page.getByRole('button', { name: /more food stops/i }).click();
  await page.waitForTimeout(500);
  await page.waitForSelector('.chat-route', { timeout: 20000 });
  check(`${label}: refined route replaced the first`,
    (await page.locator('.chat-route').innerText()).includes('Markthal'));
  await page.screenshot({ path: `${SHOTS}/g8-${label}-chat-refined.png` });

  // ---- import -> plan view ----
  await page.locator('.chat-import').click();
  await page.waitForTimeout(3000);
  check(`${label}: landed on the plan view`, (await page.locator('.trip-sheet').count()) === 1);
  check(`${label}: route pins on the map`, (await page.locator('.trip-pin').count()) >= 2);
  await page.screenshot({ path: `${SHOTS}/g9-${label}-imported.png` });

  await page.close();
}

await run('desktop', { width: 1440, height: 950 });
await run('mobile', { width: 390, height: 844 });

await browser.close();
const failed = results.filter((r) => !r.cond).length;
console.log(`\nchecks failed: ${failed}  |  console/page errors: ${errors.length}`);
errors.slice(0, 12).forEach((e) => console.log('  ' + e));
process.exit(failed || errors.length ? 1 : 0);
