# T165: Sticky section rail

## Task ID

T165

## Date

2026-10-07

## What changed

The journey page (the curated week plans under Trips) now has a thin strip that appears once the hero photo has scrolled away and stays stuck under the page's top bar. It lists the six sections a reader jumps between: Why, Costs, Days, Sleep, Know, Pack. Tapping one opens that fold if it is closed and scrolls it to just below the strip. The section in view wears the ink-fill pill. The strip is a new component, browse/SectionRail.jsx, that knows nothing about the folds' inner markup: it is given a list of section ids, the page's scroller and the hero element, and it asks the DOM which of those ids exist. A trip with no itinerary or no tips simply loses that stop, and under three stops the rail does not render. It takes no height in the page flow (a negative bottom margin cancels its 44 px), so it appearing or disappearing never moves the content under the reader's thumb. The hero counts as gone until 44 px of it would show below the rail, so jumping to Why, the first section, does not flip the rail off.

The destination page already carries a section rail from an earlier task (.destp-subnav, one button per fold, with Expand all). I checked it and it does stick, jump and open, so I left it alone. It is not built to the new carta-design rule (buttons with bordered pills, not anchors with an ink-fill pill), which is raised as a register row rather than restyled here, because that file is outside this task's scope. The trip page (TripPage.jsx, route trips with sec-route, sec-days and so on) has different sections and is also left for a follow-up row.

Carta-design questions. 1: no hex outside :root, the new CSS uses tokens only. 2: no gradient, no new colour, the only saturated hue used is the accent focus ring. 3: ochre, teal and danger are not used. 4: the labels are prose words in the UI face, no mono. 5: the rail adds no button, so no second primary. 6: the labels are single nouns (rail labels, not headlines, per the rule) and the diff has no em dashes, middots or banned words. 7: I removed a legend-style Expand all from the new rail and any count badge; the rail is only the six links.

## Files touched

**Modified:**
- continent-app/src/browse/JourneyPage.jsx
- continent-app/src/styles.css (one @import at the end)
- continent-app/src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (seven keys each: journey.railAria, railWhy, railCosts, railDays, railSleep, railKnow, railPack)

**Created:**
- continent-app/src/browse/SectionRail.jsx
- continent-app/src/styles/34-section-rail.css
- Execution/P10/T165-sticky-section-rail.md

**Deleted:** none.

## Commands run

Dev server on 5204 only (stopped afterwards), a throwaway Playwright script at 380 and 1280 px wide, then in the app worktree: npm run lint, npm test, node scripts/ci/design-lint.mjs, npm run build, then rm -rf dist dist-data. All six i18n files were parsed with the rule 8 loop. Screenshots are in C:\Users\Gebruiker\Documents\Portfolio\wt\T165-shots\.

## Config and secrets set

None. The Supabase variables were unset in every shell.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Sections reachable in one tap from anywhere on a journey page | 0 | 6 | +6 |
| Page errors, 380 and 1280 px | not measured | 0 | n/a |
| Horizontal overflow (scrollWidth minus clientWidth), both widths | not measured | 0 | n/a |
| Lint errors, tests failing, new design-lint violations | 0, 0, 0 | 0 errors (72 existing warnings), 212 of 212 pass, 196 of 196 baseline | none |

Checked in the headless run at both widths: the rail is hidden at the top of the page, is stuck at y=52 (under the 52 px bar) after scrolling and at the very bottom of the page, and jumps to Sleep, Pack, Why and Know each opened the fold (Sleep was closed first) and made that stop active. After the Sleep jump the fold's heading sat at y=97, the 44 px below the rail. The same run opened the destination page (#dest=gem:valbona) and found its existing rail stuck after scrolling and a jump opening a fold, with no horizontal scroll.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First build of the rail was only as wide as the content column | I placed it inside .bpage-wrap, which has side padding | Moved it to be the first child of the scroller, so it spans the full width |
| Jumping to Why hid the rail | The hero reappeared behind the 44 px scroll margin and the observer saw it as visible | Observer rootMargin of -44px, so the hero counts as gone until it would show below the rail |
| A smooth jump was measured before it finished | Test waited too short | Verified under reduced motion (a jump); the code uses scrollBehavior() so reduced motion is respected |
| The whole of JourneyPage.jsx showed as changed | The file is committed with CRLF and my script wrote LF | Restored CRLF; the commit now shows 27 changed lines |

## What is still open

The trip page (TripPage.jsx) has no rail yet; its sections are route, practical, days, outs, cost, why, checks, gallery. The destination page's existing rail does not follow the new carta-design rule (anchors, ink-fill active pill, no sticky active state, an Expand all control that is not part of the rule). Both are rows in the register. The labels Why, Costs, Days, Sleep, Know and Pack are my translations for de, es, fr, it, nl and have not been read by a native speaker. T162 and T167 change what is inside Day by day and the advisory sections; the rail only needs their section ids to stay.

## Rollback procedure

Revert the app commit on branch p10-c9-sticky-rail (git revert, or drop the branch before merging). Nothing outside the app changed, no migration, no data.
