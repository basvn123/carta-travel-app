// Headless verify of the Carta chat's town-picker step: the reordered
// wizard (focus/interests before town) and the four ways to land on a town
// (nearby, catalogue/anywhere search, map, ask AI). Nominatim and the
// suggest-city Edge Function are intercepted so the run is deterministic.
//
//   node scripts/ai/verify_town_picker.mjs [url] [shotdir]

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] || 'http://localhost:4173/';
const SHOTS = process.argv[3] || 'scripts/ai/shots';
mkdirSync(SHOTS, { recursive: true });

const PROJECT_REF = 'ntssxktaduxzpsmejwyv';

const GEOCODE = [{
  display_name: '10, Wittewalle, Ghent, East Flanders, Belgium',
  lat: '51.0543', lon: '3.7174', type: 'house',
}];
// A made-up query near enough to a real destination that resolveNearest
// must snap it to that destination and say so.
const ANYWHERE_QUERY = 'Zzqxnowhereplace';
const ANYWHERE_GEOCODE = [{
  display_name: 'Zzqxnowhereplace, East Flanders, Belgium',
  lat: '51.06', lon: '3.72', type: 'hamlet',
}];

const SUGGESTIONS = {
  suggestions: [
    { id: 'mock-cat', name: 'Bruges', country: 'Belgium', why: 'Canals and a compact old town.', inCatalog: true },
    {
      name: 'Lier', country: 'Belgium', why: 'A quiet, lesser-known town.', inCatalog: false, lat: 51.13, lon: 4.57,
    },
  ],
};

