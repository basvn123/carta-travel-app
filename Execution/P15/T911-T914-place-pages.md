# T911 to T914: place and trip pages on one template, the new data, the PDF guides

## Task ID

T911 to T914, one batch (CLAUDE.md "Batches"), branch `p15-place-pages`.

## Date

2026-10-30

## Shared header

The owner sent five screenshots of the destination page (Montagnana) and asked for a full redesign with /impeccable: clean and professional, market research first, freedom over logic, structure and style. The same goes for Carta's own trips, and the PDF export should line up with the rest of the app. The research and the artifact "Place and Trip Pages" (https://claude.ai/artifact/Lqarb1XkHms21ULQaRv64h) followed.

The owner then gave two rounds of changes:

- Remove three lines: "Not included ... Nothing is booked yet", "A typical night, a room for two" and the "Carta estimate, <date>" stamp under the price.
- On the six additions the artifact proposed: "already add this but add a placeholder for the data, and do the necessary changes to the pipeline to include it".

The batch ran as three parallel tasks in their own worktrees (T911 pipeline, T912 and T913 pages, T914 PDFs) against one data contract written before they started (`docs/SCHEMA.md`, section "Place page and trip page redesign keys (T911)"). They were merged into the batch branch, followed by one end check and one fix commit.

**How it was checked.** Each task ran static checks: eslint on touched files, `npm test` and design-lint. design-lint reports 168 violations on the batch, the same count as `main` (all in `styles/planners-held.css`), so none are new.

For the first time in this run of batches, the end check used the real app with data. `node scripts/sync-data.mjs --split-only` rebuilds the gitignored `public/boot.json` and `public/dest/` from the committed `public/app_data.json` in about a minute. With them, `npm test` also passes the three boot.json tests (1130 pass, 0 fail).

The dev server showed Porto (`#dest=OPO`), Montagnana (`#dest=gem:montagnana`) and the Douro trip (`#journey=pt-culinary-douro-valley`) at 390 and 1440. Wikimedia photos are blocked by this session's proxy, so the check routed them to the film stills; flight fares and map tiles did not load here either.

## T911: the new data in the pipeline

### What changed

The dossier build gains stage S10 (`pipeline/dossier/derive_place_page.py`). It adds five keys and one field, each absent when there is no data:

| Key | What it holds | Source |
|---|---|---|
| `essentials` | Language codes, currency, tipping code, plugs and volts, tap water, emergency number | A per-country table; the T641 emergency harvest wins |
| `eat` | Dishes, drinks and sweets | `cache/dossier/eat_place.json` per place, else `pipeline/dossier/eat_country.json` |
| `walk` | A day on foot: the best-ranked sights within 2.5 km in the shortest walking order, minutes between stops, km, hours | Derived from the dossier's highlights |
| `similar` | Places like this: same or nearby class, similar categories, at least about 100 km away, tagged cheaper or quieter | Derived from app_data |
| `access` | Steep streets and stairs | Placeholder `cache/dossier/access.json` |
| `sleep.neighbourhoods[].suits` | Who a neighbourhood suits | Placeholder `cache/dossier/neighbourhood_suits.json` |

Journey files gain `fit` (good for, less good for) from the placeholder `Trips/carta-unified/carta-unified/data/fit.json`, read by `pipeline/journeys/build_wire.py`.

Each placeholder file has the shape `{"_about", "dests"}` (`journeys` for fit), keyed by the app_data id, with Porto or the Douro trip filled in as the worked example. Filling them later needs no code change.

### Files touched

- `pipeline/dossier/build_dossier.py`
- `pipeline/dossier/derive_place_page.py` (new)
- `pipeline/dossier/eat_country.json` (new)
- `pipeline/journeys/build_wire.py`
- `cache/dossier/eat_place.json`, `access.json`, `neighbourhood_suits.json` (new)
- `Trips/carta-unified/carta-unified/data/fit.json` (new)
- `docs/SCHEMA.md`
- `continent-app/public/dossier/*.json` (3,868 files) and `index.json`
- `continent-app/public/journeys/journey/pt-culinary-douro-valley.json`
- `data/reports/dossier_build.json`

### Before/after measurements

| Key | Dossiers before | Dossiers after |
|---|---|---|
| essentials | 0 | 3,868 (75 without an emergency number, left out as uncertain) |
| eat | 0 | 3,843 (3,842 from the country table, 1 per place) |
| walk | 0 | 444 (most places have fewer than 3 sights within 2.5 km) |
| similar | 0 | 3,854 |
| access | 0 | 1 (placeholder, Porto) |
| neighbourhood suits | 0 | 1 (placeholder, Porto) |

