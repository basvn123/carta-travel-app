// Headless check of friends (phase 4 of docs/SHARING_FRIENDS_BUILD.md).
//
// The rules that make this safe live in SQL and prove themselves on apply
// (migration 011's self-check). This covers the half that lives in the
// browser, on the same fake-session harness verify_account_panel.mjs uses:
// a session is written into the key supabase-js reads and every call is
// answered locally, so no credentials are needed and nothing touches the real
// project.
//
//   1. A guest never sees the Friends row at all.
//   2. The spoke opens, leads with YOUR OWN handle (the thing you hand over
//      to be added, copyable), and lists incoming, outgoing and accepted
//      separately. The explanatory prose is folded behind an info icon.
//   3. An unknown handle is refused without saying anything about who exists.
//   4. A real handle can be asked, and the request is sent as pending, from
//      this account, never as accepted.
//   5. An incoming request shows the person by name and accepts.
//   6. A friend's trip renders read only: no edit control, and crucially no
//      Remove, which would read as deleting somebody else's trip.
//   7. Privacy rule 2: a friend's trip names its crew but carries no account
//      id behind any of them.
//   7c. A friend's trip draws as a map, and the record counts alongside
//       theirs without pretending to be a ranking.
//   9. The page is about PLANS: every person row carries a fact drawn from
//      the trips that person is showing, and the shelf of those trips reads
//      newest first with a mark on what moved since the last visit.
//  10. ONE accent: while a request is waiting, Accept is the only terracotta
//      control on the page and inviting is quiet.
//  11. The empty shelf is an invitation with the action attached, not a
//      sentence explaining a mechanism.
//  12. Co-planning: an invitation to help plan somebody's trip is answerable
//      here, and says what joining does and does not share.
//  13. The owner half: the share panel offers ONLY friends as co-planners
//      (migration 020's insert policy accepts nobody else), names what a
//      co-planner may and may not do, and a trip somebody else owns offers
//      neither Remove nor the invite block.
//   8. Mobile width: no sideways scroll, the Passes control survives both
//      slide-overs, opening one closes the other, and the header's own
//      Friends door lands on the friends spoke.
//
// Run from inside continent-app/:  node scripts/verify_friends.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4195;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const PROJECT_REF = 'ntssxktaduxzpsmejwyv';
const ME = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated', role: 'authenticated',
  email: 'traveller@example.com',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  user_metadata: { full_name: 'Sam Okonkwo' },
  app_metadata: { provider: 'email', providers: ['email'] },
  identities: [{ id: 'i1', provider: 'email', identity_data: { email: 'traveller@example.com' } }],
  created_at: '2026-01-01T00:00:00Z',
};
const SOFIE = { user_id: '00000000-0000-4000-8000-0000000000a1', handle: 'sofie_v', display_name: 'Sofie Vermeulen', avatar_emoji: null };
const JONAS = { user_id: '00000000-0000-4000-8000-0000000000a2', handle: 'jonas', display_name: 'Jonas Peeters', avatar_emoji: null };
const ANA = { user_id: '00000000-0000-4000-8000-0000000000a3', handle: 'ana_r', display_name: 'Ana Rocha', avatar_emoji: null };

// GOTCHA: SavedTripsPanel carries the .account-panel class too (it borrows its
// z-index), so `.account-panel` matches BOTH slide-overs. Anything asserting
// about the account panel alone uses ACCOUNT_PANEL below.
const ACCOUNT_PANEL = '.account-panel:not(.saved-trips-panel)';

// Relative time is only rendered inside four weeks, and the New mark is
// relative to the last visit, so both fixtures are stamped at run time.
const RECENT = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const OLDER = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString();
// Seeded as the last visit: after Sofie's trip moved, before Ana's.
const LAST_SEEN = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

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

let failures = 0;
const fail = (msg) => { console.error('FAIL:', msg); failures += 1; process.exitCode = 1; };
const ok = (msg) => console.log('  ok:', msg);

const json = (route, body, status = 200) => route.fulfill({
  status, contentType: 'application/json', body: JSON.stringify(body),
});

