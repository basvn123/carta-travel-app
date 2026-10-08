# T389: V3 structure, information and flow, Day planner

## Task ID

T389 (design wave V3, session 9 of 10, surface 'dayplanner'; no mind-map prompt exists for it)

## Date

2026-10-08

## What changed

The day planner now puts the day before its chrome and gives every view one obvious next step. The plan for the wave is `docs/design-v6/plans/V3-dayplanner.md`, committed before the first app edit; it is the brief's V3 list less the two items that wait on the owner.

On the landing, a traveller who already has day plans on the device now opens on "Your day plans" with "Plan a new day" as the one primary, and the stay question follows on that tap; a cold start still opens on the question, and a running trip still leads as before. The step rail and "Step N of 4" now show only on the four questions; after the fork, the chat and the builder carry one "Back to the questions" link instead of a rail that said "Step 4 of 4" over a screen that was no longer a question. The 44 px help circle in the rail became a "How this works" text button under the question. The fork's two cards are equal weight: same ground, same title colour, same action; the recommended one keeps only its accent border and the "Recommended" badge. "Sign in" and "Plan a trip" in the trips block and "Use this day" on ready-made days became secondaries. The ideas step's chosen answer now uses the house selected state (a 2 px ink border), which also fixes a 3.83:1 contrast failure the quality floor found there (accent text on `--accent-bg`).

In the workspace, the head is one compact block: the plan name with "Saved" as a status word (a 6 px success dot, not a green chip that looked like a button), then one day switcher, "Day 1 Wed 14 Oct" with Previous and Next at `--tap` and arrow keys, walking through every day of the plan across its cities, and a "More" menu holding "Add a day" and "Add a city". The city chips show only when a plan has two or more cities. The two icon circles above the list became one toolbar of two labelled buttons, "Add" and "Share", and both open the shared sheet (`SheetShell`): a popover hung off the button on a pointer screen, a bottom sheet over the one scrim on a phone, so every export and every ask is on screen (the V1 walk found the share menu cut off under the bottom nav). The floating Carta bot and its menu are gone (rule N3): its refining asks (more places, less walking, a rain plan, where to eat) sit in the Add sheet under "Ask Carta", and "Reorder the route", which both menus offered, is offered once. On a phone the sheet opens at 80 percent of the screen with tighter bands, so the first stop starts at 407 px at 380 x 800 instead of 661 px; the grip still drags the sheet down for more map and remembers the height. On Add more, "Ready-made" and "Custom" read "Whole days" and "Single places", "Ask Carta instead" reads "Ask Carta to plan it", and the pin filter card over the map is one scrolling row on a phone, without the hint line.

In the builder, the rails run from the door outwards: what is on that day, sights, walks and nature, things to do, food, the shortlist, and only then beaches and lakes and towns that need a ride. A town card now says how you get there from the stay's town with the transport model the day-trip block already uses ("about 38 min by train" for Tivoli from Rome, "about 2 h 13 min by bus" for Civita di Bagnoregio). The tray counts towns as rides with their minutes there and back and no longer prints a step count for towns; for Rome with Tivoli and Civita picked it reads "2 towns, about 5 h 42 min there and back", followed by "About 11 h 42 min with the rides and the visits: more than one day holds." The estimate behind that line is written in `dayExploreRails.js` as named constants: rides there and back, three hours in each town, an hour at each place, the walking between them, against a nine-hour day.

The PDF, KML and ICS exports now write every word through the traveller's language. The PDF footer carries carta-europetravel.com instead of "carta.travel" and the document's `lang` follows the UI. The KML composes its folders in `dayPlanKml.js` and hands them to the shell's `buildKml()`, so `lib/kmlExport.js` stays untouched, and it now pins the stay in each day's folder. The ICS starts the day at the plan's own start time instead of a fixed 09:30, and its toast has its own day-plan text instead of the trip's "every flight and stay".

