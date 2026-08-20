-- The admin surface stops dying over a table it does not need.
--
-- WHAT WENT WRONG. admin_stats and admin_list_users both read the satellite
-- tables (trip_plans, day_plans, entitlements). The audit log reads none of
-- them. On a project where one of those migrations was never applied, the
-- first two threw undefined_table while the third worked perfectly, which is
-- exactly the symptom that sent us looking: an admin panel with a working
-- audit log, no service numbers, and "no accounts match that search" over a
-- database full of accounts.
--
-- Two rules come out of that, and this file applies both:
--
--   1. A missing SATELLITE table degrades one number, never the whole
--      screen. auth.users, public.profiles and public.admin_audit_log are
--      load-bearing; everything else is optional and is read inside its own
--      exception block.
--   2. Degrading is REPORTED, never silent. admin_stats returns a `missing`
--      array naming the tables it could not read, and admin_list_users
--      returns `degraded` when it fell back. Silence is what made this cost
--      an afternoon.
--
-- Nothing here loosens a permission. Every function keeps its guard, its
-- grants and its SECURITY DEFINER posture.
--
-- Apply in the Supabase SQL editor AFTER 014 and 015. Live project policy:
-- never `db push` against ntssxktaduxzpsmejwyv; paste this file there.

-- ---------------------------------------------------------------------------
-- Per-user counts, each guarded on its own
-- ---------------------------------------------------------------------------
-- plpgsql binds a SQL statement at execution, not at creation, so a reference
-- to a table that does not exist raises at run time and an exception block
-- can catch it. That is what makes this work where a CASE guard would not:
-- a CASE still forces the whole statement to be planned, missing table and
-- all. Internal only, no grants.
create or replace function public.admin_user_counts(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trip bigint := 0;
  v_day  bigint := 0;
begin
  begin
    select count(*) into v_trip from public.trip_plans where user_id = p_user;
  exception when others then v_trip := 0;
  end;
  begin
    select count(*) into v_day from public.day_plans where user_id = p_user;
  exception when others then v_day := 0;
  end;
  return jsonb_build_object('tripPlans', v_trip, 'dayPlans', v_day);
end;
$$;

-- ---------------------------------------------------------------------------
-- Headline numbers, one guard per satellite
-- ---------------------------------------------------------------------------
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err     text := public.admin_guard('read');
  v_users   bigint := 0;
  v_week    bigint := 0;
  v_month   bigint := 0;
  v_trip    bigint := 0;
  v_year    bigint := 0;
  v_tplans  bigint := 0;
  v_dplans  bigint := 0;
  v_ai      bigint := 0;
  v_admins  bigint := 0;
  v_missing text[] := '{}';
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  -- Load-bearing. If this fails the panel has nothing to say anyway.
  select count(*),
         count(*) filter (where created_at > now() - interval '7 days'),
         count(*) filter (where created_at > now() - interval '30 days')
    into v_users, v_week, v_month
    from auth.users;

  select count(*) into v_admins from public.admin_users;

  begin
    select count(*) filter (where tier = 'trip' and expires_at > now()),
           count(*) filter (where tier = 'year' and expires_at > now())
      into v_trip, v_year
      from public.entitlements;
  exception when others then
    v_missing := v_missing || 'entitlements';
  end;

  begin
    select count(*) into v_tplans from public.trip_plans;
  exception when others then
    v_missing := v_missing || 'trip_plans';
  end;

  begin
    select count(*) into v_dplans from public.day_plans;
  exception when others then
    v_missing := v_missing || 'day_plans';
  end;

  begin
    select n into v_ai from public.ai_daily_total where day = current_date;
    v_ai := coalesce(v_ai, 0);
  exception when others then
    v_missing := v_missing || 'ai_daily_total';
  end;

  return jsonb_build_object(
    'users',      v_users,
    'newWeek',    v_week,
    'newMonth',   v_month,
    'admins',     v_admins,
    'passesTrip', v_trip,
    'passesYear', v_year,
    'tripPlans',  v_tplans,
    'dayPlans',   v_dplans,
    'aiToday',    v_ai,
    -- Named out loud so a zero that means "not measured" can never be read
    -- as a zero that means "none".
    'missing',    to_jsonb(v_missing)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The user list, with a fallback that always answers
-- ---------------------------------------------------------------------------
-- The rich query joins entitlements and calls admin_user_counts. If any part
-- of that is unavailable the whole statement fails, so the fallback drops to
-- what every Supabase project is guaranteed to have (auth.users plus the
-- profile) and says so through `degraded`.
create or replace function public.admin_list_users(
  p_search text default null,
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
  v_err      text := public.admin_guard('read');
  v_limit    int  := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset   int  := greatest(coalesce(p_offset, 0), 0);
  v_like     text;
  v_id       uuid;
  v_total    bigint;
  v_rows     jsonb;
  v_degraded boolean := false;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  if nullif(trim(p_search), '') is not null then
    v_like := '%' || replace(replace(replace(trim(p_search),
                '\', '\\'), '%', '\%'), '_', '\_') || '%';
    -- A pasted user id matches exactly, nothing else. Tickets carry ids.
    begin
      v_id := trim(p_search)::uuid;
    exception when others then
      v_id := null;
    end;
  end if;

  select count(*)
    into v_total
    from auth.users u
    left join public.profiles p on p.user_id = u.id
   where v_like is null
      or u.id = v_id
      or u.email ilike v_like
      or p.handle ilike v_like
      or p.display_name ilike v_like;

  begin
    select coalesce(jsonb_agg(row_data), '[]'::jsonb)
      into v_rows
      from (
        select jsonb_build_object(
          'id',          u.id,
          'email',       u.email,
          'createdAt',   u.created_at,
          'lastSignIn',  u.last_sign_in_at,
          'handle',      p.handle,
          'displayName', p.display_name,
          'avatarEmoji', p.avatar_emoji,
          'tier',        case when e.tier is not null and e.tier <> 'free'
                               and e.expires_at > now()
                              then e.tier else 'free' end,
          'expiresAt',   case when e.expires_at > now() then e.expires_at end,
          'bannedUntil', case when u.banned_until > now() then u.banned_until end,
          'tripPlans',   (c.counts ->> 'tripPlans')::int,
          'dayPlans',    (c.counts ->> 'dayPlans')::int,
          'isAdmin',     exists (select 1 from public.admin_users a where a.user_id = u.id)
        ) as row_data
        from auth.users u
        left join public.profiles p on p.user_id = u.id
        left join public.entitlements e on e.user_id = u.id
        cross join lateral (select public.admin_user_counts(u.id) as counts) c
       where v_like is null
          or u.id = v_id
          or u.email ilike v_like
          or p.handle ilike v_like
          or p.display_name ilike v_like
       order by u.created_at desc
       limit v_limit offset v_offset
      ) listed;
  exception when others then
    v_degraded := true;
    select coalesce(jsonb_agg(row_data), '[]'::jsonb)
      into v_rows
      from (
        select jsonb_build_object(
          'id',          u.id,
          'email',       u.email,
          'createdAt',   u.created_at,
          'lastSignIn',  u.last_sign_in_at,
          'handle',      p.handle,
          'displayName', p.display_name,
          'avatarEmoji', p.avatar_emoji,
          'tier',        'free',
          'expiresAt',   null,
          'bannedUntil', case when u.banned_until > now() then u.banned_until end,
          'tripPlans',   0,
          'dayPlans',    0,
          'isAdmin',     exists (select 1 from public.admin_users a where a.user_id = u.id)
        ) as row_data
        from auth.users u
        left join public.profiles p on p.user_id = u.id
       where v_like is null
          or u.id = v_id
          or u.email ilike v_like
          or p.handle ilike v_like
          or p.display_name ilike v_like
       order by u.created_at desc
       limit v_limit offset v_offset
      ) listed;
  end;

  return jsonb_build_object('total', v_total, 'rows', v_rows, 'degraded', v_degraded);
end;
$$;

-- ---------------------------------------------------------------------------
-- One user, every optional block guarded
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_user(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err     text := public.admin_guard('read');
  u         record;
  v_tier    text := 'free';
  v_period  date := date_trunc('month', now())::date;
  v_expires timestamptz;
  v_plans   bigint := 0;
  v_ground  bigint := 0;
  v_friends bigint := 0;
  v_counts  jsonb  := jsonb_build_object('tripPlans', 0, 'dayPlans', 0);
  v_badges  jsonb  := '[]'::jsonb;
  v_grants  jsonb  := '[]'::jsonb;
  v_history jsonb  := '[]'::jsonb;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  select au.id, au.email, au.created_at, au.last_sign_in_at,
         au.email_confirmed_at, au.banned_until,
         au.raw_app_meta_data ->> 'provider' as provider,
         p.handle, p.display_name, p.avatar_emoji
    into u
    from auth.users au
    left join public.profiles p on p.user_id = au.id
   where au.id = p_user;

  if u.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  perform public.admin_log('view_user', p_user, null);

  begin
    select r.tier, r.period_start, r.expires_at
      into v_tier, v_period, v_expires
      from public.ai_resolve_tier(p_user) r;
  exception when others then
    v_tier := 'free';
  end;

  begin
    select coalesce(sum(n) filter (where kind = 'plan'), 0),
           coalesce(sum(n) filter (where kind = 'ground'), 0)
      into v_plans, v_ground
      from public.ai_usage
     where user_id = p_user and period_start = v_period;
  exception when others then
    v_plans := 0; v_ground := 0;
  end;

  v_counts := public.admin_user_counts(p_user);

  begin
    select count(*) into v_friends from public.friendships f
     where (f.requester = p_user or f.addressee = p_user) and f.status = 'accepted';
  exception when others then v_friends := 0;
  end;

  begin
    select coalesce(jsonb_agg(a.badge order by a.earned_at), '[]'::jsonb)
      into v_badges from public.user_achievements a where a.user_id = p_user;
  exception when others then v_badges := '[]'::jsonb;
  end;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'tier', g.tier, 'expiresAt', g.expires_at, 'grantedAt', g.granted_at)
             order by g.granted_at desc), '[]'::jsonb)
      into v_grants
      from (select * from public.pass_grants
             where user_id = p_user order by granted_at desc limit 10) g;
  exception when others then v_grants := '[]'::jsonb;
  end;

  -- What has been done to and said about this account, latest first. The
  -- view_user noise is filtered out, or the history would mostly record
  -- itself being looked at.
  select coalesce(jsonb_agg(jsonb_build_object(
           'action', h.action,
           'actor',  coalesce(ap.handle, h.actor::text),
           'detail', h.detail,
           'createdAt', h.created_at)
           order by h.id desc), '[]'::jsonb)
    into v_history
    from (select * from public.admin_audit_log
           where target_user = p_user and action <> 'view_user'
           order by id desc limit 15) h
    left join public.profiles ap on ap.user_id = h.actor;

  return jsonb_build_object(
    'id',          u.id,
    'email',       u.email,
    'createdAt',   u.created_at,
    'lastSignIn',  u.last_sign_in_at,
    'confirmedAt', u.email_confirmed_at,
    'bannedUntil', case when u.banned_until > now() then u.banned_until end,
    'provider',    u.provider,
    'handle',      u.handle,
    'displayName', u.display_name,
    'avatarEmoji', u.avatar_emoji,
    'isAdmin',     exists (select 1 from public.admin_users a where a.user_id = p_user),
    'tier',        v_tier,
    'periodStart', v_period,
    'expiresAt',   v_expires,
    'plansUsed',   v_plans,
    'groundUsed',  v_ground,
    'tripPlans',   (v_counts ->> 'tripPlans')::int,
    'dayPlans',    (v_counts ->> 'dayPlans')::int,
    'friends',     v_friends,
    'badges',      v_badges,
    'grants',      v_grants,
    'history',     v_history
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- What this database actually has
-- ---------------------------------------------------------------------------
-- Reports which tables the admin surface depends on are present, so a gap
-- shows up as a line in the panel rather than as an empty screen.
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
    'admin_users', 'admin_audit_log', 'site_config'
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
revoke all on function public.admin_user_counts(uuid) from public, anon, authenticated;

revoke all on function public.admin_health() from public, anon;
grant execute on function public.admin_health() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  for fn in select unnest(array[
    'public.admin_user_counts(uuid)',
    'public.admin_health()',
    'public.admin_stats()',
    'public.admin_list_users(text,int,int)',
    'public.admin_get_user(uuid)'
  ]) loop
    if not (select prosecdef from pg_proc where oid = fn::regprocedure::oid) then
      raise exception '% is not SECURITY DEFINER', fn;
    end if;
    if has_function_privilege('anon', fn, 'execute') then
      raise exception 'anon can execute %', fn;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.admin_user_counts(uuid)', 'execute') then
    raise exception 'authenticated can execute admin_user_counts; it must be internal only';
  end if;

  raise notice 'admin resilience self-check passed';
end;
$$;
