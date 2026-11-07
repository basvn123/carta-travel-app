-- 074, T1215 (ROADMAP F8, row T1156-d): "report this answer" for AI text.
-- The down migration is 074_ai_reports_down.sql. Apply by pasting in the
-- SQL editor after 073. Never applied live by the session that wrote it.
--
-- WHY. The "How Carta uses AI" page (T1156) tells a traveller to mail a
-- wrong answer. A mail is slow to write and lands nowhere the eval sets can
-- read. This adds the in-app button's intake: one row per report on an Ask
-- Carta answer or a day plan, which the team turns into eval cases (the
-- 200-question Ask set, the 20-town plan-day set).
--
-- WHAT IT ADDS.
--
--   public.ai_reports       one row per accepted report. Private: RLS on, no
--                           policy, no grant to anon or authenticated.
--   public.ai_report_salt   one random salt, private, for the source hash.
--   public.ai_report(...)   the write path, granted to anon: a signed-out
--                           traveller can report too (Ask needs no account).
--   public.admin_list_ai_reports(feature, status, limit, offset)
--                           the read path, behind admin_guard('read').
--   public.ai_reports_prune()
--                           deletes rows older than 180 days; run by every
--                           accepted report and daily by pg_cron when on.
--
-- WHAT IS STORED, and what is not. The feature ('ask' or 'plan'), a reason
-- from a fixed list, the question (at most 300 characters: Ask's own limit
-- is 200, a day plan sends its town and free text), the answer as shown (at
-- most 2000), the app language, the model that wrote it when known (at most
-- 60), an optional note (at most 500), and a salted sha256 of the network
-- address for the rate limit. NO account id, no email, no name, no trip or
-- plan id, no raw address. The question and note are free text a traveller
-- typed and may hold personal data they chose to write; the button says the
-- question and answer are sent. Retention 180 days (ARTICLE30.md, 2a).
--
-- THE RATE LIMIT is content_reports' (037) without the account bucket,
-- since no account is stored: 5 reports an hour from one network source
-- (cf-connecting-ip, else the first x-forwarded-for entry, IPv6 by /64,
-- else one shared "unknown" bucket), and 300 an hour for the whole service.
-- A per-source advisory lock is taken before counting.
--
-- ai_report ANSWERS jsonb: {"ok": true} when stored, else {"error": word}:
--   bad_input   unknown feature, reason or language, or an empty answer.
--   too_many    the source or the service is over its hourly limit.
--
-- ORDER. Needs 015 (admin_guard). Safe to paste twice.

create table if not exists public.ai_reports (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  feature     text not null check (feature in ('ask', 'plan')),
  reason      text not null check (reason in ('wrong_fact', 'wrong_place', 'unsafe', 'other')),
  question    text not null default '' check (char_length(question) <= 300),
  answer      text not null check (char_length(answer) between 1 and 2000),
  lang        text not null check (lang in ('en', 'nl', 'de', 'fr', 'es', 'it')),
  model       text check (model is null or char_length(model) <= 60),
  note        text check (note is null or char_length(note) <= 500),
  source_hash text not null,
  status      text not null default 'new' check (status in ('new', 'added', 'dismissed'))
);
create index if not exists ai_reports_source_idx on public.ai_reports (source_hash, created_at desc);
create index if not exists ai_reports_created_idx on public.ai_reports (created_at desc);

alter table public.ai_reports enable row level security;
revoke all on table public.ai_reports from public, anon, authenticated;

