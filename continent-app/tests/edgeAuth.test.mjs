// T1164 (C10): auth tests for the Supabase Edge Functions, run on the real
// handlers (supabase/functions/<name>/index.ts) under Node with stubbed
// dependencies (tests/fixtures/edge-auth/). Cases per the ROADMAP C10 brief:
// no token, wrong user, expired token, forged and `alg: none` tokens, the
// anon key used as a user token, the shared-secret jobs (cron, unsubscribe
// links, Stripe signatures) and admin without MFA. A refused request must
// also never reach the database, Stripe or an AI provider.
// Run: npm test (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { JWT_SECRET, ENV, resetWorld, loadEdge } from './fixtures/edge-auth/world.mjs';
import { signJwt } from './fixtures/edge-auth/supabase-stub.mjs';
import { stripeSignature } from './fixtures/edge-auth/stripe-stub.mjs';
import { unsubToken } from '../../supabase/functions/notify/logic.mjs';
import { signRefineToken, verifyRefineToken } from '../../supabase/functions/plan-day/logic.mjs';
import { readFileSync, readdirSync } from 'node:fs';

const ALICE = '0b9a1f62-1111-4c1d-9a55-aaaaaaaaaaaa';
const BOB = '0b9a1f62-2222-4c1d-9a55-bbbbbbbbbbbb';
const GONE = '0b9a1f62-3333-4c1d-9a55-cccccccccccc';
const ORIGIN = 'https://www.carta-europetravel.com';
const nowS = () => Math.floor(Date.now() / 1000);

function world() {
  const w = resetWorld();
  w.users[ALICE] = { email: 'alice@example.test' };
  w.users[BOB] = { email: 'bob@example.test' };
  return w;
}

const userToken = (sub, extra = {}) => signJwt({ sub, role: 'authenticated', aal: 'aal1', exp: nowS() + 3600, ...extra }, JWT_SECRET);

const TOKENS = {
  'no Authorization header': null,
  'an empty bearer': 'Bearer ',
  'a garbage bearer': 'Bearer not-a-jwt',
  'not a bearer scheme': `Basic ${Buffer.from('a:b').toString('base64')}`,
  'an expired token': () => `Bearer ${userToken(ALICE, { exp: nowS() - 60 })}`,
  'a token signed with another secret': () => `Bearer ${signJwt({ sub: ALICE, role: 'authenticated', exp: nowS() + 3600 }, 'attacker-secret')}`,
  'an alg none token': () => `Bearer ${signJwt({ sub: ALICE, role: 'authenticated', exp: nowS() + 3600 }, '', { alg: 'none', typ: 'JWT' })}`,
  'the anon key as a user token': () => `Bearer ${signJwt({ role: 'anon', exp: nowS() + 3600 }, JWT_SECRET)}`,
  'a valid token for a deleted user': () => `Bearer ${userToken(GONE)}`,
};

// The user-facing functions and a body that would get past validation.
const USER_FNS = {
  checkout: { tier: 'trip' },
  notify: { kind: 'price', items: [] },
  'parse-booking': { text: 'Booking ref ABC123, BRU to BCN on 2026-12-01' },
  'plan-day': { dest: { id: 'barcelona', city: 'Barcelona' } },
  'suggest-city': { country: 'ES' },
};

