-- 040_edge_errors.sql
--
-- Edge error telemetry: the AI failures the traveller sees as a message are
-- now also written down, so they still exist after the tab is closed.
--
-- WHY. plan-day, suggest-city and parse-booking answer a failure with a
-- typed code (ai_timeout, ai_bad_output, url_unreachable, ai_error). The
-- client turns that code into a message and the fallback planner, and until
-- now that was the end of it: nothing was stored, so a Gemini outage, a
-- model that started returning broken JSON, or a booking site that blocks
-- our fetcher was invisible the moment the tab closed. 028 records which
-- model ANSWERED; nothing recorded which call FAILED.
--
-- WHY A FIRST-PARTY RPC AND NOT SENTRY. Sentry (or any third-party error or
-- analytics SDK) stores or reads identifiers in the browser and sends device,
-- page and IP data to a processor outside this project. That is the point at
-- which Carta would need a consent banner (ePrivacy Art 5(3)) and a new
-- processor in the privacy policy. This file needs neither: the client calls
-- one RPC with the session it already holds, nothing is stored on the device,
-- and the row carries no IP, no user agent, no page, no URL and no document
-- content. See Execution/P4/T071-error-telemetry.md for the whole argument.
--
-- WHY FROM THE CLIENT AND NOT INSIDE THE EDGE FUNCTIONS. The functions are
-- live and this task does not redeploy them. And the client is the only
-- place that sees every failure the traveller sees: a function that crashes
-- before it can answer, or answers 200 with a body the client cannot use, is
-- a failure only the client knows about.
--
-- WHAT IT ADDS.
--
--   public.edge_errors            one row per failed call: when, who (null
--                                 once the account is deleted), which
--                                 function, which code, whether the code came
--                                 from the function or from the client's own
--                                 shape check, and two HTTP statuses.
--   public.edge_error_daily_total a global daily ceiling, as in 022.
--   public.log_edge_error(...)    the writer. Authenticated only, fire and
--                                 forget, never raises, capped per user per
--                                 day and globally per day, and it prunes
--                                 rows past the retention period as it goes.
--   public.admin_edge_errors(days)
--                                 the reader. Counts only, read tier.
--   public.admin_health()         016's body with edge_errors added to the
--                                 list, so an unpasted 040 shows up in the
--                                 admin panel as a named missing table.
--
-- WHAT IS NOT HERE, ON PURPOSE. No IP (the table has no column for it), no
-- user agent, no page path, no request payload, no URL the traveller pasted,
-- no model output, no free-text error message. The codes are a closed list
-- checked by the table itself. There is no RPC that returns one row: the
-- reader aggregates, so the table cannot become a way to watch one person.
--
-- RETENTION. 90 days. The writer deletes up to 500 expired rows on every
-- call, so the limit holds without a scheduler (this database has no cron).
-- On a stretch with no failures nothing is written and nothing is pruned:
-- the expired rows then wait until the next failure removes them.
--
-- DELETING AN ACCOUNT DROPS THE IDENTITY, NOT THE COUNT. user_id is
-- `on delete set null`, exactly as paywall_events in 022.
--
-- Apply in the Supabase SQL editor for ntssxktaduxzpsmejwyv. Never `db push`.
-- Requires 015 (admin_guard) and 016 (admin_health, which this re-creates).
-- 034 is not required: admin_guard('read') exists from 015 on.
--
-- DOWN (paste in this order):
--   drop function if exists public.admin_edge_errors(int);
--   drop function if exists public.log_edge_error(text, text, text, int, int);
--   drop table if exists public.edge_error_daily_total;
--   drop table if exists public.edge_errors;
--   -- then paste 016's admin_health block again to take edge_errors off
--   -- the list (harmless if skipped: the panel names it as missing)
--   notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- The store
-- ---------------------------------------------------------------------------
create table if not exists public.edge_errors (
  id              bigserial primary key,
  at              timestamptz not null default now(),
  -- The signed-in caller. Null once the account is deleted.
  user_id         uuid references auth.users(id) on delete set null,
  fn              text not null
                    check (fn in ('plan-day', 'suggest-city', 'parse-booking')),
  code            text not null
                    check (code in ('ai_timeout', 'ai_bad_output', 'url_unreachable', 'ai_error')),
  -- 'edge'   the function answered with this code in its error body, or
  --          failed without a readable body (then the code is ai_error)
  -- 'client' the function answered 2xx but the client's shape check refused
  --          the body (always ai_bad_output)
  origin          text not null default 'edge'
                    check (origin in ('edge', 'client')),
  -- The status of the function's own answer (504 for ai_timeout, 502 for
  -- ai_bad_output, 400 for url_unreachable). Null when no answer arrived.
  http_status     smallint check (http_status between 100 and 599),
  -- The status the function passed on from upstream: Gemini's for ai_error,
  -- the booking site's for url_unreachable. A number, never a body.
  upstream_status smallint check (upstream_status between 100 and 599)
);

create index if not exists edge_errors_at_idx on public.edge_errors (at);
create index if not exists edge_errors_user_at_idx on public.edge_errors (user_id, at desc);

