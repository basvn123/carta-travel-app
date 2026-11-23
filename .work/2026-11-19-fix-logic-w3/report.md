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

## Files changed

| File | What changed | Why |
|---|---|---|
| `continent-app/src/lib/party.js` | E2: `partyOf`, `carsFor`, `carsOf`, `partyFromAges` | one party normaliser for every screen |
| `continent-app/src/lib/travelStyles.js` | styles read `partyOf` (behind E2) | judge fix: no own clamp; teens counted |
| `continent-app/src/lib/price/trip.js` | planner party via `partyOf`; car capacity from config | judge fix: one party, no literal |
| `continent-app/src/lib/price/car.js` | car count via `carsFor` | B-9, B-10: same cars on every screen |
| `continent-app/src/lib/footprint/footprint.js` | footprint per car | B-10, D22 |
| `continent-app/src/lib/runtime_pricing.js` | party counts via `partyOf` | E2 call site |
| `continent-app/src/lib/airportReach.js` | car count via `carsFor` | E2 call site |
| `continent-app/src/lib/transport.js` | car count via `carsFor` | E2 call site |
| `continent-app/src/lib/travelWay.js` | car seats from the party | E2 call site |
| `continent-app/src/lib/urlState.js` | address decode clamps through `party.limits` | G-9 one cap |
| `continent-app/src/planner/flow/tripSettings.js` | settings normalise through `partyOf` | G-9 one cap |
| `continent-app/src/planner/flow/budget.js` | day budget divides by adults plus children (E2) | H-8, V-9 |
| `continent-app/src/planner/trip/BudgetCard.jsx` | reads the new divisor | H-8 |
| `continent-app/src/hooks/useTripPlanner.js` | passes the full party to the planner | E2 call site |
| `continent-app/src/lib/budgetSearch.js` | party via `partyOf` | E2 call site |
| `continent-app/src/lib/price/ladder.js` | new: the declared fallback ladder (behind E3) | E3, owner default 3 |
| `continent-app/src/lib/stayPrice.js` | ladder, room occupancy, dorm bed per child, cleaning per place, `isMeasured` | A-3, A-4, A-15, REQ-data-2 |
| `continent-app/src/lib/price/priceDay.js` | `bedQuality` uses `isMeasured` | judge fix: one measured rule |
| `continent-app/src/lib/price/nights.js` | bed notes: tier priced, not yet measured | E3 label, REQ-data-2 |
| `continent-app/src/lib/price/notes.js` | note kinds for the bed notes | REQ-data-2 |
| `continent-app/src/lib/price/display.js` | tier name for the note | E3 label |
| `continent-app/src/lib/costIndex.js` | bands read the engine day price (behind E3) | A-7 |
| `continent-app/src/components/PriceNotes.jsx` | draws the bed notes | REQ-data-2 |
| `continent-app/src/browse/DestPriceCard.jsx` | priced tier named, Not yet measured | E3 label, REQ-data-2 |
| `continent-app/src/i18n/de.js` | new bed note strings | six languages |
| `continent-app/src/i18n/en.js` | new bed note strings | six languages |
| `continent-app/src/i18n/es.js` | new bed note strings | six languages |
| `continent-app/src/i18n/fr.js` | new bed note strings | six languages |
| `continent-app/src/i18n/it.js` | new bed note strings | six languages |
| `continent-app/src/i18n/nl.js` | new bed note strings | six languages |
| `continent-app/config/pricing.json` | `party.limits`, car capacity, `stay.fallback_order`, `stay.room_occupancy`, `stay.dorm_child_weight` | no number outside config |
| `continent-app/config/flags.json` | set to new only for the DOM check build, then restored; no net change | E2 and E3 stay at old |
| `continent-app/scripts/eval/lib/party-engine.mjs` | new: party views old and new | eval first (G1) |
| `continent-app/scripts/eval/lib/stay-engine.mjs` | new: stay views old and new | eval first (G1) |
| `continent-app/scripts/eval/lib/logic-engines.mjs` | party and stay-ladder sets on the harness | G1 |
| `continent-app/scripts/eval/shadow-diff.mjs` | E2 and E3 engines plugged in | G7 |
| `continent-app/scripts/eval/logic-report.mjs` | per-slice before and after | G5 |
| `continent-app/scripts/eval/logic-w3-report.mjs` | new: wave 3 slice report | G5 |
| `continent-app/scripts/eval/_probe_w3.mjs` | scratch probe made and deleted during the build; never committed | no net change |
| `continent-app/scripts/verify_logic_w3.mjs` | new: DOM check at 390, 820, 1180, 1440 and a sweep | traveller check |
| `continent-app/tests/fixtures/logic-golden/party.json` | new: party golden set | eval first |
| `continent-app/tests/fixtures/logic-golden/stay-ladder.json` | new: stay-ladder golden set | eval first |
| `continent-app/tests/fixtures/logic-golden/stay-places.json` | new: fixture places for the ladder | eval first |
| `continent-app/tests/fixtures/price/destinations.json` | one measured block dated; modelled blocks stay undated | measured rule covered |
| `continent-app/tests/party.test.mjs` | PT-E2 real; style and planner parity with `partyOf` | E2 |
| `continent-app/tests/stayLadder.test.mjs` | PT-E3 real; measured rule cases | E3 |
| `continent-app/tests/bandsE3.test.mjs` | new: bands read the engine day price | A-7 |
| `continent-app/tests/travelWay.test.mjs` | car seat expectation per owner default 2 | E2 |
| `continent-app/tests/priceSources.test.mjs` | eval engines on the allowlist | kept V2 green |
| `docs/HANDBOOK.md` | party and stay sections | G-17 |
| `docs/logic/price.md` | PRICE rows for party and ladder | rule docs |
| `ROADMAP.md` | D10, G12, D22 status; A-5 follow-up | status |
| `docs/owner/product-decisions.md` | defaults 2, 3, 4 and the E2, E3 flips | owner record |
| `docs/reference/config.md` | regenerated | new config keys |
| `scripts/docs/config_reference.py` | units and notes for the new keys | config reference |
| `.gitignore` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `continent-app/scripts/ci/contract.mjs` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `continent-app/tests/airportsFlip.test.mjs` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `continent-app/tests/ship.test.mjs` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `continent-app/tests/wireClimate.test.mjs` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `docs/SCHEMA.md` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `docs/data/trails.md` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `docs/logic/trails.md` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `docs/owner/data-and-pipeline-runs.md` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `docs/project-map.md` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `evals/truth/agreement.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `evals/truth/draft.csv` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/apply_climate.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/audit/audit_hero_images.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/country_context_layer.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/cycling/stage_planner.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/dossier/build_dossier.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/dossier/harvest_place_intros.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/grades.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/harvest_activities.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/harvest_images.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/lakes/lake_index.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/nature_tiers.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/not_for.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/outdoor_row.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/photos/correctness.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/photos/hero_bans.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/place_taste_profile.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/provenance.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/stays/apply_stays.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/stays/build_stays.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/stays/tests/test_stays.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/stays/tests/test_weighting.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/trails/attach.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/trails/attributes.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/trails/export_wire.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `pipeline/trails/rate.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `scripts/freshness_report.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `scripts/quality/beds_replay.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `scripts/quality/drift.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `scripts/quality/engine.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `scripts/quality/grade_replay.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `scripts/quality/hero_replay.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `scripts/quality/launch_gate.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `scripts/quality/publish_guard.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `scripts/quality/rules.yaml` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `scripts/ship.mjs` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `tests/fixtures/airports_chain_wire.json` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `tests/fixtures/pipeline_tasks.json` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `tests/test_activities_merge.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `tests/test_airports_chain.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `tests/test_bed_rules.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `tests/test_climate_method_text.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `tests/test_grades.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `tests/test_hero_bans.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `tests/test_outdoor_row.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `tests/test_place_intros.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `tests/test_provenance.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `tests/test_publish_guard.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `tests/test_quality_drift.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `tests/test_quality_scorecard.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `tests/test_trail_difficulty_names.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `tests/test_truth_agreement.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `tests/test_wave3_export.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `tests/test_wave3_minors.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |
| `tests/test_wire_stamps.py` | arrived with the merge of `origin/p15-fix-programs` (data program waves 1 to 3); not edited by logic | merge protocol step 3 |

## Undo
Set `E2` and `E3` to `old`, or `git revert` `c2c5bee830..6a6e7cb3fa`. The "Not yet measured" note reverts with `fa5f677413` and `de07707213`. No migration.

## Next step
Round paused after this wave (quota 4 of 4). Next round: W4, E4 way there.
