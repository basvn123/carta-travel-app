# T792 to T796: the trip finder engine (batch TF1)

## Shared header

**Batch.** TF1 of the trip finder plan (artifact CWqb1r4aCvzrCYrjn21TUj, queue prompt `Execution/_queue/TF1-trip-finder-engine.prompt.md`). It builds the engine behind Help me choose: the traveller's answers become several priced trips, each with five price slots, a budget ruler, a match, up to three reasons and one catch. The only screen change is question 7 and the removal of the second WhereQuiz. The results screen is TF2's.

**Inputs read.** The plan's `review` collection was empty: there were no Go or Change notes for `tf1` or `plan`, so the prompt stands as written. The owner's picks come from the `reactions` collection of artifact 7WFimdaK7kRucMARKkLePr (18 rows) and the memories named in the prompt.

**Task numbers.** T792 to T796 were free on 2026-10-28. The only mention in `git log --all` was the queue commit itself. The other checks were every worktree's `Execution/`, the app repo's log, `wt/vite.t*.mjs` (highest t782) and ListAgents.

**Branch.** `p15-trip-finder-engine` in the worktree `.claude/worktrees/travel-app-ui-refinements-5e0525`, from 86a1b363e. In this worktree `continent-app/` is a plain folder of the root repo, not the nested app repo, so the batch has one branch and the app repo has none. The commits:

| Task | Commit |
|---|---|
| T792 | e72c763e4 |
| T793 | 015c6b4e2, 282c5e7f6 |
| T794 | bd20e7d78, 6154e4816 |
| T795 | 1dfb201fc |
| T796 | 9457809aa |

The batch is not merged, mirrored, pushed or deployed (row T792-a).

**The engine in one picture.** `src/lib/recommend/` is a new folder of pure modules:

- `candidates.js` turns the answers into candidate trips.
- `trips.js` prices each candidate with one `quoteTrip` call and cuts the quote into the slots.
- `slots.js` turns `config/slots.json` and the adapters in `adapters/` into slot objects.
- `rank.js` adds the budget ruler, the match, the reasons and the catch, and orders the trips. Its `findTrips(input, { levers })` is the one entry point TF2 calls.

Nothing in the app imports the folder yet, so it is not in the bundle.

**Checks.**

- **Per task:** eslint on the touched files, `npm test`, and `node scripts/ci/design-lint.mjs` for T796.
- **End of batch:**
  - the full suite: 906 tests, 899 pass, 2 fail, 5 skipped. Both failures were present before the batch; see T792 "What broke".
  - the NOPUBLIC fast build (`wt/vite.t792.mjs`);
  - one browser round on the "after" build (`wt/t792-serve.mjs`, port 5792) at 390 px and 1440 px.

**Browser round.** A Playwright walk from Plan through setup, the doors and the seven Help me choose questions, then 18 DOM checks at each width. All 18 passed at both widths, with no page errors and no console errors. The only console messages filtered out were the data host refusing CORS to localhost, which is known. Screenshots were taken of question 7 and the Where step at each width. The walk script stays in the session scratchpad.

## T792: slot registry and the four non-flight adapters

### What changed

`config/slots.json` lists the five price lines of a trip, in order: flight, stay, food, local (getting around) and activities. Each row has:

- `id`, `order` and `labelKey`;
- `subKey` and `icon`, for question 7;
- `adapter`, `pickable` and `status`;
- for stay, food and local, the options the slot can swap between.

`slots.js` reads the registry and builds each slot in the contract's shape. Beside the contract it carries `eurGroup`, the party's figure, so the foot's group total adds up.

- **Prices.** `eur` is whole euros for one person. A slot with `eur: null` stays out of the sum and is never 0.
- **Owners.** A slot the traveller unticks in question 7 becomes `owner: 'you'`. Its `pick` is then null, but it still counts at Carta's typical price, so the total does not change.
- **Swaps.** `chooseOption` swaps a slot to one of its options; the levers and TF2's receipt use it.
- **Settings.** `prepareState` lets each adapter set the planner setting it owns before the quote. Stay sets the tier: the Sleep answer, else the tier for "what matters most" (private room, guesthouse room or a 3-star hotel).

