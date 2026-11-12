# Run report: align Carta with crew and clean the repo

- **Status:** done
- **Date:** 2026-11-12
- **Level and playbook:** L2 · deep-task
- **Run folder:** `.work/2026-11-11-crew-alignment/` (working files local; this report is committed)
- **ROADMAP items:** A3 (register triage), A4 (lean Claude context), B2 (docs tree)

## Summary
Carta now follows the crew layout: a 63-line `CLAUDE.md`, one checked `docs/project-map.md`, eight decision records, a lessons file, protected paths and a run history in `.work/INDEX.md`. The old `Execution/` system (534 files, a 523 KB register) and the root `archive/` folder moved into git history. Every old task has an index line, and owner-only steps live in `docs/owner/`. A session now loads about 7.1 KB at start instead of about 18 KB. Tests show no new failures. A fresh judge passed all seven criteria on round 2.

## What was asked
Make the repo current and crew-compliant, blend Carta's own rules into crew, remove stale files, code and references, convert the execution reports to the crew format, make the project map accurate, and cut what every session reads, guided by the owner's prompt guide and crew's `docs/decisions/` (the owner gave full freedom and asked for an unattended run).

## What we did
1. Intake and plan: `brief.md`, `plan.md` (7-criterion rubric).
2. Explore: four explorers mapped docs, `Execution/`, code and Claude config (`explore-*.md`).
3. Decide: one direction (crew's init-project layout) in `decision.md`; one breakage critic (`critique-breakage.md`), whose findings were fixed in the build.
4. Build in the worktree `C:/Users/Gebruiker/Documents/Portfolio/wt/crew-alignment`, with scripts kept in the run folder (`build_index.py`, `build_owner.py`, `rewrite_refs.py`, `rewrite_refs2.py`, `dead_check.py`, `roadmap_v2.py` and others).
5. Verify: tests before and after (`checks.md`); judge round 1 FAIL (3.94, five fixes), judge round 2 PASS (all 4/5).

Skipped: diverge and propose (crew's templates fix the target, so one direction); the approval checkpoint (the owner asked for an unattended run).

## Why
- Context is an attention budget; the prompt guide and research behind it (lost in the middle, irrelevant context) say point, don't paste. See `docs/decisions/0004-lean-always-loaded-context.md`.
- Reports stay committed because cloud sessions only share git: `docs/decisions/0002-run-history-in-work-index.md`.
- A 2,106-row register was not being worked: `docs/decisions/0003-open-items-owner-steps-and-roadmap.md`.
- Full reasoning: `decision.md`.

## Files changed

Commit `p15-crew-alignment` (1,063 files: 858 deleted, 165 edited, 25 moved, 15 added). `git show --stat <commit>` lists each one.

| File | Change | Why |
|---|---|---|
| `CLAUDE.md` | Rewritten in the crew shape (112 dense lines to 63) | Carta facts, commands, overrides only |
| `README.md` | Rewritten (it called itself out of date, schema v15) | Accurate entry for humans |
| `ROADMAP.md` | A3 done, A4 note, A1 layout, convention line on runs, owner and archive pointers; history rows unchanged | Plan of record matches the repo |
| `docs/project-map.md` | New, merges `MAP.md`, `docs/README.md`, `docs/areas/` | One checked map |
| `docs/decisions/README.md`, `docs/decisions/0001-adopt-crew.md` to `docs/decisions/0008-priorities-docs-security-ui.md` | New | Lasting choices with reasons, incl. owner rules that lived only in private memory |
| `docs/lessons.md` | New, 14 lessons from memory gotchas | crew reads it at L1 and L2 start |
| `.claude/protected-paths.txt` | New | Hook-enforced protection for `continent-app/public/`, `cache/`, `tools/`, `logs/`, frozen reports, workflows, secrets |
| `.work/INDEX.md` | New: this run plus 779 pre-crew lines with `git show` commands | History of every task |
| `.gitignore` | `Execution/` rules replaced by crew `.work/` rules (INDEX and report.md tracked) | Run folders |
| `docs/owner/` (README plus 21 moved procedures, `docs/owner/unsorted.md`) | Moved from `Execution/P*/_OPEN-*.md`; 302 unlinked owner rows collected; closed-row sentence fixed; step crew-a added to `docs/owner/owner-checks.md` | Owner steps in one place |
| `Execution/` (all), `MAP.md`, `docs/README.md`, `docs/areas/` (28), `docs/reading-guide.md`, `archive/` (244) | Deleted (in tag `archive/execution-2026-11-11`) | Stale or replaced |
| `docs/AUDIT-2026-11.md` | Moved to `docs/research/2026-11-audit.md` | P-nn IDs still resolve |
| `reports/local_fares_source_options.md`, `reports/rating_external_check_v5.md` | Moved to `docs/research/` | Research notes belong there |
| `scripts/register/`, `scripts/execution_digest.py`, `scripts/docs/build_reading_guide_index.py`, `tests/test_register_dry_run.py` | Deleted | Served the retired register |
| `continent-app/scripts/check_ownership.mjs`, `continent-app/scripts/retired/` (11), 9 one-off app scripts (`scenario_*`, `shot_*`, `trip_finder_baseline.mjs`) | Deleted | Zero readers (`dead-check.md`) |
| 19 data files in `app_data/`, `data/`, `reports/` (retired `features` task outputs, wave-2 lists, dumps) | Deleted | Zero readers, retired features (`dead-check.md`) |
| `.claude/skills/repo-cleanup/`, `skills-lock.json` | Deleted | Generic third-party skill, unused |
| `.claude/launch.json`, `.claude/skills/carta-design/SKILL.md` | Dead worktree entry removed; step 6 now points at the crew report | Stale config |
| `continent-app/scripts/serve_static.mjs` | Restored from `Execution/P15/T840-T843-walk/serve-a.mjs` | Live helper the verify scripts use |
| `scripts/docs/check_entry_points.py`, `scripts/docs/drift.py`, `tests/test_docs_drift.py`, `.github/workflows/entry-points.yml`, `.github/workflows/ci.yml` | Entry check covers `CLAUDE.md`, `docs/project-map.md`, `docs/lessons.md`; refuses an empty run | Map stays true in CI |
| `.github/workflows/secret-scan.yml`, `.semgrepignore`, `docs/security/static-analysis.md` | Dropped retired paths | Stale config |
| `continent-app/scripts/eval/ask-docs/set.json` | Three gold paths moved from `docs/areas/` to HANDBOOK sections | Eval corpus changed |
| `docs/reference/*.md`, `docs/architecture/lineage.md` | Regenerated | `--check` gates |
| `docs/HANDBOOK.md` | Pointers updated; stale appendix of T1045 findings (all about MAP.md and old CLAUDE.md) removed | Stale claims |
| About 120 other files across `pipeline/`, `infra/`, `continent-app/`, `docs/`, `scripts/`, `supabase/functions/`, `src/`, `tests/` | Comments and doc pointers to `Execution/...`, `archive/...`, `MAP.md` rewritten to the task ID, `docs/owner/`, or a `tag:path` git reference | No dead pointers |
| `continent-app/scripts/verify_*.mjs` (5) | Screenshot paths moved to `.work/shots/` | Old folder gone |
| `pipeline/README.md` | Retirement policy: delete, git keeps it | No `archive/` folder |

After the merge, the main checkout still held never-tracked leftovers under `Execution/` (task screenshots and walk logs, for example `Execution/P15/T1024-shots/first-1440.png`) and `archive/execution-queue/logs/`. They totalled 59 MB, all screenshots and logs the old rules called throwaway, and were deleted. The worktree `C:/Users/Gebruiker/Documents/Portfolio/wt/crew-alignment` was removed with `node scripts/worktree.mjs remove`; `continent-app/node_modules` was kept intact.

Outside the repo: `~/.claude/projects/c--Users-Gebruiker-Documents-Portfolio-Travel-App/memory/MEMORY.md` trimmed from 4,078 to 598 bytes; 35 superseded memory files moved to `memory/archive/` (not deleted).

## How it fits together
`CLAUDE.md` points to `docs/project-map.md`, which points to every part and doc. `docs/decisions/` holds the why, `docs/lessons.md` the traps, `docs/owner/` the owner's to-do list, `ROADMAP.md` the plan, and `.work/INDEX.md` the history. Each old task opens with `git show <tag>:<path>`. CI checks the three entry files for dead paths.

## How it was checked
Full table: `checks.md`.
- `python -I scripts/docs/check_entry_points.py` → OK, 292 paths
- pytest minus quarantine → 1,160 passed, 11 failed: the same 11 as on `main` (WSL bash, docker, pre-existing drift and snapshot tests)
- `npm test` → no new failures. 16 extra cold-run failures were Vite module timeouts; they pass on a warm rerun.
- `npm run lint` → 0 errors; ruff → clean
- docs drift, config, lineage and reference checks → only the SCHEMA wire-table drift that `main` already has
- ask-docs eval → 95.8%, unchanged from `main` (already below its 0.979 baseline)
- Judge round 2 → PASS (`judgement-2.md`)

| Criterion | Score |
|---|---|
| Lean always-loaded context | 4 |
| One true map | 4 |
| crew compliance | 4 |
| Stale removed with evidence | 4 |
| Checks green | 4 |
| Decisions recorded | 4 |
| Traceability kept | 4 |

| Measure | Before | After |
|---|---|---|
| Loaded every session (`CLAUDE.md` + memory index) | about 18.0 KB | about 7.1 KB |
| `CLAUDE.md` | 13,875 bytes | 6,544 bytes |
| Tracked Markdown files | 971 | 317 |
| Tracked files | 53,406 | 52,547 |

## Open issues and risks
- The tag `archive/execution-2026-11-11` is local. Owner step crew-a in `docs/owner/owner-checks.md`: `git push origin archive/execution-2026-11-11`. Until then, use hash `2a2379d44e`.
- Unmerged branches `p15-hello-date`, `p15-auth-settings-close` and `p15-round2` edit `Execution/`. They will conflict on merge; keep their report as `.work/<run>/report.md` instead.
- The prepared session plans (rounds 2 and 3) are in history only; they still name task numbers and `Execution/` paths.
- `docs/project-map.md` is 17 KB, just above the 15 KB target; trim it if it grows.
- Pre-existing, not touched: SCHEMA wire-table drift, the ask-docs eval below its baseline, 11 failing Python tests, 13 failing app tests (all also failing on `main`).
- Kept on purpose: `pipeline/merge_curation.py`, `pipeline/rating_shadow_report.py`, the PowerShell launchers, `pipeline/oneoff/` (documented or still referenced).

## Next steps
- Push the history tag (owner step crew-a).

## Where to find things
- Brief and plan: `brief.md`, `plan.md`
- Exploration: `explore-docs.md`, `explore-execution.md`, `explore-code.md`, `explore-claude-config.md`
- Decision and critique: `decision.md`, `critique-breakage.md`
- Checks and judging: `checks.md`, `judgement-1.md`, `judgement-2.md`, `dead-check.md`
- Lasting decisions: `docs/decisions/0001-adopt-crew.md` to `docs/decisions/0004-lean-always-loaded-context.md`
