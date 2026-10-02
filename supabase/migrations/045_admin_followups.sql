-- 045_admin_followups.sql
--
-- The database half of the admin and moderation follow-ups (T268, stage 9
-- group D2 of Execution/_OPEN-MASTER.md). Each section below closes one or two
-- register rows; the row id is in the section title.
--
-- WHAT CHANGES, IN ONE LIST.
--
--   1. admin_delete_user, admin_ban_user (T063-d). A session below aal2 is
--      still refused, but the refusal now RETURNS {error: 'mfa_required'}
--      and writes an 'mfa_refused' audit row, where 032 raised and the
--      rollback left no trace. Bodies are 032's otherwise.
--   2. admin_set_config (T065-c, T064-c). 034's body with 017's maintenance
--      shape check put back, and a transaction advisory lock on the key
--      before the previous-value read, so two admins creating the same new
--      key cannot both log previous.exists = false.
--   3. admin_list_config, admin_set_config_public (T066-b). An admin can now
--      read every site_config key, private ones included, and flip a key
--      public or private with an audited change. announcement, maintenance
--      and features cannot be made private: the app reads them signed out.
--   4. content_overrides (T074-d, T074-e, T076-b). The row gains a country
--      code, so an override opened from the review or orphan list can load
--      its pipeline item (photo and diff base). The old note column, which
--      043 kept only as a mirror of author_note, is dropped, and the writer
--      and reader stop mentioning it. admin_set_override gains p_country and
--      the same advisory lock as admin_set_config (T064-c).
--   5. Guide views (T067-a). public_guide_opened, which already fires on
--      every open of a public guide by someone other than its author, now
--      also counts one view per viewer per guide per UTC day. Viewers are
--      kept only as a salted hash that changes every day, and only for two
--      days; the running total lives in guide_view_counts.
--   6. admin_list_public_guides (T067-a, T067-b). Real views and
--      viewsCounted true, plus p_limit and p_offset. The zero-argument
--      version from 036 is dropped so a call with no arguments is not
--      ambiguous; with no arguments the new one returns the first 100.
--   7. export_user_data (T071-d, T074-d). Schema 2: the caller's own
--      edge_errors rows are in the file, and contentOverrides carries
--      authorNote, status, reviewBy and country instead of note. Still no
--      parameter, still auth.uid() only. 024 is not edited.
--   8. admin_get_audit (T077-c). Gates on admin_guard('read') like every
--      other callable admin function, instead of is_admin(), so it has the
--      same rate budget. Body otherwise 014's.
--
-- A CORRECTION TO 020's COMMENT (T069-g). 020 says trip_plans_guard_coplanner
-- runs "after 019's stamp trigger, alphabetically and by intent". Postgres
-- fires BEFORE ROW triggers of the same event in name order, and
-- "trip_plans_guard_coplanner" sorts before "trip_plans_stamp_published", so
-- the guard runs FIRST and the stamp second. That is the order 038 and 039
-- rely on: the guard lets an admin takedown move visibility to 'private',
-- and the stamp then clears published_at. 020 is not edited; this note is the
-- correction, and nothing in this file changes a trigger.
--
-- WHAT IT DOES NOT TOUCH. Nothing that 044 (T265, pasted later in stage 10)
-- creates or replaces: ai_usage_days, pass_can_buy, pass_grants' reason and
-- fee columns, oss_alerts, grant_pass, ai_refund, ai_consume, admin_margin,
-- admin_paywall_funnel, admin_oss_threshold. 044 in turn redefines nothing
-- defined here, so pasting 044 after this file undoes none of it.
--
-- ORDER. Paste in the Supabase SQL editor AFTER 042 in stage 2 of
-- _OPEN-MASTER (so after 035, 036, 039, 040 and 043, all of which it builds
-- on). Live project policy: never `db push` against ntssxktaduxzpsmejwyv;
-- paste this file by hand and look for the notice
-- "admin followups self-check passed". Pasting it twice is safe.
--
-- RE-PASTE TRAPS. Re-pasting any of these after this file undoes part of it;
-- paste 045 again afterwards:
--
--   014, 015, 016 or 032   delete and ban raise again on aal1 (014 also puts
--                          admin_get_audit back on is_admin; paste 035 too)
--   017, 033 or 034        admin_set_config loses the lock or the
--                          maintenance check
--   018, 033 or 034        an old admin_set_override overload comes back
--                          next to this one and calls become ambiguous
--   043                    fails at its first UPDATE, because note is gone;
--                          nothing it ran before that point changes anything
--   019                    public_guide_opened stops counting views
--   024                    export_user_data goes back to schema 1, which
--                          reads the dropped note column and fails on call
--   036                    fails its own self-check ("is not unique") but
--                          leaves the zero-argument admin_list_public_guides
--                          behind, and a call with no arguments is ambiguous
--
-- DOWN (paste in this order; the note column comes back refilled from
-- author_note, which is what 043 mirrored into it anyway):
--   alter table public.content_overrides add column if not exists note text
--     check (note is null or char_length(note) <= 500);
--   update public.content_overrides set note = author_note;
--   drop function if exists public.admin_set_override(text, text, jsonb, text, text, timestamptz, text);
--   alter table public.content_overrides drop column if exists country;
--   drop function if exists public.admin_list_public_guides(int, int);
--   drop function if exists public.admin_list_config();
--   drop function if exists public.admin_set_config_public(text, boolean);
--   drop table if exists public.guide_views, public.guide_view_counts, public.guide_view_salt;
--   -- then paste, in this order: 032 (delete and ban), 019's
--   -- public_guide_opened block and its grant, 036, 024, 014's
--   -- admin_get_audit block, 034's admin_set_config block, and 043 whole
--   -- (it re-creates the six-argument writer, the reader and the note mirror).
--   notify pgrst, 'reload schema';
-- Dropping the view tables loses every counted view. Dropping country loses
-- the codes written since the paste; the patches themselves stay.

