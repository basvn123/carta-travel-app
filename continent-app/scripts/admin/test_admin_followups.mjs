/**
 * Migration 045, the admin follow-ups (T268), against a real PostgreSQL.
 *
 *   PGPORT=55441 node continent-app/scripts/admin/test_admin_followups.mjs
 *
 * WHAT IT PROVES, one block per register row 045 closes:
 *
 *   T063-d  An aal1 (or claimless) admin's delete and ban are refused with
 *           {error: mfa_required}, nothing happens to the target, and one
 *           'mfa_refused' audit row is written. At aal2 both still work.
 *   T065-c  admin_set_config refuses a malformed maintenance value again.
 *   T064-c  Two admins creating the same NEW config key, or the same new
 *           override, at the same moment: the second waits for the first
 *           and logs previous.exists = true. Run with real parallel
 *           connections, not simulated.
 *   T066-b  admin_list_config shows private keys to an admin; a flip of a
 *           private key to public is audited and the client can then read
 *           it; the three keys the app reads cannot be made private; a
 *           non-admin is refused.
 *   T067-a  public_guide_opened counts one view per viewer per guide per
 *           day: repeat opens, the author, and a private plan add nothing;
 *           another address or a signed-in reader adds one; old dedupe rows
 *           are pruned; no client role can read the view tables.
 *   T067-b  admin_list_public_guides pages with p_limit / p_offset, and a
 *           call with no arguments is not ambiguous.
 *   T071-d  export_user_data (schema 2) carries the caller's own
 *           edge_errors rows and nobody else's.
 *   T074-d  content_overrides.note is gone, and the export reads authorNote.
 *   T074-e  admin_set_override stores a country code (upper-cased), keeps
 *   T076-b  it on a later save that sends none, refuses a malformed one,
 *           returns it from admin_list_overrides, and the public cannot read
 *           it.
 *   T077-c  admin_get_audit sits on admin_guard: an admin over the read
 *           budget gets slow_down.
 *
 * Every migration in supabase/migrations is applied in filename order,
 * including 044 (pasted later on the live project, in stage 10), so 045 is
 * proved both alone and with 044 present. 044 is applied before 045 here
 * because that is filename order; the self-check of 045 does not read
 * anything 044 creates.
 *
 * HARNESS: the stubs of test_admin_rpc_security.mjs (auth schema, roles,
 * Supabase's default grants). Needs a password-less PostgreSQL; with none
 * reachable it SKIPS LOUDLY and exits 0 without printing a pass. Creates and
 * drops carta_t268_test; never touches the live project.
 */
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { existsSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
// CARTA_REPO_ROOT names the root checkout when continent-app is a sibling worktree (T281).
const repoRoot = process.env.CARTA_REPO_ROOT || resolve(here, '../../..');
const migrations = process.env.CARTA_MIGRATIONS_DIR || resolve(repoRoot, 'supabase/migrations');

let failures = 0;
let checks = 0;
const check = (name, cond, detail = '') => {
  checks += 1;
  if (cond) console.log(`  ok  ${name}`);
  else { failures += 1; console.error(`FAIL  ${name}${detail ? `: ${detail}` : ''}`); }
};

const PSQL_CANDIDATES = [
  process.env.PSQL || '', 'psql',
  'C:/Program Files/PostgreSQL/18/bin/psql.exe',
  'C:/Program Files/PostgreSQL/17/bin/psql.exe',
  'C:/Program Files/PostgreSQL/16/bin/psql.exe',
].filter(Boolean);
const PG = {
  host: process.env.PGHOST || '127.0.0.1',
  port: process.env.PGPORT || '5432',
  user: process.env.PGUSER || 'postgres',
};
const TEST_DB = process.env.CARTA_TEST_DB || 'carta_t268_test';

function findPsql() {
  for (const cand of PSQL_CANDIDATES) {
    if (cand !== 'psql' && !existsSync(cand)) continue;
    try { execFileSync(cand, ['--version'], { stdio: 'pipe' }); return cand; } catch { /* next */ }
  }
  return null;
}
const baseArgs = (db) => ['-h', PG.host, '-p', PG.port, '-U', PG.user, '-d', db, '-w',
  '-q', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
function psqlRun(bin, db, args) {
  const r = spawnSync(bin, [...baseArgs(db), ...args], {
    encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
  });
  return { ok: r.status === 0 && !r.error, out: String(r.stdout || ''), err: String(r.stderr || (r.error ? r.error.message : '')) };
}
function psql(bin, db, args) {
  const r = psqlRun(bin, db, args);
  if (!r.ok) throw new Error(r.err.trim());
  return r;
}
function psqlAsync(bin, db, args) {
  return new Promise((done) => {
    const child = spawn(bin, [...baseArgs(db), ...args], { env: { ...process.env, PGCLIENTENCODING: 'UTF8' } });
    let out = ''; let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => done({ ok: code === 0, out, err }));
    child.on('error', (e) => done({ ok: false, out, err: String(e.message) }));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STUBS = `
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key, email text, created_at timestamptz not null default now(),
  last_sign_in_at timestamptz, email_confirmed_at timestamptz, banned_until timestamptz,
  raw_app_meta_data jsonb default '{}'::jsonb, raw_user_meta_data jsonb default '{}'::jsonb
);
create table if not exists auth.refresh_tokens (
  id bigserial primary key, user_id varchar(255), revoked boolean default false
);
create or replace function auth.jwt() returns jsonb language sql stable as $fn$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                  nullif(current_setting('request.jwt.claims', true), ''))::jsonb
$fn$;
create or replace function auth.uid() returns uuid language sql stable as $fn$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$fn$;
do $do$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
end $do$;
grant usage on schema auth to authenticated, anon, service_role;
-- What a Supabase project grants by default on public; 023's self-check
-- reads trip_plans as a client role and fails on a bare database without it.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

const ADMIN = '00000000-0000-0000-0000-00000000ad01';
const ADMIN2 = '00000000-0000-0000-0000-00000000ad02';
const PLAIN = '00000000-0000-0000-0000-00000000c001';
const VICTIM = '00000000-0000-0000-0000-00000000c002';
const AUTHOR = '00000000-0000-0000-0000-0000000000a1';
const P1 = '10000000-0000-0000-0000-000000000001';
const P2 = '10000000-0000-0000-0000-000000000002';
const P3 = '10000000-0000-0000-0000-000000000003';
const PPRIV = '10000000-0000-0000-0000-000000000009';

const claimsSql = (c) => `set request.jwt.claims = '${JSON.stringify(c).replace(/'/g, "''")}'`;
const adminAal1 = { sub: ADMIN, role: 'authenticated', aal: 'aal1' };
const adminAal2 = { sub: ADMIN, role: 'authenticated', aal: 'aal2' };
const admin2Aal2 = { sub: ADMIN2, role: 'authenticated', aal: 'aal2' };
const plainClaims = { sub: PLAIN, role: 'authenticated', aal: 'aal1' };

async function runTests(bin) {
  let work = null;
  try {
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
    psql(bin, 'postgres', ['-c', `create database ${TEST_DB}`]);
    work = mkdtempSync(join(tmpdir(), 'carta-t268-'));
    const stubFile = join(work, 'stubs.sql');
    writeFileSync(stubFile, STUBS, 'utf8');
    psql(bin, TEST_DB, ['-f', stubFile]);

    const files = readdirSync(migrations).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
    check('045_admin_followups.sql is in the migration directory', files.includes('045_admin_followups.sql'));
    check('044 is present too, so 045 is tested next to it', files.some((f) => f.startsWith('044_')));
    console.log(`  Applying ${files.length} migrations in filename order:`);
    let notice045 = '';
    for (const f of files) {
      const r = psqlRun(bin, TEST_DB, ['-f', resolve(migrations, f)]);
      if (!r.ok) {
        check(`migration applied: ${f}`, false, (r.err.match(/ERROR:.*$/m) || [r.err.trim()])[0]);
        throw new Error(`${f} failed`);
      }
      if (f.startsWith('045_')) notice045 = r.err;
    }
    check(`all ${files.length} migrations applied`, true);
    check('045 self-check notice printed', /admin followups self-check passed/.test(notice045));
    const again = psqlRun(bin, TEST_DB, ['-f', resolve(migrations, '045_admin_followups.sql')]);
    check('045 pasted a second time applies and passes its self-check',
      again.ok && /admin followups self-check passed/.test(again.err), (again.err.match(/ERROR:.*$/m) || [''])[0]);

    const sql = (s) => psql(bin, TEST_DB, ['-At', '-c', s]).out.trim();
    const as = (role, claims, s, headers = null) => {
      const args = ['-At', '-c', `set role ${role}`];
      if (claims) args.push('-c', claimsSql(claims));
      if (headers) args.push('-c', `set request.headers = '${JSON.stringify(headers)}'`);
      args.push('-c', s);
      const r = psqlRun(bin, TEST_DB, args);
      return { ok: r.ok, out: r.out.trim(), err: r.err.trim() };
    };
    const asJson = (role, claims, s, headers) => {
      const r = as(role, claims, s, headers);
      try { return JSON.parse(r.out); } catch { return { _raw: r.out, _err: (r.err.match(/ERROR:.*$/m) || [r.err])[0] }; }
    };

    for (const [id, email] of [[ADMIN, 'owner@example.test'], [ADMIN2, 'second@example.test'],
      [PLAIN, 'plain@example.test'], [VICTIM, 'victim@example.test'], [AUTHOR, 'author@example.test']]) {
      sql(`insert into auth.users (id, email) values ('${id}', '${email}')`);
    }
    sql(`insert into public.admin_users (user_id, note) values ('${ADMIN}', 'owner'), ('${ADMIN2}', 'second')`);
    const clearAudit = () => sql('delete from public.admin_audit_log');

    // ------------------------------------------------------------------ T063-d
    console.log('\n  T063-d: a refused aal1 delete or ban leaves an audit row');
    clearAudit();
    for (const [label, claims] of [['aal1', adminAal1], ['no aal claim', { sub: ADMIN, role: 'authenticated' }]]) {
      const ban = asJson('authenticated', claims, `select public.admin_ban_user('${VICTIM}'::uuid, 7)`);
      check(`${label} ban: returns {error: mfa_required}`, ban.error === 'mfa_required', JSON.stringify(ban));
      const del = asJson('authenticated', claims, `select public.admin_delete_user('${VICTIM}'::uuid, 'victim@example.test')`);
      check(`${label} delete: returns {error: mfa_required}`, del.error === 'mfa_required', JSON.stringify(del));
    }
    check('the victim still exists and is not banned',
      sql(`select count(*) from auth.users where id = '${VICTIM}' and banned_until is null`) === '1');
    check('four mfa_refused audit rows, targeting the victim, actor the admin',
      sql(`select count(*) from public.admin_audit_log where action = 'mfa_refused' and target_user = '${VICTIM}' and actor = '${ADMIN}'`) === '4');
    check('the rows say which function and which aal',
      sql(`select string_agg(detail->>'fn' || '/' || coalesce(detail->>'aal','none'), ',' order by id) from public.admin_audit_log where action = 'mfa_refused'`)
        === 'ban_user/aal1,delete_user/aal1,ban_user/none,delete_user/none');
    check('no ban_user or delete_user row was written',
      sql(`select count(*) from public.admin_audit_log where action in ('ban_user','delete_user')`) === '0');
    const nonAdmin = asJson('authenticated', plainClaims, `select public.admin_ban_user('${VICTIM}'::uuid, 7)`);
    check('a non-admin still hears forbidden first, and writes nothing',
      nonAdmin.error === 'forbidden' && sql(`select count(*) from public.admin_audit_log where actor = '${PLAIN}'`) === '0');
    const ban2 = asJson('authenticated', adminAal2, `select public.admin_ban_user('${VICTIM}'::uuid, 7)`);
    check('aal2 ban still works', ban2.ok === true, JSON.stringify(ban2));
    check('aal2 own_account refusal intact',
      asJson('authenticated', adminAal2, `select public.admin_delete_user('${ADMIN}'::uuid, 'x')`).error === 'own_account');

    // ------------------------------------------------------------------ T065-c
    console.log('\n  T065-c: the maintenance shape check is back');
    clearAudit();
    const setCfg = (claims, key, value) => asJson('authenticated', claims,
      `select public.admin_set_config('${key}', '${JSON.stringify(value)}'::jsonb)`);
    check('maintenance {enabled: "yes"} is bad_value', setCfg(adminAal2, 'maintenance', { enabled: 'yes', message: '' }).error === 'bad_value');
    check('maintenance without message is bad_value', setCfg(adminAal2, 'maintenance', { enabled: true }).error === 'bad_value');
    check('announcement without text is bad_value (the missing-field hole in 015/017)',
      setCfg(adminAal2, 'announcement', { enabled: true, tone: 'info' }).error === 'bad_value');
    check('maintenance message over 500 chars is bad_value',
      setCfg(adminAal2, 'maintenance', { enabled: true, message: 'x'.repeat(501) }).error === 'bad_value');
    check('a well-formed maintenance value saves', setCfg(adminAal2, 'maintenance', { enabled: false, message: 'Back soon' }).ok === true);
    check('announcement and features checks unchanged',
      setCfg(adminAal2, 'announcement', { enabled: true, text: 'x', tone: 'loud' }).error === 'bad_value'
      && setCfg(adminAal2, 'features', { a: 'no' }).error === 'bad_value');
    check('a non-admin is still refused', setCfg(plainClaims, 'maintenance', { enabled: false, message: '' }).error === 'forbidden');

    // ------------------------------------------------------------------ T064-c
    console.log('\n  T064-c: two admins creating the same new key at once');
    clearAudit();
    const holdFirst = (claims, call) => psqlAsync(bin, TEST_DB, ['-At',
      '-c', 'set role authenticated', '-c', claimsSql(claims),
      '-c', `begin; select ${call}; select pg_sleep(5); commit;`]);
    // Wait until the first writer really holds its advisory lock, so the
    // second one is guaranteed to arrive while the first is uncommitted.
    // Without the lock in 045, the second writer's read finds no committed
    // row and logs previous.exists false too (its insert then queues on the
    // unique key), so the audit rows tell the two cases apart.
    const waitForLock = async () => {
      for (let i = 0; i < 100; i += 1) {
        if (sql(`select count(*) from pg_locks where locktype = 'advisory' and granted and pid <> pg_backend_pid()`) !== '0') return true;
        await sleep(100);
      }
      return false;
    };
    const cfgCall = (v) => `public.admin_set_config('race_key', '{"v": ${v}}'::jsonb)`;
    const first = holdFirst(adminAal2, cfgCall(1));
    check('the first writer holds the key lock while uncommitted', await waitForLock());
    const second = as('authenticated', admin2Aal2, `select ${cfgCall(2)}`);
    const firstR = await first;
    check('both writers answered ok', firstR.ok && second.ok && /"ok": true/.test(second.out), second.err || firstR.err);
    const raceRows = sql(`select string_agg((detail->'previous'->>'exists') || ':' || coalesce(detail->'previous'->'value'->>'v', '-'), ',' order by id) from public.admin_audit_log where action = 'set_config' and detail->>'key' = 'race_key'`);
    check('first logs previous.exists false, second logs previous.exists true with the first value',
      raceRows === 'false:-,true:1', raceRows);

    const ovCall = (name) => `public.admin_set_override('beach', 'race-item', '{"name": "${name}"}'::jsonb, 'A reason that is long enough', 'temporary', now() + interval '30 days', 'ES')`;
    const firstO = holdFirst(adminAal2, ovCall('A'));
    check('the first override writer holds the item lock while uncommitted', await waitForLock());
    const secondO = as('authenticated', admin2Aal2, `select ${ovCall('B')}`);
    const firstOR = await firstO;
    check('both override writers answered ok', firstOR.ok && /"ok": true/.test(firstOR.out) && /"ok": true/.test(secondO.out),
      `${firstOR.out} ${firstOR.err} / ${secondO.out} ${secondO.err}`.slice(0, 300));
    const ovRows = sql(`select string_agg((detail->'previous'->>'exists') || ':' || coalesce(detail->'previous'->'patch'->>'name', '-'), ',' order by id) from public.admin_audit_log where action = 'override_set' and detail->>'item' = 'race-item'`);
    check('same for a new override: false then true with the first patch', secondO.ok && ovRows === 'false:-,true:A', ovRows);

    // ------------------------------------------------------------------ T066-b
    console.log('\n  T066-b: admin reads and flips site_config visibility');
    clearAudit();
    check('a new key written by an admin is private by default',
      setCfg(adminAal2, 'secret_knob', { on: true }).ok === true
      && sql(`select public from public.site_config where key = 'secret_knob'`) === 'f');
    check('the client cannot read it', as('anon', null, `select count(*) from public.site_config where key = 'secret_knob'`).out === '0');
    const list = asJson('authenticated', adminAal1, 'select public.admin_list_config()');
    const knob = (list.rows || []).find((r) => r.key === 'secret_knob');
    check('admin_list_config shows the private key with its value and flag',
      knob && knob.public === false && knob.value?.on === true && knob.required === false, JSON.stringify(knob));
    check('admin_list_config marks the three app keys required',
      ['announcement', 'maintenance', 'features'].every((k) => (list.rows || []).find((r) => r.key === k)?.required === true));
    const flip = asJson('authenticated', adminAal1, `select public.admin_set_config_public('secret_knob', true)`);
    check('flipping it public answers ok, changed', flip.ok === true && flip.changed === true, JSON.stringify(flip));
    check('the client can now read it', as('anon', null, `select count(*) from public.site_config where key = 'secret_knob'`).out === '1');
    const vis = sql(`select (detail->'previous'->>'public') || '>' || (detail->'new'->>'public') from public.admin_audit_log where action = 'config_visibility'`);
    check('one config_visibility audit row with previous false, new true', vis === 'false>true', vis);
    const same = asJson('authenticated', adminAal1, `select public.admin_set_config_public('secret_knob', true)`);
    check('a no-change flip answers changed false and writes no row',
      same.changed === false && sql(`select count(*) from public.admin_audit_log where action = 'config_visibility'`) === '1');
    check('the three app keys cannot be made private',
      ['announcement', 'maintenance', 'features'].every((k) =>
        asJson('authenticated', adminAal1, `select public.admin_set_config_public('${k}', false)`).error === 'required_public'));
    check('a missing key is not_found', asJson('authenticated', adminAal1, `select public.admin_set_config_public('no_such_key', true)`).error === 'not_found');
    check('a bad key is bad_key', asJson('authenticated', adminAal1, `select public.admin_set_config_public('Bad Key', true)`).error === 'bad_key');
    check('a non-admin is refused on both',
      asJson('authenticated', plainClaims, 'select public.admin_list_config()').error === 'forbidden'
      && asJson('authenticated', plainClaims, `select public.admin_set_config_public('secret_knob', false)`).error === 'forbidden');

    // ------------------------------------------------------------------ T067-a
    console.log('\n  T067-a: guide views, one per viewer per guide per day');
    for (const [id, vis, label] of [[P1, 'public', 'First guide'], [P2, 'public', 'Second guide'],
      [P3, 'public', 'Third guide'], [PPRIV, 'private', 'Private plan']]) {
      sql(`insert into public.trip_plans (id, user_id, label) values ('${id}', '${AUTHOR}', '${label}')`);
      sql(`update public.trip_plans set visibility = '${vis}' where id = '${id}'`);
    }
    const viewsOf = (id) => sql(`select coalesce((select views from public.guide_view_counts where plan_id = '${id}'), 0)`);
    const open = (role, claims, id, headers) => as(role, claims, `select public.public_guide_opened('${id}'::uuid)`, headers);
    const ipA = { 'cf-connecting-ip': '203.0.113.5' };
    const ipB = { 'cf-connecting-ip': '203.0.113.9' };
    check('a signed-out open counts', open('anon', null, P1, ipA).ok && viewsOf(P1) === '1');
    open('anon', null, P1, ipA);
    check('the same address again the same day does not', viewsOf(P1) === '1');
    open('anon', null, P1, ipB);
    check('another address does', viewsOf(P1) === '2');
    open('anon', null, P1, { 'x-forwarded-for': '2001:db8::1, 10.0.0.1' });
    open('anon', null, P1, { 'x-forwarded-for': '2001:db8::2' });
    check('two addresses in one IPv6 /64 count once', viewsOf(P1) === '3');
    open('authenticated', plainClaims, P1);
    open('authenticated', plainClaims, P1);
    check('a signed-in reader counts once', viewsOf(P1) === '4');
    open('authenticated', { sub: AUTHOR, role: 'authenticated' }, P1);
    check('the author reading their own guide does not count', viewsOf(P1) === '4');
    open('anon', null, PPRIV, ipA);
    check('a private plan counts nothing', viewsOf(PPRIV) === '0');
    open('anon', null, P2);
    open('anon', null, P2);
    check('no address at all shares one unknown bucket', viewsOf(P2) === '1');
    check('views are stored as 64-character hashes, no address or id in clear',
      sql(`select count(*) from public.guide_views where viewer !~ '^[0-9a-f]{64}$' or viewer like '%203.0%'`) === '0');
    sql(`insert into public.guide_views (plan_id, day, viewer) values ('${P3}', current_date - 5, repeat('a', 64))`);
    open('anon', null, P3, ipA);
    check('dedupe rows older than yesterday are pruned on the next open',
      sql(`select count(*) from public.guide_views where day < (now() at time zone 'utc')::date - 1`) === '0');
    for (const t of ['guide_views', 'guide_view_counts', 'guide_view_salt']) {
      const r = as('anon', null, `select count(*) from public.${t}`);
      const r2 = as('authenticated', plainClaims, `select count(*) from public.${t}`);
      check(`no client role can read ${t}`, !r.ok && !r2.ok && /permission denied/.test(r.err + r2.err));
    }
    check('anon cannot write guide_view_counts directly',
      !as('anon', null, `insert into public.guide_view_counts (plan_id, views) values ('${P2}', 999)`).ok);

    // ---------------------------------------------------------- T067-a, T067-b
    console.log('\n  T067-a/b: the admin list reads views and pages');
    sql(`alter table public.trip_plans disable trigger trip_plans_stamp_published`);
    sql(`update public.trip_plans set published_at = case id when '${P1}' then now() - interval '1 day' when '${P2}' then now() - interval '2 days' else now() - interval '3 days' end where visibility = 'public'`);
    sql(`alter table public.trip_plans enable trigger trip_plans_stamp_published`);
    const all = asJson('authenticated', adminAal1, 'select public.admin_list_public_guides()');
    check('a call with no arguments works (not ambiguous)', Array.isArray(all.rows), JSON.stringify(all).slice(0, 200));
    check('viewsCounted is true and views are real',
      all.viewsCounted === true && all.rows?.find((r) => r.id === P1)?.views === 4 && all.rows?.find((r) => r.id === P3)?.views === 1);
    check('default page is 100, total counts every public guide', all.limit === 100 && all.offset === 0 && all.total === 3 && all.rows.length === 3);
    const pg1 = asJson('authenticated', adminAal1, 'select public.admin_list_public_guides(2, 0)');
    const pg2 = asJson('authenticated', adminAal1, 'select public.admin_list_public_guides(2, 2)');
    check('limit 2 gives the two newest', pg1.rows?.map((r) => r.id).join() === [P1, P2].join() && pg1.total === 3);
    check('offset 2 gives the rest', pg2.rows?.map((r) => r.id).join() === P3);
    check('limit is capped at 500', asJson('authenticated', adminAal1, 'select public.admin_list_public_guides(100000, 0)').limit === 500);
    check('exactly one admin_list_public_guides exists',
      sql(`select count(*) from pg_proc where proname = 'admin_list_public_guides'`) === '1');
    check('a non-admin is refused', asJson('authenticated', plainClaims, 'select public.admin_list_public_guides(5, 0)').error === 'forbidden');

    // ------------------------------------------------------- T074-d/e, T076-b
    console.log('\n  T074-d, T074-e, T076-b: country on the override row, note retired');
    check('content_overrides.note is gone',
      sql(`select count(*) from information_schema.columns where table_name = 'content_overrides' and column_name = 'note'`) === '0');
    const setOv = (item, country, name = 'Better name') => asJson('authenticated', adminAal2,
      `select public.admin_set_override('beach', '${item}', '{"name": "${name}"}'::jsonb, 'Photo showed the car park', 'temporary', now() + interval '30 days', ${country === null ? 'null' : `'${country}'`})`);
    check('a save with country es answers ok', setOv('playa-1', 'es').ok === true);
    check('it is stored upper-cased', sql(`select country from public.content_overrides where item_id = 'playa-1'`) === 'ES');
    check('a later save without a country keeps it',
      setOv('playa-1', null, 'Even better').ok === true && sql(`select country from public.content_overrides where item_id = 'playa-1'`) === 'ES');
    check('a malformed country is bad_country', setOv('playa-2', 'ESP').error === 'bad_country');
    const six = asJson('authenticated', adminAal2,
      `select public.admin_set_override(p_layer => 'lake', p_item => 'lago-1', p_patch => '{"name": "Lago"}'::jsonb, p_note => 'Name was the dam, not the lake', p_status => 'verified', p_review_by => now() + interval '60 days')`);
    check('the six named arguments a pre-045 admin page sends still resolve', six.ok === true, JSON.stringify(six));
    const ovList = asJson('authenticated', adminAal1, 'select public.admin_list_overrides(null)');
    const pl = (ovList.rows || []).find((r) => r.itemId === 'playa-1');
    check('admin_list_overrides returns country and no note', pl && pl.country === 'ES' && !('note' in pl), JSON.stringify(pl));
    const setLog = sql(`select detail->'new'->>'country' from public.admin_audit_log where action = 'override_set' and detail->>'item' = 'playa-1' order by id desc limit 1`);
    check('the audit row carries the country under new', setLog === 'ES');
    const anonCountry = as('anon', null, `select country from public.content_overrides limit 1`);
    check('the public cannot read country', !anonCountry.ok && /permission denied/.test(anonCountry.err));
    check('the public can still read the patch', as('anon', null, `select count(patch) from public.content_overrides`).ok);
    check('exactly one admin_set_override exists',
      sql(`select count(*) from pg_proc where proname = 'admin_set_override'`) === '1');

    // ------------------------------------------------------- T071-d, T074-d
    console.log('\n  T071-d, T074-d: the export carries edge_errors and the new override fields');
    sql(`insert into public.edge_errors (user_id, fn, code, origin, http_status) values
      ('${ADMIN}', 'plan-day', 'ai_timeout', 'edge', 504),
      ('${PLAIN}', 'parse-booking', 'url_unreachable', 'edge', 400)`);
    const exp = asJson('authenticated', adminAal1, 'select public.export_user_data()');
    check('schema is 2', exp.schema === 2, JSON.stringify(exp).slice(0, 200));
    check('edgeErrors holds the caller\'s one row with code and status',
      exp.edgeErrors?.length === 1 && exp.edgeErrors[0].code === 'ai_timeout' && exp.edgeErrors[0].httpStatus === 504);
    const co = (exp.contentOverrides || []).find((r) => r.itemId === 'playa-1');
    check('contentOverrides carries authorNote, status, reviewBy and country, no note',
      co && co.authorNote === 'Photo showed the car park' && co.status === 'temporary' && co.reviewBy && co.country === 'ES' && !('note' in co),
      JSON.stringify(co));
    const expPlain = asJson('authenticated', plainClaims, 'select public.export_user_data()');
    check('another user sees only their own error and no overrides',
      expPlain.edgeErrors?.length === 1 && expPlain.edgeErrors[0].code === 'url_unreachable' && expPlain.contentOverrides?.length === 0);
    check('signed out is still refused, and anon cannot call it',
      !as('anon', null, 'select public.export_user_data()').ok);

    // ------------------------------------------------------------------ T077-c
    console.log('\n  T077-c: admin_get_audit sits on admin_guard');
    clearAudit();
    check('an admin reads the trail', Array.isArray(asJson('authenticated', adminAal1, 'select public.admin_get_audit(10, 0)').rows));
    check('a non-admin is forbidden', asJson('authenticated', plainClaims, 'select public.admin_get_audit(10, 0)').error === 'forbidden');
    sql(`insert into public.admin_audit_log (actor, action) select '${ADMIN}', 'get_user' from generate_series(1, 60)`);
    check('an admin over the read budget now gets slow_down (is_admin had no budget)',
      asJson('authenticated', adminAal1, 'select public.admin_get_audit(10, 0)').error === 'slow_down');
    check('the body no longer mentions is_admin',
      sql(`select position('is_admin' in pg_get_functiondef('public.admin_get_audit(int,int)'::regprocedure))`) === '0');
    clearAudit();

    // --------------------------------------------------------- re-paste traps
    console.log('\n  Re-paste traps named in the 045 header');
    const r036 = psqlRun(bin, TEST_DB, ['-f', resolve(migrations, '036_admin_public_guides.sql')]);
    check('re-pasting 036 fails its own self-check but leaves the zero-argument reader next to 045\'s',
      !r036.ok && /not unique/.test(r036.err) && sql(`select count(*) from pg_proc where proname = 'admin_list_public_guides'`) === '2');
    const r043 = psqlRun(bin, TEST_DB, ['-1', '-f', resolve(migrations, '043_override_review_lifecycle.sql')]);
    check('re-pasting 043 fails (note is gone) and, in one transaction, changes nothing',
      !r043.ok && /note/.test(r043.err) && sql(`select count(*) from pg_proc where proname = 'admin_set_override'`) === '1');
    const fix = psqlRun(bin, TEST_DB, ['-f', resolve(migrations, '045_admin_followups.sql')]);
    check('pasting 045 again restores one reader and passes its self-check',
      fix.ok && /admin followups self-check passed/.test(fix.err)
      && sql(`select count(*) from pg_proc where proname = 'admin_list_public_guides'`) === '1');
  } finally {
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
    if (work) { try { rmSync(work, { recursive: true, force: true }); } catch { /* leave it */ } }
  }
}

console.log('Migration 045, admin follow-ups (T268)');
console.log('--------------------------------------');
const bin = findPsql();
let skipReason = '';
if (!bin) skipReason = 'psql was not found on PATH or at a standard PostgreSQL install path.';
else {
  const r = psqlRun(bin, 'postgres', ['-At', '-c', 'select 1']);
  if (!r.ok) skipReason = `could not connect to ${PG.user}@${PG.host}:${PG.port}. ${r.err.trim()}`;
}
if (skipReason) {
  console.log('\n  SKIPPED. No database was reached, so NOTHING was tested. This run proves nothing.');
  console.log(`  Reason: ${skipReason}`);
  console.log('  Start a throwaway trust-auth cluster (initdb -D <dir> -U postgres --auth=trust;');
  console.log('  pg_ctl -D <dir> -o "-p 55441" start) and run with PGPORT=55441.\n');
  process.exit(0);
}
try {
  await runTests(bin);
} catch (err) {
  failures += 1;
  console.error(`FAIL  the run aborted: ${err.message}`);
}
console.log(`\n${checks} assertions, ${checks - failures} passing, ${failures} failing.`);
if (failures) { console.error(`\n${failures} test(s) failed`); process.exit(1); }
if (checks === 0) { console.error('No assertions ran; treating this as a failure.'); process.exit(1); }
console.log('All admin follow-up tests passed.');
