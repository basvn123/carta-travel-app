# Design brief: Explore, the map tab (key 'explore')

Written by T372 in design wave V1, 2026-10-07 and 2026-10-08. This is the brief that V3, V4 and V5 build the Explore surface from. It plans; it builds nothing. App paths are in the app repo and are written as `src/...`. OWNERSHIP.md (written in V2 by T380) is the authority on who may edit a shared file; where this brief names a file another surface also draws, it says so.

The surface is the tab keyed `map` and labelled Explore (`?tab=map`). It opens on a photo grid with editorial rails; the map arrives only through the Grid/Map switch. The main file is `src/browse/ExploreTab.jsx` (1,026 lines).

## 1. Setup and mode

Impeccable context was run once with the root worktree as the working directory: `impeccable context --target <main checkout>/src/browse/ExploreTab.jsx`. It resolved the project root to the app repo (its own git tree) and therefore reported `NO_PRODUCT_MD` and `BUILD_INIT_REQUIRED`, because PRODUCT.md and DESIGN.md sit in the root repo one level up. That is a path artefact of the nested repos, not missing context: both files were read directly, with the carta-design skill, `docs/design-v6/TRIP-PLANNING-RESEARCH.md` and the impeccable references critique.md, audit.md, shape.md and operate.md. Init was not run; it would have written a second PRODUCT.md into the app repo.

The run is unattended and the owner told every session to proceed (2026-10-07), so impeccable's question rounds (shape's discovery interview, critique's closing questions) were answered from the brief and the research instead of asked. Every such choice took the option that keeps Carta's palette, type and identity. This is refinement, not redesign.

Mode: **Operate.** The traveller on Explore is doing a task, comparing many places on cost, rating, month and access to pick a shortlist, not being persuaded by a page or reading prose. PRODUCT.md calls the central act "comparing dense pricing matrices", and operate.md's rules fit exactly: scanability and consistency over expression, motion only for state, density as a feature. The editorial rails pull the page toward Persuade today; part of this brief is pulling it back.

## 2. The walk

The traveller is the one in TRIP-PLANNING-RESEARCH.md: no destination yet (59% start undecided), value for money first (3 in 5 Europeans), then the month (74% weigh weather, 68% avoid crowds), then whether it works without a car (hikers, the launch audience). The walk ran on the shared dev server (`http://localhost:5199/?tab=map`) with Playwright at 380 x 800 and 1280 x 800, from a cold start (empty storage) and from a returning visit (tier key dismissed, filters in the URL).

Cold start, phone (V1-grid-380). The cold start lands straight on Explore with no welcome. Before the first photograph the traveller passes six rows of chrome: four trip-style tiles (five more off to the right), search, the Lifestyle pill ("Entire place | Easygoing") beside a star reading "0", a full-width Filters button, and the sort select alone on its row. The first card starts 490 px down an 800 px screen. The page title is visually hidden on the phone. The first content is "The 41 highest-rated places in Europe": Rome, Venice, Paris. No euro figure appears anywhere on the first screen, because rail cards carry no price. The floating List/Map pill sits over the rail card's name and score.

Cold start, desktop (V1-grid-1280). The left panel holds nine trip-style tiles, then "Refine" with five folds (Kind of place and How good open). The control bar has the h1 "Explore Europe", the Grid/Map switch and the sort. Under it the tier key reads "Worth the journey 48 | 8.7+", and right under that the first rail says "The 41 highest-rated places". Two different counts for one tier on one screen. Again no price above the fold.

Scrolling (V1-cards-380). Three rails, a "More ways in" fold with five doors, then the mosaic. Phone cards are two abreast and carry name, score, flag, country, a five-segment gauge and the euro figure ("€101"), with the unit "a day" dropped at this width. Names and countries truncate ("Amster...", "Netherl..."). Every top-tier card wears a "Worth the journey" seal on the photo and an ochre score chip under it: the same fact twice. The star on each card is 27 x 27 px. The Amsterdam gauge shows its fifth segment in terracotta.

The card preview (V1-preview-1280). Hover or the info button turns the whole card into an ink panel: country, "Stay 2-3 days", "Top of Italy", a line of what it is known for, "Worth about 2 days", "Apr-May", then the compact receipt (bed €33 "City", food €55 "Country", "One day, one person, Mid-priced €87"). It is the best moment on the page, and it hides the photograph, contradicts itself on length of stay, and does not exist on touch (the info button is hidden on coarse pointers).

