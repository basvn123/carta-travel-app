# T182: Derived modules that turn a listing into an instrument

## Task ID

T182 (mind-map number T186). Branch p10-derived-modules in both repos. App commit 4e7e014 on top of master 49abb75; the root commit carries this report and the register rows.

## Date

2026-10-04

## What changed

The beach, lake and mountain detail pages each gained derived modules: rows in slot 6 of the T180 skeleton that work a reading out of fields the wire already carries, instead of printing the field. Source is section 11.5 of `additional docs/Carta/Plan/Data Quality/carta-destinations-enhancement-spec.md`. The orchestrator split that week's list three ways. Surface and traffic exposure (7.6) was already done by T174. The sea and lake temperature strips and the horizon silhouette are signature visuals and belong to T181. That left this task with beach orientation (8.4), walk-in time and descent (8.5), how you get up (10.3; the orchestrator note calls it 10.4, but in the spec 10.3 is how you get up and 10.4 is the silhouette) and shore walkability (9.5). No other section on that list defines a module that is not a slot 5 visual.

Each module is a row that always renders. Where the data answers, the row says what it found. Where it cannot, it says so in a plain sentence, and the closed row's summary reads "Not measured here". A row that silently disappears would hide the gap, and a guess would be worse. Nothing is written to data; everything is computed at render time from the row the page already loaded.

Which way it faces (beach, spec 8.4). The beach wire carries `aspect`, the true bearing from the sand out to sea. pipeline/beaches/coastline.py throws a probe 300 m along each normal of the EEA 1:100,000 coastline polygon and keeps the one that lands on water. It also carries `sunset`, which coastline.py sets when that bearing looks into the arc the sun sets through between the equinox and the June solstice at the beach's latitude, give or take 22 degrees. The row draws a 48 px compass rose with a 45 degree wedge on the bearing, and a sun glyph under it when the sunset flag is set. Next to it go the compass point in words, the bearing in mono, and one sentence about the light. The sunset flag wins because it accounts for latitude. Otherwise the bearing falls into one of four bands: facing 45 to 135 degrees means morning sun, then the sun is behind the shore; 135 to 225 means sun through the middle of the day; 225 to 315 means afternoon sun that sets off to the side; anything else means the sun is behind the shore most of the day. The spec draws the rose at 24 px for the card; at 24 px the wedge does not read on a phone inside a row body, so the row uses 48. coastline.py never gives a lake or river beach a bearing, by design, and the row says exactly that. A beach with neither a bearing nor an inland flag gets the sentence for coastline.py's refusals (a spit, a lagoon mouth, or more than 5 km from the mapped coast). The spec's line about north-facing Mediterranean beaches catching the Mistral and the Tramontana was not built. It needs a wind source, and asserting it from the bearing alone would be invented (row T182-d).

Getting down to the sand (beach, spec 8.5). The spec asks for minutes and metres of descent from the nearest parking along the path network and GLO-30. Neither the paths nor the DEM are on the wire or on this laptop, so the row says what can be known. If export_beaches.py access_of wrote `access`, which happens only when the Wikipedia article says steps, a hike in or boat only, the row says so and names the article as the source. If the beach has the `parking` service, the row says a car park is mapped within 400 m (enrich_beaches.py CONTEXT_RADIUS_M) and states plainly that this is a straight line and not a path. That is the Navagio lesson export_beaches.py already records: the car park there sits on a clifftop above a cove you reach by boat. A boat-only beach never shows the car park line. Every state ends with "How long the walk takes and how far it drops are not measured yet." The pipeline step that would fill the figures in is row T182-b.

