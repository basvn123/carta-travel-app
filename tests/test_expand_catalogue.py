"""T155: batched catalogue expansion (trips spec D2), with stubs and no network.

    python -m pytest tests/test_expand_catalogue.py -q

The flow runs on a scratch copy of the dataset (expand_catalogue._scratch_root:
the real master without its Austria cycling trips, so the T143 example trip
fills a gap). Nothing is written to the real data folder.
"""

import copy
import json
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "Trips" / "carta-unified" / "carta-unified"
sys.path.insert(0, str(DATASET / "pipeline"))

import expand_catalogue as X  # noqa: E402
import fill_type_specific as F  # noqa: E402
import generate_trip as T  # noqa: E402
import generation_gate as G  # noqa: E402
import review_queue as R  # noqa: E402


def quiet(*_a, **_k):
    pass


@pytest.fixture(scope="module")
def example():
    return json.loads(Path(G.EXAMPLE_PATH).read_text(encoding="utf-8"))


@pytest.fixture()
def scratch(tmp_path):
    return X._scratch_root(str(tmp_path))


def planned(paths, today="2026-10-03"):
    plan = X.make_plan(paths, "western-central", 1, cells=["AT:cycling"], today=today)
    X._write_json(os.path.join(paths.plans, f"{plan['batch']}.json"), plan)
    return plan


def run(paths, plan, example, bodies=None):
    stub = T.StubClient(bodies or T.fixture_bodies(example))
    status = X.run_batch(plan, stub, paths, today=example["provenance"]["ingestedAt"], log=quiet)
    return status[plan["entries"][0]["brief"]["key"]]


# ── slots and plans on the real catalogue (read only) ────────────────────────

def real_without_plans(tmp_path):
    """The real catalogue, with an empty plan folder so the counts do not
    depend on which waves are already planned."""
    paths = X.Paths()
    paths.plans = str(tmp_path)
    return paths


def test_slots_match_the_gap_matrix(tmp_path):
    s = X.slots_summary(real_without_plans(tmp_path))
    assert s["trips"] == 253
    assert s["fill"] == 139                      # the gap matrix's fillable gaps
    assert sum(r["blocked"] for r in s["regions"].values()) == 20
    assert s["planned"] == 0
    assert s["projectedTrips"] == s["trips"] + s["fill"] + s["deepen"]


def test_the_committed_wave_one_plans_are_runnable():
    files = X.plan_files(X.Paths())
    assert files, "no plan files in expansion/"
    cells = set()
    for path in files:
        plan = X.load_plan(path)
        for e in plan["entries"]:
            cell = (e["brief"]["countryCode"], e["brief"]["tripTypeSlug"])
            assert cell not in cells
            cells.add(cell)


@pytest.mark.parametrize("mode", ["fill", "deepen"])
def test_every_planned_brief_is_runnable_and_has_no_figure(mode, tmp_path):
    for region in X.REGION_KEYS:
        plan = X.make_plan(real_without_plans(tmp_path), region, 99, mode=mode, size=500)
        assert X.plan_problems(plan) == []
        for e in plan["entries"]:
            b = e["brief"]
            assert b["batch"] == f"{region}-g99"
            assert not any(ch.isdigit() for ch in b["idea"])
            assert not any(ord(ch) in (0x2014, 0x2013, 0xB7) for ch in json.dumps(b, ensure_ascii=False))
            assert X.C.COUNTRY_REGION[b["countryCode"]] == region
            if mode == "deepen":
                assert b["differentFrom"]


def test_a_blocked_cell_or_a_foreign_country_cannot_be_planned(scratch):
    plan = planned(scratch)
    bad = copy.deepcopy(plan)
    bad["entries"][0]["brief"].update(countryCode="NL", tripTypeSlug="winter-sports")
    assert any("blocked" in e for e in X.plan_problems(bad))
    bad["entries"][0]["brief"].update(countryCode="GR", tripTypeSlug="city")
    assert any("not in western-central" in e for e in X.plan_problems(bad))


def test_a_cell_is_planned_once(scratch):
    planned(scratch)
    with pytest.raises(SystemExit):
        X.make_plan(scratch, "western-central", 1)
    nxt = X.make_plan(scratch, "western-central", 2, size=500)
    assert ("AT", "cycling") not in {(e["brief"]["countryCode"], e["brief"]["tripTypeSlug"]) for e in nxt["entries"]}


# ── run, check, promote, join, retract on the scratch copy ───────────────────

