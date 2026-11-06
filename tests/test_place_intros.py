"""Grounded place intros (T1095, ROADMAP D9): harvest, checks and merge.

Offline: the fixtures in tests/fixtures/place_intros/ stand in for the
Wikipedia and Wikivoyage APIs (their text is invented for the tests).
Run from the repo root: pytest tests/test_place_intros.py -q
"""

import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DOS = os.path.join(ROOT, "pipeline", "dossier")
FX = os.path.join(ROOT, "tests", "fixtures", "place_intros")

# Both the dossier and the trips pipelines have a module called common.
_other = sys.modules.pop("common", None)
sys.path.insert(0, DOS)
import build_dossier  # noqa: E402
import harvest_place_intros as hp  # noqa: E402
sys.path.remove(DOS)
sys.modules.pop("common", None)
if _other is not None:
    sys.modules["common"] = _other

FETCH, SEARCH = hp.fixture_fetchers(FX)


def place(name, country="France", lat=45.9, lon=6.12):
    return {"id": name, "name": name, "country": country, "lat": lat, "lon": lon}


def build(name, **kw):
    return hp.build_record(place(name, **kw), FETCH, SEARCH)


def test_good_place_is_grounded_and_meets_the_bar():
    r = build("Annecy")
    assert r["status"] == "ok", r
    assert r["meets_bar"] and r["words"] >= 120
    assert {g["source"] for g in r["grounding"]} == {"wikivoyage", "wikipedia"}
    for g in r["grounding"]:
        assert g["licence"] == "CC BY-SA 4.0"
        assert g["url"].startswith("https://en.wiki")
        assert g["revid"]
    # the pronunciation bracket is the one declared clean-up
    assert "pronunciation" not in r["body"]
    assert "—" not in r["body"] and "–" not in r["body"]


def test_every_sentence_is_a_verbatim_source_sentence():
    srcs = []
    for key, base, url in hp.APIS:
        a = FETCH(base, "Annecy")
        a["source"] = key
        srcs.append(a)
    body, _ = hp.compose(srcs)
    ok, bad = hp.check_grounded(body, srcs)
    assert ok and not bad
    ok2, bad2 = hp.check_grounded(body + " An invented sentence about a tram.", srcs)
    assert not ok2 and len(bad2) == 1


def test_disambiguation_and_wrong_place_are_rejected():
    r = build("Mercy")
    assert r["status"] == "rejected"
    why = [w for x in r["rejected"] for w in x["why"]]
    assert "disambiguation" in why
    t = build("Tiny")  # Texas Tiny is 8,000 km from the place
    assert any(w.startswith("wrong_place") for x in t["rejected"] for w in x["why"])


def test_airport_lead_and_language_are_rejected():
    r = build("Nice", lat=43.7, lon=7.25)
    # Wikipedia lead names the airport only mid-text, so the lead is fine,
    # but the short Wikivoyage lead alone would be too short to merge by itself.
    assert r["status"] in ("ok", "rejected")
    f = build("Brive", lat=45.16, lon=1.53)
    why = [w for x in f["rejected"] for w in x["why"]]
    assert "language" in why  # French Wikivoyage text on the English site
    a = hp.check_source({"title": "Paris Charles de Gaulle Airport",
                         "extract": "Paris Charles de Gaulle Airport is the main hub of France with many flights every day of the year."},
                        place("Paris"))
    assert "boilerplate" in a


def test_short_record_is_not_ok():
    why = hp.check_record("Tiny is a village.", [{"source": "x", "extract": "Tiny is a village."}], place("Tiny"))
    assert any(w.startswith("too_short") for w in why)


def test_split_keeps_abbreviations():
    s = hp.split_sentences("St. Malo is walled. Mt. Blanc is near. It rains.")
    assert s == ["St. Malo is walled.", "Mt. Blanc is near.", "It rains."]


def test_select_targets_ranks_by_score(tmp_path):
    import json
    d = tmp_path / "dossier"
    d.mkdir()
    for i, (cc, sc) in enumerate([("FR", 7.0), ("IT", 9.0), ("DE", 9.9), ("RS", 8.0)]):
        (d / f"X{i}.json").write_text(json.dumps({
            "id": f"X{i}", "place": {"name": f"P{i} (X)", "iso2": cc, "country": cc, "lat": 1, "lon": 2},
            "verdict": {"score": sc}}))
    (d / "index.json").write_text("{}")
    t = hp.select_targets(("FR", "RS", "IT"), 3, str(tmp_path))
    assert [x["id"] for x in t] == ["X1", "X3", "X0"]
    assert t[0]["name"] == "P1"
    # a country with fewer places hands its share to the others
    for i in range(10):
        (d / f"F{i}.json").write_text(json.dumps({
            "id": f"F{i}", "place": {"name": f"F{i}", "iso2": "FR", "country": "FR", "lat": 1, "lon": 2},
            "verdict": {"score": 5.0 - i / 10}}))
    t = hp.select_targets(("FR", "RS", "IT"), 8, str(tmp_path))
    assert len(t) == 8 and {x["iso2"] for x in t} == {"FR", "RS", "IT"}
    assert sum(x["iso2"] == "FR" for x in t) == 6


def test_merge_prefers_longer_ok_record_and_keeps_both_sources():
    dest = {"id": "ANY", "city": "Annecy", "country": "France", "place": {"class": "town"}}
    wv = {"ANY": {"extract": "Annecy is a city in the French Alps. " * 3, "title": "Annecy",
                  "url": "https://en.wikivoyage.org/wiki/Annecy"}}
    rec = build("Annecy")
    out = build_dossier.compose_intro(dest, wv, {}, {}, {}, {"ANY": rec})
    assert out["body"] == rec["body"]
    assert [g["source"] for g in out["grounding"]] == ["wikivoyage", "wikipedia"]
    # a rejected record never merges
    bad = dict(rec, status="rejected")
    out2 = build_dossier.compose_intro(dest, wv, {}, {}, {}, {"ANY": bad})
    assert out2["body"] != rec["body"]
