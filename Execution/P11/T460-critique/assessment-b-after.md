# T460 critique, Assessment B (after): detector and evidence

Surface: the rebuilt pass panel. `continent-app/src/components/PassModal.jsx` (211 lines), its own stylesheet `src/styles/71-pass.css` (155 lines, loaded with the lazy panel), the door `src/hooks/usePaywall.jsx`, `src/hooks/useEntitlement.js`, `src/components/AnnouncementBar.jsx` (`PassExpiryBanner`), `src/components/AppHeader.jsx`, `src/lib/pricing.js`, `src/lib/billing.js`; server `supabase/functions/{checkout,stripe-webhook,billing}/index.ts`, `supabase/functions/_shared/passes.mjs`, `supabase/migrations/053_pass_subscriptions.sql` and its throwaway test.

Run 2026-10-16, read-only, on the working tree (app repo uncommitted on top of `9e7ab0d`). Line numbers are working-tree line numbers. Evidence only; the design opinion is Assessment A's. Scripts and raw output are in the session scratchpad (`t460-kbd.mjs`, `t460-stack.mjs`, `t460-aria.mjs`, `t460b-clobber2.sql`, `t460b/result.json`).

## 1. Impeccable detector CLI (static)

`impeccable.cmd detect --json <file>` from the repo root.

| File | Lines | Findings |
|---|---|---|
| components/PassModal.jsx | 211 | 0 (`[]`, exit 0) |
| styles/71-pass.css | 155 | 0 (`[]`, exit 0) |
| components/AnnouncementBar.jsx | 124 | 0 (`[]`) |
| styles/21-chat-passes.css | 692 | 0 (`[]`) |

Same weak static signal as before: the detector returned `[]` before the rebuild too. The findings below come from the lint meter, grep, the browser and reading the logic.

## 2. design-lint meter (from continent-app/)

| Meter | raw-button | font-size | radius | legacy-token | money |
|---|---|---|---|---|---|
| `--meter PassModal` | **1** | 0 | 0 | 0 | 0 |
| `--meter 71-pass` | 0 | 0 | 0 | 0 | 0 (no row: a clean file prints none) |
| `--meter 21-chat` (for scale) | 0 | 29 | 19 | 79 | 0 |
| full run | 8062 violations, 8062 in the baseline, **0 new** | | | | |

The one raw button is the plan radio (`PassModal.jsx:144`, `<button role="radio">`). The kit has no radio card (Tile and ChipGroup are the nearest), so this is a justified local control, but it is the panel's one non-kit interactive.

## 3. Static and logic review

### Dialog, headings, focus, keyboard

- `role="dialog" aria-modal="true" aria-labelledby="pass-title"` now sits on the card (`PassModal.jsx:119` to `:124`); title `h2` (`:128`), "What you get" `h3` (`:182`). The before P1 (no name, `h3` title, role on the scrim) is fixed.
- Close is the kit `IconButton` with `ref={closeRef}` (`:129`; IconButton is a `forwardRef`), the initial focus of `useFocusTrap` (`:72`), which also owns Escape and focus return. The trap steps aside while the terms page is open (`enabled: !termsOpen`).
- Head is sticky inside the scrolling sheet (`71-pass.css:32` to `:44`, `top: calc(-1 * var(--pass-pad-top))`), so the close stays in reach.
- Plans: `role="radiogroup" aria-label` (`:138`), each plan a `role="radio" aria-checked` button with roving `tabIndex` (`:147` to `:149`); any arrow key moves to the other plan and focuses it (`:152` to `:158`). With two options this is the wrapping radio pattern. Home and End are not handled (P3, no real impact with two).
- Checkout error: `role="alert"` paragraph directly above the primary (`:188`), cleared on the next press (`:87`). The before P1 is fixed.
- `CheckIcon` inside each "What you get" item (`:184`) is not hidden: `Icons.jsx:465` hard-codes `label="Recommended"`. The accessibility tree reads **img "Recommended"** before every one of the six lines (section 5), in English in all six languages.
- Terms link (`:205`) is a real `<a href="?legal=terms">` that opens the terms dialog in place. Coloured `--text-2` (`71-pass.css:131`), not `--action`.

### Tokens, type, motion

