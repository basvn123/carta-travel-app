# T460: Pass and billing, the yearly plan and the 60-day Trip Pass

## Task ID

T460 (P11), second of the three tasks of 2026-10-16 (T434 My trips, T460 pass and billing, T461 account and help). Branch `p11-pass` in both repos.

## Date

2026-10-16

## What changed

The owner asked four things about the pass:
- whether it is used in the right places;
- whether it converts;
- whether the panel is too wordy;
- whether a 30-day one-off pass is right when people want something recurring.

They chose from the market research:
- The Year Pass becomes a **yearly plan that renews until cancelled**, at EUR 14.99. Wanderlog, Roadtrippers and Komoot all sell by the year.
- The Trip Pass stays a one-off payment and now runs **60 days**, because a trip is planned over about six weeks and the pass should still be live on the trip.

**The panel.** It is rebuilt as one decision. The critique scored the old one 22/40 and the audit 10/20.
- **Plans.** A heading that names the moment, then two plans as one radio choice. The yearly plan is chosen by default and marked "Recommended". Its billed amount is large, with "About €1.25 a month. Renews yearly, cancel anytime." small under it. The Trip Pass reads "€6.99 once, 60 days, no renewal".
- **What you get.** One list, led by whatever the traveller just reached for: exports, saving, sharing or plans.
- **One primary, naming the amount.** "Start yearly plan, €14.99", "Get the Trip Pass, €6.99", or for a Trip Pass holder "Add 60 days, €6.99".
- **Small print, two lines.**
  - "Free keeps 2 Carta bot plans and one saved trip. Your trips stay saved when a pass ends."
  - VAT, the 14-day withdrawal right, the renewal, and a Terms link.
- **Removed.** The 45-word waiver paragraph above the prices, the comparison table, "one-off" said six times, and 28 strings.
- **Measured.** At 390 px the panel is now one screen (717 of 844 px, no scroll); before it was about two. Words in view went from 247 to 300 down to about 106.

**The funnel's dead ends are fixed.**
- **Paying travellers.** A paying traveller who has used up the plans or searches used to press "See passes" and get nothing, because `require()` let every paid tier through. The quota gates now open the panel for them.
- **Guests.** A guest's chosen plan used to be dropped at sign-in. It is now kept in this tab's session storage, and the panel reopens on it once they are signed in.
- **Header and banner.** For a live yearly plan the header's "Get a pass" chip and the expiry banner step aside, because there is nothing to sell or warn about.

**Billing behind it.**
- **Migration 053.** The Trip Pass becomes 60 days in `plan_tiers`. `entitlements` gains the subscription's state (id, status, cancel at period end, renewal date), with one service-role writer (`set_subscription_state`). `pass_can_buy` refuses a second live yearly plan.
- **checkout.** The yearly plan opens in subscription mode. Its own waiver wording names the renewal and where to cancel.
- **stripe-webhook.** It grants each paid yearly invoice through 044's `grant_pass`, keyed on the invoice id, so a replay is a no-op and a renewal adds a year. The first invoice reads the consent, the country and the gate reason off the checkout session. Subscription events keep the state in step.
- **billing (new Edge Function).** It opens Stripe's Customer Portal, cancels at the period end and resumes. The ownership check runs before anything changes. T461 puts these behind "Cancel yearly plan" in Account.
- **Terms.** They now say what the yearly plan is, how it is charged, how to cancel it online, and how the refund rule applies to a renewal.

## Files touched

