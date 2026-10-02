# T285 the docs catch up

## Task ID

T285

## Date

2026-10-02

## What changed

Seven documentation rows are closed or part closed. Docs only, root repo only. The literal destination count (1,570, stale against the 3,868 in T201's report) is gone from 1.CARTA.md, docs/1.CARTA.md and README.md and replaced by a pointer to `meta.n_destinations` in app_data.json. PRODUCT.md's "The one rule the numbers follow" now words the harvested, cached, estimate chain for ground costs only. docs/REGIONS.md describes the per-region `code` field and the `contract` block of coverage.json (read from pipeline/regions/coverage.py, build_contract and write_wire). The trips dataset README carries the T084 validator figures. The credit claim in both CARTA docs now says 43 credit entries in continent-app/src/data/attribution.js, 42 distinct organisations because European Environment Agency appears twice, and that credits render in the Account panel's Data sources block, not a footer. src/ingestion/README.md loses its hand-typed 24 row roster and points at section 0 of docs/tos/data_licenses.md and the ledger commands. docs/LAUNCH-METRICS.md now says visitors are read from Cloudflare Pages analytics for the project carta-app (T275 decision), and that purchase rate is purchases over that figure. docs/SUPPORT.md's stale "until T272-a removes" line is rewritten to match T273.

## Files touched

**Modified:**
- 1.CARTA.md
- docs/1.CARTA.md
- README.md
- PRODUCT.md
- docs/REGIONS.md
- docs/LAUNCH-METRICS.md
- docs/SUPPORT.md
- src/ingestion/README.md
- Trips/carta-unified/carta-unified/README.md
- Execution/_OPEN.md

**Created:**
- Execution/P11/T285-docs-catch-up.md

## Commands run

Edits by script and by hand, then `git diff --stat`. No build, no data, no migration.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Literal 1,570 in README.md, 1.CARTA.md, docs/1.CARTA.md | 5 | 0 | -5 |
| Validator figures in the trips README | 0 errors, 482 warnings | 606 errors, 624 warnings (Execution/P5/T084-trip-validator.md) | stale to current |
| Hand-typed collector roster rows in src/ingestion/README.md | 24 | 0, pointer to ledger section 0 | -24 |
| Credit claim in 1.CARTA.md | 24 | 43 entries, 42 distinct (attribution.js `source:` keys) | corrected |

## What broke and how it was fixed

Nothing broke. Two judgement calls. The 30 notices figure in the trips README was dropped because the T084 report does not state a notice count. The 15% budget drift row in that README became the T084 1% error row (98 findings, same report).

## What is still open

T207-g stays open for its sitemap half only (public/sitemap.xml holds 1 URL; waits for T222). Its doc-claim half is closed by this task. The pointer to `meta.n_destinations` was not checked against a live app_data.json in this sparse worktree. The CHANGELOG-explore-v4.md still holds a historic 1,570 figure; it is a dated changelog and was left alone.

## Rollback procedure

`git revert` the commit on branch p11-docs-catchup, or do not merge the branch. Docs only.
