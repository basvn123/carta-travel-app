"""Mountains on the D23 validation runner (T1192, ROADMAP D23 Mountains row).

References (one CSV per source in REF_DIR, columns id,name,lat,lon,cc,ele,
prom,route,source; ele and prom in metres, route 1 or 0, empty = unknown):

  wikidata_*.csv   owner export of Wikidata P2044 and P2660 (CC0), see the
                   SPARQL in the T1192 report. Circular where Carta's own
                   height came from Wikidata, so it is the primary for
                   prominence and a weak one for height.
  osm_*.csv        natural=peak with ele (ODbL), derived flags only.
  national_*.csv   national summit lists (DoBIH CC BY 4.0, swisstopo, BEV):
                   the independent check where they exist.
  seed.csv         committed: 30 national and range high points with their
                   published heights, to prove the layer runs. A seed, not a
                   reference: its numbers were entered by hand. The soft
                   baseline on disk is the seed's and is replaced by the
                   owner's first real run (T1192-a).

Per reference summit:
  flags  matched   a Carta mountain row within MATCH_KM with a name word in
                   common (or the same Wikidata id), or within SAME_KM.
         rated     the row is in the rated tier.
  facts  position  the matched row lies within POSITION_KM of the summit.
         height    Carta ele within max(HEIGHT_ABS_M, 1% of ele) of the reference.
         prom      Carta prom within max(30 m, 20%) of the reference.
         route     the reference says a route exists and Carta has routes or
                   routeUp (only references with route=1 carry this fact).
  rank   (reference prominence, Carta score) over matched rated rows.
  error  (reference ele, Carta ele): MAE in metres and MdAPE.

No network, no model.
"""
from __future__ import annotations

import csv
import glob
import hashlib
import json
import math
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REF_DIR = ROOT / "data" / "reports" / "validation" / "mountains"
WIRE_DIR = ROOT / "continent-app" / "public" / "mountains"

NAME = "mountains"
SHARE = 1.0
MIN_PER_COUNTRY = 3
MATCH_KM = 4.0           # a named summit this close is the same peak; position is its own fact
PLACE_KM = 1.0
POSITION_KM = 1.0
SAME_KM = 0.3
HEIGHT_ABS_M = 15
ISO_ALIAS = {"EL": "GR", "UK": "GB"}

# Soft until the owner has run the Wikidata export and taken a real baseline
# (T1192-a): a hard check with no baseline fails the D2 run, and the seed is
# not a baseline. Flip coverage and fact.height to "hard" then, and add the
# fact.prom and agreement_tau checks (the seed has no prominence, so a check
# on them would only warn).
CHECKS = [
    {"metric": "coverage", "kind": "soft", "direction": "higher", "tolerance_points": 0, "min_n": 20},
    {"metric": "fact.height", "kind": "soft", "direction": "higher", "tolerance_points": 0, "min_n": 20},
    {"metric": "fact.position", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 20},
    {"metric": "fact.route", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 15},
    {"metric": "in_rated", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 20},
    {"metric": "error_mae", "kind": "soft", "direction": "lower", "tolerance_points": 5, "min_n": 20},
]

_FOLD = str.maketrans({"ø": "o", "æ": "ae", "œ": "oe", "ß": "ss", "ł": "l", "đ": "d"})
_STOP = {"mount", "monte", "mont", "berg", "piz", "pic", "pico", "peak", "spitze", "horn",
         "the", "of", "de", "di", "del", "la", "le", "dei", "des", "gora", "mala", "velka"}


def iso2(c):
    c = (c or "").strip().upper()
    return ISO_ALIAS.get(c, c)


def km(a, b, c, d):
    p1, p2 = math.radians(a), math.radians(c)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(d - b) / 2) ** 2
    return 12742.0 * math.asin(math.sqrt(h))


def words(t):
    s = unicodedata.normalize("NFKD", (t or "").lower().translate(_FOLD))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return {w for w in re.findall(r"[a-z0-9]{3,}", s) if w not in _STOP}


def num(v):
    try:
        return float(v) if v not in (None, "") else None
    except ValueError:
        return None


