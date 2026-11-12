"""The outdoor layers: bathing water, beaches, lakes, mountains, trips, routes, cross-layer joins, regions.

Part of the task registry (pipeline/tasks/__init__.py, ROADMAP A2, T1207).
List order is run order; run_pipeline.py runs the domains in DOMAINS order."""

from pipeline.tasks._base import APP_DATA, CACHE, PY, ROOT, guard_trailslab_up


def guard_regions(ctx=None):
    """The region spine needs its module and its sources on disk, or a
    network to fetch them. A missing GeoPackage does not fail the OTHER
    layers (enrich degrades to a warning and exports skip the quota step),
    but the coverage audit and the region wire are this task's whole
    output, so they refuse to run on nothing."""
    missing = [s for s in ("region_sources.py", "build_regions.py",
                           "assign.py", "quotas.py", "coasts.py",
                           "seed_coasts.py", "opportunity.py", "coverage.py",
                           "export_regions.py")
               if not (ROOT / "pipeline" / "regions" / s).exists()]
    if missing:
        return False, f"pipeline/regions is missing {', '.join(missing)}"
    try:
        import geopandas  # noqa: F401
        import h3  # noqa: F401
    except ImportError as exc:
        return False, f"regions needs geopandas and h3 ({exc})"
    return True, "region stages present"


def guard_beaches(ctx=None):
    """The beach layer needs its own scripts and the EEA bathing water cache.

    Without the cache the water component silently falls back to the country
    default for every beach, which does not fail, it just quietly scores worse
    beaches higher. That is exactly the kind of degradation a guard is for."""
    missing = [s for s in ("sources.py", "harvest_beaches.py",
                           "enrich_beaches.py", "beauty_index.py",
                           "export_beaches.py", "build_beaches.py")
               if not (ROOT / "pipeline" / "beaches" / s).exists()]
    if missing:
        return False, f"pipeline/beaches is missing {', '.join(missing)}"
    if not (CACHE / "eea_bathing_water.json").exists():
        return False, ("cache/eea_bathing_water.json is missing; run the "
                       "`bathing_water` task first, water quality is 16% of the score")
    return True, "beach stages present, EEA bathing water cached"


def guard_lakes(ctx=None):
    """The lake layer needs its own scripts, the EEA bathing water cache, the
    CHELSA climate crop and the Geofabrik extracts.

    Each of these degrades quietly rather than loudly if it is missing, which
    is what a guard is for. Without the EEA cache every lake loses its water
    class AND its count of official bathing sites, which is the strongest
    evidence this layer has that swimming somewhere is lawful. Without the
    CHELSA crop there is no swimming season at all, so a lake page loses the
    one number a traveller reads first. And without the extracts the OSM spine
    never runs, which is the difference between Great Britain publishing eight
    lakes and publishing a national list.

    CHELSA replaced WorldClim 2.1 on 2026-08-30: WorldClim is licensed for
    non-commercial use, and a number under an affiliate link cannot stand on
    it. The crop is one keyless download, so the guard offers the command
    rather than sending anybody to another task."""
    missing = [s for s in ("water_sources.py", "seed_lakes.py",
                           "harvest_lakes.py", "enrich_lakes.py",
                           "lake_index.py", "lake_climate.py", "osm_water.py",
                           "export_lakes.py", "build_lakes.py")
               if not (ROOT / "pipeline" / "lakes" / s).exists()]
    if missing:
        return False, f"pipeline/lakes is missing {', '.join(missing)}"
    if not (CACHE / "eea_bathing_water.json").exists():
        return False, ("cache/eea_bathing_water.json is missing; run the "
                       "`bathing_water` task first, it decides the swimming verdict")
    if not (CACHE / "lakes" / "chelsa" / "tas_07_europe.tif").exists():
        return False, ("cache/lakes/chelsa is missing; run "
                       "`python pipeline/lakes/lake_climate.py --fetch` "
                       "first, the swimming season is modelled from it")
    extracts = list((ROOT / "data" / "raw" / "geofabrik").glob("*/*.osm.pbf"))
    if len(extracts) < 20:
        return False, (f"only {len(extracts)} Geofabrik extracts under "
                       "data/raw/geofabrik; the OSM water spine reads them, "
                       "run pipeline/trails/ingest_osm_routes.py to download")
    return True, ("lake stages present, EEA bathing water, CHELSA normals and "
                  f"{len(extracts)} extracts cached")


