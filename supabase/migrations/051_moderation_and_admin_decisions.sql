-- 051_moderation_and_admin_decisions.sql
--
-- The owner's moderation and admin decisions of 2026-10-07 (block A3 of
-- Execution/_OWNER-RUNBOOK.md), turned into the database. Written by T365
-- for register row T362-d. Each section below closes one or two rows; the
-- row id is in the section title.
--
-- WHAT CHANGES, IN ONE LIST.
--
--   1. admin_guard gains a third tier, 'live' (T065-b). It refuses with
--      slow_down once the caller has 20 logged config, override or feedback
--      saves in the last 60 seconds, counted on their own list, so a busy
--      config day cannot block a ban and ten bans cannot block a notice
--      edit. The overall 60 a minute still applies. 'destructive' keeps its
--      five names and its cap of 10, exactly as 015 wrote them.
--   2. admin_set_config, admin_set_config_public, admin_set_override and
--      admin_set_feedback_status move from admin_guard('destructive') to
--      admin_guard('live'). Each is re-created from its current body (045,
--      045, 047 and 034) with that one string changed and nothing else.
--   3. admin_set_tier needs aal2 (T063-e), the way 045 does it for delete
--      and ban: below aal2 it RETURNS {error: 'mfa_required'} and writes one
--      'mfa_refused' audit row. reset_quota and unban stay on aal1, as the
--      owner decided. Body otherwise 015's.
--   4. An overdue temporary override stops applying to travellers 14 days
--      after its review date (T074-c). The public read policy on
--      content_overrides now admits a row only while it is not temporary,
--      or its review date plus 14 days is still ahead. The admin reads
--      through admin_list_overrides (a definer function), so the Content
--      tab still sees every row. Verified and stale rows keep applying.
--   5. Missing profiles are repaired once, and a plan cannot be made public
--      from an account without a profile (T067-d). The repair is 010's own
--      backfill loop. The refusal is a trigger on trip_plans that raises
--      with the hint profile_required.
--   6. A taken-down guide is locked (T069-c). The same trigger refuses to
--      make a plan public while any statement of reasons about it stands,
--      that is while its complaint status is none, open or upheld, and
--      raises with the hint moderation_locked. A complaint decided as
--      reversed lifts the lock: admin_decide_complaint (039) republishes
--      under its marker when the guide is unchanged, and otherwise the owner
--      may publish it again themselves.
--   7. A takedown revokes the guide's share links (T069-d). The takedown
--      sets revoked_at on every live trip_shares row of the plan, in
--      the same transaction. Nothing is deleted; the owner can make new
--      links, which are private sharing, not publication.
--   8. The takedown names its ground (T070-c, DSA Article 17(3)(d) and
--      (e)). admin_unpublish_guide takes p_ground ('illegal' or 'terms')
--      and p_ground_ref: for 'illegal' the law relied on, in the
--      moderator's words (3 to 300 characters); for 'terms' the item of the
--      content rule in the Terms of Service, 'c1' to 'c7'. Both are stored
--      on the statement and readable by its owner. The two-argument version
--      is dropped so a call cannot be ambiguous.
--   9. The notice form asks for a good-faith confirmation and an optional
--      name (T068-d, Article 16(2)). report_guide takes p_reporter_name and
--      p_good_faith and refuses with good_faith_required unless the tick is
--      true; the name is optional, up to 200 characters. The three-argument
--      version is dropped. admin_list_content_reports (039's body) returns
--      reporterName and goodFaith.
--  10. Retention (T068-g, T070-g). A report's contact email is cleared the
--      moment the report is decided (a trigger, so every path that decides
--      clears it), and decided reports go 12 months after their decision.
--      Statements of reasons go 3 years after the statement or its
--      complaint decision, whichever is later; a statement with an open
--      complaint is never purged. moderation_retention_purge() does both,
--      runs on every accepted report, and is scheduled daily through
--      pg_cron when the extension is on. Reports still 'new' are kept: they
--      are open work, not a record.
--  11. pass_grants rows outlive the account (T217-d). The foreign key to
--      auth.users is now ON DELETE SET NULL instead of CASCADE, and user_id
--      may be null, so a deleted account leaves its purchase record and the
--      waiver evidence behind without anything that names the person.
--  12. export_user_data (048's body, still schema 3) carries the new fields
--      in the traveller's own rows: reporterName and goodFaith on
--      reportsFiled, ground and groundRef on moderationStatements.
--
-- WHAT THE APP DOES WITH IT. The report form has the tick and the name
-- field; the takedown form asks for the ground; the owner's statement shows
-- it, says the guide is locked, and the visibility control explains both
-- refusals; the pass control on an account asks for the authenticator code
-- first; the Content tab says when an overdue temporary patch stops
-- applying. The content rule the moderator cites is drafted in
-- continent-app/src/components/TermsOfService.jsx and waits for the legal
-- review (owner step J4).
--
-- WHAT IT DOES NOT TOUCH. Nothing 044 (stage 10) creates or replaces, and
-- nothing 049 or 050 is reserved for. admin_reset_quota, admin_unban_user
-- and admin_adjust_expiry are unchanged. admin_decide_complaint,
-- admin_dismiss_content_report and contest_moderation_decision are 039's.
--
-- ORDER. Paste in the Supabase SQL editor for ntssxktaduxzpsmejwyv by hand,
-- never `db push`, AFTER 048 (stage 2 of _OPEN-MASTER, row 18, straight
-- after 048). It needs 007, 010, 015, 019, 037, 039, 043, 045, 047 and 048,
-- and its first block names whichever is missing. 044 may come before or
-- after it. Numbers 049 (T147) and 050 (T330) are reserved for other tasks
-- and do not have to be pasted first. Look for the notice
-- "moderation and admin decisions self-check passed". Pasting it twice is
-- safe. The app build that knows the new arguments must go live the same
-- day: until it does, the old report form answers "did not send"
-- (good_faith_required) and the old takedown form answers bad_ground.
--
-- RE-PASTE TRAPS. Re-pasting any of these after this file undoes part of
-- it; paste 051 again afterwards:
--
--   015                    admin_guard loses the live tier (the four
--                          live-effect functions keep only the overall cap
--                          of 60) and admin_set_tier goes back to aal1
--   014                    admin_set_tier goes back to aal1
--   017, 033, 034, 045, 047  one of the four live-effect functions goes back
--                          to the destructive tier
--   018                    the read policy goes back to every row
--                          (content_overrides_read_all next to this one,
--                          and two read policies are OR-ed together)
--   037                    report_guide(uuid, text, text) comes back next to
--                          the five-argument one, and the old list function
--                          loses reporterName and goodFaith
--   038, 039               admin_unpublish_guide(uuid, text) comes back next
--                          to the four-argument one; 039 also loses the two
--                          fields from the report list
--   048                    export_user_data loses the four new fields
--   007                    nothing (create table if not exists keeps the
--                          new foreign key)
--
-- DOWN (paste in this order). Steps 4 and 5 are one-way for data: the
-- emails cleared and the rows purged since the paste do not come back, and
-- names and ticks typed into reports are dropped with their columns (export
-- them first if they matter). pass_grants rows whose account was deleted
-- after the paste have user_id null and cannot be given back a NOT NULL
-- column; step 6 keeps them and then leaves the column nullable.
--
--   -- 1. the trigger and the takedown lock
--   drop trigger if exists trip_plans_publish_gate on public.trip_plans;
--   drop trigger if exists trip_plans_publish_gate_ins on public.trip_plans;
--   drop function if exists public.trip_plans_publish_gate();
--   -- 2. the takedown, the notice form and the report list
--   drop function if exists public.admin_unpublish_guide(uuid, text, text, text);
--   drop function if exists public.report_guide(uuid, text, text, text, boolean);
--   -- then paste 039 whole (the takedown, the guard and the report list;
--   -- its self-check passes) and 037's report_guide block with its two
--   -- grant lines
--   -- 3. the override read policy
--   drop policy if exists content_overrides_read_applying on public.content_overrides;
--   create policy "content_overrides_read_all" on public.content_overrides
--     for select using (true);
--   -- 4. retention
--   do $$ begin if exists (select 1 from pg_extension where extname = 'pg_cron')
--     then perform cron.unschedule('carta_moderation_retention'); end if; end $$;
--   drop trigger if exists content_reports_clear_email on public.content_reports;
--   drop function if exists public.content_reports_clear_email();
--   drop function if exists public.moderation_retention_purge();
--   -- 5. the new columns
--   alter table public.content_reports
--     drop column if exists reporter_name, drop column if exists good_faith;
--   alter table public.moderation_statements
--     drop column if exists ground, drop column if exists ground_ref;
--   -- 6. pass_grants back to cascade, and NOT NULL again only when no
--   -- orphaned row exists (otherwise the column stays nullable)
--   alter table public.pass_grants drop constraint if exists pass_grants_user_id_fkey;
--   alter table public.pass_grants add constraint pass_grants_user_id_fkey
--     foreign key (user_id) references auth.users (id) on delete cascade;
--   do $$ begin if not exists (select 1 from public.pass_grants where user_id is null)
--     then alter table public.pass_grants alter column user_id set not null; end if; end $$;
--   -- 7. the guard and the five functions: paste 015's admin_guard block,
--   -- 015's admin_set_tier block, 045's admin_set_config and
--   -- admin_set_config_public blocks with their grant lines, 047's
--   -- admin_set_override block with its grant lines, 034's
--   -- admin_set_feedback_status block with its grant lines, and 048's
--   -- export_user_data block with its grant lines (only those blocks)
--   notify pgrst, 'reload schema';
--
-- The profiles created by the one-time repair stay: they are what 010's
-- signup trigger should have made, and deleting them would hide guides
-- again.

-- ===========================================================================
-- 0. What this file builds on
-- ===========================================================================
do $pre$
begin
  if to_regprocedure('public.admin_guard(text)') is null then
    raise exception 'public.admin_guard(text) is missing; paste 015 first';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'public.profiles is missing; paste 010 first';
  end if;
  if to_regclass('public.pass_grants') is null then
    raise exception 'public.pass_grants is missing; paste 007 first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'trip_plans'
                    and column_name = 'published_at') then
    raise exception 'trip_plans.published_at is missing; paste 019 first';
  end if;
  if to_regclass('public.content_reports') is null then
    raise exception 'public.content_reports is missing; paste 037 first';
  end if;
  if to_regclass('public.moderation_statements') is null then
    raise exception 'public.moderation_statements is missing; paste 039 first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'content_overrides'
                    and column_name = 'review_by') then
    raise exception 'content_overrides.review_by is missing; paste 043 first';
  end if;
  if to_regprocedure('public.admin_set_config_public(text,boolean)') is null then
    raise exception 'admin_set_config_public is missing; paste 045 first';
  end if;
  if to_regprocedure('public.admin_adjust_expiry(uuid,int)') is null then
    raise exception 'admin_adjust_expiry is missing; paste 047 first';
  end if;
  if to_regclass('public.launch_counts') is null then
    raise exception 'public.launch_counts is missing; paste 048 first';
  end if;
