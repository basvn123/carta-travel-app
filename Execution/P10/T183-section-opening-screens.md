# T183: 5.3, the section opening screens

## Task ID

T183 (mind-map number T187). Branch p10-5-3-opening-screens in both repos. App commit 25d2d7a on top of master 6c99ebd; the root commit carries this report and the register rows.

## Date

2026-10-06

## What changed

The five outdoor sections of the Destinations tab (beaches, lakes, mountains, cycling, trails) now open on two bands before their grid. Band 1 is six or nine named places, each with its own photograph, under a Fraunces heading with the count in it ("Europe's 9 best-known mountains"). Band 2 is up to six horizontal rails, each titled by what the traveller wants ("Reachable without a car", "Warm enough to swim in June", "Mostly away from traffic"), each a saved filter. Band 3 is the grid that was already there, now under a "Browse the full list" heading. All five sections fill Band 1 with nine real photographs from their own wire; before this task there was no Band 1 anywhere.

How it works, for whoever maintains it.

The bands show only while a section is at rest: nothing typed, no place searched, no country picked, no chip on. The first filter of any kind folds them away and leaves the grid, and clearing it brings them back. The decision is one expression, openingLayer, in DestinationsTab.jsx. Trails are the one exception in scope. Beaches, lakes, mountains and cycling each ship a Europe-wide top.json the tab already loads; the trail wire is one file per country with no Europe-wide ranking, and fetching all 45 files to rank them in the browser would be about 30 MB (the sum of public/trails/*.json). So the trail bands open once a country is picked ("The 9 highest-rated walks in Italy"), and the trail country index now says why in one plain line above the flags. That is the honest form of the finding the spec asks this band to surface: trails cannot fill a Europe-wide Band 1 from their own data (row T183-a).

What goes in each band is decided in src/lib/openingScreen.js, which is pure and tested. Band 1 takes only rows whose own photograph is on the wire (never a nearby town's hero standing in for a walk), only named rows, never the unscored listed tier, at most two per country, and snaps the count to nine or six so the grid closes on whole rows; between three and five it shows what it has and under three it draws nothing. The rank differs by section and the heading says which. Beaches, lakes and mountains rank by comp.acclaim, the fame term each layer's index already computes from Wikipedia sitelinks and pageviews plus the count of free photographs (acclaim_component in pipeline/beaches/beauty_index.py, pipeline/lakes/lake_index.py and pipeline/mountains/peak_index.py), so their heading says "best-known". Cycling and trails carry no fame term, so they rank by their own score and the heading says "top-rated" and "highest-rated". Cycling needed one more step: the wire carries OSM sections, not routes, and the first pick showed NCN Route 1 twice and two legs of EuroVelo 6. cycleRouteKey folds sections of one route to one key by name (the name up to its first section marker, every EuroVelo spelling to evN). It is a heuristic over names and says so; grouping by network is the real fix (row T183-d). Trails dedupe by trail family for the same reason.

Each rail is a saved filter written in the section's own facet vocabulary (BEACH_FACETS, LAKE_FACETS, MOUNTAIN_FACETS, CYCLE_FACET_GROUPS and the trail chips), run through the same filter function the grid uses. "See all N" puts that exact filter on the grid's chips, so the rail's N and the chip's count are the same number; the browser check confirmed it on all five sections at both widths (173, 96, 4, 126 and 673). A rail with fewer than four rows behind it is dropped, not shown thin. Rail cards are Explore's .railcard at a fixed 220 px with scroll snapping; the order puts photographed rows first, then score, then takes each country in turn so a Europe-wide rail does not open on six rows from one country.

Two of the spec's example titles are not used, on purpose. "Under two hours from an airport we price" is dropped: Carta does not price flights (T272) and no layer row carries a distance to an airport. "Quiet in August" is dropped: no layer row carries crowding by month (row T183-c). "Traffic-free the whole way" became "Mostly away from traffic", because the carfree chip it saves is 70 per cent traffic-free (cycleShapes in lib/cycleStory.js), not 100. "A cable car to the top" became "A lift to the top", because the liftTop access code covers chairlifts and rack railways as well.

The rails reuse what the app ships. The rail markup and classes are Explore's (.xrails, .xrails-title, the "See all N" button with its existing rail.seeAll key, the arrow buttons with the existing explore.railPrev and explore.railNext labels), the cards are .railcard, and the icons are .railcard laid out as a grid divided by hairlines. The three things Explore did not have are drawn from tokens only, in src/styles/30-section-opening.css: the 220 px card, the arrows at 44 px (Explore's are 30 px) and disabled at either end, and a dot indicator. The dots are 6 px, --rule with the current one in --ink, one per page of the strip, and hidden from assistive technology because the arrows and a swipe do the moving. The arrows show only on a hover screen of 769 px and up, through Explore's existing .xrails-nav rule. carta-design has no carousel rule, so all of this is written up for the owner to keep or reject (row T183-b).

Band 1 comes before any filter. On a desktop the filters already stand in the left panel and the column opens on the search field and then Band 1. On a phone the toolbar card held the sorts, the Filters door, the country picker and the chip groups above the list; while the bands show, those move down under Band 2 to head the grid they filter (the same elements and classes, so the harnesses still find them), and the category tabs and the search field stay at the top. One small fix came out of that: the desktop panel shows only the short toolbar chip groups, so a rail whose filter lives in another group (cycling's carfree, the lake month) filtered the grid with no visible chip saying by what. A group now also shows in the panel while one of its chips is on.

The headings carry their count as a digit, so it is the computed length of the list and never typed. English fits on one line at 380 px. The heading is allowed to wrap rather than truncate, because the Spanish and French headings are half as long again and an ellipsis mid-word says less than two lines. That is a departure from "one line" in the spec text for the longer locales.

## Files touched

App repo (continent-app), commit 25d2d7a.

Created:
- src/lib/openingScreen.js (Band 1 picks, the rail definitions, the saved-filter matcher)
- src/browse/SectionOpening.jsx (draws Band 1 and Band 2)
- src/styles/30-section-opening.css
- tests/openingScreen.test.mjs (8 tests)

Modified:
- src/browse/DestinationsTab.jsx (the at-rest rule, the bands mounted above the grid, the phone filter row moved under them, the trail country-index line, the desktop panel showing a group with a chip on)
- src/styles.css (one import line)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (40 open.* keys each, CRLF and BOMs kept, all six parse)

Root repo: Execution/P10/T183-section-opening-screens.md (this report), Execution/_OPEN.md (rows T183-a to T183-k).

Deleted: none. No token in :root changed, so DESIGN.md is untouched.

## Commands run

In C:\Users\Gebruiker\Documents\Portfolio\wt\T183-app. wt\vite.t183.mjs wraps vite.config.js with its own cacheDir (wt\vite-cache-t183).

```
node node_modules/vite/bin/vite.js build --config ../vite.t183.mjs          (base, before any edit)
node node_modules/vite/bin/vite.js preview --config ../vite.t183.mjs --port 5201 --strictPort --host 127.0.0.1
bash ../T183-run-harness.sh before      (beaches, lakes, mountains, trail_page, cycling, keyboard, quality floor pages)
node ../T183-measure.mjs .              (Band 1 and rail counts read off public/*/top.json and public/trails/*.json)
python ../T183-i18n.py .                (the 40 keys into six catalogues, BOM and CRLF kept)
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
npx eslint src ; npm test ; node scripts/ci/design-lint.mjs
node node_modules/vite/bin/vite.js build --config ../vite.t183.mjs          (branch) and vite preview on 5201
node ../T183-shots.mjs 5201 after       (the five opening screens at 380 and 1280 px)
bash ../T183-run-harness.sh after
node scripts/_t183_qf_tmp.mjs qf-open --port=5201 --out=../T183-shots --only=pages    (see below)
git stash -u ; vite build --outDir ../T183-base-dist ; git stash pop ; vite preview --outDir ../T183-base-dist on 5201
node scripts/_t183_qf_base.mjs qf-base --port=5201 --out=../T183-shots --only=pages
node scripts/verify_keyboard.mjs --port 5201 --out ../T183-shots/keyboard-final
rm -rf dist dist-data ../T183-base-dist shots scripts/_t183_qf_*.mjs
```

verify_quality_floor.mjs does not reach the five opening screens (its Destinations steps are the Trips list and the trail country index). To audit them without changing the repo's audit, _t183_qf_tmp.mjs was a throwaway copy of it with its PAGES list replaced by the five sections at three scroll positions (Band 1, the rails, the grid head), and _t183_qf_base.mjs the same screens on the base build; both were deleted before the commit. Every server was stopped. Screenshots, logs, the measurement script and both audits are in C:\Users\Gebruiker\Documents\Portfolio\wt\T183-shots\ and beside it in wt\, outside the repo.

## Config and secrets set

None.

## Before/after measurements

Band 1 fill, from T183-shots/after/report.json (browser, both widths) and T183-measure.mjs (the wire). Before this task no section had a Band 1.

| Section | Band 1 before | Band 1 after | Rails after (rows behind each) |
|---|---|---|---|
| Beaches | 0 | 9 of 9, all with own photo | 6 (water excellent 173, sunset 42, nothing built 54, cove 41, surf 10, lifeguard 21) |
| Lakes | 0 | 9 of 9 | 6 (swim in June 96, shore path 61, wild 33, national park 11, water excellent 123, mountains 96) |
| Mountains | 0 | 9 of 9 | 6 (without a car 4, lift 98, road 25, walk up 12, water view 47, volcano 12) |
| Cycling | 0 | 9 of 9, nine different routes | 6 (away from traffic 126, barely a climb 69, one day 148, paved 96, gravel 119, loop 17) |
| Trails, Europe scope | 0 | 0, not fillable: no Europe-wide trail ranking on the wire | none; the index says so |
| Trails, per country | 0 | 9 in 36 of 45 countries, 6 in 2 (AD, MK), 4 in 1 (XK), none in 6 (FO, MD, and MC, SM, TR, UA which publish no walks) | 4 or more rails in 36 of 45 |

Other figures:

| Metric | Before | After | Delta |
|---|---|---|---|
| Opening screens checked at 380 and 1280 px | 0 | 10 (5 sections, 2 widths) | +10 |
| Horizontal overflow on those screens | | 0 at both widths | |
| Visible h1 on those screens | | exactly 1 on all 10 | |
| Rail card height | | 220 px on all 10 | |
| "See all N" count equals the grid chip count | | 10 of 10 | |
| Desktop next arrow moves the strip and the dot | | yes where the strip overflows (4 sections; the mountain's first rail holds 4 cards and fits, so its arrow is disabled) | |
| Page errors and console errors | 0 | 0 | 0 |
| verify_beaches | 68 of 68 | 68 of 68 | 0 |
| verify_lakes | 81 of 81 | 81 of 81 | 0 |
| verify_mountains | 83 of 83 | 83 of 83 | 0 |
| verify_trail_page | 50 of 50 | 50 of 50 | 0 |
| verify_cycling | 70 of 72 | 70 of 72 (the same two wire checks) | 0 |
| verify_keyboard | 20 of 20 | 20 of 20 (and again on the final build) | 0 |
| verify_quality_floor --only=pages, the existing 36 screens | exit 0 | exit 0 | 0 |
| npm run lint | 0 errors, 72 warnings | 0 errors, 72 warnings | 0 |
| npm test | 201 pass | 209 pass (8 new) | +8 |
| design-lint new violations | 0 (196 in baseline) | 0 (196 in baseline) | 0 |
| Main stylesheet | 694.19 kB | 697.48 kB | +3.29 kB |
| Main script | 1,014.97 kB | 1,028.07 kB | +13.10 kB (the bands and 240 strings) |

The quality floor on the five section screens themselves, 60 screens each (both widths, three scroll positions, folds opened), base build against branch build. Nothing T183 added fails a gated check: its only entries are the [token] contrast of "See all N" in --accent, the same pair the owner is deciding for Explore's rails (T193-b). The gated failures are the section filter chrome, the same classes on both builds, which T186 never audited because its run did not open these sections:

| Floor check (60 screens) | Base | Branch |
|---|---|---|
| Horizontal scroll, h1, heading order, fake controls, motion, serif, gradients, mono eyebrows | 0 | 0 |
| Phone targets under 44 px | 450 | 412 (.places-class chips at 27 px, .places-sort at 32 px) |
| Views with more than one filled primary | 4 | 8 (the phone's accent Filters door beside the accent sort; the branch audit stands on more views where both show) |
| Text under 4.5:1, usage | 72 | 20 (white card text over a photo not yet loaded) |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The cycling band showed NCN Route 1 twice and two legs of EuroVelo 6 | The cycling wire carries OSM sections, one relation per section | cycleRouteKey folds sections of one route by name |
| "Murradweg Abs. 4" and "Abs. 4a" kept two keys | \b after "abs." never matches before a space | (?![a-z]) after the marker |
| Regex escapes written through a bash heredoc turned into literal characters | The known heredoc trap | Rewritten byte-wise with chr(92) |
| The cycling heading was cut off at 380 px | "Europe's 9 highest-rated cycle routes" is too long at 21 px | "top-rated", and the heading wraps instead of truncating |
| Rail card names showed a third, half-cut line | The clamped box grew with the flex column | flex: none and a 2.4em cap on the name |
| A rail's "See all" could filter the desktop grid with no chip visible | The desktop panel shows only the toolbar chip groups | A group also shows while one of its chips is on |
| "See all" read 2.52:1 after a tap on a phone | Explore's hover colour (--accent-soft) stays on after a touch | The opening rails keep --accent on hover and underline instead |
| The desktop arrow click timed out in the check | The mountain's first rail fits on screen, so next is correctly disabled | The check clicks only an enabled arrow |

## Seven questions before shipping (carta-design)

1. No hex value outside :root; the new stylesheet and component use tokens only.
2. No gradient, no new colour, no second saturated hue; the dots are --rule and --ink.
3. Ochre is not used by the bands; teal and --danger untouched.
4. Mono carries one measured fact per card (height, length, area, distance) with tabular figures; names and places are in the sans or Fraunces.
5. The bands add no filled button; "See all" is accent text and the arrows are bordered secondaries. The phone's two filled controls in the moved filter row are the existing Filters door and sort, unchanged (row T183-i).
6. Every heading has a number or a verb ("Europe's 9 best-known lakes", "Browse the full list", "Back where you started"); no em dashes, middots or banned words in the diff.
7. Removed: the rating seal and score chip the railcard carries on Explore; the bands are about names and photographs, and the score is one tap away.

## What is still open

Trails have no Europe-wide top.json, so their Band 1 cannot be filled at Europe scope; an export like beaches/top.json from pipeline/trails/export_wire.py would let the section open on Europe like the other four, and that run is the owner's data lane (T183-a). carta-design has no rail or carousel rule; what T183 built (Explore's rail reused, the 220 px card, 44 px arrows disabled at the ends and shown on desktop only, non-interactive 6 px dots, the hairline photo grid for Band 1, the phone filter row moving under the bands) needs the owner to record it as the rule or reject it (T183-b). The two dropped rail intents need an owner decision: drop for good, or join crowding v17 to layer rows for "Quiet in August" (T183-c). Cycling's band shows sections of routes, deduplicated by a name heuristic; grouping by cycle_network and superroutes (spec 7.1, 7.2) would let it show whole routes (T183-d).

The band did its job of exposing data problems, and these belong to image QA and the layers, not to this task: the first photograph of Tragumna (IE) is a green water hydrant, of Hoverla (UA) an archival black-and-white photograph of soldiers, and of the top-rated Italian walk (Eremi del Monteluco) a dim stone wall (T183-e). Hoverla sits in a country under a wartime advisory and Mount Athos admits men only, by permit; whether such places may stand in a "best-known" band is the owner's call (T183-f). The mountain rail "Reachable without a car" holds 4 of 208 top rows because the transit access code is rare on the wire (T183-g).

Not built: the sticky section rail the spec puts above the bands once the hero leaves the viewport (T183-h), and the 3D section heroes of spec 11.7, which wait on the terrain work with T180-b and T186-d (T183-j). The phone's filter row, now under the bands, still carries the pre-existing floor failures this task's audit found on the section screens: chips at 27 px, sorts at 32 px, and the filled Filters door beside the filled sort (T183-i). verify_quality_floor.mjs does not open the five sections; adding them to its PAGES list would make the audit above repeatable (T183-k). The non-English strings are my translations and want a native read (T183-l). Checked by hand: the five screens at both widths, See all on each, the arrows and dots on desktop, swipe and snap on the phone emulation. Not checked: a screen reader.

## Rollback procedure

In continent-app, git revert 25d2d7a (or drop the branch before merging). In the root repo, revert the report commit, which also removes the T183 rows from Execution/_OPEN.md. CSS, JSX, one lib, one test and i18n keys only; no migration, no data, no wire and no token change.
