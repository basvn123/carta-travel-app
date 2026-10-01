/**
 * Tests for ai_consume, ai_refund and the separation of the grounded counter.
 *
 *   node continent-app/scripts/ai/test_ai_quota.mjs
 *
 * WHY THIS EXISTS. Three claims hold the AI cost ceiling up and none of them
 * was tested before T037.
 *
 *   1. ai_consume grants ONLY when status is 'ok'. passes.mjs says so in a
 *      comment: "a caller that treats a cap as success will hand out free
 *      generations". A comment does not enforce anything.
 *   2. ai_refund gives back exactly one unit when the AI call fails after
 *      quota was spent, and never mints credit by going below zero.
 *   3. A grounded generation decrements the 'ground' counter and leaves
 *      'plan' alone. This is the one that matters financially. Grounded
 *      search is the only Gemini surface Google meters per query, and on
 *      Gemini 3 a single grounded generation bills per search the model
 *      chooses to run. If it rode on the 'plan' counter, the expensive
 *      surface would be metered by the cheap one's ceiling.
 *
 * It also pins the free tier: 2 lifetime plans against the fixed epoch that
 * migration 021 introduced, not 2 per month. The test proves that by spending
 * a unit, moving the wall clock on 31 days, and showing the next spend still
 * counts against the same two.
 *
 * THREE PARTS.
 *
 * PART A runs real SQL against a throwaway PostgreSQL database, in the same
 * way test_global_cap.mjs (T036) does: it stubs schema auth, auth.users,
 * auth.uid(), the Supabase roles, site_config and admin_guard, applies
 * migrations 006, 007, 021, 022, 025, 026, 027, 031 and 044 in order, then
 * drives the functions through psql. 044 (T265) redefines ai_consume and
 * ai_refund around the ai_usage_days ledger and needs the five before it,
 * which is why the chain is this long; 021 redefines ai_resolve_tier and
 * ai_status. The refund cross-day group below is the one 044 changed: it
 * used to pin the T037-c bug and now proves the fix.
 *
 * PART A needs a reachable server and a password. Set PGPASSWORD (and
 * optionally PGHOST, PGPORT, PGUSER) before running. With no server reachable
 * the part SKIPS LOUDLY and this script still exits 0, but it never reports a
 * skip as a pass.
 *
 * PART B imports the real supabase/functions/_shared/passes.mjs with a stub
 * Supabase client and asserts the consume()/refund() contract: what ok means,
 * that the kind is forwarded unchanged, and that a refund failure is
 * swallowed.
 *
 * PART C is a SOURCE PATTERN CHECK, not an execution test. The Edge Functions
 * are Deno and are not run here. For every call site of consume() under
 * supabase/functions, Part C reads the source and asserts that the result's
 * ok or status is branched on before the Gemini fetch, and that plan-day's
 * grounded path asks for kind 'ground'. A pattern check cannot prove runtime
 * behaviour; it can prove that a refactor which removes the branch does not
 * pass this file silently, which is the failure mode worth catching.
 *
 * It never touches the live Supabase project. Part A creates and drops a
 * database named carta_t037_test.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
// The root checkout holds supabase/. In the main checkout it is the parent of
// continent-app/; in a worktree pair the two are siblings, so it can be named.
const repoRoot = process.env.CARTA_REPO_ROOT || resolve(here, '../../..');
const migrations = resolve(repoRoot, 'supabase/migrations');
const functionsDir = resolve(repoRoot, 'supabase/functions');

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
const TEST_DB = process.env.CARTA_TEST_DB || 'carta_t037_test';

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
 * The stubs Supabase provides that a bare Postgres does not: auth.users for
 * the foreign keys, auth.uid() for the RLS policies and the ai_status guard,
 * and the roles the grant statements name.
 */
const STUBS = `
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key
);

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

-- 022, 026, 027, 031 and 044 are guarded by admin_guard (015) and 031 reads
-- site_config (014). Neither admin migration is in the chain, so the two are
-- stubbed: the guard says forbidden unless the session sets carta.guard to
-- ok, which is enough to prove both the refusal and the answer.
create table if not exists public.site_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create or replace function public.admin_guard(p_kind text default 'read')
returns text
language sql
stable
as $fn$ select case when current_setting('carta.guard', true) = 'ok' then null else 'forbidden' end $fn$;
`;

