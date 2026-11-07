"""Beaches on the D23 validation runner (T1189, ROADMAP D23 Beaches row).

References (each a layer on the runner, same matcher):

  beaches            the EEA WISE bathing water register (22,289 designated
                     sites, EU-27 plus Albania and Switzerland): the list
                     Carta's own spine reads (pipeline/beaches/eea_spine.py).
  beaches_blueflag   the Blue Flag list (layer_beaches_blueflag.py), same
                     matcher, its own scorecard row.

What a result says, per reference site:

  flags   near      a Carta beach lies within NEAR_KM (any name): a missed
                    site with one is a sampling point of a published beach.
          matched   Carta publishes a beach within MATCH_KM of the site whose
                    name agrees, or within SAME_PLACE_KM without a name.
                    This is the coverage. Sites the spine itself turned into
                    rows (src "eea") are matched by construction, so the
                    result also keeps `spine` (matched through an EEA row)
                    and the headline reports `coverage_open`: matched by a
                    row that did NOT come from the register.
          in_rated  the matched beach is in the rated tier (t == "r").
  facts   class     Carta's printed water class equals the register's latest
                    class. Left out when either side has no class.
          poor      the site is Poor in the register: Carta prints Poor or
                    no class, never a better one (the swim flag). Only Poor
                    sites carry this fact.
          water     the inland flag agrees with the register's category
                    (Lake and River are inland, Coastal and Transitional not).
  rank    (register class number, Carta beach score) for matched sites with
          a class: do cleaner sites score higher.
  error   (register class number, Carta class number): the class step error.

Mismatches caused by age are tagged in `note`: `stale_one_season` when Carta
equals last season's class (the register moved), so a reviewer separates a
season of staleness from a wrong join.

No network, no model: reads a register file and the beaches wire.
"""
from __future__ import annotations

import glob
import json
import math
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REGISTER = ROOT / "cache" / "eea_bathing_water.json"
SAMPLE = ROOT / "data" / "reports" / "validation" / "beaches" / "reference_sample.json"
WIRE_DIR = ROOT / "continent-app" / "public" / "beaches"

NAME = "beaches"
SHARE = 1.0                  # the whole register: matching 22k sites takes seconds
MIN_PER_COUNTRY = 5
MATCH_KM = 1.2               # eea_spine.MERGE_KM: the sampling point sits off the sand
SAME_PLACE_KM = 0.2          # eea_spine.SAME_PLACE_KM
NEAR_KM = 3.0                # a missed site with a beach this close is a sampling point, not a hole
ISO_ALIAS = {"EL": "GR", "UK": "GB"}
CLASS_NUM = {"Poor": 1, "Sufficient": 2, "Good": 3, "Excellent": 4}
INLAND = ("Lake", "River")

CHECKS = [
    {"metric": "coverage", "kind": "hard", "direction": "higher", "tolerance_points": 0},
    {"metric": "fact.class", "kind": "hard", "direction": "higher", "tolerance_points": 0, "min_n": 30},
    {"metric": "fact.poor", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 5},
    {"metric": "fact.water", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 30},
    {"metric": "agreement_tau", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 30},
    {"metric": "error_mae", "kind": "soft", "direction": "lower", "tolerance_points": 5, "min_n": 30},
]


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def iso2(code):
    code = (code or "").strip().upper()
    return ISO_ALIAS.get(code, code)


def km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 12742.0 * math.asin(math.sqrt(a))


_STOP = {"beach", "playa", "plage", "spiaggia", "praia", "strand", "plaza", "platja", "plaja",
         "de", "da", "di", "del", "della", "des", "du", "la", "le", "el", "il", "lo", "los", "las",
         "the", "of", "bw", "zone", "baignade", "badestelle", "bathing", "water", "site",
         "lido", "bay", "cala", "baia", "bucht", "strandbad", "see", "lake", "lac", "lago",
         "plazh", "nord", "sud", "north", "south", "east", "west", "est", "ouest", "centro", "centre"}
# T1216 (T1189-g): the BG register names its sites in Cyrillic, which the
# [a-z0-9] word test dropped whole (Shkorpilovtsi). Bulgaria's official
# Streamlined System (Transliteration Act 2009), the one its road signs and
# Wikidata labels use; other Cyrillic letters fall back to their common Latin.
_CYR = dict(zip("абвгдежзийклмнопрстуфхцчшщъьюяёэыєіїґ",
                ["a", "b", "v", "g", "d", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p",
                 "r", "s", "t", "u", "f", "h", "ts", "ch", "sh", "sht", "a", "y", "yu", "ya",
                 "yo", "e", "y", "ye", "i", "yi", "g"]))


def translit(name):
    return "".join(_CYR.get(c, _CYR.get(c.lower(), c)) for c in name or "")


