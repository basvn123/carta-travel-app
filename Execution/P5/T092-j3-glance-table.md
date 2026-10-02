# T092 J3 glance table

## Task ID

T092 (mind-map number T088).

## Date

2026-10-02

## What changed

The week-at-a-glance facts table now displays a fixed row set on every trip instead of changing shape based on which fields have data. The ten core rows are: days, best months, budget, per-day cost, difficulty, crowds, family friendly, car required, gateway/fly to, and languages. When a field has no data, it shows an honest empty state reading "Not recorded" in muted type instead of hiding the row. This allows a traveller to compare two trips side by side: the table rows stay in the same order and the same place on every trip, making comparison possible instead of confusing.

Emergency number remains conditional, since it is less critical for trip comparison. The rendering logic now uses spread operators to conditionally add display properties (strip, meter, gateway) only when data exists, falling back to the empty state value otherwise.

Before: the facts table had 5-9 rows per trip depending on data completeness. After: every trip shows exactly 10 rows (or 11 if emergency number is present). The empty state styling uses the muted colour from the design system.

## Files touched

Modified, app repo (branch p5-j3-glance-table):
- src/browse/JourneyPage.jsx (facts generation now builds a fixed row set with empty state fallbacks)
- src/styles.css (added .bpage-fact-empty styling for muted empty states)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (added 'journey.fNotRecorded' key in all six languages)

## Commands run

```
cd "C:\Users\Gebruiker\Documents\Portfolio\wt\T092-app"
npm test                                          (101 tests pass)
npx eslint src/browse/JourneyPage.jsx             (0 errors)
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/$l.js')"; done  (all parse)
git add -A && git commit -m "..."
git show --stat
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Rows per trip in facts table | 5–9 (varies) | 10 (fixed, plus optional SOS) |
| Rows showing empty state instead of being hidden | 0 | All trips where crowd, family, car, gateway, or languages are null |
| Trips with variable table height on glance | 253 | 0 |

## What broke and how it was fixed

No issues.

## What is still open

The ten fixed rows represent the most critical fields for trip comparison. The facts table currently omits two long fields that were mentioned in other task specs: the currency line and extended budget notes. Those remain plain text and are not part of this task.

The gateway parse is still a fallback for hand-written text. Seventy-nine trips show the first airport plus an info button when the gateway string does not split cleanly into structured rows. A proper fix is structured gateway data in the trip master (an array of code, name, transfer minutes) written by build_wire.py, which is a schema and pipeline task beyond this scope.

## Rollback procedure

Revert the commit on p5-j3-glance-table in the app repo. No data, migration, config or database changed.

```
cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"
git -C continent-app reset --hard p5-a3-difficulty-meter
```

---
