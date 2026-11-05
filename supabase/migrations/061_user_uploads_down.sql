-- 061_user_uploads_down.sql
--
-- *** DOWN MIGRATION FOR 061, APPLIED BY THE OWNER ONLY TO ROLL BACK T1070. ***
-- Paste in the Supabase SQL editor. One way for the data: every upload record
-- (with its licence grant, credit and any statement of reasons) and every
-- upload report is deleted, and the bucket's files are lost.
--
-- BEFORE PASTING, empty the bucket through the Storage API or the Dashboard
-- (Storage, user-uploads, select all, Delete): Supabase refuses to drop a
-- bucket that still holds objects, and deleting rows in storage.objects from
-- SQL leaves the files behind. The block below stops with a message if the
-- bucket is not empty. Order, as the T333 design asks: the schedule, the
-- functions, the storage policies, the table, then the bucket.
--
-- After this, src/community/uploads.js answers "did not send, nothing was
-- stored" again, and check-contract.mjs needs its two KNOWN_DB_GAPS entries
-- back (begin_upload, finish_upload).

do $$
begin
  -- Dynamic, so the file also runs where pg_cron (and so cron.job) is
  -- absent: a static reference to cron.job fails at parse time there.
  if to_regclass('cron.job') is not null then
    execute $q$select cron.unschedule(jobname) from cron.job where jobname = 'carta_uploads_scan'$q$;
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'user-uploads') then
    raise exception 'the user-uploads bucket still holds objects: empty it through the Storage API or the Dashboard first';
  end if;
end;
$$;

-- Functions (report_content first: nothing else calls it).
drop function if exists public.report_content(text, text, text, text, text, boolean);
drop function if exists public.admin_decide_upload(uuid, text, text, text);
drop function if exists public.admin_list_uploads(text, int, int);
drop function if exists public.upload_mark_scanned(uuid, text, bigint);
drop function if exists public.uploads_sweep();
drop function if exists public.list_published_uploads(text, text);
drop function if exists public.remove_my_upload(uuid);
drop function if exists public.finish_upload(uuid);
drop function if exists public.begin_upload(text, text, text, text, text, boolean, text, text, bigint);

-- Storage policies, then the helper they call.
drop policy if exists user_uploads_insert_own_slot   on storage.objects;
drop policy if exists user_uploads_read_own_or_admin on storage.objects;
drop policy if exists user_uploads_read_published    on storage.objects;
drop function if exists public.upload_is_published(text);

-- The account folder trigger and the row trigger.
drop trigger if exists on_auth_user_deleted_uploads on auth.users;
drop function if exists public.user_uploads_queue_folder();
drop trigger if exists user_uploads_queue_file on public.user_uploads;
drop function if exists public.user_uploads_queue_file();

-- content_reports back to guides only. Upload reports have no plan and
-- cannot satisfy NOT NULL, so they go first.
delete from public.content_reports where target_kind <> 'guide';
drop index if exists public.content_reports_target_idx;
alter table public.content_reports drop constraint if exists content_reports_target_ck;
alter table public.content_reports drop constraint if exists content_reports_target_kind_ck;
alter table public.content_reports drop column if exists target_id;
alter table public.content_reports drop column if exists target_kind;
alter table public.content_reports alter column plan_id set not null;

-- 051's admin_list_content_reports back, copied from 051 unchanged (the 061
-- body reads the dropped target_kind column).
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

drop table if exists public.upload_purge_queue;
drop table if exists public.user_uploads;

delete from storage.buckets where id = 'user-uploads';

notify pgrst, 'reload schema';
