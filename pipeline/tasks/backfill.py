"""Backfill on catalogue growth: manual (--only), coverage-guarded.

Part of the task registry (pipeline/tasks/__init__.py, ROADMAP A2, T1207).
List order is run order; run_pipeline.py runs the domains in DOMAINS order."""

from pipeline.tasks._base import PY, guard_cache_covers

TASKS = [

    # ---- backfill / on catalogue growth: MANUAL (--only), coverage-guarded ---- #
    {
        "key": "geonames",
        "title": "GeoNames population/settlement (new dests)",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [[PY, "pipeline/harvest_geonames.py"]],
        "note": "static gazetteer; only worth it after the catalogue grows.",
    },
    {
        "key": "nature",
        "title": "Protected areas / national parks (OSM)",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [[PY, "pipeline/harvest_protected_areas_osm.py"]],
        "note": "static geography; heavy Overpass sweep on a cold cache.",
    },
    {
        "key": "climate",
        "title": "NASA POWER climate normals (full catalogue)",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [
            [PY, "pipeline/harvest_climate_power.py"],
            [PY, "pipeline/apply_climate.py"],
        ],
        "note": ("switched from WorldClim 2.1 on 2026-08-26: WorldClim is "
                 "non-commercial-only and the dossier PDFs redistribute the "
                 "monthly values. POWER is US-gov open data, one small call "
                 "per dest, resumable memo in cache/climate_power_raw.json. "
                 "harvest_climate_worldclim.py stays for reference only."),
    },
    {
        "key": "unesco",
        "title": "UNESCO World Heritage list refresh",
        "cadence": "quarterly",
        "soft": True,
        "cmds": [
            [PY, "pipeline/harvest_unesco_whc.py"],
        ],
        "note": ("provenance for cache/unesco_whc.json (ledger item 6, closed "
                 "2026-08-26). Consumers (rating/beauty/features/trips) pick "
                 "the file up on their own cadences; new inscriptions land in "
                 "July, so quarterly is enough."),
    },
    {
        "key": "guide",
        "title": "Wikivoyage 'why go here' blurbs",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [
            [PY, "pipeline/harvest_wikivoyage.py"],
            [PY, "pipeline/apply_wikivoyage.py"],
        ],
        # apply_wikivoyage pops guide for dests missing from the cache:
        "guard": guard_cache_covers("cache/wikivoyage.json", 0.90),
        "note": "harvest is additive; apply is coverage-guarded (won't strip on a thin cache).",
    },
    {
        "key": "images",
        "title": "Destination lead images (Wikipedia)",
        "cadence": "backfill",
        "writes_app_data": True,
        "cmds": [
            [PY, "pipeline/harvest_images.py", "harvest"],
            [PY, "pipeline/harvest_images.py", "patch"],
        ],
        "guard": guard_cache_covers("cache/wiki_images.json", 0.95),
        "note": "NULL-RISK: patch nulls images for dests absent from the cache - guarded.",
    },
]