class Grid:
    CELL = 0.05

    def __init__(self, rows):
        self.cells = {}
        for r in rows:
            self.cells.setdefault((math.floor(r["lat"] / self.CELL), math.floor(r["lon"] / self.CELL)), []).append(r)

    def near(self, lat, lon, radius):
        reach = 1 + int(radius // 4.0)
        ky, kx = math.floor(lat / self.CELL), math.floor(lon / self.CELL)
        for dy in range(-reach, reach + 1):
            for dx in range(-reach, reach + 1):
                for r in self.cells.get((ky + dy, kx + dx), ()):
                    d = km(lat, lon, r["lat"], r["lon"])
                    if d <= radius:
                        yield r, d


def references(ctx):
    folder = Path(ctx.get("reference_dir") or REF_DIR)
    out, seen = [], set()
    files = sorted(glob.glob(str(folder / "*.csv")))
    ctx["_ref_files"] = [Path(f).name for f in files]
    for f in files:
        stem = Path(f).stem
        with open(f, encoding="utf-8", newline="") as fh:
            for r in csv.DictReader(fh):
                lat, lon = num(r.get("lat")), num(r.get("lon"))
                if lat is None or lon is None or not r.get("name"):
                    continue
                rid = f"{stem}:{r.get('id') or r['name']}"
                if rid in seen:
                    continue
                seen.add(rid)
                out.append({"id": rid, "countries": [iso2(r.get("cc"))], "name": r["name"], "lat": lat,
                            "lon": lon, "ele": num(r.get("ele")), "prom": num(r.get("prom")),
                            "route": {"1": True, "0": False}.get((r.get("route") or "").strip()),
                            "wd": (r.get("id") or "") if re.fullmatch(r"Q\d+", r.get("id") or "") else "",
                            "source": r.get("source") or stem})
    return out


def load(ctx):
    rows, wire_at = [], ""
    for f in sorted(glob.glob(str(Path(ctx.get("wire", WIRE_DIR)) / "??.json"))):
        try:
            blob = json.loads(Path(f).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        wire_at = max(wire_at, blob.get("generated_at") or "")
        for bucket in ("mountains", "listed"):
            for b in blob.get(bucket) or []:
                if b.get("lat") is None or b.get("lon") is None:
                    continue
                rows.append({"id": b["id"], "wd": b.get("wd") or "", "name": b.get("name") or "",
                             "local": b.get("nameLocal") or "", "cc": b.get("cc"), "lat": float(b["lat"]),
                             "lon": float(b["lon"]), "rated": bucket == "mountains", "score": b.get("score"),
                             "ele": b.get("ele"), "prom": b.get("prom"),
                             "route": bool(b.get("routes") or b.get("routeUp"))})
    return {"rows": rows, "grid": Grid(rows), "wd": {r["wd"]: r for r in rows if r["wd"]}, "wire_at": wire_at}


def best_match(ref, carta):
    if ref["wd"] and ref["wd"] in carta["wd"]:
        row = carta["wd"][ref["wd"]]
        return row, km(ref["lat"], ref["lon"], row["lat"], row["lon"]), "wikidata"
    rw, best = words(ref["name"]), None
    for row, d in carta["grid"].near(ref["lat"], ref["lon"], MATCH_KM):
        named = bool(rw & (words(row["name"]) | words(row["local"])))
        if not named and d > SAME_KM:
            continue
        key = (0 if named else 1, d)
        if best is None or key < best[0]:
            best = (key, row, d, "name" if named else "place")
    return (best[1], best[2], best[3]) if best else None


def match(refs, carta):
    out = []
    for ref in refs:
        hit = best_match(ref, carta)
        flags = {"matched": hit is not None, "in_rated": None}
        facts = {"height": None, "prom": None, "route": None, "position": None}
        rank = err = row = None
        if hit:
            row = hit[0]
            flags["in_rated"] = bool(row["rated"])
            facts["position"] = hit[1] <= POSITION_KM
            if ref["ele"] is not None and row["ele"] is not None:
                facts["height"] = abs(row["ele"] - ref["ele"]) <= max(HEIGHT_ABS_M, 0.01 * ref["ele"])
                err = (ref["ele"], float(row["ele"]))
            if ref["prom"] is not None and row["prom"] is not None:
                facts["prom"] = abs(row["prom"] - ref["prom"]) <= max(30, 0.2 * ref["prom"])
            if ref["route"]:
                facts["route"] = row["route"]
            if ref["prom"] is not None and row["score"] is not None:
                rank = (ref["prom"], row["score"])
        out.append({"id": ref["id"], "country": ref["countries"][0], "flags": flags, "facts": facts,
                    "rank": rank, "error": err, "note": None, "_ref": ref, "_row": row,
                    "_km": hit[1] if hit else None})
    return out


def gap_size(r):
    ref, row = r["_ref"], r["_row"]
    if row is None:
        return 3 + (ref["ele"] or 0) / 1500
    if r["facts"].get("position") is False:
        return 1.5 + r["_km"] / 5
    if r["facts"].get("height") is False:
        return 1 + abs(row["ele"] - ref["ele"]) / 50
    if r["facts"].get("route") is False:
        return 1
    if r["facts"].get("prom") is False:
        return 0.5 + abs((row["prom"] or 0) - ref["prom"]) / 500
    return 0


def cause(r):
    row = r["_row"]
    if row is None:
        return "not_published_or_name_differs"
    if r["facts"].get("position") is False:
        return "carta_coordinate_off_summit"
    if r["facts"].get("height") is False:
        d = row["ele"] - r["_ref"]["ele"]
        return "carta_height_higher" if d > 0 else "carta_height_lower"
    if r["facts"].get("route") is False:
        return "route_up_missing"
    return "prominence_differs"


def gaps(results, n=30, per_country=3):
    def tie(r):
        return hashlib.sha256(("gaps" + r["id"]).encode()).hexdigest()

    ranked = sorted(((gap_size(r), r) for r in results if gap_size(r) > 0), key=lambda t: (-t[0], tie(t[1])))
    seen, pick = {}, []
    for size, r in ranked:
        if seen.get(r["country"], 0) >= per_country:
            continue
        seen[r["country"]] = seen.get(r["country"], 0) + 1
        pick.append((size, r))
        if len(pick) == n:
            break
    return [{"id": r["id"], "name": r["_ref"]["name"], "country": r["country"],
             "status": "missing" if r["_row"] is None else "wrong", "ref_ele": r["_ref"]["ele"],
             "ref_prom": r["_ref"]["prom"], "cause": cause(r), "carta": (r["_row"] or {}).get("id"),
             "carta_ele": (r["_row"] or {}).get("ele"), "carta_prom": (r["_row"] or {}).get("prom"),
             "gap": round(size, 2)} for size, r in pick]


def describe(ctx, carta):
    return {"reference": {"files": ctx.get("_ref_files", []), "source": "Wikidata, OSM, national lists, seed"},
            "carta": {"wire_generated_at": carta["wire_at"], "rows": len(carta["rows"])}}
