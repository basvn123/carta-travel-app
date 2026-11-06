# T1094: recover the walks lost in the trail build (D7)

Session S10 of the overnight run. Roadmap item D7. Builds on T1092 (trail names, per-day difficulty) and T1093 (trail photo harvest).

## Date

2026-11-06

## What changed

The trail pipeline has four new recovery rules in code, each proven on small OSM files shaped like the real mapping, and the loss is now sized from the committed files. The headline finding changes the size of the job: of the 8,891 `way_only_not_derived` rows in the committed coverage report, 8,621 carry no trail signal at all (Via Roma, Schulweg, Ketelmeer, statues and bridges that the Phase 1 classifier filed as famous trails). Phase 2 already fixed that classifier (`famous_registry.kind_of`), but the committed registry predates the fix, so those rows leave the gate only when the registry is re-harvested on the box. 246 rows carry walk evidence; at most 190 of them are derivable walks (the rest are lone ways named like a bridge or tunnel). The rules: (1) article pairs, so ways citing a walk by wikidata and by Wikipedia title chain as one walk; (2) a lone famous way (one graded or waymarked way that cites an article, at least 600 m, not a bridge or tunnel) is derived on its own; (3) a branching famous chain ships its main line when that line carries at least 80% of the chain, with the variant or spur set aside and recorded, which is the Orla Perc shape; (4) splice.py's reorder pass, which retries a relation the stored order refused with its parts in walking order and direction, under the same limits, plus a tiny-break count relaxation (every break under 25 m: up to 30 breaks). For `failed_continuity` (4,555 rows in the committed report), the files prove 251 repeat a relation filed under a second country, 126 are parents of a published stage and 9 are already published; the other 4,169 need the lab to tell a break from a quota or length loss, and `splice.py --dry-run` now prints how many the reorder pass takes. Country assignment: the Grote Rivierenpad row is filed correctly (stage 15 runs Kranenburg to Kleve, wholly in Germany; its extract and its midpoint agree); the real mistake was Northern Ireland, which the Ireland extract stages as IE, and `export_wire` now files those rows GB whatever their length. Famous routes: 15 of 30 are published on the 2026-09-13 wire; the rules are expected to add Sentier des Roches, Ruta del Cares and Orla Perc, and Laugavegur only if its breaks are order artefacts; 11 have no rule (no OSM data or an unresolved seed). Nothing was run on the box: the rebuild is owner step T1094-a.

## Files touched

- Created: `pipeline/trails/chain.py` (pure ordering and main-line search), `pipeline/trails/recover_walks.py` (offline sizing), `tests/test_trail_recover_walks.py` (17 tests), `data/reports/trails_recovery.json`, `data/reports/trails_recovery.md`, this report.
- Modified: `pipeline/trails/derive_routes.py` (rules 1 to 3; `derive_extract()` split out of `run_country()` so the derivation runs without the database; dry run prints the T1094 counts), `pipeline/trails/splice.py` (reorder pass, `plan_reorder()`, distance sync covers `ordered-splice`), `pipeline/trails/export_wire.py` (`extract_quirk_country`), `docs/HANDBOOK.md` (trails section), `ROADMAP.md` (D7 status), `Execution/_OPEN.md` (rows T1094-a to T1094-e).

## Commands run

```
pip install osmium psycopg[binary] scipy pytest -r requirements.txt   # container only
python -m pytest tests/test_trail_recover_walks.py -q
python -m pytest tests -q (quarantine deselected)
python pipeline/trails/recover_walks.py
python -c "import smoke_test; smoke_test.famous_check()"   # from pipeline/trails
ruff check --select E9,F63,F7,F82,F401,F841 <touched files>
```