**The adapters wrap the engine and price nothing themselves.**

- **Stay:** the quote's beds. Each tier option is `quoteStay` at the same stops, dates and party with that tier.
- **Food:** the food half of the quote's days. Each option is the stay quote at a Lifestyle preset from `config/pricing.json`: cook some is Backpacker, a mix is Easygoing, eat out is Foodie.
- **Local:** transfers, hops between stops, a hire car and local fares. The car option is the trip quoted again with a hire car. A traveller who avoids a car is not offered one.
- **Activities:** `eur: null`, `options: null`, quality `missing`.

All imports follow the PB3 rule: `price/trip.js` and `price/stay.js` directly, nothing re-exported from `price/index.js`.

### Files touched

**Created:**
- `continent-app/config/slots.json`
- `continent-app/src/lib/recommend/slots.js`
- `continent-app/src/lib/recommend/adapters/stay.js`
- `continent-app/src/lib/recommend/adapters/food.js`
- `continent-app/src/lib/recommend/adapters/local.js`
- `continent-app/src/lib/recommend/adapters/activities.js`
- `continent-app/tests/recommendSlots.test.mjs` (10 tests)

### Commands run

`node --test tests/recommendSlots.test.mjs`, `npx eslint src/lib/recommend`, `npm test`.

### Config and secrets set

`config/slots.json` (new). No secrets.

### Before/after measurements

Not measured. The test cross-checks every stay and food option against a fresh `quoteTrip` with that one setting changed, and they are equal to the euro. It also proves extensibility: one more row plus an adapter adds a slot with no other change, and T793's test shows the same for every trip.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A food option differed from the engine's quote by a cent | Option party figures were not rounded like the slot's | Options round `eurGroup` to whole euros like the slot |
| `npm test`: `rankTier.test.mjs` "every field a list row projects reads the same from the lite record" (7.5 against 7.2) and `wireSplit.test.mjs` (array buffer allocation failed) | Both fail the same way on the base commit, before any change; neither imports a file this batch touched | Not fixed here (row T792-b) |

### What is still open

Merging the batch is the owner's step (row T792-a). The two old test failures need a look (row T792-b).

### Rollback procedure

`git revert e72c763e4` after reverting the later tasks that build on it (T793 to T795). Nothing on screen changes, because nothing imports the module.

## T793: priced trip candidates

### What changed

`buildCandidates` starts from `matchCountries` on `quizAnswers`. The taste it ranks with is `tasteFor`: the saved taste with the trip's likes in its place, plus quiet when the traveller avoids crowds and no car when they avoid one, so `fit()` can name the busy month and a car need. Places inside a country come in `forYou` order.

**Shapes.**

- **One place:** the country's best place.
- **A few towns:** two or three places. Each has at least three nights, lies within 150 km of the first place and at least 30 km from the others, so the Lake District and Keswick no longer make two stops.
- **A road trip:** up to three places with two nights each, within 250 km, with a hire car.
- **Several countries and one way from A to B:** fall back to a few towns in one country (row T793-a).

Nights are split the planner's way: an even share each, the remainder to the first places.

**Gateway.** The first place, in trip order, whose airport has a swept fare from the origin near the day out or in that month. A place's airport is `pickAirport`'s pick when its getting there is known, else its anchor. A ground-only gem with neither (Neuschwanstein, Zermatt) tries the catalogue's nearest airports within 150 km, and the engine prices the transfer from there; Zermatt flies to Malpensa, Hallstatt to Munich. The flight anchors at the airport's own catalogue row. "No flying" has no gateway: the trip drives from home, or goes by train when the traveller avoids a car.

