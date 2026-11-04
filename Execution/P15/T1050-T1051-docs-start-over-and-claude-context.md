# T1050-T1051: Docs start over and lean Claude context

Batch of two roadmap items from P0: **A1** (top-level layout, T1050) and **A4** (Claude context, T1051). Branch `p15-a1-a4-cleanup`, built on `p15-docs-audit` (T1045 to T1049), so the new handbook, roadmap, audit and research are the fresh start.

## T1050: A1, docs start over and stray folders

### Date

2026-11-04

### What changed

Every old Markdown doc was archived with `git mv`, so history follows the files. That is 216 tracked files:
- **Old docs:** everything in `docs/` (42 files plus `design-v6/` and `strategy/`) went to `archive/docs-2026-11/`.
- **Folders:** `Roadmap/` went to `archive/roadmap-2026-10/`, `additional docs/` and `Claude outputs/` to `archive/`, and `Execution/_queue/` (67 prompt files and runner scripts; no scheduled task uses it) to `archive/execution-queue/`.
- **Root plans:** `1.CARTA.md`, `PLAN.md`, `ROUTES.md`, `CARTA_TRAILS_BUILD_BRIEF.md` and `user_knowledge.md`.
- **App prompt files:** the three `continent-app/CARTA_*.md` files.

Some docs stayed:
- **Read by code, so they stay in `docs/`:** `SCHEMA.md` (CI contract gate), `tos/data_licenses.md` (generated licence ledger and its test), `REGIONS.md` (`verify_regions.mjs`) and `LAKES.md` (`pipeline/lakes/check_doc.py`).
- **The GDPR processing record** moved to `docs/legal/ARTICLE30.md`.
- **The new set stays as the start:** `HANDBOOK.md`, `AUDIT-2026-11.md` and `research/`.

Other changes:
- References to archived docs in the handbook, roadmap and READMEs now point at their archive paths, so no link is dead.
- `check_ownership.mjs` reads the archived `OWNERSHIP.md`.
- The 28 dated `reports/coverage_backlog_*.csv` files are untracked and ignored. The coverage script writes them; nothing reads them.
- About 30 MB of local junk was deleted: the `impeccable/` copy, `.fastbuild/`, root logs, `__pycache__/`, `dev/`, `.vercel/`, a crash dump and an empty folder.

Checking before moving showed that several items on the audit's A1 list are still in use, so they stay and move to A2:
- `pipeline/field_stubs/`: imported by `run_pipeline.py` and the trails worker.
- `pipeline/diagnostics/`: used by the rating-tests workflow.
- `pipeline/oneoff/`: imported by `apply_new_gems.py`.
- `src/estimation/`: used by holiday ingestion.
- `ops/*.sh`: named by the secret-scan workflow.
- `reports/rating_reference_v5.json`: the frozen rating calibration.
- `continent-app/reports/`: performance baselines cited by reports.
- `logs/`: Task Scheduler runs `logs/run_*.cmd`, and `logs/pipeline_state.json` is pipeline state.

`Trips/` waits on decision A-a.

### Files touched

