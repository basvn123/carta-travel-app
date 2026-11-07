-- 066_waitlist.sql
--
-- Waitlist and newsletter capture with double opt-in (T1110, ROADMAP K3).
-- A visitor leaves an e-mail address; Carta mails a confirmation link; only
-- the click makes the address usable. Every mail carries an unsubscribe link.
--
-- WHAT IT ADDS
--
--   waitlist_signups     one row per address (lower-cased): locale, source,
--                        created_at, confirmed_at, unsubscribed_at and the
--                        send bookkeeping (last_sent_at, send_count) that
--                        throttles the confirmation mail. RLS on and NO
--                        policy: the table is closed to the browser, to
--                        signed-in travellers and to visitors alike (the RLS
--                        suite probes that). Only the service role, i.e. the
--                        `waitlist` Edge Function, reaches it, through the
--                        functions below. anon and authenticated hold no
--                        grant at all.
--   waitlist_join(email, locale, source)
--                        SECURITY DEFINER, service role only. Stores the
--                        address unconfirmed and answers 'send' (mail the
--                        confirmation), 'already' (confirmed, mail nothing:
--                        the answer to the visitor is the same either way,
--                        so the form cannot be used to probe who is on the
--                        list) or 'wait' (a confirmation went out less than
--                        10 minutes ago). Joining again after an unsubscribe
--                        starts over: unconfirmed until the new click.
--   waitlist_confirm(email)     sets confirmed_at; false when the address is
--                        unknown or has unsubscribed.
--   waitlist_unsubscribe(email) sets unsubscribed_at (kept, not deleted, so
--                        an address that opted out is never mailed by a
--                        later import); false when unknown.
--   waitlist_audience()  the ONE way to read the list for use: confirmed and
--                        not unsubscribed rows only. "No list use before
--                        confirmation" is this function.
--   waitlist_purge(days) deletes addresses never confirmed after N days
--                        (minimum 7). Nothing calls it yet; the owner may
--                        schedule it (owner step in the T1110 report).
--
-- The signed links (HMAC with WAITLIST_SECRET) are made and checked in the
-- Edge Function, not here: the database only stores state.
--
-- Data export and deletion: an address is not tied to an account. Removal on
-- request is `delete from waitlist_signups where email = ...` (docs/legal/
-- ARTICLE30.md names the table).
--
-- ORDER. Paste in the Supabase SQL editor after 065. Never `db push` against
-- the live project. Pasting twice is safe. Look for "waitlist self-check
-- passed". DOWN: 066_waitlist_down.sql.
--
-- THE APP WITHOUT THIS FILE. The form posts to the function, which answers
-- 'unavailable'; the form shows its "try again later" line and stores nothing.

create table if not exists public.waitlist_signups (
  email           text        primary key
                  check (email = lower(email) and length(email) between 5 and 254
                         and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  locale          text        not null default 'en' check (locale in ('en', 'nl', 'fr', 'de', 'es', 'it')),
  source          text        not null default 'home' check (source ~ '^[a-z0-9_-]{1,40}$'),
  created_at      timestamptz not null default now(),
  confirmed_at    timestamptz,
  unsubscribed_at timestamptz,
  last_sent_at    timestamptz,
  send_count      int         not null default 0
);

create index if not exists waitlist_signups_created on public.waitlist_signups (created_at);

alter table public.waitlist_signups enable row level security;
-- No policy on purpose: closed to every API role.
revoke all on public.waitlist_signups from public, anon, authenticated;

create or replace function public.waitlist_join(p_email text, p_locale text, p_source text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  e text := lower(btrim(coalesce(p_email, '')));
  r public.waitlist_signups;
begin
  select * into r from public.waitlist_signups where email = e for update;
  if not found then
    insert into public.waitlist_signups (email, locale, source, last_sent_at, send_count)
    values (e, coalesce(nullif(p_locale, ''), 'en'), coalesce(nullif(p_source, ''), 'home'), now(), 1);
    return 'send';
  end if;
  if r.confirmed_at is not null and r.unsubscribed_at is null then
    return 'already';
  end if;
  if r.last_sent_at is not null and r.last_sent_at > now() - interval '10 minutes' then
    return 'wait';
  end if;
  update public.waitlist_signups
     set locale = coalesce(nullif(p_locale, ''), locale),
         confirmed_at = null,
         unsubscribed_at = null,
         last_sent_at = now(),
         send_count = send_count + 1
   where email = e;
  return 'send';
end;
$$;

create or replace function public.waitlist_confirm(p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  update public.waitlist_signups
     set confirmed_at = coalesce(confirmed_at, now())
   where email = lower(btrim(coalesce(p_email, ''))) and unsubscribed_at is null;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

create or replace function public.waitlist_unsubscribe(p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  update public.waitlist_signups
     set unsubscribed_at = coalesce(unsubscribed_at, now())
   where email = lower(btrim(coalesce(p_email, '')));
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

create or replace function public.waitlist_audience()
returns table (email text, locale text, source text, confirmed_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select w.email, w.locale, w.source, w.confirmed_at
    from public.waitlist_signups w
   where w.confirmed_at is not null and w.unsubscribed_at is null
   order by w.confirmed_at;
$$;

create or replace function public.waitlist_purge(p_days int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  if p_days is null or p_days < 7 then
    raise exception 'waitlist_purge: at least 7 days' using errcode = 'invalid_parameter_value';
  end if;
  delete from public.waitlist_signups
   where confirmed_at is null and unsubscribed_at is null
     and created_at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.waitlist_join(text, text, text) from public, anon, authenticated;
revoke all on function public.waitlist_confirm(text) from public, anon, authenticated;
revoke all on function public.waitlist_unsubscribe(text) from public, anon, authenticated;
revoke all on function public.waitlist_audience() from public, anon, authenticated;
revoke all on function public.waitlist_purge(int) from public, anon, authenticated;
grant execute on function public.waitlist_join(text, text, text) to service_role;
grant execute on function public.waitlist_confirm(text) to service_role;
grant execute on function public.waitlist_unsubscribe(text) to service_role;
grant execute on function public.waitlist_audience() to service_role;
grant execute on function public.waitlist_purge(int) to service_role;

notify pgrst, 'reload schema';

-- Self-check.
do $$
declare n int;
begin
  if to_regclass('public.waitlist_signups') is null then
    raise exception 'waitlist_signups is missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.waitlist_signups'::regclass) then
    raise exception 'waitlist_signups has row level security off';
  end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'waitlist_signups';
  if n <> 0 then raise exception 'waitlist_signups must have no policy, found %', n; end if;
  if has_table_privilege('anon', 'public.waitlist_signups', 'select')
     or has_table_privilege('authenticated', 'public.waitlist_signups', 'select') then
    raise exception 'anon and authenticated must not read waitlist_signups';
  end if;
  if has_function_privilege('anon', 'public.waitlist_join(text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.waitlist_audience()', 'execute') then
    raise exception 'the waitlist functions must be service role only';
  end if;
  raise notice 'waitlist self-check passed';
end $$;
