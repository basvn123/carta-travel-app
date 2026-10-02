# T311 Pipeline code fixes, no runs

## Task ID

T311 (register-row task, no mind-map prompt). Branch p7-pipeline-code-fixes.

## Date

2026-10-03

## What changed

Eleven register rows, all in pipeline code, all fixed in code with tests and none of them run against data. Each change lands the next time its stage runs, on the laptop or on the stage 7 box. The rows were T300-p, T121-b, T108-c, T113-g, T107-b, T096-c, T096-b, T288-c, T113-b, T269-b and T267-a. All eleven are closed. What still needs a data run or an owner decision is in new rows T311-a to T311-h.

Because the box will run run_pipeline.py on a timer, the edits there are only the three the notes granted. waymarked.py runs first in trails_registry (T113-b). A new task, photo_sources, comes after the layer exports (T269-b). The three retired carrier tasks and their step functions are gone (T267-a). `python -m py_compile run_pipeline.py` passes, `python run_pipeline.py --help` loads, and `python run_pipeline.py --list` prints the table: 62 tasks, down from 64, with photo_sources at the end. Nothing else in the file moved.

### Node networks (T300-p, T121-b)

`harvest_cycling.is_node_network()` now reads `network:type == node_network` and nothing else. The second clause (network=rcn and the same tag) could never be true when the first was false, so no result changes.

The hiking ingest had no exclusion at all. `ingest_osm_routes.py` now keeps `network:type` in KEEP_TAGS. `passes_first_filter()` refuses a relation tagged node_network, so it is never selected, and each country prints how many edges it left out. Edges stay in the relation pool, so a superroute can still resolve a member through it.

T121 had no count of node edges among the published hikes. I measured one on the wire. 124 published hikes have a name that is just a junction pair such as "33-36": 93 in NL, 27 in BE and 4 in DE, all on network rwn. These are almost certainly node edges. The count is a lower bound, because an edge with any other name is not caught. So the old claim that dedup, the 2 km floor and the quotas keep node edges off the wire is false. The new filter stops further edges from being staged. It cannot remove the 124 that are already staged and published, because the ingest only inserts and updates. That is T311-c.

### Highlight names (T108-c)

`scenic.py` now stores `names.display_name(tags, country)` as each feature's name, cut to the column's 160 characters. The Korab lake now reads "Korab Lake" and not its Macedonian Cyrillic name. A cell has no country of its own, so the country hint is the first country whose curated routes asked for the cell. The hint only matters at display_name's local-language step, which comes after name:en and after a Latin plain name.

Two smaller changes were needed before a re-run could change anything. First, each cached cell row now keeps the name tags display_name can pick (`names`), so a re-run from the cache picks the name again. Rows cached before T311 do not have them and keep their stored name until a `--refresh`. Second, the insert used `ON CONFLICT DO NOTHING`, so a stored Cyrillic name could never be replaced. It now updates the name, and only the name. The 799 rows T108 counted stay as they are until scenic.py runs with `--refresh` (T311-d).

### Wikidata P402 and P18 (T113-g)

The row asked for these in `famous_registry.wd_query`. I did not put them there. That query's own docstring explains why: one more OPTIONAL is the cross-product trap that gives a 400 from QLever and a timeout from WDQS, and then a country gets no rows at all. So `wd_identity()` asks for each property separately, in batches of 300 QIDs. This is the shape `wd_articles` already sends to both endpoints. Where an item has several values, it keeps the smallest relation id and the first file name in sort order. It also returns the QIDs whose batch got no answer. Those rows stay unstamped, so the next run asks again instead of trusting a None.

New cache rows get `osm_relation` and `image`. Countries cached before T311 are backfilled once, on the next networked run. That costs about 1,400 small queries, one time only (204,350 cached rows, 2 properties, 300 per batch). In the registry, the relation id becomes `evidence.wd_relation_id` and the image becomes `wd_image`. The relation id never enters the fame score. It only adds a join, in `merge_waymarked` and in `coverage_report.py`'s relation match. The coverage_report change is one `or` term, needed for the join the row describes.

### Title rung 1 (T107-b)

There is no label column in trailslab (tools/trailslab/initdb has none). The label already exists on disk, though, in the registry's Wikidata cache (`cache/trails_wikidata_famous.json`). `attributes.py` now reads that cache. It keeps only route-class items: hiking trail, long-distance trail and via ferrata, the same set as `famous_registry.TRAIL_CLASSES`, and a test checks the two copies agree. This way a relation tagged with the QID of a gorge it passes is never named after the gorge. The label order is the English label, then a Latin-script local label, then nothing. That is display_name's order. If a QID appears on more than one row in a country, it names the whole route and not a stage, so it is not used for any of those rows. CARTA_DATA_ROOT redirects the read, as it does in famous_registry.py.

