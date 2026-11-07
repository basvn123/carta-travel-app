# Place rating logic (RATING)

How Carta turns a hand or rubric judgement plus beauty, depth and recognition into one 0 to 10 place score and a band word, how POIs get their three labels, how nature items sit on the same ladder, and how the app prints all of it. Main code: `pipeline/rating_layer.py`, `pipeline/rating_config.py`, `pipeline/appeal_scale.py`, `pipeline/apply_rating_layer.py`, `pipeline/score_significance.py`, `pipeline/poi_labels.py`, `pipeline/nature_tiers.py`, `pipeline/country_context_layer.py`, `continent-app/config/rating.json`, `continent-app/config/rating_anchors.json`, `continent-app/src/lib/rating.js`, `continent-app/src/browse/RatingSheet.jsx`. HANDBOOK pointer: "Scores, ranking and seasons", from "Place rating (Carta rating v5)" to "Trail rating (0 to 10)" (docs/HANDBOOK.md). The trail scorer's own parts and weights belong to the trails file of this catalogue; here a walk is only a nature item on the ladder (RATING-033 to RATING-036, read in the app through `trailRating` = `natureRating`, `continent-app/src/lib/trailCards.js:74`). Last verified against the code: 2026-11-06 (T1132).

IDs are catalogue IDs only for now: the `// LOGIC: <ID>` / `# LOGIC: <ID>` tags in code and `scripts/docs/logic_check.py` are the second half of ROADMAP B3 and not yet done. Line numbers are as of 2026-11-06 and will drift; the constant name is the stable handle.

## Rules

### RATING-001 The v5 score blend
- Decides: the raw quality Q behind every place score.
- Rule: with formula `v5`, `Q = 0.60 A + 0.15 B + 0.15 D + 0.10 R`, each part on 0 to 10 (A appeal after the class scale, B `beauty.score`, D depth x 10, R recognition x 10), clamped to 0 to 10. Formula `v4` (the rollback) uses `weights` 0.70 / 0.13 / 0.06 / 0.11 instead.
- Constant: `weights_v5` in `continent-app/config/rating.json:17` = appeal 0.60, beauty 0.15, depth 0.15, recognition 0.10
- Constant: `formula` in `continent-app/config/rating.json:14` = "v5"
- Constant: `blend_score` in `pipeline/rating_layer.py:552` (v5 branch at 569)
- Test: no test

### RATING-002 Appeal source order
- Decides: which judgement a place is scored on, and so its confidence.
- Rule: a hand score in `app_data/curated_appeal.json` always wins; else (formula v5 only) the rubric score in `app_data/rubric_appeal.json`; else no appeal and the place takes the estimate (RATING-005).
- Constant: `load_appeal` in `pipeline/rating_layer.py:277`
- Test: no test

### RATING-003 Per-class appeal scale
- Decides: how far a village or town can climb compared with a metro, without reordering any class.
- Rule: appeal at or below the class median is unchanged. Above it `t = min(1, (a - median) / (best - median))`, `out = median + (ceiling - median) x t^0.7`, capped at the class ceiling, two decimals. Median and best per class are frozen in the reference; a class with fewer than 20 hand scores, or whose best already sits at its ceiling, gets no scale.
- Constant: `appeal_scale.class_ceiling` in `continent-app/config/rating.json:164` = metro 10.0, city 9.7, area 9.7, town 9.6, village 9.6 (default 9.6)
- Constant: `appeal_scale.gamma` in `continent-app/config/rating.json:166` = 0.7
- Constant: `rescale` in `pipeline/appeal_scale.py:158`
- Test: no test

