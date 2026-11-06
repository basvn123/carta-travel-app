// Headless check of the day planner's FIRST question after the start-point
// pass (prompt D1): the three quick starts under the search box.
//
// Each one is a different way a day already has a starting point, and each is
// checked in the state that produces it:
//   - the device's own position, granted and then refused;
//   - a stop of a saved trip whose dates cover the fortnight ahead, which
//     also presets the date so step 2 opens answered;
//   - the last few standalone plans' start points, deduped by label.
//
// Supabase and Nominatim are both intercepted, so the run is deterministic
// and costs nothing.
//
// Run from inside continent-app/:  node scripts/verify_day_start_point.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { authConfigured } from './lib/authConfigured.mjs';

// T1089 needs: account (case 4 reads a signed-in traveller's saved trips; skipped
// when the app under test has no Supabase credentials).
const AUTH_ON = await authConfigured(process.argv[2] || `http://127.0.0.1:${Number(process.env.CARTA_PORT) || 4193}`);

// CARTA_PORT (T389): a parallel session may hold the default port with its own
// preview, so a run can name its own server instead of testing someone else's.
const PORT = Number(process.env.CARTA_PORT) || 4193;
// T1089: a URL argument names a running server (the wizard markup is dayw-*
// since the T9xx day wizard; the old quick-start groups and day-flow-chosen are gone).
const BASE = (process.argv[2] || `http://127.0.0.1:${PORT}`).replace(/\/$/, '');
const SHOTS = 'scripts/shots';
const PROJECT_REF = 'ntssxktaduxzpsmejwyv';
mkdirSync(SHOTS, { recursive: true });

const isUp = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };
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

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };
const ok = (msg) => console.log('  ok:', msg);

const iso = (offsetDays) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

// Two Rome hits, so "which of these is mine" is a real question the row has
// to answer: same town, different streets.
const GEOCODE = [
  {
    display_name: 'Hotel Artemide, Via Nazionale, Rome, Lazio, Italy',
    name: 'Hotel Artemide', lat: '41.8996', lon: '12.4939',
    category: 'tourism', type: 'hotel',
    address: { country: 'Italy', country_code: 'it' },
  },
  {
    display_name: '12, Via dei Coronari, Rome, Lazio, Italy',
    name: '', lat: '41.9005', lon: '12.4690',
    category: 'place', type: 'house',
    address: { country: 'Italy', country_code: 'it', house_number: '12' },
  },
];

// Barcelona, a stop of a saved trip that is running right now: the fortnight
// window has to catch a stop that STARTED before today and runs past it.
const TRIP_STOPS = [
  {
    trip_plan_id: 'trip-1', position: 0, city: 'Barcelona', country: 'Spain',
    destination_id: 'BCN', arrive_date: iso(-2), depart_date: iso(3),
  },
  {
    trip_plan_id: 'trip-1', position: 1, city: 'Valencia', country: 'Spain',
    destination_id: 'VLC', arrive_date: iso(3), depart_date: iso(6),
  },
  // Outside the fortnight: it must NOT be offered.
  {
    trip_plan_id: 'trip-1', position: 2, city: 'Seville', country: 'Spain',
    destination_id: 'SVQ', arrive_date: iso(40), depart_date: iso(44),
  },
];

const seed = async (page, { plans = [], signedIn = false, geo = 'grant' } = {}) => {
  await page.addInitScript(({ ref, plans: sp, signedIn: si, geo: g }) => {
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('continent.onboardingSeen.v1', '1');
    localStorage.setItem('carta.dayplans.v1', JSON.stringify(sp));
    if (si) {
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
    }
    // The permission prompt never appears headless, so the device's answer is
    // stubbed: both the yes and the no have their own copy on screen.
    navigator.geolocation.getCurrentPosition = (onOk, onErr) => {
      if (g === 'deny') { onErr({ code: 1, message: 'denied' }); return; }
      onOk({ coords: { latitude: 41.8902, longitude: 12.4922 } });
    };
  }, { ref: PROJECT_REF, plans, signedIn, geo });

  await page.route('**/nominatim.openstreetmap.org/search**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(GEOCODE),
  }));
  await page.route('**/nominatim.openstreetmap.org/reverse**', (r) => r.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      display_name: 'Colosseum, Piazza del Colosseo, Rome, Lazio, Italy',
      name: 'Colosseum', lat: '41.8902', lon: '12.4922',
      category: 'tourism', type: 'attraction',
      address: { country: 'Italy', country_code: 'it' },
    }),
  }));
  // The saved trip, as the two queries fetchTripPlans() actually makes.
  await page.route('**/rest/v1/trip_plans**', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{
      id: 'trip-1', user_id: '00000000-0000-4000-8000-000000000001',
      label: 'Spain in spring', created_at: new Date().toISOString(),
    }]),
  }));
  await page.route('**/rest/v1/trip_plan_stops**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(TRIP_STOPS),
  }));
};

