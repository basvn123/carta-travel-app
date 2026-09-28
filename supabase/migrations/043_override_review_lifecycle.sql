-- 043_override_review_lifecycle.sql
--
-- Every catalogue override carries a reason, a status and a review date.
--
-- WHY. content_overrides (018) lets an admin patch a beach, lake, mountain or
-- trail over the pipeline's wire data without a deploy. Most of those patches
-- exist because the pipeline got something wrong: a photo of a car park, a
-- mislabelled lake. The patch fixes the symptom for travellers, and then
-- nothing reminds anyone that the pipeline still has the bug. A year later
-- the table is a pile of silent corrections nobody can explain. This file
-- makes each patch say why it exists and when somebody must look at it again.
--
-- WHAT IT ADDS to public.content_overrides.
--
--   status       'verified'   the patch is a deliberate, checked correction
--                             the pipeline cannot be expected to know (a
--                             better photograph chosen by a person).
--                'temporary'  the patch covers a pipeline bug and should go
--                             once the pipeline is fixed.
--                'stale'      somebody has decided the patch no longer holds
--                             (the pipeline was fixed, the place changed) and
--                             it is waiting to be reverted.
--   review_by    the date by which a person must look at the patch again. A
--                patch past it is OVERDUE, whatever its status. Overdue is
--                derived (review_by < now()), never stored, so it can never
--                drift from the clock.
--   author_note  why the patch exists, in the admin's words. Required.
--
-- All three are NOT NULL. Rows that already exist are backfilled as
-- 'temporary', due in 14 days, with the old note as their reason (or a fixed
-- sentence saying none was recorded), so every legacy patch surfaces for
-- review within two weeks instead of all turning overdue on the day this is
-- pasted.
--
-- THE OLD note COLUMN. 018 already had a free-text note. author_note replaces
-- it as the field the admin page reads and writes. The writer below still
-- mirrors the same text into note, because 024's export_user_data and the
-- 033/034 audit detail read note; dropping it is a later, separate change.
--
-- THE WRITER. admin_set_override gains two parameters, p_status and
-- p_review_by. The old four-argument signature is DROPPED first: PostgREST
-- resolves an RPC by its argument names, and two overloads that both accept
-- (p_layer, p_item, p_patch, p_note) would make every call ambiguous. The
-- body is 034's (destructive guard, previous/new audit detail, row lock),
-- with these rules added for a non-empty patch:
--
--   p_status     must be verified, temporary or stale      else bad_status
--   p_review_by  must be after now() and at most 366 days   else bad_review_by
--                ahead, so every patch comes back at least once a year
--   p_note       trimmed; when empty the stored author_note  else note_required
--                is kept; the result must be 10 to 500
--                characters, and the backfill sentence below
--                does not count as a reason
--
-- An empty patch still deletes the row, as before, and needs none of them.
--
-- THE READER. admin_list_overrides returns status, reviewBy, authorNote and
-- overdue per row, sorts the most urgent first (review_by ascending), and
-- adds overdue and stale counts next to the per-layer counts.
--
-- WHO CAN READ WHAT. 018 made the table world readable because every visitor
-- needs the patches. That also exposed note, and would expose author_note,
-- which is internal reasoning ("the pipeline's image ranker picks car
-- parks"), to anyone with the anon key. The table-wide SELECT is revoked from
-- anon and authenticated and granted back on (layer, item_id, patch) only,
-- the three columns src/lib/overrides.js reads. The read policy is unchanged.
-- The admin page reads through admin_list_overrides, which is SECURITY
-- DEFINER, so it still sees every column.
--
-- ORDER AND HAZARDS. Apply in the Supabase SQL editor AFTER 034 (and so after
-- 018 and 033). Live project policy: never `db push` against
-- ntssxktaduxzpsmejwyv; paste this file there by hand and look for the notice
-- "override review lifecycle self-check passed". Pasting it twice is safe.
-- Re-pasting 018, 033 or 034 AFTER this file re-creates the four-argument
-- admin_set_override next to this one. A four-argument call is then
-- ambiguous, and the old body, which writes no status, would fail on the NOT
-- NULL columns anyway. If that ever happens, paste 043 again, which drops the
-- four-argument version (the admin page always sends all six arguments).
--
-- The admin page shipped with this task sends p_status and p_review_by. An
-- admin page from before this task sends only four arguments and gets
-- bad_status from this function, so deploy the app with or after the paste.
-- Before the paste, the new page's calls fail with "could not find the
-- function" on save; the traveller side is unaffected either way.
--
-- DOWN (paste in this order):
--   drop function if exists public.admin_set_override(text, text, jsonb, text, text, timestamptz);
--   -- paste the admin_set_override block and its two grant lines from 034
--   -- paste the admin_list_overrides block from 018
--   grant select on public.content_overrides to anon, authenticated;
--   alter table public.content_overrides
--     drop column if exists status,
--     drop column if exists review_by,
--     drop column if exists author_note;
--   notify pgrst, 'reload schema';
-- Dropping the columns loses the reasons and dates written since the paste;
-- the patches themselves and the old note column are untouched.

-- ---------------------------------------------------------------------------
-- The columns
-- ---------------------------------------------------------------------------
alter table public.content_overrides
  add column if not exists status      text,
  add column if not exists review_by   timestamptz,
  add column if not exists author_note text;

update public.content_overrides
   set status = 'temporary'
 where status is null;

update public.content_overrides
   set review_by = now() + interval '14 days'
 where review_by is null;

update public.content_overrides
   set author_note = coalesce(
         nullif(trim(coalesce(note, '')), ''),
         'Made before review dates existed; no reason was recorded. Write the real one.')
 where author_note is null;

alter table public.content_overrides
  alter column status      set not null,
  alter column review_by   set not null,
  alter column author_note set not null;

alter table public.content_overrides
  drop constraint if exists content_overrides_status_check;
alter table public.content_overrides
  add constraint content_overrides_status_check
  check (status in ('verified', 'temporary', 'stale'));

alter table public.content_overrides
  drop constraint if exists content_overrides_author_note_check;
alter table public.content_overrides
  add constraint content_overrides_author_note_check
  check (char_length(author_note) between 1 and 500);

-- The admin list sorts by it, and "what is due" is the question it answers.
create index if not exists content_overrides_review_by_idx
  on public.content_overrides (review_by);

-- ---------------------------------------------------------------------------
-- Column-level read access for the public
-- ---------------------------------------------------------------------------
revoke select on public.content_overrides from anon, authenticated;
grant select (layer, item_id, patch) on public.content_overrides to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The writer: 034's body, plus status, review date and a required reason
-- ---------------------------------------------------------------------------
drop function if exists public.admin_set_override(text, text, jsonb, text);

create or replace function public.admin_set_override(
  p_layer text,
  p_item text,
  p_patch jsonb,
  p_note text default null,
  p_status text default null,
  p_review_by timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_err    text := public.admin_guard('destructive');
  v_bad    text;
  v_item   text := trim(coalesce(p_item, ''));
  v_given  text := nullif(trim(coalesce(p_note, '')), '');
  v_prev   jsonb;
  v_reason text;
  v_patch  jsonb;
  v_note   text;
  v_status text;
  v_review timestamptz;
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

  -- The row as it stands, locked until this transaction ends. Status, review
  -- date and reason are kept alongside the patch so a revert from the audit
  -- trail can put all of them back.
  select jsonb_build_object(
           'exists',     true,
           'patch',      o.patch,
           'note',       o.note,
           'status',     o.status,
           'reviewBy',   o.review_by,
           'authorNote', o.author_note,
           'updatedAt',  o.updated_at,
           'updatedBy',  o.updated_by),
         o.author_note
    into v_prev, v_reason
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

  -- The lifecycle rules. Checked after the patch so a bad patch still gets
  -- its own, more specific word.
  if p_status is null or p_status not in ('verified', 'temporary', 'stale') then
    return jsonb_build_object('error', 'bad_status');
  end if;
  if p_review_by is null
     or p_review_by <= now()
     or p_review_by > now() + interval '366 days' then
    return jsonb_build_object('error', 'bad_review_by');
  end if;
  -- The backfill sentence is a placeholder, not a reason: the first save
  -- of a legacy row has to write a real one.
  if v_reason = 'Made before review dates existed; no reason was recorded. Write the real one.' then
    v_reason := null;
  end if;
  v_reason := coalesce(v_given, v_reason);
  if v_reason is null or char_length(v_reason) < 10 or char_length(v_reason) > 500 then
    return jsonb_build_object('error', 'note_required');
  end if;

  insert into public.content_overrides as c
    (layer, item_id, patch, note, status, review_by, author_note, updated_at, updated_by)
  values (p_layer, v_item, p_patch, v_reason, p_status, p_review_by, v_reason, now(), auth.uid())
  on conflict (layer, item_id) do update set
    patch       = excluded.patch,
    note        = excluded.note,
    status      = excluded.status,
    review_by   = excluded.review_by,
    author_note = excluded.author_note,
    updated_at  = now(),
    updated_by  = auth.uid()
  returning c.patch, c.note, c.status, c.review_by
    into v_patch, v_note, v_status, v_review;

  perform public.admin_log('override_set', null,
    jsonb_build_object(
      'table',    'content_overrides',
      'layer',    p_layer,
      'item',     v_item,
      'patch',    p_patch,
      'previous', v_prev,
      'new',      jsonb_build_object(
                    'exists',     true,
                    'patch',      v_patch,
                    'note',       v_note,
                    'status',     v_status,
                    'reviewBy',   v_review,
                    'authorNote', v_note)));

  return jsonb_build_object('ok', true);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- The reader: most urgent first, with the lifecycle on every row
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
        'layer',      o.layer,
        'itemId',     o.item_id,
        'patch',      o.patch,
        'note',       o.note,
        'status',     o.status,
        'reviewBy',   o.review_by,
        'authorNote', o.author_note,
        'overdue',    o.review_by < now(),
        'updatedAt',  o.updated_at,
        'by',         p.handle
      ) order by o.review_by asc, o.updated_at desc)
      from public.content_overrides o
      left join public.profiles p on p.user_id = o.updated_by
      where p_layer is null or o.layer = p_layer
    ), '[]'::jsonb),
    'counts', coalesce((
      select jsonb_object_agg(layer, n)
        from (select layer, count(*) as n from public.content_overrides group by layer) s
    ), '{}'::jsonb),
    'overdue', (select count(*) from public.content_overrides where review_by < now()),
    'stale',   (select count(*) from public.content_overrides where status = 'stale')
  );
