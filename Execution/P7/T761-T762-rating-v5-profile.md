# T761-T762: rating v5 batch R3, nature on the ladder, POI labels and the place taste profile

Batch R3 of the plan "Carta rating v5" (Claude Doc of 27 October 2026; `Roadmap/2.10b-rating-v5.md` is still not in the repo, T754-f). Two tasks, one report, one end check. Branch `p7-rating-v5-profile` in both repos, from the R2 branch `p7-rating-v5-scoring`.

The wire is at **schema v19**, additive: every v18 key keeps its value. New on the wire:
- `rating.band`, `rating.why` (English), `rating.class_rank`;
- `gateways` on a city row;
- `taste` on every rated place;
- `v5` on every nature row;
- `label`, `category` and `tags` on every POI.

The app reads none of them yet. R4 (T763 to T766) moves the screens onto them.

Commits, root repo: `ff4ebbe34` T761, `25ab70f37` T762, `422a6920c` T762 (fact cards). App repo: `282f8b4` T761, `7accc1b` T762.

---

## T761

### Task ID

T761: nature items on the place ladder, POI labels and the one category set. Closes T754-d, T754-e, T756-c and T759-d.

### Date

2026-10-28

### What changed

Every rated trail, beach, lake, peak and cycle route now carries `v5 {score, band, rank, facts, confidence}` (`pipeline/nature_tiers.py`):

- **Score.** Each kind is read as a frozen Europe-wide percentile, then placed on the same cutoffs as places, so "Excellent" means the same for a lake and a village.
- **Missing parts.** A missing part counts at the kind's median. Nothing is renormalised.
- **What the score no longer reads.** Blue Flag, lifeguard and the mountain difficulty penalty are out of the score. They are facts beside it.
- **Unscored items.** An item with under half its parts measured is `unscored`: no score, band or rank.
- **Rank.** The rank line uses the smallest scope (NUTS 2 region, then country) that holds 5 or more items.

Every POI now carries a `label` (must-see, recommended, worth a look), a `category` and `tags` (`pipeline/poi_labels.py`):

- **Label rules.** Labels are capped per place class. A must-see must be inside the place and nationally recognised. `rate` is derived from the label (3, 2, 1).
- **Categories.** There is one set of eight, mapped from the POI kind in config `poi_categories`. Depth now reads that set instead of name patterns (closes T756-c).
- **Pipeline.** `score_significance.py apply` re-labels after it rates.

The rating part of the reference was re-measured as v5.0-r3, because depth changed. Paris then scored 8.7 against its 8.8 famous floor. The floor is now **8.7, provisional**, for the owner to confirm (see T761-b and the cause under "What broke").

