# T460 Assessment A (design review): the pass panel, BEFORE

Surface: the pass picker (`PassModal.jsx`) and its doors: the header "Get a pass", the Account pass card, the
expiry banner, and every gate and offer that calls `usePaywall`. Mode: Persuade (a selling surface, so
conversion is weighed alongside usability). Read from app commit `9e7ab0d` so the working tree could move
underneath. Screenshots: `Execution/P11/T460-shots/before/before-pass-{guest,free}-{p360,phone,ipad,desk}.jpg`
and `measure-before.json`. The impeccable detector was not run or read.

Sources that win: PRODUCT.md, DESIGN.md, `.claude/skills/carta-design/SKILL.md`.

## Nielsen's 10 heuristics

| # | Heuristic | Score | Why |
|---|---|---|---|
| 1 | Visibility of system status | 2 | The busy label ("Opening checkout...") and the days-left line for a paying traveller are good. But a guest sees "Your current plan" on the Free card when they have no account at all, a free traveller who arrives from "No plans left" is not shown their balance in the modal, and a paying traveller who ran out presses "See passes" and gets no response of any kind. |
| 2 | Match with the real world | 2 | "Pass" and the ticket icon are the right metaphor. "Carta bot day plans" and "live web searches for events and openings" are internal names, not traveller words. The Trip Pass blurb promises "from first idea to the day you fly" while the pass lasts 30 days, which is shorter than the time most people plan a trip ahead. |
| 3 | User control and freedom | 3 | Close, Escape, a scrim click and the focus trap all work, and the terms open on top and come back. One loss: a guest who presses "Get this pass" has the modal closed under them and goes to sign-in, and the choice they made is gone when they come back. |
| 4 | Consistency and standards | 2 | Four labels for one door ("Get a pass", "See passes", "Extend my pass", "Get this pass"). The modal borrows other surfaces' classes (`day-saved-card`, `ai-plan-head`, `guide-next`, `auth-link`), so it inherits the page grey as its dialog fill, a blurred `rgba` scrim and an 18 px radius instead of the dialog family. The Year Pass button is a local `.pass-buy-quiet`, not the kit Button. The sparkle badge borrowed from the AI dialog codes the pass as an AI subscription. |
| 5 | Error prevention | 3 | The waiver comes before the buy buttons, buttons lock while busy, and the server refuses a pass that would run past three years. Missing: nothing tells a guest that buying needs an account first, and nothing tells a paying traveller whether a second pass adds days or replaces the one running. |
| 6 | Recognition rather than recall | 2 | The cards list only the AI allowance. What the gates actually sell (more than one saved trip, PDF, calendar and map exports, reading a booking, planning together) appears nowhere in the cards or the table, so a traveller opening from the header never learns it and one opening from a gate has to remember why they came. |
| 7 | Flexibility and efficiency | 2 | A gate opens the modal with a heading for its moment, which is good. But the paying traveller who ran out has no path at all, a guest has to sign in and then find the pass again, and the buy button does not name the amount, so the decision needs a look back up the card. |
| 8 | Aesthetic and minimalist design | 1 | About 250 to 300 words for a choice between two products (`measure-before.json`: 247 guest, 300 free at desktop). "No subscription" or "one-off" is said six times (lead, "once" twice, the one-off tick twice, the foot note). Price, plans and duration are each stated twice, once in the cards and again in a comparison table that adds nothing. Three legal statements, one of them a five-line paragraph above the prices. |
| 9 | Recognise, diagnose, recover from errors | 3 | The checkout failures are well written ("Could not open the checkout. Nothing has been charged."). Two slips: "Passes are not switched on for this server yet" is developer voice, and the dead button for paying travellers produces no message to recover from. |
| 10 | Help and documentation | 2 | The terms are one tap away. The three questions a one-off pass raises are unanswered on the panel: what happens to my saved trips when it ends, can I extend it, and does a second pass stack. |
| | **Total** | **22 / 40** | Acceptable, with significant work needed. The plumbing is sound; the panel says too much, sells the wrong thing and drops two kinds of buyer. |

No heuristic is marked n/a: every one applies to a purchase dialog.

## Design specificity verdict

