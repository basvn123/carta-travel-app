# The first-run trip result

Design document, task T187 (mind-map T340). Status: awaiting owner approval. No code ships from this document until the owner says so; T099 (P6, price the trip) builds it, T211 (P12, onboarding and empty states) owns the ninety seconds before it.

This page specifies what a first-time visitor sees at the moment their first priced total appears: what the screen explains, what it deliberately leaves unexplained, and the one thing it asks them to do next. It is written under the carta-design skill, PRODUCT.md and DESIGN.md. Where this page and those disagree, those win.

## The moment this designs

A first-run result is the first time a visitor who has not yet given Carta a departure airport sees a total that includes a flight from that airport. Until P6 lands, that moment does not exist: the trip page shows a range per person without flights and hands the visitor to another tool, the destination panel prices from the app's default origin rather than theirs, and the planner's "Estimated total" arrives at the end of a six-step wizard. After T099 the trip page asks for the airport once, remembers it, and shows a total from that airport. That total is the first result, and it is the same component wherever it first appears: the trip page, the destination page, or the planner.

The visitor arrives at it from one of three doors, and the design has to hold for all three.

| Door | Route in | What they have told Carta |
|---|---|---|
| Trip page (JourneyPage) | A style card, a search result, a shared link | The airport, when the page asked. Dates, people and stay style are defaulted |
| Destination page | An Explore card or a map pin | The airport. Dates default to the cheapest week; people and stay style defaulted |
| Trip planner | The wizard's Finish step | Everything, over five steps |

The third door is the easiest and the rarest. The first two are where a stranger meets the number, and on both of them Carta has filled in most of the inputs for them. That is the fact the design turns on: the first result is mostly made of assumptions, so the screen's job is to show the assumptions, not to hide them behind a confident total.

## What the first result is for

One thing: make the visitor believe the total is theirs. Not "a trip to Trieste costs about this much" but "a week in Trieste, from my airport, on these dates, for two of us, costs this much, and here is each line". Everything that does not serve that belief is left off the screen.

The product's only asset is trust in its numbers (PRODUCT.md). A newcomer has no history with Carta to lend it trust, so the receipt has to earn it on the spot, line by line, by being traceable. Each line says what it is, where it came from and what it assumed. A line the reader cannot trace is a line they take on faith, and the receipt exists so that nobody has to.

## The receipt

The receipt is Carta's signature element and this screen is its best case. The structure is the one the carta-design skill fixes: a header naming the destination and the route in mono, one hairline-separated line per cost component with the figure right aligned in mono, a 2 px ink rule above the sum, the sum in mono at 34 px weight 500, and a tinted footer showing what one changed input would do to the total. Tokens come from DESIGN.md: the card is `--bg-card` with a `1px solid var(--rule)` border at 10 px radius, the header band is `--paper-dim`, hairlines inside are `--rule-soft`, the footer is `--accent-bg`, figures are `--mono` with `tabular-nums`, prose is `--ui`.

Lines run in the order the trip happens, the same chronological order the planner's receipt already uses, so a reader who has seen one Carta receipt can read every other one.

```
Trieste from Charleroi                         CRL > TSF
4 to 11 May 2027, 7 nights, 2 people

Flight out            Ryanair, CRL to TSF, 4 May      ~ €58.98
                      2 x €29.49, est.
Cabin bags            2 x 10 kg                          €0.00
Airport to city       bus 51, 2 x €4.30                  €8.60
Stay, 7 nights        private room, measured in        €462.00
                      Trieste from 1,204 listings
Food and getting      7 days x 2 x €31.40              €439.60
around
City to airport       bus 51, 2 x €4.30                  €8.60
Flight home           Ryanair, TSF to CRL, 11 May     ~ €64.98
                      2 x €32.49, est.
=======================================================
Total for 2 people                                 ~ €1,042.76
                                                €521.38 each

A week later would be ~ €986.20. Set your dates to reprice.
```

The block above is a wireframe, not copy to paste: the implementer reads the figures from the engine and the labels from the i18n keys. Three rules about it are fixed.

Nothing is rounded to look tidier. `€29.49` is the point and `€29` is a different product. Cabin bag at `€0.00` is a real line, because a reader who flies low-cost expects to be charged for it and the zero is information.

Every flight figure carries the tilde and the `est.` tag, because since 2026-10-01 no fare harvest is live and every flight price is a frozen snapshot shown as an estimate (PRODUCT.md, "The one rule the numbers follow"). The receipt does not whisper this in a footnote; the tilde sits on the figure where the eye lands, and the total inherits it, because a sum that contains an estimate is an estimate.

