# T190: Keyboard and map accessibility

## Task ID

T190 (mind-map T343). Branch p10-keyboard-map-a11y in both repos. App commit 8927233 on top of master eea4eee; the root commit carries this report and the register rows.

## Date

2026-10-03

## What changed

Every map in the app can now be used from the keyboard, and the audit that proves it lives in the repo as continent-app/scripts/verify_keyboard.mjs. It walks ten surfaces with the Tab key at 380 px and 1280 px. On the base build 11 of its 20 checks passed; on the branch all 20 pass.

The hard surface was the Explore map. Its pins are pixels in a WebGL canvas, so nothing in them can take focus. The canvas itself always could (maplibre gives it tabindex 0, the arrow keys pan and the plus and minus keys zoom), but a keyboard user could only move the map, never reach a place on it. ExploreMap.jsx now lays a layer of real buttons over the canvas, one per pin or cluster the map is drawing at that moment. Each button is transparent, centred on its pin and sized to it, so the house focus ring lands on the dot the reader is looking at, and each has pointer-events none, so the mouse and a finger still talk to the canvas exactly as before. Focus on a place shows the same tip or card a hover shows, Escape hides it without moving focus, and Enter opens the place. Enter on a cluster zooms into it and parks focus on the canvas, so the next Tab walks the pins it split into. The layer is rebuilt when the map goes idle and repositioned on every move frame through refs, without a React render. It holds at most 30 stops: the best-rated pins in view, put in reading order (bands of 64 px, top to bottom, left to right). A keyboard walk through 300 dots helps nobody; zooming in, or the list beside the map on a desktop, reaches the rest. Pins whose record has not loaded yet are left out because they have no name to read; they join on the idle after their country arrives.

On a desktop the Explore map sits beside an infinitely scrolling list, and the list came first in the DOM. The canvas was never reached in 220 Tab presses on the base build, and on a long list it would never be reached at all. ExploreTab.jsx now renders the map before the list and the stylesheet places it in the right-hand column, so the canvas is the fourth stop after the control bar. The picture on screen is unchanged.

The other maps build their pins as DOM elements handed to maplibregl.Marker. The destination page's numbered highlight pins, its nature and day-trip pins, the trip page's stop pins and the day planner's stay pin listened for click on a div: reachable by mouse, invisible to Tab. The new continent-app/src/map/pinKeys.js gives such an element a tab stop, the button role, a name, and Enter or Space doing what the click does. Pins with nothing behind them stay out of the tab order. Two more problems surfaced on the way and are fixed in the same file. maplibre's Marker.addTo() stamps aria-label="Map marker" on every marker element, which replaced the real name of every pin that is a button, so a screen reader heard "Map marker" for every highlight, stop and place (nameMarker puts the name back, at every place a pin is built in DestMap, TripMap, DayExploreMap and CityPickerMap). And a pin that took focus while it sat outside the map frame, after the reader had panned with the arrows, was focused where nobody could see it; such a pin now pans the map to itself first, and a pin the declutter pass had shrunk to a dot gets its name back while it holds focus (map/coords.js leaves a focused pin alone).

The destination page's map layer switch (Highlights, Within 20 km, Day trips) claimed role="tablist" without behaving like one. It is now one tab stop, the arrow keys move between layers and switch as they go, and Home and End jump to the ends.

The Lifestyle panel, which prices every figure in the app, opened as a drawer with no dialog semantics. Focus stayed on the button that opened it, and Tab walked the Explore grid hidden behind the scrim: 220 stops, every one of them covered. It is now a dialog: focus moves to its close button, Tab stays inside, Escape closes it and focus returns to the Lifestyle button. Its controls as they stand today (the four ways to sleep, the hotel grades, the six presets, the fine-tune disclosure, the week or day switch and the twelve stepper buttons) are all walked with a visible ring. The cadence buttons now say which is pressed, and the stepper value is announced politely when it changes.

The shared focus trap (hooks/useFocusTrap.js) had four faults. Its edges were taken from a selector that also matched controls which cannot take focus, so on the destination page Tab on the real last control fell out of the trap and the walk stuck there; the edges now come from controls that are rendered, visible and not inside a closed details. It listed onClose as an effect dependency while App passes inline arrows, so every App render re-ran the trap and snapped focus back to the close button; onClose is now read through a ref. Focus that drops to the body (a control unmounting under it) now comes back in at the edge Tab points to. And every trap listens on the document in the capture phase, oldest first, so one Escape closed a nested overlay and the page under it together; only the newest trap answers Escape now. Ten overlays use this hook, so all of them gain these fixes.

