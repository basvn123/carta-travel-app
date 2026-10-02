/**
 * Tests for grant_pass, pass_can_buy and the two reporting functions that
 * read the sale ledger, as migration 044 (T265) left them.
 *
 *   node continent-app/scripts/ai/test_passes.mjs
 *
 * WHY THIS EXISTS. T031 found by observation that a Year Pass holder who
 * bought a Trip Pass was downgraded, and that nothing capped how far ahead a
 * pass could run. T034 left the funnel's per-gate purchases as a one-hour
 * estimate, and T043 left the Stripe fee modelled because nothing stored it.
 * 044 changes all four, in grant_pass, admin_paywall_funnel and admin_margin.
 * Each of those is a rule a careless edit can quietly undo, so each is
 * asserted here against real SQL.
 *
 * THREE PARTS, in the shape of test_ai_quota.mjs.
 *
 * PART A runs the migration chain on a throwaway PostgreSQL database over
 * the same stubs that script uses, then drives grant_pass, pass_can_buy,
 * ai_status, admin_paywall_funnel, admin_margin, oss_threshold_check and
 * admin_oss_threshold through psql. It needs PGPASSWORD (and optionally
 * PGHOST, PGPORT, PGUSER). With no server reachable it SKIPS LOUDLY and
 * still exits 0, never reporting a skip as a pass.
 *
 * PART B is a source pattern check on the two Edge Functions and the client:
 * the checkout function asks pass_can_buy before Stripe and copies the gate
 * reason into the session, the webhook expands the balance transaction and
 * hands reason and fee to grant_pass, the client sends the reason and the
 * modal has words for a refused purchase in all six locales. The functions
 * are Deno and are not executed; a pattern check proves a refactor did not
 * drop the branch, nothing more.
 *
 * It never touches the live Supabase project. Part A creates and drops a
 * database named carta_t265_test.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '../..');
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
const TEST_DB = process.env.CARTA_TEST_DB || 'carta_t265_test';

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

const scalar = (bin, db, sql) => psql(bin, db, ['-At', '-c', sql]).trim();
/** A scalar read as an admin: the guard stub honours carta.guard in-session. */
const asAdmin = (bin, db, sql) => psql(bin, db, ['-At', '-c', `set carta.guard = 'ok'; ${sql}`])
  .split(/\r?\n/).filter((l) => l !== 'SET').join('\n').trim(); // psql echoes the SET tag

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

const CHAIN = [
  '006_ai_day_planner.sql', '007_passes.sql', '021_free_tier_once.sql',
  '022_paywall_events.sql', '025_withdrawal_waiver.sql', '026_oss_threshold.sql',
  '027_paywall_funnel_kinds.sql', '031_margin_dashboard.sql', '044_payments_quota.sql',
];

const P1 = '00000000-0000-0000-0000-0000000000b1'; // year holder buys a trip
const P2 = '00000000-0000-0000-0000-0000000000b2'; // trip holder buys a year
const P3 = '00000000-0000-0000-0000-0000000000b3'; // trip twice, the 007 rule
const P4 = '00000000-0000-0000-0000-0000000000b4'; // the horizon
const P5 = '00000000-0000-0000-0000-0000000000b5'; // reason and fee, keyed
const P6 = '00000000-0000-0000-0000-0000000000b6'; // no reason, estimated

const DAY_MS = 86400000;
const daysFromNow = (iso) => Math.round((Date.parse(iso) - Date.now()) / DAY_MS);

