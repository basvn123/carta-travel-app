-- 053_pass_subscriptions.sql
--
-- The yearly plan and the 60-day Trip Pass (T460, owner decision 2026-10-16).
--
-- The Year Pass becomes a yearly plan that renews itself until the traveller
-- cancels; the Trip Pass stays a one-off payment and now lasts 60 days, so it
-- covers the planning weeks and the trip itself. Market evidence for both is
-- in Execution/P11/T460-pass-billing.md.
--
-- WHAT IT CHANGES
--
--   1. plan_tiers.trip.period_days 30 -> 60. A Trip Pass bought after this
--      paste runs 60 days; passes already granted keep their expiry.
--   2. entitlements gains the subscription's state, written only by the
--      webhook and the billing function on the service role:
--        subscription_id       Stripe's sub_... id
--        subscription_status   active | trialing | past_due | canceled | ...
--        cancel_at_period_end  true once the traveller has cancelled
--        renews_at             the end of the paid year (Stripe's period end)
--      The row stays readable by its owner through 007's policy, which is how
--      the Account panel shows "Renews 3 Oct 2027" or "Ends 3 Oct 2027".
--   3. set_subscription_state(...), the one writer of those four columns.
--   4. pass_can_buy refuses a second yearly plan while one is live, cancelled
--      or not (reason 'subscribed'): nobody is charged twice for one year, and
--      a cancelled plan is resumed rather than stacked. Everything else is 044's function unchanged.
--
-- HOW A YEAR IS GRANTED. Each paid invoice of the subscription (the first
-- and every renewal) calls 044's grant_pass with the invoice id as the
-- session id, so the ledger, the idempotency and the stacking rule are the
-- ones every pass already uses: a replayed invoice is a no-op, a renewal
-- extends from the current expiry and resets the allowance. No second grant
-- function exists to drift from the first.
--
-- ORDER. Paste in the Supabase SQL editor after 044 (it replaces 044's
-- pass_can_buy). Then deploy checkout, stripe-webhook and billing. Never
-- `db push` against ntssxktaduxzpsmejwyv. Pasting twice is safe. Look for
-- "pass subscriptions self-check passed".
--
-- DOWN, in this order:
--   drop function if exists public.set_subscription_state(uuid, text, text, boolean, timestamptz, text);
--   -- paste the pass_can_buy block and its two grant lines from 044 verbatim
--   alter table public.entitlements
--     drop column if exists subscription_id, drop column if exists subscription_status,
--     drop column if exists cancel_at_period_end, drop column if exists renews_at;
--   update public.plan_tiers set period_days = 30 where tier = 'trip';
--   notify pgrst, 'reload schema';
-- Dropping the columns forgets which accounts hold a yearly plan; export
-- entitlements first on a database with subscribers, and cancel their
-- subscriptions in Stripe, because nothing would record the next renewal.

do $$
begin
  if to_regprocedure('public.pass_can_buy(uuid, text)') is null
     or to_regprocedure('public.grant_pass(uuid, text, text, text, text, text, text, int, text, text, int, text)') is null then
    raise exception 'Paste 044_payments_quota.sql before 053_pass_subscriptions.sql';
  end if;
end $$;

-- 1. The Trip Pass runs 60 days.
update public.plan_tiers set period_days = 60 where tier = 'trip' and period_days <> 60;

-- 2. The subscription's state on the entitlement.
alter table public.entitlements
  add column if not exists subscription_id text,
  add column if not exists subscription_status text,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists renews_at timestamptz;

comment on column public.entitlements.subscription_id is
  'Stripe subscription id of the yearly plan, written by the webhook (053).';
comment on column public.entitlements.cancel_at_period_end is
  'True once the traveller cancelled: the plan runs to renews_at and stops.';

-- 3. The one writer.
create or replace function public.set_subscription_state(
  p_user uuid,
  p_subscription_id text,
  p_status text,
  p_cancel_at_period_end boolean,
  p_current_period_end timestamptz,
  p_customer_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := nullif(lower(trim(coalesce(p_status, ''))), '');
begin
  if p_user is null or coalesce(p_subscription_id, '') !~ '^sub_[A-Za-z0-9]{6,}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_input');
  end if;
  if v_status is not null and v_status !~ '^[a-z_]{3,24}$' then v_status := null; end if;

  insert into public.entitlements as t
    (user_id, tier, source, stripe_customer_id, subscription_id, subscription_status,
     cancel_at_period_end, renews_at, updated_at)
  values
    (p_user, 'free', 'stripe', p_customer_id, p_subscription_id, v_status,
     coalesce(p_cancel_at_period_end, false), p_current_period_end, now())
  on conflict (user_id) do update set
    stripe_customer_id   = coalesce(excluded.stripe_customer_id, t.stripe_customer_id),
    subscription_id      = excluded.subscription_id,
    subscription_status  = excluded.subscription_status,
    cancel_at_period_end = excluded.cancel_at_period_end,
    renews_at            = coalesce(excluded.renews_at, t.renews_at),
    updated_at           = now();

  return jsonb_build_object('ok', true, 'status', v_status,
                            'cancelAtPeriodEnd', coalesce(p_cancel_at_period_end, false));
end;
$$;

revoke all on function public.set_subscription_state(uuid, text, text, boolean, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.set_subscription_state(uuid, text, text, boolean, timestamptz, text)
  to service_role;

-- 4. pass_can_buy, 044's function plus the one refusal a yearly plan needs.
create or replace function public.pass_can_buy(p_user uuid, p_tier text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg      public.plan_tiers%rowtype;
  e        public.entitlements%rowtype;
  v_from   timestamptz;
  v_until  timestamptz;
  v_limit  timestamptz := now() + make_interval(days => public.pass_horizon_days());
begin
  select * into cfg from public.plan_tiers where tier = p_tier;
  if cfg.tier is null or cfg.period_days is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_tier');
  end if;
  select * into e from public.entitlements where user_id = p_user;
  -- A live yearly plan, renewing or cancelled with paid time left, refuses a
  -- second one: renewing, it would charge twice for one year; cancelled, the
  -- traveller resumes it (billing function) instead of stacking another.
  if p_tier = 'year'
     and e.subscription_id is not null
     and e.subscription_status in ('active', 'trialing', 'past_due') then
    return jsonb_build_object('ok', false, 'reason', 'subscribed', 'renewsAt', e.renews_at);
  end if;
  v_from := case
    when e.expires_at is not null and e.expires_at > now() then e.expires_at
    else now()
  end;
  v_until := v_from + make_interval(days => cfg.period_days);
  if v_from >= v_limit - interval '1 day' then
    return jsonb_build_object('ok', false, 'reason', 'horizon',
                              'expiresAt', e.expires_at, 'horizonAt', v_limit);
  end if;
  return jsonb_build_object('ok', true, 'expiresAt', least(v_until, v_limit),
                            'capped', v_until > v_limit);
end;
$$;

revoke all on function public.pass_can_buy(uuid, text) from public, anon, authenticated;
grant execute on function public.pass_can_buy(uuid, text) to service_role;

notify pgrst, 'reload schema';

-- Self-check.
do $$
declare n int;
begin
  select period_days into n from public.plan_tiers where tier = 'trip';
  if n <> 60 then raise exception 'plan_tiers.trip is % days, expected 60', n; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'entitlements'
                    and column_name = 'cancel_at_period_end') then
    raise exception 'entitlements.cancel_at_period_end is missing';
  end if;
  if has_function_privilege('authenticated', 'public.set_subscription_state(uuid, text, text, boolean, timestamptz, text)', 'execute') then
    raise exception 'authenticated must not write subscription state';
  end if;
  raise notice 'pass subscriptions self-check passed';
end $$;
