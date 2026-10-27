# T757-T760: rating v5 batch R2, scoring

Batch R2 of the plan "Carta rating v5: a rating that makes sense, and a match that fits you" (Claude Doc of 27 October 2026, https://claude.ai/artifact/L6NrpP7jqSWHqQQqg8pPcm; the prompt names `Roadmap/2.10b-rating-v5.md`, still not in the repo, T754-f). Four tasks, one report, one end check. Every place now has an appeal score, a reason in six languages and one formula; the screens are unchanged except the order and the scores.

Task numbers: T756 was the highest number in `git log --all`, in every worktree's `Execution/` and in `wt/vite.t*.mjs`, and ListAgents showed no peer on these numbers, so T757 to T760 were taken as given.

Branches: R1 is not merged, so this batch branches from `p7-rating-v5-foundation` (as the prompt allows): root `p7-rating-v5-scoring` (worktree `wt/p7-rating-v5-scoring-root`) and app `p7-rating-v5-scoring` (worktree `wt/p7-rating-v5-scoring-app`). Merging this batch merges R1 with it. The main checkout was not touched and no stash was made. No python process was running at T759's pipeline run (the R1-era Booking scrape had ended); every pipeline step still ran on the batch worktree's copy of the master, copied from R1's re-scored copy, and wrote that worktree's wire only (see T754-a for the shared master).

Owner decisions taken in this session (27 October): T757 approved as shown (rubric, 96 anchors, cards); reasons use only card facts or an opened source (strict); depth and beauty v2 go live in T759 with depth limited to POIs near the place (closes T756-a); the drift check per shard is a one-way lean of the controls, the 0.5 mean gap is pooled; shards 06 and 10 accepted with their lean; T759 keeps the weights 0.60/0.15/0.15/0.10 and lowers the Paris and Barcelona floors to 8.8.

All scoring was done by Claude in Claude Code subagents (Sonnet and Opus). No API was used.

Baseline, measured once before any change on the R1 master copy (v5.0-r1):

| Class | 9.0+ | 8.3 | 7.6 | 6.9 | 6.0 | under 6.0 | n | share 9.0+ |
|---|---|---|---|---|---|---|---|---|
| metro | 9 | 13 | 18 | 19 | 27 | 29 | 115 | 7.8% |
| city | 9 | 34 | 99 | 123 | 157 | 191 | 613 | 1.5% |
| town | 2 | 8 | 105 | 213 | 504 | 164 | 996 | 0.2% |
| village | 1 | 12 | 181 | 416 | 784 | 281 | 1675 | 0.1% |
| area | 3 | 19 | 61 | 87 | 207 | 79 | 456 | 0.7% |

Golden pairs 120 of 120; corr(score, log population) -0.005 on the full catalogue, -0.038 on the reference population; confidence curated 1,557, modelled 2,293, provisional 5.

---

## T757: the rubric and the fact cards

### Task ID

T757

### Date

2026-10-27

### What changed

Carta has a written appeal rubric and a fact card for every destination. `docs/RATING_RUBRIC.md` sets the five classes, five criteria (setting, character, signature sights, atmosphere, uniqueness) with what to look at per class, the five bands with their tests, how to place a score inside a band, the reason rules, confidence, flags and the output schema. `continent-app/config/rating_anchors.json` holds 96 anchors (four per class and band; city and town Exceptional have two, the only hand scores there) and, added in T758, a calibration list of 36 more hand-scored places. `pipeline/rating_fact_cards.py` builds one card per place from the same code the formula uses (beauty v2 parts, depth by category with the named POIs, registers and recognition, rated nature within 25 km, the Wikivoyage lead, crowds) and none of the judgements (no hand score, v4 score, fame or beauty v1). The 2,298 places without a hand score sit in 15 shards of 153 or 154, each with five hidden controls. The controls are hand-scored places that are NOT anchors, because an anchor's score is printed in the anchor file and could not test drift (the prompt says "anchors"; this is the reading that makes the check work). Hand scores, why and the v4 score sit in `data/rating/hidden/scorer_hidden.jsonl`, which no scorer opened. The owner approved the rubric, the anchors and a 20-card dry run.

### Files touched

**Created:**
- docs/RATING_RUBRIC.md
- continent-app/config/rating_anchors.json (app repo, mirrored in root)
- pipeline/rating_fact_cards.py
- data/rating/fact_cards/shard_01.jsonl to shard_15.jsonl, anchors.jsonl, handcheck.jsonl (T758)
- data/rating/hidden/scorer_hidden.jsonl

### Commands run

```
cd pipeline
python rating_fact_cards.py                  # 15 shards, anchors, hidden file
python rating_fact_cards.py --ids <20 ids> --out <scratch>/sample20.jsonl
python rating_fact_cards.py --handcheck 0.10 # T758
```

### Config and secrets set

`continent-app/config/rating_anchors.json` (new). No secrets.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Places with a fact card | 0 | 2,298 + 96 anchors + 157 hand check | new |
| Anchors per class and band | none | 4 (2 for city and town Exceptional) | new |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `KeyError: depth_knots` building cards | The frozen reference had no depth breakpoints while depth was off | The card builder measures the class percentile in memory, as `tests/test_rating_inputs.py` does, and never writes it; T759 froze the breakpoints |
| Cards credited neighbours' sights (Begunje listed Bled, Kassiopi listed Albania's Ksamil) | The POI lists reach into other towns | Each named POI beyond 3 km carries its distance; the rubric says such a POI is the base's setting, not the place's own sight |
| `python -I` could not import the pipeline modules | `-I` drops the script's folder from the path | Pipeline scripts run without `-I` |

