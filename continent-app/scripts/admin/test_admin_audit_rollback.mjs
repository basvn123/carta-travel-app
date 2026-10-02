/**
 * Tests for migration 033: admin_set_config and admin_set_override write the
 * row as it was and the row as it is now into the audit detail, so a bad
 * live edit can be reverted from the audit row alone.
 *
 *   PGPORT=55434 node continent-app/scripts/admin/test_admin_audit_rollback.mjs
 *
 * WHAT IT PROVES, in order:
 *
 *   1. BEFORE 033 (014 to 018 and 032 applied) a set_config audit row holds
 *      only {key, value}: the old value is gone, so no revert is possible
 *      from the row. This is the baseline.
 *   2. After 033, for site_config: changing an existing key logs previous
 *      and new; running the documented revert SQL against that audit row id,
 *      and nothing else, puts value, updated_at and updated_by back exactly.
 *      A first-time key logs previous = {"exists": false}, and the revert
 *      deletes the key. Re-saving previous.value through the RPC also works.
 *   3. The same for content_overrides: a first-time override, an update
 *      (with the kept note), and a clear (the delete path) are each reverted
 *      from their own audit row to the exact earlier row, or to no row.
 *   4. Nothing else moved: the return shapes, every validation refusal, the
 *      forbidden answer for a non-admin, no audit row on a refusal, the
 *      fields the old detail carried, and the guard tier, which must be the
 *      one the last applied migration for each function wrote (033: read).
 *
 * HOW. Same harness as test_admin_mfa.mjs (T063): stub schema auth, the
 * three roles, auth.uid() and auth.jwt(), apply the migrations through psql
 * with spawnSync, call every RPC as the `authenticated` role with
 * request.jwt.claims set, the way PostgREST does. 006 and 007 are applied
 * because 014 and 015 name plan_tiers, entitlements and ai_resolve_tier; 010
 * because admin_get_audit joins profiles.
 *
 * MIGRATION 018. Line 93 uses the regex bound {5,600}, and Postgres caps a
 * repetition count at 255, so 018's own self-check fails on a real Postgres
 * (register row T031-d). This script first applies 018 as committed and
 * reports what happens; if it fails on that bound, it applies a copy with
 * {5,255} from a temp directory, for this test only. 018 in the repo is
 * never edited.
 *
 * NEEDS a PostgreSQL server that accepts a password-less connection (trust
 * auth or PGPASSWORD). Set PGHOST, PGPORT, PGUSER as needed; defaults are
 * 127.0.0.1:5432, postgres. With no server reachable the script SKIPS
 * LOUDLY, exits 0, and never prints that anything passed.
 *
 * It creates and drops a database named carta_t064_test. It never touches
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
const TEST_DB = process.env.CARTA_TEST_DB || 'carta_t064_test';

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
`;

const ADMIN = '00000000-0000-0000-0000-00000000ad01'; // the caller
const ADMIN2 = '00000000-0000-0000-0000-00000000ad02'; // a second admin
const PLAIN = '00000000-0000-0000-0000-00000000c001'; // a non-admin caller

/**
 * The revert, written only against the audit row. These are the statements
 * the 033 header documents; a maintainer pastes them into the SQL editor
 * with the row id and nothing else.
 */
const revertConfigSql = (id) => `
with d as (select detail from public.admin_audit_log where id = ${id})
insert into public.site_config (key, value, updated_at, updated_by)
select detail ->> 'key', detail -> 'previous' -> 'value',
       (detail -> 'previous' ->> 'updatedAt')::timestamptz,
       (detail -> 'previous' ->> 'updatedBy')::uuid
  from d where (detail -> 'previous' ->> 'exists')::boolean
on conflict (key) do update set value = excluded.value,
  updated_at = excluded.updated_at, updated_by = excluded.updated_by;
delete from public.site_config c using public.admin_audit_log l
 where l.id = ${id} and c.key = l.detail ->> 'key'
   and not (l.detail -> 'previous' ->> 'exists')::boolean;
`;

const revertOverrideSql = (id) => `
with d as (select detail from public.admin_audit_log where id = ${id})
insert into public.content_overrides (layer, item_id, patch, note, updated_at, updated_by)
select detail ->> 'layer', detail ->> 'item', detail -> 'previous' -> 'patch',
       detail -> 'previous' ->> 'note',
       (detail -> 'previous' ->> 'updatedAt')::timestamptz,
       (detail -> 'previous' ->> 'updatedBy')::uuid
  from d where (detail -> 'previous' ->> 'exists')::boolean
on conflict (layer, item_id) do update set patch = excluded.patch,
  note = excluded.note, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
delete from public.content_overrides o using public.admin_audit_log l
 where l.id = ${id} and o.layer = l.detail ->> 'layer' and o.item_id = l.detail ->> 'item'
   and not (l.detail -> 'previous' ->> 'exists')::boolean;
`;

