# T180: 5.4, the shared detail-page skeleton

## Task ID

T180 (mind-map number T184). Branch p10-5-4-detail-skeleton in both repos. App commits e0d197c (the skeleton) and ea23c1d (the harness update, see below) on top of master d30a233; the root commit carries this report and the register rows.

Scope extension: after the first hand-back the orchestrator granted a narrow extension to update the four layer harnesses the new layout broke (row T180-d), because T181, T182 and T186 build on this branch and those scripts are the only automated check of the rebuilt pages. That work is commit ea23c1d and is described under "The harness update" below.

## Date

2026-10-04

## What changed

The trail, cycling, beach, lake and mountain pages now render from one component, continent-app/src/browse/DetailSkeleton.jsx. Before this task each page drew its own layout: the trail page opened on a map, the beach, lake and mountain pages opened on a location row with the photograph halfway down and no map at all, and the cycling page was not even a dialog, with its own header and no focus trap. Now all five share one shell (the bar with back, title, favourite and share, the scroll area, the focus trap) and one order of ten slots, so they read as one family. Each page still computes its own content and hands it to the skeleton as named props; the skeleton owns the order and the layout and knows nothing about any one section.

The order, which is also the phone's order, is the spec's. 1 hero: the view image full bleed at 56vh, the three-cell strip flush under it (difficulty in plain words with five squares, the one-word type, the headline number in mono), the photo credit, then the title with a mono ref chip where the data has a ref, and the breadcrumb. 2 the hook, one sentence at 19px in --ink-soft. 3 who this is not for, the T159 block unchanged. 4 the map. 5 the signature visual. 6 the collapsed rows. 7 getting there. 8 take it with you. 9 three ways out, followed by the existing cross-layer neighbours. 10 where this comes from, collapsed. On a desktop (900px and up) the page is a 60/40 grid: every slot in the left column and the map alone in the right column, position sticky, so it stays in view while the left column scrolls past.

Two departures from the spec text, both decided by carta-design, which wins. The spec asks for a semi-transparent strip laid over the lower third of the photo with the title over it; the house rule for the strip (DESIGN.md, written by T360) says solid paper, flush under the photo, nothing on the picture, so the strip sits under the photo and the title under the strip. And one slot was added between 3 and 4, called alert, for the safety notes the pages already refused to fold: the lake's swim verdict and the lake and mountain hazard lists. The journey page made the same call for its what-could-go-wrong block. It is empty on the trail and cycling pages.

How each piece is built, for whoever maintains it.

The strip reuses the T360 component, now shared as DetailStrip, with the journey page's classes. lib/detailSkeleton.js stripCells always returns three cells and puts a placeholder word in any cell the data cannot fill ("Not graded", "Not measured"). Each section maps its own difficulty onto the five squares: the trail grade (easy to alpine is already five steps, the three-step effort class stands in where the grade has not reached a route), the mountain's way up (walk up, hike, mountain hike, scramble, alpine), the access field for beaches and lakes (road 1, steps 2, on foot or by boat 3), and for cycling a stand-in from climb per kilometre (under 5, 10 and 15 m a km) marked with the derived tilde, because the cycling wire has no grade of its own until spec 7.7 is built. The type is the trail's kind, the beach's surface, the lake's and mountain's kind word, and for cycling the bike the route asks for or "Tour". The headline number is the length for trails, cycling and beaches, the area for lakes and the height for mountains.

The rows are T164's Good to know row, now shared as DetailRow, with one change: a closed row keeps its body in the document with the hidden attribute instead of unmounting it, so aria-controls always points at something and a figure inside keeps its state between taps. Every block that used to sit open under the facts became one row with a six-word summary (previewWords, moved from JourneyPage.jsx into lib/detailSkeleton.js so both pages preview the same way). On the sample pages that is 7 rows on the trail, 5 on the cycling route and the lake, 4 on the beach and the mountain. The spec asks for six to eight; the beach and mountain pages have only four blocks of their own today, and T182's derived modules are what fill them up.

