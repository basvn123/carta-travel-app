# Trip page (the traveller's planned trip)

Area doc for the MAP.md row "Trip page (the traveller's planned trip)". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

The traveller's own planned trip: legs, stays, costs, summary and edits.

Screens: Trip page.

## How it works

TripPlannerTab and TripSummary read the trip store and price it with the price engine; changes go through the edit history helpers.

Full rules, formulas and thresholds (read these, do not copy them):

- [The traveller's trip page](../HANDBOOK.md#the-travellers-trip-page)

## Files

App: continent-app/src/planner/TripPlannerTab.jsx, continent-app/src/planner/TripSummary.jsx, continent-app/src/planner/trip/

Pipeline and backend: none (app only)

MAP.md handbook column: Planning. Latest tasks: T1017, T1001-T1016.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: `continent-app/tests/bookingOrder.test.mjs`, `continent-app/tests/changeTrip.test.mjs`, `continent-app/tests/combineTripLegs.test.mjs`, `continent-app/tests/deviceTripStore.test.mjs`, `continent-app/tests/editHistory.test.mjs`, `continent-app/tests/journeyTrips.test.mjs`, `continent-app/tests/myTrips.test.mjs`, `continent-app/tests/myTripsHub.test.mjs`, `continent-app/tests/parseTrip.test.mjs`, `continent-app/tests/priceTrip.test.mjs`, `continent-app/tests/recommendTrips.test.mjs`, `continent-app/tests/tripBalance.test.mjs`, `continent-app/tests/tripDates.test.mjs`, `continent-app/tests/tripFilters.test.mjs` and 11 more.

DOM checks: `continent-app/scripts/verify_continue_trip.mjs`, `continent-app/scripts/verify_past_trip.mjs`, `continent-app/scripts/verify_ready_trips.mjs`, `continent-app/scripts/verify_trip_crew.mjs`, `continent-app/scripts/verify_trip_landing.mjs`, `continent-app/scripts/verify_trip_page.mjs`, `continent-app/scripts/verify_trip_price_consistency.mjs`, `continent-app/scripts/verify_trip_share.mjs`, `continent-app/scripts/verify_trips.mjs`.

Python tests matched by file name: `tests/test_generate_trip.py`, `tests/test_trail_photo_credit.py`, `tests/test_trip_accuracy.py`, `tests/test_trip_confidence.py`, `tests/test_trip_critic.py`.

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

Trips are saved locally or, when signed in, to Supabase (see My trips).

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first.

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "trip page|trip summary" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
