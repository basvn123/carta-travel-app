# Seasons and crowds logic (SEASON)

How Carta turns climate normals, sea temperature and visitor nights into the twelve-month climate strip, the best months, the traveller's month, the crowd level by month and the When to go verdict. Main code: `pipeline/harvest_climate_power.py`, `pipeline/apply_climate.py`, `pipeline/harvest_sea_temp.py`, `pipeline/harvest_tourism_density.py`, `pipeline/harvest_uk_crowds.py`, `continent-app/src/lib/when.js`, `continent-app/src/lib/crowdMonth.js`, `continent-app/src/lib/whenGuide.js`, `continent-app/src/browse/ClimateStrip.jsx`, `continent-app/src/browse/CrowdCalendar.jsx`; closures (SEASON-037 to SEASON-040, T1202, added by T1217): `pipeline/harvest_seasons.py`, `continent-app/src/lib/season.js`, `continent-app/src/browse/DestWhen.jsx`. HANDBOOK pointer: "Climate strip and best months", "When logic (the traveller's month) and When to go", "Crowds by month and the crowd calendar", "Sea temperature", "Month and \"any time\" selection" (docs/HANDBOOK.md). Last verified against the code: 2026-11-06 (T1132).

IDs are catalogue IDs only for now: the `// LOGIC: <ID>` / `# LOGIC: <ID>` tags in code and `scripts/docs/logic_check.py` are the second half of ROADMAP B3 and not yet done. Line numbers are as of 2026-11-06 and will drift; the constant name is the stable handle.

## Rules

### SEASON-001 Climate normals and lapse correction
- Decides: the daytime high and night low a place shows for each month, corrected to the place's own height.
- Rule: NASA POWER 2001 to 2020 monthly climatology at the point. Temperature is shifted by `(cell elevation - place elevation) / 1000 x 6.5`, clamped to plus or minus 5 C. A point with any missing month (`None` or -999 in any of the four variables) gets no climate at all.
- Constant: `LAPSE_C_PER_KM` in `pipeline/harvest_climate_power.py:80` = 6.5
- Constant: `MAX_LAPSE_C` in `pipeline/harvest_climate_power.py:81` = 5.0
- Test: no test

### SEASON-002 Monthly high, low and rain
- Decides: the figures above and under each bar of the strip.
- Rule: `t_high = T2M + T2M_RANGE / 2`, `t_low = T2M - T2M_RANGE / 2` (one decimal); `precip_mm = PRECTOTCORR (mm/day) x days in the month` (2020 calendar, so February has 29 days), rounded. The app rounds all three to whole numbers for display.
- Constant: `build_record` in `pipeline/harvest_climate_power.py:181`
- Test: no test

### SEASON-003 Comfort index weights
- Decides: how comfortable each month reads (bar height and shade, best months).
- Rule: `comfort = round(0.60 x temp + 0.25 x dry + 0.15 x sun)`, 0 to 100.
- Constant: `COMFORT_W` in `pipeline/harvest_climate_power.py:83` = {temp 0.60, dry 0.25, sun 0.15}
- Test: no test

### SEASON-004 Comfort sub-scores
- Decides: which weather counts as pleasant.
- Rule: temp = 100 for a daytime high of 20 to 27 C; below 20 it falls by 100/14 per degree (0 at 6 C); above 27 by 100/11 per degree (0 at 38 C). dry = `100 - precip_mm x 100/130`, floor 0. sun = `(radiation kJ - 4000) x 100/20000`, clamped 0 to 100 (radiation = ALLSKY_SFC_SW_DWN x 3600).
- Constant: `_temp_score`, `_dry_score`, `_sun_score` in `pipeline/harvest_climate_power.py:86` to `:99`
- Test: no test

### SEASON-005 Best months
- Decides: the months named "Best weather" on the strip, the key facts, Explore cards and every in-season filter.
- Rule: every month whose comfort is at least the year's peak comfort minus 8. Shipped as `climate.best` (sync-data copies `summary.best_months`). The summary also records the warmest month (highest `t_high`) and the wettest (highest `precip_mm`).
- Constant: literal `best - 8` in `pipeline/harvest_climate_power.py:208`
- Test: no test

