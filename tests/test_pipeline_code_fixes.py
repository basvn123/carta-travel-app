"""T311: the pipeline code fixes, one or more regressions per register row.

Pure functions and monkeypatched I/O only: no lab, no network, no pipeline
run, nothing written outside pytest's tmp_path. Runs from the repo root:

    python -m pytest tests/test_pipeline_code_fixes.py -q

Rows: T300-p (cycling node networks), T121-b (hiking node networks), T108-c
(highlight names), T113-g (Wikidata P402 and P18), T107-b (title rung 1),
T096-c (the Geneva snapshot), T096-b (footprint anchors), T288-c (the FAT32
guard), T113-b (Waymarked ahead of the registry), T269-b (photo sources after
the exports), T267-a (the retired fare harvesters).
"""

import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
for sub in ("pipeline/archive", "pipeline/photos", "pipeline/cycling",
            "pipeline/trails", "pipeline"):
    sys.path.insert(0, str(ROOT / sub))
sys.path.insert(0, str(ROOT))

import apply_accommodation_anchors as apply_anchors  # noqa: E402
import attributes  # noqa: E402
import derive  # noqa: E402
import famous_registry  # noqa: E402
import harvest_accommodation as harvest  # noqa: E402
import harvest_cycling  # noqa: E402
import ingest_osm_routes  # noqa: E402
import pack  # noqa: E402
import scenic  # noqa: E402
import waymarked  # noqa: E402
from src.ingestion.core import registry  # noqa: E402


# ---------------------------------------------------------------------------
# T300-p and T121-b: node networks are graph edges, not routes
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("tags, edge", [
    ({"network:type": "node_network"}, True),
    ({"network": "rcn", "network:type": "node_network"}, True),
    ({"network": "rcn"}, False),
    ({"network": "lcn", "network:type": "node_network"}, True),
    ({}, False),
])
def test_cycling_node_network_is_the_tag_alone(tags, edge):
    assert harvest_cycling.is_node_network(tags) is edge


def test_hiking_ingest_keeps_the_tag_it_filters_on():
    assert "network:type" in ingest_osm_routes.KEEP_TAGS


def test_hiking_ingest_drops_node_network_edges():
    # "33-36" is a real published hike on the BE wire (id 95805), rwn.
    edge = {"type": "route", "route": "hiking", "network": "rwn",
            "network:type": "node_network", "name": "33-36"}
    route = {"type": "route", "route": "hiking", "network": "rwn",
             "name": "Veluwe Zwerfpad"}
    assert ingest_osm_routes.passes_first_filter(edge) is False
    assert ingest_osm_routes.passes_first_filter(route) is True
    # A named relation outside the major networks still passes, as before.
    assert ingest_osm_routes.passes_first_filter(
        {"network": "lwn", "name": "Rundweg"}) is True


# ---------------------------------------------------------------------------
# T108-c: scenic.py stores names.display_name
# ---------------------------------------------------------------------------

KORAB_LAKE = {"type": "node", "id": 1, "lat": 41.79, "lon": 20.55,
              "tags": {"natural": "water", "name": "Корабско Езеро",
                       "name:en": "Korab Lake", "name:sq": "Liqeni i Korabit",
                       "name:ru": "Корабское озеро"}}


def test_scenic_stores_the_display_name():
    row = scenic.parse_elements([KORAB_LAKE], "MK")[0]
    assert row["name"] == "Korab Lake"
    # Only the tags display_name can pick are cached, Cyrillic name:* is not.
    assert set(row["names"]) == {"name", "name:en", "name:sq"}


def test_scenic_local_language_without_english():
    el = {**KORAB_LAKE, "tags": {"natural": "water", "name": "Корабско Езеро",
                                 "name:sq": "Liqeni i Korabit"}}
    assert scenic.parse_elements([el], "AL")[0]["name"] == "Liqeni i Korabit"


