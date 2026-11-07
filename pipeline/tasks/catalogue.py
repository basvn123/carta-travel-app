"""The catalogue core: open-data mirror, holidays, fame to rating, coverage, POI significance, country context, register intake, the audit.

Part of the task registry (pipeline/tasks/__init__.py, ROADMAP A2, T1207).
List order is run order; run_pipeline.py runs the domains in DOMAINS order."""
import sys

from pipeline.tasks._base import CACHE, PY, ROOT, log, run_cmd


def ingestion_step(ctx):
    """Raw open-data mirror: NAP schedule feeds (GTFS/NeTEx), GTFS-RT + SIRI
    realtime, OpenSky ADS-B, ferries, historical pricing -> data/raw with
    per-day manifests. Collectors missing credentials SKIP cleanly."""
    return run_cmd([PY, "-m", "src.ingestion.run_all"]) == 0


def demand_events_step(ctx):
    """Public + school holiday calendars (Nager.Date / OpenHolidays), the
    exogenous demand catalysts behind the model's holiday features."""
    return run_cmd([PY, "-m", "src.ingestion.run_all",
                    "--only", "holidays,school_holidays"]) == 0



FAME_CLEAR_TOLERANCE = 15


def _fame_measurable():
    """(total destinations, how many have an article fame can be read from)."""
    import json as _json
    sys.path.insert(0, str(ROOT / "pipeline"))
    try:
        import harvest_pageviews as _hp
        overrides = set(_hp.FAME_ARTICLE_OVERRIDES)
    except Exception:
        overrides = set()
    try:
        dests = _json.loads((ROOT / "app_data" / "app_data.json")
                            .read_text(encoding="utf-8"))["destinations"]
    except Exception:
        return 0, 0
    try:
        articles = _json.loads((CACHE / "dest_articles.json")
                               .read_text(encoding="utf-8"))
    except Exception:
        articles = {}
    ok = 0
    for did, d in dests.items():
        page = (d.get("image") or {}).get("page") or ""
        is_article = (".wikipedia.org/wiki/" in page
                      and "commons.wikimedia.org" not in page)
        if did in overrides or is_article or (articles.get(did) or {}).get("url"):
            ok += 1
    return len(dests), ok


def fame_step(ctx):
    """Refresh destination fame, then everything downstream of it.

    The pageviews cache is never invalidated by the harvester (it only fills
    missing ids), so drifted fame is only picked up by deleting it first. That
    deletion is also the dangerous part of this step: harvest_pageviews can
    only fetch a destination that HAS a resolvable article, and 334 of them
    store a Wikimedia Commons `File:` page in `image.page` - a photograph, not
    an article. Clearing the cache without resolving those first silently drops
    the fame of Bilbao, Ibiza, Alicante and 331 others, and nothing fails.
    resolve_dest_articles runs first for exactly that reason.

    The chain that follows was previously beauty -> rating, which skipped two
    inputs the rating actually reads: `designations` feeds the acclaim term,
    and `place.class` decides which per-class curve appeal_scale puts a
    destination on. A monthly run that refreshed neither re-derived the rating
    from stale versions of both.
    """
    if run_cmd([PY, "pipeline/resolve_dest_articles.py", "--all"]) != 0:
        return False

    # Only destroy the cache if we can actually refill it. resolve_dest_articles
    # exits 0 even when Wikipedia rate-limits it, because a 429 is a temporary
    # failure rather than a bad run - so "it succeeded" does NOT mean "every
    # destination is now measurable". Deleting the cache on that assumption is
    # precisely the bug this whole guard exists to prevent, one level up: the
    # clear is unconditional, the refill is not, and the difference is silent.
    #
    # So the coverage is measured, and the clear only happens when a refill can
    # actually replace what is being thrown away. Below the bar the refresh
    # still runs, just additively: fame goes stale rather than missing, which is
    # the better of the two failures.
    total, measurable = _fame_measurable()
    pv = CACHE / "dest_pageviews.json"
    if measurable >= total - FAME_CLEAR_TOLERANCE:
        if pv.exists():
            try:
                pv.unlink()
                log(f"  cleared cache/dest_pageviews.json ({measurable}/{total} "
                    f"destinations resolvable) to force fresh fame")
            except OSError as e:
                log(f"  (could not clear pageviews cache: {e})")
    else:
        log(f"  KEEPING cache/dest_pageviews.json: only {measurable}/{total} "
            f"destinations have a resolvable article, so a full refresh would "
            f"drop fame for {total - measurable} of them. Refreshing additively; "
            f"re-run resolve_dest_articles.py to clear the backlog.")
    for step in (["pipeline/harvest_pageviews.py", "dests"],
                 ["pipeline/apply_designations.py"],
                 ["pipeline/apply_beauty_layer.py"],
                 ["pipeline/apply_place_layer.py"],
                 ["pipeline/apply_rating_layer.py"]):
        if run_cmd([PY] + step) != 0:
            return False
    return True



