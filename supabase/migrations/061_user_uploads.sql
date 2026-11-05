-- 061_user_uploads.sql
--
-- *** SCHEMA MIGRATION, APPLIED BY THE OWNER (T1070, register row T333-a). ***
-- Paste in the Supabase SQL editor AFTER 060. It depends on 014 (is_admin,
-- admin_guard, admin_log), 037, 039 and 051 (content_reports, report_guide)
-- and on Supabase Storage (schema storage). Never `db push` against
-- ntssxktaduxzpsmejwyv. Pasting twice is safe. Look for "user uploads
-- self-check passed". The way back is 061_user_uploads_down.sql. The ordered
-- owner procedure, with the Edge Function deploy and the vault secrets, is
-- Execution/P15/_OPEN-uploads.md.
--
-- The server half of the photo and track upload path that T333 built on the
-- device (src/community/uploads.js, UploadForm.jsx) and designed in its
-- report (archive tag archive/execution-full-2026-11-03,
-- Execution/P8/T333-upload-path.md, "The server half, designed"). Before this
-- file a send answered "did not send, nothing was stored".
--
--   user_uploads         one row per upload: who, what (photo or track), for
--                        which page (layer, item), where the file sits, the
--                        licence, the credit, the OpenStreetMap permission,
--                        which wording of the Terms and of the OSM tick it
--                        was given under, its review status, the server
--                        privacy pass, and the decision with its statement of
--                        reasons (the fields T070 uses for guides). RLS on;
--                        the owner reads their own rows; no client write
--                        policy at all: every write goes through a function.
--   upload_purge_queue   files the Storage API must delete: a reserved row
--                        that never got a file, an upload its owner removed,
--                        a declined upload past its contest period, and the
--                        whole {uid}/ folder of a deleted account. Closed
--                        table (RLS on, no policy). The upload-scan Edge
--                        Function empties it through the Storage API,
--                        because deleting a row in storage.objects does not
--                        delete the file behind it.
--   storage bucket       user-uploads, private, 25 MB, image/jpeg,
--                        image/png and application/gpx+xml only.
--   storage policies     insert only into the caller's own folder and only at
--                        the path of one of their own reserved rows; read for
--                        the owner and an admin, and for anyone when the
--                        matching row is published, so a page can ask for a
--                        signed URL without the bucket ever being public. No
--                        update and no delete policy: nothing is overwritten
--                        from a client.
--   begin_upload(...)    checks the session, the target, the licence, the
--                        credit, the grant (terms version), the OSM tick and
--                        the size, holds a daily limit under an advisory lock
--                        the way 037 does, writes a reserved row and answers
--                        { id, path }. Signature as src/community/uploads.js
--                        calls it.
--   finish_upload(id)    the caller's own reserved row, the file must exist
--                        at its path with an allowed type and size; records
--                        the size and sets the row to pending.
--   remove_my_upload(id) the owner withdraws an upload (the Terms promise
--                        removal on request); the file is queued for deletion.
--   report_content(...)  notice and action for uploads (the upload half of
--                        T068-h): the same validation, buckets and words as
--                        report_guide, with a target kind. 'guide' is handed
--                        to report_guide unchanged; 'byline' answers
--                        bad_target until the byline half of T068-h exists.
--   list_published_uploads(layer, item)  what a page may show: published
--                        uploads with their credit and licence, nothing else.
--   upload_is_published(name)  the storage read policy's helper.
--   admin_list_uploads(...)    the review queue (read tier).
--   admin_decide_upload(id, action, ground, statement)  publish, decline or
--                        remove, behind admin_guard('live'); a decline or a
--                        removal needs a ground and a statement of reasons,
--                        as T070 does for guides; publishing needs the server
--                        privacy pass to have run. One audit row per decision.
--   upload_mark_scanned(id, result, bytes)  service role only: the
--                        upload-scan Edge Function records its pass.
--   uploads_sweep()      service role only: reserved rows older than a day
--                        are deleted (their path is queued), declined and
--                        removed files past their contest date are queued.
--
-- THE SERVER PRIVACY PASS. The device pass can be skipped by anybody who
-- calls the Storage API directly, so the server does not trust it. Every
-- pending upload is downloaded by supabase/functions/upload-scan and run
-- through the same two modules (copies in supabase/functions/_shared, kept
-- byte-identical to the app's by continent-app/tests/uploadScan.test.mjs). A
-- photo with metadata left is stripped again and rewritten; a track is
-- trimmed again and rewritten, geometry only. A file neither module can read
-- is removed. admin_decide_upload refuses to publish an upload the pass has
-- not cleared.
--
-- THE SCHEDULE. Every 15 minutes pg_cron asks pg_net to POST to upload-scan,
-- with the same prerequisites as 060: pg_cron and pg_net enabled, and two
-- vault secrets, uploads_scan_url and uploads_scan_secret. Without them the
-- block below schedules nothing and says so; uploads then wait in pending.
--
-- WORDING VERSIONS. begin_upload accepts the Terms version and the OSM tick
-- version that uploads.js sends (UPLOAD_TERMS_VERSION, OSM_TICK_VERSION, both
-- 2026-10-07). When either wording changes, change the constant there AND the
-- two v_terms and v_osm values below in a new migration, or every send
-- answers no_grant.

do $pre$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception 'Supabase Storage (schema storage) is missing; this migration needs it';
  end if;
  if to_regprocedure('public.admin_guard(text)') is null or to_regprocedure('public.admin_log(text,uuid,jsonb)') is null then
    raise exception 'admin_guard or admin_log is missing; paste 014, 015 and 051 first';
  end if;
  if to_regprocedure('public.report_guide(uuid,text,text,text,boolean)') is null then
    raise exception 'report_guide (051) is missing; paste 051 first';
  end if;
end;
$pre$;

-- ===========================================================================
-- 1. Tables
-- ===========================================================================
create table if not exists public.user_uploads (
  id              uuid primary key default gen_random_uuid(),
  owner           uuid not null references auth.users (id) on delete cascade,
  kind            text not null check (kind in ('photo', 'track')),
  layer           text not null check (layer in ('trail', 'beach', 'lake', 'mountain', 'cycle')),
  item_id         text not null check (item_id ~ '^[^/[:space:]]{1,200}$'),
  storage_path    text not null unique,
  declared_bytes  bigint not null check (declared_bytes > 0),
  stored_bytes    bigint check (stored_bytes is null or stored_bytes > 0),
  mime            text check (mime is null or mime in ('image/jpeg', 'image/png', 'application/gpx+xml')),
  licence         text not null check (licence in ('platform', 'cc-by-4.0', 'cc-by-sa-4.0')),
  credit          text not null check (char_length(credit) between 2 and 80),
  osm_permission  boolean,
  osm_wording     text,
  terms_version   text not null,
  granted_at      timestamptz not null default now(),
  status          text not null default 'reserved'
                  check (status in ('reserved', 'pending', 'published', 'declined', 'removed')),
  created_at      timestamptz not null default now(),
  finished_at     timestamptz,
  scanned_at      timestamptz,
  scan_result     text check (scan_result is null or scan_result ~ '^(clean|cleaned|refused:[a-z_]{1,40})$'),
  decided_by      uuid references auth.users (id) on delete set null,
  decided_at      timestamptz,
  ground          text check (ground is null or ground in ('illegal', 'terms')),
  statement       text check (statement is null or char_length(statement) between 10 and 2000),
  contest_until   timestamptz,
  purged_at       timestamptz,
  -- A photo carries no OSM answer; a track always carries one, and a yes
  -- names the wording it was given under.
  constraint user_uploads_osm_ck check (
    (kind = 'photo' and osm_permission is null and osm_wording is null)
    or (kind = 'track' and osm_permission is not null
        and (osm_permission = (osm_wording is not null)))
  ),
  -- A decline or a removal by an admin carries its reasons.
  constraint user_uploads_reasons_ck check (
    status not in ('declined') or (ground is not null and statement is not null)
  )
);

create index if not exists user_uploads_owner_idx   on public.user_uploads (owner, created_at desc);
create index if not exists user_uploads_target_idx  on public.user_uploads (layer, item_id) where status = 'published';
create index if not exists user_uploads_status_idx  on public.user_uploads (status, created_at);

alter table public.user_uploads enable row level security;
-- Supabase grants new tables to the API roles by default; only the owner's
-- read is given back, and only through the policy below.
revoke all on table public.user_uploads from public, anon, authenticated;
grant select on table public.user_uploads to authenticated;

drop policy if exists user_uploads_select_own on public.user_uploads;
create policy user_uploads_select_own on public.user_uploads
  for select to authenticated using (auth.uid() = owner);

create table if not exists public.upload_purge_queue (
  id         bigint generated always as identity primary key,
  path       text not null check (char_length(path) between 2 and 300),
  is_prefix  boolean not null default false,
  reason     text not null check (reason in ('sweep', 'owner', 'refused', 'contest_over', 'account_deleted', 'row_deleted')),
  queued_at  timestamptz not null default now()
);

alter table public.upload_purge_queue enable row level security;
revoke all on table public.upload_purge_queue from public, anon, authenticated;

do $$
declare
  seq text := pg_get_serial_sequence('public.upload_purge_queue', 'id');
begin
  if seq is not null then
    execute format('revoke all on sequence %s from public, anon, authenticated', seq);
  end if;
end;
$$;

-- Every row that goes, by whatever path (the sweep, the account cascade, an
-- admin delete of the account), leaves its file in the queue.
create or replace function public.user_uploads_queue_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.purged_at is null then
    insert into public.upload_purge_queue (path, reason) values (old.storage_path, 'row_deleted');
  end if;
  return old;
end;
$$;
revoke all on function public.user_uploads_queue_file() from public, anon, authenticated;

drop trigger if exists user_uploads_queue_file on public.user_uploads;
create trigger user_uploads_queue_file
  after delete on public.user_uploads
  for each row execute function public.user_uploads_queue_file();

-- Account deletion removes the whole {uid}/ folder (T333 design). The row
-- trigger above already queues every file that has a row; the folder entry
-- also catches anything in the folder without one. A trigger on auth.users
-- (the pattern of 010's on_auth_user_created) covers delete_user() (005) and
-- admin_delete_user alike, without re-creating either.
create or replace function public.user_uploads_queue_folder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.upload_purge_queue (path, is_prefix, reason)
  values (old.id::text || '/', true, 'account_deleted');
  return old;
end;
$$;
revoke all on function public.user_uploads_queue_folder() from public, anon, authenticated;

drop trigger if exists on_auth_user_deleted_uploads on auth.users;
create trigger on_auth_user_deleted_uploads
  after delete on auth.users
  for each row execute function public.user_uploads_queue_folder();

-- ===========================================================================
-- 2. The private bucket and its policies
-- ===========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-uploads', 'user-uploads', false, 26214400,
        array['image/jpeg', 'image/png', 'application/gpx+xml'])
on conflict (id) do update set
  public             = false,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Is the object at this name a published upload? Definer, so the storage
-- read policy can ask it for a signed-out visitor, who has no grant on
-- user_uploads.
create or replace function public.upload_is_published(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_uploads u
     where u.storage_path = p_name and u.status = 'published'
  );
$$;
revoke all on function public.upload_is_published(text) from public;
grant execute on function public.upload_is_published(text) to anon, authenticated, service_role;

drop policy if exists user_uploads_insert_own_slot on storage.objects;
create policy user_uploads_insert_own_slot on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'user-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.user_uploads u
       where u.storage_path = name and u.owner = auth.uid() and u.status = 'reserved'
    )
  );

