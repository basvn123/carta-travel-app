# T649 to T652: Explore step 4, dynamic key stats

## Shared header

**Batch.** The four key stats at the top of the destination Overview (Best months, Crowds, Nearest airport, Car) made correct, consistent and driven by the traveller's choice (issue O11). T649 crowds by month, T650 Getting around (mobility) instead of "Car: needed", T651 the airport with real travel time, T652 Best months check and node tests. Numbering: highest in `git log --all` and every worktree was T648; T643 to T646 are the F0 price batch.

**Preconditions.** T640 to T648 is merged (root main ec0d8de16, app master 4ed6540). The Monday box run has NOT run, so this batch was built and tested against fixtures computed by the real pipeline code over the local master (`scratchpad/t649-pipeline/fixtures`: 9 full records and a patch for all 3,868 destinations). Verifying on the real wire after the run is row T649-a.

**How it was split.** One pipeline agent (T649 and T650 rules) and one app agent (helpers, stats, flags, i18n, tests) on a fixed data contract, then one browser end check, two fixes from it, and a recheck. Static checks per task; one end check on the merged batch.

**Data contract.** Additive only. `crowding.monthly` keeps its shape and gains `rule: "t649-v1"`. New `dest.local_transport.mobility = {car_free: good|ok|hard, modes[], car_useful_for[] (codes trailheads, lake_villages, countryside), parking_hard?, basis, source}` next to `car_needed`, which stays (price plan F6). `airports[]` unchanged. `scripts/sync-data.mjs` and `bootIndex.js` pass all three through; the dossier does not carry them and does not need to (the app reads them from the destination record).

**Branches.** Root `p15-key-stats-dynamic` (from main ec0d8de16), app `p15-key-stats-dynamic` (from master 4ed6540). Not merged, not pushed.

**Static checks.** py_compile on the touched pipeline files; eslint on touched app files (0 errors); `node --test tests/keyStats.test.mjs` 15 of 15; `npm test` 658 pass, 3 fail only on the missing `public/boot.json` in the worktree (numbersPage, unrelated); no en or em dashes.

**Lake Como, before and after** (after = fixtures from the real code; the live wire changes on the Monday run):

| Stat | Before (Aug and Nov) | After, August | After, November | Source |
|---|---|---|---|---|
| Best months | May to Sep | May to Sep | May to Sep | `climate.best` (unchanged) |
| Crowds | Crowded / Crowded | Crowds in August: Crowded | Crowds in November: Moderate | `crowding.monthly.tier`, rule t649-v1, Eurostat `tour_occ_nin2m` |
| Nearest airport | BGY, 60 min (no mode; the key fact read "by train" before T642) | BGY, 146 min by train | same | `airports[]`, Trenord GTFS (CC BY 4.0), upper bound (T642-b) |
| Car / Getting around | Car: needed | Easy without a car. By train and bus. A car helps for trailheads and lake villages. | same | `local_transport.mobility`, Trenord lines + categories |
| Any time | | Crowds: Quiet Jan to Feb, Nov, busy Apr to Oct | | |

**End check.** One round on the merged app batch with the patched wire served in memory, at 390 x 844 and 1280 x 800. Every screen passed: Lake Como (exact August, exact November, a span 28 Oct to 4 Nov reading October as the busier month, Month = November, Any time), Dubrovnik and Bergen in peak and low months, Naxos (island), Paris (city), four random places, three unpatched places (NotYet), nl and de. No page error, no overflow, no dash, no raw i18n key, no "train" without data. The Explore flags agreed with the destination stats on every matched card. Two failures were fixed and rechecked (see T649 and T650 What broke).

**Measurements (all 3,868 destinations, fixtures).**

| Measure | Before | After |
|---|---|---|
| Destinations whose monthly crowd tier varies | 2,536 of 3,289 under T642 (big places flat, e.g. Lake Como, Paris, Rome all 3) | 3,289 of 3,289; 2,615 span two tiers or more |
| car_free | | good 721, ok 1,013, hard 2,134 |
| "No car" flag | 1,725 (car_needed false and transit good or excellent) | 1,734 (car_free good or ok) |
| "Quiet" flag | 704 (annual tier exactly 1) | 1,285 with no month, 584 in August, 3,014 in November (tier 1 or lower in the month) |
| Airport stat with a public transport time | 0 | 83 (Lombardy only, Trenord); 3,521 road estimate; 264 airport-tier places show their own code |