end;
$fn$;

revoke all on function public.admin_set_override(text, text, jsonb, text, text, timestamptz) from public, anon;
grant execute on function public.admin_set_override(text, text, jsonb, text, text, timestamptz) to authenticated, service_role;

revoke all on function public.admin_list_overrides(text) from public, anon;
grant execute on function public.admin_list_overrides(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $chk$
declare
  fn  text := 'public.admin_set_override(text,text,jsonb,text,text,timestamptz)';
  def text;
  n   int;
begin
  -- Every row carries the lifecycle, and the columns cannot be emptied.
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'content_overrides'
     and column_name in ('status', 'review_by', 'author_note')
     and is_nullable = 'NO';
  if n <> 3 then
    raise exception 'status, review_by and author_note should be three NOT NULL columns, found %', n;
  end if;

  -- One writer, not two: the four-argument overload would make PostgREST
  -- calls ambiguous.
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'admin_set_override';
  if n <> 1 then
    raise exception 'expected exactly one admin_set_override, found %; paste 043 again', n;
  end if;

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
    raise exception '% lost the destructive guard from 034', fn;
  end if;
  if position('''previous''' in def) = 0 or position('for update' in def) = 0 then
    raise exception '% lost the previous/new audit detail from 033', fn;
  end if;

  -- The public reads the patch and nothing about why it exists.
  if not has_column_privilege('anon', 'public.content_overrides', 'patch', 'SELECT') then
    raise exception 'anon cannot read patch; the app would render no corrections';
  end if;
  if has_column_privilege('anon', 'public.content_overrides', 'author_note', 'SELECT')
     or has_column_privilege('anon', 'public.content_overrides', 'note', 'SELECT')
     or has_column_privilege('authenticated', 'public.content_overrides', 'author_note', 'SELECT') then
    raise exception 'the admin reasons are readable by the public';
  end if;
  if has_table_privilege('anon', 'public.content_overrides', 'INSERT')
     or has_table_privilege('authenticated', 'public.content_overrides', 'UPDATE') then
    raise exception 'content_overrides is writable outside admin_set_override';
  end if;

  raise notice 'override review lifecycle self-check passed';
end;
$chk$;

notify pgrst, 'reload schema';
