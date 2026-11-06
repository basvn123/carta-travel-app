"""T1187 (ROADMAP D23): the shared validation runner, its gate and the D2 hook.

A fake layer (forty references in three countries) runs through the runner
into tmp_path; a seeded drop then fails the gate, the runner's --check and the
D2 quality run. The last test runs the trails layer on the shipped wire and is
skipped where the wire is absent.

    python -m pytest tests/test_validation_runner.py -q
"""
from __future__ import annotations

import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "validation"))

import runner as vr

NOW = datetime(2026, 11, 6, 12, tzinfo=timezone.utc)
LATER = datetime(2026, 11, 13, 12, tzinfo=timezone.utc)


def fake_layer(have: set[str]):
    refs = [{"id": f"{cc}-{i}", "countries": [cc], "km": 10 + i}
            for cc, k in (("BE", 20), ("NL", 12), ("LU", 8)) for i in range(k)]

    def match(chosen, carta):
        out = []
        for r in chosen:
            hit = r["id"] in carta
            out.append({"id": r["id"], "country": r["countries"][0],
                        "flags": {"matched": hit},
                        "facts": {"km": (r["km"] % 3 != 0) if hit else None},
                        "rank": (r["km"], r["km"] * 2) if hit else None,
                        "error": (float(r["km"]), r["km"] * 1.1) if hit else None})
        return out

    return SimpleNamespace(
        NAME="fake",
        CHECKS=[{"metric": "coverage", "kind": "hard", "tolerance_points": 2},
                {"metric": "agreement_tau", "kind": "soft", "tolerance_points": 5, "min_n": 5}],
        references=lambda ctx: refs, load=lambda ctx: have, match=match)


ALL = {f"{cc}-{i}" for cc, k in (("BE", 20), ("NL", 12), ("LU", 8)) for i in range(k)}
MOST = ALL - {"BE-0", "BE-1", "NL-0", "LU-0"}          # 36 of 40, 90%


def test_kendall_tau_b_and_spearman_match_known_values():
    # scipy.stats.kendalltau's documented example, with ties: tau-b -0.4714.
    pairs = list(zip([12, 2, 1, 12, 2], [1, 4, 7, 1, 0]))
    assert vr.kendall_tau_b(pairs) == pytest.approx(-0.4714, abs=1e-4)
    assert vr.spearman([(1, 2), (2, 4), (3, 9)]) == 1.0
    assert vr.spearman([(1, 3), (2, 2), (3, 1)]) == -1.0
    assert vr.kendall_tau_b([(1, 1)]) is None


def test_wilson_interval_and_errors():
    assert vr.wilson(5, 10) == (0.2366, 0.7634)
    assert vr.wilson(0, 0) == (None, None)
    mae, mdape = vr.errors([(10.0, 11.0), (20.0, 18.0), (0.0, 1.0)])
    assert mae == pytest.approx(4 / 3, abs=1e-3)
    assert mdape == 0.1          # the zero reference is left out of the percentage


def test_sampling_is_stratified_minimum_and_stable():
    refs = fake_layer(set()).references({})
    chosen, strata = vr.sample(refs, "fake", share=0.25, min_per=5)
    assert strata == {"BE": (20, 5), "LU": (8, 5), "NL": (12, 5)}
    again, _ = vr.sample(list(reversed(refs)), "fake", share=0.25, min_per=5)
    assert [r["id"] for r in chosen] == [r["id"] for r in again]
    # A larger share keeps every item the smaller one chose.
    bigger, _ = vr.sample(refs, "fake", share=0.5, min_per=5)
    assert {r["id"] for r in chosen} <= {r["id"] for r in bigger}
    full, s = vr.sample(refs, "fake")
    assert len(full) == 40 and s["BE"] == (20, 20)


def test_metrics_of_a_full_run(tmp_path):
    res = vr.run(fake_layer(MOST), now=NOW)
    m = res["metrics"]
    assert m["coverage"]["value"] == 0.9 and m["coverage"]["k"] == 36
    assert m["agreement_tau"]["value"] == 1.0
    assert m["error_mdape"]["value"] == pytest.approx(0.1)
    assert 0 < m["fact_share"]["value"] < 1
    assert res["by_country"]["BE"] == {"population": 20, "sampled": 20, "matched": 18, "coverage": 0.9}
    assert res["sample"]["sampled"] is False
    # No baseline: a hard check fails, so removing the file cannot pass a run.
    assert not res["gate"]["ok"]
    assert res["gate"]["failures"][0]["metric"] == "coverage"


