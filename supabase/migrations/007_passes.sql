-- Passes: the paid tier layer (Free / Trip Pass / Year Pass).
--
-- WHAT CHANGED AND WHY. Migration 006 built the AI quota ledger around a
-- zero-billing posture: a Gemini key on a Google project with NO billing
-- account, guarded by per-user and global DAILY caps so quota exhaustion
-- returned 429 rather than an invoice. That posture is no longer available.
-- Google's Gemini API Additional Terms (effective 2026-03-23) state:
--
--   "You may use only Paid Services when making API Clients available to
--    users in the European Economic Area, Switzerland, or the United
--    Kingdom."
--
-- Carta's users are European by definition, so the key MUST sit on a project
-- with an active Cloud Billing account. "Paid Services" is defined by the
-- billing account existing, not by money actually being charged, so attaching
-- billing is what makes us compliant; it does not by itself create a bill.
--
-- The caps therefore change meaning. They are no longer a billing guarantee
-- (the account can now be charged), they are a COST CEILING and an abuse
-- guard. That is why quota moves from "per day" to "per entitlement period",
-- and why grounded search (the one genuinely metered Gemini surface) gets its
-- own counter instead of riding on the plan counter.
--
-- Apply in the Supabase SQL editor. Do NOT run `supabase db push` against the
-- live project.

-- ---------------------------------------------------------------------------
-- Tier catalogue. A table rather than constants so prices and fair-use caps
-- can be tuned with an UPDATE instead of a migration + redeploy. The Edge
-- Functions read caps from here; the client mirror in
-- continent-app/src/lib/pricing.js is display-only and is never trusted.
-- ---------------------------------------------------------------------------
create table if not exists public.plan_tiers (
  tier         text primary key check (tier in ('free', 'trip', 'year')),
  -- Fair-use ceilings for one entitlement period.
  ai_plans     int  not null,
  -- Grounded (live web search) generations. Metered by Google per search
  -- query on Gemini 3, so this is the line item that can actually cost money.
  grounded     int  not null,
  -- Length of the entitlement period in days. NULL means "calendar month",
  -- which is how the free tier resets.
  period_days  int,
  price_cents  int  not null,
  currency     text not null default 'eur',
  -- Sort order for the pricing UI.
  rank         int  not null default 0
);

-- Prices reflect the 2026-07 pricing review. The Trip Pass sits at EUR 6.99
-- rather than EUR 3.99 because Stripe's fixed EUR 0.25 component is 6.3% of a
-- EUR 3.99 ticket (7.8% all-in) against 5.1% at EUR 6.99, and because the
-- Year Pass has to stay near a 2x multiple of it: at 3.76x the annual tier was
-- dominated by simply buying two Trip Passes, which is what a real traveller
-- with two trips a year would do.
insert into public.plan_tiers (tier, ai_plans, grounded, period_days, price_cents, rank)
values
  ('free',   3,   0, null,    0, 0),
  ('trip',  60,  40,   30,  699, 1),
  ('year', 300, 200,  365, 1499, 2)
on conflict (tier) do update set
  ai_plans    = excluded.ai_plans,
  grounded    = excluded.grounded,
  period_days = excluded.period_days,
  price_cents = excluded.price_cents,
  rank        = excluded.rank;

alter table public.plan_tiers enable row level security;

-- The tier catalogue is public information: the pricing UI reads it so a price
-- change lands without an app redeploy. Read-only to everyone, writable only
-- by service_role (which bypasses RLS).
drop policy if exists "plan_tiers_read_all" on public.plan_tiers;
create policy "plan_tiers_read_all" on public.plan_tiers
  for select using (true);