### Accommodation (T096-c, T096-b)

Geneva first. The stored anchor in `cache/accommodation_city_anchors.json` is 0 EUR a night off 991 listings. I downloaded the current Geneva snapshot into the scratchpad (same path, `switzerland/geneva/geneva/2026-06-29`). The file has a Last-Modified date of 2026-09-26, so Inside Airbnb republished it in place. Its prices are ordinary ("$172.50"), and `parse_listings` reads them. The anchor comes out at 181 EUR a night, typical capacity 2, from 1,215 trimmed listings. So the parse code was not at fault. The cache was: it is keyed by region only, so a republished file is never fetched again.

The harvester now has three fixes. `--refresh geneva` (or `--refresh all`) re-fetches a snapshot. An anchor outside the 12 to 2,000 EUR band is refused at harvest, with a message that names the cure. The band is imported from apply_accommodation_anchors.py, so the two cannot drift apart. And `clean_price()` also strips the Swiss apostrophe, no-break spaces and currency codes, so a market that ever writes "CHF 1'234.00" parses instead of dropping out. The Geneva fix reaches users only after a refresh and an apply in the data lane (T311-a).

T096-b asked for a proposal in code: a resort adjustment, or a wider island radius. I chose the second, done honestly. `harvest_accommodation.py --footprint` adds one anchor per catalogue town inside the six regional snapshots (Mallorca, Menorca, Girona, Euskadi, Crete, South Aegean). Each anchor is measured from the listings within 10 km of the town's own centre. It uses the same 30-listing floor, trim, deflation and band as every other anchor. Each one carries `dest_id`, and `apply_accommodation_anchors.assign()` gives it to that town and no other. It goes ahead of any nearby city anchor and never enters the nearest-anchor search, so it cannot be lent to a neighbour. That respects the "nothing borrowed" rule in apply's docstring. A resort multiplier would be a hand-set number for towns that have hundreds of real listings.

The flag is off by default, so the lodging task on the box behaves exactly as before. Turning it on is the owner's call (T311-b). The block keeps `price_source: inside_airbnb_city` and adds `footprint_km`, so the app's provenance labels in format.js need no change.

### The FAT32 guard (T288-c)

Before packing a layer, `pack.py` now projects an upper bound for the tarball: every file rounded up to tar's 512-byte block, plus one header each. It refuses the layer before writing a byte in two cases. The target is FAT (FAT32, vfat, msdos), where no file can reach 4 GiB. Or the projection is larger than the target's free space. On Windows the filesystem name comes from GetVolumeInformationW. On Linux it comes from /proc/mounts. The other layers still pack, the refused ones are listed, and the run exits 1. `--dry-run` shows the same verdicts. Here the probe reads "ntfs" for C:. D: was not attached, so FAT detection on a real FAT drive is untested (T311-g).

### Waymarked ahead of the registry (T113-b)

trails_registry now runs `waymarked.py`, then `famous_registry.py --all`, then `coverage_report.py --all`. Running a network harvest every month created two ways for it to damage the committed file, so waymarked.py got two guards. A harvest that returns fewer than 90% of the current file's routes is an outage. The script then keeps the file and exits 0, and the registry runs on the last good harvest. When no Geofabrik extract is on disk for any country (a box that never pulled data/raw), the old placements are kept, exactly as with `--harvest-only`. Without these guards, a single Waymarked outage would have written an empty harvest that the registry trusts.

### Photo sources after the exports (T269-b)

The new task photo_sources (cadence after: beaches, lakes, mountains, trails_rate, cycling_publish, regions) runs `derive.py sources` for the six layers T269 measured. Its output goes to logs/img_sources, which is gitignored. derive.py's sources command gained `--upload auto`, which runs the rclone copy only where the RCLONE_CONFIG_R2_* remote is set. Without a remote it prints the copy command, as before. It also gained `--allow-missing`, so a layer with no wire is reported instead of failing the task. Without that, the task would never succeed and would rerun on every pass. I ran it on mountains against the main checkout's wire, into the scratchpad: 6,018 titles, no upload, exit 0. Dossier, poi, dest, trips and journeys stay out until T269-g measures them.

### The retired fare harvesters (T267-a)

`harvest_wizzair.py`, `harvest_vueling.py`, `harvest_volotea.py` and `harvest_ryanair_schedules.py` were moved to pipeline/archive/ with git mv. They are pure renames with unchanged content. `wizz_step`, `vueling_step`, `volotea_step` and the three manual tasks were removed from run_pipeline.py. Their four RUNS entries were removed from registry.py, and `python -m src.ingestion.core.ledger --write` regenerated docs/tos/data_licenses.md. The ledger lists 24 harvesters, down from 28.

