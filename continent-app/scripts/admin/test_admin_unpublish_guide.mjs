/**
 * Tests for migration 038: admin_unpublish_guide(plan_id, reason), the
 * takedown that unpublishes a guide and never deletes it.
 *
 *   PGPORT=55434 node continent-app/scripts/admin/test_admin_unpublish_guide.mjs
 *
 * WHAT IT PROVES, in order:
 *
 *   0. The chain applies: 002, 004, 006, 007, 009, 010, 011, 014 to 018,
 *      019, 020, 023, 032 to 037, then 038 with its self-check notice. 020
 *      and 023 are in the chain on purpose: 020's co-planner trigger is the
 *      thing most likely to make a takedown silently do nothing.
 *   1. BEFORE 038: the RPC does not exist, and a plain admin-side UPDATE
 *      made with an admin's session is pinned back by 020's trigger, so the
 *      guide stays public. That is the failure 038 has to get past.
 *   2. Guards: anon cannot execute it; a plain user gets forbidden; a
 *      missing, blank or over-long reason is bad_reason; an unknown or null
 *      id is not_found; none of them changes a row or writes an audit row.
 *   3. The takedown: the guide goes private, published_at is cleared, and
 *      every other column of the plan is identical (label, owner, created_at,
 *      updated_at), its stops and day plan are byte for byte the same, the
 *      number of rows in trip_plans is unchanged, and the audit log grows by
 *      exactly one row in the 033 shape with the reason, previous and new.
 *   4. The owner still has it: through the owner's own RLS path (role
 *      authenticated, their own claims) the plan and its stops are readable
 *      and editable, and the plan still belongs to them. The public gallery
 *      and get_public_guide no longer return it.
 *   5. Reports: the new reports on that guide move to actioned, their ids
 *      are in the audit row, and reports on another guide stay new.
 *   6. Idempotence: a second call answers ok with changed false, writes no
 *      audit row and changes nothing; so does a call on a plan that was
 *      private all along, and on a link-shared plan, which stays link.
 *   7. The co-planner trigger still does its job: a co-planner cannot make
 *      the owner's plan private, public or theirs.
 *   8. The test catches the trap: a copy of the function without the marker
 *      raises and leaves the guide public, rather than answering ok.
 *   9. Pasting 038 twice is safe.
 *
 * HOW. The harness of test_content_reports.mjs (T068), sliced from that
 * file, with its stubs unchanged. Client calls run as `set role anon` or
 * `set role authenticated` with request.jwt.claims set, the way PostgREST
 * does. Superuser inserts stand in for rows the app writes.
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
 * It creates and drops a database named carta_t069_test. It never touches
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
const TEST_DB = process.env.CARTA_TEST_DB || 'carta_t069_test';

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
const PLAIN = '00000000-0000-0000-0000-00000000c001'; // a signed-in non-admin
const AUTHOR = '00000000-0000-0000-0000-0000000000a1'; // owns the guides
const COPL = '00000000-0000-0000-0000-0000000000b1'; // co-plans the reported guide

const P_PUB = '10000000-0000-0000-0000-000000000001'; // public, the one taken down
const P_PUB2 = '10000000-0000-0000-0000-000000000002'; // public, left alone
const P_PRIV = '10000000-0000-0000-0000-000000000003';
const P_LINK = '10000000-0000-0000-0000-000000000004';
const P_NONE = '10000000-0000-0000-0000-0000000000ff'; // no such plan

const REASON = 'Copies a copyrighted book chapter word for word, see report.';

async function runTests(bin) {
  let work = null;
  const measured = {};
  try {
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
    psql(bin, 'postgres', ['-c', `create database ${TEST_DB}`]);

    work = mkdtempSync(join(tmpdir(), 'carta-t069-'));
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
      const why = (raw018.err.match(/ERROR:.*$/m) || [raw018.err.trim()])[0];
      console.log(`  note  018 as committed fails here: ${why}`);
      const src = readFileSync(m018, 'utf8');
      check('018 carries the {5,600} bound the failure points at', src.includes('{5,600}'));
      const patched = join(work, '018_content_overrides.patched.sql');
      writeFileSync(patched, src.replace('{5,600}', '{5,255}'), 'utf8');
      console.log('  note  applying a copy with {5,255} from a temp dir, for this test only');
      applyFile('018_content_overrides.sql (patched copy, {5,255})', patched);
    }
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

    /* ---- seed --------------------------------------------------------- */
    const users = [[ADMIN, 'owner@example.test'], [PLAIN, 'plain@example.test'],
      [AUTHOR, 'author@example.test'], [COPL, 'copl@example.test']];
    for (const [id, email] of users) {
      psql(bin, TEST_DB, ['-c', `insert into auth.users (id, email) values ('${id}', '${email}')`]);
    }
    psql(bin, TEST_DB, ['-c', `insert into public.admin_users (user_id, note) values ('${ADMIN}', 'owner')`]);
    psql(bin, TEST_DB, ['-c', `update public.profiles set handle = 'anna_travels', display_name = 'Anna'
      where user_id = '${AUTHOR}'`]);
    const plans = [
      [P_PUB, 'Four nights in Ghent', 'public'],
      [P_PUB2, 'Lisbon to Faro by train', 'public'],
      [P_PRIV, 'Private draft', 'private'],
      [P_LINK, 'Shared by link', 'link'],
    ];
    for (const [id, label, vis] of plans) {
      psql(bin, TEST_DB, ['-c', `insert into public.trip_plans (id, user_id, label, created_at, updated_at)
          values ('${id}', '${AUTHOR}', '${label}', now() - interval '30 days', now() - interval '20 days')`,
        '-c', `update public.trip_plans set visibility = '${vis}' where id = '${id}'`]);
    }
    for (const [plan, pos, city] of [[P_PUB, 0, 'Ghent'], [P_PUB, 1, 'Bruges'], [P_PUB2, 0, 'Lisbon']]) {
      psql(bin, TEST_DB, ['-c', `insert into public.trip_plan_stops
          (trip_plan_id, user_id, position, destination_id, city, country, arrive_date, depart_date, choices)
          values ('${plan}', '${AUTHOR}', ${pos}, '${city.toLowerCase()}', '${city}', 'BE',
                  date '2026-10-01' + ${pos * 2}, date '2026-10-03' + ${pos * 2}, '{"stay":"hostel"}')`]);
    }
    psql(bin, TEST_DB, ['-c', `insert into public.day_plans (user_id, plan_id, payload)
        values ('${AUTHOR}', '${P_PUB}', '{"days":[{"note":"private note, expenses 42.50"}]}')`]);
    psql(bin, TEST_DB, ['-c', `insert into public.trip_collaborators (trip_plan_id, user_id, invited_by, status)
        values ('${P_PUB}', '${COPL}', '${AUTHOR}', 'accepted'), ('${P_PUB2}', '${COPL}', '${AUTHOR}', 'accepted')`]);
    check('the seed has two public plans, one private, one link',
      scalar(bin, TEST_DB, `select string_agg(visibility, ',' order by id) from public.trip_plans`) === 'public,public,private,link');
    const pubStamp = scalar(bin, TEST_DB, `select published_at from public.trip_plans where id = '${P_PUB}'`);
    check('the public guide carries a published_at stamp', pubStamp !== '');

    const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
    const AS = {
      admin: { role: 'authenticated', claims: { sub: ADMIN, role: 'authenticated', aal: 'aal1' } },
      plain: { role: 'authenticated', claims: { sub: PLAIN, role: 'authenticated', aal: 'aal1' } },
      author: { role: 'authenticated', claims: { sub: AUTHOR, role: 'authenticated', aal: 'aal1' } },
      copl: { role: 'authenticated', claims: { sub: COPL, role: 'authenticated', aal: 'aal1' } },
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
    const unpublish = (who, plan, reason = REASON) => parse(asRole(who,
      `select public.admin_unpublish_guide(${plan ? `${q(plan)}::uuid` : 'null'}, ${reason === null ? 'null' : q(reason)})`));
    const count = (sql) => Number(scalar(bin, TEST_DB, sql));
    const plansN = () => count('select count(*) from public.trip_plans');
    const auditN = () => count('select count(*) from public.admin_audit_log');
    // Every column of the plan except the two a takedown may move, and the
    // stops and day plan in full, as one fingerprint.
    const fingerprint = (plan) => scalar(bin, TEST_DB, `select md5(
        (select (to_jsonb(tp) - 'visibility' - 'published_at')::text from public.trip_plans tp where tp.id = '${plan}')
        || coalesce((select jsonb_agg(to_jsonb(s) order by s.position)::text
                       from public.trip_plan_stops s where s.trip_plan_id = '${plan}'), '')
        || coalesce((select to_jsonb(d)::text from public.day_plans d where d.plan_id = '${plan}'), ''))`);
    const vis = (plan) => scalar(bin, TEST_DB, `select visibility || '|' || coalesce(published_at::text, 'null')
        from public.trip_plans where id = '${plan}'`);

    // Three reports: two on the guide that will come down, one on another.
    const REP = 'This guide reproduces a copyrighted text without permission.';
    for (const [plan, ip] of [[P_PUB, '203.0.113.1'], [P_PUB, '203.0.113.2'], [P_PUB2, '203.0.113.3']]) {
      const r = psqlRun(bin, TEST_DB, ['-At',
        '-c', `set request.headers = ${q(JSON.stringify({ 'cf-connecting-ip': ip }))}`,
        '-c', 'set role anon',
        '-c', `select public.report_guide('${plan}', ${q(REP)}, null)`]);
      check(`a report on ${plan === P_PUB ? 'the guide' : 'the other guide'} is filed`, /"ok": true/.test(r.out), r.err.trim());
    }

    /* ---- 1. before 038 ------------------------------------------------ */
    console.log('');
    console.log('  Before 038:');
    check('admin_unpublish_guide does not exist yet',
      scalar(bin, TEST_DB, `select to_regprocedure('public.admin_unpublish_guide(uuid, text)') is null`) === 't');
    const pre = unpublish('admin', P_PUB);
    check('an admin calling it gets "function does not exist"', !pre.ok && /does not exist/.test(pre.err),
      pre.err.trim().split('\n')[0]);
    // What a naive takedown would do: an UPDATE run with an admin's session,
    // as a definer function would run it (superuser table rights, the
    // admin's auth.uid()). 020's guard pins visibility back.
    const naive = psqlRun(bin, TEST_DB, ['-At',
      '-c', `set request.jwt.claims = ${q(JSON.stringify(AS.admin.claims))}`,
      '-c', `update public.trip_plans set visibility = 'private' where id = '${P_PUB}' returning visibility`]);
    check('a plain UPDATE under an admin session is pinned back to public by 020\'s trigger',
      naive.ok && naive.out.trim() === 'public', naive.out.trim() || naive.err.trim());
    measured.naive = vis(P_PUB).split('|')[0];

    /* ---- 2. after 038, guards ----------------------------------------- */
    console.log('');
    const m38 = apply('038_admin_unpublish_guide.sql');
    check('038 self-check ran and passed', /admin unpublish guide self-check passed/.test(m38.err + m38.out));

    console.log('');
    console.log('  Guards:');
    const fp0 = fingerprint(P_PUB);
    const plans0 = plansN();
    let audit0 = auditN();
    const anonR = unpublish('anon', P_PUB);
    check('anon cannot execute it', !anonR.ok && /permission denied/.test(anonR.err), anonR.err.trim().split('\n')[0]);
    const plainR = unpublish('plain', P_PUB);
    check('a plain user gets forbidden', plainR.json?.error === 'forbidden', plainR.out.trim());
    for (const [label, reason] of [['a null reason', null], ['an empty reason', ''], ['a blank reason', '   \n  '],
      ['a reason over 2000 characters', 'x'.repeat(2001)]]) {
      const r = unpublish('admin', P_PUB, reason);
      check(`${label} is bad_reason`, r.json?.error === 'bad_reason', r.out.trim() || r.err.trim());
    }
    const noneR = unpublish('admin', P_NONE);
    check('an unknown plan id is not_found', noneR.json?.error === 'not_found', noneR.out.trim());
    const nullR = unpublish('admin', null);
    check('a null plan id is not_found', nullR.json?.error === 'not_found', nullR.out.trim());
    check('none of those changed the guide', vis(P_PUB).startsWith('public|') && fingerprint(P_PUB) === fp0);
    check('none of those wrote an audit row', auditN() === audit0, `${audit0} -> ${auditN()}`);

    /* ---- 3. the takedown ---------------------------------------------- */
    console.log('');
    console.log('  The takedown:');
    const newBefore = count(`select count(*) from public.content_reports where plan_id = '${P_PUB}' and status = 'new'`);
    const other0 = fingerprint(P_PUB2) + vis(P_PUB2);
    audit0 = auditN();
    const down = unpublish('admin', P_PUB);
    check('it answers ok, changed, private, with the reports it actioned',
      down.json?.ok === true && down.json?.changed === true && down.json?.visibility === 'private'
        && down.json?.reportsActioned === newBefore, down.out.trim() || down.err.trim());
    check('the guide is private and published_at is cleared', vis(P_PUB) === 'private|null', vis(P_PUB));
    check('the row still exists', count(`select count(*) from public.trip_plans where id = '${P_PUB}'`) === 1);
    check('it still belongs to the owner',
      scalar(bin, TEST_DB, `select user_id from public.trip_plans where id = '${P_PUB}'`) === AUTHOR);
    check('every other column, the stops and the day plan are unchanged', fingerprint(P_PUB) === fp0);
    check('the stops are all still there', count(`select count(*) from public.trip_plan_stops where trip_plan_id = '${P_PUB}'`) === 2);
    check('the number of rows in trip_plans is unchanged', plansN() === plans0, `${plans0} -> ${plansN()}`);
    check('the other public guide is untouched', fingerprint(P_PUB2) + vis(P_PUB2) === other0);
    const auditAfter = auditN();
    check('the audit log grew by exactly one row', auditAfter === audit0 + 1, `${audit0} -> ${auditAfter}`);
    measured.plans = [plans0, plansN()];
    measured.audit = [audit0, auditAfter];
    const a = JSON.parse(scalar(bin, TEST_DB, `select row_to_json(l) from public.admin_audit_log l order by id desc limit 1`));
    const d = a.detail || {};
    check('the audit row is unpublish_guide by the admin, targeting the owner',
      a.action === 'unpublish_guide' && a.actor === ADMIN && a.target_user === AUTHOR, JSON.stringify(a));
    check('its detail names the table, the plan, the title and the reason as given (trimmed)',
      d.table === 'trip_plans' && d.planId === P_PUB && d.label === 'Four nights in Ghent' && d.reason === REASON);
    check('previous holds public and the original published_at',
      d.previous?.visibility === 'public' && d.previous?.publishedAt && d.previous.publishedAt !== null);
    check('the previous published_at is the stamp the guide had',
      scalar(bin, TEST_DB, `select ('${d.previous?.publishedAt}'::timestamptz = '${pubStamp}'::timestamptz)::text`) === 'true');
    check('new holds private and no published_at', d.new?.visibility === 'private' && d.new?.publishedAt === null);

    /* ---- 4. the owner still has it ------------------------------------ */
    console.log('');
    console.log('  The owner, through their own RLS path:');
    const own = asRole('author', `select id || '|' || user_id || '|' || visibility || '|' || label
        from public.trip_plans where id = '${P_PUB}'`);
    check('the owner reads the plan', own.ok && own.out.trim() === `${P_PUB}|${AUTHOR}|private|Four nights in Ghent`,
      own.out.trim() || own.err.trim());
    const ownStops = asRole('author', `select count(*) from public.trip_plan_stops where trip_plan_id = '${P_PUB}'`);
    check('the owner reads both stops', ownStops.ok && ownStops.out.trim() === '2', ownStops.out.trim());
    const ownDay = asRole('author', `select count(*) from public.day_plans where plan_id = '${P_PUB}'`);
    check('the owner reads the day plan', ownDay.ok && ownDay.out.trim() === '1', ownDay.out.trim() || ownDay.err.trim());
    const ownEdit = asRole('author', `update public.trip_plans set label = 'Four nights in Ghent' where id = '${P_PUB}' returning id`);
    check('the owner can still edit it', ownEdit.ok && ownEdit.out.trim() === P_PUB, ownEdit.out.trim() || ownEdit.err.trim());
    const other = asRole('plain', `select count(*) from public.trip_plans where id = '${P_PUB}'`);
    check('another signed-in user cannot read it', other.ok && other.out.trim() === '0', other.out.trim());
    const gallery = asRole('anon', `select count(*) from public.list_public_guides(null, 60, 0) where trip_plan_id = '${P_PUB}'`);
    check('the public gallery no longer lists it', gallery.ok && gallery.out.trim() === '0', gallery.out.trim() || gallery.err.trim());
    const gal2 = asRole('anon', `select count(*) from public.list_public_guides(null, 60, 0) where trip_plan_id = '${P_PUB2}'`);
    check('the other guide is still in the gallery', gal2.ok && gal2.out.trim() === '1', gal2.out.trim());
    const direct = asRole('anon', `select count(*) from public.get_public_guide('${P_PUB}')`);
    check('get_public_guide returns nothing for it', direct.ok && direct.out.trim() === '0', direct.out.trim() || direct.err.trim());
    const again = asRole('anon', `select public.report_guide('${P_PUB}', ${q(REP)}, null)`);
    check('it can no longer be reported (not_public)', /not_public/.test(again.out), again.out.trim() || again.err.trim());

    /* ---- 5. reports --------------------------------------------------- */
    console.log('');
    console.log('  The linked reports:');
    const repState = scalar(bin, TEST_DB, `select string_agg(status, ',' order by id) from public.content_reports where plan_id = '${P_PUB}'`);
    check('both reports on the guide are actioned', repState === 'actioned,actioned', repState);
    const repIds = scalar(bin, TEST_DB, `select jsonb_agg(id order by id)::text from public.content_reports where plan_id = '${P_PUB}'`);
    check('their ids are in the audit row', JSON.stringify(d.reports) === JSON.stringify(JSON.parse(repIds)), `${JSON.stringify(d.reports)} vs ${repIds}`);
    check('the report on the other guide is still new',
      scalar(bin, TEST_DB, `select status from public.content_reports where plan_id = '${P_PUB2}'`) === 'new');
    const listed = parse(asRole('admin', `select public.admin_list_content_reports('actioned', 50, 0)`));
    check('the Reports list shows them as actioned and no longer public',
      listed.json?.total === 2 && (listed.json?.rows || []).every((r) => r.status === 'actioned' && r.stillPublic === false),
      listed.out.trim().slice(0, 200));

    /* ---- 6. idempotence ----------------------------------------------- */
    console.log('');
    console.log('  Idempotence:');
    const fp1 = fingerprint(P_PUB) + vis(P_PUB);
    audit0 = auditN();
    const twice = unpublish('admin', P_PUB);
    check('a second call answers ok, changed false, private, 0 reports',
      twice.json?.ok === true && twice.json?.changed === false && twice.json?.visibility === 'private'
        && twice.json?.reportsActioned === 0, twice.out.trim());
    check('it changed nothing and wrote no audit row', fingerprint(P_PUB) + vis(P_PUB) === fp1 && auditN() === audit0);
    const privR = unpublish('admin', P_PRIV);
    check('a plan private all along answers changed false', privR.json?.changed === false && privR.json?.visibility === 'private', privR.out.trim());
    const linkR = unpublish('admin', P_LINK);
    check('a link-shared plan answers changed false and stays link',
      linkR.json?.changed === false && linkR.json?.visibility === 'link' && vis(P_LINK) === 'link|null', linkR.out.trim());
    check('none of those wrote an audit row', auditN() === audit0);

    /* ---- 7. the co-planner guard still holds --------------------------- */
    console.log('');
    console.log('  The co-planner guard, after 038:');
    const cp1 = asRole('copl', `update public.trip_plans set visibility = 'private' where id = '${P_PUB2}' returning visibility`);
    check('a non-owner cannot make a public plan private (it reads back public)',
      cp1.ok && cp1.out.trim() === 'public' && vis(P_PUB2).startsWith('public|'),
      cp1.out.trim() || cp1.err.trim());
    const cp2 = asRole('copl', `update public.trip_plans set visibility = 'public', user_id = '${COPL}' where id = '${P_PUB}' returning visibility || '|' || user_id`);
    check('a co-planner cannot republish the owner\'s plan or take it over',
      cp2.ok && cp2.out.trim() === `private|${AUTHOR}`, cp2.out.trim() || cp2.err.trim());

    /* ---- 8. the test catches the trap --------------------------------- */
    console.log('');
    console.log('  Without the takedown marker:');
    const src38 = readFileSync(resolve(migrations, '038_admin_unpublish_guide.sql'), 'utf8');
    const fnStart = src38.indexOf('create or replace function public.admin_unpublish_guide(');
    const fnEnd = src38.indexOf('$$;', fnStart) + 3;
    const noMarker = src38.slice(fnStart, fnEnd)
      .replace("perform set_config('carta.takedown_plan', p_plan_id::text, true);", '-- marker removed');
    check('the copy really removed the marker', !noMarker.includes("p_plan_id::text, true"));
    const noMarkerFile = join(work, 'unpublish_no_marker.sql');
    writeFileSync(noMarkerFile, noMarker, 'utf8');
    psql(bin, TEST_DB, ['-f', noMarkerFile]);
    const fp2 = fingerprint(P_PUB2) + vis(P_PUB2);
    audit0 = auditN();
    const trapped = unpublish('admin', P_PUB2);
    check('without the marker the call fails loudly instead of answering ok',
      !trapped.ok && /still public after the update/.test(trapped.err), trapped.out.trim() || trapped.err.trim().split('\n')[0]);
    check('and the guide, its reports and the audit log are exactly as before',
      fingerprint(P_PUB2) + vis(P_PUB2) === fp2 && auditN() === audit0
        && scalar(bin, TEST_DB, `select status from public.content_reports where plan_id = '${P_PUB2}'`) === 'new');

    /* ---- 9. paste twice ----------------------------------------------- */
    console.log('');
    console.log('  Pasting 038 again:');
    const again38 = apply('038_admin_unpublish_guide.sql');
    check('038 pasted again passes its self-check', /admin unpublish guide self-check passed/.test(again38.err + again38.out));
    const second = unpublish('admin', P_PUB2);
    check('the restored function takes the second guide down', second.json?.changed === true && vis(P_PUB2) === 'private|null',
      second.out.trim() || second.err.trim());
    check('its report is actioned, and nothing was deleted anywhere',
      scalar(bin, TEST_DB, `select status from public.content_reports where plan_id = '${P_PUB2}'`) === 'actioned'
        && plansN() === plans0 && count('select count(*) from public.trip_plan_stops') === 3
        && count('select count(*) from public.day_plans') === 1);
    check('still one function by that name',
      scalar(bin, TEST_DB, `select count(*) from pg_proc where proname = 'admin_unpublish_guide'`) === '1');

    /* ---- what 038 does not stop, recorded as a fact ------------------- */
    console.log('');
    console.log('  Not prevented by 038 (register row, not a failure):');
    const repub = asRole('author', `update public.trip_plans set visibility = 'public' where id = '${P_PUB}' returning visibility`);
    measured.republish = repub.ok && repub.out.trim() === 'public';
    console.log(`  note  the owner can publish the taken-down guide again: ${measured.republish ? 'yes' : 'no'}`);
    measured.after = true;
  } finally {
    if (work) { try { rmSync(work, { recursive: true, force: true }); } catch { /* temp dir */ } }
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
  }
  return measured;
}
console.log('admin_unpublish_guide takes a guide down without deleting it (migration 038)');
console.log('-----------------------------------------------------------------------------');

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
  console.log('  SKIPPED. No database was reached, so NOTHING about the takedown');
  console.log('  was tested. This run proves nothing.');
  console.log(`  Reason: ${skipReason}`);
  console.log('');
  console.log('  To run it, point the script at a PostgreSQL server you can write to');
  console.log('  without a password prompt, for example a throwaway trust-auth cluster:');
  console.log('    initdb -D <dir> -U postgres --auth=trust');
  console.log('    pg_ctl -D <dir> -o "-p 55434" start');
  console.log('    PGPORT=55434 node continent-app/scripts/admin/test_admin_unpublish_guide.mjs');
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
  console.log(`  before 038, a plain UPDATE under an admin session left the guide: ${measured.naive}`);
  console.log(`  rows in trip_plans across the takedown: ${measured.plans[0]} -> ${measured.plans[1]}`);
  console.log(`  rows in admin_audit_log across the takedown: ${measured.audit[0]} -> ${measured.audit[1]}`);
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
console.log('All takedown tests passed.');
