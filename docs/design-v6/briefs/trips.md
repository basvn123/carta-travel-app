# Design brief: Trips, the journeys library and the trip page (key 'trips')

Written by T376 in design wave V1, 2026-10-08. This is the brief that V3, V4 and V5 build the trips surface from. It plans; it builds nothing. App paths are in the app repo and are written as `src/...`. OWNERSHIP.md (written in V2 by T380) is the authority on who may edit a shared file; where this brief names a file another surface also draws, it says so.

The surface has three parts. The library: the Trips category of the Destinations tab (`src/browse/JourneysSection.jsx`, 403 lines), ten style cards, a style's trip list and its length, cost and tag filters (`src/browse/TripFilters.jsx`). The journey page: one written week (`src/browse/JourneyPage.jsx`, 1,158 lines) with the suitability strip, the week shape, the day track, the booking order, the flashcard decks, the pack grid, the cost receipt and the Lifestyle slider, the sticky section rail and the exits. The composed route page: `src/browse/TripPage.jsx` (754 lines), the priced 2 to 14 day city routes behind the library's last door, which the trip planner also opens (the planner brief, T377, leaves this page to this surface). The library holds 253 journeys in 10 styles across 39 countries (`public/journeys/index.json`, read 2026-10-08).

One correction to the task text: the journey page has no `#trip=<id>` link. `#itin=<id>` opens the composed route page (`src/lib/trips.js` readTripFromUrl); a journey page is component state in `src/browse/DestinationsTab.jsx` (`pageJourney`, line 803) and `/journeys/<id>` boots no hash (`src/lib/urlScheme.js` pathToLegacyHash has no journey case). That gap is finding P1-4 below.

## 1. Setup and mode

Impeccable context was run once from the root worktree with a relative target (`impeccable context --target src/browse/JourneyPage.jsx`). It loaded PRODUCT.md and DESIGN.md from the root worktree and reported `targetExists: false` and no surface brief, because the sparse root worktree has no app tree; the app files were read from the main checkout, read-only. Its directives were followed: the detector was run once over the surface files (Assessment B), and the AUTONOMY_DIRECTIVE_CHECK is answered by the owner's instruction of 2026-10-07 to proceed without asking. No decision page, live mode or question tool was opened. The references read were critique.md, audit.md, shape.md and operate.md, with the carta-design skill, `docs/design-v6/TRIP-PLANNING-RESEARCH.md` and the explore, destinations, shell and trip planner briefs already merged in V1.

Where impeccable would have asked, the brief took the option that keeps Carta's palette, type and identity. Shape's discovery questions were answered from the research and PRODUCT.md (who: one budget traveller, hiker first, planning one holiday; outcome: a week they can afford and keep). Critique's closing questions are skipped (unattended run); the choice of what to fix first follows the severity order of part 4. This is refinement, not redesign.

Mode: **Operate, with Read inside it.** The traveller here is doing a task: choosing one week out of 253 and then preparing it (what it costs, what to book and when, what to pack, what could go wrong). That is operate.md's world: scanability, consistent controls, motion only for state, density where it helps. The page also carries long authored prose (the days, where to sleep, the advisories), and for those blocks operate.md's Read notes apply: a readable measure, prose behind disclosure, nothing set in mono. Persuade is rejected: the style grid leans toward a magazine today, and part of this brief is pulling it back to a priced list.

## 2. The walk

The traveller is the one in TRIP-PLANNING-RESEARCH.md: no fixed destination yet (59% start undecided), value for money first (3 in 5 Europeans), then the month (74% weigh weather), then whether it works without a car (hikers, the launch audience; the one-hour connection is their limit). They want a week to keep and come back to. The walk ran with Playwright at 380 x 800 and 1280 x 800, from a cold start (empty storage) and a returning visit (the short trip length remembered), through four journeys: a hiking week (Stubai Hoehenweg hut circuit), a cycling week (Donauradweg), a city week (Vienna) and a beach week (the Hossegor surf week). The shared dev server hung for most of the session; the phone walk ran on a private Vite on port 5207 started from the main checkout and stopped afterwards, the desktop and returning walks on the shared server once it recovered.

Cold start, phone (V1-styles-380). The app opens on Destinations with Trips selected. Under the category tiles, the search field and the country select, ten photo cards two abreast, each a white Fraunces name on a dark gradient scrim and a trip count. No price, no length, no season. Hiking, the launch audience's style, is sixth of ten. Names over snow and pale rock are hard to read ("Trail running", "Hiking and alpine trekking"). At the end of the grid sit the composed-routes door ("Composed itineraries of 2 to 14 days, priced from your airport", though Carta does not price flights) and an honest line: "253 trips in 39 countries, across 10 styles. Coverage is uneven: 19 of the 39 countries have fewer than half of the styles".

A style's list, phone (V1-list-380). "Trip styles" back pill (100 x 29 px), the heading with "24 trips", then the filter card: Trip length as two full-width buttons, Cost as four full-width buttons ("Any cost", "Under €1,050 16", "€1,050 to €1,350 5", "Over €1,350 3"), then up to thirteen tag buttons. The first trip card starts at 804 px, below the 800 px screen. The cost row arrives only after the whole library has loaded (`loadAllJourneyCards`), so on a warm load the list first shows the card at 594 px and then pushes it down. The trip card itself is good: title, flag, country, then "7 days", "€780 to €1,250", "Demanding", the months. "Clear filters" resets the trip length to the whole week as well as the cost band (`JourneysSection.jsx` clearFilters, line 270), so a traveller who chose the short version loses it by clearing a price.

The journey page, phone (V1-page-380). A back bar naming the style, a location row (an outbound link to directions when the pin is real), the title, four chips ("Hiking and alpine trekking", "7 days", "€€", "Demanding"), the length picker with two full-width buttons and a sentence, the hook line, the not-for block. The hero photograph starts at 668 px and the suitability strip, the only price near the top, at 900 px. The first screen carries no price figure at all; the only euro signs are the "€€" chip. The same holds at 1280 (V1-page-1280): the page is a 688 px column, the hero starts at 449 px and the strip at 907 px. "7 days" is said four times before the photo.

Down the page (page-2, week, days, booking, decks, pack, exits; scratch set). Eighteen sections, of which the sticky rail names six (Why, Costs, Days, Sleep, Know, Pack). "The week at a glance" is a definition list with the month strip, budget, per day, difficulty, crowds, family, car, gateway, languages. "How the week runs" says "One base all week, in Neustift im Stubaital" on a hut-to-hut circuit, and every day card under it says "Base: Neustift im Stubaital" under a title that ends at a hut. "If the weather turns" closes with the summary "Fallback for 0 of 7". The day track (V1-days-380) meets the T362 rule: "Day 1 of 7" in mono, Previous and Next, a snap row, dots. Its stat line sets prose in mono ("12 km, 1,300 m ascent, negligible descent, 4.5-5.5 hours. Grade T2-T3, forest track then open alpine path"). The booking order turns the hut window into one checkbox ("6-12 mo", "0 of 1 booked"). The decks work (V1-decks-380: "1 of 7", Previous, Next, Show all). The pack grid shows 18 cells, five of them labelled "Day pack", one of which is the hut sleeping liner the trip calls mandatory. The page ends on "Price a trip to Innsbruck", three exits ("If this is too hard", "If you want this for less", "Same country, another way") and the sources.

The money (V1-receipt-380, V1-receipt-1280). "What the week costs" is not the trip's budget. Because a priced catalogue town lies within reach, the fold renders the first-run receipt for Innsbruck: 2 people, Entire place, 7 to 14 November, "~ €1,424.44 est.", "€712.22 each", with the primary "Set your dates" and "Add your fare". The strip and the facts above say "€850 to €1,200" per person for the week; Where to sleep prices huts at €90 to €160 a night; the huts close before November. Three figures for one week, on one page, that cannot be reconciled, and the lowest one is under the trip's own floor. The authored breakdown, its cost bar and the Lifestyle slider exist only in the fallback branch (`JourneyPage.jsx` 841 to 896) and did not render on any of the four trips walked. The receipt's own Stay select becomes a second lifestyle control. The same happened on the city week (Vienna) and the beach week (priced at Biarritz). On desktop the date inputs clip ("07/11/202").

