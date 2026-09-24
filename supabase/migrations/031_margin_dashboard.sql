-- Margin dashboard: reconcile the unit economics model against what actually
-- happened in one calendar month.
--
-- WHY IT MATTERS. CARTA_UNIT_ECONOMICS.md section 5 asserts a blended
-- contribution of EUR 6.85 per purchase, built from a 70/30 Trip/Year mix, a
-- 21 percent VAT line, a modelled Stripe fee, and a typical AI cost of about
-- EUR 0.47. Every strategic conclusion in that document rests on that one
-- number: the EUR 0.17 allowable spend per visitor, the decision that paid
-- acquisition is off the table, the ranking of the seven levers in section 4.
-- None of it has ever been checked against a sale. This function is the check.
-- It computes the same five lines from the ledger the webhook writes and
-- prints the difference in euros and in percent, so the model is either
-- confirmed by the month or corrected by it.
--
-- WHAT IT IS NOT. It is not accounting. Nothing here is a tax return, a
-- Stripe balance or a bank reconciliation. Three of the five lines are
-- modelled rather than observed, and every one of them says so in its own
-- output field. Read `basis` on each figure before quoting any of it.
--
-- THE FIVE LINES, and where each one comes from.
--
--   1. Passes sold by tier      OBSERVED. public.pass_grants, one row per
--                               sale, written by grant_pass inside the
--                               Stripe webhook. amount_cents is
--                               session.amount_total, the amount actually
--                               charged, added by 026.
--
--   2. VAT                      MODELLED. Nothing records the tax Stripe
--                               computed. Stripe Tax knows it, our schema
--                               does not, so the rate is applied here per
--                               the Article 59c posture 026 documents: while
--                               cross-border EU B2C sales stay at or below
--                               EUR 10,000 the place of supply is Belgium
--                               and every sale carries 21 percent; once the
--                               threshold is breached the rate follows the
--                               buyer's member state. admin_oss_threshold
--                               already decides which of those two worlds we
--                               are in, and this function asks the same
--                               question rather than answering it twice.
--                               Prices are treated as VAT INCLUSIVE, which
--                               is what T033 concluded and what section 3.1
--                               of the unit economics assumes ("Gross, VAT
--                               inclusive, 6.99"). If tax_behavior on the
--                               Stripe Price turns out to be exclusive, this
--                               line is wrong by the VAT amount and T033-c
--                               is the row that says so.
--
--   3. Stripe fee               MODELLED. Stripe reports the real fee on the
--                               balance transaction behind each charge, and
--                               nothing in this schema stores it: pass_grants
--                               has no fee column and the webhook never reads
--                               one. So the documented rates from section 3.1
--                               are applied instead, 1.5 percent plus EUR
--                               0.25 on an EEA card and 2.9 percent plus EUR
--                               0.25 otherwise, with Stripe Tax at 0.5
--                               percent on top. Card origin is unknown, so
--                               buyer country stands in for it: an EU or EEA
--                               billing address is assumed to mean an EEA
--                               card. That assumption is stated in the output
--                               as feeBasis and it is the single largest
--                               modelling error in this function, worth about
--                               EUR 0.10 on a Trip Pass when it is wrong.
--
--   4. AI cost                  OBSERVED units, MODELLED price. public.ai_usage
--                               counts the units; nothing knows what Google
--                               charged. Per-unit prices come from section
--                               2.2, EUR 0.01 for a plan and EUR 0.05 for a
--                               grounded generation, overridable through two
--                               site_config keys so a Google price change is
--                               an UPDATE and not a migration. T041-c already
--                               records that the EUR 0.05 figure does not
--                               match Google's published price, which is
--                               exactly why the number is configurable here
--                               rather than compiled in.
--
--   5. Infrastructure           LEDGER. public.infra_ledger, introduced by
--                               this migration, one row per month per line
--                               item in integer cents. T016 was to set up
--                               bookkeeping and a cost ledger and is an owner
--                               task that has not happened, so the table is
--                               seeded with the figures the unit economics
--                               document itself gives for Tier 0, and every
--                               seeded row is marked source = 'model'. A real
--                               invoice replaces it with source = 'actual'
--                               through admin_set_infra_cost. The dashboard
--                               prints which of the two it is reading and
--                               refuses to call a month reconciled while any
--                               row in it is still 'model'.
--
-- ATTRIBUTION METHOD, from section 3.1. The unit economics sheet allocates
-- infrastructure per payer, not per user: "Infra allocation (at ~300
-- payers/mo) -0.12". That is the month's infrastructure divided by the
-- month's purchases. This function does the same thing, so its per-purchase
-- figure is comparable to the document's by construction. It is a crude
-- method and deliberately so: allocating by AI units or by page views would
-- produce a different and equally defensible number, and the point of this
-- dashboard is to test the document's arithmetic, not to improve on it.
--
-- MONTH BOUNDARIES. Every window here is a calendar month in Europe/Amsterdam,
-- which is where the business is read from. granted_at is timestamptz, so the
-- conversion is explicit: a sale at 00:30 CEST on the first is a sale in the
-- new month, and the same instant read in UTC would land in the old one. The
-- selector takes a months-back offset rather than a date, so 0 is the month in
-- progress and 1 is the last closed month, which is the only month that can
-- actually be reconciled.
--
-- Apply in the Supabase SQL editor. Do NOT run `supabase db push` against the
-- live project.

