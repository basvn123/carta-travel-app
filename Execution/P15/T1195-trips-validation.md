# T1195: Trips validation, every leg against official timetables (ROADMAP D23, Trips row)

## Date

2026-11-07

## What changed

The trips library now has a validation layer on the D23 runner. Every leg Carta shows is listed: each hop between two stops and each way out to a day trip, 1,806 unique legs (700 train, 85 bus, 1,021 car) in `data/reports/validation/trips/legs.csv`. Each leg is checked against the fastest scheduled journey on a weekday, leaving 06:00 to 20:00, direct or with one change. Those times come from open GTFS feeds whose terms allow it, through a new offline builder. Car legs are checked against a self-hosted OSRM. The container cannot reach any timetable host, so the first run uses a hand seed of 81 of the most used train legs, read from the operators' published timetables:
- **Within tolerance:** 50.9% of the 57 legs with a time are within max(20 min, 20%).
- **Mode runs:** 70.4% of the 81 have a train at both ends. The other 24 are shown as train legs where one end has no railway station, used 246 times across the library.
- **Error:** median absolute error 25.7%. Kendall tau-b is 0.557.
- **Coverage:** 4.5%.

The 30 largest gaps, plus the 7 other legs outside the warn band, were reviewed. All are Carta faults with three causes, all in `leg()`:
- the train is offered with no station check (24 legs);
- one rail speed per country cannot see high-speed lines (Paris to Lille: 140 against 62 min);
- the straight-line detour cannot see water, mountains or changes (Copenhagen to Luebeck: 173 against 285 min).

The corrections are register rows. The GTFS and OSRM runs are owner steps.

## Research

A research subagent compared the sources, routing and method (sources it could not open are marked "unconfirmed").

| Option | Terms / fit | Verdict |
|---|---|---|
| gtfs.de long-distance feed `fv_free` (DE) | CC BY 4.0 per the Transitland atlas (unconfirmed on gtfs.de), no sign-up, ICE/IC | use |
| opentransportdata.swiss GTFS (CH) | "open use, source must be provided" | use |
| Austria GTFS / OeBB Kursbuch (data.oebb.at) | registration; licence close to CC BY 4.0; Kursbuch CC BY 4.0 | use |
| transport.data.gouv.fr SNCF and FlixBus Europe GTFS | ODbL or attribution licence per dataset | use |
| Renfe GTFS (datos.gob.es) | licence unconfirmed, may lag | use after a licence check |
| Entur (NO, NLOD), Trafiklab GTFS Sverige 2 (CC0, free key), NTA Ireland (CC BY 4.0, key) | open | use |
| SNCB (BE) | free, but a licence contract by email | owner decision |
| Italy (Trenitalia, Italo), Czechia (CIS JR), Poland (PKP IC), NL (ovapi), DK (Rejseplanen) | no open national feed found, or licence unclear | report "no open reference", never guess |
| Mobility Database | free, commercial use allowed, each feed keeps its licence | discovery only |
| Transitland API | paid; commercial use of its datasets needs permission | no |
| Transitous public MOTIS API | "not intended for commercial purposes" | no |
| DB HAFAS / vendo, OeBB Scotty | unofficial, permission needed | no |
| DB Timetables API | station boards only, an hour at a time | spot checks at most |
| Trainline, Omio, Rome2Rio, SNCF Connect, DB Navigator | Trainline forbids automated access; treat all as forbidden | never scrape |
| OSRM demo server | usage policy forbids heavy use | no; self-host OSRM (BSD-2), GraphHopper, or `tools/brouter` |
| Self-hosted MOTIS 2 (MIT) or OpenTripPlanner (LGPL) | the clean multi-feed router | the upgrade path |

Choice: the session's own GTFS scanner, `trips_timetables.py gtfs`. It needs no server and runs offline once the zips are on disk, and it is tested on a fixture. A self-hosted MOTIS stays the upgrade if journeys with two changes matter. Car legs are routed on a self-hosted OSRM.

Method (subagent): the shortest station-to-station time with at most one change, on a mid-season Tuesday or Wednesday, departures 06:00 to 20:00.

Tolerance: no standard band was found in the literature (closest: Wessel and Farber, JTLU 2019). The bands are pass max(20 min, 20%) and warn max(45 min, 35%), to be tuned after the first GTFS run.

