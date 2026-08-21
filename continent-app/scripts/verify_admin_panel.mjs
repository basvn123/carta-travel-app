// Headless check for the back office (2026-08-20 full page) and the site
// notice banner.
//
// The admin surface is a full page now, opened from a row in the account hub
// that only exists for accounts on the admin list. This harness fakes an
// admin session the same way verify_account_panel.mjs fakes a traveller: a
// session written into the storage key supabase-js reads, and every RPC
// answered locally. Nothing touches the real project.
//
// What it checks:
//   1. The hub shows the Admin row; it opens the full page behind a re-auth
//      lock that refuses a wrong password (real re-auth call).
//   2. Overview: the tiles render, and a table the database is missing is
//      NAMED on screen rather than shown as a silent zero.
//   3. A failed user list says so. This is the regression that matters: a
//      list that errored used to render "no accounts match that search"
//      over a database full of accounts.
//   4. Users: the table renders, searches by word and by pasted id, exports
//      CSV, and opens one account in full.
//   5. A pass change lands as admin_set_tier with the days given.
//   6. The quota reset arms first, fires second.
//   7. Support: the reset mail rides the public recover endpoint AND lands
//      in the trail via admin_mark; suspension arms, takes days, shows the
//      chip, lifts again; a note saves and appears in the history.
//   8. Deletion is armed, retype-gated, refuses a wrong confirmation with
//      the server's own error, and goes through with the right one.
//   8d. Content: the layer loads from the real wire file, an http image is
//      refused a preview, a correction saves, and reverting clears it.
//   9. Site: maintenance, the notice and the flags publish what the app reads.
//  10. Audit: the full table renders.
//  11. A non-admin account never sees the row.
//  12. The public banner: shows when enabled, warn tone, dismiss sticks.
// Plus the floor: Escape closes, and no sideways scroll at 380px.
//
// Run from inside continent-app/:  node scripts/verify_admin_panel.mjs
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4192;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const PROJECT_REF = 'ntssxktaduxzpsmejwyv';
const RIGHT_PASSWORD = 'correct-horse-battery';
const ADMIN = {
  id: '00000000-0000-4000-8000-0000000000aa',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'owner@example.com',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  user_metadata: { full_name: 'Site Owner' },
  app_metadata: { provider: 'email', providers: ['email'] },
  identities: [{ id: 'i1', provider: 'email', identity_data: { email: 'owner@example.com' } }],
  created_at: '2026-01-01T00:00:00Z',
};

const USERS = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'zoe@example.com', handle: 'zoe_travels', displayName: 'Zoe Martens',
    avatarEmoji: null, tier: 'trip', expiresAt: '2026-09-10T00:00:00Z',
    createdAt: '2026-05-02T10:00:00Z', lastSignIn: '2026-08-18T09:12:00Z',
    tripPlans: 4, dayPlans: 7, isAdmin: false,
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    email: 'marco@example.com', handle: 'marco_b', displayName: null,
    avatarEmoji: '\u{1F9ED}', tier: 'free', expiresAt: null,
    createdAt: '2026-07-21T18:30:00Z', lastSignIn: null,
    tripPlans: 0, dayPlans: 1, isAdmin: false,
  },
  {
    id: ADMIN.id,
    email: ADMIN.email, handle: 'owner', displayName: 'Site Owner',
    avatarEmoji: null, tier: 'year', expiresAt: '2126-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z', lastSignIn: '2026-08-19T08:00:00Z',
    tripPlans: 12, dayPlans: 30, isAdmin: true,
  },
];

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

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };
const ok = (msg) => console.log('  ok:', msg);
const json = (route, body) => route.fulfill({
  status: 200, contentType: 'application/json', body: JSON.stringify(body),
});