**App, created:**
- continent-app/src/styles/71-pass.css (lazy, with the panel's own chunk)
- continent-app/src/lib/billing.js
- continent-app/tests/passSubscription.test.mjs (6 tests; 443 to 449)

**App, modified:**
- continent-app/src/components/PassModal.jsx (rebuilt)
- continent-app/src/hooks/usePaywall.jsx:
  - the quota gates open for paying travellers;
  - the guest's plan is kept;
  - the panel is lazy.
- continent-app/src/hooks/useEntitlement.js (reads the subscription's state)
- continent-app/src/lib/pricing.js (Trip Pass 60 days; yearly marked recurring and recommended; `isRecurring`, `monthlyCents`)
- continent-app/src/components/AnnouncementBar.jsx (no banner for a renewing plan; "1 day left")
- continent-app/src/components/AppHeader.jsx (no "Get a pass" for a live yearly plan)
- continent-app/src/components/TermsOfService.jsx (yearly plan, cancellation, renewal refunds; dated 16 October 2026)
- continent-app/src/styles/21-chat-passes.css, 69-v6-account.css (the old panel's rules pruned)
- continent-app/src/i18n/en.js, nl.js, de.js, fr.js, es.js, it.js (31 keys added, 7 updated, 28 removed)
- continent-app/scripts/verify_paywall.mjs (it reads the keys the panel names, and checks the 14 days in the small print and the waiver text)
- continent-app/scripts/verify_plan_tiers.mjs (reads `period_days` pins)
- continent-app/scripts/ci/design-lint.baseline.json (shrunk)

**Root, created:**
- supabase/migrations/053_pass_subscriptions.sql
- supabase/functions/billing/index.ts
- supabase/diagnostics/053_pass_subscriptions_test.sql
- supabase/diagnostics/053_extract_044.py
- Execution/P11/T460-pass-billing.md
- Execution/P11/_OPEN-pass-subscription.md
- Execution/P11/T460-critique/
- Execution/P11/T460-shots/

**Root, modified:**
- supabase/functions/checkout/index.ts
- supabase/functions/stripe-webhook/index.ts
- supabase/functions/_shared/passes.mjs
- Execution/_OPEN.md
- the continent-app mirror

## Commands run

```
git -C continent-app checkout -b p11-pass ; git checkout -b p11-pass
python supabase/diagnostics/053_extract_044.py ; psql -p 55433 -f supabase/diagnostics/053_pass_subscriptions_test.sql   (throwaway cluster)
python <scratchpad>/i18n_keys.py keys_t460*.json src/i18n
python <scratchpad>/css_prune.py deadpass2.txt 21-chat-passes.css 69-v6-account.css 25-feature-pages.css
npm test ; node scripts/verify_paywall.mjs ; verify_paywall_funnel ; verify_plan_tiers ; design-lint ; banned-terms ; token-contrast ; npx vite build
node <scratchpad>/measure_pass.mjs --label=after [--lang=de]   (built preview, guest, free and Trip Pass holder, 360, 390, 820, 1440 px)
```

## Config and secrets set

None from here.
- The owner's steps are in `Execution/P11/_OPEN-pass-subscription.md`:
  - paste 053;
  - create the recurring yearly Price and point `STRIPE_PRICE_YEAR` at it;
  - set up the Customer Portal;
  - add the four webhook events;
  - deploy checkout, stripe-webhook and billing.
- Optional secret: `BILLING_RETURN_URL`.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Panel height on a 390x844 phone | 776 px dialog with about 1,650 px of content (about two screens) | 717 px, no scroll | one screen |
| Words in view (desktop) | 247 to 300 | 104 to 106 | about -60% |
| Words in view (phone, 390) | 101 to 174 | 104 to 106 | less on the free view, about level for a guest |
| Primary in the first screen, every width and state | no on phones (the Year Pass two screens down) | yes (12 of 12 views, English and German) | |
| Buy button height on touch | 38 px | 44 px (kit Button) | +6 |
| Smallest text in the panel | 10 px ("Recommended"), 11 px figures | 12 px | floors met |
| Legal statements in the panel | 3, plus a 45-word waiver paragraph above the prices | 1 line (VAT, 14-day withdrawal, renewal, Terms) | -3 |
| Paying traveller out of plans presses "See passes" | nothing opens | the panel opens | fixed |
| A guest's chosen plan after sign-in | lost | kept, panel reopens on it | fixed |
| Trip Pass length | 30 days | 60 days (pricing.js now; server once 053 is pasted) | +30 |
| Raw button sites in PassModal (meter) | 3 | 1 (the plan radios) | -2 |
| 21-chat-passes.css and 69-v6-account.css lines | 837, 534 | 692, 435 | -244 |
| Panel JS and CSS in the first-paint bundle | yes | no (PassModal-*.js and .css chunks) | lazy |
| design-lint violations | 8,125 | 8,062 | -63 |
| Tests | 443 | 449 | +6 |
| Critique (Nielsen, /40) | 22 | 26 (then one fix batch, below) | +4 |
| Audit (/20) | 10 | 15 (then the P0 and P1 fixes below) | +5 |
| Audit issues P0, P1, P2, P3 | 0, 5, 8, 3 | 1, 3, 5, 6 before the fix batch; P0 and the P1s fixed or owned (T461) | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| 053's 60-day check failed at first | Adding 60 calendar days across the end of summer time is 60 days and an hour | The test allows an hour |
| The guest and German shoot scenes timed out | The panel is now a lazy chunk, slow to load on the busy dev server, and the shoot's selectors were English only | A focused measurement on the built preview (`measure_pass.mjs`), in English and German |
| verify_paywall asserted the retired waiver paragraph and its order | The consent moved to Stripe's required tick box, and the panel keeps one line | The harness checks the small print names the 14 days in all six languages and the waiver text names the renewal. It now reads the keys the panel actually names |
| design-lint: the Terms control was a raw button | | A real link to `?legal=terms` that opens the terms in place |
| After critique: a subscriber's small print said "One payment, no renewal" | The legal line followed the selected plan only | It follows the subscription too |
| After critique: "Extend my pass" and the expiry banner preselected the yearly plan, saying nothing about the days left | Yearly was always the default | A Trip Pass running out opens on the Trip Pass. The yearly card says "Your Trip Pass days carry over." |
| After critique: an incomplete first payment counted as a live plan, so it could not be retried | `incomplete` was in the live set, client and 053 | Removed from both; 053 re-tested |
| After critique: "Passes are not switched on for this server yet." and "1 days left" | Developer voice; one plural string for both | "Payments are not open yet. Try again soon."; `pass.current1` |
| After audit, P0: the panel opened underneath the destination page (z 240) and the day-plan dialog (z 62), so a guest's PDF press and every out-of-plans "See passes" there showed nothing | The new panel dropped the `day-saved-overlay` class that the z 320 rule keyed on, and took `--z-modal` (60) | The 320 rule names `.pass-overlay` alone, and the lazy stylesheet no longer sets a lower layer. Probed: the sheet is on top at 390 and 1440 px |
| After audit: a cancelled yearly plan with time left was offered a second subscription | The panel, the banner and `pass_can_buy` treated a cancelled plan as not live | The panel offers "Keep my yearly plan" (billing resume). 053 refuses a second yearly plan while one is live, cancelled or not. The test asserts both, and that an ended plan allows a new one |
| After audit: the first year's waiver consent could be lost if invoice.paid arrived before checkout.session.completed | Consent was read only on the invoice | checkout.session.completed also writes the consent onto the first invoice's grant when it has none |
| After audit: every yearly checkout made a new Stripe customer | `customer_email` only | Checkout reuses the traveller's `stripe_customer_id` |
| After audit: six ticks announced "Recommended"; the Terms link was grey; the renewal sentence was in the metadata colour | `CheckIcon` hard-codes that label (app-wide, `Icons.jsx:465`); colours | The panel's ticks are aria-hidden; the link takes `--action`; the small print takes `--text-2`. The icon's label is row T460-g |

## What is still open

Each item is one row in `Execution/_OPEN.md`.

- **T460-a (user).** The ordered switch-on in `Execution/P11/_OPEN-pass-subscription.md`. Until 053 is pasted, the server grants a Trip Pass 30 days while the panel says 60.
- **T460-b (user).** Legal review, by someone qualified, before the yearly plan sells:
  - tacit yearly renewal under German law (§309 Nr. 9 BGB) and Dutch law (art. 6:236 j BW), where a consumer may need monthly notice after the first year;
  - the French renewal reminder (L215-1);
  - whether a §312k cancel button may sit behind a login;
  - the waiver sharing Stripe's one tick box with the terms;
  - the purchase confirmation recording the waiver;
  - the 30-day price-change notice the terms now promise.

  The critique's agent listed these. Stripe's upcoming-renewal emails can be switched on in the meantime.
- **T460-c (next task).** The webhook and billing functions are not executed by any test, because Deno is not installed here. The pure parts are tested in node (`_shared/passes.mjs`) and the SQL on a throwaway cluster. Stripe test mode (step 7 of the procedure) is the end-to-end check.
- **T460-d (user).** Price calls:
  - At EUR 14.99 the yearly plan pays off only from a third trip (two Trip Passes are EUR 13.98). EUR 12.99 makes it the plain better deal for a two-trip year.
  - The live-search ceilings still read 40 and 120, against the owner's 10 and 30 of T041-a, which T148 applies.
- **T460-e (next task, closed by T461).** The cancel route in Account ("Cancel yearly plan", "Resume", the billing page) is T461's. The panel and the terms already point at it.
- **T460-f (next task).** `account.faq13A` still describes two one-off passes of 30 days. T461 rewrites the FAQ.
- **T460-g (next task).** `CheckIcon` in `components/Icons.jsx` carries the accessible name "Recommended" wherever it is used. Make it decorative and let callers name it.
- **T460-h (next task).** `deno check` would reject `apiVersion: '2025-10-29.clover'` against `npm:stripe@17`'s types in checkout, stripe-webhook and billing. This predates T460, and deploy does not type-check. Align the version with the package when Deno is installed.

## Carta-design: the seven questions

1. **Hex values.** No hex: design-lint reports 0 new; token-contrast reports 0 under the floor.
2. **Colour.** No gradient and no new colour. The sparkle icon and the brown wash on the current card are gone.
3. **Selection.** Brown is used for the one primary, the chosen plan's edge, tint and filled radio mark, and the focus ring. "Recommended" is a neutral status chip, not a filled brown pill.
4. **Figures.** No figure is under 12 px. Prices go through `formatPrice`, with cents, as pass prices are receipts.
5. **One primary.** One primary per view. No photograph.
6. **Copy.** The heading "Choose your plan", and verbs on the buttons. There is no count or method line, no dashes and no banned words; banned-terms passes.
7. **What else could go.** The comparison table, the 45-word waiver paragraph, "one-off" six times, the Free card, and 244 lines of CSS.

## Rollback procedure

- **App repo:** `git -C continent-app revert -m 1 <the T460 merge on master>`.
- **Root repo:** `git revert -m 1 <the T460 merge on main>`, then push.
- **If 053 was pasted:** run its DOWN block, after cancelling any live yearly subscriptions in Stripe, because nothing would record their renewals.
- **If the functions were deployed:** redeploy the previous checkout and stripe-webhook from the reverted tree, and delete the billing function.
- **Stripe:** the recurring Price can stay archived.
- **Passes already granted:** they keep their expiry either way.
