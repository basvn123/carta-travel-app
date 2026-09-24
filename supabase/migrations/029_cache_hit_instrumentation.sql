-- Cache hit rate for ai_plan_cache: make the thing that saves the money
-- visible, so raising it can be told apart from believing it was raised.
--
-- WHY IT MATTERS: every cache hit is a Gemini generation not bought and a
-- response the traveller gets immediately instead of waiting for. Unit
-- economics Lever 2 puts every 10 points of hit rate at 10 percent off both
-- the plan bill and the grounded bill. Until now nothing recorded whether a
-- lookup hit, so the hit rate was unknowable and the effect of any change to
-- the cache key was unfalsifiable.
--
-- DESIGN CHOICE: an event table rather than a counter column on
-- ai_plan_cache. A counter on the row can only ever count hits, because a
-- MISS has no row to count against, and a rate needs both numbers. The event
-- table records one row per lookup with hit true or false, so the rate is a
-- straight division and it can be read per day.
--
-- DESIGN CHOICE: no user_id. The row would be a per-user record of which
-- destinations somebody planned, which is data we do not need in order to
-- know a rate. The destination is kept because "which cities miss" is the
-- question that tells you where to look next; nothing here identifies who
-- asked. Cardinality is therefore low and the table stays small.
--
-- Apply in the Supabase SQL editor. Do NOT run `supabase db push` against the
-- live project.

-- ---------------------------------------------------------------------------
-- Event table: one row per cache lookup
-- ---------------------------------------------------------------------------
create table if not exists public.ai_cache_events (
  id          bigint generated always as identity primary key,
  -- True when the lookup found a fresh row and served it without a
  -- generation; false when it fell through to Gemini.
  hit         boolean not null,
  -- Which destination was asked for. No user id, deliberately.
  dest_id     text,
  -- The cache key version that produced the lookup, so a key change can be
  -- read as a step in the series rather than as an unexplained jump.
  key_version int,
  created_at  timestamptz not null default now()
);

create index if not exists ai_cache_events_created_idx
  on public.ai_cache_events (created_at desc);
create index if not exists ai_cache_events_hit_idx
  on public.ai_cache_events (created_at desc, hit);

alter table public.ai_cache_events enable row level security;

-- Written only by Edge Functions (service_role), read only by admins.
revoke all on public.ai_cache_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin RPC: the hit rate over a window, overall, per day and per key version
-- ---------------------------------------------------------------------------
create or replace function public.admin_ai_cache_report(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err text := public.admin_guard('read');
  v_since timestamptz;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  v_since := now() - (greatest(1, coalesce(p_days, 30)) || ' days')::interval;

  return jsonb_build_object(
    'days', greatest(1, coalesce(p_days, 30)),
    'lookups', (
      select count(*) from public.ai_cache_events where created_at > v_since
    ),
    'hits', (
      select count(*) from public.ai_cache_events
       where created_at > v_since and hit
    ),
    -- Per day, so a key change shows as a step rather than as a blended
    -- average that hides it.
    'byDay', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day', d, 'lookups', lookups, 'hits', hits) order by d desc)
        from (
          select created_at::date as d,
                 count(*) as lookups,
                 count(*) filter (where hit) as hits
            from public.ai_cache_events
           where created_at > v_since
           group by created_at::date
        ) s
    ), '[]'::jsonb),
    -- Per cache key version: the before and after of a normalisation like
    -- T039 read directly off this, with no need to remember the deploy date.
    'byVersion', coalesce((
      select jsonb_agg(jsonb_build_object(
               'v', v, 'lookups', lookups, 'hits', hits) order by v)
        from (
          select coalesce(key_version, 0) as v,
                 count(*) as lookups,
                 count(*) filter (where hit) as hits
            from public.ai_cache_events
           where created_at > v_since
           group by coalesce(key_version, 0)
        ) s
    ), '[]'::jsonb),
    -- Where the misses are. A destination that misses constantly is either
    -- genuinely rare or is forking its key on something it should not.
    'topMisses', coalesce((
      select jsonb_agg(jsonb_build_object('destId', dest_id, 'misses', misses)
               order by misses desc)
        from (
          select dest_id, count(*) as misses
            from public.ai_cache_events
           where created_at > v_since and not hit and dest_id is not null
           group by dest_id
           order by count(*) desc
           limit 10
        ) s
    ), '[]'::jsonb),
    -- How much is actually in the cache right now, and how much of it is
    -- still inside the seven-day freshness window the function enforces.
    'rows', (select count(*) from public.ai_plan_cache),
    'freshRows', (
      select count(*) from public.ai_plan_cache
       where created_at > now() - interval '7 days'
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on table public.ai_cache_events from public, anon;
grant insert on table public.ai_cache_events to service_role;
grant select on table public.ai_cache_events to service_role;

revoke all on function public.admin_ai_cache_report(int) from public, anon;
grant execute on function public.admin_ai_cache_report(int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------
-- The table grows one row per plan-day lookup and nothing prunes it. At the
-- volumes this project sees that is measured in thousands of rows a year, so
-- no scheduled job is worth the moving part yet. If it ever matters, the
-- prune is one statement and loses only detail, never the rate:
--   delete from public.ai_cache_events where created_at < now() - interval '1 year';

-- ---------------------------------------------------------------------------
-- Down migration
-- ---------------------------------------------------------------------------
-- To rollback, run:
--   drop function if exists public.admin_ai_cache_report(int);
--   drop table if exists public.ai_cache_events;