### SEASON-006 Comfort colour tiers
- Decides: the bar shade and legend word (ideal, good, mixed, poor), and the month tiers When to go reasons with.
- Rule: comfort 78 or more great, 60 or more good, 45 or more mixed, else poor.
- Constant: `comfortTier` in `continent-app/src/lib/whenGuide.js:27` = 78 / 60 / 45
- Test: `continent-app/tests/whenGuide.test.mjs` :: "T1022: Rome's months carry comfort and crowd tiers"

### SEASON-007 Bar height
- Decides: how tall each month's bar is.
- Rule: `height = 20% + 80% x (comfort - min) / (max - min)` over the place's own twelve months (span 1 when all equal), so every place's best month fills the track. A climate block without exactly twelve months draws no strip.
- Constant: inline in `continent-app/src/browse/ClimateStrip.jsx:114`
- Test: no test

### SEASON-008 Best months wording and the chosen month
- Decides: how the best months read ("Apr to May, Sep to Nov") and which bar is outlined.
- Rule: months are sorted and collapsed into runs of consecutive numbers, each run "A to B" (never a hyphen), joined by commas, month names from Intl in the reader's language. The traveller's month (`month` prop) gets the outlined `is-chosen` column. With `figures` the "Best weather" line is hidden (the key facts name it).
- Constant: `fmtMonthRanges` in `continent-app/src/browse/ClimateStrip.jsx:32`
- Test: no test

### SEASON-009 Rain days and wind
- Decides: the "Rain days" and "Wind" rows of the climate extras.
- Rule: rain days = mean, over the years present, of the days in that calendar month with at least 1 mm (one decimal); wind = mean of every valid day's 10 m wind (m/s, one decimal). POWER fill values (-990 or less) are skipped; a month with no valid day is null. The app shows wind as `round(m/s x 3.6)` km/h.
- Constant: `RAIN_DAY_MM` in `pipeline/harvest_climate_power.py:72` = 1.0
- Constant: `windKmh` in `continent-app/src/lib/waterFacts.js:47` = x 3.6
- Test: `continent-app/tests/waterFacts.test.mjs` :: "wind converts m/s to km/h"

### SEASON-010 Sunshine hours (modelled)
- Decides: the "Sunshine hours" row, always labelled an estimate.
- Rule: Angstrom-Prescott inverted: `n/N = (Rs/Ra - 0.25) / 0.50`, clamped 0 to 1, hours = `n/N x day length x days in month`, Ra and day length at mid-month for the place's latitude. Null when the radiation series is not twelve non-negative numbers.
- Constant: `A_ANGSTROM`, `B_ANGSTROM` in `pipeline/derive_sunshine.py:35` = 0.25, 0.50
- Test: no test

### SEASON-011 Climate extras rows and placeholders
- Decides: which extras rows show figures and which show the "not yet" placeholder.
- Rule: each series (rain days, wind, sun, water, altitude) is used only when it is an array of exactly twelve; the compact wire names (`rd`, `wind`, `elev`) and master names (`rain_days`, `wind_ms`, `elev_m`) are both read. A missing series keeps its row with `NotYet`, never a blank. Water is marked an estimate only when the caller's `water.est` says so.
- Constant: `climateExtras` in `continent-app/src/lib/waterFacts.js:33`; `ClimateExtras` in `continent-app/src/browse/ClimateStrip.jsx:164`
- Test: `continent-app/tests/waterFacts.test.mjs` :: "climateExtras reads the compact and the master names, and tolerates none"

