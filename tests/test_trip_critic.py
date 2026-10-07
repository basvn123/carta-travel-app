"""T145: the adversarial critic (spec K4), with stubs and no network.

Runs from the repo root:

    python -m pytest tests/test_trip_critic.py -q

The critic is the fourth call generate_trip.generate() makes. These tests
pin what it is shown (the record without the writer's memory), what it must
answer (six checks, disputes that name a real field and quote it), what its
disputes become (verifyFlags, a critique file, marks on the evidence rows)
and when it does not run (a trip the gate rejects anyway). Everything is
written to pytest's tmp_path.
"""

import copy
import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "Trips" / "carta-unified" / "carta-unified"
sys.path.insert(0, str(DATASET / "pipeline"))

import generate_trip as T  # noqa: E402
import generation_gate as G  # noqa: E402


@pytest.fixture(scope="module")
def example():
    with open(G.EXAMPLE_PATH, encoding="utf-8") as fh:
        return json.load(fh)


@pytest.fixture()
def bodies(example):
    return T.fixture_bodies(example)


def dispute(**kw):
    d = {"path": "itinerary[3].dayStats.ascentM", "kind": "terrain", "severity": "medium",
         "quote": "290", "reason": "Test dispute: the climb is more than this riverside day allows.",
         "url": None}
    d.update(kw)
    return d


def run(tmp_path, bodies, disputes=(), chunks=(), key="critic-test", **kw):
    b = copy.deepcopy(bodies)
    b["critic"] = T.critic_body(T.fixture_critique(disputes), chunks)
    client = T.StubClient(b)
    res = T.generate({**T.FIXTURE_BRIEF, "key": key}, client, str(tmp_path), **kw)
    return res, client


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def test_critic_runs_on_every_admitted_trip(tmp_path, bodies):
    res, client = run(tmp_path, bodies)
    assert res["ok"], res["errors"]
    assert [c[0] for c in client.calls][-1] == "critic"
    assert res["critic"] == {"disputes": 0, "flagsAdded": 0, "flagsDropped": 0,
                             "model": "gemini-fixture", "sameModelAsWriter": True}
    crit = read(tmp_path / "admitted" / f"{res['id']}.critique.json")
    assert [c["kind"] for c in crit["checks"]] == list(T.CRITIC_KINDS)
    assert crit["promptVersion"] == "k4-1"
    assert T.prompt_version().endswith("-k4-1")
    assert read(res["path"])["provenance"]["promptVersion"] == T.prompt_version()


def test_critic_is_grounded_and_cold():
    meta, body = T.load_prompt(4)
    assert meta["grounding"] is True and meta["temperature"] == 0.0
    assert meta["pass"] == "critic"
    for ch in (chr(0x2014), chr(0x2013), chr(0xB7)):   # em dash, en dash, middot
        assert ch not in body
    assert re.findall(r"\{\{(\w+)\}\}", body) == ["trip"]


def test_critic_prompt_shares_no_text_with_the_writer_prompts():
    """A different instruction, not the writer's rules read back to it: no run
    of eight words in the critic prompt appears in any k2 prompt."""
    def shingles(text, n=8):
        w = re.findall(r"[a-z0-9']+", text.lower())
        return {" ".join(w[i:i + n]) for i in range(len(w) - n + 1)}
    critic = shingles(T.load_prompt(4)[1])
    for n in (1, 2, 3):
        shared = critic & shingles(T.load_prompt(n)[1])
        assert not shared, (n, sorted(shared)[:3])


def test_critic_sees_no_writer_memory(tmp_path, bodies):
    res, client = run(tmp_path, bodies)
    prompt = next(c[1] for c in client.calls if c[0] == "critic")
    shown = json.loads(prompt.split("The trip:\n\n", 1)[1].split("\n\nLook for six kinds", 1)[0])
    assert not set(T.CRITIC_HIDDEN) & set(shown)
    assert shown["id"] == res["id"] and shown["itinerary"][3]["dayStats"]["ascentM"] == 290
    assert "evidence" not in prompt and "fixture page states it" not in prompt
    for n in (1, 2, 3):
        assert T.load_prompt(n)[1].strip()[:80] not in prompt


