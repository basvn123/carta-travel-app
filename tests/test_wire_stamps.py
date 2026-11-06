"""T1099 (D12): every wire writer stamps a real build time, and the freshness
report catches a missing or constant stamp."""
import importlib.util
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
spec = importlib.util.spec_from_file_location("freshness_report", ROOT / "scripts" / "freshness_report.py")
fr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fr)
from wire_stamp import build_stamp

# wire -> writer file(s) holding its stamp line
WRITERS = {
    "app_data": ["pipeline/apply_rating_layer.py"],
    "destinfo": ["pipeline/export_destinfo.py"],
    "trips": ["pipeline/trips/export_trips.py"],
    "journeys": ["pipeline/journeys/build_wire.py"],
    "region": ["pipeline/regions/export_regions.py"],
    "trails": ["pipeline/trails/export_wire.py"],
    "beaches": ["pipeline/beaches/export_beaches.py"],
    "lakes": ["pipeline/lakes/export_lakes.py"],
    "mountains": ["pipeline/mountains/export_peaks.py"],
    "cycling": ["pipeline/cycling/export_cycling.py"],
    "dossier": ["pipeline/dossier/build_dossier.py"],
    "guided": ["pipeline/guided_search_layer.py"],
    "reach": ["tools/reachability/build_reach.py"],
    "ask": ["pipeline/ask_index_layer.py"],
}
CLOCK = re.compile(r"datetime\.now\(|time\.gmtime\(|build_stamp\(|now_utc\(")
LITERAL = re.compile(r"""["'](?:generated_at|computed_at|built)["']\s*:\s*["']\d{4}-\d{2}-\d{2}""")
KEY = re.compile(r"""["'](?:generated_at|computed_at|built)["']""")


def test_every_wire_has_a_writer_entry():
    assert set(WRITERS) <= set(fr.WIRES)
    assert set(fr.WIRES) - set(WRITERS) <= {"coverage", "joins"}


def test_writers_read_the_clock_and_never_a_literal():
    for wire, files in WRITERS.items():
        for f in files:
            src = (ROOT / f).read_text(encoding="utf-8")
            assert KEY.search(src) or "generated_at" in src, f"{wire}: no stamp key in {f}"
            assert CLOCK.search(src), f"{wire}: {f} never reads the clock"
            assert not LITERAL.search(src), f"{wire}: {f} stamps a literal date"


def test_build_stamp_follows_the_clock():
    a = build_stamp(datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc))
    b = build_stamp(datetime(2026, 1, 2, 3, 4, 6, tzinfo=timezone.utc))
    assert a == "2026-01-02T03:04:05Z" and a != b
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", build_stamp())


def _wire(tmp_path, body):
    (tmp_path / "x.json").write_text(json.dumps(body))
    return fr.check_wire("x", tmp_path, datetime(2026, 11, 6, tzinfo=timezone.utc),
                         ("x.json", "generated_at", [], 30))


def test_report_flags_missing_constant_and_old(tmp_path):
    assert _wire(tmp_path, {})["status"] == "missing_stamp"
    assert _wire(tmp_path, {"generated_at": "2026-05-12T12:00:00Z"})["status"] == "constant_stamp"
    assert _wire(tmp_path, {"generated_at": "2026-11-01"})["status"] == "constant_stamp"
    old = _wire(tmp_path, {"generated_at": "2026-09-01T10:00:00Z"})
    assert old["status"] == "ok" and old["over_cadence"] is True and old["age_days"] > 60
    new = _wire(tmp_path, {"generated_at": "2026-11-05T10:00:00Z"})
    assert new["over_cadence"] is False


def test_report_runs_on_shipped_data():
    public = ROOT / "continent-app" / "public"
    if not (public / "trips" / "index.json").exists():
        return
    rep = fr.build_report(public)
    assert rep["meta"]["n_wires"] == len(fr.WIRES)
    shipped = [r for r in rep["wires"] if r["status"] != "missing_file"]
    assert shipped and all(r["built_at"] for r in shipped)
