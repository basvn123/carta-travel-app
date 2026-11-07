"""Cycling on the D23 validation runner (T1193, ROADMAP D23 Cycling row).

Reference: the EuroVelo routes (data/reports/validation/cycling/reference/
eurovelo.csv, one item per route and country), optionally the national
networks (national.csv), the official length per country
(eurovelo_countries.csv) and the official track (geom/EV6-AT.geojson). The
seed list is written from memory and marked verified=no, so every check is
soft until the owner confirms the list (T1193-a). No network, no model.

What a result says, per reference item (route in one country):

  flags   matched   Carta has a route row in that country tagged with the
                    route (ref EV6, "EV 13", or "EuroVelo 6" in the name) or,
                    for a national item, the same ref or a shared name word.
          rated     one of the matched rows is in the rated tier.
          nonfrag   the matched rows number at most FRAG_MAX: the route is not
                    shattered into many pieces (None when unmatched).
  facts   length    Carta's summed km is within LEN_LOW..LEN_HIGH of the
                    official km in that country (needs eurovelo_countries.csv).
          geometry  at least GEOM_SHARE of the official track, sampled every
                    SAMPLE_M, lies within TOL_M of a matched Carta line (needs
                    a geom file; the wire is simplified to 90 m, so the
                    tolerance is wider than the harvest's 40 m).
  error   (official km, Carta km) where the official length is known.
"""
from __future__ import annotations

import csv
import hashlib
import itertools
import json
import math
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REF_DIR = ROOT / "data" / "reports" / "validation" / "cycling" / "reference"
WIRE_DIR = ROOT / "continent-app" / "public" / "cycling"

NAME = "cycling"
SHARE = 1.0
MIN_PER_COUNTRY = 5
LEN_LOW, LEN_HIGH = 0.6, 1.4
FRAG_MAX = 12
TOL_M = 250.0
SAMPLE_M = 500.0
GEOM_SHARE = 0.8
ISO_ALIAS = {"UK": "GB", "EL": "GR"}

# Soft until the owner verifies the seed list (T1193-a).
CHECKS = [
    {"metric": "coverage", "kind": "soft", "direction": "higher", "tolerance_points": 0, "min_n": 5},
    {"metric": "fact.length", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 5},
    {"metric": "fact.geometry", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 3},
    {"metric": "nonfrag", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 5},
    {"metric": "error_mdape", "kind": "soft", "direction": "lower", "tolerance_points": 5, "min_n": 5},
]

_EV_REF = re.compile(r"^\s*(?:ev|euro\s?velo)\s*-?\s*(\d{1,2})\b", re.IGNORECASE)
_EV_NAME = re.compile(r"euro\s?velo\s*-?\s*(\d{1,2})\b", re.IGNORECASE)
_STOP = {"route", "radweg", "weg", "path", "trail", "cycle", "cycling", "velo", "via",
         "part", "leg", "the", "der", "die", "das", "de", "la", "le", "van", "von"}
_FOLD = str.maketrans({"ø": "o", "æ": "ae", "œ": "oe", "ß": "ss", "ł": "l", "đ": "d"})


def iso2(code):
    code = (code or "").strip().upper()
    return ISO_ALIAS.get(code, code)


def words(text):
    s = unicodedata.normalize("NFKD", (text or "").lower().translate(_FOLD))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return {w for w in re.findall(r"[a-z0-9]{3,}", s) if w not in _STOP and not w.isdigit()}


def ev_number(row):
    """The EuroVelo number a Carta row carries, from its ref first, then its name."""
    for text, rx in ((row.get("ref"), _EV_REF), (row.get("name"), _EV_NAME)):
        m = rx.match(text or "") if rx is _EV_REF else rx.search(text or "")
        if m:
            return int(m.group(1))
    return None


def proposed(row):
    t = (row.get("name") or "").lower()
    return any(w in t for w in ("propos", "planned", "geplant", "projet", "proposed"))


# ---------------------------------------------------------------------------
# References
# ---------------------------------------------------------------------------

def read_csv(path):
    try:
        with open(path, encoding="utf-8", newline="") as fh:
            return list(csv.DictReader(fh))
    except OSError:
        return []


def num(v):
    try:
        x = float(v)
        return x if x > 0 else None
    except (TypeError, ValueError):
        return None


