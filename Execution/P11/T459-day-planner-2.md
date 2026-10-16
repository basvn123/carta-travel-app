# T459: Day planner, second pass

## Task ID

T459 (P11). Follows T433 (the day planner rebuild). Branch `p11-day-planner-2` in both repos.

## Date

2026-10-16

## What changed

The owner walked T433's day planner and asked for three things: the frame finished to the trip planner's standard, Build it myself made calm and clear about where the day is spent, and every caption earning its place. The day planner now carries the trip planner's whole frame. The visible changes, step by step:

**The recap.** The picked-so-far pill ("Rome, Fri 16 Oct to Sun 18 Oct, Change") is gone. In its place is the trip planner's "Planning around" recap, which is a kit piece now (`components/ui/Recap.jsx`, the trip wizard's own markup and classes).
- Every answer is a chip that goes back to its own step: the start, the days, the ideas.
- On the Carta path, the answers to Carta's questions join the same row, so there is one recap, not two.

**The title.** Each step's title renders straight inside `.guide-canvas`, so the trip wizard's title size and spacing apply by construction. This was the cause of the uneven spacing: T433 wrapped every title in a step div, so none of the trip wizard's rhythm reached it. Every step now follows one rhythm: sections 24 px apart (space-6), and a section heading 12 px over its options in the trip wizard's heading style.

**The "Your days" rail.** From 1100 px a "Your days" card sits beside every step, the day planner's version of the trip planner's "Your trip" (`planner/DayRail.jsx`, on the `.plan-total` classes). It shows:
- one per-person day figure (the computeCosts() figure the planned day prints);
- the start, the dates and the Lifestyle;
- on Places only, the days the picks make: a line per day, the places numbered in walking order, and when the day is done. It carries no times per row and no edit controls.

Below 1100 px the same card opens from the footer as a sheet, as the trip planner's total does.

**Build it myself** now reads Where, then What.
- **Where** is a row of town chips: the start, plus up to six towns a day out. A town is offered when it is within 60 km and has at least three places; the strongest towns are taken first and listed nearest first. Each chip counts the picks made there. Choosing a town re-centres every rail on it and says how far it is ("From Ghent: about 45 min by train"). A place picked there gives that town its own day.
- **What** is the category chips, with List | Map in the main column. This replaces the second column that held a map and the preview.
- Rails show three photographs each, and places without a photo come only once a rail is opened.
- Rating chips are gone from cards, rows and the place sheet.
- A tapped pin opens the place's sheet instead of silently adding it.

**The How page.** The two cards share one photo frame and one line of cost ("Uses 1 plan" or "Sign in for 2 free plans" beside "Free"), so they end together. The 120 to 133 px gap under Build it myself is 0.

**Copy.** Captions were cut or rewritten: the catalogue count "Pick from 84 places" (PRODUCT.md bans catalogue counts), "Places around Rome", "Top sights near you", "Your days so far" and the per-row times.

## Files touched

