# T273: No flight figure of Carta's on any screen

## Task ID

T273 (register row T272-a, raised by T272)

## Date

2026-10-02

## What changed

Carta does not price flights (owner decision, 2026-10-02). Until this task the planners, the Destinations city-day card and the printed export still showed figures built from the frozen fare snapshots, marked "~" and "est." by T256. Now no screen shows or sums a Carta flight figure. The only flight figure in a total is one the traveller typed.

The planner still flies the trip. `combineTripLegs` still finds the route (origin, the two airports, carrier and times, the airport transfers), and a new helper, `unpricedFlight` in `trip_planner_pricing.js`, strips the seat fares, the bag add-on, their sums and the fare provenance, and marks the flight `priced: false`. The grand total in `useTripPlanner.js` adds the airport transfers and nothing else for that flight. The own-flight path (`ownFlight`, shown as `flight.own`) is unchanged and still adds the traveller's `cost_total`.

On screen: the trip editor's total block shows "Flight out" and "Flight home" as route lines with no figure, then one line, "Carta does not price flights, so they are not in this total. Add what you paid and it counts.", with an "Add your fare" button that opens the existing own-fare fields. The grand total lost its "~". The itinerary receipt shows the same two route rows with no figure, one note above the sections ("Flights are not in this total: Carta does not price them. To count yours, open Edit stops and add what you paid."), and no bag row. Booking rows for the flights carry no estimate. The "cheaper start dates" rows (ranked by frozen fares) are gone, and `cheapestStartDates` with them; the cheaper stop order stays.

The city-day card: `composeTrip` in `runtime_pricing.js` still resolves a fare to know whether and where a place can be flown to, but `plane_grand_total` now leaves the flight and the bag add-on out. A flying card shows the stay and the ground per person, no tilde, with the title "Per person: the stay, food and getting around. Flights are not included." Price sorting and the price filter on that tab follow the same figure.

The printed export shows "not priced" on both flight rows, drops the bag row, and its footer now says "Carta does not price flights, so a flight is in the total only when you entered what you paid. Ground and stay costs are estimates."

Explore needed nothing: it has shown no fare since a91562b. Checked in the browser: no tilde before a euro figure, no est. tag, no flight wording, at 380px and desktop.

The guard held: no change to the pipeline, the `fares/` wire files, `dataHost.js`, `appData.js` or `scripts/r2/`. The fares still load; they are only no longer shown or summed.

## Files touched

continent-app (branch p3-no-flight-estimates):

**Modified:**
- src/lib/trip_planner_pricing.js (unpricedFlight)
- src/lib/runtime_pricing.js (composeTrip: plane total without the flight)
- src/lib/tripCostOptimizer.js (cheapestStartDates removed)
- src/hooks/useTripPlanner.js (unpriced route, grand total, no cheaperDates or applyStartDate)
- src/hooks/useDestinationSearch.js (no flight provenance on rows)
- src/components/FareProvenance.jsx (flightProv and flightBreakdownProv removed)
- src/planner/TripPlannerTab.jsx (route rows, the own-fare door, total without "~", cheaper dates removed)
- src/planner/TripItinerary.jsx (route rows, note, no bag row, booking rows without a flight estimate)
- src/browse/DestinationsTab.jsx (city-day card)
- src/lib/tripExport.js (the printed receipt and its footer)
- src/i18n/en.js, nl.js, de.js, fr.js, es.js, it.js (added trip.flightNotPriced, trip.addOwnFare, itin.flightNotPriced, places.priceNoFlight; removed trip.cheaperStart, trip.cheaperFlights, trip.cheaperBy, trip.useDates, itin.baggage, itin.outPlusHome)
- tests/combineTripLegs.test.mjs (one test for unpricedFlight)
- scripts/verify_flight_est_ui.mjs (rewritten)
- scripts/verify_places_tab.mjs (the city-day card check)

Root (branch p3-no-flight-estimates):

**Modified:**
- docs/SCHEMA.md ("Flight-cost input" rewritten; the T255 status line)
- Execution/_OPEN.md (T272-a closed; T273-a to T273-d added)

**Created:**
- Execution/P3/T273-no-flight-estimates.md

## Commands run

