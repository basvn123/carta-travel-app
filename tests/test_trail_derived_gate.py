"""D24: the derived-route publish gate in trails_curate.

Every case is a real row from the 2026-11-20 hand check of the box data
(Germany, plus the approved samples from other countries), so a word list or
a threshold change that flips one of them shows up here first."""

import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import derived_gate as g  # noqa: E402


def row(title, km, highway="track", surface=None, join="base-name", cc="DE",
        sac=None, waymark=0.0, derived_from=None, wikipedia=None,
        tracktype=None, rid=1):
    return {
        "id": rid, "country": cc, "title": title, "raw_name": None,
        "distance_m": km * 1000, "highway": highway, "surface": surface,
        "tracktype": tracktype, "derived_join": join,
        "derived_from": derived_from or join, "waymark_share": waymark,
        "sac_scale": sac, "wikipedia": wikipedia, "derived_route": True,
    }


def rule(r, repeats=None):
    ok, why, _ = g.verdict(r, repeats)
    return ok, why


# --- held -----------------------------------------------------------------

def test_lanes_and_streets_are_held():
    assert rule(row("Oberdörfer Allee", 3.5, surface="compacted")) == (False, "street")
    assert rule(row("Farzbornwiesenschneise", 2.8, surface="compacted")) == (False, "street")
    assert rule(row("Snietalos g.", 2.4, cc="LT", surface="unpaved")) == (False, "street")
    assert rule(row("Kästestraße", 3.6, surface="compacted")) == (False, "street")
    # Fame does not save a street: the Wikidata item is the street's own.
    assert rule(row("Schleißheimer Straße", 3.1, highway="path",
                    derived_from="fame:Q241574")) == (False, "street")


def test_italian_via_is_a_street_unless_a_trail_word_follows():
    assert rule(row("Via Argine Sinistro del Brenta", 2.8, cc="IT",
                    surface="gravel")) == (False, "street")
    assert rule(row("Via Verde de la Sierra", 12, cc="ES", highway="path",
                    surface="asphalt"))[0]


def test_hard_surface_lane_is_held():
    assert rule(row("Verlatsweg", 2.3, surface="asphalt",
                    tracktype="grade1")) == (False, "hard-surface")
    assert rule(row("Dahlener Weg", 4.5, tracktype="grade1")) == (False, "hard-surface")


def test_border_road_bridge_and_untitled():
    assert rule(row("Kolonnenweg", 26.6, surface="concrete:lanes")) == (False, "border-road")
    assert rule(row("Ponte sobre o Tua", 0.7 + 2, highway="footway", cc="PT",
                    derived_from="fame:Q10351486")) == (False, "bridge")
    assert rule(row("", 2.1, join="any-named", surface="fine_gravel")) == (False, "untitled")
    # A bare Wikidata id names nothing a traveller can read.
    assert rule(row("", 5.8, derived_from="fame:Q1880445")) == (False, "untitled")


def test_generic_and_numbered_names_are_held():
    assert rule(row("Grenzweg", 4.0, highway="path")) == (False, "generic-name")
    assert rule(row("Alter Grenzweg", 4.0, highway="path")) == (False, "generic-name")
    assert rule(row("Aldbrough Bridleway and Footpath No 10", 2.2, cc="GB",
                    highway="bridleway", join="same-name")) == (False, "generic-name")


def test_repeated_name_is_a_lane_type():
    repeats = Counter({g.fold("Höhenweg"): 41})
    assert rule(row("Höhenweg", 3.0, highway="path"), repeats) == (False, "generic-name")
    # The same name used twice is just a name.
    assert rule(row("Höhenweg", 3.0, highway="path"),
                Counter({g.fold("Höhenweg"): 2})) == (True, "trail-name")


def test_short_named_tracks_without_evidence_are_held():
    assert rule(row("Sommerweg", 3.2)) == (False, "no-evidence")
    assert rule(row("Isweg", 2.0)) == (False, "no-evidence")
    # A trail word on a farm track needs real length.
    assert rule(row("Mühlkapfrundweg", 2.8, surface="fine_gravel",
                    join="same-name")) == (False, "no-evidence")
    assert rule(row("Mühlkapfrundweg", 6.0, surface="fine_gravel",
                    join="same-name")) == (True, "trail-name")


