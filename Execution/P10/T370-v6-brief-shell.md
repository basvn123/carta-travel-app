# T370: design brief, app shell, navigation and shared components

## Task ID

T370 (design wave V1, session 1 of 10; surface key `shell`).

## Date

2026-10-08

## What changed

There is now a written brief for the app shell at `docs/design-v6/briefs/shell.md`, which the three build waves on this surface (T381 in V3, T391 in V4, T401 in V5) build from and which T380 (V2) reads first. No app code changed. The brief has the seven parts the task asks for: setup and mode (Operate), the walk at 380 and 1280 px from a cold start and a returning visit, an inventory of every view, state, control and visual setting on the shell with a verdict each, an impeccable critique and technical audit, the traveller's job here, the plan as three numbered build lists with a target-state table of every control, and eleven "needs a rule" proposals (R1 to R11) for T380 to accept or reject. Because the shell is the only V1 surface that sees the whole app, the brief also carries a cross-surface part 5b for T380: the navigation model and where the journey breaks, every global setting with where it is set and shown, how consistently each shared component is used, and the motion, imagery and data visualisation each surface has today.

The findings that matter most for the next waves. Navigation is buttons with no history: nothing in src calls `pushState`, so the phone's Back button leaves Carta from any tab, and the landing page cannot be reached again after the first visit. The inputs every price depends on are scattered: party size and dates are set only on the first-run receipt, the origin only inside the Trip planner, the language only at the bottom of Account, and the landing page's People, Nights and Stay are local state that never reach the rest of the app (`src/browse/LandingPage.jsx` 71 to 73). The accent is spent on chrome (the phone pass chip, the Lifestyle pill, accent ticks on unselected tiles, an accent avatar), and the overlays use four scrim colours and three close glyphs. The TabFallback loading screen covers the whole viewport, header and bottom nav included, while a planner chunk loads (`src/styles/14-filters-panels.css` 635 to 645, z-index 100), which is also what stopped verify_bottom_nav in this task.

Impeccable choices made without asking, as the owner instructed for this unattended run. The context step's autonomy check asks for one interview probe; it was skipped on the owner's instruction of 2026-10-07. Mode Operate was chosen because the shell is where tasks are completed, not where anything is sold or read. The shape step's open decisions were settled toward keeping Carta's identity: the five-slot phone bar, the plus as the door to the planners and the landing page as the first-visit home all stay; the settings line, badges and section motion are proposed as rules for T380 rather than built on taste. The critique ran as two isolated sub-agents (design review and detector) as reference/critique.md requires; the detector's browser overlay was not injected, because the laptop is short on memory and the run allows one browser at a time, and its snapshot was not persisted to the gitignored `.impeccable/` folder because the brief is the record.

## Files touched

**Created:**
- docs/design-v6/briefs/shell.md
- Execution/P10/T370-v6-brief-shell.md

**Modified:**
- Execution/_OPEN.md (rows T370-a to T370-g appended)

Outside both repos, never committed: eight before screenshots in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\shell\` (V1-home-380, V1-places-380, V1-places-1280, V1-explore-1280, V1-trip-1280, V1-day-380, V1-plan-chooser-380, V1-lifestyle-380, all .jpg).

## Commands run

From the root worktree `C:\Users\Gebruiker\Documents\Portfolio\wt\T370`:

    sh "C:/Users/Gebruiker/Documents/Portfolio/Travel App/.claude/skills/impeccable/scripts/impeccable" context --target src/App.jsx

From the app repo in the main checkout, read only (by the detector sub-agent):

    sh ".../impeccable/scripts/impeccable" detect --json src/App.jsx src/components/AppHeader.jsx ... src/browse/LifestylePanel.jsx   (23 markup files)
    sh ".../impeccable/scripts/impeccable" detect --json src/styles/02-base.css 03-button.css 10-shell.css 14-filters-panels.css 27-states.css 31-infodot.css 46-owner-calls.css
    node scripts/ci/design-lint.mjs

Screenshots and harnesses, from a scratch folder outside both repos, against the shared read-only dev server on port 5199: a Playwright script (Chromium, 380x800 and 1280x800, viewport only, JPEG quality 80 for the eight kept views), then `node <app>/scripts/verify_bottom_nav.mjs http://localhost:5199/`, the same for verify_desktop_shell, verify_top_bar, verify_tab_switching and verify_filter_sheet, `verify_keyboard.mjs --port 5199` and `verify_quality_floor.mjs before --port=5199 --out=<scratch>`. One browser at a time.

Inventory counts came from grep over `src/` in the app repo; the greps are listed in the brief's part 5b where each count is used (for example `grep -rE "<button\b" --include=*.jsx` for the raw button count).