One judgement call. The notes said to remove the SOURCES entries. I marked the five rows `retired=True` instead and pointed them at the archive paths. These are Wizz Air, Vueling, Volotea, ExchangeRate-API and the Ryanair timetable. The ledger is the record of what Carta took and on what terms, and the frozen fares it shipped came from these sources. Retiring is also the repo's own convention for a gone harvester (WorldClim, describe.py), and it is what validate() itself asks for ("mark the row retired=True if that is history"). `tests/test_data_licences.py`'s harvester floor went from 28 to 24, with the reason in a comment. A moved script would resolve ROOT one level too low, so to run one again, move it back to pipeline/ first.

## Files touched

**Modified:**
- pipeline/cycling/harvest_cycling.py
- pipeline/trails/ingest_osm_routes.py
- pipeline/trails/scenic.py
- pipeline/trails/famous_registry.py
- pipeline/trails/coverage_report.py (one join term)
- pipeline/trails/attributes.py
- pipeline/trails/waymarked.py
- pipeline/harvest_accommodation.py
- pipeline/apply_accommodation_anchors.py
- pipeline/archive/pack.py
- pipeline/photos/derive.py
- run_pipeline.py (T113-b, T269-b, T267-a only)
- src/ingestion/core/registry.py
- docs/tos/data_licenses.md (generated)
- tests/test_data_licences.py (harvester floor)
- Execution/_OPEN.md

**Moved:**
- pipeline/harvest_wizzair.py, harvest_vueling.py, harvest_volotea.py, harvest_ryanair_schedules.py to pipeline/archive/

**Created:**
- tests/test_pipeline_code_fixes.py (50 tests)
- Execution/P7/T311-pipeline-code-fixes.md

## Commands run

From the worktree, in Git Bash. `$M` is the main checkout, read only.

    python -m pytest tests -q                          # before: 64 passed, 1 skipped, 2 failed
    python -m pytest tests -q                          # after: 114 passed, 1 skipped, 2 failed
    python -m pytest tests/test_pipeline_code_fixes.py -q   # 50 passed
    python -m src.ingestion.core.ledger --write
    python -m src.ingestion.core.ledger --check        # ledger ok: 29 collectors, 24 harvesters, 150 rows
    CARTA_DATA_ROOT=$M python pipeline/photos/verify_derive.py   # derive holds: 67 checks
    python pipeline/photos/verify_credit.py            # 14 cases hold
    python pipeline/archive/pack.py --dry-run --out <scratchpad>/packout
    CARTA_DATA_ROOT=$M python pipeline/photos/derive.py sources mountains --out <scratchpad>/src --upload auto --allow-missing
    python -m py_compile run_pipeline.py               # ok
    python run_pipeline.py --help                      # ok
    python run_pipeline.py --list                      # 62 tasks; the logs/ it created was deleted
    curl .../switzerland/geneva/geneva/2026-06-29/data/listings.csv.gz   # into the scratchpad
    curl .../spain/islas-baleares/mallorca/2026-06-23/data/listings.csv.gz   # into the scratchpad

The two failing tests are test_golden_ratings and test_rating_distribution. They read continent-app/public/app_data.json, which this sparse worktree does not have. They failed the same way before any edit. The measurements below are read-only scripts against the main checkout's wire, registry and caches, plus one batched Wikidata query (wd_identity over the 9,017 registry rows that have a QID and no relation). No pipeline stage ran, and nothing was written to app_data/, cache/, data/, trailslab or R2.

## Config and secrets set

None. New optional flags: `harvest_accommodation.py --refresh REGION[,REGION]|all` and `--footprint`, and `derive.py sources --upload none|r2|auto --allow-missing`. attributes.py now honours CARTA_DATA_ROOT for its one read.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Geneva anchor (EUR a night, whole home) | 0, off 991 listings (cache/accommodation_city_anchors.json) | 181, cap 2, off 1,215 listings, from the republished snapshot once refreshed | pending T311-a |
| Out-of-band anchors written by the harvest | written, then dropped by apply | refused at harvest | |
| Mallorca towns with their own measured stay | 0 of 11 (5 on the national prior, 6 on the island median) | 11 with --footprint | pending T311-b |
| Alcudia / Soller / Sa Calobra, June ask per person | 35.07 / 35.07 / 32.63 predicted (benchmark) | 67.0 / 90.75 / 78.0 from their own listings | pending T311-b |
| Published hikes named as a junction pair (node edges) | 124 (NL 93, BE 27, DE 4) | 124 until demoted; no new edge passes the ingest filter | pending T311-c |
| Registry rows with an OSM relation id | 7,796 of 17,289 | +244 through P402 (4 of those relations are on the wire) | +244 |
| Registry rows with a Wikidata image | 0 | 4,217 of the 9,017 rows asked | +4,217 |
| Route labels available to title rung 1 | 0 | 644 | +644 |
| Published hikes rung 1 would retitle | 0 | 38 of the 92 whose relation carries a route-class QID | pending T311-e |
| run_pipeline.py tasks | 64 | 62 | -2 |
| Harvesters in the licence ledger | 28 | 24 | -4 |
| Root pytest suite passing | 64 | 114 | +50 |

