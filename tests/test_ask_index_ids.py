"""T1206 (T1141-e): pipeline/ask_index_layer.py writes every passage id once.

The layer folders carry top.json (the same rows again under cc "top") and
index.json beside the country files, and a sight's id is its slug, which
two spellings of one name, or two names with no Latin letters, share. On a
small fixture tree: the country files alone are read, the first spelling of
a sight is kept, and non-Latin names get distinct, stable ids.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline import ask_index_layer as L  # noqa: E402


def _write(p, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj), encoding="utf-8")


def _tree(tmp_path):
    pub = tmp_path / "public"
    _write(pub / "app_data.json", {"destinations": {
        "BOJ": {"id": "BOJ", "city": "Burgas", "country": "Bulgaria", "iso2": "BG", "lat": 42.5, "lon": 27.47,
                "activities": {"items": [
                    {"name": "Бургаски солници", "kind": "Nature reserve"},
                    {"name": "Поморийско езеро", "kind": "Nature reserve"},
                    {"name": "Pont Vieux", "kind": "Bridge"},
                    {"name": "Pont-Vieux", "kind": "Bridge"},
                ]}},
    }})
    lake = {"id": "bg-vaya-Q1", "name": "Vaya", "cc": "BG", "lat": 42.5, "lon": 27.4}
    _write(pub / "lakes" / "BG.json", {"lakes": [lake]})
    _write(pub / "lakes" / "top.json", {"lakes": [lake]})
    _write(pub / "lakes" / "index.json", {"lakes": [lake]})
    trail = {"id": 30507, "name": "E7", "bbox": [27.3, 42.4, 27.5, 42.6]}
    _write(pub / "trails" / "BG.json", {"trips": [trail]})
    _write(pub / "trails" / "top.json", {"trips": [trail]})
    return L.Ctx(pub)


def test_layer_rows_read_country_files_only(tmp_path):
    ctx = _tree(tmp_path)
    lakes = [r for r, _e in L.src_lake(ctx)]
    assert [r[0] for r in lakes] == ["lake:bg-vaya-Q1"]
    assert lakes[0][3]["cc"] == "BG"
    trails = [r for r, _e in L.src_trail(ctx)]
    assert [r[0] for r in trails] == ["trail:30507"]
    assert trails[0][3]["cc"] == "BG"


def test_sight_ids_are_unique_and_stable(tmp_path):
    ctx = _tree(tmp_path)
    sights = [r for r, _e in L.src_sight(ctx)]
    ids = [r[0] for r in sights]
    assert len(ids) == len(set(ids)) == 3
    # The first spelling of one bridge is kept, under its plain slug.
    assert "sight:BOJ/pont-vieux" in ids
    assert [r[3]["name"] for r in sights if r[0] == "sight:BOJ/pont-vieux"] == ["Pont Vieux"]
    # Names with no Latin letters get a hash of the name, the same every build.
    cyr = [i for i in ids if i.startswith("sight:BOJ/x-")]
    assert len(cyr) == 2
    assert L.name_id("Бургаски солници") == L.name_id("Бургаски солници") != L.name_id("Поморийско езеро")
    assert L.name_id("Pont Vieux") == "pont-vieux"


def test_collect_writes_each_id_once(tmp_path):
    ctx = _tree(tmp_path)
    out = L.collect(ctx, only={"sight", "lake", "trail"})
    for src, (rows, embeds) in out.items():
        ids = [r[0] for r in rows]
        assert len(ids) == len(set(ids)), src
        assert len(rows) == len(embeds)


def test_manifest_records_the_catalogue_it_read(tmp_path):
    """T1141-d: the staleness check (continent-app/scripts/check-ask-index.mjs)
    compares this stamp with the catalogue on the wire."""
    pub = tmp_path / "public"
    _write(pub / "app_data.json", {"meta": {"generated_at": "2026-06-07T13:21:17+00:00", "schema_version": 20},
                                   "destinations": {}})
    stamp = L.catalogue_stamp(L.Ctx(pub))
    assert stamp == {"file": "app_data.json", "generated_at": "2026-06-07T13:21:17+00:00", "schema_version": 20}
