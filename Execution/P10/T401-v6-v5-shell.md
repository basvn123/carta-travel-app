# T401: shell V5, harden, adapt and polish

## Task ID

T401 (design wave V5, session 1 of 10; surface key `shell`). Root branch `p10-v6-polish-shell`, app branch `p10-v6-polish-shell`.

## Date

2026-10-09

## What changed

The shell now keeps its promises to keyboards, screen readers, small screens and other languages. Every dialog the shell draws traps focus and closes on Escape: the plan chooser (still a dialog of two links, now `aria-modal`, with focus moving in and returning to the plus), the share-trip offer, the DateField popup, and the SheetShell sheets, which dropped a hand-written trap that re-ran on every parent render. SheetShell, the share-trip offer and the three legal dialogs now leave in `--dur-2` through a new `useDialogExit()` in `src/lib/motion.js`. A pointer open no longer draws a focus ring on the control focus moves to (row T396-e): `useFocusTrap` marks it quiet and the first key press lifts the mark.

English literals are gone from the shell files except brand names. The crash screen, DateField (months and weekdays from Intl in the active language, week starting on Monday, three aria-labels), Dropdown, RatingBadge, TransportIcons and 86 icon names in `Glyph` now read the six catalogues (100 new strings; the legal prose itself stays English, row T401-h). The crash screen and the maintenance screen use one `ErrorBlock`: one sentence, the way out, never `error.message` (a forced render error showed the sentence and no trace of the exception text).

On a phone, a text field with focus now takes the bottom nav away (`useKeyboardOpen`, row T390-d): the class is set only for a focus the traveller caused, so the day planner's field that focuses itself on arrival keeps the bar. Text entry is 16 px under a coarse pointer so iOS Safari does not zoom. The app root and one popover cap use `100dvh`. The header and bar read the safe-area insets. A coarse pointer gets `--tap` on the header tabs, pass chip, avatar and friends chip at every width, and a narrow cost bar segment gets a 44 px hit box without changing its width. On a short landscape screen the header takes 4 px padding instead of 9. The bottom slot rises to z 57, above My trips and Account (row T400-c), with the Lifestyle scrim and panel at 58 and 59.

