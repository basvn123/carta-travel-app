# Run report: a full custom house style, and every screen rebuilt in it

- **Status:** done (on `main`; one owner step left: copy the staged icons, manifest and home clips into the protected `public/` folder with `apply-public.ps1`)
- **Dates:** 2026-11-13 to 2026-11-17
- **Level and playbook:** L2 · crew:design over crew:deep-task, run by an orchestrator session with eleven headless lanes
- **Run folder:** `.work/2026-11-13-house-style/` (only this report is tracked)
- **ROADMAP items:** G1 (done), with G2, G3, G5, G8, G9, G10, G14 advanced by the lanes
- **On main:** fast-forward from `7d4e7c98d8` to the house style (2026-11-17), CI green (app, python, evals, csp, edge). **Deployed to production 2026-11-17** (owner asked): shell only, from a clean worktree of `main` (`b7d156fd24`) with the live `boot.json` and Ask Carta index taken from production; preview checked first; data on R2 untouched (no data push, no prune). Live check: house style at 390 and 1440, 48 places, no page errors, Ask answers, CSP headers present.

## What the owner asked
A complete, original house style ("no AI slop whatsoever", background graphics, signature elements), DESIGN.md and PRODUCT.md completely redesigned, every page optimized and clear, checked by multiple judges, using the crew system with separate sessions per area. Added on the way: interactions that feel alive with a haptic tick; phone, tablet and desktop always checked; visual only, no logic or function removed (Ask Carta included); keep the umber brown; minimal text; modern but unique; rich motion; automatic restarts after usage limits; the owner picks the direction from a comparison; the app will be renamed (name-free identity).