const errors = [];
const results = [];
const check = (name, cond) => {
  results.push({ name, cond });
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`);
};
const isMockAuthNoise = (s) => /401|day_plans|user_settings|Invalid (JWT|Refresh Token)|AuthApiError|JWSError|PGRST301|JWT/i.test(s);

const browser = await chromium.launch();

async function setup(page) {
  page.on('pageerror', (e) => {
    const msg = (e && (e.message || e.toString())) || 'unknown';
    if (!isMockAuthNoise(msg)) errors.push(`pageerror: ${msg.split('\n')[0]}`);
  });
  page.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('UNHANDLED::')) { if (!isMockAuthNoise(t)) errors.push(`rejection: ${t.slice(11, 160)}`); return; }
    if (m.type() !== 'error') return;
    if (/tile|cartocdn|ERR_|emrldtp|config is not valid|nominatim/i.test(t)) return;
    if (isMockAuthNoise(t)) return;
    errors.push(`console: ${t.slice(0, 140)}`);
  });

  await page.route('**/nominatim.openstreetmap.org/**', (r) => {
    const url = r.request().url();
    const body = url.includes(encodeURIComponent(ANYWHERE_QUERY)) ? ANYWHERE_GEOCODE : GEOCODE;
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/functions/v1/suggest-city', async (route) => {
    await new Promise((r) => setTimeout(r, 300));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SUGGESTIONS) });
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
}

// Walk stay -> when -> how -> chat, then answer focus + interests, landing
// fresh on the town step every time.
async function reachTownStep(page) {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);
  for (const btn of await page.getByRole('button').all()) {
    const t = (await btn.innerText().catch(() => '')).trim();
    if (/day planner/i.test(t) && (await btn.isVisible().catch(() => false))) { await btn.click(); break; }
  }
  await page.waitForTimeout(1500);

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

  await page.locator('.day-flow-card.primary').click();
  await page.waitForTimeout(700);

  // Q1: focus (single-select, advances on tap).
  check('wizard order: first question is focus', (await page.getByText(/city or nature\?/i).count()) >= 1);
  await page.locator('.chat-opt').first().click();
  await page.waitForTimeout(350);

  // Q2: interests (multi-select).
  check('wizard order: second question is interests', (await page.getByText(/what do you most want to see\?/i).count()) >= 1);
  await page.locator('.chat-opts-multi .chat-opt').first().click();
  await page.waitForTimeout(150);
  await page.locator('.chat-send-multi').click();
  await page.waitForTimeout(350);

  // Q3: town.
  check('wizard order: third question is town', (await page.getByText(/where do you want to spend the day\?/i).count()) >= 1);
}

async function runTabs(label, viewport) {
  const page = await browser.newPage({ viewport });
  await setup(page);
  await reachTownStep(page);

  // ---- tabs present ----
  check(`${label}: four town-picker tabs`, (await page.locator('.chat-town-tab').count()) === 4);
  await page.screenshot({ path: `${SHOTS}/tp1-${label}-nearby.png` });

  // ---- nearby (default) ----
  const nearbyLabels = await page.locator('.chat-town-picker .chat-opt .chat-opt-text b').allInnerTexts();
  check(`${label}: nearby towns named`, nearbyLabels.length > 0 && nearbyLabels.every((s) => s.trim().length > 1));

  // ---- search: catalogue match ----
  await page.locator('.chat-town-tab').filter({ hasText: 'Search' }).click();
  await page.waitForTimeout(200);
  await page.locator('.chat-town-search input').fill('Ghent');
  await page.waitForTimeout(300);
  const catalogueMatches = await page.locator('.chat-town-search .chat-opts .chat-opt-text b').allInnerTexts();
  check(`${label}: search matches the catalogue`, catalogueMatches.some((s) => /ghent/i.test(s)));

  // ---- search: anywhere fallback ----
  await page.locator('.chat-town-search input').fill(ANYWHERE_QUERY);
  await page.waitForTimeout(300);
  check(`${label}: no catalogue match offers "search anywhere"`,
    (await page.locator('.chat-town-anywhere').count()) === 1);
  await page.screenshot({ path: `${SHOTS}/tp2-${label}-search-anywhere.png` });
  await page.getByRole('button', { name: /search the map instead/i }).click();
  await page.waitForTimeout(500);
  check(`${label}: anywhere search returns a result`,
    (await page.locator('.chat-town-anywhere .chat-opts .chat-opt').count()) >= 1);

  // ---- map tab renders ----
  await page.locator('.chat-town-tab').filter({ hasText: 'Map' }).click();
  await page.waitForTimeout(800);
  check(`${label}: map canvas renders`, (await page.locator('.chat-town-map canvas').count()) >= 1);
  await page.screenshot({ path: `${SHOTS}/tp3-${label}-map.png` });

  // ---- ask Carta tab ----
  await page.locator('.chat-town-tab').filter({ hasText: 'Ask Carta' }).click();
  await page.waitForTimeout(200);
  await page.locator('.chat-town-ai input').fill('A quiet town with canals, not touristy');
  await page.locator('.chat-town-ai .chat-send').click();
  await page.waitForTimeout(700);
  const aiLabels = await page.locator('.chat-town-ai .chat-opts .chat-opt-text b').allInnerTexts();
  check(`${label}: AI suggestions rendered`, aiLabels.some((s) => /bruges/i.test(s)) && aiLabels.some((s) => /lier/i.test(s)));
  await page.screenshot({ path: `${SHOTS}/tp4-${label}-ai.png` });

  // ---- complete the pick from the catalogue search match ----
  await page.locator('.chat-town-tab').filter({ hasText: 'Search' }).click();
  await page.locator('.chat-town-search input').fill('Ghent');
  await page.waitForTimeout(300);
  await page.locator('.chat-town-search .chat-opts .chat-opt').first().click();
  await page.waitForTimeout(400);
  check(`${label}: picking a town advances to "have you been here before?"`,
    (await page.getByText(/have you been here before\?/i).count()) >= 1);
  check(`${label}: transcript shows the picked town, not a raw id`,
    /ghent/i.test(await page.locator('.chat-bubble.me').last().innerText()));

  await page.close();
}

async function runAnywhereResolve(label, viewport) {
  const page = await browser.newPage({ viewport });
  await setup(page);
  await reachTownStep(page);

  await page.locator('.chat-town-tab').filter({ hasText: 'Search' }).click();
  await page.locator('.chat-town-search input').fill(ANYWHERE_QUERY);
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /search the map instead/i }).click();
  await page.waitForTimeout(500);
  await page.locator('.chat-town-anywhere .chat-opts .chat-opt').first().click();
  await page.waitForTimeout(400);
  // The disclosure must be readable BEFORE the pick lands, not flash and
  // advance on its own: a confirm card names the real destination, not the
  // made-up query, and the wizard only moves on once it is tapped.
  check(`${label}: resolution surfaces a real destination, not the typed name`,
    (await page.locator('.chat-town-resolve .chat-town-note').count()) === 1
    && !(await page.locator('.chat-town-resolve .chat-town-note').innerText()).toLowerCase().includes('zzqx'));
  check(`${label}: wizard has NOT advanced before confirming`,
    (await page.getByText(/have you been here before\?/i).count()) === 0);
  await page.screenshot({ path: `${SHOTS}/tp5-${label}-anywhere-resolve-confirm.png` });
  await page.locator('.chat-town-resolve .chat-opt').click();
  await page.waitForTimeout(400);
  check(`${label}: confirming the resolved pick advances the wizard`,
    (await page.getByText(/have you been here before\?/i).count()) >= 1);
  await page.screenshot({ path: `${SHOTS}/tp5-${label}-anywhere-resolved.png` });

  await page.close();
}

await runTabs('desktop', { width: 1440, height: 950 });
await runAnywhereResolve('desktop', { width: 1440, height: 950 });

await browser.close();
const failed = results.filter((r) => !r.cond).length;
console.log(`\nchecks failed: ${failed}  |  console/page errors: ${errors.length}`);
errors.slice(0, 12).forEach((e) => console.log('  ' + e));
process.exit(failed || errors.length ? 1 : 0);
