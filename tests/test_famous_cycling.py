"""D25 d: the famous cycling hand-off.

data/famous/seed_cycling.json (pipeline/famous/coverage.py --handoff) names
the famous cycle routes the wire lacks. The harvest always assembles their
OSM relations, finds the ones without a relation by name in their own
countries, and brings in a famous superroute's sections as one family; the
export never leaves out a famous row that passes the floor, and one that
misses the score or photo gate ships listed, never as an editorial pick."""

import sys
from array import array
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "cycling"))

import export_cycling as ex  # noqa: E402
import harvest_cycling as hv  # noqa: E402
import seed_cycling as sc  # noqa: E402

FIXTURE = ROOT / "tests" / "fixtures" / "famous" / "seed_cycling.json"


def rel(tags, members=()):
    return {"tags": dict(tags, type=tags.get("type", "route"),
                         route="bicycle"),
            "members": list(members)}


def ways(*ids):
    return [("w", i, "") for i in ids]


# --- the reader -------------------------------------------------------------

def test_reader_reads_the_fixture_and_skips_rows_without_an_id():
    got = sc.famous_entries(FIXTURE)
    assert [e["wd"] for e in got] == ["Q90001", "Q90002", "Q90003"]


def test_reader_returns_nothing_when_the_file_is_absent_or_broken(
        tmp_path, monkeypatch):
    assert sc.famous_entries(tmp_path / "missing.json") == []
    bad = tmp_path / "bad.json"
    bad.write_text("{not json", encoding="utf-8")
    assert sc.famous_entries(bad) == []
    monkeypatch.setattr(sc, "FAMOUS_FILE", tmp_path / "missing.json")
    assert sc.famous_entries() == [] and sc.by_country() == {}


def test_by_country_lists_a_route_in_every_country_it_runs_through():
    groups = sc.by_country(sc.famous_entries(FIXTURE))
    assert [e["wd"] for e in groups["CZ"]] == ["Q90001"]
    assert [e["wd"] for e in groups["DE"]] == ["Q90001", "Q90002", "Q90003"]
    assert [e["wd"] for e in groups["FR"]] == ["Q90002"]


# --- the harvest pin --------------------------------------------------------

def test_a_famous_relation_is_harvested_even_when_the_filter_skips_it():
    pool = {
        1: rel({"name": "Some loop", "network": "lcn"}, ways(11)),
        7: rel({}, ways(71)),                       # no name, no network
        9: rel({}, ways(91)),                       # not famous: stays out
    }
    entries = sc.famous_entries(FIXTURE)
    pins = sc.famous_pins(pool, entries, "DE")
    assert set(pins) == {7}
    assert pins[7] == {"why": "famous", "wd": "Q90003",
                       "name": "Bodensee-Radweg", "how": "osm",
                       "section": False}
    assert not hv.publishable(pool[7]["tags"])
    assert hv.select_routes(pool, pins) == [1, 7]
    # A test run's limit cuts the ordinary routes, never a famous one.
    assert hv.select_routes(pool, pins, limit=1) == [1, 7]
    assert hv.select_routes(pool, {}, limit=1) == [1]


def test_a_relation_id_is_found_in_any_extract():
    # Relation 7 sits in the Austrian extract; the route is listed for DE
    # only, but an id means one thing everywhere.
    pool = {7: rel({"name": "Bodensee-Radweg"}, ways(71))}
    pins = sc.famous_pins(pool, sc.famous_entries(FIXTURE), "AT")
    assert pins[7]["wd"] == "Q90003"


def test_name_lookup_finds_equal_names_in_the_routes_own_countries():
    pool = {
        20: rel({"name": "Elberadweg (Hauptroute)", "network": "ncn"},
                ways(201)),
        21: rel({"name": "Elberadweg Zubringer Dresden"}, ways(211)),
        22: rel({"name": "Labská stezka"}, ways(221)),
        23: rel({"name": "Elberadweg", "network:type": "node_network"},
                ways(231)),
    }
    entries = sc.famous_entries(FIXTURE)
    pins = sc.famous_pins(pool, entries, "DE")
    # Folded equality: brackets and accents off; a feeder ("Zubringer")
    # is another route; a node-network edge is never a route.
    assert set(pins) == {20, 22}
    assert all(p["wd"] == "Q90001" and p["how"] == "name"
               for p in pins.values())
    # Two relations under the route's names are its sections.
    assert all(p["section"] for p in pins.values())
    # Not one of its countries: no lookup by name.
    assert sc.famous_pins(pool, entries, "AT") == {}


def test_a_single_name_hit_is_the_route_itself():
    pool = {20: rel({"name": "Elberadweg"}, ways(201))}
    pins = sc.famous_pins(pool, sc.famous_entries(FIXTURE), "CZ")
    assert pins == {20: {"why": "famous", "wd": "Q90001",
                         "name": "Elbe Cycle Route", "how": "name",
                         "section": False}}


def test_superroute_sections_carry_the_family():
    pool = {
        100: rel({"type": "superroute", "ref": "EV6", "name": "EuroVelo 6"},
                 [("r", 101, ""), ("r", 102, ""), ("r", 103, "alternative")]),
        101: rel({"ref": "EV6"}, ways(1011)),        # unnamed section
        # a national superroute inside it, with two stages
        102: rel({"type": "superroute", "name": "EV6 Frankreich"},
                 [("r", 104, ""), ("r", 105, "")]),
        103: rel({"name": "EV6 Variante"}, ways(1031)),
        104: rel({"name": "EV6 Etappe 1"}, ways(1041)),
        105: rel({}, ways(1051)),
    }
    pins = sc.famous_pins(pool, sc.famous_entries(FIXTURE), "DE",
                          hv.VARIANT_ROLES)
    assert set(pins) == {101, 104, 105}          # no superroute, no variant
    assert all(p["wd"] == "Q90002" and p["name"] == "EuroVelo 6"
               and p["section"] for p in pins.values())
    routes = hv.select_routes(pool, pins)
    assert 100 not in routes and 102 not in routes
    assert {101, 104, 105} <= set(routes)


