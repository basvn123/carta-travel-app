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
//   7b. MFA (T254): ban and delete stay disabled on an aal1 session; the
//      step-up enrols a TOTP factor, refuses a wrong code, and the aal2
//      token it gets is the one the ban and delete RPCs see (their stubs
//      refuse anything below aal2, the way migration 032 does).
//   8. Deletion is armed, retype-gated, refuses a wrong confirmation with
//      the server's own error, and goes through with the right one.
//   8d. Content: the layer loads from the real wire file, an http image is
//      refused a preview, a correction saves, and reverting clears it.
//   8e. Review lifecycle (T074): an overdue override from another layer is
//      named above the grid, a save carries status, review date and reason,
//      a too-short reason is refused before any call, and a card whose
//      override has passed its date is marked overdue.
//   8b3. Margin: money renders as euros, the tiers stay apart, the gap
//      against the EUR 6.85 assumption is stated, the reconciliation line
//      says the ledger is still modelled, and the month selector refetches.
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

const PORT = Number(process.env.CARTA_PORT) || Number(process.env.VERIFY_PORT) || 4192;
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

// The moderation queues (T067 to T070): public guides, DSA reports against
// them, and owners' complaints about takedowns. seedModeration() puts them
// back to a known state, so the 380px pass at the end starts with rows.
const seedModeration = (state) => {
  state.guidesFail = false; state.reportsFail = false;
  state.guideCalls = 0; state.reportCalls = []; state.complaintCalls = [];
  state.unpublishCalls = []; state.unpublishMode = 'ok';
  state.dismissCalls = []; state.decideCalls = []; state.decideRefuse = null;
  state.guides = [
    {
      id: 'plan-g1', label: 'Porto in four days', cities: ['Porto', 'Lisbon'],
      userId: USERS[0].id, handle: 'zoe_travels', displayName: 'Zoe Martens', avatarEmoji: null,
      email: 'zoe@example.com', publishedAt: '2026-08-10T10:00:00Z', views: 0, inGallery: true,
    },
    {
      id: 'plan-g2', label: '', cities: ['Split'],
      userId: USERS[1].id, handle: null, displayName: null, avatarEmoji: null,
      email: 'marco@example.com', publishedAt: '2026-08-12T10:00:00Z', views: 0, inGallery: false,
    },
  ];
  const owner = { ownerId: USERS[0].id, ownerHandle: 'zoe_travels', ownerEmail: 'zoe@example.com' };
  state.reports = [
    {
      id: 'r1', status: 'new', planId: 'plan-g1', planLabel: 'Porto in four days', currentLabel: 'Porto in four days',
      planExists: true, reason: 'This copies a chapter of a published book.', createdAt: '2026-08-18T10:00:00Z',
      reporterHandle: null, contactEmail: 'reporter@example.com', planTotal: 1, sourceTotal: 1,
      decidedAt: null, decidedByHandle: null, decisionNote: null, ...owner,
    },
    {
      id: 'r2', status: 'new', planId: 'plan-gone', planLabel: 'Old Rome trip', currentLabel: 'Old Rome trip',
      planExists: true, reason: 'A bad review of a hostel.', createdAt: '2026-08-17T10:00:00Z',
      reporterHandle: 'someone', contactEmail: null, planTotal: 2, sourceTotal: 1,
      decidedAt: null, decidedByHandle: null, decisionNote: null, ...owner,
    },
    {
      id: 'r3', status: 'actioned', planId: 'plan-old', planLabel: 'Taken down earlier', currentLabel: 'Taken down earlier',
      planExists: true, reason: 'Earlier notice.', createdAt: '2026-08-01T10:00:00Z',
      reporterHandle: null, contactEmail: null, planTotal: 1, sourceTotal: 1,
      decidedAt: '2026-08-02T10:00:00Z', decidedByHandle: 'owner', decisionNote: 'Copied text.', ...owner,
    },
  ];
  const base = {
    planExists: true, ownerId: USERS[0].id, ownerHandle: 'zoe_travels', ownerEmail: 'zoe@example.com',
    decidedByHandle: 'owner', createdAt: '2026-08-15T10:00:00Z', source: 'notice', noticeCount: 2,
    complaintAt: '2026-08-19T10:00:00Z', complaintStatus: 'open',
    complaintDecidedByHandle: null, complaintDecidedAt: null, complaintNote: null, reinstated: false,
  };
  state.complaints = [
    { ...base, statementId: 's1', planLabel: 'Lisbon food guide', facts: 'Taken down for copied text.', complaintBody: 'The text is my own blog post.', unchanged: true },
    { ...base, statementId: 's2', planLabel: 'Algarve loop', facts: 'Taken down for a private address.', complaintBody: 'I removed the address already.', unchanged: false, source: 'own' },
  ];
};

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