def test_a_stub_batch_goes_all_the_way_and_back(scratch, example):
    before = {p: Path(p).read_bytes() for p in (scratch.master, scratch.csv)}
    plan = planned(scratch)
    st = run(scratch, plan, example)
    assert st["ok"] and st["perishableFlags"] > 0
    rec = json.loads(Path(scratch.admitted, f"{st['id']}.json").read_text(encoding="utf-8"))
    assert rec["provenance"]["batch"] == "western-central-g1"
    assert rec["dataVintage"] == int(rec["provenance"]["ingestedAt"][:4])
    assert X.unflagged(rec) == [] and G.check(rec) == []

    row = X.check_batch(plan, scratch)[0]
    assert row["state"] == "held" and any(p.startswith("review:") for p in row["problems"])
    assert X.close_clean(plan, scratch, "tester", today="2026-10-04") == [st["id"]]
    row = X.check_batch(plan, scratch)[0]
    assert row["state"] == "ready", row["problems"]

    _res, done = X.promote(plan, scratch, write=True)
    assert done == [st["id"]]
    prom = json.loads(Path(scratch.expansion, f"{st['id']}.json").read_text(encoding="utf-8"))
    assert prom["provenance"]["reviewedAt"] == "2026-10-04"
    for suffix in (".evidence.json", ".critique.json", ".review.json"):
        assert Path(scratch.expansion, st["id"] + suffix).is_file()

    j = X.join(scratch, write=True)
    master = json.loads(Path(scratch.master).read_text(encoding="utf-8"))
    assert j["added"] == [st["id"]]
    assert master["tripCount"] == len(master["trips"])
    assert master["regions"]["western-central-g1"] == 1
    assert Path(scratch.trips, f"{st['id']}.json").is_file()
    assert X.join(scratch)["added"] == []           # idempotent
    assert X.check_batch(plan, scratch)[0]["state"] == "promoted"

    X.retract("western-central-g1", scratch, write=True)
    assert all(Path(p).read_bytes() == b for p, b in before.items())
    assert not Path(scratch.trips, f"{st['id']}.json").exists()


def test_a_rerun_leaves_an_admitted_trip_alone(scratch, example):
    plan = planned(scratch)
    first = run(scratch, plan, example)
    client = T.StubClient({})
    status = X.run_batch(plan, client, scratch, today="2026-10-03", log=quiet)
    assert client.calls == [] and status[plan["entries"][0]["brief"]["key"]] == first


def test_a_trip_over_the_flag_cap_is_moved_out_of_admitted(scratch, example, monkeypatch):
    plan = planned(scratch)
    monkeypatch.setattr(X, "flag_cap", lambda: 3)
    st = run(scratch, plan, example)
    assert not st["ok"] and st["stage"] == "flags"
    assert not any(n.endswith(".json") for n in os.listdir(scratch.admitted))
    assert any(n.endswith(".errors.txt") for n in os.listdir(scratch.rejected))


def test_a_live_run_needs_a_cap(scratch, example):
    plan = planned(scratch)
    with pytest.raises(SystemExit):
        X.run_batch(plan, T.StubClient({}), scratch, live=True, log=quiet)


def test_a_dispute_left_out_of_the_flags_holds_the_trip(scratch, example):
    plan = planned(scratch)
    bodies = T.fixture_bodies(example)
    dispute = {"path": "itinerary[3].dayStats.ascentM", "kind": "terrain", "severity": "high", "quote": "290",
               "reason": "Test dispute: the climb does not fit a riverside day.", "url": None}
    bodies["critic"] = T.critic_body(T.fixture_critique([dispute]))
    st = run(scratch, plan, example, bodies)
    assert st["ok"]
    path = Path(scratch.admitted, f"{st['id']}.json")
    rec = json.loads(path.read_text(encoding="utf-8"))
    rec["verifyFlags"] = [f for f in rec["verifyFlags"] if not f.startswith("Disputed")]
    rec["verifyFlagCount"] = len(rec["verifyFlags"])
    path.write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8")
    problems = X.check_batch(plan, scratch)[0]["problems"]
    assert any(p.startswith("critic:") for p in problems)
    assert any(p.startswith("review:") for p in problems)     # the dispute is an open queue item