The phone bottom sheets of the trip and day planners resize by dragging a grip or toggle by tapping it. The grip is now a focusable separator with a value: Enter or Space does what a tap does, the arrows move the edge a tenth of the screen, Home tucks it to the peek and End raises it fully (planner/sheetGripKeys.js). A stop row in the trip planner was selectable only by clicking the row; focus reaching any control in the row now selects it, the way the click does.

Visible focus is now guaranteed by a floor. styles/02-base.css gives every focusable element the house ring (2 px accent outline, 2 px offset) under :where(), which has zero specificity, so any component's own focus rule still wins. maplibre's controls drew a blue glow over outline none; they now take the house ring, and the canvas ring sits inside the canvas because the map frames clip anything outside. Three places where a parent clipped the ring were fixed: the week or day switch in the Lifestyle panel (an inset ring, white on the filled half), the photo credit link on the journey and layer pages (two pixels of room inside the clip), and the destination page's section rail (a focused pill now scrolls fully into the strip instead of sitting half under "Expand all"). On a phone the Explore feed tells its scroller that the floating List and Map switch covers its bottom 64 px, so a control that takes focus down there scrolls up clear of it.

## How the audit works

verify_keyboard.mjs does not start a server. It opens each surface, presses Tab until focus comes round to the first stop again (or a cap), and records every stop. Visible focus is measured, not inferred from CSS: the focused element's box plus 6 px is screenshotted focused and again after blur, and identical images mean focus left no mark. A stop is counted as covered when something else is drawn over its middle, as invisible when it has no size or is off screen, and as stuck when Tab does not move. It also counts what a mouse can click that a keyboard cannot reach (a pointer cursor on an element that is not focusable and holds nothing focusable). On the maps it focuses the canvas, checks that the arrows and the zoom key change the picture, counts the pin stops, opens a pin with Enter, and on Explore checks the tip on focus, Escape and cluster zoom. The journey, destination and Lifestyle surfaces open every fold first, so the walk covers what is inside them: on the journey page that is the wave 13 controls, the day accordion (T163), the Good to know rows (T164), the pack grid (T168), the week plan folds (T170) and the exits (T171), 52 stops in all, every one with a ring. Run it with `node scripts/verify_keyboard.mjs --port <p> --out <dir>` against a built preview; it exits 1 on any failure.

## Files touched

Modified, in continent-app: src/browse/DestMap.jsx, DestinationPage.jsx, ExploreMap.jsx, ExploreTab.jsx, LifestylePanel.jsx; src/hooks/useFocusTrap.js; src/map/CityPickerMap.jsx, DayExploreMap.jsx, TripMap.jsx, coords.js; src/planner/DayPlannerTab.jsx, TripPlannerTab.jsx; src/i18n/{en,de,es,fr,it,nl}.js (three keys each: explore.mapPinsAria, explore.pinAria, explore.clusterAria; CRLF and BOMs kept; all six parse); src/styles/02-base.css, 14-filters-panels.css, 15-map-overlays.css, 23-places-pages.css, 25-feature-pages.css.

Created: continent-app/src/map/pinKeys.js, continent-app/src/planner/sheetGripKeys.js, continent-app/scripts/verify_keyboard.mjs, this report.

Deleted: nothing. No token in :root changed, so DESIGN.md is untouched.

## Commands run

In continent-app: `node node_modules/vite/bin/vite.js build`, then `vite preview --port 5210 --strictPort --host 127.0.0.1`, then `node scripts/verify_keyboard.mjs --port 5210 --out ../T190-shots/after`. For the before figures the branch changes were stashed, the base rebuilt and the same harness run into ../T190-shots/before, then the stash popped. Then `npm run lint`, `npm test`, `npm run build`, and dist/ and dist-data/ deleted. The preview server was stopped. Evidence (both JSON files, the two logs, a screenshot per surface and width, and focused-state shots of canvas, pins and layer tabs) is in C:\Users\Gebruiker\Documents\Portfolio\wt\T190-shots\, outside the repo.

## Config and secrets set

None.

## Before/after measurements

From T190-shots/before/keyboard-audit.json and T190-shots/after/keyboard-audit.json, the same harness on the base build and the branch build, 10 surfaces at 380 px and 1280 px.

