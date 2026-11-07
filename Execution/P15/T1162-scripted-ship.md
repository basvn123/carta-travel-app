# T1162: One scripted ship and a stable toolbox

ROADMAP item H11 (audit P-18, P-19). Round 2 session S78, batch 8. Branch `p15-s78-scripted-ship`.

## Date

2026-11-07

## What changed

The deploy is now one command that stops on the first failed step: `node scripts/ship.mjs` runs CLAUDE.md's six deploy steps (`build`, `css`, `data`, `preview`, `main`, `prune`) in order, prints a `--live --from <step>` line to resume after a fix, and is a dry run unless `--live` is given. A dry run runs the two steps that cannot touch the site for real (the fast build and the css-routes proof on it) and prints the data, deploy and prune commands. A live ship refuses to start off `main`, with changed tracked files or under 1.5 GB free disk; the prune keeps its typed "delete". The css-routes proof now runs inside `npm test` (a fast build into a temp folder, then `css-routes.mjs --check`, about 12 s), so CI catches a route rule that could change a screen before a ship does; before, it ran only in `npm run ci`, which CI does not call. `scripts/worktree.mjs` makes and removes task worktrees: remove unlinks every directory link (a junction on Windows) on its own, checks each target kept its entries, and only then calls `git worktree remove` and `git worktree prune`. It refuses the main checkout and any path git does not list. Every Python script the pipeline driver starts now runs in UTF-8 mode (`PYTHONUTF8=1`), and so do `run_pipeline.bat` and `scripts/stays_scrape.bat`. Ship and the worktree script both warn when the stale `continent-app/.git` exists. Removing that folder on the laptop is an owner step.

## Research

A research subagent compared the options on 2026-11-07. Versions come from `npm view` that day.

| Need | Options | Choice and reason |
|---|---|---|
| Ship runner | Plain Node `.mjs` with `spawnSync` (built in); zx 8.8.5 (Apache-2.0, a dependency, its `$` wants bash on Windows); just 1.59.0 (CC0, a binary, needs a shell on Windows); make (GPL, not on the Windows laptop); npm-run-all2 9.0.4 (MIT, stops on failure but has no dry run, awkward arguments); Taskfile / go-task 3.54.0 (MIT, a binary, has `--dry`) | **Plain Node.** It adds no dependency, behaves the same in PowerShell, Git Bash and CI, and matches `build-pages.mjs`. On Windows, `npm` and `npx` need `shell: true`, which the script sets for those two only. |
| Worktree remove with junctions | `git worktree remove --force`, Git Bash `rm -rf` and PowerShell `Remove-Item -Recurse` have all been reported to follow NTFS junctions and delete the target; `cmd /c rmdir` needs backslash paths; Node 22's `fs.lstatSync().isSymbolicLink()` is true for a junction and `fs.unlinkSync` / `fs.rmdirSync` remove the link only; whether `fs.rmSync({ recursive })` follows junctions is undocumented | **Plain Node.** Remove each link with `unlinkSync` (falling back to `rmdirSync`), check that the target is intact, and only then run `git worktree remove`. `rmSync` and `--force` are never used on a tree that still has a link in it. |
| UTF-8 for Python | `PYTHONUTF8=1` (PEP 540) is read once when the interpreter starts. Setting it in the parent's `os.environ` reaches every child, not the parent itself. PEP 686 makes it the default in Python 3.15. | **Set it in the launchers** (`.bat`) for the parent, and in `run_cmd`'s child env for every step. |