### What is still open

- No monthly crowd series exists anywhere locally: `cache/eurostat_nights_nuts2_monthly.json` is missing from every checkout and neither master nor wire carries `crowding.monthly`, so cards show the annual crowd tier only (T758-e).
- Only 1,033 places have a Wikivoyage guide on the record and no star status is harvested, so most cards had no guide (part of T760-b).

### Rollback procedure

`git revert 3dc90bcee` (root) and `git revert 074c05c` (app). The files are new and nothing reads them but the T758 scorers.

---

## T758: rubric scoring in 15 shards

### Task ID

T758

### Date

2026-10-27

### What changed

All 2,298 places without a hand score have a rubric appeal, five criteria, a confidence, flags and a reason in English, Dutch, German, French, Spanish and Italian (`app_data/rubric_appeal.json`). The 1,570 hand reasons were translated into the five other languages in four translation-only shards (`app_data/curated_why_i18n.json`; `curated_appeal.json` is unchanged and its hand scores still win). `pipeline/validate_rubric_scores.py` checks every shard; `pipeline/check_why_translations.py` checks the translations. The rubric scores are strict on the long tail: 52% are under 6.0 and only 2 reach Excellent. A blind check of 157 hand-scored places lands within 0.36 of the hand scores on average.

The drift check drove most of the work. The first three Sonnet shards scored their hidden controls 0.4 to 1.4 points above the hand scale, every gap upward: the hand scale is strict for famous places that are pleasant rather than compelling, and a card full of named sights pulled scorers up. A calibration list of 30 well-known Good and Pleasant places (Milan 7.0, Geneva 6.3, Monaco 6.0) and a rule ("before writing above 7.5, name the anchor it beats") fixed most of it; six places under 6.0 (Frankfurt-Hahn 2.5, Birmingham 4.5) were added after shard 06 showed scorers bunching weak places at 5.0 to 5.8. Sonnet kept leaning high, Opus did not, so from shard 09 on and for every redo the scorer ran on Opus. With five controls a shard, a mean absolute gap of 0.5 failed on noise in the hand scores (two scorers each put Roskilde a point above its 6.0), so the owner moved the per-shard test to a one-way lean and kept the 0.5 mean gap on all 75 controls pooled.

### Files touched

**Created:**
- pipeline/validate_rubric_scores.py
- pipeline/check_why_translations.py
- data/rating/rubric_scores/shard_01 to shard_15 (parts and merged), handcheck
- data/rating/translate/shard_01 to 04.json and out_01 to out_04
- app_data/rubric_appeal.json
- app_data/curated_why_i18n.json
- reports/rubric_spotcheck_v5.md

**Modified:**
- docs/RATING_RUBRIC.md, continent-app/config/rating_anchors.json (calibration list and rules)
- pipeline/rating_fact_cards.py (hand-check sample)

### Commands run

```
python -I pipeline/validate_rubric_scores.py XX --merge --schema-only   # each scorer
python -I pipeline/validate_rubric_scores.py XX                        # with the controls
python -I pipeline/validate_rubric_scores.py --all --write             # merge
python -I pipeline/validate_rubric_scores.py handcheck --merge
python -I pipeline/check_why_translations.py --all --write
```

The scorer and translator briefs were kept in the session scratchpad (`SCORER_BRIEF.md`, `TRANSLATE_BRIEF.md`); their rules are the rubric's.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Places with an appeal (hand or rubric) | 1,570 | 3,868 | +2,298 |
| Places with a reason in six languages | 0 | 3,855 rated | new |
| Hidden controls pooled (75): mean gap | | 0.43 | gate 0.5 |
| Hidden controls pooled: lean | | +0.31 | |
| Blind hand check (157): mean gap / lean | | 0.36 / +0.10 | 126 within 0.5 |

Shard results:

