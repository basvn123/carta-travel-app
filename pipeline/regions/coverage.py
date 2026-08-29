"""The coverage audit: status per region per layer, and the backlog.

Runs after every layer build and as its own command:

    python pipeline/regions/coverage.py
    python pipeline/regions/coverage.py --layers beach,lake
    python pipeline/regions/coverage.py --explain wd:Q152245

Three outputs:

  continent-app/public/coverage.json
      the wire: per NUTS3 sized region, per layer, published counts against
      quota and floor, status ok | thin | empty | na. The app reads this to
      decide whether to widen a search rung before it renders.

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

WIRE = ROOT / "continent-app" / "public"
REPORTS = ROOT / "reports"
COVERAGE_VERSION = "coverage_v1"

LAYER_WIRES = {
    "beach": ("beaches", "beaches"),
    "lake": ("lakes", "lakes"),
    "mountain": ("mountains", "mountains"),
    "trail": ("trails", "trips"),
}


def log(msg):
    print(f"[regions] {msg}")


def _load_export(layer_dir, module_name):
    """One layer's export module, loaded by path under a neutral name so
    its sibling imports resolve to its own folder."""
    path = ROOT / "pipeline" / layer_dir / f"{module_name}.py"
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
    """Every published row of one layer, with lat/lon and name."""
    folder, key = LAYER_WIRES[layer]
    rows = []
    for path in sorted((WIRE / folder).glob("[A-Z][A-Z].json")):
        data = load_json(path)
        for row in (data or {}).get(key) or []:
            if layer == "trail":
                bbox = row.get("bbox") or [None] * 4
                lat = (bbox[1] + bbox[3]) / 2 if bbox[0] is not None else None
                lon = (bbox[0] + bbox[2]) / 2 if bbox[0] is not None else None
                rows.append({"id": str(row.get("id")), "name": row.get("name"),
                             "lat": lat, "lon": lon, "tier": "r",
                             "rg": row.get("rg")})
            else:
                rows.append({"id": row.get("id"), "name": row.get("name"),
                             "lat": row.get("lat"), "lon": row.get("lon"),
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
        gdf = gpd.read_file(ROOT / "cache" / "regions" / "regions.gpkg",
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
    bi = sys.modules.get("carta_beauty_index") or mod.bi
    countries = mod.COUNTRIES if hasattr(mod, "COUNTRIES") else None
    if countries is None:
        countries = sorted({p.stem.split("_")[1]
                            for p in (ROOT / "cache" / "beaches").glob("rich_??.json")})
    gmax = 1.0
    for cc in countries:
        rich = mod.load_cache("rich", cc) or {}
        for beach in rich.get("beaches") or []:
            gmax = max(gmax, mod.bi.fame_raw(beach))
    mod.GLOBAL_MAX = gmax
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
            if not mod.publishable(beach):
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


def _examine_scored(layer_dir, export_name, rows_key, score_country_takes_max):
    """Lakes and mountains share one shape: fame ceiling over the whole
    field, then score_country, then the photo and reason gates."""
    mod = _load_export(layer_dir, export_name)
    model = mod.li if hasattr(mod, "li") else mod.pi
    countries = sorted({p.stem.split("_")[1]
                        for p in (ROOT / "cache" / layer_dir).glob("rich_??.json")})
    gmax = 1.0
    for cc in countries:
        rich = mod.load_cache("rich", cc) or {}
        for item in rich.get(rows_key) or []:
            gmax = max(gmax, model.fame_raw(item))
    verdicts = {}
    for cc in countries:
        if score_country_takes_max:
            scored = mod.score_country(cc, gmax)
        else:
            mod.GLOBAL_MAX = gmax
            scored = mod.score_country(cc)
        rows, pool = [], []
        for item, comps, score10 in sorted(scored, key=lambda t: -t[2]):
            cand = (item, item.get("key") or item.get("wd") or item.get("name"),
                    item.get("name"), item.get("lat"), item.get("lon"))
            try:
                ok = mod.publishable(item, cc) if layer_dir == "mountains" \
                    else mod.publishable(item)
            except TypeError:
                ok = mod.publishable(item)
            if not ok:
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
    admin3 = _admin3()
    names = dict(zip(admin3["id"], admin3["name"]))
    countries_of = dict(zip(admin3["id"], admin3["country"]))
    regions = defaultdict(dict)

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    REPORTS.mkdir(exist_ok=True)

    for layer in layers:
        rows = _published_rows(layer)
        assigned = _n3_of(rows)
        by_region = defaultdict(lambda: {"r": 0, "l": 0})
        for row, n3 in zip(rows, assigned):
            if n3 is None:
                continue
            tier = "l" if row.get("tier") == "l" else "r"
            by_region[n3][tier] += 1

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
        backlog_path = REPORTS / f"coverage_backlog_{layer}_{stamp}.csv"
        _write_backlog(layer, backlog_path, deficits, names, countries_of,
                       examiner, explain)
        log(f"{layer}: {len(deficits)} regions under quota, "
            f"backlog {backlog_path.name}")

    return regions


def _write_backlog(layer, path, deficits, names, countries_of, examiner,
                   explain):
    verdicts = {}
    if examiner is not None:
        try:
            verdicts = examiner()
        except Exception as exc:
            log(f"{layer}: examiner unavailable ({type(exc).__name__}: {exc}), "
                f"backlog ships without candidates")

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


def write_wire(regions, layers):
    admin3 = _admin3()
    names = dict(zip(admin3["id"], admin3["name"]))
    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "version": COVERAGE_VERSION,
        "layers": sorted(layers),
        "regions": {rid: dict({"name": names.get(rid, rid)}, **by_layer)
                    for rid, by_layer in sorted(regions.items())},
    }
    atomic_write_json(WIRE / "coverage.json", payload,
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
    html_page = (
        "<!doctype html><meta charset='utf-8'><title>Carta coverage</title>"
        "<style>body{font:14px/1.4 system-ui;margin:24px;max-width:900px}"
        "table{border-collapse:collapse;margin:12px 0}td,th{border:1px solid #ddd;"
        "padding:3px 8px;text-align:left}td.empty{background:#f6d5cf}"
        "td.thin{background:#f7e8c8}h2 small{color:#777;font-weight:400}</style>"
        f"<h1>Coverage audit {payload['generated_at']}</h1>{body}")
    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "coverage.html").write_text(html_page, encoding="utf-8")
    log("report: coverage.html")


def alerts(regions, layers):
    """The brief's alert rule, made deterministic: instead of 500 random
    coordinates (which would break byte identical rebuilds), every level 3
    region's representative point asks "how far is the nearest published
    row of each layer that applies here". Farther than 60 km, and the
    region goes on the alert list; an applicable region at status empty is
    an alert by definition."""
    import numpy as np
    import shapely
    admin3 = _admin3()
    pts = admin3.geometry.representative_point()
    out = {"far_from_anything": [], "empty_applicable": []}
    for layer in layers:
        rows = _published_rows(layer)
        coords = [(r["lon"], r["lat"]) for r in rows
                  if r["lat"] is not None and r["lon"] is not None]
        if not coords:
            continue
        tree = shapely.STRtree(shapely.points(np.array(coords)))
        for rid, pt in zip(admin3["id"], pts):
            entry = regions.get(rid, {}).get(layer) or {}
            if entry.get("status") in (None, "na"):
                continue
            near = tree.query_nearest(pt, all_matches=False)
            if not len(near):
                continue
            hit = coords[int(near[0])]
            km = 111.32 * float(shapely.distance(
                pt, shapely.Point(hit[0], hit[1])))
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
    ap.add_argument("--layers", default="beach,lake,mountain,trail")
    ap.add_argument("--explain", default=None, metavar="CANDIDATE_ID",
                    help="print the full gate trace for one candidate")
    args = ap.parse_args()
    layers = [x.strip() for x in args.layers.split(",") if x.strip()]
    regions = audit(layers, explain=args.explain)
    payload = write_wire(regions, layers)
    write_html(payload, layers)
    alerts(regions, layers)


if __name__ == "__main__":
    main()
