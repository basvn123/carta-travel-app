# Quotas, Pass and paywall logic (QUOTA)

What a traveller may use for free, what a Trip Pass or the yearly plan adds, how the AI allowance is counted, refused and refunded on the server, when the app asks for a Pass, and how a purchase becomes an entitlement. Main code: `supabase/migrations/007_passes.sql`, `021_free_tier_once.sql`, `044_payments_quota.sql`, `053_pass_subscriptions.sql`, `supabase/functions/_shared/passes.mjs`, `supabase/functions/checkout/`, `supabase/functions/stripe-webhook/`, `supabase/functions/billing/`, `continent-app/src/hooks/usePaywall.jsx`, `continent-app/src/lib/pricing.js`, `continent-app/src/lib/passMoments.js`, `continent-app/src/lib/billing.js`, `continent-app/src/components/PassModal.jsx`, `continent-app/src/pass/PricingPage.jsx`. HANDBOOK pointer: "### The Pass, paywall and Stripe checkout" (docs/HANDBOOK.md), with "### AI day plan (plan-day)" step 4 and "### My trips (saving and storage)". Last verified against the code: 2026-11-06 (T1132).

IDs are catalogue IDs only for now: the `// LOGIC: <ID>` / `# LOGIC: <ID>` tags in code and `scripts/docs/logic_check.py` are the second half of ROADMAP B3 and not yet done. Line numbers are as of 2026-11-06 and will drift; the constant name is the stable handle.

How plan-day and suggest-city spend units (quota before cache, free refines, grounded on top) is in `plan-day.md` (PLANDAY-006, -007, -015, -022, -029). Ask Carta's own caps are in `ask.md` (ASK-001, -026, -028). Tests named `continent-app/scripts/ai/test_*.mjs` are `check('...')` harnesses run by `npm run test:quota` against a local Postgres, not by `npm test`; `scripts/ai/test_passes.mjs` applies migrations up to 044 only.

## Rules

### QUOTA-001 Tiers and what each allows
- Decides: how many AI plans and live searches a traveller has, for how long, at what price.
- Rule: free: 2 AI plans, 0 grounded, never refills; Trip Pass: EUR 6.99 one-off, 60 plans, 40 grounded, 60 days; yearly plan: EUR 14.99 renewing, 300 plans, 120 grounded, 365 days. `plan_tiers` is what the server enforces; `pricing.js` `TIERS` is the display copy and must match it.
- Constant: `plan_tiers` insert in `supabase/migrations/007_passes.sql:74` to `:76`; free pinned to 2 in `021_free_tier_once.sql:134` and `044_payments_quota.sql:139`; trip 60 days in `053_pass_subscriptions.sql:60`
- Constant: `TIERS` in `continent-app/src/lib/pricing.js:83`
- Test: `continent-app/scripts/verify_plan_tiers.mjs` (static check: pricing.js against the migrations, free row must be 2)
- Test: `continent-app/scripts/ai/test_global_cap.mjs` :: "free tier allowance is 2 after 021"
- Test: `continent-app/tests/passSubscription.test.mjs` :: "the client mirror: 60-day Trip Pass, a renewing yearly plan"

### QUOTA-002 The free allowance is once per account
- Decides: that the 2 free plans never come back, also after a Pass ends.
- Rule: with no live pass (none, free, or expired) the tier is free and its period starts at one fixed epoch, so free use is counted for the life of the account; `ai_status` gives `resetsAt` null for free and the expiry for a pass.
- Constant: `ai_resolve_tier` in `supabase/migrations/021_free_tier_once.sql:46` (epoch at `:65`); `ai_status` in `021_free_tier_once.sql:79`
- Test: `continent-app/scripts/ai/test_ai_quota.mjs` :: "cap reject: a third free plan returns status user_cap"

### QUOTA-003 Spending one unit
- Decides: whether an AI request is granted or refused for the traveller's own allowance.
- Rule: kind `plan` or `ground` only; a cap of 0 is `user_cap` at once; otherwise the period counter rises by 1 only while under the cap (atomic), else `user_cap` with cap and used; a grant answers tier, cap, used and left, and writes a day row.
- Constant: `ai_consume` in `supabase/migrations/044_payments_quota.sql:172` (cap 0 at `:195`, `where u.n < v_cap` at `:204`); `consume` in `supabase/functions/_shared/passes.mjs:79`
- Test: `continent-app/scripts/ai/test_ai_quota.mjs` :: "grant: a grant reports used 1 and left 1"
- Test: `continent-app/scripts/ai/test_ai_quota.mjs` :: "cap reject: ai_usage never exceeds the cap"
- Test: `continent-app/scripts/ai/test_global_cap.mjs` :: "user cap: a zero allowance surface is refused as user_cap"

