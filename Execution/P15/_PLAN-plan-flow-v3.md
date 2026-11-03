# Plan flow v3: build plan

Written 2026-10-29 from the owner's marks on the proposal page
(https://claude.ai/artifact/Sa3Hkc2h1QeKTKj179Vx8B, db collection `reactions`). Tasks T855 to T874, seven
batches. Each batch is one batch branch in both repos, one commit or a few per task, one report and one
browser end check (CLAUDE.md "Batches"). Every screen gets an impeccable pass and the carta-design seven
questions before it ships. No Claude API anywhere.

## The owner's marks

| Item | Mark | Note |
|---|---|---|
| Overall flow | Go | |
| Tell Carta, sentence to chips | Go | "make sure this is top notch" |
| Gemini parse-trip function | No | "later": device parser only for now |
| Stay types | Go | Segmented must fill its box (Either and Treat spilled); offer only what the data serves |
| Leaving from, airports by drive | Go | |
| How much to plan, four doors | Go | More modern, icons, no subtext; each title clear on its own; every door's flow built out in depth |
| Flight-first screen | Go | Narrow it by the answers already given |
| Searching stages | Go | |
| Remove the levers | Go | |
| Results layout | Go | A, the gallery |
| Full trip page | Go | |
| "Who this is for" paragraph from a template | Go | "for now" |
| Retire the wizard after a pick | Go | |
| Ready to book in place of Review | not marked | Built as proposed unless the owner says otherwise (open question) |
| Batch order | Go | |

## What the stay data serves (checked 2026-10-29)

`pipeline/stays/build_stays.py` produces: `dorm` and `private` (Hostelworld, plus Booking.com guesthouses for
two), `apt` (Booking.com apartments, studios, holiday homes, villas and houses in one kind), `hotel2` to
`hotel5`, `bnb_home` (Airbnb entire place, from apartments where Inside Airbnb has none) and `bnb_room`
(Airbnb private room). There is no separate B&B price and no separate holiday home price. So the step offers
four types, not five:

- A whole place: **Apartment or holiday home** (`apt`, `bnb_home`).
- A room: **Hotel** (`hotel2` to `hotel5`, the stars as the comfort row), **Room in a home** (`bnb_room`,
  guesthouse `private`), **Hostel** (`dorm`, `private`).

T862 first checks that `apt` reaches the wire and the app (today only `bnb_home` does).

## Batches

### A. Carry every answer (T855 to T856), small, ships first
- **T855** The finder's priced flight survives the hand-over: `planOf.liveFlightsOf` keeps swept and
  nearest-day legs with their own date, and `lib/price/trip.js` cartaFlight reads a handed-over leg before
  the exact-date lookup. Review and the trip page never say "Add your fare" for a trip priced with a flight.
  Check against T802-c.
- **T856** A new plan starts a clean draft (no stale `settings.answered`); the way of travel
  (`choices.transport_mode`) seeds every leg's mode; the wizard's origin card stops asking again.

### B. Tell Carta (T857 to T859), "top notch"
- **T857** One parser, `lib/plan/parseTrip.js`, built from `lib/ask/intent.js` parseIntent and
  `flow/prefill.js`: places (one or several, countries and towns), month or dates, nights, adults, children,
  babies, likes, leaving from (a town), budget (a person or for all), already booked, stay type, way of
  travel. Unit tests on a corpus of at least 60 sentences in English, Dutch and French, with the expected
  fields; the other three languages at least month, people and places.
- **T858** The chips: parsed live as you type (debounced), shown under the field as selected chips, a
  missing answer as a dashed chip; a tap on a chip opens that answer in a popover to change it; Continue asks
  only the missing screens, and the step counter shows filled steps ticked. Phone and desktop.
- **T859** The place carries: named places constrain the finder's candidates and skip Help me choose's
  where questions; two or more places become a shortlist; `draftFor` keeps them.

### C. Leaving from and stays (T860 to T862)
- **T860** Airports within reach: after the town, "How do you want to get there?" (Any way, Fly, Train,
  Car) and "How far would you go to an airport?" (1, 2 default, 3 hours, or pick). Drive time per airport
  estimated from road distance (config factor and speed, marked as an estimate in config only). Stored as
  `choices.origins[]` and shared with the settings line's From. Only airports the flight sweep covers can be
  ticked; the rest say "No prices yet".
- **T861** Priced door to door: the finder and the planner load each ticked airport's flight file and pick
  the cheapest total (fare plus drive or train to the airport plus parking, config values); the trip's
  flight line names the airport and the saving against the nearest. One tap swaps airport.
- **T862** Where to sleep: a full-width Segmented (A whole place, A room, Either) and the four tiles above
  with a typical night price each; comfort row only for Hotel; book links (Booking.com apartments filter,
  Airbnb, Hostelworld, the hotel link as today).

### D. How much to plan (T863 to T866), every door built in depth
- **T863** The doors screen: four large tiles with a line icon and one clear title, no subtext ("Plan the
  whole trip for me", "Find my flight first", "I know where I'm going", "I've booked part of it"). The
  sentence preselects one. The choice is stored on the trip and can change later ("Plan the rest").
- **T864** Find my flight first: a flight results page narrowed by every answer (named place or region,
  weather and likes when open, dates or month, nights, airports in reach, budget): one row per destination
  with the airline mark, times, stops and the fare for the group; pick one and it becomes a trip with that
  flight; stays and days added from the trip page.
- **T865** I know where I'm going: the place or places, then a priced draft route (bases, nights, stays,
  getting around) straight onto the trip page.
- **T866** I've booked part of it: the booking import (parse-booking, existing) or typed details anchor the
  trip; Carta fills what is missing around it and marks the booked parts as booked.

### E. Searching and results (T867 to T869)
- **T867** Searching: stages named from the answers, real work only, the first trips appear under the
  stages as they are priced.
- **T868** Trips for you, layout A: full width, a three-across photo gallery from 1024 px (two on a tablet,
  one on a phone), the answers in one line with Edit answers, Sort (Best match, Cheapest, Shortest trip
  there), Map toggle. The Flight, Food and Bases levers are removed (closes T803-a, T803-b, T803-e as moot).
- **T869** The card: photo with % match and save, name, country, nights, bases, one reason and one catch
  in one line, the total for the group; Compare and Skip in a small menu; the whole card opens the trip
  page (closes T810-b).

### F. The trip page and after the pick (T870 to T873)
- **T870** The trip page replaces the TripPreview modal: its own URL, gallery, head, price card sticky from
  1024 px with the cost bar in the four cost colours, Plan this trip and save.
- **T871** The rest of the page: "Who this trip is for" paragraph from a template over the facts (six
  languages, stripDashes, no banned words), fact band (door to door, weather that month, sea, crowds,
  getting around, airport), route map, what you would do, why it fits and the catch, alternatives
  (uses T802-e's minutes where present; closes T811-c, T811-d).
- **T872** Plan this trip saves and lands on the v4 trip page for every door; the wizard steps and the
  stepper bar are retired on these paths (closes T812-c).
- **T873** Ready to book on the trip page: flight, each stay, each leg, with its link out and Add what you
  paid; the car advice as one row on the route.

### G. End to end (T874)
- **T874** Four people from the first sentence to Plan your days, phone and desktop: a family who want the
  whole trip planned, a student who wants the flight first, a couple who know where, someone with a flight
  booked. Anything asked twice or dropped is fixed here or registered.

## Order and parallel work

A first (it fixes what users hit today). B and C can run in parallel (different files: `flow/` and
`lib/plan/` against `lib/origins.js`, finder pricing and `LifestyleStep`). D needs B (the preselect) and
C (airports for flight first). E needs B. F needs E. G last.

## Open before starting

- Ready to book (T873) was not marked: build as proposed unless the owner says no.
- Which origins the flight sweep covers decides how many airports T860 can tick.
- The Gemini parse-trip function is out of scope ("later").
