"""scripts/quality/scorecard.py on a two-place fixture (T1134, ROADMAP D2)."""
from __future__ import annotations

import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
NOW = datetime(2026, 11, 6, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def sc():
    spec = importlib.util.spec_from_file_location("scorecard", ROOT / "scripts/quality/scorecard.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["scorecard"] = mod
    spec.loader.exec_module(mod)
    return mod


def place(i, **extra):
    base = {"id": i, "tier": "gem", "city": i.title(), "country": "Belgium", "iso2": "BE",
            "lat": 50.8, "lon": 4.4, "categories": ["city"], "tags": [], "blurb": "A town."}
    return {**base, **extra}


def write(root: Path, rel: str, data):
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data), encoding="utf-8")


def make_public(tmp: Path, *, lat_b=50.9, age_days=10) -> Path:
    stamp = datetime.fromtimestamp(NOW.timestamp() - age_days * 86400, timezone.utc).isoformat()
    write(tmp, "app_data.json", {"meta": {"generated_at": stamp}, "destinations": {
        "aaa": place("aaa"),
        "bbb": place("bbb", lat=lat_b, blurb=""),
        "ccc": place("ccc", gateway_of="aaa"),  # a gateway is rated as its city: not counted
    }})
    write(tmp, "beaches/BE.json", {"generated_at": stamp, "beaches": [
        {"id": "b1", "name": "De Panne", "lat": 51.1, "lon": 2.6, "score": 7.2},
        {"id": "b2", "name": "", "lat": 51.2, "lon": 2.9, "score": 12},
    ]})
    return tmp


def layer(card, name):
    return next(r for r in card["layers"] if r["layer"] == name)


def test_completeness_counts_empty_as_missing(sc, tmp_path):
    card = sc.build(make_public(tmp_path), NOW)
    core = layer(card, "core")
    assert core["records"] == 2
    assert core["fields"]["blurb"] == 0.5
    assert core["fields"]["tags"] == 0.0
    assert core["completeness"] == round(15 / 18, 4)  # 9 fields x 2 places; tags twice and one blurb empty


def test_validity_is_the_contract_pass_rate(sc, tmp_path):
    good = layer(sc.build(make_public(tmp_path / "a"), NOW), "core")
    bad = layer(sc.build(make_public(tmp_path / "b", lat_b="50.9"), NOW), "core")
    assert good["validity"] == 1.0
    assert bad["validity"] < 1.0  # one string latitude out of 18 present values
    assert bad["validity"] == round(17 / 18, 4)


def test_freshness_inside_and_over_cadence(sc, tmp_path):
    fresh = layer(sc.build(make_public(tmp_path / "a", age_days=10), NOW), "core")
    stale = layer(sc.build(make_public(tmp_path / "b", age_days=70), NOW), "core")
    assert fresh["freshness"] == 1.0
    assert stale["freshness"] == 0.5  # app_data cadence 35 days, 70 days old


def test_shard_wire_basic_checks(sc, tmp_path):
    beaches = layer(sc.build(make_public(tmp_path), NOW), "beaches")
    assert beaches["records"] == 2
    assert beaches["validity"] == 0.5  # b2: empty name and a score above 10
    assert beaches["accuracy"] is None
    assert layer(sc.build(make_public(tmp_path), NOW), "lakes")["records"] == 0


def test_rating_accuracy_from_the_golden_pairs(sc):
    dests = {"FCO": {"rating": {"score": 9.0}}, "TRN": {"rating": {"score": 7.0}},
             "VCE": {"rating": {"score": 6.0}}, "BRI": {"rating": {"score": 6.0}}}
    acc, meta = sc.golden_accuracy(dests)
    # Rome above Turin is right; Venice tied with Bari is wrong (ties fail).
    assert meta["pairs_scored"] == 2 and meta["pairs_right"] == 1 and acc == 0.5


def test_markdown_and_write(sc, tmp_path):
    pub = make_public(tmp_path / "pub")
    out = tmp_path / "out"
    assert sc.main(["--public", str(pub), "--now", "2026-11-06T00:00:00Z", "--write", "--out", str(out)]) == 0
    card = json.loads((out / "2026-11-06.json").read_text())
    assert {r["layer"] for r in card["layers"]} >= {"core", "rating", "beaches", "trails"}
    assert "| core | app_data | 2 |" in (out / "2026-11-06.md").read_text()
    assert len((out / "quality_history.jsonl").read_text().splitlines()) == 1