function runTests(bin) {
  let work = null;
  try {
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
    psql(bin, 'postgres', ['-c', `create database ${TEST_DB}`]);

    work = mkdtempSync(join(tmpdir(), 'carta-t064-'));
    const stubFile = join(work, 'stubs.sql');
    writeFileSync(stubFile, STUBS, 'utf8');
    psql(bin, TEST_DB, ['-f', stubFile]);

    // Every file applied, in order, so the tier assertion at the end can ask
    // which of them last defined each function (T065-e).
    const appliedFiles = [];
    const applyFile = (label, file) => {
      appliedFiles.push(file);
      const r = psqlRun(bin, TEST_DB, ['-f', file]);
      check(`migration applied: ${label}`, r.ok, r.err.trim().split('\n')[0]);
      if (!r.ok) throw new Error(`${label} failed: ${r.err.trim()}`);
      return r;
    };
    const apply = (name) => applyFile(name, resolve(migrations, name));

    for (const name of ['006_ai_day_planner.sql', '007_passes.sql', '010_profiles.sql',
      '014_admin.sql', '015_admin_hardening.sql', '016_admin_resilient.sql']) {
      apply(name);
    }

    // 018 as committed first, so the report can say what it does on a real
    // Postgres; the patched copy only if it fails on the known bound.
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
    apply('032_admin_mfa_destructive.sql');

    for (const [id, email] of [[ADMIN, 'owner@example.test'], [ADMIN2, 'second@example.test'],
      [PLAIN, 'plain@example.test']]) {
      psql(bin, TEST_DB, ['-c', `insert into auth.users (id, email) values ('${id}', '${email}')`]);
    }
    psql(bin, TEST_DB, ['-c', `insert into public.admin_users (user_id, note) values ('${ADMIN}', 'owner'), ('${ADMIN2}', 'second')`]);

    /** Call an RPC as PostgREST would. */
    const rpc = (claims, sql) => {
      const lit = JSON.stringify(claims).replace(/'/g, "''");
      const r = psqlRun(bin, TEST_DB, ['-At',
        '-c', 'set role authenticated',
        '-c', `set request.jwt.claims = '${lit}'`,
        '-c', sql]);
      if (r.ok) return { ok: true, json: JSON.parse(r.out.trim()) };
      return { ok: false, err: r.err.trim() };
    };
    const lit = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
    const str = (s) => (s === null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
    const setConfig = (claims, key, value) =>
      rpc(claims, `select public.admin_set_config(${str(key)}, ${lit(value)})`);
    const setOverride = (claims, layer, item, patch, note = null) =>
      rpc(claims, `select public.admin_set_override(${str(layer)}, ${str(item)}, ${lit(patch)}, ${str(note)})`);

    const admin = { sub: ADMIN, role: 'authenticated', aal: 'aal1' };
    const admin2 = { sub: ADMIN2, role: 'authenticated', aal: 'aal1' };
    const plain = { sub: PLAIN, role: 'authenticated', aal: 'aal1' };

    const json = (sql) => {
      const v = scalar(bin, TEST_DB, sql);
      return v === '' ? null : JSON.parse(v);
    };
    // One row as JSON with every column a revert must restore, or null.
    const configRow = (key) => json(`select row_to_json(c)::text from (select key, value, updated_at::text as updated_at, updated_by from public.site_config where key = ${str(key)}) c`);
    const overrideRow = (layer, item) => json(`select row_to_json(o)::text from (select layer, item_id, patch, note, updated_at::text as updated_at, updated_by from public.content_overrides where layer = ${str(layer)} and item_id = ${str(item)}) o`);
    const lastAudit = (action) => json(`select json_build_object('id', id, 'detail', detail)::text from public.admin_audit_log where action = ${str(action)} order by id desc limit 1`);
    const auditCount = () => Number(scalar(bin, TEST_DB, 'select count(*) from public.admin_audit_log'));
    // jsonb stores object keys in its own order (shorter keys first), so
    // compare with keys sorted rather than as written.
    const canon = (v) => (Array.isArray(v) ? v.map(canon)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
        : v);
    const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
    const keysOf = (o) => Object.keys(o || {}).sort().join(',');

    /* ---- 1. baseline: before 033 the row holds only the new value --- */
    console.log('');
    console.log('  Baseline, before 033:');
    const base = setConfig(admin, 'announcement', { enabled: true, text: 'baseline', tone: 'info' });
    check('before 033: set_config returns ok', base.ok && base.json.ok === true, JSON.stringify(base));
    const baseRow = lastAudit('set_config');
    check('before 033: the detail holds exactly key and value', keysOf(baseRow?.detail) === 'key,value', keysOf(baseRow?.detail));
    check('before 033: the detail has no previous state, so no revert is possible from it',
      baseRow && !('previous' in baseRow.detail));
    const baseOv = setOverride(admin, 'beach', 'baseline-beach', { name: 'Base' });
    const baseOvRow = lastAudit('override_set');
    check('before 033: override_set detail holds exactly item, layer and patch',
      baseOv.ok && keysOf(baseOvRow?.detail) === 'item,layer,patch', keysOf(baseOvRow?.detail));
    // Put the announcement back to the seed so the tests below start clean.
    psql(bin, TEST_DB, ['-c', `update public.site_config set value = '{"enabled": false, "text": "", "tone": "info"}', updated_by = null where key = 'announcement'`]);
    psql(bin, TEST_DB, ['-c', `delete from public.content_overrides`]);

    /* ---- apply 033 --------------------------------------------------- */
    console.log('');
    const m = apply('033_admin_audit_rollback.sql');
    check('033 self-check ran and passed', /admin audit rollback self-check passed/.test(m.err + m.out), (m.err + m.out).trim());

    /* ---- 2. site_config ---------------------------------------------- */
    console.log('');
    console.log('  site_config, an existing key:');
    const orig = configRow('announcement');
    check('the seed announcement row exists', orig !== null);
    const newNotice = { enabled: true, text: 'Broken banner', tone: 'warn' };
    const r1 = setConfig(admin2, 'announcement', newNotice);
    check('set_config returns exactly {ok: true}', r1.ok && same(r1.json, { ok: true }), JSON.stringify(r1));
    check('site_config now holds the new value', same(configRow('announcement')?.value, newNotice));
    const a1 = lastAudit('set_config');
    const d1 = a1.detail;
    check('detail keeps key and value as before', d1.key === 'announcement' && same(d1.value, newNotice), JSON.stringify(d1));
    check('detail names the table', d1.table === 'site_config');
    check('detail.previous.exists is true', d1.previous?.exists === true, JSON.stringify(d1.previous));
    check('detail.previous.value is the original value', same(d1.previous?.value, orig.value), JSON.stringify(d1.previous));
    check('detail.previous carries updatedAt and updatedBy', 'updatedAt' in (d1.previous || {}) && 'updatedBy' in (d1.previous || {}));
    check('detail.new is {exists: true, value: new}', same(d1.new, { exists: true, value: newNotice }), JSON.stringify(d1.new));
    psql(bin, TEST_DB, ['-c', revertConfigSql(a1.id)]);
    const back1 = configRow('announcement');
    check('revert from the audit row alone: site_config matches the original exactly (value, updated_at, updated_by)',
      same(back1, orig), `${JSON.stringify(back1)} vs ${JSON.stringify(orig)}`);

    console.log('');
    console.log('  site_config, a first-time key:');
    check('maintenance has no row yet', configRow('maintenance') === null);
    const maint = { enabled: true, message: 'Down for a bit' };
    const r2 = setConfig(admin, 'maintenance', maint);
    check('set_config on a new key returns {ok: true}', r2.ok && same(r2.json, { ok: true }), JSON.stringify(r2));
    const a2 = lastAudit('set_config');
    check('first-time key: detail.previous is exactly {exists: false}', same(a2.detail.previous, { exists: false }), JSON.stringify(a2.detail.previous));
    check('first-time key: detail.new holds the value', same(a2.detail.new, { exists: true, value: maint }));
    psql(bin, TEST_DB, ['-c', revertConfigSql(a2.id)]);
    check('revert from the audit row alone: the new key is gone again', configRow('maintenance') === null);

    console.log('');
    console.log('  site_config, reverted through the RPC instead of SQL:');
    const featOrig = configRow('features');
    const r3 = setConfig(admin, 'features', { new_map: true });
    const a3 = lastAudit('set_config');
    const r3b = setConfig(admin, 'features', a3.detail.previous.value);
    check('re-saving detail.previous.value through admin_set_config works',
      r3.ok && r3b.ok && same(configRow('features')?.value, featOrig.value), JSON.stringify(configRow('features')));
    const a3b = lastAudit('set_config');
    check('the RPC revert is itself logged, with the broken value as its previous',
      a3b.id > a3.id && same(a3b.detail.previous.value, { new_map: true }), JSON.stringify(a3b.detail));

    /* ---- 3. content_overrides ---------------------------------------- */
    console.log('');
    console.log('  content_overrides, first set, update, clear:');
    const L = 'lake';
    const I = 'lac-test-1';
    check('no override for the item yet', overrideRow(L, I) === null);
    const p1 = { name: 'Lac Correct', hidden: false };
    const o1 = setOverride(admin, L, I, p1, 'photo showed the car park');
    check('override set returns exactly {ok: true}', o1.ok && same(o1.json, { ok: true }), JSON.stringify(o1));
    const b1 = lastAudit('override_set');
    check('first-time override: detail.previous is exactly {exists: false}', same(b1.detail.previous, { exists: false }), JSON.stringify(b1.detail.previous));
    check('first-time override: detail keeps layer, item and patch', b1.detail.layer === L && b1.detail.item === I && same(b1.detail.patch, p1));
    check('first-time override: detail names the table', b1.detail.table === 'content_overrides');
    check('first-time override: detail.new holds patch and note',
      same(b1.detail.new, { exists: true, patch: p1, note: 'photo showed the car park' }), JSON.stringify(b1.detail.new));
    const afterFirst = overrideRow(L, I);

    const p2 = { name: 'Lac Wrong', image: 'https://example.com/bad.jpg' };
    const o2 = setOverride(admin2, L, I, p2, null);
    check('override update returns {ok: true}', o2.ok && same(o2.json, { ok: true }), JSON.stringify(o2));
    const b2 = lastAudit('override_set');
    check('update: detail.previous holds the earlier patch and note',
      b2.detail.previous?.exists === true && same(b2.detail.previous.patch, p1)
      && b2.detail.previous.note === 'photo showed the car park', JSON.stringify(b2.detail.previous));
    check('update: detail.new shows the kept note (null note keeps the old one, as in 018)',
      same(b2.detail.new, { exists: true, patch: p2, note: 'photo showed the car park' }), JSON.stringify(b2.detail.new));
    psql(bin, TEST_DB, ['-c', revertOverrideSql(b2.id)]);
    const back2 = overrideRow(L, I);
    check('revert from the audit row alone: the override matches the earlier row exactly',
      same(back2, afterFirst), `${JSON.stringify(back2)} vs ${JSON.stringify(afterFirst)}`);

    const o3 = setOverride(admin, L, I, {}, null);
    check('empty patch returns exactly {ok: true, cleared: true}', o3.ok && same(o3.json, { ok: true, cleared: true }), JSON.stringify(o3));
    check('empty patch deleted the row', overrideRow(L, I) === null);
    const b3 = lastAudit('override_clear');
    check('clear: detail keeps layer and item', b3.detail.layer === L && b3.detail.item === I);
    check('clear: detail.previous holds the removed row', b3.detail.previous?.exists === true
      && same(b3.detail.previous.patch, p1) && b3.detail.previous.note === 'photo showed the car park', JSON.stringify(b3.detail.previous));
    check('clear: detail.new is exactly {exists: false}', same(b3.detail.new, { exists: false }), JSON.stringify(b3.detail.new));
    psql(bin, TEST_DB, ['-c', revertOverrideSql(b3.id)]);
    const back3 = overrideRow(L, I);
    check('revert of a clear from the audit row alone: the removed row is back exactly',
      same(back3, afterFirst), `${JSON.stringify(back3)} vs ${JSON.stringify(afterFirst)}`);

    psql(bin, TEST_DB, ['-c', revertOverrideSql(b1.id)]);
    check('revert of the first set from its audit row: no override remains', overrideRow(L, I) === null);

    const o4 = setOverride(admin, 'trail', '4242', {}, null);
    const b4 = lastAudit('override_clear');
    check('clearing an item that had no override: still {ok, cleared}, logged with previous {exists: false}',
      o4.ok && same(o4.json, { ok: true, cleared: true }) && same(b4.detail.previous, { exists: false }), JSON.stringify(b4));

    /* ---- 4. everything else unchanged -------------------------------- */
    console.log('');
    console.log('  Unchanged behaviour:');
    const before = auditCount();
    const expectErr = (label, r, word) =>
      check(`${label}: returns error ${word}`, r.ok && same(r.json, { error: word }), JSON.stringify(r));
    expectErr('non-admin set_config', setConfig(plain, 'announcement', newNotice), 'forbidden');
    expectErr('non-admin set_override', setOverride(plain, L, I, p1), 'forbidden');
    expectErr('set_config bad key', setConfig(admin, 'Bad-Key', {}), 'bad_key');
    expectErr('set_config announcement of the wrong shape', setConfig(admin, 'announcement', { enabled: 'yes', text: '', tone: 'info' }), 'bad_value');
    expectErr('set_config announcement tone outside info|warn', setConfig(admin, 'announcement', { enabled: true, text: 'x', tone: 'loud' }), 'bad_value');
    expectErr('set_config features with a non-boolean', setConfig(admin, 'features', { a: 1 }), 'bad_value');
    expectErr('set_config over 16KB', setConfig(admin, 'big_thing', { t: 'x'.repeat(20000) }), 'bad_value');
    expectErr('set_override bad layer', setOverride(admin, 'castle', I, p1), 'bad_layer');
    expectErr('set_override empty item', setOverride(admin, L, '  ', p1), 'bad_item');
    expectErr('set_override unknown patch key', setOverride(admin, L, I, { score: 9 }), 'unknown_key');
    expectErr('set_override http image', setOverride(admin, L, I, { image: 'http://example.com/a.jpg' }), 'bad_image');
    check('refusals wrote no audit row', auditCount() === before, `before ${before}, after ${auditCount()}`);
    check('refusals changed no row', configRow('announcement')?.value?.text === '' && overrideRow(L, I) === null);

    // The tier is whatever the LAST migration this test applied for that
    // function wrote (T065-e). Written as 'read' before, which was true only
    // because the test stops at 033; 034 moves both functions to
    // 'destructive', and an assertion pinned to 'read' would have failed (or
    // been "fixed" the wrong way) the day this test applied 034. Reading the
    // expected tier from the defining file keeps the assertion true to the
    // stack the test builds, whatever that stack is.
    const lastTier = (fname) => {
      for (const file of [...appliedFiles].reverse()) {
        const text = readFileSync(file, 'utf8');
        const at = text.search(new RegExp(`create or replace function public\\.${fname}\\(`, 'i'));
        if (at < 0) continue;
        const m = text.slice(at).match(/admin_guard\('(\w+)'\)/);
        return m ? { tier: m[1], file: file.split(/[\\/]/).pop() } : null;
      }
      return null;
    };
    for (const fn of ['public.admin_set_config(text,jsonb)', 'public.admin_set_override(text,text,jsonb,text)']) {
      const src = scalar(bin, TEST_DB, `select prosrc from pg_proc where oid = '${fn}'::regprocedure`);
      const want = lastTier(fn.slice('public.'.length, fn.indexOf('(')));
      check(`${fn}: guard tier is the one ${want ? want.file : '(no file)'} wrote (${want ? want.tier : '?'})`,
        !!want && src.includes(`admin_guard('${want.tier}')`)
        && (src.match(/admin_guard\('\w+'\)/g) || []).length === 1);
      check(`${fn}: still SECURITY DEFINER, anon cannot execute`,
        scalar(bin, TEST_DB, `select prosecdef from pg_proc where oid = '${fn}'::regprocedure`) === 't'
        && scalar(bin, TEST_DB, `select has_function_privilege('anon', '${fn}', 'execute')`) === 'f');
    }
  } finally {
    if (work) { try { rmSync(work, { recursive: true, force: true }); } catch { /* temp dir */ } }
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
  }
}

console.log('admin_set_config and admin_set_override log previous and new state (migration 033)');
console.log('-----------------------------------------------------------------------------------');

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
  console.log('  SKIPPED. No database was reached, so NOTHING about the audit rollback');
  console.log('  state was tested. This run proves nothing.');
  console.log(`  Reason: ${skipReason}`);
  console.log('');
  console.log('  To run it, point the script at a PostgreSQL server you can write to');
  console.log('  without a password prompt, for example a throwaway trust-auth cluster:');
  console.log('    initdb -D <dir> -U postgres --auth=trust');
  console.log('    pg_ctl -D <dir> -o "-p 55434" start');
  console.log('    PGPORT=55434 node continent-app/scripts/admin/test_admin_audit_rollback.mjs');
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
console.log('All admin audit rollback tests passed.');