Smaller items: the Lifestyle counts use the shared Stepper from FilterControls (44 px buttons, row T381-c) and the week and day switch is ink fill, not accent; the day track reports its day through `onSelect` and takes an `index` prop, and its "Day 3 of 7" sets only the figures in mono (rows T397-b, T397-c); 17 shadow literals in two stylesheets became tokens, two `outline: none` became focus swaps, and 69 `:hover` rules in eight stylesheets sit under `@media (hover: hover)` (the four that cancel another surface's unguarded accent hover stay unwrapped, with a comment); the unused `dayPlanKml()` and its two helpers left `kmlExport.js` (row T389-e).

Choices taken where impeccable would have asked (unattended run), each keeping Carta's palette, type and identity: the chooser stays a dialog rather than a menu because both items are links; the compact landscape header trims padding only, because the settings parts must stay `--tap`; no per-size optical-size rule for Fraunces until a real iPhone confirms the cause (row T401-c).

Process note for the orchestrator: `git stash` is shared between worktrees. A stash of mine and one of T405's crossed at 00:28 and each session popped the other's. I recovered my files from my dangling stash commit (f02c80e8). Six of T405's tracked files are still modified, uncommitted, in `wt/T401-app` (verify_hero_images.mjs, DestinationPage.jsx, Neighbourhoods.jsx, RoutesFromHere.jsx, destinationPdf.js, 64-v6-destination.css); T405 has since committed the same files as 10443da, so they are redundant copies. I could not discard them (the permission layer denied `git checkout`), and I did not commit them. A patch of them is in `wt/_scratch/T401/stray-destination-session-changes.patch`.

## Files touched

**Created (root):** docs/design-v6/plans/V5-shell.md (its own commit before the first app edit), Execution/P10/T401-v6-v5-shell.md.

**Modified (root):** Execution/_OPEN.md (rows T401-a to T401-i; T381-c, T381-d, T389-e, T390-d, T391-e, T396-e, T397-b, T397-c, T400-c closed), docs/design-v6/OWNERSHIP.md (one row for the new hook, count 113).

**Created (app):** src/hooks/useKeyboardOpen.js.

**Modified (app):** src/App.jsx; src/browse/DayTrack.jsx, LifestylePanel.jsx, SheetShell.jsx; src/components/BottomNav.jsx, DateField.jsx, Dropdown.jsx, ErrorBoundary.jsx, Icons.jsx, Imprint.jsx, MaintenanceGate.jsx, PrivacyPolicy.jsx, RatingBadge.jsx, StateBlocks.jsx, TermsOfService.jsx, TransportIcons.jsx; src/hooks/useFocusTrap.js; src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js, index.jsx; src/lib/kmlExport.js, motion.js; src/styles/03-button.css, 10-shell.css, 14-filters-panels.css, 27-states.css, 31-infodot.css, 32-day-carousel.css, 34-section-rail.css, 45-empty-states.css, 46-owner-calls.css, 60-v6-shell.css; scripts/verify_focus_trap.mjs, verify_tab_switching.mjs; scripts/ci/design-lint.baseline.json.

**Deleted:** none.

## Commands run

In `wt/T401-app` (node_modules is the junction). The Vite dev server would not finish a cold start on the loaded machine (minutes per request), so I built with `npx vite build --watch` into a scratch folder with a throwaway config and served it, plus `public/`, from a small static server on 5201 (and 4192 and 4197 for the two harnesses that start their own previews). The scratch config was deleted before the commit.

```
npx eslint <changed files>; npm run lint; npm test
node scripts/ci/design-lint.mjs ; node scripts/ci/design-lint.mjs --update-baseline   (then the four entries from T405's stray destinationPdf.js removed by hand)
node scripts/check_ownership.mjs <root>/docs/design-v6/OWNERSHIP.md
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
CARTA_PORT=5201 node scripts/verify_bottom_nav.mjs (desktop_shell, top_bar, tab_switching, filter_sheet likewise)
node scripts/verify_lifestyle.mjs ; node scripts/verify_focus_trap.mjs ; node scripts/verify_keyboard.mjs --port 5201
node scripts/verify_quality_floor.mjs after --port=5201 --vp=mobile --out=<scratch>
sh ".../impeccable/scripts/impeccable" context --target continent-app/src/App.jsx ; ... detect --json <every changed file>
```
Device walks are scratch scripts in `wt/_scratch/T401` (iPhone 13 on WebKit, Pixel 5 and 360 x 740 on Chromium, 844 x 390 landscape, 1280 x 800), all with service workers blocked. Every server was stopped, and no dist or dist-data was left in the app.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Design lint, found against baseline | 166 found, 0 new | 148 found in the shell's code, 0 new (152 in the tree with T405's stray file) | -18 |
| Shell entries in the lint baseline (shadow and outline-none) | 19 (4 + 1 in 10-shell, 13 + 1 in 14-filters) | 0 | -19 |
| Impeccable detector, 70 shell sources | 0 | 0 | 0 |
| English literals in shell files (grep) | crash screen, DateField, Dropdown, RatingBadge, TransportIcons, 90 Glyph labels | brand names and the legal prose | gone |
| Hover rules outside `(hover: hover)` in eight shell stylesheets | 70 | 4, all deliberate cancels, in 60-v6-shell.css | -66 |
| Header plus settings line on 844 x 390 (touch) | 109 px of 390 (T381 report) | 102 px | -7 px |
| Lifestyle count buttons | private 28 px | shared 44 x 44 | +16 px |
| Quality floor, phone, targets under 44 px | 16 (T391) | 7 (none in the header or bar; one is CostBar's 39 px segment, now given a hit box) | -9 |
| Quality floor, phone, text under 4.5:1, horizontal scroll, more than one primary | 3, 0, 0 | 0, 0, 0 | -3 |
| verify_bottom_nav, top_bar, filter_sheet, lifestyle | 0 failed, 0 failed, 30 of 30, OK | 0 failed, 0 failed, 30 of 30, OK | 0 |
| verify_tab_switching | 75 of 75 | 75 of 75 (one assertion updated) | 0 |
| verify_desktop_shell | 41 of 41 | 41 of 41 (exit 1 only from a console 404 on the scratch server) | 0 |
| verify_focus_trap | all | all, plus 8 new checks | +8 |
| verify_keyboard | 20 of 20 (T391) | 18 of 20 (journey and trip planner at 1280, other surfaces, row T401-f) | -2 |
| npm run lint, npm test | 0 errors, 367 pass | 0 errors (63 warnings, none in new lines but the one `tOutsideProvider` export), 368 pass | 0 |
| INP and LCP | not measured | not measured (row T401-i) | |

Figures: harness output in `wt/_scratch/T401/h/`; quality floor in `wt/_scratch/T401/qf/after/summary.json`; before figures from Execution/P10/T391-v6-v4-shell.md and T381-v6-v3-shell.md. The 70 hover figure is the scratch counter before and after the wrap script.

Phone walk (the prompt asks for it in the report). Portrait on iPhone 13, Pixel 5 and 360 x 740: no horizontal scroll on any tab and no header, settings or bar control under 44 px. All six languages at 360 (settings line, bar labels, chooser, glyph names): no horizontal scroll and no clipping after one fix, the Dutch bar label "Bestemmingen" clipped, so the bar's side padding and the plus's margins shrink at 360 px or less (second app commit). Landscape 844 x 390 on WebKit and Chromium: desktop chrome, no bar, controls at `--tap`. Tap only: the chooser opens, traps focus, closes; Lifestyle and the dates popover open by tap; nothing needs hover (hover rules are guarded). Keyboard: with the viewport cut to 60 percent, a focused Destinations search field stayed fully visible, `kbd-open` was set, the bar's display was `none` and `--bottom-nav-h` was 0; after blur the bar returned; the field now computes 16 px. Safe areas and dvh: the CSS is in place; the Windows WebKit build cannot exercise the insets. Reduced motion: every new animation has a `prefers-reduced-motion` branch and `useDialogExit` closes at once. Swipe is only a shortcut (the sheets keep their close buttons). What only a real phone can prove is row T401-b.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Vite dev server hung on cold start | ten sessions on one machine plus a cold dependency scan | Built with `--watch` into scratch and served it statically |
| Two sessions swapped changes | `git stash` is shared between worktrees; stash and pop crossed | Restored my files from my stash commit; the stray T405 files stay modified (see above) |
| i18n files showed as whole-file rewrites | stash blobs were LF where HEAD blobs are CRLF | Restored CRLF on every file whose HEAD blob is CRLF before committing |
| Bottom nav vanished on the day planner on arrival | `kbd-open` fired on a field the page focuses itself | Only a focus caused by a pointer or key in the last 800 ms counts |
| Hover-wrap script broke cancelling rules | `.lifestyle-btn:hover` and others in 60-v6-shell.css cancel an unguarded accent hover in another surface's file | Those four rules stay unwrapped, with a comment |
| verify_tab_switching timed out | Asserted Explore's own Lifestyle button, which explore's V3 and V4 removed | Assertion now takes the settings line's part first, with a comment (two places) |
| Design-lint baseline admitted four new entries | T405's stray destinationPdf.js in my tree | Removed by hand from the baseline |

## What is still open

Rows T401-a to T401-i in `Execution/_OPEN.md`: native review of 100 strings; the real-phone list; the Fraunces cause (this WebKit build applies no automatic optical sizing, so it is not synthetic bold); PlacesFilterSheet's own trap; the trips swap to DayTrack's props; two verify_keyboard failures on other surfaces; tripKml's English words; the legal prose; INP and LCP. Still open from earlier and not taken: T381-a (a phone overflow for the settings line needs a DIRECTION rule), T380-c and T380-d (design-lint and CI scripts are not the shell's files), T381-h (PlacesFilterSheet has no harness), T391-d (V6), T391-f (owner).

