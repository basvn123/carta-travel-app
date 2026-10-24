# T714 to T716: price engine PB5, local transport (F8), activities (F9) and data quality (F10); PB4 blocked

## Shared header

**Batch.** PB5 of the price plan (Claude Doc "Carta prijslogica Explore: plan", https://claude.ai/artifact/3aBYSPsJ3a1RzrRiS6cvrn): F8 local transport (T714), F9 activities (T715) and F10 data quality (T716 plus measurements). Asked by the owner after PB2: "yes merge en doe de volgende batches, al sje klaar bent push en deploy".

**PB4 (F7 calibration) did not run.** Its precondition, the first gated ingest of the new Hostelworld and Booking scrape, has not passed. Register row T645-a is open: the first publish after F0 must build from the R2 state on GitHub Actions, and the laptop's journal fails the gate. Calibrating the star ladder, the Airbnb ratios, the PLI exponent and the bands on a scrape that has not been published would set the estimates on data that may not ship. PB4 runs after the first publish (row T714-a).

**Decisions in force.**
- B9 (owner, "Meteen"): the homepage may promise local transport right away.
- B10: activities are never in the card amount.
- B11: local transport gets an estimate and goes into the day price.

**Numbering.** T714 to T716, from the price batches' reserved range (T699 to T730). The planner session holds T731 to T735.

**Branches.** App `p15-price-pb5-data` (from master d930450, worktree `wt/p15-price-pb5-app`), one commit per task. Root `p15-price-pb5-data` (from main 7e87c707f, worktree `wt/p15-price-pb5-root`): T714's SCHEMA.md row 5fe9ff424, mirror 379d32eb2, this report and the register.

**Static checks.** `npm test` in the worktree: 721 pass, 3 fail. The 3 are the `numbersPage` tests, which need `public/boot.json`, absent in a worktree. eslint on every touched file: clean. Fast build passes.

**End check.** Dev server on port 5299 over the main tree's `public/`, `wt/pb5-endcheck.mjs` (outside the repo), at 390 x 844 and 1280 x 800: 50 of 50 checks pass, no page error. It covers the PB3 screens again, and the destination calculator shows no activity switch and no transport line, because no place has a fare or a priced thing to do yet. The switches and the transport line were not seen with data in a browser: no data exists to show them (T715-a).

**Measurements (shipped wire, 3,868 places).**

| Measure | Before | After |
|---|---|---|
| Places with a local transport fare (F8 coverage) | 0 | 0; the engine prices it as soon as the field exists |
| Things to do with a price in the published dossiers (F9) | 0 of 14,650 | 0 of 14,650; the pipeline writes `price` records (T641) but the box rebuild that publishes them has not run |
| Mean round-trip toll for the 566 places with a toll corridor, start Brussels | 93 | 93 (unchanged) |
| Same, start Amsterdam | 93 (Brussels' corridor) | 64 (flat allowance, own road; 563 places change) |
| Same, start Munich | 93 | 50 (562 places change) |
| Entire place a person a night, Lisbon, groups of 1 / 2 / 4 / 6 (F10, group size) | 139.02 / 69.51 / 43.51 / 38.05 | the same: group size already moves the entire-place price (T692 bounds by tier and party) |
| First load (fast build) | 33 files, 2,099,613 bytes | 33 files, 2,102,664 bytes |

**The five F10 points.**
1. Live price for an entire place and a dorm: no live source exists. Xotelo prices hotels and rooms only (T576-a, the owner's product call, still open).
2. Food season: the plan asks for one, but on 2026-10-07 the owner decided against a seasonal ground cost (T103-c, closed by T362). Which stands is the owner's call (T716-b).
3. Group size for an entire place: already moves, measured above. The Foodie preset costing less than Easygoing (Bergen 66 against 74, because Easygoing holds a club night and more drinks) is another part of T471-g and stays there.
4. Toll from the traveller's own start: T716.
5. The live site matching the code: the deploy that follows this batch.

**Screens the next end check must look at.** The destination calculator with priced things to do (the switches), and any place with a fare (the transport line, the short line naming it, the opened price's transport row), once the box publishes them. Places and the planner's own-car legs from a start other than Brussels (tolls).

---

## T714: local transport in the day price once a place has a fare (F8, B11)

### Task ID

T714

### Date

2026-10-24

### What changed

- The engine's transport line reads a fare record, `local_transport.fare` (`ride_eur`, `day_pass_eur`, `currency`, `source`, `date`, `quality`).
- The amount a person a day is the ride fare times the rides a day for the kind of place, capped by a day pass, at the children's ticket share.
- The rides a day are a new configured estimate, `transport.rides_per_day`: metro 3, city 2, town, village and area 1.
- Once a place has a fare, the transport line is in the day, the calculator, a trip stop's days and a composed trip, and the short line under the price names it.
- Without a fare the line stays missing and the day is bed and food (rule 8, never a zero). Only euro fares count.
- docs/SCHEMA.md declares the additive field (root commit 5fe9ff424).
- No place has a fare yet: the pipeline layer that writes one needs a fare source, which is open (T714-b).

### Files touched

App, modified: config/pricing.json, src/lib/price/priceDay.js, stay.js, compose.js, nights.js, src/browse/DestPriceCard.jsx. Created: tests/priceTransport.test.mjs. Root: docs/SCHEMA.md.

### Commands run

npm test; eslint.

### Config and secrets set

`config/pricing.json` adds `transport.rides_per_day`.

### Before/after measurements

Coverage: 0 of 3,868 before and after. Every day price unchanged: no place has a fare.

### What broke and how it was fixed

No issues.

### What is still open

- The fare source and the pipeline layer (T714-b, owner: which source).
- B9's homepage promise can only come true once places have fares (T714-c).
- PB4 waits for the first gated publish (T714-a).

### Rollback procedure

Revert the app commit and root 5fe9ff424. The transport line goes back to a constant "missing".

---

## T715: activities as switches in the calculator (F9, B10)

### Task ID

T715

### Date

2026-10-24

### What changed

- The destination page hands its things to do to the price card.
- The card lists up to six with a euro price as switches, all off. The price comes from the `price` record or `fee_eur`, through `lib/price/doPrice.js`.
- Switching one on adds exactly its price times the party, as an "Activities and tickets" line (V9). Switching all off gives the reference total.
- An activity is never in the day figure or on a card (B10).
- The hint "{price} a person" (`price.actEach`) is in all six languages.

### Files touched

App, modified: src/lib/price/nights.js, src/browse/DestPriceCard.jsx, src/browse/DestinationPage.jsx, src/i18n/*.js, tests/priceTransport.test.mjs.

### Commands run

npm test; eslint.

### Config and secrets set

None.

### Before/after measurements

Priced things to do in the published dossiers: 0 of 14,650, so no switch shows today.

### What broke and how it was fixed

No issues.

### What is still open

- The switches have not been seen with data in a browser. Check them once the box publishes the `price` records (T715-a).
- The switches use the kit's Switch inside the opened price's list styling, without a design pass. That belongs with T695-b, the owner's design batch, which is still open.

### Rollback procedure

Revert the app commit.

---

## T716: tolls from the traveller's own start (F10, row T471-f)

### Task ID

T716

### Date

2026-10-24

### What changed

- The toll layer's corridors (`dest.driving_toll`) are measured from the pipeline's start (`meta.home`, Brussels).
- A drive now uses a corridor only when it begins within `car.toll_corridor_start_km` (30, config) of that start.
- Any other drive prices its tolls with the flat `car.model` allowance on its own road, and shows no Brussels corridor notes.
- Places' composed drives and the planner's own-car legs pass the corridor's start.

### Files touched

App, modified: config/pricing.json, src/lib/runtime_pricing.js, src/lib/price/compose.js, src/lib/price/trip.js, src/hooks/useDestinationSearch.js, tests/priceTransport.test.mjs.

### Commands run

npm test; the toll measurement (`wt/tollm.mjs`, outside the repo).

### Config and secrets set

`config/pricing.json` adds `car.toll_corridor_start_km` (30).

### Before/after measurements

See the header: no change from Brussels. From Amsterdam the mean toll goes from 93 to 64 (563 places change); from Munich, 93 to 50 (562 places).

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| V13 failed | the 30 km radius was a number in runtime_pricing.js | it moved to config/pricing.json |

### What is still open

- Tolls on legs between stops still average the two endpoint countries, and vignettes add 0 (the rest of T471-f, still open).
- A corridor for each start needs the toll layer to run per origin on the box (T716-a).
- The food season decision (T716-b).

### Rollback procedure

Revert the app commit. The Brussels corridor applies to every start again.
