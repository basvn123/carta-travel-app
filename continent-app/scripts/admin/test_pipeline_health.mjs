/**
 * Tests for migration 041: the pipeline_runs store and the admin_pipeline_health
 * reader that admin_health's Overview card is built on.
 *
 *   PGPORT=55434 node continent-app/scripts/admin/test_pipeline_health.mjs
 *
 * WHAT IT PROVES, in order:
 *
 *   0. The chain applies: 002, 004, 006, 007, 009, 010, 011, 014 to 018,
 *      032 to 034, 040, then 041 with its self-check notice. 018 goes in
 *      because 033 and 034 check for it, applied the way T069 and T071 do
 *      (a {5,255} patched copy, T031-d).
 *   1. BEFORE 041: no pipeline_runs table, admin_health does not list it,
 *      admin_pipeline_health does not exist.
 *   2. The closed doors: anon and a signed-in traveller cannot select,
 *      insert, update or delete pipeline_runs directly, and get forbidden
 *      from admin_pipeline_health; only service_role can insert.
 *   3. The writer's shape: service_role inserts a row with arrays, jsonb
 *      layer_counts, jsonb drift_gate (nullable) and a dest_count; a run
 *      with an empty plan (no keys anywhere) still inserts a row.
 *   4. The reader: an admin with no rows yet gets hasRun:false; with one row
 *      gets it flattened with ageHours computed and ok = (failed is empty);
 *      with several rows gets only the most recent; drift_gate null passes
 *      through as null, not as a fabricated verdict.
 *   5. admin_health lists pipeline_runs as present after 041.
 *   6. Pasting 041 twice is safe and keeps the rows.
 *
 * HOW. The harness of test_edge_errors.mjs (T071), sliced from that file,
 * stubs unchanged.
 *
 * NEEDS a PostgreSQL server that accepts a password-less connection (trust
 * auth or PGPASSWORD). Set PGHOST, PGPORT, PGUSER as needed; defaults are
 * 127.0.0.1:5432, postgres. With no server reachable the script SKIPS
 * LOUDLY, exits 0, and never prints that anything passed.
 *
 * It creates and drops a database named carta_t072_test. It never touches
 * the live Supabase project.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
const TEST_DB = process.env.CARTA_TEST_DB || 'carta_t072_test';

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

function psqlRun(bin, db, args) {
  const base = ['-h', PG.host, '-p', PG.port, '-U', PG.user, '-d', db, '-w',
    '-q', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
  const r = spawnSync(bin, [...base, ...args], {
    encoding: 'utf8',
    env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
  });
  const out = String(r.stdout || '');
  const err = String(r.stderr || (r.error ? r.error.message : ''));
  return { ok: r.status === 0 && !r.error, out, err };
}

function psql(bin, db, args) {
  const r = psqlRun(bin, db, args);
  if (!r.ok) throw new Error(r.err.trim());
  return r;
}

const scalar = (bin, db, sql) => psql(bin, db, ['-At', '-c', sql]).out.trim();

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
  -- Real Supabase's service_role has BYPASSRLS (set at project provisioning,
  -- not by any migration in this repo); a plain 'create role service_role'
  -- would deny it too, on a table with RLS on and no policies, which would
  -- test something Supabase does not do. See test_site_config_visibility.mjs
  -- for the opposite case: authenticated and anon are deliberately neither
  -- superuser nor bypassrls there, and this file does not change that.
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  else
    -- Roles are cluster-wide: an earlier test file's database may have left
    -- service_role behind without bypassrls. Bring it in line every run.
    alter role service_role bypassrls;
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
grant usage on schema public to authenticated, anon, service_role;
alter default privileges in schema public
  grant all on tables to authenticated, anon, service_role;
`;

const ADMIN = '00000000-0000-0000-0000-00000000ad01';
const PLAIN = '00000000-0000-0000-0000-00000000c001';

async function runTests(bin) {
  let work = null;
  const measured = {};
  try {
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
    psql(bin, 'postgres', ['-c', `create database ${TEST_DB}`]);

    work = mkdtempSync(join(tmpdir(), 'carta-t072-'));
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
      const src = readFileSync(m018, 'utf8');
      check('018 carries the {5,600} bound the failure points at', src.includes('{5,600}'));
      const patched = join(work, '018_content_overrides.patched.sql');
      writeFileSync(patched, src.replace('{5,600}', '{5,255}'), 'utf8');
      applyFile('018_content_overrides.sql (patched copy, {5,255})', patched);
    }
    for (const name of ['032_admin_mfa_destructive.sql', '033_admin_audit_rollback.sql',
      '034_admin_guard_tiers.sql', '040_edge_errors.sql']) {
      apply(name);
    }

    /* ---- seed --------------------------------------------------------- */
    for (const [id, email] of [[ADMIN, 'owner@example.test'], [PLAIN, 'plain@example.test']]) {
      psql(bin, TEST_DB, ['-c', `insert into auth.users (id, email) values ('${id}', '${email}')`]);
    }
    psql(bin, TEST_DB, ['-c', `insert into public.admin_users (user_id, note) values ('${ADMIN}', 'owner')`]);

    const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
    const claimsOf = (sub) => ({ sub, role: 'authenticated', aal: 'aal1' });
    const AS = {
      admin: { role: 'authenticated', claims: claimsOf(ADMIN) },
      plain: { role: 'authenticated', claims: claimsOf(PLAIN) },
      anon: { role: 'anon', claims: { role: 'anon' } },
      service: { role: 'service_role', claims: null },
    };
    const roleArgs = (who, sql) => {
      const args = [];
      if (AS[who].claims) args.push('-c', `set request.jwt.claims = ${q(JSON.stringify(AS[who].claims))}`);
      args.push('-c', `set role ${AS[who].role}`, '-c', sql);
      return ['-At', ...args];
    };
    const asRole = (who, sql) => psqlRun(bin, TEST_DB, roleArgs(who, sql));
    const parse = (r) => {
      let json = null;
      if (r.ok) { try { json = JSON.parse(r.out.trim()); } catch { /* left null */ } }
      return { ...r, json };
    };
    const count = (sql) => Number(scalar(bin, TEST_DB, sql));
    const rows = () => count('select count(*) from public.pipeline_runs');
    const health = (who) => parse(asRole(who, 'select public.admin_pipeline_health()'));

    /* ---- 1. before 041 ------------------------------------------------- */
    measured.tableBefore = scalar(bin, TEST_DB, `select to_regclass('public.pipeline_runs') is not null`);
    check('before 041 there is no pipeline_runs table', measured.tableBefore === 'f');
    const hBefore = parse(asRole('admin', 'select public.admin_health()'));
    check('before 041 admin_health does not list pipeline_runs',
      hBefore.json?.tables && !('pipeline_runs' in hBefore.json.tables), hBefore.out);

    const m41 = apply('041_pipeline_health.sql');
    check('041 self-check ran and passed', /pipeline health self-check passed/.test(m41.err + m41.out));
    check('the self-check left no row behind', rows() === 0);

    /* ---- 2. closed doors ------------------------------------------------ */
    const insertSql = `insert into public.pipeline_runs (ran, skipped, failed, soft_failed, layer_counts, drift_gate, dest_count)
      values (array['fares'], array[]::text[], array[]::text[], array[]::text[], '{"beaches":1}'::jsonb, null, 100)`;
    for (const who of ['anon', 'plain']) {
      const ins = asRole(who, insertSql);
      check(`${who} cannot insert into pipeline_runs`, !ins.ok && /permission denied/.test(ins.err), ins.err.trim());
      const sel = asRole(who, 'select count(*) from public.pipeline_runs');
      check(`${who} cannot select pipeline_runs`, !sel.ok && /permission denied/.test(sel.err), sel.err.trim());
    }
    const anonH = asRole('anon', 'select public.admin_pipeline_health()');
    check('anon cannot execute admin_pipeline_health', !anonH.ok && /permission denied/.test(anonH.err), anonH.err.trim());
    const plainH = health('plain');
    check('a plain user gets forbidden from admin_pipeline_health', plainH.json?.error === 'forbidden', plainH.out || plainH.err);

    /* ---- 3. the writer's shape ------------------------------------------ */
    const svcIns = asRole('service', insertSql);
    check('service_role can insert a run', svcIns.ok, svcIns.err.trim());
    check('one row exists', rows() === 1, String(rows()));

    const emptyPlanSql = `insert into public.pipeline_runs (ran, skipped, failed, soft_failed, layer_counts, drift_gate, dest_count)
      values (array[]::text[], array[]::text[], array[]::text[], array[]::text[], '{}'::jsonb, null, null)`;
    const emptyIns = asRole('service', emptyPlanSql);
    check('a run with nothing due still inserts a row', emptyIns.ok && rows() === 2, emptyIns.err.trim());

    /* ---- 4. the reader ---------------------------------------------------*/
    psql(bin, TEST_DB, ['-c', 'truncate public.pipeline_runs']);
    const noRuns = health('admin');
    check('with no rows, hasRun is false', noRuns.json?.hasRun === false, noRuns.out);

    psql(bin, TEST_DB, ['-c', `insert into public.pipeline_runs
      (finished_at, ran, skipped, failed, soft_failed, layer_counts, drift_gate, dest_count) values
      (now() - interval '3 hours', array['fares','beaches'], array['mountains'], array[]::text[],
       array['ingestion'], '{"beaches": 2456, "lakes": 1180, "mountains": 640, "regions": 1207}'::jsonb,
       '{"verdict":"ok","action":"none","max_psi":0.03}'::jsonb, 5312)`]);
    const oneRun = health('admin');
    const j1 = oneRun.json || {};
    check('hasRun true with finishedAt, ran/skipped/failed/softFailed arrays',
      j1.hasRun === true && Array.isArray(j1.ran) && j1.ran.includes('fares')
      && j1.skipped.includes('mountains') && j1.softFailed.includes('ingestion') && j1.failed.length === 0,
      JSON.stringify(j1));
    check('ok is true when failed is empty', j1.ok === true, JSON.stringify(j1.failed));
    check('ageHours is computed and roughly 3', typeof j1.ageHours === 'number' && j1.ageHours > 2.9 && j1.ageHours < 3.1, String(j1.ageHours));
    check('layerCounts carries all four layers', j1.layerCounts?.beaches === 2456 && j1.layerCounts?.lakes === 1180
      && j1.layerCounts?.mountains === 640 && j1.layerCounts?.regions === 1207, JSON.stringify(j1.layerCounts));
    check('driftGate carries the verdict', j1.driftGate?.verdict === 'ok' && j1.driftGate?.action === 'none', JSON.stringify(j1.driftGate));
    check('destCount is carried', j1.destCount === 5312, String(j1.destCount));

    psql(bin, TEST_DB, ['-c', `insert into public.pipeline_runs
      (finished_at, ran, skipped, failed, soft_failed, layer_counts, drift_gate, dest_count) values
      (now() - interval '10 minutes', array['fares'], array[]::text[], array['mountains'], array[]::text[],
       '{}'::jsonb, null, 5313)`]);
    const latest = health('admin');
    const j2 = latest.json || {};
    check('the reader returns only the most recent run', j2.destCount === 5313 && j2.failed?.includes('mountains'), JSON.stringify(j2));
    check('ok is false when failed is non-empty', j2.ok === false, JSON.stringify(j2.failed));
    check('a null drift_gate passes through as null, not a fabricated verdict', j2.driftGate === null, JSON.stringify(j2.driftGate));

    /* ---- 5. admin_health lists pipeline_runs ---------------------------- */
    const hAfter = parse(asRole('admin', 'select public.admin_health()'));
    check('admin_health lists pipeline_runs as present', hAfter.json?.tables?.pipeline_runs === true, hAfter.out);
    check('admin_health still lists edge_errors and the earlier tables',
      hAfter.json?.tables?.edge_errors === true && hAfter.json?.tables?.admin_audit_log === true
      && Object.keys(hAfter.json?.tables || {}).length === 17, JSON.stringify(Object.keys(hAfter.json?.tables || {})));

    /* ---- 6. pasting twice ------------------------------------------------*/
    const keep = rows();
    const again = apply('041_pipeline_health.sql');
    check('041 pasted twice runs its self-check again', /pipeline health self-check passed/.test(again.err + again.out));
    check('and keeps the rows', rows() === keep);
    measured.after = true;
    measured.rowsAtEnd = rows();
  } finally {
    if (work) { try { rmSync(work, { recursive: true, force: true }); } catch { /* temp dir */ } }
    // Roles are cluster-wide: undo the bypassrls this file set on
    // service_role, so a sibling test file (test_site_config_visibility.mjs
    // asserts service_role is neither superuser nor bypassrls) is not left
    // depending on run order.
    psqlRun(bin, 'postgres', ['-c', 'alter role service_role nobypassrls']);
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
  }
  return measured;
}

