-- 073_price_alerts.sql
--
-- *** SCHEMA MIGRATION, APPLIED BY THE OWNER (T1205, ROADMAP I17). ***
-- Paste in the Supabase SQL editor after 072. Never `db push` against the
-- live project. Pasting twice is safe. Look for "price alerts self-check
-- passed". The way back is 073_price_alerts_down.sql.
--
-- Price alerts: a signed-in traveller saves an alert on a place or a trip
-- and gets ONE email when its total falls by the share they chose (5, 10 or
-- 20 percent). The total is Carta's estimate from the stays wire and the
-- flight files, computed on the box after each data refresh
-- (pipeline/price_alerts.py) with one formula for the baseline and for every
-- later check, so the email compares like with like. The box holds only the
-- PRICE_ALERTS_SECRET of the price-alerts Edge Function, never the service
-- role key: the function reaches these tables as the service role.
--
-- WHAT IT ADDS
--
--   price_alert_consent  one row per account: the double opt-in. requested_at
--                        is set when the traveller ticks the consent box on
--                        their first alert (wording version in `wording`),
--                        confirmed_at when they click the link in the one
--                        confirmation email, unsubscribed_at when they click
--                        unsubscribe in any alert email. No alert email goes
--                        out before confirmed_at, nor after unsubscribed_at.
--                        The owner reads the row; only definer functions write.
--   price_alerts         one row per alert, unique on (user, kind, ref): the
--                        spec the box prices (stops, month or dates, nights,
--                        adults, bed tier, optional flights), the share, the
--                        baseline (set by the first check: armed_at), the last
--                        check and fired_at, the one email. An alert expires
--                        after 90 days or on its first travel date, whichever
--                        is first. The owner reads and deletes their rows;
--                        saving goes through price_alert_save so the browser
--                        can never set a baseline, a consent or fired_at.
--
--   price_alert_save(kind, ref, label, spec, share, lang, wording)
--                        authenticated. Saves or replaces the alert (a new
--                        save re-arms it), at most 20 open alerts an account,
--                        and records the consent request. Answers
--                        {"id", "confirmed"}: when confirmed is false the page
--                        asks the function to send the confirmation email.
--   price_alert_optin_claim(user)  service role. 'send' (mail the
--                        confirmation link), 'already' (confirmed) or 'wait'
--                        (one went out less than 10 minutes ago) or 'none'.
--   price_alert_confirm(user), price_alert_unsubscribe(user)  service role,
--                        from the signed links.
--   price_alerts_open()  service role: the alerts the box must price, only of
--                        confirmed, subscribed accounts, unfired and
--                        unexpired. No address leaves the database this way.
--   price_alert_record(id, eur)  service role, one row locked: 'armed' (first
--                        price, the baseline), 'fire' (fell by the share:
--                        fired_at is set in the same statement, so a retry or
--                        an overlapping run never mails twice), 'hold' or
--                        'gone' (deleted, expired, fired, not consented).
--   price_alert_release(id)  service role: undoes 'fire' when the send failed.
--   price_alert_mail(id) service role: the address, language and figures for
--                        one email.
--   price_alert_purge()  service role: deletes alerts 30 days past expiry or
--                        firing. The box task calls it after each run.
--
-- Data export: the owner reads both tables directly (Account). Deletion: both
-- cascade with the account (069). docs/legal/ARTICLE30.md has the record.

create table if not exists public.price_alert_consent (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  lang             text not null default 'en' check (lang in ('en', 'nl', 'fr', 'de', 'es', 'it')),
  wording          text not null default 'alerts-v1' check (wording ~ '^[a-z0-9-]{1,20}$'),
  requested_at     timestamptz not null default now(),
  confirmed_at     timestamptz,
  unsubscribed_at  timestamptz,
  last_sent_at     timestamptz,
  send_count       int not null default 0
);

alter table public.price_alert_consent enable row level security;
drop policy if exists price_alert_consent_select_own on public.price_alert_consent;
create policy price_alert_consent_select_own on public.price_alert_consent
  for select using (auth.uid() = user_id);
revoke insert, update, delete on public.price_alert_consent from public, anon, authenticated;

create table if not exists public.price_alerts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('place', 'trip')),
  ref         text not null check (ref ~ '^[A-Za-z0-9_:-]{1,80}$'),
  label       text not null check (length(btrim(label)) between 1 and 120),
  spec        jsonb not null check (jsonb_typeof(spec) = 'object' and octet_length(spec::text) <= 4000),
  drop_share  numeric(3, 2) not null check (drop_share in (0.05, 0.10, 0.20)),
  baseline_eur int check (baseline_eur > 0),
  armed_at    timestamptz,
  last_eur    int check (last_eur > 0),
  checked_at  timestamptz,
  fired_at    timestamptz,
  fired_eur   int check (fired_eur > 0),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  unique (user_id, kind, ref)
);

create index if not exists price_alerts_open_idx on public.price_alerts (expires_at) where fired_at is null;

alter table public.price_alerts enable row level security;
drop policy if exists price_alerts_select_own on public.price_alerts;
create policy price_alerts_select_own on public.price_alerts
  for select using (auth.uid() = user_id);
