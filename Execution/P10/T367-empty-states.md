# T367: the empty states from the approved onboarding document

## Task ID

T367 (register rows T211-b and T124-f; no mind-map prompt exists for it).

## Date

2026-10-07

## What changed

Every empty state in the tables of `docs/ONBOARDING_AND_EMPTY_STATES.md` (approved by the owner on 2026-10-07, T362) now does what the table says: it names the space, gives one action as a real button, and where the empty thing has a geography it says why and offers the three nearest published rows across the border. Before this task 33 of the document's 71 rows matched it (the rows it marked "keep" whose action was already on screen); after it, all 71 do, six of them with a deviation written down below and raised as T367-c.

The coverage module T124 built for the seven microstates now serves every country and every searched place. On the Destinations tab, a walks, beaches, lakes, mountains, cycling or composed-trips list that is empty because of where it is shows the count line ("Albania, 0 cycling routes published"), the best reason the wire holds, the three nearest rows from the neighbouring countries and one button. A list that a chip, a filter or a search emptied says so and offers the one button that undoes it, and never blames the catalogue. The three "layer has not shipped yet" sentences are gone: a failed load says so per layer with a retry, and the frame before the fetch starts shows the loading skeleton. The journeys library, the composed trips, the planner's country brief and a stale region link get the same treatment in their own form. Gone pages (a cycle route, a week of the library) say so and hand back the way to the list.

On the destination page, Around here, Routes from here and Getting there keep their heading when they have nothing to show and say so in one line, with the nearest published walk, route or feature as a link. On the wire of 2026-10-02 that changes 114 of 3,869 destination pages for Around here, 264 for Routes from here and 1 for Getting there (counted over `continent-app/public/dossier/*.json` in the main checkout). Where to sleep stays hidden when empty, by decision (below).

T124-f is closed: the module's count line and the nearest rows now set only the numbers in mono (the place and country names are sans), and the stub page no longer shows the skeleton's generic Getting there note or an empty Where this comes from fold; its one credit line is said in the open.

Two hardcoded English strings moved into keys, seven dead keys and eleven keys the module replaced were deleted, and every new or rewritten string is in all six catalogues.

## How it works

The module is `src/browse/CoverageEmpty.jsx` on top of two libraries. `src/lib/coverageCases.js` is new and pure (no loaders, so Node can test it): `countryCase` decides the reason, `countryGeo` and `pointGeo` find where a country or a searched place is and which countries border it, `kmTo`, `kmBetween` and `nearestThree` measure and rank, `nearestRegions` serves the stale region link. `src/lib/coverageEmpty.js` (T124's file) keeps the layer loaders and re-exports the pure half, so T124's imports still work.

The reason comes from three sources in order of trust. The seven microstates keep the document's own table (T124's `CASES`). Next is the coverage contract's reason code per country and layer, which `pipeline/regions/coverage.py` writes but the wire does not carry yet (T211-c, T160-a); the seven code sentences are written and keyed (`cov.reason.noOpenData`, `wayOnly`, `gaps`, `belowQuota`, `licence`, `partnership`, `notApplicable`) and switch on by themselves once the field lands. Until then the region audit decides: when every region of the country is `na` for the layer, the `why` they share picks the no coast, no lake over 5 hectares or no relief sentence; otherwise the sentence is "Coverage grows country by country", which is true of any empty country. The reason is not drawn until the audit has answered, so it is never first said one way and then corrected.

The neighbours come from the catalogue's own towns: a country's centre is the mean of its towns, and its four neighbours are the countries whose nearest town is closest to any of its towns. A searched place uses the same scan from its point. The nearest three are read from those neighbours' country files, measured to the nearest vertex of a line (a walk passes a town; its middle may not) and deduplicated by name, or for a composed trip by its cities in order. A trip that passes through the empty country is never offered as "across the border". A nearest row further than 300 km is across a sea, so the rows are not listed and one sentence says where the nearest is instead (T124's Faroes rule, now also on the journeys form).

Which country a list is empty for is decided in one place in `DestinationsTab` (`typedCc`): a word the traveller typed that names a country (any country, which is how "monaco" reaches the lakes module), else the country picked in the toolbar. A typed word that names no country names no empty country, because the list is then empty because of the word. That rule exists because the first version said "Luxembourg, 0 cycling routes published" over a search miss.

