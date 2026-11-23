"""Dossier highlight and festival predicates (D23, data wave 4).

Brussels used to open with King Baudouin Stadium, the Heysel disaster and
Lotto Park; Barcelona and Brussels listed an erotic film festival and an adult
trade show. One predicate each, shared by the wire and the dossier.

Runs under pytest, or standalone: python tests/test_dossier_filters.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
DOSSIER = str(ROOT / "pipeline" / "dossier")
sys.path.insert(0, DOSSIER)
# build_dossier imports the dossier's own `common`; pipeline/stays/tests import
# another `common` by the bare name, so the dossier one must not stay cached.
_prior_common = sys.modules.pop("common", None)

import build_dossier as bd  # noqa: E402
import festival_filter as ff  # noqa: E402

sys.modules.pop("common", None)
if _prior_common is not None:
    sys.modules["common"] = _prior_common
sys.path.remove(DOSSIER)


def test_brussels_stadiums_and_disaster_are_not_highlights():
    for name, types in (("King Baudouin Stadium", "stadium|Multi-purpose stadium"),
                        ("Heysel Stadium disaster", "stampede|stadium disaster"),
                        ("Lotto Park", "stadium")):
        assert not bd.is_highlight_ok({"name": name, "kind": "Landmark", "_types": types}), name


def test_real_highlights_stay():
    for name in ("Eiffel Tower", "Cathedral of St. Michael and St. Gudula", "Colosseum"):
        assert bd.is_highlight_ok({"name": name, "kind": "Landmark"}), name


def test_heritage_keeps_a_cemetery_and_a_stadium_but_not_an_event():
    assert bd.is_highlight_ok({"name": "Pere Lachaise Cemetery", "heritage": True})
    assert bd.is_highlight_ok({"name": "Olympic Stadium", "heritage": True, "desc": "Stadium in Berlin"})
    assert not bd.is_highlight_ok({"name": "Battle of Berlin", "heritage": True})
    assert not bd.is_highlight_ok({"name": "Old cemetery"})
    assert not bd.is_highlight_ok({"name": "Central Prison", "desc": "Prison in X"})


def test_an_event_site_with_a_memorial_word_stays():
    assert bd.is_highlight_ok({"name": "Waterloo Battlefield Memorial", "desc": "Memorial"})


def test_landmarks_keep_their_p31_types():
    rows = bd.landmarks_as_items([{"name": "Lotto Park", "lat": 1.0, "lon": 2.0,
                                   "types": "stadium", "kind": "Landmark"}])
    assert rows[0]["_types"] == "stadium"


def test_adult_and_trade_festivals_are_banned():
    assert not ff.is_festival_ok({"name": "Barcelona International Erotic Film Festival"})
    assert not ff.is_festival_ok({"name": "Brussels International Festival of Eroticism",
                                  "desc": "trade show for the European adult entertainment industry"})
    assert not ff.is_festival_ok({"name": "Some Fair", "desc": "annual trade fair for machines"})
    assert ff.is_festival_ok({"name": "Flower Carpet of Brussels", "desc": "biennial flower event"})
    assert ff.is_festival_ok({"name": "Brussels International Fantastic Film Festival",
                              "desc": "annual film festival for speculative fiction"})
    assert ff.is_festival_ok({"name": "Sussex Folk Festival"})


def test_slim_event_and_derive_do_use_the_same_predicate():
    import export_destinfo
    import derive_do
    assert export_destinfo.is_festival_ok is ff.is_festival_ok
    assert derive_do.is_festival_ok is ff.is_festival_ok


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
