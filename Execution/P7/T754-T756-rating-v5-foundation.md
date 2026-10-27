# T754-T756: rating v5 batch R1, foundation

Batch R1 of the plan "Carta rating v5: a rating that makes sense, and a match that fits you" (Claude Doc of 27 October 2026; the prompt names it `Roadmap/2.10b-rating-v5.md`, which is not in the repo, see T754-f). Three tasks, one report, one end check. Pipeline and data only, plus four app files in T755. No screen changes. Live tiers keep the rating_v4 words; the five bands arrive in T776.

Task numbers: T753 was the highest number in `git log --all`, in every worktree's `Execution/` and in `wt/vite.t*.mjs`, and ListAgents showed no peer on these numbers, so T754 to T756 were taken as given. Owner decision 4 (airports as gateways) was answered yes on 27 October, so T755 ran.

Branches: root `p7-rating-v5-foundation` (worktree `wt/p7-rating-v5-root`, from `main`) and app `p7-rating-v5-foundation` (worktree `wt/p7-rating-v5-app`, from `master`). The main checkout (p15-plan-lifestyle-step, uncommitted planner work) was not touched and no stash was made. A Booking stays scrape (`scrape_booking.py --run 2026-10 --max-hours 6`) was live for the whole session, so every pipeline step ran on a copy of the master inside the root worktree and wrote that worktree's tracked wire, never the main checkout's master or wire (T754-a).

Root commits: `805728d8f` and `8c3c2b7bc` (T754), `045cf3cb5` and `9355d3e72` (T755), `a621c1e54` (T756). App commits: `e280957` (T754), `1fbb909` (T755), `c3f7af5` (T756).

Baseline measured once before any change, on the master of 2026-10-22 (sha1 `2f9d5701c4`), identical to the shipped wire.

---

## T754: freeze, fix recognition, version

### Task ID

T754

### Date

2026-10-27

### What changed

Every rating number now comes from one file, and every calibration is measured once and then frozen. `continent-app/config/rating.json` holds the weights, tier cutoffs, hidden-gem rule, register weights, highlight constants, significance weights and quotas, and appeal-scale ceilings. The pipeline reads it through the new `pipeline/rating_config.py`, and T776's `lib/rating.js` will read the same file. `reports/rating_reference_v5.json` holds what was measured: the zlog mean and spread of pageviews and sitelinks (new; until now the composite was z-scored on the catalogue of the day), the significance breakpoints, the per-class appeal scales (median, best, ceiling; until now measured on the catalogue of the day), the depth p99, the fallback coefficients (until now refit on every run), the fitted-score curves and the fame breakpoints for the hidden-gem flag (until now a rank in today's catalogue). It replaces `reports/significance_anchors.json` and `reports/rating_calibration_anchors.json`.

A normal run refits nothing. `--recalibrate --version X` on `score_significance.py` (significance part) or `apply_rating_layer.py` (rating part) rebuilds a part and refuses unless the config already names X for that part and the stored part does not. The reference keeps the 2026-09-04 breakpoints, because frozen zlog stats plus those breakpoints reproduce every stored `sig` to within 0.0005, while rebuilding them would have moved `sig` by 0.18 on average. It also keeps the T321 curves with the 798f1b84 coefficients they were built on: curves rebuilt on today's catalogue gave a reference SD gap of 0.182 and failed the 0.18 gate, while the T321 curves give 0.175.