async function stub(page, state) {
  // Playwright tries handlers in REVERSE registration order, so the catch-all
  // has to be registered FIRST or it swallows every specific route below and
  // every call quietly answers []. That failure looks exactly like an empty
  // account rather than like a broken harness, which is why it is called out.
  await page.route('**/rest/v1/**', (r) => json(r, []));
  await page.route('**/rest/v1/rpc/ai_status*', (r) => json(r, {
    tier: 'free', expiresAt: null, resetsAt: '2026-09-01T00:00:00Z',
    plansUsed: 0, plansCap: 3, plansLeft: 3, groundUsed: 0, groundCap: 0, groundLeft: 0,
  }));
  await page.route('**/auth/v1/**', (r) => json(r, ME));

  await page.route('**/rest/v1/profiles*', (r) => {
    if (r.request().method() !== 'GET') return json(r, {}, 204);
    const url = r.request().url();
    // maybeSingle() on my own row, versus .in() on a set of others.
    if (url.includes(ME.id)) {
      return json(r, { user_id: ME.id, handle: 'sam_okonkwo', display_name: 'Sam Okonkwo', avatar_emoji: null });
    }
    return json(r, state.knownProfiles.filter((p) => url.includes(p.user_id)));
  });

  await page.route('**/rest/v1/rpc/find_profile_by_handle*', (r) => {
    const { wanted } = JSON.parse(r.request().postData() || '{}');
    const hit = [SOFIE, JONAS, ANA].find((p) => p.handle === wanted);
    return json(r, hit ? [hit] : []);
  });

  await page.route('**/rest/v1/friendships*', (r) => {
    const method = r.request().method();
    if (method === 'POST') {
      const body = JSON.parse(r.request().postData() || '{}');
      state.inserts.push(body);
      state.links.push({ id: `f${state.links.length + 9}`, ...body, created_at: '2026-08-01T00:00:00Z' });
      return json(r, [], 201);
    }
    if (method === 'PATCH') {
      state.patches.push(JSON.parse(r.request().postData() || '{}'));
      const id = decodeURIComponent(r.request().url()).match(/id=eq\.([^&]+)/)?.[1];
      const row = state.links.find((l) => l.id === id);
      if (row) row.status = 'accepted';
      return json(r, [], 204);
    }
    if (method === 'DELETE') {
      const id = decodeURIComponent(r.request().url()).match(/id=eq\.([^&]+)/)?.[1];
      state.deletes.push(id);
      state.links = state.links.filter((l) => l.id !== id);
      return json(r, [], 204);
    }
    return json(r, state.links);
  });

  // A plan of MY OWN, so the share panel (and its co-planner block) has
  // something to open. Registered after the catch-all, which Playwright tries
  // in reverse order, so this wins.
  await page.route('**/rest/v1/trip_plans*', (r) => {
    if (r.request().method() !== 'GET') return json(r, [], 204);
    return json(r, state.tripPlans);
  });
  await page.route('**/rest/v1/trip_plan_stops*', (r) => {
    if (r.request().method() !== 'GET') return json(r, [], 204);
    return json(r, state.tripStops);
  });
  await page.route('**/rest/v1/trip_shares*', (r) => json(r, []));
  await page.route('**/rest/v1/rpc/list_friend_trips*', (r) => json(r, state.friendTrips));
  await page.route('**/rest/v1/rpc/get_friend_trip*', (r) => json(r, [{
    trip_plan_id: 'ftrip-1',
    owner_handle: SOFIE.handle,
    owner_name: SOFIE.display_name,
    label: 'Two weeks in Portugal',
    stops: [
      { position: 0, destination_id: 'LIS', city: 'Lisbon', country: 'Portugal', arrive_date: '2026-06-02', depart_date: '2026-06-06' },
    ],
    // Exactly what project_trip_payload returns: crew as names, no userId,
    // no expenses, no bookings, no notes.
    payload: {
      assignments: {},
      extras: {
        people: [{ name: 'Sofie' }, { name: 'Jonas' }],
        memory: {
          v: 1,
          places: [{ id: 'LIS', city: 'Lisbon', country: 'Portugal', lat: 38.72, lon: -9.14, nights: 4 }],
          legs: [{ mode: 'fly' }],
          travellers: { adults: 2, children: 0 },
          story: 'Rain every afternoon, and the best pastel de nata of my life.',
          highlights: [], rating: 8, spend: { currency: 'EUR', flights: 120 }, photos: [],
        },
      },
    },
  }]));
}

const seedSession = (ref, user) => `(() => {
  localStorage.setItem('continent.guestMode.v1', '1');
  localStorage.setItem('carta.friends.lastSeen', ${JSON.stringify(LAST_SEEN)});
  localStorage.setItem('carta.welcomeSeen', '1');
  localStorage.setItem('carta.mapGuideDone', '1');
  localStorage.setItem('sb-${ref}-auth-token', JSON.stringify({
    access_token: 'stub', token_type: 'bearer', expires_in: 360000,
    expires_at: Math.floor(Date.now() / 1000) + 360000,
    refresh_token: 'stub-refresh', user: ${JSON.stringify(user)},
  }));
})()`;

