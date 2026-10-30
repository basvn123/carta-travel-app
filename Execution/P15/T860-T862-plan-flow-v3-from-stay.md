# T860 to T862: plan flow v3 Batch C, leaving from and stays

## Shared header

**Date.** 2026-10-30 (overnight run).

**Ask.** Plan flow v3 Batch C (`Execution/P15/_BRIEF-plan-flow-v3.md`, `Execution/P15/_PLAN-plan-flow-v3.md` section C and
"What the stay data serves"). Owner's marks: "Leaving from, airports by drive" Go; "Stay types" Go, "Segmented must fill
its box (Either and Treat spilled); offer only what the data serves".

**Branches.** `p15-plan-flow-v3-c` in both repos, from the B heads. App: from `5dffb44`, four commits, head `af96e17`.
Root: from `20dd4fc97` (`git checkout -b`), the sync commit `f2a408976` and the report commit.

| App commit | Task |
|---|---|
| `7011a61` | T860 airports within reach of home, by drive time |
| `b95c3c6` | T861 priced door to door from every airport in reach |
| `f415875` | T862 where to sleep, the space and the four stay types |
| `af96e17` | T861 end check fix: Getting there names the airport the trip flies from |

**Root sync.** `git status --short continent-app` listed exactly the batch's 54 files (46 modified, 8 new, leaving out the
untracked `public/app_data/`); the sync commit's numstat (1,703 added, 190 removed) equals the app's `5dffb44..af96e17`.

