-- Admin hardening and the support toolkit.
--
-- Builds on 014. Four things get harder and four things get possible:
--
-- HARDER.
--   1. A rate gate. Every gated function now refuses an actor who has burned
--      through its budget: 60 logged actions a minute overall, 10 destructive
--      ones. An admin clicking around never notices; a script draining user
--      details through a hijacked admin session hits a wall after one page.
--   2. Forensics. The audit log now records the caller's IP and user agent,
--      read from the PostgREST request headers, so "who was holding this
--      session" has an answer beyond the account name.
--   3. site_config values are schema-checked per key. The announcement must
--      be {enabled bool, text <= 280 chars, tone info|warn}; feature flags
--      must be an object of plain booleans. A typo cannot publish garbage to
--      every visitor.
--   4. The client gained a re-auth lock in front of the spoke. That part is
--      decoration (this file cannot see it); the rate gate is the floor.
--
-- POSSIBLE.
--   5. Suspension: admin_ban_user sets auth.users.banned_until and revokes
--      refresh tokens, so sign-in stops without destroying anything, and
--      admin_unban_user lifts it. The support answer between "warn" and
--      "delete". An already-issued access token can outlive the ban by up to
--      its TTL (about an hour); that is a GoTrue property, not a choice here.
--   6. Support notes: admin_add_note writes a note into the audit trail, and
--      admin_get_user now returns the last 15 audit entries that touched the
--      account, so the next time this user emails, the history is right
--      there under their profile.
--   7. admin_mark records client-side support actions (today: sending a
--      password reset, which rides the public recover API and would
--      otherwise leave no trail). Its action list is a whitelist.
--   8. The user search also takes an exact user id, because support tickets
--      carry ids more often than emails.
--
-- Apply in the Supabase SQL editor AFTER 014. Live project policy: never
-- `db push` against ntssxktaduxzpsmejwyv; paste this file there by hand.

-- ---------------------------------------------------------------------------
-- Forensics columns
-- ---------------------------------------------------------------------------
alter table public.admin_audit_log add column if not exists ip    text;
alter table public.admin_audit_log add column if not exists agent text;

