-- 071, T1139 (E4): LLM observability. Never applied live by the session that
-- wrote it; paste in the SQL editor after 028 and 069. Down: 071_ai_model_events_calls_down.sql.
--
-- ai_model_events (028) held one row per fallback in plan-day, keyed on a user.
-- It now also takes one row per model call through the gateway (aiModels.mjs):
-- kind 'call', no user id. A call row holds names and counts only: feature,
-- provider, model, prompt id and version, tokens, a cost estimate, latency,
-- outcome. It never holds prompt or answer text. Ask's question is a salted
-- SHA-256 (64 hex), enough to count repeats and nothing else. Call rows live
-- 30 days (ai_events_prune, daily 03:41 UTC), shorter than 069's 180 days for
-- the older plan rows, which stay as they were.
-- Only the service role writes; RLS stays on and anon, authenticated read nothing.

alter table public.ai_model_events alter column user_id drop not null;
alter table public.ai_model_events drop constraint if exists ai_model_events_kind_check;
alter table public.ai_model_events add constraint ai_model_events_kind_check
  check (kind in ('plan', 'ground', 'call'));

alter table public.ai_model_events
  add column if not exists feature          text,
  add column if not exists provider         text,
  add column if not exists prompt_id        text,
  add column if not exists prompt_version   integer,
  add column if not exists tokens_in        integer check (tokens_in is null or tokens_in >= 0),
  add column if not exists tokens_out       integer check (tokens_out is null or tokens_out >= 0),
  add column if not exists tokens_estimated boolean not null default false,
  add column if not exists cost_usd         numeric(12,6) check (cost_usd is null or cost_usd >= 0),
  add column if not exists latency_ms       integer check (latency_ms is null or latency_ms >= 0),
  add column if not exists outcome          text check (outcome is null or outcome in ('ok', 'fallback', 'refused', 'failed')),
  add column if not exists code             text check (code is null or length(code) <= 40),
  add column if not exists attempts         integer check (attempts is null or attempts between 0 and 50),
  add column if not exists query_hash       text check (query_hash is null or query_hash ~ '^[0-9a-f]{64}$');

-- A call row is complete; a plan row keeps its old shape.
alter table public.ai_model_events drop constraint if exists ai_model_events_call_shape;
alter table public.ai_model_events add constraint ai_model_events_call_shape
  check (kind <> 'call' or (user_id is null and feature is not null and provider is not null
                            and latency_ms is not null and outcome is not null));

create index if not exists ai_model_events_feature_created_idx
  on public.ai_model_events (feature, created_at desc) where kind = 'call';

alter table public.ai_model_events enable row level security;
revoke all on table public.ai_model_events from public, anon, authenticated;
grant select, insert on table public.ai_model_events to service_role;

-- The fallback report (028) counts plan rows only, so call rows do not double it.
create or replace function public.admin_ai_model_report(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err text := public.admin_guard('read');
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  return jsonb_build_object(
    'byDay', coalesce((
      select jsonb_agg(jsonb_build_object('day', d, 'total', total, 'fallbacks', fallbacks, 'byModel', models) order by d desc)
        from (
          select created_at::date as d, count(*) as total,
                 count(*) filter (where fell_back) as fallbacks,
                 coalesce(jsonb_object_agg(model, model_count order by model_count desc), '{}'::jsonb) as models
          from (
            select created_at::date, model, fell_back, count(*) as model_count
              from public.ai_model_events
             where created_at > now() - (p_days || ' days')::interval and kind in ('plan', 'ground')
             group by created_at::date, model, fell_back
          ) s
          group by d
        ) summary), '[]'::jsonb),
    'byModel', coalesce((
      select jsonb_object_agg(model, count order by count desc)
        from (select model, count(*) as count from public.ai_model_events
               where created_at > now() - (p_days || ' days')::interval and kind in ('plan', 'ground')
               group by model) s), '{}'::jsonb),
    'totalFallbacks', (select count(*) from public.ai_model_events
                        where created_at > now() - (p_days || ' days')::interval
                          and kind in ('plan', 'ground') and fell_back)
  );
end;
$$;
revoke all on function public.admin_ai_model_report(int) from public, anon;
grant execute on function public.admin_ai_model_report(int) to authenticated, service_role;

-- Weekly view: per week (Monday start, newest first) and feature: calls,
-- failures, p50 and p95 latency, tokens, cost estimate; plus cost per day.
create or replace function public.admin_ai_calls_weekly(p_weeks int default 4)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err   text := public.admin_guard('read');
  v_weeks int;
  v_first date;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  v_weeks := least(greatest(coalesce(p_weeks, 4), 1), 8);
  v_first := date_trunc('week', current_date)::date - (v_weeks - 1) * 7;
  return jsonb_build_object(
    'since', v_first,
    'weeks', coalesce((
      select jsonb_agg(jsonb_build_object('week', w.week, 'features', w.features) order by w.week desc)
        from (
          select s.week, jsonb_agg(jsonb_build_object(
                   'feature', s.feature, 'calls', s.calls, 'failed', s.failed, 'refused', s.refused,
                   'fallbacks', s.fallbacks, 'p50', s.p50, 'p95', s.p95,
                   'tokensIn', s.tin, 'tokensOut', s.tout, 'costUsd', s.cost) order by s.feature) as features
            from (
              select date_trunc('week', created_at)::date as week, feature,
                     count(*) as calls,
                     count(*) filter (where outcome = 'failed') as failed,
                     count(*) filter (where outcome = 'refused') as refused,
                     count(*) filter (where outcome = 'fallback') as fallbacks,
                     round((percentile_cont(0.5) within group (order by latency_ms))::numeric) as p50,
                     round((percentile_cont(0.95) within group (order by latency_ms))::numeric) as p95,
                     coalesce(sum(tokens_in), 0) as tin, coalesce(sum(tokens_out), 0) as tout,
                     round(coalesce(sum(cost_usd), 0), 4) as cost
                from public.ai_model_events
               where kind = 'call' and created_at >= v_first
               group by 1, 2) s
           group by s.week) w), '[]'::jsonb),
    'costByDay', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'costUsd', d.cost, 'calls', d.calls) order by d.day desc)
        from (select created_at::date as day, round(coalesce(sum(cost_usd), 0), 4) as cost, count(*) as calls
                from public.ai_model_events
               where kind = 'call' and created_at >= v_first
               group by 1) d), '[]'::jsonb));
end;
$$;
revoke all on function public.admin_ai_calls_weekly(int) from public, anon;
grant execute on function public.admin_ai_calls_weekly(int) to authenticated, service_role;

-- 30 day retention for call rows. Scheduled with pg_cron when it is on.
create or replace function public.ai_events_prune()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.ai_model_events where kind = 'call' and created_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.ai_events_prune() from public, anon, authenticated;
grant execute on function public.ai_events_prune() to service_role;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('carta_ai_events_prune', '41 3 * * *', 'select public.ai_events_prune()');
  else
    raise notice 'pg_cron is not enabled: run select public.ai_events_prune() daily by hand or enable pg_cron and paste 071 again';
  end if;
end;
$cron$;
