# T1100: Getting there mode choice (ROADMAP D13, audit P-31)

## Date

2026-11-06

## What changed

The way there a screen opens on is no longer simply the cheapest. A new pure module, `continent-app/src/lib/wayChoice.js`, weighs every priced way (plane, train, coach, car) on door-to-door hours and price: above 700 km straight line a flight with a fare is the default (unless a ground way is both faster door to door and no dearer); below it the lowest return price a person plus EUR 15 for every door-to-door hour there and back wins. A flight's door-to-door time adds 3 hours of airport overhead and the transfer from the landing airport. The place page's trip card, the Explore card under "any way" and the Places list under "any way" all use it. In the Places list a flight route with no fare in the sweep no longer wins "any way" as the cheapest by leaving the flight out. "Fastest" on the trip card is now door to door, and when the card opens on a dearer way than the cheapest, one caption gives both door-to-door times. Every way stays listed with its own price; the cheapest keeps its mark. On the 50-pair check (5 homes x 10 places, fixture fares) the opening way changed on 18 pairs: no coach of 10 to 17 hours is preselected any more, and Bergen, Amalfi and Taormina from Brussels open on the plane even when the fare is dearer than the car. The values live in `config/pricing.json` `way.choice`; `gettingThere.js FLY_KM` now reads the same `fly_km`.

## Files touched

- Created: `continent-app/src/lib/wayChoice.js`, `continent-app/scripts/way_choice_pairs.mjs`, `continent-app/tests/wayChoice.test.mjs`, `continent-app/tests/fixtures/wayPairs.json`
- Modified: `continent-app/config/pricing.json` (rule `way.choice`), `continent-app/src/lib/price/compose.js`, `continent-app/src/lib/travelWay.js`, `continent-app/src/lib/gettingThere.js`, `continent-app/src/browse/placeWays.js` (`legDuration` moved to wayChoice.js, re-exported), `continent-app/src/browse/DestPriceCard.jsx`, `continent-app/src/browse/ExploreTab.jsx` (flight minutes passed to `wayFor`), `continent-app/src/styles/88-place-template.css` (`.tcard-note`), `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (`destx.wayPickWhy`), `continent-app/tests/priceConfig.test.mjs` (wayChoice.js joins the V13 module list)
- Docs: `docs/HANDBOOK.md` (new section "The way there: which mode a card opens on (D13)"), `ROADMAP.md` (D13 status), `Execution/_OPEN.md` (T1100-a to T1100-d)

## Commands run

```
cd continent-app
npm ci
node scripts/way_choice_pairs.mjs --write-fixture
node scripts/way_choice_pairs.mjs
node --test tests/wayChoice.test.mjs
npx eslint <touched files>
npm test
node scripts/sync-data.mjs --split-only   # dev-only shards for the browser check, deleted after
npx vite --port 5210 --strictPort          # browser check, Playwright at 390 and 1440
```

## Config and secrets set

`continent-app/config/pricing.json` new rule `way.choice` (kind estimate): `fly_km` 700, `eur_per_hour` 15, `plane_overhead_hours` 3, `plane_kmh` 750, `plane_taxi_hours` 0.5, `unknown_transfer_hours` 1. No secrets.

## Before/after measurements

50 pairs: homes Brussels, Amsterdam, Paris, Munich, Madrid; places Bergen, Amalfi Coast, Taormina, Prague, Lisbon, Split, Innsbruck, Bruges, Annecy, Cologne-Bonn. Ground ways from the app's leg estimator; flight fares are a FIXTURE stand-in (EUR 50 + 0.09 a straight km, return a seat), not measured.

| Metric | Before (cheapest) | After (wayChoice) | Delta |
|---|---|---|---|
| Pairs whose opening way changed | n/a | 18 of 50 | 18 |
| Opening way: plane / train / bus / car | 30 / 0 / 18 / 2 | 42 / 3 / 0 / 5 | bus 18 to 0 |
| Pairs of 700 km or more with a flight, opening on a ground way | 5 (coach: Brussels, Amsterdam and Paris to Prague, Munich to Amalfi, Madrid to Annecy) | 0 | -5 |
| Longest preselected door-to-door ride when a flight exists | 17.0 h (coach Madrid to Annecy) | 4.6 h (train Paris to Annecy) | -12.4 h |
| Brussels to Bergen with a EUR 320 fare against a EUR 193 drive | car | plane | test pinned |
| npm test (continent-app) | not measured before | 1317 tests, 1305 pass, 0 fail, 12 skipped (11 new in wayChoice.test.mjs) | n/a |

Bundle size not measured (no number promised; one small module).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The dev page said "We couldn't load Carta's travel data" | `public/boot.json` and `public/dest/` are generated and absent in a fresh cloud clone (the master `app_data/` is not in the container) | `node scripts/sync-data.mjs --split-only` from the tracked `public/app_data.json`; the generated files are gitignored and were deleted after the check |
| The why caption said 10 h 30 min while the row said 10 h 35 min | Caption rounded to half hours | Caption uses the rows' own rounding |
| The trip card's "Fastest" compared a flight's air time with a train's door-to-door hours | Old badge read `minutes` for a plane | Badge reads `ways.fastest`, door to door |
| `price/compose.js` "any way" picked a plane with no fare as the cheapest | The plane total leaves the flight out when the sweep has none (T511), so it always undercut the drive | A flight without a fare is not a candidate; it is priced only when nothing else reaches |

## Screens checked

Place page trip card (`#dest=gem:annecy`, From Brussels, the default home airport town; no flight sweep reachable from the container, so the ground ways only) at 390 x 844 and 1440 x 900: "Getting there from Brussels", Train "Fastest" EUR 180 about 6 h 59 min, Bus "Cheapest" EUR 93 about 10 h 35 min, Car selected EUR 103 about 8 h 7 min, caption "Opened on the quicker way: about 8 h 7 min door to door, against 10 h 35 min for the cheapest." No horizontal scroll, no page errors; the caption reads on the dark card. Tapping a way hides the caption. Explore and Places were checked in node only (their cards need the flight sweep to show the change). Screenshots in `Execution/P15/T1100-shots/` (gitignored).