Generic. Strip the brown and this is the three-column SaaS pricing template: a centred card, three plan columns,
a filled "Recommended" pill on the middle one, tick lists, then a feature comparison table under the cards, with
a sparkle icon in the head that reads as "AI upgrade". Nothing in it says Carta. Carta already owns the right
object twice over: the pass is a ticket (the header button carries `TicketIcon`), and Carta's signature object is
the receipt (head, hairline lines with figures right aligned in cents, a `--text` rule, the sum). A pass set as a
ticket or a short receipt ("Trip Pass, 30 days, you pay €6.99 once") would be on brand and would also be shorter.

Token and kit drift found in the CSS (`21-chat-passes.css` 302 to 462, `69-v6-account.css`, `12-guided-trip.css`
for the borrowed dialog):

- Dialog fill is `--paper` (the page grey `--surface-page`), not `--surface`; scrim is `rgba(26, 26, 26, 0.42)`
  with `backdrop-filter: blur(2px)` instead of `--text` at 28 percent with no blur; radius 18 px, not
  `--radius-sheet`. The comparison table is white on that grey, so the inner object is lighter than the dialog.
- Literal px font sizes (12.5, 13.5, 11.5, 10, 27, 24) and radii (6, 8, 10, 12) where tokens exist (Never 8).
- The "Recommended" flag is 10 px text (under the 11 px floor, Never 10) on a filled brown pill: brown spent on a
  label that neither acts nor is selected (Never 2). carta-design asks for a brown border plus a "Recommended"
  chip, which is the status chip, not an action fill.
- Tick icons at 11 px; the waiver and the current-pass line sit on `--wash` (umber 50), a brown tint as
  decoration.
