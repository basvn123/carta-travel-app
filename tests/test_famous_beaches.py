"""D25 c famous coverage: the beaches hand-off.

The seed reader with and without data/famous/seed_beaches.json, the harvest
pin by Wikidata id (fetched when the class query missed it, folded into the
OSM row it is, never invented without a coordinate), the shortlist pin, and
the export: never cut by a cap, a listed row when a gate fails, and the
famous row kept over a neighbour on the same sand.

    python -m pytest tests/test_famous_beaches.py -q
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "beaches"))

import enrich_beaches  # noqa: E402
import export_beaches  # noqa: E402
import harvest_beaches  # noqa: E402
import seed_beaches  # noqa: E402


def seed_file(tmp_path, rows):
    path = tmp_path / "seed_beaches.json"
    path.write_text(json.dumps({"schema": "carta-famous-seed/1",
                                "kind": "beaches", "rows": rows}),
                    encoding="utf-8")
    return path


def entry(qid, name, cc="GB"):
    return {"n": name, "cc": cc, "wd": qid, "why": "famous",
            "lat": 50.62, "lon": -2.27, "note": "famous coverage"}


# ---------------------------------------------------------------------------
# The reader
# ---------------------------------------------------------------------------

def test_reader_without_the_file_is_empty(tmp_path):
    assert seed_beaches.famous_entries(tmp_path / "absent.json") == []
    assert seed_beaches.by_country(tmp_path / "absent.json") == {}


def test_reader_with_a_broken_file_is_empty(tmp_path):
    path = tmp_path / "seed_beaches.json"
    path.write_text("{not json", encoding="utf-8")
    assert seed_beaches.famous_entries(path) == []


def test_reader_groups_by_country_and_skips_rows_without_an_id(tmp_path):
    path = seed_file(tmp_path, [entry("Q1", "Durdle Door"),
                                entry("Q2", "As Catedrais", cc="ES"),
                                {"n": "No id", "cc": "ES", "why": "famous"}])
    groups = seed_beaches.by_country(path)
    assert {cc: [e["wd"] for e in rows] for cc, rows in groups.items()} == {
        "GB": ["Q1"], "ES": ["Q2"]}


# ---------------------------------------------------------------------------
# The harvest pin
# ---------------------------------------------------------------------------

def wd_rec(qid, name, lat=50.6213, lon=-2.2765, cc="GB"):
    return {"wd": qid, "name": name, "name_local": "", "lat": lat, "lon": lon,
            "iso2": cc, "adm": "Dorset", "types": ["natural arch"],
            "sitelinks": 40, "wd_img": "Durdle Door.jpg", "commons_cat": "",
            "enwiki": "https://en.wikipedia.org/wiki/Durdle_Door",
            "localwiki": "", "length_m": None, "protected": [], "part_of": []}


def osm_row(name, lat, lon, qid=""):
    tags = {"natural": "beach", "name": name}
    if qid:
        tags["wikidata"] = qid
    return {"key": f"osm:way/{abs(hash(name)) % 1000}", "wd": "", "name": name,
            "name_local": name, "lat": lat, "lon": lon, "iso2": "GB",
            "sources": ["osm"], "osm_id": "way/1", "osm_tags": tags}


def test_seed_on_a_harvested_row_is_marked_without_a_fetch():
    rows = [dict(wd_rec("Q1", "Durdle Door"), key="wd:Q1",
                 sources=["wikidata"], osm_id="", osm_tags={})]

    def fetch(_qids, _cc):
        raise AssertionError("no fetch when the row is there")

    resolved, missing, changed = harvest_beaches.resolve_seed(
        "GB", rows, [entry("Q1", "Durdle Door")], fetch)
    assert (resolved, missing, changed) == (1, [], True)
    assert rows[0]["seed"] == {"why": "famous", "name": "Durdle Door"}
    # A second call changes nothing, so a cached country is not rewritten.
    assert harvest_beaches.resolve_seed(
        "GB", rows, [entry("Q1", "Durdle Door")], fetch)[2] is False


def test_missing_seed_is_fetched_and_added_with_its_coordinate():
    rows = [osm_row("Lulworth Cove", 50.6190, -2.2470)]
    asked = []

    def fetch(qids, cc):
        asked.extend(qids)
        return [wd_rec("Q1", "Durdle Door")]

    resolved, missing, _ = harvest_beaches.resolve_seed(
        "GB", rows, [entry("Q1", "Durdle Door")], fetch)
    assert asked == ["Q1"] and resolved == 1 and missing == []
    added = rows[-1]
    assert added["key"] == "wd:Q1" and added["iso2"] == "GB"
    assert added["sources"] == ["wikidata"] and added["seed_fetched"]
    assert added["seed"]["why"] == "famous"


def test_fetched_seed_folds_into_the_osm_row_that_names_it():
    rows = [osm_row("Man O'War Beach", 50.6215, -2.2760, qid="Q1")]
    resolved, _missing, _ = harvest_beaches.resolve_seed(
        "GB", rows, [entry("Q1", "Durdle Door")],
        lambda q, c: [wd_rec("Q1", "Durdle Door")])
    assert resolved == 1 and len(rows) == 1
    assert rows[0]["wd"] == "Q1" and rows[0]["sitelinks"] == 40
    assert rows[0]["sources"] == ["osm", "wikidata"]
    assert rows[0]["osm_id"] == "way/1"


def test_no_coordinate_means_no_row():
    rows = []
    resolved, missing, changed = harvest_beaches.resolve_seed(
        "GB", rows, [entry("Q1", "Durdle Door")], lambda q, c: [])
    assert rows == [] and resolved == 0 and missing == ["Durdle Door"]
    assert changed is False


def test_a_row_only_the_seed_brought_leaves_with_it():
    rows = []
    harvest_beaches.resolve_seed("GB", rows, [entry("Q1", "Durdle Door")],
                                 lambda q, c: [wd_rec("Q1", "Durdle Door")])
    assert len(rows) == 1
    _r, _m, changed = harvest_beaches.resolve_seed("GB", rows, [],
                                                   lambda q, c: [])
    assert rows == [] and changed is True


def test_wikidata_items_needs_a_coordinate_in_the_query():
    # The guarantee behind "never invent a row": P625 is not OPTIONAL.
    query = harvest_beaches.ITEMS_QUERY
    assert "?x p:P625/psv:P625 ?co ." in query
    assert "OPTIONAL { ?x p:P625" not in query
    assert harvest_beaches.wikidata_items(["not a qid", ""], "GB") == []


# ---------------------------------------------------------------------------
# The shortlist pin
# ---------------------------------------------------------------------------

def test_famous_seed_is_always_shortlisted():
    beaches = [{"key": k, "prelim": p} for k, p in
               (("a", 9.0), ("b", 8.0), ("c", 3.0), ("d", 1.0))]
    beaches[3]["seed"] = {"why": "famous", "name": "D"}
    short = enrich_beaches.pick_shortlist(beaches, 2)
    assert [b["key"] for b in short] == ["a", "b", "d"]
    # Within the cut it is not added twice.
    assert [b["key"] for b in enrich_beaches.pick_shortlist(beaches, 4)] == [
        "a", "b", "c", "d"]


# ---------------------------------------------------------------------------
# The export
# ---------------------------------------------------------------------------

def test_country_cap_never_cuts_a_famous_row():
    rows = [{"id": i, "score": s} for i, s in
            (("a", 9.0), ("b", 8.0), ("famous", 5.6), ("c", 7.0))]
    out = export_beaches.keep_famous(rows, rows[:1], {"famous"})   # cap of 1
    assert [r["id"] for r in out] == ["a", "famous"]
    assert [r["id"] for r in export_beaches.keep_famous(
        rows, rows[2:3], {"famous"})] == ["famous"]


def cache_beach(name, wd, lat, lon, famous=False):
    b = {"key": f"wd:{wd}", "wd": wd, "name": name, "name_local": "",
         "iso2": "GB", "lat": lat, "lon": lon, "sources": ["wikidata"],
         "osm_id": "", "osm_tags": {}, "images": []}
    if famous:
        b["seed"] = {"why": "famous", "name": name}
    return b


def test_famous_seed_that_fails_a_gate_ships_listed_not_editorial():
    famous_beach = cache_beach("Durdle Door", "Q1", 50.6213, -2.2765, True)
    plain = cache_beach("Ringstead Bay", "Q2", 50.63, -2.35)
    spare = [(famous_beach, {}, 4.1), (plain, {}, 4.0)]
    famous = export_beaches.famous_ids([famous_beach, plain])
    listed = export_beaches.famous_listed([], spare, famous)
    assert [r["name"] for r in listed] == ["Durdle Door"]
    row = listed[0]
    assert row["t"] == "l" and "score" not in row and "tier" not in row
    assert {"k": "unrated_coverage"} in row["why"]
    assert export_beaches.validate_listed(listed) == []
    # Already rated: no second, listed copy.
    assert export_beaches.famous_listed([{"id": row["id"]}], spare,
                                        famous) == []


def test_dedupe_keeps_the_famous_row_over_a_neighbour():
    better = {"id": "gb-neighbour", "lat": 50.6214, "lon": -2.2766,
              "score": 8.0, "images": []}
    famous_row = {"id": "gb-famous", "lat": 50.6213, "lon": -2.2765,
                  "score": 6.0, "images": []}
    rows = [better, famous_row]                       # score order
    kept = export_beaches.dedupe(export_beaches.famous_first(
        rows, {"gb-famous"}))
    assert [r["id"] for r in kept] == ["gb-famous"]
    # Without the famous mark the better neighbour wins, as before.
    assert [r["id"] for r in export_beaches.dedupe(
        [dict(better), dict(famous_row)])] == ["gb-neighbour"]


def test_famous_listed_row_clears_a_rated_neighbour_on_the_same_sand():
    near = {"id": "gb-near", "lat": 50.6214, "lon": -2.2766}
    far = {"id": "gb-far", "lat": 50.70, "lon": -2.40}
    famous_listed = [{"id": "gb-famous", "lat": 50.6213, "lon": -2.2765}]
    rated = export_beaches.clear_for_famous([near, far], famous_listed,
                                            {"gb-famous"})
    assert [r["id"] for r in rated] == ["gb-far"]
    listed = export_beaches.dedupe_across(rated, famous_listed)
    assert [r["id"] for r in listed] == ["gb-famous"]
