# T146 K3: Every number carries its own confidence, and the page shows it

## Task ID

T146 (mind-map number T148).

## Date

2026-10-03

## What changed

A generated trip now says how each of its figures is known, and the page says it back to the reader. Before this task a trip had a `verifyFlagCount`, a `volatilePricing` boolean and a free-text `confidenceNotes`, none of which could answer "is this number from a page, from arithmetic, or from the model's general sense of things". Now the record has a `figures` list, one row per figure, each `{path, confidence, sourceUrl, checkedAt}`, where confidence is sourced, derived or estimated.

I did not put a sibling `confidence` key beside every number, which is what the task text suggests. Every object in the v2.1 contract forbids unknown keys and takes a required key per field, so sibling keys would have added about 70 fields across the record, collided with the work T150 and T151 are doing on the same schema, and turned every figure into a multi-key object. One list keyed by dotted path adds one top-level field and leaves every existing number where it is. The schema paths I added are exactly these: `figures`, `figures[].path`, `figures[].confidence`, `figures[].sourceUrl`, `figures[].checkedAt`. Nothing else in the schema changed. `figures` is also in the required list, so a generated record without it is rejected.

A figure here means a field that makes a claim about the world: the four budget rows, the week total and per-day range, the exchange rate, airport transfer minutes, each day's distance, ascent, descent, time and spend, a stay's price, the surface split and the three week totals. The list is `FIGURE_PATTERNS` in `generation_gate.py`. Day numbers, ranks, months, the tier range, the difficulty score, word count and the like are identifiers and counters, not claims, and carry nothing. The model never writes the list. `figures` is in `DERIVED`, so it is not in the schema the model is given, and `generate_trip.py` builds it from the evidence rows pass three already returns. A model cannot grade its own work.

How each class is decided. Sourced is pass three's existing rule: an evidence row whose URL the grounding metadata says was actually read. Derived is arithmetic by the pipeline: `budget.totalEur` and `budget.perDayEur`. Estimated is new, and narrow. Pass three may now return an evidence row with a null URL, but only for `budget.breakdown.food` and a day's `timeMin`, the two figures where general knowledge is a fair basis (`ESTIMATE_OK`). A null URL on any other figure (a hotel price, a ticket or day spend, a transfer time, a distance, a climb, the exchange rate, the other three budget rows) is treated as invented: an optional figure is nulled and flagged, and a required budget row fails the trip. One honesty rule follows. A total summed from an estimated row is itself estimated, not derived, because "derived from sourced values" would be false. The gate enforces it (`figure-total-confidence`), along with one row per figure, a URL only on sourced rows, no estimate where it is barred, and no orphan rows. Because the critic must not be talked into agreeing by the writer's own labels, `figures` is in `CRITIC_HIDDEN`.

On the page, `JourneyPage.jsx` reads `figures` through `figureLedger` in `src/lib/journeys.js`. An estimated figure gets a small mono `est` mark with the reason in words for screen readers (the label is translated in all six languages). The mark lands on the food budget row, the week total and per-day range in both the facts card and the receipt, and at the end of a day's measured line when any figure in it is estimated. A new line in the "About this plan" block reads, for example, "23 of 27 figures on this page are sourced, 0 derived, 4 estimated, last checked October 2026." It counts only the figures the page shows (27 of the example's 30 rows; the surface split and the week distance and climb totals are not rendered), so the sentence is true of what is on screen. When the ledger exists the page uses the plain vintage line instead of saying "last checked" a second time. A trip without `figures` renders exactly as before, with no footer and no marks. That is deliberate: a v2.0 trip has no per-figure record, and inventing a split would defeat the point.

## Files touched

Root repo, branch p9-k3-confidence.

Modified:
- Trips/carta-unified/carta-unified/schema/trip.generated.schema.json (the `figures` field)
- Trips/carta-unified/carta-unified/schema/examples/generated-trip.example.json (30 figure rows)
- Trips/carta-unified/carta-unified/schema/SCHEMA.md (a paragraph on figures)
- Trips/carta-unified/carta-unified/pipeline/generation_gate.py (FIGURE_PATTERNS, ESTIMATE_OK, `figure_paths`, `figure_errors`, five new self-test mutations)
- Trips/carta-unified/carta-unified/pipeline/generate_trip.py (nullable evidence URL, estimate handling in `apply_evidence`, `make_figures`, `figures` hidden from the critic)
- Trips/carta-unified/carta-unified/pipeline/prompts/k2-numbers.md (version 2, rule 12)
- Execution/_OPEN.md

