"""The explore data fill (T640 to T642): transit, airports, climate, nature context, overlays, trails fields, rating v5, outdoor pages.

Part of the task registry (pipeline/tasks/__init__.py, ROADMAP A2, T1207).
List order is run order; run_pipeline.py runs the domains in DOMAINS order."""

from pipeline.tasks._base import (
    MASTER_KEEP,
    OVERPASS,
    PUBLISH,
    PY,
    guard_all,
    guard_files,
    guard_reachable,
    guard_trailslab_extracts,
)
from pipeline.tasks.outdoor import guard_beaches, guard_mountains

TASKS = [
    # ---- explore data fill (T640 to T642): the box runs these through --also ---- #
    # List order is run order, and it is the order of
    # docs/owner/explore-data-runs.md: transit lines and the car rule,
    # airports (reads the GTFS feeds transit_lines fetched), sea temperature
    # (read by climate_daily and beach_context), climate, the three nature
    # layers, the destination overlays the dossier reads, then the dossier.
    # Every publishing step goes through pipeline/field_stubs/publish.py, which
    # snapshots the previous wire, runs the export, gates it and puts the
    # snapshot back when the gate fails. All soft: a failed gate is a
    # SOFT-FAIL, the ship goes out with the previous wire, and the task is due
    # again next run (every harvest here is resumable, so the retry is cheap).
    {
        "key": "transit_lines",
        "title": "Transit lines between towns (GTFS + OSM ferries) -> car rule",
        "cadence": "monthly",
        "writes_app_data": True,
        "soft": True,
        "rev": "T642",
        "est_h": 1.0,
        "guard": guard_reachable("Overpass", *OVERPASS),
        "cmds": [
            [PY, "pipeline/transit/gtfs_lines.py"],
            [PY, "pipeline/transit/osm_ferry_legs.py"],
            [PY, "pipeline/transit/merge_lines.py"],
            [PY, PUBLISH, "--layer", "master", *MASTER_KEEP, "--",
             PY, "pipeline/apply_car_layer.py", "--transit", "cache/transit_lines.json"],
        ],
        "note": ("T641 lines (cache/dest_transit.json from the GTFS feeds in "
                 "pipeline/transit/feeds.json with a verified licence, "
                 "cache/dest_transit_ferry.json from OSM) folded by merge_lines "
                 "into cache/transit_lines.json, which T642's car rule reads "
                 "(local_transport.car_basis, car_useful_for, parking_hard). "
                 "Monthly because timetables change."),
    },
    {
        "key": "airports",
        "title": "Airports within reach per destination, per-mode transfer (T642)",
        "cadence": "quarterly",
        "writes_app_data": True,
        "soft": True,
        "rev": "T642",
        "est_h": 0.1,
        "guard": guard_files(("app_data/app_data.json", 1, "pull master-current first")),
        "cmds": [[PY, PUBLISH, "--layer", "master", *MASTER_KEEP, "--",
                  PY, "pipeline/apply_airport_anchors.py", "--airports-only"]],
        "note": ("dest.airports[] (up to 4 within 110 km, road estimate and the "
                 "GTFS train option) and the transfer_mode label. --airports-only: "
                 "the re-anchoring half of the script predates T511 and must not "
                 "run on today's data (see its docstring)."),
    },
    {
        "key": "sea_temp",
        "title": "Sea surface temperature climatology for beaches and destinations (T641)",
        "cadence": "quarterly",
        "writes_app_data": False,
        "soft": True,
        "est_h": 2.5,
        "guard": guard_all(
            guard_reachable("NOAA CoastWatch ERDDAP", "coastwatch.pfeg.noaa.gov"),
            guard_files(("continent-app/public/beaches/??.json", 20,
                         "the beach wire is tracked; check the checkout"))),
        # T740: its own budget, so a slow ERDDAP day cannot use the batch's
        # 16 h (the first box run took 12.7 h); unfinished tiles resume next run.
        "cmds": [[PY, "pipeline/harvest_sea_temp.py", "--beaches", "--dests", "--max-hours", "6"]],
        "note": ("NASA JPL MUR SST monthly means via ERDDAP, one call per 1 degree "
                 "tile, tiles cached in cache/sea_temp/ (resumable, carried in the "
                 "explore-overlays archive class). Writes cache/sea_temp_beaches.json "
                 "(read by beach_context's export) and cache/sea_temp_dest.json "
                 "(read by climate_daily's apply_climate). Publishes nothing itself."),
    },
    {
        "key": "climate_daily",
        "title": "Climate: rain days, wind, sunshine, water temperature -> catalogue",
        "cadence": "quarterly",
        "writes_app_data": True,
        "soft": True,
        "rev": "T641",
        "est_h": 2.2,
        "guard": guard_reachable("NASA POWER", "power.larc.nasa.gov"),
        "cmds": [[PY, PUBLISH, "--layer", "climate", "--layer", "master", *MASTER_KEEP, "--",
                  PY, "pipeline/harvest_climate_power.py", "--daily", "::",
                  PY, "pipeline/apply_climate.py"]],
        "note": ("NASA POWER daily endpoint, one point per destination (about "
                 "3,868 calls, 1 worker, resumable through "
                 "cache/climate_power_daily.json), folded into cache/climate.json; "
                 "apply_climate adds rain_days, wind_ms, elev_m, sun_h (derived) and "
                 "water_c (sea_temp). Gated on climate and the master: rain days "
                 "0 to 31, wind 0 to 40 m/s, water 0 to 32 C, no coverage lost."),
    },
    {
        "key": "heat_fire",
        "title": "Heat and fire months per place (D20)",
        "cadence": "quarterly",
        "writes_app_data": True,
        "rev": "T1200",
        "cmds": [[PY, "pipeline/heat_fire.py"]],
        "note": ("adds climate.heat (monthly mean high at or above when.heat extreme_c) "
                 "and climate.fire (EFFIS/CEMS Fire Weather Index table cache/fire_fwi.json "
                 "when supplied, else a dry-heat proxy) from the climate block; run after "
                 "climate and climate_daily. Thresholds: config/pricing.json when.heat."),
    },
    {
        "key": "beach_context",
        "title": "Beaches: context v2 (rentals, kids pool), walks, sea temp -> public/beaches",
        "cadence": "quarterly",
        "writes_app_data": False,
        "writes_wire": True,
        "soft": True,
        "rev": "T641",
        "est_h": 5.0,
        "guard": guard_all(
            guard_beaches,
            guard_files(("cache/beaches/raw_*.json", 20, "pull beaches-cache from R2"),
                        ("cache/beaches/rich_*.json", 20, "pull beaches-cache from R2")),
            guard_reachable("Overpass", *OVERPASS)),
        "cmds": [
            [PY, "pipeline/beaches/enrich_beaches.py", "--max-hours", "6"],
            [PY, "pipeline/beaches/harvest_beach_walks.py"],
            [PY, PUBLISH, "--layer", "beaches", "--", PY, "pipeline/beaches/export_beaches.py"],
        ],
        "partial_rc": 3,
        "note": ("enrich_beaches re-asks Overpass only for the beaches whose "
                 "context predates CONTEXT_V 2 (T631 sunbed rentals and children's "
                 "pools; photographs and article facts are kept), about 400 "
                 "batches of 12. Then the walks (T641, modelled straight line x "
                 "1.3) and the gated export, which also reads cache/sea_temp_beaches.json. "
                 "T1031/T1032: enrich stops after 6 h (run 2, 2026-11-02, spent "
                 "7 h on Spain alone), saves every 10 batches and exits 3; the "
                 "walks and export still run and the task stays due."),
    },
    {
        "key": "peak_context",
        "title": "Mountains: huts in the context, lift hours -> public/mountains",
        "cadence": "quarterly",
        "writes_app_data": False,
        "writes_wire": True,
        "soft": True,
        "rev": "T630",
        "est_h": 3.0,
        "guard": guard_all(
            guard_mountains,
            guard_files(("cache/mountains/rich_*.json", 20, "pull mountains-cache from R2")),
            guard_reachable("Overpass", *OVERPASS)),
        "cmds": [
            [PY, "pipeline/mountains/enrich_peaks.py", "--context-only"],
            [PY, "pipeline/mountains/harvest_lift_hours.py"],
            [PY, PUBLISH, "--layer", "peaks", "--", PY, "pipeline/mountains/export_peaks.py"],
        ],
        "note": ("--context-only re-asks the peaks with no OSM context or one "
                 "from before T630's hut records (8,898 enriched peaks today, "
                 "batches of 20), then T641's lift opening hours, then the gated "
                 "export (huts, slopeDeg, rangeRank, lift.hours)."),
    },
    {
        "key": "lake_detail",
        "title": "Lakes: re-enrich, outlines, water detail -> public/lakes",
        "cadence": "quarterly",
        "writes_app_data": False,
        "writes_wire": True,
        "soft": True,
        "rev": "T642",
        "est_h": 5.0,
        "guard": guard_all(
            guard_files(("cache/lakes/raw_*.json", 20, "pull lakes-json from R2"),
                        ("cache/lakes/rich_*.json", 20, "pull lakes-json from R2"),
                        ("cache/eea_bathing_water.json", 1, "run the bathing_water task"),
                        ("cache/regions/*", 1, "pull regions-cache from R2 (rg stamping)")),
            guard_reachable("Overpass", *OVERPASS)),
        "cmds": [
            [PY, "pipeline/lakes/enrich_lakes.py"],
            [PY, "pipeline/lakes/lake_outlines.py"],
            [PY, "pipeline/lakes/harvest_water_detail.py"],
            [PY, PUBLISH, "--layer", "lakes", "--", PY, "pipeline/lakes/export_lakes.py"],
        ],
        "note": ("after beach_context in this list because export_lakes joins the "
                 "beach wire (T642 beaches within 400 m of the outline). enrich is "
                 "warm (T631 bathing zones, no Overpass for lakes that have a "
                 "context; the previous climate stands where CHELSA is not on "
                 "disk), outlines and water detail (ferry lines, sport zones, "
                 "lifeguards, bans, wind profile) are resumable Overpass passes."),
    },
    {
        "key": "dest_overlays",
        "title": "Destination overlays: emergency numbers, hospitals, swim bans",
        "cadence": "quarterly",
        "writes_app_data": False,
        "soft": True,
        "est_h": 2.5,
        "guard": guard_reachable("Overpass", *OVERPASS),
        "cmds": [
            [PY, "pipeline/harvest_emergency.py"],
            [PY, "pipeline/harvest_swim_bans.py"],
        ],
        "note": ("cache/dest_emergency.json (Wikidata P2852 + OSM hospitals) and "
                 "cache/dest_swim_bans.json (OSM swimming=no), read by the "
                 "dossier's derive_practical. Publish through the dossier gate."),
    },
    {
        "key": "poi_fees",
        "title": "POI entry fee flags and charge records (OSM, not shown)",
        "cadence": "quarterly",
        "writes_app_data": False,
        "soft": True,
        "est_h": 2.5,
        "guard": guard_all(
            guard_files(("continent-app/public/poi/*.json", 100,
                         "the POI shards are written by the ship (sync-data); run one build first")),
            guard_reachable("Overpass", *OVERPASS)),
        "cmds": [[PY, "pipeline/pois/harvest_poi_fees.py"]],
        "note": ("cache/poi_fees.json, resumable (asked POIs are skipped), read by "
                 "derive_do.facts_of in the dossier build. No price is shown."),
    },
    {
        "key": "trails_fields",
        "title": "Trails + cycling: SAC, technique, exposure, transit flags, route shape",
        "cadence": "quarterly",
        "writes_app_data": False,
        "writes_wire": True,
        "soft": True,
        "rev": "T642",
        "est_h": 6.0,
        "guard": guard_trailslab_extracts,
        "cmds": [
            [PY, "pipeline/trails/way_tags.py", "--refresh"],
            [PY, "pipeline/trails/transit_stops.py"],
            [PY, PUBLISH, "--layer", "trails", "--", PY, "pipeline/trails/export_wire.py",
             "--countries",
             "AL,AD,AT,BE,BA,BG,HR,CY,CZ,DK,EE,FI,FR,DE,GB,GR,HU,IS,IE,IT,"
             "XK,LV,LI,LT,LU,MK,MT,MD,MC,ME,NL,NO,PL,PT,RO,RS,SK,SI,ES,SE,"
             "CH,SM,FO"],
            [PY, PUBLISH, "--layer", "cycling", "--", PY, "pipeline/cycling/export_cycling.py"],
        ],
        "note": ("needs the trailslab PostGIS lab and the Geofabrik extracts, so it "
                 "SKIPS on the Hetzner box; it runs where the lab runs (the owner's "
                 "laptop, or the trails lab worker of decision D5, task T647). "
                 "T630 sac_scale, technique, exposure, sac_segments; T641 ferry and "
                 "bus stop kinds; T642 difficulty floor (gate.py checks it); cycling rt."),
    },
    {
        "key": "rating_v5_profile",
        "title": "Rating v5: nature items on the place ladder, place taste profile",
        "cadence": "weekly",
        "writes_app_data": True,
        "writes_wire": True,
        "soft": True,
        "rev": "T762",
        "cmds": [
            [PY, "pipeline/nature_tiers.py"],
            [PY, "pipeline/place_taste_profile.py"],
        ],
        "note": ("T761/T762: v5 {score, band, rank, facts, confidence} on every "
                 "trail, beach, lake, peak and cycle route, read through the frozen "
                 "nature part of reports/rating_reference_v5.json; then the twelve "
                 "like values per place (frozen taste part). After every nature "
                 "scorer and the trails export, so it reads their latest rows. "
                 "Neither re-measures: recalibration is a deliberate --recalibrate "
                 "--version run."),
    },
    {
        "key": "outdoor_pages",
        "title": "Outdoor detail pages: start, access, routes to the top, stations, stages",
        "cadence": "weekly",
        "writes_app_data": False,
        "writes_wire": True,
        "soft": True,
        "rev": "T918",
        "cmds": [
            [PY, PUBLISH, "--layer", "trails", "--layer", "beaches", "--layer", "lakes",
             "--layer", "peaks", "--layer", "cycling", "--",
             PY, "pipeline/outdoor/derive_outdoor_pages.py"],
        ],
        "note": ("T918: a post-pass over the five nature wires (detail files for "
                 "trails and cycling, country rows for beaches, lakes and peaks). "
                 "After every nature export, because each export rewrites its files "
                 "without these keys. Reads cache/parking_osm.json, "
                 "cache/osm_settlements.json, cache/sea_temp_beaches.json when present, "
                 "and the placeholder files cache/outdoor/{layer}.json. Idempotent."),
    },
]
