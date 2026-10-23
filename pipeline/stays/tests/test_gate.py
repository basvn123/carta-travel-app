"""The publish gate blocks broken scrapes (T645, invariant V14).

A small two-country world goes through the real journal, load step and build;
then four broken scrapes of it are built and gated against the good one.

Run:  python -m pytest pipeline/stays/tests -q
"""

import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import build_stays as B  # noqa: E402
from common import insert_obs, journal, migrate_scrape  # noqa: E402

DESTS = [{"id": f"{cc}{i}", "iso2": cc, "city": f"{cc}{i}", "country": cc,
          "lat": lat + i * 2.0, "lon": lon + i * 2.0, "pop": 300_000}
         for cc, lat, lon in (("PT", 38.0, -9.0), ("ES", 40.0, -3.0)) for i in range(3)]
ISO = {d["id"]: d["iso2"] for d in DESTS}


def scrape(tmp_path, name, times=1.0, currency="EUR", hw_private_unit="person", drop=None):
    """Write one scrape into a fresh journal and build it: (records, stats)."""
    con = journal(tmp_path / f"{name}.sqlite")
    migrate_scrape(con)
    day0 = date(2027, 1, 12)
    for d in DESTS:
        if drop and d["iso2"] == drop:
            continue
        for m in range(4):
            day = (day0 + timedelta(weeks=4 * m)).isoformat()
            for j in range(4):
                insert_obs(con, source="booking", dest_id=d["id"], prop_key=f"h{j}", kind="hotel",
                           stars=3, bed="room", adults=2, chk_in=day, nights=1,
                           price_eur=(90 + 10 * j) * times, captured="2026-10-23T10:00:00Z",
                           currency=currency, unit="room", tax_included=1, from_or_discount=0)
                insert_obs(con, source="hostelworld", dest_id=d["id"], prop_key=f"x{j}",
                           kind="hostel", bed="dorm", adults=1, chk_in=day, nights=1,
                           price_eur=(22 + j) * times, captured="2026-10-23T10:00:00Z",
                           currency="EUR", unit="bed", from_or_discount=1)
                insert_obs(con, source="hostelworld", dest_id=d["id"], prop_key=f"x{j}",
                           kind="hostel", bed="private", adults=1, chk_in=day, nights=1,
                           price_eur=(30 + j) * times, captured="2026-10-23T10:00:00Z",
                           currency="EUR", unit=hw_private_unit, from_or_discount=1)
    con.commit()
    stats = {}
    obs = B.load_obs(con, {}, ISO, stats, "person")
    stats = {s: dict(v, rejected=dict(v["rejected"])) for s, v in stats.items()}
    return B.build(DESTS, obs, {}, {}, {}), stats


def gate(tmp_path, **broken):
    good, _ = scrape(tmp_path, "good")
    bad, stats = scrape(tmp_path, "bad", **broken)
    return B.gates(bad, ISO, stats, prev=good)[0]


def test_the_good_scrape_passes_against_itself(tmp_path):
    good, stats = scrape(tmp_path, "good")
    assert B.gates(good, ISO, stats, prev=good)[0] == []


def test_prices_times_three_are_blocked(tmp_path):
    fails = gate(tmp_path, times=3.0)
    assert any(f.startswith("jump PT") for f in fails)


def test_a_gbp_page_is_blocked(tmp_path):
    fails = gate(tmp_path, currency="GBP")
    assert any(f.startswith("contract: booking") for f in fails)


def test_an_empty_country_is_blocked(tmp_path):
    fails = gate(tmp_path, drop="ES")
    assert any(f.startswith("loss ES") for f in fails)


def test_a_per_person_private_stored_as_a_room_is_blocked(tmp_path):
    fails = gate(tmp_path, hw_private_unit="room")
    assert any(f.startswith("jump PT private") for f in fails)


def test_an_explained_move_passes(tmp_path):
    good, _ = scrape(tmp_path, "good")
    bad, stats = scrape(tmp_path, "bad", times=3.0)
    lv, _ = B.summarise(bad, ISO)
    explain = [{"key": f"{cc}:{k}", "new": v, "reason": "test", "who": "test", "date": "2026-10-23"}
               for cc, kk in lv.items() for k, v in kk.items()] + \
              [{"key": f"{did}:{k}", "new": B.bed_value(r, k), "reason": "test"}
               for did, r in bad.items() for k in B.BED_TYPES if B.bed_value(r, k)]
    assert B.gates(bad, ISO, stats, prev=good, explain=explain)[0] == []


def test_serpapi_judges_this_build(tmp_path):
    good, _ = scrape(tmp_path, "good")
    hotel3 = B.bed_value(good["PT0"], "hotel3")
    refs = [{"dest": "PT0", "bed": "hotel3", "month": 1, "google": hotel3 * 3}] * 12
    fails = B.gates(good, ISO, {}, prev=good, calib={"refs": refs})[0]
    assert any(f.startswith("SerpApi") for f in fails)
