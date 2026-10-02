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

The roster is not kept here. It is rendered from `src/ingestion/core/registry.py`
into section 0 of `docs/tos/data_licenses.md` (the execution roster: one table
of collectors, one of harvesters, with cadence, task, failure mode and the
ledger rows that govern each). `python -m src.ingestion.run_all --list` prints
the live list. Regenerate the ledger with
`python -m src.ingestion.core.ledger --write`; CI runs `--check` and fails on a
stale ledger (T078, Execution/P4/T078-registry-licence-unification.md).

Adding a source: write the collector, then add its row to the registry. A
collector without a registry row is refused at import.

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
