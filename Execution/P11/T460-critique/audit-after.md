# T460 audit (after): the pass panel

Impeccable `audit`, run 2026-10-16 on the working tree (app repo uncommitted on top of `9e7ab0d`), so it compares like with like against `audit-before.md` (10/20). Scope: `src/components/PassModal.jsx`, `src/styles/71-pass.css`, `src/hooks/usePaywall.jsx` and its call sites, `src/hooks/useEntitlement.js`, `src/components/AnnouncementBar.jsx`, `src/components/AppHeader.jsx`, `src/lib/pricing.js`, `src/lib/billing.js`, and the server: `supabase/functions/{checkout,stripe-webhook,billing}/index.ts`, `supabase/functions/_shared/passes.mjs`, `supabase/migrations/053_pass_subscriptions.sql`. Evidence is in `assessment-b-after.md` beside this file.

## Audit health score

| # | Dimension | Before | After | Key finding |
|---|---|---|---|---|
| 1 | Accessibility | 2 | 3 | Named dialog, h2, trap, Escape, focus return, a real radio group and an announced error; the feature list announces "Recommended" six times and the terms link is 32 x 14 on touch |
| 2 | Performance | 3 | 4 | The panel, its CSS and the terms page now load on first open; only a few dead keyframes remain |
| 3 | Responsive design | 2 | 3 | No inner scroll at 390 x 844, 44 px targets, one order; the sheet lacks the sheet grammar (handle, rise, landscape cap) |
| 4 | Theming | 2 | 3 | Roles, type, radius and spacing tokens throughout 71; a few px literals, the title at 700 with letter-spacing, the renewal line in `--text-3` |
| 5 | Implementation integrity | 1 | 2 | Kit components and one stylesheet, but the panel opens behind two surfaces that call it, and the subscription model can sell a second yearly plan |
| **Total** | | **10/20** | **15/20** | **Good (address weak dimensions), with one P0 that blocks shipping** |

## Implementation integrity verdict

**Pass on the panel, fail on its edges.** The panel itself is now coherent and product specific: kit `Button`, `IconButton` and status `Chip`, its own lazy stylesheet on roles only (design-lint meter 0 for 71-pass.css, 1 raw button for the justified plan radio in PassModal.jsx), money through `formatPrice` everywhere, one primary, the yearly renewal stated on the card, in the small print and in the Stripe checkbox. The detector returned `[]` as it did before (weak static signal); the verified problems come from the browser and from reading the server flow.

Two edges fail. First, dropping the borrowed `day-saved-overlay` class also dropped the `z-index: 320` the panel depended on, and `--z-modal` (60) is below the destination page (240) and the AI day plan dialog (62), both of which open the paywall. Second, the yearly plan's state model treats a cancelling subscription as "not subscribed" end to end, so the panel, the expiry banner and `pass_can_buy` all sell a second subscription, and a late event then points the account at the dead one.

## Executive summary

- Audit health score: **15/20** (Good), up from 10/20.
- Issues: **P0 1, P1 3, P2 5, P3 6**.
- Top issues:
  1. **P0** The panel opens underneath the destination page and the AI day plan dialog: the PDF button on a destination and every "See passes" in the AI dialog appear to do nothing, while focus is trapped in an invisible dialog.
  2. **P1** A cancelling yearly subscriber is sold a second yearly plan, and the first plan's end then overwrites the account's subscription state (reproduced on the throwaway database).
  3. **P1** The first year's withdrawal waiver can be lost to Stripe's event order, permanently, because the grant is idempotent on the invoice id.
  4. **P1** Nothing in the app calls `lib/billing.js`: the terms and the Stripe checkbox promise cancelling "in Account", and Account has no cancel control in this diff.
  5. **P2** The six "What you get" ticks read as "Recommended" to a screen reader, in English in every language.
