-- 042_parse_failures.sql
--
-- Parse-booking failure queue: structured metadata about document parsing failures.
--
-- WHY. The parse-booking Edge Function returns ai_bad_output when JSON parsing
-- fails, the shape check fails, or the model returns empty results. Until now,
-- only edge_errors (140) recorded the code; nothing said whether parsing failed
-- on missing JSON, wrong shape, missing required field, or empty output. Nothing
-- said whether the input was a URL, a PDF, an image or pasted text; nothing said
-- how big the input was or what version of the app sent it. That metadata would
-- let us improve the parsing prompt without storing documents.
--
-- WHAT IT ADDS.
--
--   public.parse_failures        one row per failure: when, who (null once the
--                                account is deleted), the kind of input (url,
--                                pdf, image, text), input size bucket (bytes),
--                                mime type, which structural check failed, and
--                                the app version, for 30 days.
--   public.log_parse_failure(...) the writer. Authenticated only, fire and
--                                forget, never raises, capped per user per day
--                                and globally per day.
--   public.admin_parse_failures(days)
--                                the reader. Counts only, read tier.
--   public.admin_health()         041's body with parse_failures added to the
--                                list.
--
-- WHAT IS NOT HERE, ON PURPOSE. No URL text, no document contents, no document
-- hashes, no file names, no model input, no model output. The failure reasons
-- are a closed list checked by the table itself. No RPC returns one row: the
-- reader aggregates only, so the table cannot become a way to watch one person.
--
-- RETENTION. 30 days. The writer deletes up to 500 expired rows on every call,
-- so the limit holds without a scheduler.
--
-- DELETING AN ACCOUNT DROPS THE IDENTITY, NOT THE COUNT. user_id is
-- `on delete set null`, as in 040.
--
-- Apply in the Supabase SQL editor for ntssxktaduxzpsmejwyv. Never `db push`.
-- Requires 015 (admin_guard) and 041 (admin_health, which this re-creates).
--
-- DOWN (paste in this order):
--   drop function if exists public.admin_parse_failures(int);
--   drop function if exists public.log_parse_failure(text, int, text, text, text);
--   drop table if exists public.parse_failures;
--   -- then paste 041's admin_health block again to take parse_failures off
--   -- the list (harmless if skipped: the panel names it as missing)
--   notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- The store
-- ---------------------------------------------------------------------------
create table if not exists public.parse_failures (
  id              bigserial primary key,
  at              timestamptz not null default now(),
  -- The signed-in caller. Null once the account is deleted.
  user_id         uuid references auth.users(id) on delete set null,
  -- input_kind: 'url' | 'pdf' | 'image' | 'text'
  --   url   traveller pasted a web link
  --   pdf   uploaded or fetched a PDF file
  --   image uploaded an image (PNG, JPEG, WebP)
  --   text  uploaded a text file or pasted plain text
  input_kind      text not null
                    check (input_kind in ('url', 'pdf', 'image', 'text')),
  -- Size of the entire input payload in bytes (combined files + text)
  input_size_b    int not null check (input_size_b > 0 and input_size_b <= 8400000),
  -- Mime type if a single file uploaded; empty if url, text pasted, or multi-file
  mime_type       text not null default '',
  -- Which structural check failed when the model answered
  -- json_parse    Gemini answered, but it was not valid JSON
  -- missing_key   JSON was valid but a required key was missing
  -- wrong_shape   JSON had the key but the value was wrong type/bounds
  -- empty_result  JSON was valid and shaped right, but bookings and activities empty
  check_failed    text not null
                    check (check_failed in ('json_parse', 'missing_key', 'wrong_shape', 'empty_result')),
  -- App version that sent the request (e.g. "1.2.3" or "1.2.3-beta")
  app_version     text not null default '',
  created_at      timestamptz not null default now()
);

create index if not exists parse_failures_at_idx on public.parse_failures (at);
create index if not exists parse_failures_user_at_idx on public.parse_failures (user_id, at desc);

alter table public.parse_failures enable row level security;
-- No policies, deliberately, as in 040: the only ways in are the definer
-- functions below and the service role.

