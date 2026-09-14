-- Paywall events: the four numbers that decide whether any of this worked.
--
-- WHY THIS EXISTS. Phase 1 moved the paid boundary off AI quota and onto the
-- output layer, and Phase 4 will roughly double both prices. Neither can be
-- judged without knowing how many people saw an offer, which offer, and what
-- happened next. The 2026 benchmark that matters here is blunt: apps that run
-- experiments consistently earn up to 40x what apps that do not earn, and the
-- top testers manage about fifteen experiments a year. Fifteen experiments a
-- year is impossible without an event stream, so this is a prerequisite for
-- the price move rather than a nice-to-have beside it.
--
-- WHAT IS NOT HERE, ON PURPOSE.
--
--   1. NO COMPLETION EVENT. A client saying "I bought it" is worthless, and a
--      second write path for something the Stripe webhook already records is
--      a second thing that can disagree with the truth. Purchases come from
--      public.pass_grants, which only the webhook writes and which already
--      carries user_id, tier and granted_at. The funnel below reads it.
--
--   2. NO PAGE VIEWS, NO SESSIONS, NO DEVICE, NO IP, NO REFERRER. This table
--      answers one question, "was the offer taken", and carries nothing that
--      would let it answer a different one later. That is a design choice
--      about scope, and the cheapest time to make it is now.
--
--   3. NO ROW-LEVEL READ, FOR ANYONE. There is no RPC that returns an event.
--      admin_paywall_funnel returns counts and nothing else, so the table
--      cannot become a way to watch one named person plan a holiday.
--
-- GUESTS COUNT. A signed-out visitor who hits a gate is exactly the person
-- the research says is missing (travel converts 43.5% of the people who
-- start, and only 4.1% of people ever start), so anon may write. Their rows
-- carry a null user_id, which means guest events give totals but never
-- attribution. That asymmetry is real and the funnel labels it rather than
-- quietly averaging over it.
--
-- DELETING AN ACCOUNT DROPS THE IDENTITY, NOT THE COUNT. user_id is
-- `on delete set null`, so 005_delete_user leaves behind an event that is
-- indistinguishable from a guest's. The person is gone; the fact that
-- somebody once saw an export gate is not personal data once it is nameless.
--
-- Apply in the Supabase SQL editor. Live project policy: never `db push`
-- against ntssxktaduxzpsmejwyv; paste this file there by hand.
-- Requires 007_passes.sql (pass_grants) and 015_admin_hardening.sql
-- (admin_guard). 017 is not required but this is its sibling.

-- ---------------------------------------------------------------------------
-- The ledger
-- ---------------------------------------------------------------------------
create table if not exists public.paywall_events (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  -- Null for a guest, and null again once an account is deleted.
  user_id uuid references auth.users(id) on delete set null,
  -- 'shown'     the pass modal opened, for `reason`
  -- 'dismissed' it closed with nothing bought
  -- 'checkout'  the traveller pressed a buy button and Stripe was called
  event   text not null check (event in ('shown', 'dismissed', 'checkout')),
  -- The gate reason code (export, import, share, save, plans, ground,
  -- plansLow, celebrate, expiring, browse). Free text rather than an enum:
  -- adding a gate must never need a migration, and an unknown reason showing
  -- up in the funnel is exactly the signal that one was added.
  reason  text,
  -- The tier the traveller held at that moment, or the tier they are buying
  -- on a 'checkout' row. Both are useful and they never collide, because a
  -- checkout row is always about a purchase and the others never are.
  tier    text
);

create index if not exists paywall_events_at_idx on public.paywall_events (at desc);
create index if not exists paywall_events_event_idx on public.paywall_events (event, at desc);

alter table public.paywall_events enable row level security;

-- No policies at all, deliberately. RLS with zero policies denies everything
-- to anon and authenticated, so the only ways in are the two definer
-- functions below and the service role. A table nobody can select from cannot
-- leak by accident when somebody later adds a convenience query.

-- ---------------------------------------------------------------------------
-- A daily ceiling, same shape and same reason as ai_daily_total in 007
-- ---------------------------------------------------------------------------
-- An anon-writable endpoint is an anon-writable endpoint. This is not about
-- fraud, it is about a runaway client loop filling a table overnight. The
-- limit is far above any real day.
create table if not exists public.paywall_daily_total (
  day date primary key,
  n   bigint not null default 0
);

alter table public.paywall_daily_total enable row level security;

