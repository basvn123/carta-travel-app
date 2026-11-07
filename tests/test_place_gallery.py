"""Gallery pass (T1096, D9): licence gate, author kept, dedupe, coverage.

Runs on a recorded Commons geosearch answer; no network.

    python -m pytest tests/test_place_gallery.py -q
"""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIX = ROOT / "tests" / "fixtures" / "place_gallery"
# Both the dossier and the trips pipelines have a module called common.
_other = sys.modules.pop("common", None)
sys.path.insert(0, str(ROOT / "pipeline" / "dossier"))
_spec = importlib.util.spec_from_file_location(
    "place_gallery", ROOT / "pipeline" / "photos" / "place_gallery.py")
pg = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pg)
import build_dossier as bd  # noqa: E402
sys.path.remove(str(ROOT / "pipeline" / "dossier"))
sys.modules.pop("common", None)
if _other is not None:
    sys.modules["common"] = _other


def place(**kw):
    p = {"id": "WHT", "name": "Whitby", "iso2": "GB", "class": "town",
         "lat": 54.486, "lon": -0.613, "files": {pg.norm_name("Already in gallery.jpg")}, "n": 2}
    p.update(kw)
    return p


def answer(_params):
    return json.loads((FIX / "WHT.json").read_text())


def test_only_licensed_photographs_with_an_author_survive():
    res = pg.harvest_place(place(), answer)
    files = [r["file"] for r in res["photos"]]
    assert "Fish and chips.jpg" not in files          # NC
    assert "Swing bridge.jpg" not in files            # GFDL alone
    assert "Pier unsigned.jpg" not in files           # owes a name, has none
    assert "Whitby map.jpg" not in files              # not a photograph
    assert "Whitby locator.svg" not in files
    assert "Tiny whitby.jpg" not in files             # too small
    assert "Already in gallery.jpg" not in files      # already shown
    assert res["dropped"]["licence"] == 2
    assert res["dropped"]["no_author"] == 1


def test_licence_and_author_are_kept_and_html_is_stripped():
    res = pg.harvest_place(place(), answer)
    top = res["photos"][0]
    assert top["file"] == "Whitby Abbey at dusk.jpg"   # name in file, biggest
    assert top["author"] == "Ann Smith"
    assert top["licence"] == "CC BY-SA 4.0"
    assert top["licence_url"].startswith("https://creativecommons.org/")
    assert top["page"].startswith("https://commons.wikimedia.org/wiki/File:")
    for r in res["photos"]:
        assert r["licence"] and (r["author"] or r.get("no_attribution_required"))


def test_public_domain_without_author_is_allowed_when_none_is_owed():
    res = pg.harvest_place(place(), answer)
    pd = [r for r in res["photos"] if r["file"] == "East cliff steps.jpg"]
    assert pd and pd[0]["author"] == "" and pd[0]["licence"] == "Public domain"


def test_one_author_gives_at_most_two():
    res = pg.harvest_place(place(), answer)
    assert sum(1 for r in res["photos"] if r["author"] == "Bob Jones") == 2


def test_empty_answer_is_a_stored_empty_not_an_error():
    res = pg.harvest_place(place(id="EMP"), lambda p: {"query": {"pages": []}})
    assert res["status"] == "empty" and res["photos"] == []


def test_geosearch_radius_is_capped_and_by_class():
    assert pg.geosearch_params(place(**{"class": "area"}))["ggsradius"] <= 10000
    assert (pg.geosearch_params(place(**{"class": "village"}))["ggsradius"]
            < pg.geosearch_params(place(**{"class": "metro"}))["ggsradius"] + 1)


def test_targets_are_short_places_emptiest_first():
    ps = [place(id="A", n=5), place(id="B", n=3), place(id="C", n=0),
          place(id="D", n=4, lat=None)]
    assert [p["id"] for p in pg.select_targets(ps)] == ["C", "B"]


def test_coverage_counts_the_stored_pass():
    ps = [place(id="A", n=5), place(id="B", n=3, files=set()),
          place(id="C", n=0, files=set())]
    now = pg.coverage(ps)["GB"]
    assert now["at_target"] == 1 and now["empty"] == 1
    store = {"B": {"photos": [{"file": "x1.jpg"}, {"file": "x2.jpg"}]},
             "C": {"photos": [{"file": f"y{i}.jpg"} for i in range(6)]}}
    after = pg.coverage(ps, store)["GB"]
    assert after["at_target"] == 3 and after["empty"] == 0


def test_extras_become_candidates_with_their_own_metadata():
    res = pg.harvest_place(place(), answer)
    cands = pg.extras_for({"WHT": res}, "WHT")
    assert cands and cands[0]["role"] == "commons_pass"
    assert cands[0]["meta"]["author"] == "Ann Smith"
    assert pg.extras_for({}, "WHT") == []


def test_compose_gallery_appends_extras_behind_the_licence_gate():
    class NoTasl:
        def lookup(self, url):
            return None

    res = pg.harvest_place(place(), answer)
    refusals = []
    out = bd.compose_gallery({"city": "Whitby"}, [], {}, NoTasl(), refusals,
                             extras=pg.extras_for({"WHT": res}, "WHT"))
    assert out, refusals
    assert all(g["ok_print"] and g["licence"] and g["page"] for g in out)
    assert out[0]["author"] == "Ann Smith"
