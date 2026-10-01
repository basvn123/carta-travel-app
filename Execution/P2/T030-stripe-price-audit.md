# T030: Audit Stripe Price objects against plan_tiers

## Date

2026-09-24

## What changed

Nothing changed. This is an audit, and the audit found the two sources it could reach already agree with each other and with the migration that defines them. The live `public.plan_tiers` table on project ntssxktaduxzpsmejwyv carries trip at 699 cents with 40 grounded searches and year at 1499 cents with 120 grounded searches, currency eur. That is exactly what the on-conflict insert in `007_passes.sql` writes, so the live table does not predate the 2026-07-28 cut from 200 grounded to 120 and the re-run the migration header offers as a safety net was not needed and was not run. No write of any kind was issued against the live database.

What the audit could not do is the part that actually matters most, and the reason is worth stating first rather than at the end. The Stripe Price object is the authoritative price: it is the only one of the three sources that decides what a card is charged. It is unreachable from this machine. The live Supabase project has no Stripe secrets at all, not `STRIPE_SECRET_KEY`, not `STRIPE_PRICE_TRIP`, not `STRIPE_PRICE_YEAR`, not `STRIPE_WEBHOOK_SECRET`. The `checkout` and `stripe-webhook` functions are not deployed; only `plan-day`, `suggest-city` and `parse-booking` are. There is no Stripe CLI installed, no Stripe key in any env file, and no price id recorded anywhere in either repository or in the planning documents. So the audit verified everything that does not depend on reading Stripe, and the Stripe half is written up below as instructions for the user with the exact fields to check.

The honest reading of that finding is that there is nothing to drift yet. Stripe has never been configured on this project. Checkout cannot run: the function would return 503 `no_stripe` on the missing secret key if it were deployed, and it is not deployed, so the client's `startCheckout` would fail at the invoke. The live `pass_grants` table is empty and the only row in `entitlements` is the owner's manual year grant to 2126, which came from the owner-entitlement task and not from a payment. Nobody has ever been charged anything. T030 therefore establishes the baseline that T031 will test against rather than correcting a live discrepancy.

## How the three sources relate, and why it is built this way

Three places hold a price, and the split is deliberate rather than accidental duplication.

The Stripe Price object is authoritative. `checkout/index.ts` never accepts an amount from the browser: the client sends a tier id and nothing else, the function looks up a price id through `stripePriceFor(tier, env)` in `_shared/passes.mjs`, and passes that id to `stripe.checkout.sessions.create` as `line_items: [{ price, quantity: 1 }]`. A tampered request can ask to buy the wrong tier, because `tier` comes from the request body and is only checked against `PAID_TIERS`, but it can never set its own amount. That is the right shape, and it is why the Stripe object is the one that has to be correct.

`public.plan_tiers` enforces quota, not price. Its `price_cents` column is not read by any code path that charges anyone. `grant_pass` reads `period_days` to work out an expiry, and `ai_consume` and `ai_status` read `ai_plans` and `grounded` to decide whether a generation is allowed. `price_cents` and `currency` sit in the table as documentation of intent, which is a reasonable thing for them to be, but it means a drift between `plan_tiers.price_cents` and the Stripe Price object has no runtime effect at all. The column that would really hurt if it drifted is `grounded`, because that is the cost ceiling: at 200 rather than 120 on the Year Pass, a fully exhausted pass leaves roughly 0.54 EUR of margin against roughly 2.84 EUR at 120. The live value is 120.