**Dates.** The setup dates when there are some. Otherwise the configured 7 nights, from the first Saturday of the best month: the month whose mean high is closest to the weather answer (warm 27, mild 21, snow 3 °C), or the best month score with no weather answer.

`trips.js` prices each candidate the wizard's way (`wizardPlannerState`, then `quoteTrip`) and cuts the quote into slots.

- **Ids.** A trip's id is a stable hash of its country, places, gateway, nights and month.
- **Memo.** Builds are memoised per answer set. The key covers the guide, dates, party, priority, origin, Lifestyle, stay tier, typed fare, flight file check time, taste and loaded layers.
- **Receipt.** `receiptOf(trip)` reads the trip's own slots, so the card and the receipt cannot disagree.

All numbers live in the new `config/recommend.json`. The prompt names that file under T794; T793 created it with the candidate, gateway, dates and month parts, and T794 added the rest.

### Files touched

**Created:**
- `continent-app/config/recommend.json`
- `continent-app/src/lib/recommend/candidates.js`
- `continent-app/src/lib/recommend/trips.js`
- `continent-app/tests/recommendTrips.test.mjs` (12 tests)

### Commands run

`node --test tests/recommendTrips.test.mjs`, eslint, `npm test`. During the end check: a node profile of candidates against pricing.

### Config and secrets set

`config/recommend.json`: `candidates` (max 24, min 6, 8 countries, 12 places each, the towns and road limits, the fallback shapes), `gateway` (150 km, 3 airports), `dates` (7 nights, Saturday, 12 months ahead) and `month` (highs by weather).

### Before/after measurements

| Metric | Before | After |
|---|---|---|
| Priced trips for the example answers (May 2027) | 0 (country cards) | 8 |
| Same answers, 21 to 28 Nov 2026 | 0 | 6 |
| Any shape, 21 to 28 Nov 2026 | 0 | 20 (24 without a flight file) |
| Same answers give the same ids | n/a | yes (test) |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A few towns paired Rome with Ortisei and the Lake District with Keswick | Places were taken in forYou order with no distance rule | `placesNear` with the configured max and min km |
| Some gems never got a gateway | Ground-only gems carry no anchor airport in the wire | Nearest catalogue airports within 150 km, after every place's own airports |
| With the flight file, a build took 77 ms (end check) | `nearAirports` scanned all 3,868 rows per place | The airport rows are listed once per catalogue (282c5e7f6); now 31 ms |

### What is still open

Several countries and one way from A to B are built as a few towns in one country (row T793-a). With no setup dates the trip starts on the first Saturday of its best month, not on the month's cheapest swept days (row T795-a).

### Rollback procedure

`git revert 282c5e7f6 015c6b4e2` after T794 and T795. Nothing on screen changes.

## T794: rank, budget ruler, match, reasons and catch

### What changed

`rank.js` orders the trips fit first (`rank.fitFirst: true`).

- **Fit.** A trip qualifies when its strongest chosen like reads 0.5 or more wherever the profiles measure it, and no hard conflict stands. The only hard conflict is a car needed by a traveller without one.
- **Order.** Qualified trips come first, then by the trip's `forYou`: the nights-weighted quality of its places plus lambda times (F minus 0.5), as Explore orders places.
- **Budget.** A trip over the typed budget sinks 0.3 for every 100 euros over (`budget.sinkPer100`). With no budget nothing sinks.
- **Ruler.** `budget` is `{ eur, delta }` a person; a day budget counts as the day figure times the nights.
- **Match.** `match` is `{ pct, bars, conflicts }`, with `pct` null below `match.show_min` (0.55). Explore is untouched: `match.for_you_default` stays false.
- **Levers.** `levers` is accepted now:
  - `food` swaps the food slot to an option;
  - `flight` swaps the flight slot to an option once the picker's live options exist; on swept data alone it changes nothing;
  - `bases` keeps one-place or several-place trips.

  Each lever names an existing setting in `recommend.json`; none is a new price rule.

