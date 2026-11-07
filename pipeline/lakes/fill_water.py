"""Fill the lake water class and the unknown swim flags (T1186, ROADMAP D24, D7).

Tier: Scheduled (owner run on the box; the join steps are pure and offline)

Two gaps on the lake wire: lakes with no `water` block (no EEA bathing site
matched inside enrich_lakes.join_bathing's radius) and lakes whose swim rule is
`unknown`. This step closes what the evidence allows and nothing else.

Sources, in order of trust (comparison in Execution/P15/T1186-mountains-lakes.md):

    eea       EEA WISE bathing sites (cache/eea_bathing_water.json, written by
              pipeline/harvest_bathing_water.py). Second pass here: a wider
              radius, but only for a site whose name shares a word with the lake
              (or lies within SECOND_PASS_KM when the lake has no usable name).
    national  Optional CSV drops in cache/lakes/national_water/<CC>.csv with
              columns name,lat,lon,class (Excellent/Good/Sufficient/Poor or the
              national word mapped in NATIONAL_CLASS). Same join as EEA, source
              label `national:<CC>`. Used only where EEA gave nothing.
    osm       Overpass tags around the lake (harvest_swim_tags): swimming=no or
              bathing=no gives `no`; leisure=swimming_area, sport=swimming,
              natural=beach, bathing=yes give `yes`.

Safety rules (swim_rule's: never guess a `no` into a `yes`):
  * an existing verdict other than `unknown` is never changed;
  * an EEA site on the lake gives `yes` only when its class is not Poor
    (a Poor site gives `limited`);
  * `no` only from an explicit OSM ban tag, and a ban wins over a `yes` tag
    from the same source;
  * no evidence leaves `unknown`.

Every block written carries `_src` (source id) and `_asof` (ISO date of the
source data or the run). The step writes cache/lakes/water_fill.json and, with
--apply, patches the wire in place (water, swim.rule, swim.src) for rows that
lack them.

    python pipeline/harvest_bathing_water.py --refresh      # network
    python pipeline/lakes/fill_water.py --harvest-osm       # network, paced
    python pipeline/lakes/fill_water.py --apply             # offline join + wire
    python pipeline/lakes/fill_water.py --dry-run           # numbers only
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WIRE = ROOT / "continent-app" / "public" / "lakes"
CACHE = ROOT / "cache" / "lakes"
EEA = ROOT / "cache" / "eea_bathing_water.json"
NATIONAL_DIR = CACHE / "national_water"
SWIM_TAGS = CACHE / "swim_tags.json"
OUT = CACHE / "water_fill.json"

SECOND_PASS_KM = 6.0
MAX_NAMED_KM = 12.0
CLASSES = {"Excellent": 3, "Good": 2, "Sufficient": 1, "Poor": 0}
NATIONAL_CLASS = {
    "excellent": "Excellent", "ausgezeichnet": "Excellent", "excellente": "Excellent",
    "eccellente": "Excellent", "excelente": "Excellent",
    "good": "Good", "gut": "Good", "bonne": "Good", "buona": "Good", "buena": "Good",
    "sufficient": "Sufficient", "ausreichend": "Sufficient", "suffisante": "Sufficient",
    "sufficiente": "Sufficient", "suficiente": "Sufficient",
    "poor": "Poor", "mangelhaft": "Poor", "insuffisante": "Poor",
    "scarsa": "Poor", "insuficiente": "Poor",
}
STOP = {"lake", "lago", "lac", "see", "meer", "jezero", "ezero", "jarvi",
        "sjo", "the", "of", "de", "di", "del", "la", "le", "bad", "strand",
        "badestelle", "plage", "beach", "camping"}
FOLD = str.maketrans({"ø": "o", "æ": "ae", "œ": "oe", "ß": "ss", "ł": "l",
                      "đ": "d", "ð": "d", "þ": "th"})


def fold(text: str) -> str:
    s = unicodedata.normalize("NFKD", (text or "").lower().translate(FOLD))
    return "".join(c for c in s if not unicodedata.combining(c))


def words(text: str) -> set:
    return {w for w in re.findall(r"[a-z0-9]{3,}", fold(text)) if w not in STOP}


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 6371.0088 * 2 * math.asin(math.sqrt(a))


class Grid:
    """0.1 degree grid over point dicts with lat and lon."""

    def __init__(self, points):
        self.cells = {}
        for p in points:
            if p.get("lat") is None or p.get("lon") is None:
                continue
            self.cells.setdefault((int(p["lat"] * 10), int(p["lon"] * 10)), []).append(p)

    def within(self, lat, lon, km):
        span = int(km / 8.0) + 1
        cy, cx = int(lat * 10), int(lon * 10)
        for dy in range(-span, span + 1):
            for dx in range(-span, span + 1):
                for p in self.cells.get((cy + dy, cx + dx), ()):
                    d = haversine_km(lat, lon, p["lat"], p["lon"])
                    if d <= km:
                        yield p, d


def best_class(sites):
    """(site, km) with the best class, nearest on a tie; None for no sites."""
    sites = [s for s in sites if s[0].get("q") in CLASSES]
    if not sites:
        return None
    return max(sites, key=lambda s: (CLASSES[s[0]["q"]], -s[1]))


def load_national(directory: Path = NATIONAL_DIR) -> list:
    """Rows from cache/lakes/national_water/<CC>.csv, class words mapped."""
    out = []
    if not directory.is_dir():
        return out
    for path in sorted(directory.glob("*.csv")):
        cc = path.stem.upper()
        with path.open(encoding="utf-8-sig", newline="") as fh:
            for r in csv.DictReader(fh):
                q = NATIONAL_CLASS.get(fold(r.get("class") or "").strip())
                try:
                    lat, lon = float(r["lat"]), float(r["lon"])
                except (KeyError, TypeError, ValueError):
                    continue
                if q:
                    out.append({"name": r.get("name") or "", "lat": lat, "lon": lon,
                                "q": q, "type": "Lake", "cc": cc})
    return out


def radius_km(lake: dict) -> float:
    area = lake.get("area_km2") or 0.0
    return 1.5 if area <= 0 else max(1.0, min(18.0, math.sqrt(area / math.pi) * 1.35))


def match_water(lake: dict, grid: Grid, src: str, asof: str):
    """A water block from the second pass, or None.

    The first pass (enrich_lakes.join_bathing) already took every inland site
    within max(2.5, radius + 1.5) km. This pass reaches further, so it asks
    for a shared name word; a lake with no usable name falls back to
    SECOND_PASS_KM, which stays inside one valley."""
    lat, lon = lake["lat"], lake["lon"]
    lw = words(lake.get("name"))
    reach = max(SECOND_PASS_KM, radius_km(lake) + 1.5)
    cands = []
    for p, km in grid.within(lat, lon, min(MAX_NAMED_KM, reach * 2)):
        if p.get("type") not in (None, "Lake", "River"):
            continue
        if lw:
            if not (lw & words(p.get("name"))):
                continue
        elif km > SECOND_PASS_KM:
            continue
        cands.append((p, km))
    near = [c for c in cands if c[1] <= MAX_NAMED_KM]
    pick = best_class(near)
    if not pick:
        return None
    site, km = pick
    return {"class": site["q"], "class_prev": site.get("q3") or "",
            "site": site.get("name") or "", "type": site.get("type") or "Lake",
            "km": round(km, 2), "sites": len(near),
            "_src": src, "_asof": asof}


def swim_from_tags(tags: dict, water: dict | None, asof: str):
    """(rule, src) or None. `tags` is the summary from classify_swim_tags."""
    if tags and tags.get("ban"):
        return {"rule": "no", "src": "osm", "_asof": asof}
    if water and water.get("class"):
        rule = "limited" if water["class"] == "Poor" else "yes"
        return {"rule": rule, "src": "eea" if water["_src"] == "eea" else "national",
                "_asof": asof}
    if tags and tags.get("place"):
        return {"rule": "yes", "src": "osm", "_asof": asof}
    return None


# ---- OSM swim tags --------------------------------------------------------

def swim_query(lat: float, lon: float, r_m: int) -> str:
    return ("[out:json][timeout:60];(\n"
            f'nwr(around:{r_m},{lat},{lon})["leisure"="swimming_area"];\n'
            f'nwr(around:{r_m},{lat},{lon})["natural"="beach"];\n'
            f'nwr(around:{r_m},{lat},{lon})["sport"="swimming"];\n'
            f'nwr(around:{r_m},{lat},{lon})["swimming"~"^(no|yes)$"];\n'
            f'nwr(around:{r_m},{lat},{lon})["bathing"~"^(no|yes)$"];\n'
            ");out tags center 40;")


def classify_swim_tags(elements: list) -> dict:
    """{'ban': n, 'place': n} from Overpass elements. Counts, no guesses."""
    ban = place = 0
    for e in elements:
        t = e.get("tags") or {}
        if t.get("swimming") == "no" or t.get("bathing") == "no":
            ban += 1
        elif (t.get("swimming") == "yes" or t.get("bathing") == "yes"
              or t.get("leisure") == "swimming_area" or t.get("sport") == "swimming"
              or t.get("natural") == "beach"):
            place += 1
    return {"ban": ban, "place": place}


def harvest_osm(lakes: list, refresh: bool = False) -> dict:
    """Paced Overpass sweep for the lakes still unknown. Network; owner run."""
    sys.path.insert(0, str(ROOT / "pipeline" / "lakes"))
    import water_sources as ws
    cache = json.loads(SWIM_TAGS.read_text(encoding="utf-8")) if SWIM_TAGS.exists() else {}
    for i, lake in enumerate(lakes, 1):
        if lake["id"] in cache and not refresh:
            continue
        r_m = int(min(2500, max(400, radius_km(lake) * 1000)))
        els = ws.overpass(swim_query(lake["lat"], lake["lon"], r_m))
        cache[lake["id"]] = {**classify_swim_tags(els), "_asof": datetime.now(timezone.utc).date().isoformat()}
        if i % 25 == 0:
            SWIM_TAGS.parent.mkdir(parents=True, exist_ok=True)
            SWIM_TAGS.write_text(json.dumps(cache), encoding="utf-8")
            print(f"  {i}/{len(lakes)} swept")
    SWIM_TAGS.parent.mkdir(parents=True, exist_ok=True)
    SWIM_TAGS.write_text(json.dumps(cache), encoding="utf-8")
    return cache


# ---- wire -----------------------------------------------------------------

def wire_files(wire: Path):
    return [p for p in sorted(wire.glob("*.json"))
            if len(p.stem) == 2]


def rows_of(doc: dict):
    for key in ("lakes", "listed"):
        yield from doc.get(key) or []


def fill(wire: Path = WIRE, eea_rows=None, national_rows=None, tags=None,
         asof: str | None = None) -> tuple:
    """Return (fills, stats). fills: {lake id: {water?, swim?}}. Pure."""
    asof = asof or datetime.now(timezone.utc).date().isoformat()
    eea = Grid(eea_rows or [])
    nat = Grid(national_rows or [])
    tags = tags or {}
    fills, stats = {}, {"rows": 0, "water_before": 0, "water_after": 0,
                        "unknown_before": 0, "unknown_after": 0}
    for path in wire_files(wire):
        doc = json.loads(path.read_text(encoding="utf-8"))
        for lake in rows_of(doc):
            stats["rows"] += 1
            has_water = bool(lake.get("water"))
            rule = (lake.get("swim") or {}).get("rule")
            stats["water_before"] += has_water
            stats["unknown_before"] += rule == "unknown"
            f = {}
            water = lake.get("water")
            if not has_water:
                water = (match_water(lake, eea, "eea", asof)
                         or match_water(lake, nat, "national:" + path.stem, asof))
                if water:
                    f["water"] = water
            if rule == "unknown":
                v = swim_from_tags(tags.get(lake["id"]), water, asof)
                if v:
                    f["swim"] = v
            stats["water_after"] += bool(water)
            stats["unknown_after"] += (rule == "unknown" and "swim" not in f)
            if f:
                fills[lake["id"]] = f
    return fills, stats


def apply(fills: dict, wire: Path = WIRE) -> int:
    n = 0
    for path in wire_files(wire) + [wire / "top.json"]:
        if not path.exists():
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        changed = False
        rows = list(rows_of(doc)) if path.stem != "top" else list(doc.get("lakes") or [])
        for lake in rows:
            f = fills.get(lake.get("id"))
            if not f:
                continue
            if "water" in f and not lake.get("water"):
                lake["water"] = f["water"]
                changed = True
            if "swim" in f and (lake.get("swim") or {}).get("rule") == "unknown":
                lake["swim"]["rule"] = f["swim"]["rule"]
                lake["swim"]["src"] = f["swim"]["src"]
                lake["swim"]["_asof"] = f["swim"]["_asof"]
                changed = True
            n += changed
        if changed:
            path.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")),
                            encoding="utf-8")
    return n


def load_json_list(path: Path) -> list:
    """A JSON list, or [] when the file is absent or a git LFS pointer."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return data if isinstance(data, list) else []


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--wire", default=str(WIRE))
    ap.add_argument("--harvest-osm", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    wire = Path(a.wire)
    eea = load_json_list(EEA)
    if a.harvest_osm:
        unknown = [r for p in wire_files(wire)
                   for r in rows_of(json.loads(p.read_text(encoding="utf-8")))
                   if (r.get("swim") or {}).get("rule") == "unknown"]
        harvest_osm(unknown)
    tags = json.loads(SWIM_TAGS.read_text(encoding="utf-8")) if SWIM_TAGS.exists() else {}
    fills, st = fill(wire, eea, load_national(), tags)
    print(json.dumps(st))
    if not a.dry_run:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(fills, ensure_ascii=False), encoding="utf-8")
        if a.apply:
            print("patched", apply(fills, wire), "file rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