Geoparks and biosphere reserves are their own registers (0.30 and 0.25 instead of a national park's 0.62). Stored designation rows keep `kind: national_park` until `apply_designations` runs again, so `place_registries.kind_of()` reads them by `registry`. Bochum's acclaim fell from 0.62 to 0.30 and its score from 8.5 to 8.0. It is still tier 2 (T754-b).

`meta.rating_model.version` reads `v5.0-r1`, with `formula_generation: rating_v4`, and there is no per-record key. The re-score closes T321-a: 3,601 dossier verdicts moved, most of them undoing the September curve compression T321 found.

### Files touched

**Modified:**
- pipeline/rating_layer.py (config and reference reads; `build_reference`; frozen fame percentiles; `_city_slots`)
- pipeline/score_significance.py (frozen `zlog(values, stats)`, breakpoints from the reference, `--recalibrate`)
- pipeline/apply_rating_layer.py (`--recalibrate --version`; frozen scales in `validate`; register kinds via `kind_of`)
- pipeline/appeal_scale.py (constants from config; `frozen_scales()`; `ANCHOR_FILE` is the v5 reference)
- pipeline/place_registries.py (`unesco_geopark`, `biosphere_reserve` kinds; `kind_of()`)
- pipeline/diagnostics/calibration_anchors.py (curves read from and written to the reference, through the version guard)
- tests/test_rating_distribution.py (curve read from the reference)
- continent-app/public/app_data.json, continent-app/public/dossier/*.json (3,601 verdicts) (data)

**Created:**
- continent-app/config/rating.json (root and app repo)
- pipeline/rating_config.py
- reports/rating_reference_v5.json
- tests/test_rating_stability.py (gate 1; frozen zlog; recalibration guard)

**Deleted:**
- reports/significance_anchors.json, reports/rating_calibration_anchors.json (moved into the reference)

### Commands run

From `wt/p7-rating-v5-root`, with `app_data/app_data.json` copied from the main checkout:

```
cd pipeline
python score_significance.py --recalibrate --version v5.0-r1
# then the 2026-09-04 breakpoints were put back into the significance part (see above)
python apply_rating_layer.py --recalibrate --version v5.0-r1
# then the T321 curves and the 798f1b84 coefficients were put into the rating part
python apply_rating_layer.py
python country_context_layer.py
cd ../continent-app && node scripts/sync-data.mjs
python <scratch>/refresh_verdicts.py .      # dossier verdict blocks only, see What broke
python -m pytest tests/test_golden_ratings.py tests/test_rating_distribution.py tests/test_rating_stability.py
```

### Config and secrets set

`continent-app/config/rating.json` version `v5.0-r1`. No secrets.

### Before/after measurements

| Metric | Before | After T754 | Delta |
|---|---|---|---|
| Tier counts 3/2/1/0 | 48/218/1,213/2,389 | 50/341/1,052/2,425 | +2/+123/-161/+36 |
| SD gap, curated vs fitted (reference) | 0.280 | 0.175 | -0.105 |
| Golden pairs | 120/120 | 120/120 | 0 |
| Bochum | 8.5, tier 2 | 8.0, tier 2 | -0.5 |
| Witten | 8.0, tier 2 | 7.8, tier 2 | -0.2 |
| Seville | 8.6, tier 2 | 8.6, tier 2 | 0 |
| Rome, Paris, London | 9.8 / 9.6 / 8.7, tier 3 | same | 0 |
| Edinburgh, Bergen | 9.1 / 9.2, tier 3 | same | 0 |
| Gate 1: 100 places added, other scores moved more than 0.05 | not testable (refit every run) | 0 | |
| Same gate with v4's cohort-measured class scales (control) | | 17 moved, 2 tiers lost (Leiden, Lausanne) | |
| `sig` moved by freezing zlog | | 2 of 152,461 | |

The tier-2 jump (218 to 341) is T321-a's projected undoing of the September compression: the fitted share at tier 2 or above returns to the band PLAN.md A4 set.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Curves rebuilt on today's catalogue failed gate 3 (0.182) | The fit lands on the catalogue it measures; the gate needs the audited curve | Kept T321's curves and the 798f1b84 coefficients they were built on (0.175) |
| A full dossier rebuild changed sleep, highlights, gallery and trips on most files | The master and caches have moved on since the last committed dossier build; unrelated to the rating | Restored the dossiers and refreshed only the `verdict` block with build_dossier's own code and hash (0 serialisation mismatches, content_hash reproduced) |

### What is still open

Bochum is still tier 2 (8.0). Its acclaim is fixed, but highlights (0.885) and a beauty value lifted by a UNESCO site 15 km away keep it up. In the T756 shadow run it falls to 7.5 (tier 1), so it hangs on T756-a or on its R2 rubric score (T754-b).

The shared master in the main checkout is not re-scored, because a scrape was live and the master is untracked state. After the merge the data lane has to run the chain, or the next `predev` sync ships the old ratings again (T754-a).

The intake scorer `score_place_candidates.DESIGNATION_WEIGHT` keeps its own register weights. It is not in this task's files (T754-d).

Beauty gems are still dataset quantiles (`assign_gems`), so they move when places are added. They are display-only, but they are the last cohort-relative number on a place (T754-e).

The reason-and-confidence-on-the-page part of T469-g continues as T754-c for T776.

The plan file is not in the repo (T754-f).

### Rollback procedure

`git revert 8c3c2b7bc 805728d8f` on the root branch and `git revert e280957` on the app branch. Revert T755 and T756 first if they are merged: their code reads the config and reference. That restores the two anchor files, the v4 constants, the old wire and the old dossier verdicts. A master that was re-scored with this code is put back by re-running `pipeline/apply_rating_layer.py` and `country_context_layer.py` with the reverted code, then `npm run data`.

---

## T755: one row per city

### Task ID

T755

### Date

2026-10-27

### What changed

A multi-airport city is one destination. Its primary airport row (`beauty_layer.CITY_PRIMARY_IATA`: FCO, CDG, LHR, MXP, VCE, ARN, WAW, OSL) carries the rating. The other 13 airport rows (CIA, ORY, BVA, STN, LTN, LGW, BGY, LIN, TSF, NYO, BMA, WMI, TRF) carry `gateway_of: <city row id>` and no rating block, so they rank nowhere: not in the country context, not in any rail and not in the top lists. Flight search still reads them, because their routes and fares are untouched.

The plan's "260 airport rows" counts every airport-keyed destination (Barcelona is BCN). Only these 13 were second rows of a city.

In the app, Explore's fame-based dedupe is replaced: `dedupeGateways` drops `gateway_of` rows and shows the city row under its plain name. `gateway_of` rides the rank tier (`RANK_FIELDS`), so it is there before the shards load. Flight search keeps its cheapest-gateway choice and lends a gateway card its city's rating, so Rome reached via Ciampino still reads as Rome 9.8.

The famous floors moved from CIA and BVA to FCO and CDG.

### Files touched

**Modified (pipeline, tests, docs):**
- pipeline/rating_layer.py (gateway rows), pipeline/apply_rating_layer.py (floors, validate, mirror)
- pipeline/country_context_layer.py (a gateway is not a slot), pipeline/diagnostics/appeal_queue.py (skips gateways)
- tests/test_golden_ratings.py (a gateway is read as its city)
- docs/SCHEMA.md (wire contract: `gateway_of`, `rating` on all but gateways)
- continent-app/public/app_data.json, 13 dossier verdicts (data)

**Modified (app, both repos):**
- continent-app/src/hooks/useExploreCatalog.js, continent-app/src/hooks/usePlaceRows.js
- continent-app/src/hooks/useDestinationSearch.js (not named in the prompt: without it the cheapest-gateway card loses its rating)
- continent-app/src/lib/bootIndex.js (not named in the prompt: `gateway_of` in `RANK_FIELDS`)

**Created:**
- tests/test_one_row_per_city.py (gate 5)

### Commands run

```
cd pipeline && python apply_rating_layer.py && python country_context_layer.py
cd ../continent-app && node scripts/sync-data.mjs
python <scratch>/refresh_verdicts.py .
node <scratch>/price_parity.mjs <app worktree> <T754 wire> <T755 wire>
python -m pytest tests/test_one_row_per_city.py tests/test_golden_ratings.py ...
```

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Airport rows in the top 50 | 30 (11 of them duplicates of 4 cities) | 24 (no duplicates) | -6 |
| Rome / Paris / London rows in the top 50 | 2 / 3 / 4 | 1 / 1 / 1 | |
| Milan rows in the catalogue | 3 (MXP, BGY, LIN) | 1 (MXP, 7.2, below the top 50's 8.5) | -2 |
| Tier counts 3/2/1/0 | 50/341/1,052/2,425 | 43/339/1,050/2,423 | the 13 gateways leave the counts |
| SD gap (reference) | 0.175 | 0.162 | -0.013 |
| Composed trip prices, 20 origins x 3,868 places x plane and car | | 154,720 quotes, 126,540 priced, 0 differ | |
| Gate 5 on the pre-T755 master (control) | | fails: Rome, Milan, Venice, Paris, London ... | |

The price check runs `quoteComposed` on routes hydrated per origin (`withOriginRoutes`), the way the app prices, on the T754 wire and the T755 wire. Its first version priced nothing: the core wire has no routes until it is hydrated, so all 154,720 quotes were null and "0 differ" was vacuous. The check now counts priced quotes and fails on zero. The swept flight file is not read by this check and was not touched.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `check-contract.mjs` rejected the T755 wire | `gateway_of` was undocumented, and `rating` was declared on every record | `docs/SCHEMA.md` table: `rating` some (all but gateways, held by gate 5), `gateway_of` some (commit 9355d3e72) |
| Price parity said 0 differ while pricing nothing | Unhydrated routes | Hydrate per origin; count priced quotes |

### What is still open

15 pairs of rated rows share a city name. About eleven look like duplicate ingests of the same village, such as `gem:seborga` and `gem:seborga-it` or `gem:charroux` and `gem:charroux-fr`. Others are false matches (Frankfurt and Frankfurt (Oder)) or an airport next to its gem (LMP and `gem:lampedusa`). Merging or removing catalogue rows is the owner's call (T755-a).

Other surfaces may still meet a gateway row. Ask Carta's ranking, `countryMatch`, the map pins, the trip planner's choose step and `#dest=CIA` all need checking: a gateway's own destination page has no verdict and should show its city (T755-b, for T776).

### Rollback procedure

`git revert 9355d3e72 045cf3cb5` on the root branch and `git revert 1fbb909` on the app branch. Then run `pipeline/apply_rating_layer.py` and `country_context_layer.py` with the reverted code and `npm run data`: every airport row is rated again and Explore picks by fame as before.

---

## T756: depth replaces highlights; beauty v2; POI re-quota

### Task ID

T756

### Date

2026-10-27

### What changed

The POI re-quota is live. The full significance apply (not `--sig-only`) put rate 3 at 11.9% and rate 2 at 28.2%, against 61.7% and 22.2%. `sig` did not move (2 of 152,461), so no live score changed. Nine confidence labels and 48 `inputs_present` counts moved, because confidence counts rated sights. The day planner's "Must-see" will mean something again once the POI shards are pushed (T754-a).

Depth (D) and beauty v2 are built, tested and measured, but not live. They switch on with `depth.live` and `beauty.live` in the config.

D follows the plan's "D, depth" section with one interpretation. POIs at rate 3 (weight 1) and rate 2 (weight 0.5) are selected, as the prompt says, and each selected POI's weight is then scaled by its absolute significance (`sig / 3`). Rate alone is a town-relative quota: every 52-POI metro holds about six rate-3 items whatever they are, and unweighted, Rome's raw depth came out below Bochum's. D also counts rated beaches, lakes and peaks scored 7.6 or more between 5 and 25 km (25 km straight-line is about 30 minutes by the pipeline's road formula), plus hikes and cycling routes rated 7.6 or more within 25 km. Items are sorted into eight categories with diminishing returns (w / i up to four items) and a bonus of 0.25 per category covered, then read as a percentile on frozen per-class breakpoints. The POI kinds have no market, food or nightlife values, so those three categories come from name patterns. Theatres stay sights, because the kind includes Roman amphitheatres.

Beauty v2 follows the plan's "B, beauty" section: urban fabric 0.35, natural setting 0.35, water 0.20, iconic view 0.10 and UNESCO 0, with the standout bonus kept. Two choices enforce "no fact feeds two components". Lakes go to water only, not also to the natural setting as the plan's table has them. And the `national-park` and `unesco` category tags, which restate a register that recognition already counts, are not read. An item within 5 km is beauty's, and depth counts only beyond it. A nature POI standing within 300 m of such an item is the same fact and is skipped. The wire keys stay as they are: `nature` holds the setting, `beach` holds water, and `heritage` stays measured for the app's culture match with weight 0.

Switched on, both break gates the rating must keep, so turning them on is the owner's decision (T756-a):

| Run (in memory, recalibrated) | Tier counts 3/2/1/0 | Famous floors | Beauty/pop corr (gate 0.12) | Golden regressions |
|---|---|---|---|---|
| Live today (v4 highlights, beauty v1) | 43/339/1,050/2,423 | pass | +0.022 (beauty v1) | 0 |
| D only | 26/120/802/2,907 | Paris 8.9, Barcelona 8.7 | +0.055 | Plovdiv above Sofia |
| Beauty v2 only | 30/246/1,039/2,540 | pass | +0.152 | Obidos above Braganca |
| Both | 15/99/709/3,032 | Rome 8.9, Paris 8.8, Barcelona 8.6 | +0.152 | Plovdiv above Sofia |

Why it happens:

- **D:** a within-class percentile averages 0.5 in every class, while v4 highlights averaged about 0.9. That takes roughly half a point off every curated deep place, and only fitted places are recalibrated.
- **Beauty v2:** it gives a city with no peak, beach or lake only its urban fabric and its iconic view. Rome falls from beauty 8.5 to 5.3. Urban at 0.35 also tilts beauty toward large places, hence the +0.152.

The distribution test says outright never to loosen a threshold to make a run pass. And the plan reserves weight tuning for R2's golden pairs and persona set. So R1 does not tune either change into passing.

### Files touched

**Modified:**
- pipeline/rating_layer.py (depth: `poi_category`, `depth_items`, `depth_raw`, `depth_knots`, `depth_map`; v4 highlights stay the live path)
- pipeline/beauty_layer.py (`compute_beauty_v2`, `nature_index`, `setting_items`, `centre`; v1 stays the live path)
- pipeline/rating_config.py (per-part reference versions, `part_version`)
- pipeline/apply_rating_layer.py (recalibration summary line), pipeline/diagnostics/calibration_anchors.py (no `highlights_model` on v5 wires)
- continent-app/config/rating.json (depth, beauty, highlights sections; `reference_versions`) (root and app repo)
- tests/test_rating_stability.py (guard test cannot write)
- continent-app/public/app_data.json, 48 dossier verdicts (data)

**Created:**
- tests/test_rating_inputs.py (no fact in two components, beauty v2 reads no register, water per place, shadow depth saturation, rate quota)

### Commands run

```
cd pipeline
python score_significance.py apply
python apply_beauty_layer.py
python apply_rating_layer.py
python country_context_layer.py
cd ../continent-app && node scripts/sync-data.mjs
python <scratch>/refresh_verdicts.py .
python <scratch>/experiment.py . {v1|v2} {v4|v5} <T755 master>     # the shadow table above, writes nothing
python -m pytest tests/test_rating_inputs.py tests/test_rating_stability.py tests/test_one_row_per_city.py tests/test_golden_ratings.py tests/test_rating_distribution.py
```

### Config and secrets set

`continent-app/config/rating.json`: `depth.live` false, `beauty.live` false, `version` and both `reference_versions` stay `v5.0-r1`. Turning either switch on is a rating-part recalibration: bump `version` and `reference_versions.rating`, then run `apply_beauty_layer.py` and `apply_rating_layer.py --recalibrate --version <new>`.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| POIs at rate 3 | 61.7% | 11.9% | -49.8pp (target 12% +-2) |
| POIs at rate 2 | 22.2% | 28.2% | +6.0pp (target 28%) |
| Tier-3 places with highlights >= 0.98 (live, v4) | 36/43 (83.7%) | 36/43 (83.7%) | 0 (D not live) |
| Tier-3 places with D >= 0.98 (shadow) | | 2/43 (4.7%) | under the 20% target |
| Distinct water values, 20 Spanish coastal towns | 3 (Blue Flag by country) | 11 (shadow) | +8 |
| Destinations with a fact in both B and D (shadow) | | 0 | |
| Spearman, raw D vs `place.visit_h` | | metro 0.25, city 0.50, town 0.54, village 0.58, area 0.79 | |
| Live scores moved | | 0 | |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| D and beauty v2 broke four gates when switched on | See the table under What changed | Not shipped live; built behind config switches; owner decision T756-a |
| Unweighted D ranked Rome under Bochum | Rate is a per-town quota | POI weight scaled by `sig / 3` |
| Bochum read a strong natural setting | Its `national-park` tag restates the geopark designation | Register tags excluded from beauty v2 |
| "Marche" (an Italian region) read as a market; Roman theatres as nightlife | The `march[e]` pattern and the Theatre kind | Pattern narrowed to `marché`; Theatre stays sights |
| Regex patterns arrived as backspaces in the config | A shell heredoc ate the backslashes | Fixed with the Edit tool |
| `--recalibrate` wrote the part, then crashed on its summary line | The line still printed `depth_p99` | Line fixed; the part was rolled back with the shadow switch |

### What is still open

D and beauty v2 wait for the owner (T756-a). My recommendation is to switch them on after R2 has scored every place on the rubric and after T774 gives POIs labels and one category set, re-tuning the four Q weights on the golden pairs and personas then, as the plan orders. The alternatives are re-deriving the tier ladder and the famous floors now, or lowering urban in beauty, and both are model decisions.

`place.depth` and `visit_h` were derived from the old rates. The place layer was not re-run, because `run_pipeline`'s significance task does not run it. The day planner's labels change once the POI shards are re-pushed (T756-b, with T754-a).

The POI categories are name patterns, and T774's one category set replaces them (T756-c, for T774).

T286-c stays open for T774.

### Rollback procedure

`git revert a621c1e54` on the root branch and `git revert c3f7af5` on the app branch. To restore the old rates, which are data, re-run `pipeline/score_significance.py apply --sig-only` on a master from before the batch, or copy one back: the significance apply rewrites `rate` in place and has no inverse. Then `apply_rating_layer.py`, `country_context_layer.py` and `npm run data`.

---

## Batch end check

Run once on the batch branches, with the fast NOPUBLIC build (`wt/vite.t754.mjs`, 12 s) and a dev server on 5754. The server serves the root worktree's re-scored public folder. The browser script (Playwright, kept in the session scratchpad and not committed) ran at 390 x 844 and 1440 x 900. 28 of 28 checks passed:

- **Explore list:** 48 cards, no gateway row, no list showing a city twice, Rome as FCO only.
- **Rome's destination page:** the rating breakdown renders four tiles (9.8 Exceptional, Top of Italy).
- **Places, from Brussels (13 to 16 November):** 66 to 72 rails with no city twice and no airport name on a card. "Show all places" lists 48 rows, all priced, with Rome once as "Rome".
- **Page errors:** none.

The other checks:

- **App unit tests:** `npm test` in the app worktree, 833 tests, 823 pass, 0 fail, 10 skipped.
- **Contract gate:** `scripts/ci/check-contract.mjs` with `CARTA_REPO_ROOT` on the root worktree passes. Its database half is skipped as usual (no PGPORT).
- **Rating suites:** 14 pass.

Screens touched, for the next look: Explore list and Places rails, Rome's destination page (Practical, "Why it rates"), and the Places list priced from Brussels. Screenshots are in `wt/shots-t754/`.
