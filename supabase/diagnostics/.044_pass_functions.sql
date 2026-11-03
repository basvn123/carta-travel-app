create or replace function public.pass_horizon_days()
returns int
language sql
immutable
set search_path = ''
as $$ select 1095 $$;

comment on function public.pass_horizon_days() is
  'Ceiling on entitlements.expires_at: never more than this many days from '
  'now(), whatever is bought. grant_pass clamps to it and pass_can_buy '
  'refuses a purchase that would be clamped to nothing.';

-- Can this user buy this tier right now? Called by the checkout function on
-- the service role before a Stripe session is opened, so nobody is charged
-- for days the horizon would take away. Returns ok true with the expiry a
-- grant would produce, or ok false with reason 'horizon'.
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
  -- Refuse only when the clamp would take back the WHOLE purchase: a pass
  -- already at the horizon gains nothing from another sale. "At" allows a
  -- day of slack, so a pass clamped a moment ago reads as at the horizon
  -- rather than a few milliseconds short of it.
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

-- grant_pass. The nine-argument version from 026 is dropped first for the
-- same reason 025 and 026 give: defaulted parameters make a second overload,
-- and PostgREST calls by name would be ambiguous.
drop function if exists public.grant_pass(uuid, text, text, text, text, text, text, int, text);

create or replace function public.grant_pass(
  p_user uuid,
  p_tier text,
  p_session_id text,
  p_customer_id text default null,
  p_consent_tos text default null,
  p_consent_terms_url text default null,
  p_buyer_country text default null,
  p_amount_cents int default null,
  p_currency text default null,
  p_reason text default null,
  p_fee_cents int default null,
  p_fee_currency text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg      public.plan_tiers%rowtype;
  held     public.plan_tiers%rowtype;
  e        public.entitlements%rowtype;
  v_from   timestamptz;
  v_until  timestamptz;
  v_limit  timestamptz := now() + make_interval(days => public.pass_horizon_days());
  v_capped boolean := false;
  v_live   boolean := false;
  v_keep   boolean := false;
  v_tier   text;
  v_start  timestamptz;
  v_tos    text;
  v_cc     text;
  v_cur    text;
  v_reason text;
  v_feecur text;
begin
  select * into cfg from public.plan_tiers where tier = p_tier;
  if cfg.tier is null or cfg.period_days is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_tier');
  end if;

  -- Reporting fields are normalised, never trusted, and never fail a grant:
  -- the customer has already paid.
  v_tos := case when p_consent_tos in ('accepted', 'declined') then p_consent_tos else null end;
  v_cc  := nullif(upper(trim(coalesce(p_buyer_country, ''))), '');
  if v_cc is not null and v_cc !~ '^[A-Z]{2}$' then v_cc := null; end if;
  v_cur := nullif(lower(trim(coalesce(p_currency, ''))), '');
  if v_cur is not null and v_cur !~ '^[a-z]{3}$' then v_cur := null; end if;
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is not null and v_reason !~ '^[A-Za-z]{1,32}$' then v_reason := null; end if;
  v_feecur := nullif(lower(trim(coalesce(p_fee_currency, ''))), '');
  if v_feecur is not null and v_feecur !~ '^[a-z]{3}$' then v_feecur := null; end if;

  if exists (select 1 from public.pass_grants where session_id = p_session_id) then
    return jsonb_build_object('ok', true, 'replay', true);
  end if;

  select * into e from public.entitlements where user_id = p_user;
  v_live := e.user_id is not null and e.expires_at is not null and e.expires_at > now();
  v_from := case when v_live then e.expires_at else now() end;
  v_until := v_from + make_interval(days => cfg.period_days);

  -- The horizon (T031-c). Clamped rather than refused, because by the time
  -- this runs the money has moved; pass_can_buy is where a sale that would
  -- gain nothing is refused.
  if v_until > v_limit then
    v_until  := v_limit;
    v_capped := true;
  end if;

  -- The stacking rule (T031-b). A live pass of a higher rank is kept, with
  -- its period and allowance untouched, and gains the bought tier's days.
  -- Anything else (same tier, an upgrade, or no live pass) takes the bought
  -- tier and a fresh period, as 007 always did.
  if v_live then
    select * into held from public.plan_tiers where tier = e.tier;
    v_keep := held.tier is not null and held.rank > cfg.rank;
  end if;
  v_tier  := case when v_keep then e.tier else p_tier end;
  v_start := case when v_keep then e.period_start else now() end;

  insert into public.pass_grants
    (session_id, user_id, tier, expires_at, consent_tos, consent_at,
     consent_terms_url, buyer_country, amount_cents, currency,
     reason, fee_cents, fee_currency)
  values
    (p_session_id, p_user, p_tier, v_until,
     v_tos,
     case when v_tos is not null then now() else null end,
     case when v_tos is not null then nullif(p_consent_terms_url, '') else null end,
     v_cc,
     case when p_amount_cents is not null and p_amount_cents >= 0 then p_amount_cents else null end,
     v_cur,
     v_reason,
     case when p_fee_cents is not null and p_fee_cents >= 0 then p_fee_cents else null end,
     v_feecur);

  insert into public.entitlements as t
    (user_id, tier, period_start, expires_at, source, stripe_customer_id, last_session_id, updated_at)
  values
    (p_user, v_tier, v_start, v_until, 'stripe', p_customer_id, p_session_id, now())
  on conflict (user_id) do update set
    tier               = excluded.tier,
    period_start       = excluded.period_start,
    expires_at         = excluded.expires_at,
    source             = excluded.source,
    stripe_customer_id = coalesce(excluded.stripe_customer_id, t.stripe_customer_id),
    last_session_id    = excluded.last_session_id,
    updated_at         = now();

  return jsonb_build_object(
    'ok', true, 'tier', v_tier, 'bought', p_tier, 'expiresAt', v_until,
    'kept', v_keep, 'capped', v_capped,
    'consentTos', v_tos, 'buyerCountry', v_cc, 'reason', v_reason
  );
end;
$$;

revoke all on function
  public.grant_pass(uuid, text, text, text, text, text, text, int, text, text, int, text)
  from public, anon, authenticated;
grant execute on function
  public.grant_pass(uuid, text, text, text, text, text, text, int, text, text, int, text)
  to service_role;