def test_scenic_cached_rows_are_renamed_and_old_rows_kept():
    new = {"name": "Корабско Езеро", "names": {"name": "Корабско Езеро",
                                                "name:sq": "Liqeni i Korabit"}}
    old = {"name": "Корабско Езеро"}         # cached before T311: no names
    out = scenic.cached_names([new, old], "AL")
    assert out[0]["name"] == "Liqeni i Korabit"
    assert out[1]["name"] == "Корабско Езеро"


def test_scenic_insert_updates_a_stored_name():
    sql = " ".join(scenic.INSERT_SQL.split())
    assert "DO UPDATE SET name = EXCLUDED.name" in sql
    assert "DO NOTHING" not in sql


# ---------------------------------------------------------------------------
# T113-g: P402 and P18
# ---------------------------------------------------------------------------

def test_parse_identity():
    assert famous_registry.parse_identity("P402", "2018553") == 2018553
    assert famous_registry.parse_identity("P402", "way/123") is None
    assert famous_registry.parse_identity("P402", "0") is None
    url = "http://commons.wikimedia.org/wiki/Special:FilePath/Lac%20de%20Gaube_2.jpg"
    assert famous_registry.parse_identity("P18", url) == "Lac de Gaube 2.jpg"


def _sparql(bindings):
    return {"results": {"bindings": bindings}}


def test_wd_identity_and_unanswered(monkeypatch):
    def fake(url, base_headers=None):
        if "P402" in url:
            return _sparql([
                {"item": {"value": "http://www.wikidata.org/entity/Q1"},
                 "v": {"value": "300"}},
                {"item": {"value": "http://www.wikidata.org/entity/Q1"},
                 "v": {"value": "200"}},
            ])
        return None                       # the P18 batch never answers
    monkeypatch.setattr(famous_registry.ha, "get_json", fake)
    monkeypatch.setattr(famous_registry.time, "sleep", lambda s: None)
    got, unanswered = famous_registry.wd_identity(["Q1", "Q2"])
    assert got == {"Q1": {"osm_relation": 200}}        # smallest id wins
    assert unanswered == {"Q1", "Q2"}                    # the P18 batch failed

    rows = [{"qid": "Q1"}, {"qid": "Q2"}]
    famous_registry.add_identity(rows)
    # Unanswered rows stay unstamped, so the next run asks again.
    assert all(famous_registry.IDENTITY_STAMP not in r for r in rows)


def test_add_identity_stamps_answered_rows(monkeypatch):
    monkeypatch.setattr(famous_registry, "wd_identity",
                        lambda qids, verbose=False: (
                            {"Q1": {"osm_relation": 7, "image": "A.jpg"}}, set()))
    rows = [{"qid": "Q1"}, {"qid": "Q2"}]
    famous_registry.add_identity(rows)
    assert rows[0]["osm_relation"] == 7 and rows[0]["image"] == "A.jpg"
    assert rows[1]["osm_relation"] is None          # asked, and has no P402


def test_build_country_carries_the_relation_and_image():
    wd = [{"qid": "Q1", "label": "Sentier Test", "lab_lang": "fr", "en": None,
           "cls": "Q2143825", "lat": 45.0, "lon": 6.0, "sitelinks": 3,
           "km": None, "lang": None, "title": None,
           "osm_relation": 4242, "image": "Sentier.jpg"}]
    rows = famous_registry.build_country("FR", {}, wd, {})
    row = next(r for r in rows if r["evidence"].get("wikidata") == "Q1")
    assert row["evidence"]["wd_relation_id"] == 4242
    assert row["wd_image"] == "Sentier.jpg"
    # Identity is not fame: the score parts carry no relation term.
    famous_registry.score_country(rows)
    assert "wd_relation_id" not in row["fame_parts"]