alter table public.edge_errors enable row level security;
-- No policies, deliberately, as in 022: the only ways in are the definer
-- functions below and the service role.

create table if not exists public.edge_error_daily_total (
  day date primary key,
  n   bigint not null default 0
);

alter table public.edge_error_daily_total enable row level security;

-- ---------------------------------------------------------------------------
-- The writer. Fire and forget: never raises, returns nothing to retry on,
-- because a telemetry write must never be able to break the fallback path.
-- ---------------------------------------------------------------------------
create or replace function public.log_edge_error(
  p_fn       text,
  p_code     text,
  p_origin   text default 'edge',
  p_http     int  default null,
  p_upstream int  default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_mine bigint;
  v_n    bigint;
begin
  -- The three functions refuse a guest before they ever reach Gemini or a
  -- booking site, so a failure worth recording always has a session.
  if v_uid is null then
    return;
  end if;
  if p_fn is null or p_fn not in ('plan-day', 'suggest-city', 'parse-booking')
     or p_code is null
     or p_code not in ('ai_timeout', 'ai_bad_output', 'url_unreachable', 'ai_error')
     or coalesce(p_origin, 'edge') not in ('edge', 'client') then
    return;
  end if;

  -- Per user: a traveller retrying a failing day plan all afternoon is a few
  -- dozen rows. 100 a day stops one account filling the table.
  select count(*) into v_mine
    from public.edge_errors
   where user_id = v_uid and at > now() - interval '1 day';
  if v_mine >= 100 then
    return;
  end if;

  -- Global, tested by the statement that increments it (022's pattern), so
  -- two concurrent callers cannot both claim the last slot.
  insert into public.edge_error_daily_total as d (day, n)
    values (current_date, 1)
    on conflict (day) do update
      set n = d.n + 1
      where d.n < 50000
    returning n into v_n;
  if v_n is null then
    return;
  end if;

  insert into public.edge_errors (user_id, fn, code, origin, http_status, upstream_status)
  values (
    v_uid,
    p_fn,
    p_code,
    coalesce(p_origin, 'edge'),
    case when p_http between 100 and 599 then p_http end,
    case when p_upstream between 100 and 599 then p_upstream end
  );

  -- Retention, bounded so one call never does a large delete.
  delete from public.edge_errors
   where id in (
     select id from public.edge_errors
      where at < now() - interval '90 days'
      order by at
      limit 500);
  delete from public.edge_error_daily_total
   where day < current_date - 400;
exception when others then
  -- Telemetry is never worth an error on the traveller's screen.
  return;
end;
$$;

-- ---------------------------------------------------------------------------
-- The reader. Counts only, read tier.
-- ---------------------------------------------------------------------------
create or replace function public.admin_edge_errors(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err   text := public.admin_guard('read');
  v_days  int;
  v_since timestamptz;
  v_total bigint := 0;
  v_users bigint := 0;
  v_last  timestamptz;
  v_codes jsonb;
  v_fns   jsonb;
  v_up    jsonb;
  v_daily jsonb;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  -- Never past the retention period: a 365-day window would read as a year
  -- of data when it is 90 days of it.
  v_days  := least(greatest(coalesce(p_days, 30), 1), 90);
  v_since := now() - make_interval(days => v_days);

  select count(*), count(distinct user_id), max(at)
    into v_total, v_users, v_last
    from public.edge_errors
   where at > v_since;

  select coalesce(jsonb_agg(jsonb_build_object(
           'code', code, 'n', n, 'users', users, 'client', client)
           order by n desc, code), '[]'::jsonb)
    into v_codes
    from (
      select code, count(*) as n, count(distinct user_id) as users,
             count(*) filter (where origin = 'client') as client
        from public.edge_errors
       where at > v_since
       group by code
    ) s;

  select coalesce(jsonb_agg(jsonb_build_object('fn', fn, 'code', code, 'n', n)
           order by fn, n desc, code), '[]'::jsonb)
    into v_fns
    from (
      select fn, code, count(*) as n
        from public.edge_errors
       where at > v_since
       group by fn, code
    ) s;

  -- Which upstream status is behind ai_error and url_unreachable: a run of
  -- 429s from Gemini and a run of 403s from one booking site are different
  -- problems with different fixes.
  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'status', status, 'n', n)
           order by n desc, code, status), '[]'::jsonb)
    into v_up
    from (
      select code, upstream_status as status, count(*) as n
        from public.edge_errors
       where at > v_since and upstream_status is not null
       group by code, upstream_status
    ) s;

  -- Zero-filled, so a quiet day reads as a zero rather than a gap.
  select coalesce(jsonb_agg(jsonb_build_object(
           'day',         d::date,
           'n',           coalesce(c.n, 0),
           'timeout',     coalesce(c.timeout, 0),
           'badOutput',   coalesce(c.bad, 0),
           'unreachable', coalesce(c.unreach, 0),
           'error',       coalesce(c.err, 0))
           order by d), '[]'::jsonb)
    into v_daily
    from generate_series(v_since::date, current_date, interval '1 day') d
    left join (
      select at::date as day,
             count(*) as n,
             count(*) filter (where code = 'ai_timeout')      as timeout,
             count(*) filter (where code = 'ai_bad_output')   as bad,
             count(*) filter (where code = 'url_unreachable') as unreach,
             count(*) filter (where code = 'ai_error')        as err
        from public.edge_errors
       where at > v_since
       group by 1
    ) c on c.day = d::date;

  return jsonb_build_object(
    'days',          v_days,
    'retentionDays', 90,
    'total',         v_total,
    'users',         v_users,
    'lastAt',        v_last,
    'byCode',        v_codes,
    'byFunction',    v_fns,
    'byUpstream',    v_up,
    'daily',         v_daily
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_health: 016's body, with edge_errors added to the list
-- ---------------------------------------------------------------------------
create or replace function public.admin_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err text := public.admin_guard('read');
  v_out jsonb := '{}'::jsonb;
  t     text;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  foreach t in array array[
    'profiles', 'entitlements', 'plan_tiers', 'pass_grants', 'ai_usage',
    'ai_daily_total', 'trip_plans', 'trip_plan_stops', 'day_plans',
    'friendships', 'trip_shares', 'user_achievements',
    'admin_users', 'admin_audit_log', 'site_config', 'edge_errors'
  ] loop
    v_out := v_out || jsonb_build_object(
      t, to_regclass('public.' || t) is not null);
  end loop;

  return jsonb_build_object('tables', v_out);
end;
$$;


-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Supabase default-grants every new table in public to anon and
-- authenticated; RLS with no policies already denies them, and this takes
-- the grant back as well (022's reasoning).
revoke all on public.edge_errors from anon, authenticated;
revoke all on public.edge_error_daily_total from anon, authenticated;
revoke all on sequence public.edge_errors_id_seq from anon, authenticated;

revoke all on function public.log_edge_error(text, text, text, int, int) from public, anon;
grant execute on function public.log_edge_error(text, text, text, int, int) to authenticated, service_role;

revoke all on function public.admin_edge_errors(int) from public, anon;
grant execute on function public.admin_edge_errors(int) to authenticated, service_role;

revoke all on function public.admin_health() from public, anon;
grant execute on function public.admin_health() to authenticated, service_role;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  f       text;
  cfg     text[];
  v_count int;
  v_mark  bigint;
  h       jsonb;
begin
  -- The store is closed to clients: RLS on, no policies, no table grant.
  if not exists (
    select 1 from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relname = 'edge_errors' and c.relrowsecurity
  ) then
    raise exception 'edge_errors does not have row level security on';
  end if;
  select count(*) into v_count
    from pg_policies where schemaname = 'public'
     and tablename in ('edge_errors', 'edge_error_daily_total');
  if v_count <> 0 then
    raise exception 'edge_errors has % policies; it is meant to have none', v_count;
  end if;
  if exists (
    select 1 from information_schema.table_privileges
     where table_schema = 'public'
       and table_name in ('edge_errors', 'edge_error_daily_total')
       and grantee in ('anon', 'authenticated')
  ) then
    raise exception 'a client role has direct table privileges on edge_errors';
  end if;

  -- No column that could hold an address, an agent or a document.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'edge_errors'
       and column_name not in ('id', 'at', 'user_id', 'fn', 'code', 'origin',
                               'http_status', 'upstream_status')
  ) then
    raise exception 'edge_errors has a column outside the agreed eight';
  end if;

  -- Definer functions, empty search_path, no anon execute, authenticated yes.
  foreach f in array array[
    'public.log_edge_error(text,text,text,int,int)',
    'public.admin_edge_errors(int)',
    'public.admin_health()'
  ] loop
    if not (select prosecdef from pg_proc where oid = f::regprocedure::oid) then
      raise exception '% is not SECURITY DEFINER', f;
    end if;
    select proconfig into cfg from pg_proc where oid = f::regprocedure::oid;
    if cfg is null or not ('search_path=""' = any(cfg)) then
      raise exception '% does not pin search_path to empty (proconfig %)', f, cfg;
    end if;
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'anon can execute %', f;
    end if;
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'authenticated cannot execute %', f;
    end if;
  end loop;

  -- Applied from the SQL editor there is no session, so the writer must
  -- write nothing and the reader must refuse.
  select coalesce(max(id), 0) into v_mark from public.edge_errors;
  perform public.log_edge_error('plan-day', 'ai_timeout', 'edge', 504, null);
  if exists (select 1 from public.edge_errors where id > v_mark) then
    raise exception 'log_edge_error wrote a row with no session';
  end if;
  if (public.admin_edge_errors(7) ->> 'error') is null then
    raise exception 'admin_edge_errors answered a caller who is not an admin';
  end if;
  if (public.admin_health() ->> 'error') is null then
    raise exception 'admin_health answered a caller who is not an admin';
  end if;

  raise notice 'edge errors self-check passed';
end;
$$;
