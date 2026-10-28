"""Three POI labels in place of scores (Carta rating v5, batch R3, T761).

Scoring 150,000 POIs on a ten-point scale says more than the data knows. A
traveller needs to know which few things in a place they must not miss, which
are worth their time, and that the rest exist. So every POI gets one label:

    must_see      the highest significance INSIDE the place, with at least
                  national recognition (a heritage listing, or Wikipedia in
                  at least national_min_wiki_languages languages), up to the
                  class cap (metro 8, city 5, town 3, village 2, area 3)
    recommended   the next POIs by significance inside the place, up to
                  recommended_factor x the cap
    worth_a_look  every other POI

Inside the place means within depth.poi_own_km of its centre (15 km metro,
10 km city, 5 km town and village, any distance for an area), the radius
depth uses, so Begunje no longer counts Bled's lake as its own must-see.

"A must-see that is closed in the chosen month becomes recommended" needs
opening months, which no POI source carries yet; the app applies it in R4
once a source exists.

Each POI also gets its category, the one category set (config
poi_categories: sights, museums, nature, food and drink, active, family,
nightlife, markets and shops), and practical tags: kids, step_free, indoors
and free, filled only from OpenStreetMap tags where a harvest found them
(cache/poi_fees.json for fee) and left out otherwise. No guessing.

`rate` stays on the wire until R4, derived from the label (must_see 3,
recommended 2, worth_a_look 1), so the day planner keeps working.

Writes app_data/app_data.json (activities.items_full); continent-app's
sync-data.mjs ships it as public/poi/{id}.json. score_significance.py apply
runs this after its own pass, so a significance run keeps the labels.

Usage, from the repo root:
    python pipeline/poi_labels.py              # label the master
    python pipeline/poi_labels.py --dry-run    # counts only

ASCII only, no em dashes, per project convention.
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

import appeal_scale  # noqa: E402
import beauty_layer  # noqa: E402
from pipeline_io import atomic_write_json, load_json  # noqa: E402
from rating_config import cfg, section  # noqa: E402

DATA = ROOT / "app_data" / "app_data.json"
WIKIDATA = ROOT / "cache" / "poi_wikidata.json"
FEES = ROOT / "cache" / "poi_fees.json"

CATEGORIES = tuple(cfg("poi_categories.categories"))
KIND_CATEGORY = section("poi_categories.kind_category")
CAPS = section("poi_labels.must_see_cap")
DEFAULT_CAP = int(cfg("poi_labels.default_cap"))
RECOMMENDED_FACTOR = int(cfg("poi_labels.recommended_factor"))
MIN_LANGS = int(cfg("poi_labels.national_min_wiki_languages"))
LABEL_RATE = section("poi_labels.label_rate")
OWN_KM = section("depth.poi_own_km")
LABELS = tuple(LABEL_RATE)


def category_of(item):
    """The item's one category. An unmapped kind is a config gap, not a
    default: tests/test_poi_labels.py fails on it before the wire does."""
    kind = item.get("kind")
    if kind not in KIND_CATEGORY:
        raise KeyError(f"POI kind {kind!r} has no category in config "
                       f"poi_categories.kind_category")
    return KIND_CATEGORY[kind]


def wiki_languages(item, wikidata):
    entry = wikidata.get(item.get("wiki") or "") or {}
    return entry.get("sitelinks")


def national(item, wikidata):
    """At least national recognition: a heritage listing, or Wikipedia in at
    least MIN_LANGS languages (the Wikidata sitelink count)."""
    if item.get("heritage"):
        return True
    return (wiki_languages(item, wikidata) or 0) >= MIN_LANGS


def tags_of(item, fees):
    """Practical tags from OSM, only those a harvest answered."""
    tags = {}
    if isinstance(item.get("lat"), (int, float)) and isinstance(item.get("lon"), (int, float)):
        fee = (fees.get(f"{item['lat']:.4f},{item['lon']:.4f}") or {}).get("fee")
        if fee in ("yes", "no"):
            tags["free"] = fee == "no"
    return tags


def inside(dest, items):
    """Indices of the live items within the place (depth.poi_own_km)."""
    own = OWN_KM.get(appeal_scale.class_of(dest))
    lat, lon = beauty_layer.centre(dest)
    out = []
    for i, it in enumerate(items):
        if it.get("dup") or it.get("noise"):
            continue
        if (own is not None and lat is not None
                and isinstance(it.get("lat"), (int, float))
                and beauty_layer._haversine_km(lat, lon, it["lat"], it["lon"]) > own):
            continue
        out.append(i)
    return out


def label_place(dest, wikidata, fees):
    """Label one destination's POIs in place; returns the label counts."""
    items = (dest.get("activities") or {}).get("items_full") or []
    cap = int(CAPS.get(appeal_scale.class_of(dest), DEFAULT_CAP))
    order = sorted(inside(dest, items),
                   key=lambda i: (-(items[i].get("sig") or 0.0), i))
    must = [i for i in order if national(items[i], wikidata)][:cap]
    rest = [i for i in order if i not in must][:RECOMMENDED_FACTOR * cap]
    label = {i: "must_see" for i in must}
    label.update({i: "recommended" for i in rest})
    counts = Counter()
    for i, it in enumerate(items):
        if it.get("dup") or it.get("noise"):
            # A duplicate is hidden by the app; it never outranks its twin.
            it["label"] = None
            it["rate"] = LABEL_RATE["worth_a_look"]
        else:
            it["label"] = label.get(i, "worth_a_look")
            it["rate"] = LABEL_RATE[it["label"]]
        it["category"] = category_of(it)
        it["tags"] = tags_of(it, fees)
        counts[it["label"]] += 1
    return counts


def label_all(data, wikidata=None, fees=None):
    """Label every destination; {class: Counter(label)}."""
    wikidata = load_json(WIKIDATA) if wikidata is None else wikidata
    fees = (load_json(FEES) if FEES.exists() else {}) if fees is None else fees
    by_class = defaultdict(Counter)
    for dest in data["destinations"].values():
        by_class[appeal_scale.class_of(dest)].update(label_place(dest, wikidata, fees))
    return by_class


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    data = load_json(DATA)
    by_class = label_all(data)
    for cls, c in sorted(by_class.items()):
        n = sum(c.values())
        print(f"  {cls:8} {n:7,} POIs: " + ", ".join(
            f"{lab} {c[lab]:,} ({100 * c[lab] / max(n, 1):.1f}%)" for lab in LABELS))
    if args.dry_run:
        print("dry run: nothing written")
        return
    atomic_write_json(DATA, data, indent=None, ensure_ascii=False)
    print(f"labelled -> {DATA}")


if __name__ == "__main__":
    main()