The detail-page line is `NearestLine` in the same file. It states the radius the build searched (20 km for Around here, `AROUND_KM` in `pipeline/dossier/build_dossier.py`; 25 km for Routes from here, `MAX_KM` in `pipeline/trails/attach.py`; the join's own radius per layer pair for the cross-layer blocks, `RULES` in `pipeline/joins/neighbours.py`) and then measures the nearest row itself. If that row turns out to be inside the radius, the "none within" sentence is dropped and the row is named alone, so the page can never contradict itself; a nearest row beyond 300 km is not named.

The cross-layer blocks on the beach, lake, mountain, trail and cycle pages (`NearbyOutdoors`) only make that claim for a row the join stamped. The join drops `nb` on a row where it found nothing at all, and a layer file rebuilt after the join carries no `nb` anywhere: the wire of 2026-10-02 holds none on any of its 23,292 layer rows (2,746 beaches, 1,681 lakes, 740 mountains, 17,619 trails, 506 cycle routes, counted over `continent-app/public/{layer}/{CC}.json`). So a row without the block is "not measured", and the blocks still render nothing on today's wire. A layer pair the join has no rule for (a mountain's lakes) was never searched and stays silent too. The data lane has to rerun the join for these lines to appear (T367-a).

Two existing bugs sat directly on the empty states and were fixed with them. The cycling list's listed tier drew its heading over nothing whenever the list was empty, right above the module (its window was not capped by its own length). T124's `nearestThree` dropped every row that has no name, so composed trips never had nearest rows.

## The five detail-page sections, decided one by one

Around here (`AroundHere`): keeps its heading and one line with the nearest feature from the five layers. The dossier writes no block when nothing of five layers lies within 20 km, so the absence is a gap a traveller should hear about. Routes from here (`RoutesFromHere`): the same, with the nearest walk or cycle route by line distance. Getting there (`GettingThere`): one line, "Carta has no airport, transit or car facts for {city} yet", without a nearest (there is no layer to point at); it shows on one destination today. The cross-layer blocks (`NearbyOutdoors`): one line per block the join searched and left empty, as above. Where to sleep (`Neighbourhoods`) stays hidden: its content is the Inside Airbnb neighbourhood split, the tiers and the season curve, which exist for 745 of 3,869 destinations; the bed price itself is in the cost receipt on the same page and is never blank, so hiding the fold loses the traveller no number, and naming the nearest anchor city would not help them price a bed here.

## Files touched

Root repo, branch p10-empty-states.

Created:
- Execution/P10/T367-empty-states.md

Modified:
- Execution/_OPEN.md (T211-b and T124-f closed by T367; rows T367-a to T367-e appended)

App repo, branch p10-empty-states.

Created:
- src/lib/coverageCases.js (the pure half of the module, split out of coverageEmpty.js)
- tests/coverageEmpty.test.mjs (12 tests)

