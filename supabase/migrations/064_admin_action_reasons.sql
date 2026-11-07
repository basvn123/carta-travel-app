-- 064_admin_action_reasons.sql
--
-- *** SCHEMA MIGRATION, APPLIED BY THE OWNER (T1081, register row T1071-b). ***
-- Paste in the Supabase SQL editor AFTER 061, 062 and 063. Never `db push`
-- against ntssxktaduxzpsmejwyv. Pasting twice is safe. Look for "admin
-- action reasons self-check passed". The way back is
-- 064_admin_action_reasons_down.sql.
--
-- WHAT CHANGES. The three account actions that hurt most, suspending,
-- deleting and changing a pass, now take a required reason, and the reason
-- lands in admin_audit_log.reason. 062 added that column and a trigger that
-- fills it from detail ->> 'reason'; these three functions wrote no reason,
-- so their rows had none (T1071-b).
--
--   admin_ban_user(p_user, p_reason, p_days default 36500)
--   admin_delete_user(p_user, p_confirm, p_reason)
--   admin_set_tier(p_user, p_tier, p_reason, p_days default null)
--
-- The old signatures are DROPPED, not kept beside the new ones: a kept
-- two-argument ban would still accept a call with no reason. The bodies are
-- 045's (ban, delete) and 051's (set tier) with two changes each: a reason
-- of 3 to 500 characters after trimming, refused with {error:
-- 'reason_required'} right after the MFA check and before any read of the
-- target (so an empty reason learns nothing about the account), and
-- 'reason' in the audit detail. The guard, the MFA check, the refusals and
-- the order of the checks are otherwise unchanged. The grants are the same.
--
-- WHAT THE APP DOES. src/components/admin/UserDetail.jsx asks for a short
-- reason next to Apply, Suspend and Delete, and src/auth/admin.js sends it
-- as p_reason. ORDER: deploy the app and paste this file in one sitting.
-- Between the two, whichever comes first, these three actions answer
-- PGRST202 (no function with those arguments) and change nothing; every
-- other admin screen is unaffected. No fallback is kept in the app: the
-- contract gate checks every call against this catalogue, and a fallback
-- would be a call path without a reason.
--
-- TESTED BY .github/workflows/admin-rpc-security.yml
-- (continent-app/scripts/admin/test_admin_rpc_security.mjs, section 14):
-- each of the three refuses a missing or blank reason without touching the
-- account or writing a row, and on success the reason is in
-- admin_audit_log.reason.

do $pre$
begin
  if to_regprocedure('public.admin_guard(text)') is null then
    raise exception 'admin_guard is missing; paste 015, 051 and 062 first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'admin_audit_log' and column_name = 'reason') then
    raise exception 'admin_audit_log.reason is missing; paste 062 first';
  end if;
end;
$pre$;

drop function if exists public.admin_ban_user(uuid, int);
drop function if exists public.admin_delete_user(uuid, text);
drop function if exists public.admin_set_tier(uuid, text, int);

-- ===========================================================================
-- admin_ban_user: 045's body plus the reason
-- ===========================================================================
create or replace function public.admin_ban_user(p_user uuid, p_reason text, p_days int default 36500)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err    text := public.admin_guard('destructive');
  v_until  timestamptz;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    perform public.admin_log('mfa_refused', p_user,
      jsonb_build_object('fn', 'ban_user', 'aal', auth.jwt() ->> 'aal'));
    return jsonb_build_object('error', 'mfa_required');
  end if;
  -- 064 (T1081): no reason, no suspension.
  if char_length(v_reason) not between 3 and 500 then
    return jsonb_build_object('error', 'reason_required');
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
    jsonb_build_object('days', p_days, 'until', v_until, 'reason', v_reason));

  return jsonb_build_object('ok', true, 'bannedUntil', v_until);
end;
$$;

-- ===========================================================================
-- admin_delete_user: 045's body plus the reason
-- ===========================================================================
create or replace function public.admin_delete_user(p_user uuid, p_confirm text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err    text := public.admin_guard('destructive');
  v_email  text;
  v_handle text;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    perform public.admin_log('mfa_refused', p_user,
      jsonb_build_object('fn', 'delete_user', 'aal', auth.jwt() ->> 'aal'));
    return jsonb_build_object('error', 'mfa_required');
  end if;
  -- 064 (T1081): no reason, no deletion.
  if char_length(v_reason) not between 3 and 500 then
    return jsonb_build_object('error', 'reason_required');
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
    jsonb_build_object('email', v_email, 'handle', v_handle, 'reason', v_reason));

  delete from auth.users where id = p_user;

  return jsonb_build_object('ok', true);
end;
$$;

-- ===========================================================================
-- admin_set_tier: 051's body plus the reason
-- ===========================================================================
create or replace function public.admin_set_tier(
  p_user uuid, p_tier text, p_reason text, p_days int default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err    text := public.admin_guard('destructive');
  cfg      public.plan_tiers%rowtype;
  v_days   int;
  v_until  timestamptz;
  v_reason text := btrim(coalesce(p_reason, ''));
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
  -- 064 (T1081): no reason, no pass change.
  if char_length(v_reason) not between 3 and 500 then
    return jsonb_build_object('error', 'reason_required');
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
    perform public.admin_log('set_tier', p_user,
      jsonb_build_object('tier', 'free', 'reason', v_reason));
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
    jsonb_build_object('tier', p_tier, 'days', v_days, 'expiresAt', v_until, 'reason', v_reason));

  return jsonb_build_object('ok', true, 'tier', p_tier, 'expiresAt', v_until);
end;
$$;

revoke all on function public.admin_ban_user(uuid, text, int) from public, anon;
grant execute on function public.admin_ban_user(uuid, text, int) to authenticated, service_role;
revoke all on function public.admin_delete_user(uuid, text, text) from public, anon;
grant execute on function public.admin_delete_user(uuid, text, text) to authenticated, service_role;
revoke all on function public.admin_set_tier(uuid, text, text, int) from public, anon;
grant execute on function public.admin_set_tier(uuid, text, text, int) to authenticated, service_role;

-- ===========================================================================
-- Self-check
-- ===========================================================================
do $$
declare
  fn  text;
  def text;
begin
  -- Exactly one signature each, and it is the one with the reason.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('admin_ban_user', 'admin_delete_user', 'admin_set_tier')) <> 3 then
    raise exception 'an old admin_ban_user, admin_delete_user or admin_set_tier signature is still there';
  end if;
  foreach fn in array array['public.admin_ban_user(uuid, text, int)', 'public.admin_delete_user(uuid, text, text)',
                            'public.admin_set_tier(uuid, text, text, int)'] loop
    def := pg_get_functiondef(fn::regprocedure);
    if position('reason_required' in def) = 0 or position('''reason'', v_reason' in def) = 0 then
      raise exception '% does not require a reason or does not log it', fn;
    end if;
    if position('admin_guard(''destructive'')' in def) = 0 or position('''aal2''' in def) = 0 then
      raise exception '% lost its guard or its MFA check', fn;
    end if;
    if position('''aal2''' in def) > position('reason_required' in def) then
      raise exception '% checks the reason before MFA', fn;
    end if;
    if has_function_privilege('anon', fn, 'execute') or not has_function_privilege('authenticated', fn, 'execute') then
      raise exception '% has the wrong grants', fn;
    end if;
  end loop;
  raise notice 'admin action reasons self-check passed';
end;
$$;

notify pgrst, 'reload schema';