| Metric | Before | After | Delta |
|---|---|---|---|
| Surface checks passing | 11 of 20 | 20 of 20 | +9 |
| Focus stops covered by something drawn over them | 443 | 0 | -443 |
| Clickable things a keyboard cannot reach | 28 | 0 | -28 |
| Map pin stops reachable by Tab (Explore, destination, trip page, both widths) | 0 | 88 | +88 |
| Walks that got stuck (Tab did not move) | 1 | 0 | -1 |
| Tab presses from page top to the Explore map canvas, desktop | not reached in 220 | 4th stop | |
| Lifestyle panel: Escape closes, focus returns to its button | no | yes | |
| Destination map layer tabs: arrows switch, one tab stop | no | yes | |
| Stops with no visible ring | 0 | 0 | 0 |
| Page errors during the audit | 0 | 0 | 0 |
| npm run lint | 0 errors, 72 warnings | 0 errors, 72 warnings | 0 |
| npm test | 156 pass | 156 pass | 0 |

The 443 covered stops are 440 in the Lifestyle walk (focus behind the scrim) plus the floating switch over a rail link and over the map attribution on a phone, and the section rail pill on the destination page. The no-ring count reads 0 in both columns because the harness only judges the ring of a stop that is not covered: before the fix those 440 Lifestyle stops had no ring a person could see either. Three rings that the new focus floor itself pushed into a clipping parent were found and fixed during the work and are not in either column.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Destination page pins read as "Map marker" after being made focusable | maplibre's Marker.addTo() writes aria-label after the element is built | nameMarker() after every addTo in the four map files |
| Ringless photo credit link on the journey page | the new floor's 2 px offset pushed the ring outside .lpage-credit-line, which clips | two pixels of padding inside the clip, negative margin outside |
| Ringless "Per day" button in the Lifestyle panel | .panel-segment clips its buttons for the rounded ends | inset ring, white on the filled half |
| Focused pin on the destination map was off the visible frame | the audit had panned the map with the arrows before tabbing to a pin | pin pans the map to itself on focus |
| Focused pin showed as a bare dot | the declutter pass had demoted it | focus restores the name; the pass skips the focused pin |
| Python patches wrote LF into CRLF files on the first pass | text-mode read translated line endings | rewritten with byte-level CRLF; later patches used a helper that keeps endings |

## What is still open

The day carousel (T162) and the lifestyle slider (T173) do not exist yet; both wait for owner design rules. When each lands it must pass verify_keyboard.mjs, and the slider must answer the arrow keys, Home and End with a visible ring. Rows T190-a and T190-b.

The audit cannot reach states that need a built plan: the trip planner's sheet with stops (its TripMap pins, the grip and the stop rows), the day planner workspace (DayExploreMap pins, the stay pin, the grip) and the wizard's city and country picker maps. The code paths are the same ones the audit exercises on the destination and trip pages, and the grip keys were checked against a stand-in sheet, but no browser has pressed them. The trail, cycling, beach, lake, mountain and region pages are also not walked; their maps have no clickable pins, only the canvas, which now takes the house ring. Row T190-c.

The wizard's country picker map is pointer only: countries are filled polygons with no keyboard layer. The country card grid beside it does the same job and is fully reachable, which satisfies WCAG 2.1.1, but the map view on its own is not. Row T190-d.

The Lifestyle panel is now a modal dialog for the keyboard on every tab. On Explore it has a scrim, so that matches what a mouse sees; on the other tabs it opens on the left with no scrim and the page behind still takes clicks. Whether that variant gets a scrim too is a design call for the owner. Row T190-e.

This was a headless audit of keyboard operation and visible focus. It is not the EN 301 549 conformance audit: no screen reader (NVDA, VoiceOver, TalkBack) has been run, and contrast, headings and reflow were not part of it. That audit belongs to the launch gate (T204), which should also run verify_keyboard.mjs. Rows T190-f and T190-g.

## Seven questions before shipping (carta-design)

1. No hex value outside :root was added; ExploreMap's existing map paint literals are untouched.
2. No gradient, no new colour, no second saturated hue. The rings are --accent, and --on-fill on the filled half of the segment switch.
3. Ochre, teal and --danger are not used by anything in this change.
4. No mono text was added. The new pin names read "Rome, Italy, scores 9.5 out of 10", which is prose.
5. No buttons with a visible face were added, so the count of primaries per view is unchanged.
6. No headline was added. The three new strings and every comment are free of em dashes, middots and the banned words.
7. Removed: a "Skip to the map" link for the desktop split was considered and dropped. Moving the map ahead of the list in the DOM does the same job with nothing new on screen.

## Rollback procedure

In continent-app: `git revert 8927233` (or drop the branch before merging). Nothing else depends on it: no migration, no data, no wire change. In the root repo, revert the report commit, which also removes the T190 rows from Execution/_OPEN.md.
