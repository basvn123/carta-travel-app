"""T740: a refused tile is skipped, and the deadline stops new fetches.
Run: python -m pytest tests/test_sea_temp_resilience.py"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
import harvest_sea_temp as hs  # noqa: E402


def _reset():
    hs.FAILED_TILES.clear()
    hs.SKIPPED_BY_DEADLINE.clear()
    hs.DEADLINE = None


def test_refused_tile_is_skipped_and_cached_tiles_still_answer(tmp_path, monkeypatch):
    _reset()
    tiles = tmp_path / "sea_temp"
    tiles.mkdir()
    (tiles / "40_14.json").write_text(json.dumps(
        {"tile": [40, 14], "stride": 3, "cells": [[40.06, 14.06, [15.0] * 12]]}))

    def refuse(*a, **k):
        raise OSError("HTTP Error 503")
    monkeypatch.setattr(hs.urllib.request, "urlopen", refuse)
    monkeypatch.setattr(hs.time, "sleep", lambda s: None)
    # 40.05,14.05 with a 20 km window reads tile 40_14 (cached) and 39_13, 39_14, 40_13 (refused)
    hit = hs.lookup(40.05, 14.05, tmp_path, 20.0)
    assert hit and hit[0] == [15.0] * 12
    assert hs.FAILED_TILES, "the refused tiles are recorded"
    _reset()


def test_deadline_stops_new_fetches(tmp_path, monkeypatch):
    _reset()
    called = []
    monkeypatch.setattr(hs.urllib.request, "urlopen", lambda *a, **k: called.append(1))
    hs.DEADLINE = time.monotonic() - 1
    assert hs.fetch_tile(35, 24, tmp_path) == {}
    assert called == [] and (35, 24) in hs.SKIPPED_BY_DEADLINE
    _reset()