Returning visit (scratch returning-380). The short length is remembered: the list cards read "3 days, €334 to €536". The page opens where the reader last chose. Nothing says the week was seen before, nothing is saved, and the page has no address: the URL does not change when a journey opens (it stayed `?tab=places&...` through every page in the walk), so a reload, a shared link or a bookmark returns to the list.

Where the traveller is sent away: to another site to keep the week (no save, no share, no link), to a map app for where the days go (no map on the journey page, though the composed route page has one), to the hut association's portal with only a lead time in hand, and back into the Destinations list to compare two weeks (no compare).

Before screenshots, saved outside both repos at `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\trips\`: V1-styles-380, V1-list-380, V1-page-380, V1-days-380, V1-decks-380, V1-styles-1280, V1-page-1280, V1-receipt-1280 (.jpg, quality 80, viewport only). Build waves save their after set under the same view names.

## 3. Inventory

One row per view, state, control and visual setting. File is the file that draws it (`src/` omitted). Verdicts: keep, move, merge, remove, rework.

### Views and states

| # | Item | What it does | Where | File | Verdict |
|---|---|---|---|---|---|
| S1 | Style grid | Ten style cards, then the composed door and the coverage line | Trips category at rest | browse/JourneysSection.jsx | rework: a priced front door (V3.1) |
| S2 | Style grid loading | A bare "…" | List | JourneysSection.jsx 272 | rework: skeleton cards at final size |
| S3 | Style grid load error | ErrorBlock with retry | List | JourneysSection.jsx 288 | keep |
| S4 | Style grid empty for a country | Sentence and "Show all countries" | List | JourneysSection.jsx 280 | keep |
| S5 | Style list | Heading, count, filters, trip cards, credit | Style open | JourneysSection.jsx 324 | rework: first card on screen one |
| S6 | Style list loading | A bare "…"; no catch on `loadJourneyType`, so a failed fetch stays "…" forever | List | JourneysSection.jsx 217, 359 | rework: skeleton and ErrorBlock with retry |
| S7 | Style list empty: filters | "No trip matches" and Clear filters | List | JourneysSection.jsx 366 | rework: name the filter, keep the length |
| S8 | Style list empty: country | Three nearest weeks across the border, Show all countries | List | JourneysSection.jsx StyleCountryEmpty | keep |
| S9 | Style list empty: search, type | Clear search; back to styles | List | JourneysSection.jsx 384 | keep |
| S10 | Journey page | The written week | Full-screen dialog | browse/JourneyPage.jsx | rework (part 6) |
| S11 | Journey page loading | Back bar and "…"; no catch on `loadJourney` | Dialog | JourneyPage.jsx 387, 595 | rework: skeleton, ErrorBlock |
| S12 | Journey gone | "This trip is no longer published" and a button | Dialog | JourneyPage.jsx 609 | keep |
| S13 | Composed route page | Map, route, practical, days, cost, why, checks, gallery | Full-screen dialog | browse/TripPage.jsx | keep structure; align with S10 (V3.11) |
| S14 | Composed route list | Day slider and composed cards | Trips category, composed door | browse/DestinationsTab.jsx (destinations surface) | keep (other surface) |
| S15 | Page address | Missing for journeys; `#itin=` for composed routes | URL | DestinationsTab.jsx 803, lib/urlScheme.js | add for journeys (V3.4) |

### Controls: the library

| # | Item | What it does | Where | File | Verdict |
|---|---|---|---|---|---|
| L1 | Style card (10) | Opens a style's list | Grid | JourneysSection.jsx StyleCard | rework: from-price and length, caption band not scrim |
| L2 | Composed door | Opens the composed routes | Grid end | JourneysSection.jsx 296 | rework: drop "priced from your airport", no icon tile |
| L3 | Coverage line | 253 trips, 39 countries, uneven coverage | Grid end | JourneysSection.jsx 304 | move: under the grid head, it answers "is this everything" |
| L4 | Back to styles pill | Leaves the list | List head | JourneysSection.jsx 328 | rework: 44 px, a link-style back |
| L5 | Style heading and count | "Hiking and alpine trekking 24 trips" | List head | JourneysSection.jsx 332 | keep; count in mono |
| L6 | Length toggles (2) | Whole week or short version | Filter card | browse/TripFilters.jsx 36 | rework: one segmented control, same order as the page |
| L7 | Cost band toggles (4) with counts | Any, under, between, over | Filter card | TripFilters.jsx 50 | rework: into a Filters sheet with its summary in the bar |
| L8 | Tag toggles (up to 13) with counts | One tag at a time | Filter card | TripFilters.jsx 66 | move: into the same sheet |
| L9 | Filter note and Clear filters | "Totals are per person..."; clears band, tag and length | Filter card foot | TripFilters.jsx 85 | rework: Clear leaves the length alone |
| L10 | Car-free filter | Missing | none | none | add (V3.3) |
| L11 | Month filter | Missing; card shows months only as text | none | none | add (V3.3) |
| L12 | Sort | Missing; order is the file order | none | none | add: cost, length of walking, A to Z (V3.3) |
| L13 | Trip card | Opens the journey page | List | JourneysSection.jsx JourneyCard | rework: caption band, per-person label, save star |
| L14 | Search and country (shared) | Narrow the styles and the list | Tab toolbar | DestinationsTab.jsx (destinations surface) | keep |
| L15 | Credit line | "Written by the Carta content lab" | List end | JourneysSection.jsx 399 | keep |

### Controls: the journey page, top

| # | Item | What it does | Where | File | Verdict |
|---|---|---|---|---|---|
| P1 | Back (style name) | Closes the page | Page bar | JourneyPage.jsx 662 | keep; 44 px (34 px today at 1280) |
| P2 | Bar title | Title once the head scrolls away | Page bar | JourneyPage.jsx 666 | keep |
| P3 | Save star | Missing | Page bar | none (components/FavStar.jsx exists) | add (V3.4) |
| P4 | Share | Missing (the composed page has one) | Page bar | none | add (V3.4) |
| P5 | Location row | Region, coordinates, outbound directions link when the pin is real | Above the title | JourneyPage.jsx 679 | move: under the strip as a fact line; coordinates in the facts |
| P6 | Title with flag | h1 | Head | JourneyPage.jsx 705 | keep |
| P7 | Chips (style, days, €€, difficulty) | Repeat the strip | Head | JourneyPage.jsx 709 | remove: the strip says it (one style chip may stay) |
| P8 | Length picker (2) and note | Short version or whole week | Head | browse/LengthPicker.jsx | rework: compact segmented control beside the strip's cost |
| P9 | Hook line | One authored sentence | Head | JourneyPage.jsx 723 | keep; fix the p inside p |
| P10 | Not-for block | Who the week is not for | Head | components/NotFor.jsx | move: under the strip; drop the generic fallback line |
| P11 | Hero photograph and credit | Photo, credit link | Head | JourneyPage.jsx 736 | rework: above the fold, shorter on desktop |
| P12 | Suitability strip | Difficulty, style, total cost | Under the hero | browse/DetailSkeleton.jsx DetailStrip | keep; add "a person" to the cost cell |
| P13 | Sticky section rail | Six anchors, ink-fill pill on the current one | Under the bar | browse/SectionRail.jsx | rework: cover every section group (V3.6) |

### Controls: the journey page, sections

