# T379: design brief for My trips, account, sharing, passes, guides and admin

## Task ID

T379 (design wave V1, session 10 of 10; no mind-map prompt exists for it)

## Date

2026-10-08

## What changed

The account surface now has a written brief, `docs/design-v6/briefs/account.md`, that the build waves V3, V4 and V5 work from. No app code changed. The brief walks My trips, the shared trip view, the account hub and its spokes, sign in and the pass modal at 380 and 1280 px, cold and returning; inventories every view, state, control and visual setting with a verdict (224 rows across eleven tables, gathered by three read-only sub-agents and checked against the walk); scores the surface 24 of 40 on Nielsen's heuristics and 13 of 20 on the technical audit; and plans 13 V3 items, 9 V4 items and 9 V5 items, each with its files, the impeccable command and a done check, ending in a target-state control table and the full list of files the build waves touch. Thirteen proposals that carta-design does not cover yet are listed for T380.

The mode is Operate: the traveller comes to do something with what they already found. The main finding is that My trips, the screen PRODUCT.md gives to "returning users with a saved trip who want to see what changed", carries no figure at all: a saved place stores no price (`src/auth/tripStorage.js`:13-24) and no card prints one. The other priority issues are one-tap removals on small targets (withdrawing a share link is one tap on a 25 px icon), an account hub that spends its first two phone screens on the pass upsell and an invite while the accent is spread over counts, icons and chips, and two wrong figures live on the pass surfaces: the Year Pass "Costs the same as 2 Trip Passes" (€14.99 against €13.98) and the FAQ gives the free allowance "a month" when it is two for the life of the account.

## Files touched

Created:
- docs/design-v6/briefs/account.md
- Execution/P10/T379-v6-brief-account.md

Modified:
- Execution/_OPEN.md (rows T379-a to T379-f appended)

Outside both repos, never committed: eight before screenshots in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\account\` (V1-mytrips-planned-380, V1-mytrips-planned-1280, V1-mytrips-visited-380, V1-account-hub-380, V1-account-hub-1280, V1-passes-380, V1-passes-1280, V1-signin-380), and the walk script, its JSON and the harness screenshots in the session scratchpad folder `T379`.

## Commands run

From the root worktree `C:\Users\Gebruiker\Documents\Portfolio\wt\T379` (branch p10-v6-brief-account):

    sh "C:/Users/Gebruiker/Documents/Portfolio/Travel App/.claude/skills/impeccable/scripts/impeccable" context --target src/components/PassModal.jsx
    sh ".../impeccable" detect --json <48 surface files, each path quoted>     (Assessment B sub-agent)

From the app repo in the main checkout, read only:

    node scripts/ci/design-lint.mjs                 (Assessment B sub-agent)

From the scratch folder, against the shared dev server on port 5199 (Bash's curl cannot reach localhost in this sandbox; PowerShell and node can):

    node walk.cjs                                   (screenshots and measurements)
    node walk.cjs mytrips                           (the two 1280 px My trips views that timed out first)
    node <app>/scripts/verify_paywall.mjs
    CARTA_PORT=5199 node <app>/scripts/verify_saved.mjs
    node <app>/scripts/verify_trip_share.mjs        (does not read CARTA_PORT; stopped at "vite preview never came up")

## Config and secrets set

None.

## Before/after measurements

This task builds nothing, so these are the before figures the build waves move, and the targets the brief sets.

| Metric | Before (V1) | Target (after V5) | Source |
|---|---|---|---|
| Saved cards that show a figure | 0 | every card, or "Not priced yet" | walk, STP:263-576 |
| Accent fills in view, My trips empty and signed out | 2 | 1 | walk.json `accentInView` |
| Accent fills on the Profile spoke | 2 | 1 per spoke | walk.json |
| h1 elements per view | 2 (3 signed out; 0 on the shared view) | 1 | walk.json |
| Controls under 44 px, Profile spoke, 380 px | 13 of 18 | 0 (coarse pointer) | walk.json |
| Controls under 44 px, sign-in modal, 380 px | 7 of 8 | 0 (coarse pointer) | walk.json |
| Sideways scroll at 380 px, every walked view | 0 px | 0 px at 360, 380, 390 | walk.json |
| One-tap removals without confirm or undo | 5 (link, co-planner, friend, crew name, star) | 0 | inventory |
| Gradients in the surface's CSS | 2 (baselined) | 0 | design lint baseline |
| Detector findings, 48 files | 1 (false positive) | 0 | Assessment B |
| Design lint new violations | 0 (213 baselined, 10 in this surface's CSS) | 0 | design-lint.mjs |
| Nielsen score | 24/40 | not measured until V6 | brief part 4 |
| Technical audit | 13/20 | not measured until V6 | brief part 4 |
| verify_paywall | pass | pass | run above |
| verify_saved (5199) | 1 FAIL, the stale accent assertion at line 108 | pass | run above |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| curl to the shared dev server timed out three times, so the server looked down | The Bash sandbox blocks localhost; the server was up | Probed with PowerShell, which answered 200; a second Vite started on 5210 meanwhile was stopped at once |
| Two My trips views at 1280 px timed out on the first walk | Ten sessions on one dev server | Walked again with only those steps |
| The guides deep link `#guide=guide-1` never opened the gallery at 380 px | Slow shared server or the hash route on a cold load; not investigated further | Guides, upload, the feedback sheet and admin are described from the code in the brief and said so there |
| verify_trip_share stopped before it ran | It does not read CARTA_PORT and tried to start its own preview, with no dist | Recorded as not run; V3 runs it on a built preview |

## What is still open

T380 must accept or reject the thirteen "needs a rule" proposals in part 7 of the brief before V3 builds anything that depends on them (T379-a).

OWNERSHIP.md, written in V2, must settle the files this surface shares: `src/components/ReportProblem.jsx` is styled by this surface's `42-feedback.css` but rendered on eight other pages; V3 items 1 and 11 need one line each in the shell's `AppHeader.jsx` and `App.jsx`; and a large share of this surface's rules lives in the 12, 14, 23, 24 and 25 stylesheets (T379-b).

"What changed since you saved" cannot be designed until something stores the figure at save time. Whether Carta records it is the owner's call, and the work is data work outside the design waves (T379-c). V3 item 3 shows the current figure meanwhile.

The account syncs trips but not the defaults every screen prices from: home airport, group size and stay tier live in the URL and local storage, and the language is missing from the synced settings (T379-d).

Two figures are wrong on live pages today, the Year Pass comparison and faq13A; V3 item 10 fixes both, but they are live until then (T379-e).

Two harnesses assert the pre-T363 accent on the selected tab, which has been ink-filled since before this task; verify_saved fails on that line alone (T379-f).

The admin page could not be seen without an admin account or the harness stubs, so the before set has no admin screenshot; V5 item 8 relies on verify_admin_panel's own screenshots. Five of the eight surface harnesses were not run in V1 (no built preview, slow shared server); V3 to V5 run all eight as their done checks. Neither needs a register row: both are inside the plan.

## Rollback procedure

The task adds two documents and six register rows. To undo it, drop the branch before merging (`git branch -D p10-v6-brief-account` from the main checkout once the worktree is removed), or after a merge revert the merge commit with `git revert -m 1 <merge>`. Nothing in the app repo, the data or production changed. The screenshots outside the repos can be deleted by hand.
