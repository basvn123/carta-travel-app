# T1096: Gallery pass and POI descriptions for GB, RO, FR and IT (D9)

## Date

2026-11-06

## What changed

Two harvests are now in code with tests; neither could run for real, because Wikimedia Commons and Wikipedia are not reachable from the cloud box and the POI master (`app_data/app_data.json`) is an LFS pointer here. No shipped data changed.

1. **Gallery pass** (`pipeline/photos/place_gallery.py`). It reads the shipped dossiers, picks the places below 5 photos in GB, RO, FR and IT (emptiest first), and asks Commons for photographs near each place with one geosearch request that also returns the licence and author metadata. Only licensed photography is kept (owner decision): the licence must be CC0, CC BY, CC BY-SA or public domain (`trails/photo_licence.reusable`), a name must be present when the licence owes one (`credit.owes_credit`), and the file must be a real photograph of enough size (jpeg, png or webp, 500 px short edge, no map, logo or sign). At most 2 per author, files already in the gallery skipped. Author, licence, licence URL and file page are stored. `build_dossier.compose_gallery` takes the stored photos as `extras`, appended last and run through the same TASL, licence and not-a-photograph gates as every other candidate.
2. **POI descriptions** (`pipeline/poi_descriptions.py`). For every must_see and recommended POI of the four countries it takes the first one to three whole sentences of the English Wikipedia lead, verbatim (local-edition links go through the English langlink). Nothing is written by Claude: `check_grounded` from the T1095 intro harvest proves each sentence is in the source. Each record keeps article title, URL, revision id, licence (CC BY-SA 4.0) and fetch date. Rejected: disambiguation, lists, boilerplate, non-English, under 12 words, article more than 30 km from the POI, search hits whose title does not match. `apply` writes `desc` and `desc_src` into `items_full` over a missing or clearly shorter description, never over an already grounded one.

Reused: T1095's `clean`, `split_sentences`, `check_grounded`, `title_matches`, `english_ratio` and the CC BY-SA 4.0 licence approach.

## Files touched

- Created: `pipeline/photos/place_gallery.py`, `pipeline/poi_descriptions.py`, `tests/test_place_gallery.py`, `tests/test_poi_descriptions.py`, `tests/fixtures/place_gallery/`, `tests/fixtures/poi_descriptions/`.
- Modified: `pipeline/dossier/build_dossier.py` (`extras` argument, loads `place_gallery.json`), `docs/HANDBOOK.md` (Photo gallery section), `ROADMAP.md` (D9 status), `Execution/_OPEN.md`.

## Commands run

- `python -m pytest tests/test_place_gallery.py tests/test_poi_descriptions.py tests/test_place_intros.py -q` (28 passed; the two new files also collect cleanly in the full run).
- `ruff check --select E9,F63,F7,F82` on the touched Python: clean.
- `python pipeline/photos/place_gallery.py --fixtures <dir> --limit 3` (offline path works).
- `python -I scripts/docs/check_entry_points.py`: OK.
- Full `pytest tests` here: 295 passed, 3 failed, 4 collection errors. All of them also fail on the base checkout (`osmium` missing, LFS data hidden); none touch these files.

## Config and secrets set

None. Both harvests are keyless.

## Before/after measurements

Before, from the shipped dossiers (`continent-app/public/dossier`, built 2026-10-30), gallery of 5 or more photos:

| Country | Places | At 5+ | Share | Average photos | Empty |
|---|---|---|---|---|---|
| GB | 526 | 155 | 29.5% | 3.10 | 62 |
| RO | 61 | 22 | 36.1% | 3.87 | 2 |
| FR | 591 | 218 | 36.9% | 3.73 | 33 |
| IT | 651 | 303 | 46.5% | 4.43 | 14 |