def test_waymarked_joins_on_the_wikidata_relation():
    row = famous_registry.new_row("FR", "Sentier Test", 45.0, 6.0)
    row["id"] = "fr-sentier-test"
    row["evidence"]["wd_relation_id"] = 4242
    rows = [row]
    routes = [{"relation_id": 4242, "name": "Something else entirely",
               "group": "NAT", "countries": {"FR": [45.0, 6.0]}}]
    tally = famous_registry.merge_waymarked("FR", rows, routes)
    assert tally["known"] == 1 and len(rows) == 1
    assert rows[0]["evidence"]["waymarked"]["relation_id"] == 4242


# ---------------------------------------------------------------------------
# T107-b: title rung 1 reads a stored Wikidata label
# ---------------------------------------------------------------------------

def test_route_classes_match_the_registry():
    assert attributes.ROUTE_CLASSES == famous_registry.TRAIL_CLASSES


def test_wikidata_label_of():
    f = attributes.wikidata_label_of
    assert f({"cls": "Q2143825", "label": "Rotweinwanderweg",
              "en": "Red Wine Trail"}) == "Red Wine Trail"
    assert f({"cls": "Q2143825", "label": "Residenzweg", "en": None}) == "Residenzweg"
    assert f({"cls": "Q2143825", "label": "Еко пътека", "en": None}) is None
    assert f({"cls": "Q34763", "label": "Gorges du Verdon", "en": "Verdon Gorge"}) is None


def test_load_wikidata_labels(tmp_path):
    cache = {"DE": [{"qid": "Q1", "cls": "Q2143825", "label": "Residenzweg"},
                    {"qid": "Q2", "cls": "Q8502", "label": "Brocken"}]}
    path = tmp_path / "wd.json"
    path.write_text(json.dumps(cache), encoding="utf-8")
    assert attributes.load_wikidata_labels(path) == {"Q1": "Residenzweg"}
    assert attributes.load_wikidata_labels(tmp_path / "missing.json") == {}


def test_labels_for_skips_a_qid_shared_by_stages():
    rows = [{"raw_tags": {"wikidata": "Q5"}}, {"raw_tags": {"wikidata": "Q5"}},
            {"raw_tags": {"wikidata": "Q6"}}, {"raw_tags": {}}]
    labels = {"Q5": "E5", "Q6": "Residenzweg"}
    assert attributes.labels_for(rows, labels) == {"Q6": "Residenzweg"}


def test_title_rung_one_fires():
    row = {"raw_tags": {"name": "Residenzweg [Detmold]", "wikidata": "Q6"},
           "title": "Residenzweg [Detmold]", "distance_m": 12000}
    title, ref, rung = attributes.title_of(row, "loop", None, {"Q6": "Residenzweg"})
    assert (title, rung) == ("Residenzweg", "wikidata")
    # Without labels the ladder is exactly what it was.
    _, _, rung = attributes.title_of(row, "loop", None)
    assert rung == "name"


# ---------------------------------------------------------------------------
# T096-c: a broken snapshot never becomes an anchor
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("text, value", [
    ("$172.50", 172.5),
    ("$1,234.00", 1234.0),
    ("CHF 1'234.00", 1234.0),
    ("CHF 1’234.00", 1234.0),
    ("1 234.00", 1234.0),
    ("", None),
    (None, None),
    ("n/a", None),
])
def test_clean_price(text, value):
    assert harvest.clean_price(text) == value


def test_harvest_band_is_the_apply_band():
    assert (harvest.MIN_NIGHT_EUR, harvest.MAX_NIGHT_EUR) == \
        (apply_anchors.MIN_NIGHT_EUR, apply_anchors.MAX_NIGHT_EUR)


def _listings(lat, lon, n, price, acc=4, spread=0.01):
    return [(lat + spread * (i % 5) / 5, lon + spread * (i % 7) / 7, acc,
             price + (i % 9), "") for i in range(n)]