drop policy if exists price_alerts_delete_own on public.price_alerts;
create policy price_alerts_delete_own on public.price_alerts
  for delete using (auth.uid() = user_id);
revoke insert, update on public.price_alerts from public, anon, authenticated;

-- ------------------------------------------------------------------ save

create or replace function public.price_alert_save(
  p_kind text, p_ref text, p_label text, p_spec jsonb, p_share numeric,
  p_lang text default 'en', p_wording text default 'alerts-v1'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_lang text := case when p_lang in ('en', 'nl', 'fr', 'de', 'es', 'it') then p_lang else 'en' end;
  v_first date;
  v_exp timestamptz := now() + interval '90 days';
  v_open int;
  v_id uuid;
  c public.price_alert_consent;
begin
  if me is null then
    raise exception 'price_alert_save: sign in first' using errcode = 'insufficient_privilege';
  end if;
  if p_share is null or p_share not in (0.05, 0.10, 0.20) then
    raise exception 'price_alert_save: the share is 0.05, 0.10 or 0.20' using errcode = 'invalid_parameter_value';
  end if;
  if p_spec is null or jsonb_typeof(p_spec) <> 'object' or jsonb_typeof(p_spec -> 'stops') <> 'array'
     or jsonb_array_length(p_spec -> 'stops') not between 1 and 12 then
    raise exception 'price_alert_save: the spec needs 1 to 12 stops' using errcode = 'invalid_parameter_value';
  end if;
  -- A dated alert ends on its first travel date: after that there is nothing to book.
  if coalesce(p_spec ->> 'start', '') ~ '^\d{4}-\d{2}-\d{2}$' then
    v_first := (p_spec ->> 'start')::date;
    if v_first <= current_date then
      raise exception 'price_alert_save: the trip has started' using errcode = 'invalid_parameter_value';
    end if;
    v_exp := least(v_exp, v_first::timestamptz);
  end if;
  select count(*) into v_open from public.price_alerts
   where user_id = me and fired_at is null and expires_at > now()
     and not (kind = p_kind and ref = p_ref);
  if v_open >= 20 then
    raise exception 'price_alert_save: at most 20 open alerts' using errcode = 'check_violation';
  end if;

  insert into public.price_alerts (user_id, kind, ref, label, spec, drop_share, expires_at)
  values (me, p_kind, p_ref, btrim(p_label), p_spec, p_share, v_exp)
  on conflict (user_id, kind, ref) do update
     set label = excluded.label, spec = excluded.spec, drop_share = excluded.drop_share,
         expires_at = excluded.expires_at, baseline_eur = null, armed_at = null,
         last_eur = null, checked_at = null, fired_at = null, fired_eur = null,
         created_at = now()
  returning id into v_id;

  -- The consent request. A traveller who unsubscribed and saves again asks
  -- anew: unconfirmed until the new click.
  select * into c from public.price_alert_consent where user_id = me for update;
  if not found then
    insert into public.price_alert_consent (user_id, lang, wording) values (me, v_lang, coalesce(p_wording, 'alerts-v1'))
    returning * into c;
  elsif c.unsubscribed_at is not null then
    update public.price_alert_consent
       set lang = v_lang, wording = coalesce(p_wording, 'alerts-v1'), requested_at = now(),
           confirmed_at = null, unsubscribed_at = null
     where user_id = me returning * into c;
  else
    update public.price_alert_consent set lang = v_lang where user_id = me returning * into c;
  end if;
  return jsonb_build_object('id', v_id, 'confirmed', c.confirmed_at is not null);
end;
$$;

-- ------------------------------------------------------------ the opt-in

create or replace function public.price_alert_optin_claim(p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare c public.price_alert_consent;
begin
  select * into c from public.price_alert_consent where user_id = p_user for update;
  if not found or c.unsubscribed_at is not null then return 'none'; end if;
  if c.confirmed_at is not null then return 'already'; end if;
  if c.last_sent_at is not null and c.last_sent_at > now() - interval '10 minutes' then return 'wait'; end if;
  update public.price_alert_consent set last_sent_at = now(), send_count = send_count + 1 where user_id = p_user;
  return 'send';
end;
$$;

create or replace function public.price_alert_optin_unclaim(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.price_alert_consent set last_sent_at = null where user_id = p_user and confirmed_at is null;
$$;

create or replace function public.price_alert_confirm(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  update public.price_alert_consent
     set confirmed_at = coalesce(confirmed_at, now())
   where user_id = p_user and unsubscribed_at is null;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

create or replace function public.price_alert_unsubscribe(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  update public.price_alert_consent
     set unsubscribed_at = coalesce(unsubscribed_at, now())
   where user_id = p_user;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

-- --------------------------------------------------------------- the check

create or replace function public.price_alerts_open()
returns table (id uuid, kind text, spec jsonb, drop_share numeric, baseline_eur int)
language sql
security definer
set search_path = ''
stable
as $$
  select a.id, a.kind, a.spec, a.drop_share, a.baseline_eur
    from public.price_alerts a
    join public.price_alert_consent c on c.user_id = a.user_id
   where c.confirmed_at is not null and c.unsubscribed_at is null
     and a.fired_at is null and a.expires_at > now()
   order by a.created_at;
$$;

create or replace function public.price_alert_record(p_id uuid, p_eur int)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.price_alerts;
  ok boolean;
begin
  if p_eur is null or p_eur <= 0 or p_eur > 100000 then
    raise exception 'price_alert_record: a total in whole euros' using errcode = 'invalid_parameter_value';
  end if;
  select * into a from public.price_alerts where price_alerts.id = p_id for update;
  if not found or a.fired_at is not null or a.expires_at <= now() then return 'gone'; end if;
  select (c.confirmed_at is not null and c.unsubscribed_at is null) into ok
    from public.price_alert_consent c where c.user_id = a.user_id;
  if not coalesce(ok, false) then return 'gone'; end if;
  if a.baseline_eur is null then
    update public.price_alerts set baseline_eur = p_eur, armed_at = now(), last_eur = p_eur, checked_at = now()
     where price_alerts.id = p_id;
    return 'armed';
  end if;
  if p_eur <= floor(a.baseline_eur * (1 - a.drop_share)) then
    update public.price_alerts set last_eur = p_eur, checked_at = now(), fired_at = now(), fired_eur = p_eur
     where price_alerts.id = p_id;
    return 'fire';
  end if;
  update public.price_alerts set last_eur = p_eur, checked_at = now() where price_alerts.id = p_id;
  return 'hold';
end;
$$;

create or replace function public.price_alert_release(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.price_alerts set fired_at = null, fired_eur = null where id = p_id;
$$;

create or replace function public.price_alert_mail(p_id uuid)
returns table (user_id uuid, email text, lang text, kind text, ref text, label text,
               spec jsonb, drop_share numeric, baseline_eur int, fired_eur int, armed_at timestamptz)
language sql
security definer
set search_path = ''
stable
as $$
  select a.user_id, u.email::text, c.lang, a.kind, a.ref, a.label, a.spec, a.drop_share,
         a.baseline_eur, a.fired_eur, a.armed_at
    from public.price_alerts a
    join public.price_alert_consent c on c.user_id = a.user_id
    join auth.users u on u.id = a.user_id
   where a.id = p_id and u.email is not null
     and c.confirmed_at is not null and c.unsubscribed_at is null;
$$;

create or replace function public.price_alert_purge()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  delete from public.price_alerts
   where expires_at < now() - interval '30 days'
      or fired_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.price_alert_save(text, text, text, jsonb, numeric, text, text) from public, anon;
grant execute on function public.price_alert_save(text, text, text, jsonb, numeric, text, text) to authenticated;
revoke all on function public.price_alert_optin_claim(uuid) from public, anon, authenticated;
revoke all on function public.price_alert_optin_unclaim(uuid) from public, anon, authenticated;
revoke all on function public.price_alert_confirm(uuid) from public, anon, authenticated;
revoke all on function public.price_alert_unsubscribe(uuid) from public, anon, authenticated;
revoke all on function public.price_alerts_open() from public, anon, authenticated;
revoke all on function public.price_alert_record(uuid, int) from public, anon, authenticated;
revoke all on function public.price_alert_release(uuid) from public, anon, authenticated;
revoke all on function public.price_alert_mail(uuid) from public, anon, authenticated;
revoke all on function public.price_alert_purge() from public, anon, authenticated;
grant execute on function public.price_alert_optin_claim(uuid) to service_role;
grant execute on function public.price_alert_optin_unclaim(uuid) to service_role;
grant execute on function public.price_alert_confirm(uuid) to service_role;
grant execute on function public.price_alert_unsubscribe(uuid) to service_role;
grant execute on function public.price_alerts_open() to service_role;
grant execute on function public.price_alert_record(uuid, int) to service_role;
grant execute on function public.price_alert_release(uuid) to service_role;
grant execute on function public.price_alert_mail(uuid) to service_role;
grant execute on function public.price_alert_purge() to service_role;

notify pgrst, 'reload schema';

-- Self-check.
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.price_alerts'::regclass) then
    raise exception 'row level security is off on price_alerts';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.price_alert_consent'::regclass) then
    raise exception 'row level security is off on price_alert_consent';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public'
              and tablename in ('price_alerts', 'price_alert_consent') and cmd in ('INSERT', 'UPDATE', 'ALL')) then
    raise exception 'price alerts are written through the definer functions only';
  end if;
  if has_table_privilege('authenticated', 'public.price_alerts', 'insert')
     or has_table_privilege('authenticated', 'public.price_alerts', 'update')
     or has_table_privilege('authenticated', 'public.price_alert_consent', 'update') then
    raise exception 'authenticated must not write the price alert tables directly';
  end if;
  if has_function_privilege('anon', 'public.price_alert_save(text,text,text,jsonb,numeric,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.price_alerts_open()', 'execute')
     or has_function_privilege('authenticated', 'public.price_alert_record(uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.price_alert_confirm(uuid)', 'execute') then
    raise exception 'only price_alert_save is open to travellers; the rest is service role only';
  end if;
  raise notice 'price alerts self-check passed';
end;
$$;
