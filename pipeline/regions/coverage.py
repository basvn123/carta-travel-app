"""The coverage audit: status per region per layer, and the backlog.

Tier: Scheduled (run_pipeline task regions)

Runs after every layer build and as its own command:

    python pipeline/regions/coverage.py
    python pipeline/regions/coverage.py --layers beach,lake
    python pipeline/regions/coverage.py --explain wd:Q152245

Four outputs:

  continent-app/public/coverage.json
      the wire: per NUTS3 sized region, per layer, published counts against
      quota and floor, status ok | thin | empty | na, and a reason code
      beside every status that is not ok. The app reads this to decide
      whether to widen a search rung before it renders. Since T111 it also
      carries `contract`: per country per layer, published against the
      country floor, pass | fail | n/a, and the reason code for a miss.

  reports/coverage_contract.json
      the contract with its receipts: for every failing country cell, the
      named rows the floor is made of (the famous walks above the fame
      threshold, the EEA coastal bathing waters, the lakes clearing a hard
      anchor, the ultras, highpoints and lift-served summits) that are not
      published, each with its code and the number the gate saw. Plus the
      per region rules: NUTS3 top three walks, coastal NUTS3 at least five,
      GMBA range top three, lakes per 50 km cell. `--strict` exits 1 when a
      cell is blank, which is the one thing the contract forbids.

  reports/coverage_backlog_{layer}_{date}.csv
      the part that earns its keep: every deficit region joined to the
      SPECIFIC candidates the gate rejected and why. The reasons are not
      guessed: this module imports each layer's own export module and
      replays its gate over the same caches, so "score_4.9_below_5.4" is
      the number the gate saw. That converts "Great Britain has 8 lakes"
      from a mystery into a work queue.

  reports/coverage.html
      the admin read: per layer counts, a dot map coloured by status, the
      top 50 worst regions, sortable.

Status meanings: `thin` is below quota, `empty` is below floor, `na` is a
region the layer does not apply to (Flanders is not failing at mountains),
with the reason attached.

Trails are counted but not examined: their publication path is human
approval in the lab, so the backlog lists the deficit without pretending
the gate rejected anyone. The trails brief owns that examiner.

ASCII clean, no em dashes, per project convention.
"""

import argparse
import csv
import importlib.util
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "pipeline"))

from pipeline_io import atomic_write_json, load_json  # noqa: E402
import quotas  # noqa: E402

# Where the audit READS (caches, data/, the layer wires) and where it
# WRITES (coverage.json, reports/). Both default to this checkout, which is
# what run_pipeline.py gets. A sparse worktree that holds the code but not
# the data points CARTA_DATA_ROOT at the main checkout and CARTA_OUT_ROOT at
# a scratch folder, so a code change can be audited against real data
# without writing a byte into the checkout that owns it.
DATA_ROOT = Path(os.environ.get("CARTA_DATA_ROOT") or ROOT).resolve()
OUT_ROOT = Path(os.environ.get("CARTA_OUT_ROOT") or ROOT).resolve()
if DATA_ROOT != ROOT:
    quotas.OPPORTUNITY = DATA_ROOT / "cache" / "regions" / "opportunity.json"

WIRE = DATA_ROOT / "continent-app" / "public"
WIRE_OUT = OUT_ROOT / "continent-app" / "public"
REPORTS = OUT_ROOT / "reports"
COVERAGE_VERSION = "coverage_v1"

LAYER_WIRES = {
    "beach": ("beaches", "beaches"),
    "lake": ("lakes", "lakes"),
    "mountain": ("mountains", "mountains"),
    "trail": ("trails", "trips"),
    "cycling": ("cycling", "routes"),
}


def log(msg):
    print(f"[regions] {msg}")


