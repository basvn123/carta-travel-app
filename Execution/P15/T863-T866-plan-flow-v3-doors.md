# T863 to T866: plan flow v3 Batch D, how much Carta plans

## Shared header

**Date.** 2026-10-30 (overnight run).

**Ask.** Plan flow v3 Batch D (`Execution/P15/_BRIEF-plan-flow-v3.md`, `Execution/P15/_PLAN-plan-flow-v3.md` section D). Owner's
marks: "How much to plan, four doors" Go, "More modern, icons, no subtext; each title clear on its own; every door's flow
built out in depth"; "Flight-first screen" Go, "Narrow it by the answers already given".

**Branches.** `p15-plan-flow-v3-d` in both repos, from the C heads. App: from `af96e17`, four commits, head `ebda863`.
Root: from `0c4ba3a0e` (`git checkout -b`), the sync commit `3ece322a5` and the report commit.

| App commit | Task |
|---|---|
| `c0b4c19` | T864 Find my flight first: the engine (`doorTrips.js`, with T865's `knowTrip`) and the screens (`DoorScreens.jsx`, with T865's build screen) |
| `e427f98` | T865 I know where I'm going: the places (`KnowDoor.jsx`, with the shared `PlaceSearch`) |
| `5caa328` | T866 I've booked part of it: `bookedTrip`, a booked flight is never repriced, `BookedDoor.jsx` (`doors.js` also holds T863's `suggestDoor` and `selectionOfPlan`) |
| `ebda863` | T863 the doors screen, the door on the trip, the words' preselect, the landing, Plan the rest, the Booked marks, the strings, `tests/doors.test.mjs` |

The commits are ordered so each builds on the one before (T863 wires the three doors into TripFlow, so it comes last).
Undo the batch newest first.

**Root sync.** `git status --short continent-app` listed exactly the batch's 26 files (20 modified, 6 new, leaving out the
untracked `public/app_data/`); the sync commit's numstat (1,791 added, 61 removed) equals the app's `af96e17..ebda863`.

**Register rows taken.** T859-b (the I know where door preselects the named towns): its door half is done by T865 (walk:
"the named towns are preselected"); its other half, Trips for you's answers line naming the places, belongs to Batch E's
results layout (T868), so the row stays open. No other `next task` row from T855 to T862 is covered by this batch.

