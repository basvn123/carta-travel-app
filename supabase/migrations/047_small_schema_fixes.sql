-- 047_small_schema_fixes.sql
--
-- Three small schema fixes that three earlier tasks could not make because no
-- migration was allowed to them. Written by T284 (register rows T083-b,
-- T219-c and T217-c). Nothing here changes a row that exists today.
--
-- 1. CLIENT CRASHES ARE STORED (T083-b).
--    Since T083 the app's ErrorBoundary calls
--    log_edge_error('app', 'client_crash', 'client') once per render crash.
--    040 checks fn and code against two closed lists that hold neither word,
--    in the table and again in the writer, so the call is dropped without a
--    row. This file adds 'app' to the fn list and 'client_crash' to the code
--    list, in both places, and binds the two together: a row with fn 'app'
--    must have code 'client_crash' and origin 'client', and the AI functions
--    may never carry 'client_crash'. A forged ('plan-day', 'client_crash') or
--    ('app', 'ai_timeout') call is dropped as before. Nothing about the crash
--    is stored beyond what 040 already stores for an AI failure: who, when,
--    and the two words. No message, no stack, no page.
--
--    WHERE A CRASH SHOWS. Not on the AI failures card. A render crash is a
--    fault in this build of the app, an AI failure is a fault in a model or a
--    booking site, and the card's headline number ("Failures", "Travellers
--    affected") would mix the two. So admin_edge_errors keeps its every
--    existing key AI only (fn in plan-day, suggest-city, parse-booking), which
--    leaves EdgeErrors.jsx correct with no app change, and gains one new key,
--    crashes: { total, users, lastAt, daily: [{ day, n }] }, over the same
--    window. A card that draws it is app work (register row T284-b).
--    The writer's caps are shared: 100 rows per account per day and 50,000 a
--    day in total cover crashes and AI failures together, which is right for
--    a telemetry table whose only job is to show that something is wrong.
--
-- 2. 'data' FEEDBACK AND 'cycle' OVERRIDES (T219-c).
--    public.feedback.kind gains 'data', so a report about a wrong price, a
--    bad photo or a missing item can be filtered on its own in the inbox
--    (docs/FEEDBACK-LOOP.md, step two). submit_feedback (017) silently turned
--    any kind outside its list into 'other', so its list gains 'data' too;
--    otherwise the widened check would admit a value no client could send.
--    content_overrides.layer gains 'cycle', the one shortlistable layer with
--    a page and no override path, and admin_set_override (045's body, the
--    current one) accepts it. The app does not send kind 'data' yet and the
--    override console has no cycle layer yet; both are T219-b, the build task.
--
-- 3. AN AUDITED WAY TO MOVE A PASS'S EXPIRY (T217-c).
--    admin_adjust_expiry(p_user, p_days) moves entitlements.expires_at by a
--    whole number of days, forward or back, and nothing else: tier and
--    period_start are kept, so the AI allowance is NOT reset (admin_set_tier
--    resets it, which is why docs/REFUND_SOP.md step 4 used a bare UPDATE in
--    the SQL editor). It writes one admin_audit_log row, action
--    'adjust_expiry', with the previous and new expiry, and sets source to
--    'manual' as the SOP's update did. It refuses with an error word rather
--    than raising, like every admin_* function:
--      forbidden / slow_down   admin_guard('destructive') said no
--      bad_days                null, zero, or more than 1095 either way
--      not_found               no such account
--      no_live_pass            free, or the pass has already lapsed
--      would_expire            the new expiry is not in the future; revoke
--                              with admin_set_tier(user, 'free') instead
--      beyond_horizon          more than 1095 days from now
--    1095 is the three-year ceiling 044 calls pass_horizon_days(). It is
--    written out here, not called, because 044 pastes after this file
--    (stage 10) and nothing in 047 may depend on what 044 creates.
--    The guard tier is 'destructive', as for admin_set_tier. admin_guard's
--    own destructive budget (10 a minute) counts a fixed list of five action
--    names from 015 and 'adjust_expiry' is not in it; the overall budget of
--    60 logged actions a minute applies. Changing admin_guard is out of scope.
--
-- WHAT IS NOT CHANGED. admin_guard, admin_log, admin_health and every
-- function 044 creates or replaces (ai_consume, ai_refund, pass_can_buy,
-- grant_pass, admin_paywall_funnel, admin_margin, oss_threshold_check,
-- admin_oss_threshold, pass_horizon_days) are untouched, and nothing below
-- reads a table or calls a function 044 creates.
--
-- ORDER. Paste in the Supabase SQL editor for ntssxktaduxzpsmejwyv by hand,
-- never `db push`, AFTER 045 and 046 (_OPEN-MASTER stage 2.2, row 16). It
-- needs 007 (entitlements), 015 (admin_guard), 017 (feedback), 018 and 043
-- (content_overrides), 040 (edge_errors) and 045 (admin_set_override with
-- country), and its self-check names whichever is missing. 044 may come
-- before or after it. Look for the notice "small schema fixes self-check
-- passed".
--
-- RE-PASTE TRAPS. Re-pasting 017 puts submit_feedback back without 'data'
-- (the table check keeps it); re-pasting 040 puts log_edge_error and
-- admin_edge_errors back to the AI-only lists (crashes are dropped again);
-- re-pasting 045 puts admin_set_override back without 'cycle'. Paste 047
-- again after any of them.
--
-- DOWN (paste in this order). Steps 1 to 3 delete the rows the old checks
-- would refuse, so they are one-way for those rows: crash rows in
-- edge_errors, 'cycle' override rows (export them first if they matter), and
-- 'data' feedback rows, which are relabelled 'bug' rather than deleted.
-- Audit rows written by admin_adjust_expiry stay, as every audit row does.
--
--   -- 1. edge_errors back to 040
--   delete from public.edge_errors where fn = 'app' or code = 'client_crash';
--   alter table public.edge_errors drop constraint if exists edge_errors_crash_pair_check;
--   alter table public.edge_errors drop constraint if exists edge_errors_fn_check;
--   alter table public.edge_errors add constraint edge_errors_fn_check
--     check (fn in ('plan-day', 'suggest-city', 'parse-booking'));
--   alter table public.edge_errors drop constraint if exists edge_errors_code_check;
--   alter table public.edge_errors add constraint edge_errors_code_check
--     check (code in ('ai_timeout', 'ai_bad_output', 'url_unreachable', 'ai_error'));
--   -- then paste the log_edge_error and admin_edge_errors blocks of
--   -- 040_edge_errors.sql (only those two, not the whole file)
--
--   -- 2. feedback back to 017
--   update public.feedback set kind = 'bug' where kind = 'data';
--   alter table public.feedback drop constraint if exists feedback_kind_check;
--   alter table public.feedback add constraint feedback_kind_check
--     check (kind in ('bug', 'idea', 'other'));
--   -- then paste the submit_feedback block of 017_admin_analytics.sql
--   -- (only that function: the rest of 017 would undo 033 and 034)
--
--   -- 3. content_overrides back to 018
--   delete from public.content_overrides where layer = 'cycle';
--   alter table public.content_overrides drop constraint if exists content_overrides_layer_check;
--   alter table public.content_overrides add constraint content_overrides_layer_check
--     check (layer in ('beach', 'lake', 'mountain', 'trail', 'dest'));
--   -- then paste the admin_set_override block of 045_admin_followups.sql
--   -- (the create or replace and its two grant lines, not the drops above it)
--
--   -- 4. the expiry RPC
--   drop function if exists public.admin_adjust_expiry(uuid, int);
--
--   notify pgrst, 'reload schema';