def _load_export(layer_dir, module_name):
    """One layer's export module, loaded by path under a neutral name so
    its sibling imports resolve to its own folder."""
    # From DATA_ROOT, not ROOT: the layer module finds its caches relative
    # to its own file, so it must live beside the data it replays.
    path = DATA_ROOT / "pipeline" / layer_dir / f"{module_name}.py"
    spec = importlib.util.spec_from_file_location(f"carta_cov_{layer_dir}", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[f"carta_cov_{layer_dir}"] = mod
    old = list(sys.path)
    sys.path.insert(0, str(path.parent))
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.path[:] = old
    return mod


def _published_rows(layer):
    """Every published row of one layer, rated and listed, with a position.

    Both arrays, every layer. Each country file keeps its unscored rows in
    a separate `listed` key so a screen has to opt into them, and an audit
    that read only the main array would report a region the floor fill just
    rescued as still empty. Trails carried a hardcoded tier here for one
    build, from when that layer had none; it ships `t` and its own `listed`
    array now, like the other three."""
    folder, key = LAYER_WIRES[layer]
    rows = []
    for path in sorted((WIRE / folder).glob("[A-Z][A-Z].json")):
        data = load_json(path) or {}
        for row in list(data.get(key) or []) + list(data.get("listed") or []):
            if layer in ("trail", "cycling"):
                # A route has no single coordinate, so the bbox centre
                # stands in. Its own rg is what actually places it; this is
                # only the fallback for a row stamped before regionize.py.
                bbox = row.get("bbox") or [None] * 4
                lat = (bbox[1] + bbox[3]) / 2 if bbox[0] is not None else None
                lon = (bbox[0] + bbox[2]) / 2 if bbox[0] is not None else None
            else:
                lat, lon = row.get("lat"), row.get("lon")
            rows.append({"id": str(row.get("id")), "name": row.get("name"),
                         "cc": path.stem, "wd": row.get("wd") or "",
                         "osm": row.get("osm"), "net": row.get("net"),
                         "lat": lat, "lon": lon,
                         "tier": row.get("t") or "r", "rg": row.get("rg")})
    return rows


def _n3_of(rows):
    """rg from the wire when the row carries it, assignment otherwise."""
    need = [(i, r["lat"], r["lon"]) for i, r in enumerate(rows)
            if not (r.get("rg") or {}).get("n3")
            and r.get("lat") is not None and r.get("lon") is not None]
    out = [(r.get("rg") or {}).get("n3") for r in rows]
    if need:
        import geopandas as gpd
        admin3 = _admin3()
        pts = gpd.GeoDataFrame(
            {"i": [i for i, _, _ in need]},
            geometry=gpd.points_from_xy([lo for _, _, lo in need],
                                        [la for _, la, _ in need]),
            crs="EPSG:4326")
        hit = gpd.sjoin(pts, admin3[["id", "geometry"]], how="left",
                        predicate="within")
        hit = hit[~hit.index.duplicated(keep="first")]
        for idx, row in hit.iterrows():
            got = row.get("id_right") if "id_right" in hit.columns else row.get("id")
            if isinstance(got, str):
                out[int(row["i"])] = got
    if need:
        # The sea snap for the stragglers (beach centroids offshore).
        import geopandas as gpd
        admin3 = _admin3()
        missing = [(i, la, lo) for (i, la, lo) in need if out[i] is None]
        if missing:
            pts = gpd.GeoDataFrame(
                {"i": [i for i, _, _ in missing]},
                geometry=gpd.points_from_xy([lo for _, _, lo in missing],
                                            [la for _, la, _ in missing]),
                crs="EPSG:4326")
            near = gpd.sjoin_nearest(pts, admin3[["id", "geometry"]],
                                     how="left", max_distance=5.0 / 111.32)
            near = near[~near.index.duplicated(keep="first")]
            for _, row in near.iterrows():
                got = row.get("id_right") if "id_right" in near.columns else None
                if isinstance(got, str):
                    out[int(row["i"])] = got
    return out


_admin3_cache = None


def _admin3():
    global _admin3_cache
    if _admin3_cache is None:
        import geopandas as gpd
        gdf = gpd.read_file(DATA_ROOT / "cache" / "regions" / "regions.gpkg",
                            layer="admin")
        _admin3_cache = gdf[gdf["level"] == 3].reset_index(drop=True)
    return _admin3_cache


# ---------------------------------------------------------------------------
# Gate replay examiners. Each returns, per country, a list of candidate
# verdicts: (cache_row, candidate_id, name, lat, lon, verdict, detail).
# verdict "published" or the first gate that killed the row.
# ---------------------------------------------------------------------------

def _examine_beaches():
    mod = _load_export("beaches", "export_beaches")
    countries = mod.COUNTRIES if hasattr(mod, "COUNTRIES") else None
    if countries is None:
        countries = sorted({p.stem.split("_")[1]
                            for p in (DATA_ROOT / "cache" / "beaches").glob("rich_??.json")})
    gate = _gate_of(mod, "beaches")
    gmax = 1.0
    for cc in countries:
        rich = mod.load_cache("rich", cc) or {}
        for beach in rich.get("beaches") or []:
            gmax = max(gmax, mod.bi.fame_raw(beach))
    _prime_globals(mod, gmax)
    verdicts = {}
    for cc in countries:
        scored = mod.score_country(cc)
        rows = []
        pool = []
        for beach, comps, score10 in sorted(scored, key=lambda t: -t[2]):
            cand = (beach, beach.get("key") or beach.get("wd") or beach.get("name"),
                    beach.get("name"), beach.get("lat"), beach.get("lon"))
            if score10 < mod.MIN_SCORE:
                pool.append(cand + ("score_gate",
                                    f"score_{score10:.1f}_below_{mod.MIN_SCORE}"))
                continue
            if not gate(beach, cc):
                images = mod.usable_images(beach)
                strong = sum(1 for i in images
                             if i.get("evidence") in mod.STRONG_EVIDENCE)
                pool.append(cand + ("photo_gate",
                                    f"imgs_{len(images)}_strong_{strong}"))
                continue
            if not mod.bi.reasons_for(beach, comps):
                pool.append(cand + ("reason_gate", "no_reasons"))
                continue
            rows.append(cand)
        published = rows[:mod.PUBLISH_MAX]
        capped = rows[mod.PUBLISH_MAX:]
        out = [c + ("published", "") for c in published]
        out += [c + ("country_cap", f"rank_{mod.PUBLISH_MAX + i + 1}")
                for i, c in enumerate(capped)]
        out += pool
        verdicts[cc] = out
    return verdicts


def _gate_of(mod, layer_dir):
    """A callable (item, cc) -> bool for one layer's non score gate.

    This module reaches into a sibling layer's own gate on purpose: the
    backlog's whole value is that "score_4.9_below_5.4" is the number that
    layer's code actually saw, not a number this file re-derived. The cost
    is that a rename over there breaks the join here, which is exactly what
    happened when the photo engine split the mountain gate into eligible()
    plus photo_gate(). So the spelling is probed rather than assumed, and
    an unknown shape degrades to "no candidates" with a message rather
    than to a wrong reason."""
    if hasattr(mod, "publishable"):
        def gate(item, cc):
            try:
                return bool(mod.publishable(item, cc))
            except TypeError:
                return bool(mod.publishable(item))
        return gate
    if hasattr(mod, "eligible") and hasattr(mod, "photo_gate"):
        def gate(item, cc):
            try:
                ok = bool(mod.eligible(item, cc))
            except TypeError:
                ok = bool(mod.eligible(item))
            return ok and bool(mod.photo_gate(mod.wire_images(item)))
        return gate
    raise AttributeError(
        f"{layer_dir}: no gate found (looked for publishable, "
        f"or eligible plus photo_gate). Update _gate_of in coverage.py "
        f"to match the layer's current gate.")


def _prime_globals(mod, gmax):
    """Set the module level ceilings a layer's main() would have set.

    score_country() reads them, and calling it without main() leaves them
    undefined: the lake layer's PHOTO_GLOBAL_MAX arrived this way and took
    the lake backlog's candidates with it. Only names the module already
    declares are set, so this cannot invent state a layer does not have."""
    for name in ("GLOBAL_MAX", "PHOTO_GLOBAL_MAX"):
        if hasattr(mod, name) or name in getattr(mod, "__dict__", {}):
            setattr(mod, name, gmax if name == "GLOBAL_MAX" else 1.0)
        else:
            # Declared only inside main() via `global`, so it is not an
            # attribute yet. Setting it is still correct and still safe.
            setattr(mod, name, gmax if name == "GLOBAL_MAX" else 1.0)


def _examine_scored(layer_dir, export_name, rows_key, score_country_takes_max):
    """Lakes and mountains share one shape: fame ceiling over the whole
    field, then score_country, then the photo and reason gates."""
    mod = _load_export(layer_dir, export_name)
    model = mod.li if hasattr(mod, "li") else mod.pi
    gate = _gate_of(mod, layer_dir)
    countries = sorted({p.stem.split("_")[1]
                        for p in (DATA_ROOT / "cache" / layer_dir).glob("rich_??.json")})
    gmax = 1.0
    for cc in countries:
        rich = mod.load_cache("rich", cc) or {}
        for item in rich.get(rows_key) or []:
            gmax = max(gmax, model.fame_raw(item))
    _prime_globals(mod, gmax)
    verdicts = {}
    for cc in countries:
        if score_country_takes_max:
            scored = mod.score_country(cc, gmax)
        else:
            scored = mod.score_country(cc)
        rows, pool = [], []
        for item, comps, score10 in sorted(scored, key=lambda t: -t[2]):
            cand = (item, item.get("key") or item.get("wd") or item.get("name"),
                    item.get("name"), item.get("lat"), item.get("lon"))
            if not gate(item, cc):
                images = item.get("images") or []
                pool.append(cand + ("photo_gate", f"imgs_{len(images)}"))
                continue
            if not model.reasons_for(item, comps):
                pool.append(cand + ("reason_gate", "no_reasons"))
                continue
            if score10 < mod.MIN_SCORE:
                floor_min = getattr(mod, "FLOOR_MIN_SCORE", None)
                word = ("floor_pool" if floor_min is not None
                        and score10 >= floor_min else "score_gate")
                pool.append(cand + (word,
                                    f"score_{score10:.1f}_below_{mod.MIN_SCORE}"))
                continue
            rows.append(cand)
        published = rows[:mod.PUBLISH_MAX]
        capped = rows[mod.PUBLISH_MAX:]
        out = [c + ("published", "") for c in published]
        out += [c + ("country_cap", f"rank_{mod.PUBLISH_MAX + i + 1}")
                for i, c in enumerate(capped)]
        out += pool
        verdicts[cc] = out
    return verdicts


def scored_examiners(layers):
    examiners = {}
    if "beach" in layers:
        examiners["beach"] = _examine_beaches
    if "lake" in layers:
        examiners["lake"] = lambda: _examine_scored("lakes", "export_lakes",
                                                    "lakes", False)
    if "mountain" in layers:
        examiners["mountain"] = lambda: _examine_scored("mountains",
                                                        "export_peaks",
                                                        "peaks", True)
    return examiners


# ---------------------------------------------------------------------------
# The audit
# ---------------------------------------------------------------------------

def audit(layers, explain=None):
    """The region audit. Returns (regions, ctx): the per region status the
    wire carries, and the working state the country contract reads so the
    gate replay runs once per layer rather than twice."""
    admin3 = _admin3()
    names = dict(zip(admin3["id"], admin3["name"]))
    countries_of = dict(zip(admin3["id"], admin3["country"]))
    regions = defaultdict(dict)
    ctx = {"rows": {}, "by_region": {}, "verdicts": {}, "rejected": {}}

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    REPORTS.mkdir(exist_ok=True)

    for layer in layers:
        rows = _published_rows(layer)
        assigned = _n3_of(rows)
        by_region = defaultdict(lambda: {"r": 0, "l": 0})
        for row, n3 in zip(rows, assigned):
            row["n3"] = n3
            if n3 is None:
                continue
            tier = "l" if row.get("tier") == "l" else "r"
            by_region[n3][tier] += 1
        ctx["rows"][layer] = rows
        ctx["by_region"][layer] = by_region

        deficits = {}
        for rid in admin3["id"]:
            if not quotas.applicable(rid, layer):
                regions[rid][layer] = {
                    "status": "na", "why": quotas.why_not_applicable(rid, layer)}
                continue
            quota = quotas.published_target(rid, layer)
            fl = quotas.floor(rid, layer)
            got = by_region.get(rid, {"r": 0, "l": 0})
            total = got["r"] + got["l"]
            if total < fl:
                status = "empty"
            elif got["r"] < quota:
                status = "thin"
            else:
                status = "ok"
            regions[rid][layer] = {"r": got["r"], "l": got["l"],
                                   "quota": quota, "floor": fl,
                                   "status": status}
            if status in ("empty", "thin"):
                deficits[rid] = quota - got["r"]

        examiner = scored_examiners(layers).get(layer)
        verdicts = {}
        if examiner is not None:
            try:
                verdicts = examiner()
            except Exception as exc:
                log(f"{layer}: examiner unavailable ({type(exc).__name__}: "
                    f"{exc}), backlog ships without candidates")
        rejected = _place_rejected(layer, verdicts, explain)
        ctx["verdicts"][layer] = verdicts
        ctx["rejected"][layer] = rejected

        backlog_path = REPORTS / f"coverage_backlog_{layer}_{stamp}.csv"
        _write_backlog(layer, backlog_path, deficits, names, countries_of,
                       rejected)
        log(f"{layer}: {len(deficits)} regions under quota, "
            f"backlog {backlog_path.name}")

    return regions, ctx


def _place_rejected(layer, verdicts, explain=None):
    """The gate's rejections keyed by the NUTS3 region they fell in, which
    is what both the backlog CSV and the per region reason code read."""
    rejected = defaultdict(list)
    if verdicts:
        flat = [v for vs in verdicts.values() for v in vs]
        lat = [v[3] for v in flat]
        lon = [v[4] for v in flat]
        fake = [{"lat": la, "lon": lo, "rg": None} for la, lo in zip(lat, lon)]
        placed = _n3_of(fake)
        for v, n3 in zip(flat, placed):
            if n3 is not None and v[5] != "published":
                rejected[n3].append(v)
        if explain:
            for v in flat:
                if str(v[1]) == explain:
                    print(f"\n--- {explain} ({layer}) ---")
                    print(f"name: {v[2]}  at {v[3]},{v[4]}")
                    print(f"verdict: {v[5]}  detail: {v[6]}")
                    print(json.dumps(v[0], ensure_ascii=False, indent=1)[:4000])
    return rejected


def _write_backlog(layer, path, deficits, names, countries_of, rejected):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["country", "nuts3", "region_name", "layer", "published",
                    "quota", "deficit", "candidate_id", "candidate_name",
                    "rejected_by", "rejected_detail"])
        for rid, deficit in sorted(deficits.items(), key=lambda kv: -kv[1]):
            cands = sorted(rejected.get(rid, []),
                           key=lambda v: 0 if v[5] == "country_cap" else 1)
            base = [countries_of.get(rid, ""), rid, names.get(rid, ""), layer,
                    "", quotas.published_target(rid, layer), deficit]
            if not cands:
                w.writerow(base + ["", "", "", ""])
            for v in cands[:max(3, deficit)]:
                w.writerow(base + [v[1], v[2], v[5], v[6]])


