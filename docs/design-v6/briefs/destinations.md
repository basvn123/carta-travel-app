# Design brief: Destinations browse (key 'destinations')

Written by T373 in design wave V1, 2026-10-08. This is the brief that V3, V4 and V5 build the Destinations tab from. It plans and does not build: no app file changed in V1. T380 (V2) accepts or rejects every proposal in part 7 before anything in it is built, and OWNERSHIP.md (V2) is the authority on file ownership from V2 on.

App paths are written as `src/...` and are paths in the app repo. Evidence screenshots for the "before" state are in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\destinations\` (outside both repos, never committed); a figure in this brief names the screenshot or the file it came from.

Precedence for every item below: carta-design and DESIGN.md first, then impeccable's craft floor, then the research in `docs/design-v6/TRIP-PLANNING-RESEARCH.md`, then taste.

## 1. Setup and mode

Impeccable v4.3.1 (the project copy) ran `context --target src/browse/DestinationsTab.jsx` from the T373 root worktree. It loaded PRODUCT.md and DESIGN.md, found no surface brief (this file is the first), and reported no automatic detector hook, so the detector was run by hand (part 4). Its AUTONOMY_DIRECTIVE_CHECK was answered by the owner's standing instruction of 2026-10-07 to proceed without asking; no question tool or decision page was opened. Read for this brief: reference/critique.md, audit.md, shape.md and operate.md.

Mode: Operate. The traveller on this tab is doing a task, narrowing several thousand published outdoor places and trips to the two or three worth opening, and success is that they open the right one quickly and trust what the card told them. That is Operate by impeccable's own definition (the visitor completes a task in app UI). It is not Persuade: the landing page owns persuasion (T371). It is not Experience: photographs help the choice but the interface must not recede behind them, because the cards carry measured figures. The consequence for the build waves: scanability, one consistent component vocabulary with Explore, density where it serves comparison, and brand expressed in precise details (the mono figures, the honest ranking sentences, the coverage line), not in decoration. Choice recorded under refinement, not redesign: impeccable's "Refinement preserves" applies, so the palette, the three faces, the one card and the section opening's three bands stay; what changes is order, reach and weight.

## 2. The walk

Walked on the shared dev server (http://localhost:5199, the main checkout at app commit 3b3e5a8) at 380 x 800 and 1280 x 800 with Playwright, as the traveller in the research: someone with no destination yet (59 percent start that way, research section 1) who counts money first (3 in 5 name value first, section 2) and, for Carta's first audience, wants a town to walk from (PRODUCT.md).

Cold start (no stored state, `?tab=places`). The tab opens on Trips: ten style photo cards with a white Fraunces name over each photograph and a count ("26 trips"), then the door to composed itineraries. Nothing on the first screen asks where the traveller is from, when they go or what they can spend, and no figure on it is a price. The hiker, who PRODUCT.md says Carta speaks to first, must find Trails as the second tab, and Trails opens on a wall of about 43 country flag cards with an intro line ("Walks are ranked within each country, so this section opens on the countries"). Several countries have no cover photograph and show a two-letter monogram that reads like a wrong country code: "AU" beside Austria's flag, "BU" beside Bulgaria's (screenshot V1-walks-380; the letters are the first two of the name, `src/lib/heroImage.js:154`). At 380 px only four of the six category tabs fit; Mountains and Cycling are off the right edge with nothing saying so.

Picking a section. Beaches, Lakes, Mountains and Cycling each open on the section opening (spec 5.3, T183): a Fraunces heading with an honest ranking sentence ("Europe's 9 best-known beaches", "Ranked by how widely they are read about and photographed, at most two from any one country"), nine icon cards, six rails of up to twelve cards with "See all N", arrows and dots, then "Browse the full list" with the filters and a 36-card grid page. Measured in the walk: 9 icons, 6 rails and 36 grid cards in every one of the four sections; the scroll height at 380 px is 18,479 px (Beaches), 18,659 (Lakes), 18,744 (Mountains) and 19,593 (Cycling); visible buttons on the tab are 159 to 171 at 380 px and 141 to 167 at 1280 px. On the dev server the first Beaches load took 34 s at 380 and 48 s at 1280 (a cold Vite transform of a large module, not a production figure); Lakes, Mountains and Cycling took 6 to 15 s. While it loads the grid shows skeleton cards at their final size, which is right, but the opening bands have no skeleton.

The cards themselves. The grid card (PlaceCard) is good: a photograph, an ochre seal, the name in Fraunces, the place line, a one-line hook and exactly three labelled mono values ("168 m Length, 20 km To town, sand Surface"). The rail and icon cards are a different, thinner card: the name, the place and one unlabelled mono figure ("5,021 m", "145 km²"). No card on this tab, in any section, carries a cost (Assessment A checked PlaceCard.jsx, SectionOpening.jsx and cardFillings.js: the only per-day figure is km per day for cycle tours).

Search. Typing "Gent" offers Agrigento, Argentan, Monte Argentario, Nogent-le-Rotrou, L'Argentière-la-Bessée and Nogent-le-Roi, then "Search the map for Gent" (V1-search-380). The catalogue holds Ghent (as "Ghent", `public/app_data.json`); the local name does not find it, and a mid-word match outranks everything. "Search the map" for a village Carta does not price (Schoorl) works: Nominatim answers, the tab switches to near mode and heads the list "Within a day trip of Schoorl" with the place line and a Clear button. Once anything is typed on a phone, the opening folds away and every facet group of the section renders inline above the results: on Lakes that is nine groups and 30 or more chips before the first lake (V1-grid-380).

Filters. On a phone the Filters button is a terracotta 999 px pill; it opens a sheet with exactly the chips already shown inline, a Clear all and "Show 240 places". On a desktop the toolbar card is hidden (`src/styles/24-destination-workspace.css:4715`) and the left panel renders only the facet groups flagged for the toolbar (`src/browse/DestinationsTab.jsx:2655`), so desktop Beaches offers Water quality and nothing else: Underfoot, Setting, How wild, Size, Facilities, Naturist, Protected and Best for have no door on a desktop except a rail's "See all" (V1-grid-1280). The panel calls the categories "Filter categories" and the rest "Filter specifics".

A country. Picking Austria on Trails opens "The 9 highest-rated walks in Austria" with the walk name, a grade and a length; no start town, no transport, no day cost.

Empty and thin. Lakes plus "Monaco" gives the coverage module: "Monaco, 0 lakes published. Monaco has no lake over 5 hectares." and one button, "See Monaco's beaches" (V1-empty-1280). It is honest and gives the action. The coverage footer at the end of a long section is the opposite in tone: "We publish 1,662 lakes across Europe. Of the 1,436 regions we check, 1,410 are below what we aim for." It never says what the aim is, and it is the last thing on the page.

A region page. The deep link `#region=` is the only door into RegionPage in the app (App.jsx renders it from `pendingRegion`; no component in the tab links to a region). On the dev server the deep link did not open the page in this walk (both `#region=AT32` and the harness's own `#region=COAST:BE-BELGIAN-COAST`: the hash was stripped and no `.rgnp` rendered within 20 s). The harness result is in part 4.

