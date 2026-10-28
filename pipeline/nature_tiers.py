"""Nature items on the place ladder (Carta rating v5, batch R3, T761).

Trails, beaches, lakes, peaks and cycling routes each keep their own parts
and weights (the five scorers own them), but every kind is read onto ONE
ladder, the one places use: a frozen Europe-wide percentile within the kind,

    top 3% Exceptional, next 9% Excellent, next 18% Very good,
    next 25% Good, next 25% Pleasant, the rest no badge,

mapped onto the same 0 to 10 cutoffs as places (config bands.cutoffs: 9.0,
8.3, 7.6, 6.9, 6.0). So the best walk in Flanders no longer scores like the
best in the Dolomites: it gets a rank line instead ("Best walk in Flanders").

No renormalising. A part nobody measured counts at the kind's frozen median
and lowers the confidence; an item with fewer than half its parts measured
gets no score at all (confidence "unscored"). blend() is that rule, and the
five scorers call it for their own score too, so there is one rule.

Where the parts come from:
  beaches, lakes, mountains  the `comp` the exporter wrote (0 to 1, absolute;
                             the scorers no longer stretch a part per country)
  trails, cycling            the raw part values from the trails lab (rate.RAW,
                             cycle_index.RAW), each placed on a frozen
                             Europe-wide percentile of its own, because the
                             lab's stored parts are ranked per region

Facts sit next to the score, never inside it (plan, Layer 2): difficulty,
km, climb, Blue Flag, water class, way up, paved share and so on. A fact is
filled only where the data has it and is not marked as an estimate; null
otherwise.

What is written: on every rated row of every kind's served files
(continent-app/public/{kind}/{CC}.json and top.json) one additive key
`v5 = {score, band, rank, facts, confidence}`. The old `score` / `rating` /
`tier` keys keep their values until the app moves (R4, T763).

Usage, from the repo root (the trails lab must be up for trails and cycling):
    python pipeline/nature_tiers.py --recalibrate --version v5.0-r3   # freeze
    python pipeline/nature_tiers.py                                   # apply
    python pipeline/nature_tiers.py --check     # recompute, compare, write nothing
    python pipeline/nature_tiers.py --report out.json  # shares, null counts

ASCII only, no em dashes, per project convention.
"""
from __future__ import annotations

import argparse
import bisect
import json
import math
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

import rating_config  # noqa: E402
from rating_config import cfg, section  # noqa: E402

PUBLIC = ROOT / "continent-app" / "public"
KINDS = tuple(cfg("nature.kinds"))
# The file key of each kind's rated rows, in {CC}.json and in top.json.
ROW_KEY = {"beaches": "beaches", "lakes": "lakes", "mountains": "mountains",
           "trails": "trips", "cycling": "routes"}
BAND_ORDER = ("exceptional", "excellent", "very_good", "good", "pleasant")


# ---------------------------------------------------------------------------
# The blend: one rule for a missing part, used by the five scorers as well
# ---------------------------------------------------------------------------

def part_medians(kind):
    """The kind's frozen part medians, or the provisional median while the
    nature part of the reference is not frozen yet (the first export of a
    new model version, before --recalibrate)."""
    try:
        ref = rating_config.reference("nature")
    except (FileNotFoundError, ValueError):
        return defaultdict(lambda: float(cfg("nature.provisional_median")))
    med = ref["kinds"][kind]["part_median"]
    return defaultdict(lambda: float(cfg("nature.provisional_median")), med)


def blend(kind, comps, weights, standout_on=(), bonus=0.0, medians=None):
    """(score 0..1, measured share) over the kind's own weights.

    A part that is None or absent counts at the kind's median: never dropped
    with the remaining weights stretched over what is left, which let a beach
    with two known parts outscore a beach with eight. The standout bonus reads
    measured parts only, as before."""
    med = medians if medians is not None else part_medians(kind)
    measured = {k: v for k, v in comps.items() if v is not None and k in weights}
    base = sum(w * (measured[k] if k in measured else med[k])
               for k, w in weights.items())
    standout = max((measured[k] for k in standout_on if k in measured), default=0.0)
    return min(1.0, base + bonus * standout), len(measured) / len(weights)


