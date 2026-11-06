# T1149: Travel taxonomy, part 1: the taxonomy, its mapping, the label set and the eval (ROADMAP F1, round 2 session S65)

## Date

2026-11-06

## What changed

Carta now has one versioned travel taxonomy, `pipeline/taxonomy/carta_taxonomy.yaml` 1.0.0: 268 nodes in five facets (activity, setting, vibe, traveller, practical) and three levels below each facet root (33 groups, 183 tags, 47 narrower tags). Each node has a stable id, labels in the six app languages where the app already has them (103 nodes; 165 are English only), a definition, synonyms, a "not to be confused with" list, parent and children, what it applies to (place, trail, beach, lake, mountain) and whether a data rule or the tagger sets it (33 data, 30 both, 205 text). `pipeline/taxonomy/mapping.yaml` translates every tag Carta uses today: 32 vocabularies read live from the code and the shipped data (540 distinct values), of which 520 map to nodes and 20 are declared not a concept with a reason (14 region names, the place class `area`, the persona `mix` and four record facts). `tests/test_taxonomy.py` fails when any live value lacks a row. The hand-label template `continent-app/scripts/eval/taxonomy/gold.csv` holds 400 items drawn deterministically: 240 places, 100 trails and 20 each of beaches, lakes and mountains, from all 43 countries, with kinds spread by a square-root target. `docs/ai/taxonomy-labelling-guide.md` tells the owner how to fill it. The taxonomy eval is the fifth eval in the T1148 runner (`run.mjs taxonomy`, kind `classification`). It reports P@5, R-precision at 5, recall at 10, MRR, micro and macro F1, F1 per facet, a lenient tree F1, calibration error and cost per 1,000 items. It runs on a 15-item seed gold set until the owner's labels exist. Today's tags, mapped, are the baseline: R-precision at 5 0.433, micro F1 0.431 on the seed set, a number that only shows the eval runs. Nothing in the catalogue was tagged and no app code or existing tag changed.

## Research

A research subagent covered OSM tagging, Wikidata classes, Schema.org, tourism board and platform categories, ESCO's structure, and how ESCO-style multi-label extraction is evaluated. wiki.openstreetmap.org, wikidata.org, schema.org and arxiv.org were unreachable from the session (ENOTFOUND), so its facts come from search summaries; the Wikidata QIDs could not be verified (T1149-g). A second subagent surveyed every tag vocabulary in Carta's code and data.