Returning visit. The tab keeps no state between visits: `cat` starts as 'trips' (`src/browse/DestinationsTab.jsx:769`) and the country, the near place and every chip reset. A traveller who spent twenty minutes in Lakes in Slovenia comes back to the Trips style cards. The research says people keep tabs open "because as soon as something went out of sight, it was gone" (section 1, CMU); this tab makes that true.

## 3. Inventory

One row per view, state and control. Verdicts: keep, move, merge, remove, rework. "DT" is `src/browse/DestinationsTab.jsx`. Owner column: this brief unless named; rows owned by another surface are listed because a traveller meets them here.

| # | Element | What it does | Where it sits | Drawn by | Verdict |
|---|---|---|---|---|---|
| 1 | Tab shell and sr-only h1 | Holds the tab; the h1 "Destinations" is for assistive technology | Whole tab | DT 2847 | keep |
| 2 | Desktop left panel | Categories and refine controls beside the list | Left, 769 px and up | DT `.side-panel`, 24-destination-workspace.css | rework (labels, missing groups) |
| 3 | Panel label "Filter categories" | Heads the category cards | Panel top | DT, key `side.categories` | rework: categories are not a filter |
| 4 | Panel label "Filter specifics" and Reset | Heads sorts, country, facets; Reset clears them | Panel | DT `.side-clear` | rework label; keep Reset |
| 5 | Category tabs, phone (6) | Switch Trips, Trails, Beaches, Lakes, Mountains, Cycling | Toolbar card top, scrolls sideways | DT `renderCats('places-cat')` | rework: 2 of 6 off screen at 380 px; role="tab" without arrow keys |
| 6 | Category cards, desktop (6) | Same, as a 2 x 3 grid | Panel | DT `renderCats('side-cat')` | keep, rework ARIA |
| 7 | Red tick over each tab | Decoration above inactive tabs | Above tab icons | 23-places-pages.css | remove (carries nothing, reads as an alert) |
| 8 | Search field | Filters the catalogue and finds a place to search near | Phone toolbar; desktop column head | DT `searchField` | rework matching |
| 9 | Locate button (crosshair) | Asks the browser for the traveller's position, near mode | Inside the field | DT `.places-locate` | keep |
| 10 | Suggestion rows (catalogue towns) | Pick a town, near mode | Listbox under field | DT `.places-sugg-item` | rework: prefix and local names first |
| 11 | "Search the map for X" row | Geocodes through Nominatim on explicit action | Listbox end | DT `.places-sugg-any` | keep |
| 12 | Anywhere hits and "none" note | Geocoded places, or nothing found | Listbox | DT `.is-geo`, `.places-sugg-note` | keep |
| 13 | Location error line | A refused or failed fix, once | Under field | DT `.places-locate-err` | keep |
| 14 | Near header and Clear | Says the scope that answered ("Within a day trip of Schoorl") | Above list | DT `.places-nearhead` | keep |
| 15 | Band breaks in near mode | Divide rows by distance band | In list | DT `.places-bandhead`, lib/regions.js | keep |
| 16 | Sort buttons with arrow | Rating, distance, A to Z (trails, cycling); rating, price, A to Z (priced) | Toolbar right; panel | DT `renderSortButtons` | rework: active is --accent, must be --ink-fill |
| 17 | Filters button and badge | Opens the sheet; badge counts active chips | Toolbar right | DT `.places-filter-btn`, 23-places-pages.css:261 | rework: accent 999 px pill, hover fails contrast; becomes secondary |
| 18 | Country picker | One country or all | Toolbar; panel | CountryPicker (shell surface) | keep, move to 6 px radius |
| 19 | Lifestyle button | Opens the Lifestyle panel; priced categories only | Toolbar; panel | LifestyleButton (shell) | keep |
| 20 | Inline facet groups and chips with counts | Narrow the list | Phone: all groups inline; desktop: toolbar groups only | DT `renderFacetGroups` | rework: phone shows only the short set, desktop gains the rest |
| 21 | Filter sheet | Every facet group, Clear all, "Show N places" | Modal sheet | PlacesFilterSheet.jsx | keep; becomes the single home of the long set on both widths |
| 22 | Sheet grab, close, country dropdown | Dismiss; pick a country (when the tab passes one) | Sheet head, "Where" section | PlacesFilterSheet.jsx | keep |
| 23 | Sheet "no results" line | Says the chips left nothing | Sheet foot | PlacesFilterSheet.jsx | keep |
| 24 | Band 1 heading and ranking sentence | Says what the icons are and how they were ranked | Opening top | SectionOpening.jsx | keep (best copy on the tab) |
| 25 | Band 1 icon cards (9) | Open a place | Opening | SectionOpening `Card`, lib/openingScreen.js | rework: 6 not 9, respect the gutter, label the figure |
| 26 | Band 2 rails (6) with title | Saved cuts over the facet model | Opening | SectionOpening `Rail` | rework: 2 rails on a phone, the rest as cut chips |
| 27 | Rail "See all N" | Applies the cut to the grid | Rail head | SectionOpening | keep |
| 28 | Rail arrows (desktop) | Page the strip | Rail head | SectionOpening `.xrails-arrow` | keep |
| 29 | Rail dots | Where the strip is | Under strip | SectionOpening `.open-dots` | keep under the rail rule (part 7) |
| 30 | "Browse the full list" h2 | Heads Band 3 | Above grid | DT `.open-gridhead` | keep |
| 31 | Moved filter rail | The toolbar row on the grid while the opening shows | Above grid | DT `.places-filterrail` | keep |
| 32 | PlaceCard (5 fillings) | Photo, seal, strip, name, place, hook, 3 values, icons | Grid | PlaceCard.jsx, lib/cardFillings.js, 37-card-fillings.css | keep frame; add the cost line if part 7 accepts it |
| 33 | Card data strip (6 px) | Slope, paved share, swim months, altitude | Bottom of photo | CardStrip.jsx | keep; key it (part 7) |
| 34 | Card skeletons | Final-size placeholders | Grid while loading | PlaceCard.jsx | keep; extend to the opening bands |
| 35 | Infinite scroll sentinel | Loads the next 36 | Grid end | DT `.places-sentinel` | keep; add a visible count line |
| 36 | Country head line | "N beaches in X" | Above a country list | DT `.places-beachhead` | keep |
| 37 | Listed tier rows and "Listed" chip | Unranked places, never interleaved | After the ranked list | DT `.places-listedrows` | keep |
| 38 | Credits line | Sources and licences | Section end | DT `.places-credit` | keep |
| 39 | Coverage footer | Published count and regions below the aim | Section end | HonestFooters.jsx (destination surface) | rework copy: state the aim |
| 40 | Layer error and Retry | A layer file failed | In list | DT `LayerError` | keep |
| 41 | Chips-empty and its clear button | The chips emptied the list | In list | DT `chipsEmpty` | keep |
| 42 | Coverage empty (country and radius modes) | Count line, reason, three nearest, one button | In list | CoverageEmpty.jsx, 45-empty-states.css | keep |
| 43 | Plain "none match" line | Fallback empty | In list | DT `.places-empty` | merge into 41 or 42 |
| 44 | Trails country index (flag cards) | Pick a country before any walk | Trails at rest | DT `CountryCard`, `.places-ccard` | rework: no gradient scrim, no monogram, a mono count |
| 45 | Trails intro line | Says why the index comes first | Above index | DT | keep until a Europe-wide walk ranking exists |
| 46 | Trail filters (length, grade, climb, shape, highlights, suitability, loops only) | Narrow walks | Toolbar, sheet | DT, lib/trailCards.js | keep; add the transit filter when data exists |
| 47 | Trail card photo tiers | Own photo, nearest town's labelled photo, or the drawn path | Trail cards | DT `TrailMedia` | keep |
| 48 | Stub list, "show all" and StubPage | Known places not yet published | After trails | DT `.stub-list`, StubPage.jsx | keep |
| 49 | Cycling family chips | Jump to a route family (EuroVelo and so on) | Cycling list head | DT `.cycle-famchip` | keep |
| 50 | Cycling top note, tours, routes, listed headings | Section structure of cycling | Cycling list | DT | keep |
| 51 | "Show local routes" toggle | Reveals local network rows | Cycling list end | DT `.cycle-localtoggle` | keep |
| 52 | Trips: style cards (10) and composed door | Enter the trip library or the composed itineraries | Trips at rest | JourneysSection.jsx (trips surface) | rework by T376 brief: no gradient scrim |
| 53 | Trips: back to styles | Leave a style list | List head | JourneysSection (trips) | keep |
| 54 | Composed: length slider | Days, any to 14 | Facets row | DT `TripLengthSlider` | keep |
| 55 | Composed: pace and scale chips | Relaxed, balanced, packed; icons, hidden | Facets row | DT | keep |
| 56 | Composed itinerary cards | Open an itinerary, shared element transition | Grid | DT `ItinCard` | keep |
| 57 | City-day cards | One-day city walks with km and stops | Grid | DT `TripCard` | keep |
| 58 | Region page (back, kind, h1, share, lists, nearest regions, loading, error) | A region's published places | Full-screen overlay | RegionPage.jsx | rework: give it a door from the tab |
| 59 | Region share button and "copied" state | Copies the link | Region head | RegionPage.jsx | keep |
| 60 | CountryPage | A country as a destination (Explore's) | Over Explore | CountryPage.jsx, rendered by ExploreTab | move to Explore in OWNERSHIP.md; fix three middots |
| 61 | CategoryRail (trip-kind chips) | Kind filter on Explore | Explore only | CategoryRail.jsx | move to Explore in OWNERSHIP.md |
| 62 | FilterChips (active filter row) | Removable chips of active filters | Explore only | FilterChips.jsx | reuse here (part 6, V3-4); ownership to shell or Explore |
| 63 | Photo scrims | Gradient behind white text on country and style cards | Cards | 23-places-pages.css:621-639 | remove (gradient ban) |
| 64 | Placeholder radial gradient | Ground of a missing photo | Card media | 23-places-pages.css:581 | remove (gradient ban) |
| 65 | Card hover zoom and press feedback | Touch and pointer feedback | Cards | 37-card-fillings.css (reduced-motion branch at 341) | keep |
| 66 | "Get a pass" chip, bottom nav, plus button | App chrome | Top bar, bottom | shell surface | not this brief; the phone pass chip is accent-tinted against the T360 rule, raised for T370 |

Visual settings in force on the surface: page ground `--paper`; cards `--bg-card` with `--rule-soft`, radius 10 to 12 px; names in `--display`; values and counts in `--mono`; ratings ochre; gem teal; the accent on the Filters button, the active sort and the search focus ring; gradients in rows 63 and 64; radius 999 px on chips, the Filters button and the country picker. Stylesheets that draw the surface: 23-places-pages.css (3,729 lines), 30-section-opening.css, 37-card-fillings.css, 45-empty-states.css, and 67 `.places-`, `pcard`, `open-` and `cov-` rules inside 24-destination-workspace.css (the desktop layout), which belongs to the destination surface by the wave's file list. 44-tags.css, listed for this surface, styles the trip library's tag filter (`.tf-tags`), which is the trips surface.

## 4. Critique and technical audit

Method: dual-agent. Assessment A (design review, read-only, no detector output) and Assessment B (the impeccable detector and the design lint) ran as two isolated sub-agents; this section is the synthesis. No browser overlay was injected: the laptop is short on RAM and the rules allow one browser at a time, which the walk and the harnesses used, so the overlay step was skipped (fallback signal: the CLI detector).

Design specificity. Partly authored, mostly template. Carta's own material is there: Fraunces names over mono measures, the paper ground, ranking sentences that say how a list was ranked and admit the cap. The structure is the standard outdoor-catalogue page (an icon grid, carousels with "See all", arrows and dots, then a photo grid) and could carry another brand unchanged. The instrument is missing: the product that "shows the price and its pedigree" shows neither on the surface where the undecided traveller lands.

Heuristic scores (Assessment A, checked against the walk):

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Chip counts and "Show 240 places" are good; the opening bands have no loading state |
| 2 | Match with the real world | 2 | "Gent" does not find Ghent; "AU" and "BU" monograms; categories called "Filter categories" |
| 3 | User control and freedom | 3 | Clear and Reset exist; nothing restores the last visit |
| 4 | Consistency and standards | 2 | Filters is accent here and neutral on Explore; active sort is accent where the rule says ink-fill; phone and desktop offer different facet sets |
| 5 | Error prevention | 3 | Zero-count chips are hidden or disabled |
| 6 | Recognition rather than recall | 2 | Desktop facet groups have no door; Trails hides every walk behind a country |
| 7 | Flexibility and efficiency | 2 | No month, budget, compare or "from this town" route into the lists |
| 8 | Aesthetic and minimalist design | 1 | 18,479 to 19,593 px openings with 141 to 171 buttons; 30+ chips above results after a search |
| 9 | Error recovery | 3 | Coverage empty names the gap and offers the next action |
| 10 | Help and documentation | 2 | Ranking sentences explain order; the coverage footer never states its aim |
| | Total | 23/40 | Acceptable (57.5 percent) |

Cognitive load: six of eight checks fail (single focus, chunking, hierarchy, one thing at a time, minimal choices, progressive disclosure); grouping and working memory pass. Decision points over four options: six category tabs (four visible at 380 px), nine icons plus six rails, ten style cards, about 43 flag cards, 30+ inline chips, seven suggestions.

Emotional journey. The peak is real: a full-bleed Reynisfjara with an honest "best-known" claim. The valleys are the long first load, the Trails flag wall with monogram tiles, and typing a town to get a wall of chips. The end is the coverage footer saying 1,410 of 1,436 regions fall short. By the peak-end rule that last line is what the traveller remembers.

What works and must survive the build waves: the ranking sentences and the two-per-country cap (`src/lib/openingScreen.js` header); counts on every chip and the result count on the sheet's button; the coverage empty state that invites rather than apologises; the one card frame with exactly three labelled values; final-size skeletons; the near-mode scope ladder.

Priority issues.

[P1] The opening is a catalogue, not a decision. Nine icons, six rails of up to twelve and a 36-card page make 18,479 to 19,593 px at 380 px. A traveller with no destination needs one way in, not twelve, and the grid and the coverage line sit off the bottom of a very long page. Fix: six icons, two rails on a phone, the other cuts as chips. Command: distill.

[P1] Desktop facet groups have no door. `.places-toolbar { display: none; }` hides the Filters button and the side panel renders only toolbar groups, so eight of nine beach groups are unreachable on the width where comparison happens. Fix: a secondary "More filters" button in the panel opening the same sheet. Command: adapt.

[P1] No price on any browse card. Value for money is the first criterion (research section 2) and trust in figures is Carta's only asset (PRODUCT.md). Fix: one mono cost line per outdoor card, the day cost of the nearest priced town, through the provenance chain. This is new and waits for a rule (part 7, N1). Command: shape.

[P1] Gradients on the surface. Two linear-gradient scrims put white text over photographs on the country and style cards, and a radial gradient fills the missing-photo ground (`src/styles/23-places-pages.css:581`, `621`, `634`), all against "no gradients anywhere"; the scrim colour is an rgba literal, not a token. Fix: the caption moves under the photograph onto paper. Command: quieter.

[P2] Accent and control rules broken. The Filters button is an accent 999 px pill whose hover puts white on `--accent-soft` (about 2.6:1, Assessment A), the active sort is `--accent` (`src/styles/24-destination-workspace.css:4834`, `5050`) where an active toggle is `--ink-fill`, and inline chips are about 28 px high on a coarse pointer (padding 5 px, 12 px text, 23-places-pages.css:125-137). Command: polish.

[P2] Search matches substrings, not places. A mid-word match outranks a prefix, and local names (Gent, Gand) do not reach the English row (Ghent). Command: harden.

[P2] No memory. Every visit starts on Trips with nothing set. Command: harden (state), onboard (cold start).

Persona red flags. Jordan, first-timer: the main choice is labelled as a filter; a red tick sits over every inactive tab with no meaning; Trails asks for a country before showing a walk. Casey, phone: Mountains and Cycling are off screen; nearly 19,000 px of thumb travel; 28 px chips; the long first load. Sam, accessibility: white on `--accent-soft` on hover; carousels driven by arrows and dots; white Fraunces over bright photographs on the style cards; category buttons carry role="tab" with no arrow-key handling or tabpanel. The hiker choosing a town to walk from: the tab is organised by trail, not by base town; a walk card says "Hard 16.4 km" with no start town, no transport and no day cost; there is no "start reachable by public transport" filter for walks (Mountains has a "Reachable without a car" rail; trail suitability keys in `src/lib/trailCards.js:262-267` have no transit key); the bands split at 5, 10 and 20 km (`src/lib/trailCards.js:147-151`), so the 5 to 15 km that two thirds prefer (research section 2) is not one choice.

Minor observations: the icon cards' figure ("5,021 m") has no label while the grid card labels it; two Band 1 cycling icons are a warehouse and an information board (photo QA, Assessment A, cycling-1280); water-quality chip counts sum to 237 while the sheet says 240 (three rows with no water value, which the sheet should say).

Technical audit (reference/audit.md), from the harnesses and the lint rather than new tooling:

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 2 | Hover contrast on Filters; chips under `--tap`; tablist without keyboard model; text on photographs |
| 2 | Performance | 2 | An opening loads 9 + up to 72 rail + 36 grid images; first Beaches load 34 to 48 s on the dev server (not a production figure) |
| 3 | Responsive | 2 | Desktop loses facet groups; two category tabs off screen at 380 px; Band 1 bleeds past the 16 px gutter at 380 and past the column at 1280 |
| 4 | Theming | 3 | Tokens throughout except the three gradients and the rgba scrim literals |
| 5 | Implementation integrity | 2 | Detector clean, but desktop rules for this tab live in another surface's stylesheet and three middots ship in CountryPage |
| | Total | 11/20 | Acceptable |

Detector (Assessment B): `impeccable detect --json` over the twelve surface components (DestinationsTab, SectionOpening, PlaceCard, CardStrip, PlacesFilterSheet, CoverageEmpty, CountryPage, RegionPage, StubPage, CategoryRail, FilterChips, HonestFooters) exited 0 with no findings. It scans JSX, not the stylesheets, so it did not see the gradients above. Design lint (`node scripts/ci/design-lint.mjs`, read-only): 213 violations, all 213 in the baseline, 0 new; three of them are on this surface, rule `middot`, `src/browse/CountryPage.jsx:112-114`, all real.

Harnesses (run against the shared dev server, sequentially, screenshots to a scratch folder): the results are recorded in the T373 report, `Execution/P10/T373-v6-brief-destinations.md`, under Before/after measurements, because they finished after this brief was planned.

## 5. The traveller's job here

What they need first, second and third, in the research's order of need between places (section 2: can I afford it, is it good in my month, what is there for me, can I get there without a car):

First, a way in without a destination, with the cost of being there. The undecided majority (59 percent) arrive here, and value for money decides first. Today the first screen of every section is photographs and names. The first screen should be the section's best places with one measured cost each, labelled for where it came from, and the section's own leading need as a cut (water tested excellent, reachable without a car, a day's walk).

Second, whether it is good in their month. 74 percent weigh weather risk and 68 percent avoid crowds (section 2). The tab has one fixed-month rail ("Warm enough to swim in June") and no month input. The month belongs to the shell's inputs (it is a trip input, like origin and lifestyle); this tab should read it when it exists and say "good in July" as a measured fact, not ask for it again.

Third, what is there for them and how they reach it. For the hiker that is length (5 to 15 km), waymarking and a start reachable by public transport; for a family it is a lifeguard and step-free access, which already exist as facets. The transit fact exists for mountains only.

What is missing: any cost; the traveller's month; a transit filter for walks; a Europe-wide way into walks (the trails wire has no `top.json`, so the walk opening needs a country, `src/lib/openingScreen.js` header and DT 2489); a door to the region pages; memory of the last visit; a compare tray (the research puts it on Explore; this tab should hand candidates to it rather than build a second).

What sits in the wrong place: the long facet set inline on phones (it belongs in the sheet, as on Explore); the coverage footer as the page's last word (it belongs under the section heading as one honest line, the research's "honest coverage line under every listing"); the category labels inside the "Filter" vocabulary.

What sends the traveller away: to Explore, for any price; to another site (Komoot, AllTrails) for a start point by train and an elevation profile, which the trail page has but the card does not hint at; to a weather site for the month. Each is a reason the tab-overload research names for keeping tabs open.

## 6. Plan (impeccable shape)

Brief per reference/shape.md. Job and audience: an undecided budget traveller, hiker first, narrowing the published outdoor places and trips to a few to open; Operate. Outcome: the right place opened in under a minute, with its cost and its fit known before the tap. Direction: refinement inside Carta's world; the one card, the three bands and the coverage voice stay. Boundaries: no new token, no new colour, no gradient, no second Lifestyle control, nothing in part 7 built before T380 accepts it, Explore's compare and month controls stay Explore's. States: rest, loading (bands and grid), filtered, searched (catalogue and anywhere), near mode, country, empty by filter, empty by coverage, layer error, region page. Assumptions, stated because no human answered: the cold-start category stays Trips until the owner decides (row T373-c); the cost line waits for N1.

Every item names the change, the files, the impeccable command and the check. Files are app repo paths. `63-v6-destinations.css` is the v6 stylesheet T380 creates; new rules go there, and old rules are deleted from their file in the same commit.

### V3: structure, information and flow

1. Short facet set inline, long set in the sheet, on both widths. Phone renders only `toolbar` groups inline (the call DT already makes for the desktop panel); the desktop panel gains a secondary "More filters" button (with the active count) that opens PlacesFilterSheet with every group. Files: `src/browse/DestinationsTab.jsx` (`facetsRow`, side panel), `src/browse/PlacesFilterSheet.jsx`, `src/styles/63-v6-destinations.css`, six i18n catalogues. Command: distill, then adapt. Check: at 1280 every beach, lake, mountain and cycling facet group is reachable in two clicks; at 380 the first card after a search sits within the first 800 px; verify_places_tab and verify_places_search pass.
2. Active filters as a removable chip row above the grid, the same component Explore uses. Files: `src/browse/FilterChips.jsx` (reused, not forked), DT, 63-v6-destinations.css. Command: clarify. Check: every on chip, the country and the near place show as one removable chip; "Clear all" resets to the opening. Needs N6.
3. Six category choices visible at 380 px. Two rows of three on a phone, the same 2 x 3 the desktop panel uses; the red tick above each tab removed; buttons become `aria-pressed` toggles or a full tablist with arrow keys and tabpanel, one or the other. Files: DT `renderCats`, 23-places-pages.css (old rules out), 63-v6-destinations.css. Command: layout. Check: no category off screen at 360 px; keyboard reaches every category; verify_places_tab "every category tab renders" still passes. Needs N9 for the phone grid.
4. Panel and toolbar words. "Filter categories" becomes a plain section name and "Filter specifics" a plain refine label, as keys of this tab rather than the shared `side.*` keys if Explore keeps its own. Files: DT, six i18n catalogues. Command: clarify. Check: no label on the tab uses the word "filter" for the categories.
5. A shorter opening. Band 1 shows six icons (ICON_MIN already exists). Band 2 shows two rails on a phone, picked by the section's leading need (beach: water tested excellent; lake: swim season; mountain: reachable without a car; cycling: mostly away from traffic; trail: a day's walk); the other four cuts become one row of cut chips that call the same `applyRail`. Desktop keeps the rails. Files: `src/lib/openingScreen.js` (pick order, phone count), `src/browse/SectionOpening.jsx`, DT, 30-section-opening.css, 63-v6-destinations.css, `tests/openingScreen.test.mjs`. Command: distill. Check: opening scroll height at 380 px under 8,000 px (from 18,479 to 19,593); visible buttons under 90 (from 159 to 171); "See all N" counts still equal the grid counts. Needs N4.
6. The honest coverage line moves up. One line under the section heading, in the count-line form CoverageEmpty already uses (place in sans, count in mono), stating the aim ("Carta aims for N per region") with the figure from `coverage.json`; the footer at the end keeps only the credits. Files: `src/browse/HonestFooters.jsx` (destination surface, so through OWNERSHIP.md), DT, six catalogues. Command: clarify. Check: the line names the aim; no figure without a source. Copy decision is the owner's (row T373-e).
7. Search finds places by their names. Exact, then prefix, then word-start, then substring; local and exonym names from the catalogue's alternate names where the wire carries them. Files: DT `suggestions` memo, `src/lib/geocode.js` untouched. Command: harden. Check: "Gent" lists Ghent first if the wire carries the local name, and otherwise no mid-word match outranks a prefix match; verify_places_search passes; a new unit test over the ranking.
8. Remember the last visit, per viewer. Category, country and near place in localStorage, every read and write in try/catch, the tab correct without it. Files: DT. Command: harden. Check: reload returns to Lakes in Slovenia; private window opens clean.
9. A door to region pages. When the list is a country or a near place, the scope line links to its region page ("Salzburg region: 41 places") as a real `<a href="#region=...">`. Files: DT, `src/browse/RegionPage.jsx`, `src/lib/regions.js` (link builder exists, `regionShareUrl`). Command: onboard. Check: a region page opens from the tab without typing a URL; verify_regions "#region= opens the region page" passes on the dev server (it did not open in the V1 walk; see the report).
10. The Trails country index answers which country. Each flag card shows its count of published walks in mono, ordered by that count or alphabetically by the traveller's choice; the two-letter monogram goes; a "Near me" door (the existing locate) sits above the index. Files: DT `CountryCard`, 23-places-pages.css, 63-v6-destinations.css. Command: clarify. Check: no "AU" or "BU" tile; every card carries a count from the wire; verify_country_cards passes. Needs N7.
11. A walk card says where it starts. The trail filling's place line names the start town when the wire carries it, and the hook leads with waymarked or not when known. Files: `src/lib/cardFillings.js` (`trailFilling`), `tests/cardFillings.test.mjs` if present. Command: clarify. Check: three values still, never four.
12. The 5 to 15 km choice as one cut. A Band 2 rail or cut chip "Half a day to a day (5 to 20 km)" over the existing half and day bands, worded to the bands that exist. Files: `src/lib/openingScreen.js` OPENING_RAILS trail entry. Command: shape. Check: the count matches the grid with both bands on.
13. Ownership hand-offs written into OWNERSHIP.md by T380, not built here: CategoryRail, FilterChips and CountryPage to Explore (or shell for FilterChips); 44-tags.css to trips; the desktop `.places-*` rules from 24-destination-workspace.css to 63-v6-destinations.css, moved by the V3 session that owns 63.

