"""D25 e: a famous trail one row cannot carry comes in as its stages.

curate.select_country's pass 0b. The South West Coast Path (1,014 km) never
passes the candidate query as one row, and Kungsleden reached the wire as
one stage of itself; their stage relations are taken ahead of the quotas
and past the series cap, up to STAGES_MAX a trail. Fixture references, no
lab, no network.

    python -m pytest tests/test_trail_reference_stages.py -q
"""

import sys
from collections import defaultdict
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import curate  # noqa: E402
import derived_gate as g  # noqa: E402

SWCP_REL = 2376086


@pytest.fixture(autouse=True)
def references(monkeypatch):
    refs = defaultdict(list)
    refs["GB"] = [("wd:Q1", {"southwestcoastpath"}, set()),
                  ("lechweg-gb", {"lechweg"}, {"lechweg"})]
    refs["SE"] = [("kungsleden", {"kungsleden"}, {"kungsleden"})]
    ids = defaultdict(dict)
    ids["GB"] = {str(SWCP_REL): "wd:Q1", "Q1": "wd:Q1"}
    monkeypatch.setattr(g, "_REFERENCE", refs)
    monkeypatch.setattr(g, "_REFERENCE_IDS", ids)
    monkeypatch.setattr(g, "_REFERENCE_LENGTHS", {
        "wd:Q1": (1014.0, True), "kungsleden": (450.0, True),
        "lechweg-gb": (125.0, False), "unknown-long": (None, True),
        "unknown-short": (None, False)})


def row(i, title, km, cc="GB", top_of=None, stage_of=None, derived=False,
        ref=None, operator=None, lat=50.5, lon=-4.0):
    return {
        "id": i, "country": cc, "title": title, "network": "nwn",
        "distance_m": int(km * 1000), "quality": 60, "status": "needs_review",
        "source_ref": str(5000 + i), "ref": ref, "wikidata": None,
        "wikipedia": None, "raw_operator": operator, "is_loop": False,
        "loop_source": None, "sac_scale": None, "nuts3": f"{cc}K30",
        "derived_route": derived, "hierarchy": "stage" if stage_of else None,
        "stage_of": stage_of, "top_of": top_of, "co_located": None,
        "clon": lon + i * 0.01, "clat": lat, "popularity": None,
        "geometry_ok": True,
    }


def test_stage_found_by_relation_tree_and_by_name():
    assert curate.stage_ref_of(row(1, "Minehead to Porlock Weir", 14,
                                   top_of=SWCP_REL,
                                   stage_of=SWCP_REL)) == "wd:Q1"
    assert curate.stage_ref_of(row(2, "Kungsleden Etapp 3: Alesjaure - "
                                   "Tjäktja", 13, cc="SE")) == "kungsleden"
    assert curate.stage_ref_of(row(3, "03 - Kungsleden", 13,
                                   cc="SE")) == "kungsleden"
    # the trail's own name is pass 0's, not a stage
    assert curate.stage_ref_of(row(4, "Kungsleden", 440, cc="SE")) is None
    # an assembled route is never a famous trail's stage
    assert curate.stage_ref_of(row(5, "Kungsleden Etapp 4", 12, cc="SE",
                                   derived=True)) is None
    # a stage word on another trail's name
    assert curate.stage_ref_of(row(6, "Padjelantaleden Etapp 2", 12,
                                   cc="SE")) is None


def test_which_references_want_stages():
    assert curate.wants_stages("wd:Q1", 0)                  # over 400 km
    assert curate.wants_stages("wd:Q1", 390_000)
    assert curate.wants_stages("lechweg-gb", 30_000)        # a piece
    assert not curate.wants_stages("lechweg-gb", 120_000)   # one row is it
    assert curate.wants_stages("unknown-long", 50_000)
    assert not curate.wants_stages("unknown-short", 0)


def test_stage_picks_cap_and_longest_first():
    rows = [row(i, f"SWCP stage {i}", 10 + i % 7, top_of=SWCP_REL,
                stage_of=SWCP_REL) for i in range(1, 81)]
    picks = curate.stage_picks(rows, [], cap=60)
    assert len(picks) == 60
    assert all(r["reference"] == "wd:Q1" and r["famous"] for r in picks)
    kms = [r["distance_m"] for r in picks]
    assert kms == sorted(kms, reverse=True)


def test_a_section_is_taken_instead_of_its_own_stages():
    section = row(1, "South West Coast Path (Somerset and North Devon)", 140,
                  top_of=SWCP_REL, stage_of=SWCP_REL)
    kids = [row(i, f"Stage {i}", 14, top_of=SWCP_REL,
                stage_of=int(section["source_ref"])) for i in range(2, 12)]
    other = row(20, "Stage 20", 15, top_of=SWCP_REL, stage_of=SWCP_REL)
    got = {r["id"] for r in curate.stage_picks([section] + kids + [other], [])}
    assert got == {1, 20}


def test_one_row_that_carries_the_trail_takes_no_stages():
    whole = row(1, "Lechweg", 120)
    whole["reference"] = "lechweg-gb"
    stages = [row(i, f"Lechweg Etappe {i}", 15) for i in range(2, 6)]
    assert curate.stage_picks([whole] + stages, [whole]) == []
    whole["distance_m"] = 30_000      # only a piece: its stages come in
    assert len(curate.stage_picks([whole] + stages, [whole])) == 4


def test_select_country_takes_stages_past_the_series_cap():
    # 70 stages of one operator's numbered series (SWCP01..): the series cap
    # would allow SERIES_CAP of them; a famous trail's stages pass it.
    stages = [row(i, f"South West Coast Path Stage {i}", 12 + i % 5,
                  top_of=SWCP_REL, stage_of=SWCP_REL, ref=f"SWCP{i:02d}",
                  operator="National Trails") for i in range(1, 71)]
    walks = [row(100 + i, f"Moor Walk {i}", 8, lat=51.0 + i * 0.4,
                 lon=-3.0 + i * 0.4) for i in range(10)]
    rows = stages + walks
    assert curate.series_key(stages[0]) is not None
    quotas = {"GBK30": 5}
    picked, _, _ = curate.select_country(rows, 20, quotas, floor=0)
    got = [r for r in picked if r.get("pick_reason") == "reference-stage"]
    assert len(got) == curate.STAGES_MAX
    assert len(got) > curate.SERIES_CAP
    assert {r["reference"] for r in got} == {"wd:Q1"}
