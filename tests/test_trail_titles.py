"""The title ladder (T107, spec 6.6): what a trail is called on the card.

Pure functions in pipeline/trails/names.py, so no lab is needed. The rows
below are the shapes the built wire actually carried in 2026-09: codes,
digits, overlong stage names, a Cyrillic name beside an English one, and
rows with no name at all.

Runs under pytest from the repo root:
    python -m pytest tests/test_trail_titles.py -q
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import names  # noqa: E402

PEAK = [{"kind": "peak", "name": "Golem Korab", "off_m": 40}]
LAKE_THEN_PEAK = [{"kind": "lake", "name": "Golemokorapsko Ezero"},
                  {"kind": "peak", "name": "Golem Korab"}]
ANCHOR = [{"name": "Radomire", "m": 800}]


def ladder(tags, **kw):
    kw.setdefault("route_type", "point")
    kw.setdefault("distance_m", 12143)
    return names.title_ladder(tags, **kw)


# -- what counts as a name ---------------------------------------------------

def test_codes_are_not_names():
    for code in ("GR 564", "33-36", "LK 08", "E4", "PWHa2", "471", "5/03",
                 "SH-MR-009", "", None):
        assert names.is_code(code), code


def test_names_are_names():
    for name in ("Sentier des Roches", "3-Schwestern-Weg", "5 Elemente Weg",
                 "Golem Korab", "Maja e Korabit"):
        assert not names.is_code(name), name


def test_raw_osm_strings_are_spotted():
    assert names.is_raw_osm("OSM route 16024487")
    assert names.is_raw_osm("route=hiking;network=lwn")
    assert names.is_raw_osm("relation/16024487")
    assert not names.is_raw_osm("Mount Korab")


# -- the rungs ---------------------------------------------------------------

def test_wikidata_label_is_the_first_rung():
    out = ladder({"name": "GR 564"}, wikidata_label="Sentier des Ocres")
    assert out["title"] == "Sentier des Ocres"
    assert out["rung"] == "wikidata"


def test_name_en_beats_a_cyrillic_name():
    out = ladder({"name": "Голем Кораб",
                  "name:en": "Mount Korab"})
    assert out["title"] == "Mount Korab"
    assert out["rung"] == "name"


def test_latin_local_name_beats_other_scripts():
    out = ladder({"name": "Голем Кораб",
                  "name:sq": "Maja e Korabit"})
    assert out["title"] == "Maja e Korabit"


def test_code_falls_through_to_from_to():
    out = ladder({"name": "GR 564", "ref": "GR 564", "from": "Aix", "to": "Marseille"})
    assert out["title"] == "Aix to Marseille"
    assert out["rung"] == "from_to"
    assert out["ref"] == "GR 564"


def test_same_from_and_to_is_a_loop():
    assert names.from_to_title({"from": "Radomire", "to": "Radomire"}) == "Radomire loop"


def test_code_with_no_from_to_takes_the_landmark():
    out = ladder({"name": "LK 08"}, features=LAKE_THEN_PEAK)
    assert out["title"] == "Walk to Golem Korab"      # peak outranks lake
    assert out["rung"] == "landmark"
    assert out["ref"] == "LK 08"                     # the original, as the chip


def test_landmark_formula_follows_the_shape():
    assert names.landmark_title(PEAK, "loop") == "Golem Korab loop"
    assert names.landmark_title(PEAK, "out_back") == "Walk to Golem Korab and back"
    assert names.landmark_title(PEAK, "point") == "Walk to Golem Korab"


def test_bilingual_landmark_takes_its_first_name():
    feats = [{"kind": "peak", "name": "Veliki Mojan / Maja e Mojanit"}]
    assert names.landmark_title(feats, "point") == "Walk to Veliki Mojan"


def test_shape_plus_place_is_the_last_rung():
    out = ladder({"name": "33-36"}, passes=ANCHOR, route_type="loop")
    assert out["title"] == "Loop near Radomire"
    assert out["rung"] == "shape"
    out = ladder({}, route_type="loop", distance_m=9400)
    assert out["title"] == "Loop walk, 9 km"


def test_ingest_placeholder_never_survives():
    out = ladder({}, title="OSM route 16024487", route_type="loop", distance_m=9000)
    assert out["title"] == "Loop walk, 9 km"
    assert out["ref"] == "OSM route 16024487"


def test_derived_route_keeps_its_composed_title():
    # No tags at all: the stored title is the only name the row has.
    out = ladder({}, title="Ridge path above Bled")
    assert out["title"] == "Ridge path above Bled"
    assert out["rung"] == "name"


# -- splitting codes off names ----------------------------------------------

def test_code_then_bracketed_name():
    assert names.split_code("7 (The Blue Eye)") == ("The Blue Eye", "7")


def test_leading_stage_number_goes_to_the_chip():
    out = ladder({"name": "612 Berwang - Roter Stein"})
    assert out["title"] == "Berwang - Roter Stein"
    assert out["ref"] == "612"


def test_short_code_plus_one_word_stays_whole():
    assert ladder({"name": "GR 7 - Andorra"})["title"] == "GR 7 - Andorra"
    assert ladder({"name": "5 Elemente Weg Nr. 3"})["title"] == "5 Elemente Weg Nr. 3"


def test_trailing_bracketed_code_goes_to_the_chip():
    out = ladder({"name": "Hazelnut path (SH-MR-004)"})
    assert out["title"] == "Hazelnut path"
    assert out["ref"] == "SH-MR-004"


def test_tag_ref_wins_over_a_split_code():
    out = ladder({"name": "Mount Korab (9/1)", "ref": "9/1"})
    assert out["title"] == "Mount Korab"
    assert out["ref"] == "9/1"


# -- the cap -----------------------------------------------------------------

def test_cap_is_42_on_a_word_boundary():
    long = "BergeSeen Trail 15: Gosau-Hintertal - Hallstatt"
    out = ladder({"name": long})
    assert len(out["title"]) <= 42
    assert out["title"] == "BergeSeen Trail 15: Gosau-Hintertal"
    assert out["ref"] == long          # the original rides on the chip


def test_cap_never_leaves_a_bracket_open():
    t = names.cap_title("Hiking trail Leskovik-Sarandapor (historic route)")
    assert t == "Hiking trail Leskovik-Sarandapor"


def test_cap_leaves_short_titles_alone():
    assert names.cap_title("Sentier des Roches") == "Sentier des Roches"
    assert names.cap_title("  Sentier  des Roches - ") == "Sentier des Roches"


def test_no_ladder_output_exceeds_the_cap():
    rows = [
        {"name": "El Camí IT1TR5 El Camí Capçaler: de Salzes a Balaguer"},
        {"name": "Katund i Vjetër - Kisha e Shën Gjergjit- Erzë (SH-MR-002)"},
        {"from": "Averylongplacenameindeed-Oberdorf", "to": "Anotherverylongplacename-Unterdorf"},
        {},
    ]
    for tags in rows:
        out = ladder(tags, features=PEAK, passes=ANCHOR)
        assert len(out["title"]) <= names.TITLE_MAX, out
        assert not names.is_code(out["title"]), out
        assert not names.is_raw_osm(out["title"]), out


def test_ladder_is_a_fixed_point():
    # attributes.py re-runs monthly; the second run must land where the first did.
    first = ladder({"name": "LK 08"}, features=PEAK)
    second = ladder({"name": "LK 08"}, title=first["title"], features=PEAK)
    assert second["title"] == first["title"]
    assert second["ref"] == first["ref"]


def test_symbol_code_with_a_bracketed_description():
    # Hungarian waymarks: the symbol is the code, the bracket is the walk.
    name = "Z" + chr(0x25B2) + " (Nagybanyai lepcso - Ferenc-hegy - Kavics utca, vill. mh.)"
    out = ladder({"name": name}, distance_m=5447)
    assert out["title"] == "Nagybanyai lepcso - Ferenc-hegy"
    assert out["ref"] == "Z" + chr(0x25B2)
    assert not names.is_code(out["title"])


def test_a_name_that_caps_to_a_code_moves_down_a_rung():
    # A symbol with a bracketed code is two codes, not a name.
    out = ladder({"name": "K+ (12-34)"}, features=PEAK)
    assert out["title"] == "Walk to Golem Korab"
    assert out["ref"] == "K+ (12-34)"       # the whole original, as the chip


def test_cap_prefers_a_segment_boundary():
    # "A - B - C" names cut between segments, not inside one.
    assert names.cap_title("BergeSeen Trail 15: Gosau-Hintertal - Hallstatt")         == "BergeSeen Trail 15: Gosau-Hintertal"
    assert names.cap_title("Pecsvarad - Rockenbauer Pal sirja - Zengovarkony - RPDDK")         == "Pecsvarad - Rockenbauer Pal sirja"
