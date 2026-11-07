# T1088: Supply chain gates (ROADMAP C6)

## Date

2026-11-05

## What changed

The three audits in `supply-chain.yml` are now real gates. The 12 Python pins pip-audit flagged in `constraints.txt` were bumped (anyio 4.14.2, bleach 6.4.0, certifi 2026.10.18, geopandas 1.1.2, idna 3.15, jupyter-core 5.8.1, lxml 6.1.0, protobuf 6.33.5, python-dotenv 1.2.2, requests 2.33.0, soupsieve 2.9.0, urllib3 2.8.0); `pip-audit -r constraints.txt` now reports no known vulnerabilities (before: 12 packages). `npm audit fix` cleared the 9 dev-tree highs in `continent-app` (0 left). `tools/trailslab/review` moved to maplibre-gl 6.16.0 (critical GHSA-jrc7-96c5-q579 gone) plus `npm audit fix` for vite and source-map-js (0 left). The workflow lost every `continue-on-error` on pip-audit (constraints), OSV-Scanner and npm audit; whole-tree `npm audit --audit-level=high` runs in both npm projects.

## Files touched

`constraints.txt`, `continent-app/package-lock.json`, `tools/trailslab/review/package.json`, `tools/trailslab/review/package-lock.json`, `tools/trailslab/review/src/components/TripMap.jsx` (maplibre 6 has no default export: `import * as maplibregl`), `.github/workflows/supply-chain.yml`, `docs/HANDBOOK.md`, `ROADMAP.md` (C6 status), `Execution/_OPEN.md`.

## Commands run

- `pip-audit -r constraints.txt --no-deps --disable-pip` before and after.
- Python 3.12 venv from `requirements.txt -c constraints.txt` (old and new), `pytest tests` minus `tests/quarantine.txt`.
- `npm audit fix` in `continent-app` and `tools/trailslab/review`; `npm test`, `npm run lint` in `continent-app`; `npm run build` in the review tool.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| pip-audit, constraints.txt | 12 packages with advisories | 0 | -12 |
| npm audit, continent-app (whole tree) | 9 (8 high, 1 moderate) | 0 | -9 |
| npm audit, trailslab review | 1 critical (+2 high) | 0 | cleared |
| pytest (3.12, new pins) | 323 pass, 2 fail, 6 skip | same as old pins | none |
| `npm test` | not rerun at baseline | 1285 pass, 0 fail | n/a |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Review tool build failed after maplibre 6 | The package has no default export | Namespace import in TripMap.jsx; build passes |
| Pins would not install on Python 3.13 | numpy 1.26.4 has no 3.13 wheel (pre-existing) | Tested on 3.12, as the box runs |
| 2 pytest failures (`test_beauty_v2_reads_no_register`, `test_adding_places_moves_nobody_else`) | LFS files missing in this container; identical with old pins | Not touched |
| `pip-audit -r requirements-ml.txt` errors | An unpinned range | Kept report only (T1088-c) |

## Screens checked

None for the app. The review tool's map was only built, not looked at.

## What is still open

- T1088-a: first CI run of the gates (api.osv.dev unreachable here, so OSV was not run).
- T1088-b: pillow 10.4.0 in `infra/hetzner/jobs/requirements-photos.txt` has 66 advisories, outside this workflow.
- T1088-c: `requirements-ml.txt` is not auditable.
- T1088-d: pipeline run on the new pins (lxml 4 to 6 is the riskiest).
- T1080-b and T1080-d are done by this task; T1080-c continues as T1088-a. Their rows are left for the orchestrator to close.

## Rollback procedure

`git revert` the T1088 commit; the old pins return and the gates go back to report only.

## Owner steps (for the checklist)

- [T1088-a] Watch the first supply-chain.yml run | the gates are unverified on GitHub and OSV was unreachable from the cloud container | push or open a PR touching a lockfile; open the Actions run; fix any failing step | .github/workflows/supply-chain.yml
- [T1088-d] Re-sync venvs and run the pipeline on the new pins | lxml 6, geopandas 1.1 and others were only unit-tested | on the box and laptop run `pip install --only-binary=:all: -r requirements.txt -c constraints.txt`; run one weekly pipeline; compare output | constraints.txt