def test_track_with_t1_grade_is_not_graded():
    assert rule(row("Cascina Trat", 2.0, cc="IT", surface="ground",
                    sac="hiking")) == (False, "no-evidence")


# --- passes ---------------------------------------------------------------

def test_greenways_pass_on_asphalt():
    assert rule(row("Wye Valley Greenway", 4.1, cc="GB", highway="path",
                    surface="asphalt")) == (True, "greenway")
    assert rule(row("Voie Verte de la Vallée de la Vie", 13.8, cc="FR",
                    highway="path", surface="asphalt")) == (True, "greenway")


def test_rail_trails_pass_and_borrow_their_title():
    ok, why, title = g.verdict(row("", 3.0, highway="path", surface="asphalt",
                                   derived_from="fame:de:Flensburger Kreisbahn"))
    assert (ok, why, title) == (True, "rail-trail", "Flensburger Kreisbahn")
    assert rule(row("Ancienne Voie de Chemin de Fer Quimper - Pont-l'Abbé",
                    10.6, cc="FR", highway="path", surface="dirt")) == (True, "rail-trail")
    assert rule(row("Bahntrassenradweg Ochtrup-Rheine", 7.2, highway="path",
                    surface="asphalt")) == (True, "rail-trail")


def test_bahn_that_is_not_a_railway():
    assert not g.is_rail(g.fold("Rodelbahn am Hang"))
    assert not g.is_rail(g.fold("Autobahnbrücke"))
    assert not g.is_rail(g.fold("Barmer Bergbahn"))
    assert g.is_rail(g.fold("Schmalspurbahn Mügeln–Neichen"))


def test_waymark_grade_and_trail_names_pass():
    assert rule(row("Kaufungstraße", 2.0, surface="compacted",
                    waymark=0.88)) == (True, "waymark")
    assert rule(row("Fürstensteig", 2.0, highway="path",
                    sac="demanding_mountain_hiking", cc="LI")) == (True, "mountain-graded")
    assert rule(row("Röhrweg", 2.0, highway="path", surface="ground",
                    sac="hiking")) == (True, "graded")
    assert rule(row("Glen Loin Loop", 6.4, cc="GB", surface="gravel")) == (True, "trail-name")


def test_plain_paths_need_length():
    assert rule(row("Hexenstieg Nord", 3.5, highway="path",
                    join="same-name"))[0]
    assert rule(row("Zweidobel", 3.5, highway="path",
                    join="same-name")) == (True, "plain-path")
    assert rule(row("Zweidobel", 3.5, highway="path",
                    join="any-named")) == (False, "no-evidence")
    assert rule(row("Zweidobel", 6.0, highway="path",
                    join="any-named")) == (True, "plain-path")


def test_fame_walk_needs_length():
    assert rule(row("La Verdoyante", 6.2, cc="FR", highway="path",
                    derived_from="fame:Q105698088")) == (True, "fame-walk")
    assert rule(row("Klosterholzweg", 2.1, cc="CH",
                    derived_from="fame:Q27330351")) == (False, "no-evidence")


def test_control_group_keeps_its_rows_but_not_bridges_or_untitled():
    assert rule(row("Drumul Vechi", 2.0, cc="MD")) == (True, "control")
    assert rule(row("Triq il-Kbira", 2.0, cc="MT")) == (True, "control")
    assert rule(row("", 2.0, cc="AL")) == (False, "untitled")
    assert rule(row("Ura e Mesit", 2.0, cc="AL")) == (True, "control")
    assert rule(row("Most na Drini", 2.0, cc="MK")) == (False, "bridge")


def test_control_matches_derive_routes():
    src = (ROOT / "pipeline" / "trails" / "derive_routes.py").read_text(encoding="utf-8")
    line = next(ln for ln in src.splitlines() if ln.startswith("THIN_COUNTRIES"))
    assert set(eval(line.split("=", 1)[1])) == set(g.CONTROL)


