# T175 E5: A type-specific data sheet that reorders itself

## Task ID

T175 (mind-map number T179). Branch p10-e5-data-sheet-ui in both repos.

## Date

2026-10-03

## What changed

The data sheet on a journey page used to be one fixed list of nine text slots, the same order for every style, and it never showed the three numbers T151 filled (distance, highest point, climbing). It now reads the trip's tripTypeSlug and picks a field order for that style. All ten styles have one, including the four the blueprint left out: cozy towns, road trips, culinary and wine, and nature escapes (104 of 253 trips, 41 percent of the catalogue).

The orders live in one table, SHEET_ORDER in src/lib/dataSheet.js, so a maintainer changes a style by editing one array. A field is a typeSpecific slot or one of two derived fields: food per day (the budget's food line spread over the days) and best months (the existing month strip). A field with no value is skipped, so a half-filled trip still shows a sheet in the style's order. The first three rows carry the weight: a measured figure in a lead row is set in semibold mono. Distance is labelled for the mode of the style (ridden, run, walked, driven, sailed, piste network), matching the meaning table T151 wrote into SCHEMA.md, and cycling, trail running and hiking add an "about N km a day" note, which is the daily distance the spec asks for.

The orders, first field first.

Cycling: surface and distance, distance ridden, climbing, highest point, technical rating, wind, audience.
Trail running: technical rating, climbing, distance run, surface, highest point, hut booking, audience.
Hiking: technical rating, climbing, highest point, distance, hut booking, surface, booking timeline, audience.
Winter sports: snow reliability, vertical drop, lifts and passes, piste network, highest point, booking timeline, surface, audience.
Water sports: wind, best months, surface, distance sailed, technical rating, booking timeline, audience.
City: transit pass, food per day, distance walked, booking timeline, surface, audience.

The four designed here, with the reason. Cozy towns lead with the walked km, because the type is about walking, then terrain, what a day of food costs, the months, and the transit pass for the train hops between bases. Road trips lead with km driven and the highest pass, then the road itself and the months, because passes close. Culinary leads with the months, the season of the produce and the harvest, then food per day, then booking lead time for tables and tastings. Nature escapes lead with the highest point and the climbing, then distance, terrain and the hut or cabin booking.

Where the spec asked for something the JSON does not hold, the sheet uses the nearest real field. Surface mix as numbers (surfaceMix) is empty on every trip and its chart is E4, so cycling leads with the surface text. A transit score and a food-cost index do not exist as numbers: the city sheet leads with the transitPass text and the food per day from the budget. Water sports show wind as text and best months as a strip, not wind and swell by month. Remoteness and last-shop distance have no slot at all, so nature escapes cannot lead with them yet (register row).

Fourteen new i18n keys were added to all six catalogues with their CRLF endings kept. The page no longer has the SPEC_SLOTS list. The booking suppression of T169 is kept: when the booking order has steps, the three booking slots stay out of the sheet.

## Files touched

App repo (continent-app), branch p10-e5-data-sheet-ui. Root repo: this report and the register only.

**Created:**
- src/lib/dataSheet.js
- tests/dataSheet.test.mjs

**Modified:**
- src/browse/JourneyPage.jsx
- src/styles/23-places-pages.css (three rules)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (14 keys each)
- Execution/_OPEN.md (root)

## Commands run

From the app worktree: npm run lint, npm test, npm run build (then dist/ and dist-data/ deleted), npx vite --port 5206 --strictPort, and a Playwright script outside the repo that opens one trip per style at 380 and 1280 px. The journey wire in public/ is the old one, without T151's numbers (T151-a), so the script rewrites each journey response in the browser with the typeSpecific block from trips.master.json. Nothing is written to disk by that.

## Config and secrets set

None.

## Before/after measurements

Rows the sheet shows per trip, averaged by style, over the 253 trips of trips.master.json. Before is the old nine text slots; after is dataSheetRows.

| Style (trips) | Rows before | Rows after | Trips with a numeric row |
|---|---|---|---|
| Cycling (26) | 1.5 | 3.7 | 26 |
| Trail running (25) | 1.8 | 3.9 | 25 |
| City (26) | 1.8 | 3.5 | 18 |
| Cozy towns (26) | 0.9 | 3.2 | 9 |
| Road trips (26) | 0.8 | 3.2 | 26 |
| Hiking (24) | 1.9 | 4.0 | 24 |
| Culinary (26) | 0.9 | 3.3 | 10 |
| Winter sports (24) | 2.0 | 3.1 | 15 |
| Nature escapes (26) | 0.8 | 2.5 | 13 |
| Water sports (24) | 1.4 | 2.5 | 3 |
| All 253 | 1.37 | 3.30 | 169 |

Before, no trip showed a numeric row. Styles with a defined field order: 0 before, 10 after.

carta-design pre-ship answers. 1: no hex added. 2: no gradient, no new colour, no second hue. 3: no ochre, teal or danger used. 4: figures and the euro range are mono, the notes under them are set back to the UI face, prose stays UI. 5: no button added. 6: the only headline is the existing "The data sheet"; the new labels are plain nouns, no em dashes or banned words. 7: the one thing removed was a heavier weight on prose rows in lead position, which carried nothing.

## What broke and how it was fixed

The first browser pass showed lead rows of long prose in semibold, which read as shouting, and the small notes under a figure inherited the mono face. The weight now applies only to measured figures and the notes are set in the UI face. The text slots still show the sources' double-asterisk bold markers raw, as the page did before.

## What is still open

The numbers show only after the journey wire is rebuilt (T151-a, owner); until then the page shows the text slots and the derived rows (T175-a). Nature escapes need remoteness and last-shop distance as slots in the schema and the generator (T175-b). Water sports have wind only as one text slot, not wind and swell by month, and only 3 of 24 have a distance (T175-c). Transit score and food-cost index are text and a budget line today, not indexes; a real index needs a pipeline definition (T175-d). The text slots could go through the page's bold renderer (T175-e).

## Rollback procedure

Revert the app commit on p10-e5-data-sheet-ui, or drop the branch before merge. No data, migration, wire or dependency changed.
