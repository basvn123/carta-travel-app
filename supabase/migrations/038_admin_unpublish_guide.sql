-- 038_admin_unpublish_guide.sql
--
-- The takedown: admin_unpublish_guide(plan_id, reason). A moderator takes a
-- public guide out of the gallery. The plan stays in the owner's account.
--
-- WHY UNPUBLISH AND NEVER DELETE. A public guide is a trip plan its owner
-- chose to show. Taking it off the gallery is a moderation decision about
-- what Carta hosts in public. Deleting the row would be a different act:
-- destroying somebody's itinerary, their stops and their dates, which they
-- still own and are entitled to keep and to export (024). Conflating the two
-- is wrong, and under the GDPR it is also an erasure nobody asked for. So
-- this function changes one column on one row and deletes nothing. The
-- self-check below refuses to pass if the word "delete" ever appears in its
-- body.
--
-- WHAT IT SETS. visibility goes from 'public' to 'private', the value 011
-- gives every new plan and the one the app already shows as "only me". Not
-- 'friends' or 'link': whatever the plan was before it was published is not
-- recorded anywhere, and 'private' is the only value that cannot widen the
-- audience. The owner's own read path is RLS on trip_plans ("auth.uid() =
-- user_id", 002, widened for co-planners in 020 and 023), which does not look
-- at visibility, so the owner keeps reading and editing the plan exactly as
-- before.
--
-- published_at IS CLEARED, NOT KEPT. 019's trigger stamps it when a plan
-- becomes public and clears it when it stops being public, and the gallery's
-- partial index and ordering rely on "published_at is set only while
-- public". The owner's own "make private" goes through the same trigger, so
-- a takedown leaves the row in exactly the state an owner's unpublish would.
-- The old value is not lost: it is in the audit row under previous. No other
-- column is written. updated_at is not touched (no trigger on trip_plans
-- sets it), nor label, user_id, created_at, the stops, the day plan or any
-- share link.
--
-- THE CO-PLANNER TRIGGER, and why this file re-creates it. 020's
-- guard_coplanner_write pins visibility, published_at and user_id back to
-- their old values whenever the writer (auth.uid()) is not the plan's owner.
-- An admin is not the owner, so a plain UPDATE from this function would be
-- silently undone and the guide would stay public while the function said
-- ok. The test proves that with a copy of this function that skips the
-- marker below. The trigger is therefore re-created here with one
-- exception: while the transaction-local setting carta.takedown_plan equals
-- the row's id, visibility may move to 'private' (and only to 'private'),
-- and published_at is left to 019's stamp trigger. user_id stays pinned
-- always. admin_unpublish_guide sets the marker just before its UPDATE and
-- clears it just after. PostgREST gives a client no way to set an arbitrary
-- setting, and even a session that could set it could only make a plan it
-- already co-plans private.
--
-- Note on trigger order: Postgres fires BEFORE triggers in name order, so
-- trip_plans_guard_coplanner runs before trip_plans_stamp_published (020's
-- comment says the reverse). With the exception above that order is what
-- makes it work: the guard lets 'private' through, then the stamp clears
-- published_at.
--
-- If 020 is not applied, the function below is created but no trigger calls
-- it, and the takedown works the same. If 020 is pasted AFTER this file, its
-- create or replace puts the old guard back and every takedown then fails
-- loudly with "the plan is still public after the update" rather than
-- claiming success; paste 038 again after it.
--
-- ANSWERS jsonb, never throws on a refusal:
--
--   {"error": "forbidden"}   not an admin (admin_guard)
--   {"error": "slow_down"}   the caller's rate budget (admin_guard)
--   {"error": "bad_reason"}  reason missing, blank after trimming spaces,
--                            tabs and newlines, or over 2000 characters
--   {"error": "not_found"}   no plan with that id (or a null id)
--   {"ok": true, "changed": true, "visibility": "private",
--    "reportsActioned": n}   taken down; n new content_reports rows on the
--                            plan moved to 'actioned'
--   {"ok": true, "changed": false, "visibility": v, "reportsActioned": 0}
--                            the plan was already not public (v is
--                            'private', 'friends' or 'link'). Nothing is
--                            written: no column, no report status, no audit
--                            row. Calling it twice is therefore safe, and a
--                            plan the owner already made private stays
--                            exactly as they left it.
--
-- THE AUDIT ROW. One admin_audit_log row per takedown, action
-- 'unpublish_guide', target_user = the plan's owner (so it shows in that
-- account's history on the Users tab), detail in the 033 shape:
--
--   {"table": "trip_plans", "planId": ..., "label": ..., "reason": ...,
--    "previous": {"visibility": "public", "publishedAt": ...},
--    "new":      {"visibility": "private", "publishedAt": null},
--    "reports":  [ids moved to actioned]}
--
-- Reverting by hand, in the SQL editor (where auth.uid() is null, so the
-- co-planner guard does not pin anything):
--
--   update public.trip_plans set visibility = 'public' where id = '<planId>';
--   update public.trip_plans set published_at = '<previous.publishedAt>'
--    where id = '<planId>';
--
-- The first update restamps published_at to now(); the second puts the
-- original date back (019's trigger leaves it alone on a public to public
-- update). Put the report rows back to 'new' only if the decision itself is
-- being withdrawn.
--
-- THE LINKED REPORTS. The signature is (plan_id, reason), as the plan asks,
-- so a takedown resolves every notice on that guide that is still 'new',
-- whichever row the moderator started from: the guide is down, so each of
-- those notices has been acted on. Their ids go into the audit row, which
-- until T070 is the only record of who decided and when. A no-change call
-- (the plan was already not public) leaves reports as they are, because
-- nothing was done in response to them; closing those is T070's dismiss,
-- together with the statement of reasons. Reports on other guides are never
-- touched.
--
-- GUARD TIER. admin_guard('destructive') (034): the takedown has a live
-- effect the moment it returns. No aal2 check is written in, as with the
-- functions T065 moved; whether live-effect actions need MFA is register
-- row T063-e. The row is locked FOR UPDATE before it is read, so two
-- moderators taking the same guide down at once produce one change and one
-- audit row; the second sees 'private' and answers changed false.
--
-- WHAT IT DOES NOT DO. It does not stop the owner publishing the guide
-- again (their own update policy allows it), revoke share links (009's
-- get_shared_trip does not look at visibility), notify the owner, or write a
-- statement of reasons. The last two are T070. The first two are in the
-- register.
--
-- ORDER. Apply in the Supabase SQL editor AFTER 037. Needs 019 (visibility
-- 'public', published_at), 033 and 034 (admin_log, admin_guard) and 037
-- (content_reports); the self-check refuses to pass without them. Never
-- `db push` against ntssxktaduxzpsmejwyv. Look for the notice "admin
-- unpublish guide self-check passed". Safe to paste twice: everything is
-- create or replace.
--
-- DOWN MIGRATION. Drop the function, then put 020's guard back exactly as
-- 020 wrote it (paste 020's guard_coplanner_write block again, or run):
--
--   drop function if exists public.admin_unpublish_guide(uuid, text);
--   -- then re-run the "create or replace function
--   -- public.guard_coplanner_write()" block from 020_coplanners.sql
--   notify pgrst, 'reload schema';
--
-- Takedowns already made stay made: the plans stay private until their
-- owners publish them again, and the audit rows stay.

-- ---------------------------------------------------------------------------
-- 020's guard, with the one takedown exception
-- ---------------------------------------------------------------------------
create or replace function public.guard_coplanner_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() <> old.user_id then
    new.user_id := old.user_id;
    -- The takedown marker, set only by admin_unpublish_guide for the one row
    -- it is unpublishing. It lets visibility move to 'private' and nowhere
    -- else; published_at is then cleared by 019's stamp trigger, which runs
    -- after this one.
    if not (coalesce(current_setting('carta.takedown_plan', true), '') = old.id::text
            and new.visibility = 'private') then
      new.visibility   := old.visibility;
      new.published_at := old.published_at;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_coplanner_write() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The takedown
-- ---------------------------------------------------------------------------
create or replace function public.admin_unpublish_guide(
  p_plan_id uuid,
  p_reason  text
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
  v_owner   uuid;
  v_label   text;
  v_vis     text;
  v_pub     timestamptz;
  v_new_vis text;
  v_new_pub timestamptz;
  v_reports jsonb;
  v_n       int;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  if v_reason = '' or char_length(v_reason) > 2000 then
    return jsonb_build_object('error', 'bad_reason');
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

  perform set_config('carta.takedown_plan', p_plan_id::text, true);
  update public.trip_plans
     set visibility = 'private'
   where id = p_plan_id
  returning visibility, published_at into v_new_vis, v_new_pub;
  perform set_config('carta.takedown_plan', '', true);

  -- A trigger that pins visibility (020's guard without the exception above)
  -- would leave the guide public. Refuse loudly rather than report success;
  -- the raise rolls the whole call back.
  if v_new_vis is distinct from 'private' then
    raise exception 'the plan is still public after the update (visibility %); re-apply 038', v_new_vis;
  end if;

  with moved as (
    update public.content_reports r
       set status = 'actioned'
     where r.plan_id = p_plan_id and r.status = 'new'
    returning r.id
  )
  select coalesce(jsonb_agg(id order by id), '[]'::jsonb), count(*)
    into v_reports, v_n
    from moved;

  perform public.admin_log('unpublish_guide', v_owner,
    jsonb_build_object(
      'table',    'trip_plans',
      'planId',   p_plan_id,
      'label',    v_label,
      'reason',   v_reason,
      'previous', jsonb_build_object('visibility', v_vis, 'publishedAt', v_pub),
      'new',      jsonb_build_object('visibility', v_new_vis, 'publishedAt', v_new_pub),
      'reports',  v_reports));

  return jsonb_build_object('ok', true, 'changed', true,
                            'visibility', v_new_vis, 'reportsActioned', v_n);
end;
$$;

revoke all on function public.admin_unpublish_guide(uuid, text) from public, anon;
grant execute on function public.admin_unpublish_guide(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  fn  constant text := 'public.admin_unpublish_guide(uuid, text)';
  cfg text[];
  src text;
  res jsonb;
begin
  if to_regprocedure('public.admin_guard(text)') is null
     or to_regprocedure('public.admin_log(text, uuid, jsonb)') is null then
    raise exception 'admin_guard or admin_log is missing; apply 015 first';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'trip_plans' and column_name = 'published_at'
  ) then
    raise exception 'trip_plans has no published_at column; apply 019 first';
  end if;
  if to_regclass('public.content_reports') is null then
    raise exception 'public.content_reports is missing; apply 037 first';
  end if;

  if not (select prosecdef from pg_proc where oid = fn::regprocedure::oid) then
    raise exception '% is not SECURITY DEFINER', fn;
  end if;
  select proconfig, prosrc into cfg, src from pg_proc where oid = fn::regprocedure::oid;
  if cfg is null or not ('search_path=""' = any(cfg)) then
    raise exception '% does not pin search_path to empty (proconfig %)', fn, cfg;
  end if;
  if position('admin_guard(''destructive'')' in src) = 0 then
    raise exception '% does not pass admin_guard(''destructive'')', fn;
  end if;
  -- The promise of this file: a takedown never deletes.
  if position('delete' in lower(src)) > 0 then
    raise exception '% contains the word delete; a takedown must never delete', fn;
  end if;
  if position('''previous''' in src) = 0 or position('''new''' in src) = 0 then
    raise exception '% does not record the previous and new state', fn;
  end if;
  if has_function_privilege('anon', fn, 'execute') then
    raise exception 'anon can execute %', fn;
  end if;
  if not has_function_privilege('authenticated', fn, 'execute') then
    raise exception 'authenticated cannot execute %', fn;
  end if;

  if position('carta.takedown_plan' in
       (select prosrc from pg_proc where oid = 'public.guard_coplanner_write()'::regprocedure::oid)) = 0 then
    raise exception 'guard_coplanner_write has no takedown exception';
  end if;

  -- In the SQL editor there is no signed-in caller, so the guard refuses
  -- before anything is read.
  res := public.admin_unpublish_guide(gen_random_uuid(), 'self-check');
  if coalesce(res ->> 'error', '') <> 'forbidden' then
    raise exception '% answered a caller with no admin row with %, expected forbidden', fn, res;
  end if;

  raise notice 'admin unpublish guide self-check passed';
end;
$$;

notify pgrst, 'reload schema';
