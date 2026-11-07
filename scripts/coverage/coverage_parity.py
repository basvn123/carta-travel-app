"""Coverage parity: is the catalogue fair to every country, region and language?

ROADMAP D6 (T1145). Builds one parity table per country, per region and per
language, sets each against a fair expectation, and writes every gap as a
ranked backlog line that D15 (catalogue gaps) and the fill items (D7 to D11,
I8) work from.

Inputs, all tracked in git so the script runs in a cloud session too:
  continent-app/public/app_data.json          the 3,868 places (wire)
  continent-app/public/dossier/*.json         intro and gallery per place
  continent-app/public/app_data/why_i18n/*    the "why go" line per language
  continent-app/public/{trails,beaches,lakes,mountains}/{CC}.json
  continent-app/public/coverage.json          outdoor quota status per region
  continent-app/public/region/*.json          region names, UK ITL2 items
  cache/eurostat_nights_nuts3.json            Eurostat tour_occ_nin3 nights
  cache/nuts3_2021.geojson                    GISCO NUTS 2021 level 3 shapes
  pipeline/diagnostics/coverage_report.py     COUNTRY_AREA_POP (imported,
                                              never copied: one table)

Outputs:
  docs/data/coverage-parity.md    the tables, the method and the backlog
  docs/data/coverage-parity.csv   the backlog, one ranked line per gap

Standard library only. Reads nothing outside the repo and calls no API.

Usage:
    python -I scripts/coverage/coverage_parity.py
    python -I scripts/coverage/coverage_parity.py --check   # exit 1 if the
        written files differ from what a fresh run would write
"""

import argparse
import csv
import importlib.util
import io
import json
import math
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "continent-app" / "public"
APP_DATA = PUBLIC / "app_data.json"
DOSSIER = PUBLIC / "dossier"
WHY = PUBLIC / "app_data" / "why_i18n"
COVERAGE = PUBLIC / "coverage.json"
REGION_DIR = PUBLIC / "region"
NIGHTS = ROOT / "cache" / "eurostat_nights_nuts3.json"
NUTS_GEO = ROOT / "cache" / "nuts3_2021.geojson"
AREA_POP_MODULE = ROOT / "pipeline" / "diagnostics" / "coverage_report.py"
OUT_MD = ROOT / "docs" / "data" / "coverage-parity.md"
OUT_CSV = ROOT / "docs" / "data" / "coverage-parity.csv"

LANGS = ("en", "nl", "de", "fr", "es", "it")

# The expectation blend. A country's fair share of the catalogue is a
# weighted mean of its share of residents, of land area and of tourist
# nights; nights carry half because they measure travel demand directly.
# Where Eurostat holds no nights figure, the nights share is replaced by the
# mean of the other two before the shares are renormalised to sum to 1.
WEIGHTS = {"population": 0.25, "area": 0.25, "nights": 0.5}
# The blends a country gap is also tested under: a gap that holds under all
# of them is marked robust.
SENSITIVITY = (
    {"population": 1 / 3, "area": 1 / 3, "nights": 1 / 3},
    {"population": 0.5, "area": 0.0, "nights": 0.5},
    {"population": 0.0, "area": 0.0, "nights": 1.0},
)
# A country under this share of its expectation is a place gap (D15).
PLACE_GAP_RATIO = 0.67
# A region holding under half of its in-country expectation, where the
# expectation is at least this many places, is a region gap (D15).
REGION_GAP_RATIO = 0.5
REGION_MIN_EXPECTED = 2.0
# A city region (under this many km2: Praha, Wien, Berlin) holds one city,
# which is one place, however many nights it draws; its expectation is
# capped at CITY_REGION_CAP places.
CITY_REGION_KM2 = 2000.0
CITY_REGION_CAP = 2.0
# A field is a gap in a country when its share sits this many points under
# the catalogue share and at least FIELD_MIN_MISSING places are short.
FIELD_GAP_POINTS = 15.0
FIELD_MIN_MISSING = 3