def references(ctx):
    ref_dir = Path(ctx.get("reference_dir") or REF_DIR)
    ctx["_ref_dir"] = ref_dir
    km_by = {(r["ev"].strip().upper(), iso2(r["cc"])): num(r.get("km"))
             for r in read_csv(ref_dir / "eurovelo_countries.csv") if r.get("ev") and r.get("cc")}
    out, verified = [], []
    for r in read_csv(ref_dir / "eurovelo.csv"):
        ev = (r.get("ev") or "").strip().upper()
        m = re.match(r"EV(\d{1,2})$", ev)
        if not m:
            continue
        verified.append((r.get("verified") or "").strip().lower() == "yes")
        for cc in [iso2(c) for c in (r.get("countries") or "").split(";") if c.strip()]:
            geom = ref_dir / "geom" / f"{ev}-{cc}.geojson"
            out.append({"id": f"{ev}:{cc}", "countries": [cc], "kind": "eurovelo", "ev": int(m.group(1)),
                        "ref": ev, "name": r.get("name") or ev, "km": km_by.get((ev, cc)),
                        "total_km": num(r.get("total_km")), "geom": geom if geom.exists() else None})
    for r in read_csv(ref_dir / "national.csv"):
        if not r.get("id") or not r.get("cc"):
            continue
        out.append({"id": f"nat:{r['id']}", "countries": [iso2(r["cc"])], "kind": "national", "ev": None,
                    "ref": (r.get("ref") or "").strip(), "name": r.get("name") or "", "km": num(r.get("km")),
                    "net": (r.get("net") or "").strip().lower(), "total_km": None, "geom": None})
    ctx["_verified"] = bool(verified) and all(verified)
    return out


# ---------------------------------------------------------------------------
# Carta's side
# ---------------------------------------------------------------------------

def lines_of(geometry):
    if not geometry:
        return []
    c = geometry.get("coordinates") or []
    return c if geometry.get("type") == "MultiLineString" else [c] if c else []


def load(ctx):
    rows, wire_at = [], ""
    wire = Path(ctx.get("wire", WIRE_DIR))
    for f in sorted(wire.glob("??.json")):
        try:
            blob = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        wire_at = max(wire_at, blob.get("generated_at") or "")
        for bucket in ("routes", "listed"):
            for r in blob.get(bucket) or []:
                row = {"id": r["id"], "cc": iso2(r.get("cc") or blob.get("country")), "name": r.get("name") or "",
                       "ref": r.get("ref") or "", "net": r.get("net"), "km": float(r.get("km") or 0),
                       "rated": bucket == "routes" or r.get("score") is not None, "bbox": r.get("bbox")}
                row["ev"] = ev_number(row)
                # keep a line only where a geometry check can use it
                row["lines"] = lines_of(r.get("geometry")) if row["ev"] else []
                rows.append(row)
    by_cc_ev, by_cc = {}, {}
    for row in rows:
        by_cc.setdefault(row["cc"], []).append(row)
        if row["ev"]:
            by_cc_ev.setdefault((row["cc"], row["ev"]), []).append(row)
    return {"rows": rows, "by_cc_ev": by_cc_ev, "by_cc": by_cc, "wire_at": wire_at}


def national_rows(ref, carta):
    rw = words(ref["name"])
    out = []
    for row in carta["by_cc"].get(ref["countries"][0], []):
        if row["ev"]:
            continue
        same_ref = ref["ref"] and row["ref"].strip().lower() == ref["ref"].lower()
        if ref.get("net") and row["net"] != ref["net"] and not same_ref:
            continue
        if same_ref or (rw and rw & words(row["name"])):
            out.append(row)
    return out


# ---------------------------------------------------------------------------
# Geometry: sampled official track against Carta lines
# ---------------------------------------------------------------------------

def to_xy(lon, lat, lat0):
    return lon * 111320.0 * math.cos(math.radians(lat0)), lat * 110540.0


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    d2 = dx * dx + dy * dy
    t = 0.0 if d2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / d2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def sample_line(coords, step_m):
    """Points along a lon/lat line about step_m apart (always the first point)."""
    pts = []
    carry = 0.0
    for i, (lon, lat) in enumerate(coords):
        if i == 0:
            pts.append((lon, lat))
            continue
        plon, plat = coords[i - 1]
        x0, y0 = to_xy(plon, plat, plat)
        x1, y1 = to_xy(lon, lat, plat)
        seg = math.hypot(x1 - x0, y1 - y0)
        d = step_m - carry
        while d <= seg and seg > 0:
            f = d / seg
            pts.append((plon + (lon - plon) * f, plat + (lat - plat) * f))
            d += step_m
        carry = (carry + seg) % step_m if seg else carry
    return pts


def geometry_share(ref_lines, carta_lines, tol_m=TOL_M, step_m=SAMPLE_M):
    """(share of reference sample points within tol_m of a Carta line, n points)."""
    segs = {}
    cell = max(tol_m, 1.0) / 110000.0 * 2
    for line in carta_lines:
        for (a_lon, a_lat), (b_lon, b_lat) in itertools.pairwise(line):
            steps = max(1, int(max(abs(b_lat - a_lat), abs(b_lon - a_lon)) / cell) + 1)
            keys = {(math.floor((a_lat + (b_lat - a_lat) * i / steps) / cell),
                     math.floor((a_lon + (b_lon - a_lon) * i / steps) / cell)) for i in range(steps + 1)}
            for k in keys:
                segs.setdefault(k, []).append((a_lon, a_lat, b_lon, b_lat))
    hit = n = 0
    for line in ref_lines:
        for lon, lat in sample_line(line, step_m):
            n += 1
            ky, kx = math.floor(lat / cell), math.floor(lon / cell)
            best = None
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    for a_lon, a_lat, b_lon, b_lat in segs.get((ky + dy, kx + dx), ()):
                        ax, ay = to_xy(a_lon, a_lat, lat)
                        bx, by = to_xy(b_lon, b_lat, lat)
                        px, py = to_xy(lon, lat, lat)
                        d = seg_dist(px, py, ax, ay, bx, by)
                        if best is None or d < best:
                            best = d
            if best is not None and best <= tol_m:
                hit += 1
    return (hit / n if n else None), n


