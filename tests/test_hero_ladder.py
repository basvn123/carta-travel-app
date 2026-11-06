"""The first-paint derivative manifest (H12, T1105).

pipeline/photos/hero_ladder.py reads derive.py's manifests and writes what
the app bundle needs to prefer our own copy of a photograph: live or not,
the published photographs with no copy, re-uploads and size corrections.
These cases pin the fallback: no manifest means not live, an uncovered
photograph is listed, and too many uncovered ones keep the whole ladder off.

Runs under pytest from the repo root:
    python -m pytest tests/test_hero_ladder.py -q
"""

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "carta_hero_ladder", ROOT / "pipeline" / "photos" / "hero_ladder.py")
hl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hl)
dv = hl.derive_mod()

BRU = ("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/"
       "Grand_Place_Bruselas_2.jpg/960px-Grand_Place_Bruselas_2.jpg")
OPO = ("https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/"
       "Puente_Don_Luis_I%2C_Oporto%2C_Portugal%2C_2012-05-09%2C_DD_13.JPG/"
       "960px-Puente_Don_Luis_I%2C_Oporto%2C_Portugal%2C_2012-05-09%2C_DD_13.JPG")
GEO = "https://s0.geograph.org.uk/geophotos/01/23/45/12345_abc.jpg"


def entry(title, w, h, rev=None):
    src = dv.rung_dims(w, h, dv.SOURCE_WIDTH)
    d = [dv.rung_dims(src[0], src[1], r) for r in dv.WIDTHS]
    hh = dv.revision_key(title, rev) if rev else dv.sha1_of(title)
    return {"h": hh, "d": d, "s": rev}


def images():
    return [{"url": BRU, "w": 3332, "h": 2000},
            {"url": OPO, "w": 5292, "h": 3265},
            {"url": BRU, "w": 3332, "h": 2000},      # a repeat counts once
            {"url": GEO, "w": 640, "h": 480}]         # not Commons: skipped


def test_no_manifest_is_not_live():
    doc = hl.build(images(), {}, have_manifest=False)
    assert doc["live"] is False
    assert doc["missing"] == [] and doc["titles"] == 2
    assert doc["schema"] == "carta.hero-ladder.v1" and doc["ladder"] == "ladder_v1"


def test_uncovered_photograph_is_listed_missing():
    t_bru = dv.canonical_title(BRU)
    known = {t_bru: entry(t_bru, 3332, 2000)}
    doc = hl.build(images(), known, have_manifest=True)
    assert doc["live"] is True
    assert doc["derived"] == 1
    assert doc["missing"] == [dv.sha1_of(dv.canonical_title(OPO))[:12]]
    assert doc["rev"] == {} and doc["dims"] == {}


def test_reupload_and_size_drift_are_carried():
    t_bru, t_opo = dv.canonical_title(BRU), dv.canonical_title(OPO)
    known = {t_bru: entry(t_bru, 3332, 2000, rev="abc123"),
             t_opo: entry(t_opo, 1000, 617)}          # wire says 5292 x 3265
    doc = hl.build(images(), known, have_manifest=True)
    k_bru, k_opo = dv.sha1_of(t_bru)[:12], dv.sha1_of(t_opo)[:12]
    assert doc["rev"] == {k_bru: dv.revision_key(t_bru, "abc123")}
    assert doc["dims"][k_opo][2] == [1000, 617]
    assert doc["missing"] == []


def test_a_forged_address_is_not_a_copy():
    t_bru = dv.canonical_title(BRU)
    known = {t_bru: {"h": "0" * 40, "d": [[320, 192], [640, 384], [1280, 768]]}}
    doc = hl.build(images(), known, have_manifest=True)
    assert doc["derived"] == 0 and doc["live"] is False


def test_too_many_missing_keeps_it_off():
    t_bru = dv.canonical_title(BRU)
    known = {t_bru: entry(t_bru, 3332, 2000)}
    doc = hl.build(images(), known, have_manifest=True, max_missing=0)
    assert doc["live"] is False and doc["missing"] == []


def test_main_reads_a_manifest_dir(tmp_path, monkeypatch):
    pub = tmp_path / "continent-app" / "public"
    (pub / "dossier").mkdir(parents=True)
    (pub / "app_data.json").write_text(json.dumps({"destinations": {
        "BRU": {"image": {"url": BRU, "w": 3332, "h": 2000}}}}), encoding="utf-8")
    (pub / "dossier" / "OPO.json").write_text(json.dumps({"gallery": [
        {"url": OPO, "w": 5292, "h": 3265}]}), encoding="utf-8")
    t_bru, t_opo = dv.canonical_title(BRU), dv.canonical_title(OPO)
    man = tmp_path / "manifest"
    man.mkdir()
    files = {}
    for t, (w, h) in ((t_bru, (3332, 2000)), (t_opo, (5292, 3265))):
        e = entry(t, w, h)
        files[t] = {"h": e["h"], "d": e["d"], "c": 0}
    (man / "dest.json").write_text(json.dumps({
        "schema": dv.MANIFEST_SCHEMA, "ladder": dv.LADDER_V, "layer": "dest",
        "credits": [["CC BY-SA 4.0", "Someone"]], "files": files}), encoding="utf-8")
    monkeypatch.setenv("CARTA_DATA_ROOT", str(tmp_path))
    out = tmp_path / "heroLadder.json"
    assert hl.main(["--manifests", str(man), "--out", str(out)]) == 0
    doc = json.loads(out.read_text(encoding="utf-8"))
    assert doc["live"] is True and doc["titles"] == 2 and doc["derived"] == 2
    assert doc["missing"] == []