`reasons.js` writes up to three reasons as keys with facts. First the strongest chosen likes from the `fit()` bars, with the best nearby thing, its minutes and the place ("You said Hiking: Via Alpina Purple A40, 24 min from Zell am See"). Then the month's weather when it is within 3 °C of what was asked, a quiet month for a traveller avoiding crowds, and a direct flight or a short airport transfer.

The catch is one, in this order:

1. a `fit()` conflict: busy, car or heat;
2. over budget;
3. a long transfer or a long flight with a change;
4. softer catches: a busier month, no flight price yet, the weakest like.

There are 44 new i18n keys in all six languages: `tf.reason.*`, `tf.catch.*`, `tf.budget.*` and the slot option labels `tf.opt.*`. They were appended by a script, without reading the language files whole, and carry no euro sign; money goes through `formatMoney` in TF2. `scripts/trip_finder_baseline.mjs` prints the plan's four numbers.

### Files touched

**Created:**
- `continent-app/src/lib/recommend/rank.js`
- `continent-app/src/lib/recommend/reasons.js`
- `continent-app/tests/recommendRank.test.mjs` (11 tests)
- `continent-app/scripts/trip_finder_baseline.mjs`

**Modified:**
- `continent-app/config/recommend.json` (rank, budget, reasons, catch, levers)
- `continent-app/src/i18n/en.js`, `nl.js`, `de.js`, `fr.js`, `es.js`, `it.js` (44 keys each)

### Commands run

`node --test tests/recommendRank.test.mjs`, then `node scripts/trip_finder_baseline.mjs --flights <BRU.json>`. BRU.json was fetched once from `data.carta-europetravel.com/data/flights/BRU.json`; the script fetches it itself when no file is given.

### Config and secrets set

`config/recommend.json`:
- `rank`: fitFirst true, mainLikeMin 0.5, hardConflicts car;
- `budget.sinkPer100`: 0.3;
- `reasons`: max 3, two likes, 3 °C, 45 min;
- `catch`: 120 min transfer, 300 min flight, crowd tier 2;
- `levers`.

### Before/after measurements

The before column is today's results: country cards with a day price for bed and food.

| Metric (example answers) | Before | After |
|---|---|---|
| Steps from the last answer to a whole-trip total | 4 | 4 (TF2 wires the screen) |
| Results whose price includes a flight, 9 to 16 May 2027 | 0% | 0% (0 of 8): the sweep reaches 11 Dec 2026 only |
| Results whose price includes a flight, 21 to 28 Nov 2026 | 0% | 100% (6 of 6) |
| Top 6 inside the EUR 1,200 budget, May (no flight in the total) | not ranked | 100% (6 of 6) |
| Top 6 inside the EUR 1,200 budget, Nov (flight in the total) | not ranked | 83% (5 of 6) |
| Build 24 trips, memo miss, after warm-up (node, no flight file) | n/a | 25 to 35 ms median |
| Build 20 trips with the BRU flight file | n/a | 31 ms median |
| Re-rank with a lever | n/a | 0.6 to 1.4 ms median |

The 50 ms target is met for both the build and the re-rank. In TF3 the levers only re-rank, because the build is memoised.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The baseline script crashed on the flight file's check time | The file's top-level `checked` is an ISO string; each day's is in minutes | Print it as it is |

### What is still open

None of its own.

### Rollback procedure

`git revert 6154e4816 bd20e7d78`. This removes the ranking, the 44 keys and the script; nothing on screen uses them.

## T795: the flight adapter with options

### What changed

`adapters/flight.js` prices getting there and home for the party, with bags (T691) and lap fees (T713).