-- ---------------------------------------------------------------------------
-- One row per user who has ever held a pass. Absence of a row means free.
-- ---------------------------------------------------------------------------
create table if not exists public.entitlements (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  tier               text not null default 'free' references public.plan_tiers(tier),
  -- When the current period opened. Quota counters key off this date, so a
  -- renewal that moves it forward also resets the allowance.
  period_start       timestamptz not null default now(),
  -- NULL for free. A pass whose expires_at has passed silently resolves back
  -- to free on the next call; nothing needs to sweep the table.
  expires_at         timestamptz,
  source             text not null default 'free' check (source in ('free', 'stripe', 'manual')),
  stripe_customer_id text,
  -- Last Checkout session applied, so a replayed webhook is a no-op.
  last_session_id    text,
  updated_at         timestamptz not null default now()
);

create index if not exists entitlements_expires_idx on public.entitlements (expires_at);

-- Every session ever applied, which is what makes grant_pass idempotent.
--
-- entitlements.last_session_id cannot carry that job on its own: a second
-- purchase overwrites it, so a late retry of the FIRST webhook would no longer
-- recognise itself and would extend the pass a second time. Stripe retries for
-- days, and buying twice inside that window is ordinary behaviour for someone
-- who extends a pass mid-trip. This table also doubles as the purchase history
-- that any refund question will need.
create table if not exists public.pass_grants (
  session_id  text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  tier        text not null references public.plan_tiers(tier),
  expires_at  timestamptz not null,
  granted_at  timestamptz not null default now()
);

create index if not exists pass_grants_user_idx on public.pass_grants (user_id, granted_at desc);

alter table public.pass_grants enable row level security;

-- A traveller may see what they bought. Only the webhook writes.
drop policy if exists "pass_grants_select_own" on public.pass_grants;
create policy "pass_grants_select_own" on public.pass_grants
  for select using (auth.uid() = user_id);

alter table public.entitlements enable row level security;