| # | Item | What it does | Where | File | Verdict |
|---|---|---|---|---|---|
| F1 | Fold headers (18 sections) | Open and close | Page | browse/Fold.jsx (shared) | merge: 18 into 7 groups (V3.6) |
| F2 | Why this trip | Hook rest, summary, tags | Fold | JourneyPage.jsx 750 | merge into the head (tags) and Know |
| F3 | The week at a glance | Facts, month strip, difficulty meter, gateway list | Fold | JourneyPage.jsx 780, components/MonthStrip.jsx, components/FactMeter.jsx | rework: becomes the "Fit" group, three rows lead |
| F4 | Month strip info button | An "i" in a circle opens the season note | Facts | components/MonthStrip.jsx 81 | rework: InfoDot |
| F5 | The climb / surface and traffic | Week profile, mix bar, traffic bar | Fold | browse/JourneyRoute.jsx, browse/RouteFigures.jsx | keep; ink ramp, not accent (V4.3) |
| F6 | What the week costs | First-run receipt for the nearest town, or the authored breakdown | Fold | JourneyPage.jsx 820, components/FirstRunReceipt.jsx | rework: the trip's own receipt first (V3.2) |
| F7 | Receipt inputs (people, stay, arrive, leave) | Reprice the town receipt | Receipt | FirstRunReceipt.jsx 368 | rework: people and dates stay; stay select replaced by the one Lifestyle control |
| F8 | Set your dates (primary) | Opens the date fields | Receipt | FirstRunReceipt.jsx | keep as the page's one primary |
| F9 | Add your fare | Traveller's own fare | Receipt | FirstRunReceipt.jsx | keep |
| F10 | Cost bar | Authored breakdown as a stacked bar, tap a segment | Above the breakdown | browse/CostBar.jsx | keep; renders on every trip once V3.2 lands |
| F11 | Lifestyle slider | Stay tier stops, trade-off sentence | Under the breakdown | browse/LifestyleSlider.jsx | keep; renders on every trip once V3.2 lands |
| F12 | Report this price | Report a wrong price | Receipt foot | components/ReportProblem.jsx | keep; 44 px |
| F13 | By train instead | Rail alternative from the origin | Receipt foot | JourneyPage.jsx 899 | move: a line of the trip's cost, labelled not in the total |
| F14 | The data sheet | Type-specific rows | Fold | JourneyPage.jsx 916, lib/dataSheet.js | merge into Fit |
| F15 | How the week runs | Effort bars, beds strip, summary | Fold | browse/WeekPlan.jsx | rework: the day-selector map joins it (V4.1); fix the one-base claim |
| F16 | Arrive and leave | Day zero and the day after | Fold, closed | WeekPlan.jsx | move: open, inside Getting there |
| F17 | If the weather turns | Fallbacks per day | Fold | WeekPlan.jsx | rework: hidden when no day has a fallback |
| F18 | Day track | Day cards, Previous, Next, position, dots | Day by day | browse/DayTrack.jsx | keep |
| F19 | Day card and "More about this day" | Stats, night or base, prose behind a disclosure | Track card | JourneyPage.jsx Day | rework: stats words in sans, figures in mono; 44 px disclosure (26 px today at 1280) |
| F20 | Day photo | Day's own photograph | Day card | JourneyPage.jsx DayPhoto | keep (no trip carries one yet) |
| F21 | Where to sleep | Stays with price and booking line | Fold | JourneyPage.jsx 982 | keep; prices read as ranges |
| F22 | Read more / show less | Long stay prose | Stay card | JourneyPage.jsx LongProse | keep |
| F23 | Book in this order | Checklist, ticks saved on the device, progress | Fold | browse/BookingOrder.jsx | rework: 44 px rows, a date per step from the chosen month |
| F24 | Good to know deck | Logistics as flashcards | Fold | browse/FlashDeck.jsx | keep |
| F25 | Pro tips deck | Tips as flashcards | Fold | FlashDeck.jsx | keep |
| F26 | Deck controls: Previous, Next, position, Show all | Move and list | Deck | FlashDeck.jsx | keep |
| F27 | What to pack grid | Icon cells, tap shows why | Fold | browse/PackGrid.jsx, lib/packGrid.js, components/PackIcons.jsx | rework: written items first, no "Day pack" fallback name, translated labels |
| F28 | What could go wrong | Risk deck, never folded | Section | JourneyPage.jsx 1067 | keep |
| F29 | Verify note | Count of figures to re-check | Before the exits | JourneyPage.jsx 1080 | keep |
| F30 | Price a trip to the gateway town | Opens the destination page | Page end | JourneyPage.jsx 1089 | rework: label says where it goes ("Prices in Innsbruck") |
| F31 | Three exits | Easier, cheaper, nearby week | Page end | browse/DetailSkeleton.jsx DetailExits | keep |
| F32 | Sources and figure footer | Ledger split, vintage, photo link, detail, credit | Page end | JourneyPage.jsx 1117 | keep; one photo credit, not two |
| F33 | Map of the week | Missing | none | none (T177-b track wire pending) | add (V4.1) |
| F34 | GPX for the week | Missing (30 of 253 trips gpxReady, rows T206-f, T176-a) | none | none | not in this plan (waits on T177-b) |

### Controls: the composed route page

Read from source only; the walk did not open it (its harness, verify_trip_page, needs a build).

| # | Item | What it does | File | Verdict |
|---|---|---|---|---|
| C1 | Back, bar title, Share | Page bar | browse/TripPage.jsx 296 | keep; 44 px |
| C2 | Photo hero with text over a gradient scrim, themes, countries, score | Head | TripPage.jsx 316 | rework: caption band under the photo, no text on the photo (rule R2) |
| C3 | Fact row (days, nights, stops, getting there, per day, season) | Head | TripPage.jsx 375 | keep; mono figures |
| C4 | Choose this trip / Open in planner | Primary | TripPage.jsx 390 | keep as the one primary |
| C5 | Save star | Head | components/FavStar.jsx | keep |
| C6 | Route fold: map, numbered stops, Open place, around | Fold | TripPage.jsx 407, map/TripMap.jsx | keep; dot separators to commas |
| C7 | Practical fold | Fold | browse/TripPractical.jsx | keep |
| C8 | Days fold with "More about this day" and day photos | Fold | TripPage.jsx 513, browse/TripDayPhotos.jsx | keep; move to the day track for one grammar (V3.11) |
| C9 | Day trips fold | Fold | TripPage.jsx 531 | keep |
| C10 | Cost fold | Stay, travel, per day | TripPage.jsx 573 | rework: receipt grammar, tilde on estimated legs |
| C11 | Why, checks, gallery folds | Folds | TripPage.jsx 601 to 668 | keep |

### Visual settings

| # | Setting | Today | File | Verdict |
|---|---|---|---|---|
| V1 | Style and trip card scrim | Dark gradient behind white text on the photo | styles/23-places-pages.css (places-card-scrim, shared with Destinations) | rework: paper caption band under the photo (rule R2) |
| V2 | Composed door icon tile | 40 px paper-dim rounded tile behind a line icon | styles/25-feature-pages.css (jcomposed-icon) | remove the tile (never-do 1) |
| V3 | Filter buttons | Full-width stacked under 400 px | styles/43-trip-length.css | rework: segmented control and sheet |
| V4 | Fold icons | Terracotta on every section header | styles/25-feature-pages.css (dsec-icon) | rework: `--ink-soft` (rule R6) |
| V5 | Day number | Ochre (`--rate`) | styles/25-feature-pages.css (jpage-day-n) | rework: `--ink-soft`; ochre is for ratings |
| V6 | Day stats line | Whole line in mono, prose included | styles/25-feature-pages.css (jpage-day-stats) | rework: figures mono, words sans |
| V7 | Elevation humps | Accent fill and stroke on drawn, unmeasured shapes | styles/23-places-pages.css (shared with outdoor pages) | rework: ink ramp; accent only for the selected day |
| V8 | Source and credit links | Terracotta text | styles/23-places-pages.css | rework: `--ink` underlined |
| V9 | Beds strip move marker | 2 px ink left border (detector side-tab) | styles/25-feature-pages.css 4081 | rework: a word or a gap, not a side stripe |
| V10 | Month strip good months | `--green` tint | styles/23-places-pages.css | keep (data, not chrome) |
| V11 | Section rail | Paper band, ink-fill current pill | styles/34-section-rail.css | keep |
| V12 | Day track | Snap row, 85% card on phone, dots | styles/32-day-carousel.css | keep |
| V13 | Flashcards | Square-cornered deck card, transform transition with reduced-motion branch | styles/33-flashcards.css | keep |
| V14 | Lifestyle slider | Stepped range, words under stops | styles/35-lifestyle-slider.css | keep |
| V15 | Cost bar | 8 px ink-ramp segments | styles/36-cost-bar.css | keep |
| V16 | Page column | 688 px at 1280, hero 521 px tall | styles/25-feature-pages.css (bpage) | rework: two-column desktop (V3.7) |
| V17 | Composed page dot separators | `.itin-dot` between facts | styles/24-destination-workspace.css | remove (banned separators) |

