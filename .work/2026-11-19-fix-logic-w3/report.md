# Report: logic wave 3, one party model (E2) and one stay ladder (E3)

Status: done · 2026-11-23 · L2 light wave (round 2, quota wave 4 of 4) · branch `p15-fix-logic`, merged into `p15-fix-programs`.

One party normaliser (`partyOf` in `continent-app/src/lib/party.js`) now gives every screen the same seats, cars, kind and day-budget divisor, and one declared ladder in `continent-app/config/pricing.json` picks the bed tier when the wanted one is missing, naming the tier it priced. Both ship behind flags `E2` and `E3` at `old`. A modelled bed now says "Not yet measured" on every path (unflagged). The first fresh judge failed two lines (styles and planner still counted their own party; two rules for "measured"; A-7 skipped); after the fixes a second fresh judge scored every line 4 (`judgement-2.md`).

## The question (G12)
Does one party give the same answer everywhere, and does a missing tier fall down one ladder? Yes with the flags on: the party golden set goes from 10 of 17 (old) to 17 of 17 (new), the stay-ladder set from 9 of 21 to 21 of 21; 4 adults and a baby take 2 cars on every screen (owner default 2). Shadow diff (`shadow/`): E2 changes 1 of 12 personas (no persona needs five car seats; the car effect shows in the golden set), E3 changes 12 of 12.

## What changed
- **E2** (B-9, B-10, G-8 model, G-9, H-8 divisor, V-9, G-17): `lib/party.js` (`partyOf`, `carsFor`, `carsOf`, `partyFromAges`), `party.limits` and car capacity in config; switched `lib/travelStyles.js`, `lib/price/trip.js`, `lib/price/car.js`, `lib/footprint/footprint.js`, `lib/runtime_pricing.js`, `lib/airportReach.js`, `lib/transport.js`, `lib/travelWay.js`, `lib/urlState.js`, `planner/flow/budget.js`, `planner/flow/tripSettings.js`, `planner/trip/BudgetCard.jsx`, `hooks/useTripPlanner.js`, `lib/budgetSearch.js`.
- **E3** (G-6 ladder half, A-2 ladder per owner default 3, A-3, A-4, A-15, V-11, A-7): `stay.fallback_order`, `stay.room_occupancy`, `stay.dorm_child_weight` in config; `lib/price/ladder.js`, `lib/stayPrice.js`, `lib/price/priceDay.js`, `lib/price/nights.js`, `lib/price/notes.js`, `lib/price/display.js`, `lib/costIndex.js` (bands read the engine day price).
- **REQ-data-2:** one measured rule (`isMeasured`, mirror of `pipeline/stays/bed_rules.py`) behind the "Not yet measured" note; `components/PriceNotes.jsx`, `browse/DestPriceCard.jsx`; labels in six languages (`src/i18n/*.js`).
- **Eval first:** `tests/fixtures/logic-golden/party.json`, `stay-ladder.json`, `stay-places.json`, `scripts/eval/lib/party-engine.mjs`, `stay-engine.mjs`, `logic-engines.mjs`, `logic-report.mjs`, `logic-w3-report.mjs`, `shadow-diff.mjs`; snapshot in `before/` committed before any number moved.
- **Tests:** `tests/party.test.mjs` and `stayLadder.test.mjs` (PT-E2, PT-E3 real), `bandsE3.test.mjs`, `priceSources.test.mjs`, `travelWay.test.mjs`; fixture `tests/fixtures/price/destinations.json` (one measured block dated so the clean row stays clean; modelled blocks stay undated).
- **Screens:** `continent-app/scripts/verify_logic_w3.mjs`, 49 of 49 at 390, 820, 1180, 1440 and a sweep with E2 and E3 new.
- **Docs:** `docs/HANDBOOK.md` party and stay sections, `docs/logic/price.md`, `ROADMAP.md` D10, G12, D22, `docs/owner/product-decisions.md` (defaults 2, 3, 4 and the flips), `docs/reference/config.md`, `scripts/docs/config_reference.py`.

## Checks
- CI run 45130919903 on `6a6e7cb3fa`: only baseline failures (design-lint motion-literal; `dayEnds`, which also fails before the wave; data-owned DCACHE and stays snapshot). `priceNotes` passes in CI.
- Locally: touched tests 55 of 55, `logic-engines --check` pass, eslint clean, drift 0, config reference OK.
- `priceGolden` is unchanged: no number moves with the flags at `old`; new-path numbers are pinned in `stayLadder.test.mjs`.

## Left for later
- A-5 band-spread test: needs the shipped wire in the protected `public/` (ROADMAP D10 follow-up).
- A-14 rest: weekend, peak and single-room factors are empty in the data.
- W3-L1: no input for teens yet (the model is ready). W3-L2: city-level measured check; find price lines by key.

## Undo
Set `E2` and `E3` to `old`, or `git revert` `c2c5bee830..6a6e7cb3fa`. The "Not yet measured" note reverts with `fa5f677413` and `de07707213`. No migration.

## Next step
Round paused after this wave (quota 4 of 4). Next round: W4, E4 way there.