function post(body, headers = {}, url = 'https://stub.supabase.local/functions/v1/x') {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const reachedBackend = (w) => w.log.filter((e) => !e.auth);

for (const [fn, body] of Object.entries(USER_FNS)) {
  for (const [label, tok] of Object.entries(TOKENS)) {
    test(`${fn}: ${label} is refused with 401 before any data, Stripe or AI call`, async () => {
      const handler = await loadEdge(fn);
      const w = world();
      const value = typeof tok === 'function' ? tok() : tok;
      const res = await handler(post(body, value === null ? {} : { Authorization: value }));
      assert.equal(res.status, 401, `${fn} ${label}: ${res.status}`);
      assert.deepEqual(await res.json(), { code: 'auth' });
      assert.deepEqual(reachedBackend(w), [], `${fn} ${label} reached ${JSON.stringify(reachedBackend(w)).slice(0, 200)}`);
      assert.deepEqual(w.fetches, [], `${fn} ${label} called out`);
    });
  }

  test(`${fn}: a valid token gets past the auth check (the refusals above are not a broken stub)`, async () => {
    const handler = await loadEdge(fn);
    world();
    const res = await handler(post(body, { Authorization: `Bearer ${userToken(ALICE)}` }));
    assert.notEqual(res.status, 401, `${fn} answered 401 to a valid token`);
  });
}

// ---------------------------------------------------------------- wrong user

test('checkout: the pass is checked and sold to the token user, whatever user the body names', async () => {
  const handler = await loadEdge('checkout');
  const w = world();
  w.env.STRIPE_PRICE_TRIP = 'price_trip';
  w.rpc.pass_can_buy = { data: { ok: true }, error: null };
  w.tables.entitlements = { data: null, error: null };
  w.stripe['checkout.sessions.create'] = { url: 'https://checkout.stripe.test/s' };
  const res = await handler(post({ tier: 'trip', user_id: BOB, p_user: BOB, client_reference_id: BOB }, { Authorization: `Bearer ${userToken(ALICE)}` }));
  assert.equal(res.status, 200, await res.clone().text());
  const can = w.log.find((e) => e.rpc === 'pass_can_buy');
  assert.equal(can.args.p_user, ALICE);
  const create = w.log.find((e) => e.stripe === 'checkout.sessions.create');
  assert.equal(create.args[0].client_reference_id, ALICE);
  assert.equal(create.args[0].metadata.user_id, ALICE);
  assert.ok(!JSON.stringify(w.log).includes(BOB), 'the body user id reached a call');
});

test('checkout: the Year Pass is a one-off payment, never a subscription (decision 0010, ROADMAP I-f)', async () => {
  const handler = await loadEdge('checkout');
  const w = world();
  w.env.CHECKOUT_TERMS_URL = 'https://www.carta-europetravel.com/?legal=terms';
  w.rpc.pass_can_buy = { data: { ok: true }, error: null };
  w.tables.entitlements = { data: null, error: null };
  w.stripe['checkout.sessions.create'] = { url: 'https://checkout.stripe.test/s' };
  const res = await handler(post({ tier: 'year' }, { Authorization: `Bearer ${userToken(ALICE)}` }));
  assert.equal(res.status, 200, await res.clone().text());
  const s = w.log.find((e) => e.stripe === 'checkout.sessions.create').args[0];
  assert.equal(s.mode, 'payment');
  assert.equal(s.subscription_data, undefined);
  assert.deepEqual(s.line_items, [{ price: ENV.STRIPE_PRICE_YEAR, quantity: 1 }]);
  assert.equal(s.payment_intent_data.metadata.tier, 'year');
  const waiver = s.custom_text.terms_of_service_acceptance.message;
  assert.match(waiver, /within 14 days/);
  assert.doesNotMatch(waiver, /lose|renew|cancel/i);
});

test('checkout: a leftover "subscribed" answer is no longer a sale-specific refusal', async () => {
  // 075 drops the reason; a database still on 053 answers it with ok false,
  // which now reads as the generic horizon refusal rather than charging.
  const handler = await loadEdge('checkout');
  const w = world();
  w.rpc.pass_can_buy = { data: { ok: false, reason: 'subscribed' }, error: null };
  const res = await handler(post({ tier: 'year' }, { Authorization: `Bearer ${userToken(ALICE)}` }));
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, 'pass_max');
  assert.ok(!w.log.some((e) => e.stripe === 'checkout.sessions.create'), 'a session was opened');
});

test('notify: an unsubscribe link signed for one user does not unsubscribe another', async () => {
  const handler = await loadEdge('notify');
  const w = world();
  const t = await unsubToken(ENV.NOTIFY_SECRET, ALICE, 'price');
  const url = `https://stub.supabase.local/functions/v1/notify?u=${BOB}&k=price&t=${t}`;
  const res = await handler(new Request(url, { method: 'GET' }));
  assert.equal(res.status, 400);
  assert.ok(!w.log.some((e) => e.table === 'email_prefs'), 'email_prefs touched');
  // and the right link still works, so the refusal is the signature check
  const ok = await handler(new Request(`https://stub.supabase.local/functions/v1/notify?u=${ALICE}&k=price&t=${t}`, { method: 'GET' }));
  assert.equal(ok.status, 200);
});