/** The chain, in paste order. 044 refuses to apply without the ones before it. */
const CHAIN = [
  '006_ai_day_planner.sql', '007_passes.sql', '021_free_tier_once.sql',
  '022_paywall_events.sql', '025_withdrawal_waiver.sql', '026_oss_threshold.sql',
  '027_paywall_funnel_kinds.sql', '031_margin_dashboard.sql', '044_payments_quota.sql',
];

const U1 = '00000000-0000-0000-0000-0000000000a1'; // free tier, grant and cap
const U2 = '00000000-0000-0000-0000-0000000000a2'; // refund arithmetic
const U3 = '00000000-0000-0000-0000-0000000000a3'; // plan and ground separation
const U4 = '00000000-0000-0000-0000-0000000000a4'; // the free epoch over time

const BIG = 100000; // a global cap big enough never to be the reason for a refusal

function runPartA(bin) {
  let work = null;
  try {
    try { psql(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]); } catch { /* fresh box */ }
    psql(bin, 'postgres', ['-c', `create database ${TEST_DB}`]);

    work = mkdtempSync(join(tmpdir(), 'carta-t037-'));
    const stubFile = join(work, 'stubs.sql');
    writeFileSync(stubFile, STUBS, 'utf8');
    psql(bin, TEST_DB, ['-f', stubFile]);

    for (const name of CHAIN) {
      psql(bin, TEST_DB, ['-f', resolve(migrations, name)]);
      check(`migration applied: ${name}`, true);
    }

    for (const u of [U1, U2, U3, U4]) {
      psql(bin, TEST_DB, ['-c', `insert into auth.users (id) values ('${u}')`]);
    }

    const consume = (user, kind = 'plan', cap = BIG) => JSON.parse(
      scalar(bin, TEST_DB, `select public.ai_consume('${user}'::uuid, '${kind}', ${cap})`),
    );
    const refund = (user, kind = 'plan') =>
      psql(bin, TEST_DB, ['-c', `select public.ai_refund('${user}'::uuid, '${kind}')`]);
    /** The ledger row for a user and kind, summed across periods. */
    const used = (user, kind) => Number(scalar(bin, TEST_DB,
      `select coalesce(sum(n), 0) from public.ai_usage where user_id = '${user}'::uuid and kind = '${kind}'`));
    /** The ledger row for one explicit period, which is what the epoch test needs. */
    const usedIn = (user, kind, period) => Number(scalar(bin, TEST_DB,
      `select coalesce(n, 0) from public.ai_usage where user_id = '${user}'::uuid`
      + ` and kind = '${kind}' and period_start = date '${period}'`));
    const periodRows = (user) => Number(scalar(bin, TEST_DB,
      `select count(distinct period_start) from public.ai_usage where user_id = '${user}'::uuid`));
    const dailyTotal = () => Number(scalar(bin, TEST_DB,
      'select coalesce(n, 0) from public.ai_daily_total where day = current_date'));
    const dailyTotalOn = (offset) => Number(scalar(bin, TEST_DB,
      `select coalesce((select n from public.ai_daily_total where day = current_date + ${offset}), 0)`));
    /** The 044 day ledger for a user and kind on a given day offset. */
    const dayUnits = (user, kind, offset = 0) => Number(scalar(bin, TEST_DB,
      `select coalesce((select n from public.ai_usage_days where user_id = '${user}'::uuid`
      + ` and kind = '${kind}' and day = current_date + ${offset}), 0)`));
    const status = (user) => JSON.parse(
      scalar(bin, TEST_DB, `select public.ai_status('${user}'::uuid)`));

    /* ---- 1. grant only on ok --------------------------------------- */
    // The free tier is 2 plans (021). The first two spends must be grants and
    // must say so with status 'ok'; the third must not.
    const g1 = consume(U1, 'plan');
    check('grant: the first free plan returns status ok', g1.status === 'ok', JSON.stringify(g1));
    check('grant: a grant reports the tier that granted it', g1.tier === 'free', JSON.stringify(g1));
    check('grant: a grant reports the cap it spent against', g1.cap === 2, JSON.stringify(g1));
    check('grant: a grant reports used 1 and left 1', g1.used === 1 && g1.left === 1, JSON.stringify(g1));
    check('grant: the ledger records exactly one unit', used(U1, 'plan') === 1, `got ${used(U1, 'plan')}`);

    const g2 = consume(U1, 'plan');
    check('grant: the second free plan is still ok', g2.status === 'ok', JSON.stringify(g2));
    check('grant: the second grant reports nothing left', g2.left === 0, JSON.stringify(g2));

    /* ---- 2. a cap rejection cannot hand out a free generation ------- */
    // This is the claim passes.mjs warns about in prose. The value of the
    // assertion is not that 'user_cap' is not the string 'ok'; it is that the
    // refused call leaves BOTH counters exactly where they were, so a caller
    // that ignored the status would be spending something nobody paid for.
    const beforeUsage = used(U1, 'plan');
    const beforeDaily = dailyTotal();
    const rej = consume(U1, 'plan');
    check('cap reject: a third free plan returns status user_cap',
      rej.status === 'user_cap', JSON.stringify(rej));
    check('cap reject: the refusal is not status ok', rej.status !== 'ok', JSON.stringify(rej));
    check('cap reject: the refusal reports nothing left', rej.left === 0, JSON.stringify(rej));
    check('cap reject: ai_usage did not move',
      used(U1, 'plan') === beforeUsage, `before ${beforeUsage}, after ${used(U1, 'plan')}`);
    check('cap reject: ai_usage never exceeds the cap',
      used(U1, 'plan') === 2, `got ${used(U1, 'plan')}`);
    check('cap reject: ai_daily_total did not move',
      dailyTotal() === beforeDaily, `before ${beforeDaily}, after ${dailyTotal()}`);

    // The same thing at the global ceiling, where the user still has headroom.
    // A global refusal must also leave the user's own counter untouched: they
    // must not pay for our shared ceiling. (T036 proves the ceiling itself;
    // what is asserted here is that the refusal is not a covert grant.)
    const beforeGlobalUser = used(U2, 'plan');
    const gRej = consume(U2, 'plan', 0);
    check('cap reject: a global cap of 0 refuses with status global_cap',
      gRej.status === 'global_cap', JSON.stringify(gRej));
    check('cap reject: a global refusal is not status ok', gRej.status !== 'ok', JSON.stringify(gRej));
    check('cap reject: a global refusal leaves the user ledger untouched',
      used(U2, 'plan') === beforeGlobalUser,
      `before ${beforeGlobalUser}, after ${used(U2, 'plan')}`);

    /* ---- 3. ai_refund returns exactly one unit, and floors at zero --- */
    // U2 still has both free units. Spend one, refund it, and the ledger must
    // be back where it started. The daily total must come back too, or an
    // outage would eat the shared ceiling for everyone.
    const r0Daily = dailyTotal();
    const rSpend = consume(U2, 'plan');
    check('refund: the spend being refunded was a grant', rSpend.status === 'ok', JSON.stringify(rSpend));
    check('refund: the spend raised ai_usage to 1', used(U2, 'plan') === 1, `got ${used(U2, 'plan')}`);
    check('refund: the spend raised ai_daily_total by 1',
      dailyTotal() === r0Daily + 1, `got ${dailyTotal()}`);

    refund(U2, 'plan');
    check('refund: exactly one unit comes back from ai_usage',
      used(U2, 'plan') === 0, `got ${used(U2, 'plan')}`);
    check('refund: exactly one unit comes back from ai_daily_total',
      dailyTotal() === r0Daily, `got ${dailyTotal()}`);

    // A refund of an unspent unit must not mint credit. greatest(0, n-1) is
    // what stops a double refund from turning into a free generation.
    refund(U2, 'plan');
    refund(U2, 'plan');
    check('refund: a double refund never drives ai_usage below zero',
      used(U2, 'plan') === 0, `got ${used(U2, 'plan')}`);
    const afterDouble = dailyTotal();
    check('refund: a double refund never drives ai_daily_total below zero',
      afterDouble >= 0, `got ${afterDouble}`);

    // THE CROSS-DAY REFUND, fixed by 044 (this used to pin T037-c as a known
    // bug). ai_consume now writes a (user, day, kind) row in ai_usage_days
    // once the grant is final, and ai_refund takes the unit off the user's
    // latest day row that still holds one, and off the shared counter for
    // THAT day. So a unit spent before midnight and refunded after it comes
    // out of yesterday's ceiling, where it was added, and today's is left
    // alone.
    //
    // Simulated by moving the spend's day row and its shared-counter unit to
    // yesterday, then setting today's counter to a number the refund must
    // not touch.
    const spendDay = consume(U2, 'plan');
    check('refund cross-day: a spend to reverse was granted', spendDay.status === 'ok');
    check('refund cross-day: the spend wrote a day row for today',
      dayUnits(U2, 'plan', 0) === 1, `got ${dayUnits(U2, 'plan', 0)}`);
    const dayBefore = dailyTotal();
    psql(bin, TEST_DB, ['-c',
      `update public.ai_usage_days set day = current_date - 1`
      + ` where user_id = '${U2}'::uuid and kind = 'plan' and day = current_date`]);
    psql(bin, TEST_DB, ['-c',
      'insert into public.ai_daily_total (day, n) values (current_date - 1, 1)'
      + ' on conflict (day) do update set n = public.ai_daily_total.n + 1']);
    psql(bin, TEST_DB, ['-c',
      'update public.ai_daily_total set n = 7 where day = current_date']);
    refund(U2, 'plan');
    check('refund cross-day: the unit comes off the day it was spent on',
      dailyTotalOn(-1) === 0, `expected yesterday at 0, got ${dailyTotalOn(-1)}`);
    check('refund cross-day: the day row it was spent on is back at zero',
      dayUnits(U2, 'plan', -1) === 0, `got ${dayUnits(U2, 'plan', -1)}`);
    check('refund cross-day: today\'s shared counter is not touched',
      dailyTotal() === 7, `expected 7, got ${dailyTotal()}`);
    check('refund cross-day: the user ledger is unaffected by the day question',
      used(U2, 'plan') === 0, `got ${used(U2, 'plan')}`);
    // A refund with no day row anywhere returns the period unit only and
    // leaves every shared counter alone, which is the honest move when the
    // day is unknown (a spend from before 044).
    psql(bin, TEST_DB, ['-c',
      `insert into public.ai_usage (user_id, period_start, kind, n)`
      + ` values ('${U2}'::uuid, public.ai_free_epoch(), 'plan', 1)`
      + ` on conflict (user_id, period_start, kind) do update set n = 1`]);
    refund(U2, 'plan');
    check('refund cross-day: a spend with no day row refunds the period unit',
      used(U2, 'plan') === 0, `got ${used(U2, 'plan')}`);
    check('refund cross-day: and leaves the shared counter alone',
      dailyTotal() === 7, `expected 7, got ${dailyTotal()}`);
    // Put the shared counter back so the later free-epoch checks are not read
    // against a number this simulation invented.
    psql(bin, TEST_DB, ['-c',
      `update public.ai_daily_total set n = ${dayBefore - 1} where day = current_date`]);
    psql(bin, TEST_DB, ['-c', 'delete from public.ai_daily_total where day = current_date - 1']);

    // And the refunded unit is genuinely available again: the whole point.
    const reSpend1 = consume(U2, 'plan');
    const reSpend2 = consume(U2, 'plan');
    check('refund: the refunded allowance is spendable again',
      reSpend1.status === 'ok' && reSpend2.status === 'ok',
      `${JSON.stringify(reSpend1)} / ${JSON.stringify(reSpend2)}`);
    check('refund: and the cap still bites after it',
      consume(U2, 'plan').status === 'user_cap');

    // A refund with a kind the ledger does not know is a no-op, not a crash.
    const beforeBad = used(U2, 'plan');
    refund(U2, 'nonsense');
    check('refund: an unknown kind is a silent no-op',
      used(U2, 'plan') === beforeBad, `got ${used(U2, 'plan')}`);

    /* ---- 4. plan and ground are separate counters -------------------- */
    // The free tier has 0 grounded, so a grounded test needs a paid tier. A
    // Trip Pass is 60 plans and 40 grounded, which makes the two counters
    // visibly different numbers as well as different rows.
    psql(bin, TEST_DB, ['-c',
      `insert into public.entitlements (user_id, tier, period_start, expires_at, source)`
      + ` values ('${U3}'::uuid, 'trip', now(), now() + interval '30 days', 'manual')`]);

    const p1 = consume(U3, 'plan');
    check('separation: a paid plan spend is ok', p1.status === 'ok', JSON.stringify(p1));
    check('separation: a plan spend is measured against the plan cap of 60',
      p1.cap === 60, JSON.stringify(p1));
    check('separation: the plan spend hit the plan counter',
      used(U3, 'plan') === 1, `got ${used(U3, 'plan')}`);
    check('separation: the plan spend left the ground counter at zero',
      used(U3, 'ground') === 0, `got ${used(U3, 'ground')}`);

    const gr1 = consume(U3, 'ground');
    check('separation: a grounded spend is ok', gr1.status === 'ok', JSON.stringify(gr1));
    check('separation: a grounded spend is measured against the grounded cap of 40',
      gr1.cap === 40, JSON.stringify(gr1));
    check('separation: the grounded spend hit the ground counter',
      used(U3, 'ground') === 1, `got ${used(U3, 'ground')}`);
    check('separation: the grounded spend left the plan counter untouched',
      used(U3, 'plan') === 1, `got ${used(U3, 'plan')}`);

    const st = status(U3);
    check('separation: ai_status reports the two counters apart',
      st.plansUsed === 1 && st.groundUsed === 1, JSON.stringify(st));
    check('separation: ai_status reports the two caps apart',
      st.plansCap === 60 && st.groundCap === 40, JSON.stringify(st));

    // A refund of one kind must not credit the other. Refunding 'ground'
    // when only 'plan' was spent is exactly how paid quota would get minted.
    refund(U3, 'ground');
    check('separation: refunding ground returns the ground unit',
      used(U3, 'ground') === 0, `got ${used(U3, 'ground')}`);
    check('separation: refunding ground does not touch the plan counter',
      used(U3, 'plan') === 1, `got ${used(U3, 'plan')}`);
    refund(U3, 'plan');
    check('separation: refunding plan returns the plan unit',
      used(U3, 'plan') === 0, `got ${used(U3, 'plan')}`);
    check('separation: refunding plan does not mint a ground unit',
      used(U3, 'ground') === 0, `got ${used(U3, 'ground')}`);

    // The two live in different rows of the same primary key, which is what
    // makes the separation structural rather than conventional.
    check('separation: plan and ground are distinct ai_usage rows',
      Number(scalar(bin, TEST_DB,
        `select count(distinct kind) from public.ai_usage where user_id = '${U3}'::uuid`)) === 2);

    // Exhausting one must not shut the other. Fill the grounded allowance and
    // check a plan spend still goes through: otherwise the expensive surface
    // would take the cheap one down with it.
    psql(bin, TEST_DB, ['-c',
      `update public.ai_usage set n = 40 where user_id = '${U3}'::uuid and kind = 'ground'`]);
    const grFull = consume(U3, 'ground');
    check('separation: an exhausted ground allowance refuses with user_cap',
      grFull.status === 'user_cap', JSON.stringify(grFull));
    const pStill = consume(U3, 'plan');
    check('separation: an exhausted ground allowance does not block plan spends',
      pStill.status === 'ok', JSON.stringify(pStill));

    // And the free tier's zero grounded allowance never reaches the ledger,
    // so grounded search cannot be bought with plan quota by a free user.
    const freeGround = consume(U1, 'ground');
    check('separation: the free tier is refused grounded search as user_cap',
      freeGround.status === 'user_cap', JSON.stringify(freeGround));
    check('separation: a zero grounded allowance writes no ledger row',
      used(U1, 'ground') === 0, `got ${used(U1, 'ground')}`);

    /* ---- 5. the free tier is 2 for life, pinned to the 021 epoch ----- */
    const epoch = scalar(bin, TEST_DB, 'select public.ai_free_epoch()');
    check('free epoch: ai_free_epoch exists and is 1970-01-01',
      epoch === '1970-01-01', `got ${epoch}`);
    check('free epoch: plan_tiers says the free allowance is 2',
      scalar(bin, TEST_DB, "select ai_plans from public.plan_tiers where tier='free'") === '2');
    check('free epoch: the free tier has no period_days, so it is not monthly',
      scalar(bin, TEST_DB, "select coalesce(period_days::text,'null') from public.plan_tiers where tier='free'") === 'null');
    check('free epoch: ai_resolve_tier pins a free user to the epoch',
      scalar(bin, TEST_DB,
        `select period_start from public.ai_resolve_tier('${U4}'::uuid)`) === '1970-01-01');

    // U4 spends one unit today, then a month passes. Under 007 the free
    // period was date_trunc('month', now()), so a spend 31 days later landed
    // on a fresh row and the allowance refilled. Under 021 the period does
    // not depend on now() at all.
    //
    // HOW THE MONTH IS SIMULATED, and why it is done this way. now() cannot
    // be moved inside a session, and moving the container's clock would make
    // the run non-reproducible. What the test does instead is stronger than a
    // clock move: it makes the database look exactly as it would after a
    // month has passed under BOTH schemes at once. The epoch row carries the
    // unit that was really spent, and a second row is written under the
    // month-start period that a monthly scheme would now be keying on, filled
    // to the cap. If ai_consume still keyed on the month it would read that
    // full month row (or, a month later, an empty one) rather than the epoch
    // row. It reads the epoch row, so the earlier spend still counts and only
    // one unit of the two is left.
    const f1 = consume(U4, 'plan');
    check('free epoch: the first free spend is ok', f1.status === 'ok', JSON.stringify(f1));
    check('free epoch: it landed on the epoch row',
      usedIn(U4, 'plan', '1970-01-01') === 1, `got ${usedIn(U4, 'plan', '1970-01-01')}`);

    psql(bin, TEST_DB, ['-c',
      `insert into public.ai_usage (user_id, period_start, kind, n)`
      + ` values ('${U4}'::uuid, date_trunc('month', now() - interval '31 days')::date, 'plan', 2)`]);
    check('free epoch: the month-keyed decoy row exists and is full',
      Number(scalar(bin, TEST_DB,
        `select n from public.ai_usage where user_id = '${U4}'::uuid`
        + ` and kind = 'plan' and period_start <> date '1970-01-01'`)) === 2);
    const f2 = consume(U4, 'plan');
    check('free epoch: a spend 31 days later still counts against the same two',
      f2.status === 'ok' && f2.used === 2 && f2.left === 0, JSON.stringify(f2));
    const f3 = consume(U4, 'plan');
    check('free epoch: the third spend is refused, the allowance did not refill',
      f3.status === 'user_cap', JSON.stringify(f3));
    check('free epoch: a stray month-keyed row is ignored, not counted',
      usedIn(U4, 'plan', '1970-01-01') === 2, `got ${usedIn(U4, 'plan', '1970-01-01')}`);
    check('free epoch: the stray month row still exists and was never touched',
      periodRows(U4) === 2, `got ${periodRows(U4)}`);

    // ai_status agrees with ai_consume, which is what the UI renders.
    const fs = status(U4);
    check('free epoch: ai_status reports 2 of 2 used and 0 left',
      fs.plansUsed === 2 && fs.plansCap === 2 && fs.plansLeft === 0, JSON.stringify(fs));
    check('free epoch: ai_status reports no reset date for the free tier',
      fs.resetsAt === null, JSON.stringify(fs));
    check('free epoch: ai_status names the epoch as the period',
      fs.periodStart === '1970-01-01', JSON.stringify(fs));

    return true;
  } finally {
    if (work) { try { rmSync(work, { recursive: true, force: true }); } catch { /* temp dir */ } }
    try { psql(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]); } catch { /* left behind */ }
  }
}

