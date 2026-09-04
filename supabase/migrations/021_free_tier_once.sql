-- ---------------------------------------------------------------------------
-- 021: the free allowance stops being a monthly salary.
--
-- WHY. Three Carta bot plans a month is thirty-six a year, which is more than
-- a whole trip's worth of planning for anyone willing to wait a fortnight
-- between days. In a category where people travel once or twice a year, a
-- monthly reset does not sample the product, it hands it over. The free tier
-- should be sized to the JOB (see how it goes, once) rather than to the
-- calendar, so it becomes two plans that never refill.
--
-- HOW. Nothing about the ledger changes. ai_usage is keyed on
-- (user_id, period_start, kind), so a free tier whose period_start is a fixed
-- date instead of the current month simply accumulates forever against that
-- one row. Both readers, ai_status and ai_consume, resolve the period through
-- ai_resolve_tier, so this one function is the only thing that has to move.
--
-- WHAT EXISTING FREE USERS SEE. Their old rows sit under month-start periods
-- and are now ignored, so everyone starts again with two. That is deliberate:
-- silently converting somebody's remaining monthly balance into a permanent
-- one would take away an allowance they were already shown, and two plans is
-- a cheaper apology than a support thread.
--
-- APPLY BY HAND in the SQL editor. Never `supabase db push` at this project:
-- the live database carries functions this repo does not own.
-- ---------------------------------------------------------------------------

-- The epoch every free traveller's usage counts against. Any fixed date works;
-- this one is obviously not a real period, which is the point when somebody
-- reads a stray row in ai_usage a year from now.
create or replace function public.ai_free_epoch()
returns date
language sql
immutable
set search_path = ''
as $$ select date '1970-01-01' $$;

comment on function public.ai_free_epoch is
  'Fixed period_start for the free tier, so its allowance never resets. See migration 021.';

-- ---------------------------------------------------------------------------
-- Resolve a user's live tier and the period its quota counts against.
--
-- Unchanged for paid tiers. The free branch now returns the epoch rather than
-- the start of this month, which is the whole of this migration.
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
  -- allowance is a one-off trial rather than a monthly refill, so it counts
  -- against a fixed epoch and never comes back.
  if e.user_id is null
     or e.tier = 'free'
     or e.expires_at is null
     or e.expires_at <= now() then
    return query select 'free'::text, public.ai_free_epoch(), null::timestamptz;
  else
    return query select e.tier, e.period_start::date, e.expires_at;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- ai_status: same shape, except resetsAt is now null on the free tier.
--
-- It used to promise the first of next month. Promising a refill that is never
-- coming is worse than saying nothing, so the field goes null and the UI reads
-- that as "this does not refill".
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

  -- A pass refills when it ends. The free allowance never refills at all.
  v_resets := case
    when cfg.period_days is null then null
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
-- Two, not three. Kept in step with continent-app/src/lib/pricing.js, which
-- is display only: this table is what the server actually enforces.
-- ---------------------------------------------------------------------------
update public.plan_tiers set ai_plans = 2 where tier = 'free';
