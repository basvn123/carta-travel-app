# T855 to T856: plan flow v3 Batch A, carry every answer

## Shared header

**Date.** 2026-10-30 (overnight run, started 2026-10-29).

**Ask.** The owner approved plan flow v3 and asked for all seven batches to run unattended overnight
(`Execution/P15/_BRIEF-plan-flow-v3.md`, `Execution/P15/_PLAN-plan-flow-v3.md`, Batch A).

**Branches.** `p15-plan-flow-v3-a` in both repos. App: from master `d195640`, five commits, head `a46b6db`.
Root: from main `d392962b9`, the sync commit `f43ed8b7a` and the report commit.

| App commit | Task |
|---|---|
| `99c8cb9` | T855 the finder's priced flight survives the hand-over |
| `2f35156` | T856 a new plan starts clean; the way of travel seeds every leg |
| `b76f367` | T856 the origin card names the airport the trip is priced from |
| `a765931` | T855 Getting there names a handed-over flight's own day |
| `a46b6db` | T855 Review's route names a handed-over flight's own day |

**Root sync.** The brief expected app master to be ahead of the root mirror on some files
(`verify_planner_t8.mjs`, `SavedTripsPanel.jsx`, `SavedJourneys.jsx`, `journeySaves.js`, `draftState.js`,
`AutoPlanBar.css`, `CartaTrips.jsx`, `draftState.test.mjs`). They showed as modified only by their file
stamps and line endings: `git add` found no content change, so the sync commit carries the batch's 14 files
and nothing else.

**Checks.** `npm test` 1039 of 1039 (baseline 1029 on master `d195640`, plus 5 new tests per task). ESLint clean
on every touched file. `node scripts/ci/design-lint.mjs` reports 172 violations outside the baseline, all in
files this batch did not touch (the same list on master); none on a touched file. No dashes or middots in
the diff.

**End check.** One NOPUBLIC build per side (`wt/vite.t855.mjs`, about 10 s): before = app master
`d195640` (`wt/dist-t855-base`), after = `a46b6db` (`wt/dist-t855-after`), each served with `public/` by
`serve-a.mjs` on 5855 and 5856. Playwright walk `Execution/P15/T855-T856-walk/walk-a.mjs`, service workers
blocked, the T795 sweep fixture on `flights/BRU.json` and the live search failing (503, the localhost case
of row T802-c). At 1440 and 375: Plan home, the trip's page, Help me choose, Trips for you, the preview,
Plan this trip, Getting there, Review, Finish, the trip page (Overview, Itinerary); Start planning over a
stale draft, Tell Carta, the setup to the trip's page. After: 37 of 37 checks pass, no console errors
(`after/walk.json`). Before: 17 of 37 (`before/walk.json`), every failure one of the bugs this batch fixes.
Screenshots per screen and width are in `T855-T856-walk/after/` and `before/` (not committed, as in the
earlier P15 walks). Module preloads 36 before and after.

**Carta-design seven questions** (the diff changes two lines of text in existing components and no
style): 1. no hex. 2. no colour, no gradient. 3. no brown, yellow or danger use changed. 4. no figure added;
money still through `Money`. 5. no button added, no text on a photo. 6. no headline added; no dashes,
middots or banned words. 7. nothing added to remove: the flight row's day replaces nothing, it is only shown
when it differs from the leg's own day. No layout changed, so no separate impeccable pass was run.

---

## T855: the finder's priced flight survives the hand-over

### What changed

A trip-finder card priced its flight three ways: Google Flights' sweep for the exact days, a live flight the
traveller took in the picker, or (when the sweep had no fare for the exact day, and on a localhost build
where the live search fails) the swept day nearest each trip day, within `flights.nearest_day_spread`
(4 days). Only the live legs were handed to the planner, and the planner looked each day up again, so a
nearest-day fare vanished: Review said "Add your fare" twice and the planner's total dropped by the flight
(Český Krumlov and Prague, 5 to 12 December: card 951 a person, Review and trip page 1,452.22 for two
instead of 1,902). Now `planOf` hands every leg the card priced (`plan.flights`, `flightsOf`), each in the
planner's pick shape: from, to, `date` (the trip day it stands for), `flightDate` (its own day when that is
another), the fare, airline, times, stops, check time and source. `planState` carries them as
`handedFlights`. `quoteTrip`'s cartaFlight prices a held leg for a direction before the exact-day lookup
(`heldLeg`): the traveller's pick first, else the finder's leg, while the trip day and the home airport are
the ones it was priced for, and while it fits the flight hours and preferences. A held leg also sets the
airport the planner flies into or home from, which reconciles the finder's `trip.gateway.iata` with the
routed `in_from_id` anchor when they differ. The planned trip (useTripPlanner) prices its `flightPicks` the
same way, so after Finish the trip page holds the same flight on its own day. Getting there's flight row
and Review's route name the flight's own day when it differs from the leg's, and View on Google Flights
searches that day.