test('notify: the price-drop email goes to the token user only', async () => {
  const handler = await loadEdge('notify');
  const w = world();
  w.tables.email_prefs = { data: { price_drops: false }, error: null };
  const res = await handler(post({ kind: 'price', user_id: BOB, items: [] }, { Authorization: `Bearer ${userToken(ALICE)}` }));
  assert.equal(res.status, 200);
  const read = w.log.find((e) => e.table === 'email_prefs');
  assert.deepEqual(read.ops.find((o) => o[0] === 'eq'), ['eq', 'user_id', ALICE]);
});

test('plan-day: a free-refine token minted for one user is worthless to another', async () => {
  const tok = await signRefineToken({ u: BOB, k: 'key', n: 0 }, ENV.SUPABASE_SERVICE_ROLE_KEY);
  assert.equal((await verifyRefineToken(tok, ENV.SUPABASE_SERVICE_ROLE_KEY, BOB)).ok, true);
  assert.equal((await verifyRefineToken(tok, ENV.SUPABASE_SERVICE_ROLE_KEY, ALICE)).ok, false);
  const [b, s] = tok.split('.');
  const forged = `${Buffer.from(JSON.stringify({ u: ALICE, k: 'key', n: 0, exp: Date.now() + 1e6 })).toString('base64url')}.${s}`;
  assert.equal((await verifyRefineToken(forged, ENV.SUPABASE_SERVICE_ROLE_KEY, ALICE)).ok, false, 'body swapped');
  assert.ok(b);
});

// ------------------------------------------------- shared-secret callers

for (const [label, headers] of Object.entries({ 'no secret': {}, 'a wrong secret': { 'x-notify-secret': 'guess' }, 'a user token instead': { Authorization: `Bearer ${userToken(ALICE)}` } })) {
  test(`notify reminders job: ${label} is refused with 401 and sends nothing`, async () => {
    const handler = await loadEdge('notify');
    const w = world();
    const res = await handler(post({ job: 'reminders' }, headers));
    assert.equal(res.status, 401);
    assert.deepEqual(w.log, []);
    assert.deepEqual(w.fetches, []);
  });
}

for (const [label, headers] of Object.entries({ 'no secret': {}, 'a wrong secret': { 'x-uploads-secret': 'guess' }, 'a user token instead': { Authorization: `Bearer ${userToken(ALICE)}` } })) {
  test(`upload-scan: ${label} is refused with 401 before the database`, async () => {
    const handler = await loadEdge('upload-scan');
    const w = world();
    const res = await handler(post({}, headers));
    assert.equal(res.status, 401);
    assert.deepEqual(w.log, []);
  });
}

const EVENT = JSON.stringify({ id: 'evt_1', type: 'ping.unhandled', data: { object: {} } });
const WEBHOOK_CASES = {
  'no signature': {},
  'a signature made with another secret': () => ({ 'stripe-signature': stripeSignature(EVENT, 'whsec_attacker', nowS()) }),
  'a replayed signature older than five minutes': () => ({ 'stripe-signature': stripeSignature(EVENT, ENV.STRIPE_WEBHOOK_SECRET, nowS() - 3600) }),
  'a valid signature over a different body': () => ({ 'stripe-signature': stripeSignature(EVENT.replace('evt_1', 'evt_2'), ENV.STRIPE_WEBHOOK_SECRET, nowS()) }),
  'a user token instead': () => ({ Authorization: `Bearer ${userToken(ALICE)}` }),
};
for (const [label, h] of Object.entries(WEBHOOK_CASES)) {
  test(`stripe-webhook: ${label} is refused with 400 before any grant`, async () => {
    const handler = await loadEdge('stripe-webhook');
    const w = world();
    const res = await handler(post(EVENT, typeof h === 'function' ? h() : h));
    assert.equal(res.status, 400);
    assert.deepEqual(w.log, []);
  });
}

