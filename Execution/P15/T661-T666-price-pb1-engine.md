# T661 to T666: price engine PB1, baseline (F1) and one engine for the day price (F2)

## Shared header

**Batch.** PB1 of the master prompt over the Claude Doc "Carta prijslogica Explore: plan" (https://claude.ai/artifact/3aBYSPsJ3a1RzrRiS6cvrn): phase F1 (the baseline, T661) and phase F2 (one engine for the day price, T662 to T666, one task per screen group because the doc's F2 rollback is "per screen").

**Numbering.** The highest number in `git log --all` and every worktree was T652 when the batch started. A parallel session (trip planner flow, app branch `p15-trip-planner-flow`) took T653 at 14:05 and reserves T653 to T660 (`wt/vite.t653.mjs`); this batch had committed T653 to T658 at 14:15 and was renumbered to T661 to T666 before anything was merged (both sessions agreed by message). Next free number after this batch: T667 for that session's overflow, so check before taking one.

**Preconditions.** F0 (T643 to T646, report `Execution/P11/T643-T646-price-f0-scrape-gate.md`) is merged in root main and app master. Root main 2f32807b4 and app master e957929 carry T640 to T652. B5, B6 and B7 were decided by the owner on 2026-10-24 (the owner delegated the choice and took the recommendations) and are marked "Besloten (24-10-2026)" in the doc; B8 to B11 stay open (PB2 and PB5 need them).

**"Explore data fill step 2"** (T640 to T648) is the base this batch builds on: the engine reads the destination record as that batch left it, and its T641 price records (`do[].price`, `lift.fare`) wait for F9. Nothing in PB1 needed a box run.

**Branches.** App `p15-price-pb1-engine` (from master e957929, worktree `wt/p15-price-pb1-app`), head 4c4bd86. Root `p15-price-pb1-engine` (from main 2f32807b4, worktree `wt/p15-price-pb1-root`): mirror 53c89a053, then this report and the register. Not merged, not pushed, not deployed.

**Static checks.** eslint on every touched src file: 0 errors (4 warnings, all there before). `npm test`: 680 pass, 3 fail, the three `numbersPage` tests that need `public/boot.json`, which a worktree does not have (663 pass on the same worktree before the batch). Scripts are outside the eslint config: `node --check` on each. Fast NOPUBLIC build (`wt/vite.t661.mjs`): passes, 106 assets.

**End check.** One round on the batch branch, dev server on port 5261 serving the main tree's `public/`, headless Chromium, script `wt/pb1-endcheck.mjs` (outside the repo). Four states: the default; 7 people, 3-star hotel, own dates 5 to 12 December; the Explore month filter on June (`xm=6`); any time. At 390 x 844 and 1280 x 800: the first three Explore cards against their destination page header, and the Lake Como lake page's base-town line against Lake Como's destination header. 32 of 32 comparisons equal, no horizontal scroll, no page error. The only console errors are the flight sweep blocked by CORS on localhost, so the flight line could not be checked in the browser (T663-b). `xm=11` shows 0 places: register row T649-d, not this batch.

**Measurements (all 3,868 destinations, default request, shipped wire).**

| Measure (plan section 8) | Before | After |
|---|---|---|
| Places whose Explore card, place page and prerendered page disagree | 3,867 of 3,868 (mean 13.02 euro, worst 53.15 euro at Antiparos) | 0 |
| Calculation paths outside the engine (comment-stripped scan, kernel files excluded) | 21 files | 12 files, all marked F6 in `tests/priceSources.test.mjs` |
| Rules without a source | Not measured (F3 moves them into config) | Not measured |
| Coverage, bed | 3,868 priced (234 measured, 3,634 modelled; 56 repaired with the country median) | same |
| Coverage, food | 3,868 (21 measured, 3,847 modelled) | same |
| Coverage, local transport, car, activities | not represented | 0 priced; the line exists and reads "missing", never zero |
| Default Explore card, before to after | Carta's suggested week (exact November nights) | the year's average (B5): median +8.5%, p10 +4.2%, p90 +20.4% |

**Screens the next batch's end check (PB2: F3, F4) must look at.** Every price screen at phone and desktop width in both views (per person and total): Explore card, pin, rails and preview; destination header, calculator and food fold; Places place cards; country and region pages; home; Ask find and compare; shortlist; a lake, beach, mountain and trail page; the day planner's day figure; the opened price with its item switches on card, header and calculator; the internal provenance view; Explore's budget filter and price sort; PRODUCT.md:61 wording.

---

## T661: price baseline (F1)

### Task ID

T661

### Date

2026-10-24

### What changed

- The live site against the code (plan P15). The live bundle (www.carta-europetravel.com, `index-CQK0Sf1Q.js`, 74 chunks fetched) lacks the T649 to T651 strings ("Crowds in", "Easy without a car", `airportOptEst`), so live runs an older build than the code. It carries every day-price kernel commit: T534 bedPrice, T540 live prices ("Adjusted to live prices for your nights"), T579 party shares (`group_size??2,1,99`). The last price-code commit after those, T597 (22 Oct), touches only the trip way. The live and local stays build is the same (2026-10-21T23:42:53Z). So the baseline is fair without a new deploy; the strings the analysis quoted are older still.
- `tests/fixtures/price/destinations.json`: six real records and their stays records copied from `public/app_data.json` and `public/stays/v1/`: Lake Como, Kotor, Bergen, Lisbon (city), Lagos (beach), Zermatt (mountain).
- `tests/fixtures/price/screens.mjs`: one adapter per day-price screen of doc 4.3, written as the call that screen made on master: Explore card (App map or ExploreTab's month map), destination header, Places place card, calculator day and total, day planner, place page (`useBaseDay`), cheaper-base bed (`usePlaceExits`), prerender, OG card.
- `tests/priceGolden.test.mjs` and `golden.json`: four requests (the default; 7 people, 3-star, Nightlife, own dates 21 to 28 November; November as a month and as `xm=11`; any time) x six places x every screen, in cents, as a snapshot (V10). `UPDATE_GOLDEN=1` re-records on purpose.

### Files touched

App, created: tests/priceGolden.test.mjs, tests/fixtures/price/destinations.json, tests/fixtures/price/screens.mjs, tests/fixtures/price/golden.json. Commit 51a2aa3.

### Commands run

curl of the live index and chunks into the scratchpad; the fixture extraction in Python; `UPDATE_GOLDEN=1 node --test tests/priceGolden.test.mjs`; `npm test`.

### Config and secrets set

None.

### Before/after measurements

The baseline itself is the "before" of every F2 task (tables under T666). On master, under the default request, Lake Como read 110.14 euro on the card and 122.63 euro on its place pages and in the prerender: the doc's P1 and P4 in one number.

### What broke and how it was fixed

Nothing.

### What is still open

The baseline holds day prices only; trip prices (calculator flight, composeTrip, priceTrip, wizard, country brief, Ask budget, saved trips) join it in PB3 before F6 moves them (T661-a). Files outside the F2 list that the batch needed are listed in one row (T661-b).

### Rollback procedure

Revert app 51a2aa3 (test files only).

---

## T662: the price engine (F2)

### Task ID

T662

### Date

2026-10-24

### What changed

- `src/lib/price/request.js`: the request of doc 4.2. `when` comes from `lib/when.js` `resolveWhen` (exact, month, any; the Explore month filter wins), with `start`/`end` only for exact and a `ym` for the month's flights; `nights` is the date pair's length in every mode (a month or any time keeps the pair, T578), else 7; `group` is `{adults, children, babies}` from `lib/party.js` `partyOf`; then stay, lifestyle, transport, origin, drive home, baggage, view (`pp`), excluded items, activities, sub-area. `DEFAULT_PRICE_REQUEST` (B5: two adults, entire place, Easygoing, any time, 7 nights). `priceRequest(state)`, `requestKey`, `costChoices` (what costIndex reads: dates only for exact, a month only for month, V7), `flightWindow`, `seatsOf`, and `atDates` (T666).
- `src/lib/price/priceDay.js`: `priceDays(destinations, request)` and `priceDay(dest, request, catalogue)` wrap `computeCosts`, so the bounds, the country repair and the child share are the same on every path. Each line is euros per person per day in whole cents and `dayEur` is the sum of the included lines, so total = day x seats x nights and day = total / seats / nights (rule 7, B6, V3). Lines: bed, food, transport, car, activities, each `{key, status, eur, quality, basis, provenance}`; transport, car and activities are `missing` with `eur: null` until F6, F8 and F9 (rule 8); an excluded item is marked `excluded` and leaves the sum (rule 9's request field; the UI is F4). `foodBreakdown` itemises the food line at the request's lifestyle and child share.
- `src/lib/costIndex.js`: `computeCosts` split into `costContext` and `costRow` (behaviour kept); the bed now gets the party's adults and children separately (before, every seat was priced as an adult: one definition of group); the country medians are computed once per catalogue object.
- Tests: `tests/priceEngine.test.mjs` (B5, V3 over 400 random requests, V6 for the bed over every tier and parties of 1 to 12, V7, B7, one group, the map and a single place agree, the country repair, the food breakdown, excluded and missing items), V8 added to `tests/liveStays.test.mjs`, V2 as `tests/priceSources.test.mjs` (a scan of src/ and scripts/ for kernel calls, with an allowed list that names the phase removing each path; it also fails on a stale entry, so each later task struck its own).

### Files touched

App, created: src/lib/price/request.js, src/lib/price/priceDay.js, src/lib/price/index.js, tests/priceEngine.test.mjs, tests/priceSources.test.mjs. Modified: src/lib/costIndex.js, tests/liveStays.test.mjs. Commit 406927a.

### Commands run

`node --test` on the price, stays and live tests; eslint.

### Config and secrets set

None.

### Before/after measurements

Not measured on its own: the engine moved no screen. The golden snapshot stayed green after the costIndex split.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| V6 failed: Lake Como, 5-star, one traveller: 59.90 euro a night, then 204.50 for two | 409 euro a night for one person is over the 400 euro ceiling, so the bed is "repaired" with the country's entire-place median (plan 6.1 names this) | Not fixed here: bounds and repair per tier are F3. V6 skips repaired beds and the case is row T662-a (720 solo 5-star beds, 425 solo entire places, 142 solo 4-star across the catalogue) |
| costIndex.js showed a whole-file diff | its blob is stored with CRLF (committed by the T650 agent while autocrlf was off) | staged with `git -c core.autocrlf=false add` so only the 111 changed lines show; same for useExploreCatalog.js and DayPlannerTab.jsx |

### What is still open

T662-a (bounds and repair per stay tier, F3). T662-b (under "any time" the flight is the year's cheapest month while the bed is the year's average: two different meanings of "any time"; owner call).

### Rollback procedure

Revert app 406927a. Every screen still called computeCosts at that point, so nothing reads the engine yet.

---

## T663: Explore, the destination page and every screen on App's map (F2)

### Task ID

T663

### Date

2026-10-24

### What changed

- App.jsx builds one request (`priceRequest` from choices, dates, date mode, own dates and the Explore month filter) and prices the map with `priceDays`. Every screen that reads App's map follows: Explore card, pin and rails, destination header and calculator day, Places place cards, country and region pages (`usePlaceRows`), home (`homeDemo`), Ask find and compare (the Explore rows' cost), shortlist (`SavedTripsPanel`). The request is in the first-run and settings contexts as `priceRequest`.
- B7: the Explore month filter (`xm`) is App state (`exploreMonth`, read from the URL at start, reported by ExploreTab), part of the request and of `resolveWhen`, so the destination page behind a card prices that month and the crowd stat reads it. ExploreTab's second `computeCosts` map for the month is gone; the unused `choices` prop went with it.
- B5: Carta's suggested week reads as any time (the year's average); before, the map priced it as exact November nights while the place pages priced the year.
- V7 for the flight: `lib/price/flight.js` `flightLegs` picks the legs by the request's mode (near the exact dates, the month's cheapest, the year's cheapest) for both the Explore card and the calculator (`flightQuote` gives the calculator its roundTripNear shape). Before, the Explore card flew the departure month's cheapest while the calculator flew near the dates, and neither read `xm`.
- The calculator prices the request's nights. `useExploreCatalog`'s fallback is the default request.

### Files touched

App, modified: src/App.jsx, src/browse/ExploreTab.jsx, src/browse/DestPriceCard.jsx, src/hooks/useExploreCatalog.js, tests/fixtures/price/screens.mjs, golden.json, tests/priceGolden.test.mjs, tests/priceSources.test.mjs. Created: src/lib/price/flight.js. Commit 7dc0d73.

### Commands run

eslint; node tests; the golden diff against T661's snapshot.

### Config and secrets set

None.

### Before/after measurements

Golden cells that changed, with the reason:

- Default request, Explore card, header, Places card, calculator day: the year's average instead of Carta's November week (B5). Lake Como 110.14 to 122.63, Kotor 75.24 to 86.87, Bergen 147.35 to 156.36, Lisbon 105.02 to 111.72, Lagos 91.19 to 96.78, Zermatt 201.99 to 223.87. The calculator total follows (Lake Como 1,541.90 to 1,716.82).
- Every request, calculator total: up to 21 cents, because lines are now rounded per person per day before the multiplication (rule 7). Lake Como 7 people: 7,665.35 to 7,665.56.
- The 7-person request: its dates equal Carta's own week on the baseline day (21 to 28 November), and App decides "own dates" by comparing with Carta's pair, so without help the request read as any time. The baseline marks them own (`ownDates: true`); the app gap is row T663-c.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| ExploreTab would have thrown on render | the new effect read `settingsLine` above its declaration | moved below `useSettings()` before commit |

### What is still open

T663-a (the default card rises a median 8.5%: owner to see before a deploy), T663-b (flight mode checked only in node, CORS blocks the sweep on localhost), T663-c (own dates equal to Carta's week), T663-d (Explore's flight leaves the bag out, the calculator adds it; one default bag in F3).

### Rollback procedure

Revert app 7dc0d73. The month filter goes back to ExploreTab's own map, and App prices Carta's week as exact dates again.

---

## T664: place pages, the cheaper base and the food fold (F2)

### Task ID

T664

### Date

2026-10-24

### What changed

- `useBaseDay` (lake, beach, mountain, trail pages): the app map row of the base town, else `priceDay` with the app's request against the whole catalogue (dates, children, country repair). The cache key is the request key, which carries children (P4).
- `useBaseStays` in `usePlaceExits`: the cheaper-base exit compares base towns on the engine's bed line for the traveller's stay, party and dates, instead of an entire place for two whatever was chosen.
- `DestFood`: the food fold itemises the engine's food line (`foodBreakdown`, the child share included).

### Files touched

App, modified: src/hooks/useBaseDay.js, src/hooks/usePlaceExits.js, src/browse/DestFood.jsx, tests/fixtures/price/screens.mjs, golden.json, tests/priceSources.test.mjs. Commit a21ab9c.

### Commands run

eslint; node tests.

### Config and secrets set

None.

### Before/after measurements

Place page, before to after (now the card's figure): 7 people, 3-star: Lake Como 182.72 to 156.44, Kotor 112.75 to 94.47, Bergen 222.05 to 206.05, Lisbon 116.94 to 109.51, Lagos 116.69 to 109.26, Zermatt 280.20 to 245.92. November: Lake Como 122.63 to 110.14 and so on (the month's bed). Cheaper-base bed, 7 people, 3-star: Lake Como 59.90 to 90.29 (four 3-star rooms instead of half an entire place for two).

### What broke and how it was fixed

Nothing.

### What is still open

The food fold's total is the sum of its rounded parts, which can differ from the food line by a cent or two; the receipt-adds-up rule keeps it so (noted, no row).

### Rollback procedure

Revert app a21ab9c.

---

## T665: prerender, OG card, Ask eval script (F2)

### Task ID

T665

### Date

2026-10-24

### What changed

- `scripts/prerender/build.mjs` prices the catalogue with `priceDays(DEFAULT_PRICE_REQUEST)`; the cost page's week receipt (`pages.mjs weekReceipt`) itemises the engine's food line.
- `scripts/og/specs.mjs` prices with `priceDay` and takes the catalogue as a third argument; `scripts/prerender/cards.mjs` passes it, so a repaired place gets the same figure on its OG card as on its page.
- `scripts/ask-eval-live.mjs` uses the default request.
- V1 for the day price in `tests/priceGolden.test.mjs`: every day-price screen the same cents per request (the prerendered pages and OG card only for the default request, since they know no choices), and the calculator total = day x nights x party.

### Files touched

App, modified: scripts/prerender/build.mjs, scripts/prerender/pages.mjs, scripts/prerender/cards.mjs, scripts/og/specs.mjs, scripts/ask-eval-live.mjs, tests/fixtures/price/screens.mjs, golden.json, tests/priceGolden.test.mjs, tests/priceSources.test.mjs. Commit a8a39c6.

### Commands run

`node --check` on each script; the prerender tests (29 pass); node tests.

### Config and secrets set

None.

### Before/after measurements

No golden cell moved: the prerender and the OG card already priced the year's average. New screen `prerenderWeek` (the week receipt per day) equals the day figure for all six places.

### What broke and how it was fixed

Nothing.

### What is still open

`scripts/og/render.mjs` calls `destinationSpec` without the catalogue on its own render path (T665-a). The prerendered trip page (`pages.mjs`, multi-stop) is trip price and moves in F6.

### Rollback procedure

Revert app a8a39c6.

---

## T666: the day planner prices a day at its own dates (F2)

### Task ID

T666

### Date

2026-10-24

### What changed

- App passes its request to the day planner. `DayPlannerTab` prices each stop with `priceDay` at `atDates(request, arrival, departure)`: exact dates, every other choice the traveller's (the day view's figure and the PDF's day figure). Without stop dates it reads the app map. Doc 4.3: the planner used the app's dates instead of the day's.
- `lib/price/request.js` `atDates`.

### Files touched

App, modified: src/App.jsx, src/planner/DayPlannerTab.jsx, src/lib/price/request.js, src/lib/price/index.js, tests/fixtures/price/screens.mjs, golden.json, tests/priceGolden.test.mjs, tests/priceSources.test.mjs. Commit 4c4bd86. Root mirror 53c89a053.

### Commands run

eslint; node tests; full `npm test`; fast build; the end check.

### Config and secrets set

None.

### Before/after measurements

The full baseline, in euros (before to after; one figure where nothing moved). The day planner's stop runs over the request's date pair.

**default** (two people, entire place, Easygoing, Carta's week 21 to 28 Nov read as any time)

| Place | Explore card, header, Places card | Calculator total | Place page | Cheaper-base bed | Day planner | Prerender, OG |
|---|---|---|---|---|---|---|
| Lake Como | 110.14 to 122.63 | 1,541.90 to 1,716.82 | 122.63 | 59.90 | 110.14 | 122.63 |
| Kotor | 75.24 to 86.87 | 1,053.42 to 1,216.18 | 86.87 | 44.08 | 75.24 | 86.87 |
| Bergen | 147.35 to 156.36 | 2,062.94 to 2,189.04 | 156.36 | 86.46 | 147.35 | 156.36 |
| Lisbon | 105.02 to 111.72 | 1,470.24 to 1,564.08 | 111.72 | 69.51 | 105.02 | 111.72 |
| Lagos (beach) | 91.19 to 96.78 | 1,276.70 to 1,354.92 | 96.78 | 56.51 | 91.19 | 96.78 |
| Zermatt (mountain) | 201.99 to 223.87 | 2,827.82 to 3,134.18 | 223.87 | 116.98 | 201.99 | 223.87 |

**7 people, 3-star, Nightlife, own dates 21 to 28 Nov**

| Place | Explore card, header, Places card | Calculator total | Place page | Cheaper-base bed | Day planner | Prerender, OG |
|---|---|---|---|---|---|---|
| Lake Como | 156.44 | 7,665.35 to 7,665.56 | 182.72 to 156.44 | 59.90 to 90.29 | 156.44 | 122.63 |
| Kotor | 94.47 | 4,628.89 to 4,629.03 | 112.75 to 94.47 | 44.08 to 46.86 | 94.47 | 86.87 |
| Bergen | 206.05 | 10,096.38 to 10,096.45 | 222.05 to 206.05 | 86.46 to 123.43 | 206.05 | 156.36 |
| Lisbon | 109.51 | 5,365.92 to 5,365.99 | 116.94 to 109.51 | 69.51 to 67.43 | 109.51 | 111.72 |
| Lagos (beach) | 109.26 | 5,353.67 to 5,353.74 | 116.69 to 109.26 | 56.51 to 67.43 | 109.26 | 96.78 |
| Zermatt (mountain) | 245.92 | 12,050.01 to 12,050.08 | 280.20 to 245.92 | 116.98 to 135.43 | 245.92 | 223.87 |

**November** (the settings line's month and the Explore month filter)

| Place | Explore card, header, Places card | Calculator total | Place page | Cheaper-base bed | Day planner | Prerender, OG |
|---|---|---|---|---|---|---|
| Lake Como | 110.14 | 1,541.90 to 1,541.96 | 122.63 to 110.14 | 59.90 to 47.41 | 110.14 | 122.63 |
| Kotor | 75.24 | 1,053.42 to 1,053.36 | 86.87 to 75.24 | 44.08 to 32.45 | 75.24 | 86.87 |
| Bergen | 147.35 | 2,062.94 to 2,062.90 | 156.36 to 147.35 | 86.46 to 77.45 | 147.35 | 156.36 |
| Lisbon | 105.02 | 1,470.24 to 1,470.28 | 111.72 to 105.02 | 69.51 to 62.81 | 105.02 | 111.72 |
| Lagos (beach) | 91.19 | 1,276.70 to 1,276.66 | 96.78 to 91.19 | 56.51 to 50.92 | 91.19 | 96.78 |
| Zermatt (mountain) | 201.99 | 2,827.82 to 2,827.86 | 223.87 to 201.99 | 116.98 to 95.10 | 201.99 | 223.87 |

**any time**

| Place | Explore card, header, Places card | Calculator total | Place page | Cheaper-base bed | Day planner | Prerender, OG |
|---|---|---|---|---|---|---|
| Lake Como | 122.63 | 1,716.84 to 1,716.82 | 122.63 | 59.90 | 122.63 to 110.14 | 122.63 |
| Kotor | 86.87 | 1,216.16 to 1,216.18 | 86.87 | 44.08 | 86.87 to 75.24 | 86.87 |
| Bergen | 156.36 | 2,189.08 to 2,189.04 | 156.36 | 86.46 | 156.36 to 147.35 | 156.36 |
| Lisbon | 111.72 | 1,564.06 to 1,564.08 | 111.72 | 69.51 | 111.72 to 105.02 | 111.72 |
| Lagos (beach) | 96.78 | 1,354.94 to 1,354.92 | 96.78 | 56.51 | 96.78 to 91.19 | 96.78 |
| Zermatt (mountain) | 223.87 | 3,134.16 to 3,134.18 | 223.87 | 116.98 | 223.87 to 201.99 | 223.87 |

Reasons per changed cell: the default card to the year (B5, T663); the calculator total by up to 21 cents (rounding per line, rule 7, T663); place pages and the cheaper base to the request (T664); the day planner to the stop's own dates (T666: under "any time" a day in a plan still has its date, so it reads 21 to 28 November).

### What broke and how it was fixed

Nothing in the end check. The end check's own selectors needed three fixes (cards on phone are not "visible" to Playwright, month-filter cards use `a.xrow-hit`, a lake page is addressed in the hash); none was an app fault.

### What is still open

The new-plan card (`homeTownId` figure) still reads the app map: a plan without stops has no dates yet (T666-a).

### Rollback procedure

Revert app 4c4bd86 (and the `atDates` export with it). Rolling back the whole batch: revert app 4c4bd86, a8a39c6, a21ab9c, 7dc0d73, 406927a, 51a2aa3 in that order, and root 53c89a053 plus this report's commit. No data, schema or wire change.

---

## Register rows closed by this batch

- T649-e closed by T662 (the engine reads `when` through `lib/when.js` `resolveWhen`; no second date reader).
- T503-a closed by T662 (B6, owner 2026-10-24: a day is the total over the nights; the engine defines it so; the trip card follows in F6).
