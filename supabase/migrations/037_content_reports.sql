-- 037_content_reports.sql
--
-- The electronic notice mechanism: content_reports, report_guide() and
-- admin_list_content_reports().
--
-- WHY. Since 019 a traveller can publish a trip plan as a public guide, so
-- Carta hosts content that anyone can read. Article 16 of the Digital
-- Services Act requires every hosting service offered in the EU, whatever
-- its size, to give anyone an electronic, easy to reach way to report
-- content they consider illegal. Before this file there was none: the only
-- inbound channel was the feedback form, which is not tied to a guide and
-- has no queue a moderator can act on. This file is the intake half. The
-- takedown RPC (T069) and the statement of reasons and complaints route
-- (T070) act on what lands here.
--
-- WHAT IT ADDS.
--
--   public.content_reports            one row per accepted report. Private:
--                                     RLS on, no policy, no grant to anon or
--                                     authenticated. Nothing reads it except
--                                     the two definer functions below.
--   public.content_report_salt        one random salt, private, used to hash
--                                     the caller's network address.
--   public.report_guide(plan, reason, contact_email)
--                                     the write path. Granted to anon, so a
--                                     visitor who never signed up can report.
--   public.admin_list_content_reports(status, limit, offset)
--                                     the read path for the admin Reports
--                                     tab, behind admin_guard('read').
--
-- report_guide ANSWERS jsonb: {"ok": true} when stored, or {"error": word}
-- with one of these words, which the app translates:
--
--   bad_reason   the reason is under 10 or over 4000 characters after
--                trimming.
--   bad_email    a contact email was given and is not a plausible address
--                (over 254 characters, or not local@domain.tld).
--   too_many     this source already filed 5 reports in the last hour, or
--                the whole service took 500 in the last hour. Distinct from
--                slow_down, which is the admin guard's word for admins, and
--                the same word submit_feedback (017) uses for its limit.
--   not_public   there is no public guide with that id. A private plan and
--                a missing one get the same answer on purpose, so the RPC
--                cannot be used to probe which plan ids exist.
--
-- THE RATE LIMIT, and why it counts two things. A report is refused when
-- EITHER of these already holds 5 reports in the last hour:
--
--   the network source   the caller's IP address (an IPv6 address counts by
--                        its /64, since one household gets a whole /64 and
--                        can rotate inside it for free), hashed with the
--                        salt and stored as source_hash;
--   the account          auth.uid(), when the caller has a session.
--
-- So a signed-in user cannot escape the address bucket by signing in, and
-- cannot escape the account bucket by moving network. A caller with no
-- session and no address header (the SQL editor, a misrouted request) falls
-- in one shared "unknown" bucket, which is the strict failure: they share 5
-- an hour between them rather than getting an unlimited path. A per-source
-- advisory lock is taken before counting, so two parallel requests cannot
-- both see 4 and both insert. The global ceiling of 500 an hour is the
-- backstop for a flood from many addresses; it is deliberately far above
-- any real volume, because a ceiling low enough to bite also lets one
-- attacker silence every honest reporter for an hour.
--
-- The counts come from content_reports itself. A dedicated rate table was
-- not needed: a refused call inserts nothing, and an accepted call is
-- exactly the row being counted. paywall_events (022) was not used because
-- its rows are funnel analytics with their own meaning and retention.
--
-- WHICH HEADER IS TRUSTED FOR THE ADDRESS. Under PostgREST the request
-- headers are in current_setting('request.headers', true) as json. The
-- order is:
--
--   1. cf-connecting-ip. Supabase's API sits behind Cloudflare, which sets
--      this header itself to the address the connection came from and
--      overwrites any value the client sent. It is the one header a caller
--      cannot choose.
--   2. x-forwarded-for, first entry, only when 1 is absent. Proxies append
--      to this list, so the first entry is whatever the client claimed and
--      can be forged. It is a fallback so that a deployment without
--      Cloudflare in front still gets a per-address bucket; the account
--      bucket and the global ceiling still hold if it is forged.
--   3. none: the shared "unknown" bucket above.
--
-- Which header live traffic actually carries has not been observed from
-- this repository. source_header records it on every row, so the owner can
-- check with one query after the first real report (register row T068-c).
--
-- WHAT IS STORED ABOUT THE REPORTER. The account id when there is a session
-- (on delete set null, so deleting the account does not delete the notice).
-- The contact email only when the reporter typed one, never copied from the
-- account. The address only as a salted sha256 hash, which lets a moderator
-- see "12 reports from one source" without the table holding an IP. It is
-- pseudonymous, not anonymous: whoever can read the salt can test guesses.
--
-- WHAT IS STORED ABOUT THE GUIDE. plan_id without a foreign key, plus the
-- owner and the title as they were at the moment of the report. A notice
-- has to survive the author deleting or retitling the plan, because the
-- record of what was reported is the point.
--
-- STATUS is 'new' on every row this file writes. 'actioned' and 'dismissed'
-- are allowed by the check so T069 and T070 can move a row without another
-- constraint change; nothing here sets them.
--
-- ORDER. Apply in the Supabase SQL editor AFTER 036. It needs 019
-- (visibility 'public' on trip_plans), 010 (profiles) and 015
-- (admin_guard); the self-check refuses to pass without them. Never
-- `db push` against ntssxktaduxzpsmejwyv; paste this file by hand and look
-- for the notice "content reports self-check passed". Safe to paste twice:
-- tables and indexes are "if not exists", the salt is inserted only once,
-- functions are create or replace.
--
-- DOWN MIGRATION. One-way for the data: dropping the table deletes every
-- notice received, which is a record the service is expected to keep.
-- Export it first (select * from public.content_reports) if it has rows.
--
--   drop function if exists public.admin_list_content_reports(text, int, int);
--   drop function if exists public.report_guide(uuid, text, text);
--   drop table if exists public.content_reports;
--   drop table if exists public.content_report_salt;
--   notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.content_reports (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  plan_id       uuid not null,
  plan_owner    uuid,
  plan_label    text,
  reason        text not null
                check (char_length(reason) between 10 and 4000),
  contact_email text
                check (contact_email is null or char_length(contact_email) <= 254),
  reporter_id   uuid references auth.users (id) on delete set null,
  source_hash   text not null,
  source_header text not null
                check (source_header in ('cf-connecting-ip', 'x-forwarded-for', 'none')),
  status        text not null default 'new'
                check (status in ('new', 'actioned', 'dismissed'))
);

