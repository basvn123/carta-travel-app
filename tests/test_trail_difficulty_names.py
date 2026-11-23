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


# -- D7 (wave 1, 0.4): the 36 research rows ----------------------------------
# Names from the 2026-11-17 trails wire (id, country, shipped name), with what
# the next export ships: wire_name, then the ladder's split_code and cap
# (the replay path, scripts/quality/trail_names_replay.py). HOLD rows are not
# in the 0.4 rules (generic plus number, colour only, codes, empties, stage
# words without a parent, typos): pinned unchanged so a later change shows.
HOLD = None
NAME_ROWS = [
    (311203, "AL", "", HOLD),
    (311344, "AL", "", HOLD),
    (19278, "AT", "JK02", HOLD),
    (16130, "AT", "VR", HOLD),
    (10506, "AT", "471", HOLD),
    (13915, "AT", "PWHa2", HOLD),
    (95805, "BE", "33-36", HOLD),
    (148040, "DE", "J25-K65", HOLD),
    (63471, "AL", "(SH-MR-011)", HOLD),
    (10071, "AT", "Wanderweg 1", HOLD),
    (14120, "AT", "Wanderweg 543", HOLD),
    (11235, "AT", "Wanderweg 937", HOLD),
    (187394, "GB", "Red", HOLD),
    (75394, "BG", "blue bar", HOLD),
    (3964, "CH", "fixme - fixme", ""),
    (2292, "CH", "Saulcy - fixme", "Saulcy"),
    (62376, "LI", "Gafleisattel -fixme", "Gafleisattel"),
    (75386, "BG", "Златни мостове - Алеко",
     "Zlatni mostove - Aleko"),
    # One Latin "e" inside the Cyrillic "езера".
    (75333, "BG", "х.Ловна - х. 7-те eзера - х.Иван Вазов",
     "h.Lovna - h. 7-te ezera - h.Ivan Vazov"),
    (74839, "GR", "ΜΟΝΟΠΑΤΙ ΚΟΡΥΚΕΙΟΝ ΑΝΤΡΟ",
     "Monopati Korykeion Antro"),
    (75481, "BG", "КРЕПОСТ СТОРГОЗИЯ - ЯЗ. ТОТЛЕБЕНОВ ВАЛ - Х. СРЕБРОСТРУЙ",
     "Krepost Storgoziya - Yaz. Totlebenov Val"),
    (199937, "IT", "ANELLO 13 - TORCIGLIANO - PASSO DEL LUCESE - BUCA DEL CORNO - TORCIGLIANO",
     "Anello 13 - Torcigliano - Passo del Lucese"),
    (80630, "GB", "GLENTIES TO KILLETER", "Glenties to Killeter"),
    (30507, "AD", "European long distance path E7 - Andorra", "E7 - Andorra"),
    (9959, "AT", "Europäischer Fernwanderweg E4, Österreich, Rofan", "E4, Österreich, Rofan"),
    (25575, "AD", "HRP Étape 32", HOLD),
    (17369, "AT", "Adlerweg Etappe 12", HOLD),
    (11137, "AT", "Wanderweg Adlerweg Etappe 90 - Kaiserwinkl", HOLD),
    # The explore left this to the builder: today's cut is kept (the tail
    # "de Salzes a Balaguer" alone reads badly); not in the 0.4 acceptance.
    (39826, "AD", "El Camí IT1TR5 El Camí Capçaler: de Salzes a Balaguer",
     "El Camí IT1TR5 El Camí Capçaler"),
    (63461, "AL", "7 (The Blue Eye)", "The Blue Eye"),
    (93975, "BE", "RVN 5 - Pe 2 - 08 - Roosteren-Thorn", "Roosteren-Thorn"),
    (13338, "AT", "P (Ágfalva, főtér – Harka-Nyéki határkilépő)",
     "Ágfalva, főtér – Harka-Nyéki határkilépő"),
    (20050, "AT", "BergeSeen Trail 15: Gosau-Hintertal - Hallstatt", "Gosau-Hintertal - Hallstatt"),
    (19116, "AT", "Sultans Trail Section 1: Vienna - Bratislava", "Vienna - Bratislava"),
    (188593, "GB", "Bideam nam Bian Trail", HOLD),
    (17965, "AT", "murauen.weg", HOLD),
]