### RATING-004 Place class
- Decides: which class a place is compared within (scale, curves, depth radius, label caps).
- Rule: `place.class` when set, else by GeoNames population: no population is `area`; 300,000 or more `metro`; under 50,000 and named as a landscape, or tagged island, `area`; 50,000 or more `city`; 8,000 or more `town`; under 1,200 with a nature tag and no settlement tag `area`; else `village`.
- Constant: `METRO_POP`, `CITY_POP`, `TOWN_POP` in `pipeline/place_layer.py:55` = 300000, 50000, 8000
- Constant: `classify` in `pipeline/place_layer.py:140`; `class_of` in `pipeline/appeal_scale.py:178`
- Test: no test

### RATING-005 Estimate for a place with no appeal
- Decides: the score of a place nobody has hand or rubric scored yet.
- Rule: `Q = c1 x recognition + c2 x beauty + c3 x depth + c4` with frozen least squares coefficients (fitted only on a recalibration, refused under 200 scored places), then read off the class's frozen anchor curve (piecewise linear, flat outside the knots), capped at the class ceiling.
- Constant: `fallback.min_n` in `continent-app/config/rating.json:159` = 200
- Constant: `fit_fallback` in `pipeline/rating_layer.py:506`; `apply_anchor_curves` in `pipeline/appeal_scale.py:345`
- Test: `tests/test_rating_distribution.py` :: "test_anchor_curve_meets_the_contract"

### RATING-006 Golden pair guard
- Decides: that an estimate never outranks a place the editors already ranked above it.
- Rule: for each pair in `tests/golden_ratings.json` whose winner carries an appeal (hand or rubric) and whose loser is an estimate, the loser is clamped to `round(winner, 1) - 0.1`. It runs after the anchor curve and before the class curve (RATING-007).
- Constant: `GOLDEN_ANCHORS` guard in `pipeline/rating_layer.py:899`
- Test: `tests/test_golden_ratings.py` :: "test_golden_pairs"

### RATING-007 Class curve on Q
- Decides: where a place's blended Q lands on the 0 to 10 scale for its class.
- Rule: every place (estimates too) reads its score through its class's frozen four-knot curve: lowest Q to the class's lowest appeal, median Q to median appeal, the Q at the top 2.5% to 9.0, the highest Q to the class ceiling (knots kept only while strictly increasing). Above the last knot the top segment's slope is extended, then capped at the last knot's score; below 0 is 0.
- Constant: `class_curve.top_share` / `class_curve.top_score` in `continent-app/config/rating.json:27` = 0.025 / 9.0
- Constant: `build_q_curves` in `pipeline/rating_layer.py:711`; applied at `pipeline/rating_layer.py:916`
- Test: `tests/test_rating_distribution.py` :: "test_rating_distribution" (each class has 0.5% to 4% of places at 9.0 or more)

### RATING-008 Rounding and the estimate cap
- Decides: that an estimate can never read Exceptional.
- Rule: score rounded to one decimal; a place with no appeal is then capped at 8.9.
- Constant: `estimated.cap` in `continent-app/config/rating.json:33` = 8.9
- Constant: `ESTIMATED_CAP` applied in `pipeline/rating_layer.py:967`
- Test: no test

### RATING-009 Five band words
- Decides: the word beside every score (cards, page, pins, PDF, planner).
- Rule: best first, the first band whose lower cutoff the score reaches; under 6.0 no band. The pipeline writes `rating.band` with the same cutoffs the app reads (`bandForScore`), so both agree.
- Constant: `bands.cutoffs` in `continent-app/config/rating.json:38` = exceptional 9.0, excellent 8.3, very_good 7.6, good 6.9, pleasant 6.0
- Constant: `band_of` in `pipeline/rating_layer.py:1018`; `bandForScore` in `continent-app/src/lib/rating.js:39`
- Test: no test

### RATING-010 Confidence and "about"
- Decides: whether a score is shown as a figure or as "about 8.1".
- Rule: v5 confidence is the appeal source (`curated` or `rubric`), else `estimated`. The app maps curated and rubric to measured and prints an estimate through `rating.about` ("about {n}"); `text` is the shown figure plus the band word.
- Constant: confidence set in `pipeline/rating_layer.py:979`
- Constant: `confidenceKind` in `continent-app/src/lib/rating.js:82`; `ratingWords` in `continent-app/src/lib/rating.js:94`
- Test: `tests/test_rating_distribution.py` :: "test_rating_distribution" (every rated place has curated, rubric or estimated)

