"""POI labels and the one category set (rating v5, T761).

Every shipped POI kind maps to exactly one category; no place holds more
must-see or recommended POIs than its class allows; a must-see is inside
the place and nationally recognised; `rate` follows the label; the label
rule itself on a small synthetic place.

The catalogue checks read the master (app_data/app_data.json, else the POI
shards the app loads) and skip the label checks until poi_labels.py ran.

Runs under pytest, or standalone: python tests/test_poi_labels.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import appeal_scale  # noqa: E402
import poi_labels  # noqa: E402
from rating_config import cfg, section  # noqa: E402

MASTER = ROOT / "app_data" / "app_data.json"
SHARDS = ROOT / "continent-app" / "public" / "poi"


def _places():
    """[(dest or None, items)] from the master, else from the shards."""
    if MASTER.exists():
        data = json.loads(MASTER.read_text(encoding="utf-8"))
        return [(d, (d.get("activities") or {}).get("items_full") or [])
                for d in data["destinations"].values()]
    return [(None, json.loads(p.read_text(encoding="utf-8")))
            for p in sorted(SHARDS.glob("*.json"))]


PLACES = _places()


def test_every_kind_has_one_category():
    cats = set(cfg("poi_categories.categories"))
    table = section("poi_categories.kind_category")
    assert set(table.values()) <= cats
    kinds = {it.get("kind") for _d, items in PLACES for it in items}
    missing = sorted(k for k in kinds if k not in table)
    assert not missing, f"POI kinds with no category: {missing}"


def test_caps_hold_per_place():
    caps = section("poi_labels.must_see_cap")
    factor = cfg("poi_labels.recommended_factor")
    labelled = 0
    for dest, items in PLACES:
        if dest is None or not any("label" in it for it in items):
            continue
        labelled += 1
        cap = caps.get(appeal_scale.class_of(dest), cfg("poi_labels.default_cap"))
        must = sum(1 for it in items if it.get("label") == "must_see")
        rec = sum(1 for it in items if it.get("label") == "recommended")
        assert must <= cap, (dest.get("city"), must, cap)
        assert rec <= factor * cap, (dest.get("city"), rec, factor * cap)
    if MASTER.exists():
        assert labelled, "no labelled place: run pipeline/poi_labels.py"


def test_rate_follows_label_and_category_is_set():
    rate = section("poi_labels.label_rate")
    for _d, items in PLACES:
        for it in items:
            if "label" not in it:
                continue
            assert it["category"] in cfg("poi_categories.categories")
            assert isinstance(it.get("tags"), dict)
            if it["label"] is None:
                assert it.get("dup") or it.get("noise")
                assert it["rate"] == rate["worth_a_look"]
            else:
                assert it["rate"] == rate[it["label"]], it


def test_label_rule_on_a_village():
    """Two must-sees for a village, only inside 5 km and only recognised;
    the next six by significance are recommended."""
    dest = {"lat": 46.0, "lon": 14.0, "place": {"class": "village"},
            "activities": {"items_full": [
                {"name": "far castle", "kind": "Castle", "lat": 46.2, "lon": 14.0,
                 "sig": 3.0, "heritage": True},
                {"name": "listed church", "kind": "Church", "lat": 46.001, "lon": 14.0,
                 "sig": 2.0, "heritage": True},
                {"name": "unlisted tower", "kind": "Tower", "lat": 46.002, "lon": 14.0,
                 "sig": 2.5},
                {"name": "museum", "kind": "Museum", "lat": 46.003, "lon": 14.0,
                 "sig": 1.0, "heritage": True},
                {"name": "square", "kind": "Square", "lat": 46.004, "lon": 14.0, "sig": 0.5},
                {"name": "twin", "kind": "Square", "lat": 46.004, "lon": 14.0, "sig": 2.9,
                 "dup": True},
            ]}}
    poi_labels.label_place(dest, {}, {})
    got = {it["name"]: it["label"] for it in dest["activities"]["items_full"]}
    assert got == {"far castle": "worth_a_look", "listed church": "must_see",
                   "unlisted tower": "recommended", "museum": "must_see",
                   "square": "recommended", "twin": None}, got


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