drop policy if exists user_uploads_read_own_or_admin on storage.objects;
create policy user_uploads_read_own_or_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'user-uploads'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists user_uploads_read_published on storage.objects;
create policy user_uploads_read_published on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'user-uploads' and public.upload_is_published(name));

-- ===========================================================================
-- 3. The write path: begin, finish, withdraw
-- ===========================================================================
create or replace function public.begin_upload(
  p_kind           text,
  p_layer          text,
  p_item_id        text,
  p_licence        text,
  p_credit         text,
  p_osm_permission boolean,
  p_osm_wording    text,
  p_terms_version  text,
  p_bytes          bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- The wordings the form shows today (uploads.js UPLOAD_TERMS_VERSION and
  -- OSM_TICK_VERSION). A grant under any other wording is no grant.
  v_terms  constant text := '2026-10-07';
  v_osm    constant text := '2026-10-07';
  v_uid    uuid := auth.uid();
  v_credit text := regexp_replace(coalesce(p_credit, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_id     uuid := gen_random_uuid();
  v_path   text;
  n        int;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_signed_in');
  end if;
  if p_kind is null or p_kind not in ('photo', 'track')
     or p_layer is null or p_layer not in ('trail', 'beach', 'lake', 'mountain', 'cycle')
     or p_item_id is null or p_item_id !~ '^[^/[:space:]]{1,200}$' then
    return jsonb_build_object('error', 'bad_target');
  end if;
  if p_licence is null or p_licence not in ('platform', 'cc-by-4.0', 'cc-by-sa-4.0') then
    return jsonb_build_object('error', 'bad_licence');
  end if;
  if char_length(v_credit) < 2 or char_length(v_credit) > 80 then
    return jsonb_build_object('error', 'bad_credit');
  end if;
  if p_terms_version is distinct from v_terms then
    return jsonb_build_object('error', 'no_grant');
  end if;
  -- A photo carries no OSM answer. A track carries one, and a yes carries
  -- the current wording of the tick.
  if p_kind = 'photo' and (p_osm_permission is not null or p_osm_wording is not null) then
    return jsonb_build_object('error', 'bad_osm');
  end if;
  if p_kind = 'track' and (
       p_osm_permission is null
       or (p_osm_permission and p_osm_wording is distinct from v_osm)
       or (not p_osm_permission and p_osm_wording is not null)) then
    return jsonb_build_object('error', 'bad_osm');
  end if;
  if p_bytes is null or p_bytes <= 0
     or (p_kind = 'photo' and p_bytes > 26214400)
     or (p_kind = 'track' and p_bytes > 10485760) then
    return jsonb_build_object('error', 'too_big');
  end if;

  -- The daily limit, under a lock so parallel sends from one account queue
  -- behind each other instead of racing past the count (037's pattern).
  perform pg_advisory_xact_lock(hashtextextended('user_uploads:' || v_uid::text, 0));
  select count(*) into n from public.user_uploads u
   where u.owner = v_uid and u.created_at > now() - interval '1 day';
  if n >= 20 then
    return jsonb_build_object('error', 'too_many');
  end if;
  -- And a ceiling on what the whole service takes in a day.
  select count(*) into n from public.user_uploads u
   where u.created_at > now() - interval '1 day';
  if n >= 2000 then
    return jsonb_build_object('error', 'too_many');
  end if;

  v_path := v_uid::text || '/' || v_id::text || case when p_kind = 'photo' then '.jpg' else '.gpx' end;

  insert into public.user_uploads
    (id, owner, kind, layer, item_id, storage_path, declared_bytes, licence, credit,
     osm_permission, osm_wording, terms_version)
  values
    (v_id, v_uid, p_kind, p_layer, p_item_id, v_path, p_bytes, p_licence, v_credit,
     case when p_kind = 'track' then p_osm_permission end,
     case when p_kind = 'track' and p_osm_permission then v_osm end,
     v_terms);

  return jsonb_build_object('id', v_id, 'path', v_path);
end;
$$;

revoke all on function public.begin_upload(text, text, text, text, text, boolean, text, text, bigint) from public, anon;
grant execute on function public.begin_upload(text, text, text, text, text, boolean, text, text, bigint) to authenticated, service_role;

create or replace function public.finish_upload(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_row  public.user_uploads%rowtype;
  v_meta jsonb;
  v_size bigint;
  v_mime text;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_signed_in');
  end if;
  select * into v_row from public.user_uploads u
   where u.id = p_id and u.owner = v_uid
     for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_row.status = 'pending' then
    return jsonb_build_object('ok', true, 'id', v_row.id);   -- a retried call
  end if;
  if v_row.status <> 'reserved' then
    return jsonb_build_object('error', 'not_reserved');
  end if;

  select o.metadata into v_meta from storage.objects o
   where o.bucket_id = 'user-uploads' and o.name = v_row.storage_path;
  if not found then
    return jsonb_build_object('error', 'no_object');
  end if;
  v_size := nullif(v_meta ->> 'size', '')::bigint;
  v_mime := lower(coalesce(v_meta ->> 'mimetype', ''));

  -- The file must be what the row says it is. A mismatch is withdrawn on
  -- the spot: the row goes and its file is queued by the delete trigger.
  if v_size is null or v_size <= 0
     or (v_row.kind = 'photo' and (v_mime not in ('image/jpeg', 'image/png') or v_size > 26214400))
     or (v_row.kind = 'track' and (v_mime <> 'application/gpx+xml' or v_size > 10485760)) then
    delete from public.user_uploads where id = v_row.id;
    return jsonb_build_object('error', 'bad_file');
  end if;

  update public.user_uploads
     set status = 'pending', stored_bytes = v_size, mime = v_mime, finished_at = now()
   where id = v_row.id;
  return jsonb_build_object('ok', true, 'id', v_row.id);
end;
$$;

revoke all on function public.finish_upload(uuid) from public, anon;
grant execute on function public.finish_upload(uuid) to authenticated, service_role;

create or replace function public.remove_my_upload(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.user_uploads%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_signed_in');
  end if;
  select * into v_row from public.user_uploads u
   where u.id = p_id and u.owner = v_uid
     for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_row.status = 'removed' then
    return jsonb_build_object('ok', true);
  end if;
  update public.user_uploads
     set status = 'removed', purged_at = now()
   where id = v_row.id;
  insert into public.upload_purge_queue (path, reason) values (v_row.storage_path, 'owner');
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.remove_my_upload(uuid) from public, anon;
grant execute on function public.remove_my_upload(uuid) to authenticated, service_role;

-- What a page may show: published uploads for one item, credit and licence.
create or replace function public.list_published_uploads(p_layer text, p_item_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',      u.id,
           'kind',    u.kind,
           'path',    u.storage_path,
           'credit',  u.credit,
           'licence', u.licence,
           'osm',     coalesce(u.osm_permission, false),
           'at',      u.decided_at
         ) order by u.decided_at desc), '[]'::jsonb)
    from public.user_uploads u
   where u.layer = p_layer and u.item_id = p_item_id and u.status = 'published';
$$;
revoke all on function public.list_published_uploads(text, text) from public;
grant execute on function public.list_published_uploads(text, text) to anon, authenticated, service_role;

-- ===========================================================================
-- 4. Notice and action: report_content, with a target on content_reports
-- ===========================================================================
alter table public.content_reports
  add column if not exists target_kind text not null default 'guide',
  add column if not exists target_id   text;
alter table public.content_reports alter column plan_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'content_reports_target_kind_ck') then
    alter table public.content_reports add constraint content_reports_target_kind_ck
      check (target_kind in ('guide', 'upload', 'byline'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'content_reports_target_ck') then
    alter table public.content_reports add constraint content_reports_target_ck
      check ((target_kind = 'guide' and plan_id is not null)
          or (target_kind <> 'guide' and target_id is not null and char_length(target_id) <= 200));
  end if;
end;
$$;

create index if not exists content_reports_target_idx
  on public.content_reports (target_kind, target_id) where target_kind <> 'guide';

-- report_guide's validation, network bucket, rate limit and words, with a
-- target kind. The source hashing below is 051's report_guide, line for line.
create or replace function public.report_content(
  p_kind          text,
  p_target_id     text,
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
  v_upload  public.user_uploads%rowtype;
  v_plan    uuid;
  n         int;
begin
  -- 0. A guide goes through its own door, unchanged.
  if p_kind = 'guide' then
    begin
      v_plan := p_target_id::uuid;
    exception when others then
      return jsonb_build_object('error', 'bad_target');
    end;
    return public.report_guide(v_plan, p_reason, p_contact_email, p_reporter_name, p_good_faith);
  end if;
  if p_kind is null or p_kind <> 'upload' then
    return jsonb_build_object('error', 'bad_target');
  end if;

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

  -- 2. Where it came from (051's report_guide).
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
      v_key := 'raw:' || left(v_raw, 100);
    end;
  else
    v_key := 'unknown';
  end if;

  select s.salt into v_salt from public.content_report_salt s where s.id = 1;
  v_hash := encode(sha256(convert_to(coalesce(v_salt, '') || '|' || v_key, 'UTF8')), 'hex');

  -- 3. The rate limit, shared with report_guide: the same locks and the
  --    same counts over every kind of report.
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

  -- 4. Only a published upload can be reported: nothing else is public.
  begin
    select * into v_upload from public.user_uploads u
     where u.id = p_target_id::uuid and u.status = 'published';
  exception when others then
    return jsonb_build_object('error', 'bad_target');
  end;
  if v_upload.id is null then
    return jsonb_build_object('error', 'not_public');
  end if;

  perform public.moderation_retention_purge();

  insert into public.content_reports
    (plan_id, target_kind, target_id, plan_owner, plan_label, reason, contact_email,
     reporter_id, source_hash, source_header, reporter_name, good_faith)
  values
    (null, 'upload', v_upload.id::text, v_upload.owner,
     v_upload.kind || ' on ' || v_upload.layer || ' ' || v_upload.item_id,
     v_reason, v_email, v_uid, v_hash, v_header, v_name, true);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.report_content(text, text, text, text, text, boolean) from public;
grant execute on function public.report_content(text, text, text, text, text, boolean) to anon, authenticated, service_role;

-- 051's admin_list_content_reports, limited to guide reports (target_kind =
-- 'guide' in the two counts and the page). The Reports tab builds a guide URL
-- and an Unpublish form from planId, so an upload report must not reach it;
-- upload reports are listed with their upload by admin_list_uploads.
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
               where target_kind = 'guide' and (v_status is null or status = v_status)),
    'new',   (select count(*) from public.content_reports where target_kind = 'guide' and status = 'new'),
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
             where target_kind = 'guide' and (v_status is null or status = v_status)
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
-- 5. The admin side: the review queue and the decision
-- ===========================================================================
create or replace function public.admin_list_uploads(
  p_status text default 'pending',
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
  if v_status is not null and v_status not in ('reserved', 'pending', 'published', 'declined', 'removed') then
    v_status := null;
  end if;

  return jsonb_build_object(
    'total',   (select count(*) from public.user_uploads where v_status is null or status = v_status),
    'pending', (select count(*) from public.user_uploads where status = 'pending'),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',          u.id,
        'createdAt',   u.created_at,
        'status',      u.status,
        'kind',        u.kind,
        'layer',       u.layer,
        'itemId',      u.item_id,
        'path',        u.storage_path,
        'bytes',       u.stored_bytes,
        'licence',     u.licence,
        'credit',      u.credit,
        'osm',         u.osm_permission,
        'termsVersion', u.terms_version,
        'scannedAt',   u.scanned_at,
        'scanResult',  u.scan_result,
        'ownerId',     u.owner,
        'ownerHandle', op.handle,
        'decidedAt',   u.decided_at,
        'ground',      u.ground,
        'statement',   u.statement,
        'reportsNew',  (select count(*) from public.content_reports r
                         where r.target_kind = 'upload' and r.target_id = u.id::text and r.status = 'new'),
        'reports',     coalesce((select jsonb_agg(jsonb_build_object(
                           'id', r.id, 'createdAt', r.created_at, 'status', r.status,
                           'reason', r.reason, 'reporterName', r.reporter_name) order by r.id desc)
                         from public.content_reports r
                        where r.target_kind = 'upload' and r.target_id = u.id::text), '[]'::jsonb)
      ) order by u.created_at)
      from (select * from public.user_uploads
             where v_status is null or status = v_status
             order by created_at limit v_limit offset v_offset) u
      left join public.profiles op on op.user_id = u.owner
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_list_uploads(text, int, int) from public, anon;
grant execute on function public.admin_list_uploads(text, int, int) to authenticated, service_role;

create or replace function public.admin_decide_upload(
  p_id        uuid,
  p_action    text,
  p_ground    text default null,
  p_statement text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_err       text := public.admin_guard('live');
  v_row       public.user_uploads%rowtype;
  v_statement text := nullif(trim(coalesce(p_statement, '')), '');
  v_status    text;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  if p_action is null or p_action not in ('publish', 'decline', 'remove') then
    return jsonb_build_object('error', 'bad_action');
  end if;
  -- A decline or a removal is a restriction: it carries a ground and a
  -- statement of reasons the uploader can read and contest (T070, DSA
  -- Article 17). Publishing needs neither.
  if p_action <> 'publish' then
    if p_ground is null or p_ground not in ('illegal', 'terms') then
      return jsonb_build_object('error', 'bad_ground');
    end if;
    if v_statement is null or char_length(v_statement) < 10 or char_length(v_statement) > 2000 then
      return jsonb_build_object('error', 'bad_reason');
    end if;
  end if;

  select * into v_row from public.user_uploads u where u.id = p_id for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  if p_action = 'publish' then
    if v_row.status <> 'pending' then
      return jsonb_build_object('error', 'not_pending');
    end if;
    -- The server privacy pass must have cleared the file.
    if v_row.scanned_at is null or v_row.scan_result not in ('clean', 'cleaned') then
      return jsonb_build_object('error', 'not_scanned');
    end if;
    v_status := 'published';
  elsif p_action = 'decline' then
    if v_row.status <> 'pending' then
      return jsonb_build_object('error', 'not_pending');
    end if;
    v_status := 'declined';
  else
    if v_row.status <> 'published' then
      return jsonb_build_object('error', 'not_published');
    end if;
    v_status := 'removed';
  end if;

  update public.user_uploads
     set status        = v_status,
         decided_by    = auth.uid(),
         decided_at    = now(),
         ground        = case when p_action = 'publish' then null else p_ground end,
         statement     = case when p_action = 'publish' then null else v_statement end,
         contest_until = case when p_action = 'publish' then null else now() + interval '6 months' end
   where id = v_row.id;

  -- Open notices on this upload are answered by the decision.
  update public.content_reports r
     set status        = case when p_action = 'publish' then 'dismissed' else 'actioned' end,
         decided_at    = now(),
         decided_by    = auth.uid(),
         decision_note = coalesce(v_statement, 'Published after review.')
   where r.target_kind = 'upload' and r.target_id = v_row.id::text and r.status = 'new';

  perform public.admin_log('upload_' || p_action, v_row.owner, jsonb_build_object(
    'upload', v_row.id, 'kind', v_row.kind, 'layer', v_row.layer, 'item', v_row.item_id,
    'previous', v_row.status, 'ground', p_ground, 'reason', v_statement));

  return jsonb_build_object('ok', true, 'id', v_row.id, 'status', v_status);
end;
$$;

revoke all on function public.admin_decide_upload(uuid, text, text, text) from public, anon;
grant execute on function public.admin_decide_upload(uuid, text, text, text) to authenticated, service_role;

-- ===========================================================================
-- 6. The service side: the privacy pass result and the sweep
-- ===========================================================================
create or replace function public.upload_mark_scanned(p_id uuid, p_result text, p_bytes bigint default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.user_uploads%rowtype;
begin
  if p_result is null or p_result !~ '^(clean|cleaned|refused:[a-z_]{1,40})$' then
    return jsonb_build_object('error', 'bad_result');
  end if;
  select * into v_row from public.user_uploads u where u.id = p_id for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_row.status <> 'pending' then
    return jsonb_build_object('error', 'not_pending');
  end if;
  if p_result like 'refused:%' then
    -- A file the server cannot vouch for is never shown: it is removed and
    -- its file queued. Not a moderation decision, so no ground.
    update public.user_uploads
       set scanned_at = now(), scan_result = p_result, status = 'removed', purged_at = now()
     where id = v_row.id;
    insert into public.upload_purge_queue (path, reason) values (v_row.storage_path, 'refused');
  else
    update public.user_uploads
       set scanned_at = now(), scan_result = p_result,
           stored_bytes = coalesce(nullif(p_bytes, 0), stored_bytes)
     where id = v_row.id;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.upload_mark_scanned(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.upload_mark_scanned(uuid, text, bigint) to service_role;

create or replace function public.uploads_sweep()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reserved bigint;
  v_expired  bigint;
begin
  -- Reserved rows with no finish after a day: the row goes, and the delete
  -- trigger queues whatever file may sit at its path.
  delete from public.user_uploads
   where status = 'reserved' and created_at < now() - interval '1 day';
  get diagnostics v_reserved = row_count;

  -- Declined and removed files past their contest date: the file goes, the
  -- row (with its statement of reasons) stays as the record.
  with gone as (
    update public.user_uploads
       set purged_at = now()
     where status in ('declined', 'removed') and purged_at is null
       and contest_until is not null and contest_until < now()
    returning storage_path
  )
  insert into public.upload_purge_queue (path, reason)
  select storage_path, 'contest_over' from gone;
  get diagnostics v_expired = row_count;

  return jsonb_build_object('reserved', v_reserved, 'expired', v_expired);
end;
$$;

revoke all on function public.uploads_sweep() from public, anon, authenticated;
grant execute on function public.uploads_sweep() to service_role;

-- ===========================================================================
-- 7. The schedule: every 15 minutes, when pg_cron, pg_net and the two vault
--    secrets are there (060's pattern).
-- ===========================================================================
do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_cron or pg_net is not enabled: upload-scan is not scheduled and uploads wait in pending. Enable both, add the vault secrets uploads_scan_url and uploads_scan_secret, then paste 061 again.';
  elsif not exists (select 1 from vault.secrets where name = 'uploads_scan_url')
     or not exists (select 1 from vault.secrets where name = 'uploads_scan_secret') then
    raise notice 'the vault secrets uploads_scan_url and uploads_scan_secret are missing: upload-scan is not scheduled. Add both, then paste 061 again.';
  else
    perform cron.schedule('carta_uploads_scan', '*/15 * * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'uploads_scan_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-uploads-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'uploads_scan_secret')),
        body := '{"job":"scan"}'::jsonb,
        timeout_milliseconds := 120000)
    $job$);
    raise notice 'upload-scan scheduled every 15 minutes through pg_cron';
  end if;
end;
$cron$;

-- ===========================================================================
-- 8. Self-check
-- ===========================================================================
do $$
declare
  fn text;
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'user_uploads' and rowsecurity) then
    raise exception 'row level security is off on user_uploads';
  end if;
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'upload_purge_queue' and rowsecurity) then
    raise exception 'row level security is off on upload_purge_queue';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_uploads' and cmd <> 'SELECT') then
    raise exception 'user_uploads must have no client write policy';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'upload_purge_queue') then
    raise exception 'upload_purge_queue must have no policy';
  end if;
  if has_table_privilege('authenticated', 'public.user_uploads', 'insert')
     or has_table_privilege('authenticated', 'public.user_uploads', 'update')
     or has_table_privilege('anon', 'public.user_uploads', 'select') then
    raise exception 'user_uploads grants are wider than the owner read';
  end if;
  if not exists (select 1 from storage.buckets where id = 'user-uploads' and not public) then
    raise exception 'the user-uploads bucket is missing or public';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
              and policyname like 'user\_uploads\_%' and cmd in ('UPDATE', 'DELETE', 'ALL')) then
    raise exception 'no client may update or delete an upload object';
  end if;
  for fn in select unnest(array[
    'public.begin_upload(text,text,text,text,text,boolean,text,text,bigint)',
    'public.finish_upload(uuid)', 'public.remove_my_upload(uuid)',
    'public.report_content(text,text,text,text,text,boolean)',
    'public.list_published_uploads(text,text)', 'public.upload_is_published(text)',
    'public.admin_list_uploads(text,integer,integer)',
    'public.admin_decide_upload(uuid,text,text,text)',
    'public.upload_mark_scanned(uuid,text,bigint)', 'public.uploads_sweep()'
  ]) loop
    if not exists (select 1 from pg_proc where oid = to_regprocedure(fn) and prosecdef
                    and array_to_string(proconfig, ',') like '%search_path=%') then
      raise exception '% is not SECURITY DEFINER with a pinned search_path', fn;
    end if;
  end loop;
  for fn in select unnest(array[
    'public.upload_mark_scanned(uuid,text,bigint)', 'public.uploads_sweep()'
  ]) loop
    if has_function_privilege('authenticated', fn, 'execute') or has_function_privilege('anon', fn, 'execute') then
      raise exception '% must be callable by the service role only', fn;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.begin_upload(text,text,text,text,text,boolean,text,text,bigint)', 'execute') then
    raise exception 'begin_upload must not be callable signed out';
  end if;
  raise notice 'user uploads self-check passed';
end;
$$;

notify pgrst, 'reload schema';
