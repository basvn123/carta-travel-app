# Carta raw data ingestion

Full coverage collectors for the European transport sources catalogued in
"European Transport Datasets.pdf": NAP timetable feeds (GTFS / NeTEx / SIRI /
HRDF), rail realtime, aviation telemetry and repositories, maritime ferries,
and historical pricing / yield proxy archives. Raw acquisition only: native
file formats preserved, no parsing, no feature engineering, no ML.

## Run it

```
pip install -r requirements.txt        # from the repo root
python -m src.ingestion.run_all --list          # roster
python -m src.ingestion.run_all --check         # HEAD probe static endpoints
python -m src.ingestion.run_all                 # everything
python -m src.ingestion.run_all --group naps    # one group
python -m src.ingestion.run_all --only germany,norway
```

Output lands in `data/raw/<source>/<YYYY-MM-DD>/` in native formats, with a
`manifest.jsonl` per source per day recording file, source URL, bytes,
sha256, content type and fetch time. Restricted repositories (EUROCONTROL
DDR / ADRR) are swept from `data/staging/eurocontrol/`. Both trees are
gitignored.

Sources missing credentials report SKIP with instructions; a collector that
fetched some artifacts but not all reports WARN; ERR means it produced
nothing. `--strict` turns any error into exit code 1 for CI / schedulers.

## The roster

| Collector | Group | Source | Auth |
|---|---|---|---|
| pan_europe | naps | public-transport.earth index + all linked archives | none |
| germany | naps | GTFS.de fv/rv/nv/full, Mobilithek subscription URLs | none / account |
| france_static | naps | transport.data.gouv.fr catalogue -> SNCF GTFS + NeTEx | none |
| austria | naps | Mobilitaetsverbuende data hub (NeTEx + GTFS) | free account |
| belgium | naps | SNCB GTFS + NeTEx EPIP, TEC, De Lijn, STIB | keys for De Lijn / STIB |
| denmark | naps | nap.vd.dk catalogue + Rejseplanen account URLs | free account |
| finland | naps | FinAP snapshot + Digitraffic open rail JSON | none |
| netherlands | naps | OVapi gtfs-nl (CC0) + NDOV NeTEx listing | optional account |
| norway | naps | Entur national GTFS + NeTEx + SIRI ET/SX/VM | none (client name) |
| sweden | naps | Trafiklab GTFS Sweden 3, NeTEx Sweden, regional | free API keys |
| switzerland | naps | opentransportdata.swiss CKAN: GTFS, NeTEx, HRDF | free token |
| spain | naps | Renfe gtransit zips, data.renfe.com CKAN, NAP snapshot | none |
| sncf_realtime | rail | GTFS-RT Trip Updates + SIRI SX Lite, 2 min polling | none |
| france_crossborder | rail | Eurostar / Trenitalia France / Renfe intl via French NAP | none |
| era | rail | ERADIS, ERSAD / accessibility, RINF register exports | optional account |
| opensky | aviation | states snapshot + per airport arrivals / departures | free OAuth2 |
| eurocontrol_statfor | aviation | STATFOR / public statistics downloads | none |
| eurocontrol_ddr | aviation | DDR / ADRR staging sweeper | research access |
| nordic_ferries | maritime | Entur / Trafiklab per operator ferry archives | partial keys |
| greece_nap | maritime | nap.gov.gr maritime catalogue | none |
| ferryhopper | maritime | trips widget sampling: schedules + base fares | commercial terms |
| renfe_kaggle | pricing | Kaggle Renfe AVE dynamic pricing archives | kaggle.json |
| ryanair_archive | pricing | GitHub LCC price history repos (Timecapsule style) | optional token |
| sncf_availability | pricing | TGV MAX 30 day seat availability (occupancy proxy) | none |

## Configuration

All knobs are env vars loaded from the repo root `.env` (same convention as
the pipeline). See the ingestion block in `.env.example` for the full list:
credentials per source, endpoint overrides for portals whose URLs rotate,
proxy rotation (`INGEST_PROXY_LIST` / `INGEST_PROXY_PROVIDER_URL`), a pinned
`INGEST_USER_AGENT`, rate limits, retry counts, and per source caps.

## Robustness model

Every request goes through one `PoliteSession` (`core/http.py`): up to 5
retries with exponential backoff and jitter, Retry-After honoured, per host
minimum request spacing, User-Agent rotation, and round robin proxy
rotation hooks. Downloads stream to `.part` files and rename atomically;
filenames are sanitised for Windows reserved device names (the PRN.json
lesson). Portal collectors resolve current resource URLs from catalogue APIs
(France, Switzerland) instead of pinning links that rot.

## Honest source notes

- Mobilithek (DE), Rejseplanen (DK), FinAP (FI), NDOV (NL) and the ERA /
  RINF deep exports gate their bulk downloads behind free accounts; each
  collector has an env slot for the account scoped URLs and says so in its
  SKIP / notes output rather than pretending coverage.
- EUROCONTROL DDR / ADRR is restricted research data with no public
  endpoint; the sweeper ingests what you export manually.
- Viking Line, Silja and Color Line international legs publish no open
  feeds; Nordic ferry coverage comes from Entur / Trafiklab registrations.
- Ferryhopper is a commercial aggregator: keep the widget sampling gentle
  and confirm terms before scaling it.
- Endpoints on national portals rotate; every URL here is env overridable
  and `--check` probes the static ones so drift is caught before a run.