-- ===========================================================================
-- 1. Client crashes in edge_errors (T083-b)
-- ===========================================================================
alter table public.edge_errors drop constraint if exists edge_errors_fn_check;
alter table public.edge_errors add constraint edge_errors_fn_check
  check (fn in ('plan-day', 'suggest-city', 'parse-booking', 'app'));

alter table public.edge_errors drop constraint if exists edge_errors_code_check;
alter table public.edge_errors add constraint edge_errors_code_check
  check (code in ('ai_timeout', 'ai_bad_output', 'url_unreachable', 'ai_error', 'client_crash'));

-- 'app' and 'client_crash' only ever travel together, and a crash is always
-- reported by the client. Every row 040 could write satisfies this.
alter table public.edge_errors drop constraint if exists edge_errors_crash_pair_check;
alter table public.edge_errors add constraint edge_errors_crash_pair_check
  check ((fn = 'app') = (code = 'client_crash') and (fn <> 'app' or origin = 'client'));

-- 040's writer with the two lists widened and the pair rule added. Every
-- other line is 040's.
create or replace function public.log_edge_error(
  p_fn       text,
  p_code     text,
  p_origin   text default 'edge',
  p_http     int  default null,
  p_upstream int  default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_mine bigint;
  v_n    bigint;
begin
  -- The three AI functions refuse a guest before they ever reach Gemini or a
  -- booking site, so a failure worth recording always has a session. A
  -- signed-out visitor's crash is not recorded either (T083).
  if v_uid is null then
    return;
  end if;
  if p_fn is null or p_fn not in ('plan-day', 'suggest-city', 'parse-booking', 'app')
     or p_code is null
     or p_code not in ('ai_timeout', 'ai_bad_output', 'url_unreachable', 'ai_error', 'client_crash')
     or coalesce(p_origin, 'edge') not in ('edge', 'client') then
    return;
  end if;
  -- A crash is ('app', 'client_crash', 'client') and nothing else is.
  if (p_fn = 'app') <> (p_code = 'client_crash')
     or (p_fn = 'app' and coalesce(p_origin, 'edge') <> 'client') then
    return;
  end if;

  -- Per user: a traveller retrying a failing day plan all afternoon is a few
  -- dozen rows. 100 a day stops one account filling the table.
  select count(*) into v_mine
    from public.edge_errors
   where user_id = v_uid and at > now() - interval '1 day';
  if v_mine >= 100 then
    return;
  end if;

  -- Global, tested by the statement that increments it (022's pattern), so
  -- two concurrent callers cannot both claim the last slot.
  insert into public.edge_error_daily_total as d (day, n)
    values (current_date, 1)
    on conflict (day) do update
      set n = d.n + 1
      where d.n < 50000
    returning n into v_n;
  if v_n is null then
    return;
  end if;

  insert into public.edge_errors (user_id, fn, code, origin, http_status, upstream_status)
  values (
    v_uid,
    p_fn,
    p_code,
    coalesce(p_origin, 'edge'),
    case when p_http between 100 and 599 then p_http end,
    case when p_upstream between 100 and 599 then p_upstream end
  );

  -- Retention, bounded so one call never does a large delete.
  delete from public.edge_errors
   where id in (
     select id from public.edge_errors
      where at < now() - interval '90 days'
      order by at
      limit 500);
  delete from public.edge_error_daily_total
   where day < current_date - 400;
exception when others then
  -- Telemetry is never worth an error on the traveller's screen.
  return;
end;
$$;

-- 040's reader. Every key it had now counts AI failures only, so the AI
-- failures card reads what its title says; crashes come back under their own
-- key. Read tier, counts only, as before.
create or replace function public.admin_edge_errors(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err   text := public.admin_guard('read');
  v_days  int;
  v_since timestamptz;
  v_total bigint := 0;
  v_users bigint := 0;
  v_last  timestamptz;
  v_codes jsonb;
  v_fns   jsonb;
  v_up    jsonb;
  v_daily jsonb;
  c_total bigint := 0;
  c_users bigint := 0;
  c_last  timestamptz;
  c_daily jsonb;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  -- Never past the retention period: a 365-day window would read as a year
  -- of data when it is 90 days of it.
  v_days  := least(greatest(coalesce(p_days, 30), 1), 90);
  v_since := now() - make_interval(days => v_days);

  select count(*), count(distinct user_id), max(at)
    into v_total, v_users, v_last
    from public.edge_errors
   where at > v_since and fn in ('plan-day', 'suggest-city', 'parse-booking');

  select coalesce(jsonb_agg(jsonb_build_object(
           'code', code, 'n', n, 'users', users, 'client', client)
           order by n desc, code), '[]'::jsonb)
    into v_codes
    from (
      select code, count(*) as n, count(distinct user_id) as users,
             count(*) filter (where origin = 'client') as client
        from public.edge_errors
       where at > v_since and fn in ('plan-day', 'suggest-city', 'parse-booking')
       group by code
    ) s;

  select coalesce(jsonb_agg(jsonb_build_object('fn', fn, 'code', code, 'n', n)
           order by fn, n desc, code), '[]'::jsonb)
    into v_fns
    from (
      select fn, code, count(*) as n
        from public.edge_errors
       where at > v_since and fn in ('plan-day', 'suggest-city', 'parse-booking')
       group by fn, code
    ) s;

  -- Which upstream status is behind ai_error and url_unreachable: a run of
  -- 429s from Gemini and a run of 403s from one booking site are different
  -- problems with different fixes.
  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'status', status, 'n', n)
           order by n desc, code, status), '[]'::jsonb)
    into v_up
    from (
      select code, upstream_status as status, count(*) as n
        from public.edge_errors
       where at > v_since and upstream_status is not null
         and fn in ('plan-day', 'suggest-city', 'parse-booking')
       group by code, upstream_status
    ) s;

  -- Zero-filled, so a quiet day reads as a zero rather than a gap.
  select coalesce(jsonb_agg(jsonb_build_object(
           'day',         d::date,
           'n',           coalesce(c.n, 0),
           'timeout',     coalesce(c.timeout, 0),
           'badOutput',   coalesce(c.bad, 0),
           'unreachable', coalesce(c.unreach, 0),
           'error',       coalesce(c.err, 0))
           order by d), '[]'::jsonb)
    into v_daily
    from generate_series(v_since::date, current_date, interval '1 day') d
    left join (
      select at::date as day,
             count(*) as n,
             count(*) filter (where code = 'ai_timeout')      as timeout,
             count(*) filter (where code = 'ai_bad_output')   as bad,
             count(*) filter (where code = 'url_unreachable') as unreach,
             count(*) filter (where code = 'ai_error')        as err
        from public.edge_errors
       where at > v_since and fn in ('plan-day', 'suggest-city', 'parse-booking')
       group by 1
    ) c on c.day = d::date;

  -- Client crashes (T083), apart from the AI failures and zero-filled the
  -- same way.
  select count(*), count(distinct user_id), max(at)
    into c_total, c_users, c_last
    from public.edge_errors
   where at > v_since and fn = 'app';

  select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'n', coalesce(c.n, 0))
           order by d), '[]'::jsonb)
    into c_daily
    from generate_series(v_since::date, current_date, interval '1 day') d
    left join (
      select at::date as day, count(*) as n
        from public.edge_errors
       where at > v_since and fn = 'app'
       group by 1
    ) c on c.day = d::date;

  return jsonb_build_object(
    'days',          v_days,
    'retentionDays', 90,
    'total',         v_total,
    'users',         v_users,
    'lastAt',        v_last,
    'byCode',        v_codes,
    'byFunction',    v_fns,
    'byUpstream',    v_up,
    'daily',         v_daily,
    'crashes',       jsonb_build_object(
                       'total',  c_total,
                       'users',  c_users,
                       'lastAt', c_last,
                       'daily',  c_daily)
  );