const openStep1 = async (page) => {
  await page.goto(`${BASE}/?tab=plan&mode=day&o=CRL`);
  await page.locator('.day-flow-search input').waitFor({ timeout: 120000 });
  await page.waitForTimeout(900);
};

// The quick starts as they render: one row each, "Use my current location",
// then the stops of a running trip ("your trip, from ..."), then recent starts.
const readQuick = (page) => page.evaluate(() => {
  const rows = [...document.querySelectorAll('.dayw-quick-row')].map((c) => ({
    text: c.innerText.replace(/\s+/g, ' ').trim(),
    h: Math.round(c.getBoundingClientRect().height),
  }));
  return {
    rows,
    loc: rows.filter((r) => /current location/i.test(r.text)),
    trip: rows.filter((r) => /your trip, from/i.test(r.text)),
    recent: rows.filter((r) => !/current location|your trip, from/i.test(r.text)),
    err: (document.querySelector('.dayw-note')?.textContent || '').trim(),
    // Nothing from the removed popular-city block may survive.
    popular: document.querySelectorAll('.day-flow-suggest').length,
  };
});
const chosen = (page) => page.locator('.dayw-chosen');

try {
  await waitForServer();
  const browser = await chromium.launch();

  // ---- 1. Signed out, nothing saved: only the location chip ----------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    await seed(page);
    await openStep1(page);
    const q = await readQuick(page);
    if (q.popular) fail(`the popular-city block still renders (${q.popular} of them)`);
    const all = q.rows;
    if (all.length !== 1) fail(`signed out with nothing saved: ${all.length} quick starts, expected 1`);
    else if (!/current location/i.test(all[0].text)) fail(`the only quick start is "${all[0].text}"`);
    else if (all[0].h < 40) fail(`the location row is ${all[0].h}px, under 40`);
    else ok(`signed out: one quick start, "${all[0].text}" at ${all[0].h}px`);
    await page.screenshot({ path: `${SHOTS}/day-start-empty.png` });
    await ctx.close();
  }

  // ---- 2. The device answers: the day starts where you are standing -------
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    await seed(page);
    await openStep1(page);
    await page.getByRole('button', { name: /current location/i }).click();
    await chosen(page).waitFor({ timeout: 30000 });
    const label = (await page.locator('.dayw-chosen-text b').innerText()).trim();
    // The reverse lookup names it; without one it would still be a point.
    if (!/colosseum|rome/i.test(label)) fail(`located start point reads "${label}"`);
    else ok(`my location became "${label}"`);
    await page.screenshot({ path: `${SHOTS}/day-start-located.png` });
    await ctx.close();
  }

  // ---- 3. The device refuses: a setting to change, not a failure ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    await seed(page, { geo: 'deny' });
    await openStep1(page);
    await page.getByRole('button', { name: /current location/i }).click();
    await page.waitForTimeout(500);
    const q = await readQuick(page);
    if (!/switched off/i.test(q.err)) fail(`refusal copy reads "${q.err}"`);
    else if (/failed|error|sorry/i.test(q.err)) fail(`refusal copy blames the traveller: "${q.err}"`);
    else ok(`refusal: "${q.err}"`);
    if (await chosen(page).count()) fail('a refused location still chose a start point');
    await page.screenshot({ path: `${SHOTS}/day-start-denied.png` });
    await ctx.close();
  }

  // ---- 4. Signed in, mid-trip: the stop you are in, and the date with it --
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    await seed(page, { signedIn: true });
    await openStep1(page);
    const q = await readQuick(page);
    const texts = q.trip.map((c) => c.text);
    if (!AUTH_ON) console.log('  SKIP (needs account): trip stops need Supabase credentials, none configured here');
    else if (!texts.length) fail(`no "your trip, from" rows, rows: ${q.rows.map((r) => r.text).join(' | ')}`);
    else {
      if (!texts.some((tx) => /barcelona/i.test(tx))) fail(`the stop running today is not offered: ${texts.join(' | ')}`);
      if (q.rows.some((r) => /seville/i.test(r.text))) fail(`a stop 40 days out is offered: ${q.rows.map((r) => r.text).join(' | ')}`);
      else ok(`trip rows: ${texts.join(' | ')}`);

      await page.locator('.dayw-quick-row', { hasText: /barcelona/i }).first().click();
      await chosen(page).waitFor({ timeout: 30000 });
      // Picking a trip stop answers step 2 as well: the trip already knows
      // which day this is.
      await page.locator('.guide-next').click();
      await page.locator('.dayw-when').waitFor({ timeout: 30000 });
      const next = page.locator('.guide-next');
      if (await next.isDisabled()) fail('picking a trip stop did not preset the date');
      else ok('picking a trip stop preset the date, step 2 opens answered');
    }
    await page.screenshot({ path: `${SHOTS}/day-start-trip.png` });
    await ctx.close();
  }

  // ---- 5. Recent starts, deduped by label, capped at three ---------------
  {
    const mk = (id, label) => ({
      id, label: 'Day plan', startDate: iso(-3), stops: [],
      stayPoint: { label: `${label}, Rome, Italy`, shortLabel: label, lat: 41.9, lon: 12.49 },
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    await seed(page, {
      plans: [
        mk('local:1', 'Hotel Artemide'),
        mk('local:2', 'Hotel Artemide'),
        mk('local:3', 'Via dei Coronari'),
        mk('local:4', 'Piazza Navona'),
        mk('local:5', 'Trastevere'),
      ],
    });
    await openStep1(page);
    const q = await readQuick(page);
    const texts = q.recent.map((c) => c.text);
    if (texts.length !== 3) fail(`${texts.length} recent starts, expected 3: ${texts.join(' | ')}`);
    if (new Set(texts).size !== texts.length) fail(`recent starts repeat a label: ${texts.join(' | ')}`);
    else ok(`recent starts: ${texts.join(' | ')}`);

    // The newest three, so the two oldest plans are deliberately not here.
    await page.locator('.dayw-quick-row', { hasText: /piazza navona/i }).first().click();
    await chosen(page).waitFor({ timeout: 30000 });
    ok('a recent start answers step 1 in one tap');
    await page.screenshot({ path: `${SHOTS}/day-start-recent.png` });
    await ctx.close();
  }

  // ---- 6. The phone: 48px field, full-width list, docked Continue ---------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await seed(page);
    await openStep1(page);
    await page.locator('.day-flow-search input').fill('Rome');
    await page.locator('.day-flow-search .trip-add-btn').click();
    await page.locator('.day-stay-result').first().waitFor({ timeout: 30000 });
    const phone = await page.evaluate(() => {
      const input = document.querySelector('.day-flow-search .day-stay-input');
      const list = document.querySelector('.dayw-results');
      const panel = document.querySelector('.guide-canvas');
      const p = panel.getBoundingClientRect();
      const l = list.getBoundingClientRect();
      return {
        inputH: Math.round(input.getBoundingClientRect().height),
        // Full width of the panel, bleeding through its 16px of padding: the
        // panel's own 1px border is the only thing it stops short of.
        fullWidth: l.width >= p.width - 2,
        hits: document.querySelectorAll('.dayw-hit').length,
        shortHits: [...document.querySelectorAll('.dayw-hit')]
          .filter((h) => h.getBoundingClientRect().height < 44).length,
      };
    });
    if (phone.inputH < 48) fail(`phone: search field is ${phone.inputH}px, under 48`);
    if (!phone.fullWidth) fail('phone: the results list is not full width');
    if (phone.shortHits) fail(`phone: ${phone.shortHits} result row(s) under 44px`);
    else ok(`phone: ${phone.inputH}px field, ${phone.hits} full-width results`);

    await page.locator('.day-stay-result').first().click();
    await chosen(page).waitFor({ timeout: 30000 });
    // The wizard footer carries Next; docked means it sits on the viewport's floor.
    const docked = await page.evaluate(() => {
      const btn = document.querySelector('.guide-foot .guide-next');
      const r = btn?.getBoundingClientRect();
      return r ? { bottom: Math.round(r.bottom), vh: innerHeight } : null;
    });
    if (!docked || docked.bottom > docked.vh || docked.bottom < docked.vh - 120) fail(`phone: Next is not docked (${JSON.stringify(docked)})`);
    else ok('phone: Next docks to the bottom of the screen');
    await page.screenshot({ path: `${SHOTS}/day-start-phone.png`, fullPage: true });
    await ctx.close();
  }

  await browser.close();
  if (!process.exitCode) console.log('\nverify_day_start_point OK');
} finally {
  if (srv) srv.kill();
}
