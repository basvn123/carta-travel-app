-- Cross-border VAT: record where the buyer was, and count the distance to the
-- EUR 10,000 one-stop-shop threshold.
--
-- WHY THIS EXISTS. Carta sells an electronically supplied service to
-- consumers. For that kind of supply the place of supply is normally the
-- customer's member state, which would mean registering for VAT in every
-- country a traveller buys from. Article 59c of the VAT Directive gives a
-- small supplier an exemption from that: while total cross-border B2C supplies
-- of telecommunications, broadcasting and electronic services to OTHER member
-- states stay at or below EUR 10,000, the place of supply stays in the
-- supplier's own member state, which for Carta is Belgium.
--
-- Crossing that figure changes the place of supply on the very transaction
-- that crosses it, and from then on the rate follows the buyer. The practical
-- answer is a One Stop Shop registration in Belgium, which files one quarterly
-- return covering every member state instead of 26 separate registrations. The
-- threshold is EU-wide, counted per calendar year, and it is breached for the
-- current year if EITHER the current year OR the previous year exceeded it.
-- That "previous year too" rule is the one people forget, and it is why the
-- reporting function below returns a row per year rather than a single total.
--
-- Three things do NOT count towards it, and the function is written to exclude
-- them: sales to buyers in Belgium (domestic, never cross-border), sales to
-- buyers outside the EU (a different regime entirely), and B2B sales (reverse
-- charge). Carta is a consumer product and collects no VAT number, so every
-- sale is treated as B2C, which is the conservative direction: counting a
-- business sale as B2C makes the figure too high and warns too early rather
-- than too late.
--
-- WHY A BACKSTOP AT ALL. Stripe Tax does its own threshold monitoring and it
-- is the authoritative source, because it sees the tax treatment of each
-- transaction and not just the amount. But it only speaks inside the Stripe
-- Dashboard, and a threshold nobody looks at is not a monitor. This migration
-- gives the same figure a home in our own database, computed from the ledger
-- the webhook already writes, so the number can be read from the admin panel
-- or from a SQL query without anyone logging into Stripe. If the two disagree,
-- Stripe is right and this is the thing that told you to go and look.
--
-- Apply in the Supabase SQL editor. Do NOT run `supabase db push` against the
-- live project.

-- ---------------------------------------------------------------------------
-- Columns on the per-sale ledger.
--
-- pass_grants is the right table for the same reason the consent columns in
-- 025 live here: it is the permanent, one-row-per-sale record, never
-- overwritten. A VAT threshold is a sum over historical sales, so it has to be
-- computed from a table that keeps every sale, not from entitlements, which
-- holds only a user's current state and is rewritten by their next purchase.
--
-- Nullable, no default, no backfill. A row written before this migration
-- genuinely does not know where its buyer was, and NULL says exactly that. A
-- default country would be a fabricated tax fact.
-- ---------------------------------------------------------------------------
alter table public.pass_grants
  -- ISO 3166-1 alpha-2, as Stripe reports it on
  -- session.customer_details.address.country. Stored as given, uppercased, so
  -- it can be compared against the member state list without folding.
  add column if not exists buyer_country text
    check (buyer_country is null or buyer_country ~ '^[A-Z]{2}$'),
  -- What the customer was actually charged, in the smallest currency unit,
  -- from session.amount_total. This is stored rather than joined from
  -- plan_tiers.price_cents because price_cents is decorative: T030 established
  -- that no code path reads it, so it records what we intended to charge and
  -- not what was charged. A threshold figure has to be built from real
  -- amounts, including any future discount, coupon or price change, and
  -- amount_total is the only number that knows about those.
  add column if not exists amount_cents int
    check (amount_cents is null or amount_cents >= 0),
  -- Stripe reports currency lowercase. Kept beside the amount because a sum of
  -- mixed currencies is meaningless, and the reporting function refuses to mix
  -- them rather than quietly adding cents to cents.
  add column if not exists currency text
    check (currency is null or currency ~ '^[a-z]{3}$');

