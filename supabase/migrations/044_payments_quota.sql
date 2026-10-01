-- 044_payments_quota.sql
--
-- Payments and quota, the fixes that were safe to write before Stripe exists.
-- Closes register rows T031-b, T031-c, T030-d, T030-c, T037-c, T043-e,
-- T034-c, T033-f and T043-d (T265). One file because every piece lands on
-- the same four functions and a paste order across nine small files is a
-- worse hazard than one self-checking file.
--
-- WHAT IT CHANGES, in the order it runs.
--
--   1. plan_tiers.free is pinned back to 2 plans (T030-d). The 007 insert
--      writes 3 and its on-conflict update undoes 021 whenever 007 is pasted
--      again. 007 is an applied migration and is not edited; this file is
--      the one to paste after any 007 re-run, and its self-check refuses to
--      pass while the free row says anything but 2.
--
--      While here, the 007 header's claim that "the pricing UI reads
--      plan_tiers" is corrected on record (T030-c): nothing in the app reads
--      this table. continent-app/src/lib/pricing.js is the display copy and
--      scripts/verify_plan_tiers.mjs fails the build when the two drift.
--      price_cents here is documentation; the Stripe Price object charges.
--
--   2. ai_usage_days, a (user, day, kind) ledger written beside ai_usage
--      (T037-c, T043-e). The period-keyed ledger cannot say which day a unit
--      was spent, so ai_refund debited today's shared ceiling for a unit that
--      was added to yesterday's, and admin_margin booked a Year Pass's whole
--      allowance in its purchase month. ai_consume now writes the day row
--      once the grant is final; ai_refund finds the latest day with a unit
--      on it for that user and kind and returns the unit to THAT day's
--      counter; admin_margin prices the units spent inside the month.
--
--   3. grant_pass keeps the higher tier (T031-b) and caps the horizon
--      (T031-c). A Year Pass holder who buys a Trip Pass keeps tier year,
--      keeps the allowance they are inside, and gets 30 more days; the sale
--      is still recorded as a trip in pass_grants. A pass can never end more
--      than pass_horizon_days() (1095, three years) from now, and
--      pass_can_buy() lets the checkout function refuse before Stripe charges
--      for days the cap would take away.
--
--   4. pass_grants.reason, fee_cents, fee_currency (T034-c, T043-d). The
--      checkout function now carries the gate reason into the Stripe session
--      metadata, the webhook hands it to grant_pass, and admin_paywall_funnel
--      joins on it; the nearest-checkout estimate survives only for rows
--      written before this column existed. The webhook also expands the
--      payment intent's balance transaction and stores Stripe's real fee, and
--      admin_margin reports stripe.basis as charge, mixed or modelled.
--
--   5. oss_threshold_check() and oss_alerts (T033-f). A guard-free writer the
--      database can run on its own: it reads the same ledger as
--      admin_oss_threshold and writes one alert row per calendar year once the
--      cross-border figure passes the warning level (site_config
--      oss_warn_pct, default 70). If pg_cron is enabled it is scheduled for
--      Monday 06:00 UTC; if not, the notice at the end says so and the owner
--      enables the extension and pastes the one schedule line. The admin RPC
--      returns the alerts, so whichever screen draws it (T033-e, wave 3) sees
--      them.
--
-- A NOTE ON 006 (T035-c). Migration 006's header says the Google project
-- behind the Gemini key "must NEVER have a billing account attached". That
-- was the posture before 2026-03-23 and is superseded: the project is billed,
-- as 007, _shared/passes.mjs and the T035 report say, and the ai_daily_total
-- ceiling is an abuse guard, not a zero-billing promise. 006 is an applied
-- migration and is not edited; this sentence is the correction on record.
--
-- ORDER. Paste in the Supabase SQL editor AFTER 043 and AFTER the stage 10
-- SQL pastes 025, 026, 027 and 031, and BEFORE the stage 10 function deploys
-- and Stripe secrets. The prerequisite block below raises a plain sentence
-- naming the file to paste first, so a paste in the wrong place fails before
-- it changes anything. Never `db push` against ntssxktaduxzpsmejwyv. Pasting
-- this file twice is safe. Look for "payments and quota self-check passed".
--
-- DEPLOY. The webhook calls the twelve-argument grant_pass by name, so this
-- file goes in before `supabase functions deploy stripe-webhook`; a webhook
-- from before T265 calling the nine-argument version fails to resolve after
-- this paste, exactly as 026 described for 025, and Stripe retries until the
-- new function is deployed. The checkout function calls pass_can_buy and
-- fails with 503 until this file is in. The app changes (reason on the wire,
-- the pass_max message, the expiring gate) work either way.
--
-- DOWN, in this order:
--   drop function if exists public.grant_pass(uuid, text, text, text, text, text, text, int, text, text, int, text);
--   -- paste the grant_pass block and its two grant lines from 026 verbatim
--   drop function if exists public.pass_can_buy(uuid, text);
--   drop function if exists public.pass_horizon_days();
--   -- paste the admin_paywall_funnel block from 027, the admin_margin block
--   -- from 031, the admin_oss_threshold block from 026, and the ai_consume
--   -- and ai_refund blocks from 007, each with their grant lines
--   do $$ begin if exists (select 1 from pg_extension where extname = 'pg_cron')
--     then perform cron.unschedule('carta_oss_weekly'); end if; end $$;
--   drop function if exists public.oss_threshold_check();
--   drop table if exists public.oss_alerts;
--   drop table if exists public.ai_usage_days;
--   alter table public.pass_grants
--     drop column if exists reason, drop column if exists fee_cents,
--     drop column if exists fee_currency;
--   notify pgrst, 'reload schema';
-- Dropping the three columns loses the gate and the real fee on every sale
-- made while they existed; export pass_grants first on a database with sales.
-- Dropping ai_usage_days loses the day dimension and refunds go back to
-- debiting today.

