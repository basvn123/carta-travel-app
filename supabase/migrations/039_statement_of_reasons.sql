-- 039_statement_of_reasons.sql
--
-- The other half of notice-and-action: a statement of reasons for every
-- takedown (DSA Article 17), an internal complaints route the owner can use
-- free of charge (Article 20), and the dismissed path for a report that a
-- moderator decides not to act on, with who decided and when.
--
-- WHY. 037 gave anyone a way to report a guide and 038 gave a moderator a
-- way to take it down. Neither told the person whose guide came down
-- anything, and neither gave them a way to say "you got this wrong". Those
-- are obligations in their own right, and they are the part that is easy to
-- forget because the reporting form feels like the whole job.
--
-- WHAT IT ADDS.
--
--   public.moderation_statements    one row per takedown: the statement of
--                                   reasons, and on the same row the owner's
--                                   complaint against it and the decision on
--                                   that complaint. The owner reads their
--                                   own rows through RLS (owner_id =
--                                   auth.uid()), and only the columns listed
--                                   in the column grant below.
--   content_reports.decided_by, decided_at, decision_note
--                                   who closed a report, when, and why.
--   public.moderation_guide_fingerprint(plan)
--                                   md5 of what a public reader of the guide
--                                   sees: its title, 019's public stop
--                                   projection and 019's public day plan
--                                   projection. Internal, no client grant.
--   public.admin_unpublish_guide    038's body, now also closing the reports
--                                   with decided_by and decided_at and
--                                   writing the statement.
--   public.admin_dismiss_content_report(report, reason)
--                                   the dismissed path, destructive tier.
--   public.contest_moderation_decision(statement, text)
--                                   the owner's complaint, authenticated only.
--   public.admin_decide_complaint(statement, outcome, reason)
--                                   uphold or reverse, destructive tier.
--   public.admin_list_moderation_complaints(status, limit, offset)
--                                   the complaints queue, read tier.
--   public.admin_list_content_reports
--                                   037's body plus the decision fields.
--   public.guard_coplanner_write    038's guard plus a reinstate exception.
--
-- WHAT THE STATEMENT HOLDS, against Article 17(3):
--
--   (a) the restriction and its scope: restriction 'removed_from_gallery'.
--       The guide left the public gallery everywhere, with no end date; the
--       plan itself stays in the owner's account. The app says both.
--   (b) the facts relied on: facts, the moderator's reason as written; and
--       whether it came from a notice: source 'notice' when at least one
--       report on the guide was still open when it came down (notice_count
--       says how many), 'own_initiative' otherwise. The notifier is never
--       named: no reporter id, email or source hash is copied here.
--   (c) automated means: automated, always false. A person decided.
--   (d) and (e) the legal or contractual ground: NOT separated. The
--       moderator writes one reason; nothing in 038's form says whether it
--       is a law or the terms. The app shows the reason as the ground. That
--       gap is register row T070-c.
--   (f) redress: the app renders it from contest_until (six months after
--       the decision, Article 20(1) asks for at least six), the complaint
--       route below, and out-of-court settlement and the courts.
--   the date: created_at.
--
-- The statement is stored as fields, not as a paragraph, so the app can
-- show it in the owner's language. The only free text is the moderator's.
--
-- DELIVERY. The project has no route that sends transactional email to a
-- user (the Edge Functions are checkout, stripe-webhook, plan-day,
-- parse-booking and suggest-city; Supabase Auth mail is for sign-in only).
-- So the statement is delivered in the app: it shows on the plan's card in
-- My trips, the place the owner manages who can see that trip. An email
-- route is register row T070-d; never the Claude API.
--
-- THE COMPLAINT. One per statement, lodged by the owner through
-- contest_moderation_decision while now() < contest_until. It costs nothing
-- and needs no pass. A caller who is not the owner, or a statement id that
-- does not exist, gets the same not_found, so the RPC cannot be used to
-- probe other people's statements. The complaint text sits on the
-- statement row, complaint_status moves 'none' to 'open', and the Reports
-- tab lists open complaints above the notices.
--
-- THE DECISION ON A COMPLAINT. admin_decide_complaint takes 'upheld' or
-- 'reversed' and a required reason, which the owner reads as the answer.
-- One audit row, action 'decide_complaint'.
--
-- THE REINSTATE RULE. Reversing republishes the guide only if all three
-- hold: the plan still exists, it is still 'private' (the value the
-- takedown left), and moderation_guide_fingerprint(plan) still equals the
-- content_hash taken at the moment of the takedown. In words: only if the
-- owner has changed neither who can see it nor anything a public reader
-- would see. The reason: the moderator reviewed the guide that came down,
-- not whatever the plan holds today, and republishing edited content
-- under a moderation decision would publish something nobody reviewed.
-- It would also override an owner who chose 'friends' or deleted the
-- trip. When the rule does not hold, the decision is still reversed, the
-- statement says so, and the plan is left exactly as the owner has it;
-- they can publish it themselves (their own update policy allows that,
-- see T069-c). Edits the public never saw (dates within the same month,
-- private notes, spend) do not count as changes, because the projections
-- leave them out. On reinstatement published_at goes back to the original
-- stamp, so the guide returns to its old place in the gallery.
--
-- Reports stay 'actioned' after a reversal: they record that a notice led
-- to a takedown, which is still true. The reversal lives on the statement
-- and in the audit log.
--
-- THE DISMISSED PATH. admin_dismiss_content_report moves one report from
-- 'new' to 'dismissed' with decided_by, decided_at and the reason, and
-- writes a 'dismiss_report' audit row with the plan owner as target. It
-- touches no plan and writes no statement: nothing was restricted, so
-- there is nothing for the owner to be told. A report that is not 'new'
-- answers changed false and writes nothing.
--
-- THE CO-PLANNER TRIGGER AGAIN. Reinstating is an update by an admin, who
-- is not the owner, so 020's guard (as 038 left it) would pin visibility
-- back to 'private'. The guard is re-created from 038's body with a second
-- marker, carta.reinstate_plan, which lets visibility move to 'public' and
-- lets published_at through, only for that row. Same safety argument as
-- 038: PostgREST cannot set it, and the RPC reads back and raises if the
-- guide did not come back.
--
-- RE-PASTE TRAPS. Pasting 038 after this file puts back 038's takedown
-- body (no statement, no decided_by) and 038's guard (no reinstate
-- exception): a reverse would then fail loudly with "the plan did not
-- come back". Pasting 037 after this file puts back 037's report list
-- without the decision fields. Pasting 020 after this file breaks both
-- takedown and reinstate. In every case paste 039 again.
--
-- ORDER. Apply in the Supabase SQL editor AFTER 038. The self-check needs
-- 019, 033, 034, 037 and 038 and refuses to pass without them. Never
-- `db push` against ntssxktaduxzpsmejwyv. Look for the notice "statement
-- of reasons self-check passed". Safe to paste twice.
--
-- DOWN MIGRATION. The statements and complaints are records the service
-- is expected to keep; export them first (select * from
-- public.moderation_statements). Then:
--
--   drop function if exists public.admin_list_moderation_complaints(text, int, int);
--   drop function if exists public.admin_decide_complaint(bigint, text, text);
--   drop function if exists public.contest_moderation_decision(bigint, text);
--   drop function if exists public.admin_dismiss_content_report(bigint, text);
--   drop table if exists public.moderation_statements;
--   -- paste 038 again (takedown body and guard), then 037's
--   -- admin_list_content_reports block, then:
--   drop function if exists public.moderation_guide_fingerprint(uuid);
--   alter table public.content_reports
--     drop column if exists decided_by, drop column if exists decided_at,
--     drop column if exists decision_note;
--   notify pgrst, 'reload schema';
--
-- Rows already dismissed keep status 'dismissed' after the columns go.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
alter table public.content_reports
  add column if not exists decided_by    uuid references auth.users (id) on delete set null,
  add column if not exists decided_at    timestamptz,
  add column if not exists decision_note text
        check (decision_note is null or char_length(decision_note) <= 2000);

