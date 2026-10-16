# T460 Assessment A (design review): the pass panel, AFTER

Surface: the rebuilt pass panel (`PassModal.jsx`, `71-pass.css`) and its doors and side effects: `usePaywall.jsx`
(quota gates now open the panel for payers, a guest's pick survives sign-in), `useEntitlement.js` (subscription
state), `AnnouncementBar.jsx`, `AppHeader.jsx`, the pass sections of `TermsOfService.jsx`, the `pass.*` strings in
`en.js` (German checked in the `-de` shots), `pricing.js`, and the Stripe side (`checkout`, `stripe-webhook`,
`billing`, `_shared/passes.mjs` `waiverText`). Mode: Persuade. Judged from the working tree on `p11-pass`
(uncommitted), the screenshots in `Execution/P11/T460-shots/after/` and `measure-pass-after*.json`. The impeccable
detector was not run or read. Scored independently; the BEFORE assessment (22/40) was read for its findings only.

Sources that win: PRODUCT.md, DESIGN.md, `.claude/skills/carta-design/SKILL.md`.

## Nielsen's 10 heuristics

| # | Heuristic | Score | Why |
|---|---|---|---|
| 1 | Visibility of system status | 3 | A Trip Pass holder now reads "Your Trip Pass runs until 26 Nov 2026" first, a subscriber reads the renewal date, the button keeps its width while busy. Gaps: a free traveller is told "Free keeps 2 Carta bot plans" whatever they have left (the Account card says "1 of 2"); the Account balance for a renewing plan still counts down "N days left" as if it ends. |
| 2 | Match with the real world | 2 | The money words are now concrete ("a year", "once", "60 days, no renewal", "Add 60 days"). But "plan" carries three meanings on one screen: the heading "Choose your plan", the product "Yearly plan", and the AI unit "300 Carta bot day plans" / "Free keeps 2 Carta bot plans". The header door says "Get a pass" and the panel sells a "plan". "Carta bot" and "live searches for events and openings" are still internal names. |
| 3 | User control and freedom | 2 | Inside the panel control is good: close, Escape, scrim, focus trap, terms on top and back, a guest's pick kept through sign-in. Outside it the yearly plan has no exit: the card says "cancel anytime", the Stripe checkbox says "which I can do at any time in Account", the terms name an Account button "Cancel yearly plan", and no such row exists (`lib/billing.js` has no caller; `AccountPanel.jsx` is untouched). A renewing charge with no visible way out is the most serious control failure a paid product can have. |
| 4 | Consistency and standards | 3 | Now on the kit: `Button`, status `Chip`, `IconButton`, the shell dialog family (28 percent `--text` scrim, no blur, `--radius-sheet`, `--elev-3`), the one selected state (tint, brown edge, tick), radio semantics. Names still drift across doors: "Get a pass", "See passes", "Extend my pass", "Choose your plan", "Yearly plan", and the FAQ still says "Year Pass". |
| 5 | Error prevention | 3 | The server refuses a second live subscription, the guest is told "Sign in to continue" before any money talk, a Trip holder picking Trip reads "Add 60 days, €6.99". Missing: a Trip holder offered the yearly plan is not told whether the days left carry over (they do, `grant_pass` stacks); a subscriber who has cancelled is offered "Start yearly plan" (a second subscription) instead of "Resume"; the panel says 60 days while the server grants 30 until migration 053 is pasted. |
| 6 | Recognition rather than recall | 3 | "What you get" now names what the gates sell (exports, every trip saved, planning together, reading bookings) and leads with the line behind the reason the panel opened. The allowance difference between the two plans (300 vs 60 plans, 120 vs 40 searches) is only visible by toggling, never side by side. |
| 7 | Flexibility and efficiency | 3 | The out-of-plans doors in the chat planner and the day planner open for payers now; the guest returns to the plan they chose; the button names the amount; arrow keys move the choice. A Trip holder who pressed "Extend my pass" lands on the yearly plan and needs one more tap to reach "Add 60 days". |
| 8 | Aesthetic and minimalist design | 3 | About 105 words in view (104 to 106 in `measure-pass-after.json`) against 247 to 300 before; one primary; the comparison table, the sparkle, the six "one-off" repeats and the pre-price waiver paragraph are gone. Still three small-print lines under the primary (free line, keep note, legal line), and the free line partly repeats the list. |
| 9 | Recognise, diagnose, recover from errors | 2 | `errSubscribed` is well written. But while Stripe is not live, the line every buyer will meet is still `pass.errUnavailable`, "Passes are not switched on for this server yet", developer voice. A subscriber is shown the small print "One payment, no renewal" (the `legalTrip` branch), which is false for them. `ai.eventsNeedPass` still tells a holder whose searches ran out that live search "comes with a pass". The `-ERR` shots show the Account page with no panel open, so the in-panel error state is not evidenced. |
| 10 | Help and documentation | 2 | The terms are one tap away and now describe the subscription, the cancel route and the renewal refund; "Your trips stay saved when a pass ends" answers the question the BEFORE review called decisive. But the in-app FAQ (`account.faq13A`, all six languages) still says the Trip Pass runs 30 days and that both passes are "a one-off payment, not a subscription". The help text contradicts the product it documents. |
| | **Total** | **26 / 40** | Good inside the panel, held back by what surrounds it: a promised cancel route that does not exist, and copy elsewhere that still describes the old product. |

