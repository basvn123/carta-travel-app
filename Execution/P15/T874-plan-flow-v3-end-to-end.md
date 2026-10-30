# T874: plan flow v3 Batch G, end to end

## Shared header

**Date.** 2026-10-30 (overnight run).

**Ask.** Plan flow v3 Batch G (`Execution/P15/_BRIEF-plan-flow-v3.md`, `Execution/P15/_PLAN-plan-flow-v3.md` section G): four people
from the first sentence in Tell Carta to Plan your days, at 375 and 1440 wide, on the NOPUBLIC build. Anything asked twice, dropped,
contradicted or priced wrong is fixed inside the plan flow files Batches A to F touched, or registered. Also the two rows Batch F
flagged: T872-b (the wizard's finder branch) and T864-c (the Lake Como map's arrival airport).

**Branches.** `p15-plan-flow-v3-g` in both repos, from the F heads. App: from `7a57107`, six commits, head `a0001d2`. Root: from
`d216e5180` (`git checkout -b`), the sync commit and the report commit.

| App commit | What |
|---|---|
| `792ec7b` | The way there carries into Help me choose (`flowGraph.js`, `questions.js`, `QuestionScreen.jsx`, `candidates.js`, `doorTrips.js`, `finderHooks.js`, new `tests/endToEnd.test.mjs`) |
| `79ebda6` | One total from the card to the trip page when no fare is found (`lib/price/trip.js`, `lib/airportReach.js`, `finderHooks.js`) |
| `57b1a9b` | A flight the words booked is not typed twice (`BookedDoor.jsx`, `lib/plan/doors.js`) |
| `9ee89ac` | The trip page map draws the airport the flight uses, row T864-c (`TripPlannerTab.jsx`) |
| `4d79750` | The wizard's unreachable finder branch removed, row T872-b (`GuidedTripWizard.jsx`, `finder/handoff.js` deleted, `planOf.js` and `trips.js` comments, four test files moved onto the live path) |
| `a0001d2` | A trip with no fare names the airport the sweep covers (`lib/price/trip.js`, found on the second walk) |

Each commit stands alone; `git -C continent-app revert <sha>` undoes one finding (revert `a0001d2` before `79ebda6` if both go:
the test file is shared).

**Register rows taken.** Closed: T872-b and T864-c (T874). T856-a is narrowed (see the first finding) but stays open as the owner's
call for a card priced on a flight with the way left at Any way.

**Checks.** `npm test` 1109 of 1109 (baseline 1101 on `7a57107`: 9 new tests in `tests/endToEnd.test.mjs`, one `draftFor` test
removed with `draftFor`). ESLint on every touched file: no error. `node scripts/ci/design-lint.mjs`: no violation on a line this
batch wrote (its `TripPlannerTab.jsx:460` money-literal hit is a comment from 2026-10-29). Impeccable's detector on the touched UI
files: `[]`. No dashes, middots or banned words in the diff. No new strings (no i18n keys added or removed). Module preloads 36 on
every build. No lazy chunk gained an import of `finderText` or `useDayView` (the only new import is `lib/airportReach.js` in
`finderHooks.js`, already in the main chunk through `lib/price/trip.js`).

