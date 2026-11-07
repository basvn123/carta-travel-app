"""T1184 (ROADMAP D24): multi-stage treks, grouped and ordered on fixtures.

No lab: treks.build reads wire rows. tests/fixtures/trail_treks/{DE,AT}.json
are two small country files with one case per rule: a superroute listed out
of order with a stage only its name ties in and a variant, a published
parent row, a trek tied only by names, a cross-border trek, and one group
for each refusal reason.

    python -m pytest tests/test_trail_treks.py -q
"""

import copy
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import treks  # noqa: E402

FIX = ROOT / "tests" / "fixtures" / "trail_treks"


@pytest.fixture
def wire():
    return treks.read_wire(FIX)


def rows_of(files):
    return [r for doc in files.values() for r in doc.get("trips") or []]


@pytest.fixture
def built(wire):
    reg = treks.Registry([{
        "name": "Werdenfelser Weg", "aliases": [],
        "evidence": {"wikidata": "Q999", "osm": {"relation_id": 777}},
    }])
    return treks.build(rows_of(wire), parent_osm={101: 777, 102: 777},
                       registry=reg, asof="2026-11-06")


def by_name(trek_list, name):
    return next(t for t in trek_list if t["name"].startswith(name))


@pytest.mark.parametrize("name,want", [
    ("Adlerweg Etappe 12", ("Adlerweg", 12, "")),
    ("HRP Étape 32", ("HRP", 32, "")),
    ("Green Link Walk (Section 4)", ("Green Link Walk", 4, "")),
    ("BergeSeen Trail 15: Gosau-Hintertal - Hallstatt", ("BergeSeen Trail", 15, "")),
    ("Via Apsyrtides #9: Cunski => Mali Losinj", ("Via Apsyrtides", 9, "")),
    ("Rīvas loki (1. posms)", ("Rīvas loki", 1, "")),
    ("Eesti Jaakobitee Day 4: Rapla - Marjamaa", ("Eesti Jaakobitee", 4, "")),
    ("Il Cammino di Sant'Antonio: Tappa 3A", ("Il Cammino di Sant'Antonio", 3, "a")),
    ("GR01FLO Grande Rota das Flores (Etapa 2)", ("GR01FLO Grande Rota das Flores", 2, "")),
    ("Étape 09", ("", 9, "")),
])
def test_stage_names_parse(name, want):
    assert treks.parse_stage_name(name) == want


@pytest.mark.parametrize("name", [
    "West Highland Way", "Mythenweg", "GR 7 - Andorra", "E4", "Tour du Mont Blanc",
])
def test_plain_names_are_not_stages(name):
    assert treks.parse_stage_name(name) is None


def test_counts_on_the_fixture(built):
    trek_list, refs, report = built
    assert report["treks"] == 4
    assert report["refused"] == {"single_stage": 1, "order_conflict": 1,
                                 "loop_network": 1, "not_one_path": 1,
                                 "too_many": 0}
    assert report["rows_left_out"]["variant"] == 1
    assert report["stages_in_treks"] == len(refs) == 13
    assert report["treks_cross_border"] == 1
    assert report["treks_without_parent_row"] == 3
    assert report["superroute_groups_with_parent_record"] == 3


def test_superroute_order_and_name_stage(built):
    trek_list, refs, _ = built
    t = by_name(trek_list, "Werdenfelser Weg")
    assert [s["id"] for s in t["stages"]] == [102, 104, 101, 103, 105]
    assert [s["i"] for s in t["stages"]] == [1, 2, 3, 4, 6]
    assert t["missing"] == [5]
    assert 106 not in refs                         # the variant stays out
    assert t["how"] == ["name", "superroute", "registry"]
    assert t["order"] == "name"       # stage 6 has no member position
    assert t["wd"] == "Q999" and t["osm"] == 777 and t["id"] == "trek-r777"
    assert t["km"] == 40.0 and t["n"] == 5 and t["days"] == 5
    assert t["up"] == 2000 and t["min"] == 900
    assert t["_src"] == "osm" and t["_asof"] == "2026-11-06"
    assert refs[101] == {"id": "trek-r777", "cc": "DE", "i": 3, "n": 5}