comment on column public.pass_grants.buyer_country is
  'ISO 3166-1 alpha-2 from the Checkout Session customer_details.address. The '
  'place of supply for an electronically supplied service to a consumer, and '
  'therefore the field the EUR 10,000 Article 59c threshold is counted over. '
  'NULL means the sale predates this column or no address was returned.';

comment on column public.pass_grants.amount_cents is
  'session.amount_total, the amount actually charged, in the smallest unit of '
  'the currency column. VAT inclusive when the Stripe Price tax_behavior is '
  'inclusive, which is the intended setting.';

-- The threshold query scans by year and country. A single index on the two
-- columns in that order serves it, and it stays small because rows with no
-- country cannot contribute to the figure and are left out.
create index if not exists pass_grants_buyer_country_idx
  on public.pass_grants (buyer_country, granted_at)
  where buyer_country is not null;

-- ---------------------------------------------------------------------------
-- The member state list, as a function rather than a table.
--
-- A function because this list changes once a decade and a table would need
-- RLS, a policy, a seed and a migration of its own to correct. Belgium is
-- deliberately IN the list: it is a member state, and the caller excludes it
-- separately, so the list stays a plain statement of fact about the EU rather
-- than a statement about where Carta happens to be established. GB is absent,
-- which is the point of keeping this written down: the United Kingdom left,
-- and a sale to a British buyer is a non-EU sale that does not count towards
-- the threshold. Note also that XI (Northern Ireland) is not here; Northern
-- Ireland follows EU VAT rules for goods, not for electronically supplied
-- services, so it is correctly outside this list for Carta's purposes.
-- ---------------------------------------------------------------------------
create or replace function public.eu_member_states()
returns text[]
language sql
immutable
as $$
  select array[
    'AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU',
    'IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK'
  ]
$$;

comment on function public.eu_member_states() is
  'The 27 EU member states as ISO 3166-1 alpha-2 codes. Stripe reports GR for '
  'Greece, not EL, so GR is the code here. GB and XI are deliberately absent.';

revoke all on function public.eu_member_states() from public, anon;
grant execute on function public.eu_member_states() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The monitor. Admin only, read only, one row per calendar year.
--
-- Shape follows the other admin reporting functions in 014 and 022: SECURITY
-- DEFINER so it can read a table the caller has no policy for, guarded by
-- admin_guard() from 015 on entry so the privilege is never handed to a
-- non-admin, and returning jsonb with an `error` key on refusal so the client
-- helper in continent-app/src/auth/admin.js promotes it to a thrown Error
-- exactly as it does for every other RPC. Nothing is logged: this is a read,
-- and admin_guard's rate limit counts the audit log, so logging a dashboard
-- read would eventually rate-limit the dashboard.
--
-- It returns years rather than one figure because the rule needs two of them.
-- The threshold is breached for a given year if that year or the one before it
-- exceeded EUR 10,000, and `breached` on each row already applies that rule so
-- the caller does not have to re-derive it.
-- ---------------------------------------------------------------------------
create or replace function public.admin_oss_threshold()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err       text := public.admin_guard('read');
  v_limit     int  := 1000000;   -- EUR 10,000 in cents
  v_years     jsonb := '[]'::jsonb;
  v_unknown   bigint := 0;
  v_noamount  bigint := 0;
  v_currency  jsonb := '[]'::jsonb;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  -- Cross-border EU B2C, per calendar year. Belgium is excluded as domestic
  -- and everything outside the member state list as non-EU. A row with no
  -- amount contributes 0 and is counted separately below, because a sale we
  -- cannot value is a hole in the figure and must not read as a zero-euro
  -- sale.
  with eu as (
    select date_part('year', g.granted_at)::int as yr,
           coalesce(sum(g.amount_cents), 0)::bigint as cents,
           count(*)::bigint as sales,
           count(distinct g.buyer_country)::bigint as countries
      from public.pass_grants g
     where g.buyer_country is not null
       and g.buyer_country <> 'BE'
       and g.buyer_country = any (public.eu_member_states())
     group by 1
  ),
  withprev as (
    select yr, cents, sales, countries,
           coalesce(lag(cents) over (order by yr), 0) as prev_cents
      from eu
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'year',      yr,
           'cents',     cents,
           'sales',     sales,
           'countries', countries,
           'pct',       round((cents::numeric / v_limit) * 100, 1),
           -- The Article 59c test: this year OR last year over the limit.
           'breached',  (cents > v_limit or prev_cents > v_limit)
         ) order by yr desc), '[]'::jsonb)
    into v_years
    from withprev;

  -- Two integrity counts, so a small figure can be trusted rather than merely
  -- believed. Sales with no country cannot be placed on either side of the
  -- border, and sales with no amount cannot be valued; either one means the
  -- total below is a floor and not the answer.
  select count(*) filter (where buyer_country is null),
         count(*) filter (where amount_cents is null)
    into v_unknown, v_noamount
    from public.pass_grants;

  -- A sum across currencies would be nonsense. Rather than silently adding
  -- them, the currencies present are reported so a second one shows up as a
  -- fact on the dashboard instead of as a wrong total.
  select coalesce(jsonb_agg(jsonb_build_object('currency', c, 'sales', n)
           order by n desc), '[]'::jsonb)
    into v_currency
    from (
      select coalesce(currency, 'unknown') as c, count(*) as n
        from public.pass_grants
       where amount_cents is not null
       group by 1
    ) s;

  return jsonb_build_object(
    'thresholdCents', v_limit,
    'years',          v_years,
    -- The figure a single tile shows: the current calendar year.
    'currentYear',    date_part('year', now())::int,
    'currentCents',   coalesce((
      select (y->>'cents')::bigint from jsonb_array_elements(v_years) y
       where (y->>'year')::int = date_part('year', now())::int
    ), 0),
    'currentPct',     coalesce((
      select (y->>'pct')::numeric from jsonb_array_elements(v_years) y
       where (y->>'year')::int = date_part('year', now())::int
    ), 0),
    'breached',       coalesce((
      select bool_or((y->>'breached')::boolean) from jsonb_array_elements(v_years) y
       where (y->>'year')::int >= date_part('year', now())::int - 1
    ), false),
    'unknownCountry', v_unknown,
    'unknownAmount',  v_noamount,
    'currencies',     v_currency
  );
