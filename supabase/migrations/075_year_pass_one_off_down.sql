-- Down for 075_year_pass_one_off.sql (ROADMAP I-f). Paste in the SQL editor.
-- Restores 053's pass_can_buy, copied verbatim below, which refuses a second
-- Year Pass while a subscription is live (reason 'subscribed'). Not one-way:
-- 075 changed no data. Only useful together with a revert of the checkout,
-- stripe-webhook and billing functions to their 053 (T460) versions.

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
