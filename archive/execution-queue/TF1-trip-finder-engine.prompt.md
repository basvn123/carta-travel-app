# Batch TF1: the trip finder engine (T792 to T796)

You are running batch TF1 of the Carta trip finder plan. It is the engine behind "Help me choose". It turns the traveller's answers into several **priced trips**. Each priced trip has five price slots, a budget ruler, a match, three reasons and one catch.

TF1 builds no results screen; TF2 does that. The one screen TF1 touches is the new question 7, plus removing the repeated WhereQuiz.

Follow `CLAUDE.md` in batch mode: one batch branch, one commit per task (`T{n}: ...`), static checks per task, one browser round at the end, then one report and the register rows. Read `PRODUCT.md` and `DESIGN.md` before you touch question 7.

## Read first

1. **The plan:** https://claude.ai/artifact/CWqb1r4aCvzrCYrjn21TUj. Read it with the Artifact tool (`action: "read"`). Then read its database collection `review` with ArtifactData (`list`). The owner's Go or Change notes for `tf1` and `plan` override this prompt wherever they differ.
2. **The research and the owner's picks:** https://claude.ai/artifact/7WFimdaK7kRucMARKkLePr, collection `reactions`.
3. **Memory:** `travel-app-help-me-choose-results`, `travel-app-price-engine-pb1-pb5`, `travel-app-rating-v5-proposal`, `travel-app-plan-opening-t743`.
4. **Open rows:** the `open` rows in `Execution/_OPEN.md` owned by `next task`. Take any that this batch covers.
5. **Task numbers:** check them before you take any. The highest number taken was T791 on 2026-10-28. Check `git log --all --oneline`, every worktree's `Execution/` folder, `wt/vite.t*.mjs` and ListAgents. If T792 to T796 are taken, shift the whole batch up and say so in the report.

## Owner decisions this batch implements (2026-10-28)

- **A result is a priced trip:** a country, one to three places, a gateway airport and a number of nights.
  - For people who only want to know where to go and which flight to take, question 7 sets the other slots to "You choose".
- **Budget:** the budget the traveller typed **ranks** the results. It also shows as a ruler: "€116 under your €1,200".
- **Match:** show the **% match and the reasons**, on Help me choose only, even while persona gate 7 fails.
  - Show the figure only at or above `match.show_min` (0.55) in `config/rating.json`.
  - Explore keeps For you as a sort; `match.for_you_default` stays false.
- **No confidence bands.** One amount, as price rule 2 says.
- **The second WhereQuiz on the Where step goes.**
- **Stay options:** until real offers exist (roadmap 2.12), the stay options are the price tiers: hostel private room, guesthouse, hotel.
- **Cards show the trip total,** for one person in whole euros, with the group total in the foot. TF2 writes this into DESIGN.md; TF1 only supplies the figures.

## The contract (build exactly this, so TF2 to TF4 and future data plug in)

```js
// One price line of a trip. Every slot kind follows this shape.
slot = {
  id: 'flight' | 'stay' | 'food' | 'local' | 'activities',  // from config/slots.json
  order: number,
  labelKey: string,                 // i18n key
  owner: 'carta' | 'you',           // question 7: Carta's pick, or the traveller chooses
  eur: number | null,               // whole-trip euros for one person; null = not measured
  pick: { id, labelKey, facts, eur } | null,      // Carta's pick (null when owner is 'you')
  options: [{ id, labelKey, facts, eur, delta }] | null,  // null = nothing to swap yet
  because: string | null,           // e.g. 'priority:cheapest', 'lifestyle:mid'
  quality: 'live' | 'measured' | 'modelled' | 'missing'  // stored, never drawn (price rule 2)
}

trip = {
  id,                    // stable hash of country + place ids + gateway + nights + month (TF4 keeps trips by it)
  country, places: [{ id, nights }], gateway: { iata, minutes, mode } | null,
  origin, month, dates: { out, back } | null, nights, party,
  slots: [slot],
  total: { perPerson, group },        // sum of slots where eur != null, whatever the owner
  budget: { eur, delta } | null,      // delta < 0 means under budget
  match: { pct, bars, conflicts } | null,   // pct is null below show_min
  reasons: [{ key, facts }],          // at most 3, in the traveller's terms
  catch: { key, facts } | null,       // one honest downside
  score                               // the ranking value, for debugging
}
```

Hard rules:
- **Missing data.** A slot with `eur: null` draws NotYet. It stays out of the sum, is never 0 and has no switch. That is `components/PriceItems.jsx`'s rule.
- **"You choose" slots.** A slot with `owner: 'you'` still counts at its typical price, so the total stays honest.
- **One total.** The card total and the receipt total must come from the same `quoteTrip` call. A unit test pins them equal.

