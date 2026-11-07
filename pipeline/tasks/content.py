"""Place content and the dossier: intros, gallery, POI descriptions, dossiers, field stubs.

Part of the task registry (pipeline/tasks/__init__.py, ROADMAP A2, T1207).
List order is run order; run_pipeline.py runs the domains in DOMAINS order."""

from pipeline.tasks._base import (
    CACHE,
    CONTINENT,
    MASTER_KEEP,
    PUBLISH,
    PY,
    ROOT,
    log,
    run_cmd,
)


def dossier_audit_dry(ctx):
    """The read-only half of the dossier task, for --dry-run: run the same gate
    the real task ends on, over the dossiers that are shipped right now.

    audit.py reads continent-app/public/dossier and writes one thing, its own
    report under data/reports. It builds nothing and touches no wire, so the
    plan can answer the only question worth asking before a monthly rebuild:
    are the files currently in front of readers passing every hard check?"""
    d = CONTINENT / "public" / "dossier"
    if not d.exists() or not any(d.glob("*.json")):
        log("  no continent-app/public/dossier yet: a real run would build it "
            "first, so there is nothing to audit")
        return False
    log("  dry-run probe: auditing the shipped dossiers, building nothing")
    return run_cmd([PY, "pipeline/dossier/audit.py", "--strict"]) == 0


def guard_dossier(ctx=None):
    """The dossier contract is a JOIN, so it is only as good as its inputs.

    It reads the shipped wires rather than any database: app_data for the
    catalogue and its ratings, activities_full for the rated things a place
    has, and the layer wires for the nature join. Missing app_data means there
    is nothing to build at all; missing activities means every dossier still
    builds but arrives without the one section a reader came for.

    The landmark cache is deliberately NOT guarded. The first run of this task
    creates it (three hours, resumable), and refusing to start until it exists
    would mean the task could never bootstrap itself on a new machine. Same for
    the research cache: no file is a documented state, not a failure, because
    the open-data tier covers every destination without one."""
    missing = [s for s in ("common.py", "derive_do.py", "build_dossier.py",
                           "fill_licences.py", "harvest_landmarks.py",
                           "reclassify_landmarks.py", "harvest_city_intros.py",
                           "fix_airport_listings.py", "harvest_event_dates.py",
                           "plan_research.py", "research_do.py", "web_sweep.py",
                           "audit.py")
               if not (ROOT / "pipeline" / "dossier" / s).exists()]
    if missing:
        return False, f"pipeline/dossier is missing {', '.join(missing)}"
    pub = CONTINENT / "public"
    if not (pub / "app_data.json").exists():
        return False, ("continent-app/public/app_data.json is missing; the "
                       "dossier builds off the shipped wires, not the master")
    if not (pub / "activities_full.json").exists():
        return False, ("continent-app/public/activities_full.json is missing; "
                       "every dossier would ship without its things to do")
    if not (CACHE / "dossier" / "landmarks.json").exists():
        return True, ("dossier stages present; no landmark cache yet, so the "
                      "Wikidata harvest runs cold (about three hours, "
                      "resumable, shardable with --shard/--of)")
    return True, "dossier stages present, wires and landmark cache on disk"



