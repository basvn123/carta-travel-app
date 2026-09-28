/**
 * Tests for migration 036: admin_list_public_guides(), the admin read model
 * over every published guide.
 *
 *   PGPORT=55434 node continent-app/scripts/admin/test_admin_public_guides.mjs
 *
 * WHAT IT PROVES, in order:
 *
 *   0. The chain applies: 002, 004, 006, 007, 009, 010, 011 (trip_plans,
 *      stops, visibility, profiles), 014 to 018 (the admin layer and
 *      admin_guard), 019 (visibility 'public' and published_at), 032 to 035,
 *      then 036 with its self-check notice.
 *   1. BEFORE 036 there is no admin read of published guides: the function
 *      does not exist, so an admin sees 0 of the public plans. Measured.
 *   2. After 036, called by an admin through the client role: every plan with
 *      visibility 'public' is returned and nothing else (private, friends and
 *      link plans are absent); total matches the table; the order is
 *      published_at desc; each author's email is the auth.users email; a plan
 *      whose author has no profile is listed with inGallery false, while the
 *      public gallery (list_public_guides) does not show it; stops and cities
 *      come from trip_plan_stops in position order; views is 0 and
 *      viewsCounted is false, because the schema has no view counter.
 *   3. The door: a signed-in non-admin gets {"error":"forbidden"}, anon
 *      cannot execute the function at all, and neither client role can read
 *      auth.users directly, so the email reaches the page only through this
 *      SECURITY DEFINER function. An admin over the read budget gets
 *      slow_down. A read writes no audit row.
 *   4. Unpublishing a plan removes it from the list on the next call.
 *   5. Pasting 036 twice is safe.
 *   6. With 500 extra public plans the RPC still returns every one of them
 *      (no silent cap), newest first.
 *
 * HOW. The harness of test_site_config_visibility.mjs (T066), sliced from
 * that file, with its stubs unchanged. Client calls run as `set role
 * authenticated` or `set role anon` with request.jwt.claims set, the way
 * PostgREST does. Superuser inserts stand in for rows the app writes.
 *
 * MIGRATION 018. As committed it fails on a real Postgres because of the
 * regex bound {5,600} (register row T031-d). The script applies it as
 * committed first, reports the failure, and then applies a copy with
 * {5,255} from a temp directory, for this test only. 018 in the repo is
 * never edited.
 *
 * NEEDS a PostgreSQL server that accepts a password-less connection (trust
 * auth or PGPASSWORD). Set PGHOST, PGPORT, PGUSER as needed; defaults are
 * 127.0.0.1:5432, postgres. With no server reachable the script SKIPS
 * LOUDLY, exits 0, and never prints that anything passed.
 *
 * It creates and drops a database named carta_t067_test. It never touches
 * the live Supabase project.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const migrations = resolve(repoRoot, 'supabase/migrations');

let failures = 0;
let checks = 0;
const check = (name, cond, detail = '') => {
  checks += 1;
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name}${detail ? `: ${detail}` : ''}`);
  }
};

const PSQL_CANDIDATES = [
  process.env.PSQL || '',
  'psql',
  'C:/Program Files/PostgreSQL/18/bin/psql.exe',
  'C:/Program Files/PostgreSQL/17/bin/psql.exe',
  'C:/Program Files/PostgreSQL/16/bin/psql.exe',
].filter(Boolean);

const PG = {
  host: process.env.PGHOST || '127.0.0.1',
  port: process.env.PGPORT || '5432',
  user: process.env.PGUSER || 'postgres',
};
const TEST_DB = process.env.CARTA_TEST_DB || 'carta_t067_test';

function findPsql() {
  for (const cand of PSQL_CANDIDATES) {
    if (cand !== 'psql' && !existsSync(cand)) continue;
    try {
      execFileSync(cand, ['--version'], { stdio: 'pipe' });
      return cand;
    } catch { /* try the next one */ }
  }
  return null;
}

