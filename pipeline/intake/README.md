# pipeline/intake/ - finding what the catalogue is missing

`register_intake.py` is Scheduled (`run_pipeline.py` task `register_intake`,
monthly, report-only): it diffs Wikidata place registers against the
catalogue and writes `reports/intake_candidates.csv`. It never writes to
`app_data.json`.

The other three scripts in this folder are Manual. They read that report
or extend it, and every one of them stops short of touching the catalogue:
a human reviews the candidates before anything is added. Per the project's
own memory note, never run `ingest_candidates.py` output straight into the
catalogue without the user looking at the CSV first.

| Script | Command | Reads | Writes | What the human does |
|---|---|---|---|---|
| `gap_scan.py` | `python pipeline/intake/gap_scan.py` | `cache/wikidata_landmarks.json` (per-destination ~9 km box) | appends to `reports/intake_candidates.csv` | Finds places close enough to an existing destination to matter but outside any register's reach (the Mougins case). Read the CSV before the next step. |
| `osm_settlement_scan.py` | `python pipeline/intake/osm_settlement_scan.py` | Geofabrik country extracts, `cache/wikidata_sitelinks.json` | appends to `reports/intake_candidates.csv` | Finds places beyond gap_scan.py's ~9 km box radius (the Sirmione case, 20 km across a lake). Same review step applies. |
| `ingest_candidates.py` | `python pipeline/intake/ingest_candidates.py` | `reports/intake_candidates.csv` (after human review), Wikidata | `app_data/new_gems_<date>.json`, in the shape `apply_new_gems.py` (Manual, pipeline root) consumes | The bridge from a reviewed CSV to a spec file. Read every row before running; `auto_admit` is a hint, not an approval. Apply with `apply_new_gems.py` only after checking the spec by eye. |

None of these three are wired into `run_pipeline.py`, and none should be:
adding a destination is treated as an editorial act across the whole
coverage loop (`build_place_candidates.py` -> `promote_place_candidates.py`
-> `apply_new_gems.py`, all documented in `pipeline/README.md`'s Manual
section), and a cron job should never make that call by itself.
