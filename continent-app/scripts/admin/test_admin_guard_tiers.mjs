/**
 * Tests for migration 034: admin_set_config, admin_set_override and
 * admin_set_feedback_status now pass admin_guard('destructive') instead of
 * admin_guard('read').
 *
 *   PGPORT=55434 node continent-app/scripts/admin/test_admin_guard_tiers.mjs
 *
 * WHAT THE TIERS ARE. admin_guard (015) is not a role check with levels.
 * Both tiers refuse a non-admin with 'forbidden' and let every admin in. They
 * differ only in rate budget, counted against the caller's own audit rows in
 * the last 60 seconds: 'read' refuses with 'slow_down' at 60 rows of any
 * action; 'destructive' also refuses with 'slow_down' at 10 rows whose action
 * is set_tier, reset_quota, delete_user, ban_user or unban_user. So "refuse a
 * non-destructive-tier admin" can only mean "hit the destructive gate", and
 * that is what this script proves.
 *
 * WHAT IT PROVES, in order:
 *
 *   1. BEFORE 034 (006, 007, 010, 014 to 018 and 032, 033 applied) each of
 *      the three functions calls admin_guard('read') per pg_get_functiondef,
 *      still SUCCEEDS with 10 destructive-kind audit rows in the last minute,
 *      and accepts 60 calls a minute on an empty log and 50 with those 10
 *      rows present. This is the baseline.
 *   2. After 034 each calls admin_guard('destructive') and no longer
 *      admin_guard('read'); with the same 10 rows each returns
 *      {error: 'slow_down'}, changes no row and writes no audit row; with 9
 *      rows each still succeeds; on an empty log each succeeds; a non-admin
 *      still gets 'forbidden'; and the accepted calls per minute are measured
 *      again (60 on an empty log, since these functions' own actions are not
 *      in the destructive list, and 0 with the 10 rows present).
 *   3. The 033 audit detail (previous and new) is still written.
 *   4. Re-pasting 033 after 034 puts the two 033 functions back on 'read'
 *      (033's self-check still passes), and pasting 034 again restores the
 *      destructive tier. This is the ordering hazard the report names.
 *
 * HOW. The harness of test_admin_audit_rollback.mjs (T064) and
 * test_admin_mfa.mjs (T063): stub schema auth, auth.users, auth.uid(),
 * auth.jwt() and the three Supabase roles, apply the migrations through psql
 * with spawnSync so self-check notices are kept, and call every RPC as the
 * `authenticated` role with request.jwt.claims set, the way PostgREST does.
 * 017 is applied because the feedback table and admin_set_feedback_status
 * live there. The destructive-kind rows are inserted straight into
 * admin_audit_log as the superuser, with created_at = now(), which is what
 * admin_set_tier and friends would have written.
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
 * It creates and drops a database named carta_t065_test. It never touches
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
const TEST_DB = process.env.CARTA_TEST_DB || 'carta_t065_test';

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
`;

const ADMIN = '00000000-0000-0000-0000-00000000ad01'; // the caller
const PLAIN = '00000000-0000-0000-0000-00000000c001'; // a non-admin caller

const FNS = {
  config: 'public.admin_set_config(text,jsonb)',
  override: 'public.admin_set_override(text,text,jsonb,text)',
  feedback: 'public.admin_set_feedback_status(bigint,text)',
};
// The destructive cap in admin_guard (015) and the overall cap.
const DESTRUCTIVE_CAP = 10;
const READ_CAP = 60;
// How many calls a capacity run tries before giving up. Above READ_CAP, so a
// function that never refuses shows as 70 rather than as "60".
const PROBE = 70;

function runTests(bin) {
  let work = null;
  const measured = {};
  try {
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
    psql(bin, 'postgres', ['-c', `create database ${TEST_DB}`]);

    work = mkdtempSync(join(tmpdir(), 'carta-t065-'));
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

    for (const name of ['006_ai_day_planner.sql', '007_passes.sql', '010_profiles.sql',
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
    apply('032_admin_mfa_destructive.sql');
    const m33 = apply('033_admin_audit_rollback.sql');
    check('033 self-check ran and passed', /admin audit rollback self-check passed/.test(m33.err + m33.out));

    for (const [id, email] of [[ADMIN, 'owner@example.test'], [PLAIN, 'plain@example.test']]) {
      psql(bin, TEST_DB, ['-c', `insert into auth.users (id, email) values ('${id}', '${email}')`]);
    }
    psql(bin, TEST_DB, ['-c', `insert into public.admin_users (user_id, note) values ('${ADMIN}', 'owner')`]);
    // One feedback row to triage. Inserted directly: submit_feedback's own
    // rate limit is not what this test is about.
    const FB = scalar(bin, TEST_DB, `insert into public.feedback (kind, message) values ('bug', 'The map is blank') returning id`);

    const admin = { sub: ADMIN, role: 'authenticated', aal: 'aal1' };
    const plain = { sub: PLAIN, role: 'authenticated', aal: 'aal1' };
    const claimsSql = (claims) => `set request.jwt.claims = '${JSON.stringify(claims).replace(/'/g, "''")}'`;

    // One call of each function, as SQL. Each call writes a real change so
    // that a success always logs one audit row.
    const CALL = {
      config: (i) => `select public.admin_set_config('announcement', '{"enabled": true, "text": "notice ${i}", "tone": "info"}'::jsonb)`,
      override: (i) => `select public.admin_set_override('lake', 'lac-t065', '{"name": "Lac ${i}"}'::jsonb, null)`,
      feedback: (i) => `select public.admin_set_feedback_status(${FB}, '${i % 2 ? 'open' : 'done'}')`,
    };

    /** Call an RPC as PostgREST would. */
    const rpc = (claims, sql) => {
      const r = psqlRun(bin, TEST_DB, ['-At', '-c', 'set role authenticated', '-c', claimsSql(claims), '-c', sql]);
      if (r.ok) return { ok: true, json: JSON.parse(r.out.trim()) };
      return { ok: false, err: r.err.trim() };
    };

    /**
     * Accepted calls per minute: PROBE calls in one session, each statement
     * its own transaction (so now() moves and every success is committed and
     * counted by the next guard), and count the successes before the first
     * refusal. Returns { accepted, firstRefusal }.
     */
    const capacity = (kind) => {
      const stmts = [];
      for (let i = 0; i < PROBE; i += 1) stmts.push('-c', CALL[kind](i));
      const r = psqlRun(bin, TEST_DB, ['-At', '-c', 'set role authenticated', '-c', claimsSql(admin), ...stmts]);
      if (!r.ok) throw new Error(`capacity run for ${kind} failed: ${r.err.trim()}`);
      const rows = r.out.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
      let accepted = 0;
      while (accepted < rows.length && rows[accepted].ok === true) accepted += 1;
      return { accepted, firstRefusal: rows[accepted] ? JSON.stringify(rows[accepted]) : 'none' };
    };

    const clearAudit = () => psql(bin, TEST_DB, ['-c', 'delete from public.admin_audit_log']);
    // Destructive-kind rows by the admin, now, as admin_set_tier would write.
    const seedDestructive = (n) => {
      clearAudit();
      if (n > 0) {
        psql(bin, TEST_DB, ['-c', `insert into public.admin_audit_log (actor, action, target_user, detail)
          select '${ADMIN}', (array['set_tier','reset_quota','ban_user','unban_user','delete_user'])[1 + g % 5], '${PLAIN}', null
            from generate_series(1, ${n}) g`]);
      }
    };
    const auditCount = () => Number(scalar(bin, TEST_DB, 'select count(*) from public.admin_audit_log'));
    const fnDef = (fn) => scalar(bin, TEST_DB, `select pg_get_functiondef('${fn}'::regprocedure)`);
    const stateSnapshot = () => scalar(bin, TEST_DB, `select concat_ws(' | ',
      (select value::text from public.site_config where key = 'announcement'),
      (select patch::text from public.content_overrides where layer = 'lake' and item_id = 'lac-t065'),
      (select status from public.feedback where id = ${FB}))`);
    const isErr = (r, word) => r.ok && r.json && r.json.error === word && Object.keys(r.json).length === 1;
    const isOk = (r) => r.ok && r.json && r.json.ok === true;

    const measure = (label) => {
      measured[label] = {};
      for (const kind of Object.keys(CALL)) {
        clearAudit();
        const empty = capacity(kind);
        seedDestructive(DESTRUCTIVE_CAP);
        const loaded = capacity(kind);
        measured[label][kind] = { empty, loaded };
        console.log(`  measure  ${label}, ${FNS[kind]}: ${empty.accepted} accepted on an empty log (then ${empty.firstRefusal}); `
          + `${loaded.accepted} accepted with ${DESTRUCTIVE_CAP} destructive rows in the window (then ${loaded.firstRefusal})`);
      }
      clearAudit();
    };

    /* ---- 1. baseline, before 034 -------------------------------------- */
    console.log('');
    console.log('  Baseline, before 034:');
    for (const [kind, fn] of Object.entries(FNS)) {
      const def = fnDef(fn);
      check(`before 034: ${fn} calls admin_guard('read') per pg_get_functiondef`,
        def.includes("admin_guard('read')") && !def.includes("admin_guard('destructive')"));
      seedDestructive(DESTRUCTIVE_CAP);
      const r = rpc(admin, CALL[kind](1000));
      check(`before 034: ${fn} still SUCCEEDS with ${DESTRUCTIVE_CAP} destructive rows in the last minute`, isOk(r), JSON.stringify(r));
    }
    measure('before 034');
    check('before 034: every function accepts the read cap (60) on an empty log',
      Object.values(measured['before 034']).every((m) => m.empty.accepted === READ_CAP),
      JSON.stringify(measured['before 034']));
    check(`before 034: every function accepts 50 with ${DESTRUCTIVE_CAP} destructive rows present (60 minus 10)`,
      Object.values(measured['before 034']).every((m) => m.loaded.accepted === READ_CAP - DESTRUCTIVE_CAP),
      JSON.stringify(measured['before 034']));

    /* ---- apply 034 --------------------------------------------------- */
    console.log('');
    const m34 = apply('034_admin_guard_tiers.sql');
    check('034 self-check ran and passed', /admin guard tiers self-check passed/.test(m34.err + m34.out), (m34.err + m34.out).trim());

    /* ---- 2. after 034 ------------------------------------------------ */
    console.log('');
    console.log('  After 034, the destructive gate:');
    for (const [kind, fn] of Object.entries(FNS)) {
      const def = fnDef(fn);
      check(`${fn} calls admin_guard('destructive') per pg_get_functiondef`, def.includes("admin_guard('destructive')"));
      check(`${fn} no longer calls admin_guard('read')`, !def.includes("admin_guard('read')"));
      check(`${fn} still SECURITY DEFINER, anon cannot execute, authenticated can`,
        scalar(bin, TEST_DB, `select prosecdef from pg_proc where oid = '${fn}'::regprocedure`) === 't'
        && scalar(bin, TEST_DB, `select has_function_privilege('anon', '${fn}', 'execute')`) === 'f'
        && scalar(bin, TEST_DB, `select has_function_privilege('authenticated', '${fn}', 'execute')`) === 't');

      seedDestructive(DESTRUCTIVE_CAP);
      const before = stateSnapshot();
      const rows = auditCount();
      const r = rpc(admin, CALL[kind](2000));
      check(`${fn} with ${DESTRUCTIVE_CAP} destructive rows in the last minute returns exactly {error: 'slow_down'}`,
        isErr(r, 'slow_down'), JSON.stringify(r));
      check(`${fn} refused: no row changed and no audit row written`,
        stateSnapshot() === before && auditCount() === rows, `${before} vs ${stateSnapshot()}, audit ${rows} vs ${auditCount()}`);

      seedDestructive(DESTRUCTIVE_CAP - 1);
      const r9 = rpc(admin, CALL[kind](3000));
      check(`${fn} with ${DESTRUCTIVE_CAP - 1} destructive rows (under the cap) still succeeds`, isOk(r9), JSON.stringify(r9));

      clearAudit();
      const r0 = rpc(admin, CALL[kind](4000));
      check(`${fn} by a plain admin on an empty log succeeds`, isOk(r0), JSON.stringify(r0));

      const rp = rpc(plain, CALL[kind](5000));
      check(`${fn} by a non-admin returns exactly {error: 'forbidden'}`, isErr(rp, 'forbidden'), JSON.stringify(rp));
    }

    // Rows older than the window do not count: the gate is per minute.
    seedDestructive(DESTRUCTIVE_CAP);
    psql(bin, TEST_DB, ['-c', `update public.admin_audit_log set created_at = now() - interval '61 seconds'`]);
    check(`${DESTRUCTIVE_CAP} destructive rows older than 60 seconds do not refuse admin_set_config`,
      isOk(rpc(admin, CALL.config(6000))));
    clearAudit();

    console.log('');
    console.log('  After 034, calls accepted per minute:');
    measure('after 034');
    check('after 034: every function still accepts the read cap (60) on an empty log, since its own actions are not in the destructive list',
      Object.values(measured['after 034']).every((m) => m.empty.accepted === READ_CAP),
      JSON.stringify(measured['after 034']));
    check(`after 034: every function accepts 0 with ${DESTRUCTIVE_CAP} destructive rows present, first refusal slow_down`,
      Object.values(measured['after 034']).every((m) => m.loaded.accepted === 0 && m.loaded.firstRefusal === '{"error":"slow_down"}'),
      JSON.stringify(measured['after 034']));

    /* ---- 3. the 033 detail survives ------------------------------------ */
    console.log('');
    console.log('  Unchanged by 034:');
    clearAudit();
    rpc(admin, CALL.config(7000));
    rpc(admin, CALL.override(7000));
    const d = JSON.parse(scalar(bin, TEST_DB, `select json_agg(detail order by id)::text from public.admin_audit_log`));
    check('set_config and override_set still log previous and new (033)',
      d.length === 2 && d.every((x) => x && x.previous && x.previous.exists === true && x.new && x.new.exists === true), JSON.stringify(d));
    const bad = rpc(admin, `select public.admin_set_config('Bad-Key', '{}'::jsonb)`);
    check('validation still runs after the guard: bad key returns bad_key', isErr(bad, 'bad_key'), JSON.stringify(bad));
    const badStatus = rpc(admin, `select public.admin_set_feedback_status(${FB}, 'lost')`);
    check('feedback status validation unchanged: bad status returns bad_status', isErr(badStatus, 'bad_status'), JSON.stringify(badStatus));
    // Observation only, not an assertion: the maintenance shape check 017
    // added is missing since 033 (register row T065-c).
    const maint = rpc(admin, `select public.admin_set_config('maintenance', '{"enabled": "yes"}'::jsonb)`);
    console.log(`  note  observed, not asserted: a malformed maintenance value returns ${JSON.stringify(maint.json || maint.err)} (017 answered bad_value; lost in 033, see T065-c)`);

    /* ---- 4. re-pasting 033 undoes the tier --------------------------- */
    console.log('');
    console.log('  Ordering hazard:');
    const again33 = apply('033_admin_audit_rollback.sql');
    check('re-pasting 033 after 034 still passes its own self-check', /admin audit rollback self-check passed/.test(again33.err + again33.out));
    check('re-pasting 033 after 034 puts admin_set_config and admin_set_override back on admin_guard(\'read\')',
      fnDef(FNS.config).includes("admin_guard('read')") && fnDef(FNS.override).includes("admin_guard('read')"));
    const again34 = apply('034_admin_guard_tiers.sql');
    check('pasting 034 again restores the destructive tier',
      /admin guard tiers self-check passed/.test(again34.err + again34.out)
      && Object.values(FNS).every((fn) => fnDef(fn).includes("admin_guard('destructive')")));
  } finally {
    if (work) { try { rmSync(work, { recursive: true, force: true }); } catch { /* temp dir */ } }
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
  }
  return measured;
}

console.log('admin_set_config, admin_set_override and admin_set_feedback_status pass the destructive gate (migration 034)');
console.log('-----------------------------------------------------------------------------------------------------------');

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
  console.log('  SKIPPED. No database was reached, so NOTHING about the guard tiers');
  console.log('  was tested. This run proves nothing.');
  console.log(`  Reason: ${skipReason}`);
  console.log('');
  console.log('  To run it, point the script at a PostgreSQL server you can write to');
  console.log('  without a password prompt, for example a throwaway trust-auth cluster:');
  console.log('    initdb -D <dir> -U postgres --auth=trust');
  console.log('    pg_ctl -D <dir> -o "-p 55434" start');
  console.log('    PGPORT=55434 node continent-app/scripts/admin/test_admin_guard_tiers.mjs');
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
console.log('All admin guard tier tests passed.');
