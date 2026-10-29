# T840 to T843: trip page v4 Batch B, the route you can reshape

## Shared header

**Date.** 2026-10-29.

**Ask.** The owner, in chat: "Start Batch B", after Batch A (`Execution/P15/T835-T839-trip-page-v4-a.md`).

**What Batch B covers.** Board marks (`Execution/P15/T834-board/marks.md`) and register rows T837-a to T837-d:
- Panel 4 (change): a cleaner Change flight.
- Panel 6 (change): Change flight with the airline mark, preferences, and no "Google Flights, checked" line.
- Panel 7 (change): Swap city as a choosing flow.
- D2: a stay type per stop.
- D4: day trips go in Batch B.

**Owner answers in chat, before the build.**
- **Flight line:** "remove and change carta's rule". Carta-design is amended (root `.claude/skills/carta-design/SKILL.md`, Flights and Copy). The "Google Flights, checked" line is no longer required, and Change flight shows none.
- **Flight preferences:** kept on the trip and steering which flight is priced.
- **Swap city:** two doors, "I know where" and "Help me choose".
- **Day trips:** priced.

**Task numbers.** T840 to T843. T839 was the highest in `git log --all` and `Execution/`.

**Branches.** Both stacked on Batch A, which is not merged:
- continent-app `p15-trip-page-v4-b`, from `p15-trip-page-v4-a` (`1c2bcd1`): 4 commits, `e56d21e` to `dee9465`.
- Root `p15-trip-page-v4-b`, from `p15-trip-page-v4-a`: sync and rule `1b9cb5fd9`, then this report.

**Checks.**
- `npm test`: 1023 of 1023 (1012 before; 11 new: 4 Change flight, 4 Swap city, 2 on the real app data for stay per stop and day trips, 1 tile shape).
- ESLint on every touched file: 0 errors.
- NOPUBLIC fast build.
- **Line endings.** Each commit was checked against the stored endings, because TripItinerary.jsx, useTripPlanner.js, Icons.jsx and shareLink.js are stored CRLF and the rest LF. trip.js was caught being staged CRLF and re-added before its commit.

**End check.**
- `Execution/P15/T840-T843-walk/walk-b.mjs` on the NOPUBLIC build plus `public/`, served by `serve-a.mjs`: 75 of 75 at 390, 1024 and 1440 px, no page or console errors (`walk.json`).
- It seeds a Slovenia trip (Ljubljana 3 nights, Lake Bled 4, 3 to 10 Nov, from Brussels), with the sweep and live fixtures `tf1-flights-BRU.json` and `tf1-live-BRU-LJU.json`. It walks:
  - Change flight: opening it, the day's flights, Direct only, a pick, the total moving (2097.65 to 2045.65), and Undo.
  - Swap city: the nearest places, a search for Piran, Help me choose with Lakes, the swap, its Undo message, and Undo.
  - A stop's stay type: dorm, 2097.65 to 1808.21.
  - A day trip: the picker, the stop's list, the total plus exactly €12.00, Costs' Day trips line, and Days naming the day out.
- Screenshots are in `Portfolio/wt/v4b-shots/`.

**Rollback, the whole batch.**
- `git -C continent-app checkout p15-trip-page-v4-a` and delete `p15-trip-page-v4-b` there.
- In the root: `git checkout p15-trip-page-v4-a` and delete `p15-trip-page-v4-b`.
- Nothing is merged, pushed or deployed. No schema or data changed. Saved trips gain optional per-stop fields (`stayTier`, `dayTrips`) that older code ignores.

---

## T840: Change flight with the trip's own flight preferences

