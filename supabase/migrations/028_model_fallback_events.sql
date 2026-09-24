-- Model fallback tracking: log which model produced each successful generation
-- when the primary Gemini model fails and falls back to another.
--
-- WHY IT MATTERS: The fallback is an early warning that the primary budget or
-- quota is exhausted, and it tells you which model your users are actually
-- getting. Without it a silent fallback to a weaker model looks like the product
-- getting worse for no reason.
--
-- DESIGN CHOICE: This is an event table, not a column on ai_usage, because
-- ai_usage is a per-period counter (one row per user, period, kind) and cannot
-- hold one value per call. The event table records exactly which model produced
-- each successful generation, so the admin panel can surface per-day counts by
-- model plus a fallback count.
--
-- Apply in the Supabase SQL editor. Do NOT run `supabase db push` against the
-- live project.

-- ---------------------------------------------------------------------------
-- Event table: one row per AI generation that used a fallback
-- ---------------------------------------------------------------------------
create table if not exists public.ai_model_events (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  model             text not null,
  kind              text not null check (kind in ('plan', 'ground')),
  -- True when the model used was not the first one in the chain
  fell_back         boolean not null default false,
  created_at        timestamptz not null default now()
);

create index if not exists ai_model_events_user_created_idx on public.ai_model_events (user_id, created_at desc);
create index if not exists ai_model_events_created_idx on public.ai_model_events (created_at desc);
create index if not exists ai_model_events_model_idx on public.ai_model_events (model);

alter table public.ai_model_events enable row level security;

-- The event table is write-only from Edge Functions (service_role) and
-- read-only by admins. No user-facing read access.
revoke all on public.ai_model_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin RPC: per-day counts by model plus fallback count
-- ---------------------------------------------------------------------------
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
      select jsonb_agg(jsonb_build_object(
               'day', d, 'total', total, 'fallbacks', fallbacks, 'byModel', models)
               order by d desc)
        from (
          select
            created_at::date as d,
            count(*) as total,
            count(*) filter (where fell_back) as fallbacks,
            coalesce(jsonb_object_agg(model, model_count order by model_count desc),
                     '{}'::jsonb) as models
          from (
            select
              created_at::date,
              model,
              fell_back,
              count(*) as model_count
            from public.ai_model_events
            where created_at > now() - (p_days || ' days')::interval
            group by created_at::date, model, fell_back
          ) s
          group by d
        ) summary
    ), '[]'::jsonb),
    'byModel', coalesce((
      select jsonb_object_agg(model, count order by count desc)
        from (
          select model, count(*) as count
            from public.ai_model_events
           where created_at > now() - (p_days || ' days')::interval
           group by model
        ) s
    ), '{}'::jsonb),
    'totalFallbacks', (
      select count(*)
        from public.ai_model_events
       where created_at > now() - (p_days || ' days')::interval
         and fell_back
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on table public.ai_model_events from public, anon;
grant insert on table public.ai_model_events to service_role;
grant select on table public.ai_model_events to service_role;

revoke all on function public.admin_ai_model_report(int) from public, anon;
grant execute on function public.admin_ai_model_report(int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Down migration
-- ---------------------------------------------------------------------------
-- To rollback, run:
--   drop function if exists public.admin_ai_model_report(int);
--   drop table if exists public.ai_model_events;