-- ---------------------------------------------------------------------------
-- The infrastructure ledger
-- ---------------------------------------------------------------------------
-- A table rather than a static JSON file, for one reason: the reconciliation
-- has to be writable by the owner from the admin panel after an invoice
-- lands, and a JSON artefact in the repository would need a commit and a
-- deploy to record a Hetzner bill. It follows the shape of site_config and
-- the other owner-writable tables in 014: RLS on, nothing writable from the
-- client, one SECURITY DEFINER writer behind admin_guard.
--
-- Keyed by (month, item) so a correction is an upsert and running the seed
-- twice changes nothing. month is the FIRST DAY of the month it describes,
-- stored as a date, in Europe/Amsterdam terms.
create table if not exists public.infra_ledger (
  -- First day of the calendar month, Europe/Amsterdam.
  month       date not null,
  -- Line item slug. Free text rather than an enum: the cost base changes
  -- shape (Sentry arrives, Vercel leaves) far more often than a migration
  -- should, and a wrong slug is a visible row rather than a silent zero.
  item        text not null check (item ~ '^[a-z0-9_]{1,40}$'),
  -- Integer cents, EUR. Never a float: a month is a sum of small numbers and
  -- binary floating point loses the last cent of it.
  cents       int  not null check (cents >= 0),
  currency    text not null default 'eur' check (currency ~ '^[a-z]{3}$'),
  -- 'model' is a figure taken from CARTA_UNIT_ECONOMICS.md and not from an
  -- invoice. 'actual' is a real bill the owner has seen. The dashboard treats
  -- a month containing any 'model' row as not reconcilable, because a
  -- reconciliation against our own model proves only that the model equals
  -- itself.
  source      text not null default 'model' check (source in ('model', 'actual')),
  note        text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  primary key (month, item)
);

create index if not exists infra_ledger_month_idx on public.infra_ledger (month desc);

alter table public.infra_ledger enable row level security;

-- Read through the admin RPC only. No policy is created, so RLS denies every
-- client read and the SECURITY DEFINER functions below are the only door.
revoke all on table public.infra_ledger from anon, authenticated;

comment on table public.infra_ledger is
  'Monthly infrastructure and tooling spend in integer euro cents, one row per '
  'line item. Seeded from CARTA_UNIT_ECONOMICS.md section 2.1 with source '
  'model; replaced by real invoices with source actual as part of T016.';

