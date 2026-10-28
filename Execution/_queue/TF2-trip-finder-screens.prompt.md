# Batch TF2: the trip finder screens (T797 to T801)

You are running batch TF2 of the Carta trip finder plan. TF1 (T792 to T796) built the engine: `findTrips` turns the Help me choose answers into several **priced trips**, each with five price slots, a budget ruler, a match, up to three reasons and one catch. TF2 puts that engine on screen.

After question 7, the traveller sees a loader that echoes their answers, then "Trips for you": priced trip cards with the trip total. A card opens the live receipt, where any line can be swapped in any order, flights through a picker with the airline mark. "Plan this trip" carries every pick into the planner, so nothing is asked twice.

Follow `CLAUDE.md` in batch mode: one batch branch, one commit per task (`T{n}: ...`), static checks per task, one browser round at the end, then one report and the register rows. This is design work: run **/impeccable** for every screen (Operate mode), load its craft floor before the first UI edit, and use the **carta-design** skill as the rule that wins. Read `PRODUCT.md` and `DESIGN.md` first.

## Where to run it

TF1 lives only on branch `p15-trip-finder-engine` in the worktree `.claude/worktrees/travel-app-ui-refinements-5e0525`. It is not merged (row T792-a). In that worktree `continent-app/` is a plain folder of the root repo. So:

- Run TF2 in the same worktree.
- Branch `p15-trip-finder-screens` from the tip of `p15-trip-finder-engine`.
- One branch holds the whole batch.
- Do not merge, mirror, push or deploy. T792-a stays the owner's row; TF1 and TF2 deploy together.

## Read first

1. **The plan:** https://claude.ai/artifact/CWqb1r4aCvzrCYrjn21TUj. Read it with the Artifact tool (`action: "read"`).
   - Its screens "Loader", "Results", "One trip" and "Line picker" are the layout to copy closely, in Carta's tokens, type and icons.
   - Then read its database collection `review` with ArtifactData (`list`). The owner's Go or Change notes for `tf2` and `plan` override this prompt wherever they differ. On 2026-10-28 the collection was empty.
2. **The TF1 report:** `Execution/P15/T792-T796-trip-finder-engine.md`. Its sections give the engine's real API and what it leaves open. The contract is in `Execution/_queue/TF1-trip-finder-engine.prompt.md`.
3. **The owner's picks:** https://claude.ai/artifact/7WFimdaK7kRucMARKkLePr, collection `reactions`.
4. **Memory:** `travel-app-help-me-choose-results`, `travel-app-plan-opening-t743`, `travel-app-price-engine-pb1-pb5`, `mimic-references-in-carta-colours`, `placeholders-for-unsupported-features`, `travel-app-playwright-sw-route-gotcha`.
5. **Open rows:** the `open` rows in `Execution/_OPEN.md` owned by `next task`. This batch takes T795-b and T796-a (see the tasks below). It leaves T792-b and T793-a alone.
6. **Task numbers:** check them before you take any. The highest number taken was T796 on 2026-10-28. Check:
   - `git log --all --oneline`
   - every worktree's `Execution/` folder (`git worktree list`; several live under `Portfolio/wt/`)
   - `wt/vite.t*.mjs`
   - ListAgents

   If T797 to T801 are taken, shift the whole batch up and say so in the report.

## What the engine gives you (from TF1, do not change its rules)

- **The one entry point** is `findTrips(input, { levers })` in `src/lib/recommend/rank.js`.
  - It returns ranked trips in the contract's shape.
  - It is memoised per answer set. A build takes about 30 ms in node, and a re-rank about 1 ms.
- **The receipt** comes from `receiptOf(trip)` in `trips.js`. It reads the trip's own slots, so the card and the receipt cannot disagree.
- **Swaps** go through `chooseOption(slot, optionId)` in `slots.js`. Stay tiers, food levels and the hire car are already options on their slots.
- **Live flights** come from `optionsFor(trip, { fetchDay })` in `adapters/flight.js`.
  - It is async and asks `/api/flights` for the trip's out and back days.
  - It groups the flights as cheapest, quickest and best times.
  - Each option carries airline, flight number, times, stops, duration, its own price, `delta` and the check time.
  - The pick's facts carry `attribution: 'google_flights'` and the Google Flights search link.