## Design questions (carta-design, section 12)

1. One coherent page: the caption uses the card's existing caption type and ink token (`--ccard-ink-2`), no new card, badge or colour.
2. Compactness: one caption line, shown only when the opening way is not the cheapest; nothing else added.
3. Motion: none added; nothing to hide under reduced motion.
4. Numbers: every euro still goes through `formatMoney()`; the caption carries only hours from the same estimator the rows show, with "about". The pick never hides a cheaper way.
5. Accessibility: the ways remain a radiogroup of real buttons; the caption is plain text after the group; no colour-only meaning.
6. Six languages, no dashes, no banned words: `destx.wayPickWhy` in en, nl, de, fr, es, it with the same `{time}` and `{other}` placeholders.
7. Impeccable detector: not run (the change is one caption on an existing component); one thing left to remove: nothing, the caption is the only addition.

## What is still open

- T1100-a (user): the 50-pair check on the real sweep. The container cannot reach the data host, so the fares were a fixture stand-in; the script takes `--flights-dir` for the real run.
- T1100-b (user): the `way.choice` values are estimates; the owner confirms or tunes them.
- T1100-c (user): a look at the trip card on a real phone with a fare in the sweep.
- T1100-d (next task): the trip planner picks its legs through `gettingThere.prefillMode` and `transport.js` (EUR 6 an hour, no airport overhead), not this rule; align them, and add `wayChoice.js` to MAP.md's prices row (MAP is outside this task's files).

## Rollback procedure

`git revert` the T1100 commit. No data or migration; the config rule is additive.

## Owner steps (for the checklist)

- [T1100-a] Run the D13 50-pair check on the real flight sweep | the container only had fixture fares, and D13 is done when the pairs are checked on real fares | copy the sweep files BRU.json, AMS.json, CDG.json, MUC.json, MAD.json from data/flights/ into one folder; cd continent-app; node scripts/way_choice_pairs.mjs --flights-dir <that folder>; check that no pair of 700 km or more with a flight opens on a ground way and that short hops do not fly; paste the summary lines into a short follow-up note or the next report | continent-app/scripts/way_choice_pairs.mjs
- [T1100-b] Confirm the way.choice values | they decide which way every card opens on and are estimates, not measured | open continent-app/config/pricing.json rule way.choice; confirm or change fly_km 700, eur_per_hour 15, plane_overhead_hours 3; rerun npm test | continent-app/config/pricing.json
- [T1100-c] Look at the place page trip card on a real phone | the cloud check had no flight sweep, so the plane row was never on screen | open Bergen and Taormina with From Brussels: the card opens on the plane, the car or train keeps its price and the Cheapest mark; open Annecy: the why caption reads well | continent-app/src/browse/DestPriceCard.jsx
