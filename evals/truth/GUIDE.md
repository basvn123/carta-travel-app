# Truth set: how to verify the sample by hand (T1144, ROADMAP D4)

The truth set is 150 items drawn from the shipped data: 100 places, 25 trails, 13 beaches and 12 lakes. For each item a few fields are checked by hand against an outside source. The scorer (`evals/run_truth.py`, also `node continent-app/scripts/eval/run.mjs truth`) then reports, each release, the share of checked fields that the data gets right.

You fill one file: `sheet.csv`. It opens in Excel, LibreOffice or Google Sheets (import it, then export it back as CSV with the same columns). Every row is one item and one field.

## The columns

| Column | What it holds | Who fills it |
|---|---|---|
| `item_id`, `kind`, `name`, `cc`, `field` | which item and which field | the build |
| `current_value` | what Carta showed when the sample was built (a snapshot only; the scorer reads the live data) | the build |
| `verified_value` | the true answer, in the format of `fields.json` "answer" (below) | you |
| `status` | `verified`, `unverifiable`, `skip`, or leave `seeded` / `unverified` | you |
| `source_url` | where to look first; replace it with the page you used | build, then you |
| `evidence` | a short quote or what you saw ("infobox: 103,163 (2023)") | you |
| `text_sha` | for text rows only: which version of the text you judged. Do not edit | the build |
| `by`, `verified_on` | your initials and the date (2026-11-20) | you |
| `note` | anything odd | you |

## How to fill a row

1. Look the answer up first, then compare with `current_value`. Do not copy `current_value` because it looks plausible: the point is an independent answer.
2. Write the answer in `verified_value` in the field's format, set `status` to `verified`, and fill `source_url`, `evidence`, `by` and `verified_on`.
3. If you cannot find a trustworthy source in a few minutes, set `status` to `unverifiable` and say why in `note`. If the field does not apply (a blurb on an airport row, a lake with no bathing site), set `skip`.
4. Rows marked `seeded` were filled by the build from a source already cited in the data (the OSM relation's own `distance`, `ascent` and `roundtrip` tags, or the point inside the shipped country shapes). Check them like any other row: if the seed is right, set `verified`; if it is wrong, write the true value and set `verified`.

## The fields

| Kind | Field | Answer format | Right when (tolerance) | Where to look |
|---|---|---|---|---|
| place | `country` | two letters, `NL` | equal | any map |
| place | `coords` | `lat, lon`, `52.0116, 4.3571` | within 2 km of the town centre | OpenStreetMap (right click, "Show address"), Wikipedia |
| place | `population` | whole number | within 15 percent | Wikipedia infobox, national statistics |
| place | `image_depicts` | `yes` or `no` | `yes` | open the photo URL in `current_value` |
| place | `blurb` | `supported`, `unsupported` or `contradicted` | `supported` | the cited Wikivoyage page in `source_url` (rules below) |
| trail | `distance_km` | km, `16.4` | within 10 percent or 0.5 km | the OSM relation in `source_url`, the operator's page |
| trail | `ascent_m` | metres | within 15 percent or 60 m | operator's page, OSM `ascent` tag |
| trail | `loop` | `yes` or `no` | equal | the OSM relation's map |
| trail | `difficulty` | `easy`, `moderate`, `hard`, `very_hard`, `alpine` | equal | operator's grade or OSM `sac_scale`: hiking is easy, mountain_hiking moderate, demanding_mountain_hiking hard, alpine_hiking very_hard, demanding or difficult alpine hiking alpine (HANDBOOK "Trail difficulty") |
| trail | `trailhead` | `lat, lon` | within 300 m | OSM relation, operator's page |
| trail | `summary` | `supported`, `unsupported`, `contradicted` | `supported` | the OSM relation and its tags |
| beach | `coords` | `lat, lon` | within 500 m | OpenStreetMap |
| beach, lake | `name` | text | equal, accents and case ignored | OpenStreetMap, Wikipedia, the municipality |
| beach, lake | `water_quality` | `excellent`, `good`, `sufficient`, `poor`, `none` | equal | EEA bathing water viewer (latest season) |
| beach | `surface` | `sand`, `pebble`, `gravel`, `rock`, `shingle`, `concrete` | equal | photos, OSM `surface` tag |
| lake | `coords` | `lat, lon` | within 1 km | OpenStreetMap |
| lake | `swim` | `yes`, `limited`, `no`, `unknown` | equal | municipality or tourist board, Wikipedia |
| lake | `area_km2` | km2, `46.2` | within 10 percent | Wikipedia infobox |

The exact rules and tolerances are in `fields.json`; `run_truth.py` `compare()` applies them.

## Text rows: the verdict

Read the text Carta shows (`current_value`) and the source (`source_url`):

- `supported`: every fact, number or name in the text is stated or directly implied by the source.
- `unsupported`: something a traveller would rely on is not in the source, and nothing in the source conflicts with it.
- `contradicted`: the source says something that conflicts with the text.

Judge against the source only, not against what you know. When the text changes in a later release, `text_sha` no longer matches and the row drops out of the score as stale until it is judged again.

## The text check calibration (separate, 50 texts)

The LLM judge of texts is only trusted once it agrees with you. `judge/text-sample.json` holds 50 texts with their sources; some carry a planted fault. For each `t01` to `t50` write your verdict in `judge/labels.json`, with the rules above (also in the judge's rubric, `prompts/truth-judge/v1.md`). Do not open `judge/text-sample-key.json`: it says which texts were changed. Then run `cd continent-app && node scripts/eval/run.mjs truth` and read the kappa line. The judge may gate at kappa 0.61 or more and is advisory from 0.41.

## After filling

```
python -I evals/run_truth.py                 # the score, per kind and field, and the rows the data gets wrong
cd continent-app && node scripts/eval/run.mjs truth --write --dashboard
python -I evals/run_truth.py --write-baseline   # once you accept this release's score as the bar
```

Commit `evals/truth/sheet.csv`, `evals/truth/baseline.json`, `judge/labels.json`, `data/reports/evals/` and `docs/reference/evals.md`. The eval gates (fails a check run) once 80 percent of the sheet is verified; before that it is advisory.

## Rebuilding the sample

`python -I evals/truth/build_sample.py` rebuilds the sample from the shipped data with the fixed seed. It keeps every row you marked `verified`, `unverifiable` or `skip`. The draw is stable: an item stays in the sample while it stays in the data. Change `SEED` only to start a new truth set, never to move the score.
