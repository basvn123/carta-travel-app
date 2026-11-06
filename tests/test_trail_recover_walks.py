"""T1094 (D7): the rules that recover famous walks lost in the trail build.

Two halves:

  chain.py       pure ordering and spine rules, on coordinate parts shaped
                 like a broken relation (stored backwards, listed late, with
                 a parallel variant).
  derive_routes  the whole in-memory derivation (scan, locate, near-pairs,
                 the four passes, geometry, gates) run with the real OSM
                 reader on small .osm files written here. Each file copies
                 the SHAPE of a famous walk as OSM maps it (ways, names,
                 grades, article tags, a variant or a spur), not its exact
                 nodes: the Geofabrik extracts are not on this machine, and
                 the full counts are an owner run on the box.

Every fixture states which rule it proves and what the old code did with it.
"""

import math
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import chain  # noqa: E402

# ---------------------------------------------------------------------------
# chain.py
# ---------------------------------------------------------------------------

M_PER_DEG_LAT = 111_195.0


def east(lon, lat, metres):
    """The point `metres` east of (lon, lat)."""
    return (lon + metres / (M_PER_DEG_LAT * math.cos(math.radians(lat))), lat)


def part(a, b):
    return {"start": a, "end": b, "len_m": chain.haversine_m(a, b)}


def test_reorder_and_flip_a_relation_stored_out_of_order():
    # A 3 km walk east along 49.2N in three 1 km parts. The relation lists
    # them as part 3, part 1 reversed, part 2: measured end to start in that
    # order (splice.py's rule) the breaks are kilometres; in walking order
    # they are zero.
    o = (20.0, 49.2)
    p1, p2, p3 = east(*o, 1000), east(*o, 2000), east(*o, 3000)
    parts = [part(p2, p3), part(p1, o), part(p1, p2)]
    got = chain.best_chain(parts, max_gap_m=300, require_all=True)
    assert got is not None and got["complete"]
    assert len(got["order"]) == 3
    assert max(got["gaps"]) < 1.0
    # Walking order is 1, 2, 3 in one direction or the other.
    seq = [i for i, _f in got["order"]]
    assert seq in ([1, 2, 0], [0, 2, 1])
    line = chain.apply_order([[parts[i]["start"], parts[i]["end"]]
                              for i in range(3)], got["order"])
    assert len(line) == 4                      # shared points dropped once
    span = chain.haversine_m(line[0], line[-1])
    assert abs(span - 3000) < 5


def test_reorder_measures_real_breaks_only():
    # Same walk with a genuine 120 m break between parts 2 and 3: kept and
    # measured as 120 m, not as the 2 km a stored-order reading gives.
    o = (7.03, 48.05)
    a, b = east(*o, 1000), east(*o, 2000)
    c = east(*o, 2120)
    d = east(*o, 3120)
    parts = [part(c, d), part(a, o), part(a, b)]
    got = chain.best_chain(parts, max_gap_m=300, require_all=True)
    assert got is not None
    assert sorted(round(g) for g in got["gaps"]) == [0, 120]


def test_require_all_refuses_a_part_beyond_the_bound():
    o = (10.0, 46.0)
    a = east(*o, 1000)
    far = east(*o, 5000)
    parts = [part(o, a), part(far, east(*o, 6000))]
    assert chain.best_chain(parts, max_gap_m=300, require_all=True) is None
    loose = chain.best_chain(parts, max_gap_m=300)
    assert loose is not None and not loose["complete"]


def test_spine_takes_the_main_line_past_a_variant():
    # Main line A-B-C-D (3 x 1 km) with a 400 m spur at B. The longest line
    # is the main line, 3,000 of 3,400 m = 88% >= 80%: it ships, the spur is
    # set aside and counted.
    o = (20.0, 49.22)
    b, c, d = east(*o, 1000), east(*o, 2000), east(*o, 3000)
    spur_end = (b[0], b[1] + 400 / M_PER_DEG_LAT)
    parts = [part(o, b), part(b, c), part(c, d), part(b, spur_end)]
    got = chain.spine(parts, max_gap_m=1.0)
    assert got is not None
    assert got["set_aside"] == [3]
    assert abs(got["set_aside_m"] - 400) < 5
    assert got["share"] > 0.85


def test_spine_refuses_two_walks_that_touch():
    # A Y: two 2 km arms from one point. The longest line is 4 km of 6 km,
    # 67%: that is two walks, not one walk with a variant.
    o = (8.0, 46.5)
    parts = [part(o, east(*o, 2000)), part(o, east(*o, -2000)),
             part(o, (o[0], o[1] + 2000 / M_PER_DEG_LAT))]
    assert chain.spine(parts, max_gap_m=1.0) is None