**End check.** One NOPUBLIC build (`wt/vite.t874.mjs`, about 4 s) of each state, served with `public/` by `serve-a.mjs` on 5874,
Playwright walk `Execution/P15/T874-walk/walk-g.mjs`, service workers blocked, the T795 sweep fixture on `flights/BRU.json` (every
other airport's file 404, so only Brussels has fares, 1 Nov to 11 Dec), the live day search failing (503), `?o=BRU&oa=BRU.CRL&ah=2`
and each persona's home town in `dh`. Each walk starts on Plan, presses Start planning, takes A new trip on the kind sheet, types the
persona's sentence into Tell Carta and answers every screen as that person would, logging the title, the step counter and the
marks of each screen, until the trip page (TripSummary), then opens Plan your days and walks its questions. **Before** (F code
`7a57107`, 1440): 35 of 40 checks, the family's trip priced 63.90 more on the trip page than on its card, the student's flight list
empty. **After** (G code `a0001d2`, 1440 and 375): **88 of 88 checks pass, no console errors** (`after/walk.json`). Per persona and
width: `after/p{n}-{width}.json` (every screen, the figures, the trip's settings) and the screenshots in `T874-walk/after/` (not
committed). Module preloads 36 on every build. The build folder was deleted after the walk.

**Carta-design seven questions** (the batch's UI diff is three behaviours, no markup or CSS: the How far question loses one row
when the way there is Fly, the booked form opens filled, the map's airport pin moves):
1. No hex added. 2. No gradient, no new colour. 3. Brown use unchanged; the booked form's filled town is the existing confirmed-town
row with its quiet Change town. 4. No new figure; every euro still through `formatMoney` or `<Money>`. 5. No new primary; the doors,
the booked door and the trip page keep one each. 6. No new heading or string. 7. Removed: one question for the train and car
traveller (How far), one answer for the flyer (No flying), two typed towns and two typed days for the traveller whose words said
the flight was booked, and the wizard's dead seeded branch with `handoff.js` (81 lines).

**Impeccable pass** (Operate mode, light audit inside carta-design; the launcher's `context` loaded the incumbent system, `detect`
on the touched UI files returned `[]`): the three changes remove input rather than add surface; nothing for the craft floor to
catch. The one batched inspection round (the walk's screenshots at 375 and 1440) found no layout defect on the touched screens.

---

## T874: four travellers, first sentence to Plan your days

### What changed

The walk found six things asked twice, dropped, contradicted or priced wrong, and the two Batch F rows; six are fixed in this
batch, the rest are registered.

**Fixed.**
1. *Dropped and asked twice: the way there.* "How do you want to get there?" (Any way, Fly, Train, Car, T860) was read by the
   setup and the planner's legs (T856) but not by Help me choose: its "How far do you want to go?" asked again whether to fly (and
   offered No flying to someone who had said Fly), and a Train or Car answer left the finder's trips flying. Now a Train or Car
   way skips How far and the finder's trips go by train or by the traveller's car (`transportFor`, `fliesThere`); with Fly, How far
   offers A short flight and Anywhere in Europe only. This also takes most of T856-a's case away: a finder trip for a train
   traveller is no longer priced on a flight.
2. *Priced wrong: the family's total.* The Dubrovnik card and the finder's trip page said 1,828.40 for 4 "without the flight" (the
   sweep has no fare for DBV); the trip page said 1,892.30, adding 63.90 for the drive to the airport and back while the flight was
   "not yet available". With no fare either way the way to the airport is no longer counted (a typed fare brings it back).
3. *Contradicted: the airport.* The finder's trip page named "ANR to DBV", the trip page "BRU DBV": the 2 hour reach ticks every
   airport inside it, Antwerp is the nearest and has no swept fares, and with no fare anywhere the quote fell back to the nearest.
   It now falls back to the first ticked airport the sweep covers (Brussels), and the finder's own origin is a ticked airport.
4. *Asked twice: the booked flight.* "We already booked our flights to Prague, 21 to 28 November" set Flights booked, but What have
   you booked? started empty and Plan around it stayed off until Prague and both days were typed again. The typed form now opens
   with the flight there to Prague on 21 Nov, then the flight home from Prague on 28 Nov; the traveller adds what was paid.
5. *T864-c:* the trip page map draws the arrival and departure at the priced flight's airports (`cartaFlight.inAirport`,
   `outAirport`), so a Lake Como trip flown into Malpensa no longer pins Bergamo.
6. *T872-b:* the wizard's finder branch and `handoff.js` are gone (nothing reached them since T872). Their three price proofs
   (card to planner to the cent, the held flights, door to door) now run through the live path, `selectionOfPlan` as the planner
   loads it, and all hold.

**Per persona.** Screens counted from the first after Tell Carta to the trip page; "asked twice" means a screen or an answer met
again; the three totals are the results card, the finder's trip page and the trip page (TripSummary), for the group.

| Persona | Sentence (as typed) | Door (preselected) | Screens after Tell Carta | Asked twice, dropped, contradicted | Card / finder page / trip page | Plan your days | Key screenshots (each at 1440 and 375) |
|---|---|---|---|---|---|---|---|
| 1. Family, Ghent, Dutch | "Met het gezin, 2 volwassenen en 2 kinderen van 6 en 9, een week in december vanuit Gent, plan alles voor ons, budget 3000 euro" | Plan the whole trip (guide) | 17: booked, how to travel, what matters, way there, airports, new trip, trip home, doors, Help me choose's six, the results, the finder's trip page | Before: the trip page 63.90 above the card; ANR against BRU. After: none found (How far offers two answers after Fly) | Before 1,828 / 1,828.40 / 1,892.30. After 1,828 / 1,828.40 / 1,828.40 (no fare in the sweep for DBV in December) | 7 questions, mornings to who plans | `p1-01-tell`, `p1-02-hoeveel-moet-carta-plannen-`, `p1-03-results`, `p1-04-finder-trip`, `p1-05-trip`, `p1-06-days` |
| 2. Student, Leuven, flight first | "Just a cheap flight for me alone from Leuven, 4 nights in November, max 900 euro, a hostel is fine" | Find my flight first (flight) | 8: booked, what matters, way there, airports, new trip, trip home, doors, Pick your flight | With 300 or 500 a person the list is empty (T874-b). The row's flight home is Mon 9 Nov for a 4 night trip that ends Wed 11 Nov (T874-f) | Row 348 for one (door to door) / no finder page / trip page 601.74 (flights 348.00: 174.00, 154.00 and 20.00 to the airport and back) | 7 | `p2-01-tell`, `p2-02-how-much-should-carta-plan-`, `p2-03-flights`, `p2-05-trip`, `p2-06-days` |
| 3. Couple, Antwerp, know where | "My partner and I from Antwerp, 21 to 28 November in Prague and Cesky Krumlov, mid-range hotels" | I know where (know) | 8: booked, what matters, way there, airports, new trip, trip home, doors, Where are you going (both towns preselected) | None found | No card / no finder page / trip page 2,027.30 (flights 536.00 KLM with 40.00 to the airport, getting around 82.02, 3-star hotels 899.00, food 510.28) | 7 | `p3-01-tell`, `p3-02-where-are-you-going-`, `p3-05-trip`, `p3-06-days` |
| 4. Flight booked, Ghent, typed in | "We already booked our flights to Prague, 21 to 28 November, two of us from Ghent" | I've booked part of it (booked) | 6: how to travel, what matters, new trip, trip home, doors, What have you booked (then the typed form, filled) | Before: Prague and both days typed again. After: filled from the words. No airport transfer priced for the typed flight (T874-d) | No card / no finder page / trip page 1,375.58 (flights 270.00 typed and Booked, stay 565.18, food 540.40) | 7 | `p4-01-tell`, `p4-02-what-have-you-booked-`, `p4-02a-booked-form`, `p4-05-trip`, `p4-06-days` |

Every persona: the party, the home town and the door carry to the trip page; Tell Carta's chips are the answers the screens then
skip (the step counter jumps over them with their marks ticked); the trip page has no wizard and one primary (Plan your days); no
sideways scroll at 375 or 1440. Plan your days asks the same seven questions for all four (mornings, pace, how planned, what the
trip is for, how they eat, how they get around, who plans), two of which overlap answers given in the setup (T874-c).

### Files touched

**Modified:** `continent-app/src/planner/flow/flowGraph.js`, `questions.js`, `QuestionScreen.jsx`, `BookedDoor.jsx`;
`continent-app/src/lib/recommend/candidates.js`, `doorTrips.js`, `trips.js` (comment); `continent-app/src/lib/price/trip.js`;
`continent-app/src/lib/airportReach.js`; `continent-app/src/lib/plan/doors.js`; `continent-app/src/planner/finder/finderHooks.js`,
`planOf.js` (comment); `continent-app/src/planner/TripPlannerTab.jsx`; `continent-app/src/planner/GuidedTripWizard.jsx`;
`continent-app/tests/finderHandoff.test.mjs`, `doorToDoor.test.mjs`, `finderFlightHold.test.mjs`, `namedPlaces.test.mjs`.
**Created:** `continent-app/tests/endToEnd.test.mjs`; `Execution/P15/T874-walk/walk-g.mjs` (the walk), `explore.mjs` (the first look);
`wt/vite.t874.mjs` (outside the repos).
**Deleted:** `continent-app/src/planner/finder/handoff.js`.

`lib/price/trip.js`, `lib/airportReach.js`, `lib/plan/doors.js`, `lib/recommend/*` and the flow files were all touched by Batches A
to F (T855, T860, T861, T863 to T866, T859, T867 to T872), so every fix stays inside the plan flow's files.

### Commands run

```
git checkout -b p15-plan-flow-v3-g   (root, from d216e5180)
git -C continent-app checkout -b p15-plan-flow-v3-g   (from 7a57107)
PF_OUT=C:/Users/Gebruiker/Documents/Portfolio/wt/dist-t874 node node_modules/vite/bin/vite.js build --config ../../wt/vite.t874.mjs
node Execution/P15/T840-T843-walk/serve-a.mjs <dist> continent-app/public 5874
node Execution/P15/T874-walk/walk-g.mjs 5874 before 1,2,3,4   (F code, 1440)
node Execution/P15/T874-walk/walk-g.mjs 5874 after 1,2,3,4    (G code, 1440 and 375)
npm test ; npx eslint <touched files> ; node scripts/ci/design-lint.mjs ; impeccable detect --json <touched UI files>
```

### Measurements

| Metric | Before (F, `7a57107`) | After (G, `a0001d2`) |
|---|---|---|
| Walk checks passing (1440) | 35 of 40 | 44 of 44 (88 of 88 with 375) |
| Family: card / trip page total | 1,828.40 / 1,892.30 | 1,828.40 / 1,828.40 |
| Airport named for a trip with no fare (finder page / trip page) | ANR / BRU | BRU / BRU |
| Questions a Train or Car traveller answers in Help me choose | 7 (How far asked again) | 6 |
| Fields typed for a flight the words said was booked (both ways) | 6 (town, day, price each way) | 2 (the price each way) |
| Wizard code reachable by no path | the seeded branch (30 lines removed, 12 changed) and `handoff.js` (81 lines) | none |
| npm test | 1101 of 1101 | 1109 of 1109 |
| Module preloads | 36 | 36 |

### What broke

Nothing in the app. The first walk took the student's budget as 300 and then 500 a person; both empty Find my flight first (see
T874-b), so the walk's student says 900 to reach the trip page. One earlier build of `79ebda6` still named Antwerp on the finder's
trip page: Antwerp was ticked (2 hours ticks every airport inside it) but has no swept file, so the quote's fallback took it;
`a0001d2` fixes that, found on the second walk.

