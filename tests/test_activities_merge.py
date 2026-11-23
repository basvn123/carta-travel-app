"""merge_items: a re-harvest must not reshuffle or strip the activities (D9, V-4 / I-17)."""
import copy
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
import harvest_activities as ha  # noqa: E402


def it(name, lat=48.8584, lon=2.2945, **kw):
    return {"name": name, "kind": "Sight", "lat": lat, "lon": lon, "rate": 3, **kw}


def test_old_keeps_index_and_enrichment_new_appends():
    old = [it("Eiffel Tower", img="a.jpg", desc="iron tower"), it("Louvre", 48.8606, 2.3376)]
    new = [it("Orsay", 48.86, 2.3266), it("Louvre", 48.8606, 2.3376), it("Eiffel Tower")]
    out = ha.merge_items(old, new)
    assert [i["name"] for i in out] == ["Eiffel Tower", "Louvre", "Orsay"]
    assert out[0]["img"] == "a.jpg" and out[0]["desc"] == "iron tower"


def test_new_fills_only_missing_fields():
    out = ha.merge_items([it("Louvre", desc="old")], [it("Louvre", desc="new", wiki="w")])
    assert out[0]["desc"] == "old" and out[0]["wiki"] == "w"


def test_empty_fetch_keeps_old_and_inputs_untouched():
    old = [it("Louvre")]
    snap = copy.deepcopy(old)
    assert ha.merge_items(old, []) == snap and ha.merge_items(old, None) == snap
    assert ha.merge_items(None, [it("A")]) == [it("A")]
    new = [it("Louvre", img="x")]
    ha.merge_items(old, new)
    assert old == snap and new == [it("Louvre", img="x")]


def test_key_is_qid_else_folded_name_and_rounded_position():
    assert ha.item_key({"name": "A", "wikidata": "Q1"}) == ha.item_key({"name": "B", "wikidata": "Q1"})
    a = it("Musée d'Orsay", 48.86001, 2.32661)
    b = it("MUSEE D ORSAY", 48.86004, 2.32664)     # same folded name, same 4 decimals
    assert ha.item_key(a) == ha.item_key(b)
    assert ha.item_key(it("Orsay", 48.8600, 2.3266)) != ha.item_key(it("Orsay", 48.8700, 2.3266))
    assert ha.item_key({"name": "Name only"}) == ha.item_key({"name": "name  only"})


def test_merge_record_keeps_old_on_empty_and_merges_both_lists():
    old = {"source": "opentripmap", "items": [{"name": "A", "kind": "Sight"}], "items_full": [it("A", img="i")]}
    assert ha.merge_record(old, {"source": "wikivoyage", "items": []}) is old
    assert ha.merge_record(None, None) is None
    new = {"source": "opentripmap", "items": [{"name": "B", "kind": "Sight"}],
           "items_full": [it("A"), it("B", 1.0, 2.0)]}
    rec = ha.merge_record(old, new)
    assert [i["name"] for i in rec["items"]] == ["A", "B"]
    assert [i["name"] for i in rec["items_full"]] == ["A", "B"] and rec["items_full"][0]["img"] == "i"
