# T113 Famous-trail registry: the Waymarked diff and the per-GMBA gap

## Task ID

T113 (mind map number T109; T113 is used everywhere).

## Date

2026-10-02

## What changed

The famous-trail registry already existed (data/trails/famous_registry.json, built by pipeline/trails/famous_registry.py from Wikidata, pageviews, OSM fame tags, national portals and a seed list) and the coverage gate already read it. Two parts of spec 6.1 were missing, and this task adds them.

The first is the Waymarked Trails diff. Every evidence source the registry had was a fame signal, so a national trail nobody wrote an article about could never become a row, and "should this country have it" could only be asked of trails somebody had already made famous. A new module, pipeline/trails/waymarked.py, harvests every INT and NAT hiking route Waymarked Trails lists over the catalogue (2,055 routes: 1,858 national, 197 international) and places each one in every country whose Geofabrik extract holds it (2,756 placements). The registry merges that list as its fifth evidence source: 1,204 placements matched a row the fame sources had already built, which now carries evidence.waymarked; 1,346 became rows of their own (origin "waymarked", kind trail); 4 seeds nothing else could resolve were resolved by a signed route of the same name (GR 5 in Belgium, Sentier du Nord, High Scardus Trail, Victoria Lines). The registry grows from 15,943 to 17,289 walks.

The second is the per-GMBA gap. The coverage report held every NUTS3 region to its top three registry walks but never rolled anything up per GMBA range, although 6.1 asks for both. It now does, with the same rule, and --strict fails on a range as it does on a region. It also reports where the registry itself is blind: ranges and regions the wire publishes walks in and the registry holds no walk for. Those pass the gate by having nothing to fail, which is the vacuous-gate trap one level up, so they are now listed by name.

A third change came out of measuring the second: the coverage report now matches on OSM relation id before it tries names and geometry. The registry knew the relation for 6,442 rows and the wire carries it on 17,114 trails, and the two were never joined, so a published relation whose wire name differed from its Wikidata label read as missing. This alone moved matched rows from 1,630 to 1,770 on the unchanged registry.

## How it works

waymarked.py has two steps. The harvest asks /api/v1/list/by_area for 204.8 km Web Mercator boxes, only where a NUTS3 polygon lies under the box. The API returns at most 100 routes per box, sorted INT, NAT, REG, LOC, so a box whose hundredth route is still INT or NAT is split in four and asked again; any other box has given up every INT and NAT route it touches. 785 requests covered Europe; 4 boxes needed a split and none hit the depth limit. REG and LOC are left out on purpose, because holding a region to every regional Rundweg is the "tagging culture measured as coverage" failure spec 0.2 warns about.

The placement does not use the service again. The details endpoint returns the full geometry (12 MB for the E3), so each route is placed from the extracts on disk under data/raw/geofabrik, the files the trails ingest reads. One relation pass per country records which wanted relations the extract holds and their members, super-routes are followed three levels down (an E-path is a relation of relations), and up to nine of the member ways the extract holds are resolved to a node each. The first node that lies inside the country by the regions spine wins. When none does, the placement is written as null: Geofabrik cuts with a margin, so an extract often holds a route that runs along the far side of its border, and 225 placements are of that kind. The full pass over 44 extracts takes about 25 minutes.

famous_registry.py reads data/trails/waymarked_routes.json if it exists. In a full build the merge sits after the portals and before the seeds, so a seed can attach to a signed route. A route joins an existing row by relation id, then by Wikidata QID, then by folded name or ref (a key of one or two letters with no digit is ignored, because a ref of "E" otherwise joined unrelated routes). The weights are unchanged: a Waymarked-only row scores on the evidence it has, which is usually zero, so it only reaches a region's top three where the region has fewer than three better-known walks. That is the intended effect: 84 NUTS3 regions and 123 GMBA ranges that had no registry walk at all now have one.

--waymarked-only re-applies the harvest to the committed registry without the other four sources. It removes whatever a previous pass added, merges again and assigns regions to the new rows only, so it is idempotent (two runs produce identical files apart from the waymarked_applied_at stamp). It was needed because the committed registry cannot be reproduced from this worktree: see the open items.

Both famous_registry.py and coverage_report.py now read their caches, the wire and the regions spine from CARTA_DATA_ROOT when it is set, the split coverage.py has used since T111, so they run from a sparse worktree against the main checkout. Nothing was written to the main checkout.

## Files touched

Created:
- pipeline/trails/waymarked.py
- data/trails/waymarked_routes.json
- Execution/P7/T113-famous-trail-registry.md

Modified:
- pipeline/trails/famous_registry.py
- pipeline/trails/coverage_report.py
- data/trails/famous_registry.json
- data/reports/trails_coverage.json
- data/reports/trails_coverage.md
- Execution/_OPEN.md

## Commands run

    cd C:\Users\Gebruiker\Documents\Portfolio\wt\T113
    git sparse-checkout add data/trails data/reports
    export CARTA_DATA_ROOT="C:/Users/Gebruiker/Documents/Portfolio/Travel App"
    export INGEST_DATA_DIR="C:/Users/Gebruiker/Documents/Portfolio/Travel App/data/raw"
    python pipeline/trails/coverage_report.py --all            # baseline
    python pipeline/trails/waymarked.py --harvest-only
    python pipeline/trails/waymarked.py --place-only
    python pipeline/trails/famous_registry.py --waymarked-only
    python pipeline/trails/coverage_report.py --all --strict

