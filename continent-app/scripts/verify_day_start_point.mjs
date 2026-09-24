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

const PORT = 4193;
const BASE = `http://127.0.0.1:${PORT}`;
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
  await page.goto(`${BASE}/?tab=day&o=CRL`);
  await page.locator('.day-flow-search input').waitFor({ timeout: 120000 });
  await page.waitForTimeout(900);
};

// The quick starts as they render: label, group heading and chip height.
const readQuick = (page) => page.evaluate(() => {
  const groups = [...document.querySelectorAll('.day-flow-quickgroup')].map((g) => ({
    label: (g.querySelector('.day-flow-suggest-label')?.textContent || '').trim(),
    chips: [...g.querySelectorAll('.day-flow-quickchip')].map((c) => ({
      text: c.innerText.replace(/\s+/g, ' ').trim(),
      h: Math.round(c.getBoundingClientRect().height),
    })),
  }));
  return {
    groups,
    err: (document.querySelector('.day-flow-quickerr')?.textContent || '').trim(),
    // Nothing from the removed popular-city block may survive.
    popular: document.querySelectorAll('.day-flow-suggest').length,
  };
});

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
    const all = q.groups.flatMap((g) => g.chips);
    if (all.length !== 1) fail(`signed out with nothing saved: ${all.length} quick starts, expected 1`);
    else if (!/current location/i.test(all[0].text)) fail(`the only quick start is "${all[0].text}"`);
    else if (all[0].h < 44) fail(`the location chip is ${all[0].h}px, under 44`);
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
    await page.locator('.day-flow-chosen').waitFor({ timeout: 30000 });
    const label = (await page.locator('.day-stay-chosen-label').innerText()).trim();
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
    if (await page.locator('.day-flow-chosen').count()) fail('a refused location still chose a start point');
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
    const trip = q.groups.find((g) => /from your trip/i.test(g.label));
    if (!trip) fail(`no "from your trip" group, groups: ${q.groups.map((g) => g.label).join(' | ')}`);
    else {
      const texts = trip.chips.map((c) => c.text);
      if (!texts.some((tx) => /barcelona/i.test(tx))) fail(`the stop running today is not offered: ${texts.join(' | ')}`);
      if (texts.some((tx) => /seville/i.test(tx))) fail(`a stop 40 days out is offered: ${texts.join(' | ')}`);
      if (!texts.some((tx) => /your trip, from/i.test(tx))) fail(`no trip chip says when it starts: ${texts.join(' | ')}`);
      else ok(`trip chips: ${texts.join(' | ')}`);

      // Scoped to the chip: the saved-trip list below names the same city.
      await page.locator('.day-flow-quickchip', { hasText: /barcelona/i }).first().click();
      await page.locator('.day-flow-chosen').waitFor({ timeout: 30000 });
      // Picking a trip stop answers step 2 as well: the trip already knows
      // which day this is.
      await page.locator('.day-flow-next').click();
      await page.locator('.day-flow-date').waitFor({ timeout: 30000 });
      const next = page.locator('.day-flow-next');
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
    const recent = q.groups.find((g) => /started here before/i.test(g.label));
    if (!recent) fail(`no "started here before" group, groups: ${q.groups.map((g) => g.label).join(' | ')}`);
    else {
      const texts = recent.chips.map((c) => c.text);
      if (texts.length !== 3) fail(`${texts.length} recent starts, expected 3: ${texts.join(' | ')}`);
      if (new Set(texts).size !== texts.length) fail(`recent starts repeat a label: ${texts.join(' | ')}`);
      else ok(`recent starts: ${texts.join(' | ')}`);

      // The newest three, so the two oldest plans are deliberately not here.
      await page.locator('.day-flow-quickchip', { hasText: /piazza navona/i }).first().click();
      await page.locator('.day-flow-chosen').waitFor({ timeout: 30000 });
      ok('a recent start answers step 1 in one tap');
    }
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
      const list = document.querySelector('.day-flow-results');
      const panel = document.querySelector('.day-flow-panel');
      const p = panel.getBoundingClientRect();
      const l = list.getBoundingClientRect();
      return {
        inputH: Math.round(input.getBoundingClientRect().height),
        // Full width of the panel, bleeding through its 16px of padding: the
        // panel's own 1px border is the only thing it stops short of.
        fullWidth: l.width >= p.width - 2,
        hits: document.querySelectorAll('.day-stay-hit').length,
        shortHits: [...document.querySelectorAll('.day-stay-hit')]
          .filter((h) => h.getBoundingClientRect().height < 44).length,
      };
    });
    if (phone.inputH < 48) fail(`phone: search field is ${phone.inputH}px, under 48`);
    if (!phone.fullWidth) fail('phone: the results list is not full width');
    if (phone.shortHits) fail(`phone: ${phone.shortHits} result row(s) under 44px`);
    else ok(`phone: ${phone.inputH}px field, ${phone.hits} full-width results`);

    await page.locator('.day-stay-result').first().click();
    await page.locator('.day-flow-chosen').waitFor({ timeout: 30000 });
    const docked = await page.evaluate(() => {
      const btn = document.querySelector('.day-flow-panel > .day-flow-next');
      return btn ? getComputedStyle(btn).position : '';
    });
    if (docked !== 'sticky') fail(`phone: Continue is ${docked || 'absent'}, not docked`);
    else ok('phone: Continue docks to the bottom of the scroll');
    await page.screenshot({ path: `${SHOTS}/day-start-phone.png`, fullPage: true });
    await ctx.close();
  }

  await browser.close();
  if (!process.exitCode) console.log('\nverify_day_start_point OK');
} finally {
  if (srv) srv.kill();
}
