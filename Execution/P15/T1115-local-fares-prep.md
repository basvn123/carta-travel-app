# T1115: Local transport fares, ungated preparation (D10, row T1075-b)

## Date

2026-11-06

## What changed

Owner decision 4 (2026-11-05) on the local fare source is "Not now", so the fare layer is not built. Three preparation pieces now exist, with no pipeline or app code and no traveller-facing change: the planned fare field in `docs/SCHEMA.md` (single ticket, day pass, currency, local values, source, as-of date, quality), the list of the 127 starting metros as `reports/local_fares_metros_127.csv` (read from the shipped `public/app_data.json`, `place.class == metro`, sorted by population), and a one-page comparison of curated operator fare pages against a licensed dataset in `reports/local_fares_source_options.md`.

## Files touched

- `docs/SCHEMA.md` (new section "Planned: local transport fare per place", appended; refines the existing `dest.local_transport.fare` row)
- `reports/local_fares_metros_127.csv` (new)
- `reports/local_fares_source_options.md` (new)
- `Execution/P15/T1115-local-fares-prep.md`, `Execution/_OPEN.md` (rows appended), `ROADMAP.md` (D10 status line)

## Commands run

A Python read of `continent-app/public/app_data.json` (3,868 places; classes: 1,675 village, 996 town, 614 city, 456 area, 127 metro) written to the CSV.

## Config and secrets set

None.

## Before/after measurements

Not measured. Count check: 127 metro ids, matching the roadmap.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `reports/destinations_export.csv` gave 125 metros, not 127 | The export is older and covers 3,038 places | Used `app_data.json` instead |
| The 127 ids hold only 115 distinct city centres | Airport-id places share a city (London has several: STN, LTN and others) | Kept all 127 rows as the roadmap counts them; the fare layer should key one fare per city centre and copy it to the airport ids |

## Screens checked

None; no app change.

## What is still open

- T1115-a: the fare source decision (A curated operator pages, B licensed dataset) is parked as "Not now" and stays the owner's; the comparison is ready.
- T1115-b: when decided, build the layer: a harvester or importer, the SCHEMA wire-contract rows, `scripts/ci/contract.mjs`, a schema note, one fare per city centre for the 115 centres.

## Owner steps (for the checklist)

- [T1115-a] Decide the local transport fare source | the fare layer (D10, 0 of 3,868 places today) cannot start without it and decision 4 is "Not now" | read reports/local_fares_source_options.md; choose curated operator pages (recommended in the note) or a licensed dataset; tell the next session, which then builds the layer for the 127 metros in the CSV | reports/local_fares_source_options.md

## Rollback procedure

`git revert` the T1115 commit. Docs and reports only.
