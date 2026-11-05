# Flights, fares, airports

Area doc for the MAP.md row "Flights, fares, airports". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

Swept and live flight fares, airports in reach and the way to the airport.

Screens: Flight sheet, cards, trip legs.

## How it works

A Cloudflare Worker sweeps fares into R2; the app reads the sweep and can run a live search through app/functions/api/flights.js; airports in reach come from the pipeline.

Full rules, formulas and thresholds (read these, do not copy them):

- [Flight sweep (the Worker)](../HANDBOOK.md#flight-sweep-the-worker)
- [Flights and fares in the app (swept and live)](../HANDBOOK.md#flights-and-fares-in-the-app-swept-and-live)
- [Airports in reach from home and the way to the airport](../HANDBOOK.md#airports-in-reach-from-home-and-the-way-to-the-airport)
- [Airport transfer per mode (airport to the place)](../HANDBOOK.md#airport-transfer-per-mode-airport-to-the-place)
- [Driving your own car: fuel and tolls](../HANDBOOK.md#driving-your-own-car-fuel-and-tolls)
- [Car hire](../HANDBOOK.md#car-hire)
- [Train, bus and travel between places](../HANDBOOK.md#train-bus-and-travel-between-places)
- [Price map and price feel labels](../HANDBOOK.md#price-map-and-price-feel-labels)

## Files

App: continent-app/src/lib/flights/, continent-app/src/components/FlightSheet.jsx, continent-app/functions/api/flights.js, continent-app/workers/flight-sweep/

Pipeline and backend: pipeline/flights/build_routes.py, pipeline/airport_access.py

MAP.md handbook column: Prices. Latest tasks: T1020, T844.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: `continent-app/tests/airportReach.test.mjs`, `continent-app/tests/changeFlight.test.mjs`, `continent-app/tests/doorToDoor.test.mjs`, `continent-app/tests/finderFlightHold.test.mjs`, `continent-app/tests/flightSearch.test.mjs`, `continent-app/tests/flightSweep.test.mjs`, `continent-app/tests/flights.test.mjs`, `continent-app/tests/gateways.test.mjs`, `continent-app/tests/gettingThere.test.mjs`, `continent-app/tests/recommendFlight.test.mjs`, `continent-app/tests/wizardFlightChoices.test.mjs`.

DOM checks: `continent-app/scripts/verify_flight_est_ui.mjs`, `continent-app/scripts/verify_google_flights.mjs`.

Python tests matched by file name: `tests/test_airport_access_island.py`.

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

The live search uses a vendored client (workers/shared/fli); the sweep Worker has its own wrangler.toml.

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first.

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "flight|airport" Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
