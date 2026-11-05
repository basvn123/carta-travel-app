# T1077: trip heroes over the 1600px floor (T230-a)

## Date

2026-11-05

## What changed

The `validate-trips` workflow had failed on every run since at least 2026-10-03. Its 259 errors were:
- **257 `hero-below-floor`:** `build_wire.py` served every trip hero as a 1280px Wikimedia thumbnail, and 9 trips carried no size at all.
- **2 `accommodation-not-slept`** on `ba-nature-escape-una-national-park`.

The owner asked for the fix during PR #9's Auto-fix run.

`pipeline/journeys/build_wire.py` now does four things:
- **Original sizes.** It reads each hero's original size from the Commons API, cached in `cache/journey_image_sizes.json`.
- **1920px heroes.** It serves every hero at `HERO_W = 1920`, the largest width Wikimedia renders. The app's `thumbAt` snaps to the same ladder, so cards keep loading small widths through srcset.
- **Original file between 1600 and 1919.** A photo whose original falls in that range ships as the original file.
- **Too-small originals.** A hero under `HERO_FLOOR = 1600` is replaced in three steps:
  1. The trip's next unused candidate that clears the floor.
  2. A photo from one of its own places' Wikipedia articles whose file name carries the place's name, is a JPEG, is landscape and is unused (`cache/journey_gallery.json`).
  3. `HERO_FILE_PINS`: 12 photos chosen by hand by file name, where the candidates held nothing or only a poor fit (a government group photo for Appenzell, a university building for Palermo, a station for the Flemish Ardennes).

The four audit pins under the floor are replaced by hand picks of the places they named: Walkers Haute Route (Arolla), Jerez (the Gonzalez Byass bodega), Parenzana (Grožnjan) and West Cork (Kinsale harbour).

The Una trip's day 3 and day 5 sleep lines now name the two stays its strategy lists: the rafting-operator bungalows near Bihać, and Camp Lučica.

The journey page gallery took the raw hero URL, which would have loaded the full 1920px file on a phone. `tripPhoto` (`lib/journeys.js`) now gives a srcset up to 1920 and a 1280 fallback. On a 358px wide phone the hero now loads the 960px file; before this task it loaded the 1280px file.

## Files touched

- Modified:
  - `pipeline/journeys/build_wire.py`
  - `continent-app/src/lib/journeys.js`
  - `continent-app/public/journeys/` (258 journeys, 15 style files, index). Checked field by field: only the hero fields, the two Una sleep lines and `generated_at` changed.
  - `Trips/carta-unified/carta-unified/data/trips.master.json` and `data/trips/ba-nature-escape-una-national-park.json` (two sleep lines)
  - `Trips/carta-unified/carta-unified/reports/validation-report.md` and `validation-issues.json`
  - `cache/journey_images.json`
  - `docs/HANDBOOK.md` (Journeys, step 2)
- Created: `cache/journey_image_sizes.json` and `cache/journey_gallery.json` (both LFS).

## Commands run

```
python pipeline/journeys/build_wire.py
cd Trips/carta-unified/carta-unified && python pipeline/validate.py --check-urls --gazetteer ../../../cache/geonames_cities500.txt
python pipeline/validate.py --self-test
```

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| validate.py errors (with `--check-urls`) | 259 | 0 |
| Heroes under 1600px | 257 | 0 |
| Warnings | 725 | 725 (untouched; they are not errors) |
| Validator self-test | OK | OK (13 seeded defects caught) |
| Journey page hero file on a 358px phone | 1280px | 960px (srcset) |
| pytest (CI set, run on the laptop) | 322 pass | 327 pass (the laptop also runs the master-only tests) |
| npm test | 1,266 pass | 1,266 pass |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first automatic gallery picks included non-scenic subjects | The file-name rule cannot judge content | 12 hand picks in `HERO_FILE_PINS`, reviewed by name and size |
| The journey page would have loaded 1920px heroes on phones | `tripPhoto` passed no srcset | srcset up to 1920, 1280 fallback |

## Screens checked

- **`#journey=es-cozy-towns-pueblos-blancos` at phone width:** the Grazalema hero loads, takes the 960px rung, and shows its credit (author and CC BY-SA 4.0).
- **The other new heroes** were not each opened in the browser. All 258 hero URLs answered in the validator's `--check-urls` pass.

## What is still open

- **11 automatic gallery picks** passed the name rule but still need someone to look at them on the cards: Sonnenkopf, Brno, Jenner, Torla, Vaduz, two Monaco views, Ouddorp, Peneda-Gerês, the Kobarid memorial and Muráň castle. That check belongs to the owner's G11 phone pass.
- **T332-b** (the trips README figures) can now be refreshed: 0 errors, 725 warnings.

## Register rows to add

None. T230-a closes.

## Rollback procedure

`git revert` the T1077 commit. That restores the 1280px wire, and validate-trips goes red again.
