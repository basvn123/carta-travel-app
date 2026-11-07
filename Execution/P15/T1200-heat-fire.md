# T1200: Heat and fire months per place (D20)

ROADMAP item **D20**, round 3 session S116, batch 13.

## Date

2026-11-07

## What changed

Every place with a climate block can now carry `climate.heat` (months whose mean daytime high is 35 C or more), `climate.fire` (wildfire danger months) and `climate.risk` (basis and date), written by the new `heat_fire` pipeline task. The place page's "Best months" fact and the When to go verdict drop heat and fire months for a family (children or babies in the party) or a traveller who avoids heat, and never drop below one month. When to go shows one honest note naming the hot and fire months. Fire months use an EFFIS/CEMS Fire Weather Index table when the owner supplies `cache/fire_fwi.json`; until then they use a labelled dry-heat proxy (high of 28 C or more with under 30 mm of rain). On the committed wire (3,868 places) the proxy marks 61 places with heat months and 669 with fire months. Pipeline `best` and `_src`/`_asof` are untouched. Not run on real FWI data: the container cannot reach the CDS.

## Research

A research subagent compared sources (2026-11-07; several licence texts could not be opened).

| Option | Finding | Choice |
|---|---|---|
| CEMS ERA5 FWI, CDS `cems-fire-historical-v1` (https://ewds.climate.copernicus.eu/datasets/cems-fire-historical-v1) | Daily FWI, about 0.25 degrees, 1940 to now, NetCDF, free CDS key; Copernicus terms normally allow redistribution with attribution (not verified) | Preferred true source, owner step |
| EFFIS/GWIS (JRC) | Same CEMS FWI and classes; no bulk API or reuse terms found | Display layer only, not a source |
| NASA GFWED | Daily, 0.5 x 0.625 degrees, NASA data generally uncopyrighted; no dataset licence found; coarser | Fallback |
| Open-Meteo | Free API is non-commercial only; no FWI endpoint found | Rejected |
| Dry-heat proxy from the climate layer | No licence issue, stdlib, not a true FWI | Shipped now, labelled "dry heat" |

Thresholds: no official ECDC or WMO air-temperature rule exists; Carta uses 35 C mean daily high as "extreme" (a labelled Carta judgement; EEA counts hot days above 30 C) and the EFFIS "high" class floor FWI 21.3 for fire. Stdlib cannot read NetCDF, so the owner converts once (xarray or `cdo monmean`) to `cache/fire_fwi.json`.

## Files touched

Created: `pipeline/heat_fire.py`, `continent-app/src/lib/heatRisk.js`, `continent-app/tests/heatRisk.test.mjs`, `tests/test_heat_fire.py`, this report.
Modified: `continent-app/config/pricing.json` (rule `when.heat`), `continent-app/src/browse/DestWhen.jsx`, `DestinationPage.jsx`, `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (`heat.hot`, `heat.fireDry`, `heat.fireFwi`), `run_pipeline.py` (task `heat_fire`), generated `docs/reference/*` and `docs/architecture/lineage.md`, `docs/HANDBOOK.md`, `ROADMAP.md`, `Execution/_OPEN.md`.

## Commands run

```
python -m pytest tests/test_heat_fire.py -q            # 3 passed
ruff check pipeline/heat_fire.py tests/test_heat_fire.py
node --test tests/heatRisk.test.mjs tests/whenGuide.test.mjs
python -I scripts/docs/config_reference.py; build_reference.py; build_lineage.py; drift.py
python run_pipeline.py --list
```

## Config and secrets set

`config/pricing.json` rule `when.heat`: extreme_c 35, fire_high_c 28, fire_dry_mm 30, fire_fwi 21.3, min_best 1. No secrets.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Places with heat months (committed wire, 3,868) | not marked | 61 |
| Places with fire months (dry-heat proxy) | not marked | 669 |
| Tests for the rule | 0 | 4 JS, 3 Python |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Full `npm test` shows many failures; eslint will not start | The container has no `react`, `vite` or `@eslint/js` installed (packages missing, not this change); `priceConfig.test.mjs` fails identically without my change | Ran the touched suites that load (`heatRisk`, `whenGuide`); the full suite and lint are left to CI |

## Screens checked

Not checked in a browser (container lacks app dependencies). End check for the orchestrator: a Seville and a Rome place page at phone and desktop width, with and without children in the party: Best months fact, When to go verdict and the note under it.

## What is still open

See register rows T1200-a to T1200-d and the owner steps below.

## Owner steps (for the checklist)

- [T1200-a] Build the Fire Weather Index table | the fire months stay a dry-heat proxy until a true FWI table exists | request cems-fire-historical-v1 monthly means 1991-2020 on a free CDS account and confirm the licence and attribution wording; convert with xarray or cdo monmean to nearest-cell values per place id; save as cache/fire_fwi.json {"<id>": [12 values]} | docs/HANDBOOK.md (Heat and fire months)
- [T1200-b] Run the task | the shipped wire has no heat or fire months until it runs | python run_pipeline.py --only heat_fire; rebuild the wire; check Seville shows fire months and Oslo none | run_pipeline.py task heat_fire

## Rollback procedure

`git revert` the T1200 commits. The task only adds `climate.heat`, `climate.fire` and `climate.risk`; delete those keys to undo a run.
