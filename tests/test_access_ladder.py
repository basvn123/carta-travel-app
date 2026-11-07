"""T1213: the stays scrapers honour the data access ladder flags (off by default)."""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "stays"))
from ladder import ladder_on, refuse_if_stopped  # noqa: E402

CFG = json.loads((ROOT / "continent-app" / "config" / "access-ladder.json").read_text(encoding="utf-8"))
ENVS = {s["flag"]["env"] for s in CFG["sources"]}


def test_off_by_default_and_only_one_turns_on():
    for env in ENVS:
        assert not ladder_on(env, {})
        assert not ladder_on(env, {env: "true"})
        assert ladder_on(env, {env: "1"})


def test_scrapers_name_flags_that_exist_in_config():
    for f, env in [("scrape_booking.py", "LADDER_STOP_BOOKING_SCRAPE"),
                   ("scrape_hostelworld.py", "LADDER_STOP_HOSTELWORLD_SCRAPE")]:
        assert env in ENVS
        assert env in (ROOT / "pipeline" / "stays" / f).read_text(encoding="utf-8")


def test_refuse_when_on():
    with pytest.raises(SystemExit):
        refuse_if_stopped("LADDER_STOP_BOOKING_SCRAPE", "x", {"LADDER_STOP_BOOKING_SCRAPE": "1"})
    refuse_if_stopped("LADDER_STOP_BOOKING_SCRAPE", "x", {})
