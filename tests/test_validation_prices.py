"""T1190 (ROADMAP D23, Prices): the prices layers on the shared runner.

A tiny app_data and reference on tmp_path: pivoting, the independence rule,
out-of-scope countries, gaps, the per country table, the fare examples and
the hand sample. The last test runs the committed reference.

    python -m pytest tests/test_validation_prices.py -q
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "validation"))

import layer_prices as lp
import layer_prices_fares as lf
import layer_prices_sample as ls
import runner as vr


def dest(i, cc, meal, bed, cls="town"):
    return {"id": i, "iso2": cc, "city": i, "place": {"class": cls},
            "costs": {"meal_mid_eur": meal, "grocery_day_eur": meal / 2},
            "accommodation": {"beds": {"dorm": bed / 3, "hotel3": bed, "bnb_home": {"2": bed}}}}


def app(anchors=None):
    ds = {}
    for cc, meal, bed in (("DE", 30, 100), ("FR", 30, 100), ("PL", 15, 100)):
        for k in range(3):
            ds[f"{cc}{k}"] = dest(f"{cc}{k}", cc, meal, bed)
    return {"meta": {"generated_at": "2026-11-01", "food_model": {
        "asof": "2026-09", "anchors": anchors or {"measured": ["DE", "FR"], "modelled": ["PL"]}},
        "food_country": {"DE": {"meal_mid_eur": 30}, "FR": {"meal_mid_eur": 30}, "PL": {"meal_mid_eur": 15}}},
        "destinations": ds}


def reference(tmp_path):
    p = tmp_path / "ref.json"
    lvl = {"DE": 100, "FR": 100, "PL": 50, "TR": 40}
    p.write_text(json.dumps({"pli": {
        "A0111": {cc: {"value": v, "year": 2024} for cc, v in lvl.items()},
        "A010101": {cc: {"value": v, "year": 2024} for cc, v in lvl.items()}}}), encoding="utf-8")
    return p


def run(tmp_path, **kw):
    ctx = {"reference": reference(tmp_path), "app_data": app(**kw)}
    return vr.run(lp, ctx, share=1.0), ctx


def test_reference_falls_back_to_the_broad_category(tmp_path):
    refs = lp.references({"reference": reference(tmp_path)})
    cats = {r["item"]: r["cat"] for r in refs}
    assert cats["meal_mid_eur"] == "A0111" and cats["bed.home"] == "A0111" and cats["grocery_day_eur"] == "A010101"
    assert "club_entry_eur" not in cats


def test_levels_independence_and_scope(tmp_path):
    res, _ = run(tmp_path)
    by = {r["id"]: r for r in res["results"]}
    # Meals: PL is half of DE and FR on both sides, so it agrees; but PL's food is
    # built from the index, so it is not counted in the facts.
    assert by["PL:meal_mid_eur"]["flags"] == {"matched": True, "independent": False}
    assert by["PL:meal_mid_eur"]["facts"]["level"] is None and by["PL:meal_mid_eur"]["error"] is None
    assert by["DE:meal_mid_eur"]["facts"]["level"] is True
    # Beds: PL is as dear as DE in Carta, half in Eurostat: a gap, and beds are independent.
    assert by["PL:bed.home"]["facts"]["level"] is False
    # TR has no Carta place: out of scope, not a miss.
    assert by["TR:meal_mid_eur"]["flags"]["matched"] is None
    assert by["TR:meal_mid_eur"]["note"] == "not_in_catalogue"
    assert res["metrics"]["coverage"]["n"] == 3 * len(lp.ITEMS)   # TR's items left out
    gaps = res["gaps"]
    assert gaps and gaps[0]["id"].startswith("PL:bed.")


def test_table_and_summary(tmp_path):
    ctx = {"reference": reference(tmp_path), "app_data": app()}
    res = lp.match(lp.references(ctx), lp.load(ctx))
    tab = lp.table(res)
    assert tab["PL"]["eat"]["median_ratio"] == 1.0 and tab["PL"]["eat"]["independent_n"] == 0
    assert tab["PL"]["bed"]["median_ratio"] > 1.5
    md = lp.table_markdown(tab, lp.group_summary(res), "2026-11-07")
    assert "| PL | 1.00* |" in md


def test_min_places(tmp_path):
    data = app()
    del data["destinations"]["FR2"], data["destinations"]["FR1"]
    ctx = {"reference": reference(tmp_path), "app_data": data}
    by = {r["id"]: r for r in lp.match(lp.references(ctx), lp.load(ctx))}
    assert by["FR:meal_mid_eur"]["flags"]["matched"] is False
    assert by["FR:meal_mid_eur"]["note"] == "no_carta_price"


def test_fares(tmp_path):
    wire = tmp_path / "wire"
    wire.mkdir()
    (wire / "BRU.json").write_text(json.dumps({"to": {"BCN": {
        "2026-12-03": [40, "FR", "06:00", "08:00", 0, 1], "2026-12-09": [31, "FR", "06:00", "08:00", 0, 1],
        "2027-01-02": [10, "FR", "06:00", "08:00", 0, 1]}}}), encoding="utf-8")
    ex = tmp_path / "fares.csv"
    ex.write_text("id,origin,dest,month,fare_eur,cc,source,url,read_on\n"
                  "a,BRU,BCN,2026-12,29.99,BE,airline,,2026-11-07\n"
                  "b,BRU,MAD,2026-12,40,BE,airline,,2026-11-07\n"
                  "c,AMS,BCN,2026-12,40,NL,airline,,2026-11-07\n"
                  "bad,BRU,BCN,2026-12,x,BE,,,\n", encoding="utf-8")
    res = vr.run(lf, {"reference": ex, "wire": wire}, share=1.0)
    by = {r["id"]: r for r in res["results"]}
    assert len(by) == 3
    assert by["a"]["facts"]["within"] is True and by["a"]["error"] == (29.99, 31.0)
    assert by["b"]["note"] == "no_swept_fare" and by["c"]["note"] == "no_wire_file"
    assert lf.references({"reference": tmp_path / "missing.csv"}) == []


def test_hand_sample_draw_and_read(tmp_path):
    data = app()
    for k in range(3):
        data["destinations"][f"PL{k}"]["place"]["class"] = "village"
        data["destinations"][f"DE{k}"]["place"]["class"] = "city"
    rows = ls.draw(data)
    assert rows and {r["item"].split(".")[0] for r in rows} <= {"bed", "meal_mid_eur"}
    assert len({(r["tercile"], r["class"], r["country"]) for r in rows if r["item"].startswith("bed")}) \
        == len({r["id"] for r in rows})
    assert rows == ls.draw(data)                     # deterministic
    p = ls.write_sheet(rows, tmp_path / "sheet.csv")
    with p.open(encoding="utf-8", newline="") as fh:
        filled = list(csv.DictReader(fh))
    filled[0]["found_eur"] = str(float(filled[0]["carta_eur"]) * 2)
    with p.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=ls.COLUMNS, lineterminator="\n")
        w.writeheader()
        w.writerows(filled)
    res = vr.run(ls, {"reference": p}, share=1.0, min_per=1)
    assert res["sample"]["n"] == 1
    assert res["results"][0]["facts"]["within"] is False and res["results"][0]["note"] == "carta_below"


def test_committed_reference_and_sheet_are_well_formed():
    ref = json.loads((lp.OUT_DIR / "reference_pli.json").read_text(encoding="utf-8"))
    assert {"A0111", "A010101"} <= set(ref["pli"]) and "CC BY 4.0" in ref["licence"]
    assert len(lp.references({})) > 300
    with ls.SHEET.open(encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
    assert len(rows) >= 36 and set(rows[0]) == set(ls.COLUMNS)
    reviews = json.loads((lp.OUT_DIR / "gap_reviews.json").read_text(encoding="utf-8"))
    assert len(reviews["gaps"]) == 30 and all(g["verdict"] and g["cause"] for g in reviews["gaps"])


def test_eurostat_dir_overrides(tmp_path):
    d = tmp_path / "es"
    d.mkdir()
    doc = {"id": ["geo", "time"], "size": [2, 2],
           "dimension": {"geo": {"category": {"index": {"EL": 0, "DE": 1}}},
                         "time": {"category": {"index": {"2024": 0, "2025": 1}}}},
           "value": {"0": 80.0, "1": 82.5, "2": 101.0}}
    (d / "A011102.json").write_text(json.dumps(doc), encoding="utf-8")
    got = lp.read_eurostat_dir(d)
    assert got == {"A011102": {"GR": {"value": 82.5, "year": 2025}, "DE": {"value": 101.0, "year": 2024}}}
    inputs = tmp_path / "in.json"
    inputs.write_text(json.dumps({"pli": {"A0111": {"DE": {"value": 100, "year": 2024}}}}), encoding="utf-8")
    ref = lp.refresh_reference(inputs, tmp_path / "ref.json", d)
    assert set(ref["pli"]) == {"A0111", "A011102"}
    refs = lp.references({"reference": tmp_path / "ref.json"})
    assert {r["cat"] for r in refs if r["group"] == "bed"} == {"A011102"}