- Disabled quiet button by `opacity: 0.4` (the kit's disabled is a sunken ground with `--text-3`).
- Two files fight over motion: 21 sets a 0.38 s scale rise, a staggered card cascade and a hover lift that
  animates `box-shadow`; 69 cancels them. The end state is correct, but by override.
- Modal heading is an `h3` and plan names `h4` in a dialog with no `h2`.
- Buy buttons are 38 px tall on a phone (`measure-before.json`: "Get the Trip Pass 264x38"), under `--tap`.

## Conversion analysis

**Friction.** The first thing a phone reader meets after the title is a five-line paragraph about losing a legal
right (p360 and phone shots, rows 4 to 9). Prices start below it. The buy button does not say the amount, so the
billed figure is read off the card, not the action. A guest pays the sign-in step with no warning and loses their
pick. A paying traveller who ran out meets a button that does nothing.

**Hierarchy.** On desktop the order is Free, Trip, Year with Trip bordered, which is the classic decoy layout and
reads fine. On a phone the Trip card is lifted first (`order: -1`), then the non-buyable Free card takes a whole
screen, and the Year Pass sits about two screens down under it, followed by a table that scrolls sideways inside a
dialog that scrolls down. Most phone readers will never see the Year Pass. The trust facts (VAT included, card or
iDEAL through Stripe, no recurring charge) are the last three lines, under the table, off screen on every phone.

**Decision load.** Two buyable options is the right number. The load comes from repetition: the same three facts
in cards and table, the one-off promise six times, and three legal lines. The Year Pass pitch "Costs less than 3
Trip Passes" makes the reader do arithmetic and lands on a weak claim: two Trip Passes cost €13.98, less than the
Year Pass at €14.99, so the Year Pass only pays at the third trip. For an audience that takes one or two trips a
year that is the honest answer, and the card should say it plainly rather than imply a bargain.

**Trust signals.** Present and good: VAT-inclusive prices, Stripe and iDEAL, no auto-renewal, prices in cents
through `formatMoney`, a computed Year Pass claim that cannot drift from the prices. Missing: what survives the
pass's end (are trips two and three kept, read-only, or lost), and whether buying again extends. For a one-off
product with an expiry, that is the question that decides the sale.

**Offered in the right places?** Mostly yes. The hard gates sit at moments of built value (export a finished plan,
save a second trip, share, import, run out of plans), soft offers are rate limited (once a session, a 30-day snooze,
never for payers), and the expiry reminder is a banner, not a modal. Three misses: the `celebrate` nudge fires on a
freshly planned, unsaved trip with the heading "Your trip is planned, now keep it", which implies keeping it needs a
pass when free keeps one trip; the header "Get a pass" shows to a Year Pass holder on every view; and the offers
inside the day planner are dead for payers (P0 below).

**One-off 30 days versus recurring.** Keep one-off. It fits a trip-shaped use, an audience that counts euros and
distrusts subscriptions, and it is a real difference from Wanderlog Pro (about $40 a year) and Roadtrippers ($36 to
$60 a year); it also stays clear of the EU and German subscription cancellation rules. What is wrong is the
length and the ladder, both owner calls: 30 days from purchase is shorter than a normal planning window (flights
are booked one to three months out), so the pass can die before the trip it was bought for; a pass that runs to the
trip's last day, or 60 days, would match the blurb's promise. And the Year Pass at 2.14 times the Trip Pass loses to
two Trip Passes; at €12.99 or €13.49 the line "costs less than 2 Trip Passes" becomes true and the annual tier
becomes the obvious upgrade the research favours, without pushing it on one-trip travellers. Recommending the Trip Pass
by default is honest for this audience; preselecting the Year Pass for someone extending or holding two or more
saved trips would follow the research where it fits.

## What works (keep these)

1. **The moment is named.** `REASON_COPY` gives each gate its own heading ("Your plan is ready to take with you",
   "A second trip needs a pass"), with a reassurance where work might seem at risk ("Your plan stays saved either
   way"). Gates sit at moments of value and soft offers follow strict frequency rules in one place (`usePaywall`).
2. **Honest numbers.** Limits are plain figures, prices are in cents through the one formatter and include VAT,
   the Year Pass claim is computed so it cannot lie, and the failure copy says nothing was charged.
3. **Sound plumbing.** Focus trap and Escape, a named `aria-label` per buy button, a busy state that blocks a
   double purchase, and a funnel that counts shown, dismissed and pagehide exits once each.

## Priority issues

### P0. Two dead ends in the funnel

**What.** (a) A paying traveller who has spent their allowance presses "See passes" and nothing opens.
`CreditChip.useCredit().openPasses` calls `paywall.require(why)`, and `require()` returns `true` for anyone who
pays, so the call sites in `CartaChatPlanner.jsx` (the footer "See passes" primary and the out-of-plans Button),
`AiDayPlanModal.jsx` (`plans`, `ground`, `plansLow`) and `DayPlannerTab.jsx` (`onOpenPass`) do nothing. The
`ai.eventsNeedPass` line also tells a Trip Pass holder that live search "is part of the Trip Pass". (b) A guest who
presses "Get this pass" has the modal closed and the sign-in sheet opened with no warning, and the chosen pass is
not resumed after sign-in.
**Why.** (a) loses the most valuable buyer, someone who already paid once and wants more, and reads as a broken
product. (b) loses the buyer who has made a decision a moment ago.
**Fix.** Treat those buttons as offers, not gates: open through `openPrices(reason)` (or a new `offer(reason)` that
opens for anyone), with paid-exhaustion headings ("You have used this pass's 60 plans") and a card that says what
buying does to the running pass ("Adds 30 days"). For a guest, label the action "Sign in to buy" (or one line above
the buttons), carry the tier through sign-in and reopen checkout for it.
**Command.** `/impeccable harden`

### P1. Legal and repetition before the price; about 300 words to choose between two things

**What.** The waiver paragraph (45 words) sits between the title and the prices; the VAT, no-subscription and
terms lines repeat at the foot; the comparison table restates the cards; "one-off" appears six times.
**Why.** The first sentence a phone reader meets is about losing a right; the trust facts that help land last and
off screen; the owner's "too wordy" is accurate.
**Fix.** One line under the buy button carries everything legal and trust: "Starts when you pay, which ends the
14-day withdrawal right. Prices include VAT. Card or iDEAL through Stripe. Terms". Keep the explicit consent on
Stripe's page as it is. Cut the comparison table, `pass.noSubNote`, `pass.legalNote` and the per-card one-off ticks
(the lead already says it). Target under 100 words in view. Have the owner confirm the shortened pre-contract line.
**Command.** `/impeccable distill`

### P1. The cards sell the AI quota, not what the gates sell

**What.** The feature lists and table carry only "Carta bot day plans" and "live web searches". The things that
make people press the gates (keep more than one trip, PDF, calendar and map exports, read a booking, plan
together) are never listed, and "Carta bot" and "live web searches for events and openings" are internal names.
**Why.** A traveller cannot buy what they are not shown, and a first-timer cannot value what they cannot decode.
**Fix.** One shared "Every pass includes" list in traveller words (keep every trip, take it with you as PDF,
calendar or map, read your booking emails, plan with friends), then the per-pass difference in plain numbers (how
long, how many AI day plans). Lead with the feature behind the reason the modal opened for. Say what happens at
the end of the pass.
**Command.** `/impeccable clarify`

### P1. On a phone the Year Pass is two screens down, and the buttons miss the tap floor

**What.** Phone order is Trip, Free, Year, then a sideways-scrolling table inside a vertically scrolling dialog;
the close is top right, out of thumb reach; buy buttons are 38 px; the phone surface is a centred dialog, not a
sheet.
**Why.** The second product is effectively invisible on the device most travellers use, and a nested scroller
plus a sub-44 px target is a one-hand failure.
**Fix.** A sheet on a phone. The two buyable passes as one choice (two equal option rows, Trip selected by
default, the selected state as tint plus mark), one primary under them that names the amount ("Pay €6.99"), Free
reduced to one status line ("You are on Free: 0 of 2 AI day plans left"), the legal and trust line under the
button. Everything at `--tap`.
**Command.** `/impeccable adapt`

### P2. Generic SaaS template, off-system tokens

**What.** Three-column plan cards, a filled brown "Recommended" pill at 10 px, tick lists, a sparkle AI badge, a
comparison table; dialog on the page grey with a blurred scrim; px font sizes and radii; a local quiet button;
disabled by opacity (details under the verdict above).
**Why.** It looks like every pricing page and not like Carta, and it breaks Never 2, 8 and 10.
**Fix.** Rebuild as Carta's own object, a ticket or short receipt per pass, on the kit (`Button`, status `Chip`,
`SheetShell` or the dialog family) and role tokens only; drop the sparkle; the recommended pass takes a brown
border and a status chip.
**Command.** `/impeccable normalize`, then `/impeccable polish`

## Persona red flags

**Casey, on a phone with one hand.** Opens the modal and reads a legal paragraph first. The close is top right.
The Year Pass is two screens down, under a Free card she cannot buy. The table scrolls sideways inside a page that
scrolls down. Both buy buttons are 38 px. Gives up before seeing the second option.

**Jordan, first time in Carta.** Does not know what a "Carta bot day plan" or a "live web search for events and
openings" is, and the sparkle reads as an AI subscription upsell. As a guest is told Free is "Your current plan"
without having an account. Presses "Get this pass", lands in sign-in, signs up, and is back in the app with no
pass picker and no idea where it went.

**Budget traveller counting euros.** Wants to know exactly what €6.99 buys and gets two AI counts. Plans two
months ahead and notices the "to the day you fly" promise does not fit 30 days. Does the Year Pass sum and finds
two Trip Passes (€13.98) are cheaper than the Year Pass (€14.99), against a card that hints otherwise. Cannot find
out whether trips two and three survive the pass ending, so does not buy. Likes "Prices include VAT" and "Nothing
has been charged", if they scroll that far.

**Paying traveller who ran out.** Presses "See passes" in the day planner: nothing. Is told live search "is part of
the Trip Pass" while holding one. Opens the modal from the header instead and reads "your pass starts as soon as the
payment goes through" with no word on whether a second pass adds days or replaces the current one. The Trip card
still says "Get this pass". If on a Year Pass, still sees "Get a pass" in the header on every screen.

## Minor observations

- The heading "Carta passes" has no verb and no number (carta-design Copy); something like "Pay once, plan the
  whole trip" would carry the promise the lead now carries.
- `PassExpiryBanner` uses `pass.current` without the one-day variant, so the last day reads "with 1 days left";
  the modal already switches to `pass.current1`.
- `pass.freePrice` holds a literal "€0" in an i18n string (Never 9); it has no reader in `src` and can go.
- `pass.errUnavailable` ("not switched on for this server yet") is developer voice.
- The `celebrate` offer fires before the trip is saved and says "now keep it", while saving the first trip is free.
- On iPad and at 360 px the terms link wraps onto its own line with a taller gap than the paragraph's leading.
- `.pass-tier.current` marks the current plan with `--wash`, a second selected look beside the one selected state.
- The modal's class names couple it to the day-saved dialog, the AI dialog and the auth forms: restyling any of
  those restyles the pass panel.
- The Account pass card is good: one balance line, a thin bar and one door; its "See passes" and "Extend my pass"
  labels should match whatever the modal's action becomes.