-- A user may READ their own entitlement (the UI shows "Trip Pass, 12 days
-- left"). Nobody may write it from the client: grants come from the Stripe
-- webhook through the service role.
drop policy if exists "entitlements_select_own" on public.entitlements;
create policy "entitlements_select_own" on public.entitlements
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Usage ledger, keyed by the period the entitlement is in rather than by day.
-- `kind` separates the cheap surface from the metered one:
--   'plan'   an AI generation (token cost only, effectively free on Flash)
--   'ground' a generation that used Google Search grounding (billed per query)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage (
  user_id      uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  kind         text not null check (kind in ('plan', 'ground')),
  n            int  not null default 0,
  primary key (user_id, period_start, kind)
);

create index if not exists ai_usage_period_idx on public.ai_usage (period_start);

alter table public.ai_usage enable row level security;

-- The global abuse ceiling needs a per-DAY total, and public.ai_usage no
-- longer has a day dimension to sum over (its rows are keyed by entitlement
-- period, which for a Year Pass holder is a single row for 365 days). So the
-- daily total gets its own one-row-per-day counter.
create table if not exists public.ai_daily_total (
  day date primary key default current_date,
  n   int  not null default 0
);

alter table public.ai_daily_total enable row level security;

-- Superseded by public.ai_usage. Left in place (not dropped) so a rollback to
-- 006 still has its ledger; safe to drop once 007 has been live a while.
comment on table public.ai_plan_usage is
  'DEPRECATED as of migration 007. Replaced by public.ai_usage (period-keyed).';

-- ---------------------------------------------------------------------------
-- Resolve a user's live tier and the period its quota counts against.
-- Expiry is evaluated here rather than swept, so a lapsed pass costs nothing
-- to clean up and can never leave a user holding quota they no longer own.
-- ---------------------------------------------------------------------------
create or replace function public.ai_resolve_tier(p_user uuid)
returns table (tier text, period_start date, expires_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.entitlements%rowtype;
begin
  select * into e from public.entitlements where user_id = p_user;

  -- No row, a free row, or a lapsed pass all mean the same thing. The free
  -- allowance runs on calendar months so it resets on a date the traveller
  -- can predict without being told.
  if e.user_id is null
     or e.tier = 'free'
     or e.expires_at is null
     or e.expires_at <= now() then
    return query select 'free'::text, date_trunc('month', now())::date, null::timestamptz;
  else
    return query select e.tier, e.period_start::date, e.expires_at;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Read-only view of where a user stands. The UI calls this to render
-- "2 of 3 plans left" and to decide whether to show the upsell, WITHOUT
-- spending anything.
-- ---------------------------------------------------------------------------
create or replace function public.ai_status(p_user uuid default auth.uid())
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r        record;
  cfg      public.plan_tiers%rowtype;
  v_plans  int;
  v_ground int;
  v_resets timestamptz;
begin
  -- Two legitimate callers: a signed-in browser asking about itself, and an
  -- Edge Function on the service role (where auth.uid() is null). Spelled out
  -- rather than left to `p_user <> auth.uid()` returning NULL for the service
  -- role, which would pass the guard by accident rather than by intent.
  if p_user is null then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if auth.uid() is not null and p_user <> auth.uid() then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select * into r from public.ai_resolve_tier(p_user);
  select * into cfg from public.plan_tiers where tier = r.tier;

  select coalesce(sum(n) filter (where kind = 'plan'), 0),
         coalesce(sum(n) filter (where kind = 'ground'), 0)
    into v_plans, v_ground
    from public.ai_usage
    where user_id = p_user and period_start = r.period_start;

  -- When the allowance next refills. For free that is the first of next
  -- month; for a pass it is when the pass itself ends.
  v_resets := case
    when cfg.period_days is null
      then (date_trunc('month', now()) + interval '1 month')
    else r.expires_at
  end;

  return jsonb_build_object(
    'tier',         r.tier,
    'expiresAt',    r.expires_at,
    'periodStart',  r.period_start,
    'resetsAt',     v_resets,
    'plansUsed',    v_plans,
    'plansCap',     cfg.ai_plans,
    'plansLeft',    greatest(0, cfg.ai_plans - v_plans),
    'groundUsed',   v_ground,
    'groundCap',    cfg.grounded,
    'groundLeft',   greatest(0, cfg.grounded - v_ground)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomically consume one unit. Returns the same shape as ai_status plus a
-- 'status' field: 'ok' | 'user_cap' | 'global_cap'.
--
-- p_global_cap is a daily abuse ceiling across ALL users, kept from 006. It no
-- longer underwrites a zero-billing promise (billing is attached now, as the
-- terms require) but it is still the thing standing between a scripted client
-- and a surprise Gemini invoice, so it stays.
-- ---------------------------------------------------------------------------
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

  -- A tier with a zero allowance for this surface never reaches the ledger.
  if v_cap <= 0 then
    return jsonb_build_object('status', 'user_cap', 'tier', r.tier,
                              'cap', 0, 'used', 0, 'left', 0);
  end if;

  -- Per-user cap first. Doing the global ceiling first would let somebody who
  -- has already exhausted their own allowance keep draining the shared daily
  -- budget on requests that were going to be refused anyway.
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

  -- Global daily ceiling. Incremented by the same statement that tests it, so
  -- two concurrent callers cannot both claim the last slot.
  insert into public.ai_daily_total as d (day, n)
    values (current_date, 1)
    on conflict (day) do update
      set n = d.n + 1
      where d.n < p_global_cap
    returning n into v_global;

  if v_global is null then
    -- Hand the user's unit back: the call is not going to happen, so it must
    -- not count against the allowance they paid for.
    update public.ai_usage set n = greatest(0, n - 1)
      where user_id = p_user and period_start = r.period_start and kind = p_kind;
    return jsonb_build_object('status', 'global_cap', 'tier', r.tier);
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'tier',   r.tier,
    'cap',    v_cap,
    'used',   coalesce(v_n, 0),
    'left',   greatest(0, v_cap - coalesce(v_n, 0))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Hand a consumed unit back, for when the AI call fails AFTER quota was spent.
-- A model outage or a malformed response is our problem, not something a
-- traveller should pay an allowance for. Floors at zero so a double refund
-- cannot mint credit.
-- ---------------------------------------------------------------------------
create or replace function public.ai_refund(p_user uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if p_kind not in ('plan', 'ground') then
    return;
  end if;
  select * into r from public.ai_resolve_tier(p_user);
  update public.ai_usage set n = greatest(0, n - 1)
    where user_id = p_user and period_start = r.period_start and kind = p_kind;
  update public.ai_daily_total set n = greatest(0, n - 1)
    where day = current_date;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grant a pass. Called ONLY by the Stripe webhook through the service role.
-- Idempotent on p_session_id: Stripe retries webhooks, and a retry must not
-- extend the pass a second time.
--
-- Stacking rule: buying while a pass is still live EXTENDS it from its current
-- expiry rather than from today, so an early renewal never burns days. The
-- quota period moves to now() either way, which refills the allowance.
-- ---------------------------------------------------------------------------
create or replace function public.grant_pass(
  p_user uuid, p_tier text, p_session_id text, p_customer_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg     public.plan_tiers%rowtype;
  e       public.entitlements%rowtype;
  v_from  timestamptz;
  v_until timestamptz;
begin
  select * into cfg from public.plan_tiers where tier = p_tier;
  if cfg.tier is null or cfg.period_days is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_tier');
  end if;

  -- Replay guard, against the permanent ledger rather than against the
  -- entitlement's last_session_id (which a later purchase overwrites).
  if exists (select 1 from public.pass_grants where session_id = p_session_id) then
    return jsonb_build_object('ok', true, 'replay', true);
  end if;

  select * into e from public.entitlements where user_id = p_user;
  v_from := case
    when e.expires_at is not null and e.expires_at > now() then e.expires_at
    else now()
  end;
  v_until := v_from + make_interval(days => cfg.period_days);

  -- Recorded FIRST. If this insert loses a race with a concurrent delivery of
  -- the same session, the primary key rejects it and the whole function rolls
  -- back, which is the outcome we want: exactly one grant survives.
  insert into public.pass_grants (session_id, user_id, tier, expires_at)
    values (p_session_id, p_user, p_tier, v_until);

  insert into public.entitlements as t
    (user_id, tier, period_start, expires_at, source, stripe_customer_id, last_session_id, updated_at)
  values
    (p_user, p_tier, now(), v_until, 'stripe', p_customer_id, p_session_id, now())
  on conflict (user_id) do update set
    tier               = excluded.tier,
    period_start       = excluded.period_start,
    expires_at         = excluded.expires_at,
    source             = excluded.source,
    stripe_customer_id = coalesce(excluded.stripe_customer_id, t.stripe_customer_id),
    last_session_id    = excluded.last_session_id,
    updated_at         = now();

  return jsonb_build_object('ok', true, 'tier', p_tier, 'expiresAt', v_until);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. ai_status is the only one the browser may call, and only for itself
-- (it re-checks auth.uid() internally). Everything that spends or grants is
-- service_role only, reachable from Edge Functions and nowhere else.
-- ---------------------------------------------------------------------------
revoke all on function public.ai_resolve_tier(uuid) from public, anon, authenticated;
grant execute on function public.ai_resolve_tier(uuid) to service_role;

revoke all on function public.ai_consume(uuid, text, int) from public, anon, authenticated;
grant execute on function public.ai_consume(uuid, text, int) to service_role;

revoke all on function public.ai_refund(uuid, text) from public, anon, authenticated;
grant execute on function public.ai_refund(uuid, text) to service_role;

revoke all on function public.grant_pass(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.grant_pass(uuid, text, text, text) to service_role;

revoke all on function public.ai_status(uuid) from public, anon;
grant execute on function public.ai_status(uuid) to authenticated, service_role;
