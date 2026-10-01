# T256: Every flight price reads as an estimate

## Task ID

T256

## Date

2026-10-01

## What changed

The fares in the app are frozen. No harvest runs any more (T255), and the
shipped slices are 49 to 57 days old (T048-m). Until this task most of them
still rendered as plain prices, which reads as a quote. T058-e asked the owner
for the age N past which a stored fare should render with the estimate
styling. The answer in `_OPEN-MASTER.md` stage 1 step 4 is in effect N = 0:
every flight price is an estimate, never a quote. This is the one
user-facing change in session A.

"The estimate styling Explore already has" no longer exists on Explore.
Commit `a91562b` removed the old map, results list, detail breakdown and
compare panel, and Explore has not shown fares since. The styling survives
as the vocabulary in `components/FareProvenance.jsx`: a `~` before the
figure (`estPrefix`), the "est." tag (`FareTag`, `prov.est`, with the title
`prov.estTitle`: "estimated, not a live quote"), and no "from" word on an
estimate. This task applies that vocabulary to every live surface that shows
a Carta flight price:

- **Trip receipts** in `planner/TripItinerary.jsx` and `planner/TripPlannerTab.jsx`
  (flight out, flight home). Both go through `flightProv`, which now always
  returns `est: true`. That one change covers all four flight rows: each
  gets the `~` and the "est." tag, and keeps the age line when the record
  carries one. `flightProv` is called only for Carta-priced flights inside
  `flight?.combinable`, so ground legs (which use `fareProv` directly) and a
  traveller's own booked flight are untouched.
- **TripPlannerTab grand total**, which is labelled only "Total": `~` when the
  total includes a Carta flight (`tp.flight?.combinable`). The itinerary's
  totals already say "Estimated total" and were left as they are.
- **Cheaper start dates** ("flights €X"): `~€X`.
- **Destinations tab city-day card price**: `~` and the estimate title when
  the row is plane-priced. `useDestinationSearch` now marks every plane row
  as an estimate, not only band-priced ones (`s` stays `EST` for a band, so
  the distinction is kept for later).
- **Printed / PDF trip export** (`lib/tripExport.js`): both flight rows get
  `~`. The footer used to say "Flight prices are stored budget-airline fares
  (Ryanair, Wizz Air, Vueling, Volotea)". It now says "Flight prices are
  estimates from budget-airline fares seen weeks ago, not live quotes, so
  check the airline before you book. Ground and stay costs are estimates too."

These were left alone because they already say it, or aren't Carta's
figures: the share text and itinerary totals ("Estimated total"), published
trip legs ("about €X"), booking rows ("est. €X"), and everything the traveller
paid themselves.

## Files touched

**Modified (both repositories):**
- continent-app/src/components/FareProvenance.jsx
- continent-app/src/hooks/useDestinationSearch.js
- continent-app/src/browse/DestinationsTab.jsx
- continent-app/src/planner/TripPlannerTab.jsx
- continent-app/src/lib/tripExport.js

**Modified (root):**
- Execution/_OPEN.md (T058-e and T048-m closed; T256-a, T256-b added)

**Created:**
- Execution/P4/T256-flight-prices-as-estimates.md

## Commands run

```
cd continent-app
npx eslint src/components/FareProvenance.jsx src/hooks/useDestinationSearch.js \
  src/browse/DestinationsTab.jsx src/planner/TripPlannerTab.jsx src/lib/tripExport.js
npm run build
npx vite preview --port 4173 --strictPort
node scripts/verify_places_tab.mjs        # breaks at line 96, before any price check (see below)
```

Plus a throwaway Playwright probe in the session scratchpad that opened the
Destinations tab, the trip style grid, the composed view and a country filter,
looking for a `.places-card-price`.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Live surfaces showing a Carta flight price without an estimate mark | 7 | 0 | -7 |
| Export footer claims the fares are stored airline fares | yes | no | fixed |

The seven are the two receipt rows in each of the two planners (they
rendered no mark, because `combineTripLegs` attaches no provenance, per
T058-a), the cheaper-dates line, the planner total, and the city-day card.
The two export flight rows were an eighth and ninth place, counted under the
footer row.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `verify_places_tab.mjs` dies at line 96 with "Element is not a `<select>`" | The country filter became a button and listbox (CountryPicker) after the harness was written | Not fixed here (out of scope); row T256-a |
| No `.places-card-price` could be reached in the browser | The city-day card renders under the trips category, but the trips index and the composed view now show journey and itinerary cards (ground cost "€58 a day", no flights) | The card change is verified by reading only; row T256-b |

ESLint shows no errors on the changed files; the twelve warnings in
`TripPlannerTab.jsx` predate this task.

## Carta-design check

1. No hex added. 2. No new colour, serif, gradient or shadow. 3. `--flag` not
touched. 4. The `~` sits inside the existing mono price spans; no prose became
mono. 5. No buttons added. 6. The new export sentence has a verb, no em
dash, no banned word. 7. Nothing to remove: the change is one character
and an existing tag.

## What is still open

The planner flight rows and the city-day card were not seen in a browser.
`flightProv` is four lines and its call sites are unchanged, so the risk is
low, but the planners have no harness that builds a flying trip, and the
city-day card may no longer be reachable from the current Destinations
navigation at all. A follow-up should add a harness step that composes a
trip with a flight and asserts the `~` and the "est." tag on both rows, and
should find out whether the city-day card is still reachable or is dead code
(T256-b).

`verify_places_tab.mjs` needs its country step moved to the CountryPicker
listbox before it can check anything after line 96 (T256-a).

T048-m (the laptop never completed a fare refresh after 2026-07-23, so the
slices age while shown as quotes) is closed here. No refresh is meant to run
any more (T255), and the ageing fares now render as estimates. T058-e (the
owner's choice of N) is closed by the same decision.

T058-a (the planner's `combineTripLegs` attaches no provenance and ignores the
bands) is still open and unchanged. With every flight now an estimate, its
visible effect is only the missing age line.

## Rollback procedure

`git revert` the T256 commit in `continent-app/` and its mirror in the root.
Nothing else depends on it.