def read_geojson_lines(path):
    try:
        blob = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    feats = blob.get("features") if blob.get("type") == "FeatureCollection" else [blob]
    out = []
    for f in feats or []:
        g = f.get("geometry", f) if isinstance(f, dict) else None
        out += lines_of(g)
    return out


# ---------------------------------------------------------------------------
# Match
# ---------------------------------------------------------------------------

def match(refs, carta):
    out = []
    for ref in refs:
        cc = ref["countries"][0]
        rows = (carta["by_cc_ev"].get((cc, ref["ev"]), []) if ref["kind"] == "eurovelo" else national_rows(ref, carta))
        # a proposed route is a row, but only a built one counts for length
        built = [r for r in rows if not proposed(r)]
        km = round(sum(r["km"] for r in built), 1)
        flags = {"matched": bool(rows), "rated": (any(r["rated"] for r in rows) if rows else None),
                 "nonfrag": (len(rows) <= FRAG_MAX) if rows else None}
        facts = {"length": None, "geometry": None}
        err = share = None
        if rows and ref["km"]:
            facts["length"] = LEN_LOW <= km / ref["km"] <= LEN_HIGH
            err = (ref["km"], km)
        if rows and ref["geom"]:
            share, _n = geometry_share(read_geojson_lines(ref["geom"]), [ln for r in rows for ln in r["lines"]])
            if share is not None:
                facts["geometry"] = share >= GEOM_SHARE
        out.append({"id": ref["id"], "country": cc, "flags": flags, "facts": facts, "rank": None,
                    "error": err, "note": None, "_ref": ref, "_rows": rows, "_km": km, "_share": share})
    return out


# ---------------------------------------------------------------------------
# Gaps
# ---------------------------------------------------------------------------

def expected_km(r):
    ref = r["_ref"]
    return ref["km"] or ((ref["total_km"] or 0) / max(1, ref.get("n_countries", 1)))


def gap_size(r):
    ref = r["_ref"]
    if not r["flags"]["matched"]:
        return 100.0 + (ref["km"] or (ref["total_km"] or 0) / 8.0) / 100.0
    if r["facts"].get("geometry") is False:
        return 50.0 + (1 - (r["_share"] or 0)) * 10
    if r["facts"].get("length") is False and ref["km"]:
        return 20.0 + abs(1 - r["_km"] / ref["km"]) * 10
    return 0.0


def cause(r):
    if not r["flags"]["matched"]:
        return "route_absent_or_untagged_in_country"
    if r["facts"].get("geometry") is False:
        return "geometry_differs_from_official_track"
    if r["facts"].get("length") is False:
        return "too_short" if r["_km"] < r["_ref"]["km"] else "too_long_or_duplicated"
    return "ok"


def gaps(results, limit=30, per_country=3):
    def tie(r):
        return hashlib.sha256(("gaps" + r["id"]).encode()).hexdigest()

    ranked = sorted(((gap_size(r), r) for r in results if gap_size(r) > 0), key=lambda t: (-t[0], tie(t[1])))
    seen, pick = {}, []
    for size, r in ranked:
        if seen.get(r["country"], 0) >= per_country:
            continue
        seen[r["country"]] = seen.get(r["country"], 0) + 1
        pick.append((size, r))
        if len(pick) == limit:
            break
    return [{"id": r["id"], "name": r["_ref"]["name"], "country": r["country"],
             "status": "missing" if not r["flags"]["matched"] else "differs",
             "official_km": r["_ref"]["km"], "carta_km": r["_km"], "pieces": len(r["_rows"]),
             "geometry_share": None if r["_share"] is None else round(r["_share"], 3),
             "cause": cause(r), "verified": r["_ref"].get("verified", False), "gap": round(size, 2)}
            for size, r in pick]


def describe(ctx, carta):
    d = ctx.get("_ref_dir") or REF_DIR
    try:
        d = str(Path(d).resolve().relative_to(ROOT))
    except ValueError:
        d = str(d)
    return {"reference": {"path": d, "source": "EuroVelo route list (seed from memory, verified=no)"
                          if not ctx.get("_verified") else "EuroVelo route list (verified)"},
            "carta": {"wire_generated_at": carta["wire_at"], "rows": len(carta["rows"])}}
