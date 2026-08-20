-- Admin layer: user management, live site config, and the audit trail.
--
-- WHY THIS SHAPE. The service-role key can never ship in the browser, so the
-- admin surface is built the same way every other privileged surface in this
-- schema is built: SECURITY DEFINER functions that decide FOR THEMSELVES who
-- is calling. Membership lives in public.admin_users, a table with row level
-- security enabled and NO policies at all, which makes it deny-all from the
-- client. The only way to become an admin is an INSERT run by hand in the
-- Supabase SQL editor. A compromised browser session therefore cannot
-- self-promote, and a compromised admin session still cannot mint more admins.
--
-- Every function below re-checks public.is_admin() on entry. The client-side
-- gate in the app is decoration; this file is the actual door.
--
-- The audit log deliberately has no foreign keys: the trail must survive the
-- deletion of both the actor and the target, or deleting an account would
-- also shred the record of who deleted it.
--
-- To grant yourself admin, run in the SQL editor (and nowhere else):
--
--   insert into public.admin_users (user_id, note)
--   select id, 'owner' from auth.users where email = 'you@example.com';
--
-- Apply in the Supabase SQL editor. Live project policy: never `db push`
-- against ntssxktaduxzpsmejwyv; paste this file there by hand.
-- Requires 007_passes.sql and 010_profiles.sql.