-- ---------------------------------------------------------------------------
-- Prerequisites: fail before changing anything
-- ---------------------------------------------------------------------------
do $pre$
begin
  if not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                  where s.nspname = 'public' and p.proname = 'ai_free_epoch') then
    raise exception '044 needs 021_free_tier_once.sql first';
  end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'paywall_events') then
    raise exception '044 needs 022_paywall_events.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'pass_grants'
                    and column_name = 'consent_tos') then
    raise exception '044 needs 025_withdrawal_waiver.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'pass_grants'
                    and column_name = 'buyer_country') then
    raise exception '044 needs 026_oss_threshold.sql first';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                  where s.nspname = 'public' and p.proname = 't034_gate_kind') then
    raise exception '044 needs 027_paywall_funnel_kinds.sql first';
  end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'infra_ledger') then
    raise exception '044 needs 031_margin_dashboard.sql first';
  end if;
end;
$pre$;

-- ---------------------------------------------------------------------------
-- 1. The free row (T030-d)
-- ---------------------------------------------------------------------------
update public.plan_tiers set ai_plans = 2 where tier = 'free' and ai_plans <> 2;

comment on table public.plan_tiers is
  'Server-side tier catalogue. ai_plans, grounded and period_days are what '
  'ai_consume and grant_pass enforce. price_cents is documentation: the Stripe '
  'Price object charges, and the pricing UI renders continent-app/src/lib/'
  'pricing.js (checked against this file by scripts/verify_plan_tiers.mjs). '
  'The free row is 2 since 021; re-paste 044 after any re-run of the 007 insert.';

-- ---------------------------------------------------------------------------
-- 2. The day ledger (T037-c, T043-e)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null default current_date,
  kind    text not null check (kind in ('plan', 'ground')),
  n       int  not null default 0 check (n >= 0),
  primary key (user_id, day, kind)
);

create index if not exists ai_usage_days_day_idx on public.ai_usage_days (day, kind);

alter table public.ai_usage_days enable row level security;
revoke all on table public.ai_usage_days from public, anon, authenticated;

comment on table public.ai_usage_days is
  'Units spent per user, day and kind. Written by ai_consume beside the '
  'period-keyed ai_usage so a refund can name the day it reverses and the '
  'margin dashboard can price the units spent inside a month. Day is '
  'current_date in the database time zone, the same clock ai_daily_total uses.';

