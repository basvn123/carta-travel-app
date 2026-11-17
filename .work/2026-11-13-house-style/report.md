# Run report: a full custom house style, and every screen rebuilt in it

- **Status:** paused (in progress: page lanes running; resumes automatically)
- **Date:** started 2026-11-13, this snapshot 2026-11-16
- **Level and playbook:** L2 · crew:design over crew:deep-task, run by an orchestrator session with headless lanes
- **Run folder:** `.work/2026-11-13-house-style/` (only this report is tracked)
- **ROADMAP items:** G1 (design direction), with G2, G3, G5, G6, G8, G9, G10, G11, G14 touched by the lanes

## Summary so far
The owner asked for a complete, original house style (no AI slop, background graphics, signature elements), a rewritten DESIGN.md and PRODUCT.md, and every screen rebuilt and judged, using the crew system with separate sessions per area. Mid-run the owner added: interactions that feel alive with a haptic tick; phone, tablet and desktop always checked; visual only with no logic removed; keep the umber brown; minimal text; modern and unique; rich motion; automatic restarts after limits; and the owner picks the direction from a comparison.

Done:
1. **Alignment research:** eight explorers (current UI with 225 screenshots, craft principles, toolkit of skills and MCPs, references, brand world, technical constraints and lane ownership, user jobs per screen, interaction and web haptics), files `explore-*.md`.
2. **Directions:** three (Waymark, Line, Ledger) built as working HTML prototypes, seven critics, one revision, three judges; then a second round under the owner's new rules, three judges (Waymark 104.7 of 135 on average, Ledger 100.7, Line 96.7). Comparison published: https://claude.ai/artifact/MeJ7Eh6cJa8RZFENMtKmRN.
3. **Decision** (`decision.md`, 2026-11-15): the owner picked a combination: Waymark as the base, in Line's brown and beige colours, with Line's rail cards and price formation, rounder.
4. **Foundation lane** (branch `p15-housestyle`, worktree `wt/housestyle`): tokens, Overpass type, kit, house parts (blaze, signpost plate, Score plate, price formation, rails, relief from real peaks), interaction kit with haptics and a "Vibrate on tap" setting, shell at three widths, map colours, style guide, one vocabulary in six languages, DESIGN.md, PRODUCT.md, the carta-design skill, `docs/design/craft-guide.md`, decision 0012. Judged by its own two judges (to 107 of 135) and three orchestrator judges (102, 103, then 109 of 135 after a fix round of 8 blocking items); the last doc item fixed by the orchestrator (1bc221b9de). Checks: no new test failures in the sparse checkout, lint 0, design-lint 0 new, contrast 0 under the floor, axe 0, width sweep clean.

Running:
- **Wave 1:** the explore lane (`p15-hs-explore`, started 2026-11-16 06:28). Place and trip start when there is disk and memory room (the owner was asked to reboot to shrink a 41 GB pagefile).

Still to do: waves 1 to 3 (explore, place, trip; plan, outdoors, account; home, brand), orchestrator judges per lane, integration (merges, css-routes hold, lint baseline, staged public/ files with the owner's OK), final judges at three angles, home clips re-recorded, merge to main. No deploy.

## Operations
- Lanes run hidden as headless `claude -p` sessions (`launch.sh`); a Task Scheduler watchdog (`HouseStyleWatchdog`, every 10 min, `watchdog.sh`) resumes any lane that exited or died before writing DONE, with a memory and disk guard; this session's heartbeat continues the run after usage limits.
- Incidents: disk ran to 0 twice under memory pressure (many open Claude sessions, the pagefile grew from 28 to 41 GB); the foundation died silently once (likely a closed console window) and was resumed with its full history; the 5-hour usage limit paused it once and the watchdog brought it back.

## Files changed
Changes by this session outside the run folder (the lanes' own files are listed in their reports under `wt/*/.work/2026-11-13-hs-*/report.md`).

| File | What changed | Why |
|---|---|---|
| `.git/worktrees/hs-explore/info/sparse-checkout` | Sparse patterns for the explore lane's worktree: everything except `cache/` and the `continent-app/public/` data folders (fonts and home kept) | Disk was nearly full; the lane reads the data from the main checkout through `serve_lane.mjs`, so its worktree is 247 MB instead of about 1.3 GB |
| `.git/worktrees/housestyle/info/sparse-checkout` | Sparse patterns for the foundation's worktree (public data folders excluded) | Same reason |
| `.claude/skills/carta-design/references/shared-product-rules.md`, `explore.md`, `account.md` (on branch `p15-housestyle`, commit 1bc221b9de) | The unit is said once ("A day, a person"); the Score is the ink plate | The re-check judge found these references contradicting DESIGN.md and PRODUCT.md |
| `C:/Users/Gebruiker/Documents/Portfolio/wt/hs-watchdog.cmd`, `hs-watchdog.vbs` (outside the repo) | Wrappers that run the lane watchdog hidden from Task Scheduler | Automatic restarts after usage limits and silent deaths, as the owner asked |

## How to undo
Nothing is merged into `main` yet. Delete the branches `p15-housestyle` and `p15-hs-*` (after `node scripts/worktree.mjs remove <slug>` for each worktree), and the scheduled task (`schtasks /Delete /TN HouseStyleWatchdog /F`).

| `.git/worktrees/hs-place/info/sparse-checkout` | Sparse patterns for the place lane's worktree | Disk nearly full; data read from the main checkout |
| `.git/worktrees/hs-trip/info/sparse-checkout` | Same for trip; checkout failed at 0 bytes free and the worktree was removed again | Trip waits for disk room |
| `.git/worktrees/hs-plan/info/sparse-checkout` | Sparse patterns for the plan lane's worktree (no cache, no public data folders) | Disk is tight; the lane reads data from the main checkout |
| `.git/worktrees/hs-outdoors/info/sparse-checkout` | Sparse patterns for the outdoors lane's worktree (no cache, no public data folders) | Disk is tight; the lane reads data from the main checkout |
| `.git/worktrees/hs-account/info/sparse-checkout` | Sparse patterns for the account lane's worktree (no cache, no public data folders) | Disk is tight; the lane reads data from the main checkout |
| `.git/worktrees/hs-home/info/sparse-checkout` | Sparse patterns for the home lane's worktree (no cache, no public data folders) | Disk is tight; the lane reads data from the main checkout |
| `.git/worktrees/hs-brand/info/sparse-checkout` | Sparse patterns for the brand lane's worktree (no cache, no public data folders) | Disk is tight; the lane reads data from the main checkout |