Links:
- https://gtfs.de/en/
- https://opendata.swiss/en/dataset/fahrplan-2026-gtfs2020
- https://data.oebb.at
- https://transport.data.gouv.fr/resources/11681
- https://developer.entur.org/stops-and-timetable-data
- https://trafiklab.se/api/gtfs-datasets/gtfs-sverige-2/
- https://developer.nationaltransport.ie/
- https://www.belgiantrain.be/en/3rd-party-services/mobility-service-providers/public-data
- https://mobilitydatabase.org/terms-and-conditions
- https://www.transit.land/terms
- https://www.thetrainline.com/business/terms
- https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy

## Files touched

- Created:
  - `scripts/validation/layer_trips.py`
  - `scripts/validation/trips_timetables.py`
  - `tests/test_validation_trips.py`
  - in `data/reports/validation/trips/`: `legs.csv`, `timetable_reference.csv` (the seed), `2026-11-07.json`, `baseline.json`, `gap_reviews.json`
- Modified:
  - `scripts/validation/runner.py`: one line in `LAYERS`.
  - `data/reports/validation/scorecard.json` and `continent-app/src/components/admin/validationScorecard.json`: regenerated by the runner. The runner test pins the two as equal.
  - `docs/HANDBOOK.md`: D23 section, item 10, Trips.
  - `ROADMAP.md`: D23 status.
  - `Execution/_OPEN.md`: T1195-a to T1195-e.

## Commands run

```
python -I scripts/validation/trips_timetables.py legs
python -I <scratchpad>/seed.py        # writes the 81 seed rows into timetable_reference.csv
python -I <scratchpad>/review.py      # writes gap_reviews.json
python -I scripts/validation/runner.py trips --write-baseline --write --now 2026-11-07T12:00:00Z
ruff check scripts/validation/ tests/test_validation_trips.py
python -m pytest tests/test_validation_trips.py tests/test_validation_runner.py -q
python -m pytest -q   # full, minus tests/quarantine.txt
cd continent-app && npm test
```

## Config and secrets set

None. The layer's constants:
- `TOL_MIN` 20, `TOL_SHARE` 0.20, `WARN_MIN` 45, `WARN_SHARE` 0.35 in `layer_trips.py`;
- `RADIUS_KM` 4, `MIN_TRANSFER_MIN` 5, `DEP_WINDOW` 06:00 to 20:00 in `trips_timetables.py`.

## Before/after measurements

Before: no trips layer, no leg had been compared with a timetable. After, on the hand seed:

| Metric | Before | After | Delta |
|---|---|---|---|
| Legs on the runner | 0 | 1,806 (700 train, 85 bus, 1,021 car) | +1,806 |
| Coverage (legs with a reference) | 0 | 81 (4.5%; train 81 of 700) | +81 |
| Timed train legs within max(20 min, 20%) | not measured | 29 of 57 (50.9%, 95% CI 38.3 to 63.4) | n/a |
| Within the warn band max(45 min, 35%) | not measured | 47 of 57 (82.5%) | n/a |
| Seed train legs whose mode runs at both ends (`fact.mode_ok`) | not measured | 57 of 81 (70.4%) | n/a |
| Uses in the library of the 24 legs without a station | not measured | 246 | n/a |
| MdAPE / MAE | not measured | 25.7% / 32.2 min | n/a |
| Kendall tau-b / Spearman rho | not measured | 0.557 / 0.753 | n/a |
| Gate | none | pass against its own first baseline (hard: `fact.within`, `fact.mode_ok`) | n/a |
| Python tests, validation | 9 in `test_validation_runner.py` | +6 in `test_validation_trips.py`, 15 pass | +6 |

The seed is not a sample: it is the most used legs, plus legs whose end visibly has no station. The shares above describe those legs, not the library. The GTFS run (T1195-a) gives the library-wide numbers.

Gap review (`gap_reviews.json`, 30 plus 7 other fails, weighted by uses):

