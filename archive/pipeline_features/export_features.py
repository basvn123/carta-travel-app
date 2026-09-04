"""export_features.py - publish the ranked features as the app's wire.

Stage 6, the last one (see features_common.py for the stage map). Everything
before this works on a 25 MB record with provenance, score parts and gate
ledgers in it. The browser needs none of that: it needs enough to draw a
country card, a list row, a map pin and a legally correct photo credit.

    data/derived/features.json   ->  continent-app/public/features/<ISO2>.json
                                     continent-app/public/features/index.json

What ships, and why it is not the derived artifact:

  * tiers 1 and 2 only, unless --all. Tier 3 is the long tail the ranker keeps
    for completeness, not a list to hand a person.
  * one file per country, so a country card fetches one file and the app never
    holds every beach in Europe in memory.
  * every priced country gets a file, even a landlocked one with nothing above
    tier 3. Under public/ a missing JSON is served as the SPA's index.html with
    status 200, so "no file" reaches the app as HTML that parses as neither
    JSON nor an error. The trails wire learnt this the hard way.
  * attribution by key on the feature, the citation once per file. The photo's
    TASL row stays on the feature because that is a per-file legal obligation,
    but repeating "OpenStreetMap contributors" 6,000 times is bytes, not
    compliance.
  * the inferred natura2000 label is deliberately NOT shipped. It is OSM's
    protect_class read as a habitat site: good enough to weight a score with,
    not good enough to print as a designation.

THE GATE. This script refuses to run unless validate_features.py has passed on
exactly the artifact on disk right now: same timestamp, same sha1. A verdict
about a file that has since been rewritten is not a verdict, and "it passed
yesterday" is how bad data ships.

Idempotent: a rerun overwrites the same files from the same input. A
--countries run leaves the other countries' files alone and reads them back so
index.json keeps describing everything on disk.

Usage:
    python pipeline/features/export_features.py
    python pipeline/features/export_features.py --all
    python pipeline/features/export_features.py --countries ES,GR --dry-run
"""
import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from features_common import (FEATURES, VALIDATION_REPORT, WIRE_DIR,
                             catalogue_countries, load_json, log, slugify)
from rank_features import INFERRED_DESIGNATIONS
from validate_features import sha1_of

WIRE_DECIMALS = 5                # about 1 m of longitude, below any map need
SCORE_DECIMALS = 3

# Short keys for the citations, resolved once per country file.
SOURCE_KEYS = {
    "openstreetmap.org": "osm",
    "eea.europa.eu": "eea",
    "whc.unesco.org": "whc",
    "wikimedia.org": "commons",
}


def source_key(src):
    url = src.get("url") or ""
    for host, key in SOURCE_KEYS.items():
        if host in url:
            return key
    return slugify(src.get("name") or "source")[:16] or "source"


# --------------------------------------------------------------------------- #
# the gate
# --------------------------------------------------------------------------- #
def gate_ok():
    """(ok, message). Everything that has to be true before a byte is written."""
    report = load_json(VALIDATION_REPORT)
    if not report:
        return False, (f"no validation report at {VALIDATION_REPORT}: run "
                       f"pipeline/features/validate_features.py first")
    if report.get("verdict") != "pass":
        hard = report.get("hard") or {}
        worst = ", ".join(f"{k} x{v['count']}" for k, v in sorted(
            hard.items(), key=lambda kv: -kv[1]["count"])[:4])
        return False, (f"validation verdict is {report.get('verdict')!r}: "
                       f"{worst or 'see the report'}")
    src = report.get("source") or {}
    if not src.get("sha1"):
        return False, ("the validation report predates the sha1 stamp: "
                       "re-run validate_features.py")
    actual = sha1_of(FEATURES)
    if src["sha1"] != actual:
        return False, (f"the report validated a different file "
                       f"({src['sha1'][:12]} != {actual[:12]}): features.json "
                       f"has been rewritten since, re-run validate_features.py")
    return True, (f"validation passed {src.get('generated_at')} "
                  f"({src.get('n_features')} features, sha1 {actual[:12]})")


# --------------------------------------------------------------------------- #
# shaping
# --------------------------------------------------------------------------- #
def wire_item(f, keys):
    """One feature as the country file carries it. Absent fields are dropped
    rather than shipped as null: the app checks for presence anyway, and most
    of these are empty on most rows."""
    item = {
        "id": f["id"],
        "kind": f["kind"],
        "name": f["name"],
        "lat": round(f["lat"], WIRE_DECIMALS),
        "lon": round(f["lon"], WIRE_DECIMALS),
        "tier": f["tier"],
        "rank": f["rank_in_country"],
        "score": round(f["score"], SCORE_DECIMALS),
    }
    if f.get("name_local") and f["name_local"] != f["name"]:
        item["name_local"] = f["name_local"]
    water = (f.get("water") or {}).get("class")
    if water:
        item["water"] = water
    for key, field in (("elevation", "elevation_m"),
                       ("prominence", "prominence_m")):
        if f.get(field) is not None:
            item[key] = round(f[field])
    near = f.get("near") or {}
    if near.get("dest_id"):
        item["near"] = {"city": near.get("city"), "dest_id": near["dest_id"],
                        "km": near.get("km")}
    img = f.get("image")
    if img:
        shot = {"url": img.get("url"), "author": img.get("author"),
                "licence": img.get("licence"),
                "licence_url": img.get("licence_url"),
                "source": img.get("source")}
        if img.get("thumb") and img["thumb"] != img.get("url"):
            shot["thumb"] = img["thumb"]
        item["image"] = {k: v for k, v in shot.items() if v}
    shown = [d for d in f.get("designations") or []
             if d not in INFERRED_DESIGNATIONS]
    if shown:
        item["designations"] = shown
    if f.get("wikipedia"):
        item["wikipedia"] = f["wikipedia"]
    srcs = f.get("sources") or []
    if srcs:
        item["sources"] = sorted({source_key(s) for s in srcs})
        for s in srcs:
            keys.setdefault(source_key(s),
                            {"name": s.get("name"), "url": s.get("url")})
    return item


