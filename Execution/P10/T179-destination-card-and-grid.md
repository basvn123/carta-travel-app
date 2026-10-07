# T179: 5.1, one card with five fillings

## Task ID

T179 (mind-map number T183). Branch p10-5-1-card-bento in both repos. App commit 3855861 on top of master f05e901; the root commit carries this report and the register rows.

## Date

2026-10-07

## What changed

The five outdoor sections of the Destinations tab (beaches, lakes, mountains, cycling, trails) now draw every grid row through one card. Before this task each section had its own card: a photograph with the name, a line of facts and some chips laid over a dark scrim, at 116 px high on a phone (two abreast) and 149 px on a 1280 px desktop. Now each row is the card of spec 5.1: a 16:9 photograph with rounded top corners only, the ochre rating seal top right and the section's 6 px data strip (T181) along its bottom, then a white body with the name in Fraunces 19 px and a mono ref chip, the place in 13 px --ink-mute behind a pin, the hook on one 15 px line, exactly three measured values in mono 12.5 px with their names under them, and up to three 20 px icons at a 1.5 px stroke. The grid is uniform: one card a row under 640 px, two to 1039 px, three above. The bento half of the task (a double card first, a fourth stat) is not built: the owner ruled bento out on 2026-10-07 (T362, Execution/_OWNER-RUNBOOK.md block A), and the session notes say to build the card only.

How it works, for whoever maintains it. browse/PlaceCard.jsx is the frame and knows nothing about beaches or walks. It takes the photograph, the seal, the strip, whatever belongs on the picture top left (the distance chip of a searched place, a lake's swimming verdict, a mountain's lift, the "photo of a nearby town" label), and a filling. The fillings are pure functions in lib/cardFillings.js, one per section plus one for composed cycle tours (trailFilling, cycleFilling, cycleTourFilling, beachFilling, lakeFilling, mountainFilling). Each returns the title, an optional ref, the place line, the hook parts, the three values and the icon codes. The six card components left in DestinationsTab.jsx are now a dozen lines each: they choose the seal and the strip and hand over a filling. Because the fillings are plain data they are tested without a browser (tests/cardFillings.test.mjs, 11 tests).

Three values, never four, is enforced in one place. pickValues takes each section's candidates in the order a traveller asks for them, with spares behind: a spare moves up only when a primary figure is missing from the wire, and when fewer than three figures exist the first missing ones keep their cells and say "No data" instead of closing the gap. The cells keep the section's order, so Length never sits right of Climb on one card and left of it on the next. What each section shows, and why:

| Section | Values (spares after the bar) | Hook | Icons |
|---|---|---|---|
| Walks | length, walking time, climb read uphill (a city day: stops in place of climb) | kind, grade, two highlights | loop, then highlights with a glyph |
| Cycle routes | length, climb, traffic-free share (spec 7.9) | the strongest reason, as its sentence | loop, stations, coast, lakes, views |
| Cycle tours | days, length, km a day | the pace sentence | none |
| Beaches | length, which way it faces, EEA water class, then distance to town, surface | the pipeline's tags | lifeguard, sunset, facilities, protected |
| Lakes | area, depth, altitude, estimated warmest water, then distance to town | the pipeline's tags | swimming allowed, shore walks, facilities, protected |
| Mountains | height, prominence, distance to a higher peak, then the area in view | grade, view band, tags | lift, public transport, summit food, hut, viewpoint |

Some choices worth knowing. The mountain card was first built on the viewshed's count of named peaks in view, as the spec's "five to eight named peaks" suggests; that field reads 0 on 188 of the 740 published mountains, Hafelekarspitze above Innsbruck among them, so the card uses the distance to the nearest higher summit (isoKm) instead and the field is a register row. The lake's warmest-water figure is an estimate (swim.est), so it carries the tilde the derived trail grade already uses, with "An estimate, not a measurement" as its title. A mountain's grade read off the terrain gets the same tilde instead of the old ", from the terrain" suffix, which put a comma inside a comma-separated line. The lift is left out of a mountain's hook because the chip on the photograph and the icon already say it. A walk's ref chip is dropped when the name already carries it ("Mount Korab (9/1)"). The hook's commas are text between the parts, so the line reads as words when copied or read aloud, and each part keeps the class the harnesses look for.

