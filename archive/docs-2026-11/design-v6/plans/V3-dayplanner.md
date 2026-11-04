# V3 plan: Day planner (key 'dayplanner')

Written by T389 (design wave V3, 2026-10-08) in planning mode, before any app edit. It carries out the V3 list of `docs/design-v6/briefs/dayplanner.md` part 6 as amended by the brief's Direction check, inside the files `docs/design-v6/OWNERSHIP.md` gives to 'dayplanner' plus `src/styles/68-v6-dayplanner.css`, the `day`, `dayws`, `dayex`, `chat`, `ai`, `ideas` and `shape` i18n prefixes and the seven day harnesses.

## Shape (impeccable, run on the surface as merged after V2)

Impeccable context ran once from the root worktree (`impeccable context --target continent-app/src/planner/DayPlannerTab.jsx`); it loaded PRODUCT.md and DESIGN.md and found no surface brief by its own lookup, so the brief above stands in. The run is unattended and the owner told every session to proceed (2026-10-07): shape's discovery round is answered from the brief, PRODUCT.md, DIRECTION.md and the research instead of asked, and every open choice keeps Carta's palette, type and identity. Refinement, not redesign.

Job and audience. A budget traveller, often a hiker, planning one day in a town the evening before or that morning, then following it on a phone in one hand in the street. Mode: Operate.

Outcome and proof. A day they can walk: the stops in order, the steps and the finish, exportable for the pocket, with the next action always in view. Success on the phone is the first stop visible without scrolling under chrome.

Structural thesis. The workspace is a timetable for one day, not a map with a list hung under it. One compact head (name, day switcher, figures), one toolbar row of labelled actions inside the content, then the stops. The landing asks four questions only to someone who has nothing yet; someone with plans sees their plans first. Every view has one primary.

What stays untouched. The palette, the three faces, the map and the route in accent, the four landing questions and their copy, the chat planner's questions, the ready-made days, the files panel, the exports' content.

Anti-goals. No new colours, no bento, no hour grid, no figure the data does not hold, no decorative motion, no AI place outside the catalogue.

