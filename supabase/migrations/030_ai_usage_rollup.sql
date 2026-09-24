-- AI usage rollup: make the unit economics of the AI surface readable in the
-- admin panel instead of inferable from three tables nobody opens.
--
-- WHY IT MATTERS: every lever in the AI cost model was already being
-- measured and none of it was visible. The quota ledger has counted spend
-- since 007, the daily ceiling since 007, the cache lookups since 029 and
-- the model fallbacks since 028, and an owner looking at the admin panel
-- could see exactly one figure out of all of it: aiToday, a bare integer in
-- admin_stats with nothing to compare it to. So three questions that decide
-- whether the AI surface is worth running could not be answered at all: how
-- close is the shared daily ceiling to biting, did the cache change actually
-- work, and is one account eating the margin. This function answers all
-- three off the tables that already exist.
--
-- DESIGN CHOICE: one RPC, not four. The panel draws one section, and four
-- round trips to draw one section means four chances for a partial render
-- where the tiles disagree with the table beneath them. Every figure here is
-- computed inside one statement pair against the same snapshot, so the
-- section is either whole or absent.
--
-- DESIGN CHOICE: plan and ground are kept apart everywhere. They are not two
-- flavours of the same unit. A 'plan' unit is tokens on Gemini Flash and is
-- effectively free; a 'ground' unit is a billed Google Search query and on
-- Gemini 3 one grounded generation can run several of them. Summing the two
-- into a single "AI calls" number would hide the only line item that reliably
-- costs money behind the one that does not, which is precisely the mistake
-- this whole section exists to prevent. See 007_passes.sql for the kind
-- check, and passes.mjs for the billing posture.
--
-- DESIGN CHOICE: the cap rejections needed a new table. This is the one place
-- where the brief asked for a number nothing was recording. A user-cap or
-- global-cap refusal has always been an HTTP 429 and nothing else: ai_consume
-- returns the status to the Edge Function, the function turns it into a
-- response, and the fact is gone. It cannot be recovered after the fact
-- either, because a refusal writes nothing anywhere by definition, so
-- ai_usage sitting exactly at a cap is indistinguishable from ai_usage
-- sitting exactly at a cap with a hundred refused calls behind it. The two
-- counts mean opposite things and both are actionable: user-cap refusals are
-- demand for a pass and belong next to the paywall funnel, global-cap
-- refusals are the shared ceiling set too low and are an outage for whoever
-- asked last. So ai_cap_events records one row per refusal, in the same shape
-- and for the same reason as ai_cache_events in 029.
--
-- DESIGN CHOICE: no user_id on ai_cap_events. The heaviest-user list already
-- comes from ai_usage, which is the authoritative ledger and is keyed by
-- user. A second per-user record of refusals would add a table of who was
-- told no and when, for a question ("who is being refused") that the ledger
-- plus the tier already answers: a user at their cap in ai_usage is the user
-- being refused. The tier is kept because "free users are hitting the wall"
-- and "Year Pass holders are hitting the wall" are different products
-- problems.
--
-- Apply in the Supabase SQL editor. Do NOT run `supabase db push` against the
-- live project.

-- ---------------------------------------------------------------------------
-- Event table: one row per quota refusal
-- ---------------------------------------------------------------------------
create table if not exists public.ai_cap_events (
  id         bigint generated always as identity primary key,
  -- 'user_cap' when the traveller's own allowance is spent, 'global_cap'
  -- when the shared daily ceiling refused them. Same two strings ai_consume
  -- returns, so the call site passes through what it already has.
  reason     text not null check (reason in ('user_cap', 'global_cap')),
  -- Which surface was refused, matching ai_usage.kind.
  kind       text not null check (kind in ('plan', 'ground')),
  -- The tier that was refused, so a wall hit by paying customers reads
  -- differently from a wall hit by free users. Nullable because a refusal can
  -- arrive before the tier resolves.
  tier       text,
  created_at timestamptz not null default now()
);

create index if not exists ai_cap_events_created_idx
  on public.ai_cap_events (created_at desc);
create index if not exists ai_cap_events_reason_idx
  on public.ai_cap_events (created_at desc, reason);

alter table public.ai_cap_events enable row level security;