# Fields measured per place: (key, label, roadmap item that fills it).
FIELDS = (
    ("photo", "Hero photo", "D9"),
    ("gallery4", "Gallery of 4 or more photos", "D9"),
    ("intro", "Sourced intro (Wikipedia or Wikivoyage)", "D9"),
    ("guide", "Wikivoyage guide text", "D9"),
    ("beds", "Measured bed prices", "D10"),
    ("food_local", "Food prices at city or region level", "D10"),
    ("climate", "Climate by month", "D8"),
    ("crowds", "Crowds by month", "D11"),
    ("rating", "Score", "D2"),
)
OUTDOOR = ("trail", "beach", "lake", "mountain", "cycling")
# Eurostat and the coverage regions use EL and UK style codes.
CODE_FIX = {"EL": "GR", "UK": "GB", "TL": "GB"}
# NUTS regions outside the catalogue's Europe: the French outermost regions
# (Guadeloupe, Martinique, Guyane, Reunion, Mayotte). Left out of every
# region table and of the area and nights a country shares out.
OUT_OF_SCOPE_NUTS = ("FRY",)


# ---------------------------------------------------------------- loading

def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def load_area_pop():
    spec = importlib.util.spec_from_file_location("_coverage_report", AREA_POP_MODULE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.COUNTRY_AREA_POP


def ring_area_km2(ring):
    """Planar area of a lon/lat ring, lon scaled by cos(latitude)."""
    if len(ring) < 3:
        return 0.0
    lat0 = math.radians(sum(p[1] for p in ring) / len(ring))
    kx = 111.32 * math.cos(lat0)
    ky = 110.57
    s = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        s += (x1 * kx) * (y2 * ky) - (x2 * kx) * (y1 * ky)
    return abs(s) / 2


def point_in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def load_nuts():
    """NUTS 3 polygons with bbox, area and centre, keyed by id."""
    geo = load_json(NUTS_GEO)
    out = {}
    for f in geo["features"]:
        p = f["properties"]
        if p.get("LEVL_CODE") != 3 or p["NUTS_ID"].startswith(OUT_OF_SCOPE_NUTS):
            continue
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        xs = [pt[0] for poly in polys for pt in poly[0]]
        ys = [pt[1] for poly in polys for pt in poly[0]]
        area = sum(ring_area_km2(poly[0]) - sum(ring_area_km2(h) for h in poly[1:])
                   for poly in polys)
        out[p["NUTS_ID"]] = {
            "cc": CODE_FIX.get(p["CNTR_CODE"], p["CNTR_CODE"]),
            "polys": polys,
            "bbox": (min(xs), min(ys), max(xs), max(ys)),
            "centre": ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2),
            "area": area,
        }
    return out


def find_nuts3(nuts, cc, lon, lat):
    for nid, n in nuts.items():
        if n["cc"] != cc:
            continue
        x0, y0, x1, y1 = n["bbox"]
        if not (x0 <= lon <= x1 and y0 <= lat <= y1):
            continue
        for poly in n["polys"]:
            if point_in_ring(lon, lat, poly[0]) and not any(
                    point_in_ring(lon, lat, h) for h in poly[1:]):
                return nid, "polygon"
    best = None
    for nid, n in nuts.items():
        if n["cc"] != cc:
            continue
        cx, cy = n["centre"]
        d = (cx - lon) ** 2 * math.cos(math.radians(lat)) ** 2 + (cy - lat) ** 2
        if best is None or d < best[0]:
            best = (d, nid)
    return (best[1], "nearest") if best else (None, None)


def load_regions():
    """Region names, and UK (or other non-NUTS) region anchor points."""
    names, anchors = {}, defaultdict(list)
    for f in sorted(REGION_DIR.glob("*.json")):
        if f.name.startswith(("COAST", "GMBA")) or f.name == "index.json":
            continue
        d = load_json(f)
        r = d.get("region") or {}
        if r.get("kind") != "nuts2":
            continue
        names[r["id"]] = r.get("name") or r["id"]
        for it in (d.get("rated") or []) + (d.get("listed") or []):
            if it.get("lat") is not None and it.get("lon") is not None:
                anchors[r["country"]].append((it["lon"], it["lat"], r["id"]))
    return names, anchors


def nearest_anchor(anchors, lon, lat):
    best = None
    k = math.cos(math.radians(lat)) ** 2
    for x, y, rid in anchors:
        d = (x - lon) ** 2 * k + (y - lat) ** 2
        if best is None or d < best[0]:
            best = (d, rid)
    return best[1] if best else None


def outdoor_counts():
    """Rated items and photo share per country for each outdoor layer."""
    out = defaultdict(dict)
    for layer, key, img in (("trails", "trips", "img"), ("beaches", "beaches", "images"),
                            ("lakes", "lakes", "images"), ("mountains", "mountains", "images")):
        for f in sorted((PUBLIC / layer).glob("*.json")):
            if len(f.stem) != 2:
                continue
            d = load_json(f)
            items = d.get(key) or []
            n_img = sum(1 for it in items if it.get(img))
            out[f.stem][layer] = (len(items), n_img)
    return out


