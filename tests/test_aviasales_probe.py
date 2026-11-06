"""Aviasales probe on recorded fixture responses (T1112). No network, no token."""
import importlib.util
import json
import sys
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
FX = ROOT / "tests" / "fixtures" / "aviasales"
spec = importlib.util.spec_from_file_location("aviasales_probe", ROOT / "scripts" / "aviasales_probe.py")
ap = importlib.util.module_from_spec(spec)
sys.modules["aviasales_probe"] = ap
spec.loader.exec_module(ap)
NOW = datetime(2026, 11, 6, 8, 0, tzinfo=timezone.utc)
ARGS = ["--routes", str(FX / "routes.json"), "--airports", str(FX / "airports.json"),
        "--months", "2027-01,2027-02", "--sweep", str(FX / "sweep.csv"), "--fixtures", str(FX)]


def run(tmp_path, extra=()):
    assert ap.main(ARGS + ["--out", str(tmp_path), *extra], now=NOW) == 0
    return json.loads((tmp_path / "coverage.json").read_text())


def test_parse_takes_cheapest_and_age():
    r = ap.parse_response(json.loads((FX / "AAL-AMS-2027-01.json").read_text()), NOW)
    assert r["price"] == 95 and r["age_days"] == 4.0 and r["transfers"] == 1


def test_parse_empty_and_failed():
    assert ap.parse_response({"success": True, "data": []}, NOW)["status"] == "empty"
    assert ap.parse_response({"success": False}, NOW)["status"] == "empty"


def test_report_tables(tmp_path):
    rep = run(tmp_path)
    assert rep["probed"] == 6 and rep["priced"] == 2  # 3 routes x 2 months
    assert rep["by_country"]["Denmark"]["coverage_pct"] == 33.3
    assert rep["by_month"]["2027-01"]["priced"] == 2 and rep["by_month"]["2027-02"]["priced"] == 0
    # AAL-AMS: api 95 vs sweep 100 -> -5% (within 5%); AAR-CPH: 60 vs 40 -> +50%
    assert rep["price_gap"]["compared"] == 2
    assert rep["price_gap"]["buckets"]["api dearer than +20%"] == 1
    assert rep["freshness"]["with_timestamp"] == 1
    md = (tmp_path / "coverage.md").read_text()
    assert "Coverage by origin country" in md and "Price gap" in md and "—" not in md


def test_resume_skips_answered(tmp_path):
    calls = []
    inner = ap.fixture_fetcher(FX)
    ap.main(ARGS + ["--out", str(tmp_path)], fetch=lambda *a: calls.append(a) or inner(*a), now=NOW)
    n = len(calls)
    ap.main(ARGS + ["--out", str(tmp_path)], fetch=lambda *a: calls.append(a) or inner(*a), now=NOW)
    assert n == 6 and len(calls) == 6


def test_limit_and_errors_retried(tmp_path):
    def boom(*a):
        raise RuntimeError("no answer after 4 tries")
    ap.main(ARGS + ["--out", str(tmp_path), "--limit", "2"], fetch=boom, now=NOW)
    assert ap.main(ARGS + ["--out", str(tmp_path)], fetch=boom, now=NOW) == 2  # only errors on file
    assert run(tmp_path)["probed"] == 6  # a rerun retries the errors


def test_token_required_and_never_leaked(tmp_path, monkeypatch, capsys):
    monkeypatch.delenv("AVIASALES_TOKEN", raising=False)
    assert ap.main(["--routes", str(FX / "routes.json"), "--out", str(tmp_path)]) == 2

    seen = {}

    class R:
        def __enter__(self): return self
        def __exit__(self, *e): pass
        def read(self): return b'{"success":true,"data":[]}'

    def opener(req, timeout):
        seen["h"] = req.get_header("X-access-token")
        seen["url"] = req.full_url
        return R()

    f = ap.Fetcher("SECRET123", "https://example.invalid", 1000, sleep=lambda s: None, opener=opener)
    f("AAL", "AMS", "2027-01")
    assert seen["h"] == "SECRET123" and "SECRET123" not in seen["url"]
    assert "SECRET123" not in capsys.readouterr().out


def test_auth_refusal_stops(tmp_path):
    def opener(req, timeout):
        raise urllib.error.HTTPError(req.full_url, 401, "no", {}, None)
    f = ap.Fetcher("x", "https://example.invalid", 1000, sleep=lambda s: None, opener=opener)
    with pytest.raises(SystemExit):
        f("AAL", "AMS", "2027-01")