-- ===========================================================================
-- 1. Delete and ban: a refused aal1 attempt leaves an audit row (T063-d)
-- ===========================================================================
-- WHY RETURN NOW. 032 raised, and a raise rolls the transaction back, so the
-- one attempt most worth recording (an admin token without its second
-- factor trying to erase or lock somebody out) left no row in our own trail.
-- Writing the row needs the transaction to commit, so the refusal is now a
-- return like every other refusal in the admin surface. The refusal itself
-- is exactly as strong: the check still sits after the guard and before
-- every read of the target, and a missing claim still counts as not aal2.
--
-- The client branches on the word: src/auth/admin.js turns {error} into an
-- Error with code 'mfa_required', and useErrText maps both that code and the
-- old 032 hint, so the page reads right before and after this paste.
--
-- The row: action 'mfa_refused', target_user the id that was asked for (no
-- read of auth.users is made to check it, so an aal1 session still learns
-- nothing about whether it exists), detail { fn, aal }. These rows count
-- towards the guard's overall budget of 60 a minute, which is the right
-- place for repeated attempts to end up.
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

-- ===========================================================================
-- 2. admin_set_config: 017's maintenance check back, and the key lock
--    (T065-c, T064-c)
-- ===========================================================================
-- The body is 034's (destructive tier, 033's previous/new detail) with two
-- additions and one repair. The maintenance branch is 017's, with the
-- missing-field hole closed (see the comment in the body). The advisory
-- lock closes the race 033 left: FOR UPDATE cannot lock a row that does not
-- exist yet, so two admins creating the same new key at once both read "no
-- row" and both logged previous.exists = false. The lock is taken on a hash
-- of the key before the read, so the second caller waits for the first to
-- commit and then reads its row. It is released at the end of the
-- transaction, like the row lock.
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
  --
  -- Every jsonb_typeof is wrapped in coalesce. In 015 and 017 a MISSING
  -- field gave jsonb_typeof NULL, NULL <> 'string' is NULL, the OR chain
  -- came out NULL, and IF treats NULL as false: {"enabled": true} with no
  -- message or text was accepted. A missing field now fails like a wrong one.
  if p_key = 'announcement' then
    if jsonb_typeof(p_value) <> 'object'
       or coalesce(jsonb_typeof(p_value -> 'enabled'), '') <> 'boolean'
       or coalesce(jsonb_typeof(p_value -> 'text'), '') <> 'string'
       or char_length(p_value ->> 'text') > 280
       or coalesce(p_value ->> 'tone', '') not in ('info', 'warn') then
      return jsonb_build_object('error', 'bad_value');
    end if;
  elsif p_key = 'maintenance' then
    -- 017's maintenance check (T065-c), lost in 033 and 034.
    if jsonb_typeof(p_value) <> 'object'
       or coalesce(jsonb_typeof(p_value -> 'enabled'), '') <> 'boolean'
       or coalesce(jsonb_typeof(p_value -> 'message'), '') <> 'string'
       or char_length(p_value ->> 'message') > 500 then
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

  -- Serialise writers of this key, including the first one, which has no
  -- row for FOR UPDATE to hold.
  perform pg_advisory_xact_lock(hashtextextended('site_config:' || p_key, 0));

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

