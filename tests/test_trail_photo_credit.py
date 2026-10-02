"""The trails export applies the credit gate (T280, row T269-f).

Beaches, lakes, mountains and cycling refuse a photograph whose licence owes a
name and which carries none (pipeline/photos/credit.owes_credit). The trails
export did not, and the published wire carried 102 such photographs. These
cases pin the gate in export_wire.credited() and the order it runs in: the
author is cleaned first, so a licence blurb in Commons' Artist field counts as
no author.

Pure functions, no lab needed (export_wire only connects inside main()).

Runs under pytest from the repo root:
    python -m pytest tests/test_trail_photo_credit.py -q
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import export_wire  # noqa: E402


def row(lic, author, title="a.jpg"):
    """A photo row as fetch_images() builds it from the images table."""
    return {"u": f"https://upload.wikimedia.org/x/{title}", "w": 1280,
            "h": 720, "rank": 0, "title": title,
            "author": export_wire.clean_author(author), "license": lic}


def test_named_cc_by_sa_ships():
    assert export_wire.credited([row("CC BY-SA 4.0", "Al*from*Lig")])


def test_cc_by_sa_with_no_author_is_held_back():
    for lic in ("CC BY-SA 4.0", "CC BY-SA 3.0", "CC BY 3.0", "GFDL"):
        assert export_wire.credited([row(lic, None)]) == [], lic
        assert export_wire.credited([row(lic, "   ")]) == [], lic


def test_licence_blurb_in_artist_counts_as_no_author():
    blurb = "This file is available under the Creative Commons licence"
    assert export_wire.clean_author(blurb) is None
    assert export_wire.credited([row("CC BY-SA 3.0", blurb)]) == []


def test_punctuation_is_not_a_name():
    assert export_wire.credited([row("CC BY 3.0", ", ;")]) == []


def test_public_domain_and_cc0_ship_without_author():
    for lic in ("Public domain", "CC0", "PD-self"):
        assert export_wire.credited([row(lic, None)]), lic


def test_no_licence_is_held_back():
    assert export_wire.credited([row("", "Somebody")]) == []
    assert export_wire.credited([row(None, "Somebody")]) == []


def test_order_is_kept_and_only_the_owing_rows_go():
    rows = [row("CC BY-SA 4.0", None, "lead.jpg"),
            row("CC BY-SA 4.0", "Ann", "two.jpg"),
            row("CC0", None, "three.jpg"),
            row("CC BY 3.0", "", "four.jpg")]
    kept = export_wire.credited(rows)
    assert [r["title"] for r in kept] == ["two.jpg", "three.jpg"]


def test_card_hero_comes_from_the_credited_rows():
    """card_images() reads trip["images"], which main() sets to the gated
    rows, so a held-back photo can never lead a card."""
    trip = {"images": export_wire.credited([
        row("CC BY-SA 4.0", None, "owing.jpg"),
        row("CC BY-SA 4.0", "Ann", "named.jpg")])}
    hero = export_wire.card_images(trip)[0]
    assert hero["title"] == "named.jpg"


def test_a_trip_can_lose_every_photo():
    trip = {"images": export_wire.credited([row("CC BY 3.0", None)])}
    assert export_wire.card_images(trip) == []
