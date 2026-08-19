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
    friendTrips: [{
      owner_id: SOFIE.user_id, owner_handle: SOFIE.handle, owner_name: SOFIE.display_name, owner_emoji: null,
      trip_plan_id: 'ftrip-1', label: 'Two weeks in Portugal',
      start_date: '2026-06-02', end_date: '2026-06-09',
      cities: ['Lisbon', 'Porto'], countries: ['Portugal'], destination_ids: ['LIS', 'OPO'],
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
  await page.locator('.frn-trip-row').first().click();
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
  await page.locator('.saved-tabs button').nth(1).click();
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

  /* ---- 8a. The header's own Friends door, on a wide screen ---- */
  const deskCtx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  await deskCtx.addInitScript(seedSession(PROJECT_REF, ME));
  const dp = await deskCtx.newPage();
  await stub(dp, state);
  await dp.goto(`${BASE}/?o=CRL`);
  const friendsBtn = dp.locator('.header-friends-btn');
  await friendsBtn.waitFor({ timeout: 120000 });
  if (!/Friends/i.test(await friendsBtn.innerText())) fail('the header Friends button has no label');
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
