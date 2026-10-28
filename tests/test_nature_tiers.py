"""Nature items on the place ladder (rating v5, T761).

Checks the served wires against the frozen nature part of the reference:
every kind has 2% to 4% Exceptional and each band near its share, every
scored item has a confidence, no unscored item carries a score or band, the
score never shows a band above its own, the rank line is well formed, and
the facts are present (null where the data has none). Also checks the pure
pieces: blend() never renormalises, the ladder hits the place cutoffs, and
recalibration refuses without a version bump.

The wire checks read continent-app/public/{kind}/*.json; they skip when a
kind has no v5 keys yet (nature_tiers.py not applied).

Runs under pytest, or standalone: python tests/test_nature_tiers.py
"""
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import nature_tiers as nt  # noqa: E402
import rating_config  # noqa: E402
from rating_config import cfg, section  # noqa: E402

FACT_KEYS = {
    "trails": {"difficulty", "km", "climb_m", "hours", "loop"},
    "beaches": {"water_class", "blue_flag", "surface", "lifeguard"},
    "lakes": {"swimming", "water_class", "shore_access"},
    "mountains": {"way_up", "difficulty", "season"},
    "cycling": {"paved_share", "traffic_free_share", "climb_m", "family"},
}
CUT = section("bands.cutoffs")


def _v5_rows(kind):
    return [r["v5"] for r in nt.wire_rows(kind) if "v5" in r]


def test_blend_counts_missing_at_median_without_renormalising():
    w = {"a": 0.5, "b": 0.5}
    med = {"a": 0.2, "b": 0.2}
    full, share_full = nt.blend("x", {"a": 1.0, "b": 1.0}, w, medians=med)
    half, share_half = nt.blend("x", {"a": 1.0}, w, medians=med)
    assert full == 1.0 and share_full == 1.0
    # Renormalising would give 1.0 here: the missing part is counted at 0.2.
    assert abs(half - 0.6) < 1e-9 and share_half == 0.5


def test_ladder_hits_the_place_cutoffs():
    pts = dict(nt.ladder_points())
    assert pts[1.0] == cfg("nature.ladder.ceiling")
    assert pts[0.0] == cfg("nature.ladder.floor")
    assert nt.score_of(0.97, nt.ladder_points()) == CUT["exceptional"]
    assert nt.band_of(0.97) == "exceptional"
    assert nt.band_of(0.969) == "excellent"
    assert nt.band_of(0.19) is None


def test_reference_has_every_kind():
    ref = rating_config.reference("nature")
    assert set(ref["kinds"]) == set(cfg("nature.kinds"))
    for kind, part in ref["kinds"].items():
        assert len(part["score_knots"]) == cfg("nature.knots"), kind
        assert part["score_knots"] == sorted(part["score_knots"]), kind


def test_recalibration_needs_a_version_bump():
    try:
        rating_config.write_part("nature", {}, rating_config.part_version("nature"))
    except SystemExit as e:
        assert "REFUSED" in str(e)
    else:
        raise AssertionError("re-freezing the same nature version was not refused")


def test_band_shares_per_kind():
    shares = section("nature.shares")
    for kind in cfg("nature.kinds"):
        rows = _v5_rows(kind)
        if not rows:
            continue
        scored = [v for v in rows if v["score"] is not None]
        bands = Counter(v["band"] for v in scored)
        n = len(scored)
        top = bands["exceptional"] / n
        assert 0.02 <= top <= 0.04, (kind, top)
        for band, share in shares.items():
            assert abs(bands[band] / n - share) <= 0.025, (kind, band, bands[band] / n)


def test_every_item_explained():
    for kind in cfg("nature.kinds"):
        for v in _v5_rows(kind):
            assert v["confidence"] in ("measured", "partial", "unscored"), (kind, v)
            assert set(v["facts"]) == FACT_KEYS[kind], (kind, v["facts"])
            if v["confidence"] == "unscored":
                assert v["score"] is None and v["band"] is None and v["rank"] is None
                continue
            s, b = v["score"], v["band"]
            assert cfg("nature.ladder.floor") <= s <= cfg("nature.ladder.ceiling")
            # The score never shows a band above its own.
            if b is None:
                assert s < CUT["pleasant"], (kind, v)
            else:
                assert s >= CUT[b], (kind, v)
                above = [k for k, c in CUT.items() if c > CUT[b]]
                assert all(s < CUT[k] for k in above), (kind, v)


def test_rank_lines():
    need = cfg("nature.rank_min_items")
    unit = cfg("nature.rank_units")
    for kind in cfg("nature.kinds"):
        for v in _v5_rows(kind):
            r = v["rank"]
            if r is None:
                continue
            assert r["scope"] in ("region", "country")
            assert r["unit"] == unit[kind]
            assert 1 <= r["rank"] <= r["of"] and r["of"] >= need


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