# ---------------------------------------------------------------------------
# The v5 parts of the three file kinds, handed over by their exporters
# ---------------------------------------------------------------------------
#
# Beaches, lakes and peaks are scored from the harvest caches inside their
# exporters. Each scorer computes its v5 parts next to the score the wire's
# `score` still carries (v5_components), the exporter records them per wire
# id while it builds the rows, and saves them here: a cache, not the wire.
PARTS_DIR = ROOT / "cache" / "nature"
_RECORDED = defaultdict(dict)


def record(kind, row_id, cc, parts):
    if parts is not None:
        _RECORDED[kind][row_id] = {"cc": cc, "parts": parts}


def save_parts(kind):
    """Merge this run's parts into cache/nature/{kind}_parts.json, replacing
    every row of the countries this run exported (a run of three countries
    must not drop the other forty)."""
    got = _RECORDED.pop(kind, {})
    if not got:
        return None
    path = PARTS_DIR / f"{kind}_parts.json"
    old = read_json(path) if path.exists() else {}
    done = {v["cc"] for v in got.values()}
    merged = {k: v for k, v in old.items() if v.get("cc") not in done}
    merged.update(got)
    PARTS_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(merged, ensure_ascii=False, separators=(",", ":"),
                               sort_keys=True), encoding="utf-8")
    print(f"[{kind}] v5 parts of {len(got):,} rows -> {path}")
    return path


def saved_parts(kind):
    path = PARTS_DIR / f"{kind}_parts.json"
    if not path.exists():
        raise SystemExit(f"{path} is missing: run the {kind} exporter first")
    return {k: v["parts"] for k, v in read_json(path).items()}


# ---------------------------------------------------------------------------
# Frozen breakpoints
# ---------------------------------------------------------------------------

def knots_of(values, n_knots):
    """n_knots quantiles of values, linear between order statistics."""
    xs = sorted(values)
    if not xs:
        return []
    out = []
    for i in range(n_knots):
        pos = i / (n_knots - 1) * (len(xs) - 1)
        lo = math.floor(pos)
        hi = min(lo + 1, len(xs) - 1)
        out.append(round(xs[lo] + (xs[hi] - xs[lo]) * (pos - lo), 6))
    return out


def pct_of(x, knots):
    """0..1 position of x on frozen knots; equal knots share their mid rank,
    so a value tied with many items does not sit at the top of the tie."""
    k = len(knots) - 1
    lo = bisect.bisect_left(knots, x)
    hi = bisect.bisect_right(knots, x)
    if hi > lo:
        return ((lo + hi - 1) / 2) / k
    if lo == 0:
        return 0.0
    if lo > k:
        return 1.0
    a, b = knots[lo - 1], knots[lo]
    return (lo - 1 + (x - a) / (b - a)) / k


def ladder_points():
    """[(percentile, score)]: 0 -> floor, each band start -> its cutoff,
    1 -> ceiling. Band starts are 1 minus the shares above them."""
    shares = section("nature.shares")
    cut = section("bands.cutoffs")
    pts, top = [(1.0, float(cfg("nature.ladder.ceiling")))], 1.0
    for band in BAND_ORDER:
        top -= shares[band]
        pts.append((round(top, 6), float(cut[band])))
    pts.append((0.0, float(cfg("nature.ladder.floor"))))
    return sorted(pts)


def band_of(p):
    shares = section("nature.shares")
    top = 1.0
    for band in BAND_ORDER:
        top -= shares[band]
        if p >= round(top, 6) - 1e-9:
            return band
    return None


def score_of(p, points):
    for (p0, s0), (p1, s1) in zip(points, points[1:]):
        if p <= p1:
            s = s0 + (s1 - s0) * ((p - p0) / (p1 - p0) if p1 > p0 else 1.0)
            # Floored, not rounded: 8.96 must not print as 9.0 under Excellent.
            return math.floor(s * 10 + 1e-9) / 10
    return points[-1][1]


# ---------------------------------------------------------------------------
# Reading the kinds
# ---------------------------------------------------------------------------

