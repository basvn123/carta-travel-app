# T103: I5, a price-by-month row under the weather row

## Task ID

T103 (mind-map number T099). Branch p6-i5-price-by-month in both repos.

## Date

2026-10-03

## What changed

The month strip on a journey page now has a second row under the weather row, aligned to the same twelve columns, showing which months are cheaper or dearer to stay. Under it sits one line naming the place the curve belongs to and the source, and when a month is both good by weather and cheap by price, a second line names it. That overlap, and the places where the two rows disagree, is what the task was for.

Carta does not price flights (T272), so the row is ground cost only, and it is narrower than the task text hoped. Journeys carry no monthly price of their own. The only monthly money signal in the data is the twelve value nightly stay curve of a destination (accommodation.seasonality, built from Inside Airbnb calendars, each value a ratio to the year's mean). So a trip borrows the curve of the nearest destination that has one, within 30 km of the trip's own point. If there is none in range the row is replaced by one honest sentence saying no monthly price signal is measured near the trip. Nothing is invented. Ground transport seasonality exists only as a car rental curve per country in runtime_pricing.js and was not used, because it prices a car, not a trip.

How it works. src/lib/priceMonths.js is pure: nearestCurve finds the closest destination with a 12 value curve and a city point, priceStates classes each month against the curve's own mean (cheap at 0.92 or below, dear at 1.08 or above, otherwise mid), goodAndCheap intersects with the weather months. JourneyPage asks the catalogue for the shards within 30 km of the trip (catalogue.ensureNear, the same call the map uses), then builds the row. MonthStrip, the component from T083, takes a new optional price prop. Left undefined, a screen gets the one row it always had, so beaches, lakes and mountains are unchanged. Null means looked and found nothing. Each cell carries a glyph as well as a tint: a minus for cheaper, a plus with a rule under it for dearer, so colour is never the only signal. Cheaper uses the green data tint already used for good months, mid is the paper-dim fill, and nothing new is added to the palette.

## Files touched

Modified (continent-app):
- src/components/MonthStrip.jsx
- src/browse/JourneyPage.jsx
- src/styles/23-places-pages.css
- src/i18n/en.js, nl.js, de.js, fr.js, es.js, it.js (nine keys each, monthStrip.row*, price*)

Created (continent-app):
- src/lib/priceMonths.js
- tests/priceMonths.test.mjs

Modified (root): Execution/P6/T103-price-by-month.md (this report) and Execution/_OPEN.md (rows).

## Commands run

Dev server on 5201 with its own cacheDir, Playwright at 380 and 1280 px against an Antwerp city trip (curve in range) and an Andorra hiking trip (none in range), npm run lint, npm test, npm run build, then dist/ and dist-data/ deleted. Screenshots are in wt\T103-shots, outside the repo. The coverage figure was counted with a one-off script over public/journeys/journey and app_data.json.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Journeys showing a price row | 0 of 253 | 50 of 253 (nearest curve within 30 km) | +50 |
| Journeys showing a plain "none measured" line | 0 | 203 | +203 |
| Destinations with a measured curve and a city point | not counted | 54 in 13 countries | n/a |
| npm test | 166 pass | 170 pass | +4 tests |
| Lint errors | 0 | 0 | 0 |

The task's done condition, two rows on every trip, is not met and cannot be from this data. The coverage count is bounded by where Carta has measured a curve, not by the world. A further 563 destinations carry a curve but no city point, so they cannot be matched by distance.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Price row cells did not line up with the weather row | The weather row has an info button that narrows its grid | A spacer of the button's width at the end of the price row |
| "0 km away" read oddly | Distance printed even when the curve is the trip's own city | Under 5 km the sentence names the place only |
| French catalogue failed to parse | An apostrophe in the French strings needs a backslash, and a heredoc ate it | Escaped; all six catalogues parse |

## What is still open

Coverage is 50 of 253 trips. Widening it needs monthly stay curves for more places, which is data lane work and not allowed in a wave, so the data owner would have to schedule it. The 563 destinations that have a curve but no city point could be matched if their points were filled. A monthly ground cost signal for food or local transport does not exist in the data at all. A manual look at the row on a phone with a screen reader has not been done. Open rows are T103-a to T103-c in the register.

Design pre-ship answers. 1: no hex outside :root. 2: no gradient, no new colour, no second saturated hue. 3: green is used only as data, ochre, teal and danger are not used. 4: the glyphs and month initials are measured facts in the existing mono cell, the notes are in the UI face. 5: no buttons added. 6: new copy has no em dashes or banned words, and the headline-less captions are labels. 7: the third state, a middle glyph, was removed as decoration; mid cells are an empty fill.

## Rollback procedure

Revert the merge commits in both repos, or delete src/lib/priceMonths.js and its test, remove the price prop from MonthStrip and the price effect in JourneyPage, and delete the monthStrip.row*, price* keys from the six catalogues. No data, schema or migration is touched.
