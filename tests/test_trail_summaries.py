"""T1179 (ROADMAP D24): trail summaries from each trail's own facts.

The fixture is the published wire of 2026-09-13 cut to the fields
summaries.facts_of() reads: AT 20050, stage 15 of the BergeSeen Trail, whose
OSM roundtrip tag says loop while its ends sit 262 m apart.

The last test is the fact-match run over the committed output: every
summary in data/trails/summaries.json is rebuilt from the shipped wire and
must equal it and pass check(). It is skipped where the wire is absent.

Pure functions only: no lab, no network.
    python -m pytest tests/test_trail_summaries.py -q
"""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import summaries  # noqa: E402

ROW = {
    "id": 20050, "country": "AT", "category": "hike",
    "distance_m": 16419, "ascent_m": 985, "descent_m": 1248,
    "duration_min": 470, "is_loop": True,
    "ele": {"min": 511.7, "max": 1543.8, "start": 774.4, "end": 512.1},
    "sf": {"paved": 0.15, "gravel": 0.253, "path": 0.23, "other": 0.011,
           "unknown": 0.354},
    "h": {"cls": "stage", "of": "BergeSeen Trail", "top": "BergeSeen Trail",
          "i": 15, "n": None},
    "f": {"g": "hard", "rt": "loop",
          "se": {"n": 5, "to": "oct", "est": True, "from": "jun"}},
    "v5": {"band": "exceptional"},
}
DETAIL = {
    "grade_parts": {"sac_worst": "demanding_mountain_hiking",
                    "sac_worst_share": 0.1618},
    "passes": [{"m": 100, "name": "Hallstatt"},
               {"m": 100, "name": "Hallstatt-Dachstein Salzkammergut cultural landscape"}],
    "tags_raw": {"roundtrip": "yes"},
    "highlights": [
        {"kind": "lake", "name": "Löckersee", "ele_m": None, "along_m": 3760},
        {"kind": "cave", "name": "Wildfrauenloch", "ele_m": None, "along_m": 4991},
        {"kind": "peak", "name": "Hohe Scheibe", "ele_m": 1659, "along_m": 8614},
        {"kind": "viewpoint", "name": "Welterbe-Blick", "ele_m": None, "along_m": 15048},
        {"kind": "lighthouse", "name": "Gale Warning Burgau Iso Y 2s", "along_m": 15100},
    ],
}

EXPECTED = (
    "Stage 15 of the BergeSeen Trail. A 16.4 km walk with 985 m of climbing, "
    "about 7 h 50 min of walking. It tops out at 1,544 m, with steep mountain "
    "paths in places. On the way: the lake Löckersee and the cave "
    "Wildfrauenloch. It passes below the peak Hohe Scheibe (1,659 m). Usually "
    "clear of snow from June to October."
)


def summary_of(row=ROW, detail=DETAIL):
    facts = summaries.facts_of(row, detail)
    text, _parts = summaries.compose(facts)
    return text, facts


def test_fixture_reads_as_expected_and_passes():
    text, facts = summary_of()
    assert text == EXPECTED
    assert summaries.check(text, facts) == []


def test_loop_not_claimed_when_the_ends_disagree():
    _, facts = summary_of()
    assert "shape" not in facts
    flat = {**ROW, "ele": {**ROW["ele"], "end": 770.0}}
    text, facts = summary_of(flat)
    assert facts["shape"] == "loop" and "km loop" in text


def test_peak_above_the_line_is_beside_it():
    _, facts = summary_of()
    hohe = next(s for s in facts["sights"] if s["name"] == "Hohe Scheibe")
    assert hohe["beside"] is True


def test_navigation_light_is_not_a_sight():
    _, facts = summary_of()
    assert all("Iso" not in s["name"] for s in facts["sights"])


def test_climb_is_read_uphill_like_the_app():
    # trailStory.js trailClimb: stored downhill by 300 m or more and at
    # least twice the ascent, the page prints the descent as the climb.
    up, down = summaries.climb_up({"ascent_m": 120, "descent_m": 900})
    assert (up, down) == (900, 120)
    assert summaries.climb_up({"ascent_m": 985, "descent_m": 1248}) == (985, 1248)


def test_article_follows_the_spoken_number():
    assert summaries.article("8.6") == "an"
    assert summaries.article("11.7") == "an"
    assert summaries.article("18") == "an"
    assert summaries.article("16.4") == "a"
    assert summaries.article("110") == "a"


def test_from_and_to_only_on_a_one_way_walk():
    row = {**ROW, "is_loop": False, "f": {**ROW["f"], "rt": "point"}}
    detail = {**DETAIL, "tags_raw": {"from": "Vic", "to": "Olot"}}
    text, facts = summary_of(row, detail)
    assert "from Vic to Olot" in text
    assert summaries.check(text, facts) == []


