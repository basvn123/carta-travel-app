# T584 to T594: Explore v6 (owner request 2026-10-22, reference board)

## Shared header

**Date:** 2026-10-22

**Batch:** eleven tasks from one owner request: Ask Carta's ground (T584), a start dialog (T585), Explore as an overview (T586), Komoot-style story rails on every browse tab (T587), the focused view's toolbar (T588), a compact filter pane (T589), the place card and prices with icons with the estimate word removed (T590), a shorter hover preview (T591), the map the Kayak way (T592), the outdoor tabs with a What and Where bar and route lines (T593), and a site footer (T594).

**Where the decisions come from:** market research by three research agents (Airbnb, Booking, Google Travel, Kayak, Skyscanner, Tripadvisor, GetYourGuide, Komoot, AllTrails, Lonely Planet, Apple Maps Guides, Netflix; Hostelworld, Zillow, Rightmove, Baymard on filters; Google Maps sheets, Wanderlog, Rome2Rio on previews), then the owner's own reference board (claude.ai artifact "Carta reference board", 11 screenshots with notes, read 2026-10-22). The owner's notes overrode carta-design in eight places; they are written into `.claude/skills/carta-design/SKILL.md` ("Explore v6") and PRODUCT.md in this commit.

**Owner question answered (no task):** "Do I need a cookie banner like Airbnb's?" No. The app sets no cookies, runs no third-party analytics, and its telemetry is first-party counters with no device, session or page id stored on the device (`lib/launchEvents.js`, `lib/paywallEvents.js`; decision T214). The only third-party requests are content (the Carto basemap, Wikimedia images). A banner would be needed only if an analytics or marketing tag is ever added.

**Branches:** app repo `p11-explore-v6` from master d05b895, with seven tasks built in parallel worktrees (`wt/t586-overview`, `wt/t587-rails`, `wt/t589-filters`, `wt/t590-cards`, `wt/t592-map`, `wt/t593-outdoor`, `wt/t594-footer`, each on `p11-v6-*`) and merged into it; root repo `p11-explore-v6` from main 4477ae4c9 carries the mirror, the design rules, this report and the register.

**App commits:** T584 ec9b9b7; T585 eb875b7; T586 cb9e0d0, a091d48, 9f8b862; T587 12a39f3, e78feb4; T588 3b442dc; T589 c59f624, 7b41942; T590 0982a52, 0750574; T591 7b1d64b, 7cfb6c4; T592 a42e195, f591658, 10fadf1; T593 2567656, 0624a98; T594 dcddd48. Merges: footer, map, filters, rails, outdoor, cards (conflict in ExploreTab imports, resolved by hand), overview (i18n blocks, both sides kept). ExploreTab.jsx and the six i18n files carry several tasks, so reverting one task there may need a hand merge; every other file belongs to one task.

**Checks (static):** eslint on every touched file, 0 new errors (the one error, `ExploreMap.jsx` exhaustive-deps on `collectKpins`, is on master already); `npm test` in the main checkout 649 of 649 pass (648 before; T590 added the dates test); `scripts/ci/design-lint.mjs` 13 findings, all on master already, none from this batch; NOPUBLIC build (`wt/vite.t594b.mjs`) built in 13.5 s. Note: `npm test` fails 3 numbers-page tests inside a worktree because `public/boot.json` is not there; it passes in the main checkout.

