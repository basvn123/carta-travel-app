"""Why registry routes are missing from the trails wire (T322; rows T113-d, T113-e).

Covers the national pass in curate.select_country (off by default, so the
default selection is unchanged), is_national, national_quota, and the pure
half of pipeline/trails/gate_attribution.py. No lab, no network.

Runs under pytest from the repo root:
    python -m pytest tests/test_gate_attribution.py -q
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import curate  # noqa: E402
import gate_attribution as ga  # noqa: E402


def row(i, title, km, network="nwn", wikidata=None, loop=False, lat=47.0,
        lon=8.0, nuts3="CH011", quality=80):
    return {
        "id": i, "country": "CH", "title": title, "network": network,
        "distance_m": int(km * 1000), "quality": quality, "status": "needs_review",
        "source_ref": str(1000 + i), "ref": None, "wikidata": wikidata,
        "wikipedia": None, "raw_operator": None, "is_loop": loop,
        "loop_source": None, "sac_scale": None, "nuts3": nuts3,
        "derived_route": None, "hierarchy": None, "stage_of": None,
        "top_of": None, "co_located": None, "clon": lon, "clat": lat,
        "popularity": None, "geometry_ok": True,
    }


def pool():
    """Thirty loops that fill the day pool, one 100 km nwn path nobody wrote
    an article about, one famous 100 km path, and one lwn 100 km path."""
    rows = [row(i, f"Rundweg {chr(65 + i)}{i}", 8, network="lwn", loop=True,
                lat=47.0 + i * 0.4, lon=8.0 + i * 0.4, nuts3=f"CH{i:03d}")
            for i in range(30)]
    rows += [
        row(100, "Alpenweg Nord", 100, "nwn", lat=46.0, lon=7.0, nuts3="CH900"),
        row(101, "Grosser Kammweg", 100, "nwn", wikidata="Q1", lat=46.5,
            lon=7.5, nuts3="CH901"),
        row(102, "Talweg Sued", 100, "lwn", lat=45.5, lon=6.5, nuts3="CH902"),
        row(103, "Kurzer Landesweg", 12, "nwn", lat=45.0, lon=6.0,
            nuts3="CH903", quality=10),
    ]
    return rows


def run(national):
    rows = pool()
    quotas = {r["nuts3"]: 1 for r in rows}
    picked, listed, _ = curate.select_country(
        rows, 20, quotas, floor=0, national=national)
    return rows, {r["id"] for r in picked}


def test_is_national():
    assert curate.is_national({"network": "nwn"})
    assert curate.is_national({"network": "IWN"})
    assert curate.is_national({"network": "rwn;nwn"})
    assert not curate.is_national({"network": "rwn"})
    assert not curate.is_national({"network": "lwn"})
    assert not curate.is_national({"network": None})


def test_national_quota_is_floored_and_capped():
    assert curate.national_quota(10) == curate.NATIONAL_MIN
    assert curate.national_quota(10_000) == curate.NATIONAL_MAX
    assert curate.NATIONAL_MIN <= curate.national_quota(500) <= curate.NATIONAL_MAX


def test_default_selection_leaves_the_unfamous_national_path_out():
    # The defect: a 100 km nwn path with no article is in no pool, so it is
    # never picked, while the famous one is.
    _, got = run(national=False)
    assert 101 in got
    assert 100 not in got


def test_national_pass_rescues_the_unfamous_national_path_only():
    _, got = run(national=True)
    assert 100 in got          # nwn, 100 km, no article
    assert 101 in got          # still there
    assert 102 not in got      # lwn is not national
    assert 103 in got          # a short national path too, outside the region quota


def test_national_pass_spends_the_target_and_displaces_only_loops():
    # The pass takes slots from the country target, it does not add to it, so
    # the count is unchanged and whatever it displaces is a day-pool loop.
    _, off = run(national=False)
    _, on = run(national=True)
    assert len(on) == len(off)
    assert on - off == {100}
    assert all(i < 30 for i in off - on)


def test_hard_gate_order():
    ok = {"distance_m": 20_000, "title": "Weg", "status": "needs_review",
          "continuous": True}
    assert ga.hard_gate(None) == "not_staged"
    assert ga.hard_gate({**ok, "status": "rejected"}) == "rejected"
    assert ga.hard_gate({**ok, "title": "OSM route 7"}) == "synthetic_title"
    assert ga.hard_gate({**ok, "distance_m": 1_999}) == "too_short"
    assert ga.hard_gate({**ok, "distance_m": 400_001}) == "too_long"
    assert ga.hard_gate({**ok, "continuous": False}) == "continuity"
    assert ga.hard_gate(ok) is None
    # the first gate wins: a short, broken, synthetic route is synthetic
    assert ga.hard_gate({"distance_m": 10, "title": "OSM route 1",
                         "status": "needs_review", "continuous": False}) \
        == "synthetic_title"


def test_selection_gate_names_the_soft_gate():
    base = {"id": 1, "distance_m": 100_000, "famous": False,
            "network": "nwn", "family_members": 1}
    assert ga.selection_gate(base, {1}) == "picked"
    assert ga.selection_gate(base, set()) == "no_pool"
    assert ga.selection_gate(base, set(), national=True) == "trek_cap"
    assert ga.selection_gate({**base, "famous": True}, set()) == "trek_cap"
    assert ga.selection_gate({**base, "distance_m": 20_000}, set()) \
        == "region_or_cell"
    no_head = {k: v for k, v in base.items() if k != "family_members"}
    assert ga.selection_gate(no_head, set()) == "folded_into_family"


def test_attribute_end_to_end_on_the_synthetic_pool():
    rows, got = run(national=False)
    wanted = [
        {"relation_id": 1100, "country": "CH"},   # row 100, no pool
        {"relation_id": 1101, "country": "CH"},   # row 101, picked
        {"relation_id": 5, "country": "CH"},      # never staged
        {"relation_id": 6, "country": "CH"},      # staged, broken
    ]
    staged = {
        1100: {"distance_m": 100_000, "title": "Alpenweg Nord",
               "status": "needs_review", "continuous": True},
        1101: {"distance_m": 100_000, "title": "Grosser Kammweg",
               "status": "needs_review", "continuous": True},
        6: {"distance_m": 30_000, "title": "Bruchweg",
            "status": "needs_review", "continuous": False},
    }
    out = ga.attribute(wanted, staged, {"CH": rows}, {"CH": got})
    gates = {o["relation_id"]: o["gate"] for o in out}
    assert gates == {1100: "no_pool", 1101: "picked", 5: "not_staged",
                     6: "continuity"}
    s = ga.summarise(out)
    assert s["by_gate"]["no_pool"] == 1
    assert s["by_country"]["CH"]["picked"] == 1


# ---- T113-e: the blind-spot seeds and the worklist -------------------------

def test_blind_spot_seeds_are_new_ascii_and_wired_in():
    import famous_registry as fr
    import seeds_blind_spots as sb
    for cc, names in sb.SEEDS_BLIND.items():
        have = {fr.squash(fr.base_name(n)) for n in fr.SEEDS.get(cc, [])}
        assert len(set(names)) == len(names), cc
        for n in names:
            assert n.isascii(), n
            assert not set(n) & {chr(0x2014), chr(0xB7)}, n
            assert fr.squash(fr.base_name(n)) not in have, (cc, n)
    assert fr.SEEDS_BLIND is sb.SEEDS_BLIND


def test_blind_spot_worklist_ranks_candidates_by_rating():
    import blind_spot_worklist as bw
    gap = {"blind_ranges": [{"range": "GMBA:1", "name": "R", "published": 3}],
           "blind_nuts3": [{"nuts3": "EL422", "published": 3}]}
    trips = [("GR", {"name": n, "rating": r, "distance_m": 5000, "net": "lwn",
                     "rg": {"ra": "GMBA:1", "n3": "EL422"}})
             for n, r in (("a", 5), ("b", 9), ("c", 7), ("d", 1))]
    units = bw.build(gap, trips)
    assert [u["kind"] for u in units] == ["range", "nuts3"]
    assert [b["name"] for b in units[0]["best_published"]] == ["b", "c", "a"]
    assert units[0]["country"] == "GR" and units[1]["published"] == 3


if __name__ == "__main__":
    import pytest
    sys.exit(pytest.main([__file__, "-q"]))