revoke all on function public.admin_set_config(text, jsonb) from public, anon;
grant execute on function public.admin_set_config(text, jsonb) to authenticated, service_role;

-- ===========================================================================
-- 3. site_config visibility from the admin page (T066-b)
-- ===========================================================================
-- 035 split site_config into public and private keys, but the admin page
-- reads site_config through the client, so it sees public keys only and has
-- no way to flip the flag. These two functions are that way, behind the
-- guard. The Site tab control that calls them is T270's.
create or replace function public.admin_list_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err text := public.admin_guard('read');
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  return jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key',       c.key,
        'value',     c.value,
        'public',    c.public,
        -- The app reads these signed out; the flip refuses to hide them.
        'required',  c.key in ('announcement', 'maintenance', 'features'),
        'updatedAt', c.updated_at,
        'by',        p.handle
      ) order by c.key)
      from public.site_config c
      left join public.profiles p on p.user_id = c.updated_by
    ), '[]'::jsonb)
  );
end;
$$;

-- Destructive tier: making a key public is a live change for every visitor,
-- the same reasoning 034 gives for admin_set_config.
create or replace function public.admin_set_config_public(p_key text, p_public boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err  text := public.admin_guard('destructive');
  v_was  boolean;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  if p_key is null or p_key !~ '^[a-z0-9_]{1,64}$' then
    return jsonb_build_object('error', 'bad_key');
  end if;
  if p_public is null then
    return jsonb_build_object('error', 'bad_value');
  end if;

  -- Same lock as admin_set_config, so a value write and a visibility flip
  -- on one key never interleave.
  perform pg_advisory_xact_lock(hashtextextended('site_config:' || p_key, 0));

  select c.public into v_was
    from public.site_config c
   where c.key = p_key
     for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if not p_public and p_key in ('announcement', 'maintenance', 'features') then
    return jsonb_build_object('error', 'required_public');
  end if;
  if v_was = p_public then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  update public.site_config
     set public = p_public, updated_at = now(), updated_by = auth.uid()
   where key = p_key;

  perform public.admin_log('config_visibility', null,
    jsonb_build_object(
      'table',    'site_config',
      'key',      p_key,
      'previous', jsonb_build_object('exists', true, 'public', v_was),
      'new',      jsonb_build_object('exists', true, 'public', p_public)));

  return jsonb_build_object('ok', true, 'changed', true);
end;
$$;

revoke all on function public.admin_list_config() from public, anon;
grant execute on function public.admin_list_config() to authenticated, service_role;
revoke all on function public.admin_set_config_public(text, boolean) from public, anon;
grant execute on function public.admin_set_config_public(text, boolean) to authenticated, service_role;

-- ===========================================================================
-- 4. content_overrides: country on the row, note retired (T074-d, T074-e,
--    T076-b, T064-c)
-- ===========================================================================
-- country is the ISO code of the per-country wire file the item came from
-- (public/<layer>/<CC>.json). The grid knows it when an override is saved
-- from there; the review and orphan lists did not, so they could not load
-- the pipeline item, and the editor showed no original photo and the diff
-- viewer an empty before-column. Rows saved before this paste have no
-- country until their next save; the app falls back to the old behaviour
-- for them. The public cannot read it: the anon column grant from 043 stays
-- (layer, item_id, patch).
alter table public.content_overrides
  add column if not exists country text;
alter table public.content_overrides
  drop constraint if exists content_overrides_country_check;
alter table public.content_overrides
  add constraint content_overrides_country_check
  check (country is null or country ~ '^[A-Z]{2}$');

-- note: 043 copied every legacy note into author_note and has mirrored
-- author_note into note on every save since, so note holds nothing that
-- author_note does not. The only readers left were 024's export (replaced
-- below) and 043's writer and reader (replaced here).
alter table public.content_overrides drop column if exists note;