def test_a_geneva_like_snapshot_is_out_of_band():
    # 977 listings around 0.15 CHF: the T096 benchmark's Geneva.
    rows = [(46.2, 6.14, 2, 0.15, "")] * 977
    rec = harvest.anchor_for_place(rows, {"name": "Geneva", "lat": 46.2,
                                          "lon": 6.14, "radius": None},
                                   harvest.FX["CHF"], "geneva", "2026-06-29", None)
    assert rec["entire_home_night_eur"] == 0
    assert harvest.in_band(rec) is False


def test_refresh_regions():
    assert harvest._refresh_regions(["--refresh", "geneva,Mallorca"]) == {"geneva", "mallorca"}
    assert harvest._refresh_regions(["--refresh=all"]) == {"all"}
    assert harvest._refresh_regions(["--footprint"]) == set()


def test_download_refresh_refetches(monkeypatch, tmp_path):
    monkeypatch.setattr(harvest, "CACHE_DIR", tmp_path)
    cached = tmp_path / "geneva.csv.gz"
    cached.write_bytes(b"x" * 50_000)
    calls = []

    class Resp:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return b"y" * 50_000

    def fake_open(req, timeout=None):
        calls.append(req.full_url)
        return Resp()
    monkeypatch.setattr(harvest.urllib.request, "urlopen", fake_open)
    harvest.download("listings", "geneva", "switzerland/geneva/geneva/2026-06-29")
    assert calls == []                                   # cached, as before
    harvest.download("listings", "geneva", "switzerland/geneva/geneva/2026-06-29",
                     refresh=True)
    assert len(calls) == 1 and cached.read_bytes() == b"y" * 50_000


# ---------------------------------------------------------------------------
# T096-b: footprint anchors, a town's own listings, for that town only
# ---------------------------------------------------------------------------

def test_footprint_anchor_per_town():
    soller = (39.766, 2.715)
    listings = _listings(*soller, 60, 360.0) + _listings(39.95, 3.10, 10, 200.0)
    points = [("gem:soller", "Soller", *soller),
              ("gem:formentor", "Cap de Formentor", 39.95, 3.10),   # 10 only
              ("XXX", "Far away", 52.0, 13.0)]
    out = harvest.footprint_anchors(listings, points, 1.0, "mallorca",
                                    "2026-06-23", None)
    assert [a["dest_id"] for a in out] == ["gem:soller"]
    assert out[0]["footprint_km"] == harvest.FOOTPRINT_KM
    assert 355 <= out[0]["entire_home_night_eur"] <= 370


def test_footprint_regions_are_dataset_regions():
    regions = {d["region"] for d in harvest.DATASETS}
    assert harvest.FOOTPRINT_REGIONS <= regions


def test_apply_gives_a_footprint_anchor_to_its_town_alone():
    town = {"name": "Soller", "lat": 39.766, "lon": 2.715,
            "entire_home_night_eur": 363, "typical_capacity": 4,
            "n_listings": 533, "captured": "2026-06-23",
            "dest_id": "gem:soller", "footprint_km": 10.0}
    island = {"name": "Mallorca", "lat": 39.571, "lon": 2.650,
              "entire_home_night_eur": 297, "typical_capacity": 6,
              "n_listings": 9000, "captured": "2026-06-23"}
    dests = {
        "gem:soller": {"city_lat": 39.766, "city_lon": 2.715},
        # 3 km from Soller's centre: the footprint anchor must NOT reach it.
        "gem:port-de-soller": {"city_lat": 39.795, "city_lon": 2.695},
        "PMI": {"city_lat": 39.571, "city_lon": 2.650},
    }
    n = apply_anchors.assign(dests, [town, island])
    assert n == 2
    assert dests["gem:soller"]["accommodation"]["entire_home_night_eur"] == 363
    assert dests["gem:soller"]["accommodation"]["footprint_km"] == 10.0
    assert dests["gem:soller"]["accommodation"]["price_source"] == "inside_airbnb_city"
    assert "accommodation" not in dests["gem:port-de-soller"]
    assert dests["PMI"]["accommodation"]["source_place"] == "Mallorca"


