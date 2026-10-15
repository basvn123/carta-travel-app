## Task ID

T431

## Date

2026-10-15

## What changed

Trips (the style library on the Destinations tab, a style's list and the trip page) were rebuilt on the item pages' system of T430, and the catalogue gained five trip styles the owner asked for, each with one fully slotted sample trip. The library is fifteen style tiles; a style's list is photo tiles (one across on a phone, two from 769 px, three from 1280 px) with the full title, where it is, the places the trip visits, the best months and the range a person, and no day count or difficulty word, because the one length choice above the list states the length (it is generic now: "3 or 4 days" and "7 days" today, and each 10 or 14 day length adds its own choice when such trips arrive). "Where you sleep" is a two-way choice with an explanation dot instead of an unclear switch, and the filter row is left aligned and wraps. The trip page opens on its gallery, then the full title, where, the style and a difficulty whose dot explains it with that week's own hours, hardest climb and high point, one hook line that sells the week (an area statistic such as "Andorra is 468 km²" can no longer lead), a fact band, and "Why this trip". The price card sits in a sticky side column from 1024 px: the total a person at the traveller's choices, the length, the party, two sliders (where you sleep, which moves the bed line, and how you spend, which moves food, getting around and activities), the traveller's own travel to the start (the shared fare sheet, labelled as theirs; Carta prices no flight), the party total, what is and is not included (travel to the start, insurance and personal spending are not), and the four lines behind "See the breakdown" with each line's note behind a dot. Then "Is this week for you?", "Not quite right?" as photo cards with the one changed fact ("€170 less a person", "Active"), the week as a climb chart (the climb, distance and high point a day; tap a day to bring its card) over swipeable day cards with tonight's bed merged in ("Where to sleep" is gone as a section), a day map with numbered nights where the trip carries them, getting there as rows (the start town's day prices only when the trip starts within 30 km of it, which removes "Sea-day prices in Toulouse"), and Before you go as swipeable cards with the risks first, the booking order and the packing grid. Removed: the suitability strip, the data sheet section, "The price is for the whole 7 days ... one tap away", "No monthly price signal ...", the figure footer and the method sentences. The trip booklet PDF prints the page in the page's words, with the price at the traveller's own choices.

New styles and samples (research: hostel weeks for the budget and solo traveller; beach weeks because 4 to 6 nights by the sea is the commonest family holiday; rail journeys for the car-free and flight-shy; pilgrim routes for the fastest-growing walking segment; island hopping because ferry demand records show it is next): Hostel weeks (Sarajevo, Mostar and Kotor), Beach weeks (the Makarska Riviera with children), Rail journeys (Prague, Vienna and Budapest by train), Pilgrim routes (the last 100 km of the Camino Francés from Sarria) and Island hopping (Paros, Antiparos and Naxos). Each sample fills every slot of the data contract (photos, highlights, typed day stats with the high point, a photograph a day, the nights' places, budgets that sum) and carries `sample: true`, which keeps it out of the prerender and so out of the sitemap until the owner audits it. Photographs come from the destination dossiers the app already ships (credited Commons files); the five style photographs are views, not yet people doing the thing.

## Files touched

**Created:**
- pipeline/journeys/sample_trips.py, pipeline/journeys/samples.lock.json
- Trips/carta-unified/carta-unified/data/trips/{ba-hostel-sarajevo-mostar-kotor, hr-beach-week-makarska-riviera, cz-rail-prague-vienna-budapest, es-pilgrim-camino-sarria-santiago, gr-island-hopping-paros-antiparos-naxos}.json
- continent-app/public/journeys/journey/ (the five samples) and continent-app/public/journeys/type/{hostel,beach-week,rail,pilgrim,island-hopping}.json
- continent-app/src/browse/TripPriceCard.jsx, TripWeek.jsx, TripDayMap.jsx
- continent-app/src/lib/dayStats.js, tripPrice.js, tripPdf.js
- continent-app/tests/dayStats.test.mjs, tripPrice.test.mjs

**Modified:**
- pipeline/journeys/build_wire.py (new styles, samples lock, card `visits` and `photos`, `sample`)
- Trips/carta-unified/carta-unified/data/trips.master.json, pipeline/common.py, schema/trip.generated.schema.json (new styles, optional photo, highlight, dayPlaces, visits, sample and highM fields), schema/types.ts
- continent-app/public/journeys/index.json and the ten existing type files (card `visits`)
- continent-app/src/browse/JourneyPage.jsx (rewritten), JourneysSection.jsx, TripFilters.jsx, BookingOrder.jsx, DestinationsTab.jsx
- continent-app/src/lib/journeys.js (hook rule, tripHighlights, tripGallery, type labels), tripLength.js (generic lengths), dataSheet.js, packGrid.js, weekShape.js, glossary.js
- continent-app/scripts/prerender/build.mjs (samples out of the prerender)
- continent-app/src/i18n/{en,de,nl,fr,es,it}.js
- continent-app/scripts/verify_journeys.mjs, verify_trip_page.mjs, verify_destinations.mjs, verify_places_tab.mjs
- continent-app/tests/dataSheet.test.mjs, tripLength.test.mjs

## Commands run

```
git lfs pull --include=cache/journey_images.json
python3 pipeline/journeys/sample_trips.py --check && python3 pipeline/journeys/sample_trips.py
python3 pipeline/journeys/build_wire.py --no-fetch --out <scratch> --cache <scratch copy>   # diffed: the 253 journey files unchanged
python3 pipeline/journeys/build_wire.py --no-fetch
cd Trips/carta-unified/carta-unified && python3 pipeline/validate.py --wire ../../../continent-app/public/journeys
cd continent-app && npm test && node scripts/ci/design-lint.mjs && npx vite build
CARTA_PORT=5298 node scripts/verify_{journeys,trip_page,destinations,places_tab,item_pdf}.mjs
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Trip styles | 10 | 15 | +5 |
| Trips in the catalogue | 253 | 258 | +5 samples |
| Trip page height, phone (Andorra) | 6,376 px | 5,141 px | −19% |
| Trip page height, desktop (Andorra) | 4,387 px | 3,720 px | −15% |
| Words on the first screen, desktop | 212 | 97 | −54% |
| Words on the first screen, phone | 95 | 69 | −27% |
| Clipped trip titles on a style's list, phone | 24 | 0 | −24 |
| Clipped trip titles on a style's list, desktop | 9 | 0 | −9 |
| Photographs a trip can show | 1 | hero + gallery + highlights + days (samples: 5 to 7) | |
| Validator errors on the master (excluding the shared hero-size check every trip fails) | 0 | 0 | 0 |

A style's list grew from 3,027 to 11,791 px on a phone and from 1,678 to 4,494 px on a desktop: the owner asked for bigger photographs and full titles, and a tile takes about four times a row's height. The prose sentence count on the trip page rose from 43 to 48 because the cards keep the whole written text in the page (clamped to four lines on screen, opened with More); what a reader sees on arrival halved. Impeccable critique of the trip page: before 21/40; after: see "Impeccable after".

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The rail sample's hero took the Prague city trip's photograph | The sample pins win over the uniqueness pass | Another file for the sample hero; the 253 journey files diffed unchanged |
| The rail style photo was a concert in Schönbrunn | The first Vienna dossier photo | The Landwasser Viaduct with a train |
| Sample trips failed the accuracy-signals check | volatilePricing true with no verify flags | volatilePricing false |
| A beach week showed "Distance 302 km" | Bus and ferry kilometres summed as effort | Distance and climb only on walking, riding and rail weeks; travel days skipped in the totals |
| The back label read "Beach w" | A legacy max-width on the bar's back button | The back keeps its label, the bar title gives way |
| The price card slid under the section rail | Sticky top did not clear the rail | Sticky top below the rail on item pages and trips |
| The first highlight repeated as the hook and the first card | The hook prefers highlights[0] | Why this trip starts at the second highlight |
| The town exit test found no button | The start town's prices now need a start within 30 km | The harness opens the Prague city week |

## What is still open

The five samples are worked examples, not researched trips: prices, timetables, beds and opening details are to be audited by the owner (rows T431-a to T431-e). The five style photographs are views, not people doing the thing (T431-f). The fare sheet asks for an airline; a traveller arriving by train or bus wants a mode choice (T431-g). The visits line is derived from day titles for the 253 trips and reads oddly on a few ("Monday rules", "Engineered water"); an authored `visits` field fixes it (T431-h). The 253 trips carry one photograph, no highlights, no typed day stats and no day places; the page shows what they have and the contract names what to fill (T431-i). The journeys wire (five samples, five styles, card visits and photos) must be pushed to R2 with the app deploy (T431-j). Critique findings are listed under "Impeccable after".

## Rollback procedure

Revert the T431 commits on branch `claude/item-pages-visual-redesign-f8gvad` (4ecbddfe, d0f1ce10, 365205ae and the trip parts of cd94a9a7) or do not merge the branch. To remove only the samples: delete the five ids from trips.master.json and data/trips/, drop the five rows from common.py TRIP_TYPES and build_wire.py TYPE_ORDER, delete samples.lock.json, and rerun `python3 pipeline/journeys/build_wire.py --no-fetch`. Nothing reaches production data until the R2 push.

## Impeccable after

Dual-agent critique, snapshots in `Execution/P11/T430-critique/`. The trip page and list scored 21/40 before and 26/40 after (Acceptable). Fixed in the close-out commit and confirmed in one round: the alternatives' prices carry the estimate mark, the trip page has Save, the sleep slider runs from the trip's simplest beds to its most comfortable instead of naming dorms and hotels on a refuge week, the price card is shorter (what is included in two columns, the report link under the breakdown) so nothing hides in a nested scroll, and the rail's words match the headings. Held as register rows: the trip page's primary hand-off (T431-k, owner decision), the phone fold on a style's list and a compact sticky figure (T431-l), and a shorter Before you go (T431-m). The critique's second question, whether "Not quite right?" should come before the week, is answered by the owner's order of 2026-10-15 (carta-design) and left as is.