**Checks.** `npm test` 1090 of 1090 (baseline 1082 on `af96e17`; 8 new tests in `tests/doors.test.mjs`, one existing
`flowGraph.test.mjs` assertion changed on purpose: with stays booked the doors now show). ESLint: no error on any touched
file; the two warnings are older (`TripSummary.jsx` chip `Icon`, `FindingTrips.jsx` react-refresh export note, both on
`af96e17` already). `node scripts/ci/design-lint.mjs`: no violation on a line this batch wrote (two raw buttons and an
`outline: none` it found on a first pass were moved onto the kit Card and Button and a transparent focus outline). Impeccable's
detector on the touched UI files: no findings (`[]`). No dashes, middots or banned words in the diff or the new strings (the
parser's own phrase list holds "just a cheap flight" as a reading, not as copy).

**End check.** One NOPUBLIC build (`wt/vite.t863.mjs`, about 8 s) of `ebda863`'s code, served with `public/` by
`serve-a.mjs` on 5863, Playwright walk `Execution/P15/T863-T866-walk/walk-d.mjs`, service workers blocked, the T795 sweep
fixture on `flights/BRU.json`, the live search failing (503). At 1440 and 375: Tell Carta with "Just a cheap flight for two in
November from Ghent, nothing booked" through the setup to the doors; Find my flight first from a seeded trip to the trip page
and Plan the rest; I know where with two named towns, a third added and removed, to the trip page; I've booked part of it with
a flight there and home and a stay, one stay typed in, to the trip page. **86 of 86 checks pass, no console errors**
(`after/walk.json`). Then `doors-lang.mjs`: the four door titles fit their tiles in German, Dutch, French, Spanish and Italian
at 375 and 1440 (10 of 10). One screenshot per screen and width in `T863-T866-walk/after/` (not committed, as in the earlier P15
walks). Module preloads 36, the same as Batch C (a first build had 37, see T863 "What broke"). The build folder was deleted after
the walk.

**Carta-design seven questions** (the doors, the flight rows, the places search and chips, the bookings list and form, the
Plan the rest button, the Booked mark; CSS in `86-plan-flow.css`, `87-trip-finder.css`, `TripSummary.css`):
1. No hex: every value is a token. 2. No gradient and no new colour; the hover ground is `--surface-hover`, the warning line
for a booking Carta cannot place is `--amber-ink`. 3. Brown only for what acts or is selected: the picked door is the kit
Tile's selected state (tint, select ink, select border, tick), the place chips are selected chips with a tick, the field's
focus ring is `--focus`; the Booked mark is the kit's positive status chip (`--text` with the status dot), not brown and not
green text. 4. No figure under 12 px (the fare is `--text-lead`, "for 2" `--text-caption` 12 px); every euro through
`formatMoney` or `Money` (whole euros on the flight rows, a comparison list; cents on the bookings, what was paid). 5. One
primary per view (Continue, Draft my route, Plan around it); the flight rows open by their stretched card link; no text on a
photograph. 6. New headings carry a verb ("How much should Carta plan?", "Pick your flight", "Where are you going?", "What have
you booked?"); the door titles are one line each with no subtext (the owner's mark); no count, no method line; the one line
under the flight list says the fares are Google Flights' and may have changed. No dashes, middots or banned words. 7.
Removed: the subtext the old doors' rows could carry, the doors' list rows themselves (a 2 x 2 of tiles instead), and the
Google Flights link on each row (one line under the list instead, so no row holds two controls).

**Impeccable pass** (Operate mode, inside carta-design): the doors are the kit Tile made large (128 px, 112 px under 400 px
wide), icon top left, title bottom left, all four one height in every language (walk: 128 x 4 at 1440, 112 x 4 at 375); they are a
radio group, so the arrow keys move the choice. The flight list is the compact row the density rule asks for (a 72 px photo,
the name, the country with its flag, the way out and the way home each with the airline's own mark, the times tabular, the day
and the stops, the fare right aligned), hairlines between rows, two across from 1024 px in a 1040 px sheet, ten rows then Show
more flights. The places search is one field with its icon inside the focus ring and suggestions as quiet full-width buttons
on hairlines; Enter takes the first. The bookings are hairline rows with the kind's icon, the town, what it is and the day, what
was paid and a Close; the typed form is one bordered object (a Segmented that fills its box, the town search, a date, what was
paid). Loading holds the finder's own check list, ticking on real stages.

---

## T863: how much Carta plans, the four doors

### What changed

The doors screen at `flow/TripFlow.jsx` is reshaped in place: "How much should Carta plan?" over four large tiles, a line icon
and one title each (Plan the whole trip for me, Find my flight first, I know where I'm going, I've booked part of it), the kit
TileGroup as a radio group. The doors always show now (with stays booked they used to be skipped); the engine still goes
straight to the stays when stays are booked and the whole trip door is taken (`hasDoors` unchanged). The words preselect one
(`lib/plan/doors.js` `suggestDoor`): a door said in the words first (parseTrip reads "just a cheap flight", "find me a flight
first", "eerst de vlucht", "nur den Flug", "juste le vol", "solo el vuelo", "solo il volo" and more as the flight-first door,
after what is booked and before who goes, so "solo el vuelo" is no solo traveller), then anything booked, then a named place,
else the whole trip. The words' door is the words' answer (source 'words', taken back when the words stop saying it). The choice
is kept on the trip (`settings.door`, normalized to the four) and Continue opens the door: Help me choose as before, Find my
flight first (T864), the places (T865) or the bookings (T866). A trip a door makes lands straight on the trip page:
`TripFlow` takes `onLand` (TripPlannerTab's `handleWizardComplete`, the planner's `loadFromWizard` hand-over) and
`selectionOfPlan` turns a finder plan into that hand-over with its flight held each way. On the trip page a trip from the flight
door or the booked door offers Plan the rest (a secondary in the trip's tools: the Itinerary tab with Add a stop open), and the
booked flight and stays carry a Booked status chip on the route. Carta's own trips, a door before, is one quiet link under the
four. 49 new strings and 3 reworded, in six languages.

### Files touched

**Created:**
- `continent-app/src/lib/plan/doors.js` (DOORS, PARTIAL_DOORS, suggestDoor, selectionOfPlan; bookedTrip for T866)
- `continent-app/tests/doors.test.mjs` (8 tests for the four doors)

**Modified:**
- `continent-app/src/planner/flow/TripFlow.jsx` (the doors, the phases ff, kw, kw:build, bk, `land`, the Carta link)
- `continent-app/src/planner/flow/tripSettings.js` (`TRIP_DOORS`, `door`), `continent-app/src/planner/flow/flowGraph.js` (DOORS, fullFlow always has the doors)
- `continent-app/src/lib/plan/parseTrip.js` (the flight-first words, `door` in applyTrip), `continent-app/src/planner/flow/tellChips.js` (the door as a words' answer)
- `continent-app/src/planner/TripPlannerTab.jsx` (onLand, onPlanRest, the booked marks), `continent-app/src/planner/TripSummary.jsx`, `continent-app/src/planner/TripSummary.css`
- `continent-app/src/styles/86-plan-flow.css` (`.pf-doors`, `.pf-door`, the place search, the bookings)
- `continent-app/src/i18n/{en,nl,de,fr,es,it}.js`, `continent-app/tests/flowGraph.test.mjs`

`TripPlannerTab.jsx` and `TripSummary.jsx` are outside `flow/`; they are where a door's trip lands and where Plan the rest and
the Booked mark show, so they are in scope as the doors' own path.

### Commands run

```
node --test tests/doors.test.mjs ; npm test ; npx eslint <touched files> ; node scripts/ci/design-lint.mjs
impeccable detect --json <touched UI files>
PF_OUT=C:/Users/Gebruiker/Documents/Portfolio/wt/dist-t863 node node_modules/vite/bin/vite.js build --config ../../wt/vite.t863.mjs
node Execution/P15/T840-T843-walk/serve-a.mjs <dist> continent-app/public 5863
node Execution/P15/T863-T866-walk/walk-d.mjs 5863 after ; node Execution/P15/T863-T866-walk/doors-lang.mjs 5863
```

### Measurements

| Metric | Before | After |
|---|---|---|
| Doors | 3 rows (Help me choose, I know where, Carta's own trips), skipped with stays booked | 4 tiles, icon and title, always shown |
| Doors preselected by the words | none (always Help me choose) | flight, know, booked or guide (walk: "just a cheap flight" picks Find my flight first) |
| A door's trip reaches the trip page | through the wizard's steps | straight (flight, know, booked) |
| Module preloads | 36 | 36 |
| npm test | 1082 | 1090 |

### What broke

The first build had 37 module preloads: taking the Carta's own trips door out removed `CartaTrips` from TripFlow's imports,
and the bundler split `components/flights/Flights.jsx` into a preloaded chunk of its own. Found by building `af96e17` beside it
(36) and bisecting the changed files; fixed by keeping Carta's own trips as a quiet link under the doors (row T863-a).

### What is still open

- T863-a (user): call made without the owner: Carta's own trips is no longer a door but a quiet link under the four (the owner's
  four doors replace the old three; the link keeps the path and the preload count).
- T863-b (user): call made without the owner: Plan the rest (flight-first and booked trips) opens the Itinerary's Add a stop;
  the trip keeps the door it was made through, and there is no door picker on the trip page.
- T863-c (user): call made without the owner: a booking beats a named place in the preselect (the trip is built around it); a
  door said in the words beats both.

### Rollback

`git -C continent-app revert ebda863` first (it wires the other three), then `5caa328 e427f98 c0b4c19` if the doors' flows go
too; then sync the root mirror. Settings with `door` load in older code (unknown keys are dropped).

---

## T864: Find my flight first

### What changed

`lib/recommend/doorTrips.js` `flightRows` makes the flight results page from the trip finder's own engine, narrowed by every
answer already given: the places are the named ones (a named town itself, a named country's best places), or with none the
countries the likes and the weather match (matchCountries, as Help me choose) with their best places, or the catalogue's best
rated places a few a country; the dates are the setup's (else each place's best month at the setup's nights); each place is a
one-base trip priced by `priceCandidate`, so the flight there and home is Google Flights' swept fare from every airport in reach
door to door (Batch C's `homeCandidates` and `accessCost`), bags and babies in. One row a place and one place an arrival airport,
the cheapest flight for the group first (fewer stops on a tie); with a budget, a place whose flight or whole trip is over it a
person is left out. `DoorScreens.jsx` `FlightFirstScreen` shows the finder's loader on real stages (places, the flights from the
traveller's town, each flight door to door for the party), then "Pick your flight": the answers as chips (From Ghent, the dates)
and the rows as kit Cards. A pick hands the row's trip (planOf) to TripFlow, which lands it on the trip page with that flight held
each way (T855's held legs); the stays and food are priced at the trip's stay type and Lifestyle from the start, and more places
and the days are added from the trip page (Plan the rest, Plan your days). With no row, one line and Change your answers (the trip
settings). The screen and its engine ride in the FindingTrips chunk (`useDoorRun` in `finderHooks.js`).

### Files touched

**Created:**
- `continent-app/src/lib/recommend/doorTrips.js` (flightPlaces, flightRows, flightOf; knowTrip for T865)
- `continent-app/src/planner/finder/DoorScreens.jsx` (FlightFirstScreen; KnowBuildScreen for T865)

**Modified:**
- `continent-app/src/planner/finder/finderHooks.js` (useDoorRun), `continent-app/src/planner/finder/FindingTrips.jsx` (re-exports)
- `continent-app/src/styles/87-trip-finder.css` (`.ffl`)

### Commands run

As T863 (one build and walk for the batch); a node probe of `flightRows` on the T795 fixture.

### Measurements

| Metric | Before | After |
|---|---|---|
| A flight-first path | none | a results page, one row a place |
| Rows, the walk's trip (two, 21 to 28 Nov, from Ghent with BRU, fixture of 4 airports) | | 4: Lake Como 374, Český Krumlov 540, Salzburg 546, Lake Bled 676 for two, cheapest first |
| Rows for a named country (Czechia), node | | only Czech places |
| The trip page's flight after a pick | | the row's flight (walk: 06:15 to 07:40 on the route) |
| flightRows on the full catalogue, 48 places, node | | about 155 ms |

### What broke

The first walk's fare label read the key name (`ff.forN`): the strings were added to the key file after the i18n script ran;
fixed before the commit. The answers chip said "From Brussels" (the airport's town); it now names the traveller's own town.

### What is still open

- T864-a (user): call made without the owner: a flight-first trip is one base for the trip's nights, with the stay and food priced
  at the trip's choices from the start (not left empty until added); a place over the budget is left out, not sunk.
- T864-b: the rows are the sweep's fares only (the live day search, `optionsFor`, is not asked per row), and a place whose gateway
  has no swept fare near the day is not listed; the sweep's coverage decides how many rows there are.
- T864-c: in the walk, the trip page's map for Lake Como drew the arrival near Bergamo (BGY) while the flight and the transfer line
  say Milan Malpensa (MXP); not checked whether the finder's own hand-over shows the same.

### Rollback

`git -C continent-app revert c0b4c19` after `ebda863`, then sync the root mirror.

---

## T865: I know where I'm going

### What changed

`flow/KnowDoor.jsx`: "Where are you going?" with the towns and countries the words named, preselected as selected chips (a tap
takes one away; closes the door half of row T859-b), and a search over the catalogue's towns and countries (`PlaceSearch`, also
used by T866) to add more, up to six; Draft my route saves them as the trip's named places and the Where step's countries. Then
`KnowBuildScreen` runs `doorTrips.knowTrip` on the finder's engine with the finder's loader (a route through the places, the
flight, the stays and getting around priced) and lands on the trip page: named towns are the route in the order named (at most
four, never more towns than nights), the nights split the planner's way, the gateway the first town whose airport the sweep
covers; with only countries named, the finder's best trip among them (its pool is the named countries, T859). A route that cannot
be built says so in one line and goes back to the places.

### Files touched

**Created:**
- `continent-app/src/planner/flow/KnowDoor.jsx` (KnowDoor, PlaceSearch)

(`knowTrip` and `KnowBuildScreen` are in T864's `doorTrips.js` and `DoorScreens.jsx`.)

### Commands run

As T863.

### Measurements

| Metric | Before | After |
|---|---|---|
| I know where | the wizard's Where, Stay, Stays, Getting there, Review | the places, then the trip page |
| Walk: Prague and Český Krumlov, two, 21 to 28 Nov | | a route Prague then Český Krumlov, priced 1,844.42 for two |
| Named towns preselected on the door | no (row T859-b) | yes |

### What broke

Nothing in the end check.

### What is still open

- T865-a: the route keeps the order the towns were named in and splits the nights evenly; it does not reorder by geography or
  weigh the nights by the place, and towns farther apart than `towns.maxKm` still share one route.

### Rollback

`git -C continent-app revert e427f98` after `ebda863` (and before `5caa328`'s revert if BookedDoor stays, since it imports
PlaceSearch), then sync the root mirror.

---

## T866: I've booked part of it

### What changed

`flow/BookedDoor.jsx`: "What have you booked?" lists the bookings the words or a file already gave (the kind's icon, the town,
what it is and the day, what was paid, a Close each; a booking whose town Carta does not hold says the trip is planned without
it). Another one comes from a file (parse-booking, the existing Gemini-backed Edge Function, behind the pass as in Tell Carta)
or typed in: a flight there, a flight home or a stay, its town (the catalogue search), its day and what was paid for everyone.
Plan around it runs `lib/plan/doors.js` `bookedTrip`: the booked stays are the stops in check-in order (each until the next
check-in or the trip's end, the importStays rule) with what each cost as the traveller's own price; with only a flight, the town
it lands in is the one base for the trip's nights; a booked flight is the traveller's own fare each way and the trip lands where
it lands. Carta fills what is missing: the flight when only stays are booked, the stay and food when only the flight is, getting
around between the stops. `quoteTrip` never puts Google Flights' fare in the place of a flight marked booked
(`ownFlight.booked`), priced or not. On the trip page the booked flight there, home and each booked stay carry a Booked status
chip.

### Files touched

**Created:**
- `continent-app/src/planner/flow/BookedDoor.jsx`

**Modified:**
- `continent-app/src/lib/price/trip.js` (a booked flight does not fly a Carta fare)
- `continent-app/src/lib/plan/doors.js` (bookedTrip)

### Commands run

As T863.

### Measurements

| Metric | Before | After |
|---|---|---|
| Walk: KLM there 180 and home 160, a stay in Prague 350, a stay in Český Krumlov typed in 210 | | trip page: Prague 4 nights then Český Krumlov 3, flights 340 (the traveller's own), 4 Booked marks |
| A booked flight with no price | Carta priced Google's fare over it | "Your own", no Carta fare (node test) |

### What broke

The bookings list wrote its days in American order ("Sat, Nov 21"); it now uses the app's calendar language ("Sat 21 Nov").

### What is still open

- T866-a: a typed booking takes no nights (a stay runs to the next check-in or the trip's end), no flight times or airports, and a
  town Carta does not hold is left out of the trip.
- T866-b (user): call made without the owner: a booked flight with no price shows "Your own" with no figure and is not in the
  total until Add what you paid; Carta never shows Google Flights' fare for it.

### Rollback

`git -C continent-app revert 5caa328` after `ebda863`, then sync the root mirror. Trips saved with `ownFlight.booked` price as
an own flight in older code (the flag is ignored and Carta may price the fare again).
