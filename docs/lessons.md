# Lessons

Things learned in Carta that every future run should know. Claude reads this at the start of L1 and L2 work.

- **Add a lesson** when the owner corrects Claude on something it should do differently next time.
- **Promote a lesson** that keeps coming up into `CLAUDE.md`, a hook or a CI check. Then delete it here.
- **Keep it short.** Past about 40 lines, promote or prune. Full stories are in the old reports (`.work/INDEX.md`).

## Lessons
- 2026-11-17 · Launch headless lanes hidden (`Start-Process -WindowStyle Hidden`) and judge them alive by a `claude.exe` that holds their session id, not by their log · (a lane in a visible console died silently when the window closed; a lane that hit a usage limit stayed alive but idle behind a background shell; the house style run's `watchdog.sh` handles both)
- 2026-11-17 · Crew subagents stop after about 40 turns: brief each to write its output file by about turn 20, and resume one that stops with "write your file now" · (a proposer and three judges read for 40 turns and wrote nothing)
- 2026-11-17 · Many open Claude sessions grow the Windows pagefile until the disk is full (28 to 41 GB in a day): close idle sessions before a multi-lane run and run at most three lanes on 16 GB of RAM · (the disk hit 0 bytes twice in the house style run)
- 2026-11-17 · A design-lint baseline regenerated on Windows can drop entries Linux still finds (the `motion-literal` rule and the smooth-scroll check miss backslash paths) · regenerate it on Linux or fix the flagged lines
- 2026-07-18 · Another session may be writing the same data or files. Run `git status` and `git diff` before committing and stage only your own files; re-read a file right before editing it · (a parallel harvest once reset `app_data.json` mid-run)
- 2026-10-28 · Remove app worktrees only with `node scripts/worktree.mjs remove <slug>` · (`git worktree remove` followed the `node_modules` junction and deleted packages in the main checkout, T782; a sparse checkout once deleted 48,037 files of `continent-app/public` through a junction, T818)
- 2026-11-01 · Check free space before a big build or commit; the Visual Studio installer cache in `%LOCALAPPDATA%\Temp` is the usual safe win. Ask before touching `data/raw` · (git commit failed on a full disk twice)
- 2026-11-12 · A worktree checked out with `core.autocrlf=true` has CRLF generated files, so byte-compare checks fail there and not in CI (promptRegistry, pressKit, `wire-table.mjs`, the design-lint baseline): before blaming a change, check `git ls-files --eol <file>` and rerun the check against HEAD's files · (owner sweep round 2 lost time on six such "failures")
- 2026-10-16 · Edit CRLF files with the Edit tool or Python that keeps line endings; after any shell edit check `git diff --stat` · (`sed -i` rewrote a whole file to LF for a one-line change)
- 2026-09-02 · Never edit a PowerShell or Bash driver script while it runs · (the interpreter re-reads the file at the next stage and silently loses its place; ten stages never ran)
- 2026-09-28 · To kill a process tree on Windows, snapshot the descendants while the parent lives · (after it exits, children are reparented and the walk finds nothing)
- 2026-10-23 · Long scrapes and seeds run from Windows Task Scheduler with a runner `.cmd` in `logs/`, not from a Claude background shell · (that shell dies with VS Code and costs tokens when it wakes the session)
- 2026-10-23 · Fix missing Python Playwright browsers with `python -m playwright install chromium chromium-headless-shell`; never `npx playwright install` in a shared env · (the Node install deletes browsers Python still uses; the nightly scrape died)
- 2026-09-01 · When a Workflow dies at a session limit, salvage finished agents from its `journal.jsonl` · (searches and fetches are the expensive part and persist)
- 2026-08-30 · Audit a doc for false claims of coverage ("this is checked") before checking its figures · (a wrong belief about what is checked stops anyone from looking)
- 2026-09-12 · Pair every "all X satisfy P" gate with a non-empty check · (a photo check passed 27 tours that had zero photos)
- 2026-09-01 · A count joined across layers reports our coverage, not the world; word it as an offer, not a claim · ("3 trails nearby" means "3 we publish")
- 2026-09-23 · Measure git history size with `git verify-pack -v`, not `objectsize:disk` · (it under-reported by half and nearly justified a history rewrite)
- 2026-11-11 · Before deleting a folder, grep code, CI, tests and generated docs for its path, and look for live helpers inside it · (`serve-a.mjs`, a server the verify scripts use, lived inside `Execution/`)
- 2026-11-15 · Before deploying a build made anywhere but the laptop, check it carries the gitignored files the app needs (`search/ask/manifest.json`) and call `/api/ask` on preview · (a box build went to production without the Ask Carta index; Ask answered 503 for two days)
- 2026-11-13 · When a network source "refuses", test it from the box per address family (`curl -4` / `curl -6`, its status page) before blaming the source; give connect its own short timeout and bench a host nothing answers on · (one dropped IPv6 address under a 300 s urllib timeout stalled a box run for 48 hours, H9)