console.log('PART A: ai_consume and ai_refund against a throwaway PostgreSQL database');
console.log('------------------------------------------------------------------------');

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
  console.log('  SKIPPED. Part A did not run, so nothing about ai_consume, ai_refund or the');
  console.log('  plan/ground separation was proved here.');
  console.log(`  Reason: ${skipReason}`);
  console.log('');
  console.log('  To run it, point the script at a PostgreSQL server you can write to:');
  console.log('    PGPASSWORD=<password> PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres \\');
  console.log('      node continent-app/scripts/ai/test_ai_quota.mjs');
  console.log('');
  console.log('  It creates and drops a database named carta_t037_test. It never touches');
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
/* Part B: the consume() and refund() contract, no network                */
/* ===================================================================== */

console.log('');
console.log('PART B: the consume() and refund() contract in _shared/passes.mjs');
console.log('-----------------------------------------------------------------');

const passesPath = resolve(repoRoot, 'supabase/functions/_shared/passes.mjs');
const { consume, refund } = await import(pathToFileURL(passesPath).href);

const clientReturning = (result) => {
  const calls = [];
  return {
    calls,
    rpc: async (fn, args) => { calls.push({ fn, args }); return result; },
  };
};

// ok is derived from status alone. Every other field is passed through, so a
// caller that renders "2 of 60 left" is reading the server's numbers.
for (const status of ['ok', 'user_cap', 'global_cap', 'bad_kind', 'quota_check', '']) {
  const c = clientReturning({ data: { status, tier: 'trip', cap: 60, used: 1, left: 59 }, error: null });
  const res = await consume(c, U1, 'plan', 200);
  check(`consume: status ${status || '(empty)'} is ok only when it is 'ok'`,
    res.ok === (status === 'ok'), JSON.stringify(res));
}

