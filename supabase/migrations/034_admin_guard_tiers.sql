-- The three admin functions with a live effect now pass the destructive gate.
--
-- WHY. admin_set_config, admin_set_override and admin_set_feedback_status
-- change what the site does or shows the moment they return, with no deploy
-- in between: the site notice, maintenance mode and the feature flags
-- (site_config), the catalogue corrections laid over the static layers
-- (content_overrides), and the state of the feedback inbox. A capability
-- that changes production for every visitor at once is destructive in
-- effect whatever it is called, so it should sit behind the same gate as
-- admin_set_tier and admin_ban_user rather than the one a read sits behind.
--
-- WHAT CHANGES. ONLY the guard tier argument. Each function below is
-- re-created from its current body with admin_guard('read') replaced by
-- admin_guard('destructive'), and nothing else moved:
--
--   admin_set_config           the body from 033_admin_audit_rollback.sql
--   admin_set_override         the body from 033_admin_audit_rollback.sql
--   admin_set_feedback_status  the body from 017_admin_analytics.sql
--
-- The validation, the previous/new audit detail from 033, the return shapes,
-- the error words and the grants are as they were.
--
-- WHAT "DESTRUCTIVE" MEANS IN admin_guard (015). It is not a role. Every
-- admin passes both tiers the same way, and a non-admin gets 'forbidden'
-- from both. The tiers differ only in rate budget, counted against
-- admin_audit_log rows written by the same actor in the last 60 seconds:
--
--   'read'         refuse with 'slow_down' when the actor has 60 or more
--                  audit rows of any action in the window.
--   'destructive'  the same, AND refuse with 'slow_down' when the actor has
--                  10 or more rows whose action is one of set_tier,
--                  reset_quota, delete_user, ban_user, unban_user.
--
-- The error word is 'slow_down' (useErrText.js shows admin.errSlow). There is
-- no 'rate_limited' word anywhere in the schema.
--
-- WHAT A CALLER NOW HITS. The destructive count only counts those five
-- action names, and this file does not add the new ones to it (that would
-- change admin_guard, which is out of scope here). So:
--
--   An admin saving the Site tab, overrides or feedback states on their own
--   is NOT limited any harder than before: set_config, override_set,
--   override_clear and feedback_* rows are not in the destructive list, and
--   the overall cap of 60 a minute is what stops them, exactly as before.
--
--   An admin who has done 10 or more of set_tier, reset_quota, delete_user,
--   ban_user or unban_user in the last minute is now refused on all three
--   of these as well, where before this file they still succeeded until the
--   overall count reached 60.
--
-- T063's MFA rule is not part of admin_guard('destructive'): it is an
-- explicit auth.jwt() ->> 'aal' check written inside admin_delete_user and
-- admin_ban_user only. None of the three functions here gains an aal2 check;
-- whether they should is an owner decision (register row T063-e).
--
-- KNOWN, NOT FIXED HERE. 033 re-created admin_set_config from its 015 body,
-- but 017 had since added a shape check for the 'maintenance' key; that
-- check is absent from 033 and so from this file too. Restoring it is a
-- separate change (register row T065-c), kept out of here so this file
-- changes one thing.
--
-- ORDER. Apply in the Supabase SQL editor AFTER 033 (and so after 017 and
-- 018). Live project policy: never `db push` against ntssxktaduxzpsmejwyv;
-- paste this file there by hand and look for the notice "admin guard tiers
-- self-check passed". Re-running 033 after this file silently puts the two
-- 033 functions back on the read tier (033's own self-check asserts 'read'),
-- so if 033 is ever pasted again, paste 034 again after it.
--
-- TO UNDO. Paste the admin_set_config and admin_set_override definitions from
-- 033_admin_audit_rollback.sql and the admin_set_feedback_status definition
-- (only that function) from 017_admin_analytics.sql. Do not re-run 017 whole:
-- it would also put admin_set_config back to its 017 body and drop 033's
-- previous/new audit detail. This file changes no table and no row.

-- ---------------------------------------------------------------------------
-- site_config: the 033 body, destructive tier
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_config(p_key text, p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err  text := public.admin_guard('destructive');
  v_ok   boolean;
  v_prev jsonb;
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

  -- The row as it stands, locked until this transaction ends. No row gives
  -- NULL here, which the coalesce turns into the explicit marker.
  select jsonb_build_object(
           'exists',    true,
           'value',     c.value,
           'updatedAt', c.updated_at,
           'updatedBy', c.updated_by)
    into v_prev
    from public.site_config c
   where c.key = p_key
     for update;
  v_prev := coalesce(v_prev, jsonb_build_object('exists', false));

  insert into public.site_config as c (key, value, updated_at, updated_by)
  values (p_key, p_value, now(), auth.uid())
  on conflict (key) do update set
    value = excluded.value, updated_at = now(), updated_by = auth.uid();

  perform public.admin_log('set_config', null,
    jsonb_build_object(
      'table',    'site_config',
      'key',      p_key,
      'value',    p_value,
      'previous', v_prev,
      'new',      jsonb_build_object('exists', true, 'value', p_value)));

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- content_overrides: the 033 body, destructive tier
-- ---------------------------------------------------------------------------
-- An empty patch still DELETES the row, and the clear is logged with the row
-- it removed under "previous", so a clear is as reversible as a set.
create or replace function public.admin_set_override(
  p_layer text, p_item text, p_patch jsonb, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_err   text := public.admin_guard('destructive');
  v_bad   text;
  v_item  text := trim(coalesce(p_item, ''));
  v_prev  jsonb;
  v_patch jsonb;
  v_note  text;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  if p_layer not in ('beach', 'lake', 'mountain', 'trail', 'dest') then
    return jsonb_build_object('error', 'bad_layer');
  end if;
  if v_item = '' or char_length(v_item) > 200 then
    return jsonb_build_object('error', 'bad_item');
  end if;

  v_bad := public.override_patch_problem(p_patch);
  if v_bad is not null then
    return jsonb_build_object('error', v_bad);
  end if;

  -- The row as it stands, locked until this transaction ends. The note is
  -- kept because the upsert below preserves an old note when no new one is
  -- given, so a faithful revert has to put it back too.
  select jsonb_build_object(
           'exists',    true,
           'patch',     o.patch,
           'note',      o.note,
           'updatedAt', o.updated_at,
           'updatedBy', o.updated_by)
    into v_prev
    from public.content_overrides o
   where o.layer = p_layer and o.item_id = v_item
     for update;
  v_prev := coalesce(v_prev, jsonb_build_object('exists', false));

  if p_patch = '{}'::jsonb then
    delete from public.content_overrides
     where layer = p_layer and item_id = v_item;
    perform public.admin_log('override_clear', null,
      jsonb_build_object(
        'table',    'content_overrides',
        'layer',    p_layer,
        'item',     v_item,
        'previous', v_prev,
        'new',      jsonb_build_object('exists', false)));
    return jsonb_build_object('ok', true, 'cleared', true);
  end if;

  insert into public.content_overrides as c
    (layer, item_id, patch, note, updated_at, updated_by)
  values (p_layer, v_item, p_patch, nullif(trim(coalesce(p_note, '')), ''), now(), auth.uid())
  on conflict (layer, item_id) do update set
    patch = excluded.patch,
    note = coalesce(excluded.note, c.note),
    updated_at = now(),
    updated_by = auth.uid()
  returning c.patch, c.note into v_patch, v_note;

  perform public.admin_log('override_set', null,
    jsonb_build_object(
      'table',    'content_overrides',
      'layer',    p_layer,
      'item',     v_item,
      'patch',    p_patch,
      'previous', v_prev,
      'new',      jsonb_build_object('exists', true, 'patch', v_patch, 'note', v_note)));

  return jsonb_build_object('ok', true);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- feedback inbox: the 017 body, destructive tier
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_feedback_status(p_id bigint, p_status text)
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
-- Grants, restated. CREATE OR REPLACE keeps existing grants, so this changes
-- nothing on a project where 017, 018 and 033 ran; it is here so the file is
-- correct on its own.
-- ---------------------------------------------------------------------------
revoke all on function public.admin_set_config(text, jsonb) from public, anon;
grant execute on function public.admin_set_config(text, jsonb) to authenticated, service_role;

revoke all on function public.admin_set_override(text, text, jsonb, text) from public, anon;
grant execute on function public.admin_set_override(text, text, jsonb, text) to authenticated, service_role;

revoke all on function public.admin_set_feedback_status(bigint, text) from public, anon;
grant execute on function public.admin_set_feedback_status(bigint, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  fn  text;
  def text;
begin
  if to_regclass('public.site_config') is null then
    raise exception 'public.site_config is missing; apply 014 first';
  end if;
  if to_regclass('public.content_overrides') is null then
    raise exception 'public.content_overrides is missing; apply 018 first';
  end if;
  if to_regclass('public.feedback') is null then
    raise exception 'public.feedback is missing; apply 017 first';
  end if;

  for fn in select unnest(array[
    'public.admin_set_config(text,jsonb)',
    'public.admin_set_override(text,text,jsonb,text)',
    'public.admin_set_feedback_status(bigint,text)'
  ]) loop
    if not (select prosecdef from pg_proc where oid = fn::regprocedure::oid) then
      raise exception '% is not SECURITY DEFINER', fn;
    end if;
    if has_function_privilege('anon', fn, 'execute') then
      raise exception 'anon can execute %', fn;
    end if;
    if not has_function_privilege('authenticated', fn, 'execute') then
      raise exception 'authenticated cannot execute %; the admin page needs it', fn;
    end if;
    def := pg_get_functiondef(fn::regprocedure::oid);
    if position('admin_guard(''destructive'')' in def) = 0 then
      raise exception '% does not call admin_guard(''destructive'')', fn;
    end if;
    if position('admin_guard(''read'')' in def) > 0 then
      raise exception '% still calls admin_guard(''read'')', fn;
    end if;
  end loop;

  -- The two 033 bodies must still be the 033 bodies: a 015 or 018 body
  -- pasted by mistake would pass the tier check and lose the audit state.
  for fn in select unnest(array[
    'public.admin_set_config(text,jsonb)',
    'public.admin_set_override(text,text,jsonb,text)'
  ]) loop
    def := pg_get_functiondef(fn::regprocedure::oid);
    if position('''previous''' in def) = 0 or position('for update' in def) = 0 then
      raise exception '% lost the previous/new audit detail from 033', fn;
    end if;
  end loop;

  raise notice 'admin guard tiers self-check passed';
end;
$$;

notify pgrst, 'reload schema';