- 71-pass.css reads roles only: `--surface`, `--text`, `--text-2`, `--text-3`, `--border`, `--select-*`, `--action`, `--focus`, `--danger`, `--surface-hover`; type `--text-title`, `--text-lead`, `--text-body`, `--text-label`, `--text-caption`; `--radius-sheet`, `--radius-card`, `--radius-pill`, `--radius-sm`; `--space-*`, `--gutter`, `--z-modal`, `--dur-1`, `--ease-out`. No hex, no gradient, no legacy alias.
- Remaining literals: the plan mark `22px` square, `margin-top: 2px`, `border: 1.5px` (`:87` to `:90`), `gap: 2px` (`:96`), `max-width: 520px` (`:142`).
- `.pass-title` is `--text-title` at weight **700** with `letter-spacing: -0.01em` (`:48` to `:51`); carta-design sets title at 600 and allows letter-spacing on headline and display only.
- `.pass-legal` (`:119` to `:125`) sets the VAT, withdrawal and **renewal** sentences in `--text-3` at 12 px. DESIGN.md: `--text-3` is metadata, never body copy.
- Motion: the only transition (`.pass-plan`, `:77`) has its reduced-motion branch (`:153` to `:155`). The sheet arrives through `.shell-dialog` (`shell-dialog-in`, `--dur-3`), the overlay through 69's `acc-fade` (`--dur-3`). Measured under `reducedMotion: 'reduce'`: sheet and overlay `animation-name: none`, plan transition 1e-05 s (the global floor). No exit motion (the panel unmounts at once); on a phone the sheet fades up 8 px rather than rising from the edge, and has no grab handle.
- Leftover pass CSS outside 71: `21-chat-passes.css:304` (`.pass-overlay` animation with a literal `.25s ease`), `:306` to `:309` (three `@keyframes`, two of them for classes that no longer exist), `:311` to `:313` (a reduced-motion block holding one rule and a whitespace line); `69-v6-account.css:226` (`acc-fade`, the one that wins), `:264`, `:341` (a scrim in the legacy `--ink`, duplicating `.shell-scrim`); `25-feature-pages.css:1765` (`.day-saved-overlay.pass-overlay { z-index: 320 }`, now dead because the overlay no longer carries `day-saved-overlay`; see the z-index finding).

### Layering (the regression)

- `71-pass.css:13`: `.pass-overlay { z-index: var(--z-modal) }`, which is **60**. The old panel carried `day-saved-overlay pass-overlay` and so matched `25-feature-pages.css:1765` at **320**, whose comment records why: "the full-screen destination page at z 240 was burying the pass modal launched from its own PDF button". `PassModal.jsx:118` dropped `day-saved-overlay`, so the 320 rule no longer applies.
- Surfaces that call the paywall and sit above 60: the destination page `.destp` (fixed, z 240, `24-destination-workspace.css:3636`; call site `DestinationPage.jsx:539`, export) and the AI day plan dialog `.day-saved-overlay.ai-plan-overlay` (fixed, z 62, `12-guided-trip.css:760`; call sites `AiDayPlanModal.jsx:260` ground, `:286` plansLow, `:387` plans, all through `DayPlannerTab.jsx:3721`). Both measured in the browser (section 5). Other fixed layers above 60 that do not call the paywall today: `.tpage` 240, `.rgnp` and `.cycle-page` 300, `.savedmap-full` 400, `.upl-scrim` 260.

### Money

- Every figure through `formatPrice` into `formatMoney(..., { precision: 'cents' })` (`pricing.js:134`): the plan prices (`PassModal.jsx:167`), the monthly figure (`:172`, `monthlyCents` = round(1499 / 12) = 125, so "About €1.25 a month"), the button (`:192` to `:194`) and the legal line (`:203`). `money` meter 0. No `€` in any `pass.*` string in the six locales (grep); the unused `pass.freePrice` is gone. All 59 `pass.*` keys present in all six locales, no duplicates.
- The billed amount is the large figure and the monthly one is small beside it, never instead of it (`:166` to `:174`).

### The paywall door (usePaywall.jsx and every call site)

- `require()` (`usePaywall.jsx:207` to `:217`): `if (paid && !(QUOTA_REASONS.has(why) && entitlement.known)) return true;` with `QUOTA_REASONS = plans, ground, plansLow` (`:48`).

| Traveller | Quota gate (`plans`, `ground`, `plansLow`) | Feature gate (`export`, `import`, `share`, `save`, `browse`) |
|---|---|---|
| Guest | opens | opens |
| Free, known | opens | opens |
| Paid (Trip or Year), known | **opens** (was: returned true, dead button) | returns true, passes through |
| Paid, status loading or unknown | returns true (fail open; the server enforces the quota) | returns true |

