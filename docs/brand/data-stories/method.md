# Method note: the Carta week basket (Europe Cost Index 2027)

Status: draft, T1130 (ROADMAP K5). For the owner, for journalists who ask, and for the next session that reruns the numbers. Every figure here and in the two story drafts comes from `docs/brand/data-stories/data/basket_2027.json`, which `scripts/stories/basket_per_country.mjs` builds from the shipped data. If a figure is not in that file, it does not go in a story.

## What the basket is

One person, one week (7 nights), in euros, at a place in Carta's catalogue.

- **Bed:** an entire place (an apartment) shared by two adults, at the place's annual median price from Carta's own Booking.com scrape, plus Carta's estimate of the fees a guest pays on top: 8% weekly discount from 7 nights, a cleaning fee of half a night, a 14% service fee (`stay.fees` in `continent-app/config/pricing.json`). Split over the two people.
- **Food and drink:** the Easygoing week (`lifestyle.default`): 5 dinners out, 4 casual lunches, 2 fast food meals, 7 beers, 1 club night (entry plus 3 drinks), 1 coffee a day, 2 days of self catering from the supermarket. Prices per item come from the food layer (`dest.costs`).
- **Week = (bed + food and drink a person a day) x 7.** This is exactly the day price the app shows on an Explore card for the default request (owner decision B5: two people, an entire place, Easygoing, any time of year). The script calls the app's own price engine (`priceDays` in `continent-app/src/lib/price/priceDay.js`); it does not keep a second copy of the formulas.

**Not in the basket:** getting there (the flight sweep lives on R2 and is not in the shipped catalogue), local transport (no place has a fare yet, register T714-b), activities, entry tickets, events and car hire. A story must say "bed, food and drink" and never "the whole trip".

## How a country number is made

1. Every place in the catalogue is priced with the default request. A place without a bed price or a food price stays unpriced; it is never counted as cheap (price rule 8).
2. The country figure is the **median** week over that country's priced places, with the 25th and 75th percentile as the spread. A median, so one luxury resort does not move the country.
3. A country with fewer than **10** priced places (`MIN_RANK_N`) is listed in the data but **not ranked**: Kosovo, Moldova, San Marino, Malta, Andorra, Luxembourg, Iceland, Liechtenstein, the Faroe Islands and Monaco in this run. Do not put them in a ranking or a headline.
4. "Europe" is the median week over all 3,353 priced places, not an average of countries.
5. Percentages against Belgium are (country median minus Belgian median) / Belgian median, rounded to one decimal in the data; the drafts round to whole percent.

## Sample sizes and as-of dates (this run)

| What | Value |
|---|---|
| Places in the catalogue | 3,868 |
| Places priced (bed and food) | 3,353 |
| Places without a bed price (scrape never reached them) | 515 |
| Countries ranked (10 or more priced places) | 33 |
| Belgium | 43 of 48 places priced |
| Netherlands | 128 of 144 places priced |
| Bed prices scraped | 23 to 30 October 2026 (Booking.com, probe dates spread over the year) |
| Stays build | 3 November 2026 |
| Food model | `carta_food_v2`, prices as of September 2026, harvested 22 October 2026 |
| Catalogue file stamp | 7 June 2026 (`meta.generated_at`; the bed and food layers inside it are newer, see above) |

The per-country sample sizes, spreads and capture dates are in `basket_2027_countries.csv` (columns `priced`, `week_p25`, `week_p75`, `beds_captured_from`, `beds_captured_to`). Quote the sample size next to any country figure a journalist asks about.

## What is measured and what is estimated

Say this plainly in every pitch.

- **Measured:** bed prices. Carta's own scrape of Booking.com apartments for two, per place. 14 priced places borrowed their country's median because their own price fell outside the sanity bounds (`stay.repair`), and 6 fell back to another stay type (`beds_repaired`, `beds_tier_fallback` per country). Observation counts per tier are in the stays wire on R2, not in the shipped catalogue, so this run cannot say how many properties stand behind each place.
- **Estimated:** the guest fees on an entire place (Carta's estimate of Airbnb style fees, applied to Booking apartments too), and the food basket's frequencies (the Easygoing preset is a Carta choice, not a survey).
- **Modelled:** food and drink prices. A Belgian baseline scaled by Eurostat's restaurant and hotel price levels and a regional tilt, checked against measured prices in 24 countries. Leave-one-country-out error per item is 9 to 24 percent (largest for beer, 24.2%). For five countries (Bosnia and Herzegovina, Cyprus, Montenegro, North Macedonia, Kosovo) food is modelled with no measured anchor, five small ones use an older model, and the Faroe Islands has no food anchor at all (`food_anchor` column). A food figure is good for "cheaper or dearer", not for cents.
- **Not a population average:** the median runs over the places Carta lists (towns, cities, villages and areas a traveller visits), not over where people live. Countries where Carta lists many seaside or island places read dearer than a resident's cost of living.

## Rules for the story

1. Every number is copied from `basket_2027.json`; whole euros for weeks, whole percent for differences.
2. Each country figure carries "median of N places" somewhere a reader can find it (a footnote is enough).
3. Always say "bed, food and drink, one person, one week, two sharing an apartment".
4. Never call it the cost of a holiday or a trip; the flight is not in it.
5. Name the as-of months: "bed prices measured in October 2026, food prices as of September 2026".
6. Rerun the script on the day of publication. If `--check` fails, the data moved: rerun and re-read every figure in the drafts before sending.
7. A single place figure (Charleroi, Bruges) is that one place's median bed and its region's food prices: fine to quote, not a ranking.

## Rerun

```
cd continent-app && npm ci && cd ..
node scripts/stories/basket_per_country.mjs           # writes the two data files
node scripts/stories/basket_per_country.mjs --check   # exit 1 if they no longer match the shipped data
```

No network. The output has no timestamp, so the same data gives the same files.
