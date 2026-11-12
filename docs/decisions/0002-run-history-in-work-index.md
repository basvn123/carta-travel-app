---
status: accepted
date: 2026-11-11
decided-by: Bas, with Claude
run: .work/2026-11-11-crew-alignment/
---

# 0002 · Run history in `.work/INDEX.md`, reports committed

## Context
crew keeps each run in `.work/<date>-<slug>/` and ignores the folder in git, except `.work/INDEX.md`. Carta runs many cloud sessions that share nothing but git, so a report that lives only on one machine is lost to every other session. The old `Execution/` tree held 534 files (reports, digests, plans) that sessions grepped for history.

## Options considered
1. **crew default:** run folders local, only `INDEX.md` tracked. Cloud sessions lose reports.
2. **Keep `Execution/` as it was** next to `.work/`. Two histories.
3. **Track `INDEX.md` and each run's `report.md`; move the old tree into git history.**

## Decision
We chose **option 3**:
- `.gitignore` ignores `.work/*` but keeps `.work/INDEX.md` and `.work/*/report.md`. Working files (briefs, proposals, screenshots) stay local.
- Every old task has one line in `.work/INDEX.md` with the command that shows its full report, for example `git show archive/execution-2026-11-11:"Execution/P15/T1222-box-checklist-review-api.md"`.
- The tag `archive/execution-2026-11-11` points at commit `2a2379d44e`, the last commit with `Execution/`. Older full reports (P0 to P13) are under the earlier tag `archive/execution-full-2026-11-03`. Both commits are in `main`'s history, so the commands also work with the hash if a tag is missing.
- The register scripts (`scripts/register/`, `scripts/execution_digest.py`) and the reading guide were removed with the tree.

## Consequences
- Good: one history, readable from any session; the working tree lost 534 files and about 1.5 MB of text sessions used to grep.
- Bad: reading an old report takes a `git show`. The tag must be pushed (`git push origin archive/execution-2026-11-11`) for other clones to use the tag name.

## How we'll know it works
A question like "what did T1162 change?" is answered from `.work/INDEX.md` plus one `git show`.