### Files touched

**Modified:**
- `continent-app/src/lib/price/trip.js` (heldLeg, heldAsLeg; cartaFlight reads them first)
- `continent-app/src/planner/finder/planOf.js` (flightsOf, `plan.flights`)
- `continent-app/src/planner/finder/handoff.js` (planState carries `handedFlights`)
- `continent-app/src/planner/GuidedTripWizard.jsx` (a Getting there pick rides as `flightPicks` ahead of the finder's leg; pricedFlight keeps `flightDate`)
- `continent-app/src/hooks/useTripPlanner.js` (tripState carries `flightPicks`)
- `continent-app/src/planner/TravelLegsSection.jsx` (the flight row's own day, the link's day)
- `continent-app/src/planner/wizard/StepReview.jsx` (the route row's own day)

**Created:**
- `continent-app/tests/finderFlightHold.test.mjs` (5 tests)

The brief named `planOf.js` and `trip.js`; the wizard, the planned trip, Getting there and Review are where
the handed leg is read, so they are in scope as the hand-over's own path. `liveFlightsOf` is unchanged (it
still feeds the finder's own reprice); the new `flightsOf` sits beside it.

### Commands run

```
npx eslint <touched files>
node --test tests/finderFlightHold.test.mjs
npm test
PF_OUT=.../wt/dist-t855-base  node node_modules/vite/bin/vite.js build --config ../../wt/vite.t855.mjs   (on app master)
PF_OUT=.../wt/dist-t855-after node node_modules/vite/bin/vite.js build --config ../../wt/vite.t855.mjs
node Execution/P15/T840-T843-walk/serve-a.mjs <dist> continent-app/public 5855|5856
node Execution/P15/T855-T856-walk/walk-a.mjs 5855 before ; ... 5856 after
WIDTHS=1440 PICK=Hallstatt WHEN=2026-11-21,2026-11-28 TRIPS=1 node walk-a.mjs 5855|5856 nov-before|nov-after
```

### Measurements

The card's total against the planner's, on the end-check builds, 1440 wide, 5 to 12 December from BRU, two
adults, live search failing. Group totals in euros; the card shows whole euros a person.

| Card | Card | Before: Review / trip page | After: Review / trip page |
|---|---|---|---|
| Český Krumlov and Prague (flight) | 951 a person (1,902) | 1,452.22 / 1,452.22, Add your fare x2 | 1,902.22 / 1,902.22 |
| Lake Bled and Ljubljana (flight) | 1,017 (2,034) | 1,593.72 / 1,593.72, Add your fare x2 | 2,035.72 / 2,035.72 |
| Hallstatt and Salzburg (flight) | 1,032 (2,064) | 1,571.60 / 1,571.60, Add your fare x2 | 2,063.60 / 2,063.60 |
| Lake District and Ripon (no fare on the card) | 863 (1,726) | 1,728.68 / 1,728.68 | 1,728.68 / 1,728.68 |
| Lauterbrunnen and Bern (no fare on the card) | 1,487 (2,974) | 2,994.64 / 2,994.64 | 2,994.64 / 2,994.64 |
| Hallstatt and Salzburg, 21 to 28 Nov (exact-day fare) | 970 (1,940) | 1,939.20 / 1,939.20 | 1,939.20 / 1,939.20 |

Flight-priced cards matching the planner within the card's rounding: 1 of 4 before, 4 of 4 after (the 375 run
agrees on the two it walks). The two no-fare cards are unchanged and stay open as T855-b.

Node, the same fixture (`finderFlightHold.test.mjs` and a throwaway probe), a person: 5 to 12 December,
Austria 694.45 before against a card of 940.45, after 940.45; Slovenia 647.04 / 868.05; Czechia 532.63 /
757.63. 4 to 11 November (the home leg on a nearest day): Austria 867.45 / 1,009.45, Italy 1,181.93 /
1,289.93, Slovenia 787.05 / 929.05, Czechia 738.63 / 892.63, Switzerland 1,552.87 / 1,660.87. After: every one
equals its card to the cent.

### Row T802-c

Closed by this batch, with evidence. Augsburg and Neuschwanstein is no longer among the finder's results for
these answers on today's data (checked for 3, 7, 14 and 21 November and 5 December), so it was not walked by
name. The row's symptom (the planner a flight below the card, in the browser only, with the live search
failing, while the node test passes) has two browser-only causes, both fixed: the card's fare on the swept day
nearest the trip's never reached the planner (this task), and Getting there guessed the way out by straight
distance, so a trip under 700 km from home (Augsburg is about 560 km from Brussels) opened on the train and
dropped the flight the card was priced on (T856, `flown`). The node test hands over exact-day fares and
never runs the leg guess, which is why it passed. The walk's before and after runs show the same symptom
gone on the three flight-priced cards.