def test_published_parent_row_is_linked(built):
    t = by_name(built[0], "Isarsteig")
    assert t["row"] == 200 and t["osm"] == 4242 and t["id"] == "trek-r4242"
    assert [s["id"] for s in t["stages"]] == [201, 202]
    assert t["order"] == "position"
    assert 200 not in built[1]                    # the parent is not a stage


def test_names_alone_make_a_trek_when_the_line_agrees(built):
    t = by_name(built[0], "Kammweg")
    assert t["how"] == ["name"]
    assert t["id"] == "trek-de-kammweg"
    assert [s["i"] for s in t["stages"]] == [1, 2, 3]


def test_cross_border_trek_is_filed_once(built):
    trek_list, refs, _ = built
    t = by_name(trek_list, "Grenzsteig")
    assert t["cc"] == "DE" and t["countries"] == ["AT", "DE"]
    assert refs[503]["cc"] == "DE"                # the AT stage points at DE
    assert t["days"] == 4                         # stage 3 is a two-day walk


def test_refusals_are_named(built):
    sample = {g["name"]: g["reason"] for g in built[2]["refused_sample"]}
    assert sample["Einsamer Weg"] == "single_stage"
    assert sample["Doppelweg"] == "order_conflict"
    assert sample["Rundwanderweg Dorfen"] == "loop_network"
    assert sample["Weitweg"] == "not_one_path"


def test_the_order_survives_shuffled_input(wire):
    rows = rows_of(wire)
    a = treks.build(rows, asof="2026-11-06")[0]
    b = treks.build(list(reversed(rows)), asof="2026-11-06")[0]
    assert [t["id"] for t in a] == [t["id"] for t in b]
    assert [[s["id"] for s in t["stages"]] for t in a] == \
           [[s["id"] for s in t["stages"]] for t in b]


def test_apply_stamps_rows_and_files(wire, built):
    files = copy.deepcopy(wire)
    trek_list, refs, _ = built
    treks.apply(files, trek_list, refs)
    de, at = files["DE"], files["AT"]
    assert {t["name"] for t in de["treks"]} >= {"Werdenfelser Weg", "Grenzsteig"}
    assert "treks" not in at                      # Grenzsteig is filed in DE
    by_id = {r["id"]: r for r in de["trips"] + at["trips"]}
    assert by_id[502]["trek"]["id"] == by_id[501]["trek"]["id"]
    assert "trek" not in by_id[600]
    # Re-applying with nothing clears what a previous run stamped.
    treks.apply(files, [], {})
    assert "treks" not in files["DE"]
    assert all("trek" not in r for r in files["DE"]["trips"])


def test_ids_are_unique(built):
    ids = [t["id"] for t in built[0]]
    assert len(ids) == len(set(ids))


def test_export_files_the_treks_with_their_first_stage(wire, built):
    """export_wire.country_file carries `treks` only where some are filed,
    and parent_osm_of reads the lab's chosen parent before the graph's."""
    sys.path.insert(0, str(ROOT / "pipeline"))
    import export_wire

    trek_list, _, _ = built
    de_treks = [t for t in trek_list if t["cc"] == "DE"]
    doc = export_wire.country_file("DE", wire["DE"]["trips"], [], "2026-11-06T00:00:00+00:00",
                                   25, de_treks)
    assert [t["id"] for t in doc["treks"]] == [t["id"] for t in de_treks]
    assert "treks" not in export_wire.country_file("AT", wire["AT"]["trips"], [],
                                                   "2026-11-06T00:00:00+00:00", 25, [])
    assert export_wire.parent_osm_of([
        {"id": 1, "stage_of": 10, "parent_refs": [20]},
        {"id": 2, "stage_of": None, "parent_refs": [30, 40]},
        {"id": 3, "parent_refs": []},
    ]) == {1: 10, 2: 30}


# --- T1201 (T1184-b): the third order, by chaining stage ends --------------