function runPartA(bin) {
  let work = null;
  try {
    try { psql(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]); } catch { /* fresh box */ }
    psql(bin, 'postgres', ['-c', `create database ${TEST_DB}`]);

    work = mkdtempSync(join(tmpdir(), 'carta-t265-'));
    const stubFile = join(work, 'stubs.sql');
    writeFileSync(stubFile, STUBS, 'utf8');
    psql(bin, TEST_DB, ['-f', stubFile]);

    for (const name of CHAIN) {
      psql(bin, TEST_DB, ['-f', resolve(migrations, name)]);
      check(`migration applied: ${name}`, true);
    }
    // Applying 044 twice must be a no-op that still passes its self-check.
    // psql prints the self-check notice on stderr, so the proof is the state:
    // ON_ERROR_STOP would have thrown, and there is still one grant_pass.
    psql(bin, TEST_DB, ['-f', resolve(migrations, '044_payments_quota.sql')]);
    const gpCount = scalar(bin, TEST_DB,
      "select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace"
      + " where s.nspname = 'public' and p.proname = 'grant_pass'");
    check('044 applies twice and leaves exactly one grant_pass', gpCount === '1', `got ${gpCount}`);

    for (const u of [P1, P2, P3, P4, P5, P6]) {
      psql(bin, TEST_DB, ['-c', `insert into auth.users (id) values ('${u}')`]);
    }

    let seq = 0;
    const grant = (user, tier, extra = '') => JSON.parse(scalar(bin, TEST_DB,
      `select public.grant_pass('${user}'::uuid, '${tier}', 'cs_${user.slice(-2)}_${++seq}'${extra})`));
    const regrant = (user, tier, n) => JSON.parse(scalar(bin, TEST_DB,
      `select public.grant_pass('${user}'::uuid, '${tier}', 'cs_${user.slice(-2)}_${n}')`));
    const canBuy = (user, tier) => JSON.parse(scalar(bin, TEST_DB,
      `select public.pass_can_buy('${user}'::uuid, '${tier}')`));
    const status = (user) => JSON.parse(scalar(bin, TEST_DB,
      `select public.ai_status('${user}'::uuid)`));
    const ent = (user) => JSON.parse(scalar(bin, TEST_DB,
      `select row_to_json(e) from public.entitlements e where user_id = '${user}'::uuid`));
    const grants = (user) => Number(scalar(bin, TEST_DB,
      `select count(*) from public.pass_grants where user_id = '${user}'::uuid`));

    /* ---- 1. a Year Pass holder who buys a Trip Pass keeps the year ----- */
    const y1 = grant(P1, 'year', ", p_reason => 'browse'");
    check('stacking: a clean account buying a year holds tier year', y1.tier === 'year', JSON.stringify(y1));
    check('stacking: the year runs 365 days', daysFromNow(y1.expiresAt) === 365, y1.expiresAt);
    const s1 = status(P1);
    check('stacking: ai_status reports the year allowance', s1.plansCap === 300 && s1.groundCap === 120, JSON.stringify(s1));
    const start1 = ent(P1).period_start;

    const t1 = grant(P1, 'trip', ", p_reason => 'browse'");
    check('stacking: buying a trip on a live year keeps tier year', t1.tier === 'year', JSON.stringify(t1));
    check('stacking: the grant says it kept the held tier', t1.kept === true, JSON.stringify(t1));
    check('stacking: the grant still names what was bought', t1.bought === 'trip', JSON.stringify(t1));
    check('stacking: the trip adds its 30 days to the year', daysFromNow(t1.expiresAt) === 395, t1.expiresAt);
    const s1b = status(P1);
    check('stacking: the allowance is still the year allowance', s1b.plansCap === 300 && s1b.groundCap === 120, JSON.stringify(s1b));
    check('stacking: the period is not refilled when the held tier is kept',
      ent(P1).period_start === start1, `${start1} vs ${ent(P1).period_start}`);
    check('stacking: the sale is recorded as the tier that was bought',
      scalar(bin, TEST_DB, `select tier from public.pass_grants where user_id = '${P1}'::uuid order by granted_at desc limit 1`) === 'trip');
    check('stacking: two sales, two ledger rows', grants(P1) === 2);

    /* ---- 2. a Trip Pass holder who buys a Year Pass moves up ----------- */
    const t2 = grant(P2, 'trip');
    const start2 = ent(P2).period_start;
    psql(bin, TEST_DB, ['-c', `update public.entitlements set period_start = period_start - interval '1 minute' where user_id = '${P2}'::uuid`]);
    const y2 = grant(P2, 'year');
    check('upgrade: a year bought on a live trip takes tier year', y2.tier === 'year' && y2.kept === false, JSON.stringify(y2));
    check('upgrade: the year extends from the trip expiry', daysFromNow(y2.expiresAt) === 395, `${t2.expiresAt} then ${y2.expiresAt}`);
    check('upgrade: the period is refilled', ent(P2).period_start !== start2);

    /* ---- 3. the same tier twice is the 007 rule, unchanged ------------- */
    const a3 = grant(P3, 'trip');
    const b3 = grant(P3, 'trip');
    check('renewal: a second trip extends from the first', daysFromNow(b3.expiresAt) === 60, `${a3.expiresAt} then ${b3.expiresAt}`);
    check('renewal: tier stays trip and nothing was kept', b3.tier === 'trip' && b3.kept === false, JSON.stringify(b3));
    const replay = regrant(P3, 'trip', seq);
    check('replay: the same session id is a no-op', replay.replay === true, JSON.stringify(replay));
    check('replay: the expiry did not move', daysFromNow(ent(P3).expires_at) === 60);

    /* ---- 4. the horizon --------------------------------------------- */
    const horizon = Number(scalar(bin, TEST_DB, 'select public.pass_horizon_days()'));
    check('horizon: pass_horizon_days is three years', horizon === 1095, `got ${horizon}`);
    psql(bin, TEST_DB, ['-c',
      `insert into public.entitlements (user_id, tier, period_start, expires_at, source)`
      + ` values ('${P4}'::uuid, 'year', now(), now() + interval '${horizon - 100} days', 'manual')`]);
    const can4 = canBuy(P4, 'year');
    check('horizon: a year that would cross the horizon may still be bought', can4.ok === true, JSON.stringify(can4));
    check('horizon: and pass_can_buy says it will be capped', can4.capped === true, JSON.stringify(can4));
    const g4 = grant(P4, 'year');
    check('horizon: the grant is clamped to the horizon', g4.capped === true && daysFromNow(g4.expiresAt) === horizon, JSON.stringify(g4));
    const can4b = canBuy(P4, 'trip');
    check('horizon: a pass at the horizon cannot be bought for', can4b.ok === false && can4b.reason === 'horizon', JSON.stringify(can4b));
    const g4b = grant(P4, 'trip');
    check('horizon: a grant that slips through anyway cannot pass the horizon',
      g4b.capped === true && daysFromNow(g4b.expiresAt) === horizon, JSON.stringify(g4b));
    const canFree = canBuy(P4, 'free');
    check('horizon: the free tier is not buyable', canFree.ok === false && canFree.reason === 'bad_tier', JSON.stringify(canFree));
    const can5 = canBuy(P5, 'trip');
    check('horizon: a clean account may buy, uncapped', can5.ok === true && can5.capped === false, JSON.stringify(can5));

    /* ---- 5. reason and fee on the sale ------------------------------- */
    const g5 = grant(P5, 'trip',
      ", p_buyer_country => 'DE', p_amount_cents => 699, p_currency => 'eur', p_reason => 'export', p_fee_cents => 46, p_fee_currency => 'eur'");
    check('ledger: the grant echoes the reason', g5.reason === 'export', JSON.stringify(g5));
    const row5 = JSON.parse(scalar(bin, TEST_DB,
      `select row_to_json(g) from public.pass_grants g where user_id = '${P5}'::uuid`));
    check('ledger: reason is stored on the sale', row5.reason === 'export', JSON.stringify(row5));
    check('ledger: the fee and its currency are stored', row5.fee_cents === 46 && row5.fee_currency === 'eur', JSON.stringify(row5));
    const g6 = grant(P6, 'trip',
      ", p_buyer_country => 'FR', p_amount_cents => 699, p_currency => 'eur', p_reason => 'not a gate!', p_fee_cents => -5, p_fee_currency => 'EURO'");
    const row6 = JSON.parse(scalar(bin, TEST_DB,
      `select row_to_json(g) from public.pass_grants g where user_id = '${P6}'::uuid`));
    check('ledger: a malformed reason is stored as null, and the grant still happens',
      g6.ok === true && row6.reason === null, JSON.stringify(row6));
    check('ledger: a negative fee and a bad currency are stored as null',
      row6.fee_cents === null && row6.fee_currency === null, JSON.stringify(row6));

    /* ---- 6. the funnel joins on the reason column -------------------- */
    const forbidden = JSON.parse(scalar(bin, TEST_DB, 'select public.admin_paywall_funnel(30)'));
    check('funnel: a non-admin is refused', forbidden.error === 'forbidden', JSON.stringify(forbidden));
    // P5 (keyed, export) saw a share gate and pressed buy from it ten minutes
    // before paying: the nearest-checkout estimate would say share, the
    // reason column says export, and the column must win. P6 (no reason) has
    // an export checkout five minutes before paying, so it is estimated.
    psql(bin, TEST_DB, ['-c',
      `insert into public.paywall_events (at, user_id, event, reason, tier) values`
      + ` (now() - interval '11 minutes', '${P5}'::uuid, 'shown', 'share', 'free'),`
      + ` (now() - interval '10 minutes', '${P5}'::uuid, 'checkout', 'share', 'trip'),`
      + ` (now() - interval '6 minutes', '${P6}'::uuid, 'shown', 'export', 'free'),`
      + ` (now() - interval '5 minutes', '${P6}'::uuid, 'checkout', 'export', 'trip'),`
      + ` (now() - interval '4 minutes', '${P5}'::uuid, 'shown', 'export', 'free')`]);
    const f = JSON.parse(asAdmin(bin, TEST_DB, 'select public.admin_paywall_funnel(30)'));
    const byReason = Object.fromEntries((f.byReason || []).map((r) => [r.reason, r]));
    check('funnel: an admin gets the funnel', f.error === undefined && Array.isArray(f.byReason), JSON.stringify(f).slice(0, 200));
    check('funnel: a keyed grant counts under its own reason, not the nearest checkout',
      byReason.export?.bought === 2 && byReason.share?.bought === 0, JSON.stringify(f.byReason));
    check('funnel: the estimate is still used for a grant with no reason',
      byReason.export?.bought === 2, JSON.stringify(byReason.export));
    check('funnel: the window says how it attributed',
      f.attribution === 'mixed' && f.attributedByReason === 3 && f.attributedByEstimate === 7,
      `${f.attribution} ${f.attributedByReason} ${f.attributedByEstimate}`);
    check('funnel: conversion rates read from bought', byReason.export?.conversionRate === 100, JSON.stringify(byReason.export));
    const hard = (f.byKind || []).find((k) => k.kind === 'hard');
    // hard is export (2) plus the two keyed 'browse' sales from section 1:
    // 027 maps browse to hard, and a keyed sale counts whether or not its
    // gate logged a shown event in the window.
    check('funnel: byKind still rolls the reasons up', hard && hard.bought === 4 && hard.shown === 3, JSON.stringify(f.byKind));
    check('funnel: byTier and daily keep their 022 shape', Array.isArray(f.byTier) && Array.isArray(f.daily));

    /* ---- 7. the margin dashboard: fee from the charge, AI by day ------ */
    // Move every sale so far into the last closed month, so admin_margin(1)
    // sees them. Two carry a stored fee (P5 at 46, and P1's first at 50 set
    // here), the rest are modelled.
    psql(bin, TEST_DB, ['-c', "update public.pass_grants set granted_at = granted_at - interval '1 month'"]);
    psql(bin, TEST_DB, ['-c',
      `update public.pass_grants set amount_cents = 699, currency = 'eur', buyer_country = 'DE' where amount_cents is null`]);
    psql(bin, TEST_DB, ['-c',
      `update public.pass_grants set fee_cents = 50, fee_currency = 'eur' where user_id = '${P1}'::uuid and tier = 'year'`]);
    const m = JSON.parse(asAdmin(bin, TEST_DB, 'select public.admin_margin(1)'));
    check('margin: an admin gets the last closed month', m.closed === true && m.sales?.count === 10, JSON.stringify(m.sales));
    check('margin: the Stripe line says mixed when some fees are stored',
      m.stripe?.basis === 'mixed' && m.stripe.chargeRows === 2 && m.stripe.modelledRows === 8, JSON.stringify(m.stripe));
    const modelledOne = Math.round(699 * 0.015 + 25 + 699 * 0.005);
    check('margin: the Stripe cents are the stored fees plus the modelled rest',
      // Stripe Tax's 0.5 percent is billed apart from the charge fee, so it is
      // added to the stored fees as well as to the modelled ones.
      m.stripe.cents === Math.round(46 + 50 + 2 * 699 * 0.005 + 8 * (699 * 0.015 + 25 + 699 * 0.005)),
      `got ${m.stripe.cents}, one modelled sale is ${modelledOne}`);
    psql(bin, TEST_DB, ['-c', "update public.pass_grants set fee_cents = 40, fee_currency = 'eur' where fee_cents is null"]);
    const m2 = JSON.parse(asAdmin(bin, TEST_DB, 'select public.admin_margin(1)'));
    check('margin: with a fee on every sale the basis is charge',
      m2.stripe?.basis === 'charge' && m2.stripe.cents === Math.round(46 + 50 + 8 * 40 + 10 * 699 * 0.005), JSON.stringify(m2.stripe));
    psql(bin, TEST_DB, ['-c', "update public.pass_grants set fee_cents = null, fee_currency = null"]);
    const m3 = JSON.parse(asAdmin(bin, TEST_DB, 'select public.admin_margin(1)'));
    check('margin: with no fee stored the basis is modelled', m3.stripe?.basis === 'modelled', JSON.stringify(m3.stripe));

    // AI by day. Units spent today land in the month in progress and not in
    // the last closed month, whatever period their entitlement opened in.
    psql(bin, TEST_DB, ['-c', `select public.ai_consume('${P1}'::uuid, 'plan', 100000)`]);
    psql(bin, TEST_DB, ['-c', `select public.ai_consume('${P1}'::uuid, 'ground', 100000)`]);
    psql(bin, TEST_DB, ['-c', `select public.ai_consume('${P1}'::uuid, 'ground', 100000)`]);
    const m0 = JSON.parse(asAdmin(bin, TEST_DB, 'select public.admin_margin(0)'));
    check('margin: units spent today are the current month\'s', m0.ai?.planUnits === 1 && m0.ai?.groundUnits === 2, JSON.stringify(m0.ai));
    check('margin: the daily counter agrees with the day ledger', m0.ai?.dailyTotalUnits === 3, JSON.stringify(m0.ai));
    check('margin: the AI line says it reads by day', /by day/.test(m0.ai?.basis || ''), m0.ai?.basis);
    const m1 = JSON.parse(asAdmin(bin, TEST_DB, 'select public.admin_margin(1)'));
    check('margin: the closed month saw none of them, although every period opened in it',
      m1.ai?.planUnits === 0 && m1.ai?.groundUnits === 0, JSON.stringify(m1.ai));
    psql(bin, TEST_DB, ['-c',
      `insert into public.ai_usage_days (user_id, day, kind, n) values ('${P2}'::uuid, (date_trunc('month', now()) - interval '1 day')::date, 'ground', 4)`]);
    const m1b = JSON.parse(asAdmin(bin, TEST_DB, 'select public.admin_margin(1)'));
    check('margin: a day row in the closed month is counted there', m1b.ai?.groundUnits === 4 && m1b.ai?.groundCents === 20, JSON.stringify(m1b.ai));

    /* ---- 8. the OSS check on a schedule ------------------------------ */
    const o1 = JSON.parse(scalar(bin, TEST_DB, 'select public.oss_threshold_check()'));
    check('oss: the check runs with the default warning level', o1.warnPct === 70 && o1.raised === false, JSON.stringify(o1));
    check('oss: no alert row without a reason', scalar(bin, TEST_DB, 'select count(*) from public.oss_alerts') === '0');
    psql(bin, TEST_DB, ['-c',
      `insert into public.pass_grants (session_id, user_id, tier, expires_at, buyer_country, amount_cents, currency)`
      + ` values ('cs_big', '${P2}'::uuid, 'year', now() + interval '365 days', 'NL', 800000, 'eur')`]);
    const o2 = JSON.parse(scalar(bin, TEST_DB, 'select public.oss_threshold_check()'));
    check('oss: 80 percent of the threshold raises an alert', o2.raised === true && Number(o2.pct) >= 80, JSON.stringify(o2));
    const alerts = JSON.parse(scalar(bin, TEST_DB, 'select coalesce(jsonb_agg(row_to_json(a)), \'[]\') from public.oss_alerts a'));
    check('oss: one alert row for the year', alerts.length === 1 && alerts[0].warn_pct === 70, JSON.stringify(alerts));
    psql(bin, TEST_DB, ['-c', "insert into public.site_config (key, value) values ('oss_warn_pct', '90'::jsonb)"]);
    const o3 = JSON.parse(scalar(bin, TEST_DB, 'select public.oss_threshold_check()'));
    check('oss: the warning level is read from site_config', o3.warnPct === 90 && o3.raised === false, JSON.stringify(o3));
    check('oss: an alert already raised is kept', scalar(bin, TEST_DB, 'select count(*) from public.oss_alerts') === '1');
    const t = JSON.parse(asAdmin(bin, TEST_DB, 'select public.admin_oss_threshold()'));
    check('oss: the admin RPC returns the alerts and the level',
      Array.isArray(t.alerts) && t.alerts.length === 1 && t.warnPct === 90 && t.scheduled === false, JSON.stringify({ a: t.alerts, w: t.warnPct, s: t.scheduled }));
    check('oss: the 026 figures are intact', t.thresholdCents === 1000000 && t.breached === false && Array.isArray(t.years), JSON.stringify(t.years));

    /* ---- 9. the free row ---------------------------------------------- */
    check('plan_tiers: the free tier is 2 after 044',
      scalar(bin, TEST_DB, "select ai_plans from public.plan_tiers where tier = 'free'") === '2');
    // Re-run the 007 insert as written, which undoes 021, then 044 again,
    // which puts it back and says so.
    psql(bin, TEST_DB, ['-c', "update public.plan_tiers set ai_plans = 3 where tier = 'free'"]);
    psql(bin, TEST_DB, ['-f', resolve(migrations, '044_payments_quota.sql')]);
    check('plan_tiers: re-pasting 044 pins the free tier back to 2',
      scalar(bin, TEST_DB, "select ai_plans from public.plan_tiers where tier = 'free'") === '2');

    return true;
  } finally {
    if (work) { try { rmSync(work, { recursive: true, force: true }); } catch { /* temp dir */ } }
    try { psql(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]); } catch { /* left behind */ }
  }
}