- **Card figure, first choice:** the trip's own quote, Google Flights' swept fare for the exact days, or a live one the planner already holds.
- **Card figure, fallback:** the swept flight nearest each day within the configured spread (`sweptNear`). Each leg keeps its own date in the facts, so a screen can show it.
- **Stale fares.** Fares older than `flights.max_age_days` are ignored. In config that is now 5 days near and 16 far (T780); PRODUCT.md still says 3 and 8 (row T795-b). A stale or missing fare is `eur: null`, never 0.
- **Typed fare.** A fare the traveller typed wins and is the pick `yours`, with no Google Flights attribution.
- **Own car.** Driving their own car is the engine's drive estimate.
- **Attribution.** The pick's facts carry the source (`attribution: 'google_flights'`), both legs with airline, flight number, times, stops, the duration when live, the check time, the fare and bag per seat, and the Google Flights search link. TF2 has what it needs for the airline mark, the check time and "prices may have changed".

`optionsFor(trip, { fetchDay })` is async and separate, so a card never waits on it. It asks `/api/flights` for the trip's out and back days, in the same answer shape `useLiveFlights` reads, and groups each day's flights as cheapest, quickest (fewest stops, then shortest) and best times (`rankFlights` comfort). Each option carries its own leg price for the party, the slot's price a person if it were taken, and the `delta` against the current pick. `cheapestReturn` is not used for the card: a month's cheapest pair would price days the trip is not on (row T795-a).

`slots.js` gains one import line to register the adapter.

### Files touched

**Created:**
- `continent-app/src/lib/recommend/adapters/flight.js`
- `continent-app/tests/recommendFlight.test.mjs` (8 tests)
- `continent-app/tests/fixtures/tf1-flights-BRU.json`: a trimmed copy of the real BRU sweep file of 2026-10-28, four airports, 1 Nov to 11 Dec 2026. Tests re-stamp its check times to now.
- `continent-app/tests/fixtures/tf1-live-BRU-LJU.json`: a hand-built day in the `/api/flights` shape, marked as invented in its `_about`. No live search was run.

**Modified:**
- `continent-app/src/lib/recommend/slots.js` (registers `flight`)

### Commands run

`node --test tests/recommendFlight.test.mjs` and the four `recommend*` tests together: 41 of 41.

### Config and secrets set

None.

### Before/after measurements

These are pinned by tests, not measured:

- the flight slot equals the quote's two legs including bags;
- card total equals receipt total, and both are within whole-euro rounding of the trip's `quoteTrip` grand total whenever the flight is on the exact days;
- a nearest-day leg stays within the spread;
- a stale file gives null;
- a baby adds two lap fees.

The last one closes row T713-a.

### What broke and how it was fixed

No issues. One test was tightened so it cannot pass with nothing checked: "one total" now asserts that at least one trip flies on its exact days.

### What is still open

- **T795-a (owner):** with no setup dates, should a trip start on the month's cheapest swept days?
- **T795-b:** PRODUCT.md's freshness figures are stale.
- **T795-c (owner):** months beyond the sweep's six weeks (the plan's May example) show no flight figure.

### Rollback procedure

`git revert 1dfb201fc`. The flight slot then prices as missing, and nothing on screen changes.

## T796: question 7, and the WhereQuiz leaves

### What changed

Help me choose has a seventh question, `g:pick`, after the budget: "What should Carta pick for you?", with the helper "Every trip is priced in full either way. Untick what you'd rather choose yourself."

- **The rows** are `config/slots.json`'s pickable slots in order: flights, where to stay, getting around, and things to do. "Where to go" comes first, always ticked, with an "Always" status chip.
- **Not yet.** A `notYet` slot (things to do) shows a "Not yet" status chip, reads in `--text-3` and cannot be ticked.
- **Kit.** The live rows are the kit's ChoiceRows multi. The two fixed rows reuse its row markup with `aria-disabled`. Every icon name is in `components/Icons.jsx` (gotcha T749).
- **The answer** is `settings.guide.pick`. It defaults to every pickable live slot and maps to `slot.owner` through `trips.js`.