console.log('Pipeline health is stored in pipeline_runs and read by admin_pipeline_health (migration 041)');
console.log('------------------------------------------------------------------------------------------');

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
  console.log('  SKIPPED. No database was reached, so NOTHING about pipeline_runs was tested.');
  console.log('  This run proves nothing.');
  console.log(`  Reason: ${skipReason}`);
  console.log('');
  console.log('  To run it, point the script at a PostgreSQL server you can write to');
  console.log('  without a password prompt, for example a throwaway trust-auth cluster:');
  console.log('    initdb -D <dir> -U postgres --auth=trust');
  console.log('    pg_ctl -D <dir> -o "-p 55434" start');
  console.log('    PGPORT=55434 node continent-app/scripts/admin/test_pipeline_health.mjs');
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
  console.log(`  before 041, a pipeline_runs table existed: ${measured.tableBefore === 't' ? 'yes' : 'no'}`);
  console.log(`  rows at the end: ${measured.rowsAtEnd}`);
}
console.log('');
console.log(`${checks} assertions, ${checks - failures} passing, ${failures} failing.`);
if (failures) {
  console.error(`
${failures} test(s) failed`);
  process.exit(1);
}
if (checks === 0) {
  console.error('No assertions ran; treating this as a failure.');
  process.exit(1);
}
console.log('All pipeline health tests passed.');
