# T1181: Trails external check and the trail validation gate (D24, D23)

ROADMAP items: D24 (trail quality pack, the trails external check bullet) and D23 (external validation, the trails layer's first run). Round 2 session S97 of `Execution/P15/_SESSIONS-ROUND-2.md`. Builds on T1179 (summaries), T1180 (downhill relief) and T1142 (quality rules, read only).

## Date

2026-11-06

## What changed

Carta's trails now have an outside check and a gate. `scripts/validation/trails_external.py` matches a reference list of 282 well-known European trails (`data/reports/validation/trails_reference.json`: Leading Quality Trails, national trails, national quality labels, Wikipedia lists and the E-paths, famous day walks; 15 sources with their terms) against the shipped trail wire (2026-09-13). It matches by OSM or Wikidata id, by name (including the parent a stage belongs to), or by a nearby start plus shared words. On today's data Carta publishes 149 of the 282 (coverage 52.8%), and 93 of them have a top-band row, v5 exceptional or excellent (33.0% of the list, 62.4% of the matched). Certified and national trails do worse than the Wikipedia lists: 6 of 11 LQTs and 33 of 68 national trails are published, against 84 of 122 Wikipedia-list trails. Day walks do worst, 36 of 106. The 30 largest gaps (20 coverage, 10 ranking) were reviewed one by one in `data/reports/validation/trails_gap_reviews.json`. The main coverage cause is broken OSM geometry, which fails the one-line gate: 33 misses, among them 10 of the 16 Irish National Waymarked Trails, Offa's Dyke Path and the Moselsteig (an LQT). Next come registry rows with no coordinate (St Cuthbert's Way, Cleveland Way) and famous short walks that exist in OSM only as ways (Lago di Braies, Giewont, Orla Perc). The main ranking causes are walks with no highlights on the row (Old Man of Storr, Quiraing, Fairy Pools at 4.9 to 5.4; Sentiero Azzurro at 6.6), the shape term and per-km scenery on long one-way trails (Lechweg, an LQT, at 7.5), and the downhill relief bug T1180 already fixed (Rhyd Ddu Path). One small fix was made in the trail pipeline. The reference misses no seed named were added to the famous registry's recall net as 35 names (`famous_registry.SEEDS_T1181`, net +34 seeds). The Causeway Coast Way seed moved from IE to GB, since it lies in Northern Ireland. The gate fails when coverage or the top-band share falls below the committed baseline. It is wired as the gated data eval `trails-external` in `continent-app/scripts/eval/run.mjs` and passes on today's data. A baseline seeded one trail higher fails it.

## Research

A research subagent picked the references and checked their terms (notes kept in the session scratchpad; the sources, terms and per-source reachability are copied into `trails_reference.json` under `sources`).

