-- 078, ai fix program wave 1 (ROADMAP E4, E7; QUOTA-005; S2 to S4 of the
-- gemini-rag decision). Down migration: 078_ai_hygiene_down.sql.
-- Apply by pasting in the SQL editor BEFORE deploying the changed Edge
-- Functions (docs/owner/ai.md, docs/owner/supabase-migrations.md). The
-- functions also run without it: passes.consume falls back to ai_consume when
-- ai_consume_v2 is missing, and the event write drops the new columns when
-- PostgREST refuses them. Never applied live by the session that wrote it.
--
-- 1. ai_model_events: thinking, implicit-cache and grounded counts (S2).
-- 2. ai_usage_days.cached: how many of a day's grants were cache hits.
-- 3. ai_consume_v2: cache hits never spend the shared ceiling or the daily
--    limit; a per-user daily limit, the same for every tier; a spend breaker
--    that refuses free accounts at the ceiling and never a Pass holder (S3).
-- 4. ai_refund: takes a unit back from the newest day that still holds an
--    uncached grant (a cache hit never touched the shared count).
-- 5. ai_cap_events accepts reason 'day_cap'.
-- 6. funnel_counts and funnel_step accept 'ask_answer' and 'ask_to_plan' (S4).

-- 1 -------------------------------------------------------------------------
alter table public.ai_model_events
  add column if not exists tokens_thought   integer check (tokens_thought is null or tokens_thought >= 0),
  add column if not exists tokens_cached    integer check (tokens_cached is null or tokens_cached >= 0),
  add column if not exists grounded_queries integer check (grounded_queries is null or grounded_queries between 0 and 1000),
  add column if not exists thinking         text check (thinking is null or thinking in ('minimal', 'low', 'medium', 'high', 'rejected'));

comment on column public.ai_model_events.tokens_thought is
  'Thinking tokens Gemini reported (billed as output). Null when not reported.';
comment on column public.ai_model_events.tokens_cached is
  'Prompt tokens served from the implicit cache. Null when not reported.';
comment on column public.ai_model_events.grounded_queries is
  'Google Search queries the model ran (each billed). 0 when search was off, null when not reported.';
comment on column public.ai_model_events.thinking is
  'Thinking level sent, or rejected when the model refused the field and the call was repeated without it.';

-- 2 -------------------------------------------------------------------------
alter table public.ai_usage_days
  add column if not exists cached int not null default 0 check (cached >= 0);
alter table public.ai_usage_days drop constraint if exists ai_usage_days_cached_le_n;
alter table public.ai_usage_days add constraint ai_usage_days_cached_le_n check (cached <= n);

