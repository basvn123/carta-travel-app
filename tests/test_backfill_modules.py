"""T150: the packing and risk backfill, with stubs and no network.

Runs from the repo root:

    python -m pytest tests/test_backfill_modules.py -q

Output goes to pytest's tmp_path. The answers are backfill_modules.fixture_modules(),
written for the T143 example record. One test reads the real data/trips folder
(read only) to pin that every published trip yields a complete prompt.
"""

import copy
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "Trips" / "carta-unified" / "carta-unified"
sys.path.insert(0, str(DATASET / "pipeline"))

import backfill_modules as B  # noqa: E402
import generate_trip as T  # noqa: E402
import generation_gate as G  # noqa: E402


@pytest.fixture(scope="module")
def example():
    with open(G.EXAMPLE_PATH, encoding="utf-8") as fh:
        return json.load(fh)


@pytest.fixture()
def good():
    return B.fixture_modules()


def test_self_test_passes():
    assert B.self_test() == 0


def test_schema_is_the_contracts_own(good):
    s = B.module_schema()
    full = G.model_schema()["properties"]
    assert s["properties"]["packingNotes"] == full["packingNotes"]
    assert s["properties"]["whatCouldGoWrong"] == full["whatCouldGoWrong"]
    assert set(s["properties"]["packingNotes"]["items"]["properties"]) == {"icon", "item", "whyThisTrip"}
    assert set(s["properties"]["whatCouldGoWrong"]["items"]["properties"]) == {
        "severity", "trigger", "consequence", "whatToDo"}


def test_prompt_names_no_icon_outside_the_contract():
    # the prompt tells the model to use the schema's icon keys; it must not carry its own list
    _, body = B.load_prompt()
    for key in B.icon_keys():
        if key in ("other",):
            continue
        assert f'"{key}"' not in body


def test_good_answer_passes(example, good):
    assert B.module_errors(good, example) == []


@pytest.mark.parametrize("name,fn,want", B._mutations(B.fixture_modules()), ids=lambda x: x if isinstance(x, str) else "")
def test_bad_answers_are_rejected(example, good, name, fn, want):
    errs = B.module_errors(fn(good), example)
    assert errs and any(want in e for e in errs)


def test_common_words_do_not_anchor(example):
    # a word used by every trip cannot make a reason specific
    df = {w: 1.0 for w in B._words(B._context_text(example))}
    assert B.anchor_words(example, df) == set()
    # and a tiny corpus yields no frequencies at all, so nothing is filtered by accident
    assert B.document_frequency([example]) == {}


def test_run_writes_sidecar_and_ledger(tmp_path, example, good):
    client = T.StubClient({f"backfill:{example['id']}": [B.module_body(good)]})
    side = B.backfill_one(example, client, str(tmp_path), today="2026-10-03T00:00:00+00:00")
    assert side["provenance"]["promptVersion"] == "k10-1"
    assert side["provenance"]["reviewedAt"] is None
    on_disk = json.loads((tmp_path / f"{example['id']}.json").read_text(encoding="utf-8"))
    assert on_disk == side
    rows = (tmp_path / "ledger.jsonl").read_text(encoding="utf-8").splitlines()
    assert len(rows) == 1 and json.loads(rows[0])["pass"] == "k10"
    # no call is made on a rerun with the same prompt
    B.backfill_one(example, client, str(tmp_path))
    assert len(client.calls) == 1


def test_changed_record_changes_the_prompt_and_asks_again(tmp_path, example, good):
    client = T.StubClient({f"backfill:{example['id']}": [B.module_body(good)]})
    B.backfill_one(example, client, str(tmp_path))
    other = copy.deepcopy(example)
    other["summary"] = other["summary"] + " A new sentence about the Danube."
    B.backfill_one(other, client, str(tmp_path))
    assert len(client.calls) == 2


