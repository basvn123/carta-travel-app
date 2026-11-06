"""T1092 (ROADMAP D7): trail difficulty per day of walking, and display names.

Difficulty: a flat 286 km path is long, not very hard. The rows are the
published wire of 2026-09-13 (continent-app/public/trails/NL.json and
GB.json, detail files trip/114362.json), cut to the fields each pass reads.

Names: route codes and network prefixes folded, Cyrillic and Greek
transliterated, long titles shortened, and the source name kept apart.

Pure functions only: no lab, no network.
    python -m pytest tests/test_trail_difficulty_names.py -q
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import attributes  # noqa: E402
import difficulty  # noqa: E402
import export_wire  # noqa: E402
import names  # noqa: E402

# Veluwe Zwerfpad (NL, id 114362): 285,992 m, 10 m of climb per km, a 112 m
# dune at its top. Shipped f.g "very_hard" (grade_parts: effort very_hard
# from the 40 km rule, terrain hard from one 26% DEM span).
VELUWE = {
    "id": 114362, "country": "NL", "distance_m": 285992,
    "ascent_m": 2888, "descent_m": 2889, "duration_min": 4752,
    "elevation": {"status": "ok", "ele_min_m": 10.4, "ele_max_m": 112.0,
                  "max_grade_pct": 26.0},
    "way_tags": {"cover": {"sac_scale": 0.011}},
}
# Thames Path (GB, id 185706): 312,680 m and 496 m of climb.
THAMES = {"id": 185706, "country": "GB", "distance_m": 312680,
          "ascent_m": 496, "descent_m": 602,
          "elevation": {"status": "ok", "ele_min_m": 0.0, "ele_max_m": 110.0,
                        "max_grade_pct": 9.0}}


def app_reads_long(grade, days):
    """The app's rule (continent-app/src/lib/trailStory.js isLongWalk)."""
    return difficulty.is_long(days) and \
        attributes.GRADE_RANK[grade] <= attributes.GRADE_RANK["moderate"]


# -- difficulty ---------------------------------------------------------------

def test_din_hours_match_the_stored_duration():
    # One formula: difficulty.py and elevation.py's duration_min agree.
    # elevation.py needs rasterio, so its formula is read as text here.
    src = (ROOT / "pipeline" / "trails" / "elevation.py").read_text("utf-8")
    for needle in ("dist_km / 4.0", "ascent_m / 300.0", "descent_m / 500.0",
                   "max(horiz, vert) + min(horiz, vert) / 2.0"):
        assert needle in src, needle
    assert (difficulty.FLAT_KMH, difficulty.UP_MH, difficulty.DOWN_MH) \
        == (4.0, 300.0, 500.0)
    # And the published Veluwe row's stored duration is what this computes.
    assert VELUWE["duration_min"] == round(difficulty.din_hours(
        285992, 2888, 2889) * 60)


def test_a_flat_286_km_path_reads_long_not_very_hard():
    row = attributes.oriented(VELUWE)
    grade, src, parts = attributes.grade_of(row)
    assert grade == "moderate"
    assert src == "derived"
    assert parts["days"] == 14
    assert parts["effort"] == "moderate"
    assert parts["terrain"] == "moderate"
    assert parts["relief_capped"] == 102
    assert app_reads_long(grade, parts["days"])
    # The wire ships the days beside the grade.
    assert export_wire.days_of_trip(VELUWE) == 14


def test_the_thames_path_reads_long():
    grade, _src, parts = attributes.grade_of(attributes.oriented(THAMES))
    assert grade in ("easy", "moderate")
    assert parts["days"] >= 10
    assert app_reads_long(grade, parts["days"])


def test_length_alone_never_raises_the_grade():
    # The same climb per km at 20, 100 and 300 km: the per day grade is flat.
    grades = set()
    for km in (40, 100, 300):
        day = difficulty.day_effort({"distance_m": km * 1000,
                                     "ascent_m": km * 10, "descent_m": km * 10})
        grades.add(day["grade"])
        assert day["days"] >= 2
    assert grades == {"moderate"}


def test_a_single_day_is_graded_on_its_hours_and_climb():
    assert difficulty.day_effort({"distance_m": 6000, "ascent_m": 150,
                                  "descent_m": 150})["grade"] == "easy"
    assert difficulty.day_effort({"distance_m": 15000, "ascent_m": 600,
                                  "descent_m": 600})["grade"] == "moderate"
    # Korab (9) walked uphill: 1,423 m in under 8 km is a hard day.
    korab = {"distance_m": 7941, "ascent_m": 1423, "descent_m": 7}
    day = difficulty.day_effort(korab)
    assert (day["days"], day["grade"]) == (1, "hard")
    # 28 km and 1,000 m up and down in one go (about 9.7 h) is very hard,
    # and still one day.
    big = difficulty.day_effort({"distance_m": 28000, "ascent_m": 1000,
                                 "descent_m": 1000})
    assert (big["days"], big["grade"]) == (1, "very_hard")


