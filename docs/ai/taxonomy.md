# Carta travel taxonomy

ROADMAP F1, part 1 (T1149). The taxonomy, its mapping from today's tags, the hand-label set and the eval. Tagging the catalogue is part 2 (S66, T1150) on the build box.

| What | Where |
|---|---|
| The taxonomy (version 1.1.0, 268 nodes) | `pipeline/taxonomy/carta_taxonomy.yaml` |
| Mapping from every tag in use today | `pipeline/taxonomy/mapping.yaml` |
| The live list of today's vocabularies | `pipeline/taxonomy/tag_sources.py` |
| Loader, checks, the today's-tags baseline | `pipeline/taxonomy/taxonomy.py` |
| The 400-item hand-label template | `continent-app/scripts/eval/taxonomy/gold.csv`, built by `pipeline/taxonomy/build_label_template.py` |
| The 15-item seed gold set | `continent-app/scripts/eval/taxonomy/seed-gold.csv` |
| The eval (P@5, F1) | `continent-app/scripts/eval/adapters/taxonomy.mjs`, metrics in `continent-app/scripts/eval/taxonomy/metrics.mjs` |
| How to label | [taxonomy-labelling-guide.md](taxonomy-labelling-guide.md) |
| Tests | `tests/test_taxonomy.py` (the mapping test), `continent-app/tests/taxonomyEval.test.mjs` |
| The batch tagger (part 2, T1150): phrase, mapped-tag and BM25 lists fused, evidence quoted, optional Gemini verifier | `pipeline/taxonomy/tagger.py`, pipeline task `taxonomy_tags` (`python run_pipeline.py taxonomy_tags`), output `cache/taxonomy/tags.json`; tests `tests/test_taxonomy_tagger.py`; rules in HANDBOOK "Travel taxonomy and tagging" |
| The same tagger over HTTP | `services/intelligence/` (`POST /tag`, HANDBOOK "Carta Intelligence API") |

## Why `pipeline/taxonomy/`

The ROADMAP F1 text names `pipeline/taxonomy/carta_taxonomy.yaml`, and the first reader is the pipeline: S66's tagger runs as a pipeline batch job, and the mapping test reads pipeline constants (`VIBES`, `LIKES`, `THEME_ORDER`). `data/` holds generated reports and curation inputs, not code-adjacent vocabularies. The eval keeps its gold set next to the other eval sets in `continent-app/scripts/eval/`, as plan-day does.

## Shape

Five facets, and three levels below each facet root. The facets keep separate questions apart, the way schema.org keeps `touristType` (who it is for) apart from the place type:

| Facet | Prefix | Question | Nodes (with the root) |
|---|---|---|---|
| activity | `act.` | What does a traveller do there? | 86 |
| setting | `set.` | What landscape, water, built fabric and heritage is it in? | 107 |
| vibe | `vibe.` | How does it feel? | 22 |
| traveller | `trav.` | Who does it suit, in what style? | 13 |
| practical | `prac.` | Access, season, cost, difficulty, facilities | 40 |

Levels: 0 is the facet root, 1 a group (`act.water`), 2 a tag (`act.surfing`), 3 a narrower tag (`act.kitesurfing`). Counts: 5 roots, 33 groups, 183 tags, 47 narrower tags. ROADMAP F1 asked for about 300; 268 cover every tag in use today plus the gaps the research found (wellness, shopping, wildlife, touring). Grow it in minor versions, from labels the owner could not place (the `note` column of the template).

Node fields, after ESCO and SKOS: a stable `id` (never renamed or reused; a retired node gets `deprecated: true`), `label` in the six app languages (ESCO preferred label), `synonyms` (alternative labels), `definition` (one sentence), `not_to_be_confused_with` (the scope note: the sibling a labeller mixes it up with), `parent` and `children` (broader and narrower), `applies_to` (place, trail, beach, lake, mountain) and `source`:

- `text`: inferred from passages by the tagger (205 nodes).
- `data`: set by rule from a data field, never by a model (33: trail grade and shape, Blue Flag, bathing water, wheelchair, lift up, cost).
- `both`: a data rule where the field exists, the text elsewhere (30: national park, cove, quiet, iconic).

Labels: all 268 nodes carry all six languages since version 1.1.0. 103 are taken from the app's own strings (`continent-app/src/i18n/*.js`) or the guided search vibes (`public/search/guided.json`), so a tag reads the way the app already says it. The other 165 were English only until T1215 translated them (short travel app labels, sentence case, app strings reused where one exists, such as the trail shapes); their `label_source` says they are not yet checked by a native speaker. The owner checks the Dutch; a native check of de, fr, es and it is advisable before they face travellers. `label_source` on each node says where its labels come from.

