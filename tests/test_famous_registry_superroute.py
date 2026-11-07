"""T1201 (row T1181-c): a superroute in the famous registry gets a coordinate
from its first stage's first way, so coverage can ask a region for it.

    python -m pytest tests/test_famous_registry_superroute.py -q
"""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

fr = pytest.importorskip("famous_registry")

OSM = """<?xml version='1.0' encoding='UTF-8'?>
<osm version="0.6" generator="test">
 <node id="1" version="1" lat="54.5000" lon="-1.2000"/>
 <node id="2" version="1" lat="54.5100" lon="-1.2100"/>
 <way id="10" version="1"><nd ref="1"/><nd ref="2"/><tag k="highway" v="path"/></way>
 <relation id="200" version="1"><member type="way" ref="10" role=""/>
  <tag k="type" v="route"/><tag k="route" v="hiking"/><tag k="name" v="Cleveland Way Stage 1"/></relation>
 <relation id="201" version="1"><member type="relation" ref="200" role=""/>
  <tag k="type" v="superroute"/><tag k="route" v="hiking"/><tag k="name" v="Cleveland Way"/>
  <tag k="wikidata" v="Q1"/></relation>
</osm>
"""


def test_superroute_is_placed_from_its_first_stage(tmp_path, monkeypatch):
    pbf = tmp_path / "gb.osm"
    pbf.write_text(OSM)
    monkeypatch.setattr(fr, "cached_extract", lambda slug: pbf)
    out = fr.scan_osm_fame("GB", "great-britain")
    row = next(v for v in out.values() if v["relation_id"] == 201)
    assert (row["lat"], row["lon"]) == (54.5, -1.2)


def test_cross_border_route_is_placed_from_a_way_in_this_extract(tmp_path, monkeypatch):
    # The first member way (99) lies in the neighbour's extract; a later one
    # (10) is here, and places the route.
    osm = OSM.replace(
        '<relation id="201"',
        '<relation id="300" version="1"><member type="way" ref="99" role=""/>'
        '<member type="way" ref="10" role=""/><tag k="type" v="route"/>'
        '<tag k="route" v="hiking"/><tag k="name" v="Haute Route"/>'
        '<tag k="wikidata" v="Q2"/></relation>\n <relation id="201"')
    pbf = tmp_path / "ad.osm"
    pbf.write_text(osm)
    monkeypatch.setattr(fr, "cached_extract", lambda slug: pbf)
    out = fr.scan_osm_fame("AD", "andorra")
    row = next(v for v in out.values() if v["relation_id"] == 300)
    assert (row["lat"], row["lon"]) == (54.5, -1.2)
