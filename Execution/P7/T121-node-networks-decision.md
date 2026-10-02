# T121 Node networks are not routes: decision record

## Task ID

T121 (mind-map number T117). Branch p7-node-networks-decision.

## Date

2026-10-02

## What changed

Nothing in code. This task records a decision that the code already enforces for cycling and verifies where the enforcement stops. The decision: numbered-junction networks (knooppunten, Knotenpunkte, noeuds) are not ingested as routes. Each node pair is a tiny relation, so publishing them would fill the catalogue with 2 km fragments. The cycling harvest keeps them as a graph in separate tables, and a separate script measures the mesh around each destination so the page can say something true instead of nothing. Whether to build a routable "40 km loop from node 42" product on that graph is a product decision and belongs to the owner (spec section 7.5 and open decision in section 14). It is recorded as an open owner row, not built.

Line numbers below are in the main checkout at commit a3edb0885 and are the evidence for each claim.

How the exclusion works for cycling. In pipeline/cycling/harvest_cycling.py, is_node_network() (line 170) is true when network:type equals node_network. publishable() (line 181) returns False for those relations at line 188, so they never reach cycle_routes. harvest_country() (line 768) collects them separately as connections. They are only kept for the countries named in NODE_NETWORK_COUNTRIES (line 123, Netherlands and Belgium), and for any other country the connections list is emptied (lines 771 to 772). For those two countries scan_junctions() (line 569) reads the numbered posts and store_node_network() (line 614) writes them to cycle_nodes and the edges to cycle_node_edges through the upserts at lines 585 to 612. The docstring at lines 36 to 41 states the rule. docs/CYCLING.md line 80 repeats it with the measured case: Belgium has 11,693 connections against 1,298 real routes, and 13,152 bicycle relations in total, so the extract is 90 percent node network.

How the mesh is still shown. pipeline/trails/node_networks.py reads the graph in SQL (line 67), counts signed edge length and junctions within RADIUS_KM of 15 (line 59), finds the nearest junction, and drops destinations below MIN_KM of 25 (line 62, applied at line 125) so a stray junction is not described as a network. Output goes to data/derived/node_networks.json and is attached under node_network by pipeline/trails/attach.py (loader at line 216, set at line 447). run_pipeline.py routes_attach runs it (line 1883) and its note says the mesh is "deliberately never published as routes". The destination page therefore gets one sentence and a map link, never a route list.

Where the exclusion stops. The hiking ingest does not apply the rule. In pipeline/trails/ingest_osm_routes.py, KEEP_TAGS (line 90) does not carry network:type, so scan_relations() cannot see the tag, and passes_first_filter() (line 226) lets a relation through if it has a major network token or any name. Hiking node networks are tagged rwn, which is in MAJOR_NETWORKS (line 84). The evidence that they are in the hiking store: dedup.py reads the tag from route_relations (line 119) and reports 98,823 node-network rows among the 142,659 hiking rows it compared (ROUTES.md line 338). The same file's hierarchy scan counts 121,161 node-network hiking relations in Europe (ROUTES.md line 265). Today they are kept out of publication downstream, not at ingest: dedup.py leaves them out of the co-location candidate set (lines 119 and 187), and curate.py applies a 2 km floor (MIN_M, line 199) plus per-region quotas. I did not run curate, so I have not confirmed that no node edge is published as a hike. That check is the open item below. Cycling is therefore safe by construction and hiking is safe by luck of length and quota.

## Files touched

Created:
- Execution/P7/T121-node-networks-decision.md
- Edited in place: Execution/_OPEN.md (appended rows)

No pipeline, app or data files changed.

## Commands run

Read-only searches (grep and sed) over the main checkout. No pipeline run, no database access, no data writes.

## Config and secrets set

None.

## Before/after measurements

Not measured. The figures quoted above are existing measurements from docs/CYCLING.md, ROUTES.md and data/reports/routes_node_networks.json (generated 2026-09-13: 192 destinations in BE and NL considered, 188 with a network summary). None was re-run.

## What broke and how it was fixed

No issues.

## What is still open

Three items. First, the owner decides whether to build the routable node graph and a loop planner ("40 km loop from node 42"). The graph and the data it needs already exist in cycle_nodes and cycle_node_edges for NL and BE, so the work would be a routing and UI product, scoped as its own task. Until the owner says yes, the answer is the one recorded here: leave node networks out and say so on the page, which the node_networks.py sentence already does.

Second, the hiking ingest has no exclusion of its own. A small task should add network:type to the KEEP_TAGS of ingest_osm_routes.py, skip node_network relations in passes_first_filter(), and confirm by a count against the published hiking rows that none is a node edge today. This touches the ingest, so it is a data-contract change that needs a pipeline run, and it was out of scope here. The 98,823 staged rows would also stop costing time in later stages.

Third, harvest_cycling.is_node_network() has a redundant second clause (network equals rcn and network:type equals node_network) that can never differ from the first. It is harmless and left alone.

## Rollback procedure

Delete the report and revert the register rows with git revert of the T121 commit. No code or data to undo.
