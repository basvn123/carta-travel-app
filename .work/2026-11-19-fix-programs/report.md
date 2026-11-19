# Run report · fix programs (data, logic, ai)

Status: **halted by the owner on 2026-11-19, about 10:00**, after roughly 9 hours of work. The owner will pick it up later. Nothing is merged into `main`. All finished work sits on the branch `p15-fix-programs`.

## What this run is
Three headless program sessions turned three research runs into code:
- **data:** `docs/research/2026-11-17-data-quality.md`
- **logic:** `.work/2026-11-17-app-logic-audit/`
- **ai:** `.work/2026-11-17-ai-north-star/` plus `.work/2026-11-17-gemini-rag/`

The order, file ownership, the 20 owner defaults and the merge protocol are in the run folder's `plan.md`. That folder is local, in the main checkout: `.work/2026-11-19-fix-programs/`.

## What is on `p15-fix-programs`
The branch was made from `origin/main` `2130dd56ee` with three `--no-ff` merges. There were no conflicts.

| Program | Commits | Judged? |
|---|---|---|
| data, wave 1 | `4a632dc714` bed rules (one predicate for a measured bed; dorm above hotel3 cleaned); `14fee7874a` bed loss patch (the box applies its stays build to its own master); `f06ff461b8` publish guard (contract, D2 and bed checks before every box publish); `9bfe624859` trail names (fixme, caps, two-part ends, lead codes, same-name walks; replay 3,937 to 1,203 unclean); `ab86eb8791` launch gate (the section 4 table, measured); `57575cc0fd` lake and beach pages lead with what is particular to the place; `5b9fc0d255` research hand-off into git | **No.** The wave 1 judge had not run. |
| data, in progress | `cc2df52222` **WIP**: heat and fire read the real climate shape; sync-data keeps the climate keys (F-4, D20) | No. Unfinished and not tested end to end. |
| logic, wave 0a | `96fd0f9135` share links carry no person keys, the device clear is complete, co-planned trips are never counted, open-jaw flies home after out, K-1/K-3/K-4/V-5; `e71375523c` judge fixes (a failed remote sign-out still clears the device; DOM check of the `?pass=ok` strip) | Yes, judged, with the judge's fixes applied. |
| ai, wave 1 (hygiene) | `08e05f9302` pinned Gemini chains, thinking minimal, one price table, truthful telemetry, capacity that never refuses Pass holders, Ask funnel steps; `e20d48ac13`, `dce9a6544c`, `6270fecc39` judge and follow-up fixes (`ai_consume_v2`, quota contract tests) | Judged once; the re-judge was running when halted. |

New migration on the branch: `supabase/migrations/078_ai_hygiene.sql` with `_down`. It is not applied anywhere.

## Checks run on the combined branch (2026-11-19)
| Check | Result |
|---|---|
| ruff (E9, F63, F7, F82) | pass |
| `check_entry_points.py` | pass |
| eslint (quiet) | pass |
| New pytest files: bed rules, launch gate, publish guard, heat and fire | 25 of 25 |
| New app tests: ownTrips, passReturn, shareKeys, openJaw, daySeedDate | 20 of 20 |
| `drift.py` | 2 drifts, both already on `main`: REC-004 test name, and the SCHEMA wire table |

**Not run:** the full `npm test` and the full pytest. They take over 2 hours on this machine and must run before any merge.

**`main` was already red before this run:**
- `test_box_schedule` (gazetteer)
- `test_docs_drift`
- the design-lint motion literal
- two date-driven flight tests

## Where the work stands
| Program | Backlog | Next step when resumed |
|---|---|---|
| data | about 72 items | Judge wave 1. Finish the F-4 WIP. Waves 2 to 4 are already decided (`state/2026-11-19-fix-data-w2` to `-w4`). |
| logic | 258 rows, wave 0a done | Wave 0b (quick wins and the guard), then engines E1 to E10 (waves 1 to 10). |
| ai | 24 items, wave 1 done | Finish the re-judge, then evalbase (wave 2). |

The backlogs, progress files and wave folders are saved in the main checkout at `.work/2026-11-19-fix-programs/state/`. That folder is local and not in git.

## How to resume
1. **Branch:** keep working on `p15-fix-programs`, or branch three program branches from it.
2. **Worktrees:** make them with `node scripts/worktree.mjs add <slug> --link-node-modules`.
3. **State:** copy each `state/2026-11-19-fix-<program>*` folder into its worktree's `.work/`.
4. **Launcher and watchdog:**
   - Point `launch.sh` and `watchdog.sh` at the new worktrees.
   - Remove the old `session-*.id` files, so each program starts fresh from its `progress.md` and `backlog.md`.
   - Re-enable the task: `schtasks /Change /TN FixProgramsWatchdog /ENABLE`.
5. **Usage advice from the halt:** the three programs share one account usage limit. In 9 hours they used a full 5-hour window, and they would likely reach the weekly limit within days. Run waves lighter: build, test, then one judge. Use a cheaper model for builders and explorers. Consider one or two programs at a time.

## Owner steps raised so far
- Re-publish the stopgap bed data (`93987631ff` place wire). Production still shows 243 measured beds.
- After merge, pull the publish guard on the box.
- Apply migration 078 when wave 1 merges.
- The AI owner checks in `.work/2026-11-17-ai-north-star/handoff.md`.

## Undo
Nothing reached `main`. Deleting the branch `p15-fix-programs` removes the run's code.
