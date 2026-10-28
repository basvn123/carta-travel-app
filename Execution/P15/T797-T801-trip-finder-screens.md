# T797 to T801: the trip finder screens (batch TF2)

## Shared header

**Batch.** TF2 of the trip finder plan (artifact CWqb1r4aCvzrCYrjn21TUj, queue prompt `Execution/_queue/TF2-trip-finder-screens.prompt.md`). It puts TF1's engine on screen. After question 7 the traveller sees a loader that echoes their answers, then "Trips for you": priced trip cards with the trip total. A card opens the live receipt, where any line can be swapped in any order, flights through a picker with the airline mark. "Plan this trip" opens the planner with every pick in it.

**Inputs read.** The plan's `review` collection was empty on 2026-10-28, so the prompt stands as written. The owner's picks (artifact 7WFimdaK7kRucMARKkLePr, `reactions`, 18 rows) agree with the prompt's owner decisions. Also read: the TF1 report, PRODUCT.md, DESIGN.md, the carta-design skill and impeccable's craft floor (Operate mode).

**Task numbers.** T797 to T801 were free. The only mention in `git log --all` was the queue commit. The other checks were every worktree's `Execution/`, `wt/vite.t*.mjs` (highest t792) and ListAgents.

**Branch.** `p15-trip-finder-screens` in the worktree `.claude/worktrees/travel-app-ui-refinements-5e0525`, from the tip of `p15-trip-finder-engine` (de35bd4a1). Here `continent-app/` is a plain folder of the root repo, so the batch has one branch. Not merged, mirrored, pushed or deployed: row T792-a stays the owner's, and TF1 and TF2 deploy together.

| Task | Commits |
|---|---|
| T797 | 54f0f7fce |
| T798 | 8cd6bd8ac, fb231cb5b (engine) |
| T799 | 6dda78a29 |
| T800 | 0aca42a02 (engine), c72486744 |
| T801 | 6d10052e2 |

**Where things live.**
- `src/planner/finder/` is new and lazy: TripFlow loads `FindingTrips.jsx` with `React.lazy`, and that chunk carries `lib/recommend/` with it.
- `finderText.js` holds every word and figure the screens draw, as pure functions; no component adds up a price.
- `planOf.js` (finder chunk) makes the hand-off plan. `handoff.js` (Plan chunk) is the wizard's light side.
- All styles sit in `src/styles/87-trip-finder.css`, under `.tff-` classes only.

**Checks.**
- **Per task:** eslint on the touched files, `npm test`, and `node scripts/ci/design-lint.mjs`. Design lint stayed at 32 new violations, all outside this batch's files; it is the same count TF1 reported.
- **`npm test` per task:** T797 914 tests, 907 pass; T798 925, 918 pass; T799 926, 919 pass; T800 926, 919 pass; end of batch 931 tests, 924 pass, 2 fail, 5 skipped. The 2 failures each time are the TF1 ones (row T792-b), no new ones.
- **End of batch:** the NOPUBLIC fast build (`wt/vite.t797.mjs`, base from a clean export of de35bd4a1 in `wt/t797-base`, after from the batch) and one browser round (`wt/t797-walk.mjs` on `wt/t797-serve.mjs`, port 5797, Playwright with `serviceWorkers: 'block'`, the sweep file and `/api/flights` routed to the T795 fixtures) at 390 px and 1440 px.

**Browser round.** 95 of 97 DOM checks passed at 390 px and 1440 px together, with no page errors and no console errors (the data host refusing CORS to localhost is filtered, as in TF1). The two that did not pass are one check at each width: after four swaps on one trip (stay, food, getting around, then a flight), Finish showed 719.60 a person against a receipt of 723.00 (row T801-b). The same check on an unswapped trip passed at both widths (900.31 against 900.00). All ten screens of the prompt's list were walked: the loader normal and under reduced motion (ticks in order, at least 1.2 s, a tap skips); Trips for you in May (flight NotYet) and November (flights priced); budget under, over (a 700 budget) and none; why this match and why this price; every receipt line opened and swapped with focus back on its row, a You choose line and the NotYet line; the flight picker's three tabs, a swap with the foot total equal to the receipt, the difference pill, the Google Flights link and the failed list; Plan this trip landing on Getting there; back to the trips with the trip marked; the old Explore seed landing on Where with Slovenia picked; an answers chip that reopens its question and comes back. Screenshots are in `wt/t797-shots/`, one per screen and width. Things the round found and fixed are listed under each task's "What broke".

