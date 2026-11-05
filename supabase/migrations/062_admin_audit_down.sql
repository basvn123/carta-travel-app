-- 062_admin_audit_down.sql
--
-- *** DOWN MIGRATION FOR 062, APPLIED BY THE OWNER ONLY TO ROLL BACK T1071. ***
-- Paste in the Supabase SQL editor. It puts back, copied unchanged:
-- admin_guard from 051 (aal2 only inside delete, ban and set tier again),
-- admin_set_infra_cost from 031 (no audit row again) and 061's storage read
-- policy for admins. One way: the target and reason columns are dropped, so
-- what they held is lost; actor, action, target_user, detail and created_at
-- keep everything they held before 062, and the reasons stay in detail.

-- admin_guard, 051's body.
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

-- admin_set_infra_cost, 031's body.
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

  -- Any day in the month names the month. Normalised here so a caller
  -- passing the 17th does not create a second, parallel ledger.
  v_month := date_trunc('month', coalesce(p_month, current_date))::date;

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

  return jsonb_build_object('ok', true, 'month', v_month, 'item', p_item,
                            'cents', p_cents, 'source', p_source);
end;
$$;

revoke all on function public.admin_set_infra_cost(date, text, int, text, text)
  from public, anon;
grant execute on function public.admin_set_infra_cost(date, text, int, text, text)
  to authenticated, service_role;

-- 061's admin read policy on the upload bucket.
drop policy if exists user_uploads_read_own_or_admin on storage.objects;
create policy user_uploads_read_own_or_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'user-uploads'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop trigger if exists audit_log_fill on public.admin_audit_log;
drop function if exists public.audit_log_fill();
drop function if exists public.audit_log_target(text, uuid, jsonb);
drop function if exists public.audit_log_reason(text, jsonb);
comment on table public.admin_audit_log is null;
alter table public.admin_audit_log drop column if exists target;
alter table public.admin_audit_log drop column if exists reason;

notify pgrst, 'reload schema';
