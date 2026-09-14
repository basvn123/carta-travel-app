// Headless check of the friend milestone badges (auth/FriendBadges.jsx).
//
// The award rules live in SQL and prove themselves on apply (migration 013's
// self-check). This covers the half that lives in the browser, on the same
// fake-session harness verify_friends.mjs uses: a session is written into the
// key supabase-js reads and every call is answered locally, so no credentials
// are needed and nothing touches the real project. There is also a ?badgemock
// seam (none | some | all) for eyeballing states by hand.
//
//   1. With an empty ledger, all five badges render locked: muted, none
//      earned, and the counted one shows its progress out of three.
//   2. Tapping a locked badge says exactly what would earn it; tapping an
//      earned one says when it was earned.
//   3. A ledger with earned rows renders exactly those as earned.
//   4. Instant confirmation: sending a first friend request makes the
//      icebreaker badge arrive earned AND fresh (the pop class), because the
//      spoke re-reads the ledger the moment the graph changes.
//   5. A project without migration 013 (the table 404s) shows no milestone
//      section at all, not an all-locked one.
//   6. Mobile width: the row wraps without sideways scroll.
//
// Run from inside continent-app/:  node scripts/verify_friend_badges.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4196;
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
const ANA = { user_id: '00000000-0000-4000-8000-0000000000a3', handle: 'ana_r', display_name: 'Ana Rocha', avatar_emoji: null };

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