The map slot holds the existing line maps on the trail and cycling pages, moved, and a new lazy point map for the beach, lake and mountain (browse/PointMap.jsx, same basemap and pin as the trail page). Those three pages used to skip a map to save maplibre's weight; the spec puts a map on every detail page, and as its own lazy chunk (1.08 kB, plus the maplibre chunk the trail and cycling pages already share) it costs nothing until a page is open. The trail page's live follow still works: in follow mode the map leaves the sticky column and covers the page under the bar exactly as before, checked at both widths, and Escape leaves the mode first and closes the page second.

Getting there is always rendered. The beach, lake and mountain pages put their maps-app link with the coordinates there, then the base town button, which stays each page's one accent primary. The mountain's way-up banner moved here too, because it is how you get up. The trail keeps its trailhead block and the city day its priced button; the cycling page gains a directions link to the first point of the line and a sentence naming the stations along the route from the services the wire already carries. Take it with you holds the trail's GPX (still the primary), the Google Maps file, follow, the cycling route's GPX, and on every page a "Send the link" button through the existing share sheet.

The three ways out come from lib/detailSkeleton.js placeExits and hooks/usePlaceExits.js. The page loads its own country list through the cached loaders (loadBeaches and friends), takes the forty closest siblings, and picks: easier, a lower level, the closest; cheaper, a base town whose night costs at least 15 percent less (the threshold T171 used), the closest; nearby, the closest of all. The night price is stayPerNight from costIndex.js, the same figure the cards and the receipt use, read from the shared catalogue for the base ids the wire carries (beach.base.id, lake.base.id, mountain.near.dest_id, and for trails the nearest catalogue town within 30 km). An empty slot is filled with the next closest place under the nearby label, T171's fill rule, so every sample page shows three. A click opens the other page through the existing onOpenNeighbour door, so DestinationsTab did not change.

Where this comes from is the shared CreditFold, which now takes children: the page's source links, the credit lines, the licence text and the FigureFooter split with its last-checked month.

The journey page did not move onto the skeleton (it belongs to the trips spec and has its own folds), but it now draws its strip, its Good to know rows and its exits through the same three shared components, so a change to any of them changes both families.

## Where T181 and T182 plug in

T181 (signature visuals): each page passes its figure as the signature prop of DetailPage. Today that is the elevation chart on the trail page, the surface and traffic block on the cycling page, the season strip on the lake and mountain pages, and nothing on the beach page. Replace those props; the slot is full width of the left column and already has the section heading style. The beach's three month strips go in the same prop in BeachPage.jsx, which currently passes none.

T182 (derived modules): each page builds a rows array just above its return statement; a module is one more entry, { key, icon, label, summary, body }, with a 20px icon from Icons.jsx and a summary from previewWords. The rows render in array order, closed. The bento grid that would replace the list belongs to T179 and waits on its carta-design rule (row T180-a).

## The harness update (T180-d, commit ea23c1d)

verify_beaches.mjs, verify_lakes.mjs, verify_mountains.mjs and verify_trail_page.mjs now read the skeleton's DOM. Each gained a small openRowWith helper that opens the collapsed row holding a selector before its text is read, the way a reader gets at it; counts need no help, because a closed row keeps its body in the page. The page-wide text checks (untranslated keys, no GPX or KML on a beach, lake or mountain, no route description on a mountain) read the skeleton's textContent instead of the removed .bpage-wrap's innerText, so they now cover the folded rows too and are stricter than before. The trail page clicks "Send the link" for the share check, and its desktop column check measures the 60/40 grid's left column (665 px at 1280) and adds that the map sits beside it, sticky.