- **Ready-made copy.** The i18n keys `tf.reason.*`, `tf.catch.*`, `tf.budget.*` and `tf.opt.*` already exist in six languages. Money goes through `formatMoney` (`lib/money.js`), never a euro sign in a string.
- **Question 7** writes `settings.guide.pick`. A slot the traveller unticked has `owner: 'you'` and still counts at its typical price.

TF1 committed one engine fix under its end check. If TF2 needs another engine change, make it in its own commit under the task that needs it, and name it in that task's "What broke".

## Owner decisions this batch implements (2026-10-28)

- **The result is a priced trip,** never a country.
  - The card carries the **trip total for one person in whole euros**, with the group total in the foot.
  - T798 writes this into `DESIGN.md` as the "priced trip card" rule.
- **The three figures stay visible under the total:** flight, stay, days (food plus getting around).
- **Trust.** Every card answers "why this %" and "why this price".
- **Match.**
  - Show the % match and the reasons on Help me choose only, even while persona gate 7 fails.
  - Show the figure only when `match.pct` is not null (from 0.55 up).
  - Explore is untouched.
- **Several trips on screen,** not one answer.
- **The flight picker** shows the airline mark and that flight's own price.
- **A loader** echoes the answers back.
- **No confidence bands, no tilde, no "est." or "live" mark** on a price (price rule 2).
- **Activities stay NotYet** until data exists. They draw `components/NotYet.jsx` and stay out of the sum.

## The flow after this batch

```
... g:budget -> g:pick -> g:trips (loader, then Trips for you) -> [receipt sheet, line pickers] -> Plan this trip -> wizard steps, skipping what is picked
```

- **Where the screen goes.** `g:trips` is a new screen in `GUIDE` (`src/planner/flow/flowGraph.js`), the last one before the engine steps.
- **Back and forward.**
  - Back from `g:trips` goes to question 7.
  - Back from the first wizard step returns to `g:trips`, with the trip the traveller planned still marked.
- **No pick yet.** When nothing is picked (the traveller reached the Where step another way), the Where step works as today, with the country list on its help tab.

## The design rules that bite here (carta-design and DESIGN.md)

- **Fonts and colour.**
  - Figtree only.
  - Tokens only, no hex.
  - Brown `--action` only for an action or a selection. One primary per screen.
- **The cost bar** is `browse/CostBar.jsx` on the ink ramp: no brown, no legend. Its segments come in the slot order of `config/slots.json`.
- **Photos.** No text on a photo; the name sits under it. Reuse the photo source the current country cards and Explore cards already use, with the existing empty-photo treatment. Add no new image path.
- **Money.**
  - Whole euros on cards.
  - Cents on the receipt (`components/ReceiptCard.jsx` parts, `precision` as they already use it).
  - Differences are signed whole euros, formatted the way the app already formats a delta (grep `lib/money.js` and the receipt parts before adding a helper).
