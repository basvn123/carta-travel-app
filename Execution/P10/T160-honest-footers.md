# T160: the honest coverage and provenance footers

## Task ID

T160 (mind-map number T164).

## Date

2026-10-03

## What changed

Two footers now exist, one for listings and one for detail pages, and both read real data.

A listing footer says how many items Carta publishes for the country on screen, how many more it knows of, how many of those it cannot map, and the reason in words. Its text, with the data from the T111 contract: "We publish 12 walks in Albania. We know of 31 more that people write about and we cannot yet map 19 of them, because no open data exists for them." It sits under the credit line on five listings: walks, cycling, beaches, lakes and mountains. With no country chosen it says "across Europe" and sums every country. The country it speaks about is the one the list is actually answering for, the same variable that picks the rows (`wantBeachCountry`, `trailsCountry` and so on), so the sentence never describes a different place from the cards above it.

A detail footer says how the figures on the page are known: "3 of 4 figures here are measured, 1 calculated, 0 estimated. Last checked September 2026." It is on the trail, beach, lake, mountain, cycle (route and tour) and destination pages. The journey page already had its footer from T146 and is unchanged, with its sourced, derived and estimated wording, which is the same idea on a schema that records it per figure.

How the listing sentence is composed. `coverageFacts` in `src/lib/footers.js` reads `coverage.json`. When the wire carries the T111 `contract` block it takes the country cell: `published`, `must - must_published` as the number we know of, and the reason code. The number we cannot map comes from a new `by_code` count on each cell, which I added to `pipeline/regions/coverage.py` (seven lines in `_cell`). The cell already named only the dominant code, and the miss list is capped at 200 and dropped from the wire, so without `by_code` the page could not say "19 of 31". The sentence names the dominant code's count, and the reason text for each of the seven codes is a catalogue key (`cov.why.*`). A `not_applicable` cell gets its own sentence instead of a gap. When the wire has no contract (the case today, see T160-a), the footer falls back to the per region audit the wire has always carried: published count, and how many of the regions checked are below target. It says less rather than guessing the rest.

How the detail sentence is composed. Every figure a page shows is one of three kinds, and the page already hints at the kind with a tilde or a note. Measured means a source record or the elevation model says it. Calculated means our arithmetic on measured values. Estimated means a rule of thumb or a model. The beach, lake and mountain pages already build a `facts` array, so each fact key maps to a kind (`BEACH_KIND`, `LAKE_KIND`, `mountainKind` in `footers.js`); a computed prominence is calculated, and one the search window could only bound from below ("at least") is an estimate. The trail, cycle and destination pages list the kinds inline next to the facts they print. Only what is on screen is counted, so the sentence is true of the page. A page with no figures renders no footer. The date is the coverage audit's `generated_at`, written as a month in the reader's language.

Both footers are one component file, `src/browse/HonestFooters.jsx`, in the existing quiet `places-credit` style, so no CSS was added.

## Files touched

Root repo, branch p10-coverage-footers.

Modified:
- pipeline/regions/coverage.py (`by_code` in `_cell`)
- Execution/_OPEN.md

Created:
- Execution/P10/T160-honest-footers.md

App repo, branch p10-coverage-footers.

Modified:
- src/browse/DestinationsTab.jsx (five listing footers)
- src/browse/TrailPage.jsx, BeachPage.jsx, LakePage.jsx, MountainPage.jsx, CyclePage.jsx, DestinationPage.jsx (detail footer)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (`cov.*` and `fig.*`, 24 keys each; all six parse)

Created:
- src/browse/HonestFooters.jsx
- src/lib/footers.js

## Commands run

```
cd wt/T160-app
npx eslint src/browse src/lib/footers.js
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
npm run build
npx vite --port 5205 --strictPort   (stopped afterwards; one Playwright script at 380 and 1280 px)
```

The sentence builder was also run in node against the real `public/coverage.json` and against a hand-made contract block (Albania with `by_code` of 19 and 12) to read the text.

## Config and secrets set

None. No migration, dependency or Gemini call.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Listings (of the five with a coverage layer) that print a coverage footer | 0 | 5 | +5 |
| Detail page components that print a figure footer | 1 (journey, T146) | 7 | +6 |
| Country cells that can state "cannot map N of M" | 0 | all, once the wire is rebuilt (T160-a) | not live yet |
| Beach listing, no country, today's wire | no sentence | "We publish 815 beaches across Europe. Of the 1,377 regions we check, 1,368 are below what we aim for." | new |
| Beach page for Durres, today's wire | no footer | "3 of 4 figures here are measured, 1 calculated, 0 estimated. Last checked September 2026." | new |

The two lines under "today's wire" were read from the running app, at 380 and 1280 px, with no horizontal scroll and no page errors. The coverage wire in the worktree is the 2026-09-04 one; it has the per region block and no contract, which is why the listing text is the fallback form.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First `by_code` edit asserted and wrote nothing | `coverage.py` has CRLF line endings and my match string had LF | Normalised to LF, edited, restored CRLF |
| Vite served nothing for about five minutes | Cold dependency optimiser on a laptop with under 1 GB free | Waited for the first request to return 200, then ran the check once |

## What is still open

The contract block and `by_code` reach the wire only after `coverage.py` runs in the data lane (T160-a, Owner `user`); until then listings show the shorter fallback. The class given to each fact is my reading of the page's own notes and needs the owner's eye (T160-b). The Trips listing and the journey page have no contract layer, and a journey shows its footer only when it has a `figures` list (T160-c). Only the beach listing and beach page were seen in a browser, because the worktree wire has no trails, so the other pages were checked by build and lint (T160-d). The footer date is the audit date, not a per-figure date, and the region page has no footer because its ids do not match the NUTS3 keys in `coverage.json` (T160-e). T111-b, the screen that prints spec 4.6's sentence, is closed by this task.

## Rollback procedure

Revert the app commit on `p10-coverage-footers` and the root commit. `by_code` is an added key on a cell, so no reader depends on it, and no data, schema or dependency changed.
