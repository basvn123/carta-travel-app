# T1103: A shorter plan flow (ROADMAP G12, session S19)

## Date

2026-11-06

## What changed

A first-time traveller now reaches priced trips in 5 screens and 6 taps from the Plan home, where it took 23 screens and 31 taps (measured by `scripts/verify_plan_short.mjs` on the base build and this branch, 390 and 1440 wide). Start planning goes straight to Tell Carta; the "What do you want to plan?" sheet shows only while a device trip is under way today. A new trip asks Tell, Who, When and From (three answers plus the optional sentence), is then made with its defaults and opens directly on its priced trips: no Create screen, no trip home, no ten help-me-choose questions in front of the first price. Those questions now refine the trips: a refine card on the list says what the prices rest on ("Priced from your airport, dates and people") and offers "Where you sleep" and "Fit these to me"; Back on the first refine question returns to the trips. Prices stay the engine's own: nothing new is priced, the stay type and eating keep the app's existing defaults, and the trip settings gear still holds every skipped setup answer. One engine change was needed: the trip finder's country match ranks only by trip types and returned nothing with "What are you up for" unasked, so when that question was never asked the finder now ranks by the broadest types (city, culture, food) without writing or showing a like. The Explore start dialog (P-34) and the sample trip (P-46), the other half of G12, are not in this task's files and stay open.

## Files touched