Count before: 15 view and state rows, about 75 control types across the three parts (the 10 style cards, 13 tag buttons and 18 folds counted once each), 18 sections on the journey page of which 6 are on the rail, 0 price figures on the first screen of the journey page at 380 and at 1280, and a page of 5,473 to 6,492 px at 380 (about 7 to 8 screens) and 4,882 to 5,665 px at 1280, measured on the four walked trips.

## 4. Critique and technical audit

Method: dual-agent, as critique.md requires. Assessment A (design review) and Assessment B (detector and lint) ran as two isolated sub-agents and met only here. A worked from the source and the scratch screenshots without a browser, to keep the laptop to one browser.

### Design health

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Loading is a bare "…" and a failed style or journey fetch never resolves (no catch, JourneysSection.jsx 217, JourneyPage.jsx 387); "Fallback for 0 of 7" |
| 2 | Match with the real world | 2 | A hut circuit reads "One base all week" (lib/weekShape.js); it is priced as an apartment in Innsbruck in November |
| 3 | User control and freedom | 2 | No address for a journey: reload, back or Escape drops the reader with no way back; Clear filters also resets the length |
| 4 | Consistency and standards | 1 | Two trip pages with two grammars (map, share and star on the composed one only); length order flips between list and page; some folds are h2, some bare buttons |
| 5 | Error prevention | 2 | The receipt seeds Carta's default dates (November) for a July to September trip and prices 7 nights for 7 days |
| 6 | Recognition rather than recall | 2 | Cost in five forms that disagree ("€€", strip range, facts range and per day, receipt per party, stay lines per night) |
| 7 | Flexibility and efficiency | 2 | Good keys on the track and decks; no link, save, share, sort or compare |
| 8 | Aesthetic and minimalist design | 2 | 18 sections; "7 days" four times above the photo; the credit twice; 82% of pack cells derived filler |
| 9 | Error recovery | 1 | The ErrorBlock and "gone" paths are unreachable for the list and the page |
| 10 | Help and documentation | 2 | No InfoDot on the page for "€€", "T2-T3", "national figure", "est."; the not-for block, verify note and ledger footer are good help |
| Total | | 18/40 | Poor, one point under Acceptable |

Cognitive load: 6 of 8 checklist items fail (single focus, chunking, visual hierarchy, one thing at a time, minimal choices, working memory); grouping and progressive disclosure pass. Decision points over four options: style grid 10, list filters 2 + 4 + up to 13, the page's 18 fold toggles, the rail's 6, the pack grid's 16 to 24 cells, the receipt's 12-option people select.

Design specificity: split. The page body is authored for Carta: the suitability strip, the receipt with its tilde and "national figure" line, the not-for block, the figure ledger, the coverage sentence and "By train instead, about €105 each way" could only be Carta. The front door and the page skeleton are not: ten photo tiles with white serif type on a gradient scrim read as any travel magazine (and the gradient breaks the never-do list), and a stack of eighteen accordions is the generic everything-folds pattern. The research's own trip-page idea, a day selector over one map, is missing from the journey page while the composed route page has a map.

Emotional journey: a peak at the style grid (photographs, honest coverage line); a valley at the list, which opens as a form; a lift at the page head (a specific hook, an honest not-for); then the deepest valley at the price, the trust moment the product exists for, where the receipt contradicts the strip. The page ends on small-print sources with nothing in hand: no save, no link, no next step for the week.

### Priority issues

[P1] The cost fold prices a different trip from the one on the page. When a catalogue town is near, "What the week costs" is the first-run receipt for that town (`JourneyPage.jsx` 833 to 840): 2 people, Entire place, Carta's default dates, `nights={viewDays}`. On the hut circuit it reads ~€1,424.44, €712.22 each, in November, beside a strip of €850 to €1,200 a person and huts at €90 to €160 a night (V1-receipt-380, V1-receipt-1280). The authored breakdown, the cost bar (T362) and the one Lifestyle control live only in the fallback branch and did not render on any of the four trips walked; the receipt's Stay select is a second lifestyle control against T362. This is the trust failure PRODUCT.md is written against. Fix: the trip's own itemised receipt leads (bar, lines, est marks, Lifestyle slider, total a person and for the party); the town receipt becomes a labelled second view ("A week based in Innsbruck instead") for base-camp trips only; dates seed from the first good month; nights are days minus one. Commands: clarify, harden.

[P1] The phone's first screen holds neither a trip nor a price. On the list the first card is at 804 px because the filters stack as full-width buttons (`styles/43-trip-length.css` under 400 px); on the page the hero is at 668 px and the strip with the cost at 900 px, below the chips, the length picker, the hook and the not-for block (V1-list-380, V1-page-380). At 1280 the strip is at 907 px. Value for money is the first criterion (research section 2). Fix: one filter row (length as a segmented control, everything else in a Filters sheet with its summary); on the page title, photo, strip, then the rest. Commands: layout, adapt.

[P1] Generated summaries contradict the authored week. "One base all week" on a hut circuit and "Base: Neustift" on every day (`lib/weekShape.js`, JourneyPage.jsx 971); "Fallback for 0 of 7" (`WeekPlan.jsx`); the hook picker can lead with an orphan clause (the surf week); "Day pack" as the name of 307 of 4,048 pack cells across 253 trips, repeated within 42 trips, including the mandatory hut liner (`lib/packGrid.js` 51 and 225; counted with packCells over the wire); 3,333 of the 4,048 cells are derived filler, not written items (verify_pack_grid). Each alone is small; together they teach the reader that the page's own summaries cannot be trusted, and that doubt lands on the prices. Fix: a summary speaks only when it agrees with the authored text and is silent otherwise (rule R7). Command: harden.

[P1] A week the traveller cannot keep, send or reload. No URL (`DestinationsTab.jsx` 803), no save star, no share, no map; the whole page is an aria-modal dialog, so Escape closes the week and nothing brings it back. The research calls saving and returning the spine of the product, and a one-holiday planner works across days and devices. Fix: a `#journey=<id>` address through the existing boot readers, FavStar and Share in the page bar as the composed page has them, `.catch` on both loads with ErrorBlock and retry. Commands: harden, onboard.

[P2] Accent, ochre and mono spent off rule. Terracotta on every fold icon, the location pin, source and credit links, the drawn elevation humps and fold titles on hover; ochre on the day number; mono on prose (the day stats words, "0 of 1 booked", "€€" inside the mono budget fact, the "7 days" chip, the band labels); a gradient scrim on every library card and the composed hero; banned dot separators on the composed page. When the accent marks every header, "Set your dates" loses its signal. Fix: per V4.3 and V5. Commands: quieter, typeset.