**What changed.**
- **On the route.** Each flight row on the Itinerary route has one secondary "Change flight" beside its BRU → LJU heading (panel 4: cleaner).
- **The sheet, from the top** (`planner/trip/ChangeFlight.jsx`):
  - the way (BRU to LJU, LJU to BRU);
  - the trip's flight preferences: a Direct flights only switch, and Leave after / Leave before in whole hours;
  - every flight of that day the live search found, cheapest first. Each row: airline mark, times, airline with stops and duration, what the party pays (legCost plus a baby's lap fee) and what it does to the total. The current one is marked "Your flight now". Rows come from `changeFlight.js` `flightRows`.
  - "Add your own fare".
- **Choosing.** Picking a row prices the trip on it (the existing `flightPicks`).
- **The preferences are trip state** (`flightPrefs`: draft, snapshot, Undo history):
  - The engine only prices a flight that fits them (`flights.js` `fitsPrefs` in `pickLeg`), so they still hold after a date change.
  - New preferences drop a pick that no longer fits.
- **The old chips go.** The When to fly chips left the trip page; the preferences replace them.
- **No checked line,** per the owner: carta-design is amended.

**Files.**
- New: `src/planner/trip/ChangeFlight.jsx`, `src/planner/trip/changeFlight.js`, `tests/changeFlight.test.mjs`.
- Modified: `src/lib/flights/flights.js`, `src/lib/price/trip.js`, `src/hooks/useTripPlanner.js`, `src/planner/TripItinerary.jsx`, `src/planner/TripPlannerTab.jsx`, `src/planner/TripSummary.css`, the six i18n files (`tp.fl.*`).
- Root: `.claude/skills/carta-design/SKILL.md`.

**Commit.** `e56d21e`.

**Measurements.** Not measured.

**What broke.**

| What | Cause | Fix |
|---|---|---|
| A pickLeg test chose KLM over Austrian | The test's live answer was not cheapest first, as the API's is | The fixture ordered as the API answers |

**Still open.**
- **T840-a, owner.** The route's flight card still shows "Google Flights, checked {date}" and "View on Google Flights" (FlightRow). The owner's mark named the Change flight sheet. Remove it there too, or keep it on the card?
- **T840-b.** Change flight offers the trip's own days at the trip's own airports. The plan also named:
  - another airport near the first or last stop;
  - home from a different airport (open jaw);
  - a day earlier or later.

  These need the anchor and day logic of the wizard.
- **T840-c.** `flightHours` (the old When to fly bands) is still trip state and still filters the pick. On the trip page it has no control any more, so a trip set in the wizard keeps a band nobody can see. It should be folded into `flightPrefs`.

**End check covered.** Two Change flight buttons, five flights, Direct only, a pick moves the total, Undo, no checked line, at 390, 1024 and 1440.

**Rollback.** Revert `e56d21e`. In the root, revert the SKILL.md part of `1b9cb5fd9` to restore the old rule.

## T841: Swap city as a choosing flow

**What changed.** Each stop has "Swap city" (`planner/trip/SwapCity.jsx`), one sheet with two doors:
- **"I know where":** search every place by name, with accents and case aside. Empty, it lists the nearest places.
- **"Help me choose":**
  - what you want instead (up to three likes);
  - how big a place (Towns, Villages, Cities, Any);
  - how far from the stop (under 60 km, under 150 km, further).

  Carta's picks update as you answer, ranked by Explore's own For you (`lib/match.js` `sortForYou`), so a swap and a browse agree (`swapCity.js`).
- **Every place shows** how far it is and what the swap does to the total, priced once per list.
- **A pick** keeps the stop's dates, nights and stay type, and drops its activities, day trips and the adjacent hops' answers (`useTripPlanner` `swapStop`). The Undo message says "Swapped in {city}".

**Files.**
- New: `src/planner/trip/SwapCity.jsx`, `src/planner/trip/swapCity.js`, `tests/swapCity.test.mjs`.
- Modified: `src/hooks/useTripPlanner.js`, `src/components/Icons.jsx` (`SwapIcon`), `src/planner/TripItinerary.jsx`, `src/planner/TripPlannerTab.jsx`, `src/planner/TripSummary.css`, the six i18n files (`tp.sw.*`).

**Commit.** `d410c03`.

**Measurements.** Not measured.

**What broke.**

| What | Cause | Fix |
|---|---|---|
| The Help me choose test saw no change in order | The test's taste profiles were not in the wire's shape (`likes: { key: [value, fact] }`) | The fixture built in that shape |
| The accent fold's regex was written as literal combining characters | A heredoc ate the backslashes of `\u0300` | Rewritten with escape codes, and checked |
| A stray file was made outside the project, `C:\GEBRUI~1\placeholder.txt` (a mistyped Write) | My error | The removal was refused by a safety check. The owner can delete the folder `C:\GEBRUI~1`; nothing reads it |

**Still open.**
- **T841-a.** Distances are as the crow flies, not travel time. A place across a mountain range may read near.

**End check covered.** Both doors, Piran by search, Lakes picks, the swap, its message and Undo, at every width.

**Rollback.** Revert `d410c03`.

## T842: a stay type per stop

**What changed.**
- **The control.** Above each stop's bed line, a select ("Where you sleep in Ljubljana") lists:
  - the dataset's stay types, as "Hostel: Dorm bed", "Home: Entire place", "Hotel: 3 star" (`sleepGroups.js`, `offeredStayTiers`);
  - or "As the trip: {stay}".
- **The pricing.** The engine prices that stop's beds on its own `stayTier` (`trip.js`), and every other stop keeps the trip's. The tiles still add up to the total to the cent.
- **Where it is kept:** the device draft, the account (`choices.stayTier` per stop, read back by `loadPlan`) and the share link (whitelisted).

**Files.**
- New: `tests/stayPerStop.test.mjs` (real app data; skips without it).
- Modified: `src/lib/price/trip.js`, `src/hooks/useTripPlanner.js` (`setStopStay`, save and load), `src/lib/shareLink.js`, `src/planner/TripItinerary.jsx`, `src/planner/TripPlannerTab.jsx`, `src/planner/TripSummary.css`, the six i18n files (`tp.stay.*`).

**Commit.** `18e557e`.

**Measurements.** Not measured.

**What broke.**

| What | Cause | Fix |
|---|---|---|
| ESLint: useMemo called conditionally | The stay list was computed after the page's early return | A plain computation (the list is short) |

**Still open.** None.

**End check covered.** Two stay selects. Dorm in Ljubljana moves the total 2097.65 to 1808.21 at every width.

**Rollback.** Revert `18e557e`. Saved stops keep a harmless `stayTier` that older code ignores.

## T843: priced day trips from a base

**What changed.**
- **The data.** A stop carries `dayTrips` (`[{ destinationId, day }]`): a day of the stay out and back the same evening, with no night there.
- **The pricing** (`trip.js` `dayTrips`):
  - each trip is priced there and back for the party, with the hop engine's own options and mode pick;
  - a new part, `daytrips`, sits in Getting around (`tiles.js`), with its own receipt line, "Day trips";
  - the tiles still add up to the cent.
- **On the route,** a stop lists its day trips: the day and the place, the way and how long, the cost there and back, and Remove. "Add a day trip" (`DayTripPicker.jsx`): pick the day, then a place within 120 km (or any by name), each with what it adds.
- **On Days,** a day out is named: "Polhov Gradec, a day out from Ljubljana".
- **Where it is kept:** the account, the draft and the share link.

**Files.**
- New: `src/planner/trip/DayTripPicker.jsx`.
- Modified: `src/lib/price/trip.js`, `src/lib/price/tiles.js`, `src/lib/tripTotal.js`, `src/planner/PlanTotal.jsx`, `src/hooks/useTripPlanner.js` (`setStopDayTrips`), `src/planner/TripItinerary.jsx`, `src/planner/TripPlannerTab.jsx`, `src/planner/TripSummary.css`, `tests/costTiles.test.mjs` (9 parts, a day-trip shape), `tests/stayPerStop.test.mjs`, the six i18n files (`tp.dt.*`, `plan.lineDaytrips`).

**Commit.** `dee9465`.

**Measurements.** Not measured.

**What broke.**

| What | Cause | Fix |
|---|---|---|
| The walk read no total on the Itinerary tab at desktop width (NaN) | The total lives on the Overview band and the dock; from 1024 px the rail shows the map and tools, no total | The walk reads it from Overview. The missing total is a real gap, T843-b |

**Still open.**
- **T843-a.** A day out shows on Days, but "Plan this day" plans the base, not the place visited. The day planner's day-trip mode (standalone, `stayCityId`) is not wired to a trip's day.
- **T843-b.** From 1024 px, the Itinerary, Costs and Days tabs show no total while you change things. Batch C's budget card in the rail (board panel 3) is the planned home.

**End check covered.** The picker, a day trip on its stop, the total plus €12.00, the Costs line and the Days name, at every width.

**Rollback.** Revert `dee9465`. Saved stops keep a harmless `dayTrips` that older code ignores.