| Source | What it gave | Used for |
|---|---|---|
| OSM `tourism`, `historic`, `natural`, `route=hiking` with `network` and `sac_scale` (https://wiki.openstreetmap.org/wiki/Key:tourism, https://wiki.openstreetmap.org/wiki/Key:sac_scale) | hard facts such as SAC grade T1 to T6 and the network level | the `source: data` nodes, set by rule from the trail record and not by a model |
| Schema.org `TouristAttraction`, `TouristDestination`, `TouristTrip`, `touristType` (https://schema.org/TouristAttraction) | audience kept apart from place type | the separate traveller facet |
| Foursquare (10 top groups, about 1,300 categories), Google Places types, Tripadvisor groups, European Travel Commission themes (https://docs.foursquare.com/places/docs/categories, https://developers.google.com/maps/documentation/places/ios-sdk/place-types, https://ec.europa.eu/docsroom/documents/14543) | recurring themes: culture and heritage, nature, coast, mountains, food and drink, wellness, active, city life, religion, family, shopping | the level 1 groups, including the gaps Carta's tags lacked (wellness, shopping, wildlife, touring) |
| ESCO model (https://ec.europa.eu/esco/lod/static/model.html) | preferred, alternative and hidden labels per language, definition, scope note, broader and narrower | the node fields: `label`, `synonyms`, `definition`, `not_to_be_confused_with`, `parent`, `children` |
| Decorte et al. 2023, Extreme multi-label skill extraction training using LLMs (https://arxiv.org/abs/2307.10778); Decorte et al. 2022 (https://arxiv.org/abs/2209.05987); Efficient text encoders for labor market analysis 2025 (https://arxiv.org/abs/2505.24640) | R-precision at k and MRR as the extraction metrics; sibling nodes as the most useful hard negatives; exhaustive per-item labels (Skill-XL) so recall can be measured | R-precision at 5 as the headline next to plain P@5; "label every tag that holds" in the guide; `not_to_be_confused_with` doubles as the hard-negative list for F2 |
| SkillSpan (https://arxiv.org/abs/2204.12811) | agreement rose from about 0.6 to 0.75 over guideline rounds | the guide's 60-row double-labelled overlap and the revise-the-definitions loop |
| Passonneau 2006, MASI (https://aclanthology.org/L06-1392/); Sechidis et al. 2011, iterative stratification | set agreement measure; stratified sampling for multi-label | the agreement plan (script open, T1149-f); a simpler deterministic country and kind stratification for the template, since there are no labels yet to stratify on |

Chosen: a five-facet, three-level ESCO-style YAML, with labels taken from the app's own strings so a tag reads the way the app already says it. The folder is `pipeline/taxonomy/`, the path ROADMAP F1 names, because the pipeline tagger (S66) is the first reader. The eval uses plain Node metrics in the T1148 runner, with no new dependency: the YAML is read through the Python the runner's adapters already call, and `js-yaml` is not a declared app dependency. Not chosen: propensity-scored P@k (Jain et al. 2016), because it needs label frequencies the gold set does not have yet; a Wikidata or OSM crosswalk field, because the QIDs were not verifiable from the session.

## Files touched

- Created, `pipeline/taxonomy/`: `carta_taxonomy.yaml` (the taxonomy), `mapping.yaml` (today's tags to nodes), `sources.py` (32 live vocabularies), `taxonomy.py` (loader, checks, baseline, free-tag coverage), `build_label_template.py` (the 400-item draw and its `--check`).
- Created, `continent-app/scripts/eval/`: `adapters/taxonomy.mjs`, `taxonomy/metrics.mjs`, `taxonomy/gold.csv` (400 rows, labels empty), `taxonomy/seed-gold.csv` (15 rows).
- Created: `docs/ai/taxonomy.md`, `docs/ai/taxonomy-labelling-guide.md`, `tests/test_taxonomy.py` (11 tests), `continent-app/tests/taxonomyEval.test.mjs` (4 tests), this report.
- Modified: `continent-app/scripts/eval/run.mjs` (the fifth eval, `--predictions`), `continent-app/scripts/eval/lib/results.mjs` (kind `classification`), `continent-app/tests/evalPlatform.test.mjs` (one line: the EVALS list now has five; outside the named files, needed for the runner change), `ROADMAP.md` (F1 status), `Execution/_OPEN.md` (rows T1149-a to T1149-j appended).
- Not touched: app code, every existing tag and its data, `docs/HANDBOOK.md` (the eval section there is T1148's; a taxonomy line goes with T1149-j), `data/reports/evals/` and `docs/reference/evals.md` (no `--write`, T1149-j).

## Commands run

```
git fetch origin && git checkout -b p15-s65-taxonomy-1 origin/p15-round2
cd continent-app && npm ci
python -I pipeline/taxonomy/sources.py                       # the 32 vocabularies
# the taxonomy YAML was generated once from an authored node list plus the app i18n strings; hand-edited from 1.0.0 on
python -I pipeline/taxonomy/taxonomy.py check                # valid; 540 values, 20 not a concept
python -I pipeline/taxonomy/build_label_template.py          # gold.csv, 400 rows
python -I pipeline/taxonomy/build_label_template.py --check
python -m pytest tests/test_taxonomy.py -q
ruff check pipeline/taxonomy tests/test_taxonomy.py
cd continent-app && node scripts/eval/run.mjs taxonomy --check
node scripts/eval/run.mjs taxonomy --predictions <oracle file>   # perfect predictions score 1
node scripts/eval/run.mjs --check                            # all five evals
npx eslint --no-ignore scripts/eval/run.mjs scripts/eval/lib/*.mjs scripts/eval/adapters/taxonomy.mjs scripts/eval/taxonomy/*.mjs tests/taxonomyEval.test.mjs tests/evalPlatform.test.mjs
npm test
cd .. && python -I scripts/docs/drift.py && python -I scripts/docs/check_entry_points.py
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Vocabularies for what a place offers | 32 separate ones (86 categories, 74 free tags, 20 vibes, 12 likes, 9 Explore kinds, 9 trip themes, 19 trip types and more) | 1 taxonomy, 268 nodes, with a row for every value of the 32 | one source of truth |
| Live tag values with a mapping row | 0 of 540 | 540 of 540 (520 to nodes, 20 not a concept with a reason) | +540 |
| Nodes with labels in all six languages | n/a | 103 of 268 | 165 English only (T1149-c) |
| Journey free-text tags matching a node word for word | not measured | 124 of 1,057 distinct (23 percent of uses); reported, not gated | new |
| Hand-label template | none | 400 items, 43 countries, every place class, trail grade and water kind | new |
| Evals in the runner | 4 | 5 | +1 |
| Taxonomy eval on the seed set, today's tags as the baseline (15 items, 89 scored labels) | n/a | R-precision at 5 0.433, P@5 0.413, recall at 10 0.444, MRR 0.810, micro F1 0.431, macro F1 0.339, lenient micro F1 0.544, ECE 0.271 | baseline for S66 |
| Same eval, perfect predictions | n/a | 1.0 on every ranking and set metric | sanity check |
| Taxonomy eval run time | n/a | about 5 s | |
| `npm test` | 1,623 tests (the 1,627 minus the 4 new) | 1,627: 1,615 pass, 0 fail, 12 skipped | +4 |
| `tests/test_taxonomy.py` | none | 11 pass in about 6 s | +11 |

The seed numbers mean nothing about quality: the session labelled the seed items, and the baseline is the old tags. They show that the eval runs and give S66 a first bar.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first draw skewed the kinds: 37 of 100 trails were city walks, and metros outnumbered villages | Per-country round robin, smallest class first: the many small country quotas always took the rare class | Global kind target proportional to the square root of each kind's size, and each pick takes the kind furthest behind it: 6 city walks, 75 villages, 21 metros |
| The baseline scored 0 on the practical facet | The trail grade, route shape and similar are facts nobody labels, so every baseline prediction there was a false positive | Nodes with `source: data` are left out of gold and predictions; the guide says not to label them |
| Seed rows held a node and its parent (Hallstatt with `set.lake` and `set.lakeside-town`, and four more) | Labelled before the "most specific node only" rule was written | Ancestors dropped; a test now fails when a seed row holds a node and its ancestor |
| One node sat at level 4 | `set.black-sand` was under `set.sandy-beach` | Moved under `set.beach`; the validator rejects levels outside 0 to 3 |
| `ast.parse` warned on `pipeline/trips/trip_model.py` | Old regex strings with invalid escapes in that file | The collector silences SyntaxWarning while it reads constants; the file is not touched |

Gotcha: `sources.py` reads constants without importing their modules (Python `ast`, a bracket matcher for JS). A constant moved into another file or renamed fails the test with a KeyError naming it. That is on purpose: the mapping must follow the code.

## Screens checked

None. No traveller screen changed.

## What is still open

- T1149-a (user): review the node list and the 20 not-a-concept decisions before labelling.
- T1149-b (user): label the 400 rows; until then the eval scores the 15 seed items.
- T1149-c (next task): 165 nodes and every synonym list are English only.
- T1149-d (next task): a score gate once owner gold and the S66 tagger exist.
- T1149-e (next task, S66): tag the journeys from their text; their free-text tags are outside the mapping.
- T1149-f (next task): an agreement script for a second labeller (Krippendorff's alpha with MASI distance).
- T1149-g (next task): a verified OSM and Wikidata crosswalk per node; the hosts were unreachable.
- T1149-h (next task): the trail detail files' highlight kinds are not in the live mapping test.
- T1149-i (next task): app_data `meta.categories` and the data disagree on five values.
- T1149-j (next task): write the first taxonomy result to the dashboard, add a handbook line, and refresh the docs/ai index rows.

The Claude API was not used and is not needed: the tagger in S66 is a bi-encoder plus the Gemini verifier through the gateway, or a local model on the box.

## Rollback procedure

`git revert` of the T1149 commit. Nothing is one-way: no data, tag, migration, deploy or app code changed. Deleting `pipeline/taxonomy/` and the two eval files and reverting `run.mjs`, `results.mjs` and the one line in `evalPlatform.test.mjs` restores the four-eval runner.

## Owner steps (for the checklist)

- [T1149-a] Review the taxonomy before labelling | the labels and the S66 tagger both use this vocabulary, so changes are cheapest now | read the node tables at the end of `docs/ai/taxonomy-labelling-guide.md` and the `not_a_concept` blocks in `pipeline/taxonomy/mapping.yaml`; add, merge or rename nodes in `pipeline/taxonomy/carta_taxonomy.yaml` (keep ids stable, bump `version`), then `python -I pipeline/taxonomy/taxonomy.py check` and `python -m pytest tests/test_taxonomy.py -q` | pipeline/taxonomy/carta_taxonomy.yaml
- [T1149-b] Label the 400 items | P@5 and F1 on 400 labelled items is the F1 done condition | open `continent-app/scripts/eval/taxonomy/gold.csv` in a spreadsheet, follow `docs/ai/taxonomy-labelling-guide.md` (every true tag, most specific node, skip the data-rule nodes; about 40 hours at ten items an hour), save as UTF-8 CSV with the same columns, then `cd continent-app && node scripts/eval/run.mjs taxonomy --write --dashboard` and commit `gold.csv`, `data/reports/evals/` and `docs/reference/evals.md` | continent-app/scripts/eval/taxonomy/gold.csv