# ---------------------------------------------------------------------------
# The coverage contract (carta-destinations-enhancement-spec 0.4)
#
#   For every one of the countries and every one of the five sections, Carta
#   either publishes at least the country floor, or prints a reason code
#   saying why it cannot.
#
# The region audit above answers "is this NUTS3 region thin". The contract
# answers the product question one level up: is this COUNTRY covered in this
# SECTION, and if not, what is the stated reason. A floor is two things at
# once: a minimum count, and a named list of rows the country is embarrassed
# to be missing (every ultra, every EEA coastal bathing water, every registry
# walk above the fame threshold). The count alone is a vacuous gate (Germany
# publishes 4,674 walks and could still be missing all 237 famous ones), so a
# cell fails when EITHER the count is short OR a named row is unpublished,
# and every unpublished named row carries its own code.
#
# The codes are the spec's seven and nothing else. A country the layer has
# never harvested gets no_open_data with a detail saying the harvest has not
# run, because a detail is honest and an eighth code would be a hiding place.
# ---------------------------------------------------------------------------

CONTRACT_VERSION = "coverage_contract_v1"

# The 44 countries every layer harvest lists, plus Turkey, which the trails
# layer curates and the spec names as the biggest hole. The spec says 47;
# the two it does not name are an open item in the T111 report, not a guess.
COUNTRIES = [
    "AD", "AL", "AT", "BA", "BE", "BG", "CH", "CY", "CZ", "DE", "DK", "EE",
    "ES", "FI", "FO", "FR", "GB", "GR", "HR", "HU", "IE", "IS", "IT", "LI",
    "LT", "LU", "LV", "MC", "MD", "ME", "MK", "MT", "NL", "NO", "PL", "PT",
    "RO", "RS", "SE", "SI", "SK", "SM", "TR", "UA", "XK",
]

REASON_CODES = ("no_open_data", "way_only_not_derived", "failed_continuity",
                "below_quota", "not_applicable", "licence_blocked",
                "pending_partnership")

# The spec's table, verbatim: the minimum count per country, and the named
# set the floor is really made of.
COUNTRY_FLOOR_MIN = {"trail": 12, "cycling": 8, "beach": 10, "lake": 15,
                     "mountain": 10}
TRAIL_FAME_THRESHOLD = 0.4     # fame_score is normalised within country
TRAIL_REGION_TOP = 3           # every NUTS3 publishes its top 3 registry rows
COASTAL_REGION_MIN = 5         # every coastal NUTS3 publishes at least 5
ULTRA_PROM_M = 1500            # an ultra: prominence 1,500 m or more
RANGE_PEAK_M = 1000            # a GMBA range with a peak this high ...
RANGE_TOP = 3                  # ... publishes its 3 highest
LAKE_CELL_KM = 50              # max 3 lakes per 50 km cell
LAKE_CELL_MAX = 3
SUMMIT_LIFT_KINDS = ("cableCar", "gondola", "chairlift", "funicular",
                     "rackRailway")
EEA_SITE_MATCH_KM = 1.0        # a published beach this near an EEA site is it
EEA_LAKE_SITE_KM = 2.0         # an EEA lake site this near a lake anchors it
LAKE_ANCHOR_AREA_KM2 = 5.0
LAKE_ANCHOR_SITELINKS = 2

# Spec 1.6: "not applicable" is the correct answer for a microstate that
# cannot hold twelve walks. Area in km2, the fact the detail prints.
MICROSTATES = {"MC": 2, "SM": 61, "LI": 160}

# Stated facts from spec part 1, applied only when the cell fails anyway.
# These override the derived code because the derived code can only say
# "nothing harvested", and the spec knows why.
KNOWN_GAPS = {
    ("TR", "trail"): (
        "pending_partnership",
        "Culture Routes Society holds the Lycian Way, St Paul Trail, "
        "Phrygian Way and Carian Trail tracks under all rights reserved; "
        "one partnership email (spec 1.5)"),
    ("TR", "beach"): (
        "no_open_data",
        "Turkey is outside the EEA bathing water register and no beach "
        "harvest has run for it"),
    ("UA", "trail"): (
        "below_quota",
        "Ukraine is outside the trails ingest scope; OSM coverage of the "
        "Carpathians is reasonable, so this is a config change, not a data "
        "gap (spec 1.5)"),
}