def country_file(iso2, country, rows, tiers, generated_at):
    keys = {}
    items = [wire_item(f, keys) for f in rows]
    counts = Counter(f["kind"] for f in rows)
    doc = {
        "country": iso2,
        "country_name": country,
        "generated_at": generated_at,
        "tiers": sorted(tiers),
        "counts": {"beach": counts["beach"], "mountain": counts["mountain"]},
        "sources": dict(sorted(keys.items())),
        "features": items,
    }
    years = sorted({(f.get("water") or {}).get("year") for f in rows} - {None})
    if years:
        # One bathing season for the whole layer, stated once, so a water class
        # in the wire is never read as a claim about this summer.
        doc["bathing_year"] = years[-1]
    return doc


def top_name(rows, kind):
    """The country's best of a kind: rank 1, whatever tier filter applied."""
    best = [f for f in rows if f.get("kind") == kind]
    if not best:
        return None
    return min(best, key=lambda f: (f.get("rank") or f.get("rank_in_country")
                                    or 10 ** 6, f["id"]))["name"]


# --------------------------------------------------------------------------- #
# writes
# --------------------------------------------------------------------------- #
def render(payload):
    """The exact bytes a file would hold. Rendering separately from writing is
    what lets --dry-run report the real wire size instead of zero."""
    # Compact: these are fetched by the browser, not read by hand.
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def write_json(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def previous_countries(out_dir, wanted):
    """Index rows for the country files this run does not touch, so
    `--countries ES` can not rewrite index.json into a one-country index while
    40 other files still sit on disk."""
    kept = {}
    for path in sorted(out_dir.glob("*.json")):
        code = path.stem
        if code == "index" or code in wanted or not re.fullmatch(r"[A-Z]{2}", code):
            continue
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        counts = doc.get("counts") or {}
        feats = doc.get("features") or []
        kept[code] = {
            "beaches": counts.get("beach", 0),
            "mountains": counts.get("mountain", 0),
            "top_beach": top_name(feats, "beach"),
            "top_mountain": top_name(feats, "mountain"),
            "file": f"/features/{code}.json",
        }
    return kept


# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--all", action="store_true",
                    help="include tier 3, the long tail (default: tiers 1+2)")
    ap.add_argument("--countries", help="comma separated ISO2 list, e.g. ES,GR")
    ap.add_argument("--out", default=str(WIRE_DIR), help="output directory")
    ap.add_argument("--dry-run", action="store_true",
                    help="report what would be written, write nothing")
    args = ap.parse_args()

    ok, message = gate_ok()
    log(("gate: " if ok else "REFUSING TO EXPORT: ") + message)
    if not ok:
        return 1

    doc = load_json(FEATURES)
    features = doc["features"]
    countries = catalogue_countries()
    tiers = {1, 2, 3} if args.all else {1, 2}
    only = {c.strip().upper()
            for c in (args.countries or "").split(",") if c.strip()}

    by_country = defaultdict(list)
    for f in features:
        if f["tier"] in tiers:
            by_country[f["iso2"]].append(f)
    for rows in by_country.values():
        rows.sort(key=lambda f: (f["kind"], f["rank_in_country"]))

    # Every priced country gets a file, and a country whose features all sit in
    # tier 3 gets an empty one rather than no file at all.
    wanted = sorted(set(countries) | set(by_country))
    if only:
        wanted = [c for c in wanted if c in only]
    out_dir = Path(args.out)
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    index, total, sizes = {}, 0, []
    for iso2 in wanted:
        rows = by_country.get(iso2, [])
        payload = country_file(iso2, countries.get(iso2), rows, tiers,
                               generated_at)
        text = render(payload)
        size = len(text.encode("utf-8"))
        if not args.dry_run:
            write_json(out_dir / f"{iso2}.json", text)
        total += size
        sizes.append((size, iso2, len(rows)))
        index[iso2] = {
            "beaches": payload["counts"]["beach"],
            "mountains": payload["counts"]["mountain"],
            "top_beach": top_name(payload["features"], "beach"),
            "top_mountain": top_name(payload["features"], "mountain"),
            "file": f"/features/{iso2}.json",
        }
    if only:
        index.update(previous_countries(out_dir, set(wanted)))

    index_doc = {
        "generated_at": generated_at,
        "tiers": sorted(tiers),
        "n_features": sum(v["beaches"] + v["mountains"] for v in index.values()),
        "countries": dict(sorted(index.items())),
    }
    index_text = render(index_doc)
    total += len(index_text.encode("utf-8"))
    if not args.dry_run:
        write_json(out_dir / "index.json", index_text)

    log("")
    log(f"{'would write' if args.dry_run else 'wrote'} {len(wanted)} country "
        f"files + index.json to {out_dir}")
    log(f"  {index_doc['n_features']} features shipped of {len(features)} "
        f"ranked (tiers {sorted(tiers)})")
    log(f"  {total / 1024:.0f} KB total, "
        f"{total / max(1, index_doc['n_features']):.0f} bytes per feature")
    sizes.sort(reverse=True)
    for size, iso2, n in sizes[:8]:
        log(f"  {iso2}.json {size / 1024:>7.1f} KB  {n:>5} features")
    empty = [iso2 for iso2, v in index.items()
             if not v["beaches"] and not v["mountains"]]
    if empty:
        log(f"  empty (nothing above tier 3): {', '.join(sorted(empty))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
