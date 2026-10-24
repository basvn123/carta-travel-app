# T689 to T698: price engine PB2, one configuration (F3) and what the price says (F4)

## Shared header

**Batch.** PB2 of the price plan (Claude Doc "Carta prijslogica Explore: plan", https://claude.ai/artifact/3aBYSPsJ3a1RzrRiS6cvrn): F3 one configuration (T690 to T693) and F4 what the price says (T689, T694 to T698). The owner asked for PB2 in the same session as PB1 ("ja start PB2"), against the master prompt's one batch per session.

**Numbering.** The trip and day planner session (travel-app-22) holds T653 to T660 and T668 to T677. This batch claimed T679 to T690 by message and was built as T679 to T688; a stays scraper session then committed its own T679 on root main (b711a4976, the stays scrapers survive bad pages), so this batch was renumbered T689 to T698 before merging (contents, commit messages and the report name).

**Preconditions.** F0 merged (T643 to T646), PB1 merged (app master cd3e008, root main 1ee704179). B8 and B11 marked "Besloten" (owner, 2026-10-24). Two owner answers asked at the start of this batch: the tilde leaves the screen (plan rule 2 over carta-design and PRODUCT.md, which are updated in T698), and the per person or whole group switch sits under People in the settings line.

**Owner instruction during the batch (2026-10-24).** "If you see something nice (events etc) but the data does not yet support it leave placeholders": the opened price lists local transport, activities and events with the shared NotYet placeholder, no switch and nothing in the sum (plan rule 8). Saved as a standing preference.

**Branches.** App `p15-price-pb2-config-display` (from master cd3e008, worktree `wt/p15-price-pb2-app`), head f19be6b. Root `p15-price-pb2-config-display` (from main 1ee704179, worktree `wt/p15-price-pb2-root`): T693 fa396e012, T698 51c6729d4, mirror c64549b90, then this report and the register. Not merged, not pushed, not deployed.

**Static checks.** `npm test` 699 pass, 3 fail (the `numbersPage` tests that need `public/boot.json`, absent in a worktree; 724 of 724 on the main checkout after PB1). eslint on every touched src file: 0 new errors (the one error, `ExploreMap.jsx` exhaustive-deps on `collectKpins`, was there before). Pipeline: py_compile, 48 pytest pass. Fast NOPUBLIC build passes. The sweep worker bundles with the config (wrangler dry run, nothing deployed).

**End check.** One round on the batch branch, dev server port 5279 over the main tree's `public/`, headless Chromium, script `wt/pb2-endcheck.mjs` (outside the repo), at 390 x 844 and 1280 x 800: 60 of 60 checks pass, no page error, no horizontal scroll. Per person: the first three cards equal their destination header and read "a person a day", the day sentence reads "A bed plus food and drink." Whole group (2 people, Carta's 7 nights): each card is the per-person figure x 14 within rounding (Rome 154 to 2,150) and equals its header, unit "for 2 people, 7 nights". The opened price lists bed, food and drink, local transport, activities, events and the way there, three NotYet placeholders without switches; switching food off writes `px=food`, lowers the card (154 to 92) and the header, which then reads "A bed."; Escape closes; opening the price does not open the place. A budget of 80 a person a day shows "Up to 1,120" in the group view. No tilde, "about" or "live" in any price element. Screenshots of the opened price at both widths in the session scratchpad (`pb2-opened-390.png`, `pb2-opened-1280.png`). The admin Prices view was not opened (the admin page needs an unlock, T696-a).

**Measurements (all 3,868 destinations, shipped wire).**

| Measure (plan section 8) | Before | After |
|---|---|---|
| Price rules without kind, source and date | about 45 constants and 7 tables in 20 files, none with a source on record | 0 of 39 rules (V13 test); the app's price modules hold no top-level number of their own |
| Drifted copies | rental 39 / 42 / 40, longest drive 3,500 / 4,000, group cap 12 / 20 / 99, fuel 1.81 / 1.8, default bag 3 keys, transfer band 3 copies, intercity 0.15 a km uncapped | one each |
| Ground-fare calibration loaded | never (a verify script only) | at start; one cell today (Spain, train) |
| Beds repaired with a borrowed median, one traveller | 5-star 720, entire place 425, 4-star 142 (entire place for two, the year) | 5-star 48, entire place 56, 4-star 10, dorm 128 (same tier, party and dates) |
| Dorm rates over EUR 150 a night in the wire | 591 places, priced as they were | priced from the dorm median where the town has hostels (128 rows) |
| Default day figure | | up by one local coffee (median 3.23, p10 1.71, p90 4.24) |
| Paths outside the engine (PB1 scan) | 12 | 12 (all F6) |
| Full reprice of the catalogue (laptop) | about 20 ms | about 35 ms (one median pass per request) |
| Bundle js+css | 7,356,203 bytes, 2,138,762 gzip | 7,391,545, 2,149,453 gzip (+10.7 KB; the config is 6.8 KB of it) |
| Coverage per item | bed 3,868, food 3,868, transport 0, car 0, activities 0 | same; events added as a missing line |

