# Trails and cycling logic (TRAIL)

Which walks and bike routes Carta publishes, how each is rated, graded, named and measured (length, climb, walking or riding time), and what the trail and cycle pages show from that. Main code: `pipeline/trails/curate.py`, `pipeline/trails/rate.py`, `pipeline/trails/attributes.py`, `pipeline/trails/difficulty.py`, `pipeline/trails/elevation.py`, `pipeline/trails/names.py`, `pipeline/trails/export_wire.py`, `pipeline/regions/quotas.py`, `pipeline/nature_tiers.py`, `pipeline/cycling/cycle_index.py`, `pipeline/cycling/export_cycling.py`, `pipeline/cycling/stage_planner.py`, `pipeline/cycling/validate_cycling.py`, `continent-app/src/lib/trails.js`, `continent-app/src/lib/trailCards.js`, `continent-app/src/lib/trailStory.js`, `continent-app/src/lib/cycling.js`, `continent-app/src/browse/TrailPage.jsx`, `continent-app/src/browse/CyclePage.jsx`. HANDBOOK pointer: "Trail rating (0 to 10)", "Trails: finding and choosing walks", "Trail difficulty", "Trail names", "Trail distance, climb and walking time", "Trail page", "Cycling routes and the cycle page" (docs/HANDBOOK.md). Last verified against the code: 2026-11-06 (T1132).

IDs are catalogue IDs only for now: the `// LOGIC: <ID>` / `# LOGIC: <ID>` tags in code and `scripts/docs/logic_check.py` are the second half of ROADMAP B3 and not yet done. Line numbers are as of 2026-11-06 and will drift; the constant name is the stable handle.

## Rules

### TRAIL-001 Hard gates for a walk
- Decides: whether a walk can be published at all.
- Rule: category hike, a real name (title not starting "OSM route "), 2 km to 400 km long, not rejected, and one continuous line (no gaps, one merged segment) or a repaired single-part line whose source geometry still matches.
- Constant: `MIN_M` in `pipeline/trails/curate.py:224` = 2_000
- Constant: `TREK_MAX_M` in `pipeline/trails/curate.py:228` = 400_000
- Constant: `SYNTHETIC_PREFIX` in `pipeline/trails/curate.py:281` = "OSM route "
- Test: `tests/test_gate_attribution.py` :: "test_hard_gate_order" (the gate_attribution mirror of the SQL gate)