### V4: visual and dynamic, inside the palette

1. No text on photographs, no gradients. Country cards (and the trip style cards, by the T376 brief) put the name and count on a paper caption band under the photograph, the PlaceCard pattern; the two linear-gradient scrims and the radial placeholder ground are deleted; a missing photo is plain `--paper-dim`. Files: DT `CountryCard`, 23-places-pages.css:581-639 (deleted), 63-v6-destinations.css. Command: quieter. Check: `grep -n gradient` over the surface's stylesheets returns only the mask-image at 23-places-pages.css:2397 (a mask, not a fill); seven questions, question 2. Needs N5.
2. One card family. Icon and rail cards gain the ochre seal and the label under their one figure ("5,021 m Length"), so the three card sizes read as one product. Files: SectionOpening.jsx, 30-section-opening.css, 63-v6-destinations.css. Command: polish. Check: every figure on the tab has a label.
3. The bands respect the column. Band 1 starts and ends on the 16 px gutter at 380 px and on the column edge at 1280 px (today it bleeds to the panel border). Files: 30-section-opening.css, 63-v6-destinations.css. Command: layout. Check: no element of Band 1 outside the column box in both screenshots.
4. Loading with shape. The opening bands get final-size skeletons like the grid; a category switch keeps the old list until the new one has its first rows, then swaps with a 150 ms opacity transition, reduced-motion branch `none`. Files: SectionOpening.jsx, DT, 30-section-opening.css, 63-v6-destinations.css. Command: animate. Check: no blank band while loading; transitions only on opacity and transform, under 300 ms.
5. Feedback on every card. The shared-element transition the itinerary cards use (`openShared`) extends to PlaceCard and the rail cards, so a card visibly becomes its page. Files: PlaceCard.jsx, SectionOpening.jsx, `src/lib/sharedElement.js` (read, not changed, unless its owner agrees). Command: animate. Check: reduced motion jumps; the keyboard path opens the same page.
6. The data strip explained once. A key for the 6 px strip in the grid head of each section (slope mix, paved share, swim months, altitude), as text, never colour alone. Files: CardStrip.jsx, DT, 37-card-fillings.css. Command: clarify. Needs N8.
7. The cost line on cards, if N1 is accepted: one mono line, the nearest priced town's day cost per person with tilde and "est." where it is an estimate, the town named. Files: lib/cardFillings.js, PlaceCard.jsx, DT (the join), 37-card-fillings.css. Command: typeset. Check: the figure equals Explore's for the same town and lifestyle.
8. The month as a measured fact on cards, if N2 is accepted and the shell gives a month input: "Swim season includes July" or "Good in July" from the wire's month fields. Files: cardFillings.js, CardStrip.jsx. Command: typeset.
9. Sticky refine row. Once Band 3 starts, the refine row (Filters, sort, country, active chips) sticks under the top chrome on a phone, a `--paper` band with a `--rule` bottom border and no shadow. Files: DT, 63-v6-destinations.css. Command: layout. Needs N3.