def guard_mountains(ctx=None):
    """The mountain layer needs its own scripts and the Wikidata spine.

    The spine is the one input that is not re-queried: cache/features_wikidata
    .json already holds every Wikidata mountain in these countries with its
    elevation, prominence and sitelink count, and re-harvesting it would cost
    hours to arrive at the same rows. Without it a build still runs, but it
    falls back to the seed and the P610 high points alone, which is a few
    hundred mountains instead of a few thousand. That is exactly the kind of
    quiet degradation a guard is for.

    Overpass is deliberately NOT guarded. It is the flakiest source in the
    layer and the layer is designed to ship without it (see build_peaks.py),
    so a missing access sweep is a documented state rather than a failure."""
    missing = [s for s in ("peak_sources.py", "seed_peaks.py",
                           "harvest_peaks.py", "enrich_peaks.py",
                           "peak_index.py", "export_peaks.py", "build_peaks.py")
               if not (ROOT / "pipeline" / "mountains" / s).exists()]
    if missing:
        return False, f"pipeline/mountains is missing {', '.join(missing)}"
    if not (CACHE / "features_wikidata.json").exists():
        return False, ("cache/features_wikidata.json is missing; without the "
                       "Wikidata spine the layer falls back to the seed and "
                       "the national high points alone")
    return True, "mountain stages present, Wikidata spine cached"


def guard_trips(ctx=None):
    """The trip layer needs its own scripts and the catalogue master.

    The master is the spine: ratings, city centre coordinates, accommodation
    anchors, climate normals and the POI shortlists all come from it, and
    without it there is nothing to compose. The Wikivoyage route cache is NOT
    guarded on purpose: the layer ships without it, composing on distance and
    quality alone, and the trips it produces then carry no editorialRoute
    reason. That is a documented, visible degradation rather than a failure,
    and the harvest inside build_trips.py rebuilds it anyway."""
    missing = [s for s in ("trip_sources.py", "trip_model.py",
                           "harvest_routes.py", "compose_trips.py",
                           "validate_trips.py", "export_trips.py",
                           "build_trips.py")
               if not (ROOT / "pipeline" / "trips" / s).exists()]
    if missing:
        return False, f"pipeline/trips is missing {', '.join(missing)}"
    if not APP_DATA.exists():
        return False, "app_data/app_data.json is missing; there is nothing to compose"
    routes = CACHE / "trips" / "routes.json"
    if not routes.exists():
        return True, ("trip stages present; no Wikivoyage route cache yet, so "
                      "the harvest will run cold (a few minutes)")
    return True, "trip stages present, catalogue master and route graph cached"



