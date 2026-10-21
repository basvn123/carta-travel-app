# fli-js, vendored

The TypeScript port of fli (https://github.com/punitarani/fli, directory
`fli-js`, package version 0.0.4), MIT licence (see LICENSE), copied here on
2026-10-21 (T513) so the flight search does not depend on an npm release.
`src/` is unchanged from upstream. `entry.ts` picks the exports Carta uses and
`../build-fli.mjs` bundles them into `../fli.bundle.mjs`, which is what the
app's Pages Function, the flight-sweep Worker and the node tests import.

To update: replace `src/` with a newer upstream copy, run
`node workers/shared/build-fli.mjs` from continent-app/, then `npm test`
(tests/flightSearch.test.mjs parses a saved Google Flights page).