- **Flights.**
  - A flight price is Google Flights', never Carta's.
  - Show the airline mark (`AirlineMark` from `components/flights/Flights.jsx`, the airline's own logo in a white square), the times, "Checked {time} on Google Flights" and a "Prices may have changed" link to the pick's search link.
  - A fare the traveller typed is shown as theirs, with no Google Flights line.
- **Missing figures.** A slot with `eur: null` draws NotYet, is never 0 and has no swap control.
- **Copy.**
  - Headlines are short and in the traveller's words. No counts in a headline.
  - No dashes or middle dots.
  - No banned words: seamless, unlock, effortless, elevate, leverage, empower, curated, simply, just, easy.
- **Icons** come from `components/Icons.jsx` only (gotcha T749).
- **Minimum text size** is 11 px.
- **Styles.**
  - New styles go in one new sheet, `src/styles/{next free prefix}-trip-finder.css`, imported by the finder's own components the way `86-price-items.css` is.
  - Never style generic `.card-body` or `> *` from it (the css-routes gotcha).
- **Tokens.** No token changes. If one looks needed, write a register row instead.

## Tasks

New components live in a new folder `src/planner/finder/`. Load the folder and `lib/recommend/` lazily from TripFlow (`React.lazy` or a dynamic import), so the Plan tab's first load does not grow.

### T797: the finding trips loader

- **Files:**
  - new: `src/planner/finder/FindingTrips.jsx`, the finder style sheet, `src/planner/finder/finderHooks.js` (the hook that runs `findTrips` and reports its stages)
  - edit: `src/planner/flow/flowGraph.js` (add `g:trips`), `src/planner/flow/TripFlow.jsx` and `src/planner/flow/QuestionScreen.jsx` (the one registration line, as T796 needed), the i18n files, the flow tests
- **Title:** "Finding trips for you", or "for the two of you" and the like from the party. Use the party wording the setup already uses.
- **Answer chips.** Under the title, the answers as chips in the traveller's words: from city, dates or month, shape, likes, weather, reach, avoid, budget.
- **Four checks** tick in order as the real work finishes:
  1. "Flights from {city}, {dates}"
  2. "Stays for {n} nights, {tier} style"
  3. "Food and getting around at your pace"
  4. "Matching places to {likes}"

  Each check ticks on a real event: the flight file and layers loaded, the build done, the rank done. Never tick on a timer alone.
- **Timing.**
  - The loader lasts as long as the work, and at least 1.2 s so it can be read.
  - A tap anywhere skips to the results once they exist.
  - Under `prefers-reduced-motion` nothing moves, but the checks still tick.
- **Copy limits.** No counts, no method lines ("analysing 3,868 airports"), no spinner with no words.
- **Failure.** When the build fails or returns no trips, say so in one line, with one action back to the answers. That action reopens the question most likely to widen the result: budget, then reach.

### T798: Trips for you, and the priced trip card

- **Files:**
  - new: `src/planner/finder/TripsForYou.jsx`, `src/planner/finder/TripCard.jsx`
  - edit: the finder style sheet, the i18n files, `DESIGN.md` (the new rule)
  - new tests: `tests/finderCard.test.mjs` (pure helpers only, no DOM)
- **Answers bar** at the top: the answers as chips.
  - Tapping a chip reopens that question. Continue on it comes straight back to `g:trips`, not through the other questions.
  - When there are no setup dates, add a chip for the length and month ("7 nights in May"). The traveller can change the dates there. This is the plan's default for the "nights and dates" call, and it partly answers T795-a without changing the engine's date rule.
- **The card, top to bottom:**
  1. photo of the first place
  2. trip name under the photo: the places' names, joined the way the app already joins place names
  3. a line with country, nights and bases ("Slovenia, 7 nights, 2 bases")
  4. "91% match" when `match.pct` is set; nothing when it is null
  5. the total: "€1,084 a person, all in"
  6. the three figures under it: Flight, Stay, Days
  7. the cost bar
  8. the inclusions line, from the slots: flight and bag, stay, food, getting around, "Things to do: not yet"
  9. the budget ruler, when there is a budget: "€116 under your €1,200" or "€84 over your €1,200", from `tf.budget.*`
  10. up to three reasons, then the catch, set apart quietly but readable. Never hide the catch.
  11. the foot: "For 2 people €2,168" when the party is more than one
- **Taps.**
  - Tapping the % opens "Why this match": the bars per like from `match.bars`, and the conflicts.
  - Tapping the total or the card opens the receipt (T799).
  - Both are real buttons with labels, reachable by keyboard.
- **The list.**
  - Show the first 6 trips, then "Show more trips" for the rest. That is a quiet link, the same pattern as `CountryMatchCards`.
  - On a phone, one column. On desktop, a grid that fills the plan stage's existing width. Cards keep one width.
  - Do not build TF3's levers, compare button or TF4's heart yet, and draw no control that does nothing.
- **Missing figures.**
  - A trip whose flight is `eur: null` still shows. The total says what it is built from, and the flight figure draws NotYet.
  - This is the normal state past the sweep horizon (row T795-c). The plan's May example looks like this.
- **DESIGN.md.** Add the "priced trip card" rule:
  - the trip total for one person in whole euros
  - the three figures
  - the cost bar on the ink ramp
  - the group total in the foot
  - the name under the photo

  It sits beside the existing card rules. It records what was built; it does not change a token.

### T799: the live receipt

- **Files:**
  - new: `src/planner/finder/TripReceipt.jsx`
  - edit: the finder style sheet, the i18n files
- **The surface.** A sheet over Trips for you, built on the sheet the planner already uses for a trip's full page. Do not add a second sheet primitive.
  - Phone: full screen.
  - Desktop: the existing side or centred sheet.
- **Header:** the trip name, then the total "€1,084 a person, all in", then two quiet buttons: "Why this price" and "Why 91%".
- **One row per slot,** in the slot order (the same order as the cost bar).
  - Each row has the slot label, Carta's pick in a few words, and the figure in cents.
  - A row with options opens its line picker (T800), in any order.
  - A row with `owner: 'you'` shows "You choose" and the typical price. It can still be opened to see the options.
  - A NotYet row shows NotYet and does not open.
- **After a swap.**
  - The total updates in place.
  - A difference pill shows the change ("+€24" or the app's minus form) for a few seconds.
  - The card on Trips for you shows the same new total when the sheet closes, because both read the same trip.
- **"Why this price."** One plain line per slot on where its figure comes from, built from the slot's `because` and the pick's facts.
  - Flight example: "Google Flights, checked 2 h ago".
  - Stay example: "Guesthouse room, 7 nights in Bled and Ljubljana".
  - Food example: "Eating at your Easygoing pace".
  - Never draw `quality` as a mark (price rule 2).
- **"Why 91%."** The same bars-per-like view as the card's.
- **The foot:** "For 2 people €2,168" and the one primary, "Plan this trip" (T801).
- **No sheet stacking.** The Escape stack and focus return must work: closing a picker returns to its row, and closing the receipt returns to its card (gotcha `escape-stack-capture-phase`).

### T800: the line pickers

- **Files:**
  - new: `src/planner/finder/LinePicker.jsx` (one shell for every slot), `src/planner/finder/FlightOptions.jsx`
  - edit: the finder style sheet, the i18n files, `PRODUCT.md` (row T795-b)
- **The shell.** One shell for every slot: a title ("Choose a flight", "Choose where to stay", and so on), a row per option with its figure and its difference to the current pick, and the current pick marked "Chosen". The foot shows "Trip, a person €1,084" and the primary, "Use this {line}".
  - A new slot from `config/slots.json` with options gets this shell with no new code.
- **Stay, food and getting around** use the shell directly with the slot's `options`: stay tiers, food levels, the hire car where offered.
- **Flights.**
  - **First view.** The picker opens on the swept pick at once. Then `optionsFor` runs.
  - **The rows.** Three tabs, Cheapest, Quickest and Best times. Each tab holds "Out {day}, {from} to {to}" and "Back {day}" groups of rows.
  - **A row:** the airline mark, the times, the airline name, direct or stops with the change airport, the duration, that flight's price, and the difference.
  - **The foot line:** "Return with cabin bag. Checked {age} on Google Flights. Prices may have changed". The last part is a link to the pick's Google Flights search, opening in a new tab.
  - **Failed or empty list.** When `/api/flights` fails or is empty, keep the swept pick, say "Could not load more flights right now" in one line, and offer nothing broken.
  - **Typed fare.** It shows as "Your fare", with no Google Flights line.
- **Choosing a flight** uses the `flight` lever path TF1 accepts. The trip re-prices, so the receipt total and the card total move together.
- **T795-b.** Correct `PRODUCT.md` (and the carta-design brief if it is in this repo) to the freshness that `config` uses since T780: 5 days near, 16 far. Close the row.

### T801: the hand-off to the planner

- **Files:**
  - edit: `src/planner/finder/TripReceipt.jsx`, `src/planner/flow/TripFlow.jsx`, `src/planner/GuidedTripWizard.jsx` (the `seed` effect near line 241), `src/planner/wizard/wizardSteps.js` only if a skip rule must live there, `src/planner/wizard/StepWhere.jsx` (row T796-a), the flow tests
  - new: `tests/finderHandoff.test.mjs`
- **The seed.** "Plan this trip" seeds the wizard with the whole trip: the country, the places and their nights, the gateway, the dates, the stay tier, the food level, the local mode, and the chosen flight when the traveller took one in the picker.
  - Extend the existing `seed` shape. The old `{ iso2 }` seed from Explore's "plan a trip here" must keep working unchanged.
- **Skipping.** The Where step and the Stay step skip what Carta picked. A slot with `owner: 'you'` is asked in its step as today, with Carta's typical choice preselected and nothing forced.
- **The proof** (pinned by `tests/finderHandoff.test.mjs`). The Finish total for the seeded planner equals the receipt total, to the euro, for the top 6 trips of two answer sets: the plan's example, and one inside the sweep horizon. The only allowed difference is a live flight that changed between the two reads, and the test fixes the flight data, so there is none.
- **Coming back.** Back from the first wizard step returns to Trips for you with that trip marked.
- **T796-a.** Remove the empty band of about 70 px on the Where step's help tab where the WhereQuiz sat. Close the row.

## Checks

**Per task:**
- lint the touched files
- `npm test` from `continent-app/`. Two failures predate TF1 (row T792-b); no new failures.
- `node scripts/ci/design-lint.mjs`

**End of batch:**
- **The fast NOPUBLIC build** (`wt/vite.t474.mjs` pattern; TF1 used `wt/vite.t792.mjs`). Report:
  - the Plan tab's first-load JS and preload count, before and after. They must not grow: the finder is lazy.
  - the size of the new finder chunk
- **One browser round** on the batch at 390 px and 1440 px. Use Playwright with `serviceWorkers: 'block'` and route `/api/flights` to the T795 fixtures. Run DOM checks first, then one screenshot per screen and width:
  1. the loader, normal and under reduced motion (the checks tick, a tap skips)
  2. Trips for you for the plan's example (May, past the sweep horizon, so flight NotYet) and for an answer set with dates inside the next four weeks (flights priced)
  3. a card with a budget under, one over, and answers with no budget
  4. "Why this match" and "Why this price"
  5. the receipt with every line opened in turn, a "You choose" line (untick stays in question 7), and the NotYet things-to-do line
  6. the flight picker: all three tabs, a swap, the difference pill, the Google Flights link, and the failed-list state (route `/api/flights` to an error)
  7. "Plan this trip": the wizard lands past Where and Stay, and the Finish total equals the receipt total
  8. back from the wizard to Trips for you
  9. the old Explore "plan a trip here" seed still lands on Where
  10. an answers chip reopens its question and comes back
- **Keyboard and screen reader.** Every new button has a name, focus returns after each sheet, and there are no console errors.

**Baseline.** Extend `scripts/trip_finder_baseline.mjs` so it prints the after column:

| Metric | Before (TF1) | After |
|---|---|---|
| Taps from the last answer to a whole-trip total | 4 steps | 0 (the loader leads to the totals) |
| Share of shown trips whose price includes a flight | 0% on screen | 100% where the route is swept, measured on the inside-the-horizon answers |
| Share of the top 6 inside the budget | from TF1 | unchanged by TF2 (the screens do not rank) |
| Finish total equal to card total, top 6 of two answer sets | n/a | 12 of 12 |
| Plan tab first-load JS | measured | no growth |

## Done when

- The six answers plus question 7 lead through the loader to priced trip cards.
- Each card shows the total for one person in whole euros, the three figures, the cost bar, the inclusions, the budget ruler, the match when set, up to three reasons and the catch.
- The receipt opens from a card, every line swaps in any order, and the total moves on the card and the receipt together.
- The flight picker shows live options with the airline mark, that flight's price, the difference and the Google Flights line, and survives a failed list.
- "Plan this trip" opens the planner with every pick filled, and its Finish total equals the receipt total.
- `DESIGN.md` has the priced trip card rule.
- Rows T795-b and T796-a are closed.
- Every screen passes the carta-design seven questions, written per task in the report.
- `npm test` has no new failures.
- The report `Execution/P15/T797-T801-trip-finder-screens.md` and the register rows are committed together.

## Never

- **No Anthropic or Claude API.** No SDK, no key, no call to `api.anthropic.com`.
- **No em dashes, en dashes or middle dots** anywhere. Not in code, strings, docs or the report.
- **No banned words:** seamless, unlock, effortless, elevate, leverage, empower, curated, simply, just, easy.
- **No figure shown as Carta's when it is Google Flights'.** No tilde, "est." or "live" mark on a price. No confidence band.
- **No price computed in a component.** Every figure comes from the trip or its slots.
- **No text on a photo,** no brown outside action and selection, no new tokens.
- **No TF3 or TF4 controls** (levers, compare, keep, watch) drawn as placeholders.
- **No files outside the scope above.** If a refactor elsewhere would help, write it as a register row instead.
- **No `git stash`** while worktrees are in use. No merge, push or deploy.

## Rollback

Every task is its own commit, so `git revert` any one of them.
- Reverting T797 removes `g:trips`. The flow goes from question 7 to the Where step's country list, as after TF1.
- Reverting T798, T799 or T800 needs the later tasks reverted first, because each screen opens the next.
- Reverting T801 keeps the screens, but "Plan this trip" falls back to the old `{ iso2 }` seed (Where with the country picked).
- `DESIGN.md` and `PRODUCT.md` edits revert with their task.
- No data, schema or config migration.