def outdoor_regions():
    """Per country and outdoor layer: (regions where the layer applies, empty)."""
    cov = load_json(COVERAGE)["regions"]
    out = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    for rid, r in cov.items():
        cc = CODE_FIX.get(rid[:2], rid[:2])
        for layer in OUTDOOR:
            cell = r.get(layer)
            if not isinstance(cell, dict) or cell.get("status") == "na":
                continue
            out[cc][layer][0] += 1
            if cell.get("status") == "empty":
                out[cc][layer][1] += 1
    return out


# ---------------------------------------------------------------- measuring

def place_fields(pid, rec):
    dpath = DOSSIER / (pid.replace(":", "-") + ".json")
    dos = load_json(dpath) if dpath.exists() else {}
    intro = dos.get("intro") or {}
    acc = rec.get("accommodation") or {}
    crowd = ((rec.get("crowding") or {}).get("monthly") or {}).get("share")
    return {
        "photo": bool((rec.get("image") or {}).get("url")),
        "gallery4": len(dos.get("gallery") or []) >= 4,
        "intro": bool(intro.get("body")),
        "intro_short": bool(intro.get("short")),
        "guide": bool((rec.get("guide") or {}).get("text")),
        "beds": acc.get("q") == "measured",
        "food_local": (rec.get("costs") or {}).get("level") in ("city", "region"),
        "climate": len((rec.get("climate") or {}).get("m") or []) == 12,
        "crowds": bool(crowd),
        "rating": (rec.get("rating") or {}).get("score") is not None,
    }


def share(n, d):
    return 100.0 * n / d if d else 0.0


def fmt(x, nd=0):
    if x is None:
        return "n/a"
    return f"{x:,.{nd}f}"


