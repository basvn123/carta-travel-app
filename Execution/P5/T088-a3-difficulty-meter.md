# T088 A3 difficulty meter

## Task ID

T088 (mind-map number T084).

## Date

2026-10-02

## What changed

The journey page facts list no longer prints difficulty and the gateway airports as running text. Difficulty is now five small segments, filled up to the score, followed by "Active 3/5" in mono. The justification sentence sits behind the same small info button the month strip uses, and it opens in place. Where the note only repeated the score or the label ("1/5, Easy") the button is not shown at all.

The gateway line is now a short list, one row per airport: the three-letter code in mono, the airport name, and the transfer time in small grey type beneath. Where the text would not split into clean rows, the page shows the first airport as a row and keeps the whole original text behind the info button.

Difficulty needed no data change, the wire already carries `profile.difficulty` as a number from 1 to 5. The gateway has no structured data, only one hand-written string, so `src/lib/gateway.js` reads it in the browser. It splits on semicolons, accepts "CODE Name, transfer" and "Name (CODE), transfer", and glues any segment that starts with neither back onto the row before it. It then declares the parse incomplete if a row holds a sentence break, a second airport code, a transfer longer than 70 characters or a name longer than 40. Incomplete means the fallback above, so nothing is lost and nothing is guessed. The check runs after the loop, because continuation segments are joined onto rows during it.

The meter and the list are in `src/components/FactMeter.jsx`. They reuse the `.mstrip-info` and `.mstrip-panel` classes from T087 for the button and the opened note, so the two disclosures look and behave alike, with aria-expanded and a real button.

## Files touched

Modified, app repo (branch p5-a3-difficulty-meter):
- src/browse/JourneyPage.jsx (facts list renders the meter and the gateway rows)
- src/styles.css (.fmeter and .fgate rules)
- src/i18n/en.js, nl.js, de.js, fr.js, es.js, it.js (three keys: journey.diffMeter, journey.diffWhy, journey.gatewayMore)

Created, app repo:
- src/components/FactMeter.jsx
- src/lib/gateway.js

Created, root repo: Execution/P5/T088-a3-difficulty-meter.md. Modified: Execution/_OPEN.md.

## Commands run

```
npx eslint src/browse/JourneyPage.jsx src/components/FactMeter.jsx src/lib/gateway.js
npx vite --port 5203          (throwaway harness page mounting JourneyPage, headless playwright, 390 and 1280 wide)
node scratch parser run over all 253 journey files in the main checkout's public/journeys (read only)
```

The harness page and the dev server are removed. No wire was built, no dist was built, nothing under public/ was written.

## Config and secrets set

None.

## Before/after measurements

Measured on the 253 published trips.

| Metric | Before | After |
|---|---|---|
| Trips with a difficulty number shown as a meter | 0 | 232 (the other 21 have no difficulty at all) |
| Trips printing a difficulty note inline | 132, 12 words on average after the score is removed | 0 (behind the button; fewer than 132 get a button because notes that only repeat the label are dropped) |
| Trips with a gateway string | 223 | 223 |
| Gateway strings over 60 characters, printed as one line | 124 | 0 |
| Gateways shown as structured rows | 0 | 144 (101 with one airport, 43 with two or more) |
| Gateways shown as first airport plus info button | 0 | 79 |

No horizontal scroll at 390 or 1280 on the three trips checked, one with four airports and one whose gateway is a paragraph.

## Design decisions and what carta-design does not cover

carta-design has no rule for a segmented meter or a code-and-name list, so these calls are mine and should be reviewed. The meter is five flat segments, 18 by 8 px, 2px radius, filled with --ink-fill and empty in --rule-soft. The level is not colour coded: green and terracotta both carry meaning elsewhere (good news, alerts), and a harder trip is not a warning. The score text is mono, as the spec asks, since "3/5" is a measured fact. Airport codes are mono, names are body type, transfer times are 11.5px --ink-mute mono, matching the small print under the budget row. No shadow, no gradient.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A Sofia gateway with a long paragraph rendered as a single row with the paragraph as its transfer time | The prose segments are joined onto the row after the completeness check ran | The check now runs after all segments are joined |
| A backslash was lost in a regex when a file was patched through a shell one-liner (second time this wave) | Shell quoting | Fixed with the edit tool |

## What is still open

The gateway parse is a reader of hand-written text, 79 trips fall back to the info button. A proper fix is structured gateway data in the trip master (an array of code, name, transfer minutes) written by build_wire.py, which is a schema and pipeline task. The fallback rows also drop the transfer time of the first airport from the visible row, because the sentence it sits in is not reliably separable.

The facts list still prints two other long fields as plain text (the currency line is the obvious one). They are not part of A3.

## Rollback procedure

Revert the commit on p5-a3-difficulty-meter in the app repo and the report commit in the root repo. No data, migration or config changed.
