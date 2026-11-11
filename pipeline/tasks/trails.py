"""The trails content lab chain (tools/trailslab, local PostGIS): soft and guarded.

Part of the task registry (pipeline/tasks/__init__.py, ROADMAP A2, T1207).
List order is run order; run_pipeline.py runs the domains in DOMAINS order."""

from pipeline.tasks._base import (
    PY,
    guard_trails_route_bridge,
    guard_trailslab_up,
    log,
    run_cmd,
)

# A --dry-run probe has to stay fast enough to sit in front of every plan, so
# the validation half runs on a sample. The regression half always runs whole:
# it only reads the published set, which is small by construction.
TRAILS_DRY_LIMIT = 2000


def trails_validate_step(ctx):
    """Score every staged trip, then police the published set.

    validate.py routes drafts by threshold and never touches a status a human
    set, so on its own it would refresh a published trip's quality_score and do
    nothing about a collapse. regression.py closes that: below the review
    threshold a published trip is demoted to needs_review and reopened in the
    review queue (both ledgers get a row), never unpublished and never deleted,
    and the outcome lands in data/derived/trails_freshness.json which the
    freshness report folds in."""
    if run_cmd([PY, "pipeline/trails/validate.py"]) != 0:
        return False
    return run_cmd([PY, "pipeline/trails/regression.py", "--verbose"]) == 0


def trails_validate_dry(ctx):
    """The read-only half of the task, for --dry-run: a sampled validation pass
    against the staging DB (nothing written, no status moved) plus the FULL
    regression detection, so the plan can say which published trips a real run
    would demote before it demotes them."""
    log(f"  dry-run probe: validating a sample of {TRAILS_DRY_LIMIT} staged "
        "trips (a real run validates all of them)")
    if run_cmd([PY, "pipeline/trails/validate.py", "--dry-run",
                "--limit", str(TRAILS_DRY_LIMIT), "--top", "5"]) != 0:
        return False
    return run_cmd([PY, "pipeline/trails/regression.py",
                    "--dry-run", "--verbose"]) == 0