Each line's second row is its provenance in plain words: the carrier and the route, the bus number, the number of listings the stay rate was measured from, the per-day figure the food line multiplies. This is the `cost.stayMeasuredN` pattern CostSummary already uses, extended to every line. Where the engine has no measured figure and falls back to a national one, the second row says so once ("national figure, not measured in Trieste") and otherwise stays silent, as CostReceipt does today, so the receipt reads as a price and not as a disclaimer.

Under the sum, one small mono line gives the per-person figure. The group total is the sum because that is what a group pays; the per-person figure is there because that is how people compare.

## What is explained

The screen answers nine questions without being asked. These are the questions a stranger has at the moment the number appears, in the order they have them, and they are also the test script at the end of this page.

| Question | Where the answer sits |
|---|---|
| What is this number? | The header: destination, route, dates, nights, people, then the sum |
| Where does the flight leave from? | The header names the airport in words and the route in mono; the flight lines repeat it |
| When? | The dates in the header, with the date on each flight line |
| For how many people? | "2 people" in the header, "2 x" on every per-person line |
| What is in it? | One line per component; nothing is folded into "other" |
| What is not in it? | One sentence after the footer, see below |
| Which lines are guesses? | The tilde and `est.` on every estimated figure, and one sentence on flights |
| Why these dates and these people? | The orientation line above the receipt says Carta chose them |
| What do I do now? | The one primary button |

Three pieces of prose carry what the lines cannot.

The orientation line sits above the card, in `--ui` at body size, and is the only part of this screen that exists because the viewer is new. It says what was assumed and that the assumption is theirs to change. "Priced from Charleroi for 2 people on the cheapest week Carta found. Set your own dates and the total reprices." When the visitor set the dates themselves (the planner door, or a trip page they repriced), the line drops its second sentence and reads "Priced from Charleroi for 2 people, 4 to 11 May." It is prose, so it is never mono.

The flight sentence sits under the footer, in `--ink-soft` at label size: "Flight prices are Carta's estimates from past fares, not live quotes. Check the airline before you book." It appears once per receipt, not once per line. It says the thing plainly because stating coverage is what makes the accurate lines believable.

The exclusions sentence follows it: "Not in this total: entry tickets, insurance, and anything you buy there." The list comes from what the engine does not price, and the implementer keeps it true for each trip; a cycling week that prices bike hire does not list bike hire here.

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

The reasoning. The first result is built on defaults, and dates are the default with the largest effect on the total and the one most likely to be wrong, because nobody travels on the cheapest week Carta found unless they happen to be free. Asking the visitor to set their dates does two things at once: it corrects the most consequential assumption, and it makes the total move in front of them, which is the moment the number stops being Carta's and becomes theirs. The footer has already shown that moving a date moves the total; the button lets them do it.

The button focuses the dates field in the input strip above the receipt (the search strip the carta-design skill describes: airport, dates, people, stay, in one bordered row with mono micro labels). It does not open a new page. The total reprices in place, figures update without jitter because they are tabular, and the orientation line drops its second sentence. Nothing else changes.

When the dates are already the visitor's own, the first-run primary is spent, and the button becomes the surface's ordinary primary: "Plan this trip" on the destination page (the existing `dest.planTrip` door) and "Save this trip" on the trip page. Those are outside this design; the point here is that there is never a second primary while "Set your dates" is showing.

Everything else on the screen that can be changed is a field, not a button: airport, people and stay style are edited in the strip, and the strip is always visible because PRODUCT.md says the inputs are. "Change" links next to each header fact are not needed and are not added.

## Once, then never again

The orientation line and the expanded second rows are the only parts of this screen keyed to first run, and "first run" means the first priced total on this browser. A `carta.firstResultSeen` flag in localStorage is set when the receipt has rendered and the visitor has either changed an input or scrolled past the card. It is a per-viewer convenience and nothing depends on it: a blocked or cleared store means the visitor sees the first-run form again, which is the right failure.

After first run the receipt keeps every line and every figure, keeps the tilde and `est.`, keeps the flight sentence and the exclusions sentence, and keeps the footer. The orientation line goes. The second rows collapse to the one fact each line needs to be traceable (carrier and route; bus number; "measured" or "national"; the per-day figure), with the full provenance behind the InfoDot glossary that T193 brings to the planners. A returning visitor reads a receipt, not an explanation of one.

## Copy

