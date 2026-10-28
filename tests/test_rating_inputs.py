"""Rating v5 batch R1, T756: what each component reads, and the measures that
replace v4's highlights and Blue Flag beach.

- no fact feeds two components: an item inside beauty's setting radius is
  beauty's, depth counts only beyond it, a nature POI standing on a beauty
  item is the same fact, and beauty v2 reads no register (recognition does)
- the water value is measured per place, not per country
- depth does not saturate the top: few tier-3 places sit at 0.98 or more
  (v4 highlights: 36 of 43)
- the POI rate quota holds (12% at rate 3)

Depth and beauty v2 are not live yet (config depth.live, beauty.live; see
Execution/_OPEN.md T756-a), so these run on the shadow computation that the
switch would turn on.

Runs under pytest, or standalone: python tests/test_rating_inputs.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import appeal_scale  # noqa: E402
import beauty_layer  # noqa: E402
import rating_config  # noqa: E402
import rating_layer  # noqa: E402

_MASTER = ROOT / "app_data" / "app_data.json"
_WIRE = ROOT / "continent-app" / "public" / "app_data.json"
INPUT = _MASTER if _MASTER.exists() else _WIRE
_DESTS = None


def _dests():
    global _DESTS
    if _DESTS is None:
        _DESTS = json.loads(INPUT.read_text(encoding="utf-8"))["destinations"]
    return _DESTS


def test_no_fact_feeds_two_components():
    dests = _dests()
    match_km = rating_config.cfg("depth.poi_nature_match_km")
    both = []
    for did, d in dests.items():
        setting = [it for rows in beauty_layer.setting_items(d).values()
                   for it in rows]
        keys_b = {it["key"] for it in setting}
        items_d = rating_layer.depth_items(did, d)
        if keys_b & {k for k, _cat, _w in items_d}:
            both.append(did)
            continue
        pois = (d.get("activities") or {}).get("items_full") or []
        for key, cat, _w in items_d:
            if cat != "nature" or not key.startswith("poi:"):
                continue
            it = pois[int(key.rsplit(":", 1)[1])]
            if any(beauty_layer._haversine_km(it["lat"], it["lon"],
                                              s["lat"], s["lon"]) <= match_km
                   for s in setting):
                both.append(did)
                break
    assert not both, f"facts in both beauty and depth: {both[:10]}"


def test_beauty_v2_reads_no_register():
    # Recognition (R) counts registers; beauty v2 must not move with them.
    assert beauty_layer.WEIGHTS_V2["heritage"] == 0
    assert {"national-park", "unesco"} <= beauty_layer.REGISTER_TAGS
    dests = _dests()
    for did in ("gem:bochum", "FCO", "gem:hallstatt"):
        d = dict(dests[did], id=did)
        bare = dict(d, designations=[],
                    categories=[c for c in d.get("categories") or []
                                if c not in beauty_layer.REGISTER_TAGS])
        assert (beauty_layer.compute_beauty_v2(d)["score"]
                == beauty_layer.compute_beauty_v2(bare)["score"]), did


def test_water_is_measured_per_place():
    # v1 read the country's Blue Flag count: every Spanish coastal town of
    # the same tag shared one value (three values across these twenty).
    dests = _dests()
    coast = sorted(k for k, d in dests.items()
                   if d.get("iso2") == "ES" and d.get("rating")
                   and {"beach", "coast"} & set(d.get("categories") or []))[:20]
    assert len(coast) == 20
    water = {beauty_layer.compute_beauty_v2(dict(dests[k], id=k))
             ["components"]["beach"] for k in coast}
    assert len(water) >= 10, f"only {len(water)} distinct water values"


def test_depth_does_not_saturate_the_top():
    dests = _dests()
    raw = {did: rating_layer.depth_raw(did, d) for did, d in dests.items()}
    by_class = {}
    for did, d in dests.items():
        by_class.setdefault(appeal_scale.class_of(d), []).append(raw[did])
    knots = rating_layer.depth_knots(by_class, rating_config.cfg("depth.knots"))
    top = [did for did, d in dests.items()
           if (d.get("rating") or {}).get("tier") == 3]
    sat = [did for did in top if appeal_scale._interp(
        knots[appeal_scale.class_of(dests[did])], raw[did]) >= 0.98]
    assert len(sat) < 0.20 * len(top), (
        f"{len(sat)} of {len(top)} tier-3 places at depth >= 0.98")


def test_poi_rate_quota_holds():
    """T761: `rate` is derived from the POI label (must_see 3, recommended 2),
    and the labels are capped per place class, so the quota share
    (significance.rate3_share) now only orders a place's POIs before they are
    labelled. What holds on the wire: rate 3 is exactly the must-see set, and
    that set is never larger than the old quota."""
    if INPUT != _MASTER:
        return                   # the wire carries no items_full
    n = n3 = 0
    for d in _dests().values():
        for it in (d.get("activities") or {}).get("items_full") or []:
            if it.get("dup") or it.get("noise"):
                continue
            n += 1
            n3 += (it.get("rate") or 0) == 3
            assert ((it.get("rate") or 0) == 3) == (it.get("label") == "must_see"), it
    share = n3 / n
    target = rating_config.cfg("significance.rate3_share")
    assert 0 < share <= target + 0.02, f"rate-3 share {share:.1%}"


if __name__ == "__main__":
    test_no_fact_feeds_two_components()
    test_beauty_v2_reads_no_register()
    test_water_is_measured_per_place()
    test_depth_does_not_saturate_the_top()
    test_poi_rate_quota_holds()
    print("rating inputs hold")
