# Trip library, journeys, trip finder

Area doc for the MAP.md row "Trip library, journeys, trip finder". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

Ready-made trips: Carta's curated journeys, the generated trips layer, and the trip finder (Trips for you).

Screens: Journeys, Trips, Trips for you, one found trip.

## How it works

Journeys and trips are built by the pipeline into public wire folders and read by the browse and finder screens; the finder ranks them for the traveller's settings.

Full rules, formulas and thresholds (read these, do not copy them):

- [Carta's own trips (the curated journeys library)](../HANDBOOK.md#cartas-own-trips-the-curated-journeys-library)
- [Ready-made composed trips (the trips layer)](../HANDBOOK.md#ready-made-composed-trips-the-trips-layer)
- [Trip finder ("Trips for you")](../HANDBOOK.md#trip-finder-trips-for-you)
- [Past trips](../HANDBOOK.md#past-trips)

## Files

App: continent-app/src/browse/JourneyPage.jsx, continent-app/src/browse/TripPage.jsx (a library trip), continent-app/src/lib/journeys.js, continent-app/src/lib/trips.js, continent-app/src/planner/finder/TripsForYou.jsx, continent-app/src/planner/finder/TripPage.jsx (one found trip)

Pipeline and backend: pipeline/trips/, pipeline/journeys/build_wire.py

MAP.md handbook column: Planning. Latest tasks: T1030, T879-T884.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: `continent-app/tests/changeTrip.test.mjs`, `continent-app/tests/combineTripLegs.test.mjs`, `continent-app/tests/deviceTripStore.test.mjs`, `continent-app/tests/finderCard.test.mjs`, `continent-app/tests/finderFlightHold.test.mjs`, `continent-app/tests/finderHandoff.test.mjs`, `continent-app/tests/finderResults.test.mjs`, `continent-app/tests/journeyTrips.test.mjs`, `continent-app/tests/myTrips.test.mjs`, `continent-app/tests/myTripsHub.test.mjs`, `continent-app/tests/parseTrip.test.mjs`, `continent-app/tests/priceTrip.test.mjs`, `continent-app/tests/recommendTrips.test.mjs`, `continent-app/tests/tripBalance.test.mjs` and 13 more.

DOM checks: `continent-app/scripts/verify_continue_trip.mjs`, `continent-app/scripts/verify_journey_claims.mjs`, `continent-app/scripts/verify_journeys.mjs`, `continent-app/scripts/verify_past_trip.mjs`, `continent-app/scripts/verify_ready_trips.mjs`, `continent-app/scripts/verify_trip_crew.mjs`, `continent-app/scripts/verify_trip_landing.mjs`, `continent-app/scripts/verify_trip_page.mjs`, `continent-app/scripts/verify_trip_price_consistency.mjs`, `continent-app/scripts/verify_trip_share.mjs`, `continent-app/scripts/verify_trips.mjs`.

Python tests matched by file name: `tests/test_generate_trip.py`, `tests/test_trip_accuracy.py`, `tests/test_trip_confidence.py`, `tests/test_trip_critic.py`.

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

Public read-only data; no account needed.

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first. Two files are called TripPage.jsx; see the Watch out list in MAP.md.

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "trip|journey|finder" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