Three assertions encoded the old design and were turned round to assert the new one, each with a comment saying why. "No map canvas on a beach page" (and on a lake and a mountain page) is now "the beach is drawn on a map", because spec 5.4 puts a map on every detail page. "The verdict sits above the photograph" on the lake page is now "the verdict is never folded and comes before the map and the rows": the view image comes first on every page now, and the guarantee the old check protected, that the reader cannot miss the verdict, is what the new one tests. The old version had in fact gone vacuous with the skeleton, passing because the gallery it compared against no longer existed. The mountain's "way up sits above the photograph" is now "the way up sits in Getting there, never folded", for the same reason. Each layer harness also gained two checks: three cells under the hero, and Getting there present and unfolded. No check that still held was loosened.

| Harness (PASS lines) | Before T180 | After e0d197c | After ea23c1d |
|---|---|---|---|
| verify_beaches | 66 of 66 | 54, then throws | 68 of 68 |
| verify_lakes | 79 of 79 | 67, then throws | 81 of 81 |
| verify_mountains | 81 of 81 | 69, then throws | 83 of 83 |
| verify_trail_page | 49 of 49 | aborts at line 198 | 50 of 50 |
| verify_cycling | 70 of 72 | 70 of 72 | 70 of 72, the same two wire failures |

Logs are in C:\Users\Gebruiker\Documents\Portfolio\wt\T180-shots\harness-before, harness-after and harness-d. One gap the run surfaced and this extension does not fix: the lake harness's month-strip checks look for .lpage-months and .lpage-season .bpage-note, which the shared MonthStrip (T287) replaced before this task, so both checks pass on their "no strip on this lake" branch for every lake (row T180-l).

## Files touched

Modified (continent-app, commit e0d197c):
- src/browse/BeachPage.jsx, LakePage.jsx, MountainPage.jsx, TrailPage.jsx, CyclePage.jsx (each renders through DetailPage; the old shell state, focus trap and title observer moved into the skeleton)
- src/browse/JourneyPage.jsx (strip, Good to know rows and exits through the shared components; previewWords imported)
- src/browse/CreditFold.jsx (optional children)
- src/styles.css (one import line)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (24 detail.* keys each, CRLF and BOMs kept, all six parse)

Created (continent-app):
- src/browse/DetailSkeleton.jsx, src/browse/PointMap.jsx, src/hooks/usePlaceExits.js, src/lib/detailSkeleton.js, src/styles/28-detail-skeleton.css, tests/detailSkeleton.test.mjs

Modified (continent-app, commit ea23c1d, under the scope extension): scripts/verify_beaches.mjs, scripts/verify_lakes.mjs, scripts/verify_mountains.mjs, scripts/verify_trail_page.mjs.

Root: Execution/P10/T180-detail-page-skeleton.md, Execution/_OPEN.md.

## Commands run

In C:\Users\Gebruiker\Documents\Portfolio\wt\T180-app, with a temporary Vite config inside the worktree that only set cacheDir to wt\vite-cache-t180 (deleted before the commit):

```
node node_modules/vite/bin/vite.js build --config vite.t180.local.mjs      (base, before any edit)
node node_modules/vite/bin/vite.js preview --config vite.t180.local.mjs --port 5203 --strictPort --host 127.0.0.1
CARTA_PORT=5203 node scripts/verify_{beaches,lakes,mountains,cycling,trail_page}.mjs http://127.0.0.1:5203/
node ../T180-shots.mjs 5203 before
(edits)
node --test tests/detailSkeleton.test.mjs
npm run lint
npm test
node scripts/ci/design-lint.mjs
node scripts/ci/banned-terms.mjs
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
node node_modules/vite/bin/vite.js build --config vite.t180.local.mjs      (branch)
node node_modules/vite/bin/vite.js preview ... --port 5203 --strictPort
CARTA_PORT=5203 node scripts/verify_{beaches,lakes,mountains,cycling,trail_page}.mjs http://127.0.0.1:5203/
node scripts/verify_keyboard.mjs --port 5203 --out ../T180-shots/keyboard
node ../T180-shots.mjs 5203 after ; node ../T180-interact.mjs 5203 ; node ../T180-tabwalk.mjs 5203
rm -rf dist dist-data
(harness update) node --check scripts/verify_{beaches,lakes,mountains,trail_page}.mjs
node node_modules/vite/bin/vite.js build --config vite.t180.local.mjs ; vite preview on 5203
CARTA_PORT=5203 node scripts/verify_{beaches,lakes,mountains,cycling,trail_page}.mjs http://127.0.0.1:5203/
rm -rf dist dist-data
```

