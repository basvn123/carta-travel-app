-- 060_email_prefs.sql
--
-- *** SCHEMA MIGRATION, APPLIED BY THE OWNER (T944). ***
-- Paste in the Supabase SQL editor. It depends only on 002 (trip_plans and
-- trip_plan_stops). Never `db push` against ntssxktaduxzpsmejwyv. Pasting
-- twice is safe. Look for "email prefs self-check passed". The way back is
-- 060_email_prefs_down.sql.
--
-- Opt-in emails (T944, owner decision): trip reminders and price drops on
-- saved places, both OFF until the traveller turns them on in Account,
-- Preferences, Emails. The notify Edge Function sends them through Resend;
-- nothing is sent until the owner sets its secrets (functions/notify/README).
--
--   email_prefs    one row per account: the two switches, the language the
--                  emails are written in, and consented_at, the moment a
--                  switch last went from off to on. consented_at is set by
--                  the trigger below, never by the client, so it records
--                  the consent as the database saw it. No row means both off.
--   email_log      one row per email sent, unique on (user_id, kind, ref).
--                  The function claims the row before it sends and removes
--                  it only when the send fails, so one trip or one price
--                  drop is never mailed twice, even if two runs overlap.
--                  The traveller may read their own rows; only the service
--                  role writes.
--   notify_reminder_candidates(from, to)  SECURITY DEFINER, service role
--                  only: accounts with trip reminders on, their email, and
--                  each trip whose first dated stop starts between the two
--                  dates, with the trip's places in order.
--
-- THE SCHEDULE. Once a day at 07:41 UTC pg_cron asks pg_net to POST
-- {"job":"reminders"} to the function. The same prerequisites as the cron
-- block T041-b documented for migration 030:
--   1. Database, Extensions: enable pg_cron and pg_net.
--   2. Vault: create two secrets,
--        notify_url     https://<project-ref>.supabase.co/functions/v1/notify
--        notify_secret  the same value as the function's NOTIFY_SECRET
--   3. Paste this file again (or run the cron.schedule line printed below).
-- Without them the block below schedules nothing and says so.
--
-- PRICE DROPS. Carta's day prices are computed in the browser from the
-- traveller's own settings (lib/price, the figure the cards show), so the
-- server cannot price a saved place by itself. The page notices a clear
-- drop against the price recorded at save time (lib/savedLists.js meta.eur)
-- and sends a small request; the function checks the switch, rate limits
-- (one price email a day, one place at most once a week) and logs it.
--
-- THE APP WITHOUT THIS FILE. src/auth/account/emailPrefs.js treats a missing
-- table (PGRST205, 42P01) as "not available" and Account hides the Emails
-- group; the page sends no price drop requests.

create table if not exists public.email_prefs (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  trip_reminders  boolean not null default false,
  price_drops     boolean not null default false,
  lang            text not null default 'en' check (lang in ('en', 'nl', 'fr', 'de', 'es', 'it')),
  consented_at    timestamptz,
  updated_at      timestamptz not null default now()
);

alter table public.email_prefs enable row level security;

drop policy if exists email_prefs_select_own on public.email_prefs;
create policy email_prefs_select_own on public.email_prefs
  for select using (auth.uid() = user_id);
drop policy if exists email_prefs_insert_own on public.email_prefs;
create policy email_prefs_insert_own on public.email_prefs
  for insert with check (auth.uid() = user_id);
drop policy if exists email_prefs_update_own on public.email_prefs;
create policy email_prefs_update_own on public.email_prefs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- consented_at follows the switches, whatever the client sent.
create or replace function public.email_prefs_stamp()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.consented_at := case when new.trip_reminders or new.price_drops then now() else null end;
  else
    if (new.trip_reminders and not old.trip_reminders) or (new.price_drops and not old.price_drops) then
      new.consented_at := now();
    else
      new.consented_at := old.consented_at;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists email_prefs_stamp on public.email_prefs;
create trigger email_prefs_stamp
  before insert or update on public.email_prefs
  for each row execute function public.email_prefs_stamp();

create table if not exists public.email_log (
  id       bigint generated always as identity primary key,
  user_id  uuid not null references auth.users(id) on delete cascade,
  kind     text not null check (kind in ('trip_reminder', 'price_drop')),
  ref      text not null check (length(ref) between 1 and 200),
  sent_at  timestamptz not null default now(),
  unique (user_id, kind, ref)
);

create index if not exists email_log_user_kind_sent_idx on public.email_log (user_id, kind, sent_at desc);

alter table public.email_log enable row level security;

drop policy if exists email_log_select_own on public.email_log;
create policy email_log_select_own on public.email_log
  for select using (auth.uid() = user_id);

create or replace function public.notify_reminder_candidates(p_from date, p_to date)
returns table (
  user_id uuid,
  email text,
  lang text,
  trip_plan_id uuid,
  label text,
  starts date,
  places text[]
)
language sql
security definer
set search_path = public
stable
as $$
  with firsts as (
    select s.trip_plan_id, min(s.arrive_date) as starts
      from public.trip_plan_stops s
     where s.arrive_date is not null
     group by s.trip_plan_id
  )
  select p.user_id, u.email::text, p.lang, tp.id, tp.label, f.starts,
         array(select s.city from public.trip_plan_stops s
                where s.trip_plan_id = tp.id order by s.position) as places
    from public.email_prefs p
    join auth.users u on u.id = p.user_id
    join public.trip_plans tp on tp.user_id = p.user_id
    join firsts f on f.trip_plan_id = tp.id
   where p.trip_reminders
     and u.email is not null
     and f.starts between p_from and p_to;
$$;

revoke all on function public.notify_reminder_candidates(date, date) from public, anon, authenticated;
grant execute on function public.notify_reminder_candidates(date, date) to service_role;

-- Daily at 07:41 UTC, only when pg_cron, pg_net and both vault secrets are
-- there. cron.schedule with a name replaces a job of that name.
do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_cron or pg_net is not enabled: no trip reminders are scheduled. Enable both under Database, Extensions, add the vault secrets notify_url and notify_secret, then paste 060 again.';
  elsif not exists (select 1 from vault.secrets where name = 'notify_url')
     or not exists (select 1 from vault.secrets where name = 'notify_secret') then
    raise notice 'the vault secrets notify_url and notify_secret are missing: no trip reminders are scheduled. Add both, then paste 060 again.';
  else
    perform cron.schedule('carta_notify_reminders', '41 7 * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-notify-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret')),
        body := '{"job":"reminders"}'::jsonb,
        timeout_milliseconds := 60000)
    $job$);
    raise notice 'notify reminders scheduled daily at 07:41 UTC through pg_cron';
  end if;
end;
$cron$;

do $$
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'email_prefs' and rowsecurity) then
    raise exception 'row level security is off on email_prefs';
  end if;
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'email_log' and rowsecurity) then
    raise exception 'row level security is off on email_log';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'email_prefs' and cmd in ('INSERT', 'UPDATE')
       and coalesce(with_check, '') not like '%auth.uid() = user_id%'
  ) then
    raise exception 'only the owner may write an email_prefs row';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'email_log' and cmd <> 'SELECT') then
    raise exception 'only the service role may write email_log';
  end if;
  if exists (
    select 1 from public.email_prefs where consented_at is null and (trip_reminders or price_drops)
  ) then
    raise exception 'an email switch is on without a consent time';
  end if;
  raise notice 'email prefs self-check passed';
end;
$$;
