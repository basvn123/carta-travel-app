-- AI day planner (the plan-day Edge Function): quota ledger + response cache.
--
-- Both tables are touched ONLY by the Edge Function through the service-role
-- key. RLS is enabled with no policies on purpose: anon and authenticated
-- clients can neither read nor write them, while service_role bypasses RLS.
--
-- The quota ledger is the zero-billing guard rail. The function refuses to
-- call the AI once the per-user or global daily budget is spent, so the
-- Google project behind the Gemini key (which must NEVER have a billing
-- account attached) hits its own free quota with headroom, never a bill.
--
-- Apply in the Supabase SQL editor or via `supabase db push`.

create table if not exists public.ai_plan_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  used_on date not null default current_date,
  n int not null default 0,
  primary key (user_id, used_on)
);

alter table public.ai_plan_usage enable row level security;

-- Identical planner questions produce identical prompts, so popular
-- destinations answer from this cache without spending any AI quota at all.
-- Keyed by a SHA-256 over the normalized request (destination, month, group
-- band, pace, vibe, free text, candidate ids, language, model).
create table if not exists public.ai_plan_cache (
  hash text primary key,
  payload jsonb not null,
  model text,
  created_at timestamptz not null default now()
);

create index if not exists ai_plan_cache_created_idx
  on public.ai_plan_cache (created_at);

alter table public.ai_plan_cache enable row level security;

-- Atomically consume one AI generation. Returns 'ok', 'user_cap' or
-- 'global_cap'. The caps travel as arguments so the Edge Function can tune
-- them through its own env vars without a new migration. The global check
-- runs first and is deliberately cheap; a rare concurrent overshoot of one
-- or two calls is fine because the global cap sits well under Google's real
-- free-tier daily limit.
create or replace function public.ai_plan_consume(
  p_user uuid, p_user_cap int, p_global_cap int
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_global int;
  v_n int;
begin
  select coalesce(sum(n), 0) into v_global
    from public.ai_plan_usage
    where used_on = current_date;
  if v_global >= p_global_cap then
    return 'global_cap';
  end if;
  insert into public.ai_plan_usage as u (user_id, used_on, n)
    values (p_user, current_date, 1)
    on conflict (user_id, used_on) do update
      set n = u.n + 1
      where u.n < p_user_cap
    returning n into v_n;
  if v_n is null then
    return 'user_cap';
  end if;
  return 'ok';
end;
$$;

revoke all on function public.ai_plan_consume(uuid, int, int) from public;
revoke all on function public.ai_plan_consume(uuid, int, int) from anon, authenticated;
grant execute on function public.ai_plan_consume(uuid, int, int) to service_role;
