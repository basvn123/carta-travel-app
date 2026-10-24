# T668 to T677: the day planner, and the trip planner's open rows (batch 2 of the planner rebuild)

## Shared header

**Batch.** Batch 2 of the owner's planner rebuild (plan `C:\Users\Gebruiker\.claude\plans\async-forging-shore.md`, board artifact XGWMhPogX9dBb7jW6URXAA), on top of batch 1 (T653 to T660, report `T653-T660-trip-planner-flow.md`). The owner's brief for this batch, 2026-10-24: do the day planner and fix the open batch 1 issues (ready trips without the journeys library, no compare for up to three countries, the planning steps in the old wizard look, "Let Carta plan the days" not starting the AI plan, booking upload and live flights untested); clean, modern, production ready, test the logic, check every flow; where something good (events and the like) has no data yet, leave a placeholder. T677 was reserved and not used. Peer sessions hold T661 to T667 (PB1), T678, T679, T689 to T698 (PB2) and T699 to T730 (PB3 to PB5).

**What the batch is.** The planning steps now wear the flow's sheet (T668). The ready-trip door offers the 253 curated journeys beside the trips layer, each with a What's there sheet (T669). Up to three countries compare side by side from Where (T670). A trip's days have an overview, Your days, after TravelSpend and GetYourGuide: what the trip costs (total, a person a day, the parts), every day as a card, the ideas by section (can't miss, sights, adventures, walks, cycling, mountains lakes and beaches, food, what's on), kept for later, and Add to a day (T671, T672). A day opens with its town after the Polarsteps place page and guide list (photo, flag, name, its line, photos, seven questions that open in place) and Wanderlog's two head links, Fill this day and Best order (T673). The trip's day rhythm now reaches the days, and "Let Carta plan them" opens day one with the AI plan running on the rhythm (T674). The trip planner's open rows are fixed and every backend flow is tested against mocks (T675). The end check found five more faults, fixed under T676.

