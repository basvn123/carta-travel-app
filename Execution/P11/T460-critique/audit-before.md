# T460 audit (before): the pass panel

Impeccable `audit`, run 2026-10-16 on the app repo at `9e7ab0d`, against copies materialised from git (the working tree was being edited by another session). Scope: `src/components/PassModal.jsx`, `src/hooks/usePaywall.jsx` and its call sites, `src/lib/pricing.js`, `src/components/AnnouncementBar.jsx` (`PassExpiryBanner`), `src/styles/21-chat-passes.css`, `src/styles/69-v6-account.css`, and the inherited `.day-saved-*`, `.ai-plan-*`, `.guide-next` and `.auth-link` rules. The evidence is in `assessment-b-before.md` beside this file; line numbers are `9e7ab0d` line numbers.

## Audit health score

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 2 | The dialog has no accessible name, a 10 px label, 38 px buy buttons on a phone and a checkout error that is not announced |
| 2 | Performance | 3 | Light; dead CSS and keyframes, and the terms page ships in the main bundle with the panel |
| 3 | Responsive design | 2 | No horizontal scroll at 360, but about two screens of scroll on a phone, and the close control scrolls away |
| 4 | Theming | 2 | Every colour is a token, but all legacy aliases; the dialog paints the page grey, and a brown wash on non-acting boxes |
| 5 | Implementation integrity | 1 | No kit component in the panel, two copies of its CSS, and every allowance upsell is a dead button for a paying traveller |
| **Total** | | **10/20** | **Acceptable (significant work needed)** |

## Implementation integrity verdict

**Fail.** The panel is assembled from other surfaces' parts: the day planner's "saved" popup (`.day-saved-overlay`, `.day-saved-card`, `.day-saved-close`), the AI dialog's head and notes (`.ai-plan-head`, `.ai-plan-badge`, `.ai-plan-lead`, `.ai-plan-note`), the guided trip's primary (`.guide-next`) and the auth link. It imports no `Button` or `IconButton` from the kit. Its CSS lives twice, in 21 (literal timings, a stagger, a hover lift, `vh`) and in 69 (tokens, `dvh`), with 69 overriding 21 rule for rule and 21 never deleted. The detector returned `[]` for every file, which is a weak static result (class names, not styles); the verified problems below come from grep, the screenshots and reading the paywall logic.

The one thing that is product specific and coherent is the logic: one provider, one modal, reason-specific headings, a funnel counted in one place, money through `formatMoney`, and a computed "Costs less than 3 Trip Passes". The allowance path is the exception (P1-1).

## Executive summary

- Audit health score: **10/20** (Acceptable).
- Issues: **P0 0, P1 5, P2 8, P3 4**.
- Top issues:
  1. A paying traveller who runs out of plans or searches meets dead buttons: `require()` returns true for any paid tier, so "See passes" and the chat planner's Continue do nothing (5 call sites).
  2. The dialog has no accessible name, sits `role="dialog"` on the scrim, and starts at `h3`.
  3. Buy buttons are 38 px tall on touch, and the Recommended flag is 10 px.
  4. On a phone the panel is about two screens of scroll for three plans: a 34-word table repeats the cards, and 7 sentences of small print plus 4 statements of "no subscription".
  5. The checkout error appears at the foot of the panel, far below the button, with no live region.
- Next: fix the paywall door for paid travellers, rebuild the panel on the kit dialog grammar (`--surface`, `--radius-sheet`, `--elev-3`, IconButton close in a non-scrolling head), then cut the duplicate table and the repeated small print.

## Detailed findings by severity

### P1 Major