### SEASON-012 Temperature at altitude
- Decides: the "High at <peak>" and "Low at <peak>" rows.
- Rule: the highest mapped peak around the place; highs and lows shifted by `gain / 1000 x 6.5` C. No row when the climate has no own elevation, the peak height is unknown, or the gain is under 150 m (the valley figures apply).
- Constant: `LAPSE_C_PER_KM` in `continent-app/src/lib/waterFacts.js:17` = 6.5
- Constant: `MIN_ALTITUDE_GAIN_M` in `continent-app/src/lib/waterFacts.js:20` = 150
- Test: `continent-app/tests/waterFacts.test.mjs` :: "altitudeSeries lapses the valley figures and needs the town's elevation"
- Test: `continent-app/tests/waterFacts.test.mjs` :: "highPointOf takes the highest peak with an elevation"

### SEASON-013 Sea temperature climatology
- Decides: the twelve water temperatures a coast, lake or beach shows.
- Rule: NASA JPL MUR SST monthly means, 2017 to 2022, sampled every 0.03 degrees. A cell counts only if all twelve calendar-month means exist and every one lies in -2 to 32 C. Lakes are included (it is a water mask).
- Constant: `YEAR_FROM, YEAR_TO` in `pipeline/harvest_sea_temp.py:61` = 2017, 2022
- Constant: `STRIDE` in `pipeline/harvest_sea_temp.py:62` = 3 (x 0.01 degree)
- Constant: `PLAUSIBLE` in `pipeline/harvest_sea_temp.py:65` = (-2.0, 32.0)
- Test: `tests/test_sea_temp_fixture.py` :: "test_harvest_from_recorded_response_is_resumable"

### SEASON-014 Sea temperature reach
- Decides: whether a beach or a place gets a water temperature at all.
- Rule: the nearest valid cell (haversine) within 6 km of a beach or 20 km of a destination. `apply_climate.py` gates the destination row again at 20 km and folds it in as `climate.water_c`; the beach export ships it as `sea_temp`.
- Constant: `BEACH_MAX_KM` in `pipeline/harvest_sea_temp.py:63` = 6.0
- Constant: `DEST_MAX_KM` in `pipeline/harvest_sea_temp.py:64` = 20.0
- Constant: literal `sea.get("km", 99) <= 20` in `pipeline/apply_climate.py:111`
- Test: `tests/test_sea_temp_fixture.py` :: "test_rows_reach_the_beach_wire_and_the_climate_fold"

### SEASON-015 Beach sea strip
- Decides: whether a beach page draws the sea-by-month strip and which months it highlights.
- Rule: only twelve finite numbers (numeric strings accepted) draw a strip; otherwise none. The three warmest months are highlighted, the warmest first.
- Constant: `seaByMonth` in `continent-app/src/lib/waterFacts.js:235`
- Test: `continent-app/tests/seaTemp.test.mjs` :: "a fixture-built beach row gives twelve figures and its three warmest months"
- Test: `continent-app/tests/seaTemp.test.mjs` :: "a beach with no water cell, or a broken series, draws no strip"

### SEASON-016 Sea temperature harvest pace and resume
- Decides: how fast new water figures arrive and that a refused tile never blanks the rest.
- Rule: at most one ERDDAP call every 1.5 s; each 1 degree tile is cached atomically (empty tiles too); a tile refused after four tries is skipped; past the run deadline no new tile is fetched and the run exits with code 3 to resume next time.
- Constant: `DEFAULT_DELAY_S` in `pipeline/harvest_sea_temp.py:74` = 1.5
- Test: `tests/test_sea_temp_fixture.py` :: "test_polite_pace_between_calls"
- Test: `tests/test_sea_temp_resilience.py` :: "test_refused_tile_is_skipped_and_cached_tiles_still_answer"
- Test: `tests/test_sea_temp_resilience.py` :: "test_deadline_stops_new_fetches"