-- ai_consume, as in 007 with one addition: the day row is written last, after
-- both caps have passed, so a refusal never has to roll it back.
create or replace function public.ai_consume(
  p_user uuid, p_kind text, p_global_cap int
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r        record;
  cfg      public.plan_tiers%rowtype;
  v_cap    int;
  v_global int;
  v_n      int;
begin
  if p_kind not in ('plan', 'ground') then
    return jsonb_build_object('status', 'bad_kind');
  end if;

  select * into r from public.ai_resolve_tier(p_user);
  select * into cfg from public.plan_tiers where tier = r.tier;
  v_cap := case when p_kind = 'ground' then cfg.grounded else cfg.ai_plans end;

  if v_cap <= 0 then
    return jsonb_build_object('status', 'user_cap', 'tier', r.tier,
                              'cap', 0, 'used', 0, 'left', 0);
  end if;

  insert into public.ai_usage as u (user_id, period_start, kind, n)
    values (p_user, r.period_start, p_kind, 1)
    on conflict (user_id, period_start, kind) do update
      set n = u.n + 1
      where u.n < v_cap
    returning n into v_n;

  if v_n is null then
    select n into v_n from public.ai_usage
      where user_id = p_user and period_start = r.period_start and kind = p_kind;
    return jsonb_build_object('status', 'user_cap', 'tier', r.tier,
                              'cap', v_cap, 'used', coalesce(v_n, 0), 'left', 0);
  end if;

  insert into public.ai_daily_total as d (day, n)
    values (current_date, 1)
    on conflict (day) do update
      set n = d.n + 1
      where d.n < p_global_cap
    returning n into v_global;

  if v_global is null then
    update public.ai_usage set n = greatest(0, n - 1)
      where user_id = p_user and period_start = r.period_start and kind = p_kind;
    return jsonb_build_object('status', 'global_cap', 'tier', r.tier);
  end if;

  -- The grant is final: record the day it happened on.
  insert into public.ai_usage_days as dd (user_id, day, kind, n)
    values (p_user, current_date, p_kind, 1)
    on conflict (user_id, day, kind) do update set n = dd.n + 1;

  return jsonb_build_object(
    'status', 'ok',
    'tier',   r.tier,
    'cap',    v_cap,
    'used',   coalesce(v_n, 0),
    'left',   greatest(0, v_cap - coalesce(v_n, 0))
  );
end;
$$;

-- ai_refund names the day. The unit comes off the user's latest day row that
-- still holds one, and off the shared counter for that same day, so a spend
-- before midnight refunded after it is taken from the day it was added to.
-- A spend with no day row (written before 044) returns the user's period
-- unit as before and leaves the shared counter alone, which is the honest
-- choice when the day is unknown.
create or replace function public.ai_refund(p_user uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r     record;
  v_day date;
begin
  if p_kind not in ('plan', 'ground') then
    return;
  end if;
  select * into r from public.ai_resolve_tier(p_user);
  update public.ai_usage set n = greatest(0, n - 1)
    where user_id = p_user and period_start = r.period_start and kind = p_kind;

  select day into v_day from public.ai_usage_days
    where user_id = p_user and kind = p_kind and n > 0
    order by day desc limit 1;
  if v_day is null then
    return;
  end if;
  update public.ai_usage_days set n = n - 1
    where user_id = p_user and kind = p_kind and day = v_day and n > 0;
  update public.ai_daily_total set n = greatest(0, n - 1)
    where day = v_day;
end;
$$;

revoke all on function public.ai_consume(uuid, text, int) from public, anon, authenticated;
grant execute on function public.ai_consume(uuid, text, int) to service_role;
revoke all on function public.ai_refund(uuid, text) from public, anon, authenticated;
grant execute on function public.ai_refund(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3 and 4. The sale ledger columns, the horizon, grant_pass, pass_can_buy
-- ---------------------------------------------------------------------------
alter table public.pass_grants
  -- The paywall gate that sent the buyer to Stripe, carried through the
  -- session metadata. Letters only, at most 32, the same width 022 gives
  -- paywall_events.reason. NULL on sales from before this column and on a
  -- checkout opened from nowhere in particular.
  add column if not exists reason text
    check (reason is null or reason ~ '^[A-Za-z]{1,32}$'),
  -- Stripe's fee on the balance transaction behind the charge, in the
  -- smallest unit of fee_currency. NULL when the webhook could not read it.
  add column if not exists fee_cents int
    check (fee_cents is null or fee_cents >= 0),
  add column if not exists fee_currency text
    check (fee_currency is null or fee_currency ~ '^[a-z]{3}$');

comment on column public.pass_grants.reason is
  'The paywall gate reason the buyer came from (usePaywall GATES), from the '
  'Checkout Session metadata. The join key admin_paywall_funnel uses; NULL '
  'rows fall back to the nearest preceding checkout event.';
comment on column public.pass_grants.fee_cents is
  'Stripe fee from the balance transaction behind the charge, read by the '
  'webhook. admin_margin uses it when present and the modelled rate otherwise.';

-- How far ahead any pass may run. Three years from the day of the sale.
create or replace function public.pass_horizon_days()
returns int
language sql
immutable
set search_path = ''
as $$ select 1095 $$;

comment on function public.pass_horizon_days() is
  'Ceiling on entitlements.expires_at: never more than this many days from '
  'now(), whatever is bought. grant_pass clamps to it and pass_can_buy '
  'refuses a purchase that would be clamped to nothing.';

-- Can this user buy this tier right now? Called by the checkout function on
-- the service role before a Stripe session is opened, so nobody is charged
-- for days the horizon would take away. Returns ok true with the expiry a
-- grant would produce, or ok false with reason 'horizon'.
create or replace function public.pass_can_buy(p_user uuid, p_tier text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg      public.plan_tiers%rowtype;
  e        public.entitlements%rowtype;
  v_from   timestamptz;
  v_until  timestamptz;
  v_limit  timestamptz := now() + make_interval(days => public.pass_horizon_days());
begin
  select * into cfg from public.plan_tiers where tier = p_tier;
  if cfg.tier is null or cfg.period_days is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_tier');
  end if;
  select * into e from public.entitlements where user_id = p_user;
  v_from := case
    when e.expires_at is not null and e.expires_at > now() then e.expires_at
    else now()
  end;
  v_until := v_from + make_interval(days => cfg.period_days);
  -- Refuse only when the clamp would take back the WHOLE purchase: a pass
  -- already at the horizon gains nothing from another sale. "At" allows a
  -- day of slack, so a pass clamped a moment ago reads as at the horizon
  -- rather than a few milliseconds short of it.
  if v_from >= v_limit - interval '1 day' then
    return jsonb_build_object('ok', false, 'reason', 'horizon',
                              'expiresAt', e.expires_at, 'horizonAt', v_limit);
  end if;
  return jsonb_build_object('ok', true, 'expiresAt', least(v_until, v_limit),
                            'capped', v_until > v_limit);
end;
$$;

revoke all on function public.pass_can_buy(uuid, text) from public, anon, authenticated;
grant execute on function public.pass_can_buy(uuid, text) to service_role;

-- grant_pass. The nine-argument version from 026 is dropped first for the
-- same reason 025 and 026 give: defaulted parameters make a second overload,
-- and PostgREST calls by name would be ambiguous.
drop function if exists public.grant_pass(uuid, text, text, text, text, text, text, int, text);

create or replace function public.grant_pass(
  p_user uuid,
  p_tier text,
  p_session_id text,
  p_customer_id text default null,
  p_consent_tos text default null,
  p_consent_terms_url text default null,
  p_buyer_country text default null,
  p_amount_cents int default null,
  p_currency text default null,
  p_reason text default null,
  p_fee_cents int default null,
  p_fee_currency text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg      public.plan_tiers%rowtype;
  held     public.plan_tiers%rowtype;
  e        public.entitlements%rowtype;
  v_from   timestamptz;
  v_until  timestamptz;
  v_limit  timestamptz := now() + make_interval(days => public.pass_horizon_days());
  v_capped boolean := false;
  v_live   boolean := false;
  v_keep   boolean := false;
  v_tier   text;
  v_start  timestamptz;
  v_tos    text;
  v_cc     text;
  v_cur    text;
  v_reason text;
  v_feecur text;
begin
  select * into cfg from public.plan_tiers where tier = p_tier;
  if cfg.tier is null or cfg.period_days is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_tier');
  end if;

  -- Reporting fields are normalised, never trusted, and never fail a grant:
  -- the customer has already paid.
  v_tos := case when p_consent_tos in ('accepted', 'declined') then p_consent_tos else null end;
  v_cc  := nullif(upper(trim(coalesce(p_buyer_country, ''))), '');
  if v_cc is not null and v_cc !~ '^[A-Z]{2}$' then v_cc := null; end if;
  v_cur := nullif(lower(trim(coalesce(p_currency, ''))), '');
  if v_cur is not null and v_cur !~ '^[a-z]{3}$' then v_cur := null; end if;
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is not null and v_reason !~ '^[A-Za-z]{1,32}$' then v_reason := null; end if;
  v_feecur := nullif(lower(trim(coalesce(p_fee_currency, ''))), '');
  if v_feecur is not null and v_feecur !~ '^[a-z]{3}$' then v_feecur := null; end if;

  if exists (select 1 from public.pass_grants where session_id = p_session_id) then
    return jsonb_build_object('ok', true, 'replay', true);
  end if;

  select * into e from public.entitlements where user_id = p_user;
  v_live := e.user_id is not null and e.expires_at is not null and e.expires_at > now();
  v_from := case when v_live then e.expires_at else now() end;
  v_until := v_from + make_interval(days => cfg.period_days);

  -- The horizon (T031-c). Clamped rather than refused, because by the time
  -- this runs the money has moved; pass_can_buy is where a sale that would
  -- gain nothing is refused.
  if v_until > v_limit then
    v_until  := v_limit;
    v_capped := true;
  end if;

  -- The stacking rule (T031-b). A live pass of a higher rank is kept, with
  -- its period and allowance untouched, and gains the bought tier's days.
  -- Anything else (same tier, an upgrade, or no live pass) takes the bought
  -- tier and a fresh period, as 007 always did.
  if v_live then
    select * into held from public.plan_tiers where tier = e.tier;
    v_keep := held.tier is not null and held.rank > cfg.rank;
  end if;
  v_tier  := case when v_keep then e.tier else p_tier end;
  v_start := case when v_keep then e.period_start else now() end;

  insert into public.pass_grants
    (session_id, user_id, tier, expires_at, consent_tos, consent_at,
     consent_terms_url, buyer_country, amount_cents, currency,
     reason, fee_cents, fee_currency)
  values
    (p_session_id, p_user, p_tier, v_until,
     v_tos,
     case when v_tos is not null then now() else null end,
     case when v_tos is not null then nullif(p_consent_terms_url, '') else null end,
     v_cc,
     case when p_amount_cents is not null and p_amount_cents >= 0 then p_amount_cents else null end,
     v_cur,
     v_reason,
     case when p_fee_cents is not null and p_fee_cents >= 0 then p_fee_cents else null end,
     v_feecur);

  insert into public.entitlements as t
    (user_id, tier, period_start, expires_at, source, stripe_customer_id, last_session_id, updated_at)
  values
    (p_user, v_tier, v_start, v_until, 'stripe', p_customer_id, p_session_id, now())
  on conflict (user_id) do update set
    tier               = excluded.tier,
    period_start       = excluded.period_start,
    expires_at         = excluded.expires_at,
    source             = excluded.source,
    stripe_customer_id = coalesce(excluded.stripe_customer_id, t.stripe_customer_id),
    last_session_id    = excluded.last_session_id,
    updated_at         = now();

  return jsonb_build_object(
    'ok', true, 'tier', v_tier, 'bought', p_tier, 'expiresAt', v_until,
    'kept', v_keep, 'capped', v_capped,
    'consentTos', v_tos, 'buyerCountry', v_cc, 'reason', v_reason
  );
end;
$$;

revoke all on function
  public.grant_pass(uuid, text, text, text, text, text, text, int, text, text, int, text)
  from public, anon, authenticated;
grant execute on function
  public.grant_pass(uuid, text, text, text, text, text, text, int, text, text, int, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. The funnel joins on the reason column (T034-c)
-- ---------------------------------------------------------------------------
-- Same shape as 027. The only change is the attribution: a grant that
-- carries its own reason is counted under it, and only a grant with no
-- reason (written before this column, or from a checkout with no gate) uses
-- the nearest preceding checkout event inside one hour. The returned
-- `attribution` names which of the two the window actually used.
create or replace function public.admin_paywall_funnel(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err     text := public.admin_guard('read');
  v_days    int;
  v_since   timestamptz;
  v_reasons jsonb := '[]'::jsonb;
  v_daily   jsonb := '[]'::jsonb;
  v_kinds   jsonb := '[]'::jsonb;
  v_shown   bigint := 0;
  v_dism    bigint := 0;
  v_check   bigint := 0;
  v_bought  bigint := 0;
  v_guest   bigint := 0;
  v_tiers   jsonb := '[]'::jsonb;
  v_keyed   bigint := 0;
  v_est     bigint := 0;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  v_days  := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since := now() - make_interval(days => v_days);

  select count(*) filter (where event = 'shown'),
         count(*) filter (where event = 'dismissed'),
         count(*) filter (where event = 'checkout'),
         count(*) filter (where event = 'shown' and user_id is null)
    into v_shown, v_dism, v_check, v_guest
    from public.paywall_events
   where at > v_since;

  select count(*) into v_bought
    from public.pass_grants
   where granted_at > v_since;

  with attributed as (
    select g.session_id,
           coalesce(g.reason, c.reason) as reason,
           (g.reason is not null) as keyed
      from public.pass_grants g
      left join lateral (
        select c.reason
          from public.paywall_events c
         where g.reason is null
           and c.event = 'checkout'
           and c.user_id = g.user_id
           and c.tier = g.tier
           and c.at <= g.granted_at
           and c.at > g.granted_at - interval '1 hour'
           and c.at > v_since
         order by c.at desc
         limit 1
      ) c on true
     where g.granted_at > v_since
  ),
  events_by_reason as (
    select coalesce(reason, 'unknown') as reason,
           count(*) filter (where event = 'shown')     as shown,
           count(*) filter (where event = 'dismissed') as dismissed,
           count(*) filter (where event = 'checkout')  as checkout
      from public.paywall_events
     where at > v_since
     group by 1
  ),
  bought_by_reason as (
    select coalesce(reason, 'unknown') as reason, count(*) as bought
      from attributed
     where reason is not null
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'reason',         r.reason,
           'kind',           public.t034_gate_kind(r.reason),
           'shown',          r.shown,
           'dismissed',      r.dismissed,
           'checkout',       r.checkout,
           'bought',         coalesce(b.bought, 0),
           'conversionRate', case when r.shown > 0
                                   then round(100.0 * coalesce(b.bought, 0) / r.shown, 1)
                                   else 0 end
         ) order by r.shown desc), '[]'::jsonb)
    into v_reasons
    from events_by_reason r
    left join bought_by_reason b on b.reason = r.reason;

  with attributed as (
    select g.session_id,
           coalesce(g.reason, c.reason) as reason,
           (g.reason is not null) as keyed
      from public.pass_grants g
      left join lateral (
        select c.reason
          from public.paywall_events c
         where g.reason is null
           and c.event = 'checkout'
           and c.user_id = g.user_id
           and c.tier = g.tier
           and c.at <= g.granted_at
           and c.at > g.granted_at - interval '1 hour'
           and c.at > v_since
         order by c.at desc
         limit 1
      ) c on true
     where g.granted_at > v_since
  ),
  events_by_kind as (
    select public.t034_gate_kind(coalesce(reason, 'unknown')) as kind,
           count(*) filter (where event = 'shown')     as shown,
           count(*) filter (where event = 'dismissed') as dismissed,
           count(*) filter (where event = 'checkout')  as checkout
      from public.paywall_events
     where at > v_since
     group by 1
  ),
  bought_by_kind as (
    select public.t034_gate_kind(coalesce(reason, 'unknown')) as kind,
           count(*) as bought
      from attributed
     where reason is not null
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind',           k.kind,
           'shown',          k.shown,
           'dismissed',      k.dismissed,
           'checkout',       k.checkout,
           'bought',         coalesce(b.bought, 0),
           'conversionRate', case when k.shown > 0
                                   then round(100.0 * coalesce(b.bought, 0) / k.shown, 1)
                                   else 0 end
         ) order by k.kind), '[]'::jsonb)
    into v_kinds
    from events_by_kind k
    left join bought_by_kind b on b.kind = k.kind;

  -- How the grants in the window were attributed, so the reader knows whether
  -- `bought` is a join or an estimate.
  select count(*) filter (where reason is not null),
         count(*) filter (where reason is null)
    into v_keyed, v_est
    from public.pass_grants
   where granted_at > v_since;

  select coalesce(jsonb_agg(jsonb_build_object('tier', tier, 'n', n)
           order by n desc), '[]'::jsonb)
    into v_tiers
    from (
      select coalesce(tier, 'unknown') as tier, count(*) as n
        from public.paywall_events
       where at > v_since and event = 'checkout'
       group by 1
    ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
           'day', d::date, 'shown', coalesce(c.shown, 0), 'checkout', coalesce(c.checkout, 0))
           order by d), '[]'::jsonb)
    into v_daily
    from generate_series(v_since::date, current_date, interval '1 day') d
    left join (
      select at::date as day,
             count(*) filter (where event = 'shown')    as shown,
             count(*) filter (where event = 'checkout') as checkout
        from public.paywall_events
       where at > v_since
       group by 1
    ) c on c.day = d::date;

  return jsonb_build_object(
    'days',          v_days,
    'shown',         v_shown,
    'dismissed',     v_dism,
    'checkout',      v_check,
    'purchased',     v_bought,
    'shownGuest',    v_guest,
    'byReason',      v_reasons,
    'byKind',        v_kinds,
    'attribution',   case when v_est = 0 and v_keyed > 0 then 'reason_column'
                          when v_keyed = 0 then 'nearest_checkout_1h'
                          else 'mixed' end,
    'attributedByReason',   v_keyed,
    'attributedByEstimate', v_est,
    'byTier',        v_tiers,
    'daily',         v_daily
  );
end;
$$;

revoke all on function public.admin_paywall_funnel(int) from public, anon;
grant execute on function public.admin_paywall_funnel(int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2 and 4. admin_margin: AI units by day, Stripe fee from the charge
-- ---------------------------------------------------------------------------
-- Same five lines as 031. Two sources change. Line 3 reads fee_cents off each
-- sale when the webhook stored it and the documented rate otherwise, and says
-- which in stripe.basis (charge, mixed, modelled) with the two counts beside
-- it. Line 4 reads ai_usage_days for the days inside the month, so a Year
-- Pass bought in March no longer lands its whole allowance in March.
create or replace function public.admin_margin(p_months_back int default 1)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err     text := public.admin_guard('read');
  v_back    int;
  v_from    timestamptz;
  v_to      timestamptz;
  v_month   date;
  v_assumed int := 685;
  v_plan_c  numeric := 1.0;
  v_grnd_c  numeric := 5.0;
  v_oss     boolean := false;
  v_sales   bigint;
  v_gross   bigint;
  v_vat     numeric;
  v_fee     numeric;
  v_fee_obs bigint;
  v_fee_mod bigint;
  v_net     numeric;
  v_plan_u  bigint;
  v_grnd_u  bigint;
  v_ai      numeric;
  v_infra   bigint;
  v_actual  bigint;
  v_modelled bigint;
  v_contrib numeric;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  v_back := least(greatest(coalesce(p_months_back, 1), 0), 36);

  v_month := (date_trunc('month', (now() at time zone 'Europe/Amsterdam'))
              - (v_back || ' months')::interval)::date;
  v_from  := (v_month::timestamp) at time zone 'Europe/Amsterdam';
  v_to    := ((v_month + interval '1 month')::timestamp) at time zone 'Europe/Amsterdam';

  begin
    select coalesce((select (value #>> '{}')::numeric from public.site_config
                      where key = 'ai_cost_plan_cents'), v_plan_c),
           coalesce((select (value #>> '{}')::numeric from public.site_config
                      where key = 'ai_cost_ground_cents'), v_grnd_c)
      into v_plan_c, v_grnd_c;
  exception when others then
    v_plan_c := 1.0; v_grnd_c := 5.0;
  end;

  select coalesce(bool_or(cents > 1000000), false) into v_oss
    from (
      select date_part('year', g.granted_at)::int as yr,
             coalesce(sum(g.amount_cents), 0)::bigint as cents
        from public.pass_grants g
       where g.buyer_country is not null
         and g.buyer_country <> 'BE'
         and g.buyer_country = any (public.eu_member_states())
       group by 1
    ) y
   where y.yr >= date_part('year', now())::int - 1;

  -- Lines 1 to 3. VAT is backed out of the inclusive gross, as in 031. The
  -- Stripe fee is the stored charge fee where there is one (only when it is
  -- in euros, so a sum stays a sum) and the documented rate per sale where
  -- there is not; Stripe Tax's 0.5 percent is added to both.
  select count(*),
         coalesce(sum(g.amount_cents), 0),
         coalesce(sum(
           g.amount_cents::numeric
           * (case when v_oss then public.eu_vat_bp(g.buyer_country)
                   else 2100 end)::numeric
           / (10000 + (case when v_oss then public.eu_vat_bp(g.buyer_country)
                            else 2100 end))::numeric), 0),
         coalesce(sum(
           case when g.fee_cents is not null and coalesce(g.fee_currency, 'eur') = 'eur'
                -- Stripe Tax bills its 0.5 percent separately, never on the
                -- balance transaction, so it is added to the observed fee.
                then g.fee_cents::numeric + g.amount_cents::numeric * 0.005
                else g.amount_cents::numeric
                     * (case when g.buyer_country = any (public.eu_member_states())
                               or g.buyer_country in ('IS', 'LI', 'NO')
                             then 0.015 else 0.029 end)
                     + 25
                     + g.amount_cents::numeric * 0.005
           end), 0),
         count(*) filter (where g.fee_cents is not null and coalesce(g.fee_currency, 'eur') = 'eur'),
         count(*) filter (where g.fee_cents is null or coalesce(g.fee_currency, 'eur') <> 'eur')
    into v_sales, v_gross, v_vat, v_fee, v_fee_obs, v_fee_mod
    from public.pass_grants g
   where g.granted_at >= v_from and g.granted_at < v_to
     and g.amount_cents is not null
     and coalesce(g.currency, 'eur') = 'eur';

  v_net := v_gross::numeric - v_vat - v_fee;

  -- Line 4, units spent on days inside the month.
  select coalesce(sum(u.n) filter (where u.kind = 'plan'), 0),
         coalesce(sum(u.n) filter (where u.kind = 'ground'), 0)
    into v_plan_u, v_grnd_u
    from public.ai_usage_days u
   where u.day >= v_month
     and u.day < (v_month + interval '1 month')::date;

  v_ai := v_plan_u::numeric * v_plan_c + v_grnd_u::numeric * v_grnd_c;

  -- Line 5.
  select coalesce(sum(cents), 0),
         coalesce(count(*) filter (where source = 'actual'), 0),
         coalesce(count(*) filter (where source = 'model'), 0)
    into v_infra, v_actual, v_modelled
    from public.infra_ledger
   where month = v_month and currency = 'eur';

  v_contrib := case when v_sales > 0
    then (v_net - v_ai - v_infra::numeric) / v_sales::numeric
    else null end;

  return jsonb_build_object(
    'month',       to_char(v_month, 'YYYY-MM'),
    'monthsBack',  v_back,
    'closed',      v_back > 0,
    'currency',    'eur',
    'assumedContributionCents', v_assumed,

    'sales', jsonb_build_object(
      'count',      v_sales,
      'grossCents', v_gross,
      'byTier', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'tier', tier, 'count', n, 'grossCents', cents)
                 order by cents desc)
          from (
            select g.tier, count(*) as n, coalesce(sum(g.amount_cents), 0) as cents
              from public.pass_grants g
             where g.granted_at >= v_from and g.granted_at < v_to
               and g.amount_cents is not null
               and coalesce(g.currency, 'eur') = 'eur'
             group by g.tier
          ) s
      ), '[]'::jsonb),
      'excludedNoAmount', (
        select count(*) from public.pass_grants g
         where g.granted_at >= v_from and g.granted_at < v_to
           and g.amount_cents is null),
      'excludedCurrency', (
        select count(*) from public.pass_grants g
         where g.granted_at >= v_from and g.granted_at < v_to
           and g.amount_cents is not null
           and coalesce(g.currency, 'eur') <> 'eur'),
      'unknownCountry', (
        select count(*) from public.pass_grants g
         where g.granted_at >= v_from and g.granted_at < v_to
           and g.amount_cents is not null
           and g.buyer_country is null),
      'nonEu', (
        select count(*) from public.pass_grants g
         where g.granted_at >= v_from and g.granted_at < v_to
           and g.amount_cents is not null
           and g.buyer_country is not null
           and not (g.buyer_country = any (public.eu_member_states())))
    ),

    'vat', jsonb_build_object(
      'cents', round(v_vat)::bigint,
      'basis', case when v_oss then 'buyer_country' else 'belgium_21' end,
      'ossBreached', v_oss,
      'inclusive', true
    ),

    'stripe', jsonb_build_object(
      'cents', round(v_fee)::bigint,
      'basis', case when v_sales = 0 then 'modelled'
                    when v_fee_mod = 0 then 'charge'
                    when v_fee_obs = 0 then 'modelled'
                    else 'mixed' end,
      'chargeRows',   v_fee_obs,
      'modelledRows', v_fee_mod,
      'rateEea', '1.5% + EUR 0.25',
      'rateOther', '2.9% + EUR 0.25',
      'tax', '0.5%'
    ),

    'netReceiptsCents', round(v_net)::bigint,

    'ai', jsonb_build_object(
      'planUnits',   v_plan_u,
      'groundUnits', v_grnd_u,
      'planCents',   round(v_plan_u::numeric * v_plan_c)::bigint,
      'groundCents', round(v_grnd_u::numeric * v_grnd_c)::bigint,
      'cents',       round(v_ai)::bigint,
      'planPrice',   v_plan_c,
      'groundPrice', v_grnd_c,
      'basis',       'units observed by day, price modelled',
      -- The shared daily counter over the same days. It should equal the
      -- two unit figures added together; a gap is a refund from before 044
      -- or a unit spent before the day ledger existed.
      'dailyTotalUnits', coalesce((
        select sum(n) from public.ai_daily_total
         where day >= v_month and day < (v_month + interval '1 month')::date), 0)
    ),

    'infra', jsonb_build_object(
      'cents',        v_infra,
      'actualRows',   v_actual,
      'modelledRows', v_modelled,
      'reconciled',   (v_actual > 0 and v_modelled = 0),
      'perPurchaseCents', case when v_sales > 0
        then round(v_infra::numeric / v_sales::numeric, 2) else null end,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'item', item, 'cents', cents, 'source', source, 'note', note)
                 order by cents desc, item)
          from public.infra_ledger
         where month = v_month and currency = 'eur'
      ), '[]'::jsonb)
    ),

    'contribution', jsonb_build_object(
      'perPurchaseCents', case when v_contrib is null
        then null else round(v_contrib, 2) end,
      'totalCents', case when v_sales > 0
        then round(v_net - v_ai - v_infra::numeric)::bigint else null end,
      'assumedCents', v_assumed,
      'deltaCents', case when v_contrib is null
        then null else round(v_contrib - v_assumed, 2) end,
      'deltaPct', case when v_contrib is null
        then null else round(((v_contrib - v_assumed) / v_assumed) * 100, 1) end
    )
  );
