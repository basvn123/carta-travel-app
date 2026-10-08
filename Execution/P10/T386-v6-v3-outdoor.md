# T386: structure, information and flow on the outdoor detail pages (design wave V3)

## Task ID

T386 (design wave V3, session 6; surface key `outdoor`).

## Date

2026-10-08

## What changed

The trail, cycle route, cycle tour, beach, lake and mountain pages now put the decision first, the hand-off second and the depth after it, in the order carta-design's "Detail page grammar" (DIRECTION.md part 9, outdoor N1 to N11) sets: hero, head, hook, a key facts band, one Before you go block, one hand-off band, map, signature, at most five folded rows, exits, sources. The work sits in the shared skeleton (`src/browse/DetailSkeleton.jsx`), so the six page types moved together and one DOM order still serves every width and the keyboard.

The key facts band is new (`src/browse/KeyFacts.jsx`, built by `keyFactCells()` in `src/lib/detailSkeleton.js`): four to six facts, label over value, values in mono with units, a missing value as the strip's placeholder word. A trail shows walking time, ascent, descent, high point, waymarked and season (the last two read `f.way` and `f.se` from the trails wire through new `trailWaymarked` and `trailSeason` in `src/lib/trailCards.js`; a modelled season says "est."). A cycle route shows distance, ascent, bike and paved share; a tour days, distance, ascent and bike; a beach the EU bathing water class with its sampling site, the surface, the length and which way it faces (lifeguard and the way in appear only where mapped); a lake its area, depth, warmest modelled water ("est.") and water class, led by the swim verdict in its own words; a mountain its height, prominence, way up and season.

Before you go is one block under one heading: the hazard list first, then the not-for lines. `notForLines()` takes the hazard codes the page shows (`shownHazards`) and skips a not-for line that restates one, so on Hoher Dachstein the glacier and the exposure are said once each, in the hazard list. The hand-off band holds the page's one primary (the GPX on trails, cycle routes and tours; "Price a trip to {base}" on beaches, lakes and mountains; "See {city} prices" on a city day), then Getting there and Take it with you, stacked on a phone and side by side from 900 px. Getting there names a town before any coordinate and says in one sentence when Carta has no stop data (`detail.noStopData`); a cycle route lists its stations with their km along the line. "Add to a day plan" left the head for the band; "Send the link" left the band (the page bar's share icon is the one share door); "Report a problem" moved into the sources fold.

A cycle tour now has a GPX of its own with one track per day, cut from the tour line at each stage's `start_m` and `end_m` (`splitTourByStages` and `cycleGpx` in `src/lib/trailExport.js`); the cycle route's GPX uses the same writer, goes through the share sheet on a phone that takes files, and takes the primary look. The cycle route's three bike claims now agree (row T375-b): when the bike field asks for a gravel or mountain bike, `surfaceLine` says "{pct}% paved, but the roughest stretch needs a gravel or mountain bike" instead of "Paved throughout", and the "a road bike is fine" number sentence is not shown. The beach score's two extra doors (the chip button and "See how this score is made up") are gone and the score row carries each part's weight; the mountain's "How you get up" row is gone (the way-up block stays in Getting there); the beach signature no longer draws three empty month tracks (it draws the bathing water class on the EU four-step scale, and the missing sea, wave and crowd records are named once in the sources); the mountain signature lost its empty horizon row; the trail's surface bar joined the slope profile as a second track; the cycle route's elevation profile leads its instrument instead of sitting in a folded row. Rows are grouped (About this walk, beach or lake; The route; Photographs; the measurements; the score) to four per page on the five measured pages, a row's preview is never the hook (`previewNotHook`) and wraps to two lines instead of cutting a word, and a stage that cannot open is a plain line, never a disabled button (`src/browse/RouteParts.jsx`). The back control names its list on every page ("Trails", "Cycle routes", "Beaches", "Lakes", "Mountains").

