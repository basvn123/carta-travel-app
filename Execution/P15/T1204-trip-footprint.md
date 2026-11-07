# T1204: Trip footprint (ROADMAP D22)

## Date

2026-11-07

## What changed

The place page's trip card shows an estimated CO2e per person for every way there (plane, train, coach, car), and each leg of the planner's Getting there step shows one for its chosen mode, each with a link to the method. Factors come from one config rule, `footprint.factors` in `config/pricing.json`, with source, year and review date. Nothing is ranked or reordered by footprint.

## Research

Compared UK DESNZ/DEFRA conversion factors, EEA averages, ADEME Base Empreinte, myclimate, Our World in Data, UIC. Chosen: DESNZ (Open Government Licence v3.0, per passenger-km by mode, documented 8 percent flight uplift, radiative forcing included). Not chosen: myclimate (publisher-controlled terms), OWID (a derivative of DESNZ), EEA (coarse averages), ADEME (better for European rail, kept as a follow-up, T1204-c). The research container could not reach gov.uk, so the numbers came from secondary mirrors and are flagged unverified (T1204-a).

## Files touched

continent-app: `src/lib/footprint/footprint.js` (new), `config/pricing.json`, `src/browse/DestPriceCard.jsx`, `src/browse/placeWays.js` (adds `km`), `src/planner/TravelLegsSection.jsx`, `src/styles/88-place-template.css`, `src/styles/planners/88-pf2-wizard.css`, `src/i18n/{en,nl,de,fr,es,it}.js` (`footprint.each`, `footprint.note`, `footprint.round`), `tests/footprint.test.mjs`. Root: `docs/HANDBOOK.md`, `docs/reference/config.md` and `app-lib.md` (regenerated), `ROADMAP.md`, `Execution/_OPEN.md`.

## Commands run

`node --test tests/footprint.test.mjs`; `npm test`; `node scripts/ci/design-lint.mjs`; `python -I scripts/docs/config_reference.py`; `python -I scripts/docs/build_reference.py`.

## Config and secrets set

New rule `footprint.factors`: flight 126 / 117 g per pkm (cut 3700 km, uplift 1.08), train 35, coach 39, ferry 113, car 170 g per car-km, ground detour 1.3.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| 1000 km flight, one way, kg CO2e | none | 136.08 (hand-computed, tested) | new |
| 400 km train, one way, kg CO2e | none | 14 (hand-computed, tested) | new |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Most of npm test failed at first | node_modules not installed in the container | `npm ci` |

## Screens checked

Not checked in a browser in this unattended cloud run: place page trip card and planner Getting there step, at phone and desktop width, are an end-check item for the batch. Design lint: 0 new.

## What is still open

T1204-a (owner: verify factors), T1204-b (trip total), T1204-c (European rail factors). See `Execution/_OPEN.md`.

## Owner steps (for the checklist)

- [T1204-a] Verify footprint factors | the numbers were read from secondary mirrors, not the DESNZ workbook | open the latest DESNZ conversion factors workbook; compare flight short and long haul economy, national rail, coach, average petrol car and ferry with `footprint.factors`; correct the values and the source year | continent-app/config/pricing.json
