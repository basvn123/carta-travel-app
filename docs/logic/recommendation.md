# Recommendation logic (REC)

How Carta matches places and trips to a traveller: the place taste profile, the personal match and Explore's "For you" sort, and the trip finder ("Trips for you") that builds, prices, ranks, explains, compares, keeps and shares candidate trips. Main code: `continent-app/src/lib/match.js`, `continent-app/src/lib/recommend/` (`rank.js`, `candidates.js`, `persona.js`, `reasons.js`, `slots.js`, `trips.js`, `together.js`, `doorTrips.js`, `compare.js`, `kept.js`), `continent-app/config/recommend.json`, `continent-app/config/slots.json`, `continent-app/config/rating.json` (`match`), `pipeline/place_taste_profile.py`. HANDBOOK pointer: "Place taste profile", "Personal match and \"For you\"", "Trip finder (\"Trips for you\")" (docs/HANDBOOK.md). Prices themselves come from the price engine (`config/pricing.json`) and are not catalogued here; the place score Q is RATING. Last verified against the code: 2026-11-06 (T1132).

IDs are catalogue IDs only for now: the `// LOGIC: <ID>` / `# LOGIC: <ID>` tags in code and `scripts/docs/logic_check.py` are the second half of ROADMAP B3 and not yet done. Line numbers are as of 2026-11-06 and will drift; the constant name is the stable handle.

## Rules

### REC-001 Personal fit of one place
- Decides: the "82% match" of a place and every match screen built on it.
- Rule: `F = sum(w x p) / sum(w) x product(conflict factors)`, clamped 0 to 1. w = 1 per chosen like, 0.5 for size, 0.5 for quiet or lively. A like the profile ships as null is left out (not read as 0). With nothing weighable (no taste, no profile, or only a no-car answer) the fit is null and screens keep their quality order. `top` = the picks with p at least 0.5, strongest first.
- Constant: `match.like_weight` / `size_weight` / `quiet_weight` in `continent-app/config/rating.json:51` = 1 / 0.5 / 0.5
- Constant: `fit` in `continent-app/src/lib/match.js:59`
- Test: `continent-app/tests/match.test.mjs` :: "weights: a like is 1, size and quiet are 0.5 each"
- Test: `continent-app/tests/match.test.mjs` :: "one like: F is the place's value, the bar is p"
- Test: `continent-app/tests/match.test.mjs` :: "a null like is not measured: left out of F and of the bars"
- Test: `continent-app/tests/match.test.mjs` :: "an empty taste returns null everywhere"

### REC-002 Size and quiet values
- Decides: how a place's size and crowds read for a traveller who asked for a size or for quiet or lively.
- Rule: size p from the size_fit table (no term for "mix"); quiet p = `1 - crowd tier / 3` in the month, or the year's mean tier with no month; lively p = the place's nightlife value.
- Constant: `match.size_fit` in `continent-app/config/rating.json:62` = city {metro 1, city 0.85, town 0.4, village 0.1, area 0.1}, town {metro 0.3, city 0.7, town 1, village 0.6, area 0.4}, village {metro 0, city 0.15, town 0.5, village 1, area 1}
- Constant: size and quiet terms in `continent-app/src/lib/match.js:72` and `:80`
- Test: `continent-app/tests/match.test.mjs` :: "weights: a like is 1, size and quiet are 0.5 each"

### REC-003 Conflicts
- Decides: how much a clash pulls the fit down.
- Rule: busy month (crowd tier 2 or more in a set month) for a quiet traveller x0.8; car needed for a no-car traveller x0.75; month high over 30 C x0.85, only when the caller asks to avoid heat (Help me choose, never Explore). Factors stay within 0.6 to 1.
- Constant: `match.conflicts` in `continent-app/config/rating.json:55` = busy 0.8, car 0.75, heat 0.85
- Constant: `match.busy_min_tier` / `heat_max_c` / `conflict_range` in `continent-app/config/rating.json:60` = 2 / 30 / [0.6, 1]
- Test: `continent-app/tests/match.test.mjs` :: "a conflict multiplies F and is listed on its own"
- Test: `continent-app/tests/match.test.mjs` :: "heat: only with avoidHeat and a hot month from the profile"

### REC-004 Show and Strong match thresholds
- Decides: when a match figure appears and what the Strong match filter keeps.
- Rule: a match shows from F = 0.55; Strong match needs F at least 0.70.
- Constant: `match.show_min` / `strong_min` in `continent-app/config/rating.json:47` = 0.55 / 0.70
- Constant: `showMatch` / `strongMatch` in `continent-app/src/lib/match.js:113` and `:118`
- Test: `continent-app/tests/match.test.mjs` :: "the 55% floor: below it no match shows; 70% is strong"