// A token supabase-js can decode. The signature is never checked client side.
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeJwt = (claims) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}.sig`;
const GOOD_CODE = '123456';
const tokenAal = (route) => {
  const tok = (route.request().headers().authorization || '').replace(/^Bearer /, '');
  try { return JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString()).aal || null; } catch { return null; }
};
// What migration 032 raises for a session below aal2.
const mfaRefusal = (route) => route.fulfill({
  status: 403, contentType: 'application/json',
  body: JSON.stringify({ code: '42501', message: 'MFA required for this action', hint: 'mfa_required', details: null }),
});

async function stubSupabase(page, state, opts = {}) {
  const admin = opts.isAdmin !== false;
  // T062-g: every shot waits for the fonts and lets the last paint settle, and
  // the page stops its own transitions, so two runs of the same tree give the
  // same pixels. (Contexts also ask for reduced motion.)
  await page.addInitScript(() => {
    const css = document.createElement('style');
    css.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(css));
  });
  const rawShot = page.screenshot.bind(page);
  page.screenshot = async (o) => {
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.waitForTimeout(300);
    return rawShot(o);
  };

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
  // MFA: the user carries its factors; enrol, challenge and verify behave
  // like GoTrue, and a verified code returns an aal2 session.
  await page.route('**/auth/v1/user*', (route) => json(route, { ...ADMIN, factors: state.mfa.factors }));
  await page.route(/\/auth\/v1\/factors/, (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const body = JSON.parse(req.postData() || '{}');
    if (req.method() === 'DELETE') {
      state.mfa.factors = state.mfa.factors.filter((f) => !path.endsWith(f.id));
      return json(route, {});
    }
    if (/\/factors$/.test(path)) {
      const id = `factor-${state.mfa.enrolCalls.length + 1}`;
      state.mfa.enrolCalls.push(body);
      state.mfa.factors.push({ id, factor_type: 'totp', status: 'unverified', friendly_name: body.friendly_name });
      return json(route, {
        id, type: 'totp', friendly_name: body.friendly_name,
        totp: {
          qr_code: '<svg xmlns="http://www.w3.org/2000/svg" width="168" height="168"><rect width="168" height="168" fill="#000"/></svg>',
          secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/Carta:owner@example.com?secret=JBSWY3DPEHPK3PXP',
        },
      });
    }
    if (/\/challenge$/.test(path)) {
      return json(route, { id: 'challenge-1', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 });
    }
    if (/\/verify$/.test(path)) {
      state.mfa.verifyCalls.push(body);
      if (body.code !== GOOD_CODE) {
        return route.fulfill({
          status: 422, contentType: 'application/json',
          body: JSON.stringify({ code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' }),
        });
      }
      const fid = path.split('/').slice(-2)[0];
      state.mfa.factors = state.mfa.factors.map((f) => (f.id === fid ? { ...f, status: 'verified' } : f));
      const exp = Math.floor(Date.now() / 1000) + 3600;
      return json(route, {
        access_token: fakeJwt({ sub: ADMIN.id, role: 'authenticated', aal: 'aal2', exp }),
        token_type: 'bearer', expires_in: 3600, expires_at: exp,
        refresh_token: 'stub-refresh-aal2', user: { ...ADMIN, factors: state.mfa.factors },
      });
    }
    return route.continue();
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
    if (tokenAal(route) !== 'aal2') { state.mfa.refused.push('ban'); return mfaRefusal(route); }
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
    if (tokenAal(route) !== 'aal2') { state.mfa.refused.push('delete'); return mfaRefusal(route); }
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
  // The AI usage rollup (migration 030). Stubbed with a shape that exercises
  // every branch of the section at once: a day that reached the cap, ground
  // spend well under plan spend, refusals of both kinds and across two tiers,
  // and a heaviest-account list ranked on ground rather than on plan.
  //
  // The daily series is exactly 28 rows on purpose. The analytics check above
  // counts .adminpage-sparkbar across the whole overview, so a second chart
  // with a different length would break a check that has nothing to do with
  // this section.
  await page.route('**/rest/v1/rpc/admin_ai_usage*', (route) => json(route, {
    days: 30,
    globalCap: 200,
    today: 143,
    daysAtCap: 1,
    peakDay: { day: '2026-08-19', n: 200 },
    daily: Array.from({ length: 28 }, (_, i) => ({
      day: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
      n: i === 18 ? 200 : 40 + (i % 7) * 9,
      pct: 0,
    })),
    plan: { units: 412, users: 31 },
    ground: { units: 57, users: 6 },
    cache: { lookups: 300, hits: 111, rate: 37.0 },
    rejections: {
      userCap: 24, globalCap: 3,
      userCapPlan: 21, userCapGround: 3,
      globalCapPlan: 2, globalCapGround: 1,
    },
    rejectionsByTier: [
      { tier: 'free', userCap: 21, globalCap: 0 },
      { tier: 'year', userCap: 3, globalCap: 3 },
    ],
    topUsers: [
      { userId: 'u-1', email: 'heavy@example.com', tier: 'year', plan: 41, ground: 27 },
      { userId: 'u-2', email: 'mid@example.com', tier: 'trip', plan: 90, ground: 4 },
    ],
  }));
  // The margin dashboard (migration 031). The figures are the ones the real
  // RPC returned on the seeded test container in T043, so a change to the
  // arithmetic in 031 that this harness does not follow shows up as a failing
  // string rather than as a plausible wrong number.
  //
  // The month offset is honoured, because the selector is the part of this
  // section most likely to break: a picker that always shows the same month
  // is indistinguishable from a working one unless the stub answers
  // differently.
  await page.route('**/rest/v1/rpc/admin_margin*', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const back = body.p_months_back == null ? 1 : body.p_months_back;
    return json(route, {
      month: back >= 2 ? '2026-07' : (back === 1 ? '2026-08' : '2026-09'),
      monthsBack: back,
      closed: back > 0,
      currency: 'eur',
      assumedContributionCents: 685,
      sales: {
        count: 10,
        grossCents: 9390,
        byTier: [
          { tier: 'trip', count: 7, grossCents: 4893 },
          { tier: 'year', count: 3, grossCents: 4497 },
        ],
        excludedNoAmount: 1,
        excludedCurrency: 1,
        unknownCountry: 0,
        nonEu: 1,
      },
      vat: { cents: 1630, basis: 'belgium_21', ossBreached: false, inclusive: true },
      stripe: {
        cents: 438, basis: 'modelled',
        rateEea: '1.5% + EUR 0.25', rateOther: '2.9% + EUR 0.25', tax: '0.5%',
      },
      netReceiptsCents: 7323,
      ai: {
        planUnits: 116, groundUnits: 71,
        planCents: 116, groundCents: 355, cents: 471,
        planPrice: 1.0, groundPrice: 5.0,
        basis: 'units observed, price modelled',
        dailyTotalUnits: 333,
      },
      infra: {
        cents: 879, actualRows: 0, modelledRows: 7,
        reconciled: false, perPurchaseCents: 87.9,
        items: [
          { item: 'hetzner_cax11', cents: 599, source: 'model', note: 'Always-on pipeline box' },
          { item: 'r2_storage', cents: 180, source: 'model', note: 'Cloudflare R2 at Tier 0' },
          { item: 'domain', cents: 100, source: 'model', note: 'One domain' },
        ],
      },
      contribution: {
        perPurchaseCents: 597.25, totalCents: 5973,
        assumedCents: 685, deltaCents: -87.75, deltaPct: -12.8,
      },
    });
  });
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
    if (state.fbFail) return json(route, { error: 'slow_down' });
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
      rows: state.overrides.map((o) => ({ ...o, overdue: new Date(o.reviewBy).getTime() < Date.now() })),
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
    // Migration 043: the reason is kept when none is sent, as the server does.
    const prev = i >= 0 ? state.overrides[i] : null;
    const reason = body.p_note || prev?.authorNote || null;
    const row = {
      layer: body.p_layer, itemId: body.p_item, patch: body.p_patch, note: reason,
      status: body.p_status, reviewBy: body.p_review_by, authorNote: reason,
      updatedAt: '2026-08-20T12:00:00Z', by: 'owner',
    };
    if (i >= 0) state.overrides[i] = row; else state.overrides.push(row);
    return json(route, { ok: true });
  });
  // T076-a: the override tests replace a photo with this URL. It answers with
  // a real 1x1 PNG, so the diff viewer's "after" cell has something to paint.
  await page.route('**/upload.wikimedia.org/better.jpg', (route) => route.fulfill({
    status: 200, contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
  }));
  await page.route('**/rest/v1/rpc/admin_list_public_guides*', (route) => {
    state.guideCalls += 1;
    if (state.guidesFail) return json(route, { error: 'could not find the function public.admin_list_public_guides' });
    return json(route, { total: state.guides.length, viewsCounted: false, rows: state.guides });
  });
  await page.route('**/rest/v1/rpc/admin_list_content_reports*', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    // The Overview's waiting-count read (limit 1) is not a Reports tab load.
    if (body.p_limit !== 1) state.reportCalls.push(body);
    if (state.reportsFail) return json(route, { error: 'could not find the function public.admin_list_content_reports' });
    const live = state.reports.map((r) => ({ ...r, stillPublic: state.guides.some((g) => g.id === r.planId) }));
    const rows = live.filter((r) => !body.p_status || r.status === body.p_status);
    return json(route, { total: rows.length, new: live.filter((r) => r.status === 'new').length, rows });
  });
  await page.route('**/rest/v1/rpc/admin_unpublish_guide*', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    state.unpublishCalls.push(body);
    if (state.unpublishMode !== 'ok') return json(route, { error: state.unpublishMode });
    const had = state.guides.some((g) => g.id === body.p_plan_id);
    state.guides = state.guides.filter((g) => g.id !== body.p_plan_id);
    let n = 0;
    state.reports.forEach((r) => {
      if (r.planId === body.p_plan_id && r.status === 'new') {
        r.status = 'actioned'; r.decidedAt = '2026-08-20T10:00:00Z'; r.decidedByHandle = 'owner'; r.decisionNote = body.p_reason; n += 1;
      }
    });
    return json(route, { ok: true, changed: had, visibility: 'private', reportsActioned: n, statementId: 'st-new' });
  });
  await page.route('**/rest/v1/rpc/admin_dismiss_content_report*', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    state.dismissCalls.push(body);
    const r = state.reports.find((x) => x.id === body.p_report_id);
    if (r) { r.status = 'dismissed'; r.decidedAt = '2026-08-20T10:00:00Z'; r.decidedByHandle = 'owner'; r.decisionNote = body.p_reason; }
    return json(route, { ok: true, changed: !!r, status: 'dismissed' });
  });
  await page.route('**/rest/v1/rpc/admin_list_moderation_complaints*', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    state.complaintCalls.push(body);
    const rows = state.complaints.filter((c) => !body.p_status || c.complaintStatus === body.p_status);
    return json(route, { total: rows.length, open: state.complaints.filter((c) => c.complaintStatus === 'open').length, rows });
  });
  await page.route('**/rest/v1/rpc/admin_decide_complaint*', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    state.decideCalls.push(body);
    if (state.decideRefuse) { const e = state.decideRefuse; state.decideRefuse = null; return json(route, { error: e }); }
    const c = state.complaints.find((x) => x.statementId === body.p_statement_id);
    if (!c) return json(route, { error: 'not_found' });
    c.complaintStatus = body.p_outcome; c.complaintDecidedByHandle = 'owner';
    c.complaintDecidedAt = '2026-08-20T10:00:00Z'; c.complaintNote = body.p_reason;
    c.reinstated = body.p_outcome === 'reversed' && c.unchanged;
    return json(route, { ok: true, changed: true, outcome: body.p_outcome, reinstated: c.reinstated });
  });
  await page.route('**/rest/v1/rpc/admin_get_audit*', (route) => json(route, {
    total: 2,
    rows: [
      { id: 2, action: 'set_tier', actor: 'owner', target: 'zoe_travels', detail: { tier: 'trip' }, createdAt: '2026-08-18T14:00:00Z' },
      // T270: a config change carries previous and new, shown side by side.
      {
        id: 1, action: 'set_config', actor: 'owner', target: null,
        detail: {
          key: 'announcement',
          previous: { exists: true, value: { enabled: false, text: 'OLD-TEXT-MARKER' } },
          new: { exists: true, value: { enabled: true, text: 'NEW-TEXT-MARKER' } },
        },
        createdAt: '2026-08-17T09:00:00Z',
      },
    ],
  }));
  // T270: the 045 admin reads and the guide pages.
  await page.route('**/rest/v1/rpc/admin_list_config*', (route) => json(route, {
    rows: [
      { key: 'announcement', value: {}, public: true, required: true, updatedAt: null, by: null },
      { key: 'beta_banner', value: {}, public: state.betaPublic, required: false, updatedAt: null, by: 'owner' },
    ],
  }));
  await page.route('**/rest/v1/rpc/admin_set_config_public*', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    state.pubCalls.push(body);
    if (body.p_key === 'beta_banner') state.betaPublic = body.p_public;
    return json(route, { ok: true, changed: true });
  });
  // Registered after the moderation fixture above: it only answers while
  // guideBulk is on (the 130-row paging check), else it falls through.
  await page.route('**/rest/v1/rpc/admin_list_public_guides*', (route) => {
    if (!state.guideBulk) return route.fallback();
    const body = JSON.parse(route.request().postData() || '{}');
    state.guidePages.push(body);
    const off = body.p_offset || 0;
    const lim = body.p_limit || 100;
    const all = Array.from({ length: 130 }, (_, n) => ({
      id: `g${n}`, label: `Guide ${n}`, userId: USERS[0].id, email: 'zoe@example.com',
      handle: 'zoe_travels', displayName: 'Zoe', avatarEmoji: null, inGallery: true,
      publishedAt: '2026-08-01T10:00:00Z', views: n, cities: ['Porto'],
    }));
    return json(route, {
      total: all.length, limit: lim, offset: off, viewsCounted: true, rows: all.slice(off, off + lim),
    });
  });
  await page.route('**/rest/v1/rpc/admin_parse_failures*', (route) => json(route, {
    days: 7, retentionDays: 30, total: 6, users: 3,
    byKind: [{ kind: 'pdf', n: 4, users: 2 }, { kind: 'url', n: 2, users: 1 }],
    byCheck: [{ check: 'json_parse', n: 5, users: 3 }, { check: 'empty_result', n: 1, users: 1 }],
    daily: [{ day: '2026-09-30', n: 2 }, { day: '2026-10-01', n: 4 }],
  }));
  await page.route('**/rest/v1/rpc/admin_oss_threshold*', (route) => json(route, {
    thresholdCents: 1000000, years: [], currentYear: 2026, currentCents: 289700,
    currentPct: 29.0, breached: false, unknownCountry: 2, unknownAmount: 0,
    currencies: [{ currency: 'eur', sales: 12 }],
  }));
  // T270's count-badge stub for admin_list_content_reports is dropped: the T266
  // moderation fixture above already returns new: 2 and records its calls.
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
  await page.locator('.account-nav:visible', { hasText: 'Admin' }).click();
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
    mfa: { factors: [], enrolCalls: [], verifyCalls: [], refused: [] },
    history: [], missing: ['day_plans'], listFails: false,
    fbCalls: [], fbStatusCalls: [], submitCalls: [],
    ovListCalls: [], ovSetCalls: [],
    pubCalls: [], guidePages: [], guideBulk: false, betaPublic: false, fbFail: false,
    // One override already past its review date, in a layer the grid does
    // not open on, so the review list is the only place it can surface.
    overrides: [{
      layer: 'lake', itemId: 'lac-overdue-t074', patch: { name: 'Lac du Test' },
      note: 'pipeline swapped two lake names', status: 'temporary',
      reviewBy: '2026-01-01T12:00:00Z', authorNote: 'pipeline swapped two lake names',
      updatedAt: '2025-12-01T12:00:00Z', by: 'owner',
    }],
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
  seedModeration(state);

  // ---- 1. The door and the lock.
  console.log('1. the door and the lock');
  const ctx = await browser.newContext({
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 960 },
    acceptDownloads: true,
  });
  await ctx.addInitScript(seedSession(PROJECT_REF, ADMIN));
  const page = await ctx.newPage();
  await stubSupabase(page, state);
  await page.goto(`${BASE}/?o=CRL`);
  await page.locator('.account-avatar-btn').first().waitFor({ timeout: 120000 });
  await openPanel(page);
  const adminRow = page.locator('.account-nav:visible', { hasText: 'Admin' });
  await adminRow.waitFor({ timeout: 10000 });
  // 44px is the THUMB floor, and this context is a 1360px window driven by a
  // pointer: the row lives in the account page's left panel here, sized like
  // every other row in it. The phone copy of the same door is the hub menu
  // row, which .account-menu-row still holds at 52px.
  const rowBox = await adminRow.boundingBox();
  if (!rowBox || rowBox.height < 32) fail(`the Admin row is ${rowBox?.height}px tall`);

  await openAdmin(page, { unlock: false });
  if (await page.locator('.account-panel').count()) fail('the account panel stayed open behind the page');
  if (await page.locator('.adminpage-tiles').count()) fail('the page opened before anybody proved anything');
  await page.locator('#admin-lock-input').fill('not-the-password');
  await page.locator('button', { hasText: 'Open admin tools' }).click();
  await page.waitForTimeout(700);
  if (!(await page.locator('.adminpage-err').count())) fail('a wrong password unlocked nothing and said nothing');
  if (await page.locator('.adminpage-tiles').count()) fail('a wrong password opened the page');
  if (!state.reauthAttempts.includes('not-the-password')) fail('no real re-auth call was made');
  await page.screenshot({ animations: 'disabled', path: `${SHOTS}/admin-lock.png` });
  await page.locator('#admin-lock-input').fill(RIGHT_PASSWORD);
  await page.locator('button', { hasText: 'Open admin tools' }).click();
  await page.locator('.adminpage-tiles').first().waitFor({ timeout: 15000 });
  ok('the lock refuses a wrong password by re-auth, and opens the page on the right one');

  // ---- 2. Overview, including what the database is missing.
  console.log('2. overview');
  // The waiting-counts strip (.adminpage-attention) can land first; the eight
  // stat tiles are the other .adminpage-tiles block.
  const statTiles = page.locator('.adminpage-tiles:not(.adminpage-attention)').first();
  await statTiles.waitFor({ timeout: 15000 });
  const tiles = await statTiles.locator('.adminpage-tile').count();
  if (tiles !== 8) fail(`expected 8 tiles, found ${tiles}`);
  if ((await statTiles.locator('.adminpage-tile b').first().innerText()).trim() !== '3') {
    fail('the accounts tile does not carry the stubbed count');
  }
  const warn = page.locator('.adminpage-warn');
  if (!(await warn.count())) fail('a missing table is not reported anywhere');
  if (!/day_plans/.test(await warn.first().innerText())) {
    fail(`the warning does not name the missing table: ${await warn.first().innerText()}`);
  }
  ok(`${tiles} tiles, and the missing table is named on screen`);
  await page.screenshot({ animations: 'disabled', path: `${SHOTS}/admin-overview.png` });

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
  await page.screenshot({ animations: 'disabled', path: `${SHOTS}/admin-users.png` });

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

  // ---- 7b. The MFA step-up in front of ban (T254).
  console.log('7b. MFA step-up');
  const suspendBtn = page.locator('.adminpage-btn', { hasText: /^Suspend$/ });
  const enrolBtn = page.locator('.adminpage-mfa .adminpage-btn', { hasText: 'Set up an authenticator app' });
  await enrolBtn.waitFor({ timeout: 5000 });
  if (await suspendBtn.isEnabled()) fail('Suspend is live on an aal1 session');
  await enrolBtn.click();
  const qr = page.locator('.adminpage-mfa-qr');
  await qr.waitFor({ timeout: 5000 });
  if (state.mfa.enrolCalls.length !== 1) fail(`expected one enrol call, got ${state.mfa.enrolCalls.length}`);
  if (!(await qr.evaluate((img) => img.complete && img.naturalWidth > 0))) fail('the QR code image does not decode');
  if (!/JBSWY3DPEHPK3PXP/.test(await page.locator('.adminpage-mfa-secret').innerText())) {
    fail('the TOTP secret is not shown for manual entry');
  }
  const codeField = page.locator('#admin-ban-mfa-code');
  await codeField.fill('12a3');
  if ((await codeField.inputValue()) !== '123') fail('the code field kept a non-digit');
  await codeField.fill('000000');
  await page.locator('.adminpage-mfa .adminpage-btn', { hasText: 'Verify code' }).click();
  await page.locator('.adminpage-mfa .adminpage-err', { hasText: 'That code did not work' }).waitFor({ timeout: 5000 });
  if (await suspendBtn.isEnabled()) fail('a wrong code enabled Suspend');
  await page.screenshot({ animations: 'disabled', path: `${SHOTS}/admin-mfa-enrol.png` });
  await codeField.fill(GOOD_CODE);
  await page.locator('.adminpage-mfa .adminpage-btn', { hasText: 'Verify code' }).click();
  await page.locator('.adminpage-mfa').waitFor({ state: 'detached', timeout: 5000 });
  if (!(await suspendBtn.isEnabled())) fail('Suspend stayed disabled after a good code');
  if (!state.mfa.factors.some((f) => f.status === 'verified')) fail('the factor was never verified');
  ok('ban waits for MFA: enrol, a wrong code refused, a right code steps the session up');
  await page.locator('#admin-ban-days').fill('7');
  await page.locator('.adminpage-btn', { hasText: /^Suspend$/ }).click();
  await page.waitForTimeout(900);
  if (state.banCalls[0]?.p_days !== 7) fail(`admin_ban_user got ${JSON.stringify(state.banCalls[0])}`);
  if (state.mfa.refused.length) fail(`the ban RPC saw a token below aal2: ${state.mfa.refused.join(', ')}`);
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
  await page.screenshot({ animations: 'disabled', path: `${SHOTS}/admin-detail.png` });

  // ---- 8. Deletion.
  console.log('8. deletion');
  await page.locator('.adminpage-btn.danger', { hasText: 'Delete this account' }).click();
  const confirmField = page.locator('#admin-del-confirm');
  await confirmField.waitFor({ timeout: 5000 });
  const delBtn = page.locator('.adminpage-btn', { hasText: 'Delete forever' });
  if (await page.locator('.adminpage-mfa').count()) fail('delete asks for MFA again on an aal2 session');
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
  if (state.mfa.refused.length) fail(`an RPC saw a token below aal2: ${state.mfa.refused.join(', ')}`);
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
  // Scoped to the Signups card. The overview grew a second chart when the AI
  // usage rollup landed, and an unscoped .adminpage-spark now matches both, so
  // these counts have to name the card they belong to or they silently start
  // measuring the wrong section.
  const signupsCard = page.locator('.adminpage-card', { hasText: 'Signups' }).first();
  await signupsCard.locator('.adminpage-spark').waitFor({ timeout: 10000 });
  const bars = await signupsCard.locator('.adminpage-sparkbar').count();
  if (bars !== 28) fail(`the signups chart has ${bars} bars, expected 28`);
  const provs = await page.locator('.adminpage-card', { hasText: 'How they sign in' })
    .first().locator('.adminpage-bars li').allInnerTexts();
  if (!provs.some((s) => /google/.test(s)) || !provs.some((s) => /email/.test(s))) {
    fail(`the provider split is missing a row: ${JSON.stringify(provs)}`);
  }
  const ranks = await page.locator('.adminpage-rank').first().innerText();
  if (!/Lisbon/.test(ranks)) fail('the most-planned destinations list is empty');
  // The chart must never be the only way to read the number.
  if (!/28 days/.test(await signupsCard.innerText())) {
    fail('the signups chart states no total in words');
  }
  ok(`${bars} days of signups, the provider split, and the destination ranking`);
  await page.screenshot({ animations: 'disabled', path: `${SHOTS}/admin-analytics.png`, fullPage: true });

  // ---- 8b2. The AI usage rollup.
  // The point of the section is that plan and ground are never added
  // together and that a refusal by a user cap is never added to a refusal by
  // the shared one. So the checks are about separation, not about totals: if
  // any of these four figures ever merged into one, the section would have
  // stopped answering the question it exists for.
  console.log('8b2. AI usage rollup');
  const aiCard = page.locator('.adminpage-card', { hasText: 'AI usage (30 days)' }).first();
  await aiCard.waitFor({ timeout: 10000 });
  const aiText = await aiCard.innerText();
  // innerText collapses the tile's number and its label onto separate lines,
  // so the check is on the pair appearing together rather than on exact
  // whitespace. A tile that lost its number would still fail.
  const aiFlat = aiText.replace(/\s+/g, ' ');
  for (const [label, want] of [
    ['plan units', '412 Plan units, 31 accounts'],
    ['ground units', '57 Ground units, 6 accounts'],
    ['own-cap refusals', '24 Refused by their own cap'],
    ['shared-cap refusals', '3 Refused by the shared cap'],
    ['days at cap', '1 Days that reached the cap'],
  ]) {
    if (!aiFlat.includes(want)) {
      fail(`the AI usage section does not separate ${label}: ${aiFlat.slice(0, 400)}`);
    }
  }
  // The cap the percentages were computed against has to be on screen, because
  // the real one lives in the Edge Function environment where SQL cannot see it.
  if (!aiFlat.includes('143 Units today of 200 assumed cap')) {
    fail('the daily figure does not name the ceiling it is measured against');
  }
  // Heaviest accounts are ranked on ground, so the account with fewer plans
  // but more grounded searches must come first.
  const aiRows = await aiCard.locator('.adminpage-table-static tbody tr').allInnerTexts();
  if (aiRows.length !== 2) fail(`the heaviest-accounts table has ${aiRows.length} rows, expected 2`);
  if (!/heavy@example\.com/.test(aiRows[0])) {
    fail(`the heaviest-accounts table is not ranked on ground: ${JSON.stringify(aiRows)}`);
  }
  ok('AI usage: plan and ground stay apart, both refusal kinds counted, ground ranks the table');
  await page.screenshot({ animations: 'disabled', path: `${SHOTS}/admin-ai-usage.png`, fullPage: true });

  // ---- 8b3. The margin dashboard.
  // The point of the section is the comparison against the EUR 6.85 the unit
  // economics document assumes, and the reconciliation line that says whether
  // the infrastructure figure came off an invoice or out of the model. So the
  // checks are: the money reaches the screen as euros and not as raw cents,
  // the two tiers stay apart, the reconciliation says not invoiced while the
  // ledger is modelled, and the month selector actually moves the month.
  console.log('8b3. margin dashboard');
  const mgCard = page.locator('.adminpage-card', { hasText: 'Margin, 2026-08' }).first();
  await mgCard.waitFor({ timeout: 10000 });
  const mgFlat = (await mgCard.innerText()).replace(/\s+/g, ' ');
  for (const [label, want] of [
    ['the pass count', '10 Passes sold'],
    ['net receipts', '73.23 Net receipts'],
    ['contribution per purchase', '5.97 Contribution per purchase'],
    ['the assumption it is measured against', '6.85 The model assumes'],
    ['plan units and their cost', '116 Plan units'],
    ['ground units and their cost', '71 Ground units'],
  ]) {
    if (!mgFlat.includes(want)) {
      fail(`the margin section is missing ${label}: ${mgFlat.slice(0, 500)}`);
    }
  }
  // Money must never reach the screen as a bare cent count.
  if (!/€\s?73\.23|EUR\s?73\.23/.test(mgFlat)) {
    fail('net receipts are not formatted as a currency');
  }
  // The difference against the model has to be on screen in both units, or
  // the section is a set of figures rather than a verdict.
  if (!/-12\.8 percent/.test(mgFlat)) {
    fail(`the margin section does not state the gap in percent: ${mgFlat.slice(0, 500)}`);
  }
  // The reconciliation line, which is the done condition for T043. While the
  // ledger is modelled it must say so rather than show a zero difference.
  if (!/not invoiced/.test(mgFlat)) {
    fail('the reconciliation line does not say the ledger is still modelled');
  }
  const mgTiers = await mgCard.locator('.adminpage-table-static').first()
    .locator('tbody tr').allInnerTexts();
  if (mgTiers.length !== 2) fail(`the tier table has ${mgTiers.length} rows, expected 2`);
  if (!/trip/.test(mgTiers[0]) || !/year/.test(mgTiers[1])) {
    fail(`the tier table lost its split: ${JSON.stringify(mgTiers)}`);
  }
  // The month selector has to refetch, not just relabel.
  await mgCard.locator('button', { hasText: 'Earlier month' }).click();
  await page.locator('.adminpage-card', { hasText: 'Margin, 2026-07' })
    .first().waitFor({ timeout: 10000 });
  await page.locator('.adminpage-card', { hasText: 'Margin, 2026-07' })
    .first().locator('button', { hasText: 'Later month' }).click();
  await page.locator('.adminpage-card', { hasText: 'Margin, 2026-08' })
    .first().waitFor({ timeout: 10000 });
  ok('margin: euros not cents, tiers apart, gap against 6.85 stated, ledger not invoiced, month selector refetches');
  await page.screenshot({ animations: 'disabled', path: `${SHOTS}/admin-margin.png`, fullPage: true });

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

  // T065-d: a refused status change says why instead of failing silently.
  state.fbFail = true;
  await page.locator('.adminpage-fb').first().locator('.adminpage-btn', { hasText: /Mark (open|done)/ }).first().click();
  await page.locator('.adminpage-err[role="alert"]').waitFor({ timeout: 6000 });
  if (!/Too many admin actions/.test(await page.locator('.adminpage-err[role="alert"]').innerText())) {
    fail('a slow_down on a feedback status shows no message');
  }
  state.fbFail = false;
  ok('a refused feedback status change shows its reason');

  // ---- 8f. Guides, Reports, takedowns and complaints (T067 to T070).
  // These tabs shipped with scratch-copy checks only; this is the permanent
  // version. Each tab loads the first time it is opened, not at unlock.
  console.log('8f. guides, reports, takedowns, complaints');
  if (state.guideCalls !== 0 || state.reportCalls.length !== 0 || state.complaintCalls.length !== 0) {
    fail('the Guides or Reports queues loaded before their tabs were opened');
  }
  await gotoSection(page, 'Guides');
  await page.locator('.adminpage-table tbody tr').first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  if (state.guideCalls !== 1) fail(`the Guides tab made ${state.guideCalls} loads on first open, not one`);
  const gText = await page.locator('.adminpage-body').innerText();
  if (!/Porto in four days/.test(gText) || !/Untitled trip/.test(gText)) fail('the Guides rows are not shown by title');
  if (await page.locator('.adminpage-chip', { hasText: 'Not in gallery' }).count() !== 1) fail('exactly one guide should carry the not-in-gallery chip');
  if (!/Views are not counted/.test(gText)) fail('the Guides tab does not say views are not counted');
  // The author hand-off opens the account.
  await page.locator('.adminpage-namebtn').nth(1).click();
  await page.locator('.adminpage-btn', { hasText: 'Email a password reset' }).waitFor({ timeout: 10000 });
  ok('Guides: lazy first load, rows by title, the not-in-gallery chip, the author opens the account');
  await gotoSection(page, 'Guides');
  await page.locator('.adminpage-table tbody tr').first().waitFor({ timeout: 10000 });
  // A failure draws no table, and the retry brings the rows back.
  state.guidesFail = true;
  await page.locator('.adminpage-btn', { hasText: 'Refresh' }).click();
  await page.locator('.adminpage-err').waitFor({ timeout: 10000 });
  if (await page.locator('.adminpage-table').count()) fail('a failed Guides load still drew its table');
  state.guidesFail = false;
  await page.locator('.adminpage-retry').click();
  await page.locator('.adminpage-table tbody tr').first().waitFor({ timeout: 10000 });
  if (await page.locator('.adminpage-err').count()) fail('the Guides error survived the retry');
  ok('Guides: a failed load says so and draws no table, and Try again recovers');

  // Unpublish on the second row (the untitled guide, plan-g2).
  const row2 = () => page.locator('.adminpage-table tbody tr').nth(1);
  await row2().locator('.adminpage-btn.danger', { hasText: 'Unpublish' }).click();
  const ta = page.locator('.adminpage-armed textarea');
  await ta.waitFor({ timeout: 5000 });
  if (!(await ta.evaluate((el) => el === document.activeElement))) fail('opening the takedown form did not move focus to the reason field');
  const taId = await ta.getAttribute('id');
  if (!(await page.locator(`label[for="${taId}"]`).count())) fail('the reason field has no label tied to it');
  const goBtn = page.locator('.adminpage-armed .adminpage-btn.danger', { hasText: 'Unpublish guide' });
  if (!(await goBtn.isDisabled())) fail('the send button is enabled with a blank reason');
  await ta.fill('   ');
  if (!(await goBtn.isDisabled())) fail('the send button is enabled with a whitespace reason');
  await page.locator('.adminpage-armed .adminpage-btn', { hasText: 'Keep it public' }).click();
  if (await page.locator('.adminpage-armed').count()) fail('Cancel left the takedown form open');
  if (state.unpublishCalls.length) fail('a call went out before the form was submitted');
  ok('Unpublish: arms with focus and a label, refuses a blank reason, Cancel closes it with no call');
  // The server's refusals are worded in place and keep the form open.
  await row2().locator('.adminpage-btn.danger', { hasText: 'Unpublish' }).click();
  for (const [mode, re] of [['not_found', /no longer exists/i], ['slow_down', /too many admin actions/i], ['bad_reason', /write the reason/i]]) {
    state.unpublishMode = mode;
    await page.locator('.adminpage-armed textarea').fill('Copies a book');
    await page.locator('.adminpage-armed .adminpage-btn.danger', { hasText: 'Unpublish guide' }).click();
    await page.locator('.adminpage-armed [role="alert"]').waitFor({ timeout: 5000 });
    if (!re.test(await page.locator('.adminpage-armed [role="alert"]').innerText())) fail(`the ${mode} refusal is not worded`);
    if (!(await page.locator('.adminpage-armed textarea').inputValue())) fail(`the ${mode} refusal cleared the reason`);
  }
  ok('Unpublish: not_found, slow_down and bad_reason each get a sentence in place and keep the reason');
  state.unpublishMode = 'ok';
  await page.locator('.adminpage-armed textarea').fill('  Copies a book  ');
  await page.locator('.adminpage-armed .adminpage-btn.danger', { hasText: 'Unpublish guide' }).click();
  await page.locator('.adminpage-ok', { hasText: 'Guide unpublished' }).waitFor({ timeout: 10000 });
  const lastUnpub = state.unpublishCalls[state.unpublishCalls.length - 1];
  if (lastUnpub.p_reason !== 'Copies a book' || lastUnpub.p_plan_id !== 'plan-g2') {
    fail(`the takedown sent ${JSON.stringify(lastUnpub)}, not the trimmed reason for plan-g2`);
  }
  await page.waitForTimeout(700);
  if (await page.locator('.adminpage-table tbody tr').count() !== 1) fail('the unpublished guide did not leave the Guides list');
  ok('Unpublish: sends the trimmed reason, announces it, and the guide leaves the list');

  // Reports: lazy, filtered, worded.
  if (state.reportCalls.length !== 0) fail('Reports loaded before its tab was opened');
  await gotoSection(page, 'Reports');
  await page.locator('.adminpage-fb').first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  if (state.reportCalls.length !== 1) fail(`the Reports tab made ${state.reportCalls.length} loads on first open, not one`);
  const r1c = page.locator('.adminpage-fb', { hasText: 'published book' });
  const r2c = page.locator('.adminpage-fb', { hasText: 'hostel' });
  if (await r1c.count() !== 1 || await r2c.count() !== 1) fail('the New filter should show the two new reports');
  if (!/no longer public/i.test(await r2c.innerText())) fail('a report on a guide that is not public lacks its chip');
  if (await r2c.locator('.adminpage-btn.danger', { hasText: 'Unpublish' }).count()) fail('a non-public guide offers Unpublish from its report');
  if (!(await r1c.locator('a', { hasText: 'Reply to reporter' }).count())) fail('a report with a contact email has no reply link');
  if (await r2c.locator('a', { hasText: 'Reply to reporter' }).count()) fail('a report with no contact email offers a reply link');
  ok('Reports: lazy first load, the New filter, the not-public chip, reply only with a contact email');
  state.reportsFail = true;
  await page.locator('.adminpage-btn', { hasText: 'Refresh' }).first().click();
  await page.locator('.adminpage-err', { hasText: 'could not find' }).waitFor({ timeout: 10000 });
  if (await page.locator('.adminpage-fb', { hasText: 'published book' }).count()) fail('a failed Reports load still drew the queue');
  state.reportsFail = false;
  await page.locator('.adminpage-retry').first().click();
  await page.locator('.adminpage-fb', { hasText: 'published book' }).waitFor({ timeout: 10000 });
  ok('Reports: a failed load says so and draws no queue, and Try again recovers');

  // Dismiss r2 (blank refused, trimmed reason in the body).
  await r2c.locator('.adminpage-btn', { hasText: 'Dismiss' }).click();
  const dta = r2c.locator('textarea');
  await dta.waitFor({ timeout: 5000 });
  if (!(await dta.evaluate((el) => el === document.activeElement))) fail('opening Dismiss did not move focus to its reason field');
  const dGo = r2c.locator('.adminpage-btn', { hasText: 'Dismiss report' });
  if (!(await dGo.isDisabled())) fail('Dismiss report is enabled with a blank reason');
  await dta.fill('  An opinion, not illegal.  ');
  await dGo.click();
  await page.locator('.adminpage-ok', { hasText: 'Report dismissed' }).waitFor({ timeout: 10000 });
  if (state.dismissCalls[0].p_reason !== 'An opinion, not illegal.' || state.dismissCalls[0].p_report_id !== 'r2') {
    fail(`Dismiss sent ${JSON.stringify(state.dismissCalls[0])}`);
  }
  await page.waitForTimeout(600);
  if (await page.locator('.adminpage-fb', { hasText: 'hostel' }).count()) fail('a dismissed report stayed in the New filter');
  ok('Dismiss: refuses a blank reason, sends the trimmed one, and the report leaves New');

  // Unpublish from the report card (r1, plan-g1): the report is actioned.
  await r1c.locator('.adminpage-btn.danger', { hasText: 'Unpublish' }).click();
  await r1c.locator('textarea').fill('Copies a chapter of a book.');
  await r1c.locator('.adminpage-btn.danger', { hasText: 'Unpublish guide' }).click();
  await page.locator('.adminpage-ok', { hasText: 'Reports marked actioned: 1' }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
  if (await page.locator('.adminpage-fb', { hasText: 'published book' }).count()) fail('an actioned report stayed in the New filter');
  await page.locator('.adminpage-seg', { hasText: /^All$/ }).last().click();
  await page.waitForTimeout(800);
  if (await page.locator('.adminpage-fb', { hasText: /Decided by @owner/ }).count() < 3) fail('the All filter should show every decided report with who decided');
  if (!/Copies a chapter of a book\./.test(await page.locator('.adminpage-fb', { hasText: 'published book' }).innerText())) {
    fail('a decided report does not carry its reason');
  }
  ok('Reports: unpublishing from a card actions the report; All shows who decided, when and why');

  // Complaints, above the notices.
  const compCards = page.locator('#admin-complaints-h ~ .adminpage-fblist .adminpage-fb');
  if (await compCards.count() !== 2) fail(`the open complaints should be two, found ${await compCards.count()}`);
  const c1 = compCards.filter({ hasText: 'Lisbon food guide' });
  const c2 = compCards.filter({ hasText: 'Algarve loop' });
  if (!/Unchanged since the takedown/.test(await c1.innerText())) fail('an unchanged takedown does not say reversing reinstates it');
  if (!/Changed or no longer private/.test(await c2.innerText())) fail('a changed takedown does not say reversing only lifts the decision');
  if (!/The text is my own blog post/.test(await c1.innerText())) fail('the complaint card lacks the owner words');
  // One form at a time across the whole page.
  await c1.locator('.adminpage-btn', { hasText: 'Uphold' }).click();
  await c2.locator('.adminpage-btn', { hasText: 'Reverse' }).click();
  if (await page.locator('#admin-complaints-h ~ .adminpage-fblist textarea').count() !== 1) fail('more than one decision form is open at once');
  await c2.locator('textarea').fill('The address is gone, so it goes back.');
  // slow_down is worded in place; the form and the reason stay.
  state.decideRefuse = 'slow_down';
  await c2.locator('.adminpage-btn', { hasText: 'Reverse decision' }).click();
  await c2.locator('[role="alert"]').waitFor({ timeout: 5000 });
  if (!/too many admin actions/i.test(await c2.locator('[role="alert"]').innerText())) fail('slow_down on a complaint is not worded');
  if ((await c2.locator('textarea').inputValue()) !== 'The address is gone, so it goes back.') fail('slow_down cleared the answer');
  await c2.locator('.adminpage-btn', { hasText: 'Reverse decision' }).click();
  await page.locator('.adminpage-ok', { hasText: /Decision reversed/ }).waitFor({ timeout: 10000 });
  const dec = state.decideCalls[state.decideCalls.length - 1];
  if (dec.p_outcome !== 'reversed' || dec.p_statement_id !== 's2' || dec.p_reason !== 'The address is gone, so it goes back.') {
    fail(`Reverse sent ${JSON.stringify(dec)}`);
  }
  if (!/stays as the owner has it/.test(await page.locator('.adminpage-ok', { hasText: /Decision reversed/ }).innerText())) {
    fail('a reversal of a changed trip does not say it was left as the owner has it');
  }
  await page.waitForTimeout(700);
  const c1b = page.locator('#admin-complaints-h ~ .adminpage-fblist .adminpage-fb', { hasText: 'Lisbon food guide' });
  await c1b.locator('.adminpage-btn', { hasText: 'Uphold' }).click();
  await c1b.locator('textarea').fill('The chapter matches the book.');
  await c1b.locator('.adminpage-btn', { hasText: 'Uphold decision' }).click();
  await page.locator('.adminpage-ok', { hasText: /Decision upheld/ }).waitFor({ timeout: 10000 });
  await page.locator('#admin-complaints-h ~ .adminpage-segment .adminpage-seg', { hasText: /^All$/ }).first().click();
  await page.waitForTimeout(800);
  if (!/Decided by @owner/.test(await page.locator('#admin-complaints-h ~ .adminpage-fblist').first().innerText())) fail('a decided complaint does not say who decided');
  ok('Complaints: cards, the reinstate rule, one form at a time, slow_down in place, reverse and uphold with their bodies');
  await page.screenshot({ animations: 'disabled', path: `${SHOTS}/admin-reports.png`, fullPage: true });

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
  // 8e. A reason under ten characters is refused on the page, no call sent.
  await page.locator('#ov-note').fill('car park');
  await page.locator('.adminpage-btn', { hasText: 'Save correction' }).click();
  await page.waitForTimeout(400);
  if (state.ovSetCalls.length) fail('a nine-character reason still reached the server');
  if (!/at least 10 characters/.test(await page.locator('.adminpage-editorbox .adminpage-err').innerText().catch(() => ''))) {
    fail('a too-short reason shows no sentence saying why');
  }
  ok('a reason under ten characters is refused before any call, with a sentence');
  if (await page.locator('.adminpage-reviewset .adminpage-seg.on').innerText() !== 'Temporary') {
    fail('a new override does not default to Temporary');
  }
  const defDate = await page.locator('#ov-review').inputValue();
  const defDays = Math.round((new Date(`${defDate}T12:00:00`) - Date.now()) / 86400000);
  if (defDays < 29 || defDays > 31) fail(`the default review date is ${defDate}, ${defDays} days out, not 30`);
  ok(`a new override defaults to Temporary, review by ${defDate}`);
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
  if (ov.p_status !== 'temporary') fail(`the status sent was ${ov.p_status}`);
  if (!ov.p_review_by || Math.abs(new Date(ov.p_review_by) - Date.now() - 30 * 86400000) > 2 * 86400000) {
    fail(`the review date sent was ${ov.p_review_by}`);
  }
  ok('a correction saves the image, the name, the reason, the status and the review date against the real id');

  // 8e. The seeded lake override is overdue and named above the grid,
  // although the grid is on beaches. Select from the due review section
  // specifically, not the orphan section.
  const reviewRows = page.locator('.adminpage-review:not(.adminpage-orphans) .adminpage-reviewrow');
  if (await reviewRows.count() !== 1) fail(`the review list shows ${await reviewRows.count()} rows, expected the one overdue lake`);
  const lakeRow = reviewRows.first();
  if (!/Lac du Test/.test(await lakeRow.innerText())) fail('the overdue lake override is not named in the review list');
  if (!(await lakeRow.locator('.adminpage-reviewdate.overdue').count())) fail('the overdue date is not highlighted');
  if (!/was due/.test(await lakeRow.innerText())) fail('the overdue row does not say when it was due');
  if (!/1 overdue in all layers/.test(await page.locator('.adminpage-contentbar').innerText())) {
    fail('the content bar does not count the overdue override');
  }
  if (!/1 override needs review/.test(await page.locator('#ov-review-title').innerText())) fail('the review heading does not count it');
  ok('an overdue override in another layer is named above the grid, dated in red, and counted');

  // Make the fresh beach override overdue on the stub, then confirm the lake
  // one from the list: the save reloads the list, which is when the grid
  // learns about the beach row's date.
  const beachRow = state.overrides.find((o) => o.layer === 'beach');
  beachRow.reviewBy = '2026-02-01T12:00:00Z';
  await lakeRow.click();
  await page.locator('.adminpage-editorbox').waitFor({ timeout: 10000 });
  if (await page.locator('#ov-name').inputValue() !== 'Lac du Test') fail('the review list opens the editor without the stored patch');
  if (await page.locator('#ov-note').inputValue() !== 'pipeline swapped two lake names') fail('the stored reason is not prefilled');
  if (!(await page.locator('.adminpage-reviewwas').count())) fail('the editor does not say the override was overdue');
  if (!(await page.locator('#ov-review').inputValue())) fail('the editor offers no fresh review date');
  await page.locator('.adminpage-reviewset .adminpage-seg', { hasText: 'Verified' }).click();
  await page.locator('.adminpage-btn', { hasText: 'Save correction' }).click();
  await page.waitForTimeout(1000);
  const conf = state.ovSetCalls[state.ovSetCalls.length - 1];
  if (conf.p_layer !== 'lake' || conf.p_item !== 'lac-overdue-t074' || conf.p_status !== 'verified') {
    fail(`confirming from the list sent ${JSON.stringify(conf)}`);
  }
  if (!(new Date(conf.p_review_by) > Date.now())) fail('confirming did not send a future review date');
  ok('an override opened from the list saves to its own layer with a new status and date');

  await page.waitForTimeout(400);
  const overdueCard = page.locator('.adminpage-card2.overdue');
  if (await overdueCard.count() !== 1) fail(`${await overdueCard.count()} cards are marked overdue, expected the beach just made overdue`);
  if ((await overdueCard.locator('.adminpage-editedflag').innerText()).trim().toLowerCase() !== 'overdue') {
    fail('the overdue card flag does not say overdue');
  }
  // The review list is now specific; find the due reviews list (not the orphans).
  const reviewLists = page.locator('.adminpage-review:not(.adminpage-orphans) .adminpage-reviewlist');
  if (!/A corrected name/.test(await reviewLists.innerText())) {
    fail('the beach override did not move into the review list');
  }
  ok('a card whose override passed its date is bordered and flagged overdue, and listed');
  await page.screenshot({ animations: 'disabled', path: `${SHOTS}/admin-content-review.png`, fullPage: true });

  await page.waitForTimeout(500);
  if (!(await page.locator('.adminpage-card2.edited').count())) {
    fail('the corrected entry is not marked as edited');
  }
  await page.locator('.adminpage-card2.edited').first().click();
  await page.locator('.adminpage-editorbox').waitFor({ timeout: 10000 });
  if (await page.locator('#ov-image').inputValue() !== 'https://upload.wikimedia.org/better.jpg') {
    fail('the editor does not reopen with the saved correction');
  }

  // T076: the diff viewer reads the stored patch against the pipeline's own
  // object, not the live editing form, so it must show the ORIGINAL name
  // beside the corrected one even while the form itself already holds the
  // corrected value.
  await page.locator('.diffviewer').waitFor({ timeout: 10000 });
  const diffRows = await page.locator('.diffviewer .diffrow').allInnerTexts();
  const nameRow = diffRows.find((r) => /^Name/.test(r));
  if (!nameRow || !/A corrected name/.test(nameRow)) {
    fail(`the diff viewer does not show the corrected name: ${JSON.stringify(diffRows)}`);
  }
  if (nameRow.includes(firstName) === false) {
    // firstName is the original beach name read from the wire file earlier;
    // the diff's before column must still carry it.
    fail(`the diff viewer lost the original name (${firstName}): ${nameRow}`);
  }
  const imageRow = diffRows.find((r) => /^Photo/.test(r));
  if (!imageRow || !/upload\.wikimedia\.org\/better\.jpg/.test(imageRow)) {
    fail(`the diff viewer does not show the new photo URL: ${JSON.stringify(imageRow)}`);
  }
  if (await page.locator('.diffviewer .diffcell-image img').count() !== 2) {
    fail('the diff viewer does not render both photographs');
  }
  // T076-a: the replacement URL is answered with a real image, so the "after"
  // cell has to have painted it, not just rendered an <img> tag.
  const afterPainted = await page.waitForFunction(() => {
    const imgs = document.querySelectorAll('.diffviewer .diffcell-image img');
    const el = imgs[imgs.length - 1];
    return !!el && el.complete && el.naturalWidth > 0;
  }, null, { timeout: 8000 }).then(() => true).catch(() => false);
  if (!afterPainted) fail('the diff viewer\'s after photograph never painted a real image');
  ok('the diff viewer shows the pipeline object beside the stored patch, name and photo both changed');
  ok('the after photograph paints a real replacement image');
  await page.screenshot({ animations: 'disabled', path: `${SHOTS}/admin-content-diff.png` });

  await page.locator('.adminpage-btn', { hasText: 'Revert to the pipeline' }).click();
  await page.waitForTimeout(1000);
  const rev = state.ovSetCalls[state.ovSetCalls.length - 1];
  if (!rev || Object.keys(rev.p_patch || {}).length !== 0) {
    fail(`revert did not send an empty patch: ${JSON.stringify(rev)}`);
  }
  if (state.overrides.some((o) => o.layer === 'beach')) fail('the override survived the revert');
  if (rev.p_status !== null || rev.p_review_by !== null) fail(`a revert sent lifecycle fields: ${JSON.stringify(rev)}`);
  ok('reverting sends the empty patch that clears the override');
  await page.screenshot({ animations: 'disabled', path: `${SHOTS}/admin-content.png`, fullPage: true });

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
  const sw = page.locator('.adminpage-flags .adminpage-switch');
  if (await sw.getAttribute('aria-checked') !== 'false') fail('a new flag is not off by default');
  await sw.click();
  await page.locator('.adminpage-btn', { hasText: 'Publish flags' }).click();
  await page.locator('.adminpage-btn', { hasText: 'Flags published' }).waitFor({ timeout: 6000 });
  const fcfg = state.configCalls.find((c) => c.p_key === 'features');
  if (fcfg?.p_value?.beta_map !== true) fail(`the flags payload is wrong: ${JSON.stringify(fcfg?.p_value)}`);
  ok('the notice and the flags publish exactly what the app reads');
  await page.screenshot({ animations: 'disabled', path: `${SHOTS}/admin-site.png` });

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
  const pair = page.locator('.adminpage-auditpair');
  if (await pair.count() !== 1) fail('a row with previous and new does not draw the two sides');
  const pairText = await pair.innerText();
  if (!/OLD-TEXT-MARKER/.test(pairText) || !/NEW-TEXT-MARKER/.test(pairText)) {
    fail('the audit pair cuts off the previous or the new value');
  }
  ok('the audit pair shows previous beside new, whole');

  // T270 Overview: waiting counts, OSS figure, parse failures.
  console.log('10b. waiting counts and new cards');
  // Earlier steps actioned the seeded reports, and the waiting counts are read
  // once per unlock: reseed, then unlock afresh so two reports are new again.
  seedModeration(state);
  await page.goto(`${BASE}/?o=CRL`);
  await page.locator('.account-avatar-btn').first().waitFor({ timeout: 120000 });
  await openPanel(page);
  await openAdmin(page);
  await gotoSection(page, 'Overview');
  await page.locator('.adminpage-attention').waitFor({ timeout: 10000 });
  if (!/2\s*New reports/.test((await page.locator('.adminpage-attention').innerText()).replace(/\n/g, ' '))) {
    fail('the Overview does not show the new-reports count');
  }
  if (!/^2$/.test((await page.locator('.adminpage-navbtn', { hasText: 'Reports' }).locator('.adminpage-badge').innerText()).trim())) {
    fail('the Reports tab carries no count badge');
  }
  await page.locator('.adminpage-card', { hasText: 'Import parse failures' }).waitFor({ timeout: 8000 });
  const oss = await page.locator('.adminpage-card', { hasText: 'One Stop Shop' }).innerText();
  if (!/29\.0%/.test(oss) || !/floor/.test(oss)) fail(`the OSS card is wrong: ${oss}`);
  ok('new-reports count, nav badge, parse-failure card and OSS card render');

  // T270 Site: the visibility switch, and a required key that cannot flip.
  await gotoSection(page, 'Site');
  await page.locator('.adminpage-keylist').waitFor({ timeout: 8000 });
  const reqSwitch = page.locator('.adminpage-keylist li', { hasText: 'announcement' }).locator('[role="switch"]');
  if (!(await reqSwitch.isDisabled())) fail('a key the app reads signed out can be made private');
  await page.locator('.adminpage-keylist li', { hasText: 'beta_banner' }).locator('[role="switch"]').click();
  await page.waitForTimeout(600);
  if (!state.pubCalls.some((c) => c.p_key === 'beta_banner' && c.p_public === true)) {
    fail('the visibility switch never reached admin_set_config_public');
  }
  ok('the Site tab flips a key public, and locks the required ones');

  // T270 Guides: the first page is 100, Show more appends the rest.
  state.guideBulk = true;
  await gotoSection(page, 'Guides');
  await page.locator('.adminpage-table tbody tr').first().waitFor({ timeout: 8000 });
  if (await page.locator('.adminpage-table tbody tr').count() !== 100) fail('the first Guides page is not 100 rows');
  await page.locator('.adminpage-btn', { hasText: 'Show more' }).click();
  await page.waitForTimeout(800);
  if (await page.locator('.adminpage-table tbody tr').count() !== 130) fail('Show more did not append the last 30');
  if (!state.guidePages.some((c) => c.p_offset === 100)) fail('Show more did not ask for offset 100');
  state.guideBulk = false;
  ok('the Guides tab pages with Show more');
  await gotoSection(page, 'Content');
  await page.locator('.adminpage-btn', { hasText: 'Re-check catalogue' }).waitFor({ timeout: 8000 });
  ok('the Content tab offers a catalogue re-check');
  await gotoSection(page, 'Audit');
  await page.locator('.adminpage-table').waitFor({ timeout: 8000 });

  // Escape closes the page, like every other overlay.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  if (await page.locator('.adminpage').count()) fail('Escape did not close the page');
  ok('Escape closes the page');
  await ctx.close();

  // ---- 11. A non-admin never sees the door.
  console.log('11. non-admin');
  const ctx2 = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 960 } });
  await ctx2.addInitScript(seedSession(PROJECT_REF, ADMIN));
  const page2 = await ctx2.newPage();
  await stubSupabase(page2, state, { isAdmin: false });
  await page2.goto(`${BASE}/?o=CRL`);
  await page2.locator('.account-avatar-btn').first().waitFor({ timeout: 120000 });
  await openPanel(page2);
  await page2.waitForTimeout(900);
  if (await page2.locator('.account-nav:visible', { hasText: 'Admin' }).count()) {
    fail('a non-admin is shown the Admin row');
  }
  // Ten doors: Overview, Profile details, Friends, Send feedback, Common
  // questions, Privacy policy, Terms of service, Imprint, Data sources and
  // Lifestyle. The list grew after this step was written, which is why it
  // said eight (T042-d). Asserted by name so the next door to arrive says
  // which one it is rather than only changing a count.
  const doors = (await page2.locator('.account-nav:visible').allInnerTexts()).map((x) => x.trim().split(String.fromCharCode(10))[0].trim());
  const wantDoors = ['Overview', 'Profile details', 'Friends', 'Send feedback', 'Common questions',
    'Privacy policy', 'Terms of service', 'Imprint', 'Data sources', 'Lifestyle'];
  const missingDoors = wantDoors.filter((d) => !doors.includes(d));
  const extraDoors = doors.filter((d) => !wantDoors.includes(d));
  if (missingDoors.length || extraDoors.length) {
    fail(`the non-admin hub changed shape: missing [${missingDoors.join(', ')}], extra [${extraDoors.join(', ')}]`);
  }
  ok('a non-admin sees the usual hub, nothing more');
  await ctx2.close();

  // ---- 12. The public banner.
  console.log('12. site banner');
  state.siteConfig.announcement = { enabled: true, text: 'Fares refresh tonight at 02:00', tone: 'warn' };
  const ctx3 = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 960 } });
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
  // Every override still in the stub is made overdue again, so the 380px
  // content check below measures a real review row rather than an empty list.
  state.overrides.forEach((o) => { o.reviewBy = '2026-01-01T12:00:00Z'; });
  const ctx4 = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 380, height: 820 }, isMobile: true, hasTouch: true });
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
  await page4.screenshot({ animations: 'disabled', path: `${SHOTS}/admin-380.png`, fullPage: true });
  // 8e at 380px: the review list with its one row must not push sideways.
  await page4.locator('.adminpage-navbtn:visible', { hasText: 'Content' }).first().click();
  await page4.locator('.adminpage-reviewrow').first().waitFor({ timeout: 10000 });
  await page4.waitForTimeout(800);
  const spill2 = await page4.evaluate(() => ({
    scrolls: document.documentElement.scrollWidth > window.innerWidth + 1,
    wide: [...document.querySelectorAll('.adminpage-review *')]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 50)).slice(0, 5),
  }));
  if (spill2.scrolls || spill2.wide.length) fail(`the content review list spills at 380px: ${spill2.wide.join(' | ')}`);
  ok('380px: the content review list fits');
  await page4.screenshot({ animations: 'disabled', path: `${SHOTS}/admin-content-380.png`, fullPage: true });
  await page4.locator('.adminpage-reviewrow').first().click();
  await page4.locator('.adminpage-reviewset').waitFor({ timeout: 10000 });
  await page4.waitForTimeout(400);
  // T076: the diff viewer is inside .adminpage-editorbox, so the spill scan
  // below already covers it, but it must actually be there to be covered.
  if (!(await page4.locator('.diffviewer').count())) {
    fail('the diff viewer does not render for an override opened at 380px');
  }
  const spill3 = await page4.evaluate(() => [...document.querySelectorAll('.adminpage-editorbox *')]
    .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
    .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 50)).slice(0, 5));
  if (spill3.length) fail(`the override editor spills at 380px: ${spill3.join(' | ')}`);
  ok('380px: the override editor, with the diff viewer, status, review date and reason, fits');
  await page4.locator('.diffviewer').screenshot({ animations: 'disabled', path: `${SHOTS}/admin-content-diff-380.png` });
  await page4.locator('.adminpage-reviewset').screenshot({ animations: 'disabled', path: `${SHOTS}/admin-content-editor-380.png` });

  // T270 screens at 380px: overview counts, Site visibility, Guides, Audit pair.
  const spillOf = () => page4.evaluate(() => ({
    scrolls: document.documentElement.scrollWidth > window.innerWidth + 1,
    wide: [...document.querySelectorAll('.adminpage-body *')]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1
        && !el.closest('.adminpage-tablewrap'))
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 50)).slice(0, 5),
  }));
  await page4.locator('.adminpage-editoractions .adminpage-btn').first().click();
  await page4.locator('.adminpage-editor').waitFor({ state: 'detached', timeout: 3000 });
  for (const [name, wait] of [
    ['Overview', '.adminpage-attention'], ['Site', '.adminpage-keylist'],
    ['Guides', '.adminpage-table tbody tr'], ['Audit', '.adminpage-auditpair'],
  ]) {
    await page4.locator('.adminpage-navbtn:visible', { hasText: name }).first().click();
    await page4.locator(wait).first().waitFor({ timeout: 10000 });
    await page4.waitForTimeout(400);
    const s = await spillOf();
    if (s.scrolls || s.wide.length) fail(`${name} spills at 380px: ${s.wide.join(' | ')}`);
    await page4.screenshot({ animations: 'disabled', path: `${SHOTS}/admin-${name.toLowerCase()}-t270-380.png`, fullPage: true });
  }
  ok('380px: Overview counts, Site visibility, Guides and the audit pair fit');
  // T067 to T070 at 380px: the Guides table, the Reports queue and the open
  // forms must not push the page sideways. Starts from freshly seeded rows.
  seedModeration(state);
  const spillAt = (sel) => page4.evaluate((root) => [...document.querySelectorAll(`${root} *`)]
    .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
    .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 50)).slice(0, 5), sel);
  await page4.locator('.adminpage-navbtn:visible', { hasText: 'Guides' }).first().evaluate((el) => el.click());
  await page4.locator('.adminpage-table tbody tr').first().waitFor({ timeout: 10000 });
  await page4.locator('.adminpage-btn.danger', { hasText: 'Unpublish' }).first().click();
  await page4.locator('.adminpage-armed textarea').waitFor({ timeout: 5000 });
  await page4.waitForTimeout(400);
  const gSpill = await page4.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (gSpill) fail('the Guides tab, with its takedown form open, scrolls the page sideways at 380px');
  await page4.screenshot({ animations: 'disabled', path: `${SHOTS}/admin-guides-380.png`, fullPage: true });
  await page4.locator('.adminpage-navbtn:visible', { hasText: 'Reports' }).first().evaluate((el) => el.click());
  await page4.locator('.adminpage-fb').first().waitFor({ timeout: 10000 });
  await page4.locator('.adminpage-fb .adminpage-btn', { hasText: 'Dismiss' }).first().click();
  await page4.locator('.adminpage-armed textarea').first().waitFor({ timeout: 5000 });
  await page4.waitForTimeout(400);
  const rSpill = await spillAt('.adminpage-body');
  if (rSpill.length || await page4.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) {
    fail(`the Reports tab, with a form open, spills at 380px: ${rSpill.join(' | ')}`);
  }
  await page4.screenshot({ animations: 'disabled', path: `${SHOTS}/admin-reports-380.png`, fullPage: true });
  ok('380px: the Guides table, the Reports queue, the complaints and their open forms fit');
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
