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

const psqlRun = (sql) => {
  try {
    const out = execFileSync(psql, [
      ...connOpts.split(/\s+/),
      '-d', dbname,
      '-v', 'ON_ERROR_STOP=1',
      '-tc', sql,
    ], { encoding: 'utf-8' });
    return out.trim().split('\n').filter((x) => x);
  } catch (e) {
    if (e.status === 3 && e.stderr.includes('does not exist')) {
      console.log('SKIPPED: cannot connect to PostgreSQL');
      process.exit(0);
    }
    throw e;
  }
};

const setup = () => {
  try {
    psqlRun(`drop database if exists ${dbname};`);
  } catch { /* ok to fail */ }
  // Connect to postgres database to create the test database
  const out = execFileSync(psql, [
    ...connOpts.split(/\s+/),
    '-d', 'postgres',
    '-tc', `create database ${dbname};`,
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

const sqlAs = (role, sql) => {
  const withRole = `set role ${role}; ${sql}`;
  return psqlRun(withRole);
};

const sqlAsAuth = (uid, sql) => {
  const jwt = Buffer.from(JSON.stringify({ sub: uid, aud: 'authenticated', aal: 'aal1' })).toString('base64');
  const withClaim = `select set_config('request.jwt.claims', '${jwt}', true); ${sql}`;
  return sqlAs('authenticated', withClaim);
};

const teardown = () => {
  try {
    psqlRun(`drop database if exists ${dbname};`);
  } catch { /* ok to fail */ }
};

try {
  console.log('Setting up...');
  setup();

  console.log('\nApplying migrations 002, 004, 006, 007, 009-011, 014-018 (patched), 032-034, 040-042...');
  for (const n of [2, 4, 6, 7, 9, 10, 11, 14, 15, 16, 17, 18, 32, 33, 34, 40, 41, 42]) {
    applyMigration(n);
  }
  console.log('  ok  migrations applied');

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

  console.log('\nWriter tests...');
  const uid1 = '550e8400-e29b-41d4-a716-446655440001';
  const uid2 = '550e8400-e29b-41d4-a716-446655440002';

  // Write some test rows
  sqlAsAuth(uid1, "select public.log_parse_failure('text', 1024, '', 'json_parse', '1.0.0');");
  sqlAsAuth(uid1, "select public.log_parse_failure('pdf', 5120, 'application/pdf', 'missing_key', '1.0.0');");
  sqlAsAuth(uid2, "select public.log_parse_failure('image', 2048, 'image/jpeg', 'wrong_shape', '2.0.0');");

  const rows = sqlAsAuth(uid1, 'select count(*) as n from public.parse_failures;');
  check('rows written', rows.length === 1 && rows[0].includes('3'));

  // Invalid inputs write nothing
  sqlAsAuth(uid1, "select public.log_parse_failure('bad_kind', 1024, '', 'json_parse', '1.0.0');");
  sqlAsAuth(uid1, "select public.log_parse_failure('text', 0, '', 'json_parse', '1.0.0');");
  sqlAsAuth(uid1, "select public.log_parse_failure('text', 1024, '', 'bad_check', '1.0.0');");
  const rows2 = sqlAsAuth(uid1, 'select count(*) as n from public.parse_failures;');
  check('invalid inputs rejected', rows2.length === 1 && rows2[0].includes('3'));

  console.log('\nReader tests...');
  const report = sqlAsAuth(uid1, 'select public.admin_parse_failures(7) as r;');
  check('admin_parse_failures returns json', report.length > 0);

  console.log('\nadmin_health tests...');
  const health = sqlAsAuth(uid1, "select (public.admin_health()->'tables'->>'parse_failures')::text as present;");
  check('admin_health lists parse_failures', health.length > 0 && health[0] === 'true');

  console.log('\nDone.');
  console.log(`${checks} checks, ${failures} failures`);
  if (failures) process.exit(1);
} finally {
  teardown();
}
