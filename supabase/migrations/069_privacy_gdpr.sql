-- 069_privacy_gdpr.sql
--
-- Privacy and GDPR (T1118, ROADMAP C9): one scheduled retention job, an
-- account deletion that also removes or anonymises the rows that do not
-- cascade, and an export that carries every table with a traveller's rows.
-- docs/legal/ARTICLE30.md section 2a lists every table with its retention
-- line; this file is the code behind the lines that say "swept daily".
--
-- WHAT IT ADDS
--
--   1. privacy_rows(table, where, strip, uid)
--        Internal helper (no client grant). The caller's rows of one table as
--        a jsonb array, with the named keys removed, or [] when the table is
--        not there (a project that has not pasted that migration yet).
--
--   2. export_user_data(), schema 4
--        048/051's schema 3 body is kept as it is, renamed to
--        export_user_data_v3 with no client grant, and the new function adds
--        the keys schema 3 never had: settings, savedTrips, askChats,
--        accountThings, emailPrefs, emailLog, uploads, groupTrips (owned,
--        memberships, votes, budgets, expenses, settlements, payLinks),
--        sharedLists (owned, memberships, items, votes), friendVisibility,
--        joinRequests, coplanLinks, and waitlist (the sign-up with the
--        account's own address, if any). Other travellers' ids are stripped
--        from every row, as schema 3 already did for friends and co-planners.
--        Still no parameter: auth.uid() only.
--
--   3. privacy_erase_account(), a BEFORE DELETE trigger on auth.users
--        Runs for delete_user() (005, the traveller's own button) and for
--        admin_delete_user (064) alike, before the cascades:
--          waitlist_signups   the row with the account's address is deleted
--          feedback           the traveller's messages are deleted (text and
--                             reply address are theirs)
--          content_reports    reports they filed keep the DSA record (reason,
--                             decision) but lose the contact address and the
--                             reporter name; plan_owner is cleared on reports
--                             about their guides
--          admin_audit_log    rows about the account keep action, reason and
--                             the opaque account id (accountability, Art.
--                             17(3)(e)), and lose the email and handle in
--                             detail
--        Everything else either cascades (trips, plans, settings, chats,
--        groups, lists, uploads, email prefs and log, AI usage) or is set to
--        null by its foreign key (pass_grants for VAT, paywall_events,
--        edge_errors, parse_failures, moderation_statements). Uploaded files
--        are queued by 061's after-delete trigger.
--
--   4. privacy_retention_sweep(), scheduled daily at 03:23 UTC
--        Deletes what is past its retention line, table by table, each one
--        skipped when the table is not there, and returns the counts:
--          ai_plan_cache           older than 7 days (T319-c)
--          paywall_events          older than 180 days (022's prune)
--          edge_errors             older than 90 days (040's line, also for a
--                                  quiet week with no writes)
--          parse_failures          older than 30 days (042's line, the same)
--          guide_views             days before yesterday (045's line)
--          coplan_link_attempts    older than 7 days (rate limit only)
--          ai_model_events         older than 180 days
--          ai_cache_events,
--          ai_cap_events           older than 400 days (not personal; a year
--                                  over year look)
--          email_log               older than 400 days
--          waitlist_signups        never confirmed after 30 days (066's purge)
--          feedback                older than 2 years
--          content_reports,
--          moderation_statements   051's purge (12 months after a decision,
--                                  3 years for statements)
--          admin_audit_log         older than 3 years
--        Service role only. The day counts are drafts for the owner's legal
--        review (register row T1118-a); each is one constant below.
--
-- Not swept on purpose: sync tombstones (day_plans, account_things,
-- ask_chats deleted_at) stay until the account goes, because the merge rule
-- of T1104 needs them to stop a deleted thing coming back from another
-- device. Unsubscribed waitlist addresses stay as the suppression list.
--
-- ORDER. Paste in the Supabase SQL editor after 067 (and 068). Never
-- `db push` against the live project. Pasting twice is safe. Look for
-- "privacy self-check passed". DOWN: 069_privacy_gdpr_down.sql.
--
-- THE APP WITHOUT THIS FILE. The export answers schema 3 and the app adds
-- askChats and accountThings itself, as before; deletion works as before,
-- without the waitlist, feedback and audit clean-up.

-- ===========================================================================
-- 1. privacy_rows
-- ===========================================================================
create or replace function public.privacy_rows(p_table text, p_where text, p_strip text[], p_uid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if to_regclass('public.' || p_table) is null then
    return '[]'::jsonb;
  end if;
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t) - $2), ''[]''::jsonb) from public.%I t where %s',
    p_table, p_where)
    into v using p_uid, coalesce(p_strip, '{}'::text[]);
  return v;
end;
$$;

revoke all on function public.privacy_rows(text, text, text[], uuid) from public, anon, authenticated;

-- ===========================================================================
-- 2. export_user_data, schema 4
-- ===========================================================================
-- Keep schema 3 under its own name once. A second paste finds v3 there and
-- leaves it alone.
do $ren$
begin
  if to_regprocedure('public.export_user_data_v3()') is null then
    alter function public.export_user_data() rename to export_user_data_v3;
  end if;
end;
$ren$;

revoke all on function public.export_user_data_v3() from public, anon, authenticated;

create or replace function public.export_user_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_base  jsonb;
  -- Keys that are other travellers' ids, or the caller's own id repeated on
  -- every row. Stripped everywhere. split_among (058) is the list of member
  -- ids an expense is shared between; the RLS suite caught it leaking.
  ids     text[] := array['user_id', 'owner_id', 'invited_by', 'added_by', 'created_by',
                          'paid_by', 'from_user', 'to_user', 'requester_id', 'owner',
                          'decided_by', 'split_among'];
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_signed_in');
  end if;

  v_base := public.export_user_data_v3();
  if v_base ? 'error' then
    return v_base;
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;

  return v_base || jsonb_build_object(
    'schema', 4,

    'settings',     public.privacy_rows('user_settings', 'user_id = $1', ids, v_uid),
    'savedTrips',   public.privacy_rows('saved_trips', 'user_id = $1', ids, v_uid),
    'askChats',     public.privacy_rows('ask_chats', 'user_id = $1', ids, v_uid),
    'accountThings', public.privacy_rows('account_things', 'user_id = $1 and deleted_at is null', ids, v_uid),
    'emailPrefs',   public.privacy_rows('email_prefs', 'user_id = $1', ids, v_uid),
    'emailLog',     public.privacy_rows('email_log', 'user_id = $1', ids, v_uid),
    'uploads',      public.privacy_rows('user_uploads', 'owner = $1', ids, v_uid),

    'groupTrips', jsonb_build_object(
      'owned',       public.privacy_rows('group_trips', 'owner_id = $1', ids, v_uid),
      'memberships', public.privacy_rows('group_trip_members', 'user_id = $1', ids, v_uid),
      'options',     public.privacy_rows('group_trip_options', 'created_by = $1', ids, v_uid),
      'votes',       public.privacy_rows('group_trip_votes', 'user_id = $1', ids, v_uid),
      'budgets',     public.privacy_rows('group_trip_budgets', 'user_id = $1', ids, v_uid),
      'expenses',    public.privacy_rows('group_trip_expenses', 'created_by = $1 or paid_by = $1', ids, v_uid),
      'settlements', public.privacy_rows('group_trip_settlements', 'created_by = $1 or from_user = $1 or to_user = $1', ids, v_uid),
      'payLinks',    public.privacy_rows('pay_links', 'user_id = $1', ids, v_uid)
    ),

    'sharedLists', jsonb_build_object(
      'owned',       public.privacy_rows('shared_lists', 'owner_id = $1', ids, v_uid),
      'memberships', public.privacy_rows('shared_list_members', 'user_id = $1', ids, v_uid),
      'items',       public.privacy_rows('shared_list_items', 'added_by = $1', ids, v_uid),
      'votes',       public.privacy_rows('shared_list_votes', 'user_id = $1', ids, v_uid)
    ),

    'friendVisibility', public.privacy_rows('friend_visibility', 'user_id = $1', ids, v_uid),
    'joinRequests',     public.privacy_rows('trip_join_requests', 'requester_id = $1 or owner_id = $1', ids, v_uid),
    'coplanLinks',      public.privacy_rows('coplan_links', 'created_by = $1', ids, v_uid),

    -- The sign-up with the account's own address. Send bookkeeping is not
    -- the traveller's data and stays out.
    'waitlist', case when to_regclass('public.waitlist_signups') is null or v_email is null
                     then '[]'::jsonb
                     else public.privacy_rows('waitlist_signups',
                            'email = (select lower(u.email) from auth.users u where u.id = $1)',
                            array['last_sent_at', 'send_count'], v_uid) end
  );
end;
$fn$;

revoke all on function public.export_user_data() from public, anon;
grant execute on function public.export_user_data() to authenticated, service_role;

-- ===========================================================================
-- 3. privacy_erase_account: the rows that do not cascade
-- ===========================================================================
create or replace function public.privacy_erase_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(coalesce(old.email, ''));
begin
  if v_email <> '' and to_regclass('public.waitlist_signups') is not null then
    execute 'delete from public.waitlist_signups where email = $1' using v_email;
  end if;

  if to_regclass('public.feedback') is not null then
    execute 'delete from public.feedback where user_id = $1' using old.id;
  end if;

  if to_regclass('public.content_reports') is not null then
    execute 'update public.content_reports
                set contact_email = null, reporter_name = null
              where reporter_id = $1
                and (contact_email is not null or reporter_name is not null)' using old.id;
    execute 'update public.content_reports set plan_owner = null where plan_owner = $1' using old.id;
  end if;

  if to_regclass('public.admin_audit_log') is not null then
    execute 'update public.admin_audit_log
                set detail = detail - array[''email'', ''handle'']
              where target_user = $1
                and (detail ? ''email'' or detail ? ''handle'')' using old.id;
  end if;

  return old;
end;
$$;

revoke all on function public.privacy_erase_account() from public, anon, authenticated;

drop trigger if exists on_auth_user_deleted_privacy on auth.users;
create trigger on_auth_user_deleted_privacy
  before delete on auth.users
  for each row execute function public.privacy_erase_account();

-- ===========================================================================
-- 4. privacy_retention_sweep
-- ===========================================================================
create or replace function public.privacy_retention_sweep()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_out jsonb := '{}'::jsonb;
  n     bigint;
  j     jsonb;
  r     record;
begin
  -- table, timestamp column, keep, extra condition. One line per rule; the
  -- day counts are the ones docs/legal/ARTICLE30.md section 2a states.
  for r in
    select * from (values
      ('ai_plan_cache',        'created_at', interval '7 days',   'true'),
      ('edge_errors',          'at',         interval '90 days',  'true'),
      ('parse_failures',       'at',         interval '30 days',  'true'),
      ('coplan_link_attempts', 'at',         interval '7 days',   'true'),
      ('ai_model_events',      'created_at', interval '180 days', 'true'),
      ('ai_cache_events',      'created_at', interval '400 days', 'true'),
      ('ai_cap_events',        'created_at', interval '400 days', 'true'),
      ('email_log',            'sent_at',    interval '400 days', 'true'),
      ('feedback',             'created_at', interval '2 years',  'true'),
      ('admin_audit_log',      'created_at', interval '3 years',  'true')
    ) as t(tbl, col, keep, cond)
  loop
    if to_regclass('public.' || r.tbl) is not null then
      execute format('delete from public.%I where %I < now() - $1 and %s', r.tbl, r.col, r.cond)
        using r.keep;
      get diagnostics n = row_count;
      v_out := v_out || jsonb_build_object(r.tbl, n);
    end if;
  end loop;

  if to_regclass('public.guide_views') is not null then
    delete from public.guide_views where day < current_date - 1;
    get diagnostics n = row_count;
    v_out := v_out || jsonb_build_object('guide_views', n);
  end if;

  -- The purges earlier migrations already wrote, run from the same job.
  if to_regprocedure('public.prune_paywall_events(integer)') is not null then
    execute 'select public.prune_paywall_events(180)' into n;
    v_out := v_out || jsonb_build_object('paywall_events', n);
  end if;
  if to_regprocedure('public.waitlist_purge(integer)') is not null then
    execute 'select public.waitlist_purge(30)' into n;
    v_out := v_out || jsonb_build_object('waitlist_signups', n);
  end if;
  if to_regprocedure('public.moderation_retention_purge()') is not null then
    execute 'select public.moderation_retention_purge()' into j;
    v_out := v_out || jsonb_build_object('moderation', j);
  end if;

  return v_out || jsonb_build_object('ranAt', now());
end;
$$;

revoke all on function public.privacy_retention_sweep() from public, anon, authenticated;
grant execute on function public.privacy_retention_sweep() to service_role;

-- Daily at 03:23 UTC when pg_cron is on (six minutes after 051's moderation
-- purge). cron.schedule with a name replaces a job of that name.
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('carta_privacy_retention', '23 3 * * *',
                          'select public.privacy_retention_sweep()');
    raise notice 'privacy_retention_sweep scheduled daily at 03:23 UTC through pg_cron';
  else
    raise notice 'pg_cron is not enabled: nothing sweeps on a schedule. Enable pg_cron under Database, Extensions, then paste 069 again, or run '
      'select cron.schedule(''carta_privacy_retention'', ''23 3 * * *'', ''select public.privacy_retention_sweep()'');';
  end if;
end;
$cron$;

-- ===========================================================================
-- Self-check: runs on apply
-- ===========================================================================
do $chk$
declare
  v_def text;
begin
  if to_regprocedure('public.export_user_data_v3()') is null then
    raise exception 'privacy self-check: export_user_data_v3 is missing';
  end if;
  if has_function_privilege('authenticated', 'public.export_user_data_v3()', 'execute') then
    raise exception 'privacy self-check: authenticated can still call export_user_data_v3';
  end if;
  if not has_function_privilege('authenticated', 'public.export_user_data()', 'execute') then
    raise exception 'privacy self-check: authenticated cannot call export_user_data';
  end if;
  if has_function_privilege('anon', 'public.export_user_data()', 'execute')
     or has_function_privilege('authenticated', 'public.privacy_retention_sweep()', 'execute')
     or has_function_privilege('authenticated', 'public.privacy_rows(text, text, text[], uuid)', 'execute') then
    raise exception 'privacy self-check: a client role can call an internal function';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_deleted_privacy'
                  and tgrelid = 'auth.users'::regclass) then
    raise exception 'privacy self-check: the erase trigger is missing';
  end if;
  select array_to_string(p.proconfig, ',') into v_def
    from pg_proc p where p.oid = 'public.privacy_retention_sweep()'::regprocedure;
  if coalesce(v_def, '') not like '%search_path=%' then
    raise exception 'privacy self-check: privacy_retention_sweep has no pinned search_path';
  end if;
  raise notice 'privacy self-check passed (export schema 4, erase trigger, retention sweep)';
end;
$chk$;