def test_disputes_become_verify_flags(tmp_path, bodies):
    ds = [dispute(severity="low", kind="contradiction", reason="Test: low first in the answer, last in the flags."),
          dispute(path="accommodationStrategy[1].name", kind="existence", severity="high",
                  quote="Gasthof Sänger Blondel", reason="Test: no such house is listed in Dürnstein today.",
                  url="https://example.org/closed")]
    res, _ = run(tmp_path, bodies, ds, chunks=[("https://example.org/closed", "example.org")])
    assert res["ok"], res["errors"]
    rec = read(res["path"])
    disputed = [f for f in rec["verifyFlags"] if f.startswith("Disputed ")]
    assert disputed == [
        "Disputed accommodationStrategy[1].name, high existence: Test: no such house is listed in Dürnstein today.",
        "Disputed itinerary[3].dayStats.ascentM, low contradiction: Test: low first in the answer, last in the flags.",
    ]
    # T093: the climb dispute lands on its ledger row and is the one figure
    # to check; a stay's name is not a figure. Nothing disputed is a price.
    row = next(f for f in rec["figures"] if f["path"] == "itinerary[3].dayStats.ascentM")
    assert row["flag"] == disputed[1]
    assert rec["verifyFlagCount"] == 1 and rec["volatilePricing"] is False
    assert not G.check(rec)
    crit = read(tmp_path / "admitted" / f"{rec['id']}.critique.json")
    assert [d["urlRead"] for d in crit["disputes"]] == [True, False]
    assert crit["flagsAdded"] == 2 and res["critic"]["disputes"] == 2
    side = read(tmp_path / "admitted" / f"{rec['id']}.evidence.json")
    marked = {r["path"]: r.get("disputes") for r in side["figures"]}
    assert marked["itinerary[3].dayStats.ascentM"][0]["kind"] == "contradiction"
    assert marked["itinerary[2].dayStats.ascentM"] is None
    # A disputed figure stays in the record: the critic flags, it does not withhold.
    assert rec["itinerary"][3]["dayStats"]["ascentM"] == 290


def test_withheld_flags_come_first(tmp_path, bodies):
    frag, _ = T.parse_json(T.response_text(bodies["pass3"]))
    for row in frag["evidence"]:
        if row["path"] == "itinerary[0].dayStats.ascentM":
            row["url"] = "https://made-up.example/never-read"
    bodies["pass3"]["candidates"][0]["content"]["parts"][0]["text"] = json.dumps(frag)
    titles = [d["title"] for d in read(G.EXAMPLE_PATH)["itinerary"]]
    ds = [dispute(path=f"itinerary[{day}].title", kind=kind, quote=titles[day][:20],
                  reason=f"Test dispute on day {day + 1}, kind {kind}.")
          for day in range(5) for kind in T.CRITIC_KINDS]
    assert len(ds) == T.CRITIC_MAX_DISPUTES
    res, _ = run(tmp_path, bodies, ds)
    assert res["ok"], res["errors"]
    rec = read(res["path"])
    assert rec["verifyFlags"][0].startswith("Withheld itinerary[0].dayStats.ascentM")
    assert len(rec["verifyFlags"]) == 1 + T.CRITIC_MAX_DISPUTES


def test_the_contract_cap_of_forty_holds():
    fields = {"verifyFlags": [f"Withheld figure number {i}" for i in range(35)]}
    crit = T.fixture_critique([dispute(path=f"itinerary[{i}].title", reason=f"Test dispute number {i} here.")
                               for i in range(7)])
    out, disputes, dropped = T.apply_critique(fields, [], crit, [])
    assert len(out["verifyFlags"]) == 40 and dropped == 2
    assert out["verifyFlags"][:35] == fields["verifyFlags"]
    assert len(disputes) == 7, "the critique file keeps every dispute"


def test_flag_text_fits_the_contract():
    long = dispute(path="accommodationStrategy[2].priceNote", reason="x" * 180)
    flag = T.dispute_flag(long)
    assert len(flag) <= 200 and flag.endswith("...")
    assert len(T.dispute_flag(dispute())) <= 200