### RATING-011 Legacy tier on the wire
- Decides: the old 3/2/1 tier and its label still shipped beside the band.
- Rule: tier 3 from 8.7, 2 from 7.8, 1 from 6.9, else 0; labels "Worth the journey", "Worth a detour", "Worth a visit".
- Constant: `tiers` in `continent-app/config/rating.json:77`
- Constant: `tier_for` in `pipeline/rating_layer.py:642`
- Test: no test

### RATING-012 Hidden gem and fame
- Decides: the "hidden gem" flag (never the score).
- Rule: fame = average daily Wikipedia views; its percentile is read on frozen breakpoints (201 knots) built from one slot per city. Gem when tier 2 or 3 and fame percentile at most 0.40; or tier 1 and at most 0.20; or curated as a gem with score at least 7.0 and fame percentile at most 0.6. Reads the v4 tier, not the v5 band.
- Constant: `hidden_gem` in `continent-app/config/rating.json:82` = {2: 0.40, 1: 0.20}, curated_min_score 7.0, curated_max_fame_pctl 0.6
- Constant: `fame.knots` in `continent-app/config/rating.json:189` = 201
- Constant: rule at `pipeline/rating_layer.py:972`
- Test: no test

### RATING-013 Gateways: one rated row per city
- Decides: that a multi-airport city appears once in every list.
- Rule: airport rows (`tier == "airport"`) sharing country and base city name form one slot; the primary airport carries the rating and every other row gets `gateway_of` and no rating. In the app a gateway is never a card, pin or stay, and a link to it opens its city (following at most 4 hops, stopping on a loop).
- Constant: `_city_slots` in `pipeline/rating_layer.py:792`
- Constant: `isGateway` / `gatewayCity` in `continent-app/src/lib/rating.js:326`
- Test: `continent-app/tests/gateways.test.mjs` :: "every gateway row names an existing city row that is not a gateway"
- Test: `continent-app/tests/gateways.test.mjs` :: "#dest=CIA opens Rome (FCO); a city id opens itself"
- Test: `continent-app/tests/gateways.test.mjs` :: "gatewayCity stops on a loop"
- Test: `continent-app/tests/gateways.test.mjs` :: "Explore (and Ask Carta, which reads Explore's rows) drops every gateway"

### RATING-014 Validation gate before writing
- Decides: whether a rating run may ship at all.
- Rule: the run refuses when a named checkpoint's scaled appeal falls under its expected value (Rome 9.9, Barcelona 9.4, Hallstatt 8.8, Riquewihr 8.0, Cesky Krumlov 8.3) or the place changed class; a famous place falls under its floor; an airport town reaches its ceiling; a non-gateway row has no rating; or an estimate scores 8.5 or more with measured fame under 30 views a day, no gem flag and no corroborating register.
- Constant: `EXPECTED` in `pipeline/appeal_scale.py:117`
- Constant: `FAMOUS_FLOOR` in `pipeline/apply_rating_layer.py:64` = FCO 9.0, CDG 8.7, BCN 8.8, AMS 8.5, gem:bruges 8.5, PRG 8.5
- Constant: `AIRPORT_TOWN_CEILING` in `pipeline/apply_rating_layer.py:81` = CRL, HHN, TZL 5.0
- Constant: `OBSCURE_STAR_MIN_FAME` in `pipeline/apply_rating_layer.py:82` = 30
- Constant: `recognition.corroborating` in `continent-app/config/rating.json:109` = unesco_whc, beautiful_village, heritage_town, spa_town, national_park
- Test: no test

