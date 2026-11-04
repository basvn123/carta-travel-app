# V5 plan: Day planner (key 'dayplanner')

Written by T409 (design wave V5, 2026-10-09) in planning mode, before any app edit. It carries out the V5 list of `docs/design-v6/briefs/dayplanner.md` part 6 inside the files `docs/design-v6/OWNERSHIP.md` gives to 'dayplanner', plus `src/styles/68-v6-dayplanner.css`, the `day`, `dayws`, `dayex`, `chat`, `ai`, `ideas` and `shape` i18n prefixes and the seven day harnesses.

## Audit and critique of the V4 result (impeccable audit, critique; refinement)

Impeccable context ran once from the root worktree (`impeccable context --target continent-app/src/planner/DayPlannerTab.jsx`) and loaded PRODUCT.md and DESIGN.md. The run is unattended and the owner told every session to proceed (2026-10-07): where impeccable would ask, the choice that keeps Carta's palette, type and identity is taken and written in the report. Refinement preserves: nothing here changes the structure V3 built or the look V4 gave it.

The merged V4 build (vite build, preview on 5209) was walked on a Pixel-5-class phone viewport at 360 x 740 with touch (scratch census `wt/_scratch/T409/census44.mjs`). Findings, with the figures it printed:

- Tap targets. The workspace at 360 px counts 60 visible controls under 44 px (the T399 report said the same: about 60). They are the 29 small catalogue pins at 19 x 19, 12 label pins 25 to 32 px high, 4 route pins at 26 x 26, 12 row tools at 26 x 26, three tabs at 37 px high, the tips button at 42, the "Back to all day plans" button at 42, and on the Add tab the map chips (32 px), the Whole days and Single places switch (34), the ready-day "Use this day" buttons (38); on Files the Browse button (38).
- Patterns. The three tabs are a tablist with no roving focus, no `aria-controls` and no tab panel. The Add and Share menus and the More menu have `role="menu"` but focus stays on the trigger, arrows do nothing and Escape does not return focus. The Local tips panel is `role="dialog"` with no focus trap. Every view already has one h1 (checked on the landing steps, the chat, the builder and the workspace).
- Destruction. A stop is removed at once with no way back, a day plan is deleted behind a confirm, a file is deleted behind a confirm (N6 says undo, not confirm).
- Strings. Hard-coded English and glyph characters remain on the surface (a "+" and a tick as text in the tips add, "..." for busy, ampersands in labels, "Copied!"), and a few banned or off-voice words; to be listed by grep at the start of the build.
- Failure. No line when the map style fails to load; the workspace has no skeleton while the activities file is slow.

Design health against the V1 score (24/40): V3 and V4 lifted consistency and minimalism; the drags left are heuristic 5 and 9 (no way back from a delete) and the touch and keyboard floors.

## The changes, in order

1. Tap targets (brief V5-1, impeccable adapt). In `68-v6-dayplanner.css`, inside `@media (pointer: coarse)`, tabs, row tools, tips button and its panel's close and add, the back button, map chips, the Add mode switch, "Use this day", Browse, the files actions, the export menu items, idea time segments and remove, search clears and the chat back and toggles take `--tap` (44 px) as height and, for icon-only controls, width. On a fine pointer they keep their sizes (32 px allowed). Map pins keep their look and gain a 44 px hit box with an `::after` the size of the box around them, never a bigger visual (rule N5). Check: the census counts every control with its hit box; the goal is zero under 44 in the workspace and landing at 360 on the touch device.

2. Real patterns (brief V5-2, impeccable harden). `DayTabsRail` gets roving tabindex, ArrowLeft, ArrowRight, Home and End, ids and `aria-controls`, and the panel under it becomes a `role="tabpanel"` labelled by its tab. The More, Add and Share menus move focus to the first item when they open, support ArrowUp, ArrowDown, Home and End, and Escape closes and returns focus to the trigger (one shared `useMenuKeys` next to `useDismiss`). The Local tips panel uses `useFocusTrap` and returns focus to its button. The AI modal's scrim is checked against carta-design (flat `--scrim`-style ink, no blur). Check: a day-planner case added to `verify_keyboard.mjs`.

3. Undo instead of confirm (brief V5-3, rule N6). Removing a stop, deleting a file and deleting a day plan run at once and show the existing toast row with "Undo" for six seconds; the button that starts a plan delete uses `--danger`. A file delete is held until the toast ends so nothing is lost on undo. Files: `DayPlannerTab.jsx`, `DayPlanPanel.jsx`, `DayFilesPanel.jsx`, `DayTripCards.jsx`. Check: the walk removes a stop, taps Undo and counts the stop back.

4. Strings (brief V5-4, impeccable clarify). The hard-coded strings found by grep go through i18n in all six catalogues (de, es, fr, it, nl written by this session, one owner row for native review); "Copied" has no exclamation mark; the ampersands in labels become words; no backslash in `day.depart800`; the two banned-word strings are rewritten. New keys sit inside the catalogue object under `day.*`, `dayws.*`. Check: the six catalogues parse; the design lint shows no banned word on the surface.

5. Long words and small screens (brief V5-5, adapt). German and French labels in the compact head, the toolbar and the fork cards wrap or shrink before they truncate at 360; the stay name truncates on one line and shows whole on focus; `min-width: 0` on the flex children that overflowed. Check: the de and fr walk at 360 and 1280 shows no clipped label.

6. Offline and failure (brief V5-6, harden), as far as the surface's own files allow: a line in the workspace when the map style fails ("The map did not load. Your stops are below."), and a skeleton rather than a partial day while the catalogue is loading. If the map component belongs to another surface the line is raised as a row. Check: blocking the style URL in Playwright shows the line.

7. Clean-up and harnesses (brief V5-7, V5-8, polish). The dead CSS the brief lists is deleted only where a grep shows no reader; the app-header rules in `13-day-planner.css` are left for their owner if the move touches another file (row). The harnesses are run on the preview build; an assertion that encodes the old design is updated with a comment.

## Checks

`npm run lint` 0 errors; `npm test`; `node scripts/ci/design-lint.mjs` 0 new; the six catalogues parse; `node scripts/check_ownership.mjs`; `vite build`, then the seven day harnesses, `verify_keyboard.mjs` (20 of 20, plus the new case) and `verify_quality_floor.mjs` on `vite preview` at 5209, then dist/ and dist-data/ deleted. `impeccable detect --json` over every changed file. The device walk on iPhone 13 (WebKit), Pixel 5 and 360 x 740 (Chromium, touch) and desktop 1280 x 800, with landscape, tap only, the keyboard at 60 percent height, safe areas, dvh, thumb reach, tap targets, reduced motion, de and fr. After screenshots as `V5-<view>-<device>.jpg` in `design-v6-shots\dayplanner\`, ten at most, never committed.

## Open by design

Anything that needs another surface's file (the map style failure line if it lives in `TripMap.jsx`, the shared `.guide-chip`, the stripes in 11 and 19, rules in 26) becomes a register row for the V6 consistency pass. The day cost (T378-d) and legs (T378-e) still wait on the owner.