## How it ran
1. **Alignment research** (8 explorers, files `explore-*.md` in the run folder): the current UI with 225 screenshots, craft principles (a reusable guide), the skills and MCP toolkit, references, the European travel brand world, technical constraints and lane ownership, user jobs per screen, interaction and web haptics.
2. **Directions:** round 1, three working HTML prototypes (Waymark, Line, Ledger), seven critics, one revision, three judges. The owner's remarks changed the rules; round 2 redid all three under them, three judges (Waymark 104.7 of 135 on average, Ledger 100.7, Line 96.7). Comparison page: https://claude.ai/artifact/MeJ7Eh6cJa8RZFENMtKmRN.
3. **The owner's pick** (`decision.md`): Waymark as the base, in Line's brown and beige colours, with Line's rail cards and price formation, rounder; two reference screenshots in `owner-refs/`.
4. **Foundation lane:** tokens, Overpass type, the kit and the house parts (blaze, signpost and Score plates, price formation, rails, relief from real peaks), the interaction kit with haptics and a "Vibrate on tap" setting, the shell at three widths, map colours, style guide, one vocabulary in six languages, and the new DESIGN.md, PRODUCT.md, carta-design skill, `docs/design/craft-guide.md` and decision 0012. Five judges in total; one fix round of eight blocking items.
5. **Eight screen lanes** (explore, place, trip, outdoors, plan, home, brand, account), each a crew:design deep task in its own worktree, each judged by its own judge and then by two fresh orchestrator judges; fix or polish rounds where they blocked; merged one by one.
6. **Integration lane:** every lane's kit requests and every "fix at integration" item, leftovers of the old look, docs made to agree, the whole app shot at three angles, CI.
7. **Final judges** (three seats: traveller, design director, engineering): one blocking defect (Ask Carta's place rows), generic panels on a few screens, `main` had moved on. The **polish lane** fixed them in three rounds; the **clips lane** re-recorded all 54 home tour clips (9 chapters, 6 languages). Two re-check judges: 111 and 109 of 135, each blocking only on bookkeeping (the clips merge, two reference docs), both done.

## Scores (orchestrator judges, of 135)
| Area | Final judgement |
|---|---|
| Foundation | 109 (after a fix round) |
| Explore | merged after a fix round (re-check: Merge yes) |
| Place | 111 and 111 |
| Trip and day planner | 108 and 109 (one bug fixed by the orchestrator) |
| Outdoors | 108 and 103 |
| Plan | 113 (after a polish round; one honesty fix) |
| Home | 110 (after a fix round) |
| Brand surfaces | 115 (after a fix round) |
| Account | 106, about 111 after the orchestrator's honesty fix |
| Whole app, final re-check | 111 (product) and 109 (engineering) |

Every final judgement scored criterion 11 ("every function intact") at 5.

## Checks at the end
CI on `p15-housestyle` and on `main`: green. Locally on the final merge: `npm test` 2,141 tests, 23 fail, all pre-existing (Windows paths and the sparse worktree without `public/`; green on Linux); eslint 0 errors; design-lint 0 new (baseline regenerated at the foundation and the integration); token-contrast 0 under the floor; axe 0 serious or critical on every audited screen; width sweeps 360 to 1920 clean; fast build ok. `docs/SCHEMA.md` drift is the known CRLF false alarm in a Windows worktree (the file was not touched).

## Operations
Lanes ran hidden as headless `claude -p` sessions (`launch.sh`). A Task Scheduler watchdog (`HouseStyleWatchdog`, every 10 minutes, `watchdog.sh`) resumed lanes after usage limits, silent deaths and idle hangs; this session's heartbeat continued the run after its own limits. Incidents: the disk ran to 0 twice (many open Claude sessions grew the pagefile from 28 to 41 GB); a lane in a visible console died when the window closed (lanes then ran hidden); lanes idled alive after a limit message (the watchdog learned to restart them); a long overnight limit window paused three lanes for hours. Four lessons went into `docs/lessons.md`.

## Files changed
The lanes' changes are listed in their own reports (`.work/2026-11-13-hs-<lane>/report.md`, tracked). Changes by this session:

| File | What changed | Why |
|---|---|---|
| `ROADMAP.md` | G1 done with its follow-ups | The run closes G1 |
| `docs/project-map.md` | The craft guide and the house parts in the docs table | New entry points |
| `docs/lessons.md` | Four lessons (hidden lanes and the session-id check, the 40-turn crew limit, the pagefile and open sessions, design-lint baselines on Windows) | Mistakes not to repeat |
| `.work/INDEX.md` | The run's line | Run history |
| `docs/owner/product-decisions.md`, `docs/owner/README.md` | Seven owner calls HS-a to HS-g | Logic or rule decisions left open by a visual-only run |
| `.claude/skills/carta-design/references/shared-product-rules.md`, `explore.md`, `account.md` | The unit said once; the Score as the ink plate | A judge found them contradicting DESIGN.md |
| `continent-app/src/planner/TripSummary.css` | The old arc rule no longer reaches the train's icons | Blocking bug found by a trip judge |
| `continent-app/src/auth/mytrips/SavedTab.jsx` | The Saved unit head follows the traveller's price view | Honest numbers, found by an account judge |
| `continent-app/scripts/verify_destination_page.mjs` | Accepts the house Explore row link (same `#dest=` behaviour) | The check waited for removed markup |
| `.git/worktrees/housestyle/info/sparse-checkout` | Sparse patterns for the foundation and integration worktree | The disk was nearly full; lanes read data from the main checkout through `serve_lane.mjs` |
| `.git/worktrees/hs-explore/info/sparse-checkout` | Sparse patterns (no `cache/`, no `public/` data folders) | Same reason |
| `.git/worktrees/hs-place/info/sparse-checkout` | Same patterns | Same reason |
| `.git/worktrees/hs-trip/info/sparse-checkout` | Same patterns; a first trip checkout failed at 0 bytes free and was removed and made again | Same reason |
| `.git/worktrees/hs-plan/info/sparse-checkout` | Same patterns | Same reason |
| `.git/worktrees/hs-outdoors/info/sparse-checkout` | Same patterns | Same reason |
| `.git/worktrees/hs-home/info/sparse-checkout` | Same patterns | Same reason |
| `.git/worktrees/hs-brand/info/sparse-checkout` | Same patterns | Same reason |
| `.git/worktrees/hs-account/info/sparse-checkout` | Same patterns | Same reason |
| `.git/worktrees/hs-polish/info/sparse-checkout` | Same patterns | Same reason |
| `C:/Users/Gebruiker/Documents/Portfolio/wt/hs-watchdog.cmd`, `hs-watchdog.vbs` (outside the repo) | Run the lane watchdog hidden from Task Scheduler | Automatic restarts |

## Open items
- **Owner step now:** run `.work/2026-11-13-house-style/apply-public.ps1` (copies the name-free icons, the manifest colours and the 54 home clips into `continent-app/public/`, commits on `p15-housestyle`, fast-forwards `main`).
- **Owner calls** HS-a to HS-g in `docs/owner/product-decisions.md`: booked counts, cents on the trip total, phone rail card width, mountain relief, CSP hashes at the next deploy, the new name, a real-phone haptics check.
- **Engineering follow-ups** (ROADMAP G1 follow-ups): remove `@phosphor-icons/react` (no readers left; needs a lock-file update), the page title vs the OG check, the trip `CostTrain` onto the kit Formation (G3), `verify_beaches` waits for markup `origin/main` no longer renders.
- **Clean-up after the owner step:** delete the scheduled task (`schtasks /Delete /TN HouseStyleWatchdog /F`) and remove the worktrees `wt/housestyle` and `wt/hs-polish` with `node scripts/worktree.mjs remove <slug>`.

## How to undo
`main` was fast-forwarded from `7d4e7c98d8`. To undo the whole house style, revert the lane merge commits on `main` (`git revert -m 1 <merge>`, newest first), or merge a branch made from `7d4e7c98d8` back with the house style reverted. No data or schema change was made; the protected `public/` folder is untouched until the owner runs the script. Each lane's merge commit can be reverted on its own.
