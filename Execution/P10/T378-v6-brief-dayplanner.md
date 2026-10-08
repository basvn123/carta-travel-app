# T378: design brief for the Day planner

## Task ID

T378 (design wave V1, session 9 of 10; no mind-map prompt exists for it)

## Date

2026-10-08

## What changed

The Day planner now has a written brief, `docs/design-v6/briefs/dayplanner.md`, that the build waves V3, V4 and V5 work from. No app code changed. The brief walks the surface as the traveller in `docs/design-v6/TRIP-PLANNING-RESEARCH.md` would, at 380 and 1280 px, from a cold start (the four-step landing, Rome, through the fork into the builder) and from a returning visit (a saved Salzburg day opened into the workspace with its three tabs, popovers, exports and the Carta bot). It inventories every view, state, control and visual setting with a verdict (198 distinct controls counted once per repeated group, plus 36 states), scores the surface 24 of 40 on Nielsen's heuristics and 11 of 20 on impeccable's technical audit, and plans 11 V3 items, 7 V4 items and 8 V5 items, each with its files, the impeccable command and a done check, ending in a target-state control table and the full list of files the build waves touch. Seven proposals carta-design does not cover yet are listed for T380 to accept or reject.

The mode is Operate: the traveller builds one day and then follows it on a phone. The main finding is that the day planner, in a price tool, shows no price: the workspace's figures are stops, steps and a finish time, and no euro figure appears anywhere in the workspace or the builder except a day-trip fare. The other priority issues are that on a phone the first stop starts at about 670 px of 800 under ten controls and the floating Carta bot, with the export menu opening off screen; that the builder prints "2 places, about 0 steps" after two towns are picked; that the accent is spent on about 40 non-primary rules while the first screen's only filled button is "Sign in"; and that the tab, menu and dialog roles are half built. Two harnesses (`verify_day_workspace`, `verify_day_overview`) cannot open a plan any more because the card class they look for no longer exists.

Mode choice and the autonomy substitution: the run is unattended and the owner told every session to proceed (2026-10-07), so impeccable's shape and critique questions were answered from PRODUCT.md, the research and carta-design instead of asked, always taking the option that keeps Carta's palette, type and identity (refinement, not redesign).

## Files touched

Created:
- docs/design-v6/briefs/dayplanner.md
- Execution/P10/T378-v6-brief-dayplanner.md

Modified:
- Execution/_OPEN.md (rows T378-a to T378-f appended)