### REC-005 Quality Q a match is ordered by
- Decides: the quality side of For you and of a trip's score.
- Rule: `rating.month_scores[month]` when a month is set and a value exists, else `rating.score`; null for an unrated place.
- Constant: `qualityOf` in `continent-app/src/lib/match.js:123`
- Test: `continent-app/tests/match.test.mjs` :: "forYou reads the month score when a month is set"

### REC-006 Explore "For you"
- Decides: the For you sort in Explore.
- Rule: key `Q + lambda x (F - 0.5)` with lambda 2, so the match moves a place by at most one point. Places the match cannot score keep their quality order below the scored ones, then list order; nothing is dropped. With no taste the sort is the rating order. For you becomes the default sort only when `for_you_default` is true (it is false), and the persona never touches it.
- Constant: `match.lambda` / `lambda_range` in `continent-app/config/rating.json:45` = 2 / [1, 2]
- Constant: `match.for_you_default` in `continent-app/config/rating.json:49` = false
- Constant: `forYou` / `sortForYou` in `continent-app/src/lib/match.js:135` and `:148`; default switch at `continent-app/src/browse/ExploreTab.jsx:524`
- Test: `continent-app/tests/match.test.mjs` :: "forYou moves a place by at most lambda/2 points"
- Test: `continent-app/tests/match.test.mjs` :: "sortForYou never drops a place"

### REC-007 Taste facts: beach, hiking, lakes, cycling
- Decides: the nature likes of a place's taste profile.
- Rule: from scored nature rows within 20 km (sea beaches only, no inland bathing sites) or 25 km (walks, lakes, cycle routes; lake rows within 0.5 km of a sea beach are dropped as coastal): `0.7 x band value of the best item + 0.3 x min(count Very good or better, 5) / 5`, and 0 when the best item is Pleasant or unbanded. Fact keeps n, best name, band and minutes (`round(km x 1.3 / 65 x 60)`).
- Constant: `BEACH_KM` / `REACH_KM` in `pipeline/place_taste_profile.py:85` = 20.0 / 25.0
- Constant: `BAND_Q` in `pipeline/place_taste_profile.py:91` = exceptional 1.0, excellent 0.85, very_good 0.7, good 0.5, pleasant 0.0
- Constant: `nature_fact` in `pipeline/place_taste_profile.py:179`; `sea_lakes` at `:171`
- Test: no test

### REC-008 Taste facts: culture, city, nightlife
- Decides: the culture, city and nightlife likes.
- Rule: culture = max(designation: UNESCO 1.0, heritage town 0.7, capital of culture or tentative 0.5; `0.5 x min(heritage POIs, 20) / 20 + 0.5 x min(museums, 10) / 10`). city = class value. nightlife = `max(0.6 x class value, 0.6 x min(venues, 3) / 3) + 0.4 x min(venues, 5) / 5`. POIs count only inside the place (the POI label radius).
- Constant: `CLASS_CITY` in `pipeline/place_taste_profile.py:197` = metro 1.0, city 0.7, town 0.3, village 0.0, area 0.0
- Constant: `raw_values` in `pipeline/place_taste_profile.py:215` (culture at 235, nightlife at 252)
- Test: no test

### REC-009 Taste facts: food and hidden, and the unmeasured null
- Decides: the food and hidden likes, and when a like ships as not measured.
- Rule: food fact = `0.5 x min(food POIs, 5) / 5 + 0.5 x min(markets, 3) / 3`; a food, wine or beer tag counts as a full food vibe, a metro or city with fame 1,200 or more as 0.6 (the higher of that and the guided vibe). Food with no vibe, venues or known rule, and nightlife with no vibe and no venues, ship as null. hidden = 1.0 for a hidden gem, else `max(0, 0.5 - fame percentile)` (fame read as log1p on frozen knots), 0 with no fame.
- Constant: `FOOD_TAGS` / `FOOD_FAME` / `FOOD_BIG_VIBE` in `pipeline/place_taste_profile.py:108` = {food, wine, beer} / 1200 / 0.6
- Constant: `UNMEASURED_WITHOUT` in `pipeline/place_taste_profile.py:101` = food (food, markets, known), nightlife (venues)
- Test: `tests/test_place_taste_profile.py` :: "test_every_rated_place_has_twelve_values_with_facts"

### REC-010 Taste facts: ski, wellness, islands
- Decides: the ski, wellness and islands likes.
- Rule: ski = `0.6 x min(ski POIs, 3) / 3 + 0.4 x min(peaks with a lift within 25 km, 3) / 3`. wellness = 1.0 for a spa town, else `min(bath POIs, 3) / 3`, times 0.2 in a metro or city. islands = 1.0 when tagged island, else 0.
- Constant: `raw_values` in `pipeline/place_taste_profile.py:266` (ski), `:272` (wellness), `:275` (islands)
- Test: no test