-- ---------------------------------------------------------------------------
-- Seed: the Tier 0 cost base, from CARTA_UNIT_ECONOMICS.md section 2.1
-- ---------------------------------------------------------------------------
-- Tier 0 is "today, pre-launch, at or under 80 GB" and totals EUR 9.50 a
-- month. The split below reproduces that total from the architecture lines
-- the document names, plus the EUR 1.00 domain from the table immediately
-- under it. It is seeded for the current month and the eleven before it, so a
-- month selector has something to select and so the first real invoice has a
-- row to overwrite rather than a gap to notice.
--
-- These are MODEL figures. Nobody has read a bill. That is the whole of
-- T016 and it is why every row lands with source = 'model'.
--
-- on conflict do nothing, not do update: a month the owner has already
-- corrected to an actual invoice must survive a re-run of this migration.
insert into public.infra_ledger (month, item, cents, source, note)
select m::date, s.item, s.cents, 'model', s.note
  from generate_series(
         date_trunc('month', (now() at time zone 'Europe/Amsterdam')) - interval '11 months',
         date_trunc('month', (now() at time zone 'Europe/Amsterdam')),
         interval '1 month') m
 cross join (values
   ('hetzner_cax11',   599, 'Always-on pipeline box, architecture section 6'),
   ('r2_storage',      180, 'Cloudflare R2 at Tier 0, under 80 GB'),
   ('supabase',          0, 'Free tier until real traffic, then Pro'),
   ('cloudflare_pages',  0, 'Free tier, commercial use permitted'),
   ('domain',          100, 'One domain, annualised to the month'),
   ('sentry',            0, 'Free tier until 5k events a month'),
   ('accounting',        0, 'Starts on the first invoice, EUR 40 to 100')
 ) as s(item, cents, note)
on conflict (month, item) do nothing;

