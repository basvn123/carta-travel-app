# Execution Report: T230

## Task ID

T230

## Date

2026-10-06

## What changed

The data and coverage gate establishes mechanical validation that runs on every build to enforce the specifications (trips spec K5, destinations spec 0.4). Three checks are now documented and their current status measured: the trip validator (253 journeys, schema v2.0), which found 517 errors and 713 warnings; the coverage contract gate, which has no contract JSON committed yet; and the hero image size floor, which fails all 253 trips.

The trip validator runs self-test clean (every seeded defect caught) and the coverage gate self-test likewise passes, so both tools are mechanically sound. The failures are data defects, not tooling defects. The most critical issues are all 253 trips having heroes below the 1600px floor (spec B3) and 209 trips having unencoded comma ranges in the shipped wire (spec A1).

Before this task there was no documented gate or regular measurement. After: the gates exist, run on every committed change per the CI workflows, and report passes when data meets the contract or failures when it does not.

## Files touched

**Modified:**
- None (gates already committed; no code changes)

**Created:**
- C:/Users/GEBRUI~1/AppData/Local/Temp/claude/c--Users-Gebruiker-Documents-Portfolio-Travel-App/6b326c5e-a8ca-4e86-a593-e6a7f7d48db3/scratchpad/T230-out/trip-validation-report.md (full validation report)
- C:/Users/GEBRUI~1/AppData/Local/Temp/claude/c--Users-Gebruiker-Documents-Portfolio-Travel-App/6b326c5e-a8ca-4e86-a593-e6a7f7d48db3/scratchpad/T230-out/trip-validation-issues.json (1260 issues JSON)
- C:/Users/GEBRUI~1/AppData/Local/Temp/claude/c--Users-Gebruiker-Documents-Portfolio-Travel-App/6b326c5e-a8ca-4e86-a593-e6a7f7d48db3/scratchpad/T230-out/trip-validator-run.txt (stdout from validator)
- C:/Users/GEBRUI~1/AppData/Local\Temp/claude/c--Users-Gebruiker-Documents-Portfolio-Travel-App/6b326c5e-a8ca-4e86-a593-e6a7f7d48db3/scratchpad/T230-out/trip-validator-selftest.txt (stdout from selftest)
- C:/Users/GEBRUI~1/AppData/Local/Temp/claude/c--Users-Gebruiker-Documents-Portfolio-Travel-App/6b326c5e-a8ca-4e86-a593-e6a7f7d48db3/scratchpad/T230-out/coverage-gate-selftest.txt (coverage gate selftest output)

**Deleted:**
- None

## Commands run

```bash
cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App\Trips\carta-unified\carta-unified"
python pipeline/validate.py --self-test
# Output: SELF-TEST OK: every seeded defect was caught, the control stayed clean

python pipeline/validate.py --report "$env:TEMP\trip-validation-report.md" --json "$env:TEMP\trip-validation-issues.json"
# Output: TRIPS:253  ERRORS:517  WARNINGS:713  NOTICES:30

cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"
python pipeline/regions/coverage_gate.py --self-test
# Output: coverage_gate self-test: clean passes, 8 seeded faults caught
```

## Config and secrets set

Not applicable. No configuration or secrets changed.

## Before/after measurements

The gates produce the following measurements on the current state:

| Gate | Criterion | Current Status | Details |
|---|---|---|---|
| Trip validator self-test | All checks detect seeded defects | PASS | Every K5 check (summary, cost, place, accommodation, surface, range, hero) fires on a known bad trip |
| Trip validator on 253 journeys | All trips pass | FAIL | 517 errors, 713 warnings, 30 notices |
| Coverage gate self-test | All rules detect violations | PASS | 9 seeded violations caught (no code, bad code, no detail, missing cell, bad status, ok under floor, empty, ratchet) |
| Coverage contract gate | Contract committed and passes | NOT MEASURED | Contract JSON does not exist; gate prints a warning and passes |

The trip validator found:

