"""Grade replay: does the grade a traveller reads equal the grade the score used? (D24, D7, wave 3)

Read-only. Reads the shipped wire (trail country files, the other kinds' v5
stamps, the dossier Around rows) and counts, "before" as shipped and "after"
as the wave 3 code would write it:

- diff_ne_g        trail rows whose `difficulty` differs from `f.g`
                   (after: 0 by construction, wire_difficulty returns f.g)
- flat_hard        rows graded hard or worse with under 15 m of climb per km,
                   split tagged against derived (`f.gs`). Tagged rows keep
                   their grade (a mapper said so, T1092); derived rows are
                   recomputed: with both DEM terms required, a flat route has
                   no terrain grade, so its grade is the day effort alone.
- derived_alpine   derived rows graded alpine (after: capped to very_hard)
- lead_contradicts rows whose lead says easy while the grade is hard or worse
                   (after the grade change, before the lead filter)
- around_no_v5     Around rows that carry a score and no `v5` (after: the
                   row's own `v5` from the kind's country file, as `o` copies)

UPPER BOUND. The wire is an older build than the code. `after` is recomputed
in memory from what the wire carries (distance, ascent, descent, f.g, f.gs):
the DEM terms (max_grade_pct, relief) are not on the wire, so a derived row
with 70 m or more of climb per km keeps its shipped grade, and effort is
read on the stored, not the uphill-oriented, ascent. The real number comes
from the box re-export (docs/owner/data-and-pipeline-runs.md).

    python -I scripts/quality/grade_replay.py [--public DIR] [--out FILE.json]
"""
import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import grades  # noqa: E402
import difficulty  # noqa: E402

PUBLIC = ROOT / "continent-app" / "public"
FLAT_M_PER_KM = 15.0
# The smallest ascent per km any DEM ladder row accepts: below it the derived
# terrain grade is easy once both terms are required (attributes.DEM_LADDER).
DEM_MIN_M_PER_KM = 70.0
ROW_KEY = {"trails": "trips", "lakes": "lakes", "beaches": "beaches",
           "mountains": "mountains", "cycling": "routes"}
KINDS = tuple(ROW_KEY)
HARD = grades.GRADE_RANK["hard"]


def rank(g):
    return grades.GRADE_RANK.get(g, -1)


def per_km(t):
    km = (t.get("distance_m") or 0) / 1000.0
    return (t.get("ascent_m") or 0) / km if km > 0 else None


def after_grade(t):
    """The grade the wave 3 code would give this row (see UPPER BOUND)."""
    f = t.get("f") or {}
    g = f.get("g")
    if g not in grades.GRADE_RANK:
        return g
    if f.get("gs") != "derived":
        return g
    pk = per_km(t)
    if pk is not None and pk < DEM_MIN_M_PER_KM:
        eff = difficulty.day_effort(t)["grade"]
        # Requiring both terms can only lower a grade. The effort here is read
        # on the stored ascent, so where it comes out higher than the shipped
        # grade (an uphill-oriented ascent shipped) the shipped grade stands.
        return eff if rank(eff) < rank(g) else g
    return grades.cap_derived(g)