### SEASON-017 The traveller's month (resolveWhen)
- Decides: the one month every screen (crowds stat, quiet flag, rails, month fact) talks about.
- Rule: first match wins: Explore month filter `xm` 1 to 12 gives that month; `dateFlex 'any'` gives any; no valid departure month gives any; `dateFlex 'month'` gives the departure month; dates without `ownDates` (Carta's defaults) give any; else exact: the start month, plus the return month when it differs and the return date is not before departure.
- Constant: `resolveWhen` in `continent-app/src/lib/when.js:29`
- Test: `continent-app/tests/keyStats.test.mjs` :: "when: exact dates read the start month, a span holds both"
- Test: `continent-app/tests/keyStats.test.mjs` :: "when: a month, the Explore month filter and any time"

### SEASON-018 Explore month filter follows to the place page
- Decides: that a place opened from Explore with a month filter speaks about that month.
- Rule: the destination page reads `xm` from the query string; only an integer 1 to 12 counts, and it then wins over the dates.
- Constant: `xmFromSearch` in `continent-app/src/lib/when.js:47`
- Test: `continent-app/tests/keyStats.test.mjs` :: "when: the Explore month filter in the URL wins over the dates (destination page)"

### SEASON-019 A trip over two months reads the busier one
- Decides: which month's crowd tier a trip spanning two months shows.
- Rule: the month with the larger crowd share (`crowding.monthly.share`); with no share series, the first month.
- Constant: `busiestMonth` in `continent-app/src/lib/when.js:63`
- Test: `continent-app/tests/keyStats.test.mjs` :: "when: a span uses the busiest month by crowd share"

### SEASON-020 Annual crowd tier
- Decides: whether a place reads Quiet, Moderate, Busy or Crowded over the year.
- Rule: density = Eurostat nights spent (newest year with a value, per region) / spherical land area of the NUTS 3 region. Tiers by the 25th, 50th and 75th percentiles of `ln(1 + density)` across all regions: below p25 quiet (0), below p50 moderate (1), below p75 busy (2), else crowded (3). Cut-offs are stored in density units in `meta.crowding_model`.
- Constant: `assign_tiers` in `pipeline/harvest_tourism_density.py:236` = percentiles (25, 50, 75)
- Constant: `TIER_LABELS` in `pipeline/harvest_tourism_density.py:79`
- Test: no test

### SEASON-021 Place to crowd region
- Decides: which region's crowding a place inherits, or none.
- Rule: the place's city point (`city_lat/lon`, else `lat/lon`) inside a region polygon; a point just outside (a coast) takes the nearest region within 0.07 degrees (about 8 km); otherwise no crowding block.
- Constant: literal `0.07` in `pipeline/harvest_tourism_density.py:292` and `pipeline/harvest_uk_crowds.py:167`
- Test: `tests/test_uk_crowds.py` :: "test_places_get_region_and_monthly_shape" (UK path only)

### SEASON-022 Monthly visitor share
- Decides: the seasonal shape behind every month's crowd tier.
- Rule: each month's fraction of the year's nights, from the NUTS 2 region, else the country; only years with all twelve months (and a positive total) count, newest first, averaged over at most three.
- Constant: `MONTHLY_MAX_YEARS` in `pipeline/harvest_tourism_density.py:73` = 3
- Test: `tests/test_uk_crowds.py` :: "test_only_complete_years_count"

### SEASON-023 Monthly crowd tier (rule t649-v1)
- Decides: the crowd word for a chosen month.
- Rule: `raw = 3 x log2(12 x share)` (share floored at 1e-6); shift = 0 when `|raw| < 0.5`, else `round(raw)`; shift limited to +1 and -2; `tier = annual tier + shift`, clamped 0 to 3.
- Constant: `SEASON_GAIN` in `pipeline/harvest_tourism_density.py:250` = 3.0
- Constant: `SEASON_MAX_UP` in `pipeline/harvest_tourism_density.py:251` = 1
- Constant: `SEASON_MAX_DOWN` in `pipeline/harvest_tourism_density.py:252` = 2
- Constant: `SEASON_DEAD_BAND` in `pipeline/harvest_tourism_density.py:253` = 0.5
- Constant: `RULE_VERSION` in `pipeline/harvest_tourism_density.py:254` = "t649-v1"
- Test: `tests/test_uk_crowds.py` :: "test_places_get_region_and_monthly_shape"

### SEASON-024 Crowds where Eurostat has no data
- Decides: crowd levels for Great Britain, Bosnia, Faroes, Moldova and Kosovo.
- Rule: GB by ITL1 polygon, BA, FO, MD, XK as one region per country with a fixed land area. Density from the newest complete year's nights; tier against the Eurostat cut-offs in `meta.crowding_model` (same scale everywhere); monthly tier by `month_tier`. A place that already has a crowding block is never overwritten; with no input CSV the task does nothing.
- Constant: `COUNTRY_AREA_KM2` in `pipeline/harvest_uk_crowds.py:52` = {BA 51209, FO 1393, MD 33846, XK 10887}
- Constant: `tier_of` in `pipeline/harvest_uk_crowds.py:60`
- Test: `tests/test_uk_crowds.py` :: "test_places_get_region_and_monthly_shape"

### SEASON-025 The crowd answer for the traveller's month
- Decides: what the Crowds stat says: one month's word, a pattern, a flat level, or the placeholder.
- Rule: with a month: that month's tier from a valid twelve-integer series, else null (never the annual tier shown as the month's). With any time: no series gives the annual tier as flat; a series whose low equals its high is flat; otherwise a pattern naming the months at the lowest and at the highest tier.
- Constant: `crowdFor` in `continent-app/src/lib/crowdMonth.js:22`
- Test: `continent-app/tests/keyStats.test.mjs` :: "crowds: Lake Como reads moderate in November and crowded in August"
- Test: `continent-app/tests/keyStats.test.mjs` :: "crowds: any time names quiet and busy months; a flat year says so"
- Test: `continent-app/tests/keyStats.test.mjs` :: "crowds: the island is moderate in winter, crowded in summer"