### What broke and how it was fixed

A full `--all` rebuild in this checkout also changes `trips` in 650 to 1,170 dossiers, plus a few `nearby`, `around` and `tips` sections, from local inputs that are not part of T911. So the rebuild commit carries only the T911 keys: they were spliced into the committed dossiers, then `content_hash` and `index.json` were recomputed. A per-file check found nothing else changed. The dossier gate passed. The owner's next normal `--all` run produces the same keys from code.

### What is still open

- Four placeholder sources need a harvest: a place's own dishes, steep streets, neighbourhood suits and trip fit (T911-a).
- pytest is not installed here, so `tests/test_parking_fold.py` did not run (T911-b).

### Rollback procedure

`git revert 7b769d8d7f 24dfcfd72c`. The new keys are additive; the page and the PDFs skip them when they are absent.

## T912: the place page as one long page

### What changed

The four tabs became one long page with a sticky jump bar: Overview, What to see, Around, When to go, Where to stay, Getting there, Practical. The bar highlights the section in view. Old `&tab=` links scroll to their section.

- **Photos:** a swipe carousel with "1 / N" and a credit pill on a phone. From 700 px, a 1 + 4 mosaic with "Show all N photos" (a dialog with every photo and its full credit) and a credit pill on the main photo. The same component serves the trip page.
- **Head and facts:** the head keeps its score, rank, UNESCO and match lines. A facts row follows: best months, crowds, hours of sights, getting around, airport.
- **New sections, each absent without data:**
  - Good to know, with a steep-streets row.
  - Eat and drink: dishes beside the existing food prices.
  - A day on foot.
  - The day cost by month.
  - Getting there from home: flight, train, coach and car with the cheapest marked. They are priced by the models Explore uses; a mode they cannot price is left out.
  - Quick facts in Practical.
  - Places like this: cards with the runtime price.
- **Price card:** € a person a day, dates, travellers and stay as one field group, the split with thin bars, then the stay and the "Total for N". One primary "Plan a trip here", with "Or plan one day here" as a quiet link.
  - From 1024 px it is a sticky right column.
  - Below 1024 px it sits inline, and a fixed bar carries the price, the dates and party, and the button. On a phone that bar takes the bottom nav's place while the page is open.
- **Removed:**
  - The owner's three lines.
  - "Not available yet" and the "No peak, lake or beach within 20 km" line.
  - The 7-day forecast, the "what the day includes" line, ClimateExtras, CrowdCalendar and the swim-safety slots, none of which is in the approved design.

### Files touched

`continent-app/src/`:
- `browse/DestinationPage.jsx`, `DestOverview.jsx`, `DestNearby.jsx`, `DestWhen.jsx`, `DestPractical.jsx`, `DestPracticalSlots.jsx`, `DestPriceCard.jsx`, `DestFood.jsx`, `PhotoGallery.jsx`, `KeyFacts.jsx`, `Neighbourhoods.jsx`
- `browse/PageTemplate.jsx` (new), `browse/placeWays.js` (new), `styles/88-place-template.css` (new)
- `i18n/{en,nl,fr,de,es,it}.js` (`destx.*` keys after `dest.priceDayUnit`)

### Before/after measurements

Not measured: the task promised no number.

### What broke and how it was fixed

The end check found these, fixed in `75972715fc`:

1. "Show all photos" drew over the credit pill at the bottom left and left a white band under the mosaic. The kit Button's own display rule outranked the mosaic's; the selector now carries `.pmos`.
2. The Stay field sat centred with a stray left border; it now spans the card, left aligned.
3. Neighbourhood and room prices printed cents ("€102.00"). They are compared, so they are now whole euros. Totals keep cents, as DESIGN.md asks for receipts and totals.
4. Beach and feature cards in Around still printed "Not available yet" from the shared rating slot. It is hidden on these two pages only; Explore keeps its slot.
5. The quick facts grid showed a grey hole after an odd last cell.
6. Porto lost "Getting around" because it has no mobility record. The dossier's car rule now answers ("No car needed").
7. Under Places like this, "Same style" and "Same kind of place" sat on every card. Only cheaper and quieter are shown.

### What is still open

- Getting there showed only the train for Porto here, because the flight sweep is fetched from a host this session cannot reach. Look once where fares load (T912-a).
- The intro of Porto says "ten hours covers them" while its facts say 7.2 hours: the intro text repeats a number from another source (T912-b).
- The day split on the card shows bed and food only; the cost model carries no sights or getting-around figure yet (T912-c).
- `scripts/verify_destination_page.mjs` still expects tabs (T912-d).

