"""promote_place_candidates.py - turn ranked coverage gaps into gem specs.

The last step of the coverage loop, and the only one that can change what the
app ships, so it is deliberately the most cautious. It does NOT write the
catalogue. It writes a spec file in the exact shape
pipeline/oneoff/add_gems_from_json.py already consumes, and prints the command
that would apply it. Insertion stays on the one proven code path that built
every gem in the catalogue today.

    python pipeline/build_place_candidates.py
    python pipeline/harvest_place_signals.py
    python pipeline/score_place_candidates.py
    python pipeline/promote_place_candidates.py --country FR --top 25   <- here
    python pipeline/oneoff/add_gems_from_json.py app_data/new_gems_<date>.json

What it derives for each promoted candidate:

  anchor      the nearest reachable airport-tier destination, same country
              preferred. Everything downstream hangs off this: the gem copies
              the anchor's routes, costs and accommodation, and its ground leg
              is priced from the distance between them.
  minutes     drive time at 62 km/h over straight-line distance x 1.25, which
              is the road-winding factor the car layer already assumes.
  eur         ground transfer, ~0.42 EUR/km, floored at 5 and capped at 55.
              An estimate, and flagged as one: the ground-fare resolver
              re-prices these properly once the destination exists.
  categories  from the registers it belongs to, the POI categories it scored
              on, and its size class. Controlled vocabulary only, checked
              against meta.categories.
  blurb       provisional and marked as such. It states what is verifiably
              true (which register, what is there) and nothing more, because
              a made-up sentence about a village nobody on the team has seen
              is exactly the kind of thing this catalogue cannot afford. The
              Wikivoyage guide pass overwrites it with something real.

Nothing is promoted that the report did not rank, that sits inside an
existing destination's coverage radius, or that has no anchor within
ANCHOR_MAX_KM. Everything promoted is listed with its reason so the diff is
reviewable line by line.

Usage:
    python pipeline/promote_place_candidates.py --country FR --top 25
    python pipeline/promote_place_candidates.py --min-worth 0.55 --per-country 8
    python pipeline/promote_place_candidates.py --approve app_data/approved.json
"""
import argparse
import json
import math
import re
import sys
import time
import unicodedata
from collections import defaultdict
from pathlib import Path

from pipeline_io import atomic_write_json, load_json

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "app_data" / "app_data.json"
GAPS = ROOT / "data" / "reports" / "coverage_gaps.json"

ANCHOR_MAX_KM = 220.0     # beyond this a gem's copied fares mean nothing
DRIVE_KMH = 62.0
ROAD_FACTOR = 1.25
EUR_PER_KM = 0.42
EUR_MIN, EUR_MAX = 5, 55
MIN_WORTH = 0.45          # floor for anything promoted, whatever the flags say

# Registers -> the catalogue's existing category vocabulary.
KIND_CATEGORIES = {
    "beautiful_village": ["village", "historic"],
    "heritage_town": ["town", "historic"],
    "unesco_whc": ["unesco", "historic"],
    "unesco_tentative": ["historic"],
    "spa_town": ["town", "thermal"],
    "national_park": ["national-park", "nature"],
    "cittaslow": ["town", "quiet"],
    "market_town": ["town"],
    "capital_of_culture": ["city", "art"],
}
# Overture POI categories -> the same vocabulary.
CAT_CATEGORIES = {
    "castle": ["castle"], "palace": ["historic"], "monument": ["historic"],
    "church_cathedral": ["cathedral"], "museum": ["art"], "art_museum": ["art"],
    "art_gallery": ["art"], "beach": ["beach", "coast"],
    "national_park": ["national-park", "nature"], "park": ["nature"],
    "landmark_and_historical_building": ["historic"],
}
SIZE_CATEGORY = {"metro": "city", "city": "city", "town": "town",
                 "village": "village", "area": "nature"}


def slugify(name):
    s = unicodedata.normalize("NFKD", name or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.replace("ł", "l").replace("Ł", "L").replace("ø", "o").replace("đ", "d")
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    return s or "place"


def haversine(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2)
         * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(a))


