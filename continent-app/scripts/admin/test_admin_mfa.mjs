/**
 * Tests for migration 032: admin_delete_user and admin_ban_user refuse any
 * session that is not at Authenticator Assurance Level 2.
 *
 *   PGPORT=55434 node continent-app/scripts/admin/test_admin_mfa.mjs
 *
 * WHAT IT PROVES. Supabase puts the assurance level in the access token's
 * `aal` claim: 'aal1' after a password or magic link, 'aal2' only after an
 * MFA factor has been verified. Migration 032 reads it with
 * auth.jwt() ->> 'aal' right after admin_guard('destructive') and raises
 * 'MFA required for this action' (SQLSTATE 42501, hint mfa_required) when it
 * is not 'aal2'. This script drives the real functions through psql and
 * checks, in order:
 *
 *   1. BEFORE 032 (migrations 014 to 016 only) an aal1 admin session CAN ban.
 *      This is the baseline, so the refusal later is shown to come from 032
 *      and not from the harness.
 *   2. After 032, an aal1 session and a session with no aal claim at all are
 *      refused by both RPCs with the exact message, SQLSTATE and hint, and
 *      nothing was written: the target is not banned, not deleted, its
 *      refresh token is not revoked, and no audit row exists.
 *   3. The guard still runs first: a non-admin hears 'forbidden', not MFA.
 *   4. An aal2 session gets past the check, and every refusal 015 had is
 *      still there (own_account, target_is_admin, not_found, bad_days,
 *      confirm_mismatch), and the successful paths still write what they
 *      wrote before: banned_until, the revoked refresh token, the audit row,
 *      the deleted account.
 *   5. Scope: admin_unban_user is untouched and still works on aal1.
 *
 * HOW. The same shape as scripts/ai/test_ai_quota.mjs. A bare PostgreSQL
 * lacks what Supabase provides, so the script stubs schema auth, auth.users
 * (with the columns the admin functions read), auth.refresh_tokens,
 * auth.uid(), auth.jwt() and the three roles, then applies 006, 007, 010,
 * 014, 015, 016 and finally 032. 006 and 007 are there because 014 and 015
 * name plan_tiers, entitlements and ai_resolve_tier; 010 because the delete
 * path reads profiles. 017 and 018 are not needed: neither touches the two
 * functions or admin_guard. Every call runs as the `authenticated` role with
 * request.jwt.claims set, the way PostgREST runs an RPC.
 *
 * NEEDS a PostgreSQL server that accepts a password-less connection (trust
 * auth or PGPASSWORD). Set PGHOST, PGPORT, PGUSER as needed; defaults are
 * 127.0.0.1:5432, postgres. With no server reachable the script SKIPS
 * LOUDLY, exits 0, and never prints that anything passed.
 *
 * It creates and drops a database named carta_t063_test. It never touches
 * the live Supabase project.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
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
const TEST_DB = process.env.CARTA_TEST_DB || 'carta_t063_test';

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

/**
 * Run psql and never throw. Returns { ok, out, err }, stderr kept either way. VERBOSITY verbose makes
 * psql print the SQLSTATE next to the message, which is what the refusal
 * assertions read.
 */
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

/**
 * What Supabase provides and a bare Postgres does not. auth.uid() and
 * auth.jwt() are written the way Supabase writes them: the legacy single
 * setting first, then the claims object PostgREST sets per request.
 */
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
const ADMIN2 = '00000000-0000-0000-0000-00000000ad02'; // another admin, a protected target
const PLAIN = '00000000-0000-0000-0000-00000000c001'; // a non-admin caller
const T1 = '00000000-0000-0000-0000-0000000000b1'; // ban target
const T2 = '00000000-0000-0000-0000-0000000000b2'; // delete target
const T0 = '00000000-0000-0000-0000-0000000000b0'; // baseline ban target, before 032
const NOBODY = '00000000-0000-0000-0000-0000000000ff'; // no such account

const MFA_MSG = 'MFA required for this action';