### What is still open

- T874-a (user): calls made without the owner: a Train or Car way there answers How far (skipped) and sends the finder's trips by
  train or by their car (Car with "avoid needing a car" goes by train); Fly hides No flying; a trip with no fare counts no way to
  the airport; with no fare anywhere a trip names the first ticked airport the sweep covers; the words' booked flight fills the
  typed form but is not added as a booking until the traveller adds it.
- T874-b: Find my flight first with a budget under every place's whole trip (the student's 300 and 500 a person) lists nothing:
  "No flights fit these answers yet" and Change your answers, without saying the budget emptied it (T864-a left over-budget places
  out); its answers line names only From and the budget, not the month, nights or party.
- T874-c (user): Plan your days asks "How do you like to eat?" and "How do you get around?" after the setup's How do you like to
  travel (spend style) and the way there were answered; decide whether those answers fill them.
- T874-d: a typed booked flight has no airports, so the trip page prices no airport transfer and no way to the home airport
  (Getting around "Not needed" on the booked Prague trip); with T866-a.
- T874-e (user): a family named in the words ("met het gezin", 2 adults, 2 children) still starts How do you like to travel on
  Relaxed, not the Family spend style; decide whether the party should preselect it.
- T874-f (user, after T855-a): Find my flight first lists the swept day nearest each trip day, so the student's row flies home
  Mon 9 Nov for a 4 night trip that ends Wed 11 Nov, and the trip page keeps the stays to the 11th; on the flight-first door the
  picked flight should probably set the dates (T855-a's question, sharper here).
- T874-g: Help me choose offers the Ghent family Bruges (about 45 minutes away) as a flight trip "without the flight"; a place within
  a short drive or train ride of home should go overland or not be offered as a flight trip.

### Rollback

`git -C continent-app revert a0001d2 4d79750 9ee89ac 57b1a9b 79ebda6 792ec7b`, then sync the root mirror. Reverting `4d79750` brings
back `handoff.js` and the wizard's seeded branch with their old tests; it changes no live path.