def cc_files(kind):
    return sorted(p for p in (PUBLIC / kind).glob("*.json") if len(p.stem) == 2)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8")


def wire_rows(kind):
    """Every rated row of a kind, in file order: [(row, cc file)]."""
    out = []
    for path in cc_files(kind):
        for row in read_json(path).get(ROW_KEY[kind]) or []:
            if row.get("t", "r") != "r":
                continue
            if kind == "trails" and row.get("category") != "hike":
                continue          # city walks are not on the walk ladder
            out.append(row)
    return out


def codes(row):
    """Reason and tag codes of a row, whichever list carries them."""
    out = set(row.get("tags") or []) if isinstance(row.get("tags"), list) else set()
    for x in row.get("why") or []:
        if isinstance(x, dict):
            out.add(x.get("k") or x.get("code"))
    return out


def scorer(kind):
    """The kind's own scorer module: its WEIGHTS, STANDOUT_ON, STANDOUT_BONUS."""
    if kind == "beaches":
        sys.path.insert(0, str(HERE / "beaches"))
        import beauty_index as mod
    elif kind == "lakes":
        sys.path.insert(0, str(HERE / "lakes"))
        import lake_index as mod
    elif kind == "mountains":
        sys.path.insert(0, str(HERE / "mountains"))
        import peak_index as mod
    elif kind == "trails":
        sys.path.insert(0, str(HERE / "trails"))
        import rate as mod
    else:
        sys.path.insert(0, str(HERE / "cycling"))
        import cycle_index as mod
    return mod


LAB_CACHE = ROOT / "cache" / "nature"


def _plain(v):
    """A lab value as JSON can keep it: Decimal to float, a date to ISO."""
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    if isinstance(v, (list, tuple)):
        return [_plain(x) for x in v]
    if isinstance(v, dict):
        return {k: _plain(x) for k, x in v.items()}
    if hasattr(v, "isoformat"):
        return v.isoformat()
    try:
        return float(v)
    except (TypeError, ValueError):
        return str(v)


def lab_rows(kind, ids):
    """{id: lab row} for trails and cycling, fetched by the ids on the wire.

    T784: the rating chain must not need the trails lab (PostGIS in Docker on
    the laptop, owner decision D5 moves it to a worker). Every read from the
    lab is kept in cache/nature/<kind>_lab_rows.json; when the lab cannot be
    reached, the rows come from that file, as long as it holds every id asked
    for, and the run says so. A missing or short cache still fails loudly.
    """
    import psycopg
    sys.path.insert(0, str(HERE / "trails"))
    from db import connect
    mod = scorer(kind)
    cache = LAB_CACHE / f"{kind}_lab_rows.json"
    try:
        with connect() as conn:
            rows = mod.fetch_ids(conn, sorted(ids))
    except psycopg.OperationalError as exc:
        if not cache.exists():
            raise SystemExit(f"{kind}: the trails lab is not reachable ({exc.__class__.__name__}) "
                             f"and {cache} does not exist yet; run once with the lab up")
        kept = json.loads(cache.read_text(encoding="utf-8"))
        missing = [i for i in ids if str(i) not in kept]
        if missing:
            raise SystemExit(f"{kind}: the trails lab is not reachable and {cache} lacks "
                             f"{len(missing)} of {len(ids)} ids; run once with the lab up")
        print(f"{kind}: trails lab not reachable, {len(ids)} rows read from {cache.name}")
        by_str = {str(i): i for i in ids}
        return {by_str[k]: v for k, v in kept.items() if k in by_str}
    out = {r["id"]: r for r in rows}
    LAB_CACHE.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps({str(k): _plain(dict(v)) for k, v in out.items()}), encoding="utf-8")
    return out


def raw_parts(kind, rows):
    """{id: {part: raw value or None}} before any percentile, for the two
    lab kinds; None means the part was not measured."""
    mod = scorer(kind)
    lab = lab_rows(kind, {r["id"] for r in rows})
    out, facts_extra = {}, {}
    for r in rows:
        row = lab.get(r["id"])
        if row is None:
            continue
        out[r["id"]] = mod.v5_raw(row)
        facts_extra[r["id"]] = row
    return out, facts_extra