def test_spine_never_jumps_a_gap_wider_than_its_bound():
    o = (8.0, 46.5)
    a = east(*o, 1000)
    b = east(*o, 1010)                         # 10 m apart, bound is 1 m
    parts = [part(o, a), part(b, east(*o, 2000))]
    got = chain.spine(parts, max_gap_m=1.0)
    assert got is None                         # 50% each, and no join


# ---------------------------------------------------------------------------
# derive_routes on .osm fixtures
# ---------------------------------------------------------------------------

osmium = pytest.importorskip("osmium")
pytest.importorskip("scipy")
pytest.importorskip("psycopg")


class Osm:
    """A tiny OSM XML writer: ways along straight legs, nodes every ~50 m."""

    def __init__(self):
        self.nodes = {}          # (lon, lat) rounded -> id
        self.node_xml = []
        self.way_xml = []
        self.next_node = 1
        self.next_way = 1000

    def node(self, pt):
        key = (round(pt[0], 7), round(pt[1], 7))
        if key not in self.nodes:
            nid = self.next_node
            self.next_node += 1
            self.nodes[key] = nid
            self.node_xml.append(
                f'<node id="{nid}" version="1" lat="{key[1]:.7f}" '
                f'lon="{key[0]:.7f}"/>')
        return self.nodes[key]

    def way(self, a, b, **tags):
        n = max(1, int(chain.haversine_m(a, b) // 50))
        pts = [(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n)
               for k in range(n + 1)]
        refs = [self.node(p) for p in pts]
        wid = self.next_way
        self.next_way += 1
        nds = "".join(f'<nd ref="{r}"/>' for r in refs)
        tg = "".join(f'<tag k="{k.replace("__", ":")}" v="{v}"/>'
                     for k, v in tags.items())
        self.way_xml.append(f'<way id="{wid}" version="1">{nds}{tg}</way>')
        return wid

    def write(self, path):
        path.write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<osm version="0.6" generator="T1094 fixture">\n'
            + "\n".join(self.node_xml) + "\n" + "\n".join(self.way_xml)
            + "\n</osm>\n", encoding="utf-8")
        return path


@pytest.fixture(scope="module")
def dr():
    import derive_routes
    return derive_routes


def run(dr, osm, tmp_path, name):
    pbf = osm.write(tmp_path / f"{name}.osm")
    records, counts = dr.derive_extract(pbf, "XX", expected_km={})
    return records, counts


def leg_points(o, metres_each, n):
    return [east(*o, metres_each * k) for k in range(n + 1)]


def test_orla_perc_main_line_ships_past_its_variant_and_spur(dr, tmp_path):
    """Rule 3. Orla Perc's shape: a ridge of graded ways all citing one
    article, a parallel one-way section and a spur down to a col, also
    tagged. Before T1094 the fame and base-name passes refused it as
    branching, and the lenient same-name pass then shipped its longest
    stitched piece (3.6 of the 4.5 km here) under the walk's full name.
    Now the fame pass ships the whole main line, variant and spur set
    aside and recorded."""
    osm = Osm()
    tags = dict(highway="path", name="Orla Perć",
                sac_scale="demanding_alpine_hiking",
                wikipedia="pl:Orla Perć")
    pts = leg_points((20.0165, 49.2187), 450, 10)          # 4.5 km ridge
    for a, b in zip(pts, pts[1:]):
        osm.way(a, b, **tags)
    # A parallel variant over the 3rd leg, 60 m north, joined at both ends.
    a, b = pts[2], pts[3]
    mid = ((a[0] + b[0]) / 2, a[1] + 60 / M_PER_DEG_LAT)
    osm.way(a, mid, **tags)
    osm.way(mid, b, **tags)
    # A 250 m spur south from the 7th node.
    s = pts[7]
    osm.way(s, (s[0], s[1] - 250 / M_PER_DEG_LAT), **tags)
    records, counts = run(dr, osm, tmp_path, "orla")
    named = [r for r in records if r["title"] == "Orla Perć"]
    assert len(named) == 1, (records, counts)
    r = named[0]
    assert r["gap_info"].get("spine_from", 0) >= 2
    assert r["gap_info"]["spine_set_aside_m"] > 200
    assert 4300 <= r["length_m"] <= 4800
    assert r["raw_tags"]["derived_join"] == "fame"
    assert counts["spine"] == 1


def test_two_famous_walks_sharing_an_article_stay_refused(dr, tmp_path):
    """Rule 3's limit: a Y whose arms are equal is two walks; the main line
    would carry 67% of the chain, under SPINE_SHARE_MIN, so the strict pass
    still refuses it (the fallback passes may still make walks of it, but
    never under the fame join)."""
    osm = Osm()
    tags = dict(highway="path", sac_scale="mountain_hiking",
                wikipedia="de:Beispielweg")
    o = (11.0, 47.5)
    for d in (2500, -2500):
        osm.way(o, east(*o, d), **tags)
    osm.way(o, (o[0], o[1] + 2500 / M_PER_DEG_LAT), **tags)
    records, counts = run(dr, osm, tmp_path, "y")
    assert not [r for r in records if r["raw_tags"]["derived_join"] == "fame"]
    assert counts["spine"] == 0


def test_besseggen_lone_graded_famous_way_ships(dr, tmp_path):
    """Rule 2. One way, highway=path, sac_scale, an article tag, 3 km:
    skipped before T1094 as 'a lone way is not a chain'."""
    osm = Osm()
    o = (8.80, 61.50)
    osm.way(o, east(*o, 3000), highway="path", name="Besseggen",
            sac_scale="demanding_mountain_hiking", wikipedia="en:Besseggen")
    records, counts = run(dr, osm, tmp_path, "besseggen")
    assert [r["title"] for r in records] == ["Besseggen"]
    assert records[0]["gap_info"]["lone_way"] is True
    assert counts["lone_way"] == 1


def test_lone_rule_refuses_a_famous_bridge_and_an_ungraded_street(dr, tmp_path):
    """Rule 2's limits: a 721 m footbridge with a grade and an article is a
    structure, not a walk; a famous footway with no grade or waymark is a
    street (Via Roma)."""
    osm = Osm()
    o = (16.80, 50.08)
    osm.way(o, east(*o, 721), highway="footway", bridge="yes",
            name="Sky Bridge 721", sac_scale="hiking",
            wikipedia="cs:Sky Bridge 721")
    o2 = (12.48, 41.90)
    osm.way(o2, east(*o2, 900), highway="footway", name="Via Roma",
            wikipedia="it:Via Roma")
    records, counts = run(dr, osm, tmp_path, "structures")
    assert records == []
    assert counts["lone_way"] == 0


def test_article_pair_joins_ways_that_cite_it_two_ways(dr, tmp_path):
    """Rule 1. Four unnamed graded ways, two citing wikidata, two only the
    Wikipedia title, one carrying both (which states the pair). Unnamed, so
    base-name cannot rescue them. Before T1094 the keys differed, the fame
    pass saw holes and nothing shipped."""
    osm = Osm()
    o = (-4.85, 43.25)                                      # Picos de Europa
    pts = leg_points(o, 700, 4)
    both = dict(highway="path", sac_scale="hiking",
                wikidata="Q999001", wikipedia="es:Ruta de prueba")
    only_wp = dict(highway="path", sac_scale="hiking",
                   wikipedia="es:Ruta de prueba")
    only_wd = dict(highway="path", sac_scale="hiking", wikidata="Q999001")
    osm.way(pts[0], pts[1], **only_wd)
    osm.way(pts[1], pts[2], **only_wp)
    osm.way(pts[2], pts[3], **both)
    osm.way(pts[3], pts[4], **only_wp)
    records, counts = run(dr, osm, tmp_path, "pair")
    fame = [r for r in records if r["raw_tags"]["derived_join"] == "fame"]
    assert len(fame) == 1, (records, counts)
    assert len(fame[0]["member_way_ids"]) == 4
    assert 2700 <= fame[0]["length_m"] <= 2900
    assert counts["fame_key_joined"] == 2


def test_sentier_des_roches_sectors_still_chain(dr, tmp_path):
    """Regression: the case Phase 2 was built for keeps working. Eight
    sectors named '[secteur N]', all citing fr:Sentier des Roches, one 30 m
    unmapped break between sectors 4 and 5 (bridged under 50 m)."""
    osm = Osm()
    o = (7.0309, 48.0497)
    x = 0.0
    for k in range(1, 9):
        if k == 5:
            x += 30
        a, b = east(*o, x), east(*o, x + 320)
        osm.way(a, b, highway="path", name=f"Sentier des Roches [secteur {k}]",
                sac_scale="demanding_mountain_hiking",
                wikipedia="fr:Sentier des Roches")
        x += 320
    records, _counts = run(dr, osm, tmp_path, "roches")
    assert len(records) == 1
    r = records[0]
    assert r["raw_tags"]["derived_join"] == "fame"
    assert r["gap_info"]["bridged_m"] == pytest.approx(30, abs=2)
    assert len(r["member_way_ids"]) == 8


# ---------------------------------------------------------------------------
# splice.py: the reorder pass (failed_continuity)
# ---------------------------------------------------------------------------

def line3d(a, b, n=10, z0=100.0, dz=10.0):
    return [[a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n,
             z0 + dz * k] for k in range(n + 1)]


@pytest.fixture(scope="module")
def sp():
    import splice
    return splice


def test_reorder_recovers_a_relation_the_stored_order_refused(sp):
    # Laugavegur's failure shape: a 54 km relation whose parts are listed out
    # of order with one stored backwards. Stored order: part B then part A
    # reversed then part C, so end-to-start breaks are tens of km. In walking
    # order every break is a few metres.
    o = (-19.06, 63.99)
    a_end = east(*o, 18000)
    b_start = east(*o, 18008)                       # an 8 m unjoined node
    b_end = east(*o, 36000)
    c_end = east(*o, 54000)
    A = line3d(o, a_end)
    B = line3d(b_start, b_end)
    C = line3d(b_end, c_end)
    stored = [B, A[::-1], C]
    plan, why = sp.plan_reorder(stored, 54000)
    assert why is None
    assert plan["bridges"] == 1
    assert plan["max_bridge_m"] == pytest.approx(8, abs=1)
    assert plan["flipped_parts"] >= 1
    line = plan["line"]
    assert len(line[0]) == 3                        # Z rides through
    span = chain.haversine_m(tuple(line[0][:2]), tuple(line[-1][:2]))
    assert span == pytest.approx(54000, rel=0.001)


def test_reorder_keeps_the_existing_limits(sp):
    o = (29.0, 36.5)                                # Likya Yolu's problem
    a, b = east(*o, 10000), east(*o, 12000)         # a real 2 km break
    plan, why = sp.plan_reorder([line3d(o, a), line3d(b, east(*o, 20000))],
                                20000)
    assert plan is None and why == "break_over_limit"


def test_tiny_breaks_lift_only_the_count_cap(sp):
    # Twelve parts, eleven 5 m breaks: over MAX_GAPS (8), all under
    # TINY_GAP_M, 55 m in total. Allowed by the tiny rule.
    o = (6.9, 45.9)
    parts, x = [], 0.0
    for _k in range(12):
        parts.append(line3d(east(*o, x), east(*o, x + 1000)))
        x += 1005
    plan, why = sp.plan_reorder(parts[::-1], x)
    assert why is None
    assert plan["bridges"] == 11 and plan["tiny_rule"] is True
    # The same twelve parts with 40 m breaks: over TINY_GAP_M, so the
    # ordinary cap of 8 applies and the route stays out.
    parts, x = [], 0.0
    for _k in range(12):
        parts.append(line3d(east(*o, x), east(*o, x + 1000)))
        x += 1040
    plan, why = sp.plan_reorder(parts, x)
    assert plan is None and why == "too_many_breaks"


def test_reorder_never_drops_a_part(sp):
    # A spur that cannot be walked through without a jump over the limit:
    # the relation is refused whole, not published without the spur.
    o = (7.5, 46.6)
    main = line3d(o, east(*o, 6000))
    spur = line3d(east(*o, 3000), (east(*o, 3000)[0], o[1] + 0.01))
    plan, why = sp.plan_reorder([main, spur], 7100)
    assert plan is None and why == "break_over_limit"


# ---------------------------------------------------------------------------
# export_wire.py: country assignment
# ---------------------------------------------------------------------------

def test_northern_ireland_walks_leave_the_ireland_extract():
    sys.path.insert(0, str(ROOT / "pipeline" / "regions"))
    import export_wire
    known = {"IE", "GB", "NL", "DE"}
    # Mourne Wall Challenge: 31 km, staged IE by its extract, owning region
    # in Northern Ireland (ITL TLN0). Refiled GB whatever its length.
    assert export_wire.extract_quirk_country(
        {"n2": "TLN0", "n3": "TLN0D"}, "IE", known) == "GB"
    # A walk in the Republic stays.
    assert export_wire.extract_quirk_country(
        {"n2": "IE04", "n3": "IE041"}, "IE", known) == "IE"
    # Grote Rivierenpad stage 15 (Kranenburg to Kleve) lies in Germany and
    # is filed DE by its extract and by its midpoint: nothing to change.
    assert export_wire.extract_quirk_country(
        {"n2": "DEA1", "n3": "DEA1B"}, "DE", known) == "DE"
    # Other long cross-border paths keep T456's rule (owner decides).
    assert export_wire.extract_quirk_country(
        {"n2": "PL51", "n3": "PL518"}, "CZ", known | {"CZ", "PL"}) == "CZ"
