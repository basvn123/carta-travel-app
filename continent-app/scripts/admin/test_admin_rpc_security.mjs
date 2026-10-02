/**
 * The admin surface stays closed to a normal signed-in user.
 *
 *   PGPORT=55435 node continent-app/scripts/admin/test_admin_rpc_security.mjs
 *
 * WHAT THIS IS FOR. Every other admin test in this directory checks one
 * migration's behaviour. This one checks a property of the whole surface, and
 * it is the only test that fails when a FUTURE migration gets it wrong. The
 * threat is not a broken function; it is a new function. Someone adds
 * admin_list_widgets in migration 044, copies the grant line from a neighbour
 * but forgets the `v_err := public.admin_guard(...)` line, and every signed-in
 * traveller can read the widget table. Nothing else in the repo notices.
 *
 * WHY THE LIST OF FUNCTIONS IS NOT WRITTEN DOWN HERE. A hardcoded array of
 * the admin_* functions would pass forever while that gap sat open, because
 * the new function would simply not be in the array. So the list is discovered
 * from the live catalogue: after the migrations are applied, the test asks
 * pg_proc for every function named admin_* in the public schema and iterates
 * over what it finds. The migrations themselves are read from the directory
 * too (T268, register row T077-a): every NNN_*.sql file in
 * supabase/migrations, in filename order, which is the order the owner
 * pastes them. Add a function in a later migration and this test starts
 * asserting on it with no edit at all. That is the whole design. The count is asserted against a floor, never
 * an equality, so adding a guarded function does not fail the build, but a
 * discovery that returns nothing does.
 *
 * THE TWO CLASSES OF FUNCTION, and why they need different assertions:
 *
 *   CALLABLE. Granted to `authenticated`, so PostgREST exposes them as RPCs.
 *   These must not throw and must not do the work: they call admin_guard()
 *   first, and it returns the string 'forbidden' for anyone not in
 *   admin_users. The Carta convention is that the function then RETURNS
 *   {"error": "forbidden"} rather than raising. So the assertion is on the
 *   returned payload, not on an exception. The task prompt asks for "throws a
 *   forbidden exception"; the schema does not work that way, and a test
 *   written to expect an exception would fail against a correctly guarded
 *   function. What matters is that the call is refused and nothing changes,
 *   and that is what is asserted. The report explains the divergence.
 *
 *   INTERNAL (admin_guard, admin_log, admin_user_counts). Never granted to
 *   anyone, so a normal user cannot reach them at all. Calling one must be
 *   refused with permission denied. Asserting "returns forbidden" for these
 *   would be wrong; asserting they are unreachable is the real property.
 *
 *   admin_set_infra_cost is granted to service_role only, so `authenticated`
 *   hits the same permission-denied wall. It is classified by its actual ACL,
 *   read from pg_proc, not by a list kept here.
 *
 * WHAT ELSE IS ASSERTED, per function, all of it read from the catalogue so a
 * new function is covered automatically:
 *
 *   1. It is SECURITY DEFINER. A SECURITY INVOKER admin function would run as
 *      the caller and be stopped by RLS instead of by the guard, which is a
 *      different and weaker posture.
 *   2. Its search_path is pinned. An unpinned search_path on a SECURITY
 *      DEFINER function is the classic privilege-escalation hole: the caller
 *      points search_path at a schema they own and the function reads their
 *      table instead of public's.
 *   3. `anon` cannot execute it. Signed-out is refused earlier than
 *      signed-in-but-not-admin.
 *   4. Its body mentions admin_guard. This is the static half of the check and
 *      it is deliberately crude: it catches the copy-paste-without-the-guard
 *      mistake even where the dynamic check might pass for the wrong reason (a
 *      function that happens to return an empty list to a non-admin is not the
 *      same as one that refuses). admin_guard and admin_log are exempt: the
 *      guard cannot call itself, and admin_log is the writer the guarded
 *      functions call after the guard has already passed.
 *
 * AND THE CONTROL. A test that asserts refusal only can pass because the
 * database is broken, the role is wrong, or every call errored for an
 * unrelated reason. So each callable function is also called as a REAL admin
 * and asserted NOT to answer 'forbidden'. If the admin path is also refused,
 * the refusal proves nothing and the run says so. This is the vacuous-gate
 * rule from CLAUDE.md applied to a permission test.
 *
 * AFTER THE SURFACE CHECKS (T284). Four named sections follow the discovered
 * ones. 7 tests admin_guard's rate budget, which nothing tested before
 * (register row T300-o, raised against T034): a burst of 70 reads spends no
 * budget, 60 logged actions in a minute refuse every tier with slow_down, 10
 * destructive ones refuse the destructive tier only, another actor's rows do
 * not count, and the window ends after 60 seconds. 8 to 10 test what
 * migration 047 added: admin_adjust_expiry moves the date and keeps the
 * allowance period, with one audit row per change; admin_edge_errors keeps
 * client crashes off the AI figures; admin_set_override takes the cycle layer.
 * 11 tests migration 048 (T315): launch_count counts per day with no
 * identifier, drops unknown events, partners and visitor AI calls, holds the
 * 200,000-a-day total and the 2,000-keys-a-day cap, and admin_launch_metrics
 * adds up and divides AI failures by calls from the first counted day.
 *
 * HOW. The harness of test_override_review.mjs (T074) and test_admin_mfa.mjs
 * (T063): stub schema auth, auth.users, auth.uid(), auth.jwt() and the three
 * Supabase roles, apply the migrations through psql with spawnSync so the
 * self-check NOTICEs survive, and call every RPC as the `authenticated` role
 * with request.jwt.claims set, which is exactly what PostgREST does.
 *
 * Migration 018 applies as committed: T253 moved its URL length cap out of
 * the regex bound, so no patched copy is needed.
 *
 * SUPABASE'S DEFAULT GRANTS. A Supabase project grants anon, authenticated
 * and service_role all privileges on new tables, sequences and functions in
 * public by default, and every migration is written against that (each one
 * revokes what it must). The stubs reproduce those defaults. Without them
 * 023's self-check, which reads trip_plans as a client role, fails, which
 * was one of the unexpressed prerequisites that kept this list manual. With
 * them, the anon assertions below are also stricter: a function that forgets
 * its revoke is caught the way it would be exposed live.
 *
 * NEEDS a PostgreSQL server that accepts a password-less connection (trust
 * auth or PGPASSWORD). Set PGHOST, PGPORT, PGUSER as needed; defaults are
 * 127.0.0.1:5432, postgres. With no server reachable the script SKIPS LOUDLY,
 * exits 0, and never prints that anything passed.
 *
 * It creates and drops a database named carta_t077_test. It never touches the
 * live Supabase project.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
// CARTA_REPO_ROOT names the root checkout when continent-app is a sibling worktree (T281).
const repoRoot = process.env.CARTA_REPO_ROOT || resolve(here, '../../..');
const migrations = process.env.CARTA_MIGRATIONS_DIR || resolve(repoRoot, 'supabase/migrations');

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
const TEST_DB = process.env.CARTA_TEST_DB || 'carta_t077_test';

/**
 * The floor on how many admin_* functions the discovery must find. It is a
 * floor, not an equality: adding a guarded function must not fail the build,
 * but a discovery that silently returns nothing or a handful (the vacuous
 * gate) must. 41 is what the whole directory defines as of 048 (T315 added
 * admin_launch_metrics); it was 40 as of 047 (T284 added admin_adjust_expiry),
 * 39 as of 045 (T268) and 37 when the list of
 * migrations was still written by hand.
 */