# ---------------------------------------------------------------------------
# Facts, next to the score
# ---------------------------------------------------------------------------

SAC_GRADE = {"strolling": "easy", "hiking": "easy",
             "mountain_hiking": "moderate", "demanding_mountain_hiking": "moderate",
             "alpine_hiking": "hard", "demanding_alpine_hiking": "hard",
             "difficult_alpine_hiking": "hard"}
SURFACE_FACT = {"sand": "sand", "pebble": "pebble", "gravel": "pebble",
                "fineGravel": "pebble", "shingle": "pebble", "rock": "rock"}
WAY_UP = {"cableCar": "lift", "gondola": "lift", "funicular": "lift",
          "rackRailway": "lift", "chairlift": "lift", "road": "drive"}
MOUNTAIN_DIFFICULTY = {"walkUp": "easy", "hike": "easy", "mountainHike": "moderate",
                       "scramble": "hard", "alpine": "hard"}


def facts_of(kind, row, lab=None):
    if kind == "trails":
        rt = (row.get("f") or {}).get("rt")
        loop = (True if rt in ("loop", "figure8") else False if rt in ("point", "out_back")
                else row.get("is_loop"))
        return {
            "difficulty": SAC_GRADE.get((lab or {}).get("sac_worst")),
            "km": round(row["distance_m"] / 1000, 1) if row.get("distance_m") else None,
            "climb_m": row.get("ascent_m"),
            "hours": round(row["duration_min"] / 60, 1) if row.get("duration_min") else None,
            "loop": loop,
        }
    if kind == "beaches":
        wc = (row.get("water") or {}).get("class")
        return {
            "water_class": wc if wc in ("Excellent", "Good", "Sufficient", "Poor") else None,
            "blue_flag": True if "blueFlag" in codes(row) else None,
            "surface": SURFACE_FACT.get(row.get("surface")),
            "lifeguard": True if row.get("lifeguard") else None,
        }
    if kind == "lakes":
        rule = (row.get("swim") or {}).get("rule")
        wc = (row.get("water") or {}).get("class")
        cs = codes(row)
        shore = (True if cs & {"shorePath", "shoreBeach", "lido"}
                 else False if "privateShore" in cs else None)
        return {
            "swimming": rule if rule in ("yes", "limited", "no") else None,
            "water_class": wc if wc in ("Excellent", "Good", "Sufficient", "Poor") else None,
            "shore_access": shore,
        }
    if kind == "mountains":
        lift = (row.get("lift") or {}).get("kind")
        way = WAY_UP.get(lift)
        if way is None and "trailhead" in (row.get("acc") or []):
            way = "hike"
        diff, season = row.get("diff") or {}, row.get("season") or {}
        return {
            "way_up": way,
            # Every difficulty and season on the wire today is marked est
            # (derived from paths, terrain or climate): an estimate is not a
            # fact, so these stay null until a source states them.
            "difficulty": None if diff.get("est") else MOUNTAIN_DIFFICULTY.get(diff.get("k")),
            "season": (None if season.get("est") or not season.get("months")
                       else season["months"]),
        }
    return {
        "paved_share": row.get("paved"),
        "traffic_free_share": row.get("free"),
        "climb_m": row.get("asc"),
        # No source records family suitability for a cycle route yet.
        "family": None,
    }


# ---------------------------------------------------------------------------
# One kind, end to end
# ---------------------------------------------------------------------------

def item_parts(kind, rows, frozen=None):
    """{id: (parts on 0..1 or None, lab row)} for every rated row."""
    if kind in ("trails", "cycling"):
        raw, lab = raw_parts(kind, rows)
        names = list(scorer(kind).WEIGHTS)
        knots = (frozen or {}).get("part_knots")
        if knots is None:
            knots = {p: knots_of([v[p] for v in raw.values() if v[p] is not None],
                                 int(cfg("nature.knots"))) for p in names}
        out = {}
        for i, v in raw.items():
            out[i] = ({p: (None if v[p] is None else round(pct_of(v[p], knots[p]), 6))
                       for p in names}, lab[i])
        return out, knots
    saved = saved_parts(kind)
    return {r["id"]: ({k: v for k, v in saved[r["id"]].items() if v is not None}, None)
            for r in rows if r["id"] in saved}, None


