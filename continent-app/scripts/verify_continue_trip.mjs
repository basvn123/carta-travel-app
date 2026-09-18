// Headless check of "Continue a trip" (prompt D2): the saved-trip list under
// the day planner's first question, rebuilt as photo cards.
//
// What each run proves:
//   - a trip is a card with a cover photo, a status badge, its dates and its
//     stop chips, not a bordered row with a 46px thumb;
//   - a trip running now, or starting this week, LEADS the step: it renders
//     above the search rather than under it;
//   - past trips sort last and render muted;
//   - tapping a card opens "Which day?", where days already gone are disabled
//     and picking one opens the plan on that stop and that day;
//   - signed out gets a card with a button, not a note in grey type;
//   - signed in with nothing saved gets one line and a "Plan a trip" button;
//   - "Your day plans" wears the same card with a 4:3 photo and its delete
//     behind a menu;
//   - on a phone the cards are a swipe, not a stack.
//
// Supabase is intercepted, so the run is deterministic and costs nothing.
//
// Run from inside continent-app/:  node scripts/verify_continue_trip.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4193;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
const PROJECT_REF = 'ntssxktaduxzpsmejwyv';
const USER_ID = '00000000-0000-4000-8000-000000000001';
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

// Three trips, one of each status, so the sort and the badges are both
// answerable from one screen.
const TRIPS = {
  now: { id: 'trip-now', label: 'Spain in spring' },
  soon: { id: 'trip-soon', label: 'Alps in June' },
  past: { id: 'trip-past', label: 'Portugal last year' },
};
const STOPS = {
  'trip-now': [
    { position: 0, city: 'Barcelona', country: 'Spain', destination_id: 'BCN', arrive_date: iso(-2), depart_date: iso(1) },
    { position: 1, city: 'Valencia', country: 'Spain', destination_id: 'VLC', arrive_date: iso(1), depart_date: iso(4) },
  ],
  'trip-soon': [
    { position: 0, city: 'Innsbruck', country: 'Austria', destination_id: 'INN', arrive_date: iso(30), depart_date: iso(33) },
  ],
  'trip-past': [
    { position: 0, city: 'Porto', country: 'Portugal', destination_id: 'OPO', arrive_date: iso(-60), depart_date: iso(-56) },
  ],
};

const seed = async (page, { trips = [], signedIn = false, dayPlans = [] } = {}) => {
  await page.addInitScript(({ ref, si, plans }) => {
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('continent.onboardingSeen.v1', '1');
    localStorage.setItem('carta.dayplans.v1', JSON.stringify(plans));
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
  }, { ref: PROJECT_REF, si: signedIn, plans: dayPlans });

  const rows = trips.map((k) => ({
    ...TRIPS[k], user_id: USER_ID, created_at: new Date().toISOString(),
  }));
  const stopRows = trips.flatMap((k) => STOPS[TRIPS[k].id].map((s) => ({ ...s, trip_plan_id: TRIPS[k].id })));
  await page.route('**/rest/v1/trip_plans**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(rows),
  }));
  await page.route('**/rest/v1/trip_plan_stops**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(stopRows),
  }));
};

const openStep1 = async (page) => {
  await page.goto(`${BASE}/?tab=day&o=CRL`);
  await page.locator('.day-flow-search input').waitFor({ timeout: 120000 });
  await page.waitForTimeout(1200);
};

// Every trip card as it renders, in DOM order, with the facts the redesign
// promised: a photo with a real ratio, a badge, dates and stop chips.
const readCards = (page) => page.evaluate(() => [...document.querySelectorAll('.dtcards .dtcard')].map((c) => {
  const photo = c.querySelector('.dtcard-photo');
  const box = photo?.getBoundingClientRect();
  return {
    title: (c.querySelector('.dtcard-title')?.textContent || '').trim(),
    badge: (c.querySelector('.dtcard-badge')?.textContent || '').trim(),
    dates: (c.querySelector('.dtcard-dates')?.textContent || '').trim(),
    stops: [...c.querySelectorAll('.dtcard-stop')].map((s) => s.innerText.replace(/\s+/g, ' ').trim()),
    hasImg: Boolean(c.querySelector('.dtcard-img')),
    ratio: box && box.height ? Math.round((box.width / box.height) * 100) / 100 : 0,
    past: c.classList.contains('past'),
    opacity: Number(getComputedStyle(c).opacity),
  };
}));

