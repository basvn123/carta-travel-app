# T1123: Core flow fixes (ROADMAP G4, session S39)

## Date

2026-11-06

## What changed

The plan flow and the trip page no longer lose the traveller's place. A reload on a setup question (Tell, Who, When, From) used to drop them on the Plan opening, where Start planning began a brand new trip; a reload on the priced trips dropped them on the trip's empty home. Both now come back to the same screen (`flowMemory.js`, session storage tied to the device trip). Back from the priced trips used to land on a trip home whose only button walked the ten help-me-choose questions before the trips came back: a loop. That button now reads "See your priced trips" and opens them. When on set dates with no dates chosen now says why Continue is grey, and the refine card says how many questions "Fit these to me" asks before it starts. All four are logic and markup on existing classes; no .css file changed. Measured by the new `scripts/verify_core_flow.mjs` walk: 4 of 11 checks failed on the base build at 390 and 1440 (and the walk could not go on past the setup reload), 11 of 11 pass after.

## Scope: where the list came from

G4's scope is meant to come from G-R3 (interviews and an unmoderated test). G-R3 has not run (no report in `docs/research/`; the only research file is the launch plan, which names no flow problems). So the list was built from `docs/AUDIT-2026-11.md` (the P- items in Explore, place pages, Plan and the trip page), the T1103 usability note, and a code walk of the four flows looking for dead ends, missing back paths, lost state on reload and confusing first steps.

| # | Problem | Source | Result |
|---|---|---|---|
| 1 | Reload on a setup question lands on the Plan opening; Start planning there begins a new trip, so the answers seem lost | code walk | Fixed (PlanFlow, flowMemory) |
| 2 | Reload on the priced trips lands on the trip's empty home | code walk | Fixed (TripFlow, flowMemory) |
| 3 | Back from the trips lands on the trip home; its button walks ten questions before the trips return (dead end loop) | T1103 note ("Back from the trips goes to the trip's own page") | Fixed: "See your priced trips" |
| 4 | When opens on set dates with none chosen; Continue is grey with no reason | T1103 note, row T1103-h | Fixed in part: a reason line. The ready default (months or not sure) stays a product call, row T1103-h stays open |
| 5 | "Fit these to me" gives no count before ten questions | T1103 note | Fixed: "10 short questions." on the refine card |
| 6 | Phone Back gesture inside the setup leaves Plan | code walk | Left: the questions are not history steps, and adding them touches App.jsx's popstate rule shared by every tab; row T1123-a |
| 7 | Explore's "What matters most" start dialog blocks the first look (P-34) | audit | Left: making it inline needs new styling (no .css tonight) and the account flag is in src/auth; already row T1103-a |
| 8 | Trail pages have no URL, no Back (P-37) | audit | Left: its own roadmap item G13 |
| 9 | Non-button controls "Start planning", "Continue" (P-39) | audit | Checked: both are `Button` from the ui kit now (real `<button>`); nothing to fix |
| 10 | Explore empty results | code walk | Checked: the empty block names the last filter and offers to remove it or clear all; no dead end |
| 11 | Place page Back and deep link | code walk | Checked: `#dest=` is a history step (T444), PageBar Back closes onto the list; no fix needed |
| 12 | Sample trip on an empty Plan home (P-46) | audit | Left: new content, row T1103-b |

## Files touched

- `continent-app/src/planner/flow/flowMemory.js` (new): `rememberPlace`, `recallPlace`, session storage with a memory fallback, keyed by trip id.
- `continent-app/src/planner/flow/PlanFlow.jsx`: restores and keeps the setup screen; clears it when the trip is made. CRLF kept.
- `continent-app/src/planner/flow/TripFlow.jsx`: restores and keeps the phase and the short-setup mark; the trip home's button goes to the trips after the short setup; the refine card gets its count.
- `continent-app/src/planner/flow/RefineCard.jsx`: optional `count`.
- `continent-app/src/planner/flow/setupScreens.jsx`: When's reason line (`.pf-note`, an existing class).
- `continent-app/src/i18n/{en,nl,de,fr,es,it}.js`: `pf.when.needDates`, `pf.home.seeTrips`, `pf.refine.count`.
- `continent-app/tests/flowMemory.test.mjs` (new, 5 tests).
- `continent-app/scripts/verify_core_flow.mjs` (new): the browser walk, 11 checks.
- `docs/HANDBOOK.md` (Plan home and the plan flow, step 3), `ROADMAP.md` (G4 status), `Execution/_OPEN.md` (rows T1123-a to d).

## Commands run

