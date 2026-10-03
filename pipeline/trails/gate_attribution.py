"""Which gate dropped a registry route from the trails wire (T322, row T113-d).

Tier: On-demand (never scheduled; reads the staging DB and writes one report)

The coverage report files every registry route that has an OSM relation and
no published match under one code, failed_continuity. That code is a guess by
elimination (coverage_report.reason_for says so in its own comment): it means
"a relation exists and did not reach the wire", not "the continuity gate cut
it". 1,930 Waymarked national and international routes sit under it. This
module replaces the guess with a measurement, one named gate per route, by
asking the staging table and re-running curate's own selection.

The gates, in the order a route meets them (the order is the contract; a
route is filed under the FIRST gate that stopped it):

  not_staged           no row in trips for the relation. The ingest never
                       held it: not in an extract, node-network filter, or
                       a cross-border row kept in the neighbour.
  rejected             a reviewer rejected it (status rejected).
  synthetic_title      'OSM route 123': no name or ref upstream.
  too_short            under curate.MIN_M.
  too_long             over curate.TREK_MAX_M. A parent path this long is
                       represented by its stages, which is by design, so
                       the report keeps it apart from the real drops.
  continuity           staged, in range, but not one continuous line and no
                       accepted splice or repair made it one.
  folded_into_family   a candidate that is not its family's best member, so
                       another row holds the slot.
  no_pool              the head is longer than curate.MAX_M and not famous,
                       so neither the day pool nor the trek pool holds it.
  trek_cap             a famous trek that lost to the trek cap.
  region_or_cell       a day-pool head that lost its region's quota, the
                       spatial cell cap or the operator's series cap. These
                       three cannot be told apart after the fact without
                       replaying the picker, so they share one name.
  picked               it was selected (the report should then show it).

Pure functions in this file take plain dicts, so tests/test_gate_attribution.py
runs them with no lab. The command line is the only part that connects.

Usage, from the repo root, with the lab up (cd tools/trailslab && docker
compose up -d). Read-only: it never writes to the DB and select_country is run
as a dry run.
    python pipeline/trails/gate_attribution.py
    python pipeline/trails/gate_attribution.py --countries FR,ES,DE --national-treks
Writes data/reports/trails_gate_attribution.json.

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import curate  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
COVERAGE = ROOT / "data" / "reports" / "trails_coverage.json"
OUT = ROOT / "data" / "reports" / "trails_gate_attribution.json"

GATES = ("not_staged", "rejected", "synthetic_title", "too_short", "too_long",
         "continuity", "folded_into_family", "no_pool", "trek_cap",
         "region_or_cell", "picked")


def hard_gate(staged):
    """The hard gate a staged row fails, or None when it is a candidate.

    `staged` is None, or a dict with distance_m, title, status, and
    continuous (True when the candidate query's continuity clause passes:
    one segment with no gaps, or an accepted single-line repair)."""
    if staged is None:
        return "not_staged"
    if staged.get("status") == "rejected":
        return "rejected"
    if (staged.get("title") or "").startswith(curate.SYNTHETIC_PREFIX):
        return "synthetic_title"
    d = staged.get("distance_m") or 0
    if d < curate.MIN_M:
        return "too_short"
    if d > curate.TREK_MAX_M:
        return "too_long"
    if not staged.get("continuous"):
        return "continuity"
    return None


def selection_gate(row, picked_ids, national=False):
    """The soft gate that stopped a CANDIDATE row, after select_country ran
    on its country (so row carries rank, famous and, for a family head,
    family_members). Returns one of GATES."""
    if row["id"] in picked_ids:
        return "picked"
    if "family_members" not in row:
        return "folded_into_family"
    long_route = (row.get("distance_m") or 0) > curate.MAX_M
    if long_route and not (row.get("famous")
                           or (national and curate.is_national(row))):
        return "no_pool"
    if long_route:
        return "trek_cap"
    return "region_or_cell"


def attribute(relations, staged_by_rel, candidates_by_country, picked_by_country,
              national=False):
    """One gate per wanted relation.

    relations               [{"relation_id": int, "country": "FR", ...}]
    staged_by_rel           {relation_id: staged dict or missing}
    candidates_by_country   {cc: [candidate rows after select_country]}
    picked_by_country       {cc: set of picked ids (rated and listed)}
    """
    cand_by_ref = {}
    for cc, rows in candidates_by_country.items():
        for r in rows:
            cand_by_ref[str(r.get("source_ref"))] = r
    out = []
    for rel in relations:
        rid = rel["relation_id"]
        staged = staged_by_rel.get(rid)
        gate = hard_gate(staged)
        if gate is None:
            row = cand_by_ref.get(str(rid))
            if row is None:
                # Continuous and in range, yet absent from the candidate
                # list: its country was out of scope or the row sits in
                # another country than the registry's.
                gate = "not_staged"
            else:
                cc = row["country"]
                gate = selection_gate(row, picked_by_country.get(cc, set()),
                                      national=national)
        out.append({**rel, "gate": gate,
                    "distance_km": round(((staged or {}).get("distance_m")
                                          or 0) / 1000, 1)})
    return out


def summarise(rows):
    """{"by_gate": {...}, "by_country": {cc: {gate: n}}} for the report."""
    by_gate = Counter(r["gate"] for r in rows)
    by_cc = defaultdict(Counter)
    for r in rows:
        by_cc[r["country"]][r["gate"]] += 1
    return {"by_gate": dict(by_gate),
            "by_country": {cc: dict(c) for cc, c in sorted(by_cc.items())}}


# ---------------------------------------------------------------------------
# The part that connects
# ---------------------------------------------------------------------------

STAGED_SQL = """
    SELECT t.source_ref, t.id, t.country, t.title, t.distance_m,
           t.status::text,
           (((t.gap_info->>'gap_count')::int = 0
             AND (t.gap_info->>'merged_segments')::int = 1)
            OR EXISTS (
              SELECT 1 FROM trip_repairs r
              WHERE r.trip_id = t.id AND r.repaired
                AND ST_NumGeometries(r.geom) = 1
                AND r.repair_info->>'source_geom_md5'
                    = md5(ST_AsBinary(ST_Force2D(t.geom))))) AS continuous
    FROM trips t
    WHERE t.source = 'osm' AND t.category = 'hike'
      AND t.source_ref = ANY(%(refs)s)
