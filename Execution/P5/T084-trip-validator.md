# T084 Write the mechanical trip validator and put it in CI

## Task ID

T084 (mind-map number T080).

## Date

2026-10-01

## What changed

The trip dataset validator, `Trips/carta-unified/carta-unified/pipeline/validate.py`, now runs the seven mechanical checks from the trips enhancement spec, section K5, and a new GitHub Actions workflow runs it on every change that can alter a trip. Before this task the validator checked the schema contract only and passed the 253 journeys with 0 errors and 482 warnings. It now fails them with 606 errors across all 253 trips, and every error code maps to a task already in `_ORDER.md` (table below).

The validator reads two layers, because the defects live in two places. The master dataset (`data/trips.master.json`) carries the budget, the itinerary and the accommodation strategy, so the arithmetic, place, sleep and surface checks read it. The shipped wire (`continent-app/public/journeys/journey/*.json`, written by `pipeline/journeys/build_wire.py`) is the only place a hero photograph exists, and it is also where the comma ranges are created: the master still has its en dashes, and the wire builder's dash stripper turns "€1,200 to €1,850" written with a dash into "€1,200, €1,850". So the hero checks and a second comma-range check read the wire. The wire is tracked in the root repo, which is why CI can read it without the app repo.

How each check decides. The budget breakdown must sum to `budget.totalEur` within 1% (a euro or two of rounding); the old 15% tolerance was a warning and is replaced by this error. `perDayEur` must equal the total over `durationDays` within one euro. The surface split in `typeSpecific.surface` is cut per day or per sentence, and each group of two or more percentages must add to 100 within two points. Every entry in `accommodationStrategy` must be named in at least one day's `sleep` line, by folded substring or by most of its distinctive words; an entry that offers alternatives ("X or Y") passes if either is slept in. The comma-range pattern matches "€a, €b" where b is larger than a and no third figure follows, so a genuine pair of prices ("€14, €13 online") and a list of notes ("€5, €10 and €20") do not trip it. A hero must exist and its long edge, as recorded in the wire, must be at least 1600px. With `--check-urls` every hero URL gets a paced HEAD request; a 4xx is an error, and a 429, 5xx or transport failure is a warning to re-run, because upload.wikimedia.org rate-limits bursts. The place check takes names from day titles, sleep lines, basecamps and the sub-region (not free prose, which names dishes and people), looks them up in GeoNames cities500 restricted to Europe, and warns when a name matches only a town of over 20,000 people in a country the record never mentions.

The place check is a warning, not an error, and that is deliberate. An offline gazetteer lists settlements, and the itinerary also names huts, beaches, peaks and districts, so most of today's 19 hits are namesakes ("Salt" in Spain, "Pantheon" in France, "Melnik" in Czechia because the Bulgarian Melnik has under 500 people). Making it an error would turn CI red on noise. The real geolocation fix, T090, owns it.

The validator also has a `--self-test` mode, and CI runs it before the real run. It finds the first trip that is clean on every K5 check, plants one defect per check in a copy (an extra €500 in a breakdown category, a wrong perDayEur, "€14, €22" in the summary, a 60/30 surface split, a strategy entry nobody sleeps in, Salamanca or Uppsala in a day title, a 1280px hero on a dead Commons URL, and a second copy with no hero) and requires every planted code to be reported on the copies and none on the clean control. A check that silently stops firing looks exactly like a catalogue with no defects, so this is what keeps a green run meaningful once the real failures are cleared. I confirmed it bites: with the surface tolerance and the hero floor deliberately broken in a scratch run, the self-test failed on exactly those two codes.

Every error code, and where it goes:

| Error code | Count | Trips | Owned by |
|---|---|---|---|
| hero-below-floor | 253 | 253 | T139 (B3 + B4, 1600px floor and derivative widths) |
| comma-range-wire | 209 | 209 | T085 (A1, ranges as {low, high}) |
| budget-sum-mismatch | 98 | 58 | T149 (K9 fill mode), see T084-a |
| accommodation-not-slept | 46 | 34 | T149 for the data, T143 (K1 schema) for the structure, see T084-b |

The hero failure is universal because `build_wire.py` requests 1280px derivatives from upload.wikimedia.org (its THUMB_W), and nine heroes carry no size at all. The validator measures what is served, not what the original could be, so T139 has to change the derivative width as well as re-source the small originals (21 heroes are under 1200px even at the served size). Of the 98 budget mismatches, 59 are off by more than 40% on 30 trips from the Nordic batch, where the breakdown was written per night or per day while the total is for the week; 28 are within 5% and are plain source arithmetic. The 46 accommodation misses are mostly city trips that list one hotel per budget tier while the itinerary sleeps in only one of them, which the spec's rule counts as a defect; whether a tier alternative should be exempt is a schema question for T143. No trip fails perDayEur or the surface sum today. `normalize.py` derives perDayEur from the total, so that check guards against future drift, and of the 130 trips with a surface line, 25 carry a percentage split (33 groups) and all of them add to 100.