Every string goes through the i18n keys in all six languages; none is built by concatenation. Sentence case, verb first, no terminal punctuation on labels and buttons, full stops on the three prose lines. No em dash and no en dash anywhere, and `stripDashes()` enforces it at build time. Date ranges are written with "to". None of the banned words. Labels in English, as the reference for the other five catalogues:

| Key | English |
|---|---|
| receipt.title | {city} from {originCity} |
| receipt.sub | {from} to {to} {year}, {n} nights, {people} people |
| receipt.flightOut | Flight out |
| receipt.flightHome | Flight home |
| receipt.bags | Cabin bags |
| receipt.toCity | Airport to city |
| receipt.toAirport | City to airport |
| receipt.stay | Stay, {n} nights |
| receipt.ground | Food and getting around |
| receipt.total | Total for {people} people |
| receipt.each | {eur} each |
| receipt.footerLater | A week later would be {eur}. Set your dates to reprice. |
| receipt.orientDefault | Priced from {originCity} for {people} people on the cheapest week Carta found. Set your own dates and the total reprices. |
| receipt.orientOwn | Priced from {originCity} for {people} people, {from} to {to}. |
| receipt.flightsNote | Flight prices are Carta's estimates from past fares, not live quotes. Check the airline before you book. |
| receipt.notIn | Not in this total: {list}. |
| receipt.setDates | Set your dates |

The existing `prov.est` ("est."), `prov.estTitle`, `cost.stayMeasuredN` and `cost.stayRepaired` keys are reused for the second rows rather than duplicated.

## Layout

Phone first, at 380 px with no horizontal scroll. The card fills the content column with a 16 px gutter. The header band stacks the title over the sub line. Each line is a two-column grid: label and second row on the left, figure on the right, the figure never wrapping. The sum line is the same grid at 34 px. The footer is a full-width band inside the card's radius. The primary button sits directly under the card, full width on phone, and is the last thing before the fold on a 380 by 800 viewport; the three prose lines after the footer may fall below it, the button may not.

On desktop the card caps at 520 px and sits in the page's right column, beside whatever the surface shows on the left (the day-by-day on the trip page, the folds on the destination page). The button keeps its place under the card and does not float.

Every control is at least `--tap`. Focus is `outline: 2px solid var(--accent)` with an offset. The repricing transition on the figures is opacity only, under 300 ms, with a `prefers-reduced-motion` branch that sets it to none. The card is a `<section>` with an `h2` carrying the title; the lines are a `<dl>`, so a screen reader hears label then figure; the tilde is accompanied by the `prov.estTitle` text, not colour alone.

## Before you ship

The seven questions from the carta-design skill, answered for this screen.

No hex outside `:root`; every colour above is a token. No gradient, no second saturated hue: `--accent` on the button and the footer tint, nothing else. Ochre and teal do not appear, because there is no rating and no gem on this screen; `--danger` does not appear. Mono carries figures, dates, the route code and the per-day multiplier, and nothing else; the orientation line, the flight sentence and the exclusions sentence are prose in `--ui`. One primary button. The title carries a number (the dates and the people count in its sub line) and the button carries a verb. The thing removed: an earlier draft had a "Why this number" link above the receipt; the receipt is why this number, so the link was carrying nothing and is gone.

## The test

The done condition is a first-run result tested on someone who has never seen the product. That needs a person, so it is an owner step (register row T187-b), and this is the protocol so it is run the same way each time.

Five participants who have never opened carta-europetravel.com and do not work on it. One at a time, ten minutes each, on a phone. Show them the screen (the wireframe above rendered on T099's preview build, or a printed mock of it before that) with the inputs defaulted and the orientation line showing. Give them twenty seconds without speaking, then ask, in this order, and write down the first answer without prompting:

1. What is this number?
2. Where would you be flying from?
3. How many people is it for, and when?
4. Which of these lines would you trust least, and why?
5. Is there anything you would still have to pay for that is not here?
6. What would you do next?

Then say "do that" and record the first tap.

Pass when four of five say, in their own words, that the number is the cost of this trip for the people and dates shown (question 1), name the airport (2), give the people count and the dates (3), name the flights as the least certain line and give the estimate as the reason (4), and name the primary button or tap it first (6). Question 5 has no pass mark; its answers go into the exclusions list if they name something true. Fewer than four passes on any question is a design fault in that question's row of the "What is explained" table, and the fix goes there, not into more explanation elsewhere.

Record the time from the screen appearing to the participant's answer to question 1. That is the measurement T099 carries forward: the first-run result is working when a stranger can say what the number is inside fifteen seconds.