---

## T649: crowds by month

### Task ID

T649

### Date

2026-10-24

### What changed

- Pipeline (`pipeline/harvest_tourism_density.py`): `tier[i] = clamp(annual_tier + shift, 0, 3)` with `shift = round(SEASON_GAIN * log2(share[i] * 12))`, set to 0 inside `SEASON_DEAD_BAND`, clamped to `-SEASON_MAX_DOWN .. +SEASON_MAX_UP`. Constants: SEASON_GAIN 3.0, SEASON_MAX_UP 1, SEASON_MAX_DOWN 2, SEASON_DEAD_BAND 0.5. Scale 0 quiet, 1 moderate, 2 busy, 3 crowded (the annual scale). The T642 rule is kept as `month_tier_t642` for reproduction; `monthly.rule = "t649-v1"`.
- App: one month helper `src/lib/when.js` (`resolveWhen` gives exact with one or two months, month, or any; `xm` wins; Carta's default dates read as any; `whenMonth`, `busiestMonth`, `xmFromSearch`). App.jsx, SettingsLine.jsx (`useWhen`), DestinationPage.jsx (Crowds stat, the month fact, the climate strip outline) and ExploreTab (quiet flag, the "Quiet in high season" rail) read it. `src/lib/crowdMonth.js` (`crowdFor`, `crowdTierFor`, `quietFor`) is the one crowd reader; guidedSearch `quietOk` and ask/rank.js use it. The stat reads "Crowds in {month}: {tier}"; for any time "Quiet {months}, busy {months}"; a month without a monthly series shows NotYet, never the annual tier dressed as that month.

Monthly tiers, January to December:

| Place (annual tier) | Before (T642) | After (T649) |
|---|---|---|
| Lake Como (3) | 3 3 3 3 3 3 3 3 3 3 3 3 | 1 1 2 3 3 3 3 3 3 3 1 2 |
| Dubrovnik (3) | 1 1 2 3 3 3 3 3 3 3 1 1 | 1 1 1 1 2 3 3 3 3 1 1 1 |
| Bergen (0) | 0 0 0 0 1 1 1 1 1 0 0 0 | 0 0 0 0 0 1 1 1 0 0 0 0 |
| Paris CDG (3) | 3 all year | 2 2 3 3 3 3 3 3 3 3 3 3 |
| Rome FCO (3) | 3 all year | 1 2 3 3 3 3 3 3 3 3 2 2 |
| Kitzbuehel (3) | 3 3 3 3 3 3 3 3 3 3 2 3 | 3 3 3 1 1 2 3 3 2 1 1 3 |
| Zermatt (3) | 3 3 3 2 2 3 3 3 3 2 2 2 | 3 3 3 2 2 3 3 3 3 2 1 3 |

Places that still look off: Zermatt equals Verbier (seasonality is Eurostat NUTS 2, CH01, which dilutes the Valais resorts); Bergen stays quiet to moderate all year because its absolute pressure is low (178 nights per km2), which is honest; Rome January reads moderate, arguably low; Lake Como November reads Moderate, not Quiet (tier 1). Seasonality is regional, so two places in one region differ only by their annual tier (T649-b, T649-c).

### Files touched

Root: pipeline/harvest_tourism_density.py, docs/SCHEMA.md. App: src/lib/when.js (created), src/lib/crowdMonth.js (created), src/App.jsx, src/components/SettingsLine.jsx, src/browse/DestinationPage.jsx, src/browse/ExploreTab.jsx, src/lib/guidedSearch.js, src/lib/ask/rank.js, src/i18n/*.js. Commits: root 7aff83a4f; app 5ffe033, af7da4c.

### Commands run

py_compile; Eurostat `tour_occ_nin2m` pulled into scratch (825 regions, matched to 3,289 destinations); the real functions run on a scratch copy of the master; eslint; node tests.

### Config and secrets set

None.

### Before/after measurements

See the tier table above and the shared measurements.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `xm=11` on the destination page read the any-time pattern | DestinationPage built its `when` from settings and first-run dates only | `when.xmFromSearch`, DestinationPage passes it to `resolveWhen` (af7da4c); rechecked |
| Quiet flag excluded tier 0 places | old check `tier === 1` | now tier 1 or lower in the chosen month |

### What is still open

Verify on the real wire and remove the fallbacks (T649-a); NUTS 2 seasonality for resorts (T649-b); Moderate versus Quiet for seasonal low months (T649-c); the Explore month filter returns nothing for November to February (T649-d); F2 must import `lib/when.js` (T649-e).

### Rollback procedure

Revert root 7aff83a4f and app af7da4c, 5ffe033. The wire key `monthly.rule` disappears; the shape is unchanged.

---

## T650: Getting around instead of "Car: needed"

### Task ID

T650

### Date

2026-10-24

### What changed

- Pipeline: `car_layer.mobility_for`, written by `apply_car_layer.py` as `local_transport.mobility`. good = rail or ferry plus a second mode (T642 "served"), ok = one mode, hard = no line, a remote category (unless also tagged city: Bergen is a fjord city) or an island without a ferry. Without lines the category rule decides, with `basis: "category"` and `modes: []`. `car_needed` and T642's `car_useful_for` string stay.
- App: `src/lib/mobility.js` (`mobilityOf`, `carFreeOf`, `noCarOk`, `mobilityStat`, `gettingAroundRows`). The fourth stat is "Getting around": "Easy without a car", "Possible without a car" or "Hard without a car", with one note line ("By train and bus.", "A car helps for trailheads and lake villages.", "Parking is hard."). Absent mobility: NotYet. The Explore "no car" flag reads `noCarOk` (car_free good or ok); while mobility is absent it falls back to the old rule inside the same helper. Getting there on the Practical tab reads the same helper (fix from the end check).

Lake Como: car_free good, modes train and bus (Trenord R13 and RE8 between Varenna, Bellano, Lierna and Mandello, plus TN bus), car useful for trailheads and lake villages. Ferry is absent until the OSM ferry legs run on the box. parking_hard is false: the data shows two or more public lots within 1.5 km, so "parking is hard" is not shown and was not hand-set (T650-c).

### Files touched

Root: pipeline/car_layer.py, pipeline/apply_car_layer.py, docs/SCHEMA.md. App: src/lib/mobility.js (created), src/browse/DestinationPage.jsx, src/browse/DestOverview.jsx, src/browse/GettingThere.jsx, src/browse/DestPractical.jsx, src/lib/guidedSearch.js, src/styles/64-v6-destination.css, src/i18n/*.js. Commits: root be5d8e758; app 9902b3e, 9d3a478.

### Commands run

py_compile; `gtfs_lines.py --feeds trenord-lombardia` into scratch (4.5 s, 23 destinations, 93 legs); `apply_car_layer.patch()` on a scratch master; eslint; node tests.

### Config and secrets set

None.

### Before/after measurements

| Measure | Before | After |
|---|---|---|
| Lake Como | Car: needed | Getting around: Easy without a car |
| car_free | | good 721, ok 1,013, hard 2,134 (hard equals car_needed true while only Trenord lines exist) |
| No car flag | 1,725 | 1,734 |
| parking_hard known / true | | 3,038 / 281 |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Practical tab said "A car is needed here" while the Overview said "Easy without a car" | GettingThere read the legacy `car_needed` and `getting.transit` | GettingThere reads `gettingAroundRows`; the "needed" sentence is gone when mobility exists, the rental figure stays (9d3a478); rechecked |
| The app agent set `core.autocrlf=false` in the shared app repo config | worktree "local" config is the repo's | unset by the orchestrator; system default true restored |

### What is still open

Ferry lines (T650-a); more verified feeds (T650-b, links T641-b); the parking threshold for Lake Como (T650-c); the price card, Ask compose, CountryPage and ask/rank still read `car_needed` (T650-d, price plan F6); "lake villages" for a fjord city (T650-e); Practical Trains, Buses, Ferries placeholders until the dossier rebuild (T650-f); `car_free` in the gate enums (T650-g); remove the no-car fallback after the run (T649-a).

### Rollback procedure

Revert root be5d8e758 and app 9d3a478, 9902b3e. `local_transport.mobility` disappears; `car_needed` was never touched.

---

## T651: airport with real travel time

### Task ID

T651

### Date

2026-10-24

### What changed

- `src/lib/airportPick.js` (`pickAirport`, `airportLine`, `flyLine`, `airportOptionLabel`, `modeKey`): the best airport is the shortest public transport option across all airports, else the shortest road estimate; with no options it falls back to the single airport record. The key fact shows one airport with code, minutes and mode; Getting there keeps the full list of up to four airports with their options.
- Copy decision (T642-c): a road estimate reads "by road" ("BGY, 60 min by road", "60 min by road, estimate"). "By car" implies the traveller drives; "bus or shuttle" claims a service the data does not have. A public transport option names its mode ("by train", new `mode.train_bus` "train and bus"). No mode in the data: "{code}, {n} min. Mode: Not available yet". Never "train" without data.
- T642-d: `dest.airportOpt`, `dest.airportOptEst`, `dest.airportsMore` added in nl, de, fr, es, it.
- The train times are upper bounds until the Milan metro footpaths are in the connection scan (T642-b stays open).

### Files touched

App: src/lib/airportPick.js (created), src/browse/DestinationPage.jsx (airport key fact hunk; the wire `airports[]` joins the dossier getting-there record), src/browse/GettingThere.jsx, src/i18n/*.js. Commits: app 553696e, and the join hunk in 80dc195.

### Commands run

eslint; node tests.

### Config and secrets set

None.

### Before/after measurements

| Measure | Before | After |
|---|---|---|
| Lake Como airport stat | BGY, 60 min (nearest by straight line, no mode) | BGY, 146 min by train (shortest public transport) |
| Lake Como Getting there | one airport | BGY 146 min by train, 60 min by road, estimate; MXP 206 / 70; LIN 161 / 74 |
| Destinations with a public transport time on the stat | 0 | 83 |

### What broke and how it was fixed

Nothing in the end check. German writes "146 Min." on the Practical tab and "146 min" in the key fact (T651-a).

### What is still open

German minutes and the unused `dest.airportOptEst` key (T651-a); 264 airport-tier places show their own code with no time (T651-b); Milan footpaths (T642-b, open).

### Rollback procedure

Revert app 553696e (and the join hunk in 80dc195).

---

## T652: Best months check and node tests

### Task ID

T652

### Date

2026-10-24

### What changed

- Best months unchanged and consistent with the climate strip: both read `climate.best` (the key fact through the dossier's `when.best`, `build_dossier.py:1652`). A best month can also be crowded (August at Lake Como); that is two different questions, not a contradiction.
- `tests/keyStats.test.mjs` (15 tests) and `tests/fixtures/keyStats.json` (Lake Como, Paris, Naxos from the pipeline fixtures; the CDG airport inputs are hand-made and marked): `resolveWhen` exact, span, month, any and xm; crowd tier per month; mobility; the airport pick; `gettingAroundRows`.

### Files touched

App: tests/keyStats.test.mjs, tests/fixtures/keyStats.json. Commits: app 80dc195 (and the test additions in af7da4c, 9d3a478). Root mirrors 0c3063dc1, 9b2558736.

### Commands run

`node --test tests/keyStats.test.mjs` 15 of 15.

### Config and secrets set

None.

### Before/after measurements

Not measured (tests only).

### What broke and how it was fixed

None.

### What is still open

Nothing new.

### Rollback procedure

Revert app 80dc195.

---

## Register rows closed by this batch

- T642-c closed by T651 (road estimates read "by road").
- T642-d closed by T651 (T642 keys in all six languages).
