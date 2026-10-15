# T452: The Destinations lists as compact rows

## Task ID

T452

## Date

2026-10-15

## What changed

The owner asked for this on 2026-10-15, answering row T451-b: the lists should suit the user, look really good, match the other tabs, sections and Explore, and give "just enough information to attract them, not too much, not too little".

Explore already answers that question:
- photo tiles in the rails, where inspiration leads;
- compact rows in the full list, at every width.

The kit Card records the owner's own decision of 2026-10-13: "row, the compact default, about ten to a phone screen". Destinations lists drew full-width photo tiles instead, about 540 px each on a phone.

**Now every Destinations list is Explore's row:** beaches, lakes, mountains, rides, walks, city days and a trip style's trips. Each row has:
- a 72 px square photograph;
- the name, with the Score beside it;
- where it is;
- two measured values, label then figure ("Length 813 m   Faces W", "Length 16.4 km   Climb +985 m");
- one line of what it is like ("Cliffs, Turquoise water, Sea cave"), in caption size.

There is no box: a hairline sits between rows, and the row takes the surface on hover, as Explore's do. Rows run in columns at least 400 px wide, so desktop shows two columns.

**What stays a photo tile:** the rails, the ten trip styles and the country track, since those are choices made by picture.

**A walk's two values** are length and climb (a city day's are length and stops). The walking time moved to third, so a row shows what the walk is like rather than how long it takes. The page still shows all three.

**The trip rows** (a style's trips) carry the photograph, the title, where, the days with the grade and the months, and the price range with its estimate mark. Each line is clamped to one, with an ellipsis.

## Files touched

**Modified (app, mirrored in root):**
- `src/browse/PlaceCard.jsx`: row layout, two values, the hook line under them, the gem in the hook line, square 250/500 photographs at 72 px, row skeletons.
- `src/browse/JourneysSection.jsx`: trip cards as rows; the row photograph; the `jsec-trips` list; the doc comment brought up to date.
- `src/lib/cardFillings.js`: walk values ordered length, climb or stops, time.
- `src/styles/37-card-fillings.css`: the row grid, the row, the square media, the one-line values and hook.
- `src/styles/63-v6-destinations.css`:
  - the T451 kit guard scoped to style tiles;
  - the trip list grid;
  - the row guard against the legacy column card.
- `tests/cardFillings.test.mjs`: the new value order.

**Created (root):** this report, `Execution/P11/T452-shots/`.

## Commands run

```
npx vite build && npx vite preview --port 5298 --strictPort
CARTA_PORT=5298 node scripts/verify_{destinations,beaches,lakes,mountains,trails,trips,journeys,places_tab,paging,layer_errors,places_search,explore,cycling}.mjs
npm test
node scripts/ci/design-lint.mjs
node <scratch>/rows_shots.mjs 5298 <out> after
```

## Config and secrets set

None.

## Before/after measurements

Page height is the tab's scroll height at rest, at 390 px.

| Metric | Before | After |
|---|---|---|
| Beaches page height, phone | 18,035 px | 6,209 px |
| Lakes page height, phone | 18,035 px | 6,186 px |
| Mountains page height, phone | 18,031 px | 6,205 px |
| Cycling page height, phone | 17,864 px | 6,400 px |
| List entries fully in view, phone (under the sticky chrome) | about 1.5 | 6 |
| List entries in view, desktop 1440 | 3 to 6 tiles | 12 rows |
| Photograph bytes per list entry | a 500 px thumb | a 250 px thumb |
| design-lint violations | 9,230 | 9,230 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| verify_places_tab: "trip cards carry km and stops" | A row shows two values; city days showed length and time | Values reordered: length, then stops or climb, then time |
| Two unit tests | They asserted the old order | Updated to the new order |
| Long trip titles were cut with no ellipsis, and the place line ran to three lines | The title's button was inline; the where line wrapped | One line each, with an ellipsis |
| design-lint flagged a comment ("From €N a person") | The comment was stale anyway | Reworded |

## Checks

| Check | Result |
|---|---|
| verify_destinations | 78/78 |
| verify_beaches, verify_lakes, verify_mountains, verify_journeys, verify_places_tab | pass |
| verify_trails 34/34, verify_trips 42/42, verify_paging 7/7, verify_layer_errors 24/24 | pass |
| verify_cycling | 76/78. The two failures are the data checks that were already open before T451 (a repeated country count, and no Scottish five-day tour); untouched here. |
| npm test | 375/375 |
| design-lint | 0 new |

## What is still open

Nothing new. Row T451-b is closed by this task. Row T451-f is closed by the owner's answer: list cards need no photo credit.

## Rollback procedure

Revert the T452 commits in both repos. The lists return to photo tiles. No data was touched.
