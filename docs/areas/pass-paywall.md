# Pass, paywall, Stripe

Area doc for the MAP.md row "Pass, paywall, Stripe". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

The Pass tiers, the paywall and Stripe checkout.

Screens: Pricing page, Pass modal.

## How it works

usePaywall decides what a tier may do; billing.js calls the checkout Edge Function; stripe-webhook grants the pass keyed on the Checkout session id.

Full rules, formulas and thresholds (read these, do not copy them):

- [The Pass, paywall and Stripe checkout](../HANDBOOK.md#the-pass-paywall-and-stripe-checkout)

## Files

App: continent-app/src/pass/PricingPage.jsx, continent-app/src/components/PassModal.jsx, continent-app/src/hooks/usePaywall.jsx, continent-app/src/lib/billing.js

Pipeline and backend: supabase/functions/checkout/, supabase/functions/stripe-webhook/

MAP.md handbook column: Platform; owner steps in Execution/P2/_OPEN-stripe-launch.md. Latest tasks: T1003, T314.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: `continent-app/tests/passMoments.test.mjs`, `continent-app/tests/passSubscription.test.mjs`, `continent-app/tests/rankTier.test.mjs`.

DOM checks: `continent-app/scripts/verify_paywall.mjs`, `continent-app/scripts/verify_paywall_funnel.mjs`, `continent-app/scripts/verify_plan_tiers.mjs`, `continent-app/scripts/verify_stay_tiers.mjs`.

Python tests matched by file name: `tests/test_nature_tiers.py`.

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

Stripe is in test mode until the owner steps in Execution/P2/_OPEN-stripe-launch.md are done; webhook secrets are Supabase secrets.

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first.

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "stripe|pass|paywall" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