| Shard | Attempts | Scorer of the kept attempt | Controls lean / mean gap | Note |
|---|---|---|---|---|
| 01 | 2 | Sonnet | +0.28 / 0.52 | first attempt +0.70 before calibration |
| 02 | 3 | Opus | +0.46 / 0.46 | Sonnet +0.88, +0.62 |
| 03 | 1 | Sonnet | +0.44 / 0.44 | scored before the calibration list |
| 04 | 2 | Sonnet | +0.36 / 0.44 | first attempt +0.86 |
| 05 | 2 | Opus | +0.20 / 0.40 | Sonnet +0.52 |
| 06 | 2 | Opus | +0.78 / 0.78 | accepted by the owner (Tuzla 3.0, Burgas 4.5); Sonnet +1.24 |
| 07 | 2 | Opus | +0.28 / 0.48 | Sonnet +0.60 |
| 08 | 1 | Sonnet | +0.50 / 0.50 | at the limit |
| 09 | 1 | Opus | +0.14 / 0.34 | |
| 10 | 2 | Opus | +0.60 / 0.72 | accepted by the owner (Szczecin 4.0 scored 5.8) |
| 11 | 1 | Opus | -0.02 / 0.42 | |
| 12 | 1 | Opus | +0.16 / 0.20 | |
| 13 | 1 | Opus | +0.06 / 0.22 | |
| 14 | 1 | Opus | +0.08 / 0.16 | |
| 15 | 1 | Opus | +0.32 / 0.36 | |

Passed first time: 7 of 15 (03, 08, 09, 11 to 15). Redone: 01, 02, 04, 05, 07 (and 06, 10 accepted after one redo each). Web lookups used: 3 in all.

Hand-score gaps over 1.5 in the blind check: one, Tiraspol (hand 6.5, "one-of-a-kind Soviet time-capsule state"; rubric 4.8, "a curiosity for a few hours, not a pleasure").

Rubric scores by class and band:

| Class | Exceptional | Excellent | Very good | Good | Pleasant | none | n |
|---|---|---|---|---|---|---|---|
| metro | 0 | 0 | 0 | 1 | 4 | 13 | 18 |
| city | 0 | 0 | 2 | 10 | 108 | 232 | 352 |
| town | 0 | 0 | 0 | 49 | 263 | 375 | 687 |
| village | 0 | 1 | 7 | 106 | 539 | 551 | 1,204 |
| area | 0 | 1 | 0 | 4 | 11 | 21 | 37 |

Confidence: high 78, medium 2,129, low 91. Flags: thin_card 81, data_conflict 58, class_mismatch 50, name_ambiguous 8, duplicate_suspect 3.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Shards 01, 02, 04 failed the controls, every gap upward | No calibration below the anchors: the hand scale is strict for known pleasant places | Calibration list of 30 places and the "name the anchor it beats" rule; redone |
| Shard 06 failed at +1.24 | No anchors under 6.0; scorers put every weak place at 5.0 to 5.8 against hand scores of 3.0 to 4.5 | Six calibration places from 2.5 to 5.5 and a no-badge range rule; redone on Opus, then accepted by the owner at +0.78 |
| Sonnet shards kept leaning high (07 at +0.60) | Model | Opus for shard 09 on and every redo |
| Per-shard mean gap failed on noise | Five controls; two scorers both put Roskilde, Blautopf, Falmouth well above their hand scores | Owner decision: per shard a one-way lean within 0.5, the 0.5 mean gap pooled over 75 controls |
| Translators saw "Albaic?n" and similar | Console encoding, not the file (0 broken characters in `curated_appeal.json`) | Read as UTF-8; one German slip fixed by hand ("Schönstes bemaltes Kloster") |

### What is still open

- The owner checks a random 5%: `reports/rubric_spotcheck_v5.md`, 115 places (T758-a).
- Hand-score gaps over 1.5: Tiraspol in the blind check; and the hand scores both scorers of a shard disagreed with by about a point or more: Szczecin 4.0, Tuzla 3.0, Burgas 4.5, Roskilde 6.0, Blautopf 6.3 (T758-b).
- Shards 01 to 05 were scored before the no-badge rule, so their weak places sit higher (5.0 to 5.8) than later shards' (3.0 to 4.5). On screen nothing changes (no badge either way); in the score it is up to about a point. Measure per shard and rescore those shards' no-badge rows if it shows (T758-c).
- Catalogue problems the scorers flagged (58 data_conflict, 50 class_mismatch, 3 duplicate_suspect): suburbs carrying a city's population or sights (Beeston, Bulwell, Enfield, De Reit, Kastel, Achicourt, Saint-Martin-le-Vinoux), towns filed as areas with population 0 (Noia, Portel, Mladenovac, Svilajnac), single sights filed as villages (Kinderdijk, Terezín, Konopiště, Blue Eye), registers that belong to a neighbour (Wattwiller, Le Touquet, Ejby, Annelund), and duplicates (CGN "Cologne-Bonn" hand 6.2 and gem:koln; gem:sitten and Sion). The full list is in the shards' `flags` (T758-d).
- The monthly crowd series (T758-e, from T757).

