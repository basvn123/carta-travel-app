// Headless check for the admin spoke (2026-08-19, hardened) and the site
// notice banner.
//
// The staff door behind the account hub: user management, the live site
// notice, feature flags, and the audit trail, all through the migration
// 014/015 RPCs. This harness fakes an admin session the same way
// verify_account_panel.mjs fakes a traveller: a session written into the
// storage key supabase-js reads, and every RPC answered locally. Nothing
// touches the real project.
//
// What it checks:
//   1. The hub shows the Admin row to an admin; the spoke opens behind a
//      re-auth lock that refuses a wrong password (real re-auth call) and
//      opens on the right one.
//   2. The service numbers render from admin_stats.
//   3. The site notice editor seeds from site_config and publishes through
//      admin_set_config with exactly the payload the banner reads.
//   4. Feature flags: add one, switch it on, publish booleans-only.
//   5. The user list renders, searches through the RPC (words and exact
//      ids), exports itself as CSV, and opens a detail.
//   6. A pass change picks a tier and days and lands as admin_set_tier.
//   7. The quota reset arms first, fires second.
//   8. Support: the reset mail rides the public recover endpoint AND lands
//      in the trail via admin_mark; suspension arms, takes days, shows the
//      chip, lifts again; a note saves and shows in the history.
//   9. Deletion is armed, retype-gated, refuses a wrong confirmation with
//      the server's own error, and goes through with the right one.
//  10. The audit trail renders what the server returns.
//  11. A non-admin account never sees the row.
//  12. The public banner: shows when enabled, warn tone, dismiss sticks.
// Plus the floor: 44px targets and no sideways scroll at 380px.
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