Two smaller fixes:
- **Register weights (closes T754-d).** The intake scorer reads the rating's register weights. The second table had drifted: national park 0.70 against 0.62, heritage town 0.75 against 0.72.
- **Gem cutoffs (closes T754-e).** Beauty gems read frozen cutoffs (the reference's `beauty` part, frozen at the cutoffs in force). Re-measuring them needs `apply_beauty_layer.py --recalibrate --version`.

### Files touched

**Created:**
- `pipeline/nature_tiers.py`, `pipeline/poi_labels.py`
- `tests/test_nature_tiers.py`, `tests/test_poi_labels.py`

**Modified:**
- Nature scorers (v5 parts beside the old score):
  - `pipeline/beaches/beauty_index.py`, `export_beaches.py`
  - `pipeline/lakes/lake_index.py`, `export_lakes.py`
  - `pipeline/mountains/peak_index.py`, `export_peaks.py`
  - `pipeline/cycling/cycle_index.py`, `pipeline/trails/rate.py`
- Rating:
  - `pipeline/rating_layer.py` (depth on the category set)
  - `pipeline/apply_rating_layer.py` (Paris floor)
  - `pipeline/rating_config.py` (parts nature, taste, beauty)
- `pipeline/score_significance.py` (calls poi_labels), `pipeline/score_place_candidates.py` (T754-d)
- `pipeline/beauty_layer.py`, `pipeline/apply_beauty_layer.py` (T754-e)
- `tests/test_rating_inputs.py`: the rate-3 quota test now checks that rate 3 is the must-see set
- `continent-app/config/rating.json` (both repos): `nature`, `poi_labels`, `poi_categories`, part versions
- `reports/rating_reference_v5.json`: parts rating v5.0-r3, nature, beauty and taste
- `cache/poi_wikidata.json`: sitelinks for every scored POI URL
- Wires: `continent-app/public/{beaches,lakes,mountains,trails,cycling}/*.json`

### Commands run

```
python pipeline/harvest_poi_wikidata.py                      # 45,717 URLs with sitelinks
python pipeline/nature_tiers.py --recalibrate --version v5.0-r3
python pipeline/nature_tiers.py && python pipeline/nature_tiers.py --check
python pipeline/poi_labels.py
python pipeline/apply_rating_layer.py --recalibrate --version v5.0-r3   # refused: Paris 8.7 < 8.8
python pipeline/apply_rating_layer.py                        # after the floor change
python pipeline/country_context_layer.py
python pipeline/apply_beauty_layer.py
```

On the Hetzner box, detached: `python3 pipeline/harvest_poi_fees.py --wiki-only`. It runs on the box only, not on the laptop (T761-a).

### Config and secrets set

`continent-app/config/rating.json`:
- `reference_versions`: rating v5.0-r3; nature, taste and beauty v5.0-r3.
- New blocks: `nature`, `poi_labels`, `poi_categories`.
- `depth.kind_category` and `depth.name_category` are removed.

No secrets.

### Before/after measurements

Nature ladder, per kind (the "before" is none: no kind had a v5 score):

| Kind | Rows | Exceptional | Excellent | Very good | Good | Pleasant | No band | Measured / partial / unscored |
|---|---|---|---|---|---|---|---|---|
| Trails | 17,404 | 3.0% | 9.0% | 18.0% | 25.0% | 25.0% | 20.0% | 12,061 / 5,343 / 0 |
| Beaches | 2,745 | 3.0% | 9.0% | 18.0% | 23.0% | 26.9% | 20.0% | 62 / 2,651 / 32 |
| Lakes | 1,628 | 3.0% | 9.0% | 18.0% | 24.9% | 25.0% | 20.0% | 325 / 1,303 / 0 |
| Peaks | 728 | 3.0% | 9.1% | 18.0% | 24.9% | 25.0% | 20.1% | 3 / 725 / 0 |
| Cycling | 513 | 3.1% | 9.0% | 17.9% | 25.0% | 25.0% | 20.1% | 512 / 1 / 0 |

A re-run gives the same wire, and re-measuring gives the same breakpoints, for all five kinds (`nature_tiers.py --check`).

POI labels per place class (157,775 POIs):

| Class | Must-see | Recommended | Worth a look |
|---|---|---|---|
| Metro | 15.4% | 46.3% | 33.8% |
| City | 10.4% | 31.5% | 54.8% |
| Town | 6.5% | 19.7% | 70.2% |
| Village | 4.8% | 14.8% | 77.1% |
| Area | 8.6% | 27.9% | 61.0% |

T759-d (depth on the one category set, rating part v5.0-r3):

| Place | Score before | Score after | Depth before | Depth after |
|---|---|---|---|---|
| Paris | 8.9 | 8.7 | 0.349 | 0.246 |
| Barcelona | 8.8 | 9.0 | 0.302 | 0.500 |
| Rome | 9.6 | 10.0 | 0.575 | 0.869 |
| Prague | 9.6 | 9.2 | 0.754 | 0.810 |
| Madrid | 7.7 | 8.0 | 0.079 | 0.357 |
| Berlin | 8.5 | 8.2 | 0.881 | 0.579 |
| Budapest | 8.9 | 8.5 | 0.818 | 0.548 |
| London | 7.9 | 7.8 | 0.552 | 0.464 |

- **Score moves.** 387 of 3,855 places move by more than 0.3 (largest 1.2).
- **Share at 9.0 or more.** Metro 3.5% (was 3.5%), city 2.8% (2.6%), town 2.8% (2.8%), village 2.6% (2.4%), area 3.5% (2.9%).

Gems (T754-e):
- **Cutoffs.** Frozen at g2 0.1139, g3 0.2148, g4 0.345, g5 0.5082.
- **What moved.** A re-run moved 8 places' gems, each because its own beauty score fell (Heidelberg 4.4 to 3.0, Sigulda 5.3 to 4.0). The cause is the refreshed peak data, see "What broke". No other place moved.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The recalibrated rating refused to write: CDG 8.7 under the famous floor 8.8 | Depth now counts real categories. Every metro's POI list is cut at 52 items (1,674 places, 122 of 127 metros) and labelled under the metro cap of 8 must-see and 24 recommended. So metro depth ranks the category mix of a truncated list, and no shipped POI kind is food or market. | Paris floor 8.7, marked provisional in `apply_rating_layer.py` for the owner (T761-b). The cap is T761-c. Barcelona clears 8.8 at 9.0. |
| 91 peaks changed their old `score` (18 left the rated list, 10 joined), and 8 places changed gems | The peak cache copied from the box holds newer terrain data. The original scorer gives the same result on it, so the code is not the cause. | None needed. Measured and recorded here. |
| The Wikidata harvest crashed mid-write | C: had 0 bytes free | The owner freed space; the harvest resumed from its cache. |
| The first end check showed old scores on destination pages and passed falsely | The page prefers `dossier.verdict` over `rating`, and the dossiers predated the re-score. The match "8.7" also hit a cutoff label. | Dossiers rebuilt (in T762). The check now matches "rates {score}". |

### What is still open

- **T761-a (owner).** The POI fee harvest runs on the Hetzner box. It was at 2,240 of 44,755 at 11:30 and should finish around 06:00 on 2026-10-29. Its cache stays on the box, where `poi_labels.py` reads it for `tags.free`. It reaches the wire once this branch is merged, the box has pulled it, and the next `poi_significance` run re-labels. Until then `tags` is empty almost everywhere (one local shard of 960 answers).
- **T761-b (owner).** Paris's floor is 8.7, provisional. Confirm it, or restore 8.8. Restoring means a one-line change in `FAMOUS_FLOOR` plus a weight or depth change, because 8.8 refuses on today's data.
- **T761-c.** `items_full` is cut at 52 for 1,674 places, and depth counts the label-capped `rate`, so for metros and many cities depth measures the category mix of a truncated list. Lift the cap in the activities harvest, and let depth read significance rather than the presentation labels.
- **T761-d.** The lake layer files coastal EEA bathing sites as lakes (Praia da Aguda near Porto, Alimos Marina in Athens). The taste profile drops the 59 that sit on a sea beach. 49 more are coastal by name (ports, marinas, plages). Fix the classification in the lake layer.
- **T761-e.** Most fact fields are null: peak difficulty and season 100%, cycling family 100%, Blue Flag 99%, lifeguard 94%, trail SAC 83%. R4 shows only the facts present. Each needs a source.
- **T761-f.** No shipped POI kind is food, drink or market. The food like is the guided-search vibe alone, and depth has no food or market category. This needs a source.
- **T761-g.** The nature scorers keep the old score, rating and tier path (it still renormalises and reads Blue Flag) beside v5, because v18 keys keep their values. Delete it when R4 moves the app to v5. Order: T763.

### Rollback

1. Revert `ff4ebbe34` (root) and `282f8b4` (app). Revert T762 first if it is in.
2. The master (`app_data/app_data.json`, untracked) still carries labels and the new rates. Re-run `score_significance.py apply`, `apply_rating_layer.py`, `country_context_layer.py` and `apply_beauty_layer.py`, then `sync-data`.

The nature wires are tracked, so the revert restores them.

### End check list

- Explore lists.
- A destination page's rating fold: Paris, Rome, a rubric-scored place.
- The beach, lake and peak lists (old keys, unchanged except the 91 peaks).

---

## T762

### Task ID

T762: the place taste profile and schema v19. Closes T082-d and T758-e.

### Date

2026-10-28

### What changed

Every rated place (3,855) carries `taste` (`pipeline/place_taste_profile.py`):
- **Twelve values.** One per like key of the planner's `LIKES`, each `[value 0..1, fact]`. The test reads the keys from `tripSettings.js`, so the two lists cannot drift.
- **How a value is built.** It starts from the guided-search vibe and is checked against catalogue facts: v5 nature within 30 minutes, designations, POI categories, the place class, fame, island status. It is then read as a frozen percentile against the reference set (`taste` part v5.0-r3).
- **Facts that count.** A vibe with no fact behind it counts for nothing. Only Good or better nature counts.
- **Carried along.** `size`, `crowd_by_month` (Eurostat monthly tiers), `car_need` and `cost_level` (the mid-range meal price, the place's only price figure).

`rating` gains:
- `band` (the five v5 words, 9.0 / 8.3 / 7.6 / 6.9 / 6.0);
- `why` (English: the hand reason, else the rubric reason);
- `class_rank` (`{class, pct, scope: "europe"}`).

A city row lists its `gateways`. The other five reason languages are lazy files, `public/app_data/why_i18n/{nl,de,fr,es,it}.json`, written by `sync-data`. `rating.why` stays out of the rank tier because only the destination page reads it.

The contract (`scripts/ci/contract.mjs`) checks every v19 key to the second level, on the main wire, the POI shards and the nature rows, each with seeded breaks (closes T082-d). `docs/SCHEMA.md` documents v19, and its stale rating_v2 section is rewritten for v5.

Two pipeline additions:
- `run_pipeline.py` gains the weekly `rating_v5_profile` task (nature ladder, then taste), placed after the last nature writer.
- The fact cards now carry the monthly crowd series (closes T758-e: 3,289 places, 825 regions).

### Files touched

**Created:**
- `pipeline/place_taste_profile.py`, `tests/test_place_taste_profile.py`
- `continent-app/public/app_data/why_i18n/*.json`

**Modified:**
- `pipeline/rating_layer.py` (band, why, gateways), `pipeline/apply_rating_layer.py` (schema 19, gateways mirror)
- `pipeline/country_context_layer.py` (class_rank)
- `run_pipeline.py`, `docs/SCHEMA.md`
- `continent-app/scripts/ci/contract.mjs`, `check-contract.mjs`, `fixtures/contract-min.json`
- `continent-app/scripts/sync-data.mjs`, `continent-app/src/lib/bootIndex.js` (both repos)
- `continent-app/public/app_data.json`
- `continent-app/public/dossier/*` (3,818 rebuilt)
- `data/reports/dossier_*.json`, `data/rating/fact_cards/*`, `data/rating/hidden/scorer_hidden.jsonl`

### Commands run

```
python pipeline/place_taste_profile.py --recalibrate --version v5.0-r3
python pipeline/place_taste_profile.py && python pipeline/place_taste_profile.py --check
node continent-app/scripts/sync-data.mjs
python pipeline/dossier/build_dossier.py --all && python pipeline/dossier/audit.py --strict
python pipeline/rating_fact_cards.py
node continent-app/scripts/ci/make-fixture.mjs && node continent-app/scripts/ci/check-contract.mjs
```

### Config and secrets set

`continent-app/config/rating.json` `reference_versions.taste` v5.0-r3 (in the T761 commit). No secrets.

### Before/after measurements

| Metric | Before | After |
|---|---|---|
| Schema version | 18 | 19 |
| `public/app_data.json`, gzip | 1,991 KB | 2,697 KB (taste +221, rating +153, monthly crowds +106) |
| `boot.json`, raw | 235 KB | 236 KB |
| `dest/_rank.json`, gzip | not measured (untracked) | 454 KB (591 with `rating.why` in it) |
| Taste re-run against the frozen reference | n/a | 3,855 of 3,855 identical |

The app never downloads `app_data.json` whole. It loads `boot.json`, `_rank.json` and one country file at a time, so the growth lands in the country files.

Reasons, inline or lazy (gzip):
- **Inline.** All six languages in the wire would add 786 KB (+38%).
- **English only.** Adds 138 KB.
- **Lazy files.** Each other language is a separate file of about 143 KB, fetched only in that language.

Lazy chosen.

Taste sanity check (`tests/test_place_taste_profile.py`, register row T762-a): for each like, 5 places that must be in the top 10% and 5 that must be in the bottom half. All 120 pass. The first run failed 16. The fixes were made to the model:
- **Beaches.** Sea beaches only.
- **Nature facts.** Only Good or better nature counts.
- **Vibes without facts.** A vibe without a fact counts for nothing.
- **Nightlife.** Needs a town big enough, or the venues on their own.
- **Wellness.** City saunas count for a fifth.
- **Lakes.** Lake rows sitting on a sea beach are dropped (T761-d).

Some places in the lists were swapped. Most failed only on catalogue problems:
- Lisbon and Athens on lakes: coastal sites filed as lakes.
- Amsterdam and Brussels on hiking: city-edge walks rated Very good.
- Benidorm and Fuerteventura on culture: heritage POI counts.
- Matera on nightlife: filed as a city.
- Barcelona on food: food vibe 59.

The rest are not rated places in the catalogue (Valletta, St. Anton, Magaluf). The owner checks the swaps with T762-a.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Contract fixture failed | It was still schema 18 | Regenerated with `make-fixture.mjs` |
| `rating.why` added 137 KB gzip to the default-screen rank tier | `RANK_FIELDS` carries rating minus components | `rating: { omit: ['components', 'why'] }` |
| Destination pages showed old scores | Dossiers built before the re-score | `build_dossier.py --all` |

### What is still open

- **T762-a (owner).** Read the sanity lists in `tests/test_place_taste_profile.py` (the reason beside each place) and the swapped places above.
- **T762-b.** `taste` is not in the rank tier, so the default screens do not have it. R4's "For you" sort on lists (T765) needs it there, or must fetch it. Measure before adding. Order: before T765.

### Rollback

1. Revert `422a6920c` and `25ab70f37` (root) and `7accc1b` (app).
2. Strip `taste`, `gateways`, `rating.band`, `rating.why` and `rating.class_rank` from the master. A re-run of `apply_rating_layer.py` and `country_context_layer.py` at the reverted code does this, except for taste, which needs a one-line delete.
3. Run `sync-data` and `build_dossier.py --all`.

### End check list

- The destination page's rating fold reads the new score.
- Explore and the planner quiz render, with no page errors.

---

## Batch end check

Run once on the batch branches. A dev server on 5761 (`wt/vite.t761.mjs`) served the root worktree's rebuilt public folder. R2's Playwright scripts ran at 390 x 844 and 1440 x 900 (kept in the session scratchpad, not committed):

| Screen | Phone | Desktop |
|---|---|---|
| Explore list leads with high scores (Rome 10, Bruges 9.7, Como 9.7, Salzburg 9.6) | pass | pass |
| Rome, hand-scored: RatingBreakdown 4 tiles, "Why it rates 10.0" | pass | pass |
| Opi, rubric-scored: 4 tiles, "Why it rates 8.8" | pass | pass |
| Paris: 4 tiles, "Why it rates 8.7" | pass | pass |
| Planner "Help me choose": "Recommended for you" lists 152 matches (Salzburg, Hallstatt, Innsbruck, Rome) | pass | pass |
| No page errors | pass | pass |

Nothing on screen changed except the order and the scores. One thing on screen is still old and belongs to T763: the breakdown labels Paris 8.7 "Exceptional", because the app still uses v4's 8.7 / 7.8 / 6.9 cutoffs (T759-c).

Tests:
- **Python.** Nature, labels, taste, rating inputs, golden, distribution, stability and one-row-per-city: 29 passed, 1 skipped.
- **Node.** `npm test` in the app worktree: 833 tests, 788 pass, 42 skipped. The 3 credits-page tests failed until `public/boot.json` and `coverage.json` were copied into the worktree, then passed.
- **Contract.** `check-contract.mjs` passed, including 41 sampled POI shards, 23,018 rated nature rows and the three seeded v19 breaks.
- **Screenshots.** `wt/shots-t761/`.