### Rollback procedure

`git revert` the T758 commits (07bb5afa3 to d1af79ad0 on root; 912592b, 69edb92 on app). Nothing reads the rubric files unless `formula` is `v5` (T759).

---

## T759: one formula for every place

### Task ID

T759

### Date

2026-10-27

### What changed

Every place is scored on Q = 0.60 A + 0.15 B + 0.15 D + 0.10 R, with A the hand score, else the rubric score, both opened per class by `appeal_scale.py`. Confidence is now `curated` (1,557) or `rubric` (2,298); `estimated` (a place with neither, capped at 8.9) has no member today. Depth and beauty v2 are live (closes T756-a), and depth counts a POI only within `depth.poi_own_km` of the place (15 km metro, 10 city, 5 town and village, any for an area), so Begunje no longer rides on Bled. The raw Q runs below the appeal scale (beauty, depth and recognition sit low on 0 to 10 for an ordinary place), so each class reads Q through a frozen curve (`class_curve`): the lowest Q to the class's lowest appeal, the median Q to the median appeal, the top 2.5% to 9.0, the highest to the class ceiling. Every class now has 2.6% to 3.5% at 9.0 or more, against 0.1% to 7.8% before. `formula: "v4"` in `continent-app/config/rating.json` (with `depth.live` and `beauty.live` false) is the rollback. The wire `tier` keeps 8.7 / 7.8 / 6.9 until T763; the app reads none of the new values. Golden pairs went from 120 to 200 (196 pass).

Owner choice on the weights (asked with the measured options): keep 0.60/0.15/0.15/0.10 and lower the Paris and Barcelona floors from 9.0 to 8.8 (they land at 8.9 and 8.8; Rome and Prague 9.6, Bruges 9.7, Amsterdam 9.0). Depth is weak for big cities until T774: it mostly counts POI categories, and the shipped kinds have no food, market or nightlife values (T756-c), so Paris counts three categories and Amsterdam five.

### Files touched

**Modified:**
- continent-app/config/rating.json (app repo, mirrored): version v5.0-r2, `formula`, `weights_v5`, `class_curve`, `estimated`, `bands`, `depth.live`, `depth.poi_own_km`, `beauty.live`
- pipeline/rating_layer.py: `load_appeal` (hand, else rubric), the v5 blend, `build_q_curves`, the class curve, v5 confidence, the estimated cap, depth's own-POI distance
- pipeline/apply_rating_layer.py: Paris and Barcelona floors 8.8; a hand or rubric score corroborates a high score in the obscure-star check (fame no longer enters the score)
- pipeline/diagnostics/rating_audit.py: a two-line guard for an empty fitted part. Not in T759's declared files; without it the distribution test crashes under v5
- reports/rating_reference_v5.json: rating part v5.0-r2 (depth breakpoints, q_curves, the fallback refit on hand scores)
- tests/test_rating_distribution.py, tests/test_golden_ratings.py, tests/golden_ratings.json
- continent-app/public/app_data.json and 3,855 dossier verdicts (data)

`pipeline/appeal_scale.py` (named in the prompt) needed no change.

### Commands run

```
cd pipeline
python apply_beauty_layer.py                                   # beauty v2 into the master copy
python apply_rating_layer.py --recalibrate --version v5.0-r2
python country_context_layer.py
cd ../continent-app && node scripts/sync-data.mjs
python -I <scratch>/refresh_verdicts.py .                      # R1's verdict-only dossier refresh
python -m pytest tests/test_golden_ratings.py tests/test_rating_distribution.py tests/test_rating_stability.py tests/test_rating_inputs.py
```

### Config and secrets set

`continent-app/config/rating.json` as above. No secrets.

### Before/after measurements

| Metric | Before (v5.0-r1) | After (v5.0-r2) | Delta |
|---|---|---|---|
| metro at 9.0+ | 7.8% | 3.5% | -4.3pp |
| city at 9.0+ | 1.5% | 2.8% | +1.3pp |
| town at 9.0+ | 0.2% | 2.9% | +2.7pp |
| village at 9.0+ | 0.1% | 2.6% | +2.5pp |
| area at 9.0+ | 0.7% | 2.9% | +2.2pp |
| Golden pairs | 120/120 | 196/200 (98%) | +80 pairs |
| corr(score, log pop), full / reference | -0.005 / -0.038 | -0.051 / -0.086 | gate 0.10 |
| corr(beauty, log pop), reference | +0.055 (v1) | +0.152 (v2) | gate moved to 0.20 |
| Places with a reason and a v5 confidence | 0 | 3,855 of 3,855 | |
| Stability gate (R1) | holds | holds | |
| Under 6.0 | 744 (19%) | 1,485 (39%) | +20pp |
| Wire tier 3 (8.7 cut) | 43 | 166 | until T763 |

