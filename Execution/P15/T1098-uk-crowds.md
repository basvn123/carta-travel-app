# T1098: UK crowds by month (D11)

## Date

2026-11-06.

## What changed

Added `pipeline/harvest_uk_crowds.py` and the pipeline task `crowding_uk` (quarterly, soft, after `crowding`). It fills `dest.crowding`, with the same shape and the same method as the Eurostat layer (density against the Eurostat tier cutoffs, `month_tier` rule `t649-v1`), for Great Britain by ONS ITL1 region (point in polygon) and for BA, FO, MD, XK by country. It reads an owner-prepared CSV and does nothing while that file is absent, so the shipped data is unchanged until the owner runs it. Eurostat blocks are never overwritten. The sources could not be downloaded from the cloud box, so the loader is tested on a hand-built fixture only.

Sources to use (the owner confirms the exact table, see T1098-d): ONS and VisitBritain regional nights by month (ITL1; Open Government Licence v3.0); ONS Open Geography Portal ITL1 boundaries (OGL v3.0); national statistics offices for BA, FO, MD, XK (terms to check per office).

## Files touched

- Created: `pipeline/harvest_uk_crowds.py`, `tests/test_uk_crowds.py`, `tests/fixtures/uk_crowds_nights.csv`, `tests/fixtures/uk_itl1_boundaries.geojson`
- Modified: `run_pipeline.py` (task `crowding_uk`), `docs/HANDBOOK.md` (crowds section), `ROADMAP.md` (D11), `MAP.md`, `Execution/_OPEN.md`

## Commands run

`python -m pytest tests/test_uk_crowds.py`; `ruff check` on the touched Python; `python -I scripts/docs/check_entry_points.py`.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| GB places with monthly crowds | about 2 of 526 (2026-11-04 audit, P-27); not re-counted here, the master is missing in this container | after the owner run | pending |

## What broke and how it was fixed

No issues. `cache/eurostat_nights_nuts2_monthly.json` and the master are LFS stubs in the cloud container, so the existing layer could not be run either.

## Screens checked

None; no app code changed.

## What is still open

T1098-a to T1098-d in `Execution/_OPEN.md`. Honest limit: for the UK the monthly shape is only as fine as the source (ITL1, 12 regions), so every place in a region shares one series.

## Rollback procedure

`git revert` the T1098 commit. No data was written.

## Owner steps (for the checklist)

- [T1098-a] Prepare the nights CSV | the cloud box cannot reach ONS, VisitBritain or the national offices | find the ONS / VisitBritain regional monthly nights table (ITL1), and the monthly overnight stays for BA, FO, MD, XK; write one long CSV with columns geo,name,year,month,nights (geo = ITL1 code such as TLK, or BA/FO/MD/XK; 12 months per year, 2 to 3 recent years) | cache/uk_crowds_nights.csv
- [T1098-b] Download ITL1 boundaries | point-in-polygon needs the region shapes | download the ITL1 boundaries GeoJSON (BUC or BGC) from the ONS Open Geography Portal (OGL v3); save as cache/uk_itl1_boundaries.geojson | cache/uk_itl1_boundaries.geojson
- [T1098-c] Run and count | the after figure comes from the real master | run `python run_pipeline.py --only crowding` if the Eurostat layer is stale, then `python run_pipeline.py --only crowding_uk`; count GB places with crowding.monthly; open 5 UK place pages and check When to go | run_pipeline.py
