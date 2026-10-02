# T087 A2 month strip

## Task ID

T087 (mind-map number T083).

## Date

2026-10-02

## What changed

The "Best months" row on the journey page is now a strip of twelve cells, January to December, instead of a list of month names with a long sentence under it. Good months are filled and green, avoid months are grey with a hairline strike, the rest are plain. The prose that used to sit under the facts list (the 30-word note) and the avoid sentence now open from a small info button at the end of the strip, so the strip reads at a glance and the reasoning is one tap away.

The strip is a shared component, `src/components/MonthStrip.jsx`. It takes plain month numbers (`good`, `avoid`) and an optional `info` node, and knows nothing about trips, so beaches, lakes and mountains in P7 can drop it in. Initials come from `Intl.DateTimeFormat` in the reader's language; each cell carries the full month name and its state as an aria-label, and the info button is a real button with aria-expanded.

The avoid months did not exist as data. `bestPeriod.avoid` is free text ("July-August (35 C on unshaded asphalt)"), so `build_wire.py` now reads the month names out of it with `parse_avoid_months` and writes `bestPeriod.avoidMonths` into each journey detail file. It handles ranges that wrap the year end (November-March), fuzzy ends ("mid-July to late August", "December-7 January") and several periods in one sentence. Only capitalised month words count, so the verb "may" is ignored. It runs after the dash stripper, so it reads the hyphenated form the wire actually carries.

## Files touched

Modified, root repo (branch p5-a2-month-strip):
- pipeline/journeys/build_wire.py

Modified, app repo (branch p5-a2-month-strip):
- src/browse/JourneyPage.jsx (facts list renders the strip for the best-months row; the separate note paragraph is gone)
- src/styles.css (strip styles)
- src/i18n/en.js, nl.js, de.js, fr.js, es.js, it.js (four monthStrip.* keys)

Created:
- src/components/MonthStrip.jsx
- Execution/P5/T087-a2-month-strip.md

Modified: Execution/_OPEN.md

## Commands run

```
python pipeline/journeys/build_wire.py --no-fetch --out <scratch>/wire
npx eslint src/components/MonthStrip.jsx src/browse/JourneyPage.jsx
npx vite --port 5202          (headless playwright against the scratch wire, phone 390 and desktop 1280)
```

The wire went to a scratch folder, never to continent-app/public/journeys. The build rewrote cache/journey_images.json as a side effect and I restored it. The throwaway verify script and the dev server are gone; no dist was built.

## Config and secrets set

None.

## Before/after measurements

Measured on the 253 trips in trips.master.json.

| Metric | Before | After | Delta |
|---|---|---|---|
| Trips whose best months render as a strip | 0 | 253 (every trip has months; the validator already errors on none) | +253 |
| Trips with an avoid sentence | 123 | 123 | 0 |
| Of those, avoid months parsed to numbers | 0 | 123 | +123 |
| Trips where avoid and good months overlap | not applicable | 31 | |
| Prose lines visible under the months row | up to 2 | 0 (behind the info button) | |

The strip was checked in a browser on a trip with seven avoid months: twelve cells, five good, seven struck, the panel hidden until the button is pressed, no horizontal scroll at 390 or 1280. Trips with no avoid text show good and plain cells only, which is correct.

## Design decisions and what carta-design does not cover

The spec names --signal-wash, --signal and --ink-45. Those are the retired blue palette; DESIGN.md and the skill banner say the shipped palette is the one in styles.css, and DESIGN.md wins. carta-design has no rule for a twelve-cell month strip, so these calls are mine and should be reviewed. Good months use --green text on a fill made with `color-mix(in srgb, var(--green) 16%, var(--bg-card))`, because DESIGN.md has no green ground token ("good news in data" is the described use of --green). Avoid months use --ink-mute with a 1px line-through, neutral months use --ink-soft. Cells are 4px radius, below the 6px control radius, because they are small. Initials are set in mono, as the spec asks, although a month initial is arguably a label rather than a measured fact under the mono rule. No shadow, no gradient, no flag colour.

When a month is both good and in the avoid text, good wins. The avoid text is often about part of a month ("late July") and the curated months list is the stronger statement. This affects 31 trips.

## What broke and how it was fixed

My first version of the month regex lost its word boundaries when the file was written through a shell heredoc (the backslash-b became a backspace character), so nothing parsed. I fixed it with the edit tool and then tested the parser on eleven phrases drawn from the real data.

## What is still open

The published wire under continent-app/public/journeys is tracked and still the old output, with no `avoidMonths`. Until someone runs build_wire.py on the main checkout (with the image cache so heroes are kept) and commits the result, the live strip shows good months and plain months but never strikes an avoid month. This is the same pending rebuild T085 raised. The `.bpage-note` CSS rule is still used by the beach, lake and mountain pages, so I left it. P7 should adopt MonthStrip on those pages. Partial-month avoid text ("late July") strikes the whole month; a half-month cell would need a schema change and I did not make one.

## Rollback procedure

Revert the commit in each repo on p5-a2-month-strip. No data, migration or config was changed.
