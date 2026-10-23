# T630 to T632: Explore detail sheets, step 1, completeness of information

## Shared header

**Batch.** Three tasks, one report and one browser round (CLAUDE.md "Batches"). T630 routes and peaks, T631 climate, lakes and beaches, T632 Practical tab, things to do and export. Visual design, price logic and the cost calculator are out of scope.

**Numbering.** The highest number in `git log --all` and every worktree's `Execution/` was T623. At 16:33 another session created worktree `wt/t624` (branch `p11-booking-headed`, a Booking scraper) with no commit yet, so it has probably taken T624. To avoid another T470/T477 collision this batch skipped to T630. T624 to T629 are not used by this batch.

**Owner decisions taken at step 0 (2026-10-23).**
- Placeholder versus carta-design: "the prompt wins, coverage must be complete". Every field in the spec keeps a slot. A slot without a value shows one shared placeholder, `components/NotYet.jsx` (`data.notYet` "Not available yet", `data.notYetLine` "Not available yet. This will be added in a future data update.", in all six locales). For these fields "a missing fact is left out" and "Say less" no longer apply. Recorded in DESIGN.md ("Fields with no data yet") and as an exception under "Detail page grammar" in the carta-design skill.
- Pipeline: code only. Derive, harvest and export steps are written and checked on a few real rows, but no harvest, export or `run_pipeline.py` ran and no wire or cache changed. "After" counts only what the sheets show from the current published wire, including values the app derives from keys already in it.
- Each task ran on Sonnet as a subagent in its own pair of worktrees. The orchestrator (Opus) did the audit, the merges, the end check and this report.

