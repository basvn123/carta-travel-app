-- 062_admin_audit.sql
--
-- *** SCHEMA MIGRATION, APPLIED BY THE OWNER (T1071, ROADMAP C3). ***
-- Paste in the Supabase SQL editor AFTER 061. Never `db push` against
-- ntssxktaduxzpsmejwyv. Pasting twice is safe. Look for "admin audit
-- self-check passed". The way back is 062_admin_audit_down.sql.
--
-- READ THIS BEFORE PASTING. From the moment this file runs, every admin
-- screen refuses a session that has not verified a second factor. Enrol a
-- TOTP factor on the owner account first (Dashboard step 7 in
-- Execution/P15/_OPEN-auth-settings.md, or the admin page's own "Set up an
-- authenticator app" box, which T1071 now shows before anything loads), or
-- the admin page shows only that box until you do. The SQL editor is not
-- affected: it runs as postgres, not through admin_guard.
--
-- WHAT CHANGES, three things (docs/security/threat-model.md, section 11 and
-- ranked gaps 3 and 11):
--
--   1. MFA for every admin RPC. admin_guard (015, last re-created by 051)
--      now answers 'mfa_required' to an admin whose token is not aal2, for
--      every tier: read, live and destructive. Until now only delete, ban and
--      set tier asked for aal2 (032, 045, 051), so a stolen aal1 admin token
--      could read every account's email, change the live site config and
--      decide moderation. The order is membership, then aal2, then the rate
--      budget: a non-admin still hears 'forbidden' and learns nothing about
--      MFA, and a missing aal claim counts as not aal2 (the check fails
--      closed). The guard is STABLE and cannot write, so a refusal here
--      leaves no audit row; the Supabase auth logs hold the request. The
--      explicit 'mfa_refused' rows 045 and 051 write inside delete, ban and
--      set tier are now reached only by a session that is aal2 already, so
--      they no longer fire; their checks are kept (defence in depth).
--      The storage read policy 061 gave admins (user_uploads_read_own_or_admin)
--      gets the same aal2 condition.
--
--   2. The audit table: who, action, target, reason, at. admin_audit_log
--      (014, 015) already holds who (actor), action, at (created_at), the
--      target account (target_user), detail (jsonb), ip and agent; it is the
--      admin_audit table the ROADMAP asks for, so it is extended rather than
--      duplicated. Two columns are added: target (text, what was acted on:
--      user:<id>, config:<key>, override:<layer>/<item>, plan:<id>,
--      report:<id>, statement:<id>, upload:<id>, feedback:<id>,
--      infra:<month>/<item>) and reason (text, the reason the admin gave).
--      A BEFORE INSERT trigger fills both from the detail every admin
--      function already writes, so no function body had to change for it,
--      and the existing rows are back-filled the same way.
--
--   3. Every admin RPC that changes something writes an audit row.
--      admin_set_infra_cost (031) was the one that did not; it does now,
--      with its note as the reason. Admin reads write no row, on purpose:
--      they are STABLE functions (a STABLE function cannot insert), and the
--      rate budget in admin_guard counts audit rows, so logging reads would
--      lock an admin out after 60 dashboard refreshes a minute. The two
--      reads that open one person's data (admin_get_user, admin_mark) were
--      already VOLATILE and already log a row.
--
-- WHAT THE APP DOES. src/admin/AdminPage.jsx shows the step-up box
-- (MfaStepUp) after the re-auth lock and before any admin RPC is called,
-- and useErrText already words 'mfa_required' (admin.errMfa).
--
-- TESTED BY .github/workflows/admin-rpc-security.yml
-- (continent-app/scripts/admin/test_admin_rpc_security.mjs, section 13):
-- every callable admin_* function answers mfa_required to an aal1 admin and
-- to a token with no aal claim; every VOLATILE one writes an audit row; the
-- trigger fills target and reason.

do $pre$
begin
  if to_regprocedure('public.admin_guard(text)') is null then
    raise exception 'admin_guard is missing; paste 015 and 051 first';
  end if;
  if to_regclass('public.user_uploads') is null then
    raise exception 'user_uploads is missing; paste 061 first';
  end if;
end;
$pre$;

-- ===========================================================================
-- 1. admin_guard: membership, then aal2, then 051's rate budget
-- ===========================================================================
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

  -- 062 (T1071): every admin RPC needs a verified second factor. A missing
  -- claim is not aal2: without the coalesce, NULL <> 'aal2' is NULL and the
  -- IF would let it through.
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    return 'mfa_required';
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

  if p_kind = 'live' then
    select count(*) into n from public.admin_audit_log
     where actor = auth.uid()
       and created_at > now() - interval '60 seconds'
       and action in ('set_config', 'config_visibility', 'override_set', 'override_clear',
                      'feedback_new', 'feedback_open', 'feedback_done');
    if n >= 20 then
      return 'slow_down';
    end if;
  end if;

  return null;
end;
$$;

revoke all on function public.admin_guard(text) from public, anon, authenticated;

-- The admin arm of 061's storage read policy needs aal2 too.
drop policy if exists user_uploads_read_own_or_admin on storage.objects;
create policy user_uploads_read_own_or_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'user-uploads'
    and ((storage.foldername(name))[1] = auth.uid()::text
         or (public.is_admin() and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'))
  );

-- ===========================================================================
-- 2. who, action, target, reason, at
-- ===========================================================================
alter table public.admin_audit_log
  add column if not exists target text check (target is null or char_length(target) <= 300),
  add column if not exists reason text check (reason is null or char_length(reason) <= 4000);

comment on table public.admin_audit_log is
  'The admin audit trail (014, 015, 062): who = actor, action, target (and target_user), reason, at = created_at. Append-only for every client role; written by admin_log and the admin functions only.';

-- What was acted on and why, read from the detail the functions already
-- write. Kept as one expression so the trigger and the back-fill agree.
create or replace function public.audit_log_target(p_action text, p_target_user uuid, p_detail jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(case
    when p_detail ? 'upload'      then 'upload:' || (p_detail ->> 'upload')
    when p_detail ? 'statementId' then 'statement:' || (p_detail ->> 'statementId')
    when p_detail ? 'reportId'    then 'report:' || (p_detail ->> 'reportId')
    when p_detail ? 'planId'      then 'plan:' || (p_detail ->> 'planId')
    when p_detail ->> 'table' = 'site_config'       then 'config:' || coalesce(p_detail ->> 'key', '')
    when p_detail ->> 'table' = 'content_overrides' then 'override:' || coalesce(p_detail ->> 'layer', '') || '/' || coalesce(p_detail ->> 'item', '')
    when p_action like 'feedback\_%' and p_detail ? 'id' then 'feedback:' || (p_detail ->> 'id')
    when p_action = 'set_infra_cost' then 'infra:' || coalesce(p_detail ->> 'month', '') || '/' || coalesce(p_detail ->> 'item', '')
    when p_target_user is not null then 'user:' || p_target_user::text
  end, 300);
$$;

create or replace function public.audit_log_reason(p_action text, p_detail jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(nullif(trim(coalesce(
    p_detail ->> 'reason',
    p_detail ->> 'note',
    case when p_action = 'note' then p_detail ->> 'text' end
  )), ''), 4000);
$$;

revoke all on function public.audit_log_target(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.audit_log_reason(text, jsonb) from public, anon, authenticated;

create or replace function public.audit_log_fill()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.target := coalesce(new.target, public.audit_log_target(new.action, new.target_user, new.detail));
  new.reason := coalesce(new.reason, public.audit_log_reason(new.action, new.detail));
  return new;
end;
$$;
revoke all on function public.audit_log_fill() from public, anon, authenticated;

drop trigger if exists audit_log_fill on public.admin_audit_log;
create trigger audit_log_fill
  before insert on public.admin_audit_log
  for each row execute function public.audit_log_fill();

-- The rows written before this file, filled the same way. Only empty cells.
update public.admin_audit_log l
   set target = coalesce(l.target, public.audit_log_target(l.action, l.target_user, l.detail)),
       reason = coalesce(l.reason, public.audit_log_reason(l.action, l.detail))
 where l.target is null or l.reason is null;

-- ===========================================================================
-- 3. admin_set_infra_cost writes its audit row (031's body plus one call)
-- ===========================================================================
create or replace function public.admin_set_infra_cost(
  p_month date,
  p_item  text,
  p_cents int,
  p_source text default 'actual',
  p_note  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err   text := public.admin_guard('write');
  v_month date;
  v_prev  jsonb;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  if p_item is null or p_item !~ '^[a-z0-9_]{1,40}$' then
    return jsonb_build_object('error', 'bad_item');
  end if;
  if p_cents is null or p_cents < 0 then
    return jsonb_build_object('error', 'bad_amount');
  end if;
  if p_source is null or p_source not in ('model', 'actual') then
    return jsonb_build_object('error', 'bad_source');
  end if;

  v_month := date_trunc('month', coalesce(p_month, current_date))::date;

  -- 062: the row as it stood, for the audit detail.
  select jsonb_build_object('cents', l.cents, 'source', l.source, 'note', l.note)
    into v_prev
    from public.infra_ledger l
   where l.month = v_month and l.item = p_item;

  insert into public.infra_ledger as l
    (month, item, cents, currency, source, note, updated_at, updated_by)
  values
    (v_month, p_item, p_cents, 'eur', p_source, nullif(p_note, ''), now(), auth.uid())
  on conflict (month, item) do update set
    cents      = excluded.cents,
    source     = excluded.source,
    note       = coalesce(excluded.note, l.note),
    updated_at = now(),
    updated_by = excluded.updated_by;

  -- 062 (T1071): the one state-changing admin RPC that wrote no audit row.
  perform public.admin_log('set_infra_cost', null, jsonb_build_object(
    'table', 'infra_ledger', 'month', v_month, 'item', p_item,
    'cents', p_cents, 'source', p_source, 'note', nullif(p_note, ''),
    'previous', v_prev));

  return jsonb_build_object('ok', true, 'month', v_month, 'item', p_item,
                            'cents', p_cents, 'source', p_source);
end;
$$;

revoke all on function public.admin_set_infra_cost(date, text, int, text, text) from public, anon;
grant execute on function public.admin_set_infra_cost(date, text, int, text, text) to authenticated, service_role;

-- ===========================================================================
-- 4. Self-check
-- ===========================================================================
do $$
declare
  def text := pg_get_functiondef('public.admin_guard(text)'::regprocedure);
  bad text;
begin
  if position('''aal2''' in def) = 0 or position('mfa_required' in def) = 0 then
    raise exception 'admin_guard does not require aal2';
  end if;
  if position('admin_users' in def) > position('''aal2''' in def)
     or position('''aal2''' in def) > position('slow_down' in def) then
    raise exception 'admin_guard checks aal2 in the wrong place (membership, then aal2, then the budget)';
  end if;
  -- Every state-changing admin RPC a client can call writes an audit row.
  select string_agg(p.proname, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'admin\_%'
     and p.provolatile = 'v'
     and p.proname not in ('admin_log')
     and has_function_privilege('authenticated', p.oid, 'execute')
     and p.prosrc !~ 'admin_log\(|admin_audit_log';
  if bad is not null then
    raise exception 'these admin functions change state without an audit row: %', bad;
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'admin_audit_log' and column_name = 'reason')
     or not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'admin_audit_log' and column_name = 'target') then
    raise exception 'admin_audit_log lacks target or reason';
  end if;
  if has_table_privilege('authenticated', 'public.admin_audit_log', 'insert')
     or has_table_privilege('authenticated', 'public.admin_audit_log', 'select') then
    raise exception 'admin_audit_log is reachable by a client role';
  end if;
  raise notice 'admin audit self-check passed';
end;
$$;

notify pgrst, 'reload schema';
