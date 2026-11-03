# Plan flow v3: shared brief for every batch agent

The owner approved the plan and asked (2026-10-29, late evening) for all seven batches to run one after
another, unattended, overnight. You run one batch. Read this whole file, then
`Execution/P15/_PLAN-plan-flow-v3.md` (the tasks, the owner's marks, the order), then CLAUDE.md's
"Batches" section (it is loaded for you, follow it exactly), then PRODUCT.md, DESIGN.md and the
carta-design skill (`.claude/skills/carta-design/SKILL.md`). For every screen you change, load the
`impeccable` skill and apply it inside carta-design's rules (carta-design wins on any conflict).

## Hard rules

- Nobody is awake to answer. Never wait for the owner. A product question with no written rule: take the
  most conservative choice that matches the plan and the marks, build it, and record the call as a register
  row owned by `user` so the owner can overturn it.
- No push, no deploy, no merge into `master` or `main`. The owner decides that in the morning.
- No Claude or Anthropic API. The Gemini parse-trip function is out of scope ("later").
- No em dashes or en dashes anywhere (code strings, docs, reports, commit messages). No middots. Plain words.
- Never `git stash`. Never `git checkout` an older branch in the root repo (it rewrites `continent-app/` to an
  older mirror). In the root only ever `git checkout -b <new>` from the current HEAD.
- Do not touch or commit unrelated dirty files in the root: `data/derived/freshness_report.json`,
  `infra/hetzner/**`, `.wrangler/`, `cache/**`, `impeccable/`, `Execution/_queue/**`,
  `supabase/diagnostics/**`. Stage by explicit path, never `git add -A` or `git add .`.
- Six languages for every new string (`src/i18n/*.js`, keys added in all six). Grep en.js, never read it whole;
  same for `styles.css`.
- Money only through `formatMoney` / `<Money>`; no euro sign in strings or JSX.

## Repos and branches

Two git repos: the root (`Travel App`, branch `main`) and `continent-app/` (its own repo, branch `master`).
The root also tracks a mirror copy of `continent-app/**` (the same files on disk). Batches stack:

| Batch | Tasks | Branch (both repos) | Starts from |
|---|---|---|---|
| A | T855 to T856 | `p15-plan-flow-v3-a` | root `main`, app `master` |
| B | T857 to T859 | `p15-plan-flow-v3-b` | the A branch |
| C | T860 to T862 | `p15-plan-flow-v3-c` | the B branch |
| D | T863 to T866 | `p15-plan-flow-v3-d` | the C branch |
| E | T867 to T869 | `p15-plan-flow-v3-e` | the D branch |
| F | T870 to T873 | `p15-plan-flow-v3-f` | the E branch |
| G | T874 | `p15-plan-flow-v3-g` | the F branch |

Before starting, confirm both repos are on the previous batch's branch (or main/master for A) with that
batch's work committed. In `continent-app/` commit each task as its own commit(s), message starting
`T{n}:`, ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. At the end of the
batch, sync the root mirror once: in the root, stage the `continent-app/` paths that differ (`git status
--short continent-app`), commit `T{first}-T{last}: sync plan flow v3 Batch X from continent-app <branch> (<sha>)`.
At root `main` today some `continent-app/` mirror files already differ from the root HEAD because app
`master` is ahead of the mirror; including them in Batch A's sync commit is expected, say so in the report.
Then the report and register in one more root commit.

The task numbers are reserved: T855 to T874. Do not take others. If a batch needs an extra task (a fix found
in the end check), note it under the task that caused it rather than adding a number.

## Checks

- Per task: eslint on touched files (`npx eslint <files>` in continent-app), `npm test` (node unit tests,
  baseline 1029 of 1029 passing on app master d195640; if a pre-existing failure shows, check it fails on
  the parent branch too and say so).
- New logic gets node unit tests under `continent-app/tests/` (`*.test.mjs`, see existing ones).
- One end check per batch in a browser on the built app, phone (375 wide) and desktop (1440 wide), on every
  screen the batch touched. The dev server's dependency scan hangs, so build NOPUBLIC (an outside vite
  config with `publicDir: false`, pattern in `../wt/vite.t474.mjs` and `../wt/vite.t835.mjs`; about 10 s) and
  serve it with the data via `node Execution/P15/T840-T843-walk/serve-a.mjs <dist> continent-app/public <port>`
  (pick a free port 58xx). Drive it with a Playwright script under `Execution/P15/T{first}-T{last}-walk/`
  (see `Execution/P15/T840-T843-walk/walk-b.mjs` for the pattern; `serviceWorkers: 'block'`). DOM checks
  over screenshots; one screenshot per touched screen and width, saved in the walk folder. Use the Claude
  browser tools only if Playwright cannot do it.
- `node scripts/ci/design-lint.mjs` shows no new violations on touched files.
- Run the carta-design seven questions on the batch diff and write the answers in the report.

## Report and register

One report per batch: `Execution/P15/T{first}-T{last}-plan-flow-v3-{slug}.md`, shared header then a section per
task with the `_TEMPLATE.md` headings (What changed, Files touched, Commands run, What broke, What is still
open, Rollback, Measurements or "Not measured"). One `Execution/_OPEN.md` row per open item (`T857-a`), and
change `Status` to `closed by T{n}` on any earlier row the batch closes (the plan names them). Finish by
appending three lines to `Execution/P15/_RUN-plan-flow-v3.md` (create it if missing): batch, branch shas
(root and app), npm test result, end check result, the `user` rows raised.

## What the code audit found (2026-10-29, paths under continent-app/src)