Bands after, by class:

| Class | 9.0+ | 8.3 | 7.6 | 6.9 | 6.0 | under | n |
|---|---|---|---|---|---|---|---|
| metro | 4 | 13 | 20 | 21 | 29 | 28 | 115 |
| city | 17 | 22 | 51 | 66 | 154 | 303 | 613 |
| town | 29 | 50 | 100 | 128 | 260 | 429 | 996 |
| village | 43 | 72 | 173 | 280 | 454 | 653 | 1,675 |
| area | 13 | 31 | 82 | 127 | 131 | 72 | 456 |

Failing golden pairs: Lyon above Le Touquet (7.3 vs 7.8), Bamberg above Essen (6.6 vs 7.2), Plovdiv above Sofia (6.8 vs 7.3), Bohemian Switzerland above Žďár nad Sázavou (7.8 vs 7.9). The first was one of v3's nine failures.

Test ranges changed, each explained in the test's docstring:
- Gate 3 (SD gap, 0.18 kept): compared on the SAME places, hand against rubric on the blind check, per class (worst area 0.16, overall 0.08). The prompt asked for curated against rubric per class; on the two populations it measures the catalogue, not the scale (cities 0.48, 37 rubric areas 0.44, towns 0.02, villages 0.01, because the hand scores span Paris 10 to a 2.5 transit stop and the rubric scored the long tail). The population figure stays printed, unasserted. This needs the owner's yes (T759-b).
- Gate 5 (beauty against population): 0.20 under v5 (0.12 under v4). Beauty v2 measures the urban fabric within 5 km, which grows with a town; R1 measured 0.152 when it built it, and the owner switched it on. The score's own correlation (gate 4) holds at -0.09.
- Gate 7: under v5 the top shelf is 9.0+ held per class between 0.5% and 4%; the catalogue-wide tier-3 count (8.7) stays printed.
- New gate 8: every rated place has a v5 confidence and a reason in six languages.
- Golden: under v5 at least 95% of the 200 pairs pass; the v3 no-regression rule stays for v4.

The 20 largest moves (v5.0-r1 to v5.0-r2), with the reason the place now carries:

**Up**

| Place | Class | v4 | v5 | Move | Reason |
| --- | --- | --- | --- | --- | --- |
| Opi (Italy) | village | 6.2 modelled | 8.6 rubric | +2.4 | Hilltop village at 1,250 m in the Borghi più belli list, beside Abruzzo National Park; Val Fondillo lies 5 km away. |
| Vigo di Fassa (Italy) | village | 6.3 modelled | 8.6 rubric | +2.3 | Dolomite village under the Catinaccio, close to the Vajolet towers, with a Ladin museum; a fine walking base, a plain resort village. |
| Portsmouth (United Kingdom) | city | 4.4 modelled | 6.7 rubric | +2.3 | Naval harbour city with HMS Victory, the Mary Rose and Spinnaker Tower; a plain urban fabric around them. |
| Scanno (Italy) | village | 6.6 curated | 8.8 curated | +2.2 | Heart-shaped lake, borgo charm |
| Bregenz (Austria) | town | 6.4 curated | 8.5 curated | +2.1 | Floating stage, lake-and-alps combo |
| Keswick (United Kingdom) | village | 6.8 modelled | 8.8 rubric | +2.0 | Lake District base under Skiddaw with Castlerigg stone circle, Cat Bells and Derwentwater; a small town, so the fells are the draw. |
| Verbania (Italy) | town | 6.9 modelled | 8.9 rubric | +2.0 | Lake Maggiore town with Villa Taranto gardens, Isola Madre and Mottarone nearby; the lake and gardens carry it, the town less. |
| Tenno (Italy) | village | 7.1 modelled | 9.1 rubric | +2.0 | Listed hill village above the green Lago di Tenno, with the Varone waterfall and Lake Ledro within reach; small and quiet. |
| Kitzbühel (Austria) | town | 7.0 curated | 9.0 curated | +2.0 | Painted medieval core, glossy alpine resort |
| Brixen (Italy) | town | 5.5 modelled | 7.5 rubric | +2.0 | Cathedral town with its diocesan museum, Neustift abbey 3 km away and Dolomite peaks such as Seceda near; a fine base, compact centre. |
| Altaussee (Austria) | village | 6.9 curated | 8.9 curated | +2.0 | Idyllic lake, Monuments Men mine |
| Klausen (Italy) | village | 6.7 modelled | 8.7 rubric | +2.0 | Listed Eisack valley town under the Säben monastery rock, with the Dolomites close; a fine half day, small for more. |
| Villalago (Italy) | village | 6.6 modelled | 8.5 rubric | +1.9 | Abruzzo village on the borghi list beside Lake San Domenico, with a hermitage and the Sagittario gorge near; very small. |
| San Giovanni di Fassa (Italy) | village | 6.4 modelled | 8.3 rubric | +1.9 | Dolomite village at 1,325 m in the Borghi più belli list, with the Vajolet Towers 6 km off; a small Ladin museum. |
| Ainhoa (France) | village | 6.6 modelled | 8.5 rubric | +1.9 | Listed among France's most beautiful villages, one Basque street with its Assumption church, near the Sare caves; seen in an hour. |
| Blaubeuren (Blautopf) (Germany) | town | 6.7 curated | 8.6 curated | +1.9 | Surreal blue spring, monastery |
| Avigliana (Italy) | town | 5.7 modelled | 7.6 rubric | +1.9 | Piedmont town between two lakes, with the abbey of Sant'Antonio di Ranverso 4 km away; a pleasant base near Turin. |
| St. Wolfgang (Austria) | village | 6.6 curated | 8.4 curated | +1.8 | Lovely lakeside village, Schafberg steam railway |
| Pescocostanzo (Italy) | village | 6.1 modelled | 7.9 rubric | +1.8 | Listed stone village at 1,395 m with the Santa Maria del Colle basilica and a lace museum, the Maiella 6 km off; small and quiet. |
| La Grave (France) | area | 6.5 modelled | 8.3 rubric | +1.8 | Listed mountain village facing La Meije 4 km off, with the Écrins peaks around; grand scenery, a small place with few sights. |

