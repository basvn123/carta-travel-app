"""POI descriptions (T1096, D9): grounded, sourced, wrong places rejected.

Runs on recorded Wikipedia answers; no network.

    python -m pytest tests/test_poi_descriptions.py -q
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Both the dossier and the trips pipelines have a module called common.
_other = sys.modules.pop("common", None)
sys.path.insert(0, str(ROOT / "pipeline" / "dossier"))
sys.path.insert(0, str(ROOT / "pipeline"))
import poi_descriptions as pd  # noqa: E402
sys.path.remove(str(ROOT / "pipeline"))
sys.path.remove(str(ROOT / "pipeline" / "dossier"))
sys.modules.pop("common", None)
if _other is not None:
    sys.modules["common"] = _other

FIX = ROOT / "tests" / "fixtures" / "poi_descriptions"
fetch, search, resolve_en = pd.fixture_fetchers(str(FIX))


def poi(name, wiki=None, lat=54.488, lon=-0.608, label="must_see"):
    return {"key": f"WHT||{name}", "dest": "WHT", "name": name, "label": label,
            "lat": lat, "lon": lon, "wiki": wiki, "country": "United Kingdom",
            "iso2": "GB", "desc": ""}


def rec(p):
    return pd.build_record(p, fetch, search, resolve_en, today="2026-11-06")


def test_description_is_whole_verbatim_sentences_with_source():
    r = rec(poi("Whitby Abbey", "https://en.wikipedia.org/wiki/Whitby_Abbey"))
    assert r["status"] == "ok"
    assert r["desc"].startswith("Whitby Abbey is a ruined Benedictine abbey")
    assert len(r["desc"]) <= pd.DESC_MAX and r["desc"].endswith(".")
    s = r["source"]
    assert s["url"] == "https://en.wikipedia.org/wiki/Whitby_Abbey"
    assert s["revid"] == 1234 and s["licence"] == "CC BY-SA 4.0"
    assert s["fetched"] == "2026-11-06"
    art = fetch("Whitby Abbey")
    ok, bad = pd.hpi.check_grounded(r["desc"], [art])
    assert ok, bad


def test_local_edition_link_goes_through_the_english_langlink():
    r = rec(poi("Abbaye de Whitby", "https://fr.wikipedia.org/wiki/Abbaye_de_Whitby"))
    assert r["status"] == "ok" and r["source"]["title"] == "Whitby Abbey"


def test_search_hit_needs_a_matching_title():
    r = rec(poi("Whitby Abbey"))                   # no link, found by search
    assert r["status"] == "ok"
    miss = rec(poi("Harbour crane"))
    assert miss["status"] == "miss"


def test_disambiguation_is_rejected():
    r = rec(poi("Mercury", "https://en.wikipedia.org/wiki/Mercury"))
    assert r["status"] == "rejected"
    assert "disambiguation" in r["rejected"][0]["why"]


def test_wrong_place_by_coordinates_is_rejected():
    r = rec(poi("Castle Hill", "https://en.wikipedia.org/wiki/Castle_Hill"))
    assert r["status"] == "rejected"
    assert any(w.startswith("wrong_place_") for w in r["rejected"][0]["why"])


def test_list_pages_and_stubs_are_never_merged():
    lst = rec(poi("List of bridges in Whitby",
                  "https://en.wikipedia.org/wiki/List_of_bridges_in_Whitby"))
    assert lst["status"] == "rejected" and "boilerplate" in lst["rejected"][0]["why"]
    short = rec(poi("Khaju Bridge", "https://en.wikipedia.org/wiki/Khaju_Bridge"))
    assert short["status"] == "rejected"
    assert short["rejected"][0]["why"][0].startswith("too_short")


def test_first_sentence_longer_than_cap_is_refused_not_cut():
    assert pd.lead_sentences("A" * 400 + ". Next one here.") == []


def master():
    return {"destinations": {"WHT": {"iso2": "GB", "country": "United Kingdom",
        "activities": {"items_full": [
            {"name": "Whitby Abbey", "label": "must_see", "desc": ""},
            {"name": "Old Pier", "label": "recommended", "desc": "A pier."},
            {"name": "Side Lane", "label": "worth_a_look"},
            {"name": "Grounded", "label": "must_see", "desc": "x" * 50,
             "desc_src": {"url": "u"}}]}},
        "FRX": {"iso2": "DE", "activities": {"items_full": [
            {"name": "Out", "label": "must_see"}]}}}}


def test_selection_is_labelled_pois_of_the_countries_only():
    ps = pd.select_pois(master())
    assert sorted(p["name"] for p in ps) == ["Grounded", "Old Pier", "Whitby Abbey"]


def test_coverage_before_and_after_the_harvest():
    ps = pd.select_pois(master())
    before = pd.coverage(ps)
    assert before[("GB", "must_see")] == {"n": 2, "with_desc": 1, "harvested": 0}
    cache = {"WHT||Whitby Abbey": rec(poi("Whitby Abbey"))}
    after = pd.coverage(ps, cache)
    assert after[("GB", "must_see")]["with_desc"] == 2
    assert after[("GB", "must_see")]["harvested"] == 1


def test_apply_fills_missing_keeps_grounded_and_records_the_credit():
    m = master()
    cache = {"WHT||Whitby Abbey": rec(poi("Whitby Abbey")),
             "WHT||Old Pier": {"status": "ok", "desc": "Short.", "source": {
                 "title": "t", "url": "u", "licence": "CC BY-SA 4.0"}},
             "WHT||Grounded": {"status": "ok", "desc": "y" * 200, "source": {
                 "title": "t", "url": "u", "licence": "CC BY-SA 4.0"}}}
    res = pd.apply_cache(m, cache)
    items = {i["name"]: i for i in m["destinations"]["WHT"]["activities"]["items_full"]}
    assert res == {"set": 1, "replaced": 0}
    assert items["Whitby Abbey"]["desc"].startswith("Whitby Abbey is")
    assert items["Whitby Abbey"]["desc_src"]["licence"] == "CC BY-SA 4.0"
    assert items["Old Pier"]["desc"] == "A pier."       # new text not richer
    assert items["Grounded"]["desc"] == "x" * 50        # grounded stays
