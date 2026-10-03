# T102: I4, show the rail alternative

## Task ID

T102 (mind-map number T098). Branch p6-i4-rail-alternative in both repos.

## Date

2026-10-03

## What changed

A journey page now ends its budget receipt with a "By train instead" block: a rough one-way fare per person, a door to door time, the departure city, and an "est" mark. It sits below the receipt and outside the total, because the total is a week of on-the-ground costs and the train is only a way to get there. Carta does not price flights, so the block is not a flight comparison. It says whether rail is a real option from where the traveller starts and what it roughly costs.

The figure is not new maths. src/lib/railAlternative.js builds a destination-shaped point from the trip's coordinates and country, builds the start from the traveller's departure airport, and calls legTransportOptions, which already prices the train leg through resolveGroundFare (stored quote, then calibration artifact, then country priors). The flag comes straight from that resolver: est is true for calibration and priors, false only for a stored quote. Today every result is a prior, so every line carries the est mark.

The block is hidden when there is no honest answer. A trip pinned at its country capital (coordinates.precision is country) is skipped, since a rail time to a guessed pin would be a guess too. Legs with no train, and rides over 16 hours, are skipped as well. The start comes from the catalogue row for the departure airport city when one exists, otherwise from the airport coordinates with an iso2 borrowed from a catalogue place in the same country. DestinationsTab now reads the origin prop that App already passed it and hands the start to JourneyPage as railFrom.

## Files touched

Modified:
- continent-app/src/browse/JourneyPage.jsx
- continent-app/src/browse/DestinationsTab.jsx
- continent-app/src/styles/25-feature-pages.css
- continent-app/src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (keys journey.railLabel, journey.railLine, journey.railNote)

Created:
- continent-app/src/lib/railAlternative.js
- Execution/P6/T102-rail-alternative.md

## Commands run

Measured with a throwaway node script outside the repo (T102-measure.mjs, in the wt folder) that loads public/app_data.json and the 253 files in public/journeys/journey. Then npm run lint, npm run build (dist and dist-data deleted afterwards), and a Playwright check at 380 and 1280 px on Vite port 5201, screenshots in wt/T102-shots.

## Config and secrets set

None.

## Before/after measurements

Counts come from public/journeys/journey (253 trips) and public/app_data.json, with the app's own functions.

| Metric | Before | After | Delta |
|---|---|---|---|
| Trips showing a rail line, start Charleroi (CRL) | 0 of 253 | 114 of 253 | +114 |
| Same, start Brussels (BRU) | 0 | 112 | +112 |
| Same, start Amsterdam (AMS) | 0 | 120 | +120 |
| Same, start Madrid (MAD) | 0 | 70 | +70 |
| Median rail time from CRL | none | 7.9 h | |
| Lines flagged est | n/a | 114 of 114 from CRL | |

Istria (hr-culinary-istria-truffles, pinned at Pula) from Charleroi comes out at about 120 euros and 15 h. The 61 trips pinned at a capital never show the line.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| fr.js failed to parse | An unescaped apostrophe in the French note, and a bash heredoc eats backslashes | Reworded the sentence to avoid the apostrophe |
| fr.js diff showed 8,000 lines | A sed -i pass changed its line endings | Restored the file and redid the edit with a script that keeps the endings |

## What is still open

The time and fare are the country-prior model over a straight line times 1.17, not a timetable. Transitous itineraries (already used for the reach tables) would give real durations. The 61 capital-pinned trips are not a code gap: T090 (Execution/P5/T090-j1-geolocation.md, merged) moved every one of them onto a town the itinerary names in data/trips.master.json, but the tracked wire in continent-app/public/journeys still carries the old pins, so the app reads the capital. It is the owner data-lane rebuild already listed as T090-a; after it the rail line appears on those trips with no code change. The start is the departure airport city, not the traveller's home town, so someone far from their airport gets a short figure. The rail line is not yet on the planner's cost breakdown, only on the journey page. All four are in the register.

## carta-design pre-ship answers

1. Hex values outside :root: none, the new CSS uses var(--space-*), var(--rule-soft), var(--ink) only.
2. Gradients or colours not in DESIGN.md, or a second saturated hue: none.
3. Ochre, teal or danger used outside rating, gem or destruction: no, the block uses ink and the existing est mark.
4. Mono text that is prose, or column numbers in sans: no, the figure and time sit inside a sentence set in the UI face, and the receipt rows are unchanged.
5. More than one primary button: the block adds no button.
6. Headline with a verb or number, and no em dashes or banned words: the label "By train instead" has no verb, which matches the sibling labels "Total" and "Transport"; no em dashes, middots or banned words.
7. Remove one thing: dropped an icon beside the label and a second line repeating the origin city.

## Rollback procedure

Revert the merge of p6-i4-rail-alternative in both repos. No data, schema or migration is involved. Removing the JourneyPage block, the railFrom prop, the three i18n keys and src/lib/railAlternative.js undoes it by hand.
