"""The observation contract (T643): card readers, legacy rows, the migration.

Run:  python -m pytest pipeline/stays/tests -q
"""

import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import build_stays as B  # noqa: E402
from booking.page import card_price, per_ok  # noqa: E402
from common import SCHEMA_SQL, insert_obs, journal, migrate_scrape  # noqa: E402
from hostelworld.page import city_url, parse_card  # noqa: E402


def card(price, tax="Includes taxes and charges", per="1 night, 2 adults"):
    return {"priceLines": price, "tax": tax, "priceFor": per}


def test_booking_price_with_and_without_taxes():
    c = card_price(card("€90"))
    assert (c["price"], c["currency"], c["tax_included"], c["from_or_discount"]) == (90, "EUR", 1, 0)
    c = card_price(card("€100", tax="+€12 taxes and charges"))
    assert (c["price"], c["tax_included"]) == (112, 1)
    assert card_price(card("€100", tax=None))["tax_included"] == 0


def test_booking_discount_takes_the_price_paid():
    c = card_price(card("€120\n€90"))
    assert (c["price"], c["from_or_discount"]) == (90, 1)


def test_booking_other_currency_is_named_not_guessed():
    assert card_price(card("£85"))["currency"] == "GBP"
    assert card_price(card("no price here")) is None


def test_per_text_must_match_the_search():
    assert per_ok("1 night, 2 adults", 2)
    assert per_ok("1 night, 1 adult", 1)
    assert not per_ok("2 nights, 2 adults", 2)
    assert not per_ok("1 night, 2 adults", 1)
    assert not per_ok(None, 2)


def test_hostelworld_reads_the_currency_and_forces_euros():
    c = parse_card({"href": "/hostels/p/1/x/", "text": "X\nHostel\nDorms From\n£20.00\nPrivates From\n£50"})
    assert (c["dorm"], c["dorm_currency"], c["private_currency"]) == (20.0, "GBP", "GBP")
    assert city_url("Lisbon", "Portugal", "2027-01-12", "2027-01-13").endswith("&currency=EUR")


def row(**kw):
    r = {"source": "booking", "dest_id": "X", "prop_key": "k", "kind": "hotel", "stars": None,
         "bed": "room", "adults": 2, "chk_in": "2027-01-12", "nights": 1, "price_eur": 100.0,
         "captured": "2026-10-23T10:00:00Z"}
    r.update(kw)
    return r


def test_legacy_rows_take_the_sources_known_behaviour():
    r, why = B.contract(row(), None)
    assert why is None and r["legacy"] and (r["currency"], r["unit"], r["tax_included"]) == ("EUR", "room", 1)
    r, why = B.contract(row(source="hostelworld", kind="hostel", bed="dorm", adults=1), None)
    assert why is None and r["unit"] == "bed"


def test_unknown_unit_or_currency_is_rejected():
    assert B.contract(row(source="hostelworld", bed="private", adults=1), None)[1] == "unit unknown"
    assert B.contract(row(source="hostelworld", bed="private", adults=1), "person")[1] is None
    assert B.contract(row(currency="GBP", unit="room"), None)[1] == "currency GBP"
    assert B.contract(row(source="mystery"), None)[1] == "unit unknown"
    assert B.contract(row(currency="EUR", unit="room", per_text="2 nights, 2 adults"),
                      None)[1] == "not the searched adults"


def test_migration_is_additive_and_old_rows_still_load(tmp_path):
    p = tmp_path / "j.sqlite"
    con = sqlite3.connect(p)
    con.executescript(SCHEMA_SQL)
    con.execute("insert into obs values (?,?,?,?,?,?,?,?,?,?,?,?)",
                ("booking", "X", "old", "hotel", 3, "room", 2, "2027-01-12", 1, 80.0, None,
                 "2026-10-23T09:00:00Z"))
    con.commit()
    con = journal(p)
    migrate_scrape(con)
    migrate_scrape(con)                                  # twice is harmless
    insert_obs(con, source="hostelworld", dest_id="X", prop_key="new", kind="hostel",
               stars=None, bed="private", adults=1, chk_in="2027-01-12", nights=1,
               price_eur=30.0, ota=None, captured="2026-10-23T09:00:00Z", currency="EUR",
               unit="person", tax_included=None, from_or_discount=1, price_text="€30",
               per_text=None)
    con.commit()
    stats = {}
    obs = B.load_obs(con, {}, {"X": "PT"}, stats)
    assert {o["key"]: round(o["price"]) for o in obs} == {"booking:old": 80, "hostelworld:new": 60}
    assert stats["booking"]["legacy"] == 1 and stats["hostelworld"]["legacy"] == 0