Blocked by owner rows, not built in this wave. Brief V3-1 (the day's cost and its receipt) waits on T378-d: the destination page prices a day on two bases (T374-d) and the day planner must follow the figure the owner picks. Brief V3-2 (legs between stops and arrival times) waits on T378-e: it reverses the August workspace rebuild. Neither is built; the compact head leaves the figures line ready to take the cost when T378-d closes. T378-c (opening hours and entry prices) is pipeline work and stays open.

## The changes, in order

0. Harness repair and baseline (brief V3-11, row T378-f). `verify_day_workspace.mjs` and `verify_day_overview.mjs` open the plan through `.trip-saved-main`, which no longer exists; point them at the `.dtcard` that DayTripCards draws, with a comment. Let all seven day harnesses take the preview port from `CARTA_PORT` (so a parallel session's preview on 4193 is never tested by mistake), then run all seven on a `vite preview` build of the unchanged surface on port 5209 and record the baseline. Files: `scripts/verify_day_*.mjs`.

1. Move the surface's rules home (OWNERSHIP rule 5, Direction check). The contiguous day-workspace block in `24-destination-workspace.css` (the `dayws`, `dayp`, `daya`, `dayr`, `dayf`, `day-map-tools-inline` and `.day-ws` rules) and the `dayex` block in `26-shortlist-extras.css` move verbatim into `68-v6-dayplanner.css`, deleted from the old files in the same commit. Check: a computed-style dump of the workspace and the builder before and after the move is identical. Then the side stripe on `.dayp-summary` goes (row T384-k).

2. Remove the dead (brief V3-10). The edit flow (`editingPlanId`, its banner, Cancel, `cancelEditOnMap`, the editing branch of `startExplorePlanning`, `editing` on the builder and "Update plan"), the saved modal (`savedInfo`, `handleSavedTripsClick`, the overlay and its buttons), and the unused imports and constants lint reports in the surface files. `MagicImportZone.jsx` is tripplanner's: not touched. Files: `DayPlannerTab.jsx`, `DayExploreBuilder.jsx`, and the surface files lint names.

3. The step rail belongs to the four questions (brief V3-8). In the chat and the builder the rail and "Step 4 of 4" give way to one back link, "Back to the questions", that returns to step 4. The 44 px info circle in the rail becomes a text button under the question ("How this works") on the four question screens. Files: `DayPlannerTab.jsx`, `68-v6-dayplanner.css`, i18n.

4. Returning visit leads with the plans (brief V3-5, impeccable onboard). When the device holds day plans, step 1 opens on "Your day plans" (newest first) with "Plan a new day" as the one primary; the stay question follows on that tap. A cold start keeps the question first. A running trip still leads as today. Files: `DayPlannerTab.jsx`, `DayTripCards.jsx`, `68-v6-dayplanner.css`, i18n.

5. One primary per view (brief V3-6, impeccable quieter as far as structure goes). Step 1's "Find" becomes the step's primary (the shared Button), then "Continue" after a pick; "Sign in" in Continue a trip becomes secondary; the fork's two cards become equal weight, the recommended one marked by the accent border and the "Recommended" badge only (carta-design plan cards): no `--accent-bg` fill, no accent title, no accent button; "Use this day" on ready-made cards becomes secondary. Files: `DayPlannerTab.jsx`, `DayTripCards.jsx`, `DayAddPanel.jsx`, `68-v6-dayplanner.css`.

6. One compact head on a phone (brief V3-3, rules N7 and the "More" menu rule). The head row holds the plan name and the save state as a plain status word (not a chip, no tick glyph). Under it one day switcher, "Day 1, Tue 4 Aug" (`--ui`, the date in `--mono`) with Previous and Next secondaries at `--tap`, arrow keys moving a day; "Add a day" and "Add a city" move into one "More" menu beside it; the city chips show only when the plan has two or more cities. The figures line keeps stops, steps and finish in `--mono` and is where the day cost goes once T378-d closes. The phone sheet's default height is raised so two stops show. Target: the first `.dayr-row` top at or under 420 px at 380 x 800 (670 px in V1). Files: `DayPlannerTab.jsx`, `DayWorkspaceChrome.jsx`, `68-v6-dayplanner.css`, i18n.

7. One toolbar, no floating bot (brief V3-4, rule N3). The plan toolbar becomes one row of two labelled buttons, "Add" and "Share". "Add" opens a menu with Add more places, Ask Carta to plan it, the bot's refining prompts (add more stops, less walking, a rain plan, where to eat), and Reorder the route once. The floating Carta bot button and its menu go. Both menus open in the flow on a phone, so every item is on screen above the bottom nav. Files: `DayPlanPanel.jsx`, `DayWorkspaceChrome.jsx`, `DayPlannerTab.jsx`, `68-v6-dayplanner.css`, i18n.

8. The Add more tab speaks the traveller's words (brief A1, A4 and the map filter card). "Ready-made" and "Custom" become "Whole days" and "Single places"; "Ask Carta instead" uses the toolbar's label; the map filter card over the map collapses to one scrolling row on a phone, without the hint line. Files: `DayAddPanel.jsx`, `DayPlannerTab.jsx`, `68-v6-dayplanner.css`, i18n.

9. The builder answers "on foot or not" (brief V3-7, impeccable harden). Rails run nearest-first by kind: your ideas, on this day, sights, walks and nature, things to do, food, your shortlist, then beaches and lakes and towns further out. A town card states how you get there from the stay's town: "about N min by train" where the transport model offers a train, otherwise "about N min by car, no train". The tray counts places with their steps and towns as rides with their minutes, never prints a step count for no walk, and says in one sentence when the picks add up to more than one day. Files: `DayExploreBuilder.jsx`, `dayExploreRails.js`, i18n.

10. Exports in six languages (brief V3-9). The PDF, KML and ICS builders take `t` and translate every string they write; the PDF footer carries carta-europetravel.com; the ICS uses the plan's chosen start time; the ICS toast gets its own day-plan text. `kmlExport.js` is shell's: it is called with translated strings, not edited. Files: `dayPlanPdf.js`, `dayPlanKml.js`, `dayPlanIcs.js`, `DayPlannerTab.jsx`, i18n.

## Checks

After the items: `npm run lint` 0 errors; `npm test`; `node scripts/ci/design-lint.mjs` 0 new; the six catalogues parse; `node scripts/check_ownership.mjs <root>/docs/design-v6/OWNERSHIP.md`; `npm run build`, then the seven day harnesses, `verify_keyboard.mjs` and `verify_quality_floor.mjs` on `vite preview` at 5209, then dist/ and dist-data/ deleted. A harness assertion that encoded the old design is updated with a comment, never deleted. `impeccable detect --json` over every changed file, findings fixed. The phone walk on iPhone 13 (WebKit), Pixel 5 and 360 x 740 (Chromium) and desktop 1280 x 800: landscape, tap only, the keyboard at 60 percent height, safe areas, dvh, thumb reach and tap targets, written into the report. After screenshots under the V1 view names in `design-v6-shots\dayplanner\`, ten at most.

## Open by design (register rows at report time)

The day cost (T378-d) and the legs (T378-e) as above; the pin colours and the hit box (V4, through tripplanner's TripMap); the accent clean-up, tap targets and patterns of V4 and V5; anything a change here needs in another surface's file.