In the main checkout the same thing is `python pipeline/trails/waymarked.py` followed by the monthly trails_registry task. The harvest keeps a checkpoint in the system temp folder (carta_waymarked_cells.json), so a re-run after a failed box only asks the missing boxes; delete it to force a fresh harvest.

## Config and secrets set

None new. CARTA_DATA_ROOT (already read by coverage.py) is now also read by famous_registry.py and coverage_report.py; INGEST_DATA_DIR (already read by the ingestion config) points waymarked.py at the extracts. No key: Waymarked Trails needs none.

## Before/after measurements

Before is the committed registry and the current wire with the code at the start of the task. The middle column is the new report code on the unchanged registry, to separate the relation-id match from the Waymarked rows.

| Metric | Before | Relation match only | After |
|---|---|---|---|
| Registry walks (kind trail) | 15,943 | 15,943 | 17,289 |
| Registry rows with Waymarked evidence | 0 | 0 | 2,367 |
| Unresolved seeds | 154 | 154 | 150 |
| Registry walks matched to the wire | 1,630 (10.2%) | 1,770 (11.1%) | 2,025 (11.7%) |
| NUTS3 regions with a registry walk | 1,151 | 1,151 | 1,235 |
| NUTS3 regions failing the top-three gate | 1,067 | 1,060 | 1,142 |
| GMBA ranges with a registry walk | not measured | 529 | 652 |
| GMBA ranges failing the top-three gate | not measured | 427 | 553 |
| Ranges publishing walks with no registry walk | not measured | 456 of 870 | 367 of 870 |
| NUTS3 publishing walks with no registry walk | not measured | 285 of 1,367 | 217 of 1,367 |

The failing counts go up and that is the point: 84 regions and 123 ranges are now held to something, and many of them fail on their national trail. Of the 2,367 registry rows with Waymarked evidence, 437 are published and 1,930 are not, nearly all as failed_continuity (a relation exists and did not reach the wire). France alone has 317 such misses against a wire of 970 trails (GR 96, Tour du Queyras, Voie des Capitales); Spain 285, Germany 270. That is the recall gap spec 0.3 describes, now as a list rather than a guess.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| E2 never placed in Luxembourg | the member walk was cut at 400 ways, and the E2 lists 941 Walloon ways before the Luxembourg section | no cut; only ways the extract holds are candidates |
| 223 of 1,453 added rows landed in a neighbour's NUTS3 (Julius Kugy Alpine Trail as an Austrian row in Italy) | one fixed member way per route, and extracts carry cross-border ways | nine candidates, first inside the country wins, null when none is |
| --waymarked-only gave different files on two runs | row order fed setdefault, and the committed file is sorted differently from a fresh merge; a ref of "E" joined unrelated routes | indexes built in a fixed order; one or two letter keys without a digit ignored |
| Overpass refused the centre lookup (dispatcher error on two instances) | public Overpass load | placement moved to the local extracts, which is also what the registry's own docstring asks for |
| Heredoc edits lost backslashes | Git Bash heredoc | edits made with the editor instead |

## What is still open

The committed registry predates the Phase 2 classifier. Its rows carry no highway or trail_signal evidence and the OSM fame cache in the main checkout was scanned before that code existed, so a full rebuild here would misclassify every way-only group. That is why this task used --waymarked-only. A full `famous_registry.py --all --refresh` in the main checkout (it rescans 44 extracts and writes cache/) will re-score everything, apply the classifier, and fold the Waymarked rows in through the build path; until then the not_a_walk code reads 0 in the committed report.

waymarked.py is not in run_pipeline.py's trails_registry task, which this task may not edit. The monthly build reads the committed harvest, so it goes stale until somebody adds the module ahead of famous_registry.py in that task.

docs/tos/data_licenses.md has no row for the Waymarked Trails route list (ODbL, OSM data served by waymarkedtrails.org; only ids, names, refs and groups are kept, no geometry). That file was outside this task's scope.

The 1,930 unpublished national and international routes need an ingest investigation: whether curate.py's quota, the continuity gate or the ingest's network filter drops them. The trails coverage report now lists every one with its relation id.

367 GMBA ranges and 217 NUTS3 regions publish walks with no registry walk at all, led by the Central Balkan Mountains, the Cyclades, the Agrafa and Kopaonik. Those are Tier D and Greek places where no fame source and no national network reaches; the seed list or a portal is the likely route.

coverage.py's country contract carries the NUTS3 top-three verdicts but not the new range verdicts. Spec 0.4's trails rule is per NUTS3 only, so whether a range miss should count against a country's trails cell is a product decision.

Spec 6.1 names P18 (image) and P402 (OSM relation id) in the Wikidata query. wd_query pulls neither. P402 would give the registry a third identity join to the wire, after the OSM fame scan and Waymarked.

## Rollback procedure

    git revert <every T113 commit on p7-famous-registry-topup>

or, before merge, drop the branch. The code changes are additive: without data/trails/waymarked_routes.json, famous_registry.py skips evidence 5, and the coverage report's relation match, range rollup and blind-spot lists only add fields. To strip Waymarked rows from a registry without reverting code, restore it from the commit before this task (git checkout d026edba5 -- data/trails/famous_registry.json) and re-run coverage_report.py. No database, wire or cache was written.