-- The writer, now reading the request headers PostgREST exposes. Wrapped in
-- an exception guard: a missing or malformed setting must never turn into a
-- refused admin action, because the log exists to serve the trail, not to
-- gate it.
create or replace function public.admin_log(
  p_action text, p_target uuid, p_detail jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip    text;
  v_agent text;
begin
  begin
    v_ip    := coalesce(
      current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for',
      current_setting('request.headers', true)::jsonb ->> 'cf-connecting-ip');
    v_agent := left(current_setting('request.headers', true)::jsonb ->> 'user-agent', 300);
  exception when others then
    v_ip := null; v_agent := null;
  end;
  insert into public.admin_audit_log (actor, action, target_user, detail, ip, agent)
  values (auth.uid(), p_action, p_target, p_detail, v_ip, v_agent);
end;
$$;

-- ---------------------------------------------------------------------------
-- The gate: membership plus a rate budget, in one call
-- ---------------------------------------------------------------------------
-- Returns null when the caller may proceed, otherwise the error word the
-- function should hand back. The budget is counted against the audit log
-- itself, which is exactly the set of actions worth slowing down: 60 logged
-- actions a minute in total, 10 destructive ones. Internal only, no grants.
create or replace function public.admin_guard(p_kind text default 'read')
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n int;
begin
  if not exists (select 1 from public.admin_users a where a.user_id = auth.uid()) then
    return 'forbidden';
  end if;

  select count(*) into n from public.admin_audit_log
   where actor = auth.uid() and created_at > now() - interval '60 seconds';
  if n >= 60 then
    return 'slow_down';
  end if;

  if p_kind = 'destructive' then
    select count(*) into n from public.admin_audit_log
     where actor = auth.uid()
       and created_at > now() - interval '60 seconds'
       and action in ('set_tier', 'reset_quota', 'delete_user', 'ban_user', 'unban_user');
    if n >= 10 then
      return 'slow_down';
    end if;
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- The user list: id search, suspension visible
-- ---------------------------------------------------------------------------
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
  v_err    text := public.admin_guard('read');
  v_limit  int  := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset int  := greatest(coalesce(p_offset, 0), 0);
  v_like   text;
  v_id     uuid;
  v_total  bigint;
  v_rows   jsonb;
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
        'tripPlans',   (select count(*) from public.trip_plans t where t.user_id = u.id),
        'dayPlans',    (select count(*) from public.day_plans d where d.user_id = u.id),
        'isAdmin',     exists (select 1 from public.admin_users a where a.user_id = u.id)
      ) as row_data
      from auth.users u
      left join public.profiles p on p.user_id = u.id
      left join public.entitlements e on e.user_id = u.id
     where v_like is null
        or u.id = v_id
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
-- One user, now with suspension state and their audit history
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_user(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err text := public.admin_guard('read');
  u  record;
  r  record;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  select au.id, au.email, au.created_at, au.last_sign_in_at,
         au.email_confirmed_at, au.banned_until,
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
    'bannedUntil', case when u.banned_until > now() then u.banned_until end,
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
                     where (f.requester_id = p_user or f.addressee_id = p_user)
                       and f.status = 'accepted'),
    'badges',      (select coalesce(jsonb_agg(a.badge order by a.earned_at), '[]'::jsonb)
                     from public.user_achievements a where a.user_id = p_user),
    'grants',      (select coalesce(jsonb_agg(jsonb_build_object(
                        'tier', g.tier, 'expiresAt', g.expires_at,
                        'grantedAt', g.granted_at)
                        order by g.granted_at desc), '[]'::jsonb)
                     from (select * from public.pass_grants
                            where user_id = p_user
                            order by granted_at desc limit 10) g),
    -- What has been done to and said about this account, latest first. The
    -- view_user noise is filtered out, or the history would mostly record
    -- itself being looked at.
    'history',     (select coalesce(jsonb_agg(jsonb_build_object(
                        'action', h.action,
                        'actor',  coalesce(ap.handle, h.actor::text),
                        'detail', h.detail,
                        'createdAt', h.created_at)
                        order by h.id desc), '[]'::jsonb)
                     from (select * from public.admin_audit_log
                            where target_user = p_user and action <> 'view_user'
                            order by id desc limit 15) h
                     left join public.profiles ap on ap.user_id = h.actor)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Existing mutations, re-based on the gate
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_tier(
  p_user uuid, p_tier text, p_days int default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err   text := public.admin_guard('destructive');
  cfg     public.plan_tiers%rowtype;
  v_days  int;
  v_until timestamptz;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
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

create or replace function public.admin_reset_quota(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err text := public.admin_guard('destructive');
  r record;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
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

create or replace function public.admin_delete_user(p_user uuid, p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err    text := public.admin_guard('destructive');
  v_email  text;
  v_handle text;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
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
-- Suspension
-- ---------------------------------------------------------------------------
-- The middle ground between a warning and a deletion: sign-in stops, nothing
-- is lost, and lifting it restores everything. Revoking the refresh tokens
-- means the ban bites at the next token refresh rather than in up to an hour.
create or replace function public.admin_ban_user(p_user uuid, p_days int default 36500)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err   text := public.admin_guard('destructive');
  v_until timestamptz;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  if p_user = auth.uid() then
    return jsonb_build_object('error', 'own_account');
  end if;
  if exists (select 1 from public.admin_users a where a.user_id = p_user) then
    return jsonb_build_object('error', 'target_is_admin');
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    return jsonb_build_object('error', 'not_found');
  end if;
  if p_days is null or p_days < 1 or p_days > 36600 then
    return jsonb_build_object('error', 'bad_days');
  end if;

  v_until := now() + make_interval(days => p_days);
  update auth.users set banned_until = v_until where id = p_user;

  -- Kill the sessions too, or the ban waits for the access token to expire.
  -- Guarded: the shape of auth.refresh_tokens is GoTrue's to change, and a
  -- ban that stands minus the revocation beats an error.
  begin
    update auth.refresh_tokens set revoked = true where user_id = p_user::text;
  exception when others then
    null;
  end;

  perform public.admin_log('ban_user', p_user,
    jsonb_build_object('days', p_days, 'until', v_until));

  return jsonb_build_object('ok', true, 'bannedUntil', v_until);
end;
$$;

create or replace function public.admin_unban_user(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err text := public.admin_guard('destructive');
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    return jsonb_build_object('error', 'not_found');
  end if;

  update auth.users set banned_until = null where id = p_user;
  perform public.admin_log('unban_user', p_user, null);

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Support notes, and marks for client-side support actions
-- ---------------------------------------------------------------------------
create or replace function public.admin_add_note(p_user uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err  text := public.admin_guard('read');
  v_note text := trim(coalesce(p_note, ''));
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_note = '' or length(v_note) > 1000 then
    return jsonb_build_object('error', 'bad_note');
  end if;

  perform public.admin_log('note', p_user, jsonb_build_object('text', v_note));
  return jsonb_build_object('ok', true);
end;
$$;

-- Actions the client performs through public APIs (today: the password reset
-- mail, which rides the ordinary recover endpoint) still belong in the trail.
-- The whitelist is the point: this must never become "write anything into
-- the log under any name".
create or replace function public.admin_mark(p_action text, p_target uuid)
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
  if p_action not in ('send_reset') then
    return jsonb_build_object('error', 'bad_action');
  end if;
  if not exists (select 1 from auth.users where id = p_target) then
    return jsonb_build_object('error', 'not_found');
  end if;

  perform public.admin_log(p_action, p_target, null);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- site_config, now schema-checked per key
-- ---------------------------------------------------------------------------
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

  -- Known keys carry a shape the app depends on; refuse anything else under
  -- their name. Unknown keys keep only the size cap, so a future surface can
  -- be wired without another migration.
  if p_key = 'announcement' then
    if jsonb_typeof(p_value) <> 'object'
       or jsonb_typeof(p_value -> 'enabled') <> 'boolean'
       or jsonb_typeof(p_value -> 'text') <> 'string'
       or char_length(p_value ->> 'text') > 280
       or coalesce(p_value ->> 'tone', '') not in ('info', 'warn') then
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
revoke all on function public.admin_guard(text) from public, anon, authenticated;

revoke all on function public.admin_ban_user(uuid, int) from public, anon;
grant execute on function public.admin_ban_user(uuid, int) to authenticated, service_role;

revoke all on function public.admin_unban_user(uuid) from public, anon;
grant execute on function public.admin_unban_user(uuid) to authenticated, service_role;

revoke all on function public.admin_add_note(uuid, text) from public, anon;
grant execute on function public.admin_add_note(uuid, text) to authenticated, service_role;

revoke all on function public.admin_mark(text, uuid) from public, anon;
grant execute on function public.admin_mark(text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  for fn in select unnest(array[
    'public.admin_guard(text)',
    'public.admin_ban_user(uuid,int)',
    'public.admin_unban_user(uuid)',
    'public.admin_add_note(uuid,text)',
    'public.admin_mark(text,uuid)'
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
  if has_function_privilege('authenticated', 'public.admin_guard(text)', 'execute') then
    raise exception 'authenticated can execute admin_guard; it must be internal only';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'admin_audit_log'
                    and column_name = 'ip') then
    raise exception 'the forensics columns never landed';
  end if;

  raise notice 'admin hardening self-check passed';
end;
$$;
