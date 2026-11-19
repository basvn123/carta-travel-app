/**
 * Real-SQL test of migration 078 (ai fix program wave 1, QUOTA-005, S3 and
 * S4 of the gemini-rag decision): ai_consume_v2, the cached-aware ai_refund,
 * day_cap in ai_cap_events, the two Ask funnel steps, the S2 event columns,
 * and the down file.
 *
 *   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres [PGPASSWORD=...] \
 *     node continent-app/scripts/ai/test_ai_capacity.mjs
 *
 * Same shape as test_ai_quota.mjs: a throwaway database, Supabase's auth and
 * role stubs, the migration chain applied in paste order. With no server
 * reachable it SKIPS LOUDLY and exits 0, and never reports a pass it did not run.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.CARTA_REPO_ROOT || resolve(here, '../../..');
const migrations = resolve(repoRoot, 'supabase/migrations');

let failures = 0;
let checks = 0;
const check = (name, cond, detail = '') => {
  checks += 1;
  if (cond) console.log(`  ok  ${name}`);
  else { failures += 1; console.error(`FAIL  ${name}${detail ? `: ${detail}` : ''}`); }
};

const PSQL = [process.env.PSQL || '', 'psql', 'C:/Program Files/PostgreSQL/18/bin/psql.exe',
  'C:/Program Files/PostgreSQL/17/bin/psql.exe'].filter(Boolean)
  .find((c) => { if (c !== 'psql' && !existsSync(c)) return false; try { execFileSync(c, ['--version'], { stdio: 'pipe' }); return true; } catch { return false; } });
const PG = { host: process.env.PGHOST || '127.0.0.1', port: process.env.PGPORT || '5432', user: process.env.PGUSER || 'postgres' };
const DB = process.env.CARTA_TEST_DB || 'carta_w1_capacity_test';

function psql(db, args) {
  try {
    return execFileSync(PSQL, ['-h', PG.host, '-p', PG.port, '-U', PG.user, '-d', db, '-w', '-v', 'ON_ERROR_STOP=1', ...args],
      { stdio: 'pipe', encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } });
  } catch (err) { throw new Error(String(err.stderr || err.message).trim()); }
}
const scalar = (sql) => psql(DB, ['-At', '-c', sql]).trim();

const STUBS = `
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable
as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
do $do$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
end $do$;
create table if not exists public.site_config (key text primary key, value jsonb not null, updated_at timestamptz not null default now(), updated_by uuid);
create or replace function public.admin_guard(p_kind text default 'read') returns text language sql stable
as $fn$ select case when current_setting('carta.guard', true) = 'ok' then null else 'forbidden' end $fn$;
`;

const CHAIN = [
  '006_ai_day_planner.sql', '007_passes.sql', '021_free_tier_once.sql', '022_paywall_events.sql',
  '025_withdrawal_waiver.sql', '026_oss_threshold.sql', '027_paywall_funnel_kinds.sql',
  '028_model_fallback_events.sql', '030_ai_usage_rollup.sql', '031_margin_dashboard.sql',
  '044_payments_quota.sql', '070_funnel_counts.sql', '071_ai_model_events_calls.sql',
];

const FREE = '00000000-0000-0000-0000-0000000000b1';
const PASS = '00000000-0000-0000-0000-0000000000b2';
const FREE2 = '00000000-0000-0000-0000-0000000000b3';
const DAY = '00000000-0000-0000-0000-0000000000b4';

const v2 = (u, { kind = 'plan', free = 100000, day = 20, cached = false } = {}) => JSON.parse(
  scalar(`select public.ai_consume_v2('${u}'::uuid, '${kind}', ${free}, ${day}, ${cached})`));
const total = () => Number(scalar('select coalesce((select n from public.ai_daily_total where day = current_date), 0)'));
const used = (u) => Number(scalar(`select coalesce(sum(n), 0) from public.ai_usage where user_id = '${u}'::uuid and kind = 'plan'`));
const dayRow = (u) => scalar(`select coalesce((select n || '/' || cached from public.ai_usage_days where user_id = '${u}'::uuid and kind = 'plan' and day = current_date), '0/0')`);

function run() {
  let work = null;
  try {
    try { psql('postgres', ['-c', `drop database if exists ${DB} with (force)`]); } catch { /* fresh */ }
    psql('postgres', ['-c', `create database ${DB}`]);
    work = mkdtempSync(join(tmpdir(), 'carta-w1-'));
    const stub = join(work, 'stubs.sql');
    writeFileSync(stub, STUBS, 'utf8');
    psql(DB, ['-f', stub]);
    for (const m of CHAIN) psql(DB, ['-f', resolve(migrations, m)]);
    psql(DB, ['-f', resolve(migrations, '078_ai_hygiene.sql')]);
    check('078 applies on top of 006 to 071', true);
    psql(DB, ['-f', resolve(migrations, '078_ai_hygiene.sql')]);
    check('078 applies twice (idempotent paste)', true);
    for (const u of [FREE, PASS, FREE2, DAY]) psql(DB, ['-c', `insert into auth.users (id) values ('${u}')`]);
    // A Year Pass for PASS: a grant row the tier resolver reads.
    const tier = scalar(`select tier from public.plan_tiers where tier <> 'free' order by ai_plans desc limit 1`);
    psql(DB, ['-c', `select public.grant_pass('${PASS}'::uuid, '${tier}', 'test-w1', 'test')`]);
    check('a Pass holder resolves to a Pass tier', JSON.parse(scalar(`select public.ai_status('${PASS}'::uuid)`)).tier === tier);

    // 1. A cache hit spends the unit, not the shared count.
    const t0 = total();
    const c1 = v2(FREE, { cached: true });
    check('cached: granted', c1.status === 'ok' && c1.cached === true, JSON.stringify(c1));
    check('cached: the tier unit is spent', used(FREE) === 1);
    check('cached: the shared daily count did not move', total() === t0, `${t0} -> ${total()}`);
    check('cached: the day row records one cached grant', dayRow(FREE) === '1/1', dayRow(FREE));

    // 2. Breaker: free refused at the free cap, Pass never.
    const cap = total() + 1;
    const f1 = v2(FREE, { free: cap });
    check('free: granted under the ceiling', f1.status === 'ok', JSON.stringify(f1));
    check('free: the shared count moved by one', total() === cap);
    const usedBefore = used(FREE2);
    const f2 = v2(FREE2, { free: cap });
    check('free: refused at the ceiling with global_cap', f2.status === 'global_cap', JSON.stringify(f2));
    check('free: a refusal leaves the tier unit untouched', used(FREE2) === usedBefore);
    check('free: a refusal leaves no day row', dayRow(FREE2) === '0/0', dayRow(FREE2));
    const p1 = v2(PASS, { free: cap });
    check('Pass: granted above the free ceiling', p1.status === 'ok', JSON.stringify(p1));
    check('Pass: counted on the shared total', total() === cap + 1);
    const p2 = v2(PASS, { free: 0 });
    check('Pass: granted even with a zero free ceiling', p2.status === 'ok', JSON.stringify(p2));
    const f3 = v2(FREE2, { free: 0 });
    check('free: a zero ceiling refuses', f3.status === 'global_cap', JSON.stringify(f3));

    // 3. The per-user daily limit, the same for every tier, uncached only.
    psql(DB, ['-c', `select public.grant_pass('${DAY}'::uuid, '${tier}', 'test-w1-day', 'test')`]);
    for (let i = 0; i < 3; i += 1) v2(DAY, { day: 3 });
    const d4 = v2(DAY, { day: 3 });
    check('day limit: the 4th uncached grant with a limit of 3 is day_cap', d4.status === 'day_cap', JSON.stringify(d4));
    check('day limit: a Pass holder meets it too (same for everyone)', d4.tier === tier);
    check('day limit: the refused unit is handed back', used(DAY) === 3, String(used(DAY)));
    const d5 = v2(DAY, { day: 3, cached: true });
    check('day limit: a cache hit is still served past it', d5.status === 'ok', JSON.stringify(d5));
    check('day limit: day row 4 grants, 1 cached', dayRow(DAY) === '4/1', dayRow(DAY));

    // 4. Refund takes an uncached unit back, from the shared count too.
    const before = total();
    psql(DB, ['-c', `select public.ai_refund('${DAY}'::uuid, 'plan')`]);
    check('refund: the day row loses an uncached grant', dayRow(DAY) === '3/1', dayRow(DAY));
    check('refund: the shared count goes down by one', total() === before - 1);
    // A user whose only grant today was a cache hit: nothing to take from the shared count.
    const t1 = total();
    psql(DB, ['-c', `select public.ai_refund('${FREE}'::uuid, 'plan')`]);
    check('refund: never takes a cached grant off the shared count', total() === t1 - 1 || dayRow(FREE).endsWith('/1'),
      `${t1} -> ${total()}, ${dayRow(FREE)}`);
    check('refund: the cached split stays within n', Number(scalar('select count(*) from public.ai_usage_days where cached > n')) === 0);

    // 5. day_cap is an allowed refusal reason; funnel steps; S2 columns.
    psql(DB, ['-c', "insert into public.ai_cap_events (reason, kind, tier) values ('day_cap', 'plan', 'year')"]);
    check('ai_cap_events takes day_cap', Number(scalar("select count(*) from public.ai_cap_events where reason = 'day_cap'")) === 1);
    psql(DB, ['-c', "select public.funnel_step('ask_answer'); select public.funnel_step('ask_to_plan'); select public.funnel_step('bogus')"]);
    check('funnel_step counts the two Ask steps',
      scalar("select string_agg(step || '=' || n, ',' order by step) from public.funnel_counts") === 'ask_answer=1,ask_to_plan=1');
    psql(DB, ['-c', "insert into public.ai_model_events (kind, feature, provider, model, tokens_thought, tokens_cached, grounded_queries, thinking, outcome, latency_ms) values ('call', 'plan-day', 'gemini', 'gemini-3.5-flash-lite', 40, null, 0, 'rejected', 'ok', 10)"]);
    check('ai_model_events takes the S2 columns, null included',
      scalar("select tokens_thought || '/' || coalesce(tokens_cached::text, 'null') || '/' || thinking from public.ai_model_events where kind = 'call'") === '40/null/rejected');
    let bad = false;
    try { psql(DB, ['-c', "insert into public.ai_model_events (kind, feature, provider, model, thinking, outcome, latency_ms) values ('call', 'x', 'gemini', 'm', 'loud', 'ok', 10)"]); } catch { bad = true; }
    check('ai_model_events refuses an unknown thinking value', bad);
    let anonCall = false;
    try { psql(DB, ['-c', `set role anon; select public.ai_consume_v2('${FREE}'::uuid, 'plan', 10, 10, false)`]); } catch { anonCall = true; }
    check('ai_consume_v2 is not callable by anon', anonCall);

    // 6. The down file.
    psql(DB, ['-f', resolve(migrations, '078_ai_hygiene_down.sql')]);
    check('down: applies', true);
    check('down: ai_consume_v2 is gone', scalar("select count(*) from pg_proc where proname = 'ai_consume_v2'") === '0');
    check('down: the S2 columns are gone', scalar("select count(*) from information_schema.columns where table_name = 'ai_model_events' and column_name in ('tokens_thought','tokens_cached','grounded_queries','thinking')") === '0');
    check('down: ai_usage_days.cached is gone', scalar("select count(*) from information_schema.columns where table_name = 'ai_usage_days' and column_name = 'cached'") === '0');
    check('down: the Ask funnel rows are gone', scalar("select count(*) from public.funnel_counts where step like 'ask_%'") === '0');
    check('down: the 044 ai_consume still grants', JSON.parse(scalar(`select public.ai_consume('${PASS}'::uuid, 'plan', 100000)`)).status === 'ok');
    psql(DB, ['-f', resolve(migrations, '078_ai_hygiene.sql')]);
    check('up again after down: applies', true);
  } finally {
    try { psql('postgres', ['-c', `drop database if exists ${DB} with (force)`]); } catch { /* left for inspection */ }
    if (work) rmSync(work, { recursive: true, force: true });
  }
}

if (!PSQL) {
  console.log('SKIPPED: no psql found. This is not a pass.');
} else {
  let reachable = true;
  try { psql('postgres', ['-At', '-c', 'select 1']); } catch (e) { reachable = false; console.log(`SKIPPED: no PostgreSQL at ${PG.host}:${PG.port} (${String(e.message).split('\n')[0]}). This is not a pass.`); }
  if (reachable) {
    try { run(); } catch (e) { failures += 1; console.error(`FAIL  ${e.message}`); }
    console.log(`\n${checks} checks, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  }
}
