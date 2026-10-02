# The first-run trip result

Design document, task T187 (mind-map T340), revised by T211 on 2026-10-02. Status: awaiting owner approval again. The owner approved the T187 text as written (T272, 2026-10-02), and the same day decided that Carta does not price flights; T273 then removed every Carta flight figure from the screens. This revision takes the flight estimates out of the receipt and puts the traveller's own typed fare in their place, and keeps everything else T187 designed. No code ships from this document until the owner approves the revision (register row T211-d); T099 (P6, price the trip) builds it, and `docs/ONBOARDING_AND_EMPTY_STATES.md` (T211) designs the ninety seconds before it.

This page specifies what a first-time visitor sees at the moment their first priced total appears: what the screen explains, what it deliberately leaves unexplained, and the one thing it asks them to do next. It is written under the carta-design skill, PRODUCT.md and DESIGN.md. Where this page and those disagree, those win.

## The moment this designs

A first-run result is the first time a visitor sees an itemised total for a trip: the bed, the food and the getting around, for a number of nights and a number of people, each line saying where its figure came from. Until P6 lands, that moment does not exist: the trip page shows a range per person and hands the visitor to another tool, the destination panel shows a per-day figure without the lines, and the planner's "Estimated total" arrives at the end of a six-step wizard. After T099 the trip page and the destination page show the total without asking anything first, priced from the defaults, and the planner shows the same component at its Finish step. That total is the first result, and it is the same component wherever it first appears.

Carta does not price flights. No flight figure of Carta's is on the receipt; the flight is a door under it, and the only flight line that can appear is one made of what the traveller typed.

The visitor arrives at the result from one of three doors, and the design has to hold for all three.

| Door | Route in | What they have told Carta |
|---|---|---|
| Trip page (JourneyPage) | A style card, a search result, a shared link | Nothing. Dates, people and stay style are defaulted |
| Destination page | A walk, an Explore card or a map pin | Nothing, or the stay style and lifestyle they set on Explore. Dates and people defaulted |
| Trip planner | The wizard's Finish step | Everything, over five steps |

The third door is the easiest and the rarest. The first two are where a stranger meets the number, and on both of them Carta has filled in every input for them. That is the fact the design turns on: the first result is made of assumptions, so the screen's job is to show the assumptions, not to hide them behind a confident total.

## What the first result is for

One thing: make the visitor believe the total is theirs. Not "a trip to Trieste costs about this much" but "a week in Trieste, on these dates, for two of us, costs this much on the ground, and here is each line". Everything that does not serve that belief is left off the screen.

The product's only asset is trust in its numbers (PRODUCT.md). A newcomer has no history with Carta to lend it trust, so the receipt has to earn it on the spot, line by line, by being traceable. Each line says what it is, where it came from and what it assumed. A line the reader cannot trace is a line they take on faith, and the receipt exists so that nobody has to.

## The receipt

The receipt is Carta's signature element and this screen is its best case. The structure is the one the carta-design skill fixes: a header naming the destination and the route in mono, one hairline-separated line per cost component with the figure right aligned in mono, a 2 px ink rule above the sum, the sum in mono at 34 px weight 500, and a tinted footer showing what one changed input would do to the total. Tokens come from DESIGN.md: the card is `--bg-card` with a `1px solid var(--rule)` border at 10 px radius, the header band is `--paper-dim`, hairlines inside are `--rule-soft`, the footer is `--accent-bg`, figures are `--mono` with `tabular-nums`, prose is `--ui`.

Lines run in the order the trip happens, the same chronological order the planner's receipt already uses, so a reader who has seen one Carta receipt can read every other one.

```
Trieste
4 to 11 May 2027, 7 nights, 2 people

Stay, 7 nights        private room, measured in        €462.00
                      Trieste from 1,204 listings
Food and getting      7 days x 2 x €31.40            ~ €439.60
around                national basket, est.
=======================================================
Total for 2 people                                 ~ €901.60
                                                €450.80 each

A dorm bed instead would be ~ €640.40. Set your dates to reprice.

Carta does not price flights, so none is in this total.
Add what you paid and it counts.            [ Add your fare ]
```

And the same receipt once the traveller has typed a fare, which is the only way a flight line exists:

