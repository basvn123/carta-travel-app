# T230: Data and coverage gate

## Task ID

T230 (mind-map number T203).

## Date

2026-10-06

## What changed

No code or data changed. T230 is an audit of the eight criteria in its prompt against the two gates that already exist, the trip validator (T084, extended by T091) and the coverage gate (T112). Neither gate is green. Both tools are sound, since the validator self-test and the coverage self-test pass. What fails is the data they judge, and in one case the data they would judge does not exist yet.

The trip validator reports 517 errors on 253 trips (stdout: TRIPS:253 ERRORS:517 WARNINGS:713 NOTICES:30). The errors are hero-below-floor 253, comma-range-wire 209, hero-duplicate 53 and accommodation-not-slept 2. The first three are counts of trips. The last is 2 errors on 1 trip, ba-nature-escape-una-national-park, which lists Camp Lucica and the rafting-operator bungalows in its strategy and sleeps in neither.

The comma ranges are no longer a builder bug. T085 fixed build_wire.py, but the tracked wire in continent-app/public/journeys was never rebuilt, so it still holds the old text (register row T085-a). The coverage gate cannot judge anything because reports/coverage_contract.json is not committed. Run against the main checkout it prints "WARNING: reports\coverage_contract.json is not committed, so the contract is NOT being enforced" and exits 0. That pass is vacuous, not a green result.

The done condition, both CI gates green on a clean build, is not met. Closing the gap needs the wire rebuild, the hero builder change (T139) and a data lane run, which belong to other tasks.

## Files touched

Created: Execution/P13/T230-data-coverage-gate.md (this report).

Modified: Execution/_OPEN.md (rows T230-a to T230-e).

Nothing else in the repository. The validator outputs were written to C:\Users\Gebruiker\Documents\Portfolio\wt\T230-out\ (r.md, r.json), outside the repository.

## Commands run

From Trips/carta-unified/carta-unified in the main checkout, read only:

    python pipeline/validate.py --self-test
    python pipeline/validate.py --report C:\Users\Gebruiker\Documents\Portfolio\wt\T230-out\r.md --json C:\Users\Gebruiker\Documents\Portfolio\wt\T230-out\r.json

The self-test printed "seeded=12 checks" and "SELF-TEST OK: every seeded defect was caught, the control stayed clean". The full run printed the totals above. The per-code counts below come from r.json.

From the root of the main checkout:

    python pipeline/regions/coverage_gate.py --self-test
    python pipeline/regions/coverage_gate.py --check reports/coverage_contract.json --baseline reports/coverage_gate_baseline.json

The first printed "coverage_gate self-test: clean passes, 8 seeded faults caught". The second printed the not-enforced warning and exited 0.

## Config and secrets set

None.

## Before/after measurements

Before is what the owning task reported when it landed. For the validator that is T084 (Execution/P5/T084-trip-validator.md, the "Every error code" table and the measurements table). For the coverage gate that is T112 (Execution/P7/T112-coverage-dashboard-and-gate.md, measurements table). After is the run above. This task changed no code, so the delta is the effect of the tasks that landed in between, not of T230.

| Metric | Before | After | Delta |
|---|---|---|---|
| Validator errors, 253 journeys | 606 (T084) | 517 | -89 |
| hero-below-floor, trips | 253 (T084) | 253 | 0 |
| comma-range-wire, trips | 209 (T084) | 209 | 0 |
| budget-sum-mismatch, errors | 98 on 58 trips (T084) | 0 | -98 |
| accommodation-not-slept, errors | 46 on 34 trips (T084) | 2 on 1 trip | -44 |
| hero-duplicate, trips | not in T084's error table | 53 (26 photographs) | +53 |
| Validator warnings | 624 (T084) | 713 | +89 |
| Builds that judge a coverage contract in CI | 0 (T112) | 0 | 0 |

The four codes in T084's table sum to 606 (253 + 209 + 98 + 46), and today's four sum to 517 (253 + 209 + 53 + 2), which matches the validator's own totals. The hero-duplicate check was added by T091 after T084. I did not trace why the budget and accommodation counts dropped, since that is outside this task.

The hero-below-floor trips break down as 244 with a recorded size, from 640px to 1280px (219 at 1280, 7 at 1024, 6 at 800, the remaining 12 between 640 and 1261), and 9 with no recorded size (r.json). The widest hero is 1280px because build_wire.py sets THUMB_W = 1280.

## What broke and how it was fixed

Nothing broke in the tools. The first version of this report, committed as 1a447521c, carried errors that this version corrects.