-- Every writer signature that ever existed, so none survives next to this
-- one and makes a PostgREST call ambiguous.
drop function if exists public.admin_set_override(text, text, jsonb, text);
drop function if exists public.admin_set_override(text, text, jsonb, text, text, timestamptz);

create or replace function public.admin_set_override(
  p_layer text,
  p_item text,
  p_patch jsonb,
  p_note text default null,
  p_status text default null,
  p_review_by timestamptz default null,
  p_country text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_err     text := public.admin_guard('destructive');
  v_bad     text;
  v_item    text := trim(coalesce(p_item, ''));
  v_given   text := nullif(trim(coalesce(p_note, '')), '');
  v_country text := nullif(upper(trim(coalesce(p_country, ''))), '');
  v_prev    jsonb;
  v_reason  text;
  v_patch   jsonb;
  v_status  text;
  v_review  timestamptz;
  v_cc      text;
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
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    return jsonb_build_object('error', 'bad_country');
  end if;

  v_bad := public.override_patch_problem(p_patch);
  if v_bad is not null then
    return jsonb_build_object('error', v_bad);
  end if;

  -- Serialise writers of this item before the read (T064-c).
  perform pg_advisory_xact_lock(
    hashtextextended('content_overrides:' || p_layer || ':' || v_item, 0));

  select jsonb_build_object(
           'exists',     true,
           'patch',      o.patch,
           'status',     o.status,
           'reviewBy',   o.review_by,
           'authorNote', o.author_note,
           'country',    o.country,
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

  if p_status is null or p_status not in ('verified', 'temporary', 'stale') then
    return jsonb_build_object('error', 'bad_status');
  end if;
  if p_review_by is null
     or p_review_by <= now()
     or p_review_by > now() + interval '366 days' then
    return jsonb_build_object('error', 'bad_review_by');
  end if;
  if v_reason = 'Made before review dates existed; no reason was recorded. Write the real one.' then
    v_reason := null;
  end if;
  v_reason := coalesce(v_given, v_reason);
  if v_reason is null or char_length(v_reason) < 10 or char_length(v_reason) > 500 then
    return jsonb_build_object('error', 'note_required');
  end if;

  -- A save without a country keeps the stored one, so an editor that does
  -- not know it (the review list for a legacy row) never erases it.
  insert into public.content_overrides as c
    (layer, item_id, patch, status, review_by, author_note, country, updated_at, updated_by)
  values (p_layer, v_item, p_patch, p_status, p_review_by, v_reason, v_country, now(), auth.uid())
  on conflict (layer, item_id) do update set
    patch       = excluded.patch,
    status      = excluded.status,
    review_by   = excluded.review_by,
    author_note = excluded.author_note,
    country     = coalesce(excluded.country, c.country),
    updated_at  = now(),
    updated_by  = auth.uid()
  returning c.patch, c.status, c.review_by, c.country
    into v_patch, v_status, v_review, v_cc;

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
                    'status',     v_status,
                    'reviewBy',   v_review,
                    'authorNote', v_reason,
                    'country',    v_cc)));

  return jsonb_build_object('ok', true);
end;
$fn$;

-- 043's reader, with country and without note.
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
        'status',     o.status,
        'reviewBy',   o.review_by,
        'authorNote', o.author_note,
        'country',    o.country,
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

revoke all on function public.admin_set_override(text, text, jsonb, text, text, timestamptz, text) from public, anon;
grant execute on function public.admin_set_override(text, text, jsonb, text, text, timestamptz, text) to authenticated, service_role;
revoke all on function public.admin_list_overrides(text) from public, anon;
grant execute on function public.admin_list_overrides(text) to authenticated, service_role;

-- 043's column grant, restated so a re-paste of 018 (which leaves the table
-- grant to the project default) is put right by pasting this file again.
revoke select on public.content_overrides from anon, authenticated;
grant select (layer, item_id, patch) on public.content_overrides to anon, authenticated;