```
Trieste from Charleroi
4 to 11 May 2027, 7 nights, 2 people

Your flight           Ryanair, CRL to TSF, 4 May      €117.96
                      what you paid, 2 people
Stay, 7 nights        private room, measured in        €462.00
                      Trieste from 1,204 listings
Food and getting      7 days x 2 x €31.40            ~ €439.60
around                national basket, est.
=======================================================
Total for 2 people                               ~ €1,019.56
                                                €509.78 each
```

The blocks above are wireframes, not copy to paste: the implementer reads the figures from the engine and the labels from the i18n keys. Three rules about them are fixed.

Nothing is rounded to look tidier. `€31.40` is the point and `€31` is a different product.

No flight figure of Carta's appears, ever, on any line or in any footer, with or without a tilde (PRODUCT.md, "The one rule the numbers follow"; T273). The flight line exists only when the traveller typed a fare, it is labelled as theirs in its second row, and it carries no tilde because it is not an estimate. The tilde and the `est.` tag stay for every other estimate: a line whose figure stands in from the national basket because the town has not been measured carries them, and the total inherits them, because a sum that contains an estimate is an estimate. A receipt where every line is measured has no tilde anywhere.

Each line's second row is its provenance in plain words: the number of listings the stay rate was measured from, the per-day figure the food line multiplies, the airline and the route on a typed fare. This is the `cost.stayMeasuredN` pattern CostSummary already uses, extended to every line. Where the engine has no measured figure and falls back to a national one, the second row says so once ("national basket, est.") and otherwise stays silent, as CostReceipt does today, so the receipt reads as a price and not as a disclaimer.

Under the sum, one small mono line gives the per-person figure. The group total is the sum because that is what a group pays; the per-person figure is there because that is how people compare.

## What is explained

The screen answers nine questions without being asked. These are the questions a stranger has at the moment the number appears, in the order they have them, and they are also the test script at the end of this page.

| Question | Where the answer sits |
|---|---|
| What is this number? | The header: destination, dates, nights, people, then the sum |
| Is the flight in it? | The flight sentence under the footer says no, and the door beside it says how to add yours; once added, the header names the airport and the flight line repeats it |
| When? | The dates in the header, with the date on a typed flight line |
| For how many people? | "2 people" in the header, "2 x" on every per-person line |
| What is in it? | One line per component; nothing is folded into "other" |
| What is not in it? | One sentence after the footer, see below |
| Which lines are guesses? | The tilde and `est.` on every figure standing in from a national basket |
| Why these dates and these people? | The orientation line above the receipt says Carta chose them |
| What do I do now? | The one primary button |

Three pieces of prose carry what the lines cannot.

The orientation line sits above the card, in `--ui` at body size, and is the only part of this screen that exists because the viewer is new. It says what was assumed and that the assumption is theirs to change. "Priced for 2 people and 7 nights at Trieste's own rates. Set your own dates and the total reprices." When the visitor set the dates themselves (the planner door, or a trip page they repriced), the line drops its second sentence and reads "Priced for 2 people, 4 to 11 May." It is prose, so it is never mono.

The flight sentence sits under the footer, in `--ink-soft` at label size, with the door beside it: "Carta does not price flights, so none is in this total. Add what you paid and it counts." and the secondary button "Add your fare". These are the `trip.flightNotPriced` and `trip.addOwnFare` strings T273 put in the planner, in six catalogues already, so the receipt and the planner say the same thing in the same words. The sentence appears once per receipt. It says the thing plainly because stating coverage is what makes the accurate lines believable. Once a fare is typed, the sentence and the door are replaced by the flight line in the receipt and nothing else changes.

The door opens one sheet, "Your flight": flying from (the `OriginPicker` list), airline, what you paid for the whole group, and the out and return days. That is where the departure airport is asked, once, and remembered in `choices.origin` as the planner does today; `docs/ONBOARDING_AND_EMPTY_STATES.md` has the reasoning. The sheet is prefilled on every later opening.

The exclusions sentence follows: "Not in this total: entry tickets, insurance, and anything you buy there." The list comes from what the engine does not price, and the implementer keeps it true for each trip; a cycling week that prices bike hire does not list bike hire here. Flights are not in this list because the flight sentence above it already says so.

## What is not explained