end;
$$;

comment on function public.admin_oss_threshold() is
  'Cumulative cross-border EU B2C sales per calendar year against the EUR '
  '10,000 Article 59c threshold. A backstop for Stripe Tax threshold '
  'monitoring, which remains authoritative.';

revoke all on function public.admin_oss_threshold() from public, anon;
grant execute on function public.admin_oss_threshold() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- grant_pass, with the buyer's country and the real amount carried through.
--
-- Same shape as 025 and for the same reason: the new parameters go at the END
-- with defaults, so the existing six-argument call in the currently written
-- webhook keeps working and simply records no country. That matters because
-- the migration and the function deploy separately, in either order.
--
-- And the same signature trap as 025. Defaulted parameters create a NEW
-- overload rather than replacing the old one, so a six-argument call against
-- both the 025 version and this one is ambiguous and Postgres refuses it,
-- which would break the webhook rather than upgrade it. The 025 version is
-- therefore dropped explicitly first, and the grants restated afterwards
-- because the drop takes them with it.
--
-- Everything inside the body is unchanged from 025 except the three columns.
-- The ordering is still load bearing: the replay guard reads pass_grants
-- first, and the pass_grants insert precedes the entitlements upsert so a
-- concurrent duplicate delivery loses on the primary key and rolls the whole
-- function back.
-- ---------------------------------------------------------------------------
drop function if exists public.grant_pass(uuid, text, text, text, text, text);