- `continent-app/src/planner/flow/flowGraph.js`: `FIRST_SETUP`, `firstSetup`, `tripUnderWay`, header note.
- `continent-app/src/planner/flow/PlanFlow.jsx`: Start planning skips the kind sheet unless a trip is under way; the short setup list; the trip made at the end of it (`quickCreate`); step counter counts the questions only. CRLF kept.
- `continent-app/src/planner/flow/TripFlow.jsx`: opens on the trips after the short setup; refine card; Back from the trips and from the first refine question.
- `continent-app/src/planner/flow/quickStart.js` (new): the one-shot mark from PlanFlow to TripFlow (session storage, memory fallback; peek does not clear, for StrictMode).
- `continent-app/src/planner/flow/RefineCard.jsx` (new).
- `continent-app/src/planner/finder/FindingTrips.jsx`, `continent-app/src/planner/finder/TripsForYou.jsx`: pass and draw an optional `refine` node under the answer chips (two lines each, outside the named folder; the card had to sit inside the list's own layout).
- `continent-app/src/lib/recommend/candidates.js`: `BROAD_TYPES`, `broadWhenUnasked` (outside the named folder; without it the short flow found no trips).
- `continent-app/src/styles/86-plan-flow.css`: `.pf-refine*`.
- `continent-app/src/i18n/{en,nl,de,fr,es,it}.js`: `pf.refine.title`, `.sub`, `.sleep`, `.go`.
- `continent-app/tests/planFlowShort.test.mjs` (new, 6 tests).
- `continent-app/scripts/verify_plan_short.mjs` (new): the walk that counts screens and taps, with `--expect` checks.
- `docs/HANDBOOK.md` (Plan home and the plan flow), `ROADMAP.md` (G12 status).

## Commands run

```
cd continent-app && npm ci
node scripts/sync-data.mjs --split-only          # gitignored boot.json and dest/ for the offline check
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
# base build: a sparse worktree of HEAD in the scratchpad, same command with CARTA_APP set
node ../Execution/P15/T840-T843-walk/serve-a.mjs <build> public <port>
PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/verify_plan_short.mjs ../Execution/P15/T1103-shots/before 390|1440 http://localhost:5870
PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/verify_plan_short.mjs ../Execution/P15/T1103-shots/after 390|1440 http://localhost:5871 --expect
npx eslint <touched files>; npm test; node scripts/ci/design-lint.mjs
bash ../.claude/skills/impeccable/scripts/impeccable detect --json src/planner/flow/RefineCard.jsx src/styles/86-plan-flow.css
```

## Config and secrets set

None.

## Before/after measurements

Walk: Plan home, Start planning, then every screen's default with the primary button, a first option only where Continue waits for one (When opens on set dates with none picked). Fast build, offline data (no flight sweep: the trips show "without the flight").

| Metric | Before | After | Delta |
|---|---|---|---|
| Screens from Plan home to the first priced trip (loader not counted), 390 | 23 | 5 | -18 |
| Same, 1440 | 23 | 5 | -18 |
| Taps to the first priced trip, 390 and 1440 | 31 | 6 | -25 |
| Answers before a price (who, when, from; Tell optional) | 19 questions | 3 (+ Tell) | -16 |
| Robot time to the priced list (includes the loader's minimum stand), 390 | 17.5 s | 7.2 s | -10.3 s |
| npm test | not run on the base | 1346 tests (6 new), 1341 pass, 0 fail, 5 skipped | |
| design-lint new violations | 0 | 0 | |

The audit's "12 screens" (P-33) counted only up to the trip home; the full path to a price was 23.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The short flow landed on "No trips fit yet" | `matchCountries` returns nothing without a trip type, and likes were never asked | `broadWhenUnasked` in candidates.js: an unasked likes question ranks by city, culture, food; no like written or shown |
| PlanFlow.jsx showed as 800 changed lines | the edit script wrote LF over a CRLF file | CRLF restored before commit |
| The app would not boot offline | `public/boot.json` and `dest/` are generated and were absent; data host unreachable | `sync-data.mjs --split-only` (gitignored output) |
| The project's Playwright pins another browser build | npm ci installed its own Playwright | the harness takes `PW_CHROMIUM` (preinstalled chromium) |

## Screens checked

Built app at 390 x 844 and 1440 x 900, before and after, screenshots in `Execution/P15/T1103-shots/` (gitignored). After: Tell, Who, When, From, the finder's loader, the trips with the refine card (sits between the answer chips and the sort row; one band on mist; on a phone the two doors wrap under the sentence), Where you sleep and back, Fit these to me (first question) and Back to the trips. No sideways scroll at either width, no page errors. Card photographs were blank in this container (image host unreachable), not a regression.

## Carta-design seven questions

1. One coherent page: the refine card uses the Carta card's foot-strip ground (mist at 55%), the plan flow's icon tile and type scale, and the existing button kit; no new shadow.
2. More compact: the path itself is 18 screens shorter; the card adds one band to the trips list, under the chips (one line of text on desktop, three on a phone; height not measured).
3. Motion: none added; the trips' own arrival is unchanged. Reduced motion is unaffected.
4. Numbers: no new figure. Every price is the finder's existing quote through formatMoney; the card's sentence says only what the prices are computed from and makes no claim about the traveller's likes.
5. Accessibility: a labelled section with an h3, real buttons, 44 px targets on touch (btn-sm), focus order sentence then doors; contrast from existing tokens (`--text`, `--text-2`, `--select-ink` on mist).
6. Six languages, no dashes, no banned words (checked).
7. Detector clean (`[]`). One thing left to remove: the "Where you sleep" door could fold into the trip settings once the help-me-choose walk asks it (row T1103-d).

## Usability note: what a first-time traveller would still trip over

- When opens on "On set dates" with no date chosen, so Continue waits; a traveller without dates must notice the other three options (one extra tap, a moment of "why is it grey").
- The trips are priced for a rented home and Carta's default eating until they open "Where you sleep"; the card says to refine but not what the default is.
- "Fit these to me" is still ten questions; there is no count before they start (the step dots show it once inside).
- With no flight data the cards say "without the flight" (the sweep was unreachable here); on production the flight is in the total.
- Someone already travelling no longer sees "I'm on a trip now" unless a Carta trip is under way today; "Add a past trip" now lives only in My trips.
- Back from the trips goes to the trip's own page (the trip home), not to the From question; a traveller who wanted to change the airport should use the From chip instead, which is not obvious.

## What is still open

- T1103-a: Explore's "What matters most" start dialog becomes an inline, dismissible prompt with its seen-flag tied to the account (P-34). Not in this task's files (`browse/StartDialog.jsx`, `ExploreTab.jsx`), and the account flag touches `src/auth/`, another session's area tonight.
- T1103-b: a sample trip on an empty Plan home (P-46); the Carta trips door is there, a worked sample trip is not.
- T1103-c: product call on where "I'm on a trip now" and "Add a past trip" live now that the kind sheet is skipped (owner).
- T1103-d: fold the ten help-me-choose questions into fewer screens for the refine walk.
- T1103-e: a real-person usability test of the short flow on a phone (owner).
- T1103-f: confirm the broad ranking default for an unasked likes question (city, culture, food) or pick another (owner).
- T1103-g: `scripts/verify_plan_mocks.mjs` still walks the old flow (kind sheet, Create, doors); bring it to the short flow.
- T1103-h: When could open on a ready answer (months or "not sure yet") so Continue never waits on the first visit.

## Rollback procedure

`git revert` the T1103 commits on this branch. Nothing one-way: no data, no migration. A trip made by the short flow is an ordinary device trip and opens as before after a revert.

## Owner steps (for the checklist)

- [T1103-c] Decide where "I'm on a trip now" and "Add a past trip" live | the trip-kind sheet that held them now shows only while a trip is under way | open Plan on a phone with no trip under way; tap Start planning and note the sheet is gone; decide: keep (My trips has Add a past trip) or ask for a quiet link on Plan home | Execution/P15/T1103-plan-flow-short.md
- [T1103-e] Usability test of the short plan flow with one first-time traveller | only a real person shows where the 5-screen path still confuses | on a phone, ask someone new to Carta to "find a priced week away"; watch without helping; note where they pause (When with no dates, the refine card, Back from the trips) | Execution/P15/T1103-plan-flow-short.md
- [T1103-f] Confirm the broad ranking for an unasked "What are you up for" | the first trips rank by city, culture and food until the traveller says what they like | look at the first trips after Tell, Who, When, From; keep the default or name three other types for `BROAD_TYPES` | continent-app/src/lib/recommend/candidates.js
