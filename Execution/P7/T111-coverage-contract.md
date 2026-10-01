# T111 coverage contract: country floors and reason codes

## Task ID

T111 (mind map number T107; T111 is used everywhere).

## Date

2026-10-02

## What changed

The coverage audit in pipeline/regions/coverage.py now builds the coverage contract from spec 0.4: for each of 45 countries and each of the five layers, one cell that holds the published count, the country floor, a status of pass, fail or n/a, and, on every cell that is not passing, one of the spec's seven reason codes with a one line detail. The same run stamps a reason code beside every NUTS3 region whose status is thin, empty or na, so the per region wire the app already reads carries a code too. The audit used to answer only "is this region thin"; it now answers "is this country covered in this section, and if not, why", which is the question the spec's dashboard asks.

The run against the main checkout's data gives 42 of 225 country cells above floor, 164 with a reason code, 19 not applicable and 0 blank. Before this task there were no country cells at all and no codes anywhere; the only country level view was the hand counted table in spec 0.1. The done condition of the task, every cell either above floor or carrying a code, holds on the first run and is enforced in code: a non passing cell without a code raises, and the new `--strict` flag exits 1 on a blank cell.

## How it works

The audit runs once per layer as before (published rows from the wire, assignment to NUTS3, the gate replay for beaches, lakes and mountains). audit() now returns that working state alongside the region statuses, so build_contract() reads the same rows and the same gate verdicts instead of replaying the gates a second time.

A floor is two things at once, and this is the part worth keeping in mind when a number looks surprising. It is a minimum count (12 walks, 8 cycling routes, 10 beaches, 15 lakes, 10 mountains) and it is a named list the spec says the country must publish: every registry walk above the fame threshold, every EEA coastal bathing water, every lake clearing a hard anchor, every ultra, highpoint and lift served summit, every national and international cycling route. The count alone would be a vacuous gate (Germany publishes 4,686 walks and is missing 221 of its 237 famous ones), so a cell passes only when the count clears the minimum and every named row is published. The floor printed in the cell is the larger of the minimum and the named list, which is why Italy's beach floor reads 4,782: that is how many EEA coastal bathing waters Italy designates, and the spec says publish every one of them. Every unpublished named row is listed under the cell with its own code and, where the gate replay saw it, the number the gate saw (for example `photo_gate:imgs_3`), so the report is a work queue and not a verdict.

How each layer finds its named list. Trails read data/trails/famous_registry.json and data/reports/trails_coverage.json (the trails report that T-series Phase 2 built); a registry row with fame_score of 0.4 or more is a must, and its status and reason come from the trails report, mapped onto the contract's seven codes (no_osm_data and unresolved_seed become no_open_data, out_of_scope becomes not_applicable, unplaced and composed become below_quota). The per region rule, every NUTS3 publishes its top three registry rows, is the trails report's own top3 verdict carried through per country. Cycling reads the wire: a route whose `net` is ncn or icn is a must, and since the wire is the only pool the named list is published by construction, so the cycling floor can only bite on the minimum, and the detail says so. Beaches read cache/eea_bathing_water.json, type Coastal, and count a site as published when a published beach lies within 1 km of it; a country with no coast in opportunity.json and no EEA coastal site is n/a, and the detail says how many lake beaches it does publish. Coastal NUTS3 regions under five beaches are listed with a code from the gate replay. Lakes read the harvested pool in cache/lakes/rich_XX.json and apply the spec 9.1 anchors: area 5 km2 or more, two or more sitelinks, a protected area, or an EEA lake bathing site within 2 km; a must is published when its Wikidata id, OSM id or folded name is in the wire. The 50 km cell cap is measured in EPSG:3035 and reported, not gated. Mountains read cache/mountains/rich_XX.json: prominence 1,500 m or more is an ultra, any highpoint_of value is a highpoint, and peak_index.lift_of() decides lift served; a rich peak's `osm` field is a tag census rather than an id, so matching is on Wikidata id and folded name only. The GMBA rule pools peaks across countries by their range id, keeps ranges whose top peak clears 1,000 m, and charges each unpublished top three peak to the country that holds it.

Two things override the derived code. A microstate (Monaco, San Marino, Liechtenstein) that fails trails or cycling on the count is n/a, per spec 1.6. KNOWN_GAPS holds the facts spec part 1 states that the data cannot derive: Turkey's trails are pending_partnership with the Culture Routes Society, Turkey's beaches are no_open_data because it sits outside the EEA register, and Ukraine's trails are below_quota because the country is outside the ingest scope while OSM covers the Carpathians. These apply to any cell that is not passing, including one the measures wrongly read as n/a (opportunity.json has no coast row for Turkey).