How you get up (mountain, spec 10.3). Four slots, drive, lift, walk and climb, each on or off, with the easiest way that is on outlined in ink. Drive is on when `acc` has roadTop. Lift is on when `acc` has liftTop, which peak_index.py access_codes sets for a top station within 700 m of the summit (SUMMIT_LIFT_M). liftMountain means a lift within 3 km or one the article mentions; peak_index.py calls that the weakest claim, so the slot is drawn half on with a dashed border, and the sentence says lifts run on the mountain but none is known to reach the top. Walk is on when `diff.k`, the easiest graded way up (peak_index.py difficulty_of), is a walk up, a hike or a mountain hike. Climb is on when that easiest way, or the harder route peak_index.py ships as `diff.hard`, is a scramble, an alpine route, a via ferrata or a technical climb. Under the slots, one sentence per way uses the page's own words (mountainStory.js liftLabel and difficultyLabel), so an estimated grade still says "from the terrain". The slot grid is hidden from screen readers because the sentences carry the same answer. The spec's "then 340 m on foot" cannot be written: `lift.m` is the straight-line distance from the top station to the summit, not the height left to climb, and the station's height is not on the wire. So the row gives the distance as a distance and says the remaining climb is not measured (row T182-c). The existing way-up banner stays in Getting there, as T180 and verify_mountains require. The row adds the four-way reading; the banner keeps the logistics.

Walking the shore (lake, spec 9.5). lake_index.py publishes a `shorePath` reason with the kilometres of walkable way inside 50 m of the waterline when there are 300 m or more of it. osm_water.py counts path, footway, track, steps, bridleway and cycleway. The row states that figure, then the shortest shore a lake of that area can have (the circumference of a circle with the same area, 2 times the square root of pi times the area) as a reference. Then it says honestly that the spec's "68% of the shore has a path" needs the shoreline's own length, which the wire does not carry. osm_water.py already computes that length (geometry_area_perimeter) and drops it, so row T182-a asks for it to be exported. With it, the share and the shoreline development index the spec pairs with it become one division each. Below 300 m the row says OpenStreetMap maps less than that, adding the private-shore and slipway sentences where those reasons are present.

Two traps made the lake module more careful than it first looked. First, the shore score takes exactly 0.45 or 0.62 when osm_water.py never swept the shore (lake_index.py SHORE_DEFAULT and its beach fallback). The module treats those values as "not surveyed yet" rather than reading the absence of a path as a finding. Second, and more important, the first browser run showed Lake Como reading "under 300 m of shore path". export_lakes.py ships only the first ten reasons (lake_index.py REASON_MAX) in narrative order, and the shore reasons come seventh of nine sections, so on a lake with ten reasons the shore sentence is often the one that got cut. The module now counts a missing shorePath as "less than 300 m" only when the list holds fewer than ten reasons, or when a reason added after the shore block (undeveloped, resortShore, services, wikiFame, photographed, shared) made it on. Otherwise it says the figure is not on this listing. On the current wire that is 434 lakes, Como among them; row T182-a removes the guess.

How it is built, for whoever maintains it. The rules are pure functions in continent-app/src/lib/derivedModules.js: beachFacing, beachWalkIn, mountainWayUp, lakeShore and the four summary builders. tests/derivedModules.test.mjs covers every branch, and the coverage count below runs the same functions over every published row. browse/DerivedModules.jsx only lays the answers out, and styles/29-derived-modules.css draws them in ink tokens only. Each page adds its module rows straight after the why row, as T180 described ({ key, icon, label, summary, body }, a 20 px icon, a previewWords summary). The keys are facing and walkin on the beach, shore on the lake and up on the mountain, so the bodies have the ids dsk-facing-body and so on. One icon was added to Icons.jsx, GondolaIcon, because the set had no lift. The signature prop was not touched.

## Files touched

Modified (continent-app, commit 4e7e014):
- src/browse/BeachPage.jsx, src/browse/LakePage.jsx, src/browse/MountainPage.jsx (one rows entry each, two on the beach, and the imports)
- src/components/Icons.jsx (GondolaIcon)
- src/styles.css (one import line)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (66 derived.* keys each, inserted after mtn.liftSeasonNote; CRLF and BOMs kept, all six parse)

Created (continent-app):
- src/lib/derivedModules.js
- src/browse/DerivedModules.jsx
- src/styles/29-derived-modules.css
- tests/derivedModules.test.mjs

Root: Execution/P10/T182-derived-modules.md, Execution/_OPEN.md.

## Commands run