Structure underneath: the day workspace rules (the `dayws`, `dayp`, `daya`, `dayr`, `dayf` block of `24-destination-workspace.css`) and the builder rules (the `dayex` block of `26-shortlist-extras.css`, with its phone tap boxes) moved verbatim into `68-v6-dayplanner.css` under OWNERSHIP.md rule 5, deleted from the old files in the same commit. A computed-style dump of every non-map element of the workspace (three tabs) and the builder at 380 and 1280 px was identical before and after the move. The eight design-lint violations that moved with the rules (shadow literals, two `outline: none` on inputs, a mask gradient) were fixed rather than re-baselined, and the side stripe on `.dayp-summary` (row T384-k) went with them. The dead edit flow, the never-shown saved modal and everything behind the eleven unused-variable warnings lint reported in `DayPlannerTab.jsx` are gone. The two dead detector findings in `20-day-planner-flow.css` (the `.day-ideas-chip` side stripe, the overshoot curve on `.ai-sched-stop`) and the dead `.day-tier-must` stripe in `13-day-planner.css` are gone. Two chat heights and the builder's desktop map height use `100dvh`.

Not built, because the owner has not answered: brief V3-1, the day's cost and its compact receipt (row T378-d), and brief V3-2, legs between stops and arrival times (row T378-e, which reverses the August rebuild). The figures line in the compact head is where the day cost goes when T378-d closes.

