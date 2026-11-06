"""Trail photo harvest (T1093, D7 and K2): licence allowlist, pacing, order.

Runs on a recorded Commons geosearch answer; no network, no lab.

    python -m pytest tests/test_trail_photo_harvest.py -q
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import export_wire  # noqa: E402
import photo_licence  # noqa: E402
import trail_images  # noqa: E402

FIX = json.loads((ROOT / "tests" / "fixtures" / "trail_photos"
                  / "commons_geosearch.json").read_text(encoding="utf-8"))


def test_allowlist():
    for lic in ("CC0", "CC BY 4.0", "CC BY-SA 3.0", "CC BY-SA 2.5 it",
                "Public domain", "PD-self"):
        assert photo_licence.reusable(lic), lic
    for lic in ("CC BY-NC 2.0", "CC BY-ND 4.0", "CC BY-NC-SA 3.0", "GFDL",
                "GFDL 1.2", "unknown", "", None, "Attribution"):
        assert not photo_licence.reusable(lic), lic


def test_recorded_candidates_keep_only_reusable_licences():
    row = {"id": 1, "title": "", "points": [(47.87, 8.0)]}
    cands = trail_images.candidates_for(row, fetch=lambda params: FIX)
    assert len(cands) == 4          # the harvest collects everything it sees
    kept = [c for c in cands if photo_licence.reusable(
        c["info"]["extmetadata"]["LicenseShortName"]["value"])]
    assert sorted(c["title"] for c in kept) == [
        "File:Old map.jpg", "File:Trail in autumn.jpg"]


def test_pick_never_lets_a_forbidden_licence_take_a_slot():
    row = {"id": 1, "title": "", "country": "DE", "distance_m": 10000,
           "points": [(47.87, 8.0)], "highlights": []}
    cands = trail_images.candidates_for(row, fetch=lambda params: FIX)
    for c in cands:
        c["off_m"], c["along_m"] = 10, 100
    picked = trail_images.pick(cands, row, {})
    lics = {c["info"]["extmetadata"]["LicenseShortName"]["value"]
            for c in picked}
    assert lics == {"CC BY-SA 4.0"}      # 'Hut in snow' scores well but is NC
    assert [c["title"] for c in picked] == ["File:Trail in autumn.jpg"]


def test_export_drops_other_licences_and_names_the_author():
    rows = [
        {"u": "x", "w": 1, "h": 1, "license": "CC BY-NC 2.0", "author": "Bob"},
        {"u": "y", "w": 1, "h": 1, "license": "GFDL 1.2", "author": "Cy"},
        {"u": "z", "w": 1, "h": 1, "license": "CC BY-SA 4.0", "author": "Ann"},
        {"u": "p", "w": 1, "h": 1, "license": "Public domain", "author": None},
    ]
    assert [r["u"] for r in export_wire.credited(rows)] == ["z", "p"]


def test_card_img_carries_the_credit():
    got = export_wire.card_img({
        "u": "z", "w": 10, "h": 5, "license": "CC BY-SA 4.0",
        "author": "Ann", "license_url": "https://cc/by-sa/4.0",
        "page": "https://commons.wikimedia.org/wiki/File:z.jpg"})
    assert got == {"u": "z", "w": 10, "h": 5, "lic": "CC BY-SA 4.0",
                   "by": "Ann", "licUrl": "https://cc/by-sa/4.0",
                   "page": "https://commons.wikimedia.org/wiki/File:z.jpg"}
    pd = export_wire.card_img({"u": "p", "w": 1, "h": 1,
                               "license": "Public domain", "author": None})
    assert "by" not in pd and pd["lic"] == "Public domain"


def test_pacer_holds_one_request_per_interval():
    now = [0.0]
    slept = []

    def sleep(s):
        slept.append(s)
        now[0] += s

    p = trail_images.Pacer(1.0, clock=lambda: now[0], sleep=sleep)
    for _ in range(4):
        p.wait()
    assert round(sum(slept), 6) == 3.0      # the first call is free


def test_worst_covered_country_goes_first():
    cov = {"DE": (203, 4725), "IT": (127, 1280), "GB": (226, 1910),
           "FR": (155, 962), "CH": (154, 391)}
    assert trail_images.order_countries(["CH", "FR", "GB", "IT", "DE"], cov) \
        == ["DE", "IT", "GB", "FR", "CH"]
    assert trail_images.order_countries(["DE", "XX"], cov)[0] == "XX"


def test_wire_coverage_reads_the_shipped_wire():
    cov = trail_images.wire_coverage(ROOT / "continent-app" / "public" / "trails")
    if cov:
        got, tot = cov["DE"]
        assert 0 <= got <= tot