- Next: restore the layer (one line), close the cancelling-subscriber path in the panel, `pass_can_buy` and `set_subscription_state`, record the consent from `checkout.session.completed`, and land the Account cancel row before any Stripe step of `_OPEN-pass-subscription.md`.

All 17 before findings were addressed; 15 are fixed outright, 2 are partly fixed (P1-1 hidden behind the AI dialog by the new P0; P3-1 leftovers). Details in `assessment-b-after.md` section 6.

## Detailed findings by severity

### P0 Blocking

**[P0-1] The panel opens behind the surfaces that call it**
- Location: `src/styles/71-pass.css:13` (`z-index: var(--z-modal)`, 60); `src/components/PassModal.jsx:118` (the overlay no longer carries `day-saved-overlay`, so `src/styles/25-feature-pages.css:1765`, `.day-saved-overlay.pass-overlay { z-index: 320 }`, no longer applies). Covered by `.destp` (fixed, z 240, `24-destination-workspace.css:3636`) and `.day-saved-overlay.ai-plan-overlay` (fixed, z 62, `12-guided-trip.css:760`).
- Category: Implementation integrity / Accessibility
- Impact: measured on the built preview. A guest pressing the PDF button on `#dest=FCO` (`DestinationPage.jsx:539`) mounts the panel, but the centre of the sheet hits the Rome page's photograph at 390 and 1440 wide; nothing visible happens, which is the exact bug the 320 rule's comment records. A probe on the AI day plan dialog's layer covers the sheet the same way, so "See passes" for spent plans, spent searches and the last plan (`AiDayPlanModal.jsx:260`, `:286`, `:387`) opens the panel underneath: the paying traveller's door that T460 opened is invisible on that path. The focus trap still pulls keyboard focus into the hidden dialog, so a keyboard user is stranded until Escape.
- WCAG: 2.4.7 Focus Visible, 2.4.11 Focus Not Obscured (focus inside a fully covered dialog).
- Recommendation: give the paywall a layer above every page and dialog that can open it. Either a token added to `:root` and DESIGN.md (for example `--z-paywall`, above 300) used in 71-pass.css, or the plain `z-index: 320` in 71 with the reason in a comment; delete the dead 25:1765 rule. Optionally close the AI dialog before opening the panel. Re-run the two stacking probes in `assessment-b-after.md` section 5.
- Suggested command: `$impeccable harden`

### P1 Major