const grantClient = clientReturning({ data: { status: 'ok', tier: 'trip', cap: 40, used: 3, left: 37 }, error: null });
const grant = await consume(grantClient, U1, 'ground', 200);
check('consume: the kind reaches the RPC unchanged',
  grantClient.calls[0].args.p_kind === 'ground', JSON.stringify(grantClient.calls[0]));
check('consume: a grant keeps the server counters',
  grant.cap === 40 && grant.used === 3 && grant.left === 37, JSON.stringify(grant));

// An RPC error is not a cap. It must get its own status so a caller answers
// 503 rather than telling a traveller their allowance is spent.
const errored = await consume(clientReturning({ data: null, error: { message: 'reset' } }), U1, 'plan', 200);
check('consume: an RPC error becomes status quota_check, not a cap',
  errored.status === 'quota_check' && errored.ok === false, JSON.stringify(errored));

// A null data row with no error must not read as a grant.
const empty = await consume(clientReturning({ data: null, error: null }), U1, 'plan', 200);
check('consume: an empty result is not a grant', empty.ok === false, JSON.stringify(empty));

// refund forwards the kind it was given. Forwarding the wrong one is how a
// failed grounded call would credit plan quota, or the reverse.
const refundClient = clientReturning({ data: null, error: null });
await refund(refundClient, U1, 'ground');
check('refund: calls the ai_refund RPC', refundClient.calls[0].fn === 'ai_refund');
check('refund: forwards the kind it was given, not a default',
  refundClient.calls[0].args.p_kind === 'ground', JSON.stringify(refundClient.calls[0]));