**[P1-1] Allowance upsells are dead for paying travellers**
- Location: `planner/CartaChatPlanner.jsx:482` and `:754`, `planner/AiDayPlanModal.jsx:260`, `:286`, `:387` (through `DayPlannerTab.jsx:3721` and `components/CreditChip.jsx:37`); door in `hooks/usePaywall.jsx:191`.
- Category: Implementation integrity
- Impact: a Trip Pass holder at 0 plans presses Continue in the chat planner and nothing happens, no panel, no message (`if (credit.out) { credit.openPasses('plans'); return; }`). The "See passes" buttons after `user_cap`, on "Live search needs a pass" and on the last plan do nothing either. The one moment a Trip Pass holder is ready for the Year Pass is the moment the door is shut.
- Recommendation: route the allowance triggers through `openPrices('plans' | 'ground' | 'plansLow')`, which opens for anyone and keeps the reason; or give `require()` an allowance mode that opens when the specific balance is zero regardless of tier. Keep `require()` as is for feature gates (export, import, share, save), where paid means allowed.
- Suggested command: `$impeccable harden`

**[P1-2] The dialog has no accessible name and the wrong element is the dialog**
- Location: `PassModal.jsx:87` (`role="dialog" aria-modal="true"` on the scrim), `:96` (`h3`), `:131` (`h4`).
- Category: Accessibility
- Impact: a screen reader announces an unnamed dialog; the heading outline starts at level 3.
- WCAG: 4.1.2 Name, Role, Value; 1.3.1 Info and Relationships.
- Recommendation: put `role="dialog" aria-modal="true" aria-labelledby` on the card, pointing at the title's id; make the title `h2` and the plan names `h3`.
- Suggested command: `$impeccable harden`