end;
$$;

revoke all on function public.admin_margin(int) from public, anon;
grant execute on function public.admin_margin(int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. The OSS check on a schedule (T033-f)
-- ---------------------------------------------------------------------------
create table if not exists public.oss_alerts (
  year        int  primary key,
  cents       bigint not null,
  pct         numeric not null,
  warn_pct    int  not null,
  raised_at   timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  acknowledged_at timestamptz
);

alter table public.oss_alerts enable row level security;
revoke all on table public.oss_alerts from public, anon, authenticated;

comment on table public.oss_alerts is
  'One row per calendar year in which the cross-border EU B2C figure passed '
  'the warning level. Written by oss_threshold_check() on a schedule, read '
  'through admin_oss_threshold(). acknowledged_at is for the admin screen.';

-- No admin guard: this runs as the database itself from pg_cron, where there
-- is no auth.uid(). It writes nothing but the alert row, and it is not
-- granted to any client role.
create or replace function public.oss_threshold_check()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit int := 1000000;
  v_warn  int := 70;
  v_year  int := date_part('year', now())::int;
  v_cents bigint := 0;
  v_pct   numeric := 0;
  v_raised boolean := false;
begin
  begin
    select (value #>> '{}')::int into v_warn
      from public.site_config where key = 'oss_warn_pct';
  exception when others then
    v_warn := null;
  end;
  v_warn := least(greatest(coalesce(v_warn, 70), 1), 100);

  select coalesce(sum(g.amount_cents), 0) into v_cents
    from public.pass_grants g
   where date_part('year', g.granted_at)::int = v_year
     and g.buyer_country is not null
     and g.buyer_country <> 'BE'
     and g.buyer_country = any (public.eu_member_states());
  v_pct := round((v_cents::numeric / v_limit) * 100, 1);

  if v_pct >= v_warn then
    insert into public.oss_alerts as a (year, cents, pct, warn_pct)
      values (v_year, v_cents, v_pct, v_warn)
      on conflict (year) do update set
        cents = excluded.cents, pct = excluded.pct,
        warn_pct = excluded.warn_pct, updated_at = now();
    v_raised := true;
  end if;

  return jsonb_build_object('year', v_year, 'cents', v_cents, 'pct', v_pct,
                            'warnPct', v_warn, 'raised', v_raised);
end;
$$;

revoke all on function public.oss_threshold_check() from public, anon, authenticated;
grant execute on function public.oss_threshold_check() to service_role;

-- Weekly, Monday 06:00 UTC, when pg_cron is available. cron.schedule with a
-- job name replaces an existing job of that name, so a re-paste is safe.
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('carta_oss_weekly', '0 6 * * 1', 'select public.oss_threshold_check()');
    raise notice 'oss_threshold_check scheduled weekly through pg_cron';
  else
    raise notice 'pg_cron is not enabled: enable it under Database, Extensions, then run '
      'select cron.schedule(''carta_oss_weekly'', ''0 6 * * 1'', ''select public.oss_threshold_check()'');';
  end if;
end;
$cron$;

-- admin_oss_threshold, as in 026 plus the alerts and the warning level.
create or replace function public.admin_oss_threshold()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err       text := public.admin_guard('read');
  v_limit     int  := 1000000;
  v_warn      int  := 70;
  v_years     jsonb := '[]'::jsonb;
  v_unknown   bigint := 0;
  v_noamount  bigint := 0;
  v_currency  jsonb := '[]'::jsonb;
  v_alerts    jsonb := '[]'::jsonb;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  begin
    select (value #>> '{}')::int into v_warn
      from public.site_config where key = 'oss_warn_pct';
  exception when others then
    v_warn := null;
  end;
  v_warn := least(greatest(coalesce(v_warn, 70), 1), 100);

  with eu as (
    select date_part('year', g.granted_at)::int as yr,
           coalesce(sum(g.amount_cents), 0)::bigint as cents,
           count(*)::bigint as sales,
           count(distinct g.buyer_country)::bigint as countries
      from public.pass_grants g
     where g.buyer_country is not null
       and g.buyer_country <> 'BE'
       and g.buyer_country = any (public.eu_member_states())
     group by 1
  ),
  withprev as (
    select yr, cents, sales, countries,
           coalesce(lag(cents) over (order by yr), 0) as prev_cents
      from eu
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'year',      yr,
           'cents',     cents,
           'sales',     sales,
           'countries', countries,
           'pct',       round((cents::numeric / v_limit) * 100, 1),
           'breached',  (cents > v_limit or prev_cents > v_limit)
         ) order by yr desc), '[]'::jsonb)
    into v_years
    from withprev;

  select count(*) filter (where buyer_country is null),
         count(*) filter (where amount_cents is null)
    into v_unknown, v_noamount
    from public.pass_grants;

  select coalesce(jsonb_agg(jsonb_build_object('currency', c, 'sales', n)
           order by n desc), '[]'::jsonb)
    into v_currency
    from (
      select coalesce(currency, 'unknown') as c, count(*) as n
        from public.pass_grants
       where amount_cents is not null
       group by 1
    ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
           'year', year, 'cents', cents, 'pct', pct, 'warnPct', warn_pct,
           'raisedAt', raised_at, 'updatedAt', updated_at,
           'acknowledgedAt', acknowledged_at)
           order by year desc), '[]'::jsonb)
    into v_alerts
    from public.oss_alerts;

  return jsonb_build_object(
    'thresholdCents', v_limit,
    'warnPct',        v_warn,
    'years',          v_years,
    'currentYear',    date_part('year', now())::int,
    'currentCents',   coalesce((
      select (y->>'cents')::bigint from jsonb_array_elements(v_years) y
       where (y->>'year')::int = date_part('year', now())::int
    ), 0),
    'currentPct',     coalesce((
      select (y->>'pct')::numeric from jsonb_array_elements(v_years) y
       where (y->>'year')::int = date_part('year', now())::int
    ), 0),
    'breached',       coalesce((
      select bool_or((y->>'breached')::boolean) from jsonb_array_elements(v_years) y
       where (y->>'year')::int >= date_part('year', now())::int - 1
    ), false),
    'unknownCountry', v_unknown,
    'unknownAmount',  v_noamount,
    'currencies',     v_currency,
    'alerts',         v_alerts,
    'scheduled',      exists (select 1 from pg_extension where extname = 'pg_cron')
  );