check('refund: forwards the user', refundClient.calls[0].args.p_user === U1);

// Best effort by design: a refund failure must not mask the original error.
let refundThrew = false;
try { await refund({ rpc: async () => { throw new Error('down'); } }, U1, 'plan'); }
catch { refundThrew = true; }
check('refund: swallows its own failure', refundThrew === false);

/* ===================================================================== */
/* Part C: every consume() call site branches before the Gemini call      */
/* ===================================================================== */

console.log('');
console.log('PART C: call-site source patterns (a pattern check, not an execution test)');
console.log('--------------------------------------------------------------------------');
console.log('  The Edge Functions are Deno and are not executed here. What follows reads');
console.log('  their source and asserts the branch is present and precedes the fetch.');

/** Every .ts under supabase/functions that imports consume from passes.mjs. */
function callSiteFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, name.name);
      if (name.isDirectory()) { walk(p); continue; }
      if (!name.name.endsWith('.ts')) continue;
      const src = readFileSync(p, 'utf8');
      if (/import \{[^}]*\bconsume\b[^}]*\} from '.*passes\.mjs'/.test(src)) out.push({ path: p, src });
    }
  };
  walk(functionsDir);
  return out;
}
const sites = callSiteFiles();

check('call sites: at least three Edge Functions spend quota',
  sites.length >= 3, `found ${sites.length}`);