### REC-011 Taste: vibe and fact combined
- Decides: how the guided-search vibe and the fact make one raw value per like.
- Rule: vibe = max of the like's mapped vibes / 100 (cycling and ski have none). A fact under 0.25 with a vibe under 0.5 counts as 0 (not for food). No vibe: raw = fact. A vibe with a zero fact: raw = 0 (not for food). Otherwise `raw = 0.5 x vibe + 0.5 x fact`. The twelve like keys are the planner's own list.
- Constant: `VIBES` in `pipeline/place_taste_profile.py:81`; `WEAK_FACT` at `:87` = 0.25; `NO_FACT_SOURCE` at `:96` = {food}
- Constant: combine loop in `pipeline/place_taste_profile.py:278`
- Test: `tests/test_place_taste_profile.py` :: "test_like_keys_match_the_app"
- Test: `tests/test_place_taste_profile.py` :: "test_sanity_top_ten_percent"
- Test: `tests/test_place_taste_profile.py` :: "test_sanity_bottom_half"

### REC-012 Taste: frozen percentile and carried fields
- Decides: that 0.9 means the same everywhere, and the extra facts the match reads.
- Rule: each raw value becomes the share of the frozen reference set strictly below it (201 knots, three decimals), so a tie at the bottom stays 0. Carried as they are: `size` (place class), `crowd_by_month` (tier 0 to 3), `car_need`, `cost_level` (mid-range meal price), `tmax_by_month` (rounded mean highs, only with 12 months).
- Constant: `KNOTS` in `pipeline/place_taste_profile.py:88` = 201
- Constant: `pct` / `carried` in `pipeline/place_taste_profile.py:310` and `:323`
- Test: `tests/test_place_taste_profile.py` :: "test_rerun_gives_identical_values"

### REC-013 Fit of a whole trip
- Decides: the fit, bars and conflicts of a trip card.
- Rule: each place's F weighed by its nights; a bar's p is the nights-weighted mean and its fact the best place's; a conflict is listed once, from the first place that has it; Q is the nights-weighted quality. `pct = round(F x 100)` only when F is at least 0.55. Heat counts when the traveller avoids heat or answered mild weather.
- Constant: `tripFit` in `continent-app/src/lib/recommend/reasons.js:31`; avoid-heat switch in `continent-app/src/lib/recommend/rank.js:150`
- Test: `continent-app/tests/recommendRank.test.mjs` :: "the match shows from match.show_min up, else null"

### REC-014 Trip score blend
- Decides: the order of Trips for you and the badge figure.
- Rule: answers = F, or `0.75 F + 0.25 P` with a persona fit P (either alone when the other is missing); `blend = 0.6 x answers + 0.4 x Q / 10`, either side alone when the other is missing, 0 when both are; Q falls back to the country match score. Then minus the budget sink / 10 and the flight pull / 10.
- Constant: `rank.blend` in `continent-app/config/recommend.json:26` = answers_w 0.6, quality_w 0.4, persona_w 0.25
- Constant: `blendOf` in `continent-app/src/lib/recommend/rank.js:43`; score at `:185`
- Test: `continent-app/tests/recommendRank.test.mjs` :: "the badge is the ranked score: the order follows the number shown (T884)"

### REC-015 Budget ruler and sink
- Decides: the over or under budget badge and how far an expensive trip sinks.
- Rule: budget a person = the typed total, or a day figure times the nights; none for 0. `delta = total a person - budget`. Over budget sinks the score by `0.3 x delta / 100` points of 10 (divided by 10 on the 0 to 1 scale).
- Constant: `budget.sinkPer100` in `continent-app/config/recommend.json:32` = 0.3
- Constant: `budgetOf` / `budgetRuler` in `continent-app/src/lib/recommend/rank.js:55` and `:62`
- Test: `continent-app/tests/recommendRank.test.mjs` :: "the budget ruler: under is negative, over positive, none is null"
- Test: `continent-app/tests/recommendRank.test.mjs` :: "the budget ranks: a trip over it sinks by the configured amount"

