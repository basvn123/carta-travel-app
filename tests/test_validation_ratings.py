"""T1191 (ROADMAP D23, Place ratings): the ratings layer on the shared runner.

A tiny catalogue, list files, Wikivoyage cache and UNESCO list on tmp_path:
list resolution and holes, the place-list filter, the UNESCO join fact,
pageviews 0 as unmeasured, per-country and pooled agreement, the gaps and
their verdicts, the status parser and the AUC.

    python -m pytest tests/test_validation_ratings.py -q
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "validation"))

import layer_ratings as lr
import runner as vr


def place(i, city, cc, country, score, fame, cls="town", pct=50, cpct=50, lat=45.0, lon=10.0,
          unesco=False, comps=None, gem=False):
    return {"id": i, "city": city, "iso2": cc, "country": country, "lat": lat, "lon": lon,
            "country_percentile": cpct, "place": {"class": cls},
            "geonames": {"population": 1000 + int(fame)},
            "designations": [{"kind": "unesco_whc"}] if unesco else [],
            "rating": {"score": score, "fame": fame, "hidden_gem": gem, "band": "good",
                       "components": comps or {"beauty": 0.3, "appeal": 0.7, "depth": 0.5, "recognition": 0},
                       "class_rank": {"class": cls, "pct": pct}}}


def setup(tmp_path, dests, ta=(), lp=(), wv=None, sites=(), lists=None):
    cat = tmp_path / "app_data.json"
    cat.write_text(json.dumps({"meta": {"generated_at": "2026-11-01"},
                               "destinations": {d["id"]: d for d in dests}}), encoding="utf-8")
    ext = tmp_path / "external"
    ext.mkdir()
    (ext / "tripadvisor.json").write_text(json.dumps(list(ta)), encoding="utf-8")
    (ext / "lonelyplanet.json").write_text(json.dumps(list(lp)), encoding="utf-8")
    src = tmp_path / "sources"
    (src / "lists").mkdir(parents=True)
    for name, rows in (lists or {}).items():
        (src / "lists" / f"{name}.json").write_text(json.dumps(rows), encoding="utf-8")
    wvp = tmp_path / "wv.json"
    wvp.write_text(json.dumps(wv or {}), encoding="utf-8")
    un = tmp_path / "unesco.json"
    un.write_text(json.dumps(list(sites)), encoding="utf-8")
    return {"catalogue": cat, "external": ext, "sources": src, "wikivoyage": wvp, "unesco": un}


def italy(n=40):
    """n Italian towns: score rises with fame, every fifth has an article."""
    return [place(f"IT{i}", f"Town {i}", "IT", "Italy", 5 + i * 0.1, 10 + i * 5, pct=i * 2, cpct=i * 2,
                  lat=40 + i * 0.5) for i in range(n)]


def test_lists_resolve_by_id_and_name_and_holes_count_only_places(tmp_path):
    dests = italy() + [place("FLR", "Florence (Peretola)", "IT", "Italy", 8.5, 900, cls="metro", cpct=95)]
    ta = [{"list": "TC Europe top destinations", "year": 2025, "rank": 1, "name": "Florence", "country": "Italy",
           "id": None, "url": "u"},
          {"list": "TC Europe top destinations", "year": 2025, "rank": 2, "name": "Sicily", "country": "Italy",
           "id": None, "url": "u"}]
    lp = [{"edition": 2024, "list": "regions", "rank": 3, "name": "Tuscany", "country": "Italy", "id": None},
          {"edition": 2025, "list": "cities", "rank": 1, "name": "Town 3", "country": "Italy", "id": "IT3"}]
    ctx = setup(tmp_path, dests, ta, lp)
    res = vr.run(lr, ctx)
    m = res["metrics"]
    assert m["coverage"]["k"] == 2 and m["coverage"]["n"] == 3      # Florence, Town 3; Sicily a hole
    assert res["reference"]["list_entries_not_rated"] == 1         # Tuscany is a region: not a hole
    assert m["listed_upper"]["k"] == 1 and m["listed_upper"]["n"] == 2   # Town 3 sits at percentile 6


def test_unesco_join_fact_and_pageviews_zero_left_out(tmp_path):
    dests = italy()
    dests[0]["rating"]["fame"] = 0
    dests[1]["designations"] = [{"kind": "unesco_whc"}]
    sites = [{"name": "Site A", "lat": 40.0, "lon": 10.0}, {"name": "Site B", "lat": 40.5, "lon": 10.01}]
    ctx = setup(tmp_path, dests, sites=sites)
    res = vr.run(lr, ctx)
    f = res["metrics"]["fact.unesco_join"]
    assert (f["k"], f["n"]) == (1, 2)                     # IT0 has a site and no tag
    assert res["metrics"]["agreement_tau"]["n"] == 39      # IT0 unmeasured
    assert res["metrics"]["agreement_tau"]["value"] == 1.0


def test_agreement_per_country_pools_small_countries(tmp_path):
    dests = italy() + [place(f"MT{i}", f"Malta {i}", "MT", "Malta", 6 + i, 50 * (3 - i)) for i in range(3)]
    wv = {f"IT{i}": {"url": "x"} for i in range(0, 40, 5)}
    ctx = setup(tmp_path, dests, wv=wv)
    res = vr.run(lr, ctx)
    ag = res["carta"]["agreement"]
    assert ag["by_country"]["IT"]["rho_pageviews"] == 1.0
    assert ag["by_country"]["small"]["members"] == ["MT"]
    assert ag["by_country"]["small"]["rho_pageviews"] == -1.0
    assert ag["by_country"]["IT"]["with_wikivoyage"] == 8
    assert ag["by_country"]["IT"]["auc_lists"] is None     # no listed places
    assert ag["t760_repeat"]["top"] == 43


def test_gaps_pick_both_kinds_and_attach_verdicts(tmp_path, monkeypatch):
    dests = italy()
    dests.append(place("LOW", "Lowtown", "IT", "Italy", 4.0, 5000, pct=5, cpct=5, lat=60))
    dests.append(place("GEM", "Gem (Valley)", "IT", "Italy", 9.0, 1, pct=97, cpct=99, lat=61, gem=True))
    lp = [{"edition": 2025, "list": "cities", "rank": 1, "name": "Lowtown", "country": "Italy", "id": None}]
    ctx = setup(tmp_path, dests, lp=lp, wv={"LOW": {"url": "x"}})
    v = tmp_path / "verdicts.json"
    v.write_text(json.dumps({"verdicts": [{"id": "LOW", "verdict": "keep", "cause": "class_curve",
                                           "reason": "r", "register_row": None}]}), encoding="utf-8")
    monkeypatch.setattr(lr, "VERDICTS", v)
    res = vr.run(lr, ctx)
    by = {g["id"]: g for g in res["gaps"]}
    assert by["LOW"]["kind"] == "outside_high" and by["LOW"]["verdict"] == "keep"
    assert set(by["LOW"]["flagged_by"]) >= {"lists", "wikivoyage", "pageviews"}
    assert by["GEM"]["kind"] == "carta_high" and by["GEM"]["cause_guess"] == "row_scope"


def test_status_parser_auc_and_runner_registration():
    assert lr.status_from_categories(["Category:Guide cities", "Category:Usable articles"]) == "guide"
    assert lr.status_from_categories(["Category:Star articles"]) == "star"
    assert lr.status_from_categories(["Category:Italy"]) is None
    assert lr.auc([3, 4], [1, 2]) == 1.0
    assert lr.auc([1], [1]) == 0.5
    assert vr.LAYERS["ratings"] == "layer_ratings"
