# The first ninety seconds, and every empty state

Design document, task T211 (mind-map M11). Status: awaiting owner approval. No code ships from this document until the owner says so. It is written under the carta-design skill, PRODUCT.md and DESIGN.md, and where it disagrees with those, those win. Its sibling is `docs/FIRST_RUN_RESULT.md` (T187, revised by T211), which designs the moment the first priced total appears; this page designs the ninety seconds before it and every screen that has nothing to show.

Two facts set the frame. Carta does not price flights (owner decision of 2026-10-02, T272; the last Carta flight figure left the screens in T273). The departure airport is therefore no longer the hinge the mind map assumed; what makes a number personal today is the group size, the stay style and the lifestyle, and the only flight figure in a total is one the traveller typed. And the launch speaks to hikers first (T203, confirmed in T275): the first screen says its first sentence to someone who travels to a town to walk from it.

## Part 1. The first ninety seconds

### What a first-time visitor sees today

Measured in the main checkout on 2026-10-02. The app opens on the Destinations tab (`continent-app/src/App.jsx` line 299, `useState(urlTab || 'places')`), on its Trips category (`src/browse/DestinationsTab.jsx` line 970, `useState('trips')`), which with no search, no country and no located place shows the country index and the ten journey style cards (line 2275, `showCountryIndex = !q && !country && !nearPlace`). Nothing on that screen says what Carta is or carries a price. The departure airport is not asked on any browse surface: the "priced from" chip was removed from the Destinations tab (line 2880) and the only `OriginPicker` left is inside the trip planner (`src/planner/TripPlannerTab.jsx` line 893). It defaults silently to the origin nearest `meta.home` (Brussels) or to CRL (`src/lib/origins.js`, `defaultOrigin`). The dates default from the frozen fare window (`src/hooks/useAppData.js`, `defaultWindow`, reading `best_start_by_nights` from the fare slice), which is a table no longer refreshed. A per-day figure is one tab away on the Explore cards (euros a day, priced from the Lifestyle panel), and an itemised total is behind the planner's wizard.

So the ninety seconds today run: a grid of style cards with no sentence over them, a tab switch to find a price, and a wizard to find a receipt. Nothing dead-ends, but nothing leads either.

### The rule the design follows

A priced result before any input is asked. Every one of the 3,868 destinations (`app_data/app_data.json` `meta.n_destinations`) carries a bed rate and a food basket, measured in the town or standing in from the country, and the engine prices them from the defaults in `meta.defaults` (7 nights, the default lifestyle, the default stay tier). So Carta never needs to ask a question before it can show a number; it asks questions to make the number more the visitor's own. Dates are never a gate, the airport is never a gate, and the account is never a gate. The one gate that exists, the drive-from town in car mode (`needsDriveHome`), lives in the planner and is not on the first-run path.

The second rule is PRODUCT.md's: the inputs are always visible and the figures update in place. The first run does not hide the inputs behind a modal and then reveal them; it shows them in the strip from the first screen, filled with the defaults, and lets the visitor change them when they want to.

### Second 0 to 10: the opening screen

The app still opens on the Destinations tab, and the tab opens on walks, not on journey styles. That is the one change on the first screen, and it follows from the audience order: the first band speaks to the hiker, and the hiker's object is a walk from a town. Switching the opening category is a product decision, so it is listed with the approval at the end of this page.

Above the band, one sentence in `--ui`, body size, and an `h1` in `--display` that carries a number read from `meta`, never typed in: "What a day costs, per person, in 3,868 places" (the T201 positioning sentence, with the count substituted at build time). Under it the sentence that names the audience and the promise: "Pick a town to walk from. Carta says what the bed and the day cost there, and where each figure came from." No second paragraph.

Then the first band: walks from towns, with the town's day price on every card. The card is the Destinations card as shipped; the one addition is the price line already used on the Explore cards (euros a day from `groundSpendPerPerson` and `stayTierNightly`, the same functions the receipt uses, so a card and a receipt cannot disagree). The provenance word rides on the figure: "EUR 54 a day, measured" or "EUR 54 a day, national figure". Mono for the figure, `--ui` for the word.

The input strip sits above the band, the search strip the carta-design skill describes, one bordered row: people, stay style, dates, in that order, each with a mono micro label and its default value showing. No airport cell. The strip is the whole first-run layer; there is no coach mark, no tour, no welcome banner, no step counter.

