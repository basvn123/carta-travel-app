/**
 * Tests for the AI quota caps: the global daily ceiling and the per-user cap.
 *
 *   node continent-app/scripts/ai/test_global_cap.mjs
 *
 * Two parts, and the second one always runs.
 *
 * PART A runs real SQL. It builds a throwaway database on a local PostgreSQL
 * server, stubs the few Supabase-specific objects the migrations lean on
 * (schema auth, auth.users, auth.uid(), the service_role and authenticated
 * roles), applies 006, 007 and 021 in order, and then drives
 * public.ai_consume() with a tiny global cap to prove the ceiling holds, that
 * the breach reports status global_cap, and that the user's own counter is
 * handed back when it does. It also proves a per-user cap still fires on its
 * own so the two failures stay distinguishable.
 *
 * No later migration redefines ai_consume, ai_usage, ai_daily_total or
 * plan_tiers. 021 does redefine ai_resolve_tier and ai_status, which is why it
 * is in the chain. 014 to 016 only read these objects from admin functions and
 * are out of scope here.
 *
 * PART A needs a reachable server and a password. Set PGPASSWORD (and
 * optionally PGHOST, PGPORT, PGUSER) before running. With no server reachable
 * the part SKIPS loudly and the script still exits 0, but it never reports a
 * skip as a pass.
 *
 * PART B needs no network and no database. It imports the real
 * supabase/functions/_shared/passes.mjs and asserts the contract consume()
 * gives its callers, because that contract is what plan-day/index.ts branches
 * on when it turns a cap into an HTTP 429.
 *
 * The live 429 itself is Deno and is not exercised here. plan-day/index.ts
 * line 340 calls consume(), line 341 diverts a quota_check to 503, and line
 * 342 turns any non-ok status straight into json(429, { code, tier, cap,
 * used }) with nothing between the two that can throw. Confirming that against
 * the deployed function stays user-owned, see _OPEN.md row T036-b.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

/* ===================================================================== */
/* Part A: real SQL against a throwaway database                          */
/* ===================================================================== */

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
const TEST_DB = process.env.CARTA_TEST_DB || 'carta_t036_test';

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

/** Run psql. Throws on a non-zero exit, with stderr attached. */
function psql(bin, db, args) {
  const base = ['-h', PG.host, '-p', PG.port, '-U', PG.user, '-d', db, '-w',
    '-v', 'ON_ERROR_STOP=1'];
  try {
    return execFileSync(bin, [...base, ...args], {
      stdio: 'pipe', encoding: 'utf8',
      env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
    });
  } catch (err) {
    const e = new Error(String(err.stderr || err.message).trim());
    e.psql = true;
    throw e;
  }
}

/** One scalar, trimmed. -At keeps it unaligned and headerless. */
const scalar = (bin, db, sql) => psql(bin, db, ['-At', '-c', sql]).trim();

/**
 * The stubs Supabase provides that a bare Postgres does not. Kept to the
 * minimum the three migrations actually touch: auth.users for the foreign
 * keys, auth.uid() for the RLS policies and the ai_status guard, and the two
 * roles the grant statements name.
 */
const STUBS = `
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key
);

-- Session-settable so a test can pretend to be a signed-in browser. Reading
-- an unset setting must be null, not an error, which is what the second
-- argument to current_setting does.
create or replace function auth.uid()
returns uuid
language sql
stable
as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;

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
`;

const U1 = '00000000-0000-0000-0000-00000000000a';
const U2 = '00000000-0000-0000-0000-00000000000b';
const U3 = '00000000-0000-0000-0000-00000000000c';