In C:\Users\Gebruiker\Documents\Portfolio\wt\T182-app, with a temporary vite.t182.local.mjs inside the worktree that only set cacheDir to wt\vite-cache-t182 (deleted before the commit):

```
node node_modules/vite/bin/vite.js build --config vite.t182.local.mjs          (base, before any edit)
node node_modules/vite/bin/vite.js preview --config vite.t182.local.mjs --port 5205 --strictPort --host 127.0.0.1
CARTA_PORT=5205 node scripts/verify_{beaches,lakes,mountains,trail_page,cycling}.mjs http://127.0.0.1:5205/
(edits)
python t182_i18n.py ; python t182_cut.py          (scratchpad scripts that insert the keys)
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
node --test tests/derivedModules.test.mjs
npm run lint ; npm test ; node scripts/ci/design-lint.mjs ; node scripts/ci/banned-terms.mjs
node ../T182-coverage.mjs                         (coverage over every published row)
node node_modules/vite/bin/vite.js build --config vite.t182.local.mjs          (branch)
node node_modules/vite/bin/vite.js preview ... --port 5205 --strictPort
CARTA_PORT=5205 node scripts/verify_{beaches,lakes,mountains,trail_page,cycling}.mjs http://127.0.0.1:5205/
node ../T182-shots.mjs 5205                       (headless check, 380 and 1280 px)
rm -rf dist dist-data vite.t182.local.mjs
```