### REC-016 Flight lever pull
- Decides: how the cheapest, quickest or best-times lever reorders trips.
- Rule: trips with flight facts are sorted by the lever's keys and spread over the list's places, ties sharing one; the last place sinks by `FLIGHT_PULL = 5 x 0.3 = 1.5` points (the same as 500 euros over budget); a trip with no flight facts sits in the middle (half the pull). No lever or fewer than 2 trips: no pull.
- Constant: `FLIGHT_PULL` in `continent-app/src/lib/recommend/rank.js:116` = 1.5
- Constant: `flightPull` in `continent-app/src/lib/recommend/rank.js:118`
- Test: `continent-app/tests/recommendLevers.test.mjs` :: "the flight pull: the lever's order, ties share a place, no facts sit in the middle"

### REC-017 Fit first and the trip order
- Decides: which trips lead the list.
- Rule: a trip qualifies when no hard conflict stands and its strongest chosen like (where measured) reads at least 0.5; with no measured chosen like it qualifies. Sort: qualified first, then score, then trip id.
- Constant: `rank.mainLikeMin` / `hardConflicts` / `fitFirst` in `continent-app/config/recommend.json:27` = 0.5 / ["car"] / true
- Constant: `qualifies` in `continent-app/src/lib/recommend/rank.js:157`; sort at `:206`
- Test: `continent-app/tests/recommendRank.test.mjs` :: "fit first: a trip whose main like reads under the minimum ranks below"

### REC-018 Trip match badge
- Decides: the % on a trip card.
- Rule: badge = `round(score x 100)`, clamped 0 to 99; hidden when the trip fit F is under 0.55 or the badge itself is under 55. No badge at all when F is null.
- Constant: `matchPct` in `continent-app/src/lib/recommend/rank.js:52`; badge at `:194`
- Test: `continent-app/tests/recommendRank.test.mjs` :: "the badge is the ranked score: the order follows the number shown (T884)"
- Test: `continent-app/tests/recommendRank.test.mjs` :: "the match shows from match.show_min up, else null"

### REC-019 Reasons on a trip card
- Decides: the up to three "why" lines.
- Rule: the persona reason first when there is one (REC-024); then up to 2 chosen likes reading 0.5 or more, strongest first; the month high within 3 C of the weather answer's target (not for snow); a quiet month (tier 1 or less) when avoiding crowds; a direct flight, else a gateway 1 to 45 minutes away; then any further strong likes; cut at 3.
- Constant: `reasons` in `continent-app/config/recommend.json:34` = max 3, maxLikes 2, weatherWithinC 3, airportCloseMin 45
- Constant: `reasonsFor` in `continent-app/src/lib/recommend/reasons.js:102`
- Test: `continent-app/tests/recommendRank.test.mjs` :: "reasons: at most three, the like first, in the traveller's terms"

### REC-020 The one catch
- Decides: the honest downside on a trip card.
- Rule: the first of: a fit conflict (busy, then car, then heat); over budget; a gateway transfer over 120 minutes; a flight with stops over 300 minutes; a crowd tier of 2 or more in the month; no flight price yet; the weakest chosen like under 0.5; else none.
- Constant: `catch` in `continent-app/config/recommend.json:40` = longTransferMin 120, longFlightMin 300, crowdTier 2
- Constant: `catchFor` in `continent-app/src/lib/recommend/reasons.js:134`
- Test: `continent-app/tests/recommendRank.test.mjs` :: "the catch: a conflict first, then the budget, then a long travel day"

### REC-021 Persona features of a place
- Decides: what each persona can read about a place.
- Rule: big and townish from the class tables (unknown class 0.3 and 0.5); notMetro; hubNear 1 within 10 km of a metro, 0 past 60 km, linear between; around = places rated 7.5 or more within 45 km, full at 8; coast = max(beach, islands, 0.8 if tagged coast); nature = max(hiking, lakes, ski); hidden = max(hidden, 1 for a hidden gem, 0.6 if tagged quiet); quiet `1 - crowd / 3` (0.5 unknown); nightlife (0.3 unknown); culture = max(culture, city); base = `place.base` (0.5 unknown). Gateways are not neighbours.
- Constant: `persona.size` in `continent-app/config/recommend.json:64` = big {metro 1, city 0.7, town 0.4, village 0.15, area 0.1}, townish {metro 0, city 0.35, town 1, village 0.85, area 0.55}
- Constant: `persona.hubKm` / `aroundKm` / `aroundMin` / `aroundCap` in `continent-app/config/recommend.json:60` = [10, 60] / 45 / 7.5 / 8
- Constant: `personaFeatures` in `continent-app/src/lib/recommend/persona.js:126`
- Test: `continent-app/tests/persona.test.mjs` :: "near the hubs, not in them: the calmer places beside Nice beat Nice"