Two small fixes came along because the quality floor and the brief named them: the Loop chip is an ink outline (it failed 4.5:1 at 3.83:1 as accent on `--accent-bg`, and a descriptor is not an action), and lake and mountain areas read km² instead of km2. The one `100vh` in `src/styles/28-detail-skeleton.css` is now `100dvh`.

## Files touched

**Modified (app repo, branch p10-v6-build-outdoor):**
- src/browse/DetailSkeleton.jsx
- src/browse/TrailPage.jsx
- src/browse/CyclePage.jsx
- src/browse/BeachPage.jsx
- src/browse/LakePage.jsx
- src/browse/MountainPage.jsx
- src/browse/Signature.jsx
- src/browse/RouteParts.jsx
- src/lib/detailSkeleton.js
- src/lib/notFor.js
- src/lib/cycleStory.js
- src/lib/trailCards.js
- src/lib/trailExport.js
- src/styles/28-detail-skeleton.css
- src/styles/65-v6-outdoor.css
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (30 new keys each, no key changed or removed)
- scripts/verify_trail_page.mjs, verify_beaches.mjs, verify_lakes.mjs, verify_mountains.mjs, verify_cycling.mjs, verify_route_page.mjs (assertions that encoded the old design updated with a comment each; one check added to verify_trail_page and three to verify_cycling)

**Created (app repo):**
- src/browse/KeyFacts.jsx
- tests/outdoorV3.test.mjs

**Modified (root repo, branch p10-v6-build-outdoor):**
- docs/design-v6/OWNERSHIP.md (KeyFacts.jsx to outdoor; outdoor 44 files)
- Execution/_OPEN.md (rows T386-a to T386-i; T375-b and T375-e closed)

**Created (root repo):**
- docs/design-v6/plans/V3-outdoor.md (the plan, committed before the first app edit)
- Execution/P10/T386-v6-v3-outdoor.md (this report)

**Deleted:** none.

## Commands run

All in the two worktrees (`wt/T386` root, `wt/T386-app` app), Vite on port 5206, never the main checkout.

```
# impeccable setup, from the root worktree
sh ".../.claude/skills/impeccable/scripts/impeccable" context --target continent-app/src/browse/DetailSkeleton.jsx
# baseline (row T375-e), before any change
cd wt/T386-app; npx vite --port 5206 --strictPort        # background, stopped after use
CARTA_PORT=5206 node scripts/verify_trail_page.mjs        # and verify_beaches, verify_lakes, verify_mountains,
                                                          # verify_cycling, verify_trail_free_gpx, verify_trails
npx vite build; node scripts/verify_route_page.mjs; rm -r dist
node wt/_scratch/T386/scripts/shoot.mjs V1 desktop ... --save   # 1280 px before shots
# after
node --test tests/outdoorV3.test.mjs; npm test; npm run lint; node scripts/ci/design-lint.mjs
node scripts/check_ownership.mjs ../T386/docs/design-v6/OWNERSHIP.md
sh ".../impeccable" detect --json <every changed src file>
CARTA_PORT=5206 node scripts/verify_<the eight>.mjs
node scripts/verify_keyboard.mjs --port 5206
node scripts/verify_quality_floor.mjs after --port=5206 --only=detail --out=wt/_scratch/T386/qf
npm run build; node scripts/verify_route_page.mjs; rm -r dist shots
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
```

Scratch scripts, logs and measurement JSON are in `wt/_scratch/T386/` (outside both repos).

## Config and secrets set

None. The app worktree's node_modules junction pointed at the private install `wt/_scratch/T384/nmfull/node_modules` during the session (row T384-a) and was repointed to the main checkout's `continent-app/node_modules` at the end.

## Before/after measurements

Slot tops inside the page's scroll box, in px, iPhone 13 viewport (WebKit, 390 x 844, device descriptor), each page opened by its share link. "Before" was measured on this branch before the first edit (V2 changed nothing a traveller sees). Source: `wt/_scratch/T386/before-iphone.json`, `after-iphone-save.json`.