-- ---------------------------------------------------------------------------
-- Who is an admin
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
-- Deliberately no policies: RLS with an empty policy set denies everything.
-- Belt and braces on top of that, in case a future migration adds a broad
-- grant by accident:
revoke all on public.admin_users from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The audit trail
-- ---------------------------------------------------------------------------
-- Append-only from the perspective of every role the client can hold. Rows
-- are written exclusively by public.admin_log below (definer, no grants) and
-- read exclusively through public.admin_get_audit. actor and target_user are
-- plain uuids on purpose; see the header.
create table if not exists public.admin_audit_log (
  id          bigint generated always as identity primary key,
  actor       uuid not null,
  action      text not null,
  target_user uuid,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Live site configuration
-- ---------------------------------------------------------------------------
-- The "change the site without a deploy" surface. Same posture as plan_tiers:
-- world-readable (the app reads it before anyone signs in), writable only
-- through the gated function below. Values are jsonb so one table carries
-- banners, feature flags and whatever comes later.
create table if not exists public.site_config (
  key        text primary key check (key ~ '^[a-z0-9_]{1,64}$'),
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.site_config enable row level security;

drop policy if exists "site_config_read_all" on public.site_config;
create policy "site_config_read_all" on public.site_config
  for select using (true);
revoke insert, update, delete on public.site_config from anon, authenticated;

-- Seed the keys the app already knows how to render. ON CONFLICT DO NOTHING
-- so re-applying this file never clobbers a live edit.
insert into public.site_config (key, value) values
  ('announcement', '{"enabled": false, "text": "", "tone": "info"}'::jsonb),
  ('features',     '{}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- The gate and the pen
-- ---------------------------------------------------------------------------
-- is_admin is the ONLY membership check, used by every function below and by
-- the app (to decide whether to show the admin panel at all). It answers only
-- for the caller, so the most it can ever leak is "am I an admin", to me.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users a where a.user_id = auth.uid());
$$;

-- Internal writer for the audit trail. No grants at all: only the definer
-- functions in this file can reach it, because inside a SECURITY DEFINER body
-- execute privilege is checked against the function owner, not the caller.
-- auth.uid() still resolves to the human behind the request, which is exactly
-- who the trail should name.
create or replace function public.admin_log(
  p_action text, p_target uuid, p_detail jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_audit_log (actor, action, target_user, detail)
  values (auth.uid(), p_action, p_target, p_detail);
$$;

-- ---------------------------------------------------------------------------
-- Dashboard headline numbers
-- ---------------------------------------------------------------------------
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('error', 'forbidden');
  end if;

  return jsonb_build_object(
    'users',      (select count(*) from auth.users),
    'newWeek',    (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'newMonth',   (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'passesTrip', (select count(*) from public.entitlements
                    where tier = 'trip' and expires_at > now()),
    'passesYear', (select count(*) from public.entitlements
                    where tier = 'year' and expires_at > now()),
    'tripPlans',  (select count(*) from public.trip_plans),
    'dayPlans',   (select count(*) from public.day_plans),
    'aiToday',    coalesce((select n from public.ai_daily_total where day = current_date), 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The user list
-- ---------------------------------------------------------------------------
-- Search covers email, handle and display name. The pattern is escaped so a
-- search for "100%" means the literal text, not a wildcard.
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
  v_limit  int := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_like   text;
  v_total  bigint;
  v_rows   jsonb;
begin
  if not public.is_admin() then
    return jsonb_build_object('error', 'forbidden');
  end if;

  if nullif(trim(p_search), '') is not null then
    v_like := '%' || replace(replace(replace(trim(p_search),
                '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  select count(*)
    into v_total
    from auth.users u
    left join public.profiles p on p.user_id = u.id
   where v_like is null
      or u.email ilike v_like
      or p.handle ilike v_like
      or p.display_name ilike v_like;

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
        'tripPlans',   (select count(*) from public.trip_plans t where t.user_id = u.id),
        'dayPlans',    (select count(*) from public.day_plans d where d.user_id = u.id),
        'isAdmin',     exists (select 1 from public.admin_users a where a.user_id = u.id)
      ) as row_data
      from auth.users u
      left join public.profiles p on p.user_id = u.id
      left join public.entitlements e on e.user_id = u.id
     where v_like is null
        or u.email ilike v_like
        or p.handle ilike v_like
        or p.display_name ilike v_like
     order by u.created_at desc
     limit v_limit offset v_offset
    ) listed;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

-- ---------------------------------------------------------------------------
-- One user, in full
-- ---------------------------------------------------------------------------
-- The one read that IS logged: opening somebody's detail view is an access to
-- personal data, and the trail should say it happened. Listing is not logged,
-- or every page load would bury the mutations the log exists to keep.
create or replace function public.admin_get_user(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u  record;
  r  record;
begin
  if not public.is_admin() then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select au.id, au.email, au.created_at, au.last_sign_in_at,
         au.email_confirmed_at,
         au.raw_app_meta_data ->> 'provider' as provider,
         p.handle, p.display_name, p.avatar_emoji,
         e.tier, e.period_start, e.expires_at, e.source
    into u
    from auth.users au
    left join public.profiles p on p.user_id = au.id
    left join public.entitlements e on e.user_id = au.id
   where au.id = p_user;

  if u.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  perform public.admin_log('view_user', p_user, null);

  select * into r from public.ai_resolve_tier(p_user);

  return jsonb_build_object(
    'id',          u.id,
    'email',       u.email,
    'createdAt',   u.created_at,
    'lastSignIn',  u.last_sign_in_at,
    'confirmedAt', u.email_confirmed_at,
    'provider',    u.provider,
    'handle',      u.handle,
    'displayName', u.display_name,
    'avatarEmoji', u.avatar_emoji,
    'isAdmin',     exists (select 1 from public.admin_users a where a.user_id = p_user),
    'tier',        r.tier,
    'periodStart', r.period_start,
    'expiresAt',   r.expires_at,
    'source',      u.source,
    'plansUsed',   coalesce((select sum(n) from public.ai_usage
                              where user_id = p_user and period_start = r.period_start
                                and kind = 'plan'), 0),
    'groundUsed',  coalesce((select sum(n) from public.ai_usage
                              where user_id = p_user and period_start = r.period_start
                                and kind = 'ground'), 0),
    'tripPlans',   (select count(*) from public.trip_plans t where t.user_id = p_user),
    'dayPlans',    (select count(*) from public.day_plans d where d.user_id = p_user),
    'friends',     (select count(*) from public.friendships f
                     where (f.requester = p_user or f.addressee = p_user)
                       and f.status = 'accepted'),
    'badges',      (select coalesce(jsonb_agg(a.badge order by a.earned_at), '[]'::jsonb)
                     from public.user_achievements a where a.user_id = p_user),
    'grants',      (select coalesce(jsonb_agg(jsonb_build_object(
                        'tier', g.tier, 'expiresAt', g.expires_at,
                        'grantedAt', g.granted_at)
                        order by g.granted_at desc), '[]'::jsonb)
                     from (select * from public.pass_grants
                            where user_id = p_user
                            order by granted_at desc limit 10) g)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Change a user's pass by hand
-- ---------------------------------------------------------------------------
-- The manual sibling of grant_pass: refunds, goodwill extensions, and test
-- accounts. Setting 'free' revokes whatever is there. p_days overrides the
-- tier's own period length when given (that is how the owner account holds a
-- pass to 2126).
create or replace function public.admin_set_tier(
  p_user uuid, p_tier text, p_days int default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg     public.plan_tiers%rowtype;
  v_days  int;
  v_until timestamptz;
begin
  if not public.is_admin() then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select * into cfg from public.plan_tiers where tier = p_tier;
  if cfg.tier is null then
    return jsonb_build_object('error', 'bad_tier');
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    return jsonb_build_object('error', 'not_found');
  end if;

  if p_tier = 'free' then
    insert into public.entitlements as t
      (user_id, tier, period_start, expires_at, source, updated_at)
    values (p_user, 'free', now(), null, 'manual', now())
    on conflict (user_id) do update set
      tier = 'free', period_start = now(), expires_at = null,
      source = 'manual', updated_at = now();
    perform public.admin_log('set_tier', p_user, jsonb_build_object('tier', 'free'));
    return jsonb_build_object('ok', true, 'tier', 'free');
  end if;

  v_days  := coalesce(p_days, cfg.period_days);
  if v_days is null or v_days < 1 or v_days > 36600 then
    return jsonb_build_object('error', 'bad_days');
  end if;
  v_until := now() + make_interval(days => v_days);

  insert into public.entitlements as t
    (user_id, tier, period_start, expires_at, source, updated_at)
  values (p_user, p_tier, now(), v_until, 'manual', now())
  on conflict (user_id) do update set
    tier = excluded.tier, period_start = excluded.period_start,
    expires_at = excluded.expires_at, source = 'manual', updated_at = now();

  perform public.admin_log('set_tier', p_user,
    jsonb_build_object('tier', p_tier, 'days', v_days, 'expiresAt', v_until));

  return jsonb_build_object('ok', true, 'tier', p_tier, 'expiresAt', v_until);
end;
$$;

-- ---------------------------------------------------------------------------
-- Refill an allowance
-- ---------------------------------------------------------------------------
-- Deletes the usage rows for the period the user is currently in, which
-- refills the allowance without moving the period itself. Works the same for
-- free accounts (calendar month) and pass holders.
create or replace function public.admin_reset_quota(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if not public.is_admin() then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    return jsonb_build_object('error', 'not_found');
  end if;

  select * into r from public.ai_resolve_tier(p_user);
  delete from public.ai_usage
   where user_id = p_user and period_start = r.period_start;

  perform public.admin_log('reset_quota', p_user,
    jsonb_build_object('periodStart', r.period_start));

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Delete an account on a user's behalf
-- ---------------------------------------------------------------------------
-- The support path for "please delete my data" emails. Three guards:
-- p_confirm must retype the target's exact email or handle (no fat-finger
-- deletions), an admin cannot delete another admin (demote in the SQL editor
-- first), and an admin cannot delete themselves here (delete_user from 005
-- already covers that, with the same cascades). Logged BEFORE the delete,
-- with an email and handle snapshot, because afterwards there is nothing
-- left to name.
create or replace function public.admin_delete_user(p_user uuid, p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email  text;
  v_handle text;
begin
  if not public.is_admin() then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if p_user = auth.uid() then
    return jsonb_build_object('error', 'own_account');
  end if;
  if exists (select 1 from public.admin_users a where a.user_id = p_user) then
    return jsonb_build_object('error', 'target_is_admin');
  end if;

  select u.email, p.handle into v_email, v_handle
    from auth.users u
    left join public.profiles p on p.user_id = u.id
   where u.id = p_user;
  if v_email is null and v_handle is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if trim(coalesce(p_confirm, '')) not in (coalesce(v_email, ''), coalesce(v_handle, '')) then
    return jsonb_build_object('error', 'confirm_mismatch');
  end if;

  perform public.admin_log('delete_user', p_user,
    jsonb_build_object('email', v_email, 'handle', v_handle));

  delete from auth.users where id = p_user;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Write site config
-- ---------------------------------------------------------------------------
-- The 16KB cap is an abuse guard, not a design constraint: site_config is for
-- knobs and copy, and anything bigger belongs in the wire format.
create or replace function public.admin_set_config(p_key text, p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if p_key is null or p_key !~ '^[a-z0-9_]{1,64}$' then
    return jsonb_build_object('error', 'bad_key');
  end if;
  if p_value is null or pg_column_size(p_value) > 16384 then
    return jsonb_build_object('error', 'bad_value');
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
-- Read the trail
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_audit(
  p_limit int default 50, p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit  int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_admin() then
    return jsonb_build_object('error', 'forbidden');
  end if;

  return jsonb_build_object(
    'total', (select count(*) from public.admin_audit_log),
    'rows',  coalesce((select jsonb_agg(jsonb_build_object(
               'id',        l.id,
               'action',    l.action,
               'actor',     coalesce(ap.handle, l.actor::text),
               'target',    coalesce(tp.handle, tu.email, l.target_user::text),
               'detail',    l.detail,
               'createdAt', l.created_at) order by l.id desc)
              from (select * from public.admin_audit_log
                     order by id desc limit v_limit offset v_offset) l
              left join public.profiles ap on ap.user_id = l.actor
              left join public.profiles tp on tp.user_id = l.target_user
              left join auth.users tu on tu.id = l.target_user), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Everything self-gates on is_admin, so `authenticated` may EXECUTE;
-- the function body is the door, not the grant. anon gets nothing, and
-- admin_log is reachable by nobody at all.
-- ---------------------------------------------------------------------------
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

revoke all on function public.admin_log(text, uuid, jsonb) from public, anon, authenticated;

revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated, service_role;

revoke all on function public.admin_list_users(text, int, int) from public, anon;
grant execute on function public.admin_list_users(text, int, int) to authenticated, service_role;

revoke all on function public.admin_get_user(uuid) from public, anon;
grant execute on function public.admin_get_user(uuid) to authenticated, service_role;

revoke all on function public.admin_set_tier(uuid, text, int) from public, anon;
grant execute on function public.admin_set_tier(uuid, text, int) to authenticated, service_role;

revoke all on function public.admin_reset_quota(uuid) from public, anon;
grant execute on function public.admin_reset_quota(uuid) to authenticated, service_role;

revoke all on function public.admin_delete_user(uuid, text) from public, anon;
grant execute on function public.admin_delete_user(uuid, text) to authenticated, service_role;

revoke all on function public.admin_set_config(text, jsonb) from public, anon;
grant execute on function public.admin_set_config(text, jsonb) to authenticated, service_role;

revoke all on function public.admin_get_audit(int, int) from public, anon;
grant execute on function public.admin_get_audit(int, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  n int;
  fn text;
begin
  -- The two private tables are locked: RLS on, zero policies.
  for fn in select unnest(array['admin_users', 'admin_audit_log']) loop
    if not (select relrowsecurity from pg_class
             where oid = ('public.' || fn)::regclass) then
      raise exception '% has row level security switched off', fn;
    end if;
    select count(*) into n from pg_policies
     where schemaname = 'public' and tablename = fn;
    if n > 0 then
      raise exception '% carries % policy(ies); it must have none', fn, n;
    end if;
  end loop;

  -- site_config is world-readable and nothing else.
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'site_config';
  if n <> 1 then
    raise exception 'site_config should carry exactly the read policy, found %', n;
  end if;
  select count(*) into n from public.site_config where key = 'announcement';
  if n <> 1 then
    raise exception 'site_config seed row for announcement is missing';
  end if;

  -- Every admin function is SECURITY DEFINER, and anon can reach none of them.
  for fn in select unnest(array[
    'public.is_admin()',
    'public.admin_stats()',
    'public.admin_list_users(text,int,int)',
    'public.admin_get_user(uuid)',
    'public.admin_set_tier(uuid,text,int)',
    'public.admin_reset_quota(uuid)',
    'public.admin_delete_user(uuid,text)',
    'public.admin_set_config(text,jsonb)',
    'public.admin_get_audit(int,int)'
  ]) loop
    -- regprocedure, not regproc: only the former parses a signature with an
    -- argument list, and these strings carry one.
    if not (select prosecdef from pg_proc where oid = fn::regprocedure::oid) then
      raise exception '% is not SECURITY DEFINER', fn;
    end if;
    if has_function_privilege('anon', fn, 'execute') then
      raise exception 'anon can execute %', fn;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.admin_log(text,uuid,jsonb)', 'execute') then
    raise exception 'authenticated can execute admin_log; it must be internal only';
  end if;

  raise notice 'admin self-check passed';
end;
$$;