end;
$$;

revoke all on function public.log_edge_error(text, text, text, int, int) from public, anon;
grant execute on function public.log_edge_error(text, text, text, int, int) to authenticated, service_role;
revoke all on function public.admin_edge_errors(int) from public, anon;
grant execute on function public.admin_edge_errors(int) to authenticated, service_role;

-- ===========================================================================
-- 2. 'data' feedback and 'cycle' overrides (T219-c)
-- ===========================================================================
alter table public.feedback drop constraint if exists feedback_kind_check;
alter table public.feedback add constraint feedback_kind_check
  check (kind in ('bug', 'idea', 'other', 'data'));

-- 017's writer with 'data' in its list. Every other line is 017's.
create or replace function public.submit_feedback(
  p_message text,
  p_kind    text default 'other',
  p_email   text default null,
  p_context jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg   text := trim(coalesce(p_message, ''));
  v_kind  text := coalesce(nullif(trim(coalesce(p_kind, '')), ''), 'other');
  v_email text := nullif(trim(coalesce(p_email, '')), '');
  n       int;
begin
  if v_msg = '' or char_length(v_msg) > 4000 then
    return jsonb_build_object('error', 'bad_message');
  end if;
  if v_kind not in ('bug', 'idea', 'other', 'data') then
    v_kind := 'other';
  end if;
  if v_email is not null and char_length(v_email) > 320 then
    return jsonb_build_object('error', 'bad_email');
  end if;
  if p_context is not null and pg_column_size(p_context) > 4096 then
    p_context := null;
  end if;

  -- Per account: five an hour is far more than anybody with something to say
  -- will send, and far less than a script wants.
  if auth.uid() is not null then
    select count(*) into n from public.feedback
     where user_id = auth.uid() and created_at > now() - interval '1 hour';
    if n >= 5 then
      return jsonb_build_object('error', 'too_many');
    end if;
  end if;

  -- Globally, so the signed-out path cannot be used to flood the table by
  -- anybody who clears their cookies between posts.
  select count(*) into n from public.feedback
   where created_at > now() - interval '1 hour';
  if n >= 200 then
    return jsonb_build_object('error', 'too_many');
  end if;

  insert into public.feedback (user_id, email, kind, message, context)
  values (
    auth.uid(),
    coalesce(v_email, (select u.email from auth.users u where u.id = auth.uid())),
    v_kind, v_msg, p_context
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.submit_feedback(text, text, text, jsonb) from public;
grant execute on function public.submit_feedback(text, text, text, jsonb) to anon, authenticated, service_role;

alter table public.content_overrides drop constraint if exists content_overrides_layer_check;
alter table public.content_overrides add constraint content_overrides_layer_check
  check (layer in ('beach', 'lake', 'mountain', 'trail', 'dest', 'cycle'));

-- 045's writer with 'cycle' in its layer list. Every other line is 045's.
-- Same seven-argument signature, so this replaces it in place and no second
-- overload can make a PostgREST call ambiguous.
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

-- ===========================================================================
-- 3. admin_adjust_expiry (T217-c)
-- ===========================================================================
create or replace function public.admin_adjust_expiry(p_user uuid, p_days int)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_err text := public.admin_guard('destructive');
  e     public.entitlements%rowtype;
  v_new timestamptz;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  -- 1095 days is 044's pass_horizon_days(), written out (see the header).
  if p_days is null or p_days = 0 or p_days < -1095 or p_days > 1095 then
    return jsonb_build_object('error', 'bad_days');
  end if;
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then
    return jsonb_build_object('error', 'not_found');
  end if;

  -- Locked, so a webhook granting a pass at the same moment either lands
  -- before this read or waits for this write.
  select * into e from public.entitlements where user_id = p_user for update;
  if e.user_id is null or e.tier = 'free' or e.expires_at is null or e.expires_at <= now() then
    return jsonb_build_object('error', 'no_live_pass');
  end if;

  v_new := e.expires_at + make_interval(days => p_days);
  if v_new <= now() then
    return jsonb_build_object('error', 'would_expire');
  end if;
  if v_new > now() + interval '1095 days' then
    return jsonb_build_object('error', 'beyond_horizon');
  end if;

  -- Only the date moves. tier and period_start stay, so the allowance period
  -- (and with it the AI quota already used) is untouched.
  update public.entitlements
     set expires_at = v_new,
         source     = 'manual',
         updated_at = now()
   where user_id = p_user;

  perform public.admin_log('adjust_expiry', p_user,
    jsonb_build_object(
      'days',     p_days,
      'previous', jsonb_build_object(
                    'tier',        e.tier,
                    'expiresAt',   e.expires_at,
                    'periodStart', e.period_start,
                    'source',      e.source),
      'new',      jsonb_build_object(
                    'tier',        e.tier,
                    'expiresAt',   v_new,
                    'periodStart', e.period_start,
                    'source',      'manual')));

  return jsonb_build_object(
    'ok',                true,
    'tier',              e.tier,
    'expiresAt',         v_new,
    'previousExpiresAt', e.expires_at);
end;
$$;

revoke all on function public.admin_adjust_expiry(uuid, int) from public, anon;
grant execute on function public.admin_adjust_expiry(uuid, int) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ===========================================================================
-- Self-check: runs on apply. Every probe row is inserted inside a block that
-- is rolled back on purpose, so nothing is left behind.
-- ===========================================================================
do $$
declare
  f      text;
  cfg    text[];
  v_mark bigint;
  v_n    int;
  r      jsonb;
begin
  -- Prerequisites, named so a paste in the wrong order says what is missing.
  if to_regclass('public.edge_errors') is null then
    raise exception 'public.edge_errors is missing; paste 040 first';
  end if;
  if to_regclass('public.feedback') is null then
    raise exception 'public.feedback is missing; paste 017 first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'content_overrides'
                    and column_name = 'country') then
    raise exception 'content_overrides has no country column; paste 045 first';
  end if;
  select count(*) into v_n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'admin_set_override';
  if v_n <> 1 then
    raise exception 'admin_set_override has % overloads; exactly one (045''s seven-argument form) is expected', v_n;
  end if;

  -- 1. The crash row is admitted, a forged pair is not.
  begin
    insert into public.edge_errors (fn, code, origin) values ('app', 'client_crash', 'client');
    raise exception 't284_probe_ok';
  exception when others then
    if sqlerrm <> 't284_probe_ok' then
      raise exception 'edge_errors refuses a client crash row: %', sqlerrm;
    end if;
  end;
  foreach f in array array['plan-day|client_crash|client', 'app|ai_timeout|client', 'app|client_crash|edge'] loop
    begin
      insert into public.edge_errors (fn, code, origin)
      values (split_part(f, '|', 1), split_part(f, '|', 2), split_part(f, '|', 3));
      raise exception 't284_probe_admitted';
    exception
      when check_violation then null;
      when others then
        if sqlerrm = 't284_probe_admitted' then
          raise exception 'edge_errors admitted the forged row %', f;
        end if;
        raise;
    end;
  end loop;

  -- The writer still writes nothing without a session, crash or not.
  select coalesce(max(id), 0) into v_mark from public.edge_errors;
  perform public.log_edge_error('app', 'client_crash', 'client', null, null);
  if exists (select 1 from public.edge_errors where id > v_mark) then
    raise exception 'log_edge_error wrote a crash row with no session';
  end if;
  if position('client_crash' in (select prosrc from pg_proc
       where oid = 'public.log_edge_error(text,text,text,int,int)'::regprocedure)) = 0 then
    raise exception 'log_edge_error does not know client_crash';
  end if;
  if (public.admin_edge_errors(7) ->> 'error') is null then
    raise exception 'admin_edge_errors answered a caller who is not an admin';
  end if;
  if position('''crashes''' in (select prosrc from pg_proc
       where oid = 'public.admin_edge_errors(int)'::regprocedure)) = 0 then
    raise exception 'admin_edge_errors has no crashes key';
  end if;

  -- 2. 'data' feedback and 'cycle' overrides are admitted, a stray value is not.
  begin
    insert into public.feedback (kind, message) values ('data', 'T284 self-check probe');
    insert into public.content_overrides (layer, item_id, patch, status, review_by, author_note)
    values ('cycle', 't284_probe', '{}'::jsonb, 'temporary', now() + interval '1 day',
            'T284 self-check probe, rolled back.');
    raise exception 't284_probe_ok';
  exception when others then
    if sqlerrm <> 't284_probe_ok' then
      raise exception 'feedback kind data or override layer cycle is refused: %', sqlerrm;
    end if;
  end;
  begin
    insert into public.feedback (kind, message) values ('nonsense', 'T284 self-check probe');
    raise exception 't284_probe_admitted';
  exception
    when check_violation then null;
    when others then
      if sqlerrm = 't284_probe_admitted' then
        raise exception 'feedback admitted kind nonsense';
      end if;
      raise;
  end;
  begin
    insert into public.content_overrides (layer, item_id, patch, status, review_by, author_note)
    values ('nonsense', 't284_probe', '{}'::jsonb, 'temporary', now() + interval '1 day',
            'T284 self-check probe, rolled back.');
    raise exception 't284_probe_admitted';
  exception
    when check_violation then null;
    when others then
      if sqlerrm = 't284_probe_admitted' then
        raise exception 'content_overrides admitted layer nonsense';
      end if;
      raise;
  end;
  if position('''data''' in (select prosrc from pg_proc
       where oid = 'public.submit_feedback(text,text,text,jsonb)'::regprocedure)) = 0 then
    raise exception 'submit_feedback does not know kind data';
  end if;
  if position('''cycle''' in (select prosrc from pg_proc
       where oid = 'public.admin_set_override(text,text,jsonb,text,text,timestamptz,text)'::regprocedure)) = 0 then
    raise exception 'admin_set_override does not know layer cycle';
  end if;
  if position('country' in (select prosrc from pg_proc
       where oid = 'public.admin_set_override(text,text,jsonb,text,text,timestamptz,text)'::regprocedure)) = 0 then
    raise exception 'admin_set_override lost 045''s country handling';
  end if;

  -- 3. The expiry RPC: guarded, definer, pinned, closed to visitors.
  foreach f in array array[
    'public.log_edge_error(text,text,text,int,int)',
    'public.admin_edge_errors(int)',
    'public.submit_feedback(text,text,text,jsonb)',
    'public.admin_set_override(text,text,jsonb,text,text,timestamptz,text)',
    'public.admin_adjust_expiry(uuid,int)'
  ] loop
    if not (select prosecdef from pg_proc where oid = f::regprocedure::oid) then
      raise exception '% is not SECURITY DEFINER', f;
    end if;
    select proconfig into cfg from pg_proc where oid = f::regprocedure::oid;
    if cfg is null or not ('search_path=""' = any(cfg)) then
      raise exception '% does not pin search_path to empty (proconfig %)', f, cfg;
    end if;
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'authenticated cannot execute %', f;
    end if;
  end loop;
  foreach f in array array[
    'public.log_edge_error(text,text,text,int,int)',
    'public.admin_edge_errors(int)',
    'public.admin_set_override(text,text,jsonb,text,text,timestamptz,text)',
    'public.admin_adjust_expiry(uuid,int)'
  ] loop
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'anon can execute %', f;
    end if;
  end loop;
  if not has_function_privilege('anon', 'public.submit_feedback(text,text,text,jsonb)', 'execute') then
    raise exception 'anon lost execute on submit_feedback; the signed-out feedback form needs it';
  end if;
  if position('admin_guard(''destructive'')' in (select prosrc from pg_proc
       where oid = 'public.admin_adjust_expiry(uuid,int)'::regprocedure)) = 0 then
    raise exception 'admin_adjust_expiry does not call admin_guard(''destructive'')';
  end if;
  -- The point of the function: it never assigns period_start or tier.
  if (select prosrc from pg_proc
       where oid = 'public.admin_adjust_expiry(uuid,int)'::regprocedure)
     ~ 'update\s+public\.entitlements[^;]*\m(period_start|tier)\s*=' then
    raise exception 'admin_adjust_expiry assigns period_start or tier; it must move the date only';
  end if;
  -- From the SQL editor there is no session, so the guard must refuse.
  r := public.admin_adjust_expiry('00000000-0000-0000-0000-000000000000'::uuid, 1);
  if coalesce(r ->> 'error', '') <> 'forbidden' then
    raise exception 'admin_adjust_expiry answered % to a caller who is not an admin', r;
  end if;

  raise notice 'small schema fixes self-check passed';
end;
$$;
