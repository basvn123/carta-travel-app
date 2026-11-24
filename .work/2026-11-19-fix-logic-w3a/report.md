# Report: logic wave 3a (round 3), data requests and leftovers of waves 1 to 3

Status: done · 2026-11-24 · L2 light wave · branch `p15-fix-logic`, merged into `p15-fix-programs`.

The app now reads the data program's new wire shapes and rules: the outdoor row `o`, the D-5 day-out numbers, the all-year chip, the tagged trail grade, heat months for "Avoid heat" and bare Wikidata blurbs as templates. The small gaps left by logic waves 1 to 3 are closed, and J-16 (the service worker keeps one navigation copy per path) landed through the owner's own script. The first fresh judge failed two lines (rows short, thin DOM check); after the fixes a second fresh judge scored every line 4 (`judgement-2.md`).

## The question (G12)
Do the screens read the data program's new shapes and rules, and are the leftovers closed? Yes: one test per row that fails on the old code (the judge confirmed 9 rows on old code), a parity test that the D-5 numbers equal `pipeline/not_for.py`, and a DOM check of 88 of 88 at 390, 820, 1180 and 1440 and a sweep.

## Rows
- REQ-data-1 bare Wikidata blurbs are templates; mountains and trails lead with what is particular (`lib/placeStory.js`, `lib/lakeStory.js`, `lib/mountainStory.js`, `lib/trailStory.js`).
- REQ-data-3 "Avoid heat" reaches the place page heat guard through `lib/heatRisk.js`; absent heat data is unknown, never safe (`shell/useAppSettingsValue.js`, `browse/DestinationPage.jsx`, `components/SettingsLine.jsx`).
- REQ-data-4 `lib/outdoorRow.js` is the one reader of `o` and the legacy keys (`browse/NearPage.jsx`, `lib/destOverview.js`, `browse/AroundHere.jsx`).
- REQ-data-5 D-5 numbers in `lib/trailStory.js` and `lib/notFor.js`, parity test in `tests/wave3aTrails.test.mjs`.
- REQ-data-6 trail chip reads `allYear` with a `winter` fallback; dead `nearby.trails` and `nearby.cycling` read dropped.
- REQ-data-7 TrailPage "estimated" reads the tagged grade only (`lib/trailCards.js` `gradeStepOf`, `browse/TrailPage.jsx`).
- W1-L1 the way back from Stripe offers the blocked action again ("Do it now", for the place and day PDFs; other gates name it) (`hooks/usePaywall.jsx`, `components/PassBack.jsx`, `components/PassModal.jsx`, `lib/passMoments.js`, `planner/days/useDayExports.js`, `App.jsx`).
- W1-L2 and W1-L3 budget search and Home "Try it" counts go through `gaps.js` behind E1 (`lib/budgetSearch.js`, `browse/home/HomeTry.jsx`, `lib/homeDemo.js`).
- W2-L1 the watch, taste inputs and Reiskas faces are person keys, cleared at sign-out (`lib/stateKeys.js`, `components/CookiesPage.jsx`).
- W2-L2 `scripts/verify_logic_w2.mjs` with `g=3` and a pass with E9 old (46 of 46 each).
- W3-L1 a Teens row in the party step behind E2 (`planner/PartyEditor.jsx`, `browse/styles/StyleSteps.jsx`, `lib/partyParts.js`).
- W3-L2 `stayMeasured` checks the rate is the town's own; price lines found by key (`lib/costIndex.js`, `lib/price/priceDay.js`).
- J-16 `continent-app/public/sw.js` caches navigations by path (cache `carta-v9`), applied by the owner's script with owner approval (`d1074dd273`); `tests/swNavigation.test.mjs` 4 of 4.

## Files changed
| File | What changed | Why |
|---|---|---|
| `continent-app/src/lib/outdoorRow.js` | new reader of the outdoor row | REQ-data-4 |
| `continent-app/src/browse/NearPage.jsx`, `continent-app/src/lib/destOverview.js`, `continent-app/src/browse/AroundHere.jsx` | read `outdoorRow` | REQ-data-4, REQ-data-6 |
| `continent-app/src/lib/placeStory.js`, `continent-app/src/lib/lakeStory.js`, `continent-app/src/lib/mountainStory.js`, `continent-app/src/lib/trailStory.js`, `continent-app/src/lib/notFor.js`, `continent-app/src/lib/trailCards.js`, `continent-app/src/browse/TrailPage.jsx` | templates, leads, D-5, tagged grade | REQ-data-1, 5, 7 |
| `continent-app/src/lib/heatRisk.js`, `continent-app/src/shell/useAppSettingsValue.js`, `continent-app/src/browse/DestinationPage.jsx`, `continent-app/src/components/SettingsLine.jsx` | Avoid heat wired | REQ-data-3 |
| `continent-app/src/hooks/usePaywall.jsx`, `continent-app/src/components/PassBack.jsx`, `continent-app/src/components/PassModal.jsx`, `continent-app/src/lib/passMoments.js`, `continent-app/src/planner/days/useDayExports.js`, `continent-app/src/App.jsx` | way back offers the blocked action | W1-L1 |
| `continent-app/src/lib/budgetSearch.js`, `continent-app/src/browse/home/HomeTry.jsx`, `continent-app/src/lib/homeDemo.js` | through `gaps.js` behind E1 | W1-L2, W1-L3 |
| `continent-app/src/lib/stateKeys.js`, `continent-app/src/components/CookiesPage.jsx` | three person keys | W2-L1 |
| `continent-app/src/planner/PartyEditor.jsx`, `continent-app/src/browse/styles/StyleSteps.jsx`, `continent-app/src/lib/partyParts.js` | Teens row behind E2 | W3-L1 |
| `continent-app/src/lib/costIndex.js`, `continent-app/src/lib/price/priceDay.js` | town's own rate; lines by key | W3-L2 |
| `continent-app/public/sw.js` | navigation cache per path | J-16 (owner applied) |
| `continent-app/src/i18n/de.js`, `en.js`, `es.js`, `fr.js`, `it.js`, `nl.js` | All year, Teens, Do it now | six languages |
| `continent-app/tests/wave3aTrails.test.mjs`, `wave3aOutdoor.test.mjs`, `wave3aHeat.test.mjs`, `wave3aLeftovers.test.mjs`, `stateKeys.test.mjs`, `swNavigation.test.mjs`, `fixtures/libNumberAllowlist.json` | tests per row | rubric line 1 |
| `continent-app/scripts/verify_logic_w3a.mjs`, `continent-app/scripts/verify_logic_w2.mjs` | DOM checks | rubric line 6 |
| `docs/HANDBOOK.md`, `docs/logic/trails.md`, `ROADMAP.md` | rule and status lines | docs with code |

## Checks
- CI run 45308935305 on `9a6272cfc2`: only baseline (deploy-steps test before the wave; data-owned pytest: `MASTER` import in `apply_stays.py`, `ask_index` snapshot, sent to data 2026-11-24).
- Locally: touched tests 30 of 30, `logic-engines --check`, eslint, drift 0, `tests/test_trail_climb_consistency.py` 9 of 9.

## Left for later (backlog)
W3a-L1 resume for the other gates; W3a-L2 resume map read in render; W3a-L3 no screen draws the trails Suits group since G12, so All year cannot be picked; W3a-L4 `AroundHere.jsx` is not mounted.

## Undo
`git revert` `c63c54f2c3..9a6272cfc2`; J-16 reverts with `d1074dd273` (then bump the cache name). E1 and E2 parts are behind flags at `old`.

## Next step
Wave W4: E4 the way there.