"""


def wanted_relations(countries=None):
    """Registry rows with Waymarked evidence that the coverage report left
    unmatched, one entry per (relation, registry country)."""
    blob = json.loads(COVERAGE.read_text(encoding="utf-8"))
    reg = json.loads((ROOT / "data" / "trails" / "famous_registry.json")
                     .read_text(encoding="utf-8"))["rows"]
    status = {r["id"]: r for r in blob["rows"]}
    out = []
    for r in reg:
        w = (r.get("evidence") or {}).get("waymarked")
        st = status.get(r["id"]) or {}
        if not w or st.get("status") == "matched":
            continue
        if countries and r["country"] not in countries:
            continue
        out.append({"relation_id": int(w["relation_id"]), "id": r["id"],
                    "name": r["name"], "country": r["country"],
                    "network": w.get("network"),
                    "coverage_reason": st.get("reason")})
    return out


def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", help="comma separated ISO2")
    ap.add_argument("--national-treks", action="store_true",
                    help="attribute against the selection with the national "
                         "pass on, to see what the fix would rescue")
    args = ap.parse_args()
    countries = ({c.strip().upper() for c in args.countries.split(",")}
                 if args.countries else None)

    from db import connect

    wanted = wanted_relations(countries)
    refs = sorted({str(w["relation_id"]) for w in wanted})
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(STAGED_SQL, {"refs": refs})
            staged = {int(ref): {"id": tid, "country": cc, "title": title,
                                 "distance_m": dist, "status": status,
                                 "continuous": bool(cont)}
                      for ref, tid, cc, title, dist, status, cont
                      in cur.fetchall()}
        cands, picked = {}, {}
        for cc in sorted({w["country"] for w in wanted}
                         | {s["country"] for s in staged.values()}):
            if cc not in curate.CATALOGUE:
                continue
            rows = curate.fetch_candidates(conn, cc)
            if not rows:
                continue
            quotas, target = curate.region_budget(rows, curate.TARGET_DEFAULT)
            rated, listed, _ = curate.select_country(
                rows, target, quotas, national=args.national_treks)
            cands[cc] = rows
            picked[cc] = {r["id"] for r in rated + listed}
    result = attribute(wanted, staged, cands, picked,
                       national=args.national_treks)
    summary = summarise(result)
    OUT.write_text(json.dumps({"national_treks": args.national_treks,
                               "wanted": len(wanted), **summary,
                               "rows": result}, ensure_ascii=True, indent=1),
                   encoding="utf-8")
    print(f"{len(wanted)} unmatched Waymarked rows")
    for gate in GATES:
        print(f"  {gate:20s} {summary['by_gate'].get(gate, 0):6d}")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
