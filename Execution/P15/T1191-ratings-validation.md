# T1191: Place ratings on the D23 validation runner

ROADMAP item D23 (Place ratings row). Round 2 session S107, batch 11.

## Date

2026-11-07

## What changed

The place ratings now have a layer on the T1187 validation runner (`python -I scripts/validation/runner.py ratings`). It repeats T760 on today's ratings (v5.0-r3, 3,855 rated places) and adds references, each kept separate: Wikipedia pageviews (attention; not an input to the score), Wikivoyage articles (a status tier once the owner runs the fetch), published lists (T760's Tripadvisor and Lonely Planet files plus any list in `data/reports/validation/ratings/sources/lists/`), UNESCO World Heritage by distance (labelled circular, because it is already part of the recognition score) and Eurostat nights (owner step). The result gives rank agreement for the whole catalogue, for each country with 30 or more places (21 countries; the other 21 pooled as "small") and for each place class. Pooled over the catalogue, Kendall tau-b with pageviews is 0.153 (Spearman 0.223, and 0.334 once population is controlled for). The AUC is 0.610 for having a Wikivoyage article and 0.773 for being named by a list. In T760's own top-200 measure, Wikivoyage moved from +0.184 to +0.220 and UNESCO from +0.159 to +0.167. The two published lists fell to slightly negative (-0.063 and -0.073), but they name only 6 and 5 places in the top 200, so these numbers say almost nothing.

The 30 largest gaps (15 where the references rank a place higher than Carta, 15 the other way) each have a verdict and a cause: 24 keep, 4 catalogue faults and 2 proposed appeal changes. The four faults are three missed World Heritage joins (Wismar, Samos, Charleroi) and a beach classed as a town. The two proposals are Dannewerk 6.8 to 6.2 and Bleggio Superiore 6.5 to 6.1, both for the owner to decide. The causes became register rows: the World Heritage join, scores well above their appeal in villages and towns, pageviews read from the wrong article, near-zero depth for Toulouse. The frozen reference `reports/rating_reference_v5.json` and every score are untouched.

## Research

A research subagent compared the candidate references and statistics. Web search worked for the UNESCO terms, Wikivoyage status and Eurostat; the rest came from its own knowledge.

