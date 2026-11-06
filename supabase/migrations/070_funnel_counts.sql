-- 070, T1129 (I11): product analytics without cookies or identifiers.
-- The down migration is 070_funnel_counts_down.sql. Apply by pasting in the
-- SQL editor, as for 048 and 067. Until then the app's calls fail silently and
-- the admin card stays hidden. Never applied live by the session that wrote it.
--
-- One integer per day per funnel step. No row per visit, no device id, no
-- session id, no IP, no path, no time of day. Same shape and ceilings as
-- launch_counts (048) and channel_counts (067).
--

create table if not exists public.funnel_counts (
  day  date   not null default current_date,
  step text   not null check (step in ('explore_opened','place_opened','plan_started','priced_draft','trip_saved','shared')),
  n    bigint not null default 0 check (n >= 0),
  primary key (day, step)
);
alter table public.funnel_counts enable row level security;
revoke all on table public.funnel_counts from public, anon, authenticated;

create table if not exists public.funnel_daily_total (
  day date primary key,
  n   bigint not null default 0
);
alter table public.funnel_daily_total enable row level security;
revoke all on table public.funnel_daily_total from public, anon, authenticated;

-- Writer: unknown steps are dropped. At most 100,000 ticks per day in all.
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

-- Reader: weeks (Monday start), newest first, each with per-step counts.
create or replace function public.admin_funnel_weekly(p_weeks int default 8)
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
  v_weeks := least(greatest(coalesce(p_weeks, 8), 1), 52);
  v_first := date_trunc('week', current_date)::date - (v_weeks - 1) * 7;
  return jsonb_build_object(
    'since', v_first,
    'weeks', coalesce((
      select jsonb_agg(jsonb_build_object('week', w.week, 'steps', w.steps) order by w.week desc)
        from (
          select s.week, jsonb_agg(jsonb_build_object('step', s.step, 'n', s.n) order by s.step) as steps
            from (select date_trunc('week', day)::date as week, step, sum(n) as n
                    from public.funnel_counts where day >= v_first
                   group by 1, 2) s
           group by s.week) w), '[]'::jsonb));
end;
$$;
revoke all on function public.admin_funnel_weekly(int) from public, anon;
grant execute on function public.admin_funnel_weekly(int) to authenticated, service_role;