def test_harvest_footprint_is_off_by_default():
    src = (ROOT / "pipeline" / "harvest_accommodation.py").read_text(encoding="utf-8")
    assert 'want_footprint = "--footprint" in sys.argv' in src


# ---------------------------------------------------------------------------
# T288-c: pack.py refuses what the target cannot hold
# ---------------------------------------------------------------------------

def test_target_refusal():
    big = 4 * 1024 ** 3 + 10
    assert "FAT32" in pack.target_refusal(big, "fat32", 10 ** 12)
    assert "VFAT" in pack.target_refusal(big, "vfat", None)
    assert pack.target_refusal(3 * 1024 ** 3, "fat32", 10 ** 12) is None
    assert pack.target_refusal(big, "exfat", 10 ** 12) is None
    assert pack.target_refusal(big, "ntfs", 10 ** 12) is None
    assert "free" in pack.target_refusal(big, "ntfs", 10 ** 9)
    assert pack.target_refusal(big, None, None) is None


def test_projected_size_bounds_the_tarball(tmp_path):
    import tarfile
    files = []
    for i, size in enumerate((0, 1, 511, 512, 513, 10_000)):
        f = tmp_path / f"f{i}.bin"
        f.write_bytes(bytes(size))
        files.append(f)
    projected = pack.projected_size(files)
    out = tmp_path / "t.tar"
    with tarfile.open(out, "w") as tar:
        for f in files:
            tar.add(f, arcname=f.name)
    # Python pads a tar to a 10 KiB record; the projection is per member.
    assert projected >= sum(-(-f.stat().st_size // 512) * 512 + 512 for f in files)
    assert projected <= out.stat().st_size


def test_filesystem_type_answers(tmp_path):
    fs = pack.filesystem_type(tmp_path / "not" / "yet")
    assert fs is None or (isinstance(fs, str) and fs == fs.lower())


# ---------------------------------------------------------------------------
# T113-b: waymarked.py runs first and never writes an outage
# ---------------------------------------------------------------------------

def test_harvest_floor():
    assert waymarked.harvest_floor({}) == 0
    assert waymarked.harvest_floor({"routes": [{}] * 2055}) == 1849


def test_waymarked_keeps_the_file_on_an_outage(monkeypatch, tmp_path):
    path = tmp_path / "waymarked_routes.json"
    prior = {"routes": [{"relation_id": i, "name": f"R{i}", "group": "NAT",
                         "countries": {"FR": [45.0, 6.0]}} for i in range(100)]}
    path.write_text(json.dumps(prior), encoding="utf-8")
    monkeypatch.setattr(waymarked, "WAYMARKED", path)
    monkeypatch.setattr(waymarked, "harvest",
                        lambda: ({1: {"name": "R1", "ref": None, "group": "NAT"}},
                                 {"requests": 785, "split": 0, "failed": 780}))
    monkeypatch.setattr(waymarked, "place",
                        lambda routes, countries: pytest.fail("placed an outage"))
    monkeypatch.setattr(sys, "argv", ["waymarked.py"])
    assert waymarked.main() == 0
    assert json.loads(path.read_text(encoding="utf-8")) == prior


def test_waymarked_keeps_placements_without_extracts(monkeypatch, tmp_path):
    path = tmp_path / "waymarked_routes.json"
    prior = {"routes": [{"relation_id": 1, "name": "R1", "group": "NAT",
                         "network": "nwn", "wikidata": None, "wikipedia": None,
                         "countries": {"FR": [45.0, 6.0]}}]}
    path.write_text(json.dumps(prior), encoding="utf-8")
    monkeypatch.setattr(waymarked, "WAYMARKED", path)
    monkeypatch.setattr(waymarked, "harvest",
                        lambda: ({1: {"name": "R1", "ref": None, "group": "NAT"}},
                                 {"requests": 1, "split": 0, "failed": 0}))
    monkeypatch.setattr(waymarked, "place",
                        lambda routes, countries: ({}, list(countries), 0))
    monkeypatch.setattr(sys, "argv", ["waymarked.py", "--countries", "FR,ES"])
    waymarked.main()
    out = json.loads(path.read_text(encoding="utf-8"))
    assert out["routes"][0]["countries"] == {"FR": [45.0, 6.0]}


# ---------------------------------------------------------------------------
# run_pipeline.py's task table, read as text (importing it sets up the run)
# ---------------------------------------------------------------------------

RUN_PIPELINE = (ROOT / "run_pipeline.py").read_text(encoding="utf-8")


def _task_body(key):
    i = RUN_PIPELINE.index(f'"key": "{key}",')
    a = RUN_PIPELINE.rindex("\n    {\n", 0, i)
    b = RUN_PIPELINE.index("\n    },\n", i)
    return RUN_PIPELINE[a:b]


def test_trails_registry_runs_waymarked_first():
    body = _task_body("trails_registry")
    scripts = re.findall(r"pipeline/trails/(\w+)\.py", body)
    assert scripts[:3] == ["waymarked", "famous_registry", "coverage_report"]


def test_photo_sources_follows_the_exports():
    body = _task_body("photo_sources")
    tasks = registry.pipeline_tasks(ROOT)
    after = re.search(r'"after": \[([^\]]+)\]', body).group(1)
    for key in re.findall(r'"(\w+)"', after):
        assert key in tasks, key
    assert '"--upload", "auto"' in body and '"--allow-missing"' in body
    # Last in the table, after every export it reads.
    assert list(tasks)[-1] == "photo_sources"


def test_sources_upload_mode(monkeypatch):
    monkeypatch.delenv("RCLONE_CONFIG_R2_ENDPOINT", raising=False)
    monkeypatch.delenv("CARTA_RCLONE", raising=False)
    assert derive.sources_upload_mode("auto") == "none"
    monkeypatch.setenv("RCLONE_CONFIG_R2_ENDPOINT", "https://example.invalid")
    assert derive.sources_upload_mode("auto") == "r2"
    assert derive.sources_upload_mode("none") == "none"


def test_sources_allow_missing(monkeypatch, tmp_path):
    import argparse
    monkeypatch.setattr(derive, "build_sources",
                        lambda layer: {"count": 0, "records": {}})
    args = argparse.Namespace(layers=["journeys"], out=str(tmp_path),
                              upload="none", allow_missing=False)
    assert derive.cmd_sources(args) == 2
    args.allow_missing = True
    assert derive.cmd_sources(args) == 0


# ---------------------------------------------------------------------------
# T267-a: the retired fare harvesters are archived, not scheduled
# ---------------------------------------------------------------------------

RETIRED = ("harvest_wizzair.py", "harvest_vueling.py", "harvest_volotea.py",
           "harvest_ryanair_schedules.py")


def test_retired_harvesters_are_archived():
    for name in RETIRED:
        assert not (ROOT / "pipeline" / name).exists(), name
        assert (ROOT / "pipeline" / "archive" / name).exists(), name


def test_no_task_runs_a_retired_harvester():
    tasks = registry.pipeline_tasks(ROOT)
    for key in ("wizz_fares", "vueling_fares", "volotea_fares"):
        assert key not in tasks
    for name in RETIRED:
        assert name not in RUN_PIPELINE.replace(
            "harvest_ryanair_schedules.py are in pipeline/archive/", "")
    assert "def wizz_step" not in RUN_PIPELINE


def test_retired_rows_stay_in_the_ledger():
    keys = {s.key: s for s in registry.SOURCES}
    for key in ("wizz_air_timetable_api", "vueling_apiw_endpoints",
                "volotea_getminprice_api", "exchangerate_api_open_endpoint",
                "ryanair_timetable_api"):
        assert keys[key].retired is True, key
    assert registry.validate() == []