No heuristic is n/a: each applies to a purchase dialog that now sells a subscription.

## Design specificity verdict

Competent and on-system, generic in shape. Two radio plan cards, a tick list, one full-width primary and fine print
is the standard mobile paywall (the same anatomy as most subscription apps). It is far better than the three-column
SaaS template it replaced, and Carta's own mark shows in the details rather than the object: the billed amount set
large in tabular figures with the monthly figure small and prefixed "About", "60 days, no renewal" as a fact line,
and "Add 60 days, €6.99" for a holder. It is not the ticket or receipt object the BEFORE review pointed to; that is
an acceptable trade for a two-option choice that must decide in one look, and not worth a redesign now.

Token and kit check of `71-pass.css`:

- Roles only, no hex, no blur, no gradient; type through `--text-*` steps; spacing on `--space-*`; one border per
  object; reduced motion handled. The 21 and 69 overrides that fought over motion are deleted.
- Small literals where a token exists or the scale says otherwise: `.pass-plan-mark` 22 px with a 1.5 px border and
  `margin-top: 2px`, `.pass-plan-body` `gap: 2px`, `max-width: 520px`. `.pass-title` is `--text-title` at weight 700
  (the scale gives title 600) with `letter-spacing: -0.01em` (reserved for headline and display).
- The phone surface is a bottom sheet in layout but not in behaviour: no grab handle, and it arrives with
  `shell-dialog-in` (a small rise and fade) rather than the sheet rise (`shell-sheet-in`) the shell already has.
- The selected plan's radio mark is a filled `--action` disc with a tick; that is a mark, not a fill behind a label,
  so it is within the one-selected-state rule.
- The Terms link is 14 px tall (`measure`: "Terms 14"). It is an inline link inside a sentence, so WCAG 2.5.8 exempts
  it, but carta-design asks for `--tap` on anything interactive.
- In every phone and desktop shot the close button wears the 2 px brown focus ring on open, the most saturated
  object after the primary. This is probably the harness (programmatic focus with no prior pointer input), but
  check on a real phone: if `:focus-visible` matches after a tap, initial focus should go to the heading
  (tabindex -1) instead.

## Conversion analysis

**Friction.** Much lower. The decision fits one phone screen at every width measured (sheet 708 to 726 px, primary
in view everywhere). The guest pays the sign-in step knowingly ("Sign in to continue") and comes back to the plan
they chose, though they press the primary a second time after sign-in (fine, and arguably good for consent). The
remaining friction is for holders: "Extend my pass" and the expiry banner both open on the yearly plan, so the
person who asked to extend meets "Start yearly plan, €14.99" first.

**Hierarchy.** Heading, (holding line), the two plans, what you get, the primary, small print. Correct order. The
yearly plan is first, carries the Recommended chip and is preselected: three pushes in one direction.

**Decision load.** Two options and one primary, the right number. The real differences are duration, renewal and
price (on the cards) and the allowance (only in the list, and only for the selected plan). Putting "300 day plans" /
"60 day plans" on the card note would let a reader compare without toggling, at a cost of two words per card.

**Pricing psychology.**
- *Annual anchoring.* Order, chip and default all favour the yearly plan, and the panel no longer makes the false
  "costs less than 3 Trip Passes" claim. Good: the honest arithmetic (two Trip Passes €13.98, the yearly plan
  €14.99) is left to the reader instead of being spun. For this audience (counts euros, distrusts subscriptions,
  one or two trips a year) a subscription as the default is a real trust bet; it is the owner's call and should be
  measured (pick rate per tier, and the share of yearly buyers who cancel inside the first month).
- *Billed amount versus monthly.* Done right: €14.99 large, "a year" beside it, "About €1.25 a month" small under
  it, never instead of it (`monthlyCents`, 1499 / 12 = 124.9 rounded, honestly prefixed "About"). The button names
  the billed amount. Keep exactly this.
