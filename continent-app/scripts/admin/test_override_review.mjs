/**
 * Tests for migration 043: every content override carries a status, a review
 * date and a reason, the writer enforces them, the reader flags the overdue
 * ones, and the public can read the patch but not the reasoning.
 *
 *   PGPORT=55434 node continent-app/scripts/admin/test_override_review.mjs
 *
 * WHAT IT PROVES, in order:
 *
 *   1. BEFORE 043 (006, 007, 010, 014 to 018 and 032 to 034 applied) the
 *      table has none of the three lifecycle columns, and two overrides
 *      written through 034's writer carry no review date. This is the
 *      baseline the report measures against.
 *   2. 043 applies, its self-check passes, and both legacy rows are
 *      backfilled: status temporary, review date 14 days out, the old note
 *      (or the fixed "no reason was recorded" sentence) as the reason.
 *   3. The writer: exactly one admin_set_override exists; a call in the old
 *      four-argument shape gets bad_status; a bad status, a past review date,
 *      one more than 366 days out, a missing or too short reason each get
 *      their own word and change nothing; a valid call stores all three and
 *      mirrors the reason into note; a later save without a reason keeps the
 *      stored one; the audit detail carries status, reviewBy and authorNote
 *      in both previous and new; an empty patch still clears with no
 *      lifecycle arguments; a non-admin gets forbidden.
 *   4. The reader: overdue is true exactly for rows past their review date,
 *      the overdue and stale counts are right, and the most urgent row comes
 *      first.
 *   5. Access: anon and authenticated can read layer, item_id and patch (the
 *      query src/lib/overrides.js makes) but not note, author_note or
 *      review_by, and still cannot write.
 *   6. Pasting 043 twice is safe; re-pasting 034 after it leaves two
 *      overloads, and pasting 043 again brings it back to one.
 *
 * HOW. The harness of test_admin_guard_tiers.mjs (T065): stub schema auth,
 * auth.users, auth.uid(), auth.jwt(), the three Supabase roles and
 * Supabase's default table grants on public, apply the
 * migrations through psql with spawnSync so self-check notices are kept, and
 * call every RPC as the `authenticated` role with request.jwt.claims set, the
 * way PostgREST does.
 *
 * Migration 018 applies as committed: T253 moved its URL length cap out of
 * the regex bound, so no patched copy is needed.
 *
 * NEEDS a PostgreSQL server that accepts a password-less connection (trust
 * auth or PGPASSWORD). Set PGHOST, PGPORT, PGUSER as needed; defaults are
 * 127.0.0.1:5432, postgres. With no server reachable the script SKIPS
 * LOUDLY, exits 0, and never prints that anything passed.
 *
 * It creates and drops a database named carta_t074_test. It never touches
 * the live Supabase project.
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
const TEST_DB = process.env.CARTA_TEST_DB || 'carta_t074_test';

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

-- Supabase grants every API role full table privileges on public by default
-- and leaves RLS and explicit revokes to narrow them. Without this a bare
-- Postgres would hide the very exposure 043 closes (anon reading note).
grant usage on schema public to authenticated, anon, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`;

const ADMIN = '00000000-0000-0000-0000-00000000ad01'; // the caller
const PLAIN = '00000000-0000-0000-0000-00000000c001'; // a non-admin caller

const NEW_FN = 'public.admin_set_override(text,text,jsonb,text,text,timestamptz)';
const LIFECYCLE = ['status', 'review_by', 'author_note'];
const PLACEHOLDER = 'Made before review dates existed; no reason was recorded. Write the real one.';

function runTests(bin) {
  let work = null;
  const measured = {};
  try {
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
    psql(bin, 'postgres', ['-c', `create database ${TEST_DB}`]);

    work = mkdtempSync(join(tmpdir(), 'carta-t074-'));
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
    apply('034_admin_guard_tiers.sql');

    for (const [id, email] of [[ADMIN, 'owner@example.test'], [PLAIN, 'plain@example.test']]) {
      psql(bin, TEST_DB, ['-c', `insert into auth.users (id, email) values ('${id}', '${email}')`]);
    }
    psql(bin, TEST_DB, ['-c', `insert into public.admin_users (user_id, note) values ('${ADMIN}', 'owner')`]);

    const admin = { sub: ADMIN, role: 'authenticated', aal: 'aal1' };
    const plain = { sub: PLAIN, role: 'authenticated', aal: 'aal1' };
    const claimsSql = (claims) => `set request.jwt.claims = '${JSON.stringify(claims).replace(/'/g, "''")}'`;

    /** Call an RPC as PostgREST would. */
    const rpc = (claims, sql) => {
      const r = psqlRun(bin, TEST_DB, ['-At', '-c', 'set role authenticated', '-c', claimsSql(claims), '-c', sql]);
      if (r.ok) return { ok: true, json: JSON.parse(r.out.trim()) };
      return { ok: false, err: r.err.trim() };
    };
    /** A plain query as one of the API roles, the way the anon key reads. */
    const asRole = (role, sql) => {
      const r = psqlRun(bin, TEST_DB, ['-At', '-c', `set role ${role}`, '-c', sql]);
      return { ok: r.ok, out: r.out.trim(), err: r.err.trim() };
    };
    const isErr = (r, word) => r.ok && r.json && r.json.error === word && Object.keys(r.json).length === 1;
    const isOk = (r) => r.ok && r.json && r.json.ok === true;
    const auditCount = () => Number(scalar(bin, TEST_DB, 'select count(*) from public.admin_audit_log'));
    const clearAudit = () => psql(bin, TEST_DB, ['-c', 'delete from public.admin_audit_log']);
    const rowOf = (layer, item) => {
      const t = scalar(bin, TEST_DB, `select row_to_json(o)::text from public.content_overrides o where layer = '${layer}' and item_id = '${item}'`);
      return t ? JSON.parse(t) : null;
    };
    const lifecycleCols = () => Number(scalar(bin, TEST_DB, `select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'content_overrides'
        and column_name in (${LIFECYCLE.map((c) => `'${c}'`).join(', ')})`));
    const overloads = () => Number(scalar(bin, TEST_DB, `select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.proname = 'admin_set_override'`));
    // A review date n days from now, as the admin page sends it.
    const days = (n) => `now() + interval '${n} days'`;
    const lit = (v) => (v === null ? 'null' : `'${v.replace(/'/g, "''")}'`);
    const setCall = (layer, item, patch, note, status, reviewSql) => `select public.admin_set_override('${layer}', '${item}', '${JSON.stringify(patch)}'::jsonb, ${lit(note)}, ${lit(status)}, ${reviewSql === null ? 'null' : reviewSql})`;
    const REASON = 'the pipeline named it after the hut';

    /* ---- 1. baseline, before 043 ------------------------------------- */
    console.log('');
    console.log('  Baseline, before 043:');
    const b1 = rpc(admin, `select public.admin_set_override('beach', 'praia-t074', '{"name": "Praia"}'::jsonb, 'photo showed the car park')`);
    const b2 = rpc(admin, `select public.admin_set_override('lake', 'lac-t074', '{"hidden": true}'::jsonb, null)`);
    check('before 043: two overrides written through the 034 writer', isOk(b1) && isOk(b2), JSON.stringify([b1, b2]));
    measured.before = {
      lifecycleColumns: lifecycleCols(),
      rows: Number(scalar(bin, TEST_DB, 'select count(*) from public.content_overrides')),
      anonCanReadNote: scalar(bin, TEST_DB, `select has_column_privilege('anon', 'public.content_overrides', 'note', 'SELECT')`) === 't',
    };
    check('before 043: the table has none of status, review_by, author_note', measured.before.lifecycleColumns === 0);
    check('before 043: anon can read the free-text note (018 made the whole table world readable)', measured.before.anonCanReadNote);
    console.log(`  measure  before 043: ${measured.before.rows} overrides, ${measured.before.lifecycleColumns} lifecycle columns, so ${measured.before.rows} of ${measured.before.rows} carry no review date and no status`);

    /* ---- 2. apply 043 ------------------------------------------------ */
    console.log('');
    const m43 = apply('043_override_review_lifecycle.sql');
    check('043 self-check ran and passed', /override review lifecycle self-check passed/.test(m43.err + m43.out), (m43.err + m43.out).trim());

    console.log('');
    console.log('  Backfill:');
    const p1 = rowOf('beach', 'praia-t074');
    const p2 = rowOf('lake', 'lac-t074');
    check('legacy rows are backfilled as temporary', p1.status === 'temporary' && p2.status === 'temporary', JSON.stringify([p1, p2]));
    const dueIn = Number(scalar(bin, TEST_DB, 'select round(extract(epoch from (min(review_by) - now())) / 86400) from public.content_overrides'));
    check('legacy rows are due for review in 14 days, not overdue on paste day', dueIn === 14, String(dueIn));
    check('a legacy row with a note keeps it as its reason', p1.author_note === 'photo showed the car park', p1.author_note);
    check('a legacy row with no note says no reason was recorded', p2.author_note === PLACEHOLDER, p2.author_note);
    measured.after = {
      lifecycleColumns: lifecycleCols(),
      rows: Number(scalar(bin, TEST_DB, 'select count(*) from public.content_overrides')),
      missing: Number(scalar(bin, TEST_DB, 'select count(*) from public.content_overrides where status is null or review_by is null or author_note is null')),
    };
    check('after 043: three lifecycle columns, and no row lacks any of them',
      measured.after.lifecycleColumns === 3 && measured.after.missing === 0, JSON.stringify(measured.after));
    console.log(`  measure  after 043: ${measured.after.rows} overrides, ${measured.after.lifecycleColumns} lifecycle columns, ${measured.after.missing} without a review date or status`);
    const nullInsert = psqlRun(bin, TEST_DB, ['-c', `insert into public.content_overrides (layer, item_id, patch) values ('beach', 'raw-t074', '{}'::jsonb)`]);
    check('the table itself refuses a row without the lifecycle (NOT NULL)', !nullInsert.ok && /null value/.test(nullInsert.err), nullInsert.err.split('\n')[0]);
    const badStatusRow = psqlRun(bin, TEST_DB, ['-c', `update public.content_overrides set status = 'forever' where item_id = 'lac-t074'`]);
    check('the table itself refuses a status outside the three', !badStatusRow.ok && /content_overrides_status_check/.test(badStatusRow.err));

    /* ---- 3. the writer ----------------------------------------------- */
    console.log('');
    console.log('  The writer:');
    check('exactly one admin_set_override exists', overloads() === 1, String(overloads()));
    check(`${NEW_FN} is SECURITY DEFINER, anon cannot execute, authenticated can`,
      scalar(bin, TEST_DB, `select prosecdef from pg_proc where oid = '${NEW_FN}'::regprocedure`) === 't'
      && scalar(bin, TEST_DB, `select has_function_privilege('anon', '${NEW_FN}', 'execute')`) === 'f'
      && scalar(bin, TEST_DB, `select has_function_privilege('authenticated', '${NEW_FN}', 'execute')`) === 't');
    const def = scalar(bin, TEST_DB, `select pg_get_functiondef('${NEW_FN}'::regprocedure)`);
    check('the writer keeps the destructive guard from 034', def.includes("admin_guard('destructive')") && !def.includes("admin_guard('read')"));

    clearAudit();
    const snapshot = () => scalar(bin, TEST_DB, `select coalesce(json_agg(o order by layer, item_id)::text, '[]') from public.content_overrides o`);
    const before = snapshot();
    const refusals = [
      ['a call in the old four-argument shape', `select public.admin_set_override('mountain', 'pic-t074', '{"name": "Pic"}'::jsonb, '${REASON}')`, 'bad_status'],
      ['a status outside the three', setCall('mountain', 'pic-t074', { name: 'Pic' }, REASON, 'forever', days(30)), 'bad_status'],
      ['no review date', setCall('mountain', 'pic-t074', { name: 'Pic' }, REASON, 'temporary', null), 'bad_review_by'],
      ['a review date in the past', setCall('mountain', 'pic-t074', { name: 'Pic' }, REASON, 'temporary', "now() - interval '1 day'"), 'bad_review_by'],
      ['a review date 400 days out', setCall('mountain', 'pic-t074', { name: 'Pic' }, REASON, 'verified', days(400)), 'bad_review_by'],
      ['no reason on a new override', setCall('mountain', 'pic-t074', { name: 'Pic' }, null, 'temporary', days(30)), 'note_required'],
      ['a blank reason on a new override', setCall('mountain', 'pic-t074', { name: 'Pic' }, '   ', 'temporary', days(30)), 'note_required'],
      ['a nine-character reason', setCall('mountain', 'pic-t074', { name: 'Pic' }, 'bad name.', 'temporary', days(30)), 'note_required'],
      ['a bad patch, which keeps its own word', setCall('mountain', 'pic-t074', { score: 9 }, REASON, 'forever', days(30)), 'unknown_key'],
    ];
    for (const [label, sql, word] of refusals) {
      const r = rpc(admin, sql);
      check(`${label} returns exactly {error: '${word}'}`, isErr(r, word), JSON.stringify(r));
    }
    check('every refusal changed no row and wrote no audit row', snapshot() === before && auditCount() === 0);

    const rp = rpc(plain, setCall('mountain', 'pic-t074', { name: 'Pic' }, REASON, 'temporary', days(30)));
    check('a non-admin gets exactly {error: forbidden}', isErr(rp, 'forbidden'), JSON.stringify(rp));

    const good = rpc(admin, setCall('mountain', 'pic-t074', { name: 'Pic' }, `  ${REASON}  `, 'temporary', days(30)));
    check('a valid call with status, review date and reason succeeds', isOk(good), JSON.stringify(good));
    const pic = rowOf('mountain', 'pic-t074');
    check('it stores status, the review date and the trimmed reason',
      pic && pic.status === 'temporary' && pic.author_note === REASON
      && scalar(bin, TEST_DB, `select round(extract(epoch from (review_by - now())) / 86400) from public.content_overrides where item_id = 'pic-t074'`) === '30',
      JSON.stringify(pic));
    check('the reason is mirrored into the old note column (024 and the 033 detail read it)', pic.note === pic.author_note);
    const legacy = rpc(admin, setCall('lake', 'lac-t074', { hidden: true }, null, 'temporary', days(30)));
    check('a legacy row cannot be re-saved on the backfill sentence alone', isErr(legacy, 'note_required'), JSON.stringify(legacy));
    const exact = rpc(admin, setCall('mountain', 'edge-t074', { name: 'Edge' }, 'exactly 10', 'verified', "now() + interval '365 days 23 hours'"));
    check('a ten-character reason and a date just under 366 days out are accepted', isOk(exact), JSON.stringify(exact));

    const keep = rpc(admin, setCall('mountain', 'pic-t074', { name: 'Pic du Midi' }, null, 'verified', days(200)));
    const pic2 = rowOf('mountain', 'pic-t074');
    check('a later save without a reason keeps the stored one, and takes the new status and date',
      isOk(keep) && pic2.author_note === REASON && pic2.status === 'verified'
      && pic2.patch.name === 'Pic du Midi', JSON.stringify(pic2));
    const stale = rpc(admin, setCall('mountain', 'pic-t074', { name: 'Pic du Midi' }, 'pipeline fixed in the next run, revert after it', 'stale', days(7)));
    check('an admin can mark an override stale with a new reason', isOk(stale) && rowOf('mountain', 'pic-t074').status === 'stale');

    const detail = JSON.parse(scalar(bin, TEST_DB, `select detail::text from public.admin_audit_log where action = 'override_set' order by id desc limit 1`));
    check('the audit detail carries status, reviewBy and authorNote in previous and new',
      detail.previous.status === 'verified' && detail.previous.reviewBy && detail.previous.authorNote === REASON
      && detail.new.status === 'stale' && detail.new.reviewBy && detail.new.authorNote === 'pipeline fixed in the next run, revert after it',
      JSON.stringify(detail));

    const clr = rpc(admin, `select public.admin_set_override('mountain', 'edge-t074', '{}'::jsonb)`);
    check('an empty patch still clears the row with no lifecycle arguments',
      isOk(clr) && clr.json.cleared === true && rowOf('mountain', 'edge-t074') === null, JSON.stringify(clr));

    /* ---- 4. the reader ----------------------------------------------- */
    console.log('');
    console.log('  The reader:');
    // Make the beach row overdue, as the clock would.
    psql(bin, TEST_DB, ['-c', `update public.content_overrides set review_by = now() - interval '3 days' where item_id = 'praia-t074'`]);
    const list = rpc(admin, 'select public.admin_list_overrides(null)');
    check('admin_list_overrides answers', list.ok && Array.isArray(list.json.rows), JSON.stringify(list));
    const rows = list.json.rows;
    const by = Object.fromEntries(rows.map((r) => [r.itemId, r]));
    check('every row carries status, reviewBy, authorNote and overdue',
      rows.length === 3 && rows.every((r) => r.status && r.reviewBy && r.authorNote && typeof r.overdue === 'boolean'), JSON.stringify(rows));
    check('overdue is true exactly for the row past its review date',
      by['praia-t074'].overdue === true && by['lac-t074'].overdue === false && by['pic-t074'].overdue === false);
    check('the overdue and stale counts are 1 and 1', list.json.overdue === 1 && list.json.stale === 1,
      JSON.stringify({ overdue: list.json.overdue, stale: list.json.stale }));
    check('the most urgent row comes first', rows[0].itemId === 'praia-t074', rows.map((r) => r.itemId).join(','));
    const lp = rpc(plain, 'select public.admin_list_overrides(null)');
    check('a non-admin cannot list', isErr(lp, 'forbidden'), JSON.stringify(lp));

    /* ---- 5. access --------------------------------------------------- */
    console.log('');
    console.log('  Who can read what:');
    for (const role of ['anon', 'authenticated']) {
      const pub = asRole(role, 'select count(*) from (select layer, item_id, patch from public.content_overrides) s');
      check(`${role} can read layer, item_id and patch (the query overrides.js makes)`, pub.ok && pub.out === '3', pub.err || pub.out);
      for (const col of ['author_note', 'note', 'review_by', 'status']) {
        const r = asRole(role, `select ${col} from public.content_overrides limit 1`);
        check(`${role} cannot read ${col}`, !r.ok && /permission denied/.test(r.err), r.err.split('\n')[0] || r.out);
      }
      const w = asRole(role, `update public.content_overrides set patch = '{}'::jsonb`);
      check(`${role} still cannot write`, !w.ok && /permission denied/.test(w.err));
    }

    /* ---- 6. re-paste hazards ----------------------------------------- */
    console.log('');
    console.log('  Pasting again:');
    const snapAgain = snapshot();
    const again43 = apply('043_override_review_lifecycle.sql');
    check('pasting 043 twice passes its self-check and changes no row',
      /override review lifecycle self-check passed/.test(again43.err + again43.out) && snapshot() === snapAgain);
    apply('034_admin_guard_tiers.sql');
    check('re-pasting 034 after 043 leaves two admin_set_override overloads (the hazard the header names)', overloads() === 2, String(overloads()));
    const amb = rpc(admin, setCall('mountain', 'pic-t074', { name: 'Pic' }, REASON, 'temporary', days(30)));
    console.log(`  note  observed with both overloads present, a full six-argument call answers ${JSON.stringify(amb.json || amb.err.split('\n')[0])}`);
    const fix43 = apply('043_override_review_lifecycle.sql');
    check('pasting 043 again brings it back to one', overloads() === 1
      && /override review lifecycle self-check passed/.test(fix43.err + fix43.out));
  } finally {
    if (work) { try { rmSync(work, { recursive: true, force: true }); } catch { /* temp dir */ } }
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
  }
  return measured;
}

console.log('content overrides carry a status, a review date and a reason (migration 043)');
console.log('----------------------------------------------------------------------------');

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
  console.log('  SKIPPED. No database was reached, so NOTHING about the override lifecycle');
  console.log('  was tested. This run proves nothing.');
  console.log(`  Reason: ${skipReason}`);
  console.log('');
  console.log('  To run it, point the script at a PostgreSQL server you can write to');
  console.log('  without a password prompt, for example a throwaway trust-auth cluster:');
  console.log('    initdb -D <dir> -U postgres --auth=trust');
  console.log('    pg_ctl -D <dir> -o "-p 55434" start');
  console.log('    PGPORT=55434 node continent-app/scripts/admin/test_override_review.mjs');
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
console.log('All override review lifecycle tests passed.');