Screens in order: Plan home `planner/flow/PlanHome.jsx` (in `flow/PlanFlow.jsx`, mounted from
`App.jsx:1949`); "What do you want to plan?" `KindSheet` `PlanFlow.jsx:290`; setup questions
(`flow/flowGraph.js:27`: tell, booked, who, sleep, priority, when, from, create) via `flow/QuestionScreen.jsx`
and `flow/setupScreens.jsx`; Trip home `TripHome` in `flow/TripFlow.jsx:238`; doors `TripFlow.jsx:161`;
Help me choose `TripFlow.jsx:203` (questions `flow/questions.js:54-111`: g:shape, g:likes, g:weather,
g:reach, g:avoid, g:budget, g:pick); loader `finder/FindingTrips.jsx`; results `finder/TripsForYou.jsx`,
`finder/TripCard.jsx`, CSS `styles/87-trip-finder.css`; preview `finder/TripPreview.jsx`; "Plan this trip"
calls `planOf(trip)` then `TripFlow.startEngine('guide', settings, plan)` (`TripFlow.jsx:67-95`); the wizard
`GuidedTripWizard.jsx` via `renderWizard` (`TripPlannerTab.jsx:940`), steps in `planner/wizard/*`
(`engineScreens` `flowGraph.js:65`, labels `wizard/wizardSteps.js:16`, top bar `wizard/WizardChrome.jsx`);
Getting there `wizard/StepGettingThere.jsx` -> `TravelLegsSection.jsx` -> `LegCard`; Review
`wizard/StepReview.jsx:109`; finish `GuidedTripWizard.jsx:1083` -> `handleWizardComplete`
(`TripPlannerTab.jsx:381`) -> view 'summary' -> `TripSummary.jsx` (trip page v4: overview, itinerary, costs,
days; Change flight, Swap city, stay type per stop already exist there).

State: trip settings in `plannerStore.settings` via `useTripSettings` (`flow/flowHooks.js:15`), mirrored by
`draftPatch` / `fromDraft` (`flow/tripSettings.js:344-410`). Stay type, spend and way of travel are app-wide
in `firstRun.choices.stay_tier / lifestyle / transport_mode`. Origin airport `choices.origin`, set by `setFrom`
(`App.jsx:1219`). Finder to planner via `plannerStore.wizard.finder` (`draftFor` in `finder/handoff.js:57`,
the plan from `finder/planOf.js`). Device trips `tripsStore.js`.

Breaks:
1. Tell Carta (`TellBody`, `flow/QuestionScreen.jsx:79-181`): `prefillFromText` (`flow/prefill.js:90`) is a
   word match (who, priority, booked, months, nights, likes, country names); origin and budget not parsed;
   `lib/ask/intent.js:254` parseIntent (reads origin, budget, days, places) unused. Filled screens are
   skipped silently (`PlanFlow.next`, `PlanFlow.jsx:60-67`), the counter jumps (line 165). Countries written
   only when `wizard.countries` is empty (line 120). Help me choose ignores them
   (`lib/recommend/candidates.js:265` ranks from quizAnswers only); `draftFor` overwrites countries. Stale
   `settings.answered` beats the text (line 115); `tripsStore.startNew()` only when a trip is active
   (`PlanFlow.jsx:88`).
2. Origin: `nearestOrigin` (`lib/origins.js:99`) = one straight-line airport from `meta.origins`; finder
   `originOf` (`finder/finderHooks.js:48`) and `loadFlightFile(origin.iata)` (line 178) use only it.
   `nearbyAirports` (`lib/wizardTransit.js:83`, 6 within 200 km) feeds only `wizard/OriginCard.jsx`, whose
   `depIata` (`GuidedTripWizard.jsx:611-620`) changes links, not prices (`lib/price/trip.js:218` uses
   `anchorOrigin || selected_origin`). Airport coordinates: repo-root `data/flights/_airports.json`, shipped as
   `meta.origins`.
3. Stays: `lib/sleepGroups.js:17` (hostel, home, hotel), tiers `lib/stayPrice.js:41` STAY_TIERS,
   `offeredStayTiers` `lib/runtime_pricing.js:183`, links `buildAccommodationLink` `runtime_pricing.js:475`.
   Pipeline: `pipeline/stays/build_stays.py` kinds dorm, private, apt, hotel2-5, bnb_home, bnb_room.
4. Getting there: leg mode defaults only from `travelValues` or `cartaFlight` (`TravelLegsSection.jsx:122`),
   never `choices.transport_mode`; `OriginCard` asks the origin again.
5. Review "Add your fare": finder flight slot (`lib/recommend/adapters/flight.js:96-115`) falls back to
   `nearLegs` (nearest swept days); `planOf.liveFlightsOf` (`planOf.js:15-31`) hands over only
   `source === 'live'`; planner `cartaFlight` (`lib/price/trip.js:212-251`) looks only at exact dates. Also
   finder uses `trip.gateway.iata`, planner the routed `in_from_id` anchor.
6. Stepper shows Where and Stay after the finder (`handoff.js:28`).
7. Levers: `LEVER_GROUPS` `TripsForYou.jsx:24`, rendered 294-307, state `useLevers` (`finderHooks.js:79-107`),
   `settings.guide.levers`, `LEVER_VALUES` `tripSettings.js:58`.

Gotchas from earlier batches: a new lazy module that imports the flight loader or SheetShell can split into
preloaded chunks (37 to 39 preloads); hand loaders in or re-export through the FindingTrips chunk
(memory: rolldown split). Line endings: TripItinerary.jsx, useTripPlanner.js, Icons.jsx, shareLink.js are
CRLF; add them with `git -c core.autocrlf=false add` and check `git show --stat`. Disk is tight on C:;
delete build output folders you create when done.

## Your final message

Under 300 words: branches and shas, what each task did, npm test and end check results, `user` rows raised,
anything the next batch must know. Be exact; the orchestrator verifies your claims.