def anchors_from(dests):
    """Airport-tier destinations a new gem can hang off.

    Note what is NOT tested here: whether the anchor carries fares in the
    master. Only 107 of 260 airports do, and the missing ones include Orly,
    Charles de Gaulle, Beauvais and Charleroi, because `routes` is rebuilt per
    origin at runtime by hydrateForOrigin and the stored blob is a leftover.
    Gating on it rejected Versailles, Bourges, Oviedo and Eisenach for having
    "no fares" at Paris and Oviedo, which is nonsense. Reachability is what
    matters, and `no_ryanair_route` is the field that actually records it.
    """
    out = []
    for did, d in dests.items():
        if d.get("tier") != "airport":
            continue
        lat, lon = d.get("lat"), d.get("lon")
        if lat is None or lon is None:
            continue
        out.append((did, float(lat), float(lon),
                    not d.get("no_ryanair_route"), d.get("iso2")))
    return out


def pick_anchor(lat, lon, iso2, anchors):
    """Nearest reachable airport; same country strongly preferred."""
    best = None
    for did, alat, alon, reachable, aiso in anchors:
        km = haversine(lat, lon, alat, alon)
        if km > ANCHOR_MAX_KM:
            continue
        # A cross-border anchor is real (Basel serves Alsace) but is a worse
        # default, so it pays a penalty rather than being banned.
        cost = km * (1.0 if aiso == iso2 else 1.5) * (1.0 if reachable else 3.0)
        if best is None or cost < best[0]:
            best = (cost, did, km, reachable)
    return best


def categories_for(row, size_class):
    cats = []
    for d in row.get("designations") or []:
        cats += KIND_CATEGORIES.get(d.get("kind"), [])
    for c in (row.get("top_cats") or [])[:3]:
        cats += CAT_CATEGORIES.get(c, [])
    cats.append(SIZE_CATEGORY.get(size_class, "town"))
    out = []
    for c in cats:
        if c not in out:
            out.append(c)
    return out[:6]


def size_class_for(pop):
    if not pop:
        return "area"
    if pop >= 300000:
        return "metro"
    if pop >= 50000:
        return "city"
    if pop >= 8000:
        return "town"
    return "village"