-- 3 -------------------------------------------------------------------------
-- p_free_cap: the shared daily count at which a FREE account is refused
-- (AI_GLOBAL_DAILY_CAP times the breaker's free share, from ai_models.json).
-- Pass holders (any tier but free) are counted on the same total, so their
-- use brings the free cut closer, but are never refused by it.
-- p_user_day_cap: uncached grants per user per day and kind; 0 or less is no limit.
-- p_cached: the caller found a fresh, checked cache row it will serve.
create or replace function public.ai_consume_v2(
  p_user uuid, p_kind text, p_free_cap int, p_user_day_cap int, p_cached boolean default false
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
  v_n      int;
  v_day    int;
  v_global int;
  v_pass   boolean;
begin
  if p_kind not in ('plan', 'ground') then
    return jsonb_build_object('status', 'bad_kind');
  end if;

  select * into r from public.ai_resolve_tier(p_user);
  select * into cfg from public.plan_tiers where tier = r.tier;
  v_cap := case when p_kind = 'ground' then cfg.grounded else cfg.ai_plans end;
  v_pass := coalesce(r.tier, 'free') <> 'free';

  if v_cap <= 0 then
    return jsonb_build_object('status', 'user_cap', 'tier', r.tier,
                              'cap', 0, 'used', 0, 'left', 0);
  end if;

  -- The tier allowance: the product promise, spent by a cache hit too.
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

  if p_cached then
    -- Costs Google nothing: no daily limit, no shared count.
    insert into public.ai_usage_days as dd (user_id, day, kind, n, cached)
      values (p_user, current_date, p_kind, 1, 1)
      on conflict (user_id, day, kind) do update set n = dd.n + 1, cached = dd.cached + 1;
    return jsonb_build_object('status', 'ok', 'tier', r.tier, 'cap', v_cap,
                              'used', v_n, 'left', greatest(0, v_cap - v_n), 'cached', true);
  end if;

  -- The per-user daily limit, uncached grants only, the same for every tier.
  if p_user_day_cap > 0 then
    insert into public.ai_usage_days as dd (user_id, day, kind, n, cached)
      values (p_user, current_date, p_kind, 1, 0)
      on conflict (user_id, day, kind) do update
        set n = dd.n + 1
        where dd.n - dd.cached < p_user_day_cap
      returning n into v_day;
  else
    insert into public.ai_usage_days as dd (user_id, day, kind, n, cached)
      values (p_user, current_date, p_kind, 1, 0)
      on conflict (user_id, day, kind) do update set n = dd.n + 1
      returning n into v_day;
  end if;

  if v_day is null then
    update public.ai_usage set n = greatest(0, n - 1)
      where user_id = p_user and period_start = r.period_start and kind = p_kind;
    return jsonb_build_object('status', 'day_cap', 'tier', r.tier,
                              'cap', p_user_day_cap, 'used', p_user_day_cap, 'left', 0);
  end if;

  -- The spend breaker on the shared daily count.
  if v_pass then
    insert into public.ai_daily_total as d (day, n)
      values (current_date, 1)
      on conflict (day) do update set n = d.n + 1
      returning n into v_global;
  elsif coalesce(p_free_cap, 0) > 0 then
    insert into public.ai_daily_total as d (day, n)
      values (current_date, 1)
      on conflict (day) do update
        set n = d.n + 1
        where d.n < p_free_cap
      returning n into v_global;
  end if;

  if v_global is null then
    update public.ai_usage set n = greatest(0, n - 1)
      where user_id = p_user and period_start = r.period_start and kind = p_kind;
    update public.ai_usage_days set n = greatest(cached, n - 1)
      where user_id = p_user and day = current_date and kind = p_kind;
    return jsonb_build_object('status', 'global_cap', 'tier', r.tier);
  end if;

  return jsonb_build_object('status', 'ok', 'tier', r.tier, 'cap', v_cap,
                            'used', v_n, 'left', greatest(0, v_cap - v_n), 'cached', false);
end;
$$;

revoke all on function public.ai_consume_v2(uuid, text, int, int, boolean) from public, anon, authenticated;
grant execute on function public.ai_consume_v2(uuid, text, int, int, boolean) to service_role;

-- 4 -------------------------------------------------------------------------
-- As 044, but the day it reverses is the newest one with an UNCACHED grant
-- left: a refund only ever follows an uncached grant (a hit is served at once).
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
    where user_id = p_user and kind = p_kind and n - cached > 0
    order by day desc limit 1;
  if v_day is null then
    return;
  end if;
  update public.ai_usage_days set n = n - 1
    where user_id = p_user and kind = p_kind and day = v_day and n - cached > 0;
  update public.ai_daily_total set n = greatest(0, n - 1)
    where day = v_day;
end;
$$;

revoke all on function public.ai_refund(uuid, text) from public, anon, authenticated;
grant execute on function public.ai_refund(uuid, text) to service_role;

-- 5 -------------------------------------------------------------------------
alter table public.ai_cap_events drop constraint if exists ai_cap_events_reason_check;
alter table public.ai_cap_events add constraint ai_cap_events_reason_check
  check (reason in ('user_cap', 'global_cap', 'day_cap'));

-- 6 -------------------------------------------------------------------------
alter table public.funnel_counts drop constraint if exists funnel_counts_step_check;
alter table public.funnel_counts add constraint funnel_counts_step_check
  check (step in ('explore_opened','place_opened','plan_started','priced_draft','trip_saved','shared','ask_answer','ask_to_plan'));

create or replace function public.funnel_step(p_step text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_step text := lower(coalesce(p_step, ''));
  v_n    bigint;
begin
  if v_step not in ('explore_opened','place_opened','plan_started','priced_draft','trip_saved','shared','ask_answer','ask_to_plan') then
    return;
  end if;
  insert into public.funnel_daily_total as d (day, n) values (current_date, 1)
    on conflict (day) do update set n = d.n + 1 where d.n < 100000
    returning n into v_n;
  if v_n is null then return; end if;
  insert into public.funnel_counts as c (day, step, n)
    values (current_date, v_step, 1)
    on conflict (day, step) do update set n = c.n + 1;
  delete from public.funnel_daily_total where day < current_date - 400;
exception when others then
  return;
end;
$$;
revoke all on function public.funnel_step(text) from public;
grant execute on function public.funnel_step(text) to anon, authenticated, service_role;