# The trails coverage report's codes, mapped onto the contract's seven.
TRAIL_REASON = {
    "no_osm_data": "no_open_data",
    "way_only_not_derived": "way_only_not_derived",
    "failed_continuity": "failed_continuity",
    "below_quota": "below_quota",
    "unresolved_seed": "no_open_data",
    "out_of_scope": "not_applicable",
    "unplaced": "below_quota",
    "composed": "below_quota",
}

TRAILS_COVERAGE = DATA_ROOT / "data" / "reports" / "trails_coverage.json"
FAMOUS_REGISTRY = DATA_ROOT / "data" / "trails" / "famous_registry.json"
EEA_BATHING = DATA_ROOT / "cache" / "eea_bathing_water.json"
COAST_KM_BY_N3 = DATA_ROOT / "cache" / "regions" / "coast_km_by_n3.json"

# EEA and NUTS spell two countries differently from ISO.
_ISO_OF = {"EL": "GR", "UK": "GB"}


def _fold(name):
    import unicodedata
    s = unicodedata.normalize("NFKD", str(name or ""))
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return " ".join(s.lower().replace("-", " ").split())


def _osm_key(value):
    """'way/123', 'osm:way/123', 'w123' and 'W123' are one id."""
    s = str(value or "").strip()
    if not s:
        return ""
    if s.startswith("osm:"):
        s = s[4:]
    for word, letter in (("way/", "w"), ("node/", "n"), ("relation/", "r")):
        if s.startswith(word):
            return letter + s[len(word):]
    return s.lower()


def _haversine_km(lat1, lon1, lat2, lon2):
    import math
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(a))