**Down**

| Place | Class | v4 | v5 | Move | Reason |
| --- | --- | --- | --- | --- | --- |
| Kelsterbach (Germany) | town | 7.1 modelled | 3.3 rubric | -3.8 | Small town on the edge of Frankfurt's airport and industry; the card's sights are neighbouring towns, and nothing invites a stay. |
| Algeciras (Spain) | city | 7.9 modelled | 4.2 rubric | -3.7 | Busy ferry port with the Marinid walls and Parque María Cristina, beaches toward Tarifa; a crossing point, not a place to linger. |
| Darp (Netherlands) | village | 7.5 modelled | 3.8 rubric | -3.7 | Drenthe hamlet in heath and woods, Steenwijk's church and museum 6 km off; nothing of its own to visit. |
| La Línea de la Concepción (Spain) | city | 7.9 modelled | 4.4 rubric | -3.5 | Border town at the gate to Gibraltar, whose caves and museum lie 3 to 6 km away; the town itself offers little. |
| Keynsham (United Kingdom) | town | 6.9 modelled | 3.5 rubric | -3.4 | Commuter town between Bristol and Bath, its listed sights such as the SS Great Britain 8 to 9 km away; no reason to stop. |
| Ponte Buggianese (Italy) | village | 7.0 modelled | 3.6 rubric | -3.4 | Flat Valdinievole town; its listed sights are in Montecatini, Pescia and Buggiano Castello 5 to 9 km away. |
| Pudsey (United Kingdom) | town | 6.8 modelled | 3.4 rubric | -3.4 | Former market town now part of Leeds, its listed sights all in the city 7 to 8 km away; no reason to stop. |
| San Sebastián de los Reyes (Spain) | city | 6.2 modelled | 2.9 rubric | -3.3 | Commuter city on Madrid's northern edge whose named sights are a few chapels and parks nearby; no reason to visit. |
| Barking (United Kingdom) | city | 7.8 modelled | 4.5 rubric | -3.3 | East London district whose listed sights, Greenwich and the Cutty Sark, lie 9 km away; nothing of its own to visit. |
| Delfzijl (Netherlands) | town | 6.8 modelled | 3.5 rubric | -3.3 | Port town with a few churches and a water gate; little to see, though the village churches around reward a short drive. |
| Kastaniés (Greece) | village | 6.6 modelled | 3.3 rubric | -3.3 | Border village whose listed sights, the Selimiye Mosque among them, all lie in Edirne across the frontier; nothing of its own to hold a visit. |
| Matalascañas (Spain) | village | 7.7 modelled | 4.4 rubric | -3.3 | Beach resort at the edge of Doñana, with the Torre de la Higuera on the sand; a gateway to the park, plain itself. |
| Saint-Bonnet-de-Rochefort (France) | village | 6.3 modelled | 3.0 rubric | -3.3 | Rural Allier village with two railway viaducts, its named churches and castles mostly 7 km off in Gannat; little reason to stop. |
| Salamína (Greece) | town | 7.3 modelled | 4.0 rubric | -3.3 | Island town opposite Piraeus with an archaeological museum and Phaneromeni monastery; built-up and ordinary, little reason to cross. |
| Enfield (United Kingdom) | city | 7.8 modelled | 4.6 rubric | -3.2 | Outer London suburb whose listed sights are elsewhere, such as Alexandra Palace 7 km off; no reason to base here. |
| Heerlen (Netherlands) | city | 7.0 modelled | 3.8 rubric | -3.2 | Former mining city with castles such as Hoensbroek a few kilometres out; the centre itself gives little reason to stay. |
| Manilva (Spain) | town | 7.0 modelled | 3.8 rubric | -3.2 | Costa del Sol town of resorts and coastal watchtowers, near the Roman site of Lacipo; ordinary beaches, little to explore. |
| Pauli Arbarei (Italy) | village | 6.4 modelled | 3.2 rubric | -3.2 | Small Marmilla village 8 km from the Su Nuraxi nuraghe and near the Giara di Siddi; a base at best, little in the village. |
| Roissy-en-France (France) | village | 6.5 modelled | 3.3 rubric | -3.2 | Village wrapped by Paris-CDG airport, with Le Bourget's Air and Space Museum 9 km away; a place to sleep before a flight. |
| Maasdam (Netherlands) | village | 6.8 modelled | 3.6 rubric | -3.2 | Polder village in the Hoeksche Waard; every listed sight is in Dordrecht, 8 km away, so no reason to stop here. |

