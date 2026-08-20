-- Analytics, a feedback inbox, and a way to close the doors.
--
-- Three things the back office could not do yet.
--
-- 1. ANALYTICS. admin_analytics answers the questions an owner actually asks:
--    how many people came back this week, how they sign in, how signups are
--    trending, and which destinations people are really planning trips to.
--    Everything is computed from tables that already exist, so nothing here
--    needs new tracking and nothing new is collected about anybody.
--
--    One honest gap: guest mode leaves no row anywhere (it is a localStorage
--    flag), so the provider split covers ACCOUNTS, not visitors. Counting
--    guests would mean tracking people who deliberately did not sign up, and
--    that trade is not worth making for a number on a dashboard.
--
-- 2. FEEDBACK. The account panel mailed feedback through mailto:, which meant
--    it only worked if the traveller had a mail client set up, and left no
--    record if they did not. It goes in a table now, submitted through a
--    definer function so the table itself stays closed, and read in the admin
--    panel. Rate limited per account and globally, because an open write path
--    without a limit is a spam target.
--
-- 3. MAINTENANCE. A site_config key the app reads before rendering, so the
--    doors can be closed during a bad deploy or a data migration without
--    shipping code. Admins are deliberately exempt: locking yourself out of
--    the tool you use to unlock the site would be a poor design.
--
-- Apply in the Supabase SQL editor AFTER 016. Live project policy: never
-- `db push` against ntssxktaduxzpsmejwyv; paste this file there by hand.

-- ---------------------------------------------------------------------------
-- Feedback
-- ---------------------------------------------------------------------------
-- user_id is ON DELETE SET NULL rather than CASCADE: a bug report is still a
-- bug report after the person who sent it deletes their account, and the
-- message itself carries no identity once the id is gone.
create table if not exists public.feedback (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete set null,
  -- Captured at submit time so a reply is possible after the account is
  -- gone. Optional: signed-out feedback may leave no way to answer.
  email      text check (email is null or char_length(email) <= 320),
  kind       text not null default 'other' check (kind in ('bug', 'idea', 'other')),
  message    text not null check (char_length(message) between 1 and 4000),
  status     text not null default 'new' check (status in ('new', 'open', 'done')),
  -- What the app was showing when they wrote, which is most of what a bug
  -- report is missing. Set by the client; never trusted, only displayed.
  context    jsonb,
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid
);

create index if not exists feedback_status_idx on public.feedback (status, created_at desc);
create index if not exists feedback_user_idx on public.feedback (user_id);

alter table public.feedback enable row level security;
-- No policies at all: the table is written through submit_feedback and read
-- through admin_list_feedback, both below. Nothing reaches it directly.
revoke all on public.feedback from anon, authenticated;

