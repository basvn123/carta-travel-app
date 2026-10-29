# T819 to T826: one trip page in tabs, Edit trip on one edge, Carta plans every day, Carta's trips like Explore, Trips for you like Booking

## Shared header

**Date.** 2026-10-29.

**Ask.** The owner, in chat, after marking the research board (artifact `1eZACwTapyA9qMtHV4ineL`).
- **Wanted:** Airbnb, Expedia, Mindtrip (with screenshots), Navan, Wanderlog, cost concept C (tiles with Group / Per person) and direction 2 (cost band first).
- **Maybe:** Booking.
- **Rejected:** TripIt, the cost dropdown, the split bar, the side rail and section cards.
- Then, using /impeccable and a plan first:
  - make the trip overview clean, with a map and the cost split;
  - fix See trip details and Edit trip;
  - fix the Plan your days flow;
  - restyle Carta's own trips like Explore's cards, with the filters behind a Filters button in Explore's style;
  - give that page a better width, no white band under the photos and no logo;
  - check every flow at phone, laptop and desktop width.

**Owner answers.**
- One trip page with tabs.
- "Let Carta plan them" plans every day, one by one.
- Four cost tiles.

**Plan.** `C:\Users\Gebruiker\.claude\plans\atomic-coalescing-bumblebee.md` (approved).

**Task numbers.** T819 to T826. T818 was the highest number in `git log --all` and in `Execution/`.

**Branches.** `p15-trip-page-v3` in continent-app (8 commits, listed per task) and `p15-trip-page-v3` in the root repo (sync, report and register).

**Checks.**
- `npm test`: 992 of 992 (980 before, plus 10 cost tile tests and 2 from T818).
- ESLint on every touched file: 0 errors.
- NOPUBLIC fast build (`wt/vite.pf2-batch.mjs` with `PF_ROOT` set to the main continent-app, about 10 s).

**End check.**
- `wt/v3-walk.mjs`: 100 of 100 at 390, 1024 and 1440 px, with no page or console errors. It covers the whole flow, from Plan home through Help me choose, Trips for you (Full cost), the preview, Getting there, Review and Finish, to the trip page. On the trip page it checks every tab, the tiles, the switch, the map, Edit and back, and Plan your days with Carta (including a hiccup on day 3 and Plan the rest). It ends with Back to the trip and All trips.
- `wt/v3-carta.mjs`: 33 of 33 at the same three widths.
- Screenshots are in `Portfolio/wt/v3-shots/`.

---

## T819: one trip page in tabs

**What changed.** A planned trip is now one page instead of a summary card and a different-looking workspace.
- **Top row:** All trips, Save and Settings. No logo.
- **Photos:** sharp photos at the width they are drawn (up to 1600 px). On a laptop and up they form a band, so the cost and the map are in the first screen.
- **Name and chips:** the name, then a row of fact chips (places, dates with any nights note, people, from and Lifestyle). Each chip opens what sets it: Trip settings, the Lifestyle sheet, or the Itinerary tab. On a phone the row scrolls sideways.
- **Tabs:** Overview, Itinerary, Costs and Days, using the kit Tabs with arrow keys.
- **From 1024 px:** a sticky column beside the tabs holds the map card (still on touch, expands to full size) and the trip's tools (Plan your days, Edit trip, Trip settings, Export and share).
- **Below 1024 px:** the map card sits in the Overview under the cost band, and the tools come at its end.
- See trip details is now the Itinerary tab, so nothing jumps to a new layout.
- The From chip falls back to the origin code's label (`originLabel`) when the settings hold no name; before, the summary said "Home".

**Files.**
- Modified: `src/planner/TripSummary.jsx` (rewritten as the page; `TripHead` kept for TripFlow), `src/planner/TripSummary.css`, `src/planner/TripPlannerTab.jsx`, the six `src/i18n/*.js` (keys `tp.*`).
- **Commit:** `c144f76`.

**Measurements.** Not measured: there is no figure to move, and the build gained no new chunk.

**What broke.** The first card map zoomed in on one stop. The fix gives the card and the full map room for the pin labels: `CARD_MAP_PAD` and `FULL_MAP_PAD`, which leave right padding for the name tags.

**Still open.**
- The tab is not in the address yet; Back and a reload return to Overview (T819-a).
- There is no sticky phone bar with the total and Plan your days (T819-b).

**End check covered.** Overview, Itinerary, Costs and Days at 390, 1024 and 1440 px; the chips; the map card; All trips.

## T820: the cost band and the four tiles

**What changed.** The Overview leads with what the trip costs.
- **The band:** "Total for 2 people", the total to the cent, then "€965.60 a person · €276 a day", and a Group / Per person switch.
- **Four tiles,** each with one line:
  - Flights, with the airlines (it becomes Driving on a drive trip);
  - Getting around (airport transfers, between your stops, car hire);
  - Stay ("7 nights, €70 a night");
  - Food ("€126 a day").