| Page | Key facts, before (hook) | Key facts, after | Hand-off, before (Getting there) | Hand-off, after | Rows before | Rows after | Page height before | after |
|---|---|---|---|---|---|---|---|---|
| trail 20050 | 582 | 574 | 1698 | 912 | 7 | 4 | 2458 | 2634 |
| beach Es Trenc | 628 | 598 | 1736 | 915 | 6 | 4 | 2360 | 2313 |
| lake Attersee | 609 | 598 | 1999 | 1093 | 5 | 4 | 2623 | 2768 |
| mountain Hoher Dachstein | 648 | 663 | 2064 | 1198 | 5 | 4 | 2863 | 2881 |
| cycle route 1150 | 615 | 658 | 1748 | 918 | 5 | 4 | 2430 | 2774 |

The plan's done condition holds on all five: the key facts band starts above 800 px (574 to 663) and the hand-off band above 1400 px (912 to 1198). Pages grew where content that used to be folded now stands open (the key facts, the cycle elevation profile in the signature, the cycle station list). On desktop (1280 x 800, `before-desktop.json`, `after-desktop.json`) the hand-off moved from 1465 to 1719 px to 937 to 1147 px.

| Metric | Before | After | Delta |
|---|---|---|---|
| Accent-filled controls per page (trail, beach, lake, mountain, cycle) | 1, 1, 1, 1, 0 | 1, 1, 1, 1, 1 | the cycle route gained its primary |
| Duplicate doors on the six pages | beach score chip button, beach score hint, "Send the link" on five pages, mountain "How you get up" row | 0 | 8 removed |
| Disabled stage buttons on the trail page | every stage | 0 | plain line or a working link |
| Empty signature tracks (beach, mountain) | 3, 1 | 0, 0 | 4 removed |
| GPX for a cycle tour | none | one file, one track per day (3 tracks for 3 days) | added |
| Unit tests (`npm test`) | 341 | 348, all pass | 7 new in tests/outdoorV3.test.mjs |
| impeccable detect over the changed src files | 0 | 0 | 0 |
| Design lint new violations | 0 (213 baseline) | 0 (213 baseline) | 0 |
| `npm run lint` errors | 0 | 0 | 0 |
| verify_trail_page | 50 of 50 | 51 of 51 | one check added |
| verify_beaches | 68 of 68 | 67 of 67 | the "tapping again closes it" check went with the door it tested |
| verify_lakes | 81 of 81 | 81 of 81 | 2 assertions updated |
| verify_mountains | 83 of 83 | 83 of 83 | 1 assertion updated |
| verify_cycling | 70 of 72 | 76 of 78 | 6 new tour GPX checks pass; the same 2 wire checks fail (row T386-h) |
| verify_route_page | crashed before its first check (strict mode on .rsurf-keys) | 13 of 13 | 3 locators scoped, with comments |
| verify_trail_free_gpx | 18 of 18 | 18 of 18 | 0 |
| verify_trails | 34 of 34 | 34 of 34 | 0 |
| verify_keyboard | not run | 20 of 20 | |
| verify_quality_floor, detail pages, text under 4.5:1 | 4 (the Loop chip) | 0 | 4 fixed |

The test count before is 348 minus the 7 tests this task added.