On the Where step's help tab the pre-answered WhereQuiz is gone. The answers stay in the trip settings behind the gear. The country results list is unchanged; the engine is wired to the screens in TF2.

**Scope note.** `planner/flow/QuestionScreen.jsx` is not named in the prompt, but it gained one line: it is the only place a custom question screen is registered. Without that line the screen cannot render.

There are 17 new i18n keys in six languages: the question, its helper, the slot names and subs, "Always", "Not yet", and `tf.opt.flight.live` for T795's live pick.

**Seven questions (carta-design):**

1. **Hex values:** none; only tokens.
2. **Gradients or new colours:** none.
3. **Brown and selection:** brown only on the selected rows (the kit's tint and tick) and the one primary; the locked row is selected, the not-yet row is not.
4. **Text sizes and money:** no text under 11 px and no figure on the screen.
5. **Primaries and photos:** one primary (Continue) and no photo.
6. **Copy:** the headline is a question with a verb; no count; no dashes and no banned words in the new strings.
7. **Remove one thing:** the help line under the title was kept because the owner wrote it into the plan.

### Files touched

**Modified:**
- `continent-app/src/planner/flow/questions.js`
- `continent-app/src/planner/flow/setupScreens.jsx` (`PickScreen`, `FixedPickRow`)
- `continent-app/src/planner/flow/flowGraph.js` (GUIDE)
- `continent-app/src/planner/flow/tripSettings.js` (`PICKABLE`, `guide.pick`)
- `continent-app/src/planner/flow/QuestionScreen.jsx` (one registration line)
- `continent-app/src/planner/wizard/StepWhere.jsx` (WhereQuiz removed)
- `continent-app/src/styles/86-plan-flow.css` (`.pf-pick*` only, no generic selectors)
- `continent-app/src/i18n/*.js` (17 keys each)
- `continent-app/tests/flowGraph.test.mjs`
- `continent-app/tests/tripSettings.test.mjs` (one new test)

### Commands run

Eslint on the touched files: no errors; one warning in `setupScreens.jsx:68` that was already there. Then `node scripts/ci/design-lint.mjs`. It reports 32 violations outside its baseline, all in files this batch did not touch. The one hit in a touched file is a banned-word hit in `en.js:6611` (`dest.around.good`), a string that predates the batch. Then the flow tests: 94 of 94.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After |
|---|---|---|
| Help me choose questions | 6 | 7 |
| WhereQuiz on the Where step | shown | gone |
| Fast build modulepreloads | 37 | 37 |
| Fast build assets | 124 | 124 |
| Fast build JS bytes | 6,556,733 | 6,571,396 (+14,663: strings and question 7) |
| First-paint JS bytes (scripts in index.html) | 1,358,546 | 1,360,379 (+1,833: `slots.json` via `tripSettings.js`) |

**Browser round, 390 px and 1440 px.** The 18 checks, all passed at both widths:

- question 7 is "7 of 7";
- the rows are in slot order;
- Flights, Where to stay and Getting around are ticked by default;
- Where to go is ticked and stays ticked after a tap;
- Things to do reads "Not yet" and cannot be ticked;
- each live row unticks and ticks again;
- the answer is stored as `guide.pick ["flight"]`;
- Continue opens the Where step;
- the Where step has no WhereQuiz;
- the results list is still drawn.

### What broke and how it was fixed

No issues in the code. The walk needed scoping to `.pf`, so that "Skip to content" was not taken for "Skip, ask me".

### What is still open

At both widths the Where step's help tab keeps an empty band of about 70 px where the quiz sat. The spacing lives in the planner sheet's section rules, outside this task's files (row T796-a).

### Rollback procedure

`git revert 9457809aa`. This restores six questions and the WhereQuiz. A stored `guide.pick` is dropped by `normalizeSettings` on the next read, because the reverted code does not know the field.
