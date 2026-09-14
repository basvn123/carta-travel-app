-- Editing the catalogue without a deploy, and without touching the pipeline.
--
-- THE PROBLEM. Beaches, lakes, mountains and trails are not in this database.
-- They are static per-country JSON, written by the Python pipeline and served
-- from public/. That is the right home for them: 1,700 beaches with scores and
-- photographs belong in a file the CDN can cache, not in rows nobody queries.
-- But it means there is no way to correct one bad photograph, rename one
-- mislabelled lake, or pull one embarrassing entry, short of a pipeline run
-- and a redeploy.
--
-- THE SHAPE. A thin overrides table the app merges over the wire data as it
-- loads it. The pipeline stays the source of truth; this holds only the
-- deliberate corrections a human made on top, keyed by the same id the wire
-- uses. Re-running the pipeline cannot lose them, because they were never in
-- it. Deleting an override restores whatever the pipeline says, which is what
-- makes every edit here reversible.
--
-- WHY IT IS WORLD READABLE. The app has to apply these for every visitor,
-- signed in or not, before it can draw a single card. Same posture as
-- site_config and plan_tiers: anyone may read, only a gated function writes.
-- Nothing personal is ever stored here, only catalogue corrections.
--
-- WHAT MAY BE PATCHED. A short whitelist, checked in the database rather than
-- trusted from the browser: a name, an image, a one-line blurb, and two flags
-- (hidden, featured). Anything else is refused. The client merge in
-- src/lib/overrides.js reads exactly these keys, so widening one means
-- touching both ends on purpose.
--
-- Apply in the Supabase SQL editor AFTER 017. Live project policy: never
-- `db push` against ntssxktaduxzpsmejwyv; paste this file there by hand.

create table if not exists public.content_overrides (
  -- Which wire layer the id belongs to. 'dest' is the destination catalogue
  -- in app_data.json, so the same mechanism covers it when that surface
  -- needs it.
  layer      text not null check (layer in ('beach', 'lake', 'mountain', 'trail', 'dest')),
  -- The wire's own id, as text. Trails use integers and everything else uses
  -- slugs; text holds both without a second column.
  item_id    text not null check (char_length(item_id) between 1 and 200),
  patch      jsonb not null default '{}'::jsonb,
  -- Free text for the person who made the change, never rendered to
  -- travellers. "photo showed the car park" is worth more in six months than
  -- the diff is.
  note       text check (note is null or char_length(note) <= 500),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (layer, item_id)
);

create index if not exists content_overrides_layer_idx
  on public.content_overrides (layer);

alter table public.content_overrides enable row level security;

drop policy if exists "content_overrides_read_all" on public.content_overrides;
create policy "content_overrides_read_all" on public.content_overrides
  for select using (true);
