-- 078 down: back to the 044 / 070 / 071 / 030 state.
-- One-way parts, said plainly: the funnel counts for ask_answer and
-- ask_to_plan and the day_cap rows in ai_cap_events are deleted (the old
-- check constraints cannot hold them), and the cached split of ai_usage_days
-- is lost (n keeps the total). Deploy the previous Edge Functions first or
-- with it; the new ones fall back to ai_consume on their own.

-- 6
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
  if v_step not in ('explore_opened','place_opened','plan_started','priced_draft','trip_saved','shared') then
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

delete from public.funnel_counts where step in ('ask_answer', 'ask_to_plan');
alter table public.funnel_counts drop constraint if exists funnel_counts_step_check;
alter table public.funnel_counts add constraint funnel_counts_step_check
  check (step in ('explore_opened','place_opened','plan_started','priced_draft','trip_saved','shared'));

-- 5
delete from public.ai_cap_events where reason = 'day_cap';
alter table public.ai_cap_events drop constraint if exists ai_cap_events_reason_check;
alter table public.ai_cap_events add constraint ai_cap_events_reason_check
  check (reason in ('user_cap', 'global_cap'));

-- 4 (044's ai_refund)
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
revoke all on function public.ai_refund(uuid, text) from public, anon, authenticated;
grant execute on function public.ai_refund(uuid, text) to service_role;

-- 3
drop function if exists public.ai_consume_v2(uuid, text, int, int, boolean);

-- 2
alter table public.ai_usage_days drop constraint if exists ai_usage_days_cached_le_n;
alter table public.ai_usage_days drop column if exists cached;

-- 1
alter table public.ai_model_events
  drop column if exists tokens_thought,
  drop column if exists tokens_cached,
  drop column if exists grounded_queries,
  drop column if exists thinking;
