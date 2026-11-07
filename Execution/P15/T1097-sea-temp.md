# T1097: Sea temperature chain ready (D8)

## Date

2026-11-06

## What changed

The sea temperature chain is ready for the box run. Two silent breaks are fixed: the beach export wrote the twelve figures as `sst` while the contract and the beach page read `sea_temp`, so even a finished harvest would have drawn nothing; and `apply_climate.py` read the overlay file as flat rows when `ov.save` wraps them as `{_meta, rows}`, so `climate.water_c` would have stayed empty. The harvester now keeps a polite pace (1.5 s between ERDDAP calls, `--delay`), writes tiles atomically and takes `--fixture DIR` to read recorded ERDDAP CSV for a dry run. ERDDAP is not reachable from the cloud container, so the check ran on a recorded response in the real ERDDAP CSV shape (two tiles, three beach points): harvest, cache resume with zero network calls on the second run, `v2_fields`, `apply_climate.extras`, and the beach page strip in `npm run dev`. The real harvest is an owner step.

## Files touched

- `pipeline/harvest_sea_temp.py` (`http_get`, pace, `--delay`, `--fixture`, atomic tile write)
- `pipeline/beaches/export_beaches.py` (wire key `sea_temp`)
- `pipeline/apply_climate.py` (reads `rows`)
- `continent-app/src/lib/waterFacts.js` (`seaByMonth`), `continent-app/src/browse/BeachPage.jsx` (uses it)
- Tests: `tests/test_sea_temp_fixture.py`, `tests/fixtures/erddap/{40_14,43_13}.csv`, `continent-app/tests/seaTemp.test.mjs`, `continent-app/tests/fixtures/beaches_sea_temp.json`
- Docs: `docs/SCHEMA.md`, `docs/HANDBOOK.md` (Sea temperature, Beaches limits), `ROADMAP.md` (D8), `Execution/_OPEN.md`

## Commands run

- `python3 -m pytest tests/test_sea_temp_fixture.py tests/test_sea_temp_resilience.py` (5 passed)
- `cd continent-app && npm test` (1343 tests, 1331 pass, 0 fail)
- `node scripts/sync-data.mjs --split-only` then `npm run dev -- --port 5199` with the fixture row put into one beach of `public/beaches/IT.json` (reverted after the look)

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Beaches with sea temperature on the wire | 0% | Not measured: needs the box run (T1097-a) | |
| Fixture beach points with 12 figures after harvest, export and strip | n/a | 2 of 3 (the third is inland, no water cell within 6 km, as intended) | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Strip would stay empty after a good harvest | Export wrote `sst`; app and contract read `sea_temp` | Export writes `sea_temp` |
| `climate.water_c` would stay empty | `apply_climate` read `{_meta, rows}` as flat rows | Reads `rows` |
| Dev app showed the load-error screen in the container | `public/boot.json` and `public/dest/` are generated and absent; the master is missing | `node scripts/sync-data.mjs --split-only` (output gitignored, removed after) |

## Screens checked

Beach page (Guvano, fixture row injected) at 390 and 1280 px: "Sea temperature by month" strip with twelve bars, August 26 degrees highest, July to September highlighted, current month outlined; the dock and the side card say "sea 26 in August". Screenshots in `Execution/P15/T1097-shots/` (gitignored).

## What is still open

- T1097-a: the real harvest and the exports on the box (below).
- T1097-b: a look at a real beach on a phone after the deploy.
- Not checked here: the ERDDAP request URL against the live server (unchanged since T641, the first box run worked), so a live 4xx is the one thing the fixture cannot show.

## Rollback procedure

`git revert` the T1097 commits. Nothing live was changed.

## Owner steps (for the checklist)

- [T1097-a] Run the sea temperature harvest and exports on the box | ERDDAP is not reachable from the cloud container and the harvest takes about 6 hours | on the box in the repo root: `git pull`; `python run_pipeline.py --only sea_temp,climate_daily,beach_context --ship none`; if the harvest prints "incomplete" and exits 3, run the same command again (it resumes from `cache/sea_temp/`, repeat until it ends clean); check `grep -l '"sea_temp"' continent-app/public/beaches/*.json | wc -l` (expect most coastal country files) and that the publish gate did not roll the beaches back; then ship as usual | pipeline/harvest_sea_temp.py
- [T1097-b] Look at one real beach page after the deploy | the strip is only proven on fixture data | open a Mediterranean beach on a phone; check the sea strip and its warmest months | continent-app/src/browse/BeachPage.jsx