### SEASON-026 Not crowded flag
- Decides: which places pass the Explore and guided search "Not crowded" filter and the quiet rail.
- Rule: the month's tier (or the annual tier with no month) is at most 1, so Quiet and Moderate pass. A month with no monthly series falls back to the annual tier; no data never passes.
- Constant: `QUIET_MAX_TIER` in `continent-app/src/lib/crowdMonth.js:55` = 1
- Test: `continent-app/tests/keyStats.test.mjs` :: "crowds: no monthly series is the placeholder for a month, but the flag keeps the yearly level"

### SEASON-027 Quiet rail only in high season
- Decides: when Explore shows the "quiet" rail.
- Rule: only when the rail month is June to September; the rail month is the Explore month filter, else the traveller's month, else the shown departure month, else the current month.
- Constant: literal `month >= 6 && month <= 9` in `continent-app/src/browse/ExploreTab.jsx:1155`; `railMonth` in `continent-app/src/browse/ExploreTab.jsx:433`
- Test: no test

### SEASON-028 Crowd badge on the place page
- Decides: whether the place page shows a crowd pill with its data year.
- Rule: only for the annual tier 0 (Quiet) or 3 (Crowded); middle tiers show no pill (they still appear in the Crowds key fact).
- Removed: `CrowdingBadge.jsx` and `CrowdCalendar.jsx` were deleted by T1163 (H14) as dead files with no importer, so no screen shows this pill today; the crowd tier still appears in the Crowds key fact.
- Test: no test

### SEASON-029 In-season filters and rails
- Decides: which places the Explore month filter keeps, the "now", "beach" and cost rails, and the card line "good in <month>".
- Rule: a place is in season when the month is in its `climate.best`. The month filter drops places outside; "now" also needs a Very good rating, the cost rail a Good rating and a day cost under the ceiling. The card preview says "good in <month>" when in season, else lists its best months.
- Constant: `inSeason` in `continent-app/src/browse/explore/useExploreRails.js:22`; month filter in `continent-app/src/browse/explore/useExploreRows.js:38`; `CardPreview` at `continent-app/src/browse/explore/ExploreCard.jsx:52`; `inMonth` in `continent-app/src/browse/ExploreRails.jsx:78`
- Test: no test