def test_stale_prompts_and_a_missing_flag_hold_the_trip(scratch, example):
    plan = planned(scratch)
    st = run(scratch, plan, example)
    rec = json.loads(Path(scratch.admitted, f"{st['id']}.json").read_text(encoding="utf-8"))
    ctx = {"places": None, "curatedIds": set(), "admittedDir": scratch.admitted,
           "promptVersion": T.prompt_version(), "cells": {}, "queue": {}, "batchRecords": []}
    stale = copy.deepcopy(rec)
    stale["provenance"]["promptVersion"] = "k2-0.0.0-k4-0"
    assert any("regenerate" in p for p in X.promotion_problems(stale, plan["entries"][0], plan, ctx))
    gap = copy.deepcopy(rec)
    gap["verifyFlags"] = [f for f in gap["verifyFlags"] if not f.startswith("Recheck price at budget")]
    gap["verifyFlagCount"] = len(gap["verifyFlags"])
    assert any(p.startswith("flags:") for p in X.promotion_problems(gap, plan["entries"][0], plan, ctx))


def test_the_example_trip_is_a_copy_of_the_curated_donauradweg(example):
    real = json.loads(Path(X.Paths().master).read_text(encoding="utf-8"))
    by_id = {t["id"]: t for t in real["trips"]}
    assert X.near_copy(example, by_id["at-cycling-donauradweg-wachau"])
    other = next(t for t in real["trips"] if t["tripTypeSlug"] == "city" and t["countryCode"] == "AT")
    assert X.near_copy(example, other) is None


def test_the_expansion_folder_refuses_an_unreviewed_record(tmp_path, example):
    rec = copy.deepcopy(example)
    rec["provenance"]["batch"] = "western-central-g1"
    (tmp_path / f"{rec['id']}.json").write_text(json.dumps(rec), encoding="utf-8")
    (tmp_path / f"{rec['id']}.evidence.json").write_text("{}", encoding="utf-8")
    recs, errors = X.load_expansion(str(tmp_path))
    assert recs == [] and len(errors) == 1 and "reviewedAt" in errors[0]
    rec["provenance"]["reviewedAt"] = "2026-10-04"
    (tmp_path / f"{rec['id']}.json").write_text(json.dumps(rec), encoding="utf-8")
    recs, errors = X.load_expansion(str(tmp_path))
    assert [r["id"] for r in recs] == [rec["id"]] and errors == []


def test_build_joins_the_expansion_folder_after_the_batches(tmp_path, example, monkeypatch):
    import build
    rec = copy.deepcopy(example)
    rec["provenance"].update(batch="western-central-g1", reviewedAt="2026-10-04")
    exp = tmp_path / "expansion"
    exp.mkdir()
    (exp / f"{rec['id']}.json").write_text(json.dumps(rec), encoding="utf-8")
    (exp / f"{rec['id']}.critique.json").write_text("{}", encoding="utf-8")
    out = tmp_path / "out"
    none = tmp_path / "no-raw"
    monkeypatch.setattr(sys, "argv", ["build.py", "--raw", str(none), "--northern", str(none / "n.md"),
                                      "--out", str(out), "--expansion", str(exp)])
    assert build.main() == 1                       # the four raw batches are missing here
    master = json.loads((out / "trips.master.json").read_text(encoding="utf-8"))
    assert [t["id"] for t in master["trips"]] == [rec["id"]]
    assert master["regions"] == {"western-central-g1": 1}


def test_the_type_specific_filler_leaves_generated_trips_alone(example):
    basis, rows = F.build({"trips": [example]})
    assert rows == {} and basis == {}


@pytest.mark.parametrize("text,want", [
    ("The abbey is closed on Mondays and opens at 9:30.", True),
    ("Huts open from late June to mid September.", True),
    ("Last ferry back at 18:15.", True),
    ("The valley opens out into open meadows.", False),
    ("Close to the station, a quiet guesthouse.", False),
    ("An open-air museum of farmhouses.", False),
])
def test_opening_time_detection(text, want):
    assert bool(X.opening_quote(text)) is want


def test_booking_window_detection():
    assert X.BOOK_RE.search("Book the hut two months ahead.")
    assert X.BOOK_RE.search("The campsite fills up in August.")
    assert not X.BOOK_RE.search("Book through the website.")


def test_flags_are_one_per_field_and_within_the_contract(example):
    rec, errors, added = X.add_perishable_flags(example)
    assert errors == [] and added == len(rec["verifyFlags"]) - len(example["verifyFlags"])
    assert len(set(rec["verifyFlags"])) == len(rec["verifyFlags"])
    assert all(5 <= len(f) <= 200 for f in rec["verifyFlags"])
    again, _e, added2 = X.add_perishable_flags(rec)
    assert added2 == 0 and again == rec


def test_self_test_passes():
    assert X.self_test() == 0


def test_review_queue_sees_the_flagged_record(scratch, example):
    plan = planned(scratch)
    st = run(scratch, plan, example)
    q = R.build_queue(scratch.admitted, scratch.master)
    assert [t["id"] for t in q["trips"]] == [st["id"]]