Sources: [PEP 540](https://peps.python.org/pep-0540/), [PEP 686](https://peps.python.org/pep-0686/), [zx 8.5.0 notes](https://newreleases.io/project/github/google/zx/release/8.5.0), [Node commit moving rmSync to C++](https://github.com/nodejs/node/commit/7168295e7a), [node-gyp avoiding junctions on delete](https://github.com/nodejs/node-gyp/commit/cceb6d9c9080a0db6a89201748dd0a564feea605). Public reports that git worktree remove and recursive deletes destroyed junction targets: [1](https://claudeissues.com/issue/84162-bug-worktree-cleanup-is-unsafe-on-windows-git-worktree-remove-force-destroys-ntf), [2](https://claudeissues.com/issue/60604-windows-agent-created-node-modules-junctions-from-git-worktrees-cause-source-fil), [3](https://claudeissues.com/issue/75275-windows-stale-worktree-cleanup-rm-rf-traverses-ntfs-junctions-and-deletes-data-o).

## Files touched

- Created: `scripts/ship.mjs`, `scripts/worktree.mjs`, `scripts/toolbox-checks.mjs` (the stale `.git` and disk checks both use).
- Created tests: `continent-app/tests/ship.test.mjs` (9), `continent-app/tests/worktree.test.mjs` (6), `continent-app/tests/cssRoutes.gate.test.mjs` (1), `tests/test_run_pipeline_utf8.py` (2).
- Modified: `run_pipeline.py` (`run_cmd` child env), `run_pipeline.bat`, `scripts/stays_scrape.bat`.
- Docs: `docs/HANDBOOK.md` (Deploy, and CI and checks), `ROADMAP.md` (H11 status), `Execution/_OPEN.md` (rows appended).
- `continent-app/package.json` needed no change: the `test` script's glob `tests/*.test.mjs` already picks up the new test files.

## Commands run

```
node scripts/ship.mjs                      # dry run, exit 0
node scripts/ship.mjs --fail-at css        # seeded failure, exit 1, stops at css
node scripts/ship.mjs --live --from nope   # unknown step, exit 2, nothing ran
node scripts/ship.mjs --live               # refused at preflight (branch, dirty tree), exit 1, nothing ran
cd continent-app && npm test
python -m pytest tests -q -rs <quarantine deselects>
ruff check --select E9,F63,F7,F82 run_pipeline.py tests/test_run_pipeline_utf8.py
npx eslint tests/ship.test.mjs tests/worktree.test.mjs tests/cssRoutes.gate.test.mjs  (and --no-ignore on copies of the three scripts)
```

No deploy, no R2 write and no migration ran. The one `--live` call was a check that preflight refuses a branch other than `main`, and it stopped before the first step.

## Config and secrets set

None. New optional variables: `CARTA_WT` sets the worktree folder, and `CARTA_SKIP_CSS_ROUTES=1` skips the css-routes test in a quick local loop (CI never sets it).

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Commands the owner types for a deploy | 6 (CLAUDE.md Deploy) | 1 (`node scripts/ship.mjs --live`), plus the prune's typed "delete" | -5 |
| Deploy stops on a failed step | no (each step started by hand) | yes: proven by the seeded failure and 9 unit tests | |
| css-routes proof in CI's `npm test` | 0 | 1 test (942 route selectors checked, all route-only) | +1 |
| `npm test` tests / failed / time | 1,729 / 0 / 130 s | 1,745 / 0 / 139 s | +16 tests, +9 s |
| Ship dry run, end to end | did not exist | about 13 s (fast build 3 s, css-routes 9 s) | |
| `sys.flags.utf8_mode` in a pipeline child script | 0 | 1 | |
| Worktree remove with a linked node_modules: canary file in the target | not tested | survives (Linux symlink; the Windows junction run is T1162-b) | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first background `npm test` run exited 127 | `/usr/bin/time` is not installed in the container | Timed it with the shell instead. The run was not lost: the test result came from the rerun. |
| eslint skipped the three new root scripts | Files outside `continent-app/` are outside eslint's base path, and the app's config ignores `continent-app/scripts/` | Linted copies with `--no-ignore`: 0 problems. |
| 2 pytest failures: `test_beauty_v2_reads_no_register`, `test_adding_places_moves_nobody_else` | Both read `cache/*.json` files that are Git LFS pointers in this cloud checkout (for example `cache/dest_pageviews.json` is 130 bytes). This task touched none of the files they import. | None here. They pass where the LFS objects exist. Reported to the round lead in this report. |

Which What broke causes a script now closes (audit P-19 clusters):

| Cluster (count) | Cause | Closed by |
|---|---|---|
| encoding (47) | Python on Windows defaults `open()` and pipes to cp1252, and a town id outside it crashes a log line (`gem:hafnarfjorður`, T741) | `PYTHONUTF8=1` in `run_pipeline.bat`, `stays_scrape.bat` and every `run_cmd` child |
| worktrees (33) | `git worktree remove` and recursive deletes followed the node_modules junction into the main checkout. `cmd /c rmdir` with a forward-slash path failed first. | `scripts/worktree.mjs remove` unlinks links alone, checks the targets, then calls git. No shell `rmdir` is involved. |
| deploy (P-18: 115 css-routes problems found at T1040's ship) | The css-routes proof ran only at deploy time | The proof runs in `npm test` on every push |
| stale nested repo (P-19) | `continent-app/.git` shows false changes and swallows commits | Ship and the worktree script warn. Removal is owner step T1162-a. |
| heredoc quoting (44) | Bash heredocs eat backslashes and backticks | Not a script fix. It is a session rule ("files via Write or Python only"). Row T1162-e proposes adding it to CLAUDE.md. |
| flaky tests (22) | Mostly dev-server timeouts and a shared Vite cache | Not closed here. The shared cache is row T162-d. The worktree script prints the hint when it links node_modules. |

## Screens checked

None. Nothing a traveller sees changed.

## What is still open

- T1162-a (owner): delete the stale `continent-app/.git` on the laptop. Only the owner's checkout has it; this container has none.
- T1162-b (owner): run the worktree script once on Windows with a junction and a canary file. The tests prove it with a Linux symlink only, and junction behaviour is the point.
- T1162-c (owner): use `scripts/ship.mjs` for the next deploy, dry run first, and report any step that differs from the laptop.
- T1162-d (next task): CLAUDE.md's Deploy line still lists the six commands by hand. Point it at `node scripts/ship.mjs` and add `scripts/worktree.mjs` to "Disk and worktrees". CLAUDE.md was outside this task's files.
- T1162-e (next task): the heredoc cluster (44) needs a written rule in CLAUDE.md ("write files with Write or Python, never a Bash heredoc"), not a script.
- T1162-f (next task): the other Python launchers do not set `PYTHONUTF8=1`: the `pipeline/*.ps1` launchers, `scripts/stays_scrape_task.ps1`, and the box's `infra/hetzner/cax11/run_pipeline.sh`, which S77 owns this batch. Linux defaults to UTF-8, so the risk is on Windows.

## Owner steps (for the checklist)

- [T1162-a] Delete the stale continent-app/.git | it shows hundreds of false changes and a commit made there is lost; ship and worktree.mjs warn while it exists | in the root checkout run `git -C continent-app log -1 --oneline` to confirm it is the T915 master with no remote; delete the folder `continent-app\.git` (only that folder); run `node scripts/ship.mjs --check` and see "no stale continent-app/.git" | Execution/P15/T1162-scripted-ship.md
- [T1162-b] Prove worktree.mjs on Windows with a junction | junctions are where the old deletes happened, and this container could only test symlinks | run `node scripts/worktree.mjs add t1162-proof --base main --link-node-modules`; note the count of `continent-app\node_modules` entries in the main checkout; run `node scripts/worktree.mjs remove t1162-proof --force`; check the count is unchanged and delete the branch `p15-t1162-proof` | scripts/worktree.mjs
- [T1162-c] Ship the next deploy with the script | one command that stops on any failed step replaces six by hand | from the root checkout on main run `node scripts/ship.mjs` (dry run) and read the warnings; run `node scripts/ship.mjs --live`; if a step fails, fix it and rerun with the printed `--from <step>`; type "delete" at the prune | scripts/ship.mjs

## Rollback procedure

`git revert` the T1162 commits on `p15-s78-scripted-ship` (or on the batch branch after the merge). Nothing is one way: no data, deploy or migration ran.
