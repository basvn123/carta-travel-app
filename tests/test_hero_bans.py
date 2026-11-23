"""Hero bans (D17, wave 2 step 1.5): wrong-subject words, whole words only."""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("hero_bans_t", ROOT / "pipeline" / "photos" / "hero_bans.py")
hb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(hb)


def test_the_research_cases_are_banned():
    assert "portrait" in hb.banned("https://upload.wikimedia.org/x/Official_portrait_of_Keir_Starmer_crop_2.jpg")
    assert "emblem" in hb.banned("Flag_of_Tenno.svg")
    assert "svg" in hb.banned("https://upload.wikimedia.org/thumb/960px-Flag_of_Tenno.svg.png")
    assert "emblem" in hb.banned("Coat_of_arms_of_Luynes.png")
    assert "map" in hb.banned("Heathfield_locator_map.png")
    assert "animal" in hb.banned("Fur_Island_grizzly_bear.jpg")
    assert "not_photo" in hb.banned("Logo_Garrucha.png")


def test_clean_real_names_do_not_trip():
    for name in ("Beara_Peninsula_view.jpg", "Flagstaff_Hill.jpg", "Naousa_town_square.jpg",
                 "Mapledurham_House.jpg", "Coinage_museum.jpg", "Stampa_old_town.jpg", "Bearsden_station.jpg"):
        assert hb.banned(name) == [], name


def test_the_subjects_own_name_is_not_read():
    assert hb.banned("Map_town_hall.jpg", "Map") == []
    assert hb.banned("Map_town_hall.jpg", "Hythe") == ["map"]
    assert hb.banned("President_beach_sunset.jpg", "President") == []
    assert hb.banned("Bear_Island_coast.jpg", "Bear Island") == []


def test_a_url_is_read_by_its_file_not_its_folder_or_query():
    assert hb.banned("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Hythe_Kent_harbour.jpg/960px-Hythe_Kent_harbour.jpg?x=map") == []
    assert hb.is_banned("https://commons.wikimedia.org/wiki/File:Map_of_Roussillon.svg")
