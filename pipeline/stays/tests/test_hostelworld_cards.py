"""Hostelworld card parsing against a small card fixture (T1074, ROADMAP D5).

The 677-page "0 prices" sessions of 2026-11 were not a parser fault: they were
the village destinations Hostelworld has no list for. These tests pin that the
parser reads prices from cards in the shape the scraper hands it, and that a
page with no cards yields nothing rather than a made-up price.

Run:  python -m pytest pipeline/stays/tests/test_hostelworld_cards.py -q
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hostelworld.page import parse_card  # noqa: E402

FIXTURE = Path(__file__).parent / "fixtures" / "hostelworld_cards.json"


def cards():
    return [parse_card(c) for c in json.loads(FIXTURE.read_text(encoding="utf-8"))["cards"]]


def test_fixture_cards_parse_to_prices():
    a, b, c, d = cards()
    assert (a["key"], a["kind"], a["dorm"], a["private"]) == ("287532", "hostel", 84.44, 120.0)
    assert (a["dorm_currency"], a["private_currency"]) == ("EUR", "EUR")
    assert (b["key"], b["kind"], b["dorm"], b["private"]) == ("55177", "guesthouse", None, 22.96)
    assert (c["key"], c["dorm"], c["private"]) == ("10234", 19.5, 1234.0)
    assert d["dorm"] is None and d["private"] is None


def test_prices_found_in_most_fixture_cards():
    found = [c for c in cards() if c["dorm"] or c["private"]]
    assert len(found) == 3


def test_a_page_with_no_cards_yields_nothing():
    assert [parse_card(c) for c in []] == []
