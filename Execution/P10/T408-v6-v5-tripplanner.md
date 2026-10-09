# T408: harden, adapt and polish: Trip planner (design wave V5)

## Task ID

T408

## Date

2026-10-09

## What changed

A partial V5 pass on the trip planner. The modal wizard is now a real dialog: role, aria-modal, a focus trap with Escape through the shared capture-phase stack, focus returning to the opener, and the single 28 percent ink scrim. The CountryPickerMap touch card is a plain region. The trip name has a visible focus border. A selected choice card (Nothing yet, trip cards, quiz chips) kept its ink inside-outline over the focus ring, so a keyboard user saw no focus on it; the ring now wins when focused, which clears the verify_keyboard finding from T402. The extras booking fields, notes, packing input and remove buttons carry aria-labels from existing strings. Coarse-pointer tap floors and 360 px wrapping rules went into 67-v6-tripplanner.css. verify_trip_landing and verify_receipt, which stopped at the calendar step and the pass overlay (row T382-g), run again. The weight item turned out to be done already: the admin fold and the tips and intel fold mount only when opened (TripItinerary.jsx, CheapTipsSection.jsx), so nothing changed. Items not done are listed under open. Impeccable choices: refinement only, the existing ink selected state and accent ring kept, no new pattern. The plan was committed after the first app edit began, a process slip.

## Files touched

**Modified (app repo):**
- src/planner/GuidedTripWizard.jsx
- src/planner/TripExtras.jsx
- src/map/CountryPickerMap.jsx
- src/styles/67-v6-tripplanner.css
- scripts/verify_trip_landing.mjs
- scripts/verify_receipt.mjs

**Created (root repo):**
- docs/design-v6/plans/V5-tripplanner.md
- Execution/P10/T408-v6-v5-tripplanner.md

**Modified (root repo):** Execution/_OPEN.md

## Commands run

Dev server on 5208 from the app worktree; scratch Playwright walk (iPhone 13 WebKit, Pixel 5, desktop 1280) for the screenshots and measurements; harnesses against http://127.0.0.1:5208/; npx eslint src; npm test; node scripts/ci/design-lint.mjs; impeccable detect on the changed files; vite build, then dist/ deleted.

## Config and secrets set

None. No new i18n keys, so the six catalogues are untouched.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Detector findings on changed files | 1 (surface-wide, day-planner class) | 0 on the files changed | -1 on changed files |
| Design lint | 166 of 166 | 166 of 166, 0 new | 0 |
| npm test | 368 pass | 368 pass | 0 |
| verify_keyboard trip-planner, 1280 | 1 stop with no ring | 0 | -1 |
| verify_trip_landing | stuck at calendar | 31 of 31 | fixed |
| verify_receipt | blocked | OK | fixed |
| planner_v2 / v2_flow / t8 / where_quiz / when_step / ready_trips / country_brief | not run before | 43, 47, 41, 28, 13, 90, 68 all pass | n/a |
| Phone keyboard test (input and Search visible, 40 percent shorter viewport) | pass | pass on iPhone and Pixel 5 | 0 |
| Horizontal overflow, landscape, reload of planned trip | none | none | 0 |
| Small targets, From step | desktop kids-add 109x32 | same (fine pointer allows 32) | 0 |

Weight: not measured; the folds already mount on open.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Design lint caught `outline: none` in my focus rule | New rule | outline-color: transparent with a border |
| Commit showed 7,450 changed lines in GuidedTripWizard.jsx | Python rewrite and the autocrlf filter changed line endings | restored CRLF, staged raw with hash-object; the diff is 8 lines |
| verify_receipt asserted the Bag check panel | Panel retired with flight pricing | assertions kept as comments, breakdown checked instead; ledger opens its fold first |
| verify_trip_landing counted 2 booked cards, 4 steps | Design moved on (3 cards, 7 steps, From step, quiz first) | updated with comments |
| Started a preview on 5209 once | Slip | stopped at once; nothing left running |

## What is still open

Each item is also a row in Execution/_OPEN.md. Not done: heading order h2/h3 in the planned view (V5-3); arrow-key radio groups for quiz and month chips (V5-2; aria-pressed already exists); off-token shadows, 999 px radii and sub-12 px type (V5-4, V5-5, T398-d); de and nl screenshots at 360 px (V5-7; wrap rules are in but unshot); T398-f photograph share; the modal wizard's dialog behaviour is verified by code and the shared hook only, since the modal opens only from a country seed over an existing trip; full verify_keyboard (20 of 20) was cut short, only the trip-planner surface ran and passed at 380 and 1280; verify_booked_route and verify_handoffs not run (they spawn fixed-port previews, T398-e); the owner needs a real phone for haptics, keyboard and scroll momentum.

## Rollback procedure

In the app repo git revert the T408 commit on branch p10-v6-polish-tripplanner; in the root repo revert the plan and report commits. No data, schema or migration changes.