| Reference | Gives | Terms | Circular? | Choice |
|---|---|---|---|---|
| Wikivoyage article status (outline, usable, guide, star) via the MediaWiki API ([status](https://en.wikivoyage.org/wiki/Wikivoyage:Article_status), [Guide cities](https://en.wikivoyage.org/wiki/Category:Guide_cities)) | a tier, good town and city coverage | CC BY-SA; a tier plus a URL is a fact | low | **used**: presence now (1,809 places from `cache/wikivoyage.json`); the tier is an owner step, because the API is unreachable from the cloud |
| Wikipedia pageviews ([Wikimedia REST](https://wikimedia.org/api/rest_v1/)) | continuous attention, near-full coverage | CC0 | none for the score (`rating_layer.py`: hidden gem only); it follows size | **used**: Spearman plus partial Spearman controlling for log population; the pooled tau is the gate metric |
| Eurostat nights in cities ([metadata](https://ec.europa.eu/eurostat/cache/metadata/en/tour_occ_esms.htm)) | demand, about 150 to 300 cities | open with attribution | none | **wired, owner step** (`sources/eurostat_nights.json`) |
| UNESCO World Heritage (`cache/unesco_whc.json`) | site points | [FAQ 126](https://whc.unesco.org/en/faq/126): no republication without permission | yes: it is in recognition | **used only as a join check** (`fact.unesco_join`) and a labelled AUC; no list is stored |
| Tripadvisor Travelers' Choice, Lonely Planet Best in Travel | 10 to 25 names a year | Tripadvisor's terms limit storing; T760 already keeps names, ranks and pages | none | **kept** as T760 stored them, with a yes/no AUC; too few for rank statistics; the licence question is register row T1191-l |
| National tourism boards' lists (GNTB Top 100, VisitBritain, Atout France, ENIT), European Best Destinations | names, often sights rather than towns | mostly all rights reserved; a name, a rank and a page is a fact | none | **wired, owner step**: one file per list in `sources/lists/`, names, ranks and pages only |
| Wikidata sitelinks | count | CC0 | yes: the score's language counts | skipped |
| Michelin Green Guide stars | expert tier | proprietary | none | skipped for bulk; usable by hand in a later gap review |

Method, as the research advised: a separate statistic for each kind of reference (AUC for yes/no references, Kendall tau-b for tiers, Spearman with a population-controlled partial for continuous ones); n of at least 30 per country, with smaller countries pooled; a breakdown by place class; gaps named by the references that flag them, a place flagged by two or more independent references treated as the likelier Carta error. No blended "outside score".

## Files touched

Created:
- `scripts/validation/layer_ratings.py` (the layer, plus the owner's `fetch-wikivoyage` command)
- `tests/test_validation_ratings.py`
- `data/reports/validation/ratings/2026-11-07.json`, `baseline.json`, `gap_verdicts.json`, `sources/README.md`
- `Execution/P15/T1191-ratings-validation.md`

Modified:
- `scripts/validation/runner.py` (one line in LAYERS: `"ratings": "layer_ratings"`)
- `Execution/_OPEN.md` (rows T1191-a to T1191-l appended)
- `ROADMAP.md` (D23 status)

`data/reports/validation/scorecard.json` and the admin snapshot were deliberately left as they were, so as not to collide with S108's layers; register row T1191-i rebuilds them after the merge.

## Commands run

```
git lfs pull --include "cache/wikivoyage.json,cache/unesco_whc.json,cache/dest_pageviews.json,app_data/curated_appeal.json,app_data/rubric_appeal.json"
python -I scripts/validation/runner.py ratings --write-baseline --write --no-snapshot
git checkout data/reports/validation/scorecard.json
python -m pytest tests/test_validation_ratings.py tests/test_validation_runner.py -q
ruff check scripts/validation/layer_ratings.py tests/test_validation_ratings.py
```

## Config and secrets set

None.

## Before/after measurements

Before is T760 (v5.0-r2, 2026-10-27, `reports/rating_external_check_v5.md`); after is this run (v5.0-r3, 2026-11-07).

| Metric | Before | After | Delta |
|---|---|---|---|
| Rated places | 3,855 | 3,855 | 0 |
| Spearman, top 200, Tripadvisor (places named) | +0.034 (6) | -0.063 (6) | -0.097 |
| Spearman, top 200, Lonely Planet (places named) | +0.094 (4) | -0.073 (5) | -0.167 |
| Spearman, top 200, UNESCO at the place (named) | +0.159 (106) | +0.167 (101) | +0.008 |
| Spearman, top 200, Wikivoyage (named) | +0.184 (128) | +0.220 (145) | +0.036 |
| Spearman, top 200, pageviews | not measured | +0.281 | new |
| Whole catalogue: tau-b with pageviews (gate metric, n 3,825) | not measured | 0.153 | new |
| Whole catalogue: Spearman with pageviews / controlling population | not measured | 0.223 / 0.334 | new |
| Whole catalogue: AUC Wikivoyage article / named by a list / UNESCO (circular) | not measured | 0.610 / 0.773 / 0.830 | new |
| Countries with their own agreement row (n 30 or more) | 0 | 21 (plus 1 pooled row) | +21 |
| List entries naming a place, matched to a rated row | 28 mapped | 29 of 35 (82.9%) | +1 |
| Listed places in their country's upper half | not measured | 28 of 29 (96.6%) | new |
| Places with a World Heritage site in reach that carry the designation | not measured | 272 of 360 (75.6%) | new |
| Gaps reviewed: keep / adjust / catalogue | 21 / 9 / 0 | 24 / 2 / 4 | |

Per country (Spearman with pageviews, the same controlling for population, AUC of a Wikivoyage article). Highest agreement: Austria 0.57 / 0.63 / 0.77, Croatia 0.54 / 0.55 / 0.75, the Netherlands 0.53 / 0.49 / 0.75, Czechia 0.48 / 0.46 / 0.78. Lowest: Romania -0.09 / 0.20 / 0.41, Hungary 0.11 / 0.34 / 0.58, Poland 0.15 / 0.32 / 0.51, Portugal 0.27 / 0.19 / 0.44, Ireland 0.43 / 0.56 / 0.40. In the last four, the places with a Wikivoyage article do not outscore the others. Every country's row is in the result file under `carta.agreement.by_country`. By class, agreement is highest for metros (0.64) and lowest for towns (0.24).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first run reported 0.40 list coverage | Countries, regions, routes and "experiences" (Finland, Bavaria, night trains) counted as missing places | Only entries on place lists, in a catalogue country, count as holes (`is_place_entry`); 6 holes remain: Sicily (twice), the Veneto, Sardinia, Tipperary, Skanor-Falsterbo |
| Varallo Sesia showed as a gap with no pageviews | 27 of the 30 places with fame 0 are simply missing from the pageviews harvest | Fame 0 is read as not measured and left out |
| The helper script lost its ctx | `runner.run` replaces an empty ctx dict (`ctx or {}`) | Pass a non-empty ctx when reading the layer's state after a run |
| `cache/*.json` were LFS pointers in the container | Fresh clone | `git lfs pull --include` on the files the layer reads; the tests use fixtures only, so CI needs no LFS for them |

## Screens checked

None: nothing a traveller sees changed. The admin Data health tab picks up the ratings row once the scorecard is rebuilt after the merge (T1191-i).

## What is still open

- T1191-a: the World Heritage join misses Wismar (site 1.2 km away), Samos (Pythagoreion, 11.8 km, on the island) and Charleroi (Bois du Cazier, 4.5 km, plus the belfry). 88 of the 360 places with a site in reach carry no tag; some are neighbours' sites (Gelsenkirchen and Zollverein), so review them at the cause in `apply_designations.py`.
- T1191-b: in villages and towns, Q runs 1.1 to 2.1 points over the appeal when depth is near 0.9 and recognition near 1 (Peja 7.0 to 9.1, Villalago 6.8 to 8.5, Opi 7.4 to 8.8, San Giovanni di Fassa 7.4 to 8.7, Dannewerk 6.8 to 8.3, Bleggio Superiore 6.5 to 7.7, Genzano 6.8 to 7.9). This is the T760 Castel Gandolfo pattern again. Re-tune the depth and recognition shares once against the frozen reference, with part of it held out (D23 step 5), never by editing scores.
- T1191-c: two proposed appeal changes need the owner (Dannewerk 6.8 to 6.2, Bleggio Superiore 6.5 to 6.1, the T760 Tenno precedent). No page could be opened from the container.
- T1191-d: pageviews read the wrong article for airport-named rows (Frankfurt-Hahn, East Midlands, Knock), for a name collision (Golem: 1,641 views a day, the creature of folklore) and for Peja (17 views a day for a city of 49,000). This is title resolution in `harvest_pageviews.py`; it also touches the hidden gem flag.
- T1191-e: POI depth near zero where it cannot be right: Toulouse 0.091 (a metro), Ikaria 0.024, Tivat 0.026.
- T1191-f: Praia da Falesia is a beach in the town class.
- T1191-g: the Wikivoyage status tier (owner step, network).
- T1191-h: the tourism board and best-of lists, and the Eurostat nights (owner step, network).
- T1191-i: rebuild the scorecard and the admin snapshot with the ratings row after the batch merge.
- T1191-j: list entries with no row (Skanor-Falsterbo, Tipperary; Sicily, Sardinia and the Veneto as regions). Whether to add rows is a product decision.
- T1191-k: the references cannot see the village associations, so the "Carta high" gaps fill with Borghi and Plus Beaux Villages places. Serial World Heritage sites are one point each (Hedeby lies 10.8 km from Dannewerk). Read the per-component points in `cache/unesco_whc_raw.xml` in the layer.
- T1191-l: licence check: the UNESCO and Tripadvisor terms limit republication. The layer stores only match flags, but T760's `tripadvisor.json` keeps names, ranks and pages.

## Owner steps (for the checklist)

- [T1191-c] Decide two proposed appeal changes | the 30-gap review found two villages scored on sights outside them, and scores are never hand-edited without you | open the rows Dannewerk and Bleggio Superiore in `data/reports/validation/ratings/gap_verdicts.json`; check the Danevirke and Rango (Borghi piu belli) pages; accept or reject 6.2 and 6.1 in `app_data/rubric_appeal.json` via the next rating task | `data/reports/validation/ratings/gap_verdicts.json`
- [T1191-g] Fetch the Wikivoyage status tiers | turns the yes/no Wikivoyage reference into a four-tier one, the best quality signal the research found | on your box run `python -I scripts/validation/layer_ratings.py fetch-wikivoyage`; then `python -I scripts/validation/runner.py ratings --write`; commit `data/reports/validation/ratings/sources/wikivoyage_status.json` and the new result | `scripts/validation/layer_ratings.py`
- [T1191-h] Add tourism board and best-of lists and Eurostat nights | the brief's extra references; the cloud cannot reach them | write one JSON per list (GNTB Top 100, European Best Destinations, others whose terms allow it) in `data/reports/validation/ratings/sources/lists/`, names, ranks and pages only; save Eurostat city nights as `sources/eurostat_nights.json` keyed by place id; rerun the ratings layer with `--write` | `data/reports/validation/ratings/sources/README.md`
- [T1191-j] Decide on catalogue rows for listed places | Lonely Planet names Skanor-Falsterbo and Tipperary, and Tripadvisor and Lonely Planet name Sicily, Sardinia and the Veneto; Carta has no row for any of them | decide which (if any) get a row; file it as a catalogue task | `Execution/P15/T1191-ratings-validation.md`
- [T1191-l] Check the reference licences | the UNESCO and Tripadvisor terms limit republication, and T760's Tripadvisor file stores names and ranks | read UNESCO FAQ 126 and the Tripadvisor terms; decide whether `data/rating/external/tripadvisor.json` stays in git or becomes a local-only input | `data/rating/external/tripadvisor.json`

## Rollback procedure

`git revert` the T1191 commits. Nothing live changed: no score, no wire file, no migration. The ratings layer and its directory simply go away; the other layers and the runner are unaffected except for the one LAYERS line.
