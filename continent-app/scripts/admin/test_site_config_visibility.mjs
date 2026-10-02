/**
 * Tests for migration 035: site_config rows are readable by anon and
 * authenticated only where public = true.
 *
 *   PGPORT=55434 node continent-app/scripts/admin/test_site_config_visibility.mjs
 *
 * WHAT IT PROVES, in order:
 *
 *   0. The test is not vacuous: anon and authenticated are neither superuser
 *      nor bypassrls, a `set role` really switches current_user, and
 *      site_config has row level security on and not forced.
 *   1. BEFORE 035 (006, 007, 010, 014 to 018, 032, 033, 034 applied) the one
 *      read policy is USING (true), and anon, a plain signed-in user and an
 *      admin (through the client) each read every row, including a backend
 *      key (ai_global_daily_cap, the mirror T042-c tells the owner to set)
 *      inserted by the superuser. The row count is measured.
 *   2. After 035: the column exists (boolean, not null, default false); there
 *      is still exactly one policy, for anon and authenticated, USING
 *      (public = true); announcement, features and maintenance are public and
 *      the backend key is not; no seed value moved; each role reads exactly
 *      the three public keys (measured again); a private key inserted by the
 *      superuser is invisible to both roles even when asked for by name;
 *      anon and authenticated cannot flip the flag themselves.
 *   3. admin_set_config (034 body) on an existing public key keeps it public,
 *      and on a new key creates it private, invisible to every client read,
 *      the admin's included.
 *   4. Pasting 035 twice is safe and changes no flag.
 *   5. A SECURITY DEFINER reader owned by a NON-superuser table owner (as the
 *      `postgres` role is on Supabase) still reads a private key, which is how
 *      admin_ai_usage (030) and admin_margin (031) read their keys.
 *   6. Re-pasting 014 after 035 fails 014's own self-check (two policies),
 *      and under psql's per-statement commits it leaves the old USING (true)
 *      policy behind, re-opening every row. The hazard the report names.
 *
 * HOW. The harness of test_admin_guard_tiers.mjs (T065), with one addition:
 * the stubs grant the public schema's tables to anon, authenticated and
 * service_role by default, as Supabase does, so a refused read is refused by
 * the policy and not by a missing GRANT. Client reads run as `set role anon`
 * or `set role authenticated` with request.jwt.claims set, the way PostgREST
 * does. Superuser inserts stand in for rows an operator writes in the SQL
 * editor.
 *
 * Migration 018 applies as committed: T253 moved its URL length cap out of
 * the regex bound, so no patched copy is needed.
 *
 * NEEDS a PostgreSQL server that accepts a password-less connection (trust
 * auth or PGPASSWORD). Set PGHOST, PGPORT, PGUSER as needed; defaults are
 * 127.0.0.1:5432, postgres. With no server reachable the script SKIPS
 * LOUDLY, exits 0, and never prints that anything passed.
 *
 * It creates and drops a database named carta_t066_test and a role named
 * t066_owner. It never touches the live Supabase project.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
// CARTA_REPO_ROOT names the root checkout when continent-app is a sibling worktree (T281).
const repoRoot = process.env.CARTA_REPO_ROOT || resolve(here, '../../..');
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
const TEST_DB = process.env.CARTA_TEST_DB || 'carta_t066_test';

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

// The keys the app reads through the client (useSiteConfig.js,
// useConfigManager.js), sorted as the reads below sort them.
const APP_KEYS = ['announcement', 'features', 'maintenance'];
// A backend number the migrations tell an operator to store here (030).
const BACKEND_KEY = 'ai_global_daily_cap';

function runTests(bin) {
  let work = null;
  const measured = {};
  try {
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
    psql(bin, 'postgres', ['-c', `create database ${TEST_DB}`]);

    work = mkdtempSync(join(tmpdir(), 'carta-t066-'));
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

    apply('018_content_overrides.sql');
    apply('032_admin_mfa_destructive.sql');
    apply('033_admin_audit_rollback.sql');
    const m34 = apply('034_admin_guard_tiers.sql');
    check('034 self-check ran and passed', /admin guard tiers self-check passed/.test(m34.err + m34.out));

    for (const [id, email] of [[ADMIN, 'owner@example.test'], [PLAIN, 'plain@example.test']]) {
      psql(bin, TEST_DB, ['-c', `insert into auth.users (id, email) values ('${id}', '${email}')`]);
    }
    psql(bin, TEST_DB, ['-c', `insert into public.admin_users (user_id, note) values ('${ADMIN}', 'owner')`]);

    const claimsSql = (claims) => `set request.jwt.claims = '${JSON.stringify(claims).replace(/'/g, "''")}'`;
    const READERS = {
      anon: { role: 'anon', claims: { role: 'anon' } },
      authenticated: { role: 'authenticated', claims: { sub: PLAIN, role: 'authenticated', aal: 'aal1' } },
      'authenticated admin': { role: 'authenticated', claims: { sub: ADMIN, role: 'authenticated', aal: 'aal1' } },
    };

    /**
     * What a client read of site_config returns, as the given reader: the
     * role in effect and the keys, sorted. `where` narrows the read, as a
     * PostgREST ?key=eq. filter would.
     */
    const readAs = (reader, where = 'true') => {
      const { role, claims } = READERS[reader];
      const r = psqlRun(bin, TEST_DB, ['-At', '-c', `set role ${role}`, '-c', claimsSql(claims),
        '-c', `select current_user || '|' || coalesce(string_agg(key, ',' order by key), '') from public.site_config where ${where}`]);
      if (!r.ok) throw new Error(`read as ${reader} failed: ${r.err.trim()}`);
      const [who, keys] = r.out.trim().split('|');
      return { who, keys: keys ? keys.split(',') : [] };
    };
    const rpc = (claims, sql) => {
      const r = psqlRun(bin, TEST_DB, ['-At', '-c', 'set role authenticated', '-c', claimsSql(claims), '-c', sql]);
      if (r.ok) return { ok: true, json: JSON.parse(r.out.trim()) };
      return { ok: false, err: r.err.trim() };
    };
    const isOk = (r) => r.ok && r.json && r.json.ok === true;
    const policies = () => JSON.parse(scalar(bin, TEST_DB, `select coalesce(json_agg(json_build_object(
        'name', policyname, 'cmd', cmd, 'roles', roles::text[], 'qual', qual) order by policyname), '[]')::text
      from pg_policies where schemaname = 'public' and tablename = 'site_config'`));
    const allKeys = () => scalar(bin, TEST_DB, `select string_agg(key, ',' order by key) from public.site_config`).split(',');
    const isPublic = (key) => scalar(bin, TEST_DB, `select public from public.site_config where key = '${key}'`);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const snapshotValues = () => scalar(bin, TEST_DB, `select json_agg(json_build_object(
        'k', key, 'v', value, 't', updated_at, 'by', updated_by) order by key)::text from public.site_config`);
    const flagList = () => scalar(bin, TEST_DB, `select string_agg(key || '=' || public, ',' order by key) from public.site_config`);

    /* ---- 0. the roles really are subject to RLS ------------------------ */
    console.log('');
    console.log('  The readers are subject to RLS:');
    for (const role of ['anon', 'authenticated']) {
      const flags = scalar(bin, TEST_DB, `select rolsuper || ',' || rolbypassrls from pg_roles where rolname = '${role}'`);
      check(`${role} is neither superuser nor bypassrls (pg_roles rolsuper,rolbypassrls = ${flags})`, flags === 'false,false', flags);
    }
    for (const reader of Object.keys(READERS)) {
      const { who } = readAs(reader);
      check(`a read as "${reader}" runs as current_user ${READERS[reader].role}`, who === READERS[reader].role, who);
    }
    check('site_config has row level security on',
      scalar(bin, TEST_DB, `select relrowsecurity from pg_class where oid = 'public.site_config'::regclass`) === 't');
    check('site_config does not force row level security (the owner is exempt)',
      scalar(bin, TEST_DB, `select relforcerowsecurity from pg_class where oid = 'public.site_config'::regclass`) === 'f');

    /* ---- 1. before 035 ------------------------------------------------- */
    console.log('');
    console.log('  Before 035:');
    // A backend number, written the way an operator would write it: in the
    // SQL editor, as the owner.
    psql(bin, TEST_DB, ['-c', `insert into public.site_config (key, value) values ('${BACKEND_KEY}', '200'::jsonb)`]);
    const beforeKeys = allKeys();
    check(`the seeds plus the backend key are present: ${beforeKeys.join(', ')}`,
      same(beforeKeys, [...APP_KEYS, BACKEND_KEY].sort()), beforeKeys.join(','));
    const pBefore = policies();
    check('before 035: exactly one read policy, site_config_read_all, USING (true)',
      pBefore.length === 1 && pBefore[0].name === 'site_config_read_all' && pBefore[0].qual === 'true',
      JSON.stringify(pBefore));
    measured.before = { total: beforeKeys.length };
    for (const reader of Object.keys(READERS)) {
      const { keys } = readAs(reader);
      measured.before[reader] = keys.length;
      check(`before 035: "${reader}" reads every row, the backend key included (${keys.length} of ${beforeKeys.length})`,
        same(keys, beforeKeys), keys.join(','));
    }
    console.log(`  measure  before 035: rows in site_config ${measured.before.total}; readable by anon ${measured.before.anon}, `
      + `by authenticated ${measured.before.authenticated}, by an admin through the client ${measured.before['authenticated admin']}`);
    const valuesBefore = snapshotValues();

    /* ---- apply 035 ----------------------------------------------------- */
    console.log('');
    const m35 = apply('035_site_config_visibility.sql');
    check('035 self-check ran and passed', /site config visibility self-check passed/.test(m35.err + m35.out), (m35.err + m35.out).trim());

    /* ---- 2. after 035 -------------------------------------------------- */
    console.log('');
    console.log('  After 035:');
    const col = scalar(bin, TEST_DB, `select data_type || ',' || is_nullable || ',' || column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'site_config' and column_name = 'public'`);
    check(`site_config.public exists as boolean, not null, default false (${col})`, col === 'boolean,NO,false', col);
    const pAfter = policies();
    check('still exactly one policy on site_config (the 014 self-check invariant)', pAfter.length === 1, JSON.stringify(pAfter));
    check('the policy is site_config_read_public, FOR SELECT, TO anon and authenticated, USING (public = true)',
      pAfter.length === 1 && pAfter[0].name === 'site_config_read_public' && pAfter[0].cmd === 'SELECT'
      && same([...pAfter[0].roles].sort(), ['anon', 'authenticated']) && pAfter[0].qual === '(public = true)',
      JSON.stringify(pAfter));
    for (const key of APP_KEYS) check(`${key} is public`, isPublic(key) === 't');
    check(`${BACKEND_KEY} is private`, isPublic(BACKEND_KEY) === 'f');
    check('no value, updated_at or updated_by moved', snapshotValues() === valuesBefore);

    measured.after = { total: allKeys().length };
    for (const reader of Object.keys(READERS)) {
      const { keys } = readAs(reader);
      measured.after[reader] = keys.length;
      check(`after 035: "${reader}" reads exactly the three app keys (${keys.join(', ')})`, same(keys, APP_KEYS), keys.join(','));
    }
    console.log(`  measure  after 035: rows in site_config ${measured.after.total}; readable by anon ${measured.after.anon}, `
      + `by authenticated ${measured.after.authenticated}, by an admin through the client ${measured.after['authenticated admin']}`);

    psql(bin, TEST_DB, ['-c', `insert into public.site_config (key, value) values ('t066_private', '{"secret": "sk_test_nope"}'::jsonb)`]);
    check('a key inserted by the superuser without a flag defaults to private', isPublic('t066_private') === 'f');
    for (const reader of Object.keys(READERS)) {
      const named = readAs(reader, `key = 't066_private'`);
      const every = readAs(reader);
      check(`"${reader}" cannot read the private test key, not even by name`,
        named.keys.length === 0 && !every.keys.includes('t066_private'), JSON.stringify({ named, every }));
    }
    for (const role of ['anon', 'authenticated']) {
      const r = psqlRun(bin, TEST_DB, ['-c', `set role ${role}`, '-c', `update public.site_config set public = true where key = 't066_private'`]);
      const denied = (r.err.match(/permission denied[^\n]*/) || [''])[0];
      check(`${role} cannot flip the flag (${denied || 'no refusal'})`, !r.ok && denied !== '', r.err.trim());
    }
    check('the private test key is still private after the refused updates', isPublic('t066_private') === 'f');

    /* ---- 3. admin_set_config and the flag ------------------------------ */
    console.log('');
    console.log('  admin_set_config after 035:');
    const admin = READERS['authenticated admin'].claims;
    const s1 = rpc(admin, `select public.admin_set_config('announcement', '{"enabled": true, "text": "T066 notice", "tone": "info"}'::jsonb)`);
    check('admin_set_config on announcement succeeds', isOk(s1), JSON.stringify(s1));
    check('announcement took the new value and is still public',
      scalar(bin, TEST_DB, `select (value ->> 'text') || ',' || public from public.site_config where key = 'announcement'`) === 'T066 notice,true');
    const s2 = rpc(admin, `select public.admin_set_config('maintenance', '{"enabled": false, "message": "back soon"}'::jsonb)`);
    check('admin_set_config on maintenance succeeds and it stays public', isOk(s2) && isPublic('maintenance') === 't', JSON.stringify(s2));
    const s3 = rpc(admin, `select public.admin_set_config('features', '{"t066_flag": true}'::jsonb)`);
    check('admin_set_config on features succeeds and it stays public', isOk(s3) && isPublic('features') === 't', JSON.stringify(s3));
    const anonSees = readAs('anon', `key = 'features'`).keys;
    check('anon still reads the updated features row', same(anonSees, ['features']), anonSees.join(','));

    const s4 = rpc(admin, `select public.admin_set_config('t066_new_key', '{"threshold": 42}'::jsonb)`);
    check('admin_set_config creates a new key', isOk(s4), JSON.stringify(s4));
    check('the new key is private (public = false, from the column default)', isPublic('t066_new_key') === 'f');
    for (const reader of Object.keys(READERS)) {
      const named = readAs(reader, `key = 't066_new_key'`);
      check(`"${reader}" cannot read the new key through the client`, named.keys.length === 0, named.keys.join(','));
    }
    const s5 = rpc(admin, `select public.admin_set_config('t066_new_key', '{"threshold": 43}'::jsonb)`);
    check('a second admin_set_config on the new key updates it and leaves it private',
      isOk(s5) && scalar(bin, TEST_DB, `select (value ->> 'threshold') || ',' || public from public.site_config where key = 't066_new_key'`) === '43,false');
    check('still exactly one policy after the RPC calls', policies().length === 1);

    /* ---- 4. pasting 035 twice ------------------------------------------ */
    console.log('');
    console.log('  Pasting 035 again:');
    const flagsBefore = flagList();
    const again35 = apply('035_site_config_visibility.sql');
    check('035 pasted twice still passes its self-check', /site config visibility self-check passed/.test(again35.err + again35.out));
    const flagsAfter = flagList();
    check(`no flag changed (${flagsAfter})`, flagsAfter === flagsBefore, `${flagsBefore} vs ${flagsAfter}`);

    /* ---- 5. SECURITY DEFINER readers keep the private keys ------------- */
    console.log('');
    console.log('  SECURITY DEFINER readers (030, 031):');
    // On Supabase the table owner is `postgres`, which is not a superuser.
    // RLS does not apply to a table's owner unless the table forces it, and
    // that exemption, not superuser, is what lets admin_ai_usage and
    // admin_margin read private keys. Model it with a non-superuser owner.
    psql(bin, TEST_DB, ['-c', `do $d$ begin
        if not exists (select 1 from pg_roles where rolname = 't066_owner') then
          create role t066_owner nologin nosuperuser nobypassrls;
        end if; end $d$`]);
    psql(bin, TEST_DB, ['-c', 'alter table public.site_config owner to t066_owner']);
    psql(bin, TEST_DB, ['-c', `create function public.t066_probe() returns text language sql stable security definer
        set search_path = '' as $f$ select value::text from public.site_config where key = '${BACKEND_KEY}' $f$`,
      '-c', 'alter function public.t066_probe() owner to t066_owner',
      '-c', 'grant execute on function public.t066_probe() to anon, authenticated']);
    check('the probe owner is neither superuser nor bypassrls',
      scalar(bin, TEST_DB, `select rolsuper || ',' || rolbypassrls from pg_roles where rolname = 't066_owner'`) === 'false,false');
    const probe = psqlRun(bin, TEST_DB, ['-At', '-c', 'set role anon', '-c', 'select public.t066_probe()']);
    check(`a SECURITY DEFINER function owned by the table owner reads the private ${BACKEND_KEY} when anon calls it (got ${probe.out.trim() || 'nothing'})`,
      probe.ok && probe.out.trim() === '200', probe.err.trim());
    const direct = readAs('anon', `key = '${BACKEND_KEY}'`);
    check(`while anon still cannot read ${BACKEND_KEY} directly`, direct.keys.length === 0, direct.keys.join(','));
    psql(bin, TEST_DB, ['-c', 'drop function public.t066_probe()', '-c', 'alter table public.site_config owner to postgres']);

    /* ---- 6. re-pasting 014 after 035 ----------------------------------- */
    console.log('');
    console.log('  Ordering hazard:');
    const again14 = psqlRun(bin, TEST_DB, ['-f', resolve(migrations, '014_admin.sql')]);
    const why14 = (again14.err.match(/site_config should carry exactly the read policy[^\n]*/) || [''])[0];
    check(`re-pasting 014 after 035 fails 014's own self-check (${why14 || 'no such error'})`,
      !again14.ok && why14 !== '', again14.err.trim().split('\n')[0]);
    const leaked = readAs('anon');
    console.log(`  note  after that failed re-paste, under psql's per-statement commits, the policies are `
      + `${policies().map((p) => `${p.name} (${p.qual})`).join(' and ')} and anon reads ${leaked.keys.length} rows: ${leaked.keys.join(', ')}`);
    check('so a failed 014 re-paste left to stand makes the table world-readable again',
      leaked.keys.includes('t066_private'));
    const fix35 = apply('035_site_config_visibility.sql');
    check('pasting 035 after it closes the table again: self-check passes and anon reads the three app keys only',
      /site config visibility self-check passed/.test(fix35.err + fix35.out) && same(readAs('anon').keys, APP_KEYS));
  } finally {
    if (work) { try { rmSync(work, { recursive: true, force: true }); } catch { /* temp dir */ } }
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
    psqlRun(bin, 'postgres', ['-c', 'drop role if exists t066_owner']);
  }
  return measured;
}

console.log('site_config is readable by anon and authenticated only where public = true (migration 035)');
console.log('-----------------------------------------------------------------------------------------');

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
  console.log('  SKIPPED. No database was reached, so NOTHING about site_config');
  console.log('  visibility was tested. This run proves nothing.');
  console.log(`  Reason: ${skipReason}`);
  console.log('');
  console.log('  To run it, point the script at a PostgreSQL server you can write to');
  console.log('  without a password prompt, for example a throwaway trust-auth cluster:');
  console.log('    initdb -D <dir> -U postgres --auth=trust');
  console.log('    pg_ctl -D <dir> -o "-p 55434" start');
  console.log('    PGPORT=55434 node continent-app/scripts/admin/test_site_config_visibility.mjs');
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

if (measured && measured.before && measured.after) {
  console.log('');
  console.log(`  rows readable by anon: ${measured.before.anon} of ${measured.before.total} before 035, `
    + `${measured.after.anon} of ${measured.after.total} after`);
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
console.log('All site_config visibility tests passed.');
