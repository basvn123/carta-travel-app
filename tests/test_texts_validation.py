"""T1196: the texts validation run (stratified sample, report) and the back-translation check."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "validation"))
sys.path.insert(0, str(ROOT))

import texts_backtranslation as bt
import texts_sample as ts

# ---- chrF++ (values checked against sacrebleu 2.x CHRF(word_order=2) on lower-cased text) ----

def test_chrf_matches_sacrebleu_values():
    assert bt.chrf("Add to trip", "Add to trip") == 100.0
    assert bt.chrf("Add the town now; you choose later what you", "Add the town now; you pick what you") == 73.07
    assert bt.chrf("Spam links in three shared trips", "Spam links in 3 shared journeys") == 52.16
    assert bt.chrf("Out", "off") == 8.33
    assert bt.chrf("The route", "Route") == 81.86


def test_chrf_empty_is_zero():
    assert bt.chrf("", "x") == 0.0
    assert bt.chrf(None, "x") == 0.0


# ---- deterministic checks ----

def test_checks_placeholders_digits_dash_and_english():
    assert bt.checks("To {airport} in {min} min", "Naar {airport} in {min} min") == []
    assert "placeholder_invented" in bt.checks("To {airport}", "Naar {luchthaven}")
    assert "placeholder_dropped" in bt.checks("To {airport} now", "Naar het vliegveld nu")
    assert "digits_changed" in bt.checks("Up to 3 trips", "Tot 4 reizen")
    assert "dash" in bt.checks("A walk", "Een wandeling — kort")
    assert "left_in_english" in bt.checks("Spam links in shared trips", "Spam links in shared trips")
    assert bt.checks("Google", "Google") == []  # a brand name may stay as is
    assert bt.checks("x", "  ") == ["empty"]
    assert "length_ratio" in bt.checks("A fairly long English sentence here", "Kort")


# ---- blind prompts ----

def _strings():
    return {lang: {"wizard.addToTrip": {"en": "Add to trip", "target": f"{lang} add"},
                   "admin.secretWord": {"en": "Quarantine queue for {n} rows", "target": f"{lang} {{n}} rij"}}
            for lang in bt.LANGS}


def test_prompts_are_blind(tmp_path):
    m = bt.write_prompts(tmp_path, _strings(), batch=1)
    assert m["counts"] == {lang: 2 for lang in bt.LANGS}
    text = "".join((tmp_path / f).read_text(encoding="utf-8") for f in m["files"])
    assert "wizard.addToTrip" not in text and "Add to trip" not in text and "Quarantine" not in text
    assert "nl add" in text


def test_read_back_maps_opaque_ids(tmp_path):
    s = _strings()
    m = bt.write_prompts(tmp_path, s)
    oid = next(o for o, k in m["ids"]["de"].items() if k == "wizard.addToTrip")
    f = tmp_path / "ans.json"
    f.write_text(json.dumps({oid: "Add to the trip", "zz-9999": "ignored"}), encoding="utf-8")
    back = bt.read_back([f], m)
    assert back["de"] == {"wizard.addToTrip": "Add to the trip"}


# ---- flags, control and the result ----

def test_flags_and_holds():
    s = {lang: {} for lang in bt.LANGS}
    s["nl"] = {
        "a.good": {"en": "Plan a quiet walking week in the hills", "target": "Plan een rustige wandelweek in de heuvels"},
        "a.bad": {"en": "Plan a quiet walking week in the hills", "target": "Boek een dure hotelkamer"},
        "a.short": {"en": "Back", "target": "Terug"},
        "a.check": {"en": "Up to 3 trips per month for free", "target": "Tot 5 reizen per maand gratis"},
    }
    back = {"nl": {"a.good": "Plan a quiet walking week in the hills", "a.bad": "Book an expensive hotel room",
                   "a.short": "Back", "a.check": "Up to 5 trips per month for free"}}
    rows = bt.score_rows(s, back)
    by = {r["key"]: r for r in rows["nl"]}
    assert by["a.good"]["flag"] == []
    assert "chrf_low" in by["a.bad"]["flag"]
    assert "short" in by["a.short"]["flag"]
    assert by["a.check"]["checks"] == ["digits_changed"]
    items = bt.judge_items(rows)
    ids = {i["text_id"] for i in items}
    assert {"nl:a.bad", "nl:a.short", "nl:a.check"} <= ids
    assert all(i["kind"] == "translation" and i["source"]["lang"] == "en" for i in items)
    res = bt.result(rows, {"nl:a.bad": {"verdict": "contradicted", "reason": "other meaning"},
                           "nl:a.short": {"verdict": "supported"},
                           "nl:a.check": {"verdict": "supported"}})
    nl = res["langs"]["nl"]
    # good holds (unflagged), short holds (judged supported), bad fails (contradicted), check fails (digits)
    assert nl["holds"]["k"] == 2 and nl["holds"]["n"] == 4
    assert res["provisional"] is True
    assert {w["key"] for w in res["worst"]} == {"a.bad", "a.check"}


def test_flagged_without_verdict_is_unknown():
    s = {lang: {} for lang in bt.LANGS}
    s["fr"] = {"k": {"en": "Back", "target": "Retour"}}
    rows = bt.score_rows(s, {"fr": {"k": "Return"}})
    res = bt.result(rows, {})
    assert res["langs"]["fr"]["holds"]["n"] == 0


# ---- the stratified sample ----

def test_allocate_spreads_over_countries():
    a = ts.allocate({"DE": 100, "FR": 50, "MT": 1}, 10)
    assert sum(a.values()) == 10 and a["MT"] == 1 and a["DE"] > a["FR"]
    small = ts.allocate({"DE": 5, "FR": 5, "IT": 5}, 2)
    assert sum(small.values()) == 2


def test_draw_is_stable_and_stratified():
    pool = [(cc, f"{cc}{i}", {"ref": f"{cc}{i}"}) for cc in ("AT", "CH", "IT") for i in range(20)]
    one, two = ts.draw(pool, 9), ts.draw(pool, 9)
    assert one == two
    assert {it["ref"][:2] for it in one} == {"AT", "CH", "IT"}


def test_strip_md():
    assert ts.strip_md("the **Pic, 2,942 m** peak") == "the Pic, 2,942 m peak"


def test_wilson_bounds():
    lo, hi = ts.wilson(20, 40)
    assert 0.34 < lo < 0.36 and 0.64 < hi < 0.66
    assert ts.wilson(0, 0) == (None, None)