### RATING-015 Frozen reference and recalibration
- Decides: that adding a place moves nobody else's score, gems, labels or tastes.
- Rule: every cohort statistic (appeal scales, depth knots, fallback, curves, fame knots, significance zlog and knots, nature knots, taste knots, gem cutoffs) is read from `reports/rating_reference_v5.json`; a part whose version differs from the config fails the run. A recalibration is refused unless it names the config's part version and the stored part does not carry it yet.
- Constant: `reference_versions` in `continent-app/config/rating.json:5`
- Constant: `reference` / `write_part` in `pipeline/rating_config.py:81` and `:104`
- Constant: `stability` in `continent-app/config/rating.json:192` = sample 100, max_move 0.05, seed 754
- Test: `tests/test_rating_stability.py` :: "test_adding_places_moves_nobody_else"
- Test: `tests/test_rating_stability.py` :: "test_recalibration_needs_a_version_bump"
- Test: `tests/test_nature_tiers.py` :: "test_recalibration_needs_a_version_bump"

### RATING-016 Depth: what counts
- Decides: which sights, nature items and routes count as things to do near a place.
- Rule: live POIs with rate 3 or 2 within the class radius of the centre; rated beaches, lakes and peaks scored 7.6 or more between 5 km and 25 km (inside 5 km they are beauty's); hiking and cycling routes rated 7.6 or more whose attach distance is 25 km or less (no distance, not counted), as "active". A nature POI within 0.3 km of a counted or setting nature item is skipped, so no fact feeds two parts.
- Constant: `depth.poi_own_km` in `continent-app/config/rating.json:115` = metro 15, city 10, town 5, village 5, area unlimited
- Constant: `depth.nature_min_score` / `depth.reach_km` / `depth.poi_nature_match_km` in `continent-app/config/rating.json:122` = 7.6 / 25.0 / 0.3
- Constant: `depth_items` in `pipeline/rating_layer.py:372`
- Test: `tests/test_rating_inputs.py` :: "test_no_fact_feeds_two_components"

### RATING-017 Depth: item weights and diminishing returns
- Decides: that variety beats ten churches.
- Rule: must-see (rate 3) weighs 1.0, recommended (rate 2) 0.5, a nature item or route 1.0; a POI's weight is also times `min(1, sig / 3)`. Items go into the eight POI categories; inside a category the i-th best counts `weight / i`, up to 4 items; each category covered adds 0.25.
- Constant: `depth.item_weight` in `continent-app/config/rating.json:117` = must_see 1.0, recommended 0.5, nature_item 1.0
- Constant: `depth.per_category_max` / `depth.category_bonus` in `continent-app/config/rating.json:120` = 4 / 0.25
- Constant: `depth_raw` in `pipeline/rating_layer.py:436`
- Test: no test

### RATING-018 Depth: class percentile
- Decides: the 0 to 10 depth value a place shows.
- Rule: the raw depth is read as a percentile within the place class on frozen breakpoints (201 knots, pooled knots for an unknown class), giving 0 to 1, shown x 10. Written as `components.highlights`, read as `depth` by the app (`PART_ALIASES`).
- Constant: `depth.knots` in `continent-app/config/rating.json:125` = 201
- Constant: `depth_map` in `pipeline/rating_layer.py:466`; `PART_ALIASES` in `continent-app/src/lib/rating.js:301`
- Test: `tests/test_rating_inputs.py` :: "test_depth_does_not_saturate_the_top"

### RATING-019 Recognition from registers
- Decides: the credit a place gets for juried registers (UNESCO, beautiful villages and so on).
- Rule: start from the best register's weight; each further register (up to 3) adds `(1 - score) x 0.18 x its weight`; capped at 1, shown x 10. An unlisted kind weighs 0.40.
- Constant: `recognition.weights` in `continent-app/config/rating.json:91` = unesco_whc 1.00, beautiful_village 0.95, heritage_town 0.72, spa_town 0.68, national_park 0.62, capital_of_culture 0.55, unesco_tentative 0.50, eden 0.50, cittaslow 0.45, blue_flag 0.35, unesco_geopark 0.30, market_town 0.25, biosphere_reserve 0.25
- Constant: `recognition.default` / `extra` / `extra_max` in `continent-app/config/rating.json:106` = 0.40 / 0.18 / 3
- Constant: `acclaim01` in `pipeline/rating_layer.py:482`
- Test: no test

### RATING-020 Beauty v2 blend
- Decides: the beauty part (what you see within 5 km).
- Rule: `base = 0.35 urban + 0.35 nature + 0.20 water + 0.10 iconic + 0 heritage`; `score01 = min(1, max(0.06, base + 0.20 x standout))`, standout the largest part other than urban and heritage; shown as `score01 x 10`, one decimal. A nature item scored 5.0 is worth 0 and 9.0 worth 1; the best item counts in full, the second closes 25% of the gap. Register tags (`national-park`, `unesco`) never feed beauty.
- Constant: `beauty` in `continent-app/config/rating.json:129` = weights {urban 0.35, nature 0.35, beach 0.20, iconic 0.10, heritage 0.0}, standout_bonus 0.20, setting_km 5.0, item_floor 5.0, item_span 4.0, second_item_share 0.25, score_floor 0.06
- Constant: `compute_beauty_v2` in `pipeline/beauty_layer.py:509`
- Test: `tests/test_rating_inputs.py` :: "test_beauty_v2_reads_no_register"
- Test: `tests/test_rating_inputs.py` :: "test_water_is_measured_per_place"

### RATING-021 Beauty gems
- Decides: the 1 to 5 gems beside beauty.
- Rule: frozen quantile cutoffs of `score01`: 1 gem bottom 20%, 2 gems 20 to 45%, 3 gems 45 to 72%, 4 gems 72 to 90%, 5 gems top 10%.
- Constant: `assign_gems` in `pipeline/beauty_layer.py:609` (cutoffs from the reference's `beauty.gem_cutoffs`)
- Test: no test

### RATING-022 Reason sentence
- Decides: the one sentence under the score in the rating sheet.
- Rule: English source order, later wins: rubric reason, then the hand `why` in `curated_appeal.json`, then `curated_why_i18n.json`. The app loads `/app_data/why_i18n/<lang>.json` once per language (a failed fetch is retried next time) and falls back to English.
- Constant: `load_why_en` in `pipeline/rating_layer.py:1027`
- Constant: `loadRatingWhy` / `ratingWhy` in `continent-app/src/lib/rating.js:352` and `:365`
- Test: no test

### RATING-023 Standing in Europe (class rank line)
- Decides: the "Top 2% of villages" line and the sheet's "In Europe" row.
- Rule: from `rating.class_rank.pct`. At 90 or more the line reads "Top n%" with `n = max(1, round(100 - pct))`; below it the place page shows no line and the sheet reads "Rated above {pct}% of {class}".
- Constant: `CLASS_RANK_MIN_PCT` in `continent-app/src/lib/rating.js:114` = 90
- Constant: `classRank` in `continent-app/src/lib/rating.js:127`; sheet at `continent-app/src/browse/RatingSheet.jsx:50`
- Test: no test

### RATING-024 Standing in the country (sheet)
- Decides: the sheet's "In {country}" row.
- Rule: `share = country_rank / country_n`; rank 1 reads "The highest-rated place"; share at most 0.1 reads "In the top n% of places" with `n = max(1, round(share x 100))`; otherwise "Rated above n%" with `n = round((1 - share) x 100)`. Never "#176 of 300".
- Constant: `inCountry` in `continent-app/src/browse/RatingSheet.jsx:53`
- Test: no test

### RATING-025 Parts in the sheet
- Decides: the four bars that explain a score.
- Rule: order appeal, depth, beauty, recognition; a part shows only when it has a value and a weight; value printed as `round(v x 100) / 10` out of 10, bar width `max(2, v x 100)%`. Labels carry the reach: beauty 5 km, depth `round(25 x 1.3 / 65 x 60)` = 30 minutes. A hidden gem adds one line. No "Measured" word.
- Constant: `ORDER` in `continent-app/src/browse/RatingSheet.jsx:28`
- Constant: `PART_REACH` in `continent-app/src/lib/rating.js:33`
- Test: no test

### RATING-026 Country rank, badge and class percentile
- Decides: "one of the best in Finland" badges and the class percentile behind RATING-023.
- Rule: one slot per city, slot score the best of its rows; competition ranking (ties share a rank). `country_percentile = round(100 x (n - rank) / (n - 1))` (100 for a single slot); badge `top_of_country` for rank 1, `best_of_country` for rank up to `max(3, round(0.08 x slots))`. `class_percentile` the same within the class across Europe, also written as `rating.class_rank`. Gateways get nulls. The layer refuses to write if any score moved.
- Constant: `TOP_SHARE` / `MIN_BADGED` in `pipeline/country_context_layer.py:53` = 0.08 / 3
- Constant: `compute` in `pipeline/country_context_layer.py:105`
- Test: `tests/test_rating_distribution.py` :: "test_rating_distribution" (no country under 3 badged places)

### RATING-027 Explore rating filter and old links
- Decides: the "and up" steps of the rating filter and how old links narrow.
- Rule: three steps Good, Very good, Excellent, each `[cutoff, 10]`. A legacy tier 1 to 3 (`mt=`, `xv=`, saved filters) maps to Good, Very good, Excellent. A restored range is clamped to 0 to 10 and put in order; a range covering 0 to 10 filters nothing.
- Constant: `FILTER_BANDS` in `continent-app/src/lib/rating.js:221` = good, very_good, excellent
- Constant: `LEGACY_TIER_BAND` in `continent-app/src/lib/rating.js:190` = {1: good, 2: very_good, 3: excellent}
- Constant: `clampRatingRange` / `rangeFromBand` in `continent-app/src/lib/rating.js:177` and `:209`
- Test: no test

### RATING-028 Ink steps on the map and stars
- Decides: the shade of a pin or star.
- Rule: Exceptional and Excellent step 3, Very good 2, Good and Pleasant 1, no band 0.
- Constant: `inkStep` in `continent-app/src/lib/rating.js:235`
- Test: no test

### RATING-029 Explore rating order
- Decides: the default order of Explore and the "Top rated N" shortcut.
- Rule: rating order is `rating.score`, else `beauty.score`, else 0, best first; the default sort key `beauty` and `price` both sort this way; "Top rated N" trims to the N best before the chosen sort; country and cost sorts break ties by it.
- Constant: `ratingVal` in `continent-app/src/hooks/useExploreCatalog.js:176`
- Test: no test

### RATING-030 POI significance composite
- Decides: how big a deal a sight is anywhere in Europe.
- Rule: `score = 0.30 zviews + 0.30 zsitelinks + 0.15 heritage + 0.15 wikivoyage + 0.10 old rate / 3 + 0.06 documentation`, z on log values with the frozen mean and spread; heritage 1, or up to 1.5 from visitor counts (`0.5 + log10(visitors) / 6`); documentation 0.5 for an image + 0.5 for a description. An article about an admin area or station zeroes views and sitelinks. A POI with no Wikidata sitelinks borrows them from a landmark with a shared name token within 160 m, or any within 70 m. `sig = 3 x Europe percentile` on frozen breakpoints (401 knots).
- Constant: `significance.weights` in `continent-app/config/rating.json:175` = views 0.30, sitelinks 0.30, heritage 0.15, wv 0.15, prior 0.10, docum 0.06
- Constant: `LM_MATCH_M` / `LM_TIGHT_M` in `pipeline/score_significance.py:245` = 0.160 / 0.070 km
- Constant: composite at `pipeline/score_significance.py:351`, sig at `:380`
- Test: `tests/test_rating_stability.py` :: "test_zlog_does_not_depend_on_the_cohort"

### RATING-031 POI local quota and anchor gate
- Decides: the intermediate rate 3/2/1 inside a place, and whether a significance run may write.
- Rule: `blend = 0.6 x percentile within the place + 0.4 x Europe percentile`. Rate 3 for the top `min(12, max(1 if 6 or more items, round(0.12 n)))`, only if corroborated (wiki link not misattributed, heritage, Wikivoyage or landmark match); rate 2 for the next `round(0.28 n)`; rate 1 the rest. Heritage with 15 or more sitelinks is lifted to at least 2. The run refuses unless famous heritage (25+ sitelinks) and Wikivoyage top picks reach rate 2 or more at recall 0.80 and no uncorroborated POI holds rate 3.
- Constant: `significance` in `continent-app/config/rating.json:173` = local_blend 0.6, rate3_share 0.12, rate2_share 0.28, rate3_min_items 6, rate3_cap 12, heritage_floor_sitelinks 15, gate_min_anchor_recall 0.80
- Constant: quotas at `pipeline/score_significance.py:393`; `validate` at `:419`
- Test: `tests/test_rating_inputs.py` :: "test_poi_rate_quota_holds"

### RATING-032 POI labels
- Decides: Must-see, Recommended and Worth a look on every sight.
- Rule: POIs within the class radius (RATING-016) sorted by `sig` (ties by list order). Must-see: the top ones with national recognition (heritage, or Wikipedia in 3 or more languages), up to the class cap. Recommended: the next POIs by sig, up to 3 x the cap. Every other POI is Worth a look; a duplicate or noise item gets no label. `rate` is then must_see 3, recommended 2, worth_a_look 1. Every kind maps to one of eight categories; `free` only from OSM fee data. In the app a POI without `label` falls back to its `rate` (3, 2, else Worth a look).
- Constant: `poi_labels.must_see_cap` in `continent-app/config/rating.json:232` = metro 8, city 5, town 3, village 2, area 3 (default 3)
- Constant: `poi_labels.recommended_factor` / `national_min_wiki_languages` in `continent-app/config/rating.json:234` = 3 / 3
- Constant: `label_place` in `pipeline/poi_labels.py:96`; `poiLabel` in `continent-app/src/lib/rating.js:157`
- Test: `tests/test_poi_labels.py` :: "test_label_rule_on_a_village"
- Test: `tests/test_poi_labels.py` :: "test_caps_hold_per_place"
- Test: `tests/test_poi_labels.py` :: "test_rate_follows_label_and_category_is_set"
- Test: `tests/test_poi_labels.py` :: "test_every_kind_has_one_category"

### RATING-033 Nature items: blend with missing parts
- Decides: the raw score of a beach, lake, peak, walk or cycle route.
- Rule: each kind keeps its scorer's parts and weights; `score01 = min(1, sum(w x part) + bonus x standout)`, a missing part counted at the kind's frozen median (0.5 where none is stored), never renormalised; standout reads measured parts only.
- Constant: `blend` in `pipeline/nature_tiers.py:87`
- Constant: `nature.provisional_median` in `continent-app/config/rating.json:206` = 0.5
- Test: `tests/test_nature_tiers.py` :: "test_blend_counts_missing_at_median_without_renormalising"

### RATING-034 Nature items: confidence and unscored rows
- Decides: whether a nature row shows a score or the NotYet placeholder.
- Rule: under half of the parts measured gives `unscored` (no score, band or rank); all measured `measured`; otherwise `partial`. The app returns `{ unscored: true }` for a row without a usable v5 score.
- Constant: `nature.min_measured_share` in `continent-app/config/rating.json:205` = 0.5
- Constant: `v5_of` in `pipeline/nature_tiers.py:505`; `natureRating` in `continent-app/src/lib/rating.js:254`
- Test: `tests/test_nature_tiers.py` :: "test_every_item_explained"

### RATING-035 Nature items on the place ladder
- Decides: the 0 to 10 score and band word of a nature row.
- Rule: `score01` is placed on a frozen Europe-wide percentile within the kind (201 knots), then onto a linear ladder: percentile 0 = 4.0, 0.20 = 6.0, 0.45 = 6.9, 0.70 = 7.6, 0.88 = 8.3, 0.97 = 9.0, 1.0 = 9.8. The score is floored (not rounded) to one decimal so it never shows a band above its own. Band shares: top 3% Exceptional, next 9% Excellent, 18% Very good, 25% Good, 25% Pleasant, rest none.
- Constant: `nature.shares` / `nature.ladder` in `continent-app/config/rating.json:202` = 0.03, 0.09, 0.18, 0.25, 0.25 / floor 4.0, ceiling 9.8
- Constant: `ladder_points` / `score_of` in `pipeline/nature_tiers.py:179` and `:202`
- Test: `tests/test_nature_tiers.py` :: "test_ladder_hits_the_place_cutoffs"
- Test: `tests/test_nature_tiers.py` :: "test_band_shares_per_kind"

### RATING-036 Nature rank line
- Decides: "Best walk in the region" or "#2 of 41 lakes in Austria".
- Rule: the smallest scope with at least 5 scored items of the kind: NUTS 2 region first, then country; ranked by raw score, ties share a place. The app prints nothing for a rank under 1 or a scope of fewer than 2, "Best {unit}" for rank 1, else "#n of m"; a country scope names the country when given, else "in the region".
- Constant: `nature.rank_min_items` / `rank_region_key` / `rank_units` in `continent-app/config/rating.json:207` = 5 / "n2" / walks, beaches, lakes, peaks, routes
- Constant: `rank_lines` in `pipeline/nature_tiers.py:465`; `natureRankLine` in `continent-app/src/lib/rating.js:139`
- Test: `tests/test_nature_tiers.py` :: "test_rank_lines"

### RATING-037 Rubric anchors and drift check
- Decides: how a rubric score is placed, and when a scoring shard must be redone.
- Rule: four hand-scored anchor places per class and band (96 anchors, plus 36 calibration places in the Good, Pleasant and under-6.0 range) place a rubric score: band test first, then position inside the band. A shard fails when its five hidden controls lean one way by more than 0.5 on average (signed); the mean absolute gap of 0.5 is held only on all controls pooled.
- Constant: `anchors`, `calibration` in `continent-app/config/rating_anchors.json`
- Constant: `CONTROL_MAX_GAP` / `CONTROL_MAX_BIAS` in `pipeline/audit/validate_rubric_scores.py:54` = 0.5 / 0.5
- Test: no test

## Rules with no test

RATING-001, RATING-002, RATING-003, RATING-004, RATING-008, RATING-009, RATING-011, RATING-012, RATING-014, RATING-017, RATING-019, RATING-021, RATING-022, RATING-023, RATING-024, RATING-025, RATING-027, RATING-028, RATING-029, RATING-037

## HANDBOOK disagreements

| HANDBOOK says | Code does | Where |
|---|---|---|
| Place rating step 2 and 4 read as either-or: an estimate is read off its anchor curve; Q is read through the class curve | An estimate goes through both: the anchor curve, then the golden guard, then the v5 class curve, which runs over every place | `pipeline/rating_layer.py:873` and `:916` |
| Golden pair guard: the estimated score is clamped to 0.1 below the hand-scored winner | The clamp applies to any winner with an appeal (rubric too) and runs before the class curve, so the final gap is not guaranteed to be 0.1 | `pipeline/rating_layer.py:899` |
| Appeal step 3: rubric scores of the hidden controls must sit within 0.5 of the hand scores on average, else the shard is rescored | Per shard only the signed mean lean is held at 0.5; the 0.5 mean absolute gap is held on all controls pooled (`--all`), and some shards carry an accepted lean | `pipeline/audit/validate_rubric_scores.py:54` |