create table if not exists public.moderation_statements (
  id                    bigint generated always as identity primary key,
  created_at            timestamptz not null default now(),
  -- Which content. No foreign key, as content_reports: the record has to
  -- outlive the owner deleting the plan.
  plan_id               uuid not null,
  plan_label            text,
  owner_id              uuid references auth.users (id) on delete set null,
  restriction           text not null default 'removed_from_gallery'
                        check (restriction in ('removed_from_gallery')),
  source                text not null check (source in ('notice', 'own_initiative')),
  notice_count          int not null default 0 check (notice_count >= 0),
  facts                 text not null check (char_length(facts) between 1 and 2000),
  automated             boolean not null default false,
  previous_published_at timestamptz,
  content_hash          text,
  decided_by            uuid references auth.users (id) on delete set null,
  contest_until         timestamptz not null default (now() + interval '6 months'),
  complaint_body        text check (complaint_body is null or char_length(complaint_body) between 10 and 4000),
  complaint_at          timestamptz,
  complaint_status      text not null default 'none'
                        check (complaint_status in ('none', 'open', 'upheld', 'reversed')),
  complaint_decided_by  uuid references auth.users (id) on delete set null,
  complaint_decided_at  timestamptz,
  complaint_note        text check (complaint_note is null or char_length(complaint_note) <= 2000),
  reinstated            boolean not null default false
);