class _NearIndex:
    """Bucketed nearest-point test, so 5,500 Italian bathing sites against
    900 published beaches is a few thousand haversines, not five million."""

    def __init__(self, points, cell_deg=0.05):
        self.cell = cell_deg
        self.grid = defaultdict(list)
        for lat, lon in points:
            if lat is None or lon is None:
                continue
            self.grid[(int(lat // cell_deg), int(lon // cell_deg))].append((lat, lon))

    def within(self, lat, lon, km):
        if lat is None or lon is None:
            return False
        reach = int(km / (111.0 * self.cell)) + 1
        ci, cj = int(lat // self.cell), int(lon // self.cell)
        for i in range(ci - reach, ci + reach + 1):
            for j in range(cj - reach, cj + reach + 1):
                for la, lo in self.grid.get((i, j), ()):
                    if _haversine_km(lat, lon, la, lo) <= km:
                        return True
        return False


_eea_cache = None


def _eea_sites():
    """EEA bathing waters by (iso country, type), as (lat, lon, name, bwid)."""
    global _eea_cache
    if _eea_cache is None:
        out = defaultdict(list)
        for site in load_json(EEA_BATHING, []) or []:
            cc = _ISO_OF.get(site.get("iso2"), site.get("iso2"))
            out[(cc, site.get("type"))].append(
                (site.get("lat"), site.get("lon"), site.get("name"),
                 site.get("bwid")))
        _eea_cache = out
    return _eea_cache


def _published_index(rows):
    """Per country: the published wd ids, osm ids and folded names, and the
    coordinates, so a named candidate can be asked 'are you in the wire'."""
    idx = defaultdict(lambda: {"wd": set(), "osm": set(), "name": set(),
                               "pts": [], "n": 0, "rated": 0})
    for row in rows:
        cc = row.get("cc")
        got = idx[cc]
        got["n"] += 1
        if row.get("tier") != "l":
            got["rated"] += 1
        if row.get("wd"):
            got["wd"].add(str(row["wd"]))
        if row.get("osm"):
            got["osm"].add(_osm_key(row["osm"]))
        if row.get("name"):
            got["name"].add(_fold(row["name"]))
        if row.get("lat") is not None:
            got["pts"].append((row["lat"], row["lon"]))
    return idx


def _is_published(idx_cc, wd=None, osm=None, name=None):
    if wd and str(wd) in idx_cc["wd"]:
        return True
    if osm and _osm_key(osm) in idx_cc["osm"]:
        return True
    if name and _fold(name) in idx_cc["name"]:
        return True
    return False


def _verdict_index(verdicts):
    """(cc, wd) and (cc, folded name) -> (verdict, detail) from the gate
    replay, so an unpublished named row can print the number the gate saw."""
    idx = {}
    for cc, vs in (verdicts or {}).items():
        for v in vs:
            item = v[0] or {}
            if item.get("wd"):
                idx[(cc, str(item["wd"]))] = (v[5], v[6])
            if v[2]:
                idx.setdefault((cc, _fold(v[2])), (v[5], v[6]))
    return idx


def _gate_detail(vidx, cc, wd, name):
    got = vidx.get((cc, str(wd))) if wd else None
    if got is None and name:
        got = vidx.get((cc, _fold(name)))
    if got is None:
        return "not in gate replay"
    return f"{got[0]}:{got[1]}" if got[1] else got[0]


def _dominant(codes, default="below_quota"):
    """The one code a cell prints when its misses carry several: the most
    frequent, with the spec's list order breaking ties."""
    if not codes:
        return default
    counts = defaultdict(int)
    for c in codes:
        counts[c] += 1
    return sorted(counts, key=lambda c: (-counts[c], REASON_CODES.index(c)
                                         if c in REASON_CODES else 99))[0]


def _rich_rows(layer_dir, key, cc):
    """One country's harvested pool, or None when no harvest has run."""
    path = DATA_ROOT / "cache" / layer_dir / f"rich_{cc}.json"
    if not path.exists():
        return None
    return list((load_json(path, {}) or {}).get(key) or [])


def _country_measures():
    """Coast km, lakes over 5 ha and relief per ISO country, from the
    opportunity tables, keyed by the admin table's own country column so
    EL and TL land on GR and GB."""
    admin3 = _admin3()
    countries_of = dict(zip(admin3["id"], admin3["country"]))
    table = quotas._table()
    coast = defaultdict(float)
    lakes = defaultdict(int)
    relief = defaultdict(float)
    for rid, row in (table.get("coast") or {}).items():
        cc = rid.split(":", 1)[1].split("-", 1)[0]
        coast[_ISO_OF.get(cc, cc)] += float(row.get("coast_km") or 0)
    for rid, row in (table.get("n3") or {}).items():
        cc = countries_of.get(rid) or _ISO_OF.get(rid[:2], rid[:2])
        lakes[cc] += int(row.get("lakes_over_5ha") or 0)
        relief[cc] = max(relief[cc], float(row.get("relief_m") or 0))
    return coast, lakes, relief


def _applicable_country(cc, layer, measures, pool):
    """None when the floor applies; otherwise the not_applicable detail.
    The rules are quotas.applicable lifted to the country: a coast for
    beaches, lakes over 5 ha for lakes, relief over 250 m for mountains. A
    country with a harvested pool is always held, whatever the measure says,
    because the rows exist."""
    coast, lakes, relief = measures
    if pool:
        return None
    if layer == "beach" and coast.get(cc, 0) <= 0:
        return "no coastline (EEA coastline, opportunity.json)"
    if layer == "lake" and lakes.get(cc, 0) <= 0 and cc in lakes:
        return "no lakes over 5 ha (opportunity.json)"
    if layer == "mountain" and cc in relief and relief.get(cc, 0) <= 250:
        return f"relief {relief[cc]:.0f} m, below 250 m (opportunity.json)"
    return None


def _cell(published, floor, must, must_published, misses, code, detail,
          status=None, extra=None):
    if status is None:
        status = "ok" if (published >= floor and len(misses) == 0) else "fail"
    out = {"published": published, "floor": floor, "must": must,
           "must_published": must_published, "status": status}
    if status != "ok":
        out["code"] = code
        out["detail"] = detail
    if misses:
        out["misses"] = misses[:200]
        if len(misses) > 200:
            out["misses_omitted"] = len(misses) - 200
    if extra:
        out.update(extra)
    return out


def _empty_pool_cell(cc, layer, layer_dir, published, floor):
    harvested = (DATA_ROOT / "cache" / layer_dir / f"rich_{cc}.json").exists()
    detail = (f"harvest ran for {cc} and found nothing" if harvested
              else f"no {layer} harvest has run for {cc}")
    return _cell(published, floor, 0, 0, [], "no_open_data", detail)


def _contract_trail(cc, pidx, trails_cov, registry):
    published = pidx[cc]["n"]
    must = [r for r in registry if r.get("country") == cc
            and r.get("kind") == "trail"
            and (r.get("fame_score") or 0) >= TRAIL_FAME_THRESHOLD]
    floor = max(COUNTRY_FLOOR_MIN["trail"], len(must))
    status_of = {r["id"]: r for r in trails_cov.get("rows") or []
                 if r.get("country") == cc}
    misses, matched = [], 0
    for r in must:
        got = status_of.get(r["id"])
        if got and got.get("status") == "matched":
            matched += 1
            continue
        # A registry row the trails report never judged is our gap, not
        # the world's: below_quota, with the detail saying why.
        reason = (got or {}).get("reason") or "not_in_trails_coverage_report"
        misses.append({"id": r["id"], "name": r.get("name"),
                       "nuts3": r.get("nuts3"),
                       "code": TRAIL_REASON.get(reason, "below_quota"),
                       "detail": reason})
    # The per region rule: every NUTS3 publishes its top 3 registry rows or
    # gives each miss a reason. coverage_report.py already judged that; this
    # carries its verdicts per country.
    region_misses = []
    for rid, entry in (trails_cov.get("regions") or {}).items():
        if entry.get("country") != cc:
            continue
        for t in (entry.get("top3") or [])[:TRAIL_REGION_TOP]:
            if t.get("status") != "missing":
                continue
            region_misses.append({"region": rid, "id": t.get("id"),
                                  "name": t.get("name"),
                                  "code": TRAIL_REASON.get(
                                      t.get("reason"), "below_quota"),
                                  "detail": t.get("reason")})
    if not registry and published == 0:
        code, detail = "no_open_data", "no registry rows and nothing published"
    else:
        code = _dominant([m["code"] for m in misses])
        detail = (f"{published} published, floor {floor}; "
                  f"{len(misses)} of {len(must)} registry rows above fame "
                  f"{TRAIL_FAME_THRESHOLD} missing")
    return _cell(published, floor, len(must), matched, misses, code, detail,
                 extra={"region_misses": region_misses[:300],
                        "regions_failing": len({m["region"]
                                                for m in region_misses})})


def _contract_cycling(cc, rows_cc, pidx):
    published = pidx[cc]["n"]
    must = [r for r in rows_cc if (r.get("net") or "").lower() in ("ncn", "icn")]
    floor = max(COUNTRY_FLOOR_MIN["cycling"], len(must))
    wire_file = (WIRE / "cycling" / f"{cc}.json").exists()
    if published == 0:
        detail = ("no cycling wire file; no routes ingested for this country"
                  if not wire_file else "wire file holds no routes")
        return _cell(0, floor, 0, 0, [], "no_open_data", detail)
    # The national and international pool is read from the wire itself, so
    # every row in it is published by construction and the floor can only
    # bite on the minimum. That is a coverage bounded count and is said so.
    detail = (f"{published} published ({pidx[cc]['rated']} rated), floor "
              f"{floor}; {len(must)} national or international routes known "
              f"to the ingest (pool bounded by the ingest, not the world)")
    return _cell(published, floor, len(must), len(must), [], "below_quota",
                 detail)


def _contract_beach(cc, pidx, rejected_cc, measures):
    published = pidx[cc]["n"]
    sites = _eea_sites().get((cc, "Coastal")) or []
    pool = _rich_rows("beaches", "beaches", cc)
    coast_km = measures[0].get(cc, 0)
    # "Minimum 10 where a coast exists": a landlocked country is held to no
    # beach floor however many lake beaches it publishes, and the detail
    # says what it does publish so the cell is a fact, not a shrug.
    if coast_km <= 0 and not sites:
        return _cell(published, 0, 0, 0, [], "not_applicable",
                     f"no coastline (opportunity.json); {published} lake "
                     f"beaches published", status="na")
    floor = max(COUNTRY_FLOOR_MIN["beach"], len(sites))
    if not pool and not sites and published == 0:
        return _empty_pool_cell(cc, "beach", "beaches", published, floor)
    near = _NearIndex(pidx[cc]["pts"])
    misses, matched = [], 0
    for lat, lon, name, bwid in sites:
        if near.within(lat, lon, EEA_SITE_MATCH_KM):
            matched += 1
            continue
        misses.append({"id": bwid, "name": name, "code": "below_quota",
                       "detail": f"no published beach within "
                                 f"{EEA_SITE_MATCH_KM:g} km"})
    tally = defaultdict(int)
    for v in rejected_cc:
        tally[v[5]] += 1
    gate = ", ".join(f"{k} {n}" for k, n in sorted(tally.items(),
                                                  key=lambda kv: -kv[1]))
    detail = (f"{published} published, floor {floor}; {len(misses)} of "
              f"{len(sites)} EEA coastal bathing waters without a published "
              f"beach within {EEA_SITE_MATCH_KM:g} km"
              + (f"; gate rejections: {gate}" if gate else ""))
    code = "below_quota" if (pool or sites) else "no_open_data"
    return _cell(published, floor, len(sites), matched, misses, code, detail)


def _contract_lake(cc, pidx, vidx, measures, cells_over):
    published = pidx[cc]["n"]
    pool = _rich_rows("lakes", "lakes", cc)
    why = _applicable_country(cc, "lake", measures, pool)
    if why:
        return _cell(published, 0, 0, 0, [], "not_applicable", why,
                     status="na")
    floor = COUNTRY_FLOOR_MIN["lake"]
    if not pool:
        return _empty_pool_cell(cc, "lake", "lakes", published, floor)
    sites = _NearIndex([(s[0], s[1]) for s in
                        _eea_sites().get((cc, "Lake")) or []])
    must = []
    for lake in pool:
        anchors = []
        if (lake.get("area_km2") or 0) >= LAKE_ANCHOR_AREA_KM2:
            anchors.append("area")
        if (lake.get("sitelinks") or 0) >= LAKE_ANCHOR_SITELINKS:
            anchors.append("wikis")
        if lake.get("protected"):
            anchors.append("protected")
        if sites.within(lake.get("lat"), lake.get("lon"), EEA_LAKE_SITE_KM):
            anchors.append("bathing")
        if anchors:
            must.append((lake, anchors))
    floor = max(floor, len(must))
    misses, matched = [], 0
    for lake, anchors in must:
        if _is_published(pidx[cc], lake.get("wd"), lake.get("osm_id"),
                         lake.get("name")):
            matched += 1
            continue
        misses.append({"id": lake.get("key") or lake.get("wd"),
                       "name": lake.get("name"), "anchors": anchors,
                       "code": "below_quota",
                       "detail": _gate_detail(vidx, cc, lake.get("wd"),
                                              lake.get("name"))})
    over = cells_over.get(cc) or []
    detail = (f"{published} published, floor {floor}; {len(misses)} of "
              f"{len(must)} lakes clearing a hard anchor unpublished; "
              f"{len(over)} cells over {LAKE_CELL_MAX} per {LAKE_CELL_KM} km")
    return _cell(published, floor, len(must), matched, misses, "below_quota",
                 detail, extra={"cells_over_cap": over[:50]})


def _contract_mountain(cc, pidx, vidx, measures, range_misses):
    published = pidx[cc]["n"]
    pool = _rich_rows("mountains", "peaks", cc)
    why = _applicable_country(cc, "mountain", measures, pool)
    if why:
        return _cell(published, 0, 0, 0, [], "not_applicable", why,
                     status="na")
    floor = COUNTRY_FLOOR_MIN["mountain"]
    if not pool:
        return _empty_pool_cell(cc, "mountain", "mountains", published, floor)
    try:
        sys.path.insert(0, str(DATA_ROOT / "pipeline" / "mountains"))
        import peak_index as pi
        lift_of = pi.lift_of
    except Exception:
        lift_of = lambda peak: None  # noqa: E731
    must = []
    for peak in pool:
        why_must = []
        if (peak.get("prom") or 0) >= ULTRA_PROM_M:
            why_must.append("ultra")
        if peak.get("highpoint_of"):
            why_must.append(f"highpoint:{peak['highpoint_of']}")
        try:
            lift = lift_of(peak) or {}
        except Exception:
            lift = {}
        if lift.get("kind") in SUMMIT_LIFT_KINDS:
            why_must.append(f"lift:{lift['kind']}")
        if why_must:
            must.append((peak, why_must))
    floor = max(floor, len(must))
    misses, matched = [], 0
    # A rich peak's `osm` is its tag census, not an id, so a peak is matched
    # on its Wikidata id and, failing that, its folded name.
    for peak, why_must in must:
        if _is_published(pidx[cc], peak.get("wd"), None, peak.get("name")):
            matched += 1
            continue
        misses.append({"id": peak.get("wd") or peak.get("name"),
                       "name": peak.get("name"), "why": why_must,
                       "code": "below_quota",
                       "detail": _gate_detail(vidx, cc, peak.get("wd"),
                                              peak.get("name"))})
    rm = range_misses.get(cc) or []
    detail = (f"{published} published, floor {floor}; {len(misses)} of "
              f"{len(must)} ultras, highpoints and lift-served summits "
              f"unpublished; {len(rm)} GMBA range top-3 misses")
    return _cell(published, floor, len(must), matched, misses, "below_quota",
                 detail, extra={"range_misses": rm[:100],
                                "ranges_failing": len({m["range"] for m in rm})})


def _range_top3_misses(pidx, vidx):
    """Every GMBA range with a peak over 1,000 m publishes its 3 highest.
    Peaks are pooled across countries (a range crosses borders) and each
    miss is charged to the country of the peak."""
    by_range = defaultdict(list)
    for path in sorted((DATA_ROOT / "cache" / "mountains").glob("rich_??.json")):
        cc = path.stem.split("_")[1]
        for peak in (load_json(path, {}) or {}).get("peaks") or []:
            ra = (peak.get("rg") or {}).get("ra")
            if ra and peak.get("ele") is not None:
                by_range[ra].append((cc, peak))
    out = defaultdict(list)
    for ra, peaks in by_range.items():
        peaks.sort(key=lambda t: -(t[1].get("ele") or 0))
        if (peaks[0][1].get("ele") or 0) < RANGE_PEAK_M:
            continue
        for cc, peak in peaks[:RANGE_TOP]:
            if _is_published(pidx[cc], peak.get("wd"), None, peak.get("name")):
                continue
            out[cc].append({"range": ra, "id": peak.get("wd") or peak.get("name"),
                            "name": peak.get("name"), "ele": peak.get("ele"),
                            "code": "below_quota",
                            "detail": _gate_detail(vidx, cc, peak.get("wd"),
                                                   peak.get("name"))})
    return out


def _lake_cells_over_cap(rows):
    """Rated lakes per 50 km cell in EPSG:3035; cells holding more than the
    cap, per country. A diversity measurement, reported not gated."""
    pts = [(r["cc"], r["lat"], r["lon"]) for r in rows
           if r.get("tier") != "l" and r.get("lat") is not None]
    if not pts:
        return {}
    import geopandas as gpd
    gs = gpd.GeoSeries(gpd.points_from_xy([p[2] for p in pts],
                                          [p[1] for p in pts]),
                       crs="EPSG:4326").to_crs("EPSG:3035")
    size = LAKE_CELL_KM * 1000.0
    cells = defaultdict(lambda: defaultdict(int))
    for (cc, _, _), geom in zip(pts, gs):
        cells[cc][(int(geom.x // size), int(geom.y // size))] += 1
    out = {}
    for cc, grid in cells.items():
        over = [{"cell": f"{i}:{j}", "rated": n} for (i, j), n in grid.items()
                if n > LAKE_CELL_MAX]
        if over:
            out[cc] = sorted(over, key=lambda c: -c["rated"])
    return out


def _coastal_region_misses(ctx, countries_of):
    """Every coastal NUTS3 publishes at least 5 beaches, or each miss has a
    code: below_quota when the gate replay rejected candidates there,
    no_open_data when it saw none."""
    coast = load_json(COAST_KM_BY_N3, {}) or {}
    by_region = ctx["by_region"].get("beach") or {}
    rejected = ctx["rejected"].get("beach") or {}
    out = defaultdict(list)
    for rid, km in coast.items():
        if not km or km <= 0:
            continue
        cc = countries_of.get(rid)
        if cc is None:
            continue
        got = by_region.get(rid, {"r": 0, "l": 0})
        total = got["r"] + got["l"]
        if total >= COASTAL_REGION_MIN:
            continue
        cands = rejected.get(rid) or []
        tally = defaultdict(int)
        for v in cands:
            tally[v[5]] += 1
        out[cc].append({"region": rid, "published": total,
                        "floor": COASTAL_REGION_MIN,
                        "code": "below_quota" if cands else "no_open_data",
                        "detail": ", ".join(f"{k} {n}" for k, n in
                                            sorted(tally.items()))
                        or "no candidates in the gate replay"})
    return out


def region_code(layer, entry, rid, rejected, trails_cov):
    """The reason code one NUTS3 region prints beside a thin or empty
    status, from the same evidence the backlog CSV carries."""
    status = entry.get("status")
    if status == "na":
        return "not_applicable"
    if status == "ok":
        return None
    if layer == "trail":
        top3 = ((trails_cov.get("regions") or {}).get(rid) or {}).get("top3") or []
        codes = [TRAIL_REASON.get(t.get("reason"), "below_quota")
                 for t in top3 if t.get("status") == "missing"]
        return _dominant(codes)
    return "below_quota" if rejected.get(rid) else "no_open_data"


def build_contract(regions, ctx, layers):
    """One cell per country per audited layer, each with a published count
    against its floor and, when short, a reason code and a detail."""
    admin3 = _admin3()
    countries_of = dict(zip(admin3["id"], admin3["country"]))
    measures = _country_measures()
    trails_cov = load_json(TRAILS_COVERAGE, {}) or {}
    registry = (load_json(FAMOUS_REGISTRY, {}) or {}).get("rows") or []
    if "trail" in layers and not trails_cov:
        log("contract: data/reports/trails_coverage.json missing, trail "
            "registry rows will all read as missing")

    cells = defaultdict(dict)
    for layer in layers:
        rows = ctx["rows"].get(layer) or []
        pidx = _published_index(rows)
        vidx = _verdict_index(ctx["verdicts"].get(layer))
        rejected = ctx["rejected"].get(layer) or {}
        rejected_by_cc = defaultdict(list)
        for rid, vs in rejected.items():
            rejected_by_cc[countries_of.get(rid)].extend(vs)
        cells_over = _lake_cells_over_cap(rows) if layer == "lake" else {}
        range_misses = (_range_top3_misses(pidx, vidx)
                        if layer == "mountain" else {})
        coastal = (_coastal_region_misses(ctx, countries_of)
                   if layer == "beach" else {})
        for cc in COUNTRIES:
            if layer == "trail":
                cell = _contract_trail(cc, pidx, trails_cov, registry)
            elif layer == "cycling":
                cell = _contract_cycling(cc, [r for r in rows
                                              if r.get("cc") == cc], pidx)
            elif layer == "beach":
                cell = _contract_beach(cc, pidx, rejected_by_cc.get(cc, []),
                                       measures)
                if coastal.get(cc):
                    cell["region_misses"] = coastal[cc][:100]
                    cell["regions_failing"] = len(coastal[cc])
            elif layer == "lake":
                cell = _contract_lake(cc, pidx, vidx, measures, cells_over)
            else:
                cell = _contract_mountain(cc, pidx, vidx, measures,
                                          range_misses)
            if (cell["status"] == "fail" and cc in MICROSTATES
                    and layer in ("trail", "cycling")
                    and cell["published"] < cell["floor"]):
                cell["status"] = "na"
                cell["code"] = "not_applicable"
                cell["detail"] = (f"microstate, {MICROSTATES[cc]} km2; "
                                  f"{cell['published']} published")
            # A stated fact from the spec beats a derived code on any cell
            # that is not passing, including one the measures wrongly read
            # as n/a (Turkey has a coast; opportunity.json has no row for it).
            if cell["status"] != "ok" and (cc, layer) in KNOWN_GAPS:
                cell["status"] = "fail"
                cell["code"], cell["detail"] = KNOWN_GAPS[(cc, layer)]
            if cell["status"] != "ok" and cell.get("code") not in REASON_CODES:
                raise ValueError(f"{cc}/{layer}: code {cell.get('code')!r} "
                                 f"is not one of the contract's codes")
            cells[cc][layer] = cell

        # The per region code, beside the status the wire already carries.
        for rid, by_layer in regions.items():
            entry = by_layer.get(layer)
            if not entry:
                continue
            code = region_code(layer, entry, rid, rejected, trails_cov)
            if code:
                entry["code"] = code

    return {
        "version": CONTRACT_VERSION,
        "floors": dict(COUNTRY_FLOOR_MIN),
        "rules": {
            "trail": f"every registry row with fame_score >= "
                     f"{TRAIL_FAME_THRESHOLD}, minimum "
                     f"{COUNTRY_FLOOR_MIN['trail']}; every NUTS3 its top "
                     f"{TRAIL_REGION_TOP} registry rows",
            "cycling": f"every ncn or icn route, minimum "
                       f"{COUNTRY_FLOOR_MIN['cycling']}",
            "beach": f"every EEA coastal bathing water (published beach within "
                     f"{EEA_SITE_MATCH_KM:g} km), minimum "
                     f"{COUNTRY_FLOOR_MIN['beach']} where a coast exists; "
                     f"every coastal NUTS3 at least {COASTAL_REGION_MIN}",
            "lake": f"every lake clearing a hard anchor (area >= "
                    f"{LAKE_ANCHOR_AREA_KM2:g} km2, >= {LAKE_ANCHOR_SITELINKS} "
                    f"wikis, protected, or an EEA lake site within "
                    f"{EEA_LAKE_SITE_KM:g} km), minimum "
                    f"{COUNTRY_FLOOR_MIN['lake']} where lakes exist; max "
                    f"{LAKE_CELL_MAX} per {LAKE_CELL_KM} km cell",
            "mountain": f"every ultra (P >= {ULTRA_PROM_M} m), highpoint and "
                        f"lift-served summit, minimum "
                        f"{COUNTRY_FLOOR_MIN['mountain']} where relief "
                        f"exists; every GMBA range with a peak over "
                        f"{RANGE_PEAK_M} m its {RANGE_TOP} highest",
        },
        "reason_codes": list(REASON_CODES),
        "countries": {cc: cells[cc] for cc in COUNTRIES},
    }


def contract_summary(contract, layers):
    """The numbers the log and the report print: cells above floor, cells
    with a code, blank cells (which the contract forbids)."""
    ok = fail = na = blank = 0
    by_code = defaultdict(int)
    for cc, by_layer in contract["countries"].items():
        for layer in layers:
            cell = by_layer.get(layer)
            if not cell:
                blank += 1
                continue
            if cell["status"] == "ok":
                ok += 1
            elif cell["status"] == "na":
                na += 1
                by_code[cell.get("code")] += 1
            else:
                fail += 1
                by_code[cell.get("code")] += 1
    return {"cells": len(contract["countries"]) * len(layers), "ok": ok,
            "fail": fail, "na": na, "blank": blank, "by_code": dict(by_code)}


def write_contract_report(contract, layers):
    summary = contract_summary(contract, layers)
    payload = {"generated_at": datetime.now(timezone.utc)
               .strftime("%Y-%m-%dT%H:%M:%SZ"),
               "summary": summary}
    payload.update(contract)
    atomic_write_json(REPORTS / "coverage_contract.json", payload)
    log(f"contract: {summary['ok']} of {summary['cells']} country cells "
        f"above floor, {summary['fail']} with a reason code, "
        f"{summary['na']} not applicable, {summary['blank']} blank; codes "
        + ", ".join(f"{k} {n}" for k, n in sorted(summary["by_code"].items(),
                                                   key=lambda kv: -kv[1])))
    return summary


def write_wire(regions, layers, contract=None):
    """The coverage wire, MERGED rather than replaced.

    A `--layers beach` run audits one layer, and a wire written from that
    alone would report every region as having no lakes, no mountains and
    no trails. That is the same trap the region export documents: a
    targeted run must not de-index the rest. So the layers just audited
    overwrite their own entries and every other layer's last known answer
    is carried forward, with `layers` naming what this run refreshed."""
    admin3 = _admin3()
    names = dict(zip(admin3["id"], admin3["name"]))
    previous = load_json(WIRE / "coverage.json", {}) or {}
    prev_regions = previous.get("regions") or {}

    merged = {}
    for rid, by_layer in regions.items():
        entry = {k: v for k, v in (prev_regions.get(rid) or {}).items()
                 if k != "name"}
        entry.update(by_layer)
        merged[rid] = dict({"name": names.get(rid, rid)}, **entry)

    audited = sorted(set(previous.get("layers") or []) | set(layers))
    # The contract merges the same way: a cell is refreshed for the layers
    # this run audited and carried forward for the rest.
    prev_contract = previous.get("contract") or {}
    merged_contract = None
    if contract is not None:
        countries = {}
        for cc in COUNTRIES:
            entry = dict((prev_contract.get("countries") or {}).get(cc) or {})
            entry.update(contract["countries"].get(cc) or {})
            countries[cc] = entry
        merged_contract = dict(contract, countries=countries)
    elif prev_contract:
        merged_contract = prev_contract
    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "version": COVERAGE_VERSION,
        "layers": audited,
        "refreshed": sorted(layers),
        # WHICH UNIT each layer's gate actually budgets on, because this
        # file reports per NUTS3 region and two layers do not gate there.
        # A beach quota is spent per coastal stretch and a mountain quota
        # per GMBA range, so for those two the `quota` beside a region is
        # the NUTS3 equivalent view, NOT the number that gated anything: a
        # region can hold more rated rows than it shows quota, and that is
        # arithmetic rather than a leak. Only lake, trail and cycling
        # budget on the same unit this file is keyed by.
        "quota_units": {layer: spec["unit"]
                        for layer, spec in quotas.QUOTA.items()},
        "regions": dict(sorted(merged.items())),
    }
    if merged_contract is not None:
        # The wire copy carries the cells without their miss lists: the
        # app prints "we publish 12 walks in Albania, reason ..." from
        # the counts and the code; the lists stay in reports/.
        slim = {}
        for cc, by_layer in merged_contract["countries"].items():
            slim[cc] = {layer: {k: v for k, v in cell.items()
                                if k not in ("misses", "region_misses",
                                             "range_misses",
                                             "cells_over_cap")}
                        for layer, cell in by_layer.items()}
        payload["contract"] = dict(merged_contract, countries=slim)
    WIRE_OUT.mkdir(parents=True, exist_ok=True)
    atomic_write_json(WIRE_OUT / "coverage.json", payload,
                      separators=(",", ":"), indent=None)
    log(f"wire: coverage.json for {len(regions)} regions")
    return payload


def write_html(payload, layers):
    import html as html_mod
    admin3 = _admin3()
    cent = admin3.geometry.representative_point()
    pos = {rid: (p.x, p.y) for rid, p in zip(admin3["id"], cent)}
    colours = {"ok": "#3a7d44", "thin": "#d9a441", "empty": "#c0392b",
               "na": "#d5d0c8"}
    tabs, maps, tables = [], [], []
    for layer in sorted(layers):
        counts = defaultdict(int)
        dots = []
        worst = []
        for rid, entry in payload["regions"].items():
            got = entry.get(layer)
            if not got:
                continue
            counts[got["status"]] += 1
            x, y = pos.get(rid, (None, None))
            if x is None:
                continue
            px = (x + 32) * 7.2
            py = (72 - y) * 10.5
            dots.append(f'<circle cx="{px:.0f}" cy="{py:.0f}" r="3" '
                        f'fill="{colours[got["status"]]}">'
                        f'<title>{html_mod.escape(str(entry.get("name")))} '
                        f'{got["status"]}</title></circle>')
            if got["status"] in ("empty", "thin"):
                worst.append((got.get("quota", 0) - got.get("r", 0), rid,
                              entry.get("name"), got))
        worst.sort(reverse=True)
        head = " ".join(f"{k}:{counts.get(k, 0)}" for k in
                        ("ok", "thin", "empty", "na"))
        rows = "".join(
            f"<tr><td>{rid}</td><td>{html_mod.escape(str(name))}</td>"
            f"<td>{g.get('r', 0)}</td><td>{g.get('quota', 0)}</td>"
            f"<td class='{g['status']}'>{g['status']}</td></tr>"
            for _, rid, name, g in worst[:50])
        tabs.append(f"<h2>{layer} <small>{head}</small></h2>")
        maps.append(f'<svg viewBox="0 0 560 480" width="560" height="480" '
                    f'style="background:#f4f1ea">{"".join(dots)}</svg>')
        tables.append(
            "<table><tr><th>region</th><th>name</th><th>published</th>"
            f"<th>quota</th><th>status</th></tr>{rows}</table>")
    body = "".join(t + m + tb for t, m, tb in zip(tabs, maps, tables))
    contract_html = _contract_html(payload.get("contract"), sorted(layers))
    html_page = (
        "<!doctype html><meta charset='utf-8'><title>Carta coverage</title>"
        "<style>body{font:14px/1.4 system-ui;margin:24px;max-width:900px}"
        "table{border-collapse:collapse;margin:12px 0}td,th{border:1px solid #ddd;"
        "padding:3px 8px;text-align:left}td.empty{background:#f6d5cf}"
        "td.thin{background:#f7e8c8}td.fail{background:#f6d5cf}"
        "td.na{color:#777}h2 small{color:#777;font-weight:400}"
        "td.detail{color:#555;max-width:420px}</style>"
        f"<h1>Coverage audit {payload['generated_at']}</h1>"
        f"{contract_html}{body}")
    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "coverage.html").write_text(html_page, encoding="utf-8")
    log("report: coverage.html")


def _contract_html(contract, layers):
    """Spec 1.7: one row per country per section, published count, floor,
    pass or fail, and the reason code for every miss."""
    import html as html_mod
    if not contract:
        return ""
    summary = contract_summary(contract, layers)
    rows = []
    for cc in COUNTRIES:
        by_layer = contract["countries"].get(cc) or {}
        for layer in layers:
            cell = by_layer.get(layer)
            if not cell:
                rows.append(f"<tr><td>{cc}</td><td>{layer}</td><td></td>"
                            f"<td></td><td class='fail'>blank</td><td></td>"
                            f"<td class='detail'>no cell: the contract "
                            f"forbids this</td></tr>")
                continue
            status = cell["status"]
            word = {"ok": "pass", "fail": "fail", "na": "n/a"}[status]
            rows.append(
                f"<tr><td>{cc}</td><td>{layer}</td>"
                f"<td>{cell['published']}</td><td>{cell['floor']}</td>"
                f"<td class='{status}'>{word}</td>"
                f"<td>{html_mod.escape(str(cell.get('code') or ''))}</td>"
                f"<td class='detail'>"
                f"{html_mod.escape(str(cell.get('detail') or ''))}</td></tr>")
    head = (f"pass:{summary['ok']} fail:{summary['fail']} "
            f"n/a:{summary['na']} blank:{summary['blank']}")
    return (f"<h2>Country contract <small>{head}</small></h2>"
            f"<p>Every country and section either publishes its floor or "
            f"prints a reason code. The named rows behind each floor are in "
            f"reports/coverage_contract.json.</p>"
            "<table><tr><th>country</th><th>section</th><th>published</th>"
            "<th>floor</th><th>status</th><th>code</th><th>detail</th></tr>"
            f"{''.join(rows)}</table>")


def alerts(regions, layers):
    """The brief's alert rule, made deterministic: instead of 500 random
    coordinates (which would break byte identical rebuilds), every level 3
    region's representative point asks "how far is the nearest published
    row of each layer that applies here". Farther than 60 km, and the
    region goes on the alert list; an applicable region at status empty is
    an alert by definition."""
    import geopandas as gpd
    import numpy as np
    import shapely
    admin3 = _admin3()
    # Measured in EPSG:3035, not in degrees. A degree of longitude is 111 km
    # at the equator and 55 km at 60 N, so a degree scaled distance reports
    # every Norwegian region as twice as isolated as it is, which is the
    # difference between an alert list and a list of Norway.
    pts = gpd.GeoSeries(admin3.geometry.representative_point(),
                        crs="EPSG:4326").to_crs("EPSG:3035")
    out = {"far_from_anything": [], "empty_applicable": []}
    for layer in layers:
        rows = _published_rows(layer)
        coords = [(r["lon"], r["lat"]) for r in rows
                  if r["lat"] is not None and r["lon"] is not None]
        if not coords:
            continue
        pub = gpd.GeoSeries(
            shapely.points(np.array(coords)), crs="EPSG:4326").to_crs("EPSG:3035")
        tree = shapely.STRtree(np.array(pub.values))
        for rid, pt in zip(admin3["id"], pts):
            entry = regions.get(rid, {}).get(layer) or {}
            if entry.get("status") in (None, "na"):
                continue
            near = tree.query_nearest(pt, all_matches=False)
            if not len(near):
                continue
            km = float(shapely.distance(pt, pub.values[int(near[0])])) / 1000.0
            if km > 60.0:
                out["far_from_anything"].append(
                    {"region": rid, "layer": layer, "km": round(km)})
            if entry.get("status") == "empty":
                out["empty_applicable"].append({"region": rid, "layer": layer})
    REPORTS.mkdir(exist_ok=True)
    atomic_write_json(REPORTS / "coverage_alerts.json", out)
    log(f"alerts: {len(out['far_from_anything'])} regions farther than 60 km "
        f"from anything published, {len(out['empty_applicable'])} applicable "
        f"regions empty")
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--layers", default="beach,lake,mountain,trail,cycling")
    ap.add_argument("--explain", default=None, metavar="CANDIDATE_ID",
                    help="print the full gate trace for one candidate")
    ap.add_argument("--strict", action="store_true",
                    help="exit 1 when any country cell is blank, which is "
                         "the one thing the contract forbids")
    args = ap.parse_args()
    layers = [x.strip() for x in args.layers.split(",") if x.strip()]
    regions, ctx = audit(layers, explain=args.explain)
    contract = build_contract(regions, ctx, layers)
    summary = write_contract_report(contract, layers)
    payload = write_wire(regions, layers, contract)
    write_html(payload, layers)
    alerts(regions, layers)
    if args.strict and summary["blank"]:
        log(f"STRICT: {summary['blank']} country cells have neither a "
            f"count nor a reason code")
        sys.exit(1)


if __name__ == "__main__":
    main()