No pipeline task ran: the Geofabrik extracts, the trailslab database and BRouter/Valhalla are not in this container, and Geofabrik and Wikidata are not reachable from it.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Walk candidates published, sweep of 2026-09-18 | 1,630 of 15,943 | Not measured (box run T1094-a) | |
| `way_only_not_derived` rows (committed report, 2026-10-02) | 8,891 | Not measured; sized: 8,621 no trail signal, 120 walk evidence on 2+ ways, 126 on one way (56 named like a structure), 17 with a relation too, 7 network tag only | |
| Derivation ceiling for `way_only_not_derived` | none stated | 190 rows | |
| `failed_continuity` rows (committed report) | 4,555 | Not measured; sized: 4,169 need the lab, 251 same relation in a second country, 126 parents of a published stage, 9 already published | |
| Famous test routes published (smoke_test on the 2026-09-13 wire) | 15 of 30 (the sweep counted 14) | expected 18 of 30, 19 if Laugavegur's breaks are order artefacts | +3 to +4 expected |
| Wire rows whose filed country differs from their owning region's country (TL read as GB, SM outside the catalogue) | 36 | 5 after the export rules (T456 moves 25, T1094 moves 6 in Northern Ireland); the 5 are long cross-border paths left where staged by design | -31 at the next export |
| Python tests for these rules | 0 | 17 passing | +17 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The main-line rule found no line through a branching fixture | The ingest stitcher walks straight through a junction when member order allows, so a variant or spur leaves from the MIDDLE of a segment and an end-to-end search cannot see it | `split_at_junctions()` cuts every segment at interior nodes that end or lie on another segment before the search |
| The famous table matched Greek rows to every fixture | Greek-script names fold to an empty string, and an empty string is "in" every key | Registry rows are matched on whole words and a non-empty name of 5+ characters; published status is decided on the wire, the way `smoke_test.famous_check` does |
| Full pytest: 2 failures outside this task | `test_rating_inputs`, `test_rating_stability` read a pageview cache that is empty in this container (LFS) | Not this task's; not touched |

Gotcha for the next session: the old behaviour on the Orla Perc shape was not "nothing ships". The strict passes refused it, and the lenient same-name pass then shipped the longest stitched piece (3.6 of 4.5 km in the fixture) under the walk's full name. The main-line rule replaces that fragment with the whole main line.

## Screens checked

None: no app code changed. The export rule changes which country file a few Northern Ireland walks land in at the next export; the owner step lists the check.

## What is still open

- T1094-a (user): the box rebuild, with the commands below. It is the only way to turn the sizing into counts.
- T1094-b: `coverage_report.load_published` reads the rated tier only; the 9 "already published" relations sit in the listed tier or under another row, so the report counts them as misses.
- T1094-c: 11 famous fixtures have no recovery rule: Hardergrat, Gornergrat, Morskie Oko, Pico Ruivo, Seceda (no OSM fame tag), Cirque de Gavarnie, Teide, Alpe di Siusi, Tre Cime di Lavaredo, Mount Olympus, Plitvice (unresolved seeds). The Hardergrat seed resolved to a row named "Hard". These need seed resolution or composition (brief section 6), not chaining.
- T1094-d: Grote Rivierenpad is filed correctly (stage 15 lies in Germany), but it is the only published stage of a Dutch national path, so the path reads as German. The fix is the stage-family parent page (brief section 5) and the Dutch stages, which the coverage report holds as `failed_continuity`.
- T1094-e: `smoke_test.famous_check` reports Mount Olympus as "matched" in its reason column while it is a gap: its fallback word search matches a Greek row whose name folds to an empty string.

## Rollback procedure

`git revert` the T1094 commit. Nothing ran against the lab or the wire. After the box run, a revert also needs: derived trips from the lone-way and main-line rules are `source='osm_ways'` rows with `gap_info.lone_way` or `gap_info.spine_from`, and reorder repairs are `trip_repairs` rows with `repair_info->>'method' = 'ordered-splice'`; delete those and re-run `trails_curate` and `trails_rate` to drop them from the wire.

## Owner steps (for the checklist)

- [T1094-a] Rebuild the trails with the T1094 recovery rules on the box | the rules are in code and tested on fixtures, but the extracts, the lab and the Wikidata harvest are only on the box, so no walk is recovered until this runs | `cd tools/trailslab && docker compose up -d && cd ../..`; `python pipeline/trails/derive_routes.py --dry-run` and keep the per-country lines plus each "T1094 rules" line (expect Orla Perc, Sentier des Roches and Ruta del Cares in PL, FR and ES); `python pipeline/trails/splice.py --dry-run` and keep the "T1094 reorder pass" line and its refusal reasons; `python run_pipeline.py trails_registry` (re-harvests the registry with the Phase 2 classifier, about an hour, needs Wikidata); `python run_pipeline.py trails_derive_routes` (all countries, several hours); then `trails_elevation`, `trails_splice`, `trails_regionize`, `trails_hierarchy`, `trails_curate` and the rest of the chain to `trails_rate`, which exports the wire; `python pipeline/trails/coverage_report.py --all`; `python pipeline/trails/recover_walks.py`; `python -c "import sys; sys.path.insert(0,'pipeline/trails'); import smoke_test; smoke_test.famous_check()"`; plan one overnight run in total; expect `way_only_not_derived` to fall from 8,891 to a few hundred, at most 190 of them newly published, famous routes 15 to 18 or 19 of 30, and the Mourne Wall Challenge, Antrim Hills Way and Newcastle Way to move from IE.json to GB.json; send the printed numbers to the next session for the report | `Execution/P15/T1094-recover-walks.md`
