# T172: Cost breakdown as one stacked bar

## Task ID

T172 (mind-map number T176).

## Date

2026-10-07

## What changed

The budget fold on the journey page (section id sec-budget) now opens with one stacked bar above the receipt. It has one segment per receipt line, in receipt order, sized by the middle of each line's low and high euro figures. Tapping a segment shows its name, its figure and its note in a line under the bar, and tapping it again clears the line. The receipt lines, total and rail alternative are untouched, which follows the owner decision of 2026-10-07 (block A of the runbook): the receipt stays the signature and the bar is only a summary. The bar follows "The cost bar" in the carta-design skill: 8 px high, ink ramp (--kind-metro to --kind-village), 1 px --paper gaps, no accent, no legend, no percentages. Each segment is a real button with a 44 px tall hit area around the 8 px fill, with aria-pressed and an aria-label of name plus figure. The bar does not repeat the estimate marker; the receipt keeps it.

## Files touched

Modified (app repo, branch p10-e1-stacked-bar):
- src/browse/JourneyPage.jsx
- src/styles.css (one import line at the end)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (journey.barLabel, journey.barHint)

Created:
- src/browse/CostBar.jsx
- src/styles/36-cost-bar.css

Root repo: this report only.

## Commands run

npm run lint, npm test, node scripts/ci/design-lint.mjs, the six-catalogue parse from session rule 8, npm run build (then dist/ and dist-data/ deleted), and a Playwright run against vite preview on port 5206. The Vite dev server hung in dependency optimising because node_modules is shared with other sessions, so the headless check used the built dist instead.

## Config and secrets set

None.

## Before/after measurements

Not measured. The task promises no number. Checked in a browser: four segments render at 380 px and 1280 px, the track is 322 px and 658 px wide, tapping the second segment shows "Food" and "€250 to €350", no page errors, no horizontal scroll. Screenshots are in wt\T172-shots\bar-380.png and bar-1280.png. Lint: 0 errors (72 existing warnings). Tests: 212 pass, 0 fail. design-lint: 196 violations, 196 in the baseline, 0 new.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| fr.js failed to parse | Quote escaping in my insert of "Où va l'argent" | Used a double-quoted string |
| Vite dev server never finished starting | Shared node_modules optimiser cache with other sessions | Verified on the built dist with vite preview |

## What is still open

None. The seven carta-design questions: no hex outside the tokens; no gradient, no new colour, no second saturated hue; ochre, teal and danger unused; figures in the readout are mono, labels are sans; no primary button added; the strings have no verb-free headline problem ("Where the money goes" is a label, the hint is "Tap a segment for its figure.") and carry no em dashes or banned words; the thing removed was the legend and percentages the spec could have invited.

## Rollback procedure

Revert the app commit on branch p10-e1-stacked-bar (git revert), or drop the CostBar element in JourneyPage.jsx; the receipt is unchanged underneath. No data or schema change.