/** Every RPC the spoke calls, answered locally. `opts.isAdmin` flips the gate. */
async function stubSupabase(page, state, opts = {}) {
  const admin = opts.isAdmin !== false;

  // Re-authentication for the lock: checked for real, like the account
  // panel's own harness does, because the lock is the thing under test.
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
    ? { users: 3, newWeek: 1, newMonth: 2, passesTrip: 1, passesYear: 1, tripPlans: 16, dayPlans: 38, aiToday: 5 }
    : { error: 'forbidden' }));
  await page.route('**/rest/v1/rpc/admin_list_users*', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    state.listCalls.push(body);
    const s = (body.p_search || '').toLowerCase();
    const rows = USERS
      .filter((u) => !state.deleted.has(u.id))
      .filter((u) => !s
        || u.id === s
        || (u.email || '').toLowerCase().includes(s)
        || (u.handle || '').toLowerCase().includes(s)
        || (u.displayName || '').toLowerCase().includes(s))
      .map((u) => ({ ...u, bannedUntil: state.banned.get(u.id) || null }));
    return json(route, { total: rows.length, rows });
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
      periodStart: '2026-08-01', source: 'stripe',
      plansUsed: 12, groundUsed: 3, friends: 2,
      badges: ['icebreaker'], grants: [],
      history: state.history
        .filter((h) => h.user === u.id)
        .map((h, i) => ({ action: h.action, actor: 'owner', detail: h.detail || null, createdAt: '2026-08-19T10:00:00Z', id: i }))
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
  await page.route('**/rest/v1/rpc/admin_get_audit*', (route) => json(route, {
    total: 2,
    rows: [
      { id: 2, action: 'set_tier', actor: 'owner', target: 'zoe_travels', detail: { tier: 'trip' }, createdAt: '2026-08-18T14:00:00Z' },
      { id: 1, action: 'set_config', actor: 'owner', target: null, detail: { key: 'announcement' }, createdAt: '2026-08-17T09:00:00Z' },
    ],
  }));
  // public.site_config. The single-object read (maybeSingle, key=eq.X) is
  // kept for compatibility; the list read feeds both the banner and the
  // spoke's editors.
  await page.route('**/rest/v1/site_config*', (route) => {
    const url = route.request().url();
    if (url.includes('key=eq.')) {
      return json(route, { value: state.siteConfig.announcement });
    }
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

async function unlockSpoke(page) {
  await page.locator('.admin-lock').waitFor({ timeout: 10000 });
  await page.locator('#admin-lock-input').fill(RIGHT_PASSWORD);
  await page.locator('button', { hasText: 'Open admin tools' }).click();
  await page.locator('.admin-stats').waitFor({ timeout: 10000 });
}

try {
  await waitForServer();
  const browser = await chromium.launch();
  const state = {
    reauthAttempts: [], recoverCalls: [],
    listCalls: [], tierCalls: [], quotaCalls: [], deleteCalls: [], configCalls: [],
    banCalls: [], unbanCalls: [], noteCalls: [], markCalls: [],
    deleted: new Set(), tiers: new Map(), banned: new Map(),
    history: [],
    siteConfig: {
      announcement: { enabled: false, text: '', tone: 'info' },
      features: {},
    },
  };

  // ---- 1. The staff door, and the lock in front of it.
  console.log('1. the staff door and the lock');
  const ctx = await browser.newContext({
    viewport: { width: 1360, height: 950 },
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
  await adminRow.click();

  await page.locator('.admin-lock').waitFor({ timeout: 10000 });
  if (await page.locator('.admin-stats').count()) fail('the spoke opened before anybody proved anything');
  await page.locator('#admin-lock-input').fill('not-the-password');
  await page.locator('button', { hasText: 'Open admin tools' }).click();
  await page.waitForTimeout(600);
  if (!(await page.locator('.admin-error').count())) fail('a wrong password unlocked nothing and said nothing');
  if (await page.locator('.admin-stats').count()) fail('a wrong password opened the spoke');
  if (!state.reauthAttempts.includes('not-the-password')) fail('no real re-auth call was made');
  await page.screenshot({ path: `${SHOTS}/admin-lock.png` });
  await page.locator('#admin-lock-input').fill(RIGHT_PASSWORD);
  await page.locator('button', { hasText: 'Open admin tools' }).click();
  await page.locator('.admin-stats').waitFor({ timeout: 10000 });
  if ((await page.locator('.account-heading').innerText()).trim() !== 'Admin') {
    fail('the spoke heading does not say Admin');
  }
  ok('the lock refuses a wrong password by re-auth, and opens on the right one');

  // ---- 2. Service numbers.
  console.log('2. service numbers');
  const statCount = await page.locator('.admin-stat').count();
  if (statCount !== 6) fail(`expected 6 service numbers, found ${statCount}`);
  const firstStat = await page.locator('.admin-stat b').first().innerText();
  if (firstStat.trim() !== '3') fail(`the accounts number reads "${firstStat}", the stub says 3`);
  ok(`${statCount} service numbers, seeded from admin_stats`);

  // ---- 3. The site notice publishes through the RPC.
  console.log('3. site notice');
  const noticeToggle = page.locator('.admin-toggle input');
  if (await noticeToggle.isChecked()) fail('the notice reads as on while site_config says off');
  const publish = page.locator('button', { hasText: 'Publish notice' });
  await noticeToggle.check();
  if (await publish.isEnabled()) fail('an enabled notice with no text is publishable');
  await page.locator('.admin-notice-input').fill('Fares refresh tonight at 02:00');
  await page.locator('.admin-tone-opt', { hasText: 'Warning' }).click();
  await publish.click();
  await page.locator('button', { hasText: 'Notice published' }).waitFor({ timeout: 5000 });
  const cfg = state.configCalls.find((c) => c.p_key === 'announcement');
  if (!cfg) fail('admin_set_config never got the announcement');
  if (!cfg?.p_value?.enabled || cfg.p_value.tone !== 'warn' || !/02:00/.test(cfg.p_value.text || '')) {
    fail(`the published payload is wrong: ${JSON.stringify(cfg?.p_value)}`);
  }
  ok('the notice publishes exactly what the banner will read');

  // ---- 4. Feature flags.
  console.log('4. feature flags');
  await page.locator('.admin-flag-add input').fill('beta_map');
  await page.locator('button', { hasText: 'Add flag' }).click();
  const flagRow = page.locator('.admin-flag-row', { hasText: 'beta_map' });
  if (!(await flagRow.count())) fail('the added flag never appeared');
  const flagToggle = flagRow.locator('.admin-flag-toggle');
  if (await flagToggle.getAttribute('aria-checked') !== 'false') fail('a new flag is not off by default');
  await flagToggle.click();
  if (await flagToggle.getAttribute('aria-checked') !== 'true') fail('the flag toggle does not flip');
  await page.locator('button', { hasText: 'Publish flags' }).click();
  await page.locator('button', { hasText: 'Flags published' }).waitFor({ timeout: 5000 });
  const fcfg = state.configCalls.find((c) => c.p_key === 'features');
  if (!fcfg || fcfg.p_value?.beta_map !== true) {
    fail(`the flags payload is wrong: ${JSON.stringify(fcfg?.p_value)}`);
  }
  ok('a flag is added, switched on, and published as plain booleans');
  await page.screenshot({ path: `${SHOTS}/admin-spoke.png` });

  // ---- 5. The user list: search, id search, CSV, detail.
  console.log('5. users');
  const userRows = page.locator('.admin-user-row');
  if (await userRows.count() !== 3) fail(`expected 3 user rows, found ${await userRows.count()}`);
  if (!(await page.locator('.admin-chip.staff').count())) fail('the staff account carries no staff chip');
  if (!(await page.locator('.admin-chip.trip').count())) fail('the pass holder carries no tier chip');

  const dlPromise = page.waitForEvent('download', { timeout: 15000 });
  await page.locator('.admin-csv-btn').click();
  const dl = await dlPromise;
  if (!/^carta-users-\d{4}-\d{2}-\d{2}\.csv$/.test(dl.suggestedFilename())) {
    fail(`the CSV download is misnamed: ${dl.suggestedFilename()}`);
  }
  ok(`the list exports as ${dl.suggestedFilename()}`);

  await page.locator('.admin-search input').fill('zoe');
  await page.waitForTimeout(700);
  if (await userRows.count() !== 1) fail(`searching "zoe" left ${await userRows.count()} rows`);
  if (!state.listCalls.some((c) => c.p_search === 'zoe')) fail('the search never reached the RPC');
  await page.locator('.admin-search input').fill(USERS[1].id);
  await page.waitForTimeout(700);
  if (await userRows.count() !== 1) fail('a pasted user id did not find its account');
  if (!/marco/.test(await userRows.first().innerText())) fail('the id search found the wrong account');
  ok('the list searches by words and by exact id');

  await page.locator('.admin-search input').fill('zoe');
  await page.waitForTimeout(700);
  await userRows.first().click();
  await page.locator('.admin-facts').waitFor({ timeout: 10000 });
  const facts = await page.locator('.admin-facts').innerText();
  if (!/zoe@example\.com|Zoe/.test(await page.locator('.admin-detail-head').innerText())) {
    fail('the detail head does not name the user');
  }
  if ((await page.locator('.admin-facts > div').count()) < 8) fail('the detail states fewer than 8 facts');
  if (!/4/.test(facts)) fail('the trip plan count never made it into the facts');
  ok('a user opens in full, facts in mono rows');

  // ---- 6. A pass change.
  console.log('6. pass change');
  await page.locator('.admin-tone-opt', { hasText: 'Year' }).click();
  await page.locator('#admin-days').fill('90');
  await page.locator('button', { hasText: 'Apply pass change' }).click();
  await page.waitForTimeout(700);
  const tc = state.tierCalls[0];
  if (!tc || tc.p_tier !== 'year' || tc.p_days !== 90) {
    fail(`admin_set_tier got ${JSON.stringify(tc)}, expected year for 90 days`);
  }
  if (!(await page.locator('.admin-notice-ok').count())) fail('a completed pass change confirms nothing');
  ok('the pass change lands as admin_set_tier(year, 90)');

  // ---- 7. The quota reset arms first.
  console.log('7. quota reset');
  const quotaBtn = page.locator('button', { hasText: /Reset AI allowance|Confirm the reset/ });
  await quotaBtn.click();
  if (state.quotaCalls.length) fail('the quota reset fired on the first press');
  if (!/Confirm/.test(await quotaBtn.innerText())) fail('arming the reset changed nothing');
  await quotaBtn.click();
  await page.waitForTimeout(700);
  if (!state.quotaCalls.length) fail('the confirmed reset never reached the RPC');
  ok('the reset arms on the first press and fires on the second');

  // ---- 8. Support: reset mail, suspension, notes and history.
  console.log('8. support toolkit');
  await page.locator('button', { hasText: 'Email a password reset' }).click();
  await page.waitForTimeout(800);
  if (!state.recoverCalls.some((c) => c.email === 'zoe@example.com')) {
    fail('the reset mail never reached the recover endpoint');
  }
  if (!state.markCalls.some((c) => c.p_action === 'send_reset')) {
    fail('the reset mail left no admin_mark in the trail');
  }
  ok('the reset mail goes out and lands in the trail');

  await page.locator('button', { hasText: 'Suspend sign-in' }).click();
  if (state.banCalls.length) fail('suspension fired without the confirm step');
  await page.locator('#admin-ban-days').fill('7');
  await page.locator('button', { hasText: /^Suspend$/ }).click();
  await page.waitForTimeout(800);
  const bc = state.banCalls[0];
  if (!bc || bc.p_days !== 7) fail(`admin_ban_user got ${JSON.stringify(bc)}, expected 7 days`);
  if (!(await page.locator('.admin-detail-head .admin-chip.banned').count())) {
    fail('a suspended account carries no chip');
  }
  await page.locator('button', { hasText: 'Lift the suspension' }).click();
  await page.waitForTimeout(800);
  if (!state.unbanCalls.length) fail('lifting the suspension never reached the RPC');
  if (await page.locator('.admin-detail-head .admin-chip.banned').count()) {
    fail('the chip survived the lift');
  }
  ok('suspension arms, takes days, shows the chip, and lifts again');

  await page.locator('.admin-note-input').fill('Refunded the June Trip Pass, card was charged twice');
  await page.locator('button', { hasText: 'Save note' }).click();
  await page.waitForTimeout(800);
  if (!state.noteCalls.some((c) => /June Trip Pass/.test(c.p_note || ''))) {
    fail('the note never reached admin_add_note');
  }
  const history = page.locator('.panel-section', { hasText: 'History' }).locator('.admin-audit-row');
  if (!(await history.count())) fail('the history section renders nothing after a note');
  if (!/June Trip Pass/.test((await history.allInnerTexts()).join(' '))) {
    fail('the saved note is not in the history');
  }
  ok('a note saves and shows up in the account history');
  await page.screenshot({ path: `${SHOTS}/admin-detail.png` });

  // ---- 9. Deletion: retype-gated, server-checked.
  console.log('9. deletion');
  await page.locator('.admin-danger-arm').click();
  const confirmField = page.locator('#admin-del-confirm');
  await confirmField.waitFor({ timeout: 5000 });
  const delBtn = page.locator('button', { hasText: 'Delete forever' });
  if (await delBtn.isEnabled()) fail('deletion is live with an empty confirmation');
  await confirmField.fill('wrong@example.com');
  await delBtn.click();
  await page.waitForTimeout(700);
  if (!(await page.locator('.admin-error').count())) fail('a wrong confirmation surfaced no error');
  if (state.deleted.size) fail('a wrong confirmation deleted the account anyway');
  await confirmField.fill('zoe@example.com');
  await delBtn.click();
  await page.locator('.admin-search input').waitFor({ timeout: 10000 });
  if (!state.deleted.has(USERS[0].id)) fail('the right confirmation never deleted');
  await page.locator('.admin-search input').fill('');
  await page.waitForTimeout(700);
  if (await userRows.count() !== 2) fail(`the deleted account still shows: ${await userRows.count()} rows`);
  ok('deletion needs the exact address, and the list drops the account');

  // ---- 10. The audit trail.
  console.log('10. audit trail');
  const auditRows = await page.locator('.panel-section', { hasText: 'Admin log' }).locator('.admin-audit-row').count();
  if (auditRows !== 2) fail(`expected 2 audit rows, found ${auditRows}`);
  ok('the audit trail renders actions and targets');
  await ctx.close();

  // ---- 11. A non-admin never sees the door.
  console.log('11. non-admin');
  const ctx2 = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  await ctx2.addInitScript(seedSession(PROJECT_REF, ADMIN));
  const page2 = await ctx2.newPage();
  await stubSupabase(page2, state, { isAdmin: false });
  await page2.goto(`${BASE}/?o=CRL`);
  await page2.locator('.account-avatar-btn').first().waitFor({ timeout: 120000 });
  await openPanel(page2);
  await page2.waitForTimeout(800);
  if (await page2.locator('.account-menu-row', { hasText: 'Admin' }).count()) {
    fail('a non-admin is shown the Admin row');
  }
  const helpRows = await page2.locator('.account-menu-row').count();
  if (helpRows !== 4) fail(`the non-admin hub has ${helpRows} menu rows, expected the usual 4`);
  ok('a non-admin sees the usual hub, nothing more');
  await ctx2.close();

  // ---- 12. The public banner.
  console.log('12. site banner');
  state.siteConfig.announcement = { enabled: true, text: 'Fares refresh tonight at 02:00', tone: 'warn' };
  const ctx3 = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  await ctx3.addInitScript(seedSession(PROJECT_REF, null));
  const page3 = await ctx3.newPage();
  await stubSupabase(page3, state);
  await page3.goto(`${BASE}/?o=CRL`);
  const banner = page3.locator('.site-banner');
  await banner.waitFor({ timeout: 60000 });
  if (!/Fares refresh tonight/.test(await banner.innerText())) fail('the banner does not carry the notice text');
  if (!/warn/.test(await banner.getAttribute('class'))) fail('the warn tone did not reach the banner');
  await page3.screenshot({ path: `${SHOTS}/site-banner.png` });
  await page3.locator('.site-banner-close').click();
  if (await banner.count()) fail('dismissing the banner did not remove it');
  await page3.reload();
  await page3.waitForTimeout(2500);
  if (await banner.count()) fail('the dismissed banner came back on reload');
  ok('the banner shows, carries its tone, and stays dismissed');
  await ctx3.close();

  // ---- The floor: 380px, no sideways scroll on the spoke.
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
  await page4.locator('.account-menu-row', { hasText: 'Admin' }).click();
  await unlockSpoke(page4);
  await page4.waitForTimeout(500);
  const spill = await page4.locator('.account-panel').evaluate((root) => {
    const wide = [...root.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().right > root.clientWidth + 1)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 50));
    return { scrolls: root.scrollWidth > root.clientWidth + 1, wide: wide.slice(0, 5) };
  });
  if (spill.scrolls) fail(`the admin spoke scrolls sideways at 380px: ${spill.wide.join(' | ')}`);
  ok('380px: no horizontal scroll on the admin spoke');
  await page4.screenshot({ path: `${SHOTS}/admin-spoke-380.png`, fullPage: true });
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