Outside both repos, never committed: eight before screenshots in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\dayplanner\` (V1-landing-380, V1-landing-1280, V1-fork-380, V1-builder-1280, V1-returning-380, V1-workspace-380, V1-workspace-1280, V1-add-380), and the walk script, walk measurements, extra views and harness copies in the session scratchpad folder `T378`.

## Commands run

From the root worktree `C:\Users\Gebruiker\Documents\Portfolio\wt\T378` (branch p10-v6-brief-dayplanner):

    sh "C:/Users/Gebruiker/Documents/Portfolio/Travel App/.claude/skills/impeccable/scripts/impeccable" context --target src/planner/DayPlannerTab.jsx

In sub-agents, read only against the main checkout: a control inventory sweep of the surface files; Assessment A (design review from the source and the screenshots); Assessment B:

    sh ".../impeccable" detect --json <15 surface markup files, quoted absolute paths>
    sh ".../impeccable" detect --json src/styles/13-day-planner.css src/styles/20-day-planner-flow.css
    node scripts/ci/design-lint.mjs        (in the app repo, no flags, writes nothing)

From the scratchpad, against the shared dev server on port 5199 (one browser at a time):

    node walk.mjs flow 380 ; node walk.mjs flow 1280     (landing, flow, fork, builder)
    node walk.mjs ws 380 ; node walk.mjs ws 1280         (returning visit, workspace, tabs, popovers, bot)
    node walk.mjs cold 380 ; node walk.mjs cold 1280     (empty storage)
    node <harness>.5199.mjs                              (copies of the seven day harnesses with the port set to 5199)

## Config and secrets set

None.

## Before/after measurements

This task builds nothing, so these are the before figures the build waves move, and the targets the brief sets.

| Metric | Before (V1) | Target (after V5) | Source |
|---|---|---|---|
| Euro figures for the day in the workspace | 0 | 1 (the day's receipt) | DayPlannerTab.jsx 4021, walk-ws-380.json text |
| First stop row top, 380 x 800 | about 670 px | 420 px or less | walk-ws-380.json inViewNames |
| Controls above the first stop, 380 | 10 | 6 or fewer | walk-ws-380.json |
| Workspace controls under 44 px at 380 (pins apart) | 23 | 0 | walk-ws-380.json under44List |
| Map pins under 44 px hit box | 47 (43 POI, 4 route) | 0 | walk-ws-380.json pinsUnder44 and list |
| Accent-filled controls, step 1 | 1 ("Sign in") | 1 ("Find") | walk-flow-380.json accentFilled |
| h1 in the workspace | 0 | 1 | walk-ws-380.json h1 |
| Builder tray after two towns | "2 places, about 0 steps" | steps plus rides, fit warning | builder-tray-380 |
| Actions offered twice in one view | 3 (Ask Carta, Reorder, go to Add more) | 0 | inventory sweep |
| Dead controls rendered in code | 3 (edit Cancel, two in the saved modal) | 0 | inventory sweep |
| Horizontal scroll, 380 and 1280 | 0 px on every view walked | 0 px at 360, 380, 1280 | walk JSON hscroll |
| Detector findings, 15 markup files | 0 | 0 | Assessment B |
| Detector findings, the two stylesheets | 3 (side-tab 2, bounce-easing 1) | 0 | Assessment B |
| Design lint new violations | 0 (213 baselined) | 0 | design-lint.mjs |
| Hard-coded English strings on the surface | 16 in the UI, the DAY_STYLES labels and every string in the three exports | 0 | Assessment B, inventory sweep |
| Nielsen score | 24/40 | not measured until V6 | brief part 4 |
| Technical audit | 11/20 | not measured until V6 | brief part 4 |
| verify_day_landing | 51 checks pass | pass, with the tray assertion changed | scratch run |
| verify_day_start_point | 9 pass | pass | scratch run |
| verify_day_dates | 15 of 16 (built-chunk check needs a build) | pass on a preview build | scratch run |
| verify_day_ideas | 20 of 21 (loaded server) | pass | scratch run |
| verify_day_steps | not completed (timeout) | pass | scratch run |
| verify_day_workspace, verify_day_overview | cannot start (stale selector) | pass | scratch run |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The shared dev server stopped answering for about fifteen minutes | Ten sessions on one server and about 600 MB of free memory; other sessions' servers on 5207 and 5210 hung too | The walk waited (navigation timeout raised to 15 minutes, `waitUntil: 'commit'`) instead of starting an eleventh server; it went through once the server came back |
| The returning-visit walk never found the saved plan | It looked for `.trip-saved-main`, the selector the workspace harness uses; the cards are `.dtcard` now, and at 1280 a hidden twin matched first | The walk uses `.dtcard:visible`; the harnesses keep the stale selector and are left for V3 item 11 (row T378-f) |
| A first measure of under-44 controls counted map pins with buttons | The pins are buttons too | Pins are counted apart (`pinsUnder44`) |
| Photos showed as grey or pink boxes in many shots | Images did not load on the overloaded server | Not judged in the brief; placeholders are named only where the code paints them (`--accent-bg` thumb ground) |

## What is still open

T380 must accept or reject the seven "needs a rule" proposals in part 7 of the brief before V3 builds anything that depends on them (the day's receipt, legs and times, no floating button, the day strip, map pin colours, undo instead of confirm, the day switcher); items that depend on a rejected rule are skipped (T378-a).

The surface's file list names `src/planner/ExpenseLedger.jsx`, which the day planner never draws (only `TripItinerary.jsx` in the trip planner does). And most of this surface's CSS lives outside its two named stylesheets: the workspace in `24-destination-workspace.css`, the builder in `26-shortlist-extras.css`, the chat in `21-chat-passes.css`, the figures line and walk rows in `18-detail-panel.css`. OWNERSHIP.md, written in V2, should give ExpenseLedger to the trip planner and say who edits those shared files (T378-b).

The research asks for opening hours on the day and the brief's cost line would like entry prices; the POI catalogue carries neither, so V3 can only price the bed, food, local transport and day-trip fares and cannot show hours. Adding them is pipeline work outside every design wave (T378-c).

The day's cost needs a basis. The brief prices it from the same cost index as the destination receipt, which T374 found prices a day on two bases (row T374-d). Whatever the owner decides there, the day planner must follow the same figure; this is the owner's call (T378-d).

Legs between stops and arrival times on the rows reverse the August workspace rebuild, which cut clocks and leg distances on purpose at the owner's request. The research says walking time to the next stop carries the screen on the day. V3 item 2 waits for the owner to choose (T378-e).

The day harnesses did not give a baseline: `verify_day_workspace` and `verify_day_overview` look for `.trip-saved-main`, which no longer exists, and the rest ran on an overloaded shared server. V3 item 11 repairs the selector; all seven should be re-run on a preview build before V3 changes the surface (T378-f).

## Rollback procedure

The task adds two documents and six register rows. To undo it, drop the branch before merging (`git branch -D p10-v6-brief-dayplanner` from the main checkout once the worktree is removed), or after a merge revert the merge commit with `git revert -m 1 <merge>`. Nothing in the app repo, the data or production changed. The screenshots outside the repos can be deleted by hand.