## Config and secrets set

None.

## Before/after measurements

This task builds nothing, so these are the "before" figures the build waves move.

| Metric | Before | Source |
|---|---|---|
| Nielsen heuristic score, shell | 25/40 (Acceptable) | brief part 4 |
| Technical audit score | 12/20 (Acceptable) | brief part 4 |
| Cognitive load checklist failures | 5 of 8 | brief part 4 |
| Detector findings, 23 shell markup files | 0 | impeccable detect |
| Detector findings, 7 shell stylesheets | 2 (side-tab, bounce-easing) | impeccable detect |
| Design-lint violations in shell files (all baselined) | 19 (17 shadow-literal, 2 outline-none) | scripts/ci/design-lint.mjs |
| Design-lint, whole repo | 213 found, 213 baselined, 0 new | scripts/ci/design-lint.mjs |
| Shared Button uses against raw buttons in src | 29 uses in 14 files, about 772 raw in 121 files | grep |
| Scrim recipes / close glyphs | 4 / 3 | brief part 3.3 |
| Global settings with a control on Explore or Destinations | 1 of 6 (Lifestyle only) | brief part 5b |
| Horizontal overflow at 380 and 1280 on the walked views | none | Playwright scrollWidth check |
| Shell harnesses that ran to the end against the dev server | 0 of 5 URL-driven (bottom_nav, desktop_shell, top_bar, tab_switching, filter_sheet); 2 not run (need a dist) | harness logs, part 4 of the brief |
| verify_keyboard, views that ran | 6 of 7 passed at 380 (explore-map failed on pinEnterOpens false); trip-page, trip-planner and day-planner did not run (the browser crashed) | verify_keyboard output |
| verify_quality_floor, views that ran (mobile) | 11 views, 0 failing on the shell checks; small targets 4 on the destination page and 3 on My trips, one heading skip on My trips, one contrast hit on Explore and Account; the run hit its 20-minute limit with 13 page loads timed out | verify_quality_floor output |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first screenshot run stopped at the Day planner | The TabFallback loading screen covers the bottom nav while the lazy chunk loads on the slow shared dev server | Waited for `.loading-screen` to go before each shot; the cause is a finding (brief V3-6) |
| The `?legal=privacy` shot at 380 was blank on the first run | It reused a page that had already loaded another view | Re-shot in a fresh browser context |
| A heredoc dropped a backslash in the second screenshot script | Known shell trap | Rewrote the line without a backslash |
| verify_bottom_nav, verify_desktop_shell, verify_top_bar, verify_tab_switching and verify_filter_sheet did not finish | Two causes: the loading screen intercepting clicks and a 45 s page-load timeout on the loaded dev server, and stale assertions (a "General" category, seven tiles, the pre-T363 accent, `.mobile-seg-btn`) | Not fixed here (docs only); recorded for T381 and T401, row T370-a |

## What is still open

The harness numbers above are partial. The shared dev server was serving ten V1 sessions at once on a laptop short on memory: page loads took over 90 seconds, the keyboard harness lost its browser after seven views and the quality-floor run stopped at its time limit. None of the failures that did complete points at the shell except the loading-screen overlay, which is a real finding (brief V3-6). The keyboard harness's explore-map failure (Enter on a focused pin does not open the place, pinEnterOpens false) belongs to the Explore surface, T372 and T383 (row T370-g).


The eleven rule proposals R1 to R11 in part 7 of the brief need T380's ruling before V3 builds anything that depends on them (row T370-b).

The harness baseline for the shell is not established. Five harnesses failed against the shared dev server, two need a built dist, and verify_desktop_shell and verify_filter_sheet carry stale assertions. T381 should run all nine on a preview build in its app worktree before changing anything and update stale assertions with a comment (row T370-a).

Three pieces of global state have no reachable control: the drive start (`choices.drive_home`), the transport mode and the baggage key. Whether car trips come back or the dead path is removed is a product decision (row T370-c).

The landing page's People, Nights and Stay should write the global settings; that file belongs to the landing surface, so it is a hand-off to T382 (row T370-d).

The phone plan chooser's subtitle says "Route, flights and costs" (`nav.planTripSub`), which contradicts the decision that Carta does not price flights; the fix is a copy change in six catalogues in T381 (row T370-e).

Two catalogue counts disagree on screen: the landing page says 3,868 places and the Explore filter sheet "Show 3,855 places" with nothing selected. The cause was not traced in this task (row T370-f).

## Rollback procedure

Docs only. `git revert` the two T370 commits on the root branch `p10-v6-brief-shell` (the brief, then the report and register rows), or do not merge the branch. Delete `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\shell\` if the before shots are not wanted; nothing in either repo refers to them.