### REC-022 Persona fit P and several picks
- Decides: how well a place fits the chosen persona or personas.
- Rule: per persona `P = sum(w_f x f) / sum(w_f)` over its profile; "mix" and unknown ids weigh nothing. With up to three picks a place's P is the best of `weight x P`, weight 1 for the "most you" pick (or every pick when none is marked) and 0.85 for the rest. A trip's P is its places' P weighed by nights.
- Constant: `persona.profiles` in `continent-app/config/recommend.json:68` (e.g. outside: hubNear 0.35, notMetro 0.2, townish 0.15, base 0.2, quiet 0.1)
- Constant: `persona.otherW` in `continent-app/config/recommend.json:58` = 0.85
- Constant: `personaFit` / `tripPersona` in `continent-app/src/lib/recommend/persona.js:177` and `:214`
- Test: `continent-app/tests/persona.test.mjs` :: "ten personas; mix weighs nothing"
- Test: `continent-app/tests/persona.test.mjs` :: "several picks: a place scores by the pick it fits best, the most you counting fully"

### REC-023 Persona place pool
- Decides: which places of a country a persona's trips start from.
- Rule: rated places of the country scoring 6.5 or more, with a photograph, not a gateway, ordered by `key + 3 x (P - 0.5)` (key = For you with the trip taste, else quality), ties by id; the first 12. This is the only place the persona's weight shift applies.
- Constant: `persona.weight` / `minScore` / `pool` in `continent-app/config/recommend.json:54` = 3 / 6.5 / 12
- Constant: `personaShift` / `personaPool` in `continent-app/src/lib/recommend/persona.js:192` and `:201`
- Test: `continent-app/tests/persona.test.mjs` :: "near the hubs, not in them: the calmer places beside Nice beat Nice"
- Test: `continent-app/tests/persona.test.mjs` :: "big cities and lively put Nice first; nature puts the quiet hiking town first"

### REC-024 Persona reason
- Decides: the persona line that leads a trip card.
- Rule: only when the trip's P is 0.55 or more, and only what is true: outside needs a metro nearby and a non-metro first place; hubtrips a metro or city first place with 3 or more good places around; cities every place a metro or city; towns 2 or more places, all town, village or area; coast 0.7, nature 0.7, nightlife 0.7, hidden 0.6 (or quiet 0.67), slow one place with base 0.6. Several picks speak through the best-fitting pick that has something true to say.
- Constant: `persona.reasonMin` / `reasonFacts` in `continent-app/config/recommend.json:57` = 0.55 / {aroundN 3, nature 0.7, hidden 0.6, quiet 0.67, nightlife 0.7, coast 0.7, base 0.6}
- Constant: `personaReason` in `continent-app/src/lib/recommend/persona.js:232`
- Test: `continent-app/tests/persona.test.mjs` :: "a trip's persona: its places by nights, and a reason in the traveller's terms"
- Test: `continent-app/tests/persona.test.mjs` :: "a reason from several picks names a pick the trip truly fits"

### REC-025 Persona shapes, reach and the side panel
- Decides: the trip shapes when "What kind of trip" is unanswered, how far big-city trips may reach, and the places and photos the plan flow shows for a persona.
- Rule: no shape answer: the union of the picks' shapes, "most you" first. The first pick with its own reach replaces the towns limits (cities 60 to 350 km). Side panel: places rated 6.5 or more with a photo whose P reaches 0.55, best P first, then score. Persona photos: among the 24 best fits rated 7.5 or more, the best known (fame) not yet used.
- Constant: `persona.shapes` / `persona.towns` in `continent-app/config/recommend.json:79` = e.g. cities [towns, one], hubtrips [one] / cities {maxKm 350, minKm 60}
- Constant: `personaShapes` / `personaReach` / `personaMatches` / `personaPhotos` in `continent-app/src/lib/recommend/persona.js:288`, `:295`, `:306`, `:325`
- Test: `continent-app/tests/persona.test.mjs` :: "the persona sets the shapes when What kind of trip has no answer, and big cities reach further"
- Test: `continent-app/tests/persona.test.mjs` :: "several picks: a place scores by the pick it fits best, the most you counting fully"

### REC-026 How many candidate trips, from where
- Decides: how many trips the finder builds and from which countries.
- Rule: countries from the Help me choose country match (up to 8), each with up to 12 places (the persona pool when a persona weighs); each country builds one trip per shape; when fewer than 6 trips result, each country's second-best place adds a one-place trip. At most 24 trips; a trip with the same places and transport is built once. An unasked "What are you up for" ranks countries by city, culture and food.
- Constant: `candidates.max` / `min` / `countries` / `placesPerCountry` in `continent-app/config/recommend.json:5` = 24 / 6 / 8 / 12
- Constant: `BROAD_TYPES` in `continent-app/src/lib/recommend/candidates.js:408` = city, culture, food
- Constant: `buildCandidates` in `continent-app/src/lib/recommend/candidates.js:300`
- Test: `continent-app/tests/recommendTrips.test.mjs` :: "the example answers give 6 to 24 priced trips, each with every slot"

