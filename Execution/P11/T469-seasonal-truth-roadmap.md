# T469: seasonal truth, audited and written into the roadmap

## Task ID

T469

## Date

2026-10-20

## What changed

The owner brought five ideas: environmental context on the cards, a rating that varies by month, a price that follows the chosen dates, a 12-month price and weather strip with a one-tap nudge, and sunset and rain guardrails in the day planner backed by a trustworthy forecast. This task audited the code and data behind each idea and checked the external facts. It wrote the systems out in a new plan file, `Roadmap/2.10-seizoen-rating-prijs.md` (Dutch, like the roadmap), and added eleven rows to `Roadmap/Carta roadmap.md`: 1.10 and 1.11 in phase 1, 2.10 to 2.13 in phase 2, 3.9 in phase 3, and 4.9 to 4.12 in phase 4. It also updated the week plan and pointed 4.4 at the new season record. No code changed.

The audit found five things. The first is the one that matters now: the live 7-day forecast (`continent-app/src/lib/weather.js`, Open-Meteo) does not work in production. `api.open-meteo.com` is missing from connect-src in both `public/_headers` and the live CSP of carta-app.pages.dev, and the free Open-Meteo API is non-commercial only. The CI smoke filters open-meteo errors as noise, which is why nobody saw it. Second, the climate normals (NASA POWER, 2001 to 2020, harvested 14 September, manual cadence) cover all 3,868 destinations. But they hold only high, low, rain and a beach-shaped comfort index (full marks at 20 to 27 °C). They have no rain days, sun, daylight, sea temperature or time zone, and no seasonal closures exist anywhere in the data. Third, rating_v4 has no month term. Its modelled path counts a UNESCO geopark as a national park (Bochum 8.5, Witten 8.0, both tier 2). Ingest still moves scores through `zlog` in `score_significance.py`, and airport rows duplicate cities in every ranking. Fourth, the receipt already re-seasons the June-captured bed price (Edinburgh in November is 0.939/1.111 = 0.845 times June, reproduced to the cent: €1,689.42 and €182.61 a day). The weaknesses are elsewhere. The curve is a review-count demand curve with a guessed exponent 0.4, which makes it too flat (Edinburgh in August is only +5% over June). 3,251 destinations fall back to a global curve, and the planner uses a second global curve. The Explore card ignores the month entirely. All 284 stay-tier prices in the wire are fixtures. Fifth, the day planner knows each day's date and coordinates but has no time zone, no sun calculation and no indoor/outdoor field.

## Files touched

**Modified:**
- Roadmap/Carta roadmap.md
- Execution/_OPEN.md

**Created:**
- Roadmap/2.10-seizoen-rating-prijs.md
- Execution/P11/T469-seasonal-truth-roadmap.md

**Deleted:**
- None

## Commands run

Four read-only code audits by sub-agents (climate, rating, pricing, day planner). Then live probes:

```
curl "https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,PRECTOTCORR&community=RE&longitude=-3.19&latitude=55.95&format=JSON"
curl -A "CartaAudit/0.1" "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=55.95&lon=-3.19"
curl "https://api.open-meteo.com/v1/forecast?latitude=55.95&longitude=-3.19&daily=sunset&timezone=Europe/London"
curl "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/tour_occ_nin2m?geo=ES61&c_resid=TOTAL&unit=NR&nace_r2=I551-I553&lastTimePeriod=3"
curl -I https://carta-app.pages.dev   (connect-src read from the live CSP)
```

Sunrise and sunset for Edinburgh were computed with the NOAA formula in a Python one-off. The Bochum, Witten, Edinburgh and Santorini wire records were read with Python from `continent-app/public/app_data.json`.

## Config and secrets set

None.

## Before/after measurements

Not measured. This is a planning task; the plan file names the figures the later tasks must move (forecast live in production, no existing score moving more than 0.05 on a 100-place ingest, bed backtest under 15% error, 90% agreement on 60 golden destination-months, next-day rain yes/no at least 80% correct).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The owner's example nudge said "+6 hours of daylight in May or September" for Edinburgh | Hand-written figure; the real gain is +7.8 h (May) and +4.5 h (September) on 8.4 h on 14 November, sunset 16:09 | The plan requires every number in a nudge or reason to be computed from the season record |

## What is still open

The production forecast is broken and on the wrong licence. Roadmap row 1.10 moves it to MET Norway (CC BY 4.0, commercial use allowed with credit) through an own caching proxy. That needs the owner's choice of source first (T469-a).

The rating repairs in roadmap row 2.10 come before any month variation: the geopark registry, frozen `zlog` stats, frozen fallback coefficients, one row per city, a written appeal rubric, the external rank check, and confidence and reason on the page. The spread gate already fails (SD 0.99 against 0.70, limit 0.18).

Three data truth defects belong in 2.12. First, 284 fixture stay-tier rows ship in the public wire despite the apply guard. Second, 286 `inside_airbnb_city` rows carry hand-typed round values and are labelled measured. Third, there are two summer curves: the receipt uses the meta curve (July and August 1.35), while `trip_planner_pricing.js:506` passes `model=null` and falls back to DEFAULT_ACCOM_MODEL (1.25).

Small stale strings belong in 2.11 and 2.12. `i18n/en.js:2341` says 30 years of climate normals, but the data covers 20. The comments at `runtime_pricing.js:327` and `priceMonths.js:5` say the season curve comes from calendar.csv; it comes from reviews.csv.

The owner has five calls to make: the forecast source (a), the LiteAPI production key and possibly the paid pricing index (b), whether cards show the month score (c), judging the 30 biggest rating disagreements (d), and judging the 60 golden destination-months (e).

## Rollback procedure

`git revert` the T469 commit. It touches only the two roadmap files, this report and the register rows.
