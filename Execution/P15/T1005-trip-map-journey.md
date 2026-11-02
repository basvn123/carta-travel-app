# T1005: the trip drawn on Europe, and Your route as a journey

## Task ID
T1005

## Date
2026-11-02

## What changed
The owner asked for three changes to the trip page's Overview, with creative freedom:
1. **The map.** It was a random map with no title. It should be better and more insightful, show the full trajectory, and be placed and drawn cleanly.
2. **Your route.** Reorganise and redesign it from start to end, clean and professional like the flight passes (T1003). Make it possible to change flights, with everything changing in real time.
3. **The note.** Remove "Prices may have changed, confirm on the booking site."

**1. The map card** has a title, "Your trip on the map", and Open the map (the live MapLibre map, full size, as before).

`TripTrace` draws the trip on `public/europe_map.json`, the same Natural Earth equal-area Europe as My trips' Your Europe (T970):
- **Projection.** The file's frame constants (min x, max y, scale) were recomputed from the Natural Earth vertices. They reproduce its height exactly (1034.5), so a lat/lon lands where its country is.
- **The view** is cropped to the trip at 3:2, with room around it.
- **Home** is a dark mark. The flight there and the flight home are dashed umber arcs that bow apart, each with a plane placed clear of the labels.
- **Ground hops** are a solid lagoon line, and a flown hop is an arc.
- **Stops** are numbered umber marks with their name and nights. The trip's countries are tinted sand.
- **A key** under the map names the modes.

**2. Your route** is a new `Journey` component, replacing T819's node list:
- **A rail of day stamps** runs down the left (weekday, the day large, the month). Home is a dark dot on the rail at both ends.
- **Flight card.** The airline's mark and name, with "Getting there, Direct" under it, and Change flight. Below, the two airports large with their times (an arrival after midnight reads "+1") and the plane between them.
- **Stay card.** The town's photograph, the town, its nights and bed, and Check-in and Check-out as two ends.
- **Hop card.** The two towns, with the mode between them.
- **The car advice** is one quiet card.
- **Every card ends in one foot:** To book or Booked, the link out, the figure, and Add what you paid.
- **Change flight** opens the same `ChangeFlight` sheet as the Itinerary and the cost card. Picking another flight reprices the page live: the measured case is below.

**3. The note** "Prices may have changed, confirm on the booking site" is gone from the trip page's Overview, from the Itinerary tab's leg links, and from the unused ReadyToBook. Its string stays for the destination page (DestPractical), which was not part of the request.

## Files touched
**Modified:**
- `continent-app/src/planner/TripSummary.jsx`: OverviewRoute removed, MapCard rewritten, unused imports dropped
- `continent-app/src/planner/TripSummary.css`
- `continent-app/src/planner/TripPlannerTab.jsx`: builds `trace` and passes it
- `continent-app/src/planner/TripItinerary.jsx`
- `continent-app/src/planner/trip/ReadyToBook.jsx`
- `continent-app/src/i18n/{en,nl,fr,de,es,it}.js`: `tp.map.title`

**Created:**
- `continent-app/src/planner/trip/Journey.jsx`
- `continent-app/src/planner/trip/TripTrace.jsx`
- `Execution/P15/T1005-shots/`

## Commands run
- `npx eslint` on the touched files: 0 errors. One warning predates this task (ReadyToBook).
- `npm test`: 1204 of 1204 pass.
- NOPUBLIC build. Playwright opened a seeded Rome and Ljubljana trip from Brussels at 375 and 1440 px, with flights proxied from the live site.
- It shot the map card and the route, opened Change flight on the route's flight card, picked another flight, and shot the route again.
- Two rounds. The first showed:
  - a plane under the Ljubljana label
  - the home row repeating the flight's date stamp
  - an eyebrow above the airline name

  All three were fixed before the second round.

## Config and secrets set
None.

## Before/after measurements
| Metric | Before | After |
|---|---|---|
| Trip points drawn on the Overview map | the stops and their airports (no home, no flights) | home, both flights, every stop, every hop |
| Total after picking the 09:10 easyJet from the route's Change flight | not reachable from the route | €2,393.63 to €2,427.63, live |
| "Prices may have changed" on the trip page | 2 places | 0 |
| Horizontal scroll at 375 and 1440 px | none | none |

## What broke and how it was fixed
Nothing in the app. The shoot script needed the flight API and fare files proxied from carta-europetravel.com, because the local static server has none.

## What is still open
- **T1005-a.** If the pipeline rebuilds `europe_map.json` with a different frame (other countries, other padding), the constants in `TripTrace.jsx` must follow. The builder should write `minx`, `maxy` and `scale` into the file so the app reads them instead of copying them.

## Rollback procedure
`git revert 37e488ab21`