Modified:
- src/browse/CoverageEmpty.jsx (country and radius modes, MonoLine, NearestLine)
- src/lib/coverageEmpty.js (loaders only, re-exports coverageCases.js; loadNearest takes a geo, loadNearestIn and loadNearestOf added)
- src/browse/DestinationsTab.jsx (every Destinations empty state; the cycling listed window cap)
- src/browse/JourneysSection.jsx, src/browse/JourneyPage.jsx, src/browse/CyclePage.jsx, src/browse/RegionPage.jsx
- src/browse/DestinationPage.jsx, src/browse/NearbyOutdoors.jsx
- src/browse/StubPage.jsx, src/browse/DetailSkeleton.jsx (T124-f: `gettingThere={false}` and `sources={false}` leave those slots out)
- src/browse/ExploreTab.jsx, src/browse/PlacesFilterSheet.jsx
- src/planner/CountryBrief.jsx, src/planner/GuidedTripWizard.jsx, src/planner/TownPickerStep.jsx, src/planner/DayAddPanel.jsx, src/planner/DayExploreBuilder.jsx
- src/components/Dropdown.jsx, src/components/CountryPicker.jsx
- src/community/GuidesPanel.jsx, src/App.jsx (one prop: the guides gallery's Publish a trip button opens My trips)
- src/auth/SavedTripsPanel.jsx (the round icon mark is gone from the empty block)
- src/styles/45-empty-states.css (the module, the action rows, the section line, the Explore and sheet zero lines)
- src/styles/12-guided-trip.css, src/styles/10-shell.css (the wizard and picker empty lines are no longer italic metadata grey)
- src/styles/17-saved-trips.css, src/styles/24-destination-workspace.css (the dead `.saved-empty-mark` rules)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js

## Commands run

```
python wt/T367-shots/i18n_t367.py <app worktree>       (English: 45 added, 17 rewritten in place, 18 deleted; line endings and BOM kept)
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
npm run lint; npm test; node scripts/ci/design-lint.mjs
node node_modules/vite/bin/vite.js --config ../T367-shots/vite.t367.mjs     (port 5212, cacheDir in T367-shots; stopped)
node ../T367-shots/check.mjs                            (the empty-state harness, 380 and 1280 px)
node scripts/verify_beaches.mjs http://localhost:5212/  (and lakes, mountains, trail_page, places_tab, cycling, layer_errors, places_search)
npm run build; rm -rf dist dist-data
```

The harness serves a few files changed in flight to reach states today's wire never shows (Luxembourg's walks and trips served empty, one Croatian beach given an `nb` block, a dossier served without its practical block, one country's composed trips served empty or failed in the planner brief, the journey file of the first card served as missing); nothing on disk changed. Screenshots are in `wt/T367-shots/shots/`.

## Config and secrets set

None. The Supabase variables were unset in every shell, the worktree has no `.env`, and nothing contacted the live project. No migration, no dependency, no data write.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Rows of the document's empty-state table built as it specifies | 33 of 71 | 71 of 71 (6 with a written deviation, T367-c) | +38 |
| List types whose country empty state prints a reason in words | 0 (only the 7 microstates, T124) | 6 (walks, beaches, lakes, mountains, cycling, composed trips), every country | +6 |
| Reason sentences keyed (`cov.reason.*`) | 7 (T124's microstate cases) | 16 (plus the 7 contract codes, the empty sentence and the unnamed partner) | +9 |
| Empty states saying a layer "has not shipped yet" | 3 | 0 | -3 |
| Empty states hardcoded in English | 2 (Dropdown, wizard stay list) | 0 | -2 |
| Empty-state keys in en.js rendered by nothing | 7 | 0 (and the 11 keys the module replaced deleted too) | -7 |
| Detail-page sections that vanish when empty | 5 | 1, by decision (Where to sleep) | -4 |
| Destination pages where Around here was missing on today's wire | 114 of 3,869 | 0 (the section says so) | -114 |
| Destination pages where Routes from here was missing | 264 of 3,869 | 0 | -264 |
| Keys per catalogue (counted by importing each file) | en 5,404, the other five 4,562 each | en 5,431, the other five 4,597 each | en +27, others +35 |
| Unit tests | 320 | 332 | +12 |

The 33 "before" rows are the document's keep rows whose action was already on screen (rows 2, 6, 10, 14, 19, 29, 31, 32, 37, 41 to 44, 47 to 52, 54, 57 to 67, 70, 71; row 65's handle is shared by the Invite button in the same panel). The keys line is net: 45 added and 18 deleted in English; in the other five, the same 45 plus five rewritten keys they had been missing (they fell back to English before), and 15 deleted (three of the dead keys never reached them).

Checks: npm run lint 0 errors, 70 warnings (71 on the base); npm test 332 of 332; design-lint 196 found, 196 in the baseline, 0 new; npm run build passes; all six catalogues parse. Harnesses on the dev server: beaches 68/68, lakes 81/81, mountains 83/83, trail_page 50/50, places_tab 38/38 (37/38 on master, the one failure there an image that did not load offline), cycling 70/72 as on master (the same two). Two harnesses that touch the Destinations tab failed before this task and fail the same way after it, checked against the base by stashing: verify_layer_errors 14/24 (it looks for a retry button class the ErrorBlock does not use) and verify_places_search (it waits for a General category that no longer exists); raised as T367-e. The empty-state harness passed 172 of 172 checks with no page errors and no horizontal scroll at 380 and 1280 px.

## The seven carta-design questions

Answered from the diff and the screenshots in `wt/T367-shots/shots/`.

1. Hex values outside :root. None. Every new rule uses tokens, and the components carry no inline colour.

2. Gradients, colours not in DESIGN.md, a second saturated hue. None. The only `--accent` is the focus outline and the hover of the inline nearest link. The module and the section line are prose on paper with hairlines and one bordered button, no card, no tile, no shadow.

3. Ochre, teal and danger. Not used. Nothing on an empty state is a rating, a gem or a deletion.

4. Mono. Fixed where T124 broke it (T124-f): the count line is sans with only the count in mono, and the nearest rows set the country name in sans beside a mono distance; the harness checks the computed font of both at both widths. The section line sets the radius and the distance in mono inside a sans sentence through `MonoLine`, which swaps the measured values into one catalogue string so word order survives translation. One borderline case: the stale region link lists region codes (ITC1) in mono beside the region name, treating them like airport codes, which the skill lists as mono.

5. Primary buttons. None added. Every action on an empty state is a secondary (transparent, `--rule` border, 44 px); the screens keep their one primary (the brief's Add country, the filter sheet's apply).

6. Headlines and banned words. The empty states have no headline of their own except the region page's existing h1 ("That region is not in the catalogue", which has its verb). Button labels are verb first where the document gave a noun ("See all cycle routes", "See all trips", "Show all countries", "Pick on the map"). The diff is free of em dashes, en dashes, middots and the banned words; cycle route names from OpenStreetMap pass through `stripDashes` in the nearest rows, so an en dash in a route name becomes a comma.

7. Remove one thing. Removed: the round icon mark on the My trips empty block, which the document named and which carried nothing the sentence does not say. Seen and left: on the radius form the line "The nearest published" sits under a count line that already says how far nothing reaches, and could go; it stays because the country form needs it and the two forms should read the same.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| "Luxembourg, 0 cycling routes published" over a search that matched no route | The empty country was taken from the toolbar even when a typed word, not the country, emptied the list | A typed word that names no country names no empty country (`typedCc`) |
| The cross-layer blocks would have said "no walk within 5 km" on every beach page | The wire carries no `nb` on any row, so absence was not the join's claim | Only a row with an `nb` block makes the claim (T367-a for the data lane) |
| Composed trips never had nearest rows | T124's dedupe dropped every row without a name | Dedupe by name, or by the cities in order, and keep rows with neither |
| The same composed route came back three times, at three lengths | Each length is its own row | The cities in order are the identity |
| An empty cycling list showed "Also here, not scored yet" over nothing | The listed window was not capped by the listed length | Capped |
| Iceland's nearest cycling week was in Sweden, 1,882 km away, listed as a neighbour | The journeys form had no sea rule | The 300 km rule, as in the module |
| Lanzarote's nearest walk would have been named at 1,073 km | The section line had no sea rule | Not named beyond 300 km |
| Lint: control characters in a regular expression | MonoLine's first markers were \u0001 and \u0002 | Private-use characters |

## What is still open

The cross-layer lines cannot appear until the join runs again after the layer exports, because no row on today's wire carries `nb` (T367-a, owner, data lane). The reason codes still wait on the coverage contract reaching the wire (T211-c and T160-a stay open); until then most non-microstate countries get "Coverage grows country by country", which is true but says less than the code will.

Some states are built but were not reached headless: the airport picker's no-match line, the Dropdown no-match line, the wizard stay list's no-match line, the chat town picker's two states, the day builder's empty kind, an empty pick in the day planner (every pick has places in Brussels), the composed trips' empty length (the day rail greys a length with nothing, so the state needs a stale selection), the friend's gone trip and the empty guides gallery (both need a Supabase this worktree does not have, and the live project was off limits). T367-b.

Six rows deviate from the document's copy or action, each for a reason in the code comments: row 5 (city walks near a place keep their sentence with a Show all countries button, because the nearest-walk module would offer hikes, not city walks), row 26 (the sentence says "this style" rather than the style's long name, which reads badly mid-sentence), row 30 (there is no all-regions view to send a stale link to; the three nearest regions and the back arrow are the way on), row 34 (the planner brief says "trip", because these are composed trips of any length, not weeks), row 56 (the day builder's loaders stop at the stay's reach, so the nearest of a kind beyond it is not known; the Show all kinds button is there), row 68 (the gone friend trip has no Friends button because it opens inline in the friends list, and its second sentence says "made private, or the friendship ended", because "your friend took it off their list" is only one of the two causes). The document should be revised to match, or the missing pieces built (T367-c).

Hardcoded English outside the document's rows is left for a later task: the wizard stay list's headings and the Dropdown's default placeholders (T367-d). Two Destinations harnesses fail on the base and on this branch alike (T367-e). Row T124-d (San Marino's mountain sentence in the document) is untouched and still open.

The approved document's copy is now in six catalogues; the German, Spanish, French, Italian and Dutch are mine and have not been read by a native speaker.

## Rollback procedure

Revert the app commit on p10-empty-states (`git revert`, or reset the branch to the master it was cut from) and the root commit that carries this report and the register rows; then set T211-b and T124-f back to `open` in `Execution/_OPEN.md` and remove rows T367-a to T367-e. Nothing was written to data, `public/`, the database or a migration, so there is nothing else to undo. The catalogue deletions come back with the revert.