The dev and preview servers were stopped afterwards. Screenshots (each page at 380 and 1280 px, top, middle and end), the harness logs before and after and the keyboard audit are in C:\Users\Gebruiker\Documents\Portfolio\wt\T180-shots\, outside the repo; the three throwaway scripts sit beside it in wt\.

## Config and secrets set

None.

## Before/after measurements

From the browser check (T180-shots/before and after, report.json) on one sample of each page: trail 197956 in Italy, Guvano beach, Lake Como, Mont Blanc, and cycling route 10 in Luxembourg; the rest from the build logs and the tools named.

| Metric | Before | After | Delta |
|---|---|---|---|
| Detail pages that render from the shared skeleton | 0 of 5 | 5 of 5 | +5 |
| Pages with the three-cell strip under the hero | 0 of 5 | 5 of 5 | +5 |
| Pages with a map | 2 of 5 (trail, cycling) | 5 of 5 | +3 |
| Pages with a sticky map column at 1280 px | 0 | 5 | +5 |
| Pages with three computed ways out | 0 of 5 | 5 of 5 (3 each on the samples) | +5 |
| Collapsed rows on the sample pages, closed on arrival | 0 | trail 7, cycling 5, lake 5, beach 4, mountain 4 | |
| Hero height at 380 / 1280 px | photo inside the column | 448 / 482 px (56vh) | |
| Horizontal overflow at 380 and 1280 px | 0 | 0 | 0 |
| Page errors while opening the five pages | 0 | 0 | 0 |
| Cycling page keeps keyboard focus inside it | no (not a dialog) | yes, 18 stops then wraps | |
| verify_keyboard.mjs surface checks | 20 of 20 (T190) | 20 of 20 | 0 |
| npm run lint | 0 errors, 72 warnings | 0 errors, 72 warnings | 0 |
| npm test | 166 pass | 171 pass (5 new) | +5 |
| design-lint new violations | 0 (202 in baseline) | 0 (202 in baseline) | 0 |
| Page chunks, kB (beach, lake, mountain, cycling, trail) | 9.79, 10.24, 10.78, 14.47, 24.23 | 9.65, 10.29, 10.63, 17.51, 24.88, plus usePlaceExits 4.07 and PointMap 1.08 | |
| Main stylesheet | 689.96 kB | 693.00 kB | +3.04 kB |

The layer harnesses were written for the old layouts and partly failed on the skeleton commit alone, which the next table records; the harness update above brings all four back to a full pass.

| Harness (PASS lines) | Before | After |
|---|---|---|
| verify_beaches | 66, all passed | 54, then throws reading .bpage-wrap |
| verify_lakes | 79, all passed | 67, then throws reading .bpage-wrap |
| verify_mountains | 81, all passed | 69, then throws reading .bpage-wrap |
| verify_cycling | 70 of 72 (two wire checks) | 70 of 72 (the same two) |
| verify_trail_page | 49, all passed | aborts at line 198, looking for a .tpage-act labelled share |