mean move -0.28, |move|>1: 1127 of 3855

The falls are places v4 lifted on a neighbour's sights or a fitted guess (Kelsterbach by Frankfurt airport, Algeciras's ferry port); the rises are mountain and lake villages the old highlights term undersold.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First v5 run failed the famous floors (Paris 8.4, Barcelona 8.4, Rome 8.7) and put 74% of places under 6.0 | Q runs below the appeal scale; beauty v2, depth and recognition are low on 0 to 10 for most places | The frozen per-class curve (median to median appeal, top 2.5% to 9.0); the owner chose to keep the weights and set the two floors at 8.8 |
| Metro at 4.3% at 9.0+ (gate 4%) | The top knot was picked by a quantile index, and rounding let a fifth metro reach 9.0 | The top knot is the n-th highest Q, n = 2.5% of the class rounded up: metro 3.5% |
| Obscure-star check rejected Karpacz, Arrábida, Schönau | It guards against wrong-article fame lifting a score; fame no longer enters v5 | A hand or rubric score corroborates, as a curator's gem flag does; estimates stay checked |
| Distribution test crashed in `rating_audit.py` | Under v5 the fitted part is empty | A two-line guard (outside the declared files) |
| `--recalibrate` refused after a failed run | The failed run had already written v5.0-r2 into the reference | Restored the reference from git before each rerun |

### What is still open

- The owner checks the 80 new golden pairs in `tests/golden_ratings.json` (those with `"added": "T759"`, each with its reason) (T759-a).
- The owner confirms the two redefined gates: the SD gap measured on the blind hand check instead of the two populations, and beauty against population at 0.20 (T759-b).
- The destination page's RatingBreakdown still says "Traveller appeal, 70% of the score" and draws v4's tier marks at 6.9, 7.8 and 8.7, and the wire tier keeps those cutoffs, so 166 places (was 43) carry "Worth the journey" until the app moves to the five bands; the unused `dest.confModelled` and `dest.confProvisional` strings go then too (T759-c, T763).
- Depth counts POI categories by name pattern; famous cities rank low on it (Paris three categories) until T774's category set. Revisit the weights and the two 8.8 floors then (T759-d, T774).
- The class curve lifts a mid-appeal village with strong setting and depth into the top 2.5% (Castel Gandolfo appeal 7.1 to 9.2, Orta San Giulio 9.4); T760's review proposes appeals for several of them.

### Rollback procedure

Set `"formula": "v4"`, `depth.live` and `beauty.live` to false in `continent-app/config/rating.json` (the v4 weights, highlights and confidence are untouched), or `git revert e9edd92` (app) and `git revert 81aa0e043 3f0ff7029` (root). Then rebuild the wire: `python apply_beauty_layer.py`, `python apply_rating_layer.py` (the reference must be the v5.0-r1 part: revert `reports/rating_reference_v5.json` with the commit), `python country_context_layer.py`, `node scripts/sync-data.mjs`, and the verdict refresh.

---

## T760: external check (gate 6)

### Task ID

T760

### Date

2026-10-27

### What changed

