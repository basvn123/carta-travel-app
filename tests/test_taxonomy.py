"""The Carta travel taxonomy and its mapping from today's tags (T1149, ROADMAP F1).

The mapping test: every value of every tag vocabulary in use today (read live
by pipeline/taxonomy/tag_sources.py from the code and the shipped data) has a row
in pipeline/taxonomy/mapping.yaml that names real taxonomy nodes, or is
declared not a concept with a reason. A new tag anywhere fails this test
until it is mapped.
"""
import csv
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "taxonomy"))

import build_label_template as tmpl
import tag_sources as sources
import taxonomy as tax

COLLECTED = sources.collect()


def test_taxonomy_is_valid():
    assert tax.validate() == []


def test_shape():
    s = tax.summary()
    assert s["by_level"].get(0) == 5, "five facets"
    assert set(s["by_level"]) <= {0, 1, 2, 3}, "three levels below the facet root"
    assert 200 <= s["nodes"] <= 400
    assert set(s["by_facet"]) == {"activity", "setting", "vibe", "traveller", "practical"}


def test_every_existing_tag_is_mapped():
    problems = tax.mapping_problems(COLLECTED)
    assert problems == [], "\n".join(problems[:40])


def test_the_mapping_covers_the_big_vocabularies():
    for src in ("place.categories", "vibes", "likes", "place.tags", "trail.highlights", "beach.tags", "lake.tags", "mountain.tags"):
        assert COLLECTED.get(src), f"{src} read nothing: the collector lost its source"
    assert len(COLLECTED["vibes"]) == 20
    assert len(COLLECTED["likes"]) == 12


def test_not_a_concept_is_small():
    none = [(s, v) for s, vs in COLLECTED.items() for v in vs if not tax.map_value(s, v)]
    total = sum(len(v) for v in COLLECTED.values())
    assert len(none) / total < 0.05, none


def test_a_new_tag_fails_the_mapping():
    got = {**COLLECTED, "place.categories": {**COLLECTED["place.categories"], "brand-new-tag": 1}}
    assert any("brand-new-tag" in p for p in tax.mapping_problems(got))


def test_template_is_the_draw_and_stratified():
    rows = tmpl.read()
    assert len(rows) == 400
    assert [(r["item_id"], r["layer"]) for r in rows] == [(r["item_id"], r["layer"]) for r in tmpl.build()]
    layers = Counter(r["layer"] for r in rows)
    assert layers == Counter(tmpl.QUOTA)
    places = [r for r in rows if r["layer"] == "place"]
    assert {r["kind"] for r in places} == {"metro", "city", "town", "village", "area"}
    assert len({r["country"] for r in places}) >= 40
    assert len({r["item_id"] for r in rows}) == 400
    assert list(rows[0].keys()) == tmpl.COLUMNS


def test_seed_gold_uses_real_ids_and_template_items():
    ids = set(tax.nodes())
    template = {r["item_id"] for r in tmpl.read()}
    with open(ROOT / "continent-app" / "scripts" / "eval" / "taxonomy" / "seed-gold.csv", encoding="utf-8") as f:
        seed = list(csv.DictReader(f))
    assert len(seed) >= 10
    for r in seed:
        assert r["item_id"] in template
        for t in r["labels"].split(";"):
            assert t in ids, (r["item_id"], t)


def test_baseline_maps_old_tags():
    preds = tax.baseline_predictions([{"item_id": "gem:hallstatt", "layer": "place", "country": "AT"}])
    tags = [p["tag"] for p in preds["gem:hallstatt"]]
    assert "set.lake" in tags or "set.lakeside-town" in tags


def test_journey_tags_coverage_is_reported():
    cov = tax.free_tag_coverage(sources.journey_tags())
    assert cov["distinct"] > 0 and 0 < cov["share_distinct"] <= 1


def test_seed_gold_holds_no_node_with_its_ancestor():
    ns = tax.nodes()

    def ancestors(i):
        while ns[i]["parent"]:
            i = ns[i]["parent"]
            yield i

    with open(ROOT / "continent-app" / "scripts" / "eval" / "taxonomy" / "seed-gold.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            labels = set(r["labels"].split(";"))
            for t in labels:
                assert not labels & set(ancestors(t)), (r["item_id"], t)