**Checks.** `npm test` 1082 of 1082 (baseline 1065 on `5dffb44`; 17 new tests in `airportReach.test.mjs`,
`doorToDoor.test.mjs`, `stayTypes.test.mjs` and `flowGraph.test.mjs`). ESLint: no error on any touched file (the warnings
are the ones already there, plus react-refresh's export note on `setupScreens.jsx`, as before). `node
scripts/ci/design-lint.mjs`: no violation on a line this batch wrote (the list it prints is the files' earlier lines and
untouched files). Impeccable's detector on the touched UI files (`AirportReach.jsx`, `StayTypes.jsx`, `AirportLine.jsx`,
`LifestyleStep.jsx`, `setupScreens.jsx`, `86-plan-flow.css`, `77-settings-v2.css`, `TripSummary.css`): no findings. No
dashes, middots or banned words in the diff or the 41 new strings (six languages each).

**End check.** One NOPUBLIC build (`wt/vite.t860.mjs`, about 8 s) of `af96e17`, served with `public/` by `serve-a.mjs`
on 5860, Playwright walk `Execution/P15/T860-T862-walk/walk-c.mjs`, service workers blocked, the T795 sweep fixture as
`flights/BRU.json` and the same fixture at half the fares as `flights/EIN.json` (every other airport's file 404), the
T817 sweep index (358 covered origins, Liege not among them). At 1440 and 375: Tell Carta with "A week in Portugal with
my partner in May, from Ghent, in a flat", the stay chip's popover (the space, the four types, Hotel's stars), the setup
on to How do you want to get there and How far would you go to an airport, to the trip; a seeded trip from Ghent with
BRU and EIN ticked through Help me choose, Trips for you, Plan this trip, Getting there, Review, Finish, the trip page
(Itinerary, the swap, Costs); the settings line's From on Explore. **70 of 70 checks pass, no console errors**
(`after/walk.json`, `after.log`). One screenshot per screen and width in `T860-T862-walk/after/` (not committed, as in
the earlier P15 walks). Module preloads 36, the same as Batch B (a first T862 build had 37: `StayTypes` importing
`useDayView` split it into a preloaded chunk; it now reads the price view from the choices). The build folder was
deleted after the walk.

**Carta-design seven questions** (the airport rows, the way rows, the stay space and tiles, the airport line, the From
popover section, the CSS in `86-plan-flow.css`, `77-settings-v2.css`, `TripSummary.css`):
1. No hex: every value is a token. 2. No gradient and no new colour; a row with no prices yet is `--surface-sunken` with
`--text-2` and a dashed mark. 3. Brown only for what is selected or acts: ticked rows and the picked tile are the kit's
selected state (tint, select ink, tick or filled box), the segment is the lifted white thumb, the swap is a quiet
button; nothing brown is decoration. 4. No figure under 12 px (tile prices and drive times are `--text-label` 13 px);
every euro through `formatMoney` (whole euros on the tiles, cents on the airport line and the receipt line). 5. One
primary per view (Continue or Save); no text on a photograph. 6. The new headings carry a verb ("How do you want to get
there?", "How far would you go to an airport?", "Where do you want to sleep?"); no count, no method line on the page (the
drive estimate is marked as an estimate in config only); no dashes, middots or banned words. 7. Removed: the "About"
before each typical night (an approximation word is a provenance mark by rule 9 of "Never do this"; the figure stands
alone), and the way-of-travel chips from the Lifestyle step (asked once, on its own screen, now).

**Impeccable pass** (Operate mode, inside carta-design): the airports are kit ChoiceRows with checkbox semantics (a new
`disabled` option keeps a row without prices in the list, read but not tickable), nearest drive first, the reach as one
Segmented over them; the stay space is a Segmented whose segments share the width and wrap a long word inside
(`.pf-fill-seg`, the owner's "Either and Treat spilled"), checked in the walk at 375 by each segment's scroll width; the
type tiles put the icon beside a two-line label (name, then the night) so four fit a phone screen; the typical nights are
worked out a frame after the step paints (about 200 ms for the catalogue) with the price line holding its height; the
airport line sits under the outbound flight as one sentence and a quiet swap. One thing seen and left: at 1440 the
anchored stay popover is taller than the space under the chip, so its Save scrolls into view inside the popover.

---

## T860: airports within reach

### What changed

After the town the setup asks "How do you want to get there?" (Any way, Fly, Train, Car; it writes the app's own way of
travel, so Explore follows; a coach said in the words stays a coach on the Train row) and, when the way may fly, "How far
would you go to an airport?": 1 hour, 2 hours (preselected) or 3 hours, or Pick, over every airport within three hours'
drive as a tick row with its drive ("52 min by car", "1 h 53 by car"). The drive is the straight line times a road factor
at one speed, kept in `config/pricing.json` as `origins.airport_access` (kind estimate; road factor 1.3, 85 km/h, parking
12 a car a day, the hours offered). A reach ticks every airport the flight sweep covers inside it (the sweep index's
`origins`, read once by `loadSweptOrigins`); one it does not cover reads "No prices yet" and cannot be ticked; a tap on a
row switches to Pick. The answer is the app's `choices.origins` and `choices.airport_hours` (URL `oa`, `ah`), shared with
the settings line's From, which draws the same control under its town search (popover and phone sheet); a new town ticks
its own airports at the reach already chosen. Tell Carta's words now answer the way question ("by train") and show two new
dashed chips ("How to get there?", "Which airports?"); the trip settings sheet lists both. The Lifestyle step no longer
asks the way (asked once).

### Files touched

**Created:**
- `continent-app/src/lib/airportReach.js` (airportsNear, originsWithin, homeAirports, accessCost; T861 adds homeCandidates)
- `continent-app/src/components/AirportReach.jsx`
- `continent-app/tests/airportReach.test.mjs` (6 tests)

**Modified:**
- `continent-app/config/pricing.json` (`origins.airport_access`)
- `continent-app/src/App.jsx` (choices.origins, airport_hours, setAirports, sweptOrigins; setFrom re-ticks)
- `continent-app/src/hooks/useAppData.js` (takes the airports and the From point; T861 data)
- `continent-app/src/lib/urlState.js` (`oa`, `ah`), `continent-app/src/lib/flights/flightData.js` (loadSweptOrigins)
- `continent-app/src/components/SettingsLine.jsx`, `continent-app/src/components/ui/ChoiceRows.jsx` (disabled rows)
- `continent-app/src/planner/flow/{flowGraph.js,questions.js,setupScreens.jsx,QuestionScreen.jsx,tellChips.js,tripSettings.js,TripSettingsSheet.jsx,LifestyleStep.jsx}`
- `continent-app/src/lib/plan/parseTrip.js` (the way answers the way question)
- `continent-app/src/styles/86-plan-flow.css`, `continent-app/src/styles/77-settings-v2.css`
- `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (22 keys)
- `continent-app/tests/{flowGraph,tellChips,priceConfig}.test.mjs`

### Commands run

```
node --test tests/airportReach.test.mjs ; npm test ; npx eslint <touched files>
PF_OUT=C:/Users/Gebruiker/Documents/Portfolio/wt/dist-t860 node node_modules/vite/bin/vite.js build --config ../../wt/vite.t860.mjs
```

### Measurements

| Metric | Before | After |
|---|---|---|
| Home airports a trip can fly from (Ghent) | 1 (the nearest, BRU) | 7 ticked at 2 hours (ANR, BRU, OST, LIL, CRL, RTM, EIN); 3 at 1 hour; LGG shown, not tickable |
| Setup questions (nothing booked) | 7 | 9 (way, airports; airports only when the way may fly) |

### What broke

Nothing in the end check.

### What is still open

- T860-a (user): the calls above (the drive estimate's values, 2 hours ticking every covered airport, a new town
  re-ticking at the chosen reach, the cheaper of car and train to the airport).
- T860-b: Explore's cards, pins and destination pages still fly from the one nearest origin.

### Rollback

`git -C continent-app revert 7011a61` (after T861's and T862's commits), then sync the root mirror. Old URLs and drafts
carry no `oa`, `ah` or `way` and load as before.

---

## T861: priced door to door

### What changed

With the reach answered, `useAppData` loads every ticked airport's swept file (`data.flightsBy`) and lists the airports
with their drive (`data.meta.home_airports`). `quoteTrip` prices each one door to door: the fare there and home plus the
way to the airport and back (`accessCost`: the car's fuel and tolls on the road twice plus parking a day for the trip,
or a train or coach ticket a seat each way, `ground.transfer_public`, children at their share, whichever is cheaper) and
flies from the cheapest whole, or from the airport the trip is pinned to (`anchorOrigin`). The way to the airport is a
new part `airport` and receipt line "To the airport and back" in the getting-there tile (the four tiles still add up to
the total). The trip finder prices each trip the same way (exact days through `quoteTrip`, nearest swept days from every
ticked airport's file in `nearLegs`, gateways swept from any ticked airport count), the flight slot's figure includes the
way to the airport, the trip flies from where its flight does, and `planOf` hands that airport to the planner so the
planner prices the card's airport. The trip page's outbound flight carries one line: "Flies from Eindhoven (EIN): €197.20
less door to door than Brussels (BRU)." with a quiet "Fly from Brussels (BRU)" that pins the other airport in one tap (to
the cheapest, else back to the nearest, else the next cheapest). Without the reach answered nothing moves: one origin, no
airport line, no new receipt line. End check fix (`af96e17`): Getting there's origin line named the app's origin (BRU)
while the trip flew from EIN; it now names the priced flight's home airport.

### Files touched

**Created:**
- `continent-app/src/planner/trip/AirportLine.jsx`, `continent-app/src/planner/trip/airportLine.js` (swapTarget)
- `continent-app/tests/doorToDoor.test.mjs` (5 tests)

**Modified:**
- `continent-app/src/lib/price/trip.js` (cartaFlight over the home candidates; part `airport`)
- `continent-app/src/lib/airportReach.js` (homeCandidates)
- `continent-app/src/lib/recommend/{trips.js,candidates.js,adapters/flight.js}`, `continent-app/src/planner/finder/planOf.js`
- `continent-app/src/lib/tripTotal.js`, `continent-app/src/lib/price/tiles.js`, `continent-app/src/planner/PlanTotal.jsx`,
  `continent-app/src/planner/wizard/StepReview.jsx`, `continent-app/src/lib/planPdf.js`, `continent-app/src/planner/days/tripCost.js`
- `continent-app/src/planner/TripItinerary.jsx` (CRLF in the index), `continent-app/src/planner/TripPlannerTab.jsx`,
  `continent-app/src/planner/TripSummary.css`, `continent-app/src/planner/GuidedTripWizard.jsx` (CRLF; the fix)
- `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (6 keys), `continent-app/tests/costTiles.test.mjs`

### Commands run

As T860; `node --test tests/doorToDoor.test.mjs`; the batch walk `node Execution/P15/T860-T862-walk/walk-c.mjs 5860 after`.

### Measurements

| Metric | Before | After |
|---|---|---|
| Airports priced per trip (Ghent, BRU and EIN ticked) | 1 | 2, cheapest door to door flown |
| Walk trip (Hallstatt and Salzburg, 21 to 28 Nov, two, EIN fixture at half BRU's fares) | BRU only | EIN, 197.20 less door to door than BRU; the way to the airport 96.60 |
| Module preloads | 36 | 36 |

### What broke

The end check found Getting there's origin line naming BRU for a trip priced from EIN; fixed in `af96e17`.

### What is still open

- T861-a: the finder's card and preview do not name the home airport or its saving (the trip page and Getting there do).
- T861-b (user): a trip from the finder is pinned to the card's airport so the planner matches the card; a trip planned
  without the finder flies from the cheapest until a swap pins one.

### Rollback

`git -C continent-app revert af96e17 b95c3c6`, then sync the root mirror. With no `home_airports` in the data the engine
prices as before (tests `doorToDoor`, "without the reach answered nothing moves").

---

## T862: where to sleep

### What changed

First the check: `apt` does not reach the wire. `pipeline/stays/build_stays.py` reads its apartments kind only to derive
`bnb_home` where Inside Airbnb has none; `app_data.json` carries `apt` for 0 of 3,868 places and the stays records carry
no `apt` month curve. Emitting it needs a pipeline and stays data rebuild, so it is registered (T862-a) and the apartment
type prices `bnb_home`. Then the step: Where to sleep asks the space first, one full-width Segmented that fills its box (A
whole place, A room, Either; Either first), then the four types the data serves as tiles (`lib/sleepGroups.js`
`STAY_TYPES`): Apartment or holiday home (home), Hotel (hotel3, 2, 4, 5), Room in a home (room), Hostel (dorm, private).
Each tile carries a typical night through `formatMoney`: the engine's bed a person a night (`priceDay`), the median over
the trip's named countries or else the catalogue, for the party (for the group in the group price view). The stars show
for Hotel only. It writes `choices.stay_tier`, as before. The trip page's stays now book by type
(`transportLinks.stayBookLinks`): an apartment on Booking.com with the apartments filter (`nflt=ht_id=201`) and on Airbnb
as an entire place, a room in a home on Airbnb as a private room, a hostel on Hostelworld, a hotel on Booking.com as
before. Tell Carta's stay chip names the type and opens the types alone (closes T858-b; the way chip opens the way
question since T860), and the parser reads "flat", "whole place", "room in a home" and their translations into the same
types. The old three sleep groups stay for the Lifestyle panel (T862-b).

### Files touched

**Created:**
- `continent-app/src/planner/flow/StayTypes.jsx`, `continent-app/tests/stayTypes.test.mjs` (5 tests)

**Modified:**
- `continent-app/src/lib/sleepGroups.js` (STAY_SPACES, STAY_TYPES, offeredStayTypes, typesForSpace, stayTypeOf, tierForType)
- `continent-app/src/lib/price/priceDay.js` (typicalNight, inside the engine: invariant V2)
- `continent-app/src/lib/transportLinks.js` (stayBookLinks; CRLF in the index)
- `continent-app/src/lib/plan/parseTrip.js` (the stay words)
- `continent-app/src/planner/flow/{LifestyleStep.jsx,setupScreens.jsx,QuestionScreen.jsx,questions.js}`
- `continent-app/src/planner/TripItinerary.jsx`, `continent-app/src/planner/TripPlannerTab.jsx`
- `continent-app/src/styles/86-plan-flow.css`, `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (13 keys)

### Commands run

As T860; `node --test tests/stayTypes.test.mjs`; the batch walk.

### Measurements

| Metric | Before | After |
|---|---|---|
| Stay choices in the planner step | 3 kinds (hostel, home, hotel) and a second row each | space, then 4 types with a typical night; stars only for Hotel |
| Typical night a person, two, catalogue | not shown | apartment 62, hotel (3 star) 102, room 48, hostel 32 (Portugal: 58, 66, 37, 21) |
| Space Segmented at 375 | "Either" spilled (owner) | every segment inside its box (walk) |
| `apt` places on the wire | 0 of 3,868 | 0 (registered, T862-a) |

### What broke

The first build had 37 module preloads (`useDayView` split out); fixed before the commit.

### What is still open

- T862-a: `apt` needs a pipeline and stays data rebuild to price apartments apart from Airbnb's entire places.
- T862-b: the Lifestyle panel, LifestyleChoices, the per-stop stay select and the wizard's stay links still use the three
  old groups and the plain Booking.com search.
- T862-c (user): the calls on the typical night (median, a person, no "about"), the space starting on Either, a
  hostel's private room under Hostel.

### Rollback

`git -C continent-app revert f415875`, then sync the root mirror. `choices.stay_tier` keeps its values, so a stored tier
reads the same in either version.
