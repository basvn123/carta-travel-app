# T094: J6, J7, J8, bold, coverage honesty and the age of the numbers

## Task ID

T094 (mind-map number T090).

## Date

2026-10-02

## What changed

Three changes that make the trips catalogue say what it is.

J6, bold. The trip source prose carries markdown-style bold markers, and the Prose component honours them. They were applied by habit, not by rule: 241 of 253 trips had some, 8,242 spans in all, up to 23 in one paragraph, mostly on place names. The wire builder now applies one rule to every string: only a span that carries a figure (a height, a distance, a price, a time) stays bold, and at most two per string, the first two. Every other span loses its markers and keeps its words. The function is normalise_bold in pipeline/journeys/build_wire.py, called from clean_text, so it runs on every field in the same pass that strips dashes and VERIFY markers. The source master data is untouched. I chose "drop except operative figures" over "drop everything" because a number in a long itinerary paragraph is the thing a traveller scans for, and the design system's position is that structure, not weight, carries the rest.

J7, coverage. The Trips front page now ends with one plain line built from the index file alone: how many trips, in how many countries, across how many styles, and how many countries have fewer than half of the styles. On the current wire it reads "253 trips in 39 countries, across 10 styles. Coverage is uneven: 19 of the 39 countries have fewer than half of the styles, so a country filter can come back with nothing." When a country filter is set, the line changes to that country's own count, for example Albania has trips in 3 of 10 styles. The figures come from coverageFacts in src/lib/journeys.js, computed live, so they cannot drift from the data. The line reuses the existing places-credit style (11px, muted ink), so it adds no new token.

J8, age of the numbers. The "About this plan" footer of every trip now reads "Planning figures for 2026, last checked September 2026. Every price is indicative." The month comes from provenance.ingestedAt, formatted in the reader's language by lastCheckedMonth in src/lib/journeys.js. If a trip has no usable date, the footer falls back to the old line with the year only. Three new keys exist in all six languages: journey.vintageChecked, journey.coverage and journey.coverageCountry. The old journey.vintage key stays as the fallback.

I read this work against the T085, T087, T088 and T092 reports and kept their work. Those branches are not in my base, so I made no edit to a region they changed: my build_wire.py change sits after clean_text and beside one line of it, and my journeys.js change is appended at the end of the file.

## Files touched

Modified, root repo (branch p5-j6-j8-presentation-honesty):
- pipeline/journeys/build_wire.py
- Execution/_OPEN.md

Created, root repo:
- Execution/P5/T094-j6-j7-j8-presentation-honesty.md

Modified, app repo (same branch name):
- src/lib/journeys.js (lastCheckedMonth, coverageFacts)
- src/browse/JourneyPage.jsx (footer line)
- src/browse/JourneysSection.jsx (coverage line)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (three keys each)

## Commands run

```
python pipeline/journeys/build_wire.py --no-fetch --out <scratch>/before   (with the change stashed)
python pipeline/journeys/build_wire.py --no-fetch --out <scratch>/after
python <scratch>/m.py <scratch>                                            (counts bold spans per wire)
npx eslint src/browse/JourneyPage.jsx src/browse/JourneysSection.jsx src/lib/journeys.js
node --input-type=module (import each i18n file and count the three keys)
npx vite --port 5201 --strictPort                                          (screenshots at 380 and 1280 wide)
```

Both wires went to a scratch folder; continent-app/public/journeys was never written. Each build rewrote cache/journey_images.json, which I restored with git checkout so it is not in the commit.

## Config and secrets set

None.

## Before/after measurements

Measured on wires built from the same master data, offline.

| Metric | Before | After | Delta |
|---|---|---|---|
| Trips with any bold | 241 | 166 | -75 |
| Bold spans in the catalogue | 8,242 | 1,249 | -6,993 |
| Most bold spans in one string | 23 | 2 | -21 |
| Trips with a last-checked month on the page | 0 | 253 | +253 |
| Coverage statement on the Trips index | none | 1 line | |

The 87 trips with no bold left are trips whose bold never carried a figure; the rule is the same for all of them. The last-checked count is 253 because provenance.ingestedAt is present on every trip and is 2026-09 on all of them.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| fr.js failed to parse, Vite's dependency scan aborted | The French coverageCountry string has an apostrophe in "n'y" and my insert did not escape it | Escaped it; all six i18n files now import and carry the three keys |
| First screenshot showed the planner, not the Trips index | ?tab=trip is the planner; the Trips category is the default of the Destinations tab | Shot the root URL instead |
| Dev server took about 80 seconds on first request | A cold Vite start on a worktree with a large public folder | Waited; not a code issue |

## What is still open

The tracked wire in continent-app/public/journeys still holds the old bold, because this task may not write public output. The same wire rebuild that T085-a and T087-a already ask for will ship the rule (T094-a). The last-checked month is the date a trip entered the catalogue, which for all 253 is September 2026, not a re-verification date; a real per-trip reviewed date belongs with the trip schema work (T094-b). J7 also asks that an empty country and style pair offer three nearby trips; the empty state still shows the plain sentence (T094-c). Each is a row in Execution/_OPEN.md.

## Rollback procedure

Revert the commits on p5-j6-j8-presentation-honesty in both repos, root and app. The bold rule only acts at build time, so a revert plus the next wire rebuild restores the old bold; the already tracked wire is unchanged by this task. No data was written and no migration exists.
