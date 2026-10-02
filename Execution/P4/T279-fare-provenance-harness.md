# T279: verify_fare_provenance rewritten for no flight prices

## Task ID

T279 (register rows T266-b and T267-c)

## Date

2026-10-02

## What changed

scripts/verify_fare_provenance.mjs predates T256 and T273. It drove the removed map results list, expected a baseline with no tildes and no chips that T256 reversed, and expected flight rows to carry prices that T273 removed. It is rewritten. It now asserts the T273 rule on the trip receipt: with no typed fare, the flight out and home are two route rows with no figure, no tilde, no est. tag, no age chip and no value cell, and the total carries no tilde; with a typed fare of EUR 240, that figure shows as the traveller's own, untagged, with no tilde and no unpriced flight row beside it. Ground legs keep their booking note. It runs under three ?provmock bags (none, age:3, age:3,est:1) and asserts no flight row reacts to the mock, since there is no Carta flight figure to tag. Each case runs at 1360px and 380px, with a check for sideways scroll. Scripts only; src/ is untouched.

## Files touched

continent-app (branch p4-fare-provenance-harness, commit 45ccc1f):

**Modified:**
- scripts/verify_fare_provenance.mjs (rewritten; the line ending changed from CRLF to LF, so git shows the whole file)

Root (branch p4-fare-provenance-harness):

**Modified:**
- Execution/_OPEN.md (T266-b and T267-c closed; T279-a added)

**Created:**
- Execution/P4/T279-fare-provenance-harness.md

## Commands run

From the app worktree:

    CARTA_PORT=5206 node scripts/verify_fare_provenance.mjs    # starts vite dev on 5206 itself; 56 ok, 0 FAIL

## Config and secrets set

None.

## Before/after measurements

Not measured. The old script could not pass against the current app; the new one passes 56 assertions (3 mocks, 2 trips, 2 widths).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A first draft also loaded the Destinations tab and expected a city-day price to render; it never did, and one run crashed the page | The city-day cards sit behind the Trips category, the composed door, the one-day chip and a country pick; a plain load does not reach them | Dropped that part. verify_places_tab.mjs already reaches the cards and checks no tilde and the "flights are not included" title (T273) |

## What is still open

T279-a: the harness does not cover Explore or the city-day card. Explore has shown no fare since a91562b and T273 checked it by hand; verify_places_tab.mjs owns the city-day card. If an Explore no-tilde check is wanted in a harness, it is a small addition.

The harness was run against vite dev (seams on), not a build. Against a build it needs VITE_E2E_SEAMS=1, as the header says.

## Rollback procedure

In the app repo: git revert 45ccc1f. In the root repo: revert the T279 commit, which reopens T266-b and T267-c. No data, database or src change.

## Carta-design check

No visual change. Not applicable.