TASKS = [
    {
        "key": "ingestion",
        "title": "Raw open-data mirror (schedules, realtime, ADS-B, ferries)",
        "cadence": "weekly",
        "writes_app_data": False,
        "soft": True,
        "run": ingestion_step,
        "note": ("src/ingestion collectors -> data/raw; keyless sources SKIP with "
                 "instructions. `python -m src.ingestion.run_all --list` for the "
                 "roster, --check to probe endpoints."),
    },
    {
        "key": "demand_events",
        "title": "Demand catalysts: public + school holiday calendars",
        "cadence": "monthly",
        "writes_app_data": False,
        "soft": True,
        "run": demand_events_step,
        "note": ("Nager.Date + OpenHolidays -> data/raw/holidays + "
                 "data/raw/school_holidays; feeds the model's holiday features."),
    },
    {
        "key": "fame",
        "title": "Fame -> designations -> beauty -> place -> traveller rating",
        "cadence": "monthly",
        "writes_app_data": True,
        "run": fame_step,
        "note": ("fame is a rolling 12-mo average; monthly is plenty. Resolves "
                 "missing articles FIRST (the step deletes the pageviews cache, "
                 "and a destination with no resolvable article silently loses "
                 "its fame), then refreshes every input the rating reads: "
                 "designations feed acclaim, place.class picks the appeal "
                 "curve. apply_rating_layer last, and it REFUSES to write when "
                 "its validation gate fails."),
    },
    {
        "key": "coverage",
        "title": "Coverage gaps: what Europe has that the catalogue does not",
        "cadence": "quarterly",
        "writes_app_data": False,
        "soft": True,
        "cmds": [
            [PY, "pipeline/build_place_candidates.py"],
            [PY, "pipeline/harvest_place_signals.py"],
            [PY, "pipeline/score_place_candidates.py"],
        ],
        "note": ("docs/COVERAGE.md. Rebuilds data/reports/coverage/ (one ranked "
                 "review sheet per country) and coverage_gaps.json. READ-ONLY "
                 "with respect to the catalogue: it proposes, a human disposes. "
                 "Promotion is deliberately NOT scheduled - "
                 "promote_place_candidates writes a spec file and apply_new_gems "
                 "inserts it, both run by hand, because adding destinations is "
                 "an editorial act and a cron job should never make one. "
                 "Quarterly because the gazetteer and the registers move slowly; "
                 "the expensive part is the ~70 MB candidate rebuild (~75 s, no "
                 "network) plus one Wikidata pass."),
    },
    {
        "key": "poi_significance",
        "title": "POI significance: signals -> dedupe -> gated re-tier -> rating",
        "cadence": "monthly",
        "writes_app_data": True,
        "soft": True,
        "cmds": [
            [PY, "pipeline/harvest_pageviews.py", "pois"],
            [PY, "pipeline/harvest_poi_wikidata.py"],
            [PY, "pipeline/harvest_wikivoyage_listings.py"],
            [PY, "pipeline/dedupe_pois.py"],
            [PY, "pipeline/normalize_poi_kinds.py"],
            [PY, "pipeline/score_significance.py", "apply"],
            [PY, "pipeline/apply_rating_layer.py"],
        ],
        "note": ("the 2026-08 open-signal rate engine (docs/QUALITY_UPGRADE_PLAN.md): "
                 "pageviews + Wikidata sitelinks/heritage + Wikivoyage See/Do "
                 "listings -> composite score -> local-quota rate 0-3. All "
                 "harvests resumable + cache-only; score_significance apply "
                 "REFUSES to write when the anchor validation gate fails "
                 "(logs/significance_report.json). apply_rating_layer last: the "
                 "dest rating's things component saturates on the new rates."),
    },
    {
        "key": "country_context",
        "title": "Country context: rank/percentile/badge within each country",
        "cadence": "weekly",
        "writes_app_data": True,
        "soft": True,
        "cmds": [[PY, "pipeline/country_context_layer.py"]],
        "note": ("A6 (PLAN.md): country_rank/_n/_percentile/_badge and "
                 "class_percentile beside the absolute score, so a browsing "
                 "user sees where a place stands in the country they are "
                 "going to. Reads rating.score only and refuses to write if "
                 "any absolute score moved, so it runs safely after every "
                 "rating refresh. Multi-airport cities hold one slot."),
    },
    {
        "key": "register_intake",
        "title": "Register intake: which members do we NOT have (report only)",
        "cadence": "monthly",
        "writes_app_data": False,
        "soft": True,
        "cmds": [[PY, "pipeline/intake/register_intake.py"]],
        "note": ("B3 (PLAN.md): full membership of every modelled place "
                 "register from WDQS, diffed against the catalogue and the "
                 "B1 member lists -> reports/intake_candidates.csv with an "
                 "auto_admit flag. NEVER ingests anything: candidates wait "
                 "for review, per the plan's hard stop. Unmodelled registers "
                 "are printed as a visible gap."),
    },
    {
        "key": "audit",
        "title": "Data-quality audit scorecard (read-only)",
        "cadence": "monthly",
        "writes_app_data": False,
        "soft": True,
        "cmds": [[PY, "pipeline/audit/audit_quality.py"]],
        "note": ("coords/dupes/rate-inflation/coverage report -> "
                 "logs/audit_quality_report.json; never blocks, but read it "
                 "after any POI-layer change."),
    },
]
