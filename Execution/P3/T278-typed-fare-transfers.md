# T278: Typed fares price the airport transfer; route rows drop the snapshot carrier

## Task ID

T278 (register rows T273-d and T273-c, both raised by T273)

## Date

2026-10-02

## What changed

Before this task, a flight the traveller typed (the `own` flight: every wizard trip, and any trip after "Add your fare") priced no airport transfer. `anchorLegs` and `flightTransfer` in useTripPlanner.js returned nothing unless `flight.combinable`, so a wizard trip that landed at Bergamo and slept at Lake Como lost the Bergamo to Lake Como leg from the receipt and the total. Now the own flight carries the airports it uses. The airport it flies into is the wizard's arrival (anchorId), else the airport the routed flight uses. The airport it flies home from is picked the way the routed flight picks it: the chosen return airport, else the last stop's own airport, else the arrival. `anchorLegs` prices the hop from those airports to the first stop and back, and it counts in the total. The airport-to-centre transfer (`flightTransfer`) is taken from the routed flight, but only for a direction where both use the same airport, since that stored transfer belongs to that airport. A train or bus arrival gets the anchor leg but not the airport-to-centre transfer. The routed flight is now its own memo (`routedFlight`), worked out even when an own fare is set. A new pure helper, `ownFlightTransfers` in trip_planner_pricing.js, does the airport side and has a unit test.

"Add your fare" now has a way back. The own-fare block in the trip editor ends with one line, "Remove it to see the route Carta found again.", and a "Remove your fare" button that clears the typed fare. The planner then shows the routed view again. The block also shows the airport transfers row when there is one.

T273-c: `unpricedFlight` now also drops the snapshot carrier and times (`into_carrier`, `out_of_carrier`, `into_time`, `out_of_time`). They came from the same frozen snapshots as the fares, a missing tag read as Ryanair, and a cached quote named "Aviasales", a booking source, as the carrier. The decision taken: an unpriced route names no carrier and no time. The trip editor rows and the receipt rows now read "CRL → BGY, 2 seats". The overview flight rows show the date only. The share text and the printed export drop the times. The ICS flight events are all-day and their description names no carrier. The bag check panel under the receipt, which turned the carrier into cabin-bag allowances, is no longer rendered (see T278-a).

Two small fixes rode along in tripExport.js: the share text and the printed export now name each transfer's own airport city (`inCity`/`outCity`) instead of the fly-in airport for both, and the printed export's airport transfers row now uses the chosen transfer mode, as the total does, and shows for an own fare too.

The guard held: no change to `fares/`, `dataHost.js`, `appData.js`, the pipeline or `scripts/r2/`.

## Files touched

continent-app (branch p3-typed-fare-transfers):

**Modified:**
- src/lib/trip_planner_pricing.js (unpricedFlight drops carrier and times; ownFlightTransfers)
- src/hooks/useTripPlanner.js (routedFlight memo; own flight carries its airports; anchorLegs, flightTransfer and the grand total take an own flight)
- src/planner/TripPlannerTab.jsx (route rows without carrier and time; own-fare transfers row; "Remove your fare")
- src/planner/TripItinerary.jsx (route rows without carrier and time; transfers for an own fare; BagCheck no longer rendered; flightTransfer in the export payload)
- src/lib/tripExport.js (no times; per-direction transfer city; transfers row for an own fare at the chosen mode)
- src/lib/icsExport.js (all-day flight events, no carrier)
- src/i18n/en.js, nl.js, de.js, fr.js, es.js, it.js (added trip.removeOwnFare, trip.ownFareBack; removed trip.departs, itin.departs)
- tests/combineTripLegs.test.mjs (unpricedFlight drops carrier and times; one new test for ownFlightTransfers)
- scripts/verify_flight_est_ui.mjs (a third case, the Lake Como trip; no carrier or time on route rows; own-fare transfers match the routed ones)

Root (branch p3-typed-fare-transfers):

**Modified:**
- Execution/_OPEN.md (T273-c and T273-d closed; T278-a and T278-b added)

