"""The parking cache to public.facts mapping T327 wrote for T147 (row T041-f).

The real cache (cache/dossier/parking_web.json) is not in git, so these tests
use records shaped like it; `python pipeline/facts/parking_fold.py --check`
runs the same round trip over the real file.

Run from the repo root: pytest tests/test_parking_fold.py -q
"""

import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PATHS = [os.path.join(ROOT, "pipeline", "facts"), os.path.join(ROOT, "pipeline", "dossier")]

# The trips pipeline has a module called common too: import against the
# dossier one, then restore sys.modules and sys.path (see test_blocked_domains).
_other = sys.modules.pop("common", None)
sys.path[:0] = PATHS
import build_dossier  # noqa: E402
import parking_fold as pf  # noqa: E402
for _p in PATHS:
    sys.path.remove(_p)
sys.modules.pop("common", None)
if _other is not None:
    sys.modules["common"] = _other

SOURCED = {
    "official_url": "https://romamobilita.it/muoversi-a-roma/parcheggio-di-scambio/",
    "restricted": True,
    "restricted_note": "The centre is a limited-traffic zone.",
    "car_parks": [{"name": "STAZIONE TIBURTINA", "note": "2,00 euro per 12h"}],
    "park_ride_names": ["ANAGNINA"],
    "advice": "Park at a metro park-and-ride and ride in.",
    "confidence": "high",
    "sources": ["https://www.atac.roma.it/utility/atac-sosta/parcheggi",
                "https://romamobilita.it/muoversi-a-roma/parcheggio-di-scambio/"],
    "checked": "2026-09-15",
    "model": "manual",
}
EMPTY = {"restricted": False, "confidence": "low", "checked": "2026-09-15", "model": "manual"}
BLOCKED_ONLY = dict(SOURCED, sources=["https://www.tripadvisor.it/ShowTopic-x"])

# The field check T041's DDL puts on public.facts.field.
FIELD_RE = re.compile(r"^[a-z]+(\.[a-z0-9-]+)+$")


def _today(did, rec):
    build_dossier._PARKING_WEB = {did: rec}
    return build_dossier.parking_web_overlay({"id": did})


def test_sourced_record_round_trips():
    row = pf.record_to_row("FCO", SOURCED)
    assert row["entity_key"] == "dest:FCO"
    assert FIELD_RE.match(row["field"]) and row["field"].split(".")[0] == row["class"]
    assert row["status"] == "ok" and row["confidence"] == "sourced"
    assert row["source_url"] == SOURCED["official_url"]
    assert row["fetched_at"] == "2026-09-15T00:00:00Z"
    assert row["expires_at"] == "2026-12-14T00:00:00Z"
    assert row["queries"] == 0
    assert pf.row_to_overlay(row) == _today("FCO", SOURCED)


def test_unsourced_record_is_withheld():
    row = pf.record_to_row("gem:kotor", EMPTY)
    assert row["status"] == "unsourced" and row["value"] is None
    assert pf.row_to_overlay(row) is None
    # Today the same record still prints a block with an uncited claim.
    assert _today("gem:kotor", EMPTY) == {"checked": "2026-09-15", "restricted": False}


def test_aggregator_sources_do_not_count():
    row = pf.record_to_row("X", BLOCKED_ONLY)
    assert row["status"] == "unsourced" and row["source_url"] is None


def test_unchecked_record_has_no_row():
    assert pf.record_to_row("X", {"restricted": True}) is None


def test_stale_row_still_serves():
    row = dict(pf.record_to_row("FCO", SOURCED), status="stale")
    assert pf.row_to_overlay(row) == _today("FCO", SOURCED)