def build():
    data = load_json(APP_DATA)["destinations"]
    area_pop = load_area_pop()
    nights_raw = load_json(NIGHTS)
    nuts = load_nuts()
    region_names, anchors = load_regions()
    outdoor = outdoor_counts()
    out_regions = outdoor_regions()
    why = {lang: load_json(WHY / f"{lang}.json") for lang in LANGS}

    # Nights per NUTS3 and per country (Eurostat codes fixed to ISO).
    nights3, nights_cc, nights_years = {}, Counter(), defaultdict(set)
    for nid, v in nights_raw.items():
        cc = CODE_FIX.get(nid[:2], nid[:2])
        if v.get("nights"):
            nights3[nid] = v["nights"]
            nights_cc[cc] += v["nights"]
            nights_years[cc].add(v.get("year"))

    # Places, with fields and region.
    places = []
    name_of = {}
    for pid, rec in sorted(data.items()):
        cc = rec["iso2"]
        name_of[cc] = rec["country"]
        f = place_fields(pid, rec)
        n3 = (rec.get("crowding") or {}).get("nuts3")
        how = "crowding"
        # The crowding layer lends microstates a neighbour's NUTS 3 code;
        # only a code inside the place's own country counts here.
        # Airport-tier places carry the airport's point; the city's wins.
        lon = rec.get("city_lon") or rec["lon"]
        lat = rec.get("city_lat") or rec["lat"]
        if not n3 or n3 not in nuts or nuts[n3]["cc"] != cc:
            n3, how = find_nuts3(nuts, cc, lon, lat)
        if n3:
            region = n3[:4]
        elif anchors.get(cc):
            region, how = nearest_anchor(anchors[cc], lon, lat), "itl_nearest"
        else:
            region, how = cc + "-ALL", "country"
        places.append({"id": pid, "cc": cc, "region": region, "n3": n3, "how": how,
                       "fields": f, "score": (rec.get("rating") or {}).get("score"),
                       "why": {lang: (pid in why[lang]) for lang in LANGS}})

    by_cc = defaultdict(list)
    for p in places:
        by_cc[p["cc"]].append(p)
    total = len(places)

    # Country expectation.
    pops = {cc: area_pop.get(name_of[cc], (None, None))[1] for cc in by_cc}
    areas = {cc: area_pop.get(name_of[cc], (None, None))[0] for cc in by_cc}
    pop_sum = sum(v for v in pops.values() if v)
    area_sum = sum(v for v in areas.values() if v)
    pop_sh = {cc: (pops[cc] or 0) / pop_sum for cc in by_cc}
    area_sh = {cc: (areas[cc] or 0) / area_sum for cc in by_cc}
    held = [cc for cc in by_cc if nights_cc.get(cc)]
    held_nights = sum(nights_cc[cc] for cc in held)
    held_base = sum((pop_sh[cc] + area_sh[cc]) / 2 for cc in held)
    nights_sh = {}
    for cc in by_cc:
        if cc in held:
            # Scaled so the held countries carry the same weight in the
            # nights term as they do in the population and area terms.
            nights_sh[cc] = nights_cc[cc] / held_nights * held_base
        else:
            nights_sh[cc] = (pop_sh[cc] + area_sh[cc]) / 2

    def expect(wts):
        raw = {cc: wts["population"] * pop_sh[cc] + wts["area"] * area_sh[cc]
               + wts["nights"] * nights_sh[cc] for cc in by_cc}
        tot = sum(raw.values())
        return {cc: total * raw[cc] / tot for cc in by_cc}

    expected = expect(WEIGHTS)
    alt = [expect(wts) for wts in SENSITIVITY]

    # Catalogue-wide field shares.
    cat_share = {k: share(sum(p["fields"][k] for p in places), total) for k, _, _ in FIELDS}
    cat_share["intro_short"] = share(sum(p["fields"]["intro_short"] for p in places), total)

    countries = []
    for cc, rows in by_cc.items():
        n = len(rows)
        scores = sorted(p["score"] for p in rows if p["score"] is not None)
        q = statistics.quantiles(scores, n=4) if len(scores) >= 4 else None
        od = outdoor.get(cc, {})
        countries.append({
            "cc": cc, "name": name_of[cc], "n": n,
            "pop_m": pops[cc], "area": areas[cc],
            "nights_m": nights_cc[cc] / 1e6 if cc in held else None,
            "nights_years": sorted(y for y in nights_years.get(cc, ()) if y),
            "expected": expected[cc], "ratio": n / expected[cc] if expected[cc] else None,
            "robust": all(n < PLACE_GAP_RATIO * a[cc] for a in alt),
            "per_10k_km2": n / areas[cc] * 1e4 if areas[cc] else None,
            "per_m_res": n / pops[cc] if pops[cc] else None,
            "per_m_nights": n / (nights_cc[cc] / 1e6) if cc in held else None,
            "fields": {k: share(sum(p["fields"][k] for p in rows), n)
                       for k in [f[0] for f in FIELDS] + ["intro_short"]},
            "missing": {k: sum(1 for p in rows if not p["fields"][k]) for k, _, _ in FIELDS},
            "score_med": statistics.median(scores) if scores else None,
            "score_iqr": (q[0], q[2]) if q else None,
            "outdoor": {layer: od.get(layer, (0, 0)) for layer in
                        ("trails", "beaches", "lakes", "mountains")},
            "out_regions": {layer: tuple(out_regions.get(cc, {}).get(layer, (0, 0)))
                            for layer in OUTDOOR},
            "regions_n": len({p["region"] for p in rows}),
        })
    countries.sort(key=lambda c: -c["n"])

    # Region table: in-country expectation from nights and area shares.
    reg = defaultdict(lambda: {"n": 0, "cc": None})
    for p in places:
        r = reg[p["region"]]
        r["n"] += 1
        r["cc"] = p["cc"]
    # Every NUTS2 region of a catalogue country, held or not.
    reg_area, reg_nights = Counter(), Counter()
    for nid, nd in nuts.items():
        if nd["cc"] in by_cc:
            reg_area[nid[:4]] += nd["area"]
            reg_nights[nid[:4]] += nights3.get(nid, 0)
            if nid[:4] not in reg:
                reg[nid[:4]] = {"n": 0, "cc": nd["cc"]}
    # Named regions without tracked geometry are listed only for a country
    # whose places were placed by nearest region item (not polygon, not one
    # country bucket), so no region is counted twice.
    nuts_cc = {nd["cc"] for nd in nuts.values()}
    anchored = {p["cc"] for p in places if p["how"] == "itl_nearest"}
    for rid in region_names:
        cc = CODE_FIX.get(rid[:2], rid[:2])
        if cc in anchored and cc not in nuts_cc and rid not in reg:
            reg[rid] = {"n": 0, "cc": cc}
    regions = []
    by_cc_regions = defaultdict(list)
    for rid, r in reg.items():
        by_cc_regions[r["cc"]].append(rid)
    for cc, rids in by_cc_regions.items():
        n_cc = len(by_cc[cc])
        a_tot = sum(reg_area[r] for r in rids)
        nt_tot = sum(reg_nights[r] for r in rids)
        for rid in rids:
            if a_tot and nt_tot:
                w = 0.5 * reg_area[rid] / a_tot + 0.5 * reg_nights[rid] / nt_tot
                method = "area and nights"
            elif a_tot:
                w = reg_area[rid] / a_tot
                method = "area"
            else:
                w = 1 / len(rids)
                method = "equal split"
            exp_r = n_cc * w
            if reg_area.get(rid) and reg_area[rid] < CITY_REGION_KM2 and exp_r > CITY_REGION_CAP:
                exp_r = CITY_REGION_CAP
                method += ", city region capped"
            # UK NUTS 2 ids (UKM6) share their suffix with ITL 2 (TLM6).
            name = region_names.get(rid) or region_names.get("TL" + rid[2:]) or rid
            name = name.replace("\u2014", "-").replace("\u2013", "-")
            regions.append({
                "id": rid, "cc": cc, "name": name,
                "n": reg[rid]["n"], "expected": exp_r, "method": method,
                "area": reg_area.get(rid) or None,
                "nights_m": (reg_nights[rid] / 1e6) if reg_nights.get(rid) else None,
            })
    regions.sort(key=lambda r: (r["cc"], r["id"]))

    # Language table.
    languages = []
    for lang in LANGS:
        n_why = sum(1 for p in places if p["why"][lang])
        if lang == "en":
            n_intro = sum(1 for p in places if p["fields"]["intro"])
            n_short = sum(1 for p in places if p["fields"]["intro_short"])
        else:
            # The handbook (Discover, place page head): the intro shows in
            # English only and is hidden in other languages.
            n_intro = n_short = 0
        languages.append({"lang": lang, "why": n_why, "intro": n_intro, "short": n_short})

    gaps = build_gaps(countries, regions, languages, cat_share, total)
    assign = Counter(p["how"] for p in places)
    return {"countries": countries, "regions": regions, "languages": languages,
            "gaps": gaps, "total": total, "cat_share": cat_share, "assign": assign,
            "held": sorted(held), "not_held": sorted(set(by_cc) - set(held))}


