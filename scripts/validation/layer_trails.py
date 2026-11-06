"""Trails on the D23 validation runner (T1187): the first layer.

The references, the matcher and the causes are T1181's
(scripts/validation/trails_external.py, unchanged); this file maps its
per-trail results onto the runner's shape:

  flags   matched  the trail is published (coverage);
          in_top   its representative row is in the v5 top band
                   (exceptional or excellent); False when missing, so the
                   share is over every reference, as T1181's top_share.
  facts   length   a day walk matched by an id or an exact name has a
                   length within LENGTH_TOL of the reference's length_km.
                   Multi-day trails are left out: Carta publishes them as
                   stages, so a stage's length says nothing.
  rank    (fame weight, v5 score): do the better known trails score higher.
  error   (reference km, Carta km) for the same day walks as `length`.

The gate keeps T1181's rule: coverage and the top-band share must not fall
below the baseline (hard, tolerance 0). Agreement, length and fact share
warn only until a few runs show how much they move.
"""
from __future__ import annotations

import trails_external as te

NAME = "trails"
SHARE = 1.0              # 282 references: the whole list is cheap (about 12 s)
MIN_PER_COUNTRY = 5
LENGTH_TOL = 0.25
EXACT = {"osm id", "wikidata id", "name exact"}

CHECKS = [
    {"metric": "coverage", "kind": "hard", "direction": "higher", "tolerance_points": 0},
    {"metric": "in_top", "kind": "hard", "direction": "higher", "tolerance_points": 0},
    {"metric": "agreement_tau", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 30},
    {"metric": "fact.length", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 10},
    {"metric": "error_mdape", "kind": "soft", "direction": "lower", "tolerance_points": 5, "min_n": 10},
]


def references(ctx):
    blob = te.load_json(ctx.get("reference", te.REFERENCE), {}) or {}
    ctx["_blob"] = blob
    return blob.get("trails") or []


def load(ctx):
    rows, wire_at = te.load_carta(ctx.get("wire", te.WIRE_DIR))
    reg = te.load_registry(ctx.get("registry", te.REGISTRY), ctx.get("coverage", te.COVERAGE))
    ctx["_wire_at"] = wire_at
    return {"rows": rows, "reg": reg, "wire_at": wire_at}


def _length(ref, res):
    """(fact, error pair) for a day walk matched by an id or exact name."""
    km_ref = ref.get("length_km")
    best = res.get("best") or {}
    if (res["status"] != "matched" or ref.get("kind") != "day" or not km_ref
            or not EXACT & set(res.get("methods") or {}) or not best.get("km")):
        return None, None
    return abs(best["km"] - km_ref) / km_ref <= LENGTH_TOL, (float(km_ref), float(best["km"]))


def match(refs, carta):
    by_id = {r["id"]: r for r in refs}
    out = []
    for res in te.evaluate(refs, carta["rows"], carta["reg"]):
        ref = by_id[res["id"]]
        fact, err = _length(ref, res)
        best = res.get("best") or {}
        out.append({
            "id": res["id"], "country": (res["countries"] or ["??"])[0],
            "flags": {"matched": res["status"] == "matched", "in_top": bool(res["in_top"])},
            "facts": {"length": fact},
            "rank": (res["weight"], best["score"]) if best.get("score") is not None else None,
            "error": err,
            "note": res.get("cause_code"),
            "_res": res,
        })
    return out


def gaps(results):
    """T1181's review list: the 20 largest coverage and 10 largest ranking gaps."""
    ranked = sorted((r["_res"] for r in results if te.gap_size(r["_res"]) > 0),
                    key=lambda r: (-te.gap_size(r), r["id"]))
    pick = ([r for r in ranked if r["status"] == "missing"][:te.GAPS_MISSING]
            + [r for r in ranked if r["status"] == "matched"][:te.GAPS_LOW])
    pick.sort(key=lambda r: (-te.gap_size(r), r["id"]))
    return [{"id": r["id"], "name": r["name"], "status": r["status"], "gap": te.gap_size(r),
             "best": (r.get("best") or {}).get("id"), "cause_code": r["cause_code"]} for r in pick]


def describe(ctx, carta):
    blob = ctx.get("_blob") or {}
    path = ctx.get("reference", te.REFERENCE)
    try:
        path = str(path.relative_to(te.ROOT))
    except (AttributeError, ValueError):
        path = str(path)
    return {"reference": {"path": path, "sha": te.ref_sha(blob), "sources": len(blob.get("sources") or [])},
            "carta": {"wire_generated_at": carta["wire_at"], "rows": len(carta["rows"])}}