Filters. On the phone the Filters button opens the shared sheet (V1-filters-380): the same five folds and a primary "Show 3,855 places" button, the only place the page states a count. On desktop the folds open in the panel; Practical holds No car needed, Under €70 a day, Not crowded, Near the sea, UNESCO, a "Good in" month select and "Max travel time" (shown because the traveller's origin has a reach table). The €70 is fixed whatever the Lifestyle says.

Lifestyle (V1-lifestyle-380, lifestyle-1280). The pill opens the one Lifestyle panel with a scrim. Two selected options are filled terracotta at once; the close control is a letter "x" in a grey disc; on the phone the last row runs under the bottom nav. Changing it re-prices the cards behind, but the panel itself shows no figure and no trade-off sentence.

Map (V1-map-1280, V1-map-380). The switch splits the desktop feed: a two-up list on the left narrowing to the viewport, the map on the right. Below zoom 6 the map is cream clusters stroked in ochre with counts; above it, small dots filled by rating tier. No pin shows a price, there is no cheapest pin, and a hover at the centre of a zoomed map found no pin to show (map-zoomed-1280). On the phone the map starts 383 px down, under the same six rows, and the List/Map pill covers its lower right.

Filtered and empty (filtered-380, empty-1280). Active filters become removable chips in `--accent-bg`. Six stacked filters reach zero with no warning; the empty line says "Clear the last one you set, or widen the price" although Explore has no price control, and its one button clears every filter at once.

Returning visit (returning-380, returning-1280). The tier key folds to a bare "?" once dismissed. Filters and the view survive in the URL. Nothing says what changed since last time, and the shortlist star filter shows only a count.

Where the traveller is sent away: to the destination page for any cost detail on a phone, to the planner for anything about getting there, and off Carta altogether for "is it cheaper elsewhere this month" because the map cannot answer it.

Before screenshots, saved outside both repos: `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\explore\` V1-grid-380, V1-grid-1280, V1-cards-380, V1-preview-1280, V1-filters-380, V1-lifestyle-380, V1-map-380, V1-map-1280 (.jpg). Build waves save their after set under the same view names.

## 3. Inventory

One row per view, state, control and visual setting. File is the file that draws it (`src/` omitted). Verdicts: keep, move, merge, remove, rework.

### Views and states

| # | Item | What it does | Where | File | Verdict |
|---|---|---|---|---|---|
| S1 | Grid view, idle | Rails then the packed mosaic | Main column | browse/ExploreTab.jsx | rework: price first, count visible |
| S2 | Grid view, filtered | Chips, no rails, mosaic | Main column | browse/ExploreTab.jsx | keep, add count |
| S3 | Map view, desktop | Two-up list beside a sticky map, list narrows to viewport | Main column, split | ExploreTab.jsx, ExploreMap.jsx | rework: price pins, two-way sync |
| S4 | Map view, phone | Map in the column under the toolbar | Main column | ExploreTab.jsx, ExploreMap.jsx | rework: map gets the screen |
| S5 | Map loading | Skeleton frame at final size while maplibre loads | Map slot | ExploreTab.jsx (LoadingBlock) | keep |
| S6 | Catalogue loading | App splash "Charting Europe" | Whole screen | shell, not this surface | keep (shell) |
| S7 | Empty result | "No place matches..." plus Clear filters or Clear search | Main column | ExploreTab.jsx, 45-empty-states.css | rework: name the filter, fix "widen the price" |
| S8 | Empty shortlist view | "results.emptyFav" with no action | Main column | ExploreTab.jsx | rework: add the way back |
| S9 | Search suggestions | "Did you mean" buttons on a zero search | Main column | ExploreTab.jsx | keep |
| S10 | Search hints | Member village resolved to parent; region filter line | Above the grid | ExploreTab.jsx | keep |
| S11 | Country banner | One country filtered: a door to its country page | Above the grid | ExploreTab.jsx | keep |
| S12 | Country page | Full country page opened from banner or rail arrow | Overlay | browse/CountryPage.jsx (country surface) | keep (other surface) |
| S13 | Mock data badge | Marks mock data | Control bar | ExploreTab.jsx | keep |
| S14 | Map error | Nothing: a failed tile style or offline map shows a blank frame | Map slot | ExploreMap.jsx | rework: add an error line |
| S15 | Infinite scroll | Sentinel adds 48 cards at a time | Grid end | ExploreTab.jsx | keep, add a count line at the end |

### Controls: header, toolbar, control bar

| # | Item | What it does | Where | File | Verdict |
|---|---|---|---|---|---|
| C1 | Search field | Filters by city, country, alias, region | Desktop: portalled into header slot; phone: toolbar | ExploreTab.jsx | keep |
| C2 | Search clear (x) | Clears the query | In the field | ExploreTab.jsx | rework: 44 px box on touch |
| C3 | Trip style tiles (9) and Reset | Multi-select trip kinds (tripKinds) | Desktop left panel; phone toolbar strip | browse/CategoryRail.jsx | rework: become chips, counted, cleared by Clear all |
| C4 | Lifestyle button | Opens the one Lifestyle panel | Desktop panel foot; phone toolbar | browse/LifestyleButton.jsx (shared) | move: into the control bar beside the count |
| C5 | Shortlist filter (star and count) | Shows only starred places | Desktop panel foot; phone toolbar | ExploreTab.jsx | rework: label it ("Shortlist 2"), 44 px |
| C6 | Filters button and badge | Opens the filter sheet (phone) | Phone filter bar | ExploreTab.jsx | merge: same row as search |
| C7 | h1 "Explore Europe" | Page title | Control bar (hidden on phone) | ExploreTab.jsx | rework: title with the live count |
| C8 | Grid/Map switch | Changes view, rides the URL | Control bar (desktop) | ExploreTab.jsx | keep |
| C9 | Sort select (Rating, Cheapest day, A-Z, Country) | Orders the grid | Control bar | ExploreTab.jsx | keep; phone: into the count row |
| C10 | List/Map floating switch | Same switch for the thumb | Above the bottom nav (phone) | ExploreTab.jsx | keep, stop it covering cards (bottom padding) |
| C11 | Live result count | Missing on the page (CSS `.xgrid-count` exists, no JSX) | Control bar | ExploreTab.jsx | add |
| C12 | Budget ceiling | Missing; only the fixed "Under €70 a day" toggle | Practical fold | ExploreFilterRail.jsx | add as a stepped select in the control bar |

### Controls: filter rail and sheet

| # | Item | What it does | Where | File | Verdict |
|---|---|---|---|---|---|
| F1 | Fold summaries (5) with active count | Open and close a group | Rail | ExploreFilterRail.jsx | keep; count badge to `--ink-fill` |
| F2 | Kind of place toggles (5) | Metropolis to Landscape | Rail | ExploreFilterRail.jsx | rework: rename "Size of place", closed by default |
| F3 | How good toggles (3) and Hidden gem | Tier filter, gem filter | Rail | ExploreFilterRail.jsx | keep |
| F4 | What you do with it toggles (4) | Base, Basecamp, Day trip, Stop | Rail | ExploreFilterRail.jsx | rework: InfoDot from the glossary |
| F5 | No car needed | Transit good or excellent, no car | Practical | ExploreFilterRail.jsx | move: to the control bar as a first-class toggle |
| F6 | Under €70 a day | Fixed ceiling | Practical | ExploreFilterRail.jsx | remove: replaced by C12 |
| F7 | Not crowded, Near the sea, UNESCO | Flags | Practical | ExploreFilterRail.jsx | keep |
| F8 | Good in (month select) | Best months include the month | Practical | ExploreFilterRail.jsx | move: to the control bar as the month input |
| F9 | Max travel time select | Reach from origin, 2 to 5 h | Practical (when reach exists) | ExploreFilterRail.jsx | keep |
| F10 | Country checkboxes (39) and "About country" arrows | Country filter, country page | Country fold | ExploreFilterRail.jsx | keep; arrow to 44 px on touch |
| F11 | Side "Clear all" | Resets every filter | Rail head (desktop) | ExploreTab.jsx | keep, also reset trip styles |
| F12 | Sheet close (x) | Closes the phone sheet | Sheet head | browse/PlacesFilterSheet.jsx (shared) | keep |
| F13 | Sheet "Clear all" | Resets | Sheet foot | PlacesFilterSheet.jsx | keep |
| F14 | Sheet "Show N places" | Primary, closes with the live count | Sheet foot | PlacesFilterSheet.jsx | keep; fix the comma spacing in the count |
| F15 | Active filter chips and "Clear all" | One chip per filter, each removes itself | Under the control bar | browse/FilterChips.jsx (shared) | keep; add trip styles; remove verb in the accessible name |

### Controls: tier key, rails, community

| # | Item | What it does | Where | File | Verdict |
|---|---|---|---|---|---|
| K1 | Tier key line | Three tiers and gems with live counts and cutoffs | Under the control bar | browse/TierLegend.jsx | rework: counts from the same rows as the grid |
| K2 | "How the score works" | Opens the method sheet | Key line | TierLegend.jsx | keep |
| K3 | Method sheet and its close | Method paragraph and tier cut table | Sheet | TierLegend.jsx | keep |
| K4 | Key dismiss (x) | Folds the key, remembered | Key line | TierLegend.jsx | keep |
| K5 | "?" pip | Brings the key back | Where the key was | TierLegend.jsx | rework: a word, not a bare "?" ("Score key") |
| R1 | Rail heading and subtitle | Names the list and how it was chosen | Rail head | browse/ExploreRails.jsx | keep |
| R2 | "See all N" | Opens the grid with the rail's filter | Rail head | ExploreRails.jsx | keep; 44 px target |
| R3 | Rail arrows (prev, next) | Page the strip on a pointer | Rail head | ExploreRails.jsx | keep; add position "1 to 4 of 12" in mono |
| R4 | Rail card | Opens the place | Rail strip | ExploreRails.jsx | rework: add the day cost |
| R5 | "More ways in" fold and 5 door chips | The other rails as doors | Under the rails | ExploreRails.jsx, browse/Fold.jsx | keep |
| R6 | Rail order (top tier, gems, this month) | Which three lead | ExploreTab.jsx rails memo | ExploreTab.jsx | rework: lead with a cost rail |
| G1 | Guides strip | Count of published guides and one door | Under the key | community/GuidesStrip.jsx (community surface) | keep (other surface) |

### Controls: the card and its preview

| # | Item | What it does | Where | File | Verdict |
|---|---|---|---|---|---|
| D1 | Card hit area | Opens the destination page with a shared-element transition | Whole card | ExploreTab.jsx | keep |
| D2 | Verdict seal on the photo | Tier 2 and 3 word | Photo corner | ExploreTab.jsx | remove on tier-filtered views and rails; keep once per card elsewhere |
| D3 | Gem chip | Teal hidden gem | Photo corner | ExploreTab.jsx | keep |
| D4 | Name, score chip | Fraunces name, ochre score | Card line 1 | ExploreTab.jsx, components/RatingBadge.jsx | keep |
| D5 | Flag, country, kind word | Where and what size | Card line 2 | ExploreTab.jsx | keep; wrap, never truncate the country to nothing |
| D6 | Water quality badge | Bathing water class where swimming matters | Card line 2 | components/WaterQualityBadge.jsx | keep |
| D7 | Cost line (gauge, € figure, "a day") | Day cost for one person | Card line 2 | components/CostSummary.jsx (CostLine) | rework: price to line 1, stand-in marked in words |
| D8 | Star | Shortlist toggle | Photo corner | ExploreTab.jsx (same polygon as FavStar) | rework: 44 px on touch (27 px today) |
| D9 | Info button | Pins the preview | Photo corner (fine pointer only) | ExploreTab.jsx | rework: also on touch, as a tap on the price |
| D10 | Preview panel | Rank, lead, sights, stay, months, reach, compact receipt | Over the whole card | ExploreTab.jsx | rework: a popover beside the card, photo stays |
| D11 | Compact receipt | Bed and food with City or Country word, total and band | Inside the preview | CostSummary.jsx (CostReceipt) | keep; add the cost bar |
| D12 | Reach line | "About 3 h by train or bus" | Preview | ExploreTab.jsx | keep |

### Controls: the map

| # | Item | What it does | Where | File | Verdict |
|---|---|---|---|---|---|
| M1 | Canvas | Pan by drag and arrow keys | Map | ExploreMap.jsx | keep |
| M2 | Zoom + and - | MapLibre navigation control | Map top right | ExploreMap.jsx | keep |
| M3 | Attribution | Compact CARTO and OSM credit | Map foot | ExploreMap.jsx | keep |
| M4 | Clusters | Count circles below zoom 6, click zooms | Map | ExploreMap.jsx | rework: stroke `--ink-mute`, not ochre |
| M5 | Dots | Size by kind, fill by tier, teal ring for gems | Map | ExploreMap.jsx, map/tokenColors.js | rework: carry the price |
| M6 | Name tip | Hover tip with name and score | Popup | ExploreMap.jsx | rework: add the day cost |
| M7 | Pin card (zoom 8 and up) | Photo, name, score, lead; click opens | Popup | ExploreMap.jsx | rework: add the day cost |
| M8 | Keyboard pin layer | Up to 30 focusable pin buttons | Over the canvas | ExploreMap.jsx | keep (verify_keyboard) |
| M9 | Price pins and cheapest pin | Missing | Map | none | add |
| M10 | Card to pin highlight | Missing | List and map | none | add |

### Visual settings

| # | Setting | Today | File | Verdict |
|---|---|---|---|---|
| V1 | Mosaic spans | Metro and tier 3 span 6 of 12 at 16:10, area 21:9, city 4 at 4:3, town and village 3 square | ExploreTab.jsx spanFor | rework: shorter photos, more prices per screen |
| V2 | Cost gauge colours | Cheapest band green, dearest terracotta, between ink | 24-destination-workspace.css | rework: dearest to ink, accent is not data |
| V3 | Map tier ramp | `--rate` and three map-only hexes | map/tokenColors.js | keep until T364-b decides |
| V4 | Kind chip accent tick | A 14 x 2 px terracotta bar on every phone trip-style tile | 24-destination-workspace.css | remove |
| V5 | Filter chips fill | `--accent-bg` with accent text (3.83:1, T363-a) | 25-feature-pages.css | rework: `--paper-dim` chip, ink text |
| V6 | Fold count badge | Terracotta circle | 25-feature-pages.css, 46-owner-calls.css | rework: `--ink-fill` |
| V7 | "See all" links | Terracotta text | 25-feature-pages.css | rework: `--ink` underlined link; accent kept for one primary |
| V8 | Lifestyle pill | `--accent-bg` tint, accent border | 23-places-pages.css, 24-destination-workspace.css | keep (it is the action every price comes from) |
| V9 | Preview panel | Ink fill over the photo | 24-destination-workspace.css | rework (D10) |
| V10 | Rail card ratio | 4:3, 200 px | ExploreRails.jsx, 25-feature-pages.css | keep |
| V11 | Floating switch | Ink pill above the nav | 25-feature-pages.css | keep, reserve space under the last card |

Count before: about 60 distinct control types on the surface (the 39 country rows counted once); 159 visible interactive elements at 380 px and 321 at 1280 px on the idle grid (Playwright count, scratch walk). 51 of the 159 at 380 px are under 44 px, most of them the 27 px card stars and the 22 px "See all" links.

## 4. Critique and technical audit

Method: dual-agent, as critique.md requires. Assessment A (design review) and Assessment B (detector) ran as two isolated sub-agents and their results met only here. A worked from the source and the scratch screenshots, without a browser, to keep the laptop to one browser.

### Design health

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | No result count on the page; only the phone sheet's button says "3,855 places" |
| 2 | Match with the real world | 2 | "Trip style: City" beside "Kind of place: City"; "What you do with it" is internal taxonomy; empty copy names a price control that does not exist |
| 3 | User control and freedom | 3 | Chips, Clear all and URL state are good; trip styles are not chips and Clear all leaves them set |
| 4 | Consistency and standards | 2 | Rail cards have no price, grid cards do; key says 48, rail says 41 |
| 5 | Error prevention | 2 | Toggles show no counts, six filters reach zero silently; the €70 ceiling ignores Lifestyle |
| 6 | Recognition over recall | 2 | The tier key folds to "?"; cost provenance only on hover |
| 7 | Flexibility and efficiency | 3 | Shareable URL state, cost sort, keyboard pin layer; no budget input, no compare |
| 8 | Aesthetic and minimalist design | 2 | Photo-dominant: about four prices per desktop screen, 490 px of phone chrome |
| 9 | Error recovery | 2 | The empty button wipes all six filters although the copy says "the last one" |
| 10 | Help and documentation | 3 | Method sheet is good; "€87 a day" has no InfoDot |
| Total | | 23/40 | Acceptable |

Cognitive load: 4 of 8 checklist items fail (single focus, chunking, minimal choices, visual hierarchy), which is high. Decision points over four options: trip styles 9, kind 5, practical 5 toggles and 2 selects, countries 39, the phone toolbar about 8 controls as one row of decisions.

Design specificity: partly authored. The tier key with live cutoffs, the cost gauge, the receipt that labels each line "City" or "Country", ochre scores and teal gems could only be Carta. The composition (photo carousels of famous places, a big-photo mosaic, a floating pill) could ship on any inspiration site. The one thing that sets Carta apart, the honest day cost, is the smallest element on the card and absent from the first screen at both widths.

### Priority issues

[P1] A price tool whose first screen shows no price. Rail cards carry name, score and country only (`ExploreRails.jsx` RailCard); the first screen at 380 and 1280 shows zero euro figures (V1-grid-380, V1-grid-1280); the desktop mosaic shows about four prices per screen (grid-deep-1280). Value for money is the first criterion for 3 in 5 Europeans. Fix: cost on every rail card, a cost-led first rail for the traveller's Lifestyle and month, the price on the card's first line, shorter photos. Commands: layout, distill.

[P1] The figure on the card carries no pedigree on touch. "€87 a day" is bare on the card; the preview shows the food line is a country figure standing in (V1-preview-1280), and the preview does not exist on a phone. PRODUCT.md: every figure is labelled for where it came from. Fix: the card says in one word when a component is a stand-in, an InfoDot on the first "a day" per view, and a tap on the price opens the compact receipt on touch. Commands: clarify, harden.

[P1] Two overlapping place taxonomies, one invisible to the filter state. Trip style (nine tiles) and Kind of place (five chips) both offer "City"; trip styles make no chip, are not counted on the Filters badge, and survive "Clear all" and the empty state's "Clear filters" (`ExploreTab.jsx` resetAll and chips). A traveller who picked Beach and emptied the grid presses Clear filters and still sees a narrowed list with no reason shown. Fix: trip styles join chips, badge and reset; Kind of place is renamed and folded. Commands: distill, clarify.

[P2] No visible count, and two counts that disagree. The control bar's comment promises a live count; none renders. The key counts `data.destinations` (48 worth the journey) while the rail and grid count the deduplicated rows (41). Disagreeing figures on one screen are the trust damage Carta exists to avoid. Fix: one count in mono in the control bar from `gridTotal`; the key counts the same rows. Command: clarify.

[P2] The budget is not an input and the map cannot answer "where can I afford". A fixed "Under €70 a day" toggle in a closed fold; pins encode rating only; the empty copy says "widen the price". Fix: a stepped ceiling in the control bar, price pins with the one cheapest pin emphasised, and empty copy that names the narrowing filter. Commands: adapt, harden.

Persona red flags, in short. Casey on a phone: 490 px of chrome before content, the List/Map pill over card facts, 27 px stars, the Lifestyle sheet's last row under the nav. Sam on a keyboard: chips announce only their label (the remove verb is in `title`), every Tab onto a card pops the full ink preview, a long walk (the keyboard harness caps at 220 stops on the grid). Jordan the first-timer: "Base, Basecamp, Day trip, Stop" unexplained, a pill reading "Entire place | Easygoing" with no label, a star reading "0". The budget hiker planning one holiday car-free: no walks fact on a card, no typed ceiling, the map shows ratings not euros, "No car needed" buried in a fold.

Minor: the accent is spent on six or more non-actions per phone screen (kind ticks, See all links, chips, fold badges, the dearest gauge band, "Get a pass" in the top bar); map clusters stroked in ochre read as ratings; split-view cards truncate the country to "It..." and drop Barcelona's entirely; "Stay 2-3 days" and "Worth about 2 days" in one preview; the Lifestyle panel lacks its trade-off sentence; the sheet count renders as "3, 855"; a stale comment in `ExploreFilterRail.jsx` says the modal sheet is gone; the whole-euro card figure ("€87") versus PRODUCT.md's two-decimal rule (CostSummary says the data does not support decimals; the docs need one answer, see register row T372-e).

### Detector and lint (Assessment B)

`impeccable detect --json` over the eleven Explore markup files (ExploreTab, ExploreMap, ExploreRails, ExploreFilterRail, TierLegend, CategoryRail, LifestyleButton, FilterChips, CostSummary, FareProvenance, FavStar): exit 0, no findings. Over `15-map-overlays.css`, `26-shortlist-extras.css` and `25-feature-pages.css`: one finding, side-tab at `25-feature-pages.css:4081` (`.jweek-bed.is-move { border-left: 2px solid var(--ink) }`), a false positive: an ink divider that marks a bed change in the Journeys week plan, not an accent stripe and not this surface. `node scripts/ci/design-lint.mjs`: 213 violations, all 213 in the baseline, 0 new.

### Technical audit

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Card stars 27 x 27 px and "See all" 22 px tall on touch; chips lack the remove verb in their name; keyboard map layer passes |
| 2 | Performance | 3 | maplibre is lazy (off the critical path), the map filters by expression not setData; the idle grid holds 48 cards of photos, the phone walk was smooth |
| 3 | Responsive | 2 | 490 px of chrome before the first card at 380; floating switch covers content; country truncates to nothing in the split view; no horizontal scroll at either width |
| 4 | Theming | 3 | Tokens throughout, no hex outside the mirror; accent used as data and decoration; three map-only hexes wait on T364-b |
| 5 | Implementation integrity | 3 | Detector clean on the markup, lint 0 new; the dead `.xgrid-count` rule and the stale comment are drift |
| Total | | 14/20 | Good |

Harnesses, run read-only against the shared dev server with a scratch working directory so their screenshots stayed outside the repos:

| Harness | Result | Note |
|---|---|---|
| verify_explore.mjs (`?tab=map`) | 58 of 67 | The 9 failures are timeouts opening the destination page and the phone grid on the loaded shared dev server (a first run without `?tab=map` reached 8 of 18 the same way); the build waves run it against their own preview |
| verify_keyboard.mjs `--only explore-grid,explore-map` | 3 of 4 | explore-map at 380 failed `pinEnterOpens` (Enter on a pin did not open the place within the wait), same slow-server pattern; 1280 passed with 30 pin stops, labelled pins, tip on focus, Escape dismisses |
| verify_shortlist.mjs | not completed | Timed out waiting for the Destinations nav item on the shared dev server |
| verify_map_size_cards.mjs | not run | It starts its own `vite preview` and needs a build; this task builds nothing |
| verify_fare_provenance.mjs | not run | It checks the planner; FareProvenance is not drawn on Explore today |

## 5. The traveller's job here

What they need first is the answer to "what can I afford": the day cost for their own Lifestyle on every place they see, the cheapest honest options first, with the count of places that fit. Value for money is the leading criterion for 3 in 5 European travellers (Booking.com 2024, research section 2), and the StubHub and Airbnb evidence (section 4) says the whole price up front is what earns trust.

Second, whether it is good in their month: the month as an input, with weather and crowding as measured facts per place. 74% weigh weather risk and 68% would pick a less crowded place (Booking.com 2026). Today the month is a select in a closed fold and only one rail ("Great right now") uses it.

Third, whether they can get there and around without a car, and what there is for them. Hikers are the launch audience; two thirds would use public transport to a walk, and the one-hour connection is their limit (Wandermonitor 2024). "No car needed" exists but is buried; nothing on a card says walks.

What is missing: a budget ceiling that moves the pins (KAYAK Explore), price pins with one emphasised cheapest pin (carta-design's own rule), the map and list in sync both ways (research, Airbnb's map ranking finding), a live count, the provenance word on a touch card, and a compare tray of up to four places (NN/g). The compare tray is a new component and goes to the register, not V3 (row T372-c).

What sits in the wrong place: the rating leads where the price should; the month and the car-free toggle sit in the Practical fold; the Lifestyle door sits at the foot of the desktop panel, below five folds, though every figure on the page comes from it; the sort and the tier key take first-screen space a count and a ceiling should have.

What sends them away: on a phone, any cost detail needs the full destination page; "how do I get there" needs the planner (or reach, shown only in the hover preview); "is it cheaper there in May" cannot be answered here at all, which is where a traveller opens another tab (the CMU tab-overload finding).

## 6. Plan (impeccable shape)

Brief in shape.md's terms. Job and audience: a budget traveller with no destination yet, on a phone first, comparing many places. Outcome: a shortlist of two to four places they can afford in their month, reached without a car if they want. Direction: the incumbent world, untouched (paper, ink, one terracotta, Fraunces names, mono figures). Structural thesis: the page is an instrument, not a magazine: inputs on top (Lifestyle, budget, month, car-free), a count, then priced places, with the map as the same list in space. Anti-goals: no new colour, no gradient, no hero photograph, no scroll-triggered motion, no second Lifestyle control, no fare of Carta's own. Assumptions taken without an interview are marked as such in the report.

Items marked "rule N" depend on part 7 being accepted by T380 first; if T380 rejects a rule, the item drops and becomes a register row.

### V3: structure, information and flow

1. Live count in the control bar. The h1 carries the count of what the view holds ("3,855 places", "12 in view" on the map) in `--mono`, from `gridTotal`, on both widths; the phone shows it in the row that holds the sort. Files: `src/browse/ExploreTab.jsx`, `src/styles/62-v6-explore.css`, six `src/i18n/*.js`. Command: clarify. Done when the count is visible at 380 and 1280 and equals the number of cards the sentinel can reach (verify_explore gets an assertion).
2. One count everywhere. TierLegend counts the same deduplicated rows the grid and rails use, so the key and "The N highest-rated" agree. Files: `src/browse/TierLegend.jsx`, `src/browse/ExploreTab.jsx` (passes rows). Command: clarify. Done when the key's tier 3 count equals the top rail's N.
3. The input row (rule N1). The control bar becomes: Lifestyle door, budget ceiling, month, No car needed, then count and sort. The ceiling is a stepped select per person per day, ground cost only (Any, €40, €60, €80, €100, €130) with URL key `xb`; it replaces the fixed Under €70 toggle and its `xp=e` flag (old links map `e` to €70). Month moves out of the Practical fold, same URL key `xm`; No car needed moves out, same flag. On a phone the row scrolls sideways as one band under search and Filters. Files: `ExploreTab.jsx`, `ExploreFilterRail.jsx`, `src/browse/LifestyleButton.jsx` (a compact variant, through OWNERSHIP.md), `62-v6-explore.css`, i18n. Command: layout, harden. Done when each input changes the grid and the count live, survives a reload through the URL, and an `xp=e` link still filters at €70.
4. Phone chrome to one screen-third. Search and Filters share one row; the trip-style strip moves into the filter sheet's first group; the shortlist filter becomes a labelled chip in the input row; the visually hidden h1 becomes the visible count line. Target: first priced card top at or under 300 px at 380 x 800 (490 px today). Files: `ExploreTab.jsx`, `src/browse/CategoryRail.jsx`, `62-v6-explore.css`, `src/styles/24-destination-workspace.css` (move the `.explore-toolbar` rules out). Command: distill. Done when the Playwright measure of the first card top is 300 or less and nothing scrolls sideways at 360.
5. Price on every card. RailCard gets `CostLine`; on the grid card the figure moves to line 1 opposite the score, the gauge stays on line 2. Files: `src/browse/ExploreRails.jsx`, `ExploreTab.jsx`, `src/components/CostSummary.jsx`. Command: layout. Done when every rail and grid card at both widths shows a euro figure (verify_explore's "every card shows a euro-a-day figure" extended to rail cards).
6. Lead with cost (rule N2). The first rail is "Under €N a day in <month>": the well-rated places (tier 1 and up) under the traveller's ceiling (or the cheapest third when no ceiling is set) whose best months include the current or chosen month, sorted by day cost, interleaved by country. The top-tier rail moves to second, gems third. Files: `ExploreTab.jsx` (rails memo), `ExploreRails.jsx`, i18n. Command: distill. Done when the first rail's cards rise in cost left to right and its "See all" lands on a grid with the same chips.
7. Trip styles are filters like the others. They produce chips, count on the Filters badge, reset with Clear all and the empty state; "Kind of place" is renamed "Size of place" and closed by default on desktop; "What you do with it" gets one InfoDot per role term from `src/lib/glossary.js`. Files: `ExploreTab.jsx`, `ExploreFilterRail.jsx`, `src/browse/FilterChips.jsx` (shared with Destinations, through OWNERSHIP.md), `src/lib/glossary.js`, i18n. Command: clarify. Done when picking Beach then Clear all returns the full count.
8. Provenance on the card (rule N3). When the bed or the food figure is a country-level stand-in, the card's cost line adds one word, "national" (glossary term, InfoDot on its first occurrence in the view), never only a colour; a modelled figure keeps the tilde and "est.". On touch, tapping the price opens the compact receipt as a popover with the same content as the hover preview's receipt. Files: `CostSummary.jsx`, `ExploreTab.jsx`, `src/components/InfoDot.jsx` (use only), glossary, i18n. Command: clarify, harden. Done when a country-level card shows the word at 380 and the receipt opens by tap and by Enter.
9. Price pins and the cheapest pin (carta-design "Price pins"; label mechanics rule N4). From zoom 7, the pins in the keyboard layer's set (at most 30, already computed in `collectKpins`) render as DOM labels: name in `--ui`, day cost in `--mono`; the one cheapest pin in view is the emphasised pin (`--accent` fill, `--on-fill` text). Below zoom 7 the dots stay. Name tips and pin cards add the day cost. Clusters lose the ochre stroke (`--ink-mute`). Files: `src/browse/ExploreMap.jsx`, `src/map/tokenColors.js` (only if a new mirrored token is needed), `src/map/pinKeys.js` (nameMarker for the labels), `src/styles/15-map-overlays.css` or `62-v6-explore.css` per OWNERSHIP.md. Command: adapt. Done when at zoom 8 over any region every labelled pin shows a mono figure, exactly one is emphasised, and verify_keyboard explore-map still passes 30 stops.
10. Map and list in sync both ways (rule N5). Hovering or focusing a card in the split list rings its pin; hovering or focusing a pin outlines its card and scrolls it into view only if the list is not being scrolled. On a phone the map view gives the map the screen under one slim input band, and the list becomes a bottom drawer with the count, not a column under the map. Files: `ExploreTab.jsx`, `ExploreMap.jsx`, `62-v6-explore.css`. Command: layout, adapt. Done when the pin of a focused card is visibly ringed and the reverse holds, at 1280; at 380 the map fills from under the band to the nav.
11. Empty states that name the cause. The empty line names the last filter set ("Nothing under €40 a day in January with No car needed") and offers "Remove <last filter>" as the button, with Clear all as the secondary link; "widen the price" becomes true once item 3 exists; the empty shortlist view gets "Show all places". Files: `ExploreTab.jsx`, `src/styles/45-empty-states.css` (owned by T367's lineage, through OWNERSHIP.md), i18n. Command: harden, onboard. Done when each of the three empty paths offers one action that changes the result.
12. Returning visit. The "?" pip becomes the words "Score key"; a returning traveller's restored filters show as chips with the count (already true) and the input row shows their Lifestyle, ceiling and month without opening anything. No "what changed" feature here (that is My trips). Files: `TierLegend.jsx`, `ExploreTab.jsx`. Command: clarify. Done when a reload with filters in the URL shows every input's value on the first screen.

### V4: visual and dynamic, inside the palette

1. Cards that read as a price list with pictures. Grid photos cap at 3:2 (16:10 kept only for the two-up phone grid), the mosaic keeps its spans but not its tall ratios, so a 1280 x 800 screen shows at least 8 priced cards (about 4 today). The seal leaves the photo on views already filtered to a tier and on rails. Files: `ExploreTab.jsx` (spanFor), `62-v6-explore.css`, `src/styles/24-destination-workspace.css` (old `.xcard` rules retired). Command: layout. Done when the 1280 screenshot counts 8 or more euro figures above the fold of the grid.
2. The preview as a popover, photo kept (rule N6). The preview opens beside the card (or over the lower half on the narrow two-up), `--bg-card`, `--rule` border, `--shadow-2`, not an ink panel over the photo; it adds a 12-cell month strip from the existing `src/components/MonthStrip.jsx` (best months filled `--ink`, the chosen month outlined) and the receipt's cost bar (the T362 rule). One length-of-stay line, not two. Opens on hover after 150 ms, on focus, and on tap of the price; opacity and 4 px translate, 150 ms, reduced-motion none. Files: `ExploreTab.jsx`, `CostSummary.jsx`, `src/browse/CostBar.jsx` (use), `62-v6-explore.css`. Command: animate, layout. Done when the preview never hides the photo at 1280 and verify_explore's hover checks pass with an updated selector.
3. Spend the accent once. Remove the kind-tile accent tick; filter chips to `--paper-dim` with `--ink` text and a `--rule` border; fold count badges and the shortlist count to `--ink-fill`; "See all" to an `--ink` underlined link; the gauge's dearest band to `--ink` (rule N7). The accent remains on: the one primary per view (the sheet's Show N places), the cheapest pin, focus rings, the active nav. Files: `62-v6-explore.css`, `src/styles/25-feature-pages.css`, `src/styles/46-owner-calls.css`, `src/styles/24-destination-workspace.css` (rules moved, not duplicated). Command: quieter, colorize. Done when a 380 screenshot of the idle grid shows terracotta only on the cheapest-first rail's emphasis (if any), the active nav item and the Lifestyle door.
4. Motion that states change. The count changes in place with tabular figures and no layout jitter; chips enter and leave with a 150 ms opacity and scale; the grid/map switch crossfades the map frame (skeleton to canvas) at 200 ms; the ceiling and month changes dim the grid to 60% opacity for the frame the filter takes, never a spinner; the star toggles with the existing touch feedback. Every one has a reduced-motion branch. Files: `ExploreTab.jsx`, `FilterChips.jsx`, `62-v6-explore.css`. Command: animate. Done when each transition is under 300 ms on transform and opacity only (the craft detector and a grep for `transition:` in the v6 sheet).
5. Pins that feel live. The cheapest pin changes as the reader pans; the change is a 150 ms scale from 0.9 on the new cheapest, none under reduced motion. The card-pin ring (V3 item 10) uses the focus ring's shape in `--ink`, not the accent, so it never competes with the cheapest pin. Files: `ExploreMap.jsx`, `62-v6-explore.css`. Command: animate. Done when panning moves the emphasis without a flash of two emphasised pins.
6. Rails with position. The rail head gets the position in `--mono` ("1 to 4 of 12"), arrow keys page the strip when it has focus, scroll-snap on cards, per the rails rule Destinations proposes (T373 rule N4; Explore follows the accepted text). Files: `ExploreRails.jsx`, `62-v6-explore.css`. Command: polish. Done when a keyboard user pages a rail without a mouse.
7. Imagery consistency. Rail and grid photos share one aspect per row; a missing photo shows the existing flag-and-name placeholder, never a grey box; images keep their `sizes` and srcset (verify_explore's Wikimedia width check stays). Files: `ExploreRails.jsx`, `ExploreTab.jsx`, `src/components/HeroImage.jsx` (use only). Command: polish. Done when no row mixes ratios at 1280.

### V5: harden, adapt and polish

1. Tap targets. Card star, info button, search clear, "See all", rail arrows, country arrows and the "Score key" control at 44 px on a coarse pointer, 32 px allowed on a fine pointer only. Files: `62-v6-explore.css`. Command: adapt. Done when the Playwright scan counts zero interactive elements under 44 px at 380 inside `.explore-tab` (51 today).
2. Names that say the action. Chips named "Remove Good in May"; the shortlist chip "Shortlist, 2 places"; pins keep "Rome, Italy, scores 9.8 out of 10" and add the day cost. Files: `FilterChips.jsx`, `ExploreTab.jsx`, `ExploreMap.jsx`, i18n. Command: harden. Done when verify_keyboard's pin label and an axe pass on the chips show the verb.
3. A calmer keyboard walk. The preview opens on focus only after the focus has rested 400 ms or on Enter on the info control, so a Tab walk through 48 cards does not strobe. Files: `ExploreTab.jsx`. Command: harden. Done when verify_keyboard explore-grid shows no covered or invisible stops and the walk produces no preview without a pause.
4. Truncation and long words. Country names wrap to a second line in the split view instead of truncating to nothing; German and French labels in the input row fit at 360 px (shrink before truncate, as the bottom nav does). Files: `62-v6-explore.css`. Command: adapt. Done when the de and fr walk at 360 and 1280 shows every country name and every input label whole.
5. Map failure and offline. When the basemap style or tiles fail, the frame says so in one line and offers "Back to the list"; the list keeps working. Files: `ExploreMap.jsx`, i18n. Command: harden. Done when blocking the style URL in Playwright shows the line, not a blank frame.
6. Lifestyle panel issues found here go to its owner. The two terracotta selections (an active toggle is `--ink-fill`), the letter "x" close, the last row under the phone nav and the missing trade-off sentence belong to the Lifestyle surface, not Explore (row T372-b). Explore only checks that the door opens it with a scrim on both widths. Command: none here. Done when the row is claimed in V2's ownership map.
7. Clean-up. Delete the dead `.xgrid-count` rule if item V3.1 did not reuse it; fix the stale "modal sheet is gone" comment in `ExploreFilterRail.jsx`; fix the "3, 855" spacing in the sheet count (mono comma width, `PlacesFilterSheet.jsx`, through OWNERSHIP.md). Command: polish. Done when the design lint shows 0 new and the detector is clean on every changed file.
8. Harness updates. verify_explore asserts the count, rail prices, the input row and the popover; verify_map_size_cards asserts price labels and one cheapest pin; verify_shortlist follows the star's new box; each changed assertion carries a comment saying why. Files: `scripts/verify_explore.mjs`, `scripts/verify_map_size_cards.mjs`, `scripts/verify_shortlist.mjs`, `scripts/verify_keyboard.mjs` (only if a selector moved). Command: audit. Done when all five Explore harnesses pass against a preview build and verify_keyboard stays 20 of 20.

### Target state: every button and control on the surface

| Control | Today | Target | Wave |
|---|---|---|---|
| Search field and clear | Header (desktop), toolbar row (phone); clear under 44 px | Same places; phone row shared with Filters; clear 44 px | V3, V5 |
| Trip style tiles (9) and Reset | Panel tiles, phone strip, outside the filter state | First group of the rail and sheet; chips, badge, Clear all include them | V3 |
| Lifestyle door | Panel foot, phone toolbar | First cell of the input row, both widths | V3 |
| Budget ceiling | Missing (fixed €70 toggle) | Stepped select in the input row, URL `xb` | V3 |
| Month | Select in the Practical fold | Select in the input row, URL `xm` | V3 |
| No car needed | Toggle in the Practical fold | Toggle in the input row | V3 |
| Shortlist filter | Star and bare count | Labelled chip "Shortlist N" in the input row | V3 |
| Filters button (phone) | Own full-width row | Shares the search row; badge counts trip styles too | V3 |
| Live count | Missing | In the title line, mono | V3 |
| Grid/Map switch | Control bar (desktop), floating pill (phone) | Same; pill reserves space under the last card | V3 |
| Sort | Control bar, alone on a phone row | Beside the count | V3 |
| Size of place (5) | "Kind of place", open | Renamed, closed by default | V3 |
| How good (3) and Hidden gem | Open fold | Unchanged | none |
| What you do with it (4) | Unexplained | InfoDot per term | V3 |
| Not crowded, Near the sea, UNESCO | Practical fold | Unchanged | none |
| Under €70 a day | Practical fold | Removed (replaced by the ceiling) | V3 |
| Max travel time | Practical fold | Unchanged | none |
| Countries (39) and country page arrows | Country fold; arrows 32 px | Unchanged; arrows 44 px on touch | V5 |
| Fold counts | Terracotta badges | `--ink-fill` badges | V4 |
| Active chips and Clear all | Accent tint, name without verb | Paper chips, "Remove ..." names, trip styles included | V3, V4, V5 |
| Sheet close, Clear all, Show N places | As today | Unchanged; count spacing fixed | V5 |
| Tier key, How the score works, dismiss | One line; counts disagree with the grid | Same line; counts from the grid's rows | V3 |
| "?" pip | Bare "?" | "Score key" | V3 |
| Rail See all, arrows | Accent link 22 px; arrows on pointer | Ink link 44 px; arrows with mono position and arrow keys | V4, V5 |
| Rail cards | No price | Day cost in mono | V3 |
| First rail | Top-rated | Under €N a day in the month | V3 |
| More ways in and its doors | Fold of 5 chips | Unchanged | none |
| Card hit area | Opens the destination page | Unchanged | none |
| Card seal | On every tier 2 and 3 photo | Off on tier-filtered views and rails | V4 |
| Card star | 27 px on touch | 44 px on touch | V5 |
| Card info button | Fine pointer only | Fine pointer; touch uses a tap on the price | V3 |
| Card cost line | Line 2, no stand-in word | Price on line 1, "national" word and InfoDot where it applies | V3 |
| Card preview | Ink panel over the photo | Paper popover with month strip and cost bar | V4 |
| Map zoom, attribution, canvas | As today | Unchanged | none |
| Map clusters | Ochre stroke | `--ink-mute` stroke | V3 |
| Map pins | Tier dots, no price | Price labels from zoom 7, one cheapest pin in `--accent` | V3 |
| Map tip and pin card | Name and score | Plus the day cost | V3 |
| Keyboard pin layer | 30 stops | 30 stops, labels add the day cost | V3, V5 |
| Card to pin sync | Missing | Ring both ways | V3 |
| Map failure | Blank frame | One line and "Back to the list" | V5 |
| Empty result button | Clears every filter | "Remove <last filter>", Clear all secondary | V3 |
| Empty shortlist | No action | "Show all places" | V3 |
| Guides strip | Under the key | Unchanged (community surface) | none |
| Country banner | Above the grid | Unchanged | none |

## 7. Needs a rule

Each line is a proposal carta-design does not cover today, with the rule proposed. T380 accepts or rejects each one before anything in it is built.

N1. Input row on a browse page: one row under the page title holding, in this order, the Lifestyle door, a budget ceiling, the month and the car-free toggle, each showing its current value in words or `--mono` figures; secondary styling (`--rule` border, 6 px radius), the Lifestyle door keeping its `--accent-bg` tint as the one tinted control; on a phone one sideways-scrolling band of `--tap` height, never wrapping to a second row.
N2. Budget ceiling: a stepped select of fixed euro steps per person per day for the ground cost only (Any, 40, 60, 80, 100, 130), labelled "Up to €N a day", never a free slider and never including a flight; it filters, it does not re-price.
N3. Stand-in figure on a card: where a card's day cost includes a country-level figure standing in for a town measurement, the cost line carries the word "national" in `--ui` after the figure, with the InfoDot on its first occurrence per view; a modelled estimate keeps the tilde and "est."; a figure measured in the town carries no word.
N4. Price pin labels on a WebGL map: at zoom 7 and above, at most 30 labelled pins (the keyboard layer's set) as DOM labels, name `--ui` 12 px and figure `--mono` 12 px on `--bg-card` with a `--rule` border and 6 px radius; the cheapest in view is `--accent` with `--on-fill` text; other pins stay dots; clusters are `--paper-dim` with an `--ink-mute` stroke, never `--rate`.
N5. List to map highlight: a card in focus or under the pointer rings its pin with a 2 px `--ink` ring, and a pin in focus or under the pointer outlines its card with a 2 px `--ink` outline; never `--accent`, so the cheapest pin stays the one emphasis.
N6. Card preview popover: a hover or tap preview of a browse card is a popover beside or over the lower half of the card, `--bg-card`, `1px solid var(--rule)`, 10 px radius, `--shadow-2`, at most 320 px wide; it never covers the card's photograph and never uses an ink fill; it opens on hover after 150 ms, on focus after 400 ms, on Enter or tap at once, and closes on Escape.
N7. Cost gauge colours: the five-segment day-cost gauge fills in `--ink`, with the cheapest band allowed `--green` as good news in data; `--accent` never marks a price band, because terracotta means an action or an alert.
N8. Cost-led rail: on a browse page the first rail may be a cost cut ("Under €N a day in <month>"), sorted by day cost with country interleave, its N taken from the traveller's ceiling or, without one, the cheapest third of the catalogue; it follows the rail grammar T380 settles from T373's N4.

## Files the build waves will touch

App repo: `src/browse/ExploreTab.jsx`, `src/browse/ExploreMap.jsx`, `src/browse/ExploreRails.jsx`, `src/browse/ExploreFilterRail.jsx`, `src/browse/TierLegend.jsx`, `src/browse/CategoryRail.jsx`, `src/browse/LifestyleButton.jsx` (shared with Destinations and the account hub, through OWNERSHIP.md), `src/browse/FilterChips.jsx` (shared with Destinations), `src/browse/PlacesFilterSheet.jsx` (shared, count spacing only), `src/browse/CostBar.jsx` (use only), `src/components/CostSummary.jsx`, `src/components/InfoDot.jsx` (use only), `src/components/MonthStrip.jsx` (use only), `src/components/HeroImage.jsx` (use only), `src/components/FavStar.jsx` (only if the card star adopts it), `src/components/FareProvenance.jsx` (not drawn on Explore today; touched only if a typed fare ever reaches a card, which this brief does not plan), `src/map/pinKeys.js`, `src/map/tokenColors.js` (only for a new mirrored token), `src/lib/glossary.js`, `src/styles/62-v6-explore.css` (created by T380), `src/styles/15-map-overlays.css`, `src/styles/26-shortlist-extras.css` (star rules), `src/styles/24-destination-workspace.css`, `src/styles/25-feature-pages.css` and `src/styles/46-owner-calls.css` (old Explore rules retired into the v6 sheet, never duplicated), `src/styles/45-empty-states.css` (the explore empty rules), the six `src/i18n/*.js` catalogues, and the harnesses `scripts/verify_explore.mjs`, `scripts/verify_map_size_cards.mjs`, `scripts/verify_shortlist.mjs`, `scripts/verify_fare_provenance.mjs` (run, unchanged), `scripts/verify_keyboard.mjs` (selectors only). Not touched: `src/browse/LifestylePanel.jsx` (the Lifestyle surface's; row T372-b), `src/community/GuidesStrip.jsx`, `src/browse/CountryPage.jsx`, the shell's header and bottom nav.

## Direction check (T380, V2)

What `docs/design-v6/DIRECTION.md` changes in this plan. All eight rules N1 to N8 are accepted, N1 as amended: the input row (V3-3) is the shell's settings line (origin, dates, party, Lifestyle, language, "Prices in EUR") followed by Explore's own ceiling, month and car-free controls in the same band, and the Lifestyle door has no `--accent-bg` tint, so the only accent on an idle grid is the cheapest pin and the view's primary. N5's ink ring is the house map-sync rule and the destination page follows it too. The month input the surface reads comes from the settings line's dates (or its own month select, N1), and the chosen month is outlined on the preview's month strip (V4-2) as the month rule says. Motion in V4-4 and V4-5 takes `--dur-1` (chips, the cheapest pin's scale), `--dur-2` (the count settling through `settleFigure()`, the grid dimming) and `--dur-3` (the grid to map crossfade); the preview popover opens in `--dur-1`. OWNERSHIP.md gives this surface `CostSummary.jsx`, `CategoryRail.jsx`, `CountryPage.jsx` and `15-map-overlays.css`; `pinKeys.js` stays shell's (four maps use it), `FilterChips.jsx` is shell's, `PlacesFilterSheet.jsx` is destinations' (the count spacing fix in V5-7 is a hand-off to T384), and `MonthStrip.jsx` is shell's and is used as it is.