test('stripe-webhook: a correctly signed event is accepted (the refusals are the signature check)', async () => {
  const handler = await loadEdge('stripe-webhook');
  world();
  const res = await handler(post(EVENT, { 'stripe-signature': stripeSignature(EVENT, ENV.STRIPE_WEBHOOK_SECRET, nowS()) }));
  assert.equal(res.status, 200);
});

test('stripe-webhook: a subscription or invoice event grants nothing (no pass renews, decision 0010)', async () => {
  const handler = await loadEdge('stripe-webhook');
  for (const type of ['invoice.paid', 'customer.subscription.updated']) {
    const w = world();
    const ev = JSON.stringify({ id: 'evt_s', type, data: { object: { id: 'in_1', status: 'paid', metadata: { user_id: ALICE, tier: 'year' } } } });
    const res = await handler(post(ev, { 'stripe-signature': stripeSignature(ev, ENV.STRIPE_WEBHOOK_SECRET, nowS()) }));
    assert.equal(res.status, 200, type);
    assert.equal((await res.json()).ignored, type);
    assert.ok(!w.log.some((e) => e.rpc), `${type} reached the database`);
  }
});

// ------------------------------------------------------ admin without MFA

test('admin without MFA: an admin claim in the token buys nothing at the Edge (no function has an admin path)', async () => {
  // Admin power lives only in the database (admin_guard, migrations 014, 032,
  // 062), which answers mfa_required to an aal1 session; that is proved on a
  // real Postgres by scripts/admin/test_admin_rpc_security.mjs in the
  // admin-rpc-security workflow. Here: no Edge Function reads a role or aal
  // claim, so an aal1 "admin" token is treated as any other user.
  const dir = new URL('../../supabase/functions/', import.meta.url);
  for (const name of readdirSync(dir).filter((n) => !n.startsWith('_') && !n.includes('.'))) {
    let src = '';
    try { src = readFileSync(new URL(`${name}/index.ts`, dir), 'utf8'); } catch { continue; }
    assert.ok(!/app_metadata|\baal\b|is_admin|admin_guard|role\s*===?\s*['"]admin/.test(src), `${name} reads an admin or aal claim`);
  }
  // The billing function's ownership check this used to drive went with the
  // subscription (ROADMAP I-f); checkout keys the sale on the token user.
  const handler = await loadEdge('checkout');
  const w = world();
  w.env.STRIPE_PRICE_TRIP = 'price_trip';
  w.rpc.pass_can_buy = { data: { ok: true }, error: null };
  w.tables.entitlements = { data: null, error: null };
  w.stripe['checkout.sessions.create'] = { url: 'https://checkout.stripe.test/s' };
  const admin = userToken(ALICE, { aal: 'aal1', app_metadata: { role: 'admin', is_admin: true } });
  const res = await handler(post({ tier: 'trip', user_id: BOB }, { Authorization: `Bearer ${admin}` }));
  assert.equal(res.status, 200);
  const s = w.log.find((e) => e.stripe === 'checkout.sessions.create').args[0];
  assert.equal(s.client_reference_id, ALICE, 'an admin claim let the body name another buyer');
});

test('admin without MFA: the database guard still demands aal2 (the migration the CI harness proves)', () => {
  const dir = new URL('../../supabase/migrations/', import.meta.url);
  const latest = readdirSync(dir).filter((n) => /^\d+_.*\.sql$/.test(n) && !n.endsWith('_down.sql')).sort()
    .filter((n) => /create or replace function (public\.)?admin_guard\s*\(/i.test(readFileSync(new URL(n, dir), 'utf8'))).pop();
  assert.ok(latest, 'no admin_guard definition found');
  const sql = readFileSync(new URL(latest, dir), 'utf8');
  assert.match(sql, /aal2/, `${latest}: admin_guard lost its aal2 check`);
  assert.match(sql, /mfa_required/, `${latest}: admin_guard lost its mfa_required answer`);
});