# ---------------------------------------------------------------- gaps

def build_gaps(countries, regions, languages, cat_share, total):
    gaps = []
    for c in countries:
        if c["ratio"] is not None and c["ratio"] < PLACE_GAP_RATIO:
            short = c["expected"] - c["n"]
            robust = ("robust: a gap under every blend tested" if c["robust"]
                      else "not robust: some blends tested do not call it a gap")
            gaps.append({"kind": "country places", "item": "D15", "cc": c["cc"],
                         "scope": c["name"], "actual": c["n"],
                         "expected": round(c["expected"], 1), "places": round(short),
                         "note": f"{c['n']} places against a fair {c['expected']:.0f} "
                                 f"({c['ratio']:.2f} of expectation); {robust}"})
    for r in regions:
        # Area alone overweights empty uplands (the Highlands would "need"
        # 89 places), so only regions with a nights figure are tested.
        if not r["method"].startswith("area and nights"):
            continue
        if r["expected"] >= REGION_MIN_EXPECTED and r["n"] < REGION_GAP_RATIO * r["expected"]:
            short = r["expected"] - r["n"]
            gaps.append({"kind": "region places", "item": "D15", "cc": r["cc"],
                         "scope": f"{r['id']} {r['name']}", "actual": r["n"],
                         "expected": round(r["expected"], 1), "places": round(short),
                         "note": f"{r['n']} places against {r['expected']:.1f}; "
                                 f"basis {r['method']} within the country"})
    for c in countries:
        for key, label, item in FIELDS:
            have = c["fields"][key]
            target = cat_share[key]
            if target - have >= FIELD_GAP_POINTS:
                need = math.ceil((target - have) / 100 * c["n"])
                if need >= FIELD_MIN_MISSING:
                    gaps.append({"kind": "field", "item": item, "cc": c["cc"],
                                 "scope": f"{c['name']}: {label}", "actual": round(have, 1),
                                 "expected": round(target, 1), "places": need,
                                 "note": f"{have:.0f}% against the catalogue's {target:.0f}%; "
                                         f"{c['missing'][key]} places lack it"})
    # Outdoor: a country whose share of empty regions sits well above the
    # catalogue rate for that layer.
    agg = defaultdict(lambda: [0, 0])
    for c in countries:
        for layer, (appl, empty) in c["out_regions"].items():
            agg[layer][0] += appl
            agg[layer][1] += empty
    for c in countries:
        for layer, (appl, empty) in c["out_regions"].items():
            if appl < 3:
                continue
            rate = share(*agg[layer][::-1]) if agg[layer][0] else 0
            mine = share(empty, appl)
            if mine - rate >= FIELD_GAP_POINTS:
                excess = math.ceil((mine - rate) / 100 * appl)
                gaps.append({"kind": "outdoor regions", "item": "D7", "cc": c["cc"],
                             "scope": f"{c['name']}: {layer}", "actual": round(mine, 1),
                             "expected": round(rate, 1), "places": excess,
                             "note": f"{empty} of {appl} coverage units have no {layer} at all "
                                     f"({mine:.0f}% against {rate:.0f}% across the catalogue)"})
        # Trail photos (D7 names them per country).
        n_tr, n_img = c["outdoor"]["trails"]
        if n_tr >= 50:
            gaps_share = share(n_img, n_tr)
            gaps.append(None if gaps_share >= 25 else {
                "kind": "outdoor photos", "item": "D7", "cc": c["cc"],
                "scope": f"{c['name']}: trail photos", "actual": round(gaps_share, 1),
                "expected": 25.0, "places": math.ceil(0.25 * n_tr) - n_img,
                "note": f"{n_img} of {n_tr} rated trails have a photo"})
    en = next(lang for lang in languages if lang["lang"] == "en")
    for lang in languages:
        if lang["lang"] == "en":
            continue
        if lang["intro"] < en["intro"]:
            gaps.append({"kind": "language", "item": "I8", "cc": "",
                         "scope": f"{lang['lang']}: place intro", "actual": lang["intro"],
                         "expected": en["intro"], "places": en["intro"] - lang["intro"],
                         "note": "intro shows in English only; translate the sourced intros"})
        if lang["why"] < en["why"]:
            gaps.append({"kind": "language", "item": "I8", "cc": "",
                         "scope": f"{lang['lang']}: why line", "actual": lang["why"],
                         "expected": en["why"], "places": en["why"] - lang["why"],
                         "note": "why line missing in this language"})
    gaps = [g for g in gaps if g]
    # Rank: place gaps first (D15 works them), then by places affected.
    order = {"country places": 0, "region places": 1, "field": 2,
             "outdoor regions": 3, "outdoor photos": 4, "language": 5}
    gaps.sort(key=lambda g: (order[g["kind"]], -g["places"], g["cc"], g["scope"]))
    for i, g in enumerate(gaps, 1):
        g["rank"] = i
        g["id"] = f"D6-{i:03d}"
    return gaps