**End check (browser, once, on the merged batch):** dev server on 5191, Playwright at 1440x900 and 390x844 (the DevTools Chrome was held by another session), driven by a click-through script of the whole flow (scratchpad `flow.mjs`): overview, See all on a rail, hover a card, Filters open and closed, Sort menu, Map, pick a pin, Open the place, Back, List, the Explore link back, Show all places and browser Back, a Where search, the category pills, Trails and Cycling with a country and their map, the start dialog, the footer on both widths. The owner asked for this flow test in the session ("explore tab needs to be easy to navigate and clear for the user"). Seven defects were found and fixed on the batch branch (see each task's "What broke"). No horizontal scroll at 390 px on any step.

**Rollback for the batch:** `git -C continent-app reset --hard d05b895` and `git reset --hard 4477ae4c9` on the two branches, or `git revert` of the commits above. No data, schema, server or worker state changed.

---

## T584: Ask Carta blends into the page

### What changed
The chat panel's head and the foot with the field were white `--surface` bands on the warm panel. Both now stand on `--surface-page`; a hairline shows under the head only when the conversation has scrolled under it, and above the foot only when there is more below. The white field with its edge is the one object at the foot.

### Files touched
Modified: `continent-app/src/styles/76-ask-chat.css`, `continent-app/src/browse/ask/AskChat.jsx` (markEdges on scroll and after each render).

### Commands run
`npx eslint src/browse/ask/AskChat.jsx`; Playwright screenshot with the chat open at 1440 and 390.

### Config and secrets set
None.

### Before/after measurements
Not measured.

### What broke and how it was fixed
No issues.

### What is still open
None.

### Rollback
`git -C continent-app revert ec9b9b7`.

### End check list
Ask Carta open on desktop and phone, empty and with a long conversation (the hairlines appear only while scrolled).

---

## T585: the start dialog

### What changed
From 1024 px, the first time Explore opens on a device, a dialog asks "What matters most on this trip?": a labelled field whose text goes to Ask Carta, then "Have details? Share what you know." with From, Where to, When and Who rows showing the settings line's values, and one primary "Show places". It never shows on a phone, over a link that already carries a view (any `x*` param or a hash), or in a scripted browser; "Tell Carta what you want" on the overview reopens it. Kept in `carta.exploreStart.v1`.

### Files touched
Created: `continent-app/src/browse/StartDialog.jsx`. Modified: `ExploreTab.jsx` (mount, door), `styles/84-explore-overview.css`, i18n `explore.start*` keys in six languages.

### Commands run
eslint; opened from the hero door in the end check.

### Config and secrets set
localStorage key `carta.exploreStart.v1` (per device).

### Before/after measurements
Not measured.

### What broke and how it was fixed
No issues.

### What is still open
T585-a: a row opens its settings part by clicking the settings line's own button on the page, because SettingsLine has no way to open a part from outside; a small `openPart()` hook would be sturdier.

### Rollback
`git -C continent-app revert eb875b7`.

### End check list
Desktop first visit (clear the key), the door, each row, Escape and the scrim, Show places.

---

## T586: Explore opens as an overview

### What changed
Explore was everything at once: tiles, rails, the full list and a long side pane. At rest it is now an overview: "Find your next trip", a What and Where bar (What is Places, the five categories and Trip styles; Where is the place search; a secondary Search), the "Tell Carta" door, one row of category pills, the story rails full width, and "Show all places" with the map toggle. No side pane and no list on the overview. Any See all, chip, search or Show all opens the focused view as one history step; an "Explore" link above its title clears the lens, and the browser's Back returns to the overview. The category pills replace the Browse tiles on Explore and on every category tab (both widths). The settings line's countries no longer count as a lens.

### Files touched
Modified: `continent-app/src/browse/ExploreTab.jsx` (overview, lens history hook `useExploreLens`, `xall=1`), `ExploreCategories.jsx` (`variant="row"`), `DestinationsTab.jsx` (the pill row), `styles/84-explore-overview.css` (new), i18n `explore.*`.

### Commands run
eslint; the flow script at both widths.

### Config and secrets set
None. New URL param `xall`.

### Before/after measurements
| Metric | Before | After | Delta |
|---|---|---|---|
| Explore at rest, desktop: side pane shown | yes (1,487 px of content) | no | removed |
| Explore at rest: full list under the rails | yes (48 rows a page) | no ("Show all places") | removed |

### What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| "Best in October" above a trip the settings line dates 21 to 28 Nov | `travelMonth` is set only for dates the traveller chose; default dates fell back to today | the rails take the month the settings line shows (9f8b862) |
| The "Explore" link left the lens in place after the map or a place page | it stepped back through history, which held the map's and the place's own steps | the link clears the lens in place, including the new floor, flight limit and pick (9f8b862) |
| A Where search narrowed the list with nothing on screen saying so | no chip for the query | the query shows as a removable chip (9f8b862) |
| Category tabs kept the old Browse tiles in their side pane | only Explore had the pill row | DestinationsTab uses `variant="row"` on both widths (a091d48) |
| On a phone the map view kept the pills and the back link above a short map | layout | hidden in the phone map view (a091d48) |

### What is still open
T586-a: browser Forward into a lens does not restore the lens's filters.
T586-b: the overview hides the list with CSS rather than not rendering it (cost on slow phones not measured).
T586-c: the rails' extra door row ("Go without a car") sits alone at the foot of the overview; whether doors belong on the overview is an owner call.

### Rollback
`git -C continent-app revert 9f8b862 a091d48 cb9e0d0`.

### End check list
Overview both widths; See all; Show all places and Back; the Explore link from list and map; a Where search; each category pill.

---

## T587: story rails on every browse tab

### What changed
Every browse rail (Explore's place rails, Trip styles, and the openings of Trails, Beaches, Lakes, Mountains and Cycling) is now a story rail after the owner's Komoot reference: a lead card on `--surface-sunken`, tilted -2deg, holding the heading, one line, up to three icon facts drawn from the rail's rows (cheapest day, the month, the top Score, a km range or a summit) and See all; then 4:5 photo cards with a status pill and the Score pill on the photo, the title and price under it on the page ground. Cards lift on hover, the lead straightens, cards arrive once with a short stagger; none of it under reduced motion.

### Files touched
Created: `continent-app/src/browse/StoryRail.jsx`, `styles/80-story-rail.css`. Modified: `ExploreRails.jsx`, `TripStylesRow.jsx`, `SectionOpening.jsx`, `ExploreTab.jsx` (one line: the month), i18n `rail.*`.

### Commands run
eslint; design-lint; NOPUBLIC build (9 s in the worktree).

### Config and secrets set
None.

### Before/after measurements
Not measured.

### What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| On the merged build every rail drew on top of the next, stair-stepped | the new rail used `.srail`, the class of the existing sticky section rail (`position: sticky`, `height: var(--tap)`) | the story rail's classes are `.storyr` (e78feb4) |

### What is still open
T587-a: country and region pages, the weeks rail and the countries track still use the old `Strip`; section cards show one photo where the old tiles swiped through several.

### Rollback
`git -C continent-app revert e78feb4 12a39f3`.

### End check list
Overview rails at both widths (tilt, hover lift, pills, dots and arrows); a category tab's opening rails.

---

## T588: the focused view's toolbar

### What changed
The focused view's head is "Places in Europe" with the live count under it, then one row of pill buttons: Share (copies the link, "Link copied"), Sort (a menu instead of a bare select), Filters with its count (opens and closes the desktop pane, the sheet on a phone), Saved (the shortlist, out of the filter pane), Countries on a phone, and the Map or List toggle last. On a phone the row scrolls sideways.

### Files touched
Modified: `ExploreTab.jsx` (toolbar, SortMenu, local toast), `components/Icons.jsx` (SortIcon), `styles/84-explore-overview.css`, i18n `explore.*`.

### Commands run
eslint; the flow script (Sort menu, Filters, Saved).

### Config and secrets set
None.

### Before/after measurements
Not measured.

### What broke and how it was fixed
No issues.

### What is still open
T588-a: there is no shared toast helper, so Share's toast is local to ExploreTab.

### Rollback
`git -C continent-app revert 3b442dc`.

### End check list
Toolbar at both widths, Sort menu with keyboard and Escape, Filters on desktop and phone, Saved pressed state.

---

## T589: the filter pane

### What changed
The pane, after the owner's Hostelworld reference: a head with the live count and Clear all; Kind of place as small icon chips; Good for (A base for the week, A day trip, A stop on the way) high and never folded with one help line; Budget a day as a stepped two-thumb range (a floor `xbm` and a ceiling); the month as twelve letter chips plus Any; Size in plain words (Big city, City, Town, Village, Countryside) without the glyphs the owner said nobody understood; Rating, the new Flight up to (`xfh`: Any, 2, 3, 4, 6 h) and Max travel time as short Segmented controls; Good to know as icon, word and switch rows. Country (in the settings line), Browse (now the pill row) and the shortlist (now Saved in the toolbar) left the pane.

### Files touched
Modified: `continent-app/src/browse/ExploreFilterRail.jsx` (rewritten), `ExploreTab.jsx` (xf.bmin, xf.fh, URL, predicates, chips, count and clear), `styles/78-filter-pane.css` (new), i18n `filter.*`.

### Commands run
eslint; design-lint; Playwright DOM measure of the pane.

### Config and secrets set
None. New URL params `xbm`, `xfh`.

### Before/after measurements
| Metric | Before | After | Delta |
|---|---|---|---|
| Desktop pane content height, 1440x900 focused view | 1,487 px (Size, Role and Country folded shut) | 1,191 px (nothing folded) | -296 px (-20%) |
| Window the pane scrolls in | 776 px | 776 px | 0 |
| Filters a traveller can see without opening a fold | 7 groups | 9 groups | +2 |

### What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| design-lint: new `raw-button` for the month letters | a hand-made radio button | kit choice Chips, the tick hidden (7b41942) |

### What is still open
T589-a: the pane is about 1.5 screens, not one. Good to know as chips instead of the owner's switch rows would save about 140 px; that is the owner's call.
T589-b: flight length is worked out from local departure and arrival clock times, so a flight across a time zone reads 1 to 2 h off; the sweep carries no duration.
T589-c: `tests/explore.spec.mjs:96` and parts of `scripts/verify_explore.mjs` still look for the old tiles, selects and folds.

### Rollback
`git -C continent-app revert 7b41942 c59f624`.

### End check list
Pane at 1440, the phone Filters sheet, budget thumbs by drag and keyboard, the month chips, Flight up to with plane and any way.

---

## T590: the place card, prices with icons, and the estimate word gone

### What changed
On the owner's word ("the mention of estimate is not needed"), an estimate shows the tilde only, everywhere `<Money est>` and `formatEst()` run, in receipts, the planner legs and the plan, day and destination PDFs; screen readers hear "about {price}". A new `PriceParts` shows the way there (plane, train, bus or car), the bed and the food and drink as icons with whole-euro figures under one total a person a day; every `DayPrice` uses it. Explore's focused list is now photo cards (Komoot structure: photo on top with the Score pill and save, the text on the page ground, the dates when the traveller set them) in an auto-fill grid from 769 px, and horizontal cards on a phone.

### Files touched
Created: `continent-app/src/components/PriceParts.jsx`, `styles/79-place-card.css`. Modified: `components/ui/Money.jsx`, `lib/money.js`, `browse/ExploreCards.jsx`, `browse/PlaceOverview.jsx`, `lib/placeOverview.js` (`tripDates`), `components/ReceiptCard.jsx`, `planner/TripPlannerTab.jsx`, `lib/dayPdf.js`, `lib/planPdf.js`, `lib/destinationPdf.js`, `scripts/verify_explore.mjs`, `tests/placeOverview.test.mjs`, `tests/wizardSteps.test.mjs`, i18n `card.*` plus `extras.est` and `trip.legSummary`.

### Commands run
eslint; npm test; NOPUBLIC build.

### Config and secrets set
None.

### Before/after measurements
| Metric | Before | After | Delta |
|---|---|---|---|
| Visible "est." on a price, Explore list at 1440 (36 places) | 36 | 0 | -36 |
| Unit tests | 648 | 649 | +1 |

### What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| design-lint: two euro signs in comments | new comments | worded without the symbol (0750574) |

### What is still open
T590-a: "est." remains where it labels a time, not a price (walk and ride minutes, legs in the itinerary, `trip.estimate`), and in unused keys (`money.est`, `prov.est`); `.money-est` CSS is now dead.

### Rollback
`git -C continent-app revert 0750574 0982a52` (brings the word back everywhere at once).

### End check list
The card grid and phone cards with and without own dates; a destination page's price card; a receipt; a PDF.

---

## T591: the hover preview

### What changed
The preview the owner disliked (rank, role, known for, best months with a twelve-month strip, three sights, "worth N days", the reach line and a full receipt) now holds the hook line, one verdict chip for the month, one plan sentence ("2 days in November, about {price} a person") and "Open {place}". Same delays, Escape and hover bridge.

### Files touched
Modified: `continent-app/src/browse/ExploreTab.jsx` (CardPreview), `styles/79-place-card.css`.

### Commands run
eslint; hover in the flow script.

### Config and secrets set
None.

### Before/after measurements
| Metric | Before | After | Delta |
|---|---|---|---|
| Blocks in the preview | 7 | 4 | -3 |

### What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| On a phone the preview opened over the list after See all | focus landing on the first card opened it after 400 ms | a focus opens it only when keyboard-visible on a device with hover (7cfb6c4) |

### What is still open
None.

### Rollback
`git -C continent-app revert 7cfb6c4 7b1d64b`.

### End check list
Hover on desktop beside, left and below a card; a phone list after See all (no preview).

---

## T592: the map, the Kayak way

### What changed
Map view on a desktop is the full width map with a panel floating on its left: the places on the map as rows, or the picked place with its photo, Score and band, region, a "Your trip" box (dates or month and nights, the way there with Google Flights and the airline for a flight, the bed and the food and drink for the nights, one total a person, the one primary "Open {place}") and a short why-go. Price pins read the figure first. The List | Map switch became one pill toggle (Map in the list, List on the map). The phone keeps its drawer with the same panel inside.

### Files touched
Created: `continent-app/src/browse/MapPlacePanel.jsx`, `styles/81-map-panel.css`. Modified: `ExploreTab.jsx` (viewSwitch, map region), `ExploreMap.jsx` (pin label, left cover for the camera), i18n `mapPanel.*`.

### Commands run
eslint; the flow script (Map, pick a pin, Open, Back, List).

### Config and secrets set
None.

### Before/after measurements
Not measured.

### What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| Pins framed under the floating panel | the camera framed the whole map width | fit and fly-to pad the left by the panel's width (10fadf1) |

### What is still open
T592-a: the panel's trip total sums the day price over the nights plus the way there itself; it should come from `priceTrip()` as `lib/budgetSearch.js` does.
T592-b: flight times are not shown in the panel because the way rows carry no times.
T592-c: "Why go" reads `knownFor`, which is English only.
T592-d: `.xmap-picked` and `.xdrawer-rows` CSS in `62-v6-explore.css` is now unused.

### Rollback
`git -C continent-app revert 10fadf1 f591658 a42e195`.

### End check list
Desktop map with no pick and with a pick; around 900 px (panel beside the map); the phone drawer.

---

## T593: the outdoor tabs

### What changed
Trails, Beaches, Lakes, Mountains and Cycling open on a What and Where bar (What is the tab's own main facet, Where its place search with locate and suggestions, a secondary Search, and the Map or List pill), a quick filter row ("All filters" and up to four dropdown chips), and on Trails and Cycling a map that draws every route as its line with a "12 km" pill at its start, the hovered one in brown, framed on the country picked.

### Files touched
Created: `continent-app/src/browse/WhereBar.jsx`, `styles/83-where-bar.css`. Modified: `DestinationsTab.jsx`, `OutdoorMap.jsx`, `ExploreMap.jsx` (lines layer, framing, dev error log), i18n `where.*`.

### Commands run
eslint; Playwright on `?tab=explore&cat=trails&dc=trails&dn=AT` and the cycling twin; a glyph request log.

### Config and secrets set
None.

### Before/after measurements
| Metric | Before | After | Delta |
|---|---|---|---|
| Trails map, Austria: routes drawn as lines | 0 (dots) | every route in the list | new |
| Largest line payload handed to the map (Germany) | 0 | 2.66 MB, 114,561 points | new |

### What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| No map toggle while the opening rails showed | the List | Map switch only stood in heads hidden at rest | the one pill sits in the What and Where bar (0624a98) |
| The map opened on all of Europe | the fit fell back to Europe whenever no ids were kept | an outdoor map frames its own rows (0624a98) |
| No lines at all | the layers waited for `style.load`, which fires before the dots layer exists | retry on `styledata` and `idle` until the dots layer is there (0624a98) |
| No km pills | maplibre refused the pill layer's `filter: null`, silently | no filter key when there is none; map errors are now logged in development (0624a98) |
| The bar's pill wrapped to its own row on desktop | a three-column grid | a fourth column when the pill is there (0624a98) |

### What is still open
T593-a: on desktop the side pane repeats the quick filter row, and at rest it can hold only the Country fold; which one stays is an owner call.
T593-b: Germany hands 2.66 MB of line data to the map on every list change; measure on a slow phone.
T593-c: Europe-wide Trails has no map (the routes load per country).
T593-d: Trails' What uses highlights; "Walks, day hikes, hut to hut" has no facet behind it.

### Rollback
`git -C continent-app revert 0624a98 2567656`.

### End check list
Each outdoor tab's bar at both widths; a quick chip popover; Trails and Cycling maps for one country (lines, pills, hover).

---

## T594: the site footer

### What changed
Every page-like tab now ends on a footer like the owner's Rightmove reference, on `--surface-sunken`: the mark, the positioning sentence, Explore, Plan, Carta and Legal columns of real links through the app's own door, and the year. No controls, no store badges, absent in map views.

### Files touched
Created: `continent-app/src/components/SiteFooter.jsx`, `styles/82-site-footer.css`. Modified: `App.jsx`, `ExploreTab.jsx`, `DestinationsTab.jsx`, `home/HomePage.jsx`, `planner/PlanStart.jsx`, `pass/PricingPage.jsx`, `auth/AccountPanel.jsx`, `auth/SavedTripsPanel.jsx` (one line each), i18n `footer.*`.

### Commands run
eslint; footer screenshots at both widths.

### Config and secrets set
None.

### Before/after measurements
Not measured.

### What broke and how it was fixed
No issues.

### What is still open
T594-a: the trip and day planners have no footer (fixed-height workspaces); whether they should is an owner call.
T594-b: "Where the numbers come from" and "Data and photo credits" are not in the footer, because neither has a page of its own yet.
T594-c: on a phone the floating Map pill sits over the footer's copyright line at the very bottom.

### Rollback
`git -C continent-app revert dcddd48`.

### End check list
Footer at the end of Explore, a category tab, Home, Plan, Pricing, My trips and Account, at both widths.
