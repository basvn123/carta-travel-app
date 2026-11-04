# Design brief: outdoor detail pages (key 'outdoor')

Written by T375 in design wave V1, 2026-10-08. This is the brief V3, V4 and V5 build the trail, cycling route, cycling tour, beach, lake and mountain pages from. It plans and does not build: no app code changed in V1.

Read with it: `PRODUCT.md`, `DESIGN.md`, the carta-design skill, `docs/design-v6/TRIP-PLANNING-RESEARCH.md` (section "Outdoor detail pages"), and from V2 on `docs/design-v6/DIRECTION.md` and `docs/design-v6/OWNERSHIP.md`. Where this brief and carta-design or DESIGN.md disagree, carta-design and DESIGN.md win. Every proposal that needs a rule carta-design does not have is in part 7 and waits for T380 (V2) to accept or reject it.

App paths below are in the app repo and written as `src/...`.

## 1. Setup and mode

impeccable context ran from the root worktree with a relative target and loaded `PRODUCT.md` and `DESIGN.md` (no surface brief existed yet; this file is it). The method files read were `reference/critique.md`, `reference/audit.md`, `reference/shape.md` and `reference/operate.md` from the project copy (v4.3.1). The run is unattended on the owner's instruction of 2026-10-07, so where impeccable would ask, this brief takes the option that keeps Carta's palette, type and identity and says so. This is refinement: impeccable's "Refinement preserves" applies, and no new visual world was rolled.

Mode: **Operate**. The traveller arrives on one of these pages with a task: decide whether this walk, ride, beach, lake or summit fits them, then get to it or take it with them (a GPX in their hiking app, a link to a friend, a priced trip to the base town). Success is a decision and a hand-off, not reading pleasure and not a sale. Operate's rules fit that: scanability, one consistent component vocabulary across the six page types, density where the figures need it, motion only for state. The pages carry some Read material (why this walk, what to expect), and that stays folded under the decision content rather than leading it. Persuade does not fit: Carta takes no booking, and a page that sells the place would break the honest voice PRODUCT.md asks for.

## 2. The walk, before

