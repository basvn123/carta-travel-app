/**
 * Tests for migration 037: content_reports, report_guide() and
 * admin_list_content_reports(), the DSA Article 16 notice mechanism.
 *
 *   PGPORT=55434 node continent-app/scripts/admin/test_content_reports.mjs
 *
 * WHAT IT PROVES, in order:
 *
 *   0. The chain applies: 002, 004, 006, 007, 009, 010, 011, 014 to 018,
 *      019, 032 to 036, then 037 with its self-check notice.
 *   1. BEFORE 037 there is no way to file a report: the function does not
 *      exist, so an anonymous visitor can file 0.
 *   2. The anon grant: role anon, with no session, files a report on a
 *      public guide and it lands in content_reports with the guide's title
 *      and owner as they were, no reporter id, the contact email only when
 *      given (trimmed), the address only as a 64 character hash, and the
 *      header it came from.
 *   3. Validation: a short reason is bad_reason, a malformed email is
 *      bad_email, and neither stores a row.
 *   4. Not public: a private plan, a link-shared plan and an id that does
 *      not exist all answer not_public, identically, and store nothing.
 *   5. The rate limit: five reports from one address are accepted and the
 *      sixth is too_many; another address is unaffected; a forged
 *      x-forwarded-for does not escape cf-connecting-ip; x-forwarded-for is
 *      used, first entry, only when cf-connecting-ip is absent; an IPv6
 *      caller is bucketed by /64; a signed-in account is limited across
 *      addresses; callers with no header share one bucket; the window
 *      slides after an hour; the global ceiling of 500 an hour holds; ten
 *      parallel calls from one fresh address store exactly five.
 *   6. Privacy: anon, a plain user and an admin all get permission denied
 *      reading or inserting content_reports directly and reading the salt;
 *      anon cannot execute the admin list; a plain user gets forbidden.
 *   7. The admin list: an admin sees every report newest first with the
 *      reason, contact email, owner email, the per-source and per-guide
 *      counts, the title as reported beside the current one, and whether
 *      the guide is still public; an admin over the read budget gets
 *      slow_down; the status filter works.
 *   8. Deleting the reporter's account keeps the notice, reporter id null.
 *   9. The test catches a missing limit: with the per-source check removed
 *      from a copy of report_guide, one address files 20 of 20. This is the
 *      "unlimited" before figure for an unthrottled anon insert.
 *  10. Pasting 037 twice is safe and keeps the salt, so hashes stay
 *      comparable.
 *
 * HOW. The harness of test_admin_public_guides.mjs (T067), sliced from that
 * file, with its stubs unchanged. Client calls run as `set role anon` or
 * `set role authenticated` with request.jwt.claims and request.headers set,
 * the way PostgREST does. Superuser inserts stand in for rows the app
 * writes.
 *
 * Migration 018 applies as committed: T253 moved its URL length cap out of
 * the regex bound, so no patched copy is needed.
 *
 * NEEDS a PostgreSQL server that accepts a password-less connection (trust
 * auth or PGPASSWORD). Set PGHOST, PGPORT, PGUSER as needed; defaults are
 * 127.0.0.1:5432, postgres. With no server reachable the script SKIPS
 * LOUDLY, exits 0, and never prints that anything passed.
 *
 * It creates and drops a database named carta_t068_test. It never touches
 * the live Supabase project.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

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
const TEST_DB = process.env.CARTA_TEST_DB || 'carta_t068_test';

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
const PLAIN = '00000000-0000-0000-0000-00000000c001'; // a signed-in non-admin who reports
const AUTHOR = '00000000-0000-0000-0000-0000000000a1'; // owns the guides

const P_PUB = '10000000-0000-0000-0000-000000000001'; // public, the one reported
const P_PUB2 = '10000000-0000-0000-0000-000000000002'; // public, a second guide
const P_PRIV = '10000000-0000-0000-0000-000000000003';
const P_LINK = '10000000-0000-0000-0000-000000000004';
const P_NONE = '10000000-0000-0000-0000-0000000000ff'; // no such plan

const REASON = 'This guide copies a copyrighted book chapter word for word.';

/** The same call as psqlRun, without blocking, so parallel callers really
 *  hold separate connections at the same time. */