`continent-app/src/lib/pricing.js` is display only, and its own header says so. It is what `PassModal.jsx` and `AccountPanel.jsx` render. One thing in this audit does not match its documentation, and it is the most useful finding here. The header of `007_passes.sql` says the tier catalogue is a table rather than constants so "prices and fair-use caps can be tuned with an UPDATE instead of a migration plus redeploy", and that "the pricing UI reads it so a price change lands without an app redeploy". The pricing UI does not read it. Nothing in `continent-app/src/` queries `plan_tiers`; every price and cap shown to a traveller comes from the hardcoded `TIERS` object in `pricing.js`, and `formatPrice` is always called with `TIERS.trip.priceCents` or `TIERS.year.priceCents`. An UPDATE to `plan_tiers.price_cents` would change what quota the server enforces on nothing, and would change nothing a traveller sees, until the app is rebuilt and redeployed. The migration header's promise is not kept. Neither file is in this task's scope to change, so it is recorded under what is still open.

The one real inconsistency between the migration file and the live table is the free tier, and it is correct rather than drift. `007_passes.sql` inserts `free` with `ai_plans` 3; the live table says 2. Migration `021_free_tier_once.sql` line 134 is `update public.plan_tiers set ai_plans = 2 where tier = 'free'`, which is the deliberate later change to a one-off two-plan trial that never refills. `pricing.js` already says 2. This matters for the re-run question the prompt asked about: re-running the `007` on-conflict insert as written would silently push the free tier back to 3 and undo migration 021. It was not needed here, but if a future task ever does need to re-run it, that insert must have the free row's `ai_plans` corrected to 2 first, or the free row left out of the re-run entirely. That is a trap worth knowing about.

## Code path audit

Every check below was made by reading the code, since the deployed functions do not exist to exercise.

Mode is `payment`, not `subscription`. `checkout/index.ts` passes `mode: 'payment'` literally, and the header explains the reasoning: a Year Pass is 365 days bought once, nobody is auto-charged and nobody has to remember to cancel. This is the code half of the one-off requirement. The other half is the Price object's own `type`, which must be `one_time`: a recurring Price passed to a `payment` mode session is rejected by Stripe, so a mismatch here fails loudly at checkout rather than quietly overcharging, which is the better failure. It still has to be checked in the Dashboard because it is the field that decides whether checkout works at all.

Tier ids agree across all four places. `passes.mjs` exports `TIERS` as `['free', 'trip', 'year']` and `PAID_TIERS` as `['trip', 'year']`; `pricing.js` exports `TIER_ORDER` and `PAID_TIERS` with the same strings; the `plan_tiers` primary key has a check constraint on the same three; the live table holds exactly those three rows. `checkout/index.ts` validates the incoming tier against `PAID_TIERS` before doing anything, and `stripe-webhook/index.ts` validates the tier out of session metadata against the same list before calling `grant_pass`, so a free tier cannot be bought and an unknown tier cannot be granted.

Currency is never set in code. The session inherits the currency of the Price object, and `plan_tiers.currency` is eur on both paid rows. `formatPrice` in `pricing.js` defaults to EUR. So eur has to be true of the Stripe objects for the display to be honest, and nothing in the code would notice if it were not.

The price id is resolved once, in one place. `stripePriceFor` returns `map[tier] || ''` and the caller treats the empty string as 503 `no_price`. That is a clean fail: an unset or misspelled secret refuses the checkout instead of falling through to some default. There is no fallback price anywhere, which is correct.

Two things in the checkout path are configuration rather than code and are already documented in T013: `automatic_tax` is enabled with `billing_address_collection: 'required'`, and the withdrawal waiver block is gated on `CHECKOUT_TERMS_URL`, which is also not set on the live project. T033 owns the tax side. The waiver secret matters to T031 because a test purchase run before it is set will not show the consent checkbox.

The webhook is the only path that grants a pass and it is built to survive Stripe's retries: `grant_pass` is idempotent on the Checkout session id against the permanent `pass_grants` table rather than against `entitlements.last_session_id`, it refuses to grant on a session whose `payment_status` is not `paid`, and it returns 500 only on a grant failure so Stripe retries the one case where a customer has paid and holds nothing. The deploy note in its header is load bearing for T031: it must be deployed with `--no-verify-jwt`, because Stripe does not send a Supabase JWT.

## Files touched

**Created:**
- Execution/P2/T030-stripe-price-audit.md