Both preview servers were stopped. Harness logs (harness-before, harness-after), the build logs, coverage-after.json, and the browser report with one screenshot per opened module and per page are in C:\Users\Gebruiker\Documents\Portfolio\wt\T182-shots\. The two throwaway scripts sit beside it in wt\. The layer data the counts read is the local generated public/ data the worktree links to (the main checkout's continent-app/public, built 2026-10-03).

## Config and secrets set

None.

## Before/after measurements

Coverage is the share of published rows whose module answers rather than showing its empty state, counted by running the page's own functions over every country file (T182-coverage.mjs). Before this task none of the four modules existed, so every before figure is zero.

| Metric | Before | After | Delta |
|---|---|---|---|
| Beaches with a facing reading (of 2,746) | 0 | 1,839 (67.0%) | +1,839 |
| of which sunset over the water / midday / morning / behind the shore / afternoon | 0 | 389 / 626 / 406 / 284 / 134 | |
| Beaches with no bearing: inland water / coast refused | | 369 / 538 | |
| Beaches with a way-down reading (of 2,746) | 0 | 621 (22.6%): article 9 (steps 7, path 2), car park within 400 m 612 | +621 |
| Beaches with walk-in minutes and descent | 0 | 0 (not on the wire, row T182-b) | 0 |
| Lakes with a shore reading (of 1,681) | 0 | 1,171 (69.7%): path figure 1,094, under 300 m 77 | +1,171 |
| Lakes with no shore reading: not surveyed / figure cut from the wire | | 76 / 434 | |
| Lakes with a share of shore walkable | 0 | 0 (shore length not on the wire, row T182-a) | 0 |
| Mountains with a way-up reading (of 740) | 0 | 740 (100%), easiest way: walk 373, lift 185, climb 148, drive 34 | +740 |
| Slots on: drive / lift (plus half on) / walk / climb | | 34 / 185 (+107) / 554 / 448 | |
| Lift rows with the station's distance from the summit | 0 | 134 | +134 |
| Lift rows with the height left on foot | 0 | 0 (station height not on the wire, row T182-c) | 0 |
| Module rows on the sample pages (beach, lake, mountain) | 0, 0, 0 | 2, 1, 1 | +4 |
| verify_beaches, verify_lakes, verify_mountains, verify_trail_page | 68, 81, 83, 50 all passed | 68, 81, 83, 50 all passed | 0 |
| verify_cycling | 70 of 72 | 70 of 72 (the same two wire checks) | 0 |
| npm test | 176 pass (190 less the 14 new) | 190 pass | +14 |
| npm run lint | | 0 errors, 72 warnings, none in the touched files | |
| design-lint new violations | 0 | 0 (196 in the baseline) | 0 |
| Page chunks, kB (beach, lake, mountain) | 9.68, 10.32, 10.66 | 10.02, 10.51, 11.00, plus DerivedModules 7.89 | |
| Main stylesheet | 691.83 kB | 693.61 kB | +1.78 kB |

The browser check opened every module on eleven sample pages at 380 and 1280 px: Cala Violina (sunset), Cala Serena (steps), Strandbad Klagenfurt (inland), Pobiti Kamani (nothing known), Lake Como (cut), Völkermarkter Stausee (17 km of path), Seepark Barby (private shore and slipway), Lake Butrint (not surveyed), Hoher Dachstein (cable car), Signal de Botrange (road) and Mont Blanc. Across the 22 page loads there were no page errors, no horizontal overflow, and no untranslated derived.* key. The modules contain no accent-filled control (their stylesheet never uses --accent); the browser counted 2 accent fills per page at 380 px and 1 at 1280 px, all of them skeleton chrome outside the module rows.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Lake Como's row said under 300 m of shore path | export_lakes.py keeps the first ten reasons in narrative order, so the shore reason was cut, not absent | A cut state: absence counts only when the list is short or a later reason survived; the row says the figure is not on the listing |
| A test expected the afternoon band for a 216 degree beach | My expectation was wrong: 216 is in the 135 to 225 band, midday sun | Test corrected; the band rule is unchanged |
| The mountain lines ran label and sentence together ("Drive A road reaches the top") | Inline label in front of the sentence | Two-column grid, label then sentence |
| Shore lead first set the kilometres in mono in front of a sentence fragment | Breaks the mono rule (a number inside a sentence is sans) and does not translate | The figure sits inside a whole sentence in the sans |

## Seven questions before shipping (carta-design)

1. No hex value: 29-derived-modules.css uses tokens only, and the SVG colours come from classes.
2. No gradient, no new colour, no second saturated hue; the modules are ink, ink-soft, rule and bg-card.
3. Ochre, teal and --danger are not used by any module.
4. Mono carries only the bearing in degrees; every other number sits inside a sentence in the sans.
5. No new primary: the modules add no button, and the base-town button stays the page's one accent.
6. Headings carry a verb ("Getting down to the sand", "Walking the shore", "How you get up", "Which way it faces"); design-lint and banned-terms found no em dash, middot or banned word.
7. Removed: the spec's descent wedge and minutes badge, and the shore ring, because there is no figure to draw them from; drawing an empty instrument would carry nothing.

## What is still open

The figures the spec promises and the wire lacks are three pipeline steps, each the owner's to run in the data lane, since session rule 5 forbids data writes here. Exporting osm_water.py's shore length and an explicit swept flag beside path_m in the lake rows would turn the shore row into "N% of the shore has a path", add the shoreline development index, and retire both the unswept-score sentinel and the cut-reason heuristic (T182-a). The beach walk-in minutes and descent need a path-network route from the nearest parking or road to the beach polygon, plus the GLO-30 drop (T182-b). The vertical metres left on foot after a lift need the top station's height, from OSM ele on aerialway=station or a GLO-30 sample (T182-c). The north-facing wind exposure in spec 8.4 needs a wind climatology, the ERA5 source spec 7.8 names, and was not invented (T182-d). The 66 derived.* strings in de, es, fr, it and nl are my translations and need a native read (T182-e). The spec puts the way-up row and the beach rose on the cards too; the cards belong to the card and bento work (T179 and its rule) and were not touched (T182-f). The mountain page now says the way up twice, once as the four-slot row and once as T180's banner in Getting there; once the row is trusted, the banner could shrink to the access logistics (parking, transport, the season note), which is a page decision for the owner (T182-g).

Checked by hand: every module open at both widths on the eleven samples above, the closed summaries, and the empty states. Not checked: a screen reader, and the five non-English languages in the browser (they parse, and the key count matches).

## Rollback procedure

In continent-app, git revert 4e7e014 (or drop the branch before merging). In the root repo, revert the report commit, which also removes the T182 rows from Execution/_OPEN.md. No data, schema, migration, wire or stored state changed.