function psqlAsync(bin, db, args) {
  const base = ['-h', PG.host, '-p', PG.port, '-U', PG.user, '-d', db, '-w',
    '-q', '-v', 'ON_ERROR_STOP=1'];
  return new Promise((done) => {
    const child = spawn(bin, [...base, ...args], { env: { ...process.env, PGCLIENTENCODING: 'UTF8' } });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => done({ ok: code === 0, out, err }));
    child.on('error', (e) => done({ ok: false, out, err: String(e.message) }));
  });
}

async function runTests(bin) {
  let work = null;
  const measured = {};
  try {
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
    psql(bin, 'postgres', ['-c', `create database ${TEST_DB}`]);

    work = mkdtempSync(join(tmpdir(), 'carta-t068-'));
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
    const m19 = apply('019_public_guides.sql');
    check('019 self-check ran and passed', /public guides self-check passed/.test(m19.err + m19.out));
    apply('032_admin_mfa_destructive.sql');
    apply('033_admin_audit_rollback.sql');
    apply('034_admin_guard_tiers.sql');
    const m35 = apply('035_site_config_visibility.sql');
    check('035 self-check ran and passed', /site config visibility self-check passed/.test(m35.err + m35.out));
    const m36 = apply('036_admin_public_guides.sql');
    check('036 self-check ran and passed', /admin public guides self-check passed/.test(m36.err + m36.out));

    /* ---- seed --------------------------------------------------------- */
    const users = [[ADMIN, 'owner@example.test'], [PLAIN, 'plain@example.test'],
      [AUTHOR, 'author@example.test']];
    for (const [id, email] of users) {
      psql(bin, TEST_DB, ['-c', `insert into auth.users (id, email) values ('${id}', '${email}')`]);
    }
    psql(bin, TEST_DB, ['-c', `insert into public.admin_users (user_id, note) values ('${ADMIN}', 'owner')`]);
    psql(bin, TEST_DB, ['-c', `update public.profiles set handle = 'anna_travels', display_name = 'Anna'
      where user_id = '${AUTHOR}'`]);
    psql(bin, TEST_DB, ['-c', `update public.profiles set handle = 'plain_reader' where user_id = '${PLAIN}'`]);
    const plans = [
      [P_PUB, 'Four nights in Ghent', 'public'],
      [P_PUB2, 'Lisbon to Faro by train', 'public'],
      [P_PRIV, 'Private draft', 'private'],
      [P_LINK, 'Shared by link', 'link'],
    ];
    for (const [id, label, vis] of plans) {
      psql(bin, TEST_DB, ['-c', `insert into public.trip_plans (id, user_id, label) values ('${id}', '${AUTHOR}', '${label}')`,
        '-c', `update public.trip_plans set visibility = '${vis}' where id = '${id}'`]);
    }
    check('the seed has two public plans, one private, one link',
      scalar(bin, TEST_DB, `select string_agg(visibility, ',' order by id) from public.trip_plans`) === 'public,public,private,link');

    const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
    const AS = {
      admin: { role: 'authenticated', claims: { sub: ADMIN, role: 'authenticated', aal: 'aal1' } },
      plain: { role: 'authenticated', claims: { sub: PLAIN, role: 'authenticated', aal: 'aal1' } },
      anon: { role: 'anon', claims: { role: 'anon' } },
    };
    /** One statement as a client role, with the request headers PostgREST
     *  would expose, the way PostgREST does it. */
    const roleArgs = (who, sql, headers) => ['-At',
      '-c', `set request.jwt.claims = ${q(JSON.stringify(AS[who].claims))}`,
      '-c', `set request.headers = ${q(JSON.stringify(headers || {}))}`,
      '-c', `set role ${AS[who].role}`, '-c', sql];
    const asRole = (who, sql, headers) => psqlRun(bin, TEST_DB, roleArgs(who, sql, headers));
    const parse = (r) => {
      let json = null;
      if (r.ok) { try { json = JSON.parse(r.out.trim()); } catch { /* left null */ } }
      return { ...r, json };
    };
    const reportSql = (plan, reason = REASON, email = null) =>
      `select public.report_guide(${plan ? `${q(plan)}::uuid` : 'null'}, ${q(reason)}, ${email === null ? 'null' : q(email)})`;
    const report = (who, headers, plan = P_PUB, reason = REASON, email = null) =>
      parse(asRole(who, reportSql(plan, reason, email), headers));
    const listAs = (who, args = 'null, 200, 0') =>
      parse(asRole(who, `select public.admin_list_content_reports(${args})`, {}));
    const rowCount = () => Number(scalar(bin, TEST_DB, 'select count(*) from public.content_reports'));
    const cf = (ip) => ({ 'cf-connecting-ip': ip });

    /* ---- 1. before 037 ------------------------------------------------ */
    console.log('');
    console.log('  Before 037:');
    check('report_guide does not exist yet',
      scalar(bin, TEST_DB, `select to_regprocedure('public.report_guide(uuid, text, text)') is null`) === 't');
    const before = report('anon', cf('203.0.113.7'));
    check('an anonymous visitor calling it gets "function does not exist"',
      !before.ok && /does not exist/.test(before.err), before.err.trim().split('\n')[0]);
    measured.before = before.ok && before.json?.ok ? 1 : 0;
    console.log(`  measure  before 037: reports an anonymous visitor can file: ${measured.before}`);

    /* ---- 2. after 037, the anon path ---------------------------------- */
    console.log('');
    const m37 = apply('037_content_reports.sql');
    check('037 self-check ran and passed', /content reports self-check passed/.test(m37.err + m37.out));
    check('the self-check stored nothing', rowCount() === 0);
    const saltBefore = scalar(bin, TEST_DB, 'select salt from public.content_report_salt');
    console.log('');
    console.log('  An anonymous visitor reports a public guide:');
    const first = report('anon', cf('203.0.113.7'));
    check('role anon with no session gets {"ok":true}', first.json?.ok === true, first.out.trim() || first.err.trim());
    const row = scalar(bin, TEST_DB, `select row_to_json(r) from public.content_reports r order by id desc limit 1`);
    const r1 = row ? JSON.parse(row) : {};
    check('the report landed in content_reports', rowCount() === 1);
    check('it names the guide, its owner and its title as reported',
      r1.plan_id === P_PUB && r1.plan_owner === AUTHOR && r1.plan_label === 'Four nights in Ghent');
    check('the reason is stored as sent, status new', r1.reason === REASON && r1.status === 'new');
    check('no reporter id and no contact email for an anonymous caller who gave none',
      r1.reporter_id === null && r1.contact_email === null);
    check('the address is stored only as a 64 character hash, never in the clear',
      /^[0-9a-f]{64}$/.test(r1.source_hash || '') && !row.includes('203.0.113.7'));
    check('the header it came from is recorded', r1.source_header === 'cf-connecting-ip');

    const withMail = report('anon', cf('203.0.113.8'), P_PUB, REASON, '  reader@example.test  ');
    check('a contact email, when given, is stored trimmed', withMail.json?.ok === true
      && scalar(bin, TEST_DB, 'select contact_email from public.content_reports order by id desc limit 1') === 'reader@example.test');

    /* ---- 3. validation ------------------------------------------------ */
    console.log('');
    console.log('  Validation:');
    let n0 = rowCount();
    const shortR = report('anon', cf('203.0.113.9'), P_PUB, '   too short   ');
    check('a reason under 10 characters after trimming is bad_reason', shortR.json?.error === 'bad_reason', shortR.out.trim());
    const longR = report('anon', cf('203.0.113.9'), P_PUB, 'x'.repeat(4001));
    check('a reason over 4000 characters is bad_reason', longR.json?.error === 'bad_reason', longR.out.trim());
    for (const bad of ['not an email', 'a@b', 'two@@example.test', 'space in@example.test', `${'a'.repeat(250)}@example.test`]) {
      const r = report('anon', cf('203.0.113.9'), P_PUB, REASON, bad);
      check(`contact email ${bad.length > 40 ? `(${bad.length} chars)` : `"${bad}"`} is bad_email`, r.json?.error === 'bad_email', r.out.trim());
    }
    const blankMail = report('anon', cf('203.0.113.9'), P_PUB, REASON, '   ');
    check('a blank contact email counts as none, not as malformed', blankMail.json?.ok === true
      && scalar(bin, TEST_DB, 'select contact_email is null from public.content_reports order by id desc limit 1') === 't');
    check('refused calls stored nothing (only the accepted blank-email one landed)', rowCount() === n0 + 1);

    /* ---- 4. not public ------------------------------------------------ */
    console.log('');
    console.log('  Only public guides:');
    n0 = rowCount();
    for (const [plan, what] of [[P_PRIV, 'a private plan'], [P_LINK, 'a link-shared plan'], [P_NONE, 'an id with no plan'], [null, 'a null id']]) {
      const r = report('anon', cf('198.18.0.1'), plan);
      check(`${what} answers not_public`, r.json?.error === 'not_public', r.out.trim() || r.err.trim());
    }
    check('nothing was stored for any of them', rowCount() === n0);

    /* ---- 5. the rate limit -------------------------------------------- */
    console.log('');
    console.log('  Five an hour per source:');
    const A = cf('192.0.2.10');
    const seq = [];
    for (let i = 1; i <= 6; i += 1) seq.push(report('anon', A, i % 2 ? P_PUB : P_PUB2));
    check('calls 1 to 5 from one address are accepted', seq.slice(0, 5).every((r) => r.json?.ok === true),
      seq.map((r) => r.out.trim()).join(' '));
    check('the sixth from that address is refused with too_many', seq[5].json?.error === 'too_many', seq[5].out.trim());
    const hashA = scalar(bin, TEST_DB, `select source_hash from public.content_reports order by id desc limit 1`);
    check('exactly 5 rows carry that source',
      scalar(bin, TEST_DB, `select count(*) from public.content_reports where source_hash = '${hashA}'`) === '5');
    measured.after = seq.filter((r) => r.json?.ok === true).length;
    measured.sixth = seq[5].json?.error || 'accepted';
    console.log(`  measure  after 037: accepted from one address in an hour ${measured.after} of 6; the sixth answered ${measured.sixth}`);
    check('a seventh is refused too', report('anon', A).json?.error === 'too_many');
    check('another address is not affected', report('anon', cf('192.0.2.11')).json?.ok === true);
    const forged = report('anon', { 'cf-connecting-ip': '192.0.2.10', 'x-forwarded-for': '10.9.9.9' });
    check('a forged x-forwarded-for does not escape cf-connecting-ip', forged.json?.error === 'too_many', forged.out.trim());

    const xff = [];
    for (let i = 1; i <= 6; i += 1) {
      xff.push(report('anon', { 'x-forwarded-for': `198.51.100.9, 10.0.0.${i}` }));
    }
    check('without cf-connecting-ip, the first x-forwarded-for entry is the source (5 accepted, sixth too_many)',
      xff.slice(0, 5).every((r) => r.json?.ok === true) && xff[5].json?.error === 'too_many',
      xff.map((r) => r.out.trim()).join(' '));
    check('and the row says x-forwarded-for',
      scalar(bin, TEST_DB, `select source_header from public.content_reports order by id desc limit 1`) === 'x-forwarded-for');

    const v6 = [];
    for (let i = 1; i <= 6; i += 1) v6.push(report('anon', cf(`2001:db8:1:2::${i}`)));
    check('IPv6 addresses count by /64: five hosts accepted, the sixth host in the same /64 refused',
      v6.slice(0, 5).every((r) => r.json?.ok === true) && v6[5].json?.error === 'too_many',
      v6.map((r) => r.out.trim()).join(' '));
    check('a different /64 is a different source', report('anon', cf('2001:db8:1:3::1')).json?.ok === true);

    const acct = [];
    for (let i = 1; i <= 6; i += 1) acct.push(report('plain', cf(`100.64.0.${i}`)));
    check('a signed-in account is limited across addresses: five accepted, the sixth refused',
      acct.slice(0, 5).every((r) => r.json?.ok === true) && acct[5].json?.error === 'too_many',
      acct.map((r) => r.out.trim()).join(' '));
    check('its rows carry the reporter id',
      scalar(bin, TEST_DB, `select count(*) from public.content_reports where reporter_id = '${PLAIN}'`) === '5');
    check('and signing in does not escape the address bucket',
      report('plain', A).json?.error === 'too_many');

    const none = [];
    for (let i = 1; i <= 6; i += 1) none.push(report('anon', {}));
    check('callers with no address header share one bucket: five accepted, the sixth refused',
      none.slice(0, 5).every((r) => r.json?.ok === true) && none[5].json?.error === 'too_many',
      none.map((r) => r.out.trim()).join(' '));
    check('and the rows say none',
      scalar(bin, TEST_DB, `select count(*) from public.content_reports where source_header = 'none'`) === '5');
    const garbage = report('anon', cf('not-an-ip'));
    check('a header that is not an address is bucketed by its text, not rejected', garbage.json?.ok === true, garbage.out.trim());

    psql(bin, TEST_DB, ['-c', `update public.content_reports set created_at = now() - interval '61 minutes'
      where source_hash = '${hashA}'`]);
    check('an hour later the window has slid and that address may report again',
      report('anon', A).json?.ok === true);

    // The global ceiling: 500 in the last hour from anywhere.
    const nowCount = Number(scalar(bin, TEST_DB, `select count(*) from public.content_reports where created_at > now() - interval '1 hour'`));
    psql(bin, TEST_DB, ['-c', `insert into public.content_reports (plan_id, reason, source_hash, source_header)
      select '${P_PUB}', 'bulk flood row ' || g, md5(g::text), 'none' from generate_series(1, ${500 - nowCount}) g`]);
    const ceiling = report('anon', cf('192.0.2.200'));
    check('with 500 reports in the last hour, a fresh address is refused with too_many', ceiling.json?.error === 'too_many',
      ceiling.out.trim());
    psql(bin, TEST_DB, ['-c', `delete from public.content_reports where reason like 'bulk flood row %'`]);
    check('and accepted again once the flood is gone', report('anon', cf('192.0.2.200')).json?.ok === true);

    // Ten parallel calls from one fresh address: the advisory lock must let
    // exactly five through, not six because two raced past the count.
    const par = await Promise.all(Array.from({ length: 10 }, () =>
      psqlAsync(bin, TEST_DB, roleArgs('anon', reportSql(P_PUB), cf('192.0.2.77')))));
    const parOk = par.filter((r) => r.ok && /"ok": ?true/.test(r.out)).length;
    const parMany = par.filter((r) => r.ok && /too_many/.test(r.out)).length;
    check('ten parallel calls from one address store exactly five and refuse five',
      parOk === 5 && parMany === 5, `ok ${parOk}, too_many ${parMany}, ${par.filter((r) => !r.ok).map((r) => r.err.trim()).join(' | ')}`);
    measured.parallel = parOk;

    /* ---- 6. privacy --------------------------------------------------- */
    console.log('');
    console.log('  The table is private:');
    for (const who of ['anon', 'plain', 'admin']) {
      const sel = asRole(who, 'select count(*) from public.content_reports', {});
      check(`${who} cannot read content_reports directly`, !sel.ok && /permission denied/.test(sel.err),
        sel.out.trim() || sel.err.trim().split('\n')[0]);
      const ins = asRole(who, `insert into public.content_reports (plan_id, reason, source_hash, source_header)
        values ('${P_PUB}', 'written around the RPC', 'x', 'none')`, {});
      check(`${who} cannot insert into content_reports directly`, !ins.ok && /permission denied/.test(ins.err),
        ins.out.trim() || ins.err.trim().split('\n')[0]);
      const salt = asRole(who, 'select salt from public.content_report_salt', {});
      check(`${who} cannot read the salt`, !salt.ok && /permission denied/.test(salt.err),
        salt.out.trim() || salt.err.trim().split('\n')[0]);
    }
    check('RLS is on and the table has no policy',
      scalar(bin, TEST_DB, `select relrowsecurity || ',' || (select count(*) from pg_policies where tablename = 'content_reports')
        from pg_class where oid = 'public.content_reports'::regclass`) === 'true,0');
    const anonList = listAs('anon');
    check('anon cannot execute the admin list (permission denied)', !anonList.ok && /permission denied/.test(anonList.err),
      anonList.out.trim() || anonList.err.trim().split('\n')[0]);
    const plainList = listAs('plain');
    check('a signed-in non-admin gets {"error":"forbidden"} and no rows',
      plainList.json?.error === 'forbidden' && !('rows' in (plainList.json || {})), plainList.out.trim());
    check('both functions are SECURITY DEFINER with search_path pinned to empty',
      scalar(bin, TEST_DB, `select string_agg(prosecdef || ',' || array_to_string(proconfig, ';'), '|' order by proname)
        from pg_proc where proname in ('report_guide', 'admin_list_content_reports')`) === 'true,search_path=""|true,search_path=""');

    /* ---- 7. the admin list -------------------------------------------- */
    console.log('');
    console.log('  The admin queue:');
    psql(bin, TEST_DB, ['-c', `update public.trip_plans set label = 'Ghent, retitled' where id = '${P_PUB}'`]);
    psql(bin, TEST_DB, ['-c', `update public.trip_plans set visibility = 'private' where id = '${P_PUB2}'`]);
    const total = rowCount();
    const list = listAs('admin');
    const L = list.json || {};
    const rows = L.rows || [];
    check('an admin gets the list', list.ok && !L.error, list.err.trim() || L.error);
    check('total and new match the table, and it is not empty',
      L.total === total && L.new === total && total > 20, `total ${L.total}, new ${L.new}, table ${total}`);
    check('rows come newest first', rows.every((r, i) => i === 0 || rows[i - 1].id > r.id));
    const firstRow = rows.find((r) => r.id === r1.id);
    check('a row carries the reason, the title as reported and the current title',
      firstRow?.reason === REASON && firstRow?.planLabel === 'Four nights in Ghent' && firstRow?.currentLabel === 'Ghent, retitled');
    check('and the owner\'s handle and auth.users email',
      firstRow?.ownerHandle === 'anna_travels' && firstRow?.ownerEmail === 'author@example.test');
    const mailRow = rows.find((r) => r.contactEmail === 'reader@example.test');
    check('the contact email reaches the moderator when it was given', !!mailRow);
    const pub2Row = rows.find((r) => r.planId === P_PUB2);
    check('a guide unpublished since shows stillPublic false', pub2Row?.stillPublic === false && pub2Row?.planExists === true);
    check('the per-source count shows a flood (5 from the x-forwarded-for source)',
      rows.some((r) => r.sourceHeader === 'x-forwarded-for' && r.sourceTotal === 5));
    check('the per-guide count matches the table',
      firstRow?.planTotal === Number(scalar(bin, TEST_DB, `select count(*) from public.content_reports where plan_id = '${P_PUB}'`)));
    const plainRow = rows.find((r) => r.reporterId === PLAIN);
    check('a signed-in reporter shows with their handle', plainRow?.reporterHandle === 'plain_reader');
    check('no row carries the hash or the salt', rows.every((r) => !('sourceHash' in r) && !JSON.stringify(r).includes(hashA)));
    const paged = listAs('admin', `'new', 3, 0`).json || {};
    check('limit and the status filter work', (paged.rows || []).length === 3 && paged.total === total);
    const dismissed = listAs('admin', `'dismissed', 50, 0`).json || {};
    check('no row is dismissed yet', dismissed.total === 0 && (dismissed.rows || []).length === 0);
    const auditBefore = scalar(bin, TEST_DB, 'select count(*) from public.admin_audit_log');
    listAs('admin');
    check('a read writes no audit row', scalar(bin, TEST_DB, 'select count(*) from public.admin_audit_log') === auditBefore);
    psql(bin, TEST_DB, ['-c', `insert into public.admin_audit_log (actor, action) select '${ADMIN}', 'get_user' from generate_series(1, 60)`]);
    const slow = listAs('admin');
    check('an admin with 60 audit rows in the last minute gets slow_down', slow.json?.error === 'slow_down', slow.out.trim());
    psql(bin, TEST_DB, ['-c', `delete from public.admin_audit_log where actor = '${ADMIN}' and action = 'get_user'`]);

    /* ---- 8. the reporter leaves --------------------------------------- */
    console.log('');
    console.log('  Deleting the reporter:');
    psql(bin, TEST_DB, ['-c', `delete from auth.users where id = '${PLAIN}'`]);
    check('the notices stay, with the reporter id cleared',
      scalar(bin, TEST_DB, `select count(*) filter (where reporter_id is null) || ',' || count(*) from public.content_reports`)
        === `${total},${total}`);

    /* ---- 9. the test catches a missing limit -------------------------- */
    console.log('');
    console.log('  Without the per-source limit:');
    const src37 = readFileSync(resolve(migrations, '037_content_reports.sql'), 'utf8');
    const fnStart = src37.indexOf('create or replace function public.report_guide(');
    const fnEnd = src37.indexOf('$$;', src37.indexOf('return jsonb_build_object(\'ok\', true);')) + 3;
    const fnSrc = src37.slice(fnStart, fnEnd);
    const unlimited = fnSrc.replace(/if n >= 5 then/g, 'if false then');
    check('the copy really removed both per-source checks', (unlimited.match(/if false then/g) || []).length === 2);
    const unlimFile = join(work, 'report_guide_unlimited.sql');
    writeFileSync(unlimFile, unlimited, 'utf8');
    psql(bin, TEST_DB, ['-f', unlimFile]);
    let unl = 0;
    for (let i = 0; i < 20; i += 1) if (report('anon', cf('192.0.2.99')).json?.ok === true) unl += 1;
    check('an unthrottled report_guide accepts 20 of 20 from one address', unl === 20, `accepted ${unl}`);
    measured.unlimited = unl;
    console.log(`  measure  unthrottled copy: accepted from one address ${unl} of 20`);

    /* ---- 10. paste twice ---------------------------------------------- */
    console.log('');
    console.log('  Pasting 037 again:');
    const again = apply('037_content_reports.sql');
    check('037 pasted again passes its self-check', /content reports self-check passed/.test(again.err + again.out));
    check('the salt survived the second paste',
      scalar(bin, TEST_DB, 'select salt from public.content_report_salt') === saltBefore);
    check('the limit is back: a sixth call from a fresh address is refused', (() => {
      const r = [];
      for (let i = 0; i < 6; i += 1) r.push(report('anon', cf('192.0.2.123')).json);
      return r.slice(0, 5).every((j) => j?.ok === true) && r[5]?.error === 'too_many';
    })());
    check('still one function by each name',
      scalar(bin, TEST_DB, `select count(*) from pg_proc where proname in ('report_guide', 'admin_list_content_reports')`) === '2');
  } finally {
    if (work) { try { rmSync(work, { recursive: true, force: true }); } catch { /* temp dir */ } }
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
  }
  return measured;
}
console.log('report_guide files a DSA notice, five an hour per source (migration 037)');
console.log('-------------------------------------------------------------------------');

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
  console.log('  SKIPPED. No database was reached, so NOTHING about the content report mechanism');
  console.log('  was tested. This run proves nothing.');
  console.log(`  Reason: ${skipReason}`);
  console.log('');
  console.log('  To run it, point the script at a PostgreSQL server you can write to');
  console.log('  without a password prompt, for example a throwaway trust-auth cluster:');
  console.log('    initdb -D <dir> -U postgres --auth=trust');
  console.log('    pg_ctl -D <dir> -o "-p 55434" start');
  console.log('    PGPORT=55434 node continent-app/scripts/admin/test_content_reports.mjs');
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

if (measured && measured.after !== undefined) {
  console.log('');
  console.log(`  reports an anonymous visitor could file before 037: ${measured.before}`);
  console.log(`  reports accepted from one source in an hour: unthrottled copy ${measured.unlimited} of 20, `
    + `037 ${measured.after} of 6 (sixth: ${measured.sixth}), parallel ${measured.parallel} of 10`);
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
console.log('All content report tests passed.');