def shipped(name, cc):
    """The replay path: the export's wire_name, then the ladder's code split
    and cap."""
    out = names.wire_name(name, cc) or ""
    s, _code = names.split_code(out)
    if s and not names.is_code(s):
        out = names.cap_title(s)
    return out


def test_the_36_rows_ship_the_expected_names():
    assert len(NAME_ROWS) == 36
    for rid, cc, src, want in NAME_ROWS:
        got = shipped(src, cc)
        assert got == (src if want is HOLD else want), (rid, src, got)
        assert len(got) <= names.TITLE_MAX, rid


def test_fixme_alone_ships_no_name_not_the_original():
    assert names.wire_name("fixme - fixme", "CH") == ""


def test_wire_name_is_idempotent_over_the_36_rows():
    for rid, cc, src, _want in NAME_ROWS:
        once = names.wire_name(src, cc) or ""
        assert (names.wire_name(once, cc) or "") == once, rid
        s = shipped(src, cc)
        assert shipped(s, cc) == s, rid


def test_a_two_part_name_never_drops_its_end():
    # Every row with exactly one dash separator, plus long two-part names
    # that must shorten their parts rather than cut the end off.
    extra = [("AT", "Sultans Trail Section 1: Vienna - Bratislava"),
             ("DE", "Wanderparkplatz am Hohen Meissner Nord - Bad Sooden-Allendorf"),
             ("FR", "Sentier de la Grande Randonnee des Cretes - Col de la Schlucht")]
    rows = [(cc, src) for _rid, cc, src, _w in NAME_ROWS] + extra
    checked = 0
    for cc, src in rows:
        segs = names._DASH_SEP_RE.split(names.readable(src, cc).split(": ", 1)[-1])
        if len(segs) != 2:
            continue
        end = names.split_code(segs[-1])[0] or segs[-1]
        if len(end) > names.TITLE_MAX:
            continue
        got = shipped(src, cc)
        assert len(got) <= names.TITLE_MAX, src
        last = end.split()[0]
        assert names.squash(last) in names.squash(got), (src, got)
        checked += 1
    assert checked >= 6


def test_dedupe_tells_mount_korab_9_and_9_1_apart():
    # Both originals split to "Mount Korab"; the code goes back on as a suffix.
    rows = [{"id": 2, "country": "MK", "name": "Mount Korab", "distance_m": 9000},
            {"id": 1, "country": "MK", "name": "Mount Korab", "distance_m": 9000},
            {"id": 3, "country": "AL", "name": "Mount Korab", "distance_m": 9000}]
    originals = {1: "Mount Korab (9)", 2: "Mount Korab (9/1)", 3: "Mount Korab (9)"}
    changed = names.dedupe_names(rows, originals)
    by_id = {r["id"]: r["name"] for r in rows}
    assert by_id[1] != by_id[2]
    assert "9/1" in by_id[2] and by_id[1].startswith("Mount Korab")
    assert by_id[3] == "Mount Korab"          # another country is no clash
    assert set(changed) == {1, 2}
    # Run again on its own output: nothing changes.
    assert names.dedupe_names(rows, originals) == {}


def test_dedupe_falls_back_to_distance_then_id():
    rows = [{"id": 5, "country": "MK", "name": "Mount Korab", "distance_m": 9000},
            {"id": 6, "country": "MK", "name": "Mount Korab", "distance_m": 12000}]
    names.dedupe_names(rows, {5: "Mount Korab 9", 6: "Mount Korab 9/1"})
    assert [r["name"] for r in rows] == ["Mount Korab, 9 km", "Mount Korab, 12 km"]
    same = [{"id": 7, "country": "MK", "name": "Korab"},
            {"id": 8, "country": "MK", "name": "Korab"}]
    names.dedupe_names(same, {})
    assert [r["name"] for r in same] == ["Korab, no. 7", "Korab, no. 8"]


