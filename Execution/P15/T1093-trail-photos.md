# T1093: Trail photos with a licence on every image (D7, K2, row T1076-c)

## Date

2026-11-06

## What changed

Every trail photograph now has to pass one licence rule before it can reach the wire: CC0, CC BY, CC BY-SA or public domain, nothing else (`pipeline/trails/photo_licence.py`). The rule runs in the harvest (`pick()` and `store()`) and again in the export (`export_wire.credited()`, next to the T280 name gate), so a file under GFDL alone, CC BY-NC, CC BY-ND or an unknown licence cannot ship by either route. The card's hero `img`, which carried only `u, w, h`, now also carries `lic`, `by`, `licUrl` and `page` (`export_wire.card_img`), and the trail page's fallback photo passes them to the gallery, which prints "author, licence" under the photograph and links to the Commons file page. The detail file's `images[]` already carried author, licence and page. The harvest (`trail_images.py`) is now paced by one limiter shared by all workers (0.8 s per request, `--pace`), can start with the emptiest country (`--worst-first`, read from the shipped wire), stops cleanly after `--max-minutes` and resumes where it stopped; the author is the Commons `Attribution` field when set, else `Artist`. A new contract check (`validateTrailImages`) rejects a disallowed licence, a named-licence photo with no photographer, and a half-rebuilt wire, with four seeded breaks. The harvest itself could not run here (no Commons, no lab); it is proved on a recorded Commons answer.

## Files touched

- Created: `pipeline/trails/photo_licence.py`, `tests/test_trail_photo_harvest.py`, `tests/fixtures/trail_photos/commons_geosearch.json`
- Modified: `pipeline/trails/trail_images.py`, `pipeline/trails/export_wire.py`, `continent-app/src/browse/TrailPage.jsx`, `continent-app/scripts/ci/contract.mjs`, `continent-app/scripts/ci/check-contract.mjs`, `docs/SCHEMA.md`, `docs/HANDBOOK.md`, `ROADMAP.md` (D7 status), `Execution/_OPEN.md`

## Commands run

```
python -m pytest tests/test_trail_photo_harvest.py tests/test_trail_photo_credit.py -q     # 17 passed
CARTA_CONTRACT_DERIVE_SPLIT=1 node scripts/ci/check-contract.mjs                            # passed, new trail photo check ok
npm test   (continent-app)                                                                  # 817 of 890 pass; the same 65 fail before and after
```

## Config and secrets set

None.

## Before/after measurements

Before, from the shipped trail wire (`continent-app/public/trails/*.json`, rows with a card `img`):

| Country | Trails | With a photo | Coverage |
|---|---|---|---|
| DE | 4,725 | 203 | 4.3% |
| GB | 1,910 | 226 | 11.8% |
| IT | 1,280 | 127 | 9.9% |
| FR | 962 | 155 | 16.1% |
| All 55 files | 17,619 | 3,554 | 20.2% |

After: not measured here. It comes from the owner's run (T1093-a, T1093-b). None of the 3,554 shipped card photos carries a licence yet (the wire predates the change), so the licence field is "awaiting run" in SCHEMA.md.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `npm test` shows 65 failures, `npm run lint` cannot start | Container lacks modules the suites import; the identical 65 fail on the base without my changes | Compared the failing list before and after: no difference; not touched |
| `check-contract.mjs` says `public/boot.json is missing` | Split wires are not in the checkout | Run with `CARTA_CONTRACT_DERIVE_SPLIT=1`; it passes |
| First fixture test passed with nothing picked | The scorer rejects titles with words like "forest", "path", "view" | Renamed the fixture files so the allowed file scores and the NC file would have won without the gate |

## Screens checked

None. The change is a data field and one prop passed to an existing gallery; no dev server run here. The end check is T1093-b (trail page with a credited photo, phone and desktop).

## What is still open

- T1093-a: the harvest and wire rebuild (box).
- T1093-b: coverage numbers and a look at a credited page.
- T1093-c: Commons alone will probably not lift DE and GB near CH and CZ; a second source behind the same gate is the next task if so.
- Related, not mine: T222-d (SEO page floor needs a licensed image) is answered by this field once the wire is rebuilt; the 160 photos that owe a credit (T280-a) leave at the same rebuild.

## Owner steps (for the checklist)

- [T1093-a] Harvest trail photos and rebuild the trails wire | the container cannot reach Commons or the trails lab, and the wire only gets the licence fields at the next export | start the lab (`cd tools/trailslab && docker compose up -d`); after T1092-a run `python pipeline/trails/trail_images.py --countries DE,IT,GB,FR --worst-first --pace 0.8 --max-minutes 240` and repeat the same command until it prints no "routes left for the next run" (about 8,200 routes without a photo, about 7 requests each, so roughly 12 hours in total at 0.8 s; `--pace 0.5` cuts it to about 8 hours; this is an estimate from the route counts, not a measurement); then `python run_pipeline.py --only trails_rate` to export the wire; commit the changed `continent-app/public/trails/` files | pipeline/trails/trail_images.py
- [T1093-b] Check the rebuilt wire and one credited page | proves the after number and the credit line | per country count rows with `img` in `continent-app/public/trails/{DE,IT,GB,FR}.json` and note the percentage; run `cd continent-app && node scripts/ci/check-contract.mjs`; open a trail page that has a photo on a phone and read the credit under it | Execution/P15/T1093-trail-photos.md

## Rollback procedure

`git revert` the T1093 commits. Nothing live was changed: no deploy, no migration, no data file. The wire keeps working with or without the new `img` fields (the app reads them only when present).