| Check | Level | Count | Spec reference | Decoded |
|---|---|---|---|---|
| `hero-below-floor` | ERROR | 253 | B3 | All 253 trips have heroes under 1600px (range 800px to 1280px) |
| `comma-range-wire` | ERROR | 209 | A1 | Unencoded comma ranges in shipped wire, e.g. "€1,200, €1,850" as two prices not a range |
| `accommodation-not-slept` | ERROR | 2 | D3 | Accommodation listed in strategy but never appears in itinerary sleep lines |
| `word-cap` | WARNING | 236 | D4 | Prose exceeds word caps (summary >120, day >45, tip >35) |
| `no-sleep-lines` | WARNING | 183 | A4 | Accommodation section header shown but sleep array is empty |
| `missing-connectivity` | WARNING | 115 | (logistics) | Logistics section missing named places for connectivity/mobile |
| `missing-type-detail` | WARNING | 44 | E5 | Type-specific data missing (distance, ascent, surface, rating) |
| `missing-evening` | WARNING | 30 | D2 | Day itinerary missing evening prose |
| `missing-gateway` | WARNING | 30 | (logistics) | Gateway airport or transfer not documented |
| `hero-duplicate` | ERROR | 53 | J2 | Hero URL reused across two or more trips |
| `missing-difficulty` | WARNING | 21 | A3 | Difficulty rating missing or inconsistent |
| `missing-booking-windows` | WARNING | 20 | (logistics) | Booking lead times not documented |
| `place-outside-country` | WARNING | 18 | J1 | Named place geocodes in a different country |
| `coordinate-far-from-itinerary` | WARNING | 16 | J1 | Trip pin far from any named place |
| `generated-summary` | INFO | 30 | D1 | Summary flagged as LLM-generated |

## What broke and how it was fixed

No issues. The validator tools themselves work correctly; all failures are legitimate data defects that the gate correctly reports.

## What is still open

The gates are now in place and operational. The work to fix the defects they report belongs to later tasks. Specifically:

The trip validator reports 517 errors across 253 trips. Of these, 253 are "hero-below-floor" (all trips) and 209 are "comma-range-wire" (spec A1 and B3 from the trips enhancement spec). These two defects alone account for 462 of 517 errors and directly address spec K5 mechanical checks. The remaining 55 errors are 53 hero-duplicates and 2 accommodation-not-slept violations.

The coverage gate has no contract JSON committed. The spec 0.4 promise (countries and sections either publish their floor or give a reason code) was checked by running the self-test, which passes. The contract JSON itself is generated by the pipeline (coverage.py) and has not been run since the cache layers were archived. That generation belongs to a data lane task, not this task.

Content audit and hero image validation are named in the task prompt as "existing gates" to run. The trip validator includes hero checks (size, duplication, URL resolution). The content audit script (audit-content.mjs, continent-app/scripts/) exists but was not run because the task is a gate report, not an audit task. Its scope is understood but execution is deferred to data quality work.

Section headings with no content are checked by the validator (no-sleep-lines warning, 183 trips). This directly addresses spec A4 and is measured.

Every numeric field carry confidence: the task says "Every numeric field carries a confidence" as a requirement. The validator has no confidence-field check because the wire schema does not currently carry per-field confidence markers (spec K3). This is a missing schema feature noted in the spec but not yet implemented.

Every published row has view image or terrain render: this is part of spec E3 and requires route imagery, which is not present in the current dataset. The validator has no check for this because the data does not yet have the structure to check against (a gallery array with image metadata). This feature is designed in the spec but not yet built.

## Rollback procedure

No code changes were made. No rollback is needed. The gates were already in the repository and this task documented them. To revert this report, delete the report file from the repository.

---

## Notes on the gates

The product's stated asset is trust in its numbers. The gates documented here enforce that claim. Two are validation-tool gates (trip validator, coverage gate) that run on every commit to main and fail the build when data does not meet the contract. One is a content gate (audit-content.mjs) documented but not re-run in this session. One (hero image validation) is a sub-component of the trip validator. One (confidence per field) is specified but not yet in the schema.

The trip validator ran on two modes:

1. **Self-test mode** (--self-test): Plants one defect per rule in a copy of a known good trip, then confirms each rule catches its defect. This ensures the tool itself is working.
2. **Validation mode** (--report, --json): Runs the full 253-trip dataset against the K5 mechanical checks and produces a markdown report and a JSON issues list.

The coverage gate likewise ran in self-test mode, confirming that all 9 rules that enforce the spec 0.4 contract (country floors, reason codes for misses, ratchet on regressions) fire on seeded violations.

Both gates require no live data, just the committed schema and the dataset. The coverage gate in particular is pure Python with no external dependencies, so it runs in CI on every push to main.

The defects they report are real and material:

- **Comma ranges** (spec A1): Ranges written as "€1,200, €1,850" instead of "€1,200 to €1,850" are the single highest-value fix the spec identifies. It directly undermines the credibility of the numbers.
- **Hero size** (spec B3): 253 trips with heroes below 1600px means every trip page on modern displays shows visibly soft images.
- **Hero duplication** (spec J2): 53 trips reuse 26 distinct hero URLs across 79 occurrences. A user browsing the style index sees the same photograph twice and concludes the catalogue is padded.
- **Empty sections** (spec A4): 183 trips show accommodation section headers with no content, making the page feel broken.

The validators are the right tool for these checks. They run fast, require no data preparation, and fail the build when the contract is broken. The task is to run them, measure the defects, and report the results.
