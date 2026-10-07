/**
 * The owner's moderation and admin decisions hold in the database (migration
 * 051, T365, register row T362-d).
 *
 *   PGPORT=55448 CARTA_MIGRATIONS=<root>/supabase/migrations \
 *     node continent-app/scripts/admin/test_moderation_decisions.mjs
 *
 * WHAT IS ASSERTED, one block per decision of 2026-10-07:
 *
 *   T065-b  admin_guard's live tier: 20 config, override or feedback saves
 *           in a minute refuse the 21st with slow_down, ten bans do not
 *           block a config save, and twenty config saves do not block a
 *           pass change.
 *   T063-e  admin_set_tier refuses an aal1 session with mfa_required, writes
 *           one mfa_refused row and leaves the pass alone; aal2 goes through.
 *   T074-c  an overdue temporary override stops reaching travellers 14 days
 *           after its review date; verified and stale ones keep applying;
 *           the admin list still shows every row.
 *   T067-d  a plan cannot be made public from an account without a profile,
 *           and pasting 051 repairs the missing profile.
 *   T069-c  a taken-down guide stays locked while its statement stands
 *           (not contested, contested, upheld) and opens again on reversed.
 *   T069-d  the takedown revokes the plan's live share links, and only them.
 *   T070-c  the takedown asks for a ground and stores it on the statement,
 *           which its owner can read.
 *   T068-d  the notice form refuses without the good-faith tick, checks the
 *           optional name, and stores both.
 *   T068-g, T070-g  the email is cleared on decision; decided reports go
 *           after 12 months, statements after 3 years, open work stays.
 *   T217-d  deleting an account keeps its pass_grants rows with user_id null.
 *   export  export_user_data carries the new fields in the caller's rows.
 *
 * Every migration in the directory is applied in numeric order (no list to
 * keep), with the same Supabase stubs as test_rls_policies.mjs. With no
 * server reachable the script SKIPS LOUDLY, exits 0, and never prints that
 * anything passed. It creates and drops a database named carta_t365_test and
 * never touches the live Supabase project.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { existsSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.CARTA_REPO_ROOT || resolve(here, '../../..');
const migrations = process.env.CARTA_MIGRATIONS || resolve(repoRoot, 'supabase/migrations');

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
const TEST_DB = 'carta_t365_test';

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
  return { ok: r.status === 0 && !r.error, out: String(r.stdout || ''), err: String(r.stderr || (r.error ? r.error.message : '')) };
}

function psql(bin, db, args) {
  const r = psqlRun(bin, db, args);
  if (!r.ok) throw new Error(r.err.trim());
  return r;
}

const firstError = (err) => (err.match(/ERROR:.*$/m) || [err.trim().split('\n')[0]])[0];

// The same stubs as test_rls_policies.mjs: what Supabase provides and a bare
// Postgres does not, plus the default grants the live project gives every
// new table, sequence and function in public.
const STUBS = `
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key, email text, created_at timestamptz not null default now(),
  last_sign_in_at timestamptz, email_confirmed_at timestamptz, banned_until timestamptz,
  raw_app_meta_data jsonb default '{}'::jsonb, raw_user_meta_data jsonb default '{}'::jsonb
);
create table if not exists auth.refresh_tokens (id bigserial primary key, user_id varchar(255), revoked boolean default false);
create or replace function auth.jwt() returns jsonb language sql stable as $fn$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                  nullif(current_setting('request.jwt.claims', true), ''))::jsonb $fn$;
create or replace function auth.uid() returns uuid language sql stable as $fn$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $fn$;
do $do$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
end $do$;
grant usage on schema auth to authenticated, anon, service_role;
grant usage on schema public to authenticated, anon, service_role;
alter default privileges in schema public grant all on tables to authenticated, anon, service_role;
alter default privileges in schema public grant all on sequences to authenticated, anon, service_role;
alter default privileges in schema public grant execute on functions to authenticated, anon, service_role;
`;

const ADMIN = '00000000-0000-0000-0000-0000000365a1';
const OWNER = '00000000-0000-0000-0000-0000000365b1';
const READER = '00000000-0000-0000-0000-0000000365c1';
const BUYER = '00000000-0000-0000-0000-0000000365d1';
const NOPROF = '00000000-0000-0000-0000-0000000365e1';
const P1 = '00000000-0000-0000-0000-00000365f001'; // upheld: stays locked
const P2 = '00000000-0000-0000-0000-00000365f002'; // reversed unchanged: reinstated
const P3 = '00000000-0000-0000-0000-00000365f003'; // reversed after an edit: owner may publish
const P4 = '00000000-0000-0000-0000-00000365f004'; // the plan of an account without a profile
const OTHER = '00000000-0000-0000-0000-00000365f005'; // another guide whose links must survive

function runTests(bin) {
  let work = null;
  try {
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
    psql(bin, 'postgres', ['-c', `create database ${TEST_DB}`]);
    work = mkdtempSync(join(tmpdir(), 'carta-t365-'));
    const stubFile = join(work, 'stubs.sql');
    writeFileSync(stubFile, STUBS, 'utf8');
    psql(bin, TEST_DB, ['-f', stubFile]);

    const files = readdirSync(migrations)
      .filter((f) => /^\d{3}_.*\.sql$/.test(f))
      .sort((a, b) => Number(a.slice(0, 3)) - Number(b.slice(0, 3)));
    check('the migrations directory holds 051', files.some((f) => f.startsWith('051_')), migrations);
    let notice051 = false;
    for (const name of files) {
      const r = psqlRun(bin, TEST_DB, ['-f', resolve(migrations, name)]);
      if (!r.ok) throw new Error(`${name} failed: ${firstError(r.err)}`);
      if (name.startsWith('051_')) notice051 = /moderation and admin decisions self-check passed/.test(r.err);
    }
    check(`applied ${files.length} migrations in numeric order`, true);
    check('051 self-check printed its notice', notice051);

    // ---- helpers --------------------------------------------------------
    const db = (sql) => psql(bin, TEST_DB, ['-At', '-c', sql]).out.trim();
    const as = (who, sql, aal = 'aal1') => {
      const role = who ? 'authenticated' : 'anon';
      const claims = who ? { sub: who, role, ...(aal ? { aal } : {}) } : { role: 'anon' };
      const pre = `set role ${role}; set request.jwt.claims = '${JSON.stringify(claims)}';`;
      return psqlRun(bin, TEST_DB, ['-At', '-c', `${pre} ${sql}`]);
    };
    const rpc = (who, sql, aal) => {
      const r = as(who, `select (${sql})::text`, aal);
      if (!r.ok) return { raise: r.err };
      return JSON.parse(r.out.trim().split('\n').pop());
    };
    const hint = (r) => ((r.err || '').match(/HINT:\s+(\S+)/) || [])[1] || '';

    // ---- seed -----------------------------------------------------------
    for (const [id, email] of [[ADMIN, 'admin@t365.test'], [OWNER, 'owner@t365.test'],
      [READER, 'reader@t365.test'], [BUYER, 'buyer@t365.test'], [NOPROF, 'noprof@t365.test']]) {
      db(`insert into auth.users (id, email) values ('${id}', '${email}')`);
    }
    db(`insert into public.admin_users (user_id) values ('${ADMIN}')`);
    db(`insert into public.trip_plans (id, user_id, label, visibility) values
        ('${P1}', '${OWNER}', 'Guide one', 'public'), ('${P2}', '${OWNER}', 'Guide two', 'public'),
        ('${P3}', '${OWNER}', 'Guide three', 'public'), ('${OTHER}', '${OWNER}', 'Other guide', 'public')`);
    db(`insert into public.trip_shares (trip_plan_id, owner_id) values
        ('${P1}', '${OWNER}'), ('${P1}', '${OWNER}'), ('${OTHER}', '${OWNER}')`);
    db(`insert into public.trip_shares (trip_plan_id, owner_id, revoked_at) values
        ('${P1}', '${OWNER}', '2026-01-01T00:00:00Z')`);

    // ---- T065-b: the live tier ----------------------------------------
    console.log('\n  T065-b, a budget of its own for live-effect saves:');
    const audit = (n, action) => db(`insert into public.admin_audit_log (actor, action, detail)
      select '${ADMIN}', '${action}', '{}'::jsonb from generate_series(1, ${n})`);
    const clearAudit = () => db(`delete from public.admin_audit_log where actor = '${ADMIN}'`);
    const cfg = () => rpc(ADMIN, `public.admin_set_config('t365_flag', '{"on": true}'::jsonb)`, 'aal2');
    audit(19, 'set_config');
    check('19 config saves in the minute: the 20th goes through', cfg().ok === true);
    check('20 config saves in the minute: the 21st answers slow_down', cfg().error === 'slow_down');
    check('the feedback triage shares that budget', rpc(ADMIN, `public.admin_set_feedback_status(1, 'done')`, 'aal2').error === 'slow_down');
    check('20 config saves do not block a pass change (destructive list)',
      rpc(ADMIN, `public.admin_set_tier('${BUYER}', 'trip', 5)`, 'aal2').ok === true);
    clearAudit();
    audit(10, 'ban_user');
    check('10 bans in the minute do not block a config save', cfg().ok === true);
    check('10 bans in the minute still block an 11th destructive action',
      rpc(ADMIN, `public.admin_set_tier('${BUYER}', 'free', null)`, 'aal2').error === 'slow_down');
    clearAudit();
    audit(60, 'view_user');
    check('the overall cap of 60 still applies to live saves', cfg().error === 'slow_down');
    clearAudit();

    // ---- T063-e: aal2 for set_tier --------------------------------------
    console.log('\n  T063-e, a pass change needs the second factor:');
    const tierBefore = db(`select tier from public.entitlements where user_id = '${BUYER}'`);
    const r1 = rpc(ADMIN, `public.admin_set_tier('${BUYER}', 'year', 365)`, 'aal1');
    check('aal1: admin_set_tier answers mfa_required', r1.error === 'mfa_required', JSON.stringify(r1));
    check('aal1: the pass is unchanged', db(`select tier from public.entitlements where user_id = '${BUYER}'`) === tierBefore);
    check('aal1: one mfa_refused audit row naming set_tier',
      db(`select count(*) from public.admin_audit_log where action = 'mfa_refused' and detail ->> 'fn' = 'set_tier' and target_user = '${BUYER}'`) === '1');
    check('a token with no aal claim is refused too',
      rpc(ADMIN, `public.admin_set_tier('${BUYER}', 'year', 365)`, null).error === 'mfa_required');
    check('aal2: admin_set_tier goes through', rpc(ADMIN, `public.admin_set_tier('${BUYER}', 'year', 365)`, 'aal2').ok === true);
    check('aal1: reset_quota is still allowed (owner: no)', rpc(ADMIN, `public.admin_reset_quota('${BUYER}')`, 'aal1').ok === true);
    clearAudit();

    // ---- T074-c: overrides stop after 14 days ---------------------------
    console.log('\n  T074-c, an overdue temporary override stops after 14 days:');
    db(`insert into public.content_overrides (layer, item_id, patch, status, review_by, author_note) values
      ('beach', 't365-late', '{"name":"x"}', 'temporary', now() - interval '15 days', 'a reason long enough'),
      ('beach', 't365-grace', '{"name":"x"}', 'temporary', now() - interval '13 days', 'a reason long enough'),
      ('beach', 't365-verified', '{"name":"x"}', 'verified', now() - interval '60 days', 'a reason long enough'),
      ('beach', 't365-stale', '{"name":"x"}', 'stale', now() - interval '60 days', 'a reason long enough'),
      ('beach', 't365-due', '{"name":"x"}', 'temporary', now() + interval '10 days', 'a reason long enough')`);
    const seen = (who) => as(who, `select string_agg(item_id, ',' order by item_id) from public.content_overrides where item_id like 't365-%'`).out.trim();
    check('anon sees every override except the one 15 days overdue',
      seen(null) === 't365-due,t365-grace,t365-stale,t365-verified', seen(null));
    check('a signed-in traveller sees the same', seen(OWNER) === 't365-due,t365-grace,t365-stale,t365-verified');
    check('anon still reads only layer, item_id and patch (043)',
      !as(null, `select author_note from public.content_overrides limit 1`).ok);
    const ovr = rpc(ADMIN, `public.admin_list_overrides('beach')`, 'aal2');
    check('the admin list still shows the stopped override',
      JSON.stringify(ovr).includes('t365-late'), JSON.stringify(ovr).slice(0, 200));

    // ---- T067-d: profiles ------------------------------------------------
    console.log('\n  T067-d, publishing needs a profile, and 051 repairs missing ones:');
    db(`delete from public.profiles where user_id = '${NOPROF}'`);
    const ins = as(NOPROF, `insert into public.trip_plans (id, user_id, label, visibility) values ('${P4}', '${NOPROF}', 'No profile', 'public')`);
    check('creating a public plan without a profile is refused', !ins.ok);
    check('the refusal carries the hint profile_required', hint(ins) === 'profile_required', firstError(ins.err));
    as(NOPROF, `insert into public.trip_plans (id, user_id, label) values ('${P4}', '${NOPROF}', 'No profile')`);
    const up = as(NOPROF, `update public.trip_plans set visibility = 'public' where id = '${P4}'`);
    check('making a private plan public without a profile is refused', !up.ok && hint(up) === 'profile_required');
    check('friends is still allowed without a profile',
      as(NOPROF, `update public.trip_plans set visibility = 'friends' where id = '${P4}'`).ok);
    const f051 = files.find((f) => f.startsWith('051_'));
    const again = psqlRun(bin, TEST_DB, ['-f', resolve(migrations, f051)]);
    check('a second paste of 051 passes and repairs the missing profile',
      again.ok && /repaired 1 missing profile/.test(again.err), firstError(again.err));
    check('after the repair the plan can be published',
      as(NOPROF, `update public.trip_plans set visibility = 'public' where id = '${P4}'`).ok);

    // ---- T070-c, T069-d: the takedown -------------------------------------
    console.log('\n  T070-c and T069-d, the takedown names its ground and revokes the links:');
    const take = (plan, ground, ref) => rpc(ADMIN, `public.admin_unpublish_guide('${plan}', 'facts relied on', ${ground}, ${ref})`, 'aal2');
    check('no ground: bad_ground', take(P1, 'null', 'null').error === 'bad_ground');
    check('an unknown ground: bad_ground', take(P1, `'other'`, `'c1'`).error === 'bad_ground');
    check('terms with an unknown item: bad_ground_ref', take(P1, `'terms'`, `'c9'`).error === 'bad_ground_ref');
    check('illegal with a two-letter law: bad_ground_ref', take(P1, `'illegal'`, `'ab'`).error === 'bad_ground_ref');
    check('a refused takedown leaves the guide public', db(`select visibility from public.trip_plans where id = '${P1}'`) === 'public');
    const t1 = take(P1, `'terms'`, `' C3 '`);
    check('terms c3: the takedown goes through', t1.ok === true && t1.changed === true, JSON.stringify(t1));
    check('the two live share links are revoked', t1.sharesRevoked === 2);
    check('the earlier revocation keeps its own date',
      db(`select count(*) from public.trip_shares where trip_plan_id = '${P1}' and revoked_at = '2026-01-01T00:00:00Z'`) === '1');
    check('the other guide keeps its link', db(`select count(*) from public.trip_shares where trip_plan_id = '${OTHER}' and revoked_at is null`) === '1');
    check('no share row was deleted', db(`select count(*) from public.trip_shares`) === '4');
    check('the statement stores ground terms and item c3',
      db(`select ground || '/' || ground_ref from public.moderation_statements where id = ${t1.statementId}`) === 'terms/c3');
    check('the owner reads the ground of their statement',
      as(OWNER, `select ground || '/' || ground_ref from public.moderation_statements where id = ${t1.statementId}`).out.trim() === 'terms/c3');
    const t2 = take(P2, `'illegal'`, `'Belgian Code of Economic Law, Book XI'`);
    check('illegal with the law named: the takedown goes through', t2.ok === true);
    check('the statement stores the law as written',
      db(`select ground_ref from public.moderation_statements where id = ${t2.statementId}`) === 'Belgian Code of Economic Law, Book XI');
    const t3 = take(P3, `'terms'`, `'c1'`);
    check('the audit row carries the ground and the links revoked',
      db(`select (detail ->> 'ground') || '/' || (detail ->> 'groundRef') || '/' || (detail ->> 'sharesRevoked') from public.admin_audit_log where action = 'unpublish_guide' and detail ->> 'planId' = '${P3}'`) === 'terms/c1/0');

    // ---- T069-c: the lock -------------------------------------------------
    console.log('\n  T069-c, a taken-down guide stays locked until a complaint is decided:');
    const publish = (plan) => as(OWNER, `update public.trip_plans set visibility = 'public' where id = '${plan}'`);
    let p = publish(P1);
    check('not contested: republishing is refused with moderation_locked', !p.ok && hint(p) === 'moderation_locked', firstError(p.err));
    check('the owner may still set it to friends', as(OWNER, `update public.trip_plans set visibility = 'friends' where id = '${P1}'`).ok);
    check('and back to private', as(OWNER, `update public.trip_plans set visibility = 'private' where id = '${P1}'`).ok);
    for (const s of [t1, t2, t3]) {
      rpc(OWNER, `public.contest_moderation_decision(${s.statementId}, 'please look again at this')`);
    }
    p = publish(P1);
    check('contested and open: still locked', !p.ok && hint(p) === 'moderation_locked');
    check('upheld', rpc(ADMIN, `public.admin_decide_complaint(${t1.statementId}, 'upheld', 'it stays down')`, 'aal2').ok === true);
    p = publish(P1);
    check('upheld: still locked', !p.ok && hint(p) === 'moderation_locked');
    const d2 = rpc(ADMIN, `public.admin_decide_complaint(${t2.statementId}, 'reversed', 'we were wrong')`, 'aal2');
    check('reversed on an unchanged guide reinstates it through the gate', d2.ok === true && d2.reinstated === true, JSON.stringify(d2));
    check('the reinstated guide is public again', db(`select visibility from public.trip_plans where id = '${P2}'`) === 'public');
    as(OWNER, `update public.trip_plans set label = 'Guide three, edited' where id = '${P3}'`);
    const d3 = rpc(ADMIN, `public.admin_decide_complaint(${t3.statementId}, 'reversed', 'we were wrong')`, 'aal2');
    check('reversed on an edited guide does not republish it', d3.ok === true && d3.reinstated === false);
    check('reversed: the owner may publish it again', publish(P3).ok);
    check('a plan with no statement publishes as before', as(OWNER, `update public.trip_plans set visibility = 'private' where id = '${OTHER}'`).ok && publish(OTHER).ok);

    // ---- T068-d: the notice form -----------------------------------------
    console.log('\n  T068-d, the good-faith tick and the optional name:');
    const rep = (args, who = null) => rpc(who, `public.report_guide(${args})`);
    const before = db(`select count(*) from public.content_reports`);
    check('anon without the tick: good_faith_required',
      rep(`'${OTHER}', 'this guide is not right at all', null, null, false`).error === 'good_faith_required');
    check('anon with the tick omitted: good_faith_required',
      rep(`p_plan_id => '${OTHER}', p_reason => 'this guide is not right at all'`).error === 'good_faith_required');
    check('a name over 200 characters: bad_name',
      rep(`'${OTHER}', 'this guide is not right at all', null, repeat('n', 201), true`).error === 'bad_name');
    check('refused notices stored nothing', db(`select count(*) from public.content_reports`) === before);
    check('anon with the tick, a name and an email: ok',
      rep(`'${OTHER}', 'this guide is not right at all', 'me@t365.test', '  Ann Reporter  ', true`).ok === true);
    check('the name (trimmed) and the tick are stored',
      db(`select reporter_name || '/' || good_faith from public.content_reports order by id desc limit 1`) === 'Ann Reporter/true');
    check('signed in, no name: ok', rep(`'${OTHER}', 'this guide is not right either', null, '   ', true`, READER).ok === true);
    check('a blank name is stored as none', db(`select coalesce(reporter_name, 'none') from public.content_reports order by id desc limit 1`) === 'none');
    const list = rpc(ADMIN, `public.admin_list_content_reports(null, 10, 0)`, 'aal2');
    const named = (list.rows || []).find((r) => r.reporterName === 'Ann Reporter');
    check('the Reports tab gets reporterName and goodFaith', !!named && named.goodFaith === true);

    // ---- T068-g, T070-g: retention ---------------------------------------
    console.log('\n  T068-g and T070-g, retention:');
    check('a new report keeps its email', db(`select count(*) from public.content_reports where contact_email = 'me@t365.test' and status = 'new'`) === '1');
    const t5 = take(OTHER, `'terms'`, `'c2'`);
    check('the takedown actions the reports on the guide', t5.reportsActioned === 2);
    check('deciding clears the email', db(`select count(*) from public.content_reports where contact_email is not null`) === '0');
    db(`insert into public.content_reports (plan_id, reason, source_hash, source_header, status, created_at, decided_at, contact_email)
        values ('${OTHER}', 'old and decided report', 'h', 'none', 'dismissed', now() - interval '14 months', now() - interval '13 months', null),
               ('${OTHER}', 'recently decided report', 'h', 'none', 'dismissed', now() - interval '14 months', now() - interval '11 months', null),
               ('${OTHER}', 'old and never decided', 'h', 'none', 'new', now() - interval '20 months', null, 'keep@t365.test')`);
    db(`insert into public.moderation_statements (plan_id, source, facts, created_at, complaint_status, complaint_at, complaint_decided_at, complaint_body, contest_until) values
        ('${OTHER}', 'own_initiative', 'old none', now() - interval '3 years 1 day', 'none', null, null, null, now()),
        ('${OTHER}', 'own_initiative', 'old upheld, decided late', now() - interval '4 years', 'upheld', now() - interval '3 years 6 months', now() - interval '2 years', 'a complaint body', now()),
        ('${OTHER}', 'own_initiative', 'old open', now() - interval '5 years', 'open', now() - interval '4 years', null, 'a complaint body', now())`);
    const purge = JSON.parse(db(`select public.moderation_retention_purge()::text`));
    check('the purge removes the one report decided over 12 months ago', purge.reports === 1, JSON.stringify(purge));
    check('a report decided 11 months ago stays', db(`select count(*) from public.content_reports where reason = 'recently decided report'`) === '1');
    check('a report never decided stays, email and all', db(`select count(*) from public.content_reports where contact_email = 'keep@t365.test'`) === '1');
    check('the purge removes the one statement past 3 years', purge.statements === 1);
    check('a statement whose complaint was decided 2 years ago stays', db(`select count(*) from public.moderation_statements where facts = 'old upheld, decided late'`) === '1');
    check('a statement with an open complaint stays', db(`select count(*) from public.moderation_statements where facts = 'old open'`) === '1');
    check('no client may run the purge', !as(ADMIN, `select public.moderation_retention_purge()`, 'aal2').ok && !as(null, `select public.moderation_retention_purge()`).ok);

    // ---- export ------------------------------------------------------------
    console.log('\n  export_user_data carries the new fields:');
    const exR = rpc(READER, `public.export_user_data()`);
    check('the reporter sees goodFaith on their notice', (exR.reportsFiled || []).length === 1 && exR.reportsFiled[0].goodFaith === true && 'reporterName' in exR.reportsFiled[0]);
    const exO = rpc(OWNER, `public.export_user_data()`);
    const g = (exO.moderationStatements || []).map((s) => `${s.ground}/${s.groundRef}`).sort().join(',');
    check('the owner sees the ground on each statement', g.includes('terms/c3') && g.includes('illegal/Belgian Code of Economic Law, Book XI'), g);

    // ---- T217-d: pass_grants outlive the account -------------------------
    console.log('\n  T217-d, the purchase record outlives the account:');
    db(`insert into public.pass_grants (session_id, user_id, tier, expires_at) values ('cs_t365', '${BUYER}', 'trip', now() + interval '10 days')`);
    db(`delete from auth.users where id = '${BUYER}'`);
    check('the pass_grants row stays after the account is deleted', db(`select count(*) from public.pass_grants where session_id = 'cs_t365'`) === '1');
    check('and no longer names the account', db(`select coalesce(user_id::text, 'null') from public.pass_grants where session_id = 'cs_t365'`) === 'null');
    check('no client reads an orphaned row', as(OWNER, `select count(*) from public.pass_grants where session_id = 'cs_t365'`).out.trim() === '0');
  } finally {
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
    if (work) rmSync(work, { recursive: true, force: true });
  }
}

console.log('The owner\'s moderation and admin decisions hold (migration 051, T365)');
console.log('----------------------------------------------------------------------');

const bin = findPsql();
let skipReason = '';
if (!bin) {
  skipReason = 'psql was not found on PATH or at a standard PostgreSQL install path.';
} else {
  const r = psqlRun(bin, 'postgres', ['-At', '-c', 'select 1']);
  if (!r.ok) skipReason = `could not connect to ${PG.user}@${PG.host}:${PG.port}. ${r.err.trim()}`;
}
if (skipReason) {
  console.log('');
  console.log('  SKIPPED. No database was reached, so NOTHING about migration 051');
  console.log('  was tested. This run proves nothing.');
  console.log(`  Reason: ${skipReason}`);
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
if (checks === 0) {
  console.error('Zero assertions ran; that is a failure, not a pass.');
  process.exit(1);
}
if (failures > 0) process.exit(1);
console.log('All moderation and admin decision tests passed.');