### REC-027 Shapes and nights
- Decides: one place, a few towns or a road trip, and the nights in each.
- Rule: any shape means one, towns, road; "several countries" and "one way" fall back to towns; no car removes road; nothing left means one. A few towns needs 3 nights a place, a road trip 2, at most 3 places, at least 2. Nights split evenly, the remainder to the first places, never under one.
- Constant: `candidates.towns` / `road` / `anyShapes` / `fallbackShapes` in `continent-app/config/recommend.json:9` = towns {minNightsPerPlace 3, maxPlaces 3}, road {minNightsPerPlace 2}
- Constant: `shapesFor` / `splitNights` in `continent-app/src/lib/recommend/candidates.js:132` and `:55`
- Test: `continent-app/tests/recommendTrips.test.mjs` :: "shapes: any means one place, a few towns and a road trip; no car means no road trip"
- Test: `continent-app/tests/recommendTrips.test.mjs` :: "nights split the planner's way: the remainder to the first places"

### REC-028 Places within reach
- Decides: which places join the first one in a multi-place trip.
- Rule: in pool order, the first place, then each next place within maxKm of the first and at least minKm from every place taken; null when fewer than needed fit. Towns 30 to 150 km (a persona's reach may replace it), road 40 to 250 km.
- Constant: `candidates.towns.maxKm` / `minKm` = 150 / 30 and `candidates.road.maxKm` / `minKm` = 250 / 40 in `continent-app/config/recommend.json:9`
- Constant: `placesNear` in `continent-app/src/lib/recommend/candidates.js:160`
- Test: `continent-app/tests/persona.test.mjs` :: "the persona sets the shapes when What kind of trip has no answer, and big cities reach further"

### REC-029 Month and dates
- Decides: when a found trip is dated.
- Rule: exact setup dates win (nights from the dates). Months chosen: the one that comes round first from today. Else the best month of the next 12 starting next month: the mean high closest to the weather answer (warm 27, mild 21, snow 3), or with no weather answer the best mean quality; earlier wins ties; none at all gives the month after next. Nights: the setup's when answered, else 7, starting on the first Saturday of that month after today.
- Constant: `dates` in `continent-app/config/recommend.json:15` = nights 7, startWeekday 6, lookAheadMonths 12
- Constant: `month.tmaxByWeather` in `continent-app/config/recommend.json:21` = warm 27, mild 21, snow 3
- Constant: `setupMonth` / `bestMonth` / `datesFor` in `continent-app/src/lib/recommend/candidates.js:70`, `:91`, `:120`
- Test: `continent-app/tests/recommendTrips.test.mjs` :: "dates: the setup's, else the config's nights from the first Saturday of the month"
- Test: `continent-app/tests/recommendTrips.test.mjs` :: "the best month follows the weather answer"
- Test: `continent-app/tests/recommendTrips.test.mjs` :: "setupMonth takes the next month to come"

### REC-030 Gateway airport
- Decides: which airport a found trip flies into.
- Rule: first every place's own airports in trip order (the pickAirport choice, else its anchor), then up to 3 catalogue airports within 150 km of each place; skip home airports; take the first with a swept fare near the day out or in that month from any ticked home airport. With none, the first airport tried, marked unswept. Null when the trip does not fly.
- Constant: `gateway.nearKm` / `nearMax` in `continent-app/config/recommend.json:14` = 150 / 3
- Constant: `gatewayFor` in `continent-app/src/lib/recommend/candidates.js:242`
- Test: `continent-app/tests/recommendTrips.test.mjs` :: "the gateway is the first place's airport with a swept fare"

### REC-031 Getting there and around
- Decides: whether a trip flies, drives or takes the train, and how it is priced locally.
- Rule: no car = avoid car, or getting around by public transport or taxi. Train way: train. Car way or no flying: own car, or train without a car. A hire car answer or a booked car: car. No car: public. Otherwise a road trip hires a car and other shapes go public. A trip flies unless no flying, train or car was said.
- Constant: `wantsNoCar` / `transportFor` / `fliesThere` in `continent-app/src/lib/recommend/candidates.js:181`, `:188`, `:203`
- Test: `continent-app/tests/recommendTrips.test.mjs` :: "transport: a road trip hires a car; no flying drives from home, or takes the train without a car"
- Test: `continent-app/tests/recommendTrips.test.mjs` :: "no flying: no gateway, the trip drives from home"

### REC-032 Named places
- Decides: what happens when the traveller named towns or countries.
- Rule: named places are the only places trips are built from: each named town starts its own trips (its country's other named towns, then that country's best places after it) plus a one-place trip; each named country gives its best places (the persona pool, or the match's places plus the best 12 rated places with a photo). Too few trips: a named country's second place alone.
- Constant: `namedPool` in `continent-app/src/lib/recommend/candidates.js:425`
- Test: `continent-app/tests/namedPlaces.test.mjs` :: "one named country: every trip is in it"
- Test: `continent-app/tests/namedPlaces.test.mjs` :: "two named countries are a shortlist: trips in both, in no other"
- Test: `continent-app/tests/namedPlaces.test.mjs` :: "named towns each start a trip of their own, in their country"
- Test: `continent-app/tests/namedPlaces.test.mjs` :: "no places named: the pool is null and the finder ranks countries as before"

### REC-033 Price lines, total and trip id
- Decides: the slots, the total and the identity of a priced trip.
- Rule: one quoteTrip call prices the trip; slots in registry order flight, stay, food, local, activities. Stay tier by priority (price private, balance home, comfort hotel3). Things to do is notYet: never in a sum. A slot question 7 left to the traveller still counts at its typical price. Lines are to the cent, the rounding cent going to the largest line so lines add to the total; the total is the sum of slots with a figure. Trip id = FNV-1a hash of country, places, gateway, nights and month; builds are memoised per answer set (8 per catalogue).
- Constant: `slots` in `continent-app/config/slots.json:4`; `byPriority` at `:13` = price private, balance home, comfort hotel3
- Constant: `buildSlots` / `balanced` / `slotTotals` in `continent-app/src/lib/recommend/slots.js:117`, `:135`, `:167`
- Constant: `tripId` in `continent-app/src/lib/recommend/trips.js:35`; `MEMO_SIZE` at `:203` = 8
- Test: `continent-app/tests/recommendSlots.test.mjs` :: "the registry: five slots in order, things to do not yet"
- Test: `continent-app/tests/recommendSlots.test.mjs` :: "every trip has every slot; things to do is NotYet and out of the sum"
- Test: `continent-app/tests/recommendSlots.test.mjs` :: "a slot the traveller chooses still counts at its typical price"
- Test: `continent-app/tests/recommendTrips.test.mjs` :: "the same answers give the same trips, with the same ids"
- Test: `continent-app/tests/recommendTrips.test.mjs` :: "the receipt reads the trip's own slots: its total is the card's"

### REC-034 Levers
- Decides: what the flight, food and bases levers do.
- Rule: a lever only switches an existing setting: food cook, mix, out (Backpacker, Easygoing, Foodie), flight cheapest, quickest, times (price, comfort, balanced; on swept data it reorders, REC-016), bases one or several. A bases lever that would leave no trip keeps every trip. A swapped trip is priced again as a whole, once per trip and lever setting.
- Constant: `levers` in `continent-app/config/recommend.json:45`
- Constant: `applyLevers` in `continent-app/src/lib/recommend/rank.js:68`
- Test: `continent-app/tests/recommendLevers.test.mjs` :: "each lever value maps to its setting"
- Test: `continent-app/tests/recommendLevers.test.mjs` :: "a bases lever that leaves no trip falls back to every trip"
- Test: `continent-app/tests/recommendLevers.test.mjs` :: "on the catalogue: the food lever prices what a fresh build at that Lifestyle prices"

### REC-035 Compare side by side
- Decides: the compare table and its one best cell per row.
- Rule: up to 4 trips; rows total, flight, stay, days (food plus local), match, door to door (outbound flight minutes plus transfer), weather (day highs; best = closest mean to the weather target), crowds (busiest tier), budget (only when a budget exists). Lower wins except match. One best cell per row, never on a tie, with fewer than two figures, on a missing figure, or on a total (or budget delta) that leaves a slot out.
- Constant: `MAX_COMPARE` in `continent-app/src/lib/recommend/compare.js:26` = 4
- Constant: `compareRows` / `markBest` in `continent-app/src/lib/recommend/compare.js:87` and `:72`
- Test: `continent-app/tests/recommendCompare.test.mjs` :: "one best per decidable row, in the right direction"
- Test: `continent-app/tests/recommendCompare.test.mjs` :: "no best on a tie or with one figure"
- Test: `continent-app/tests/recommendCompare.test.mjs` :: "a missing figure is never the best"
- Test: `continent-app/tests/recommendCompare.test.mjs` :: "the budget row is hidden without a budget"
- Test: `continent-app/tests/recommendCompare.test.mjs` :: "door to door is the outbound flight plus the transfer"

### REC-036 Kept trips: "If it gets cheaper"
- Decides: when a kept trip reports a lower price.
- Rule: the kept flight (gateway, dates, paying seats, bag rule) is looked up again in the newest swept file of the same home airport; a drop a person (rounded) of at least 10 euros is reported, with the new total; no watch for the traveller's own flight, driving, no dates or no gateway. The biggest drop over the kept trips wins.
- Constant: `kept.dropMin` in `continent-app/config/recommend.json:50` = 10
- Constant: `flightLeg` / `dropOf` in `continent-app/src/lib/recommend/kept.js:28` and `:85`
- Test: `continent-app/tests/recommendKept.test.mjs` :: "a drop is the same flight, cheaper, a person, from the threshold up"
- Test: `continent-app/tests/recommendKept.test.mjs` :: "no flight to watch: own flight, driving, no dates, no gateway"
- Test: `continent-app/tests/recommendKept.test.mjs` :: "the biggest drop wins"

### REC-037 Decide together
- Decides: the shared shortlist and its order.
- Rule: up to 8 trips and 8 people ride in the `#together=` hash; fewer than 2 trips is no shortlist; the sender is person 1 and keeps all. Picking the same again clears it. Order: trips every voter kept (with more than one voter) first, then most keeps, then fewest skips, then shared order.
- Constant: `MAX_TRIPS` / `MAX_PEOPLE` in `continent-app/src/lib/recommend/together.js:19` = 8 / 8
- Constant: `standing` in `continent-app/src/lib/recommend/together.js:113`
- Test: `continent-app/tests/recommendKept.test.mjs` :: "the link carries the shortlist and the picks, and nothing else"
- Test: `continent-app/tests/recommendKept.test.mjs` :: "a newcomer joins with their first pick, and agreed trips rise"

### REC-038 Doors: flight first and "I know where"
- Decides: the trips the "Find my flight first" and "I know where I'm going" doors show.
- Rule: flight first builds one-base trips from up to 48 places (named places, else up to 4 per matched country, else the 4 best rated places with a photo per country), only where a swept gateway exists, one row per arrival airport; drops a trip whose flight or total a person is over the budget; sorts by the group flight price, then stops, then id; at most 30 rows. "I know where": the named towns (up to 4) are the route in the order named, nights split the planner's way; with only countries named, the finder's top-ranked trip.
- Constant: `FLIGHT_FIRST` in `continent-app/src/lib/recommend/doorTrips.js:36` = pool 48, perCountry 4, rows 30
- Constant: `flightRows` / `knowTrip` in `continent-app/src/lib/recommend/doorTrips.js:139` and `:177`
- Test: `continent-app/tests/doors.test.mjs` :: "Find my flight first: one row a place, cheapest flight for the group first, each with both legs"
- Test: `continent-app/tests/doors.test.mjs` :: "Find my flight first is narrowed by the answers: a named country, the budget"
- Test: `continent-app/tests/doors.test.mjs` :: "I know where: the named towns are the route, in the order named, the nights split"

## Rules with no test

REC-007, REC-008, REC-010

## HANDBOOK disagreements

| HANDBOOK says | Code does | Where |
|---|---|---|
| Trip finder step 5: persona `weight = 3` moves a place by up to 1.5 points (and `recommend.json` `persona._about` says the shift is added to each trip's score) | Since T884 the trip score takes the persona only through the blend (`persona_w` 0.25 of the answers); the `weight x (P - 0.5)` shift applies only to the country place pool key | `continent-app/src/lib/recommend/rank.js:185`, `continent-app/src/lib/recommend/persona.js:207` |
| Trip finder step 6: a catch names a transfer over 120 minutes, a flight over 300 minutes, or a crowd tier of 2 or more | The long-flight catch needs stops as well as 300 minutes; the catch order is conflict (busy, car, heat), over budget, transfer, flight, crowds, no flight price, weakest like | `continent-app/src/lib/recommend/reasons.js:134` |
| Trip finder step 4: the badge is shown only while it reads at least `show_min` (and `recommend.json` `rank._blend`: while F reads at least show_min) | Both must hold: the trip fit F at least 0.55 and the badge figure itself at least 55 (T1021) | `continent-app/src/lib/recommend/rank.js:194` |
| Personal match step 1: heat applies in "Help me choose only" when avoiding heat | The trip finder also counts heat when the weather answer is mild | `continent-app/src/lib/recommend/rank.js:150` |
| Trip finder step 2: candidates come from up to 8 countries; the second-best-place fallback is not mentioned, and dates look 12 months ahead | When no month fits, the month after next is used; the 12 months start next month, never this one | `continent-app/src/lib/recommend/candidates.js:81` |