// Same registration-order gotcha as verify_friends.mjs: Playwright tries
// handlers in REVERSE registration order, so the catch-all goes FIRST.
async function stub(page, state) {
  await page.route('**/rest/v1/**', (r) => json(r, []));
  await page.route('**/auth/v1/**', (r) => json(r, ME));
  await page.route('**/rest/v1/rpc/ai_status*', (r) => json(r, {
    tier: 'free', expiresAt: null, resetsAt: '2026-09-01T00:00:00Z',
    plansUsed: 0, plansCap: 3, plansLeft: 3, groundUsed: 0, groundCap: 0, groundLeft: 0,
  }));
  await page.route('**/rest/v1/profiles*', (r) => {
    if (r.request().method() !== 'GET') return json(r, {}, 204);
    const url = r.request().url();
    if (url.includes(ME.id)) {
      return json(r, { user_id: ME.id, handle: 'sam_okonkwo', display_name: 'Sam Okonkwo', avatar_emoji: null });
    }
    return json(r, [SOFIE, ANA].filter((p) => url.includes(p.user_id)));
  });
  await page.route('**/rest/v1/rpc/find_profile_by_handle*', (r) => {
    const { wanted } = JSON.parse(r.request().postData() || '{}');
    const hit = [SOFIE, ANA].find((p) => p.handle === wanted);
    return json(r, hit ? [hit] : []);
  });
  await page.route('**/rest/v1/friendships*', (r) => {
    const method = r.request().method();
    if (method === 'POST') {
      const body = JSON.parse(r.request().postData() || '{}');
      state.links.push({ id: `f${state.links.length + 9}`, ...body, created_at: '2026-08-19T00:00:00Z' });
      // What migration 013's trigger does in the same transaction: the first
      // request awards icebreaker. The harness mimics it so the spoke's
      // refetch has something to find.
      if (!state.badges.some((b) => b.badge === 'icebreaker')) {
        state.badges.push({ badge: 'icebreaker', earned_at: '2026-08-19T10:00:00Z' });
      }
      return json(r, [], 201);
    }
    if (method === 'DELETE' || method === 'PATCH') return json(r, [], 204);
    return json(r, state.links);
  });
  await page.route('**/rest/v1/user_achievements*', (r) => {
    if (state.ledgerMissing) {
      return json(r, { code: '42P01', message: 'relation "public.user_achievements" does not exist' }, 404);
    }
    return json(r, state.badges);
  });
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

const openSpoke = async (page) => {
  await page.locator('.header-friends-btn').first().click({ timeout: 120000 });
  await page.locator('.frn-find').waitFor({ timeout: 15000 });
};

const run = async () => {
  await waitForServer();
  const browser = await chromium.launch();

  /* ---- 1 and 2. An empty ledger: five locked medallions that explain ---- */
  const state = {
    links: [{ id: 'f3', requester_id: ANA.user_id, addressee_id: ME.id, status: 'accepted', created_at: '2026-07-01T00:00:00Z' }],
    badges: [],
    ledgerMissing: false,
  };
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  await ctx.addInitScript(seedSession(PROJECT_REF, ME));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  await stub(page, state);
  await page.goto(`${BASE}/?o=CRL`);
  await openSpoke(page);

  await page.locator('.fbadge-row').waitFor({ timeout: 15000 });
  const count = await page.locator('.fbadge').count();
  if (count !== 5) fail(`expected 5 badges, found ${count}`);
  else ok('five milestone badges render');
  if (await page.locator('.fbadge-earned').count() !== 0) {
    fail('an empty ledger renders an earned badge');
  } else ok('an empty ledger renders everything locked');

  // The counted badge draws its progress from the one accepted friend.
  const progress = await page.locator('.fbadge-count').innerText();
  if (progress.trim() !== '1/3') fail(`the progress count reads "${progress}", expected 1/3`);
  else ok('the counted badge reads 1/3 from the friend list already fetched');
  if (await page.locator('.fbadge-ring').count() !== 1) {
    fail('the counted badge has no progress ring');
  } else ok('and wears the one progress ring');

  // Tapping a locked badge must say what would earn it.
  await page.locator('.fbadge').last().click();
  await page.locator('.fbadge-about').waitFor({ timeout: 5000 });
  const about = await page.locator('.fbadge-about').innerText();
  if (!/asks you first/i.test(about)) fail(`the locked explanation reads: "${about}"`);
  else ok('a locked badge explains exactly what earns it');
  await page.locator('.fbadge').last().click();
  await page.screenshot({ path: `${SHOTS}/friend-badges-locked.png` });

  /* ---- 4. Sending a first request confirms on the spot ---- */
  const handleField = page.locator('.frn-find input');
  await handleField.fill('sofie_v');
  await page.locator('.frn-find button[type="submit"]').click();
  await page.locator('.frn-found').waitFor({ timeout: 8000 });
  await page.locator('.frn-found .frn-yes').click();
  await page.locator('.fbadge-earned').first().waitFor({ timeout: 10000 });
  const firstBadgeClass = await page.locator('.fbadge').first().getAttribute('class');
  if (!/fbadge-earned/.test(firstBadgeClass)) {
    fail(`the icebreaker badge did not turn earned after the first request: ${firstBadgeClass}`);
  } else ok('the first friend request turns the icebreaker badge earned right away');
  if (!/fbadge-fresh/.test(firstBadgeClass)) {
    fail('a badge earned during the visit is not marked fresh, so nothing pops');
  } else ok('and it arrives fresh, so the confirmation pops exactly once');
  await page.locator('.fbadge').first().click();
  const earnedLine = await page.locator('.fbadge-about').innerText();
  if (!/Earned/i.test(earnedLine)) fail(`an earned badge explains itself as: "${earnedLine}"`);
  else ok('tapping the earned badge says when it was earned');
  await page.screenshot({ path: `${SHOTS}/friend-badges-earned.png` });
  await ctx.close();

  /* ---- 3. A ledger with rows renders exactly those as earned ---- */
  const state2 = {
    links: [{ id: 'f3', requester_id: ANA.user_id, addressee_id: ME.id, status: 'accepted', created_at: '2026-07-01T00:00:00Z' }],
    badges: [
      { badge: 'icebreaker', earned_at: '2026-08-01T00:00:00Z' },
      { badge: 'catalyst', earned_at: '2026-08-10T00:00:00Z' },
    ],
    ledgerMissing: false,
  };
  const ctx2 = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  await ctx2.addInitScript(seedSession(PROJECT_REF, ME));
  const p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => fail(`page error: ${e.message}`));
  await stub(p2, state2);
  await p2.goto(`${BASE}/?o=CRL`);
  await openSpoke(p2);
  await p2.locator('.fbadge-row').waitFor({ timeout: 15000 });
  const earnedCount = await p2.locator('.fbadge-earned').count();
  if (earnedCount !== 2) fail(`expected 2 earned badges from the ledger, found ${earnedCount}`);
  else ok('the ledger decides which badges are earned, and only it');
  if (await p2.locator('.fbadge-fresh').count() !== 0) {
    fail('a badge earned before the visit still animates');
  } else ok('badges earned before the visit sit still');
  await ctx2.close();

  /* ---- 5. No migration 013: no section, not an all-locked one ---- */
  const state3 = { links: [], badges: [], ledgerMissing: true };
  const ctx3 = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  await ctx3.addInitScript(seedSession(PROJECT_REF, ME));
  const p3 = await ctx3.newPage();
  p3.on('pageerror', (e) => fail(`page error: ${e.message}`));
  await stub(p3, state3);
  await p3.goto(`${BASE}/?o=CRL`);
  await openSpoke(p3);
  await p3.waitForTimeout(1200);
  if (await p3.locator('.fbadge-row').count() !== 0) {
    fail('a project without the ledger still shows the milestone row');
  } else ok('without the ledger the section is absent, never all-locked');
  await ctx3.close();

  /* ---- 6. Mobile ---- */
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mob.addInitScript(seedSession(PROJECT_REF, ME));
  const mp = await mob.newPage();
  await stub(mp, state2);
  await mp.goto(`${BASE}/?o=CRL`);
  await openSpoke(mp);
  await mp.locator('.fbadge-row').waitFor({ timeout: 15000 });
  const overflow = await mp.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow <= 1) ok('no sideways scroll at 390px');
  else fail(`page scrolls sideways by ${overflow}px at 390px`);
  await mp.screenshot({ path: `${SHOTS}/friend-badges-mobile.png` });
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