- *The add-days label.* "Add 60 days, €6.99" is the best line in the panel: it answers "does a second pass stack or
  replace?" in the action itself. It only appears when the holder switches to Trip; the yearly equivalent has no
  such line ("adds a year after your Trip Pass" would do it).

**Trust signals.** Present: VAT included, renewal said three times before payment (card note, small print, Stripe
checkbox), "cancel anytime", "Your trips stay saved when a pass ends", cents through `formatPrice`. Lost: "card or
iDEAL through Stripe"; for Dutch buyers iDEAL is a trust and conversion fact, worth three words back. Broken: the
"cancel anytime" promise has no door in the product, and the FAQ contradicts the panel. A budget traveller who
checks either before paying will not pay.

**Paying users who ran out.** The BEFORE P0 is fixed: `require()` now opens the panel for payers on `plans`,
`ground` and `plansLow`. A Trip holder gets a real offer. A yearly subscriber gets an honest dead end ("Your allowance
refills when the plan renews on {date}") with a false legal line under it (P1 below); there is no top-up product,
which is a pricing decision, not a design bug.

## Legal sufficiency (EU consumer law): what the panel and checkout now do, and what a lawyer must review

What is in place:

- **Price and renewal disclosure before the order** (CRD Art. 6(1)(e) and (o), Art. 8(2)): total price including VAT,
  "a year", "Renews yearly, cancel anytime" on the card, "Renews at €14.99 a year until you cancel" in the small
  print, and the same in the Stripe checkbox text. Stripe's own page shows the recurring price next to its button.
  Adequate in substance.
- **Withdrawal waiver**: the Stripe `terms_of_service` checkbox carries an express request to start at once and an
  acknowledgement that the 14-day right is lost (`waiverText`), recorded on the grant (`p_consent_tos`). The terms
  explain it and add a voluntary 14-day unused refund, extended to each renewal. Good practice.
- **Trip Pass**: one-off, "60 days, no renewal". Nothing new to review beyond what the one-off pass already had.

What must be reviewed by a lawyer before the yearly plan goes live (none of these can be settled in code review):

1. **Tacit yearly renewal.** Germany (§309 Nr. 9 BGB, since March 2022) and the Netherlands (art. 6:236 sub j BW)
   restrict renewal clauses in consumer terms: after the first term a contract may extend only for an indefinite
   period that the consumer can end with at most one month's notice. "Renews for another year at the same price on
   each anniversary" (terms, "What a pass buys") may be unenforceable there, which would mean pro-rata refunds after
   month 13. France (Code de la consommation L215-1) requires a renewal reminder one to three months before the
   date. Decide the structure per market (monthly-cancellable after year one with pro-rata refund, or renewal
   reminders, or both); Stripe can send upcoming-renewal emails.
2. **The cancellation button** (Germany, §312k BGB). Required for online subscriptions: a clearly labelled button
   ("Verträge hier kündigen" or equally clear), a confirmation page, a confirmation of receipt by email with the
   date the contract ends. Whether it may sit behind a login is contested; a lawyer should say. Today there is no
   button at all (P0 below).
3. **The waiver bundled with terms acceptance.** One checkbox carries both the ToS acceptance and the
   immediate-performance request. Some regulators and German courts expect the waiver consent to be separate and
   specific. Also confirm whether Carta's paid features are "digital content" (Art. 16(m) waiver applies) or a
   "digital service" (Art. 16(a): the right ends only on full performance; before that a withdrawing consumer owes a
   proportionate amount). An AI planner that stores and processes the traveller's data reads more like a service.
4. **Confirmation on a durable medium** (CRD Art. 8(7)(b)): the confirmation after purchase must record the waiver
   consent. Stripe's default receipt does not; a Carta confirmation email or a Stripe receipt footer carrying the
   consent sentence is needed.
5. **The order button wording** on Stripe's page in German subscription mode (§312j(3) BGB: "zahlungspflichtig
   bestellen" or an unambiguous equivalent). Stripe controls the label; the lawyer should say whether Stripe's
   German subscription label suffices.
6. **"Starts at once, which ends the 14-day withdrawal right"** states as fact what is a consequence of the
   traveller's consent at checkout. "Starts at once; by agreeing at checkout you give up the 14-day withdrawal
   right" is more accurate at similar length.
7. **Misleading-practice risk** (UCPD): the FAQ in six languages says the passes are not a subscription and the
   Trip Pass is 30 days. Fix before anything is sold (P1 below); no lawyer needed for that one.

## What works (keep these)

1. **One look, one action.** About 105 words instead of 250 to 300; one primary that names the amount; the legal
   and trust text moved under the button; Free reduced from a card to a line; the whole decision inside one phone
   screen at 360 px with the primary in the thumb zone.
2. **Honest money presentation.** The billed amount large, the monthly figure small and "About", the renewal said
   three times before payment, "Add 60 days, €6.99" for a holder, "Your trips stay saved when a pass ends". No
   arithmetic claim the prices cannot back.
3. **The funnel holes closed, on the kit.** Quota doors open for the payer who ran out, a guest's pick survives
   sign-in (sessionStorage, through a Google redirect), the header chip and the expiry banner step aside for a
   renewing plan, the panel and its stylesheet load lazily, and the panel is built from `Button`, `Chip`,
   `IconButton` and the shell dialog with real radio semantics and arrow keys.

## Priority issues

### P0. "Cancel anytime" has no door: the yearly plan cannot be cancelled in the product

**What.** The plan card says "cancel anytime", the Stripe checkbox says "which I can do at any time in Account", and
the terms describe an Account button "Cancel yearly plan" with resume and Stripe's billing page. `lib/billing.js`
and the `billing` function exist, but nothing calls them: `AccountPanel.jsx` has no subscription row, no cancel, no
resume, no portal link, and for a yearly subscriber `canUpgrade('year')` hides even the pass button. The Account
balance shows "N days left" for a plan that renews.
**Why.** A renewing charge the traveller cannot stop from the product breaks the promise made three times before
payment, fails §312k BGB outright, and is the fastest way to lose the trust PRODUCT.md calls the only asset.
**Fix.** Before Stripe goes live: an Account row for the yearly plan ("Renews 3 Oct 2027" / "Ends 3 Oct 2027"), a
"Cancel yearly plan" secondary with an inline confirm (one sentence, safe button first), "Resume" while cancelling,
and "Card and invoices" opening the portal, all through `lib/billing.js`, in six languages. Add the confirmation
email of the cancellation. A lawyer decides whether a door outside the login is also needed. In the panel, a
cancelling subscriber should see "Resume yearly plan" instead of the choice.
**Command.** `/impeccable harden` (a new task naming `AccountPanel.jsx`, which T460 did not declare).

### P1. Copy around the panel still describes the old product, and one line is false

**What.** (a) `account.faq13A`, all six languages: Trip Pass "over 30 days", "Both are a one-off payment, not a
subscription", "Year Pass". (b) A subscriber sees the small print `pass.legalTrip`, "One payment, no renewal",
because the branch is `isRecurring(pick) && !subscribed ? legalYear : legalTrip`; with nothing for sale there should
be no purchase small print at all, only the terms link. (c) `ai.eventsNeedPass` tells a holder whose searches ran
out that live search "comes with a pass". (d) `pass.errUnavailable` is developer voice and is the line every buyer
sees until Stripe is live. (e) `pricing.js` header still argues "two trips and it pays for itself", which the prices
contradict (2 x 6.99 = 13.98 < 14.99); `TermsOfService.jsx` line 20 comment still says "never a subscription".
**Why.** Help text that contradicts the panel, and a false statement shown to a paying subscriber, are misleading
under the UCPD and undo the trust the panel earns.
**Fix.** Rewrite the FAQ answer from `TIERS` in six languages (60 days, one payment; yearly plan, renews, cancel in
Account); render no legal line when `subscribed`; split `ai.eventsNeedPass` for holders ("You have used this pass's
live searches"); `errUnavailable` to "Payments are not open yet. Nothing has been charged."; fix the two comments.
**Command.** `/impeccable clarify`

### P1. Legal review is a gate before the yearly plan sells

**What.** The seven items under "Legal sufficiency": tacit renewal in DE and NL, the French renewal reminder, the
§312k button, the bundled waiver checkbox, digital content versus service, the durable-medium confirmation, the
German order-button label.
**Why.** Each one can make the renewal clause unenforceable or the waiver void, which turns every yearly sale into a
refund liability. The owner is in the Netherlands, where art. 6:236 j BW applies directly.
**Fix.** Owner books the review with the panel copy, `waiverText`, the terms section and the checkout flow in hand.
Engineering prep that does not wait for the answer: turn on Stripe's upcoming-renewal emails, and put the waiver
sentence into the purchase confirmation.
**Command.** None; owner row. Follow-up implementation via `/impeccable harden`.

### P2. "Plan" means three things, and the products have two naming systems

**What.** "Choose your plan", "Yearly plan", "300 Carta bot day plans a year", "Free keeps 2 Carta bot plans", while
the header says "Get a pass", Account says "Your pass" and "Extend my pass", and the keep note says "when a pass
ends". "Carta bot" and "live searches for events and openings" remain internal names.
**Why.** Jordan, the first-timer, cannot tell the product from its unit. The heading, the product name and the
allowance all compete for one word.
**Fix.** Keep "pass" for the product family (header, Account, banner) and name the units by what they do: "AI day
plans" or "days planned for you", "live event searches". Head the panel with the moment or a verb plus number ("Pick
how long you plan for" is one option; let the owner choose). Turn the free line into status: "1 of 2 free AI day
plans left, one saved trip".
**Command.** `/impeccable clarify`

### P2. Holders land on the subscription and are not told what happens to the days they hold

**What.** A Trip holder from "Extend my pass" or the expiry banner opens on "Start yearly plan, €14.99" with no word
on the remaining days (they stack). A cancelling subscriber is offered a second subscription instead of resume. The
allowance difference is not on the cards.
**Why.** The person who asked to extend is the warmest buyer in the funnel; a default they did not ask for, with an
unanswered "do I lose my 41 days?", invites the close button.
**Fix.** Preselect Trip when `reason === 'expiring'` or the door was "Extend"; keep yearly as the default elsewhere.
Under the yearly card for a Trip holder: "Starts after your Trip Pass, on {date}" (or "adds a year to your {n}
days"). Put the plan count on each card note ("60 day plans"). Resume for cancelling subscribers (with P0).
**Command.** `/impeccable harden`

## Persona red flags

**Casey, phone, one hand.** Much better: everything in one screen, the primary in the lower half, 44 px close and plan
rows. Remaining: no grab handle, so a swipe down does nothing; the close is still top right (sticky, at least); the
Terms link is 14 px tall; in German at 360 px the legal line sits below the fold (scroll height 792 against 740).
On a real phone, check the close does not wear the brown focus ring after a tap.

**Jordan, first time in Carta.** Pressed "Get a pass", got "Choose your plan", is offered a "Yearly plan" and reads
"300 Carta bot day plans". Does not know a Carta bot, nor whether a day plan and a yearly plan are related. "Sign in
to continue" is clear, and the pick is waiting after sign-in.

**Budget traveller counting euros.** Likes "€6.99 once, 60 days, no renewal" and "your trips stay saved". Notices the
subscription is preselected. Does the sum: two Trip Passes are €13.98, the yearly plan €14.99, and the panel no
longer pretends otherwise. Then checks how to cancel before subscribing: Account has no cancel, the FAQ says there is
no subscription at all. Buys the Trip Pass or nothing. Misses "iDEAL" if Dutch.

**Paying traveller who ran out.** Trip holder: the door now opens (fixed), "Your Trip Pass runs until 26 Nov 2026",
yearly preselected with no word on the days held; switching to Trip shows "Add 60 days, €6.99", which is exactly
right. In the day planner the live-search note still says it "comes with a pass". Yearly subscriber: told honestly
the allowance refills on the renewal date, then reads "One payment, no renewal" under it, which is false.

## Minor observations

- `useEntitlement` counts `incomplete` as live: a buyer whose first payment failed or awaits 3DS is shown "already
  active" and cannot retry from the panel; check what `pass_can_buy` treats as subscribed.
- The panel promises 60 days while the server grants 30 until migration 053 is pasted (`_OPEN-pass-subscription.md`
  step 1 says so). Paste 053 before, never after, any deploy that ships this panel with Stripe live.
- `pass.tripBlurb` ("from first idea to the day you fly"), `pass.yearBlurb`, `pass.freeBlurb` and `blurbKey` have no
  reader in `src` any more; remove or reuse.
- `pass.yearNote` "cancel anytime" is true only with the P0 row in place, and "anytime" may read as "with a refund";
  "cancel any time before it renews" is more exact.
- `pass.freeLine` "Free keeps 2 Carta bot plans" reads oddly ("keeps"), and is the same figure whether 2 or 0 are left.
- The desktop Trip card has a tall empty lower half beside the yearly card; the plan count on the note (P2) fills it
  with something useful.
- The renewal date line ("Your yearly plan renews on {date}") and the Account "N days left" can disagree when a Trip
  Pass stacked under the year: access runs past Stripe's renewal date. Harmless for the traveller; worth one test.
- `.pass-adds-title` as an `h3` under the `h2` keeps the heading order; good.
- PassExpiryBanner still uses `pass.current` without a one-day variant ("1 days left"), carried from BEFORE.
- Before shipping, answer carta-design's seven questions; on question 7 the candidate to remove is the keep note's
  duplication with "Every trip you plan, saved" in the list.