TASKS = [
    # T1107 (H9): the harvests of T1095 and T1096 on the box schedule. All
    # three are keyless, paced and resumable (a cached id is never fetched
    # twice without --refresh), so a quarterly run only asks for new places.
    # They sit before `dossier` because build_dossier reads their caches; in a
    # quarterly run the plan keeps this order.
    {
        "key": "place_intros",
        "title": "Grounded Wikipedia and Wikivoyage intros for the top places (T1095, D9)",
        "cadence": "quarterly",
        "writes_app_data": False,
        "soft": True,
        "rev": "T1107",
        "est_h": 0.5,
        "cmds": [[PY, "pipeline/dossier/harvest_place_intros.py"]],
        "note": ("Writes cache/dossier/place_intros.json; the next dossier build "
                 "merges ok records. Needs en.wikipedia.org and en.wikivoyage.org. "
                 "Widen --top / --countries in this entry once T1095-a's reject "
                 "rate is read (T1095-c)."),
    },
    {
        "key": "place_gallery",
        "title": "Gallery pass: licensed Commons photos for places below 5 (T1096, D9)",
        "cadence": "quarterly",
        "writes_app_data": False,
        "soft": True,
        "rev": "T1107",
        "est_h": 0.5,
        "cmds": [[PY, "pipeline/photos/place_gallery.py", "--max-minutes", "60"]],
        "note": ("Writes cache/dossier/place_gallery.json from the shipped dossiers' "
                 "shortfall; build_dossier.compose_gallery applies the licence gate."),
    },
    {
        "key": "poi_descriptions",
        "title": "Grounded descriptions for must-see and recommended POIs (T1096, D9)",
        "cadence": "quarterly",
        "writes_app_data": True,
        "soft": True,
        "rev": "T1107",
        "est_h": 0.5,
        "cmds": [
            [PY, "pipeline/poi_descriptions.py"],
            [PY, PUBLISH, "--layer", "master", *MASTER_KEEP, "--",
             PY, "pipeline/poi_descriptions.py", "apply"],
        ],
        "note": ("Harvest into cache/poi_descriptions.json, then apply to "
                 "activities.items_full in the master. Needs en.wikipedia.org."),
    },
    {
        "key": "dossier",
        "title": "Destination dossiers: the per-destination contract for panel + PDF",
        "cadence": "monthly",
        "writes_wire": True,
        "soft": True,
        # T640: due on the next run whatever its clock says, because T641 and
        # T642 changed what the build reads (derive_practical, airports, fees).
        "rev": "T642",
        "est_h": 1.5,
        "cmds": [
            # Sources first: landmarks and city intros are what let a remote
            # village say anything and stop a gateway describing its airport.
            [PY, "pipeline/dossier/harvest_landmarks.py"],
            [PY, "pipeline/dossier/reclassify_landmarks.py"],
            [PY, "pipeline/dossier/harvest_city_intros.py"],
            [PY, "pipeline/dossier/fix_airport_listings.py"],
            [PY, "pipeline/dossier/harvest_event_dates.py"],
            [PY, "pipeline/export_destinfo.py"],
            # Research settles BEFORE the build, or a sweep lands one run late:
            # the sibling fill and the validator have to happen while the build
            # can still read what they produced. web_sweep is a no-op without a
            # key, which is why it can sit on the critical path unconditionally.
            [PY, "pipeline/dossier/web_sweep.py", "--all", "--if-configured"],
            [PY, "pipeline/dossier/plan_research.py", "--tier", "2", "--copy-siblings"],
            [PY, "pipeline/dossier/research_do.py"],
            # Then the build-fill-build sandwich, then the gates: audit.py's
            # hard checks and (T640) gate.py's coverage and range rules, with
            # the previous dossiers put back when either fails.
            [PY, PUBLISH, "--layer", "dossier", "--",
             PY, "pipeline/dossier/build_dossier.py", "--all", "::",
             PY, "pipeline/dossier/fill_licences.py", "::",
             PY, "pipeline/dossier/build_dossier.py", "--all", "::",
             PY, "pipeline/dossier/audit.py", "--strict"],
        ],
        "guard": guard_dossier,
        "dry_run": dossier_audit_dry,
        "note_landmarks": ("harvest_landmarks.py is the slow one, about three "
                           "hours single-threaded for the full catalogue. It "
                           "is resumable and shardable: run four workers with "
                           "--shard i --of 4 --out cache/dossier/landmarks_s{i}"
                           ".json and then --merge them, which brings it under "
                           "an hour. Never point two workers at one --out; each "
                           "writes the whole cache atomically and they clobber."),
        "note_sweep": ("things-to-do evidence has two tiers and the UI labels "
                       "which is which. derive_do.py is a MODULE, imported by "
                       "build_dossier, so the open tier (>=2 independent "
                       "institutions) is derived for all 3,038 on every build "
                       "with nothing to schedule. The web tier (>=3 distinct "
                       "registrable domains) is web_sweep.py, which needs "
                       "CARTA_SEARCH_KEY; with --if-configured an unset key is "
                       "a no-op rather than a failure, so the stage is safe to "
                       "keep on the critical path and starts working the day a "
                       "key exists. It only researches destinations with no "
                       "file yet, so a wave written by hand is never redone. "
                       "research_do.py validates both and reports coverage."),
        "note": ("public/dossier/{id}.json: highlights (deduped + retyped), gallery "
                 "with per-image TASL, intro, things to do, nearby nature join, day "
                 "trips, parking with nav deeplinks, tips, credits. Runs offline off "
                 "the shipped wires except fill_licences (Commons extmetadata) - so "
                 "run AFTER images/activities/features tasks. The build-fill-build "
                 "sandwich is deliberate: the first pass discovers which images lack "
                 "TASL, the fill resolves them, the second pass flips ok_print. "
                 "Unchanged content keeps its content_hash, so re-runs are cheap."),
    },
    {
        "key": "field_stubs_report",
        "title": "Field stubs: what still has no source (data/reports/field_stubs.md)",
        "cadence": "after",
        "after": ["dossier"],
        "writes_app_data": False,
        "soft": True,
        "est_h": 0.01,
        "cmds": [[PY, "pipeline/field_stubs/report.py"]],
        "note": "T641's list of the fields still stubbed; report only, writes no wire.",
    },
]