-- The one write path. Granted to anon as well as authenticated, because the
-- feedback form works signed out and somebody who cannot sign in is exactly
-- the person most likely to need it.
create or replace function public.submit_feedback(
  p_message text,
  p_kind    text default 'other',
  p_email   text default null,
  p_context jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg   text := trim(coalesce(p_message, ''));
  v_kind  text := coalesce(nullif(trim(coalesce(p_kind, '')), ''), 'other');
  v_email text := nullif(trim(coalesce(p_email, '')), '');
  n       int;
begin
  if v_msg = '' or char_length(v_msg) > 4000 then
    return jsonb_build_object('error', 'bad_message');
  end if;
  if v_kind not in ('bug', 'idea', 'other') then
    v_kind := 'other';
  end if;
  if v_email is not null and char_length(v_email) > 320 then
    return jsonb_build_object('error', 'bad_email');
  end if;
  if p_context is not null and pg_column_size(p_context) > 4096 then
    p_context := null;
  end if;

  -- Per account: five an hour is far more than anybody with something to say
  -- will send, and far less than a script wants.
  if auth.uid() is not null then
    select count(*) into n from public.feedback
     where user_id = auth.uid() and created_at > now() - interval '1 hour';
    if n >= 5 then
      return jsonb_build_object('error', 'too_many');
    end if;
  end if;

  -- Globally, so the signed-out path cannot be used to flood the table by
  -- anybody who clears their cookies between posts.
  select count(*) into n from public.feedback
   where created_at > now() - interval '1 hour';
  if n >= 200 then
    return jsonb_build_object('error', 'too_many');
  end if;

  insert into public.feedback (user_id, email, kind, message, context)
  values (
    auth.uid(),
    coalesce(v_email, (select u.email from auth.users u where u.id = auth.uid())),
    v_kind, v_msg, p_context
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_list_feedback(
  p_status text default null,
  p_limit  int  default 50,
  p_offset int  default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err    text := public.admin_guard('read');
  v_limit  int  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int  := greatest(coalesce(p_offset, 0), 0);
  v_status text := nullif(trim(coalesce(p_status, '')), '');
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  if v_status is not null and v_status not in ('new', 'open', 'done') then
    v_status := null;
  end if;

  return jsonb_build_object(
    'total', (select count(*) from public.feedback
               where v_status is null or status = v_status),
    'new',   (select count(*) from public.feedback where status = 'new'),
    'rows',  coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',        f.id,
        'kind',      f.kind,
        'status',    f.status,
        'message',   f.message,
        'email',     f.email,
        'context',   f.context,
        'userId',    f.user_id,
        'handle',    p.handle,
        'createdAt', f.created_at
      ) order by f.id desc)
      from (select * from public.feedback
             where v_status is null or status = v_status
             order by id desc limit v_limit offset v_offset) f
      left join public.profiles p on p.user_id = f.user_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_set_feedback_status(p_id bigint, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err text := public.admin_guard('read');
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  if p_status not in ('new', 'open', 'done') then
    return jsonb_build_object('error', 'bad_status');
  end if;

  update public.feedback
     set status = p_status,
         handled_at = case when p_status = 'new' then null else now() end,
         handled_by = case when p_status = 'new' then null else auth.uid() end
   where id = p_id;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  perform public.admin_log('feedback_' || p_status, null, jsonb_build_object('id', p_id));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Analytics
-- ---------------------------------------------------------------------------
-- Every figure comes from a table that already exists. Satellite reads are
-- guarded the same way 016 guards them, so a project missing a migration
-- gets a smaller dashboard rather than an error.
create or replace function public.admin_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err     text := public.admin_guard('read');
  v_day     bigint := 0;
  v_week    bigint := 0;
  v_month   bigint := 0;
  v_never   bigint := 0;
  v_prov    jsonb := '[]'::jsonb;
  v_signups jsonb := '[]'::jsonb;
  v_dests   jsonb := '[]'::jsonb;
  v_countries jsonb := '[]'::jsonb;
  v_fb      jsonb := jsonb_build_object('new', 0, 'total', 0);
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  -- Active accounts, by when they last signed in. This is the honest
  -- available measure: there is no session ping, so somebody using the app
  -- all week on one token counts once.
  select count(*) filter (where last_sign_in_at > now() - interval '1 day'),
         count(*) filter (where last_sign_in_at > now() - interval '7 days'),
         count(*) filter (where last_sign_in_at > now() - interval '30 days'),
         count(*) filter (where last_sign_in_at is null)
    into v_day, v_week, v_month, v_never
    from auth.users;

  -- How accounts sign in. Guests are absent by definition; see the header.
  select coalesce(jsonb_agg(jsonb_build_object('provider', prov, 'n', n)
           order by n desc), '[]'::jsonb)
    into v_prov
    from (
      select coalesce(nullif(raw_app_meta_data ->> 'provider', ''), 'email') as prov,
             count(*) as n
        from auth.users
       group by 1
    ) s;

  -- Signups per day for four weeks, zero-filled so the shape of a quiet week
  -- is visible rather than collapsed out of the series.
  select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'n', coalesce(c.n, 0))
           order by d), '[]'::jsonb)
    into v_signups
    from generate_series(current_date - 27, current_date, interval '1 day') d
    left join (
      select created_at::date as day, count(*) as n
        from auth.users
       where created_at > now() - interval '28 days'
       group by 1
    ) c on c.day = d::date;

  -- What people are actually planning. trip_plan_stops is the real signal:
  -- a stop in a saved plan is a stronger statement than a search.
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', destination_id, 'city', city, 'country', country, 'n', n)
             order by n desc), '[]'::jsonb)
      into v_dests
      from (
        select destination_id, min(city) as city, min(country) as country, count(*) as n
          from public.trip_plan_stops
         group by destination_id
         order by count(*) desc
         limit 15
      ) s;
  exception when others then
    v_dests := '[]'::jsonb;
  end;

  begin
    select coalesce(jsonb_agg(jsonb_build_object('country', country, 'n', n)
             order by n desc), '[]'::jsonb)
      into v_countries
      from (
        select country, count(*) as n
          from public.trip_plan_stops
         where country is not null
         group by country
         order by count(*) desc
         limit 10
      ) s;
  exception when others then
    v_countries := '[]'::jsonb;
  end;

  begin
    select jsonb_build_object(
             'new',   count(*) filter (where status = 'new'),
             'total', count(*))
      into v_fb from public.feedback;
  exception when others then
    v_fb := jsonb_build_object('new', 0, 'total', 0);
  end;

  return jsonb_build_object(
    'activeDay',   v_day,
    'activeWeek',  v_week,
    'activeMonth', v_month,
    'neverSignedIn', v_never,
    'providers',   v_prov,
    'signups',     v_signups,
    'topDests',    v_dests,
    'topCountries', v_countries,
    'feedback',    v_fb
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Maintenance mode, and the rest of the config schema
-- ---------------------------------------------------------------------------
insert into public.site_config (key, value) values
  ('maintenance', '{"enabled": false, "message": ""}'::jsonb)
on conflict (key) do nothing;

-- Extends 015's per-key validation with the maintenance shape. Same posture:
-- known keys must match, unknown keys keep only the size cap.
create or replace function public.admin_set_config(p_key text, p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err text := public.admin_guard('read');
  v_ok  boolean;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  if p_key is null or p_key !~ '^[a-z0-9_]{1,64}$' then
    return jsonb_build_object('error', 'bad_key');
  end if;
  if p_value is null or pg_column_size(p_value) > 16384 then
    return jsonb_build_object('error', 'bad_value');
  end if;

  if p_key = 'announcement' then
    if jsonb_typeof(p_value) <> 'object'
       or jsonb_typeof(p_value -> 'enabled') <> 'boolean'
       or jsonb_typeof(p_value -> 'text') <> 'string'
       or char_length(p_value ->> 'text') > 280
       or coalesce(p_value ->> 'tone', '') not in ('info', 'warn') then
      return jsonb_build_object('error', 'bad_value');
    end if;
  elsif p_key = 'maintenance' then
    if jsonb_typeof(p_value) <> 'object'
       or jsonb_typeof(p_value -> 'enabled') <> 'boolean'
       or jsonb_typeof(p_value -> 'message') <> 'string'
       or char_length(p_value ->> 'message') > 500 then
      return jsonb_build_object('error', 'bad_value');
    end if;
  elsif p_key = 'features' then
    if jsonb_typeof(p_value) <> 'object' then
      return jsonb_build_object('error', 'bad_value');
    end if;
    select coalesce(bool_and(jsonb_typeof(value) = 'boolean'), true)
      into v_ok from jsonb_each(p_value);
    if not v_ok then
      return jsonb_build_object('error', 'bad_value');
    end if;
    select coalesce(bool_and(key ~ '^[a-z0-9_]{1,40}$'), true)
      into v_ok from jsonb_each(p_value);
    if not v_ok then
      return jsonb_build_object('error', 'bad_value');
    end if;
  end if;

  insert into public.site_config as c (key, value, updated_at, updated_by)
  values (p_key, p_value, now(), auth.uid())
  on conflict (key) do update set
    value = excluded.value, updated_at = now(), updated_by = auth.uid();

  perform public.admin_log('set_config', null,
    jsonb_build_object('key', p_key, 'value', p_value));

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.submit_feedback(text, text, text, jsonb) from public;
grant execute on function public.submit_feedback(text, text, text, jsonb) to anon, authenticated, service_role;

revoke all on function public.admin_list_feedback(text, int, int) from public, anon;
grant execute on function public.admin_list_feedback(text, int, int) to authenticated, service_role;

revoke all on function public.admin_set_feedback_status(bigint, text) from public, anon;
grant execute on function public.admin_set_feedback_status(bigint, text) to authenticated, service_role;

revoke all on function public.admin_analytics() from public, anon;
grant execute on function public.admin_analytics() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
  n  int;
begin
  -- The feedback table is closed: RLS on, no policies.
  if not (select relrowsecurity from pg_class where oid = 'public.feedback'::regclass) then
    raise exception 'feedback has row level security switched off';
  end if;
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'feedback';
  if n > 0 then
    raise exception 'feedback carries % policy(ies); it must have none', n;
  end if;

  for fn in select unnest(array[
    'public.admin_analytics()',
    'public.admin_list_feedback(text,int,int)',
    'public.admin_set_feedback_status(bigint,text)',
    'public.submit_feedback(text,text,text,jsonb)'
  ]) loop
    if not (select prosecdef from pg_proc where oid = fn::regprocedure::oid) then
      raise exception '% is not SECURITY DEFINER', fn;
    end if;
  end loop;

  -- Only the submit path is open to the world; the reading ones are not.
  if not has_function_privilege('anon', 'public.submit_feedback(text,text,text,jsonb)', 'execute') then
    raise exception 'anon cannot send feedback; the signed-out form needs this';
  end if;
  for fn in select unnest(array[
    'public.admin_analytics()',
    'public.admin_list_feedback(text,int,int)',
    'public.admin_set_feedback_status(bigint,text)'
  ]) loop
    if has_function_privilege('anon', fn, 'execute') then
      raise exception 'anon can execute %', fn;
    end if;
  end loop;

  if (select count(*) from public.site_config where key = 'maintenance') <> 1 then
    raise exception 'the maintenance config row is missing';
  end if;

  raise notice 'admin analytics self-check passed';
end;
$$;