**Bundle.**

| Measure (NOPUBLIC build) | Before (TF1 tip) | After |
|---|---|---|
| Modulepreloads in index.html | 37 | 37 |
| First-paint JS bytes | 1,360,379 | 1,360,428 (+49) |
| Plan tab first-load JS bytes (first paint plus the Plan chunks' static imports) | 2,874,468 | 2,881,956 (+7,488) |
| Finder chunk (`FindingTrips-*.js`, lazy) | none | 52,650 bytes |
| Assets | 124 | 126 (the finder chunk and its CSS) |

The preload count does not grow. The Plan tab's first load grows by 7,488 bytes, and none of it is the finder: 4,785 bytes are the new English strings, which ship in the chunk that holds `en`, and about 2.6 KB is TripFlow's and the wizard's hand-off code. The finder itself (the screens and lib/recommend) loads only on `g:trips`. The prompt said "no growth"; the strings and the hand-off cannot be lazy as the app is built, so this is written down as row T801-c rather than hidden.

**Baseline** (`node scripts/trip_finder_baseline.mjs --flights tests/fixtures/tf1-flights-BRU.json`):

| Metric | Before (TF1) | After |
|---|---|---|
| Steps from the last answer to a whole-trip total | 4 (Where, Stay, Getting, Finish) | 0: question 7's Continue opens the loader, which leads straight to the totals |
| Share of shown trips whose price includes a flight, inside the horizon (21 to 28 Nov) | 0% on screen | 83% of all (5 of 6); 100% of those whose route the sweep covers. The sixth (Edinburgh) flies to an airport the fixture file does not have. May: 0 of 8 (row T795-c). |
| Top 6 inside the budget | 100% May, 83% Nov | unchanged: the screens do not rank |
| Finish total equal to the receipt, top 6 of two answer sets | n/a | 12 of 12 to the cent at the quote. To the whole euro a person, 5 of 12; the others differ by 1 euro of slot rounding (see T801). |
| Plan tab first-load JS | 2,874,468 | 2,881,956 (+7,488) (preloads unchanged) |

## T797: the finding trips loader

### What changed

`g:trips` is a new screen at the end of `GUIDE` (`flowGraph.js`). `guideQuestions()` leaves it out of the "3 of 7" count, and `afterGuide` never skips it. TripFlow renders it inside a `Suspense` that holds the step's place while the lazy chunk loads.

**The hook.** `useTripFinder` (`finderHooks.js`) runs the engine on the inputs the app already has: the catalogue and choices from the first-run context, country insights, the saved taste, the origin airport, the swept flight file (`loadFlightFile`, the same cached promise the app uses) and the five layer indexes. It reports four stages, and each ticks on a real event:
1. flights: the flight file and the layers have arrived;
2. and 3. stays, and food and getting around: `buildTrips` is done;
4. likes: `rankTrips` is done.

**The loader.**
- The title follows the party kind the setup asked ("Finding trips for the two of you").
- The answers show as chips.
- The four lines are in the traveller's words; the stay line names the stay tier the engine prices with.
- It stands for the work and at least 1.2 s. A tap anywhere skips once the trips exist, and a quiet "Show the trips" button does the same for a keyboard.
- Under reduced motion nothing moves, and the checks still tick.

**Empty or failed.** No trips, or an engine error, gives one line and one action that reopens budget, then reach, then the first question.

### Files touched

**Created:**
- `continent-app/src/planner/finder/FindingTrips.jsx`
- `continent-app/src/planner/finder/finderHooks.js`
- `continent-app/src/planner/finder/finderText.js` (pure helpers; not named in the prompt, it is where the no-price-in-a-component rule lives)
- `continent-app/src/styles/87-trip-finder.css`

**Modified:**
- `continent-app/src/planner/flow/flowGraph.js`
- `continent-app/src/planner/flow/TripFlow.jsx`
- `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (34 keys each)
- `continent-app/tests/flowGraph.test.mjs`

`QuestionScreen.jsx` needed no line: `g:trips` is not a question and does not go through `QuestionBody`.

### Commands run

`npx eslint`, `node --test tests/flowGraph.test.mjs` (11 of 11), `npm test`, `node scripts/ci/design-lint.mjs`.

### Config and secrets set

None.

### Before/after measurements

See the shared header (steps to a total: 4 before, 0 after).

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The flow test "every screen has a question or a known page" failed | `g:trips` is a page, not a question | Added to the known pages |

### Screens and states for the end check (all checked)

The loader at both widths; under reduced motion; a tap that skips; the checks ticking in order.

### Seven questions (carta-design)

1. **Hex:** none.
2. **Gradients or new colours:** none.
3. **Brown:** none on the loader; done checks are ink.
4. **Text sizes and money:** nothing under 11 px; no figure.
5. **Primaries and photos:** no primary while loading, one ("Change your budget") on the empty state; no photo.
6. **Copy:** the headline has a verb; no counts or method lines.
7. **Remove one thing:** the working check's spinner was never drawn: the line darkens instead.

### What is still open

None of its own.

### Rollback procedure

`git revert 54f0f7fce` after the later tasks. The flow then goes from question 7 to the Where step, as after TF1.

## T798: Trips for you, and the priced trip card

### What changed

`TripsForYou.jsx` has a back control, "Trips for you" and the answers bar. The bar's chips are kit Buttons; one reopens its question, and Continue there comes straight back to the trips (TripFlow's `returnTo`). With no setup dates it shows the trip's length and month ("7 nights in May").

The list shows six cards, then "Show more trips". It is one column on a phone and an auto-fill grid across the plan stage's wide card on a desktop.

`TripCard.jsx` follows the new DESIGN.md rule, top to bottom:
- the first place's photo (`HeroImage`, the Explore source and placeholder);
- the name under it;
- country, nights and bases;
- "91% match" only when `match.pct` is set, a button that opens "Why this match" (a bar a like, and what stands against the trip);
- the total a person in whole euros. It is a button whose hit area is the whole card; it says "without the flight" when the flight has no figure;
- Flight, Stay and Days, each `NotYet` when empty;
- the cost bar (`CostBar`, ink ramp);
- the inclusions;
- the budget ruler;
- up to three reasons, then the catch, under a hairline;
- "For 2 people" in the foot.

No TF3 or TF4 controls are drawn.

**DESIGN.md.** The "Priced trip card" rule sits under Cards / Containers. It records what was built and changes no token.

**Engine fix (fb231cb5b).** The browser round showed "0 min from PRG airport" as a reason on a card. A gateway 0 minutes away is the place's own airport row, so `reasons.js` no longer gives the close-airport reason for it.

### Files touched

**Created:**
- `continent-app/src/planner/finder/TripsForYou.jsx`
- `continent-app/src/planner/finder/TripCard.jsx`
- `continent-app/tests/finderCard.test.mjs` (11 tests)

**Modified:**
- `continent-app/src/planner/finder/FindingTrips.jsx`
- `continent-app/src/styles/87-trip-finder.css`
- `continent-app/src/i18n/*.js` (28 keys each)
- `DESIGN.md`
- `continent-app/src/lib/recommend/reasons.js` (engine fix)

### Commands run

`node --test tests/finderCard.test.mjs` (11 of 11), `tests/recommendRank.test.mjs` after the engine fix (11 of 11), eslint, design lint, `npm test`.

### Config and secrets set

None.

### Before/after measurements

On the real catalogue the three figures add up to each card's total for every trip (pinned in `finderCard.test.mjs`).

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Design lint: a shadow-literal and an outline-none | The marked card had a border and a shadow; the stretched total hid its own outline | The marked card takes a brown border and an inset outline; the focus ring moves to the stretch |
| "0 min from PRG airport" on a card (end check) | The close-airport reason fired for a gateway 0 min away | Engine fix fb231cb5b |
| A grey band around the card's cost bar (end check) | The bar's segment buttons kept the kit's fill | `.tff-card .costbar-seg { background: none }` |

### Seven questions (carta-design)

1. **Hex:** none.
2. **Gradients or new colours:** none; the bars are on the ink ramp.
3. **Brown:** only the match button (an action) and a marked card's edge (a selection). Ticks are `--status-success`, the catch mark is `--amber-ink`.
4. **Text sizes and money:** no figure under 12 px, inclusions at 11 px 600; every euro through `formatMoney`, whole on cards.
5. **Primaries and photos:** no primary on the list; no text on the photo.
6. **Copy:** "Trips for you" names a section; no counts; no dashes or banned words.
7. **Remove one thing:** the cost bar's hint line ("Tap a segment for its figure.") is silent on cards; it speaks once a segment is tapped.

### What is still open

None of its own.

### Rollback procedure

Revert T799 to T801 first, then `git revert fb231cb5b 8cd6bd8ac`.

## T799: the live receipt

### What changed

`TripReceipt.jsx` is built on the planner's own sheet (`browse/SheetShell.jsx`, the sheet the wizard opens its total in), so there is no second sheet primitive. It is full screen on a phone and the centred sheet on a desktop.

**Head.** The total a person in cents, the cost bar, "Why this price" and "Why 91%". The second shows only when the match is set.

**Rows.** One per slot, in slot order, each with a swatch in its bar segment's ink, the label, Carta's pick in a few words and the figure in cents.
- A "You choose" slot shows that and still opens.
- A NotYet slot is a static row.
- "Why this price" adds one line a slot from the slot's `because` and its facts: "Google Flights, checked 14:05", "Guesthouse room, 7 nights in Bled and Ljubljana", the food level in words. `quality` is never drawn.

**After a swap.** The total settles in place and a signed whole-euro pill shows for 3 s (`useTotalDelta`, the plan total's own hook).

**Foot.** "For 2 people" and the one primary, "Plan this trip".

**Focus.** Closing returns focus to the card's total (`useFocusTrap`). Swaps are kept by trip id, so the card shows the same total as the receipt.

### Files touched

**Created:**
- `continent-app/src/planner/finder/TripReceipt.jsx`

**Modified:**
- `continent-app/src/planner/finder/FindingTrips.jsx`
- `continent-app/src/planner/finder/finderText.js`
- `continent-app/src/planner/flow/TripFlow.jsx`
- `continent-app/src/styles/87-trip-finder.css`
- `continent-app/src/i18n/*.js` (21 keys each)

### Commands run

eslint, design lint, `npm test`.

### Config and secrets set

None.

### Before/after measurements

Not measured.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| eslint and design lint crashed with "VirtualAlloc failed" | A full `npm test` (the wire-split test) was running at the same time | Rerun after it finished |
| The receipt rows stacked their parts (end check) | The kit Button wraps its children in `.btn-label` | `.tff-rc-row .btn-label { display: contents }` |

### Seven questions (carta-design)

1. **Hex:** none.
2. **Gradients or new colours:** none.
3. **Brown:** the one primary and the quiet buttons only; swatches are the ink ramp.
4. **Text sizes and money:** cents through `ReceiptFigure`; nothing under 11 px.
5. **Primaries and photos:** one primary; no photo.
6. **Copy:** no dashes, no banned words, no tilde or "est.".
7. **Remove one thing:** the receipt has no subtitle; the sheet title is the trip's name.

### What is still open

Each slot is rounded to whole euros by the engine (slots.js), and the receipt draws those in cents ("€284.00"), so a cent figure on a line is a rounded euro (row T801-a).

### Rollback procedure

Revert T800 and T801 first, then `git revert 6dda78a29`.

## T800: the line pickers

### What changed

`LinePicker.jsx` is one shell for every slot, a view inside the receipt's sheet, not a second sheet. It has:
- a back arrow and the title ("Choose where to stay");
- a radio row per option with its figure and its signed difference, the current pick marked "Chosen";
- the foot "Trip, a person" with the total as it would stand, and "Use this stay" (or flight and so on).

Escape closes the picker, not the receipt: a window capture listener runs before the sheet's own trap on the document. Back returns focus to the row. A slot that `config/slots.json` gives options needs no new code.

`FlightOptions.jsx` opens on the swept pick, then calls `optionsFor`.
- **Tabs:** Cheapest, Quickest and Best times, each with an "Out Sat 21 Nov, BRU to PRG" and a "Back" group.
- **A row:** the airline mark, the times, the airline, the stops with the change airport, the duration, the flight's own Google Flights fare and the difference to the trip.
- **The foot line:** "Return with cabin bag. Google Flights, checked 14:05." and a "Prices may have changed" link to the pick's search, in a new tab.
- **Failed or empty list:** the swept pick stays and one line says "Could not load more flights right now."
- **A typed fare or a drive:** shown as the traveller's, with no Google line.

**Engine change (0aca42a02).** `chooseFlight(trip, option)` in `adapters/flight.js` takes one live flight for its direction. The slot moves by the difference between the two legs, the same rule `optionsFor` prices with, so out then back equals back then out (tested). Leg facts now carry the fare per seat (`price`), so the hand-off can give the planner that flight.

**Row T795-b.** PRODUCT.md and the carta-design brief now say what `flights.max_age_days` has said since T780: 5 days for the next two weeks and 16 days beyond.

### Files touched

**Created:**
- `continent-app/src/planner/finder/LinePicker.jsx`
- `continent-app/src/planner/finder/FlightOptions.jsx`

**Modified:**
- `continent-app/src/planner/finder/FindingTrips.jsx` (passes the picker into the receipt)
- `continent-app/src/lib/recommend/adapters/flight.js`
- `continent-app/tests/recommendFlight.test.mjs` (1 test)
- `continent-app/src/styles/87-trip-finder.css`
- `continent-app/src/i18n/*.js` (22 keys each)
- `PRODUCT.md`
- `.claude/skills/carta-design/SKILL.md`

### Commands run

`node --test tests/recommendFlight.test.mjs` (9 of 9), eslint, design lint, `npm test`.

### Config and secrets set

None.

### Before/after measurements

Not measured.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `tf.pick.back` meant both the back button and the "Back" flight group | One key for two jobs | `tf.pick.toReceipt` and `tf.pick.dir.out` / `tf.pick.dir.back` |
| The flight rows stacked their parts (end check) | The kit Button's `.btn-label` | `display: contents` |
| Day names in US order ("Sat, Nov 21") (end check) | The day used `lang` ("en"), not the app's BCP 47 tag | `useBcp47()` |

### Seven questions (carta-design)

1. **Hex:** none.
2. **Gradients or new colours:** none.
3. **Brown:** the selected row is the select tint with a brown edge and a tick mark in `--select-ink`; the one primary.
4. **Text sizes and money:** whole euros, signed differences "+€13" / "-€2" as the plan total writes them.
5. **Primaries and photos:** one primary; the airline's own logo in its white square, never recoloured.
6. **Copy:** every flight figure is named as Google Flights', with the check time and "Prices may have changed".
7. **Remove one thing:** the airline's name repeats the mark only as text, for when the logo is missing.

### What is still open

Nothing new.

### Rollback procedure

`git revert 6d10052e2 c72486744 0aca42a02` (T801 first). The receipt rows then stay static.

## T801: the hand-off to the planner

### What changed

"Plan this trip" makes a plan (`planOf.js`):
- the places and nights in the finder's order;
- the dates and the party;
- the gateway (anchor and return anchor) and the home airport;
- the stay tier, the Lifestyle of a swapped food level, the getting-around mode;
- the flight ranking;
- the live flights taken in the picker, keyed the way `quoteTrip` reads them.

**How it reaches the wizard.** TripFlow writes the plan into the wizard draft (`plannerStore.setWizard`, with `draftFor` from `handoff.js`), along with the dates and the travellers. The wizard reads it on mount as `seedPlan`. This is the seed, carried through the draft: TripFlow cannot hand the wizard a new prop, because TripPlannerTab owns the `renderWizard` call and is outside this task's files. The old `{ iso2 }` seed is untouched, and the browser round confirms it still lands on Where.

**While the places stay as picked** (`appliesTo`), the wizard:
- keeps the finder's order;
- prices with `planState`, the request the finder priced;
- hands over `withPlan(handOver, plan)`, so the planned trip gets the gateway and the mode.

**Landing.** The wizard opens on Getting there, past Where and Stay, or on Stay when the stay is the traveller's in question 7. Back from that step returns to Trips for you, with the trip marked "The trip you planned" and in focus; the swaps are kept (TripFlow state). On a desktop the step rail still opens Where and Stay.

**Row T796-a.** The help tab's results section no longer takes `.wq-results`, whose 40 px top margin was the space the quiz left. The first content now starts 24 px under the tabs.

**End check fix: preloads.** NotYet, AirlineMark and the airline names are imported by TripFlow, which is already in the Plan chunks, and handed down as a `ui` prop. Imported from the lazy chunk, rolldown split each into a chunk of its own: 39, then 42, preloads on every page. Handed down, it stays at 37.

### Files touched

**Created:**
- `continent-app/src/planner/finder/handoff.js`
- `continent-app/src/planner/finder/planOf.js`
- `continent-app/tests/finderHandoff.test.mjs` (5 tests)

**Modified:**
- `continent-app/src/planner/GuidedTripWizard.jsx`
- `continent-app/src/planner/flow/TripFlow.jsx`
- `continent-app/src/planner/wizard/StepWhere.jsx`
- `continent-app/src/planner/finder/{FindingTrips,TripsForYou,TripCard,TripReceipt,LinePicker,FlightOptions}.jsx` and `finderHooks.js` (the `ui` hand-down, end check)
- `continent-app/src/styles/87-trip-finder.css`
- `continent-app/scripts/trip_finder_baseline.mjs` (the after column)

`wizardSteps.js` needed no rule.

### Commands run

`node --test tests/finderHandoff.test.mjs` (5 of 5), eslint, design lint, the fast build three times, `wt/t797-walk.mjs`, and node probes over 108 swap combinations.

### Config and secrets set

None.

### Before/after measurements

**The proof (`finderHandoff.test.mjs`).** The test builds the hand-over the way the wizard does for a trip with nothing typed. For the top 6 trips of the plan's May example and of the same answers in November, the planner's grand total equals the finder's quote **to the cent, 12 of 12**.

**To the whole euro a person.** The receipt equals Finish in 5 of 12; the other 7 differ by 1 euro. The receipt sums slots that the engine rounds to whole euros (slots.js), while Finish prints the cent total, so a 0.35 to 1.35 euro gap is rounding (row T801-a).

**Swaps.** In node, over 108 combinations of stay, food and getting around on the November top 6, the largest gap is 1.35 euros. In the browser, an unswapped trip agrees (Finish 900.31, receipt 900.00). One four-swap trip (stay, food, getting around, then a flight) showed Finish 719.60 against a receipt of 723.00 (row T801-b).

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Preloads 37 to 39, then 42 | Static, then dynamic, imports of app parts from the lazy chunk made rolldown split them | TripFlow hands them down (`ui`) |
| `handoff.js` became its own chunk | Imported by both the finder and the wizard | The plan is made in `planOf.js` (finder); the wizard and TripFlow import `handoff.js` |
| My first probe never ran | A stray `cat` waited on input | Stopped; the hand-off test does the probing |
| Walk script bugs (budget answered 0 by "Skip", ticks read after the loader left, the foot read before render, the desktop total selector) | Test code | Fixed in `wt/t797-walk.mjs` |

### Seven questions (carta-design)

1. **Hex:** none.
2. **Gradients or new colours:** none.
3. **Brown:** "The trip you planned" in `--select-ink` with the marked card's edge, a selection.
4. **Text sizes and money:** no new figures; the planner's own.
5. **Primaries and photos:** "Plan this trip" is the receipt's one primary.
6. **Copy:** no dashes, no banned words.
7. **Remove one thing:** no extra "Back to trips" control; the wizard's own back arrow does it.

### What is still open

- **T801-a.** The receipt and the card add up slots rounded to whole euros, so they can sit up to half a euro a slot from the planner's cent total.
- **T801-b.** Swaps are priced one slot at a time against the finder's base settings; the planner prices them together. One four-swap trip in the browser differed by 3.40 euros a person.
- **T801-c.** The Plan tab's first load grows about 7.5 KB (English strings and the hand-off), against the prompt's "no growth"; preloads do not grow.
- **T801-d.** On a phone the wizard has no step rail, so a seeded trip lands past Where and Stay with no way back to them except via the trips.
- **T801-e.** `.wq-results` in `26-shortlist-extras.css` is now unused.
- **T801-f.** The planned trip (`loadFromWizard`) does not read the hand-over's `stayTier` or the swapped Lifestyle, so a stay tier or food level chosen on the receipt holds until Finish, and the planned trip reprices at the app's own.

### Rollback procedure

`git revert 6d10052e2`. "Plan this trip" then opens the planner on its first step with no plan; the planner itself is unchanged by the revert. The wizard draft's `finder` field is ignored by older code.

## Open items written to `_OPEN.md`

T801-a to T801-f, in the commit that carries this report. T795-b closed by T800, T796-a closed by T801.
