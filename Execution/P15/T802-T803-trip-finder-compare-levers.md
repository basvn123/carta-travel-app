# T802 to T803: compare and levers on Trips for you (batch TF3)

## Shared header

**Batch.** TF3 of the trip finder plan (artifact CWqb1r4aCvzrCYrjn21TUj, queue prompt `Execution/_queue/TF3-trip-finder-compare-levers.prompt.md`). Trips for you gains two things: a Compare tick on every card with a table of two to four trips side by side, and one row of trade-off chips (flight, food, bases) that re-rank and re-price the list in place.

**Date.** 2026-10-29.

**Inputs read.** The plan's `review` collection was empty on 2026-10-28, so the prompt stands as written. The owner's picks (artifact 7WFimdaK7kRucMARKkLePr, `reactions`, 18 rows) agree with it: "the possibility that you can see multiple trips really" (setup-d) and "Trade-off levers" (love). The plan draws the levers as two sliders; the prompt's chips (one choice per group) are what was built. Also read: the TF2 and TF1 reports, PRODUCT.md, DESIGN.md, the carta-design skill, `planner/CompareSheet.jsx` and `lib/countryCompare.js`, and impeccable (Operate mode) with its craft floor before the first UI edit.

**Task numbers.** T802 and T803 were free and reserved for this batch: the highest number in `git log --all` of the root repo and of `continent-app/` was T801 (T798 apart), every worktree's `Execution/` stopped at T801, `wt/vite.t*.mjs` at t797, and the SW2 prompt says "The trip finder's TF3 prompt reserves T802 and T803" (SW2 took T804 and T805).

**T798 used twice.** TF2's trip card (8cd6bd8ac) and the flight sweep's late tier (app 8866484, root e9131d417) both carry T798. SW2's report names the shared number in prose and its row T805-c asks for the late tier's missing report, but no row gives the renumber decision to the owner, so this batch adds T802-d.

**Branch.** `p15-trip-finder-compare` in the worktree `.claude/worktrees/travel-app-ui-refinements-5e0525`, cut from the tip of `p15-trip-finder-screens` (eff77f9ce, the TF2 report), with a clean tree apart from the untracked queue prompts. `continent-app/` is a plain folder of the root repo here, so there is one branch. Not merged, mirrored, pushed or deployed: TF1 to TF3 ship together (rows T792-a and T803-f).

| Task | Commits |
|---|---|
| T802 | 9fa4bfe82, 156e6dbe0 (end check) |
| T803 | a2e423ffd (engine), 5bb2bf95d, c91d7bd5a (engine, end check), d108bd1ce (end check) |

