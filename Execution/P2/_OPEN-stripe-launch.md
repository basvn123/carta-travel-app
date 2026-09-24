# Open items after T030 to T034: what the owner must do before a first sale

Written 2026-09-24 at the close of the Stripe and paywall batch. This gathers the
"What is still open" sections of the five reports into one ordered list, because
each report only sees its own slice and the order across them matters. The
reports themselves are the record and are not changed by this file; where this
file and a report disagree, the report wins and this file is stale.

The single fact that shapes everything: Stripe has never been configured on the
live project. There are no Stripe secrets on ntssxktaduxzpsmejwyv, the checkout
and stripe-webhook functions are not deployed, and pass_grants is empty. Every
step below that says "in test mode" was blocked on that, and nothing was faked.

## 1. Stripe Dashboard, in this order

Create the two Prices under Product catalogue, or verify them if they exist:
Trip Pass 699 EUR and Year Pass 1499 EUR, currency eur, type one_time with no
billing period, product copy saying 30 and 365 days. Note the price ids and
whether they are test or live mode objects, since the two modes have separate
ids and keys. Evidence for T030: a screenshot of each Price detail page.

Confirm tax_behavior on both Prices is inclusive. CARTA_UNIT_ECONOMICS.md
section 3.1 assumes inclusive. Exclusive would mean a Belgian buyer pays 8.46
and the app shows a price nobody pays. (T033)

Settings, Business, Public details: fill the Terms of service URL with
https://carta-europetravel.com/?legal=terms. This must happen before the
CHECKOUT_TERMS_URL secret is set, or every checkout returns 502. (T032)

Settings, Tax: set the origin address to the Belgian establishment. Tax,
Registrations: add Belgium only; other member states come after the threshold.
Tax: switch on threshold monitoring and check the notification email goes to an
address somebody reads. (T033)

## 2. Supabase secrets and migrations

Set the secrets, test mode first:

```
supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_PRICE_TRIP=price_... STRIPE_PRICE_YEAR=price_... CHECKOUT_TERMS_URL=https://carta-europetravel.com/?legal=terms --project-ref ntssxktaduxzpsmejwyv
```

CHECKOUT_TERMS_URL is read by both checkout and stripe-webhook. (T032)

Paste the migrations by hand into the SQL editor, in this order, because each
later one depends on the earlier: 022_paywall_events.sql (never applied, T034
confirmed), 025_withdrawal_waiver.sql, 026_oss_threshold.sql,
027_paywall_funnel_kinds.sql. Apply 026 before the webhook redeploy: the
webhook calls the nine-argument grant_pass. Never run db push.

Deploy both functions. The webhook needs --no-verify-jwt or Stripe's POST is
rejected before the signature check:

```
supabase functions deploy checkout --project-ref ntssxktaduxzpsmejwyv
supabase functions deploy stripe-webhook --no-verify-jwt --project-ref ntssxktaduxzpsmejwyv
```

Then create the webhook endpoint in the Dashboard (or run stripe listen) and
set STRIPE_WEBHOOK_SECRET from the whsec_ it gives.

## 3. The test purchases

Follow supabase/functions/checkout/test_purchase_e2e.md, ten steps with exact
commands and expected values. Use two fresh accounts, never the owner account,
which holds a manual year pass to 2126 so every expiry assertion lands in 2126.
The checks that still need a real purchase: the card payment itself, the Price
amount and currency, the three user id fields on a real session, the waiver
checkbox appearing on the Stripe page with Carta's wording, and amount_tax on a
German and a Belgian address (both should carry the Belgian rate below the
threshold: inclusive gives amount_total 699 and amount_tax 121 on both).

stripe trigger checkout.session.completed does not test the replay path; a real
replay needs a Dashboard endpoint plus stripe events resend. (T031)

After the purchase, the SELECTs to run are in each report. In short:
pass_grants should show consent_tos accepted with a timestamp and the terms
URL, buyer_country and amount_cents filled, and admin_oss_threshold() should
count only the non-Belgian sale.

## 4. Merge order

The branches stack, so merge in this order in both repositories where they
exist: p2-stripe-price-audit (root only), p2-stripe-purchase-e2e (root only),
p2-withdrawal-waiver, p2-stripe-tax-and-oss, p2-paywall-funnel-instrumentation.
T033 is based on T032's branch and T034 on T033's, because the webhook and
grant_pass changes build on each other. continent-app holds around 37
uncommitted files from another session that none of these tasks touched; sort
that out before merging the app branches.

## 5. Decisions that need their own task

A Year Pass holder who buys a Trip Pass is downgraded: grant_pass sets the tier
unconditionally, so the buyer pays 6.99 and loses 80 percent of their
allowance. Three candidate fixes are in T031. Needs a migration.

The expiring gate has a GATES entry, copy and locale keys but no call site, so
it can never fire. Wire it or remove it; verify_paywall_funnel.mjs fails on it
until then. (T034)

Migration 018 line 93 uses a POSIX regex bound of {5,600}; Postgres caps
repetition at 255, so the file fails on a local stack and had to be held aside
by T031 through T034. Change to {5,255} or drop the bound. (T031)

The 007 header claims the pricing UI reads plan_tiers. It does not; PassModal
renders the hardcoded TIERS from pricing.js, and price_cents is read by no code
path. Either fetch the table in the modal or drop the claim and add a drift
check to audit-content.mjs. (T030)

Re-running the 007 insert as written resets the free tier to 3 plans and undoes
migration 021. Fix the free row first if it is ever re-run. (T030)

entitlements.expires_at can be extended without limit by repeated purchases;
admin_set_tier caps at 36600 days and grant_pass caps nothing. (T031)

The Article 16(m) classification in the terms (digital content, not digital
service) has not been reviewed by anyone qualified. The refund-exposure index
pass_grants_no_consent_idx exists but nothing shows its count. (T032)

Nothing checks the OSS figure on a schedule; Stripe's own email is the cheap
route, a weekly job at 70 percent is the alternative. T015, the accountant's
VAT answer, does not exist as a file, and the Belgian registration in the
Dashboard has to match whatever that answer is. (T033)

Conversion attribution in the funnel is a one-hour nearest-checkout estimate,
not a foreign key, and hard-navigation dismissals were reasoned about rather
than observed. (T034)
