# T164: Collapse every long section, with a one-line preview

## Task ID

T164 (mind-map number T168)

## Date

2026-10-03

## What changed

The journey page already folded Good to know as a whole section, closed by default, but opening it printed every logistics slot as a full paragraph. A median trip put 275 words in that one block and the longest put 679. Each slot is now its own closed row inside the section: an icon, the label, and a six-word preview of the text, with a chevron. Tapping a row opens only that row. The icons are existing ones from Icons.jsx (train, ticket, plug, piggy bank, clock, shield, cloud, heart, alert); rows from the free-form other list use the info mark.

The preview is the first sentence of the text, cut to six words, with markers and trailing punctuation removed. If the cut lands on a joining word such as "and", "the" or "are" the word is dropped, so a row never ends mid-clause. The logic is the small previewWords function in JourneyPage.jsx.

The page rule is that nothing over 60 words shows without a tap. I checked every block that is visible by default (the facts, budget, itinerary and sleep folds open on arrival). The only offenders in the data were accommodation descriptions, 32 of 747 across the 253 trips. A new LongProse component in the same file shows a 14-word preview and a "Read the rest" control when a description is over 60 words, and "Show less" to fold it again. Budget notes, day titles and day sleep lines are all under 60 words in every trip. The four gateway airport strings over 60 words already sit behind the gateway row's info button, so they were left alone.

## Files touched

Modified, in the app repo on branch p10-c4-collapse-sections (commits c692411 and the follow-up named in the rollback section):
- src/browse/JourneyPage.jsx
- src/styles/25-feature-pages.css (the .jpage-lrow rules, tokens only, 44px touch height, reduced-motion respected)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (journey.readMore, journey.showLess; CRLF kept, all six parse)

Created: none. Deleted: none. The root repo carries only this report and the register rows.

## Commands run

Measured the wire with a throwaway Node script over public/journeys/journey/*.json, counting words per logistics slot, per stay description, per budget note and per day. Ran Vite on port 5206 and drove the journey page with a headless Playwright script at 390 by 844 (since deleted). Ran npx eslint on the file (clean) and npm run lint (0 errors, 72 warnings, all pre-existing).

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Words visible when Good to know is opened, median trip | 275 | about 60 (nine previews) | about -215 |
| Words visible when Good to know is opened, longest trip | 679 | about 60 | about -619 |
| Trips whose open Good to know block exceeds 60 words in one go | 253 of 253 | 0 | -253 |
| Stay descriptions over 60 words visible on arrival | 32 of 747 | 0 | -32 |

Of 1,972 logistics rows across all trips, 214 are over 60 words themselves. They are now behind a tap, which is what the rule asks.

In the browser check on the Wachau cycling trip, opening the section showed nine closed rows and no bodies, 60 words of text in the whole section, and one body after one tap. No visible paragraph, list item or definition on the page exceeded 60 words in that state.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First previews ended on "and honesty", "take", "are" | Plain first-six-words cut | Drop trailing joining words, never below two words |
| The first edit rewrote every line ending, a 5,800-line diff | My script wrote LF into files the index stores as CRLF | Converted JourneyPage.jsx and en.js back to CRLF; the diff is now 128 lines |

## Design check

The rows were checked against the carta-design skill and the follow-up commit fixed three things: the row icon is now 20px in --ink-soft (it was 14px in --ink-mute), the row height and gaps use --tap and the --space tokens instead of literals, and the toggle has a 2px --accent focus-visible ring. The preview stays in --ink-mute at 12.5px, which the skill allows for metadata. Labels are sentence case with no end punctuation and the new strings contain no em dashes or banned words. The chevron turn is 0.18s on transform with a reduced-motion branch.

The seven questions. One: no hex values were added. Two: no gradient and no new colour. Three: ochre, teal and danger are not used. Four: the previews are prose in the UI face, no mono was added. Five: the change adds no button that is a primary. Six: no headline was added or changed, and the diff has no em dashes or banned words. Seven: removing one thing, the divider between the label and the preview that the shared Fold draws was not copied, since the label weight already separates them.

Build: npm run build passed in the app worktree and dist/ was deleted afterwards (dist-data/ was never created). npm run lint reports 0 errors.

## What is still open

The five non-English strings pairs are my own short translations and have not had a native review. Other page types (destination page, trail page) were not audited for blocks over 60 words, because the task named the journey page. The check was run by hand on one trip, so the 60-word rule has no scripted guard yet. T164-a (translations) is closed by this task; T164-b and T164-c stay open.

## Rollback procedure

Revert commits 20a7d3b and c692411 on the app branch (git revert 20a7d3b c692411), or reset the branch p10-c4-collapse-sections before merge. No data, schema or migration changes were made, so nothing else needs undoing.