I kept the class names those harnesses read wherever it cost nothing (.bpage-why, .bpage-shot on the hero, .tpage-why and .tpage-expect around the row lists, every cycling data-testid), which took the beach, lake and mountain harnesses from three failures to one. The rest are assertions about the old design: they read the removed .bpage-wrap column, assert that a beach page has no map canvas, which spec 5.4 now reverses, look for a button labelled share (it is "Send the link" now, the bar's icon keeps "Share" as its name), and measure the old 760 px .tpage-col. They were first left as row T180-d; the scope extension then updated them (commit ea23c1d) and T180-d is closed by T180.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Vite would not start from a config outside the worktree | The config is bundled where it sits and could not resolve vite from wt\ | A temporary config inside the worktree, deleted before the commit |
| Harnesses timed out on the dev server | The first page load on a cold dev server took over 45 s | Ran them against a vite preview of a build |
| Two edit scripts wrote broken markers | The bash heredoc ate the backslashes in the Python | Wrote the scripts with the editor instead |
| The beach map opened inland with no pin | The frame was still settling its size when maplibre measured it | Resize and recentre on the style's load event |
| Exit lines like "3 km away, about €31 a night to stay" were set in mono | The shared exits list was always mono, right for the journey's figure rows | A mono flag per exit; the five pages' sentences are in the sans |
| The strip turned "Steps down from the road" into title case | The T360 strip capitalises every word | stripCells capitalises the first letter, the skeleton strip turns the transform off |
| Section headings lost their style | The beach, lake and mountain heading rule hung off .bpage-wrap, which is gone | One heading rule for every slot section |
| The harness edit script matched nothing on its first run | The four scripts are stored with CRLF and the markers were written with LF | The script normalises line endings, edits, and writes the CRLF back |
| The new hook file was flagged by fast refresh | Hooks exported from a component file | Moved to src/hooks/usePlaceExits.js |

## Seven questions before shipping (carta-design)

1. No hex value outside :root; the new stylesheet uses tokens only.
2. No gradient, no new colour, no second saturated hue.
3. Ochre stays on the rating seals, teal on the lake and mountain gem labels, --danger unused.
4. Mono carries the headline number, the ref chip and the coordinates only; the exit sentences moved out of mono.
5. One accent primary per page: the base-town button on beach, lake and mountain, the GPX on the trail; the browser count of accent-filled controls is unchanged at both widths.
6. New headings carry a verb or a number ("Take it with you", "Three other places to try", "Getting there"); no em dashes, middots or banned words in the diff.
7. Removed: the mountain's second mono height next to its score, now that the strip carries the height, and an unused overlay prop on the skeleton.

## What is still open

The bento grid for slot 6 waits on a carta-design rule (T179's owner gate), so slot 6 is T164's row list for now (T180-a). The 3D toggle and "Fly the route" belong to the terrain and flyover work of waves 16 and 19 and are not drawn; the map slot's top right is where the toggle goes (T180-b). Take it with you has no checklist on any of the five pages, because no layer carries one, and no GPX on beach, lake, mountain or a cycling tour; journey GPX still waits on the T177-b track wire (T180-c). The four layer harnesses were updated to the skeleton under the scope extension, so T180-d is closed; the lake harness's month-strip checks were already vacuous before this task and are left as T180-l. The cards that open these five pages do not start the card-to-hero transition, although the hero claims its key (T180-e), and HeroPreload still preloads at the old 860 px size while the hero is full bleed (T180-f); both live in DestinationsTab.jsx, which this task did not touch. A #tour= link crashes the app with invalid_argument on the base build as well as the branch, because DestinationsTab asks for a country name with no country (T180-g); tours open fine from the list. The stand-in difficulty scales on the strip need the owner's yes (T180-h), and so does the question of moving the journey page onto the shell (T180-i). The non-English strings are my translations (T180-j). The cheaper exit never fires on cycling, which has no base town on the wire, and on trails it guesses the nearest town (T180-k).

Checked by hand: the five sample pages at 380 and 1280 px, follow mode on the trail page, a row opening alone, the sources fold, an exit opening another trail, Escape closing the page, and a Tab walk on all five that never left the dialog and never landed on a hidden control. Not checked: a tour page in the browser (the link crashes, see T180-g; the cycling harness opened one from the list), and any screen reader.

## Rollback procedure

In continent-app, git revert ea23c1d e0d197c, in that order (or drop the branch before merging). Reverting only e0d197c would leave the harnesses asserting the skeleton. In the root repo, revert the report commit, which also removes the T180 rows from Execution/_OPEN.md. No data, schema, migration, wire or stored state changed.