async function stubSupabase(page, state, opts = {}) {
  const admin = opts.isAdmin !== false;

  await page.route('**/auth/v1/token*', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    state.reauthAttempts.push(body.password);
    if (body.password !== RIGHT_PASSWORD) {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
      });
    }
    return json(route, {
      access_token: 'stub', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'stub-refresh', user: ADMIN,
    });
  });
  await page.route('**/auth/v1/recover*', (route) => {
    state.recoverCalls.push(JSON.parse(route.request().postData() || '{}'));
    return json(route, {});
  });

  await page.route('**/rest/v1/rpc/ai_status*', (route) => json(route, {
    tier: 'year', expiresAt: '2126-01-01T00:00:00Z', resetsAt: '2126-01-01T00:00:00Z',
    plansUsed: 0, plansCap: 300, plansLeft: 300,
    groundUsed: 0, groundCap: 120, groundLeft: 120,
  }));
  await page.route('**/rest/v1/rpc/is_admin*', (route) => json(route, admin));
  await page.route('**/rest/v1/rpc/admin_stats*', (route) => json(route, admin
    ? {
      users: 3, newWeek: 1, newMonth: 2, admins: 1, passesTrip: 1, passesYear: 1,
      tripPlans: 16, dayPlans: 38, aiToday: 5,
      // The project this harness pretends to be predates day_plans, which is
      // the exact shape of the bug this surface now has to report.
      missing: state.missing,
    }
    : { error: 'forbidden' }));
  await page.route('**/rest/v1/rpc/admin_health*', (route) => json(route, {
    tables: {
      profiles: true, entitlements: true, trip_plans: true,
      day_plans: !state.missing.includes('day_plans'),
      admin_users: true, admin_audit_log: true, site_config: true,
    },
  }));
  await page.route('**/rest/v1/rpc/admin_list_users*', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    state.listCalls.push(body);
    if (state.listFails) return json(route, { error: 'relation "public.day_plans" does not exist' });
    const s = (body.p_search || '').toLowerCase();
    const rows = USERS
      .filter((u) => !state.deleted.has(u.id))
      .filter((u) => !s
        || u.id === s
        || (u.email || '').toLowerCase().includes(s)
        || (u.handle || '').toLowerCase().includes(s)
        || (u.displayName || '').toLowerCase().includes(s))
      .map((u) => ({ ...u, bannedUntil: state.banned.get(u.id) || null }));
    return json(route, { total: rows.length, rows, degraded: false });
  });
  await page.route('**/rest/v1/rpc/admin_get_user*', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const u = USERS.find((x) => x.id === body.p_user && !state.deleted.has(x.id));
    if (!u) return json(route, { error: 'not_found' });
    const tier = state.tiers.get(u.id) || u.tier;
    return json(route, {
      ...u,
      tier,
      expiresAt: tier === 'free' ? null : (state.tiers.has(u.id) ? '2027-08-19T00:00:00Z' : u.expiresAt),
      bannedUntil: state.banned.get(u.id) || null,
      confirmedAt: '2026-05-02T10:05:00Z', provider: 'email',
      periodStart: '2026-08-01',
      plansUsed: 12, groundUsed: 3, friends: 2,
      badges: ['icebreaker'], grants: [],
      history: state.history
        .filter((h) => h.user === u.id)
        .map((h, i) => ({ action: h.action, actor: 'owner', detail: h.detail || null, createdAt: '2026-08-20T10:00:00Z', id: i }))
        .reverse(),
    });
  });
  await page.route('**/rest/v1/rpc/admin_set_tier*', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    state.tierCalls.push(body);
    state.tiers.set(body.p_user, body.p_tier);
    state.history.push({ user: body.p_user, action: 'set_tier', detail: { tier: body.p_tier } });
    return json(route, { ok: true, tier: body.p_tier });
  });
  await page.route('**/rest/v1/rpc/admin_reset_quota*', (route) => {
    state.quotaCalls.push(JSON.parse(route.request().postData() || '{}'));
    return json(route, { ok: true });
  });
  await page.route('**/rest/v1/rpc/admin_ban_user*', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    state.banCalls.push(body);
    state.banned.set(body.p_user, '2099-01-01T00:00:00Z');
    state.history.push({ user: body.p_user, action: 'ban_user', detail: { days: body.p_days } });
    return json(route, { ok: true });
  });
  await page.route('**/rest/v1/rpc/admin_unban_user*', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    state.unbanCalls.push(body);
    state.banned.delete(body.p_user);
    state.history.push({ user: body.p_user, action: 'unban_user' });
    return json(route, { ok: true });
  });
  await page.route('**/rest/v1/rpc/admin_add_note*', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    state.noteCalls.push(body);
    state.history.push({ user: body.p_user, action: 'note', detail: { text: body.p_note } });
    return json(route, { ok: true });
  });
  await page.route('**/rest/v1/rpc/admin_mark*', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    state.markCalls.push(body);
    state.history.push({ user: body.p_target, action: body.p_action });
    return json(route, { ok: true });
  });
  await page.route('**/rest/v1/rpc/admin_delete_user*', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    state.deleteCalls.push(body);
    const u = USERS.find((x) => x.id === body.p_user);
    if (!u || (body.p_confirm !== u.email && body.p_confirm !== u.handle)) {
      return json(route, { error: 'confirm_mismatch' });
    }
    state.deleted.add(u.id);
    return json(route, { ok: true });
  });
  await page.route('**/rest/v1/rpc/admin_set_config*', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    state.configCalls.push(body);
    state.siteConfig[body.p_key] = body.p_value;
    return json(route, { ok: true });
  });
  await page.route('**/rest/v1/rpc/admin_analytics*', (route) => json(route, {
    activeDay: 2, activeWeek: 5, activeMonth: 9, neverSignedIn: 1,
    providers: [{ provider: 'email', n: 7 }, { provider: 'google', n: 3 }],
    signups: Array.from({ length: 28 }, (_, i) => ({
      day: `2026-07-${String((i % 28) + 1).padStart(2, '0')}`, n: i % 4,
    })),
    topDests: [
      { id: 'lisbon', city: 'Lisbon', country: 'Portugal', n: 12 },
      { id: 'rome', city: 'Rome', country: 'Italy', n: 8 },
    ],
    topCountries: [{ country: 'Portugal', n: 14 }, { country: 'Italy', n: 9 }],
    feedback: { new: 1, total: 2 },
  }));
  await page.route('**/rest/v1/rpc/admin_list_feedback*', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    state.fbCalls.push(body);
    const rows = state.feedback.filter((f) => !body.p_status || f.status === body.p_status);
    return json(route, {
      total: rows.length,
      new: state.feedback.filter((f) => f.status === 'new').length,
      rows,
    });
  });
  await page.route('**/rest/v1/rpc/admin_set_feedback_status*', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    state.fbStatusCalls.push(body);
    const row = state.feedback.find((f) => f.id === body.p_id);
    if (row) row.status = body.p_status;
    return json(route, { ok: true });
  });
  await page.route('**/rest/v1/rpc/submit_feedback*', (route) => {
    state.submitCalls.push(JSON.parse(route.request().postData() || '{}'));
    return json(route, { ok: true });
  });
  await page.route('**/rest/v1/rpc/admin_list_overrides*', (route) => {
    state.ovListCalls.push(JSON.parse(route.request().postData() || '{}'));
    return json(route, {
      rows: state.overrides,
      counts: state.overrides.reduce((a, o) => ({ ...a, [o.layer]: (a[o.layer] || 0) + 1 }), {}),
    });
  });
  await page.route('**/rest/v1/rpc/admin_set_override*', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    state.ovSetCalls.push(body);
    const i = state.overrides.findIndex((o) => o.layer === body.p_layer && o.itemId === body.p_item);
    if (!body.p_patch || Object.keys(body.p_patch).length === 0) {
      if (i >= 0) state.overrides.splice(i, 1);
      return json(route, { ok: true, cleared: true });
    }
    const row = { layer: body.p_layer, itemId: body.p_item, patch: body.p_patch, note: body.p_note, updatedAt: '2026-08-20T12:00:00Z', by: 'owner' };
    if (i >= 0) state.overrides[i] = row; else state.overrides.push(row);
    return json(route, { ok: true });
  });
  await page.route('**/rest/v1/rpc/admin_get_audit*', (route) => json(route, {
    total: 2,
    rows: [
      { id: 2, action: 'set_tier', actor: 'owner', target: 'zoe_travels', detail: { tier: 'trip' }, createdAt: '2026-08-18T14:00:00Z' },
      { id: 1, action: 'set_config', actor: 'owner', target: null, detail: { key: 'announcement' }, createdAt: '2026-08-17T09:00:00Z' },
    ],
  }));
  await page.route('**/rest/v1/site_config*', (route) => {
    const url = route.request().url();
    if (url.includes('key=eq.')) return json(route, { value: state.siteConfig.announcement });
    return json(route, Object.entries(state.siteConfig).map(([key, value]) => ({ key, value })));
  });
  await page.route('**/rest/v1/profiles*', (route) => json(route, {
    user_id: ADMIN.id, handle: 'owner', display_name: 'Site Owner', avatar_emoji: null,
  }));
}