def measure_kind(kind, frozen=None):
    """Scores for one kind. frozen=None measures the breakpoints (calibration);
    otherwise the frozen ones are read and nothing is refit."""
    mod = scorer(kind)
    rows = wire_rows(kind)
    parts, part_knots = item_parts(kind, rows, frozen)
    weights = dict(mod.WEIGHTS)
    standout = tuple(getattr(mod, "STANDOUT_ON", ()))
    bonus = float(getattr(mod, "STANDOUT_BONUS", 0.0)) if standout else 0.0
    if frozen is None:
        medians = {p: round(statistics.median(vals), 6)
                   for p in weights
                   if (vals := [c[p] for c, _ in parts.values() if c.get(p) is not None])}
    else:
        medians = frozen["part_median"]
    min_share = float(cfg("nature.min_measured_share"))
    raw = {}
    for r in rows:
        got = parts.get(r["id"])
        if got is None:
            continue
        s01, share = blend(kind, got[0], weights, standout, bonus,
                           defaultdict(lambda: 0.5, medians))
        raw[r["id"]] = (round(s01, 6), share)
    scored = [s for s, share in raw.values() if share >= min_share]
    score_knots = (frozen["score_knots"] if frozen is not None
                   else knots_of(scored, int(cfg("nature.knots"))))
    return {"rows": rows, "parts": parts, "raw": raw, "weights": weights,
            "part_median": medians, "part_knots": part_knots,
            "score_knots": score_knots}


def rank_lines(kind, rows, v5):
    """{id: {scope, rank, of, unit}}: the smallest scope (NUTS 2 region, then
    country) with at least rank_min_items scored items of the kind."""
    key = cfg("nature.rank_region_key")
    need = int(cfg("nature.rank_min_items"))
    unit = cfg("nature.rank_units")[kind]
    by = {"region": defaultdict(list), "country": defaultdict(list)}
    for r in rows:
        if r["id"] not in v5 or v5[r["id"]]["score"] is None:
            continue
        reg = (r.get("rg") or {}).get(key)
        if reg:
            by["region"][reg].append(r["id"])
        by["country"][r.get("cc") or r.get("country")].append(r["id"])

    def ranks(ids):
        ids = sorted(ids, key=lambda i: -v5[i]["_raw"])
        out, prev, place = {}, None, 0
        for n, i in enumerate(ids, 1):
            if v5[i]["_raw"] != prev:
                place, prev = n, v5[i]["_raw"]
            out[i] = (place, len(ids))
        return out

    ranked = {s: {g: ranks(ids) for g, ids in groups.items()} for s, groups in by.items()}
    out = {}
    for r in rows:
        i = r["id"]
        if i not in v5 or v5[i]["score"] is None:
            continue
        reg = (r.get("rg") or {}).get(key)
        cc = r.get("cc") or r.get("country")
        for scope, g in (("region", reg), ("country", cc)):
            if g and len(by[scope][g]) >= need:
                place, of = ranked[scope][g][i]
                out[i] = {"scope": scope, "rank": place, "of": of, "unit": unit}
                break
    return out


def v5_of(kind, m):
    points = ladder_points()
    min_share = float(cfg("nature.min_measured_share"))
    out = {}
    for r in m["rows"]:
        i = r["id"]
        if i not in m["raw"]:
            continue
        s01, share = m["raw"][i]
        lab = m["parts"][i][1]
        if share < min_share:
            out[i] = {"score": None, "band": None, "rank": None,
                      "facts": facts_of(kind, r, lab), "confidence": "unscored",
                      "_raw": s01, "_p": None}
            continue
        p = pct_of(s01, m["score_knots"])
        out[i] = {"score": score_of(p, points), "band": band_of(p), "rank": None,
                  "facts": facts_of(kind, r, lab),
                  "confidence": "measured" if share >= 0.999 else "partial",
                  "_raw": s01, "_p": p}
    for i, line in rank_lines(kind, m["rows"], out).items():
        out[i]["rank"] = line
    return out


