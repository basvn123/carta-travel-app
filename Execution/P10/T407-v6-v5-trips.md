# T407: design wave V5, Trips (harden, adapt and polish)

## Task ID

T407 (design wave V5, surface key 'trips'; plan in `docs/design-v6/plans/V5-trips.md`).

## Date

2026-10-09

## What changed

The journey page now holds up on a small phone in a long language, can be printed as a plan, and no longer leaves a stale history step. The page bar gives its title room: the back label wraps to two lines and takes at most 46 percent, the title takes the rest on up to two lines (it read "And..." in German before). On a phone the bed chips under the week shape are listed one under another with the night and the place in full ("Nacht 2: Refugi del Comapedrosa, 2,260 m"); they were one column wide and read "La...", "R...". The day card's disclosure is named "More about day 3" instead of seven buttons all called "More about this day", and the visible "More about this day" is now translated (the German page showed it in English). Leaving through "See day prices in <town>" first goes back through the entry the page pushed, then runs the exit (row T387-g). Printing opens every fold and every day's prose, drops the bar, rail, arrows, length control, Lifestyle input, exits and Report link, and stacks the days: the hut circuit prints as 10 A4 pages with no empty page.

Design decisions taken unattended under the owner's instruction of 2026-10-07, each inside Carta's palette and type: the bed list reuses the text the chip already gave a screen reader rather than adding a string; the print block adds no colour. Most of the brief's V5 list had already landed in V3 and V4 (tap targets, the hook paragraph, group h2, Escape and back with focus return); the audit confirmed them and this wave pinned them in the harness.

Impeccable: context loaded once (as in V3 and V4 it resolved the root to the app worktree and found no PRODUCT.md or DESIGN.md; both were read directly, init not run). The audit and critique ran as a Playwright walk plus the detector and design lint; plan committed before the first app edit. Questions skipped (unattended run).

## Files touched

App repo (continent-app, branch p10-v6-polish-trips), all owned by 'trips': src/browse/JourneyPage.jsx, src/browse/WeekPlan.jsx, src/styles/66-v6-trips.css (a T407 section), scripts/verify_journeys.mjs, and the six src/i18n catalogues (journey.moreAboutDayN in all six; journey.moreAboutDay translated in de, es, fr, it, nl).

Root repo (branch p10-v6-polish-trips): docs/design-v6/plans/V5-trips.md, this report, Execution/_OPEN.md (T387-g closed, rows T407-a to T407-e added).

## Commands run

Production build of the merged base and of the branch served by `vite preview` on 5207; a Playwright audit walk (Pixel 5, iPhone 13 WebKit, 360 x 740, iPhone 13 landscape, 1280 x 800, de and fr at 360); `page.pdf` with PyMuPDF to count printed pages; verify_journeys, verify_trips, verify_trip_page, verify_pack_grid, verify_keyboard, verify_quality_floor; npm run lint, npm test, design-lint, check_ownership, impeccable detect. dist/ and dist-data/ deleted after.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Buttons sharing the name "More about this day" on a week | 7 (base audit walk, Pixel 5) | 0; 7 of 7 names distinct (verify_journeys) |
| Page bar title at 360 px in German | cut to "And..." (screenshot) | two lines, "Andorra High Route:..." (screenshot) |
| Bed chips legible at 360 px in German | one-night chips cut to "La...", "R..." (screenshot) | all listed in full (screenshot) |
| Stale #journey= address after the town exit | not measured on the base | none (new assertion, passes) |
| Printed hut circuit (page.pdf, A4) | 1 blank page on the first try, before the print fixes | 10 pages, none empty |
| Interactive elements under 44 px in .jpage, coarse pointer (Pixel 5, iPhone 13, 360, landscape) | 0 on the base walk | 0 |
| Booking row height, shortest | not measured | 93 px phone, 64 px landscape and desktop |
| verify_journeys | 42 checks (T397 report) | 46 PASS, 0 FAIL (4 new assertions) |
| verify_trips | 42 of 42 (T397 report) | 42 of 42 |
| verify_trip_page | 61 of 61 (T397 report) | 61 of 61 |
| verify_pack_grid | pass (T397 report) | pass, bad 0, tripsWithRepeatedLabel 0 |
| verify_keyboard | 20 of 20 on the base | 20 of 20 (journey @380 and @1280 pass) |
| Quality floor, journey screens | phone small 1 (T397 report) | phone small 1, desktop small 17, 0 horizontal scroll, 1 h1, 0 skips |
| Quality floor, phone targets under 44 px, all screens | not re-measured on the base | 15 (FAIL line of the floor; the journey page contributes 1) |
| impeccable detect, changed files | not measured | 0 findings |
| Design lint | 166 in the 166 baseline | 166, 0 new |
| npm test | 367 (T397 report) | 368 of 368 |
| npm run lint | 61 warnings (T397 report) | 0 errors, 62 warnings, none in my files |

## The phone (T414)

Pixel 5, iPhone 13 WebKit, 360 x 740 and landscape: no sideways scroll, no control under 44 px (the quality floor counts 1 on the phone journey page, the shell's cost bar segment, as in V4), Escape closes the page and focus returns to the opening card (WebKit reports no focused element after a touch close, as in V4). Landscape: booking rows measure 64 px, nothing clipped. Tap only: nothing new depends on hover. Keyboard: the page has no text field until the town receipt opens, so the shrink-by-40-percent check could not be walked (row T407-e); no fixed bar was added. Safe areas and dvh: no fixed or sticky element was added; the print block only applies under `@media print`. Thumb reach unchanged. Desktop fine-pointer scan found the shell's MonthStrip info button at 28 px (row T407-d).

Screenshots (JPEG 80, viewport only) in `design-v6-shots/trips/`: V5-list-android, V5-page-android, V5-week-android, V5-prepare-android, V5-page-iphone, V5-week-iphone, V5-page-desktop, V5-week-desktop.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First print gave one blank page | The page is a fixed dialog inside a full-height shell | Print lifts every ancestor to static, auto height and hides siblings along the chain |
| Print put each fold on its own page | `break-inside: avoid-page` on folds | Avoid breaks only inside days, booking rows and receipt lines |
| An unescaped newline in a harness string broke `node --check` | Heredoc escaping | Rewrote the one line |

## Carta-design's seven questions

1. No hex value; tokens only (design lint 0 new).
2. No gradient, no new colour; the change adds no accent.
3. Ochre, teal and danger untouched.
4. No mono added; the bed text is sans.
5. No new primary; the bed list is not interactive.
6. One new string, a button name, verb first; no em dash, middot or banned word; five existing strings translated.
7. Removed: the truncated bed chips on a phone and the clipped bar title.

## What is still open

Each item is also a row in Execution/_OPEN.md: native review of the new strings (T407-a), real-phone checks (T407-b), the shell's repeated deck and track names (T407-c), the MonthStrip button height (T407-d), the InfoDot and keyboard checks that need the town receipt open (T407-e). Still open from earlier and not repeated: the journey boot reader (T387-a), the map of the week (T397-a), DayTrack onSelect (T397-b), old composed rules in 24-destination-workspace.css (T387-h). The journey @380 keyboard walk that failed after Explore (T393-j, T403-e) passes 20 of 20 here.

## Rollback procedure

App: before the merge delete branch p10-v6-polish-trips; after it `git revert` the T407 commit. Root: revert the plan and report commits; register rows may stay. To drop only the print block, delete the `@media print` block in 66-v6-trips.css and `usePrintOpen` calls in JourneyPage.jsx. No data, migration or deploy touched.