TASKS = [
    # ---- trails content lab (tools/trailslab, local PostGIS): soft + guarded ---- #
    {
        "key": "trails_ingest",
        "title": "Trails: OSM hiking relations -> trailslab staging",
        "cadence": "quarterly",
        "writes_app_data": False,
        "soft": True,
        "guard": guard_trailslab_up,
        "cmds": [[PY, "pipeline/trails/ingest_osm_routes.py", "--refresh"]],
        "note": ("re-downloads the Geofabrik per-country extracts (--refresh; "
                 "without it the cached .pbf is re-ingested and nothing moves) "
                 "and upserts on (source, source_ref), so re-ingesting edits "
                 "trips in place instead of duplicating them. Multi-GB "
                 "downloads and a long pyosmium pass: quarterly on purpose. "
                 "Triggers trails_elevation and trails_validate."),
    },
    {
        "key": "trails_elevation",
        "title": "Trails: Copernicus GLO-30 elevation, distance + duration",
        "cadence": "after",
        "after": ["trails_ingest"],
        "writes_app_data": False,
        "soft": True,
        "guard": guard_trailslab_up,
        "cmds": [[PY, "pipeline/trails/elevation.py",
                  "--countries",
                  "AL,AD,AT,BE,BA,BG,HR,CY,CZ,DK,EE,FI,FR,DE,GB,GR,HU,IS,IE,IT,"
                  "XK,LV,LI,LT,LU,MK,MT,MD,MC,ME,NL,NO,PL,PT,RO,RS,SK,SI,ES,SE,"
                  "CH,SM,FO",
                  "--curated", "--evict-gb", "4"],
                 [PY, "pipeline/trails/splice.py", "--sync-only"]],
        "note": ("geometry-change driven twice over: the task is due after an "
                 "ingest, and the script itself only samples trips whose "
                 "elevation is missing or whose 2D geometry hash moved, so an "
                 "ingest that changed nothing costs one query. --curated keeps "
                 "it to what trails_curate approved: sampling all ~236k staged "
                 "relations would pull most of Europe's DEM for routes nobody "
                 "can open. --evict-gb 4 bounds what the run leaves in "
                 "data/raw/dem, which already holds 15.6 GB for the four pilot "
                 "countries and would otherwise fill the disk. The splice "
                 "--sync-only step after it is not optional: this pass "
                 "measures the ORIGINAL relation, so a spliced trip would "
                 "otherwise state a length shorter than the line it ships."),
    },
    {
        "key": "trails_validate",
        "title": "Trails: validation engine + published-content regression gate",
        "cadence": "after",
        "after": ["trails_ingest", "trails_elevation"],
        "writes_app_data": False,
        "soft": True,
        "guard": guard_trailslab_up,
        "run": trails_validate_step,
        "dry_run": trails_validate_dry,
        "note": ("five checks -> quality_score, drafts routed by threshold "
                 "(approve stays human-only), then the regression gate demotes "
                 "published trips that fell below the review threshold to "
                 "needs_review and reports them under \"trails\" in the "
                 "freshness report. Nothing is ever unpublished or deleted. "
                 "--dry-run runs both halves read-only against staging."),
    },
    # trails_describe is RETIRED, not disabled. pipeline/trails/describe.py
    # composed prose from the same numbers the facts row prints, in a script's
    # voice, and TrailPage stopped reading it: lib/trailStory.js composes every
    # line from structured fields instead. It kept exactly three things the
    # fields did not know, and attributes.py now promotes all three into the
    # wire as fields (waymark_ref, passes, publisher). Keeping the task alive
    # would have meant a monthly job spending free-tier quota for three
    # strings. See docs/TRAILS.md, "Two debts, closed".
    {
        "key": "trails_popularity",
        "title": "Trails: popularity + curation shortlists (data/reports/trails_seed)",
        "cadence": "monthly",
        "writes_app_data": False,
        "soft": True,
        "guard": guard_trailslab_up,
        "cmds": [[PY, "pipeline/trails/popularity.py"]],
        "note": ("fame is a rolling average, so monthly is plenty; also folds "
                 "in the newest quality and portal signals, which is why it "
                 "sits after trails_validate in this list. Writes a "
                 "curation_rank row per trip for the review queue's ordering."),
    },
    {
        "key": "trails_registry",
        "title": "Trails: famous-trail registry + coverage report "
                 "(data/trails/famous_registry.json)",
        "cadence": "monthly",
        "writes_app_data": False,
        "soft": True,
        # waymarked.py first (T113-b): the registry merges its harvest as the
        # fifth evidence source, and without this step the monthly build read
        # a harvest that only went stale. On an outage or with no extracts on
        # disk it keeps the current file and exits 0, so the registry still
        # runs on the last good harvest.
        "cmds": [[PY, "pipeline/trails/waymarked.py"],
                 [PY, "pipeline/trails/famous_registry.py", "--all"],
                 [PY, "pipeline/trails/coverage_report.py", "--all"]],
        "note": ("what SHOULD be published per region, from Wikidata, "
                 "pageviews, OSM fame tags on WAYS as well as relations, and "
                 "the national portals, scored and matched against the "
                 "published wire. The answer to 'did we get the famous ones', "
                 "which curate.FAMOUS could not give: a per-country needle "
                 "list matches only rows already in the pool, so it cannot "
                 "see what was never ingested. NO trailslab guard on purpose, "
                 "both steps read the extracts and the wire, so the report "
                 "still runs when the lab is down. Monthly because fame is a "
                 "rolling average. Not strict here: the report is committed "
                 "and read, and the build-failing form is "
                 "coverage_report.py --strict, run deliberately."),
    },
    {
        "key": "trails_splice",
        "title": "Trails: bridge the short breaks in otherwise whole relations",
        "cadence": "monthly",
        "writes_app_data": False,
        "soft": True,
        "guard": guard_trailslab_up,
        "cmds": [[PY, "pipeline/trails/splice.py"]],
        "note": ("joins parts separated only by breaks short enough to be "
                 "mapping artefacts (every gap under 300 m, at most 8, under "
                 "750 m in total) and stores the joined line in trip_repairs, "
                 "so the continuity gate can pass a route whose relation lost "
                 "a ten metre connector at a road crossing. Recovered ~10,000 "
                 "routes including the Walker's Haute Route, which was being "
                 "refused over a SEVEN metre break. Runs before trails_curate, "
                 "which is what decides whether a recovered route earns a "
                 "place. Anything with a real gap stays out."),
    },
    {
        "key": "trails_route_bridge",
        "title": "Trails: route the longer breaks on foot paths (D24)",
        "cadence": "after",
        "after": ["trails_splice"],
        "writes_app_data": False,
        "soft": True,
        "guard": guard_trails_route_bridge,
        "cmds": [[PY, "pipeline/trails/route_bridge.py"],
                 [PY, "pipeline/trails/splice.py", "--sync-only"]],
        "note": ("T1183, behind CARTA_TRAILS_ROUTE_BRIDGE=1. Takes what both "
                 "splice passes left and routes each break up to 2 km with "
                 "BRouter's hiking-mountain profile, keeping relation order. "
                 "A route is repaired only when every break closes: bridge at "
                 "most 3x its gap plus 200 m and 3 km, 80% on paths, nothing "
                 "on motorway, trunk or ferry, at most 8 bridges, 5 km and 10% "
                 "of the route. Every refusal is kept in validation_runs "
                 "(route_bridge) and data/reports/trails_route_bridge.json. "
                 "Runs before trails_curate, which decides what is published."),
    },
    {
        "key": "trails_regionize",
        "title": "Trails: region ids on every staged route",
        "cadence": "after",
        "after": ["trails_ingest"],
        "writes_app_data": False,
        "soft": True,
        "guard": guard_trailslab_up,
        "cmds": [[PY, "pipeline/trails/regionize.py", "--all"]],
        "note": ("stamps rg, nuts3 and region_crosses onto all ~236k staged "
                 "routes, which is what lets trails_curate spend a quota per "
                 "NUTS3 region instead of a flat 150 per country. Must run "
                 "BEFORE trails_curate: the gate groups by the column this "
                 "writes. Batched per country (one query over the whole pool "
                 "killed the server twice) and skips rows it has already "
                 "placed, so a re-run after an ingest only costs the new "
                 "relations."),
    },
    {
        "key": "trails_derive_routes",
        "title": "Trails: routes built from way-level paths (MD, XK, MK, MT, AL)",
        "cadence": "quarterly",
        "writes_app_data": False,
        "soft": True,
        "guard": guard_trailslab_up,
        # --fresh-days 14 (T1223): a rerun after a crash skips the countries
        # it already finished; a quarter later they all run again. Each
        # country runs in its own child process and prints its peak memory.
        "cmds": [[PY, "pipeline/trails/derive_routes.py", "--fresh-days", "14"]],
        "note": ("five countries have paths on the ground and almost no "
                 "type=route relations, so the relation ingest reads almost "
                 "nothing there and Moldova published 3 walks. This clusters "
                 "connected named or graded paths out of the same Geofabrik "
                 "extracts and stages them as needs_review with "
                 "derived_route = true, to face the same continuity gate and "
                 "the same quotas as everything else. Quarterly, because it "
                 "reads the extracts the ingest downloads; a derived route "
                 "that overlaps a real relation is rejected, so this stops "
                 "finding new work as those countries start mapping routes."),
    },
    {
        "key": "trails_hierarchy",
        "title": "Routes: relation graph, hierarchy and co-located lines",
        "cadence": "after",
        "after": ["trails_ingest", "cycling_harvest"],
        "writes_app_data": False,
        "soft": True,
        "guard": guard_trailslab_up,
        "cmds": [
            [PY, "pipeline/trails/hierarchy.py", "--scan", "--classify",
             "--stitch-report"],
            [PY, "pipeline/trails/dedup.py"],
        ],
        "note": ("ROUTES.md R2 and R3. One relations-only pass over the cached "
                 "extracts (four minutes for Europe) fills route_relations with "
                 "every tag, the ordered member list and the parent/child refs "
                 "the ingest throws away; classify turns that into parent / "
                 "stage / variant / standalone plus stage_of and top_of, copied "
                 "onto trips AND cycle_routes; dedup.py writes co_located where "
                 "two relations of comparable length share one line. Must run "
                 "BEFORE trails_curate: the family collapse reads top_of and "
                 "co_located as its first keys. Touches the two store tables "
                 "only where a value changes, because the updated_at trigger "
                 "fires on any UPDATE."),
    },
    {
        "key": "trails_curate",
        "title": "Trails: per-region quota, loop-first, continuity gated",
        "cadence": "after",
        "after": ["trails_splice", "trails_route_bridge", "trails_regionize",
                  "trails_hierarchy"],
        "writes_app_data": False,
        "soft": True,
        "guard": guard_trailslab_up,
        "cmds": [[PY, "pipeline/trails/curate.py"]],
        "note": ("spends a quota per NUTS3 region (pipeline/regions/quotas.py) "
                 "out of the ~236k staged, so a country's count is the sum of "
                 "its regions rather than a constant: "
                 "hard continuity gate (one merged segment, zero gaps, so no "
                 "published GPX can teleport), route families collapsed to "
                 "one slot, loops filled first, then distance-band quotas, "
                 "with the country's famous routes guaranteed a share. "
                 "Demotes anything published that no longer survives "
                 "re-selection. Runs after trails_popularity, whose rank it "
                 "reads. Re-run it whenever the ingest brings new relations."),
    },
    {
        "key": "trails_forests",
        "title": "Trails: named forest areas from the extracts",
        "cadence": "quarterly",
        "writes_app_data": False,
        "soft": True,
        "guard": guard_trailslab_up,
        "cmds": [[PY, "pipeline/trails/forests.py"]],
        "note": ("the tenth highlight code, and the only one that is an AREA "
                 "rather than a point: 'does this walk go through the Forest "
                 "of Dean' cannot be asked of a centroid, whose answer is "
                 "wrong in both directions for anything large. Reads the "
                 "Geofabrik extracts already on disk rather than Overpass, "
                 "because named woods over a 1.5 degree cell took the sweep "
                 "from 2,215 to 12,246 features per cell and Europe from an "
                 "hour to thirteen, with both mirrors 504ing. Quarterly with "
                 "the extracts; skips countries already stored, so an "
                 "interrupted run resumes for free. Must run before "
                 "trails_scenic, whose link step reads the table."),
    },
    {
        "key": "trails_scenic",
        "title": "Trails: scenic landmarks along the curated routes (Overpass)",
        "cadence": "after",
        "after": ["trails_curate", "trails_forests"],
        "writes_app_data": False,
        "soft": True,
        "guard": guard_trailslab_up,
        "cmds": [[PY, "pipeline/trails/scenic.py"]],
        "note": ("one Overpass sweep per 1.5 degree cell the curated routes "
                 "touch, deduped across countries, then a spatial join that "
                 "writes each route's highlight list and its scenic density. "
                 "Cells are cached on disk, so a re-run after a curation pass "
                 "only fetches the cells the new routes reach. Probes the "
                 "mirrors first and skips the dead ones."),
    },
    {
        "key": "trails_images",
        "title": "Trails: Commons photographs taken on the route",
        "cadence": "after",
        "after": ["trails_curate", "trails_scenic"],
        "writes_app_data": False,
        "soft": True,
        "guard": guard_trailslab_up,
        "cmds": [[PY, "pipeline/trails/trail_images.py"]],
        "note": ("geosearches Commons at points along each route and at the "
                 "landmarks scenic.py found, keeps only frames shot within "
                 "400 m of the line, and ranks a hero plus a gallery spread "
                 "ALONG the walk. Skips routes that already have photographs, "
                 "so it resumes for free. This is what stopped trail cards "
                 "borrowing the nearest town's hero image."),
    },
    {
        "key": "trails_way_tags",
        "title": "Trails: member way tags (grade, surface, access)",
        "cadence": "after",
        "after": ["trails_curate"],
        "writes_app_data": False,
        "soft": True,
        "guard": guard_trailslab_up,
        "cmds": [[PY, "pipeline/trails/way_tags.py"]],
        "note": ("a fourth pass over the Geofabrik extracts already on disk, "
                 "for what the route RELATIONS never carried: sac_scale, "
                 "trail_visibility, via_ferrata_scale, surface, smoothness, "
                 "wheelchair and dog live on the member WAYS, and the ingest "
                 "read node refs and threw the tags away. Reduced to "
                 "length-weighted shares per route, because a route is fifty "
                 "20 m ways through a village and two 3 km ways over the "
                 "pass. Skips routes that already have a summary, so it "
                 "resumes for free."),
    },
    {
        "key": "trails_attributes",
        "title": "Trails: the six published filters",
        "cadence": "after",
        "after": ["trails_curate", "trails_scenic", "trails_way_tags"],
        "writes_app_data": False,
        "soft": True,
        "guard": guard_trailslab_up,
        "cmds": [[PY, "pipeline/trails/attributes.py"]],
        "note": ("difficulty (worst member way segment wins, DEM where "
                 "nothing is tagged), route type, highlight codes and "
                 "suitability, plus the surface term rate.py reads, the "
                 "season estimate and the three facts the retired describe.py "
                 "knew that the fields did not. Tagged and derived claims "
                 "never merge and wheelchair is never derived. Must run "
                 "before trails_rate, which reads the surface term."),
    },
    {
        "key": "trails_rate",
        "title": "Trails: published 0-10 rating and its reason codes",
        "cadence": "after",
        "after": ["trails_curate", "trails_scenic", "trails_images",
                  "trails_attributes"],
        "writes_app_data": False,
        "soft": True,
        "guard": guard_trailslab_up,
        "cmds": [
            [PY, "pipeline/trails/rate.py"],
            [PY, "pipeline/trails/export_wire.py", "--countries",
             "AL,AD,AT,BE,BA,BG,HR,CY,CZ,DK,EE,FI,FR,DE,GB,GR,HU,IS,IE,IT,"
             "XK,LV,LI,LT,LU,MK,MT,MD,MC,ME,NL,NO,PL,PT,RO,RS,SK,SI,ES,SE,"
             "CH,SM,FO"],
        ],
        "note": ("last in the chain, because the rating reads every earlier "
                 "pass: scenic density, DEM relief, photograph count, "
                 "designation, prominence and loop shape, each converted to "
                 "its WITHIN-COUNTRY percentile so a Dutch walk is ranked "
                 "against Dutch walks. Exports straight after, since the wire "
                 "order is the rating order the app renders."),
    },
    {
        # T1201 (row T1179-b): the T1179 summaries rebuilt from the wire the
        # export just wrote, so data/trails/summaries.json never lags the
        # wire (the staleness of row T1179-e). Reads the wire only, no lab.
        # How the summaries then reach travellers waits on the owner's choice
        # (row T1179-a): English `summary` on the wire, or `parts` through t().
        "key": "trails_summaries",
        "title": "Trails: fact-checked summaries for the top band (T1179)",
        "cadence": "after",
        "after": ["trails_rate"],
        "writes_app_data": False,
        "soft": True,
        "cmds": [[PY, "pipeline/trails/summaries.py"]],
        "note": ("templates over the wire's own facts, each checked before it "
                 "is written (summaries.check: closed vocabulary, figures from "
                 "the facts, house rules); writes data/trails/summaries.json and "
                 "data/reports/trails_summaries.json, which the D2 text checks "
                 "re-read (scripts/quality/rules.yaml text_checks)."),
    },
]