/** Run psql and never throw. Returns { ok, out, err }, stderr kept either way. */
function psqlRun(bin, db, args) {
  const base = ['-h', PG.host, '-p', PG.port, '-U', PG.user, '-d', db, '-w',
    '-q', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
  // spawnSync rather than execFileSync: a successful run's stderr carries the
  // migration self-check NOTICE, and execFileSync drops it on success.
  const r = spawnSync(bin, [...base, ...args], {
    encoding: 'utf8',
    env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
  });
  const out = String(r.stdout || '');
  const err = String(r.stderr || (r.error ? r.error.message : ''));
  return { ok: r.status === 0 && !r.error, out, err };
}

/** Run psql and throw on failure, for setup steps. */
function psql(bin, db, args) {
  const r = psqlRun(bin, db, args);
  if (!r.ok) throw new Error(r.err.trim());
  return r;
}

const scalar = (bin, db, sql) => psql(bin, db, ['-At', '-c', sql]).out.trim();

/** What Supabase provides and a bare Postgres does not (as in test_admin_mfa.mjs). */
const STUBS = `
create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key,
  email              text,
  created_at         timestamptz not null default now(),
  last_sign_in_at    timestamptz,
  email_confirmed_at timestamptz,
  banned_until       timestamptz,
  raw_app_meta_data  jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create table if not exists auth.refresh_tokens (
  id      bigserial primary key,
  user_id varchar(255),
  revoked boolean default false
);

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$fn$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$fn$;

do $do$
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end
$do$;

grant usage on schema auth to authenticated, anon, service_role;

-- Supabase grants every table in public to the three API roles by default
-- and relies on RLS and explicit revokes to narrow that. Without this the
-- anon read below would fail on a missing GRANT, not on the policy, and the
-- test would prove nothing about RLS.
grant usage on schema public to authenticated, anon, service_role;
alter default privileges in schema public
  grant all on tables to authenticated, anon, service_role;
`;

const ADMIN = '00000000-0000-0000-0000-00000000ad01'; // an admin, reading through the client
const PLAIN = '00000000-0000-0000-0000-00000000c001'; // a signed-in non-admin
const AUTHOR_A = '00000000-0000-0000-0000-0000000000a1'; // has a profile
const AUTHOR_B = '00000000-0000-0000-0000-0000000000b1'; // has no profile

// Plans by visibility. published_at is set explicitly after the trigger has
// stamped it, so the expected order does not depend on clock resolution.
const P_OLD = '10000000-0000-0000-0000-000000000001'; // public, A, oldest
const P_MID = '10000000-0000-0000-0000-000000000002'; // public, B (no profile)
const P_NEW = '10000000-0000-0000-0000-000000000003'; // public, A, newest
const P_PRIV = '10000000-0000-0000-0000-000000000004';
const P_FRND = '10000000-0000-0000-0000-000000000005';
const P_LINK = '10000000-0000-0000-0000-000000000006';

function runTests(bin) {
  let work = null;
  const measured = {};
  try {
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
    psql(bin, 'postgres', ['-c', `create database ${TEST_DB}`]);

    work = mkdtempSync(join(tmpdir(), 'carta-t067-'));
    const stubFile = join(work, 'stubs.sql');
    writeFileSync(stubFile, STUBS, 'utf8');
    psql(bin, TEST_DB, ['-f', stubFile]);

    const applyFile = (label, file) => {
      const r = psqlRun(bin, TEST_DB, ['-f', file]);
      check(`migration applied: ${label}`, r.ok, r.err.trim().split('\n')[0]);
      if (!r.ok) throw new Error(`${label} failed: ${r.err.trim()}`);
      return r;
    };
    const apply = (name) => applyFile(name, resolve(migrations, name));

    for (const name of ['002_trip_plans.sql', '004_day_plans.sql', '006_ai_day_planner.sql',
      '007_passes.sql', '009_trip_shares.sql', '010_profiles.sql', '011_friends.sql',
      '014_admin.sql', '015_admin_hardening.sql', '016_admin_resilient.sql',
      '017_admin_analytics.sql']) {
      apply(name);
    }

    const m018 = resolve(migrations, '018_content_overrides.sql');
    const raw018 = psqlRun(bin, TEST_DB, ['-f', m018]);
    if (raw018.ok) {
      check('migration applied: 018_content_overrides.sql (as committed)', true);
    } else {
      const why = (raw018.err.match(/ERROR:.*$/m) || [raw018.err.trim()])[0];
      console.log(`  note  018 as committed fails here: ${why}`);
      const src = readFileSync(m018, 'utf8');
      check('018 carries the {5,600} bound the failure points at', src.includes('{5,600}'));
      const patched = join(work, '018_content_overrides.patched.sql');
      writeFileSync(patched, src.replace('{5,600}', '{5,255}'), 'utf8');
      console.log('  note  applying a copy with {5,255} from a temp dir, for this test only');
      applyFile('018_content_overrides.sql (patched copy, {5,255})', patched);
    }
    const m19 = apply('019_public_guides.sql');
    check('019 self-check ran and passed', /public guides self-check passed/.test(m19.err + m19.out));
    apply('032_admin_mfa_destructive.sql');
    apply('033_admin_audit_rollback.sql');
    apply('034_admin_guard_tiers.sql');
    const m35 = apply('035_site_config_visibility.sql');
    check('035 self-check ran and passed', /site config visibility self-check passed/.test(m35.err + m35.out));

    /* ---- seed --------------------------------------------------------- */
    const users = [[ADMIN, 'owner@example.test'], [PLAIN, 'plain@example.test'],
      [AUTHOR_A, 'author.a@example.test'], [AUTHOR_B, 'author.b@example.test']];
    for (const [id, email] of users) {
      psql(bin, TEST_DB, ['-c', `insert into auth.users (id, email) values ('${id}', '${email}')`]);
    }
    psql(bin, TEST_DB, ['-c', `insert into public.admin_users (user_id, note) values ('${ADMIN}', 'owner')`]);
    // 010's signup trigger gave every account a profile. Give A a chosen
    // handle, and take B's away: the trigger swallows its own failure so a
    // signup never breaks, which is how a real account ends up without one.
    psql(bin, TEST_DB, ['-c', `update public.profiles set handle = 'anna_travels', display_name = 'Anna'
      where user_id = '${AUTHOR_A}'`]);
    psql(bin, TEST_DB, ['-c', `delete from public.profiles where user_id = '${AUTHOR_B}'`]);
    check('the seed has one author with a profile and one without',
      scalar(bin, TEST_DB, `select count(*) from public.profiles where user_id in ('${AUTHOR_A}', '${AUTHOR_B}')`) === '1');

    const plans = [
      [P_OLD, AUTHOR_A, 'Four nights in Ghent', 'public', '2026-09-01 10:00+00'],
      [P_MID, AUTHOR_B, 'Porto in the rain', 'public', '2026-09-10 10:00+00'],
      [P_NEW, AUTHOR_A, 'Lisbon to Faro by train', 'public', '2026-09-20 10:00+00'],
      [P_PRIV, AUTHOR_A, 'Private draft', 'private', null],
      [P_FRND, AUTHOR_B, 'For friends only', 'friends', null],
      [P_LINK, AUTHOR_B, 'Shared by link', 'link', null],
    ];
    for (const [id, owner, label, vis] of plans) {
      psql(bin, TEST_DB, ['-c', `insert into public.trip_plans (id, user_id, label) values ('${id}', '${owner}', '${label}')`,
        '-c', `update public.trip_plans set visibility = '${vis}' where id = '${id}'`]);
    }
    check('the 019 trigger stamped published_at on every public plan and on no other',
      scalar(bin, TEST_DB, `select count(*) filter (where published_at is not null) || ',' || count(*) filter (where visibility = 'public') from public.trip_plans`) === '3,3');
    for (const [id, , , vis, at] of plans) {
      if (vis === 'public') {
        psql(bin, TEST_DB, ['-c', 'alter table public.trip_plans disable trigger trip_plans_stamp_published',
          '-c', `update public.trip_plans set published_at = '${at}' where id = '${id}'`,
          '-c', 'alter table public.trip_plans enable trigger trip_plans_stamp_published']);
      }
    }
    // Stops for the newest guide, inserted out of position order on purpose.
    psql(bin, TEST_DB, ['-c', `insert into public.trip_plan_stops (trip_plan_id, user_id, position, destination_id, city, country) values
      ('${P_NEW}', '${AUTHOR_A}', 2, 'faro', 'Faro', 'PT'),
      ('${P_NEW}', '${AUTHOR_A}', 1, 'lisbon', 'Lisbon', 'PT')`]);

    const claimsSql = (claims) => `set request.jwt.claims = '${JSON.stringify(claims).replace(/'/g, "''")}'`;
    const AS = {
      admin: { role: 'authenticated', claims: { sub: ADMIN, role: 'authenticated', aal: 'aal1' } },
      plain: { role: 'authenticated', claims: { sub: PLAIN, role: 'authenticated', aal: 'aal1' } },
      anon: { role: 'anon', claims: { role: 'anon' } },
    };
    /** Run one statement as a client role, the way PostgREST does. */
    const asRole = (who, sql) => psqlRun(bin, TEST_DB, ['-At',
      '-c', claimsSql(AS[who].claims), '-c', `set role ${AS[who].role}`, '-c', sql]);
    const callAs = (who) => {
      const r = asRole(who, 'select public.admin_list_public_guides()');
      let json = null;
      if (r.ok) { try { json = JSON.parse(r.out.trim()); } catch { /* left null */ } }
      return { ...r, json };
    };

    /* ---- 1. before 036 ------------------------------------------------ */
    console.log('');
    console.log('  Before 036:');
    check('admin_list_public_guides does not exist yet',
      scalar(bin, TEST_DB, `select to_regprocedure('public.admin_list_public_guides()') is null`) === 't');
    const before = callAs('admin');
    check('an admin calling it gets "function does not exist"', !before.ok && /does not exist/.test(before.err),
      before.err.trim().split('\n')[0]);
    measured.before = before.ok && before.json ? (before.json.rows || []).length : 0;
    const publicRows = Number(scalar(bin, TEST_DB, `select count(*) from public.trip_plans where visibility = 'public'`));
    console.log(`  measure  before 036: public plans in trip_plans ${publicRows}; visible to an admin ${measured.before}`);

    /* ---- 2. after 036 ------------------------------------------------- */
    console.log('');
    const m36 = apply('036_admin_public_guides.sql');
    check('036 self-check ran and passed', /admin public guides self-check passed/.test(m36.err + m36.out));
    console.log('');
    console.log('  After 036, as an admin:');
    const res = callAs('admin');
    check('the call succeeds as role authenticated with an admin sub', res.ok && !!res.json, res.err.trim());
    const body = res.json || {};
    const rows = body.rows || [];
    check('no error field', !body.error, body.error);
    check('total matches the public plans in the table', body.total === publicRows, `total ${body.total}, table ${publicRows}`);
    check('one row per public plan, and at least one (not vacuous)', rows.length === publicRows && rows.length === 3,
      `rows ${rows.length}`);
    check('newest first by published_at', JSON.stringify(rows.map((r) => r.id)) === JSON.stringify([P_NEW, P_MID, P_OLD]),
      rows.map((r) => r.label).join(' | '));
    const ids = new Set(rows.map((r) => r.id));
    check('private, friends and link plans are absent', ![P_PRIV, P_FRND, P_LINK].some((id) => ids.has(id)));
    const emailOf = Object.fromEntries(users);
    check('every row carries its author\'s auth.users email',
      rows.every((r) => r.email === emailOf[r.userId]), rows.map((r) => `${r.userId}=${r.email}`).join(', '));
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    check('the author with a profile shows handle and name, inGallery true',
      byId[P_NEW]?.handle === 'anna_travels' && byId[P_NEW]?.displayName === 'Anna' && byId[P_NEW]?.inGallery === true);
    check('the author with no profile is still listed, handle null, inGallery false',
      byId[P_MID]?.handle === null && byId[P_MID]?.inGallery === false && byId[P_MID]?.email === 'author.b@example.test');
    const gallery = asRole('anon', 'select count(*) from public.list_public_guides()');
    check('while the public gallery shows only the two with a profile', gallery.ok && gallery.out.trim() === '2',
      gallery.out.trim() || gallery.err.trim());
    check('stops and cities come from trip_plan_stops in position order',
      byId[P_NEW]?.stops === 2 && JSON.stringify(byId[P_NEW]?.cities) === '["Lisbon","Faro"]'
      && byId[P_OLD]?.stops === 0 && JSON.stringify(byId[P_OLD]?.cities) === '[]');
    check('views is 0 on every row and viewsCounted is false (no counter exists)',
      body.viewsCounted === false && rows.every((r) => r.views === 0));
    check('publishedAt is the stamped time',
      new Date(byId[P_OLD]?.publishedAt).toISOString() === '2026-09-01T10:00:00.000Z');
    check('the trip payload does not travel (no payload key, cities only)',
      rows.every((r) => !('payload' in r) && Array.isArray(r.cities)));
    measured.after = rows.length;
    measured.publicRows = publicRows;
    console.log(`  measure  after 036: public plans in trip_plans ${publicRows}; visible to an admin ${rows.length}`);

    /* ---- 3. the door -------------------------------------------------- */
    console.log('');
    console.log('  Who can call it:');
    const plain = callAs('plain');
    check('a signed-in non-admin gets {"error":"forbidden"} and no rows',
      plain.ok && plain.json?.error === 'forbidden' && !('rows' in (plain.json || {})), plain.out.trim() || plain.err.trim());
    const anon = callAs('anon');
    check('anon cannot execute it (permission denied)', !anon.ok && /permission denied/.test(anon.err),
      anon.out.trim() || anon.err.trim().split('\n')[0]);
    for (const who of ['anon', 'plain', 'admin']) {
      const direct = asRole(who, 'select email from auth.users limit 1');
      check(`${who} cannot read auth.users directly, so the email comes only through the definer function`,
        !direct.ok && /permission denied/.test(direct.err), direct.out.trim() || direct.err.trim().split('\n')[0]);
    }
    check('the function is SECURITY DEFINER with search_path pinned to empty',
      scalar(bin, TEST_DB, `select prosecdef || ',' || array_to_string(proconfig, ';') from pg_proc where oid = 'public.admin_list_public_guides()'::regprocedure`) === 'true,search_path=""');
    const auditBefore = scalar(bin, TEST_DB, 'select count(*) from public.admin_audit_log');
    callAs('admin');
    check('a read writes no audit row', scalar(bin, TEST_DB, 'select count(*) from public.admin_audit_log') === auditBefore);
    psql(bin, TEST_DB, ['-c', `insert into public.admin_audit_log (actor, action) select '${ADMIN}', 'get_user' from generate_series(1, 60)`]);
    const slow = callAs('admin');
    check('an admin with 60 audit rows in the last minute gets slow_down', slow.ok && slow.json?.error === 'slow_down',
      slow.out.trim() || slow.err.trim());
    psql(bin, TEST_DB, ['-c', `delete from public.admin_audit_log where actor = '${ADMIN}' and action = 'get_user'`]);

    /* ---- 4. unpublish ------------------------------------------------- */
    console.log('');
    console.log('  Unpublishing:');
    psql(bin, TEST_DB, ['-c', `update public.trip_plans set visibility = 'private' where id = '${P_MID}'`]);
    const after4 = callAs('admin').json || {};
    check('an unpublished plan leaves the list on the next call',
      after4.total === 2 && (after4.rows || []).length === 2 && !(after4.rows || []).some((r) => r.id === P_MID));
    psql(bin, TEST_DB, ['-c', `update public.trip_plans set visibility = 'public' where id = '${P_MID}'`]);
    const after4b = callAs('admin').json || {};
    check('republished, it is back and restamped as the newest',
      (after4b.rows || [])[0]?.id === P_MID && after4b.total === 3);

    /* ---- 5. paste twice ----------------------------------------------- */
    console.log('');
    console.log('  Pasting 036 again:');
    const again = apply('036_admin_public_guides.sql');
    check('036 pasted twice still passes its self-check', /admin public guides self-check passed/.test(again.err + again.out));
    check('still one function by that name',
      scalar(bin, TEST_DB, `select count(*) from pg_proc where proname = 'admin_list_public_guides'`) === '1');

    /* ---- 6. no silent cap --------------------------------------------- */
    console.log('');
    console.log('  At volume:');
    psql(bin, TEST_DB, ['-c', `insert into public.trip_plans (user_id, label, visibility)
      select '${AUTHOR_A}', 'bulk ' || g, 'public' from generate_series(1, 500) g`]);
    const t0 = Date.now();
    const bulk = callAs('admin');
    const ms = Date.now() - t0;
    const bulkRows = (bulk.json?.rows || []).length;
    const bulkTable = Number(scalar(bin, TEST_DB, `select count(*) from public.trip_plans where visibility = 'public'`));
    check('with 503 public plans every one comes back', bulk.ok && bulkRows === bulkTable && bulkTable === 503,
      `rows ${bulkRows}, table ${bulkTable}`);
    const ord = (bulk.json?.rows || []).map((r) => r.publishedAt);
    check('still in published_at desc order', ord.every((v, i) => i === 0 || new Date(ord[i - 1]) >= new Date(v)));
    console.log(`  measure  503 public plans: ${bulkRows} rows, ${bulk.out.length} bytes of JSON, ${ms} ms wall time including psql start`);
    measured.bulk = { rows: bulkRows, bytes: bulk.out.length, ms };
  } finally {
    if (work) { try { rmSync(work, { recursive: true, force: true }); } catch { /* temp dir */ } }
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
  }
  return measured;
}

console.log('admin_list_public_guides lists every public guide with author and views (migration 036)');
console.log('-------------------------------------------------------------------------------------');

let skipped = false;
let skipReason = '';
const bin = findPsql();
if (!bin) {
  skipped = true;
  skipReason = 'psql was not found on PATH or at a standard PostgreSQL install path.';
} else {
  const r = psqlRun(bin, 'postgres', ['-At', '-c', 'select 1']);
  if (!r.ok) {
    skipped = true;
    skipReason = `could not connect to ${PG.user}@${PG.host}:${PG.port}. ${r.err.trim()}`;
  }
}

if (skipped) {
  console.log('');
  console.log('  SKIPPED. No database was reached, so NOTHING about the public guides index');
  console.log('  was tested. This run proves nothing.');
  console.log(`  Reason: ${skipReason}`);
  console.log('');
  console.log('  To run it, point the script at a PostgreSQL server you can write to');
  console.log('  without a password prompt, for example a throwaway trust-auth cluster:');
  console.log('    initdb -D <dir> -U postgres --auth=trust');
  console.log('    pg_ctl -D <dir> -o "-p 55434" start');
  console.log('    PGPORT=55434 node continent-app/scripts/admin/test_admin_public_guides.mjs');
  console.log('');
  process.exit(0);
}

let measured = null;
try {
  measured = runTests(bin);
} catch (err) {
  failures += 1;
  console.error(`FAIL  the run aborted: ${err.message}`);
}

if (measured && measured.before !== undefined && measured.after !== undefined) {
  console.log('');
  console.log(`  public guides visible to an admin through the RPC: ${measured.before} before 036, `
    + `${measured.after} of ${measured.publicRows} public plans after`);
}
console.log('');
console.log(`${checks} assertions, ${checks - failures} passing, ${failures} failing.`);
if (failures) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
if (checks === 0) {
  // Vacuous-gate rule: zero assertions is not a pass.
  console.error('No assertions ran; treating this as a failure.');
  process.exit(1);
}
console.log('All public guides index tests passed.');