- Call sites, unchanged: chat planner `CartaChatPlanner.jsx:482` and `:754` (`credit.openPasses('plans')` through `CreditChip.jsx:37`), the AI dialog `AiDayPlanModal.jsx:260`, `:286`, `:387` (through `DayPlannerTab.jsx:3721`), exports `DestinationPage.jsx:539`, `DayPlannerTab.jsx:1923`, `:1950`, `:1961`, `TripItinerary.jsx:454`, `:460`, `:914`, import `MagicImportZone.jsx:37`, share `TripSharePanel.jsx:108`, `:140`, `:307`, save `TripPlannerTab.jsx:811`, nudge `TripPlannerTab.jsx:447`, `openPrices` from `AnnouncementBar.jsx:116`, `AppHeader.jsx` and `AccountPanel.jsx:918`.
- So a paying traveller who spent the plans or searches now reaches the panel in logic. In the chat planner (inline, no overlay) it shows. **From the AI day plan dialog it opens underneath that dialog and cannot be seen** (layering, above). Non-quota gates still pass paying travellers through.
- What a payer sees: a Trip Pass holder gets "Your Trip Pass runs until {date}", Yearly preselected, and on Trip "Add 60 days, {price}" (`:193`). A live, not-cancelling yearly subscriber gets the heading plus "Your allowance refills when the plan renews on {date}" and no plan picker or button (`:134` to `:135`). A **cancelling** subscriber is `subscribed: false` (`:63`) and is offered "Start yearly plan" again (server finding below).
- `AppHeader.jsx:138` to `:139`: the header chip steps aside for a live, not-cancelling subscription. `AnnouncementBar.jsx:93`: the expiry banner is hidden for the same; for a cancelling plan it still offers "Extend my pass", which opens the same second-subscription path.

### The guest's chosen plan through sign-in

- `PassModal.jsx:81` to `:85`: a guest's press stores `{ tier, reason }` under `carta.pendingPass` in sessionStorage and calls `onSignIn` (which runs `close()`, so no dismissal is counted). The button says "Sign in to continue". Measured: after picking Trip and pressing, sessionStorage held `{"tier":"trip","reason":"browse"}`, the panel was closed and the sign-in dialog open (phone and desktop).
- `usePaywall.jsx:128` to `:137`: once `signedIn` turns true the entry is removed and the panel reopens with that tier and reason, marked hard (no snooze). sessionStorage survives the Google redirect in the same tab.
- Edges: the key is a second literal in the hook (`:131`, `:133`) rather than the exported `PENDING_PASS_KEY` (it cannot import the lazy module); `initialTier` (`:127`) is never reset, so every later opening that session preselects the old choice; an entry left by a guest who backed out of sign-in reopens the panel at any later sign-in in that tab, including for an account that already pays (the effect runs before the entitlement is known).

### The server, a yearly plan's life

- **Checkout** (`checkout/index.ts`): `pass_can_buy` first (`:111`); `subscribed` answers 409 (`:117`); `mode` from `checkoutModeFor` (`:132`); metadata on the session and on `subscription_data` (`:133` to `:139`, `payment_intent_data` only in payment mode); waiver text per tier (`passes.mjs:175` to `:184`, the yearly one names the renewal and "cancel at any time in Account"). Always `customer_email`, never `customer` (`:151`): each yearly checkout creates a new Stripe customer.
- **Webhook, idempotency**: a yearly `checkout.session.completed` grants nothing (`stripe-webhook/index.ts:147` to `:156`); each `invoice.paid` with `billing_reason` `subscription_create` or `subscription_cycle` grants through 044's `grant_pass` with **the invoice id as `p_session_id`** (`passes.mjs:214`), and `grant_pass` returns `replay` on a known id (044 `:424`). The throwaway test proves the replay no-op and the renewal adding 365 days. **No double grant between `checkout.session.completed` and `invoice.paid`**: only the invoice grants.
- **Webhook, the first-invoice consent lookup** (`:117` to `:124`): consent is read by `checkout.sessions.list({ subscription, limit: 1 })` while handling `invoice.paid`. In subscription-mode Checkout, Stripe commonly sends `invoice.paid` before `checkout.session.completed`; if the session is not yet listed under the subscription the list is empty, the grant goes ahead with `consent_tos` NULL, and because `grant_pass` is idempotent on the invoice id, nothing fills it later (the `checkout.session.completed` branch writes state only). Not verified against Stripe test mode; it is a race on Stripe's internal ordering, so it needs the owner's step 7 to read `pass_grants.consent_tos` after a test purchase.
- **Webhook, state writes**: `customer.subscription.*` write the event payload as is (`:91` to `:98`); `invoice.paid` and the yearly `checkout.session.completed` write a freshly retrieved subscription. Stripe does not guarantee event order, so a delayed `updated` can overwrite a newer state (for example a cancel arriving after a resume).
- **053, set_subscription_state** (`053:96` to `:108`) overwrites `subscription_id` unconditionally. **053, pass_can_buy** (`:142` to `:147`) refuses a second yearly plan only when the live one is **not** cancelling; the 053 test even asserts that a cancelled plan may be bought again (`053_pass_subscriptions_test.sql:76` to `:77`). A scratch scenario on the throwaway cluster (database created and dropped, `t460b-clobber2.sql`):
  1. A active, then A cancelling: `pass_can_buy(year)` answers `ok: true`.
  2. B bought and active (state written for B).
  3. A reaches its end, `customer.subscription.deleted` for A: the row reads `subscription_id=sub_AAAAAAAA status=canceled cancel=t customer=cus_A`.
  4. `pass_can_buy(year)` answers `ok: true` again while B is live and renewing.
  So the account can hold two live subscriptions, then points at the dead one: the header chip comes back, the panel sells a third, and the billing function's cancel acts on A (Stripe refuses an update to a cancelled subscription) while B cannot be cancelled in the app.