**Screens the next batch's end check (PB3: F5, F6) must look at.** Lake, beach, mountain, trail and cycle pages (the base-town line moves to the button), card types for beaches, peaks and routes (chips), the destination calculator with a flight and a car, the trip planner, the wizard, Ask budget and trip card, curated journeys and the trip page, saved trips, the composed trips in Places; both price views and the opened price on each.

---

## T689: one amount and its unit (F4, rule 2)

### Task ID

T689

### Date

2026-10-24

### What changed

- `formatApprox` and `formatEst` return the plain figure; `<Money est>` draws like any figure (the prop stays for its callers); `money.estSpoken` is the figure itself in six languages, so a screen reader no longer hears "about".
- Gone from the screen: the estimate InfoDot (destination card, trip card), "Adjusted to live prices for your nights" (destination receipt, trip card, itinerary, Ask trip card), the tilde in the receipt's cost bar, the day PDF, the prerendered trip receipt, `detail.perNightApprox` and `itin.estFig`. Ask's prompt (version 4) no longer asks the model to keep "~" and "est.".
- `dayCostText` (wizard) returns the plain figure, seen and spoken.
- Test V4 (`tests/priceDisplay.test.mjs`): formatter, catalogues and a source scan for the live mark, the estimate dot and a hand-built tilde.

### Files touched

