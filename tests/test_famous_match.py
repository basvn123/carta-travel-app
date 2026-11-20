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
