"""Image audits: hero images and the cross-layer image audit.

Part of the task registry (pipeline/tasks/__init__.py, ROADMAP A2, T1207).
List order is run order; run_pipeline.py runs the domains in DOMAINS order."""

from pipeline.tasks._base import PY, log, run_cmd


def hero_audit_dry(ctx):
    """The read-only half of the hero audit: classify every hero that is on
    disk right now and write the report, but look for no replacement and touch
    no cache. `check` is network-heavy the first time only; the Commons
    metadata it reads is cached per file title."""
    log("  dry-run probe: classifying heroes, replacing nothing")
    return run_cmd([PY, "pipeline/audit/audit_hero_images.py", "check"]) == 0


# How many destinations may lack a resolvable Wikipedia article before the fame
# step refuses to clear the pageviews cache. Small on purpose: a handful of
# genuinely article-less places is normal, hundreds means the resolver did not
# finish and the cache is the only copy of their fame.


TASKS = [
    {
        "key": "hero_audit",
        "title": "Hero image audit: flag maps/emblems/thumbnails, swap in photographs",
        "cadence": "monthly",
        "writes_app_data": True,
        "soft": True,
        "cmds": [
            [PY, "pipeline/audit/audit_hero_images.py", "check"],
            [PY, "pipeline/audit/audit_hero_images.py", "fix"],
            [PY, "pipeline/audit/audit_hero_images.py", "patch"],
        ],
        "dry_run": hero_audit_dry,
        "note": ("every new destination arrives with whatever Wikipedia leads its "
                 "article with, which for a small town is often a locator map or a "
                 "coat of arms. Monthly because it only has work to do after a "
                 "catalogue expansion. Writes the same cache/wiki_images.json as "
                 "`images`, so it MUST run after it. Review "
                 "data/reports/hero_images_contact_sheet.html before shipping: the "
                 "swaps are automatic, the taste is not. Then, against a served "
                 "build: node scripts/verify_hero_images.mjs - it samples the "
                 "audited heroes and loads each one, which is how the spliced "
                 "tracking-param thumb URLs were caught."),
    },
    {
        "key": "image_audit",
        "title": "Cross-layer image audit: every wire, one set of checks",
        "cadence": "weekly",
        "writes_app_data": False,
        "soft": True,
        "cmds": [
            [PY, "pipeline/images/fix_url_queries.py"],
            [PY, "pipeline/images/audit_all.py", "--probe", "20"],
        ],
        "note": ("sweep over destinations, features, beaches, lakes, "
                 "mountains, trips and trails: URL shape, thumb widths, frame "
                 "fit against the real card CSS, licence/credit/evidence "
                 "contracts, coverage, country covers, cross-layer duplicate "
                 "files, plus a sampled HTTP probe (content-type, not status: "
                 "the SPA fallback answers 200 with HTML). The wash step first "
                 "strips Commons tracking params (idempotent, byte-identical "
                 "image); every other finding is only reported. Report at "
                 "data/reports/image_audit.json, flagged entries eyeballable "
                 "at data/reports/image_audit_sheet.html; deeper fixes belong "
                 "to each layer's own harvester, Special:FilePath rot to "
                 "pipeline/images/fix_special_filepath.py."),
    },
]
