// Live smoke check of the row policies and function grants, against the real
// Supabase project, as an anonymous caller.
//
// WHY THIS EXISTS. Every other verify script stubs the REST layer so it can
// run without credentials, which is what makes them fast and hermetic and
// also what makes them blind to this entire class of fault. Migration 011
// shipped a profiles policy that called a function it had just revoked from
// every client role: an RLS expression runs with the privileges of whoever
// is querying, so reading a profile returned 42501 rather than rows. The app
// degraded quietly, the browser tests passed, and the handle simply never
// appeared on screen. Nothing hermetic could have caught it.
//
// So this one deliberately talks to the real database. It asserts two things
// that are easy to get backwards:
//   1. What SHOULD be readable answers with rows or an empty list, never a
//      permission error. A 42501 here means a policy calls something the
//      caller cannot execute.
//   2. What should NOT be reachable is still refused. Fixing (1) by granting
//      execute on everything would satisfy (1) and quietly undo the privacy
//      the grants exist for.
//
// Reads only, anonymous only: it never writes and never needs a session.
// Run from inside continent-app/:  node scripts/verify_live_policies.mjs
import { readFileSync } from 'node:fs';

const env = (() => {
  try { return readFileSync('.env', 'utf8'); } catch { return ''; }
})();
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] || '').trim().replace(/^["']|["']$/g, '');
const URL_ = pick('VITE_SUPABASE_URL');
const KEY = pick('VITE_SUPABASE_ANON_KEY');

if (!URL_ || !KEY) {
  console.log('no Supabase credentials in .env, skipping the live policy check');
  process.exit(0);
}

let failures = 0;
const fail = (msg) => { console.error('FAIL:', msg); failures += 1; process.exitCode = 1; };
const ok = (msg) => console.log('  ok:', msg);

const call = async (path, body) => {
  const res = await fetch(`${URL_}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
};

// A table an anonymous caller may query but whose rows RLS hides: the right
// answer is an empty list. A permission error means a policy is uncallable.
const readsEmpty = async (label, path) => {
  const r = await call(path);
  if (r.json?.code === '42501') {
    fail(`${label}: 42501 ${r.json.message}. A policy calls something the caller cannot execute.`);
  } else if (Array.isArray(r.json)) {
    ok(`${label} reads back ${r.json.length === 0 ? 'empty, as RLS intends' : `${r.json.length} row(s)`}`);
  } else {
    fail(`${label}: unexpected answer ${r.status} ${r.text.slice(0, 140)}`);
  }
};

// A function no client should be able to call at all.
const denied = async (label, fn, args) => {
  const r = await call(`/rest/v1/rpc/${fn}`, args);
  if (r.json?.code === '42501') ok(`${label} is refused, as it must be`);
  else fail(`${label} is CALLABLE by anon: ${r.status} ${r.text.slice(0, 140)}`);
};

const run = async () => {
  console.log('live policy check against', URL_);

  // 1. Readable surfaces must not raise. profiles is the one that broke.
  await readsEmpty('profiles', '/rest/v1/profiles?select=handle');
  await readsEmpty('friendships', '/rest/v1/friendships?select=id');
  await readsEmpty('trip_shares', '/rest/v1/trip_shares?select=token');
  await readsEmpty('trip_plans', '/rest/v1/trip_plans?select=id');
  // Checked separately from trip_plans because migration 020 widened both
  // tables to co-planners in one file and broke both the same way, and a
  // later migration could easily touch only one of them.
  await readsEmpty('trip_plan_stops', '/rest/v1/trip_plan_stops?select=id');
  await readsEmpty('trip_collaborators', '/rest/v1/trip_collaborators?select=trip_plan_id');

  // 2. The internal helpers stay internal. Granting these to fix the above
  //    would hand every caller an oracle over other people's links.
  await denied('friend_link_status', 'friend_link_status', {
    a: '00000000-0000-4000-8000-000000000001', b: '00000000-0000-4000-8000-000000000002',
  });
  await denied('are_friends', 'are_friends', {
    a: '00000000-0000-4000-8000-000000000001', b: '00000000-0000-4000-8000-000000000002',
  });
  await denied('project_trip_payload', 'project_trip_payload', { payload: {}, include_memory: true });
  await denied('project_stop_choices', 'project_stop_choices', { choices: {} });
  await denied('project_trip_stops', 'project_trip_stops', { p_plan: '00000000-0000-4000-8000-000000000001' });
  await denied('claim_handle', 'claim_handle', { seed: 'x' });
  // Looking anyone up requires a session, unlike opening a share link.
  await denied('find_profile_by_handle', 'find_profile_by_handle', { wanted: 'traveller' });
  await denied('list_friend_trips', 'list_friend_trips', {});
  await denied('get_friend_trip', 'get_friend_trip', { wanted_plan: '00000000-0000-4000-8000-000000000001' });

  // 3. The one function that is meant to be open, because a share link must
  //    open without an account. An unknown token is zero rows, not an error.
  const shared = await call('/rest/v1/rpc/get_shared_trip', {
    share_token: '11111111-2222-4333-8444-555555555555',
  });
  if (Array.isArray(shared.json) && shared.json.length === 0) {
    ok('get_shared_trip answers an anonymous caller, and an unknown token is zero rows');
  } else {
    fail(`get_shared_trip: expected [] for an unknown token, got ${shared.text.slice(0, 140)}`);
  }

  // 4. The pass funnel (migration 022). Skipped rather than failed while the
  //    migration is unapplied, so this file stays green against a database
  //    that predates it and turns into a real check the moment it does not.
  //
  //    The writer, paywall_event, is deliberately NOT called here. Anon being
  //    able to record an event is the point of it, but calling it would write
  //    a row into the funnel this script is supposed to be measuring, and this
  //    file promises at the top that it never writes. Its self-check block
  //    covers that path on apply instead.
  const funnelProbe = await call('/rest/v1/rpc/admin_paywall_funnel', { p_days: 1 });
  if (funnelProbe.json?.code === 'PGRST202' || funnelProbe.status === 404) {
    console.log('  skip: migration 022 is not applied, so there is no pass funnel to check');
  } else if (funnelProbe.json?.code === '42501') {
    ok('admin_paywall_funnel is refused to anon, as it must be');
    // RLS with no policies would already return an empty list rather than
    // rows, but Supabase default-grants new public tables to anon, so the
    // migration revokes that explicitly. This is the check that the revoke
    // actually happened.
    const evs = await call('/rest/v1/paywall_events?select=id');
    if (evs.json?.code === '42501') ok('paywall_events is not readable by anon');
    else fail(`paywall_events is READABLE by anon: ${evs.status} ${evs.text.slice(0, 140)}`);
  } else {
    fail(`admin_paywall_funnel answered anon: ${funnelProbe.status} ${funnelProbe.text.slice(0, 140)}`);
  }

  // 5. The policy that broke must not name the function it cannot call. Read
  //    indirectly: a working profiles read above already proves it, but a
  //    grant added to "fix" it would show up here as a callable helper.
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
};

run().catch((e) => {
  console.error('FAIL:', e.message);
  process.exitCode = 1;
});