const run = async () => {
  await waitForServer();
  const browser = await chromium.launch();

  /* ---- 1. A guest is not shown a door they cannot open ---- */
  const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const guest = await guestCtx.newPage();
  await guest.addInitScript(`(() => {
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('carta.mapGuideDone', '1');
  })()`);
  await guest.goto(`${BASE}/?o=CRL`);
  await guest.locator('.account-avatar-btn').first().click({ timeout: 60000 });
  await guest.locator('.account-panel').waitFor({ timeout: 15000 });
  const guestText = await guest.locator(ACCOUNT_PANEL).innerText();
  if (/Friends/i.test(guestText)) fail('a guest is offered a Friends row');
  else ok('a guest is never shown the Friends row');
  await guestCtx.close();

  /* ---- signed in ---- */
  const state = {
    inserts: [], patches: [], deletes: [],
    knownProfiles: [SOFIE, JONAS, ANA],
    links: [
      { id: 'f1', requester_id: SOFIE.user_id, addressee_id: ME.id, status: 'pending', created_at: '2026-08-01T00:00:00Z' },
      { id: 'f2', requester_id: ME.id, addressee_id: JONAS.user_id, status: 'pending', created_at: '2026-08-02T00:00:00Z' },
      { id: 'f3', requester_id: ANA.user_id, addressee_id: ME.id, status: 'accepted', created_at: '2026-07-01T00:00:00Z' },
    ],
    tripPlans: [{
      id: 'myplan-1', user_id: ME.id, label: 'Spring in Seville',
      visibility: 'private', created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z', published_at: null,
    }],
    tripStops: [{
      trip_plan_id: 'myplan-1', position: 0, city: 'Seville', country: 'Spain',
      destination_id: 'SVQ', arrive_date: '2099-04-02', depart_date: '2099-04-08',
    }],
    friendTrips: [{
      owner_id: SOFIE.user_id, owner_handle: SOFIE.handle, owner_name: SOFIE.display_name, owner_emoji: null,
      trip_plan_id: 'ftrip-1', label: 'Two weeks in Portugal',
      start_date: '2026-06-02', end_date: '2026-06-09',
      cities: ['Lisbon', 'Porto'], countries: ['Portugal'], destination_ids: ['LIS', 'OPO'],
      updated_at: OLDER,
    }, {
      // Ana is the ACCEPTED friend, so hers is the row that must carry a fact.
      // Touched two hours ago, which is what makes the shelf a change log.
      owner_id: ANA.user_id, owner_handle: ANA.handle, owner_name: ANA.display_name, owner_emoji: null,
      trip_plan_id: 'ftrip-2', label: 'A weekend in Ghent',
      start_date: '2099-09-03', end_date: '2099-09-09',
      cities: ['Ghent'], countries: ['Belgium'], destination_ids: ['GNE'],
      updated_at: RECENT,
    }],
  };

  const ctx = await browser.newContext({
    viewport: { width: 1360, height: 950 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  await ctx.addInitScript(seedSession(PROJECT_REF, ME));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  await stub(page, state);
  await page.goto(`${BASE}/?o=CRL`);
  await page.locator('.account-avatar-btn').first().waitFor({ timeout: 120000 });

  /* ---- 2. The spoke, sorted by who it is waiting on ---- */
  const row = page.locator('.header-friends-btn');
  await row.click({ timeout: 15000 });
  await page.locator('.frn-find').waitFor({ timeout: 10000 });

  // Your own handle leads the page: adding a friend needs yours before theirs.
  const me = page.locator('.frn-me-handle');
  await me.waitFor({ timeout: 10000 });
  if (await me.innerText() !== '@sam_okonkwo') {
    fail(`the page does not show your own handle: ${await me.innerText()}`);
  } else ok('your own handle leads the page');
  await page.locator('.frn-me-copy').click();
  await page.waitForTimeout(400);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  if (clip !== '@sam_okonkwo') fail(`copying your handle put "${clip}" on the clipboard`);
  else ok('and copies with one tap');

  // Sharing hands over a LINK that opens this page with the handle looked up,
  // not a string to retype. Headless Chromium has no navigator.share, so the
  // clipboard fallback is what runs, which is also the desktop path.
  await page.locator('.frn-me-share').click();
  await page.waitForTimeout(400);
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  if (!/#friend=sam_okonkwo$/.test(shared)) {
    fail(`sharing your handle produced no invite link: "${shared}"`);
  } else if (!/@sam_okonkwo/.test(shared)) {
    fail(`the shared text does not name the handle: "${shared}"`);
  } else ok('sharing hands over an invite link, not a string to retype');

  // The two explanatory paragraphs are folded away until asked for.
  const beforeInfo = await page.locator(ACCOUNT_PANEL).innerText();
  if (/yours alone|Nobody yet/i.test(beforeInfo)) {
    fail('the explanatory prose is on the page before the info icon is used');
  } else ok('the prose is folded away, not standing on the page');
  await page.locator('.frn-about-btn').click();
  await page.locator('.frn-about').waitFor({ timeout: 5000 });
  const about = await page.locator('.frn-about').innerText();
  if (!/yours alone/i.test(about)) fail('the info panel is missing the privacy note');
  else if (!/Nobody yet/i.test(about)) fail('the info panel is missing the how-it-works line');
  else ok('the info icon reveals both paragraphs');
  await page.locator('.frn-about-btn').click();
  // The search form renders immediately; the links are still in flight. Wait
  // for a person to actually appear before reading the panel, or this races
  // and reports an empty spoke that is merely not loaded yet.
  await page.locator('.frn-row').first().waitFor({ timeout: 15000 });
  const spoke = await page.locator(ACCOUNT_PANEL).innerText();
  // .section-title is uppercased in CSS and innerText reports what is
  //  rendered, so the headings are matched case-insensitively.
  let spokeOk = true;
  for (const [what, re] of [
    ['the incoming request', /waiting on you \(1\)/i],
    ['the outgoing request', /waiting on them \(1\)/i],
    ['the accepted friend', /your friends \(1\)/i],
    ['who is waiting', /Sofie Vermeulen/],
    ['the accepted friend by name', /Ana Rocha/],
  ]) {
    if (!re.test(spoke)) { fail(`the friends spoke is missing ${what}`); spokeOk = false; }
  }
  if (spokeOk) ok('incoming, outgoing and accepted are listed separately, each by name');

  // The spoke is the friends PAGE: the count in its heading, and the trips
  // those friends are showing, on the same screen.
  await page.locator('.frn-trip-row').first().waitFor({ timeout: 10000 });
  const spokeTrips = await page.locator(ACCOUNT_PANEL).innerText();
  if (!/Two weeks in Portugal/.test(spokeTrips)) fail('the spoke does not list the friend trip');
  else if (!/Sofie Vermeulen/.test(spokeTrips)) fail('the spoke trip does not say whose it is');
  else ok('their trips are on the friends page itself');
  await page.locator('.frn-trip-row').first().click();
  // Wait for a STOP, not just the panel: .ftrip renders its loading line
  // first, so waiting on the container reads the text a beat too early.
  await page.locator('.frn-trip .stview-stop').first().waitFor({ timeout: 10000 });
  if (!/Lisbon/.test(await page.locator('.frn-trip .ftrip').innerText())) {
    fail('opening a trip on the friends page shows no stops');
  } else ok('a trip opens read-only right there');

  // A friend's trip is a shape on a map before it is a list of names. The
  // fixture's memory carries real coordinates, so this needs no catalogue.
  try {
    await page.locator('.frn-trip .ftrip-map canvas').first().waitFor({ timeout: 20000 });
    const box = await page.locator('.frn-trip .ftrip-map').boundingBox();
    if (!box || box.height < 80) fail(`the friend trip map frame collapsed: ${JSON.stringify(box)}`);
    else ok(`a friend trip draws a map, ${Math.round(box.height)}px tall`);
  } catch {
    fail('a friend trip rendered no map');
  }
  await page.locator('.frn-trip-row').first().click();

  /* ---- 9. The page is about plans, and people are its index ---- */
  const anaRow = page.locator('.frn-row').filter({ hasText: 'Ana Rocha' }).first();
  const anaFact = await anaRow.locator('.frn-fact').innerText().catch(() => '');
  if (!/Ghent/.test(anaFact)) {
    fail(`the accepted friend's row says nothing about what she is doing: "${anaFact}"`);
  } else if (!/September/i.test(anaFact)) {
    fail(`the row names the place but not the window: "${anaFact}"`);
  } else ok(`a person row carries a PLAN, not a state: "${anaFact}"`);
  // The window is a measured fact and is set as one.
  if (!await anaRow.locator('.frn-fact-when').count()) {
    fail('the date window on a person row is not set in the mono face');
  } else ok('and its dates are set in mono, like every other figure here');
  // Nothing on this page may claim to know where somebody IS.
  const spokeAll = await page.locator(ACCOUNT_PANEL).innerText();
  for (const [what, re] of [
    ['a presence state', /\bonline\b|last seen/i],
    ['a current location', /currently in|current location/i],
    ['an invented score', /profile score|global rank|% match/i],
  ]) {
    if (re.test(spokeAll)) fail(`the friends page shows ${what}`);
  }
  ok('no presence, no current location, no invented score');

  // The shelf is a change log: newest first, and marked when it moved after
  // the last visit.
  const firstTrip = await page.locator('.frn-trip-row').first().innerText();
  if (!/Ghent/.test(firstTrip)) {
    fail(`the shelf is not newest first: it leads with "${firstTrip.replace(/\n/g, ' | ')}"`);
  } else ok('the shelf reads newest first');
  const newMarks = await page.locator('.frn-trip-new').count();
  if (newMarks !== 1) fail(`${newMarks} trips are marked New, expected exactly the one that moved`);
  else ok('exactly the trip that moved since the last visit is marked New');
  if (!/hours? ago/i.test(firstTrip)) {
    fail(`the shelf does not say when a trip moved: "${firstTrip.replace(/\n/g, ' | ')}"`);
  } else ok('and each row says how long ago it moved');
  // One action per row, not three.
  const rowBtns = await page.locator('.frn-trip').first().locator('button').count();
  if (rowBtns !== 1) fail(`a trip row carries ${rowBtns} buttons, expected exactly 1`);
  else ok('one action per trip, not a row of them');

  /* ---- 10. One accent while a request is waiting ---- */
  const accented = await page.evaluate(() => {
    const panel = document.querySelector('.account-panel:not(.saved-trips-panel)');
    if (!panel) return [];
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent').trim().toLowerCase();
    const hex = (c) => {
      const m = c.match(/\d+/g);
      if (!m) return '';
      return '#' + m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
    };
    return [...panel.querySelectorAll('button')]
      .filter((b) => b.offsetParent !== null && hex(getComputedStyle(b).backgroundColor) === accent)
      .map((b) => b.innerText.trim().slice(0, 20));
  });
  if (accented.length !== 1 || !/accept/i.test(accented[0] || '')) {
    fail(`the accent is on ${JSON.stringify(accented)}, expected Accept alone`);
  } else ok('one accent on the page, and it is the question waiting on you');
  await page.screenshot({ path: `${SHOTS}/friends-spoke.png` });

  /* ---- 3 and 4. Looking somebody up ---- */
  const handleField = page.locator('.frn-find input');
  await handleField.fill('nobody_here');
  await page.locator('.frn-find button[type="submit"]').click();
  await page.locator('.auth-error').first().waitFor({ timeout: 8000 });
  let err = await page.locator('.auth-error').first().innerText();
  if (!/no account has that handle/i.test(err)) fail(`an unknown handle reads: "${err}"`);
  else ok('an unknown handle is refused plainly');

  await handleField.fill('SOFIE_V!!');
  if (await handleField.inputValue() !== 'sofie_v') {
    fail(`the lookup field did not normalise: ${await handleField.inputValue()}`);
  } else ok('the lookup field normalises what is typed');
  // Sofie already has a pending link, so asking again must be refused.
  await page.locator('.frn-find button[type="submit"]').click();
  await page.waitForTimeout(500);
  err = await page.locator('.auth-error').first().innerText();
  if (!/already/i.test(err)) fail(`asking an existing link reads: "${err}"`);
  else ok('somebody you already have a link with cannot be asked twice');

  await handleField.fill('ana_r');
  await page.locator('.frn-find button[type="submit"]').click();
  await page.waitForTimeout(500);
  // Ana is already an accepted friend, so this is the same refusal.
  if (!/already/i.test(await page.locator('.auth-error').first().innerText())) {
    fail('an existing friend was offered as someone to add');
  } else ok('an existing friend is not offered again');

  /* ---- 5. Accepting ---- */
  await page.locator('.frn-yes').filter({ hasText: 'Accept' }).first().click();
  await page.waitForTimeout(700);
  if (!state.patches.some((p) => p.status === 'accepted')) fail('accepting sent no update');
  else ok('accepting writes the accepted status');
  if (state.inserts.some((i) => i.status && i.status !== 'pending')) {
    fail('a friendship was inserted as something other than pending');
  } else ok('nothing is ever inserted as already accepted');

  /* ---- 6 and 7. A friend's trip ---- */
  await page.locator('.account-panel-close, .panel-close').first().click().catch(() => {});
  await page.waitForTimeout(400);
  const trips = page.locator('.header-nav-item, .bottom-nav-item')
    .filter({ hasText: /^(Saved trips|My trips)$/ }).locator('visible=true').first();
  await trips.click({ timeout: 20000 });
  await page.locator('.saved-trips-panel').waitFor({ timeout: 12000 });
  await page.locator('.saved-tab:visible').nth(1).click();
  await page.waitForTimeout(600);

  const panel = await page.locator('.saved-trips-panel').innerText();
  if (!/From your friends/i.test(panel)) fail('no friends shelf on the Planned tab');
  else if (!/Two weeks in Portugal/.test(panel)) fail('the friend trip card did not render');
  else if (!/Sofie Vermeulen/.test(panel)) fail('the friend trip card does not say who is showing it');
  else ok('a friend trip card renders, naming who is showing it');

  const friendCard = page.locator('.saved-record-row').filter({ hasText: 'Two weeks in Portugal' }).first();
  if (await friendCard.locator('.uptrip-menu').count() > 0) {
    fail('a friend trip card offers a card menu, which would include Remove');
  } else ok('a friend trip card has no menu, so no Remove and no edits');

  await friendCard.locator('.uptrip-open').click();
  await page.locator('.ftrip').waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  const open = await page.locator('.ftrip').innerText();
  if (!/Lisbon/.test(open)) fail('the opened friend trip shows no stops');
  else if (!/Sofie and Jonas/.test(open)) fail('the opened friend trip does not name its crew');
  else ok('the opened trip shows its stops and names its crew');
  if (await page.locator('.ftrip .memo-edit').count()) fail('the opened friend trip offers an edit button');
  else ok('no edit control on a friend trip');

  // Privacy rule 2: names travel, accounts do not.
  const leaked = await page.evaluate(() => {
    const html = document.querySelector('.ftrip')?.innerHTML || '';
    return /userId|0000-0000/.test(html);
  });
  if (leaked) fail('a friend trip carries an account id behind a crew name');
  else ok('crew are names only, with no account behind them');
  for (const [what, re] of [['a ledger', /paidBy|settle/i], ['booking refs', /PNR/i]]) {
    if (re.test(open)) fail(`the friend trip leaks ${what}`);
  }
  ok('no ledger and no booking references');
  await page.screenshot({ path: `${SHOTS}/friends-trip.png` });
  await ctx.close();

  /* ---- 7b. Opening somebody's invite link ---- */
  const inviteCtx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  await inviteCtx.addInitScript(seedSession(PROJECT_REF, ME));
  const ip = await inviteCtx.newPage();
  ip.on('pageerror', (e) => fail(`page error on an invite: ${e.message}`));
  await stub(ip, state);
  await ip.goto(`${BASE}/?o=CRL#friend=jonas`);
  await ip.locator('.frn-find').waitFor({ timeout: 60000 });
  await ip.waitForTimeout(900);
  const invited = await ip.locator(ACCOUNT_PANEL).innerText();
  if (!/Jonas Peeters/.test(invited)) {
    fail(`an invite link did not look the sender up: ${invited.slice(0, 200)}`);
  } else ok('an invite link opens the friends page on the sender');
  if (/#friend=/.test(ip.url())) fail(`the invite handle stayed in the address bar: ${ip.url()}`);
  else ok('and the handle is stripped from the address bar');
  await inviteCtx.close();

  /* ---- 11. The empty shelf hands over an action ---- */
  const emptyState = { ...state, friendTrips: [], links: state.links };
  const emptyCtx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  await emptyCtx.addInitScript(seedSession(PROJECT_REF, ME));
  const ep = await emptyCtx.newPage();
  await stub(ep, emptyState);
  await ep.goto(`${BASE}/?o=CRL`);
  await ep.locator('.header-friends-btn').click({ timeout: 60000 });
  await ep.locator('.frn-empty-act').waitFor({ timeout: 20000 });
  const emptyBtn = ep.locator('.frn-empty-btn');
  if (!await emptyBtn.count()) {
    fail('the empty shelf explains a mechanism and offers nothing to press');
  } else ok(`the empty shelf hands over an action: "${await emptyBtn.innerText()}"`);
  await emptyBtn.click();
  await ep.locator('.saved-trips-panel').waitFor({ timeout: 12000 });
  ok('and that action opens My trips, where a trip can be shown');
  await emptyCtx.close();

  /* ---- 12. Being asked to co-plan somebody's trip ---- */
  const coCtx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  await coCtx.addInitScript(seedSession(PROJECT_REF, ME));
  const cp = await coCtx.newPage();
  cp.on('pageerror', (e) => fail(`page error on the co-plan band: ${e.message}`));
  await stub(cp, state);
  await cp.goto(`${BASE}/?o=CRL&coplanmock=some`);
  await cp.locator('.header-friends-btn').click({ timeout: 60000 });
  await cp.locator('.frn-find').waitFor({ timeout: 20000 });
  await cp.waitForTimeout(900);
  const co = await cp.locator(ACCOUNT_PANEL).innerText();
  for (const [what, re] of [
    ['the invitation', /asked to help plan \(1\)/i],
    ['the trip', /Ten days in the Alps/],
    ['who asked', /From Sofie Vermeulen/i],
    ['the way in', /\bJoin\b/],
  ]) {
    if (!re.test(co)) fail(`the co-plan band is missing ${what}`);
  }
  ok('an invitation to co-plan is answerable on the friends page');
  // A control that shares without saying what it shares is the whole problem.
  if (!/does not share/i.test(co)) {
    fail('the co-plan band does not say what joining leaves with its owner');
  } else ok('and it states what joining does NOT share');
  await cp.screenshot({ path: `${SHOTS}/friends-coplan.png` });
  await coCtx.close();

  /* ---- 13. The owner half of co-planning ---- */
  const ownCtx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  await ownCtx.addInitScript(seedSession(PROJECT_REF, ME));
  const op = await ownCtx.newPage();
  op.on('pageerror', (e) => fail(`page error on the share panel: ${e.message}`));
  await stub(op, state);
  await op.goto(`${BASE}/?o=CRL&coplanmock=none`);
  const myTrips = op.locator('.header-nav-item, .bottom-nav-item')
    .filter({ hasText: /^(Saved trips|My trips)$/ }).locator('visible=true').first();
  await myTrips.click({ timeout: 60000 });
  await op.locator('.saved-trips-panel').waitFor({ timeout: 15000 });
  await op.locator('.saved-tab:visible').nth(1).click();
  await op.locator('.uptrip-card').first().waitFor({ timeout: 15000 });
  // Open the share panel through its card menu, the way a person would.
  await op.locator('.uptrip-menu button').first().click();
  await op.locator('.card-menu-item, .cardmenu-item, [role="menuitem"]')
    .filter({ hasText: /share/i }).first().click({ timeout: 10000 });
  await op.locator('.tshare-coplan').waitFor({ timeout: 15000 });

  const co2 = await op.locator('.tshare-coplan').innerText();
  if (!/route/i.test(co2) || !/cannot delete/i.test(co2)) {
    fail(`the co-planner block does not say what a co-planner may and may not do: "${co2.replace(/\n/g, ' | ').slice(0, 200)}"`);
  } else ok('the co-planner block states what it hands over, and what it does not');
  // Only friends. Sofie was accepted earlier in this run's fixture, Ana is an
  // accepted friend; Jonas is only an outgoing request and must not appear.
  const picks = await op.locator('.coplan-pick option').allInnerTexts();
  if (picks.some((p) => /Jonas/.test(p))) {
    fail(`the picker offers somebody who is not a friend: ${JSON.stringify(picks)}`);
  } else if (!picks.some((p) => /Ana Rocha/.test(p))) {
    fail(`the picker does not offer an accepted friend: ${JSON.stringify(picks)}`);
  } else ok('only accepted friends can be asked to co-plan');

  // The third visibility exists and says what publishing means.
  const vis = await op.locator('.tshare-vis').innerText();
  if (!/Anyone/i.test(vis)) fail('the trip cannot be published as a guide');
  else ok('a trip can be published to the guides gallery');
  await op.locator('.tshare-vis-opt').filter({ hasText: /^Anyone$/ }).click();
  await op.waitForTimeout(400);
  const visSub = await op.locator('.tshare-vis .tshare-vis-sub').innerText();
  if (!/never do|dates/i.test(visSub)) {
    fail(`publishing does not say what travels and what does not: "${visSub}"`);
  } else ok('and publishing states what travels and what never does');
  await op.screenshot({ path: `${SHOTS}/friends-share-coplan.png` });
  await ownCtx.close();

  /* ---- 8a. The header's own Friends door, on a wide screen ---- */
  const deskCtx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  await deskCtx.addInitScript(seedSession(PROJECT_REF, ME));
  const dp = await deskCtx.newPage();
  await stub(dp, state);
  await dp.goto(`${BASE}/?o=CRL`);
  const friendsBtn = dp.locator('.header-friends-btn');
  await friendsBtn.waitFor({ timeout: 120000 });
  // Above 769px the browse chrome folds this door to its icon on purpose
  // (styles.css, the min-width: 769px block), because the left rail already
  // names it. So the desktop check is that it still HAS a name, not that the
  // name is painted: an icon-only control with no accessible name is the
  // actual defect this guards against.
  const deskName = (await friendsBtn.getAttribute('title'))
    || (await friendsBtn.getAttribute('aria-label')) || '';
  if (!/Friends/i.test(deskName)) fail(`the header Friends button has no accessible name: "${deskName}"`);
  else ok('the header carries a labelled Friends door');
  await friendsBtn.click();
  await dp.locator('.frn-find').waitFor({ timeout: 15000 });
  ok('it opens straight onto the friends page, not the account hub');

  // Opening My trips must close the account panel, and the other way round.
  await dp.locator('.header-nav-item').filter({ hasText: /^Saved trips$/ }).first().click();
  await dp.waitForTimeout(500);
  if (await dp.locator(ACCOUNT_PANEL).count()) fail('opening My trips left the account panel open');
  else ok('opening My trips closes the account panel');
  await dp.locator('.header-friends-btn').click();
  await dp.waitForTimeout(500);
  if (await dp.locator('.saved-trips-panel').count()) fail('opening Friends left My trips open');
  else ok('opening the account side closes My trips');
  await deskCtx.close();

  /* ---- 8. Mobile ---- */
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mob.addInitScript(seedSession(PROJECT_REF, ME));
  const mp = await mob.newPage();
  await stub(mp, state);
  await mp.goto(`${BASE}/?o=CRL`);
  // The phone header has no avatar (it lives only in the bottom bar), and the
  // desktop one is present but hidden, so it must not be waited on here.
  await mp.locator('.header-friends-btn').waitFor({ timeout: 120000 });
  await mp.locator('.header-friends-btn').click();
  await mp.locator('.frn-find').waitFor({ timeout: 10000 });
  await mp.waitForTimeout(400);
  const overflow = await mp.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow <= 1) ok('no sideways scroll at 390px');
  else fail(`page scrolls sideways by ${overflow}px at 390px`);

  // The word, not just the glyph, at the narrowest width this app supports.
  const mobLabel = await mp.locator('.header-friends-btn').innerText();
  if (!/Friends/i.test(mobLabel)) fail(`the Friends button is icon-only at 390px: "${mobLabel}"`);
  else ok('the Friends button keeps its word at 390px');
  await mp.screenshot({ path: `${SHOTS}/friends-mobile.png` });

  // The row carrying Passes must survive a full-bleed slide-over: it used to
  // start at top:0 and bury the one control that sells the product.
  const passVisible = async () => mp.locator('.header-pricing-btn').isVisible();
  if (!await passVisible()) fail('Passes is not visible with the account panel open');
  else ok('Passes survives the account panel');
  const headerBox = await mp.locator('.app-header').boundingBox();
  const panelBox = await mp.locator(ACCOUNT_PANEL).boundingBox();
  if (panelBox && headerBox && panelBox.y < headerBox.y + headerBox.height - 1) {
    fail(`the account panel starts at y=${panelBox.y}, over a header ending at ${headerBox.y + headerBox.height}`);
  } else ok('the account panel begins below the header, not over it');

  await mp.locator('.bottom-nav-item').filter({ hasText: 'My trips' }).locator('visible=true').first().click();
  await mp.locator('.saved-trips-panel').waitFor({ timeout: 12000 });
  if (await mp.locator(ACCOUNT_PANEL).count()) fail('My trips left the account panel open on a phone');
  else ok('on a phone too, one slide-over closes the other');
  if (!await passVisible()) fail('Passes is not visible with My trips open');
  else ok('Passes survives My trips as well');
  await mp.screenshot({ path: `${SHOTS}/friends-mobile-header.png` });
  await mob.close();

  await browser.close();
  if (srv) srv.kill();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
};

run().catch((e) => {
  console.error('FAIL:', e.message);
  process.exitCode = 1;
  if (srv) srv.kill();
});