- `incomplete` counts as live in both the client (`useEntitlement.js:34`) and `pass_can_buy` (`053:144`): a subscription left incomplete by an abandoned 3-D Secure step hides the header chip, shows "renews on" with no date source, and blocks a new checkout with "already active" until Stripe expires it (about 23 hours).
- **Billing function** (`billing/index.ts`): the subscription id is read from the caller's own `entitlements` row on the service role (`:58` to `:62`), never from the request, which is the real ownership guarantee. The extra metadata check fails open when `metadata.user_id` is absent (`:81`); the portal `return_url` falls back to the request's `Origin` header (`:72`). `set_subscription_state` errors are ignored (`:86`).
- **No consumer of `lib/billing.js`**: grep finds no import; `AccountPanel.jsx` is unchanged in this diff. Yet `TermsOfService.jsx` now promises "Cancel yearly plan" on the Account page, the waiver text says "which I can do at any time in Account", and `_OPEN-pass-subscription.md` step 7 tests "Cancel from Account".
- **Migration test**: `053_pass_subscriptions_test.sql` run on the throwaway cluster at 55433: "pass subscriptions self-check passed" (twice), "T053 scenario passed", "down ok, trip days 30".
- **Deno type check** (no `deno` on this machine, so not run): all three functions pass `apiVersion: '2025-10-29.clover'` to `npm:stripe@17`, whose typings type `apiVersion` as that major's own `LatestApiVersion` literal (an `acacia` date), so `deno check` would report TS2322. Pre-existing in checkout and the webhook at HEAD; billing copies it. Deploy does not type-check, so nothing breaks at runtime, and the code already reads the clover shapes (`invoice.parent.subscription_details`, `items.data[0].current_period_end`). Everything else types: the invoice is cast to `Stripe.Invoice & Record<string, any>`, `sessions.list` accepts `subscription`, and the `.mjs` helpers import as untyped.

## 4. Measurements (Execution/P11/T460-shots/after/measure-pass-after.json and -de)

| View | Sheet height (scroll height) | Viewport | Words in panel | Primary | Under-tap | Min font |
|---|---|---|---|---|---|---|
| p360 EN | 708 (735) | 740 | 104 to 106 | 1 | Terms 14 px high | 12 |
| p360 DE | 708 (782 to 792) | 740 | 84 to 103 | 1 | none listed | 12 |
| phone 390 EN | 717 to 726 (same) | 844 | 104 to 106 | 1 | Terms | 12 |
| phone 390 DE | 744 to 754 (same) | 844 | 104 to 106 | 1 | AGB | 12 |
| iPad EN / DE | 629 to 658 | 1180 | 104 to 106 | 1 | Terms / AGB | 12 |
| desk EN / DE | 629 to 658 | 900 | 104 to 106 | 1 | Terms / AGB | 12 |

