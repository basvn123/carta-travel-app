"""audit_quality.py - data-quality audit of the destination/POI master.

Read-only scorecard over app_data/app_data.json covering the classic quality
dimensions: validity (coordinates), uniqueness (in-city duplicate POIs),
completeness (signal coverage per country), consistency (rate distribution,
kind vocabulary) and image coverage. Writes a JSON report for the cleanup
passes to consume and prints a human summary. Nothing here modifies data.

Checks:
  coords    null island, missing/NaN, outside the Europe bbox (Canaries and
            Azores included), POI displaced > FAR_KM from its dest centre
  dupes     candidate duplicate POI pairs inside one destination: normalized
            name similarity + coordinate proximity (two blocking passes:
            same-name anywhere in town, fuzzy-name within DUP_RADIUS_M)
  rates     per-dest rate-3 share (a town where half the catalogue is "top
            sight" has an inflated tier signal), dests with no rate-3 at all
  kinds     kind vocabulary distribution + unknown/missing kinds
  coverage  per-country % of POIs with wiki / img / desc / heritage, and
            per-dest completeness worst offenders
  images    rate-3 POIs without an image (the cards that matter most)

Usage:
    python audit_quality.py                 # full report
    python audit_quality.py --country FR    # restrict to one country
    python audit_quality.py --top 25        # how many worst offenders to list

Output: logs/audit_quality_report.json + console summary.
"""
import argparse
import json
import math
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "app_data" / "app_data.json"
OUT = ROOT / "logs" / "audit_quality_report.json"

# Europe bbox with the Atlantic islands (Canaries lat ~27.6, Azores lon ~-31.3)
BBOX = (-32.0, 27.0, 45.0, 72.0)          # lon_min, lat_min, lon_max, lat_max
FAR_KM = 50.0                             # POI farther than this from centre
DUP_RADIUS_M = 150.0                      # fuzzy-name duplicate search radius
NAME_SIM_FLAG = 0.82                      # normalized-name similarity cutoff
RATE3_SHARE_FLAG = 0.45                   # dest rate-3 share above this = inflated

# Latin fold for letters NFKD leaves alone (the l-with-stroke gotcha).
_FOLD = str.maketrans({
    "ł": "l", "Ł": "L", "ø": "o", "Ø": "O",
    "đ": "d", "Đ": "D", "þ": "th", "Þ": "Th",
    "ð": "d", "Ð": "D", "æ": "ae", "Æ": "Ae",
    "ı": "i", "ß": "ss",
})
_STRIP = re.compile(r"[^a-z0-9 ]+")
_STOP = re.compile(r"\b(the|le|la|les|el|los|il|de|du|des|of|di|da|von|van)\b")


def norm_name(s):
    s = (s or "").translate(_FOLD)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = _STRIP.sub(" ", s)
    s = _STOP.sub(" ", s)
    return " ".join(s.split())


def trigrams(s):
    s = f"  {s} "
    return {s[i:i + 3] for i in range(len(s) - 2)}


def tri_sim(a, b):
    ta, tb = trigrams(a), trigrams(b)
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    return inter / (len(ta) + len(tb) - inter)


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(min(1.0, math.sqrt(h)))


def is_bad_num(v):
    return v is None or not isinstance(v, (int, float)) or math.isnan(v)


def dest_centre(d):
    for la, lo in (("city_lat", "city_lon"), ("lat", "lon")):
        if not is_bad_num(d.get(la)) and not is_bad_num(d.get(lo)):
            return d[la], d[lo]
    return None