### TRAIL-002 Day walks and treks
- Decides: whether a long path can take a slot.
- Rule: up to 45 km is a day walk; longer walks enter only when famous (a wikidata or wikipedia tag, or a name on the country's recall list), up to a trek quota of 8% of the target, at least 4 and at most 60.
- Constant: `MAX_M` in `pipeline/trails/curate.py:225` = 45_000
- Constant: `TREK_SHARE`, `TREK_MIN`, `TREK_MAX_SLOTS` in `pipeline/trails/curate.py:189` to `:194` = 0.08, 4, 60
- Test: `tests/test_gate_attribution.py` :: "test_selection_gate_names_the_soft_gate"

### TRAIL-003 How many walks a region and a country get
- Decides: the number of rated walks per region and per country.
- Rule: per NUTS 3 region `round(4 + 8 x protected_share + 6 x relief_norm)`, clamped 3 to 45; an unmeasured or inapplicable region gets 3. The country target is the sum (plus a share for unplaced routes). If fewer than 150 (or fewer than the eligible family heads), the target is raised to `min(150, eligible)` and every region quota is scaled up by the same factor.
- Constant: `QUOTA["trail"]` in `pipeline/regions/quotas.py:82` = 4 + 8 x protected_share + 6 x relief_norm, lo 3, hi 45
- Constant: `COUNTRY_FLOOR` in `pipeline/trails/curate.py:178` = 150
- Test: no test

### TRAIL-004 Slot fill order
- Decides: the mix of famous walks, loops and lengths in a country's list.
- Rule: 1 famous day walks (30% of target, at least 8, at most 120; recall-list names before merely tagged ones; no region or cell cap), then famous treks; 1b the national pass (iwn or nwn heads, 4% of target, 4 to 40) only when the flag is on; 2 loops up to 40% of target, round robin across regions; 3 the rest by distance band (under 5, 5 to 10, 10 to 20, 20 to 40, over 40 km take 16, 26, 30, 20, 8%); 4 best of the rest, not held to region quotas. The picked list is then sorted by selection rank.
- Constant: `FAMOUS_SHARE`, `FAMOUS_MIN`, `FAMOUS_MAX` in `pipeline/trails/curate.py:188` to `:194` = 0.30, 8, 120
- Constant: `LOOP_SHARE` in `pipeline/trails/curate.py:187` = 0.40
- Constant: `NATIONAL_SHARE`, `NATIONAL_MIN, NATIONAL_MAX` in `pipeline/trails/curate.py:218` = 0.04, 4, 40
- Constant: `BAND_SHARE` in `pipeline/trails/curate.py:240` = {<5 0.16, 5-10 0.26, 10-20 0.30, 20-40 0.20, 40+ 0.08}
- Test: `tests/test_gate_attribution.py` :: "test_national_quota_is_floored_and_capped"
- Test: `tests/test_gate_attribution.py` :: "test_national_pass_spends_the_target_and_displaces_only_loops"
- Test: `tests/test_gate_attribution.py` :: "test_default_selection_leaves_the_unfamous_national_path_out"

### TRAIL-005 Selection rank and spread
- Decides: which walk wins a slot when several qualify.
- Rule: `rank = 0.24 x network + 0.22 x quality/100 + 0.34 x popularity/100 + 0.20 x loop`, plus 0.12 for a route with its own wikidata or wikipedia article, capped at 1. Missing popularity counts 0.35. Network iwn 1.0, nwn 0.85, rwn 0.6, lwn 0.35, else 0.2. At most 3 walks per 0.35 degree grid cell and 4 from one series (the cell cap lifts in later passes).
- Constant: `WEIGHTS` in `pipeline/trails/curate.py:267` = {network 0.24, quality 0.22, popularity 0.34, loop 0.20}
- Constant: `POPULARITY_MISSING` in `pipeline/trails/curate.py:272` = 0.35
- Constant: literal `score += 0.12` in `pipeline/trails/curate.py:678`
- Constant: `GRID_DEG`, `CELL_CAP` in `pipeline/trails/curate.py:247` = 0.35, 3
- Constant: `SERIES_CAP` in `pipeline/trails/curate.py:738` = 4
- Test: no test

### TRAIL-006 Listed (unscored) walks
- Decides: the "not scored yet" rows that keep a thin region page from being empty.
- Rule: at most 3 listed rows per region, 2 to 60 km, same continuity and name gates, no rating key on the wire. The app loads rated rows by default (`loadTrails`) and listed ones only on request; a row without a drawable line is dropped; a missing country file served as HTML reads as nothing published.
- Constant: `LISTED_PER_REGION_MAX` in `pipeline/trails/curate.py:257` = 3
- Constant: `LISTED_MIN_M`, `LISTED_MAX_M` in `pipeline/trails/curate.py:261` = 2_000, 60_000
- Constant: `loadListedTrails` in `continent-app/src/lib/trails.js:93`
- Test: no test

### TRAIL-007 Duplicates and gap repair
- Decides: that one path is not listed twice, and whether a broken line can still ship.
- Rule: two routes are co-located when the shorter is at least half the longer and 80% of it lies within a 30 m corridor (routes under 200 m skipped). A break is bridged with straight lines only when every gap is under 300 m, there are at most 8, and the total is under 750 m and 5% of the route.
- Constant: `BUFFER_M`, `SHARE`, `MIN_LEN_M`, `LEN_RATIO_MIN` in `pipeline/trails/dedup.py:62` to `:77` = 30.0, 0.8, 200.0, 0.5
- Constant: `SPLICE_M`, `MAX_GAPS`, `MAX_SPLICE_M`, `MAX_SPLICE_SHARE` in `pipeline/trails/splice.py:68` to `:84` = 300.0, 8, 750.0, 0.05
- Test: no test

### TRAIL-008 Which country a walk is filed under
- Decides: the country list a cross-border walk appears in.
- Rule: a walk under 30 km whose midpoint region (NUTS 2) lies in another catalogue country is filed there; a row the Ireland extract staged in Northern Ireland is filed GB whatever its length; longer walks stay where staged.
- Constant: `SHORT_WALK_M` in `pipeline/regions/place_truth.py:149` = 30_000
- Constant: `EXTRACT_QUIRKS` in `pipeline/trails/export_wire.py:1159` = {("IE", "GB")}
- Test: no test

### TRAIL-009 Rating parts and weights
- Decides: what the 0 to 10 trail score rewards.
- Rule: eight parts, weights scenery 0.22, relief 0.16, shape 0.15, prominence 0.14, designation 0.13, photos 0.12, variety 0.05, surface 0.03. Length is not a part.
- Constant: `WEIGHTS` in `pipeline/trails/rate.py:92`
- Constant: `MODEL` in `pipeline/trails/rate.py:102` = "open-signals-v2"
- Test: no test

### TRAIL-010 Raw rating measures
- Decides: how each part is measured before ranking.
- Rule: scenery = scenic weight / (km + 1); relief = `1.6 ln(1 + ascent per km) + 0.5 ln(1 + top) + 0.6 ln(1 + top - low)` (km floored at 0.5); prominence = `0.6 x has article + 0.4 x popularity/100`; designation iwn 1.0, nwn 0.85, rwn 0.6, lwn 0.35, lcn 0.3, else 0.2; shape loop or figure eight 1.0, point 0.55, out and back 0.40 (no route type: loop flag 1.0 else 0.55); photos = count; variety = distinct highlight codes.
- Constant: `scenery_raw`, `relief_raw`, `prominence_raw`, `shape_raw` in `pipeline/trails/rate.py:236` to `:300`
- Constant: `NETWORK_LEVEL`, `NETWORK_DEFAULT` in `pipeline/trails/rate.py:110` = {iwn 1.0, nwn 0.85, rwn 0.6, lwn 0.35, lcn 0.3}, 0.2
- Test: no test

### TRAIL-011 Surface quality
- Decides: the surface part of the score and the road-walk warning.
- Rule: tagged surface quality (else smoothness quality) blended towards 0.5 by the share of the line that is tagged, minus the road share (floor 0); no tagging at all gives `0.5 - road share`. rate.py uses 0.5 when no quality was stored.
- Constant: `SURFACE_UNKNOWN`, `ROAD_PENALTY` in `pipeline/trails/attributes.py:526` to `:529` = 0.5, 1.0
- Test: no test

### TRAIL-012 Published per-country rating (old scale)
- Decides: the `rating` column and the order walks ship in a country file.
- Rule: each part is a percentile within the walk's NUTS 3 region if it holds at least 20 rows, else within the country. Composite = weighted sum, stretched per country: `rating = 4.0 + 5.8 x (0.12 + 0.88 x (c - min) / (max - min))`, one decimal. The export orders by rating, then quality score, then id.
- Constant: `REGION_MIN_ROWS` in `pipeline/trails/rate.py:108` = 20
- Constant: `FLOOR, CEILING` in `pipeline/trails/rate.py:116` = 4.0, 9.8
- Constant: `PAD` in `pipeline/trails/rate.py:121` = 0.12
- Test: no test

### TRAIL-013 Score the app shows (v5)
- Decides: the score chip and band on trail and cycle cards and pages.
- Rule: the same raw parts placed on frozen Europe-wide percentiles per kind, a part not measured counts at the frozen median (never renormalised); fewer than half the parts measured gives no score (placeholder, "not scored yet"). The rank line uses the NUTS 2 region when it has at least 5 scored items of the kind, else the country. The app reads only `row.v5` (`trailRating` = `cycleRating` = `natureRating`).
- Constant: `nature.min_measured_share` in `continent-app/config/rating.json:205` = 0.5
- Constant: `nature.rank_min_items` in `continent-app/config/rating.json:207` = 5
- Constant: `V5_MEASURED` in `pipeline/trails/rate.py:356`
- Test: `tests/test_nature_tiers.py` :: "test_blend_counts_missing_at_median_without_renormalising"
- Test: `tests/test_nature_tiers.py` :: "test_rank_lines"

### TRAIL-014 Reason codes
- Decides: the "why" lines under a walk's score.
- Rule: 3 or more summits says "summits" (else "summit"); climb read uphill of 800 m or more says "bigClimb", else 45 m per km or more "steady"; a top of 1,800 m or more "high"; 4 or more photos "photogenic"; scenic weight 1.2 or more per km "dense"; 3 or more highlight kinds "varied"; a road share of 20% or more "roadWalk"; iwn or nwn "waymarked"; an article "known"; over 45 km "trek". The country file carries the first 3 reasons; the page reads them all from the detail file.
- Constant: `MANY_SUMMITS`, `BIG_CLIMB_M`, `STEEP_M_PER_KM`, `HIGH_ALTITUDE_M`, `PHOTOGENIC`, `RICH_SCENERY_PER_KM`, `VARIED_KINDS`, `ROAD_WALK_SHARE` in `pipeline/trails/rate.py:131` to `:149` = 3, 800, 45, 1800, 4, 1.2, 3, 0.20
- Constant: `WIRE_REASONS` in `pipeline/trails/export_wire.py:544` = 3
- Test: `tests/test_trail_climb_consistency.py` :: "test_big_climb_reads_the_climb_uphill"
- Test: `tests/test_trail_climb_consistency.py` :: "test_steady_reads_the_climb_uphill"

### TRAIL-015 "A comfortable day out"
- Decides: whether a walk is called a good day out.
- Rule: 6 to 22 km, climb read uphill at most 800 m, and walking time at most 360 minutes (unknown time passes). The app's `isComfortableDay` uses the same two numbers.
- Constant: `DAY_MIN_M, DAY_MAX_M` in `pipeline/trails/rate.py:128` = 6_000, 22_000
- Constant: `COMFORT_MAX_CLIMB_M`, `COMFORT_MAX_MIN` in `pipeline/trails/rate.py:138` = 800, 360
- Constant: `COMFORT_MAX_CLIMB_M`, `COMFORT_MAX_MIN` in `continent-app/src/lib/trailStory.js:206` = 800, 360
- Test: `tests/test_trail_climb_consistency.py` :: "test_day_out_needs_a_comfortable_climb_and_time"
- Test: `tests/test_trail_climb_consistency.py` :: "test_comfort_numbers_match_the_app"
- Test: `continent-app/tests/trailStory.test.mjs` :: "a comfortable day out is never claimed over a big climb"

### TRAIL-016 Routes drawn downhill are read uphill
- Decides: the climb a card prints and every grade, reason and suitability that judges effort.
- Rule: when descent minus ascent is at least 300 m and descent is at least twice the ascent, climb and drop swap; the stored line is never reversed. The app applies the same test.
- Constant: `DOWNHILL_MIN_M`, `DOWNHILL_RATIO` in `pipeline/trails/attributes.py:262` = 300.0, 2.0
- Constant: `DOWNHILL_MIN_M` in `continent-app/src/lib/trailStory.js:94` = 300
- Test: `tests/test_trail_data_bugs.py` :: "test_korab_9_is_read_uphill"
- Test: `continent-app/tests/trailStory.test.mjs` :: "a line drawn downhill is read uphill, both numbers kept"

### TRAIL-017 Tagged terrain grade
- Decides: the grade when mappers graded the path.
- Rule: SAC hiking easy, mountain_hiking moderate, demanding_mountain_hiking hard, alpine_hiking very_hard, demanding and difficult alpine alpine; counts only when sac_scale covers at least 15% of the line (worst segment wins). Floors: visibility bad moderate, horrible or none hard; via ferrata grade 0 hard, 1 to 2 very_hard, 3 or more alpine (a ferrata counts even below the cover).
- Constant: `SAC_GRADE` in `pipeline/trails/attributes.py:104`
- Constant: `VIS_FLOOR`, `FERRATA_FLOOR` in `pipeline/trails/attributes.py:116` to `:120`
- Constant: `MIN_GRADE_COVER` in `pipeline/trails/attributes.py:126` = 0.15
- Test: `tests/test_trail_difficulty_names.py` :: "test_terrain_still_wins_on_a_long_route"

### TRAIL-018 Terrain grade from the DEM
- Decides: the grade of an untagged walk, marked estimated.
- Rule: first row where the steepest sustained gradient or the ascent per km reaches it: alpine 40% / 250 m, very_hard 30% / 180 m, hard 22% / 120 m, moderate 14% / 70 m, else easy. A derived alpine needs a top of 1,500 m (else very_hard); a derived grade above moderate needs 200 m between lowest and highest point (else moderate). No grade when the elevation status is not ok.
- Constant: `DEM_LADDER` in `pipeline/trails/attributes.py:137`
- Constant: `DERIVED_ALPINE_MIN_TOP_M` in `pipeline/trails/attributes.py:146` = 1500.0
- Constant: `DERIVED_HARD_MIN_RELIEF_M` in `pipeline/trails/attributes.py:153` = 200.0
- Test: `tests/test_trail_difficulty_names.py` :: "test_relief_cap_only_touches_derived_terrain_on_low_ground"

### TRAIL-019 Effort grade per day
- Decides: how hard one day of the walk is, so length alone never makes a walk hard.
- Rule: DIN hours = slower of flat (4 km/h) and vertical (300 m/h up plus 500 m/h down) in full plus half the faster; up to 10 h is one day, longer is `ceil(hours / 6)` days. One day's hours and climb: very_hard over 8 h or 1,500 m, hard over 6 h or 1,000 m, moderate over 3.5 h or 500 m, else easy.
- Constant: `FLAT_KMH`, `UP_MH`, `DOWN_MH` in `pipeline/trails/difficulty.py:38` = 4.0, 300.0, 500.0
- Constant: `DAY_MAX_H`, `STAGE_H` in `pipeline/trails/difficulty.py:44` to `:47` = 10.0, 6.0
- Constant: `DAY_LADDER` in `pipeline/trails/difficulty.py:55`
- Test: `tests/test_trail_difficulty_names.py` :: "test_a_single_day_is_graded_on_its_hours_and_climb"
- Test: `tests/test_trail_difficulty_names.py` :: "test_length_alone_never_raises_the_grade"

### TRAIL-020 Published grade and the one wire difficulty
- Decides: the grade on every card, chip and page.
- Rule: the harder of terrain (tagged, else DEM) and effort, source "tagged" or "derived" (`f.gs`). The wire's `difficulty` is that grade where attributes ran, else validate.py's class; the export gate fails if any row's `difficulty` differs from `f.g`.
- Constant: `grade_of` in `pipeline/trails/attributes.py:284`; `wire_difficulty` in `pipeline/trails/export_wire.py:645`
- Test: `tests/test_trail_difficulty_names.py` :: "test_a_steep_multi_day_route_is_graded_by_its_ground"
- Test: `tests/test_trail_climb_consistency.py` :: "test_the_wire_ships_one_difficulty"

### TRAIL-021 Long walks
- Decides: when a card or page says "Long" (or "Long, 14 days") instead of a grade.
- Rule: the wire ships `f.d` days when the walk takes 2 or more days. The app says Long when `f.d` is 2 or more and the grade is moderate or easier; a hard, very hard or alpine walk keeps its grade. On the trail page's grade fact a mapper's SAC tag also wins over Long.
- Constant: `LONG_MIN_DAYS` in `pipeline/trails/difficulty.py:49` = 2
- Constant: `LONG_MIN_DAYS` in `continent-app/src/lib/trailStory.js:142` = 2; `isLongWalk` at `:151`
- Test: `continent-app/tests/trailLong.test.mjs` :: "a flat multi-day path reads Long"
- Test: `continent-app/tests/trailLong.test.mjs` :: "hard ground on a long walk keeps its grade"
- Test: `tests/test_trail_difficulty_names.py` :: "test_days_are_absent_on_a_one_day_walk"

### TRAIL-022 Grade step T1 to T6
- Decides: the six-square grade card on the trail page.
- Rule: the mapper's SAC tag as its T step (hiking 1 to difficult_alpine_hiking 6); otherwise Carta's grade as easy 1, moderate 2, hard 3, very_hard 4, alpine 5, marked estimated. A city day shows no step.
- Constant: `GRADE_STEP` in `continent-app/src/browse/TrailPage.jsx:107`
- Constant: `SAC_STEP` in `continent-app/src/browse/OutdoorParts.jsx:487`
- Test: no test

### TRAIL-023 Elevation sampling and climb
- Decides: the length's climb, descent, high point and profile.
- Rule: Copernicus GLO-30 sampled every 30 m (bilinear); zero runs of up to 3 samples between flanks of 5 m or more are treated as water and interpolated; gaps filled linearly; over 20% missing leaves the metrics empty. Climb: 3-sample moving average, then only swings of 5 m or more commit. Steepest grade over 3 steps (about 90 m); profile of 200 points.
- Constant: `SAMPLE_STEP_M`, `SMOOTH_WINDOW`, `CLIMB_THRESHOLD_M`, `GRADE_SPAN_STEPS`, `COAST_RUN_MAX`, `COAST_LAND_M`, `MAX_NODATA_FRAC`, `PROFILE_POINTS` in `pipeline/trails/elevation.py:74` to `:81` = 30.0, 3, 5.0, 3, 3, 5.0, 0.2, 200
- Test: no test

### TRAIL-024 Walking time
- Decides: the time fact on cards and the trail page.
- Rule: DIN 33466: `max(km/4, up/300 + down/500) + min(...) / 2` hours, stored in whole minutes on the stored direction. The page rounds to the nearest 5 minutes (at least 5).
- Constant: `duration_min_din33466` in `pipeline/trails/elevation.py:482`
- Constant: `duration` in `continent-app/src/browse/TrailPage.jsx:97`
- Test: `tests/test_trail_difficulty_names.py` :: "test_din_hours_match_the_stored_duration"

### TRAIL-025 Route type
- Decides: the "Loop", "Out and back", "One way" fact and the shape part of the score.
- Rule: out and back when at least 60% of the way back lies within 15 m of the way out; else closed (ends within 100 m) and self-crossing in two rings is a figure eight (more rings a loop); closed or tagged roundtrip is a loop; else point to point. The page falls back to the loop flag when the wire has no type.
- Constant: `CLOSE_M` in `pipeline/trails/attributes.py:312` = 100.0
- Constant: `RETRACE_BUFFER_M`, `RETRACE_SHARE` in `pipeline/trails/attributes.py:315` = 15.0, 0.6
- Test: no test

### TRAIL-026 Highlight chips
- Decides: the highlight filter chips and the highlights a card may claim.
- Rule: scenic kinds fold to ten codes (waterfall, lake, summit, viewpoint, castle, hut, gorge, coast, forest, village); only features within 250 m of the line count; order is the order the walk meets them.
- Constant: `HIGHLIGHT_CODE` in `pipeline/trails/attributes.py:399`
- Constant: `HIGHLIGHT_ON_LINE_M` in `pipeline/trails/attributes.py:418` = 250
- Test: no test

### TRAIL-027 Suitability chips
- Decides: the family, beginner, stroller, dog, wheelchair and winter chips.
- Rule: wheelchair tagged only (60% of the line surveyed, 80% yes, no "no"); dog tagged only (25% cover, no ban, some allowed); stroller under 6 km, tagged by smoothness or derived when gentle (under 6%), easy and 60% rollable; family up to 8 km, 300 m climb, easy, no ferrata, visibility intermediate or better; beginner up to 12 km, 500 m, moderate or easier and on a network; winter when the season estimate spans 11 or more months and moderate or easier.
- Constant: `suitability_of` in `pipeline/trails/attributes.py:444`; `MIN_COVER` at `:129` = 0.60
- Test: `tests/test_trail_data_bugs.py` :: "test_korab_9_grade_and_suitability_read_the_climb"

### TRAIL-028 Walking season (estimate)
- Decides: the "typically" walking months on the trail page.
- Rule: effective height = top + (|lat| - 45) x 55. Under 900 m all year; under 1,500 m Apr to Nov; under 2,200 m Jun to Oct; under 3,000 m Jul to Sep; else Jul to Aug. Always marked an estimate.
- Constant: `season_of` in `pipeline/trails/attributes.py:559`
- Test: no test

### TRAIL-029 Distance and climb filter bands
- Decides: which walks a length or climb chip keeps.
- Rule: distance short under 5, half 5 to 10, day 10 to 20, long 20 to 40, trek 40 km and over; climb flat under 150, rolling 150 to 500, hilly 500 to 1,000, steep 1,000 to 1,800, serious 1,800 m and over. The climb band reads the stored `ascent_m`, not the uphill climb.
- Constant: `DISTANCE_BANDS`, `ASCENT_BANDS` in `continent-app/src/lib/trailCards.js:137` to `:170`
- Constant: `DISTANCE_BANDS`, `ASCENT_BANDS` in `pipeline/trails/export_wire.py:818` to `:825`
- Test: no test

### TRAIL-030 Title ladder, network prefixes and transliteration
- Decides: the name a traveller reads on a walk.
- Rule: Wikidata label, then the relation's name (`name:en`, a Latin `name`, the local language, `int_name`, any Latin `name:*`), then from and to, then the best landmark, then shape and place; a code moves to the ref chip. E-path phrases in 13 languages fold to the code ("E7"), "Sentier de Grande Randonnee 10" to "GR 10". Cyrillic or Greek is transliterated only when no Latin name exists, by the country's national system.
- Constant: `title_ladder` in `pipeline/trails/names.py:547`; `strip_network` at `:395`; `LOCAL_LANGS` at `:245`
- Test: `tests/test_trail_titles.py` :: "test_wikidata_label_is_the_first_rung"
- Test: `tests/test_trail_titles.py` :: "test_name_en_beats_a_cyrillic_name"
- Test: `tests/test_trail_difficulty_names.py` :: "test_network_prefixes_fold_to_the_code"
- Test: `tests/test_trail_difficulty_names.py` :: "test_cyrillic_and_greek_are_transliterated_per_country"

### TRAIL-031 Title length and the source name
- Decides: how long a walk's name may be and when "Also called ..." shows.
- Rule: at most 42 characters, cut between segments (when one sits in the second half) or words, no open bracket or quote, no dangling joining word, no ellipsis. The relation's own `name` ships as `src_name` (at most 64 characters) only when it differs from the shown name.
- Constant: `TITLE_MAX` in `pipeline/trails/names.py:101` = 42
- Constant: `ORIGINAL_MAX` in `pipeline/trails/names.py:103` = 64
- Test: `tests/test_trail_titles.py` :: "test_cap_is_42_on_a_word_boundary"
- Test: `tests/test_trail_difficulty_names.py` :: "test_shortening_never_leaves_a_broken_end"
- Test: `tests/test_trail_difficulty_names.py` :: "test_the_source_name_rides_apart_only_when_it_differs"

### TRAIL-032 Trail page photos and nearby context
- Decides: which photographs a trail shows and which town it is tied to.
- Rule: up to 6 highlights along the way, each with the route photo taken within 1.5 km of it; gallery is the detail images, else the card image, else the nearest place's photo labelled as a photo nearby. A walk without its own photo borrows the nearest place's hero only within 25 km; the nearest place is looked up within 80 km; the "stay nearby" town within 30 km.
- Constant: literal `d <= 1500` in `continent-app/src/browse/TrailPage.jsx:628`
- Constant: `TOWN_KM` in `continent-app/src/lib/trailPhoto.js:27` = 25
- Constant: `ASSOC_MAX_KM` in `continent-app/src/lib/trailCards.js:46` = 80
- Constant: `NEAR_TOWN_KM` in `continent-app/src/browse/TrailPage.jsx:118` = 30
- Test: no test

### TRAIL-033 Which bike routes publish, rated or listed
- Decides: whether a bike route exists in Carta and whether it carries a score.
- Rule: on the wire only when named (or a ref), at least 3 km, one continuous part and placed in a region. Rated when the cycle index score is at least 5.4 and it has 2 or more photos with a strong lead one; otherwise listed. The Europe-wide top list takes the best 24 per country, 200 in all.
- Constant: `basic_row` in `pipeline/cycling/export_cycling.py:335`; `tier_of` at `:354`
- Constant: `SCORE_GATE` in `pipeline/cycling/export_cycling.py:103` = 5.4
- Constant: `PHOTOS_RATED_MIN` in `pipeline/cycling/export_cycling.py:106` = 2
- Constant: `TOP_N`, `TOP_PER_COUNTRY` in `pipeline/cycling/export_cycling.py:1105` = 200, 24
- Test: no test

### TRAIL-034 Cycle index score (gate score)
- Decides: the score the rated gate reads (the chip shows v5, TRAIL-013).
- Rule: weights scenic 0.26, safety 0.20, surface 0.16, designation 0.14, services 0.14, shape 0.10; each part a padded percentile (0.12 to 0.88) within the NUTS 2 region if it has 12 routes, else the country; missing parts are dropped and the weights renormalised; score x 10. Parts: designation icn 1.0, ncn 0.85, rcn 0.6, lcn 0.35, else 0.2, plus 0.15 for EuroVelo (cap 1); surface = paved and traffic-free averaged with traffic-free counting double (paved needs 25% known); safety needs 33% known; services = usable towns per 100 km over 8, capped 1; shape 0.55 loop or 0.3, plus 0.3 for 25 to 90 km, 0.35 for 150 to 900 km, 0.15 over 900 km.
- Constant: `WEIGHTS` in `pipeline/cycling/cycle_index.py:72`
- Constant: `MIN_REGION_ROWS` in `pipeline/cycling/cycle_index.py:88` = 12
- Constant: `EUROVELO_BONUS` in `pipeline/cycling/cycle_index.py:83` = 0.15
- Constant: `WELL_SERVED_PER_100KM` in `pipeline/cycling/cycle_index.py:104` = 4.0
- Test: no test

### TRAIL-035 Ride time
- Decides: the time fact on a bike route.
- Rule: `km / 18 x 60 + climb / 100 x 10` minutes; the page rounds to the nearest 5 minutes (at least 5).
- Constant: `RIDE_FLAT_KMH`, `RIDE_MIN_PER_100M` in `pipeline/cycling/export_cycling.py:427` = 18.0, 10.0
- Constant: `dur` in `continent-app/src/browse/CyclePage.jsx:627`
- Test: no test

### TRAIL-036 Bike route shape and surface figures
- Decides: the route fact and the percent paved and traffic-free on the cycle page.
- Rule: a mapper's roundtrip wins as loop; else loop when ends lie within max(150 m, 2% of length); out and back when the line retraces itself within max(120 m, 3%); else point; no shape under 300 m. The app reads `rt` first, then the loop tag. Paved share is shown only when at least 25% of the surface is known, traffic-free only when 33% of the highway class is known, else the wire's rounded figures.
- Constant: `SHAPE_LOOP_MIN_M`, `SHAPE_LOOP_SHARE`, `SHAPE_RETRACE_M`, `SHAPE_RETRACE_SHARE` in `pipeline/cycling/export_cycling.py:444` to `:447` = 150.0, 0.02, 120.0, 0.03
- Constant: `pavedKnown`, `freeKnown` in `continent-app/src/browse/CyclePage.jsx:614`
- Test: `continent-app/tests/routeEffort.test.mjs` :: "cycle shape reads rt first, then the mapper loop tag"

### TRAIL-037 Multi-day bike tours: stages
- Decides: how a tour is split into days and where each night falls.
- Rule: paces relaxed 45 to 65 km and 600 m, balanced 65 to 95 km and 1,000 m, strong 95 to 130 km and 1,600 m; tours 120 to 1,200 km with 3 to 14 stages; a stage end snaps to a service town within 18% past the band (one retry at 35%) with at least 3 beds and a train bailout within 20 km; up to 3 routes chain when ends meet within 2 km.
- Constant: `PACES` in `pipeline/cycling/stage_planner.py:85`
- Constant: `MIN_TOUR_M`, `MAX_TOUR_M`, `MIN_STAGES`, `MAX_STAGES` in `pipeline/cycling/stage_planner.py:92` to `:97` = 120_000, 1_200_000, 3, 14
- Constant: `BAND_STRETCH`, `BAND_WIDEN`, `CHAIN_JOIN_M`, `MAX_CHAIN`, `BAILOUT_KM`, `MIN_BEDS` in `pipeline/cycling/stage_planner.py:102` to `:115` = 0.18, 0.35, 2_000, 3, 20.0, 3
- Test: no test

### TRAIL-038 Tour season and hard checks
- Decides: the tour's riding months and whether it ships at all.
- Rule: season from the nearest climate normals within 120 km: rideable months have a high of 11 C or more, a low of -2 C or more and 160 mm of rain or less; best months are rideable months within 18 comfort points of the best. Ten checks, first failure drops the tour: continuity, stage budget, real overnights, no repeats, surface fit to the bike (touring only grade1 tracks), safety floor 4.0 with 40% known and at most 2 km of trunk road per stage, water or food every 40 km, bailout, at least 4 images, a season that is neither empty nor all twelve months.
- Constant: `RIDEABLE_T_HIGH`, `RIDEABLE_T_LOW`, `RIDEABLE_PRECIP_MM`, `COMFORT_BAND` in `pipeline/cycling/stage_planner.py:557` to `:560` = 11.0, -2.0, 160, 18
- Constant: `SAFETY_FLOOR`, `SAFETY_MIN_KNOWN`, `TRUNK_LIMIT_M`, `DRY_LIMIT_M`, `TOUR_IMAGES_MIN` in `pipeline/cycling/validate_cycling.py:76` to `:86` = 4.0, 0.4, 2_000, 40_000, 4
- Constant: `HARD_CHECKS` in `pipeline/cycling/validate_cycling.py:259`
- Test: no test

## Rules with no test

TRAIL-003, TRAIL-005, TRAIL-006, TRAIL-007, TRAIL-008, TRAIL-009, TRAIL-010, TRAIL-011, TRAIL-012, TRAIL-022, TRAIL-023, TRAIL-025, TRAIL-026, TRAIL-028, TRAIL-029, TRAIL-032, TRAIL-033, TRAIL-034, TRAIL-035, TRAIL-037, TRAIL-038

## HANDBOOK disagreements

| HANDBOOK says | Code does | Where |
|---|---|---|
| Trail difficulty step 7: the card, the nearby rows and the PDF say "Long" unless the route carries a SAC tag | Only the trail page's grade fact checks the SAC tag; `gradeLabelKey` and the card filling call `isLongWalk`, which ignores it | `continent-app/src/lib/trailStory.js:129`, `continent-app/src/lib/cardFillings.js:205` |
| Trails selection: ranking weights network 0.24, quality 0.22, popularity 0.34, loop 0.20 | `rank_of` also adds 0.12 for a wikidata or wikipedia tag (capped at 1) and counts missing popularity as 0.35 | `pipeline/trails/curate.py:664` to `:679` |
| Cycling stage planner: rideable months need a low of at least -2 C | `(m.get("t_low") or -99)` turns a mean low of exactly 0.0 C into -99, so that month fails | `pipeline/cycling/stage_planner.py:599` |
