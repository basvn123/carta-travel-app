-- 072, T1152 (ROADMAP F3): the taste profile with validation.
-- The down migration is 072_taste_profile_down.sql. Apply by pasting in the
-- SQL editor after 071. Never applied live by the session that wrote it.
--
-- Two things:
--
-- 1. account_things (065) takes a fifth kind, 'taste': one row per taxonomy
--    node the traveller said yes or no to ({ v, at }; a taken-back verdict is
--    a tombstone) and one row '_profile' with the chips and their evidence
--    counts. Same owner-only RLS, cap and size check as the other kinds, so
--    it cascades on account delete and is in export_user_data (069) as
--    accountThings. Before this file the app's taste sync gets 23514 for
--    'taste' and turns itself off; the other kinds keep syncing.
--
-- 2. taste_counts: how often a chip is shown, accepted and rejected, with no
--    cookie or identifier. One integer per day per event, facet and position
--    bucket. No row per visit, no account, device or session id, no node,
--    place or trip, no IP, no path, no time of day. Same shape and ceilings
--    as funnel_counts (070). Acceptance rate = accept / (accept + reject).

-- 1. The fifth kind.
alter table public.account_things drop constraint if exists account_things_kind_check;
alter table public.account_things add constraint account_things_kind_check
  check (kind in ('kept', 'journey', 'trip', 'device_trip', 'taste'));

-- 2. The counter.
create table if not exists public.taste_counts (
  day   date     not null default current_date,
  event text     not null check (event in ('shown', 'accept', 'reject')),
  facet text     not null check (facet in ('activity', 'setting', 'vibe', 'traveller', 'practical')),
  pos   smallint not null check (pos between 1 and 3),
  n     bigint   not null default 0 check (n >= 0),
  primary key (day, event, facet, pos)
);
alter table public.taste_counts enable row level security;
revoke all on table public.taste_counts from public, anon, authenticated;

create table if not exists public.taste_daily_total (
  day date primary key,
  n   bigint not null default 0
);
alter table public.taste_daily_total enable row level security;
revoke all on table public.taste_daily_total from public, anon, authenticated;

-- Writer: anything unknown is dropped. At most 100,000 ticks per day in all.
create or replace function public.taste_tick(p_event text, p_facet text, p_pos int)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event text := lower(coalesce(p_event, ''));
  v_facet text := lower(coalesce(p_facet, ''));
  v_n     bigint;
begin
  if v_event not in ('shown', 'accept', 'reject')
     or v_facet not in ('activity', 'setting', 'vibe', 'traveller', 'practical')
     or p_pos is null or p_pos not between 1 and 3 then
    return;
  end if;
  insert into public.taste_daily_total as d (day, n) values (current_date, 1)
    on conflict (day) do update set n = d.n + 1 where d.n < 100000
    returning n into v_n;
  if v_n is null then return; end if;
  insert into public.taste_counts as c (day, event, facet, pos, n)
    values (current_date, v_event, v_facet, p_pos::smallint, 1)
    on conflict (day, event, facet, pos) do update set n = c.n + 1;
  delete from public.taste_daily_total where day < current_date - 400;
exception when others then
  return;
end;
$$;
revoke all on function public.taste_tick(text, text, int) from public;
grant execute on function public.taste_tick(text, text, int) to anon, authenticated, service_role;

-- Reader: weeks (Monday start), newest first, each with its rows.
create or replace function public.admin_taste_weekly(p_weeks int default 8)
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
      select jsonb_agg(jsonb_build_object('week', w.week, 'rows', w.rows) order by w.week desc)
        from (
          select s.week, jsonb_agg(jsonb_build_object('event', s.event, 'facet', s.facet, 'pos', s.pos, 'n', s.n)
                                   order by s.event, s.facet, s.pos) as rows
            from (select date_trunc('week', day)::date as week, event, facet, pos, sum(n) as n
                    from public.taste_counts where day >= v_first
                   group by 1, 2, 3, 4) s
           group by s.week) w), '[]'::jsonb));
end;
$$;
revoke all on function public.admin_taste_weekly(int) from public, anon;
grant execute on function public.admin_taste_weekly(int) to authenticated, service_role;

notify pgrst, 'reload schema';

-- Self-check.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'account_things_kind_check'
       and pg_get_constraintdef(oid) like '%taste%'
  ) then
    raise exception 'account_things does not take the taste kind';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.taste_counts'::regclass) then
    raise exception 'taste_counts has row level security off';
  end if;
  if has_table_privilege('anon', 'public.taste_counts', 'select') then
    raise exception 'anon must not read taste_counts';
  end if;
  raise notice 'taste profile self-check passed';
end $$;
