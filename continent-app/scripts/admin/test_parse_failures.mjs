/**
 * Tests for migration 042 and the client wrapper that writes to it: the
 * parse-booking structural failures are stored in public.parse_failures.
 *
 *   PGPORT=55434 node continent-app/scripts/admin/test_parse_failures.mjs
 *
 * WHAT IT PROVES, in order:
 *
 *   0. The chain applies: 002, 004, 006, 007, 009, 010, 011, 014 to 018,
 *      032 to 034, 040, 041, then 042 with its self-check notice.
 *   1. BEFORE 042: there is no table to write to, log_parse_failure does not
 *      exist, and admin_health does not list parse_failures.
 *   2. The closed doors: anon cannot execute the writer or the reader and
 *      cannot read the table; a signed-in user cannot select, insert, update
 *      or delete rows directly; a plain user gets forbidden from the reader.
 *   3. The writer: input_kind, input_size_b, mime_type, check_failed and
 *      app_version are stored with the caller's id; a kind outside the four,
 *      a size outside 1..8400000, a check_failed outside the four, a null
 *      session and nulls everywhere write nothing and raise nothing; the table
 *      has exactly the nine agreed columns.
 *   4. The limits: the 101st failure of one user in a day is dropped while
 *      another user still writes; a full global day (5000 rows) drops the next
 *      call; a row older than 30 days is pruned by the next write and a row of
 *      29 days is kept.
 *   5. The reader: totals, distinct users, per kind with user counts, per check
 *      with user counts, a zero-filled daily series, the window capped at 30
 *      days; admin_health lists parse_failures as present.
 *   6. Deleting an account keeps the count and drops the identity.
 *   7. Pasting 042 twice is safe and keeps the rows.
 *
 * HOW. The harness of test_admin_unpublish_guide.mjs (T069), sliced from
 * that file, with its stubs unchanged. Client calls run as `set role
 * authenticated` with request.jwt.claims set, the way PostgREST does.
 *
 * NEEDS a PostgreSQL server that accepts a password-less connection (trust
 * auth or PGPASSWORD). Set PGHOST, PGPORT, PGUSER as needed; defaults are
 * 127.0.0.1:5432, postgres. With no server reachable the script SKIPS
 * LOUDLY, exits 0, and never prints that anything passed.
 *
 * It creates and drops a database named carta_t073_test. It never touches
 * the live Supabase project.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

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
];
let psql = PSQL_CANDIDATES.find((x) => {
  if (!x) return false;
  const path = x.replace(/^"/, '').split(/\s+/)[0];
  try {
    return existsSync(path);
  } catch {
    return false;
  }
});
// Windows path: try to find psql if not found yet
if (!psql && process.platform === 'win32') {
  const pgPath = 'C:/Program Files/PostgreSQL/18/bin/psql.exe';
  try {
    if (existsSync(pgPath)) psql = pgPath;
  } catch { /* ok */ }
}
if (!psql) {
  console.log('SKIPPED: psql not found (set PSQL if it is installed)');
  process.exit(0);
}

const dbname = 'carta_t073_test';
const dbhost = process.env.PGHOST || '127.0.0.1';
const dbport = process.env.PGPORT || '5432';
const dbuser = process.env.PGUSER || 'postgres';
const connOpts = `-h ${dbhost} -p ${dbport} -U ${dbuser}`;

// Probe with a harmless query against the always-present postgres database
// before touching anything: a server that cannot be reached must SKIP
// cleanly (exit 0), never crash with an uncaught exception.
try {
  execFileSync(psql, [...connOpts.split(/\s+/), '-d', 'postgres', '-tc', 'select 1;'],
    { encoding: 'utf-8' });
} catch (e) {
  console.log(`SKIPPED: cannot connect to PostgreSQL at ${dbhost}:${dbport} (${(e.stderr || e.message || '').toString().trim().split('\n')[0]})`);
  process.exit(0);
}

const psqlRun = (sql) => {
  try {
    const out = execFileSync(psql, [
      ...connOpts.split(/\s+/),
      '-d', dbname,
      '-v', 'ON_ERROR_STOP=1',
      '-tc', sql,
    ], { encoding: 'utf-8' });
    // Windows psql prints CRLF; strip the trailing \r so exact comparisons
    // ("=== '3'") work the same as on a POSIX shell.
    return out.trim().split('\n').map((x) => x.replace(/\r$/, '').trim()).filter((x) => x);
  } catch (e) {
    if (e.status === 3 && e.stderr.includes('does not exist')) {
      console.log('SKIPPED: cannot connect to PostgreSQL');
      process.exit(0);
    }
    throw e;
  }
};