revoke insert, update, delete on public.content_overrides from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The whitelist
-- ---------------------------------------------------------------------------
-- Returns null when the patch is acceptable, otherwise the reason. Kept as its
-- own function so the rule has one home and the writer stays readable.
create or replace function public.override_patch_problem(p_patch jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  k text;
  v jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return 'bad_patch';
  end if;
  if pg_column_size(p_patch) > 4096 then
    return 'patch_too_big';
  end if;

  for k, v in select key, value from jsonb_each(p_patch) loop
    if k in ('name', 'blurb') then
      if jsonb_typeof(v) <> 'string' then return 'bad_' || k; end if;
      if char_length(p_patch ->> k) > (case when k = 'name' then 120 else 300 end) then
        return 'bad_' || k;
      end if;
    elsif k = 'image' then
      if jsonb_typeof(v) <> 'string' then return 'bad_image'; end if;
      -- https only, and a length a real URL fits inside. An http image would
      -- be blocked by the page's own content security policy anyway, so
      -- accepting one would only produce a picture that silently never loads.
      if (p_patch ->> 'image') !~ '^https://[^[:space:]]{5,600}$' then
        return 'bad_image';
      end if;
    elsif k in ('hidden', 'featured') then
      if jsonb_typeof(v) <> 'boolean' then return 'bad_' || k; end if;
    else
      return 'unknown_key';
    end if;
  end loop;

  return null;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Write one override
-- ---------------------------------------------------------------------------
-- An empty patch DELETES the row rather than storing nothing, so "undo my
-- edit" and "leave it alone" are the same gesture and the table never fills
-- with rows that say nothing.
create or replace function public.admin_set_override(
  p_layer text, p_item text, p_patch jsonb, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_err  text := public.admin_guard('read');
  v_bad  text;
  v_item text := trim(coalesce(p_item, ''));
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

  if p_patch = '{}'::jsonb then
    delete from public.content_overrides
     where layer = p_layer and item_id = v_item;
    perform public.admin_log('override_clear', null,
      jsonb_build_object('layer', p_layer, 'item', v_item));
    return jsonb_build_object('ok', true, 'cleared', true);
  end if;

  insert into public.content_overrides as c
    (layer, item_id, patch, note, updated_at, updated_by)
  values (p_layer, v_item, p_patch, nullif(trim(coalesce(p_note, '')), ''), now(), auth.uid())
  on conflict (layer, item_id) do update set
    patch = excluded.patch,
    note = coalesce(excluded.note, c.note),
    updated_at = now(),
    updated_by = auth.uid();

  perform public.admin_log('override_set', null,
    jsonb_build_object('layer', p_layer, 'item', v_item, 'patch', p_patch));

  return jsonb_build_object('ok', true);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Read them back, for the admin list
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_overrides(p_layer text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_err text := public.admin_guard('read');
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  return jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'layer',     o.layer,
        'itemId',    o.item_id,
        'patch',     o.patch,
        'note',      o.note,
        'updatedAt', o.updated_at,
        'by',        p.handle
      ) order by o.updated_at desc)
      from public.content_overrides o
      left join public.profiles p on p.user_id = o.updated_by
      where p_layer is null or o.layer = p_layer
    ), '[]'::jsonb),
    'counts', coalesce((
      select jsonb_object_agg(layer, n)
        from (select layer, count(*) as n from public.content_overrides group by layer) s
    ), '{}'::jsonb)
  );
end;
$fn$;

revoke all on function public.override_patch_problem(jsonb) from public, anon, authenticated;

revoke all on function public.admin_set_override(text, text, jsonb, text) from public, anon;
grant execute on function public.admin_set_override(text, text, jsonb, text) to authenticated, service_role;

revoke all on function public.admin_list_overrides(text) from public, anon;
grant execute on function public.admin_list_overrides(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $chk$
declare
  n int;
begin
  -- The whitelist actually refuses things.
  if public.override_patch_problem('{"name":"Ok"}'::jsonb) is not null then
    raise exception 'a legal patch was refused';
  end if;
  if public.override_patch_problem('{"image":"https://example.com/a.jpg"}'::jsonb) is not null then
    raise exception 'a legal https image was refused';
  end if;
  if public.override_patch_problem('{"image":"http://example.com/a.jpg"}'::jsonb) is null then
    raise exception 'an http image was accepted; the page CSP would block it';
  end if;
  if public.override_patch_problem('{"score":9}'::jsonb) is null then
    raise exception 'an unknown key was accepted';
  end if;
  if public.override_patch_problem('{"hidden":"yes"}'::jsonb) is null then
    raise exception 'a non-boolean flag was accepted';
  end if;

  -- The table is readable by the world and writable by nobody directly.
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'content_overrides';
  if n <> 1 then
    raise exception 'content_overrides should carry exactly the read policy, found %', n;
  end if;
  if has_table_privilege('anon', 'public.content_overrides', 'INSERT') then
    raise exception 'anon can write content_overrides';
  end if;
  if has_table_privilege('authenticated', 'public.content_overrides', 'UPDATE') then
    raise exception 'authenticated can write content_overrides';
  end if;
  if has_function_privilege('anon', 'public.admin_set_override(text,text,jsonb,text)', 'execute') then
    raise exception 'anon can execute admin_set_override';
  end if;

  raise notice 'content overrides self-check passed';
end;
$chk$;

notify pgrst, 'reload schema';