Against before: the panel on a 390 x 844 phone went from a 776 px card holding about 1,650 px of content (two screens) to a **717 px sheet with no inner scroll**; panel words from 122 to 174 to **104 to 106**; buy buttons from 38 px to **44 px** (358 x 44 on a phone, 456 x 44 on desktop); smallest text from 10 px to **12 px**; one primary in every view; the primary is in view in all 24 scenes. At p360 the sheet scrolls 27 px (EN) to 84 px (DE), which puts the small print just below the fold; the renewal is still stated on the card.

## 5. Browser (Playwright, built preview at 127.0.0.1:4191, chromium)

Guest, "Continue without an account", then `.shell-pass-btn` clicked (visible at both sizes). Phone 390 x 844 with `isMobile` and `hasTouch`, desktop 1440 x 900.

| Check | Phone | Desktop |
|---|---|---|
| Dialog | `dialog "Choose your plan"`, modal, h2 then h3 | same |
| Sheet | white, radius 20 20 0 0, `--elev-3`, z 60 | white, radius 20, `--elev-3`, z 60 |
| Initial focus | Close | Close |
| Tab x9 | Yearly radio, Sign in to continue, Terms, Close, then wraps | same |
| Shift+Tab x3 | Close, Terms, Sign in to continue | same |
| Tab stops in the group | one (the checked radio), as it should be | same |
| ArrowDown on Yearly | Trip checked, tabindex moves, focus moves to Trip, legal line switches to "One payment, no renewal" | same |
| ArrowRight on Trip | Yearly checked again, focus follows | same |
| Home | no change (not handled) | same |
| Escape | panel closed, focus back on the header "Get a pass" | same |
| Targets | Close 44 x 44, plans 358 x 151 and 358 x 104, primary 358 x 44, **Terms 32 x 14** | Close 44, plans 224 x 159, primary 456 x 44, Terms 32 x 14 |
| Guest press | pending `{"tier":"trip","reason":"browse"}`, sign-in open | same |
| Reduced motion | sheet and overlay animation none | |

Accessibility tree (desktop): the radios read "Yearly plan Recommended €14.99 a year About €1.25 a month. Renews yearly, cancel anytime." and "Trip Pass €6.99 once 60 days, no renewal" (spaced correctly); each of the six "What you get" items reads **img "Recommended"** then its text.

**Stacking, measured:**

- `#dest=FCO`, guest, `.destp-pdf` clicked: the pass sheet mounts (`.pass-overlay` z 60) but `elementFromPoint` at its centre hits an `img` inside `.destp` (fixed, z 240), at both sizes. Screenshot `t460b-desk-dest-pdf-gate.png` shows the Rome page and no panel. The focus trap still moves focus into the hidden dialog.
- Day planner, a probe `div.day-saved-overlay.ai-plan-overlay` appended inside `.trip-planner-screen` (no stacking ancestor; the probe computes to fixed, z 62), then the panel opened: `elementFromPoint` at the sheet centre hits the probe. That is the layer the real AI day plan dialog renders on, so its "See passes" buttons open the panel underneath it.

## 6. Before and after, finding by finding

| Before | After |
|---|---|
| P1-1 allowance upsells dead for payers | Fixed in the door (`usePaywall.jsx:212`); visible from the chat planner, **hidden behind the AI dialog** (layering) |
| P1-2 dialog unnamed, role on scrim, h3 | Fixed |
| P1-3 buy buttons 38 px | Fixed, 44 px kit Button |
| P1-4 10 px flag, 11 px figures, notes in `--text-3` | Flag and figures fixed (min 12 px); the legal line is still `--text-3` |
| P1-5 error far away, not announced | Fixed, `role="alert"` above the primary |
| P2-1 two screens of scroll | Fixed, no scroll at 390 x 844 |
| P2-2 close scrolls away | Fixed, sticky head |
| P2-3 grey dialog | Fixed, `--surface`, `--radius-sheet`, `--elev-3` |
| P2-4 brown wash on non-acting boxes | Fixed, the only tint is the selected radio |
| P2-5 raw buttons | Fixed except the plan radio (meter 1) |
| P2-6 waiver line breaks unevenly | Gone; the terms link is now 14 px high on touch |
| P2-7 visual order differs | Fixed, one order |
| P2-8 guest loses intent | Fixed, with three edge cases |
| P3-1 two copies of the CSS | Mostly fixed; leftovers in 21, 69, 25 |
| P3-2 literal sizes and radii | Fixed in 71 (meter 0) |
| P3-3 copy drift | Fixed |
| P3-4 terms in the main bundle | Fixed, the panel and its CSS load lazily |