-- ---------------------------------------------------------------------------
-- Record one event. Fire and forget: never raises, never returns a reason to
-- retry, because an analytics write must not be able to break a paywall.
-- ---------------------------------------------------------------------------
create or replace function public.paywall_event(
  p_event  text,
  p_reason text default null,
  p_tier   text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n bigint;
begin
  if p_event not in ('shown', 'dismissed', 'checkout') then
    return;
  end if;

  -- The global ceiling is tested by the same statement that increments it, so
  -- two concurrent callers cannot both claim the last slot.
  insert into public.paywall_daily_total as d (day, n)
    values (current_date, 1)
    on conflict (day) do update
      set n = d.n + 1
      where d.n < 200000
    returning n into v_n;
  if v_n is null then
    return;
  end if;

  insert into public.paywall_events (user_id, event, reason, tier)
  values (
    auth.uid(),
    p_event,
    -- Short, so a malformed client cannot write an essay into the column.
    nullif(left(coalesce(p_reason, ''), 32), ''),
    nullif(left(coalesce(p_tier, ''), 16), '')
  );
exception when others then
  -- Analytics is never worth an error on the traveller's screen.
  return;
end;
$$;

-- ---------------------------------------------------------------------------
-- The funnel. Counts only, admin only.
-- ---------------------------------------------------------------------------
create or replace function public.admin_paywall_funnel(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err     text := public.admin_guard('read');
  v_days    int;
  v_since   timestamptz;
  v_reasons jsonb := '[]'::jsonb;
  v_daily   jsonb := '[]'::jsonb;
  v_shown   bigint := 0;
  v_dism    bigint := 0;
  v_check   bigint := 0;
  v_bought  bigint := 0;
  v_guest   bigint := 0;
  v_tiers   jsonb := '[]'::jsonb;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  v_days  := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since := now() - make_interval(days => v_days);

  select count(*) filter (where event = 'shown'),
         count(*) filter (where event = 'dismissed'),
         count(*) filter (where event = 'checkout'),
         count(*) filter (where event = 'shown' and user_id is null)
    into v_shown, v_dism, v_check, v_guest
    from public.paywall_events
   where at > v_since;

  -- Purchases come from the webhook's own ledger, never from the client.
  select count(*) into v_bought
    from public.pass_grants
   where granted_at > v_since;

  -- Which gate is doing the work. This is the number that says whether moving
  -- the boundary onto exports was the right call: if 'export' dominates
  -- 'plans', it was.
  select coalesce(jsonb_agg(jsonb_build_object(
           'reason',    reason,
           'shown',     shown,
           'dismissed', dismissed,
           'checkout',  checkout
         ) order by shown desc), '[]'::jsonb)
    into v_reasons
    from (
      select coalesce(reason, 'unknown') as reason,
             count(*) filter (where event = 'shown')     as shown,
             count(*) filter (where event = 'dismissed') as dismissed,
             count(*) filter (where event = 'checkout')  as checkout
        from public.paywall_events
       where at > v_since
       group by 1
    ) s;

  -- Which tier people press buy on, so the "most popular" flag can be aimed
  -- at the tier that actually sells rather than the one it sits on today.
  select coalesce(jsonb_agg(jsonb_build_object('tier', tier, 'n', n)
           order by n desc), '[]'::jsonb)
    into v_tiers
    from (
      select coalesce(tier, 'unknown') as tier, count(*) as n
        from public.paywall_events
       where at > v_since and event = 'checkout'
       group by 1
    ) s;

  -- Zero-filled, so a day with no offers reads as a flat line rather than
  -- vanishing from the series and flattering the average.
  select coalesce(jsonb_agg(jsonb_build_object(
           'day', d::date, 'shown', coalesce(c.shown, 0), 'checkout', coalesce(c.checkout, 0))
           order by d), '[]'::jsonb)
    into v_daily
    from generate_series(v_since::date, current_date, interval '1 day') d
    left join (
      select at::date as day,
             count(*) filter (where event = 'shown')    as shown,
             count(*) filter (where event = 'checkout') as checkout
        from public.paywall_events
       where at > v_since
       group by 1
    ) c on c.day = d::date;

  return jsonb_build_object(
    'days',       v_days,
    'shown',      v_shown,
    'dismissed',  v_dism,
    'checkout',   v_check,
    'purchased',  v_bought,
    -- Guests have no attribution, so say how much of the top of the funnel
    -- they are rather than letting a conversion rate imply they do.
    'shownGuest', v_guest,
    'byReason',   v_reasons,
    'byTier',     v_tiers,
    'daily',      v_daily
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Retention. Behavioural rows should not accumulate forever.
-- ---------------------------------------------------------------------------
-- Not scheduled here, because this repo has no cron in the database: call it
-- from the pipeline (pipeline/run_pipeline.py) or by hand. Six months is long
-- enough to compare this year's travel season with the shoulder either side
-- of it, and short enough that the table stays a funnel rather than a history.
create or replace function public.prune_paywall_events(p_days int default 180)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n bigint;
begin
  delete from public.paywall_events
   where at < now() - make_interval(days => greatest(coalesce(p_days, 180), 30));
  get diagnostics n = row_count;
  delete from public.paywall_daily_total
   where day < current_date - 400;
  return n;
end;
$$;

-- Supabase default-grants every new table in `public` to anon and
-- authenticated, so RLS is doing all the work above unless the grant is taken
-- back explicitly. Take it back: RLS is the lock, and this is not leaving the
-- key in it. Without these two lines the self-check below fails on apply, and
-- it is right to.
revoke all on public.paywall_events from anon, authenticated;
revoke all on public.paywall_daily_total from anon, authenticated;
revoke all on sequence public.paywall_events_id_seq from anon, authenticated;

revoke all on function public.paywall_event(text, text, text) from public;
grant execute on function public.paywall_event(text, text, text) to anon, authenticated, service_role;

revoke all on function public.admin_paywall_funnel(int) from public, anon;
grant execute on function public.admin_paywall_funnel(int) to authenticated, service_role;

revoke all on function public.prune_paywall_events(int) from public, anon, authenticated;
grant execute on function public.prune_paywall_events(int) to service_role;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  -- Named v_count rather than n on purpose: paywall_daily_total HAS a column
  -- called n, and `set n = greatest(0, n - v_made)` inside this block is
  -- "column reference n is ambiguous", which fails the whole migration at the
  -- last statement after every object has already been created.
  v_count int;
  f jsonb;
  -- Everything this check writes lives above this id, so the cleanup at the
  -- end can be exact. Deleting by `reason = 'selfcheck'` would be fine today
  -- and would quietly eat real rows the day somebody re-applies this file
  -- against a live table.
  v_mark bigint;
  v_made int;
begin
  select coalesce(max(id), 0) into v_mark from public.paywall_events;
  -- The table must be closed to clients. RLS on with no policies is the whole
  -- protection, so both halves are checked.
  if not exists (
    select 1 from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relname = 'paywall_events' and c.relrowsecurity
  ) then
    raise exception 'paywall_events does not have row level security on';
  end if;

  select count(*) into v_count
    from pg_policies where schemaname = 'public' and tablename = 'paywall_events';
  if v_count <> 0 then
    raise exception 'paywall_events has % policies; it is meant to have none', v_count;
  end if;

  -- A client must be able to write one and must not be able to read one.
  if not exists (
    select 1 from information_schema.routine_privileges
     where routine_schema = 'public' and routine_name = 'paywall_event'
       and grantee = 'anon' and privilege_type = 'EXECUTE'
  ) then
    raise exception 'a guest cannot record a paywall event, so the top of the funnel is invisible';
  end if;
  if exists (
    select 1 from information_schema.table_privileges
     where table_schema = 'public' and table_name = 'paywall_events'
       and grantee in ('anon', 'authenticated')
  ) then
    raise exception 'a client role has direct table privileges on paywall_events';
  end if;
  if exists (
    select 1 from information_schema.routine_privileges
     where routine_schema = 'public' and routine_name = 'prune_paywall_events'
       and grantee in ('anon', 'authenticated')
  ) then
    raise exception 'a client role can prune the event ledger';
  end if;

  -- The writer really writes, and really refuses nonsense.
  perform public.paywall_event('shown', 'selfcheck', 'free');
  select count(*) into v_count from public.paywall_events where id > v_mark;
  if v_count <> 1 then
    raise exception 'paywall_event wrote % rows, expected 1', v_count;
  end if;

  perform public.paywall_event('not_a_real_event', 'selfcheck', 'free');
  select count(*) into v_count from public.paywall_events where id > v_mark;
  if v_count <> 1 then
    raise exception 'paywall_event accepted an event name outside its check constraint';
  end if;

  -- Long input is truncated rather than stored or rejected.
  perform public.paywall_event('shown', repeat('x', 200), repeat('y', 200));
  if exists (
    select 1 from public.paywall_events
     where id > v_mark and (length(reason) > 32 or length(tier) > 16)
  ) then
    raise exception 'paywall_event stored an over-long reason or tier';
  end if;

  -- The funnel answers, and refuses a non-admin. Applying this as the owner
  -- means auth.uid() is null, so admin_guard should say forbidden.
  f := public.admin_paywall_funnel(7);
  if (f ->> 'error') is null then
    raise exception 'admin_paywall_funnel answered a caller who is not an admin';
  end if;

  -- Clean up after ourselves, exactly: only the rows written above, and only
  -- the increments they caused. A self-check that leaves data behind is a
  -- self-check that corrupts the first day of the metric it just installed.
  delete from public.paywall_events where id > v_mark;
  get diagnostics v_made = row_count;
  update public.paywall_daily_total
     set n = greatest(0, public.paywall_daily_total.n - v_made)
   where day = current_date;

  raise notice 'paywall events self-check passed';
end;
$$;
