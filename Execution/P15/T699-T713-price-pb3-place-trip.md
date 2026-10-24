# T699 to T713: price engine PB3, the price in the right place (F5) and the trip price from the engine (F6)

## Shared header

**Batch.** PB3 of the price plan (Claude Doc "Carta prijslogica Explore: plan", https://claude.ai/artifact/3aBYSPsJ3a1RzrRiS6cvrn): F5 the price in the right place (T699 to T701) and F6 the trip price from the engine (T702 to T713). The owner asked for PB3, PB4 and PB5 in the same session after PB2 ("yes merge en doe de volgende batches, al sje klaar bent push en deploy").

**Numbering.** T699 to T730 were reserved for the price batches by message to the other sessions (travel-app-22, -0c, -32, -05). The planner session has since used T731 to T735 on its own branch (p15-planner-final, not on main). PB3 used T699 to T713.

**Preconditions.** PB1 and PB2 merged (app master 6fc164e, root main f60a60051). Invariants V1, V2, V6, V9, V11 and V12 of the plan are tests.

**Branches.** App `p15-price-pb3-place-trip` (from master 6fc164e, worktree `wt/p15-price-pb3-app`), head da70da2, one commit per task. Root `p15-price-pb3-place-trip` (from main f60a60051, worktree `wt/p15-price-pb3-root`): mirror ba09ffe4e, then this report and the register.

**Static checks.** `npm test` in the worktree: 714 pass, 3 fail. The 3 are the `numbersPage` tests, which need `public/boot.json`, absent in a worktree; they pass on the main checkout. eslint on every touched file: 0 new warnings or errors. The one error, `ExploreMap.jsx` exhaustive-deps, was there before and the file was not touched. Fast NOPUBLIC build (`wt/vite.t699.mjs`) passes.

**End check.** One round on the batch head, run before T713 and again after it. Dev server on port 5299 over the main tree's `public/`, headless Chromium, script `wt/pb3-endcheck.mjs` (outside the repo), at 390 x 844 and 1280 x 800. Result: 45 of 46 checks pass on both runs.
- Lake (Bled), beach (Navagio) and mountain (Matterhorn) pages: no cost line, and the button to the base reads "Stay in Lake Bled, €110 a person a day" (Zakynthos €97, Breuil-Cervinia €115).
- The mountain lift price is the placeholder ("Not available yet").
- No "€0", "EUR n" or "[object Object]" on these pages or on the Lisbon destination page.
- The lakes, beaches and mountains tabs: 42 cards on a phone and 55 on a desktop, none with a town price.
- The Salzburg and Vienna trip page carries a food and drink line.
- Places lists priced rows (290 and 355).
- The planner chooser renders.
- No page error. No horizontal scroll.
- The first run flagged the planner on a phone because its threshold assumed a footer, which the phone does not have. A manual look showed the chooser and no error.
- Screenshots of the lake page at both widths are in the session scratchpad (`pb3-lake-390.png`, `pb3-lake-1280.png`). The button uses the kit's primary style, with nothing new on the page.

**Measurements.**

| Measure | Before (PB2, 6fc164e) | After (da70da2) |
|---|---|---|
| Paths that price outside the engine (V2 scan) | 12 | 0 (the allowed list is the kernel) |
| Golden grid: existing cells that moved | 264 cells | 0 of 264 |
| Golden grid: trip screens | none | tripPlanner and placesTrip, 48 cells, equal to the day planner in every cell |
| Town price lines on place pages | 1 a page (lake, beach, mountain, trail) | 0; the price is in the button to the base |
| Town price lines on outdoor cards and rail tiles | 1 a card | 0 |
| Do-price literals "EUR {n}" | 6 locales | 0; formatMoney, "Free" only where paying also occurs |
| Lisbon, 5 nights, 2 adults and 2 children (beds / days / total) | 724 / 670 / 1,394 | 966 / 715 / 1,680 |
| Barcelona, same | 964 / 747 / 1,711 | 1,285 / 797 / 2,082 |
| Prague, same | 531 / 579 / 1,110 | 709 / 618 / 1,326 |
| Lake Como, same | 607 / 972 / 1,579 | 809 / 1,037 / 1,846 |
| Adults only and hire rows (2 adults, 4 hire, 7 hire) in those four places | | unchanged (Prague 1,000 to 1,001: cents a day) |
| Seven people hiring | 2 cars | 2 cars (one hire model now) |
| A 3-stop trip quote, real catalogue (3,868 places) | 0.9 ms warm, 0.6 ms first | 0.7 ms warm, 2.8 ms first |
| First load (fast build, index.html preloads) | 32 files, 2,099,364 bytes | 33 files, 2,099,613 bytes |
| All assets | 109 files, 7,391,545 bytes | 110 files, 7,392,478 bytes |

Before this batch a family of four paid less for beds than two adults (Lisbon 724 against 771), because children counted half on beds. Now beds are per seat as on Explore, so four people pay what four adults pay (966). Food takes the children's configured share (60 percent).

**Screens the next end check (PB5) must look at.** The opened price (the car item only when it is in the price), the destination calculator, the trip planner receipt with children and with a hire car, the wizard's Stay list and country cards, My trips, the Ask trip card, Places, the curated trip page, the mountain page's lift price once fares are published.

---

## T699: the town price moves into the button to the base (F5, section 5, V12)

### Task ID

T699

### Date

2026-10-24

### What changed

- The lake, beach, mountain and trail pages no longer carry a separate town cost line (`costLine`, "Bed and food in {city}").
- The button to the base town says it instead: "Stay in {city}, {price} {unit}" (`item.baseStay`, six languages), per person or for the whole group, through `useDayView().stayIn`.
- Without a priced town, the button keeps its old words.
- On the trail page, only the city-day button carries the price.

### Files touched

App, modified: src/browse/LakePage.jsx, BeachPage.jsx, MountainPage.jsx, TrailPage.jsx, src/hooks/useDayView.js, src/i18n/{en,nl,de,fr,es,it}.js. Commit 8db6dd3.

### Commands run

eslint; node tests.

### Config and secrets set

None.

### Before/after measurements

Town price lines on place pages: 1 to 0 (end check).

### What broke and how it was fixed

No issues.

### What is still open

None.

### Rollback procedure

Revert app 8db6dd3. The cost line returns under the photo and the button loses its price.

---

## T700: outdoor cards and rail tiles carry no town price (F5, V12)

### Task ID

T700

### Date

2026-10-24

### What changed

- The beach, lake, mountain, walk and ride cards drop the "Bed and food in {city}" line. `BedFoodLine` is removed.
- The story rail tiles show their measured fact where the town price stood.
- The lead card loses its days "from" fact.
- A stay price now stands only at or towards a destination.

### Files touched

App, modified: src/browse/DestCards.jsx, src/browse/SectionOpening.jsx. Commit af56f13.

### Commands run

eslint; node tests.

### Config and secrets set

None.

### Before/after measurements

Town price lines on outdoor cards: 1 a card to 0 (end check, 42 and 55 cards).

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Lint warnings in SectionOpening.jsx | the `withMoney` helper and the tile's `t` argument lost their last use | removed |

### What is still open

None.

### Rollback procedure

Revert app af56f13.

---

## T701: one do-price reader (F5, V11)

### Task ID

T701

### Date

2026-10-24

### What changed

- `lib/price/doPrice.js` reads the pipeline's price records: `price` from harvest_poi_fees and `lift.fare` from harvest_lift_hours. It reads euros only.
- A zero is "Free", and only in categories where paying also occurs (sights, beaches, activities). A free lift shows nothing. "EUR 0" never appears.
- Thing-to-do tiles read the record before `fee_eur` and format through `formatMoney`. `dest.doFeeEur` ("EUR {n}") leaves all six locales.
- The mountain page's lift price reads `lift.fare`. Before, it read the absent `lift.price`, and a record there would have printed "[object Object]". Without a fare it shows the placeholder.
- `tests/pricePlace.test.mjs` holds V11 and V12.

### Files touched

App, created: src/lib/price/doPrice.js, tests/pricePlace.test.mjs. Modified: src/lib/doFacts.js, src/browse/PeakFacts.jsx, src/i18n/*.js, tests/doFacts.test.mjs. Commit 10a2ee0.

### Commands run

node --test tests/doFacts.test.mjs tests/pricePlace.test.mjs.

### Config and secrets set

None.

### Before/after measurements

"EUR {n}" do-price literals: 6 locales to 0.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| doFacts test expected "EUR 12.5" | the test pinned the old literal | it now expects "€12.50" (formatMoney) |

### What is still open

Do-prices are shown only where a record exists: OpenStreetMap charge tags on things to do, and lift fares where OSM tags them. Lidos, ferries and entry tickets have no other source yet, so their slots show the placeholder until F9 (T701-a).

### Rollback procedure

Revert app 10a2ee0.

---

## T702: the trip price is the engine's (F6)

### Task ID

T702

### Date

2026-10-24

### What changed

- `priceTrip` moves from `lib/tripTotal.js` into `lib/price/trip.js` as `quoteTrip`. tripTotal.js keeps the receipt lines (`tripLines`, `tripReadiness`, `wizardPlannerState`) and re-exports the moved names.
- Every stop is now the day price at the stop's own dates and the trip's party, stay and Lifestyle (`lib/price/stay.js`: `quoteStay`, `tripRequest`), times the nights and the seats. A stop therefore costs what Explore and the destination page say for the same question (V1).
- Children pay the configured shares (`party.shares`: food 0.6, public fares 0.5). Before, a fixed half applied to beds, meals and fares (T579-a, T691-a).
- One hire model: `lib/price/car.js` on `config car.model`. Seven people are two cars (V6).
- The trip adds a hire only when the traveller hires one (planner transport 'car').
- The day row carries the hire as a car line that is never in the day:
  - On Explore, going by car means driving one's own car there, which the way there already prices. A hire in the day would have charged the same traveller for the drive and a rental.
  - This is the plan's car rule ("Autoregel via rentalEstimate als vervoer = auto") applied where a hire happens. The reading is put to the owner as T702-a.
- The opened price lists the car only when it is in the price.
- The planner's default bag is the 10 kg cabin bag, the app's tier (`PLANNER_BAG`). Before, it was 'cabin', which priced no bag.
- `stopStayCost` retires.
- The planner, the wizard's hand-over, the day planner, a saved trip's figure and the Ask budget all call `quoteTrip`.

### Files touched

App, created: src/lib/price/trip.js, stay.js, car.js. Modified:
- Engine and trip modules: src/lib/price/index.js, priceDay.js, src/lib/tripTotal.js, src/lib/trip_planner_pricing.js, src/lib/budgetSearch.js, src/lib/myTrips.js.
- Screens and hooks: src/hooks/useTripPlanner.js, src/planner/DayPlannerTab.jsx, GuidedTripWizard.jsx (import), DayCost.jsx and TripTotalBar.jsx (comments), src/browse/MapPlacePanel.jsx (comment), src/components/PriceItems.jsx, src/lib/ask/rank.js (comment), the planner CSS comment.
- Tests: budgetSearch, flights, myTrips, priceEngine, tripPricing, stayPrice, tripTotal.

Commit 6b78629.

### Commands run

npm test; eslint.

### Config and secrets set

None.

### Before/after measurements

See the header: the children's rows move as described there; adults-only and hire rows are unchanged; the quote stays under 3 ms.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Rule-8 engine test failed | the car line now carries data | the test asserts the car is priced but not in the day; a place without a country has no car figure |
| stayPrice test 795.70 against 795.76 | it compared the raw cost index with the engine's day, which is rounded to cents | it compares with the engine row the card shows (exact), and the raw index within 0.10 |

### What is still open

- The car reading is the owner's to confirm (T702-a).
- The per person or group view does not yet reach trip receipts (T694-a, still open).

### Rollback procedure

Revert app 6b78629 (after the later F6 commits, which build on it). The trip price returns to tripTotal.js.

---

## T703: a saved trip keeps its own price request (F6)

### Task ID

T703

### Date

2026-10-24

### What changed

- The planner saves the stay and the Lifestyle it priced with (`choices.priceRequest` on the first stop).
- My trips and the day planner price a saved trip with them, so its figure does not move when the settings do.
- A trip saved before this change prices at the traveller's current settings, as before.

### Files touched

App, modified: src/hooks/useTripPlanner.js, src/lib/myTrips.js. Commit d897629.

### Commands run

node tests (the saved-request test is in T711).

### Config and secrets set

None.

### Before/after measurements

Not measured.

### What broke and how it was fixed

No issues.

### What is still open

An opened saved trip in the planner still prices at the app's settings: the owner's earlier rule says the Lifestyle panel owns the stay app-wide. My trips and the opened trip can therefore differ after a settings change. Which wins is the owner's call (T703-a).

### Rollback procedure

Revert app d897629. Saved rows keep the extra field, and nothing reads it.

---

## T704: the wizard prices with the engine (F6)

### Task ID

T704

### Date

2026-10-24

### What changed

- One wizard request (`tripRequest`): its party with children and babies, the stay tier and the Lifestyle.
- The country "from" figures read `priceDays` instead of `computeCosts`.
- The Stay list's nightly figure for the group is the engine's bed at a 2-night stay from the start date. It is priced once for the catalogue instead of calling `accommodationPerPerson` per row.

### Files touched

App, modified: src/planner/GuidedTripWizard.jsx. Commit 21f1a17.

### Commands run

eslint; npm test.

### Config and secrets set

None.

### Before/after measurements

Not measured separately: the stay figures are the engine's, which the golden grid already covers.

### What broke and how it was fixed

No issues.

### What is still open

None.

### Rollback procedure

Revert app 21f1a17.

---

## T705: the Ask trip card's bed is the engine's (F6)

### Task ID

T705

### Date

2026-10-24

### What changed

- The bed is `quoteStay` at the trip's party, stay and dates, against the catalogue so the country repair applies. It was `bedPrice`.
- The live bed reads the engine's bed line when its quality is live.

### Files touched

App, modified: src/browse/ask/AskTripCard.jsx. Commit 27117d3.

### Commands run

eslint.

### Config and secrets set

None.

### Before/after measurements

Not measured.

### What broke and how it was fixed

No issues.

### What is still open

None.

### Rollback procedure

Revert app 27117d3.

---

## T706: the country brief and the first-run receipt read the engine (F6)

### Task ID

T706

### Date

2026-10-24

### What changed

- A country's typical bed and food are the medians of its towns' engine day rows, at the default request and the traveller's Lifestyle. They were `stayPerNight` and `foodPerDay`.
- `priceReceipt` builds its stay and food lines from `priceDay` at its dates and party. Before, it used `accommodationPerPerson` and `groundSpendPerPerson` with its own 6 to 400 gate and its own repair. The catalogue is handed in for the country repair.

### Files touched

App, modified: src/lib/countryBrief.js, src/lib/firstRun.js, tests/firstRun.test.mjs. Commit a71433e.

### Commands run

node --test tests/firstRun.test.mjs.

### Config and secrets set

None.

### Before/after measurements

Not measured: `priceReceipt` has no runtime caller (tests only), and the brief's medians follow the engine.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The broken-harvest test passed a `costRow` | the repair is now the engine's | the test hands a catalogue with a priced town of the same country |

### What is still open

None.

### Rollback procedure

Revert app a71433e.

---

## T707: the calculator is the engine's (F6)

### Task ID

T707

### Date

2026-10-24

### What changed

- `lib/destPrice.js` `priceFromIndex` moves into `lib/price/nights.js` as `quoteNights`.
- It multiplies the engine's day row by the nights and the party, counting every included line once.
- The destination price card and its golden adapter call it.

### Files touched

App, moved: src/lib/destPrice.js to src/lib/price/nights.js. Modified: src/browse/DestPriceCard.jsx, scripts/smoke-nav.mjs (comment), tests/destPrice.test.mjs, tests/priceDisplay.test.mjs, tests/fixtures/price/screens.mjs. Commit 533e6b3.

### Commands run

npm test.

### Config and secrets set

None.

### Before/after measurements

The calculator cells in the golden grid did not move.

### What broke and how it was fixed

This commit also exported `quoteNights` from the engine index, which tripled the first-load preloads. Fixed in T712.

### What is still open

None.

### Rollback procedure

Revert app 533e6b3 (with T712 first).

---

## T708: the composed trips in Places are the engine's (F6)

### Task ID

T708

### Date

2026-10-24

### What changed

- `runtime_pricing.js` `composeTrip` moves into `lib/price/compose.js` as `quoteComposed`.
- Its stay is the engine's day row at the trip's dates, priced once for the catalogue in `useDestinationSearch`. A place therefore costs in Places what it costs on Explore and its page (V1).
- A day the engine cannot price leaves the trip unpriced (rule 8).
- The `car_needed` hire on a plane trip reads the one hire model instead of a second `rentalEstimate` table. The `local_transport.rental_eur_per_day` fallback is gone.
- The unused `cheapestTotal` retires.

### Files touched

App, created: src/lib/price/compose.js. Modified: src/lib/runtime_pricing.js, src/hooks/useDestinationSearch.js, src/lib/price/index.js, tests/rankTier.test.mjs. Commit b8cac8b.

### Commands run

npm test (rankTier compares the lite and full records through quoteComposed).

### Config and secrets set

None.

### Before/after measurements

Places stay equals the calculator in every fixture place (V1 test). The Places trip in the golden grid equals the day planner in every cell.

### What broke and how it was fixed

No issues.

### What is still open

The `car_needed` hire on plane trips remains. Whether a plane trip to such a place should hold the hire in its total or show it as an item is row T650-d, still open.

### Rollback procedure

Revert app b8cac8b.

---

## T709: the prerendered trip receipt reads the engine (F6)

### Task ID

T709

### Date

2026-10-24

### What changed

A stop's eating and drinking is the engine's food line a day, times the days there. It was `groundSpendPerPerson` at the default Lifestyle, without the party's food share.

### Files touched

App, modified: scripts/prerender/pages.mjs. Commit 8206961.

### Commands run

npm test (prerender tests).

### Config and secrets set

None.

### Before/after measurements

Default request, two adults: the food share is 1, so the figures are the same within cents.

### What broke and how it was fixed

No issues.

### What is still open

None.

### Rollback procedure

Revert app 8206961.

---

## T710: the curated trip page prices beds and days with the engine (F6)

### Task ID

T710

### Date

2026-10-24

### What changed

- Every stop is the destination's day at the traveller's settings (party, stay, Lifestyle), times its nights and the seats.
- The receipt has a stay line and a new food and drink line. It is for the settings line's party, not the wire's two.
- The flight is priced for the same seats.
- A stop that is not a priced destination keeps the wire's stay figure.
- The day figure now holds food like every other day price. Before, it was the bed and the legs only.

### Files touched

App, modified: src/browse/TripPage.jsx. Commit 4863c99.

### Commands run

eslint; end check.

### Config and secrets set

None.

### Before/after measurements

The Salzburg and Vienna trip carries the food and drink line (end check).

### What broke and how it was fixed

No issues.

### What is still open

`lib/tripPrice.js` and `TripPriceCard` still split the wire's trip budget by the Lifestyle slider. The trip page's legs and its fallback stay figure still come from the wire (T710-a).

### Rollback procedure

Revert app 4863c99.

---

## T711: V1 and V2 for the trip price (F6)

### Task ID

T711

### Date

2026-10-24

### What changed

- The V2 scan's allowed list is the kernel alone. `priceTrip`, `composeTrip` and `priceFromIndex` stay in the scan, so a copy that comes back outside the engine fails.
- The golden grid gains `tripPlanner` and `placesTrip`. They meet the day planner and the card in every cell where the dates are exact, and no existing cell moved.
- `tests/priceTrip.test.mjs` holds:
  - V1: a stop is the page's day times the nights and the seats, and Places and the calculator agree.
  - V6: seven people are two cars, and a hire only when hired.
  - The children's shares.
  - The planner's bag tier.
  - The saved trip's own request.
  - A pass-through stop costs nothing.

### Files touched

App, created: tests/priceTrip.test.mjs. Modified: tests/priceSources.test.mjs, tests/priceGolden.test.mjs, tests/fixtures/price/screens.mjs, tests/fixtures/price/golden.json. Commit b6cb9d7.

### Commands run

`UPDATE_GOLDEN=1 node --test tests/priceGolden.test.mjs`, then a diff of the new golden file against PB2's: 0 existing cells changed, 48 cells added.

### Config and secrets set

None.

### Before/after measurements

V2 paths outside the engine: 12 to 0.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| placesTrip cells empty | the fixture towns have no air route, so a composed trip is unreachable | the adapter gives a zero-cost train there to isolate the stay |

### What is still open

The grid does not hold the calculator with a flight, the country brief's medians, the Ask budget's buffer or the trip page (T711-a).

### Rollback procedure

Revert app b6cb9d7.

---

## T712: the first load stays the day price's (F6, measured)

### Task ID

T712

### Date

2026-10-24

### What changed

- The engine index (`lib/price/index.js`) re-exports only the day-price parts: request, priceDay, stay and car.
- The trip quote, the composed trip and the calculator are imported from their own files.
- The hire formula lives in `lib/price/car.js`, and `transport.js` re-exports it.
- A screen that shows a day price therefore no longer loads the trip and leg engines.
- Bisecting with the fast build found the cause. With `quoteNights` in the index (T707), Rollup split about 70 shared modules into chunks that index.html preloads.

### Files touched

App, modified: src/lib/price/index.js, car.js, src/lib/transport.js, src/hooks/useDestinationSearch.js, tests/priceTrip.test.mjs, tests/fixtures/price/screens.mjs. Commit 94a83b4.

### Commands run

The fast build at 10a2ee0, 6b78629, 533e6b3, b8cac8b and 4863c99 (bisect), then at the head.

### Config and secrets set

None.

### Before/after measurements

| Commit | Preloads | First-load bytes |
|---|---|---|
| 6fc164e (PB2) | 32 | 2,099,364 |
| 533e6b3 (T707) | 101 | 2,134,374 |
| 94a83b4 (T712) | 33 | 2,099,596 |

### What broke and how it was fixed

The cause and the fix are described under "What changed".

### What is still open

Nothing guards the first load: a re-export can split the chunks again unnoticed (T712-a).

### Rollback procedure

Revert app 94a83b4. The preloads return to 101.

---

## T713: one bag and the lap fee on every trip flight (F6, row T691-a)

### Task ID

T713

### Date

2026-10-24

### What changed

- The wizard's hand-over and a share link without a bag now take the planner's bag. `PLANNER_BAG`, the 10 kg cabin bag, now lives in `lib/price/request.js`. Before, they took 'cabin', which priced no bag.
- A trip's flight adds the babies' lap fee for each leg (`party.baby_lap_fee_leg`), as Explore's way there does.

### Files touched

App, modified: src/lib/price/request.js, src/lib/price/trip.js, src/planner/GuidedTripWizard.jsx, src/lib/shareLink.js. Commit da70da2.

### Commands run

npm test; the fast build (33 preloads, 2,099,613 bytes).

### Config and secrets set

None.

### Before/after measurements

Not measured on a flight: the fixture has no flight file.

### What broke and how it was fixed

No issues.

### What is still open

The lap fee on trip flights has no unit test: it needs a flight file fixture (T713-a).

### Rollback procedure

Revert app da70da2.
