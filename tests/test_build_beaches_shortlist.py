"""D25 i (2026-11-23): build_beaches.py sizes the shortlist from the region
quotas (it passed the flat floor of 170 before, which cut every rebuilt rich
cache back to 170 rows), passes --no-context through, and stops starting
countries after --max-hours while the export still runs."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "beaches"))

import build_beaches  # noqa: E402


def _run(monkeypatch, argv, clock=None):
    calls, exported = [], []
    monkeypatch.setattr(build_beaches.harvest_beaches, "COUNTRIES", ["AA", "BB", "CC"])
    monkeypatch.setattr(build_beaches, "load_cache", lambda stage, cc: {"beaches": []})
    monkeypatch.setattr(build_beaches.enrich_beaches, "load_bathing", lambda: {})
    monkeypatch.setattr(build_beaches.enrich_beaches, "load_protected", lambda: [])
    monkeypatch.setattr(build_beaches.enrich_beaches, "build_dest_index", lambda: [])
    monkeypatch.setattr(build_beaches.enrich_beaches, "NearIndex", lambda rows: None)
    monkeypatch.setattr(build_beaches.enrich_beaches, "make_readers",
                        lambda aspect=True: ("aspect", "protection"))
    monkeypatch.setattr(build_beaches.enrich_beaches, "DEADLINE", None)

    def enrich(cc, **kw):
        calls.append((cc, kw))
    monkeypatch.setattr(build_beaches.enrich_beaches, "enrich_country", enrich)
    monkeypatch.setattr(build_beaches.export_beaches, "main",
                        lambda: exported.append(list(sys.argv)))
    if clock is not None:
        monkeypatch.setattr(build_beaches.time, "monotonic", clock)
    monkeypatch.setattr(sys, "argv", ["build_beaches.py", "--skip-harvest", *argv])
    build_beaches.main()
    return calls, exported


def test_the_shortlist_is_sized_from_the_quotas_by_default(monkeypatch):
    calls, exported = _run(monkeypatch, [])
    assert [cc for cc, _ in calls] == ["AA", "BB", "CC"]
    for _, kw in calls:
        assert kw["shortlist_n"] is None          # enrich_beaches sizes it
        assert kw["context"] is True
        assert kw["aspect_reader"] == "aspect"
        assert kw["protection_reader"] == "protection"
    assert exported


def test_an_explicit_shortlist_and_no_context_pass_through(monkeypatch):
    calls, _ = _run(monkeypatch, ["--shortlist", "50", "--no-context"])
    assert all(kw["shortlist_n"] == 50 and kw["context"] is False for _, kw in calls)


def test_max_hours_stops_starting_countries_but_still_exports(monkeypatch, capsys):
    ticks = iter([0.0, 10.0, 7200.0, 7200.0, 7200.0, 7200.0])
    calls, exported = _run(monkeypatch, ["--max-hours", "1"],
                           clock=lambda: next(ticks, 7200.0))
    assert [cc for cc, _ in calls] == ["AA"]
    assert build_beaches.enrich_beaches.DEADLINE == 3600.0
    assert "not enriched this run: BB, CC" in capsys.readouterr().out
    assert exported


def test_the_beaches_task_runs_the_photograph_pass_with_a_budget():
    sys.path.insert(0, str(ROOT))
    from pipeline.tasks.outdoor import TASKS
    cmd = next(t for t in TASKS if t["key"] == "beaches")["cmds"][0]
    tail = cmd[cmd.index("pipeline/beaches/build_beaches.py"):]
    assert "--no-context" in tail and "--max-hours" in tail