const GEMINI = 'generativelanguage.googleapis.com';

for (const { path, src } of sites) {
  const rel = path.slice(repoRoot.length + 1).replace(/\\/g, '/');

  // Every `await consume(...)` assignment must have its result inspected.
  //
  // The declaration keyword is OPTIONAL in this pattern on purpose.
  // suggest-city declares `let quota` once and then REASSIGNS it on the
  // grounded-race path (`quota = await consume(...)`, no keyword). A pattern
  // that demanded const or let read that file as having one call site when it
  // has two. It happens not to change the verdict there, because both
  // assignments land in the same branched-on variable, but a future call site
  // assigned to a variable nobody checks would have passed silently, which is
  // the one failure this part exists to catch.
  const consumeCalls = [...src.matchAll(/(?:(?:const|let)\s+)?(\w+)\s*=\s*await consume\(/g)];
  check(`${rel}: has at least one consume() call`, consumeCalls.length > 0);

  // And the pattern must account for EVERY call in the file. If a call is
  // written in a shape this regex cannot read (passed straight into an if, or
  // destructured), it would be skipped rather than judged, and a skipped call
  // site reads as a pass. Fail loudly instead and make someone widen the
  // pattern.
  const totalCalls = (src.match(/await consume\(/g) || []).length;
  check(`${rel}: every await consume() is an assignment this check can read`,
    consumeCalls.length === totalCalls,
    `${totalCalls} calls in the file, ${consumeCalls.length} matched the assignment pattern`);

  for (const m of consumeCalls) {
    const v = m[1];
    const branched = new RegExp(`(!${v}\\.ok|${v}\\.ok\\b|${v}\\.status\\s*===)`).test(src);
    check(`${rel}: the result of consume() (${v}) is branched on`, branched);
  }

  // And the branch must come BEFORE the Gemini fetch, or the refusal is
  // decoration. Compare the first branch offset with the first fetch offset.
  // Searched from the consume() call onward: these files have unrelated
  // `.ok` checks earlier (parse-booking validates an upload before it spends
  // anything), and matching one of those would prove nothing.
  const firstConsume = src.indexOf('await consume(');
  const tail = src.slice(firstConsume);
  const firstBranch = firstConsume + Math.min(
    ...[/if \(!\w+\.ok\)/, /if \(\w+\.status === /, /if \(\w+\.ok\)/]
      .map((re) => { const mm = re.exec(tail); return mm ? mm.index : Infinity; }),
  );
  const firstGemini = src.indexOf(GEMINI);
  check(`${rel}: a quota branch exists after the consume() call`,
    firstBranch > firstConsume && firstBranch < Infinity,
    `consume at ${firstConsume}, branch at ${firstBranch}`);
  if (firstGemini !== -1) {
    check(`${rel}: the quota branch precedes the Gemini call`,
      firstBranch < firstGemini, `branch at ${firstBranch}, gemini at ${firstGemini}`);
  } else {
    check(`${rel}: no direct Gemini call in this file`, true);
  }

  // Every function that can spend must also be able to hand the unit back.
  check(`${rel}: imports refund as well as consume`,
    /import \{[^}]*\brefund\b[^}]*\} from '.*passes\.mjs'/.test(src));
  check(`${rel}: calls refund on a failure path`, /await refund\(/.test(src));
}

// The grounded path is the point of this task: it must ask for 'ground'.
const planDay = readFileSync(resolve(functionsDir, 'plan-day/index.ts'), 'utf8');
check("plan-day: the grounded path consumes kind 'ground'",
  /await consume\(service, user\.id, 'ground', GLOBAL_CAP\)/.test(planDay));
check("plan-day: the ordinary path consumes kind 'plan'",
  /await consume\(service, user\.id, 'plan', GLOBAL_CAP\)/.test(planDay));
check('plan-day: grounding is only switched on when that consume() was ok',
  /if \(g\.ok\) \{ useGrounding = true; spent\.push\('ground'\); \}/.test(planDay));
check('plan-day: a refused grounded unit degrades instead of being spent',
  // T042 wrapped the else in a block to log a paid cap refusal.
  /else \{?\s*groundingSkipped = /.test(planDay));
check('plan-day: google_search is gated on useGrounding',
  /useGrounding \? \{ tools: \[\{ google_search: \{\} \}\] \}/.test(planDay));
check('plan-day: the refund loop walks the kinds actually spent',
  /for \(const kind of spent\) await refund\(service, user\.id, kind\)/.test(planDay));

const suggest = readFileSync(resolve(functionsDir, 'suggest-city/index.ts'), 'utf8');
check("suggest-city: picks the kind from whether grounding is on",
  /const kind = useGrounding \? 'ground' : 'plan'/.test(suggest));
check('suggest-city: refunds the kind it actually spent',
  /const spentKind = useGrounding \? 'ground' : 'plan'/.test(suggest)
  && /await refund\(service, user\.id, spentKind\)/.test(suggest));

const parse = readFileSync(resolve(functionsDir, 'parse-booking/index.ts'), 'utf8');
check("parse-booking: spends 'plan' and never grounds",
  /await consume\(service, user\.id, 'plan', GLOBAL_CAP\)/.test(parse)
  && !/'ground'/.test(parse));

/* ===================================================================== */

console.log('');
console.log(`${checks} assertions, ${checks - failures} passing, ${failures} failing.`);
if (partASkipped) {
  console.log('Part A SKIPPED: ai_consume and ai_refund were NOT exercised against real SQL.');
}
if (failures) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log(partASkipped
  ? 'Parts B and C passed. Part A was skipped, so this run does not prove the SQL.'
  : 'All AI quota enforcement tests passed.');