Persona red flags, in short. Casey on a phone: the first trip at 804 px; no price on the page's first screen; the "Trip styles" pill 29 px high; interrupted, the week is lost. Sam on a keyboard and screen reader: the hook nests a `p` in a `p` (Vite logs validateDOMNesting); "How the week runs", "Arrive and leave", "If the weather turns" and "Book in this order" are not headings while their siblings are h2; five pack buttons share the name "Day pack"; the strip says "€850 to €1,200" without "a person". Jordan the first-timer: "€€", "T2-T3", "national figure" and "est." unexplained; "3 or 4 days" on the list and "3 days" on the page, in opposite button order; "Price a trip to Innsbruck" opens another product without saying so. The budget hiker planning one holiday car-free: no car-free filter; "Car needed" only deep in the facts; "Arrive and leave" folded; the cost they budget from is the apartment, not the huts; the 6 to 12 month hut window is one checkbox with no date.

Minor: the hero credit twice (JourneyPage.jsx 747 and 1135); the short version renumbers days from 1, so "Day 1" of the short version is not Day 1 of the written week while Where to sleep and the booking order still speak of the written days; the style grid order does not lead with hiking; at 1280 the tenth style card sits alone on its row; the composed door promises "priced from your airport" though Carta does not price flights (journey.composedSub); the level-one difficulty word on the city week is on carta-design's banned list; the composed cost fold totals a per-day figure and its leg costs carry no tilde; the date inputs clip at 1280. Known and already owned elsewhere, not re-raised: the "€90, €160 per night" comma ranges and the shared Schoenbrunn hero on the Vienna and Donauradweg weeks wait on the journeys wire rebuild (rows T085-a, T091-a); the week track and GPX wait on T177-b (rows T177-b, T206-f).

### Detector and lint (Assessment B)

`impeccable detect --json` over the 18 surface markup files (JourneysSection, JourneyPage, TripPage, TripPractical, TripDayPhotos, DayTrack, FlashDeck, PackGrid, WeekPlan, BookingOrder, CostBar, LifestyleSlider, SectionRail, TripFilters, LengthPicker, JourneyRoute, NotFor, PackIcons): exit 0, no findings. Over the seven surface stylesheets (25, 32, 33, 34, 35, 36, 43): one finding, side-tab at `25-feature-pages.css:4081` (`.jweek-bed.is-move { border-left: 2px solid var(--ink) }`), a real but low-severity hit on this surface: a 2 px ink marker on a 32 px bed chip that flags a change of bed. `node scripts/ci/design-lint.mjs`: 213 violations, all 213 in the baseline, 0 new; none in the 18 markup files; two baseline shadow literals in 25-feature-pages.css sit on other surfaces. Every transition on a trips selector has a reduced-motion branch; no hex, font literal or bare `outline: none` on a trips selector.

### Technical audit

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 2 | p inside p in the hook; four section headers that are not headings; five pack buttons with one name; under-44 px: back pill 29 px, "More about this day" 26 px at 1280, booking checkbox 22 px, receipt selects 28 px; the whole page is a modal dialog with no address |
| 2 | Performance | 3 | Folds do not mount closed bodies; the composed page loads maplibre lazily; the cost row arrives after the whole library loads and shifts the list (594 to 804 px); open rows T200-d and T231-b already track the trip page's LCP |
| 3 | Responsive | 2 | Filters stack to a full screen at 380; first price below the fold at both widths; a 688 px column at 1280 with empty sides; no horizontal scroll at either width |
| 4 | Theming | 3 | Tokens throughout, lint 0 new; accent and ochre used as decoration; gradient scrims on cards |
| 5 | Implementation integrity | 3 | Detector clean on markup, one side-tab in CSS; pack labels and reasons are hard-coded English in lib/packGrid.js in a six-language app |
| Total | | 13/20 | Acceptable |

Harnesses, against the surface's own scripts, with a scratch working directory so nothing landed in a checkout:

| Harness | Result | Note |
|---|---|---|
| verify_pack_grid.mjs | pass: 253 trips, 0 bad, 715 written cells, 3,333 derived, 0 dash hits | It checks 16 to 24 cells per trip and a reason per cell; it does not check that labels are distinct |
| verify_journeys.mjs | not run | Its browser half needs a preview build on 4173 and this task builds nothing; the walk script covered the same path (styles, list, page, seven days, sleep, tips) |
| verify_trip_page.mjs | not run | Starts its own `vite preview` on a build |
| verify_trips.mjs | not run | Composed list on the destinations surface; needs a preview build |

## 5. The traveller's job here

What they need first is "can I afford this week, as I would travel it": one price a person for the week at their Lifestyle, with its pedigree, on the first screen of the list and of the page. Value for money leads for 3 in 5 European travellers (Booking.com 2024, research section 2), and the whole price up front is what earns trust (StubHub, Airbnb, research section 4). A range is rated better than a single estimate (Hu, Gaertig and Dietvorst 2025), which suits the authored ranges, as long as the page shows one range, not five figures.

Second, "is it for me, and is it good in my month": difficulty, style and who it is not for (the strip and the not-for block already do this well), and the months with weather and crowds, since 74% weigh weather risk and 68% would pick a less crowded place (Booking.com 2026). Today the month exists only as text on the card and a strip folded inside the facts; there is no month filter.

Third, "how do I get there and around without a car, and what does the week look like": the gateway, the latest sensible landing, the first and last night, and the days on a map. Two thirds of hikers would use public transport to a walk (Wandermonitor 2024), and the research's trip-page item is a day selector over one map, selected day in terracotta, other days in ink, numbered. Today "Arrive and leave" is folded and there is no map.

Then, preparing: book in order with dates, pack, read what could go wrong. These are good and only need hardening.