def test_a_section_row_names_its_famous_route_as_family():
    # Two ways sharing node 2: one continuous line of about 1.1 km.
    way_nodes = {1: array("q", [1, 2]), 2: array("q", [2, 3])}
    ids = np.array([1, 2, 3], dtype=np.int64)
    xs = np.array([135000000, 135100000, 135200000], dtype=np.int32)
    ys = np.array([510000000, 510000000, 510000000], dtype=np.int32)
    locator = hv.NodeLocations(ids, xs, ys)
    mark = {"why": "famous", "wd": "Q90001", "name": "Elbe Cycle Route",
            "how": "name", "section": True}
    info = rel({"name": "Elberadweg Teil 3"}, ways(1, 2))
    rec = hv.build_record(5, info, [1, 2], hv.Counter(), way_nodes, {},
                          locator, None, mark)
    assert rec["raw_tags"]["carta:famous"] == mark
    assert rec["cycle_network"] == "Elbe Cycle Route"
    assert rec["gap_info"]["gap_count"] == 0
    # A network the mapper set (EuroVelo) is kept; no mark, nothing added.
    fam = {"ref": "EV6", "network": "EuroVelo", "rel": 100, "name": "EV6"}
    rec = hv.build_record(5, info, [1, 2], hv.Counter(), way_nodes, {},
                          locator, fam, mark)
    assert rec["cycle_network"] == "EuroVelo"
    rec = hv.build_record(5, info, [1, 2], hv.Counter(), way_nodes, {},
                          locator, None)
    assert "carta:famous" not in rec["raw_tags"]
    assert rec["cycle_network"] is None


# --- the export -------------------------------------------------------------

FAMOUS = {"carta:famous": {"why": "famous", "wd": "Q90003",
                           "name": "Bodensee-Radweg", "section": False}}


def row(i, rating, famous=False, **kw):
    r = {"id": i, "country": "DE", "name": f"Route {i}", "rating": rating,
         "distance_m": 40000, "merged_parts": 1,
         "regions": {"n3": "DE147"}, "images": [],
         "raw_tags": dict(FAMOUS) if famous else {}}
    r.update(kw)
    return r


def test_keep_famous_with_a_cap_of_one():
    rows = [{"id": i} for i in ("a", "b", "famous", "c")]
    out = ex.keep_famous(rows, rows[:1], {"famous"})
    assert [r["id"] for r in out] == ["a", "famous"]
    assert [r["id"] for r in ex.keep_famous(rows, rows[2:3], {"famous"})] \
        == ["famous"]


def test_the_region_quota_does_not_demote_a_famous_route(monkeypatch):
    class Quota:
        @staticmethod
        def has_data():
            return True

        @staticmethod
        def published_target(rid, layer):
            return 1

        @staticmethod
        def floor(rid, layer):
            return 0

    monkeypatch.setattr(ex, "Q", Quota)
    rows = [row(1, 9.0), row(2, 8.0), row(3, 7.0, famous=True)]
    for r in rows:
        r["_tier"] = "r"
    kept, demoted = ex.apply_quotas(rows)
    # Row 2 is over the quota and leaves the wire; the famous row 3, also
    # over it, stays rated.
    tiers = {r["id"]: r["_tier"] for r in kept}
    assert tiers == {1: "r", 3: "r"}
    assert demoted["DE147"] == 1


def test_a_famous_route_under_the_bar_ships_listed_with_its_id():
    photo = {"url": "https://upload.wikimedia.org/x.jpg", "lic": "CC0",
             "no_attribution_required": True, "evidence": "on_line"}
    low = row(3, 4.1, famous=True)
    no_photo = row(4, 8.0, famous=True)
    rated = row(5, 8.0, famous=True, images=[photo, dict(photo, url="y")])
    assert ex.basic_row(low) is None
    assert ex.tier_of(low) == "l"
    assert ex.tier_of(no_photo) == "l"
    assert ex.tier_of(rated) == "r"
    card = ex.route_card(low, ex.tier_of(low))
    assert card["t"] == "l" and "score" not in card
    assert card["k"] == "unrated_coverage"
    assert card["wd"] == "Q90003" and "sec" not in card
    # Not famous: no id on the card.
    assert "wd" not in ex.route_card(row(6, 4.1), "l")


def test_a_famous_section_is_marked_as_a_stretch():
    r = row(7, 4.0, raw_tags={"carta:famous": {
        "why": "famous", "wd": "Q90002", "name": "EuroVelo 6",
        "section": True}}, cycle_network="EuroVelo 6")
    card = ex.route_card(r, "l")
    assert card["wd"] == "Q90002" and card["sec"] == 1
    assert card["fam"] == "EuroVelo 6"


def test_the_floor_is_the_same_for_a_famous_route():
    assert ex.basic_row(row(8, 9.0, famous=True, merged_parts=2)) \
        == "not_continuous"
    assert ex.basic_row(row(9, 9.0, famous=True, regions=None)) \
        == "no_region"
    assert ex.basic_row(row(10, 9.0, famous=True, distance_m=2500)) \
        == "too_short"
    assert ex.famous_of(row(11, 9.0)) is None
    assert ex.famous_of({"raw_tags": {"carta:famous": {"why": "x"}}}) is None
