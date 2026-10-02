/**
 * Tests for migration 039: the statement of reasons for every takedown, the
 * owner's complaint against it, the decision on that complaint, and the
 * dismissed path for a report nobody acts on.
 *
 *   PGPORT=55434 node continent-app/scripts/admin/test_statement_of_reasons.mjs
 *
 * WHAT IT PROVES, in order:
 *
 *   0. The chain applies: 002, 004, 006, 007, 009, 010, 011, 014 to 018,
 *      019, 020, 023, 032 to 038, then 039 with its self-check notice.
 *   1. BEFORE 039: a takedown under 038 produces no statement (there is no
 *      table to hold one) and there is no complaint RPC. That is the
 *      "before" measurement: 0 statements per takedown, complaints not
 *      filable.
 *   2. Guards: anon cannot execute any new RPC; a plain user gets forbidden
 *      from the admin ones.
 *   3. Every takedown writes exactly one statement: content, ground (the
 *      moderator's reason), source (notice with its count, or own
 *      initiative), automated false, the date, six months to contest, the
 *      original published_at and the public fingerprint. Reports it closed
 *      carry decided_by, decided_at and the reason. A repeat call writes
 *      none.
 *   4. RLS: the owner reads their own statements and only those; another
 *      owner reads only theirs; a stranger reads none; anon has no
 *      privilege; nobody reads decided_by or content_hash; no client can
 *      insert or update.
 *   5. The complaint: free, owner only. A stranger, another owner and a
 *      missing id all get not_found; a short text is bad_reason; a second
 *      complaint is already_contested; past the window is too_late.
 *   6. The decision: guards and refusals; upheld leaves the plan private;
 *      reversed republishes under the rule (still private, and what the
 *      public sees unchanged) with the original published_at, and does not
 *      republish when the owner edited the title or chose friends. An edit
 *      the public never sees does not block reinstatement.
 *   7. The dismissed path: status, decided_by, decided_at, note, audit row;
 *      no plan touched and no statement written; repeat and non-new calls
 *      write nothing.
 *   8. The co-planner guard still holds with the second marker.
 *   9. The re-paste trap: 038 pasted after 039 makes a reversal fail loudly
 *      with nothing changed; pasting 039 again restores it.
 *  10. Nothing was deleted anywhere.
 *
 * HOW. The harness of test_admin_unpublish_guide.mjs (T069), sliced from
 * that file, with its stubs unchanged. Client calls run as `set role anon`
 * or `set role authenticated` with request.jwt.claims set, the way
 * PostgREST does.
 *
 * Migration 018 applies as committed: T253 moved its URL length cap out of
 * the regex bound, so no patched copy is needed.
 *
 * NEEDS a PostgreSQL server that accepts a password-less connection (trust
 * auth or PGPASSWORD). Set PGHOST, PGPORT, PGUSER as needed; defaults are
 * 127.0.0.1:5432, postgres. With no server reachable the script SKIPS
 * LOUDLY, exits 0, and never prints that anything passed.
 *
 * It creates and drops a database named carta_t070_test. It never touches
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
const TEST_DB = process.env.CARTA_TEST_DB || 'carta_t070_test';

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
const PLAIN = '00000000-0000-0000-0000-00000000c001'; // a signed-in stranger
const AUTHOR = '00000000-0000-0000-0000-0000000000a1'; // owns most guides
const OTHER = '00000000-0000-0000-0000-0000000000d1'; // owns one guide of their own
const COPL = '00000000-0000-0000-0000-0000000000b1'; // co-plans two of AUTHOR's guides

const P_PUB = '10000000-0000-0000-0000-000000000001'; // reported twice, taken down, reversed
const P_PUB2 = '10000000-0000-0000-0000-000000000002'; // reported once, report dismissed
const P_PRIV = '10000000-0000-0000-0000-000000000003';
const P_LINK = '10000000-0000-0000-0000-000000000004';
const P_PUB3 = '10000000-0000-0000-0000-000000000005'; // own initiative, owner edits the title
const P_PUB4 = '10000000-0000-0000-0000-000000000006'; // owner switches to friends
const P_PUB5 = '10000000-0000-0000-0000-000000000007'; // the re-paste trap
const P_PRE = '10000000-0000-0000-0000-000000000008'; // taken down under 038, before 039
const P_OTH = '10000000-0000-0000-0000-000000000009'; // OTHER's guide, upheld

const REASON = 'Copies a copyrighted book chapter word for word, see report.';
const COMPLAINT = 'I wrote every line of this guide myself; the chapter is my own blog post.';

async function runTests(bin) {
  let work = null;
  const measured = {};
  try {
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
    psql(bin, 'postgres', ['-c', `create database ${TEST_DB}`]);

    work = mkdtempSync(join(tmpdir(), 'carta-t070-'));
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
    apply('020_coplanners.sql');
    apply('023_coplanner_policy_fix.sql');
    apply('032_admin_mfa_destructive.sql');
    apply('033_admin_audit_rollback.sql');
    apply('034_admin_guard_tiers.sql');
    apply('035_site_config_visibility.sql');
    apply('036_admin_public_guides.sql');
    const m37 = apply('037_content_reports.sql');
    check('037 self-check ran and passed', /content reports self-check passed/.test(m37.err + m37.out));

    apply('038_admin_unpublish_guide.sql');

    /* ---- seed --------------------------------------------------------- */
    const users = [[ADMIN, 'owner@example.test'], [PLAIN, 'plain@example.test'],
      [AUTHOR, 'author@example.test'], [OTHER, 'other@example.test'], [COPL, 'copl@example.test']];
    for (const [id, email] of users) {
      psql(bin, TEST_DB, ['-c', `insert into auth.users (id, email) values ('${id}', '${email}')`]);
    }
    psql(bin, TEST_DB, ['-c', `insert into public.admin_users (user_id, note) values ('${ADMIN}', 'owner')`]);
    psql(bin, TEST_DB, ['-c', `update public.profiles set handle = 'anna_travels', display_name = 'Anna'
      where user_id = '${AUTHOR}'`]);
    psql(bin, TEST_DB, ['-c', `update public.profiles set handle = 'carta_mod' where user_id = '${ADMIN}'`]);
    const plans = [
      [P_PUB, AUTHOR, 'Four nights in Ghent', 'public'],
      [P_PUB2, AUTHOR, 'Lisbon to Faro by train', 'public'],
      [P_PRIV, AUTHOR, 'Private draft', 'private'],
      [P_LINK, AUTHOR, 'Shared by link', 'link'],
      [P_PUB3, AUTHOR, 'A weekend in Porto', 'public'],
      [P_PUB4, AUTHOR, 'Alps by bus', 'public'],
      [P_PUB5, AUTHOR, 'Vienna in winter', 'public'],
      [P_PRE, AUTHOR, 'Taken down before 039', 'public'],
      [P_OTH, OTHER, 'Rome on foot', 'public'],
    ];
    for (const [id, owner, label, vis] of plans) {
      psql(bin, TEST_DB, ['-c', `insert into public.trip_plans (id, user_id, label, created_at, updated_at)
          values ('${id}', '${owner}', '${label}', now() - interval '30 days', now() - interval '20 days')`,
        '-c', `update public.trip_plans set visibility = '${vis}' where id = '${id}'`]);
    }
    for (const [plan, pos, city] of [[P_PUB, 0, 'Ghent'], [P_PUB, 1, 'Bruges'], [P_PUB2, 0, 'Lisbon'],
      [P_PUB3, 0, 'Porto'], [P_PUB4, 0, 'Innsbruck'], [P_PUB5, 0, 'Vienna']]) {
      psql(bin, TEST_DB, ['-c', `insert into public.trip_plan_stops
          (trip_plan_id, user_id, position, destination_id, city, country, arrive_date, depart_date, choices)
          values ('${plan}', '${AUTHOR}', ${pos}, '${city.toLowerCase()}', '${city}', 'BE',
                  date '2026-10-01' + ${pos * 2}, date '2026-10-03' + ${pos * 2}, '{"stay":"hostel"}')`]);
    }
    psql(bin, TEST_DB, ['-c', `insert into public.day_plans (user_id, plan_id, payload)
        values ('${AUTHOR}', '${P_PUB}', '{"days":[{"note":"private note, expenses 42.50"}]}')`]);
    psql(bin, TEST_DB, ['-c', `insert into public.trip_collaborators (trip_plan_id, user_id, invited_by, status)
        values ('${P_PUB2}', '${COPL}', '${AUTHOR}', 'accepted'), ('${P_PUB3}', '${COPL}', '${AUTHOR}', 'accepted')`]);
    const pubStamp = scalar(bin, TEST_DB, `select published_at from public.trip_plans where id = '${P_PUB}'`);
    check('the seed has seven public guides and a published_at stamp on the first',
      Number(scalar(bin, TEST_DB, `select count(*) from public.trip_plans where visibility = 'public'`)) === 7 && pubStamp !== '');

    const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
    const claims = (sub) => ({ role: 'authenticated', claims: { sub, role: 'authenticated', aal: 'aal1' } });
    const AS = {
      admin: claims(ADMIN), plain: claims(PLAIN), author: claims(AUTHOR), other: claims(OTHER), copl: claims(COPL),
      anon: { role: 'anon', claims: { role: 'anon' } },
    };
    const roleArgs = (who, sql) => ['-At',
      '-c', `set request.jwt.claims = ${q(JSON.stringify(AS[who].claims))}`,
      '-c', `set request.headers = ${q(JSON.stringify({ 'user-agent': 'test' }))}`,
      '-c', `set role ${AS[who].role}`, '-c', sql];
    const asRole = (who, sql) => psqlRun(bin, TEST_DB, roleArgs(who, sql));
    const parse = (r) => {
      let json = null;
      if (r.ok) { try { json = JSON.parse(r.out.trim()); } catch { /* left null */ } }
      return { ...r, json };
    };
    const rpc = (who, sql) => parse(asRole(who, `select ${sql}`));
    const unpublish = (who, plan, reason = REASON) => rpc(who, `public.admin_unpublish_guide(${q(plan)}::uuid, ${q(reason)})`);
    const contest = (who, id, body = COMPLAINT) => rpc(who,
      `public.contest_moderation_decision(${id === null ? 'null' : Number(id)}, ${body === null ? 'null' : q(body)})`);
    const decide = (who, id, outcome, reason = 'Checked the blog post; it is the author\'s own text.') => rpc(who,
      `public.admin_decide_complaint(${Number(id)}, ${outcome === null ? 'null' : q(outcome)}, ${reason === null ? 'null' : q(reason)})`);
    const dismiss = (who, id, reason = 'Not illegal: a negative review of a hostel is an opinion.') => rpc(who,
      `public.admin_dismiss_content_report(${Number(id)}, ${reason === null ? 'null' : q(reason)})`);
    const count = (sql) => Number(scalar(bin, TEST_DB, sql));
    const plansN = () => count('select count(*) from public.trip_plans');
    const auditN = () => count('select count(*) from public.admin_audit_log');
    const stmtN = () => count('select count(*) from public.moderation_statements');
    const vis = (plan) => scalar(bin, TEST_DB, `select visibility || '|' || coalesce(published_at::text, 'null')
        from public.trip_plans where id = '${plan}'`);
    const stmt = (plan) => JSON.parse(scalar(bin, TEST_DB,
      `select coalesce(row_to_json(s)::text, 'null') from public.moderation_statements s where plan_id = '${plan}'`) || 'null');
    const lastAudit = () => JSON.parse(scalar(bin, TEST_DB, 'select row_to_json(l) from public.admin_audit_log l order by id desc limit 1'));
    // The columns the app selects (SavedTripsPanel via src/auth/moderation.js).
    const OWNER_COLS = 'id, plan_id, plan_label, source, notice_count, facts, automated, created_at, contest_until, complaint_status, complaint_note, reinstated';

    // Reports: two on P_PUB, one on P_PUB2, one on P_PRE.
    const REP = 'This guide reproduces a copyrighted text without permission.';
    for (const [plan, ip] of [[P_PUB, '203.0.113.1'], [P_PUB, '203.0.113.2'], [P_PUB2, '203.0.113.3'], [P_PRE, '203.0.113.4']]) {
      const r = psqlRun(bin, TEST_DB, ['-At',
        '-c', `set request.headers = ${q(JSON.stringify({ 'cf-connecting-ip': ip }))}`,
        '-c', 'set role anon',
        '-c', `select public.report_guide('${plan}', ${q(REP)}, null)`]);
      check(`a report on ${plan} is filed`, /"ok": true/.test(r.out), r.err.trim());
    }
    const plans0 = plansN();
    const stops0 = count('select count(*) from public.trip_plan_stops');

    /* ---- 1. before 039 ------------------------------------------------ */
    console.log('');
    console.log('  Before 039 (038 applied):');
    const pre = unpublish('admin', P_PRE);
    check('a takedown under 038 works and returns no statement id',
      pre.json?.changed === true && pre.json?.statementId === undefined, pre.out.trim() || pre.err.trim());
    check('there is no table to hold a statement',
      scalar(bin, TEST_DB, `select to_regclass('public.moderation_statements') is null`) === 't');
    measured.statementsBefore = 0;
    const preC = contest('author', 1);
    check('the owner has no complaint route (function does not exist)', !preC.ok && /does not exist/.test(preC.err),
      preC.err.trim().split('\n')[0]);
    measured.complaintBefore = preC.ok;
    check('the report 038 closed has no decided_by column yet',
      scalar(bin, TEST_DB, `select count(*) from information_schema.columns
        where table_name = 'content_reports' and column_name = 'decided_by'`) === '0');

    /* ---- 2. 039 and guards -------------------------------------------- */
    console.log('');
    const m39 = apply('039_statement_of_reasons.sql');
    check('039 self-check ran and passed', /statement of reasons self-check passed/.test(m39.err + m39.out));
    check('a takedown made before 039 has no statement (not backfilled)', stmtN() === 0);

    console.log('');
    console.log('  Guards:');
    for (const [label, sql] of [
      ['contest_moderation_decision', `public.contest_moderation_decision(1, ${q(COMPLAINT)})`],
      ['admin_dismiss_content_report', `public.admin_dismiss_content_report(1, 'x')`],
      ['admin_decide_complaint', `public.admin_decide_complaint(1, 'upheld', 'x')`],
      ['admin_list_moderation_complaints', 'public.admin_list_moderation_complaints(null, 5, 0)'],
      ['moderation_guide_fingerprint', `public.moderation_guide_fingerprint('${P_PUB}')`],
    ]) {
      const r = rpc('anon', sql);
      check(`anon cannot execute ${label}`, !r.ok && /permission denied/.test(r.err), r.out.trim() || r.err.trim().split('\n')[0]);
    }
    const fpUser = rpc('author', `public.moderation_guide_fingerprint('${P_PUB}')`);
    check('a signed-in user cannot execute moderation_guide_fingerprint', !fpUser.ok && /permission denied/.test(fpUser.err));
    for (const [label, sql] of [
      ['dismiss', `public.admin_dismiss_content_report(1, 'x')`],
      ['decide', `public.admin_decide_complaint(1, 'upheld', 'x')`],
      ['list complaints', 'public.admin_list_moderation_complaints(null, 5, 0)'],
    ]) {
      const r = rpc('plain', sql);
      check(`a plain user gets forbidden from ${label}`, r.json?.error === 'forbidden', r.out.trim() || r.err.trim());
    }

    /* ---- 3. the statement --------------------------------------------- */
    console.log('');
    console.log('  One statement per takedown:');
    const fpPub = scalar(bin, TEST_DB, `select public.moderation_guide_fingerprint('${P_PUB}')`);
    let s0 = stmtN();
    let audit0 = auditN();
    const down = unpublish('admin', P_PUB);
    check('the takedown answers ok, changed, 2 reports actioned, with a statement id',
      down.json?.changed === true && down.json?.reportsActioned === 2 && Number(down.json?.statementId) > 0,
      down.out.trim() || down.err.trim());
    check('exactly one statement was written', stmtN() === s0 + 1, `${s0} -> ${stmtN()}`);
    measured.statementsAfter = stmtN() - s0;
    const st = stmt(P_PUB);
    check('it names the content: plan id, title as it was, owner',
      st?.plan_id === P_PUB && st?.plan_label === 'Four nights in Ghent' && st?.owner_id === AUTHOR);
    check('it states the restriction', st?.restriction === 'removed_from_gallery');
    check('it holds the facts relied on, the moderator\'s reason', st?.facts === REASON);
    check('it says it came from notices, and how many', st?.source === 'notice' && st?.notice_count === 2);
    check('it says no automated means were used', st?.automated === false);
    check('it is dated and open to contest for six months',
      scalar(bin, TEST_DB, `select (created_at > now() - interval '1 minute'
          and contest_until = created_at + interval '6 months')::text
          from public.moderation_statements where plan_id = '${P_PUB}'`) === 'true');
    check('it keeps the original published_at',
      scalar(bin, TEST_DB, `select (previous_published_at = '${pubStamp}'::timestamptz)::text
          from public.moderation_statements where plan_id = '${P_PUB}'`) === 'true');
    check('it keeps the fingerprint of what the public saw', st?.content_hash === fpPub && fpPub.length === 32);
    check('it records the moderator and no complaint yet', st?.decided_by === ADMIN && st?.complaint_status === 'none');
    check('it copies nothing about the reporters',
      !JSON.stringify(st).includes('203.0.113') && !('reporter_id' in (st || {})));
    const a = lastAudit();
    check('the one audit row carries the statement id', auditN() === audit0 + 1
      && a.action === 'unpublish_guide' && Number(a.detail?.statementId) === Number(st?.id), JSON.stringify(a.detail));
    const decided = scalar(bin, TEST_DB, `select string_agg(status || '|' || (decided_by = '${ADMIN}')::text || '|'
        || (decided_at is not null)::text || '|' || (decision_note = ${q(REASON)})::text, ',' order by id)
        from public.content_reports where plan_id = '${P_PUB}'`);
    check('both reports are actioned with decided_by, decided_at and the reason',
      decided === 'actioned|true|true|true,actioned|true|true|true', decided);

    const own = unpublish('admin', P_PUB3, 'Spam: the guide is an advert for a tour company.');
    const st3 = stmt(P_PUB3);
    check('a takedown with no reports is own initiative with 0 notices',
      own.json?.changed === true && st3?.source === 'own_initiative' && st3?.notice_count === 0);
    s0 = stmtN();
    const again = unpublish('admin', P_PUB);
    check('a repeat takedown writes no statement', again.json?.changed === false && stmtN() === s0);
    unpublish('admin', P_PUB4, 'Contains a private phone number of a third person.');
    unpublish('admin', P_PUB5, 'Contains a private phone number of a third person.');
    unpublish('admin', P_OTH, 'Links to a pirated film download.');
    check('five takedowns under 039, five statements', stmtN() === 5, String(stmtN()));

    /* ---- 4. RLS -------------------------------------------------------- */
    console.log('');
    console.log('  Who can read a statement:');
    const ownRead = asRole('author', `select string_agg(plan_id::text, ',' order by id) from public.moderation_statements`);
    check('the owner reads their own four statements',
      ownRead.ok && ownRead.out.trim() === [P_PUB, P_PUB3, P_PUB4, P_PUB5].join(','), ownRead.out.trim() || ownRead.err.trim());
    const ownCols = asRole('author', `select count(*) from (select ${OWNER_COLS} from public.moderation_statements) x`);
    check('the owner can select every column the app asks for', ownCols.ok && ownCols.out.trim() === '4',
      ownCols.out.trim() || ownCols.err.trim());
    const othRead = asRole('other', `select string_agg(plan_id::text, ',') from public.moderation_statements`);
    check('another owner reads only their own', othRead.ok && othRead.out.trim() === P_OTH, othRead.out.trim());
    const strRead = asRole('plain', `select count(*) from public.moderation_statements`);
    check('a stranger reads none', strRead.ok && strRead.out.trim() === '0', strRead.out.trim() || strRead.err.trim());
    const strById = asRole('plain', `select count(*) from public.moderation_statements where plan_id = '${P_PUB}'`);
    check('a stranger asking for the plan by id reads none', strById.ok && strById.out.trim() === '0');
    const anonRead = asRole('anon', `select count(*) from public.moderation_statements`);
    check('anon has no privilege at all', !anonRead.ok && /permission denied/.test(anonRead.err), anonRead.out.trim());
    for (const col of ['decided_by', 'content_hash', 'complaint_decided_by', 'previous_published_at']) {
      const r = asRole('author', `select ${col} from public.moderation_statements`);
      check(`the owner cannot read ${col}`, !r.ok && /permission denied/.test(r.err), r.out.trim());
    }
    const ins = asRole('author', `insert into public.moderation_statements (plan_id, source, facts)
        values ('${P_PRIV}', 'own_initiative', 'forged')`);
    check('the owner cannot insert a statement', !ins.ok && /permission denied/.test(ins.err));
    const upd = asRole('author', `update public.moderation_statements set complaint_status = 'reversed'`);
    check('the owner cannot update a statement directly', !upd.ok && /permission denied/.test(upd.err));

    /* ---- 5. the complaint --------------------------------------------- */
    console.log('');
    console.log('  The complaint:');
    const idPub = st.id;
    const id3 = st3.id;
    const id4 = stmt(P_PUB4).id;
    const id5 = stmt(P_PUB5).id;
    const idOth = stmt(P_OTH).id;
    const stranger = contest('plain', idPub);
    check('a stranger complaining about someone else\'s statement is refused (not_found)',
      stranger.json?.error === 'not_found', stranger.out.trim());
    const wrongOwner = contest('other', idPub);
    check('another owner is refused the same way', wrongOwner.json?.error === 'not_found', wrongOwner.out.trim());
    const anonC = contest('anon', idPub);
    check('anon cannot complain at all', !anonC.ok && /permission denied/.test(anonC.err));
    check('a missing statement id is not_found', contest('author', 999999).json?.error === 'not_found');
    check('a null statement id is not_found', contest('author', null).json?.error === 'not_found');
    check('a short complaint is bad_reason', contest('author', idPub, 'unfair').json?.error === 'bad_reason');
    check('a blank complaint is bad_reason', contest('author', idPub, '   \n\t   ').json?.error === 'bad_reason');
    check('a complaint over 4000 characters is bad_reason', contest('author', idPub, 'x'.repeat(4001)).json?.error === 'bad_reason');
    check('none of those changed the statement', stmt(P_PUB).complaint_status === 'none');
    const filed = contest('author', idPub);
    check('the owner files a complaint, free, as a plain signed-in user', filed.json?.ok === true && filed.json?.status === 'open',
      filed.out.trim() || filed.err.trim());
    measured.complaintAfter = filed.json?.ok === true;
    const sp = stmt(P_PUB);
    check('it is on the statement: text, time, open',
      sp.complaint_body === COMPLAINT && sp.complaint_at && sp.complaint_status === 'open');
    check('a second complaint is already_contested', contest('author', idPub).json?.error === 'already_contested');
    psql(bin, TEST_DB, ['-c', `update public.moderation_statements set contest_until = now() - interval '1 day' where id = ${id3}`]);
    check('past the window is too_late', contest('author', id3).json?.error === 'too_late');
    psql(bin, TEST_DB, ['-c', `update public.moderation_statements set contest_until = created_at + interval '6 months' where id = ${id3}`]);
    check('within the window the same complaint is accepted', contest('author', id3).json?.ok === true);
    contest('author', id4);
    contest('author', id5);
    check('another owner files against their own', contest('other', idOth).json?.ok === true);
    const ownView = asRole('author', `select complaint_status from public.moderation_statements where id = ${idPub}`);
    check('the owner sees their complaint as open', ownView.out.trim() === 'open');

    /* ---- 6. the decision ---------------------------------------------- */
    console.log('');
    console.log('  The decision on a complaint:');
    const listed = rpc('admin', `public.admin_list_moderation_complaints('open', 50, 0)`);
    check('the admin queue lists the five open complaints', listed.json?.total === 5 && listed.json?.open === 5,
      listed.out.trim().slice(0, 200));
    const rowOf = (res, id) => (res.json?.rows || []).find((r) => Number(r.statementId) === Number(id)) || {};
    check('each row carries the complaint, the facts, the owner and who decided',
      rowOf(listed, idPub).complaintBody === COMPLAINT && rowOf(listed, idPub).facts === REASON
        && rowOf(listed, idPub).ownerHandle === 'anna_travels' && rowOf(listed, idPub).decidedByHandle === 'carta_mod');
    check('the queue says the untouched guide would come back', rowOf(listed, idPub).unchanged === true);
    const noC = rpc('admin', `public.admin_decide_complaint(${idPub}, 'maybe', 'x')`);
    check('an outcome other than upheld or reversed is bad_outcome', noC.json?.error === 'bad_outcome', noC.out.trim());
    check('a blank reason is bad_reason', decide('admin', idPub, 'upheld', '  \n ').json?.error === 'bad_reason');
    check('a missing statement is not_found', decide('admin', 999999, 'upheld').json?.error === 'not_found');
    check('a plain user is forbidden', decide('plain', idPub, 'reversed').json?.error === 'forbidden');
    psql(bin, TEST_DB, ['-c', `update public.moderation_statements set complaint_status = 'none', complaint_body = null,
        complaint_at = null where id = ${idOth}`]);
    check('a statement with no complaint is no_complaint', decide('admin', idOth, 'upheld').json?.error === 'no_complaint');
    contest('other', idOth);
    check('the guide is still private while the complaint is open', vis(P_PUB) === 'private|null');

    // An edit the public never sees: a stop's transport notes.
    const hidden = asRole('author', `update public.trip_plan_stops set transport_notes = '{"note":"bus at 9"}'
        where trip_plan_id = '${P_PUB}' and position = 0 returning id`);
    check('the owner makes an edit the public guide does not show', hidden.ok && hidden.out.trim() !== '');
    audit0 = auditN();
    const rev = decide('admin', idPub, 'reversed');
    check('reversing an untouched guide answers reinstated true',
      rev.json?.changed === true && rev.json?.outcome === 'reversed' && rev.json?.reinstated === true,
      rev.out.trim() || rev.err.trim());
    check('the guide is public again with its original published_at',
      scalar(bin, TEST_DB, `select (visibility = 'public' and published_at = '${pubStamp}'::timestamptz)::text
          from public.trip_plans where id = '${P_PUB}'`) === 'true', vis(P_PUB));
    const gal = asRole('anon', `select count(*) from public.list_public_guides(null, 60, 0) where trip_plan_id = '${P_PUB}'`);
    check('it is back in the gallery', gal.ok && gal.out.trim() === '1', gal.out.trim() || gal.err.trim());
    const sr = stmt(P_PUB);
    check('the statement records reversed, who, when, why and reinstated',
      sr.complaint_status === 'reversed' && sr.complaint_decided_by === ADMIN && sr.complaint_decided_at
        && sr.complaint_note && sr.reinstated === true);
    const ra = lastAudit();
    check('one decide_complaint audit row, owner as target, previous and new',
      auditN() === audit0 + 1 && ra.action === 'decide_complaint' && ra.target_user === AUTHOR
        && ra.detail?.previous?.visibility === 'private' && ra.detail?.new?.visibility === 'public'
        && ra.detail?.reinstated === true, JSON.stringify(ra.detail));
    audit0 = auditN();
    const rev2 = decide('admin', idPub, 'upheld');
    check('deciding again changes nothing and writes no audit row',
      rev2.json?.changed === false && rev2.json?.outcome === 'reversed' && auditN() === audit0 && stmt(P_PUB).complaint_status === 'reversed');

    // The owner edited the title: what the public would see changed.
    asRole('author', `update public.trip_plans set label = 'A long weekend in Porto' where id = '${P_PUB3}'`);
    const listed2 = rpc('admin', `public.admin_list_moderation_complaints('open', 50, 0)`);
    check('the queue says the edited guide would not come back', rowOf(listed2, id3).unchanged === false);
    const rev3 = decide('admin', id3, 'reversed');
    check('reversing an edited guide is recorded but does not republish',
      rev3.json?.changed === true && rev3.json?.reinstated === false && vis(P_PUB3) === 'private|null'
        && stmt(P_PUB3).complaint_status === 'reversed' && stmt(P_PUB3).reinstated === false, vis(P_PUB3));

    // The owner chose friends after the takedown.
    asRole('author', `update public.trip_plans set visibility = 'friends' where id = '${P_PUB4}'`);
    const rev4 = decide('admin', id4, 'reversed');
    check('reversing a guide the owner moved to friends leaves it on friends',
      rev4.json?.reinstated === false && vis(P_PUB4) === 'friends|null', vis(P_PUB4));

    const up = decide('admin', idOth, 'upheld', 'The link points at a pirated copy; the decision stands.');
    check('upholding answers upheld and leaves the guide private',
      up.json?.outcome === 'upheld' && up.json?.reinstated === false && vis(P_OTH) === 'private|null');
    const othView = asRole('other', `select complaint_status || '|' || complaint_note from public.moderation_statements`);
    check('the owner reads the outcome and the reason',
      othView.out.trim() === 'upheld|The link points at a pirated copy; the decision stands.', othView.out.trim());

    /* ---- 7. the dismissed path ---------------------------------------- */
    console.log('');
    console.log('  Dismissing a report:');
    const repId = count(`select id from public.content_reports where plan_id = '${P_PUB2}'`);
    const actionedId = count(`select min(id) from public.content_reports where plan_id = '${P_PUB}'`);
    check('a plain user is forbidden', dismiss('plain', repId).json?.error === 'forbidden');
    check('a blank reason is bad_reason', dismiss('admin', repId, ' ').json?.error === 'bad_reason');
    check('a missing report is not_found', dismiss('admin', 999999).json?.error === 'not_found');
    check('none of those changed the report',
      scalar(bin, TEST_DB, `select status || '|' || coalesce(decided_at::text, 'null') from public.content_reports where id = ${repId}`) === 'new|null');
    s0 = stmtN();
    audit0 = auditN();
    const fp2 = vis(P_PUB2);
    const dis = dismiss('admin', repId);
    check('dismiss answers changed, dismissed', dis.json?.changed === true && dis.json?.status === 'dismissed', dis.out.trim() || dis.err.trim());
    const dr = JSON.parse(scalar(bin, TEST_DB, `select row_to_json(r) from public.content_reports r where id = ${repId}`));
    check('the report is dismissed with decided_by, decided_at and the reason',
      dr.status === 'dismissed' && dr.decided_by === ADMIN && dr.decided_at && dr.decision_note.startsWith('Not illegal'));
    const da = lastAudit();
    check('one dismiss_report audit row, owner as target, previous and new',
      auditN() === audit0 + 1 && da.action === 'dismiss_report' && da.target_user === AUTHOR
        && da.detail?.previous?.status === 'new' && da.detail?.new?.status === 'dismissed'
        && Number(da.detail?.reportId) === repId, JSON.stringify(da));
    check('the guide is untouched and no statement was written', vis(P_PUB2) === fp2 && stmtN() === s0);
    audit0 = auditN();
    const dis2 = dismiss('admin', repId);
    check('a second dismiss changes nothing', dis2.json?.changed === false && dis2.json?.status === 'dismissed' && auditN() === audit0);
    const dis3 = dismiss('admin', actionedId);
    check('an actioned report cannot be dismissed over',
      dis3.json?.changed === false && dis3.json?.status === 'actioned' && auditN() === audit0);
    const lr = rpc('admin', `public.admin_list_content_reports(null, 50, 0)`);
    const lrow = (lr.json?.rows || []).find((r) => Number(r.id) === repId) || {};
    check('the Reports list shows who decided, when and why',
      lrow.status === 'dismissed' && lrow.decidedByHandle === 'carta_mod' && lrow.decidedAt && lrow.decisionNote?.startsWith('Not illegal'),
      JSON.stringify(lrow).slice(0, 200));

    /* ---- 8. the co-planner guard -------------------------------------- */
    console.log('');
    console.log('  The co-planner guard, after 039:');
    const cp1 = asRole('copl', `update public.trip_plans set visibility = 'private' where id = '${P_PUB2}' returning visibility`);
    check('a co-planner cannot make a public plan private', cp1.ok && cp1.out.trim() === 'public', cp1.out.trim() || cp1.err.trim());
    const cp2 = asRole('copl', `update public.trip_plans set visibility = 'public', user_id = '${COPL}' where id = '${P_PUB3}'
        returning visibility || '|' || user_id`);
    check('a co-planner cannot republish a taken-down plan or take it over',
      cp2.ok && cp2.out.trim() === `private|${AUTHOR}`, cp2.out.trim() || cp2.err.trim());

    /* ---- 9. the re-paste trap ----------------------------------------- */
    console.log('');
    console.log('  038 pasted after 039:');
    apply('038_admin_unpublish_guide.sql');
    audit0 = auditN();
    const trapped = decide('admin', id5, 'reversed');
    check('reversing then fails loudly instead of answering ok',
      !trapped.ok && /did not come back/.test(trapped.err), trapped.out.trim() || trapped.err.trim().split('\n')[0]);
    check('and the guide, the complaint and the audit log are as before',
      vis(P_PUB5) === 'private|null' && stmt(P_PUB5).complaint_status === 'open' && auditN() === audit0);
    const again39 = apply('039_statement_of_reasons.sql');
    check('039 pasted again passes its self-check', /statement of reasons self-check passed/.test(again39.err + again39.out));
    const fixed = decide('admin', id5, 'reversed');
    check('the reversal then works', fixed.json?.reinstated === true && vis(P_PUB5).startsWith('public|'), fixed.out.trim() || fixed.err.trim());
    check('still one function by each name',
      scalar(bin, TEST_DB, `select count(*) from pg_proc where proname in ('admin_unpublish_guide',
        'admin_dismiss_content_report', 'contest_moderation_decision', 'admin_decide_complaint',
        'admin_list_moderation_complaints', 'moderation_guide_fingerprint')`) === '6');

    /* ---- 10. nothing deleted ------------------------------------------ */
    console.log('');
    check('nothing was deleted: plans, stops, day plan, reports and statements all still there',
      plansN() === plans0 && count('select count(*) from public.trip_plan_stops') === stops0
        && count('select count(*) from public.day_plans') === 1
        && count('select count(*) from public.content_reports') === 4 && stmtN() === 5);
    measured.after = true;
  } finally {
    if (work) { try { rmSync(work, { recursive: true, force: true }); } catch { /* temp dir */ } }
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
  }
  return measured;
}
console.log('Statement of reasons, complaints and dismissals (migration 039)');
console.log('----------------------------------------------------------------');

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
  console.log('  SKIPPED. No database was reached, so NOTHING about the statements');
  console.log('  was tested. This run proves nothing.');
  console.log(`  Reason: ${skipReason}`);
  console.log('');
  console.log('  To run it, point the script at a PostgreSQL server you can write to');
  console.log('  without a password prompt, for example a throwaway trust-auth cluster:');
  console.log('    initdb -D <dir> -U postgres --auth=trust');
  console.log('    pg_ctl -D <dir> -o "-p 55434" start');
  console.log('    PGPORT=55434 node continent-app/scripts/admin/test_statement_of_reasons.mjs');
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
  console.log(`  statements per takedown: before 039 ${measured.statementsBefore}, after ${measured.statementsAfter}`);
  console.log(`  owner can file a complaint: before 039 ${measured.complaintBefore ? 'yes' : 'no'}, after ${measured.complaintAfter ? 'yes' : 'no'}`);
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
console.log('All statement of reasons tests passed.');