create index if not exists content_reports_source_idx
  on public.content_reports (source_hash, created_at desc);
create index if not exists content_reports_reporter_idx
  on public.content_reports (reporter_id, created_at desc) where reporter_id is not null;
create index if not exists content_reports_created_idx
  on public.content_reports (created_at desc);
create index if not exists content_reports_status_idx
  on public.content_reports (status, id desc);
create index if not exists content_reports_plan_idx
  on public.content_reports (plan_id);

alter table public.content_reports enable row level security;
-- No policies at all: written through report_guide, read through
-- admin_list_content_reports. Supabase grants new tables to the API roles
-- by default, so the grants are taken back as well as RLS being on.
revoke all on table public.content_reports from public, anon, authenticated;

create table if not exists public.content_report_salt (
  id   int primary key default 1 check (id = 1),
  salt text not null
);
alter table public.content_report_salt enable row level security;
revoke all on table public.content_report_salt from public, anon, authenticated;
-- 244 random bits from two v4 uuids, set once. A second paste keeps the
-- first salt, so hashes stay comparable across pastes.
insert into public.content_report_salt (id, salt)
values (1, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (id) do nothing;

-- The identity sequence is a separate object with its own default grants.
do $$
declare
  seq text := pg_get_serial_sequence('public.content_reports', 'id');
begin
  if seq is not null then
    execute format('revoke all on sequence %s from public, anon, authenticated', seq);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- The write path, callable signed out
-- ---------------------------------------------------------------------------
create or replace function public.report_guide(
  p_plan_id       uuid,
  p_reason        text,
  p_contact_email text default null
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

  insert into public.content_reports
    (plan_id, plan_owner, plan_label, reason, contact_email, reporter_id, source_hash, source_header)
  values
    (p_plan_id, v_owner, v_label, v_reason, v_email, v_uid, v_hash, v_header);

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- The read path, for the admin Reports tab
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
                            where x.plan_id = r.plan_id)
      ) order by r.id desc)
      from (select * from public.content_reports
             where v_status is null or status = v_status
             order by id desc limit v_limit offset v_offset) r
      left join public.trip_plans tp on tp.id = r.plan_id
      left join public.profiles op    on op.user_id = r.plan_owner
      left join auth.users ou         on ou.id = r.plan_owner
      left join public.profiles rp    on rp.user_id = r.reporter_id
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.report_guide(uuid, text, text) from public;
grant execute on function public.report_guide(uuid, text, text) to anon, authenticated, service_role;

