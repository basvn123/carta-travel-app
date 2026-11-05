-- 064_admin_action_reasons_down.sql
--
-- *** DOWN MIGRATION FOR 064, APPLIED BY THE OWNER ONLY TO ROLL BACK T1081. ***
-- Paste in the Supabase SQL editor. No data changes: the reasons already in
-- admin_audit_log stay there. The three functions go back to their
-- signatures without a reason: 045's admin_ban_user(uuid, int) and
-- admin_delete_user(uuid, text), 051's admin_set_tier(uuid, text, int). The
-- guard is 062's either way. Roll the app back with it (git revert of the
-- T1081 commit): the T1081 app sends p_reason, which the old functions do
-- not take, so ban, delete and set tier would answer PGRST202.

drop function if exists public.admin_ban_user(uuid, text, int);
drop function if exists public.admin_delete_user(uuid, text, text);
drop function if exists public.admin_set_tier(uuid, text, text, int);

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
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    perform public.admin_log('mfa_refused', p_user,
      jsonb_build_object('fn', 'delete_user', 'aal', auth.jwt() ->> 'aal'));
    return jsonb_build_object('error', 'mfa_required');
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
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    perform public.admin_log('mfa_refused', p_user,
      jsonb_build_object('fn', 'ban_user', 'aal', auth.jwt() ->> 'aal'));
    return jsonb_build_object('error', 'mfa_required');
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

revoke all on function public.admin_delete_user(uuid, text) from public, anon;
grant execute on function public.admin_delete_user(uuid, text) to authenticated, service_role;
revoke all on function public.admin_ban_user(uuid, int) from public, anon;
grant execute on function public.admin_ban_user(uuid, int) to authenticated, service_role;

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
  -- 051 (T063-e): below aal2 the pass is not changed, and the refusal
  -- leaves an audit row (as 045 does for delete and ban).
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    perform public.admin_log('mfa_refused', p_user,
      jsonb_build_object('fn', 'set_tier', 'aal', auth.jwt() ->> 'aal'));
    return jsonb_build_object('error', 'mfa_required');
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

revoke all on function public.admin_set_tier(uuid, text, int) from public, anon;
grant execute on function public.admin_set_tier(uuid, text, int) to authenticated, service_role;

do $$
begin
  if to_regprocedure('public.admin_ban_user(uuid, int)') is null
     or to_regprocedure('public.admin_delete_user(uuid, text)') is null
     or to_regprocedure('public.admin_set_tier(uuid, text, int)') is null
     or to_regprocedure('public.admin_ban_user(uuid, text, int)') is not null then
    raise exception '064 down did not restore the old signatures';
  end if;
  raise notice '064 rolled back: ban, delete and set tier take no reason again';
end;
$$;

notify pgrst, 'reload schema';