What is missing: a link, a save and a share for the week (the CMU tab finding: what goes out of sight is gone); a month and a car-free filter on the list; a sort by cost; the map of the week; a compare of two or three weeks (NN/g; left for its own task, as Explore did, row T376-d). What sits in the wrong place: the price under the photograph; the length picker and the not-for block above the photo; the coverage line at the end of the grid; "Arrive and leave" folded; the rail alternative under a receipt it is not part of. What sends them away: keeping the week (another tool), seeing the days on a map (a map app), and booking huts (the association's site with only "6-12 mo" in hand).

## 6. Plan (impeccable shape)

Brief in shape.md's terms. Job and audience: one budget traveller, hiker first, choosing one written week out of 253 on a phone and preparing it on a laptop. Outcome: a week they can afford in their month, reachable without a car if they want, saved under its own address, with the booking order and the pack list in hand. Direction: the incumbent world, untouched (paper, ink, one terracotta, Fraunces names, mono figures, the T362 components already built here). Structural thesis: the library is a priced list, not a magazine; the page is a plan with a receipt, in the order fit, cost, getting there, the days, preparing, not eighteen equal folds. Anti-goals: no new colour, no gradient, no text on a photograph, no second Lifestyle control, no flight figure of Carta's, no generated sentence that disagrees with the authored week, no autoplay. Assumptions taken without an interview: the hiker leads; one holiday at a time; the authored budget is the trip's truth and the town receipt is a second view.

Items marked "rule Rn" depend on part 7 being accepted by T380 first; if T380 rejects a rule, the item drops and becomes a register row.

### V3: structure, information and flow

1. A priced front door (rule R1, R2). Each style card says what a week of it costs and how long the short version is: "From €650 a person, 7 days" in mono under the name, from the style's cheapest card at the remembered length; the caption sits in a paper band under the photo, no scrim. Hiking moves to first; the coverage line moves under the grid head. Files: `src/browse/JourneysSection.jsx`, `src/lib/journeys.js` (style from-price from the index or the cards), `src/styles/66-v6-trips.css`, six `src/i18n/*.js`. Command: layout, clarify. Done when every style card at 380 and 1280 shows a euro figure and verify_journeys still finds ten cards with photographs.
2. The trip's own receipt leads the cost fold (rule R3). The authored breakdown renders as a receipt on every trip: cost bar above, lines with est marks, total a person and for the party, the Lifestyle slider under it with its trade-off sentence. The first-run receipt for the nearest town becomes a second view behind "A week based in Innsbruck instead", offered only when the week has one base (weekShape says one run and no hut nights); its Stay select is not rendered there (the Lifestyle slider drives it). When it shows, dates seed from the first month of `bestPeriod.months` after today and nights are days minus one. The suitability strip's cost cell adds "a person". Files: `src/browse/JourneyPage.jsx`, `src/components/FirstRunReceipt.jsx` (a prop to hide the stay select and pass dates; shared with the landing surface, through OWNERSHIP.md), `src/browse/CostBar.jsx`, `src/browse/LifestyleSlider.jsx`, `src/lib/lifestyleSlider.js`, `src/browse/DetailSkeleton.jsx` (strip label only), i18n. Command: clarify, harden. Done when all four walked trips show the cost bar and the slider, the strip and the receipt total agree, and the hut circuit offers no town view.
3. A list that shows trips on screen one, with the filters travellers choose by. Length becomes one two-segment control in the list head (order Short, Week, as on the page); cost band, tags, month (rule R5) and No car needed go into one Filters sheet opened from a single button that carries the active summary ("Under €1,050, July"); a Sort select (Cost, then A to Z) beside it. Clear filters leaves the length alone. The cost band row no longer arrives late: the sheet's counts load with it, the bar does not move. Target: first trip card top at or under 360 px at 380 x 800 (804 today). Files: `src/browse/JourneysSection.jsx`, `src/browse/TripFilters.jsx`, `src/lib/tripFilters.js`, `src/lib/tripTags.js`, `src/browse/PlacesFilterSheet.jsx` (reuse, shared with Destinations, through OWNERSHIP.md), `src/styles/43-trip-length.css`, `66-v6-trips.css`, i18n. Command: distill, layout. The card wire (`public/journeys/type/*.json`) carries `months` but not the car flag; the car-free filter needs `profile.carRequired` copied onto the cards by `pipeline/journeys/build_wire.py` (root repo) and the wire rebuilt (the owner's rebuild, row T376-c), so it ships after that rebuild and the month filter ships first. Done when the Playwright measure is 360 or less, the month filter narrows the list by `months`, the car-free filter by the card's car flag once the wire carries it, and Clear keeps "3 days" on the cards.
4. A week with an address (rule R4). Opening a journey writes `#journey=<id>` (the composed page's `#itin=` pattern); the boot readers open it on load and on `/journeys/<id>` (`pathToLegacyHash` gains the journey case); closing removes it, and the browser back button closes the page. FavStar (kind `journey`) and Share sit in the page bar as on the composed page; the trip card gets the same star. Files: `src/browse/JourneyPage.jsx`, `src/browse/DestinationsTab.jsx` (the pageJourney hand-off; destinations surface, through OWNERSHIP.md), `src/App.jsx` (openFeature and the boot reader, shell, through OWNERSHIP.md), `src/lib/urlScheme.js`, `src/hooks/useFavoriteItems.js` (a journey kind), `src/components/FavStar.jsx` (use), i18n. Command: harden, onboard. Done when a reload on an open journey reopens it, a copied link opens it in a fresh browser, and a starred week appears in My trips.
5. The page head in the traveller's order. Back bar; title; photo; strip (the price); then the hook, the not-for block and the length control beside the strip's cost; the location becomes a fact line. The four chips go (the strip says style, length and difficulty); "€€" goes with them. Target: the strip's cost top at or under 560 px at 380 x 800 (900 today) and under 800 at 1280 (907 today). Files: `JourneyPage.jsx`, `src/browse/LengthPicker.jsx`, `src/components/NotFor.jsx` (drop the generic "today's conditions" fallback on journeys), `src/lib/notFor.js`, `66-v6-trips.css`. Command: layout, distill. Done when the measure holds on all four walked trips at both widths.
6. Eighteen sections into seven groups, all on the rail. Fit (the week at a glance, the data sheet, why: tags and summary), Cost (receipt, rail alternative as a line marked not in the total), Getting there (arrive and leave, open; gateway list), The week (how the week runs, weather fallbacks, the day track), Sleep, Prepare (booking order, pack, good to know, pro tips), Risks (what could go wrong, never folded). Each group is an h2 Fold; the rail has seven links. Open by default: Fit, Cost, Getting there, The week. Files: `JourneyPage.jsx`, `src/browse/WeekPlan.jsx`, `src/browse/BookingOrder.jsx` (Fold `level={2}`), `src/browse/SectionRail.jsx` (no change expected), `src/browse/useFolds.js`, i18n. Command: distill. Done when the heading outline lists seven h2 under the h1 and the rail scrolls to each.
7. Desktop uses its width (rule R8). From 1024 px the page is two columns inside the 1180 px cap: the plan on the left (about 720 px), the receipt and the strip sticky on the right (`--panel-w`), so the price stays in view while the days scroll. Files: `JourneyPage.jsx`, `66-v6-trips.css`. Command: layout. Done when at 1280 the receipt total is visible at every scroll position of the week group.
8. Summaries that stay silent when they would disagree (rule R7). weekShape claims one base only when no day's title or sleep line names another bed, otherwise it lists the beds; the day card says "Night:" only from the day's own sleep line; the weather group hides its fallback list when no day has one; the hook picker skips sentences that open on a pronoun or "is not". Files: `src/lib/weekShape.js`, `src/lib/journeys.js` (hookLine), `WeekPlan.jsx`, `JourneyPage.jsx`, a new `scripts/verify_journey_claims.mjs` over the 253 files (no week-shape check exists today). Command: harden. Done when the hut circuit lists its huts and a scan of the 253 files counts zero "one base" claims on a trip whose days end at different beds.
9. A pack list that names what it holds. Written items come first and keep a short noun taken from the note when no rule matches, never "Day pack"; derived cells are capped so written ones are at least half where the trip wrote eight or more; labels and reasons move to i18n keys. Files: `src/lib/packGrid.js`, `src/browse/PackGrid.jsx`, `src/components/PackIcons.jsx`, `scripts/verify_pack_grid.mjs` (add: labels distinct within a trip), i18n. Command: harden, clarify. Done when verify_pack_grid reports 0 repeated labels within a trip (42 trips today) and the hut liner shows its own name.
10. Loads that fail out loud and states that teach. Skeleton cards at final size for the style grid, the list and the page; `.catch` on `loadJourneyType` and `loadJourney` with ErrorBlock and retry; the filter-empty state names the filter and offers "Remove <filter>". Files: `JourneysSection.jsx`, `JourneyPage.jsx`, `src/components/StateBlocks.jsx` (use), `src/styles/45-empty-states.css` (through OWNERSHIP.md), i18n. Command: harden, onboard. Done when blocking `journeys/type/*.json` in Playwright shows the error with a working retry.
11. One grammar for the two trip pages. The composed route page takes the journey page's head (photo, strip-like fact row under it, no text on the photo), its days run in the day track, its cost fold becomes a receipt with the tilde on estimated legs; the journey page takes the composed page's bar (star, share). Files: `src/browse/TripPage.jsx`, `src/browse/TripPractical.jsx`, `src/browse/TripDayPhotos.jsx`, `src/browse/DayTrack.jsx` (use), `66-v6-trips.css`, `src/styles/24-destination-workspace.css` (itin rules retired into the v6 sheet, never duplicated). Command: layout, clarify. Done when verify_trip_page passes with assertions updated for the new head, each with a comment saying why.
12. Booking order with dates. Each step shows the date it falls due from the chosen month (lead "6-12 mo" before July reads "book by January"), rows are 44 px, and the ticks travel with the saved week once item 4 lands (still on the device for a guest). Files: `BookingOrder.jsx`, `src/lib/bookingOrder.js`, i18n. Command: clarify. Done when a trip with a month chosen shows a month on every step.

### V4: visual and dynamic, inside the palette

1. The week on one map (rule R9). In "The week", a map of the week's places: day stops numbered by day, the selected day's route in `--accent`, the other days in `--ink`, the beds as small paper squares; the day track and the map select together (picking Day 3 on either moves the other). Until the T177-b track wire exists, the map draws straight segments between the day's named places from the catalogue and says "Straight lines between the day's places, not the path". Lazy like the composed page's TripMap; the fold body does not mount closed. Files: `JourneyPage.jsx`, `src/map/TripMap.jsx` (reuse; shared with the planner, through OWNERSHIP.md), `src/browse/DayTrack.jsx` (an onSelect callback), `src/map/tokenColors.js` (read only), `66-v6-trips.css`. Command: animate, layout. Done when on the hut circuit picking a day on the track highlights that day on the map and the reverse, and verify_keyboard stays 20 of 20.
2. Cards that read as a priced list with pictures. Style and trip cards: photo 3:2, caption band under it (rule R2) with the name in Fraunces, the from-price or range in mono with "a person", the length and months in `--ui`; the trip card's facts on one line; the star on the photo corner at 44 px. Files: `JourneysSection.jsx`, `66-v6-trips.css`, `src/styles/23-places-pages.css` (the places-card rules are shared with Destinations; the trips cards get their own class rather than editing the shared scrim). Command: layout. Done when no card carries text on its photograph and the 380 list shows two priced cards on screen one.
3. Spend the accent once. Fold icons to `--ink-soft` (rule R6); source and credit links to `--ink` underlined; the location pin to `--ink-soft`; the day number from ochre to `--ink-soft`; the elevation profile in the ink ramp with only the selected day in `--accent`; the beds move marker as a gap and the word "move", not a side stripe; remove the composed door's icon tile and the composed page's dot separators. The accent stays on: the one primary (Set your dates or Choose this trip), the selected day on the map and profile, focus rings, the active nav. Files: `66-v6-trips.css`, `src/styles/25-feature-pages.css`, `src/styles/23-places-pages.css` and `src/styles/24-destination-workspace.css` (rules moved into the v6 sheet, never duplicated; the outdoor pages share the elevation and source-link rules, through OWNERSHIP.md), `src/browse/RouteFigures.jsx`. Command: quieter, colorize. Done when a 380 screenshot of the page's first two screens shows terracotta only on the primary, the focus ring and the selected day.
4. Mono for measured facts only. The day stats line splits figures (mono) from words (sans) through `dayStatsParts`, already built for it; "0 of 1 booked" and the band labels go to `--ui` with only the figures in mono; the "7 days" chip goes with item V3.5; the receipt field labels "Arrive" and "Leave" go to `--ui`. Files: `JourneyPage.jsx`, `BookingOrder.jsx`, `TripFilters.jsx`, `src/styles/25-feature-pages.css`, `src/styles/38-first-run.css` (shared with landing, through OWNERSHIP.md). Command: typeset. Done when a grep of the v6 sheet and the touched rules finds no mono on a selector whose text is a word.
5. Motion that states change. The receipt total and lines reprice in place with tabular figures (MovingEur already does 240 ms, keep); the length control swaps the days with a 150 ms opacity crossfade of the track, none under reduced motion; the filter summary updates without moving the bar; the map and track selection share one 200 ms pan; the star toggles with the existing touch feedback. Files: `JourneyPage.jsx`, `LifestyleSlider.jsx`, `DayTrack.jsx`, `66-v6-trips.css`. Command: animate. Done when every transition is under 300 ms on transform and opacity with a reduced-motion branch (craft detector and a grep of the v6 sheet).
6. The difficulty words read as a scale. The strip's five squares stay; the level words become one scale the whole surface uses, with the level-one word replaced where it is on carta-design's banned list (rule R10). Files: `src/lib/journeys.js` (diffLabel), i18n. Command: clarify. Done when the five words are one scale in all six catalogues.
7. Imagery. One aspect per row on the library; the hero at most 60% of the viewport height on desktop (521 px today on an 800 px screen); a missing day photo leaves no hole. Files: `66-v6-trips.css`. Command: polish. Done when the 1280 page shows the strip above the fold.

### V5: harden, adapt and polish

1. Tap targets. Back pill, "More about this day", the booking checkboxes (as whole 44 px rows), the receipt selects and date fields, Report this price, the decks' Show all, the rail links: 44 px on a coarse pointer, 32 px allowed on a fine pointer only. Files: `66-v6-trips.css`. Command: adapt. Done when the Playwright scan counts zero interactive elements under 44 px inside `.jpage` and the list at 380.
2. Headings and names. The hook renders one paragraph (no `p` inside `p`); every group header is an h2; pack buttons carry distinct names; the strip's cost cell is announced with "a person"; the page bar's Share and star have names. Files: `JourneyPage.jsx`, `PackGrid.jsx`, `DetailSkeleton.jsx`, i18n. Command: harden. Done when the Vite console shows no validateDOMNesting on a journey and an axe pass on the page reports no heading-order or duplicate-name issue.
3. Escape and back. With the page addressable (V3.4), Escape and the browser back both close it and return focus to the card that opened it; Escape inside an open InfoDot or a deck closes that first (the shared escape stack, capture phase). Files: `JourneyPage.jsx`, `src/hooks/useFocusTrap.js` (use). Command: harden. Done when verify_keyboard's journey walk ends on the opening card.
4. Long words and six languages. The filter summary, the seven group names, the strip cells and the receipt lines fit at 360 px in de and fr (shrink before truncate); the pack labels read in all six languages; native review of the new strings is an owner row. Files: `66-v6-trips.css`, i18n. Command: adapt. Done when a de and fr walk at 360 and 1280 shows every label whole.
5. Print. The page prints as the plan: receipt, the days as a list (the decks already print as lists), booking order with dates, pack list; no rail, no map tiles. Files: `66-v6-trips.css` (print block). Command: polish. Done when the print preview of the hut circuit fits the plan without empty pages.
6. Harness updates. verify_journeys asserts the from-price on style cards, the first card top, the address round trip, the receipt with cost bar and slider; verify_pack_grid asserts distinct labels; verify_trip_page follows the composed page's new head; verify_trips stays as it is. Each changed assertion carries a comment saying why. Files: `scripts/verify_journeys.mjs`, `scripts/verify_pack_grid.mjs`, `scripts/verify_trip_page.mjs`, `scripts/verify_keyboard.mjs` (add a journey walk), `scripts/verify_quality_floor.mjs` (include the journey page). Command: audit. Done when all four surface harnesses pass against a preview build and verify_keyboard stays 20 of 20 or grows by the journey walk.
7. Clean-up. Remove the duplicate photo credit; retire the old `jpage-chip` and `jcomposed-icon` rules once V3.5 and V4.3 land; delete `gatewayFact`'s string fallback only after the wire rebuild (row T143-b). Command: polish. Done when the design lint shows 0 new and the detector is clean on every changed file.

### Target state: every button and control on the surface

| Control | Today | Target | Wave |
|---|---|---|---|
| Style cards (10) | Photo, scrim, name, count | Photo, caption band, name, from-price a person, length; hiking first | V3, V4 |
| Composed door | Icon tile, "priced from your airport" | Plain row, no tile, no flight claim | V3, V4 |
| Coverage line | Grid end | Under the grid head | V3 |
| Back to styles | 29 px pill | 44 px back link | V5 |
| Length on the list | Two full-width buttons, Week then Short | Segmented control, Short then Week | V3 |
| Cost band, tags | Stacked full-width buttons, cost row loads late | In one Filters sheet with a summary on its button | V3 |
| Month filter | Missing | In the Filters sheet | V3 |
| No car needed | Missing | In the Filters sheet | V3 |
| Sort | Missing | Cost, A to Z | V3 |
| Clear filters | Also resets the length | Leaves the length | V3 |
| Trip card | Text on a scrim, no star | Caption band, range a person, star | V3, V4 |
| Page back | 34 px at 1280 | 44 px; also browser back | V5 |
| Save star, Share | Missing | In the page bar | V3 |
| Page address | None | `#journey=<id>` and `/journeys/<id>` | V3 |
| Location row | Above the title | A fact line under the strip | V3 |
| Chips (4) | Repeat the strip | Removed | V3 |
| Length picker | Two full-width buttons above the photo | Segmented control beside the strip's cost | V3 |
| Not-for block | Above the photo, generic fallback | Under the strip, trip-specific lines only | V3 |
| Suitability strip | Under the photo at 900 px | At or under 560 px at 380, "a person" | V3 |
| Section rail | 6 of 18 sections | 7 of 7 groups | V3 |
| Fold headers | 18, some not headings | 7 h2 groups | V3, V5 |
| Month strip info | "i" in a circle | InfoDot | V4 |
| Cost fold | Town receipt for 2, Stay select | Trip receipt with cost bar and Lifestyle slider; town receipt as a second view for one-base weeks | V3 |
| Set your dates | Primary | Primary (the one on the page) | none |
| Add your fare, Report this price | As today | Unchanged; 44 px | V5 |
| By train instead | Under the receipt | A line of Cost, marked not in the total | V3 |
| Week shape | Effort bars, beds, one-base claim | Same, claims only what the days say | V3 |
| Arrive and leave | Folded | Open, in Getting there | V3 |
| Weather fallbacks | "0 of 7" summary | Hidden when none | V3 |
| Map of the week | Missing | Day-numbered map, selected day in accent, synced with the track | V4 |
| Day track and its buttons | As built | Unchanged; synced with the map | V4 |
| More about this day | 26 px at 1280 | 44 px | V5 |
| Day stats | Prose in mono | Figures mono, words sans | V4 |
| Where to sleep, Read more | As today | Unchanged | none |
| Booking checklist | 22 px box, lead only | 44 px rows, a due month per step | V3, V5 |
| Decks: Previous, Next, Show all | As built | Unchanged | none |
| Pack grid | 5 cells named "Day pack", English only | Distinct names, written items first, six languages | V3 |
| What could go wrong | Deck, never folded | Unchanged | none |
| Price a trip to the town | Unexplained door | Labelled "Prices in Innsbruck" | V3 |
| Exits (3) | As built | Unchanged | none |
| Sources | Credit twice | Credit once | V5 |
| Composed page head | Text on a gradient photo | Caption band, fact row | V3, V4 |
| Composed days | Folded list | Day track | V3 |
| Composed cost | Per-day total, no tilde on legs | Receipt grammar, tilde on estimates | V3 |

## 7. Needs a rule

Each line is a proposal carta-design does not cover today, with the rule proposed. T380 accepts or rejects each one before anything in it is built.

R1. Price on a collection card: a card that stands for a set of priced items (a style, a region, a guide) shows "From €N a person" in `--mono` with the length it is priced at, from the cheapest member at the traveller's current inputs; never an average, never a figure of Carta's own for a flight.
R2. Caption band, not text on a photograph: on any photo card or photo hero, text sits in a solid `--paper` or `--bg-card` band under the photo, flush with its bottom edge, as the suitability strip does; no scrim, no gradient, no text over the image. This extends T360's strip rule to every card.
R3. The trip receipt: on a trip page the trip's own itemised budget is the receipt (cost bar, lines, est marks, total a person and for the party, the one Lifestyle control under it); a receipt for a nearby town is a labelled second view, never in its place, and it never carries its own stay select.
R4. Addressable detail pages: every detail page a traveller can open has its own URL, a save star and a share button in its page bar (secondary chrome, 44 px); a page that cannot be linked is not shipped.
R5. Month as a filter on a list: one select of the twelve months plus "Any", in `--ui`, filtering by the item's best months; the chosen month is outlined on any month strip in view.
R6. Section header icons: icons on fold and section headers are `--ink-soft`, never `--accent` or `--rate`; terracotta on a header only when the header is itself the page's action.
R7. Derived summaries stay silent: a sentence generated from data (a summary, a count, a "one base" claim, a fallback count) is shown only when the authored text agrees with it; where the data is thin or contradicts the text, the module shows nothing or the authored words, never "0 of N".
R8. Two-column detail page on desktop: from 1024 px a detail page with a receipt may run as a plan column and a sticky side column holding the strip and the receipt, inside the 1180 px cap; on a phone it is one column with the receipt in the page order.
R9. Map of a multi-day plan: day stops numbered by day number, the selected day's line in `--accent` and every other day in `--ink`, beds as `--paper` squares with an `--ink` border; selection is shared with the day track; a line that is not the measured path says so in one sentence under the map.
R10. Difficulty words: one five-step scale for every difficulty the product shows (strip, cards, facts), with words that are not on the banned list; the scale lives in one i18n group and every surface reads it.

## Files the build waves will touch

App repo: `src/browse/JourneysSection.jsx`, `src/browse/JourneyPage.jsx`, `src/browse/TripPage.jsx`, `src/browse/TripPractical.jsx`, `src/browse/TripDayPhotos.jsx`, `src/browse/DayTrack.jsx`, `src/browse/FlashDeck.jsx` (only if a name or print rule moves), `src/browse/PackGrid.jsx`, `src/browse/WeekPlan.jsx`, `src/browse/BookingOrder.jsx`, `src/browse/CostBar.jsx`, `src/browse/LifestyleSlider.jsx`, `src/browse/SectionRail.jsx`, `src/browse/TripFilters.jsx`, `src/browse/LengthPicker.jsx`, `src/browse/JourneyRoute.jsx`, `src/browse/RouteFigures.jsx` (shared with the outdoor pages, through OWNERSHIP.md), `src/browse/DetailSkeleton.jsx` (strip label; shared with the outdoor pages), `src/browse/useFolds.js`, `src/browse/PlacesFilterSheet.jsx` (reuse; shared with Destinations), `src/browse/DestinationsTab.jsx` (the journey hand-off only; destinations surface), `src/components/NotFor.jsx`, `src/components/PackIcons.jsx`, `src/components/FirstRunReceipt.jsx` (props only; landing surface), `src/components/MonthStrip.jsx` (the InfoDot swap; shared), `src/components/FavStar.jsx` (use), `src/components/InfoDot.jsx` (use), `src/components/StateBlocks.jsx` (use), `src/map/TripMap.jsx` (reuse; shared with the planner), `src/map/tokenColors.js` (read only), `src/App.jsx` (the journey boot reader; shell), `src/hooks/useFavoriteItems.js` (a journey kind; account surface), `src/hooks/useFocusTrap.js` (use), `src/lib/journeys.js`, `src/lib/weekShape.js`, `src/lib/packGrid.js`, `src/lib/bookingOrder.js`, `src/lib/tripFilters.js`, `src/lib/tripTags.js`, `src/lib/tripLength.js`, `src/lib/lifestyleSlider.js`, `src/lib/notFor.js`, `src/lib/urlScheme.js`, `src/lib/glossary.js` (terms for the InfoDots), `src/styles/66-v6-trips.css` (created by T380), `src/styles/25-feature-pages.css`, `src/styles/32-day-carousel.css`, `src/styles/33-flashcards.css`, `src/styles/34-section-rail.css`, `src/styles/35-lifestyle-slider.css`, `src/styles/36-cost-bar.css`, `src/styles/43-trip-length.css`, `src/styles/23-places-pages.css` and `src/styles/24-destination-workspace.css` (old rules retired into the v6 sheet, never duplicated; shared), `src/styles/38-first-run.css` (field labels; landing), `src/styles/45-empty-states.css`, the six `src/i18n/*.js` catalogues, and the harnesses `scripts/verify_journeys.mjs`, `scripts/verify_trip_page.mjs`, `scripts/verify_trips.mjs` (run, unchanged), `scripts/verify_pack_grid.mjs`, `scripts/verify_keyboard.mjs` (a journey walk), `scripts/verify_quality_floor.mjs` (include the journey page) and a new `scripts/verify_journey_claims.mjs` if no week-shape check exists. Not touched: `src/browse/LifestylePanel.jsx` (the Lifestyle surface's), the shell's header and bottom nav, the composed route list in `DestinationsTab.jsx`, the journeys wire in `public/journeys` (its rebuild is the owner's row T085-a).