**[P1-3] Buy buttons under the touch floor**
- Location: `.guide-next:not(.btn)` (12-guided-trip.css:680, `padding: 10px 22px`), `.pass-buy-quiet` (21:435). Measured 234x38 (p360), 264x38 (phone), 203x38 (iPad).
- Category: Responsive / Accessibility
- Impact: the panel's one primary is 6 px short of `--tap` on every touch device.
- WCAG: 2.5.8 Target Size (AA minimum is met; carta-design's 44 px floor is not).
- Recommendation: kit `Button` (primary for the recommended plan, secondary for the other), size md, which is `--tap`.
- Suggested command: `$impeccable adapt`

**[P1-4] Functional text and figures under the floors**
- Location: `.pass-flag` 10px (21:387), `.pass-price small` 11px holding "30 days" / "12 months" (21:411), `.ai-plan-note` 11.5px in `--text-3` for three body sentences (20-day-planner-flow.css:340).
- Category: Accessibility
- Impact: the "Recommended" label breaks never-do 10; figures sit under 12 px; legal and VAT sentences are set in the metadata colour that DESIGN.md reserves for metadata, never body copy.
- Recommendation: `--text-micro` at least for the flag (or the kit status chip), `--text-caption` for the period, `--text-caption` in `--text-2` for any sentence that stays.
- Suggested command: `$impeccable typeset`

**[P1-5] Checkout errors are out of sight and not announced**
- Location: `PassModal.jsx:227`.
- Category: Accessibility
- Impact: after pressing "Get this pass" on a phone (button at about y 614), the failure line appears roughly 1,000 px further down the scrolling panel, with no `role="alert"`. A sighted traveller sees the button re-enable and nothing else; a screen reader hears nothing.
- WCAG: 4.1.3 Status Messages.
- Recommendation: render the error directly under the buy buttons with `role="alert"`, one sentence, and keep it until the next press.
- Suggested command: `$impeccable harden`

### P2 Minor

**[P2-1] About two screens of scroll for three plans on a phone**
- Location: the panel as a whole; card capped at 92dvh (69:513).
- Category: Responsive
- Impact: at 390x844 the card is 776 px and its content an estimated 1,650 px. The Year Pass, the comparison and the notes are all below the first screen. The comparison table (34 words, `:191` to `:225`) repeats every fact on the cards; "no subscription" is said four times (lead, `featOneOff` twice, `noSubNote`); small print runs to 7 sentences, 76 words.
- Recommendation: one presentation of the plans (cards or table, not both), one statement of "one payment, no renewal", the waiver and the VAT line as the only small print.
- Suggested command: `$impeccable distill`

**[P2-2] The close control scrolls away on a phone**
- Location: `.day-saved-close` absolutely positioned inside `.pass-card { overflow-y: auto }` (21:459, 69:513); `PassModal.jsx:90`.
- Category: Responsive
- Impact: once the traveller scrolls to compare, the only visible way out is the thin band of scrim; Escape is not available on a phone.
- Recommendation: a fixed dialog head (title and IconButton close) with only the body scrolling, per the carta-design dialog family.
- Suggested command: `$impeccable layout`

**[P2-3] The dialog paints the page ground, the table paints white**
- Location: `.day-saved-card` and `.pass-tier` on `--paper` (= `--surface-page`; 12-guided-trip.css, 21:356); `.pass-compare-wrap` on `--bg-card` (= `--surface`; 69:256); shadow `--shadow-2` (= `--elev-2`).
- Category: Theming
- Impact: a grey dialog with grey cards and one white table; the dialog contract is `--surface`, `--elev-3`, `--radius-sheet`.
- Recommendation: dialog on `--surface`, `--elev-3`, `--radius-sheet`; plan cards bordered on `--surface` at `--radius-card`.
- Suggested command: `$impeccable colorize`

**[P2-4] Brown wash on things that do not act**
- Location: `--wash` (= `--umber-50`) on `.pass-waiver` (21:335), `.pass-current` (21:319), `.pass-tier.current` (21:373).
- Category: Theming
- Impact: brown is the action and selection colour; here it tints a legal note and a status. For a guest it marks the Free card as "Your current plan" (`PassModal.jsx:66` defaults `current` to `'free'`).
- Recommendation: `--surface-sunken` for a quiet band; a status chip for the current plan, shown only to a signed-in traveller.
- Suggested command: `$impeccable colorize`

**[P2-5] Raw buttons and legacy classes instead of the kit**
- Location: `PassModal.jsx:90`, `:118`, `:166`; AnnouncementBar.jsx:117.
- Category: Implementation integrity
- Impact: four raw buttons with three borrowed class families; the close is not the house IconButton, the buy buttons carry 6 px and 10 px radii side by side.
- Recommendation: `IconButton` close, `Button` primary and secondary, a real link styled by the kit for the terms.
- Suggested command: `$impeccable polish`

**[P2-6] Waiver line breaks unevenly on touch**
- Location: `.auth-link` inline-flex with `min-height: var(--tap)` under `(pointer: coarse)` (69:389) inside running text (`PassModal.jsx:118`).
- Category: Responsive
- Impact: visible gap above "page. Read the terms of service" at p360 and on iPad.
- Recommendation: give the terms link its own line (or a block-level target) so the tap height does not stretch a text line.
- Suggested command: `$impeccable polish`

**[P2-7] Visual order differs from DOM order on a phone**
- Location: `.pass-tier.featured { order: -1 }` (69:154).
- Category: Accessibility
- Impact: Trip shows first, but focus and screen readers meet Free first.
- WCAG: 1.3.2 Meaningful Sequence, 2.4.3 Focus Order.
- Recommendation: order the plans in the DOM the way they should be read, or keep one order at every width.
- Suggested command: `$impeccable adapt`

**[P2-8] A guest's buy loses the intent**
- Location: `PassModal.jsx:70`, `usePaywall.jsx:265`.
- Category: Implementation integrity
- Impact: a guest who presses "Get this pass" is sent to sign in and the panel closes; the chosen tier and the reason are not carried through, so after signing in they start again.
- Recommendation: remember the tier and reason across sign-in and reopen the panel (or go straight to checkout) once signed in; say on the button that sign-in comes first.
- Suggested command: `$impeccable onboard`

### P3 Polish

**[P3-1] Two copies of the pass CSS**
- Location: 21:306 to 377 and 21:459 (literal timings, a stagger, a hover lift, three `@keyframes`, `vh`), all overridden by 69:133 to 155, 309 to 316, 513.
- Category: Implementation integrity / Performance
- Recommendation: delete the 21 copies when the panel is rebuilt (69's own header rule).
- Suggested command: `$impeccable polish`

**[P3-2] Literal sizes, radii and spacing; 0 type or radius tokens**
- Location: 10 literal font sizes in 21, 2 in 69; radii 6, 8, 10, 12, 18, 999 px; off-grid paddings (21:321, 337, 355, 372, 390); overlay `z-index: 320` (25-feature-pages.css:1765).
- Category: Theming
- Recommendation: `--text-*`, `--radius-*`, `--space-*`, `--z-modal`.
- Suggested command: `$impeccable typeset`

**[P3-3] Copy drift**
- Location: card "once, 12 months" against table "365 days"; a Trip Pass holder sees "Get this pass" on their own plan with no "extends your pass"; `pass.freePrice` carries a euro sign in six locales (unused).
- Category: Implementation integrity
- Recommendation: one way to say the period; "Extend" wording on the held plan; delete the unused key.
- Suggested command: `$impeccable clarify`

**[P3-4] The terms page ships with the panel in the main bundle**
- Location: `usePaywall.jsx:32` imports PassModal statically, which imports `TermsOfService.jsx` (491 lines, 27 KB source) statically.
- Category: Performance
- Recommendation: lazy-load the terms page (it opens on a press), and consider lazy-loading the panel itself.
- Suggested command: `$impeccable optimize`

## Patterns and systemic issues

- **Borrowed dialog parts.** The panel is the third surface to wear `.day-saved-*` and `.ai-plan-*`; every fix to those families (scrim, radius, close) has had to be overridden here in 69. A kit dialog would end that.
- **Legacy aliases everywhere.** 37 legacy-token uses across the pass rules, 0 role names. They resolve correctly, but `--paper` and `--wash` resolve to things a dialog should not use.
- **One door, two meanings.** `require()` means "paid may use this" for feature gates and "show the offer" for allowances; the second meaning silently fails for paid tiers.

## Positive findings

- One provider owns the modal, the frequency rules and the funnel; `pagehide` counts a dismissal once and skips the Stripe hand-off.
- Fails open on an unknown entitlement, with the metered surfaces enforced server-side.
- Focus trap with the close as initial focus, Escape on the shared stack, focus returned to the opener; Escape steps aside while the terms page is open.
- Every price through `formatPrice` and `formatMoney` in the reader's locale, cents, tabular; the free plan formatted the same way; the year value claim computed, not typed.
- Reason-specific headings name the moment instead of a cold pitch; buy buttons carry named `aria-label`s; the comparison table has a caption, a focusable scroll region and sticky headers.
- One primary inside the panel in every view; the recommended plan's buy button is inside the first phone screen; no horizontal scroll at 360.
- Reduced-motion branches exist for the panel's animations, and the scrim is already the 28 percent, no-blur scrim.
- No gradients, no hex in the pass rules.

## Recommended actions

1. **[P1] `$impeccable harden`**: route allowance triggers (`plans`, `ground`, `plansLow`) through a door that opens for paid tiers; name the dialog (`aria-labelledby` on the card, `h2` title); announce checkout errors next to the buttons.
2. **[P1] `$impeccable adapt`**: kit Buttons at `--tap`, one reading order at every width.
3. **[P1] `$impeccable typeset`**: flag, period and notes on the type scale and above the floors; type, radius and spacing tokens.
4. **[P2] `$impeccable distill`**: one plan presentation, one "no renewal" statement, small print cut to the waiver and VAT.
5. **[P2] `$impeccable layout`**: fixed dialog head with the close, scrolling body.
6. **[P2] `$impeccable colorize`**: dialog on `--surface` with `--elev-3`; no `--wash` on non-acting boxes; current-plan status only for a signed-in traveller.
7. **[P2] `$impeccable onboard`**: carry a guest's chosen pass through sign-in.
8. **[P3] `$impeccable optimize`**: lazy-load the terms page.
9. **`$impeccable polish`**: delete the 21 copies of the pass CSS and the unused `pass.freePrice`, then a final pass.

You can ask me to run these one at a time, all at once, or in any order you prefer.

Re-run `$impeccable audit` after fixes to see your score improve.