**Step 0 audit.** Three read-only audits (wire fill rates computed over the published wires, pipeline and app code read). The full field table is under each task. Corrections to the prompt's assumptions:
- There is no `pipeline/schema.py` and no root `SCHEMA.md`. The contract lives in `docs/SCHEMA.md` (one new section per task), `pipeline/trails/schema.py`, the dossier's `SCHEMA = "dossier_v2"` in `pipeline/dossier/build_dossier.py`, and the CI table in docs/SCHEMA.md with `continent-app/scripts/ci/contract.mjs`. No top-level `app_data` key and no `schema_version` changed, so the CI contract table needed no row.
- Explore already has a Beaches tab (`EXPLORE_TILES` in ExploreCategories.jsx: Places, Trails, Beaches, Lakes, Mountains, Cycling). The destination sheet's outdoor strip (`AroundHere` `LAYER_ORDER`, `destOverview` `AROUND_KINDS`) already includes beaches. Nothing was added. The chips are named Trails and Mountains, not Hikes and Peaks.
- DIN 33466 was already the trail time rule in the pipeline (`pipeline/trails/elevation.py` `duration_min_din33466`). Its constants (4 km/h horizontal, 300 m/h up, 500 m/h down, the smaller of horizontal and vertical time counted half and added to the larger) match the sources below. The norm text itself is sold by DIN Media and was not read. Sources: DAV Sektion München-Oberland, "official sign times are computed per DIN 33466: 300 m ascent or 500 m descent or 4 km horizontal per hour" (https://www.alpenverein-muenchen-oberland.de/wegegebiete/mark_boenke); Bergwelten, the combination rule (https://www.bergwelten.com/a/berg-know-how-wie-lange-geht-s-noch); Planetoutdoor, worked example (https://planetoutdoor.de/wissen/auf-wanderungen/auf-bergtour-gehzeit-berechnen).

**Shared pieces.**
- `continent-app/src/components/NotYet.jsx`: `notYet(t, line)`, `orNotYet(t, value)` and `<NotYet line? />` with `data-testid="not-yet"`. `.not-yet` and `.not-yet-line` are in `src/styles/45-empty-states.css` and use `--ink-soft`. No new token.
- `pipeline/field_stubs/report.py`: the register of fields with a slot but no wired source. Each task declares its stubs in its own module (`t630_routes.py`, `t631_water.py`, `t632_practical.py`). The report checks that every stub function exists and writes nothing, then writes `data/reports/field_stubs.md` and `.json`. There are 27 stubbed fields: 3 from T630, 15 from T631, 9 from T632. That list is the to-do list for the next scrape.

**Branches.**
- Root batch branch: `p15-explore-completeness`, from `main` 0f039b61f. The task branches are `p15-t630-root`, `p15-t631-root` and `p15-t632-root`.
- App batch branch: `p15-explore-completeness`, from `master` ac0dd2a. The task branches are `p15-t630-app`, `p15-t631-app` and `p15-t632-app`.
- Both batch branches are ready to merge, but nothing is merged yet. Root `main` has uncommitted mirror edits from another session, so the merge into `main` is left to the owner.

**End check.**
- **How it ran:** one round on the merged app batch branch, `vite` dev server on port 5230, with Playwright.
- **Screens:**
  - Lake Como (`#dest=gem%3Acomo`), all four tabs.
  - A T1 trail, AT 10175 (`hiking`), and a T3+ trail, AT 10179 (`alpine_hiking`, shows T4).
  - A cycle route, IT 58329, and a peak, Grignone `it-grignone-Q20970624`.
  - A lake, Lake Como `it-lake-como-Q15523`.
  - A free beach, Guvano `it-guvano-Q3780024`. The lido slot was checked on the Monticolo beach `it-lago-piccolo-di-monticolo-davanti-al`. The wire has no free or paid field yet (T631), so both beaches show the access model as the placeholder.
- **Widths:** each screen at 390 x 844 and 1280 x 800.
- **Assertions:** every listed `data-testid` slot is present, the placeholder count is recorded, there is no horizontal overflow, and there are no page errors.
- **Result:**
  - No crash and no overflow on any screen.
  - The only console errors are CORS refusals for the flights data host from localhost. That happens on every local run.
  - On the phone, the peak deep link needed longer than 8 s to open. With a longer wait the peak facts render: rank, slope, lift price and lift hours, and huts show the placeholder. The summit forecast returns seven days from MET Norway, corrected to 2,410 m.
  - Screenshots were taken of the peak facts, trail route facts, beach facilities and Practical tab at 390 px. They are in the session scratchpad, not committed.
  - What broke is listed under T630.
- **Static checks on the merge:**
  - `npm test`: 685 of 685 pass in the main app checkout.
  - The fast NOPUBLIC build (`wt/vite.t606nopub.mjs`) succeeds in 12.4 s.
  - `py_compile` passes on all 13 touched pipeline files.
  - `field_stubs/report.py` lists the 27 stubs.
  - No em or en dashes were added.

**Measurement summary (share of rows where the sheet shows a real value instead of the placeholder).** The per-field tables are under each task. "Awaiting run" fields stay at 0% after, as expected.

| Category | Field | Before | After |
|---|---|---|---|
| Trails (17,670 detail) | SAC grade on the page | 0% | 19.3% (tag or worst member way) |
| Trails | SAC on cards, Around strip, filter | 0% | 0%, awaiting run |
| Trails | Walking time with pace choice and breaks | 0% | 100% |
| Trails | Descent, low and high point | high point only; low as an axis label | 98.8% |
| Trails | Average grade | 0% | 98.8% |
| Trails | Steepest grade as a fact | story line only | 98.8% |
| Trails | Road share | 0% | 98.8% |
| Trails | Technique, exposure, SAC profile, transit | 0% | 0%, awaiting run or stub |
| Cycle (3,000 sampled details) | Riding time | not shown | 100% |
| Cycle | Descent, low and high point, steepest grade | descent not shown | 99.97% |
| Cycle | Route shape | loop only, 19.2% of rows | same until run |
| Peaks (740 full rows) | Range | 79.2% | 79.2%, placeholder for the rest |
| Peaks | Summit forecast at summit height | 0% | 100% at runtime |
| Peaks | Rank, slope, huts | 0% | 0%, awaiting run |
| Peaks | Lift price and hours | 0% | 0%, stub |
| Lakes (1,628) | Climate on the lake sheet | 0% | 81.7% (base town within 30 km, labelled) |
| Lakes | Water temperature (modelled, labelled) | 99.8% | 99.8% |
| Lakes | Max depth | 33.1% | 33.1% |
| Lakes | Bathing class | 55.0% | 55.0% |
| Lakes | Swimming-ban slot | 0% | 84.3% (from `swim.rule`) |
| Lakes | Zones, beaches around, ferry stops, sports | 0% | 0%, awaiting run |
| Lakes | Lifeguards, wind profile, ferry lines | 0% | 0%, stub |
| Beaches (2,745) | Climate on the beach sheet | 0% | 94.0% |
| Beaches | Water-shoes hint | 0% | 57.2% |
| Beaches | Surface | 57.5% | 57.5% |
| Beaches | Access model, dogs, shade, operator, pool, rentals | 0% | 0%, awaiting run |
| Beaches | Lido prices, water-entry surface, walk from pier or centre | 0% | 0%, stub |
| Destinations (3,868) | Rain days, wind | 0% | 0%, awaiting run |
| Destinations | Sunshine hours, water temperature | 0% | 0%, stub |
| Destinations | Temperature at altitude | 0% | 0%; about 15.5% after the climate run |
| Destinations | Parking warning slot | 8.0% | 33.5% (warning or "no restriction found when checked") |
| Destinations | Trains, buses, ferries between towns; local rules; swimming bans | 0% | 0%, stub |
| Destinations (14,650 `do` items) | Thing to do: specific type | 18.0% | 18.0% |
| Destinations | Thing to do: kind and town | 0% | 0%, awaiting dossier rebuild |
| Destinations | Thing to do: price and duration | 0% | 0%, stub |
| Destinations | One-click GPX per listed route | 0% | 93.2% of dossiers list at least one route |

---

## T630: routes and peaks

### Task ID

T630

### Date

2026-10-23

### What changed

Every route and peak sheet now carries the fields of the spec, each as a value or the shared placeholder.

**Trail page.** A route-facts block (`RouteFacts.jsx`) holds:
- SAC grade T1 to T6, from the relation's `sac_scale` tag or else the worst member way (`grade_parts.sac_worst`).
- Low point, average grade and steepest grade.
- Route shape and road share.
- Technique and exposure (placeholder until the run).
- Public transport or ferry (placeholder, stub).
- An underfoot split in percent.
- A pace choice (family, normal, fit, trail running, as multipliers 1.3, 1.0, 0.8 and 0.6 on the stored DIN 33466 base time) that shows walking time plus a range with 10 to 15 minutes of breaks per hour.
- A SAC-coloured profile path, drawn when `sac_segments` arrive and showing the placeholder until then.

The distance, time, ascent, descent and high-point facts are now always present.

**Cycle page.** It shows the riding time and its rule (`dur.min`, house rule 18 km/h flat plus 10 minutes per 100 m of climb, never shown before), descent, low and high point, average and steepest grade, shape, and paved, unpaved and traffic-free shares.

**Route cards and the Around strip.** They show four badges: SAC grade, length, climb and time. Cycle cards show three; SAC does not apply.

**Trails filters.**
- SAC T1, T2 and T3+: disabled with the placeholder note, because the rows have no `sac_scale` until the run.
- Longest time: works today.
- Public transport or ferry: disabled with the note.
- The cycling tab gains Longest time.

**Peak page.** A peak-facts block (`PeakFacts.jsx`) holds:
- Rank in its range and slope on the gentlest side (both placeholder until the run).
- Lift ticket price and opening hours (stubs).
- Huts on the flanks with beds, season and contact (placeholder until the run).
- A live seven-day summit forecast. `/api/forecast` now accepts an `altitude` parameter, validated, clamped to 0 to 5,000 m, rounded to 50 m and part of the edge cache key.

The range is always a slot.

**Pipeline code (written, not run).**
- `way_tags.py` reads `hiking_technique` and `hiking_exposure` (worst member way, same noise floor as `sac_scale`) and builds `sac_segments`.
- `export_wire.py` puts `sac_scale` on the country rows and `technique`, `exposure` and `sac_segments` on the detail file. It also reads a `transit` column that nothing fills yet.
- `export_cycling.py` derives the route shape (`rt`) from the line.
- `enrich_peaks.py` keeps hut beds, opening hours and contact.
- `export_peaks.py` and `peak_index.py` export `slopeDeg`, `huts[]` and `rangeRank` (ranked within the range across all countries).

**Greenway del Lago di Como.** It was not added by hand. It is not a row in `data/trails/famous_registry.json` or `famous_registry_full.json`; the closest rows are "Lake Como Poetry Way", Galleria del Tremezzo and Sentiero del Viandante. The registry is built from Wikidata, pageviews, OSM fame tags, portals, Waymarked Trails and seeds, so a mapped greenway without those never becomes a row. The trails coverage report then gives it no reason code at all and it shows up in no report. If it were a row, the code would be `way_only_not_derived` (named ways exist, chaining skipped). A greenway tagged `highway=cycleway` or `footway` also falls outside the hiking route ingest.

### Files touched

**Created (app):** src/lib/routeEffort.js, src/browse/RouteFacts.jsx, src/browse/PeakFacts.jsx, src/components/NotYet.jsx (shared), tests/routeEffort.test.mjs.

**Modified (app):**
- Pages: src/browse/TrailPage.jsx, CyclePage.jsx, MountainPage.jsx.
- Shared components: RouteFigures.jsx, AroundHere.jsx, PlaceCard.jsx (one line, draws the badges), PlacesFilterSheet.jsx (the note under a disabled group).
- Explore: DestinationsTab.jsx (facets only).
- Libraries: src/lib/cardFillings.js, trailCards.js, cycleStory.js, weather.js, metForecast.js.
- Edge function: functions/api/forecast.js.
- Shared: src/i18n/{en,nl,de,fr,es,it}.js and src/styles/45-empty-states.css.

**Modified (root):** pipeline/trails/way_tags.py, pipeline/trails/export_wire.py, pipeline/cycling/export_cycling.py, pipeline/mountains/enrich_peaks.py, peak_index.py, export_peaks.py, docs/SCHEMA.md, DESIGN.md, .claude/skills/carta-design/SKILL.md.

**Created (root):** pipeline/field_stubs/report.py (shared), pipeline/field_stubs/t630_routes.py.

**Commits:**
- App: 354a90d (placeholder), df6e4d5, 34aeda6 (average grade fix).
- Root: 7370f0273 (stub register), 9c759d3c8.

### Commands run

`npx eslint <touched files>`, `npm test`, `node --test tests/routeEffort.test.mjs`, `python -m py_compile <touched .py>`, `python pipeline/field_stubs/report.py`. No pipeline step ran.

The new code was checked on real rows:
- **`route_shape()`:** on all listed cycle lines it gives point 11,477, loop 4,915, out-and-back 27, none 41.
- **`range_ranks`:** on the published mountain wire it ranks 245 of 740 full rows.
- **DIN check:** sample trail 10280 (6,935 m, up 1,220, down 55) gives 303 min, the stored value.

### Config and secrets set

None. `/api/forecast` takes the new optional `altitude` query parameter.

### Before/after measurements

| Field | Status | Before | After |
|---|---|---|---|
| SAC on the trail page (17,670 details) | derived from wire | 0% | 19.3% (3,405) |
| SAC on cards, Around strip, filter (17,958 rows) | awaiting run | 0% | 0% |
| Distance, ascent, time badges on cards | shown from wire | 2 of 3 on card | 4 slots, time 100% |
| Walking time at four paces, with breaks | derived from stored DIN time | 0% | 100% |
| Descent | shown | in grid only if present | 98.8% |
| Low and high point | shown | low as an axis label | 98.8% |
| Average grade | derived | 0% | 98.8% |
| Steepest grade | shown | story line only | 98.8% |
| Route shape, trails | shown | 98.8% | 98.8% |
| Surface split | shown | bar, 91.3% | % text, 91.3% |
| Road share | shown | 0% | 98.8% |
| Technique, exposure | awaiting run | 0% | 0% |
| SAC-coloured profile | awaiting run | 0% | 0% |
| Public transport or ferry | stub | 0% | 0% |
| Longest-time filter (trails, cycling) | shown | none | 100% of rows |
| Riding time (3,000 sampled cycle details) | shown | not shown | 100% |
| Cycle descent, low and high, steepest | shown | descent not shown | 99.97% |
| Cycle route shape | awaiting run | loop only, 19.2% of rows | same |
| Peak range (740 full rows) | shown, slot always | 79.2% | 79.2% |
| Peak rank by height and prominence | awaiting run | 0% | 0% |
| Lift, cable car or railway | shown | 43.8% | 43.8% |
| Lift price and hours | stub | 0% | 0% |
| Huts with beds, season, contact | awaiting run | 0% | 0% |
| Slope over 30 degrees | awaiting run | 0% | 0% |
| Summit forecast | live | 0% | 100% at runtime |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Trail 10179 (8 m up, 769 m down over 4.6 km) read "Average climb grade 0.2%" next to "Steepest grade 50%" | The average was climb only, while the steepest grade is measured either way | `averageGradePct` is now (ascent + descent) over length, labelled "Average grade" in all six languages, with a test on this trail (17%); commit 34aeda6 |
| Peak facts not found at 390 px in the first pass | The deep link took longer than the 8 s wait to open on a phone viewport; the facts sit in the "Facts" fold row as on every item page | Rechecked with a longer wait and the row opened: all six slots render |

### What is still open

- **Runs to fill the fields:**
  - `way_tags.py --refresh` then `export_wire.py` (needs the trailslab database), for row `sac_scale`, `technique`, `exposure` and `sac_segments` (T630-a).
  - `export_cycling.py`, for `rt` (T630-b).
  - The `enrich_peaks` context pass then `export_peaks`, for huts, `slopeDeg` and `rangeRank` (T630-c).
- **Stubs:** ferry piers and bus stops for trail transit (`transit_stops.py` has only rail and bus stations), T630-d. Lift prices and hours, T630-e.
- **Pace multipliers:** the choices are the task's own and the owner may tune them (T630-f).
- **Greenway del Lago di Como:** not a registry row, so it has no reason code; whether to seed it is the owner's call (T630-g).
- **Around strip:** the dossier `around` rows carry no `sac_scale`, ascent or riding time, so the strip shows placeholders there; that needs `build_dossier.py` (T630-h).
- **`slopeDeg`:** it is the gentlest-side slope, a proxy, and the page labels it so (T630-i).
- **Wrong values seen, not changed:** trail 10280 has `difficulty: easy` against grade hard and 1,220 m up in 6.9 km. The lift is on 43.8% of full mountain rows and the wire has 740 full rows, not the 48.2% and 948 the audit sample suggested (T630-j).
- **Design:** card cells reading "Not available yet" are long at 390 px. The visual design of every new field belongs to the next design batch (T630-k).

### Rollback procedure

- **App:** `git revert 34aeda6 df6e4d5` on the app batch branch. The placeholder commit 354a90d is shared by T631 and T632, so revert it only together with them.
- **Root:** `git revert 9c759d3c8`; 7370f0273 (the stub register) is shared.

Nothing is one-way. No wire, cache or schema version changed, and all new keys are additive and optional.

---

## T631: climate, lakes and beaches

### Task ID

T631

### Date

2026-10-23

### What changed

**Destination climate.** Under the existing climate strip on the When to go tab there is now a block of five monthly rows: rain days, wind, sunshine hours, water temperature, and temperature at altitude (derived with 6.5 °C per 1,000 m and labelled as derived). Today they all show the placeholder; rain days, wind and the altitude derivation fill after the climate run.

**Lake sheet.** The lake water detail (`WaterSheet.jsx`) adds:
- Bathing zones and beaches around the lake.
- Water sports mapped, wind profile and thermal winds, watersport zones.
- The ferry, with the tag shown today and stop count and line names to come.
- A swim-safety block (`SwimSafety.jsx`) with five slots that never disappear: swimming rule, water depth, currents, swimming ban (from `swim.rule`) and lifeguards. Below them are the hazards on record.

The lake's modelled water temperature is now also shown as twelve numbers marked as an estimate.

**Lake and beach climate.** Both sheets now show the climate of their base town when it is within 30 km, under a line naming the town and the distance and saying the figures are the town's, not measured at the water. Past 30 km they show the placeholder.

**Beach sheet.** A facilities table holds:
- Entry, toilets, showers, food, rentals, pool, kids pool, dogs, natural shade and operator.
- A water-shoes hint, derived from the surface: pebble, shingle, rock and gravel give yes.
- Surface at the water entry.
- Lido entry price, sunbed and umbrella price, and reservation, all stubs. No price logic was touched.
- Walking distance from the ferry pier and from the town (stubs).
- Audience: family, quiet and nature, dog-friendly, luxury.

A missing lifeguard or service is shown as the placeholder, never as "no".

**Wet-rock warning.** On trails graded T2 or harder, or with a gorge highlight, a warning (`RouteRainWarning.jsx`) appears when the MET Norway forecast has at least 1 mm in the next three days. It is a warning, not a field, so with no rain or no forecast it shows nothing.

**Pipeline code (written, not run).**
- `harvest_climate_power.py --daily` and `apply_climate.py`: rain days (`rd`), wind and `elev`, as parallel arrays. The existing `m` tuple is unchanged.
- `enrich_lakes.py` and `export_lakes.py`: bathing zones, beaches within a radius, cached water sports and ferry stops.
- `enrich_beaches.py`: new Overpass clauses for pool and rentals.
- `export_beaches.py`: access model (`fee` and `beach_resort`), dog, shade and operator, from tags the harvest cache already keeps.
- `scripts/sync-data.mjs`: now passes `rd`, `wind` and `elev` through. It compacted `dest.climate` to `{m, best}` and would have dropped them.

### Files touched

**Created (app):** src/browse/SwimSafety.jsx, WaterSheet.jsx, RouteRainWarning.jsx, src/lib/waterFacts.js, tests/waterFacts.test.mjs.

**Modified (app):** src/browse/ClimateStrip.jsx (new export `ClimateExtras`), DestWhen.jsx, LakePage.jsx, BeachPage.jsx, TrailPage.jsx (two lines), src/i18n/*.js (92 `wx.*` keys each), src/styles/45-empty-states.css, scripts/sync-data.mjs.

**Modified (root):** pipeline/harvest_climate_power.py, pipeline/apply_climate.py, pipeline/lakes/enrich_lakes.py, export_lakes.py, pipeline/beaches/enrich_beaches.py, export_beaches.py, docs/SCHEMA.md.

**Created (root):** pipeline/field_stubs/t631_water.py.

**Commits:** app bca6a51; root 460987e78.

### Commands run

eslint on the touched files, `npm test`, `node --test tests/waterFacts.test.mjs` (9 of 9), a NOPUBLIC build, a scratch server-side render of the new blocks with data and with empty rows, `py_compile`, and `field_stubs/report.py`. No pipeline step ran.

### Config and secrets set

None.

### Before/after measurements

| Field | Status | Before | After |
|---|---|---|---|
| Dest air temperature, valley | shown | 100% | 100% |
| Lake and beach climate (base town within 30 km) | derived, labelled | 0% | lakes 81.7% (1,330 of 1,628), beaches 94.0% (2,581 of 2,745) |
| Temperature at altitude | derived, needs `climate.elev` | 0% | 0%; about 15.5% of dests after the run |
| Rain days, wind | awaiting run | 0% | 0% |
| Sunshine hours | stub (NASA POWER has radiation only) | 0% | 0% |
| Lake water temperature (modelled) | shown | 99.8% | 99.8% |
| Beach and dest water temperature | stub | 0% | 0% |
| Lake area | shown | 93.1% | 93.1% |
| Lake max depth | shown | 33.1% | 33.1% |
| Lake bathing class | shown | 55.0% | 55.0% |
| Lake bathing zones, beaches around, ferry stops, sports | awaiting run | 0% | 0% |
| Ferry tag | shown | 6.1% | 6.1% |
| Ferry line names, watersport zones, wind profile, thermal winds | stub | 0% | 0% |
| Lake swim rule (known) | shown | 84.3% | 84.3% |
| Lake swimming-ban slot | derived from `swim.rule` | 0% | 84.3% |
| Lake hazards | shown | 31.8% | 31.8% |
| Lake lifeguards | stub | 0% | 0% |
| Beach surface | shown | 57.5% | 57.5% |
| Water-shoes hint | derived | 0% | 57.2% (1,571) |
| Beach lifeguard | shown | 5.8% | 5.8% |
| Toilets, showers, food (nearby) | shown | 16.1%, 9.3%, 19.6% | same |
| Access model, dogs, shade, operator, pool, kids pool, rentals | awaiting run | 0% | 0% |
| Audience family / quiet and nature | derived from `bestFor` | 0% | 2.4% / 9.1% |
| Audience luxury | stub | 0% | 0% |
| Lido prices, reservation, water-entry surface, walk from pier or town | stub | 0% | 0% |

### What broke and how it was fixed

No issues in the end check. At merge, T632's Practical tab mounted `SwimSafety` in place of its interim swim block (commit 0a959e5, booked to T632).

### What is still open

- **Climate run:** `harvest_climate_power.py --daily`, then `apply_climate.py`, then sync-data, for rain days, wind and elevation; this also unlocks altitude temperatures (T631-a).
- **Beach then lake runs:** first the beach context pass and the beach export (T631-c), then re-enrich lakes and run the lake export (T631-b). The lake export needs the beach export first.
- **Stubs:** the 15 stubs listed in `data/reports/field_stubs.md` (T631-d).
- **Lake beach list:** it uses a circle around the lake centre and only beaches flagged `inland`. Only 10 of 176 Italian beaches carry that flag (T631-e).
- **30 km threshold:** the owner should confirm or change the base-town climate threshold (T631-f).
- **Fact band:** `KeyFacts` still leaves a missing cell out. The new slots sit in the Facts rows and sections, so every field has a slot, but the fact band itself does not. Whether the fact band should keep slots too is the owner's call (T631-g).
- **DetailSkeleton:** it renders `rows.slice(0, 3)` while its comment says at most five. The new blocks went into the existing rows and added no new rows (T631-h).

### Rollback procedure

`git revert bca6a51` (app) and `git revert 460987e78` (root). The T632 merge fix 0a959e5 imports `SwimSafety`, so revert it first. Nothing is one-way.

---

## T632: Practical tab, things to do, offline export

### Task ID

T632

### Date

2026-10-23

### What changed

**Practical tab.** It now has four sections whose slots never disappear (`DestPracticalSlots.jsx`):
- **Transport between towns:** trains, buses and ferries between the towns of the destination (stubs).
- **Parking warning:** the warning with its note, "no restriction found when checked", or the placeholder.
- **Swimming:** the EU bathing-water block, then T631's swim-safety slots (mounted at merge, commit 0a959e5).
- **Local rules:** a stub.

**Transfer mode.** The getting-there line and the Airport key fact no longer print "train" when the data has no transfer mode. The app used `|| 'train'`, and the pipeline never writes `transfer_mode`. They now read "Transfer mode: Not available yet" and keep the minutes. The same fix is in the PDF. `mode.ferry` exists in all six locales.

**Things-to-do tiles.** Each tile and list row now carries four slots instead of the bare type: kind, entry price, visit duration and town. Kind uses the specific type for the 18% non-activity items, otherwise the placeholder until the dossier rebuild carries `kind`.

**GPX.** The overview's "Take {city} with you" section has a one-click GPX button per listed route, capped at 12. It loads the route detail on click and builds the file with the existing `trailGpx` or `cycleGpx`. In the PDF, each route has a clickable line with the address of its route page, where the GPX downloads. Trail and cycle route pages already had GPX.

**No GPX.**
- Cycle family pages are manifests without geometry and link to route pages that have it.
- Trip pages have only straight lines between stops.
- Peaks, lakes and beaches have no route line.

**Pipeline code (written, not run).** `derive_do.py` puts `kind`, `town` (the nearest member town within reach, for example Bellagio and Varenna for Lake Como), and `fee`, `fee_eur` and `duration_min` on each `do` item when the POI row has them. The POI shards carry no fee or duration today, so those are also stubs.

### Files touched

**Created (app):** src/browse/DestPracticalSlots.jsx, DestRouteGpx.jsx, src/lib/doFacts.js, src/lib/routeLinks.js, tests/doFacts.test.mjs, tests/routeLinks.test.mjs.

**Modified (app):** src/browse/DestPractical.jsx, DestOverview.jsx, DestTiles.jsx, GettingThere.jsx, DestinationPage.jsx (the airport key-fact hunk), src/lib/destinationPdf.js, src/i18n/*.js (56 keys each).

**Modified (root):** pipeline/dossier/derive_do.py, docs/SCHEMA.md.

**Created (root):** pipeline/field_stubs/t632_practical.py.

**Commits:** app 65d74cf, 0a959e5 (SwimSafety mounted at merge); root e9a001894.

### Commands run

eslint, `npm test`, the two new test files, `py_compile`, `field_stubs/report.py`, and a check of `town_of` and `facts_of` on synthetic points around Lake Como's members (Bellagio, Varenna, none at 30 km). No pipeline step ran.

### Config and secrets set

None.

### Before/after measurements

| Field (3,868 dossiers; 14,650 `do` items) | Status | Before | After |
|---|---|---|---|
| Trains, buses, ferries between towns | stub | 0% | 0% |
| Parking warning slot | shown | 8.0% (warning) | 33.5% (warning or checked-clear) |
| Parking spots, park and ride | shown | 73.5%, 18.3% | same |
| Swimming on Practical | shown via BathingWater | not on the tab | 23.2% have `water.rating` |
| Swimming bans, local rules | stub | 0% | 0% |
| Thing to do: specific type | shown | 18.0% | 18.0% |
| Thing to do: kind, town | awaiting dossier rebuild | 0% | 0% |
| Thing to do: price, duration | stub | 0% | 0% |
| GPX per listed route on the sheet | derived | 0% | 93.2% of dossiers |
| Route page address per route in the PDF | derived | 0% | every listed route |
| Invented "train" transfer mode | removed | 98 of 98 transfers | 0 |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Two ban rows would have shown on the Practical tab after merge | T632's own ban line and SwimSafety's ban slot both rendered | The ban line now shows only when `water.bans` has rows; otherwise SwimSafety's slot carries it (0a959e5) |

### What is still open

- **Dossier rebuild:** needed to fill `do[].kind` and `do[].town` (T632-a).
- **Stubs:** POI fee and visit duration (T632-b, T632-c); trains, buses and ferries between towns (T632-d); local rules (T632-e); swimming bans (T632-f); the PDF's offline map and emergency contacts, which were noted and not built (T632-g).
- **Trip-page GPX:** a GPX of stops would be possible on trip pages; that is a product call (T632-h).
- **Second transfer fallback:** the same `|| 'train'` fallback lives in `src/planner/TravelLegsSection.jsx:172`, outside this task's files (T632-i).
- **Wrong values seen, not changed:**
  - Lake Como's airport is BGY at 60 min (T632-j). `apply_airport_anchors.py` picks the nearest airport with Ryanair routes by straight line (BGY 50.1 km, MXP 58.1, LIN 61.7). The minutes are a road estimate (x1.3 detour at 65 km/h), not a timetable, and carry no mode.
  - "Car: needed" (T632-k) comes from `car_layer.py:212-213`, where `lake` and `alps` are in `RURAL_STRONG` and ferries are never considered.
  - "Crowds" (T632-l) is a static annual Eurostat tier (`harvest_tourism_density.py`), not linked to the month on screen.
- **PDF addresses:** route addresses in the PDF use the current origin, so a PDF made on a preview deploy prints preview links (T632-m).
- **Leftovers:** `DO_TYPE_KEYS` in destParts.js is now unused by the tiles, and the EU bathing-water block shows on both When to go and Practical (T632-n).

### Rollback procedure

`git revert 0a959e5 65d74cf` (app) and `git revert e9a001894` (root). Nothing is one-way.

---

## Batch-level open item

The visual design of every new field (placeholder length in card cells, the 12-column monthly rows, the facilities table, the pace chips) belongs to the next design batch. Owner: user (T630-l).