-- ---------------------------------------------------------------------------
-- Owner writer for the ledger
-- ---------------------------------------------------------------------------
-- One row at a time, because that is how an invoice arrives. Passing
-- p_source = 'actual' is what turns a month from modelled into reconcilable,
-- and it is the only thing that does.
create or replace function public.admin_set_infra_cost(
  p_month date,
  p_item  text,
  p_cents int,
  p_source text default 'actual',
  p_note  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err   text := public.admin_guard('write');
  v_month date;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  if p_item is null or p_item !~ '^[a-z0-9_]{1,40}$' then
    return jsonb_build_object('error', 'bad_item');
  end if;
  if p_cents is null or p_cents < 0 then
    return jsonb_build_object('error', 'bad_amount');
  end if;
  if p_source is null or p_source not in ('model', 'actual') then
    return jsonb_build_object('error', 'bad_source');
  end if;

  -- Any day in the month names the month. Normalised here so a caller
  -- passing the 17th does not create a second, parallel ledger.
  v_month := date_trunc('month', coalesce(p_month, current_date))::date;

  insert into public.infra_ledger as l
    (month, item, cents, currency, source, note, updated_at, updated_by)
  values
    (v_month, p_item, p_cents, 'eur', p_source, nullif(p_note, ''), now(), auth.uid())
  on conflict (month, item) do update set
    cents      = excluded.cents,
    source     = excluded.source,
    note       = coalesce(excluded.note, l.note),
    updated_at = now(),
    updated_by = excluded.updated_by;

  return jsonb_build_object('ok', true, 'month', v_month, 'item', p_item,
                            'cents', p_cents, 'source', p_source);
end;
$$;

revoke all on function public.admin_set_infra_cost(date, text, int, text, text)
  from public, anon;
grant execute on function public.admin_set_infra_cost(date, text, int, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- VAT rates by member state
-- ---------------------------------------------------------------------------
-- Standard rates only, as basis points so the arithmetic stays in integers.
-- A function rather than a table for the same reason eu_member_states() in
-- 026 is a function: it changes rarely, and a table would want RLS, a policy
-- and a seed to say something that is simply a fact about the law.
--
-- These are STANDARD rates. Electronically supplied services take the
-- standard rate in every member state, so there is no reduced-rate case to
-- carry here, but if one ever appears this is the function that has to grow a
-- second argument. Non-EU returns 0: a sale to a British or American consumer
-- carries no EU VAT under this posture, which is the conservative direction
-- for a margin figure because it overstates rather than understates net
-- receipts, and the count of such sales is reported separately so the
-- overstatement is visible.
create or replace function public.eu_vat_bp(p_country text)
returns int
language sql
immutable
as $$
  select case upper(coalesce(p_country, ''))
    when 'AT' then 2000 when 'BE' then 2100 when 'BG' then 2000
    when 'CY' then 1900 when 'CZ' then 2100 when 'DE' then 1900
    when 'DK' then 2500 when 'EE' then 2200 when 'ES' then 2100
    when 'FI' then 2550 when 'FR' then 2000 when 'GR' then 2400
    when 'HR' then 2500 when 'HU' then 2700 when 'IE' then 2300
    when 'IT' then 2200 when 'LT' then 2100 when 'LU' then 1700
    when 'LV' then 2100 when 'MT' then 1800 when 'PL' then 2300
    when 'PT' then 2300 when 'RO' then 2100 when 'SE' then 2500
    when 'SI' then 2200 when 'SK' then 2300
    else 0
  end
$$;

comment on function public.eu_vat_bp(text) is
  'Standard VAT rate in basis points for an EU member state, 0 for anything '
  'else. Electronically supplied services take the standard rate everywhere, '
  'so no reduced-rate argument exists. Stripe reports GR for Greece, not EL.';

revoke all on function public.eu_vat_bp(text) from public, anon;
grant execute on function public.eu_vat_bp(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The dashboard
-- ---------------------------------------------------------------------------
-- p_months_back: 0 is the month in progress, 1 the last closed month, and so
-- on. Clamped to 0..36. A closed month is the only month worth reconciling,
-- so the panel opens on 1 and the RPC says which of the two it returned
-- through the `closed` flag.
create or replace function public.admin_margin(p_months_back int default 1)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err     text := public.admin_guard('read');
  v_back    int;
  v_from    timestamptz;
  v_to      timestamptz;
  v_month   date;
  -- The unit economics assumption this whole function exists to test.
  -- Section 5: 70/30 Trip/Year mix, EUR 7.32 net per purchase, EUR 0.47
  -- typical AI cost, EUR 6.85 contribution.
  v_assumed int := 685;
  -- Per-unit AI prices in cents, section 2.2, overridable through
  -- site_config so a Google price change is an UPDATE.
  v_plan_c  numeric := 1.0;
  v_grnd_c  numeric := 5.0;
  -- Whether the place of supply has moved off Belgium. Same Article 59c test
  -- admin_oss_threshold applies: this year or last year over EUR 10,000.
  v_oss     boolean := false;
  v_sales   bigint;
  v_gross   bigint;
  v_vat     numeric;
  v_fee     numeric;
  v_net     numeric;
  v_plan_u  bigint;
  v_grnd_u  bigint;
  v_ai      numeric;
  v_infra   bigint;
  v_actual  bigint;
  v_modelled bigint;
  v_contrib numeric;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  v_back := least(greatest(coalesce(p_months_back, 1), 0), 36);

  -- The month, in Europe/Amsterdam. date_trunc on the local wall clock gives
  -- the first day; the two timestamptz bounds convert that back to absolute
  -- time, so the comparison against granted_at is exact across the DST
  -- change rather than an hour out twice a year.
  v_month := (date_trunc('month', (now() at time zone 'Europe/Amsterdam'))
              - (v_back || ' months')::interval)::date;
  v_from  := (v_month::timestamp) at time zone 'Europe/Amsterdam';
  v_to    := ((v_month + interval '1 month')::timestamp) at time zone 'Europe/Amsterdam';

  -- Configurable AI prices. Wrapped because site_config may hold anything,
  -- and a bad value must fall back to the documented figure rather than
  -- break the whole dashboard.
  begin
    select coalesce((select (value #>> '{}')::numeric from public.site_config
                      where key = 'ai_cost_plan_cents'), v_plan_c),
           coalesce((select (value #>> '{}')::numeric from public.site_config
                      where key = 'ai_cost_ground_cents'), v_grnd_c)
      into v_plan_c, v_grnd_c;
  exception when others then
    v_plan_c := 1.0; v_grnd_c := 5.0;
  end;

  -- The Article 59c test, on the same ledger admin_oss_threshold reads.
  -- Below the threshold the place of supply is Belgium and every sale takes
  -- 21 percent whoever bought it; above it the rate follows the buyer. Both
  -- worlds are computed the same way below, the only difference being which
  -- country decides the rate.
  select coalesce(bool_or(cents > 1000000), false) into v_oss
    from (
      select date_part('year', g.granted_at)::int as yr,
             coalesce(sum(g.amount_cents), 0)::bigint as cents
        from public.pass_grants g
       where g.buyer_country is not null
         and g.buyer_country <> 'BE'
         and g.buyer_country = any (public.eu_member_states())
       group by 1
    ) y
   where y.yr >= date_part('year', now())::int - 1;

  -- ------------------------------------------------------------------
  -- Lines 1 to 3, off the sales ledger, in one pass.
  -- ------------------------------------------------------------------
  -- VAT is backed OUT of the gross rather than added to it, because the
  -- price is VAT inclusive: on a 699 sale at 2100 bp the tax is
  -- 699 * 2100 / 12100, not 699 * 0.21. Getting that backwards overstates
  -- VAT by 21 percent of itself, which on the Trip Pass is 25 cents a sale,
  -- and it is the easiest mistake in this whole function to make.
  --
  -- The Stripe fee is per sale, because the fixed EUR 0.25 is per sale and
  -- is the entire reason the Year Pass keeps a larger share than the Trip
  -- Pass. Summing gross first and applying the fee once would erase the one
  -- effect section 3.4 says to watch.
  select count(*),
         coalesce(sum(g.amount_cents), 0),
         coalesce(sum(
           g.amount_cents::numeric
           * (case when v_oss then public.eu_vat_bp(g.buyer_country)
                   else 2100 end)::numeric
           / (10000 + (case when v_oss then public.eu_vat_bp(g.buyer_country)
                            else 2100 end))::numeric), 0),
         coalesce(sum(
           -- 1.5 percent on an EEA billing address, 2.9 percent otherwise,
           -- plus the fixed 25 cents, plus Stripe Tax at 0.5 percent.
           g.amount_cents::numeric
             * (case when g.buyer_country = any (public.eu_member_states())
                       or g.buyer_country in ('IS', 'LI', 'NO')
                     then 0.015 else 0.029 end)
           + 25
           + g.amount_cents::numeric * 0.005), 0)
    into v_sales, v_gross, v_vat, v_fee
    from public.pass_grants g
   where g.granted_at >= v_from and g.granted_at < v_to
     and g.amount_cents is not null
     and coalesce(g.currency, 'eur') = 'eur';

  v_net := v_gross::numeric - v_vat - v_fee;

  -- ------------------------------------------------------------------
  -- Line 4, AI units spent in the month.
  -- ------------------------------------------------------------------
  -- ai_usage is keyed by entitlement period, not by day, so a Year Pass
  -- holder is one row covering 365 days and there is no honest way to ask it
  -- "how many units in September". What is asked instead is units on periods
  -- that OPENED in the month, which for a monthly product is close and for a
  -- Year Pass is not. T042 hit the same wall and said so in the same words;
  -- ai_daily_total carries the genuine daily series and is summed beside it,
  -- but it does not separate plan from ground, so it cannot price anything.
  -- Both are returned and the panel names which is which.
  select coalesce(sum(u.n) filter (where u.kind = 'plan'), 0),
         coalesce(sum(u.n) filter (where u.kind = 'ground'), 0)
    into v_plan_u, v_grnd_u
    from public.ai_usage u
   where u.period_start >= v_month
     and u.period_start < (v_month + interval '1 month')::date;

  v_ai := v_plan_u::numeric * v_plan_c + v_grnd_u::numeric * v_grnd_c;

  -- ------------------------------------------------------------------
  -- Line 5, the infrastructure ledger.
  -- ------------------------------------------------------------------
  select coalesce(sum(cents), 0),
         coalesce(count(*) filter (where source = 'actual'), 0),
         coalesce(count(*) filter (where source = 'model'), 0)
    into v_infra, v_actual, v_modelled
    from public.infra_ledger
   where month = v_month and currency = 'eur';

  -- Contribution per purchase, by section 3.1's method: net receipts less AI
  -- cost less the month's infrastructure divided by the month's purchases.
  -- Zero sales means the figure does not exist, and null is the honest way to
  -- say that. A zero here would read as "we made nothing per sale" rather
  -- than "there were no sales", and the panel branches on the null.
  v_contrib := case when v_sales > 0
    then (v_net - v_ai - v_infra::numeric) / v_sales::numeric
    else null end;

  return jsonb_build_object(
    'month',       to_char(v_month, 'YYYY-MM'),
    'monthsBack',  v_back,
    -- A month in progress cannot be reconciled and should not be read as if
    -- it could. The panel says so rather than showing a third of a month's
    -- infrastructure against a third of a month's sales.
    'closed',      v_back > 0,
    'currency',    'eur',
    'assumedContributionCents', v_assumed,

    -- Line 1.
    'sales', jsonb_build_object(
      'count',      v_sales,
      'grossCents', v_gross,
      'byTier', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'tier', tier, 'count', n, 'grossCents', cents)
                 order by cents desc)
          from (
            select g.tier, count(*) as n, coalesce(sum(g.amount_cents), 0) as cents
              from public.pass_grants g
             where g.granted_at >= v_from and g.granted_at < v_to
               and g.amount_cents is not null
               and coalesce(g.currency, 'eur') = 'eur'
             group by g.tier
          ) s
      ), '[]'::jsonb),
      -- Sales this function could not value or place. A row with no amount
      -- is excluded from every figure above, so the totals are a floor and
      -- this is how far below the answer they might be. Same reasoning as
      -- admin_oss_threshold's two integrity counts.
      'excludedNoAmount', (
        select count(*) from public.pass_grants g
         where g.granted_at >= v_from and g.granted_at < v_to
           and g.amount_cents is null),
      'excludedCurrency', (
        select count(*) from public.pass_grants g
         where g.granted_at >= v_from and g.granted_at < v_to
           and g.amount_cents is not null
           and coalesce(g.currency, 'eur') <> 'eur'),
      'unknownCountry', (
        select count(*) from public.pass_grants g
         where g.granted_at >= v_from and g.granted_at < v_to
           and g.amount_cents is not null
           and g.buyer_country is null),
      'nonEu', (
        select count(*) from public.pass_grants g
         where g.granted_at >= v_from and g.granted_at < v_to
           and g.amount_cents is not null
           and g.buyer_country is not null
           and not (g.buyer_country = any (public.eu_member_states())))
    ),

    -- Line 2. Rounded to whole cents only at the end, so twenty sales do not
    -- accumulate twenty rounding errors.
    'vat', jsonb_build_object(
      'cents', round(v_vat)::bigint,
      'basis', case when v_oss then 'buyer_country' else 'belgium_21' end,
      'ossBreached', v_oss,
      'inclusive', true
    ),

    -- Line 3.
    'stripe', jsonb_build_object(
      'cents', round(v_fee)::bigint,
      -- There is no other value this can take today. It is a field rather
      -- than a sentence in the UI so that the day a fee column lands on
      -- pass_grants, the panel starts saying 'charge' without a redeploy.
      'basis', 'modelled',
      'rateEea', '1.5% + EUR 0.25',
      'rateOther', '2.9% + EUR 0.25',
      'tax', '0.5%'
    ),

    'netReceiptsCents', round(v_net)::bigint,

    -- Line 4.
    'ai', jsonb_build_object(
      'planUnits',   v_plan_u,
      'groundUnits', v_grnd_u,
      'planCents',   round(v_plan_u::numeric * v_plan_c)::bigint,
      'groundCents', round(v_grnd_u::numeric * v_grnd_c)::bigint,
      'cents',       round(v_ai)::bigint,
      'planPrice',   v_plan_c,
      'groundPrice', v_grnd_c,
      'basis',       'units observed, price modelled',
      -- The honest daily figure, for comparison. It cannot be priced because
      -- it does not separate plan from ground, and it is here so a large gap
      -- between the two reads as the period-keying artefact it is.
      'dailyTotalUnits', coalesce((
        select sum(n) from public.ai_daily_total
         where day >= v_month and day < (v_month + interval '1 month')::date), 0)
    ),

    -- Line 5, and the reconciliation.
    'infra', jsonb_build_object(
      'cents',        v_infra,
      'actualRows',   v_actual,
      'modelledRows', v_modelled,
      -- A month is reconciled when every line item in it came off an invoice.
      -- One modelled row is enough to make the total a model, so this is an
      -- AND over the ledger and not a majority.
      'reconciled',   (v_actual > 0 and v_modelled = 0),
      'perPurchaseCents', case when v_sales > 0
        then round(v_infra::numeric / v_sales::numeric, 2) else null end,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'item', item, 'cents', cents, 'source', source, 'note', note)
                 order by cents desc, item)
          from public.infra_ledger
         where month = v_month and currency = 'eur'
      ), '[]'::jsonb)
    ),

    -- The comparison the whole function exists for.
    'contribution', jsonb_build_object(
      'perPurchaseCents', case when v_contrib is null
        then null else round(v_contrib, 2) end,
      'totalCents', case when v_sales > 0
        then round(v_net - v_ai - v_infra::numeric)::bigint else null end,
      'assumedCents', v_assumed,
      'deltaCents', case when v_contrib is null
        then null else round(v_contrib - v_assumed, 2) end,
      'deltaPct', case when v_contrib is null
        then null else round(((v_contrib - v_assumed) / v_assumed) * 100, 1) end
    )
  );
end;
$$;

comment on function public.admin_margin(int) is
  'One calendar month of Carta unit economics, Europe/Amsterdam: passes sold '
  'by tier, VAT and Stripe modelled off the documented rates, AI units priced '
  'from site_config, infrastructure from public.infra_ledger, and contribution '
  'per purchase against the EUR 6.85 assumption in '
  'CARTA_UNIT_ECONOMICS.md section 5.';

revoke all on function public.admin_margin(int) from public, anon;
grant execute on function public.admin_margin(int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Down migration
-- ---------------------------------------------------------------------------
-- To rollback, run:
--   drop function if exists public.admin_margin(int);
--   drop function if exists public.admin_set_infra_cost(date, text, int, text, text);
--   drop function if exists public.eu_vat_bp(text);
--   drop table if exists public.infra_ledger;
--
-- Dropping infra_ledger destroys any real invoice figures the owner has
-- entered, which exist nowhere else in this system once T016 starts using it.
-- Export the table before running that last line on a database that has any
-- row with source = 'actual' in it. The three functions are pure reads and a
-- guarded writer, and dropping them is reversible at any time by re-running
-- this file.