@pytest.mark.parametrize("bad, code", [
    (dispute(path="itinerary[3].dayStats.climbM"), "critic-path"),
    (dispute(path="itinerary[9].dayStats.ascentM"), "critic-path"),
    (dispute(path="itinerary.3.ascentM"), "critic-path"),
    (dispute(path="itinerary[3].dayStats.descentM", quote="200"), "critic-null"),
    (dispute(quote="1200"), "critic-quote"),
    (dispute(path="accommodationStrategy[1].name", quote="Hotel Imaginary"), "critic-quote"),
])
def test_invented_disputes_reject_the_critique(tmp_path, bodies, bad, code):
    res, client = run(tmp_path, bodies, [bad])
    assert not res["ok"] and res["stage"] == "critic"
    assert any(e.startswith(f"critic-failed: {code}") for e in res["errors"]), res["errors"]
    assert [c[0] for c in client.calls].count("critic") == 2, "retried once with the errors"
    assert "failed these checks" in client.calls[-1][1]
    assert not (tmp_path / "admitted").exists()
    assert list((tmp_path / "rejected").glob("*.critic.txt"))


def test_a_critique_must_cover_every_kind(example):
    thin = T.fixture_critique()
    thin["checks"][5] = {"kind": "terrain", "looked": "looked at terrain twice"}
    assert any(e.startswith("critic-checks") for e in T.pass_errors(4, thin))
    short = T.fixture_critique()
    short["checks"] = short["checks"][:5]
    assert any("minItems" in e or "critic-checks" in e for e in T.pass_errors(4, short))
    twice = T.fixture_critique([dispute(), dispute(reason="Test: the same field and kind again here.")])
    assert any(e.startswith("critic-duplicate") for e in T.pass_errors(4, twice))
    dashed = T.fixture_critique([dispute(reason="Test: climb is 290 m " + chr(0x2014) + " too much for a river day.")])
    assert any("pattern" in e for e in T.pass_errors(4, dashed))
    assert T.pass_errors(4, T.fixture_critique([dispute()])) == []


def test_quote_matching():
    assert T.quote_matches("290", 290)
    assert T.quote_matches("120 to 170", {"low": 120, "high": 170})
    assert not T.quote_matches("120 to 190", {"low": 120, "high": 170})
    assert T.quote_matches("  blue abbey TOWER ", "A house behind the blue abbey tower, with a courtyard.")
    assert not T.quote_matches("red abbey tower", "A house behind the blue abbey tower.")
    assert not T.quote_matches("null", None)


def test_no_critic_call_on_a_trip_the_gate_rejects(tmp_path, bodies):
    frag, _ = T.parse_json(T.response_text(bodies["pass3"]))
    frag["evidence"] = [r for r in frag["evidence"] if r["path"] != "budget.breakdown.food"]
    bodies["pass3"]["candidates"][0]["content"]["parts"][0]["text"] = json.dumps(frag)
    res, client = run(tmp_path, bodies)
    assert not res["ok"] and res["stage"] == "gate"
    assert "critic" not in [c[0] for c in client.calls]
    assert res["critic"] is None and not list(tmp_path.rglob("*.critique.json"))


def test_critique_is_cached_and_follows_the_record(tmp_path, bodies, example):
    today = example["provenance"]["ingestedAt"]
    res, _ = run(tmp_path, bodies, today=today)
    assert res["ok"]
    replay = T.StubClient({})
    again = T.generate({**T.FIXTURE_BRIEF, "key": "critic-test"}, replay, str(tmp_path), today=today)
    assert again["ok"] and replay.calls == []
    # A change to the record the critic is shown (here the data vintage, a
    # new year) asks the critic again; the three writing passes stay cached.
    res2, client = run(tmp_path, bodies, today="2027-01-15")
    assert res2["ok"]
    assert [c[0] for c in client.calls] == ["critic"]


def test_critic_can_run_on_its_own_client(tmp_path, bodies):
    writer = T.StubClient({k: v for k, v in bodies.items() if k != "critic"})
    critic_answer = T.critic_body(T.fixture_critique())
    critic_answer["modelVersion"] = "gemini-critic-fixture"
    critic = T.StubClient({"critic": critic_answer})
    res = T.generate(T.FIXTURE_BRIEF, writer, str(tmp_path), critic_client=critic)
    assert res["ok"], res["errors"]
    assert "critic" not in [c[0] for c in writer.calls]
    assert [c[0] for c in critic.calls] == ["critic"]
    assert res["critic"]["model"] == "gemini-critic-fixture" and not res["critic"]["sameModelAsWriter"]