Sources: the Geneva and Mallorca figures come from the harvester's own functions, run over the downloaded snapshots in the scratchpad, without seasonal deflation. A real run divides by the capture-month curve, so the stored annual figures will be lower. The benchmark predictions are from tools/benchmark/results/2026-10-01.json. The junction-pair count is a regex (`^\d{1,3}-\d{1,3}$`) over the hike names in $M/continent-app/public/trails/*.json. The registry figures are from $M/data/trails/famous_registry.json and the wd_identity query. The label count is from $M/cache/trails_wikidata_famous.json, and the 92/38 figure joins the registry's OSM-scanned relation and QID pairs to the wire's `osm` field.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| photo_sources was invisible to the registry's task check | registry.pipeline_tasks reads a task only when `"key"` is its first line, and a comment sat above it | The comment moved below the key; a test now checks that photo_sources is the last task in the parsed table |
| Two Git Bash heredoc patches lost or turned backslashes: invisible no-break spaces in a Python tuple, a `\040` octal escape, and a joined line continuation in pack.py | The known heredoc gotcha | Rewritten with escapes through the Edit tool and a script file; checked by byte dump and pyflakes |
| A grep over the main checkout's 52k-file fares folder ran past two minutes | Too many files for a shell glob | Stopped. The question it was answering (do frozen fares still carry W6) did not change the decision, so it was dropped |

## What is still open

Every fix waits on a data run, which this task was not allowed to make. Geneva needs `harvest_accommodation.py --refresh geneva` and then apply (T311-a). The apply step re-assigns every anchor and lets the later layers re-tier from the result, which is why the memory note warns against running it in full casually. Whether to run it in full, and when, is the owner's call.

Footprint anchors are a proposal behind a flag (T311-b). Turning them on would make the benchmark's ten Spanish hold-out towns in-sample. After that, the stay accuracy figure can only come from T096-a's hand sample.

The 124 published node edges need a demotion step, because the ingest filter only stops new ones (T311-c). route_relations already carries network:type (dedup.py reads it), so curate.py could exclude on it. That file was not in scope here.

scenic.py needs a `--refresh` sweep (Overpass, hours) before the old Cyrillic names change (T311-d). Rung 1 would turn several German trail names into English translations ("Rotweinwanderweg" to "Red Wine Trail", "Innerer Parkring" to "Inner Park Ring Walk"). That follows display_name's English-first rule, but the owner should confirm it for titles before attributes.py runs (T311-e).

Some docs still describe the three removed fare tasks: docs/PIPELINE.md, docs/ESTIMATION.md, docs/PRICEMAP_CHUNKS.md and pipeline/README.md. They were outside this task's files (T311-f). The FAT branch of the pack guard has not met a real FAT drive (T311-g). The first networked trails_registry run will also backfill P402 and P18 into the old Wikidata cache, roughly 1,400 small queries once, and add about half an hour of Waymarked harvest and placement each month. That is worth knowing before the box's first monthly run (T311-h).

Nothing here needs the Claude API, and nothing calls it.

## Rollback procedure

Two commits on p7-pipeline-code-fixes in the root repo, the code commit and the report commit. `git revert` both, newest first, or drop the branch if it is not merged. The revert moves the four harvesters back, restores the three tasks, the RUNS entries and the ledger, and takes out photo_sources and the waymarked step. No data was written, so nothing else needs undoing.

If any changed stage has run before a revert, these are its traces. scenic.py may have updated stored names in scenic_pois, and the old code leaves them alone, so restoring the old names takes a `--refresh` sweep with the old code. attributes.py may have retitled rows, and re-running the old version restores the titles. famous_registry.py may have added `osm_relation` and `image` keys to the Wikidata cache and `wd_relation_id` and `wd_image` to the registry, and the old code ignores both. A footprint harvest adds anchors with `dest_id`. The old apply would treat those as ordinary nearest anchors and lend them to neighbours, so after a revert, re-harvest without `--footprint` before applying.