const seedSession = (ref, user) => `(() => {
  localStorage.setItem('continent.guestMode.v1', '1');
  localStorage.setItem('carta.welcomeSeen', '1');
  localStorage.setItem('carta.mapGuideDone', '1');
  ${user ? `localStorage.setItem('sb-${ref}-auth-token', JSON.stringify({
    access_token: 'stub', token_type: 'bearer', expires_in: 360000,
    expires_at: Math.floor(Date.now() / 1000) + 360000,
    refresh_token: 'stub-refresh', user: ${JSON.stringify(user)},
  }));` : ''}
})()`;

async function openPanel(page) {
  await page.locator('.account-avatar-btn').first().click({ timeout: 20000 });
  await page.locator('.account-panel').waitFor({ timeout: 15000 });
}

async function openAdmin(page, { unlock = true } = {}) {
  await page.locator('.account-menu-row', { hasText: 'Admin' }).click();
  await page.locator('.adminpage-lock').waitFor({ timeout: 15000 });
  if (!unlock) return;
  await page.locator('#admin-lock-input').fill(RIGHT_PASSWORD);
  await page.locator('button', { hasText: 'Open admin tools' }).click();
  await page.locator('.adminpage-tiles, .adminpage-err').first().waitFor({ timeout: 15000 });
}

const gotoSection = (page, name) =>
  page.locator('.adminpage-navbtn', { hasText: name }).click();