### SEASON-030 Best months of a region
- Decides: the best months a coast or range page names.
- Rule: nothing unless at least half the towns carry best months; then the months named by at least half of those towns, sorted.
- Constant: `bestMonthsOf` in `continent-app/src/lib/regions.js:330`
- Test: `continent-app/tests/regions_t498.test.mjs` :: "bestMonthsOf needs climate on at least half the towns"

### SEASON-031 Good months of a country
- Decides: the good months on a country page.
- Rule: each place's best months vote; a month is good when its votes reach 60% of the top month's votes.
- Constant: literal `peak * 0.6` in `continent-app/src/browse/CountryPage.jsx:137`
- Test: no test

### SEASON-032 Country brief month verdict
- Decides: whether the planner's country brief calls the trip month good, shoulder or off.
- Rule: good when the month is in the country guide's `best_months`; ok (shoulder) when the month before or after is; otherwise off; no verdict without a month or a list.
- Constant: `monthVerdict` in `continent-app/src/planner/CountryBrief.jsx:139`
- Test: no test

### SEASON-033 Best months key fact
- Decides: the "Best time" key fact on the place page.
- Rule: the dossier's `when.best` when it has months, else `climate.best`.
- Constant: inline in `continent-app/src/browse/DestinationPage.jsx:411`
- Test: no test

### SEASON-034 When to go verdict
- Decides: the written recommendation on the place's When to go section.
- Rule: best = `climate.best`, else months tiered great or good; quieter = great or good months outside best with a known crowd tier at most 1; hot = months with a high of 31 C or more and busy or unknown crowds; cold = poor months under 31 C; the best months' range of highs is also given.
- Constant: `when.guide.hot_c` in `continent-app/config/pricing.json:206` = 31
- Constant: `whenVerdict` in `continent-app/src/lib/whenGuide.js:66`
- Test: `continent-app/tests/whenGuide.test.mjs` :: "T1022: the verdict names the best months, hot and packed ones, and cold ones"
- Test: `continent-app/tests/whenGuide.test.mjs` :: "T1022: a pleasant quiet month is offered as the quieter choice"

### SEASON-035 Stay price by month
- Decides: the bed price row of When to go and its "prices hardly change" line.
- Rule: hostel reads `dorm`; hotel the first of hotel3, hotel4, hotel2, hotel5 with twelve values; home `bnb_home`. Only months marked measured (`season_q` letter `m`) and above 0 carry a figure. Flat when dearest / cheapest is under 1.1.
- Constant: `when.guide.stay_flat` in `continent-app/config/pricing.json:207` = 1.1
- Constant: `STAY_KINDS` in `continent-app/src/lib/whenGuide.js:39`
- Test: `continent-app/tests/whenGuide.test.mjs` :: "T1022: stay prices by month show only the scraped months"

### SEASON-036 Crowd standing
- Decides: the "busier than N% of Europe's places" line.
- Rule: share of the other places with a density figure that have fewer nights per km2 (`below / (n - 1)`); null without a figure or with fewer than two places.
- Constant: `crowdStanding` in `continent-app/src/lib/whenGuide.js:110`
- Test: `continent-app/tests/whenGuide.test.mjs` :: "T1022: the crowd standing is the share of places with fewer nights"

### SEASON-037 Facility months and confidence
- Decides: the months a hut, lift, ferry or a place's own facility (a lido) is open, and how sure Carta is.
- Rule: OSM `opening_hours` read at month level only (rules split on `;` and `||`, a later rule overrides an earlier one, `off` or `closed` closes its months, a month counts open when any day of it is; week numbers, easter or nth weekdays make the string unreadable and the facility is skipped); else a `seasonal=` word by the European convention. Confidence: high = opening_hours months with a check date under three years old, medium = opening_hours months with no or an older check date, low = a seasonal word only.
- Constant: `CHECK_FRESH_DAYS` in `pipeline/harvest_seasons.py:91` = 3 x 365
- Constant: `SEASON_WORDS` in `pipeline/harvest_seasons.py:97` = spring 3 to 5, summer 6 to 8, autumn 9 to 11, winter 12 to 2
- Constant: `months_open` / `season_of` in `pipeline/harvest_seasons.py:140`, `:192`
- Test: `tests/test_seasons.py` :: "test_month_reader"
- Test: `tests/test_seasons.py` :: "test_confidence_from_tags"

