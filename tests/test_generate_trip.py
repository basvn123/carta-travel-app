"""T144: the three-pass trip generator, with stubs and no network.

Runs from the repo root:

    python -m pytest tests/test_generate_trip.py -q

Everything the generator writes goes to pytest's tmp_path. The stub answers
are the T143 example record split into the three passes by
generate_trip.fixture_bodies(), so these tests also pin the split: a field
moved from one pass to another changes what the fixture answers and the
round trip through the gate says whether the record still assembles.
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


@pytest.fixture(scope="module")
def example():
    with open(G.EXAMPLE_PATH, encoding="utf-8") as fh:
        return json.load(fh)


@pytest.fixture()
def bodies(example):
    return T.fixture_bodies(example)


def _frag(body):
    frag, err = T.parse_json(T.response_text(body))
    assert err is None
    return frag


def _with_text(body, frag):
    out = copy.deepcopy(body)
    out["candidates"][0]["content"]["parts"][0]["text"] = json.dumps(frag)
    return out


def test_three_slices_cover_the_contract_once():
    covered = []
    for n in (1, 2, 3):
        covered += [p for p in T.PASS_PATHS[n]
                    if p not in ("itinerary[].day", "accommodationStrategy[].rank", "gateways[].code")]
    assert len(covered) == len(set(covered)), "a field is asked of two passes"
    for key in G.model_schema()["properties"]:
        if key in ("id", "countryCode", "tripTypeSlug"):
            continue
        assert any(p == key or p.startswith(key + ".") or p.startswith(key + "[]") for p in covered), key


def test_pass_schemas_are_valid_and_gemini_clean():
    from jsonschema import Draft202012Validator
    for n in (1, 2, 3):
        Draft202012Validator.check_schema(T.pass_schema(n))
        gem = json.dumps(T.pass_gemini_schema(n))
        for word in ('"$ref"', '"const"', '"not"', '"additionalProperties"', '"pattern"'):
            assert word not in gem, (n, word)


def test_only_pass_three_grounds():
    assert [T.load_prompt(n)[0]["grounding"] for n in (1, 2, 3)] == [False, False, True]
    assert T.load_prompt(3)[0]["temperature"] == 0.0


def test_fixture_runs_through_the_gate(tmp_path, bodies, example):
    client = T.StubClient(bodies)
    res = T.generate(T.FIXTURE_BRIEF, client, str(tmp_path), today=example["provenance"]["ingestedAt"])
    assert res["ok"], res["errors"]
    assert [c[0] for c in client.calls] == ["pass1", "pass2", "pass3"]
    rec = json.loads(Path(res["path"]).read_text(encoding="utf-8"))
    assert not G.check(rec)
    assert rec["id"] == "at-cycling-donauradweg-wachau-example"
    assert rec["budget"]["totalEur"] == example["budget"]["totalEur"]
    assert rec["budget"]["perDayEur"] == example["budget"]["perDayEur"]
    assert rec["itinerary"][4]["dayStats"]["ascentM"] == 330
    assert rec["accommodationStrategy"][1]["priceEur"] == {"low": 120, "high": 170}
    assert rec["provenance"]["promptVersion"] == T.prompt_version()
    assert rec["provenance"]["model"] == "gemini-fixture"
    side = json.loads((tmp_path / "admitted" / f"{rec['id']}.evidence.json").read_text(encoding="utf-8"))
    assert side["entityKey"] == f"trip:{rec['id']}"
    assert all(r["status"] == "sourced" for r in side["figures"])
    assert {r["class"] for r in side["figures"]} >= {"range", "price", "transport", "static"}
    assert res["figures"] == {"sourced": len(side["figures"]), "withheld": 0}


def test_rerun_replays_the_cache(tmp_path, bodies):
    T.generate(T.FIXTURE_BRIEF, T.StubClient(bodies), str(tmp_path))
    client = T.StubClient({})
    res = T.generate(T.FIXTURE_BRIEF, client, str(tmp_path))
    assert res["ok"] and client.calls == []
    res = T.generate(T.FIXTURE_BRIEF, T.StubClient(bodies), str(tmp_path), reuse=False)
    assert res["ok"]
    assert sum(1 for _ in (tmp_path / "ledger.jsonl").read_text().splitlines()) == 6


def test_unread_source_withholds_the_figure(tmp_path, bodies):
    frag = _frag(bodies["pass3"])
    for row in frag["evidence"]:
        if row["path"] == "itinerary[0].dayStats.ascentM":
            row["url"] = "https://made-up.example/never-read"
    bodies["pass3"] = _with_text(bodies["pass3"], frag)
    res = T.generate(T.FIXTURE_BRIEF, T.StubClient(bodies), str(tmp_path))
    assert res["ok"]
    rec = json.loads(Path(res["path"]).read_text(encoding="utf-8"))
    assert rec["itinerary"][0]["dayStats"]["ascentM"] is None
    assert rec["itinerary"][1]["dayStats"]["ascentM"] == 180
    assert any("itinerary[0].dayStats.ascentM" in f for f in rec["verifyFlags"])
    assert rec["volatilePricing"] is True
    assert res["figures"]["withheld"] == 1


def test_unsourced_budget_row_fails_the_trip(tmp_path, bodies):
    frag = _frag(bodies["pass3"])
    frag["evidence"] = [r for r in frag["evidence"] if r["path"] != "budget.breakdown.transport"]
    bodies["pass3"] = _with_text(bodies["pass3"], frag)
    res = T.generate(T.FIXTURE_BRIEF, T.StubClient(bodies), str(tmp_path))
    assert not res["ok"] and res["stage"] == "gate"
    assert any(e.startswith("unsourced-required: budget.breakdown.transport") for e in res["errors"])
    assert not (tmp_path / "admitted").exists()
    assert list((tmp_path / "rejected").glob("*.errors.txt"))


def test_no_search_means_nothing_sourced(tmp_path, bodies):
    bodies["pass3"]["candidates"][0].pop("groundingMetadata")
    res = T.generate(T.FIXTURE_BRIEF, T.StubClient(bodies), str(tmp_path))
    assert not res["ok"]
    assert sum(e.startswith("unsourced-required") for e in res["errors"]) == 4


def test_url_matching_accepts_redirect_chunks():
    chunks = [("https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", "oebb.at")]
    assert T.url_was_read("https://www.oebb.at/en/tickets/bike", chunks)
    assert not T.url_was_read("https://example.com/page", chunks)
    assert not T.url_was_read("https://example.com/page", [])


def test_pass_two_is_words_only(bodies):
    p2 = _frag(bodies["pass2"])
    assert T.pass_errors(2, p2) == []
    bad = copy.deepcopy(p2)
    bad["itinerary"][3]["afternoon"] = "Climb to Maria Taferl, 120 m above the bank, for the terrace view."
    bad["proTips"][1] = "The ferry takes cash, about €3 with a bike, so carry coins."
    bad["logistics"]["money"] = "Carry forty euros in small notes; honesty stalls are cash only."
    errs = T.pass_errors(2, bad)
    assert any(e.startswith("pass2-figure: itinerary[3].afternoon") for e in errs)
    assert any(e.startswith("pass2-figure: proTips[1]") for e in errs)
    assert not any("logistics.money" in e for e in errs), "a spelled-out amount is words"
    wordy = copy.deepcopy(p2)
    wordy["summary"] = "word " * (T.SUMMARY_WORDS + 1)
    wordy["itinerary"][0]["evening"] = "word " * (T.DAY_WORDS + 1)
    wordy["proTips"][0] = "word " * (T.TIP_WORDS + 1)
    errs = T.pass_errors(2, wordy)
    assert sorted(e.split(":")[1].strip() for e in errs if e.startswith("word-cap")) == \
        ["itinerary[0].evening", "proTips[0]", "summary"]


def test_pass_one_leaves_figures_null(bodies):
    p1 = _frag(bodies["pass1"])
    assert T.pass_errors(1, p1) == []
    bad = copy.deepcopy(p1)
    bad["itinerary"][0]["dayStats"]["distanceKm"] = 52
    assert any(e.startswith("schema/additionalProperties: itinerary[0].dayStats") for e in T.pass_errors(1, bad))
    bad = copy.deepcopy(p1)
    bad["typeSpecific"]["surface"] = "About 95% asphalt with short gravel sections."
    assert any(e.startswith("pass1-figure: typeSpecific.surface") for e in T.pass_errors(1, bad))
    bad = copy.deepcopy(p1)
    bad["itinerary"][2]["places"] = ["Grein"]
    assert any("places" in e for e in T.pass_errors(1, bad)), "two places at least"


def test_failed_pass_is_retried_once_then_rejected(tmp_path, bodies):
    wordy = _frag(bodies["pass2"])
    wordy["itinerary"][2]["morning"] = "word " * (T.DAY_WORDS + 1)
    body = _with_text(bodies["pass2"], wordy)
    client = T.StubClient({"pass1": bodies["pass1"], "pass2": [body, body], "pass3": bodies["pass3"]})
    res = T.generate(T.FIXTURE_BRIEF, client, str(tmp_path))
    assert not res["ok"] and res["stage"] == "pass2"
    assert [c[0] for c in client.calls] == ["pass1", "pass2", "pass2"]
    assert "failed these checks" in client.calls[2][1]
    assert "word-cap: itinerary[2].morning" in client.calls[2][1]
    assert any(e.startswith("word-cap") for e in res["errors"])
    good_second = T.StubClient({"pass1": bodies["pass1"], "pass2": [body, bodies["pass2"]],
                                "pass3": bodies["pass3"]})
    res = T.generate({**T.FIXTURE_BRIEF, "key": "second-try"}, good_second, str(tmp_path))
    assert res["ok"]
    assert [c[0] for c in good_second.calls] == ["pass1", "pass2", "pass2", "pass3"]


def test_misaligned_prose_is_rejected(tmp_path, bodies):
    short = _frag(bodies["pass2"])
    short["itinerary"] = short["itinerary"][:6]
    body = _with_text(bodies["pass2"], short)
    client = T.StubClient({"pass1": bodies["pass1"], "pass2": [body, body]})
    res = T.generate(T.FIXTURE_BRIEF, client, str(tmp_path))
    assert not res["ok"] and res["stage"] == "pass2"
    assert any(e.startswith("schema/minItems") or e.startswith("align") for e in res["errors"])


def test_prices_from_the_table_only():
    u = {"model": "gemini-2.5-flash", "tokensIn": 6000, "tokensOut": 2500, "tokensThought": 500,
         "tokensTool": 0, "searches": 2, "grounded": False}
    assert T.price_usd(u) == round(6000 * 0.30 / 1e6 + 3000 * 2.50 / 1e6, 5)
    assert T.price_usd({**u, "grounded": True}) == round(6000 * 0.30 / 1e6 + 3000 * 2.50 / 1e6 + 0.035, 5)
    assert T.price_usd({**u, "model": "gemini-3.5-flash", "grounded": True}) == \
        round(6000 * 1.50 / 1e6 + 3000 * 9.00 / 1e6 + 2 * 0.014, 5)
    assert T.price_usd({**u, "model": "gemini-3.7-flash-preview"}) == round(6000 * 0.75 / 1e6 + 3000 * 3.75 / 1e6, 5)
    assert T.price_usd({**u, "model": "gemini-fixture"}) is None
    assert T.price_usd({**u, "model": None}) is None


def test_ledger_and_cost_report(tmp_path, bodies):
    res = T.generate(T.FIXTURE_BRIEF, T.StubClient(bodies), str(tmp_path))
    assert res["ok"]
    rows = [json.loads(l) for l in (tmp_path / "ledger.jsonl").read_text(encoding="utf-8").splitlines()]
    assert [r["pass"] for r in rows] == [1, 2, 3]
    assert rows[2]["usage"]["searches"] == 3 and rows[2]["usage"]["grounded"]
    assert all(r["usd"] is None for r in rows)
    trips, unpriced = T.cost_report(str(tmp_path / "ledger.jsonl"))
    assert unpriced == {"gemini-fixture"}
    assert trips[T.FIXTURE_BRIEF["key"]]["calls"] == 3


def test_brief_is_checked(tmp_path):
    p = tmp_path / "bad.json"
    p.write_text(json.dumps({"countryCode": "ZZ", "tripTypeSlug": "cycling", "idea": "x"}), encoding="utf-8")
    with pytest.raises(SystemExit):
        T.load_brief(str(p))
    p.write_text(json.dumps({"countryCode": "AT", "tripTypeSlug": "cycling", "idea": "x"}), encoding="utf-8")
    assert T.load_brief(str(p))["key"] == "bad"


def test_prompts_fill_completely(bodies):
    p1 = _frag(bodies["pass1"])
    _, body2 = T.load_prompt(2)
    text = T.fill(body2, {"skeleton": p1, "dayWords": "45", "summaryWords": "120", "tipWords": "35"})
    assert "{{" not in text and "Donauradweg" in text
    with pytest.raises(ValueError):
        T.fill(body2, {"skeleton": p1})
    for n in (1, 2, 3):
        _, body = T.load_prompt(n)
        for ch in (chr(0x2014), chr(0x2013), chr(0xB7)):   # em dash, en dash, middot
            assert ch not in body