Walked on the shared dev server (http://localhost:5199) with Playwright at 380 x 800 (the 1280 x 800 pass timed out, see below), each page opened by its share link the way a returning traveller or a friend's link opens it, and once from a cold start (no stored state). The pages walked:

| View | Link | What it is |
|---|---|---|
| trail | `#trail=20050&tc=AT` | BergeSeen Trail 15, Gosau-Hintertal to Hallstatt, a stage of a waymarked regional route |
| beach | `#beach=es-es-trenc-Q11919677&bc=ES` | Es Trenc, Mallorca |
| lake | `#lake=at-attersee-Q698516&lc=AT` | Attersee |
| mountain | `#mtn=at-hoher-dachstein-Q686841&mc=AT` | Hoher Dachstein |
| cycle | `#cycle=1150&cc=AT` | EuroVelo 6, Austria leg 3 |
| tour | `#tour=de-usedom-rundweg-relaxed` | Usedom Rundweg, three days |

Before screenshots are in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\outdoor\` as `V1-<view>-<width>.jpg` (outside both repos, never committed). The build waves save their after set under the same view names. The shared server was heavily loaded during this run (a plain page load took up to 288 s and several loads timed out at 300 s), so V1 saved six phone shots (trail, beach, lake, mountain, cycle route, and the tour's crash screen) and no 1280 px shots; the desktop before set is register row T375-e, taken from the V1 merge commit before V3 changes anything. The desktop notes below come from the code (the 60/40 grid in `src/styles/28-detail-skeleton.css`), not from a capture.

Measured on the walk at 380 px (scroll positions are the top of each slot inside the page's scroll box, in px; the screen is 800 high):

| Page | Hook | Map | Signature | Rows | Getting there | Take it with you | Page height |
|---|---|---|---|---|---|---|---|
| trail | 710 | 837 | 1211 | 1566 | 1904 | 2031 | 2601 |
| beach | 756 | 904 | 1278 | 1631 | 1924 | 2084 | 2496 |
| lake | 737 | 1145 | 1519 | 1964 | 2212 | 2372 | 2784 |
| mountain | 776 | 1288 | 1662 | 2025 | 2273 | 2608 | 3020 |
| cycle route | 742 | 869 | 1243 | 1687 | 1935 | 2082 | 2252 |
| tour | not reached: the app crashed (see below) | | | | | | |

What the numbers say: on a phone the first two thirds of the first screen is the photograph (the hero is 56vh, `src/styles/28-detail-skeleton.css`), the hook sentence lands at the bottom edge of the first screen, and the two blocks that answer "can I get there" and "can I take it with me" sit two and a half to three and a half screens down, below a 44vh map, the signature figure and every folded row. No page overflowed sideways at 380 px (measured 0 px). Every page has exactly one `h1`.

The traveller's walk, in order, as the hiker of `TRIP-PLANNING-RESEARCH.md` meets it on a phone:

1. A large photograph and a paper strip of three cells: "Hard, Day hike, 16.4 km". Good: grade, kind and length in the first screen.
2. The title (Fraunces, 21 px on the trail page against 27 px on the other four, because the trail title uses its own class), a ref chip, the place, an ochre rating, a terracotta "Loop" chip and an "Add to a day plan" button, before any argument for the walk.
3. "Not for you if a climb of 985 m sounds like a long day." The page warns before it has said how long the walk takes: time, ascent and descent are inside the closed "The measurements" row.
4. A map (a blank paper box for several seconds while maplibre and the tiles arrive), then "Where the climbing is", the slope profile. This is the strongest figure on the surface.
5. Seven closed rows that all look alike.
6. "Getting there": coordinates to five decimals, "4 km from Gosau (Gosausee)" and "Directions to the start". Nothing about a bus or train stop, although the research names it as the hiker's main barrier.
7. "Take it with you": a full-width terracotta "Download GPX", then "Google Maps file", "Send the link", "Follow on the map" and "Report a problem".
8. "Three other places to try", then "Where this comes from".

On the beach a family meets "Not graded" in the first strip cell, then a hook that says what the photo already shows ("Es Trenc is a sand beach in Campos."), then a generic "Not for you if you need today's conditions", then a map, then a signature figure of three empty tracks ("Not measured yet" for sea temperature, wave height and crowds), and only inside the closed "What is there" row the measured EU bathing water class, "Excellent". The way in to the beach, the lifeguard and the facilities are in the same closed row.

On the cycle route the strip reads "Gravel bike, 25 km" beside the lowest grade marked with a tilde, the Not for you line says "Not for you on a road bike: the roughest stretch needs a gravel bike", and the signature note under it says "Paved throughout. Smooth tarmac all the way. A road bike is fine." Three claims about the same 25 km disagree on one screen. The hero was an empty paper box for the whole capture (the photograph had not arrived), the elevation profile is a folded row, the GPX is a bordered button beside "Send the link", and the page has no "Three other places to try" or nearby block when opened from a share link (the exits and nearby slots are absent from the DOM).

The tour could not be walked: opening its share link (`#tour=de-usedom-rundweg-relaxed`, the format `CyclePage.jsx` writes) crashed the whole app to "Something went wrong" with `RangeError: invalid_argument` from `Intl.DisplayNames.of` inside the Destinations tab (the `countryName` helper in `src/browse/DestinationsTab.jsx` passes a code that is not a region; a tour link carries no country). Every shared tour link is broken today. This is a P0 for the next task, not a design call, and is in the register.

Cold start against returning visit: a share link opens the page directly in both cases, and the cold trail page measured the same as the returning one (same slots, same 2601 px height, no first-run overlay over a shared link). A returning traveller with stored state lands on the page with the back button focused (a 2 px terracotta ring on "Back" on arrival, from the dialog's initial focus in `src/browse/DetailSkeleton.jsx`, `useFocusTrap(..., { initialFocusRef: backRef })`). Closing the page leaves the traveller on the Destinations tab of that layer, so "Back" on a shared link goes to a list the traveller never saw; the label reads "Back" on trails and "Beaches", "Lakes", "Mountains" on the others.

## 3. Inventory

Every view, state, control and visual setting on the surface. Verdicts: keep, move, merge, remove, rework. File paths are in `src/`.

### Views and states

| Item | What it does | Where it sits | File | Verdict |
|---|---|---|---|---|
| Detail dialog shell | Full-screen `role=dialog` with focus trap, top bar and scroll box | Over the Destinations tab | browse/DetailSkeleton.jsx `DetailPage` | keep |
| Trail page | A published hike or city day | Shell slots | browse/TrailPage.jsx | rework (order) |
| City day page | A trail of category `citytrip`: stops, legs, "See {city} prices" | Shell slots | browse/TrailPage.jsx (`isCityDay`) | keep, check after rework |
| Follow mode | Live GPS against the route, map takes the page, HUD | Map slot, page class `following` | browse/TrailPage.jsx `useLiveFix`, `.tpage-hud` | keep |
| Follow: finding you | "Finding you" while the first fix arrives | HUD card | TrailPage.jsx | keep |
| Follow: denied, unsupported, unavailable | One sentence per cause | HUD card | TrailPage.jsx `tpage-hud-err` | keep |
| Follow: off route | "{m} m off the route" | HUD card | TrailPage.jsx | keep |
| Cycle route page | One route: surface and traffic instrument, rows | Shell slots | browse/CyclePage.jsx `CyclePage` | rework |
| Cycle tour page | A tour over routes: days, stages, checks | Shell slots | browse/CyclePage.jsx `CyclePage` (`tour`) | rework |
| Cycle family page | A long route's national sections | Its own page, not the skeleton | browse/CyclePage.jsx `CycleFamilyPage` | move into the skeleton's vocabulary (V5) |
| Cycle loading | A literal "…" in a paragraph | Head slot | CyclePage.jsx | rework (skeleton at final size) |
| Cycle gone | "This route is not published any more" plus "See all cycle routes" | Head slot | CyclePage.jsx | keep |
| Beach page | One beach | Shell slots | browse/BeachPage.jsx | rework (order) |
| Lake page | One lake, swim verdict that never folds | Shell slots | browse/LakePage.jsx | rework (order) |
| Mountain page | One summit, hazards that never fold | Shell slots | browse/MountainPage.jsx | rework (order, duplicates) |
| Map loading | Paper-dim box at final size while maplibre loads | Map slot | DetailSkeleton.jsx `PlaceMap` fallback, `.dsk-map-wait` | rework (say it is loading) |
| No start point | "The data has no start point for this one yet. Search its name in your maps app." | Getting there | DetailSkeleton.jsx, `detail.gettingThereNone` | keep |
| Toast | "Link copied", "GPX saved", "KML saved" | Bottom of dialog, `role=status` | DetailSkeleton.jsx `tpage-toast` | keep |

### Controls

| Control | What it does | Where | File | Verdict |
|---|---|---|---|---|
| Back ("Back", "Beaches", "Lakes", "Mountains") | Closes the page | Top bar, left | DetailSkeleton.jsx `tpage-back` | rework: one label rule for all six |
| Bar title | Name appears once the heading scrolls away | Top bar | DetailSkeleton.jsx `tpage-bar-title` | keep |
| Favourite star | Saves the item | Top bar | components/FavStar.jsx | keep |
| Share (icon) | Share sheet or copy link | Top bar | DetailSkeleton.jsx `tpage-bar-act` | keep; merge with "Send the link" below |
| Ref chip ("15 S Trail") | The waymark ref of the route | In the h1 | `.dsk-ref` | keep |
| Rating badge (trail, cycle) | Ochre score | Under the title | components/RatingBadge.jsx | keep |
| Loop chip | Says the route is a loop | Under the title | TrailPage.jsx `.tpage-loop` (accent tint) | rework: ink outline, it is a descriptor, not an action |
| Score chip as button (beach) | Opens the score breakdown in the head | Head | BeachPage.jsx `bpage-scorebtn` | merge with the "How the score is built" row |
| "See how this score is made up" (beach) | Same as the score chip | Head | BeachPage.jsx `bpage-scorehint` | remove (duplicate door) |
| Score breakdown list (beach, in head) | Parts with weights | Head, when open | BeachPage.jsx `bpage-parts` | merge into the score row |
| Hidden gem label (lake, mountain) | Teal gem | Score row | `lpage-gem` | keep |
| Add to a day plan | Sends the place to the day planner | Head, every page | `feat-dayplan` | move: into "Take it with you" |
| Hook sentence | One line with a verb or number | Under the head | `.dsk-hook` | rework: never repeat the first row's preview |
| Not for you if | Who this is not for, from data | Under the hook | components/NotFor.jsx, lib/notFor.js | merge with the alert into one "Before you go" block |
| Lake swim verdict | "You can swim, checked by hand" with season | Alert slot | LakePage.jsx `lpage-swim` | keep, move into the key facts band |
| Hazards (lake, mountain) | "Before you get in", "Before you go" | Alert slot | `lpage-hazards` | merge (see Not for you if) |
| Map (route line, point) | The route or the place on a real map | Map slot, sticky on desktop | TrailPage.jsx, CyclePage.jsx, browse/PointMap.jsx | keep; shorter on phones |
| Map zoom control | Zoom in and out | Map, top right | maplibre NavigationControl | keep |
| Map attribution | CARTO, OSM | Map, bottom right | maplibre | keep |
| Compass rosette (beach) | Which way the sand faces | Over the beach map | Signature.jsx `CompassRosette` | keep, also feed the beach signature |
| Start pin, scrub pin, me dot | Trailhead, profile point, walker | Trail map | TrailPage.jsx | keep |
| Slope profile (trail) | Height along the way, shaded by steepness, scrubbable by drag and arrow keys | Signature slot | browse/RouteFigures.jsx `SlopeProfile` | keep; the model for the family |
| Surface and traffic instrument (cycle route) | Two bars on one km axis | Signature slot | CyclePage.jsx, RouteFigures.jsx `MixBar`, `TrafficBar` | keep, add the elevation profile above it |
| Elevation chart (cycle) | Climb along the route | Folded row "elev" | RouteFigures.jsx `ElevationChart` | move into the signature slot |
| Beach signature | Three empty tracks: sea, waves, crowds | Signature slot | Signature.jsx `BeachSignature` | rework: show what is measured |
| Lake signature | Water temperature by month, depth wedge | Signature slot | Signature.jsx `LakeSignature` | keep |
| Mountain signature | Altitude bar, "skyline, not computed yet", when to go | Signature slot | Signature.jsx `MountainSignature` | rework: drop the empty skyline row |
| Month strip info button | An "i" in a circle that opens the season reason | Mountain signature | components/MonthStrip.jsx `mstrip-info` | rework: carta-design bans the "i" in a circle; use the InfoDot |
| Folded rows (all pages, 5 to 10 each) | Icon, label, six-word summary, body one tap down | Rows slot | DetailSkeleton.jsx `DetailRow` | rework: group, cap, previews in mono where figures |
| Row: The measurements (trail, cycle, lake, mountain), What is there (beach) | The facts | Rows | each page | move: the decision facts go open into a key facts band |
| Row: Why this walk, beach, lake, mountain | The argument | Rows | each page | keep |
| Row: Views along the way (trail) | Photos shot on the route with km marker; tap shows credit | Rows | TrailPage.jsx `ViewStrip` | keep, rework as a photo track (V4) |
| Row: Photographs (beach, lake, mountain, cycle) | Thumbnails that swap the hero far above | Rows | `bpage-strip`, `role=tablist` with no tabpanel | rework: one photo track, honest roles |
| Row: Underfoot (trail) | Surface bar | Rows | RouteParts.jsx `SurfaceBar` | merge into the trail signature |
| Row: What you walk past (trail) | Highlights with km | Rows | TrailPage.jsx | keep |
| Row: What to expect (trail) | Story points and prose | Rows | TrailPage.jsx, lib/trailStory.js | keep |
| Row: Stages (trail, tour) | Stage list; on the trail page every stage button is disabled (`onOpenRoute={null}`) | Rows | RouteParts.jsx `Stages` | rework: open the stage or render as a list, never a dead button |
| Row: Bases along the route (trail) | Towns along the line, open the town | Rows | RouteParts.jsx `Bases` | move up: they are where you sleep |
| Row: Stops (city day) | Stops with dwell and leg times | Rows | TrailPage.jsx | keep |
| Row: Family (trail) | "Part of {name}" | Rows | TrailPage.jsx | rework: make it a link to the family |
| Row: Which way it faces (beach), Getting down to the sand (beach), Walking the shore (lake), How you get up (mountain) | Derived modules | Rows | browse/DerivedModules.jsx, lib/derivedModules.js | keep; drop "How you get up" where Getting there shows the same block |
| Row: How the score is built | Weighted parts as bars | Rows | each page | keep |
| Row: Tour facts, Checks, Why, Towns (cycle) | Tour summary, the checks it passed, why, services | Rows | CyclePage.jsx | keep, Towns moves up next to Bases |
| Directions to the start / Directions in your maps app | Opens Google Maps directions | Getting there | `tpage-act-wide`, `bpage-where` | keep, one look for both |
| Start coordinates (trail) | Lat, lon to five decimals in mono | Getting there | `tpage-start-coords` | move under the directions link, smaller |
| Stations on the route (cycle) | Up to four station names | Getting there | CyclePage.jsx | rework: name, distance |
| Way up block (mountain) | Lift, drive, walk, climb, with source | Getting there | MountainPage.jsx `WayUp` | keep, tint rule (part 7) |
| Price a trip to {base} (beach, lake, mountain) | Opens the base town's destination page | Getting there, accent fill | `bpage-base` | keep as the place pages' one primary; same slot on every page |
| See {city} prices (city day) | Opens the town | Getting there, accent | `tpage-cta` | keep |
| Download GPX / Send to a hiking app (trail) | GPX file or share sheet | Take it with you, accent fill, 12 px radius | `tpage-primary` | keep as the route pages' one primary; 6 px radius |
| Download GPX (cycle route) | GPX | Take it with you, bordered | `cycle-gpx` | rework: same as the trail's |
| (missing) GPX for a tour | None | | CyclePage.jsx | add: one file with a track per day |
| Google Maps file (trail) | KML | Take it with you | `tpage-act` | keep |
| Send the link | Share sheet or copy | Take it with you | `tpage-act` | merge with the bar's share icon |
| Follow on the map (trail) | Enters follow mode | Take it with you | `tpage-follow` | keep |
| Recentre, Stop following | Follow mode controls | HUD | TrailPage.jsx | keep |
| Report a problem | Inline form: what, text, email, send | Take it with you | components/ReportProblem.jsx | move to the sources fold |
| Add a photo or track (trail) | Upload dialog | Sources fold | community/UploadForm.jsx | keep |
| Three other places to try | Easier, cheaper, nearby | Exits | DetailSkeleton.jsx `DetailExits`, lib/detailSkeleton.js `placeExits` | keep |
| Nearby outdoors | Peaks, lakes, beaches, trails near this one | Exits | browse/NearbyOutdoors.jsx | keep |
| Where this comes from | Sources, licences, measured or calculated | Sources fold | browse/CreditFold.jsx, HonestFooters.jsx | keep |
| On Wikipedia, OSM, Wikidata links | Source links | Sources fold | each page | keep |
| Photo credit (hero) | Author and licence under the strip | Hero | `bpage-credit` | keep; fix the stray space before the comma on the beach credit |

### Visual settings

| Setting | Value today | File | Verdict |
|---|---|---|---|
| Hero height | 56vh, min 240 px | 28-detail-skeleton.css | rework: shorter on phones |
| Strip | Paper band, three cells, 12 px 600 sans, squares in ink | 28-detail-skeleton.css, 25-feature-pages.css `.jstrip` | keep; the third cell in mono |
| Title | Fraunces 27 px (beach, lake, mountain), 21 px (trail) | 23-places-pages.css | rework: one size |
| Hook | 19 px `--ink-soft` | 28-detail-skeleton.css | rework: smaller than the title step, larger than body |
| Section heads | Fraunces 16 px 600 | 28-detail-skeleton.css | keep, check the scale against the hook |
| Map height | 44vh (240 to 420 px) phone; full column, sticky, desktop | 28-detail-skeleton.css | rework phone height |
| Desktop grid | 60/40 from 900 px, map sticky | 28-detail-skeleton.css | keep |
| Signature panel | `--paper-dim`, 6 px radius, ink ramp fills, mono figures | 29-signature.css | keep |
| Row list | 13 px label, 12.5 px `--ink-mute` summary, one line with ellipsis | 25-feature-pages.css `.jpage-lrow` | rework |
| Swim verdict, way up | Container tinted green | 23-places-pages.css | rework (part 7) |
| Hazards | Amber tint, amber text | 23-places-pages.css | keep, check against ochre rating beside it |
| Primary buttons | 48 px, 12 px radius (GPX), 10 px radius (Price a trip) | 23-places-pages.css | rework: 6 px radius per DESIGN.md |

## 4. Critique and audit

Method: dual assessment as `reference/critique.md` asks. Assessment A (design review) ran as an isolated sub-agent over the code and the screenshots and finished before the detector output was read. Assessment B is the bundled detector plus the browser walk above. The overlay injection was skipped: the shared server took minutes per page load and the session was told to keep at most one browser open, so the CLI scan and the walk's DOM measurements are the deterministic signal.

### Design health (Nielsen, 0 to 4)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | The map is a blank paper box at 44vh while it loads; the cycle page shows a bare "…" |
| 2 | Match with the real world | 3 | Plain words ("If this is too hard", "How you get up"); but Getting there for a hike is coordinates to five decimals |
| 3 | User control and freedom | 3 | Back, Escape, independent rows, a way out of follow mode; no way to jump to a section |
| 4 | Consistency and standards | 2 | GPX is an accent primary on trails and a bordered button on cycle routes, absent on tours; the elevation profile is the signature on trails and a folded row on rides; the score breakdown has two doors on beaches and one elsewhere; title 21 px on trails, 27 px elsewhere |
| 5 | Error prevention | 3 | Hazards and the swim verdict never fold; Not for you always has a line |
| 6 | Recognition rather than recall | 2 | Time, ascent, water class, lifeguard, the way in sit behind taps; one-line previews cut mid-word ("Five measured parts, weig…") |
| 7 | Flexibility and efficiency | 2 | No section rail although every page has three or more sections; the take-away actions sit two to three screens down |
| 8 | Aesthetic and minimalist design | 2 | Duplicates (Not for you and hazards say the same thing on the mountain; way up twice; beach score twice; hook equals the first row's preview); the beach signature is three empty tracks on every beach |
| 9 | Error recovery | 3 | Location errors are specific; a gone route says so and offers the way back |
| 10 | Help and documentation | 3 | InfoDot on mountain facts, signature notes, score breakdown, sources fold |
| | Total | 25 of 40 | Acceptable, at the edge of Good |

### Design specificity

The honesty system is authored for Carta and nobody else: Not for you lines generated from data, the three computed ways out ("If you want to spend less a night"), "Not measured yet" said out loud, the measured or calculated footers, tilde marks on derived grades. The page shape around them is generic: a tall photo, a title, an accordion, "Getting there". And the one thing Carta exists to show, a price, is missing: no outdoor page says what a day or a weekend there costs, although the base town's receipt already exists one tap away.

### Priority issues

[P0] A shared tour link crashes the app. `#tour=<slug>` ends on the app's error screen (`RangeError: invalid_argument` from `Intl.DisplayNames.of` in `src/browse/DestinationsTab.jsx`). Fix before V3 builds on the tour page: guard `countryName` against a code that is not a region and open the tour without a country. Command: harden. Register row T375-a.

[P1] Claims on one page contradict each other. The cycle route says "Gravel bike" in the strip, "Not for you on a road bike" in Not for you, and "A road bike is fine" in the signature note (EuroVelo 6, Austria leg 3). The mountain says "Alpine route" in the strip and the hazards, and "Cable car to the top" in How you get up, with nothing that says the lift reaches a station and not the summit (Hoher Dachstein). A trail named from Gosau to Hallstatt carries a "Loop" chip. For a product whose only asset is trust in its claims, one screen that says two things is worse than a missing fact. Fix: the strip's type and the Not for you bike rule read the same field as the surface sentence (`src/lib/notFor.js`, `src/lib/cycleStory.js`, `src/lib/detailSkeleton.js`); the mountain names both ways (lift to the station, then the route to the summit) in one way-up block; the loop flag goes to the data lane. Command: clarify. Register rows T375-b and T375-c.

[P1] The information order does not follow the decision. Grade, kind and length are in the first screen; everything else a traveller decides on is folded or far down. Evidence: the slot table in part 2 (Getting there at 1904 to 2273 px, take-away at 2031 to 2608 px on an 800 px screen); trail time and ascent in a closed row (`src/browse/TrailPage.jsx`, row `facts`); the beach's EU bathing water class in the closed "What is there" row (`src/browse/BeachPage.jsx`, facts `water`). Fix: a key facts band open under the head, the two hand-offs (get there, take it) moved above the folded rows, the hero shorter on phones. Command: layout, then distill.

[P1] Getting there does not answer the hiker's barrier. The research's first ask for these pages is the nearest stop, the line and how often it runs (Wandermonitor 2024 in the research note). The trail page shows coordinates and a road distance to a town; the cycle page lists up to four station names with no distance. The wire has no stop or frequency field today, so the build waves say so in the block's own voice and a register row asks the data lane for the field. Command: clarify.

[P1] Duplicates and an empty signature spend the strongest slots on nothing. The mountain's Not for you lines (glacier, exposure) are followed at once by the hazard box with the same claims; "How you get up" is a row and again the block in Getting there; the beach score has two doors; the hook is the first row's preview. The beach signature is three "Not measured yet" tracks for every beach (`src/browse/Signature.jsx` `BeachSignature`), and the mountain signature carries a "Not computed yet" skyline row. Fix: one Before you go block, one way up, one score door, and a beach signature built from what is measured (bathing water class with its season and site, the facing rose, the way in) with the missing rows named once in the sources. Command: distill.

[P2] One primary per view, in a different place on each page. The trail's primary is GPX in slot 8 (accent fill, 12 px radius); the beach, lake and mountain's is "Price a trip to {base}" in Getting there (accent fill, 10 px radius); the cycle route has none; the first accent on the trail page is the "Loop" chip, a descriptor. Fix: routes (trail, cycle route, tour) lead with the file; places (beach, lake, mountain) lead with the priced trip to the base; both sit in one hand-off band in the same position on every page; 6 px radius; Loop and highlight chips in ink. Command: polish, with clarify for the labels.

[P2] The row list is inert and its previews read as broken. Up to ten identical rows on a trail; one-line previews cut mid-word at 380 px; figures in the previews set in the sans. Fix: group rows into at most five, previews end on whole words and wrap to two lines, figures in previews in mono, and a sticky section rail (carta-design already allows one per page with three or more sections). Command: layout.

[P2] Data the wire carries is not on the page. The trails wire marks 11,046 of 17,619 published trips as waymarked (`f.way`) and 17,404 with a season (`f.se`), counted in `public/trails/*.json` on 2026-10-08; the trail page shows neither as a fact (the waymark ref reaches only the folded "What to expect" prose through `src/lib/trailStory.js`). Fix: waymarked and season as facts in the key facts band. Command: clarify.

[P3] Small things. The mountain hook can be close to a tautology ("Hoher Dachstein is a massif in Dachstein Mountains"); the strip's difficulty word wraps to two lines on the mountain ("Alpine route, from the terrain"); lake area reads "46.2 km2" rather than km²; the derived grade's "~" is explained only by a `title`, which touch cannot reach; the month strip's struck-out avoid months are hard to read; stage buttons on the trail page are rendered disabled because the page passes `onOpenRoute={null}`; the beach photo strip is a `tablist` with no tab panel.

### Persona red flags

First-time hiker on a phone: sees "Not for you if a climb of 985 m sounds like a long day" before the walking time; cannot find out whether a bus reaches the start; "Send to a hiking app" assumes an app; the back button opens with a focus ring.

Returning cyclist on a laptop: the 60/40 grid with a sticky map works; the elevation profile they came for is a folded row; the route's GPX is a quiet bordered button at the bottom; a three-day tour has no GPX at all; the difficulty on the strip is derived from climb per km and only a "~" says so.

Family looking for a beach: "Not graded" is the first word in the strip; water quality, lifeguard and the way down are inside one closed row; the signature promises sea temperature, waves and crowds and shows none.

### Technical audit (reference/audit.md)

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Real buttons and links, focus trap with Escape, one h1, scrubbable profile with arrow keys. Gaps: photo strips use `role=tab` with no tab panel; disabled stage buttons on the trail page; "~" explained only by `title`; the month strip's "i" icon button |
| 2 | Performance | 3 | maplibre loads lazily per page; the layer pages use `LayerPhoto` with `srcset`; the trail hero is a raw Commons URL without `srcset`; the map box is empty with no loading word |
| 3 | Responsive | 3 | 0 px horizontal overflow at 380 on all five measured pages; 60/40 sticky grid from 900 px; the 56vh hero plus 44vh map push decisions to the third screen; take-away buttons wrap to two rows |
| 4 | Theming | 3 | Tokens throughout; open items T363-b (token fallbacks in CyclePage and TrailPage); container tints in green (swim verdict, way up) where DESIGN.md names `--good-vivid` an indicator colour |
| 5 | Implementation integrity | 3 | Detector clean; one skeleton for six page types; but the surface's rules are spread over five shared stylesheets (23, 25, 26, 28, 29), `compassPoint` exists twice (`src/lib/signature.js` and `src/lib/derivedModules.js`), and the cycle family page does not use the skeleton |
| | Total | 15 of 20 | Good |

Detector: `impeccable detect --json` over the fifteen surface files (`src/browse/DetailSkeleton.jsx`, `TrailPage.jsx`, `CyclePage.jsx`, `BeachPage.jsx`, `LakePage.jsx`, `MountainPage.jsx`, `Signature.jsx`, `DerivedModules.jsx`, `RouteFigures.jsx`, `RouteParts.jsx`, `BathingWater.jsx`, `PointMap.jsx`, `src/components/WaterQualityBadge.jsx`, `LayerPhoto.jsx`, `KindGlyph.jsx`) returned 0 findings, and 0 over the three surface stylesheets. The baseline for the build waves is therefore 0.

Ownership note: `src/browse/BathingWater.jsx`, `src/components/WaterQualityBadge.jsx` and `src/components/KindGlyph.jsx` are listed for this surface but are not drawn on any outdoor page today; they render on the destination page, the country page and Explore. The beach page shows its water class through its own facts row. V3 decides whether the beach page adopts `WaterQualityBadge` (one look for one fact across the product), and OWNERSHIP.md must say which surface edits these three files.

Harnesses for this surface (in the app repo's `scripts/`): verify_trail_page, verify_beaches, verify_lakes, verify_mountains, verify_cycling, verify_route_page, verify_trail_free_gpx, verify_trails. V1 could not run them: the shared dev server took up to 288 s per page load during this wave, so their baseline is the first step of V3 (register row T375-e).

## 5. The traveller's job here

Who arrives: mostly from a card on the Destinations tab, from Explore's map, from a nearby block on another outdoor page, or from a share link a friend sent (so cold, on a phone). PRODUCT.md speaks to the hiker first, then families at the beach, then cyclists.

What they need first: is this for me and can I do it. Grade in words, length, time, climb (a ride: km, climb, bike type, surface; a beach: water quality, the way in, lifeguard; a lake: can I swim and when; a summit: how I get up and what it asks of me). The research: nearly two thirds of German hikers prefer 5 to 15 km and value signposting; 74% of travellers weigh weather risk (Booking.com 2026); value for money is the first reason Europeans give for a destination (Booking.com 2024).

Second: can I get there, and where do I sleep. The nearest stop and how often it runs (Wandermonitor 2024: a third reject public transport for poor connections, one hour between connections is the acceptable maximum), the start point, the base town with its price per night, and on routes the towns with a bed along the line.

Third: take it with me. GPX one tap away, a link for a friend, the day planner, the season. AllTrails reviewers complain the elevation graph eats the screen, so the profile folds on a phone but leads on a laptop.

What is missing today: public transport to the start; any cost on the page (a day near this walk, the base's bed per night is only in the "cheaper" exit line); waymarking and season as facts; a GPX for tours; a beach figure built from what Carta measures.

What sits in the wrong place: Not for you before the facts; the hand-offs below the rows; "Add to a day plan" above the hook; Report a problem in the take-away band; the elevation profile of a ride inside a folded row; the bases along a route at the bottom of seven rows.

What sends them away: no stop information sends them to a journey planner; no cost sends them to a booking site; the beach's missing month figures send them to a weather site, and that is honest until Carta measures them, so the page should say where the figure is not (one line in the sources), not draw three empty tracks.

## 6. Plan (impeccable shape)

The shape brief, compact form:

- Job and audience: a hiker, a family or a cyclist deciding whether one outdoor place fits and then getting to it or taking it away; on a phone first, on a laptop for comparing.
- Outcome and proof: within the first screen and a half on a phone, the traveller knows grade, length or size, time and climb or the way in, the season, and how to reach it; the one primary hand-off is in the same place on all six page types. Proof is measured figures with their pedigree, never adjectives.
- Direction: Carta's instrument voice inside the existing skeleton. The structural thesis is decision first, then hand-off, then depth: head, key facts band, before you go, hand-off band, map and signature, grouped rows, exits, sources. The focal moment is the signature figure, one instrument per section, all in the ink ramp.
- Scope and boundaries: the six page types and the shared skeleton; the destination page, the journey page (which shares `.jstrip`, `.jpage-lrow` and `.jpage-exit`) and Explore are out of scope and must not change look as a side effect. No new token, no new colour, no gradient, no second accent.
- States and ranges: titles from 5 to 70 characters ("BergeSeen Trail 15: Gosau-Hintertal - Hallstatt"); 0 to 10 rows; 0 to 6 photos; a route of 1 to 300 km; pages with no photo, no map point, no grade, no base town; six languages, German and Dutch the longest.
- Interaction and layout: one DOM order for both widths (T190's keyboard rule); desktop keeps the 60/40 grid with the sticky map; motion only for state, under 300 ms, transform and opacity, with a reduced-motion branch.
- Constraints: carta-design wins; every new string in six catalogues; harnesses updated with a comment, never deleted; part 7's rules accepted by T380 before anything that needs them is built.

### V3: structure, information and flow

0. First, before any change: run the eight surface harnesses and take the 1280 px before shots from the V1 merge commit (row T375-e); fix the tour share link crash (row T375-a) and make the cycle route's three bike claims read one field (row T375-b). Files: `src/browse/DestinationsTab.jsx` (the `countryName` guard only, shared file: check OWNERSHIP.md), `src/lib/notFor.js`, `src/lib/cycleStory.js`, `src/browse/CyclePage.jsx`. Command: harden, clarify. Done when: `#tour=de-usedom-rundweg-relaxed` opens the tour page, and EuroVelo 6 Austria leg 3 says one thing about road bikes.
1. Reorder the skeleton to decision, hand-off, depth. New slot order: hero, head, key facts band (new), before you go (Not for you merged with the alert), hand-off band (Getting there and Take it with you side by side on desktop, stacked on a phone), map, signature, rows, exits, sources. Files: `src/browse/DetailSkeleton.jsx`, `src/styles/65-v6-outdoor.css`; the old slot comment block rewritten. Command: layout. Done when: on all six pages at 380 x 800 the key facts band starts above 800 px and the hand-off band above 1400 px (the T375 walk measured 1904 to 2273 px for Getting there), verify_trail_page, verify_beaches, verify_lakes, verify_mountains and verify_cycling pass, and the DOM order still equals the visual order.
2. Key facts band. Four to six facts per section, open, label over value, values in mono with units: trail (time, ascent, descent, high point, waymarked, season), cycle route (km, climb, bike type, paved share), tour (days, km, climb, bike type), beach (bathing water class with year and site, the way in, lifeguard, length), lake (swim verdict and season, area, depth, water temperature at peak), mountain (height, prominence, the way up in one word, season). The facts row each page has today becomes the band's "all measurements" row, or goes. Files: `src/browse/TrailPage.jsx`, `CyclePage.jsx`, `BeachPage.jsx`, `LakePage.jsx`, `MountainPage.jsx`, new `src/browse/KeyFacts.jsx`, `src/lib/detailSkeleton.js` (a `keyFacts` builder per section, tested), `src/styles/65-v6-outdoor.css`. Command: distill, then clarify. Done when: every fact carries its measured or calculated mark through the existing footer kinds, a missing value shows a placeholder word as the strip does, and a unit test covers the builder.
3. One hand-off band, one primary per page. Routes: the file (GPX, "Send to a hiking app" where the share sheet takes files) is the primary; places: "Price a trip to {base}" is the primary. Secondaries in a fixed order: directions to the start, Google Maps file (routes), add to a day plan, send the link. Follow on the map stays a secondary on trails. "Add to a day plan" leaves the head. "Report a problem" moves into the sources fold. The bar's share icon stays; the band's "Send the link" goes when the bar shows the icon (one share door). Files: the five pages, `src/browse/DetailSkeleton.jsx`, `src/components/ReportProblem.jsx` (placement only), `src/styles/65-v6-outdoor.css`. Command: clarify, polish. Done when: one accent-filled control per page counted by the harnesses, the same slot on all six pages, verify_trail_free_gpx passes.
4. GPX for cycle routes as the trail's, and a tour GPX. The cycle route also gets its exits and nearby block when opened from a share link (today both slots are absent because the page has no wire row without the list; load the country's rows as the trail page does). The cycle route's file button takes the trail's primary look; a tour downloads one GPX with one track per day, credited as the route GPX is (ODbL travels with the file). Files: `src/browse/CyclePage.jsx`, `src/lib/trailExport.js` (a tour writer beside `trailGpx`). Command: harden. Done when: verify_cycling checks the tour file's track count equals the tour's days.
5. Getting there as a small timetable. Start point, nearest town with its road distance, stations on the route with their km along the line, and where the wire has no stop data one sentence that says so. The coordinates move under the directions link in a smaller mono line. Files: `src/browse/TrailPage.jsx`, `CyclePage.jsx`, the three place pages, `src/styles/65-v6-outdoor.css`. Command: clarify. Done when: every page's Getting there names a town or a stop before any coordinate, in all six languages.
6. Before you go: one block. Not for you lines and the hazards render as one block with one heading, the safety lines first; the lake swim verdict moves up into the key facts band and stays unfolded. A line that the hazard list already says is dropped from the Not for you list (lib/notFor.js gets a de-duplication against hazard codes). Files: `src/components/NotFor.jsx`, `src/lib/notFor.js`, `src/browse/LakePage.jsx`, `MountainPage.jsx`, `src/browse/DetailSkeleton.jsx`. Command: distill. Done when: on Hoher Dachstein glacier and exposure each appear once; verify_mountains and verify_lakes pass.
7. Remove the duplicates. The beach's score chip button and "See how this score is made up" go (the score row is the one door); the mountain's "How you get up" row goes where the way up block sits in Getting there; the hook is never the first row's preview (if equal, the row's summary falls back to its second line). Files: `src/browse/BeachPage.jsx`, `MountainPage.jsx`, `src/lib/detailSkeleton.js`. Command: distill. Done when: harness checks that encode the old door are updated with a comment.
8. Rows grouped and capped. At most five groups per page: About this place (why, what you walk past, what to expect, facing, shore), The route (stages, bases or towns, stops, family) on routes, Photographs, How the score is built, All measurements. Previews end on whole words. Stage buttons either open the stage (trail family has ids) or render as a plain list; no disabled button ships. Files: the five pages, `src/browse/RouteParts.jsx`, `src/lib/detailSkeleton.js` `previewWords`. Command: layout. Done when: no page has more than five rows and no row preview ends mid-word at 380 px in English and German.
9. The signature per section shows what Carta measures. Trail: slope profile with the surface bar folded into it as a second track. Cycle route: elevation profile on top, surface and traffic bars under it on one km axis. Tour: the same per day, or the tour profile with day breaks. Beach: bathing water class (with year and site), the facing rose and the way in as tracks; the three unmeasured rows leave the panel and become one line in the sources. Lake: unchanged. Mountain: altitude bar and season; the skyline row leaves until it is computed. Files: `src/browse/Signature.jsx`, `src/browse/RouteFigures.jsx`, the pages, `src/lib/signature.js`. Command: clarify. Done when: no signature panel draws an empty track; verify_beaches' signature checks updated with a comment.
10. Waymarked and season as facts. Read `f.way` and `f.se` from the trails wire into the key facts band; a season marked estimated carries "est.". Files: `src/browse/TrailPage.jsx`, `src/lib/trailCards.js` (an accessor beside `tripGrade`). Command: clarify. Done when: Trail 20050 shows "Waymarked" and its season, and a trail without `f.way` shows no waymark claim.
11. A cost line on the page (needs rule N3). Beside "Price a trip to {base}", one line in mono: a night in the base and a day's food there, per person, from the same receipt the destination page uses, with its provenance mark. Routes show the same for the nearest base. Files: the five pages, `src/lib/` (the receipt reader the destination page uses; V3 names it after reading OWNERSHIP.md), `src/styles/65-v6-outdoor.css`. Command: clarify. Done when: the figure equals the destination receipt's figure for the same lifestyle, checked by a harness.
12. One back label rule and the cycle family page in the skeleton's vocabulary. Back reads the section name on every page ("Trails", "Cycle routes", "Beaches", "Lakes", "Mountains"); a page opened from a share link with no list behind it says the same. Files: `src/browse/TrailPage.jsx`, `CyclePage.jsx`, i18n. Command: clarify. Done when: all six pages use one label pattern.

### V4: visual and dynamic (inside the palette)

1. The hero. Shorter on phones (about 40vh, a V4 measurement decides), the strip unchanged, the photo credit kept. The card-to-page shared element transition (T185) stays the only entrance motion. Files: `src/styles/65-v6-outdoor.css`. Command: layout. Done when: the hook is above 560 px on a 380 x 800 phone.
2. Map loading said in words and drawn in shape. While maplibre and the tiles load, the paper box shows the route's line or point as a static SVG from the card's simplified geometry, in ink, with the place name; the live map replaces it with an opacity cross-fade under 200 ms. Files: `src/browse/DetailSkeleton.jsx` `PlaceMap`, `src/browse/TrailPage.jsx`, `CyclePage.jsx`. Command: animate. Done when: no blank box is ever visible longer than one frame after the card had geometry; reduced motion swaps without the fade.
3. Profile and map talk both ways. The trail's scrub already moves a pin on the map; V4 adds the same to the cycle profile, and a tap on the map line moves the profile's marker. The marker is the one accent on the figure. Files: `src/browse/RouteFigures.jsx`, `CyclePage.jsx`, `TrailPage.jsx`. Command: animate. Done when: keyboard arrows move the marker on both pages and the map pin follows.
4. A photo track instead of tab thumbnails. One horizontal track, scroll-snap, km markers on trail photos, credit on each frame, Previous and Next buttons, honest roles (a list of buttons, the hero swap announced), following the day-track pattern carta-design already defines. Files: `src/browse/TrailPage.jsx` `ViewStrip`, the place pages, new `src/browse/PhotoTrack.jsx`, `src/styles/65-v6-outdoor.css`. Command: delight, adapt. Done when: no `role=tab` without a tab panel remains; verify_beaches' photo check updated with a comment.
5. The key facts band as an instrument. Facts set like a timetable row: label over value, values in mono on one baseline, hairlines between, the measured or calculated mark as a small word, never a colour alone. The difficulty squares repeat from the strip only if the strip scrolled away (no). Files: `src/browse/KeyFacts.jsx`, `src/styles/65-v6-outdoor.css`. Command: typeset. Done when: the band reads as one row of figures at 380 and 1280 and passes the mono rule check.
6. Row micro-interactions. The chevron turns (transform only, 160 ms), the body opens with an opacity fade, the preview stays visible while open on desktop; the touch feedback from T184 applies. Files: `src/styles/65-v6-outdoor.css` (scoped to `.dsk-page` so the journey page keeps its look). Command: animate. Done when: reduced motion shows no transition and the journey page is pixel-identical before and after.
7. Typography scale. One title size for all six pages, the hook a step under the title and over the body, section heads a step over the hook so the hierarchy no longer inverts (16 px heads under a 19 px hook today). Files: `src/styles/65-v6-outdoor.css`. Command: typeset. Done when: the six titles measure the same computed size and the heads outrank the hook.
8. Sticky section rail (carta-design rule exists). Sections: Facts, Getting there, Map, Details, Nearby. Appears once the hero has scrolled away. Files: `src/browse/DetailSkeleton.jsx`, reuse `src/browse/SectionRail.jsx`. Command: layout. Done when: each link is a real `<a>` to the section anchor and keyboard order is unchanged.
9. Loop and highlight chips in ink. Descriptors become ink outline chips; the accent stays on the primary, the live route line, the profile marker and focus. Files: `src/styles/65-v6-outdoor.css` (override of `.tpage-loop`, `.tpage-chip-hl` scoped to the detail page). Command: quieter. Done when: the accent count on a trail page at rest is the route line, the primary and nothing else.
10. Container tints (needs rule N6). The swim verdict and the way up block lose the green container tint and carry a status dot plus the words; hazards keep the amber note tint DESIGN.md names for warnings. Files: `src/styles/65-v6-outdoor.css`. Command: colorize (to remove). Done when: green appears only as indicator dots and data text on the six pages.

### V5: harden, adapt and polish

1. Edge cases: a page with no photo (the strip with a top border, no gap), no map point (map slot and rail link gone), no grade (placeholder word), no base town (the place primary falls back to directions as the one primary), a 70-character title in German at 380 px, zero rows. Files: the five pages, `src/browse/DetailSkeleton.jsx`. Command: harden. Done when: a harness fixture per case renders without overlap or empty headings.
2. Six languages. Every new string in en, de, es, fr, it and nl, written by the session, with one owner row for native review; the strip and the key facts band checked at 380 px in German and Dutch. Files: `src/i18n/*.js`. Command: harden. Done when: all six catalogues parse and no label truncates.
3. Accessibility pass. The derived "~" gets a visible word or an InfoDot instead of a `title`; the month strip's "i" button becomes the InfoDot; stage lists have no disabled buttons; the initial focus on Back shows no ring after a pointer open (focus the dialog, not the button, when opened by pointer); `aria-live` on the toast only. Files: `src/browse/TrailPage.jsx`, `src/components/MonthStrip.jsx` (shared: check OWNERSHIP.md), `src/browse/DetailSkeleton.jsx`, `src/hooks/useFocusTrap.js` (shared). Command: harden. Done when: scripts/verify_keyboard.mjs 20 of 20 and scripts/verify_quality_floor.mjs pass, and the surface harnesses pass.
4. Performance. The trail and cycle heroes get `srcset` through `LayerPhoto` or the same helper; the static map placeholder costs no extra request; maplibre stays a lazy chunk. Files: `src/browse/TrailPage.jsx`, `CyclePage.jsx`. Command: optimize. Done when: LCP on the trail page at 380 px is no worse than the V1 baseline measured on the same server.
5. Cleanup the build waves inherit: `compassPoint` once (keep `src/lib/derivedModules.js` or `src/lib/signature.js`, not both); the unused `.lpage-months` rules (T287-c); the KML `factLine` TrailPage no longer needs (T286-d); the token fallbacks in CyclePage and TrailPage (T363-b). Files: as named. Command: polish. Done when: the design lint shows 0 new violations and the detector stays at 0.
6. Desktop at 1280 and 1440: the hand-off band side by side, the sticky map full height, the rail under the top chrome. Command: adapt. Done when: the after screenshots pair with V1's at the same view names.
7. Final polish and the seven carta-design questions answered in the V5 report. Command: polish.

### Target state: every button and control

| Control | Pages | Target place | Look |
|---|---|---|---|
| Back (section name) | all | top bar left | secondary icon and word |
| Favourite star | all | top bar | icon button, `--tap` |
| Share | all | top bar | icon button, the only share door |
| Section rail links | all | under the top bar once the hero is gone | rail pills per carta-design |
| Rating chip | trail, cycle, beach, lake, mountain | head | ochre chip, not a button |
| Hidden gem | lake, mountain, where set | head | teal badge |
| Key facts band | all | under the head | open, mono values, no controls |
| InfoDot on a fact | where the glossary has the term | key facts band | InfoDot |
| Before you go | all | under the key facts | one block, no controls |
| Primary: Download GPX / Send to a hiking app | trail, cycle route, tour | hand-off band, first | accent fill, 6 px radius, `--tap` |
| Primary: Price a trip to {base} | beach, lake, mountain | hand-off band, first | accent fill, 6 px radius |
| See {city} prices | city day | hand-off band, first | accent fill |
| Directions to the start | all | hand-off band | secondary |
| Google Maps file | trail, cycle route | hand-off band | secondary |
| Follow on the map | trail | hand-off band | secondary |
| Add to a day plan | trail, beach, lake, mountain | hand-off band | secondary |
| Map zoom, attribution | all with a map | map | maplibre defaults |
| Profile scrub | trail, cycle route, tour | signature | drag and arrow keys, accent marker |
| Photo track, Previous, Next | where 2 or more photos | rows group Photographs | secondary buttons, position in mono |
| Row toggles (at most five) | all | rows | the DetailRow button |
| Stage, base, town links | trail, tour | rows group The route | plain links or buttons that open something, never disabled |
| Follow HUD: stop, recentre | trail in follow mode | map | as today |
| Exit links (three) | all | exits | as today |
| Nearby outdoor links | all | exits | as today |
| Where this comes from | all | sources | `<details>` |
| Source links (Wikipedia, OSM, Wikidata) | beach, lake, mountain | sources | links |
| Report a problem | all | sources | link opening the inline form |
| Add a photo or track | trail | sources | link opening the upload dialog |
| Removed: beach score chip button, "See how this score is made up", "Send the link" in the band, the mountain's "How you get up" row, disabled stage buttons, the month strip's "i" button | | | |

Counted from the inventory: the six pages lose four duplicate doors (beach score chip, beach score hint, band "Send the link", mountain way-up row) and the disabled stage buttons, and gain one key facts band, one tour GPX and one section rail.

## 7. Needs a rule

Each line is a proposal carta-design does not cover today, with the rule proposed. T380 accepts or rejects each before anything that needs it is built.

- N1 Key facts band: a detail page may carry one open band of four to six measured facts directly under its head, label over value in `--ui` 12 px `--ink-soft`, value in `--mono` with its unit, hairlines between, no card, no colour; a missing value shows the strip's placeholder word.
- N2 Hand-off band: every detail page has one band, directly after the key facts and Before you go, holding its one primary and at most four secondaries in a fixed order; the primary is the file on route pages and the priced trip to the base on place pages.
- N3 Cost line on an outdoor page: one line in `--mono` beside the place primary giving a night in the base and a day's food per person at the traveller's lifestyle, read from the destination receipt with its provenance mark (tilde and "est." where estimated); never a total, never a bookable claim.
- N4 Before you go: Not for you lines and hazard lines render as one block under one heading, safety lines first, never folded, never repeated in a row.
- N5 Signature honesty: a signature panel draws only measured tracks; an unmeasured row is named once in the sources fold, not drawn as an empty track (amends the T181 empty-track practice for the signature slot; empty tracks stay allowed inside a folded row).
- N6 Status containers: a container is never tinted green; a positive verdict (you can swim, a lift to the top) is a `--status-success` dot plus words on paper or `--bg-card`; the amber note tint stays for warnings.
- N7 Photo track: a run of two or more photographs on a detail page is one horizontal track with scroll-snap, Previous and Next secondaries and the position in mono, the day-track rule applied to photographs; each frame keeps its credit; no tab roles.
- N8 Map placeholder: while a map loads, its box shows the item's own line or point as a static ink drawing from geometry already on hand, then cross-fades to the live map under 200 ms; reduced motion swaps instantly.
- N9 Back label: the back control on a detail page names the list it returns to, in the same form on every section.
- N10 Rows cap: a detail page shows at most five folded rows; more content is grouped into those five.
- N11 Linked figure and map: a profile on a route page and the route on its map share one marker in `--accent`, moved by drag, tap or arrow keys on either; this is the only accent inside a signature figure.

## Files the build waves will touch

App repo (`src/...`): browse/DestinationsTab.jsx (the tour link guard only, V3 item 0), lib/cycleStory.js, browse/DetailSkeleton.jsx, browse/TrailPage.jsx, browse/CyclePage.jsx, browse/BeachPage.jsx, browse/LakePage.jsx, browse/MountainPage.jsx, browse/Signature.jsx, browse/DerivedModules.jsx, browse/RouteFigures.jsx, browse/RouteParts.jsx, browse/PointMap.jsx, browse/KeyFacts.jsx (new), browse/PhotoTrack.jsx (new), browse/SectionRail.jsx (reuse, shared), components/NotFor.jsx, components/ReportProblem.jsx (placement only), components/MonthStrip.jsx (shared), components/LayerPhoto.jsx, components/WaterQualityBadge.jsx (if the beach adopts it), lib/detailSkeleton.js, lib/signature.js, lib/derivedModules.js, lib/notFor.js, lib/trailCards.js, lib/trailExport.js, hooks/useFocusTrap.js (shared, V5 only), i18n/en.js, de.js, es.js, fr.js, it.js, nl.js, styles/65-v6-outdoor.css (created and imported by T380). The older rules in styles/23-places-pages.css, 25-feature-pages.css, 26-shortlist-extras.css, 28-detail-skeleton.css, 29-signature.css and 29-derived-modules.css are overridden from 65-v6-outdoor.css rather than edited, because 23, 25 and 26 are shared with the destination and journey pages; V5 removes rules only where OWNERSHIP.md gives this surface the file.

Harnesses (`scripts/`): verify_trail_page.mjs, verify_beaches.mjs, verify_lakes.mjs, verify_mountains.mjs, verify_cycling.mjs, verify_route_page.mjs, verify_trail_free_gpx.mjs, verify_trails.mjs, plus verify_keyboard.mjs and verify_quality_floor.mjs as the floor.

## Direction check (T380, V2)

What `docs/design-v6/DIRECTION.md` changes in this plan. All eleven rules N1 to N11 are accepted and together they are the house detail-page grammar (key facts band, before you go, hand-off band, five rows, signature honesty, back label, two columns from 1024 px), which the destination page and the trip page also read. N6 is merged with the account brief's success line into one "status, not green" rule. N7 is the house photo track, shared with the record in My trips. N8's static map drawing and N11's shared marker are in the map-sync rule. Motion in V4: the chevron and row fade take `--dur-1` and `--dur-2`, the map crossfade `--dur-3`, the scrub marker moves with `--ease-in-out`; the hero in V4-1 caps at 40 percent of the viewport height on a phone (imagery rule). OWNERSHIP.md gives this surface the six pages, `DetailSkeleton.jsx`, `PointMap.jsx`, `Signature.jsx`, `DerivedModules.jsx`, `RouteFigures.jsx`, `RouteParts.jsx`, `NearbyOutdoors.jsx`, `CreditFold.jsx`, `NotFor.jsx`, `LayerPhoto.jsx`, the trail, cycle, beach, lake and mountain libs, `28-detail-skeleton.css`, `29-signature.css` and `29-derived-modules.css`; `MonthStrip.jsx` (the InfoDot swap in V5-3), `useFocusTrap.js` and `KindGlyph.jsx` are shell's (hand-offs to T381), `WaterQualityBadge.jsx` and `BathingWater.jsx` are destination's (row T375-f closed by this assignment), and the `countryName` guard in V3-0 is a hand-off to T384 unless T386 runs first, in which case it writes the register row and T384 takes it.
