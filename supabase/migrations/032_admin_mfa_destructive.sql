-- The two irreversible admin actions now need a second factor.
--
-- WHY. Every admin function decides for itself who is calling (014), and
-- admin_guard (015) adds a rate budget on top. Both of those trust the
-- session. A stolen admin access token, lifted from a browser profile, a
-- synced password manager or a malicious extension, is a whole admin until it
-- expires, and two of the things an admin can do cannot be undone:
-- admin_delete_user erases an account and cascades through everything it
-- owns, and admin_ban_user locks a person out and revokes their sessions.
--
-- Supabase stamps every access token with an Authenticator Assurance Level in
-- the `aal` claim. A password or magic link sign-in gives 'aal1'. Only a
-- session that has also verified an enrolled MFA factor (TOTP) gives 'aal2'.
-- A stolen token cannot be upgraded to aal2 without the factor itself, so
-- checking the claim here is what turns "has the token" into "has the token
-- and the phone".
--
-- WHAT CHANGES. admin_delete_user and admin_ban_user read
-- auth.jwt() ->> 'aal' right after admin_guard('destructive') and raise when
-- it is not 'aal2'. Everything else in both functions is copied unchanged
-- from 015: the retype confirmation, the own-account and target-is-admin
-- refusals, the guard, the audit row, the refresh-token revoke.
--
-- ORDER. The guard runs first, so a caller who is not an admin still hears
-- "forbidden" and learns nothing about MFA. The MFA check runs before any
-- read of the target and before any write, so an aal1 session cannot even
-- probe whether a user id exists through the not_found answer.
--
-- WHY RAISE AND NOT RETURN. The other refusals return {error: word}. This one
-- raises, as the plan asks, because it is a property of the session, not of
-- the request: nothing the caller changes in the arguments will get past it.
-- The exception carries SQLSTATE 42501 (insufficient_privilege, which
-- PostgREST answers with HTTP 403) and the hint 'mfa_required'. The message
-- is the human sentence; the hint is the stable word a client should branch
-- on, because 42501 alone is shared with every ordinary permission error.
-- A raise rolls the transaction back, so a refused attempt leaves no audit
-- row. That is the price of raising; the Supabase auth logs still hold the
-- request.
--
-- A missing claim counts as not aal2. Without the coalesce, NULL <> 'aal2'
-- is NULL, IF treats NULL as false, and a token without the claim would walk
-- straight through. The check fails closed.
--
-- NOT COVERED. admin_set_tier, admin_reset_quota and admin_unban_user also
-- pass admin_guard('destructive') but are reversible, and stay on aal1.
--
-- OWNER STEP BEFORE THIS BITES. Once this is applied, delete and ban refuse
-- every session until the owner has enrolled a TOTP factor and the admin page
-- steps the session up to aal2 (supabase.auth.mfa.challengeAndVerify). Until
-- then the two buttons show "MFA required for this action".
--
-- Apply in the Supabase SQL editor AFTER 015 (and 016). Live project policy:
-- never `db push` against ntssxktaduxzpsmejwyv; paste this file there by
-- hand. To undo, re-run the admin_delete_user and admin_ban_user definitions
-- from 015_admin_hardening.sql.

-- ---------------------------------------------------------------------------
-- Delete: guard, then MFA, then everything 015 already did
-- ---------------------------------------------------------------------------
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
    raise exception 'MFA required for this action'
      using errcode = 'insufficient_privilege', hint = 'mfa_required';
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
-- Ban: guard, then MFA, then everything 015 already did
-- ---------------------------------------------------------------------------
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
    raise exception 'MFA required for this action'
      using errcode = 'insufficient_privilege', hint = 'mfa_required';
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

-- ---------------------------------------------------------------------------
-- Grants, restated. CREATE OR REPLACE keeps existing grants, so this changes
-- nothing on a project where 014 and 015 ran; it is here so the file is
-- correct on its own.
-- ---------------------------------------------------------------------------
revoke all on function public.admin_delete_user(uuid, text) from public, anon;
grant execute on function public.admin_delete_user(uuid, text) to authenticated, service_role;

revoke all on function public.admin_ban_user(uuid, int) from public, anon;
grant execute on function public.admin_ban_user(uuid, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  fn  text;
  src text;
begin
  -- auth.jwt() is Supabase's; if it is missing the check would raise
  -- undefined_function on every call and lock both actions for a different
  -- reason than the one intended.
  if to_regprocedure('auth.jwt()') is null then
    raise exception 'auth.jwt() does not exist; the aal check cannot run here';
  end if;

  for fn in select unnest(array[
    'public.admin_delete_user(uuid,text)',
    'public.admin_ban_user(uuid,int)'
  ]) loop
    if not (select prosecdef from pg_proc where oid = fn::regprocedure::oid) then
      raise exception '% is not SECURITY DEFINER', fn;
    end if;
    if has_function_privilege('anon', fn, 'execute') then
      raise exception 'anon can execute %', fn;
    end if;
    select prosrc into src from pg_proc where oid = fn::regprocedure::oid;
    if position('''aal2''' in src) = 0
       or position('MFA required for this action' in src) = 0 then
      raise exception '% does not carry the aal2 check', fn;
    end if;
    -- The MFA check must sit after the guard and before every other check,
    -- read and write, all of which start at the own_account refusal.
    if position('admin_guard' in src) > position('''aal2''' in src)
       or position('''aal2''' in src) > position('own_account' in src) then
      raise exception '% checks aal2 in the wrong place', fn;
    end if;
  end loop;

  raise notice 'admin MFA self-check passed';
end;
$$;