end;
$pre$;

-- ===========================================================================
-- 1. admin_guard: a budget of its own for live-effect saves (T065-b)
-- ===========================================================================
-- 015's body with one more branch. Returns null when the caller may go on,
-- otherwise the error word. The budget is still counted against the audit
-- log itself, the caller's own rows in the last 60 seconds:
--
--   read          60 rows of any action
--   destructive   60 of any action, and 10 of set_tier, reset_quota,
--                 delete_user, ban_user, unban_user (015, unchanged)
--   live          60 of any action, and 20 of set_config, config_visibility,
--                 override_set, override_clear, feedback_new, feedback_open,
--                 feedback_done (051)
--
-- Twenty is this task's choice: twice the destructive cap, one save every
-- three seconds held for a minute, which no person triaging feedback or
-- correcting photos reaches and a script does at once. An unknown tier
-- word counts as read. Internal only, no grants, as in 015.
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

-- ===========================================================================
-- 2. The four live-effect saves move to the live tier (T065-b)
-- ===========================================================================
-- Each block below is the current body, copied byte for byte from the file
-- named above it, with admin_guard('destructive') changed to
-- admin_guard('live') and nothing else.

-- 045's admin_set_config (the maintenance shape check and the key lock).
create or replace function public.admin_set_config(p_key text, p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err  text := public.admin_guard('live');
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

-- 045's admin_set_config_public.
create or replace function public.admin_set_config_public(p_key text, p_public boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err  text := public.admin_guard('live');
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

revoke all on function public.admin_set_config_public(text, boolean) from public, anon;
grant execute on function public.admin_set_config_public(text, boolean) to authenticated, service_role;

-- 047's admin_set_override (seven arguments, 'cycle' in the layer list).
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
  v_err     text := public.admin_guard('live');
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
  if p_layer not in ('beach', 'lake', 'mountain', 'trail', 'dest', 'cycle') then
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

revoke all on function public.admin_set_override(text, text, jsonb, text, text, timestamptz, text) from public, anon;
grant execute on function public.admin_set_override(text, text, jsonb, text, text, timestamptz, text) to authenticated, service_role;

-- 034's admin_set_feedback_status.
create or replace function public.admin_set_feedback_status(p_id bigint, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err text := public.admin_guard('live');
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

revoke all on function public.admin_set_feedback_status(bigint, text) from public, anon;
grant execute on function public.admin_set_feedback_status(bigint, text) to authenticated, service_role;

-- ===========================================================================
-- 3. admin_set_tier needs aal2 (T063-e)
-- ===========================================================================
-- 015's body with 045's refusal added right after the guard: a session
-- below aal2, or a token with no aal claim, gets {error: 'mfa_required'} and
-- leaves one 'mfa_refused' audit row naming the account it was asked about.
-- No read of the target happens first, so an aal1 session still learns
-- nothing about whether an id exists. The admin page already turns the word
-- into "This action needs a code from your authenticator app" (useErrText,
-- T268) and now shows the step-up next to the pass control.
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

-- ===========================================================================
-- 4. Overdue temporary overrides stop applying after 14 days (T074-c)
-- ===========================================================================
-- 018's read policy admitted every row. This one admits a row while it is
-- verified or stale, or while it is temporary and its review date plus a
-- 14-day grace is still ahead. The browser keeps selecting layer, item_id
-- and patch only (043's column grant); the policy reads status and
-- review_by itself, which a policy may do without a column grant to the
-- caller. Nothing is deleted: the row stays in the table, the Content tab
-- still lists it as overdue, and saving it with a new review date makes it
-- apply again.
drop policy if exists "content_overrides_read_all" on public.content_overrides;
drop policy if exists content_overrides_read_applying on public.content_overrides;
create policy content_overrides_read_applying on public.content_overrides
  for select
  using (status <> 'temporary' or review_by + interval '14 days' > now());

-- ===========================================================================
-- 5. Missing profiles, repaired once (T067-d)
-- ===========================================================================
-- 010's signup trigger swallows its own failure so a signup never breaks,
-- which can leave an account with no profile; a public plan by such an
-- account is public by its column but absent from the gallery, because the
-- gallery inner-joins profiles. This is 010's own backfill loop, row by row
-- so claim_handle sees every handle it has just issued.
do $repair$
declare
  u record;
  made int := 0;
begin
  for u in
    select au.id, au.email, au.raw_user_meta_data
      from auth.users au
      left join public.profiles p on p.user_id = au.id
     where p.user_id is null
  loop
    insert into public.profiles (user_id, handle, display_name)
    values (
      u.id,
      public.claim_handle(split_part(coalesce(u.email, ''), '@', 1)),
      nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), '')
    )
    on conflict (user_id) do nothing;
    made := made + 1;
  end loop;
  raise notice 'repaired % missing profile(s)', made;
end;
$repair$;

-- ===========================================================================
-- 6. The publish gate: a profile, and no standing takedown (T067-d, T069-c)
-- ===========================================================================
-- Fires before an insert or an update of trip_plans and looks only at a
-- plan becoming public (a plan that is already public may be edited
-- freely). Two refusals, each a raise with a stable hint the app branches
-- on, because the owner publishes by updating their own row through RLS
-- and a trigger is the only place that sees every such write:
--
--   profile_required    the owner has no profiles row (see section 5)
--   moderation_locked   a statement of reasons about this plan stands:
--                       complaint status none (not contested yet), open
--                       (contested, waiting) or upheld (the takedown was
--                       confirmed). Only 'reversed' lifts it.
--
-- admin_decide_complaint (039) republishes an unchanged guide under the
-- carta.reinstate_plan marker for that one row; the gate lets that write
-- through, since the decision it carries out is the one that lifts the
-- lock. PostgREST gives a client no way to set the marker.
--
-- Trigger order: Postgres fires BEFORE ROW triggers in name order, so on an
-- update this runs after trip_plans_guard_coplanner (020, which pins a
-- co-planner's visibility back first) and before trip_plans_stamp_published
-- (019, which stamps published_at). A statement purged after its 3 years
-- (section 10) takes its lock with it.
create or replace function public.trip_plans_publish_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visibility is distinct from 'public' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.visibility = 'public' then
    return new;
  end if;
  if coalesce(current_setting('carta.reinstate_plan', true), '') = new.id::text then
    return new;
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = new.user_id) then
    raise exception 'a guide can only be published from an account with a profile'
      using errcode = 'P0001', hint = 'profile_required';
  end if;
  if exists (select 1 from public.moderation_statements s
              where s.plan_id = new.id and s.complaint_status <> 'reversed') then
    raise exception 'this guide was taken down and stays unpublished until a complaint about that decision is decided in its favour'
      using errcode = 'P0001', hint = 'moderation_locked';
  end if;
  return new;
end;
$$;

revoke all on function public.trip_plans_publish_gate() from public, anon, authenticated;

drop trigger if exists trip_plans_publish_gate on public.trip_plans;
create trigger trip_plans_publish_gate
  before update on public.trip_plans
  for each row execute function public.trip_plans_publish_gate();

drop trigger if exists trip_plans_publish_gate_ins on public.trip_plans;
create trigger trip_plans_publish_gate_ins
  before insert on public.trip_plans
  for each row execute function public.trip_plans_publish_gate();

-- ===========================================================================
-- 7. New columns: the ground on a statement, the notifier's name and tick
-- ===========================================================================
-- Null on every row written before this file: those statements were made
-- with one reason and no ground, and those notices were filed without the
-- tick. Nothing is backfilled, because nothing was asked.
alter table public.moderation_statements
  add column if not exists ground     text
        check (ground is null or ground in ('illegal', 'terms')),
  add column if not exists ground_ref text
        check (ground_ref is null or char_length(ground_ref) between 2 and 300);

-- The owner reads the ground with the rest of the statement (039's column
-- grant, widened by these two).
grant select (ground, ground_ref) on public.moderation_statements to authenticated;

alter table public.content_reports
  add column if not exists reporter_name text
        check (reporter_name is null or char_length(reporter_name) between 1 and 200),
  add column if not exists good_faith    boolean;

-- ===========================================================================
-- 8. The takedown: a ground, and the share links go (T070-c, T069-d)
-- ===========================================================================
-- 039's body with three additions, marked 051 below: the ground is checked
-- right after the reason and stored on the statement; every live share link
-- of the plan is revoked in the same transaction (revoked_at, never a
-- delete: the owner's sharing history stays in their account and in their
-- export); and the audit row and the answer carry both. The never-delete
-- promise of 038 holds: the self-check below refuses a body with the word
-- in it.
--
-- The ground, DSA Article 17(3)(d) and (e):
--   'illegal'  p_ground_ref is the law relied on, as the moderator writes
--              it ("Belgian Code of Economic Law, Book XI, copyright"),
--              3 to 300 characters after trimming
--   'terms'    p_ground_ref is the item of the content rule in the Terms of
--              Service, 'c1' to 'c7'; the app shows its title in the
--              owner's language
-- Refusals added: bad_ground, bad_ground_ref. Both come before the plan is
-- read, so a malformed call changes nothing and locks nothing.
drop function if exists public.admin_unpublish_guide(uuid, text);

create or replace function public.admin_unpublish_guide(
  p_plan_id    uuid,
  p_reason     text,
  p_ground     text default null,
  p_ground_ref text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_err     text := public.admin_guard('destructive');
  -- trim() only strips spaces; a reason of newlines and tabs is blank too.
  v_reason  text := regexp_replace(coalesce(p_reason, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_ground  text := lower(regexp_replace(coalesce(p_ground, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'));
  v_ref     text := regexp_replace(coalesce(p_ground_ref, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_owner   uuid;
  v_label   text;
  v_vis     text;
  v_pub     timestamptz;
  v_new_vis text;
  v_new_pub timestamptz;
  v_reports jsonb;
  v_n       int;
  v_hash    text;
  v_stmt    bigint;
  v_links   int;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  if v_reason = '' or char_length(v_reason) > 2000 then
    return jsonb_build_object('error', 'bad_reason');
  end if;
  -- 051: the ground, before anything is read or locked.
  if v_ground not in ('illegal', 'terms') then
    return jsonb_build_object('error', 'bad_ground');
  end if;
  if v_ground = 'terms' then
    v_ref := lower(v_ref);
    if v_ref not in ('c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7') then
      return jsonb_build_object('error', 'bad_ground_ref');
    end if;
  elsif char_length(v_ref) < 3 or char_length(v_ref) > 300 then
    return jsonb_build_object('error', 'bad_ground_ref');
  end if;

  -- The row as it stands, locked until this transaction ends.
  select tp.user_id, tp.label, tp.visibility, tp.published_at
    into v_owner, v_label, v_vis, v_pub
    from public.trip_plans tp
   where tp.id = p_plan_id
     for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  -- Already not public: nothing to take down, nothing written.
  if v_vis <> 'public' then
    return jsonb_build_object('ok', true, 'changed', false,
                              'visibility', v_vis, 'reportsActioned', 0);
  end if;

  -- What the public could read at the moment it came down (039). A
  -- reversal compares against this before it republishes anything.
  v_hash := public.moderation_guide_fingerprint(p_plan_id);

  perform set_config('carta.takedown_plan', p_plan_id::text, true);
  update public.trip_plans
     set visibility = 'private'
   where id = p_plan_id
  returning visibility, published_at into v_new_vis, v_new_pub;
  perform set_config('carta.takedown_plan', '', true);

  -- A trigger that pins visibility (020's guard without the exception)
  -- would leave the guide public. Refuse loudly rather than report success;
  -- the raise rolls the whole call back.
  if v_new_vis is distinct from 'private' then
    raise exception 'the plan is still public after the update (visibility %); re-apply 039 and then 051', v_new_vis;
  end if;

  -- 051: the share links stop opening the guide (T069-d).
  update public.trip_shares
     set revoked_at = now()
   where trip_plan_id = p_plan_id
     and revoked_at is null;
  get diagnostics v_links = row_count;

  with moved as (
    update public.content_reports r
       set status        = 'actioned',
           decided_by    = auth.uid(),
           decided_at    = now(),
           decision_note = v_reason
     where r.plan_id = p_plan_id and r.status = 'new'
    returning r.id
  )
  select coalesce(jsonb_agg(id order by id), '[]'::jsonb), count(*)
    into v_reports, v_n
    from moved;

  -- The statement of reasons (039), one per takedown, now with its ground
  -- (051). source is 'notice' when an open report on the guide was closed
  -- by this takedown. The notifier is not named.
  insert into public.moderation_statements
    (plan_id, plan_label, owner_id, source, notice_count, facts,
     previous_published_at, content_hash, decided_by, ground, ground_ref)
  values
    (p_plan_id, v_label, v_owner,
     case when v_n > 0 then 'notice' else 'own_initiative' end,
     v_n, v_reason, v_pub, v_hash, auth.uid(), v_ground, v_ref)
  returning id into v_stmt;

  perform public.admin_log('unpublish_guide', v_owner,
    jsonb_build_object(
      'table',    'trip_plans',
      'planId',   p_plan_id,
      'label',    v_label,
      'reason',   v_reason,
      'ground',   v_ground,
      'groundRef', v_ref,
      'previous', jsonb_build_object('visibility', v_vis, 'publishedAt', v_pub),
      'new',      jsonb_build_object('visibility', v_new_vis, 'publishedAt', v_new_pub),
      'reports',  v_reports,
      'sharesRevoked', v_links,
      'statementId', v_stmt));

  return jsonb_build_object('ok', true, 'changed', true,
                            'visibility', v_new_vis, 'reportsActioned', v_n,
                            'sharesRevoked', v_links, 'statementId', v_stmt);
end;
$$;

revoke all on function public.admin_unpublish_guide(uuid, text, text, text) from public, anon;
grant execute on function public.admin_unpublish_guide(uuid, text, text, text) to authenticated, service_role;

-- ===========================================================================
-- 9. The notice form: a good-faith tick and an optional name (T068-d)
-- ===========================================================================
-- 037's body with two arguments added and checked with the others, before
-- anything is counted or stored:
--   p_reporter_name  optional; blank counts as none; over 200 characters
--                    after trimming is bad_name
--   p_good_faith     must be true, or the answer is good_faith_required.
--                    Article 16(2)(d) asks a notice for "a statement
--                    confirming the bona fide belief" that it is accurate
--                    and complete; the owner chose to require it
-- Each accepted report also runs the retention purge (section 10), so the
-- limits hold even where pg_cron is off. Grants as in 037: anon,
-- authenticated and service_role, because a visitor without an account can
-- report. Receipt and decision by email (Article 16(4), 16(5)) wait for an
-- email route (owner step J6); the contact email is still optional.
drop function if exists public.report_guide(uuid, text, text);

create or replace function public.report_guide(
  p_plan_id       uuid,
  p_reason        text,
  p_contact_email text default null,
  p_reporter_name text default null,
  p_good_faith    boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reason  text := trim(coalesce(p_reason, ''));
  v_email   text := nullif(trim(coalesce(p_contact_email, '')), '');
  v_name    text := nullif(regexp_replace(coalesce(p_reporter_name, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
  v_uid     uuid := auth.uid();
  v_headers jsonb;
  v_raw     text;
  v_header  text := 'none';
  v_addr    inet;
  v_key     text;
  v_salt    text;
  v_hash    text;
  v_owner   uuid;
  v_label   text;
  n         int;
begin
  -- 1. What was sent. Nothing is stored or counted for a malformed call.
  if char_length(v_reason) < 10 or char_length(v_reason) > 4000 then
    return jsonb_build_object('error', 'bad_reason');
  end if;
  if v_email is not null and (
       char_length(v_email) > 254
       or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@.]+$'
     ) then
    return jsonb_build_object('error', 'bad_email');
  end if;
  if v_name is not null and char_length(v_name) > 200 then
    return jsonb_build_object('error', 'bad_name');
  end if;
  if p_good_faith is not true then
    return jsonb_build_object('error', 'good_faith_required');
  end if;

  -- 2. Where it came from. A missing or malformed header must not break the
  --    call, only drop it into the shared unknown bucket.
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  v_raw := nullif(trim(v_headers ->> 'cf-connecting-ip'), '');
  if v_raw is not null then
    v_header := 'cf-connecting-ip';
  else
    v_raw := nullif(trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '');
    if v_raw is not null then
      v_header := 'x-forwarded-for';
    end if;
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
      -- Not an address at all: bucket by the literal text, capped.
      v_key := 'raw:' || left(v_raw, 100);
    end;
  else
    v_key := 'unknown';
  end if;

  select s.salt into v_salt from public.content_report_salt s where s.id = 1;
  v_hash := encode(sha256(convert_to(coalesce(v_salt, '') || '|' || v_key, 'UTF8')), 'hex');

  -- 3. The rate limit. Locks first, so parallel calls from one source queue
  --    behind each other instead of racing past the count.
  perform pg_advisory_xact_lock(hashtextextended('content_reports:' || v_hash, 0));
  if v_uid is not null then
    perform pg_advisory_xact_lock(hashtextextended('content_reports:' || v_uid::text, 0));
  end if;

  select count(*) into n from public.content_reports r
   where r.source_hash = v_hash and r.created_at > now() - interval '1 hour';
  if n >= 5 then
    return jsonb_build_object('error', 'too_many');
  end if;
  if v_uid is not null then
    select count(*) into n from public.content_reports r
     where r.reporter_id = v_uid and r.created_at > now() - interval '1 hour';
    if n >= 5 then
      return jsonb_build_object('error', 'too_many');
    end if;
  end if;
  select count(*) into n from public.content_reports r
   where r.created_at > now() - interval '1 hour';
  if n >= 500 then
    return jsonb_build_object('error', 'too_many');
  end if;

  -- 4. Only a public guide can be reported through this door: the same
  --    predicate list_public_guides and get_public_guide use.
  select tp.user_id, tp.label into v_owner, v_label
    from public.trip_plans tp
   where tp.id = p_plan_id and tp.visibility = 'public';
  if not found then
    return jsonb_build_object('error', 'not_public');
  end if;

  -- 5. Retention (051): what has outlived its period goes first.
  perform public.moderation_retention_purge();

  insert into public.content_reports
    (plan_id, plan_owner, plan_label, reason, contact_email, reporter_id,
     source_hash, source_header, reporter_name, good_faith)
  values
    (p_plan_id, v_owner, v_label, v_reason, v_email, v_uid,
     v_hash, v_header, v_name, true);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.report_guide(uuid, text, text, text, boolean) from public;
grant execute on function public.report_guide(uuid, text, text, text, boolean) to anon, authenticated, service_role;

-- 039's admin_list_content_reports with reporterName and goodFaith added
-- after decisionNote. Nothing else moved.
create or replace function public.admin_list_content_reports(
  p_status text default null,
  p_limit  int  default 50,
  p_offset int  default 0
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
  v_status text := nullif(trim(coalesce(p_status, '')), '');
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  if v_status is not null and v_status not in ('new', 'actioned', 'dismissed') then
    v_status := null;
  end if;

  return jsonb_build_object(
    'total', (select count(*) from public.content_reports
               where v_status is null or status = v_status),
    'new',   (select count(*) from public.content_reports where status = 'new'),
    'rows',  coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',             r.id,
        'createdAt',      r.created_at,
        'status',         r.status,
        'planId',         r.plan_id,
        'planLabel',      r.plan_label,
        'currentLabel',   tp.label,
        'planExists',     tp.id is not null,
        'stillPublic',    coalesce(tp.visibility = 'public', false),
        'ownerId',        r.plan_owner,
        'ownerHandle',    op.handle,
        'ownerEmail',     ou.email,
        'reason',         r.reason,
        'contactEmail',   r.contact_email,
        'reporterId',     r.reporter_id,
        'reporterHandle', rp.handle,
        'sourceHeader',   r.source_header,
        -- How many notices share this reporter's network source, and how
        -- many this guide has had, so a flood and a pile-on both show.
        'sourceTotal',    (select count(*) from public.content_reports x
                            where x.source_hash = r.source_hash),
        'planTotal',      (select count(*) from public.content_reports x
                            where x.plan_id = r.plan_id),
        'decidedAt',      r.decided_at,
        'decidedByHandle', dp.handle,
        'decisionNote',   r.decision_note,
        'reporterName',   r.reporter_name,
        'goodFaith',      r.good_faith
      ) order by r.id desc)
      from (select * from public.content_reports
             where v_status is null or status = v_status
             order by id desc limit v_limit offset v_offset) r
      left join public.trip_plans tp on tp.id = r.plan_id
      left join public.profiles op    on op.user_id = r.plan_owner
      left join auth.users ou         on ou.id = r.plan_owner
      left join public.profiles rp    on rp.user_id = r.reporter_id
      left join public.profiles dp    on dp.user_id = r.decided_by
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_list_content_reports(text, int, int) from public, anon;
grant execute on function public.admin_list_content_reports(text, int, int) to authenticated, service_role;

-- ===========================================================================
-- 10. Retention: reports 12 months, the email cleared on decision,
--     statements 3 years (T068-g, T070-g)
-- ===========================================================================
-- The email is cleared by a trigger, so every path that decides a report
-- (admin_unpublish_guide, admin_dismiss_content_report, and anything later)
-- clears it without having to remember to. A decision email to the notifier
-- (Article 16(5)) has to be sent before the decision commits once an email
-- route exists (J6); until then the moderator replies from the Reports tab
-- before deciding, which the tab now says.
create or replace function public.content_reports_clear_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'new' and new.status <> 'new' then
    new.contact_email := null;
  end if;
  return new;
end;
$$;

revoke all on function public.content_reports_clear_email() from public, anon, authenticated;

drop trigger if exists content_reports_clear_email on public.content_reports;
create trigger content_reports_clear_email
  before update on public.content_reports
  for each row execute function public.content_reports_clear_email();

-- Reports decided before this file keep no email either. One-way.
update public.content_reports
   set contact_email = null
 where status <> 'new' and contact_email is not null;

-- The purge. Decided reports 12 months after their decision (decided_at is
-- null only on reports 038 actioned before 039 added the column; those
-- count from their filing). Statements 3 years after the later of the
-- statement and its complaint decision; never one whose complaint is open.
-- Reports still 'new' are not touched. Returns the two counts. Internal:
-- no client grant; the service role may run it by hand.
create or replace function public.moderation_retention_purge()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reports    bigint;
  v_statements bigint;
begin
  delete from public.content_reports c
   where c.status <> 'new'
     and coalesce(c.decided_at, c.created_at) < now() - interval '12 months';
  get diagnostics v_reports = row_count;

  delete from public.moderation_statements m
   where m.complaint_status <> 'open'
     and greatest(m.created_at, coalesce(m.complaint_decided_at, m.created_at))
         < now() - interval '3 years';
  get diagnostics v_statements = row_count;

  return jsonb_build_object('reports', v_reports, 'statements', v_statements);
end;
$$;

revoke all on function public.moderation_retention_purge() from public, anon, authenticated;
grant execute on function public.moderation_retention_purge() to service_role;

-- Daily at 03:17 UTC when pg_cron is on. cron.schedule with a name replaces
-- an existing job of that name, so a second paste does not add a second job.
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('carta_moderation_retention', '17 3 * * *',
                          'select public.moderation_retention_purge()');
    raise notice 'moderation_retention_purge scheduled daily through pg_cron';
  else
    raise notice 'pg_cron is not enabled: the purge still runs on every accepted report; to run it daily as well, enable pg_cron under Database, Extensions, then run '
      'select cron.schedule(''carta_moderation_retention'', ''17 3 * * *'', ''select public.moderation_retention_purge()'');';
  end if;
end;
$cron$;

-- ===========================================================================
-- 11. pass_grants rows outlive the account (T217-d)
-- ===========================================================================
-- 007 made user_id NOT NULL with ON DELETE CASCADE, so deleting an account
-- erased its purchase records and the only copy of the waiver consent (025).
-- Now the row stays with user_id null: the session id, tier, dates, consent
-- and (after 044) the fee stay for the bookkeeping years, and nothing in the
-- row names the person any more. The traveller's own read policy
-- (auth.uid() = user_id) never matches a null, so an orphaned row is
-- readable by no client. Whatever the constraint is called, it is found by
-- what it references and replaced.
do $pg$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.pass_grants'::regclass
       and con.contype = 'f'
       and con.confrelid = 'auth.users'::regclass
  loop
    execute format('alter table public.pass_grants drop constraint %I', c.conname);
  end loop;
end;
$pg$;

alter table public.pass_grants alter column user_id drop not null;
alter table public.pass_grants
  add constraint pass_grants_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

-- ===========================================================================
-- 12. export_user_data: the new fields in the traveller's own rows
-- ===========================================================================
-- 048's body, still schema 3, with reporterName and goodFaith on
-- reportsFiled and ground and groundRef on moderationStatements. Nothing
-- else moved.
create or replace function public.export_user_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_uid       uuid := auth.uid();
  v_out       jsonb;
  v_usage_day jsonb := null;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_signed_in');
  end if;

  -- 044's per-day AI ledger, when 044 has been pasted. EXECUTE, so this body
  -- compiles and runs on a project without the table.
  if to_regclass('public.ai_usage_days') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'kind', d.kind, 'n', d.n)
                                order by d.day, d.kind), '[]'::jsonb)
        from public.ai_usage_days d
       where d.user_id = $1
    $q$ into v_usage_day using v_uid;
  end if;

  v_out := jsonb_build_object(
    'schema',     3,
    'exportedAt', now(),
    'userId',     v_uid,

    'profile', (
      select jsonb_build_object(
        'handle',      p.handle,
        'displayName', p.display_name,
        'avatarEmoji', p.avatar_emoji,
        'createdAt',   p.created_at,
        'updatedAt',   p.updated_at)
      from public.profiles p
      where p.user_id = v_uid
    ),

    'tripPlans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',          p.id,
        'label',       p.label,
        'visibility',  p.visibility,
        'publishedAt', p.published_at,
        'createdAt',   p.created_at,
        'updatedAt',   p.updated_at
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

    'dayPlans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'planId',    d.plan_id,
        'payload',   d.payload,
        'updatedAt', d.updated_at,
        'deletedAt', d.deleted_at
      ) order by d.updated_at)
      from public.day_plans d
      where d.user_id = v_uid
    ), '[]'::jsonb),

    'tripShares', coalesce((
      select jsonb_agg(jsonb_build_object(
        'token',      t.token,
        'tripPlanId', t.trip_plan_id,
        'scope',      t.scope,
        'expiresAt',  t.expires_at,
        'revokedAt',  t.revoked_at,
        'createdAt',  t.created_at
      ) order by t.created_at)
      from public.trip_shares t
      where t.owner_id = v_uid
    ), '[]'::jsonb),

    -- Invitations both ways. The other side's handle only where row level
    -- security already shows the caller that profile (012).
    'coplanners', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tripPlanId',  c.trip_plan_id,
        'role',        case when c.user_id = v_uid then 'invited' else 'inviter' end,
        'otherHandle', case when public.link_status_with_me(o.other) in ('pending', 'accepted')
                            then (select pr.handle from public.profiles pr where pr.user_id = o.other) end,
        'status',      c.status,
        'createdAt',   c.created_at,
        'respondedAt', c.responded_at
      ) order by c.created_at)
      from public.trip_collaborators c
      cross join lateral (select case when c.user_id = v_uid then c.invited_by else c.user_id end as other) o
      where c.user_id = v_uid or c.invited_by = v_uid
    ), '[]'::jsonb),

    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'direction',   case when f.requester_id = v_uid then 'sent' else 'received' end,
        'otherHandle', case when f.status in ('pending', 'accepted')
                            then (select pr.handle from public.profiles pr where pr.user_id = o.other) end,
        'status',      f.status,
        'createdAt',   f.created_at,
        'respondedAt', f.responded_at
      ) order by f.created_at)
      from public.friendships f
      cross join lateral (select case when f.requester_id = v_uid then f.addressee_id else f.requester_id end as other) o
      where f.requester_id = v_uid or f.addressee_id = v_uid
    ), '[]'::jsonb),

    'entitlement', (
      select jsonb_build_object(
        'tier',                e.tier,
        'periodStart',         e.period_start,
        'expiresAt',           e.expires_at,
        'source',              e.source,
        'stripeCustomerId',    e.stripe_customer_id,
        'lastCheckoutSession', e.last_session_id,
        'updatedAt',           e.updated_at)
      from public.entitlements e
      where e.user_id = v_uid
    ),

    -- reason, fee_cents and fee_currency arrive with 044; to_jsonb answers
    -- null for them before it is pasted.
    'passGrants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'checkoutSession', g.session_id,
        'tier',            g.tier,
        'grantedAt',       g.granted_at,
        'expiresAt',       g.expires_at,
        'amountCents',     g.amount_cents,
        'currency',        g.currency,
        'buyerCountry',    g.buyer_country,
        'consentTos',      g.consent_tos,
        'consentAt',       g.consent_at,
        'consentTermsUrl', g.consent_terms_url,
        'reason',          to_jsonb(g) -> 'reason',
        'feeCents',        to_jsonb(g) -> 'fee_cents',
        'feeCurrency',     to_jsonb(g) -> 'fee_currency'
      ) order by g.granted_at)
      from public.pass_grants g
      where g.user_id = v_uid
    ), '[]'::jsonb),

    'aiUsage', jsonb_build_object(
      'byPeriod', coalesce((
        select jsonb_agg(jsonb_build_object('periodStart', u.period_start, 'kind', u.kind, 'n', u.n)
                         order by u.period_start, u.kind)
        from public.ai_usage u
        where u.user_id = v_uid
      ), '[]'::jsonb),
      'byDayLegacy', coalesce((
        select jsonb_agg(jsonb_build_object('day', u.used_on, 'n', u.n) order by u.used_on)
        from public.ai_plan_usage u
        where u.user_id = v_uid
      ), '[]'::jsonb),
      'byDay', v_usage_day
    ),

    'aiModelEvents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'at',       m.created_at,
        'model',    m.model,
        'kind',     m.kind,
        'fellBack', m.fell_back
      ) order by m.created_at)
      from public.ai_model_events m
      where m.user_id = v_uid
    ), '[]'::jsonb),

    'parseFailures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'at',          x.at,
        'inputKind',   x.input_kind,
        'inputBytes',  x.input_size_b,
        'mimeType',    x.mime_type,
        'checkFailed', x.check_failed,
        'appVersion',  x.app_version
      ) order by x.at)
      from public.parse_failures x
      where x.user_id = v_uid
    ), '[]'::jsonb),

    'achievements', coalesce((
      select jsonb_agg(jsonb_build_object('badge', a.badge, 'earnedAt', a.earned_at)
                       order by a.earned_at)
      from public.user_achievements a
      where a.user_id = v_uid
    ), '[]'::jsonb),

    'feedback', coalesce((
      select jsonb_agg(jsonb_build_object(
        'createdAt', f.created_at,
        'kind',      f.kind,
        'message',   f.message,
        'email',     f.email,
        'context',   f.context,
        'status',    f.status,
        'handledAt', f.handled_at
      ) order by f.created_at)
      from public.feedback f
      where f.user_id = v_uid
    ), '[]'::jsonb),

    'reportsFiled', coalesce((
      select jsonb_agg(jsonb_build_object(
        'createdAt',    r.created_at,
        'planId',       r.plan_id,
        'planLabel',    r.plan_label,
        'reason',       r.reason,
        'contactEmail', r.contact_email,
        'status',       r.status,
        'decidedAt',    r.decided_at,
        'decisionNote', r.decision_note,
        'reporterName', r.reporter_name,
        'goodFaith',    r.good_faith
      ) order by r.created_at)
      from public.content_reports r
      where r.reporter_id = v_uid
    ), '[]'::jsonb),

    'moderationStatements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'createdAt',          s.created_at,
        'planId',             s.plan_id,
        'planLabel',          s.plan_label,
        'restriction',        s.restriction,
        'source',             s.source,
        'facts',              s.facts,
        'automated',          s.automated,
        'contestUntil',       s.contest_until,
        'complaint',          s.complaint_body,
        'complaintAt',        s.complaint_at,
        'complaintStatus',    s.complaint_status,
        'complaintDecidedAt', s.complaint_decided_at,
        'complaintNote',      s.complaint_note,
        'reinstated',         s.reinstated,
        'ground',             s.ground,
        'groundRef',          s.ground_ref
      ) order by s.created_at)
      from public.moderation_statements s
      where s.owner_id = v_uid
    ), '[]'::jsonb),

    'accountActions', coalesce((
      select jsonb_agg(jsonb_build_object('action', l.action, 'at', l.created_at)
                       order by l.created_at)
      from public.admin_audit_log l
      where l.target_user = v_uid
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

    -- The AI and booking-parse failures and app crashes the caller ran into
    -- (040, 047). Codes and statuses only.
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

  return v_out;
end;
$fn$;

revoke all on function public.export_user_data() from public, anon;
grant execute on function public.export_user_data() to authenticated, service_role;

-- ===========================================================================
-- Self-check: runs on apply
-- ===========================================================================
do $chk$
declare
  def   text;
  v_cnt int;
  v     jsonb;
  k     text;
  f     text;
  pos_guard int;
  pos_aal   int;
  pos_read  int;
begin
  -- 1. The guard's live tier.
  def := pg_get_functiondef('public.admin_guard(text)'::regprocedure);
  if position('''live''' in def) = 0 or position('''config_visibility''' in def) = 0
     or position('''feedback_done''' in def) = 0 then
    raise exception 'admin_guard has no live tier';
  end if;
  if position('''unban_user''' in def) = 0 then
    raise exception 'admin_guard lost the destructive list';
  end if;
  if has_function_privilege('authenticated', 'public.admin_guard(text)', 'execute') then
    raise exception 'authenticated can execute admin_guard';
  end if;
  if public.admin_guard('live') is distinct from 'forbidden' then
    raise exception 'admin_guard(''live'') did not refuse a caller with no session';
  end if;

  -- 2. The four live-effect saves.
  foreach f in array array['public.admin_set_config(text,jsonb)',
                           'public.admin_set_config_public(text,boolean)',
                           'public.admin_set_override(text,text,jsonb,text,text,timestamptz,text)',
                           'public.admin_set_feedback_status(bigint,text)'] loop
    def := pg_get_functiondef(f::regprocedure);
    if position('admin_guard(''live'')' in def) = 0
       or position('admin_guard(''destructive'')' in def) > 0 then
      raise exception '% is not on the live tier', f;
    end if;
    if not (select p.prosecdef from pg_proc p where p.oid = f::regprocedure) then
      raise exception '% is not security definer', f;
    end if;
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'anon can execute %', f;
    end if;
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'authenticated cannot execute %', f;
    end if;
  end loop;
  -- What each body carried before must still be there.
  if position('maintenance' in pg_get_functiondef('public.admin_set_config(text,jsonb)'::regprocedure)) = 0 then
    raise exception 'admin_set_config lost the maintenance check (045)';
  end if;
  if position('''cycle''' in pg_get_functiondef('public.admin_set_override(text,text,jsonb,text,text,timestamptz,text)'::regprocedure)) = 0 then
    raise exception 'admin_set_override lost the cycle layer (047)';
  end if;
  if (public.admin_set_config('announcement', '{}'::jsonb) ->> 'error') is distinct from 'forbidden' then
    raise exception 'admin_set_config did not refuse a caller with no session';
  end if;

  -- 3. admin_set_tier: guard, then aal2, then the first read.
  def := pg_get_functiondef('public.admin_set_tier(uuid,text,int)'::regprocedure);
  pos_guard := position('admin_guard(''destructive'')' in def);
  pos_aal   := position('auth.jwt()' in def);
  pos_read  := position('from public.plan_tiers' in def);
  if pos_guard = 0 or pos_aal = 0 or pos_read = 0
     or not (pos_guard < pos_aal and pos_aal < pos_read) then
    raise exception 'admin_set_tier does not check aal2 between the guard and the first read';
  end if;
  if position('mfa_required' in def) = 0 or position('mfa_refused' in def) = 0 then
    raise exception 'admin_set_tier does not refuse with mfa_required and log mfa_refused';
  end if;
  if has_function_privilege('anon', 'public.admin_set_tier(uuid,text,int)', 'execute') then
    raise exception 'anon can execute admin_set_tier';
  end if;
  if (public.admin_set_tier(gen_random_uuid(), 'free', null) ->> 'error') is distinct from 'forbidden' then
    raise exception 'admin_set_tier did not refuse a caller with no session';
  end if;

  -- 4. One read policy on content_overrides, and it is the grace rule.
  select count(*) into v_cnt from pg_policies
   where schemaname = 'public' and tablename = 'content_overrides';
  if v_cnt <> 1 then
    raise exception 'content_overrides should carry exactly one read policy, found %', v_cnt;
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'content_overrides'
                    and policyname = 'content_overrides_read_applying'
                    and cmd = 'SELECT'
                    and position('review_by' in qual) > 0
                    and position('14 days' in qual) > 0) then
    raise exception 'content_overrides_read_applying is missing or not the 14-day rule';
  end if;

  -- 5. Every account has a profile.
  select count(*) into v_cnt
    from auth.users au left join public.profiles p on p.user_id = au.id
   where p.user_id is null;
  if v_cnt <> 0 then
    raise exception '% account(s) still have no profile after the repair', v_cnt;
  end if;

  -- 6. The publish gate, on insert and on update, enabled.
  foreach f in array array['trip_plans_publish_gate', 'trip_plans_publish_gate_ins'] loop
    if not exists (select 1 from pg_trigger t
                    where t.tgrelid = 'public.trip_plans'::regclass
                      and t.tgname = f and t.tgenabled <> 'D' and not t.tgisinternal) then
      raise exception 'trigger % is missing on trip_plans', f;
    end if;
  end loop;
  def := pg_get_functiondef('public.trip_plans_publish_gate()'::regprocedure);
  if position('profile_required' in def) = 0 or position('moderation_locked' in def) = 0
     or position('reinstate_plan' in def) = 0 then
    raise exception 'trip_plans_publish_gate lacks a refusal or the reinstate exception';
  end if;

  -- 7. The new columns, and the owner can read the ground.
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'moderation_statements'
         and column_name in ('ground', 'ground_ref')) <> 2 then
    raise exception 'moderation_statements lacks ground or ground_ref';
  end if;
  if not has_column_privilege('authenticated', 'public.moderation_statements', 'ground', 'select')
     or not has_column_privilege('authenticated', 'public.moderation_statements', 'ground_ref', 'select') then
    raise exception 'the owner cannot read the ground of their statement';
  end if;
  if has_column_privilege('authenticated', 'public.moderation_statements', 'decided_by', 'select') then
    raise exception 'decided_by became readable';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'content_reports'
         and column_name in ('reporter_name', 'good_faith')) <> 2 then
    raise exception 'content_reports lacks reporter_name or good_faith';
  end if;

  -- 8. The takedown: one version, four arguments, a ground, the links, no
  --    delete, refused without a session.
  select count(*) into v_cnt from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'admin_unpublish_guide';
  if v_cnt <> 1 or to_regprocedure('public.admin_unpublish_guide(uuid,text,text,text)') is null then
    raise exception 'admin_unpublish_guide must be exactly the four-argument function';
  end if;
  def := pg_get_functiondef('public.admin_unpublish_guide(uuid,text,text,text)'::regprocedure);
  if position('delete' in lower(def)) > 0 then
    raise exception 'admin_unpublish_guide contains a delete';
  end if;
  if position('admin_guard(''destructive'')' in def) = 0 or position('bad_ground' in def) = 0
     or position('trip_shares' in def) = 0 or position('revoked_at' in def) = 0
     or position('ground_ref' in def) = 0 then
    raise exception 'admin_unpublish_guide lacks the guard, the ground or the share revocation';
  end if;
  if has_function_privilege('anon', 'public.admin_unpublish_guide(uuid,text,text,text)', 'execute') then
    raise exception 'anon can execute admin_unpublish_guide';
  end if;
  if (public.admin_unpublish_guide(gen_random_uuid(), 'a reason', 'terms', 'c1') ->> 'error') is distinct from 'forbidden' then
    raise exception 'admin_unpublish_guide did not refuse a caller with no session';
  end if;

  -- 9. The notice form: one version, five arguments, open to anon, and the
  --    new refusals answer before anything is stored.
  select count(*) into v_cnt from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'report_guide';
  if v_cnt <> 1 or to_regprocedure('public.report_guide(uuid,text,text,text,boolean)') is null then
    raise exception 'report_guide must be exactly the five-argument function';
  end if;
  if not has_function_privilege('anon', 'public.report_guide(uuid,text,text,text,boolean)', 'execute') then
    raise exception 'anon cannot execute report_guide';
  end if;
  select count(*) into v_cnt from public.content_reports;
  if (public.report_guide(gen_random_uuid(), 'a reason long enough', null, null, false) ->> 'error')
       is distinct from 'good_faith_required' then
    raise exception 'report_guide accepted a notice without the good-faith tick';
  end if;
  if (public.report_guide(gen_random_uuid(), 'a reason long enough', null, repeat('n', 201), true) ->> 'error')
       is distinct from 'bad_name' then
    raise exception 'report_guide accepted a name over 200 characters';
  end if;
  if (public.report_guide(gen_random_uuid(), 'short', null, null, true) ->> 'error')
       is distinct from 'bad_reason' then
    raise exception 'report_guide did not check the reason first';
  end if;
  if (select count(*) from public.content_reports) <> v_cnt then
    raise exception 'a refused report_guide call stored a row';
  end if;
  if (public.admin_list_content_reports(null, 1, 0) ->> 'error') is distinct from 'forbidden' then
    raise exception 'admin_list_content_reports did not refuse a caller with no session';
  end if;
  def := pg_get_functiondef('public.admin_list_content_reports(text,int,int)'::regprocedure);
  if position('reporterName' in def) = 0 or position('goodFaith' in def) = 0 then
    raise exception 'admin_list_content_reports lacks reporterName or goodFaith';
  end if;

  -- 10. Retention.
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.content_reports'::regclass
                    and t.tgname = 'content_reports_clear_email' and not t.tgisinternal) then
    raise exception 'the email-clearing trigger is missing on content_reports';
  end if;
  if exists (select 1 from public.content_reports where status <> 'new' and contact_email is not null) then
    raise exception 'a decided report still holds an email';
  end if;
  if has_function_privilege('anon', 'public.moderation_retention_purge()', 'execute')
     or has_function_privilege('authenticated', 'public.moderation_retention_purge()', 'execute') then
    raise exception 'a client can execute moderation_retention_purge';
  end if;
  def := pg_get_functiondef('public.moderation_retention_purge()'::regprocedure);
  if position('12 months' in def) = 0 or position('3 years' in def) = 0 then
    raise exception 'moderation_retention_purge is not 12 months and 3 years';
  end if;

  -- 11. pass_grants: set null, nullable.
  if not exists (select 1 from pg_constraint con
                  where con.conrelid = 'public.pass_grants'::regclass
                    and con.contype = 'f' and con.confrelid = 'auth.users'::regclass
                    and con.confdeltype = 'n') then
    raise exception 'pass_grants does not set user_id null on account deletion';
  end if;
  if exists (select 1 from pg_constraint con
              where con.conrelid = 'public.pass_grants'::regclass
                and con.contype = 'f' and con.confrelid = 'auth.users'::regclass
                and con.confdeltype = 'c') then
    raise exception 'pass_grants still cascades on account deletion';
  end if;
  if (select is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'pass_grants' and column_name = 'user_id') <> 'YES' then
    raise exception 'pass_grants.user_id is still NOT NULL';
  end if;

  -- 12. The export: one function, no arguments, schema 3, the new fields.
  select count(*) into v_cnt from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'export_user_data';
  if v_cnt <> 1 then
    raise exception 'export_user_data must be exactly one function';
  end if;
  if has_function_privilege('anon', 'public.export_user_data()', 'execute') then
    raise exception 'anon can execute export_user_data';
  end if;
  def := pg_get_functiondef('public.export_user_data()'::regprocedure);
  if position('reporterName' in def) = 0 or position('goodFaith' in def) = 0
     or position('''groundRef''' in def) = 0 then
    raise exception 'export_user_data lacks the new fields';
  end if;
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000051c1","role":"authenticated"}', true);
  v := public.export_user_data();
  perform set_config('request.jwt.claims', '', true);
  if (v ->> 'schema') <> '3' then
    raise exception 'export_user_data did not return schema 3: %', left(v::text, 200);
  end if;
  foreach k in array array['reportsFiled', 'moderationStatements', 'passGrants'] loop
    if jsonb_typeof(v -> k) <> 'array' then
      raise exception 'export_user_data key % is not an array', k;
    end if;
  end loop;

  raise notice 'moderation and admin decisions self-check passed';
end;
$chk$;

notify pgrst, 'reload schema';
