"""Lakes on the D23 validation runner (T1192, ROADMAP D23 Lakes row).

Reference: the inland part of the EEA WISE bathing water register (Lake sites;
rivers are not lakes and stay out). The sea part is the beaches layer
(layer_beaches.py); the file is the same, cache/eea_bathing_water.json (git
LFS), so nothing new is fetched. National lists (France data.gouv, Sweden HaV,
Finland SYKE) are optional add-ons read from the CSV folder in NATIONAL_DIR
(columns: id,name,lat,lon,cc,class), see docs/LAKES.md and the T1192 report.

What a result says, per reference site:

  flags   matched   a Carta lake lies within the lake's own reach of the
                    site (its area sets the radius, as pipeline/lakes/
                    fill_water.py does) and the names share a distinctive
                    word, or the site is within SAME_PLACE_KM. This is the
                    coverage: designated lakes Carta lists.
          rated     the matched lake is in the rated tier.
          has_water the matched lake prints a water class at all.
  facts   class     the lake's printed class equals the best class of the
                    register sites near it (best of many, as fill_water does).
          poor      the best nearby class is Poor: Carta prints Poor, no
                    class, or a swim rule that is not a plain "yes".
          swim      the lake is designated and Good or Excellent, so swimming
                    is allowed: Carta's rule is not "no".
          known     the swim rule is known (not "unknown"), for a designated
                    site. A coverage-style fact, it should be near 100%.
  rank    (register class number, Carta lake score) over matched lakes.
  error   (register class number, Carta class number): the class step error.

Pure stdlib, no network, no model. The reference file is the shared EEA cache
or, when that is an unfetched LFS pointer, the committed lake sample.
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
REGISTER = ROOT / "cache" / "eea_bathing_water.json"
SAMPLE = ROOT / "data" / "reports" / "validation" / "lakes" / "reference_sample.json"
NATIONAL_DIR = ROOT / "data" / "reports" / "validation" / "lakes" / "national"
WIRE_DIR = ROOT / "continent-app" / "public" / "lakes"

NAME = "lakes"
SHARE = 1.0
MIN_PER_COUNTRY = 5
SAME_PLACE_KM = 0.3
NAMED_EXTRA_KM = 1.5       # beyond the lake radius, a shared name word still joins
UNNAMED_KM = 2.5
ISO_ALIAS = {"EL": "GR", "UK": "GB"}
CLASS_NUM = {"Poor": 1, "Sufficient": 2, "Good": 3, "Excellent": 4}

CHECKS = [
    {"metric": "coverage", "kind": "hard", "direction": "higher", "tolerance_points": 0},
    {"metric": "fact.class", "kind": "hard", "direction": "higher", "tolerance_points": 0, "min_n": 30},
    {"metric": "fact.poor", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 3},
    {"metric": "fact.swim", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 30},
    {"metric": "fact.known", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 30},
    {"metric": "has_water", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 30},
    {"metric": "agreement_tau", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 30},
    {"metric": "error_mae", "kind": "soft", "direction": "lower", "tolerance_points": 5, "min_n": 30},
]

_STOP = {"lake", "lago", "lac", "see", "meer", "jezero", "ezero", "jarvi", "sjo", "the", "of", "de",
         "di", "del", "la", "le", "bad", "strand", "badestelle", "plage", "beach", "camping",
         "strandbad", "freibad", "baggersee", "weiher", "plas", "plassen", "zone", "site"}
_FOLD = str.maketrans({"ø": "o", "æ": "ae", "œ": "oe", "ß": "ss", "ł": "l", "đ": "d", "ð": "d", "þ": "th"})
_POINT = re.compile(r"\s+(?:pm|pt|p)\s*\d{1,2}\s*$", re.IGNORECASE)


def iso2(code):
    code = (code or "").strip().upper()
    return ISO_ALIAS.get(code, code)


def km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 12742.0 * math.asin(math.sqrt(a))


def words(text):
    s = unicodedata.normalize("NFKD", _POINT.sub("", text or "").lower().translate(_FOLD))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return {w for w in re.findall(r"[a-z0-9]{3,}", s) if w not in _STOP and not w.isdigit()}


def radius_km(area):
    """fill_water.radius_km: the lake's reach from its area."""
    return 1.5 if not area or area <= 0 else max(1.0, min(18.0, math.sqrt(area / math.pi) * 1.35))


def klass(v):
    return v if v in CLASS_NUM else None


