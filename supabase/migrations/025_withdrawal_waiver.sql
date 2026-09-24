-- Withdrawal waiver: record the consumer's consent against the purchase.
--
-- WHY THIS EXISTS. A pass is digital content that starts the moment payment
-- lands. Under Article 16(m) of the Consumer Rights Directive, and Book VI of
-- the Belgian Code of Economic Law, the 14-day right of withdrawal only ends
-- if the buyer expressly asked for immediate supply AND acknowledged losing
-- the right. If we cannot show that acknowledgement for a given sale, that
-- sale stays refundable for 14 days no matter what the terms say. Consent that
-- was collected but not stored is consent we cannot show, so the storage is
-- the point.
--
-- WHERE THE CONSENT COMES FROM. Stripe Checkout collects it as a required
-- checkbox (consent_collection.terms_of_service in the checkout Edge
-- Function, with our own waiver wording in custom_text). Stripe reports the
-- result on the Checkout Session as consent.terms_of_service = 'accepted'.
-- The stripe-webhook function reads it off the completed session and passes it
-- here.
--
-- WHY IT LIVES ON pass_grants AND NOT ON entitlements. pass_grants is the
-- permanent, per-sale ledger: one row per Checkout Session, never overwritten,
-- which is exactly the shape a consent record needs. entitlements holds the
-- current state of one user and is rewritten by every later purchase, so a
-- consent column there would be destroyed by the next sale and could never
-- answer "what did this buyer agree to when they paid for THIS pass".
--
-- The terms URL is stored alongside the flag because the consent is to a
-- specific text at a specific address. A waiver recorded without saying which
-- terms were shown is much weaker evidence than one that does.
--
-- Apply in the Supabase SQL editor. Do NOT run `supabase db push` against the
-- live project.

-- ---------------------------------------------------------------------------
-- Columns. Nullable on purpose. Every row written before this migration, and
-- any row written while CHECKOUT_TERMS_URL is still unset, genuinely has no
-- consent record, and NULL is the honest way to say so. A default of false
-- would read as "they were asked and refused", which is a different and wrong
-- claim. Do not backfill these.
-- ---------------------------------------------------------------------------
alter table public.pass_grants
  -- Stripe's own value, stored verbatim rather than as a boolean so an
  -- unexpected future value is preserved instead of being flattened to false.
  -- 'accepted' is the only value that ends the withdrawal right.
  add column if not exists consent_tos text
    check (consent_tos is null or consent_tos in ('accepted', 'declined')),
  -- When the consent was recorded on our side. Close enough to the Stripe
  -- timestamp to serve as evidence, and it is the time we can vouch for.
  add column if not exists consent_at timestamptz,
  -- The exact terms address the checkbox linked, as configured in
  -- CHECKOUT_TERMS_URL at the time of the sale.
  add column if not exists consent_terms_url text;

comment on column public.pass_grants.consent_tos is
  'Stripe Checkout Session consent.terms_of_service. ''accepted'' is the '
  'Article 16(m) waiver of the 14-day withdrawal right. NULL means no consent '
  'was collected for this sale, which leaves it refundable for 14 days.';

-- A partial index rather than a plain one: the query this answers is "which
-- sales have no waiver on file", which is the refund-exposure question, and
-- those rows are the minority once the checkbox is live.
create index if not exists pass_grants_no_consent_idx
  on public.pass_grants (granted_at desc)
  where consent_tos is distinct from 'accepted';

