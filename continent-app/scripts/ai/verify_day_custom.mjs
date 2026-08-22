// Headless verify for the day planner's custom-place layer, all offline:
// Nominatim and parse-booking are both intercepted, so no geocoder is hit
// and no AI quota is spent.
//
//   1. POI rows: rating chips stripped, titles stacked and never clipped.
//   2. Search fallback: "Gaisberg" is not in the catalogue -> one tap makes
//      it a custom stop on today's plan (geocoded pin, custom badge).
//   3. Unmappable name -> still added, centre fallback + "location
//      approximate" badge. Never an error, never a lost place.
//   4. Import ideas drawer: a pasted link -> extracted activities -> one tap
//      puts one on the day; discard removes the other.
//   5. Everything survives a reload off the persisted prefs.
//   6. An applied bot plan with an unmapped discovery wears the
//      "custom location" tag instead of a wrong pin.
//
//   node scripts/ai/verify_day_custom.mjs

import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4193;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/ai/shots';
mkdirSync(SHOTS, { recursive: true });

const PROJECT_REF = 'ntssxktaduxzpsmejwyv';

const isUp = async () => {
  try { return (await fetch(BASE)).ok; } catch { return false; }
};
let srv = null;
const waitForServer = async () => {
  if (await isUp()) return;
  srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    shell: true, stdio: 'ignore',
  });
  for (let i = 0; i < 60; i += 1) {
    if (await isUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite preview never came up');
};

const PLAN = {
  id: 'local:customtest',
  label: 'Brussels custom test',
  startDate: '2026-08-04',
  stops: [{ destinationId: 'BRU', days: 2 }],
};
// Two catalogue stops already on the day, so the timeline exists before any
// custom place arrives. Applied bot plan carries one unmapped discovery.
const ASSIGNMENTS = { 0: { 0: [2, 0] } };
const PREFS = {
  routeMode: 'manual',
  aiPlans: {
    '0:0': {
      summary: 'A short classic morning.',
      stops: [
        { id: '2', name: 'Grand Place', lat: 50.84671, lon: 4.35251, arrive: '09:32', dwellMin: 30, why: 'Start central.', external: false },
        { id: '0', name: 'Manneken Pis', lat: 50.84499, lon: 4.34999, arrive: '10:07', dwellMin: 10, why: 'Around the corner.', external: false },
        { name: 'Gaisberg Panorama', lat: null, lon: null, arrive: null, dwellMin: 60, why: 'Your own wish, kept even though it could not be pinned.', external: true, unmapped: true },
      ],
      totals: { stops: 3, walkKm: 1.2, endTime: '11:00', lunchAfter: -1, lunchMin: 0 },
      meta: { model: 'test', optimized: false, dropped: 0, cached: false },
      appliedAt: 1,
    },
  },
};

const IDEAS_RESULT = {
  summary: 'A blog with two ideas.',
  bookings: [],
  activities: [
    { name: 'Comic strip mural walk', city: 'Brussels', durationMin: 90, note: 'From the article.' },
    { name: 'Cantillon brewery visit', city: 'Brussels', eur: 15, durationMin: 60 },
  ],
  meta: { model: 'mock', files: 0, cached: false },
  pass: { tier: 'free', plansLeft: 3 },
};

const errors = [];
let failures = 0;
const check = (name, cond) => {
  if (!cond) failures += 1;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`);
};
const isMockAuthNoise = (s) => /401|day_plans|user_settings|trip_plans|Invalid (JWT|Refresh Token)|AuthApiError|JWSError/i.test(s);

try {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  page.on('pageerror', (e) => {
    const msg = (e && (e.message || e.toString())) || String(e);
    if (!isMockAuthNoise(msg)) errors.push(`pageerror: ${msg.split('\n')[0]}`);
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/tile|cartocdn|ERR_|emrldtp|config is not valid|MIME type|Service worker|osrm/i.test(t)) return;
    if (isMockAuthNoise(t)) return;
    errors.push(`console: ${t.slice(0, 140)}`);
  });

  // Nominatim, answered locally: Gaisberg geocodes near Brussels, anything
  // else finds nothing (the unmapped path).
  await page.route('**/nominatim.openstreetmap.org/**', async (route) => {
    const url = route.request().url();
    const isGaisberg = /Gaisberg/i.test(decodeURIComponent(url));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isGaisberg ? [{
        lat: '50.8610', lon: '4.3720', name: 'Gaisberg',
        display_name: 'Gaisberg, Brussels, Belgium',
        address: { country: 'Belgium' },
      }] : []),
    });
  });
  await page.route('**/functions/v1/parse-booking', async (route) => {
    await new Promise((r) => setTimeout(r, 400));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(IDEAS_RESULT) });
  });
  // OSRM route lookups are irrelevant here and slow the run down.
  await page.route('**/router.project-osrm.org/**', (route) => route.abort());

  await page.addInitScript(({ plan, prefs, assignments, ref }) => {
    // Init scripts replay on EVERY navigation; the reload leg of this verify
    // must find what the run wrote, not a fresh copy of the seed.
    if (localStorage.getItem('__verify_seeded__')) return;
    localStorage.setItem('__verify_seeded__', '1');
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.onboardingSeen.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('carta.dayplans.v1', JSON.stringify([plan]));
    localStorage.setItem(`carta.dayplan.${plan.id}`, JSON.stringify(assignments));
    localStorage.setItem(`carta.dayprefs.${plan.id}`, JSON.stringify(prefs));
    const year = Math.floor(Date.now() / 1000) + 31536000;
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
      access_token: 'mock.access.token', token_type: 'bearer',
      expires_in: 31536000, expires_at: year, refresh_token: 'mock-refresh',
      user: { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'mock@example.com', app_metadata: { provider: 'email' }, user_metadata: {} },
    }));
  }, { plan: PLAN, prefs: PREFS, assignments: ASSIGNMENTS, ref: PROJECT_REF });

  await page.goto(`${BASE}/?tab=day&o=CRL`);
  await page.waitForTimeout(3000);
  await page.getByText('Brussels custom test').first().click({ timeout: 30000 });
  await page.waitForTimeout(2500);

  // The workspace opens on today's plan; the browser lives one tab over.
  await page.locator('.dayws-tabs').waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);

  // ---- 1. Ratings stripped, titles readable. ----
  check('no rating chips anywhere in the day lists', (await page.locator('.dayr-name .score-chip').count()) === 0);
  const clipped = await page.locator('.dayr-name').evaluateAll((els) => els
    .filter((el) => el.scrollWidth > el.clientWidth + 1).length);
  check('no clipped titles in the route list', clipped === 0);

  // ---- 6. The applied bot plan's unmapped find wears its tag. ----
  check('unmapped bot find keeps its listing', (await page.getByText('Gaisberg Panorama').count()) >= 1);
  check('unmapped bot find wears the custom-location tag', (await page.locator('.ai-unmapped-tag').count()) >= 1);

  // ---- 2. Search fallback: a geocodable custom place. ----
  await page.locator('.dayws-tab').nth(1).click();
  await page.locator('.daya-mode').nth(1).click();
  const search = page.locator('.daya-search input').first();
  await search.fill('Gaisberg');
  await page.waitForTimeout(400);
  const addBtn = page.locator('.daya-custom-add');
  check('custom-add action appears for an uncatalogued name', await addBtn.count() === 1);
  await addBtn.click();
  await page.waitForTimeout(1200);
  await page.locator('.dayws-tab').nth(0).click();
  const gaisRow = page.locator('.dayr-row', { hasText: 'Gaisberg' });
  check('Gaisberg landed on the route list', await gaisRow.count() === 1);
  check('it wears the custom badge', (await gaisRow.locator('.day-badge-custom').count()) === 1);
  check('a geocoded custom place is not marked approximate', !(await gaisRow.locator('.day-badge-custom').first().textContent()).includes('approximate'));

  // ---- 3. An unmappable name still lands, honestly badged. ----
  await page.locator('.dayws-tab').nth(1).click();
  check('search cleared after adding', (await search.inputValue()) === '');
  await search.fill('Uncle Bobs secret terrace');
  await page.waitForTimeout(400);
  await page.locator('.daya-custom-add').click();
  await page.waitForTimeout(1200);
  await page.locator('.dayws-tab').nth(0).click();
  const bobRow = page.locator('.dayr-row', { hasText: 'Uncle Bobs secret terrace' });
  check('unmappable place still added', await bobRow.count() === 1);
  check('and marked location-approximate', (await bobRow.locator('.day-badge-custom').first().textContent()).includes('approximate'));
  await page.screenshot({ path: `${SHOTS}/custom-1-added.png`, fullPage: true });

  // ---- 4. Import ideas: link in, activities out, one tap onto the day. ----
  await page.locator('.dayws-tab').nth(2).click();
  await page.locator('.extras-drop-url input').fill('https://a-blog.example/one-day-in-brussels');
  await page.locator('.extras-drop-url .extras-add-btn').click();
  await page.locator('.extras-drop-status.ok').waitFor({ timeout: 10000 });
  check('ideas staged from the link', (await page.locator('.day-idea-row').count()) === 2);
  await page.locator('.day-idea-row', { hasText: 'Comic strip mural walk' }).locator('.day-idea-add').click();
  await page.waitForTimeout(1200);
  check('idea became a stop on the day', await (async () => {
    await page.locator('.dayws-tab').nth(0).click();
    const n = await page.locator('.dayr-row', { hasText: 'Comic strip mural walk' }).count();
    await page.locator('.dayws-tab').nth(2).click();
    return n === 1;
  })());
  check('added idea left the drawer', (await page.locator('.day-idea-row').count()) === 1);
  await page.locator('.day-idea-row .trip-stop-remove').click();
  await page.waitForTimeout(300);
  check('discarded idea gone too', (await page.locator('.day-idea-row').count()) === 0);
  await page.screenshot({ path: `${SHOTS}/custom-2-ideas.png`, fullPage: true });

  // ---- 5. Reload: the custom layer is persistence, not session state. ----
  await page.goto(`${BASE}/?tab=day&o=CRL`);
  await page.waitForTimeout(2500);
  await page.getByText('Brussels custom test').first().click({ timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.locator('.dayws-tabs').waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  check('custom stops survive a reload', (await page.locator('.dayr-row', { hasText: 'Gaisberg' }).count()) === 1
    && (await page.locator('.dayr-row', { hasText: 'Comic strip mural walk' }).count()) === 1);
  check('approximate badge survives a reload', (await page.locator('.day-badge-custom', { hasText: 'approximate' }).count()) >= 1);

  await browser.close();
} catch (err) {
  failures += 1;
  console.error('FAIL:', err.stack || err.message);
} finally {
  if (srv) {
    srv.kill();
    if (process.platform === 'win32' && srv.pid) {
      try { spawnSync('taskkill', ['/pid', String(srv.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
    }
  }
}

for (const e of errors) console.error('  page error:', e);
if (errors.length) failures += errors.length;
console.log(failures ? `\n${failures} FAILURE(S)` : '\nverify_day_custom OK');
process.exit(failures ? 1 : 0);