### Second 10 to 40: the first tap

The visitor taps a walk or a town. A walk opens the trail page, whose base town is the first fact after the route (T203: "car-free start from {station}" and the town's day price ride on every trail page from wave one). A town opens the destination page. Either way, within one tap of the opening screen the visitor is on a page with a priced day and a provenance sentence under it, the `cost.stayMeasuredN` pattern CostSummary already uses ("Bed price from 1,204 stays in Trieste, captured March 2026") and the `cost.stayNational` sentence where the town is not measured. The page's primary is "Price a week here" (the existing `dest.planTrip` door, relabelled with the verb and the unit so it names what it does).

What the visitor is not shown on this page in the first run: the rating system, the hidden-gem badge, the pass. They are on the page where they always are; nothing is added to explain them and nothing is removed.

### Second 40 to 90: the first priced total

"Price a week here" opens the first-run result designed in `docs/FIRST_RUN_RESULT.md`: the receipt for 7 nights and the default group, every line a ground cost with its provenance row, the sum in mono, the footer showing what one changed input does, the orientation line saying the defaults were Carta's, and one primary, "Set your dates". The receipt reaches the visitor without a question asked. That is the done condition of the mind map ("reaches a priced result without a dead end"), met in two taps.

Under the receipt sits the flight door. One sentence, "Carta does not price flights, so none is in this total. Add what you paid and it counts.", and one secondary button, "Add your fare". It is the existing `trip.flightNotPriced` sentence and the existing `trip.addOwnFare` button, already in six catalogues since T273, moved to the receipt the visitor meets first.

### How the airport is asked, once

The airport is asked inside the flight door and nowhere else. The door is one sheet, "Your flight", with four fields in a strip: flying from (the `OriginPicker` list, grouped by country, as it exists), airline (free text), what you paid for the whole group (a euro field, two decimals), and the out and return days (the existing `wizard.ownFlightOutLabel` and `wizard.ownFlightRetLabel` fields). Filling it writes `choices.origin` and `ownFlight` exactly as the planner does today. The sheet is prefilled from those on every later opening, in every surface, across sessions, because `choices.origin` already survives in the URL and the local mirror (`App.jsx`, `hasLocalOrigin`). So the question is asked once and remembered, which is what the mind map wanted, and it is asked at the moment the answer changes a number the visitor is looking at, which is why they will answer it.

Nothing on the first-run path asks the airport before the receipt. A visitor who never flies never meets the question.

### What happens before any dates are chosen

Everything. The opening band, the destination page and the receipt are all priced from the defaults. Dates change two things: the stay line, because the bed rate is seasonal (`src/lib/runtime_pricing.js`, the header comment on accommodation, "adjusted for season"), and the number of nights, which multiplies every line. They open no door that was shut. The strip shows the default dates in mono so the visitor can see they are defaults, and the orientation line on the receipt says so in words.

The default dates themselves change with this design. Today they come from the frozen fare window. With no fare in any total they should come from the calendar instead: the next full week that starts on a Saturday at least four weeks out, with `meta.defaults.trip_length_days` nights. That is a change to `useAppData.js` for the implementing task, and it removes the last reason the fare slices are read on the browse path.

### The dead-end audit

Each step on the path, what can be empty there, and what the visitor sees instead of a dead end. Every row points at a state in Part 2.

| Step | What can be empty | What shows |
|---|---|---|
| Opening band, walks | The visitor's country (from the browser locale) has no published walks | The country empty module (state 3 to 5) with the reason sentence and the three nearest walks across the border; the band is never blank |
| Opening band, prices | A town has no measured bed rate | The national figure with its word; the price line is never blank (PRODUCT.md, "never a blank") |
| Search | No place matches the typed text | State 6, with the geocode fallback the Destinations tab already has ("search the map for what was typed") |
| Trail page | The route's base town is outside the catalogue | The nearest catalogue town within 25 km (the fallback `trailCards.js` already uses for the photo), named as such |
| Destination page | The town has no routes, no beaches, no lakes nearby | The section says so in one line and names the nearest (Part 2, the detail-page rule) instead of vanishing |
| Receipt | The stay tier the visitor picked is not sold in that town | The receipt prices the nearest tier that is and says so on the stay line's second row ("no dorm beds measured here; private room shown") |
| Flight door | The airport has no fare table | Nothing changes: the door takes a typed fare, and no fare table is read |

### What is deliberately not on the first run

No modal of any kind. No request for location before the visitor asks for it (the "near me" button stays explicit, `places-locate`). No account prompt: saving, sharing and exporting ask for an account when they are used. No cookie banner: T214's position is that Carta adds no analytics script, so no banner is needed, and removing the Travelpayouts snippet (T056-a) is what keeps that true. No language prompt: the UI follows the browser and the switch is in the top bar. No "skip" button, because there is nothing to skip.

## Part 2. The empty states

### What exists today, the before count

Counted on 2026-10-02 in `continent-app/src` outside the admin screens: every place where a list, a search, a page or a panel renders a message instead of content. The method was a search of the JSX for strings rendered on an empty, gone, not-found or no-match condition, then a read of each site. The sites and keys are in the table below.

| Measure | Count |
|---|---|
| Distinct empty states rendered (one row per message, a key with several sites counted once) | 71 |
| Of those, states that name what is missing and offer nothing to do | 29 |
| States that name the nearest alternative | 1 (`scope.farHead` and `scope.farRegionHead`, one pattern) |
| States that offer three alternatives across a border | 0 |
| States that print a coverage reason in words | 0 (T111: "Nothing prints a code in the UI yet") |
| States whose copy is stale (a layer "has not shipped yet" while it is on the wire) | 3 |
| States hardcoded in English outside the i18n catalogues | 2 (`Dropdown.jsx` line 136, `GuidedTripWizard.jsx` line 3156) |
| Empty-state keys defined in `en.js` that no component renders | 7 (`results.emptyDrive`, `day.exploreSearchEmpty`, `day.guideEmpty`, `day.mapCapEmpty`, `day.exploreEmptyHint`, `saved.tripPlansEmpty`, `saved.mapEmpty`) |
| Detail-page sections that disappear when empty rather than saying so | `NearbyOutdoors.jsx`, `RoutesFromHere.jsx`, `GettingThere.jsx`, `Neighbourhoods.jsx`, `AroundHere.jsx` each return null on an empty list |

How the shipped states look: `.places-empty` is 13 px `--ui` in `--ink-soft` with 20 px of padding and no border (`src/styles.css` line 20043); `.results-empty` and `.guide-empty` are italic `--ink-mute` (lines 7238 and 2389), which is metadata colour on what is sometimes the only text on the screen; `.saved-empty` (line 8770) is the one designed block, a `--paper-dim` panel with a round icon mark and a pill button. The coverage statuses on the wire (`continent-app/public/coverage.json`, `coverage_v1`, generated 2026-09-04, 2,077 regions) are read by `regions.js` for the thin and listed chips, and the `why` on a region (`no_coast_or_large_lakes` on 700 beach rows, `no_lakes_over_5ha` on 641 lake rows, `relief_below_250m` on 1,283 mountain rows) is never shown.

### The rules every empty state follows

The spec's own sentence is the whole rule: name the space, give the action, offer the three nearest alternatives across the border (destinations spec 1.6). Under carta-design that becomes five fixed things.

Name the space in the first sentence, with the count where there is one, in the product's own voice: "No lakes are published in Moldova" and not "Nothing found". The count line is mono when it is a count ("Italy, 0 routes published"), prose otherwise.

Give the reason when the product knows it. The coverage contract (spec 0.4, built by T111 in `pipeline/regions/coverage.py`) has a reason code for every cell that is not passing; the sentence for each code is fixed below, so no screen invents one. Stating the gap is what makes the covered parts believable (spec A7).

Give one action, as a real button or a real link, never as a hint in prose alone. Where the state replaces a list, the action is a secondary button (transparent, `1px solid var(--rule)`, 44 px); the page keeps its one primary.

Offer the three nearest alternatives when the thing that is empty has a geography: a country, a region, a radius around a place. Three rows under a hairline each, name in `--ui`, country and distance in mono, each a real link. They come from the same wire the list would have read, sorted by distance from the empty area's centroid, restricted to rows outside it. Where the three nearest are all in one neighbouring country that is fine; the rule is nearest, not most varied.

Look like the rest of the page. The block is prose on paper, not a card and not a panel: lists get hairlines, objects get borders, and an empty list is still a list. No illustration, no icon tile, no italic, no `--ink-mute` on the sentence (it is the content, so it is `--ink`). The count line is the only mono. The three rows are the only hairlines. One secondary button. A state that is an error (a list that failed to load) keeps the retry button the `LayerError` pattern already has and says what happened, in one sentence, with no apology.

Copy follows PRODUCT.md: sentence case, no terminal punctuation on the button, full stops in the sentences, no em or en dash, none of the banned words, nothing built by concatenation. Every string below is an i18n key in six catalogues.

### The coverage module

One component serves every country, region and radius empty state on the browse surfaces: the Destinations tab's six categories, the country page, the region page and the three detail-page sections that go empty. Its slots, top to bottom:

1. The count line, mono: `{Place}, {n} {things} published` (`cov.countLine`). When `n` is 0 the line is the headline of the block. When the status is thin, the line continues with the floor: `{Place}, {n} of {floor} {things} published`.
2. The reason sentence, prose, one of the fixed sentences in the next section, keyed on the region's `code` once the T111 wire lands, and on its `why` or status until then.
3. The nearest three, under hairlines, each `{name}` then `{country} {km} km` in mono. Headed by one short line in prose: "The nearest published" (`cov.nearestHead`).
4. The action button. Which one depends on the state: "Show all countries" where a country filter is on, "Widen the search" where chips are on, "See {country}'s {other things}" where the country publishes another layer (the microstate case).

The module reads `coverage.json`'s region entry for the empty area and the layer wire for the nearest rows. A state with no geography (a search box, a saved list, a picker) does not use it and takes the plain two-sentence form instead.

### The reason-code sentences

Spec 0.4 names seven codes and T111 emits them (`REASON_CODES` in `pipeline/regions/coverage.py` line 515). The public wire does not carry them yet: `public/coverage.json` in the main checkout has no `code` on its regions and no `contract` block, because the T111 run that writes them is a data-lane step not yet taken (register row T211-c). Until it lands, the module keys on `status` and `why`, which the wire does carry; the mapping is in the second table.

| Code | Sentence (English, `cov.reason.*`) | Then |
|---|---|---|
| `not_applicable` | `{Place} has no {things}: {detail}.` The detail is the contract's own, in words: "no coast", "no lake over 5 hectares", "no ground higher than 250 metres above its surroundings", "2 square kilometres, too small for twelve walks" | The nearest three across the border and the other-layer button |
| `no_open_data` | `No open route data exists for {place} yet, so nothing can be mapped end to end.` | The nearest three; on trails, the link-out line from spec B5 ("Here is where to get the track") when the registry names one |
| `way_only_not_derived` | `{Place}'s walks are mapped as paths but not yet joined into routes, so none is published.` | The nearest three |
| `failed_continuity` | `The open route data for {place} has gaps Carta could not bridge, so the routes are not published.` | The nearest three |
| `below_quota` | `{n} of {floor} published. Carta knows of {m} more and has not cleared them yet.` (`m` from the contract's miss list; the sentence drops its second half when `m` is 0) | The thin list stays; the nearest three are added under it only when `n` is 0 |
| `licence_blocked` | `The data for {place} exists but its licence does not allow Carta to publish it.` | The nearest three |
| `pending_partnership` | `{Holder} holds the tracks for {place}. Carta has asked for them.` (the holder from the contract detail, for instance the Culture Routes Society for Turkey's trails) | The nearest three |

Until the codes are on the wire, the statuses and `why` values map as follows.

| Wire today | Sentence |
|---|---|
| `status: na`, `why: no_coast_or_large_lakes` | `{Place} has no coast and no large lake, so there is no beach to publish.` |
| `status: na`, `why: no_lakes_over_5ha` | `{Place} has no lake over 5 hectares.` |
| `status: na`, `why: relief_below_250m` | `{Place} has no ground higher than 250 metres above its surroundings, so there is no mountain to publish.` |
| `status: empty`, no `why` | `{Place}, 0 {things} published. Coverage grows country by country.` (the existing `places.catEmpty` sentence, now with the place named) |
| `status: thin` | The count line with the floor, the list, and the `region.listedNote` chip as today |

The microstate rule from spec 1.6 is in the contract already (`MICROSTATES` in `coverage.py` line 540: Monaco 2 km2, San Marino 61, Liechtenstein 160): a count failure on trails or cycling in those three is `not_applicable`, and the detail prints the area, which is what the sentence says.

### The country empty states for the microstates

Spec 1.6 names seven: Monaco, San Marino, Liechtenstein, Andorra, the Faroes, Malta and Moldova. What each publishes today, read from `public/coverage.json` (region status and published count `r`) and `app_data.json` (destinations per country), and what its empty states say. "Nearest three" means the module's rows and is not pre-computed here; the implementing task reads them from the wire at build time.

| Country | On the wire today | The empty states it needs |
|---|---|---|
| Monaco (1 destination; region `MC`: beach 1 thin, trail 1 thin, cycling 0 empty, lake na, mountain na) | Beach and walk lists of one | Lakes: "Monaco has no lake over 5 hectares." Mountains: the relief sentence. Cycling: `not_applicable` once coded, "Monaco is 2 square kilometres, too small for a cycling route of its own." Each with the nearest three in France and Italy and the button "See Monaco's beach" |
| San Marino (1 destination; `SM`: trail 4 published over 9 regions, cycling 0 empty in 9 of 9, beach na, lake na, mountain na) | Four walks | Beaches: the coast sentence. Lakes: the 5 hectare sentence. Mountains: "San Marino has one mountain, Monte Titano, and it is in the walks." (the spec's own example; the sentence is written once the mountain row exists, and until then the relief sentence). Cycling: the area sentence. Nearest three from Emilia-Romagna and the Marche |
| Liechtenstein (1 destination; `LI000`: trail 109 ok, mountain 3 ok, cycling 0 empty, beach na, lake na) | Walks and mountains | Beaches, lakes: the two `na` sentences, nearest three on the Bodensee and the Walensee. Cycling: `not_applicable`, "Liechtenstein's cycle routes are stages of the Swiss and Austrian networks; the nearest are below." |
| Andorra (5 destinations; `AD`: trail 10 over 7 regions, mountain 7, lake 1, cycling 1, beach na or empty) | Walks, mountains, one lake | Beaches: the coast sentence, nearest three on the Catalan coast. Cycling thin: the count line with the floor |
| Faroe Islands (9 destinations; `FO`: trail 1, mountain 5, lake 1, beach 1, cycling 0 empty) | Walks and mountains | Cycling: "No cycle route is published for the Faroe Islands." with `below_quota` once coded, and no nearest three, because the nearest published route is across the sea; the module hides the rows when the nearest is over 300 km away and says "The nearest published route is in {country}, {km} km away." instead |
| Malta (8 destinations; `MT001`, `MT002`: beach 8 thin, trail 23 ok, lake 4, mountain 2, cycling 1 thin) | Everything, thinly | Thin states only: the count line with the floor on beaches and cycling, with the list under it |
| Moldova (8 destinations; `MD`: trail 20, lake 3, mountain 1, cycling 0 empty in 37 of 37 regions, beach empty 23, na 11) | Walks, three lakes | Cycling: `no_open_data` or `below_quota` once coded; until then the empty sentence with Moldova named. Beaches: "Moldova has no coast; its river beaches are not in an open register yet." Nearest three in Romania |

Luxembourg (7 destinations, `LU000`: trail 150, mountain 4, lake 4, cycling 8, beach 1) is not on the spec's list and needs no empty state; it is here so the next reader does not look for it.

### Every empty state, with its copy

The table is the inventory and the brief. One row per message; the key is the one in `src/i18n/en.js` today, the file is where it renders, the third column is the shipped English, the fourth is the English this design ships. A row marked "module" takes the coverage module above and its copy is the module's; the sentence given is the one the module shows when it has no reason code. Rows marked "keep" change nothing.

Explore (the map tab), `src/browse/ExploreTab.jsx`

| # | Key | Today | Proposed |
|---|---|---|---|
| 1 | `results.empty` | No destinations match these filters. | No place matches all of those filters. Clear the last one you set, or widen the price. (button: Clear filters) |
| 2 | `results.emptyFav` | No destinations starred yet. Tap the star on any result to build a shortlist. | keep |

Destinations tab, `src/browse/DestinationsTab.jsx`, `JourneysSection.jsx`, `CyclePage.jsx`, `RegionPage.jsx`, `JourneyPage.jsx`, `TripPage.jsx`, `PlacesFilterSheet.jsx`

| # | Key | Today | Proposed |
|---|---|---|---|
| 3 | `places.catEmpty` | Nothing published here yet. Coverage grows country by country. | module: `{Place}, 0 {things} published.` plus the reason sentence and the nearest three |
| 4 | `places.trailsEmpty` | Nothing published in {country} yet. Coverage grows country by country. | module, trails: `{Country}, 0 walks published.` plus the reason and the nearest three walks across the border |
| 5 | `places.noneNear` | No published trips near {city} yet. | module, radius: `No published walk within {km} km of {city}.` then the nearest three (this replaces the bare sentence; `scope.farHead` already does this and the two become one) |
| 6 | `places.anywhereNone` | No place on the map matches that. Add the town or the country and search again. | keep, with the existing "search the map" button |
| 7 | `scope.farHead`, `scope.farRegionHead` | Nothing near {city} yet, the closest is {km} km away | keep as the module's heading when it has rows to show: `Nothing within {km} km of {city}. The nearest published:` |
| 8 | `beach.noneChips` | No beach matches those chips. Tap one again to widen the list. | keep (button: Clear chips) |
| 9 | `beach.noneNear` | No published beach near {city} | module, radius, beaches |
| 10 | `beach.noneMatch` | No beach matches that. Try a country name. | keep |
| 11 | `beach.notPublished` | The beach layer has not shipped yet. | This is an unloaded list, not an empty one: `The beach list did not load. Check your connection and try again.` (button: Try again), the `layer.loadFailed` pattern |
| 12 | `lake.noneChips` | No lake matches those chips. Tap one again to widen the list. | keep (button: Clear chips) |
| 13 | `lake.noneNear` | No published lake near {city} | module, radius, lakes |
| 14 | `lake.noneMatch` | No lake matches that. Try a country name. | keep |
| 15 | `lake.noneCountry` | No lakes are published in {country}. Every country with inland water worth a trip is in this list, so an empty one usually means there is none. | module, lakes: the `na` sentence when the wire says `no_lakes_over_5ha`, otherwise `{Country}, 0 lakes published.` with the reason. The "usually means there is none" claim goes; the reason code says it exactly or not at all |
| 16 | `lake.notPublished` | The lake layer has not shipped yet. | as row 11, lakes |
| 17 | `mtn.noneChips` | No mountain matches those chips. Tap one again to widen the list. | keep (button: Clear chips) |
| 18 | `mtn.noneNear` | No published mountain near {city} | module, radius, mountains |
| 19 | `mtn.noneMatch` | No mountain matches that. Try a country name. | keep |
| 20 | `mtn.noneCountry` | Nothing has cleared the gate in {country} yet | module, mountains: the relief sentence when the wire says so, otherwise `{Country}, 0 mountains published. Carta knows of {m} more and has not cleared them yet.` |
| 21 | `mtn.notPublished` | The mountain layer has not shipped yet. | as row 11, mountains |
| 22 | `cycle.emptyCountry` | No cycle routes published here yet. | module, cycling: `{Country}, 0 cycle routes published.` with the reason (Italy's is spec C1 in words: "OSM maps Italy's national network as superroutes, which Carta's importer does not read yet.") and the nearest three |
| 23 | `cycle.familyGone` | That route is not in the catalogue. | `This route is not published any more. It stopped passing its checks.` (button: Cycle routes), the `trip.detailGone` pattern |
| 24 | `trip.emptyDays` | Nothing composed at {n} days for this place yet. Try a day either side. | keep, with the two nearest lengths as buttons ({n-1} days, {n+1} days) |
| 25 | `trip.emptyAll` | Nothing matches those filters. Clear one and try again. | keep (button: Clear filters) |
| 26 | `journey.emptyType` | No trips here yet | `No {style} week is written yet. The other styles are below.` (the style rail stays on screen) |
| 27 | `journey.emptyCountry` | Nothing written in {country} for this style yet | module, journeys: `No {style} week in {country} yet.` then the nearest three weeks of that style across the border (button: All countries) |
| 28 | `journey.gone` | This trip is no longer published | `This week is not published any more.` (button: Trips), as row 23 |
| 29 | `trip.detailGone` | This trip is no longer published. It stopped passing its checks. | keep |
| 30 | `region.notFound`, `region.notFoundHint` | That region is not in the catalogue / The link may be old, or the region has no published places yet. | `That region is not in the catalogue. The link may be old.` then the nearest three regions by name (button: All regions) |
| 31 | `layer.loadFailed`, `layer.retry` | This list did not load. Check your connection and try again. / Try again | keep |
| 32 | `places.locateDenied`, `places.locateFailed` | Location is switched off for Carta. Turn it on in your browser, or type a place. / Your location did not come through. Type a place instead. | keep |
| 33 | `filter.showNone` | No places match | keep as the button label; the sheet shows one line above it: `Nothing matches all of these. Turn one off.` |
| 34 | `brief.noTrips` | No published trips here yet. | `No published week in {country} yet. The nearest are below.` then the nearest three (planner country brief) |
| 35 | `brief.loadFailed` | Could not load this. | `This did not load. Check your connection and try again.` (button: Try again) |

Pickers, `src/components/OriginPicker.jsx`, `CountryPicker.jsx`, `Dropdown.jsx`, `src/planner/GuidedTripWizard.jsx`

| # | Key | Today | Proposed |
|---|---|---|---|
| 36 | `origin.noMatch` | No airport matches "{query}". | `No airport matches "{query}". Try the city name, or the three-letter code.` |
| 37 | `origin.driveNoMatch` | Nothing found for "{query}". Try the town name plus its country. | keep |
| 38 | `wizard.noCityMatches` | No city matches "{q}". | `No place in the catalogue matches "{q}". Try the nearest larger town.` |
| 39 | `Dropdown.jsx` line 136, hardcoded | No matches | `Nothing matches that` as a key, `dropdown.noMatch`, in six catalogues |
| 40 | `GuidedTripWizard.jsx` line 3156, hardcoded | No match in {country} for "{q}". | `No place in {country} matches "{q}".` as a key, `wizard.noStayMatch`, in six catalogues |

Trip planner, `src/planner/*`

| # | Key | Today | Proposed |
|---|---|---|---|
| 41 | `quiz.noMatches` | Nothing in the catalogue matches that mix yet. Try another trip type, or pick countries by hand. | keep (buttons already exist) |
| 42 | `ready.noneFit`, `ready.showAnyLength`, `ready.buildOwn` | No ready-made trip runs {days} days in these countries. / Show any length / Build your own instead | keep |
| 43 | `ready.noTripYet` | No trip chosen yet. Go back a step and pick one. | keep (the back button is on screen) |
| 44 | `ready.stopsMissing` | {n} stops on this trip are not in the catalogue, so they were left out. | keep; it is a partial state and says exactly what it is |
| 45 | `chat.townNoNearby` | Nothing close by, try search, the map, or ask Carta. | `No catalogue town within reach of here. Search by name, pick one on the map, or ask Carta.` with the three as buttons |
| 46 | `chat.townAiEmpty` | No suggestions came back, try rephrasing. | `No suggestion came back. Say it another way, or pick a town on the map.` |
| 47 | `extras.importNothing` | Nothing recognisable in there. Try the confirmation itself rather than a screenshot of an app. | keep |
| 48 | `extras.importBadUrl` | That link could not be read. Check it opens in your browser, or paste the text instead. | keep |
| 49 | `itin.freeDay` | A free day in {city}: wander, eat well, no plans. Shape it in the Day planner any time. | keep (button: Plan this day) |
| 50 | `day.noSavedTrips`, `day.planATrip` | No saved trips yet. Build one, then plan its days here. / Plan a trip | keep |

Day planner, `src/planner/DayPlanPanel.jsx`, `DayAddPanel.jsx`, `DayExploreBuilder.jsx`, `DayIdeasStep.jsx`, `DayWorkspaceChrome.jsx`

| # | Key | Today | Proposed |
|---|---|---|---|
| 51 | `dayws.emptyTitle`, `dayws.emptySub`, `dayws.emptyAsk`, `dayws.emptyBrowse` | Plan day {n} / Tap a pin on the map, or start from a ready-made day for {city}. / Ask Carta / Browse places | keep; this is the pattern the others should look like |
| 52 | `dayws.readyNone` | No ready-made day for this town yet. Build one under Custom, or ask Carta. | keep (buttons: Custom, Ask Carta) |
| 53 | `dayws.pickNone` | Nothing in this pick here. Try All, or search by name. | `Nothing of that kind around {city}. Show all, or search by name.` (button: Show all) |
| 54 | `dayws.stayNoMatch` | No match for that address. Add the city name and try again. | keep |
| 55 | `day.poiSearchEmpty` | Nothing catalogued matches "{q}" around {city}. | `Nothing catalogued matches "{q}" around {city}. Add it by name and it goes on the map as yours.` (button: Add "{q}") |
| 56 | `dayex.noneHere` | Nothing of this kind within reach of your stay. Try another filter. | `Nothing of this kind within reach of your stay. The nearest is {name}, {km} km away.` (button: Show all kinds) |
| 57 | `dayex.trayEmpty` | Nothing picked yet | keep (a label) |
| 58 | `dayex.trayNone` | Add a place and it shows up here. | keep |
| 59 | `ideas.noHits` | Nothing found for "{q}". Try another spelling, or a nearby town. | keep |

Account, saved and community, `src/auth/*`, `src/community/*`

| # | Key | Today | Proposed |
|---|---|---|---|
| 60 | `saved.destinationsEmpty` | Nothing saved yet. Save a place from the map and it waits for you here. | keep (button: Explore) |
| 61 | `saved.upcomingEmpty` | No trips on the calendar. Build a route with a few stops and it lands here with its dates. | keep (button: Plan a trip) |
| 62 | `saved.dayPlansEmpty` | No day plans yet. Shape a day in a city and it stays on this device. | keep (button: Plan a day) |
| 63 | `saved.pastEmpty` | Nothing here yet. Finish a trip and it is kept here, or add one you have already taken. | keep (button: Add a past trip) |
| 64 | `fav.shortlistEmpty` | Nothing starred yet. Tap the star on any place, walk, beach, lake, mountain or cycle route to keep it here. | keep |
| 65 | `friends.emptyPeople` | Nobody yet. Ask a friend for their handle, or send them yours. | keep (button: Share my handle) |
| 66 | `friends.emptyTrips` | No plans here yet. Show one of your own trips and your friends can follow it. | keep |
| 67 | `friends.noneYet` | Nobody yet. Add someone by their handle and you can each see the trips you choose to show. | keep |
| 68 | `friends.tripGone` | This trip is not being shown any more. | `This trip is not being shown any more. Your friend took it off their list.` (button: Friends) |
| 69 | `guides.empty` | Nothing published yet. The first guide here could be yours. | keep (button: Publish a trip) |
| 70 | `guides.gone` | This guide is not published any more. | keep (button: Guides) |
| 71 | `share.gone`, `share.goneSub`, `share.exploreCta` | This link no longer works / The person who made it has withdrawn it, or it has expired. / Price your own trip | keep |

After this design: 71 states, 0 that offer nothing to do, 14 that carry the nearest three (rows 3, 4, 5, 9, 13, 18, 22, 27, 30, 34 and the microstate cases), 7 that print a coverage reason in words (rows 3, 4, 15, 20, 22 and the two `na` layers), 0 stale, 0 hardcoded. The seven dead keys are deleted from the six catalogues by the implementing task.

### The detail-page rule

A section on a destination, trail, beach, lake or mountain page that has nothing to show does not vanish. It keeps its heading and shows one line in the module's short form: `No published {things} within {km} km of {place}. The nearest is {name}, {km} km away.` with the nearest as a link. The five components named in the before count (`NearbyOutdoors`, `RoutesFromHere`, `GettingThere`, `Neighbourhoods`, `AroundHere`) each return null today; the implementing task gives each the one line. The exception is a section whose absence is not a gap but a fact about the place (no neighbourhoods on a village), which stays hidden; the implementing task decides per section and writes the reason in its report.

## Before you ship

The seven questions from the carta-design skill, answered for this design.

No hex anywhere; every colour is a token. No gradient, no shadow on the module, no second saturated hue: `--accent` on the page's one primary and on focus, nothing else. No ochre, teal or `--danger` on any empty state, because nothing here is a rating, a gem or a deletion. Mono carries the count line, the distances and the dates in the strip; every sentence is `--ui`. One primary per view, and the empty states only ever add a secondary. The opening `h1` carries a number and the buttons carry verbs. The thing removed: the round icon mark on `.saved-empty`, which carries nothing the sentence does not; the implementing task drops it so the one designed empty state and the module look like the same product.

## The approval

The owner approves this page, and in doing so decides three things it depends on: that the Destinations tab opens on walks instead of journey styles (Part 1, second 0 to 10); that the default dates come from the calendar and not from the fare window; and that the flight door on the first receipt is the only place the airport is asked. T099 builds the first-run path and `docs/FIRST_RUN_RESULT.md`; the empty states are a separate implementation task (register row T211-b) that reads this page's tables.
