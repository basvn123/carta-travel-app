# T653 to T660: the trip planner flow (batch 1 of the planner rebuild)

## Shared header

**Batch.** Batch 1 of the owner's planner rebuild (plan approved 2026-10-24, `C:\Users\Gebruiker\.claude\plans\async-forging-shore.md`), built from the owner's Carta Planner Board (claude.ai artifact XGWMhPogX9dBb7jW6URXAA: 14 references, 5 briefs) and the chat brief. Batch 2 (the day planner) follows on top. T661 to T666 belong to the price engine batch PB1 (agreed with that session); this batch keeps T653 to T660.

**Owner decisions taken for this batch (2026-10-24).** "/embeddable" meant impeccable. Trip first, then day. The new flow replaces the guided wizard as the first screen (drafts migrate). Follow the Carta colours but mimic the screenshots as closely as possible. Opening line: "Hey, I'm Carta. Tell me how you like to travel and I'll plan the whole trip, with what every day costs." Invites: a link, an account only to join. Past trip: small, the existing form. No hyphen as a separator, ranges use "to".

**What the batch is.** The Plan place now opens on a Mindtrip style opening (the mark, the line, Start planning), then the Polarsteps trip-kind sheet, then one question per screen on a white sheet over a map: tell Carta about the trip (free words and booking files, Layla's prompt box), what is booked, who is going, how you sleep and spend, what matters most, when, from where; then Create trip (the Polarsteps new trip screen). The trip's own page (the Polarsteps trip view) offers Start planning: help me choose (shape, photo tiles, weather, reach, avoid, budget), I know where, or a ready trip, after which the existing wizard runs as the planning engine with only its planning steps. Every answer lives in one trip settings object behind a gear. The price card reads like Airbnb's price box, flights are ranked by what matters most, and a finished trip asks Plan your days? with the day rhythm questions.

**Branches.** App: `p15-trip-planner-flow` (from master e957929) in worktree `wt/p15-plan-flow-app`, ten commits 3b3fed4 to b39e08a. Root: `p15-trip-planner-flow` (from main 2f32807b4) in worktree `wt/p15-plan-flow-root`, mirror commit 8837452d7 and this report. Nothing merged, pushed or deployed.

**Models.** The batch ran on Opus 5.5 in one session; these task numbers have no mind map note for `task_model.py`.

**Static checks per task.** eslint on touched files (no new warnings; the remaining ones exist on master), `npm test` (731 tests at the start, 744 at the end; the same three numbers-page tests fail in every worktree, no `public/boot.json`), the fast NOPUBLIC build (`wt/vite.t653.mjs`), `scripts/css-routes.mjs --check` (4 problems, the same 4 items-sheet findings master has), `scripts/ci/design-lint.mjs` (29 findings, the same 29 as master), and `impeccable detect --json` on the changed planner files (no findings).

**End check.** One browser round on the merged batch build, served by `wt/t660-serve.mjs` (the build plus the main checkout's `public/`), Playwright at 390 x 844, 820 x 900 and 1280 x 900. Pass 1 (`flow1.mjs`) walks a couple with the free field "A week in Portugal with my partner in May, beaches and good food" from the opening through every question, Create trip, the trip page, the settings sheet, help me choose, the engine's Where (matches shown at once), Stay, Getting there, Review, Plan my trip, Plan your days? with all six rhythm questions and who plans them, into the day planner. Pass 2 (`flow2.mjs`) walks flights booked (no When or From in setup, no reach in the guide, the engine opens on From), stays booked (no doors, the engine opens on Your stays), a ready trip with a settings change on the way (the change holds), I'm on a trip now (the day planner), and Add a past trip (My trips on the past-trip form). Result after the fixes under T660: every path passes at all three widths; no page error, no horizontal overflow, no raw key, no dash or middot in page text. Console noise: the data host refuses localhost (CORS on `flights/_index.json`) and local 404s for `/api/*`. Screenshots and both scripts are in the session scratchpad, not committed.

**carta-design, the seven questions.** (1) No hex outside the tokens: every colour in `86-plan-flow.css` and the ChoiceRows rules is a token. (2) No gradient, no unlisted colour; the cost bar uses the `--kind-*` ramp. (3) Brown only acts or is selected: the primary, links, the selected rows and tiles (tint plus a filled mark or tick); the budget over line is `--amber-ink`. (4) Nothing under 11 px, tabular figures by body default, every euro through formatMoney or formatEst. (5) One primary per screen (Continue, Create trip, Start planning, Plan my trip); no text on a photograph (tile names and credits sit under the photos). (6) Headlines are questions or the trip's name; no em dash, middot or banned word (the lint caught "Just me", now "On my own"). (7) Removed: the Plan and Track switch of Polarsteps (Carta does not track), the handwritten "plan your adventure" arrow, a second door to the old tiles.

---

## T653: trip settings, flow graph, questions as data

### Task ID

T653

### Date

2026-10-24

### What changed

One settings object now holds every planner answer (`planner/flow/tripSettings.js`): what is booked (flights, stays, car, tickets), the party (kind, adults, children with ages 3 to 11, babies, slower walkers), what matters most (price, balance, comfort), when (exact, months, any, not sure, nights), from, the help-me-choose answers, the day rhythm, the trip (name, visibility, cover, buddies, created) and later the free note, imported bookings and who plans the days. It is stored in the plannerStore draft as `settings`, read back from an old wizard draft (`fromDraft`), and written into the draft fields the planning engine reads on mount (`draftPatch`). Sleep and spend are not copied: they stay the app-wide `stay_tier` and `lifestyle`. `flowGraph.js` decides the screen list per booking path; `questions.js` holds the one-question screens as data.

### Files touched

**Created:** `continent-app/src/planner/flow/tripSettings.js`, `flowGraph.js`, `questions.js`; `continent-app/tests/tripSettings.test.mjs`, `flowGraph.test.mjs`.

### Commands run

`node --test tests/tripSettings.test.mjs tests/flowGraph.test.mjs`, `npx eslint src/planner/flow`.

### Config and secrets set

None.

### Before/after measurements

Not measured (logic module; 21 node tests at commit, 33 by the end of the batch).

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| An imported booking with no price read as 0 euros | `Number(null)` is 0 on the second normalisation | null and empty are "not printed" (T654) |

### What is still open

A date changed inside the engine (the wizard's own When) is not written back into the trip settings, so the gear can show the setup answer while the trip runs on the wizard's dates (T653-a).

### Rollback procedure

`git revert 3b3fed4` in the app repo; the files are new and nothing else reads them without the later commits.

---

## T654: Plan home, the trip-kind sheet, the free field with booking upload

### Task ID

T654

### Date

2026-10-24

### What changed

The Plan place with nothing open is `PlanFlow` (lazy): the Carta compass mark, the opening line and Start planning, after Mindtrip's assistant screen, over a map of Europe; Start planning opens the Polarsteps trip-kind sheet (A new trip, I'm on a trip now, Continue and Cancel stacked, Add a past trip small below). A new trip opens Tell Carta about your trip, Layla's prompt box: the words fill the questions they answer (`prefill.js`, a plain word match in six languages: party, months, length, priority, booked, likes, countries) and Add a booking reads files through parse-booking (behind the pass, as MagicImportZone does) to set what is booked and the dates. `PlanStage` lays every step on a white sheet over the map: risen from the bottom on a phone, a card on the left from 769 px. New kit piece `ChoiceRows` (the Polarsteps answer rows), `SettingsIcon`.

### Files touched

**Created:** `continent-app/src/planner/flow/PlanFlow.jsx`, `PlanStage.jsx`, `prefill.js`, `setupScreens.jsx` (stub); `continent-app/src/components/ui/ChoiceRows.jsx`; `continent-app/src/styles/86-plan-flow.css`; `continent-app/tests/planPrefill.test.mjs`.
**Modified:** `continent-app/src/App.jsx` (PlanFlow lazy, replacing PlanStart and PlanAsk), `src/components/Icons.jsx`, `src/components/ui/index.js`, `src/styles.css`, `src/styles/04-ui.css`, `scripts/css-routes.mjs` (PlanFlow joins the planners family roots), the six i18n files (28 keys), `planner/flow/tripSettings.js`, `flowGraph.js`, `questions.js`.

### Commands run

`npm test`; `PF_OUT=<scratch>/dist-base PF_ROOT=<main app> npx vite build --config ../vite.t653.mjs` (baseline) and the same on the branch; `node scripts/css-routes.mjs --check <dist>/assets`; `node scripts/ci/design-lint.mjs`.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before (master e957929) | After (batch end) | Delta |
|---|---|---|---|
| Entry JS, index-*.js, bytes | 873,460 | 863,379 | -10,081 |
| Entry CSS, index-*.css, bytes | 786,308 | 800,826 | +14,518 |
| TripPlannerTab chunk, bytes | 251,361 | 246,820 | -4,541 |
| DayPlannerTab chunk, bytes | 256,592 | 256,419 | -173 |
| PlanFlow chunk, bytes | none | 4,814 (the flow's shared code rides with the planner chunks) | new |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| css-routes: no global sheet for planners/27-plan-flow.css | route sheets must mirror a global sheet | the flow's rules live in the global `86-plan-flow.css` |
| css-routes: dozens of route rules "load after" the flow's rules | a universal `.pf-map > *` and single-class rules in a sheet before the held sheets | scoped selectors; rules kept global (+14.5 KB entry CSS, row T654-b) |
| design-lint: raw-button on the answer rows | a `<button>` outside `components/ui` | the rows became the kit's ChoiceRows |
| design-lint: outline-none on the heading and the prompt field | outline removed without a replacement | heading rule dropped; the prompt box's brown edge is the focus mark |

### What is still open

ChoiceRows is not yet in the carta-design kit list or the style guide page (T654-a). The flow's CSS sits in the first paint, 14.5 KB, because the route split's proof refuses it (T654-b).

### Rollback procedure

`git revert 087d6b1` in the app repo (PlanStart returns as long as T660's deletion is reverted first).

---

## T655: setup questions, Create trip, trip settings

### Task ID

T655

### Date

2026-10-24

### What changed

Who (party kind rows, the steppers, a select per child for ages 3 to 11, slower walkers or a pram), How do you like to travel (the one Lifestyle control embedded: where you sleep and how you spend), What matters most, When (set dates on the two-end calendar, months as chips, any time cheapest wins, not sure, with nights) and Where from (the app's FromPanel). Each writes the app-wide value it shares with Explore (people, dates, From, Lifestyle), so a place costs the same on Explore and in the planner. Create trip follows the Polarsteps new trip screen: a grey head with Choose a cover photo (twelve well rated catalogue photographs), the dates card (start, arrow, end, or when and how long), the name, travel buddies by first name (the link to plan together goes out once the trip is saved), and who can see it. The gear opens Trip settings: every answer grouped (the basics, what you're looking for, your days), each row reopening its own question on the sheet with Save.

### Files touched

**Created:** `continent-app/src/planner/flow/QuestionScreen.jsx`, `TripSettingsSheet.jsx`, `flowHooks.js`.
**Modified:** `planner/flow/setupScreens.jsx`, `PlanFlow.jsx`, `tripSettings.js`, `src/styles/86-plan-flow.css`, the six i18n files (85 keys), `tests/tripSettings.test.mjs`.

### Commands run

As T654.

### Config and secrets set

None.

### Before/after measurements

Not measured (screens).

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Fast refresh warnings on five exports | hooks and helpers exported beside components | moved to `flowHooks.js`; the custom screen map moved into QuestionScreen.jsx |
| css-routes: `> :last-child`, `> .btn:first-child`, `.btn-icon` child rules | generic child selectors | own classes (`pf-create-end`, `pf-set-back`, `pf-ico`) |
| design-lint banned word in "Just me" | carta-design word list | "On my own" |

### What is still open

None beyond the batch rows.

### Rollback procedure

`git revert 756f305` in the app repo.

---

## T656: the trip page before a route, the doors, help me choose

### Task ID

T656

### Date

2026-10-24

### What changed

An empty trip planner now shows `TripFlow` instead of the inline wizard: the trip's page after the Polarsteps trip view (the name, a home dot with when it starts, "0 of 7 nights planned", three empty rows, Start planning, the gear), then How do you want to choose where? (help me choose, I know where I want to go, start from a ready trip; skipped when stays are booked), the help-me-choose questions (kind of trip, photo tiles of what you are up for, weather, how far, rather not, budget), and then the wizard as the engine: it takes only its planning steps from flowGraph (`flowSteps`), opens Where on the door's tab, and behind help me choose its quiz arrives answered from the guide, so the matches show at once. Back on the first planning step returns to the flow. A trip made in the flow keeps the Plan door on its page (`hasPlanOpen` reads `settings.trip.created`).

### Files touched

**Created:** `continent-app/src/planner/flow/TripFlow.jsx`, `guidePhotos.js`; `continent-app/tests/guidePhotos.test.mjs`.
**Modified:** `src/planner/TripPlannerTab.jsx`, `src/planner/GuidedTripWizard.jsx` (`flowSteps`, `initialWhereTab`), `src/planner/wizard/WizardChrome.jsx` (`onBackOut`), `src/App.jsx`, `planner/flow/setupScreens.jsx` (LikesScreen, BudgetScreen), `QuestionScreen.jsx`, `tripSettings.js` (quiz defaults, spendFor), CSS, the six i18n files (55 keys).

### Commands run

As T654.

### Config and secrets set

None.

### Before/after measurements

Not measured (screens; the end check walks every door).

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A guide that skipped reach or shape held the quiz unfolded | the Where quiz folds only with every answer set | quizAnswers fills the least narrowing answer |

### What is still open

The ready-trip door reads the trips layer only, not the journeys library (T656-a). Comparing up to three countries side by side was planned and not built; the match cards and the country brief remain (T656-b). The engine's steps (Where, Stay, Trips, Stays, Getting there, Review) still wear the old wizard chrome rather than the Polarsteps sheet (T656-c). A "Plan a trip here" seed still opens the whole old step list (T656-d).

### Rollback procedure

`git revert 44222ac` in the app repo; the inline wizard returns as the empty planner.

---

## T657: flights booked, stays booked, getting there by what matters most

### Task ID

T657

### Date

2026-10-24

### What changed

Live flights are picked in the order the trip settings ask for: `rankFlights` keeps the cheapest first for the lowest price, and for a good balance or comfort first adds a cost to each stop and to an early or late hour before comparing (35 and 25 euros a seat, 120 and 70), so a direct flight at a decent hour wins; `priceTrip` takes the new `flightRank` from the wizard and the planned trip alike. Behind booked flights the help-me-choose matches are measured from where the flight lands, within a short hop. A flight price read from an uploaded booking starts as the traveller's own figure for that way. "No flying" sets the train for the way there and home; the traveller types what it cost, with the booking links each leg already offers (Carta has no train or bus fares).

### Files touched

**Modified:** `continent-app/src/lib/flights/flights.js`, `src/lib/tripTotal.js`, `src/hooks/useTripPlanner.js`, `src/planner/GuidedTripWizard.jsx`, `src/planner/flow/TripFlow.jsx`, `tests/flights.test.mjs`.

### Commands run

`node --test tests/flights.test.mjs`, `npm test`.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After |
|---|---|---|
| Flight picked for a day with a 49 euro dawn flight with one stop and a 79 euro direct flight at 09:30, comfort first | the 49 euro flight | the 79 euro direct flight |
| Same day, lowest price | the 49 euro flight | the 49 euro flight |

### What broke and how it was fixed

No issues.

### What is still open

Matches behind booked flights use the straight-line short hop (1,100 km) from the arrival, not a ground travel time (T657-a). Stays read from uploaded bookings are kept in `settings.imports` but do not fill the Your stays rows yet (T657-b).

### Rollback procedure

`git revert afc5513` in the app repo; `rank` defaults to price, which is the old pick.

---

## T658: the price card after Airbnb's price box, plan your days

### Task ID

T658

### Date

2026-10-24

### What changed

PlanTotal, the one price card on every planner screen, reads like Airbnb's price box: "~€1,232.88 in total" as the underlined headline and the button that opens the lines, the figure a person and a person a day under it, dates, people and Lifestyle in a bordered grid, one grey note with how many prices are the traveller's own and how far under or over their budget the trip is (`budget.js`), and the stacked cost bar above the lines. A trip the new flow made asks Plan your days? once it is planned, then the day rhythm (mornings, pace, how planned, the goal, eating, getting around) and who plans the days, stored in the trip settings; the day planner's chat opens with that rhythm (start time, steps, food).

### Files touched

**Created:** `continent-app/src/planner/flow/DaysPrompt.jsx`, `budget.js`; `continent-app/tests/planBudget.test.mjs`.
**Modified:** `src/planner/PlanTotal.jsx`, `src/planner/TripPlannerTab.jsx`, `src/planner/DayPlannerTab.jsx` (12 lines), `tripSettings.js`, `src/styles/86-plan-flow.css`, `src/styles/67-v6-tripplanner.css` and `planners/67-v6-tripplanner.css` (the dead readiness bar rules), the six i18n files (41 keys).

### Commands run

As T654.

### Config and secrets set

None.

### Before/after measurements

Not measured (the figures are priceTrip's; the card only lays them out).

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The T658 commit carried all of DayPlannerTab.jsx | a Git Bash sed edit turned the CRLF file into LF and core.autocrlf committed it | commit 23f1db4 restores CRLF; the net change is 12 lines |
| css-routes: `.plan-ready` not planners-only | the readiness bar markup was replaced by the note | the dead rules removed |

### What is still open

"Let Carta plan the days" stores `daysHow` but opens the trip's first day like "I'll plan them myself"; starting the AI day plan from it belongs to batch 2 (T658-a). Child ages, slower walkers and the trip's goal are collected but not yet used by the pricing or the day plans (T658-b).

### Rollback procedure

`git revert 23f1db4 26628cb` in the app repo.

---

## T659: I'm on a trip now, Add a past trip

### Task ID

T659

### Date

2026-10-24

### What changed

The trip-kind sheet's second door opens What do you need on the road?: plan a day of a trip already in Carta, add the trip as it stands (the setup questions, with bookings read from files), or plan today right here; the first and last open the day planner, whose start offers the saved trips and Use my location. Add a past trip opens My trips on the Visited tab with the existing past-trip form, so there is one past trip record, not two.

### Files touched

**Modified:** `continent-app/src/planner/flow/PlanFlow.jsx`, `src/auth/SavedTripsPanel.jsx` (`startWithPast`), `src/App.jsx`, the six i18n files (7 keys).

### Commands run

As T654.

### Config and secrets set

None.

### Before/after measurements

Not measured.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Add a past trip opened My trips without the form | the form renders on the Visited tab only | the hand-off picks Visited first (T660 end check) |

### What is still open

"Add my trip as it is" runs the new trip questions; it does not yet ask where you are now and until when (T659-a).

### Rollback procedure

`git revert dc16f75` in the app repo.

---

## T660: retire PlanStart and PlanAsk, end check, report

### Task ID

T660

### Date

2026-10-24

### What changed

PlanStart and the retired PlanAsk are deleted with their `.plan-start` rules. The end check above ran, and its findings were fixed on the batch branch: the photo tiles are sized; the kinds that are a setting (beaches, island beaches, lakes, hiking, snow) show the best known beach, beach, lake and summits from the layer wires (Nissi beach, Navagio, Lake Como, Mount Olympus, Mont Blanc), each credited in one line under the grid with its author and licence; hidden-gem kinds ask for a catalogue hidden gem first and the other setting kinds skip big cities; the flow's page box is the trip planner screen's, so the desktop card no longer slides under the header and a long step scrolls on a phone; the free field's party and dates reach Explore's prices (`appSync.js`, shared with Who and When); Create trip names month and length plainly and says "Who can see it?".

### Files touched

**Deleted:** `continent-app/src/planner/PlanStart.jsx`, `src/planner/PlanAsk.jsx`.
**Created:** `continent-app/src/planner/flow/appSync.js`; `continent-app/tests/planAppSync.test.mjs`; `wt/t660-serve.mjs` (outside the repos, the end check's server).
**Modified:** `src/styles/60-v6-shell.css`, `86-plan-flow.css`, `planner/flow/guidePhotos.js`, `setupScreens.jsx`, `QuestionScreen.jsx`, `src/auth/SavedTripsPanel.jsx`, the six i18n files (4 keys), `tests/guidePhotos.test.mjs`. Root: this report, `Execution/_OPEN.md`.

### Commands run

`node wt/t660-serve.mjs <scratch>/dist-t660 5254`; `node flow1.mjs <out> 390,820,1280`; `node flow2.mjs <out> 390|820|1280`; `impeccable detect --json src/planner/flow src/components/ui/ChoiceRows.jsx src/styles/86-plan-flow.css src/planner/PlanTotal.jsx`; `git -C wt/p15-plan-flow-app diff --binary master..HEAD > wt/plan-flow.patch` and `git -C wt/p15-plan-flow-root apply --directory=continent-app wt/plan-flow.patch` (the mirror).

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After |
|---|---|---|
| node tests passing | 687 of 731 | 700 of 744 (3 fail in every worktree, as before) |
| design-lint findings | 29 | 29 |
| css-routes problems | 4 (items sheets) | 4 (the same) |
| impeccable detect findings on the changed planner files | | 0 |
| Strings added | | 220 keys in each of six languages |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Photo tiles drew 1 by 1 px | HeroImage leaves its box to the caller | sized in CSS |
| A city skyline under Beaches, a crowd under Quiet and hidden | fame-sorted catalogue rows | layer photos for setting kinds; hidden gems first |
| Desktop card slid under the header; a long step could not be scrolled on a phone | the stage sat at the top of the app box; the trip planner screen hides overflow | the trip planner screen's box with its own scrolling |
| A May trip from the free field priced Explore in November | only the When screen wrote the app-wide dates | appSync.js, called from the free field too |
| Add a past trip showed My trips without the form | the form lives on Visited | the hand-off picks Visited |
| While looking at candidate photos, five thumbnail downloads to Wikimedia carried the owner's email address in their User-Agent header | a script header written by me in the session | no further requests carried it; noted here and told to the owner |

### What is still open

The owner reviews the flow on a preview, then merges and deploys (T660-a). The end check could not exercise a booking upload (parse-booking needs a signed-in pass and the AI) or live flight rows (the data host refuses localhost) (T660-b). Out of scope from the research, for the owner to place: visas and entry rules, group voting, offline maps beyond the exports, currency (T660-c). Batch 2, the day planner rebuild, is next (T660-d).

### Rollback procedure

App: `git revert b39e08a 2abeb10` (or drop the branch: nothing is merged). Root: `git revert 8837452d7` and the report commit, or drop branch `p15-trip-planner-flow`. Nothing reached production.

---

## Register rows raised

T653-a, T654-a, T654-b, T656-a to T656-d, T657-a, T657-b, T658-a, T658-b, T659-a, T660-a to T660-d.
