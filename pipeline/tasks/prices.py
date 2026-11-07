"""Crowds and prices: regional crowding, flight routes, the tourist premium, food and drink, stays.

Part of the task registry (pipeline/tasks/__init__.py, ROADMAP A2, T1207).
List order is run order; run_pipeline.py runs the domains in DOMAINS order."""

from pipeline.tasks._base import MASTER_KEEP, PUBLISH, PY, guard_reachable

TASKS = [
    {
        "key": "crowding",
        "title": "Regional crowding (Eurostat tourism density, T642 monthly shares)",
        "cadence": "quarterly",
        "writes_app_data": True,
        # T640: soft and gated, so a bad Eurostat pull keeps last quarter's
        # crowding instead of stopping the run before the ship.
        "soft": True,
        "rev": "T642",
        "est_h": 0.2,
        "cmds": [[PY, PUBLISH, "--layer", "master", *MASTER_KEEP, "--",
                  PY, "pipeline/harvest_tourism_density.py"]],
        "guard": guard_reachable("Eurostat", "ec.europa.eu"),
        "note": ("Eurostat updates ~annually; pass --refresh in the script to re-download. "
                 "T642 adds dest.crowding.monthly from tour_occ_nin2m."),
    },
    {
        "key": "crowding_uk",
        "title": "Monthly crowds for GB, BA, FO, MD, XK (ONS / VisitBritain, national offices; D11)",
        "cadence": "quarterly",
        "writes_app_data": True,
        "soft": True,
        "rev": "T1098",
        "est_h": 0.1,
        "cmds": [[PY, PUBLISH, "--layer", "master", *MASTER_KEEP, "--",
                  PY, "pipeline/harvest_uk_crowds.py"]],
        "note": ("Reads cache/uk_crowds_nights.csv (owner prepares it, no download here); "
                 "does nothing while the file is absent. Runs after crowding, never overwrites it."),
    },
    {
        "key": "flight_routes",
        "title": "Flight route list (Eurostat airport pairs) -> R2 data/flights/_routes.json",
        "cadence": "monthly",
        "writes_app_data": False,
        "cmds": [[PY, "pipeline/flights/build_routes.py", "--upload"]],
        "note": "T512. The flight-sweep Worker reads the list from R2; Eurostat publishes "
                "with a long lag, so the Worker's own find tier adds newer routes.",
    },
    {
        "key": "tourist_premium",
        "title": "Tourist-hotspot premium on food and drink (dining, groceries, clubs)",
        "cadence": "quarterly",
        "writes_app_data": True,
        "cmds": [[PY, "pipeline/apply_tourist_premium.py"]],
        "note": ("food half only since T533: beds come from the stays layer, which "
                 "measures hotspot prices instead of marking them up."),
    },
    {
        "key": "food",
        "title": "Food and drink prices per place (Eurostat + Open Prices, T513)",
        "cadence": "monthly",
        "writes_app_data": True,
        "cmds": [
            [PY, "pipeline/harvest_food_prices.py"],
            [PY, "pipeline/apply_food_prices.py"],
        ],
        "note": ("no keys; ~1 min. Eurostat publishes the monthly price index around "
                 "the 17th, so a run after that moves every price to last month. "
                 "Must run AFTER tourist_premium: apply_tourist_premium.py only "
                 "touches country-level costs blocks, and this task owns them."),
    },
    {
        "key": "stays",
        "title": "Stay layer: the Booking + Hostelworld scrape -> live stays wire (T1021)",
        "cadence": "monthly",
        "writes_app_data": False,
        "soft": True,
        "cmds": [
            [PY, "pipeline/stays/box_stays.py"],
        ],
        "note": ("the scrape journal is the single source (owner 2026-11-03). The laptop "
                 "scrapes (scripts/stays_scrape.bat; Booking blocks datacenter addresses) "
                 "and uploads journal_scrape.sqlite to r2:carta-stays-state; this task "
                 "downloads it, builds with the gate and publishes to "
                 "r2:carta/data/stays-live/v1/, which the app reads without a deploy. "
                 "Needs rclone's r2 remote (source ~/.config/carta/env). To bake a build "
                 "into the app instead: build_stays.py --gate, then apply_stays.py."),
    },

]