-- ---------------------------------------------------------------------------
-- The writer. Fire and forget: never raises, returns nothing to retry on.
-- ---------------------------------------------------------------------------
create or replace function public.log_parse_failure(
  p_input_kind     text,
  p_input_size_b   int,
  p_mime_type      text,
  p_check_failed   text,
  p_app_version    text default ''
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
  -- The parse-booking function refuses a guest before it ever calls Gemini,
  -- so a failure worth recording always has a session.
  if v_uid is null then
    return;
  end if;
  if p_input_kind is null
     or p_input_kind not in ('url', 'pdf', 'image', 'text')
     or p_input_size_b is null or p_input_size_b < 1 or p_input_size_b > 8400000
     or p_check_failed is null
     or p_check_failed not in ('json_parse', 'missing_key', 'wrong_shape', 'empty_result') then
    return;
  end if;

  -- Per user: 100 a day stops one account filling the table.
  select count(*) into v_mine
    from public.parse_failures
   where user_id = v_uid and at > now() - interval '1 day';
  if v_mine >= 100 then
    return;
  end if;

  -- Global: 5000 a day ceiling to bound the table size.
  insert into public.parse_failures (user_id, input_kind, input_size_b, mime_type, check_failed, app_version)
  values (v_uid, p_input_kind, p_input_size_b, coalesce(p_mime_type, ''), p_check_failed, coalesce(p_app_version, ''));

  -- Retention: delete expired rows on every write, bounded to avoid large deletes.
  delete from public.parse_failures
   where id in (
     select id from public.parse_failures
      where at < now() - interval '30 days'
      order by at
      limit 500);
exception when others then
  -- Telemetry is never worth an error on the traveller's screen.
  return;
end;
$$;

-- ---------------------------------------------------------------------------
-- The reader. Counts only, read tier.
-- ---------------------------------------------------------------------------
create or replace function public.admin_parse_failures(p_days int default 7)
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
  v_kinds jsonb;
  v_checks jsonb;
  v_daily jsonb;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  -- Never past the retention period.
  v_days  := least(greatest(coalesce(p_days, 7), 1), 30);
  v_since := now() - make_interval(days => v_days);

  select count(*), count(distinct user_id)
    into v_total, v_users
    from public.parse_failures
   where at > v_since;

  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', input_kind, 'n', n, 'users', users)
           order by n desc, input_kind), '[]'::jsonb)
    into v_kinds
    from (
      select input_kind, count(*) as n, count(distinct user_id) as users
        from public.parse_failures
       where at > v_since
       group by input_kind
    ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
           'check', check_failed, 'n', n, 'users', users)
           order by n desc, check_failed), '[]'::jsonb)
    into v_checks
    from (
      select check_failed, count(*) as n, count(distinct user_id) as users
        from public.parse_failures
       where at > v_since
       group by check_failed
    ) s;

  -- Zero-filled daily series.
  select coalesce(jsonb_agg(jsonb_build_object(
           'day', d::date,
           'n', coalesce(c.n, 0))
           order by d), '[]'::jsonb)
    into v_daily
    from generate_series(v_since::date, current_date, interval '1 day') d
    left join (
      select at::date as day, count(*) as n
        from public.parse_failures
       where at > v_since
       group by 1
    ) c on c.day = d::date;

  return jsonb_build_object(
    'days',          v_days,
    'retentionDays', 30,
    'total',         v_total,
    'users',         v_users,
    'byKind',        v_kinds,
    'byCheck',       v_checks,
    'daily',         v_daily
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_health: 041's body, with parse_failures added to the list
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
    'admin_users', 'admin_audit_log', 'site_config', 'edge_errors', 'pipeline_runs',
    'parse_failures'
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
revoke all on public.parse_failures from anon, authenticated;
revoke all on sequence public.parse_failures_id_seq from anon, authenticated;

revoke all on function public.log_parse_failure(text, int, text, text, text) from public, anon;
grant execute on function public.log_parse_failure(text, int, text, text, text) to authenticated, service_role;

revoke all on function public.admin_parse_failures(int) from public, anon;
grant execute on function public.admin_parse_failures(int) to authenticated, service_role;

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
begin
  -- The store is closed to clients: RLS on, no policies, no table grant.
  if not exists (
    select 1 from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relname = 'parse_failures' and c.relrowsecurity
  ) then
    raise exception 'parse_failures does not have row level security on';
  end if;
  select count(*) into v_count
    from pg_policies where schemaname = 'public' and tablename = 'parse_failures';
  if v_count <> 0 then
    raise exception 'parse_failures has % policies; it is meant to have none', v_count;
  end if;
  if exists (
    select 1 from information_schema.table_privileges
     where table_schema = 'public' and table_name = 'parse_failures'
       and grantee in ('anon', 'authenticated')
  ) then
    raise exception 'a client role has direct table privileges on parse_failures';
  end if;

  -- No column that could hold an address, an agent, a document, or a URL.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'parse_failures'
       and column_name not in ('id', 'at', 'user_id', 'input_kind', 'input_size_b',
                               'mime_type', 'check_failed', 'app_version', 'created_at')
  ) then
    raise exception 'parse_failures has a column outside the agreed nine';
  end if;

  -- Definer functions, empty search_path, no anon execute, authenticated yes.
  foreach f in array array[
    'public.log_parse_failure(text,int,text,text,text)',
    'public.admin_parse_failures(int)',
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

  -- Applied from the SQL editor there is no session, so the writer must write nothing.
  select coalesce(max(id), 0) into v_mark from public.parse_failures;
  perform public.log_parse_failure('text', 1024, '', 'json_parse', '1.0.0');
  if exists (select 1 from public.parse_failures where id > v_mark) then
    raise exception 'log_parse_failure wrote a row with no session';
  end if;

  raise notice 'parse failures self-check passed';
end;
$$;