**Branches.** App: `p15-day-planner` (from batch 1's `p15-trip-planner-flow` b39e08a) in worktree `wt/p15-plan-flow-app`, commits 2563127 to 8bddc71. Root: `p15-day-planner` (from `p15-trip-planner-flow` d47dc79d8) in `wt/p15-plan-flow-root`, mirror 6b5b1e15e and this report. Batch 1 is inside these branches; nothing is merged, pushed or deployed. App master moved on under PB1 and PB2 (176e033 and later), so the merge will meet conflicts in `App.jsx`, `DayPlannerTab.jsx`, `TripPlannerTab.jsx` and `GuidedTripWizard.jsx`.

**Models.** One session on Opus 5.5; no mind map notes exist for these numbers.

**Static checks per task.** eslint on the touched files (no new warnings; the three left exist on master), `npm test`, the fast NOPUBLIC build (`wt/vite.t653.mjs`), `scripts/css-routes.mjs --check` (4, the items-sheet four master has; twice a new rule tied with a route sheet and was raised), `scripts/ci/design-lint.mjs` (29, as master), and `impeccable detect --json` on every changed JSX and CSS file of the batch (one finding, a width transition, fixed under T676; 0 after).

**End check.** One round on the merged batch, a build with the verify seams on and a fake Supabase host (`VITE_E2E_SEAMS=1 VITE_SUPABASE_URL=http://sb.mock.test VITE_SUPABASE_ANON_KEY=mock-anon`), so no request reached the real project. It was served by `wt/t660-serve.mjs` with the main checkout's `public/`. Playwright ran at 390 x 844, 820 x 900 and 1280 x 900 with the service worker blocked: page.route cannot see the fetches a service worker serves, which is why batch 1 saw live flights "checking" forever. Two scripts:

- `scripts/verify_plan_mocks.mjs` (committed, 16 checks): a booking upload answered by a mocked parse-booking fills the setup, Your stays and where you land; live flights on the planned trip, from a mocked `/api/flights`, rank by what matters most and re-rank from the settings gear; on a trip now; "Plan a trip here".
- `t676.mjs` (session scratchpad, 16 checks): plan the days with Let Carta plan them (a fake signed-in session; plan-day mocked from the candidates it was sent), the plan applied onto the day, the town guide, the head links, Your days, keep an idea, add it to a day, I'll plan them myself, compare three countries, the journeys and What's there.

Result after the T676 fixes: 32 of 32 checks pass at every width, with no page error, no horizontal overflow, no raw key, and no dash or middot in page text.

What this environment cannot show: real flight figures. The data host refuses localhost, so the swept flights file never loads; compare's flight row reads "No flight found" and a planned trip without the live answer reads "No flight that day". The live path itself is proven with the mock. Nothing was sent to any third party: the mocks answered every backend call, and no request carried the owner's address.

**carta-design, the seven questions.**

1. Every colour in the new CSS is a token; the only accent is `--amber` on compare's Best value.
2. No gradient; the overview's cost bar uses the `--kind-*` ink ramp.
3. Brown only acts or is selected: the primary, links, kept and selected states (tint plus a tick).
4. Nothing under 11 px; figures through formatMoney or formatEst. Totals and receipt lines show cents and day figures stay whole, per the owner's rule of 2026-10-13. T676 brought the overview's Total tile into line with that rule.
5. One primary per view (Put it on this day, Import this day, Choose this trip, Continue); no text on photographs; names sit under the tiles.
6. Headlines are questions or names; no em dash, middot or hyphen separator; ranges say "to".
7. Removed: Polarsteps' Plan and Track switch, GetYourGuide's booking prices and ratings (Carta has neither), and the dark sheet of the Polarsteps guide list (white rows with ink icons instead).

---

## T668: the planning steps take the flow's look

### Task ID

T668

### Date

2026-10-24

### What changed

Inside the flow, the planning engine's steps (Where, Stay, Trips, Stays, From, Getting there, Review) now open under the flow's sheet head instead of the old wizard header: a round back button, the step's name, "x of n", a thin progress bar and, on a desktop, the kit StepRail. The footer drops its own Back, since the head carries it. The old wizard (outside the flow) is unchanged.

### Files touched

**Modified:** `src/planner/wizard/WizardChrome.jsx`, `src/planner/GuidedTripWizard.jsx`, `src/styles/86-plan-flow.css`

### Commands run

Static checks as in the header.

### Config and secrets set

None.

### Before/after measurements

Not measured.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The progress bar animated `width` (impeccable detect, layout-transition) | written that way in T668 | scaleX transform with a reduced-motion stop (T676 commit) |

### What is still open

None.

### Rollback procedure

`git revert 2563127` in the app.

---

## T669: the journeys library in the ready-trip door

### Task ID

T669

### Date

2026-10-24

### What changed

The ready-trip door now offers the curated journeys (`lib/journeys.js`) beside the trips layer, for the countries picked. A journey names its towns in words, so `lib/journeyTrips.js` resolves each name, within the journey's countries, to the catalogue's best-rated town of that name. A journey whose towns cannot be placed is not offered. Nights come from the journey's sleeps, or are shared evenly. A journey card carries its own title. Its What's there is a sheet in the planner (JourneyPeek: photo, story, best months, day by day), which replaced the full JourneyPage: that page pulled the items sheets into the planner chunk (325 css-routes problems). Choosing a journey builds the trip from its stops. End check: Croatia offers 5 journeys; the Makarska week opens day by day (7 days), and choosing it picks `j:hr-beach-week-makarska-riviera`.

### Files touched

**Created:** `src/lib/journeyTrips.js`, `src/planner/JourneyPeek.jsx`, `tests/journeyTrips.test.mjs`
**Modified:** `src/planner/ReadyTripsStep.jsx`, `src/planner/GuidedTripWizard.jsx`, `src/styles/86-plan-flow.css`, `src/i18n/*.js`

### Commands run

Static checks.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Ready trips offered for Croatia, journeys among them | 0 | 5 | +5 |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| css-routes 325 problems | JourneyPage imported the items sheets into the planner chunks | JourneyPeek, a planner sheet |

### What is still open

None.

### Rollback procedure

`git revert 8fd7c6a db4623e` in the app.

---

## T670: compare up to three countries side by side

### Task ID

T670

### Date

2026-10-24

### What changed

With two or three countries picked on Where, a bar offers Compare. The sheet sets the countries out as columns: a day a person (median, the cheapest town as "from", the best value marked), a night where you sleep for the traveller's Lifestyle, food and drink a day, the flight from home (the sweep's cheapest return for the trip's month, else any month), the weather in the trip's month, crowds, and the best months. All figures come from one pure function, `lib/countryCompare.js`. On a phone the columns scroll; from 900 px the sheet is 880 px wide and three countries fit without a scroll (T676).

### Files touched

**Created:** `src/lib/countryCompare.js`, `src/planner/CompareSheet.jsx`, `tests/countryCompare.test.mjs`
**Modified:** `src/planner/wizard/StepWhere.jsx`, `src/planner/GuidedTripWizard.jsx`, `src/styles/86-plan-flow.css`, `src/i18n/*.js`

### Commands run

Static checks.

### Config and secrets set

None.

### Before/after measurements

Not measured.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first string batch overwrote `compare.title` and `compare.remove` | key names already in use | reverted; keys renamed `cmp.*`; the string script refuses existing keys without `--replace` |
| On a desktop the third country was cut off | the free sheet's 560 px max width; `width` only sizes anchored sheets | `.fsheet.cmp-sheet` 880 px from 900 px (T676 commit) |

### What is still open

The flight row could not be seen with real fares on localhost (T676-b).

### Rollback procedure

`git revert d670271` in the app.

---

## T671: day ideas as sections, keeping and placing them

### Task ID

T671

### Date

2026-10-24

### What changed

`days/dayIdeas.js` turns what is near a stop into the overview's sections: can't miss, sights, adventures, walks, cycling, mountains lakes and beaches, food, and what's on. The sections come in the order of the trip's goal. With kids or slower walkers in the party, climbs over 400 m and walks over 10 km are left out. A section with nothing yet stays, last, as a placeholder (the owner's rule for events and the like). Keeping is per trip (`prefs.savedIdeas`). Placing puts a catalogue POI on a day by its index, and anything else as a custom POI with an `ideaKey`; placing on another day moves it. `dayExploreRails.js` now reads peaks and cycling routes, an event's month list and its line, and a POI's detail and type. `days/tripCost.js` gives the overview its figures (total, a person, a person a day, the parts, what is missing).

### Files touched

**Created:** `src/planner/days/dayIdeas.js`, `src/planner/days/tripCost.js`, `tests/dayIdeas.test.mjs`
**Modified:** `src/planner/dayExploreRails.js`

### Commands run

Static checks.

### Config and secrets set

None.

### Before/after measurements

Not measured.

### What broke and how it was fixed

No issues.

### What is still open

What's on has only the dossier's festivals by month, no dated events; in most towns the section is a placeholder (T671-a).

### Rollback procedure

`git revert 6d07d9f` in the app (T672 depends on it: revert T672 first).

---

## T672: Your days, the trip's days overview

### Task ID

T672

### Date

2026-10-24

### What changed

"Plan your days" with I'll plan them myself, and the All days link on any day, open Your days. It shows:

- two money tiles (Total, A person a day) over the cost bar and its parts;
- the days as cards (date, town, what is planned, photos);
- the stop chips;
- Kept for later;
- the idea rails, kit Card tiles with Keep and Add to a day.

Add to a day opens a day picker sheet (ChoiceRows). `useStopIdeas` loads the stop's trails, beaches, lakes, mountains, cycling and dossier once, within reach. End check (Douro Valley, 7 nights): 2 tiles, 7 day cards, 5 rails and 3 placeholders; a kept idea is listed, then placed on day 2.

### Files touched

**Created:** `src/planner/days/TripDaysOverview.jsx`, `src/planner/days/useStopIdeas.js`
**Modified:** `src/planner/DayPlannerTab.jsx`, `src/planner/TripPlannerTab.jsx`, `src/styles/86-plan-flow.css`, `src/i18n/*.js`

### Commands run

Static checks.

### Config and secrets set

None.

### Before/after measurements

Not measured.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The Total tile showed ~€1,233 above a bar reading ~€1,232.88 | tiles formatted whole | total and parts in cents, the day figure whole (T676 commit) |

### What is still open

None.

### Rollback procedure

`git revert 4e29c3b` in the app.

---

## T673: a town on its day page, and the day head links

### Task ID

T673

### Date

2026-10-24

### What changed

A day now opens with its town, after the Polarsteps place page and its guide list. On the first day in a town it shows the photograph (nothing on it), the flag and country, the town's name and its line, and a strip of more photographs. Every day shows the guide as seven questions that open in place: what is it like, where should I sleep (neighbourhoods with a night's price), the best time, how do I get there (airport, public transport, whether a car helps), good to know, what's on, and an insider tip. A question the dossier cannot answer keeps its row with the placeholder. The day head carries Wanderlog's two whole-day moves as links, Fill this day and Best order; the tools row keeps Add places.

### Files touched

**Created:** `src/planner/days/townGuide.js`, `src/planner/days/DayTownGuide.jsx`, `tests/townGuide.test.mjs`
**Modified:** `src/planner/DayPlanPanel.jsx`, `src/styles/86-plan-flow.css`, `src/i18n/*.js` (the guide's mount on the day page is in the T674 commit, which also changes `DayPlannerTab.jsx`)

### Commands run

Static checks.

### Config and secrets set

None.

### Before/after measurements

Not measured.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| css-routes 7 | `.dayp-head .dayp-links .btn` tied with the trip total bar's route rules | the padding rule dropped; the quiet buttons keep their own |

### What is still open

The insider tip has no data source and is a placeholder everywhere; where to sleep is empty for towns without neighbourhoods (T673-a).

### Rollback procedure

`git revert b4b2f0c` in the app, after T674.

---

## T674: the trip's rhythm reaches the days, and Carta plans them

### Task ID

T674

### Date

2026-10-24

### What changed

Opening a trip's day now merges the trip's day rhythm (start time, pace, step free, group size) under the day's own prefs: what was set on a day stays, and what was never set follows the rhythm. The detail level follows the rhythm's answer. "Let Carta plan them" opens day one with the AI day plan at work: a preset built from the rhythm (`dayAiPreset`), which runs at once for a signed-in traveller. A guest gets the plan's questions, as before. Every AI run for a trip day now sends the rhythm as the plan-day profile (companions, start time, steps, food, step free, moods), which the Edge Function already reads. End check: one plan-day call carrying `{companions: partner, startTime 08:00, steps 15000, food quick, moods museums, sights}`; the three catalogue stops it answers with land on the day.

### Files touched

**Modified:** `src/planner/DayPlannerTab.jsx`, `src/planner/TripPlannerTab.jsx`, `src/planner/flow/tripSettings.js`, `tests/tripSettings.test.mjs`

### Commands run

Static checks.

### Config and secrets set

None. No Edge Function change: plan-day already validates `profile`.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| plan-day calls after "Let Carta plan them" | 0 | 1 | +1 |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Closing the AI plan left the traveller in the places browser | an empty day opens on its places | not when Carta is about to fill it (T676 commit) |

### What is still open

None.

### Rollback procedure

`git revert 86af65d` in the app.

---

## T675: the trip planner's open rows, tested against mocks

### Task ID

T675

### Date

2026-10-24

### What changed

- **T653-a.** A date or head count changed in the engine now writes back into the settings (`withEngineEdits`), so the gear never shows the setup answer while the trip runs on other dates.
- **T656-d.** "Plan a trip here" enters the flow on the I know where door and lands on Where with the country picked, in the new look.
- **T657-b.** Stays read from uploaded bookings fill Your stays (`importStays.js`): the town is matched by name, the nights run to the next check-in (the last one to the trip's end), and the price is the one paid. An uploaded flight out answers "Where do you land?".
- **T659-a.** "Add my trip as it is" asks "Where are you now?" and "Until when are you away?" in place of When and Where from. The trip runs from today, and the engine starts in the nearest catalogue town within 40 km (none is invented beyond that).
- **Found while testing.** A planned trip had no way back to its settings. It now has the gear on its name, and a saved answer moves its party and its start date (the nights stay).

`scripts/verify_plan_mocks.mjs` runs these flows against mocks (16 checks).

### Files touched

**Created:** `src/planner/flow/importStays.js`, `tests/importStays.test.mjs`, `scripts/verify_plan_mocks.mjs`
**Modified:** `src/planner/GuidedTripWizard.jsx`, `src/planner/TripPlannerTab.jsx`, `src/planner/flow/{PlanFlow,QuestionScreen,TripFlow,TripSettingsSheet,setupScreens}.jsx`, `src/planner/flow/{flowGraph,questions,tripSettings}.js`, `src/styles/planners/11-trip-planner.css`, `tests/flowGraph.test.mjs`, `tests/tripSettings.test.mjs`, `src/i18n/*.js`

### Commands run

`VITE_E2E_SEAMS=1 VITE_SUPABASE_URL=http://sb.mock.test VITE_SUPABASE_ANON_KEY=mock-anon PF_OUT=<dir> npx vite build --config ../vite.t653.mjs`, `node wt/t660-serve.mjs <dir> 5254`, `node scripts/verify_plan_mocks.mjs <shots> <width>`.

### Config and secrets set

None committed. The mock build's env lives on the command line only.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Backend flows checked in a browser (upload, live flights, on a trip, seed) | 0 | 4, 16 checks, 3 widths | +4 |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The mock build still showed the paywall | the verify seams are compiled out unless `VITE_E2E_SEAMS=1` | built with it |
| Live flights never answered in the test | the service worker served `/api/flights`, out of page.route's sight | context with `serviceWorkers: 'block'` |
| `sed -i` stripped GuidedTripWizard.jsx's CRLF | Git Bash sed (known) | restored by Python before the commit |
| css-routes 5 | the gear rule tied with `.fsheet.is-anchored` | raised to 0,3,0 |

### What is still open

Settings edits on a planned trip move the party, the start date and the flight ranking; the booked answer, where from and the guide answers change nothing on a trip already planned (T675-a).

### Rollback procedure

`git revert 2ca3060 41117b9` in the app.

---

## T676: end check and its fixes

### Task ID

T676

### Date

2026-10-24

### What changed

The end check in the header found five faults, fixed in one commit:

- The free field's countries ("a week in Croatia") were read and then dropped. They are now picked on Where, up to three, unless the engine already holds a pick.
- "Let Carta plan them" opened the day's places browser under the AI plan; it now opens the day.
- The overview's total and parts now show cents, as receipts do.
- Compare now fits three countries on a desktop.
- The step bar now animates by transform.

### Files touched

**Modified:** `src/planner/flow/QuestionScreen.jsx`, `src/planner/DayPlannerTab.jsx`, `src/planner/days/TripDaysOverview.jsx`, `src/planner/wizard/WizardChrome.jsx`, `src/styles/86-plan-flow.css`

### Commands run

The end-check builds and runs in the header; the root mirror with `git diff --binary b39e08a HEAD` applied with `git apply --directory=continent-app`.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before (batch 1 end) | After | Delta |
|---|---|---|---|
| node tests | 744, 700 pass | 769, 725 pass (the same 3 fail in every worktree) | +25 |
| browser checks against mocks | 0 | 32 per width | +32 |
| design-lint findings | 29 | 29 | 0 |
| css-routes problems | 4 | 4 | 0 |
| impeccable detect findings, changed files | 0 | 0 (1 found, fixed) | 0 |
| `86-plan-flow.css` raw size, in the first paint | 19,548 B | 35,718 B | +16,170 B |
| strings | | 92 keys in each of six languages | +92 |

### What broke and how it was fixed

The five faults above.

### What is still open

The owner reviews both batches on a preview, then merges and deploys (T676-a). On that preview, check real flight figures in compare and on a planned trip (T676-b). The plan-flow CSS has grown in the first paint, row T654-b.

### Rollback procedure

`git revert 8bddc71` in the app. For the whole batch: drop or revert app `p15-day-planner` back to b39e08a and root `p15-day-planner` back to d47dc79d8. Nothing reached production.

---

## Register rows

Closed by this batch: T653-a, T656-a, T656-b, T656-c, T656-d, T657-b, T658-a, T659-a, T660-b, T660-d. Raised: T671-a, T673-a, T675-a, T676-a, T676-b. T658-b stays open: child ages and slower walkers now shape the day ideas and the AI plans, but pricing still has no use for the ages.