def load_wire(public):
    """{kind: {cc: [rows]}} for the five kinds' country files."""
    out = {}
    for kind, key in ROW_KEY.items():
        out[kind] = {}
        for p in sorted((public / kind).glob("??.json")):
            try:
                d = json.loads(p.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            out[kind][p.stem] = d.get(key) or []
    return out


def trail_slices(wire):
    """Counts per country and per source, plus the failing rows."""
    by_cc = defaultdict(Counter)
    by_gs = defaultdict(Counter)
    moves = Counter()
    fails = []
    for cc, rows in wire["trails"].items():
        for t in rows:
            f = t.get("f") or {}
            g = f.get("g")
            if g not in grades.GRADE_RANK:
                for c in (by_cc[cc], by_gs["none"]):
                    c["rows"] += 1
                continue
            gs = f.get("gs") or "none"
            ag = after_grade(t)
            pk = per_km(t)
            flat = pk is not None and pk < FLAT_M_PER_KM
            lead = t.get("summary")
            probes = {
                "diff_ne_g_before": t.get("difficulty") != g,
                "flat_hard_before": flat and rank(g) >= HARD,
                "flat_hard_after": flat and rank(ag) >= HARD,
                "derived_alpine_before": gs == "derived" and g == "alpine",
                "derived_alpine_after": gs == "derived" and ag == "alpine",
                "lead_contradicts_before": grades.lead_contradicts(lead, g),
                "lead_contradicts_after": grades.lead_contradicts(lead, ag),
                "grade_changed": ag != g,
            }
            if ag != g:
                moves[f"{gs}: {g} -> {ag}"] += 1
            for c in (by_cc[cc], by_gs[gs]):
                c["rows"] += 1
                for k, v in probes.items():
                    if v:
                        c[k] += 1
            left = [k for k in ("flat_hard_after", "derived_alpine_after",
                                "lead_contradicts_after") if probes[k]]
            if left:
                fails.append({"kind": "trails", "cc": cc, "id": t.get("id"),
                              "name": t.get("name"), "g": g, "g_after": ag,
                              "gs": gs, "km": round((t.get("distance_m") or 0) / 1000, 1),
                              "ascent_m": t.get("ascent_m"),
                              "m_per_km": None if pk is None else round(pk, 1),
                              "duration_min": t.get("duration_min"),
                              "lead": (lead or "")[:160], "left": left})
    return by_cc, by_gs, moves, fails


def kind_slices(wire):
    """Rows and v5 coverage by kind."""
    out = {}
    for kind in KINDS:
        n = rated = v5 = 0
        for rows in wire[kind].values():
            for r in rows:
                n += 1
                if r.get("v5"):
                    v5 += 1
        out[kind] = {"rows": n, "with_v5": v5}
    return out


def around_slices(public, wire):
    """Around rows with a score and no v5, before and after the stamp."""
    v5_ids = {k: set() for k in KINDS}
    for kind in KINDS:
        for cc, rows in wire[kind].items():
            for r in rows:
                if r.get("v5"):
                    v5_ids[kind].add((cc, str(r.get("id"))))
    by_kind = defaultdict(Counter)
    fails = []
    files = 0
    for p in sorted((public / "dossier").glob("*.json")):
        try:
            a = (json.loads(p.read_text(encoding="utf-8")).get("around") or {})
        except (OSError, ValueError):
            continue
        files += 1
        for kind, rows in a.items():
            if kind not in ROW_KEY or not isinstance(rows, list):
                continue
            for r in rows:
                c = by_kind[kind]
                c["rows"] += 1
                if r.get("score") is None:
                    c["unrated"] += 1
                    continue
                c["rated"] += 1
                if "v5" not in r and "o" not in r:
                    c["no_v5_before"] += 1
                    if (r.get("cc"), str(r.get("id"))) not in v5_ids[kind]:
                        c["no_v5_after"] += 1
                        if len(fails) < 5000:
                            fails.append({"kind": kind, "dest": p.stem, "cc": r.get("cc"),
                                          "id": r.get("id"), "name": r.get("name"),
                                          "left": ["around_no_v5"]})
    return files, by_kind, fails


def total(slices, key):
    return sum(c[key] for c in slices.values())


def replay(public):
    wire = load_wire(public)
    by_cc, by_gs, moves, tfails = trail_slices(wire)
    files, around, afails = around_slices(public, wire)
    keys = ("rows", "diff_ne_g_before", "flat_hard_before", "flat_hard_after",
            "derived_alpine_before", "derived_alpine_after",
            "lead_contradicts_before", "lead_contradicts_after", "grade_changed")
    return {
        "public": str(public),
        "upper_bound": "after is recomputed in memory from the wire's own inputs; "
                       "DEM terms are not on the wire (see module docstring)",
        "trails_total": {k: total(by_cc, k) for k in keys},
        "trails_by_source": {gs: {k: c[k] for k in keys} for gs, c in sorted(by_gs.items())},
        "trails_by_country": {cc: {k: c[k] for k in keys if c[k] or k == "rows"}
                              for cc, c in sorted(by_cc.items())},
        "grade_moves": dict(sorted(moves.items())),
        "kinds": kind_slices(wire),
        "around": {"dossiers": files,
                   "by_kind": {k: dict(c) for k, c in sorted(around.items())},
                   "no_v5_before": total(around, "no_v5_before"),
                   "no_v5_after": total(around, "no_v5_after")},
        "failures": tfails + afails,
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description="Grade replay (D24)")
    ap.add_argument("--public", default=str(PUBLIC))
    ap.add_argument("--out", help="write the full result, with failures, to this JSON file")
    a = ap.parse_args(argv)
    res = replay(Path(a.public))
    if a.out:
        Path(a.out).write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    brief = {k: v for k, v in res.items() if k not in ("failures", "trails_by_country")}
    brief["failures"] = len(res["failures"])
    print(json.dumps(brief, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