App, modified: src/lib/money.js, src/components/ui/Money.jsx, src/browse/DestPriceCard.jsx, src/browse/TripPriceCard.jsx, src/planner/TripItinerary.jsx, src/browse/ask/AskTripCard.jsx, src/components/ReceiptCard.jsx, src/lib/dayPdf.js, src/lib/ask/context.js, src/planner/wizard/wizardSteps.js, scripts/prerender/pages.mjs, src/i18n/*.js, tests/wizardSteps.test.mjs. Created: tests/priceDisplay.test.mjs. Commit 9d49c40.

### Commands run

node tests; eslint.

### Config and secrets set

None.

### Before/after measurements

Price cells unchanged (display only).

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `wizardSteps.test.mjs` failed after the first commit | the test pinned "~€87" and "about €87", and its own fake catalogue spoke "about" | `dayCostText` returns the plain figure; the test follows rule 2; amended into T689 |

### What is still open

The prerendered cost pages and the OG card still print source lines ("Measured in this town", "National basket", T689-a, owner). Unused leftovers: `.is-est` and `.ac-trip-live` CSS, the `glossary.estimate` term, the `money.est` key (T689-b).

### Rollback procedure

Revert app 9d49c40. The tilde and the live lines return.

---

## T690: one configuration (F3)

### Task ID

T690

### Date

2026-10-24

### What changed

- `continent-app/config/pricing.json`: 39 rules (stay fees, place sizes, live damping, peak windows, weekend nights, rooms, dorm children, bounds and repair, band cuts and references, lifestyle presets, party shares and limits, the request defaults, the car model and the fuel and rental tables, the airport transfer band, overland floors, sea bands, network profiles, the calibration, flight age and spread, bag fees, the stays model and the F0 gates). Each has value, unit, kind (measured, sourced, estimate), source, date and review date and the test that pins it. Built by a generator from the values the code ships, nothing retyped; dates from the commit that introduced each value (2026-09-14 means on or before the repository baseline, T690-b); sources from the code's own comments (fuel: EC Weekly Oil Bulletin and globalpetrolprices.com, 1 June 2026; rental: tripbudgetcalculator.com and Rick Steves midpoints).
- `src/lib/price/config.js` `rule(key)` (unknown key throws). stayPrice, costIndex, runtime_pricing, party, countryTransport, groundFares, bagFees, flights and the price request read it. Values unchanged: the price baseline did not move.
- The file lives in the app repo (mirrored in the root), so the app, its tests and the pipeline read one file without crossing the nested repo boundary.
- ESLint parses ES2025 import attributes (`with { type: 'json' }`).

### Files touched

App, created: config/pricing.json, src/lib/price/config.js. Modified: src/lib/stayPrice.js, src/lib/costIndex.js, src/lib/runtime_pricing.js, src/lib/party.js, src/lib/countryTransport.js, src/lib/groundFares.js, src/lib/flights/bagFees.js, src/lib/flights/flights.js, src/lib/price/request.js, eslint.config.js. Commit ae0a583.

### Commands run

The generator (scratchpad `gen-pricing.mjs`); a build to prove the JSON import bundles.

### Config and secrets set

None.

### Before/after measurements

Baseline unchanged. The bundle carries the whole config (6.8 KB gzip, 1.8 KB of it pipeline-only, T690-a).

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| eslint "Unexpected token with" | ecmaVersion 2022 | 2025 |

### What is still open

T690-a (pipeline-only rules in the app bundle), T690-b (dates older than the repository baseline), T690-c (app peak windows against the pipeline's single measured days), T690-d (V13 catches top-level constants, not inline literals; F6 brings the trip-price files in).

### Rollback procedure

Revert app ae0a583. Every module gets its literals back; nothing in the data changes.

---

## T691: drifted copies merged (F3)

### Task ID

T691

### Date

2026-10-24

### What changed

One rental fallback (39), one longest drive (3,500 km), one group cap (20 seats, 4 babies) on the settings line, the price cards, the planner, share links, the AI day plan and `partyOf`; one fuel fallback (1.81); one default bag (`priority_10kg`) in every flight helper, and the Explore card's flight carries the traveller's bag like the calculator (T663-d); the ground-fare calibration is loaded at start; the planner's intercity estimate is the cheaper of the one model's train and bus fares. Tests in `tests/priceConfig.test.mjs`.

### Files touched

App, modified: src/lib/runtime_pricing.js, src/lib/transport.js, src/lib/tripTotal.js, src/lib/party.js, src/components/SettingsLine.jsx, src/browse/DestPriceCard.jsx, src/browse/TripPriceCard.jsx, src/lib/shareLink.js, src/planner/AiDayPlanModal.jsx, src/lib/flights/flights.js, src/lib/price/flight.js, src/lib/price/request.js, src/lib/groundFares.js, src/lib/trip_planner_pricing.js, src/browse/ExploreTab.jsx. Created: tests/priceConfig.test.mjs. Commit f63166a. Several are F6 files (tripTotal, shareLink, AiDayPlanModal, transport): the plan's F3 asks for the merge, so their one constant each moved (row T691-c).

### Commands run

node tests; eslint.

### Config and secrets set

None.

### Before/after measurements

Day baseline unchanged. The Explore flight now includes the bag (a Ryanair return gains 2 x 20). The planner can take up to 20 people in the settings line (was 12).

### What broke and how it was fixed

Nothing.

### What is still open

T691-a (the planner, wizard, share links and saved trips pass `cabin`, which prices no bag; the lap fee is added only on Explore; tripTotal weighs a child 0.5 for food against 0.6: F6), T691-b (the calibration has one cell), T691-c (scope).

### Rollback procedure

Revert app f63166a.

---

## T692: bounds and repair per tier, B8, flight age (F3)

### Task ID

T692

### Date

2026-10-24

### What changed

- A bed is in bounds per tier: dorm 6 to 150, 5-star 6 to 900, others 6 to 500 a person a night (from the wire's p99 per tier with headroom). A bed out of bounds borrows its country's median for the same tier, party and dates, cached per catalogue, request and stays version; each bed is priced once per request (second commit). Closes T662-a; the V6 test no longer skips repaired beds.
- B8: the presets come from the config, one coffee a day in every preset but Backpacker.
- A swept fare may be 3 days old for the next 14 days and 8 days beyond (the sweep's weekly far cycle).

### Files touched

App, modified: src/lib/costIndex.js, src/lib/staysData.js (`staysDataVersion`), src/lib/flights/flights.js, src/lib/runtime_pricing.js, src/lib/lifestyleProfiles.js, tests/priceEngine.test.mjs, tests/priceConfig.test.mjs, tests/budgetSearch.test.mjs, tests/flights.test.mjs, golden.json. Commits 796dedb, f19be6b.

### Commands run

node tests; catalogue measurements; profiling.

### Config and secrets set

None.

### Before/after measurements

Baseline: every day price up by exactly one local coffee (Lake Como +2.10, Kotor +2.78, Bergen +4.41, Lisbon +2.45, Lagos +2.13, Zermatt +7.33), beds unchanged. Repairs and timing in the shared table.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| budgetSearch test "just over" | its budget, total over 1.1 rounded down, sat on the tight edge and the new totals tipped it | the test asks a euro under the trip without its buffer |
| flights test "older than three days" | its stale fare was a far date | near and far stale fares, a far fare 5 days old shown |
| A full reprice went from about 55 to about 90 ms (cold) | the median pass priced every bed a second time | the pass keeps each bed and the rows reuse it |

### What is still open

T692-a (owner: the flight age contradicted PRODUCT.md's 3 days; PRODUCT.md is updated, confirm), T692-b (591 dorm rates over 150 in the wire, at source), T692-c (reprice time on a phone), T692-d (a saved or linked lifestyle with no coffee now reads Custom).

### Rollback procedure

Revert app f19be6b, 796dedb; the baseline returns to before the coffee.

---

## T693: the pipeline and the worker read the config (F3)

### Task ID

T693

### Date

2026-10-24

### What changed

`pipeline/pricing_config.py`; car_layer.py, stays/build_stays.py (model and gate), stays/apply_stays.py (fees), apply_food_prices.py (food gate), flights/build_routes.py (route gate), apply_airport_anchors.py (transfer band) and the sweep worker's publish gate take their numbers from the config. Values unchanged. The config is mirrored in the root so the box run finds it.

### Files touched

Root: pipeline/pricing_config.py (created), pipeline/car_layer.py, pipeline/stays/build_stays.py, pipeline/stays/apply_stays.py, pipeline/apply_food_prices.py, pipeline/flights/build_routes.py, pipeline/apply_airport_anchors.py, continent-app/config/pricing.json; commit fa396e012. App: workers/flight-sweep/src/publish.mjs; commit 195b19a.

### Commands run

py_compile; pytest pipeline/stays/tests tests/test_gate_attribution.py (48 pass); imports of each module; wrangler dry run.

### Config and secrets set

None.

### Before/after measurements

Not measured (values unchanged).

### What broke and how it was fixed

`car_layer.py` has no imports, so the first edit found no anchor and wrote nothing; redone after the docstring.

### What is still open

The box run must pull this before its next stays or car build (no row: the run pulls main).

### Rollback procedure

Revert root fa396e012 and app 195b19a.

---

## T694: per person or the whole group (F4, rule 4)

### Task ID

T694

### Date

2026-10-24

### What changed

A Per person | Whole group segmented control under People (`choices.price_view`, URL `pv=t`, mirrored to local storage and the account like every setting). `lib/price/display.js` (seats x nights for a day, seats for the way there) and `useDayView()`. Explore cards and their parts, map pins (closes T504-h), the destination header and day line, Places cards, lake, beach, mountain and trail pages, country and region pages draw figure and unit through it; the budget filter's stops, unit and chips scale with it. Tests V15 and V16.

### Files touched

App: src/lib/price/display.js and src/hooks/useDayView.js (created), src/components/PriceParts.jsx, src/browse/ExploreMap.jsx, src/browse/DestCards.jsx, src/browse/{Lake,Beach,Mountain,Trail}Page.jsx, src/browse/CountryPage.jsx, src/browse/RegionPage.jsx, src/browse/DestinationPage.jsx, src/browse/DestPriceCard.jsx, src/browse/ExploreFilterRail.jsx, src/browse/ExploreTab.jsx, src/components/SettingsLine.jsx, src/App.jsx, src/lib/urlState.js, src/lib/price/request.js, src/i18n/*.js, tests/priceDisplay.test.mjs. Commit c137ff0.

### Commands run

node tests; eslint; end check.

### Config and secrets set

None.

### Before/after measurements

End check: per person and group totals equal on card and header; total = per person x 14 (Rome 154 to 2,150).

### What broke and how it was fixed

Nothing.

### What is still open

T694-a (not yet in the view: rail "from" facts, the food fold, the day planner, My trips, Ask answers, trip prices), T694-b (the old priceMode and priceRange state).

### Rollback procedure

Revert app c137ff0.

---

## T695: the opened price (F4, rule 9)

### Task ID

T695

### Date

2026-10-24

### What changed

`components/PriceItems.jsx` on the InfoDot popover: a tap on the amount (Explore card, destination header and its calculator) lists bed, food and drink, local transport, car hire (going by car only), activities and tickets, events and the way there, each with its amount in the view and a kit Switch; items without data show NotYet with no switch. Switching off is `choices.price_excluded` (URL `px`), read by the engine, so the day figure, filters, sorting and the calculator receipt follow; a way switched off leaves the card and the receipt. The engine gains an events line. Tests V9 and V5.

### Files touched

App: src/components/PriceItems.jsx, src/styles/86-price-items.css (created), src/components/PriceParts.jsx, src/browse/DestPriceCard.jsx, src/lib/destPrice.js, src/lib/price/priceDay.js, src/lib/price/request.js, src/App.jsx, src/lib/urlState.js, src/i18n/*.js, tests/priceDisplay.test.mjs. Commit 377a483.

### Commands run

node tests; eslint; end check; screenshots.

### Config and secrets set

None.

### Before/after measurements

End check: food off lowers Rome's card from 154 to 92 and the header follows.

### What broke and how it was fixed

The end check could not click a trigger scrolled into view at once: the popover closes on scroll, as the InfoDot does, and the page was still scrolling. The check scrolls first; real taps are on a visible amount.

### What is still open

T695-a (the opened price on Places cards, pins and place pages; a small scroll closes it on a phone), T695-b (owner's design batch for the opened price and the view switch).

### Rollback procedure

Revert app 377a483.

---

## T696: the internal provenance view (F4, rule 5)

### Task ID

T696

### Date

2026-10-24

### What changed

A Prices tab on the admin page (`components/admin/PriceProvenance.jsx`): for a place and the app's current request, every engine line with status, amount, quality, basis and provenance; every rule of the config with kind, unit, source, date and review date (overdue marked). English only, like the admin page.

### Files touched

App: src/components/admin/PriceProvenance.jsx (created), src/admin/AdminPage.jsx, src/i18n/en.js. Commit 3026c11.

### Commands run

eslint; node tests.

### Config and secrets set

None.

### Before/after measurements

Not measured.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| en.js failed to load (Unexpected identifier 's'), breaking eight test files | the apostrophe in "the app's" lost its escape when written, and T696 was committed after lint only | the sentence without an apostrophe, amended into T696; every later commit ran the full suite first |

### What is still open

T696-a (the tab was not opened in the browser: the admin page needs an unlock).

### Rollback procedure

Revert app 3026c11.

---

## T697: dead price code (F4, plan 4.4)

### Task ID

T697

### Date

2026-10-24

### What changed

BudgetSearch.jsx, BudgetResults.jsx and LengthPicker.jsx deleted (imported nowhere). The URL keys pm and pr are no longer written or read; old links are still cleaned up. Filter and sort rules 1 and 2 of 4.4 are T694 (budget in the view) and PB1 (the way choice moves list and figure); rules 3 and 4 (Ask's own request, saved trips' own request) are F6.

### Files touched

App: src/lib/urlState.js; deleted src/browse/BudgetSearch.jsx, src/browse/BudgetResults.jsx, src/browse/LengthPicker.jsx. Commit ef435f1.

### Commands run

grep for importers; node tests.

### Config and secrets set

None.

### Before/after measurements

Not measured.

### What broke and how it was fixed

Nothing.

### What is still open

T694-b covers the state left behind.

### Rollback procedure

Revert app ef435f1.

---

## T698: the day sentence and the documents (F4, B11)

### Task ID

T698

### Date

2026-10-24

### What changed

`includedParts()` builds the day sentence from the engine's included, priced lines: "A bed plus food and drink.", "A bed." with food off, and local transport by itself once F8 prices it (`dest.dayPart.transport` in six languages). PRODUCT.md (lines 29, 31, 61, 63, 119, 127), DESIGN.md and carta-design follow the owner's decisions: no estimate mark, provenance in the admin view, per person or the whole group, the opened price, local transport as an estimate once priced (B11, PRODUCT.md:61), the flight age per sweep cycle and the 4-day nearest-day spread the code uses (PRODUCT.md said 3).

### Files touched

App: src/lib/price/display.js, src/browse/DestinationPage.jsx, src/browse/DestPriceCard.jsx, src/i18n/*.js, tests/priceDisplay.test.mjs; commit 736377e. Root: PRODUCT.md, DESIGN.md, .claude/skills/carta-design/SKILL.md; commit 51c6729d4.

### Commands run

node tests; dash check on the three documents (0).

### Config and secrets set

None.

### Before/after measurements

End check: "A bed plus food and drink." and "A bed." with food off.

### What broke and how it was fixed

Nothing.

### What is still open

T698-a (carta-design's "Budget search (T506)" section describes the removed component).

### Rollback procedure

Revert app 736377e and root 51c6729d4.

---

## Register rows closed by this batch

- T662-a closed by T692 (bounds and repair per stay tier).
- T663-d closed by T691 (the Explore flight carries the bag).
- T504-h closed by T694 (pins say the cards' unit).
- T446-b closed by T698 (owner B11: the figure gains local transport as an estimate once priced; PRODUCT.md says so).
- T099-d closed by T698 (the same decision: local transport stays its own line until it is priced).
- T667-b closed by T698 (the sentence and the opened price follow the engine's lines; the estimate itself stays F8, PB5, which needs fare data).