create index if not exists moderation_statements_owner_idx
  on public.moderation_statements (owner_id, created_at desc);
create index if not exists moderation_statements_plan_idx
  on public.moderation_statements (plan_id);
create index if not exists moderation_statements_complaint_idx
  on public.moderation_statements (complaint_status, complaint_at desc);

alter table public.moderation_statements enable row level security;
revoke all on table public.moderation_statements from public, anon, authenticated;

-- The owner reads their own statements, nobody else's. Writes only go
-- through the definer functions below.
drop policy if exists moderation_statements_owner_read on public.moderation_statements;
create policy moderation_statements_owner_read on public.moderation_statements
  for select to authenticated
  using (owner_id = auth.uid());

-- Column grant: which moderator decided, and the content hash, are kept
-- from the owner. Everything the statement says is readable.
grant select (id, created_at, plan_id, plan_label, owner_id, restriction, source,
              notice_count, facts, automated, contest_until, complaint_body,
              complaint_at, complaint_status, complaint_decided_at,
              complaint_note, reinstated)
  on public.moderation_statements to authenticated;

do $$
declare
  seq text := pg_get_serial_sequence('public.moderation_statements', 'id');
begin
  if seq is not null then
    execute format('revoke all on sequence %s from public, anon, authenticated', seq);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 038's guard, with the reinstate exception added
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
    -- The reinstate marker (039), set only by admin_decide_complaint for the
    -- one row it is putting back. It lets visibility move to 'public' and
    -- lets published_at through, so the original stamp can be restored.
    if not (coalesce(current_setting('carta.takedown_plan', true), '') = old.id::text
            and new.visibility = 'private')
       and not (coalesce(current_setting('carta.reinstate_plan', true), '') = old.id::text
            and new.visibility = 'public') then
      new.visibility   := old.visibility;
      new.published_at := old.published_at;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_coplanner_write() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What a public reader of the guide sees, as one hash