function runTests(bin) {
  let work = null;
  try {
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
    psql(bin, 'postgres', ['-c', `create database ${TEST_DB}`]);

    work = mkdtempSync(join(tmpdir(), 'carta-t063-'));
    const stubFile = join(work, 'stubs.sql');
    writeFileSync(stubFile, STUBS, 'utf8');
    psql(bin, TEST_DB, ['-f', stubFile]);

    const apply = (name) => {
      const r = psqlRun(bin, TEST_DB, ['-f', resolve(migrations, name)]);
      check(`migration applied: ${name}`, r.ok, r.err.trim().split('\n')[0]);
      if (!r.ok) throw new Error(`${name} failed: ${r.err.trim()}`);
      return r;
    };
    for (const name of ['006_ai_day_planner.sql', '007_passes.sql', '010_profiles.sql',
      '014_admin.sql', '015_admin_hardening.sql', '016_admin_resilient.sql']) {
      apply(name);
    }

    const users = [
      [ADMIN, 'owner@example.test'], [ADMIN2, 'second@example.test'],
      [PLAIN, 'plain@example.test'], [T0, 'zero@example.test'],
      [T1, 'ban.me@example.test'], [T2, 'delete.me@example.test'],
    ];
    for (const [id, email] of users) {
      psql(bin, TEST_DB, ['-c', `insert into auth.users (id, email) values ('${id}', '${email}')`]);
    }
    psql(bin, TEST_DB, ['-c', `insert into public.admin_users (user_id, note) values ('${ADMIN}', 'owner'), ('${ADMIN2}', 'second')`]);
    psql(bin, TEST_DB, ['-c', `insert into auth.refresh_tokens (user_id) values ('${T0}'), ('${T1}')`]);

    /**
     * Call an RPC as PostgREST would: role authenticated, request.jwt.claims
     * set for the session. Returns { ok, json } on success and
     * { ok: false, state, message, hint } on an exception.
     */
    const rpc = (claims, sql) => {
      const lit = JSON.stringify(claims).replace(/'/g, "''");
      const r = psqlRun(bin, TEST_DB, ['-At',
        '-c', 'set role authenticated',
        '-c', `set request.jwt.claims = '${lit}'`,
        '-c', sql]);
      if (r.ok) return { ok: true, json: JSON.parse(r.out.trim()) };
      const m = r.err.match(/ERROR:\s+([0-9A-Z]{5}):\s+(.*)/);
      const h = r.err.match(/HINT:\s+(.*)/);
      return {
        ok: false,
        state: m ? m[1] : null,
        message: m ? m[2].trim() : r.err.trim(),
        hint: h ? h[1].trim() : null,
      };
    };
    const ban = (claims, target, days = 7) =>
      rpc(claims, `select public.admin_ban_user('${target}'::uuid, ${days})`);
    const del = (claims, target, confirm) =>
      rpc(claims, `select public.admin_delete_user('${target}'::uuid, '${confirm}')`);

    const aal1 = { sub: ADMIN, role: 'authenticated', aal: 'aal1' };
    const aal2 = { sub: ADMIN, role: 'authenticated', aal: 'aal2' };
    const noAal = { sub: ADMIN, role: 'authenticated' };
    const plain1 = { sub: PLAIN, role: 'authenticated', aal: 'aal1' };
    const plain2 = { sub: PLAIN, role: 'authenticated', aal: 'aal2' };

    const bannedUntil = (id) => scalar(bin, TEST_DB, `select coalesce(banned_until::text, '') from auth.users where id = '${id}'`);
    const exists = (id) => scalar(bin, TEST_DB, `select count(*) from auth.users where id = '${id}'`) === '1';
    const revoked = (id) => scalar(bin, TEST_DB, `select bool_and(revoked) from auth.refresh_tokens where user_id = '${id}'`) === 't';
    const audit = (action, target) => Number(scalar(bin, TEST_DB,
      `select count(*) from public.admin_audit_log where action = '${action}' and target_user = '${target}'`));
    const auditAll = () => Number(scalar(bin, TEST_DB, 'select count(*) from public.admin_audit_log'));

    /* ---- 1. baseline: before 032, aal1 is enough ------------------- */
    console.log('');
    console.log('  Baseline, migrations 014 to 016 only:');
    const base = ban(aal1, T0);
    check('before 032: an aal1 admin session bans a user', base.ok && base.json.ok === true, JSON.stringify(base));
    check('before 032: the ban landed on auth.users', bannedUntil(T0) !== '');
    const baseUnban = rpc(aal1, `select public.admin_unban_user('${T0}'::uuid)`);
    check('before 032: unban on aal1 restores the baseline account', baseUnban.ok && baseUnban.json.ok === true, JSON.stringify(baseUnban));

    /* ---- apply 032 -------------------------------------------------- */
    console.log('');
    const m = apply('032_admin_mfa_destructive.sql');
    check('032 self-check ran and passed', /admin MFA self-check passed/.test(m.err + m.out), (m.err + m.out).trim());
    const auditBefore = auditAll();

    /* ---- 2. aal1 and a missing claim are refused -------------------- */
    console.log('');
    console.log('  After 032, a session that is not aal2:');
    const expectMfa = (label, r) => {
      check(`${label}: refused with an exception`, r.ok === false, JSON.stringify(r));
      check(`${label}: message is exactly "${MFA_MSG}"`, r.message === MFA_MSG, JSON.stringify(r.message));
      check(`${label}: SQLSTATE is 42501`, r.state === '42501', String(r.state));
      check(`${label}: hint is mfa_required`, r.hint === 'mfa_required', String(r.hint));
    };
    expectMfa('aal1 ban', ban(aal1, T1));
    expectMfa('aal1 delete', del(aal1, T2, 'delete.me@example.test'));
    expectMfa('no aal claim, ban', ban(noAal, T1));
    expectMfa('no aal claim, delete', del(noAal, T2, 'delete.me@example.test'));
    // The check runs before the target is read, so a bogus id gets the same
    // answer and an aal1 session learns nothing about which ids exist.
    expectMfa('aal1 ban of a missing id', ban(aal1, NOBODY));
    check('refused ban: the target is not banned', bannedUntil(T1) === '', bannedUntil(T1));
    check('refused ban: the refresh token is not revoked', !revoked(T1));
    check('refused delete: the target still exists', exists(T2));
    check('refused calls: no audit row was written', auditAll() === auditBefore, `before ${auditBefore}, after ${auditAll()}`);

    /* ---- 3. the guard still runs first ------------------------------ */
    console.log('');
    console.log('  The guard still comes first:');
    const pb1 = ban(plain1, T1);
    check('non-admin, aal1: ban answers forbidden, not MFA', pb1.ok && pb1.json.error === 'forbidden', JSON.stringify(pb1));
    const pd1 = del(plain1, T2, 'delete.me@example.test');
    check('non-admin, aal1: delete answers forbidden, not MFA', pd1.ok && pd1.json.error === 'forbidden', JSON.stringify(pd1));
    const pb2 = ban(plain2, T1);
    check('non-admin, aal2: ban answers forbidden', pb2.ok && pb2.json.error === 'forbidden', JSON.stringify(pb2));
    const pd2 = del(plain2, T2, 'delete.me@example.test');
    check('non-admin, aal2: delete answers forbidden', pd2.ok && pd2.json.error === 'forbidden', JSON.stringify(pd2));

    /* ---- 4. aal2 proceeds, and every 015 refusal is intact --------- */
    console.log('');
    console.log('  An aal2 admin session:');
    const expectErr = (label, r, word) =>
      check(`${label}: returns error ${word}`, r.ok && r.json.error === word, JSON.stringify(r));
    expectErr('aal2 ban self', ban(aal2, ADMIN), 'own_account');
    expectErr('aal2 ban another admin', ban(aal2, ADMIN2), 'target_is_admin');
    expectErr('aal2 ban a missing id', ban(aal2, NOBODY), 'not_found');
    expectErr('aal2 ban for 0 days', ban(aal2, T1, 0), 'bad_days');
    expectErr('aal2 delete self', del(aal2, ADMIN, 'owner@example.test'), 'own_account');
    expectErr('aal2 delete another admin', del(aal2, ADMIN2, 'second@example.test'), 'target_is_admin');
    expectErr('aal2 delete a missing id', del(aal2, NOBODY, 'x'), 'not_found');
    expectErr('aal2 delete with the wrong retype', del(aal2, T2, 'someone.else@example.test'), 'confirm_mismatch');
    check('wrong retype: the target still exists', exists(T2));

    const okBan = ban(aal2, T1, 7);
    check('aal2 ban: returns ok true', okBan.ok && okBan.json.ok === true, JSON.stringify(okBan));
    check('aal2 ban: returns bannedUntil', okBan.ok && typeof okBan.json.bannedUntil === 'string', JSON.stringify(okBan));
    check('aal2 ban: auth.users.banned_until is set', bannedUntil(T1) !== '');
    check('aal2 ban: the refresh token is revoked', revoked(T1));
    check('aal2 ban: exactly one ban_user audit row', audit('ban_user', T1) === 1, String(audit('ban_user', T1)));

    const okDel = del(aal2, T2, 'delete.me@example.test');
    check('aal2 delete: returns ok true', okDel.ok && okDel.json.ok === true, JSON.stringify(okDel));
    check('aal2 delete: the account is gone', !exists(T2));
    check('aal2 delete: exactly one delete_user audit row', audit('delete_user', T2) === 1, String(audit('delete_user', T2)));

    /* ---- 5. scope: unban is not gated ------------------------------- */
    console.log('');
    console.log('  Out of scope, unchanged:');
    const unban = rpc(aal1, `select public.admin_unban_user('${T1}'::uuid)`);
    check('aal1 unban still works (032 does not touch it)', unban.ok && unban.json.ok === true, JSON.stringify(unban));
    check('aal1 unban cleared banned_until', bannedUntil(T1) === '');
  } finally {
    if (work) { try { rmSync(work, { recursive: true, force: true }); } catch { /* temp dir */ } }
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
  }
}

console.log('admin_delete_user and admin_ban_user require aal2 (migration 032)');
console.log('-----------------------------------------------------------------');

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
  console.log('  SKIPPED. No database was reached, so NOTHING about the MFA check was');
  console.log('  tested. This run proves nothing.');
  console.log(`  Reason: ${skipReason}`);
  console.log('');
  console.log('  To run it, point the script at a PostgreSQL server you can write to');
  console.log('  without a password prompt, for example a throwaway trust-auth cluster:');
  console.log('    initdb -D <dir> -U postgres --auth=trust');
  console.log('    pg_ctl -D <dir> -o "-p 55434" start');
  console.log('    PGPORT=55434 node continent-app/scripts/admin/test_admin_mfa.mjs');
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
console.log('All admin MFA tests passed.');
