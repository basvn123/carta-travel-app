"""T1223: derive_routes' compact way store reads exactly as the dicts it
replaced, and the location loader gives the same answer in one pass or many.

The box's out-of-memory killer stopped the quarterly run on Spain (3.35 GB on
a 4 GB machine). way_store.py moved the per-way data into arrays; these tests
hold it to the old read interface on a fixture built to have the awkward
cases: ways out of id order, a closed way, shared end nodes, unnamed and
repeated tag sets, and node ids spread over several IdFilter chunks.
"""

import sys
from argparse import Namespace
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

np = pytest.importorskip("numpy")
osmium = pytest.importorskip("osmium")
pytest.importorskip("scipy")
pytest.importorskip("psycopg")

import way_store  # noqa: E402

# Node ids ~21 M apart (12 nodes over a span of ~230 M ids), so a 1 MB
# bitmap budget (8 M ids of span per pass) needs a pass per node.
SPREAD = 5 << 22


def write_fixture(path):
    """Nodes on a small grid with ids spread far apart; ways listed out of
    id order on purpose."""
    nodes = {}
    for i in range(12):
        nid = 1 + i * SPREAD
        nodes[i] = nid
    node_xml = [f'<node id="{nid}" version="1" lat="{46.0 + i * 0.001:.7f}" '
                f'lon="{7.0 + i * 0.0005:.7f}"/>'
                for i, nid in nodes.items()]
    ways = [
        # (way id, node indices, tags) - deliberately not sorted by id
        (30, [0, 1, 2], {"highway": "path", "name": "Sentier A [secteur 1]"}),
        (10, [2, 3, 4], {"highway": "path", "name": "Sentier A [secteur 2]"}),
        (20, [4, 5], {"highway": "footway"}),
        (25, [5, 6, 7], {"highway": "track", "tracktype": "grade2"}),
        (5, [7, 8], {"highway": "footway"}),
        (40, [8, 9, 10, 8], {"highway": "path", "sac_scale": "hiking"}),
        (41, [10, 11], {"highway": "steps", "name": "Escalier",
                        "bridge": "yes"}),
        (42, [11, 99], {"highway": "path", "name": "Missing node"}),
        (43, [3], {"highway": "path", "name": "Too short"}),
        (44, [1, 6], {"highway": "primary", "name": "Not walkable"}),
    ]
    way_xml = []
    for wid, idx, tags in ways:
        nds = "".join(f'<nd ref="{nodes.get(i, 1 + i * SPREAD)}"/>'
                      for i in idx)
        tg = "".join(f'<tag k="{k}" v="{v}"/>' for k, v in tags.items())
        way_xml.append(f'<way id="{wid}" version="1">{nds}{tg}</way>')
    path.write_text('<?xml version="1.0" encoding="UTF-8"?>\n'
                    '<osm version="0.6" generator="T1223 fixture">\n'
                    + "\n".join(node_xml) + "\n" + "\n".join(way_xml)
                    + "\n</osm>\n", encoding="utf-8")
    return path


def reference(path, dr):
    """The pre-T1223 structures, built the old way straight from osmium."""
    nodes, tags, structure = {}, {}, set()
    fp = osmium.FileProcessor(str(path), osmium.osm.WAY) \
        .with_filter(osmium.filter.KeyFilter("highway"))
    for way in fp:
        t = way.tags
        if t.get("highway") not in dr.WALK_HIGHWAYS:
            continue
        refs = np.fromiter((n.ref for n in way.nodes), dtype=np.int64)
        if len(refs) < 2:
            continue
        nodes[way.id] = refs
        tags[way.id] = {k: t[k] for k in dr.KEEP_WAY_TAGS if k in t}
        if t.get("bridge", "no") != "no" or t.get("tunnel", "no") != "no":
            structure.add(way.id)
    ends = defaultdict(list)
    for wid, refs in nodes.items():
        ends[int(refs[0])].append(wid)
        ends[int(refs[-1])].append(wid)
    return nodes, tags, structure, ends


@pytest.fixture(scope="module")
def dr():
    import derive_routes
    return derive_routes


@pytest.fixture(scope="module")
def built(dr, tmp_path_factory):
    path = write_fixture(tmp_path_factory.mktemp("t1223") / "spread.osm")
    return path, dr.scan_ways(path), reference(path, dr)