As much as what is. The first result shows a receipt, not a product tour, and every explanation that is not about the receipt is removed from this screen on purpose. None of the following appears on, over or beside the first result.

The rating, the hidden-gem badge, the cost gauge and the lifestyle tiers. These are vocabulary the visitor learns on the Explore cards and the destination page, not here. The receipt names the stay tier in a plain word ("private room") and does not teach the tier system.

Passes, the paywall and the account. Saving, sharing and exporting ask for an account at the moment they are used (App.jsx, the entry gate comment) and the first result is not that moment.

The map, the planners and the AI. The next action may lead there; the receipt does not describe them.

Coach marks, a modal, a tour, a "welcome" banner, confetti, a step counter, a progress bar. A first-run layer that sits on top of the screen is a tell that the screen does not explain itself. The orientation line is the whole first-run layer.

Data sources and licences. They live under Account, Data sources, and the per-line provenance is the receipt's own statement of source.

The rule for anything not on this list: if it is not needed to believe the total, it waits.

## The single next action

One primary button, `--accent` filled, 44 px, verb first: "Set your dates".

The reasoning. The first result is built on defaults, and dates are the default with the largest effect on the total and the one most likely to be wrong: the nights multiply every line, the bed rate is seasonal, and nobody travels on the week Carta picked unless they happen to be free. Asking the visitor to set their dates does two things at once: it corrects the most consequential assumption, and it makes the total move in front of them, which is the moment the number stops being Carta's and becomes theirs. The footer has already shown that one changed input moves the total; the button lets them change the one that matters most.

The button focuses the dates field in the input strip above the receipt (the search strip the carta-design skill describes: people, stay, dates, in one bordered row with mono micro labels; there is no airport cell, because the airport belongs to the flight door). It does not open a new page. The total reprices in place, figures update without jitter because they are tabular, and the orientation line drops its second sentence. Nothing else changes.

When the dates are already the visitor's own, the first-run primary is spent, and the button becomes the surface's ordinary primary: "Plan this trip" on the destination page (the existing `dest.planTrip` door) and "Save this trip" on the trip page. Those are outside this design; the point here is that there is never a second primary while "Set your dates" is showing.

Everything else on the screen that can be changed is a field, not a button: people and stay style are edited in the strip, and the strip is always visible because PRODUCT.md says the inputs are. The one exception is the flight door, which is a secondary button because it opens a sheet, and a secondary is not a second primary. "Change" links next to each header fact are not needed and are not added.

## Once, then never again

The orientation line and the expanded second rows are the only parts of this screen keyed to first run, and "first run" means the first priced total on this browser. A `carta.firstResultSeen` flag in localStorage is set when the receipt has rendered and the visitor has either changed an input or scrolled past the card. It is a per-viewer convenience and nothing depends on it: a blocked or cleared store means the visitor sees the first-run form again, which is the right failure.

After first run the receipt keeps every line and every figure, keeps the tilde and `est.` where a figure stands in, keeps the flight sentence and its door (or the typed flight line), keeps the exclusions sentence, and keeps the footer. The orientation line goes. The second rows collapse to the one fact each line needs to be traceable ("measured" or "national"; the per-day figure; "what you paid"), with the full provenance behind the InfoDot glossary that T193 brings to the planners. A returning visitor reads a receipt, not an explanation of one.

## Copy

Every string goes through the i18n keys in all six languages; none is built by concatenation. Sentence case, verb first, no terminal punctuation on labels and buttons, full stops on the three prose lines. No em dash and no en dash anywhere, and `stripDashes()` enforces it at build time. Date ranges are written with "to". None of the banned words. Labels in English, as the reference for the other five catalogues:

| Key | English |
|---|---|
| receipt.title | {city} |
| receipt.titleFrom | {city} from {originCity} (only when a typed fare names the airport) |
| receipt.sub | {from} to {to} {year}, {n} nights, {people} people |
| receipt.yourFlight | Your flight |
| receipt.yourFlightSub | what you paid, {people} people |
| receipt.stay | Stay, {n} nights |
| receipt.ground | Food and getting around |
| receipt.groundNational | national basket, est. |
| receipt.total | Total for {people} people |
| receipt.each | {eur} each |
| receipt.footerLater | A week later would be {eur}. Set your dates to reprice. |
| receipt.footerTier | A {tier} instead would be {eur}. Set your dates to reprice. |
| receipt.orientDefault | Priced for {people} people and {n} nights at {city}'s own rates. Set your own dates and the total reprices. |
| receipt.orientOwn | Priced for {people} people, {from} to {to}. |
| receipt.notIn | Not in this total: {list}. |
| receipt.setDates | Set your dates |