function runPartA(bin) {
  let work = null;
  try {
    // A throwaway database, dropped again at the end whatever happens.
    try { psql(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB}`]); } catch { /* fresh box */ }
    psql(bin, 'postgres', ['-c', `create database ${TEST_DB}`]);

    work = mkdtempSync(join(tmpdir(), 'carta-t036-'));
    const stubFile = join(work, 'stubs.sql');
    writeFileSync(stubFile, STUBS, 'utf8');
    psql(bin, TEST_DB, ['-f', stubFile]);

    for (const name of ['006_ai_day_planner.sql', '007_passes.sql', '021_free_tier_once.sql']) {
      const path = resolve(migrations, name);
      // psql reads the file itself, so encoding and size are its problem.
      psql(bin, TEST_DB, ['-f', path]);
      check(`migration applied: ${name}`, true);
    }

    check('ai_consume exists',
      scalar(bin, TEST_DB, "select count(*) from pg_proc where proname = 'ai_consume'") === '1');
    check('ai_daily_total exists',
      scalar(bin, TEST_DB,
        "select count(*) from information_schema.tables where table_schema='public' and table_name='ai_daily_total'") === '1');
    check('free tier allowance is 2 after 021',
      scalar(bin, TEST_DB, "select ai_plans from public.plan_tiers where tier='free'") === '2');

    for (const u of [U1, U2, U3]) {
      psql(bin, TEST_DB, ['-c', `insert into auth.users (id) values ('${u}')`]);
    }

    // ---- the global ceiling, cap 2, three users so no per-user cap fires --
    const consume = (user, kind = 'plan', cap = 2) => JSON.parse(
      scalar(bin, TEST_DB, `select public.ai_consume('${user}'::uuid, '${kind}', ${cap})`),
    );
    const dailyTotal = () => Number(scalar(bin, TEST_DB,
      'select coalesce(n, 0) from public.ai_daily_total where day = current_date'));
    const userUsed = (user, kind = 'plan') => Number(scalar(bin, TEST_DB,
      `select coalesce(sum(n), 0) from public.ai_usage where user_id = '${user}'::uuid and kind = '${kind}'`));

    const first = consume(U1);
    check('global cap: first call is ok', first.status === 'ok', JSON.stringify(first));
    check('global cap: first call reports the free tier', first.tier === 'free', JSON.stringify(first));
    check('global cap: ai_daily_total is 1 after one call', dailyTotal() === 1, `got ${dailyTotal()}`);

    const second = consume(U2);
    check('global cap: second call is ok', second.status === 'ok', JSON.stringify(second));
    check('global cap: ai_daily_total is 2 after two calls', dailyTotal() === 2, `got ${dailyTotal()}`);

    const beforeBreach = userUsed(U3);
    const third = consume(U3);
    check('global cap: the call that breaches the cap returns status global_cap',
      third.status === 'global_cap', JSON.stringify(third));
    check('global cap: the breach still names the tier',
      third.tier === 'free', JSON.stringify(third));
    check('global cap: the breach is not reported as ok',
      third.status !== 'ok' && third.ok !== true, JSON.stringify(third));
    check('global cap: ai_daily_total stays at the cap, it does not overshoot',
      dailyTotal() === 2, `got ${dailyTotal()}`);
    check('global cap: the breaching user keeps their unit, ai_usage rolled back',
      userUsed(U3) === beforeBreach, `before ${beforeBreach}, after ${userUsed(U3)}`);

    // A fourth attempt by a user who already has an ok call must still be
    // refused, so the ceiling is a ceiling and not a per-user quirk.
    const fourth = consume(U1);
    check('global cap: a user with headroom is still refused once the day is full',
      fourth.status === 'global_cap', JSON.stringify(fourth));
    check('global cap: ai_daily_total unchanged by the refused call',
      dailyTotal() === 2, `got ${dailyTotal()}`);
    check('global cap: the refused user keeps the unit they did not spend',
      userUsed(U1) === 1, `got ${userUsed(U1)}`);

    // ---- the per-user cap, with a generous global cap so the two differ ----
    // The free tier allows 2 plans (021). U2 has spent 1, so one more is ok
    // and the one after that must be user_cap, not global_cap.
    const u2a = consume(U2, 'plan', 1000);
    check('user cap: a call inside the allowance is ok', u2a.status === 'ok', JSON.stringify(u2a));
    check('user cap: ok reports the allowance left', u2a.left === 0 && u2a.cap === 2, JSON.stringify(u2a));
    const u2b = consume(U2, 'plan', 1000);
    check('user cap: exceeding the free allowance returns status user_cap',
      u2b.status === 'user_cap', JSON.stringify(u2b));
    check('user cap: user_cap is distinct from global_cap under a generous global cap',
      u2b.status !== 'global_cap', JSON.stringify(u2b));
    check('user cap: user_cap reports nothing left', u2b.left === 0, JSON.stringify(u2b));
    check('user cap: the refused call did not raise ai_usage past the cap',
      userUsed(U2) === 2, `got ${userUsed(U2)}`);

    // A zero allowance never reaches the ledger at all: free gets no grounded
    // search, so it must be user_cap even with an empty daily total.
    const ground = consume(U3, 'ground', 1000);
    check('user cap: a zero allowance surface is refused as user_cap',
      ground.status === 'user_cap', JSON.stringify(ground));
    check('user cap: a zero allowance never writes to ai_usage',
      userUsed(U3, 'ground') === 0, `got ${userUsed(U3, 'ground')}`);

    // A bad kind is neither a cap nor a crash.
    const bad = consume(U1, 'nonsense', 1000);
    check('ai_consume rejects an unknown kind without throwing',
      bad.status === 'bad_kind', JSON.stringify(bad));

    return true;
  } finally {
    if (work) { try { rmSync(work, { recursive: true, force: true }); } catch { /* temp dir */ } }
    try { psql(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]); } catch { /* left behind */ }
  }
}

console.log('PART A: ai_consume against a throwaway PostgreSQL database');
console.log('----------------------------------------------------------');

let partASkipped = false;
let skipReason = '';
const bin = findPsql();
if (!bin) {
  partASkipped = true;
  skipReason = 'psql was not found on PATH or at a standard PostgreSQL install path.';
} else {
  try {
    psql(bin, 'postgres', ['-At', '-c', 'select 1']);
  } catch (err) {
    partASkipped = true;
    skipReason = `could not connect to ${PG.user}@${PG.host}:${PG.port}. ${err.message}`;
  }
}

if (partASkipped) {
  console.log('');
  console.log('  SKIPPED. Part A did not run, so nothing about the global cap was proved here.');
  console.log(`  Reason: ${skipReason}`);
  console.log('');
  console.log('  To run it, point the script at a PostgreSQL server you can write to:');
  console.log('    PGPASSWORD=<password> PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres \\');
  console.log('      node continent-app/scripts/ai/test_global_cap.mjs');
  console.log('');
  console.log('  It creates and drops a database named carta_t036_test. It never touches');
  console.log('  the live Supabase project.');
  console.log('');
} else {
  try {
    runPartA(bin);
  } catch (err) {
    failures += 1;
    console.error(`FAIL  Part A aborted: ${err.message}`);
  }
}

/* ===================================================================== */
/* Part B: the consume() contract, no network                             */
/* ===================================================================== */

console.log('');
console.log('PART B: the consume() contract in _shared/passes.mjs');
console.log('----------------------------------------------------');

const passesPath = resolve(repoRoot, 'supabase/functions/_shared/passes.mjs');
const { consume, refund, resolveTier, TIERS, PAID_TIERS } =
  await import(pathToFileURL(passesPath).href);

const clientReturning = (result) => {
  const calls = [];
  return {
    calls,
    rpc: async (fn, args) => { calls.push({ fn, args }); return result; },
  };
};

// A global cap must survive the helper unchanged, because plan-day copies the
// status straight into the 429 body as `code`.
const capClient = clientReturning({ data: { status: 'global_cap', tier: 'free' }, error: null });
const capped = await consume(capClient, U1, 'plan', 2);
check('consume: passes the status through unchanged', capped.status === 'global_cap', JSON.stringify(capped));
check('consume: a global cap is not ok', capped.ok === false, JSON.stringify(capped));
check('consume: the tier survives for the 429 body', capped.tier === 'free', JSON.stringify(capped));
check('consume: calls the ai_consume RPC', capClient.calls[0].fn === 'ai_consume');
check('consume: forwards the global cap argument', capClient.calls[0].args.p_global_cap === 2);
check('consume: forwards the user and the kind',
  capClient.calls[0].args.p_user === U1 && capClient.calls[0].args.p_kind === 'plan');

const userCapped = await consume(
  clientReturning({ data: { status: 'user_cap', tier: 'free', cap: 2, used: 2, left: 0 }, error: null }),
  U1, 'plan', 200,
);
check('consume: a user cap is not ok either', userCapped.ok === false, JSON.stringify(userCapped));
check('consume: a user cap keeps cap and used for the 429 body',
  userCapped.cap === 2 && userCapped.used === 2, JSON.stringify(userCapped));

const granted = await consume(
  clientReturning({ data: { status: 'ok', tier: 'trip', cap: 60, used: 1, left: 59 }, error: null }),
  U1, 'plan', 200,
);
check('consume: only status ok is ok', granted.ok === true, JSON.stringify(granted));
check('consume: a grant keeps its counters', granted.left === 59, JSON.stringify(granted));

// An RPC error is not a cap. It must become its own status so plan-day can
// answer 503 rather than tell a traveller their allowance is spent.
const errored = await consume(
  clientReturning({ data: null, error: { message: 'connection reset' } }),
  U1, 'plan', 200,
);
check('consume: an RPC error returns status quota_check', errored.status === 'quota_check', JSON.stringify(errored));
check('consume: an RPC error is not ok', errored.ok === false, JSON.stringify(errored));
check('consume: an RPC error falls back to the free tier', errored.tier === 'free', JSON.stringify(errored));
check('consume: an RPC error never reports a cap status',
  errored.status !== 'global_cap' && errored.status !== 'user_cap', JSON.stringify(errored));

// A null data row with no error must not be mistaken for a grant.
const empty = await consume(clientReturning({ data: null, error: null }), U1, 'plan', 200);
check('consume: an empty result is not a grant', empty.ok === false, JSON.stringify(empty));

// refund is best effort: a throwing client must not take the caller down.
let refundThrew = false;
try {
  await refund({ rpc: async () => { throw new Error('down'); } }, U1, 'plan');
} catch { refundThrew = true; }
check('refund: swallows its own failure', refundThrew === false);

const tier = await resolveTier(clientReturning({ data: { error: 'forbidden' }, error: null }), U1);
check('resolveTier: a forbidden answer becomes null', tier === null, JSON.stringify(tier));

check('tiers: free, trip, year in order', TIERS.join() === 'free,trip,year');
check('tiers: only trip and year are buyable', PAID_TIERS.join() === 'trip,year');

// The 429 mapping itself is Deno and is not run here. Assert instead that the
// source still reads the way the report describes it, so a refactor that moves
// the 429 cannot pass this test silently.
const planDay = readFileSync(resolve(repoRoot, 'supabase/functions/plan-day/index.ts'), 'utf8');
check('plan-day: still diverts quota_check to 503',
  /quota\.status === 'quota_check'\) return json\(503/.test(planDay));
check('plan-day: still turns a non-ok quota into 429',
  /if \(!quota\.ok\) \{\s*return json\(429, \{\s*code: quota\.status/.test(planDay));

/* ===================================================================== */

console.log('');
console.log(`${checks} assertions, ${checks - failures} passing, ${failures} failing.`);
if (partASkipped) {
  console.log('Part A SKIPPED: the global cap was NOT exercised against real SQL.');
}
if (failures) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log(partASkipped
  ? 'Part B passed. Part A was skipped, so this run does not prove the cap.'
  : 'All quota cap tests passed.');