console.log('PART A: grant_pass, pass_can_buy and the reporting RPCs against a throwaway database');
console.log('------------------------------------------------------------------------------------');

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
  console.log('  SKIPPED. Part A did not run, so nothing about grant_pass, the horizon, the');
  console.log('  funnel join or the margin fee was proved here.');
  console.log(`  Reason: ${skipReason}`);
  console.log('');
  console.log('  To run it, point the script at a PostgreSQL server you can write to:');
  console.log('    PGPASSWORD=<password> PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres \\');
  console.log('      node continent-app/scripts/ai/test_passes.mjs');
  console.log('');
  console.log('  It creates and drops a database named carta_t265_test. It never touches');
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
/* Part B: source patterns on the functions and the client                */
/* ===================================================================== */

console.log('');
console.log('PART B: source patterns (a pattern check, not an execution test)');
console.log('------------------------------------------------------------------');

const checkout = readFileSync(resolve(functionsDir, 'checkout/index.ts'), 'utf8');
const beforeStripe = checkout.indexOf('new Stripe(');
check('checkout: asks pass_can_buy before Stripe is constructed',
  checkout.indexOf("rpc('pass_can_buy'") !== -1 && checkout.indexOf("rpc('pass_can_buy'") < beforeStripe);
check('checkout: refuses with 409 pass_max', /json\(409, \{ code: 'pass_max'/.test(checkout));
check('checkout: a missing RPC is 503, never a silent charge', /canErr\) return json\(503/.test(checkout));
check('checkout: validates the reason as letters only', /\^\[A-Za-z\]\{1,32\}\$/.test(checkout));
check('checkout: copies the reason into both metadata blocks',
  /metadata: \{ user_id: user\.id, tier, reason \}/.test(checkout)
  && /payment_intent_data: \{ metadata: \{ user_id: user\.id, tier, reason \} \}/.test(checkout));

const webhook = readFileSync(resolve(functionsDir, 'stripe-webhook/index.ts'), 'utf8');
check('webhook: expands the balance transaction behind the charge',
  /expand: \['latest_charge\.balance_transaction'\]/.test(webhook));
check('webhook: a failed fee read is swallowed and the grant goes ahead',
  /catch \{ \/\* grant anyway, with the fee modelled/.test(webhook));
check('webhook: hands reason, fee and fee currency to grant_pass',
  /p_reason: reason,/.test(webhook) && /p_fee_cents: feeCents,/.test(webhook) && /p_fee_currency: feeCurrency,/.test(webhook));
check('webhook: validates the reason as letters only', /\^\[A-Za-z\]\{1,32\}\$/.test(webhook));
check('webhook: still returns 500 on a grant failure so Stripe retries', /status: 500/.test(webhook));

const client = readFileSync(resolve(appRoot, 'src/lib/checkout.js'), 'utf8');
check('client: sends the reason beside the tier', /body: \{ tier, reason: reason \|\| '' \}/.test(client));
const modal = readFileSync(resolve(appRoot, 'src/components/PassModal.jsx'), 'utf8');
check('modal: has words for a refused purchase', /pass_max: 'pass\.errMax'/.test(modal));
for (const lang of ['en', 'de', 'es', 'fr', 'it', 'nl']) {
  const loc = readFileSync(resolve(appRoot, `src/i18n/${lang}.js`), 'utf8');
  check(`locale ${lang}: pass.errMax exists and is not empty`, /"pass\.errMax": "[^"]{10,}"/.test(loc));
}
const migration = readFileSync(resolve(migrations, '044_payments_quota.sql'), 'utf8');
check('044: carries its self-check notice', /raise notice 'payments and quota self-check passed'/.test(migration));
check('044: refuses to apply before its prerequisites', /044 needs 031_margin_dashboard\.sql first/.test(migration));

/* ===================================================================== */

console.log('');
console.log(`${checks} assertions, ${checks - failures} passing, ${failures} failing.`);
if (partASkipped) {
  console.log('Part A SKIPPED: grant_pass and the reporting RPCs were NOT exercised against real SQL.');
}
if (failures) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log(partASkipped
  ? 'Part B passed. Part A was skipped, so this run does not prove the SQL.'
  : 'All pass tests passed.');
