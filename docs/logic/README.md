# Logic catalogue

ROADMAP item B3. Every rule the code applies that a traveller would notice (a formula, weight, threshold, band, sort order, fallback, cap, cache time, eligibility rule) has one entry here: what it decides, the constant or config key with its file and value, and the test that pins it, or "no test". Written from the code on 2026-11-06 (T1132); where the HANDBOOK and the code disagreed, the code was written down and the disagreement is listed at the end of each file and in `docs/owner/`.

| File | Prefix | Covers | Rules | No test |
|---|---|---|---|---|
| [rating.md](rating.md) | RATING | Place rating v5, appeal, beauty, depth, fame, POI tiers, nature on the ladder | 37 | 20 |
| [price.md](price.md) | PRICE | Price request, party, lifestyle, food, beds, day price and bands, trip total, flights display | 45 | 2 |
| [recommendation.md](recommendation.md) | REC | Taste profile, personal match, For you, trip finder, slots, together | 38 | 3 |
| [seasons-crowds.md](seasons-crowds.md) | SEASON | Climate strip, best months, when logic, crowds by month, sea temperature | 36 | 15 |
| [trails.md](trails.md) | TRAIL | Trail selection, rating, difficulty, names, distance and time, cycling | 38 | 21 |
| [ask.md](ask.md) | ASK | Ask Carta intent, retrieval, ranking, answers, limits, index build | 40 | 9 |
| [plan-day.md](plan-day.md) | PLANDAY | AI day plan, day planner hand-off, suggest-city | 34 | 16 |
| [quotas-paywall.md](quotas-paywall.md) | QUOTA | AI quotas and caps, the Pass, paywall gates, checkout and webhook | 30 | 13 |

Not yet done (the second half of B3): the IDs are catalogue IDs only. Tagging each rule in the code (`// LOGIC: PRICE-012`, `# LOGIC: RATING-004`) and the two-way CI check `scripts/docs/logic_check.py` are open (register row T1132-dx). Until then line numbers drift; the constant name is the stable handle. A task that changes a rule updates its entry in the same commit.

## State scope rules (logic wave 2, E9 phase A)

Rules a traveller notices after a reload, a sign-in or a link. Table: `continent-app/src/lib/stateKeys.js`. Flag `E9` (default old) in `continent-app/config/flags.json`; tests in `continent-app/tests/stateScope.test.mjs`, `stateKeys.test.mjs`, `urlPlacesParity.test.mjs`.

| ID | Rule | Where |
|---|---|---|
| STATE-001 | Every address and storage key has one scope; a key in `src` the table does not name fails a test | `lib/stateKeys.js`, `tests/stateKeys.test.mjs` |
| STATE-002 | An address is someone else's link only when it carries a setting the device's mirror does not hold; a place or a seed alone is not (E9) | `isForeignLink` in `lib/urlState.js` |
| STATE-003 | With a style active and no priced key in the address, the data load keeps the style's party, bed, Lifestyle and way (E9) | `initForLoad` in `lib/urlState.js` |
| STATE-004 | Sign-in keeps this device's choices and holds the style when they differ from the merged account style; a device with no style takes the account's (E9) | `mergeAccountChoices` in `lib/taste.js` |
| STATE-005 | A new trip lifts a hold (E9) | `newTripChoices` in `lib/travelStyles.js` |
| STATE-006 | The account's language is replaced only after the picker was used (E9) | `langToPush` in `lib/langPath.js` |
| STATE-007 | `rr mt mb tb big top` are not read from an address, mirror or account and not pushed (E9) | `decodeState`, `useAccountSync` |
| STATE-008 | The home point is read and stored at 0.01 degree (about 1 km), never in a share link | `roundHomePoint` in `lib/shareKeys.js` |
