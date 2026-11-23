# Report: logic wave 1, honest totals (E1) and one entitlement decision (E10)

Status: done · 2026-11-23 · L2 light wave (round 2, quota wave 2 of 4) · branch `p15-fix-logic`, merged into `p15-fix-programs`.

A trip with a missing part no longer prints a lower total, a "fits" or a "cheapest" once the `E1` flag is on: `continent-app/src/lib/price/gaps.js` is the one place that decides partial, fits, tight and over. The paywall asks one function (`continent-app/src/lib/paywallDecision.js`), the checkout way back is allow-listed, async Stripe payments grant the pass once, and a repeated webhook event or sync push changes nothing (G11). Both engines ship behind flags at `old`, so travellers see no change until the owner flips them. The first fresh judge failed four lines; after the fixes a second fresh judge scored every line 4 (`judgement-2.md`).

## The question (G12)
Does any screen still print a lower total, a "fits" or a "cheapest" for a trip with a missing part? With `E1` at `new`: no. The totals golden set goes from 10 of 17 (old) to 17 of 17 (new); the shadow diff on 12 personas changes every one to "before getting there" and the missing-bed label (`shadow/shadow-E1.md`, `before/`).

## What changed
- **E1** (A-1, A-9, A-13, A-17, A-20, B-4, H-2, H-4 ranking half, H-8 comparison half): `lib/price/gaps.js` (`sumParts`, `standingOf`, `budgetStanding`, `comparePartialLast`, `partialLastKey`, `leftOutOf`); rewired `lib/price/stay.js`, `trip.js`, `nights.js`, `compose.js`, `tiles`, `lib/tripTotal.js`, `lib/budgetSearch.js`, `lib/recommend/rank.js`, `finderText.js`, `lib/runtime_pricing.js`, `lib/currency.js`, `lib/planPdf.js`, `browse/DestPriceCard.jsx`, `hooks/useDestinationSearch.js`. A grep test fails on a fits or tight decision outside `gaps.js`. Moot on HEAD: B-5, G-6 median half. A-10 is wording only ("before getting there", owner default 1).
- **E10** (J-5 server half, J-7, J-9, J-12): `lib/paywallDecision.js` `decide()` (owner default 13), `hooks/usePaywall.jsx` wires it ('wait' re-asks and opens the sheet), `supabase/functions/checkout` (allow-listed `APP_ORIGIN`, 503 when unset, same-origin `returnTo`), `supabase/functions/stripe-webhook` (`async_payment_succeeded` through the same grant, failure logged), pure modules tested in node (no Deno on this machine; CI's edge-deno job passes).
- **G11:** `continent-app/tests/idempotency.test.mjs` pins the real `grant_pass` guard (migration 007 key, 044 replay check) and a repeated sync push.
- **Eval first:** `tests/fixtures/logic-golden/totals.json` on the `logic-engines` harness, committed before any number moved; slices and errors in the run folder.
- **Screens:** three new strings in six languages; `continent-app/scripts/verify_logic_w1.mjs` shows "Without beds in Reus" on a Lisbon plus Reus trip at 390, 820, 1180 and 1440 and a sweep, 25 of 25 with `E1` new.
- **Docs:** PRICE-049 and QUOTA rows in `docs/logic/`, HANDBOOK, ROADMAP D10, G9, I2, I5, I14, `docs/owner/stripe.md` (APP_ORIGIN secret, checkout and webhook deploy, async event subscription), `docs/owner/product-decisions.md` (defaults 1, 13, 16 and the flag flip).

## Checks
- CI run 45100365792 on `4ea4e870fb`: only baseline failures (design-lint motion-literal; data-owned DCACHE launch-gate errors and the stays snapshot). edge-deno, evals and csp pass.
- Locally: touched tests 125 of 125, `logic-engines --check` pass, eslint clean, drift 0, entry points OK.
- Not run locally: the full `npm test` (over 2 hours here); CI ran it.

## Left for later (in `backlog.md`)
- W1-L1: the J-5 client moment (confirm once, offer the blocked action again).
- W1-L2: budget search rows never read partial (`verdictOf` passes `complete: true`).
- W1-L3: `HomeTry.jsx` counts fits on its own.

## Owner steps
`docs/owner/stripe.md`: set `APP_ORIGIN`, deploy `checkout` and `stripe-webhook`, subscribe the async payment events. `docs/owner/product-decisions.md`: flip `E1` and `E10` in `continent-app/config/flags.json` after review.

## Undo
Set `E1` and `E10` to `old` (today's behaviour), or `git revert` the wave commits `e5dba13476..4ea4e870fb`. The server changes are undone only by redeploying the old functions. No migration, no data change.

## Next step
Wave 3: W2, E9 phase A state scope.