def test_a_steep_multi_day_route_is_graded_by_its_ground():
    # 80 km with 10,000 m up and down: a 6 h stage holds about 900 m of
    # climb, a moderate day, but 125 m of climb per km is hard ground, and
    # the published grade is the harder of the two. It does not read long.
    row = {"distance_m": 80000, "ascent_m": 10000, "descent_m": 10000,
           "elevation": {"status": "ok", "ele_min_m": 500, "ele_max_m": 2400,
                         "max_grade_pct": 18.0}}
    day = difficulty.day_effort(row)
    assert day["days"] >= 2 and day["grade"] == "moderate"
    grade, _src, parts = attributes.grade_of(row)
    assert (grade, parts["terrain"]) == ("hard", "hard")
    assert not app_reads_long(grade, parts["days"])


def test_terrain_still_wins_on_a_long_route():
    # A long traverse tagged T5 stays alpine, and never reads "long".
    row = {**VELUWE, "way_tags": {"cover": {"sac_scale": 0.9},
                                  "sac_worst": "demanding_alpine_hiking"}}
    grade, src, parts = attributes.grade_of(row)
    assert (grade, src) == ("alpine", "tagged")
    assert not app_reads_long(grade, parts["days"])


def test_relief_cap_only_touches_derived_terrain_on_low_ground():
    low = {"distance_m": 10000, "ascent_m": 200,
           "elevation": {"status": "ok", "ele_min_m": 0, "ele_max_m": 150,
                         "max_grade_pct": 35.0}}
    assert attributes.dem_grade(low)[0] == "moderate"
    high = {**low, "elevation": {**low["elevation"], "ele_max_m": 600}}
    assert attributes.dem_grade(high)[0] == "very_hard"


def test_days_are_absent_on_a_one_day_walk():
    assert export_wire.days_of_trip({"distance_m": 12000, "ascent_m": 400,
                                     "descent_m": 400}) is None
    assert export_wire.days_of_trip({"distance_m": None}) is None


# -- names --------------------------------------------------------------------

def test_network_prefixes_fold_to_the_code():
    cases = {
        "European long distance path E7, Andorra": "E7, Andorra",
        "European long distance path E3 - part Poland (west)":
            "E3, Poland (west)",
        "European walking route E2, UK, East Midlands":
            "E2, UK, East Midlands",
        "Europäischer Fernwanderweg E4, Österreich, Rofan":
            "E4, Österreich, Rofan",
        "Sentier de Grande Randonnée 10": "GR 10",
        "Veluwe Zwerfpad": "Veluwe Zwerfpad",
    }
    for src, want in cases.items():
        assert names.strip_network(src) == want, src


def test_cyrillic_and_greek_are_transliterated_per_country():
    cases = [
        ("Големо Караниколичко Езеро", "MK",
         "Golemo Karanikoličko Ezero"),
        ("Жабљак", "ME", "Žabljak"),
        ("Щастливец", "BG",
         "Shtastlivets"),
        ("Говерла", "UA", "Hoverla"),
        ("Ορειβατικό Μονοπάτι Ολύμπου", "GR",
         "Oreivatiko Monopati Olympou"),
    ]
    for src, cc, want in cases:
        assert names.transliterate(src, cc) == want, src
        assert names.is_latin(names.wire_name(src, cc))
    # A Latin name is left alone.
    assert names.transliterate("Pas de la Casa", "AD") == "Pas de la Casa"


def test_the_ladder_uses_a_latin_name_before_transliterating():
    tags = {"name": "Рила", "name:en": "Rila Lakes"}
    assert names.title_ladder(tags, country="BG")["title"] == "Rila Lakes"
    only = {"name": "Патека до "
                    "Шишевски "
                    "манастир"}
    out = names.title_ladder(only, country="MK", route_type="point",
                             distance_m=9000)
    assert out["title"] == "Pateka do Šiševski manastir"
    assert out["rung"] == "name"


def test_wire_name_is_short_readable_and_idempotent():
    long_ro = ("Traseul turistic de creasta din Muntii Fagaras de la Cabana "
               "Barcaciu pana la Cabana Podragu prin Saua Scara")
    out = names.wire_name(long_ro, "RO")
    assert len(out) <= names.TITLE_MAX
    assert not out.endswith((" ", "-", ","))
    for src, cc in (("European long distance path E7, Andorra", "AD"),
                    (long_ro, "RO"),
                    ("Жабљак", "ME")):
        once = names.wire_name(src, cc)
        assert names.wire_name(once, cc) == once


def test_shortening_never_leaves_a_broken_end():
    # Real titles from the 2026-09 wire (PL, GB, CZ).
    cases = {
        'Scie\u017cka przyrodniczo-dydaktyczna "Kobyle Jezioro"':
            "Scie\u017cka przyrodniczo-dydaktyczna",
        "Rail Trail: Marston Green Circular via Elmdon":
            "Rail Trail: Marston Green Circular",
        "[\u010c] \u010cesk\u00fd Krumlov": "[\u010c] \u010cesk\u00fd Krumlov",
    }
    for src, want in cases.items():
        assert names.wire_name(src, None) == want, src


def test_the_source_name_rides_apart_only_when_it_differs():
    tags = {"name": "European long distance path E7, Andorra"}
    shown = names.wire_name(tags["name"], "AD")
    assert names.source_label(tags, None, shown) == tags["name"]
    same = {"name": "Veluwe Zwerfpad"}
    assert names.source_label(same, None, "Veluwe Zwerfpad") is None
    assert names.source_label({}, "Some title", "Some title") is None
    assert names.source_label({"name": "osm route=hiking"}, None, "x") is None