## Rollback procedure

App: before the merge drop branch `p10-v6-polish-shell` in the app repo; after it, `git -C continent-app revert <T401 app merge commit>` (two commits on the branch, b2477c6 and 5c0a491), which restores all 40 files including the six catalogues and the baseline. Root: revert the report commit and the plan commit; that reopens the nine closed rows and removes rows T401-a to T401-i. The two halves are independent. No data, schema or migration is involved.

## carta-design's seven questions

1. Hex values outside `:root`: none; every colour is a token or `color-mix` of tokens.
2. Gradients, colours outside DESIGN.md, a second saturated hue: none; one accent object remains per view (Done on Lifestyle, Reload on the crash screen).
3. Ochre, teal, `--danger` out of role: none.
4. Mono as prose: no; the day counter now sets words in the interface face and only figures in mono.
5. More than one primary in a view: none (quality floor 0); the crash screen's Reload is its one primary.
6. Headlines with a verb or number, em dashes, banned words: the crash title says what happened ("This page stopped working"); no em dash, middot or banned word in any changed line.
7. Remove one thing: the hand-written focus trap in SheetShell, and with it a re-run of focus on every render.

## Direction check

Rules used: DIRECTION.md part 7 (safe areas, dvh, keyboard hides the bar, 16 px inputs, hover under `(hover: hover)`, tap targets, gestures as shortcuts, landscape), part 2 (tokens only in the v6 file, exits in `--dur-2`, reduced-motion branches), R7 and R10 (the dialog family, now with exits), R8 (selection in ink, the cadence switch), and the focus rule in DIRECTION part 3. No pattern was built without a rule.