### Rollback procedure

`git revert 75972715fc 9279eed3ac` (and T913 first if it stays, since it uses `PageTemplate.jsx`).

### Screens for the end check

Porto and Montagnana at 390 and 1440: the head, the mosaic or carousel, the facts, the jump bar, each section, the price card or bottom bar, and Places like this.

## T913: Carta's trip page on the same template

### What changed

The trip page now uses the same parts as the place page:

- photos, head and badges, facts row and jump bar (Overview, Route, Day by day, Costs, Where you sleep, Getting there, Practical);
- a price card with the range a person, the start, travellers and stay, the four ranges and "Total for N", one primary "Plan this trip", and Save and PDF;
- the same bottom bar.

Its sections:

- **Overview:** good to know, and "Good for" and "Less good for" from `fit`.
- **Route:** `JourneyRoute.jsx` as the map with numbered legs.
- **Day by day:** an accordion with day 1 open and Open all.
- **Costs:** the four ranges as range bars.
- **Getting there and back:** priced from home.

### Files touched

`continent-app/src/`:
- `browse/JourneyPage.jsx`, `JourneyRoute.jsx`, `TripPriceCard.jsx`
- `styles/88-place-template.css`
- `i18n/*.js` (`jx.*` after `journey.whyTrip`)

### Before/after measurements

Not measured.

### What broke and how it was fixed

Nothing beyond the shared fixes in T912.

### What is still open

`DestinationsTab.jsx` does not pass `onPlanTrip` to the trip page, so "Plan this trip" falls back to a full reload at `?tab=trip&cc=XX` (T913-a).

### Rollback procedure

`git revert 8056eb8a32`.

### Screens for the end check

The Douro trip at 390 and 1440, and Makarska (`hr-beach-week-makarska-riviera`) for the route map.

## T914: the PDF guides on pdfKit

### What changed

`destinationPdf.js` was rebuilt on `pdfKit.js`: Figtree with tabular figures, the role tokens, photos with the credit under them, and one footer stamped "Prices estimated on <date>". Its export and arguments are unchanged.

The Porto guide has 9 pages:

1. A cover with photo, name, Score, € a person a day, four facts and a QR code to the live page.
2. At a glance: intro, why it rates, what to eat, the cost split, best months, good to know.
3. What to see: a vector pin map, the numbered list, A day on foot. It continues on page 4.
4. What to see, continued.
5. Around, continued on page 6.
6. Around, continued.
7. When to go and where to stay.
8. Practical, with the quick facts.
9. Places like this, credits and sources.

`tripPdf.js` shares the cover and puts each day on its own page; the Douro booklet has 10 pages. The "Not included" rows and "Nothing is booked yet" are never printed.

The QR code comes from `qrcode-generator` 2.0.4 (MIT, no dependencies). It is loaded lazily in its own 20.6 kB chunk; if it fails to load, the cover prints the short link.

### Files touched

- `continent-app/src/lib/pdfKit.js`, `destinationPdf.js`, `tripPdf.js`
- `i18n/*.js` (42 `pdf.` keys after `pdf.openInCarta`)
- `package.json`, `package-lock.json`

### Before/after measurements

| | Before | After |
|---|---|---|
| Fonts in the place guide | Plus Jakarta Sans, JetBrains Mono | Figtree (the app's) |
| Porto guide | Text only, no photo, no map | 9 pages, cover photo, pin map, QR |
| Douro booklet | Its own cover | The shared cover, a page per day, 10 pages |

### What broke and how it was fixed

Nothing at merge. Photos could not be drawn in the node check (Wikimedia blocked), so they printed as pdfKit's captioned grey box.

### What is still open

- Look at both PDFs once with real photos in a browser (T914-a).
- `public/fonts/PlusJakartaSans-*` and `JetBrainsMono-*` may now be unused; check other users before deleting (T914-b).

### Rollback procedure

`git revert efc485f06b 3db8130f38`, then `npm install` to drop the QR package.

## Batch

- **Config and secrets set:** none.
- **Commands run:** `python pipeline/dossier/build_dossier.py --all` (then the key splice), `node scripts/sync-data.mjs --split-only`, `npm test`, eslint, `node scripts/ci/design-lint.mjs`, `npx vite --port 5191` with Playwright.
- **Deploy:** the merged batch needs a deploy, and Cloudflare credentials are the owner's (T914-c).
