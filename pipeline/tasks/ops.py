"""Upkeep: the data blog, link health, photo checks, entry rules, seasons, price alerts.

Part of the task registry (pipeline/tasks/__init__.py, ROADMAP A2, T1207).
List order is run order; run_pipeline.py runs the domains in DOMAINS order."""

from pipeline.tasks._base import PY, guard_files, guard_reachable

TASKS = [
    {
        "key": "blog_drafts",
        "title": "Data blog: next month's 'Where to go in <month>' draft (K14, T1178)",
        "cadence": "monthly",
        "writes_app_data": False,
        "soft": True,
        "rev": "T1178",
        "cmds": [[PY, "pipeline/blog_drafts.py"]],
        "note": ("pipeline/blog_drafts.py reads continent-app/public/app_data.json and "
                 "writes content/blog/<slug>.md (status: draft) plus content/blog/data/"
                 "<slug>.json, then runs scripts/blog/check_draft.py on it and fails "
                 "when the check refuses. Never publishes: the owner reads the draft in a "
                 "pull request and changes status to published. Add --prose to the cmd "
                 "for a Gemini opening paragraph (prompt blog-intro). Docs: "
                 "content/blog/README.md, HANDBOOK 'Data blog'."),
    },
    {
        "key": "blog_pr",
        "title": "Data blog: this month's drafts on a branch for a pull request (K14, T1174)",
        "cadence": "after",
        "after": ["blog_drafts"],
        "writes_app_data": False,
        "soft": True,
        "rev": "T1174",
        "cmds": [[PY, "scripts/blog/monthly_pr.py"]],
        "note": ("scripts/blog/monthly_pr.py checks the drafts blog_drafts wrote, commits "
                 "content/blog/ to a branch blog-drafts-YYYY-MM and pushes it, then returns "
                 "the checkout to where it was. A dry run unless CARTA_BLOG_PR=1 is set in "
                 "the box secrets file (the owner's switch, T1174-b). Never publishes, never "
                 "pushes main. Docs: content/blog/README.md."),
    },
    {
        "key": "link_health",
        "title": "Link and page health: every outbound link and image URL, politely (D16, T1197)",
        "cadence": "weekly",
        "writes_app_data": False,
        "soft": True,
        "rev": "T1197",
        "est_h": 2,
        "cmds": [[PY, "pipeline/link_health.py", "run"]],
        "note": ("pipeline/link_health.py collects the links in the shipped wires and "
                 "checks them with HEAD (GET headers only when HEAD is refused), robots.txt "
                 "respected, a gap per host, a user agent naming Carta. It resumes: the "
                 "state is logs/status/links/results.json, a 120 minute budget a week "
                 "(pipeline/config/link_health.yaml), so the ~80k image URLs are covered "
                 "over several weeks. Writes continent-app/src/admin/linkHealth.json for "
                 "the admin Data health tab; the D2 gate reads its broken share "
                 "(scripts/quality/rules.yaml `links`). HANDBOOK 'Link and page health'."),
    },
    {
        "key": "photo_check",
        "title": "Photo correctness: a weekly sample of heroes checked against their place (D17)",
        "cadence": "after",
        "after": ["dossier", "beaches", "lakes", "mountains"],
        "writes_app_data": False,
        "soft": True,
        "rev": "T1198",
        "cmds": [[PY, "pipeline/photos/correctness.py", "--fetch-meta", "--vision", "gemini", "--validate"]],
        "note": ("T1198. About 500 heroes a run (pipeline/photos/correctness.json), "
                 "cheap signals first (file name, Commons categories, MIME, size, "
                 "published coordinate), Gemini through the gateway only for the "
                 "unsure (skipped without GEMINI_API_KEY). Report at "
                 "data/reports/photo_check/<date>.json with each flagged hero's "
                 "ladder replacement; nothing in the wires changes without --apply. "
                 "The flag rate is the D2 rule through the D23 runner layer photos, "
                 "gated once its baseline is written (T1198-b). Docs: HANDBOOK "
                 "'Photo correctness'."),
    },
    {
        "key": "entry_rules",
        "title": "Entry rules per country and traveller group, with the GOV.UK advice dates (D19, T1199)",
        "cadence": "monthly",
        "writes_app_data": False,
        "writes_wire": True,
        "soft": True,
        "rev": "T1199",
        "guard": guard_reachable("GOV.UK", "www.gov.uk"),
        "cmds": [[PY, "pipeline/entry_rules.py", "--refresh"]],
        "note": ("pipeline/entry_rules.py writes continent-app/public/entry_rules.json: "
                 "per country the codes for four traveller groups (EU, UK, visa free, "
                 "visa) from the zone table, each with its official source and the "
                 "date checked, and the GOV.UK foreign travel advice link with its "
                 "update date from the Content API (OGL v3.0, cached in "
                 "cache/entry_rules/). A page that fails keeps its cached date. "
                 "RULES_CHECKED moves only when a person checks the table again. "
                 "Docs: HANDBOOK 'Entry rules'."),
    },
    {
        "key": "seasons",
        "title": "Seasons and closures: open months of places, huts, lifts and ferries (D18, T1202)",
        "cadence": "quarterly",
        "writes_app_data": True,
        "soft": True,
        "rev": "T1202",
        "guard": guard_files(("data/raw/geofabrik/*/*.osm.pbf", 1,
                              "download the Geofabrik country extracts first (beaches osm_extract reads the same files)")),
        "cmds": [[PY, "pipeline/harvest_seasons.py"]],
        "note": ("pipeline/harvest_seasons.py reads opening_hours and seasonal from the "
                 "Geofabrik extracts (pyosmium, one pass each), keeps huts, lifts, "
                 "ferries and places named like a destination, writes "
                 "cache/dest_seasons.json and the destination `season` block "
                 "(open months, confidence, why, check date, nearby seasonal items) "
                 "into the master; sync-data ships it. Docs: HANDBOOK 'Seasons and closures'."),
    },
    {
        "key": "price_alerts",
        "title": "Price alerts: price every open alert, report the totals; the function mails a drop (I17, T1205)",
        "cadence": "weekly",
        "writes_app_data": False,
        "soft": True,
        "rev": "T1205",
        "guard": guard_reachable("data host", "data.carta-europetravel.com"),
        "cmds": [[PY, "pipeline/price_alerts.py"]],
        "note": ("after the stays refresh in the table, so a monthly run prices the new "
                 "stays wire; weekly for the flight fares the sweep keeps current. Reads "
                 "cache/stays/out/v1 (else the live stays copy) and flights/{IATA}.json on "
                 "the data host; asks the price-alerts Edge Function for the open alerts and "
                 "posts whole-euro totals back with PRICE_ALERTS_BOX_SECRET (never the "
                 "service role key). The function sets the baseline on the first check and "
                 "mails once when a total falls by the alert's share. Without "
                 "PRICE_ALERTS_URL and PRICE_ALERTS_BOX_SECRET it checks nothing and exits 0. "
                 "Docs: HANDBOOK 'Price alerts'."),
    },
]