### What broke

Nothing in the end check. During the walk, Review's route still said the trip's day (Sat 05 Dec) for a flight
priced on Wed 09 Dec while Getting there and the trip page said Wed 09 Dec; fixed on the batch branch in
`a46b6db`.

### What is still open

- T855-a (user): the finder prices a flight up to 4 days from the trip's day and the planner now keeps it and
  names its day, but the stays still start on the trip's day (Český Krumlov: 4 nights from Sat 05 Dec, flight
  Wed 09 Dec). Decide whether such a trip moves its dates to the flight or the finder prices exact days only.
- T855-b: the two cards priced without a flight land 1.34 and 10.32 a person above the card in the planner,
  the same before and after; the planner prices a train there and home (the distance guess) the card does not.
- T855-c: Getting there's open-jaw hint ("Fly into LNZ, home from PRG") names catalogue airports, not the
  flight the trip is priced on (BRU to PRG).

### Rollback

`git -C continent-app revert a46b6db a765931 99c8cb9` (the T855 commits; independent of T856's), then sync the
root mirror. The plan keeps working without `plan.flights` (older drafts have none).

---

## T856: a new plan starts clean; the way of travel seeds every leg

### What changed

Start planning on the Plan home started a new device trip only when the open one was listed, and a draft with
answers but no trip made is never listed, so its `settings.answered` stayed and Tell Carta's words could not
replace those answers (a family of four typed after an old draft's couple stayed a couple; before: "2
adults"). Start planning now always starts a new trip (`tripsStore.startNew`, which keeps a trip with anything
in it in the list and clears an empty one). Tell Carta's guard still keeps a screen's answer, but words typed
again replace the answers the earlier words gave (`screenAnswered`, from `settings.note`). Getting there's leg
guess (`prefillMode`) now reads the way of travel (`choices.transport_mode`): a plane flies there and home, a
train, a coach or the car answers every leg (a train where there is no railway falls through to the distance
rules), and a trip-finder trip priced on a flight flies there and home whatever the way or distance
(`flown`). The guess is written into the leg values the wizard prices, as before; a guess left in an older
draft is made again, an answer is kept. The brief's line in `TravelLegsSection.jsx:122` (the card's fallback
when a leg has no value) is not changed: every leg gets a value from the guess before it shows, and a
display-only default would show one mode while the total priced another. The origin card was already a
one-line "From Ghent (...)" with Change since T812; what still asked again was its airport, the one nearest
the town (ANR for Ghent) while the trip is priced from the app's origin (BRU). The line, the airport chips and
the flight links now default to the airport the trip is priced from; Change still opens the search and the
airports.

### Files touched

**Modified:**
- `continent-app/src/planner/flow/PlanFlow.jsx` (Start planning always starts a new trip)
- `continent-app/src/planner/flow/QuestionScreen.jsx` (the words' guard reads screenAnswered)
- `continent-app/src/planner/flow/prefill.js` (screenAnswered)
- `continent-app/src/lib/gettingThere.js` (prefillMode way and flown, wayLegMode)
- `continent-app/src/planner/GuidedTripWizard.jsx` (the guess reads the way and the finder's flight; homeIata)
- `continent-app/src/planner/wizard/OriginCard.jsx` (homeIata)

**Created:**
- `continent-app/tests/planFlowFresh.test.mjs` (5 tests)

### Commands run

As T855 (one build and walk for the batch); `node --test tests/planFlowFresh.test.mjs`.

### Measurements

Not measured beyond the end check: before, Start planning over a stale draft then "A family of four with two
kids in July" gave a trip of 2 adults and the origin line read "From Ghent (ANR)"; after, 2 adults, 2
children and "From Ghent (BRU)", at 1440 and 375. With `?t=train` a finder trip still flies there and home and
the hop between its stops is a train.

### What broke

Nothing found. One thing to know: the earlier walks (`wt/pf2-end-walk.mjs`, `wt/t802-dbg4.mjs`) seeded answers
into an unlisted draft and then pressed Start planning; that seed is now cleared. Seed a trip with
`trip.created` and open it from the Plan home instead, as `walk-a.mjs` does.

### What is still open

- T856-a (user): call made without the owner: a finder card priced on a flight flies there and home even when
  the way of travel is train, coach or car (the card's price wins).
- T856-b (user): call made without the owner: a way of coach or car seeds the legs there and home at any
  distance (a coach to Lisbon); only a train with no railway falls back.
- T856-c: words typed again replace every answer the earlier words gave, also one a screen later confirmed;
  T857's parser should keep the source of each answer.

### Rollback

`git -C continent-app revert b76f367 2f35156`, then sync the root mirror. No stored data changes shape.