## Tasks

### T792: slot registry and the four non-flight adapters

- **New files:**
  - `continent-app/config/slots.json`: one row per slot. Fields: `id`, `order`, `labelKey`, `adapter`, `pickable` (does question 7 offer it), `status` (`live` or `notYet`).
  - `src/lib/recommend/slots.js`: reads the registry, runs the adapters and builds `slot` objects.
  - `src/lib/recommend/adapters/stay.js`, `food.js`, `local.js`, `activities.js`.
  - `tests/recommendSlots.test.mjs`.
- **What the adapters wrap.** They wrap the existing engine. They never re-implement prices.
  - Use `lib/tripTotal.js` (`quoteTrip`, `wizardPlannerState`) and `lib/price/` the way `planner/GuidedTripWizard.jsx:1112` already prices a whole trip.
  - Use `config/pricing.json` for the stay tiers, the food levels (Lifestyle) and the local modes.
- **Activities** returns `eur: null`, `options: null`, `status: notYet`.
- **The test that proves extensibility.** Adding one row to `slots.json` plus an adapter must add a slot to every trip with no other code change.
- **Import rule.** Follow the PB3 rule: import `trip.js`, `compose.js` and `nights.js` directly, and never re-export them from `lib/price/index.js`.

### T793: priced trip candidates

- **New files:** `src/lib/recommend/candidates.js`, `src/lib/recommend/trips.js`, `tests/recommendTrips.test.mjs`.
- **Read only:**
  - `lib/countryMatch.js` (`matchCountries`)
  - `lib/match.js` (`forYou`, `fit`)
  - `lib/airportPick.js` (`pickAirport`)
  - the rating v5 gateways (`gateway_of`)
  - `planner/flow/tripSettings.js` (`quizAnswers`)
- **Building candidates.** Start from the ranked countries. Inside each country, take the places by `forYou`. Then split by trip shape:
  - one place, no moving: 1 place
  - a few towns: 2 or 3 places, nights split by the existing auto-balance rule
  - road trip: 2 or 3 places, with the hire car slot when the planner transport is car
  - several countries, and one way from A to B: fall back to one-country trips this batch, and record the gap as a register row
- **Gateway airport.** Choose the airport of the first place that has a swept fare from the origin, through `pickAirport`. "No flying" uses the existing ground legs.
- **Nights and dates.**
  - Use the setup dates when they exist.
  - Otherwise use 7 nights in the best month of the trip's places, with the month taken from the guide's weather answer.
  - Write this as a config value, not a constant in code.
- **Limits.** Cap at 24 candidates. Memoise per answer set (a stable hash of `settings.guide` plus origin, dates, party and Lifestyle).
- **Stable ids.** The same answers must give the same trip ids.

### T794: rank, budget ruler, match, reasons and catch

- **New files:**
  - `src/lib/recommend/rank.js`, `src/lib/recommend/reasons.js`
  - `continent-app/config/recommend.json`: the caps, the budget sink, the fit-first switch, the default nights and the lever mapping
  - `tests/recommendRank.test.mjs`
  - the new i18n keys `tf.reason.*`, `tf.catch.*` and `tf.budget.*` in all six language files
- **i18n files.** Grep them; never read `en.js` whole. No euro sign in a string; money goes through `formatMoney`.
- **Rank: fit first, then quality.** This is behind `recommend.json` `rank.fitFirst: true`.
  1. A trip qualifies only when its strongest chosen like reads at least `rank.mainLikeMin` (0.5) where the profile measures it, and there is no hard conflict.
  2. Then order the trips by `forYou`.
  3. Trips over budget sink in proportion to the overrun (`budget.sinkPer100`). With no budget there is no sink.
- **Levers.** Accept a `levers` argument now, so TF3 only wires the UI: `{ flight: 'cheapest' | 'quickest' | 'times', food: 'cook' | 'mix' | 'out', bases: 'one' | 'several' }`. Each lever maps onto an existing setting, never a new price rule.
- **Reasons.** Up to three, built from `fit()` bars and their facts, the month's weather and the travel time. Write them in the traveller's terms ("You said hiking: Triglav park from the door"), as keys plus facts.
- **The catch.** One, chosen in this order:
  1. a conflict from `fit()` (busy month for a quiet traveller, car needed for a no-car one, heat)
  2. over budget
  3. a long travel day
- **Measure.** The time to build and rank 24 trips in node. Report it; the target is under 50 ms after warm-up, so the TF3 levers can re-rank live.

### T795: the flight adapter with options