-- ---------------------------------------------------------------------------
-- grant_pass, with the consent carried through.
--
-- Unchanged from 007 except for the three new parameters and the three
-- columns they write. The ordering inside the function is load bearing and is
-- deliberately left alone: the replay guard reads pass_grants first, and the
-- pass_grants insert happens BEFORE the entitlements upsert so that a
-- concurrent duplicate delivery loses on the primary key and rolls the whole
-- function back.
--
-- The new parameters are at the END with defaults, so the three-argument and
-- four-argument calls that exist today keep working. That matters because the
-- webhook and this migration are deployed separately: if the migration lands
-- first, the old webhook still grants passes and simply records no consent.
--
-- NOTE ON THE FUNCTION SIGNATURE. Adding defaulted parameters creates a NEW
-- overload rather than replacing the old one, so the old four-argument
-- function is dropped explicitly first. Without the drop, a call with four
-- arguments is ambiguous and Postgres refuses it, which would break the
-- webhook rather than upgrade it.
-- ---------------------------------------------------------------------------
drop function if exists public.grant_pass(uuid, text, text, text);

create or replace function public.grant_pass(
  p_user uuid,
  p_tier text,
  p_session_id text,
  p_customer_id text default null,
  p_consent_tos text default null,
  p_consent_terms_url text default null
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
begin
  select * into cfg from public.plan_tiers where tier = p_tier;
  if cfg.tier is null or cfg.period_days is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_tier');
  end if;

  -- Anything we do not recognise is stored as no consent rather than as a
  -- value the check constraint would reject, because a grant must never fail
  -- over the consent field: the customer has already paid.
  v_tos := case when p_consent_tos in ('accepted', 'declined') then p_consent_tos else null end;

  -- Replay guard, against the permanent ledger rather than against the
  -- entitlement's last_session_id (which a later purchase overwrites).
  if exists (select 1 from public.pass_grants where session_id = p_session_id) then
    return jsonb_build_object('ok', true, 'replay', true);
  end if;

  select * into e from public.entitlements where user_id = p_user;
  v_from := case
    when e.expires_at is not null and e.expires_at > now() then e.expires_at
    else now()
  end;
  v_until := v_from + make_interval(days => cfg.period_days);

  -- Recorded FIRST. If this insert loses a race with a concurrent delivery of
  -- the same session, the primary key rejects it and the whole function rolls
  -- back, which is the outcome we want: exactly one grant survives. The
  -- consent is written in the same statement as the sale it belongs to, so
  -- there is no window in which a grant exists without its consent record.
  insert into public.pass_grants
    (session_id, user_id, tier, expires_at, consent_tos, consent_at, consent_terms_url)
  values
    (p_session_id, p_user, p_tier, v_until,
     v_tos,
     case when v_tos is not null then now() else null end,
     -- Only stored alongside a real answer. A URL on a row with no consent
     -- would read as "these are the terms they accepted" when nothing was
     -- accepted, which is worse than an empty column.
     case when v_tos is not null then nullif(p_consent_terms_url, '') else null end);

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
    'ok', true, 'tier', p_tier, 'expiresAt', v_until, 'consentTos', v_tos
  );
end;
$$;

-- Grants have to be restated: the drop above took the old function's grants
-- with it, and a function nobody can execute fails the webhook silently.
revoke all on function public.grant_pass(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.grant_pass(uuid, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- DOWN
--
-- Reverses in two steps, and the order matters: restore the function first so
-- the webhook keeps working, then drop the columns.
--
--   drop function if exists public.grant_pass(uuid, text, text, text, text, text);
--
--   -- then re-run the grant_pass block from 007_passes.sql verbatim, which
--   -- recreates the four-argument version, followed by:
--   -- revoke all on function public.grant_pass(uuid, text, text, text)
--   --   from public, anon, authenticated;
--   -- grant execute on function public.grant_pass(uuid, text, text, text)
--   --   to service_role;
--
--   drop index if exists public.pass_grants_no_consent_idx;
--   alter table public.pass_grants
--     drop column if exists consent_tos,
--     drop column if exists consent_at,
--     drop column if exists consent_terms_url;
--
-- Dropping the columns destroys consent evidence for every sale made while
-- they existed, and that evidence is what makes those sales non-refundable.
-- Export pass_grants before running the down section if any real purchase has
-- happened.
-- ---------------------------------------------------------------------------