def test_seeded_drop_fails_the_gate_the_check_and_the_d2_run(tmp_path, monkeypatch):
    out = tmp_path / "validation"
    good = vr.run(fake_layer(ALL), now=NOW)
    vr.write_baseline(good, out)
    good = vr.run(fake_layer(ALL), now=NOW, baseline=vr.load_json(out / "fake" / "baseline.json"))
    assert good["gate"]["ok"]
    vr.write(good, out, snapshot=None)
    assert vr.gate_from_disk(out) == ([], [])

    # Within the tolerance (2 points): one of 40 missing is 2.5 points, a fail;
    # so the seeded drop is four missing, 10 points.
    drop = vr.run(fake_layer(MOST), now=LATER, baseline=vr.load_json(out / "fake" / "baseline.json"))
    assert not drop["gate"]["ok"]
    assert drop["gate"]["failures"] == [{"metric": "coverage", "why": "fell from 1.0 to 0.9 (tolerance 2 points)"}]
    vr.write(drop, out, snapshot=None)
    fails, _ = vr.gate_from_disk(out)
    assert [f["id"] for f in fails] == ["validation.fake.coverage"]
    assert "2026-11-13" in fails[0]["why"]

    card = json.loads((out / "scorecard.json").read_text(encoding="utf-8"))
    lay = card["layers"][0]
    assert card["ok"] is False and lay["layer"] == "fake" and lay["latest"] == "2026-11-13"
    assert [p["gate_ok"] for p in lay["trend"]] == [True, False]
    assert [p["metrics"]["coverage"] for p in lay["trend"]] == [1.0, 0.9]

    # The D2 quality run fails on it.
    spec = importlib.util.spec_from_file_location("quality_engine_t1187", ROOT / "scripts/quality/engine.py")
    eng = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(eng)
    sys.path.insert(0, str(ROOT / "tests"))
    from test_quality_engine import make_public, soft_rules
    pub = make_public(tmp_path / "public")
    rules = soft_rules(eng, tmp_path)
    rc, data = eng.run(pub, LATER, tmp_path / "q", rules, write=False, snapshot=None, validation=out)
    assert rc == 1 and not data["gate"]["ok"]
    assert [f["id"] for f in data["gate"]["failures"]] == ["validation.fake.coverage"]
    rc, data = eng.run(pub, LATER, tmp_path / "q", rules, write=False, snapshot=None, validation=None)
    assert rc == 0


def test_a_drop_inside_a_samples_interval_warns(tmp_path):
    base = vr.run(fake_layer(ALL), now=NOW)
    vr.write_baseline(base, tmp_path)
    lay = fake_layer(ALL - {"BE-0", "BE-1", "BE-2", "NL-1", "LU-1", "LU-2"})
    res = vr.run(lay, share=0.5, min_per=5, now=LATER, baseline=vr.load_json(tmp_path / "fake" / "baseline.json"))
    assert res["sample"]["sampled"] is True
    # One of the 21 sampled is missing (LU-1): 96%, 4 points under the
    # baseline, past the tolerance, but the interval's top (99.2%) is above 98%.
    assert res["metrics"]["coverage"]["value"] == 0.96
    assert res["gate"]["ok"], res["gate"]
    assert any(w["metric"] == "coverage" and "interval" in w["why"] for w in res["gate"]["warnings"])


def test_runner_cli_check_exits_1_on_a_failed_hard_check(tmp_path, monkeypatch):
    out = tmp_path / "v"
    lay = fake_layer(MOST)
    monkeypatch.setitem(vr.LAYERS, "fake", "fake_mod")
    monkeypatch.setitem(sys.modules, "fake_mod", lay)
    assert vr.main(["fake", "--out", str(out), "--check", "--no-snapshot"]) == 1      # no baseline
    assert vr.main(["fake", "--out", str(out), "--write-baseline", "--check", "--no-snapshot"]) == 0
    monkeypatch.setitem(sys.modules, "fake_mod", fake_layer(MOST - {"BE-5", "NL-5"}))
    assert vr.main(["fake", "--out", str(out), "--check", "--write", "--no-snapshot",
                    "--now", "2026-11-13T12:00:00Z"]) == 1
    assert (out / "fake" / "2026-11-13.json").is_file()


def test_shipped_scorecard_and_admin_snapshot_agree():
    card = json.loads((ROOT / "data/reports/validation/scorecard.json").read_text(encoding="utf-8"))
    snap = json.loads(vr.SNAPSHOT.read_text(encoding="utf-8"))
    assert card == snap and card["schema"] == vr.CARD_SCHEMA
    trails = next(lay for lay in card["layers"] if lay["layer"] == "trails")
    assert trails["gate"]["ok"] and trails["metrics"]["coverage"]["value"] == 0.5284


@pytest.mark.skipif(not any((ROOT / "continent-app/public/trails").glob("??.json")), reason="no trails wire")
def test_trails_layer_matches_t1181():
    import layer_trails
    import trails_external as te
    res = vr.run(layer_trails, {}, baseline=vr.load_json(vr.VALID_DIR / "trails" / "baseline.json"))
    old = te.run()["summary"]
    assert res["metrics"]["coverage"]["value"] == old["coverage"]
    assert res["metrics"]["in_top"]["value"] == old["top_share"]
    assert res["gate"]["ok"], res["gate"]
    assert len(res["gaps"]) == te.GAPS_N