-- ---------------------------------------------------------------------------
-- The title, 019's public stop projection and 019's public day plan
-- projection: exactly what get_public_guide hands a reader, minus the
-- author's profile and the stamp. Taken at the takedown, compared at a
-- reversal. Security invoker and no client grant: it is only ever called
-- from the definer functions in this file.
create or replace function public.moderation_guide_fingerprint(p_plan uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select md5(
           coalesce(tp.label, '') || '|'
           || public.project_public_stops(tp.id)::text || '|'
           || coalesce((
                select public.project_public_guide_payload(dp.payload)
                  from public.day_plans dp
                 where dp.user_id = tp.user_id
                   and dp.plan_id = tp.id::text
                   and dp.deleted_at is null
              ), '{}'::jsonb)::text)
    from public.trip_plans tp
   where tp.id = p_plan;
$$;

revoke all on function public.moderation_guide_fingerprint(uuid) from public, anon, authenticated;

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
  v_hash    text;
  v_stmt    bigint;
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

  -- What the public could read at the moment it came down (039). A
  -- reversal compares against this before it republishes anything.
  v_hash := public.moderation_guide_fingerprint(p_plan_id);

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
    raise exception 'the plan is still public after the update (visibility %); re-apply 039', v_new_vis;
  end if;

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

  -- The statement of reasons (039), one per takedown. source is 'notice'
  -- when an open report on the guide was closed by this takedown. The
  -- notifier is not named: nothing about the reporter is copied.
  insert into public.moderation_statements
    (plan_id, plan_label, owner_id, source, notice_count, facts,
     previous_published_at, content_hash, decided_by)
  values
    (p_plan_id, v_label, v_owner,
     case when v_n > 0 then 'notice' else 'own_initiative' end,
     v_n, v_reason, v_pub, v_hash, auth.uid())
  returning id into v_stmt;

  perform public.admin_log('unpublish_guide', v_owner,
    jsonb_build_object(
      'table',    'trip_plans',
      'planId',   p_plan_id,
      'label',    v_label,
      'reason',   v_reason,
      'previous', jsonb_build_object('visibility', v_vis, 'publishedAt', v_pub),
      'new',      jsonb_build_object('visibility', v_new_vis, 'publishedAt', v_new_pub),
      'reports',  v_reports,
      'statementId', v_stmt));

  return jsonb_build_object('ok', true, 'changed', true,
                            'visibility', v_new_vis, 'reportsActioned', v_n,
                            'statementId', v_stmt);
end;
$$;

revoke all on function public.admin_unpublish_guide(uuid, text) from public, anon;
grant execute on function public.admin_unpublish_guide(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The read path for the Reports tab: 037's body plus who decided, when and
-- why (039). Nothing else moved.
-- ---------------------------------------------------------------------------
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
        'decisionNote',   r.decision_note
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

-- ---------------------------------------------------------------------------
-- The dismissed path: a report a moderator decides not to act on
-- ---------------------------------------------------------------------------
-- Answers {"ok": true, "changed": true, "status": "dismissed"}, or changed
-- false with the current status when the report is already decided (nothing
-- written). Refusals: forbidden, slow_down, bad_reason, not_found.
create or replace function public.admin_dismiss_content_report(
  p_report_id bigint,
  p_reason    text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_err    text := public.admin_guard('destructive');
  v_reason text := regexp_replace(coalesce(p_reason, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_row    public.content_reports;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  if v_reason = '' or char_length(v_reason) > 2000 then
    return jsonb_build_object('error', 'bad_reason');
  end if;

  select * into v_row from public.content_reports r where r.id = p_report_id for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_row.status <> 'new' then
    return jsonb_build_object('ok', true, 'changed', false, 'status', v_row.status);
  end if;

  update public.content_reports
     set status        = 'dismissed',
         decided_by    = auth.uid(),
         decided_at    = now(),
         decision_note = v_reason
   where id = p_report_id;

  perform public.admin_log('dismiss_report', v_row.plan_owner,
    jsonb_build_object(
      'table',    'content_reports',
      'reportId', p_report_id,
      'planId',   v_row.plan_id,
      'label',    v_row.plan_label,
      'reason',   v_reason,
      'previous', jsonb_build_object('status', v_row.status),
      'new',      jsonb_build_object('status', 'dismissed')));

  return jsonb_build_object('ok', true, 'changed', true, 'status', 'dismissed');
end;
$$;

revoke all on function public.admin_dismiss_content_report(bigint, text) from public, anon;
grant execute on function public.admin_dismiss_content_report(bigint, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The owner's complaint, free of charge
-- ---------------------------------------------------------------------------
-- Answers {"ok": true, "status": "open"}. Refusals:
--   forbidden          no signed-in caller
--   bad_reason         under 10 or over 4000 characters after trimming
--   not_found          no statement with that id OWNED BY THE CALLER; a
--                      stranger and a missing id get the same word
--   already_contested  this statement already has a complaint
--   too_late           past contest_until
create or replace function public.contest_moderation_decision(
  p_statement_id bigint,
  p_body         text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_body text := regexp_replace(coalesce(p_body, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_row  public.moderation_statements;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if char_length(v_body) < 10 or char_length(v_body) > 4000 then
    return jsonb_build_object('error', 'bad_reason');
  end if;

  select * into v_row from public.moderation_statements s
   where s.id = p_statement_id and s.owner_id = v_uid
     for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_row.complaint_status <> 'none' then
    return jsonb_build_object('error', 'already_contested');
  end if;
  if now() > v_row.contest_until then
    return jsonb_build_object('error', 'too_late');
  end if;

  update public.moderation_statements
     set complaint_body   = v_body,
         complaint_at     = now(),
         complaint_status = 'open'
   where id = p_statement_id;

  return jsonb_build_object('ok', true, 'status', 'open');
end;
$$;

revoke all on function public.contest_moderation_decision(bigint, text) from public, anon;
grant execute on function public.contest_moderation_decision(bigint, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The decision on a complaint: uphold or reverse, with a logged reason
-- ---------------------------------------------------------------------------
-- Answers {"ok": true, "changed": true, "outcome": o, "reinstated": b}, or
-- changed false with the outcome already recorded. Refusals: forbidden,
-- slow_down, bad_outcome (not 'upheld' or 'reversed'), bad_reason,
-- not_found, no_complaint (the statement has no complaint to decide).
-- The reinstate rule is in the header.
create or replace function public.admin_decide_complaint(
  p_statement_id bigint,
  p_outcome      text,
  p_reason       text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_err        text := public.admin_guard('destructive');
  v_outcome    text := lower(trim(coalesce(p_outcome, '')));
  v_reason     text := regexp_replace(coalesce(p_reason, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_row        public.moderation_statements;
  v_exists     boolean := false;
  v_vis        text;
  v_pub        timestamptz;
  v_hash       text;
  v_unchanged  boolean := false;
  v_reinstated boolean := false;
  v_new_vis    text;
  v_new_pub    timestamptz;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  if v_outcome not in ('upheld', 'reversed') then
    return jsonb_build_object('error', 'bad_outcome');
  end if;
  if v_reason = '' or char_length(v_reason) > 2000 then
    return jsonb_build_object('error', 'bad_reason');
  end if;

  select * into v_row from public.moderation_statements s where s.id = p_statement_id for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_row.complaint_status = 'none' then
    return jsonb_build_object('error', 'no_complaint');
  end if;
  if v_row.complaint_status <> 'open' then
    return jsonb_build_object('ok', true, 'changed', false,
                              'outcome', v_row.complaint_status, 'reinstated', v_row.reinstated);
  end if;

  -- The plan as it stands, locked, for the audit row and the rule.
  select tp.visibility, tp.published_at into v_vis, v_pub
    from public.trip_plans tp where tp.id = v_row.plan_id for update;
  v_exists := found;

  if v_outcome = 'reversed' and v_exists then
    v_hash := public.moderation_guide_fingerprint(v_row.plan_id);
    v_unchanged := v_vis = 'private'
                   and v_row.content_hash is not null
                   and v_hash = v_row.content_hash;
    if v_unchanged then
      -- Two updates under the marker: the first makes it public (019's
      -- stamp sets now()), the second puts the original stamp back (019
      -- leaves a public to public update alone).
      perform set_config('carta.reinstate_plan', v_row.plan_id::text, true);
      update public.trip_plans set visibility = 'public' where id = v_row.plan_id;
      update public.trip_plans
         set published_at = coalesce(v_row.previous_published_at, published_at)
       where id = v_row.plan_id
      returning visibility, published_at into v_new_vis, v_new_pub;
      perform set_config('carta.reinstate_plan', '', true);
      if v_new_vis is distinct from 'public' then
        raise exception 'the plan did not come back after the update (visibility %); re-apply 039', v_new_vis;
      end if;
      v_reinstated := true;
    end if;
  end if;

  update public.moderation_statements
     set complaint_status     = v_outcome,
         complaint_decided_by = auth.uid(),
         complaint_decided_at = now(),
         complaint_note       = v_reason,
         reinstated           = v_reinstated
   where id = p_statement_id;

  perform public.admin_log('decide_complaint', v_row.owner_id,
    jsonb_build_object(
      'table',         'moderation_statements',
      'statementId',   p_statement_id,
      'planId',        v_row.plan_id,
      'label',         v_row.plan_label,
      'outcome',       v_outcome,
      'reason',        v_reason,
      'planExists',    v_exists,
      'planUnchanged', v_unchanged,
      'reinstated',    v_reinstated,
      'previous', jsonb_build_object('complaintStatus', 'open',
                                     'visibility', v_vis, 'publishedAt', v_pub),
      'new',      jsonb_build_object('complaintStatus', v_outcome,
                                     'visibility', case when v_reinstated then v_new_vis else v_vis end,
                                     'publishedAt', case when v_reinstated then v_new_pub else v_pub end)));

  return jsonb_build_object('ok', true, 'changed', true,
                            'outcome', v_outcome, 'reinstated', v_reinstated);
end;
$$;

revoke all on function public.admin_decide_complaint(bigint, text, text) from public, anon;
grant execute on function public.admin_decide_complaint(bigint, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The complaints queue, shown in the Reports tab above the notices
-- ---------------------------------------------------------------------------
-- p_status 'open' (default), 'upheld', 'reversed', or null for every
-- statement that has a complaint. unchanged says whether a reversal would
-- republish right now (the rule in the header), so the moderator knows
-- before choosing.
create or replace function public.admin_list_moderation_complaints(
  p_status text default 'open',
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
  if v_status is not null and v_status not in ('open', 'upheld', 'reversed') then
    v_status := null;
  end if;

  return jsonb_build_object(
    'total', (select count(*) from public.moderation_statements
               where complaint_status <> 'none'
                 and (v_status is null or complaint_status = v_status)),
    'open',  (select count(*) from public.moderation_statements where complaint_status = 'open'),
    'rows',  coalesce((
      select jsonb_agg(jsonb_build_object(
        'statementId',     s.id,
        'createdAt',       s.created_at,
        'planId',          s.plan_id,
        'planLabel',       s.plan_label,
        'currentLabel',    tp.label,
        'planExists',      tp.id is not null,
        'visibility',      tp.visibility,
        'ownerId',         s.owner_id,
        'ownerHandle',     op.handle,
        'ownerEmail',      ou.email,
        'facts',           s.facts,
        'source',          s.source,
        'noticeCount',     s.notice_count,
        'decidedByHandle', dp.handle,
        'contestUntil',    s.contest_until,
        'complaintBody',   s.complaint_body,
        'complaintAt',     s.complaint_at,
        'complaintStatus', s.complaint_status,
        'complaintDecidedAt',       s.complaint_decided_at,
        'complaintDecidedByHandle', cp.handle,
        'complaintNote',   s.complaint_note,
        'reinstated',      s.reinstated,
        'unchanged',       coalesce(tp.visibility = 'private'
                                    and s.content_hash is not null
                                    and public.moderation_guide_fingerprint(s.plan_id) = s.content_hash, false)
      ) order by s.complaint_at desc, s.id desc)
      from (select * from public.moderation_statements
             where complaint_status <> 'none'
               and (v_status is null or complaint_status = v_status)
             order by complaint_at desc, id desc limit v_limit offset v_offset) s
      left join public.trip_plans tp on tp.id = s.plan_id
      left join public.profiles op    on op.user_id = s.owner_id
      left join auth.users ou         on ou.id = s.owner_id
      left join public.profiles dp    on dp.user_id = s.decided_by
      left join public.profiles cp    on cp.user_id = s.complaint_decided_by
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_list_moderation_complaints(text, int, int) from public, anon;
grant execute on function public.admin_list_moderation_complaints(text, int, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  f   text;
  cfg text[];
  src text;
  res jsonb;
  fn_unpub   constant text := 'public.admin_unpublish_guide(uuid, text)';
  fn_dismiss constant text := 'public.admin_dismiss_content_report(bigint, text)';
  fn_contest constant text := 'public.contest_moderation_decision(bigint, text)';
  fn_decide  constant text := 'public.admin_decide_complaint(bigint, text, text)';
  fn_listc   constant text := 'public.admin_list_moderation_complaints(text, int, int)';
  fn_listr   constant text := 'public.admin_list_content_reports(text, int, int)';
  fn_fp      constant text := 'public.moderation_guide_fingerprint(uuid)';
begin
  if to_regprocedure('public.admin_guard(text)') is null
     or to_regprocedure('public.admin_log(text, uuid, jsonb)') is null then
    raise exception 'admin_guard or admin_log is missing; apply 015 and 034 first';
  end if;
  if to_regprocedure('public.project_public_stops(uuid)') is null then
    raise exception 'project_public_stops is missing; apply 019 first';
  end if;
  if to_regclass('public.content_reports') is null then
    raise exception 'public.content_reports is missing; apply 037 first';
  end if;

  foreach f in array array[fn_unpub, fn_dismiss, fn_contest, fn_decide, fn_listc, fn_listr] loop
    if not (select prosecdef from pg_proc where oid = f::regprocedure::oid) then
      raise exception '% is not SECURITY DEFINER', f;
    end if;
    select proconfig into cfg from pg_proc where oid = f::regprocedure::oid;
    if cfg is null or not ('search_path=""' = any(cfg)) then
      raise exception '% does not pin search_path to empty (proconfig %)', f, cfg;
    end if;
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'anon can execute %', f;
    end if;
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'authenticated cannot execute %', f;
    end if;
  end loop;

  foreach f in array array[fn_unpub, fn_dismiss, fn_decide] loop
    if position('admin_guard(''destructive'')' in (select prosrc from pg_proc where oid = f::regprocedure::oid)) = 0 then
      raise exception '% does not pass admin_guard(''destructive'')', f;
    end if;
  end loop;
  foreach f in array array[fn_listc, fn_listr] loop
    if position('admin_guard(''read'')' in (select prosrc from pg_proc where oid = f::regprocedure::oid)) = 0 then
      raise exception '% does not pass admin_guard(''read'')', f;
    end if;
  end loop;

  -- 038's promise carries over, and extends to everything this file adds
  -- that writes: a moderation decision never deletes.
  foreach f in array array[fn_unpub, fn_dismiss, fn_contest, fn_decide] loop
    if position('delete' in lower((select prosrc from pg_proc where oid = f::regprocedure::oid))) > 0 then
      raise exception '% contains the word delete; a moderation decision must never delete', f;
    end if;
  end loop;
  select prosrc into src from pg_proc where oid = fn_unpub::regprocedure::oid;
  if position('''previous''' in src) = 0 or position('''new''' in src) = 0 then
    raise exception '% does not record the previous and new state', fn_unpub;
  end if;
  if position('moderation_statements' in src) = 0 then
    raise exception '% does not write a statement of reasons; re-apply 039', fn_unpub;
  end if;

  select prosrc into src from pg_proc where oid = 'public.guard_coplanner_write()'::regprocedure::oid;
  if position('carta.takedown_plan' in src) = 0 or position('carta.reinstate_plan' in src) = 0 then
    raise exception 'guard_coplanner_write is missing the takedown or reinstate exception';
  end if;

  if has_function_privilege('authenticated', fn_fp, 'execute')
     or has_function_privilege('anon', fn_fp, 'execute') then
    raise exception 'a client role can execute %', fn_fp;
  end if;

  -- The statements table: RLS on, one owner-only read policy, no client
  -- write, and the moderator's id not readable.
  if not (select relrowsecurity from pg_class where oid = 'public.moderation_statements'::regclass) then
    raise exception 'RLS is off on public.moderation_statements';
  end if;
  if (select count(*) from pg_policies
       where schemaname = 'public' and tablename = 'moderation_statements') <> 1
     or not exists (select 1 from pg_policies
                     where schemaname = 'public' and tablename = 'moderation_statements'
                       and cmd = 'SELECT' and qual like '%auth.uid()%') then
    raise exception 'public.moderation_statements must have exactly one policy, an owner read';
  end if;
  if has_table_privilege('anon', 'public.moderation_statements', 'select')
     or has_column_privilege('anon', 'public.moderation_statements', 'facts', 'select') then
    raise exception 'anon can read public.moderation_statements';
  end if;
  if has_table_privilege('authenticated', 'public.moderation_statements', 'insert')
     or has_table_privilege('authenticated', 'public.moderation_statements', 'update')
     or has_table_privilege('authenticated', 'public.moderation_statements', 'delete') then
    raise exception 'authenticated can write public.moderation_statements directly';
  end if;
  if has_column_privilege('authenticated', 'public.moderation_statements', 'decided_by', 'select')
     or has_column_privilege('authenticated', 'public.moderation_statements', 'content_hash', 'select') then
    raise exception 'authenticated can read decided_by or content_hash';
  end if;
  if not has_column_privilege('authenticated', 'public.moderation_statements', 'facts', 'select') then
    raise exception 'authenticated cannot read the statement';
  end if;

  -- In the SQL editor there is no signed-in caller: every door refuses.
  res := public.admin_unpublish_guide(gen_random_uuid(), 'self-check');
  if coalesce(res ->> 'error', '') <> 'forbidden' then
    raise exception '% answered no caller with %, expected forbidden', fn_unpub, res;
  end if;
  res := public.admin_dismiss_content_report(-1, 'self-check');
  if coalesce(res ->> 'error', '') <> 'forbidden' then
    raise exception '% answered no caller with %, expected forbidden', fn_dismiss, res;
  end if;
  res := public.admin_decide_complaint(-1, 'upheld', 'self-check');
  if coalesce(res ->> 'error', '') <> 'forbidden' then
    raise exception '% answered no caller with %, expected forbidden', fn_decide, res;
  end if;
  res := public.contest_moderation_decision(-1, 'a complaint long enough');
  if coalesce(res ->> 'error', '') <> 'forbidden' then
    raise exception '% answered no caller with %, expected forbidden', fn_contest, res;
  end if;
  res := public.admin_list_moderation_complaints(null, 5, 0);
  if coalesce(res ->> 'error', '') <> 'forbidden' then
    raise exception '% answered no caller with %, expected forbidden', fn_listc, left(res::text, 200);
  end if;

  raise notice 'statement of reasons self-check passed';
end;
$$;

notify pgrst, 'reload schema';
