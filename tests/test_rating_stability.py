"""Gate 1 of rating v5 (T754): adding places moves nobody else.

Drops a seeded sample of non-anchor destinations, scores the rest, adds the
sample back and scores again. With every calibration read from the frozen
reference (reports/rating_reference_v5.json) no other place's score may move
by more than stability.max_move and no tier may change. Before T754 this
failed by construction: the fallback fit, the class appeal scales and the
fame percentiles were all measured on the catalogue of the day.

"Anchor" places are left in: the golden pairs, the famous floors and the
appeal checkpoints (their scores are what the guards are measured against),
and every airport of a multi-airport city (dropping a city's primary row
hands the city to another airport, which is a different place, not a move).

Also checks the frozen zlog and the recalibration guard.

Runs under pytest, or standalone: python tests/test_rating_stability.py
"""
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import apply_rating_layer  # noqa: E402
import appeal_scale  # noqa: E402
import rating_config  # noqa: E402
import rating_layer  # noqa: E402
import score_significance  # noqa: E402

_MASTER = ROOT / "app_data" / "app_data.json"
_WIRE = ROOT / "continent-app" / "public" / "app_data.json"
INPUT = _MASTER if _MASTER.exists() else _WIRE


def _score(dests):
    copy = {did: dict(d) for did, d in dests.items()}
    rating_layer.compute_ratings(copy)
    return {did: (d["rating"]["score"], d["rating"]["tier"])
            for did, d in copy.items() if d.get("rating")}


def _anchors(dests):
    golden = json.loads((ROOT / "tests" / "golden_ratings.json")
                        .read_text(encoding="utf-8"))["pairs"]
    keep = {p["winner"] for p in golden} | {p["loser"] for p in golden}
    keep |= set(apply_rating_layer.FAMOUS_FLOOR)
    keep |= set(apply_rating_layer.AIRPORT_TOWN_CEILING)
    keep |= {did for did, _cls, _floor in appeal_scale.EXPECTED}
    ids = list(dests)
    slots = rating_layer._city_slots(dests, ids)
    shared = {s for i, s in enumerate(slots) if s != i}
    keep |= {ids[i] for i, s in enumerate(slots) if s != i or i in shared}
    return keep


def test_adding_places_moves_nobody_else():
    dests = json.loads(INPUT.read_text(encoding="utf-8"))["destinations"]
    n = rating_config.cfg("stability.sample")
    max_move = rating_config.cfg("stability.max_move")
    pool = sorted(set(dests) - _anchors(dests))
    sample = set(random.Random(rating_config.cfg("stability.seed"))
                 .sample(pool, n))

    without = _score({k: v for k, v in dests.items() if k not in sample})
    full = _score(dests)

    moved = [(did, without[did], full[did]) for did in without
             if abs(without[did][0] - full[did][0]) > max_move + 1e-9
             or without[did][1] != full[did][1]]
    assert not moved, (
        f"adding {n} places moved {len(moved)} other scores or tiers, e.g. "
        + ", ".join(f"{d} {a} -> {b}" for d, a, b in moved[:8]))


def test_zlog_does_not_depend_on_the_cohort():
    stats = rating_config.reference("significance")["zlog"]["views"]
    alone = score_significance.zlog([120.0], stats)[0]
    crowd = score_significance.zlog([0.0, 5.0, 120.0, 90000.0], stats)[2]
    assert alone == crowd


def test_recalibration_needs_a_version_bump():
    try:
        rating_config.write_part("rating", {}, rating_config.version())
    except SystemExit as e:
        assert "REFUSED" in str(e)
    else:
        raise AssertionError("recalibrating at the stored version was allowed")
    try:
        rating_config.write_part("rating", {}, "v0-not-the-config")
    except SystemExit as e:
        assert "REFUSED" in str(e)
    else:
        raise AssertionError("recalibrating to a version not in the config "
                             "was allowed")


if __name__ == "__main__":
    test_adding_places_moves_nobody_else()
    test_zlog_does_not_depend_on_the_cohort()
    test_recalibration_needs_a_version_bump()
    print("stability gate holds")