Nothing else. No code, no migration, no live write. `continent-app/src/lib/pricing.js` was read only; the app repo was not touched, and the uncommitted work another session left in it was left alone.

## Commands run

```
git checkout -b p2-stripe-price-audit

supabase db query "select tier, ai_plans, grounded, period_days, price_cents, currency, rank from public.plan_tiers order by rank" --linked
supabase db query "select (select count(*) from public.entitlements) as entitlements, (select count(*) from public.pass_grants) as grants, (select count(*) from public.entitlements where source='stripe') as stripe_sourced" --linked
supabase db query "select tier, source, expires_at, last_session_id from public.entitlements" --linked

supabase secrets list --project-ref ntssxktaduxzpsmejwyv
supabase functions list --project-ref ntssxktaduxzpsmejwyv
```

Note for the next session: `supabase secrets list` does not accept `--linked` on CLI v2.109.1 and needs `--project-ref` spelled out, unlike `db query`. All three queries are reads. No write was run and `supabase db push` was not run.

Repository searches, for the record of where a Stripe price id was looked for and not found: a grep for `STRIPE_`, `sk_test`, `sk_live`, `pk_test`, `pk_live` and `price_1` across `supabase/`, which returns only the six references in `checkout/index.ts`, `stripe-webhook/index.ts` and `_shared/passes.mjs`, all of them secret names rather than values; a case-insensitive grep for stripe across `Execution/` and `additional docs/`, which returns the DPA register in T018, the migration note in T024, the waiver work in T013, and the pricing rationale in the two unit economics documents, none of them carrying an id or a key; and the key names in the root `.env` and `continent-app/.env`, which hold Travelpayouts, Gemini and transit keys and, on the app side, only VITE variables.

## Config and secrets set

None set. This task has no authority to create Stripe objects or set secrets, and doing so would be the T031 setup step rather than an audit.

What is missing on the live project, all four needed before checkout can run at all:

| Key | Where | State |
|---|---|---|
| STRIPE_SECRET_KEY | Supabase Edge Function secret | not set |
| STRIPE_PRICE_TRIP | Supabase Edge Function secret | not set |
| STRIPE_PRICE_YEAR | Supabase Edge Function secret | not set |
| STRIPE_WEBHOOK_SECRET | Supabase Edge Function secret | not set |
| CHECKOUT_TERMS_URL | Supabase Edge Function secret | not set, carried from T013 |
| CHECKOUT_SUCCESS_URL, CHECKOUT_CANCEL_URL | Supabase Edge Function secret | not set, the function falls back to request origin plus ?pass=ok or ?pass=cancel |

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| plan_tiers trip price_cents, live | 699 | 699 | none |
| plan_tiers trip grounded, live | 40 | 40 | none |
| plan_tiers trip ai_plans / period_days, live | 60 / 30 | 60 / 30 | none |
| plan_tiers year price_cents, live | 1499 | 1499 | none |
| plan_tiers year grounded, live | 120 | 120 | none |
| plan_tiers year ai_plans / period_days, live | 300 / 365 | 300 / 365 | none |
| plan_tiers currency, both paid rows | eur | eur | none |
| pricing.js TIERS.trip priceCents / grounded | 699 / 40 | 699 / 40 | none |
| pricing.js TIERS.year priceCents / grounded | 1499 / 120 | 1499 / 120 | none |
| checkout mode constant | payment | payment | none |
| passes.mjs PAID_TIERS | trip, year | trip, year | none |
| Stripe Price unit_amount, trip and year | unknown, unreadable | unknown, unreadable | none |
| Stripe secrets set on the live project | 0 of 4 | 0 of 4 | none |
| Edge Functions deployed of the two billing ones | 0 of 2 | 0 of 2 | none |
| Rows in pass_grants | 0 | 0 | none |