# Judge fix 1 (D7): the start A of a two-part name whose end B alone is over
# the cap stays whole. Inputs are rows of the 2026-11-17 trails wire.
HEAD_ROWS = [
    (194178, "IT", "Il Cammino di santa Giulia - CSG-T002_V26 Valle-Benedetta_Parrana-San-Martino_Collesalvetti-Loc-le-Badie",
     "Il Cammino di santa Giulia"),
    (194858, "IT", "Il Cammino di santa Giulia - CSG-T025_V24 Canneto-sull'Oglio_Fontanella-Grazioli_Isola-Dovarese_Monticelli-Ripa-d'Oglio",
     "Il Cammino di santa Giulia"),
    (199440, "IT", "Il Cammino di santa Giulia - CSG-T028_V24 San-Gervasio-Bresciano_Cigole_Pavone-del-Mella_Leno",
     "Il Cammino di santa Giulia"),
    (36137, "FR", "Grande Traversée des Alpes - variante Montchavin (ancien tracé principal)",
     "Grande Traversée des Alpes"),
    (191970, "IT", "Alta Via dell’Anfiteatro Morenico di Ivrea - Itinerario di Collegamento di Fiorano Canavese",
     "Alta Via dell’Anfiteatro Morenico di Ivrea"),
    (218204, "DE", "[B4] - Rundwanderweg des Verkehrs- und Verschönerungsvereins Marburg",
     "Rundwanderweg des Verkehrs"),
]


def test_a_long_end_never_cuts_the_start_or_leaves_a_code_behind():
    for rid, cc, src, want in HEAD_ROWS:
        got = shipped(src, cc)
        assert got == want, (rid, got)
        assert not names.name_problems(got), rid


def test_a_stage_code_is_a_code_fragment_and_goes_to_the_chip():
    assert "code_fragment" in names.name_problems("Il Cammino di santa Giulia, CSG-T030_V24 Valle")
    name, code = names.split_code("CSG-T002_V26 Valle-Benedetta_Parrana-San-Martino_Collesalvetti")
    assert code == "CSG-T002_V26"
    assert name.startswith("Valle-Benedetta")


def _dedupe(group):
    rows = [{"id": rid, "country": cc, "name": shipped(src, cc)} for rid, cc, src in group]
    names.dedupe_names(rows, {rid: src for rid, _cc, src in group})
    return {r["id"]: r["name"] for r in rows}


def test_dedupe_reads_a_stage_code_as_a_stage_not_an_id():
    got = _dedupe([
        (194178, "IT", HEAD_ROWS[0][2]), (194858, "IT", HEAD_ROWS[1][2]), (199440, "IT", HEAD_ROWS[2][2])])
    assert got == {194178: "Il Cammino di santa Giulia, stage 2",
                   194858: "Il Cammino di santa Giulia, stage 25",
                   199440: "Il Cammino di santa Giulia, stage 28"}
    got = _dedupe([
        (231963, "DE", "Via Sancti Martini HW-37-02 Neustadt an der Weinstraße - Neustadt an der Weinstraße"),
        (231961, "DE", "Via Sancti Martini HW-37-01 Speyer - Neustadt an der Weinstraße")])
    assert got == {231963: "Via Sancti Martini, stage 2", 231961: "Via Sancti Martini, stage 1"}


def test_dedupe_keeps_the_place_and_every_title_fits():
    got = _dedupe([
        (222934, "DE", "Roter Schmetterling, Rundwanderweg Burgsinn"),
        (224117, "DE", "Roter Schmetterling, Rundwanderweg Mechenhard")])
    assert got == {222934: "Roter Schmetterling, Burgsinn", 224117: "Roter Schmetterling, Mechenhard"}
    got = _dedupe([
        (186725, "GB", "King Charles III England Coast Path: Portland to Lulworth"),
        (186824, "GB", "King Charles III England Coast Path: Sea Palling to Weybourne")])
    assert got == {186725: "Portland to Lulworth", 186824: "Sea Palling to Weybourne"}
    # The id is the last resort, and the title still fits.
    got = _dedupe([
        (191970, "IT", HEAD_ROWS[4][2]),
        (191975, "IT", "Alta Via dell’Anfiteatro Morenico di Ivrea - Itinerario di Collegamento di Perosa canavese")])
    assert all(len(n) <= names.TITLE_MAX for n in got.values())
    assert got[191970] == "Alta Via dell’Anfiteatro, no. 191970"


def test_a_head_cut_at_a_comma_leaves_no_dangling_word():
    src = "Šetnica 4 - \"Okretaljka\", put Franja-Okretaljka-Livade-Trsisče (kružna 1 1/2h)"
    assert shipped(src, "HR") == "Šetnica 4 - \"Okretaljka\""