# --- split ----------------------------------------------------------------

def test_split_leaves_relations_alone_and_counts():
    rel = {"id": 10, "country": "DE", "title": "Rennsteig", "distance_m": 169_000,
           "derived_route": False}
    rows = [rel,
            row("Grenzweg", 4.0, highway="path", rid=11),
            row("Wye Valley Greenway", 4.1, cc="GB", highway="path",
                surface="asphalt", rid=12),
            row("", 3.0, highway="path", surface="asphalt", rid=13,
                derived_from="fame:de:Flensburger Kreisbahn")]
    kept, held, borrowed, counts = g.split(None, "DE", rows)
    assert [r["id"] for r in kept] == [10, 12, 13]
    assert held == {11: "generic-name"}
    assert counts["derived"] == 3 and counts["pass:greenway"] == 1
    assert kept[2]["title"] == "Flensburger Kreisbahn"
    assert borrowed == {13: "Flensburger Kreisbahn"}
    line = g.count_line("DE", counts)
    assert "3 candidates" in line and "generic-name 1" in line


def test_fame_title_strips_language_and_qualifier():
    assert g.fame_title({"derived_from": "fame:de:Carlsbahn (Bahnstrecke)"}) == "Carlsbahn"
    assert g.fame_title({"wikipedia": "fr:Coulée verte René-Dumont"}) == "Coulée verte René-Dumont"
    assert g.fame_title({"derived_from": "fame:Q802340"}) is None


def test_seed_name_tag_is_borrowed_when_the_title_is_empty():
    r = row("", 6.0, highway="path", join="any-named", sac="mountain_hiking")
    r["raw_name"] = "Sentiero del Viandante"
    assert g.verdict(r) == (True, "mountain-graded", "Sentiero del Viandante")


def test_t1_grade_does_not_exempt_from_the_piece_rule():
    assert "graded" not in g.OWN_EVIDENCE
    assert "mountain-graded" in g.OWN_EVIDENCE


def test_not_a_walk_names():
    assert rule(row("DH Full Gars", 6.4, cc="FR", highway="path",
                    sac="hiking")) == (False, "not-a-walk")
    assert rule(row("TC - MTB Trail - Chitoc - Corbu", 5.3, cc="RO",
                    join="same-name")) == (False, "not-a-walk")
    assert rule(row("Approximative location of the hiking path", 2.1, cc="ME",
                    highway="path", sac="mountain_hiking")) == (False, "not-a-walk")


def test_reference_trails_pass_and_match_by_name():
    # Real entries of data/reports/validation/trails_reference.json.
    assert g.reference_of("Lechweg", "AT")[0] == "lechweg"
    assert g.reference_of("Lechweg Etappe 3", "AT") == ("lechweg", False)
    assert g.reference_of("Lechweg", "FR")[0] is None
    assert rule(row("Lechweg", 3.0, cc="AT")) == (True, "reference")


def test_shared_name_means_a_piece():
    assert g.names_overlap("Kungsleden (summer)", "Kungsleden")
    assert g.names_overlap("Adlerweg - Wanderweg 2", "Adlerweg Etappe 7")
    assert not g.names_overlap("Fürstensteig", "Via Alpina R1")


def test_reference_trail_is_its_own_walk_inside_another_route():
    assert "reference" in g.OWN_EVIDENCE


def test_reference_matches_by_registry_id():
    ids = g.reference_ids()
    # The Lechweg's registry row carries OSM relation 4728034.
    assert ids["AT"].get("4728034") == "lechweg"
    row_ = {"country": "AT", "title": "Weitwanderweg 99", "source_ref": "4728034"}
    assert g.reference_of_row(row_) == ("lechweg", True)


def test_exact_and_longest_reference_name_wins():
    assert g.reference_of("Escapardenne Lee Trail", "LU") == ("escapardenne-lee-trail", True)
    assert g.reference_of("Escapardenne Eislek Trail", "LU")[0] == "escapardenne-eislek-trail"