def test_multi_day_walk_says_hours_and_days():
    row = {**ROW, "distance_m": 92400, "ascent_m": 3764, "descent_m": 3764,
           "duration_min": 1991, "h": None}
    text, facts = summary_of(row)
    assert facts["days"] >= 2
    assert f"over {facts['days']} days" in text
    assert summaries.check(text, facts) == []


@pytest.mark.parametrize("bad, reason", [
    (EXPECTED.replace("Hohe Scheibe", "Dachstein"), "unknown word Dachstein"),
    (EXPECTED.replace("985 m", "958 m"), "number 958 not in facts"),
    (EXPECTED.replace("October", "November"), "month November not in season"),
    (EXPECTED.replace("km walk", "km loop"), "loop claimed"),
    (EXPECTED.replace(". A 16.4", ", a 16.4").replace("Trail,", "Trail \u2013"), "dash"),
    (EXPECTED.replace("Usually clear", "Usually easy and clear"), "banned word easy"),
    (EXPECTED.replace("the lake", "the stunning lake"), "banned word stunning"),
    (EXPECTED.replace("with steep mountain paths in places", "mostly on footpaths"),
     "footpaths claimed"),
    (EXPECTED.rstrip("."), "no full stop"),
    (EXPECTED + " " + EXPECTED, "length"),
])
def test_check_catches_what_the_facts_do_not_hold(bad, reason):
    _, facts = summary_of()
    found = summaries.check(bad, facts)
    assert any(f.startswith(reason) for f in found), found


def test_season_claim_needs_a_season():
    row = {**ROW, "f": {"rt": "loop"}}
    _, facts = summary_of(row)
    assert summaries.check(EXPECTED, facts)


def test_long_text_drops_the_least_needed_clause_first():
    facts = summaries.facts_of(ROW, DETAIL)
    _, parts = summaries.compose(facts)
    codes = [p["c"] for p in parts]
    # Hallstatt is in the facts, but the walk's text is over MAX_CHARS with
    # it, so the passes clause goes before anything else.
    assert facts["passes"] == ["Hallstatt"]
    assert "passes" not in codes and "season" in codes


def test_module_has_no_dashes():
    src = (ROOT / "pipeline" / "trails" / "summaries.py").read_text(encoding="utf-8")
    assert "\u2013" not in src and "\u2014" not in src


OUT = ROOT / "data" / "trails" / "summaries.json"
WIRE = ROOT / "continent-app" / "public" / "trails"


@pytest.mark.skipif(not OUT.exists() or not (WIRE / "AT.json").exists(),
                    reason="summaries output or trail wire not in this checkout")
def test_every_committed_summary_matches_its_facts():
    items = json.loads(OUT.read_text(encoding="utf-8"))["items"]
    assert len(items) >= 2000
    seen = 0
    for path in sorted(WIRE.glob("[A-Z][A-Z].json")):
        wire = json.loads(path.read_text(encoding="utf-8"))
        for row in wire.get("trips") or []:
            item = items.get(str(row["id"]))
            if item is None:
                continue
            seen += 1
            detail = summaries.load_detail(WIRE, row)
            facts = summaries.facts_of(row, detail)
            assert summaries.in_top_band(row), row["id"]
            assert summaries.check(item["text"], facts) == [], row["id"]
            assert summaries.compose(facts)[0] == item["text"], row["id"]
    assert seen == len(items)


JUDGE_CASES = json.loads((ROOT / "tests" / "fixtures" / "trail_summary_judge_cases.json").read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", JUDGE_CASES, ids=[c["id"] for c in JUDGE_CASES])
def test_check_rejects_the_summaries_the_truth_judge_found_unsupported(case):
    """T1214 (register row T1144-f): the T1144 judge found these shipped summaries
    not supported by their OSM facts ("waymarked" with no symbol or ref, the DIN
    33466 hours line, raw tag figures). check() must reject each one, and the
    text compose() writes for the same walk must pass and say none of it."""
    bad = summaries.check(case["shipped_summary"], case["facts"])
    assert bad, case["id"]
    if "waymarked" in case["shipped_summary"]:
        assert "unknown word waymarked" in bad
    if "DIN 33466" in case["shipped_summary"]:
        assert "number 33466 not in facts" in bad
    text, _ = summaries.compose(case["facts"])
    assert summaries.check(text, case["facts"]) == []
    low = text.lower()
    assert "waymark" not in low and "din" not in low.split() and "33466" not in text
