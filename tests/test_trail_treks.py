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