try {
  await waitForServer();
  const browser = await chromium.launch();

  // ---- 1. Three trips: cards, badges, order, and the lead placement -------
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    await seed(page, { signedIn: true, trips: ['past', 'soon', 'now'] });
    await openStep1(page);

    if (await page.locator('.trip-saved-item').count()) {
      fail('the old bordered saved-trip rows are still rendering');
    }

    const cards = await readCards(page);
    if (cards.length !== 3) fail(`${cards.length} trip cards, expected 3`);
    else {
      // Now first, then the one still to come, then the one already travelled.
      const order = cards.map((c) => c.title);
      if (!/spain/i.test(order[0])) fail(`the running trip is not first: ${order.join(' | ')}`);
      else if (!/alps/i.test(order[1])) fail(`the upcoming trip is not second: ${order.join(' | ')}`);
      else if (!/portugal/i.test(order[2])) fail(`the past trip is not last: ${order.join(' | ')}`);
      else ok(`order: ${order.join(' -> ')}`);

      if (cards[0].badge !== 'Now') fail(`the running trip's badge reads "${cards[0].badge}"`);
      else ok(`running trip badged "${cards[0].badge}"`);
      if (!/^In \d+ days$/.test(cards[1].badge)) fail(`the upcoming badge reads "${cards[1].badge}"`);
      else ok(`upcoming trip badged "${cards[1].badge}"`);
      if (cards[2].badge !== 'Past') fail(`the past badge reads "${cards[2].badge}"`);
      else if (!cards[2].past || cards[2].opacity >= 1) fail('the past trip is not muted');
      else ok(`past trip badged "${cards[2].badge}" and muted at ${cards[2].opacity}`);

      // 16:9, within a pixel of rounding.
      const r = cards[0].ratio;
      if (Math.abs(r - 16 / 9) > 0.05) fail(`the cover ratio is ${r}, expected 16:9`);
      else ok(`cover photo at ${r} (16:9)`);

      if (!cards[0].dates) fail('a trip card carries no date range');
      else ok(`dates: "${cards[0].dates}"`);
      const chips = cards[0].stops.join(' | ');
      if (!/barcelona/i.test(chips) || !/valencia/i.test(chips)) {
        fail(`stop chips do not name both stops: ${chips}`);
      } else if (!/\d+n/.test(chips)) {
        fail(`stop chips carry no night counts: ${chips}`);
      } else ok(`stop chips: ${chips}`);
    }

    // A trip running today leads the step: above the search, not under it.
    const lead = await page.evaluate(() => {
      const section = document.querySelector('.dtsection');
      const search = document.querySelector('.day-flow-search');
      if (!section || !search) return null;
      return {
        inLead: Boolean(document.querySelector('.day-flow-lead .dtsection')),
        above: section.getBoundingClientRect().top < search.getBoundingClientRect().top,
      };
    });
    if (!lead?.inLead || !lead.above) fail(`a running trip did not lead the step: ${JSON.stringify(lead)}`);
    else ok('a running trip renders above the search');

    await page.screenshot({ path: `${SHOTS}/continue-trip-cards.png`, fullPage: true });
    await ctx.close();
  }

  // ---- 2. Nothing imminent: the section keeps its place below the search --
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    await seed(page, { signedIn: true, trips: ['soon'] });
    await openStep1(page);
    const below = await page.evaluate(() => {
      const section = document.querySelector('.dtsection');
      const search = document.querySelector('.day-flow-search');
      return {
        inLead: Boolean(document.querySelector('.day-flow-lead .dtsection')),
        below: section.getBoundingClientRect().top > search.getBoundingClientRect().top,
      };
    });
    if (below.inLead || !below.below) fail(`a trip 30 days out still led the step: ${JSON.stringify(below)}`);
    else ok('a trip a month out stays below the search');
    await ctx.close();
  }

  // ---- 3. Which day?: grouped by stop, past days disabled, opens the plan -
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    await seed(page, { signedIn: true, trips: ['now'] });
    await openStep1(page);
    await page.locator('.dtcard').first().click();
    await page.locator('.dtday-groups').waitFor({ timeout: 30000 });
    // The sheet slides up; a screenshot taken mid-transition shows the page
    // through a half-opaque panel, which is a frame nobody sees.
    await page.waitForTimeout(700);

    const sheet = await page.evaluate(() => ({
      title: (document.querySelector('.fsheet-title')?.textContent || '').trim(),
      groups: [...document.querySelectorAll('.dtday-group')].map((g) => ({
        name: (g.querySelector('.dtday-groupname')?.textContent || '').trim(),
        days: [...g.querySelectorAll('.dtday-chip')].map((c) => ({
          text: c.innerText.replace(/\s+/g, ' ').trim(),
          disabled: c.disabled,
          h: Math.round(c.getBoundingClientRect().height),
        })),
      })),
    }));
    if (!/which day/i.test(sheet.title)) fail(`the sheet is titled "${sheet.title}"`);
    else ok(`sheet titled "${sheet.title}"`);
    if (sheet.groups.length !== 2) fail(`${sheet.groups.length} stop groups, expected 2`);
    else ok(`grouped by stop: ${sheet.groups.map((g) => g.name).join(' | ')}`);

    const all = sheet.groups.flatMap((g) => g.days);
    // Barcelona started two days ago: those two days are behind us.
    const gone = all.filter((d) => d.disabled);
    if (gone.length !== 2) fail(`${gone.length} days disabled, expected the 2 already gone`);
    else ok(`${gone.length} past days disabled: ${gone.map((d) => d.text).join(' | ')}`);
    // Day numbers run across the whole trip, they do not restart per stop.
    const nums = all.map((d) => (d.text.match(/Day (\d+)/) || [])[1]);
    if (new Set(nums).size !== nums.length) fail(`day numbers repeat across stops: ${nums.join(',')}`);
    else ok(`day numbers run 1..${nums[nums.length - 1]} across the trip`);
    if (all.some((d) => d.h < 44)) fail(`a day chip is under 44px: ${all.map((d) => d.h).join(',')}`);
    else ok('every day chip is at least 44px');

    await page.screenshot({ path: `${SHOTS}/continue-trip-whichday.png` });

    // Picking the SECOND stop's first day opens the plan there, skipping both
    // the stay and the when questions.
    const target = page.locator('.dtday-group').nth(1).locator('.dtday-chip:not([disabled])').first();
    await target.click();
    await page.locator('.day-ws').first().waitFor({ timeout: 60000 });
    const open = await page.evaluate(() => ({
      flow: document.querySelectorAll('.day-flow-search').length,
      body: document.body.innerText.slice(0, 4000),
    }));
    if (open.flow) fail('picking a day left the landing flow on screen');
    else if (!/valencia/i.test(open.body)) fail('the plan did not open on the second stop');
    else ok('picking a day opened the plan on that stop, past the stay and when steps');
    await page.screenshot({ path: `${SHOTS}/continue-trip-opened.png` });
    await ctx.close();
  }

  // ---- 4. Signed out: a card with a button, not a note in grey type -------
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    await seed(page);
    await openStep1(page);
    const out = await page.evaluate(() => ({
      card: Boolean(document.querySelector('.dtsignin')),
      title: (document.querySelector('.dtsignin-text b')?.textContent || '').trim(),
      body: (document.querySelector('.dtsignin-text p')?.textContent || '').trim(),
      btn: (document.querySelector('.dtsignin-btn')?.textContent || '').trim(),
      icon: Boolean(document.querySelector('.dtsignin-ico svg')),
    }));
    if (!out.card) fail('signed out still shows a bare note, not a card');
    else if (!out.btn) fail('the sign-in card carries no button');
    else if (!out.icon) fail('the sign-in card carries no icon');
    else ok(`signed out: "${out.title}" with a "${out.btn}" button`);
    if (/—/.test(out.body + out.title)) fail('the sign-in copy carries an em dash');

    await page.locator('.dtsignin-btn').click();
    await page.waitForTimeout(700);
    const modal = await page.evaluate(() => document.querySelectorAll('.auth-modal, .auth-shell, [class*="auth"]').length);
    if (!modal) fail('the sign-in button opened nothing');
    else ok('the sign-in button opens the auth door');
    await page.screenshot({ path: `${SHOTS}/continue-trip-signedout.png` });
    await ctx.close();
  }

  // ---- 5. Signed in, nothing saved: one line and a way to fix it ---------
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    await seed(page, { signedIn: true, trips: [] });
    await openStep1(page);
    const empty = await page.evaluate(() => ({
      line: (document.querySelector('.dtempty p')?.textContent || '').trim(),
      btn: (document.querySelector('.dtempty-btn')?.textContent || '').trim(),
    }));
    if (!empty.btn) fail('the empty state offers no way to plan a trip');
    else ok(`empty: "${empty.line}" + "${empty.btn}"`);
    await page.locator('.dtempty-btn').click();
    await page.waitForTimeout(900);
    // Both planner tabs stay MOUNTED once visited (.tab-keep-hidden), so
    // "am I on the Trip tab" is a question about which one is visible, never
    // about which one exists in the DOM.
    const onTrip = await page.evaluate(() => {
      const hidden = (el) => !el || Boolean(el.closest('.tab-keep-hidden'));
      return {
        dayHidden: hidden(document.querySelector('.day-flow-screen')),
        tripShown: [...document.querySelectorAll('.trip-planner-screen')]
          .some((el) => !el.classList.contains('day-flow-screen') && !hidden(el)),
      };
    });
    if (!onTrip.tripShown || !onTrip.dayHidden) fail(`"Plan a trip" did not switch to the Trip tab: ${JSON.stringify(onTrip)}`);
    else ok('"Plan a trip" switches to the Trip tab');
    await ctx.close();
  }

  // ---- 6. Your day plans: the same card, 4:3, delete behind a menu -------
  {
    const dayPlan = {
      id: 'local:1', label: 'A day in Rome', startDate: iso(2),
      stops: [{ destinationId: 'FCO', days: 1 }],
      stayPoint: { label: 'Hotel Artemide, Rome', shortLabel: 'Hotel Artemide', lat: 41.9, lon: 12.49 },
    };
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    await seed(page, { signedIn: true, trips: [], dayPlans: [dayPlan] });
    await openStep1(page);
    const small = await page.evaluate(() => {
      const c = document.querySelector('.dtcards.small .dtcard');
      if (!c) return null;
      const b = c.querySelector('.dtcard-photo').getBoundingClientRect();
      return {
        title: (c.querySelector('.dtcard-title')?.textContent || '').trim(),
        ratio: Math.round((b.width / b.height) * 100) / 100,
        bareX: document.querySelectorAll('.trip-saved-del').length,
        menu: document.querySelectorAll('.dtmenu-btn').length,
      };
    });
    if (!small) fail('the standalone day plan does not render as a card');
    else {
      if (Math.abs(small.ratio - 4 / 3) > 0.05) fail(`the day-plan photo is ${small.ratio}, expected 4:3`);
      else ok(`day plan "${small.title}" at ${small.ratio} (4:3)`);
      if (small.bareX) fail('the bare x delete button survives');
      else if (!small.menu) fail('there is no menu to delete from');
      else ok('delete moved behind a menu');
    }
    await page.locator('.dtmenu-btn').first().click();
    await page.locator('.dtmenu-pop').waitFor({ timeout: 10000 });
    const item = (await page.locator('.dtmenu-item').first().innerText()).trim();
    ok(`menu offers "${item}"`);
    await page.screenshot({ path: `${SHOTS}/continue-trip-dayplans.png` });
    await page.locator('.dtmenu-item').first().click();
    await page.waitForTimeout(500);
    if (await page.locator('.dtcards.small .dtcard').count()) fail('deleting from the menu did not remove the plan');
    else ok('deleting from the menu removed the plan');
    await ctx.close();
  }

  // ---- 7. Phone: a swipe, not a stack ------------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await seed(page, { signedIn: true, trips: ['now', 'soon', 'past'] });
    await openStep1(page);
    const rail = await page.evaluate(() => {
      const r = document.querySelector('.dtcards');
      const c = r?.querySelector('.dtcard');
      if (!r || !c) return null;
      const cs = getComputedStyle(r);
      return {
        display: cs.display,
        snap: cs.scrollSnapType,
        scrollable: r.scrollWidth > r.clientWidth + 4,
        cardW: Math.round(c.getBoundingClientRect().width),
        vw: window.innerWidth,
        pageScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    if (!rail) fail('no cards on the phone');
    else {
      if (rail.display !== 'flex' || !rail.scrollable) fail(`the phone rail is not a rail: ${JSON.stringify(rail)}`);
      else ok(`phone rail scrolls, cards ${rail.cardW}px of a ${rail.vw}px screen`);
      if (!/x/.test(rail.snap)) fail(`no horizontal snap: "${rail.snap}"`);
      else ok(`snap: ${rail.snap}`);
      // 82vw, within a few px of the rounding.
      if (Math.abs(rail.cardW - rail.vw * 0.82) > 8) fail(`cards are ${rail.cardW}px, expected about 82vw`);
      else ok('cards are about 82vw');
      if (rail.pageScrollX) fail('the phone page scrolls sideways');
      else ok('no horizontal page scroll');
    }
    await page.screenshot({ path: `${SHOTS}/continue-trip-phone.png` });
    await ctx.close();
  }

  await browser.close();
} finally {
  if (srv) srv.kill();
}

if (process.exitCode) console.error('\nverify_continue_trip: FAILURES above');
else console.log('\nverify_continue_trip: all checks passed');