POI descriptions, before: the shipped dossier highlights of these countries (GB 1,448, RO 179, FR 1,859, IT 2,595) carry no description field at all (0 of 6,081). The label and description counts for must_see and recommended live in `items_full`, which is not in the checkout (`public/poi/` is generated, the master is LFS), so the per-label percentage is Not measured here: `python pipeline/poi_descriptions.py --report` prints it per country and label on the owner box (owner step T1096-b).

After: Not measured. Estimate for the gallery, not a measurement: the share of short places for which one geosearch yields enough usable licensed photos is unknown; I assumed 40% (low), 55% (middle) and 70% (high) of the short places reaching 5. That gives, at 5+ photos:

| Country | Now | Low | Middle | High |
|---|---|---|---|---|
| GB | 29% | 58% | 68% | 79% |
| RO | 36% | 62% | 71% | 81% |
| FR | 37% | 62% | 72% | 81% |
| IT | 47% | 68% | 76% | 84% |

The honest floor is the current figure: the pass only adds. GB villages are the likeliest to stay short. `place_gallery.py --report` prints the real after figure from the stored pass, and the dossier rebuild gives the final one. For POI descriptions I make no estimate: Wikipedia has an article for a large share of must_see POIs (they require national recognition or three language editions) and a smaller one for recommended; the run reports the real share.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| New tests failed to collect in the full run (`cannot import name DCACHE from common`) | `tests/conftest.py` puts the Trips pipeline on the path and its `common.py` wins | Same swap-and-restore of `sys.modules["common"]` that T1095's test uses |
| `place_gallery` first inserted `pipeline/photos` into `sys.path` | That folder has `derive.py` and `credit.py`, which would shadow dossier modules | Siblings are loaded by path (`importlib`), and `build_dossier` loads the module by path too |
| Coverage with the stored pass crashed | Store holds `{id: {photos: [...]}}`, I iterated the dict | Read `photos` |

## Screens checked

None. No app code changed, no dossier rebuilt. After T1096-c, look at one GB, RO, FR and IT place gallery at phone and desktop width.

## What is still open

See register rows T1096-a to T1096-f: the two runs, the dossier rebuild and look, crediting the Wikipedia article on the POI card and the PDF, places that stay below 5 (Wikidata image or Commons category as a second source), and countries beyond the four.

## Rollback procedure

`git revert` of the T1096 commits. The merge only reads `cache/dossier/place_gallery.json`; delete that file and rebuild the dossiers to restore the old galleries exactly. `poi_descriptions.py apply` edits the master in place: keep a copy first (owner step) or re-run `poi_labels.py` to rebuild `items_full`; the cache `cache/poi_descriptions.json` is only read.

## Owner steps (for the checklist)

- [T1096-a] Run the gallery pass | Commons is not reachable from the cloud box | from the repo root run `python pipeline/photos/place_gallery.py --report`; run `python pipeline/photos/place_gallery.py` (about 1,130 places, 1 s pace, about 20 to 25 minutes, resumable, `--max-minutes 30` to cap); run `--report` again and compare with the table above; open `cache/dossier/place_gallery.json` and read 10 places | pipeline/photos/place_gallery.py
- [T1096-b] Run the POI description harvest | Wikipedia is not reachable from the cloud box and the master is an LFS file | `git lfs pull` for `app_data/app_data.json`; `cp app_data/app_data.json app_data/app_data.pre-T1096.json`; `python pipeline/poi_descriptions.py --report`; `python pipeline/poi_descriptions.py` (about 0.4 s a POI, resumable, expect 1 to 2 hours for a few thousand POIs); `--report` again; read 10 rejected rows in `cache/poi_descriptions.json`; then `python pipeline/poi_descriptions.py apply` | pipeline/poi_descriptions.py
- [T1096-c] Rebuild dossiers and look at the galleries | the merge happens in the dossier build | `python pipeline/dossier/build_dossier.py --all`; run `place_gallery.py --report`; look at one GB, RO, FR and IT place gallery at phone and desktop width and check each photo shows author and licence | pipeline/dossier/build_dossier.py