Phone checks (T414), with the device descriptors: horizontal overflow 0 px on all five pages on iPhone 13 (WebKit), Pixel 5, 360 x 740 (isMobile, hasTouch) and iPhone 13 landscape (844 x 390); one accent-filled control on every page on every device; key facts at 609 to 706 px and the hand-off at 947 to 1282 px on the Android sizes, 431 to 494 and 690 to 946 in landscape. The quality floor counts 0 phone targets under 44 px on the ten detail screens. Every new `:hover` rule sits in `@media (hover: hover)`; nothing on these pages depends on hover or on a swipe. The skeleton's bottom padding already reads `env(safe-area-inset-bottom)`; the sticky desktop map now uses `100dvh`. The primary sits at 912 to 1198 px on a 844 px phone, so it is in the lower half after one scroll rather than on the first screen; the V4 hero cap at 40 percent of the viewport (brief V4-1) brings it up by about 135 px. The keyboard check found one problem in a shell component (row T386-d): with the viewport 40 percent shorter, the Report a problem sheet's "Send report" button falls below the visible area.

After screenshots, viewport only, JPEG 80, in `design-v6-shots/outdoor/`: `V3-<trail|beach|lake|mountain|cycle>-<iphone|desktop>.jpg` (ten). The 1280 px before set row T375-e asked for is `V1-<trail|beach|lake|mountain|cycle>-desktop.jpg` (five); the tour could not be shot before or after because its share link still crashes on this branch (T375-a, fixed by T384 in this wave).

## Choices where impeccable would have asked

The run is unattended (owner, 2026-10-07), so each open call took the option that keeps Carta's palette, type and identity. The band is a plain `dl` with hairlines, no card, as N1 says. The primary keeps its existing classes (`.tpage-primary`, `.bpage-base`, `.cycle-gpx`, `.tpage-cta`) plus `.dsk-primary`, and the v6 sheet gives all of them the 6 px radius and `--tap`, so the harnesses and the journey page see the same names. The lake's swim verdict leads the key facts band as a block of its own words rather than a cell, because it is the one claim that can hurt somebody; its green container stays until V4 applies N6. The hazard list keeps its amber note and lost its own heading (the block's "Before you go" is the one h2); its old words are its aria-label. The beach signature draws the water class on the EU's own four-step scale rather than any invented track. The mountain's "Way up" fact repeats the data's lift claim as it stands; whether that lift reaches the summit is a data question (row T386-e). No new token, colour, font or gradient was added.

## carta-design's seven questions

1. Any hex value outside `:root`? No; every rule in `65-v6-outdoor.css` uses tokens, and the design lint reports 0 new violations.
2. Any gradient, a colour not in DESIGN.md, a second saturated hue? No. The Loop chip lost the accent; nothing gained a hue.
3. Ochre only for ratings, teal only for gems, `--danger` only for destruction? Yes; the rating chips and the gem label are untouched, and nothing new uses them.
4. Any mono text that is prose, or a column number in the sans? The key facts values in mono are measured figures with units (7.8 h, 985 m, 1248 m, 25.2 km); words (Yes, Gravel bike, Excellent) stay in the sans. The season "Jun to Oct" is set in mono as a month range, the way the strip sets its number cell.
5. More than one primary in a view? No: one accent-filled control per page on every device, counted by the shot script and by the quality floor (0 views with more than one).
6. Every headline with a verb or a number, no em dashes or banned words? "Before you go" and "How clean the water is" carry verbs; the other new strings are labels and row names, which the rule does not cover. The diff has no em or en dash, no middot, and none of the banned words (checked by grep over every changed file).
7. Remove one thing: the hazard list's own heading, which said "Before you go" a second time directly under the block heading of the same words.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| verify_route_page crashed before any check, on the baseline | Two key lists carry `.rsurf-keys` since T181 and the bare locator failed in strict mode | Locators scoped to the surface bar's wrapper (`[data-testid="route-surface"]`), with a comment |
| verify_route_page "every segment is painted" failed once it could run | The unknown share is drawn as the bar's own ground on purpose (MixBar) | The check reads the measured segments only, with a comment |
| verify_trail_page could not find "Send the link" | The button left the band by design | The check presses the bar's share icon and adds a check that the band has no second share door |
| verify_beaches looked for the score chip button | The duplicate door was removed by design | The check proves the chip is not a button and reads the weights in the score row |
| verify_lakes and verify_mountains looked for the verdict in the alert slot and an h2 in the hazard list | The verdict moved into the key facts band; the hazard list's heading became the block's | Assertions read the new slots, with comments |
| "Mostly paved, 100%" would have been printed for a fully paved gravel route | A first draft capped the figure at 99 | Replaced by a new sentence that keeps the measured share (`cycle.surfacePavedRough`) |
| Two harnesses were committed with LF where the repo stores CRLF | sed in Git Bash rewrote line endings | Re-added with `core.autocrlf=false` before the commit was final, so the diff shows only the real edits |

## What is still open

The cost line on an outdoor page (brief V3-11, accepted as the "Cost on cards and pages" rule) is not built. The figure must come from `src/lib/costIndex.js` at the traveller's Lifestyle so that it agrees with the receipt to the cent, and the outdoor pages do not receive the Lifestyle choices: `DestinationsTab.jsx` (destinations) mounts them without, and no shell hook exposes them. Either destinations passes the choices as a prop or shell adds a hook; then V4 or V5 adds one mono line beside the place primary (row T386-a).

The 30 new strings in de, es, fr, it and nl were written by this session and need a native reader (row T386-b). What only a real phone can prove is listed in row T386-c: the real keyboard against `100dvh` on the Report a problem sheet, scroll momentum, iOS Safari's bottom bar collapse in landscape on a detail page, and the share sheet handing the trail and tour GPX to a hiking app. The Report a problem sheet (shell's ReportProblem) puts its submit below the visible area when the keyboard takes 40 percent of the height (row T386-d).