def frozen_part():
    return rating_config.reference("nature")


def recalibrate(version):
    payload = {"_about": ("Nature ladder breakpoints (T761): per kind, the part "
                          "medians, the Europe-wide part knots of the two lab "
                          "kinds and the knots of the blended score. Read by "
                          "nature_tiers.py and by the five scorers' blend()."),
               "kinds": {}}
    for kind in KINDS:
        m = measure_kind(kind)
        payload["kinds"][kind] = {
            "n": sum(1 for s, sh in m["raw"].values()
                     if sh >= float(cfg("nature.min_measured_share"))),
            "weights": m["weights"],
            "part_median": m["part_median"],
            "score_knots": m["score_knots"],
        }
        if m["part_knots"] is not None:
            payload["kinds"][kind]["part_knots"] = m["part_knots"]
        print(f"  {kind}: {payload['kinds'][kind]['n']:,} items, "
              f"{len(m['score_knots'])} knots")
    path = rating_config.write_part("nature", payload, version)
    print(f"froze the nature part {version} in {path}")


def apply(write=True, report=None):
    ref = frozen_part()
    summary = {}
    for kind in KINDS:
        m = measure_kind(kind, ref["kinds"][kind])
        v5 = v5_of(kind, m)
        bands = Counter(v["band"] for v in v5.values() if v["score"] is not None)
        n = sum(bands.values())
        nulls = Counter()
        for v in v5.values():
            for f, val in v["facts"].items():
                nulls[f] += val is None
        conf = Counter(v["confidence"] for v in v5.values())
        summary[kind] = {
            "rows": len(m["rows"]), "with_parts": len(v5), "scored": n,
            "bands": {b: f"{bands.get(b, 0)} ({100 * bands.get(b, 0) / max(n, 1):.1f}%)"
                      for b in BAND_ORDER + (None,)},
            "confidence": dict(conf),
            "fact_nulls": {f: f"{c} of {len(v5)} ({100 * c / max(len(v5), 1):.0f}%)"
                           for f, c in nulls.items()},
            "with_rank": sum(1 for v in v5.values() if v["rank"]),
        }
        print(f"{kind}: {json.dumps(summary[kind])}")
        if write:
            write_kind(kind, v5)
    if report:
        Path(report).write_text(json.dumps(summary, indent=1), encoding="utf-8")
    return summary


def public_v5(v):
    return {k: v[k] for k in ("score", "band", "rank", "facts", "confidence")}


def write_kind(kind, v5):
    key = ROW_KEY[kind]
    paths = cc_files(kind) + [PUBLIC / kind / "top.json"]
    for path in paths:
        data = read_json(path)
        changed = False
        for row in data.get(key) or []:
            v = v5.get(row.get("id"))
            if v is None:
                continue
            new = public_v5(v)
            if row.get("v5") != new:
                row["v5"] = new
                changed = True
        if changed:
            write_json(path, data)


def check():
    """Recompute against the frozen breakpoints and compare with the wire."""
    ref = frozen_part()
    diffs = 0
    for kind in KINDS:
        m = measure_kind(kind, ref["kinds"][kind])
        v5 = v5_of(kind, m)
        for row in m["rows"]:
            v = v5.get(row["id"])
            if v is not None and row.get("v5") != public_v5(v):
                diffs += 1
        again = measure_kind(kind)       # a fresh measurement of the knots
        same = again["score_knots"] == ref["kinds"][kind]["score_knots"]
        print(f"{kind}: wire matches frozen: {diffs == 0}; "
              f"remeasured breakpoints identical: {same}")
    return diffs


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--recalibrate", action="store_true")
    ap.add_argument("--version")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--report")
    args = ap.parse_args()
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if args.recalibrate:
        if not args.version:
            raise SystemExit("--recalibrate needs --version")
        recalibrate(args.version)
        return
    if args.check:
        raise SystemExit(1 if check() else 0)
    apply(write=not args.dry_run, report=args.report)


if __name__ == "__main__":
    main()
