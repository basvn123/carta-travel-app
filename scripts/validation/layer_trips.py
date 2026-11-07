"""Trips on the D23 validation runner (ROADMAP D23, Trips row, T1195).

What is checked: every leg Carta's trip library shows (a hop between two
stops, and the way out to a day trip), against the time an official
timetable gives for it. Carta's minutes are an estimate (network speed plus
an access overhead, pipeline/trips/trip_model.py leg()); the reference is
the fastest scheduled station to station journey with at most one change on
a normal weekday, leaving 06:00 to 20:00, from open GTFS feeds whose licence
allows it, or the routed drive time from a self-hosted OSRM for car legs
(scripts/validation/trips_timetables.py builds both; research and terms in
the T1195 report).

The reference population is Carta's legs (legs.csv), not an outside list:
coverage is the share of legs a reference answered. The reference times sit
in timetable_reference.csv, one row per leg id `FROM>TO>mode`:

  status ok          a time (ref_minutes) and its changes
  status no_station  no stop of that mode near one end: Carta's mode is wrong
  status no_service  stops at both ends, no journey that day within one change
  status no_route    (car) the router found no road

Rows with source `seed` are the session's first reference, read by hand
from the operators' published timetables for the most used legs; the GTFS
run replaces each one it answers.

  flags   matched   the leg has a reference row (any status)
  facts   within    |Carta - reference| <= max(TOL_MIN, TOL_SHARE * reference)
          mode_ok   a train or bus leg's mode is served at both ends that day
  rank    (reference, Carta) minutes; error the same pair
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import trips_timetables as tt

NAME = "trips"
SHARE = 1.0
MIN_PER_COUNTRY = 5
# Research (T1195): no standard band in the literature; pass within
# max(20 min, 20%), warn within max(45 min, 35%), to tune after the first run.
TOL_MIN, TOL_SHARE = 20, 0.20
WARN_MIN, WARN_SHARE = 45, 0.35
CHECKS = [
    {"metric": "fact.within", "kind": "hard", "direction": "higher", "tolerance_points": 5, "min_n": 30},
    {"metric": "fact.mode_ok", "kind": "hard", "direction": "higher", "tolerance_points": 3, "min_n": 30},
    {"metric": "coverage", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 30},
    {"metric": "error_mdape", "kind": "soft", "direction": "lower", "tolerance_points": 5, "min_n": 30},
]
NO_MODE = {"no_station", "no_service"}


def band(carta, ref):
    """'pass', 'warn' or 'fail' for one leg with a reference time."""
    d = abs(carta - ref)
    if d <= max(TOL_MIN, TOL_SHARE * ref):
        return "pass"
    if d <= max(WARN_MIN, WARN_SHARE * ref):
        return "warn"
    return "fail"


def references(ctx):
    path = Path(ctx.get("legs") or tt.LEGS)
    ctx["_legs_path"] = path
    legs = ctx.get("_legs") or tt.read_legs(path)
    return [{**lg, "countries": [lg["from_cc"] or "??"]} for lg in legs.values()]


def load(ctx):
    path = Path(ctx.get("reference") or tt.REFERENCE)
    return {"path": path, "rows": tt.read_reference(path), "by_mode": {}, "sources": {}}


def match(refs, carta):
    out = []
    by_mode = carta["by_mode"]
    for lg in refs:
        r = carta["rows"].get(lg["id"])
        res = {"id": lg["id"], "country": lg["countries"][0], "mode": lg["mode"], "kind": lg["kind"],
               "carta": lg["minutes"], "trips": lg["trips"], "flags": {"matched": r is not None},
               "facts": {"within": None, "mode_ok": None}, "rank": None, "error": None,
               "label": f"{lg['from_city']} > {lg['to_city']} ({lg['mode']})"}
        m = by_mode.setdefault(lg["mode"], {"legs": 0, "matched": 0, "timed": 0, "pass": 0, "warn": 0,
                                            "fail": 0, "no_mode": 0})
        m["legs"] += 1
        if r is None:
            res["note"] = "no_reference"
            out.append(res)
            continue
        m["matched"] += 1
        src = r.get("source") or "?"
        carta["sources"][src] = carta["sources"].get(src, 0) + 1
        res["source"] = src
        status = r.get("status") or ""
        if lg["mode"] in ("train", "bus"):
            if status == "ok":
                res["facts"]["mode_ok"] = True
            elif status in NO_MODE:
                res["facts"]["mode_ok"] = False
        if status == "ok" and r.get("ref_minutes") not in (None, ""):
            ref = float(r["ref_minutes"])
            b = band(lg["minutes"], ref)
            res.update(ref=ref, band=b, changes=r.get("changes"))
            res["facts"]["within"] = b == "pass"
            res["rank"] = res["error"] = (ref, float(lg["minutes"]))
            res["note"] = "agrees" if b == "pass" else ("carta_slower" if lg["minutes"] > ref else "carta_faster")
            m["timed"] += 1
            m[b] += 1
        else:
            res["note"] = status or "no_time"
            if status in NO_MODE:
                m["no_mode"] += 1
        out.append(res)
    for m in by_mode.values():
        m["within_share"] = round(m["pass"] / m["timed"], 4) if m["timed"] else None
    return out


def _gap(r):
    if r.get("facts", {}).get("mode_ok") is False:
        return math.inf
    if r.get("ref"):
        return abs(math.log(r["carta"] / r["ref"])) if r["carta"] > 0 else math.inf
    return -1


def gaps(results, n=30):
    """The largest gaps: a mode that does not run first (weighted by how many
    trips use the leg), then the widest time ratio."""
    rs = [r for r in results if _gap(r) >= 0]
    rs.sort(key=lambda r: (-_gap(r), -r.get("trips", 1), r["id"]))
    return [{"id": r["id"], "label": r["label"], "country": r["country"], "kind": r["kind"],
             "trips": r.get("trips"), "carta": r["carta"], "ref": r.get("ref"),
             "band": r.get("band"), "source": r.get("source"), "cause_code": r["note"]} for r in rs[:n]]


def describe(ctx, carta):
    return {"reference": {"legs": str(ctx.get("_legs_path") or tt.LEGS), "times": str(carta["path"]),
                          "sources": dict(sorted(carta["sources"].items())),
                          "tolerance": {"pass": [TOL_MIN, TOL_SHARE], "warn": [WARN_MIN, WARN_SHARE]}},
            "carta": {"by_mode": carta["by_mode"]}}
