"""Tests for pipeline/taxonomy/agreement.py (T1215, row T1149-f): MASI, alpha, kappa on hand-checked cases."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline" / "taxonomy"))
import agreement as ag

S = frozenset


def test_masi_cases():
    assert ag.masi(S("ab"), S("ab")) == 0
    assert ag.masi(S("ab"), S("a")) == pytest.approx(1 - 0.5 * 2 / 3)  # subset
    assert ag.masi(S("ab"), S("bc")) == pytest.approx(1 - (1 / 3) * (1 / 3))  # overlap
    assert ag.masi(S("a"), S("b")) == 1  # disjoint


def test_identical_labellers_alpha_one():
    units = [[S("ab"), S("ab")], [S("c"), S("c")], [S("ad"), S("ad")]]
    assert ag.krippendorff_alpha(units) == pytest.approx(1.0)


def test_small_example_by_hand():
    # Do = (0 + 2/3 + 1) / 3 = 5/9; De = 22 / 30 over the six values; alpha = 1 - (5/9) / (11/15) = 8/33
    units = [[S("a"), S("a")], [S("ab"), S("a")], [S("c"), S("d")]]
    assert ag.krippendorff_alpha(units) == pytest.approx(8 / 33)


def test_krippendorff_reference_nominal():
    # Krippendorff (2011), "Computing Krippendorff's alpha-reliability", two coders, ten binary units: alpha 0.095.
    # Singleton sets make MASI the nominal distance.
    a = [0, 1, 0, 0, 0, 0, 0, 0, 1, 0]
    b = [1, 1, 1, 0, 0, 1, 0, 0, 0, 0]
    units = [[S([str(x)]), S([str(y)])] for x, y in zip(a, b)]
    assert round(ag.krippendorff_alpha(units), 3) == 0.095


def test_kappa_per_node():
    pairs = [("u1", S(["a"]), S(["a"])), ("u2", S(["a", "b"]), S(["a"])), ("u3", S(["c"]), S(["d"]))]
    res = ag.agreement(pairs)
    k = {r["node"]: r["kappa"] for r in res["per_node"]}
    assert k["a"] == pytest.approx(1.0)
    assert k["b"] == pytest.approx(0.0)  # po 2/3, pe 2/3
    assert k["d"] == pytest.approx(0.0)
    assert res["per_node"][-1]["node"] == "a"  # worst first
    assert res["alpha_masi"] == pytest.approx(8 / 33)
    assert res["identical_sets"] == 1


def test_cohen_kappa_textbook():
    # 50 items: both yes 20, A yes B no 5, A no B yes 10, both no 15 -> po 0.7, pe 0.5, kappa 0.4
    a = [True] * 25 + [False] * 25
    b = [True] * 20 + [False] * 5 + [True] * 10 + [False] * 15
    assert ag.cohen_kappa(a, b) == pytest.approx(0.4)
    assert ag.cohen_kappa([True, True], [True, True]) is None


def test_overlap_and_cli(tmp_path, capsys):
    head = "item_id,layer,kind,country,name,context,labels,unsure,note,by,at\n"
    (tmp_path / "a.csv").write_text(head + "x,place,city,AT,X,,set.lake;vibe.quiet,,,A,2026-11-07\n"
                                    "y,place,city,AT,Y,,act.art,,,A,2026-11-07\n"
                                    "z,place,city,AT,Z,,,,,,\n", encoding="utf-8")
    (tmp_path / "b.csv").write_text(head + "y,place,city,AT,Y,,act.art,,,B,2026-11-07\n"
                                    "x,place,city,AT,X,,set.lake; vibe.quiet,,,B,2026-11-07\n", encoding="utf-8")
    pairs, skipped = ag.overlap(ag.read(tmp_path / "a.csv"), ag.read(tmp_path / "b.csv"), rows=60)
    assert [p[0] for p in pairs] == ["x", "y"] and skipped == 1
    assert ag.main([str(tmp_path / "a.csv"), str(tmp_path / "b.csv"), "--json"]) == 0
    assert '"alpha_masi": 1.0' in capsys.readouterr().out
