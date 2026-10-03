# T332 Journey data fixes the validator found

## Task ID

T332 (register rows T084-a and T084-b).

## Date

2026-10-03

## What changed

The trip validator (`Trips/carta-unified/carta-unified/pipeline/validate.py`) now reports no budget-sum-mismatch and only 2 accommodation-not-slept errors. The data fixes are in `data/trips.master.json` and the per-trip files in `data/trips/`. The source batch `.md` files are not in the repository, so these two JSON layers are the only editable source.

Budget (T084-a, 58 trips, 98 errors). Two kinds of defect, as T084 described. For the 30 Nordic trips the breakdown cells held a per-night rate for accommodation and a per-day rate for food, against a weekly total. I multiplied accommodation by the nights (durationDays minus 1, so 6) and food by the days (7). Where a note states a week or six-day total for activities (four lift-pass or gear-rental trips: dk water sports, fi Levi, no Hemsedal, se Åre) I used that stated total. Two further trips list a daily gear rate (ee west coast, lt Curonian kite week) and take 6 days. Each changed note ends with a sentence saying how the figure was made. For the 28 other trips the cells were already weekly and the stated total was a rounded headline that disagreed with them by 2 to 14 percent. For all 58, `totalEur` is now the sum of the breakdown, `totalNote` says so, and `perDayEur` is the new total over 7 (as `normalize.py` does). This follows the precedent in `normalize.py`, which derives a missing total from the sum. It changes the headline price on 58 trips, in either direction: the Nordic ones fall (Copenhagen from 1,600 to 1,455 low), and most others rise.

Accommodation (T084-b, 34 trips, 46 errors). T143 settled the structure (schema v2.1: `sleepRef` on a night, `alternativeTo` on an entry that substitutes for a slept-in one). I applied it by reading each unslept entry's description. 41 entries on 30 trips say outright that they are a different-budget or different-area alternative ("if X is full", "the counter-strategy", "the splurge"), so they now carry `alternativeTo` with the rank of the nearest slept-in entry. On three trips (al-nature-escape-prespa-shebenik, hr-water-sports-dalmatia-sailing-kayak, pt-nature-escape-peneda-geres) the itinerary does sleep in the entry but in other words ("Bujtina homestay", "At anchor"), so those nights carry `sleepRef`. The it-city-naples entries 2 and 3 were added after the first pass with `alternativeTo` 1. Two errors remain on ba-nature-escape-una-national-park, which needs a content call (see What is still open).

I did not run the wire build into the app. I built it once to a scratch folder to confirm the new budget reaches the shipped shape (Copenhagen: total 1,455 to 2,650, perDayEur 208 to 379). No app source changed, so no screen changed and no browser check applies. The sparse worktree has no hero cache, so the scratch wire has no heroes and was not kept.

## Files touched

Modified:
- Trips/carta-unified/carta-unified/data/trips.master.json
- Trips/carta-unified/carta-unified/data/trips/*.json (82 trip files: 58 budget, 33 accommodation, 9 both)
- Trips/carta-unified/carta-unified/reports/validation-report.md
- Trips/carta-unified/carta-unified/reports/validation-issues.json
- Execution/_OPEN.md

Created:
- Execution/P9/T332-journey-data-fixes.md

The app worktree (continent-app) has no changes. The trip files are written with CRLF line endings and the same `json.dumps(indent=2, ensure_ascii=False)` layout as the originals (checked byte for byte on an untouched file first). Task T090 edits location fields in the same files; mine touch only `budget`, `accommodationStrategy[].alternativeTo` and `itinerary[].sleepRef`.

## Commands run

From `Trips/carta-unified/carta-unified` in `wt\T332`. The two edit scripts were one-off Python in the scratchpad and are not committed; the rules are in the section above.

```
python pipeline/validate.py --wire "<main>/continent-app/public/journeys"          # before: 606 errors
python <scratch>/fix_t332.py
python pipeline/validate.py --self-test --wire "<main>/continent-app/public/journeys"   # SELF-TEST OK
python pipeline/validate.py --check-urls --wire "<main>/continent-app/public/journeys" --gazetteer <scratch>/cities500.txt
python pipeline/journeys/build_wire.py --no-fetch --out <scratch>/wire               # scratch only, discarded
```

## Config and secrets set

None.

## Before/after measurements

Sources: the validator's own output, before from `reports/validation-issues.json` as T084 committed it (T084 report table) and my first local run (606 errors), after from the committed `reports/validation-report.md` (gazetteer and URL check on).

| Metric | Before | After | Delta |
|---|---|---|---|
| Validator errors | 606 | 464 | -142 |
| budget-sum-mismatch errors (trips) | 98 (58) | 0 (0) | -98 |
| accommodation-not-slept errors (trips) | 46 (34) | 2 (1) | -44 |
| hero-below-floor, comma-range-wire | 253, 209 | 253, 209 | 0, owned by T139, T085 |
| Warnings | 624 | 624 | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First pass left the changed notes without a full stop and the total note without a euro sign on the high figure | Appended sentence to notes that did not end in one; string template | Patched all 58 records in a second pass (not a rerun of the first script, which would have multiplied twice) |
| `verify_roundtrip.py` cannot run | It reads the source `.md` files from a path that exists only on the box | Not run. The edited fields are not parsed from source any more, so a roundtrip would flag them anyway |
| it-city-naples reported two errors after the first pass | Missed in my first mapping | Added `alternativeTo` |

## What is still open

The workflow is not green: 253 heroes below the floor (T139), 209 comma ranges in the wire (T085) and 2 Una errors remain, so I did not raise a new owner row for T084-c; that row stays open and the decision waits for green. Register rows T332-a (Una sleep nights), T332-b (README figures), T332-c (flat CSV and seed SQL not regenerated, owner). T084-a is closed by T332. T084-b was already closed by T143; its data part is fixed here except Una, and T143-a still carries the other v2.1 conversions (priceEur, gateways), so I left it open.

Judgement worth a spot check: choosing which slept-in entry each alternative substitutes for was my reading of the descriptions, and replacing the headline total with the breakdown sum on 58 trips is a product-visible change.

## Rollback procedure

`git revert` the T332 commit, or drop the branch `p9-journey-validator-data` before merge. This restores the old totals, the old accommodation fields and the T084 reports. No migration, no data outside the root repo, no wire in the app was changed.