- Moved: 216 files (see the commit's rename list); `docs/ARTICLE30.md` to `docs/legal/ARTICLE30.md`.
- Untracked: 28 `reports/coverage_backlog_*_20*.csv`.
- Modified: `.gitignore`, `README.md`, `pipeline/README.md`, `docs/HANDBOOK.md`, `ROADMAP.md` (A1 done, what stayed and why), `continent-app/scripts/check_ownership.mjs`.

### Commands run

`git mv` per path (script in the session scratchpad, dry run first); `git rm --cached` for the dated backlogs; local deletes only of untracked, ignored files after checking each with `git check-ignore`.

### Before/after measurements

| Metric | Before | After |
|---|---|---|
| Tracked `.md` files outside `archive/`, `Execution/`, `.claude/` | 227 | 99 (the rest: 52 generated data reports and curation notes in `data/`, 13 in `Trips/` pending A-a, code READMEs, the 6 entry docs and the new docs) |
| Entries at the top of `docs/` | 49 | 8 (5 files: HANDBOOK, AUDIT, SCHEMA, REGIONS, LAKES; 3 folders: legal, research, tos) |
| Tracked entries at the repo root | 43 | 35 (the 6 entry docs plus code, data and config; `Trips/` and `ops/` pending) |
| Local junk | about 30 MB | 0 |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first commit held only the moves | `git add` stopped on a path that no longer existed (`Roadmap`, already renamed), so the edits were not staged | Committed the edits in a second T1050 commit |
| Several A1 targets from the audit turned out to be live code | The audit listed them as archive candidates without checking imports | Checked every import and workflow first; moved them to A2 |

### Screens checked

None: no traveller-facing change.

## T1051: A4, lean Claude context

### Date

2026-11-04

### What changed

The files every Claude session reads first are now short, correct and checked:
- **Memory index:** `MEMORY.md` went from 15,062 bytes to 3,725, with 41 entries under Rules, Gotchas, Current state by area, and Reference.
  - Of the 302 memories, 140 were kept and 83 merged into 8 area memories.
  - 79 stale ones (retired carriers, Vercel era, old planner versions, queue runners) moved to `memory/archive/`; nothing was deleted.
  - New memories: `repo-entry-points`, `business-late-and-lean`, `priorities-docs-security-ui`, `owner-ui-taste`.
- **CLAUDE.md:** points at ROADMAP.md, the handbook and the audit. It no longer names `pipeline/schema.py`, and it tells the truth about CI (11 workflows, none runs `npm test`). It describes the new `docs/` and `archive/` folders, and adds a task-loop step: update the handbook section and the roadmap status.
- **MAP.md:**
  - Corrected rating sheet path (`RatingSheet.jsx`) and trip page paths (`TripPlannerTab.jsx`, `TripSummary.jsx`).
  - A Handbook column replaces the archived Docs column, and the "docs to distrust" list is gone.
  - A row for licences and data credits.
- **New check:** `scripts/docs/check_entry_points.py` fails when CLAUDE.md or MAP.md names a missing path, and the `entry-points` GitHub workflow runs it.

### Files touched

- Modified: `CLAUDE.md`, `MAP.md`, `ROADMAP.md` (A4 done).
- Created: `scripts/docs/check_entry_points.py`, `.github/workflows/entry-points.yml`, this report.
- Outside the repo: the Claude project memory folder (index rewritten, `archive/` subfolder, new and merged memories).

### Commands run

`python -I scripts/docs/check_entry_points.py`; memory consolidation by a subagent restricted to the memory folder.

### Before/after measurements

| Metric | Before | After |
|---|---|---|
| Memory index loaded per session | 15,062 bytes | 3,725 bytes |
| Memory files indexed | 302 | 151 active (162 archived) |
| Dead paths in CLAUDE.md and MAP.md | at least 3 (`pipeline/schema.py`, `RatingBreakdown.jsx`, `reports/coverage_contract.json`) plus every archived doc | 0 of 194 checked |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The entry-point check flagged `Execution/P*` and a git tag | Patterns and tag names looked like paths | Placeholders skipped; the tag listed as not a path |
| The new memory named a folder never moved and a wrong contract path | The subagent guessed | Corrected by hand after verification |

## Checks (both tasks)

- `npm test` in `continent-app/`: 1,229 of 1,229 pass.
- Entry points: 194 paths, all exist.
- `check-contract.mjs` reads `docs/SCHEMA.md` correctly. The gate itself fails on today's data: 515 of 3,868 places lack `accommodation` while the contract says every place has it (the audit's missing bed prices). This was not caused by this batch (T1051-a).
- `pipeline/lakes/check_doc.py` fails because `cache/worldclim` and `pipeline/harvest_climate_worldclim.py` are missing on this laptop; `docs/LAKES.md` is unchanged (T1051-c).
- The four machine-read docs are byte-identical to before.

## What is still open

- T1051-a: the CI contract gate is red on the shipped data: `accommodation` is "every" in `docs/SCHEMA.md`, but 515 places lack it. Either fill the beds (ROADMAP D10) or mark the key "some" until then.
- T1051-b: `reports/coverage_contract.json` was never committed, so the coverage-contract workflow has nothing to check. Commit the output of `pipeline/regions/coverage.py` or change the gate.
- T1051-c: `pipeline/lakes/check_doc.py` expects `cache/worldclim` and `pipeline/harvest_climate_worldclim.py`, which do not exist on this laptop. Restore them or update the check.
- Still open from earlier rows: decision A-a for `Trips/` (ROADMAP section 19) and the owner step that removes `continent-app/.git` (T1040-d).

## Rollback procedure

`git revert` of the T1050 and T1051 commits restores every file to its old path (renames are tracked). The memory folder keeps every moved memory in `memory/archive/`; move them back to undo. Local deletes were untracked junk and are not restorable, but none was used.