const MIN_FUNCTIONS = 41;

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

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

const ADMIN = '00000000-0000-0000-0000-00000000ad01'; // a real admin, the control
const PLAIN = '00000000-0000-0000-0000-00000000c001'; // a normal signed-in user
const VICTIM = '00000000-0000-0000-0000-00000000c002'; // a target for the write paths

/**
 * Every migration in the directory, in filename order: NNN_name.sql only, so
 * a scratch file or a README cannot slip in. Read once, at load. The floor
 * below catches a directory that silently came back short.
 */
const MIGRATIONS = readdirSync(migrations)
  .filter((f) => /^\d{3}_.+\.sql$/.test(f))
  .sort();
const MIN_MIGRATIONS = 47; // 002 to 048 as of T315 (the directory has no 001)

/**
 * A safe argument for every parameter type the admin surface uses. The call is
 * expected to be refused before the arguments are looked at, so these only
 * have to type-check. Where a uuid could name a real row, VICTIM is used, so
 * the admin control call exercises a real path rather than bouncing off
 * not_found. admin_set_tier validates its tier name early enough to matter,
 * so it gets a real tier.
 */
function argFor(type, fname) {
  switch (type) {
    case 'uuid':
      return `'${VICTIM}'::uuid`;
    case 'text':
      return fname === 'admin_set_tier' ? `'free'` : `'t077'`;
    case 'jsonb':
      return `'{}'::jsonb`;
    case 'integer':
      return '1';
    case 'bigint':
      return '1::bigint';
    case 'date':
      return `'2026-01-01'::date`;
    case 'timestamp with time zone':
      return 'now()';
    case 'boolean':
      return 'true';
    default:
      return 'null';
  }
}