try {
  await waitForServer();
  const browser = await chromium.launch();
  const state = {
    reauthAttempts: [], recoverCalls: [],
    listCalls: [], tierCalls: [], quotaCalls: [], deleteCalls: [], configCalls: [],
    banCalls: [], unbanCalls: [], noteCalls: [], markCalls: [],
    deleted: new Set(), tiers: new Map(), banned: new Map(),
    history: [], missing: ['day_plans'], listFails: false,
    fbCalls: [], fbStatusCalls: [], submitCalls: [],
    ovListCalls: [], ovSetCalls: [], overrides: [],
    feedback: [
      {
        id: 2, kind: 'bug', status: 'new', message: 'The Porto bus fare looked too low for August.',
        email: 'zoe@example.com', handle: 'zoe_travels', userId: USERS[0].id,
        context: { path: '/?tab=map', viewport: '390x844', lang: 'en-GB' },
        createdAt: '2026-08-19T11:00:00Z',
      },
      {
        id: 1, kind: 'idea', status: 'done', message: 'Please add night trains.',
        email: null, handle: null, userId: null, context: null,
        createdAt: '2026-08-15T09:00:00Z',
      },
    ],
    siteConfig: {
      announcement: { enabled: false, text: '', tone: 'info' },
      maintenance: { enabled: false, message: '' },
      features: {},
    },
  };

  // ---- 1. The door and the lock.
  console.log('1. the door and the lock');
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    acceptDownloads: true,
  });
  await ctx.addInitScript(seedSession(PROJECT_REF, ADMIN));
  const page = await ctx.newPage();
  await stubSupabase(page, state);
  await page.goto(`${BASE}/?o=CRL`);
  await page.locator('.account-avatar-btn').first().waitFor({ timeout: 120000 });
  await openPanel(page);
  const adminRow = page.locator('.account-menu-row', { hasText: 'Admin' });
  await adminRow.waitFor({ timeout: 10000 });
  const rowBox = await adminRow.boundingBox();
  if (!rowBox || rowBox.height < 44) fail(`the Admin row is ${rowBox?.height}px tall, under 44px`);

  await openAdmin(page, { unlock: false });
  if (await page.locator('.account-panel').count()) fail('the account panel stayed open behind the page');
  if (await page.locator('.adminpage-tiles').count()) fail('the page opened before anybody proved anything');
  await page.locator('#admin-lock-input').fill('not-the-password');
  await page.locator('button', { hasText: 'Open admin tools' }).click();
  await page.waitForTimeout(700);
  if (!(await page.locator('.adminpage-err').count())) fail('a wrong password unlocked nothing and said nothing');
  if (await page.locator('.adminpage-tiles').count()) fail('a wrong password opened the page');
  if (!state.reauthAttempts.includes('not-the-password')) fail('no real re-auth call was made');
  await page.screenshot({ path: `${SHOTS}/admin-lock.png` });
  await page.locator('#admin-lock-input').fill(RIGHT_PASSWORD);
  await page.locator('button', { hasText: 'Open admin tools' }).click();
  await page.locator('.adminpage-tiles').first().waitFor({ timeout: 15000 });
  ok('the lock refuses a wrong password by re-auth, and opens the page on the right one');

  // ---- 2. Overview, including what the database is missing.
  console.log('2. overview');
  const tiles = await page.locator('.adminpage-tiles').first().locator('.adminpage-tile').count();
  if (tiles !== 8) fail(`expected 8 tiles, found ${tiles}`);
  if ((await page.locator('.adminpage-tile b').first().innerText()).trim() !== '3') {
    fail('the accounts tile does not carry the stubbed count');
  }
  const warn = page.locator('.adminpage-warn');
  if (!(await warn.count())) fail('a missing table is not reported anywhere');
  if (!/day_plans/.test(await warn.first().innerText())) {
    fail(`the warning does not name the missing table: ${await warn.first().innerText()}`);
  }
  ok(`${tiles} tiles, and the missing table is named on screen`);
  await page.screenshot({ path: `${SHOTS}/admin-overview.png` });

  // ---- 3. A failed list says so. The regression that matters.
  console.log('3. a failed list is not an empty list');
  state.listFails = true;
  await gotoSection(page, 'Users');
  // Typing is what re-runs the query; switching sections renders what was
  // already loaded, which is the whole reason a stale failure needs a retry.
  await page.locator('.adminpage-search input').fill('zoe');
  await page.waitForTimeout(900);
  const errNow = await page.locator('.adminpage-err').allInnerTexts();
  if (!errNow.some((s) => /day_plans|does not exist/i.test(s))) {
    fail(`a failed list did not surface the server error: ${JSON.stringify(errNow)}`);
  }
  if (await page.locator('.adminpage-muted', { hasText: 'No accounts match' }).count()) {
    fail('a failed list still claims no accounts match');
  }
  if (await page.locator('.adminpage-table').count()) fail('a failed list still drew a table');
  ok('a failed list shows the database error instead of pretending to be empty');

  // And the failure is recoverable without reopening the page.
  state.listFails = false;
  await page.locator('.adminpage-retry').click();
  await page.locator('.adminpage-table').waitFor({ timeout: 10000 });
  if (await page.locator('.adminpage-err').count()) fail('the error survived a successful retry');
  ok('the retry button reloads the list and clears the error');
  await page.locator('.adminpage-search input').fill('');
  await page.waitForTimeout(800);

  // ---- 4. The users table.
  console.log('4. users');
  await gotoSection(page, 'Overview');
  await gotoSection(page, 'Users');
  await page.locator('.adminpage-table').waitFor({ timeout: 10000 });
  const bodyRows = page.locator('.adminpage-table tbody tr');
  if (await bodyRows.count() !== 3) fail(`expected 3 rows, found ${await bodyRows.count()}`);
  if (!(await page.locator('.adminpage-chip.staff').count())) fail('the staff account carries no chip');
  if (!(await page.locator('.adminpage-chip.trip').count())) fail('the pass holder carries no tier chip');

  const dlPromise = page.waitForEvent('download', { timeout: 15000 });
  await page.locator('.adminpage-btn', { hasText: 'Export CSV' }).click();
  const dl = await dlPromise;
  if (!/^carta-users-\d{4}-\d{2}-\d{2}\.csv$/.test(dl.suggestedFilename())) {
    fail(`the CSV download is misnamed: ${dl.suggestedFilename()}`);
  }
  ok(`the table exports as ${dl.suggestedFilename()}`);

  await page.locator('.adminpage-search input').fill('zoe');
  await page.waitForTimeout(700);
  if (await bodyRows.count() !== 1) fail(`searching "zoe" left ${await bodyRows.count()} rows`);
  await page.locator('.adminpage-search input').fill(USERS[1].id);
  await page.waitForTimeout(700);
  if (await bodyRows.count() !== 1) fail('a pasted user id did not find its account');
  if (!/marco/.test(await bodyRows.first().innerText())) fail('the id search found the wrong account');
  ok('the table searches by word and by pasted id');
  await page.locator('.adminpage-search input').fill('zoe');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/admin-users.png` });

  await page.locator('.adminpage-namebtn').first().click();
  await page.locator('.adminpage-facts').waitFor({ timeout: 10000 });
  if (!/Zoe/.test(await page.locator('.adminpage-detail-id').innerText())) {
    fail('the detail head does not name the user');
  }
  if ((await page.locator('.adminpage-facts > div').count()) < 8) fail('the detail states fewer than 8 facts');
  ok('an account opens in full');

  // ---- 5. A pass change.
  console.log('5. pass change');
  await page.locator('.adminpage-seg', { hasText: 'Year' }).click();
  await page.locator('#admin-days').fill('90');
  await page.locator('.adminpage-btn', { hasText: 'Apply pass change' }).click();
  await page.waitForTimeout(800);
  const tc = state.tierCalls[0];
  if (!tc || tc.p_tier !== 'year' || tc.p_days !== 90) {
    fail(`admin_set_tier got ${JSON.stringify(tc)}, expected year for 90 days`);
  }
  if (!(await page.locator('.adminpage-ok').count())) fail('a completed pass change confirms nothing');
  ok('the pass change lands as admin_set_tier(year, 90)');

  // ---- 6. Quota reset arms first.
  console.log('6. quota reset');
  const quotaBtn = page.locator('.adminpage-btn', { hasText: /Reset AI allowance|Confirm the reset/ });
  await quotaBtn.click();
  if (state.quotaCalls.length) fail('the quota reset fired on the first press');
  await quotaBtn.click();
  await page.waitForTimeout(700);
  if (!state.quotaCalls.length) fail('the confirmed reset never reached the RPC');
  ok('the reset arms on the first press and fires on the second');

  // ---- 7. Support toolkit.
  console.log('7. support toolkit');
  await page.locator('.adminpage-btn', { hasText: 'Email a password reset' }).click();
  await page.waitForTimeout(900);
  if (!state.recoverCalls.some((c) => c.email === 'zoe@example.com')) {
    fail('the reset mail never reached the recover endpoint');
  }
  if (!state.markCalls.some((c) => c.p_action === 'send_reset')) {
    fail('the reset mail left no admin_mark in the trail');
  }
  ok('the reset mail goes out and lands in the trail');

  await page.locator('.adminpage-btn', { hasText: 'Suspend sign-in' }).click();
  if (state.banCalls.length) fail('suspension fired without the confirm step');
  await page.locator('#admin-ban-days').fill('7');
  await page.locator('.adminpage-btn', { hasText: /^Suspend$/ }).click();
  await page.waitForTimeout(900);
  if (state.banCalls[0]?.p_days !== 7) fail(`admin_ban_user got ${JSON.stringify(state.banCalls[0])}`);
  if (!(await page.locator('.adminpage-detail-chips .adminpage-chip.banned').count())) {
    fail('a suspended account carries no chip');
  }
  await page.locator('.adminpage-btn', { hasText: 'Lift the suspension' }).click();
  await page.waitForTimeout(900);
  if (!state.unbanCalls.length) fail('lifting the suspension never reached the RPC');
  if (await page.locator('.adminpage-detail-chips .adminpage-chip.banned').count()) {
    fail('the chip survived the lift');
  }
  ok('suspension arms, takes days, shows the chip, and lifts again');

  await page.locator('.adminpage-textarea').fill('Refunded the June Trip Pass, card was charged twice');
  await page.locator('.adminpage-btn', { hasText: 'Save note' }).click();
  await page.waitForTimeout(900);
  if (!state.noteCalls.some((c) => /June Trip Pass/.test(c.p_note || ''))) {
    fail('the note never reached admin_add_note');
  }
  if (!/June Trip Pass/.test((await page.locator('.adminpage-log').first().allInnerTexts()).join(' '))) {
    fail('the saved note is not in the history');
  }
  ok('a note saves and appears in the account history');
  await page.screenshot({ path: `${SHOTS}/admin-detail.png` });

  // ---- 8. Deletion.
  console.log('8. deletion');
  await page.locator('.adminpage-btn.danger', { hasText: 'Delete this account' }).click();
  const confirmField = page.locator('#admin-del-confirm');
  await confirmField.waitFor({ timeout: 5000 });
  const delBtn = page.locator('.adminpage-btn', { hasText: 'Delete forever' });
  if (await delBtn.isEnabled()) fail('deletion is live with an empty confirmation');
  await confirmField.fill('wrong@example.com');
  await delBtn.click();
  await page.waitForTimeout(800);
  if (state.deleted.size) fail('a wrong confirmation deleted the account anyway');
  if (!(await page.locator('.adminpage-err').count())) fail('a wrong confirmation surfaced no error');
  await confirmField.fill('zoe@example.com');
  await delBtn.click();
  // Back to the list, which is still filtered to the account just deleted,
  // so it is correctly empty and draws no table. Clearing the search is what
  // proves the row is gone rather than merely filtered out.
  await page.locator('.adminpage-search input').waitFor({ timeout: 10000 });
  if (!state.deleted.has(USERS[0].id)) fail('the right confirmation never deleted');
  if (!(await page.locator('.adminpage-muted', { hasText: 'No accounts match' }).count())) {
    fail('the deleted account still matches its own search');
  }
  await page.locator('.adminpage-search input').fill('');
  await page.locator('.adminpage-table').waitFor({ timeout: 10000 });
  if (await bodyRows.count() !== 2) fail(`the deleted account still shows: ${await bodyRows.count()} rows`);
  ok('deletion needs the exact address, and the table drops the account');

  // ---- 8b. Analytics on the overview.
  console.log('8b. analytics');
  await gotoSection(page, 'Overview');
  await page.locator('.adminpage-spark').waitFor({ timeout: 10000 });
  const bars = await page.locator('.adminpage-sparkbar').count();
  if (bars !== 28) fail(`the signups chart has ${bars} bars, expected 28`);
  const provs = await page.locator('.adminpage-bars li').allInnerTexts();
  if (!provs.some((s) => /google/.test(s)) || !provs.some((s) => /email/.test(s))) {
    fail(`the provider split is missing a row: ${JSON.stringify(provs)}`);
  }
  const ranks = await page.locator('.adminpage-rank').first().innerText();
  if (!/Lisbon/.test(ranks)) fail('the most-planned destinations list is empty');
  // The chart must never be the only way to read the number.
  if (!/28 days/.test(await page.locator('.adminpage-card', { hasText: 'Signups' }).innerText())) {
    fail('the signups chart states no total in words');
  }
  ok(`${bars} days of signups, the provider split, and the destination ranking`);
  await page.screenshot({ path: `${SHOTS}/admin-analytics.png`, fullPage: true });

  // ---- 8c. The feedback inbox.
  console.log('8c. feedback inbox');
  await gotoSection(page, 'Feedback');
  await page.locator('.adminpage-fb').first().waitFor({ timeout: 10000 });
  if (await page.locator('.adminpage-fb').count() !== 1) {
    fail('the New filter does not show exactly the one new message');
  }
  const card = page.locator('.adminpage-fb').first();
  if (!/Porto bus fare/.test(await card.innerText())) fail('the message body is not shown');
  if (!/390x844/.test(await card.innerText())) fail('the context line is missing');
  await page.locator('.adminpage-seg', { hasText: 'All' }).click();
  await page.waitForTimeout(700);
  if (await page.locator('.adminpage-fb').count() !== 2) fail('the All filter does not show both messages');
  await page.locator('.adminpage-fb').first().locator('.adminpage-btn', { hasText: 'Mark done' }).click();
  await page.waitForTimeout(800);
  if (!state.fbStatusCalls.some((c) => c.p_status === 'done')) {
    fail('marking a message done never reached the RPC');
  }
  ok('the inbox filters, shows the context, and marks a message done');

  // ---- 8d. Content review: the catalogue as travellers see it.
  // Deliberately NOT stubbed. A service worker serves public/, so page.route
  // never sees these requests anyway, and reading the real wire file is the
  // stronger test: the grid shows exactly what a traveller is shown.
  console.log('8d. content review');
  await gotoSection(page, 'Content');
  await page.locator('.adminpage-grid').waitFor({ timeout: 15000 });
  const cards = page.locator('.adminpage-card2');
  const nCards = await cards.count();
  if (nCards < 2) fail(`the beaches layer rendered ${nCards} cards from the real wire file`);
  if (!(await cards.first().locator('img').count())) fail('the first beach card shows no photograph');
  const firstId = (await cards.first().locator('code').innerText()).trim();
  const firstName = (await cards.first().locator('.adminpage-cardname').innerText()).trim();
  if (!firstId || !firstName) fail('a card is missing its id or its name');
  ok(`${nCards} beaches from the real wire file, photographed and named (${firstName})`);

  // Switching layer reloads from that layer's own index and files.
  await page.locator('.adminpage-seg', { hasText: 'Mountains' }).click();
  await page.locator('.adminpage-grid').waitFor({ timeout: 15000 });
  await page.waitForTimeout(900);
  const mtnCards = await page.locator('.adminpage-card2').count();
  if (mtnCards < 1) fail('the mountains layer rendered nothing');
  ok(`switching layer reloads: ${mtnCards} mountains`);
  await page.locator('.adminpage-seg', { hasText: 'Beaches' }).click();
  await page.locator('.adminpage-grid').waitFor({ timeout: 15000 });
  await page.waitForTimeout(900);

  await page.locator('.adminpage-card2').first().click();
  await page.locator('.adminpage-editorbox').waitFor({ timeout: 10000 });
  // http is refused by the page's own CSP, so the editor must not preview one
  // as though it would work.
  await page.locator('#ov-image').fill('http://insecure.example/a.jpg');
  await page.waitForTimeout(250);
  if (await page.locator('.adminpage-editorpreview img').count() > 1) {
    fail('an http URL was previewed as if it would load');
  }
  await page.locator('#ov-image').fill('https://upload.wikimedia.org/better.jpg');
  await page.waitForTimeout(300);
  if (await page.locator('.adminpage-editorpreview img').count() !== 2) {
    fail('a valid https URL was not previewed beside the original');
  }
  ok('the editor previews an https replacement and refuses to preview http');

  await page.locator('#ov-name').fill('A corrected name');
  await page.locator('#ov-note').fill('old photo showed the car park');
  await page.locator('.adminpage-btn', { hasText: 'Save correction' }).click();
  await page.waitForTimeout(1000);
  const ov = state.ovSetCalls[0];
  if (!ov || ov.p_layer !== 'beach') fail(`admin_set_override got the wrong layer: ${JSON.stringify(ov)}`);
  if (ov.p_item !== firstId) fail(`the override targeted ${ov.p_item}, the card says ${firstId}`);
  if (ov.p_patch?.image !== 'https://upload.wikimedia.org/better.jpg'
      || ov.p_patch?.name !== 'A corrected name') {
    fail(`the patch is wrong: ${JSON.stringify(ov?.p_patch)}`);
  }
  if (!/car park/.test(ov.p_note || '')) fail('the note never reached the server');
  ok('a correction saves the image, the name and the note against the real id');

  await page.waitForTimeout(500);
  if (!(await page.locator('.adminpage-card2.edited').count())) {
    fail('the corrected entry is not marked as edited');
  }
  await page.locator('.adminpage-card2.edited').first().click();
  await page.locator('.adminpage-editorbox').waitFor({ timeout: 10000 });
  if (await page.locator('#ov-image').inputValue() !== 'https://upload.wikimedia.org/better.jpg') {
    fail('the editor does not reopen with the saved correction');
  }
  await page.locator('.adminpage-btn', { hasText: 'Revert to the pipeline' }).click();
  await page.waitForTimeout(1000);
  const rev = state.ovSetCalls[state.ovSetCalls.length - 1];
  if (!rev || Object.keys(rev.p_patch || {}).length !== 0) {
    fail(`revert did not send an empty patch: ${JSON.stringify(rev)}`);
  }
  if (state.overrides.length !== 0) fail('the override survived the revert');
  ok('reverting sends the empty patch that clears the override');
  await page.screenshot({ path: `${SHOTS}/admin-content.png`, fullPage: true });

  // ---- 9. Site section.
  console.log('9. site');
  await gotoSection(page, 'Site');
  await page.locator('.adminpage-maint').waitFor({ timeout: 10000 });

  // Maintenance mode publishes its own shape, and is the one control on this
  // page that turns the app off for everybody, so it reads as dangerous.
  const maintCard = page.locator('.adminpage-maint');
  await maintCard.locator('.adminpage-check input').check();
  await maintCard.locator('.adminpage-textarea').fill('Back within the hour');
  const maintBtn = maintCard.locator('.adminpage-btn');
  if (!/danger/.test(await maintBtn.getAttribute('class'))) {
    fail('closing the app does not read as a destructive action');
  }
  await maintBtn.click();
  await page.waitForTimeout(800);
  const mcfg = state.configCalls.find((c) => c.p_key === 'maintenance');
  if (!mcfg?.p_value?.enabled || !/Back within the hour/.test(mcfg.p_value.message || '')) {
    fail(`the maintenance payload is wrong: ${JSON.stringify(mcfg?.p_value)}`);
  }
  await maintCard.locator('.adminpage-check input').uncheck();
  await maintBtn.click();
  await page.waitForTimeout(800);
  ok('maintenance mode publishes what the gate reads, and reads as dangerous');

  const noticeCard = page.locator('.adminpage-card', { hasText: 'Site notice' });
  await noticeCard.locator('.adminpage-check input').check();
  await noticeCard.locator('.adminpage-textarea').fill('Fares refresh tonight at 02:00');
  await page.locator('.adminpage-seg', { hasText: 'Warning' }).click();
  await page.locator('.adminpage-btn', { hasText: 'Publish notice' }).click();
  await page.locator('.adminpage-btn', { hasText: 'Notice published' }).waitFor({ timeout: 6000 });
  const cfg = state.configCalls.find((c) => c.p_key === 'announcement');
  if (!cfg?.p_value?.enabled || cfg.p_value.tone !== 'warn' || !/02:00/.test(cfg.p_value.text || '')) {
    fail(`the published notice is wrong: ${JSON.stringify(cfg?.p_value)}`);
  }

  await page.locator('.adminpage-lock-input.mono').fill('beta_map');
  await page.locator('.adminpage-btn', { hasText: 'Add flag' }).click();
  const sw = page.locator('.adminpage-switch');
  if (await sw.getAttribute('aria-checked') !== 'false') fail('a new flag is not off by default');
  await sw.click();
  await page.locator('.adminpage-btn', { hasText: 'Publish flags' }).click();
  await page.locator('.adminpage-btn', { hasText: 'Flags published' }).waitFor({ timeout: 6000 });
  const fcfg = state.configCalls.find((c) => c.p_key === 'features');
  if (fcfg?.p_value?.beta_map !== true) fail(`the flags payload is wrong: ${JSON.stringify(fcfg?.p_value)}`);
  ok('the notice and the flags publish exactly what the app reads');
  await page.screenshot({ path: `${SHOTS}/admin-site.png` });

  // ---- 10. Audit section.
  console.log('10. audit');
  await gotoSection(page, 'Audit');
  await page.locator('.adminpage-table').waitFor({ timeout: 10000 });
  if (await page.locator('.adminpage-table tbody tr').count() !== 2) {
    fail('the audit table does not render the stubbed rows');
  }
  if (!/set_tier/.test(await page.locator('.adminpage-table tbody').innerText())) {
    fail('the audit table does not name the action');
  }
  ok('the audit table renders every column');

  // Escape closes the page, like every other overlay.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  if (await page.locator('.adminpage').count()) fail('Escape did not close the page');
  ok('Escape closes the page');
  await ctx.close();

  // ---- 11. A non-admin never sees the door.
  console.log('11. non-admin');
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await ctx2.addInitScript(seedSession(PROJECT_REF, ADMIN));
  const page2 = await ctx2.newPage();
  await stubSupabase(page2, state, { isAdmin: false });
  await page2.goto(`${BASE}/?o=CRL`);
  await page2.locator('.account-avatar-btn').first().waitFor({ timeout: 120000 });
  await openPanel(page2);
  await page2.waitForTimeout(900);
  if (await page2.locator('.account-menu-row', { hasText: 'Admin' }).count()) {
    fail('a non-admin is shown the Admin row');
  }
  if (await page2.locator('.account-menu-row').count() !== 4) fail('the non-admin hub changed shape');
  ok('a non-admin sees the usual hub, nothing more');
  await ctx2.close();

  // ---- 12. The public banner.
  console.log('12. site banner');
  state.siteConfig.announcement = { enabled: true, text: 'Fares refresh tonight at 02:00', tone: 'warn' };
  const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await ctx3.addInitScript(seedSession(PROJECT_REF, null));
  const page3 = await ctx3.newPage();
  await stubSupabase(page3, state);
  await page3.goto(`${BASE}/?o=CRL`);
  const banner = page3.locator('.site-banner');
  await banner.waitFor({ timeout: 60000 });
  if (!/Fares refresh tonight/.test(await banner.innerText())) fail('the banner does not carry the notice text');
  if (!/warn/.test(await banner.getAttribute('class'))) fail('the warn tone did not reach the banner');
  await page3.locator('.site-banner-close').click();
  if (await banner.count()) fail('dismissing the banner did not remove it');
  await page3.reload();
  await page3.waitForTimeout(2500);
  if (await banner.count()) fail('the dismissed banner came back on reload');
  ok('the banner shows, carries its tone, and stays dismissed');
  await ctx3.close();

  // ---- The floor: 380px.
  console.log('13. quality floor');
  const ctx4 = await browser.newContext({ viewport: { width: 380, height: 820 }, isMobile: true, hasTouch: true });
  await ctx4.addInitScript(seedSession(PROJECT_REF, ADMIN));
  const page4 = await ctx4.newPage();
  await stubSupabase(page4, state);
  await page4.goto(`${BASE}/?o=CRL&tab=map`);
  await page4.waitForTimeout(2500);
  const mobileBtn = page4.locator('.mobile-account-btn:visible, .bottom-nav-item:has-text("Account"), .account-avatar-btn:visible').first();
  await mobileBtn.click({ timeout: 30000 });
  await page4.locator('.account-panel').waitFor({ timeout: 15000 });
  await openAdmin(page4);
  await page4.waitForTimeout(600);
  const spill = await page4.evaluate(() => {
    const root = document.querySelector('.adminpage-body');
    if (!root) return { scrolls: false, wide: ['no body'] };
    const wide = [...root.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 50));
    return {
      scrolls: document.documentElement.scrollWidth > window.innerWidth + 1
        || root.scrollWidth > root.clientWidth + 1,
      wide: wide.slice(0, 5),
    };
  });
  if (spill.scrolls) fail(`the admin page scrolls sideways at 380px: ${spill.wide.join(' | ')}`);
  ok('380px: no horizontal scroll on the admin page');
  await page4.screenshot({ path: `${SHOTS}/admin-380.png`, fullPage: true });
  await ctx4.close();

  await browser.close();
  if (process.exitCode !== 1) console.log('verify_admin_panel OK');
} catch (err) {
  fail(err.stack || err.message);
} finally {
  if (srv) {
    srv.kill();
    if (process.platform === 'win32' && srv.pid) {
      try { spawnSync('taskkill', ['/pid', String(srv.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
    }
  }
  process.exit(process.exitCode === 1 ? 1 : 0);
}
