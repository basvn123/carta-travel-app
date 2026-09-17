"""Registry versus published: which famous walks are missing, and why.

CARTA_TRAILS_BUILD_BRIEF.md Phase 1, second half. famous_registry.py says
what SHOULD be published in a region. This says what IS, matches the two,
and gives every miss exactly one reason code. It is the instrument the rest
of the trails work is measured by, and it is expected to ship red: Phase 1
builds the thermometer, Phases 2-5 bring the temperature down.

The rule it exists to enforce, from docs/TRAILS_DATA_QUALITY.md:

    A region is only covered when a traveller searching for that region's
    best-known walks finds them here, under the names they searched for.

Matching, per the brief. A registry row is matched when a published trail
satisfies EITHER test, because either one alone is wrong:

  geometric  the published line passes within 250 m of the registry
             coordinate, its length is within +-40% where expected_km is
             known, AND its name is related to the registry name. Catches a
             trail published under a local spelling or a ref. The name test
             is not in the brief and was added after measuring: without it,
             "a line passes near this point" matched Chemin de Stevenson
             Part 6 to Part 5 and matched summits to whatever path crossed
             them, reporting 4.8% coverage in France where the true figure
             was 1.3%. In walking country every point has a line within
             250 m, so proximity alone proves nothing.
  nominal    normalised name or alias equality, after stripping accents,
             section markers and refs. Catches a trail whose registry
             coordinate is a summit or a trailhead some way off the line,
             which is common: a Wikidata point for a gorge walk is the
             gorge, not the path.

Reason codes for everything unmatched, one each:

  no_osm_data          nothing in OSM to build from. The world's gap, not
                       ours. Allowed to ship.
  way_only_not_derived named ways exist and chaining never ran or failed.
                       OURS. This is the Sentier des Roches code.
  failed_continuity    geometry exists but broke the single-line gate.
                       OURS for a day walk; parents are exempt (Phase 3).
  below_quota          ingested and eligible but not selected. OURS when
                       the region has not published its top three.
  out_of_scope         outside the 43-country catalogue, or not a walk.
  composed             built by carta_compose and human approved.
  unresolved_seed      a seeded name that resolved to no evidence at all.
  unplaced             OSM has it, but its registry coordinate fell in no
                       region, so no region can be held to it. Usually a
                       cross-border route (the German Jakobswege clipping
                       Alsace) whose point landed over the line. Reported,
                       not gating, because the fault is in the point rather
                       than in the catalogue.

Build-failing rule (--strict): the run fails when any region's TOP THREE
registry rows by fame_score are unmatched with a code in
{way_only_not_derived, failed_continuity, below_quota}. Those three are our
bugs. no_osm_data and out_of_scope are the world's, and are allowed through
with a note, which is the difference between a gate and a wish.

Reads the PUBLISHED WIRE (continent-app/public/trails/*.json), not the
staging DB, on purpose: the wire is what a traveller actually gets, it is
what the audit measured, and it means this report runs when the lab is down.

Usage, from the repo root:
    python pipeline/trails/coverage_report.py --all
    python pipeline/trails/coverage_report.py --countries FR,CH --verbose
    python pipeline/trails/coverage_report.py --all --strict

Writes data/reports/trails_coverage.json and trails_coverage.md, both
committed so a regression shows up in a diff.

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import math
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "regions"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from famous_registry import REGISTRY, base_name, squash  # noqa: E402

WIRE = ROOT / "continent-app" / "public" / "trails"
OUT_JSON = ROOT / "data" / "reports" / "trails_coverage.json"
OUT_MD = ROOT / "data" / "reports" / "trails_coverage.md"

# The brief's numbers, not invented here.
MATCH_M = 250.0          # how near the line must pass the registry point
LEN_TOLERANCE = 0.40     # +-40% when expected_km is known
TOP_N = 3                # the rows a region is HELD TO
DEG_KM = 111.32

# Codes the gate refuses to let ship. The other codes describe the world;
# these three describe this pipeline.
OUR_BUGS = {"way_only_not_derived", "failed_continuity", "below_quota"}


def load_json(path, default=None):
    p = Path(path)
    if not p.exists():
        return default
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return default


# ---------------------------------------------------------------------------
# The published side
# ---------------------------------------------------------------------------

def load_published(countries):
    """Every published trail, with the few fields matching needs.

    Reads the per-country wire files. index.json and top.json are roll-ups
    and are skipped, or every row would be counted twice."""
    rows = []
    for path in sorted(WIRE.glob("*.json")):
        cc = path.stem.upper()
        if cc in ("INDEX", "TOP") or (countries and cc not in countries):
            continue
        blob = load_json(path, {}) or {}
        for t in blob.get("trips") or []:
            rows.append({
                "id": t.get("id"), "name": t.get("name") or "",
                "country": t.get("country") or cc,
                "nuts3": (t.get("rg") or {}).get("n3"),
                "range": (t.get("rg") or {}).get("ra"),
                "distance_m": t.get("distance_m") or 0,
                "bbox": t.get("bbox"),
                "geometry": t.get("geometry"),
                "t": t.get("t"),
            })
    return rows


def line_points(geometry):
    """Every vertex of a (Multi)LineString, as (lon, lat) pairs."""
    if not geometry:
        return []
    kind = geometry.get("type")
    coords = geometry.get("coordinates") or []
    if kind == "LineString":
        return [c for c in coords if isinstance(c, (list, tuple))
                and len(c) >= 2]
    if kind == "MultiLineString":
        out = []
        for part in coords:
            out += [c for c in part if isinstance(c, (list, tuple))
                    and len(c) >= 2]
        return out
    return []


def near_line(lat, lon, row, limit_m=MATCH_M):
    """True when the published line passes within limit_m of the point.

    bbox first, as a cheap reject with the limit added as a margin, then the
    vertices. Vertex distance rather than true segment distance: the wire is
    simplified to a few tens of metres, so the error is small against a
    250 m threshold, and it keeps this a pure-python report with no PostGIS
    dependency (the point of reading the wire at all)."""
    box = row.get("bbox")
    margin = limit_m / 1000.0 / DEG_KM
    if box and len(box) == 4:
        if not (box[0] - margin <= lon <= box[2] + margin
                and box[1] - margin <= lat <= box[3] + margin):
            return False
    pts = line_points(row.get("geometry"))
    if not pts:
        return False
    coslat = math.cos(math.radians(lat)) or 1e-6
    lim_deg2 = (limit_m / 1000.0 / DEG_KM) ** 2
    for lon2, lat2 in pts:
        dy = lat2 - lat
        dx = (lon2 - lon) * coslat
        if dx * dx + dy * dy <= lim_deg2:
            return True
    return False


# Words too common to prove two trail names mean the same walk. A shared
# "sentier" or "tour" says only that both are French and both are walks.
STOPWORDS = {
    "gr", "e", "de", "du", "des", "la", "le", "les", "el", "il", "der",
    "die", "das", "den", "dem", "von", "van", "sentier", "chemin", "tour",
    "trail", "path", "way", "weg", "wanderweg", "route", "circuit", "boucle",
    "sendero", "camino", "ruta", "via", "sentiero", "pot", "staza", "szlak",
    "stezka", "traseu", "parte", "part", "etappe", "etape", "stage", "tappa",
    "north", "south", "east", "west", "nord", "sud", "est", "ouest", "national",
    "park", "grande", "randonnee", "walk", "loop", "circular", "st", "saint",
}


def names_related(reg_keys, pub):
    """True when a published name plausibly names the same walk.

    Containment after normalisation, or one shared word that is not a
    stopword. Deliberately generous, because it only ever ADDS a geometric
    match that already passed the 250 m and length tests; its job is to stop
    a nearby but unrelated line being reported as the famous walk."""
    pub_keys = name_keys(pub)
    for rk in reg_keys:
        for pk in pub_keys:
            if not rk or not pk:
                continue
            if rk in pk or pk in rk:
                return True
            rw = {w for w in rk.split() if w not in STOPWORDS and len(w) > 2}
            pw = {w for w in pk.split() if w not in STOPWORDS and len(w) > 2}
            if rw & pw:
                return True
    return False


def name_keys(row):
    """Every normalised name a published row answers to."""
    keys = set()
    for text in (row.get("name"),):
        if not text:
            continue
        keys.add(squash(text))
        keys.add(squash(base_name(text)))
    return {k for k in keys if k}


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------

def match_registry(reg_rows, pub_rows, verbose=False):
    """Attach a status and, when unmatched, a reason code to every row."""
    by_name = defaultdict(list)
    by_country = defaultdict(list)
    for p in pub_rows:
        by_country[p["country"]].append(p)
        for k in name_keys(p):
            by_name[k].append(p)

    for r in reg_rows:
        keys = {squash(r["name"]), squash(base_name(r["name"]))}
        for a in r.get("aliases") or []:
            keys |= {squash(a), squash(base_name(a))}
        keys = {k for k in keys if k}

        nominal = None
        for k in keys:
            for p in by_name.get(k, []):
                # A name match in the wrong country is a coincidence, not a
                # match: "Rysy" is on the PL/SK border and both publish one.
                if p["country"] == r["country"]:
                    nominal = p
                    break
            if nominal:
                break

        # Geometric matching is deliberately NOT "some line passes near the
        # point". In a walking region every point has a line within 250 m, so
        # that rule matched Chemin de Stevenson Part 6 to Part 5 and a
        # registry summit to whatever path crossed it, inflating the matched
        # count with answers that are not the thing asked for.
        #
        # A geometric match therefore also needs the published name to be
        # RELATED to the registry name: one contained in the other after
        # normalisation, or a shared distinctive word. That still catches the
        # case geometry is for (a trail published under a local spelling or a
        # ref) without claiming a neighbouring path is the walk.
        geometric = None
        if r.get("lat") is not None:
            expect_m = (r.get("expected_km") or 0) * 1000.0
            for p in by_country.get(r["country"], []):
                if not near_line(r["lat"], r["lon"], p):
                    continue
                if expect_m > 0 and p["distance_m"]:
                    lo = expect_m * (1 - LEN_TOLERANCE)
                    hi = expect_m * (1 + LEN_TOLERANCE)
                    if not (lo <= p["distance_m"] <= hi):
                        continue
                if not names_related(keys, p):
                    continue
                geometric = p
                break

        hit = nominal or geometric
        r["match"] = None
        if hit:
            r["status"] = "matched"
            r["reason"] = "matched"
            r["match"] = {"id": hit["id"], "name": hit["name"],
                          "how": "nominal" if nominal else "geometric",
                          "nuts3": hit["nuts3"]}
        else:
            r["status"] = "missing"
            r["reason"] = reason_for(r)
    return reg_rows


def reason_for(r):
    """Exactly one code for an unmatched row, from its own evidence.

    Order matters: the most actionable, most specific claim wins, so a row
    that COULD have been derived is never filed under a code that excuses
    it. That is the whole difference between a report that drives work and
    one that explains failure away."""
    if r.get("unresolved"):
        return "unresolved_seed"
    osm = r.get("evidence", {}).get("osm") or {}
    if not r.get("nuts3"):
        # No region. Two very different situations share this symptom and
        # calling both out_of_scope was wrong: the German Jakobswege that
        # clip France are real routes whose coordinate landed over the
        # border, not things outside the catalogue.
        if osm.get("named_ways") or osm.get("relation_id"):
            return "unplaced"
        return "out_of_scope"
    if osm.get("named_ways"):
        # OSM has named, fame-tagged ways for this trail and nothing
        # published matches. This is the Sentier des Roches case and it is
        # ours to fix in Phase 2.
        return "way_only_not_derived"
    if osm.get("relation_id"):
        # A relation exists and did not reach the wire. It was either cut by
        # the continuity gate or lost the quota; curate.py's own reporting
        # is what tells them apart, so name the gate we can prove.
        return "failed_continuity"
    if r.get("evidence", {}).get("wikidata"):
        # Somebody wrote it up and OSM has nothing hiking-ish tagged for it.
        return "no_osm_data"
    return "no_osm_data"


# ---------------------------------------------------------------------------
# Rolling up
# ---------------------------------------------------------------------------

def by_region(reg_rows, pub_rows):
    """Per NUTS3: quota, published count, registry rows, and the top three."""
    pub_count = Counter(p["nuts3"] for p in pub_rows if p["nuts3"])
    regions = defaultdict(list)
    for r in reg_rows:
        if r.get("nuts3"):
            regions[r["nuts3"]].append(r)

    try:
        import quotas
        have_quota = quotas.has_data()
    except Exception:
        quotas, have_quota = None, False

    out = {}
    for n3, rows in regions.items():
        rows.sort(key=lambda r: -(r.get("fame_score") or 0))
        # The gate holds a region to its best-known WALKS. Summits, lakes and
        # waterfalls stay in the report and in the ranking, but a region is
        # not failed for them: "no published trail matches this lake" is a
        # much weaker claim than "this named path is missing", and mixing
        # the two buries the second under the first.
        top = [r for r in rows if r.get("kind") == "trail"][:TOP_N]
        target = None
        if have_quota:
            try:
                target = quotas.published_target(n3, "trail")
            except Exception:
                target = None
        blockers = [r for r in top
                    if r["status"] != "matched" and r["reason"] in OUR_BUGS]
        out[n3] = {
            "country": rows[0]["country"],
            "published": pub_count.get(n3, 0),
            "quota": target,
            "registry_rows": len(rows),
            "matched": sum(1 for r in rows if r["status"] == "matched"),
            "trail_rows": sum(1 for r in rows if r.get("kind") == "trail"),
            "top3": [{"id": r["id"], "name": r["name"],
                      "fame_score": r["fame_score"],
                      "status": r["status"], "reason": r["reason"]}
                     for r in top],
            "blockers": [r["id"] for r in blockers],
        }
    return out


def render_md(payload):
    c = payload["counts"]
    lines = []
    add = lines.append
    add("# Trails coverage: the famous-trail registry versus the wire")
    add("")
    add(f"Generated {payload['generated_at']} by "
        "`pipeline/trails/coverage_report.py`.")
    add("")
    add("This report answers one question: for every region Carta covers, "
        "are that region's best-known walks published? A miss is never "
        "silence; it carries a reason code, and three of those codes are "
        "this pipeline's bugs rather than the world's gaps.")
    add("")
    add("## Totals")
    add("")
    add("| Measure | Value |")
    add("|---|---|")
    add(f"| Registry rows | {c['registry_rows']:,} |")
    add(f"| Matched | {c['matched']:,} ({c['matched_pct']}%) |")
    add(f"| Missing | {c['missing']:,} |")
    add(f"| Published rows read | {c['published_rows']:,} |")
    add(f"| Regions with a registry row | {c['regions']:,} |")
    add(f"| Regions failing the top-three gate | {c['regions_failing']:,} |")
    add("")
    add("## Why the misses are missing")
    add("")
    add("| Reason | Rows | Ours? |")
    add("|---|---|---|")
    for code, n in payload["reasons"].items():
        add(f"| `{code}` | {n:,} | "
            f"{'**yes**' if code in OUR_BUGS else 'no'} |")
    add("")
    add("`way_only_not_derived`, `failed_continuity` and `below_quota` are "
        "the codes the strict gate refuses. They mean the data exists and "
        "this pipeline did not carry it through.")
    add("")
    add("## Worst 20 misses by fame score")
    add("")
    add("| Trail | Country | Region | Fame | Reason |")
    add("|---|---|---|---|---|")
    for r in payload["worst"]:
        add(f"| {r['name']} | {r['country']} | {r['nuts3'] or 'n/a'} | "
            f"{r['fame_score']:.3f} | `{r['reason']}` |")
    add("")
    add("## Regions failing the top-three gate")
    add("")
    if not payload["failing_regions"]:
        add("None.")
    else:
        add("| Region | Country | Published | Quota | Blocking rows |")
        add("|---|---|---|---|---|")
        for n3, row in payload["failing_regions"][:60]:
            names = ", ".join(t["name"] for t in row["top3"]
                              if t["status"] != "matched"
                              and t["reason"] in OUR_BUGS)
            add(f"| {n3} | {row['country']} | {row['published']} | "
                f"{row['quota'] if row['quota'] is not None else 'n/a'} | "
                f"{names} |")
    add("")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", default="",
                    help="ISO2 list (default: whatever the registry holds)")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--strict", action="store_true",
                    help="exit 1 when a region's top three carry our own "
                         "reason codes")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    reg = load_json(REGISTRY)
    if not reg:
        print(f"! no registry at {REGISTRY}")
        print("  run: python pipeline/trails/famous_registry.py --all")
        return 2
    reg_rows = reg.get("rows") or []

    countries = set()
    if args.countries:
        countries = {c.strip().upper() for c in args.countries.split(",")
                     if c.strip()}
    elif not args.all:
        countries = {r["country"] for r in reg_rows}
    if countries:
        reg_rows = [r for r in reg_rows if r["country"] in countries]

    pub = load_published(countries)
    print(f"coverage: {len(reg_rows):,} registry row(s) against "
          f"{len(pub):,} published row(s)")

    match_registry(reg_rows, pub, verbose=args.verbose)
    regions = by_region(reg_rows, pub)

    matched = [r for r in reg_rows if r["status"] == "matched"]
    missing = [r for r in reg_rows if r["status"] != "matched"]
    reasons = Counter(r["reason"] for r in missing)
    failing = sorted(((n3, row) for n3, row in regions.items()
                      if row["blockers"]),
                     key=lambda kv: -len(kv[1]["blockers"]))
    worst = sorted(missing,
                   key=lambda r: (r.get("kind") != "trail",
                                  -(r.get("fame_score") or 0)))[:20]

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(
            timespec="seconds"),
        "registry_generated_at": reg.get("generated_at"),
        "match_rules": {"within_m": MATCH_M,
                        "length_tolerance": LEN_TOLERANCE,
                        "top_n": TOP_N},
        "counts": {
            "registry_rows": len(reg_rows),
            "trail_rows": sum(1 for r in reg_rows if r.get("kind") == "trail"),
            "place_rows": sum(1 for r in reg_rows if r.get("kind") != "trail"),
            "matched": len(matched),
            "matched_pct": (round(100.0 * len(matched) / len(reg_rows), 1)
                            if reg_rows else 0.0),
            "missing": len(missing),
            "published_rows": len(pub),
            "regions": len(regions),
            "regions_failing": len(failing),
        },
        "reasons": dict(reasons.most_common()),
        "our_bugs": sorted(OUR_BUGS),
        "worst": [{"id": r["id"], "name": r["name"], "country": r["country"],
                   "nuts3": r.get("nuts3"), "kind": r.get("kind"),
                   "fame_score": r["fame_score"],
                   "reason": r["reason"]} for r in worst],
        "failing_regions": failing,
        "regions": regions,
        "rows": [{"id": r["id"], "name": r["name"], "country": r["country"],
                  "nuts3": r.get("nuts3"), "range": r.get("range"),
                  "kind": r.get("kind"),
                  "fame_score": r["fame_score"], "status": r["status"],
                  "reason": r["reason"], "match": r.get("match")}
                 for r in reg_rows],
    }
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=1),
                        encoding="utf-8")
    OUT_MD.write_text(render_md(payload), encoding="utf-8")

    print()
    print(f"  matched            {len(matched):,} "
          f"({payload['counts']['matched_pct']}%)")
    print(f"  missing            {len(missing):,}")
    for code, n in reasons.most_common():
        flag = "  <- ours" if code in OUR_BUGS else ""
        print(f"      {code:22} {n:,}{flag}")
    print(f"  regions            {len(regions):,}")
    print(f"  failing top-three  {len(failing):,}")
    print()
    print("  worst misses by fame score:")
    for r in worst[:12]:
        print(f"      {r['fame_score']:.3f}  {r['country']}  "
              f"{r['name'][:34]:36} {r['reason']}")
    print()
    print(f"  -> {OUT_JSON}")
    print(f"  -> {OUT_MD}")

    if args.strict and failing:
        print()
        print(f"! STRICT: {len(failing)} region(s) do not publish their top "
              "three, for reasons that are ours to fix")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
