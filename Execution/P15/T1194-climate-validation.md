# T1194: Climate, sea temperature and crowds validation layers (D23)

ROADMAP item **D23** (Climate row), round 2 session S110, batch 12.

## Date

2026-11-07

## What changed

Three layers now run on the T1187 runner: `climate` (Carta's monthly highs, lows and rain against national met office or WMO normals), `sea` (Carta's monthly sea temperature against Copernicus Marine) and `crowds` (Carta's monthly crowd shape against Eurostat nights by country and month). Each reads an owner-supplied reference CSV and Carta's shipped wire, matches, and reports coverage, share within tolerance, rank agreement and error (MAE; MdAPE where meaningful). `layer_tables.py` adds what the runner does not: error per month and per country, a country by month bias grid, and the 30 largest gaps with a verdict merged from an owner-kept `gap_reviews.json`. Nothing could be run on real references from this container (the reference hosts and the LFS caches are not reachable), so the runs, the baselines and the gap review are owner steps. All checks are soft until a baseline exists.

## Research

A research subagent compared sources (2026-11-07). Its fetch tool could not reach the Eurostat, DWD or Copernicus hosts, so licence texts and file layouts are unverified; the owner confirms them in the owner steps.

| Question | Options | Choice and why |
|---|---|---|
| Climate normals | DWD CDC global CLIMAT multi-annual (https://opendata.dwd.de/climate_environment/CDC/observations_global/CLIMAT/multi_annual/), NOAA GHCN-Monthly v4 (DOI 10.25921/67zp-5m03), ECA&D (non-commercial as understood), national offices one by one, Wikipedia boxes (rejected) | DWD CLIMAT tables first (one format for WMO stations in Europe), GHCN-Monthly as the fallback for gaps. The layer reads a plain long CSV, so the source can change without code. |
| Sea temperature | CMEMS OSTIA REP (SST_GLO_SST_L4_REP_OBSERVATIONS_010_011), Mediterranean reanalysis (MEDSEA_MULTIYEAR_PHY_006_004, id from memory), ERA5 SST (0.25 degrees, too coarse) | OSTIA REP monthly means over 2003 to 2022 (the MUR period), Mediterranean reanalysis as a second check. Free account and the `copernicusmarine` toolbox; redistribution wording to be read first. |
| Crowds | Eurostat tour_occ_nim (country, month; CC BY 4.0 as understood; no UK) | tour_occ_nim, shares of annual nights, last three full years averaged. Carta's side is the nights_per_km2 weighted mean of destination shares per country. |

Own stdlib code throughout, as in T1187.

## Files touched

Created: `scripts/validation/layer_climate.py`, `layer_sea.py`, `layer_crowds.py`, `layer_tables.py`, `tests/test_validation_climate.py`, this report.
Modified: `scripts/validation/runner.py` (three lines in LAYERS only), `Execution/_OPEN.md` (rows appended), `ROADMAP.md` (D23 status).

## Commands run

```
python -m pytest -q tests/test_validation_climate.py tests/test_validation_runner.py
ruff check scripts/validation tests/test_validation_climate.py
python -I scripts/validation/runner.py climate      # empty reference: 0 of 0, soft warnings only
python -I scripts/validation/layer_tables.py sea --out <tmp>
```

Carta's side was also loaded from the committed wire: 3,868 destinations with a climate block (none with elevation yet: `climate.elev` is not on the 2026-06-07 wire, so the elevation guard is idle until the wire is rebuilt), crowd shares for 41 countries, 0 beaches and 0 destinations with sea temperature (T1097-a not run).

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Layers on the shared runner | 10 | 13 |
| Climate coverage, accuracy, MAE per month and country | not measured | Not measured: reference export pending (T1194-a) |
| Sea temperature agreement with Copernicus | not measured | Not measured: reference export and T1097-a pending |
| Crowd shape agreement with Eurostat nights | not measured | Not measured: reference export pending |
| Python tests for these layers | 0 | 6 passing (fixtures); with test_validation_runner.py 15 passed |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `layer_tables.py` could not import the runner under `python -I` | `-I` drops the script folder from the path | The script puts its own folder on the path first |

## Screens checked

None: no traveller screen changed.

## What is still open

Register rows T1194-a to T1194-e. The "gaps reviewed" half of the done condition needs real references and is therefore not done.

## Rollback procedure

`git revert` the T1194 commits. Nothing live changed.

## Owner steps (for the checklist)

- [T1194-a] Export climate normals and run the climate layer | the climate row cannot be validated without outside normals | build data/reports/validation/climate/normals.csv (id,name,cc,lat,lon,elev_m,month,tmax_c,tmin_c,precip_mm,source,period) from DWD CLIMAT 1991-2020 (read the licence first), about 300 stations across the countries; run `python -I scripts/validation/runner.py climate --write --write-baseline` | scripts/validation/layer_climate.py
- [T1194-b] Export Copernicus sea temperature and run the sea layer | the sea row needs an independent product | with a free Copernicus Marine account export OSTIA REP monthly means 2003-2022 at about 300 coastal points to data/reports/validation/sea/cmems_sst.csv (id,name,cc,lat,lon,month,sst_c,source,period); first finish T1097-a so Carta has sea temperatures; run `runner.py sea --write --write-baseline` | scripts/validation/layer_sea.py
- [T1194-c] Export Eurostat nights by month and run the crowds layer | the crowds row needs the national monthly profile | download tour_occ_nim (all countries, total accommodation, nights) to data/reports/validation/crowds/eurostat_nights_country_month.csv (cc,year,month,nights); confirm the reuse notice; run `runner.py crowds --write --write-baseline` | scripts/validation/layer_crowds.py
- [T1194-d] Review the 30 largest gaps of each layer | D23 requires a verdict and a fix at the cause | run `python -I scripts/validation/layer_tables.py climate` (and sea, crowds); fill data/reports/validation/<layer>/gap_reviews.json as {id: {verdict, note}}; rerun the tables | scripts/validation/layer_tables.py
- [T1194-e] Rebuild the wire with climate.elev | the elevation guard on climate pairs is idle on the 2026-06-07 wire | run `apply_climate.py` and `sync-data.mjs` as in docs/SCHEMA.md, then rerun T1194-a | pipeline/apply_climate.py
