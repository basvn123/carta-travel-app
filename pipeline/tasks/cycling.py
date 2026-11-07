"""The cycling layer (pipeline/cycling, same lab): soft and guarded.

Part of the task registry (pipeline/tasks/__init__.py, ROADMAP A2, T1207).
List order is run order; run_pipeline.py runs the domains in DOMAINS order."""

from pipeline.tasks._base import PY, guard_brouter_up, guard_trailslab_up

TASKS = [

    # ---- cycling layer (pipeline/cycling, same lab): soft + guarded ---- #
    #
    # Deliberately the same shape as the trails chain above, because it is the
    # same lab and the same failure modes. Two things differ and both are
    # about not repeating an afternoon that was already paid for once:
    #
    #   the harvest is QUARTERLY and reuses the cached Geofabrik extracts
    #   rather than re-downloading them. trails_ingest already pays the
    #   multi-GB download on its own quarterly tick, and running two extract
    #   passes at once is what put this Postgres into crash recovery on
    #   2026-08-30.
    #
    #   the splice runs BEFORE enrich and again with --sync-only after it.
    #   Not optional either time: services attached before the splice measure
    #   position along a discontinuous line and come back without one, and
    #   elevation measures the ORIGINAL relation, so a spliced route would
    #   otherwise state a length shorter than the line it ships.
    {
        "key": "cycling_harvest",
        "title": "Cycling: OSM route=bicycle relations -> cycle_routes",
        "cadence": "quarterly",
        "writes_app_data": False,
        "soft": True,
        "guard": guard_trailslab_up,
        "cmds": [[PY, "pipeline/cycling/harvest_cycling.py"],
                 [PY, "pipeline/cycling/splice_cycling.py"]],
        "note": ("reads the cached per-country .osm.pbf that trails_ingest "
                 "already downloads, so this adds a long pyosmium pass and no "
                 "bandwidth. Separates node-network connections from real "
                 "routes (Belgium is 11,693 of the former against 1,298 of "
                 "the latter) and keeps per-way surface tags positioned along "
                 "the line, which is what every later surface and safety "
                 "figure is measured from. Triggers cycling_enrich."),
    },
    {
        "key": "cycling_enrich",
        "title": "Cycling: regions, elevation, surface, safety, services, scenic",
        "cadence": "after",
        "after": ["cycling_harvest"],
        "writes_app_data": False,
        "soft": True,
        "guard": guard_trailslab_up,
        "cmds": [[PY, "pipeline/cycling/cycle_sources.py", "--reference"],
                 [PY, "pipeline/cycling/enrich_cycling.py", "--countries",
                  "AL,AD,AT,BE,BA,BG,HR,CY,CZ,DK,EE,FI,FR,DE,GB,GR,HU,IS,IE,IT,"
             "XK,LV,LI,LT,LU,MK,MT,MD,MC,ME,NL,NO,PL,PT,RO,RS,SK,SI,ES,SE,"
             "CH,SM,FO"],
                 [PY, "pipeline/cycling/splice_cycling.py", "--sync-only"]],
        "note": ("the reference step mirrors Natura 2000, Emerald and the EEA "
                 "coastline into the lab; without them the scenic score drops "
                 "its protection and coast components and renormalises rather "
                 "than scoring a zero nobody earned. Elevation goes through "
                 "the trails sampler, so the Swiss-calibrated smoothing is "
                 "literally the same code and a canal towpath cannot grow "
                 "fake metres here that it does not have on the hiking side."),
    },
    {
        "key": "cycling_photos",
        "title": "Cycling: Commons and Geograph, anchored on the route line",
        "cadence": "after",
        "after": ["cycling_enrich"],
        "writes_app_data": False,
        "soft": True,
        "guard": guard_trailslab_up,
        "cmds": [[PY, "pipeline/cycling/cycle_images.py", "--countries",
                  "AL,AD,AT,BE,BA,BG,HR,CY,CZ,DK,EE,FI,FR,DE,GB,GR,HU,IS,IE,IT,"
             "XK,LV,LI,LT,LU,MK,MT,MD,MC,ME,NL,NO,PL,PT,RO,RS,SK,SI,ES,SE,"
             "CH,SM,FO"],
                 [PY, "pipeline/cycling/harvest_cycling.py", "--crosscheck"]],
        "note": ("politely paced against Commons, and it records the EMPTY "
                 "answers as well as the hits, so a re-run does not spend its "
                 "first hour re-asking about the anonymous regional loops that "
                 "have no free photograph. The crosscheck after it downloads "
                 "the EuroVelo GPX and the national portals and measures what "
                 "share of each OSM line the official source also draws."),
    },
    {
        "key": "cycling_bridge",
        "title": "Cycling: route across the real breaks with BRouter",
        "cadence": "after",
        "after": ["cycling_enrich"],
        "writes_app_data": False,
        "soft": True,
        "guard": guard_brouter_up,
        # GB only for now: it is the country whose tour candidates fail on
        # continuity (95 of 103), and the only one with segment tiles staged.
        # Elevation, surface, safety and services are re-run afterwards
        # because a bridged route is a different line: the elevation step
        # re-samples by geometry md5, the others read the extended way_spans.
        "cmds": [[PY, "pipeline/cycling/bridge_gaps.py", "--countries", "GB",
                  "--min-km", "100"],
                 [PY, "pipeline/cycling/enrich_cycling.py", "--steps",
                  "elevation,surface,safety,services", "--countries", "GB"]],
        "note": ("splice_cycling joins breaks up to 300 m with a straight "
                 "line; this routes across the longer ones, the house touring "
                 "profile first and the ferry-aware trekking profile second, "
                 "and refuses a route where the routed bridges would be over "
                 "a quarter of it. The bridges are recorded in cycle_repairs "
                 "and shipped in the route file's osm.repair block."),
    },
    {
        "key": "cycling_publish",
        "title": "Cycling: rate, compose tours, ten hard checks, publish",
        "cadence": "after",
        "after": ["cycling_enrich", "cycling_bridge"],
        "writes_app_data": False,
        "soft": True,
        "guard": guard_trailslab_up,
        "cmds": [[PY, "pipeline/cycling/seed_bike_rail.py"],
                 [PY, "pipeline/cycling/cycle_index.py"],
                 [PY, "pipeline/cycling/stage_planner.py"],
                 [PY, "pipeline/cycling/validate_cycling.py"],
                 [PY, "pipeline/cycling/export_cycling.py"]],
        "note": ("last in the chain because the rating reads every earlier "
                 "pass and the stage planner reads the rating. Tours are "
                 "composed HERE, at build time, never at request time, and "
                 "each faces ten hard checks before the export writes "
                 "anything; a tour that fails one is not published and the "
                 "previous wire stands."),
    },
]
