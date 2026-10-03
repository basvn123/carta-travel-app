"""T154: the flag-only review queue (spec K7), with stubs and no network.

    python -m pytest tests/test_review_queue.py -q

Records come from a real generate_trip.generate() stub run, so the queue is
tested against the sidecars the generator actually writes.
"""

import copy
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "Trips" / "carta-unified" / "carta-unified"
sys.path.insert(0, str(DATASET / "pipeline"))

import generate_trip as T  # noqa: E402
import generation_gate as G  # noqa: E402
import review_queue as R  # noqa: E402


@pytest.fixture(scope="module")
def example():
    return json.loads(Path(G.EXAMPLE_PATH).read_text(encoding="utf-8"))


@pytest.fixture()
def master(tmp_path):
    p = tmp_path / "master.json"
    p.write_text(json.dumps({"trips": [
        {"countryCode": T.FIXTURE_BRIEF["countryCode"], "tripTypeSlug": T.FIXTURE_BRIEF["tripTypeSlug"],
         "provenance": {"batch": "x"}, "sources": {"confidenceNotes": None}}]}), encoding="utf-8")
    return str(p)


def generate(tmp_path, example, disputes=()):
    b = T.fixture_bodies(example)
    b["critic"] = T.critic_body(T.fixture_critique(disputes), ())
    res = T.generate({**T.FIXTURE_BRIEF, "key": "rq"}, T.StubClient(b), str(tmp_path / "out"))
    assert res["ok"], res["errors"]
    return str(tmp_path / "out" / "admitted"), res["id"]


def dispute(**kw):
    d = {"path": "itinerary[3].dayStats.ascentM", "kind": "terrain", "severity": "medium",
         "quote": "290", "reason": "Test dispute: the climb is more than this riverside day allows.", "url": None}
    d.update(kw)
    return d


def test_a_generated_trip_with_no_dispute_is_not_queued(tmp_path, example, master):
    folder, _ = generate(tmp_path, example)
    q = R.build_queue(folder, master)
    assert q["summary"]["tripsClean"] == 1 and q["summary"]["openItems"] == 0


def test_a_critic_dispute_is_the_queue_and_the_sidecars_are_not_records(tmp_path, example, master):
    folder, tid = generate(tmp_path, example, [dispute()])
    assert len(R.record_files(folder)) == 1
    t = R.build_queue(folder, master)["trips"][0]
    assert [(i["path"], i["kind"]) for i in t["items"]] == [("itinerary[3].dayStats.ascentM", "terrain")]
    assert t["fieldsToRead"] == 1 < t["fieldsInRecord"]


def test_verdicts_close_a_trip_and_a_regeneration_reopens_it(tmp_path, example, master):
    folder, tid = generate(tmp_path, example, [dispute()])
    key = "itinerary[3].dayStats.ascentM#terrain"
    with pytest.raises(SystemExit):
        R.cmd_close(folder, tid, "me", master=master)
    with pytest.raises(SystemExit):
        R.cmd_verdict(folder, tid, key, "dismissed", "  ", "me", master=master)
    with pytest.raises(SystemExit):
        R.cmd_verdict(folder, tid, "nope#terrain", "dismissed", "x", "me", master=master)
    R.cmd_verdict(folder, tid, key, "upheld", "the day does climb 600 m; fixed in the source", "me", today="2026-10-03", master=master)
    assert R.build_queue(folder, master)["summary"]["openItems"] == 0
    R.cmd_close(folder, tid, "me", today="2026-10-03", master=master)
    assert R.build_queue(folder, master)["trips"][0]["closed"]
    rec_path = Path(folder) / f"{tid}.json"
    rec = json.loads(rec_path.read_text(encoding="utf-8"))
    rec["title"] += " again"
    rec_path.write_text(json.dumps(rec), encoding="utf-8")
    t = R.build_queue(folder, master)["trips"][0]
    assert t["open"] == 1 and t["staleVerdicts"] and not t["closed"]


def test_a_new_country_reads_the_whole_record_once_then_stops(tmp_path, example):
    folder, tid = generate(tmp_path, example)
    empty = tmp_path / "empty.json"
    empty.write_text(json.dumps({"trips": []}), encoding="utf-8")
    t = R.build_queue(folder, str(empty))["trips"][0]
    assert {"new-country", "new-style"} <= {i["kind"] for i in t["items"]}
    assert t["fieldsToRead"] == t["fieldsInRecord"]
    for i in t["items"]:
        R.cmd_verdict(folder, tid, i["key"], "accepted", "read the whole record, it is sound", "me", master=str(empty))
    R.cmd_close(folder, tid, "me", master=str(empty))
    # a second trip of the same country and style in the folder is no longer a first
    (tmp_path / "out" / "admitted" / "other.json").write_text(
        json.dumps({**json.loads((Path(folder) / f"{tid}.json").read_text(encoding="utf-8")), "id": "other"}),
        encoding="utf-8")
    other = next(t for t in R.build_queue(folder, str(empty))["trips"] if t["id"] == "other")
    assert not any(i["kind"] in ("new-country", "new-style") for i in other["items"])


def test_an_estimated_figure_over_the_threshold_is_queued_and_a_distance_is_not(example):
    ev = {"figures": [
        {"path": "budget.breakdown.food", "value": {"lowEur": 100, "highEur": R.ESTIMATE_MIN_EUR}, "status": "sourced",
         "sourceUrl": "https://e.org", "basis": "an estimate for a typical week"},
        {"path": "budget.breakdown.food", "value": {"lowEur": 10, "highEur": 20}, "status": "sourced", "basis": "estimate"},
        {"path": "itinerary[1].dayStats.distanceKm", "value": 900, "status": "sourced", "basis": "approximately"},
        {"path": "accommodationStrategy[0].priceEur", "value": 300, "status": "sourced", "basis": "the hotel lists 300"}]}
    items = R.items_for(example, ev, None, {example["countryCode"]}, {example["tripTypeSlug"]})
    assert [(i["path"], i["kind"]) for i in items] == [("budget.breakdown.food", "estimated")]


def test_confidence_notes_is_required_by_the_schema_and_the_queue(example):
    assert not G.schema_errors(example)
    for bad in (None, "", "n/a", "too short to say anything"):
        rec = copy.deepcopy(example)
        rec["sources"]["confidenceNotes"] = bad
        assert G.schema_errors(rec), bad
        assert R.notes_problem(rec)
    rec = copy.deepcopy(example)
    rec["sources"]["confidenceNotes"] = None
    items = R.items_for(rec, None, None, {rec["countryCode"]}, {rec["tripTypeSlug"]})
    assert [i["kind"] for i in items] == ["notes"]


def test_notes_report_counts_the_catalogue_backlog(tmp_path):
    r = R.notes_report(str(tmp_path / "none"))
    assert r["catalogue"]["trips"] == 253 and r["catalogue"]["missing"] == 130