From the app worktree:

    npx eslint <the ten changed source files>     # 0 errors, 7 warnings, all older than this task
    npx eslint src                                # 0 errors
    npm test                                      # 101 of 101 (was 100; one new)
    node scripts/verify_flight_estimates.mjs      # unit part: 12 ok; wire part needs data/derived, absent in the sparse worktree
    node scripts/ci/banned-terms.mjs              # 10 violations, the same 10 before and after (credit lines)
    npx vite --port 5201 --strictPort --host 127.0.0.1
    CARTA_PORT=5201 node scripts/verify_flight_est_ui.mjs     # OK, desktop and 380px
    CARTA_PORT=5201 node scripts/verify_places_tab.mjs http://127.0.0.1:5201/   # all checks passed
    a throwaway Playwright probe (deleted): the trip editor's total block and "Add your fare", and Explore, at 380px and desktop

The dev server was started without `predev`, so sync-data did not run and nothing under public/ was written. No build, so no dist/ to delete.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Places a Carta flight figure is shown or summed | 14 | 0 | -14 |
| Shared BGY then VCE trip from CRL, 2 people: rows add up to the total with no flight | n/a | €1,396 = €1,396 | |
| Same trip with a typed fare of €240: total | n/a | €1,636 (the €240 counts) | +€240 |
| Unit tests | 100 | 101 | +1 |
| Locale keys per language | | +4, -6 | -2 |

The fourteen: in the trip editor the flight out row, the flight home row, the cheaper-dates line and the grand total; in the itinerary receipt the two flight rows, the bag row and the total; the two flight booking rows' estimates; the city-day card; in the export the two flight rows and the bag row. The euro size of the change per trip was not measured before the change.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| sed turned TripItinerary.jsx from CRLF into LF (a 2,061 line diff) | Git Bash sed on Windows | Converted back with Python before the commit; the diff carries only the changed lines |
| The first two harness runs timed out on page.goto | The dev server took over 120 s on its first pages with ten sessions on the machine | A warm-up load, then the run passed |
| Vite re-optimised its dependencies on start | node_modules/.vite is shared with the main checkout, and another session's config differs | Not fixed; it is a cache, and T266 met the same thing |

## What is still open

T273-a: two documents outside this task's scope now say the old thing. PRODUCT.md, "The one rule the numbers follow", still says the surfaces that show fare snapshots "are being removed (register row T272-a); until then they must keep the tilde and est."; it should say they are gone. docs/ESTIMATION.md, around line 188, still points at SCHEMA.md for "two ends only, the four-step resolution order"; that contract is replaced.

T273-b (owner): the Terms of Service section "Every figure is an estimate" (src/components/TermsOfService.jsx) still describes fare figures as Carta's estimates built from published fares, with carrier and freshness notes. Ground fares still fit that text; flights no longer do. It is legal copy, so the owner decides the new wording.

T273-c: the route rows still name the carrier and the departure time from the frozen snapshots; the ICS export names both too, and the share text and printed export give the time. For a route whose stored record came from a cached quote the carrier reads "Aviasales", a booking source, not an airline (seen on the CRL to BGY row). Decide whether a route row should name a carrier at all now that Carta does not price the flight; drop it or show only airline codes that are real.

T273-d: an own flight (every wizard trip, and any trip after "Add your fare") prices no airport transfer. `anchorLegs` and `flightTransfer` in useTripPlanner.js both return nothing unless `flight.combinable`, so a wizard trip that set an arrival airport (anchorId) loses the airport to first stop leg, although the wizard's comment says the planner prices it. This predates T273, but T273 makes the own flight the only priced flight, so it now matters more. "Add your fare" also has no way back to the routed view short of Start over.

T266-b (verify_fare_provenance.mjs is stale) stays open; this task did not touch that file.

## Rollback procedure

In the app repo: `git revert 37399fa cc6212d` (harness commit first, then the screens and engine). In the root repo: `git revert` the T273 commit, which restores the old "Flight-cost input" section and reopens T272-a. Nothing touches data or a database, so the revert is complete.

## Carta-design check

1. No hex added. 2. No new colour, serif, gradient or shadow; no CSS changed. 3. `--flag` not touched. 4. Mono stays on figures; the new note and button are sans, and the route rows keep the existing mono sub-line of codes and times. 5. The "Add your fare" button reuses the existing `.trip-saving-row` secondary button; no new primary. 6. Copy has verbs, no em dashes, no banned words. 7. Removed: the tilde, the est. tag, the bag row and the cheaper-dates rows.