def test_nodes_and_tags_read_as_the_old_dicts(built):
    _path, ways, (nodes, tags, structure, _ends) = built
    assert list(ways.nodes) == list(nodes)            # scan order kept
    assert len(ways) == len(nodes) == 8
    for wid, refs in nodes.items():
        assert ways.nodes[wid].tolist() == refs.tolist()
        assert dict(ways.tags[wid]) == tags[wid]
        assert list(ways.tags[wid]) == list(tags[wid])  # key order kept
        assert wid in ways.nodes and wid in ways.tags
    assert [(w, dict(t)) for w, t in ways.tags.items()] == list(tags.items())
    assert ways.tags.get(999, {}) == {} and 999 not in ways.nodes
    with pytest.raises(KeyError):
        ways.nodes[999]
    assert ways.structure == structure == {41}
    # Two plain footways share one interned tag set.
    assert ways.tags[20] is ways.tags[5]


def test_end_index_matches_the_dict_of_lists(built):
    _path, ways, (_nodes, _tags, _structure, ends) = built
    idx = way_store.EndIndex(ways.nodes)
    for node, wids in ends.items():
        assert idx.get(node, []) == wids, node
    assert idx.get(123456789, []) == []
    # The closed way 40 ends where it starts: listed twice, as before.
    assert idx.get(1 + 8 * SPREAD).count(40) == 2


def test_per_tag_set_values_match_the_dicts(built, dr):
    _path, ways, (_nodes, tags, _structure, _ends) = built
    named_old = {w: dr.fold_name(t.get("name")) for w, t in tags.items()}
    base_old = {w: dr.squash(dr.base_name(t["name"])) or None
                for w, t in tags.items() if t.get("name")}
    named = way_store.PerTagSet(ways.tags,
                                lambda t: dr.fold_name(t.get("name")))
    base = way_store.PerTagSet(
        ways.tags,
        lambda t: (dr.squash(dr.base_name(t["name"])) or None)
        if t.get("name") else dr._NO_NAME, skip=dr._NO_NAME)
    for w in tags:
        assert named.get(w) == named_old[w]
        assert (w in base) == (w in base_old)
        assert base.get(w) == base_old.get(w)
    assert list(base) == list(base_old)
    assert len(base) == len(base_old)
    # The two stages of one walk fold to one base name.
    assert base[30] == base[10]


def test_locations_are_the_same_in_one_pass_or_many(built):
    path, ways, _ref = built
    from ingest_osm_routes import load_locations
    node_ids = ways.nodes.node_ids
    one = load_locations(path, node_ids)
    many, passes = way_store.load_aligned_locations(
        path, node_ids, budget_mb=1)
    whole, one_pass = way_store.load_aligned_locations(
        path, node_ids, budget_mb=1e6)
    assert passes == len(node_ids) and one_pass == 1
    for loc in (many, whole):
        ok_a, xa, ya = one.coords_for(node_ids)
        ok_b, xb, yb = loc.coords_for(node_ids)
        assert ok_a.tolist() == ok_b.tolist()
        assert xa[ok_a].tolist() == xb[ok_b].tolist()
        assert ya[ok_a].tolist() == yb[ok_b].tolist()
        # The node way 42 points at is not in the file.
        assert loc.n_found == len(node_ids) - 1


def test_way_index_handles_an_unsorted_scan(built):
    _path, ways, _ref = built
    assert not ways.index.sorted_scan          # the fixture is out of order
    for p, wid in enumerate(ways.index.wids):
        assert ways.index.pos(wid) == p
    assert ways.index.pos(7) == -1


def args(**kw):
    base = dict(force=False, resume=False, fresh_days=0.0)
    base.update(kw)
    return Namespace(**base)


def test_fresh_days_skips_only_recent_countries(dr):
    now = datetime.now(timezone.utc)
    done = {"ES": {"done_at": (now - timedelta(days=2)).isoformat()},
            "FR": {"done_at": (now - timedelta(days=60)).isoformat()}}
    assert dr.skip_reason("ES", args(fresh_days=14), done)
    assert dr.skip_reason("FR", args(fresh_days=14), done) is None
    assert dr.skip_reason("DE", args(fresh_days=14), done) is None
    assert dr.skip_reason("ES", args(), done) is None        # default: run
    assert dr.skip_reason("FR", args(resume=True), done)     # old --resume
    assert dr.skip_reason("ES", args(fresh_days=14, force=True), done) is None


def test_preflight_refuses_an_extract_bigger_than_memory(dr, monkeypatch):
    monkeypatch.setattr(dr, "mem_available_mb", lambda: 3_000.0)
    assert dr.too_big("XX", 1_000_000_000) is None           # 1 GB fits
    msg = dr.too_big("DE", 20_000_000_000)                   # 20 GB does not
    assert msg and "not started" in msg
    monkeypatch.setattr(dr, "mem_available_mb", lambda: None)
    assert dr.too_big("DE", 20_000_000_000) is None          # not Linux: run