```
cd continent-app && npm ci
node scripts/sync-data.mjs --split-only
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
# base: git worktree of HEAD in the scratchpad, same build with CARTA_APP set
node ../Execution/P15/T840-T843-walk/serve-a.mjs ../.fastbuild public 5871
PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/verify_core_flow.mjs ../Execution/P15/T1123-shots 390|1440 http://localhost:5871
PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/verify_core_flow.mjs ../Execution/P15/T1123-shots/before 390|1440 http://localhost:5870 [--skip-setup-reload]
npx eslint <touched files>; npm test; node scripts/ci/design-lint.mjs
bash ../.claude/skills/impeccable/scripts/impeccable detect --json <touched jsx>
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| verify_core_flow checks passing, 390 | 1 of 3 reached (walk ends: reload lands on Plan opening); with --skip-setup-reload 3 of 7 reached before the trip home had no way back to the trips | 11 of 11 | all pass |
| Same, 1440 | same as 390 | 11 of 11 | all pass |
| Screen after a reload on From | Plan opening ("Travel Europe your way...") | From | kept |
| Screen after a reload on the priced trips | trip home | priced trips | kept |
| Taps from the trip home back to the priced trips (short-setup trip) | 11 or more (ten questions, then the trips) | 1 | -10 |
| npm test | not run on the base | 1557 tests, 1552 pass, 0 fail, 5 skipped | 5 new |
| design-lint new violations | 0 | 0 | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| eslint would not start | node_modules absent in the container | `npm ci` |
| The app would not boot offline | `public/boot.json` and `dest/` are generated | `sync-data.mjs --split-only` (gitignored output) |
| A "+" icon on "See your priced trips" read as "add" | the trip home's one button kept its icon | an arrow at the end for that label |
| The base walk could not pass the setup reload | the bug itself | `--skip-setup-reload` flag to measure the rest on a base build |

## Screens checked

Built app at 390 x 844 and 1440 x 900, before and after (shots in `Execution/P15/T1123-shots/`, gitignored): When with no dates (reason line under the calendar, above Continue), From after a reload, the priced trips with the refine card and its count, the trips after a reload, the trip home with "See your priced trips", the trips again. No sideways scroll and no page errors at either width. Card photos blank (image host unreachable), not a regression.

## Carta-design seven questions

1. One coherent page: no new look; the reason line uses `.pf-note`, the plan flow's own small note, and the button the ui kit's primary.
2. Compactness: one note line on When only while Continue waits; one short sentence added to the refine card's sub line. The path back to the trips is 10 taps shorter.
3. Motion: none added; reduced motion unaffected.
4. Numbers: no figure added. The count is the length of the questions list the walk will actually ask (`guideQuestions`).
5. Accessibility: the reason line is a `role="status"` live region, so a screen reader hears why Continue waits; all controls stay real buttons; focus still lands on the new screen's heading after a restore.
6. Six languages, no dashes, no banned words (checked).
7. Detector clean (`[]`). One thing left to remove: the reason line could sit beside the dates instead of under the calendar (row T1123-c, needs a style rule).

## What is still open

- T1123-a: the phone Back gesture inside the setup questions leaves Plan; adding history steps must agree with App.jsx's popstate rule, which every tab shares.
- T1123-b: G-R3 (interviews, unmoderated test) has not run, so G4's list rests on the audit and a code walk (owner).
- T1123-c: the When reason line sits under the calendar, below the fold on a phone; moving it needs a style rule, left while S42 consolidates the stylesheets.
- T1123-d: a look on a real phone at the reload fixes (owner).
- Still open from before and not duplicated: T1103-a (Explore start dialog, P-34), T1103-b (sample trip, P-46), T1103-h (When's ready default), G13 (trail URLs, P-37).

## Rollback procedure

`git revert` the T1123 commit. Nothing one-way: the session storage key `carta.plan.place.v1` is only read by this code and expires with the tab.

## Owner steps (for the checklist)

- [T1123-b] Run the G-R3 usability research | G4 should fix what real travellers trip over, and tonight's list came from the audit and a code walk | do 5 short interviews and one unmoderated test of Explore, a place page, Plan and the trip page; rank the top 10 problems; hand them to the next G4 task | ROADMAP.md (G-R3, G4)
- [T1123-d] Check the reload fixes on a real phone | only a real phone shows the reload and swipe behaviour as travellers meet it | on a phone, Plan, Start planning, answer to From, pull to reload (still From); finish, reload on the priced trips (still the trips); tap Back, then "See your priced trips" | Execution/P15/T1123-core-flow-fixes.md
