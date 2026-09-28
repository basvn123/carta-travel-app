-- The audit log now holds enough to undo a live config or catalogue edit.
--
-- WHY. admin_set_config (015) and admin_set_override (018) change what every
-- visitor sees, with no deploy in between. Until now their audit rows held
-- only the NEW value: {key, value} for a config write, {layer, item, patch}
-- for an override. When a bad value went out, the trail said what it had
-- become but not what it had been, so there was nothing to go back to short
-- of a database backup. This file makes each row a before-and-after pair.
--
-- WHAT CHANGES. Both functions now read the current row (SELECT ... FOR
-- UPDATE, so a second admin cannot slip a write in between the read and the
-- upsert on an existing row) before they write, and the audit detail gains
-- three fields:
--
--   table     'site_config' or 'content_overrides', so the row names the
--             table it can restore without anyone decoding the action word.
--   previous  the row as it was. {"exists": false} when there was no row,
--             otherwise {"exists": true, ...the columns worth restoring}.
--   new       the row as it is now. {"exists": false} after an override
--             clear, otherwise {"exists": true, ...}.
--
-- The explicit "exists" marker is deliberate. A site_config value may itself
-- be the JSON literal null (unknown keys carry only the size cap), so a bare
-- null under "previous" could not tell "there was no row" from "the row held
-- null". The marker can.
--
-- Every field the rows carried before stays where it was: key and value for
-- set_config; layer, item and patch for override_set; layer and item for
-- override_clear. The admin Audit tab renders detail as one JSON string, and
-- anything reading detail.key or detail.value keeps working.
--
-- WHAT DOES NOT CHANGE. The guard tier (both stay on admin_guard('read');
-- raising them is a separate task), the key and value validation, the
-- upsert, the empty-patch-deletes rule, the note coalesce, the return shapes
-- ({ok: true}, {ok: true, cleared: true}, {error: word}) and the grants. Each
-- body below is its 015 or 018 original with the read added before the write
-- and the admin_log call widened. Nothing else moved.
--
-- HOW TO REVERT FROM ONE AUDIT ROW. In the SQL editor, with <id> the audit
-- row's id:
--
--   -- site_config (action set_config)
--   with d as (select detail from public.admin_audit_log where id = <id>)
--   insert into public.site_config (key, value, updated_at, updated_by)
--   select detail ->> 'key', detail -> 'previous' -> 'value',
--          (detail -> 'previous' ->> 'updatedAt')::timestamptz,
--          (detail -> 'previous' ->> 'updatedBy')::uuid
--     from d where (detail -> 'previous' ->> 'exists')::boolean
--   on conflict (key) do update set value = excluded.value,
--     updated_at = excluded.updated_at, updated_by = excluded.updated_by;
--   -- and when previous.exists is false, the key was new: delete it.
--   delete from public.site_config c using public.admin_audit_log l
--    where l.id = <id> and c.key = l.detail ->> 'key'
--      and not (l.detail -> 'previous' ->> 'exists')::boolean;
--
--   content_overrides (override_set or override_clear) works the same way on
--   (layer, item) with patch and note; see
--   continent-app/scripts/admin/test_admin_audit_rollback.mjs, which runs
--   exactly these statements. From the admin page, re-saving previous.value
--   (or previous.patch) through the RPC also works and is itself logged.
--
-- Apply in the Supabase SQL editor AFTER 032 (and after 015 and 018, whose
-- functions this replaces). Live project policy: never `db push` against
-- ntssxktaduxzpsmejwyv; paste this file there by hand. To undo, re-run the
-- admin_set_config definition from 015_admin_hardening.sql and the
-- admin_set_override definition from 018_content_overrides.sql. Rows written
-- while 033 was live keep their wider detail; nothing reads it strictly.

-- ---------------------------------------------------------------------------
-- site_config: validate (as 015), read the old row, write, log both
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_config(p_key text, p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err  text := public.admin_guard('read');
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
-- content_overrides: validate (as 018), read the old row, write, log both
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
  v_err   text := public.admin_guard('read');
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
-- Grants, restated. CREATE OR REPLACE keeps existing grants, so this changes
-- nothing on a project where 014, 015 and 018 ran; it is here so the file is
-- correct on its own.
-- ---------------------------------------------------------------------------
revoke all on function public.admin_set_config(text, jsonb) from public, anon;
grant execute on function public.admin_set_config(text, jsonb) to authenticated, service_role;

revoke all on function public.admin_set_override(text, text, jsonb, text) from public, anon;
grant execute on function public.admin_set_override(text, text, jsonb, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  fn  text;
  src text;
begin
  -- Both tables must be there; a missing content_overrides means 018 never
  -- landed, and admin_set_override would fail on every call.
  if to_regclass('public.site_config') is null then
    raise exception 'public.site_config is missing; apply 014 first';
  end if;
  if to_regclass('public.content_overrides') is null then
    raise exception 'public.content_overrides is missing; apply 018 first';
  end if;

  for fn in select unnest(array[
    'public.admin_set_config(text,jsonb)',
    'public.admin_set_override(text,text,jsonb,text)'
  ]) loop
    if not (select prosecdef from pg_proc where oid = fn::regprocedure::oid) then
      raise exception '% is not SECURITY DEFINER', fn;
    end if;
    if has_function_privilege('anon', fn, 'execute') then
      raise exception 'anon can execute %', fn;
    end if;
    select prosrc into src from pg_proc where oid = fn::regprocedure::oid;
    -- The guard tier is not this file's to change.
    if position('admin_guard(''read'')' in src) = 0 then
      raise exception '% no longer uses admin_guard(''read'')', fn;
    end if;
    if position('''previous''' in src) = 0 or position('''new''' in src) = 0
       or position('for update' in src) = 0 then
      raise exception '% does not record the previous and new state', fn;
    end if;
    -- The read must come before the write, or "previous" is the new value.
    if position('for update' in src) > position('insert into' in src) then
      raise exception '% reads the previous row after writing', fn;
    end if;
  end loop;

  raise notice 'admin audit rollback self-check passed';
end;
$$;

notify pgrst, 'reload schema';