def audit(dests, top_n):
    rep = {
        "totals": {"dests": len(dests), "pois": 0},
        "coords": {"missing": [], "null_island": [], "out_of_bbox": [],
                   "far_from_centre": []},
        "dupes": {"pairs": 0, "dests_affected": 0, "examples": []},
        "rates": {"dist": Counter(), "inflated_dests": [], "no_rate3_dests": []},
        "kinds": {"missing": 0, "vocab": Counter()},
        "coverage": {"by_country": {}, "worst_dests": []},
        "images": {"rate3_no_img": 0, "rate3_no_img_examples": []},
    }
    cov_country = defaultdict(lambda: Counter())
    dest_scores = []
    dup_examples = []
    dup_dests = set()

    for did, d in dests.items():
        items = (d.get("activities") or {}).get("items_full") or []
        rep["totals"]["pois"] += len(items)
        centre = dest_centre(d)
        cc = d.get("iso2") or d.get("country") or "??"
        c = cov_country[cc]

        n_r3 = 0
        # per-dest coordinate + coverage sweep
        for it in items:
            la, lo = it.get("lat"), it.get("lon")
            label = f"{did}: {it.get('name')}"
            if is_bad_num(la) or is_bad_num(lo):
                rep["coords"]["missing"].append(label)
            elif la == 0 and lo == 0:
                rep["coords"]["null_island"].append(label)
            elif not (BBOX[0] <= lo <= BBOX[2] and BBOX[1] <= la <= BBOX[3]):
                rep["coords"]["out_of_bbox"].append(f"{label} ({la:.3f},{lo:.3f})")
            elif centre:
                dk = haversine_km(centre[0], centre[1], la, lo)
                if dk > FAR_KM:
                    rep["coords"]["far_from_centre"].append(
                        f"{label} ({dk:.0f} km)")
            rate = it.get("rate")
            rep["rates"]["dist"][rate] += 1
            if rate == 3:
                n_r3 += 1
                if not it.get("img"):
                    rep["images"]["rate3_no_img"] += 1
                    if len(rep["images"]["rate3_no_img_examples"]) < top_n:
                        rep["images"]["rate3_no_img_examples"].append(label)
            kind = it.get("kind")
            if not kind:
                rep["kinds"]["missing"] += 1
            else:
                rep["kinds"]["vocab"][kind] += 1
            c["pois"] += 1
            for f in ("wiki", "img", "desc", "heritage"):
                if it.get(f):
                    c[f] += 1

        if items:
            share = n_r3 / len(items)
            if share > RATE3_SHARE_FLAG and len(items) >= 10:
                rep["rates"]["inflated_dests"].append(
                    (did, round(share, 2), len(items)))
            if n_r3 == 0 and len(items) >= 6:
                rep["rates"]["no_rate3_dests"].append(did)
            filled = sum(1 for it in items
                         for f in ("wiki", "img", "desc") if it.get(f))
            dest_scores.append((did, round(filled / (3 * len(items)), 3),
                                len(items)))

        # duplicate detection inside the destination
        buckets = defaultdict(list)
        pts = []
        for i, it in enumerate(items):
            nn = norm_name(it.get("name"))
            if not nn:
                continue
            buckets[nn].append(i)
            if not is_bad_num(it.get("lat")) and not is_bad_num(it.get("lon")):
                pts.append((i, nn, it["lat"], it["lon"]))
        pairs = set()
        for nn, idxs in buckets.items():
            if len(idxs) > 1:
                for a in range(len(idxs)):
                    for b in range(a + 1, len(idxs)):
                        pairs.add((idxs[a], idxs[b], 1.0))
        # fuzzy pass, blocked by a coarse geo grid (~200 m cells)
        grid = defaultdict(list)
        for rec in pts:
            key = (int(rec[2] / 0.002), int(rec[3] / 0.003))
            grid[key].append(rec)
        seen = set()
        for key, cell in grid.items():
            neigh = []
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    neigh.extend(grid.get((key[0] + dx, key[1] + dy), []))
            for i, nni, lai, loi in cell:
                for j, nnj, laj, loj in neigh:
                    if j <= i or (i, j) in seen:
                        continue
                    seen.add((i, j))
                    if nni == nnj:
                        continue        # already caught by the exact pass
                    if haversine_km(lai, loi, laj, loj) * 1000 > DUP_RADIUS_M:
                        continue
                    sim = tri_sim(nni, nnj)
                    if sim >= NAME_SIM_FLAG:
                        pairs.add((i, j, round(sim, 2)))
        if pairs:
            dup_dests.add(did)
            rep["dupes"]["pairs"] += len(pairs)
            for i, j, sim in list(pairs)[:2]:
                if len(dup_examples) < top_n:
                    dup_examples.append(
                        f"{did}: '{items[i].get('name')}' ~ "
                        f"'{items[j].get('name')}' (sim {sim})")

    rep["dupes"]["dests_affected"] = len(dup_dests)
    rep["dupes"]["examples"] = dup_examples
    rep["rates"]["inflated_dests"].sort(key=lambda t: -t[1])
    dest_scores.sort(key=lambda t: t[1])
    rep["coverage"]["worst_dests"] = dest_scores[:top_n]
    for cc, c in sorted(cov_country.items()):
        n = c["pois"] or 1
        rep["coverage"]["by_country"][cc] = {
            "pois": c["pois"],
            "pct_wiki": round(c["wiki"] / n, 3),
            "pct_img": round(c["img"] / n, 3),
            "pct_desc": round(c["desc"] / n, 3),
            "pct_heritage": round(c["heritage"] / n, 3),
        }
    return rep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--country")
    ap.add_argument("--top", type=int, default=15)
    args = ap.parse_args()

    data = json.loads(DATA.read_text(encoding="utf-8"))
    dests = data["destinations"]
    if args.country:
        dests = {k: v for k, v in dests.items()
                 if (v.get("iso2") or v.get("country")) == args.country}

    rep = audit(dests, args.top)

    # console summary
    t = rep["totals"]
    print(f"destinations {t['dests']}, POIs {t['pois']}")
    co = rep["coords"]
    print(f"\ncoords: {len(co['missing'])} missing, "
          f"{len(co['null_island'])} null-island, "
          f"{len(co['out_of_bbox'])} outside Europe bbox, "
          f"{len(co['far_from_centre'])} farther than {FAR_KM:.0f} km from centre")
    for k in ("out_of_bbox", "far_from_centre"):
        for line in co[k][:args.top]:
            print(f"   {k}: {line}")
    du = rep["dupes"]
    print(f"\nduplicates: {du['pairs']} candidate pairs across "
          f"{du['dests_affected']} destinations")
    for line in du["examples"]:
        print(f"   {line}")
    ra = rep["rates"]
    print(f"\nrate distribution: { {k: v for k, v in sorted(ra['dist'].items(), key=lambda x: str(x[0]))} }")
    n_pois = t["pois"] or 1
    r3 = ra["dist"].get(3, 0)
    print(f"rate-3 share overall: {r3 / n_pois:.1%}")
    print(f"inflated dests (rate-3 share > {RATE3_SHARE_FLAG:.0%}): "
          f"{len(ra['inflated_dests'])}")
    for did, share, n in ra["inflated_dests"][:args.top]:
        print(f"   {did}: {share:.0%} of {n}")
    print(f"dests with no rate-3 sight: {len(ra['no_rate3_dests'])}")
    print(f"\nkinds: {rep['kinds']['missing']} missing; "
          f"{len(rep['kinds']['vocab'])} distinct kinds")
    im = rep["images"]
    print(f"images: {im['rate3_no_img']} rate-3 POIs without an image")
    print("\ncoverage by country (pois / wiki / img / desc / heritage):")
    for cc, c in sorted(rep["coverage"]["by_country"].items(),
                        key=lambda x: -x[1]["pois"])[:args.top]:
        print(f"   {cc:4} {c['pois']:6}  {c['pct_wiki']:.0%} / {c['pct_img']:.0%}"
              f" / {c['pct_desc']:.0%} / {c['pct_heritage']:.0%}")
    print("\nleast-complete dests (filled wiki+img+desc share):")
    for did, s, n in rep["coverage"]["worst_dests"]:
        print(f"   {did}: {s:.0%} of {n} POIs")

    rep["rates"]["dist"] = {str(k): v for k, v in rep["rates"]["dist"].items()}
    rep["kinds"]["vocab"] = dict(rep["kinds"]["vocab"].most_common())
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(rep, indent=1, ensure_ascii=False),
                   encoding="utf-8")
    print(f"\nreport -> {OUT}")


if __name__ == "__main__":
    main()