function runTests(bin) {
  let work = null;
  try {
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
    psql(bin, 'postgres', ['-c', `create database ${TEST_DB}`]);

    work = mkdtempSync(join(tmpdir(), 'carta-t077-'));
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

    check(`the directory holds at least ${MIN_MIGRATIONS} migrations`,
      MIGRATIONS.length >= MIN_MIGRATIONS, `found ${MIGRATIONS.length}`);
    // Two sessions picking the same number is the failure parallel work
    // invites; the owner would paste one and never the other.
    const numbers = MIGRATIONS.map((f) => f.slice(0, 3));
    const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i);
    check('no two migrations share a number', dupes.length === 0, dupes.join(', '));

    console.log(`  Applying all ${MIGRATIONS.length} migrations in filename order:`);
    for (const name of MIGRATIONS) {
      apply(name);
    }

    for (const [id, email] of [[ADMIN, 'owner@example.test'],
      [PLAIN, 'plain@example.test'], [VICTIM, 'victim@example.test']]) {
      psql(bin, TEST_DB, ['-c', `insert into auth.users (id, email) values ('${id}', '${email}')`]);
    }
    psql(bin, TEST_DB, ['-c', `insert into public.admin_users (user_id, note) values ('${ADMIN}', 'owner')`]);

    // ---------------------------------------------------------------------
    // Discovery. This is the point of the test: the list comes from the
    // catalogue, so a function added by a later migration is covered without
    // anyone remembering to add it here.
    // ---------------------------------------------------------------------
    console.log('');
    console.log('  Discovering the admin surface from pg_proc:');
    const DISCOVER = `
      select coalesce(json_agg(x order by x->>'name', x->>'args'), '[]'::json) from (
        select json_build_object(
          'name', p.proname,
          'args', pg_get_function_identity_arguments(p.oid),
          'argtypes', coalesce((
            select json_agg(format_type(t, null) order by ord)
            from unnest(p.proargtypes) with ordinality as u(t, ord)
          ), '[]'::json),
          'secdef', p.prosecdef,
          'config', coalesce(array_to_string(p.proconfig, ','), ''),
          'body', pg_get_functiondef(p.oid),
          'authenticated', has_function_privilege('authenticated', p.oid, 'execute'),
          'anon', has_function_privilege('anon', p.oid, 'execute')
        ) as x
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname like 'admin\\_%'
      ) s`;
    const fns = JSON.parse(scalar(bin, TEST_DB, DISCOVER) || '[]');

    check(`discovery found at least ${MIN_FUNCTIONS} admin_* functions`,
      fns.length >= MIN_FUNCTIONS, `found ${fns.length}`);
    if (fns.length === 0) {
      throw new Error('discovery found nothing; every later assertion would be vacuous');
    }

    const callable = fns.filter((f) => f.authenticated);
    const internal = fns.filter((f) => !f.authenticated);
    console.log(`  note  ${fns.length} functions: ${callable.length} callable by authenticated, ${internal.length} internal only`);
    check('at least one function is callable by authenticated',
      callable.length > 0, 'otherwise the refusal assertions below are vacuous');

    const claimsSql = (claims) => `set request.jwt.claims = '${JSON.stringify(claims).replace(/'/g, "''")}'`;
    const plainClaims = { sub: PLAIN, role: 'authenticated', aal: 'aal1' };
    // The admin control runs at aal2 so that migration 032's MFA check, which
    // sits in front of ban and delete, does not mask the guard's answer.
    const adminClaims = { sub: ADMIN, role: 'authenticated', aal: 'aal2' };

    /** Call one discovered function as a given role and set of claims. */
    const callAs = (role, claims, f) => {
      const types = Array.isArray(f.argtypes) ? f.argtypes : [];
      const args = types.map((t) => argFor(t, f.name)).join(', ');
      const sql = `select public.${f.name}(${args})::text`;
      const r = psqlRun(bin, TEST_DB, ['-At', '-c', `set role ${role}`, '-c', claimsSql(claims), '-c', sql]);
      return { ok: r.ok, out: r.out.trim(), err: r.err.trim() };
    };

    /** Did the call answer the guard's refusal word? */
    const refused = (r, word = 'forbidden') => {
      if (!r.ok) return false;
      try {
        const j = JSON.parse(r.out);
        return !!j && j.error === word;
      } catch {
        // A function that does not return jsonb cannot carry a payload; an
        // empty result is the only refusal it can express.
        return r.out === '';
      }
    };

    /** admin_guard's own answer for a set of claims, as the database owner. */
    const guardAs = (claims, kind) => psqlRun(bin, TEST_DB, ['-At',
      '-c', claimsSql(claims),
      '-c', `select coalesce(public.admin_guard('${kind}'), '(null)')`]).out.trim();

    // ---------------------------------------------------------------------
    // 1. Static posture, read from the catalogue, for every function.
    // ---------------------------------------------------------------------
    console.log('');
    console.log('  Every admin_* function is SECURITY DEFINER with a pinned search_path:');
    const secdefBad = [];
    const pathBad = [];
    const anonGranted = [];
    const guardBad = [];
    // What counts as an admission check: admin_guard, and only admin_guard.
    // is_admin() is the same membership test without the rate budget; 014's
    // admin_get_audit used it until 045 moved it onto the guard (T077-c), so
    // the whole callable surface now has one check and one budget, and a new
    // function that reaches for is_admin() instead fails here.
    const ADMISSION = /admin_guard\(/;
    // The guard cannot call itself. The other two are never granted to any
    // role, so they are only reachable from inside a definer body that has
    // already passed the guard; section 4 asserts exactly that unreachability,
    // which is a stronger claim than calling the guard would be.
    const GUARD_EXEMPT = new Set(['admin_guard', 'admin_log', 'admin_user_counts']);
    for (const f of fns) {
      if (!f.secdef) secdefBad.push(f.name);
      if (!/search_path=/.test(f.config)) pathBad.push(`${f.name} (${f.config || 'unset'})`);
      if (f.anon) anonGranted.push(f.name);
      if (!GUARD_EXEMPT.has(f.name) && !ADMISSION.test(f.body)) guardBad.push(f.name);
    }
    check('every admin_* function is SECURITY DEFINER', secdefBad.length === 0, secdefBad.join(', '));
    check('every admin_* function pins search_path', pathBad.length === 0, pathBad.join(', '));
    check('anon is granted execute on no admin_* function', anonGranted.length === 0, anonGranted.join(', '));
    check('every admin_* function carries an admission check', guardBad.length === 0,
      `no admin_guard: ${guardBad.join(', ')}`);
    // The exemption list is only safe while the exempt functions are truly
    // unreachable. If someone grants one to `authenticated` later, the
    // exemption would hide an unguarded public function, so the exemption
    // itself is asserted rather than trusted.
    const exemptButCallable = fns
      .filter((f) => GUARD_EXEMPT.has(f.name) && f.name !== 'admin_guard' && f.authenticated)
      .map((f) => f.name);
    check('the functions exempted from the admission check are not callable by authenticated',
      exemptButCallable.length === 0, exemptButCallable.join(', '));

    // ---------------------------------------------------------------------
    // 2. The control. A real admin is NOT refused. Without this, a refusal
    //    for every caller would read as a pass.
    // ---------------------------------------------------------------------
    console.log('');
    console.log('  Control: a real admin is not refused (otherwise the refusals below prove nothing):');
    const adminRefused = [];
    for (const f of callable) {
      const r = callAs('authenticated', adminClaims, f);
      if (refused(r, 'forbidden')) adminRefused.push(f.name);
    }
    check('no callable function answers forbidden to a real admin',
      adminRefused.length === 0, adminRefused.join(', '));

    // ---------------------------------------------------------------------
    // 3. The table-driven refusal. One assertion per callable function.
    // ---------------------------------------------------------------------
    console.log('');
    console.log('  A normal signed-in user is refused by every callable admin_* function:');
    // Clear anything the admin control run wrote, so the audit assertion below
    // is measured against a clean log.
    psql(bin, TEST_DB, ['-c', 'delete from public.admin_audit_log']);
    const auditBefore = Number(scalar(bin, TEST_DB, 'select count(*) from public.admin_audit_log'));
    for (const f of callable) {
      const r = callAs('authenticated', plainClaims, f);
      const detail = r.ok
        ? `returned ${r.out.slice(0, 120)}`
        : `raised ${(r.err.match(/ERROR:.*$/m) || [''])[0]}`;
      check(`${f.name}(${f.args}) refuses a non-admin`, refused(r, 'forbidden'), detail);
    }
    const auditAfter = Number(scalar(bin, TEST_DB, 'select count(*) from public.admin_audit_log'));
    check('the refused calls wrote no audit row', auditAfter === auditBefore,
      `${auditBefore} before, ${auditAfter} after`);

    // ---------------------------------------------------------------------
    // 4. The internal functions are not reachable at all.
    // ---------------------------------------------------------------------
    console.log('');
    console.log('  The internal functions are not executable by authenticated at all:');
    check('at least one function is internal only', internal.length > 0,
      'admin_guard, admin_log and admin_user_counts are expected here');
    for (const f of internal) {
      const r = callAs('authenticated', plainClaims, f);
      const denied = !r.ok && /permission denied/i.test(r.err);
      check(`${f.name}(${f.args}) is permission denied for authenticated`, denied,
        r.ok ? `it ran and returned ${r.out.slice(0, 80)}` : (r.err.match(/ERROR:.*$/m) || [''])[0]);
    }

    // ---------------------------------------------------------------------
    // 5. Signed out. anon reaches nothing at all.
    // ---------------------------------------------------------------------
    console.log('');
    console.log('  A signed-out caller reaches nothing:');
    for (const f of fns) {
      const r = callAs('anon', { role: 'anon' }, f);
      const denied = !r.ok && /permission denied/i.test(r.err);
      check(`${f.name} is permission denied for anon`, denied,
        r.ok ? `it ran and returned ${r.out.slice(0, 80)}` : (r.err.match(/ERROR:.*$/m) || [''])[0]);
    }

    // ---------------------------------------------------------------------
    // 6. The guard itself. If this ever answered null for a non-admin, every
    //    assertion above would start passing for the wrong reason.
    // ---------------------------------------------------------------------
    console.log('');
    console.log('  admin_guard itself:');
    check("admin_guard('read') answers forbidden for a non-admin",
      guardAs(plainClaims, 'read') === 'forbidden');
    check("admin_guard('destructive') answers forbidden for a non-admin",
      guardAs(plainClaims, 'destructive') === 'forbidden');
    check("admin_guard('read') answers null for an admin",
      guardAs(adminClaims, 'read') === '(null)');

    // ---------------------------------------------------------------------
    // 7. The read-burst limit (T300-o; T034 left it untested). admin_guard
    //    counts the actor's admin_audit_log rows of the last 60 seconds: 60
    //    or more refuses every tier with slow_down, and 10 or more of five
    //    named destructive actions refuses the destructive tier. A read that
    //    writes no audit row never spends the budget, which is why an admin
    //    refreshing the dashboard is never locked out; that is asserted too.
    // ---------------------------------------------------------------------
    console.log('');
    console.log('  The rate budget in admin_guard (T300-o):');
    /** One call as the admin, returned as parsed jsonb. */
    const adminCall = (sql) => {
      const r = psqlRun(bin, TEST_DB, ['-At', '-c', 'set role authenticated', '-c', claimsSql(adminClaims), '-c', sql]);
      if (!r.ok) return { raised: (r.err.match(/ERROR:.*$/m) || [''])[0] };
      try { return JSON.parse(r.out.trim()); } catch { return { raw: r.out.trim() }; }
    };
    const auditCount = (actor) => Number(scalar(bin, TEST_DB,
      `select count(*) from public.admin_audit_log where actor = '${actor}'`));
    /** n audit rows for an actor, as the database owner. */
    const seedAudit = (actor, n, action = 'note') => psql(bin, TEST_DB, ['-c',
      `insert into public.admin_audit_log (actor, action, created_at)
       select '${actor}', '${action}', now() from generate_series(1, ${n})`]);
    psql(bin, TEST_DB, ['-c', 'delete from public.admin_audit_log']);

    // A burst of 70 reads in one session, well inside one window. Each is a
    // separate statement, as 70 dashboard refreshes would be.
    const READS = 70;
    const burstArgs = ['-At', '-c', 'set role authenticated', '-c', claimsSql(adminClaims)];
    for (let i = 0; i < READS; i += 1) burstArgs.push('-c', `select coalesce(public.admin_edge_errors(30) ->> 'error', 'ok')`);
    const burst = psqlRun(bin, TEST_DB, burstArgs);
    const answers = burst.out.split('\n').map((l) => l.trim()).filter(Boolean);
    check(`a burst of ${READS} admin reads inside one minute runs`, burst.ok && answers.length === READS,
      burst.ok ? `${answers.length} answers` : (burst.err.match(/ERROR:.*$/m) || [''])[0]);
    check(`none of the ${READS} reads is refused`, answers.length === READS && answers.every((a) => a === 'ok'),
      answers.filter((a) => a !== 'ok').slice(0, 3).join(', '));
    check('the reads wrote no audit row, so they spend none of the budget', auditCount(ADMIN) === 0,
      `${auditCount(ADMIN)} rows`);

    // Another actor's rows never count against this admin.
    seedAudit(VICTIM, 100);
    seedAudit(ADMIN, 59);
    check("59 logged actions in the window: admin_guard('read') still answers null",
      guardAs(adminClaims, 'read') === '(null)', guardAs(adminClaims, 'read'));
    check('and 100 rows logged by another actor in the same window do not count against this admin',
      auditCount(VICTIM) === 100 && guardAs(adminClaims, 'read') === '(null)');
    seedAudit(ADMIN, 1);
    check("60 logged actions in the window: admin_guard('read') answers slow_down",
      guardAs(adminClaims, 'read') === 'slow_down', guardAs(adminClaims, 'read'));
    check("and admin_guard('destructive') answers slow_down too",
      guardAs(adminClaims, 'destructive') === 'slow_down', guardAs(adminClaims, 'destructive'));
    const slowRead = adminCall('select public.admin_edge_errors(30)');
    check('a read RPC hands slow_down back to the admin', slowRead.error === 'slow_down', JSON.stringify(slowRead));
    const slowList = adminCall('select public.admin_list_users()');
    check('so does the user list', slowList.error === 'slow_down', JSON.stringify(slowList));
    psql(bin, TEST_DB, ['-c', `update public.admin_audit_log set created_at = now() - interval '61 seconds' where actor = '${ADMIN}'`]);
    check('once those 60 rows are older than the 60-second window, the admin is let through again',
      guardAs(adminClaims, 'read') === '(null)', guardAs(adminClaims, 'read'));

    // The destructive budget: 10 of the five named actions.
    seedAudit(ADMIN, 9, 'set_tier');
    check("9 set_tier rows in the window: admin_guard('destructive') answers null",
      guardAs(adminClaims, 'destructive') === '(null)', guardAs(adminClaims, 'destructive'));
    seedAudit(ADMIN, 1, 'ban_user');
    check("10 destructive rows: admin_guard('destructive') answers slow_down",
      guardAs(adminClaims, 'destructive') === 'slow_down', guardAs(adminClaims, 'destructive'));
    check("while admin_guard('read') still answers null (10 is under the overall 60)",
      guardAs(adminClaims, 'read') === '(null)', guardAs(adminClaims, 'read'));
    const slowAdjust = adminCall(`select public.admin_adjust_expiry('${VICTIM}'::uuid, 1)`);
    check('admin_adjust_expiry sits on the destructive tier: it answers slow_down here',
      slowAdjust.error === 'slow_down', JSON.stringify(slowAdjust));
    psql(bin, TEST_DB, ['-c', 'delete from public.admin_audit_log']);

    // ---------------------------------------------------------------------
    // 8. admin_adjust_expiry (047, T217-c): moves the date, keeps the
    //    allowance period, writes one audit row, refuses a non-admin.
    // ---------------------------------------------------------------------
    console.log('');
    console.log('  admin_adjust_expiry moves the date and nothing else (047):');
    psql(bin, TEST_DB, ['-c', `insert into public.entitlements (user_id, tier, period_start, expires_at, source)
      values ('${VICTIM}', 'year', now() - interval '10 days', now() + interval '355 days', 'stripe')
      on conflict (user_id) do update set tier = 'year', period_start = now() - interval '10 days',
        expires_at = now() + interval '355 days', source = 'stripe'`]);
    const ent = () => scalar(bin, TEST_DB,
      `select tier || '|' || extract(epoch from period_start)::bigint || '|' || extract(epoch from expires_at)::bigint || '|' || source
         from public.entitlements where user_id = '${VICTIM}'`).split('|');
    const [tier0, start0, exp0] = ent();

    const plainAdjust = psqlRun(bin, TEST_DB, ['-At', '-c', 'set role authenticated', '-c', claimsSql(plainClaims),
      '-c', `select public.admin_adjust_expiry('${VICTIM}'::uuid, 400)::text`]);
    check('a normal signed-in user is refused with forbidden', refused({ ok: plainAdjust.ok, out: plainAdjust.out.trim() }),
      plainAdjust.out.trim() || plainAdjust.err.trim());
    check('and the pass is unchanged', ent()[2] === exp0);

    const short = adminCall(`select public.admin_adjust_expiry('${VICTIM}'::uuid, -30)`);
    const [tier1, start1, exp1, src1] = ent();
    check('an admin shortens a Year Pass by 30 days', short.ok === true, JSON.stringify(short));
    check('expires_at moved back by exactly 30 days', Number(exp0) - Number(exp1) === 30 * 86400, `${exp0} -> ${exp1}`);
    check('period_start is unchanged, so the AI allowance is not reset', start1 === start0, `${start0} -> ${start1}`);
    check('the tier is unchanged', tier1 === tier0 && tier1 === 'year', tier1);
    check("source is 'manual', as the refund procedure's update set it", src1 === 'manual', src1);
    const audit = JSON.parse(scalar(bin, TEST_DB, `select coalesce(json_agg(json_build_object(
        'actor', actor, 'target', target_user, 'detail', detail)), '[]'::json)
       from public.admin_audit_log where action = 'adjust_expiry'`) || '[]');
    check('one adjust_expiry audit row, by the admin, against the user', audit.length === 1
      && audit[0].actor === ADMIN && audit[0].target === VICTIM, JSON.stringify(audit));
    const det = audit[0] ? audit[0].detail : {};
    check('the audit row carries the days, both expiries and the same period start', det.days === -30
      && det.previous && det.new && det.previous.expiresAt !== det.new.expiresAt
      && det.previous.periodStart === det.new.periodStart, JSON.stringify(det));

    const longer = adminCall(`select public.admin_adjust_expiry('${VICTIM}'::uuid, 6)`);
    check('an admin extends it by 6 days', longer.ok === true
      && Number(ent()[2]) - Number(exp1) === 6 * 86400, JSON.stringify(longer));

    const refusals = [
      [`'${VICTIM}'::uuid, 0`, 'bad_days', 'zero days'],
      [`'${VICTIM}'::uuid, null`, 'bad_days', 'no days'],
      [`'${VICTIM}'::uuid, 1096`, 'bad_days', 'more than 1095 days'],
      [`'${VICTIM}'::uuid, -400`, 'would_expire', 'a cut past today'],
      [`'${VICTIM}'::uuid, 900`, 'beyond_horizon', 'an extension past three years from now'],
      [`'${PLAIN}'::uuid, 5`, 'no_live_pass', 'a user with no pass'],
      [`'00000000-0000-0000-0000-00000000dead'::uuid, 5`, 'not_found', 'an unknown user'],
    ];
    const expBefore = ent()[2];
    for (const [args, word, what] of refusals) {
      const r = adminCall(`select public.admin_adjust_expiry(${args})`);
      check(`refuses ${what} with ${word}`, r.error === word, JSON.stringify(r));
    }
    check('and none of the refusals moved the date', ent()[2] === expBefore);
    psql(bin, TEST_DB, ['-c', `update public.entitlements set expires_at = now() - interval '1 day' where user_id = '${VICTIM}'`]);
    const lapsed = adminCall(`select public.admin_adjust_expiry('${VICTIM}'::uuid, 30)`);
    check('a lapsed pass is not revived (no_live_pass): that is a new grant, not an adjustment',
      lapsed.error === 'no_live_pass', JSON.stringify(lapsed));
    check('exactly two adjust_expiry audit rows: one per change, none per refusal',
      scalar(bin, TEST_DB, `select count(*) from public.admin_audit_log where action = 'adjust_expiry'`) === '2');
    psql(bin, TEST_DB, ['-c', 'delete from public.admin_audit_log']);

    // ---------------------------------------------------------------------
    // 9. Client crashes stay off the AI failures card (047, T083-b).
    // ---------------------------------------------------------------------
    console.log('');
    console.log('  admin_edge_errors keeps crashes apart from AI failures (047):');
    psql(bin, TEST_DB, ['-c', `delete from public.edge_errors;
      insert into public.edge_errors (user_id, fn, code, origin) values
        ('${VICTIM}', 'plan-day', 'ai_timeout', 'edge'),
        ('${VICTIM}', 'app', 'client_crash', 'client'),
        ('${PLAIN}', 'app', 'client_crash', 'client')`]);
    const ee = adminCall('select public.admin_edge_errors(7)');
    check('the AI total counts the one AI failure only', ee.total === 1 && ee.users === 1,
      JSON.stringify([ee.total, ee.users]));
    check('byCode and byFunction carry no crash',
      Array.isArray(ee.byCode) && !JSON.stringify(ee.byCode).includes('client_crash')
      && Array.isArray(ee.byFunction) && !JSON.stringify(ee.byFunction).includes('"app"'),
      JSON.stringify([ee.byCode, ee.byFunction]));
    check('the daily series sums to the AI total',
      Array.isArray(ee.daily) && ee.daily.reduce((a, d) => a + d.n, 0) === 1);
    check('crashes are reported under their own key: two crashes, two travellers',
      !!ee.crashes && ee.crashes.total === 2 && ee.crashes.users === 2
      && ee.crashes.daily.reduce((a, d) => a + d.n, 0) === 2, JSON.stringify(ee.crashes));
    psql(bin, TEST_DB, ['-c', 'delete from public.edge_errors; delete from public.admin_audit_log']);

    // ---------------------------------------------------------------------
    // 10. A cycle route can be patched (047, T219-c), by an admin only.
    // ---------------------------------------------------------------------
    console.log('');
    console.log('  admin_set_override takes the cycle layer (047):');
    const reviewBy = `now() + interval '30 days'`;
    const cyc = adminCall(`select public.admin_set_override('cycle', 'eurovelo-6-t284', '{"name": "EuroVelo 6"}'::jsonb,
      'Name corrected from a traveller report.', 'temporary', ${reviewBy}, 'FR')`);
    check('an admin saves an override on a cycle route', cyc.ok === true, JSON.stringify(cyc));
    check('the row is stored with layer cycle', scalar(bin, TEST_DB,
      `select count(*) from public.content_overrides where layer = 'cycle' and item_id = 'eurovelo-6-t284'`) === '1');
    const plainCyc = psqlRun(bin, TEST_DB, ['-At', '-c', 'set role authenticated', '-c', claimsSql(plainClaims),
      '-c', `select public.admin_set_override('cycle', 'eurovelo-6-t284', '{}'::jsonb, null, null, null, null)::text`]);
    check('a normal signed-in user cannot clear it', refused({ ok: plainCyc.ok, out: plainCyc.out.trim() })
      && scalar(bin, TEST_DB, `select count(*) from public.content_overrides where layer = 'cycle'`) === '1',
      plainCyc.out.trim() || plainCyc.err.trim());
    const badLayer = adminCall(`select public.admin_set_override('nonsense', 'x-t284', '{"name": "x"}'::jsonb,
      'A reason long enough.', 'temporary', ${reviewBy}, null)`);
    check('an unknown layer is still refused with bad_layer', badLayer.error === 'bad_layer', JSON.stringify(badLayer));
    psql(bin, TEST_DB, ['-c', `delete from public.content_overrides where item_id like '%t284'; delete from public.admin_audit_log`]);

    // ---------------------------------------------------------------------
    // 11. The launch counters and their reader (048, T215-b, T215-c,
    //     T215-d). The writer counts per day with no identifier, drops what
    //     it does not know, and holds both daily caps; the reader adds up
    //     and divides failures by calls from the first counted day.
    // ---------------------------------------------------------------------
    console.log('');
    console.log('  launch_count and admin_launch_metrics (048):');
    psql(bin, TEST_DB, ['-c', 'delete from public.launch_counts; delete from public.launch_daily_total; delete from public.edge_errors']);
    /** Several writer calls in one psql session, as the given claims (null = anon). */
    const ticks = (claims, calls) => {
      const args = ['-At', '-c', claims ? 'set role authenticated' : 'set role anon'];
      if (claims) args.push('-c', claimsSql(claims));
      for (const c of calls) args.push('-c', `select public.launch_count(${c})`);
      return psqlRun(bin, TEST_DB, args);
    };
    const counts = () => scalar(bin, TEST_DB, `select coalesce(string_agg(event || '/' || target || '/' || surface || '=' || n, ' '
      order by event, target, surface), '') from public.launch_counts`);
    const guestTicks = ticks(null, [
      `'trip_priced', null, 'built'`, `'trip_priced', null, 'built'`, `'trip_priced', null, 'ready'`,
      `'trip_priced', null, 'Elsewhere'`,
      `'affiliate_click', 'omio', 'leg'`, `'affiliate_click', 'OMIO', 'wiz_inter'`,
      `'affiliate_click', 'getyourguide', 'dest-book'`, `'affiliate_click', 'viator', null`,
      `'affiliate_click', 'skyscanner', 'leg'`, `'affiliate_click', 'aviasales', 'a/b c<script>'`,
      `'nonsense', 'omio', 'leg'`, `null, null, null`, `'ai_call', 'plan-day', null`,
    ]);
    check('a visitor can call the writer', guestTicks.ok, (guestTicks.err.match(/ERROR:.*$/m) || [''])[0]);
    const signedTicks = ticks(plainClaims, [
      `'ai_call', 'plan-day', null`, `'ai_call', 'plan-day', 'ignored'`, `'ai_call', 'parse-booking', null`,
      `'ai_call', 'gpt', null`,
    ]);
    check('a signed-in traveller can call the writer', signedTicks.ok, (signedTicks.err.match(/ERROR:.*$/m) || [''])[0]);
    check('the rows are exactly the known ticks: unknown events and partners dropped, the visitor AI call dropped, sub-IDs cleaned',
      counts() === 'affiliate_click/aviasales/abcscript=1 affiliate_click/getyourguide/dest-book=1 affiliate_click/omio/leg=1 '
        + 'affiliate_click/omio/wiz_inter=1 affiliate_click/viator/none=1 ai_call/parse-booking/=1 ai_call/plan-day/=2 '
        + 'trip_priced//built=2 trip_priced//other=1 trip_priced//ready=1', counts());
    check('launch_counts has no column that could name a person', scalar(bin, TEST_DB,
      `select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
        where table_schema = 'public' and table_name = 'launch_counts'`) === 'day,event,target,surface,n');

    // The two daily caps.
    psql(bin, TEST_DB, ['-c', `update public.launch_daily_total set n = 199999 where day = current_date`]);
    ticks(null, [`'trip_priced', null, 'built'`, `'trip_priced', null, 'built'`, `'trip_priced', null, 'built'`]);
    check('the daily total stops at 200,000: of three ticks at 199,999 one is counted',
      scalar(bin, TEST_DB, `select n from public.launch_counts where day = current_date and event = 'trip_priced' and surface = 'built'`) === '3'
      && scalar(bin, TEST_DB, 'select n from public.launch_daily_total where day = current_date') === '200000');
    psql(bin, TEST_DB, ['-c', `update public.launch_daily_total set n = 0 where day = current_date;
      insert into public.launch_counts (day, event, target, surface, n)
      select current_date, 'affiliate_click', 'omio', 'k' || g, 1 from generate_series(1, 2000 - (select count(*) from public.launch_counts where day = current_date)) g`]);
    ticks(null, [`'affiliate_click', 'omio', 'brandnew'`, `'affiliate_click', 'omio', 'leg'`]);
    check('at 2,000 keys a day a new sub-ID is dropped', scalar(bin, TEST_DB,
      `select count(*) from public.launch_counts where surface = 'brandnew'`) === '0');
    check('while an existing key still counts', scalar(bin, TEST_DB,
      `select n from public.launch_counts where day = current_date and event = 'affiliate_click' and target = 'omio' and surface = 'leg'`) === '2');

    // The reader. Yesterday: 4 plan-day calls, today: 6 more and 2 parse-booking
    // calls. Failures: 3 plan-day and 1 parse-booking since yesterday, and
    // 5 plan-day from a week ago, before any call was counted, which the rate
    // must leave out. A crash never counts.
    psql(bin, TEST_DB, ['-c', `delete from public.launch_counts; delete from public.launch_daily_total;
      insert into public.launch_counts (day, event, target, surface, n) values
        (current_date - 1, 'ai_call', 'plan-day', '', 4),
        (current_date,     'ai_call', 'plan-day', '', 6),
        (current_date,     'ai_call', 'parse-booking', '', 2),
        (current_date - 1, 'trip_priced', '', 'built', 3),
        (current_date,     'trip_priced', '', 'ready', 1),
        (current_date - 40, 'trip_priced', '', 'built', 50),
        (current_date,     'affiliate_click', 'omio', 'leg', 5),
        (current_date,     'affiliate_click', 'getyourguide', 'dest-book', 2);
      insert into public.edge_errors (user_id, fn, code, origin, at) values
        ('${PLAIN}', 'plan-day', 'ai_timeout', 'edge', now()),
        ('${PLAIN}', 'plan-day', 'ai_error', 'edge', now()),
        ('${VICTIM}', 'plan-day', 'ai_bad_output', 'client', now() - interval '1 day' + interval '1 minute'),
        ('${VICTIM}', 'parse-booking', 'url_unreachable', 'edge', now()),
        ('${VICTIM}', 'app', 'client_crash', 'client', now());
      insert into public.edge_errors (user_id, fn, code, origin, at)
        select '${VICTIM}', 'plan-day', 'ai_timeout', 'edge', now() - interval '7 days' from generate_series(1, 5)`]);
    const lm = adminCall('select public.admin_launch_metrics(30)');
    check('the reader answers an admin', !lm.error && !lm.raised, JSON.stringify(lm).slice(0, 160));
    check('priced trips in 30 days: 4, split 3 built and 1 ready; the 40-day-old 50 are outside',
      lm.tripsPriced && lm.tripsPriced.total === 4
      && JSON.stringify(lm.tripsPriced.bySurface) === '[{"n":3,"surface":"built"},{"n":1,"surface":"ready"}]',
      JSON.stringify(lm.tripsPriced && lm.tripsPriced.bySurface));
    check('the daily series is zero-filled over the 30 days and sums to the total',
      Array.isArray(lm.tripsPriced && lm.tripsPriced.daily) && lm.tripsPriced.daily.length === 30
      && lm.tripsPriced.daily.reduce((a, d) => a + d.n, 0) === 4);
    check('affiliate clicks: 7, by partner and by surface',
      lm.affiliateClicks && lm.affiliateClicks.total === 7
      && JSON.stringify(lm.affiliateClicks.byPartner) === '[{"n":5,"partner":"omio"},{"n":2,"partner":"getyourguide"}]'
      && lm.affiliateClicks.bySurface.length === 2, JSON.stringify(lm.affiliateClicks));
    const ai = lm.aiCalls || {};
    const pd = (ai.byFunction || []).find((f) => f.fn === 'plan-day') || {};
    const pb = (ai.byFunction || []).find((f) => f.fn === 'parse-booking') || {};
    check('the rate counts from the first counted day: 12 calls, 4 failures, 0.3333 (the 5 older failures and the crash left out)',
      ai.total === 12 && ai.failures === 4 && Number(ai.rate) === 0.3333, JSON.stringify(ai));
    check('per function: plan-day 3 of 10, parse-booking 1 of 2',
      pd.calls === 10 && pd.failures === 3 && Number(pd.rate) === 0.3
      && pb.calls === 2 && pb.failures === 1 && Number(pb.rate) === 0.5, JSON.stringify(ai.byFunction));
    psql(bin, TEST_DB, ['-c', `delete from public.launch_counts where event = 'ai_call'`]);
    const noCalls = adminCall('select public.admin_launch_metrics(30)');
    check('with no call counted the rate is null, never zero, and failures are not guessed at',
      noCalls.aiCalls && noCalls.aiCalls.rate === null && noCalls.aiCalls.total === 0
      && noCalls.aiCalls.failures === 0 && noCalls.aiCalls.countedSince === null, JSON.stringify(noCalls.aiCalls));
    const plainLm = psqlRun(bin, TEST_DB, ['-At', '-c', 'set role authenticated', '-c', claimsSql(plainClaims),
      '-c', 'select public.admin_launch_metrics(30)::text']);
    check('a normal signed-in user gets forbidden from the reader', refused({ ok: plainLm.ok, out: plainLm.out.trim() }),
      plainLm.out.trim() || plainLm.err.trim());
    psql(bin, TEST_DB, ['-c', 'delete from public.launch_counts; delete from public.launch_daily_total; delete from public.edge_errors; delete from public.admin_audit_log']);
  } finally {
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
    if (work) {
      try { rmSync(work, { recursive: true, force: true }); } catch { /* leave it */ }
    }
  }
}

console.log('The admin RPC surface refuses a normal signed-in user (T077)');
console.log('-----------------------------------------------------------');

const bin = findPsql();
let skipped = false;
let skipReason = '';

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
  console.log('  SKIPPED. No database was reached, so NOTHING about the admin surface');
  console.log('  was tested. This run proves nothing.');
  console.log(`  Reason: ${skipReason}`);
  console.log('');
  console.log('  To run it, point the script at a PostgreSQL server you can write to');
  console.log('  without a password prompt, for example a throwaway trust-auth cluster:');
  console.log('    initdb -D <dir> -U postgres --auth=trust');
  console.log('    pg_ctl -D <dir> -o "-p 55435" start');
  console.log('    PGPORT=55435 node continent-app/scripts/admin/test_admin_rpc_security.mjs');
  console.log('');
  process.exit(0);
}

try {
  runTests(bin);
} catch (err) {
  failures += 1;
  console.error(`FAIL  the run aborted: ${err.message}`);
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
console.log('All admin RPC security tests passed.');
