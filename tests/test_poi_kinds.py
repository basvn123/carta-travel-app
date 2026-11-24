"""POI kind classifier and non-place rules (D15, D23, data wave 4).

classify_poi decides from desc, then name words, then the Wikidata flags. A
real sight dropped by mistake is worse than junk kept, so the must-keep rows
are asserted never to be noise.

Runs under pytest, or standalone: python tests/test_poi_kinds.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "pois"))

import normalize_poi_kinds as n  # noqa: E402
import dedupe_pois  # noqa: E402
from rating_config import section  # noqa: E402

KNOWN = set(section("poi_categories.kind_category"))


def poi(name, kind="Square", desc=None, **kw):
    it = {"name": name, "kind": kind}
    if desc is not None:
        it["desc"] = desc
    it.update(kw)
    return it


def test_atomium_and_manneken_pis_are_not_squares():
    for it in (poi("Atomium", desc="Landmark building in Brussels, Belgium"),
               poi("Manneken Pis", desc="Brass sculpture and fountain in Brussels, Belgium",
                   heritage=True)):
        v = n.classify_poi(it)
        assert v["kind"] != "Square", it
        assert not v["noise_reason"], it


def test_dam_is_a_square_and_stays_a_place():
    v = n.classify_poi(poi("Dam", kind="Palace", desc="Town square in Amsterdam",
                           heritage=True, wiki="https://en.wikipedia.org/wiki/Dam_Square"))
    assert v == {"kind": "Square", "noise_reason": ""}


def test_a_square_with_a_square_word_stays():
    assert n.classify_poi(poi("Plac Litewski"))["kind"] == "Square"
    assert n.classify_poi(poi("Piazza Navona"))["kind"] == "Square"


def test_a_square_without_evidence_is_not_a_square():
    v = n.classify_poi(poi("Xyzzy"))
    assert v["kind"] == "Attraction"


def test_name_words_retype_a_row_without_desc():
    assert n.classify_poi(poi("Church of St Mary"))["kind"] == "Church"
    assert n.classify_poi(poi("Burg Eltz"))["kind"] == "Castle"


def test_settlements_and_houses_are_retyped_by_desc():
    assert n.classify_poi(poi("Malounta", desc="Village in Nicosia District"),
                          known=KNOWN)["kind"] == "Village"
    assert n.classify_poi(poi("Lilleshall Hall", desc="Country house in Shropshire"))["kind"] == "Palace"
    assert n.classify_poi(poi("Norris Almshouses", desc="Historic site in Chesterfield"))["kind"] \
        not in ("Square", "")


def test_battles_disasters_shops_and_seabed_are_noise():
    assert n.classify_poi(poi("Battle of Berlin", desc="1945 battle"))["noise_reason"] == "event"
    assert n.classify_poi(poi("Heysel Stadium disaster", kind="Attraction",
                              desc="1985 football crowd disaster"))["noise_reason"] == "event"
    assert n.classify_poi(poi("Waitrose"))["noise_reason"] == "shop"
    assert n.classify_poi(poi("Fondali di Punta Campanella", kind="Nature reserve"))["noise_reason"] == "seabed"
    assert n.classify_poi(poi("FC Example", desc="Football club in Belgium"))["noise_reason"] == "organisation"
    assert n.classify_poi(poi("AEK"))["noise_reason"] == "junk name"


def test_a_chain_name_with_a_museum_desc_is_kept():
    assert not n.classify_poi(poi("Sainsbury Centre for Visual Arts", kind="Museum",
                                  desc="World art museum at the University of East Anglia",
                                  heritage=True))["noise_reason"]


def test_must_keep_rows_are_never_noise():
    keep = [
        poi("Colosseum", kind="Theatre", desc="Ancient amphitheatre in Rome", heritage=True),
        poi("Parthenon", desc="Ancient temple on the Acropolis of Athens", heritage=True),
        poi("Lion's Mound", desc="Memorial hill at the Waterloo battlefield"),
        poi("Waterloo Battlefield Memorial", desc="Battle of Waterloo memorial site"),
        poi("Berlin Wall Memorial", desc="Memorial in Berlin", heritage=True),
        poi("Auschwitz-Birkenau State Museum", kind="Museum", desc="Museum and memorial in Poland"),
        poi("Auschwitz", desc="Former concentration camp", heritage=True),
        poi("Pere Lachaise Cemetery", desc="Cemetery in Paris, France", heritage=True),
        poi("Atomium", desc="Landmark building in Brussels, Belgium"),
        poi("Manneken Pis", desc="Brass sculpture and fountain in Brussels, Belgium", heritage=True),
        poi("Dam", kind="Palace", desc="Town square in Amsterdam", heritage=True),
        poi("Slovak National Theatre", kind="Theatre", desc="Theatre and opera company in Bratislava"),
    ]
    for it in keep:
        assert not n.classify_poi(it)["noise_reason"], it["name"]


def test_fame_does_not_rescue_an_event_or_a_company():
    big = {"sitelinks": 90}
    assert n.classify_poi(poi("Battle of Vienna", desc="1683 battle"), big)["noise_reason"] == "event"
    assert n.classify_poi(poi("Deutsche Bank", desc="globally active bank in Germany"),
                          big)["noise_reason"] == "organisation"


def test_event_names_with_ordinals_and_on():
    for name in ("Third Siege of Missolonghi", "Raid on Pula", "Combat of the Thirty",
                 "Second Battle of Châtillon", "Eleventh Battle of the Isonzo"):
        assert n.classify_poi(poi(name))["noise_reason"] == "event", name


def test_a_town_hall_is_not_a_town():
    for name, desc in (("Gdansk Main Town Hall", "Town hall in Gdansk"),
                       ("Roemer", "City hall in Frankfurt"),
                       ("Joensuu Town Hall", "Town hall in Finland"),
                       ("Rathaus", None)):
        v = n.classify_poi(poi(name, desc=desc), known=KNOWN)
        assert v["kind"] not in ("Town", "Square"), name
    assert n.classify_poi(poi("Palazzo Vecchio", kind="Palace", desc="Town hall in Florence"),
                          known=KNOWN)["kind"] == "Palace"


def test_colosseum_is_not_a_theatre():
    v = n.classify_poi(poi("Colosseum", kind="Theatre", desc="Ancient amphitheatre in Rome",
                           heritage=True))
    assert v["kind"] != "Theatre"


def test_normalize_items_flags_without_removing():
    items = [poi("Waitrose"), poi("Atomium", desc="Landmark building in Brussels, Belgium", rate=3)]
    n_kind, n_noise = n.normalize_items(items)
    assert len(items) == 2
    assert items[0]["noise"] == 1 and items[0]["rate"] == 0
    assert "noise" not in items[1] and items[1]["rate"] == 3
    assert n_noise == 1 and n_kind >= 1


def test_every_kind_it_produces_has_a_category():
    for it in (poi("Windmill X", desc="Windmill in the Netherlands"),
               poi("Kerk", desc="Cemetery"), poi("Z", desc="Cave system"),
               poi("Q", desc="Ancient greek temple"), poi("Mem", desc="War memorial")):
        assert n.classify_poi(it)["kind"] in KNOWN, it


def test_same_wiki_within_250_m_is_one_place():
    """Dam and Dam Square: the same Wikipedia article, two names, two kinds."""
    wiki = "https://en.wikipedia.org/wiki/Dam_Square"
    items = [poi("Dam", kind="Palace", lat=52.3731, lon=4.8936, wiki=wiki),
             poi("Dam Square", kind="Square", lat=52.3732, lon=4.8937, wiki=wiki),
             poi("Elsewhere", kind="Church", lat=52.5, lon=4.9, wiki=wiki)]
    groups = dedupe_pois.dedupe_dest(items)
    assert any({0, 1} <= set(g) for g in groups)
    assert not any(2 in g for g in groups)


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