### V5: harden, adapt and polish

1. Contrast and control rules. Filters becomes a secondary (transparent, `--rule` border, 6 px radius, `--tap` high) with its count badge; active sort `--ink-fill` with `--on-fill`; country picker and Filters at 6 px radius; facet chips stay 999 px only if they are status chips, otherwise 6 px, and reach `--tap` on a coarse pointer (32 px allowed on a fine pointer). Files: 23-places-pages.css, 24-destination-workspace.css (rules moved out), 63-v6-destinations.css. Command: polish. Check: verify_quality_floor passes; no white text on `--accent-soft`.
2. Keyboard and screen reader. Category control per V3-3; rails keep arrows and add arrow keys when the strip has focus (the day-track rule's pattern); the region page traps focus and closes on Escape (verify_regions has the check); the sheet returns focus to its button. Files: SectionOpening.jsx, DT, RegionPage.jsx. Command: harden. Check: scripts/verify_keyboard.mjs 20 of 20; tab order follows the visual order.
3. Long words. German and Dutch labels in the category buttons, the cut chips and the sheet wrap without overflow at 360 px. Files: 63-v6-destinations.css. Command: adapt. Check: screenshots in de and nl at 360 px, no horizontal scroll.
4. Images. The opening loads at most 6 icon photos eagerly (3 today), rail photos lazily with honest `sizes`; measure LCP on the built app before and after. Files: SectionOpening.jsx. Command: optimize. Check: LCP and image bytes on the opening, before and after, in the V5 report.
5. Empty, error and slow states. The plain "none match" line merges into the chips-empty or coverage module; LayerError says which layer failed and keeps the list; a slow layer shows its skeleton and a one-line status after 5 s. Files: DT, CoverageEmpty.jsx, 45-empty-states.css. Command: harden. Check: every empty path renders one of the two modules.
6. Copy pass. Every new string in six catalogues with de, es, fr, it and nl written by the session and one owner row for native review; no banned word, no dash, sentence case. Command: clarify. Check: the six catalogues parse (session rule 8).
7. The middots. `src/browse/CountryPage.jsx:112-114` join facts with middots; replace with a comma or a second sentence and drop the three baseline entries, by whichever surface owns CountryPage after V2. Command: polish. Check: design lint baseline shrinks by 3.
8. Harnesses. Update assertions that encode the old design with a comment saying why (never delete): verify_places_tab (category layout), verify_category_rail if it moves, verify_country_cards (no monogram, a count), verify_paging (36 per page unchanged). Command: audit. Check: all six surface harnesses pass on the built app.
9. Detector and the seven questions over every changed file, once, at the end of each build wave.

### Target state: every button and control on the surface

| Control | Today | Target |
|---|---|---|
| Category choice (6) | Sideways tab strip on phone, 4 visible; 2 x 3 on desktop; red ticks | 2 x 3 on both widths, no ticks, one keyboard model |
| Search field | Substring suggestions | Exact, prefix, word-start, then substring; local names where known |
| Locate | Crosshair in the field | Same; also "Near me" above the Trails index |
| "Search the map for X" | Explicit Nominatim row | Same |
| Near header Clear | Button | Same, plus the region link |
| Region link | None | `<a>` to the region page from the scope line |
| Sort buttons | Active in `--accent` | Active in `--ink-fill` |
| Filters | Accent 999 px pill, phone only | Secondary 6 px button with count, phone toolbar and desktop panel |
| Country picker | 999 px pill | 6 px control |
| Lifestyle | Shared button on priced categories | Same |
| Inline facet chips | Every group on phone, toolbar groups on desktop | Toolbar groups on both; `--tap` on touch |
| Filter sheet | Every group, Clear all, Show N | Same; the only home of the long set |
| Active filter chips | None on this tab | One removable row above the grid with Clear all (N6) |
| Band 1 icon cards | 9, unlabelled figure, bleed past gutter | 6, labelled figure, seal, in the column |
| Band 2 rails | 6 rails, arrows, dots | 2 rails on phone plus cut chips; 6 on desktop; arrow keys (N4) |
| Rail "See all N" | Button | Same |
| Grid cards | Frame with 3 values, no cost | Same frame, plus the cost line if N1 |
| Card strip | Unexplained | Keyed once per section (N8) |
| Trails country cards | Gradient scrim, monogram, no count | Caption band, mono count, no monogram (N5, N7) |
| Stub list and "show all" | Buttons | Same |
| Cycling family chips, local toggle | Buttons | Same |
| Composed trips slider, pace, scale | Controls | Same |
| Coverage line | Footer at the end, no aim | One line under the heading with the aim; credits stay at the end |
| Coverage empty button | One secondary | Same |
| Retry on layer error | Button | Same, naming the layer |
| Desktop panel Reset | Button | Same |
| Region page back, share | Buttons | Same, plus focus trap check |

## 7. Needs a rule

Each line is a proposal carta-design does not cover today, with the rule proposed. T380 accepts or rejects each one before anything in it is built.

N1. Cost line on an outdoor card: one line in `--mono` under the values, for example "from €41.20 a day in Mellieha" (an illustration, not a measured figure), the nearest priced catalogue town within 25 km at the traveller's lifestyle, through the provenance chain (tilde and "est." in text for an estimate), the town named, never a figure without a town; absent when no priced town is within 25 km.
N2. Month fact on a card: when the shell holds a travel month, a card may carry one month fact from measured data ("Swim season includes July") in `--ui` with the month in `--mono`; never a forecast, never shown without a month input.
N3. Sticky refine row: at most one per list, under the top chrome once the list starts, `--paper` band, `--rule` bottom border, `--tap` high, no shadow, holding only Filters, sort, country and the active chips.
N4. Rails and cut chips: a horizontal rail carries a heading, "See all N", arrows on a fine pointer, arrow keys when focused, position dots hidden from screen readers, no autoplay or looping (the day-track rule's grammar, answering row T183-b); at most two rails per screen on a phone, further cuts as one row of chips that apply the same filter.
N5. Photo captions: text never sits on a photograph on browse cards; the caption is a paper band under the photo (the PlaceCard pattern), which retires the gradient scrims.
N6. Active filter chips: one row of removable chips above a filtered list, each naming what it filters, ending with "Clear all"; the same component on Explore and Destinations.
N7. Coverage count on an index card: a country or region index card may carry its published count in `--mono` beside the name, as the measure of what the traveller will find there.
N8. Data strip key: a strip that encodes data on a card is explained once per list, as a text key at the list head, never by colour alone.
N9. Category choice on a phone: up to six categories show as a 2 x 3 grid of equal buttons, never a sideways strip that hides some of them; the active one is `--ink-fill` with `--on-fill`.
N10. Remembered browse state: a browse tab may restore the viewer's last category, country and near place from browser storage, as a per-viewer convenience that the page renders correctly without.

## Files the build waves will touch

App repo: `src/browse/DestinationsTab.jsx`, `src/browse/SectionOpening.jsx`, `src/browse/PlaceCard.jsx`, `src/browse/CardStrip.jsx`, `src/browse/PlacesFilterSheet.jsx`, `src/browse/CoverageEmpty.jsx`, `src/browse/RegionPage.jsx`, `src/browse/StubPage.jsx` (states only), `src/browse/FilterChips.jsx` (reused), `src/browse/HonestFooters.jsx` (through OWNERSHIP.md), `src/browse/CountryPage.jsx` (middots, by its owner after V2), `src/lib/cardFillings.js`, `src/lib/openingScreen.js`, `src/lib/regions.js` (read for the link), `src/styles/23-places-pages.css`, `src/styles/24-destination-workspace.css` (rules moved out), `src/styles/30-section-opening.css`, `src/styles/37-card-fillings.css`, `src/styles/45-empty-states.css`, `src/styles/63-v6-destinations.css` (created by T380), the six `src/i18n/*.js` catalogues, `tests/openingScreen.test.mjs`, a new search ranking test, and the harnesses `scripts/verify_places_tab.mjs`, `verify_category_rail.mjs`, `verify_places_search.mjs`, `verify_regions.mjs`, `verify_country_cards.mjs`, `verify_paging.mjs` (assertions updated with a comment, never deleted). Not touched: `src/browse/CategoryRail.jsx` (Explore's), `src/styles/44-tags.css` (the trips surface's).