Warnings that map onward: no-sleep-lines on 183 trips means the accommodation check can run on only 70 trips (T149), and place-outside-country on 19 (T090). All 253 hero URLs resolved on 2026-10-01.

## Files touched

Modified:
- Trips/carta-unified/carta-unified/pipeline/validate.py
- Trips/carta-unified/carta-unified/reports/validation-report.md
- Trips/carta-unified/carta-unified/reports/validation-issues.json
- Execution/_OPEN.md

Created:
- .github/workflows/trip-validator.yml
- Execution/P5/T084-trip-validator.md

The two report files are the validator's own tracked output, and the dataset README points readers at them. I committed them refreshed because leaving them would keep stating "0 errors" for a dataset the validator now fails. They were generated with the same inputs CI uses (a fresh cities500 download and `--check-urls`). CI itself writes its report to the runner's temp directory and uploads it as an artifact, so CI never dirties the tree.

## Commands run

From `Trips/carta-unified/carta-unified` in the worktree, with the wire read from the main checkout because the sparse worktree has no continent-app folder:

```
curl -fsSL https://download.geonames.org/export/dump/cities500.zip -o <scratch>/cities500.zip
unzip -o -q <scratch>/cities500.zip -d <scratch>
python pipeline/validate.py --self-test --check-urls --wire "<main>/continent-app/public/journeys" --gazetteer <scratch>/cities500.txt
python pipeline/validate.py --check-urls --wire "<main>/continent-app/public/journeys" --gazetteer <scratch>/cities500.txt
```

To rehearse the workflow I cloned the branch into a scratch folder with the same sparse set the workflow checks out (`Trips/carta-unified/carta-unified` and `continent-app/public/journeys`) and ran both steps with the default `--wire`: self-test OK, then exit 1 with the same 606 errors. The workflow has not run on GitHub, because the branch is not pushed.

## Config and secrets set

None. The workflow downloads GeoNames cities500 (CC BY 4.0) on each run and installs geonamescache on the runner as the fallback gazetteer; neither is a repository dependency.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Validator errors on the 253 journeys | 0 | 606 | +606 |
| Trips with at least one error | 0 | 253 | +253 |
| Validator warnings | 482 | 624 | +142 |
| K5 checks implemented (of 7) | 0 (budget sum only as a 15% warning) | 7 | +7 |
| Budget breakdown findings | 60 warnings at 15% | 98 errors at 1% | +38 |
| CI jobs that run the trip validator | 0 | 1 | +1 |

The warning increase is no-sleep-lines (183) and place-outside-country (19) arriving, less the 60 budget-sum-drift warnings that became errors.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The resumed edit measured the hero floor on width only | The earlier session compared `w` to 1600, while spec B3 measures the long edge | Compare max(w, h); a hero with neither is an error |
| Self-test found no clean control trip | Every trip with sleep lines carries a stripped range in the real wire, so no real wire record is clean | The control's shipped copy is the master record itself, which still has its en dashes |
| Runs against the cached cities500 gave 18 place warnings, CI-equivalent runs 19 | The cache in the main checkout is older than today's GeoNames dump | Committed reports use the fresh download, the same as CI |

## What is still open

The workflow fails on every run until T085, T139 and the budget and accommodation fixes land. That is what the done condition asks for, but the owner has to decide whether to merge it as a required check now or as an informational one, and it has not yet run on GitHub (T084-c).

Two of the four error codes have an owner in name only. Nothing in `_ORDER.md` says "fix the budget arithmetic" or "make the strategy and the sleep lines agree". T149's fill-mode pass over the 253 is the natural home for both, and T143's schema should make each sleep line reference a strategy entry so the class cannot come back. Those prompts need to name the codes (T084-a, T084-b).

The dataset README still says "0 errors, 482 warnings" in its tree listing and describes the 15% budget drift as a known gap. It is outside this task's named files (T084-d).

The place check stays a warning until T090 geocodes against a source that knows huts and peaks. A Morocco day trip from Tarifa ("Tangier") is a correct border crossing the country word list does not cover; that is accepted noise, not an open item.

## Rollback procedure

Revert the task commit (`git revert <T084 commit>`) or, before merge, drop the branch. That restores the schema-only validator and its old reports and removes the workflow. Nothing was written outside the root repo, no data was changed and no migration was added.