| What | Cause | Fix |
|---|---|---|
| accommodation-not-slept stated as 2 trips | It is 2 errors on 1 trip | Corrected throughout |
| "No documented gate" before | T084, T085 and T112 had built and documented both gates | Before and after now cite their reports |
| "€1,200, €1,850" shown as a real finding | That string is the validator's own seeded fault in validate.py | A real hit is "€430, €785" in a totalNote |
| Hero range "800px to 1280px" | 244 sized heroes run 640px to 1280px and 9 carry no size | Corrected above |
| Coverage self-test "9 faults" and "8 faults" in two places | The self-test prints 8: seven fault cases plus the ratchet regression | 8 used; the trip validator seeds 12 checks |
| Both workflows "run on every commit to main" | Both are path filtered and nothing is pushed | See the last section |
| 183 no-sleep-lines read as empty section headings | The check is about sleep lines, not headings | See criterion four |

## What is still open

Each item is also a row in Execution/_OPEN.md.

T230-a: hero-below-floor on all 253 trips. No hero can reach 1600px until T139 (wave 19, not yet run) changes the derivative widths. No earlier row covers it, so this is the one data defect this task raises.

T230-b is closed as a duplicate of T112-a (commit the coverage contract and baseline, then add --require). T112-c covers the stale reports/coverage.html.

T230-c: validate.py has no check that numeric fields carry a confidence. generation_gate.py enforces the figures list on newly generated trips, but the 253 published trips carry none (T146-a) and the validator does not look.

T230-d: no data structure holds a view image or terrain render per published row, so no check can exist.

T230-e: no check exists for an activity-type trip with a settlement hero. See criterion six.

Findings that existing rows already cover and this task does not duplicate: comma-range-wire is T085-a, hero-duplicate is T091-a (it expects 53 errors until the wire is rebuilt), the validator workflow failing by design is T084-c, and the contract not being committed is T112-a.

## Rollback procedure

Nothing shipped. Revert this report and the register edits with git revert of the T230 commits on branch p13-data-coverage-gate, or delete the branch before it is merged. The change to T230-b's status reverts the same way.

---

## Verdicts on the eight criteria

1. The trip validator passes on every trip. Fail. 517 errors, and every trip has at least one because hero-below-floor hits all 253 (validate.py run, r.json).

2. The coverage gate passes or every miss carries a reason code. Fail, in the sense that nothing is judged. The self-test passes (8 seeded faults caught), but reports/coverage_contract.json is not committed, so the gate exits 0 with a not-enforced warning. A pass that checks nothing is not a pass. The open row is T112-a.

3. No comma-ranges. Fail on the shipped wire: comma-range-wire fires on 209 trips (r.json). The master dataset is clean, since no comma-range code appears in r.json. The cause is the stale wire, T085-a.

4. No empty section headings. Pass by reading the code, and no automated check exists. The 183 no-sleep-lines warnings are not about headings. In validate.py (around line 668) the check fires when no itinerary day has a sleep line, and its message says the accommodation strategy "cannot be checked against the itinerary". It limits what the validator can verify and says nothing about rendering. For rendering I read continent-app/src/browse/JourneyPage.jsx at app commit 6c99ebd. The facts, route, budget, specification, itinerary, accommodation, log and tips folds are each wrapped in a length or presence check, as is the hazards section. The packing fold is not wrapped, and does not need to be: lib/packGrid.js tops written notes up with the trip type's standard kit to 16 cells or more, so it is never empty. That differs from T086's report, which described a guard on packingNotes at line 631. The page has since changed, and T086's 153-trip count refers to the old guard. No validator or audit watches for an empty heading, so a section added later without a guard would not be caught.

5. No hero under 1600px. Fail. hero-below-floor fires on 253 of 253 trips (r.json). T139 owns the fix.

6. No activity-type trip with a settlement hero. No check exists. validate.py has no check on what a hero shows. Its hero checks are missing, below floor, duplicate and URL resolution. T091-b records that replacement heroes are place photographs, and spec B1 and B2 describe the problem, but nothing measures it, and a check needs a way to tell an activity photograph from a place one first. The spec's own examples, such as a cycling week opening on an aerial of Pula, suggest it fails widely, but that is not measured. Raised as T230-e.

7. Every published row has a view image or a terrain render. No check exists. The schema carries no gallery or terrain image per row, so there is nothing to test. Raised as T230-d.

8. Every numeric field carries a confidence. Fail on the published trips, and no check exists in validate.py. The 253 trips carry no figures list (T146-a). T146 added the structure and generation_gate.py enforces it on newly generated trips only. Raised as T230-c.

## How the two gates are wired

The trip-validator workflow (.github/workflows/trip-validator.yml) runs on pushes to main and on pull requests, but only when a path in its filter changes: the trip dataset folder, pipeline/journeys, continent-app/public/journeys, or the workflow file. The coverage-contract workflow uses the same event types, filtered to coverage.py, coverage_gate.py, the contract and baseline JSON, and its own file. So neither runs on every commit to main. Nothing has been pushed to origin, and main is 73 commits ahead of origin/main in the main checkout, so neither workflow has run on GitHub. The validator workflow fails by design until the wire rebuild and T139 land (T084-c). The coverage workflow will pass vacuously until the contract is committed (T112-a).