-- ===========================================================================
-- 5. Guide views (T067-a)
-- ===========================================================================
-- WHAT COUNTS AS A VIEW. One open of a public guide, by anyone but its
-- author, counted once per viewer per guide per UTC day. Signed-in viewers
-- are told apart by their user id, signed-out ones by their address (the
-- same cf-connecting-ip first, x-forwarded-for second rule as 037's
-- report_guide, IPv6 by /64), and anything without either shares one
-- "unknown" bucket, which can only under-count.
--
-- WHAT IS STORED. guide_views holds (plan, day, hash) only for today and
-- yesterday, and the hash is sha256 of a private salt, the day and the
-- viewer key, so the same person hashes differently every day and a row
-- cannot be tied to a person once the day has passed and the row is pruned.
-- guide_view_counts holds one running total per guide and nothing about who.
-- Neither table has a policy or a client grant; only the definer functions
-- below read or write them.
create table if not exists public.guide_view_salt (
  id   int primary key default 1 check (id = 1),
  salt text not null
);
alter table public.guide_view_salt enable row level security;
revoke all on table public.guide_view_salt from public, anon, authenticated;
insert into public.guide_view_salt (id, salt)
values (1, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (id) do nothing;

create table if not exists public.guide_views (
  plan_id uuid not null references public.trip_plans(id) on delete cascade,
  day     date not null,
  viewer  text not null check (char_length(viewer) = 64),
  primary key (plan_id, day, viewer)
);
create index if not exists guide_views_day_idx on public.guide_views (day);
alter table public.guide_views enable row level security;
revoke all on table public.guide_views from public, anon, authenticated;

create table if not exists public.guide_view_counts (
  plan_id        uuid primary key references public.trip_plans(id) on delete cascade,
  views          bigint not null default 0 check (views >= 0),
  last_viewed_at timestamptz
);
alter table public.guide_view_counts enable row level security;
revoke all on table public.guide_view_counts from public, anon, authenticated;

-- 019's body (badge for the author, never for reading your own guide) plus
-- the counter. Fire and forget from the reader's screen, as before.
create or replace function public.public_guide_opened(wanted_plan uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner   uuid;
  v_uid     uuid := auth.uid();
  v_day     date := (now() at time zone 'utc')::date;
  v_headers jsonb;
  v_raw     text;
  v_addr    inet;
  v_key     text;
  v_salt    text;
  v_hash    text;
  n         int;
begin
  select tp.user_id into v_owner
    from public.trip_plans tp
   where tp.id = wanted_plan and tp.visibility = 'public';
  -- Reading your own guide is not an audience.
  if v_owner is null or v_owner = v_uid then
    return;
  end if;

  if v_uid is not null then
    v_key := 'u:' || v_uid::text;
  else
    begin
      v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    exception when others then
      v_headers := null;
    end;
    v_raw := nullif(trim(v_headers ->> 'cf-connecting-ip'), '');
    if v_raw is null then
      v_raw := nullif(trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '');
    end if;
    if v_raw is not null then
      begin
        v_addr := v_raw::inet;
        if family(v_addr) = 6 then
          v_key := 'ip:' || host(network(set_masklen(v_addr, 64))) || '/64';
        else
          v_key := 'ip:' || host(v_addr);
        end if;
      exception when others then
        v_key := 'raw:' || left(v_raw, 100);
      end;
    else
      v_key := 'unknown';
    end if;
  end if;

  select s.salt into v_salt from public.guide_view_salt s where s.id = 1;
  v_hash := encode(sha256(convert_to(
    coalesce(v_salt, '') || '|' || v_day::text || '|' || v_key, 'UTF8')), 'hex');

  insert into public.guide_views (plan_id, day, viewer)
  values (wanted_plan, v_day, v_hash)
  on conflict do nothing;
  get diagnostics n = row_count;
  if n = 1 then
    insert into public.guide_view_counts as g (plan_id, views, last_viewed_at)
    values (wanted_plan, 1, now())
    on conflict (plan_id) do update set
      views = g.views + 1, last_viewed_at = now();
  end if;

  -- Only today and yesterday are needed to deduplicate; the rest goes.
  delete from public.guide_views where day < v_day - 1;

  if to_regclass('public.user_achievements') is not null then
    execute 'select public.award_badge($1, $2)' using v_owner, 'local_guide';
  end if;
end;
$$;

revoke all on function public.public_guide_opened(uuid) from public;
grant execute on function public.public_guide_opened(uuid) to anon, authenticated;

-- ===========================================================================
-- 6. admin_list_public_guides: real views, and pages (T067-a, T067-b)
-- ===========================================================================
-- 036's body with views read from guide_view_counts, viewsCounted true, and
-- p_limit / p_offset like admin_list_users (default 100, at most 500). The
-- zero-argument version goes first: with both present, a call with no
-- arguments would be ambiguous.
drop function if exists public.admin_list_public_guides();

create or replace function public.admin_list_public_guides(
  p_limit  int default 100,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err    text := public.admin_guard('read');
  v_limit  int  := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_offset int  := greatest(coalesce(p_offset, 0), 0);
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  return jsonb_build_object(
    'total',        (select count(*) from public.trip_plans where visibility = 'public'),
    'limit',        v_limit,
    'offset',       v_offset,
    'viewsCounted', true,
    'rows',         coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',          tp.id,
        'label',       tp.label,
        'userId',      tp.user_id,
        'email',       u.email,
        'handle',      pr.handle,
        'displayName', pr.display_name,
        'avatarEmoji', pr.avatar_emoji,
        'inGallery',   pr.user_id is not null,
        'publishedAt', tp.published_at,
        'createdAt',   tp.created_at,
        'updatedAt',   tp.updated_at,
        'stops',       (select count(*) from public.trip_plan_stops st
                         where st.trip_plan_id = tp.id),
        'cities',      coalesce((select jsonb_agg(st.city order by st.position)
                                   from public.trip_plan_stops st
                                  where st.trip_plan_id = tp.id), '[]'::jsonb),
        'views',       coalesce(vc.views, 0)
      ) order by tp.published_at desc nulls last, tp.created_at desc, tp.id)
      from (select * from public.trip_plans
             where visibility = 'public'
             order by published_at desc nulls last, created_at desc, id
             limit v_limit offset v_offset) tp
      left join auth.users u               on u.id = tp.user_id
      left join public.profiles pr         on pr.user_id = tp.user_id
      left join public.guide_view_counts vc on vc.plan_id = tp.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_list_public_guides(int, int) from public, anon;
grant execute on function public.admin_list_public_guides(int, int) to authenticated, service_role;

-- ===========================================================================
-- 7. export_user_data, schema 2 (T071-d, T074-d)
-- ===========================================================================
-- 024's function and its header still hold: no parameter, auth.uid() only,
-- paywall_events read under its narrow exception. Two changes. edge_errors
-- rows (040) are the caller's personal data while the account exists, so
-- they are in the file. contentOverrides reads author_note, status,
-- review_by and country, since note is gone. schema goes to 2 because the
-- shape changed.
create or replace function public.export_user_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_signed_in');
  end if;

  return jsonb_build_object(
    'schema',     2,
    'exportedAt', now(),
    'userId',     v_uid,

    'tripPlans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',        p.id,
        'label',     p.label,
        'createdAt', p.created_at,
        'updatedAt', p.updated_at
      ) order by p.created_at)
      from public.trip_plans p
      where p.user_id = v_uid
    ), '[]'::jsonb),

    'tripPlanStops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',             s.id,
        'tripPlanId',     s.trip_plan_id,
        'position',       s.position,
        'destinationId',  s.destination_id,
        'city',           s.city,
        'country',        s.country,
        'arriveDate',     s.arrive_date,
        'departDate',     s.depart_date,
        'transportMode',  s.transport_mode,
        'transportNotes', s.transport_notes,
        'choices',        s.choices,
        'createdAt',      s.created_at
      ) order by s.trip_plan_id, s.position)
      from public.trip_plan_stops s
      where s.user_id = v_uid
    ), '[]'::jsonb),

    -- Own rows only. See 024's paywall exception before changing this.
    'paywallEvents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'at',     e.at,
        'event',  e.event,
        'reason', e.reason,
        'tier',   e.tier
      ) order by e.at)
      from public.paywall_events e
      where e.user_id = v_uid
    ), '[]'::jsonb),

    -- Empty for everyone who is not an admin, which is almost everyone.
    'contentOverrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'layer',      o.layer,
        'itemId',     o.item_id,
        'patch',      o.patch,
        'authorNote', o.author_note,
        'status',     o.status,
        'reviewBy',   o.review_by,
        'country',    o.country,
        'updatedAt',  o.updated_at
      ) order by o.updated_at)
      from public.content_overrides o
      where o.updated_by = v_uid
    ), '[]'::jsonb),

    -- The AI and booking-parse failures the caller ran into (040). Codes and
    -- statuses only; 040 never stores a prompt, a document or an address.
    'edgeErrors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'at',             x.at,
        'fn',             x.fn,
        'code',           x.code,
        'origin',         x.origin,
        'httpStatus',     x.http_status,
        'upstreamStatus', x.upstream_status
      ) order by x.at)
      from public.edge_errors x
      where x.user_id = v_uid
    ), '[]'::jsonb)
  );
