# T313: credit strings into Where this comes from, and the lint parser

## Task ID

T313

## Date

2026-10-02

## What changed

The licence names ODbL and GLO-30 no longer appear in surface copy. The two credit strings, `dest.routesCredit` and `cycle.sourceNote`, now say in plain words who supplied the data (OpenStreetMap contributors; Copernicus satellite data, ESA and Airbus), so the credit the licence requires stays visible next to the data. The licence names moved into a new collapsed row, "Where this comes from" (`credit.where`), with the texts `credit.licence.routes` and `credit.licence.cycle`. A small component, `CreditFold.jsx`, renders it under the routes credit on the destination page, under the cycle route credit, and under the cycling list credit. All six locales were edited and all six parse.

The lint parser in `scripts/ci/banned-terms.mjs` cut a value short at an apostrophe, so French strings were dropped. It now reads to the matching closing quote, and it skips keys that start with `credit.licence.` because the footer is where the names belong. It stays report-only.

## Files touched

**Modified (continent-app):**
- scripts/ci/banned-terms.mjs
- src/browse/RoutesFromHere.jsx
- src/browse/CyclePage.jsx
- src/browse/DestinationsTab.jsx
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js
- src/styles.css (three `.credit-fold` rules at the end)

**Created:**
- src/browse/CreditFold.jsx
- Execution/P10/T313-credit-footer.md

**Modified (root):** Execution/_OPEN.md

## Commands run

```powershell
node scripts/ci/banned-terms.mjs
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
npx eslint src/browse
npm run build
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Banned-terms hits, fixed parser on the old strings | 12 | 0 | -12 |
| Banned-terms hits, old parser (as T157 reported) | 10 | not run | not applicable |

The 12 come from running the fixed parser against the i18n files at the start of this task. The French `cycle.sourceNote` was the dropped one.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Build failed in DestinationsTab.jsx | Two sibling elements inside a `&&` branch | Wrapped them in a fragment |
| Parser regex came out wrong twice | Backslash lost while scripting the edit | Wrote the regex with node and checked the bytes |

## What is still open

The three surfaces were not viewed in a browser at 380px and desktop width: the worktree has no wire or routes data to open a destination with routes. Row T313-a (owner). The cycle page prints the wire's own `route.osm.attribution` when present, and that data string may still name ODbL: row T313-b. T157-a and T300-q are closed by this task.

## Rollback procedure

Revert the app commit on `p10-credit-footer` and the root commit. No data or schema changed.
