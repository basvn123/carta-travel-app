-- Throwaway-database test of 075_year_pass_one_off.sql (ROADMAP I-f). NEVER
-- run against the live project: it creates and drops a database named t075.
-- It builds the 007 tables as 053_pass_subscriptions_test.sql does, takes
-- 044's pass functions (extracted by 053_extract_044.py), applies 053, then
-- 075 twice, and checks that a Year Pass holder may buy another one while the
-- horizon refusal still holds; then the down brings 053's refusal back.
-- Run from the repo root on a scratch cluster:
--   python supabase/diagnostics/053_extract_044.py
--   psql -h 127.0.0.1 -p 55433 -U postgres -d postgres -f supabase/diagnostics/075_year_pass_one_off_test.sql
-- Expect "T075 scenario passed" and "down ok".
\set ON_ERROR_STOP 1
drop database if exists t075;
create database t075;
\c t075
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
\i supabase/migrations/075_year_pass_one_off.sql
\i supabase/migrations/075_year_pass_one_off.sql

insert into auth.users values ('11111111-1111-4111-8111-111111111111');

do $$
declare r jsonb; first_exp timestamptz; e public.entitlements%rowtype;
begin
  -- A one-off Year Pass, granted off a checkout session as the webhook does.
  r := public.grant_pass('11111111-1111-4111-8111-111111111111', 'year', 'cs_year_0001', 'cus_1');
  if not (r->>'ok')::boolean then raise exception 'year pass not granted: %', r; end if;
  select expires_at into first_exp from public.entitlements where user_id = '11111111-1111-4111-8111-111111111111';

  -- A leftover test-mode subscription row no longer blocks a second Year Pass.
  update public.entitlements set subscription_id = 'sub_ABC123456', subscription_status = 'active'
    where user_id = '11111111-1111-4111-8111-111111111111';
  r := public.pass_can_buy('11111111-1111-4111-8111-111111111111', 'year');
  if not coalesce((r->>'ok')::boolean, false) then raise exception 'a second Year Pass was refused: %', r; end if;

  -- The second one stacks a year from the current expiry.
  r := public.grant_pass('11111111-1111-4111-8111-111111111111', 'year', 'cs_year_0002', 'cus_1');
  select * into e from public.entitlements where user_id = '11111111-1111-4111-8111-111111111111';
  if abs(extract(epoch from (e.expires_at - first_exp)) - 365 * 86400) > 3700 then
    raise exception 'second Year Pass did not add a year: % -> %', first_exp, e.expires_at;
  end if;

  -- The horizon still refuses a purchase that would add nothing.
  update public.entitlements set expires_at = now() + make_interval(days => public.pass_horizon_days())
    where user_id = '11111111-1111-4111-8111-111111111111';
  r := public.pass_can_buy('11111111-1111-4111-8111-111111111111', 'year');
  if r->>'reason' <> 'horizon' then raise exception 'horizon refusal lost: %', r; end if;
  raise notice 'T075 scenario passed';
end $$;

\i supabase/migrations/075_year_pass_one_off_down.sql
do $$
declare r jsonb;
begin
  update public.entitlements set expires_at = now() + interval '30 days'
    where user_id = '11111111-1111-4111-8111-111111111111';
  r := public.pass_can_buy('11111111-1111-4111-8111-111111111111', 'year');
  if r->>'reason' <> 'subscribed' then raise exception 'down did not restore 053: %', r; end if;
  raise notice 'down ok';
end $$;

\c postgres
drop database t075;