_SAMPLE_POINT = re.compile(r"\s+(?:pm|pt|p)\s*\d{1,2}\s*$", re.IGNORECASE)


def tokens(name):
    s = unicodedata.normalize("NFKD", translit(_SAMPLE_POINT.sub("", name or "")))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return {t for t in re.findall(r"[a-z0-9]+", s) if len(t) > 2 and t not in _STOP and not t.isdigit()}


def names_agree(a, b):
    """Some shared distinctive word, or one name inside the other."""
    ta, tb = tokens(a), tokens(b)
    if ta and tb and (ta & tb):
        return True
    na = "".join(sorted(ta)) if ta else ""
    nb = "".join(sorted(tb)) if tb else ""
    return bool(na and nb and (na in nb or nb in na))


def klass(value):
    return value if value in CLASS_NUM else None


class Grid:
    """Beaches in 0.02 degree cells: a lookup within a few km without scanning."""

    CELL = 0.02

    def __init__(self, rows):
        self.cells = {}
        for r in rows:
            self.cells.setdefault(self.key(r["lat"], r["lon"]), []).append(r)

    def key(self, lat, lon):
        return (math.floor(lat / self.CELL), math.floor(lon / self.CELL))

    def near(self, lat, lon, radius_km):
        # one cell is about 2.2 km north-south; 1.2 km needs the 3x3 block, 3 km the 5x5
        reach = 1 + int(radius_km // 2.0)
        ky, kx = self.key(lat, lon)
        for dy in range(-reach, reach + 1):
            for dx in range(-reach, reach + 1):
                for r in self.cells.get((ky + dy, kx + dx), ()):
                    d = km(lat, lon, r["lat"], r["lon"])
                    if d <= radius_km:
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


def register_refs(sites, inland=False):
    """Sea sites by default. Lake and river sites belong to the lakes layer
    (ROADMAP D23 Lakes row); `inland=True` brings them back for a full run."""
    out = []
    for s in sites:
        if not inland and s.get("type") in INLAND:
            continue
        if s.get("lat") is None or s.get("lon") is None or not s.get("bwid"):
            continue
        out.append({
            "id": s["bwid"], "countries": [iso2(s.get("iso2"))], "name": s.get("name") or "",
            "lat": float(s["lat"]), "lon": float(s["lon"]), "type": s.get("type"),
            "q": klass(s.get("q")), "q1": klass(s.get("q1")),
        })
    return out


def references(ctx):
    path = Path(ctx.get("reference") or REGISTER)
    # an unfetched git-lfs pointer is a few bytes: fall back to the committed sample
    if not path.exists() or path.read_bytes()[:40].startswith(b"version https://git-lfs"):
        path = SAMPLE
    ctx["_ref_path"] = path
    return register_refs(load_register(path), bool(ctx.get("inland")))


# ---------------------------------------------------------------------------
# Carta's side
# ---------------------------------------------------------------------------

def load(ctx):
    rows = []
    wire_at = ""
    for f in sorted(glob.glob(str(Path(ctx.get("wire", WIRE_DIR)) / "??.json"))):
        try:
            blob = json.loads(Path(f).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        wire_at = max(wire_at, blob.get("generated_at") or "")
        for bucket in ("beaches", "listed"):
            for b in blob.get(bucket) or []:
                if b.get("lat") is None or b.get("lon") is None:
                    continue
                w = b.get("water") or {}
                rows.append({
                    "id": b["id"], "name": b.get("name") or "", "cc": b.get("cc") or blob.get("country"),
                    "lat": float(b["lat"]), "lon": float(b["lon"]), "rated": bucket == "beaches",
                    "score": b.get("score"), "inland": bool(b.get("inland")),
                    "class": klass(w.get("class")), "site": w.get("site") or "",
                    "src": list(b.get("src") or []),
                })
    return {"rows": rows, "grid": Grid(rows), "wire_at": wire_at}


def best_match(ref, grid):
    """The nearest Carta beach that is the same place, with how it was matched."""
    best = None
    for row, d in grid.near(ref["lat"], ref["lon"], MATCH_KM):
        named = names_agree(ref["name"], row["name"]) or (row["site"] and names_agree(ref["name"], row["site"]))
        if not named and d > SAME_PLACE_KM:
            continue
        key = (0 if named else 1, d)
        if best is None or key < best[0]:
            best = (key, row, d, "name" if named else "place")
    return best


def swim_facts(ref, row):
    """(facts, rank, error, note) for a matched site."""
    facts = {"class": None, "poor": None, "water": None}
    carta, ref_c = row["class"], ref["q"]
    note = None
    if ref_c and carta:
        facts["class"] = carta == ref_c
        if carta != ref_c and ref.get("q1") == carta:
            note = "stale_one_season"
    if ref_c == "Poor":
        facts["poor"] = carta in (None, "Poor")
    if ref.get("type"):
        facts["water"] = (ref["type"] in INLAND) == row["inland"]
    rank = (CLASS_NUM[ref_c], row["score"]) if ref_c and row["score"] is not None else None
    error = (float(CLASS_NUM[ref_c]), float(CLASS_NUM[carta])) if ref_c and carta else None
    return facts, rank, error, note


def match(refs, carta):
    out = []
    for ref in refs:
        hit = best_match(ref, carta["grid"])
        near = any(True for _ in carta["grid"].near(ref["lat"], ref["lon"], NEAR_KM))
        flags = {"matched": hit is not None, "near": hit is not None or near,
                 "in_rated": None, "open": None}
        facts, rank, err, note = {"class": None, "poor": None, "water": None}, None, None, None
        mrow = None
        if hit:
            mrow = hit[1]
            facts, rank, err, note = swim_facts(ref, mrow)
            flags["in_rated"] = bool(mrow["rated"])
            flags["open"] = "eea" not in mrow["src"]
        out.append({
            "id": ref["id"], "country": ref["countries"][0], "flags": flags, "facts": facts,
            "rank": rank, "error": err, "note": note,
            "_ref": ref, "_row": mrow, "_how": hit[3] if hit else None, "_km": hit[2] if hit else None,
        })
    return out


# ---------------------------------------------------------------------------
# Gaps: the largest to review by hand
# ---------------------------------------------------------------------------

def gap_size(r):
    """Bigger is worse. A missing site counts by its class (a clean, designated
    beach not published is the biggest gap); a class mismatch by its step."""
    ref, row = r["_ref"], r["_row"]
    cls = CLASS_NUM.get(ref["q"], 2)
    if row is None:
        # no beach within NEAR_KM at all is a hole; a near miss is a naming or dedupe case
        return (4 if not r["flags"]["near"] else 1) + cls
    if r["facts"].get("class") is False:
        step = abs(CLASS_NUM[ref["q"]] - CLASS_NUM[row["class"]])
        return 1 + step if r["note"] != "stale_one_season" else 0.5 * step
    if r["facts"].get("poor") is False:
        return 4
    return 0


def cause(r):
    """Why a gap exists, from the data alone (the reviewer adds the verdict)."""
    ref, row = r["_ref"], r["_row"]
    if row is None:
        if r["flags"]["near"]:
            return "near_miss_name_or_dedupe"
        if not tokens(ref["name"]):
            return "registry_name_is_code_or_place"
        return "not_published_cap_or_gate"
    if r["note"] == "stale_one_season":
        return "register_moved_one_season"
    if r["facts"].get("class") is False:
        return "nearest_site_class_joined" if row["site"] else "class_differs"
    return "poor_not_flagged"


def gaps(results, missing=20, wrong=10, per_country=3):
    """The 20 largest coverage gaps and the 10 largest class gaps, at most
    `per_country` of each so one country does not fill the list; ties break on
    a stable hash, not the alphabet."""
    import hashlib

    def tie(r):
        return hashlib.sha256(("gaps" + r["id"]).encode()).hexdigest()

    ranked = sorted(((gap_size(r), r) for r in results if gap_size(r) > 0),
                    key=lambda t: (-t[0], tie(t[1])))
    pick = []
    for want, test in ((missing, lambda r: r["_row"] is None), (wrong, lambda r: r["_row"] is not None)):
        seen = {}
        part = []
        for size, r in ranked:
            if not test(r) or seen.get(r["country"], 0) >= per_country:
                continue
            seen[r["country"]] = seen.get(r["country"], 0) + 1
            part.append((size, r))
            if len(part) == want:
                break
        pick += part
    pick.sort(key=lambda t: (-t[0], tie(t[1])))
    return [{"id": r["id"], "name": r["_ref"]["name"], "country": r["country"],
             "type": r["_ref"]["type"], "class": r["_ref"]["q"],
             "status": ("missing" if not r["flags"]["near"] else "near") if r["_row"] is None else "class",
             "lat": r["_ref"]["lat"], "lon": r["_ref"]["lon"], "cause": cause(r),
             "carta": (r["_row"] or {}).get("id"), "carta_class": (r["_row"] or {}).get("class"),
             "carta_site": (r["_row"] or {}).get("site"), "gap": size} for size, r in pick]


def describe(ctx, carta):
    path = ctx.get("_ref_path") or REGISTER
    try:
        path = str(Path(path).resolve().relative_to(ROOT))
    except ValueError:
        path = str(path)
    return {"reference": {"path": path, "source": "EEA WISE bathing water register"},
            "carta": {"wire_generated_at": carta["wire_at"], "rows": len(carta["rows"])}}
