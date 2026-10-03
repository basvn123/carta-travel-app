# T098: Show city versus country provenance, and name sources in product copy

## Task ID

T098 (mind-map number T333).

## Date

2026-10-03

## What changed

The cost receipt on the destination page now says, for the bed and the food separately, whether the figure is a city measurement or a country-level one, and it names the source in the sentence. Before, the receipt printed a provenance line only for measured figures and stayed silent on everything else; the comment in the code called silence the honest default. That hid the difference this task is about: a Madrid bed price from 13,243 listings read the same as a Polish one that is a national prior.

There are now eight lines, one chosen per figure. Bed, city: "Bed: measured in Madrid, from 13,243 Inside Airbnb listings captured June 2026." Bed, country: a country-level figure from Inside Airbnb listings across the country, not measured in this town. Bed, scaled: a country-level estimate, because Inside Airbnb has no listings in that country and prices from measured countries are scaled by Eurostat's price level index. Bed, repaired: the harvested price was unusable and the median of measured towns stands in. Food, city: measured in this city, from Numbeo. Food, country: a country-level figure from Numbeo. Food, scaled: a country-level estimate from Numbeo prices in other countries scaled by Eurostat's price level index.

The choice comes from fields already on the wire. stayLevel and foodLevel decide city against country. Two new fields on the cost row, stayBasis and foodBasis (the price_source of each block, added in src/lib/costIndex.js), pick the scaled wording; they are matched with startsWith because the long-tail pass appends "+pop" and "+adr_calib" to the source. The captured date is now a month and year in the reader's language instead of 2026-06. The old keys cost.stayMeasuredN, stayMeasured, stayNational, stayRepaired, foodMeasured and foodNational are no longer read by the receipt; I left them in place.

The account FAQ answer on what the daily price is made of (account.faq5A) now names Inside Airbnb, Numbeo and Eurostat too, in all six languages. The Explore card receipt is compact and unchanged. The strings follow the project rule of no dashes and no middots.

I checked at 380px and 1280px against the dev server on Madrid (city bed, city food), Warsaw (scaled bed, country food) and Tampere (scaled bed, scaled food): lines wrap cleanly, no horizontal scroll.

## Files touched

Modified, app repo (branch p5-provenance-copy, on top of p5-publish-accuracy):
- src/components/CostSummary.jsx
- src/lib/costIndex.js (stayBasis, foodBasis)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (eight cost keys and the faq5A text each)

Modified, root repo:
- Execution/_OPEN.md

Created, root repo:
- Execution/P5/T098-provenance-and-sources-in-copy.md

## Commands run

```
npx eslint src/components/CostSummary.jsx src/lib/costIndex.js
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
npx vite --port 5209 --strictPort     (playwright screenshots of #dest=MAD, WAW, TMP; server stopped)
python (count of provenance-bearing destinations from public/app_data.json)
```

## Config and secrets set

None.

## Before/after measurements

Counted on the local public/app_data.json (3,868 destinations): 1,000 have a city-level bed price and 381 a city-level food price; 1,218 have at least one.

| Metric | Before | After | Delta |
|---|---|---|---|
| Destinations whose receipt shows a provenance line for the bed | 1,000 of 3,868 (25.9%) | 3,868 | +2,868 |
| Destinations whose receipt shows a provenance line for the food | 381 of 3,868 (9.9%) | 3,868 | +3,487 |
| Sources named in receipt copy | 1 (Inside Airbnb, in the city line only, as a place name) | 3 (Inside Airbnb, Numbeo, Eurostat) | +2 |

## What broke and how it was fixed

The first version matched the scaled sources by equality and showed the plain country wording for Warsaw and Tampere, because the stored value is airbnb_pli_scaled+pop. Fixed with startsWith, then rechecked on the page.

## What is still open

Numbeo is named in the product now, and data_licenses.md lists it as a proprietary site with no open licence and an unresolved acceptable-use risk, so naming it needs the owner's decision (T098-a). The Explore card receipt does not show provenance (T098-b). The destination page header fact and the trip receipt still show a bare euro figure with no level (T098-c).

## Rollback procedure

Revert the T098 commit in the app repo. No data, schema or route changed. The two new cost-row fields are additive.
