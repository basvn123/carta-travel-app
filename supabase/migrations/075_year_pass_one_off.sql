-- 075_year_pass_one_off.sql
--
-- The Year Pass is a one-off 12-month pass that never renews (decision 0010,
-- ROADMAP I-f, owner 2026-11-12). The down migration is
-- 075_year_pass_one_off_down.sql.
--
-- WHY. 053 (T460) sold the Year Pass as a Stripe subscription and made
-- pass_can_buy refuse a second yearly plan while one was live (reason
-- 'subscribed'), because a renewing plan bought twice charges twice. The
-- checkout now sells both passes in payment mode and nothing renews, so a
-- Year Pass holder may buy another the way a Trip Pass holder adds days:
-- the grant stacks from the current expiry, and the horizon refusal (044)
-- still stops a purchase that would add nothing.
--
-- WHAT IT CHANGES. pass_can_buy only: 053's function without the
-- 'subscribed' branch. Everything else is 053's function unchanged.
--
-- WHAT IT LEAVES. entitlements.subscription_id, subscription_status,
-- cancel_at_period_end, renews_at and set_subscription_state stay. No
-- function writes them any more (the webhook's subscription branch and the
-- billing function are gone); no live subscriber was ever made (Stripe was
-- in test mode with no recurring Price), so they hold no data that matters,
-- but dropping columns is left to a later clean-up rather than done here.
--
-- ORDER. Paste in the Supabase SQL editor after 053, BEFORE deploying the
-- checkout and stripe-webhook functions of the same change (the new
-- checkout no longer handles 'subscribed'; with 053's function still live a
-- test-mode subscriber would get the generic error). Never `db push`
-- against the live project. Pasting twice is safe. Look for
-- "year pass one-off self-check passed".

do $$
begin
  if to_regprocedure('public.pass_can_buy(uuid, text)') is null
     or to_regprocedure('public.pass_horizon_days()') is null then
    raise exception 'Paste 044_payments_quota.sql and 053_pass_subscriptions.sql before 075_year_pass_one_off.sql';
  end if;
end $$;

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

-- Self-check: the function no longer knows the word.
do $$
begin
  if pg_get_functiondef('public.pass_can_buy(uuid, text)'::regprocedure) like '%subscribed%' then
    raise exception 'pass_can_buy still refuses a second Year Pass';
  end if;
  if has_function_privilege('authenticated', 'public.pass_can_buy(uuid, text)', 'execute') then
    raise exception 'authenticated must not call pass_can_buy';
  end if;
  raise notice 'year pass one-off self-check passed';
end $$;
