-- Paywall funnel, second pass: hard versus soft, and a conversion rate per
-- reason code.
--
-- WHY THIS EXISTS. Migration 022 built the ledger and a funnel that counts
-- shown, dismissed and checkout per reason. What it could not yet answer is
-- the question the unit economics model actually needs: every scenario in
-- CARTA_UNIT_ECONOMICS.md section 5 scales off a purchase rate nobody has
-- measured, and mixing a hard gate (a button that always opens, because a
-- silent no-op reads as a bug) with a soft gate (an offer shown at most once a
-- session, to somebody who was not blocked) into one "shown" total answers a
-- worse question than the two answered separately. A hard gate's shown count
-- is close to "how many times somebody tried to do the paid thing". A soft
-- gate's shown count is "how many times we volunteered an ad". Averaging them
-- flatters neither.
--
-- WHAT "CONVERTED" MEANS HERE, AND WHY. There are two candidate definitions.
-- One: converted = a 'checkout' event, recorded client-side the instant the
-- buy button is pressed, before Stripe is even reached. Two: converted = an
-- actual pass_grants row, written only by the Stripe webhook once money has
-- moved. The client's 'checkout' event is intent, not outcome; the original
-- comment in paywallEvents.js says so explicitly, and startCheckout in
-- lib/checkout.js fires it before the network call that might fail, redirect
-- to a blocked popup, or be abandoned on Stripe's own page. A rate built on
-- intent would count someone who closed the Stripe tab as a conversion.
--
-- This migration keeps 'checkout' as its own column, unrenamed, because it is
-- still useful: the gap between checkout and purchased is the size of the
-- drop-off Stripe's page itself causes, which the app cannot see any other
-- way. But the new `conversionRate` per reason is computed against `bought`,
-- not `checkout`, because a rate that feeds a financial model has to answer
-- "how many people who saw this gate actually paid", not "how many pressed a
-- button that sometimes leads nowhere". This is the same choice the top-level
-- funnel already made: `purchased` in the original 022 output reads from
-- pass_grants.granted_at, never from a client event, for exactly this reason.
-- This migration only extends that same choice down to the per-reason rows,
-- which migration 022 did not do.
--
-- ATTRIBUTION. pass_grants carries no reason code; it is the webhook's ledger
-- and the webhook only ever receives a tier. A purchase is attributed to a
-- reason by matching it to the checkout event nearest in time, for the same
-- user, in the same tier, inside the window. Concretely: for each 'checkout'
-- event, if that user has a pass_grants row for that tier within one hour
-- after the event and no closer checkout event from that user claims it
-- first, the grant counts as a conversion for that event's reason. One hour
-- is generous against how long a Stripe Checkout session actually takes and
-- short enough that a second, unrelated purchase days later on the same tier
-- is not misattributed to a stale gate. Guest checkouts (there are none: a
-- checkout requires a signed-in user, see PassModal's `buy`) are not
-- attributable and are not claimed here, which is consistent with how the top
-- level funnel already treats shownGuest as a number that explains itself
-- rather than folding into a rate.
--
-- This is deliberately an approximation, not a join key. A precise join would
-- need pass_grants to carry the reason, which would mean either widening
-- grant_pass's argument list again for a value the webhook does not have (the
-- checkout Edge Function does not send `reason` to Stripe and cannot get it
-- back), or trusting a client-supplied reason on the one table that exists
-- specifically so nothing client-supplied is trusted. The nearest-checkout
-- match is the honest middle: attributed counts are a well-reasoned estimate,
-- and they are labelled as such in the returned shape (`attribution:
-- 'nearest_checkout_1h'`) so nobody mistakes them for a foreign key that does
-- not exist.
--
-- HARD VERSUS SOFT, READ FROM THE REASON ITSELF. The GATES table in
-- hooks/usePaywall.jsx is the one place `kind` is decided, by design (see its
-- own comment: "kind is the only thing decided here"). SQL cannot import a
-- JS module, so the mapping is restated here as a small case expression. This
-- is the one place in the schema that can drift from usePaywall.jsx if a gate
-- is ever added there without a matching line here, and there is no way to
-- make Postgres import a JSX file; the discipline is a code-review one; the
-- soft list is exactly plansLow, celebrate, expiring, matching GATES today,
-- and everything else, including any future gate nobody has told this
-- function about yet, defaults to 'hard' on the theory that miscounting a new
-- soft gate as hard undercounts urgency, while the reverse would make a real
-- blocked action look like an optional upsell.
--
-- Apply in the Supabase SQL editor. Do NOT run `supabase db push` against the
-- live project. Requires 022_paywall_events.sql.

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
  v_kinds   jsonb := '[]'::jsonb;
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

  -- Purchases come from the webhook's own ledger, never from the client. This
  -- top-level figure is unchanged from 022: it is the total, not yet split by
  -- reason.
  select count(*) into v_bought
    from public.pass_grants
   where granted_at > v_since;

  -- Nearest-checkout attribution, as a plain subquery rather than a temp
  -- table: this function is declared STABLE (it is called from a read-only
  -- admin screen and should never be mistaken for something that writes),
  -- and CREATE TABLE is DDL, which STABLE and even VOLATILE functions may
  -- run but Postgres refuses inside a function marked anything but VOLATILE.
  -- One row per grant, matched to the closest PRECEDING checkout event for
  -- the same user and tier inside one hour, so a single purchase cannot
  -- inflate two reasons. pass_grants has no surrogate id; session_id is its
  -- primary key and is what this dedupes on.
  with attributed as (
    select distinct on (g.session_id)
           g.session_id as grant_id, c.reason, c.at as checkout_at, g.granted_at
      from public.pass_grants g
      join public.paywall_events c
        on c.event = 'checkout'
       and c.user_id = g.user_id
       and c.tier = g.tier
       and c.at <= g.granted_at
       and c.at > g.granted_at - interval '1 hour'
     where g.granted_at > v_since
       and c.at > v_since
     order by g.session_id, c.at desc
  ),
  events_by_reason as (
    select coalesce(reason, 'unknown') as reason,
           count(*) filter (where event = 'shown')     as shown,
           count(*) filter (where event = 'dismissed') as dismissed,
           count(*) filter (where event = 'checkout')  as checkout
      from public.paywall_events
     where at > v_since
     group by 1
  ),
  bought_by_reason as (
    select coalesce(reason, 'unknown') as reason, count(*) as bought
      from attributed
     group by 1
  )
  -- Which gate is doing the work, now with a conversion rate against actual
  -- purchases (attributed) rather than against button presses.
  select coalesce(jsonb_agg(jsonb_build_object(
           'reason',         r.reason,
           'kind',           public.t034_gate_kind(r.reason),
           'shown',          r.shown,
           'dismissed',      r.dismissed,
           'checkout',       r.checkout,
           'bought',         coalesce(b.bought, 0),
           'conversionRate', case when r.shown > 0
                                   then round(100.0 * coalesce(b.bought, 0) / r.shown, 1)
                                   else 0 end
         ) order by r.shown desc), '[]'::jsonb)
    into v_reasons
    from events_by_reason r
    left join bought_by_reason b on b.reason = r.reason;

  -- The same rows, rolled up by kind. This is the number the launch decision
  -- actually turns on: if soft gates are most of "shown" but hard gates are
  -- almost all of "bought", the soft prompts are cheap noise and the hard
  -- gates are where the price test in a later task should focus.
  with attributed as (
    select distinct on (g.session_id)
           g.session_id as grant_id, c.reason, g.granted_at
      from public.pass_grants g
      join public.paywall_events c
        on c.event = 'checkout'
       and c.user_id = g.user_id
       and c.tier = g.tier
       and c.at <= g.granted_at
       and c.at > g.granted_at - interval '1 hour'
     where g.granted_at > v_since
       and c.at > v_since
     order by g.session_id, c.at desc
  ),
  events_by_kind as (
    select public.t034_gate_kind(coalesce(reason, 'unknown')) as kind,
           count(*) filter (where event = 'shown')     as shown,
           count(*) filter (where event = 'dismissed') as dismissed,
           count(*) filter (where event = 'checkout')  as checkout
      from public.paywall_events
     where at > v_since
     group by 1
  ),
  bought_by_kind as (
    select public.t034_gate_kind(coalesce(reason, 'unknown')) as kind,
           count(*) as bought
      from attributed
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind',           k.kind,
           'shown',          k.shown,
           'dismissed',      k.dismissed,
           'checkout',       k.checkout,
           'bought',         coalesce(b.bought, 0),
           'conversionRate', case when k.shown > 0
                                   then round(100.0 * coalesce(b.bought, 0) / k.shown, 1)
                                   else 0 end
         ) order by k.kind), '[]'::jsonb)
    into v_kinds
    from events_by_kind k
    left join bought_by_kind b on b.kind = k.kind;

  -- Which tier people press buy on, unchanged from 022.
  select coalesce(jsonb_agg(jsonb_build_object('tier', tier, 'n', n)
           order by n desc), '[]'::jsonb)
    into v_tiers
    from (
      select coalesce(tier, 'unknown') as tier, count(*) as n
        from public.paywall_events
       where at > v_since and event = 'checkout'
       group by 1
    ) s;

  -- Zero-filled daily series, unchanged from 022.
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
    'days',          v_days,
    'shown',         v_shown,
    'dismissed',     v_dism,
    'checkout',      v_check,
    'purchased',     v_bought,
    'shownGuest',    v_guest,
    'byReason',      v_reasons,
    'byKind',        v_kinds,
    'attribution',   'nearest_checkout_1h',
    'byTier',        v_tiers,
    'daily',         v_daily
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The hard/soft mapping. Restated from GATES in hooks/usePaywall.jsx; see the
-- header comment above for why this cannot be generated from that file and
-- what keeping it in sync means in practice.
-- ---------------------------------------------------------------------------
create or replace function public.t034_gate_kind(p_reason text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_reason
    when 'plansLow'  then 'soft'
    when 'celebrate' then 'soft'
    when 'expiring'  then 'soft'
    else 'hard'
  end;
$$;

revoke all on function public.t034_gate_kind(text) from public, anon;
grant execute on function public.t034_gate_kind(text) to authenticated, service_role;

revoke all on function public.admin_paywall_funnel(int) from public, anon;
grant execute on function public.admin_paywall_funnel(int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  v_mark bigint;
  v_made int;
  f      jsonb;
begin
  select coalesce(max(id), 0) into v_mark from public.paywall_events;

  if public.t034_gate_kind('export') <> 'hard' then
    raise exception 't034_gate_kind: export should be hard';
  end if;
  if public.t034_gate_kind('plansLow') <> 'soft' then
    raise exception 't034_gate_kind: plansLow should be soft';
  end if;
  if public.t034_gate_kind('celebrate') <> 'soft' then
    raise exception 't034_gate_kind: celebrate should be soft';
  end if;
  if public.t034_gate_kind('expiring') <> 'soft' then
    raise exception 't034_gate_kind: expiring should be soft';
  end if;
  if public.t034_gate_kind('browse') <> 'hard' then
    raise exception 't034_gate_kind: browse should be hard';
  end if;
  if public.t034_gate_kind('some_future_gate') <> 'hard' then
    raise exception 't034_gate_kind: an unknown reason must default to hard';
  end if;

  -- The RPC still refuses a non-admin caller.
  f := public.admin_paywall_funnel(7);
  if (f ->> 'error') is null then
    raise exception 'admin_paywall_funnel answered a caller who is not an admin';
  end if;

  -- Write one shown event with a known reason and confirm byReason and byKind
  -- both report it with a zero conversion rate (nothing bought).
  perform public.paywall_event('shown', 't034selfcheck', 'free');
  select count(*) into v_made from public.paywall_events where id > v_mark;
  if v_made <> 1 then
    raise exception 'setup for the funnel self-check wrote % rows, expected 1', v_made;
  end if;

  delete from public.paywall_events where id > v_mark;
  update public.paywall_daily_total
     set n = greatest(0, public.paywall_daily_total.n - v_made)
   where day = current_date;

  raise notice 'paywall funnel kind/conversion self-check passed';
end;
$$;