### QUOTA-004 Plans and live searches are counted apart
- Decides: that a grounded search does not eat a plan from the plan counter, and the reverse.
- Rule: `plan` and `ground` have their own counters and caps in one period.
- Constant: `v_cap := case when p_kind = 'ground' then cfg.grounded else cfg.ai_plans end` in `supabase/migrations/044_payments_quota.sql:193`
- Test: `continent-app/scripts/ai/test_ai_quota.mjs` :: "separation: the plan spend left the ground counter at zero"

### QUOTA-005 Shared daily ceiling
- Decides: when every traveller is refused for the rest of the day, whatever they have left.
- Rule: one counter per calendar day across both kinds and across plan-day, suggest-city and parse-booking; a grant past the ceiling is `global_cap` and the traveller's unit is rolled back. A cache hit also counts.
- Constant: `AI_GLOBAL_DAILY_CAP` default 200 in `supabase/functions/plan-day/index.ts:233`, `supabase/functions/suggest-city/index.ts:152`, `supabase/functions/parse-booking/index.ts:161`; `ai_daily_total` check in `044_payments_quota.sql:218` to `:225`
- Test: `continent-app/scripts/ai/test_global_cap.mjs` :: "global cap: the call that breaches the cap returns status global_cap"
- Test: `continent-app/scripts/ai/test_global_cap.mjs` :: "global cap: the breaching user keeps their unit, ai_usage rolled back"

### QUOTA-006 Refunds go back to the day they were spent
- Decides: that a failed AI call gives the unit back, to the right day.
- Rule: the unit comes off the traveller's latest day row that holds one and off that day's shared counter; never below zero; a spend with no day row (before 044) returns the period unit and leaves the shared counter alone; an unknown kind does nothing.
- Constant: `ai_refund` in `supabase/migrations/044_payments_quota.sql:248`; `refund` in `supabase/functions/_shared/passes.mjs:93`
- Test: `continent-app/scripts/ai/test_ai_quota.mjs` :: "refund cross-day: the unit comes off the day it was spent on"
- Test: `continent-app/scripts/ai/test_ai_quota.mjs` :: "refund: a double refund never drives ai_usage below zero"
- Test: `continent-app/scripts/ai/test_ai_quota.mjs` :: "refund: the refunded allowance is spendable again"

### QUOTA-007 A quota read that fails refuses
- Decides: that an unreadable allowance never hands out a free generation.
- Rule: an RPC error is status `quota_check`, tier free, never ok; the functions answer 503 `quota_check`.
- Constant: `consume` in `supabase/functions/_shared/passes.mjs:79` to `:85`
- Test: `continent-app/scripts/ai/test_global_cap.mjs` :: "consume: an RPC error returns status quota_check"
- Test: `continent-app/scripts/ai/test_global_cap.mjs` :: "consume: an RPC error is not ok"

### QUOTA-008 Refusals are counted
- Decides: what the owner can see of travellers turned away.
- Rule: only `user_cap` and `global_cap` are logged to `ai_cap_events` with kind and tier, no user id; a free traveller with 0 grounded units is not logged as a refusal.
- Constant: `logCapRejection` in `supabase/functions/_shared/passes.mjs:123`
- Test: no test

### QUOTA-009 Magic import spends one plan
- Decides: what reading a booking costs.
- Rule: one `plan` unit after the link is fetched (an unreachable link costs nothing); a cached result (24 hours) still costs the unit; nothing found refunds it.
- Constant: `supabase/functions/parse-booking/index.ts:256`, `:282`, `:293`, `:371`
- Test: no test

### QUOTA-010 Ask is outside the Pass
- Decides: that Ask Carta never spends or shows the AI allowance.
- Rule: no unit is spent; its only limits are its own daily Neurons cap and rates (ASK-026, ASK-028).
- Constant: none (no `consume` or paywall call on Ask paths; see ASK-001)
- Test: no test

