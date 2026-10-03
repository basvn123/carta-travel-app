# T112 coverage dashboard and gate

## Task ID

T112 (mind map number T108; T112 is used everywhere).

## Date

2026-10-03

## What changed

The dashboard half of this task already existed. T111 made coverage.py write reports/coverage.html with a country table at the top, one row per country per section with published count, floor, status and reason code, and it writes that page on every run of the regions step. So T112 built the half that was missing: a judge that fails the build, and a workflow that runs it.

The judge is pipeline/regions/coverage_gate.py. It uses only the standard library, because CI holds none of the data and cannot import the geo stack. It reads reports/coverage_contract.json and fails on four things: a missing or blank cell or a status other than ok, fail or na; a miss with no reason code from the contract's own list, or a code with no detail sentence; an ok cell that publishes fewer rows than its floor; and, when a baseline file is given, any cell that was ok in the baseline and no longer is. The fourth rule is the regression block. It needs no decision about which countries matter, because it protects whatever passes at the moment the baseline is written. coverage.py --strict now calls the same function, so a local run and CI judge identically; before, --strict only caught blank cells.

The workflow is .github/workflows/coverage-contract.yml, a new file. It runs a self-test first, which seeds eight faults (no code, bad code, no detail, missing cell, bad status, ok under floor, empty contract, ratchet regression) and fails if any rule stops firing, so a green run cannot mean a broken detector. Then it checks the committed contract and baseline.

## How it works, and the limit to know about

CI cannot run coverage.py, which needs regions.gpkg and eleven cache layers that now live in R2 and take about four minutes to replay. So the gate judges a committed artefact, reports/coverage_contract.json, rather than rebuilding it. That means a regression is blocked when someone regenerates the contract after a pipeline change and commits it worse, not when the live data drifts. I tried to generate the contract tonight and it failed at the first read, because regions.gpkg is not on the laptop. So no contract or baseline is committed yet, and the gate prints a warning and passes when the file is absent. That is deliberately loud and is the one weak point: until the owner commits the contract and adds --require, the real check is not enforced. The self-test is enforced from the first run.

## Files touched

Modified: pipeline/regions/coverage.py (the --strict branch of main only), Execution/_OPEN.md.

Created: pipeline/regions/coverage_gate.py, .github/workflows/coverage-contract.yml, Execution/P7/T112-coverage-dashboard-and-gate.md.

continent-app/public/coverage.json was not touched or committed, as instructed.

## Commands run

    python pipeline/regions/coverage_gate.py --self-test
    python pipeline/regions/coverage_gate.py --check reports/coverage_contract.json
    CARTA_DATA_ROOT=<main checkout> CARTA_OUT_ROOT=<scratch> python pipeline/regions/coverage.py --strict

The self-test printed "clean passes, 8 seeded faults caught". The check with no contract warned and exited 0. A hand built contract with a regression exited 1 with both the no-code and the ratchet message. The coverage.py run failed with DataSourceError on cache/regions/regions.gpkg, as described above.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Builds that run the coverage contract in CI | 0 | 1 workflow, self-test enforced, contract check pending a commit |
| Rules --strict enforces | 1 (blank cell) | 4 |

The country cell counts (42 of 225 above floor, per T111) are unchanged; this task did not rerun the audit.

## What broke and how it was fixed

No issues in the code. The data rerun could not happen on this machine, which is why T112-a is open.

## What is still open

T112-a (owner): pull the data from R2, run coverage.py, commit reports/coverage_contract.json and a baseline written with --write-baseline, and add --require to the workflow step. T112-b (owner): confirm that blocking on whatever is ok today is acceptable, or name a country whose trails floor must pass, which is the trails scope decision in spec part 14. T112-c: the tracked reports/coverage.html is the old page and refreshes with the T112-a commit. T111-e is closed by this task.

## Rollback procedure

    git revert <T112 commit>

This removes the workflow and the gate file and restores the old --strict. Nothing else reads either.
