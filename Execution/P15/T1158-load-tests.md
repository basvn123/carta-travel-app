# T1158: Load tests (k6)

Roadmap item: H4 (Load tests). Session S74, round 2 batch 7. Branch `p15-s74-load-tests`.

## Date

2026-11-06

## What changed

`tests/load/` now holds k6 scripts for `/api/ask`, `/api/flights`, the stays wire shards and the static wire, plus `all.js` for the four together, each with p95 budgets (800, 2,500, 400 and 300 ms) and an error rate threshold. The 10x launch number is derived in `tests/load/lib.js` and `docs/runbooks/load-tests.md` (100,000 MAU, campaign peak: ask 4, flights 3, stays 2, static 9 requests per second). A manual-only workflow `.github/workflows/load.yml` runs them from GitHub. No local k6 run is recorded: the container refused to execute a downloaded k6 binary, so the scripts are checked by a Node smoke test and the real run is an owner step.

## Research

Compared from knowledge, not re-verified on the web in this offline container: k6 (Grafana, AGPL-3.0, single Go binary, JS scripts, arrival-rate executors, thresholds that fail the run, official GitHub Action), Artillery (Node, YAML, good for scenarios, weaker thresholds and heavier at rate), autocannon (a CLI for one URL, no mixed scenarios), Locust (Python, a server and workers to run). Chosen: k6, because ROADMAP H4 names it and constant-arrival-rate models requests per second honestly (virtual users would hide a slow edge).

## Files touched

- Created: `tests/load/lib.js`, `ask.js`, `flights.js`, `stays.js`, `static.js`, `all.js`, `smoke.test.mjs`; `docs/runbooks/load-tests.md`; `.github/workflows/load.yml`.
- Modified: `ROADMAP.md` (H4 status), `Execution/_OPEN.md` (T1158-a to c).

## Commands run

```
node --test tests/load/smoke.test.mjs
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| p95 per route at 10x | no load test | not measured (owner run, T1158-a) | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Smoke test expected 11 rps for static | arithmetic slip | 16 calls a month gives 9 rps; test corrected |
| Local k6 run | the sandbox refused to run a downloaded binary | left as an owner step; not worked around |

## Screens checked

None (no traveller screen).

## What is still open

- T1158-a: first local and preview run (owner).
- T1158-b: the smoke test sits outside `npm test`'s glob.
- T1158-c: the traffic assumptions need real data.

## Owner steps (for the checklist)

- [T1158-a] Run the k6 load tests on the preview | proves the 10x launch budgets before the public launch | install k6; run `k6 run -e BASE_URL=https://<preview>.carta-app.pages.dev -e SPOOF_IP=0 tests/load/all.js` (or Actions, "load", Run workflow); paste the p95 lines into a report | docs/runbooks/load-tests.md

## Rollback procedure

`git revert` the T1158 commits; nothing else depends on these files.