### QUOTA-011 Hard gates
- Decides: which buttons ask for a Pass.
- Rule: hard gates `export` (every PDF), `exportCal`, `exportMap`, `import`, `save`, `plans`, `ground` and `browse` always open the Pass sheet for a traveller who has not paid. A payer passes every gate except `plans`, `ground` and `plansLow`, which open for anyone once the allowance is known. An unknown reason opens as `browse`. Planning together and sharing are not gated.
- Constant: `GATES` in `continent-app/src/hooks/usePaywall.jsx:50`; `QUOTA_REASONS` in `usePaywall.jsx:48`; `require` in `usePaywall.jsx:220`
- Test: no test

### QUOTA-012 Paid fails open
- Decides: that a slow status read never locks a paying traveller out.
- Rule: a guest is not paid; signed in, paid while the entitlement is loading or unknown, else paid when the tier is not free; outside the provider everything is allowed. The metered AI surfaces stay enforced on the server.
- Constant: `paid` in `continent-app/src/hooks/usePaywall.jsx:193`; `FALLBACK` in `usePaywall.jsx` (end of file)
- Test: no test

### QUOTA-013 Soft offers, once a session, snoozed a month
- Decides: how often an unasked offer may appear.
- Rule: soft reasons are `plansLow` and `expiring`. `nudge` shows one only to a non-payer, once a session, and not within 30 days of dismissing the same reason; dismissing a soft sheet writes the snooze, dismissing a hard one never does.
- Constant: `SNOOZE_DAYS` in `continent-app/src/hooks/usePaywall.jsx:73` = 30; `SESSION_KEY` in `usePaywall.jsx:76`; `nudge` in `usePaywall.jsx:232`
- Test: no test

