# T640 to T648: Explore data fill, step 2 (set up for the Monday box run)

## Shared header

**Batch.** Step 2 of the Explore detail sheets after T630 to T632. Tasks: T640 (run the steps step 1 wrote, changed to: wire them into the Monday box run), T641 (fill the 27 field stubs from open sources), T642 (fix the wrong values at the source), T647 (the D5 trails lab worker), T648 (coverage report, end check, this report). T643 to T646 are not this batch: the price batch F0 took them while this batch ran. T633 is the Booking scraper's; T634 to T639 were left free for F0.

**What changed in the goal, and why (owner, 2026-10-23 and 24).**
1. The batch started as "run every pipeline step" on the laptop. The laptop ran out of disk twice (Windows pagefile growth and the Docker disk image while trailslab was up), the beach, lake and peak caches had to be restored from the R2 archive, and the owner stopped all laptop runs: "the entire design was to make everything independent from the PC".
2. New goal: make the changes so the weekly Monday run on the Hetzner box (`carta-orchestrator`, CX23) captures every step by itself. Set up, do not run.
3. The trailslab steps cannot run on the box (no Docker, 3.7 GB RAM, 12 GB free disk against a restored lab of tens of GB). The owner's decision D5 (2026-10-22) was a trails lab worker on demand; the owner asked for it to be built in this batch (T647).

**What actually ran.** Only the cycling export (T630-b, on the laptop, before the stop), small sample proofs inside T641 and T642, and the climate daily harvest up to 2,300 of 3,868 points (stopped, its cache is not committed; the box redoes it). Every other number in this report that says "after" is either unchanged from T630 to T632 or a projection computed on samples, and says so.

**Owner decisions taken during the batch.**
- R2 restore instead of an Overpass re-harvest for the beach, lake and peak caches: a re-harvest would rebuild the spine and fail the no-row-loss gate. Owner set the R2 keys.
- Docker allowed on the laptop (later stopped again).
- Disk: Temp cleaned (VS installer cache, 4.6 GB, and 14 bootstrapper copies), npm and pip caches, merged step 1 worktrees, Recycle Bin, one stale Playwright build.
- Heavy runs belong on Hetzner: box for light network harvests, the D5 worker for trailslab.

**Branches.** Root batch branch `p15-explore-data-fill` (from main 0b246d8a0), now at the T647 merge. App batch branch `p15-explore-data-fill` (from master b67eaa4) at eb4dc56. Task branches `p15-t640-root`, `p15-t641-root`, `p15-t642-root`, `p15-t647-root` and `p15-t64{0,1,2}-app`. `p15-t640-root` was pushed to GitHub on 2026-10-23 (before the stop) so the box could fetch it; nothing else was pushed and nothing is merged into main or master.

**Static checks on the merge.** py_compile on every touched .py; `run_pipeline.py --list` and the Monday dry run (`--max-cadence weekly --also <list> --max-hours 16 --dry-run --ship none`); gate.py, publish.py and difficulty_gate.py self-tests; `bash -n` on every touched shell script; `infra/hetzner/cax41/verify.sh` 101 passed, 0 failed, 3 skipped; `cost.py check` 9 of 9; push.py and pack.py dry runs; `node --test` waterFacts and doFacts 14 of 14; T641's and T642's eslint on touched app files clean.

**End check.** See the section "End check (T648)" at the end.

## Coverage after this batch (Task 4)

Before is the T630 to T632 "after". After is today's published wires: only the cycling route shape moved. The column "Monday" says which task of the box run fills the field, so the next task can measure it.

