"""POIs: activities, Overture, must-see descriptions, POI images (backfill).

Part of the task registry (pipeline/tasks/__init__.py, ROADMAP A2, T1207).
List order is run order; run_pipeline.py runs the domains in DOMAINS order."""

from pipeline.tasks._base import PY, guard_cache_covers

TASKS = [
    {
        "key": "activities",
        "title": "POIs / attractions (OpenTripMap+Wikivoyage+Wikipedia)",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [
            [PY, "pipeline/harvest_activities.py", "harvest"],
            [PY, "pipeline/harvest_activities.py", "patch"],
        ],
        "guard": guard_cache_covers("cache/activities.json", 0.95),
        "note": "NULL-RISK: patch nulls activities for dests absent from the cache - guarded.",
    },
    {
        "key": "overture",
        "title": "Overture Maps sightseeing POIs -> items_full (additive)",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [[PY, "pipeline/pois/harvest_pois_overture.py", "assign"]],
        "note": ("merges the cached Overture parquet (cache/overture_pois_eu.parquet) "
                 "into items_full, cap 150/dest, rate<=2; additive (never nulls). "
                 "Re-run `harvest_pois_overture.py extract` first only to pull a "
                 "newer Overture release (edit RELEASE). Run BEFORE poi_enrich."),
    },
    {
        "key": "must_descs",
        "title": "Must-see POI images + descriptions (high-value subset only)",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [[PY, "pipeline/pois/enrich_must_descs.py"]],
        "note": ("enriches ONLY the day-planner-surfaced must-see + worth-the-detour "
                 "POIs (a few thousand), not the 87k long tail; cheap, additive, "
                 "resumable. Prefer this over poi_enrich when you only want the "
                 "high-value image/description gap filled."),
    },
    {
        "key": "poi_images_wikidata",
        "title": "Bulk POI images via Wikidata P18 (fast)",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [[PY, "pipeline/pois/harvest_pois_wikidata_images.py", "all"]],
        "note": ("one WDQS box query per dest (~1,500) then match image-less POIs "
                 "to nearby imaged Wikidata entities by distance + Commons filename. "
                 "FAR faster than the per-POI Commons sweep - run this FIRST, then "
                 "poi_images mops up the remainder. Additive (never nulls)."),
    },
    {
        "key": "poi_images",
        "title": "All-POI image sweep (Commons + Wikipedia, best-effort)",
        "cadence": "backfill",
        "writes_app_data": True,
        "retries": 12,
        "cmds": [
            [PY, "pipeline/enrich_images_commons.py"],
            [PY, "pipeline/enrich_images_web.py"],
        ],
        "note": ("gathers images for the FULL image-less POI set (long tail incl.), "
                 "not just must-see. Resumable + atomic writes + auto-retry, but "
                 "multi-hour and Wikimedia-rate-limited - run when no other session "
                 "hits Wikipedia/Commons. Additive (never nulls)."),
    },
    # `poi_enrich` used to be a task of its own whose three commands were
    # exactly poi_images' two plus must_descs' one, without poi_images'
    # retries (T029). It is now a name in TASK_ALIASES below, so
    # `--only poi_enrich` runs those two tasks, retries included (T261).
]