- **Where the figures come from:** `costTiles(priced)`, which sums `quoteTrip()`'s own parts. The four always add up to `grandTotal` to the cent.
  - An empty tile says "Not needed".
  - A way with no price says "Not available yet", never €0.
- **Taps:** a tile opens its group in the Costs tab; View breakdown opens the Costs tab.
- **The route:** one grammar for every row (a 40 px marker, a title, one line, the part's figure on the right), so every row starts on one left edge. In the walk the left edges were 32/92 px for all six rows.

**Files.**
- Created: `src/lib/price/tiles.js`, `src/planner/trip/CostTiles.jsx`, `tests/costTiles.test.mjs` (10 tests).
- **Commit:** `8d8c5f7`.

**Measurements.**

| Metric | Before | After |
|---|---|---|
| Cost split shown on the overview | total only | 4 tiles; their sum equals the total (1,931.20 = 1,931.20 at all widths) |
| Route rows on one left edge | no (stop photo 48 px, 6 px off) | yes |

**What broke.** Nothing.

**End check covered.** The tiles' sum against the total; the per person switch (€1,931.20 to €965.60); a Stay tile tap lands on the Stay group.

## T821: Itinerary and Costs tabs

**What changed.**
- `TripItinerary` takes `sections`, so each tab shows its part:
  - Itinerary: the route, the tools, export, and before you go;
  - Costs: the receipt;
  - Days: the days list.
- `PlanTotal` takes `grouped`. The Costs tab's receipt is always open, its lines sit under the four tiles' headings (`#tp-cost-travel`, `#tp-cost-around`, `#tp-cost-stay`, `#tp-cost-food`), and each heading carries its sum. Each line keeps its "what I paid" field.

**Files.**
- Modified: `src/planner/TripItinerary.jsx`, `src/planner/PlanTotal.jsx`.
- **Commit:** `773a651`.

**Measurements.** Not measured.

**What broke.** Nothing.

**Still open.** The old planned-trip workspace (`plan-ws` with `is-planned`) is now reached only with zero stops. It can be removed in a cleanup task (T821-a).

## T822: Edit trip on one left edge

**What changed.**
- **The clipped edge:** "Vhen are you travelling", "tart" and "ou might love" were cut off because the stop editor's blocks were direct children of `.plan-ws-scroll`, which has no side padding. Every block now sits inside the gutter: 16 px on a phone, 24 px from 769 px.
- **The rail:** the suggestion rail snaps inside the gutter.
- **The footer:** Done is the one primary. Save trip is the quiet second; it was a second brown fill.

**Files.**
- Modified: `src/styles/planners/67-v6-tripplanner.css`.
- **Commit:** `c959015`.

**Measurements.**

| Metric | Before | After |
|---|---|---|
| Edit headings at x = 0 of the panel | 6 of 14 | 0 |

**What broke.** Nothing.

**Still open.** Edit is still its own workspace with the half-screen map, not inside the trip page's shell (T822-a).

**End check covered.** Edit at 390, 1024 and 1440 px; Done back to the trip page.

## T823: Plan your days, and Carta plans every day

**What changed.**
- **Crash fixed.** "Plan your days" crashed the app ("This page stopped working") with either answer on the Hallstatt trip. The days overview drew an idea's text as given, and one layer hands a structured `{ref, code}` value where a sentence goes. Every idea row's name, line and description are now plain text (`plainRow`), and so are kept ideas.
- **Every day planned.** "Let Carta plan them" now plans every day without places, one by one:
  - A queue in the day planner moves to each day and asks `plan-day` through the same `runAi` the form uses (Gemini, no new provider). Each answer goes on the map with `applyAiResult` as it lands.
  - A bar shows "Carta is planning day 2 of 7, Hallstatt" with Stop and a progress line, then the count of planned days.
  - A day whose town has too few places left is named, not skipped quietly.
  - A hiccup stops the queue and says how far it got, with Plan the rest. A spent allowance offers the Trip Pass.
  - Guests keep the bot's form, which says it needs an account.
- **Walk seam.** `?aiplanmock` (and `=busy3`) answers from the day's own candidates. It is compiled out without `VITE_E2E_SEAMS`.

**Files.**
- Modified: `src/planner/days/dayIdeas.js`, `src/planner/days/TripDaysOverview.jsx`, `src/planner/DayPlannerTab.jsx`, `src/planner/aiDayPlan.js`, the six `src/i18n/*.js` (keys `tp.auto.*`).
- Created: `src/planner/days/AutoPlanBar.jsx`, `src/planner/days/AutoPlanBar.css`.
- **Commits:** `5022464` (the crash) and `932a02c` (the queue).

**Measurements.**

| Metric | Before | After |
|---|---|---|
| Days Carta plans from "Let Carta plan them" | 1 (day 1) | every day with places left (6 of 7 on Hallstatt; the 7th is named) |
| Plan your days on Hallstatt | app crash | opens |

**What broke.** The crash above was there before this batch.

**Still open.**
- The live run needs a real account (T823-a).
- The layer that sends `{ref, code}` is not identified (T823-b).
- The day planner's total differs from the trip page's after a flight pick (T826-a).

**End check covered.** The ask sheet, the queue at all widths, Stop, the hiccup and Plan the rest at 390, Back to the trip.

## T824: Carta's own trips like Explore

**What changed.**
- **Header:** no mark at the top; the title and one line of what every trip holds. The four "included" tiles are gone, and the Plan home fan loses its mark too.
- **Cards:** every week is Explore's card (`TripPlaceCard`). One badge sits on the photo ("In season", else "7 days"), with the bookmark. The words sit straight on the ground, with no white band: name, flag and country with the number of places, style and months, then "From €35 a person a day" and the flight chip.
- **Grid:** up to 1440 px with about 260 px a card (3, 4 and 5 across). A phone gets the side-lying list.
- **Filters:** the style chips moved into Explore's Filters sheet (`PlacesFilterSheet`). It holds style, cost a person, theme, month, cheap beds, saved and the order.
  - The filters that are on show as chips.
  - The count sits at the end of the row.
  - An empty result gets one line and Clear filters.
  - A reload keeps the filters (session).
- **Saves:** the bookmark saves on the device (`carta.savedJourneys.v1`).

**Files.**
- Created: `src/browse/TripPlaceCard.jsx`, `src/lib/journeySaves.js`.
- Modified: `src/planner/flow/CartaTrips.jsx`, `src/browse/JourneyCards.jsx` (exports `DayFrom`, `useCardFlight`, `monthsLine`), `src/planner/flow/PlanHome.jsx`, `src/styles/86-plan-flow.css`, the six `src/i18n/*.js`.
- **Commit:** `ea4699b`.

**Measurements.**

| Metric | Before | After |
|---|---|---|
| Columns at 1440 px | 3 (max 1200 px) | 5 (max 1440 px) |
| Card body background | white box with border | transparent |
| Badges on a photo | 0 | 1 |

**What broke.** A global `.xchips-lead { display: none }` hid the Filters button outside Explore. The fix is a rule scoped to `.pf-carta-bar`.

**Still open.**
- Saved trips show only behind the Saved filter, not in My trips (T824-a).
- The card CSS mirrors Explore's `.xov--card` instead of sharing it (T824-b). This was deliberate, so Explore's pixels stay untouched.

**End check covered.** The page and the Filters sheet at 390, 1024 and 1440 px; a style filter; reload; save.

## T825: Trips for you like Booking

**What changed.**
- **The list:** one column up to 960 px.
- **The card from 769 px:** a row in three parts.
  - Left: the photos, about 280 px.
  - Middle: the name, country, nights and bases, the reason and the catch, and Compare and Skip.
  - Right: the price block. It says what the figure covers ("7 nights, 2 people"), then the total a person and the group's total, the budget note, Full cost (flight, stay and days as rows) and See the trip.
- **A phone:** the three parts stack, photo first.

**Files.**
- Modified: `src/planner/finder/TripCard.jsx`, `src/styles/87-trip-finder.css`, the six `src/i18n/*.js`.
- **Commit:** `c1518f4`.

**Measurements.** Full cost on the first card: 251 + 246 + 473 = 970 against a total of 970.

**What broke.** Nothing.

**Still open.** Full cost uses the finder's three figures, not the four tiles. Finder trips carry no `quoteTrip` parts (T825-a).

## T826: the end check

**What changed.** No code. The checks are in the header. The walk scripts sit outside the repo: `wt/v3-walk.head.mjs`, `wt/v3-walk.tail.mjs` (concatenated to `v3-walk.mjs`) and `wt/v3-carta.mjs`. They serve `wt/v3-dist` through `wt/t809-serve.mjs` on :5830.

**Bundle.** The `assets/` folder is 8,206,476 bytes after the batch. There is no before figure for this batch; the next task can compare.

**Recommendation check.**
- Every Trips for you card's Full cost adds up to its total within rounding.
- Review equals the trip page (€1,931.20) at every width.
- The full 120-trip `t818-gap` run was not repeated: T818 measured 120 of 120 equal to the cent, and this batch changed no pricing code.

**Still open.**
- Owner review, merge and deploy (T826-b).
- The €8 day planner total gap (T826-a).

## Rollback procedure

- **App:** `git -C continent-app revert` the eight commits listed above (each task stands alone), or reset `p15-trip-page-v3`. Nothing is merged to `master` yet.
- **Root:** revert the sync and report commits on `p15-trip-page-v3`.
- **Data:** no data, schema or Edge Function change. The new device keys `carta.savedJourneys.v1` and the session key `carta.cartaTrips.filters.v1` are harmless if left.