# ---------------------------------------------------------------- writing

def render_md(res):
    c_rows = res["countries"]
    L = []
    w = L.append
    w("# Coverage parity")
    w("")
    w("Generated by `scripts/coverage/coverage_parity.py` (ROADMAP D6, T1145). Do not edit by "
      "hand: rerun the script. The ranked backlog is also in `coverage-parity.csv` beside this "
      "file, one line per gap, and D15 (catalogue gaps) works from its place lines.")
    w("")
    w(f"Catalogue: {res['total']:,} places in {len(c_rows)} countries, "
      f"{len(res['regions'])} regions, {len(res['languages'])} languages. "
      f"Gaps found: {len(res['gaps'])}.")
    w("")
    w("## Method")
    w("")
    w("**Fair expectation per country.** A country's fair share of the catalogue is a weighted mean "
      "of three shares: its share of residents, of land area and of tourist nights across the "
      "catalogue's countries, weighted population 0.25, area 0.25 and nights 0.5 (nights measure "
      "travel demand directly; population and area keep a large country with few visitors in "
      "view). Expected places = catalogue size times that share. Population and "
      "area come from the reference table `COUNTRY_AREA_POP` in "
      "`pipeline/diagnostics/coverage_report.py` (World Bank and national statistics, mid-2020s, "
      "imported, never copied). Tourist nights are Eurostat `tour_occ_nin3` (nights spent at "
      "tourist accommodation, NUTS 3, latest year per region, 2022 to 2025), read from the "
      "tracked `cache/eurostat_nights_nuts3.json`; licence: Eurostat reuse policy, CC BY 4.0. "
      f"Eurostat holds no nights for {', '.join(res['not_held'])}; for those the nights share "
      "is the mean of their population and area shares, so they are judged on two terms, not "
      "penalised for a missing third.")
    w("")
    w(f"- A country under {PLACE_GAP_RATIO:.2f} of its expectation is a place gap (D15). The "
      "gap is also tested under three other blends (equal thirds; population and nights half "
      "each; nights alone) and marked robust when it holds under all of them.")
    w("- Regions are NUTS 2. A place (at its city point where it has one) takes the NUTS 3 "
      "code its crowding block carries when that code is in its own country, else the GISCO "
      "NUTS 2021 polygon it falls in (tracked `cache/nuts3_2021.geojson`, EuroGeographics "
      "notice; the 2021 set still holds the UK codes, whose suffixes match ITL 2), else the "
      "nearest NUTS 3 centre in its country (`nearest`). A country with no NUTS polygon but "
      "region pages takes the region of the nearest located item in `public/region/` "
      "(`itl_nearest`, Kosovo); one with neither counts as one region (`country`). The French "
      "outermost regions (FRY) are outside the catalogue's Europe and left out. Assignment: "
      + ", ".join(f"{k} {v:,}" for k, v in sorted(res["assign"].items())) + ".")
    w(f"- A region's expectation is its country's places times the mean of its share of the "
      f"country's area and nights (area alone where nights are missing, an equal split where "
      f"both are missing). A region with an expectation of {REGION_MIN_EXPECTED:.0f} or more that holds "
      f"under {REGION_GAP_RATIO:.0%} of it is a region gap (D15). A city region (under "
      f"{CITY_REGION_KM2:,.0f} km2, such as Praha or Wien) is one city and so one place, however many "
      f"nights it draws: its expectation is capped at {CITY_REGION_CAP:.0f}. Only regions with a nights "
      f"figure are tested: area alone would ask for dozens of places in empty uplands. The "
      f"United Kingdom, Bosnia and Herzegovina, Kosovo, Moldova and the microstates are listed "
      f"but not tested until regional nights exist for them (D11).")
    w(f"- A field is a gap in a country when its share sits {FIELD_GAP_POINTS:.0f} points or more "
      f"under the catalogue share and {FIELD_MIN_MISSING} or more places are short.")
    w("- Outdoor: `public/coverage.json` gives each coverage unit (NUTS 3, coast or range) a "
      "status per layer and marks a layer `na` where it does not apply (beaches include lake "
      "bathing spots, so an inland unit can be `empty`). A country whose "
      f"share of empty units (`na` excluded) is {FIELD_GAP_POINTS:.0f} points "
      "over the catalogue rate is a gap; so is a country with 50 or more rated trails where under "
      "25% carry a photo.")
    w("- Languages: the why line per language from `public/app_data/why_i18n/`; the intro from "
      "each place's dossier, shown in English only (handbook, Discover).")
    w("- Ranking: place gaps first (they feed D15), then fields, outdoor and language; inside "
      "each kind, by the number of places (or regions, or items) short.")
    w("- Not measured here: Ask recall per language needs the E1 question set (register row "
      "T1145-c). Field shares are what the wire holds, not what is true (D4 checks truth).")
    w("")
    w("## Countries")
    w("")
    w("| CC | Country | Places | Expected | Ratio | Robust gap | Per 10k km2 | Per m residents | "
      "Per m nights | Regions held | Score median (IQR) |")
    w("|---|---|---|---|---|---|---|---|---|---|---|")
    for c in c_rows:
        iqr = (f"{c['score_med']:.1f} ({c['score_iqr'][0]:.1f} to {c['score_iqr'][1]:.1f})"
               if c["score_iqr"] else fmt(c["score_med"], 1))
        exp_s = f"{c['expected']:.0f}" if c["expected"] >= 1 else "under 1"
        ratio_s = f"{c['ratio']:.2f}" if c["expected"] >= 1 else "n/a"
        gap_s = ("yes" if c["robust"] else "no") if c["ratio"] < PLACE_GAP_RATIO else ""
        w(f"| {c['cc']} | {c['name']} | {c['n']} | {exp_s} | {ratio_s} | {gap_s} | "
          f"{fmt(c['per_10k_km2'], 1)} | {fmt(c['per_m_res'], 1)} | {fmt(c['per_m_nights'], 2)} | "
          f"{c['regions_n']} | {iqr} |")
    w("")
    w("### Field completeness per country (% of places)")
    w("")
    keys = [f[0] for f in FIELDS]
    w("| CC | " + " | ".join(f[1] for f in FIELDS) + " |")
    w("|---|" + "---|" * len(keys))
    w("| All | " + " | ".join(f"{res['cat_share'][k]:.0f}" for k in keys) + " |")
    for c in c_rows:
        cells = []
        for k in keys:
            v = c["fields"][k]
            mark = " *" if res["cat_share"][k] - v >= FIELD_GAP_POINTS else ""
            cells.append(f"{v:.0f}{mark}")
        w(f"| {c['cc']} | " + " | ".join(cells) + " |")
    w("")
    w(f"A star marks a share {FIELD_GAP_POINTS:.0f} points or more under the catalogue's.")
    w("")
    w("### Outdoor per country")
    w("")
    w("Rated items in the wire (photo share in brackets), then empty coverage units out of the "
      "units where the layer applies, from `public/coverage.json`.")
    w("")
    w("| CC | Trails | Beaches | Lakes | Mountains | Empty: trail | beach | lake | mountain "
      "| cycling |")
    w("|---|---|---|---|---|---|---|---|---|---|")
    for c in c_rows:
        od = c["outdoor"]
        cells = [f"{n} ({share(i, n):.0f}%)" if n else "0" for n, i in
                 (od["trails"], od["beaches"], od["lakes"], od["mountains"])]
        er = [f"{e} of {a}" if a else "n/a" for a, e in
              (c["out_regions"][layer] for layer in OUTDOOR)]
        w(f"| {c['cc']} | " + " | ".join(cells + er) + " |")
    w("")
    w("## Languages")
    w("")
    w("| Language | Why line | Sourced intro | Short intro |")
    w("|---|---|---|---|")
    for lang in res["languages"]:
        w(f"| {lang['lang']} | {lang['why']:,} | {lang['intro']:,} | {lang['short']:,} |")
    w("")
    w("## Regions")
    w("")
    w("Every region of a catalogue country, held or not. Expected is in-country (it shares out "
      "the country's own places), so a region gap means uneven spread, not a small country.")
    w("")
    w("| Region | Name | CC | Places | Expected | Basis | Area km2 | Nights (m) |")
    w("|---|---|---|---|---|---|---|---|")
    for r in res["regions"]:
        w(f"| {r['id']} | {r['name']} | {r['cc']} | {r['n']} | {r['expected']:.1f} | "
          f"{r['method']} | {fmt(r['area'])} | {fmt(r['nights_m'], 2)} |")
    w("")
    w("## Backlog")
    w("")
    w("One line per gap, ranked. `Item` is the roadmap item that fills it. `Short` counts places "
      "(coverage units for outdoor regions, trails for photos).")
    w("")
    w("| ID | Kind | Item | Scope | Actual | Expected | Short | Note |")
    w("|---|---|---|---|---|---|---|---|")
    for g in res["gaps"]:
        w(f"| {g['id']} | {g['kind']} | {g['item']} | {g['scope']} | {g['actual']} | "
          f"{g['expected']} | {g['places']} | {g['note']} |")
    w("")
    return "\n".join(L)


def render_csv(res):
    buf = io.StringIO()
    cols = ["id", "rank", "kind", "item", "cc", "scope", "actual", "expected", "places", "note"]
    wr = csv.DictWriter(buf, fieldnames=cols, lineterminator="\n")
    wr.writeheader()
    for g in res["gaps"]:
        wr.writerow({k: g[k] for k in cols})
    return buf.getvalue()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true",
                    help="exit 1 if the written files are out of date")
    args = ap.parse_args(argv)
    res = build()
    md, cs = render_md(res), render_csv(res)
    if args.check:
        stale = [p for p, body in ((OUT_MD, md), (OUT_CSV, cs))
                 if not p.exists() or p.read_text(encoding="utf-8") != body]
        for p in stale:
            print(f"out of date: {p.relative_to(ROOT)}")
        return 1 if stale else 0
    OUT_MD.write_text(md, encoding="utf-8")
    OUT_CSV.write_text(cs, encoding="utf-8")
    print(f"{len(res['countries'])} countries, {len(res['regions'])} regions, "
          f"{len(res['gaps'])} gaps -> {OUT_MD.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