TASKS = [
    # The `features` task (pipeline/features -> public/features) was RETIRED
    # on 2026-09-02 per brief 08: the wire predated the beaches and mountains
    # layers that replaced it and nothing under continent-app/src ever read
    # it, while it carried live attribution obligations (data_licenses.md S8).
    # Code is preserved under archive/execution-2026-11-11:archive/pipeline_features.
    #
    # bathing_water sits BEFORE beaches and lakes (T261): both guards
    # refuse to run without cache/eea_bathing_water.json, which this task
    # writes, and the plan runs in list order. When it sat after them, a fresh
    # box skipped both layers on its first quarterly run and built them only
    # on the next one, 90 days later.
    {
        "key": "bathing_water",
        "title": "Bathing-water quality (EEA WISE)",
        "cadence": "quarterly",
        "writes_app_data": True,
        "cmds": [[PY, "pipeline/harvest_bathing_water.py"]],
        "note": "YEAR is pinned in the script (2025). Bump it + --refresh for a new season.",
    },
    {
        "key": "beaches",
        "title": "Beaches: named coves + the beauty index -> public/beaches",
        "cadence": "quarterly",
        "writes_app_data": False,
        "writes_wire": True,
        "soft": True,
        "cmds": [[PY, "pipeline/beaches/build_beaches.py"]],
        "guard": guard_beaches,
        "note": ("the Beaches category on the Destinations tab. Three stages "
                 "in one command (harvest -> enrich -> export), each cached "
                 "per country in cache/beaches, so a re-run with the caches "
                 "in place is seconds and produces the same wire. A COLD "
                 "build is a few hours, nearly all of it waiting politely on "
                 "Overpass: one country query each, then one context query "
                 "per 30 shortlisted beaches. Quarterly because coastlines "
                 "and coves move slowly; run it by hand after the `bathing_water` "
                 "task lands a new EEA season, since water quality is 16 per "
                 "cent of the score. The export validates before it writes "
                 "anything, so a failure leaves the previous wire standing. "
                 "Delete cache/beaches/rich_*.json to re-photograph without "
                 "re-harvesting."),
    },
    {
        "key": "lakes",
        "title": "Lakes: the best water bodies in Europe -> public/lakes",
        "cadence": "quarterly",
        "writes_app_data": False,
        "writes_wire": True,
        "soft": True,
        "cmds": [[PY, "pipeline/lakes/build_lakes.py"]],
        "guard": guard_lakes,
        "note": ("the Lakes category on the Destinations tab: lakes, "
                 "reservoirs, lagoons, tarns and crater lakes, each with three "
                 "sub scores (setting, swimming, things to do) and a SWIMMING "
                 "VERDICT. Five stages in one command (climate -> osm -> "
                 "harvest -> enrich -> export), each cached per country in "
                 "cache/lakes, so a warm re-run is seconds and produces the "
                 "same wire. lake_index_v2 added a second spine: OSM named "
                 "water bodies read offline from the Geofabrik extracts, "
                 "which is what lets Great Britain, Ireland, Norway and "
                 "Iceland publish a national list instead of the eight, nine, "
                 "thirteen and four that the two Wikidata rankings could "
                 "reach. A cold build is a day, most of it the extract filter "
                 "(CPU, offline) and Wikimedia photographs (network, paced). "
                 "Quarterly, and by hand after the `bathing_water` task lands a new "
                 "EEA season or after pipeline/lakes/seed_lakes.py changes, "
                 "since the seed carries the swimming rules that override "
                 "every machine signal. The export validates before it writes "
                 "anything, so a failure leaves the previous wire standing."),
    },
    {
        "key": "mountains",
        "title": "Mountains: the summits worth travelling for -> public/mountains",
        "cadence": "quarterly",
        "writes_app_data": False,
        "writes_wire": True,
        "soft": True,
        # Five commands rather than one, because v2 added two measurement
        # passes that are separable on purpose and one spine that is not on
        # the same clock. Order matters: the OSM spine feeds the harvest, the
        # terrain and season passes read what enrich shortlisted, and the
        # export reads all of it. Every one of them is cache first, so a
        # warm quarterly run is seconds and a cold one is a day.
        "cmds": [
            [PY, "pipeline/mountains/osm_spine.py"],
            [PY, "pipeline/mountains/build_peaks.py", "--skip-export"],
            [PY, "pipeline/mountains/terrain.py", "--workers", "4"],
            [PY, "pipeline/mountains/season.py"],
            [PY, "pipeline/mountains/export_peaks.py"],
        ],
        "guard": guard_mountains,
        "note": ("the Mountains category on the Destinations tab: summits, "
                 "volcanoes, ridges, sea cliffs and lowland high points, each "
                 "with three sub scores (scenery, getting up, what is at the "
                 "top) and the WAY UP on it, which is the question most people "
                 "bring to this tab. Three stages in one command (harvest -> "
                 "enrich -> export), each cached per country in "
                 "cache/mountains, so a warm re-run is seconds and produces "
                 "the same wire. The harvest re-queries almost nothing: the "
                 "Wikidata spine is already on disk from the features build, "
                 "and only the P610 high points, the thin-country hill pass "
                 "and the unresolved seed entries go over the network. A cold "
                 "build is a few hours, most of it Commons photographs. "
                 "Quarterly, and by hand after pipeline/mountains/seed_peaks.py "
                 "changes, since the seed is what pins the mountains fame does "
                 "not find and the lift-served viewpoints that are nobody's "
                 "highest. If Overpass is down, run it with --no-context and "
                 "fill the access layer in later with enrich_peaks.py "
                 "--context-only; the export validates before it writes "
                 "anything, so a failure leaves the previous wire standing. "
                 "v2 adds three passes in front of the export: osm_spine.py "
                 "(the second spine, Overpass, one query per country tile), "
                 "terrain.py (Copernicus GLO-30, windowed: prominence, "
                 "isolation, the viewshed, about six seconds a summit) and "
                 "season.py (one climatology call per 0.5 degree cell). All "
                 "three are cache first and resumable, and all three are "
                 "optional: a row they have not reached scores on the "
                 "components it does have."),
    },
    {
        "key": "trips",
        "title": "Trips: ready-made itineraries of 2 to 14 days -> public/trips",
        "cadence": "monthly",
        "writes_app_data": False,
        "writes_wire": True,
        "soft": True,
        "cmds": [[PY, "pipeline/trips/build_trips.py"]],
        "guard": guard_trips,
        "note": ("the Trips half of the Explore tab: a traveller says how many "
                 "days they have and where, and gets itineraries that were "
                 "composed and checked offline rather than generated on the "
                 "spot. Three shapes, which are the three real shapes a "
                 "European trip takes: one base with days out from it, a chain "
                 "of two to five bases joined by trains the app's own "
                 "estimator agrees run, and a car loop that returns to where "
                 "it started. Three stages in one command (harvest Wikivoyage "
                 "-> compose -> validate and export), cached in cache/trips, "
                 "so a warm re-run is about three minutes and produces the "
                 "same wire. Monthly, because it reads the ratings, the "
                 "accommodation anchors and the POI shortlists, and a trip is "
                 "only as current as those. Run it by hand after a rating "
                 "recalibration or an accommodation refresh. Every trip goes "
                 "through ten hard checks before it is written and the export "
                 "prints what it dropped and why, so a rule that starts "
                 "quietly deleting a country shows up in the run rather than "
                 "in the app as an empty page. A failure leaves the previous "
                 "wire standing."),
    },
    {
        "key": "routes_attach",
        "title": "Routes: which paths pass each destination, measured to the line",
        "cadence": "after",
        "after": ["trails_rate", "cycling_publish"],
        "writes_app_data": False,
        "soft": True,
        "guard": guard_trailslab_up,
        "cmds": [
            [PY, "pipeline/trails/transit_stops.py"],
            [PY, "pipeline/trails/derived_activities.py"],
            [PY, "pipeline/trails/node_networks.py"],
            [PY, "pipeline/trails/attach.py"],
        ],
        "note": ("ROUTES.md R6. Writes data/derived/routes_attach.json, which "
                 "the dossier build reads into each destination's `routes` "
                 "key, so it MUST run before `dossier`. Every distance is to "
                 "the nearest point on the route's line, in the lab where the "
                 "geometry is: the join it replaced placed a route by the "
                 "centre of its bounding box, which put a variant of the Via "
                 "Francigena 9 km from Rome when the walk passes 28.5 km "
                 "away. Rows are named for the PATH with the stretch that "
                 "passes named underneath, because a superroute is a "
                 "container rather than a walk and almost never publishes. "
                 "transit_stops.py runs first and is cheap after the first "
                 "pass: it only re-reads extracts already on disk. "
                 "derived_activities.py (ROUTES.md R8) flags trail running "
                 "and gravel on the routes that already exist rather than "
                 "creating rows, and node_networks.py measures the Dutch and "
                 "Belgian numbered mesh, which is deliberately never "
                 "published as routes; the attach carries both."),
    },
    {
        "key": "joins",
        "title": "Cross-layer neighbours: nb ids stamped into every wire row",
        "cadence": "after",
        "after": ["beaches", "lakes", "mountains", "trails_rate",
                  "cycling_publish", "trips"],
        "writes_app_data": False,
        "writes_wire": True,
        "soft": True,
        "cmds": [[PY, "pipeline/joins/neighbours.py"]],
        "note": ("brief 08's join: one spatial pass over the published wires "
                 "writes an `nb` object of neighbour ids into every row "
                 "(trails up this mountain, the lake on this walk), plus "
                 "per-stop neighbours into the trip detail files. Runs after "
                 "ANY layer re-exports, because an export rewrites its files "
                 "without nb; sits BEFORE regions in this list so the region "
                 "pages are composed from stamped rows. Key is `nb`, not "
                 "`near`: mountains already ship `near` as the nearest "
                 "priceable hub."),
    },
    {
        "key": "regions",
        "title": "Regions: the spine, quotas, coverage audit -> public/region",
        "cadence": "quarterly",
        "writes_app_data": False,
        "writes_wire": True,
        "soft": True,
        "cmds": [
            [PY, "pipeline/regions/build_regions.py", "--skip-fetch"],
            [PY, "pipeline/regions/coverage.py"],
            [PY, "pipeline/regions/export_regions.py", "--all"],
        ],
        "guard": guard_regions,
        "note": ("the unit between beach and country. build_regions "
                 "normalises NUTS/ITL/geoBoundaries, the coastal stretches, "
                 "GMBA ranges, basins and biogeo into cache/regions/"
                 "regions.gpkg and recomputes the opportunity measures; "
                 "coverage writes public/coverage.json plus the backlog CSVs "
                 "in reports/ (every deficit joined to the candidates the "
                 "gate rejected and why); export_regions writes the region "
                 "pages. --skip-fetch on the scheduled run: the sources "
                 "change yearly, delete cache/regions/src to refresh them. "
                 "Sits AFTER the beach, lake, mountain and trip tasks in "
                 "this list on purpose: the audit reads the wire that "
                 "actually shipped."),
    },
]