- **New files:** `src/lib/recommend/adapters/flight.js`, `tests/recommendFlight.test.mjs`, and fixtures under `tests/fixtures/`.
- **Card figure.** The swept price for the day, or the nearest day within the existing spread, from `lib/flights/flights.js` (`sweptNear`, `cheapestReturn`). Respect the freshness rule: 3 days for the next two weeks, 8 days beyond (T692).
- **Picker options.** The live day list. It comes from `/api/flights`, the same shape `lib/flights/useLiveFlights.js` reads.
  - Expose it as an async `optionsFor(trip)`, so the card never waits on the network.
  - Group the flights as cheapest, quickest and best times. Each option carries the airline code (for the existing airline mark), departure and arrival times, stops, duration, its own price, `delta` against the current pick, and the check time.
- **Fares and bags.** A fare the traveller typed replaces Google Flights' price and is labelled as theirs. The bag is priced on every flight (T691).
- **Attribution.** The flight figure is Google Flights', never Carta's. The data carries what TF2 needs to show the airline, the times, the check time and the "prices may have changed" link.

### T796: question 7, and the WhereQuiz leaves

- **Files:**
  - `src/planner/flow/questions.js`, `setupScreens.jsx`, `flowGraph.js` (insert `g:pick` after `g:budget`) and `tripSettings.js` (default `guide.pick` = every pickable slot)
  - `src/planner/wizard/StepWhere.jsx`, where the help tab renders `WhereQuiz`
  - the i18n files
  - `src/styles/86-plan-flow.css`, the main sheet. The css-routes gotcha applies: never style generic `.card-body` or `> *` from it.
  - the existing flow tests
- **The question.** Copy: "What should Carta pick for you?". Helper: "Every trip is priced in full either way. Untick what you'd rather choose yourself."
  - The rows are read from `config/slots.json`, never hand-listed.
  - "Where to go" is always on.
  - A `notYet` slot shows a "Not yet" tag and cannot be ticked.
  - Use the existing ChoiceRows multi pattern and icons from `components/Icons.jsx` only (gotcha T749).
- **The answer.** It maps to `slot.owner`.
- **WhereQuiz.** Remove the pre-answered `WhereQuiz` above the cards on the Where step's help tab. The answers stay reachable through the existing settings.
- **The current results stay.** The engine is not wired to the screens until TF2.

## Checks

**Per task:**
- lint the touched files
- `npm test` from `continent-app/`
- `node scripts/ci/design-lint.mjs` for T796

**End of batch:**
- The fast NOPUBLIC build (`wt/vite.t474.mjs` pattern). Report the preload count before and after; it must not grow by more than the new modules.
- One browser round on the merged batch at 390 px and 1440 px:
  - Help me choose through all seven questions
  - question 7 with every toggle and the "Not yet" row
  - the Where step without WhereQuiz
  - an unchanged results list
  Prefer `scripts/verify_*.mjs` DOM checks; take one screenshot per screen and width.

**Baseline script:** `scripts/trip_finder_baseline.mjs`. Prints, for the plan's example answers (2 people from Brussels, 9 to 16 May, a few towns, hiking plus food and wine, mild, short flight, avoid crowds, €1,200 each), these numbers before and after:

| Metric | Expected before | After |
|---|---|---|
| Steps from the last answer to a whole-trip total | 4 | still 4, because TF2 wires the screen |
| Share of results whose price includes a flight | 0% | from the engine |
| Share of the top 6 inside the budget | | from the engine |
| Time to build and rank 24 trips | | from the engine |

## Done when

- For the example answers, the engine returns 6 to 24 priced trips.
- Each trip has five slots, with activities as NotYet.
- Card total equals receipt total.
- The budget ranks the trips.
- Each trip has a match (or null below 0.55), up to three reasons and one catch.
- The same answers always give the same ids.
- Adding a slot row adds a slot everywhere.
- Question 7 works in the browser, and the WhereQuiz is gone.
- `npm test` passes.
- The report `Execution/P15/T792-T796-trip-finder-engine.md` and the register rows are committed together.

## Never

- **No Anthropic or Claude API.** No SDK, no key, no call to `api.anthropic.com`.
- **No em dashes, en dashes or middle dots** anywhere. Not in code, strings, docs or the report.
- **No banned words:** seamless, unlock, effortless, elevate, leverage, empower, curated, simply, just, easy.
- **No figure shown as Carta's when it is Google Flights'.** No tilde, "est." or "live" mark on a price.
- **No files outside the scope above.** If a refactor elsewhere would help, write it as a register row instead.
- **No `git stash`** while worktrees are in use.

## Rollback

Every task is its own commit, so `git revert` any one of them.
- T796 is the only change a traveller can see. Reverting it restores the six questions and the WhereQuiz.
- The engine modules are unused until TF2, so reverting them changes nothing on screen.
