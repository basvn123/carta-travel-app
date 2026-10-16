-- Throwaway-database test of 053_pass_subscriptions.sql (T460). NEVER run
-- against the live project: it creates and drops a database named t053.
-- It builds the 007 tables, takes pass_horizon_days, pass_can_buy and
-- grant_pass verbatim from 044 (extracted by the runner into
-- supabase/diagnostics/.044_pass_functions.sql), applies 053 twice, and walks a
-- yearly plan's life. Run from the repo root on a scratch cluster:
--   python supabase/diagnostics/053_extract_044.py
--   psql -h 127.0.0.1 -p 55433 -U postgres -d postgres -f supabase/diagnostics/053_pass_subscriptions_test.sql
-- Expect "T053 scenario passed" and "down ok".
\set ON_ERROR_STOP 1
drop database if exists t053;
create database t053;
\c t053
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key);
create table public.plan_tiers (
  tier text primary key, ai_plans int not null, grounded int not null, period_days int,
  price_cents int not null, currency text not null default 'eur', rank int not null default 0);
insert into public.plan_tiers values ('free', 2, 0, null, 0, 'eur', 0), ('trip', 60, 40, 30, 699, 'eur', 1), ('year', 300, 120, 365, 1499, 'eur', 2);
create table public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free' references public.plan_tiers(tier),
  period_start timestamptz not null default now(), expires_at timestamptz,
  source text not null default 'free' check (source in ('free', 'stripe', 'manual')),
  stripe_customer_id text, last_session_id text, updated_at timestamptz not null default now());
create table public.pass_grants (
  session_id text primary key, user_id uuid not null references auth.users(id), tier text not null references public.plan_tiers(tier),
  expires_at timestamptz not null, granted_at timestamptz not null default now(),
  consent_tos text, consent_at timestamptz, consent_terms_url text,
  buyer_country text, amount_cents int, currency text, reason text, fee_cents int, fee_currency text);

\i supabase/diagnostics/.044_pass_functions.sql
\i supabase/migrations/053_pass_subscriptions.sql
\i supabase/migrations/053_pass_subscriptions.sql

insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');

do $$
declare r jsonb; e public.entitlements%rowtype; first_exp timestamptz;
begin
  -- A Trip Pass now runs 60 days.
  r := public.grant_pass('22222222-2222-4222-8222-222222222222', 'trip', 'cs_trip_1');
  select * into e from public.entitlements where user_id = '22222222-2222-4222-8222-222222222222';
  if abs(extract(epoch from (e.expires_at - now())) - 60 * 86400) > 3700 then raise exception 'trip pass is not 60 days: %', e.expires_at; end if;

  -- The first yearly invoice grants a year; a replayed invoice is a no-op.
  r := public.grant_pass('11111111-1111-4111-8111-111111111111', 'year', 'in_first_0001', 'cus_1');
  if not (r->>'ok')::boolean then raise exception 'first invoice not granted: %', r; end if;
  select expires_at into first_exp from public.entitlements where user_id = '11111111-1111-4111-8111-111111111111';
  r := public.grant_pass('11111111-1111-4111-8111-111111111111', 'year', 'in_first_0001', 'cus_1');
  if not coalesce((r->>'replay')::boolean, false) then raise exception 'replayed invoice was not a no-op: %', r; end if;

  -- The subscription's state lands, and a second yearly plan is refused.
  r := public.set_subscription_state('11111111-1111-4111-8111-111111111111', 'sub_ABC123456', 'active', false, now() + interval '365 days', 'cus_1');
  if not (r->>'ok')::boolean then raise exception 'state not set: %', r; end if;
  r := public.pass_can_buy('11111111-1111-4111-8111-111111111111', 'year');
  if r->>'reason' <> 'subscribed' then raise exception 'second yearly plan not refused: %', r; end if;
  -- A Trip Pass can still be bought on top.
  r := public.pass_can_buy('11111111-1111-4111-8111-111111111111', 'trip');
  if not (r->>'ok')::boolean then raise exception 'trip pass refused for a subscriber: %', r; end if;

  -- The renewal invoice extends from the current expiry.
  r := public.grant_pass('11111111-1111-4111-8111-111111111111', 'year', 'in_cycle_0002', 'cus_1', null, null, null, 1499, 'eur', 'renewal');
  select * into e from public.entitlements where user_id = '11111111-1111-4111-8111-111111111111';
  if abs(extract(epoch from (e.expires_at - first_exp)) - 365 * 86400) > 3700 then raise exception 'renewal did not add a year: % -> %', first_exp, e.expires_at; end if;
  if e.subscription_id <> 'sub_ABC123456' then raise exception 'grant_pass lost the subscription id'; end if;

  -- Cancelling: the plan runs on, and a second yearly plan is still refused
  -- (the traveller resumes the first one instead).
  r := public.set_subscription_state('11111111-1111-4111-8111-111111111111', 'sub_ABC123456', 'active', true, now() + interval '365 days', null);
  select * into e from public.entitlements where user_id = '11111111-1111-4111-8111-111111111111';
  if not e.cancel_at_period_end or e.tier <> 'year' then raise exception 'cancel state wrong: % %', e.cancel_at_period_end, e.tier; end if;
  if e.stripe_customer_id <> 'cus_1' then raise exception 'customer id lost on a null update'; end if;
  r := public.pass_can_buy('11111111-1111-4111-8111-111111111111', 'year');
  if r->>'reason' <> 'subscribed' then raise exception 'a cancelled plan with time left allowed a second one: %', r; end if;
  -- Once the subscription is over, a new yearly plan may be bought.
  r := public.set_subscription_state('11111111-1111-4111-8111-111111111111', 'sub_ABC123456', 'canceled', true, now(), null);
  r := public.pass_can_buy('11111111-1111-4111-8111-111111111111', 'year');
  if r->>'reason' = 'subscribed' then raise exception 'an ended plan still blocks a new one'; end if;

  -- Bad input is refused in words, not by an error.
  r := public.set_subscription_state('11111111-1111-4111-8111-111111111111', 'nope', 'active', false, null, null);
  if (r->>'ok')::boolean then raise exception 'a malformed subscription id was accepted'; end if;

  -- A first state for a user with no entitlement row creates one, free until paid.
  r := public.set_subscription_state('22222222-2222-4222-8222-222222222222', 'sub_XYZ987654', 'incomplete', false, null, 'cus_2');
  select * into e from public.entitlements where user_id = '22222222-2222-4222-8222-222222222222';
  if e.subscription_status <> 'incomplete' then raise exception 'state not written on an existing row'; end if;
  raise notice 'T053 scenario passed';
end $$;

-- Privileges: only the service role writes subscription state.
do $$ begin
  if has_function_privilege('authenticated', 'public.set_subscription_state(uuid, text, text, boolean, timestamptz, text)', 'execute') then
    raise exception 'authenticated can write subscription state';
  end if;
end $$;

-- DOWN, as the header gives it (pass_can_buy restored from 044).
drop function if exists public.set_subscription_state(uuid, text, text, boolean, timestamptz, text);
\i supabase/diagnostics/.044_pass_functions.sql
alter table public.entitlements
  drop column if exists subscription_id, drop column if exists subscription_status,
  drop column if exists cancel_at_period_end, drop column if exists renews_at;
update public.plan_tiers set period_days = 30 where tier = 'trip';
select 'down ok, trip days ' || period_days from public.plan_tiers where tier = 'trip';