def _stage(i, a, b, of="Kette Weg", pos=None):
    return {"id": i, "name": f"Abschnitt ohne Nummer {i}", "country": "DE",
            "category": "hike", "distance_m": 10000, "ascent_m": 100,
            "h": {"cls": "stage", "of": of, "i": pos},
            "geometry": {"type": "LineString", "coordinates": [a, b]}}


P = [[10.0, 50.0], [10.1, 50.0], [10.2, 50.0], [10.3, 50.0], [10.4, 50.0]]


def test_chain_orders_stages_with_no_usable_numbers():
    # member positions repeat (no position order), names carry no numbers,
    # and two stages are drawn backwards: the ends still make one path.
    rows = [_stage(3, P[2], P[3], pos=1), _stage(1, P[1], P[0], pos=1),
            _stage(4, P[4], P[3], pos=1), _stage(2, P[1], P[2], pos=1)]
    got = treks._chain(rows)
    assert [m["id"] for m in got] in ([1, 2, 3, 4], [4, 3, 2, 1])
    trek_list, refs, report = treks.build(rows)
    assert len(trek_list) == 1 and trek_list[0]["order"] == "chain"
    assert [s["id"] for s in trek_list[0]["stages"]] == [1, 2, 3, 4]


def test_chain_follows_rising_positions():
    rows = [_stage(1, P[0], P[1], pos=9), _stage(2, P[1], P[2], pos=3),
            _stage(3, P[2], P[3], pos=1)]
    assert [m["id"] for m in treks._chain(rows, {1: 9, 2: 3, 3: 1})] == [3, 2, 1]


def test_chain_refuses_a_gap_a_branch_or_a_loop():
    gap = [_stage(1, P[0], P[1]), _stage(2, P[2], P[3])]          # two pieces
    assert treks._chain(gap) is None
    branch = [_stage(1, P[0], P[1]), _stage(2, P[1], P[2]),
              _stage(3, P[1], [10.1, 50.1])]                        # three meet
    assert treks._chain(branch) is None
    loop = [_stage(1, P[0], P[1]), _stage(2, P[1], [10.0, 50.0001])]
    assert treks._chain(loop) is None


def test_chain_settles_a_position_conflict_when_the_ends_touch():
    # Two stages that both claim member position 1 (the fixture's Doppelweg
    # case) are a conflict only while their ends do not meet; touching, the
    # third order puts them in a line.
    rows = [_stage(1, P[0], P[1], of="Doppel", pos=1), _stage(2, P[1], P[2], of="Doppel", pos=1)]
    trek_list, _, report = treks.build(rows)
    assert len(trek_list) == 1 and trek_list[0]["order"] == "chain"
    apart = [_stage(1, P[0], P[1], of="Doppel", pos=1), _stage(2, P[2], P[3], of="Doppel", pos=1)]
    assert treks.build(apart)[2]["refused"]["order_conflict"] == 1


def test_trek_says_how_many_stages_the_whole_path_has():
    # T1201 (T1184-e): hierarchy.py puts the superroute's stage count on each
    # stage (`h.n`); the trek keeps it when it is at least what is shown.
    rows = [_stage(1, P[0], P[1], pos=1), _stage(2, P[1], P[2], pos=2)]
    for r in rows:
        r["h"]["n"] = 7
    t = treks.build(rows)[0][0]
    assert t["n"] == 2 and t["of"] == 7
    for r in rows:
        r["h"]["n"] = 1
    assert "of" not in treks.build(rows)[0][0]


def test_hierarchy_gives_a_stage_its_superroute_count():
    import hierarchy
    g = {1: {"country": "AT", "in_store": True, "parents": [], "children": [2, 3, 4],
             "name": "BergeSeen Trail", "type": "superroute",
             "rmembers": [(2, ""), (3, ""), (4, "")]}}
    for i in (2, 3, 4):
        g[i] = {"country": "AT", "in_store": True, "parents": [1], "children": [],
                "name": f"BergeSeen Trail 0{i - 1}", "type": "route", "rmembers": []}
    out = hierarchy.classify_graph(g, [])[0]
    assert out[1]["count"] == 3
    assert [out[i]["count"] for i in (2, 3, 4)] == [3, 3, 3]
    assert [out[i]["index"] for i in (2, 3, 4)] == [1, 2, 3]
