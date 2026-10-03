# T171: M7 + M8 + M10, one sentence, three ways out, and the human evidence

## Task ID

T171 (mind-map number T175). Branch p10-m7-m8-m10 in both repos.

## Date

2026-10-03

## What changed

Every journey page now opens with one sentence under its title, ends with three computed exits, and closes with a footer that carries a detail from the route.

The hook sentence comes from `hookLine()` in `src/lib/journeys.js`. The wire's `hook` field is a paragraph, not a sentence, so the function splits the authored hook, then the summary, into sentences and takes the first one of 40 to 190 characters that carries a number (a digit or a number word). If none does, it takes the first sentence, clipped at a clause. The page shows it outside any fold, and the "Why this trip" fold shows the rest of the same text, so nothing is said twice. Thirty trips have a generated summary that is only filler ("A seven-day city trip itinerary in ..."). For those the line is built from the days: number of days, place, first and last stop, through the new `journey.hookBuilt` string in all six languages.

The exits come from `journeyExits()`. The page loads the ten per-style card files once (262 KB in all, cached) and ranks them. "If this is too hard" is a trip one step gentler, preferring the same country and style and a similar price. "If you want this for less" is a trip at least 15 percent cheaper, preferring the same country and style and the closest difficulty. The third is another style in the same country, closest in price. The gentlest and the cheapest trips have no easier or cheaper sibling, so an empty slot is filled with another trip from the same country. Nothing is hand-picked. A click opens the other journey in place through a new `onOpenJourney` prop wired in `DestinationsTab.jsx`; the page already reloads and scrolls to the top when its id changes.

For the footer, the last-checked month and the sourced, derived and estimated count already existed from T146 (they show only for trips with a figures ledger, none of the 253 published ones). What was missing was the human detail. `humanDetail()` picks the first pro tip that carries a figure, else the first tip, at most two sentences, and the footer prints it under "A detail from the route". All 253 trips have pro tips. The footer's "Written by the Carta content lab" line stays, since the credit string is shared with the library footer.

Styles are hairline rows with tokens only, no cards, no new colour. Six languages gained six keys each and all parse.

## Files touched

continent-app: src/lib/journeys.js, src/browse/JourneyPage.jsx, src/browse/DestinationsTab.jsx (one prop), src/styles/25-feature-pages.css, src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js.
Root: Execution/P10/T171-hook-exits-evidence.md, Execution/_OPEN.md.

## Commands run

A browser check at 380 and 1280 pixels on a built preview. Node check of hookLine, humanDetail and journeyExits against the wire in continent-app/public/journeys; eslint on the two changed files; parse of the six i18n files; npm run build; dist and dist-data deleted afterwards.

## Config and secrets set

None.

## Before/after measurements

Run over all 253 published trips, from the real wire files.

| Metric | Before | After |
|---|---|---|
| Trips with a one-line hook above the fold | 0 (153 had a paragraph hook inside a fold) | 253 (223 from prose, 30 built from the days) |
| Hook lines over 190 characters | not applicable | 0 |
| Hook lines containing a digit | not measured | 81 |
| Trips with three exits | 0 | 253 |
| Trips with an easier exit / a cheaper exit | 0 / 0 | 183 / 251 |
| Trips with a human detail in the footer | 0 | 253 |

Three exits per trip comes after the fill rule; the ranking alone gave 178 trips three and 75 trips two.

## What broke and how it was fixed

The first hook run covered only 223 trips, because 30 have generated filler summaries; the built line fixed that. The French and Italian strings with an apostrophe broke the parse on the first write, because the escape was lost in the script; I rewrote them with an explicit backslash and re-parsed.

## What is still open

A browser check on the production build (the dev server crashed the page, so I used a build and vite preview) opened the first cycling trip at 380 and 1280 pixels wide: the hook, three exits and the detail rendered, there was no horizontal scroll, and clicking an exit opened the other trip. Other trips were not opened by hand; the 253-trip figures above come from the Node run. Only 81 of 253 hook lines contain a digit, because many authored hooks open with a claim; a data pass that rewrites hooks as number-led sentences would do more than the selector can. The exits rank on price and difficulty and country only; the wire cards carry no region key, so a region-level match is not possible without a pipeline change. The human detail is a pro tip, which is advice rather than proof; a field written for the purpose would be better.

## Rollback procedure

Revert the commit on p10-m7-m8-m10 in continent-app. No data, schema or migration changed.