### QUOTA-014 When the allowance offers appear
- Decides: where a traveller is told plans or searches are running out.
- Rule: the credit chip reads "out" at 0 plans left and opens `plansLow`; the Carta bot opens `plans` when the traveller is out. No screen offers `ground` since the AI plan sheet went (ROADMAP H14).
- Constant: `continent-app/src/components/CreditChip.jsx:35` to `:37` (the plan sheet's two links lived in `AiDayPlanModal.jsx`, unmounted since the Carta bot and deleted with T1163-b, 2026-11-12)
- Test: no test

### QUOTA-015 Pass running out
- Decides: when the expiry banner shows.
- Rule: a pass with 7 days or fewer left shows the banner until dismissed for that expiry date; its button opens the sheet as `expiring`, also for a payer. Days left round up.
- Constant: `EXPIRY_DAYS` in `continent-app/src/components/AnnouncementBar.jsx:78` = 7; `daysLeft` in `continent-app/src/lib/pricing.js:188`
- Test: no test

### QUOTA-016 How many trips are kept free
- Decides: when "Save trip" asks for a Pass.
- Rule: a guest keeps one trip on the device, a second different trip opens `save`; a signed-in free traveller keeps one account trip, a second new trip opens `save`; saving over an existing trip is never gated.
- Constant: `deviceSaveDecision` in `continent-app/src/planner/deviceTripStore.js:71`; `continent-app/src/planner/TripPlannerTab.jsx:876`
- Test: no test

### QUOTA-017 Which plan the sheet opens on
- Decides: the plan pre-selected in the Pass sheet.
- Rule: a plan the guest chose before signing in wins; a paid moment or `browse` opens on the Trip Pass; a soft offer opens on the yearly plan, except `expiring` for a Trip Pass holder, which opens on the Trip Pass. The "recommended" mark shows only on soft offers.
- Constant: `initialPick` in `continent-app/src/lib/passMoments.js:31`; `SOFT` in `passMoments.js:22`
- Test: `continent-app/tests/passMoments.test.mjs` :: "a paid moment opens on the Trip Pass (T488-g)"
- Test: `continent-app/tests/passMoments.test.mjs` :: "an offer nobody asked for keeps the yearly plan, a Trip Pass running out is offered days"

### QUOTA-018 Buying before signing in
- Decides: that a guest's choice survives sign-in.
- Rule: the chosen plan and reason are kept in `sessionStorage` `carta.pendingPass`; after sign-in the sheet reopens once on that plan (anything but trip reads as year) and the key is removed.
- Constant: `PENDING_PASS_KEY` in `continent-app/src/lib/passMoments.js`; `continent-app/src/hooks/usePaywall.jsx:137` to `:142`
- Test: `continent-app/tests/passMoments.test.mjs` :: "a plan chosen before signing in wins"

### QUOTA-019 Prices as shown
- Decides: the small figures beside the price.
- Rule: the yearly plan shows a month as round(1499 / 12) cents; the yearly plan equals floor(year / trip) + 1 Trip Passes; prices in the active locale with cents.
- Constant: `monthlyCents` in `continent-app/src/lib/pricing.js:171`; `yearPassTripsEquivalent` in `pricing.js:154`
- Test: `continent-app/tests/passSubscription.test.mjs` :: "the client mirror: 60-day Trip Pass, a renewing yearly plan"

### QUOTA-020 Checkout session
- Decides: what Stripe charges and how the session behaves.
- Rule: the browser sends only a tier and the gate reason; the amount comes from the Stripe Price in `STRIPE_PRICE_TRIP` or `STRIPE_PRICE_YEAR`; Trip Pass is mode `payment`, yearly plan `subscription`; automatic tax with a required billing address; the session expires after 30 minutes; a past customer id is reused; a reason that is not 1 to 32 letters is sent blank.
- Constant: `checkoutModeFor` and `stripePriceFor` in `supabase/functions/_shared/passes.mjs:170` and `:64`; `supabase/functions/checkout/index.ts:103` to `:169`
- Test: `continent-app/tests/passSubscription.test.mjs` :: "the yearly plan is a subscription, the Trip Pass a payment"

### QUOTA-021 Withdrawal waiver
- Decides: whether the buyer must tick the immediate-start checkbox.
- Rule: only when `CHECKOUT_TERMS_URL` is set, Stripe requires the terms checkbox with Carta's text: start now and lose the 14-day EU right of withdrawal; the yearly text adds that it renews until cancelled in Account.
- Constant: `waiverText` in `supabase/functions/_shared/passes.mjs:175`; `supabase/functions/checkout/index.ts:135` to `:141`
- Test: `continent-app/tests/passSubscription.test.mjs` :: "the waiver names the renewal and where to cancel"

### QUOTA-022 When a purchase is refused before payment
- Decides: that nobody pays for days they cannot get or for a second yearly plan.
- Rule: a yearly plan is refused while one is `active`, `trialing` or `past_due`, cancelled or not (409 `subscribed`); any pass is refused when the current expiry is within one day of the 3-year horizon (409 `pass_max`); a purchase that would cross it is allowed and marked capped.
- Constant: `pass_can_buy` in `supabase/migrations/053_pass_subscriptions.sql:121` (statuses `:145`, horizon `:153`); `pass_horizon_days` in `044_payments_quota.sql:309` = 1095; `supabase/functions/checkout/index.ts:115` to `:123`
- Test: `continent-app/scripts/ai/test_passes.mjs` :: "horizon: a pass at the horizon cannot be bought for"
- Test: `continent-app/scripts/ai/test_passes.mjs` :: "horizon: and pass_can_buy says it will be capped"
- Test: `supabase/diagnostics/053_pass_subscriptions_test.sql` :: "T053 scenario passed"

### QUOTA-023 Granting and stacking a pass
- Decides: what a purchase does to an existing pass.
- Rule: a replayed session or invoice id does nothing; a live pass is extended from its expiry, else from now; a live pass of a higher tier keeps its tier and allowance and only gains the bought days; same tier, an upgrade or no live pass take the bought tier with a fresh allowance; the end is clamped to 1095 days from now.
- Constant: `grant_pass` in `supabase/migrations/044_payments_quota.sql:370` (replay `:424`, horizon `:436`, keep `:447`)
- Test: `continent-app/scripts/ai/test_passes.mjs` :: "stacking: buying a trip on a live year keeps tier year"
- Test: `continent-app/scripts/ai/test_passes.mjs` :: "upgrade: the period is refilled"
- Test: `continent-app/scripts/ai/test_passes.mjs` :: "replay: the same session id is a no-op"
- Test: `continent-app/scripts/ai/test_passes.mjs` :: "horizon: the grant is clamped to the horizon"

### QUOTA-024 A year per paid invoice
- Decides: when the yearly plan's allowance renews.
- Rule: an invoice grants only when paid with `billing_reason` `subscription_create` or `subscription_cycle` and the subscription names a user and the year tier; the invoice id is the idempotency key; a renewal is recorded with reason `renewal`.
- Constant: `grantFromInvoice` in `supabase/functions/_shared/passes.mjs:194`
- Test: `continent-app/tests/passSubscription.test.mjs` :: "a paid first invoice grants a year, keyed on the invoice"
- Test: `continent-app/tests/passSubscription.test.mjs` :: "a renewal grants with reason \"renewal\"; other invoices grant nothing"

### QUOTA-025 Subscription state
- Decides: whether the Account says "Renews" or "Ends" and whether the plan counts as live.
- Rule: subscription events write id, status, cancel-at-period-end and period end through `set_subscription_state` (id must look like `sub_` plus 6 or more characters); the app treats `active`, `trialing` and `past_due` as live.
- Constant: `stateFromSubscription` in `supabase/functions/_shared/passes.mjs`; `set_subscription_state` in `supabase/migrations/053_pass_subscriptions.sql`; `LIVE` in `continent-app/src/hooks/useEntitlement.js:35`
- Test: `continent-app/tests/passSubscription.test.mjs` :: "the subscription state maps onto set_subscription_state"

### QUOTA-026 Cancelling and resuming
- Decides: what the yearly plan's Account controls do.
- Rule: `portal` needs a Stripe customer; `cancel` and `resume` set `cancel_at_period_end` on the traveller's own subscription only (403 `not_yours` otherwise); a cancelled plan runs to the end of the paid year.
- Constant: `supabase/functions/billing/index.ts:59` to `:93`; `continent-app/src/lib/billing.js`
- Test: no test

### QUOTA-027 Webhook trust
- Decides: that only Stripe can grant a pass.
- Rule: a missing or bad Stripe signature is 400; bodies over 1 MB are 413; without both secrets 503.
- Constant: `supabase/functions/stripe-webhook/index.ts:68` to `:85`
- Test: no test

### QUOTA-028 Back from checkout
- Decides: how soon a new pass shows after paying.
- Rule: on `?pass=ok` the entitlement is re-read 5 times, first after 800 ms, then every 1500 ms.
- Constant: `continent-app/src/hooks/useEntitlement.js:106` to `:113`
- Test: no test

### QUOTA-029 Checkout failures in words
- Decides: the sentence a failed checkout shows.
- Rule: `auth`/`no_auth_config` ask to sign in, `no_stripe`/`no_price`/`quota_check` say unavailable, `pass_max` says come back nearer the time, `subscribed` says the plan is already running, `network` and anything else get their own line.
- Constant: `FAIL_KEY` in `continent-app/src/lib/passMoments.js`
- Test: `continent-app/tests/passMoments.test.mjs` :: "every checkout failure has its sentence"

### QUOTA-030 Paywall funnel counting
- Decides: what the owner sees of offers shown, dismissed and taken.
- Rule: "shown" once per opening reason; "dismissed" on close or on leaving the page, never when the page leaves for Stripe; "checkout" before the round trip; the gate reason rides on the sale.
- Constant: `continent-app/src/hooks/usePaywall.jsx` (shown/dismissed effects); `startCheckout` in `continent-app/src/lib/checkout.js`
- Test: no test

## Rules with no test

QUOTA-008, QUOTA-009, QUOTA-010, QUOTA-011, QUOTA-012, QUOTA-013, QUOTA-014, QUOTA-015, QUOTA-016, QUOTA-026, QUOTA-027, QUOTA-028, QUOTA-030

## HANDBOOK disagreements

| HANDBOOK says | Code does | Where |
|---|---|---|
| Soft gates are "shown at most once a session ... snoozed 30 days per reason" | `nudge`, the only function that reads the session flag and the snooze, is called nowhere; `plansLow` and `expiring` open through `require` and `openPrices`, so neither limit applies | `continent-app/src/hooks/usePaywall.jsx:232`; callers `CreditChip.jsx:37`, `AnnouncementBar.jsx:116` (`AiDayPlanModal.jsx` was deleted with T1163-b; it was unmounted already) |
| Soft gates are "never for a payer" | `plansLow` opens for a payer once the allowance is known, and `expiring` opens for a payer from the banner | `continent-app/src/hooks/usePaywall.jsx:220`, `:252` |
| "The plan-day function also has a shared daily ceiling" | The same ceiling and counter cover plan-day, suggest-city and parse-booking, both kinds together | `supabase/functions/suggest-city/index.ts:152`, `parse-booking/index.ts:161`, `044_payments_quota.sql:218` |
| Pass table: one AI plan and grounded searches as separate counts | A grounded plan-day call spends one `plan` and one `ground` unit; a grounded suggest-city spends only `ground` | `supabase/functions/plan-day/index.ts:524`, `suggest-city/index.ts:205` |
| (Not stated) | The stacking harness still asserts a Trip Pass adds 30 days; it applies migrations only to 044, so it tests the pre-053 period, not the live 60 days | `continent-app/scripts/ai/test_passes.mjs:222` |