The harness contract was kept rather than the harnesses edited. The outer button keeps each section's class (.places-bcard, .places-lcard, .places-mcard, .places-tcard, the cycle data-testids), and the body keeps the inner classes the layer harnesses read: .places-card-name on the title, .places-bcard-where on the place line with exactly one pin, .places-bcard-tags (or .places-card-kinds for walks) on the hook, .places-card-facts on the values with the length first so verify_trails can still parse it, .places-card-loop on a loop icon, .places-mcard-ele on a mountain's height, and .places-card-kind, .places-card-diff, .places-card-price, .places-card-km, .places-lcard-swim and .places-mcard-way where they were. The new stylesheet, src/styles/37-card-fillings.css, scopes its rules under .places-list so they outrank the older overlay rules in 23-places-pages.css and the phone block in 24-destination-workspace.css without editing either.

Images are lazy with a srcset of exactly 500, 960 and 1280 (all three on Wikimedia's renderable list in lib/heroImage.js), and sizes now says what the band really is: the column less its gutters under 640 px, about half the column to 1039 px, a third of the list column above. The band's 16:9 box is fixed in CSS and every body row has a fixed height, so every card in a grid is the same height (389 px at 380 wide, 366 px at 1280) whatever its filling, and nothing moves as images arrive. While a section's file loads, six skeleton cards built from the same rows on --paper-dim stand where the three dots were, with a status line for screen readers; measured in the browser they are exactly the size of the cards that replace them. The hover zooms the image to 1.05 inside the band's own clip, on hover-capable pointers only, and never moves the card; reduced motion turns the zoom and the skeleton's breathing off. The dark scrim and the chevron are gone, since no text sits on the photograph any more.

The phone list is longer. One card a row at 389 px is what spec 5.2 asks under 640 px, and it replaces two abreast at 116 px; a phone now scrolls about three times as far for the same 36 cards. That is the spec's call and the reason the photograph is legible at all on a phone, but it is the most visible change in this task and worth the owner's eye.

## Files touched

App repo (continent-app), commit 3855861.

Created:
- src/browse/PlaceCard.jsx (the frame, the photograph with its srcset, the skeleton)
- src/lib/cardFillings.js (the six fillings, pickValues)
- src/styles/37-card-fillings.css
- tests/cardFillings.test.mjs (11 tests)

Modified:
- src/browse/DestinationsTab.jsx (the six card components rewritten onto PlaceCard; CardPhoto and the old TrailPicture replaced by TrailMedia; skeletons in place of the loading dots on the five lists; the pcard-grid class on those lists; countryName passed to the walk card; unused imports removed)
- src/styles.css (one import line, last)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (38 card.* keys each after sig.rowHorizon, additions only, CRLF and BOMs kept, all six parse)

Root repo: Execution/P10/T179-destination-card-and-grid.md (this report), Execution/_OPEN.md (rows T179-a to T179-f).

Deleted: none. No token in :root changed, so DESIGN.md is untouched.

## Commands run

In C:\Users\Gebruiker\Documents\Portfolio\wt\T179-app. The Vite config and every helper script sit outside the worktree in wt\T179-shots\; vite.config.mjs there wraps the app's config with its own cacheDir (wt\T179-vitecache).

```
node node_modules/vite/bin/vite.js build --config ../T179-shots/vite.config.mjs          (base, before any edit)
node node_modules/vite/bin/vite.js preview --config ../T179-shots/vite.config.mjs --port 5207 --strictPort --host 127.0.0.1
node ../T179-shots/shots.mjs 5207 before
bash ../T179-shots/harness.sh before        (verify_beaches, lakes, mountains, trail_page, cycling, trails, places_tab)
(edits; i18n through ../T179-shots/tmp/i18n.py, which keeps BOM and CRLF)
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
node --test tests/cardFillings.test.mjs
npm run lint ; npm test ; node scripts/ci/design-lint.mjs ; node scripts/ci/banned-terms.mjs
node ../T179-shots/measure.mjs              (the value coverage over the wire files in public/)
rm -rf dist dist-data ; vite build (same config) ; vite preview on 5207
node ../T179-shots/shots.mjs 5207 after ; node ../T179-shots/skel.mjs 5207
node ../T179-shots/shots.mjs 5207 after-de de beaches,lakes,mountains
bash ../T179-shots/harness.sh after
rm -rf dist dist-data shots
```

The preview server was stopped after each run (wt\T179-shots\stop5207.ps1, which only stops a listener whose command line names T179). The final build, screenshots and harness run came after the last code change. Screenshots of the five grids at 380 and 1280 px in English, three in German, and the skeleton at both widths are in C:\Users\Gebruiker\Documents\Portfolio\wt\T179-shots\after and after-de, with report.json beside them; the harness logs are in harness-before and harness-after.

## Config and secrets set

None.

## Before/after measurements

Card geometry, from T179-shots/before and after report.json (browser, first cards of each grid; trails on Italy, the others on the Europe-wide list):

| Metric | Before | After | Delta |
|---|---|---|---|
| Card components for the five sections | 6 (one per section plus the tour) | 1 frame, 6 fillings | |
| Cards with exactly three measured values, first 6 checked per grid | 0 | all (5 sections, 2 widths) | |
| Grid columns at 380 px | 2 | 1 | -1 (spec 5.2) |
| Grid columns at 1280 px | 3 | 3 | 0 |
| Card height at 380 px | 116 px | 389 px, the same on every card | +273 |
| Card height at 1280 px | 149 px (138 on walks) | 366 px, the same on every card | |
| Photograph aspect | 1.45 phone, 2.08 to 2.25 desktop | 1.78 (16:9) everywhere | |
| Name | Fraunces 14.5 px phone, 17 px desktop, on the photo | Fraunces 19 px, under the photo | |
| srcset widths | 250 330 500 960 | 500 960 1280 | |
| Loading state | three dots | 6 skeleton cards, 348 x 389 at 380 px and 307 x 366 at 1280, equal to the real card | |
| Horizontal overflow, 10 screens in English and 6 in German | 0 | 0 | 0 |
| Page errors | 0 | 0 | 0 |
| npm run lint | 0 errors, 72 warnings | 0 errors, 72 warnings | 0 |
| npm test | 212 pass | 223 pass | +11 |
| design-lint new violations | 0 (196 in baseline) | 0 (196 in baseline) | 0 |
| Main stylesheet | 697.48 kB | 702.91 kB | +5.43 kB |
| Main script | 1,027.96 kB | 1,033.69 kB | +5.73 kB |

How many rows can fill all three values with real figures, counted over every row of the country files in continent-app/public (T179-shots/measure-after.txt). The rest show one or more "No data" cells; no row shows fewer than three cells.

| Section | Rows | Three real values | Missing most often |
|---|---|---|---|
| Walks and city days | 17,619 | 17,619 | none |
| Cycle routes, ranked and listed | 16,966 | 16,959 | traffic-free share (7) |
| Cycle tours | 17 | 17 | none |
| Beaches | 2,746 | 2,349 | length (288), orientation (168) |
| Lakes | 1,681 | 1,641 | area (39) |
| Mountains | 740 | 740 | none |

The layer harnesses against a preview of each build, PASS lines:

| Harness | Before | After |
|---|---|---|
| verify_beaches | 68 of 68 | 68 of 68 |
| verify_lakes | 81 of 81 | 81 of 81 |
| verify_mountains | 83 of 83 | 83 of 83 |
| verify_trail_page | 50 of 50 | 50 of 50 |
| verify_cycling | 70 of 72 (two wire checks) | 70 of 72, the same two wire checks |
| verify_trails | 34 of 34 | 34 of 34 |
| verify_places_tab | 37 of 38 (one lake photo failed to load) | 37 of 38, the same check |

The checks that read the card's insides still read real values: "filtered list really is under 5 km" parsed a maximum of 5 km, "length sort orders shortest first" parsed 2.1, 2.1, 2.1, 2.4, 2.4, the loop filter counted 36 loop marks on 36 cards, the lift filter 36 lift chips on 36 mountains, and "trip cards carry km and stops" read "12.8 km Length 6.8 h Time 4 Stops".

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A one-shot bash heredoc carrying the card code never ran | The heredoc trap (quotes and backslashes in JSX) | The code went through files written directly and a Python splice |
| styles.css gained a blank line and lost its final newline | A line-split script treated the file's trailing newline as a line | Reverted and appended the one import line with printf |
| A cycle card's hook read "A national signed route, 1, 93% of it is ..." | Two reason sentences joined by a comma | The hook takes the strongest reason whole; a tour takes its pace sentence only |
| A mountain read "Hike, from the terrain, Panoramic, Cable car" | difficultyLabel's estimate suffix carries a comma, and the lift tag repeated the chip | The grade word with a tilde and a title; the lift tag left out of the hook |
| Teide showed "0 Peaks in view" | view.peaks is 0 on 188 of 740 mountains | Distance to a higher peak instead, the area in view as its spare; row T179-c |
| Mont Blanc's "2812 km" sat beside "4,806 m" | The decimal helper turns grouping off | Whole kilometres from 100 up use the grouped formatter |
| verify_trail_page's card text read "Day hikeVery hard~LakeSummit" | The commas were CSS ::before content, which innerText leaves out | The commas are text in the DOM |
| "Mount Korab (9/1)" carried a 9/1 chip as well | The ref was compared with the whole name | The chip shows only when the name does not contain the ref |
| The skeleton check found no skeleton | The service worker answered the held request, so Playwright's route never saw it | The check runs with service workers blocked |

## Seven questions before shipping (carta-design)

1. No hex value outside :root: 37-card-fillings.css and PlaceCard.jsx use tokens only. The chips laid on the photograph (distance, verdict, photo label) keep their existing rules from 23-places-pages.css, unchanged.
2. No gradient and no new colour. The card removes one gradient (the photo scrim) from these five sections and draws nothing new beyond --bg-card, --paper-dim, --rule-soft, --ink, --ink-soft and --ink-mute.
3. Ochre is only the rating seal. Teal appears only as the hidden-gem label (--gem-ink on --gem-bg) on lakes and mountains the pipeline marks as gems. --danger is not used.
4. Mono carries only measured facts: the three values (lengths, times, heights, shares, counts, an orientation, a water class) and the ref chip. Their names, the hook and the place line are in the sans; a "No data" cell switches to the sans.
5. No button added inside a view. The card is one real button, as before; the page keeps its one accent primary.
6. No heading was added. The diff has no em dash, en dash, middot or bullet (checked over the added lines) and banned-terms reports clean.
7. Removed: the photo scrim, the chevron on every card, and the chip styling of the reason words, which are now one line of text. The bento's double first card and fourth stat were not built, by the owner's decision.

## What is still open

The 38 card.* strings in de, es, fr, it and nl are my translations and have had no native review (T179-a). In German one value name is longer than a third of a three-up card and ends in an ellipsis on desktop ("Höherer Gipf…" for Höherer Gipfel, on the mountain grid); the full word is in the title, but a shorter word or a two-line name would read better (T179-b). The German lake and beach grids fit. The viewshed's peak count reads 0 on 188 of the 740 published mountains, which looks like a pipeline fault in pipeline/mountains rather than a fact; no screen reads view.peaks today, but the pipeline's peaksInView reason (mtn.whyPeaksInView in lib/mountainStory.js) may come from the same count (T179-c). Beaches miss a length on 288 rows and an orientation on 168, and lakes an area on 39; those cards show "No data" cells until the wire carries the figures (T179-d, data lane). The hook is built from the labels the chips carried, so it reads as a list ("Lagoon, Dunes, Nothing built on it") rather than the spec's sentence with a verb or a number; a written hook per row needs a pipeline field or the sentence work of T158 (T179-e). The overlay rules in 23-places-pages.css and the phone block in 24-destination-workspace.css that only these five cards used (.places-bcard's aspect and radius, .places-card-scrim on them, .places-mcard-meta, the absolute positions of .places-lcard-swim and .places-card-km) are now overridden rather than deleted, because the country, destination and itinerary cards still share most of them; a cleanup can remove what no card reads any more (T179-f).

Two older rows are related but not closed. T182-f (way-up slots and the facing rose on the mountain and beach cards) is now half met: a beach card shows which way it faces as one of its values and a mountain card its lift on the photograph and as an icon, but the way-up slots of spec 10.3 are not on the card. T180-e (these cards do not call openShared) is unchanged; PlaceCard's button would be the place to add it.

Checked by hand: the five grids at 380 and 1280 px, the German lakes, beaches and mountains, the skeleton at both widths, hover on desktop. Not checked: a screen reader (the card's accessible name is everything on it, as it was before; the icons carry labels through role="img"), and a real phone.

## Rollback procedure

In continent-app, git revert 3855861 (or drop the branch before merging). In the root repo, revert the report commit, which also removes the T179 rows from Execution/_OPEN.md. No data, schema, migration, wire or stored state changed.