| Category | Field | Before | After (today) | Source | Fills on | Reason if still 0% |
|---|---|---|---|---|---|---|
| Trails | SAC on rows, cards, filter | 0% | 0% | OSM way tags (ODbL) | T647 worker | run needs the worker (owner steps T647-a to d) |
| Trails | Technique, exposure, SAC profile | 0% | 0% | OSM way tags | T647 worker | same |
| Trails | Transit flags (rail, bus, ferry) | 0% | 0% | OSM transit stops | T647 worker | same; new kinds ferry and bus_stop in transit_stops.py |
| Trails | Difficulty consistent with grade | 31.3% of rows | same | rule `export_wire.wire_difficulty` | T647 worker | the shipped wire predates the T286 rule; 12,101 rows change on export |
| Trails | Gorge flag | 6.9% (`f.hl`) | 6.9% | existing wire | none needed | not a stub: 1,224 trails carry it |
| Cycle | Route shape `rt` | loops only, 19.2% | **99.8% (16,932 of 16,973)** | OSM via trailslab | done (T640) | |
| Peaks | Rank, slope, huts | 0% | 0% | OSM, Copernicus DEM | peak_context | awaiting Monday run |
| Peaks | Lift hours | 0% | 0% | OSM `opening_hours` | peak_context | sample: 0 of 27 AT lift peaks tagged; low yield expected |
| Peaks | Lift price | 0% | 0% | none open | stub | no open price feed; `lift.fare` record kept for F9 |
| Lakes | Ferry lines, sport zones, wind profile | 0% | 0% | OSM, NASA POWER | lake_detail | awaiting run; Lake Como sample: 4 ferry lines, sailing, kitesurfing and rowing zones, wind 1.6 to 1.9 m/s |
| Lakes | Lifeguards, swim ban | 0% | 0% | OSM `lifeguard`, `swimming=no` | lake_detail | awaiting run; none mapped on Lake Como |
| Lakes | Beaches around (outline rule) | 0% | 0% | OSM outline + beach wire | lake_detail | awaiting run; Maggiore 4 in the sample, Como 0 (no lake-shore beaches in the inventory) |
| Lakes | Thermal winds, currents | 0% | 0% | none open | stub | no open source names Ora or Breva; currents code has no description |
| Beaches | Access model, dogs, shade, operator, pool, rentals | 0% | 0% | OSM tags | beach_context | awaiting run |
| Beaches | Sea temperature `sst` | 0% | 0% | NASA JPL MUR SST via NOAA ERDDAP (public domain) | sea_temp | awaiting run; 60 of 60 IT sample beaches got a value |
| Beaches | Walk from centre, from pier | 0% | 0% | OSM geometry, modelled | beach_context | awaiting run; straight line x 1.3 at 4.5 km/h, labelled modelled |
| Beaches | Lido prices, entry surface, luxury | 0% | 0% | none open | stub | no open source |
| Destinations | Rain days, wind, elevation | 0% | 0% | NASA POWER daily | climate_daily | awaiting run (laptop harvest stopped at 2,300 of 3,868) |
| Destinations | Sunshine hours `sun_h` | 0% | 0% | NASA POWER radiation, Angstrom-Prescott, modelled | climate_daily | awaiting run; computes for all 3,868 from the cache |
| Destinations | Water temperature `water_c` | 0% | 0% | MUR SST within 20 km | sea_temp then climate_daily | awaiting run |
| Destinations | Crowds by month | 0% | 0% | Eurostat `tour_occ_nin2m` | crowding | awaiting run; 3,289 get a series, 77% vary by month |
| Destinations | Several airports, mode per transfer | 1 airport, no mode | same | airport tiers + Trenord GTFS (CC BY 4.0) | airports | awaiting run; 3,604 get `airports[]`, 83 a public transport time |
| Destinations | Car value with transit lines | category only | same | GTFS + OSM ferries | transit_lines | awaiting run |
| Destinations | Train, ferry lines between towns | 0% | 0% | Trenord GTFS, OSM `route=ferry` | transit_lines | awaiting run; Lombardy only for train |
| Destinations | Bus lines | 0% | 0% | none verified | stub | no bus feed with a verified commercial licence |
| Destinations | Emergency numbers, hospital | 0% | 0% | Wikidata P2852 (CC0), OSM hospitals | dest_overlays | awaiting run; CH sample 53 of 53 |
| Destinations | Swim bans | 0% | 0% | OSM `swimming=no` | dest_overlays | awaiting run; EEA has no prohibition field |
| Destinations | Local rules | 0% | 0% | none structured | stub | no structured open source |
| Things to do | Kind, town | 0% | 0% | derive_do.py | dossier | awaiting the dossier rebuild |
| Things to do | Entry fee flag | 0% | 0% | OSM `fee`/`charge` | poi_fees then dossier | awaiting run; sample 27 of 84 |
| Things to do | Visit duration | 0% | 0% | none open | stub | no open source |
| Around strip | Ascent, riding time | 0% | 0% | dossier around rows (T640) | dossier | awaiting rebuild; Lake Como sample 8 of 8 and 2 of 2 |