### SEASON-038 When a place itself is closed
- Decides: whether a destination gets `season.open` (shut part of the year) or only a list of seasonal things nearby.
- Rule: `open` is set only when (own) a seasonal facility within 2 km carries the destination's own name, or (ferry) the destination is an island and every ferry within 3 km is seasonal with medium or high confidence (the union of their months; one year-round ferry keeps the island open). A hut or lift near a village never closes the village. `conf` is the lowest confidence behind `open`, `checked` the newest check date. Up to four seasonal facilities nearby, nearest first, go under `items` (huts within 8 km, lifts 5, ferries 3, own facilities 2). No `open` and no item: no block at all, which means nothing seasonal is mapped, never open all year.
- Constant: `OWN_KM` in `pipeline/harvest_seasons.py:92` = 2.0
- Constant: `FERRY_KM` in `pipeline/harvest_seasons.py:93` = 3.0
- Constant: `ITEM_KM` in `pipeline/harvest_seasons.py:94` = hut 8, lift 5, ferry 3, place 2
- Constant: `KEEP_ITEMS` in `pipeline/harvest_seasons.py:95` = 4
- Constant: `season_block` in `pipeline/harvest_seasons.py:264`
- Test: `tests/test_seasons.py` :: "test_join_on_fixtures"
- Test: `tests/test_seasons.py` :: "test_kinds_and_year_round_ferry_kept"

### SEASON-039 Closed months on the place page
- Decides: the shut months drawn on the place's month strip and the nearby seasonal items listed under it.
- Rule: closed months are the twelve months minus `season.open`, none when `open` is missing or holds all twelve; a low confidence block says "may be closed" instead of "closed"; items need a name and a part-year month list, at most four.
- Constant: `closedMonths` / `seasonItems` in `continent-app/src/lib/season.js:22`, `:39`
- Test: `continent-app/tests/seasons.test.mjs` :: "closed months are the complement of the open ones; none without a block"
- Test: `continent-app/tests/seasonStrip.test.mjs` :: "a low-confidence season says "may be closed" and that it is a guide"

### SEASON-040 Closed places are not suggested that month
- Decides: whether the trip finder may put a place in a trip for a month, and which month it picks.
- Rule: a place is skipped for a month only when its block has medium or high confidence and the month is closed; a low confidence block is still suggested (a guessed season never hides a place). The finder's best month skips months the first place is shut while another month is open; the trip's places are then drawn only from places open that month.
- Constant: `SKIP_CONF` in `continent-app/src/lib/season.js:17` = ["high", "medium"]
- Constant: `openIn` in `continent-app/src/lib/season.js:30`
- Constant: `bestMonth` in `continent-app/src/lib/recommend/candidates.js:94`
- Test: `continent-app/tests/seasons.test.mjs` :: "openIn skips only medium or high confidence; a low one is still suggested"
- Test: `continent-app/tests/seasons.test.mjs` :: "bestMonth does not choose a month the first place is shut"

## Rules with no test

SEASON-001, SEASON-002, SEASON-003, SEASON-004, SEASON-005, SEASON-007, SEASON-008, SEASON-010, SEASON-020, SEASON-027, SEASON-028, SEASON-029, SEASON-031, SEASON-032, SEASON-033

## HANDBOOK disagreements

| HANDBOOK says | Code does | Where |
|---|---|---|
| Crowds Limits: guided search's Not crowded filter keeps only tier 1 and drops Quiet places (T475-f) | `quietOk` calls `quietFor`, which passes tier 0 and 1 (`QUIET_MAX_TIER` 1) | `continent-app/src/lib/guidedSearch.js:47`, `continent-app/src/lib/crowdMonth.js:55` |