**Created:**
- Execution/P3/T278-typed-fare-transfers.md

## Commands run

From the app worktree:

    npx eslint <the six changed source files>   # 0 errors, 2 warnings, both older than this task
    npx eslint src                              # 0 errors
    npm test                                    # 102 of 102 (was 101; one new)
    for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done   # all six parse
    node scripts/verify_flight_estimates.mjs    # unit part 12 ok; wire part needs data/derived, absent in the worktree (as in T273)
    node scripts/ci/banned-terms.mjs            # the same 10 credit-line hits as before
    npx vite --port 5205 --strictPort --host 127.0.0.1
    CARTA_PORT=5205 node scripts/verify_flight_est_ui.mjs   # OK, desktop and 380px, three cases
    a throwaway Playwright probe (deleted): the trip editor's total block for the Lake Como trip, "Add your fare", a typed 240, "Remove your fare", at 1360px and 380px; no sideways scroll

The dev server ran without `predev`, so nothing under public/ was written. No build, so no dist/.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Lake Como then Venice from CRL, arriving at Bergamo (anchorId BGY), typed fare €240, 2 people: total | €1,760 | €1,919 | +€159 (the Bergamo to Lake Como leg) |
| Same trip with no typed fare (routed) | €1,679 | €1,679 | 0 |
| BGY then VCE from CRL with typed €240 (no anchor) | €1,636 | €1,636 | 0 (no stored airport transfer on this route, same as the routed view) |
| Ways back from "Add your fare" short of Start over | 0 | 1 | +1 |
| Surfaces naming a snapshot carrier or time | 7 | 0 | -7 |
| Unit tests | 101 | 102 | +1 |
| Locale keys per language | | +2, -2 | 0 |

The "before" Lake Como total is the after total less the €159 leg the old code dropped; the leg did not exist in the before code path. The seven surfaces: the trip editor's flight out and home rows, the receipt's two flight rows, the overview's two flight rows (times), the share text, the printed export (times), the ICS events (carrier and time), and the bag check panel.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first Python edit of useTripPlanner.js failed to match | Every file in the app worktree is CRLF | Edited through a helper that converts to LF and back, so the diff carries only the changed lines |
| The harness's first own-fare check failed: no airport transfers row | BGY and TSF carry no stored airport transfer, so the routed view has none either | The check now asks for parity with the routed view instead of a row |

## What is still open

T278-a: BagCheck.jsx turned each leg's carrier into cabin-bag allowances. With no carrier on an unpriced route it would always say Ryanair, so TripItinerary no longer renders it. The component and its itin.bag* keys are still in the tree, unused. Delete them, or bring the panel back keyed on the airline the traveller types into the own-fare block. Outside this task's files.

T278-b (owner): an own fare's home airport is inferred. The wizard asks one arrival; the planner assumes the flight home leaves from the last stop's own airport when it has one, else from that arrival. The airport-to-centre transfer is only taken where the routed flight uses the same airport, so a typed fare into an airport Carta has no route for gets the anchor leg but no airport-to-centre figure. Whether the wizard should ask which airport the traveller flies home from is a product call.

Noted, not registered: `flightEvent` in icsExport.js still writes a timed event when handed a time; nothing hands it one now.

## Rollback procedure

In the app repo: `git revert f0ecf0e`. In the root repo: `git revert` the T278 commit, which reopens T273-c and T273-d and removes T278-a and T278-b. Nothing touches data or a database, so the revert is complete.

## Carta-design check

1. No hex added. 2. No CSS changed; no colour, serif, gradient or shadow. 3. `--flag` not touched. 4. The route sub-lines stay in the existing mono style and now carry only codes and the seat count; the new line and button are sans. 5. "Remove your fare" reuses the secondary `.trip-saving-row` button, the same as "Add your fare"; no new primary. 6. Copy has a verb, no em dashes, no banned words. 7. Removed: the snapshot carrier, the snapshot times and the bag check panel.