Synonyms: `synonyms` is a map from language to a list (`en` always, `de`, `fr`, `es`, `it`, `nl` optional). Since 1.1.0, 168 nodes carry local words in all five other languages (de 270, fr 251, es 244, it 244, nl 245 synonyms; en 458), chosen where the concept has common local words (Altstadt, centro storico, Klamm, calanque, hunebed). `taxonomy.py check` validates the map: known languages only, lists of non-empty strings, no repeats. The tagger (`tagger.py`) and `taxonomy.lexical_index()` read only the `en` list, so the local words do not change English matching; they are there for the `/taxonomy` endpoint of the intelligence service, the app and a future multilingual tagger.

## What the mapping covers

`tag_sources.py` reads 32 vocabularies live (540 distinct values) and `tests/test_taxonomy.py` fails when one value has no row in `mapping.yaml`:

- places: the 86 categories, 74 free tags, 5 place classes, 8 designation kinds, 41 activity kinds, 39 dossier highlight kinds
- the 20 guided search vibes, 12 taste likes, 9 Explore trip kinds, 9 trip themes, 19 help-me-choose trip types, 15 journey types, 10 personas, 8 POI categories
- trails: category, grade, route type, highlights, suitability, the 27 reason codes
- beaches (tags, best for, size, surface), lakes (tags, best for, kind), mountains (tags, best for, kind, access), cycling bike types

520 values map to one or more nodes. 20 are declared "not a concept" with a reason: 14 region names among the categories (geography is the region filter), the place class `area`, the persona `mix`, the place tag `longest`, and three trail and lake warnings (`roadWalk`, `waymarked`, `privateShore`) that stay facts on the record.

Not in the test, on purpose: the 1,057 free-text journey tags (editorial keywords, one or two uses each; 124 of them, 23 percent of uses, match a node label or synonym word for word, `taxonomy.free_tag_coverage()`; S66 tags the journeys from their text instead, T1149-d), the trail detail files' highlight kinds (the same concepts as the trail highlights), hazards, services and numeric bands.

The mapping is a translation table, not a tagging. An old tag is weak evidence: `gem:hallstatt` carries `fairytale`, which maps to `vibe.fairytale`, but whether Hallstatt is fairytale is the tagger's and the labeller's call.

## The eval

`node continent-app/scripts/eval/run.mjs taxonomy [--predictions <file>] [--write --dashboard]`, the fifth eval in the T1148 runner, kind `classification`.

- Gold: `gold.csv` once the owner has labelled rows; until then the 15-item `seed-gold.csv`, labelled by this session to prove the eval runs. Seed numbers say nothing about quality.
- Predictions: a file from the tagger, `{ name, threshold, cost_eur_per_1000, items: { item_id: [{ tag, score }] } }`, best first; by default the today's-tags baseline (every old tag mapped, ranked by how many old tags agree). The baseline is the number S66 has to beat.
- Scope: nodes with `source: data` are left out of gold and predictions; a rule sets them.
- Ranking metrics on the ranked list: P@5, R-precision at 5 (hits in the top 5 over the smaller of 5 and the gold count, the metric of TechWolf's ESCO extraction work; the headline), recall at 10 (the bi-encoder's top 25 is the verifier's ceiling, recall at 10 says how much of the gold is near the top), MRR.
- Set metrics after the tagger's threshold: micro precision, recall and F1, macro F1 over the gold tags, F1 per facet, and a lenient micro F1 that counts one step up or down the tree as a hit.
- Calibration: expected calibration error over 10 bins.
- Gate today: taxonomy and mapping valid, every gold label a real id, at least one item scored. The scores are not gated until the owner's gold and the tagger exist (T1149-c).

Seed run with the baseline, 15 items, 89 scored gold labels: R-precision at 5 0.433, P@5 0.413, recall at 10 0.444, MRR 0.810, micro F1 0.431, macro F1 0.339, lenient micro F1 0.544, ECE 0.271. About 5 seconds.

## Research behind it

Summarised in the T1149 report (`Execution/P15/T1149-taxonomy-1.md`, Research). In short: OSM `tourism`, `historic`, `natural`, `route=hiking` with `sac_scale` give the deterministic data tags; schema.org separates audience (`touristType`) from place type; the recurring tourism board and platform themes (culture and heritage, nature, coast, mountains, food and drink, wellness, active, city life, religion, family) are the facet groups; ESCO gives the node fields; TechWolf's skill extraction papers give the metrics (R-precision at k, MRR) and the use of sibling nodes as hard negatives; SkillSpan and Skill-XL give the gold set practice (exhaustive labels per item, two annotators on an overlap, guidelines revised where agreement is low).