Hoher Dachstein carries a hand-kept lift "Cable car to the top" (Dachstein Südwandbahn), which ends at Hunerkogel below the summit, so the page says "Cable car to the top" beside "Alpine route" and the glacier hazard; this is the data question the brief raised as P1, now also in the key facts band (row T386-e, data lane, beside T375-c).

The tour share link still crashes on this branch (T375-a, fixed in `DestinationsTab.jsx` by T384, which merges in this wave). After both merge, `#tour=de-usedom-rundweg-relaxed` should open the tour page with its new GPX; the tour has no V3 screenshot for that reason (row T386-f).

Items of the brief left for later waves, with the reason: the photo strips still use `role=tab` (the photo track is V4-4), the swim verdict and the way-up block keep their green containers (N6 is V4-10), the six titles are not one size yet (V4-7), there is no section rail (V4-8), the cycle family page keeps its own layout (V5), the tour's signature still shows its first route's surface instrument rather than a per-day profile (needs tour elevation data on the wire), and "Part of {name}" on a stage is text, not a link to the family page (the family has no page id on the trail wire) (row T386-g).

Code this task left unused, for the V5 cleanup after a grep: `MountainWayUp` in `DerivedModules.jsx`, `mountainWayUp` and `wayUpSummary` in `derivedModules.js` (still tested), the `detail.stationsOnRoute`, `beach.scoreTap`, `beach.scoreHide`, `sig.beachNote`, `sig.beachHead`, `sig.rowSea`, `sig.rowWaves`, `sig.rowCrowds`, `sig.rowHorizon` and `sig.notComputed` keys, and the `.bpage-scorebtn`, `.bpage-scorehint` and `.bpage-parts` rules (row T386-i).

verify_cycling's two wire checks fail on data, as they did before this task: "no country publishes exactly a global constant" (repeated counts 12, 15, 4) and "Scotland has a tour of about five days" (0 of 4 to 6 days). They are the data lane's (row T386-h).

## Rollback procedure

Before the merge: delete the branch `p10-v6-build-outdoor` in both repos. After the merge: in the app repo `git revert 2bd9abc` (one commit), and in the root repo `git revert` this report's commit, `239a47e6c` (OWNERSHIP.md) and `003d787e1` (the plan). No data, schema or migration changed, so the revert is complete; the new i18n keys go with the app revert.