revoke all on function public.admin_list_content_reports(text, int, int) from public, anon;
grant execute on function public.admin_list_content_reports(text, int, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  fn_r   constant text := 'public.report_guide(uuid, text, text)';
  fn_a   constant text := 'public.admin_list_content_reports(text, int, int)';
  f      text;
  cfg    text[];
  res    jsonb;
  before bigint;
begin
  if to_regprocedure('public.admin_guard(text)') is null then
    raise exception 'public.admin_guard(text) is missing; apply 015 first';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'trip_plans' and column_name = 'visibility'
  ) then
    raise exception 'trip_plans has no visibility column; apply 011 and 019 first';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'public.profiles is missing; apply 010 first';
  end if;

  foreach f in array array[fn_r, fn_a] loop
    if not (select prosecdef from pg_proc where oid = f::regprocedure::oid) then
      raise exception '% is not SECURITY DEFINER', f;
    end if;
    select proconfig into cfg from pg_proc where oid = f::regprocedure::oid;
    if cfg is null or not ('search_path=""' = any(cfg)) then
      raise exception '% does not pin search_path to empty (proconfig %)', f, cfg;
    end if;
  end loop;

  if position('admin_guard(''read'')' in pg_get_functiondef(fn_a::regprocedure::oid)) = 0 then
    raise exception '% does not pass admin_guard(''read'')', fn_a;
  end if;

  -- The notice door is open to everyone; the admin door is not.
  if not has_function_privilege('anon', fn_r, 'execute') then
    raise exception 'anon cannot execute %; a signed-out visitor must be able to report', fn_r;
  end if;
  if not has_function_privilege('authenticated', fn_r, 'execute') then
    raise exception 'authenticated cannot execute %', fn_r;
  end if;
  if has_function_privilege('anon', fn_a, 'execute') then
    raise exception 'anon can execute %', fn_a;
  end if;

  -- The table is private: RLS on, no policy, no client privilege.
  if not (select relrowsecurity from pg_class where oid = 'public.content_reports'::regclass) then
    raise exception 'RLS is off on public.content_reports';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'content_reports') then
    raise exception 'public.content_reports has a policy; it must have none';
  end if;
  if has_table_privilege('anon', 'public.content_reports', 'select')
     or has_table_privilege('authenticated', 'public.content_reports', 'select')
     or has_table_privilege('anon', 'public.content_reports', 'insert')
     or has_table_privilege('authenticated', 'public.content_reports', 'insert') then
    raise exception 'a client role holds a privilege on public.content_reports';
  end if;
  if has_table_privilege('anon', 'public.content_report_salt', 'select')
     or has_table_privilege('authenticated', 'public.content_report_salt', 'select') then
    raise exception 'a client role can read public.content_report_salt';
  end if;
  if (select count(*) from public.content_report_salt) <> 1 then
    raise exception 'content_report_salt must hold exactly one row';
  end if;

  -- Refusals that store nothing. A random uuid is never a public plan; the
  -- editor's shared unknown bucket may already be full, hence too_many.
  select count(*) into before from public.content_reports;
  res := public.report_guide(gen_random_uuid(), 'a reason that is long enough', null);
  if coalesce(res ->> 'error', '') not in ('not_public', 'too_many') then
    raise exception '% answered an unknown plan with %, expected not_public', fn_r, res;
  end if;
  res := public.report_guide(gen_random_uuid(), 'short', null);
  if coalesce(res ->> 'error', '') <> 'bad_reason' then
    raise exception '% answered a 5 character reason with %, expected bad_reason', fn_r, res;
  end if;
  res := public.report_guide(gen_random_uuid(), 'a reason that is long enough', 'not an email');
  if coalesce(res ->> 'error', '') <> 'bad_email' then
    raise exception '% answered a malformed email with %, expected bad_email', fn_r, res;
  end if;
  if (select count(*) from public.content_reports) <> before then
    raise exception 'a refused report was stored';
  end if;

  -- In the SQL editor there is no signed-in caller, so the guard must refuse.
  res := public.admin_list_content_reports(null, 5, 0);
  if coalesce(res ->> 'error', '') <> 'forbidden' then
    raise exception '% answered a caller with no admin row with %, expected forbidden', fn_a, left(res::text, 200);
  end if;

  raise notice 'content reports self-check passed';
end;
$$;

notify pgrst, 'reload schema';
