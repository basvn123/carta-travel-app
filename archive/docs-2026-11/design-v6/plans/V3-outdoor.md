# V3 plan: outdoor detail pages (T386)

Written by T386 in design wave V3, 2026-10-08, before the first app edit. It carries out the V3 list of `docs/design-v6/briefs/outdoor.md` part 6 under the rules T380 accepted in `docs/design-v6/DIRECTION.md` (N1 to N11, now the "Detail page grammar" in carta-design). App paths are in the app repo and written as `src/...`. Mode stays Operate: the traveller decides whether one walk, ride, beach, lake or summit fits, then gets to it or takes it away.

## Shape (impeccable shape, on the surface as merged after V2)

V2 changed nothing a traveller sees (the v6 stylesheets are empty), so the surface is the one the brief walked. Measured again at the start of this task on an iPhone 13 viewport (WebKit, 390 x 844), slot tops inside the page's scroll box in px:

| Page | Hook | Map | Signature | Rows | Getting there | Take it with you | Height |
|---|---|---|---|---|---|---|---|
| trail 20050 | 582 | 708 | 1023 | 1360 | 1698 | 1824 | 2458 |
| beach Es Trenc | 628 | 776 | 1090 | 1443 | 1736 | 1896 | 2360 |
| lake Attersee | 609 | 991 | 1305 | 1751 | 1999 | 2159 | 2623 |
| mountain Hoher Dachstein | 648 | 1139 | 1454 | 1816 | 2064 | 2399 | 2863 |
| cycle 1150 | 615 | 742 | 1056 | 1500 | 1748 | 1895 | 2430 |

The tour link still crashes in this worktree (T375-a, fixed by T384 in `DestinationsTab.jsx`, which this session does not touch).

- Job and audience: a hiker, a family or a cyclist on a phone, often from a friend's link with one bar of signal, deciding whether this place fits and then taking it away.
- Outcome and proof: the key facts and the one hand-off (the GPX on a route, the priced trip to the base on a place) inside the first screen and a half; one primary in the same slot on all six pages; measured figures in mono, never adjectives.
- Structural thesis: decision, then hand-off, then depth. Head, hook, key facts band, Before you go, hand-off band, map, signature, at most five rows, exits, sources. The focal moment stays the signature figure.
- Boundaries: the journey page shares `.jstrip`, `.jpage-lrow` and `.jpage-exit`; nothing here changes its look. New rules go in `src/styles/65-v6-outdoor.css`, scoped to `.dsk-page`. No new token, colour or gradient. Shell files (`ReportProblem`, `MonthStrip`, `SectionRail`, `useFocusTrap`, `costIndex.js`) are read or mounted, never edited.
- Where impeccable would ask: every choice keeps Carta's palette, type and identity (refinement, not redesign); the choices are listed in the report.

## The changes, in order