**[P1-1] A cancelling yearly subscriber can buy a second subscription, and the first one's end clobbers the account**
- Location: `PassModal.jsx:63` (`subscribed` is false while cancelling, so the picker and "Start yearly plan" show); `AnnouncementBar.jsx:93` (the expiry banner's "Extend my pass" for a cancelling plan); `053_pass_subscriptions.sql:142` to `:147` (`pass_can_buy` refuses only a live plan that is not cancelling; the test asserts the purchase is allowed, `053_pass_subscriptions_test.sql:76` to `:77`); `053:102` to `:108` (`set_subscription_state` overwrites `subscription_id` unconditionally); `stripe-webhook/index.ts:91` to `:98` (writes the event payload as it arrives).
- Category: Implementation integrity
- Impact: reproduced on the throwaway cluster. With A cancelling, a new yearly checkout is allowed; B goes live; when A ends, its `customer.subscription.deleted` sets the row to A, `canceled`. The traveller now has two charges on the books for one account (B renews), the header chip and the panel offer a third, and the in-app cancel would act on A while B cannot be cancelled from Carta.
- Recommendation: a cancelling subscriber is offered "Keep my yearly plan" (the billing function's `resume`), never a new checkout; `pass_can_buy` refuses `year` while any subscription is live (cancelling or not, reason `resume`); `set_subscription_state` ignores a state for a subscription id other than the stored one unless the stored one is no longer live; the webhook retrieves the subscription before writing, as `invoice.paid` already does, so event order cannot write an older state. Add the scenario to the 053 test.
- Suggested command: `$impeccable harden`

**[P1-2] The first year's waiver consent can be lost for good**
- Location: `stripe-webhook/index.ts:117` to `:124` (consent read with `checkout.sessions.list({ subscription })` while handling `invoice.paid`); `:147` to `:156` (the yearly `checkout.session.completed` writes state only); `passes.mjs:214` (the invoice id is the idempotency key).
- Category: Implementation integrity
- Impact: in subscription-mode Checkout, `invoice.paid` commonly arrives before `checkout.session.completed`. If the session is not yet listed under the subscription, the year is granted with `consent_tos` NULL, and no later event can fill it because the invoice id is already used. The webhook's own header says a sale without stored consent is refundable for 14 days. Not verified against Stripe test mode: it depends on Stripe's internal ordering.
- Recommendation: record the consent where it is certain, in the `checkout.session.completed` subscription branch: a small service-role RPC that sets `consent_tos`, `consent_at` and `consent_terms_url` on the `pass_grants` row whose `session_id` is `session.invoice` (and holds them for the invoice if it has not landed yet). Add "read `pass_grants.consent_tos` for the test purchase" to step 7 of `_OPEN-pass-subscription.md`.
- Suggested command: `$impeccable harden`

**[P1-3] No in-app cancel for the yearly plan in this diff**
- Location: `src/lib/billing.js` has no importer (grep); `src/auth/AccountPanel.jsx` is unchanged; `TermsOfService.jsx` says "from your Account page ('Cancel yearly plan')"; `passes.mjs:180` (the checkbox says "which I can do at any time in Account"); `_OPEN-pass-subscription.md` step 7 tests "Cancel from Account".
- Category: Implementation integrity
- Impact: if the owner follows the switch-on steps with this diff alone, Carta sells a renewing plan whose promised cancel control does not exist in the app (Germany's BGB 312k asks for exactly that button). Today it is dormant: no recurring Price is configured.
- Recommendation: land the Account row (status line "Renews {date}" or "Ends {date}", "Cancel yearly plan", "Resume", "Manage card and invoices") before step 2 of `_OPEN-pass-subscription.md`, presumably in the Account task (T461), and make step 1 of that procedure say so.
- Suggested command: `$impeccable onboard`

### P2 Minor

**[P2-1] The ticks in "What you get" announce "Recommended"**
- Location: `PassModal.jsx:184` (`<CheckIcon size={16} />`, not hidden); `Icons.jsx:465` hard-codes `label="Recommended"`.
- Category: Accessibility
- Impact: the accessibility tree reads img "Recommended" before each of the six lines, in a pricing dialog where "Recommended" means something specific, and in English in all six languages.
- WCAG: 1.1.1 Non-text Content, 1.3.1 Info and Relationships.
- Recommendation: wrap the tick in `aria-hidden="true"` in PassModal; file the `CheckIcon` default label as its own task (53 call sites render it).
- Suggested command: `$impeccable harden`

**[P2-2] The terms link is 32 x 14 on touch, and not in the link colour**
- Location: `PassModal.jsx:205`; `71-pass.css:126` to `:135` (`color: var(--text-2)`).
- Category: Responsive / Accessibility
- Impact: the only way to read the terms before paying is a 14 px high target on a phone (never-do 10). WCAG 2.5.8's inline exception covers it, carta-design's floor does not. Links are `--action`.
- Recommendation: give the terms link its own line under the small print, `min-height: var(--tap)` under `(pointer: coarse)`, in `--action`.
- Suggested command: `$impeccable adapt`

**[P2-3] The renewal disclosure is set as metadata**
- Location: `71-pass.css:119` to `:125` (`.pass-legal`, 12 px, `--text-3`).
- Category: Theming / Accessibility
- Impact: "Renews at €14.99 a year until you cancel" and the withdrawal sentence are body sentences in the colour DESIGN.md reserves for metadata. At 360 wide in German the line sits just below the fold (sheet 708, content 792); the card still says it renews.
- Recommendation: `--text-2` for `.pass-legal`.
- Suggested command: `$impeccable typeset`

**[P2-4] `incomplete` counts as a live plan**
- Location: `useEntitlement.js:34`; `053_pass_subscriptions.sql:144`.
- Category: Implementation integrity
- Impact: a subscription left incomplete by an abandoned 3-D Secure step hides the header chip, shows the subscriber note and answers "already active" to a new checkout for about a day.
- Recommendation: live means `active`, `trialing` or `past_due`, in both places.
- Suggested command: `$impeccable harden`

**[P2-5] Each yearly checkout creates a new Stripe customer**
- Location: `checkout/index.ts:151` (`customer_email` only); `053:103` (the newest customer id wins); `billing/index.ts:69` to `:73` (the portal opens on that customer).
- Category: Implementation integrity
- Impact: a returning subscriber's earlier invoices sit on another customer and do not show in the billing page the terms point to.
- Recommendation: pass `customer: stripe_customer_id` when the entitlement row has one, `customer_email` otherwise.
- Suggested command: `$impeccable harden`

### P3 Polish

**[P3-1] Leftover pass CSS outside 71**
- Location: `21-chat-passes.css:304` to `:313` (a literal `.25s ease` animation, three `@keyframes`, two for classes that no longer exist, a whitespace line); `69-v6-account.css:226`, `:264`, `:341` (a second overlay animation and a scrim in the legacy `--ink` duplicating `.shell-scrim`); `25-feature-pages.css:1765` (dead once P0-1 is fixed in 71).
- Category: Implementation integrity / Performance
- Recommendation: delete them; 71 and `.shell-scrim` already carry everything.
- Suggested command: `$impeccable polish`

**[P3-2] Sheet grammar and type details**
- Location: `71-pass.css:18` to `:31` (no grab handle; arrives with `shell-dialog-in` rather than rising; no exit in `--dur-2`; `max-height: calc(100dvh - var(--space-6))` rather than the 80 percent landscape cap); `:48` to `:51` (title at 700 with `-0.01em`; title is 600, no letter-spacing); `:87` to `:90`, `:96`, `:142` (22, 2, 1.5 and 520 px literals).
- Category: Theming / Responsive
- Recommendation: the sheet family from carta-design (handle, rise, leave, landscape cap), title at 600 without letter-spacing, the mark on `--space-*`.
- Suggested command: `$impeccable polish`

**[P3-3] Pending plan edge cases**
- Location: `usePaywall.jsx:127` to `:137`; `PassModal.jsx:57`.
- Category: Implementation integrity
- Impact: `initialTier` is never reset, so later openings that session preselect the old choice; a pending entry from an abandoned sign-in reopens the panel at any later sign-in in that tab, even for an account that already pays; the key is written twice.
- Recommendation: clear `initialTier` in `close()`; reopen only once the entitlement is known and not paid (or the reason is a quota one); move the key to a tiny shared module; drop entries older than about 30 minutes.
- Suggested command: `$impeccable harden`

**[P3-4] Billing function hardening**
- Location: `billing/index.ts:81` (the metadata check passes when `user_id` is absent), `:72` (the portal `return_url` falls back to the request's `Origin`), `:86` (state write errors ignored).
- Category: Implementation integrity
- Recommendation: fail closed on missing metadata, a fixed return URL, return the state write result.
- Suggested command: `$impeccable harden`

**[P3-5] `deno check` would reject the Stripe API version literal**
- Location: `checkout/index.ts:122`, `stripe-webhook/index.ts:73`, `billing/index.ts:65` (`apiVersion: '2025-10-29.clover'` with `npm:stripe@17`).
- Category: Implementation integrity
- Impact: none at runtime (deploy does not type-check, and the code reads the clover shapes); a type check fails with TS2322. Pre-existing in two of the three files. Not run here (no `deno` installed).
- Recommendation: move to the stripe-node major whose typings carry `2025-10-29.clover`, or cast the config once.
- Suggested command: `$impeccable harden`

**[P3-6] No feedback while the lazy panel loads**
- Location: `usePaywall.jsx:280` (`<Suspense fallback={null}>`).
- Category: Performance
- Impact: on a slow connection the first press of a gate shows nothing until the chunk arrives.
- Recommendation: prefetch the chunk on idle after first paint, or show the scrim as the fallback.
- Suggested command: `$impeccable optimize`

## Patterns and systemic issues

- **Layers off the scale.** The paywall moved onto `--z-modal` (60), the right token, but full-screen pages and the AI dialog still use literals from 62 to 1200. Any dialog that adopts the scale will lose to them until the pages move onto it too.
- **"Cancelling" is modelled as "not subscribed".** The client, the banner, the header and `pass_can_buy` all read a cancelling plan as free to buy again; the fix belongs in all four at once.
- **`CheckIcon` carries an English accessible name.** Every unhidden tick in the app reads "Recommended".

## Positive findings

- The door is right: quota gates now open for a paying traveller once the entitlement is known, feature gates still pass them through, and loading still fails open (`usePaywall.jsx:207` to `:217`).
- The dialog contract is met: name, h2, trap, Escape, focus return to the opener (measured), sticky head with the close, white `--surface`, `--radius-sheet`, `--elev-3`, the 28 percent scrim.
- A real radio group: one tab stop, arrow keys move selection and focus, the legal line and button follow the choice.
- The error is announced next to the button that caused it.
- At 390 x 844 the whole panel fits: 717 px, no inner scroll, about 105 words against 122 to 174 before, one primary, every control 44 px except the terms link, smallest text 12 px.
- Money is right everywhere: billed amount large, monthly figure small and beside it, cents, locale, no euro sign in any string, the renewal said on the card, in the small print and in the checkbox.
- The guest's choice survives sign-in (measured: pending plan stored, sign-in opened).
- Server: the yearly `checkout.session.completed` grants nothing, every paid invoice grants once keyed on its id (replay proven on the throwaway database), renewals add 365 days, `set_subscription_state` is service-role only, the billing function finds the subscription from the caller's own row.
- The panel, its stylesheet and the terms page left the main bundle.

## Recommended actions

1. **[P0] `$impeccable harden`**: put the paywall layer above the destination page and the AI dialog (a `--z-paywall` token or 320 in 71) and delete the dead 25:1765 rule; re-run the stacking probes.
2. **[P1] `$impeccable harden`**: a cancelling subscriber gets "Keep my yearly plan" (resume), `pass_can_buy` refuses a second live subscription, `set_subscription_state` keeps the live id, the webhook re-reads the subscription; add the scenario to the 053 test.
3. **[P1] `$impeccable harden`**: record the first year's consent from `checkout.session.completed` onto the invoice's grant row; add the consent read to step 7 of the owner procedure.
4. **[P1] `$impeccable onboard`**: the Account cancel, resume and billing-page row on `lib/billing.js`, before any Stripe switch-on step.
5. **[P2] `$impeccable harden`**: hide the ticks, `incomplete` is not live, reuse the Stripe customer.
6. **[P2] `$impeccable adapt`**: the terms link on its own line at `--tap`, in `--action`.
7. **[P2] `$impeccable typeset`**: the small print in `--text-2`; title at 600 without letter-spacing.
8. **[P3] `$impeccable optimize`**: prefetch the panel chunk.
9. **`$impeccable polish`**: delete the leftover pass CSS in 21, 69 and 25, the sheet grammar (handle, rise, leave, landscape cap), the mark on the spacing scale, then a final pass.

You can ask me to run these one at a time, all at once, or in any order you prefer.

Re-run `$impeccable audit` after fixes to see your score improve.