Before and after are identical throughout, which is the expected result of an audit that found no drift and changed nothing.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `supabase secrets list --linked` returned a help dump and UnrecognizedOption | On CLI v2.109.1 that subcommand takes `--project-ref` and not `--linked`, unlike `db query` | Re-ran with `--project-ref ntssxktaduxzpsmejwyv` |
| Live free tier ai_plans is 2 where `007_passes.sql` says 3, which reads as drift | Not drift: migration `021_free_tier_once.sql` line 134 deliberately updates it to 2 | Confirmed against 021 and against `pricing.js`, which also says 2. Recorded as a trap for any future re-run of the 007 insert |

## What is still open

The Stripe Price objects have not been verified and cannot be from this machine. This is the whole authoritative half of the audit and only the user can lift it. In the Stripe Dashboard, under Product catalogue, open each of the two Price objects and confirm four fields on each: `unit_amount` is 699 on the Trip Pass and 1499 on the Year Pass; `currency` is eur on both; `type` is one_time and not recurring on both, with no billing period shown; and the product name and description say what the buyer gets, Trip Pass at 30 days and Year Pass at 365, matching `period_days` in `plan_tiers`. Also confirm both Prices are active and note whether they are test mode or live mode objects, because the two modes have separate ids and separate secret keys and mixing them is the ordinary way this flow fails. The evidence to attach to T031 is a screenshot of each Price detail page showing amount, currency and the one-time type, plus the two price ids themselves, and a note of which mode they belong to. If the Prices do not exist yet, creating them is the first step of T031 and the same four fields are the specification to create them from.

Then the secrets. `supabase secrets set STRIPE_SECRET_KEY=... STRIPE_PRICE_TRIP=price_... STRIPE_PRICE_YEAR=price_... --project-ref ntssxktaduxzpsmejwyv`, with the test mode key and the test mode price ids for T031. `STRIPE_WEBHOOK_SECRET` comes later, from the endpoint created in the Dashboard or from `stripe listen`, so it is set after the webhook is deployed. Then deploy both functions, and the webhook must go with `--no-verify-jwt` or Stripe's unsigned-by-Supabase POST is rejected before the signature check ever runs.

The migration header's claim that the pricing UI reads `plan_tiers` is false and should either be made true or corrected. Nothing in `continent-app/src/` queries the table; `PassModal.jsx` and `AccountPanel.jsx` render the hardcoded `TIERS` object from `pricing.js`. So the stated benefit of holding prices and caps in a table, that they can be retuned with an UPDATE and no redeploy, does not exist today. Two ways to close it, and the choice is a product call rather than an obvious fix. Either make `PassModal` fetch `plan_tiers` on open, with `pricing.js` as the fallback for the first paint and for an offline load, which delivers the promise and costs a round trip on a modal that is shown at a decision moment. Or drop the claim from the `007` header and from the `pricing.js` header, accept that a price change is a redeploy, and add a check to `scripts/audit-content.mjs` that fails when `pricing.js` and the live table disagree, which is cheaper and catches the drift this task was written to look for. The second is the better fit for a product with two prices that change rarely, but it is not this task's call. Either way it touches `pricing.js` in the app repo and the migration file, so it needs its own task.

Re-running the `007_passes.sql` insert as written would undo migration 021 by setting the free tier back to 3 plans. Whoever writes that task must fix the free row to 2 in the insert first, or exclude it.

`CHECKOUT_TERMS_URL` is still unset, carried forward from T013. A test purchase made before it is set will not show the withdrawal waiver checkbox, so T031 should either set it first or record plainly that the waiver was not part of what was tested.

`price_cents` in `plan_tiers` is decorative: no code path reads it. That is fine as documentation of intent, but it means this column can never be the thing that catches a Stripe drift, and nobody should later assume it is enforcing anything.

## Rollback procedure

There is nothing to roll back. The only artefact is this report, and the only database access was three SELECTs. To remove the report, `git checkout main` and delete the branch with `git branch -D p2-stripe-price-audit`, or revert the single commit on it.
