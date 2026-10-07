"""Write the honest stubs: famous walks Carta knows of and cannot build.

Tier: Scheduled (run after pipeline/regions/coverage.py, before the wire build)

Destinations spec 6.5. A registry walk above the fame threshold that no
published trail matches gets one small record, so the app can show a page
that says what the walk is, how well known it is, what little is known about
it, that no open route data exists yet, and where to get the track.

    /trails/stubs/{CC}.json   { country, generated_at, n, stubs: [...] }

A stub is a registry row (data/trails/famous_registry.json, kind trail,
fame_score at or above TRAIL_FAME_THRESHOLD) that is NOT matched by a trail in
the country's published wire file, by OSM relation id or by folded name.

Which unmatched rows count as "cannot be built". When
data/reports/trails_coverage.json exists, its verdict decides: status
"matched" is skipped, and only the reasons no_osm_data, unresolved_seed,
way_only_not_derived and failed_continuity make a stub (below_quota,
unplaced and composed mean "we have not got to it", which is our gap and not
the world's, so no honest-stub line is true of them). When that report does
not exist yet (it does not today, T160-a), the fallback is the registry's own
evidence: a row with no OSM relation at all is an open-data gap, a row with
one is a way we have not derived yet and is left out. Every stub carries the
code it was judged on, so the page never claims more than the evidence did.

What is known about the walk is only what the registry holds: expected_km
(14 of 893 rows), the Wikipedia readers a month and language count, whether
OpenStreetMap has the relation. Length is printed when present; ascent and
season are not in the registry and are not invented.

The one outbound link, in order: the Waymarked Trails page of the relation
(it offers a GPX download for open relations), the OpenStreetMap relation,
the Wikipedia article. Never Komoot, AllTrails or Wikiloc: their tracks are
not open and Carta links only to what it can describe honestly (spec 6.5).

    python pipeline/trails/export_stubs.py --out /some/scratch/dir
    python pipeline/trails/export_stubs.py            (writes public/trails/stubs)

CARTA_DATA_ROOT points at a checkout that holds data/ and the trails wire,
the same variable coverage.py reads. Nothing here writes outside --out.
"""
import argparse
import json
import os
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DATA_ROOT = Path(os.environ.get("CARTA_DATA_ROOT") or ROOT)

TRAIL_FAME_THRESHOLD = 0.4          # the same bar coverage.py holds a country to
BUILDABLE_NOT = ("no_osm_data", "unresolved_seed", "way_only_not_derived",
                 "failed_continuity")
CODE_OF = {
    "no_osm_data": "no_open_data",
    "unresolved_seed": "no_open_data",
    "way_only_not_derived": "way_only_not_derived",
    "failed_continuity": "failed_continuity",
}

REGISTRY = DATA_ROOT / "data" / "trails" / "famous_registry.json"
TRAILS_COVERAGE = DATA_ROOT / "data" / "reports" / "trails_coverage.json"
WIRE = DATA_ROOT / "continent-app" / "public" / "trails"
COVERAGE_WIRE = DATA_ROOT / "continent-app" / "public" / "coverage.json"


def fold(name):
    s = unicodedata.normalize("NFKD", str(name or ""))
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return " ".join(s.lower().replace("-", " ").split())


def published_keys(cc):
    """OSM relation ids and folded names of every trail the wire publishes."""
    path = WIRE / f"{cc}.json"
    ids, names = set(), set()
    if not path.exists():
        return ids, names
    wire = json.loads(path.read_text(encoding="utf-8"))
    for t in (wire.get("trips") or []) + (wire.get("listed") or []):
        if t.get("osm"):
            ids.add(str(t["osm"]))
        if t.get("name"):
            names.add(fold(t["name"]))
    return ids, names


def link_for(row):
    ev = row.get("evidence") or {}
    way = ev.get("waymarked") or {}
    osm = ev.get("osm") or {}
    if way.get("relation_id"):
        return {"kind": "waymarked",
                "url": f"https://hiking.waymarkedtrails.org/#route?id={way['relation_id']}"}
    if osm.get("relation_id"):
        return {"kind": "osm",
                "url": f"https://www.openstreetmap.org/relation/{osm['relation_id']}"}
    wp = ev.get("wikipedia") or {}
    if wp.get("lang") and wp.get("title"):
        title = str(wp["title"]).replace(" ", "_")
        return {"kind": "wikipedia",
                "url": f"https://{wp['lang']}.wikipedia.org/wiki/{title}"}
    return None


def verdict(row, report_rows):
    """The code the stub was judged on, or None when the walk is not a stub."""
    got = report_rows.get(row["id"])
    if report_rows:
        if got is None or got.get("status") == "matched":
            return None
        reason = got.get("reason")
        return CODE_OF.get(reason) if reason in BUILDABLE_NOT else None
    osm = (row.get("evidence") or {}).get("osm") or {}
    way = (row.get("evidence") or {}).get("waymarked") or {}
    if osm.get("relation_id") or way.get("relation_id"):
        return None
    return "no_open_data"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "continent-app" / "public" / "trails" / "stubs"))
    ap.add_argument("--min-fame", type=float, default=TRAIL_FAME_THRESHOLD)
    args = ap.parse_args()

    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    report = {}
    if TRAILS_COVERAGE.exists():
        rep = json.loads(TRAILS_COVERAGE.read_text(encoding="utf-8"))
        report = {r["id"]: r for r in rep.get("rows") or []}
    nuts_names = {}
    if COVERAGE_WIRE.exists():
        regs = json.loads(COVERAGE_WIRE.read_text(encoding="utf-8")).get("regions") or {}
        nuts_names = {k: v.get("name") for k, v in regs.items() if v.get("name")}

    by_cc = {}
    for row in registry["rows"]:
        if row.get("kind") != "trail" or (row.get("fame_score") or 0) < args.min_fame:
            continue
        by_cc.setdefault(row["country"], []).append(row)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    total = 0
    for cc, rows in sorted(by_cc.items()):
        ids, names = published_keys(cc)
        stubs = []
        for row in rows:
            code = verdict(row, report)
            if not code:
                continue
            osm = (row.get("evidence") or {}).get("osm") or {}
            way = (row.get("evidence") or {}).get("waymarked") or {}
            rel = str(way.get("relation_id") or osm.get("relation_id") or "")
            if rel and rel in ids:
                continue
            if fold(row.get("name")) in names:
                continue
            ev = row.get("evidence") or {}
            wp = ev.get("wikipedia") or {}
            stubs.append({
                "id": row["id"],
                "name": row.get("name"),
                "cc": cc,
                "region": nuts_names.get(row.get("nuts3")),
                "fame": row.get("fame_score"),
                "km": row.get("expected_km"),
                "readers": wp.get("pageviews_avg"),
                "langs": ev.get("sitelinks"),
                "in_osm": bool(rel),
                "code": code,
                "link": link_for(row),
            })
        stubs.sort(key=lambda s: -(s["fame"] or 0))
        (out / f"{cc}.json").write_text(json.dumps(
            {"country": cc, "generated_at": now, "n": len(stubs), "stubs": stubs},
            ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        total += len(stubs)
    print(f"stubs: {total} across {len(by_cc)} countries -> {out}")


if __name__ == "__main__":
    sys.exit(main())