create table if not exists public.ai_report_salt (
  id   int primary key default 1 check (id = 1),
  salt text not null
);
alter table public.ai_report_salt enable row level security;
revoke all on table public.ai_report_salt from public, anon, authenticated;
insert into public.ai_report_salt (id, salt)
values (1, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (id) do nothing;

do $$
declare
  seq text := pg_get_serial_sequence('public.ai_reports', 'id');
begin
  if seq is not null then
    execute format('revoke all on sequence %s from public, anon, authenticated', seq);
  end if;
end;
$$;

-- Retention: 180 days.
create or replace function public.ai_reports_prune()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n int;
begin
  delete from public.ai_reports where created_at < now() - interval '180 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.ai_reports_prune() from public, anon, authenticated;
grant execute on function public.ai_reports_prune() to service_role;

-- The write path, callable signed out.
create or replace function public.ai_report(
  p_feature  text,
  p_reason   text,
  p_question text,
  p_answer   text,
  p_lang     text,
  p_model    text default null,
  p_note     text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_feature text := lower(trim(coalesce(p_feature, '')));
  v_reason  text := lower(trim(coalesce(p_reason, '')));
  v_lang    text := lower(trim(coalesce(p_lang, '')));
  v_answer  text := left(trim(coalesce(p_answer, '')), 2000);
  v_question text := left(trim(coalesce(p_question, '')), 300);
  v_model   text := nullif(left(trim(coalesce(p_model, '')), 60), '');
  v_note    text := nullif(left(trim(coalesce(p_note, '')), 500), '');
  v_headers jsonb;
  v_raw     text;
  v_addr    inet;
  v_key     text;
  v_salt    text;
  v_hash    text;
  n         int;
begin
  if v_feature not in ('ask', 'plan')
     or v_reason not in ('wrong_fact', 'wrong_place', 'unsafe', 'other')
     or v_lang not in ('en', 'nl', 'de', 'fr', 'es', 'it')
     or v_answer = '' then
    return jsonb_build_object('error', 'bad_input');
  end if;

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
  select s.salt into v_salt from public.ai_report_salt s where s.id = 1;
  v_hash := encode(sha256(convert_to(coalesce(v_salt, '') || '|' || v_key, 'UTF8')), 'hex');

  perform pg_advisory_xact_lock(hashtextextended('ai_reports:' || v_hash, 0));
  select count(*) into n from public.ai_reports r
   where r.source_hash = v_hash and r.created_at > now() - interval '1 hour';
  if n >= 5 then
    return jsonb_build_object('error', 'too_many');
  end if;
  select count(*) into n from public.ai_reports r
   where r.created_at > now() - interval '1 hour';
  if n >= 300 then
    return jsonb_build_object('error', 'too_many');
  end if;

  insert into public.ai_reports (feature, reason, question, answer, lang, model, note, source_hash)
  values (v_feature, v_reason, v_question, v_answer, v_lang, v_model, v_note, v_hash);
  perform public.ai_reports_prune();
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.ai_report(text, text, text, text, text, text, text) from public;
grant execute on function public.ai_report(text, text, text, text, text, text, text) to anon, authenticated, service_role;

-- The read path, for the admin and for building eval cases.
create or replace function public.admin_list_ai_reports(
  p_feature text default null,
  p_status  text default null,
  p_limit   int  default 50,
  p_offset  int  default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err     text := public.admin_guard('read');
  v_limit   int  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset  int  := greatest(coalesce(p_offset, 0), 0);
  v_feature text := nullif(trim(coalesce(p_feature, '')), '');
  v_status  text := nullif(trim(coalesce(p_status, '')), '');
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  return jsonb_build_object(
    'total', (select count(*) from public.ai_reports r
               where (v_feature is null or r.feature = v_feature) and (v_status is null or r.status = v_status)),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'createdAt', r.created_at, 'feature', r.feature, 'reason', r.reason,
        'question', r.question, 'answer', r.answer, 'lang', r.lang, 'model', r.model,
        'note', r.note, 'status', r.status,
        'sourceTotal', (select count(*) from public.ai_reports x where x.source_hash = r.source_hash)
      ) order by r.id desc)
      from (select * from public.ai_reports
             where (v_feature is null or feature = v_feature) and (v_status is null or status = v_status)
             order by id desc limit v_limit offset v_offset) r
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_list_ai_reports(text, text, int, int) from public, anon;
grant execute on function public.admin_list_ai_reports(text, text, int, int) to authenticated, service_role;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('carta_ai_reports_prune', '47 3 * * *', 'select public.ai_reports_prune()');
  else
    raise notice 'pg_cron is not enabled: ai_reports is pruned on each report only; enable pg_cron and paste 074 again';
  end if;
end;
$cron$;

notify pgrst, 'reload schema';

-- Self-check.
do $$
begin
  if to_regprocedure('public.admin_guard(text)') is null then
    raise exception 'public.admin_guard(text) is missing; apply 015 first';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.ai_reports'::regclass) then
    raise exception 'ai_reports has row level security off';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.ai_report_salt'::regclass) then
    raise exception 'ai_report_salt has row level security off';
  end if;
  if has_table_privilege('anon', 'public.ai_reports', 'select')
     or has_table_privilege('anon', 'public.ai_reports', 'insert')
     or has_table_privilege('authenticated', 'public.ai_reports', 'select') then
    raise exception 'ai_reports must not be read or written directly by anon or authenticated';
  end if;
  if has_table_privilege('anon', 'public.ai_report_salt', 'select') then
    raise exception 'anon must not read the salt';
  end if;
  if not has_function_privilege('anon', 'public.ai_report(text, text, text, text, text, text, text)', 'execute') then
    raise exception 'anon cannot call ai_report';
  end if;
  if has_function_privilege('anon', 'public.admin_list_ai_reports(text, text, int, int)', 'execute') then
    raise exception 'anon must not call admin_list_ai_reports';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'ai_reports'
                and column_name in ('user_id', 'reporter_id', 'email')) then
    raise exception 'ai_reports must not hold an account id or an email';
  end if;
  raise notice 'ai reports self-check passed';
end $$;
