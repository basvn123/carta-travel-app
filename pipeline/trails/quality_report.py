"""What the two scores are made of, what they came out at, and what published.

ROUTES.md R5. The trails layer carries two numbers and they answer different
questions, which is why neither replaces the other:

  quality_score  0-100, validate.py. Is this relation WELL FORMED: does the
                 line hold together, does it sit in its country, do the
                 elevation figures make sense, is it tagged enough to use.
                 It is an admission test, not a recommendation.
  rating         0-10, rate.py. Is the WALK any good: what you see, how much
                 the ground moves, whether anybody wrote about it, whether
                 anybody photographs it, what shape it is. Every component is
                 a percentile inside the route's own region or country, so a
                 Dutch walk is ranked against Dutch walks.

This module reports both and does not compute either. It also states where
each component ROUTES.md asked about actually lives, because "the score has
a designation term" and "the gate reads the network tier" are different
claims about different code, and the spec's list mixes them.

The publish threshold is NOT one number and this is where that is written
down. Publication is curate.py's gates plus the NUTS3 quota: a route must
clear the continuity gate, carry a real name, fall in the length band, and
then win a slot inside its region's budget against the other candidates
there. rate.py runs afterwards and scores only what curate.py chose, which
is why no row's rating decides whether it publishes. See the comment block
at the top of curate.py.

Usage, from the repo root (lab up):
    python pipeline/trails/quality_report.py
    python pipeline/trails/quality_report.py --top 20

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import connect  # noqa: E402
import rate as R  # noqa: E402
import validate as V  # noqa: E402

REPORT = ROOT / "data" / "reports" / "routes_quality.json"

# Every component ROUTES.md R5 named, and the honest answer about where it
# lives. "gate" means it decides publication; "score" means it moves a
# number; "absent" means it is in neither and why.
COMPONENTS = {
    "network tier": {
        "in_rating": "designation term, weight 0.13, via rate.NETWORK_LEVEL "
                     "(iwn 1.0, nwn 0.85, rwn 0.6, lwn 0.35, else 0.2)",
        "in_quality_score": "no",
        "in_gate": "curate.NETWORK_LEVEL is 0.24 of the selection rank",
        "in_wire": "net on the country row (R5), and the waymarked reason code",
    },
    "waymarking": {
        "in_rating": "no, and deliberately: osmc:symbol says a symbol is "
                     "painted, not that the route is worth walking. The "
                     "designation term already carries what a signed network "
                     "means, and scoring both would count one fact twice",
        "in_quality_score": "osmc:status is read, but only as corroboration "
                            "for a gap: a route flagged incomplete upstream "
                            "fails continuity rather than passing on a "
                            "technicality",
        "in_gate": "no",
        "in_wire": "f.way (presence of osmc:symbol) and waymark_ref",
    },
    "completeness": {
        "in_rating": "no",
        "in_quality_score": "continuity check, weight 30, from gap_info and a "
                            "fresh accepted repair",
        "in_gate": "HARD: curate refuses any route that is not one continuous "
                   "line",
        "in_wire": "bridges on the detail file when a line was spliced",
    },
    "tag richness": {
        "in_rating": "no",
        "in_quality_score": "completeness check, weight 20. Name, network and "
                            "description decide usability (80 of the check); "
                            "surface, sac_scale, operator, website and "
                            "description scale a 20 point bonus. ADDED in R5; "
                            "before that the check read three tags",
        "in_gate": "a real name is required",
        "in_wire": "no",
    },
    "OSM maturity": {
        "in_rating": "no",
        "in_quality_score": "no",
        "in_gate": "no",
        "in_wire": "no",
        "note": "OMITTED ON PURPOSE. Last-edited is not available: a public "
                "Geofabrik extract carries no object metadata. Member way "
                "count measures how finely the ways were split, not maturity: "
                "one path mapped as one way and the same path mapped as forty "
                "are the same walk, and scoring the count would reward "
                "fragmentation",
    },
    "named": {
        "in_rating": "no",
        "in_quality_score": "completeness: a nameless relation cannot pass",
        "in_gate": "HARD: curate.SYNTHETIC_PREFIX excludes 'OSM route 12345' "
                   "titles from the candidate query outright",
        "in_wire": "name",
    },
    "scenic context": {
        "in_rating": "scenery term, weight 0.22, the largest: weighted "
                     "scenic_pois features per kilometre from scenic.py, plus "
                     "a separate variety term (0.05) for distinct kinds",
        "in_quality_score": "no",
        "in_gate": "no",
        "in_wire": "f.hl codes and the reasons list",
    },
    "length": {
        "in_rating": "NO, and this is a rule: R5 forbids it. The shape term "
                     "paid a day-length bonus until 2026-09-13, which capped "
                     "what a long path could score; removed, shape is now "
                     "loop / point / out-and-back only",
        "in_quality_score": "no (distance is compared with the OSM tag as a "
                            "sanity check, which is not a quality judgement)",
        "in_gate": "yes, as a QUOTA: curate spends a budget per distance band "
                   "so a country's list is not all day loops. A budget is a "
                   "selection rule, not a mark",
        "in_wire": "distance_m",
    },
}


def buckets(values, width, lo=0.0, hi=100.0):
    """Half-open bands [b, b+width), except the last which closes at hi, so a
    perfect 100 lands in '90-100' rather than inventing a '100-110' band."""
    out = Counter()
    for v in values:
        if v is None:
            out["null"] += 1
            continue
        v = max(lo, min(hi, float(v)))
        b = min(int(v // width) * width, hi - width)
        out[f"{b:g}-{b + width:g}"] += 1
    return dict(sorted(out.items(),
                       key=lambda kv: (kv[0] == "null", _lo(kv[0]))))


def _lo(key):
    try:
        return float(key.split("-")[0])
    except ValueError:
        return 1e9


CYCLING_WIRE = ROOT / "continent-app" / "public" / "cycling"


def cycling_wire_counts():
    """What the cycling wire actually ships, read off disk."""
    out = {"rated": 0, "listed": 0, "ratings": [], "top": []}
    if not CYCLING_WIRE.is_dir():
        return out
    for path in sorted(CYCLING_WIRE.glob("*.json")):
        if path.stem in ("index", "top") or len(path.stem) != 2:
            continue
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        for row in doc.get("routes") or []:
            out["rated"] += 1
            if row.get("score") is not None:
                out["ratings"].append(float(row["score"]))
                out["top"].append({"id": row.get("id"), "country": path.stem,
                                   "name": row.get("name"),
                                   "rating": float(row["score"]),
                                   "network": row.get("net"),
                                   "km": row.get("km")})
        out["listed"] += len(doc.get("listed") or [])
    out["top"].sort(key=lambda r: (-r["rating"], r["id"] or 0))
    return out


def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--top", type=int, default=20)
    args = ap.parse_args()

    conn = connect()
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "models": {
            "quality_score": {"module": "pipeline/trails/validate.py",
                              "range": "0-100", "weights": V.CONFIG["weights"],
                              "question": "is this relation well formed"},
            "rating": {"module": "pipeline/trails/rate.py", "range": "0-10",
                       "model": R.MODEL, "weights": R.WEIGHTS,
                       "reference_class": f"NUTS3 region with at least "
                                          f"{R.REGION_MIN_ROWS} rows, else country",
                       "question": "is this walk worth the day"},
            "cycling_rating": {"module": "pipeline/cycling/cycle_index.py",
                               "range": "0-10"},
        },
        "publish_threshold": (
            "not a number. Publication is curate.py's gates (one continuous "
            "line, a real name, inside the length band, deduped) plus the "
            "NUTS3 quota from pipeline/regions/quotas.py. rate.py scores only "
            "what curate.py already chose, so no rating decides publication. "
            "The cycling layer does gate on its score (5.4) and on photographs, "
            "which is why its listed tier is large."),
        "components": COMPONENTS,
    }

    with conn.cursor() as cur:
        cur.execute("""
            SELECT country, tier, status::text, quality_score, rating
            FROM trips WHERE category = 'hike' AND source IN ('osm', 'osm_ways')""")
        rows = cur.fetchall()
        # The cycling layer never promotes a row to 'published': its export
        # gates on the score and the photo count at write time and leaves the
        # status alone, so "published" for cycling means "in the wire", and
        # the wire is the only place that knows. Counting status here would
        # report zero for a layer with 504 rated routes on disk.
        cur.execute("""
            SELECT country, tier, status::text, rating FROM cycle_routes""")
        crows = cur.fetchall()
        cyc_wire = cycling_wire_counts()

        pub = [r for r in rows if r[2] == "published"]
        report["hiking"] = {
            "staged": len(rows),
            "published": len(pub),
            "published_rated": sum(1 for r in pub if r[1] != "l"),
            "published_listed": sum(1 for r in pub if r[1] == "l"),
            "quality_score_distribution_staged": buckets([r[3] for r in rows], 10),
            "quality_score_distribution_published": buckets([r[3] for r in pub], 10),
            "rating_distribution_published": buckets(
                [float(r[4]) for r in pub if r[4] is not None], 1, 0, 10),
        }
        report["cycling"] = {
            "staged": len(crows),
            "scored": sum(1 for r in crows if r[3] is not None),
            "published": cyc_wire["rated"] + cyc_wire["listed"],
            "published_rated": cyc_wire["rated"],
            "published_listed": cyc_wire["listed"],
            "published_source": "continent-app/public/cycling (the wire), "
                                "because export_cycling.py gates at write time "
                                "and never sets status='published'",
            "rating_distribution_staged": buckets(
                [float(r[3]) for r in crows if r[3] is not None], 1, 0, 10),
            "rating_distribution_published": buckets(cyc_wire["ratings"], 1, 0, 10),
        }

        cur.execute("""
            SELECT country,
                   count(*) FILTER (WHERE source IN ('osm','osm_ways')) AS staged,
                   count(*) FILTER (WHERE status='published') AS published,
                   count(*) FILTER (WHERE status='published' AND tier <> 'l') AS rated,
                   count(*) FILTER (WHERE status='published' AND tier='l') AS listed,
                   round(avg(rating) FILTER (WHERE status='published'), 2) AS avg_rating
            FROM trips WHERE category = 'hike'
            GROUP BY country ORDER BY country""")
        per_country = {}
        for cc, staged, published, rated, listed, avg in cur.fetchall():
            per_country[cc] = {"staged": staged, "published": published,
                               "rated": rated, "listed": listed,
                               "avg_rating": float(avg) if avg is not None else None}
        cur.execute("""
            SELECT country, count(*), count(*) FILTER (WHERE status='published')
            FROM cycle_routes GROUP BY country ORDER BY country""")
        for cc, staged, published in cur.fetchall():
            per_country.setdefault(cc, {})["cycling_staged"] = staged
            per_country[cc]["cycling_published"] = published
        report["per_country"] = per_country

        # A country publishing nothing: is that the bar or the coverage?
        thin = {}
        for cc, v in per_country.items():
            if (v.get("published") or 0) <= 1:
                staged = v.get("staged") or 0
                thin[cc] = {
                    **v,
                    "diagnosis": ("coverage: OSM has almost no route relations "
                                  "here" if staged <= 5 else
                                  "the bar: relations exist but none clears the "
                                  "continuity and naming gates")}
        report["countries_publishing_one_or_none"] = thin

        # The top list, one per country. The rating is a percentile inside a
        # region or country, so the ceiling is reached in every country by
        # construction: a bare ORDER BY rating returns 52 rows tied at 9.8 and
        # the first twenty alphabetically, which says nothing about the
        # catalogue. One per country is the list a reader could sanity check.
        cur.execute("""
            SELECT DISTINCT ON (country) id, country, title, rating, network,
                   distance_m
            FROM trips
            WHERE status = 'published' AND rating IS NOT NULL
              AND category = 'hike'
            ORDER BY country, rating DESC, id""")
        best = [{"id": i, "country": cc, "name": n, "rating": float(r),
                 "network": net, "km": round((d or 0) / 1000, 1)}
                for i, cc, n, r, net, d in cur.fetchall()]
        best.sort(key=lambda r: (-r["rating"], r["country"]))
        report.setdefault("top", {})["hiking"] = best[:args.top]
        report["top"]["cycling"] = cyc_wire["top"][:args.top]
    conn.close()

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n",
                      encoding="utf-8")

    h, c = report["hiking"], report["cycling"]
    print(f"hiking: {h['staged']:,} staged, {h['published']:,} published "
          f"({h['published_rated']:,} rated, {h['published_listed']} listed)")
    print(f"  quality_score, published: {h['quality_score_distribution_published']}")
    print(f"  rating, published:        {h['rating_distribution_published']}")
    print(f"cycling: {c['staged']:,} staged, {c['published']:,} in the wire "
          f"({c['published_rated']} rated, {c['published_listed']:,} listed)")
    print(f"  rating, in the wire: {c['rating_distribution_published']}")
    if report["countries_publishing_one_or_none"]:
        print("countries publishing one route or none:")
        for cc, v in report["countries_publishing_one_or_none"].items():
            print(f"  {cc}: {v.get('staged', 0)} staged, "
                  f"{v.get('published', 0)} published, {v['diagnosis']}")
    for activity, rows_ in report["top"].items():
        print(f"top {len(rows_)} {activity} (best in each country):")
        for r in rows_:
            print(f"  {r['rating']:.1f}  {r['country']}  {r['name'][:52]:<52} "
                  f"{r['km']:>7.1f} km  {r['network'] or '-'}")
    print(f"report: {REPORT.relative_to(ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