| Cause | Legs | Uses | Example | Verdict |
|---|---|---|---|---|
| `mode_without_station` | 24 | 246 | Bergen to Stavanger by train (no railway), Dubrovnik to Split, the Dolomites to Venice | Carta wrong |
| `high_speed_blind` | 11 | 137 | Paris to Lille 140 against 62, Florence to Rome 169 against 92, Vienna to Salzburg 193 against 142 | Carta wrong |
| `detour_blind` | 2 | 28 | Copenhagen to Luebeck 173 against 285, Copenhagen to Berlin 254 against 410 | Carta wrong |

Three more legs in the warn band are too fast for detour reasons and were not in the review: Annecy to Chamonix, Vienna to Graz and Dresden to Prague.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `test_shipped_scorecard_and_admin_snapshot_agree` failed after a `--no-snapshot` run | the runner test pins the admin snapshot equal to `scorecard.json` | ran the runner with the snapshot, as every earlier layer did |
| Full pytest: 941 pass, 11 skipped, 2 fail (`test_rating_inputs.py::test_beauty_v2_reads_no_register`, `test_rating_stability.py::test_adding_places_moves_nobody_else`) | both read `app_data/app_data.json`, a git-lfs pointer not fetched in this container (JSON decode error at char 0); not touched by this task | none needed here; they pass where LFS is fetched. `npm test`: 1,898 tests, 1,886 pass, 0 fail, 12 skipped |
| No timetable host is reachable (gtfs.de, transitous, ovapi, OSRM all refused by the proxy) | container network policy | builder tested on a fixture GTFS; the real run is owner step T1195-a |

## Screens checked

None. Nothing a traveller sees changed. The admin Data health scorecard gains a `trips` row from the regenerated snapshot; its view was not opened.

## What is still open

- **T1195-a:** the GTFS run on the open feeds, then a deliberate baseline move. The seed baseline is not the library.
- **T1195-b:** car legs on a self-hosted router.
- **T1195-c:** a station test in `leg()` before it offers the train (out of this task's files).
- **T1195-d:** leg times read from the timetable reference where one exists. This fixes both the high-speed and the detour faults at the cause.
- **T1195-e:** the countries with no confirmed open feed or a contract, and the licence registry rows for the feeds used.
- Ferries are not a mode in the library today (only train, bus, car), so there is no ferry check.
- The seed's "no station" verdicts are knowledge read by hand. The GTFS run confirms each one (status `no_station` within 4 km).

## Rollback procedure

`git revert` the T1195 commits. Nothing is one-way: no pipeline data, wire or app behaviour changed. Without the layer the scorecard regenerates on the next runner write.

## Owner steps (for the checklist)

- [T1195-a] Run the trips timetable check on open GTFS feeds | the trips layer only covers 81 hand-read legs; the library-wide share of honest leg times needs the timetables | download the feeds to cache/gtfs/ (gtfs.de fv_free for DE, opentransportdata.swiss GTFS for CH, the Austria GTFS from data.oebb.at, the SNCF national and FlixBus GTFS from transport.data.gouv.fr, Entur NO, Trafiklab Sverige 2 with a free key, NTA Ireland with a key); run `python -I scripts/validation/trips_timetables.py legs` then `python -I scripts/validation/trips_timetables.py gtfs --date <a mid-season Tuesday> --feed cache/gtfs/de_fv.zip:DE --feed cache/gtfs/ch.zip:CH ...` (one --feed per zip with the countries it covers); run `python -I scripts/validation/runner.py trips --write --write-baseline` and commit data/reports/validation/trips/ | Execution/P15/T1195-trips-validation.md, scripts/validation/trips_timetables.py
- [T1195-b] Route the car legs on a self-hosted router | 1,021 car legs have no reference and the public OSRM server forbids bulk use | start a local OSRM (Docker osrm/osrm-backend on a Geofabrik Europe or per-country extract, car profile) or adapt tools/brouter; run `python -I scripts/validation/trips_timetables.py osrm --url http://127.0.0.1:5000`; rerun the runner with --write and commit | scripts/validation/trips_timetables.py
- [T1195-e] Decide the timetable sources with no open licence | Italy, Czechia, Poland, the Netherlands and Denmark have no confirmed open feed, Belgium needs a signed contract, Sweden and Ireland a free key | email gtfs@sncb.be for the SNCB licence if Belgium is wanted; register the Trafiklab and NTA keys; for IT, CZ, PL, NL, DK confirm a feed's licence or leave them "no open reference" | Execution/_OPEN.md T1195-e