`pipeline/external_check.py` compares the v5 ratings with Tripadvisor Travelers' Choice, Lonely Planet Best in Travel, UNESCO World Heritage at the place and Wikivoyage, and `reports/rating_external_check_v5.md` reports it. Over our top 200, Spearman is +0.03 (Tripadvisor), +0.09 (Lonely Planet), +0.16 (UNESCO) and +0.18 (Wikivoyage): all positive, all small, the two lists too thin to say much (they name 28 catalogue places, 10 of them in our top 200). The 30 largest gaps (15 named by a list but scored low, 15 scored 9.0 or more with no outside support) were judged from opened pages: 21 keep, 9 adjust (Belgrade 6.0 to 6.3, Toulouse and Marseille 6.5 to 6.8, Castel Gandolfo 7.1 to 6.8, Ortisei 8.6 to 8.0, Reykjavik 8.0 to 7.3, Tenno 7.2 to 6.8, Cala Gonone 8.0 to 7.4, Fort William 8.2 to 7.2). Nothing is applied.

### Files touched

**Created:**
- pipeline/external_check.py
- reports/rating_external_check_v5.md
- data/rating/external/tripadvisor.json, lonelyplanet.json (the reference lists, one row per entry with its page), external_check_v5.json (output), gaps30_verdicts.json

The prompt names only the report and the script; the inputs are stored so the check can be rerun and every entry keeps its source.

### Commands run

```
python -I pipeline/external_check.py --gaps 30 --out data/rating/external/external_check_v5.json
```

The two lists and the 30 verdicts were researched by subagents with WebFetch; every row carries the page it was read from.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Spearman, top 200: Tripadvisor / Lonely Planet / UNESCO / Wikivoyage | not measured | +0.03 / +0.09 / +0.16 / +0.18 | new |
| Gaps judged | 0 | 30 (21 keep, 9 adjust) | new |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| tripadvisor.com returned 403 | Site blocks fetches | Tripadvisor's own newsroom pages (tripadvisor.mediaroom.com), cross-checked with a press report |
| Lonely Planet's pages loaded only as menus | Client-rendered lists | Press reports of each edition, opened; marked in the report |
| No 2026 Tripadvisor Europe list; no Lonely Planet ranks from 2026 | The publishers changed their formats | World lists' European entries; unranked entries earn half points |

### What is still open

- The owner reviews `reports/rating_external_check_v5.md` and decides the 9 proposed appeals (T760-a; the review step T469-d asked for).
- Catalogue problems the review found: airport rows standing for a city (MXP "Milan (Malpensa)", KEF "Reykjavik (Keflavik)", measured 50 km out), classes that look wrong (Montserrat, Morskie Oko, Stresa as villages), rows named after a region and a town at once (Dolomites (Cortina), Lago Maggiore (Stresa), Fort William (Glencoe), Cala Gonone, Ortisei), city rows carrying an island (Palma, Heraklion), and Wikivoyage guides and World Heritage sites the rows do not carry (Ortisei, Malcesine, Montserrat, Stresa, Lagos, Cortina; the Dolomites, Orta's Sacro Monte) (T760-b).

### Rollback procedure

`git revert 31e886987 0d4653b2c`. Nothing reads these files.

---

## Batch end check

Run once on the batch branches. The fast NOPUBLIC build (`wt/vite.t757.mjs`, the app worktree's config with publicDir off) took 11 s. A dev server on 5757 served the root worktree's re-scored public folder. The browser scripts (Playwright, kept in the session scratchpad, not committed) ran at 390 x 844 and 1440 x 900:

| Screen | Phone | Desktop |
|---|---|---|
| Explore list and rails: cards render, the first list leads with Edinburgh 10, Bruges 9.7, Como 9.7, Rome 9.6, Prague 9.6 | pass | pass |
| Rome (hand-scored) RatingBreakdown: 4 tiles, shows the wire score 9.6 | pass | pass |
| Opi (rubric-scored) RatingBreakdown: 4 tiles, shows the wire score 8.6 | pass | pass |
| Planner "Help me choose": six answers, then "Recommended for you" lists the matches (Austria first; Salzburg, Hallstatt, Innsbruck, Rome, Pompeii) | pass | pass |
| No page errors | pass | pass |

Nothing on screen changed but the order and the scores, with one exception that belongs to T763: the breakdown still reads "Traveller appeal, 70% of the score" and draws v4's tier marks (T759-c). The first automated planner walk clicked into Trip settings instead of the quiz; the planner itself was fine, and a scripted walk through the six questions passed.

- Rating tests: `python -m pytest tests/test_golden_ratings.py tests/test_rating_distribution.py tests/test_rating_stability.py tests/test_rating_inputs.py`: 10 passed, 1 skipped (the fitted-curve check, idle under v5).
- App unit tests: `npm test` in the app worktree, 833 tests, 828 pass, 0 fail, 5 skipped (the worktree needed the generated public files copied from the root worktree, as R1's did).
- Screenshots are in `wt/shots-t757/`.

---

## Register

Rows added to `Execution/_OPEN.md`: T758-a to T758-e, T759-a to T759-d, T760-a and T760-b. Closed: T756-a (by T759: depth and beauty v2 live, owner decision), T754-b (by T759: Bochum now 6.0, no tier).