def test_prompt_carries_the_errors_on_retry(tmp_path, example, good):
    bad = B._mutations(good)[0][1](good)
    client = T.StubClient({f"backfill:{example['id']}": [B.module_body(bad), B.module_body(good)]})
    B.backfill_one(example, client, str(tmp_path))
    assert "figure whatCouldGoWrong[0]" in client.calls[1][1]
    assert client.calls[0][2]["grounding"] is False


def test_two_failures_reject_and_write_nothing(tmp_path, example, good):
    bad = B._mutations(good)[0][1](good)
    client = T.StubClient({f"backfill:{example['id']}": [B.module_body(bad)]})
    with pytest.raises(B.Rejected):
        B.backfill_one(example, client, str(tmp_path))
    assert not (tmp_path / f"{example['id']}.json").exists()
    assert (tmp_path / "rejected" / f"{example['id']}.errors.txt").exists()
    assert len(client.calls) == 2


def test_apply_replaces_two_keys_and_keeps_the_bytes(tmp_path, example, good):
    trips = tmp_path / "trips"
    trips.mkdir()
    rec = copy.deepcopy(example)
    rec["packingNotes"], rec["whatCouldGoWrong"] = [], []
    raw = json.dumps(rec, ensure_ascii=False, indent=2).replace("\n", "\r\n")
    (trips / f"{rec['id']}.json").write_text(raw, encoding="utf-8", newline="")
    out = tmp_path / "out"
    client = T.StubClient({f"backfill:{rec['id']}": [B.module_body(good)]})
    B.backfill_one(rec, client, str(out))
    dest = tmp_path / "dest"
    changed, skipped = B.apply_sidecars(str(trips), str(out), str(dest))
    assert changed == [rec["id"]] and skipped == [] and not dest.exists()   # dry run writes nothing
    B.apply_sidecars(str(trips), str(out), str(dest), write=True)
    new_raw = (dest / f"{rec['id']}.json").read_bytes().decode("utf-8")
    new = json.loads(new_raw)
    assert new["packingNotes"] == good["packingNotes"]
    assert "\r\n" in new_raw
    expect = copy.deepcopy(rec)
    expect["packingNotes"], expect["whatCouldGoWrong"] = good["packingNotes"], good["whatCouldGoWrong"]
    assert new == expect
    assert list(new) == list(rec)
    c = B.survey(B.load_trips(str(dest)))
    assert c["typed"] == 1 and c["emptyBoth"] == 0


def test_apply_skips_a_sidecar_that_no_longer_passes(tmp_path, example, good):
    trips = tmp_path / "trips"
    trips.mkdir()
    (trips / f"{example['id']}.json").write_text(json.dumps(example), encoding="utf-8")
    out = tmp_path / "out"
    out.mkdir()
    bad = B._mutations(good)[0][1](good)
    (out / f"{example['id']}.json").write_text(json.dumps({"id": example["id"], **bad}), encoding="utf-8")
    changed, skipped = B.apply_sidecars(str(trips), str(out), str(tmp_path / "d"), write=True)
    assert changed == [] and len(skipped) == 1 and not (tmp_path / "d").exists()


def test_every_published_trip_yields_a_complete_prompt():
    folder = Path(B.TRIPS_DIR)
    if not folder.is_dir():
        pytest.skip("data/trips is not checked out")
    trips = B.load_trips(str(folder))
    assert len(trips) == 253
    for rec in trips.values():
        p = B.build_prompt(rec)
        assert "{{" not in p and rec["title"] in p
    c = B.survey(trips)
    assert c["emptyBoth"] + c["v20Prose"] == c["trips"] - c["typed"]


def test_a_changed_schema_asks_again(tmp_path, example, good, monkeypatch):
    client = T.StubClient({f"backfill:{example['id']}": [B.module_body(good)]})
    B.backfill_one(example, client, str(tmp_path))
    real = B.module_schema
    def widened():
        s = real()
        s["properties"]["packingNotes"]["maxItems"] += 1
        return s
    monkeypatch.setattr(B, "module_schema", widened)
    B.backfill_one(example, client, str(tmp_path))
    assert len(client.calls) == 2
