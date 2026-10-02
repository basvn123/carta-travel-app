/**
 * Tests for migration 040 and the client wrappers that write to it: the AI
 * failures a traveller sees as a message are stored in public.edge_errors.
 *
 *   PGPORT=55434 node continent-app/scripts/admin/test_edge_errors.mjs
 *
 * WHAT IT PROVES, in order:
 *
 *   0. The chain applies: 002, 004, 006, 007, 009, 010, 011, 014 to 018,
 *      032 to 034 (034 is the current admin_guard), then 040 with its
 *      self-check notice. 018 goes in because 033 and 034 check for it.
 *   1. BEFORE 040: there is no table to write to, log_edge_error does not
 *      exist, and admin_health does not list edge_errors.
 *   2. The closed doors: anon cannot execute the writer or the reader and
 *      cannot read the table; a signed-in user cannot select, insert, update
 *      or delete rows directly; a plain user gets forbidden from the reader.
 *   3. The writer: every recorded code from every function lands with the
 *      caller's id, origin and statuses; a code outside the four, an unknown
 *      function, a bad origin, a null session and nulls everywhere write
 *      nothing and raise nothing; statuses outside 100 to 599 are stored as
 *      null; the table has exactly the eight agreed columns.
 *   4. The limits: the 101st failure of one user in a day is dropped while
 *      another user still writes; a full global day drops the next call;
 *      a row older than 90 days is pruned by the next write and a row of 89
 *      days is kept.
 *   5. The reader: totals, distinct users, per code with the client share,
 *      per function, per upstream status, a zero-filled daily series, the
 *      window capped at 90 days; admin_health lists edge_errors as present.
 *   6. Deleting an account keeps the count and drops the identity.
 *   7. The client path, end to end: the real aiDayPlan.js, aiCitySuggest.js
 *      and bookingImport.js are imported with the Supabase client swapped
 *      for a stub whose functions.invoke answers the way the live functions
 *      fail, and whose rpc runs the call in this database as a signed-in
 *      user. Each failure is written before the wrapper resolves, the rows
 *      carry the right function, code, origin and statuses, and codes that
 *      are the traveller's own state (auth, user_cap, too_few, no_ai) and a
 *      success write nothing.
 *   8. Pasting 040 twice is safe and keeps the rows.
 *
 * HOW. The harness of test_admin_unpublish_guide.mjs (T069), sliced from
 * that file, with its stubs unchanged. Client calls run as `set role anon`
 * or `set role authenticated` with request.jwt.claims set, the way PostgREST
 * does. The client path uses a module.register resolve hook that serves
 * src/lib/supabaseClient.js from a data: URL, so no bundler is needed.
 *
 * NEEDS a PostgreSQL server that accepts a password-less connection (trust
 * auth or PGPASSWORD). Set PGHOST, PGPORT, PGUSER as needed; defaults are
 * 127.0.0.1:5432, postgres. With no server reachable the script SKIPS
 * LOUDLY, exits 0, and never prints that anything passed.
 *
 * It creates and drops a database named carta_t071_test. It never touches
 * the live Supabase project.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';
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
const TEST_DB = process.env.CARTA_TEST_DB || 'carta_t071_test';

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

const ADMIN = '00000000-0000-0000-0000-00000000ad01'; // an admin, acting through the client
const PLAIN = '00000000-0000-0000-0000-00000000c001'; // a signed-in traveller
const OTHER = '00000000-0000-0000-0000-00000000c002'; // a second traveller
const HEAVY = '00000000-0000-0000-0000-00000000c003'; // hits the per-user cap
const GONE = '00000000-0000-0000-0000-00000000c004';  // deletes their account

const CODES = ['ai_timeout', 'ai_bad_output', 'url_unreachable', 'ai_error'];
const FNS = ['plan-day', 'suggest-city', 'parse-booking'];

async function runTests(bin) {
  let work = null;
  const measured = {};
  try {
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
    psql(bin, 'postgres', ['-c', `create database ${TEST_DB}`]);

    work = mkdtempSync(join(tmpdir(), 'carta-t071-'));
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

    apply('018_content_overrides.sql');
    for (const name of ['032_admin_mfa_destructive.sql', '033_admin_audit_rollback.sql',
      '034_admin_guard_tiers.sql']) {
      apply(name);
    }

    /* ---- seed --------------------------------------------------------- */
    for (const [id, email] of [[ADMIN, 'owner@example.test'], [PLAIN, 'plain@example.test'],
      [OTHER, 'other@example.test'], [HEAVY, 'heavy@example.test'], [GONE, 'gone@example.test']]) {
      psql(bin, TEST_DB, ['-c', `insert into auth.users (id, email) values ('${id}', '${email}')`]);
    }
    psql(bin, TEST_DB, ['-c', `insert into public.admin_users (user_id, note) values ('${ADMIN}', 'owner')`]);

    const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
    const claimsOf = (sub) => ({ sub, role: 'authenticated', aal: 'aal1' });
    const AS = {
      admin: { role: 'authenticated', claims: claimsOf(ADMIN) },
      plain: { role: 'authenticated', claims: claimsOf(PLAIN) },
      other: { role: 'authenticated', claims: claimsOf(OTHER) },
      heavy: { role: 'authenticated', claims: claimsOf(HEAVY) },
      gone: { role: 'authenticated', claims: claimsOf(GONE) },
      anon: { role: 'anon', claims: { role: 'anon' } },
    };
    const roleArgs = (who, sql) => ['-At',
      '-c', `set request.jwt.claims = ${q(JSON.stringify(AS[who].claims))}`,
      '-c', `set role ${AS[who].role}`, '-c', sql];
    const asRole = (who, sql) => psqlRun(bin, TEST_DB, roleArgs(who, sql));
    const parse = (r) => {
      let json = null;
      if (r.ok) { try { json = JSON.parse(r.out.trim()); } catch { /* left null */ } }
      return { ...r, json };
    };
    const lit = (v) => (v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : q(v));
    const logAs = (who, fn, code, origin = 'edge', http = null, upstream = null) => asRole(who,
      `select public.log_edge_error(${lit(fn)}, ${lit(code)}, ${lit(origin)}, ${lit(http)}, ${lit(upstream)})`);
    const count = (sql) => Number(scalar(bin, TEST_DB, sql));
    const rows = () => count('select count(*) from public.edge_errors');
    const report = (who, days) => parse(asRole(who, `select public.admin_edge_errors(${days})`));

    /* ---- 1. before 040 ------------------------------------------------ */
    measured.tableBefore = scalar(bin, TEST_DB, `select to_regclass('public.edge_errors') is not null`);
    check('before 040 there is no edge_errors table', measured.tableBefore === 'f');
    const pre = logAs('plain', 'plan-day', 'ai_timeout', 'edge', 504);
    check('before 040 log_edge_error does not exist', !pre.ok && /does not exist/.test(pre.err), pre.err.trim().split('\n')[0]);
    const hBefore = parse(asRole('admin', 'select public.admin_health()'));
    check('before 040 admin_health does not list edge_errors',
      hBefore.json && hBefore.json.tables && !('edge_errors' in hBefore.json.tables), hBefore.out);

    const m40 = apply('040_edge_errors.sql');
    check('040 self-check ran and passed', /edge errors self-check passed/.test(m40.err + m40.out));
    check('the self-check left no row behind', rows() === 0);

    /* ---- 2. closed doors ---------------------------------------------- */
    const anonW = logAs('anon', 'plan-day', 'ai_timeout');
    check('anon cannot execute log_edge_error', !anonW.ok && /permission denied/.test(anonW.err), anonW.err.trim());
    const anonR = asRole('anon', 'select public.admin_edge_errors(30)');
    check('anon cannot execute admin_edge_errors', !anonR.ok && /permission denied/.test(anonR.err), anonR.err.trim());
    const anonT = asRole('anon', 'select count(*) from public.edge_errors');
    check('anon cannot read edge_errors', !anonT.ok && /permission denied/.test(anonT.err), anonT.err.trim());
    for (const [label, sql] of [
      ['select', 'select count(*) from public.edge_errors'],
      ['insert', `insert into public.edge_errors (user_id, fn, code) values ('${PLAIN}', 'plan-day', 'ai_timeout')`],
      ['update', `update public.edge_errors set code = 'ai_error'`],
      ['delete', 'delete from public.edge_errors'],
      ['read the daily total', 'select count(*) from public.edge_error_daily_total'],
    ]) {
      const r = asRole('plain', sql);
      check(`a signed-in user cannot ${label} directly`, !r.ok && /permission denied/.test(r.err), r.err.trim() || r.out);
    }
    const plainR = report('plain', 30);
    check('a plain user gets forbidden from admin_edge_errors', plainR.json?.error === 'forbidden', plainR.out || plainR.err);
    const plainH = parse(asRole('plain', 'select public.admin_health()'));
    check('a plain user gets forbidden from admin_health', plainH.json?.error === 'forbidden', plainH.out || plainH.err);

    /* ---- 3. the writer ------------------------------------------------ */
    for (const fn of FNS) {
      for (const code of CODES) {
        const r = logAs('plain', fn, code, 'edge', 502, 503);
        check(`a signed-in user records ${fn} ${code}`, r.ok, r.err.trim());
      }
    }
    check('twelve calls wrote twelve rows', rows() === 12, String(rows()));
    check('every row carries the caller, origin and both statuses',
      count(`select count(*) from public.edge_errors where user_id = '${PLAIN}' and origin = 'edge'
               and http_status = 502 and upstream_status = 503`) === 12);
    logAs('plain', 'plan-day', 'ai_bad_output', 'client');
    check('origin client is stored', count(`select count(*) from public.edge_errors where origin = 'client'`) === 1);
    logAs('plain', 'plan-day', 'ai_timeout', 'edge', 42, 1000);
    check('statuses outside 100 to 599 are stored as null',
      count(`select count(*) from public.edge_errors where id = (select max(id) from public.edge_errors)
               and http_status is null and upstream_status is null`) === 1);

    const before3 = rows();
    const refused = [
      ['a code outside the four (auth)', ['plan-day', 'auth']],
      ['a code outside the four (user_cap)', ['plan-day', 'user_cap']],
      ['a code outside the four (network)', ['parse-booking', 'network']],
      ['an unknown function', ['book-hotel', 'ai_timeout']],
      ['a bad origin', ['plan-day', 'ai_timeout', 'server']],
      ['nulls everywhere', [null, null, null]],
      ['an essay as a code', ['plan-day', 'x'.repeat(5000)]],
    ];
    for (const [label, args] of refused) {
      const r = logAs('plain', ...args);
      check(`${label} writes nothing and raises nothing`, r.ok && rows() === before3, r.err.trim());
    }
    const noSess = psqlRun(bin, TEST_DB, ['-At', '-c', 'set role authenticated',
      '-c', `select public.log_edge_error('plan-day', 'ai_timeout')`]);
    check('an authenticated role with no subject writes nothing', noSess.ok && rows() === before3, noSess.err.trim());
    const cols = scalar(bin, TEST_DB, `select string_agg(column_name, ',' order by ordinal_position)
      from information_schema.columns where table_schema = 'public' and table_name = 'edge_errors'`);
    check('the table has exactly the eight agreed columns, none for IP, agent, page or content',
      cols === 'id,at,user_id,fn,code,origin,http_status,upstream_status', cols);

    /* ---- 4. the limits ------------------------------------------------ */
    psql(bin, TEST_DB, ['-c', `insert into public.edge_errors (at, user_id, fn, code)
      select now() - interval '1 hour', '${HEAVY}', 'plan-day', 'ai_timeout' from generate_series(1, 100)`]);
    const heavyBefore = count(`select count(*) from public.edge_errors where user_id = '${HEAVY}'`);
    const hv = logAs('heavy', 'plan-day', 'ai_timeout');
    check('the 101st failure of one user in a day is dropped',
      hv.ok && count(`select count(*) from public.edge_errors where user_id = '${HEAVY}'`) === heavyBefore);
    const ot = logAs('other', 'plan-day', 'ai_timeout');
    check('another user still writes while one is capped',
      ot.ok && count(`select count(*) from public.edge_errors where user_id = '${OTHER}'`) === 1);
    psql(bin, TEST_DB, ['-c', `update public.edge_errors set at = now() - interval '25 hours' where user_id = '${HEAVY}'`]);
    logAs('heavy', 'plan-day', 'ai_timeout');
    check('the per-user cap is a rolling day, not forever',
      count(`select count(*) from public.edge_errors where user_id = '${HEAVY}'`) === heavyBefore + 1);

    const saved = scalar(bin, TEST_DB, 'select n from public.edge_error_daily_total where day = current_date');
    psql(bin, TEST_DB, ['-c', 'update public.edge_error_daily_total set n = 50000 where day = current_date']);
    const beforeCap = rows();
    logAs('other', 'suggest-city', 'ai_error');
    check('a full global day drops the next call', rows() === beforeCap);
    psql(bin, TEST_DB, ['-c', `update public.edge_error_daily_total set n = ${Number(saved)} where day = current_date`]);

    psql(bin, TEST_DB, ['-c', `insert into public.edge_errors (at, user_id, fn, code) values
      (now() - interval '91 days', '${OTHER}', 'plan-day', 'ai_error'),
      (now() - interval '89 days', '${OTHER}', 'plan-day', 'ai_bad_output')`]);
    measured.expired = count(`select count(*) from public.edge_errors where at < now() - interval '90 days'`);
    logAs('other', 'parse-booking', 'url_unreachable', 'edge', 400, 403);
    measured.expiredAfter = count(`select count(*) from public.edge_errors where at < now() - interval '90 days'`);
    check('a row older than 90 days is pruned by the next write', measured.expired === 1 && measured.expiredAfter === 0);
    check('a row of 89 days is kept',
      count(`select count(*) from public.edge_errors where at < now() - interval '88 days'`) === 1);

    /* ---- 5. the reader ------------------------------------------------ */
    psql(bin, TEST_DB, ['-c', 'truncate public.edge_errors, public.edge_error_daily_total']);
    logAs('plain', 'plan-day', 'ai_timeout', 'edge', 504);
    logAs('plain', 'plan-day', 'ai_timeout', 'edge', 504);
    logAs('plain', 'parse-booking', 'url_unreachable', 'edge', 400, 403);
    logAs('plain', 'suggest-city', 'ai_bad_output', 'client');
    logAs('other', 'plan-day', 'ai_error', 'edge', 502, 429);
    const rep = report('admin', 7);
    const j = rep.json || {};
    check('an admin gets the report', rep.ok && !j.error, rep.err.trim() || rep.out);
    check('total 5 and 2 distinct users', j.total === 5 && j.users === 2, JSON.stringify([j.total, j.users]));
    const byCode = Object.fromEntries((j.byCode || []).map((c) => [c.code, c]));
    check('byCode counts and users', byCode.ai_timeout?.n === 2 && byCode.ai_timeout?.users === 1
      && byCode.url_unreachable?.n === 1 && byCode.ai_error?.n === 1 && byCode.ai_bad_output?.n === 1,
    JSON.stringify(j.byCode));
    check('byCode carries the client share', byCode.ai_bad_output?.client === 1 && byCode.ai_timeout?.client === 0);
    check('byCode is ordered by count', j.byCode?.[0]?.code === 'ai_timeout');
    check('byFunction names the function',
      (j.byFunction || []).some((f) => f.fn === 'parse-booking' && f.code === 'url_unreachable' && f.n === 1)
      && (j.byFunction || []).some((f) => f.fn === 'plan-day' && f.code === 'ai_timeout' && f.n === 2),
    JSON.stringify(j.byFunction));
    const up = (j.byUpstream || []).map((u) => `${u.code}:${u.status}:${u.n}`).sort().join(',');
    check('byUpstream separates the site 403 from the Gemini 429', up === 'ai_error:429:1,url_unreachable:403:1', up);
    check('the daily series is zero-filled over the window', Array.isArray(j.daily) && j.daily.length === 8
      && j.daily.reduce((s, d) => s + d.n, 0) === 5 && j.daily.filter((d) => d.n === 0).length === 7,
    JSON.stringify(j.daily?.map((d) => d.n)));
    const today = j.daily?.[j.daily.length - 1] || {};
    check('the daily series splits the codes', today.timeout === 2 && today.unreachable === 1
      && today.badOutput === 1 && today.error === 1, JSON.stringify(today));
    check('lastAt is set and retentionDays is 90', !!j.lastAt && j.retentionDays === 90);
    const wide = report('admin', 365).json || {};
    check('a 365-day window is capped at the 90-day retention', wide.days === 90 && wide.daily?.length === 91,
      JSON.stringify([wide.days, wide.daily?.length]));
    check('the report carries no row, no user id, no timestamp per failure',
      !/0000-0000-0000/.test(rep.out) && !('rows' in j) && !('events' in j));
    const hAfter = parse(asRole('admin', 'select public.admin_health()'));
    check('admin_health lists edge_errors as present', hAfter.json?.tables?.edge_errors === true, hAfter.out);
    check('admin_health still lists the 016 tables', hAfter.json?.tables?.admin_audit_log === true
      && Object.keys(hAfter.json?.tables || {}).length === 16, JSON.stringify(Object.keys(hAfter.json?.tables || {})));

    /* ---- 6. account deletion ------------------------------------------ */
    logAs('gone', 'plan-day', 'ai_timeout');
    const n6 = rows();
    psql(bin, TEST_DB, ['-c', `delete from auth.users where id = '${GONE}'`]);
    check('deleting an account keeps the count', rows() === n6);
    check('and drops the identity', count(`select count(*) from public.edge_errors where user_id = '${GONE}'`) === 0
      && count('select count(*) from public.edge_errors where user_id is null') === 1);

    /* ---- 7. the client path, end to end ------------------------------- */
    psql(bin, TEST_DB, ['-c', 'truncate public.edge_errors, public.edge_error_daily_total']);
    const events = [];
    let answer = null;
    globalThis.__fakeSupabase = {
      functions: { invoke: async (fn) => { events.push(`invoke:${fn}`); return answer(); } },
      rpc: (fn, args) => {
        events.push(`rpc:${fn}`);
        const r = fn === 'log_edge_error'
          ? logAs('plain', args.p_fn, args.p_code, args.p_origin, args.p_http, args.p_upstream)
          : { ok: false, err: `unexpected rpc ${fn}` };
        return Promise.resolve({ data: null, error: r.ok ? null : { message: r.err } });
      },
    };
    const hook = `export async function resolve(spec, ctx, next) {
  if (spec.endsWith('/lib/supabaseClient.js')) {
    return { shortCircuit: true, url: 'data:text/javascript,export const supabase = globalThis.__fakeSupabase; export const authConfigured = true;' };
  }
  return next(spec, ctx);
}`;
    register(`data:text/javascript,${encodeURIComponent(hook)}`);
    const src = resolve(here, '../../src/planner');
    const { requestAiDayPlan } = await import(pathToFileURL(join(src, 'aiDayPlan.js')).href);
    const { requestCitySuggestion } = await import(pathToFileURL(join(src, 'aiCitySuggest.js')).href);
    const { requestBookingImport } = await import(pathToFileURL(join(src, 'bookingImport.js')).href);
    const call = { 'plan-day': requestAiDayPlan, 'suggest-city': requestCitySuggestion, 'parse-booking': requestBookingImport };

    const httpErr = (status, body) => () => ({ data: null,
      error: { context: { status, json: async () => { if (body === null) throw new Error('not json'); return body; } } } });
    const ok = (data) => () => ({ data, error: null });
    const recorded = [
      // [fn, answer, code the wrapper returns, expected row fn|code|origin|http|upstream]
      ['plan-day', httpErr(504, { code: 'ai_timeout' }), 'ai_timeout', 'plan-day|ai_timeout|edge|504|'],
      ['plan-day', httpErr(502, { code: 'ai_error', status: 429 }), 'ai_error', 'plan-day|ai_error|edge|502|429'],
      ['plan-day', ok({ stops: [] }), 'ai_bad_output', 'plan-day|ai_bad_output|client||'],
      ['suggest-city', httpErr(502, { code: 'ai_bad_output' }), 'ai_bad_output', 'suggest-city|ai_bad_output|edge|502|'],
      ['suggest-city', ok({ nope: true }), 'ai_bad_output', 'suggest-city|ai_bad_output|client||'],
      ['parse-booking', httpErr(400, { code: 'url_unreachable', status: 403 }), 'url_unreachable', 'parse-booking|url_unreachable|edge|400|403'],
      ['parse-booking', httpErr(500, null), 'ai_error', 'parse-booking|ai_error|edge|500|'],
      // FunctionsFetchError: the request never got an answer.
      ['parse-booking', () => ({ data: null, error: { context: new TypeError('Failed to fetch') } }), 'ai_error', 'parse-booking|ai_error|edge||'],
    ];
    const rowOf = () => scalar(bin, TEST_DB, `select fn || '|' || code || '|' || origin || '|' || coalesce(http_status::text, '')
        || '|' || coalesce(upstream_status::text, '') from public.edge_errors order by id desc limit 1`);
    for (const [fn, a, code, expected] of recorded) {
      answer = a;
      events.length = 0;
      const n0 = rows();
      const res = await call[fn]({});
      events.push('resolved');
      check(`${fn} ${expected}: the wrapper still returns ${code}`, res && res.ok === false && res.code === code, JSON.stringify(res));
      check(`${fn} ${expected}: one row, written before the wrapper resolved`,
        rows() === n0 + 1 && events.indexOf('rpc:log_edge_error') > -1
        && events.indexOf('rpc:log_edge_error') < events.indexOf('resolved'), events.join(','));
      check(`${fn} ${expected}: the row is right`, rowOf() === expected, rowOf());
    }
    measured.clientRows = rows();
    measured.clientCalls = recorded.length;

    const quiet = [
      ['plan-day', httpErr(401, { code: 'auth' }), 'auth'],
      ['plan-day', httpErr(429, { code: 'user_cap' }), 'user_cap'],
      ['plan-day', httpErr(429, { code: 'global_cap' }), 'global_cap'],
      ['plan-day', httpErr(400, { code: 'too_few' }), 'too_few'],
      ['plan-day', httpErr(404, { code: 'NOT_FOUND' }), 'no_ai'],
      ['suggest-city', httpErr(503, { code: 'quota_check' }), 'quota_check'],
      ['parse-booking', httpErr(400, { code: 'url_empty' }), 'url_empty'],
      ['parse-booking', ok({ code: 'nothing_found' }), 'nothing_found'],
      ['plan-day', ok({ stops: [{ id: '1', name: 'A' }] }), null],
      ['suggest-city', ok({ suggestions: [] }), null],
      ['parse-booking', ok({ bookings: [] }), null],
    ];
    for (const [fn, a, code] of quiet) {
      answer = a;
      events.length = 0;
      const n0 = rows();
      const res = await call[fn]({});
      const label = code ? `${fn} ${code}` : `${fn} success`;
      check(`${label}: no row and no rpc`, rows() === n0 && !events.includes('rpc:log_edge_error'),
        `${JSON.stringify(res)} ${events.join(',')}`);
    }

    // An rpc that fails (040 not pasted yet) must not change what the
    // traveller gets back, and must not throw.
    globalThis.__fakeSupabase.rpc = () => Promise.resolve({ data: null,
      error: { message: 'Could not find the function public.log_edge_error' } });
    answer = httpErr(504, { code: 'ai_timeout' });
    const unpasted = await requestAiDayPlan({});
    check('with 040 not pasted the wrapper still returns ai_timeout', unpasted?.code === 'ai_timeout');
    globalThis.__fakeSupabase.rpc = () => Promise.reject(new Error('offline'));
    const offline = await requestAiDayPlan({});
    check('a rejected rpc is swallowed and the wrapper still returns ai_timeout', offline?.code === 'ai_timeout');

    /* ---- 8. pasting twice --------------------------------------------- */
    const keep = rows();
    const again = apply('040_edge_errors.sql');
    check('040 pasted twice runs its self-check again', /edge errors self-check passed/.test(again.err + again.out));
    check('and keeps the rows', rows() === keep);
    measured.after = true;
  } finally {
    if (work) { try { rmSync(work, { recursive: true, force: true }); } catch { /* temp dir */ } }
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
  }
  return measured;
}
console.log('AI failures are stored in edge_errors (migration 040 and the client wrappers)');
console.log('-----------------------------------------------------------------------------');

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
  console.log('  SKIPPED. No database was reached, so NOTHING about the error store');
  console.log('  was tested. This run proves nothing.');
  console.log(`  Reason: ${skipReason}`);
  console.log('');
  console.log('  To run it, point the script at a PostgreSQL server you can write to');
  console.log('  without a password prompt, for example a throwaway trust-auth cluster:');
  console.log('    initdb -D <dir> -U postgres --auth=trust');
  console.log('    pg_ctl -D <dir> -o "-p 55434" start');
  console.log('    PGPORT=55434 node continent-app/scripts/admin/test_edge_errors.mjs');
  console.log('');
  process.exit(0);
}

let measured = null;
try {
  measured = await runTests(bin);
} catch (err) {
  failures += 1;
  console.error(`FAIL  the run aborted: ${err.message}`);
}

if (measured && measured.after) {
  console.log('');
  console.log(`  before 040, an edge_errors table existed: ${measured.tableBefore === 't' ? 'yes' : 'no'}`);
  console.log(`  client failures sent through the real wrappers: ${measured.clientCalls}, rows stored: ${measured.clientRows}`);
  console.log(`  rows older than 90 days across one write: ${measured.expired} -> ${measured.expiredAfter}`);
}
console.log('');
console.log(`${checks} assertions, ${checks - failures} passing, ${failures} failing.`);
if (failures) {
  console.error(`
${failures} test(s) failed`);
  process.exit(1);
}
if (checks === 0) {
  // Vacuous-gate rule: zero assertions is not a pass.
  console.error('No assertions ran; treating this as a failure.');
  process.exit(1);
}
console.log('All edge error tests passed.');