**Stubs: 27 before, 10 after.** Remaining, each with its reason: beach luxury audience, lido prices, beach entry surface (no open source); bus services (no verified feed); local rules (no structured source); visit duration (no source); offline PDF map (not a data source, out of claim); lake currents, thermal winds (no source); lift price (no open price feed). The list is `data/reports/field_stubs.md`.

---

## T640: the Monday box run (was: run the steps)

### Task ID

T640

### Date

2026-10-23 to 2026-10-24

### What changed

- **Phase A (laptop, before the stop).** Dossier `around` rows carry `ascent_m`, `descent_m`, `sac_scale` (trails) and `duration_min` (cycling), the keys AroundHere already reads (T630-h code). New publish gate `pipeline/field_stubs/gate.py` (coverage may not fall per key, plausible ranges, LFS-aware baseline).
- **Cycling export.** `export_cycling.py` ran once: `rt` on 16,932 of 16,973 rows. Committed with a documented gate waiver (see What broke).
- **The Monday run.**
  - `run_pipeline.py` gains tasks transit_lines, airports, sea_temp, climate_daily, beach_context, peak_context, lake_detail, dest_overlays, poi_fees, trails_fields, field_stubs_report. crowding and dossier are extended: gated, soft, rev-stamped. A task whose rev changed counts as due.
  - New flags `--also` (named tasks join the plan when due, past the cadence ceiling) and `--max-hours` (defer the rest to the next run).
  - `pipeline/field_stubs/publish.py`: snapshot the layer, export, gate, restore the snapshot on failure (the box never commits and the master is gitignored, so `git checkout` is not a restore there).
  - `run_pipeline.sh` passes `CARTA_EXTRA_TASKS` as `--also` and `CARTA_MAX_HOURS` (default 16), and pulls and pushes the cache classes those tasks need.
  - Archive classes: `lakes-json` (pull only, streams just the lake JSON out of the 4.7 GB tarball and marks the copy partial so it can never be packed or pushed back), `explore-overlays` (the batch's overlay caches).
  - Fixes so the run can work: beaches context version so only pre-T631 contexts are asked again (no re-photographing); peaks `--context-only` re-asks pre-huts contexts; lakes keep their climate when CHELSA is absent; `apply_airport_anchors.py --airports-only`.
- **Mirror.** Root `continent-app/` mirrors app branch eb4dc56 (T641 and T642 app commits), so the box's ship builds the new UI.
- **Procedure.** `Execution/P15/_OPEN-explore-data-runs.md` is the record of what Monday does and the owner steps before it.

### Files touched

Root: run_pipeline.py; infra/hetzner/cax11/run_pipeline.sh, env.example; pipeline/archive/manifest.yml, push.py, pack.py; pipeline/field_stubs/gate.py (created), publish.py (created); pipeline/dossier/build_dossier.py; pipeline/beaches/enrich_beaches.py; pipeline/mountains/enrich_peaks.py; pipeline/lakes/enrich_lakes.py; pipeline/apply_airport_anchors.py; pipeline/transit/merge_lines.py (created); docs/SCHEMA.md; continent-app/public/cycling/** (17,033 wire files); continent-app/ mirror (18 files); Execution/P15/_OPEN-explore-data-runs.md (created).

Commits (root): 24baa7fc2, 090b6bd61, aa95f0df3, 309701e51, f93e4e197, d03f4ab23, 8134c75b7, 7d683279c (mirror), c282a4fed; merges cd97aa051, 19501f3dc.

### Commands run

`export_cycling.py` and `gate.py --layer cycling` (laptop, 2026-10-23); `harvest_climate_power.py --daily` (stopped at 2,300 of 3,868, not committed); the runner A and C harvests (stopped, nothing committed); after the stop only `--list`, `--dry-run`, py_compile, self-tests, `bash -n`, archive dry runs, `node --test`.

### Config and secrets set

Owner set `RCLONE_CONFIG_R2_*` as Windows user variables on the laptop (used for the cache restore). No box config changed: the box steps are owner steps.

### Before/after measurements

| Measure | Before | After |
|---|---|---|
| Cycling rows with `rt` | loops only, 19.2% of rows | 16,932 of 16,973 (point 11,894, loop 5,010, out and back 28, none 41) |
| Lake Como Around trail ascent (sample) | 0 of 8 | 8 of 8 after the dossier rebuild |
| Lake Como Around riding time (sample) | 0 of 2 | 2 of 2 after the dossier rebuild |
| Tasks the Monday run executes for this batch | 0 | 12 (11 on the box, 1 through the T647 worker) |
| Monday run time, estimated | | about 25 h of work on the box; with the 16 h budget: Monday 1 through lake_detail (20 to 22 h), Monday 2 the overlays, fees and dossier (6 to 8 h). Not measured |
| Box disk for the new classes | | about 2.5 GB of 12 GB free |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Laptop C: fell to 143 MB, then 0.2 GB twice | Temp junk, then Docker Desktop's disk image and the Windows pagefile (35.7 GB) under load | Owner-approved cleanup; heavy runs moved off the laptop |
| Two climate harvests wrote one cache | The first harvest survived a DNS outage; the orchestrator started a duplicate | Duplicate stopped; cache checked intact (1,207 records) |
| Cycling gate failed on HR rows 4114 and 4116 | `sec` was a sticky mark from the T455 repair that a fresh export cannot reproduce; both are loops sharing a town name, not stretches | Waived with the reason in commit 090b6bd61; register row T640-h |
| Beach pass ran without the regions spine | `cache/regions/regions.gpkg` missing | Restored from R2 (regions-cache); AD and AL need a refresh, which the Monday beach_context does |
| `apply_airport_anchors.py` would crash on the box | `min(served)` on an empty list: no destination has `routes` since T511; step 1 had already cleared 18 estimated anchors | `--airports-only` path; full script left for T640-d |
| Beaches, peaks: new clauses never reached existing rows | context fetched only where None | context version and re-ask (f93e4e197) |
| Lakes gate would always fail on the box | climate dropped without CHELSA | keep previous climate |
| crowding could stop the run before the ship | task not soft | made soft |

### What is still open

- Owner steps before Monday 09:00 (T640-a, order 1).
- Measure Monday 1 and 2, close the run rows, replace estimated hours (T640-b).
- Results reach production through the box ship; confirm `VITE_DATA_BASE` on the box and copy the wires back into git (T640-c).
- `apply_airport_anchors.py` steps 1 to 4 (T640-d).
- beaches-cache and mountains-cache are pushed from the box from now on (T640-f).
- No `nb` neighbours on five wires (T640-g).
- Sticky `sec` mark (T640-h).
- Stagger the quarterly tasks across the quarter so no Monday is heavy (T640-i).

### Rollback procedure

`git revert` the T640 commits; on the box, blank `CARTA_EXTRA_TASKS` and the run is exactly the weekly run again. A published layer: `git checkout HEAD -- continent-app/public/<layer>`; the master has its pre-write backups and the master-snapshots class. lakes-cache in R2 is never written by the box.

---

## T641: field stubs from open sources

### Task ID

T641

### Date

2026-10-23

### What changed

17 of 27 stubs wired. Every new value goes through a keyed overlay `cache/<name>.json` `{_meta, rows}`, merged by the exports and the dossier only where a row exists, with source, date and method (measured, derived, modelled).
- Destinations: `climate.sun_h` (modelled), `climate.water_c` (measured, open water within 20 km), `practical.transit.train|bus|ferry` (`{name, from, to, minutes?, operator?, freq_per_day?, source, date, method}`, a mode with no line is omitted), `practical.emergency` (numbers, 112, nearest hospital), `water.bans`, `do[].fee` and `do[].price` (a price record, never shown).
- Lakes: `ferry.lines`, `sportZones`, `lifeguards`, `swim.ban`, `wind.profile` (modelled).
- Beaches: `sst`, `walkFrom {centre, pier}` (modelled).
- Mountains: `lift.hours`, `lift.fare` (price record, not shown).
- Trails: `transit {rail, bus, ferry}` from stops within 500 m of the start; `transit_stops.py` gains `ferry` and `bus_stop`; `attach.py` keeps its car-free logic.
- App: sheet rows read the new keys (ClimateStrip, WaterSheet, SwimSafety, DestPracticalSlots), 3 i18n keys in all six languages.

Sources, all accessed 2026-10-23, all allow commercial use: NASA POWER (US government open data); NASA JPL MUR SST v4.1 via NOAA CoastWatch ERDDAP (public domain, credit requested); Wikidata P2852 (CC0); OpenStreetMap via Overpass (ODbL 1.0, credit); Trenord GTFS, Regione Lombardia (CC BY 4.0, verified from the dataset metadata). Not usable yet: Swiss national timetable (terms not machine readable, registered `commercial_ok: false`), Delcomar ferries (CC BY per catalogue, unverified), EEA bathing water (no prohibition field).

### Files touched

Created: pipeline/explore_overlay.py, derive_sunshine.py, harvest_sea_temp.py, harvest_emergency.py, harvest_swim_bans.py, harvest_poi_fees.py, beaches/harvest_beach_walks.py, lakes/harvest_water_detail.py, mountains/harvest_lift_hours.py, transit/gtfs_lines.py, transit/osm_ferry_legs.py, transit/feeds.json, dossier/derive_practical.py. Modified: apply_climate.py, beaches/export_beaches.py, lakes/export_lakes.py, mountains/export_peaks.py, trails/transit_stops.py, trails/export_wire.py, trails/attach.py, dossier/build_dossier.py, dossier/derive_do.py, field_stubs/t630_routes.py, t631_water.py, t632_practical.py, data/reports/field_stubs.md and .json, docs/SCHEMA.md. App: scripts/sync-data.mjs, src/lib/waterFacts.js, src/browse/ClimateStrip.jsx, WaterSheet.jsx, SwimSafety.jsx, DestPracticalSlots.jsx, src/i18n/*.js, tests/waterFacts.test.mjs.

Commits: root 1ad7c5792, dbf0655cc, a93b101d9, d7e42426d, 3ecfb9ed6, 9b3e3717a, merge f7b585917; app e08a4e5, merge eb4dc56.

### Commands run

py_compile, eslint, `node --test tests/waterFacts.test.mjs` (10 of 10), `field_stubs/report.py`, sample harvests written to scratch (no tracked file).

### Config and secrets set

None. `pipeline/transit/feeds.json` registers feeds with `licence_verified`.

### Before/after measurements

| Measure | Before | After |
|---|---|---|
| Stubs | 27 | 10 |
| Sunshine, annual hours (model vs station) | none | Valencia 2,926 (about 2,700), Lisbon 3,012 (about 2,800), Brussels 1,687 (about 1,550 to 1,600), Heathrow 1,635 (about 1,500 to 1,600), Oslo 1,790 (about 1,700 to 1,800); about 5% high in the south |
| Sea temperature, IT sample | 0 of 60 | 60 of 60; Guvano 14.2 C (Jan) to 26.4 C (Aug) |
| Trenord lines | 0 | 23 destinations, 93 legs; Lake Como: Varenna to Lierna 5 min, 28 trips a day |
| OSM ferry legs, Lake Como | 0 | Bellagio to Lecco 68 min, Como to Varenna |
| Hospitals, CH sample | 0 | 53 of 53 within 60 km |
| Fee tags, sample of 84 POIs | 0 | 27 |
| Lift hours, AT sample | 0 | 0 of 27 |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Overpass `area` queries timed out (CH hospitals) | country-wide area query | union `around` batches of 12 to 25 points |
| MUR point series 36 s a point | point API | 1 degree tiles at 0.03 degree stride |
| No Lake Como hub in GTFS | lake-centre destination 20 km from stations | member towns are nodes |
| "3-5 EUR" parsed as 5 | range parsing | ranges refused |
| DNS outage mid-run | network | samples rerun; Maggiore not rerun |

### What is still open

Swiss and Delcomar licences (T641-a); more verified feeds (T641-b); routed walks (T641-c); Lake Como CHELSA water 0 C in Jan and Feb (T641-d); mountain rescue numbers (T641-e); the five beach and lake stubs without a source (T641-f to T641-j); price records ready for F9 (T641-k).

### Rollback procedure

`git revert` the root and app commits; deleting an overlay cache makes every export and the dossier behave exactly as before (every hook is guarded).

---

## T642: wrong values fixed at the source

### Task ID

T642

### Date

2026-10-23

### What changed

- Airports (T632-j): `dest.airports[]`, up to 4 airport-tier rows within 110 km, each with options `{mode, minutes, source}`: road estimate (haversine x 1.3 at 65 km/h, labelled) and public transport from a connection scan over GTFS (median over a Wednesday, 07:00 to 21:00). `transfer_mode` always written. App: Getting there lists each airport's options; the Airport key fact shows every airport.
- Planner (T632-i): the `|| 'train'` fallback removed in TravelLegsSection.jsx and in GuidedTripWizard.jsx:611 (outside the named files, but it was the source of the invented train).
- Car (T632-k): rural categories become car-optional when transit lines show rail or ferry plus a second mode; remote categories and islands stay car-needed; new `car_basis`, `car_useful_for`, `parking_hard`.
- Crowds (T632-l): `crowding.monthly {share[12], tier[12], geo, years, source}` from Eurostat `tour_occ_nin2m`; the key fact uses the trip month when dates are set.
- Trail difficulty (T630-j): the shipped wire predates the T286 `difficulty = grade` rule; `wire_difficulty` now also floors ungraded rows by the distance and ascent ladder and the SAC grade.
- Lake beaches (T631-e): beaches within 400 m of the OSM lake outline (`lake_outlines.py`), no `inland` flag.
- Greenway del Lago di Como (analysis, T630-g stays the owner's): it exists as OSM relation 5205171 (`route=hiking`). Seed rule: OSM relations with `route` hiking, foot or bicycle, name matching greenway, via verde, voie verte or ciclovia, at least 5 km, not already published. The Europe-wide count timed out on Overpass twice and was not measured; on the local wires 10 published trails already match the narrow names, 94 the wider pattern.

Sources: Trenord GTFS (CC BY 4.0, IODL 2.0 per the portal), Eurostat (reuse policy, commercial use with attribution), OSM outlines (ODbL).

### Files touched

Root: pipeline/airport_access.py (created), lakes/lake_outlines.py (created), apply_airport_anchors.py, car_layer.py, apply_car_layer.py, harvest_tourism_density.py, trails/export_wire.py, lakes/export_lakes.py, dossier/build_dossier.py, docs/SCHEMA.md. App: src/browse/GettingThere.jsx, DestinationPage.jsx, src/planner/TravelLegsSection.jsx, GuidedTripWizard.jsx, src/i18n/en.js, src/styles/25-feature-pages.css.

Commits: root 9c3667587; app f3edbee.

### Commands run

py_compile, eslint, whole-catalogue computations in scratch, Eurostat and Overpass sample pulls.

### Config and secrets set

None.

### Before/after measurements

| Measure | Before | After (computed in scratch, published by the Monday run) |
|---|---|---|
| Lake Como airports | BGY 60 min, no mode | BGY car 60 / train 146, MXP car 70 / train 206, LIN car 74 / train 161 (train times are upper bounds: no Milan metro footpaths) |
| Destinations with `airports[]` | 0 | 3,604 (1,418 one, 1,095 two, 628 three, 463 four); 83 with a public transport option |
| Car needed, true / false | 2,137 / 1,731 | same until the transit lines run; upper bound 1,000 / 2,868 |
| Lake Como car | needed | needed, with `car_useful_for`; may change with the Monday transit lines |
| `parking_hard` | none | 281 true, 2,757 false, 830 unknown |
| Crowds by month | annual tier only | 3,289 destinations, 2,535 vary; Lake Como share 0.054 (Jan) to 0.128 (Jul), tier 3 every month |
| Trails whose difficulty changes on export | | 12,101 of 17,619 (easy to moderate 4,599, easy to hard 2,504, easy to very hard 1,374, moderate to hard 983, hard to very hard 825); trail 10280 easy to hard |
| Lakes with beaches around | 0 of 1,628 | Maggiore 4 in the sample; Como 0 |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| TravelLegsSection.jsx diff was the whole file | CRLF file | rewritten with CRLF, committed with core.autocrlf=false (+7/-3) |
| Overpass 502/504 and a DNS outage | network | greenway count left unmeasured |

### What is still open

Lake-shore beach harvest (T642-a); more GTFS feeds and Milan footpaths (T642-b); `transfer_mode` "car" versus "bus/shuttle" copy (T642-c); i18n keys in en.js only (T642-d); the Greenway seed rule (T642-e).

### Rollback procedure

`git revert 9c3667587` (root) and `f3edbee` (app). All data keys are additive; deleting cache/gtfs/trenord, cache/eurostat_nights_nuts2_monthly.json and cache/lake_outlines.json undoes the inputs.

---

## T647: the D5 trails lab worker

### Task ID

T647

### Date

2026-10-24

### What changed

- A worker job `trailslab` (infra/hetzner/jobs/trailslab.sh, jobs.tsv row) on a CPX42 (x86, 8 vCPU, 16 GB, 320 GB): import keys, start the lab image `pgrouting/pgrouting:17-3.5-3.7` on 127.0.0.1:5433, pick the newest readable dump in `archive/db/`, decrypt, `pg_restore -j`, then per country with hikes: extract (R2 if 35 days old or less, else download.geofabrik.de with md5), `way_tags.py --refresh`, `transit_stops.py`, delete; then `export_wire.py --no-promote`, `gate.py --layer trails`, `difficulty_gate.py`, `export_cycling.py`, `gate.py --layer cycling`; only passing layers are packed; dump back, verified by a decrypt and sha256 round trip. Exit 0 whenever the dump was made.
- `spawn.sh` per-job server type (`server_type` column, `CARTA_WORKER_TYPE_<JOB>` override), gpg key hand-over, planned cost line; `cost.py` rates per type; `worker.sh` `pgclient` need (PGDG client 18).
- Orchestrator: `run_pipeline.py` task `trailslab_worker` (weekly entry, spawns every 28 days so the 30-day dump expiry never lapses; in between it refreshes an old dump key server side), `infra/hetzner/cax41/trailslab_worker.py` (uploads the support files, spawns, re-gates against the box tree, installs the wires with a tarred rollback copy, moves the dump to `archive/db/trailslab/`). Skips with a logged reason when the switch, token, R2, key or gpg is missing.
- Dump keys: default `worker-key` (a dedicated keypair; dumps encrypted to the owner key and the worker key); `CARTA_TRAILSLAB_DUMP_CRYPT=plain` is the alternative. The Supabase dump path is untouched.

### Files touched

infra/hetzner/jobs/jobs.tsv, jobs_lib.sh, worker.sh, trailslab.sh (created); infra/hetzner/cax41/spawn.sh, cloud-init.yaml, cost.py, verify.sh, trailslab_worker.py (created); infra/hetzner/cax11/env.example; infra/hetzner/README.md; pipeline/trails/difficulty_gate.py (created); pipeline/archive/manifest.yml; run_pipeline.py (one TASKS entry and two helpers); Execution/P15/_OPEN-explore-data-runs.md (appended section).

Commits: 9f7d5ad42, 5d7f8b099, 3f47f457e; merge 1ec0035b2.

### Commands run

`bash -n`, py_compile, `cost.py check` (9 of 9), `difficulty_gate.py --self-test`, `verify.sh` (101 passed, 0 failed, 3 skipped), `trailslab.sh`, `spawn.sh` and `trailslab_worker.py` dry runs, `run_pipeline.py --list` and `--dry-run --only trailslab_worker`. No server, SSH, R2 write or Docker.

### Config and secrets set

None. New settings in env.example: `CARTA_TRAILSLAB_WORKER`, `CARTA_TRAILSLAB_DUMP_CRYPT`, worker key path, worker R2 token lines.

### Before/after measurements

| Measure | Before | After |
|---|---|---|
| Trails lab runs without the laptop | no | set up, not yet run |
| Planned run time | | about 4.2 h (restore 1 h is the least certain); expected 5 h, ceiling 10 h |
| Planned cost per run | | about EUR 0.65, EUR 1.30 at the ceiling (CPX42 rate scaled from CPX22, unverified) |
| Difficulty gate on today's wire | | fails with 12,160 mismatches, as it should until the export |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| verify.sh section 6 fails with a Windows TMPDIR | the colon in `C:/` splits PATH (pre-existing) | run with TMPDIR=/tmp; noted |
| `trailslab_worker.py run --dry-run` on Windows | `bash` resolves to WSL | `CARTA_BASH` pointed at Git Bash |

### What is still open

D6 x86 and the CPX42 price (T647-a); dump keys and a dual-key dump in R2 before 2026-11-01 (T647-b); D7 worker R2 token (T647-c); selftest, the LI test run and the switch (T647-d); attributes, rate and attach steps (T647-e); promotion of approved trips (T647-f); difficulty gate override (T647-g); fresh Geofabrik extracts in R2 and the cost.py label (T647-h).

### Rollback procedure

`git revert 3f47f457e 5d7f8b099 9f7d5ad42`. On the box, blank `CARTA_TRAILSLAB_WORKER`. A wrongly shipped wire: untar `logs/trailslab_worker/<run>/prev-<layer>.tar.gz` and ship again.

---

## T648: coverage report, end check, report

### Task ID

T648

### Date

2026-10-24

### What changed

The coverage table above, this report, the register rows, and the end check below. `field_stubs/report.py` was rerun by T641 (10 stubs); no other run.

### Files touched

Execution/P15/T640-T648-explore-data-fill.md (created), Execution/_OPEN.md.

### Commands run

The browser end check (below).

### Config and secrets set

None.

### Before/after measurements

See "Coverage after this batch".

### What broke and how it was fixed

See "End check (T648)".

### What is still open

The Around strip slots were not found on Lake Como (T648-a); verify_booked_route.mjs is stale (T648-b).

### Rollback procedure

Revert the report commit.

---

## End check (T648)

**How it ran.** One round on the merged batch code, the root mirror `wt/t640-root/continent-app` at c282a4fed, with today's wires (nothing new except cycling `rt`). Vite dev server on 5252 with a temporary node_modules junction (removed afterwards); a static server on 5251 as `VITE_DATA_BASE`, serving the worktree's `public/` and the main checkout's generated wires it lacks. Playwright, each screen at 390 x 844 and 1280 x 800. Harness files and screenshots are in the session scratchpad, not committed.

**Result.** No page error, no crash, no horizontal overflow on any screen at either width. No raw i18n key, no en or em dash in page text, no price shown (lift price, lido prices and the entry fee are placeholders; the euro figures on screen are trip costs from Explore). Console noise only from the data host and local 404s for `/flights/*` and `/status.json`.

| Screen | Result | Notes |
|---|---|---|
| Lake Como, Overview | pass | Airport key fact "BGY, 60 min. Mode: Not available yet", no "train"; Crowds "Crowded" (annual tier until the monthly series runs) |
| Lake Como, Nearby | pass | Around strip slots not found (T648-a) |
| Lake Como, When | pass | clm-sun, clm-water placeholders; 5 not-yet |
| Lake Como, Practical | pass | Getting there "Transfer mode: Not available yet"; pr-transit-train, -bus, -ferry and the five swim-safety slots present as placeholders; 9 not-yet. `pr-swim-bans` renders only when bans exist, by design since 0a959e5, so ss-ban carries the slot |
| Trail AT 10175 (T1) | pass | SAC T1 from the tag; rf-transit, technique, exposure placeholders; SAC filter chips disabled with the note |
| Trail AT 10179 (T3+) | pass | SAC T4; same placeholders |
| Cycle IT 58329 | pass | Route shape "Loop" from `rt`, riding time 20 min |
| Peak Grignone | pass | about 15 s to open on the phone; lift hours and price, rank, slope, huts placeholders; summit forecast seven days at 2,410 m |
| Lake Como lake page | pass | wind profile, thermal, sport zones, ferry lines, lifeguards placeholders; ss-ban shows "No ban on record" from the wire |
| Beach Guvano | pass | walks, entry surface, lido and audience rows placeholders |
| Beach Monticolo | pass | same |
| Planner legs | pass | `.tleg-airports` "Fly into CUF 39 km away, TRN 60 km away, GOA 73 km away", no "train"; the minutes-plus-placeholder branch was not reachable because no wire row has a transfer time yet |

**Findings.**
- The Around strip slots (AroundHere `rowMeta`, SAC, length, climb and time) were not in the DOM for Lake Como; its Overview teaser shows kind, bearing, distance, length and score, and the Nearby tab's `RoutesFromHere` (src/browse/RoutesFromHere.jsx:62-63) shows km, ascent and grade, and omits absent figures instead of a placeholder. Not confirmed as a bug (T648-a).
- `continent-app/scripts/verify_booked_route.mjs` expects six wizard steps and the wizard has five; stale, not caused by this batch (T648-b).
- The brief named `destp-getting`, `destp-get-airports` and `destp-get-airport` as testids; they are CSS classes (GettingThere.jsx:44, 81 to 83). No change needed.

**What must be looked at after the Monday run.** The same screens with the new wires: the `.destp-get-airports` list with three airports on Lake Como, crowds following the trip month, clm-sun and clm-water values, transit lines on Practical, lake ferry lines and sport zones, beach walks and `sst`, then (after the T647 worker) SAC badges and the enabled SAC filter. That round belongs to T640-b.

---

## Register rows closed by this batch

- T630-b closed by T640 (cycling `rt` published on the branch).
- T632-i closed by T642 (no invented transfer mode in the planner).

Every other claimed row stays `open`: its code is in, but its value only reaches the wire on the Monday box run or the T647 worker. T640-b is the task that measures and closes them.