Outputs. continent-app/public/coverage.json keeps its shape and gains a `code` field on every non ok region entry and a `contract` block (49 KB) that carries the country cells without their miss lists. reports/coverage_contract.json carries the full cells with every miss. reports/coverage.html gains a country table at the top: one row per country per section with published, floor, status, code and detail, which is the spec 1.7 dashboard. The merge rule for a `--layers beach` run applies to the contract too: cells of the layers just audited are refreshed, the rest are carried forward.

Running it from a worktree. The sparse worktree holds the code but none of the data, and the rules forbid writing into the main checkout. coverage.py therefore reads CARTA_DATA_ROOT (caches, data/, layer wires, and the layer export modules it replays, which find their caches relative to their own file) and writes to CARTA_OUT_ROOT. Both default to the checkout the script lives in, so run_pipeline.py sees no change.

## Files touched

Modified:
- pipeline/regions/coverage.py

Created:
- Execution/P7/T111-coverage-contract.md

Not committed on purpose: continent-app/public/coverage.json, reports/coverage_contract.json, reports/coverage.html and the dated backlog CSVs, which this run wrote to the scratch folder and the next pipeline run will rebuild in place.

## Commands run

    cd C:\Users\Gebruiker\Documents\Portfolio\wt\T111
    export CARTA_DATA_ROOT="C:/Users/Gebruiker/Documents/Portfolio/Travel App"
    export CARTA_OUT_ROOT=<scratch folder>
    python pipeline/regions/coverage.py --strict

In the main checkout the same thing is simply `python pipeline/regions/coverage.py`, which run_pipeline.py's regions task already calls. The run takes about four minutes, most of it the beach gate replay.

## Config and secrets set

Two optional environment variables, CARTA_DATA_ROOT and CARTA_OUT_ROOT, read by coverage.py. No secrets.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Country cells with a published count, floor and status | 0 | 225 | +225 |
| Country cells above floor | not measured | 42 | |
| Country cells with a reason code | 0 | 183 (164 fail, 19 n/a) | +183 |
| Country cells blank | 225 (no contract existed) | 0 | -225 |
| Non ok NUTS3 region entries with a reason code | 0 of 11,015 | 11,015 of 11,015 | +11,015 |
| coverage.json size | 676 KB | 938 KB | +262 KB |

Codes on the 183 non passing country cells: below_quota 136, not_applicable 19, no_open_data 11, failed_continuity 11, way_only_not_derived 5, pending_partnership 1. licence_blocked is defined and never emitted, because nothing in the data states a licence block; the Balkan flagship routes the spec names under 1.4 fall out of the trails report as way_only_not_derived or failed_continuity instead.

The 136 below_quota cells are the honest headline. Most are lakes and mountains, where the spec's literal floor (every anchored lake, every highpoint) is far above what the photo and score gates let through: Austria publishes 121 lakes against 330 anchored, Germany 465 against 628. The counts are bounded by the harvest, not the world, and the detail says so on every such cell.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Mountain musts never matched on OSM id | the diff matched `peak.get("oid")`, and a rich peak's `osm` is a dict of tag counts, not an id | match on Wikidata id and folded name only |
| Every thin cycling region printed no_open_data | cycling has no gate replay, so "no rejected candidates" read as "no data" | cycling regions split by country: below_quota where the ingest reached the country, no_open_data where it never did |
| Landlocked countries with lake beaches were held to a beach floor | applicability followed the harvested pool | a country with no coast and no EEA coastal site is n/a, with its lake beach count in the detail |
| Turkey's beach cell read n/a | opportunity.json has no coast row for Turkey | KNOWN_GAPS overrides any non passing cell, not only a failing one |
| The audit could not run from the worktree | coverage.py read and wrote relative to its own checkout, which holds no data | CARTA_DATA_ROOT and CARTA_OUT_ROOT |

## What is still open

The spec says 47 countries; its own table in 0.1 lists 45, the layer harvests cover at most 45, and COUNTRIES in coverage.py is those 45. Which two are missing is a product decision (T111-a).

Nothing prints a code in the UI yet. The app's regions.js reads coverage.json and the `contract` block is in the wire, but no screen renders spec 4.6's sentence ("We publish 12 walks in Albania ...") or the empty state spec 1.6 asks for. That is a visual task under carta-design (T111-b).

Three thresholds are this module's own proxies and should be confirmed: the trail fame threshold of 0.4 (no named threshold exists in pipeline/trails; 0.4 admits 893 of 15,943 registry rows), the lake "Wikipedia article in two or more languages" anchor read as Wikidata sitelinks of two or more, and "regional highpoint" read as any highpoint_of value in the peak harvest (T111-c).

docs/REGIONS.md describes coverage.json without the `code` field or the `contract` block (T111-d).

`--strict` exists but nothing runs it on a build; spec 0.4 says CI checks the contract on every build (T111-e).

## Rollback procedure

    git revert c47c1143b 9e4e8d977

Then rerun `python pipeline/regions/coverage.py` in the main checkout so coverage.json and reports/ are rebuilt without the contract. Nothing else reads the new fields, so the revert is self contained.
