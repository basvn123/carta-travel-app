"""T1074: scraper health alerts (scripts/stays_health.py) on synthetic runs.
Run: python -m pytest tests/test_stays_health.py"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import stays_health as H  # noqa: E402


def runs(source, pairs):
    return [{"source": source, "run": "2026-10", "started": f"r{i}", "pages": p, "prices": q}
            for i, (p, q) in enumerate(pairs)]


def test_yield_alert_below_70_percent_of_the_median():
    rs = runs("booking", [(100, 200)] * 7 + [(100, 130)])     # yield 1.3 against 2.0: 65%
    alerts, summary = H.yield_alerts(rs)
    assert [a["kind"] for a in alerts] == ["yield"]
    assert summary["booking"]["verdict"] == "alert" and summary["booking"]["baseline_runs"] == 7


def test_yield_at_71_percent_is_fine_and_uses_only_the_last_7_runs():
    rs = runs("booking", [(100, 10)] * 5 + [(100, 200)] * 7 + [(100, 142)])
    alerts, summary = H.yield_alerts(rs)
    assert alerts == [] and summary["booking"]["verdict"] == "ok"
    assert summary["booking"]["baseline_median"] == 2.0


def test_a_zero_yield_run_alerts_and_sources_are_judged_apart():
    rs = runs("hostelworld", [(1613, 3374), (680, 5), (677, 0)]) + runs("booking", [(10, 20)] * 4)
    alerts, summary = H.yield_alerts(rs)
    assert [(a["source"], a["kind"]) for a in alerts] == [("hostelworld", "yield")]
    assert summary["booking"]["verdict"] == "ok"


def test_not_enough_history_gives_no_verdict():
    alerts, summary = H.yield_alerts(runs("booking", [(100, 200), (100, 1)]))
    assert alerts == [] and summary["booking"]["verdict"] == "not enough history"


def test_log_parser_skips_sessions_that_read_no_page_and_reads_the_run_label():
    text = ("==== stays scrape 2026-10 hostelworld started do 05/11/2026  1:16:00,00 ====\r\n"
            "session: 677 pages, 0 prices, 0 pages failed, rejected {}\r\n"
            "==== stays scrape 2026-10 hostelworld started do 05/11/2026  2:16:00,00 ====\r\n"
            "session: 0 pages, 0 prices, 0 pages failed, 0 pages with no cards, rejected {}\r\n"
            "STN: 5 pages, 9 prices, 0.1 h\r\n")
    r = H.parse_log(text, source="hostelworld")
    assert r == [{"run": "2026-10", "source": "hostelworld", "started": "do 05/11/2026  1:16:00,00",
                  "pages": 677, "prices": 0}]


def test_drift_alert_over_25_percent_and_thin_runs_are_skipped():
    rows = ([("booking", "ROM", "room", "2026-03", p) for p in (100, 100, 100)]
            + [("booking", "ROM", "room", "2026-09", p) for p in (130, 130, 130)]      # +30%
            + [("booking", "PAR", "room", "2026-03", p) for p in (100, 100, 100)]
            + [("booking", "PAR", "room", "2026-09", p) for p in (120, 120, 120)]      # +20%
            + [("booking", "LIS", "room", "2026-03", p) for p in (100, 100, 100)]
            + [("booking", "LIS", "room", "2026-09", p) for p in (300, 300)])          # thin
    alerts, compared = H.drift_alerts(rows)
    assert compared == 2
    assert [(a["dest_id"], a["move"]) for a in alerts] == [("ROM", 0.3)]


def test_report_and_exit_codes(tmp_path):
    logs = tmp_path / "logs"
    logs.mkdir()
    body = "".join(f"==== stays scrape 2026-0{i} booking started x ====\nsession: 100 pages, 200 prices\n"
                   for i in range(1, 5))
    body += "==== stays scrape 2026-05 booking started x ====\nsession: 100 pages, 10 prices\n"
    (logs / "stays_booking.log").write_text(body, encoding="utf-8")
    out = tmp_path / "health.json"
    code = H.main(["--logs", str(logs), "--journal", str(tmp_path / "none.sqlite"), "--out", str(out)])
    rep = json.loads(out.read_text(encoding="utf-8"))
    assert code == 1 and rep["status"] == "alert" and rep["alerts"][0]["kind"] == "yield"
    assert H.main(["--logs", str(tmp_path / "empty"), "--journal", str(tmp_path / "none.sqlite"),
                   "--out", str(out)]) == 2
    (logs / "stays_booking.log").write_text(body.replace("10 prices", "190 prices"), encoding="utf-8")
    assert H.main(["--logs", str(logs), "--journal", str(tmp_path / "none.sqlite"), "--out", str(out)]) == 0
