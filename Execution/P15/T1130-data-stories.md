# T1130: Data stories, the yearly basket per country (K5, S46)

## Date

2026-11-06

## What changed

Carta now has a reproducible "week basket" per European country, built offline from the shipped catalogue through the app's own price engine, plus two press drafts (Dutch and English, Belgian angle first per owner decision 6) and a method note. `scripts/stories/basket_per_country.mjs` prices every place with the default request (owner decision B5: two adults, entire place, Easygoing, any time), takes week = day price x 7 for one person, and writes per-country medians, spreads, sample sizes, capture dates, food anchors and Belgium/Netherlands comparisons to `docs/brand/data-stories/data/`. Result of this run: 3,353 of 3,868 places priced, 33 countries ranked (10 or more priced places), European median week EUR 910, Belgium EUR 1,093 (27th of 33, 26 countries cheaper), Netherlands EUR 1,194 (29th), North Macedonia cheapest at EUR 384, Switzerland dearest at EUR 1,659. Every figure in the drafts was checked against the JSON. The basket leaves out the way there (flight sweep on R2) and local transport (no fares, T714-b), and the drafts say so. No app changes; nothing is published.

## Files touched

- Created: `scripts/stories/basket_per_country.mjs`
- Created: `docs/brand/data-stories/README.md`, `method.md`, `europe-week-2027.nl.md`, `europe-week-2027.en.md`
- Created (generated): `docs/brand/data-stories/data/basket_2027.json`, `docs/brand/data-stories/data/basket_2027_countries.csv`
- Modified: `docs/README.md` (one tree row), `ROADMAP.md` (K5 status), `Execution/_OPEN.md` (rows T1130-a to f)
- Created: `Execution/P15/T1130-data-stories.md`

## Commands run

```
cd continent-app && npm ci && cd ..
node scripts/stories/basket_per_country.mjs
node scripts/stories/basket_per_country.mjs --check
python -I scripts/docs/check_entry_points.py
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Countries with a published week basket | 0 | 33 ranked, 10 listed unranked | +43 |
| Places priced in the basket | n/a | 3,353 of 3,868 | |
| Script runtime, `--check` (whole catalogue) | n/a | 0.35 s | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The price engine would not import in Node | `continent-app/node_modules` was absent in the container (`staysData.js` imports react) | `npm ci` in continent-app; the script stops with a clear message when node_modules is missing |
| The app's eslint ignores `scripts/` outside the app | Base path and ignore patterns | Linted a temporary copy under `continent-app/src/` with `--no-ignore`: clean, copy removed |

Design choice: the script calls `priceDays` instead of re-implementing the formulas in Python, so the story's numbers cannot drift from what the Explore card shows. Observation counts per bed tier live in the stays wire on R2, not in the shipped catalogue, so the method note says this run cannot state them.

## Screens checked

None: no app change. Docs only.

## What is still open

- T1130-a (user): review the drafts, pick headline and quote, decide outlet.
- T1130-b (user): export the flight sweep so the basket can add the way there.
- T1130-c (user): confirm publishing aggregated Booking.com scrape prices is fine under the source terms.
- T1130-d (user): French version for Walloon press or not.
- T1130-e (next task): outlier beds within bounds (Knokke, Texel villages) to check before quoting; kept out of the drafts.
- T1130-f (user): rerun after the next stays build and before the 2 Jan 2027 release.
- The June "quiet clean beaches" ranking and the Sunshine Saturday piece named in K5 are not in this task.

## Rollback procedure

`git revert` the T1130 commit. Nothing is one-way; no data or app file changed.

## Owner steps (for the checklist)

- [T1130-c] Check source terms before publishing | the story quotes aggregates of Carta's own Booking.com scrape and the licence ledger is not settled (T1021-e) | read the Booking.com terms on derived aggregates; decide whether a press story may cite "Carta's own measurements on Booking.com"; note the answer in the register | docs/brand/data-stories/method.md
- [T1130-a] Review and place the K5 drafts | publishing to press or the blog is the owner's call | read both drafts and method.md; pick the headline; add a quote, the Carta link and the release date; choose outlets from the K10 press list or the blog | docs/brand/data-stories/europe-week-2027.nl.md
- [T1130-d] Decide on a French version | ROADMAP K5 pitches Walloon press while decision 6 sets Dutch and English | decide yes or no; if yes, a next task translates the Dutch draft with the same figures | ROADMAP.md
- [T1130-b] Export the flight sweep for the basket | the way there is not in the shipped data and the R2 sweep needs an owner key | on the box, copy the flight sweep fares for origins BRU and AMS from R2 to a local JSON; hand the path to a next task that adds a getting-there column to the script | scripts/stories/basket_per_country.mjs
- [T1130-f] Rerun the numbers before release | bed and food layers move with each build | after the next stays build run `node scripts/stories/basket_per_country.mjs`; then `--check`; update every figure in both drafts from the new JSON before sending on 2 Jan 2027 | docs/brand/data-stories/data/basket_2027.json