**Checks.**
- **Per task:** eslint on the touched files (clean), `node scripts/ci/design-lint.mjs` (32 new violations before and after, none in this batch's files; the same count TF1 and TF2 reported), `npm test`.
- **`npm test`:** after T802, 938 tests, 931 pass; after T803, 945 tests, 938 pass. Each time the only 2 failures are the T792-b pair (rankTier "lite record" and wireSplit "published split"). On the final tip wireSplit failed once as a whole file (its allocation error); run alone it is the same single known failure, 7 of 8 pass.
- **End of batch:** the NOPUBLIC fast build (`wt/vite.t802.mjs`, about 8 s), the bundle measure (`wt/t802-measure.mjs`), and one browser round (`wt/t802-walk.mjs` on `wt/t797-serve.mjs`, port 5802; Playwright with `serviceWorkers: 'block'`, the sweep file and `/api/flights` routed to the T795 fixtures) at 390 px and 1440 px.

**Browser round.** The final run passed 81 of 81 DOM checks at both widths, with no page errors and no console errors (the data host refusing CORS to localhost is filtered, as in TF1 and TF2). Screenshots, one per screen and width, are in `wt/t802-shots/`: the tray, the table with two trips, the table with four, a receipt over the table, the levers, the bases fallback. Earlier runs found what is listed under each task's "What broke".

Two limits of the local walk, written down rather than hidden:
- **No taste profiles reach it.** The cards show no match (TF2's walk logged "pct null" too), so the table's Match, Day highs and Crowds rows read "Not available yet" in the browser. The node tests prove those rows on the full catalogue; seeing them filled in a browser needs a deployed preview (row T802-b).
- **No flight durations.** The T795 fixture's swept legs carry no minutes, so Door to door is NotYet on every trip and Quickest orders by stops alone (row T802-e).

**Bundle** (`wt/t802-measure.mjs`, the same script on both builds; "before" is TF2's own after-build `wt/dist-t797-after`, whose first paint matches the TF2 report to the byte):

| Measure (NOPUBLIC build) | Before (TF2 tip) | After | Delta |
|---|---|---|---|
| Modulepreloads in index.html | 37 | 37 | 0 |
| First-paint JS bytes | 1,360,428 | 1,360,723 | +295 |
| Plan tab first-load JS bytes (first paint, the Plan chunk and its static imports) | 2,874,725 | 2,876,375 | +1,650 |
| Finder chunk (`FindingTrips-*.js`, lazy) | 52,650 | 64,005 | +11,355 |
| Assets | 126 | 126 | 0 |

The script counts the Plan tab's closure 7,231 bytes lower than TF2's one-off figure (2,881,956); only the same script on both builds is compared here. The Plan tab's first load grows 1,650 bytes against the prompt's "no growth": 1,355 bytes are the new English strings in the chunk that holds `en` (the cause row T801-c already names) and 295 bytes are the settings normaliser that keeps `guide.levers`, which sits in the first-paint `taste` chunk. Preloads do not grow; the compare table and the lever code load only with the finder (row T803-c).

**Baseline** (`node scripts/trip_finder_baseline.mjs --flights tests/fixtures/tf1-flights-BRU.json --bundle-before wt/t802-measure-before.json --bundle-after wt/t802-measure-after.json --walk wt/t802-walk.json`):

| Metric | Before (TF2) | After |
|---|---|---|
| Trips the traveller can see side by side | 1 (one receipt at a time) | up to 4 |
| Lever tap to re-ordered list, 390 px, 4x CPU throttle, 20 taps a lever (final run) | no levers | flight 36.9 ms median, 146.2 ms worst; food 30.3 / 138.4; bases 97.5 / 248.7 |
| Lever re-rank alone, in node (build is memoised) | no levers | 0.1 ms flight, 0.1 ms food, under 0.1 ms bases; the build 11.6 ms on a memo miss |
| Compare cells equal to the trip's own figures (total, flight, stay, budget over every block of four) | n/a | 80 of 80; the catalogue test also pins days and match |
| Plan tab first-load JS | 2,874,725 | 2,876,375 (+1,650), preloads 37 to 37 |

The answers behind the timing are the plan's example with any shape, which gives 20 trips, not 24: the engine builds what these answers allow. The re-rank split shows that a lever's own engine cost is a tenth of a millisecond; the rest of a tap is React's render, layout and paint of the cards. Over four runs the bases median was 105.5, 66.2, 105.0, 80.1 and 97.5 ms: under 100 ms in some runs, not reliably. Flight and food medians stay between 28 and 37 ms. Worst taps at 4x CPU reach 95 to 146 ms for flight and food and 173 to 286 ms for bases (row T803-a).

## T802: the compare tray and the compare table

### What changed

**The rows (`lib/recommend/compare.js`, pure).** `compareRows(trips, { settings, destinations })` returns one row per figure in the plan's order (total a person, flight, stay, days, match, door to door, day highs, crowds, budget), one cell per trip, every value read from the trip object the card and the receipt draw. Days is food plus getting around, added the way the card's `threeFigures` adds them.
- **Door to door** is the outbound flight's minutes plus the gateway transfer, NotYet when either is missing.
- **Day highs** are `taste.tmax_by_month` over the trip's places (the source `reasons.js` reads).
- **Crowds** is the busiest `taste.crowd_by_month` tier (the source `fit()` reads), printed with the app's crowd words.
- **Budget** is the ruler's delta, and the row exists only when a trip has a budget.

Each row with a direction marks one best cell: the lowest money or time, the highest match, the day highs closest to the weather answer (`month.tmaxByWeather`), the quietest crowds. No cell is marked on a tie, with fewer than two figures, or on a missing figure. A total that leaves a slot out ("without the flight") is shown but never marked, and neither is its budget delta: it is not the same sum. Roadmap 5.13's vote link can read the same rows.

**The tick.** Each card has a real checkbox with its label "Compare", named "Compare {trip}" for a screen reader, above the stretched total. Up to four. A fifth says "Compare up to 4 trips" in one line under that card and changes nothing. Ticks live in memory for the visit, keyed by the answers without the levers. They clear when an answer changes and hold while a question is reopened unchanged.

**The tray.** From two ticks, a floating bar at the foot of the list: "{n} trips to compare" and one primary, "Compare". It is sticky above the bottom nav and the safe area. On a desktop it is 440 px wide and centred in the plan stage. The list itself has no other primary.

**The table.** It opens on SheetShell, the receipt's sheet (full screen on a phone, 880 px on a desktop), titled "Compare trips". The columns are the trips, each headed by a small photo (no text on it), the trip's name and "Remove" while more than two are left. The table reuses the country compare's unscoped classes (`cmp-scroll`, `cmp-table`, `cmp-rowhead`, `cmp-fig`, `cmp-sub`, `cmp-best`). The finder sheet adds:
- the sticky row labels;
- 128 px columns on a phone (two fit 390 px; three or four scroll sideways inside the sheet) and 168 px from 640 px;
- the sun tint on a best cell, `--sun-100` with the existing best-value chip (`Chip tone="best"`);
- an over-budget delta in `--amber-ink` with its word "over".

Each column's foot has "Open" (the receipt) and "Plan this trip". Only the column in focus or under the pointer shows "Plan this trip" as the primary; the others are quiet.

**Focus and Escape.** Closing the table returns focus to the tray's button. A receipt opened from a column opens over the table, and Escape or its close returns to the table with focus on that column's "Open". The trap stack in `useFocusTrap` gives Escape to the newest sheet only (the escape-stack rule). Removing a trip from the table unticks its card.

**Owner decision against the skill.** carta-design marks best value "once per view". The owner's TF3 decision marks one cell per row in the compare table, so one table can carry up to nine marks, one a row. Built as the owner decided; the skill and DESIGN.md do not record the exception yet (row T802-a).

### Files touched

**Created:**
- `continent-app/src/lib/recommend/compare.js`
- `continent-app/src/planner/finder/TripCompare.jsx`
- `continent-app/tests/recommendCompare.test.mjs` (7 tests)

**Modified:**
- `continent-app/src/planner/finder/TripCard.jsx` (the tick)
- `continent-app/src/planner/finder/TripsForYou.jsx` (ticks, tray, the sheet)
- `continent-app/src/planner/finder/FindingTrips.jsx` (one line, outside the prompt's list: TripsForYou had no way to reach T801's "Plan this trip", so the screen hands `onPlan` down; the receipt stays where it was)
- `continent-app/src/styles/87-trip-finder.css`
- `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (23 keys each, appended by script without reading the files whole)

`planner/CompareSheet.jsx` is untouched.

### Commands run

`node --test tests/recommendCompare.test.mjs` (7 of 7), `npx eslint` on the touched files, `node scripts/ci/design-lint.mjs`, `npm test`, then the end-of-batch build, measure and walk in the shared header.

### Config and secrets set

None.

### Before/after measurements

Trips side by side: 1 before, up to 4 after. Compare cells equal to the trip's own figure: 80 of 80 in the baseline, and every money cell of every block of four trips on the catalogue in `recommendCompare.test.mjs`. Browser: the table's totals equal the cards' totals at both widths.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| My own fixture asserted the wrong best door to door | Trip x (155 min) was lower than y (230) | Fixture fixed (y 90 min), assertion unchanged |
| eslint: `NotYet` unused | A destructured component argument used only as JSX | CellText takes `ui`, as TripCard does |
| The screen-reader name of the tick was built by concatenation | A visually hidden ", {name}" after the label | An `aria-label` key, `tf.cmp.tickOne` |
| The column's "Open" and the tray's "Compare" shared a key | One key for two jobs | `tf.cmp.openCol` for the column |
| End check: plain cells looked grey and uneven | The cells are transparent and the sheet's fill showed through | `.tff-cmp-scroll` on `--surface` (156e6dbe0) |
| End check: "Plan this trip" from the table gave Finish 1,190.73 against a card of 1,168 | The walk planned Edinburgh, whose total has no flight, while every live search is answered with the LJU fixture, so the planner found a flight the finder never had (TF2's walk picks "all in" cards for this reason) | The walk picks "all in" cards |
| End check: Augsburg and Neuschwanstein, Finish 1,181.85 against a card of 1,433 | Not this batch: the same gap through the receipt on TF2's own build (`wt/dist-t797-after`), and with the live search failing; the node hand-off test passes this trip to the cent | Left out of the walk's check, row T802-c |
| Screenshots caught the sheet half arrived | The shot ran during the sheet's entrance | The walk waits 700 ms before each shot |

### Screens and states for the end check (all checked)

The tick on a card; one, two, three and four ticks; the refused fifth; the tray at both widths; the table with two trips (fits 390 px) and with four (scrolls inside the sheet, labels stay put, no page scroll); best marks, partial totals unmarked, budget row with and without a budget; Open from a column and Escape back; the column in focus carrying the primary; Remove unticking the card; Plan this trip from a column landing in the planner with Finish equal to the card (Prague and Bled, within slot rounding).

### Seven questions (carta-design)

1. **Hex:** none.
2. **Gradients or new colours:** none; `--sun-100`, the best chip's `--best`, `--amber-ink` for "over" (with its word), `--surface`.
3. **Brown and sun:** brown only on the checked tick (`accent-color`, a selection), the tray's and the focused column's primary, and the quiet buttons' text; sun only on best cells, one per row by the owner's decision (row T802-a).
4. **Text sizes and money:** whole euros through `formatMoney`, tabular numerals on every figure; row labels at `--text-caption` 600; nothing under 11 px.
5. **Primaries and photos:** one primary on the list (the tray), one in the table foot; no text on the photos.
6. **Copy:** "Compare trips" names the view; "{n} trips to compare" carries a number; no dashes, middots or banned words; no tilde, "est." or "live" on a price.
7. **Remove one thing:** the country compare's lead and note lines are not carried over; the table has no subtitle.

### What is still open

- **T802-a.** The skill says best value once per view; the owner's TF3 decision marks one per row in the compare table. Record the exception in `.claude/skills/carta-design/SKILL.md` and DESIGN.md (outside this batch's files).
- **T802-b.** Match, Day highs and Crowds were never seen filled in a browser: the local walk gets no destination taste profiles (the cards show no match either). Check them on a deployed preview.
- **T802-c.** Augsburg and Neuschwanstein lands in the planner at Finish 1,181.85 a person against its card's 1,433 (about its 251 euro flight), through the receipt or the table and on TF2's build too, while the node hand-off test passes it to the cent. Find the browser-only cause.
- **T802-d.** T798 is used twice (TF2's trip card, the late tier). A renumber is the owner's call.
- **T802-e.** The swept legs in the T795 fixture carry no flight duration, so Door to door is NotYet on every trip and Quickest orders by stops alone. Check whether the live sweep files carry minutes; if not, the row and the lever need a duration source.

### Rollback procedure

`git revert 156e6dbe0 9fa4bfe82` removes the ticks, the tray and the table. Revert T803 first or expect conflicts: T803's commits edit the same lines of `TripsForYou.jsx`, the end of `87-trip-finder.css` and the end of each language file. The tasks are independent in behaviour, not in text.

## T803: the trade-off levers

### What changed

**The flight lever's rule: (a), re-rank by the swept facts.** The TF2 report shows no live list is cached for the visible trips (the picker's options load only when it opens), so (b) was not taken. On swept data a trip has one flight a day and the lever cannot swap it. Instead each lever value orders the trips by their flights (`adapters/flight.js`, `flightLeverKeys`):
- **cheapest:** the flight slot's figure;
- **quickest:** the stops, then door to door;
- **times:** rankFlights' comfort order of the swept legs, both directions, so a stop and an early or late hour cost, as in the picker.

`rank.js` `flightPull` sinks each trip by its place in that order, up to `FLIGHT_PULL`. Ties share a place, and a trip with no flight facts sits in the middle. The pull is the same as being 500 euros over budget (5 times `budget.sinkPer100`), so a strong fit still leads and the flight decides between close trips. No price changes under this rule. The chip's helper says nothing about method.

**The chips.** One row under the answers bar, three single-choice groups (kit `ChipGroup` and `Chip kind="choice"`: radios, arrow keys move the choice, the selected chip takes the select tint and a tick). The groups are:
- Cheapest flight, Quickest, Best times;
- Cook some, A mix, Eat out;
- One base, Several bases.

On a phone the row scrolls sideways with a hairline between groups; from 769 px it wraps, with a wider gap instead of the hairline. Each group starts from the traveller's own settings (`startLevers`):
- **flight:** the priority, through `flightRanking`;
- **food:** the Lifestyle, when it is one of the food slot's presets;
- **bases:** the shape answer ("only one place" is one base, only moving shapes is several; both or neither leaves the group unset, still reachable by Tab).

**Moving a lever.** The tap stores the group in `settings.guide.levers`. `useTripFinder` leaves the levers out of its answer key and re-ranks the trips it already built with `findTrips(input, { levers })`, which hits the build memo. The loader never runs again, and the list, the cards, the receipt and the compare table all read the same levered trip objects. The answers bar is untouched, and a ticked trip stays ticked while it is in the list (the tick key also leaves the levers out).

**Motion.** Cards slide from their old place to the new one (FLIP with `element.animate`, transform only, `--dur-2` and `--ease-out` read once from the tokens); a card new to the list fades in. Under `prefers-reduced-motion` they jump.

**Bases fallback.** When the bases choice leaves no trip, `applyLevers` keeps the whole list. The screen says so in one line ("No one-base trips fit your answers, so all trips show.") with one action, "Show several bases" (or "Show one base"). The list is never empty.

**Remembered, and not handed over.** `normalizeSettings` keeps `guide.levers`, known values only. Going back to a question and returning keeps them (checked in the browser). "Plan this trip" carries the trip's own picks through `planOf`, as in T801; the levers are never written into the planner. Finish equals the card after a lever (Prague, 884.20 against 884, Eat out).

### Files touched

**Modified:**
- `continent-app/src/lib/recommend/rank.js` (`flightPull`, `FLIGHT_PULL`; own engine commits a2e423ffd and c91d7bd5a)
- `continent-app/src/lib/recommend/adapters/flight.js` (`flightLeverKeys`; engine commit a2e423ffd)
- `continent-app/src/planner/finder/finderHooks.js` (`answersOf`, `startLevers`, `useLevers`; levers applied in `useTripFinder`)
- `continent-app/src/planner/finder/TripsForYou.jsx` (chips, motion, fallback; the tick key leaves the levers out)
- `continent-app/src/planner/flow/tripSettings.js` (outside the prompt's list, and needed for "kept in `settings.guide.levers`": `normalizeSettings` drops unknown keys. `LEVER_VALUES` is written out there instead of importing `config/recommend.json`, so the Plan chunk does not pull the config (the T801 preload trap); the test pins the two equal)
- `continent-app/src/styles/87-trip-finder.css`
- `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (16 keys each)
- `continent-app/scripts/trip_finder_baseline.mjs` (the TF3 table, named in the prompt)

**Created:**
- `continent-app/tests/recommendLevers.test.mjs` (7 tests)

### Commands run

`node --test tests/recommendLevers.test.mjs` (7 of 7), the TF1 and TF2 engine and finder tests after the engine commit (36 of 36), `npx eslint`, design lint, `npm test`, `node scripts/trip_finder_baseline.mjs ...` (shared header), and three Playwright probes (`wt/t802-prof*.mjs`) for the tap's time split.

### Config and secrets set

None. `settings.guide.levers` is a new optional field of the stored trip settings, `{}` by default; older code ignores it.

### Before/after measurements

See the shared header: medians of 37 ms (flight), 30 ms (food) and 66 to 105 ms (bases) from a lever tap to the re-ordered list painted, at 390 px and 4x CPU. The engine's share is 0.1 ms. The food lever's line equals a fresh build at that Lifestyle to the euro on all 20 trips for each of the three values (60 of 60).

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A Python edit matched nothing in `finderHooks.js` | The file has CRLF line ends | The edit script normalises and writes back the file's own ends |
| End check: the flight lever moved no visible card with "a few towns" | At 200 euros the pull never crossed a gap between the six trips' scores | `FLIGHT_PULL` raised to 500 euros (c91d7bd5a, its own engine commit); each value now gives its own order |
| End check: about 11 ms a tap went to `getPropertyValue` | The motion hook read the motion tokens right after the new order was committed, forcing a whole style pass | Read once, before the tap (d108bd1ce) |
| End check: on a desktop the bases group wrapped with its hairline at the start of the second line | The separator is a left border | From 769 px the row wraps and the groups part by a gap, no hairline |
| This changes TF2's default order | Every traveller now starts with their priority's flight lever applied (balance gives Best times), so trips with close scores can trade places against TF2's list | Intended by "each group starts from the traveller's own answers"; prices are unchanged |

### Screens and states for the end check (all checked)

The chips at both widths; the starting chip of each group (Best times for balance, Several bases for "a few towns"); each flight value re-ordering; each food value re-pricing with one checked chip; the answers bar unchanged; a ticked trip staying ticked; the bases fallback line and its action; reduced motion (no card animates); a lever kept after reopening a question; Plan this trip after a lever with Finish equal to the card.

### Seven questions (carta-design)

1. **Hex:** none.
2. **Gradients or new colours:** none; `--border-soft` for the hairline.
3. **Brown:** only the selected chip in each group (the kit's select tint and tick) and the fallback's quiet action.
4. **Text sizes and money:** chips at the kit's size; the fallback at `--text-label`; prices are the cards' own.
5. **Primaries and photos:** no primary added; the tray stays the list's one.
6. **Copy:** chip labels are short choices; the fallback line says what happened and gives one way back; no method words in any helper; no dashes or banned words.
7. **Remove one thing:** the group names are not drawn (the chips name themselves; each group keeps its name for screen readers).

### What is still open

- **T803-a.** The bases lever paints in 66 to 105 ms median over four runs and up to 286 ms worst at 4x CPU, because it mounts six new cards. Flight and food stay near 30 to 37 ms median, 95 to 146 ms worst. Lighten a card's mount (TF2's files) or keep cards mounted across the bases switch.
- **T803-b.** A trip swapped on the receipt keeps its whole stored state when a lever moves (FindingTrips replaces it with the stored edit), so that card ignores later levers until the answers change. Applying levers on top of swaps needs the edits reworked in `FindingTrips.jsx`.
- **T803-c.** The Plan tab's first load grows 1,650 bytes (1,355 English strings, 295 settings normaliser); preloads stay at 37. Same decision as T801-c.
- **T803-d.** When the shape answer allows both kinds, the bases group starts unset, and a radio group cannot go back to "either" once a chip is tapped. Decide whether bases needs an "Any" chip.
- **T803-e.** `FLIGHT_PULL` lives in `rank.js` as 5 times `budget.sinkPer100`; move it to `config/recommend.json` with the other weights.
- **T803-f.** TF3 (branch `p15-trip-finder-compare`, on top of TF2) ships with TF1 and TF2: merge, mirror and deploy together (row T792-a).

### Rollback procedure

`git revert d108bd1ce c91d7bd5a 5bb2bf95d a2e423ffd` removes the chips and the flight pull. The list keeps TF2's order, and a stored `guide.levers` is ignored. No data, schema or config migration.

## Open items written to `_OPEN.md`

T802-a to T802-e and T803-a to T803-f, in the commit that carries this report. No earlier row is closed: none of the open `next task` rows falls inside this batch's scope.
