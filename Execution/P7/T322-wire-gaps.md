# T322 Why registry routes and ranges are missing from the trails wire

## Task ID

T322 (register rows T113-d and T113-e).

## Date

2026-10-03

## What changed

Nothing in the published wire, the registry or the database changed. This task answers two questions that T113 left open and adds code for the answers, none of it run against the lab.

T113-d asked whether curate's quota, the continuity gate or the ingest network filter drops the 1,930 Waymarked national and international routes that the registry holds and the wire does not. Read against the code and the committed files, the answer is that the network filter does not (ingest_osm_routes.passes_first_filter admits any iwn, nwn or rwn relation, and only a node-network edge is refused), and that three other gates do, in a way the coverage report cannot show. The report files all of them under failed_continuity, but its own comment says that code is inferred by elimination ("a relation exists and did not reach the wire"), so the number 1,930 was never a count of continuity failures. The gates that stand between an iwn or nwn relation and the wire are these.

First, the candidate query keeps only routes of 2 km to 400 km (curate.TREK_MAX_M). A parent path longer than that is represented by its stages, which is by design, but the report then counts the path as missing.

Second, a head longer than 45 km enters the trek pool only if it is famous (a wikidata or wikipedia tag, or the country's recall list). A 100 km national path with neither tag is in no pool, and pass 4 draws from the day pool only, so nothing can ever pick it.

Third, the trek pool is capped at 60 slots, and Germany and Great Britain each publish 61 routes over 45 km (counted from continent-app/public/trails/DE.json and GB.json, trips and listed), which is that cap spent. A route at or under 45 km competes for a region slot against loops, which take 40 percent of the target first, and a linear path loses that contest.

The offline evidence is a sample, not a census. data/reports/trails_seed/*.csv holds the top 15 staged routes per country with their length, network and relation id (September snapshot). 80 distinct unpublished Waymarked relations appear in it. Their lengths: 18 are over 400 km (the 400 km cut), 34 are 45 to 400 km with no article tag (no pool), 9 are 45 to 400 km with an article tag (the trek pool, capped), and 19 are 2 to 45 km (region quota, cell cap, family fold or series cap). 15 of the 80 sit in a family of more than one member. The sample is biased toward the best-ranked routes of each country, so read the shares as an order of magnitude only. The exact split needs the staging table, which was not queried: the lab's Docker daemon did not answer inside two minutes, and this task was told to read the registry and the wire only.

Two corrections to the figure itself. The 1,930 rows are 1,445 distinct relations, because a cross-border route has a row in each country that holds it. 549 of the rows are placements with no coordinate (the extract held the route across the border) for a route that has its real placement elsewhere, which is the code unplaced and not gating. Of the 1,801 distinct relations the registry holds with Waymarked evidence, 1,416 were never matched to a wire trip by relation id.

The fix, as code, is a national pass in curate.select_country. A family head signed iwn or nwn that passed every hard gate gets a slot from its own small quota (4 percent of the country target, at least 4, at most 40), outside the region quota and the trek cap. It is off by default and turned on with `curate.py --national-treks`, so a run without the flag selects exactly what it selected before. The second piece is pipeline/trails/gate_attribution.py, which replaces the guess with a measurement: one named gate per unmatched relation (not_staged, rejected, synthetic_title, too_short, too_long, continuity, folded_into_family, no_pool, trek_cap, region_or_cell, picked), by asking the staging table and re-running select_country as a dry run. It is read-only.

T113-e asked for a seed list for the 367 GMBA ranges and 217 NUTS3 regions that publish walks with no registry walk. Two things were written. pipeline/trails/blind_spot_worklist.py writes data/reports/trails_blind_spots.json, one entry for each of the 584 units with its country, published count and the three best-rated published walks as candidates for a person to confirm (not registry evidence, because a registry built from our own wire would make the gate compare the wire with itself). pipeline/trails/seeds_blind_spots.py names 30 walks in 7 countries for the largest blind units (Central Balkan Mountains, Cyclades, Agrafa, Zagori, Euboea, White Mountains, Parnon, Samos, Naxos, Papuk, Gennargentu, Aspromonte, Kopaonik and others). famous_registry.build_country now reads them after SEEDS. They were written from the maintainer's own knowledge and checked only against names the wire already carries, not against a portal; the resolver checks each against Wikidata and OSM and an unresolved seed ships as unresolved_seed, which never gates. Kopaonik is filed under XK because that is where the wire puts its 32 walks. A portal pass is the better source for Greece and the Balkans.

## Files touched

**Modified:**
- pipeline/trails/curate.py (national pass, is_national, national_quota, --national-treks; default behaviour unchanged)
- pipeline/trails/famous_registry.py (imports SEEDS_BLIND and reads it after SEEDS; two lines)
- Execution/_OPEN.md (T113-d and T113-e closed by T322; rows T322-a to T322-d)

**Created:**
- pipeline/trails/gate_attribution.py
- pipeline/trails/seeds_blind_spots.py
- pipeline/trails/blind_spot_worklist.py
- data/reports/trails_blind_spots.json
- tests/test_gate_attribution.py
- Execution/P7/T322-wire-gaps.md

## Commands run

    cd C:\Users\Gebruiker\Documents\Portfolio\wt\T322
    git sparse-checkout add data/reports data/trails
    export CARTA_DATA_ROOT="C:/Users/Gebruiker/Documents/Portfolio/Travel App"
    python pipeline/trails/blind_spot_worklist.py
    python -m pytest tests/test_gate_attribution.py -q      # 10 passed

The offline analysis read data/trails/famous_registry.json, data/trails/waymarked_routes.json, data/reports/trails_coverage.json, data/reports/trails_seed/*.csv and continent-app/public/trails/*.json from the main checkout, read-only. No pipeline run, no database query, nothing written to the main checkout.

## Config and secrets set

None. blind_spot_worklist.py reads CARTA_DATA_ROOT the way coverage_report.py does.

## Before/after measurements

Not measured: no wire, registry or database figure moved. The figures in the text are the starting point for T322-a, with their sources: 1,930 rows, 1,372 failed_continuity and 549 unplaced from data/reports/trails_coverage.json joined to data/trails/famous_registry.json; 1,445 distinct unmatched relations and 1,416 never matched, from the same join; the 80-relation sample from data/reports/trails_seed/*.csv; 61 routes over 45 km in DE and GB from the wire; 584 blind units from the report's registry_gap block.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| tests/test_rating_distribution.py fails with FileNotFoundError in this worktree | the sparse checkout has no continent-app or cache, and the test reads them | not touched; unrelated to this task |
| First national-pass test expected the pass to add routes | the pass spends the country target, it does not add to it | test now asserts the count is unchanged and only a loop is displaced |
| Seed Imbros Gorge duplicated an existing GR seed | no check | removed; a test now fails on any duplicate against SEEDS |
| docker ps hung | the lab's Docker daemon was unresponsive | no database work was done; the diagnostic is written to run later |

## What is still open

T322-a: run gate_attribution.py with the lab up to get the true per-gate count. T322-b: after that, compare a plain curate dry run with a --national-treks dry run, and enable the pass only if the extra routes are walks. T322-c: the coverage report double counts cross-border relations and files a published stage family as missing; fix the counting. T322-d: the seeds take effect only on the next full registry rebuild in the main checkout (T113-a); the worklist still needs a human or portal pass.

## Rollback procedure

Nothing was applied to data. `git revert` the T322 commit, or drop branch p7-trails-wire-gaps. Without --national-treks curate.py selects as before. famous_registry.py now imports seeds_blind_spots, so revert both together.
