-- PENDING migration, T1109 (K12): cookieless channel counts.
-- NOT NUMBERED ON PURPOSE: the orchestrator assigns the next free number
-- (after 065) and renames this file and its _down. Apply by pasting in the
-- SQL editor, as for 048. Until then the app's calls fail silently and the
-- admin card stays hidden.
--
-- One integer per day per (channel, medium). No row per visit, no device id,
-- no session id, no IP, no path, no time of day. Same shape and ceilings as
-- launch_counts (048).
--
-- DOWN (kept in this file until it is numbered):
--   drop function if exists public.admin_channel_weekly(int);
--   drop function if exists public.channel_visit(text, text);
--   drop table if exists public.channel_counts;
--   drop table if exists public.channel_daily_total;

create table if not exists public.channel_counts (
  day     date   not null default current_date,
  channel text   not null check (channel ~ '^[a-z0-9_-]{1,32}$'),
  medium  text   not null check (medium in ('email','social','paid','referral','organic','other','none')),
  n       bigint not null default 0 check (n >= 0),
  primary key (day, channel, medium)
);
alter table public.channel_counts enable row level security;
revoke all on table public.channel_counts from public, anon, authenticated;

create table if not exists public.channel_daily_total (
  day date primary key,
  n   bigint not null default 0
);
alter table public.channel_daily_total enable row level security;
revoke all on table public.channel_daily_total from public, anon, authenticated;

create or replace function public.channel_visit(p_channel text, p_medium text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_channel text := left(regexp_replace(lower(coalesce(p_channel, '')), '[^a-z0-9_-]', '', 'g'), 32);
  v_medium  text := lower(coalesce(p_medium, 'none'));
  v_n       bigint;
  v_keys    int;
begin
  if v_channel = '' then v_channel := 'none'; end if;
  if v_medium not in ('email','social','paid','referral','organic','other','none') then
    v_medium := 'other';
  end if;
  -- A new key for today only while today holds fewer than 500 keys, so a
  -- flood of made-up sources cannot grow the table.
  if not exists (select 1 from public.channel_counts c
                  where c.day = current_date and c.channel = v_channel and c.medium = v_medium) then
    select count(*) into v_keys from public.channel_counts c where c.day = current_date;
    if v_keys >= 500 then return; end if;
  end if;
  insert into public.channel_daily_total as d (day, n) values (current_date, 1)
    on conflict (day) do update set n = d.n + 1 where d.n < 100000
    returning n into v_n;
  if v_n is null then return; end if;
  insert into public.channel_counts as c (day, channel, medium, n)
    values (current_date, v_channel, v_medium, 1)
    on conflict (day, channel, medium) do update set n = c.n + 1;
  delete from public.channel_daily_total where day < current_date - 400;
exception when others then
  return;
end;
$$;
revoke all on function public.channel_visit(text, text) from public;
grant execute on function public.channel_visit(text, text) to anon, authenticated, service_role;

-- Reader: weeks (Monday start), newest first, each with per-channel counts.
create or replace function public.admin_channel_weekly(p_weeks int default 8)
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
      select jsonb_agg(jsonb_build_object('week', w.week, 'channels', w.channels) order by w.week desc)
        from (
          select s.week, jsonb_agg(jsonb_build_object('channel', s.channel, 'n', s.n) order by s.n desc, s.channel) as channels
            from (select date_trunc('week', day)::date as week, channel, sum(n) as n
                    from public.channel_counts where day >= v_first
                   group by 1, 2) s
           group by s.week) w), '[]'::jsonb));
end;
$$;
revoke all on function public.admin_channel_weekly(int) from public, anon;
grant execute on function public.admin_channel_weekly(int) to authenticated, service_role;