class Grid:
    CELL = 0.05

    def __init__(self, rows):
        self.cells = {}
        for r in rows:
            self.cells.setdefault(self.key(r["lat"], r["lon"]), []).append(r)

    def key(self, lat, lon):
        return (math.floor(lat / self.CELL), math.floor(lon / self.CELL))

    def near(self, lat, lon, radius):
        reach = 1 + int(radius // 4.0)      # one cell is about 5.5 km north-south
        ky, kx = self.key(lat, lon)
        for dy in range(-reach, reach + 1):
            for dx in range(-reach, reach + 1):
                for r in self.cells.get((ky + dy, kx + dx), ()):
                    d = km(lat, lon, r["lat"], r["lon"])
                    if d <= radius:
                        yield r, d


# ---------------------------------------------------------------------------
# References
# ---------------------------------------------------------------------------

def load_register(path):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return data.get("sites", data) if isinstance(data, dict) else data


def register_refs(sites):
    out = []
    for s in sites:
        if s.get("type") != "Lake" or s.get("lat") is None or s.get("lon") is None or not s.get("bwid"):
            continue
        out.append({"id": s["bwid"], "countries": [iso2(s.get("iso2"))], "name": s.get("name") or "",
                    "lat": float(s["lat"]), "lon": float(s["lon"]), "q": klass(s.get("q")),
                    "q1": klass(s.get("q1")), "src": "eea"})
    return out


def national_refs(folder):
    out = []
    for f in sorted(glob.glob(str(Path(folder) / "*.csv"))):
        with open(f, encoding="utf-8", newline="") as fh:
            for r in csv.DictReader(fh):
                try:
                    lat, lon = float(r["lat"]), float(r["lon"])
                except (KeyError, ValueError):
                    continue
                out.append({"id": r.get("id") or f"{Path(f).stem}:{r.get('name')}",
                            "countries": [iso2(r.get("cc"))], "name": r.get("name") or "",
                            "lat": lat, "lon": lon, "q": klass(r.get("class")), "q1": None,
                            "src": "national:" + Path(f).stem})
    return out


def references(ctx):
    path = Path(ctx.get("reference") or REGISTER)
    if not path.exists() or path.read_bytes()[:40].startswith(b"version https://git-lfs"):
        path = SAMPLE
    ctx["_ref_path"] = path
    refs = register_refs(load_register(path))
    refs += national_refs(ctx.get("national") or NATIONAL_DIR)
    # every site, not only the sample: a lake's class is the best of the sites near it
    ctx["_all"] = Grid([r for r in refs if r["q"]])
    return refs


# ---------------------------------------------------------------------------
# Carta's side
# ---------------------------------------------------------------------------

def load(ctx):
    rows, wire_at = [], ""
    for f in sorted(glob.glob(str(Path(ctx.get("wire", WIRE_DIR)) / "??.json"))):
        try:
            blob = json.loads(Path(f).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        wire_at = max(wire_at, blob.get("generated_at") or "")
        for bucket in ("lakes", "listed"):
            for b in blob.get(bucket) or []:
                if b.get("lat") is None or b.get("lon") is None:
                    continue
                w, sw = b.get("water") or {}, b.get("swim") or {}
                rows.append({"id": b["id"], "name": b.get("name") or "", "cc": b.get("cc") or blob.get("country"),
                             "lat": float(b["lat"]), "lon": float(b["lon"]), "rated": bucket == "lakes",
                             "score": b.get("score"), "area": (b.get("size") or {}).get("areaKm2"),
                             "class": klass(w.get("class")), "site": w.get("site") or "",
                             "rule": sw.get("rule"), "swim_src": sw.get("src")})
    return {"rows": rows, "grid": Grid(rows), "wire_at": wire_at, "all": ctx.get("_all")}


def best_match(ref, grid):
    best = None
    rw = words(ref["name"])
    for row, d in grid.near(ref["lat"], ref["lon"], 45.0):
        reach = radius_km(row["area"]) + NAMED_EXTRA_KM
        named = bool(rw & (words(row["name"]) | words(row["site"])))
        # a shore site of a big lake sits far from the lake's centre point
        big = 1.6 * math.sqrt(row["area"] / math.pi) + 2.0 if row["area"] and row["area"] > 50 else 0
        if named and d <= max(reach * 2, big) or d <= SAME_PLACE_KM or (not rw and d <= UNNAMED_KM) or (not words(row["name"]) and d <= reach):
            ok = True
        else:
            ok = False
        if not ok:
            continue
        key = (0 if named else 1, d)
        if best is None or key < best[0]:
            best = (key, row, d, "name" if named else "place")
    return best


def best_ref_class(ref, all_grid):
    """The best class among register sites that share a name word or lie within 1.5 km."""
    rw = words(ref["name"])
    best = None
    for s, d in all_grid.near(ref["lat"], ref["lon"], 8.0):
        if not ((rw & words(s["name"])) or d <= 1.5):
            continue
        if best is None or CLASS_NUM[s["q"]] > CLASS_NUM[best]:
            best = s["q"]
    return best or ref["q"]


def match(refs, carta, all_grid=None):
    all_grid = all_grid or carta.get("all") or Grid([r for r in refs if r["q"]])
    out = []
    for ref in refs:
        hit = best_match(ref, carta["grid"])
        flags = {"matched": hit is not None, "rated": None, "has_water": None}
        facts = {"class": None, "poor": None, "swim": None, "known": None}
        rank = err = note = row = None
        ref_c = best_ref_class(ref, all_grid) if ref["q"] else None
        if hit:
            row = hit[1]
            flags["rated"] = bool(row["rated"])
            flags["has_water"] = row["class"] is not None
            if ref_c and row["class"]:
                facts["class"] = row["class"] == ref_c
                err = (float(CLASS_NUM[ref_c]), float(CLASS_NUM[row["class"]]))
            if ref_c == "Poor":
                facts["poor"] = row["class"] in (None, "Poor") or row["rule"] != "yes"
            if ref_c in ("Good", "Excellent"):
                facts["swim"] = row["rule"] != "no"
            if ref_c:
                facts["known"] = row["rule"] not in (None, "unknown")
            if ref_c and row["score"] is not None:
                rank = (CLASS_NUM[ref_c], row["score"])
        out.append({"id": ref["id"], "country": ref["countries"][0], "flags": flags, "facts": facts,
                    "rank": rank, "error": err, "note": note,
                    "_ref": ref, "_row": row, "_class": ref_c, "_km": hit[2] if hit else None})
    return out


# ---------------------------------------------------------------------------
# Gaps
# ---------------------------------------------------------------------------

def gap_size(r):
    cls = CLASS_NUM.get(r["_class"], 2)
    row = r["_row"]
    if row is None:
        return 2 + cls
    if r["facts"].get("poor") is False:
        return 6
    if r["facts"].get("swim") is False:
        return 5
    if r["facts"].get("class") is False:
        return 1 + abs(cls - CLASS_NUM[row["class"]])
    if r["facts"].get("known") is False:
        return 1
    return 0


def cause(r):
    row = r["_row"]
    if row is None:
        return "not_published_or_name_differs" if words(r["_ref"]["name"]) else "register_name_is_code_or_place"
    if r["facts"].get("poor") is False:
        return "poor_not_flagged"
    if r["facts"].get("swim") is False:
        return "swim_banned_on_clean_designated_lake"
    if r["facts"].get("class") is False:
        return "lake_joined_to_other_site" if row["site"] else "class_differs"
    return "swim_rule_unknown"


def gaps(results, missing=20, wrong=10, per_country=3):
    def tie(r):
        return hashlib.sha256(("gaps" + r["id"]).encode()).hexdigest()

    ranked = sorted(((gap_size(r), r) for r in results if gap_size(r) > 0), key=lambda t: (-t[0], tie(t[1])))
    pick = []
    for want, test in ((missing, lambda r: r["_row"] is None), (wrong, lambda r: r["_row"] is not None)):
        seen, part = {}, []
        for size, r in ranked:
            if not test(r) or seen.get(r["country"], 0) >= per_country:
                continue
            seen[r["country"]] = seen.get(r["country"], 0) + 1
            part.append((size, r))
            if len(part) == want:
                break
        pick += part
    pick.sort(key=lambda t: (-t[0], tie(t[1])))
    return [{"id": r["id"], "name": r["_ref"]["name"], "country": r["country"], "class": r["_class"],
             "status": "missing" if r["_row"] is None else "wrong", "lat": r["_ref"]["lat"],
             "lon": r["_ref"]["lon"], "cause": cause(r), "carta": (r["_row"] or {}).get("id"),
             "carta_class": (r["_row"] or {}).get("class"), "carta_rule": (r["_row"] or {}).get("rule"),
             "gap": size} for size, r in pick]


def describe(ctx, carta):
    path = ctx.get("_ref_path") or REGISTER
    try:
        path = str(Path(path).resolve().relative_to(ROOT))
    except ValueError:
        path = str(path)
    return {"reference": {"path": path, "source": "EEA WISE bathing water register, Lake sites"},
            "carta": {"wire_generated_at": carta["wire_at"], "rows": len(carta["rows"])}}