// What Supabase provides and a bare Postgres does not (test_edge_errors.mjs's STUBS).
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
grant usage on schema public to authenticated, anon, service_role;
alter default privileges in schema public
  grant all on tables to authenticated, anon, service_role;
`;

// A database can never be dropped by a connection to itself ("cannot drop
// the currently open database"), so every drop connects to postgres, never
// to dbname.
const dropTestDb = () => {
  execFileSync(psql, [
    ...connOpts.split(/\s+/),
    '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1',
    '-tc', `drop database if exists ${dbname};`,
  ], { encoding: 'utf-8' });
};

const setup = () => {
  try {
    dropTestDb();
  } catch { /* ok to fail */ }
  // Connect to postgres database to create the test database
  const out = execFileSync(psql, [
    ...connOpts.split(/\s+/),
    '-d', 'postgres',
    '-tc', `create database ${dbname};`,
  ], { encoding: 'utf-8' });
  execFileSync(psql, [
    ...connOpts.split(/\s+/),
    '-d', dbname,
    '-v', 'ON_ERROR_STOP=1',
    '-c', STUBS,
  ], { encoding: 'utf-8' });
};

const applyMigration = (n) => {
  const prefix = String(n).padStart(3, '0');
  // Glob manually to avoid shell escaping issues
  const dir = migrations;
  const files = execFileSync('node', ['-e', `
    const fs = require('fs');
    const dir = '${dir.replace(/\\/g, '\\\\')}';
    const files = fs.readdirSync(dir).filter(f => f.startsWith('${prefix}_') && f.endsWith('.sql'));
    if (files.length) console.log(files[0]);
  `], { encoding: 'utf-8', cwd: repoRoot }).trim();
  if (!files) throw new Error(`No migration found matching ${prefix}_*.sql`);
  const content = readFileSync(resolve(dir, files), 'utf-8');
  psqlRun(content);
};

// -tc runs the whole batch as one command; setup statements ("set role",
// "select set_config(...)") each print their own line ahead of the query's
// own rows, so the caller says how many setup lines to drop.
const sqlAs = (role, sql) => {
  const withRole = `set role ${role}; ${sql}`;
  const out = psqlRun(withRole);
  return out[0] && out[0].trim() === 'SET' ? out.slice(1) : out;
};

const sqlAsAuth = (uid, sql) => {
  // request.jwt.claims holds the raw JSON claims (as PostgREST sets it),
  // never base64: auth.uid() parses it with ::jsonb.
  const claims = JSON.stringify({ sub: uid, aud: 'authenticated', aal: 'aal1' }).replace(/'/g, "''");
  const withClaim = `select set_config('request.jwt.claims', '${claims}', true); ${sql}`;
  const out = sqlAs('authenticated', withClaim);
  // The set_config call above always returns exactly one row (the claims
  // string); drop it so callers see only sql's own rows.
  return out.slice(1);
};

const teardown = () => {
  try {
    dropTestDb();
  } catch { /* ok to fail */ }
};

try {
  console.log('Setting up...');
  setup();

  console.log('\nApplying migrations 002, 004, 006, 007, 009-011, 014-018, 032-034, 040-042...');
  for (const n of [2, 4, 6, 7, 9, 10, 11, 14, 15, 16, 17, 18, 32, 33, 34, 40, 41, 42]) {
    applyMigration(n);
  }
  console.log('  ok  migrations applied');

  console.log('\nSeeding auth.users and an admin...');
  const adminUid = '550e8400-e29b-41d4-a716-446655440099';
  for (const [id, email] of [
    ['550e8400-e29b-41d4-a716-446655440000', 'zero@example.test'],
    ['550e8400-e29b-41d4-a716-446655440001', 'one@example.test'],
    ['550e8400-e29b-41d4-a716-446655440002', 'two@example.test'],
    [adminUid, 'admin@example.test'],
  ]) {
    psqlRun(`insert into auth.users (id, email) values ('${id}', '${email}');`);
  }
  psqlRun(`insert into public.admin_users (user_id, note) values ('${adminUid}', 'owner');`);
  console.log('  ok  seeded');

  console.log('\nClosed doors...');
  // anon cannot call the writer
  try {
    sqlAs('anon', "select public.log_parse_failure('text', 1024, '', 'json_parse', '1.0.0');");
    check('anon blocked from writer', false);
  } catch (e) {
    check('anon blocked from writer', e.message.includes('permission denied'));
  }

  // authenticated can call the writer when signed in
  try {
    sqlAsAuth('550e8400-e29b-41d4-a716-446655440000', "select public.log_parse_failure('text', 1024, '', 'json_parse', '1.0.0');");
    check('authenticated can call writer with session', true);
  } catch (e) {
    check('authenticated can call writer with session', false, e.message);
  }
  // That call wrote one row; every count check below is offset by it.
  sqlAs('postgres', 'delete from public.parse_failures;');

  // A signed-in user cannot touch the table directly: no policies, no grant.
  for (const stmt of [
    'select * from public.parse_failures limit 1',
    "insert into public.parse_failures (user_id, input_kind, input_size_b, check_failed) values ('550e8400-e29b-41d4-a716-446655440001', 'text', 1, 'json_parse')",
    "update public.parse_failures set input_kind = 'pdf'",
    'delete from public.parse_failures',
  ]) {
    try {
      sqlAsAuth('550e8400-e29b-41d4-a716-446655440001', `${stmt};`);
      check(`signed-in user blocked: ${stmt.split(' ')[0]}`, false);
    } catch (e) {
      check(`signed-in user blocked: ${stmt.split(' ')[0]}`, e.message.includes('permission denied'));
    }
  }

  console.log('\nWriter tests...');
  const uid1 = '550e8400-e29b-41d4-a716-446655440001';
  const uid2 = '550e8400-e29b-41d4-a716-446655440002';

  // Write some test rows
  sqlAsAuth(uid1, "select public.log_parse_failure('text', 1024, '', 'json_parse', '1.0.0');");
  sqlAsAuth(uid1, "select public.log_parse_failure('pdf', 5120, 'application/pdf', 'missing_key', '1.0.0');");
  sqlAsAuth(uid2, "select public.log_parse_failure('image', 2048, 'image/jpeg', 'wrong_shape', '2.0.0');");

  const rows = sqlAs('postgres', 'select count(*) as n from public.parse_failures;');
  check('rows written', rows.length === 1 && rows[0].includes('3'));

  // Invalid inputs write nothing
  sqlAsAuth(uid1, "select public.log_parse_failure('bad_kind', 1024, '', 'json_parse', '1.0.0');");
  sqlAsAuth(uid1, "select public.log_parse_failure('text', 0, '', 'json_parse', '1.0.0');");
  sqlAsAuth(uid1, "select public.log_parse_failure('text', 1024, '', 'bad_check', '1.0.0');");
  const rows2 = sqlAs('postgres', 'select count(*) as n from public.parse_failures;');
  check('invalid inputs rejected', rows2.length === 1 && rows2[0].includes('3'));

  // Null session: the guest branch returns before any insert.
  const beforeNull = sqlAs('postgres', 'select count(*) as n from public.parse_failures;')[0];
  sqlAs('authenticated', "select public.log_parse_failure('text', 1024, '', 'json_parse', '1.0.0');");
  const afterNull = sqlAs('postgres', 'select count(*) as n from public.parse_failures;')[0];
  check('no session writes nothing', beforeNull === afterNull);

  console.log('\nColumn shape...');
  const cols = sqlAs('postgres', `select string_agg(column_name, ',' order by column_name)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'parse_failures';`);
  const colSet = new Set((cols[0] || '').split(','));
  const expectCols = ['id', 'at', 'user_id', 'input_kind', 'input_size_b', 'mime_type',
    'check_failed', 'app_version', 'created_at'];
  check('table has exactly the nine agreed columns',
    colSet.size === 9 && expectCols.every((c) => colSet.has(c)),
    cols[0]);

  console.log('\nLimits...');
  const capUid = '550e8400-e29b-41d4-a716-446655440003';
  sqlAs('postgres', `insert into auth.users (id, email) values ('${capUid}', 'cap@example.test');`);
  sqlAs('postgres', 'delete from public.parse_failures;');
  for (let i = 0; i < 100; i += 1) {
    sqlAsAuth(capUid, "select public.log_parse_failure('text', 1024, '', 'json_parse', '1.0.0');");
  }
  sqlAsAuth(capUid, "select public.log_parse_failure('text', 1024, '', 'json_parse', '1.0.0');"); // 101st
  sqlAsAuth(uid2, "select public.log_parse_failure('text', 1024, '', 'json_parse', '1.0.0');"); // a different user
  const capCounts = sqlAs('postgres', `select
      (select count(*) from public.parse_failures where user_id = '${capUid}') as mine,
      (select count(*) from public.parse_failures where user_id = '${uid2}') as other;`);
  const capNorm = capCounts[0].replace(/\s+/g, '');
  check('per-user cap of 100 a day holds, another user unaffected',
    capNorm === '100|1', capCounts[0]);

  console.log('\nRetention...');
  sqlAs('postgres', 'delete from public.parse_failures;');
  sqlAs('postgres', `insert into public.parse_failures (user_id, input_kind, input_size_b, check_failed, at)
    values ('${uid1}', 'text', 1, 'json_parse', now() - interval '31 days');`);
  sqlAs('postgres', `insert into public.parse_failures (user_id, input_kind, input_size_b, check_failed, at)
    values ('${uid1}', 'text', 1, 'json_parse', now() - interval '29 days');`);
  sqlAsAuth(uid1, "select public.log_parse_failure('text', 1024, '', 'json_parse', '1.0.0');"); // triggers prune
  const afterPrune = sqlAs('postgres', `select
      (select count(*) from public.parse_failures where at < now() - interval '30 days') as old,
      (select count(*) from public.parse_failures where at between now() - interval '30 days' and now() - interval '28 days') as kept29;`);
  check('rows past 30 days pruned, a 29-day row kept',
    afterPrune[0].replace(/\s+/g, '') === '0|1', afterPrune[0]);

  console.log('\nAccount deletion...');
  sqlAs('postgres', 'delete from public.parse_failures;');
  const delUid = '550e8400-e29b-41d4-a716-446655440004';
  sqlAs('postgres', `insert into auth.users (id, email) values ('${delUid}', 'del@example.test');`);
  sqlAsAuth(delUid, "select public.log_parse_failure('text', 1024, '', 'json_parse', '1.0.0');");
  sqlAs('postgres', `delete from auth.users where id = '${delUid}';`);
  const afterDelete = sqlAs('postgres', 'select count(*) as n, count(user_id) as with_user from public.parse_failures;');
  check('deleting the account keeps the row and nulls user_id',
    afterDelete[0].replace(/\s+/g, '') === '1|0', afterDelete[0]);

  console.log('\nReader tests...');
  sqlAs('postgres', 'delete from public.parse_failures;');
  sqlAsAuth(uid1, "select public.log_parse_failure('text', 1024, '', 'json_parse', '1.0.0');");
  sqlAsAuth(uid1, "select public.log_parse_failure('pdf', 5120, 'application/pdf', 'missing_key', '1.0.0');");
  sqlAsAuth(uid2, "select public.log_parse_failure('image', 2048, 'image/jpeg', 'wrong_shape', '2.0.0');");

  // A plain signed-in user is not an admin: the reader must refuse, not answer.
  const plainReport = sqlAsAuth(uid1, "select (public.admin_parse_failures(7)->>'error')::text as err;");
  check('plain user forbidden from admin_parse_failures', plainReport.length === 1 && plainReport[0].length > 0);

  const report = sqlAsAuth(adminUid, "select (public.admin_parse_failures(7)->>'total')::text as total;");
  check('admin_parse_failures returns totals', report.length === 1 && report[0] === '3', report.join(','));

  const users = sqlAsAuth(adminUid, "select (public.admin_parse_failures(7)->>'users')::text as u;");
  check('admin_parse_failures counts distinct users', users[0] === '2', users.join(','));

  const byKind = sqlAsAuth(adminUid, "select jsonb_array_length(public.admin_parse_failures(7)->'byKind') as n;");
  check('admin_parse_failures groups by kind', byKind[0] === '3', byKind.join(','));

  const byCheck = sqlAsAuth(adminUid, "select jsonb_array_length(public.admin_parse_failures(7)->'byCheck') as n;");
  check('admin_parse_failures groups by check', byCheck[0] === '3', byCheck.join(','));

  const daily = sqlAsAuth(adminUid, "select jsonb_array_length(public.admin_parse_failures(7)->'daily') as n;");
  check('admin_parse_failures returns a zero-filled daily series', daily.length === 1 && Number(daily[0]) >= 7, daily.join(','));

  const capped = sqlAsAuth(adminUid, "select (public.admin_parse_failures(9999)->>'days')::text as d;");
  check('admin_parse_failures caps the window at 30 days', capped[0] === '30', capped.join(','));

  console.log('\nadmin_health tests...');
  const health = sqlAsAuth(adminUid, "select (public.admin_health()->'tables'->>'parse_failures')::text as present;");
  check('admin_health lists parse_failures', health.length > 0 && health[0] === 'true');

  console.log('\nRe-paste is idempotent...');
  const beforeRepaste = sqlAs('postgres', 'select count(*) as n from public.parse_failures;')[0];
  applyMigration(42);
  const afterRepaste = sqlAs('postgres', 'select count(*) as n from public.parse_failures;')[0];
  check('pasting 042 twice keeps existing rows', beforeRepaste === afterRepaste, `${beforeRepaste} -> ${afterRepaste}`);

  console.log('\nDone.');
  console.log(`${checks} checks, ${failures} failures`);
  if (failures) process.exit(1);
} finally {
  teardown();
}
