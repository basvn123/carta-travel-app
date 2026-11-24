"""D23/D24 famous coverage: the matcher's guards against false matches.

Each case is a trap the critics named (run 2026-11-20-famous-coverage):
same-name lakes far apart, a peak inside another peak's name, side trails,
a stage of a long trail, a lake QID looked up among beaches."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "famous"))

import match as m  # noqa: E402
import wikidata as wd  # noqa: E402


def ref(name, rid=None, qid=None, lat=None, lon=None, names=(), km=None,
        cc=("IT",), rels=()):
    return {"id": rid or "wd:" + (qid or name), "qid": qid, "name": name,
            "names": list(names), "lat": lat, "lon": lon, "length_km": km,
            "countries": list(cc), "osm_rels": list(rels), "tier": "A"}


def row(name, rid, lat=None, lon=None, wd_=None, osm=None, km=None,
        cc="IT", tier="rated", bbox=None, kind="lakes"):
    return {"kind": kind, "id": rid, "name": name, "nameLocal": None,
            "lat": lat, "lon": lon, "wd": wd_, "osm": osm, "km": km,
            "cc": cc, "tier": tier, "bbox": bbox}


def test_qid_beats_name():
    refs = [ref("Lake Bled", qid="Q1", lat=46.36, lon=14.09, cc=("SI",))]
    rows = [row("Lake Bled", "a", 46.36, 14.09, cc="SI"),
            row("Blejsko jezero", "b", 46.36, 14.09, wd_="Q1", cc="SI")]
    got = m.match("lakes", refs, rows)
    assert got["wd:Q1"]["row"]["id"] == "b"
    assert got["wd:Q1"]["by"] == "qid"


def test_same_name_far_apart_matches_only_its_own():
    refs = [ref("Lago Nero", rid="r1", lat=46.0, lon=10.0),
            ref("Lago Nero", rid="r2", lat=46.36, lon=10.0)]
    rows = [row("Lago Nero", "near1", 46.001, 10.0),
            row("Lago Nero", "near2", 46.361, 10.0)]
    got = m.match("lakes", refs, rows)
    assert got["r1"]["row"]["id"] == "near1"
    assert got["r2"]["row"]["id"] == "near2"


def test_generic_name_without_point_never_matches():
    refs = [ref("Schwarzsee", rid="r", cc=("CH",))]
    rows = [row("Schwarzsee", "x", 46.6, 7.3, cc="CH")]
    assert m.match("lakes", refs, rows) == {}


def test_peak_name_inside_another_peak_is_not_a_match():
    refs = [ref("Matterhorn", rid="r", lat=45.976, lon=7.658, cc=("CH",))]
    rows = [row("Klein Matterhorn", "k", 45.94, 7.72, cc="CH",
                kind="mountains")]
    assert m.match("mountains", refs, rows) == {}


def test_side_trail_does_not_answer_main_trail():
    refs = [ref("Rheinsteig", rid="r", lat=50.3, lon=7.6, cc=("DE",))]
    rows = [row("Rheinsteig Zuweg Lahnstein", "z", cc="DE", kind="trails",
                bbox=[7.55, 50.25, 7.65, 50.35], km=4)]
    assert m.match("trails", refs, rows) == {}


def test_winter_variant_does_not_answer_summer_trail():
    refs = [ref("Kungsleden", rid="r", lat=68.35, lon=18.83, cc=("SE",))]
    rows = [row("Kungsleden winter", "w", cc="SE", kind="trails",
                bbox=[18.7, 68.3, 18.9, 68.4], km=80)]
    assert m.match("trails", refs, rows) == {}


def test_contained_name_matches_a_trail_nearby():
    refs = [ref("Malerweg", rid="r", lat=50.96, lon=14.07, cc=("DE",))]
    rows = [row("Malerweg Sächsische Schweiz", "mw", cc="DE", kind="trails",
                bbox=[13.9, 50.85, 14.3, 51.0], km=112)]
    got = m.match("trails", refs, rows)
    assert got["r"]["row"]["id"] == "mw"
    assert got["r"]["status"] == "in"


def test_stage_of_long_trail_is_a_piece():
    refs = [ref("GR 11", rid="r", km=840, lat=42.7, lon=0.5, cc=("ES",),
                rels=[100])]
    rows = [row("GR 11 Etapa 12", "s", cc="ES", kind="trails", osm=100,
                km=22, bbox=[0.4, 42.6, 0.6, 42.8])]
    got = m.match("trails", refs, rows)
    assert got["r"]["status"] == "in_as_piece"


def test_one_row_answers_one_reference():
    refs = [ref("Lago di Braies", rid="r1", lat=46.69, lon=12.08,
                names=["Pragser Wildsee"]),
            ref("Pragser Wildsee", rid="r2", lat=46.69, lon=12.08)]
    rows = [row("Pragser Wildsee", "p", 46.694, 12.085)]
    got = m.match("lakes", refs, rows)
    assert len(got) == 1


def test_an_alias_never_answers_for_a_row_with_another_qid():
    # D25 h: Wikidata lists "es Coto" as an alias of Es Marques; Es Coto is
    # the next beach, on the wire under its own QID, 350 m away.
    refs = [ref("Es Marques", qid="Q20104424", lat=39.54, lon=2.37,
                names=["es Coto"], cc=("ES",))]
    rows = [row("Es Coto", "coto", 39.543, 2.37, wd_="Q17601510", cc="ES",
                kind="beaches")]
    assert m.match("beaches", refs, rows) == {}
    # The same alias on a row with no QID still counts.
    rows = [row("Es Coto", "coto", 39.543, 2.37, cc="ES", kind="beaches")]
    assert m.match("beaches", refs, rows)["wd:Q20104424"]["by"] == "name"


def test_the_own_name_still_answers_a_duplicate_item():
    # Cofete has two Wikidata items, the area and the beach: the reference's
    # own name on the wire row counts whatever QID the row carries.
    refs = [ref("Cofete", qid="Q545972", lat=28.10, lon=-14.39, cc=("ES",))]
    rows = [row("Playa de Cofete", "c", 28.105, -14.39, wd_="Q23986978",
                cc="ES", kind="beaches")]
    assert m.match("beaches", refs, rows)["wd:Q545972"]["row"]["id"] == "c"


def test_rated_row_preferred_over_listed():
    refs = [ref("Zugspitze", qid="Q3375", lat=47.42, lon=10.98,
                cc=("DE",))]
    rows = [row("Zugspitze", "l", wd_="Q3375", cc="DE", tier="listed",
                kind="mountains"),
            row("Zugspitze", "r", wd_="Q3375", cc="AT", tier="rated",
                kind="mountains")]
    got = m.match("mountains", refs, rows)
    assert got["wd:Q3375"]["status"] == "in"


def test_tiers():
    assert wd.tier_of("lakes", {"sitelinks": 25}) == "A"
    assert wd.tier_of("lakes", {"sitelinks": 13}) == "B"
    assert wd.tier_of("lakes", {"sitelinks": 5}) is None
    assert wd.tier_of("mountains", {"sitelinks": 9, "prom_m": 1200}) == "A"
    assert wd.tier_of("mountains", {"sitelinks": 9, "prom_m": 200}) is None
    assert wd.tier_of("mountains", {"sitelinks": 3, "highpoint": "NL"}) == "A"
    # A bay with a beach word counts; a plain bay needs much more fame.
    assert wd.tier_of("beaches", {"sitelinks": 6, "class_kind": "extra",
                                  "beach_word": True}) == "A"
    assert wd.tier_of("beaches", {"sitelinks": 6, "class_kind": "extra",
                                  "beach_word": False}) is None
    # Czech local cycle routes: 3 sitelinks and short is not famous.
    assert wd.tier_of("cycling", {"sitelinks": 3, "length_km": 40}) == "B"
    assert wd.tier_of("cycling", {"sitelinks": 3, "length_km": 300}) == "A"


def test_fold():
    assert m.fold("Hallstätter See") == "hallstatter see"
    assert m.fold("Großglockner (Glocknerwand)") == "grossglockner"


def test_europe_box():
    assert wd.in_europe(45.83, 6.86)          # Mont Blanc
    assert wd.in_europe(28.27, -16.64)        # Teide
    assert not wd.in_europe(14.81, -61.17)    # Mount Pelée, Martinique
    assert not wd.in_europe(-21.24, 55.71)    # Piton de la Fournaise
    assert wd.in_europe(None, None)           # a route without a point


def test_weak_trail_class_needs_a_walk_word():
    street = {"sitelinks": 8, "weak_class": True, "walk_word": False}
    walk = {"sitelinks": 4, "weak_class": True, "walk_word": True}
    trail = {"sitelinks": 3, "weak_class": False, "walk_word": False}
    assert wd.tier_of("trails", street) == "B"
    assert wd.tier_of("trails", walk) == "A"
    assert wd.tier_of("trails", trail) == "A"


def test_bracketed_side_trail_is_not_the_trail():
    # judgement 1: brackets hid the side word from the guard
    refs = [ref("Rheinsteig", rid="r", lat=50.3, lon=7.6, cc=("DE",))]
    rows = [row("Rheinsteig (Zuweg Bad Hönningen)", "z", cc="DE",
                kind="trails", bbox=[7.55, 50.25, 7.65, 50.35], km=4)]
    assert m.match("trails", refs, rows) == {}
    refs = [ref("Elster-Radweg", rid="e", lat=51.2, lon=12.2, cc=("DE",))]
    rows = [row("Elster-Radweg (Alternative Elstertrebnitz)", "a", cc="DE",
                kind="cycling", bbox=[12.1, 51.1, 12.3, 51.3], km=12)]
    assert m.match("cycling", refs, rows) == {}


def test_named_section_is_a_piece_without_a_length():
    refs = [ref("Drauradweg", rid="d", lat=46.7, lon=13.6, cc=("AT",))]
    rows = [row("Drauradweg, Teil 2", "t", cc="AT", kind="cycling",
                bbox=[13.4, 46.6, 13.8, 46.8], km=40)]
    got = m.match("cycling", refs, rows)
    assert got["d"]["status"] == "in_as_piece"


def test_spanish_del_is_not_a_section():
    refs = [ref("Camino del Norte", rid="c", lat=43.3, lon=-3.0, cc=("ES",))]
    rows = [row("Camino del Norte", "n", cc="ES", kind="trails",
                bbox=[-3.1, 43.2, -2.9, 43.4], km=800)]
    assert m.match("trails", refs, rows)["c"]["status"] == "in"


def test_no_mountain_below_the_sea():
    assert wd.tier_of("mountains", {"sitelinks": 32, "elev_m": -8}) is None


def test_bracketed_end_points_are_a_section():
    refs = [ref("Sydostleden", rid="s", lat=56.2, lon=15.0, cc=("SE",))]
    rows = [row("Sydostleden (Fridafors, Karlshamn)", "f", cc="SE",
                kind="cycling", bbox=[14.6, 56.1, 15.0, 56.5], km=60)]
    assert m.match("cycling", refs, rows)["s"]["status"] == "in_as_piece"


def test_quantities_are_read_normalised(monkeypatch):
    # Divis (Belfast) is stored as 1,568 ft; the normalised value is metres.
    seen = {}

    def fake(query, verbose=False):
        seen["q"] = query
        return [{"item": {"value": "http://www.wikidata.org/entity/Q1"},
                 "v": {"value": "477.9264"}}]
    monkeypatch.setattr(wd, "sparql", fake)
    assert wd.values_of(["Q1"], "P2044") == {"Q1": [477.926]}
    assert "psn:P2044" in seen["q"]
    monkeypatch.setattr(wd, "sparql", lambda q, verbose=False: [
        {"item": {"value": "http://www.wikidata.org/entity/Q2"},
         "v": {"value": "154000"}}])
    assert wd.values_of(["Q2"], "P2043") == {"Q2": [154.0]}   # m -> km


def test_section_counts_when_the_route_has_no_point():
    # judgement 3: most Wikidata cycle routes have no coordinate
    refs = [ref("Tauernradweg", rid="t", cc=("AT",))]
    rows = [row("Tauernradweg (Stadt Salzburg, Hallein)", "s", cc="AT",
                kind="cycling", bbox=[13.0, 47.6, 13.1, 47.8], km=20)]
    assert m.match("cycling", refs, rows)["t"]["status"] == "in_as_piece"


def test_colon_tail_is_a_section():
    refs = [ref("Bodensee-Königssee-Radweg", rid="b", cc=("DE",))]
    rows = [row("Bodensee-Königssee-Radweg: Lindau - Isny", "x", cc="DE",
                kind="cycling", bbox=[9.7, 47.5, 10.0, 47.7], km=40)]
    assert m.match("cycling", refs, rows)["b"]["status"] == "in_as_piece"


def test_hauptroute_is_the_route_itself():
    refs = [ref("Elberadweg", rid="e", cc=("DE",))]
    rows = [row("Elberadweg (Hauptroute)", "h", cc="DE", kind="cycling",
                bbox=[10.0, 50.9, 14.4, 54.0], km=860)]
    got = m.match("cycling", refs, rows)
    assert got["e"]["status"] == "in" and got["e"]["by"] == "name"


def test_best_rank_quantity_query(monkeypatch):
    seen = {}

    def fake(query, verbose=False):
        seen["q"] = query
        return []
    monkeypatch.setattr(wd, "sparql", fake)
    wd.values_of(["Q1"], "P2044")
    assert "wikibase:BestRank" in seen["q"]
