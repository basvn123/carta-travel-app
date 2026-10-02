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
const repoRoot = resolve(here, '../../..');
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
 * gate) must. 39 is what the whole directory defines as of 045 (T268); it
 * was 37 when the list of migrations was still written by hand.
 */
const MIN_FUNCTIONS = 39;

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
const MIN_MIGRATIONS = 44;

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