Created:
- tests/test_trip_confidence.py
- Execution/P9/T146-per-field-confidence.md

App repo, branch p9-k3-confidence.

Modified:
- src/lib/journeys.js (`figureLedger`, `anyEstimated`, `dayEstimated`, `monthLabel`; `lastCheckedMonth` now calls `monthLabel`)
- src/browse/JourneyPage.jsx (the `EstMark`, the footer line)
- src/styles/25-feature-pages.css (`.jpage-est`, next to the other journey rules)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (`journey.estMark`, `journey.estAria`, `journey.figureFooter`)

`build_wire.py` needed no change: it copies every record key into the journey file, so `figures` reaches the page.

## Commands run

From the root worktree:

```
python -X utf8 Trips/carta-unified/carta-unified/pipeline/generation_gate.py self-test
python -X utf8 Trips/carta-unified/carta-unified/pipeline/generation_gate.py check Trips/carta-unified/carta-unified/schema/examples/generated-trip.example.json
python -X utf8 Trips/carta-unified/carta-unified/pipeline/generate_trip.py self-test
python -X utf8 -m pytest tests/test_trip_confidence.py tests/test_generate_trip.py tests/test_trip_critic.py -q
```

From the app worktree:

```
npx eslint src/browse/JourneyPage.jsx src/lib/journeys.js
node --input-type=module -e "import('./src/i18n/xx.js')"     (for each of the six languages)
npm test
npx vite --port 5202 --strictPort      (temporary harness page and scratch trip, all deleted, server stopped)
```

The browser check mounted `JourneyPage` on a scratch copy of the example record with the food row, the week total, the per-day range and day 1's time marked estimated. At 380 and 1280 px: five estimate marks in the right places, the footer text above, no horizontal scroll, no "[object Object]", "undefined" or "NaN", and no console errors. No Gemini call was made (stage 3 of `_OPEN-MASTER.md` is not complete). Nothing was written under data/, cache/, R2 or production, no wire was written to the app, and no dist was kept.

## Config and secrets set

None. No dependency added, no migration.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Figures in a generated record with a stated confidence | 0 | 30 of 30 on the example (the gate rejects any unlabelled one) | new |
| Malformed answers the gate rejects (self-test) | 25 of 25 | 30 of 30 | +5 |
| Figures that may be estimated | not defined | 2 paths (food budget, day time) | new |
| Published v2.0 trips with a confidence footer | 0 of 253 | 0 of 253 (no `figures` yet) | 0, see T146-a |
| Figures the example page shows and counts | not applicable | 27 | new |
| Tests: generator, critic, confidence | 36 pass | 42 pass | +6 |
| App unit tests | not measured | 136 pass, 0 fail, 3 skipped | not compared |

In the harness run I forced four rows to estimated, so the footer read 23 sourced, 0 derived, 4 estimated of 27. The unmodified example is 27 shown, all sourced or derived.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Schema JSON invalid after my first edit | A shell heredoc halved the backslashes in the path regex | Doubled them in place and reparsed |
| French `journey.estAria` failed to parse | An unescaped apostrophe, same heredoc cause | Escaped it; all six i18n files parse |
| Gate self-test failed on the `derive()` round trip | The round trip stripped every DERIVED key, and `figures` is DERIVED but written by the generator, not by `derive()` | The round trip keeps `figures` |
| An estimated hotel price test failed for the wrong reason | An older gap: withholding a hotel price leaves `priceUnit`, so the trip is rejected for `price-unit` | The test asserts what this task promises (never kept as an estimate); the gap is T146-b |

## What is still open

Seven register rows, T146-a to T146-g. The main one is the backfill. None of the 253 published trips has `figures`, so the feature is invisible on the live catalogue until T149 writes them; the page needs no change when it does. A withheld hotel price still costs the whole trip because `priceUnit` is left behind (T146-b). The owner should confirm the two-figure estimate list (T146-c, Owner `user`). The footer's date is the day the pipeline checked the figure, not a person's review, so T094-b stays open (T146-d). The surface split and week totals have rows but are not shown on the page, so they are not counted (T146-e). The estimate mark is per day line, not per figure, until the day carousel splits the line (T146-f). Per-field expiry from the spec's child list is not built (T146-g).

## Rollback procedure

Revert the task commits on p9-k3-confidence in both repos, or drop the branches before merge. That removes the `figures` field and its gate rules, restores prompt version 1 and the evidence schema, and restores the page and i18n files. No data, wire, migration or dependency changed. A record admitted after this task carries `figures`; one admitted after a revert would be rejected for the unknown key, so revert before the first live generation run.