**App, modified:**
- continent-app/src/planner/DayWizardShell.jsx (recap, title, sub, lead, rail and railSummary props; the rail sheet below 1100 px)
- continent-app/src/planner/DayPlannerTab.jsx (recap chips, rail rows and figure, titles through the shell, start pill removed, How cards)
- continent-app/src/planner/DayExploreBuilder.jsx (Where and What, area-centred rails, rails of three, no ratings, map in the column, rail card)
- continent-app/src/planner/CartaChatPlanner.jsx (one recap with the answers, title and progress through the shell, rail)
- continent-app/src/planner/DayIdeasStep.jsx (title through the shell, section heading)
- continent-app/src/planner/dayBuild.js (a town fills a day before opening the next)
- continent-app/src/components/ui/index.js (exports Recap)
- continent-app/src/styles/68-v6-dayplanner.css (T459 section; dead builder, pill and chat recap rules removed: 2,124 to 2,033 lines)
- continent-app/src/i18n/en.js, nl.js, de.js, fr.js, es.js, it.js (18 keys added, 5 updated, 13 removed; 30 German strings given their umlauts)
- continent-app/scripts/shoot-planners.mjs (rail sheet step, `--lang=` flag)
- continent-app/scripts/measure_day_planner.mjs (photos in the first screen, the How cards' gap)
- continent-app/scripts/ci/design-lint.baseline.json (shrunk to 8,499)

**App, created:**
- continent-app/src/components/ui/Recap.jsx
- continent-app/src/planner/DayRail.jsx
- continent-app/tests/dayBuild.test.mjs (3 tests; 434 to 437 in all)

**Root, created:** Execution/P11/T459-cay-planner-2.md, Execution/P11/T459-britique/before.md and after.md, Execution/P11/T459-shots/ (before, after, measure-before.json, measure-after.json, the walk logs).

**Root, modified:** Execution/_OPEN.md, and the continent-app mirror of the files above.

## Commands run

```
git -C continent-app checkout -b p11-day-planner-2 ; git checkout -b p11-day-planner-2
node scripts/measure_day_planner.mjs --url=http://localhost:4260/ --label=before --shots=../Execution/P11/T459-shots/before
python <scratchpad>/add_keys.py keys_t459.py src/i18n      (and keys_t459b, keys_t459c)
node scripts/ci/design-lint.mjs --update-baseline
npm test ; node scripts/ai/test_plan_logic.mjs ; node scripts/ci/banned-terms.mjs ; node scripts/ci/token-contrast.mjs ; npx vite build
node scripts/shoot-planners.mjs --only=day --url=http://localhost:4260/
node scripts/shoot-planners.mjs --only=day --lang=de --url=http://localhost:4260/
node scripts/measure_day_planner.mjs --url=http://localhost:4260/ --label=after --shots=../Execution/P11/T459-shots/after
impeccable detect --json <the changed JSX and CSS>
```

The Ghent walk was a throwaway Playwright script, run from the scratchpad: start at a hotel in Ghent, 2 days, Build it myself, two places in Ghent, Where = Bruges, two places there, then open the days.

## Config and secrets set

None.

## Before/after measurements

Measured by `measure_day_planner.mjs` on the same walk (a hotel in Rome, the first date, Build it myself, three places, open the day) at 390x844 (phone), 820x1180 (iPad), 1024x1366 (iPad landscape) and 1440x900 (desktop).

| Metric | Before | After | Delta |
|---|---|---|---|
| How page, empty space difference between the two cards (px): phone, iPad, iPad landscape, desktop | 0, 120, 120, 133 | 0, 0, 0, 0 | gap closed |
| How page, day figure in the first screen | no (all four) | yes (all four) | the rail or footer carries it |
| Builder, photos in the first screen: phone, iPad, iPad landscape, desktop | 4, 4, 5, 6 | 3, 6, 6, 3 | phone and desktop down; iPad up (see below) |
| Builder, photo cards a rail shows before "Show more" | 6 photos plus 4 rows | 3 photos | -7 |
| Builder rails (most at once) | 9 | 8 (Towns nearby became the Where row) | -1 |
| Rating chips rendered in the builder | 3 sites (card, row, sheet) | 0 | -3 |
| Builder, words in the first screen: phone, iPad, iPad landscape, desktop | 115, 103, 103, 89 | 79, 117, 139, 123 | phone -36; wider screens up (see below) |
| Builder, map share of the desktop first screen | 9% (a second column) | 0% (a List or Map view) | as the trip planner |
| Taps from the landing to a planned day | 10 | 10 | 0 |
| Tap targets under 44 px, every screen, phone and iPad | phone 2 (How), iPad 2 to 4 | the same 2 (calendar arrows, T432-f) | 0 new |
| shoot-planners offenders, day walk, English and German | not run in German | 0 of 26 screens each | |
| design-lint violations | 8,527 | 8,499 | -28 |
| 68-v6-dayplanner.css lines | 2,124 | 2,033 | -91 |

Two numbers went up, and both are deliberate.
- **iPad photos.** The rails were a sideways strip of 62% cards at 820 and 1024 px. They are now a row of three at 640 px and up, so a first screen shows two themes of three photos instead of one and a half cards.
- **Builder words on wider screens.** The rise is the Where row (up to seven town names) and the rail card (the figure, the start, the dates and the picked places), which T433 kept off screen or in a sheet. The phone, where the owner's complaint was sharpest, is down by a third.

The impeccable critique (dual-agent, `T459-britique/`) scored the flow on the same ten heuristics: **27/40 before, 29/40 after**. No heuristic went down. Consistency went from 2 to 3, and so did aesthetic and minimalist design. The after critique raised one P1 and five P2s, and one fix batch followed (recorded at the end of `after.md`). The impeccable detector returned `[]` on every changed file before and after.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The day steps' titles were smaller and spaced differently from the trip planner's | T433 put each h1 inside `.dayw-step`, and the trip wizard's rules target `.guide-canvas > .guide-title`; `.day-wizard .guide-title { margin: 0 }` also flattened it | Title rendered by the shell straight in the canvas; the override removed |
| "Where" offered Ghent and Aalst but not Bruges | A 30 km reach and nearest-first choice | 60 km (the builder's own POI horizon), strongest first among towns with at least 3 places, listed nearest first |
| The builder map framed half a country (before critique) | Rows with no distance passed the 15 km filter | Markers kept within 25 km of the chosen area's centre |
| "Getting around" stretched the full width | The alignment rule named `.ui-segmented`; the kit's class is `.seg` | Selector corrected |
| The old builder rules styled the kit's Segmented and IconButton | `.dayex-view button` and `.dayex-search-btn` from the D6 builder outranked the kit | Those rules removed with the rest of the dead builder CSS |
| Recap chips were 32 px tall on an iPad | The trip wizard's chips are 32 px from 769 px, 44 px only on a phone | 44 px on any coarse pointer inside the day wizard |
| German "Route" link measured 43 px wide | Short word, no minimum width | `min-width: var(--tap)` |
| A selector-list prune script misread one block | Its prelude scan | Restored from the copy taken first; the dead rules removed block by block, brace balance checked |
| Two files' CRLF endings rewritten as LF | Python rewrite with `newline='\n'` | CRLF restored; the diff carries only real changes |
| The after critique: two picks in one town over two days landed one a day, and a pick in another town moved them | `buildDays` spread every town's picks over all its days | A town fills a day (about five hours of visits) before opening another; three tests in tests/dayBuild.test.mjs |
| The after critique: the German phone footer label ran under Back | The summary had no way to shrink | It shrinks with an ellipsis |
| The after critique: the phone recap wrapped to three rows (about 140 px) | 44 px chips wrapping | One sideways-scrolling line on a phone |
| The after critique: the rail card ran under the desktop footer | Its max-height left out the footer | The footer and two steps of space taken off |
| The after critique: German mixed "ue" and "ü" | Older strings written without umlauts | 30 strings in the day planner block corrected |
| 3 console errors on one desktop screen in the first walk | React mounted twice during a dev-server reload while strings were being edited | Re-run on the finished code: 0 |

## What is still open

Each item is one row in `Execution/_OPEN.md`.

**The trip planner's side (T459-a, next task).** The kit `Recap` has no trip wizard consumer yet; GuidedTripWizard still writes the recap markup twice. The same goes for the section heading (`.wiz-q-h`, the values of `.wlife-h`) and the phone recap's one scrolling line. Moving the trip wizard onto them makes the two planners one object. On a phone the trip planner's recap still wraps where the day planner's scrolls.

**The phone builder's first screen (T459-b, next task).** At 390x844 the first place's photo shows but its name sits under the fold. The heading and the Where and What rows come first. The critique's suggestion is to put search and List | Map on the category chip row on a phone and drop the What heading there.

**Two clocks (T433-h, still open).** The rail and the cards time a day by straight lines ("Back about 14:45", "1 min walk"). The planned day times it on routed footpaths, and the critique saw 0.3 km against 0.5 km. The rail says "about"; one clock for both is still the fix.

**Owner calls.**
- Native review of the 18 new and 5 changed strings in five languages, and of the 30 German umlaut repairs (T459-c).
- A real-phone pass of Where, What, the rail sheet and the one-line recap (T459-d).
- The builder map shows the same place twice under two names ("Baths of Diocletian" and "Terme di Diocleziano"). That is catalogue data, along with the far-away recommendations and the photos the owner said they will fix (T459-f).

**German outside the day planner (T459-e, next task).** Strings elsewhere in de.js may still be written without umlauts. This task corrected only the day planner's block, because a blind ae/oe/ue swap breaks real words ("neue", "Steuer").

**Not done from the plan.**
- The critique's P3s stay as written in `after.md`: the stepper renaming step 5, the dates shown three times on desktop Days, no fade on the clipped Where row, and the empty half of the Days card.
- impeccable's `generate` and `live` variant modes need the owner in the browser, so variants were judged on screenshots.
- `measure_day_planner.mjs --only=` overwrites `measure-after.json` with one viewport; the full run was repeated last.

**Closed:** none. T433-h stays open as above.

## Carta-design: the seven questions

1. No hex outside the tokens: design-lint reports 0 new (8,527 to 8,499), and token-contrast reports 0 pairs under the floor.
2. No new colour or gradient. Brown is used only for actions, the selected chips and the Lifestyle link in the rail, as in PlanTotal.
3. Selected states are the tint plus a mark: the Where and What chips, the picked cards' tick, the recap's link chips.
4. No figure is under 12 px. The rail's day numbers and the chip counts use tabular numerals, and the day figure goes through `<Money>`.
5. One primary per view (Next, or Open my days). "Let Carta plan the rest" is secondary and sits in the rail card. No text sits on a photograph, and the How mosaic lost its captions.
6. Titles are questions or verbs ("Which days?", "Pick what to see"). There are no dashes, middots or banned words (banned-terms passes), and the catalogue count is gone.
7. Removed one thing more: the builder's second column, the per-row times and × controls in the preview, and the separate tray sheet all became the one rail card.

## Rollback procedure

App repo: `git -C continent-app revert -m 1 05c36df` (the T459 merge on master; the task commit is 893afb5, its parent ebe678d). Root repo: `git revert -m 1 <the T459 merge on main>`, then `git push origin main`.

Nothing in data, schema or storage changed:
- No migration.
- Saved day plans and the picks state keep their shape (`selPois`, `newStops`).
- The Where row is view state only.