0. Baseline (done before this plan was committed): the eight surface harnesses on the dev server at port 5206 and the 1280 px before shots of five views (row T375-e). Then T375-b: the cycle route's three bike claims read one field. `src/lib/cycleStory.js` `surfaceLine` stops saying "Paved throughout" when the route's bike field asks for a gravel or mountain bike, and `src/browse/CyclePage.jsx` drops the "a road bike is fine" sentence in that case. Test in `tests/`.
1. Skeleton order. `src/browse/DetailSkeleton.jsx` takes three new slots, `keyFacts`, `beforeGo` and `handoff`, and renders head, hook, key facts, Before you go, hand-off, map, signature, rows, exits, sources in one DOM order for both widths. The old `notFor`, `alert`, `gettingThere` and `takeAway` props keep working (they render inside Before you go and the hand-off band), so a page that has not moved yet still draws. The header comment block is rewritten. Desktop keeps the 60/40 grid with the sticky map; Getting there and Take it with you sit side by side inside the hand-off band from 900 px.
2. Key facts band. New `src/browse/KeyFacts.jsx` (a `dl` of four to six timetable cells, label over value, values in mono with units, a missing value as the strip's placeholder word) and `keyFactCells()` in `src/lib/detailSkeleton.js` (caps at six, pads to four with placeholders, tested). Facts per page: trail (time, ascent, descent, high point, waymarked, season), cycle route (km, climb, bike, paved share), tour (days, km, climb, bike), beach (bathing water class with its site, the way in, lifeguard, length), lake (swim verdict, season, area, depth), mountain (height, prominence, the way up in one word, season). The old facts rows stay as the "all measurements" row where they carry more than the band.
3. One hand-off band, one primary. Routes lead with the file (GPX or "Send to a hiking app"); places lead with "Price a trip to {base}". Secondaries in a fixed order: directions, Google Maps file (trail), follow on the map (trail), add to a day plan. "Add to a day plan" leaves the head. "Send the link" leaves the band (the bar's share icon is the one share door). "Report a problem" moves into the sources fold. The primary takes the 6 px radius and `--tap`.
4. Files. The cycle route's GPX takes the primary look; a tour gets a GPX with one track per day, cut from the tour line at each stage's `start_m` and `end_m` and credited as the route GPX is (`tourGpx` in `src/lib/trailExport.js`, tested for track count equal to days).
5. Getting there names a town before any coordinate. Trail: "4 km from Gosau" first, then directions, then the coordinates in a smaller mono line. Places: the base town, then directions with the coordinates. Cycle: stations with their km along the route. Where the wire has no stop data, one sentence says so (`detail.noStopData`; the field is row T375-d for the data lane).
6. Before you go. Not-for lines and hazards render as one block under one heading (`detail.beforeGo`), safety lines first. `notForLines` takes the hazard codes the page shows and drops the not-for line that restates one (glacier, exposure, altitude, lightning, cold, algae, dam, current), tested. The lake's swim verdict moves into the key facts band and stays unfolded.
7. Duplicates out. The beach's score chip button, "See how this score is made up" and the head breakdown go; the score row carries the weights and is the one door. The mountain's "How you get up" row goes (the way up block sits in the hand-off band). A row's preview is never the hook (`previewNotHook()` in `src/lib/detailSkeleton.js`, tested).
8. Rows grouped and capped at five. Trail: About this walk (why, what you walk past, what to expect), The route (stages, bases, stops, family), Photographs, All measurements. Beach: About this beach (why, facing, way down), All measurements, Score, Photographs. Lake: About this lake (why, shore, walks), All measurements, Score, Photographs. Mountain: why, All measurements, Score, Photographs. Cycle route: why, towns, all measurements, photographs. Tour: The route (stages, towns), checks, why, all measurements, photographs. Previews wrap to two lines instead of an ellipsis. Stage rows open the stage when it is published in the country file, otherwise they are a plain list item: no disabled button ships (`src/browse/RouteParts.jsx`).
9. Signatures show what Carta measures. Trail: the surface bar joins the slope profile as a second track. Cycle route: the elevation profile leads the instrument above the surface and traffic bars. Beach: the three empty month tracks leave; the panel shows the measured bathing water class and site and the way the shore faces, and the missing sea, wave and crowd records are named once in the sources. Mountain: the empty horizon row leaves.
10. Waymarked and season as facts on the trail (`trailWaymarked`, `trailSeason` in `src/lib/trailCards.js`, tested); an estimated season carries "est.".
11. The cost line (N3) is not built in V3: the outdoor pages do not receive the traveller's Lifestyle choices, and the figure must come from `costIndex.js` at that Lifestyle to agree with the receipt. Passing the choices is a prop on `DestinationsTab.jsx` (destinations) or a shell hook; register row.
12. One back label rule: the back control names the list on every page ("Trails", "Cycle routes", "Beaches", "Lakes", "Mountains") through new `detail.back*` keys. The cycle family page keeps its own layout (V5 item).

Every new string in en, de, es, fr, it and nl, under the `detail`, `notfor`, `trails`, `cycle`, `beach`, `lake`, `mtn` and `sig` prefixes this surface owns; one owner row for native review.

## Checks

The eight surface harnesses on port 5206 (assertions that encode the old order or the removed doors updated with a comment, never deleted); `npm test` with the new unit tests; `npm run lint` 0 errors; `node scripts/ci/design-lint.mjs` 0 new violations; `node scripts/check_ownership.mjs` with KeyFacts.jsx added to OWNERSHIP.md; `impeccable detect --json` over every changed file at 0 findings (baseline 0); `npm run build`, then dist and dist-data deleted; the phone checks of T414 (iPhone 13 WebKit, Pixel 5, 360 x 740, landscape, keyboard, safe areas, tap targets); after screenshots under the V1 view names. Done when, at 390 x 844, the key facts band starts above 800 px and the hand-off band above 1400 px on all five measured pages, and every page has one accent-filled control.