The flight sentence and its button are the existing `trip.flightNotPriced` and `trip.addOwnFare` keys; the sheet's fields are the existing `wizard.ownFlightOutLabel`, `wizard.ownFlightRetLabel` and `extras.ownFlight` keys plus the `OriginPicker` strings. The existing `prov.est` ("est."), `prov.estTitle`, `cost.stayMeasuredN`, `cost.stayNational` and `cost.stayRepaired` keys are reused for the second rows rather than duplicated. The footer shows `receipt.footerTier` when the dates are the defaults (the dates button is already asking for them) and `receipt.footerLater` once the dates are the visitor's own, so the footer always names an input the visitor has not yet touched.

## Layout

Phone first, at 380 px with no horizontal scroll. The card fills the content column with a 16 px gutter. The header band stacks the title over the sub line. Each line is a two-column grid: label and second row on the left, figure on the right, the figure never wrapping. The sum line is the same grid at 34 px. The footer is a full-width band inside the card's radius. The primary button sits directly under the card, full width on phone, and is the last thing before the fold on a 380 by 800 viewport; the three prose lines after the footer may fall below it, the button may not.

On desktop the card caps at 520 px and sits in the page's right column, beside whatever the surface shows on the left (the day-by-day on the trip page, the folds on the destination page). The button keeps its place under the card and does not float.

Every control is at least `--tap`. Focus is `outline: 2px solid var(--accent)` with an offset. The repricing transition on the figures is opacity only, under 300 ms, with a `prefers-reduced-motion` branch that sets it to none. The card is a `<section>` with an `h2` carrying the title; the lines are a `<dl>`, so a screen reader hears label then figure; the tilde is accompanied by the `prov.estTitle` text, not colour alone.

## Before you ship

The seven questions from the carta-design skill, answered for this screen.

No hex outside `:root`; every colour above is a token. No gradient, no second saturated hue: `--accent` on the button and the footer tint, nothing else. Ochre and teal do not appear, because there is no rating and no gem on this screen; `--danger` does not appear. Mono carries figures, dates, the per-day multiplier and the route code on a typed fare, and nothing else; the orientation line, the flight sentence and the exclusions sentence are prose in `--ui`. One primary button; the flight door is a secondary. The title carries a number (the dates and the people count in its sub line) and the button carries a verb. The thing removed: an earlier draft had a "Why this number" link above the receipt; the receipt is why this number, so the link was carrying nothing and is gone. The T211 revision removed five more lines (two flights, the bags, two transfers) that were figures Carta no longer stands behind.

## The test

The done condition is a first-run result tested on someone who has never seen the product. That needs a person, so it is an owner step (register row T187-b), and this is the protocol so it is run the same way each time.

Five participants who have never opened carta-europetravel.com and do not work on it. One at a time, ten minutes each, on a phone. Show them the screen (the wireframe above rendered on T099's preview build, or a printed mock of it before that) with the inputs defaulted and the orientation line showing. Give them twenty seconds without speaking, then ask, in this order, and write down the first answer without prompting:

1. What is this number?
2. Is your flight in it?
3. How many people is it for, and when?
4. Which of these lines would you trust least, and why?
5. Is there anything you would still have to pay for that is not here?
6. What would you do next?

Then say "do that" and record the first tap.

Pass when four of five say, in their own words, that the number is the cost of this trip on the ground for the people and dates shown (question 1), say the flight is not in it and that they could add their own (2), give the people count and the dates (3), name a line marked est. as the least certain and give the standing-in figure as the reason, or say the flight is the one thing missing (4), and name the primary button or tap it first (6). Question 5 has no pass mark; its answers go into the exclusions list if they name something true. Fewer than four passes on any question is a design fault in that question's row of the "What is explained" table, and the fix goes there, not into more explanation elsewhere.

Record the time from the screen appearing to the participant's answer to question 1. That is the measurement T099 carries forward: the first-run result is working when a stranger can say what the number is inside fifteen seconds.
