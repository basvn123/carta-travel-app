# T1034: free the disk and slim the repo for fewer tokens per session

## Date

2026-11-03

## What changed

The disk went from 4.9 GB free to 31.0 GB free, and every session now reads far less. About 40 finished task worktrees (21.8 GB in `Portfolio/wt/`, 1.7 GB in `.claude/worktrees/`), the deploy staging copy `continent-app/dist-data` (1.07 GB) and 624 loose screenshots in `continent-app/shots` (283 MB) were deleted after their 84 junctions into the live app were unlinked one by one; the live `continent-app/public` (52,284 files), `node_modules` (21,356) and `supabase` (103) counts were unchanged before and after. In the repo, the 469 reports of P0 to P14 are folded into one `_DIGEST.md` per phase (title, date, what changed, what broke, and the `git show` command for the full original), all 1,118 screenshots leave `Execution/`, eight finished plans move to `archive/plans/`, `_OPEN.md` keeps only its 1,534 open rows (the 1,040 closed ones move to `_OPEN-CLOSED.md`), and `CLAUDE.md` becomes one short page with a map of where things are. Everything removed from the tree stays in git under the tag `archive/execution-full-2026-11-03`.

## Files touched

Created: `Execution/P{0..13}/_DIGEST.md`, `Execution/_OPEN-CLOSED.md`, `scripts/vite.fast.mjs`, `scripts/execution_digest.py`, `MAP.md`, this report.

Modified: `CLAUDE.md`, `Execution/_TEMPLATE.md`, `Execution/_OPEN.md`, `.gitignore`, `archive/README.md`, `Execution/_OWNER-RUNBOOK.md`, `docs/ARTICLE30.md`, `docs/GTM-ACQUISITION-CONSTRAINT.md`, `docs/INCIDENT_RUNBOOK.md` (links to the moved plans).

Moved to `archive/plans/`: `PARALLEL-WAVES-PLAN.md`, `CHANGELOG-explore-v4.md`, `CARTA_CLAUDE_CODE_PROMPTS.md`, `cats.txt`, `dest_sample.txt`, `Execution/_WAVES.md`, `Execution/_OPEN-MASTER.md`, `Execution/_ORDER.md`.

Deleted from the tree: 469 reports and every other file under `Execution/P0` to `P14` except `_OPEN-*.md`; every image under `Execution/` (P15 included); `Execution/_queue/logs/` and `__pycache__/`.

Deleted from disk only (never tracked): `Portfolio/wt/`, `.claude/worktrees/`, `continent-app/dist-data/`, `continent-app/shots/`. `cache/sea_temp/` (304 files) was copied into the main `cache/` first, the one cache folder that existed only in a worktree.

## Commands run

```
git tag archive/execution-full-2026-11-03 main
git worktree add --no-checkout -b p0-repo-slim ../slim-T1034 main   # sparse, text only
cmd /c "rmdir <link>"            # each of the 84 junctions, link only
robocopy <empty> <dir> /MIR /XJ ; rmdir /s /q <dir>   # wt, .claude\worktrees, dist-data, shots
git worktree prune               # root and continent-app
python -I scripts/execution_digest.py Execution archive/execution-full-2026-11-03 P0 ... P14
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| C: free | 4.9 GB | 31.0 GB | +26.1 GB |
| Registered worktrees (root + app) | 40 | 0 besides the main checkouts | -40 |
| Markdown files in `Execution/` | 675 | 213 | -462 |
| Markdown bytes in `Execution/` | 8.4 MB | 2.75 MB | -67% |
| Images tracked in `Execution/` | 1,118 (333 MB) | 0 | -1,118 |
| `_OPEN.md` (read every task) | 660 KB | 376 KB | -43% |
| `CLAUDE.md` (read every session) | 12.8 KB | 9.3 KB plus a map | -27% |
| Fast build | config rewritten per task in `wt/` | `scripts/vite.fast.mjs`, 10 s, exit 0 | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Sparse worktree checked out nothing under `Execution/` | Git Bash rewrote `/Execution/` in `git sparse-checkout set` into `C:/Program Files/Git/Execution/` | Wrote `info/sparse-checkout` directly with printf and ran `git sparse-checkout reapply` |
| `--no-checkout` worktree had an empty index | `git checkout` of the same branch is a no-op | `git reset -q --hard HEAD` in the brand-new worktree |
| `du` over the repo ran past 10 minutes | Hundreds of thousands of files under `wt/` | `robocopy <dir> NULL /L /S /XJ /BYTES` sizes the same tree in seconds |

## Screens checked

None: no app code changed. The fast build of the live app was run once to check `scripts/vite.fast.mjs`.

## What is still open

The tag `archive/execution-full-2026-11-03` exists only locally until the owner pushes it (`git push origin archive/execution-full-2026-11-03`); without it the digests' `git show` lines only work on this machine. Git history still holds the old screenshots and reports (packs 1.42 GB); getting that back means rewriting history and force-pushing, an owner decision with real risk. The app repo was left alone because other sessions had uncommitted work on its `master`: its three September `CARTA_*.md` prompt files, `bash.exe.stackdump` and its 93 tracked images are for a later task. `_OPEN.md` still has 1,534 open rows, many likely stale, and needs a triage task. P15 is the active phase and keeps full reports; fold it with `scripts/execution_digest.py` when it closes. `Execution/_queue/waves_md.py` still writes `Execution/_WAVES.md` if run (the waves are finished). Two branches whose worktrees were removed are not merged and still exist: `p0-next-steps-docs` (4 commits) and `p11-flights-to-august` (root 2, app 1). `logs/` (51 MB) and `continent-app/dist` (97 MB) stay because sessions were using them.

## Rollback procedure

`git revert` the T1034 commits on `main` (the merge commit with `-m 1`). Every removed report and screenshot is at `archive/execution-full-2026-11-03`. The deleted worktrees cannot be restored as folders, but all their branches and commits are in git: `git worktree add <path> <branch>` recreates any of them. `dist-data` is rebuilt by `node scripts/build-pages.mjs`.