- Chosen: ERA Leading Quality Trails (the one pan-European audited label); Top Trails of Germany (the long-distance flagships among the DWV and DWI certified trails); SchweizMobil national routes 1 to 7; England and Wales National Trails; Scotland's Great Trails; Ireland's National Waymarked Trails; Wikipedia lists of long-distance footpaths and the E-paths E1 to E12 (text CC BY-SA 4.0, facts free to store); famous day walks, one Wikipedia article each as the claim of fame, because no registry of day walks exists. Only facts are stored (name, aliases, countries, approximate start, length, kind, label, source link). No descriptive text is copied.
- Rejected: the full DWI Premiumwege and DWV Qualitaetswege lists (several hundred short loops, out of scope for a famous-trails check); commercial rankings (AllTrails, Komoot, Outdooractive, travel blogs), whose terms forbid scraping or whose lists are editorial; Ursa Trail (LQT status not confirmed, shorter than the label's 50 km minimum); five entries with no reliable citation.
- Wikidata (CC0) is the right instrument to check starts and to get OSM relation ids (P402) for exact matching, but it was unreachable. Carta's own famous registry (`data/trails/famous_registry.json`, harvested earlier from Wikidata, pageviews, OSM fame tags and Waymarked Trails) stands in for it here: it supplies the ids and the coverage reason of a reference trail when the names agree exactly.
- **Reachability.** No reference host could be fetched from the cloud container. These were refused by the egress proxy: www.era-ewv-ferp.org, en.wikipedia.org and www.nationaltrail.co.uk (WebFetch), and query.wikidata.org, www.wikidata.org, overpass-api.de and nominatim.openstreetmap.org (curl). Only web search snippets were readable. So the label membership was cross-checked by search where possible: 10 LQTs, Swiss routes 1 and 7, the count of Scotland's Great Trails. The starts are start towns or trailheads to 2 decimals, recalled rather than fetched, and null for 75 trails. The source links were written, not opened. The list is also partial in places: 11 of about 24 LQTs, and 16 of about 40 Irish trails. Verifying and completing it is owner step T1181-a. The gate is unaffected: it compares today's matches with today's baseline on the same list.
- Matching rules were adjusted after reading the first run's 156 matches one by one, because several were wrong:
  - North Kerry Way read as the Kerry Way, and East Highland Way as the West Highland Way. Compass words now refuse a match.
  - The Moselsteig was matched by its Seitensprung side loops, the Dales Way by a link path and the Speyside Way by a spur. Side loops and links are now side trails, and a trail with only side trails counts as missing.
  - A Camino Frances Wikidata item matched pilgrim paths in Switzerland and Hungary. Id matches are now kept to the trail's countries.
  - Generic codes named many trails (GR 5 on the Tour de la Vanoise, Madeira PR numbers, AV2). They were dropped as aliases.
  - Descriptive reference titles ("Snowdon by the Pyg Track") got the walk's proper name as an alias. Each such edit is listed in the file's `curation_note`.

## Files touched

- Created: `scripts/validation/trails_external.py`, `tests/test_trails_external.py` (11 tests), `data/reports/validation/trails_reference.json`, `trails_external_baseline.json`, `trails_external.json`, `trails_external.md`, `trails_gap_reviews.json`, `continent-app/scripts/eval/adapters/trails-external.mjs`, this report.
- Modified: `pipeline/trails/famous_registry.py` (the `SEEDS_T1181` recall-net block; Causeway Coast Way moved from IE to GB), `continent-app/scripts/eval/run.mjs` (`trails-external` in `EVALS`, its kind and the header), `continent-app/tests/evalPlatform.test.mjs` (the pinned `EVALS` list), `docs/HANDBOOK.md` (new section "Trails external check" and its contents line; the Evals runner line), `ROADMAP.md` (D23 and D24 status), `Execution/_OPEN.md` (rows T1181-a to T1181-k, appended).
- Not touched: `scripts/quality/rules.yaml` (rules proposed as T1181-h), the trail layer writer `export_wire.py`, `docs/reference/evals.md` (the dashboard is regenerated by `run.mjs --write --dashboard`, which also writes the results folder; left for the next eval run, T1181-j).

## Commands run

```bash
git fetch origin p15-round2 && git checkout -b p15-s97-trails-external origin/p15-round2
pip install pytest ruff==0.14.3 -r requirements.txt          # container only
python -I scripts/validation/trails_external.py               # first run, then the match audit and fixes
python -I scripts/validation/trails_external.py --write-baseline --write --check
python -I scripts/validation/trails_external.py --baseline <scratch>/seeded_base.json --check   # baseline one trail higher: FAIL, exit 1
cd continent-app && node scripts/eval/run.mjs trails-external --check                           # pass
python -m pytest tests/test_trails_external.py tests/test_gate_attribution.py tests/test_pipeline_code_fixes.py -q
python -m pytest tests -q <quarantine deselects>
ruff check scripts/validation/trails_external.py tests/test_trails_external.py
cd continent-app && npm ci && npm test
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Outside reference trails checked against Carta | 0 (only the 30 internal famous fixtures of `smoke_test.py`) | 282 from 15 sources | +282 |
| Reference trails Carta publishes (coverage) | not measured | 149 of 282 (52.8%) | |
| Reference trails with a top-band row (v5 exceptional or excellent) | not measured | 93 of 282 (33.0%; 62.4% of the matched) | |
| Leading Quality Trails published / in top band | not measured | 6 of 11 / 3 | |
| National trails published / in top band | not measured | 33 of 68 / 22 | |
| Quality-label trails published / in top band | not measured | 13 of 18 / 10 | |
| Wikipedia-list trails published / in top band | not measured | 84 of 122 / 53 | |
| Famous day walks published / in top band | not measured | 36 of 106 / 17 | |
| Matches on the first run, before the audit fixes | | 156, of which at least 9 wrong (wrong trail, side loop only, foreign country) | |
| Misses by automatic cause | | not_in_registry 65, failed_continuity 33, no_osm_data 14, too_long 8, unresolved_seed 6, unplaced 4, way_only_not_derived 2, matched in the lab but not on the wire 1 | |
| Gaps reviewed by hand | 0 | 30 (20 coverage, 10 ranking) | +30 |
| Seeds in the famous registry recall net (`SEEDS`, all countries) | 327 | 361 (35 names in `SEEDS_T1181`, one of them the Causeway Coast Way moved from IE to GB) | +34 |
| Gate on today's data | none | pass; a baseline seeded one trail higher fails (exit 1) | |
| Gate run time | | about 12 s (Python), 13 s through `run.mjs` | |
| Python tests (quarantine deselected) | | 582 pass, 2 fail (`test_rating_inputs`, `test_rating_stability`: LFS cache absent in this container, as in T1179 and T1180), 9 skipped | +11 new |
| App tests (`npm test`) | 1,571 pass (T1179) | 1,623 tests: 1,611 pass, 0 fail, 12 skipped | |

The seed count is `sum(len(v) for v in SEEDS.values())` before and after; SEEDS_BLIND is unchanged.

The 30 largest gaps, with the reviewed cause (full text in `trails_gap_reviews.json` and `trails_external.md`):

| # | Trail | Status | Cause | Next |
|---|---|---|---|---|
| 1 | Moselsteig (DE, LQT) | missing | OSM relation fails the one-line gate; 365 km; only 5 side loops published | T1181-b |
| 2 | Offa's Dyke Path (GB) | missing | broken geometry, 285 km | T1181-b |
| 3 | St Cuthbert's Way (GB) | missing | registry row without a coordinate (unplaced) | T1181-c |
| 4 | Fife Coastal Path (GB) | missing | broken geometry | T1181-b |
| 5 | Kerry Way (IE) | missing | broken geometry; the North Kerry Way is a different trail | T1181-b |
| 6 | Rob Roy Way (GB) | missing | broken geometry | T1181-b |
| 7 | Speyside Way (GB) | missing | broken geometry; only a spur published | T1181-b |
| 8 | Glyndwr's Way (GB) | missing | broken geometry | T1181-b |
| 9 to 14 | Beara, Burren, Barrow, South Leinster, Ballyhoura, East Munster Ways (IE) | missing | broken geometry (the Irish pattern: 10 of 16 Irish trails) | T1181-b |
| 15 | Lago di Braies loop (IT) | missing | registry holds the lake; the path is ways with no route name | T1181-d |
| 16 | Giewont (PL) | missing | registry holds the summit; the colour-marked paths do not carry its name | T1181-d |
| 17 | Orla Perc (PL) | missing | named ways, never derived (known since T1094) | T1094 box run |
| 18 | Cleveland Way (GB) | missing | registry row without a coordinate | T1181-c |
| 19 | Grand Canal Way (IE) | missing | broken geometry | T1181-b |
| 20 | Pennine Bridleway (GB) | missing | a horse and bicycle route in OSM; outside the walk ingest by design | none |
| 21 | Peddars Way and Norfolk Coast Path (GB) | good 7.0 | shape 0.00 (one-way), road share | T1181-e |
| 22 to 24 | Fairy Pools, Old Man of Storr, Quiraing (GB) | below pleasant 4.9 to 5.4 | no highlights on the row, so scenery, variety and photos at the zero floor | T1181-f, T1181-g |
| 25 | Snowdon, Rhyd Ddu Path (GB) | below pleasant 5.0 | drawn downhill, relief 0.05: the T1180 case, about 6.9 after the re-rate | T1180-a |
| 26 | Lechweg (AT, DE, LQT) | good 7.5 | shape 0.01 and scenery 0.07 (per-km scenery dilutes over 120 km) | T1181-e |
| 27 | Sentiero Azzurro (IT) | pleasant 6.6 | no highlights; the Sentiero Verde Azzurro row of the same coast is 9.6 | T1181-f |
| 28 | Imbros Gorge (GR) | pleasant 6.7 | shape 0.12 (one-way gorge), prominence 0.14 | T1181-e, T1181-f |
| 29 | Thames Path (GB) | very good 7.7 | shape 0.02, relief 0.14; defensible for a flat path | T1181-e |
| 30 | Mull of Galloway Trail (GB) | good 7.4 | shape 0.02, road share | T1181-e |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| North Kerry Way counted as the Kerry Way; East Highland Way as the West Highland Way | Whole-word containment and the nearby-start test ignored compass words | `direction_conflict`: a compass word the trail's name lacks refuses the match |
| Moselsteig, Rothaarsteig, Dales Way and Speyside Way counted as published | Only their side loops, spurs or link paths are on the wire | `SIDE_RE`: those rows are side trails, and side trails alone are a miss |
| Camino Frances represented by a Basel pilgrim path | One Wikidata item is cited by Way of St James paths across Europe | Id matches are kept to the trail's countries |
| Tour de la Vanoise matched GR 5 rows; three Madeira walks matched mainland PR trails | Generic codes in the reference aliases | Aliases removed; `curation_note` in the reference file |
| Greek and Cyrillic names folded to nothing | `names.squash` keeps a to z only | The check's own `fold` keeps every script (NFKD, accents off) |
| The first test expected a final sigma | `casefold` maps final sigma to sigma | Test compares two spellings of the same name |
| `famous_registry` would not import in the container | `osmium` not installed | `pip install -r requirements.txt` (container only) |

Gotchas: 25% of walks on the wire have no highlights at all, and every such walk gets the same scenery, variety and photos percentiles (0.31, 0.35 and 0.46 on the three Skye walks). That shared floor is what holds famous landform walks down (T1181-f). The coverage report (lab state of 2026-10-02) is newer than the shipped wire (2026-09-13): the East Highland Way is published in the lab but not on the wire.

## Screens checked

None. No app screen or wire data changed: the check reads the wire, and the seed change reaches the registry only on the next `trails_registry` run.

## What is still open

- T1181-a (user): verify and complete the reference list from a machine or environment that can reach query.wikidata.org, en.wikipedia.org, www.era-ewv-ferp.org, www.nationaltrail.co.uk, www.nature.scot, www.sportireland.ie, www.schweizmobil.ch and www.wanderbares-deutschland.de. That means checking starts against Wikidata P625, adding the P402 relation ids, adding the full LQT list (about 24) and the full Irish list (about 40), and checking every source link. Then rerun the check and move the baseline with `--write-baseline` in a report.
- T1181-b (next task): 33 reference misses are broken OSM geometry (failed_continuity), led by the Moselsteig, Offa's Dyke Path and 10 Irish National Waymarked Trails. They belong to the S99 repair (T1183) and the S100 multi-stage records (T1184). Rerun this check after each.
- T1181-c (next task): famous registry trail rows without a coordinate (unplaced: St Cuthbert's Way, Cleveland Way and 2 more) should be placed from their OSM relation's geometry, so coverage asks a region for them.
- T1181-d (next task): famous day walks whose registry row is the landmark (no_osm_data 14, way_only 2: Lago di Braies, Giewont, Krimml Waterfalls, Creux du Van, Roque Nublo, Orla Perc, Ruta del Cares) need a derived or composed walk.
- T1181-e (user): decide whether the v5 shape term and per-km scenery should hold long one-way certified trails below the top band (Lechweg, an LQT, at 7.5; Peddars Way 7.0; Thames Path 7.7). ROUTES.md R5 says length is not a quality term, but shape 0.0 for point to point and scenery per km both work against long-distance trails.
- T1181-f (next task): highlights miss famous landforms and coastal villages (the Storr, the Quiraing, the Fairy Pools, the Cinque Terre villages). A quarter of walks have no highlights, and the shared zero floor sets their scenery, variety and photos. Add the kinds in `scenic.py` and re-rate.
- T1181-g (next task): a walk's reasons say "loop" while its route type is point to point or out and back (Quiraing 188351, Old Man of Storr 188352). Find the source of the loop reason.
- T1181-h (next task): propose the D2 rules for `scripts/quality/rules.yaml`: trails `external.coverage` and `external.top_share` must hold at the baseline in `data/reports/validation/trails_external_baseline.json`.
- T1181-i (user): run `python run_pipeline.py trails_registry` (and `coverage_report`) on the box so the 34 new seeds resolve, then rerun this check.
- T1181-j (next task): run the check in the release run and in CI, through `run.mjs --check`, and regenerate `docs/reference/evals.md`. Today nothing runs `run.mjs` automatically.
- T1181-k (next task): day walks are matched by name and start only, so a famous walk inside a longer published row (Durdle Door on the England Coast Path) reads as a miss. A line-near-point test for day walks would fix the false misses.

## Rollback procedure

`git revert` of this task's commits. Nothing is one-way: no wire data, schema or live system changed. The seeds take effect only when `trails_registry` next runs.