end;
$$;

revoke all on function public.admin_oss_threshold() from public, anon;
grant execute on function public.admin_oss_threshold() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $chk$
declare
  gp  text := 'public.grant_pass(uuid,text,text,text,text,text,text,int,text,text,int,text)';
  n   int;
  def text;
  j   jsonb;
begin
  -- The free row says 2, as 021 intended.
  select ai_plans into n from public.plan_tiers where tier = 'free';
  if n <> 2 then
    raise exception 'plan_tiers.free is % plans, expected 2; the 007 insert was re-run', n;
  end if;

  -- One grant_pass, the twelve-argument one.
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'grant_pass';
  if n <> 1 then
    raise exception 'expected exactly one grant_pass, found %; paste 044 again', n;
  end if;
  if not (select prosecdef from pg_proc where oid = gp::regprocedure::oid) then
    raise exception '% is not SECURITY DEFINER', gp;
  end if;
  if has_function_privilege('anon', gp, 'execute')
     or has_function_privilege('authenticated', gp, 'execute') then
    raise exception 'a client role can execute %', gp;
  end if;
  def := pg_get_functiondef(gp::regprocedure::oid);
  if position('pass_horizon_days()' in def) = 0 or position('held.rank > cfg.rank' in def) = 0 then
    raise exception 'grant_pass lost the horizon or the stacking rule';
  end if;
  if position('session_id = p_session_id' in def) = 0 then
    raise exception 'grant_pass lost the replay guard';
  end if;

  -- The three new sale columns exist and the day ledger is closed to clients.
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'pass_grants'
     and column_name in ('reason', 'fee_cents', 'fee_currency');
  if n <> 3 then
    raise exception 'pass_grants should carry reason, fee_cents and fee_currency, found %', n;
  end if;
  if has_table_privilege('anon', 'public.ai_usage_days', 'SELECT')
     or has_table_privilege('authenticated', 'public.ai_usage_days', 'SELECT')
     or has_table_privilege('authenticated', 'public.oss_alerts', 'SELECT') then
    raise exception 'a client role can read ai_usage_days or oss_alerts';
  end if;

  -- The quota functions write and read the day ledger.
  def := pg_get_functiondef('public.ai_consume(uuid,text,int)'::regprocedure::oid);
  if position('ai_usage_days' in def) = 0 then
    raise exception 'ai_consume does not write ai_usage_days';
  end if;
  def := pg_get_functiondef('public.ai_refund(uuid,text)'::regprocedure::oid);
  if position('order by day desc' in def) = 0 then
    raise exception 'ai_refund does not name the day it refunds';
  end if;

  -- pass_can_buy is service-role only and refuses an unknown tier.
  if has_function_privilege('authenticated', 'public.pass_can_buy(uuid,text)', 'execute') then
    raise exception 'authenticated can execute pass_can_buy';
  end if;
  j := public.pass_can_buy('00000000-0000-0000-0000-000000000000'::uuid, 'free');
  if (j ->> 'ok') <> 'false' or (j ->> 'reason') <> 'bad_tier' then
    raise exception 'pass_can_buy accepted the free tier: %', j;
  end if;

  -- The reporting functions still refuse a caller who is not an admin.
  if (public.admin_paywall_funnel(7) ->> 'error') is null then
    raise exception 'admin_paywall_funnel answered a non-admin';
  end if;
  if (public.admin_margin(1) ->> 'error') is null then
    raise exception 'admin_margin answered a non-admin';
  end if;
  if (public.admin_oss_threshold() ->> 'error') is null then
    raise exception 'admin_oss_threshold answered a non-admin';
  end if;

  -- The scheduled check runs and, with nothing sold, raises nothing.
  j := public.oss_threshold_check();
  if (j ->> 'warnPct') is null then
    raise exception 'oss_threshold_check returned no warning level: %', j;
  end if;

  raise notice 'payments and quota self-check passed';
end;
$chk$;

notify pgrst, 'reload schema';