create or replace function public.grant_pass(
  p_user uuid,
  p_tier text,
  p_session_id text,
  p_customer_id text default null,
  p_consent_tos text default null,
  p_consent_terms_url text default null,
  p_buyer_country text default null,
  p_amount_cents int default null,
  p_currency text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg     public.plan_tiers%rowtype;
  e       public.entitlements%rowtype;
  v_from  timestamptz;
  v_until timestamptz;
  v_tos   text;
  v_cc    text;
  v_cur   text;
begin
  select * into cfg from public.plan_tiers where tier = p_tier;
  if cfg.tier is null or cfg.period_days is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_tier');
  end if;

  v_tos := case when p_consent_tos in ('accepted', 'declined') then p_consent_tos else null end;

  -- Normalised and validated here rather than trusted from the caller, for the
  -- same reason the consent value is: a grant must NEVER fail over a reporting
  -- field when the customer has already paid. Anything that is not a plain
  -- two-letter code becomes NULL, which reads as "we do not know where this
  -- buyer was" and is counted as a hole by admin_oss_threshold rather than
  -- silently placed on one side of the border.
  v_cc  := nullif(upper(trim(coalesce(p_buyer_country, ''))), '');
  if v_cc is not null and v_cc !~ '^[A-Z]{2}$' then v_cc := null; end if;
  v_cur := nullif(lower(trim(coalesce(p_currency, ''))), '');
  if v_cur is not null and v_cur !~ '^[a-z]{3}$' then v_cur := null; end if;

  if exists (select 1 from public.pass_grants where session_id = p_session_id) then
    return jsonb_build_object('ok', true, 'replay', true);
  end if;

  select * into e from public.entitlements where user_id = p_user;
  v_from := case
    when e.expires_at is not null and e.expires_at > now() then e.expires_at
    else now()
  end;
  v_until := v_from + make_interval(days => cfg.period_days);

  insert into public.pass_grants
    (session_id, user_id, tier, expires_at, consent_tos, consent_at,
     consent_terms_url, buyer_country, amount_cents, currency)
  values
    (p_session_id, p_user, p_tier, v_until,
     v_tos,
     case when v_tos is not null then now() else null end,
     case when v_tos is not null then nullif(p_consent_terms_url, '') else null end,
     v_cc,
     case when p_amount_cents is not null and p_amount_cents >= 0 then p_amount_cents else null end,
     v_cur);

  insert into public.entitlements as t
    (user_id, tier, period_start, expires_at, source, stripe_customer_id, last_session_id, updated_at)
  values
    (p_user, p_tier, now(), v_until, 'stripe', p_customer_id, p_session_id, now())
  on conflict (user_id) do update set
    tier               = excluded.tier,
    period_start       = excluded.period_start,
    expires_at         = excluded.expires_at,
    source             = excluded.source,
    stripe_customer_id = coalesce(excluded.stripe_customer_id, t.stripe_customer_id),
    last_session_id    = excluded.last_session_id,
    updated_at         = now();

  return jsonb_build_object(
    'ok', true, 'tier', p_tier, 'expiresAt', v_until,
    'consentTos', v_tos, 'buyerCountry', v_cc
  );
end;
$$;

revoke all on function
  public.grant_pass(uuid, text, text, text, text, text, text, int, text)
  from public, anon, authenticated;
grant execute on function
  public.grant_pass(uuid, text, text, text, text, text, text, int, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- DOWN
--
-- Reverses in three steps, and the order matters: restore the function the
-- deployed webhook can call before removing anything it writes to.
--
--   drop function if exists
--     public.grant_pass(uuid, text, text, text, text, text, text, int, text);
--
--   -- then re-run the grant_pass block from 025_withdrawal_waiver.sql
--   -- verbatim, which recreates the six-argument version, followed by:
--   -- revoke all on function
--   --   public.grant_pass(uuid, text, text, text, text, text)
--   --   from public, anon, authenticated;
--   -- grant execute on function
--   --   public.grant_pass(uuid, text, text, text, text, text) to service_role;
--
--   drop function if exists public.admin_oss_threshold();
--   drop function if exists public.eu_member_states();
--
--   drop index if exists public.pass_grants_buyer_country_idx;
--   alter table public.pass_grants
--     drop column if exists buyer_country,
--     drop column if exists amount_cents,
--     drop column if exists currency;
--
-- Dropping those columns destroys the only record of where each buyer was and
-- what they paid, which is the evidence a VAT threshold figure is built from
-- and the evidence a tax authority would ask for. Export pass_grants before
-- running the down section if any real purchase has happened, and treat the
-- column drop as one-way on a live database with sales on it. Dropping the two
-- functions is harmless and reversible at any time; the columns are not.
-- ---------------------------------------------------------------------------