Design choices made under the unattended run (impeccable's AUTONOMY_DIRECTIVE_CHECK, owner instruction 2026-10-07 to proceed): every one keeps Carta's palette, type and identity. The Add and Share choices open the shared sheet rather than a dropdown, because DIRECTION.md part 7 says a choice opens a sheet on a phone and eight two-line items cannot fit above the bottom nav as a dropdown. The phone sheet's default is 80 percent, which leaves about 130 px of map at 380 x 800; the brief's thesis is that the workspace is a timetable first, the done check asked for the first stop at or above 420 px, and the grip gives the map back in one drag. A town card says "by bus" without "no train": the transport model omits a train for some towns that have one (Castel Gandolfo), and a "no train" claim would be a figure the data does not hold.

## Files touched

Root repo (branch p10-v6-build-dayplanner):

Created:
- docs/design-v6/plans/V3-dayplanner.md
- Execution/P10/T389-v6-v3-dayplanner.md

Modified:
- Execution/_OPEN.md (rows T389-a to T389-i appended; T378-a and T378-f marked closed by T389)

App repo `continent-app` (branch p10-v6-build-dayplanner):

Modified:
- src/planner/DayPlannerTab.jsx, DayWorkspaceChrome.jsx, DayPlanPanel.jsx, DayExploreBuilder.jsx, DayTripCards.jsx, dayExploreRails.js, dayPlanPdf.js, dayPlanKml.js, dayPlanIcs.js
- src/styles/68-v6-dayplanner.css, 13-day-planner.css, 20-day-planner-flow.css, 21-chat-passes.css
- src/styles/24-destination-workspace.css and src/styles/26-shortlist-extras.css (deletions only: the rules moved to 68 under OWNERSHIP rule 5)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (59 keys added after `dayws.tabFiles` under the `day`, `dayws` and `dayex` prefixes, 4 values changed, 12 unused keys removed from en and 8 from each other catalogue, which never had the other 4)
- scripts/verify_day_landing.mjs, verify_day_workspace.mjs, verify_day_overview.mjs, verify_day_start_point.mjs, verify_day_ideas.mjs, verify_day_dates.mjs (every changed assertion carries a comment saying why)

No file was created or deleted under `src/`, so OWNERSHIP.md needed no new row; `scripts/check_ownership.mjs` passes.

Outside both repos, never committed: ten after screenshots in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\dayplanner\` (V3-landing-iphone, V3-landing-desktop, V3-fork-android, V3-builder-desktop, V3-returning-android, V3-workspace-iphone, V3-workspace-android, V3-workspace-desktop, V3-add-android, V3-tray-desktop), and the walk scripts, measurements and harness logs in `C:\Users\Gebruiker\Documents\Portfolio\wt\_scratch\T389\`.

## Commands run

Root worktree `C:\Users\Gebruiker\Documents\Portfolio\wt\T389`, then app worktree `...\wt\T389-app` with its `node_modules` junction pointed at the complete private install `wt\_scratch\T384\nmfull\node_modules` for the session and pointed back to the main checkout's at the end.

    impeccable.cmd context --target continent-app/src/planner/DayPlannerTab.jsx      (root worktree)
    npm run build; npx vite preview --port 5209 --strictPort                           (base, after each step, final)
    CARTA_PORT=5209 node scripts/verify_day_{landing,start_point,dates,ideas,workspace,overview}.mjs
    node scripts/verify_day_steps.mjs http://localhost:5209/
    node scripts/verify_keyboard.mjs --port 5209
    node scripts/verify_quality_floor.mjs v3final --port=5209 --only=day --out=<scratch>
    node <scratch>/walk.mjs styles cssbefore|cssafter2     (computed-style comparison of the CSS move)
    node <scratch>/walk.mjs measure before; node <scratch>/devwalk.mjs  (device walk and screenshots)
    impeccable.cmd detect --json <every changed src file>
    npm run lint; npm test; node scripts/ci/design-lint.mjs
    node scripts/check_ownership.mjs <root>/docs/design-v6/OWNERSHIP.md
    for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
    rm -r dist dist-data                                    (after every build)

## Config and secrets set

None. The app worktree has no `.env`, so every run saw the "accounts are not set up" state; see the harness notes below.

## Before/after measurements

Before is the merged V2 state built in the app worktree (or the V1 walk where named); after is the final build. 380 x 800 is the plain Chromium phone the V1 walk used; the device rows come from the device walk.

| Metric | Before | After | Delta |
|---|---|---|---|
| First stop top in the workspace, 380 x 800 | 661 px | 407 px | -254 px |
| First stop top, iPhone 13 / Pixel 5 / 360 x 740 | not measured | 380 / 393 / 395 px | |
| First stop top, desktop 1280 x 800 | 365 px | 315 px | -50 px |
| Controls between the sheet top and the first stop, phone | 10 (V1 walk) | 8 (Previous, Next, More, three tabs, Add, Share) | -2 |
| Floating controls over the day (bottom nav plus excluded) | 1 (Carta bot) | 0 | -1 |
| Controls that run the same action in the workspace | 2 pairs (Reorder in both menus; Ask Carta in both) | 0 | -2 |
| Accent-filled controls, workspace phone | 1 ("Carta") | 0 | -1 |
| Accent-filled controls, Add more | 2 ("Carta", "Use this day") | 0 | -2 |
| Accent-filled controls, returning landing | 0 (Sign in when accounts are on) | 1 ("Plan a new day") | one primary |
| First saved plan on a returning visit, 380 x 800 | 524 px | 184 px | -340 px |
| Screens after the fork that say "Step 4 of 4" | 2 (chat, builder) | 0 | -2 |
| Builder tray, Rome with Tivoli and Civita | "2 places, about 0 steps" (V1) | "2 towns, about 5 h 42 min there and back" and the fit line | |
| impeccable detect findings, surface files | 3 (V1 brief) plus 1 (T384-k) | 0 | -4 |
| design-lint | 0 new | 0 new (204 found, 204 in the baseline) | |
| npm run lint, whole app | 0 errors, 70 warnings (wave V2 log) | 0 errors, 58 warnings | -12 |
| npm test | 341 pass | 341 pass, 0 fail | |
| Strings in the three exports outside i18n | all | 0 (brand line "Carta, Europe Travel" and "Wikipedia" kept as names) | |

Harnesses, ok lines and failures, on `vite preview` of a worktree build:

| Harness | Before | After | Note |
|---|---|---|---|
| verify_day_landing | 50 ok, 1 fail | 53 ok, 1 fail | The one failure both times is the route-building state, which needs the plan-day function |
| verify_day_start_point | 7 ok, 1 fail | 7 ok, 1 fail | "From your trip" needs a signed-in account (no Supabase env in a worktree) |
| verify_day_dates | 8 ok, then stops | 8 ok, then stops | Stops at the Barcelona trip chip, which needs the same account |
| verify_day_ideas | 22 ok | 22 ok | |
| verify_day_workspace | could not start in V1 (T378-f); 30 ok after the .dtcard repair | 32 ok | |
| verify_day_overview | could not start in V1; 15 ok, 1 fail after the repair | 16 ok | The failure was the stale "km" assertion; the header has said steps since D5 |
| verify_day_steps | 16 ok, then stops | 16 ok, then stops | Stops waiting for the chat route, which needs the plan-day function |
| verify_keyboard | 20/20 (wave 16c log) | 20/20 | the day-planner case passes |
| verify_quality_floor, day flow (16 screens) | not run before | every floor check passes; 0 phone targets under 44 px, one h1 per screen, 0 views with two primaries, 0 console errors | the first after-run failed contrast on the ideas step (3.83:1, accent on accent-bg, older than this task); fixed here, and the rerun on the final build passes |

The phone checks (T414), on iPhone 13 (WebKit), Pixel 5 and 360 x 740 (Chromium, touch) and desktop 1280 x 800. No horizontal scroll on any view at any size. Landscape (664 to 740 x 360 to 393): the toolbar and the first stop stay on screen (first stop at 319 to 326 px). Tap only: nothing on the surface depends on hover; every new hover rule sits in `@media (hover: hover)`. The on-screen keyboard: with the stay field focused and the height cut by 40 percent, the field and Find stay in view and the bottom nav does not cover them on all three phones; on the iPhone that needed a fix, because the field sat under the nav at 398 px, so the field now scrolls back to the middle of the visible screen on a viewport resize while it has focus. Safe areas: the bottom nav (shell's) pads the bottom inset; the day planner adds no fixed bar of its own, and the builder's tray sits above `--bottom-nav-h`. Height: the chat's two heights and the builder map use `100dvh` now. Thumb reach: on a tall phone the toolbar (Add, Share) sits at 345 to 357 px and the Add and Share sheets rise from the bottom; "Plan a new day" ends at 546 to 566 px. Tap targets: every new control is `--tap`; the 60 or so workspace controls under 44 px are the map pins, the row tools and the tabs, which are V5's (brief V5-1). Swipe: the sheet's grip drag and the bottom sheet's swipe-down both have buttons doing the same (the grip has arrow keys, the sheet has its close). A German walk at 360 x 740 fits the compact head and the toolbar ("Hinzufügen", "Teilen", "Mehr") without truncation.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Moving the builder rules into 68 changed one computed height (`.dayex-head-acts` 44 to 36 px) | The phone tap boxes for the builder sat in a later shared block of 26 and overrode the moved rules | Moved those eight lines too, as their own block after the builder rules; the comparison then showed no difference |
| The design lint reported 8 new violations after the move | The baseline keys on the file path, so moved violations count as new | Fixed them instead of re-baselining: house shadows, inputs keep their focus outline, the mask gradient went, the focused card is outlined in ink |
| The Add menu as a dropdown ran under the bottom nav on a phone (eight two-line items) | No room above the nav in the sheet's scroll | Both choices open in the shared `SheetShell` |
| Plan a new day, then back from the new plan, showed the question again | The returning flag stayed set | It resets whenever a plan opens |
| The stay field went under the bottom nav when the iPhone viewport shrank | Nothing scrolled the field after the resize | Scroll the field into view on a resize while it has focus |
| Python edits once turned a CRLF file into LF | Text-mode write | Rewrote with CRLF; every later edit keeps the file's own line ends |

## What is still open

Brief V3-1, the day's cost, waits on the owner's choice of the destination page's day basis (T378-d, T374-d); nothing in the day planner prices a day yet. Row T389-a.

Brief V3-2, legs between stops and arrival times, waits on the owner (T378-e). Row T389-b.

The new and changed strings in de, es, fr, it and nl were written by this session and need a native read (the keys are the 59 added after `dayws.tabFiles` plus `dayws.modeReady`, `dayws.modeCustom`, `dayws.readyAsk`, `day.copied`). Row T389-c.

What only a real phone can prove: the real keyboard's height against the scroll-into-view fix, whether 130 px of map under an 80 percent sheet is enough in the street, the bottom sheet's swipe and scroll momentum, Safari's bar collapse in landscape, and haptics (none are used). Row T389-d.

`lib/kmlExport.js` still carries `dayPlanKml()`, which wrote English labels; the day planner no longer calls it. The shell may delete or translate it. Row T389-e.

`26-shortlist-extras.css` still carries a dead `.day-flow-help` tap box and the day planner's `.day-topcard-trip` link (accent text); V4 should move or delete them under rule 5. Row T389-f.

The shell's hand-off to place the Lifestyle opener on this surface depends on the day cost, so it waits with T378-d; the AI modal's people stepper sets the AI's group size and prices nothing. Row T389-g.

Four harness parts fail in every worktree because they need the Supabase env or the plan-day function (start_point "from your trip", dates' Barcelona chip, landing's route-building state, steps' chat route). They need a run from the main checkout with its `.env` after the merge. Row T389-h.

On a phone the fork's second card still starts under the bottom nav; V5 should shorten the cards (the landing harness asserts both previews). Row T389-i.

Closed by this task: T378-a (DIRECTION.md part 9 accepted all seven rules, N6 as amended, and this wave built N3 and N7 and the selected state; N1 and N2 wait as above) and T378-f (the harness selector). Row T378-c (opening hours and entry prices in the catalogue) stays open: it is pipeline work. Row T384-k (raised in T384's branch, not yet in this branch's register) is fixed here: the `.dayp-summary` stripe is gone; the orchestrator can mark it closed by T389 at merge.

The V4 and V5 items of the brief (pins in ink, accent clean-up, tab and menu patterns, tap targets, undo, strings) are not open items of this task; they are those waves' plans.

## carta-design's seven questions

1. Any hex value outside `:root`? No. The KML day colours are KML `aabbggrr` strings copied from the shell's own palette in `lib/kmlExport.js`, not CSS colours, and the PDF's palette is untouched (V4-7).
2. Any gradient, any colour not in DESIGN.md, a second saturated hue? No; one mask gradient was removed.
3. Ochre only for ratings, teal only for gems, `--danger` only for destruction? Yes; nothing here touches them. The status dot is `--status-success`, as the Status rule says.
4. Mono prose, or a column number in sans? No. The date in the day switcher and the stats line are `--mono`; names and labels are `--ui`.
5. More than one primary in a view? No. The quality floor counts zero views with more than one filled primary; the returning landing has "Plan a new day" alone, the workspace and Add more have none.
6. Headlines with a verb or a number; no em dashes, no banned words? "Your day plans" is the existing list heading; the new labels are verbs ("Plan a new day", "Add", "Share", "Add a day"). The design lint finds no banned word and no dash.
7. Remove one thing: the floating Carta bot went, and with it one of the two "Reorder" and one of the two "Ask Carta" doors.

## Rollback procedure

App repo: `git -C continent-app revert a6c981e 554f30a 32cca4a 78e41ce 7afd074` (or reset the branch to `61449ab` before merge). The CSS move commit (`78e41ce`) reverts cleanly on its own and restores the rules in 24 and 26. Root repo: revert this report's commit and `59940a617` (the plan), and restore rows T378-a and T378-f to open. No data, no migration, nothing deployed.
