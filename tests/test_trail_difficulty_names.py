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
    # One 26% span on 10 m of climb per km is no terrain grade: both DEM terms
    # must clear (D24), so the relief cap has nothing left to catch here.
    assert parts["terrain"] == "easy"
    assert "relief_capped" not in parts
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
                         "max_grade_pct": 24.0}}
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
    low = {"distance_m": 10000, "ascent_m": 1900,
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
    # A 42 character start loses trailing words (never inside one) so the
    # town, used whole, fits beside it; every title still fits.
    got = _dedupe([
        (191970, "IT", HEAD_ROWS[4][2]),
        (191975, "IT", "Alta Via dell’Anfiteatro Morenico di Ivrea - Itinerario di Collegamento di Perosa canavese")])
    assert all(len(n) <= names.TITLE_MAX for n in got.values())
    # Judge 2: no cut inside "Anfiteatro Morenico", so the id (not a word cut) tells them apart.
    assert got[191970] == "Alta Via dell’Anfiteatro Morenico, #191970"
    # The id is the last resort, and the title still fits.
    got = _dedupe([
        (191971, "IT", "Alta Via dell’Anfiteatro Morenico di Ivrea - Itinerario di Collegamento di Mercenasco Direzione Ovest"),
        (191972, "IT", "Alta Via dell’Anfiteatro Morenico di Ivrea - Itinerario di Collegamento di Mercenasco Direzione Sud")])
    assert got == {191971: "Alta Via dell’Anfiteatro Morenico, #191971", 191972: "Alta Via dell’Anfiteatro Morenico, #191972"}


def test_a_head_cut_at_a_comma_leaves_no_dangling_word():
    src = "Šetnica 4 - \"Okretaljka\", put Franja-Okretaljka-Livade-Trsisče (kružna 1 1/2h)"
    assert shipped(src, "HR") == "Šetnica 4 - \"Okretaljka\""


# Judge 3 (D7, wave 2 step 0a): the cases that went wrong on the real wire.
SANTA_GIULIA = [
    (193943, "CSG-T001_V26 Livorno_Pian-di-Rota_Eremo-Sambuca_Valle-Benedetta"),
    (194178, "CSG-T002_V26 Valle-Benedetta_Parrana-San-Martino_Collesalvetti-Loc-le-Badie"),
    (194824, "CSG-T022_V24 Cicognara_Casalmaggiore_Sabbioneta"),
    (203025, "CSG-T023_V24 Sabbioneta_Cividale_Rivarolo-Mantovano"),
    (194832, "CSG-T024_V24 Rivarolo-Mantovano_Canneto-sull'Oglio"),
    (199434, "CSG-T024VA_V24 Calvatone_Asola_Cascina-Cavalta"),
    (194858, "CSG-T025_V24 Canneto-sull'Oglio_Fontanella-Grazioli_Isola-Dovarese_Monticelli-Ripa-d'Oglio"),
    (199436, "CSG-T025VA_V24 Cascina-Cavalta_Fontanella-Grazioli"),
    (194873, "CSG-T026_V24 Villarocca_Ostiano_Seniga_Alfiano-Nuovo"),
    (199438, "CSG-T027_V25 Alfiano-Vecchio_RoBecco-d'Oglio_Pontevico_San-Gervasio-Bresciano"),
    (199440, "CSG-T028_V24 San-Gervasio-Bresciano_Cigole_Pavone-del-Mella_Leno"),
    (203052, "CSG-T028VA_V24 Verolanuova_Cadignano_Faverzano_Offlaga_Corticelle-Pieve"),
    (194875, "CSG-T030_V24 Capriano-del-Colle_Flero_Villaggio-Sereno_Brescia-Museo-S-Giulia"),
]


def test_dedupe_santa_giulia_group_of_13_gets_stages_and_no_id():
    got = _dedupe([(rid, "IT", "Il Cammino di santa Giulia - " + tail) for rid, tail in SANTA_GIULIA])
    assert not any(", no." in n for n in got.values())
    assert got[194832] == "Il Cammino di santa Giulia, stage 24"
    assert got[199434] == "Il Cammino di santa Giulia, stage 24A"
    assert got[203052] == "Il Cammino di santa Giulia, stage 28A"
    assert len(set(got.values())) == 13


MAIN_TRAILS = [
    (185703, "GB", "West Highland Way", 185703),
    (189982, "GB", "West Highland Way (Kinlochleven to Fort William)", 0),
    (189977, "GB", "West Highland Way (Rowardennan to Inverarnan)", 0),
]


def test_the_main_row_of_a_long_trail_keeps_its_bare_name_not_an_id():
    got = _dedupe([(rid, cc, src) for rid, cc, src, _ in MAIN_TRAILS])
    assert got[185703] == "West Highland Way"
    assert got[189982] == "West Highland Way, Kinlochleven"
    assert got[189977] == "West Highland Way, Rowardennan"
    # Two bare rows is a different case: the second needs something, never both bare.
    got = _dedupe([(1, "GB", "Pentland Way"), (2, "GB", "Pentland Way"), (3, "GB", "Pentland Way")])
    assert len(set(got.values())) == 3 and not any(n == "Pentland Way" for n in got.values())
    # No main trail of the wire ever ships a raw id.
    for rid, name in ((185697, "Coast to Coast Walk"), (187913, "Pentland Way"), (189308, "Shropshire Way")):
        got = _dedupe([(rid, "GB", name), (rid + 1, "GB", name + " (Alpha to Beta)")])
        assert got[rid] == name


def test_an_end_is_used_whole_or_not_at_all():
    got = _dedupe([
        (187084, "GB", "Coast to Coast Walk (Richmond to Robin Hood’s Bay)"),
        (187085, "GB", "Coast to Coast Walk (Kirkby Stephen to Keld)")])
    assert got == {187084: "Coast to Coast Walk, Richmond", 187085: "Coast to Coast Walk, Kirkby Stephen"}
    assert not any(n.endswith(("to Robin", "to Fort")) for n in got.values())
    # A name that is the start of a hyphenated word is not finished with the next word.
    got = _dedupe([(17664, "AT", "Nickelsdorfer Rad-, Lauf- und Wanderstrecke L1"),
                   (17666, "AT", "Nickelsdorfer Rad-, Lauf- und Wanderstrecke L3")])
    assert all("und Wanderstrecke" not in n for n in got.values())


def test_a_quoted_or_bracketed_part_stands_in_for_a_start_that_cannot_take_a_suffix():
    got = _dedupe([(185107, "PL", 'Ścieżka przyrodniczo-dydaktyczna "Czarnocińskie buczyny"'),
                   (184470, "PL", 'Ścieżka przyrodniczo-dydaktyczna "Zielona Pętla"')])
    assert got == {185107: "Czarnocińskie buczyny", 184470: "Zielona Pętla"}
    got = _dedupe([(79384, "PT", "Passeio no vale por caminhos de almocreves (Trilho da Ribeira de Alportel)"),
                   (79385, "PT", "Passeio no vale por caminhos de almocreves (Trilho da Alcaria)")])
    assert got[79385] == "Trilho da Alcaria"


def test_a_start_is_trimmed_by_whole_segments_never_inside_a_word():
    got = _dedupe([
        (74250, "GR", "Άγιος Κωνσταντίνος - Καταφύγιο Κορομηλιάς - Καταφύγιο Πετρόστρουγκας"),
        (74251, "GR", "Άγιος Κωνσταντίνος - Καταφύγιο Κορομηλιάς")])
    assert got[74250].startswith("Agios Konstantinos")
    assert "Agios, " not in got[74250] and "Agios - " not in got[74250]
    got = _dedupe([(191970, "IT", HEAD_ROWS[4][2]), (203554, "IT", "Alta Via dell'Anfiteatro Morenico di Ivrea Tappa 5A")])
    assert got[191970].startswith("Alta Via dell’Anfiteatro")
    assert all(len(n) <= names.TITLE_MAX for n in got.values())
    # Never down to two words: the id sits beside a whole short start instead.
    assert names._fit_base("Ścieżka przyrodniczo-dydaktyczna", 20, True) is None


def test_john_muir_way_keeps_its_main_row_and_its_stages_read_without_ids():
    """Judge 1 fix 1 (D7): a main trail beside bracketed stages never ships a raw id."""
    rows = [(185726, "GB", "John Muir Way"),
            (190218, "GB", "John Muir Way (Balloch to Strathblane part 1)"),
            (190219, "GB", "John Muir Way (Balloch to Strathblane part 2)"),
            (190225, "GB", "John Muir Way (South Queensferry to Edinburgh part 1)"),
            (190226, "GB", "John Muir Way (South Queensferry to Edinburgh part 2)"),
            (190227, "GB", "John Muir Way (South Queensferry to Edinburgh)")]
    got = _dedupe(rows)
    assert got[185726] == "John Muir Way"
    assert len(set(got.values())) == len(rows)
    assert not any(", no." in n or "#" in n for n in got.values())
    assert got[190225] != got[190226]


def test_a_quoted_part_tells_generic_rows_apart_before_an_id():
    """Judge 1 fix 2: 'Rundwanderweg "..."' rows take the quoted part, not an id."""
    got = _dedupe([(184510, "PL", 'Ściezka dydaktyczna "Lubiatowskie Uroczyska"'),
                   (185373, "PL", 'Ścieżka dydaktyczna "PRZEZ LEŚNE SIEDLISKA"'),
                   (3, "PL", "Ściezka dydaktyczna"), (4, "PL", "Ścieżka dydaktyczna"),
                   (208139, "DE", 'Rundwanderweg "Auf den Spuren der Eisenbahn" Mistelbach'),
                   (5, "DE", "Rundwanderweg")])
    assert "Lubiatowskie Uroczyska" in got[184510] and "Auf den Spuren der Eisenbahn" in got[208139]
    assert all(", no." not in got[i] for i in (184510, 185373, 208139))


def test_a_suspended_hyphen_is_not_split_and_a_code_does_not_eat_the_word_after_it():
    """Judge 1 fixes 3 and 4."""
    n = names
    for rid, cc, src in ((17664, "AT", "Nickelsdorfer Rad-, Lauf- und Wanderstrecke L1"),):
        out = _dedupe([(rid, cc, src), (rid + 1, cc, src)])[rid]
        assert "Rad-, Lauf-" in out and "Rad-, Lauf," not in out.replace("Rad-, Lauf-", "")
    assert n.wire_name("PRC43SMI Pico das Camarinhas - Ponta da Ferraria", "PT")         == "Pico das Camarinhas - Ponta da Ferraria"
    got = n.wire_name("Via Sancti Martini HW-33-01 Geisenhausen - Landshut", "DE")
    assert "Geisenhausen" in got and "Landshut" in got and "HW-33-01" not in got
    assert n.wire_name("[C] Moravský Krumlov - Suchohrdly u Miroslavi", "CZ").startswith("Moravský Krumlov")


def test_a_cap_cuts_at_a_boundary_and_never_ends_on_a_joining_word_or_symbol():
    """Judge 2 fix 1 (D7): a start is whole or cut at a boundary; a cut name never ends on a
    separator or a function word. The wire shows each of these whole today."""
    got = names.wire_name("Tour Du Mont Blanc - Variante du Col de Tricot", "FR")
    assert "Tour Du Mont -" not in got and got in ("Variante du Col de Tricot", "Tour Du Mont Blanc")
    assert "Sentiero dei -" not in names.wire_name("Sentiero dei Partigiani - Anello della Battaglia", "IT")
    for src, cc in (("Ścieżka historyczno-przyrodnicza wokół Maślic", "PL"),
                    ("Rail Trail: Birmingham International > Marston Green", "GB"),
                    ("Below Kinder Scout: A Circular Walk Around Kinder Reservoir, High Peak", "GB"),
                    ("Lynmouth Circular via Watersmeet & Countisbury", "GB"),
                    ("Les Arbres remarquables de Bagnoles-de-l'Orne", "FR")):
        out = names.wire_name(src, cc)
        assert len(out) <= 42 and out[-1] not in ">_|-:,&(" and not out.lower().endswith(
            (" wokół", " around", " de", " &")), out
    got = _dedupe([(185498, "PL", "Ścieżka historyczno-przyrodnicza wokół Maślic"),
                   (189276, "GB", "Rail Trail: Birmingham International > Marston Green")])
    assert not got[185498].endswith("wokół") and not got[189276].endswith(">")


def test_a_cut_name_never_ends_on_a_short_or_joining_word_or_an_open_quote():
    """Wave 3 step 0 (judge 3 fix 1): one rule, names.trim_dangling, for every language."""
    cases = [
        (255880, "DE", "Etappe 4 der Wiesengänger Route der Wandertrilogie Allgäu", " der"),
        (182034, "ES", "Sendero de Ubiernaentre la Dehesa y el Cañón", " y"),
        (64543, "LT", "Babėnų miško sveikatingumo trasa ir pažintinis rekreacinis takas", " ir"),
        (89744, "BE", "Promenade à Ottignies-Louvain-la-Neuve nᵒ 1 : Céroux", "nᵒ"),
        (24642, "NO", "Fottur til Frafjordhatten og Kjærlighetsstien", " og"),
        (203885, "IT", "Sui pascoli del M.Comero fra Bruschete e Pian delle Riti", " e"),
    ]
    for rid, cc, src, bad in cases:
        got = _dedupe([(rid, cc, src)])[rid]
        assert not got.endswith(bad) and names.trim_dangling(got) == got, got
    got = _dedupe([(229222, "DE", "Südheide 'Wacholderwald in der Teufelsheide' W1m (mittlere Tour)")])[229222]
    assert got.count("'") % 2 == 0
    for word in ("der", "den", "das", "y", "e", "i", "ja", "og", "ir", "w", "nr", "son", "und", "et", "ve"):
        assert names.trim_dangling("Wanderweg Alpenblick " + word) == "Wanderweg Alpenblick", word
    assert names.trim_dangling("Walk Round Burghclere 'Footsteps") == "Walk Round Burghclere"
    assert names.trim_dangling("Nickelsdorfer Rad-, Lauf-") == "Nickelsdorfer Rad-, Lauf-"
    # An abbreviation keeps its dot (judge 1: "Śl.", "pl.", "1241 r.").
    for kept in ("Szlak Śl.", "Droga pl.", "Trasa 1241 r."):
        assert names.trim_dangling(kept) == kept, kept
    assert names.trim_dangling("Szlak w") == "Szlak"


def test_142161_takes_its_readable_original_without_the_network_prefix_before_an_id():
    """Judge 3 fix 2: 'IJsselmuiden/Station Kampen - groene route' is exactly 42 characters."""
    got = _dedupe([(142161, "NL", "WNW IJsseldelta -IJsselmuiden/Station Kampen - groene route"),
                   (159251, "NL", "WNW Twente- Mariaparochie/Harbrinkhoek - groene route"),
                   (166611, "NL", "Groene route")])
    assert ", no. " not in got[142161] and ", no. " not in got[159251]
    assert got[142161] == "IJsselmuiden/Station Kampen - groene route"

def test_abbreviation_dot_survives_the_wire_path():
    # Judge 2 (wave 3): trim_dangling kept the dot but strip_network and
    # cap_title dropped it first; pin the real export path.
    for name in ("Szlak Bitwy 1241 r.", "Szlak Śl.", "Droga pl."):
        assert names.readable(name, "PL") == name
        assert names.wire_name(name, "PL") == name
    assert names.wire_name("Lake walk.", "GB") == "Lake walk"

def test_dotted_initials_keep_their_dot():
    # Judge 3 (wave 3): dotted initials and a 4 letter abbreviation beside
    # another one; the cap path ("Goldsteig S8: ..." folded off) as well.
    cases = {"[Z] Bítov - Podhradí n.D.": "CZ", "Partinico - Masseria Signora S.I.": "IT",
             "Krosno Odrz.- Radnica Szkl.": "PL"}
    for name, cc in cases.items():
        assert names.wire_name(name, cc) == name      # the whole name, so a cut start cannot pass
    assert names._ends_in_abbrev("Szabó-pallag-eh") and names.wire_name("Szabó-pallag-eh.", "HU") == "Szabó-pallag-eh."
    got = names.wire_name("Goldsteig S8: Verzweigung Kulzer Moos - Neunburg v.W.", "DE")
    assert got.endswith("Neunburg v.W.") and len(got) <= names.TITLE_MAX
    assert names.trim_dangling("Lake walk around the w.") == "Lake walk"


def test_a_name_never_ends_on_a_joining_word_bis_or_durch():
    """Judge 4 fix 1: "Hohe Düne bis" and "Rinkerode und durch" were cut names that
    ended on a joining word the list did not know."""
    cases = {
        235061: ("Thalasso-Kurweg 10 -- Hohe Düne bis Markgrafenheide", "Thalasso-Kurweg 10 -- Hohe Düne"),
        245310: ("12 – A bis Z-Tour – Von A wie Arnach bis Z wie Ziegel", "12 – A bis Z-Tour – Von A wie Arnach"),
        211293: ("Raute 2 Wanderung in Rinkerode und durch die Davert", "Raute 2 Wanderung in Rinkerode"),
    }
    for rid, (src, want) in cases.items():
        got = names.wire_name(src, "DE")
        assert got == want and not got.endswith((" bis", " durch")), (rid, got)
    for word in ("bis", "durch", "zu", "ins", "über", "unter", "gegen", "hinter", "vor", "ohne", "entlang", "przy"):
        assert names.trim_dangling("Wanderweg Alpenblick " + word) == "Wanderweg Alpenblick", word
    # "bis" after a number is a variant suffix, a real end.
    assert names.wire_name("Sentiero Italia Tappa 19 bis", "IT") == "Sentiero Italia Tappa 19 bis"


def test_a_trailing_bracket_goes_before_a_place_does():
    """Judge 4 fix 2: "A - B (note)" is "A - B" once the note goes, when that fits."""
    cases = [
        (62609, "ME", "Kapetanovo Jezero – Zagradac (suggested trail, no trailmarks)", "Kapetanovo Jezero – Zagradac"),
        (2641, "CH", "Concise - Vaumarcus (par Le Camp de Vaumarcus)", "Concise - Vaumarcus"),
        (215780, "DE", "Östlicher Albrandweg Lichtenfels - Thurnau (Teil 1)", "Östlicher Albrandweg Lichtenfels - Thurnau"),
        (9509, "DE", "Lörrach Bahnhof - Rührberg (Westweg Etappe 1 bis Basel)", "Lörrach Bahnhof - Rührberg"),
    ]
    for rid, cc, src, want in cases:
        if want:
            assert names.wire_name(src, cc) == want, rid
    # The twin "A - B" and "A - B (variant)" still tell apart, and never end on an open bracket.
    got = _dedupe([(1, "BE", "Via Brabantica, Antwerpen - Mechelen"),
                   (2, "BE", "Via Brabantica, Antwerpen - Mechelen (variant)")])
    assert got[1] != got[2] and "(" not in got[2].replace("(variant)", ""), got


def test_a_lead_code_peeled_before_a_bracket_leaves_no_stray_closer():
    """Judge 1 (wave 3b): "Wm 03 (Untergrafenrieder Weg)" is balanced on the wire."""
    cases = [
        (107843, "DE", "Wm 03 (Untergrafenrieder Weg)", "Untergrafenrieder Weg"),
        (209992, "DE", "Tour 11 (orange 11)", "orange 11"),
        (77072, "RO", "DJ 708 (Julita - Gurahonț) - Vf. Drocea", "Julita - Gurahonț - Vf. Drocea"),
        (75869, "RO", "Piatra Pușcată / Confluența Tâmnei cu Cerna (km 26) - Km 18 DN67D (Motel Dumbrava)", "Motel Dumbrava"),
    ]
    for rid, cc, src, want in cases:
        n1 = names.wire_name(src, cc)
        s, _code = names.split_code(n1)
        got = names.cap_title(s) if s and not names.is_code(s) else n1
        assert got == want, (rid, got)
        assert got.count("(") == got.count(")") and got.count("[") == got.count("]")
