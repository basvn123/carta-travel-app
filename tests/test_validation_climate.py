"""T1194 (ROADMAP D23): climate, sea temperature and crowds validation layers.

Fixtures only (tmp_path): a tiny wire and tiny reference CSVs. The real runs
need the owner's reference exports (see the T1194 report).

    python -m pytest tests/test_validation_climate.py -q
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "validation"))

import layer_climate as lc
import layer_crowds as lcr
import layer_sea as ls
import layer_tables as lt
import runner as vr

NOW = datetime(2026, 11, 7, 12, tzinfo=timezone.utc)


def wire(tmp_path):
    m = [[10 + i, 2 + i, 50, 50] for i in range(12)]
    dests = {
        "AAA": {"id": "AAA", "city": "Alpha", "iso2": "DE", "lat": 50.0, "lon": 8.0,
                "climate": {"m": m, "elev_m": 100, "water_c": [10 + i for i in range(12)]},
                "crowding": {"nights_per_km2": 1000, "monthly": {"share": [1] * 6 + [3] * 6}}},
        "BBB": {"id": "BBB", "city": "Beta", "iso2": "DE", "lat": 50.01, "lon": 8.01,
                "climate": {"m": m, "elev_m": 900},
                "crowding": {"nights_per_km2": 1000, "monthly": {"share": [1] * 6 + [3] * 6}}},
    }
    p = tmp_path / "app_data.json"
    p.write_text(json.dumps({"destinations": dests}), encoding="utf-8")
    return p


def csv(tmp_path, name, text):
    p = tmp_path / name
    p.write_text(text, encoding="utf-8")
    return p


def test_climate_match_elevation_and_errors(tmp_path):
    rows = ["id,name,cc,lat,lon,elev_m,month,tmax_c,tmin_c,precip_mm,source,period"]
    for mth in range(1, 13):
        rows.append(f"s1,Alp,DE,50.0,8.0,110,{mth},{10 + mth - 1},{2 + mth - 1},52,fx,1991-2020")
    rows.append("s2,Valley,DE,50.0,8.0,700,1,5,0,50,fx,1991-2020")      # only BBB (900 m) is 200 away, AAA 600
    rows.append("s3,Far,FR,45.0,2.0,100,1,5,0,50,fx,1991-2020")
    ref = csv(tmp_path, "n.csv", "\n".join(rows) + "\n")
    ctx = {"reference": ref, "wire": wire(tmp_path)}
    refs = lc.references(ctx)
    res = lc.match(refs, lc.load(ctx))
    by = {r["id"]: r for r in res}
    assert by["s1|03"]["facts"] == {"tmax": True, "tmin": True, "rain": True}
    assert by["s1|03"]["diff"] == 0
    assert by["s2|01"]["dest"] == "BBB"          # AAA is 600 m off, BBB 200 m: within the limit
    assert by["s3|01"]["note"] == "no_destination_near"
    out = vr.run(lc, ctx, now=NOW)
    assert out["metrics"]["coverage"]["value"] < 1
    assert out["gaps"][0]["id"].startswith("s2")


def test_sea_prefers_beach_and_flags_gap(tmp_path):
    bdir = tmp_path / "beaches"
    bdir.mkdir()
    (bdir / "DE.json").write_text(json.dumps({"beaches": [
        {"id": "b1", "name": "B", "cc": "DE", "lat": 50.0, "lon": 8.0, "sea_temp": [20.0] * 12}]}))
    ref = csv(tmp_path, "s.csv", "id,name,cc,lat,lon,month,sst_c,source,period\n"
              "p1,P,DE,50.0,8.0,7,20.5,fx,x\np1,P,DE,50.0,8.0,8,25,fx,x\np2,Q,DE,60,20,7,15,fx,x\n")
    ctx = {"reference": ref, "wire": wire(tmp_path), "beach_dir": bdir}
    res = {r["id"]: r for r in ls.match(ls.references(ctx), ls.load(ctx))}
    assert res["p1|07"]["carta_kind"] == "beach" and res["p1|07"]["facts"]["within"]
    assert res["p1|08"]["note"] == "carta_cooler"
    assert res["p2|07"]["note"] == "no_carta_sea_near"


def test_crowds_shares_peak_and_weighting(tmp_path):
    lines = ["cc,year,month,nights"]
    for y in (2022, 2023):
        for m in range(1, 13):
            lines.append(f"DE,{y},{m},{100 if m <= 6 else 300}")
    lines += ["FR,2023,1,5"]                       # partial year: no reference
    ctx = {"reference": csv(tmp_path, "c.csv", "\n".join(lines) + "\n"), "wire": wire(tmp_path)}
    refs = lcr.references(ctx)
    assert len(refs) == 12 and abs(sum(r["share"] for r in refs) - 100) < 1e-6
    res = lcr.match(refs, lcr.load(ctx))
    assert all(r["facts"]["within"] for r in res)
    peaks = [r for r in res if r["facts"].get("peak") is not None]
    assert len(peaks) == 1 and peaks[0]["facts"]["peak"] is True


def test_tables_by_month_and_country(tmp_path):
    rs = [{"diff": 1.0, "month": 1, "country": "DE"}, {"diff": -3.0, "month": 1, "country": "FR"},
          {"diff": 2.0, "month": 2, "country": "DE"}, {"diff": None, "month": 2, "country": "DE"}]
    t = lt.tables(rs)
    assert t["by_month"]["01"] == {"n": 2, "mae": 2.0, "bias": -1.0, "median_abs": 2.0}
    assert t["by_country"]["DE"]["n"] == 2
    assert "unreviewed" in lt.markdown("x", "d", t, [{"id": "a", "diff_c": 1, "cause_code": "c"}])


def test_missing_reference_runs_empty(tmp_path):
    for mod in (lc, ls, lcr):
        out = vr.run(mod, {"reference": tmp_path / "none.csv", "wire": tmp_path / "none.json"}, now=NOW)
        assert out["sample"]["population"] == 0 and out["gate"]["ok"]


def test_layers_registered():
    assert {"climate", "sea", "crowds"} <= set(vr.LAYERS)