def blurb_for(row):
    """A provisional line that states only what was measured.

    Deliberately dull. The Wikivoyage pass replaces it with a real one, and
    until then it is better for a card to read plainly than to read like a
    brochure entry somebody invented.
    """
    names = {d.get("kind") for d in (row.get("designations") or [])}
    parts = []
    if "beautiful_village" in names:
        parts.append("One of the country's officially listed most beautiful villages")
    elif "unesco_whc" in names:
        parts.append("A UNESCO World Heritage site")
    elif "heritage_town" in names:
        parts.append("A listed heritage town")
    elif "spa_town" in names:
        parts.append("One of the Great Spa Towns of Europe")
    else:
        parts.append("A place with more to see than its size suggests")
    tops = [c.replace("_", " ") for c in (row.get("top_cats") or [])[:2]]
    if tops:
        parts.append("known for its " + " and ".join(tops))
    return ", ".join(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--country", default="", help="ISO2 subset, comma separated")
    ap.add_argument("--top", type=int, default=0, help="best N overall")
    ap.add_argument("--per-country", type=int, default=0, help="best N per country")
    ap.add_argument("--min-worth", type=float, default=0.55)
    ap.add_argument("--approve", default="",
                    help="JSON list of candidate keys to promote, ignoring ranks")
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    gaps = load_json(GAPS)
    if not gaps:
        raise SystemExit(f"missing {GAPS} - run score_place_candidates.py first")
    data = load_json(MASTER)
    dests = data.get("destinations") or {}
    anchors = anchors_from(dests)
    vocab = set(data.get("meta", {}).get("categories") or [])
    existing_slugs = {did.split(":", 1)[1] for did in dests if did.startswith("gem:")}
    reachable = sum(1 for a in anchors if a[3])
    print(f"{len(anchors)} anchor airports ({reachable} reachable), "
          f"{len(dests)} destinations already shipped")

    rows = gaps["gaps"]
    if args.approve:
        want = set(load_json(args.approve) or [])
        rows = [r for r in rows if r["key"] in want]
        print(f"approve list: {len(want)} keys, {len(rows)} found in the report")
    else:
        floor = max(args.min_worth, MIN_WORTH)
        rows = [r for r in rows if r["worth"] >= floor]
        if args.country:
            want = {c.strip().upper() for c in args.country.split(",") if c.strip()}
            rows = [r for r in rows if r["iso2"] in want]
        if args.per_country:
            by = defaultdict(list)
            for r in rows:
                by[r["iso2"]].append(r)
            rows = [r for cc in by for r in by[cc][:args.per_country]]
            rows.sort(key=lambda r: -r["worth"])
        if args.top:
            rows = rows[:args.top]

    specs, skipped = [], []
    seen = set()
    for r in rows:
        # A cluster has a POI's name, not a place's: never promotable unnamed.
        if r["track"] == "cluster":
            skipped.append((r["name"], "cluster track has no place name"))
            continue
        slug = slugify(r["name"])
        if slug in existing_slugs or slug in seen:
            skipped.append((r["name"], f"slug '{slug}' already exists"))
            continue
        best = pick_anchor(r["lat"], r["lon"], r["iso2"], anchors)
        if not best:
            skipped.append((r["name"], f"no anchor within {ANCHOR_MAX_KM:.0f} km"))
            continue
        _cost, anchor_id, km, reachable = best
        if not reachable:
            skipped.append((r["name"], f"nearest anchor {anchor_id} is unreachable"))
            continue
        seen.add(slug)
        size_class = size_class_for(r["pop"])
        cats = categories_for(r, size_class)
        unknown = [c for c in cats if vocab and c not in vocab]
        road_km = km * ROAD_FACTOR
        specs.append({
            "slug": slug,
            "city": r["name"],
            "wiki": r["name"],
            "country": None,        # filled below from the anchor's country
            "iso2": r["iso2"],
            "lat": r["lat"],
            "lon": r["lon"],
            "categories": cats,
            "blurb": blurb_for(r),
            "anchor": anchor_id,
            "minutes": max(20, int(round(road_km / DRIVE_KMH * 60))),
            "eur": int(max(EUR_MIN, min(EUR_MAX, round(road_km * EUR_PER_KM)))),
            "_worth": r["worth"],
            "_pop": r["pop"],
            "_intensity": r["intensity"],
            "_designations": sorted({d["kind"] for d in (r.get("designations") or [])}),
            "_anchor_km": round(km, 1),
            "_unknown_categories": unknown,
            "_blurb_provisional": True,
        })

    iso_country = {}
    for d in dests.values():
        if d.get("iso2") and d.get("country"):
            iso_country.setdefault(d["iso2"], d["country"])
    for s in specs:
        s["country"] = iso_country.get(s["iso2"]) or s["iso2"]

    out = Path(args.out) if args.out else (
        ROOT / "app_data" / f"new_gems_{time.strftime('%Y%m%d')}.json")
    atomic_write_json(out, specs)

    print(f"\n{len(specs)} promotable, {len(skipped)} skipped")
    for s in specs:
        why = ", ".join(s["_designations"]) or f"{s['_intensity']:.0f}x its size"
        print(f"  {s['city'][:26]:26s} {s['iso2']}  worth {s['_worth']:.3f}  "
              f"anchor {s['anchor']} {s['_anchor_km']:>5.1f} km  {why}")
    if skipped:
        print("\nskipped:")
        for name, why in skipped[:20]:
            print(f"  {name[:32]:32s} {why}")
        if len(skipped) > 20:
            print(f"  ... and {len(skipped) - 20} more")
    bad = [s for s in specs if s["_unknown_categories"]]
    if bad:
        print(f"\n! {len(bad)} specs use categories outside meta.categories:")
        for s in bad[:10]:
            print(f"  {s['city']}: {s['_unknown_categories']}")

    try:
        shown = out.relative_to(ROOT)
    except ValueError:
        shown = out              # a dry run written outside the repo
    print(f"\nwrote {shown}")
    print("review it, then:")
    print(f"  python pipeline/oneoff/add_gems_from_json.py {shown}")
    print("then the enrichment chain, one at a time (they all write the master):")
    print("  harvest_images -> harvest_activities -> harvest_geonames -> "
          "apply_beauty_layer -> apply_designations -> apply_place_layer -> "
          "apply_rating_layer -> npm run data")


if __name__ == "__main__":
    main()