end;
$fn$;

revoke all on function public.export_user_data() from public, anon;
grant execute on function public.export_user_data() to authenticated, service_role;

-- ===========================================================================
-- 8. admin_get_audit on the guard (T077-c)
-- ===========================================================================
-- 014's body; only the admission check changes, from is_admin() to
-- admin_guard('read'), so the last callable admin function without a rate
-- budget gets one and the whole surface uses one check.
create or replace function public.admin_get_audit(
  p_limit int default 50, p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err    text := public.admin_guard('read');
  v_limit  int  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int  := greatest(coalesce(p_offset, 0), 0);
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  return jsonb_build_object(
    'total', (select count(*) from public.admin_audit_log),
    'rows',  coalesce((select jsonb_agg(jsonb_build_object(
               'id',        l.id,
               'action',    l.action,
               'actor',     coalesce(ap.handle, l.actor::text),
               'target',    coalesce(tp.handle, tu.email, l.target_user::text),
               'detail',    l.detail,
               'createdAt', l.created_at) order by l.id desc)
              from (select * from public.admin_audit_log
                     order by id desc limit v_limit offset v_offset) l
              left join public.profiles ap on ap.user_id = l.actor
              left join public.profiles tp on tp.user_id = l.target_user
              left join auth.users tu on tu.id = l.target_user), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_get_audit(int, int) from public, anon;
grant execute on function public.admin_get_audit(int, int) to authenticated, service_role;

-- ===========================================================================
-- Self-check: runs on apply
-- ===========================================================================
do $chk$
declare
  fn   text;
  def  text;
  n    int;
  v    jsonb;
  k    text;
begin
  -- What this file builds on.
  if to_regclass('public.edge_errors') is null then
    raise exception 'public.edge_errors is missing; paste 040 first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'content_overrides'
                    and column_name = 'author_note') then
    raise exception 'content_overrides.author_note is missing; paste 043 first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'site_config'
                    and column_name = 'public') then
    raise exception 'site_config.public is missing; paste 035 first';
  end if;

  -- 1. Delete and ban refuse below aal2 by returning, and log the refusal.
  foreach fn in array array['public.admin_delete_user(uuid,text)', 'public.admin_ban_user(uuid,int)'] loop
    select prosrc into def from pg_proc where oid = fn::regprocedure::oid;
    if position('''aal2''' in def) = 0 or position('mfa_refused' in def) = 0
       or position('''mfa_required''' in def) = 0 then
      raise exception '% does not log and return the aal2 refusal', fn;
    end if;
    if position('raise exception' in def) > 0 then
      raise exception '% still raises; the refusal would leave no audit row', fn;
    end if;
    if position('admin_guard' in def) > position('''aal2''' in def)
       or position('''aal2''' in def) > position('own_account' in def) then
      raise exception '% checks aal2 in the wrong place', fn;
    end if;
  end loop;

  -- 2. admin_set_config: destructive, 033 detail, 017 maintenance, lock.
  def := pg_get_functiondef('public.admin_set_config(text,jsonb)'::regprocedure);
  if position('admin_guard(''destructive'')' in def) = 0
     or position('''previous''' in def) = 0
     or position('''maintenance''' in def) = 0
     or position('pg_advisory_xact_lock' in def) = 0 then
    raise exception 'admin_set_config lacks the destructive tier, the audit detail, the maintenance check or the key lock';
  end if;

  -- 3. Visibility RPCs exist with the right posture.
  foreach fn in array array['public.admin_list_config()', 'public.admin_set_config_public(text,boolean)',
                            'public.admin_list_public_guides(integer,integer)',
                            'public.admin_set_override(text,text,jsonb,text,text,timestamp with time zone,text)',
                            'public.admin_list_overrides(text)', 'public.admin_get_audit(integer,integer)'] loop
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
    if position('admin_guard(' in def) = 0 or position('is_admin()' in def) > 0 then
      raise exception '% does not gate on admin_guard alone', fn;
    end if;
  end loop;
  -- Applied as the owner, auth.uid() is null, so every guarded call refuses.
  if coalesce(public.admin_list_config() ->> 'error', '') <> 'forbidden'
     or coalesce(public.admin_set_config_public('features', false) ->> 'error', '') <> 'forbidden'
     or coalesce(public.admin_list_public_guides() ->> 'error', '') <> 'forbidden'
     or coalesce(public.admin_get_audit() ->> 'error', '') <> 'forbidden' then
    raise exception 'a guarded admin function answered a caller with no admin row';
  end if;
  foreach k in array array['announcement', 'maintenance', 'features'] loop
    if not exists (select 1 from public.site_config where key = k and public) then
      raise exception 'site_config key % is missing or not public; the app reads it', k;
    end if;
  end loop;

  -- 4. One writer; country column; note gone; public reads three columns.
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'admin_set_override';
  if n <> 1 then
    raise exception 'expected exactly one admin_set_override, found %; paste 045 again', n;
  end if;
  def := pg_get_functiondef('public.admin_set_override(text,text,jsonb,text,text,timestamp with time zone,text)'::regprocedure);
  if position('admin_guard(''destructive'')' in def) = 0
     or position('for update' in def) = 0
     or position('pg_advisory_xact_lock' in def) = 0 then
    raise exception 'admin_set_override lost the destructive tier, the row lock or the item lock';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'content_overrides'
                and column_name = 'note') then
    raise exception 'content_overrides.note still exists';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'content_overrides'
                    and column_name = 'country') then
    raise exception 'content_overrides.country is missing';
  end if;
  if not has_column_privilege('anon', 'public.content_overrides', 'patch', 'SELECT') then
    raise exception 'anon cannot read patch; the app would render no corrections';
  end if;
  if has_column_privilege('anon', 'public.content_overrides', 'author_note', 'SELECT')
     or has_column_privilege('anon', 'public.content_overrides', 'country', 'SELECT') then
    raise exception 'anon can read override columns beyond layer, item_id and patch';
  end if;

  -- 5. View tables are closed to clients; the open hook is still open.
  foreach fn in array array['public.guide_views', 'public.guide_view_counts', 'public.guide_view_salt'] loop
    if not (select relrowsecurity from pg_class where oid = fn::regclass) then
      raise exception '% has row level security off', fn;
    end if;
    if has_table_privilege('anon', fn, 'select') or has_table_privilege('authenticated', fn, 'select')
       or has_table_privilege('anon', fn, 'insert') or has_table_privilege('authenticated', fn, 'insert') then
      raise exception 'a client role can read or write %', fn;
    end if;
  end loop;
  if (select count(*) from public.guide_view_salt) <> 1 then
    raise exception 'guide_view_salt must hold exactly one row';
  end if;
  if not has_function_privilege('anon', 'public.public_guide_opened(uuid)', 'execute') then
    raise exception 'anon cannot call public_guide_opened; signed-out reads would not count';
  end if;

  -- 6. One public guides reader.
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'admin_list_public_guides';
  if n <> 1 then
    raise exception 'expected exactly one admin_list_public_guides, found %', n;
  end if;

  -- 7. export_user_data: one, argument-free, closed to anon, schema 2 with
  --    edgeErrors. Called once as a made-up signed-in user so the keys are
  --    proved, not read off the source.
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'export_user_data';
  if n <> 1 or exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                        where s.nspname = 'public' and p.proname = 'export_user_data' and p.pronargs <> 0) then
    raise exception 'export_user_data must be exactly one function taking no arguments';
  end if;
  if has_function_privilege('anon', 'public.export_user_data()', 'execute') then
    raise exception 'anon can execute export_user_data';
  end if;
  if coalesce(public.export_user_data() ->> 'error', '') <> 'not_signed_in' then
    raise exception 'export_user_data answered a caller with no auth.uid()';
  end if;
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000045c1","role":"authenticated"}', true);
  v := public.export_user_data();
  perform set_config('request.jwt.claims', '', true);
  if (v ->> 'schema') <> '2' or jsonb_typeof(v -> 'edgeErrors') <> 'array'
     or jsonb_typeof(v -> 'contentOverrides') <> 'array'
     or jsonb_typeof(v -> 'tripPlans') <> 'array' then
    raise exception 'export_user_data did not return schema 2 with edgeErrors: %', left(v::text, 200);
  end if;

  raise notice 'admin followups self-check passed';
end;
$chk$;

notify pgrst, 'reload schema';
