"""Destination info: events, parking, accessibility facts.

Part of the task registry (pipeline/tasks/__init__.py, ROADMAP A2, T1207).
List order is run order; run_pipeline.py runs the domains in DOMAINS order."""

from pipeline.tasks._base import PY

TASKS = [
    {
        "key": "events",
        "title": "Recurring events/festivals (Wikidata) -> public/destinfo",
        "cadence": "monthly",
        "writes_app_data": False,
        "soft": True,
        "cmds": [
            [PY, "pipeline/harvest_events.py"],
            [PY, "pipeline/export_destinfo.py"],
        ],
        "note": ("the Explore panel's events section. Full rebuild each run (a "
                 "few minutes of WDQS queries); export_destinfo ships whatever "
                 "both destinfo caches hold, so this also republishes parking."),
    },
    {
        "key": "parking",
        "title": "Best parking per destination (OSM Overpass) -> public/destinfo",
        "cadence": "quarterly",
        "writes_app_data": False,
        "soft": True,
        "cmds": [
            [PY, "pipeline/harvest_parking.py"],
            [PY, "pipeline/export_destinfo.py"],
        ],
        "note": ("the Explore panel's where-to-park section. Resumable batch "
                 "harvest (~150 Overpass queries, 1-2 h); quarterly because car "
                 "parks move slowly. Delete cache/parking_osm.json to force a "
                 "from-scratch pass after a catalogue expansion."),
    },
    {
        "key": "access_facts",
        "title": "Accessibility facts per destination (OSM wheelchair tags, D21) -> public/destinfo",
        "cadence": "quarterly",
        "writes_app_data": False,
        "soft": True,
        "cmds": [
            [PY, "pipeline/harvest_access.py"],
            [PY, "pipeline/export_destinfo.py"],
        ],
        "note": ("the place page's Access block: step-free stations, accessible "
                 "toilets and mapped museums and sights, only where OpenStreetMap "
                 "carries a wheelchair tag. Resumable Overpass harvest like "
                 "parking; delete cache/access_osm.json to force a fresh pass."),
    },
]