-- Written only by Edge Functions (service_role), read only by admins.
revoke all on public.ai_cap_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin RPC: the whole AI cost picture over a window
-- ---------------------------------------------------------------------------
-- Guarded and shaped exactly like admin_ai_cache_report in 029: admin_guard
-- first, a jsonb object out, an 'error' key on refusal so the client has one
-- branch to write. SECURITY DEFINER with an empty search_path, so every
-- reference is schema-qualified on purpose.
--
-- The days argument is clamped at both ends. Zero or a negative would make
-- the interval empty and return a screen of zeroes that looks like no
-- traffic rather than like a bad argument; the upper clamp keeps a typo from
-- scanning the whole ledger.
create or replace function public.admin_ai_usage(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err    text := public.admin_guard('read');
  v_days   int;
  v_since  timestamptz;
  v_sinced date;
  v_cap    int;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  v_days  := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since := now() - (v_days || ' days')::interval;
  v_sinced := (current_date - v_days);

  -- The shared ceiling the Edge Functions enforce. It lives in the function
  -- environment (AI_GLOBAL_DAILY_CAP) rather than in the database, so SQL
  -- cannot read the real value. site_config is checked first in case an
  -- operator has mirrored it there, and the function default of 200 is the
  -- fallback, matching the `|| 200` in plan-day, parse-booking and
  -- suggest-city. The panel labels this as the assumed cap for that reason:
  -- a percentage against the wrong ceiling is worse than no percentage, so
  -- the number it was computed against is returned alongside it.
  begin
    select (value #>> '{}')::int into v_cap
      from public.site_config where key = 'ai_global_daily_cap';
  exception when others then
    v_cap := null;
  end;
  v_cap := coalesce(v_cap, 200);

  return jsonb_build_object(
    'days', v_days,
    'globalCap', v_cap,

    -- ---------------------------------------------------------------------
    -- Daily consumption against the shared ceiling.
    -- ---------------------------------------------------------------------
    -- ai_daily_total is the only table with a day dimension. ai_usage is
    -- keyed by entitlement period, which for a Year Pass holder is one row
    -- covering 365 days, so it cannot be summed per day and is not asked to
    -- be. The two answer different questions and both are here.
    'today', coalesce(
      (select n from public.ai_daily_total where day = current_date), 0),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day', day, 'n', n,
               'pct', round((n::numeric / greatest(v_cap, 1)) * 100, 1))
               order by day desc)
        from public.ai_daily_total
       where day >= v_sinced
    ), '[]'::jsonb),
    'peakDay', coalesce((
      select jsonb_build_object('day', day, 'n', n)
        from public.ai_daily_total
       where day >= v_sinced
       order by n desc, day desc
       limit 1
    ), 'null'::jsonb),
    -- How often the ceiling was actually reached. A zero here with a high
    -- peak means the cap is set about right; anything above zero means
    -- somebody was refused a plan they were entitled to.
    'daysAtCap', (
      select count(*) from public.ai_daily_total
       where day >= v_sinced and n >= v_cap
    ),

    -- ---------------------------------------------------------------------
    -- Spend split by surface. Period-keyed, so this is "units spent in
    -- periods that started inside the window", not "units spent inside the
    -- window". Stated plainly in the panel rather than fudged.
    -- ---------------------------------------------------------------------
    'plan', jsonb_build_object(
      'units', coalesce((select sum(n) from public.ai_usage
                          where kind = 'plan' and period_start >= v_sinced), 0),
      'users', (select count(distinct user_id) from public.ai_usage
                 where kind = 'plan' and period_start >= v_sinced and n > 0)
    ),
    'ground', jsonb_build_object(
      'units', coalesce((select sum(n) from public.ai_usage
                          where kind = 'ground' and period_start >= v_sinced), 0),
      'users', (select count(distinct user_id) from public.ai_usage
                 where kind = 'ground' and period_start >= v_sinced and n > 0)
    ),

    -- ---------------------------------------------------------------------
    -- Cache hit rate, read from the same events 029 records. Repeated here
    -- rather than left to admin_ai_cache_report because the brief asks for
    -- one function that answers the whole question, and because a hit rate
    -- means something different sitting next to the spend it avoided than it
    -- does on its own. The dedicated report keeps the detail (per version,
    -- per destination); this is the headline only.
    -- ---------------------------------------------------------------------
    'cache', (
      select jsonb_build_object(
               'lookups', count(*),
               'hits', count(*) filter (where hit),
               'rate', case when count(*) > 0
                 then round((count(*) filter (where hit))::numeric
                            / count(*) * 100, 1)
                 else null end)
        from public.ai_cache_events
       where created_at > v_since
    ),

    -- ---------------------------------------------------------------------
    -- Top 10 heaviest users, plan and ground kept apart.
    -- ---------------------------------------------------------------------
    -- Ranked on ground first and plan second, because ground is the unit
    -- that costs money and a user with a thousand cached plans is not the
    -- one eating the margin. Email is included because the point of the list
    -- is to be able to go and look at the account; there is nothing here an
    -- admin could not already read from admin_get_user.
    'topUsers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'userId', user_id, 'email', email, 'tier', tier,
               'plan', plan_n, 'ground', ground_n) order by ground_n desc, plan_n desc)
        from (
          select u.user_id,
                 au.email,
                 coalesce(e.tier, 'free') as tier,
                 coalesce(sum(u.n) filter (where u.kind = 'plan'), 0)   as plan_n,
                 coalesce(sum(u.n) filter (where u.kind = 'ground'), 0) as ground_n
            from public.ai_usage u
            left join auth.users au on au.id = u.user_id
            left join public.entitlements e on e.user_id = u.user_id
           where u.period_start >= v_sinced
           group by u.user_id, au.email, e.tier
          having coalesce(sum(u.n), 0) > 0
           order by coalesce(sum(u.n) filter (where u.kind = 'ground'), 0) desc,
                    coalesce(sum(u.n) filter (where u.kind = 'plan'), 0) desc
           limit 10
        ) s
    ), '[]'::jsonb),

    -- ---------------------------------------------------------------------
    -- Cap refusals, user versus global, split by surface.
    -- ---------------------------------------------------------------------
    -- These two numbers are read together or not at all. user_cap high with
    -- global_cap zero is demand: people want more than their tier gives and
    -- the paywall funnel is the next place to look. global_cap above zero is
    -- a capacity problem, and whoever hit it got an error for a plan they had
    -- already paid for.
    'rejections', (
      select jsonb_build_object(
               'userCap', count(*) filter (where reason = 'user_cap'),
               'globalCap', count(*) filter (where reason = 'global_cap'),
               'userCapPlan', count(*) filter (where reason = 'user_cap' and kind = 'plan'),
               'userCapGround', count(*) filter (where reason = 'user_cap' and kind = 'ground'),
               'globalCapPlan', count(*) filter (where reason = 'global_cap' and kind = 'plan'),
               'globalCapGround', count(*) filter (where reason = 'global_cap' and kind = 'ground'))
        from public.ai_cap_events
       where created_at > v_since
    ),
    -- Which tier is hitting its wall. Free users at the wall is the upsell
    -- working; paid users at the wall is a tier priced wrong.
    'rejectionsByTier', coalesce((
      select jsonb_agg(jsonb_build_object(
               'tier', tier, 'userCap', user_cap, 'globalCap', global_cap)
               order by user_cap desc)
        from (
          select coalesce(tier, 'unknown') as tier,
                 count(*) filter (where reason = 'user_cap')   as user_cap,
                 count(*) filter (where reason = 'global_cap') as global_cap
            from public.ai_cap_events
           where created_at > v_since
           group by coalesce(tier, 'unknown')
        ) s
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on table public.ai_cap_events from public, anon;
grant insert on table public.ai_cap_events to service_role;
grant select on table public.ai_cap_events to service_role;

revoke all on function public.admin_ai_usage(int) from public, anon;
grant execute on function public.admin_ai_usage(int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------
-- ai_cap_events grows one row per refusal, which at these volumes is tens to
-- hundreds a month. Nothing prunes it and nothing needs to yet. If it ever
-- matters the prune is one statement and costs only detail:
--   delete from public.ai_cap_events where created_at < now() - interval '1 year';

-- ---------------------------------------------------------------------------
-- Down migration
-- ---------------------------------------------------------------------------
-- To rollback, run:
--   drop function if exists public.admin_ai_usage(int);
--   drop table if exists public.ai_cap_events;
