"""Photo correctness (T1198, ROADMAP D17): seeded wrong heroes are flagged,
replacements come from the photo ladder, and the flag rate is a D2 rule.

Everything runs on a fixture wire written to tmp_path: no network, no model.
The seeded cases are the ones Carta actually shipped or T1077 found: the Fur
grizzly, a prime minister's portrait, a government group photo, a university
building, a locator map filed under "Maps of", an interior known only from
its categories, a wrong town known only from its coordinate, and a photo
that names another place of the run.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
for p in (ROOT, ROOT / "pipeline", ROOT / "scripts" / "validation"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


PC = _load("carta_photo_correctness", ROOT / "pipeline" / "photos" / "correctness.py")
import ai_gateway as G  # noqa: E402
import layer_photos  # noqa: E402
import runner as VR  # noqa: E402

NOW = datetime(2026, 11, 7, 12, tzinfo=timezone.utc)
UP = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/{0}/960px-{0}"


def img(name, **kw):
    return {"url": UP.format(name.replace(" ", "_")), "page": f"https://commons.wikimedia.org/wiki/File:{name}",
            "w": 1600, "h": 1000, **kw}


def lay(name, ev=None, **kw):
    u = UP.format(name.replace(" ", "_"))
    return {"u": u, "big": u, "w": 1280, "h": 800, "page": f"https://commons.wikimedia.org/wiki/File:{name}",
            **({"ev": ev} if ev else {}), **kw}


# id -> (city, lat, lon, hero, gallery after the hero)
DESTS = {
    "gem:fur": ("Fur", 56.83, 9.02, "GrizzlyBearJeanBeaufort.jpg",
                ["Fur kommune location map.svg", "Fur Museum 2024 front.jpg"]),
    "gem:tiverton": ("Tiverton", 50.90, -3.49, "Prime Minister Sir Keir Starmer Official Portrait (cropped).jpg",
                     ["Tiverton town centre from the river.jpg"]),
    "gem:appenzell": ("Appenzell", 47.33, 9.41, "Gruppenfoto Standeskommission 2023.jpg",
                      ["Appenzell Hauptgasse.jpg"]),
    "gem:palermo": ("Palermo", 38.12, 13.36, "Palazzo Steri sede della Universita.jpg",
                    ["Palermo Cathedral at dusk.jpg"]),
    "gem:sluis": ("Sluis", 51.31, 3.39, "Gemeente kaartje 2019.png",
                  ["IMG 4410.jpg"]),
    "gem:kunsten": ("Kirkenes", 69.73, 30.04, "IMG 2201.jpg", ["Kirkenes harbour.jpg"]),
    "gem:frankfurt-oder": ("Frankfurt (Oder)", 52.35, 14.55, "Frankfurt skyline at night.jpg",
                           ["Frankfurt Oder Marienkirche.jpg"]),
    "gem:sao-jorge": ("Sao Jorge", 38.65, -28.05, "LisbonCastle.jpg", ["IMG 9.jpg"]),
    "gem:lisbon": ("Lisbon", 38.72, -9.14, "Lisbon from the castle.jpg", []),
    # Controls: must come out ok.
    "AAL": ("Aalborg", 57.05, 9.92, "Aalborg from the Aalborg tower.jpg", []),
    "MAD": ("Madrid", 40.42, -3.70, "Plaza Mayor de Madrid.jpg", []),
}
SEEDED = {"gem:fur", "gem:tiverton", "gem:appenzell", "gem:palermo", "gem:sluis", "gem:kunsten",
          "gem:frankfurt-oder", "gem:sao-jorge"}

# Commons metadata the cheap tier reads (the hero audit's cache shape).
META = {
    "File:Gemeente kaartje 2019.png": {"mime": "image/png", "width": 1200, "height": 900,
                                        "cats": "Maps of Sluis; Gemeente Sluis", "co": []},
    "File:IMG 2201.jpg": {"mime": "image/jpeg", "width": 4000, "height": 3000,
                          "cats": "Interiors of churches in Finnmark; Kirkenes church", "co": []},
    "File:Frankfurt skyline at night.jpg": {"mime": "image/jpeg", "width": 4000, "height": 2000,
                                            "cats": "Skylines of Frankfurt am Main", "co": [[50.11, 8.68]]},
    "File:Frankfurt Oder Marienkirche.jpg": {"mime": "image/jpeg", "width": 4000, "height": 2600,
                                             "cats": "Marienkirche (Frankfurt (Oder))", "co": [[52.342, 14.553]]},
    "File:Kirkenes harbour.jpg": {"mime": "image/jpeg", "width": 4000, "height": 2600,
                                  "cats": "Kirkenes", "co": [[69.727, 30.045]]},
}

# The tier 2 answers a session judge gave (only unsure heroes reach it).
VISION = {"model": "session-fixture", "verdicts": {
    "File:Palazzo Steri sede della Universita.jpg": {
        "shows_place": "no", "kind": "other", "confidence": 0.8, "reason": "a university courtyard"},
    "File:LisbonCastle.jpg": {"shows_place": "no", "kind": "other_place", "confidence": 0.9,
                              "reason": "Sao Jorge castle in Lisbon"},
    "File:Palermo Cathedral at dusk.jpg": {"shows_place": "yes", "kind": "photo_of_place", "confidence": 0.9,
                                           "reason": "the cathedral"},
}}


@pytest.fixture()
def wire(tmp_path):
    pub = tmp_path / "public"
    (pub / "dossier").mkdir(parents=True)
    (pub / "beaches").mkdir()
    dests = {}
    for did, (city, lat, lon, hero, gal) in DESTS.items():
        dests[did] = {"id": did, "city": city, "iso2": "XX", "lat": lat, "lon": lon,
                      "image": {"url": UP.format(hero.replace(" ", "_")), "credit": city,
                                "page": f"https://en.wikipedia.org/wiki/{city}", "w": 1600, "h": 1000}}
        (pub / "dossier" / f"{did.replace(':', '-')}.json").write_text(json.dumps(
            {"id": did, "gallery": [img(hero, caption=city)] + [img(g, caption="") for g in gal]}))
    (pub / "app_data.json").write_text(json.dumps({"meta": {}, "destinations": dests}))
    beaches = [
        {"id": "es-sa-font", "name": "Sa Font de Sa Cala", "cc": "ES", "lat": 39.68, "lon": 3.46, "images": [
            lay("ISS048-E-5976 - View of the Balearic Islands - Mallorca.jpg", ev="name", ph="AAAAAAAAAAAAAAAAAAAAAAAA"),
            lay("Mallorca Capdepera Font de sa Cala.jpg", ev="p18")]},
        {"id": "hr-president", "name": "President Beach", "cc": "ES", "lat": 43.5, "lon": 16.4,
         "images": [lay("Plaza President.JPG", ev="title")]},
        {"id": "uk-horsey", "name": "Horsey Beach", "cc": "ES", "lat": 52.75, "lon": 1.65,
         "images": [lay("20210411 Horsey Dunes seals-34.jpg", ev="name")]},
    ]
    (pub / "beaches" / "ES.json").write_text(json.dumps({"country": "ES", "beaches": beaches}))
    session = tmp_path / "vision.json"
    session.write_text(json.dumps(VISION))
    return pub, session


def cfg_all():
    c = PC.config()
    return c


def run_fixture(pub, session=None, layers=("dest", "beaches")):
    vision = PC.SessionVision(str(session)) if session else None
    return PC.run(layers, pub, cfg_all(), dict(META), vision, NOW, all_rows=True)


def by_id(rep):
    return {r["id"]: r for r in rep["results"]}


# ---- the done condition: seeded wrong photos are flagged ----

def test_every_seeded_wrong_hero_is_flagged(wire):
    pub, session = wire
    res = by_id(run_fixture(pub, session))
    for did in SEEDED:
        assert res[did]["hero"]["verdict"] == "flag", (did, res[did]["hero"])
    reasons = {did: set(res[did]["hero"]["cheap"]["reasons"]) for did in SEEDED}
    assert "animal" in reasons["gem:fur"]
    assert "people" in reasons["gem:tiverton"] and "people" in reasons["gem:appenzell"]
    assert "map" in reasons["gem:sluis"]
    assert "interior" in reasons["gem:kunsten"]
    assert "wrong_place" in reasons["gem:frankfurt-oder"]
    assert "institution" in reasons["gem:palermo"] and res["gem:palermo"]["hero"]["vision"]["verdict"] == "flag"
    assert "names_other_place" in reasons["gem:sao-jorge"]
    assert res["es-sa-font"]["hero"]["verdict"] == "flag"


def test_controls_are_not_flagged(wire):
    pub, session = wire
    res = by_id(run_fixture(pub, session))
    for rid in ("AAL", "MAD", "gem:lisbon", "hr-president", "uk-horsey"):
        assert res[rid]["hero"]["verdict"] != "flag", (rid, res[rid]["hero"]["cheap"])
    assert res["AAL"]["hero"]["verdict"] == "ok"
    assert res["MAD"]["hero"]["verdict"] == "ok"          # "Plaza Mayor" is not a mayor
    assert res["hr-president"]["hero"]["verdict"] == "ok"  # the beach's own name is not a president


def test_without_vision_the_unsure_go_to_review(wire):
    pub, _ = wire
    res = by_id(run_fixture(pub, None))
    assert res["gem:palermo"]["hero"]["verdict"] == "unsure"
    assert res["gem:palermo"]["action"] == "review"
    assert res["gem:sao-jorge"]["hero"]["verdict"] == "unsure"


# ---- replacements come from the ladder ----

def test_replacements_are_the_first_ok_candidate_on_the_ladder(wire):
    pub, session = wire
    rep = run_fixture(pub, session)
    res = by_id(rep)
    fur = res["gem:fur"]
    assert fur["action"] == "replace"
    # The locator map at index 1 is skipped, the museum photo at index 2 wins.
    assert [t["verdict"] for t in fur["tried"]] == ["flag", "ok"]
    assert fur["replacement"]["index"] == 2 and fur["replacement"]["key"] == "File:Fur Museum 2024 front.jpg"
    assert res["gem:frankfurt-oder"]["replacement"]["key"] == "File:Frankfurt Oder Marienkirche.jpg"
    assert res["gem:palermo"]["replacement"]["key"] == "File:Palermo Cathedral at dusk.jpg"
    assert res["es-sa-font"]["replacement"]["key"] == "File:Mallorca Capdepera Font de sa Cala.jpg"
    subjects = {s["id"]: s for s in PC.subjects_for("dest", pub) + PC.subjects_for("beaches", pub)}
    for r in rep["results"]:
        if r["replacement"]:
            keys = [p["key"] for p in subjects[r["id"]]["ladder"]]
            assert r["replacement"]["key"] in keys[1:]


def test_no_ok_candidate_keeps_the_hero_for_review(wire):
    pub, session = wire
    res = by_id(run_fixture(pub, session))
    # Sao Jorge's only candidate names nothing: never shipped as a "fix".
    assert res["gem:sao-jorge"]["action"] == "review" and res["gem:sao-jorge"]["replacement"] is None
    assert any(x["id"] == "gem:sao-jorge" for x in run_fixture(pub, session)["review"])


def test_apply_moves_the_replacement_to_the_front(wire):
    pub, session = wire
    rep = run_fixture(pub, session)
    done = PC.apply(rep, pub)
    assert done["beaches"] == 1 and done["dest"] >= 4
    row = json.loads((pub / "beaches" / "ES.json").read_text())["beaches"][0]
    assert "Font_de_sa_Cala" in row["images"][0]["u"]
    assert len(row["images"]) == 1 and all("ph" not in i for i in row["images"])
    d = json.loads((pub / "app_data.json").read_text())["destinations"]
    assert "Fur_Museum" in d["gem:fur"]["image"]["url"] and d["gem:fur"]["image"]["source"] == "photo_check"
    assert "Tiverton_town_centre" in d["gem:tiverton"]["image"]["url"]
    assert "LisbonCastle" in d["gem:sao-jorge"]["image"]["url"]   # review, not replaced
    # A second apply finds the hero moved on and touches nothing.
    assert PC.apply(rep, pub) == {}


def test_a_strong_cheap_flag_stands_whatever_the_model_says():
    cheap = {"verdict": "flag", "reasons": ["map"]}
    assert PC.decide(cheap, {"verdict": "ok"}) == "flag"
    assert PC.decide({"verdict": "unsure"}, {"verdict": "ok"}) == "ok"
    assert PC.decide({"verdict": "unsure"}, None) == "unsure"
    assert PC.decide({"verdict": "ok"}, {"verdict": "flag"}) == "ok"


def test_the_answer_kinds_live_in_the_prompt():
    kinds = PC.vision_kinds()
    assert kinds[0] == "photo_of_place" and "other_place" in kinds and kinds[-1] == "other" and len(kinds) == 8
    assert PC.vision_schema()["properties"]["kind"]["enum"] == list(kinds)


def test_vision_answers_are_normalised():
    ok = PC.normalise_vision({"shows_place": "yes", "kind": "photo_of_place", "confidence": 0.9})
    assert ok["verdict"] == "ok"
    assert PC.normalise_vision({"shows_place": "yes", "kind": "photo_of_place", "confidence": 0.3})["verdict"] == "unsure"
    assert PC.normalise_vision({"shows_place": "yes", "kind": "map", "confidence": 0.9})["verdict"] == "flag"
    assert PC.normalise_vision({"shows_place": "no", "kind": "bogus", "confidence": 0.9})["kind"] == "other"
    assert PC.normalise_vision({"shows_place": "maybe"}) is None
    assert PC.normalise_vision("not json") is None


# ---- the vision tier through the gateway ----

class _Resp:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self):
        return json.dumps(self.body).encode()


def test_gemini_vision_goes_through_the_gateway_with_the_image(wire):
    pub, _ = wire
    seen = []

    def base(req, timeout=None):
        seen.append((req.full_url, json.loads(req.data)))
        ans = {"shows_place": "no", "kind": "animal_or_object", "confidence": 0.95, "reason": "a bear"}
        return _Resp({"candidates": [{"content": {"parts": [{"text": json.dumps(ans)}]}}],
                      "usageMetadata": {"promptTokenCount": 500, "candidatesTokenCount": 30}})

    env = {"GEMINI_API_KEY": "test-key"}
    v = PC.GeminiVision(PC.config(), env=env, fetch=lambda url: (b"\xff\xd8jpeg", "image/jpeg"),
                        base_opener=base, sleep=lambda s: None)
    subject = {"layer": "dest", "name": "Fur", "cc": "DK"}
    photo = PC.photo_from_record({"url": UP.format("GrizzlyBearJeanBeaufort.jpg")})
    out = v.judge(subject, photo)
    assert out == {"verdict": "flag", "kind": "animal_or_object", "confidence": 0.95, "reason": "a bear"}
    url, body = seen[0]
    assert "gemini-flash-latest" in url and "anthropic" not in url.lower()
    parts = body["contents"][0]["parts"]
    assert parts[0]["text"].count("Fur") >= 1 and "PLACE AND FILE" in parts[0]["text"]
    assert parts[1]["inline_data"]["mime_type"] == "image/jpeg"
    assert body["generationConfig"]["mediaResolution"] == "MEDIA_RESOLUTION_LOW"
    assert G.FEATURES["photo_check"]["provider"] == "gemini"


def test_no_key_means_no_vision_tier_not_a_crash(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    v, why = PC.make_vision("gemini", PC.config())
    assert v is None and "unavailable" in why


def test_the_prompt_comes_from_the_registry():
    p = PC.vision_prompt()
    assert p.id == "photo-check" and p.version == 1
    reg = json.loads((ROOT / "prompts" / "registry.json").read_text())["prompts"]["photo-check"]
    assert reg["sha256"] == p.sha256
    text = PC.build_vision_prompt({"layer": "beaches", "name": "Meia Praia", "cc": "PT"},
                                  {"title": "File:X.jpg", "caption": ""}, p)
    assert '"place": "Meia Praia"' in text and '"place_type": "beach"' in text


# ---- the sample and the rate ----

def test_sample_is_stable_for_a_salt_and_rotates_with_it():
    subs = [{"layer": "dest", "id": str(i)} for i in range(1000)]
    a = PC.sample(subs, 50, "2026-W45")
    assert [s["id"] for s in a] == [s["id"] for s in PC.sample(list(reversed(subs)), 50, "2026-W45")]
    b = PC.sample(subs, 50, "2026-W46")
    assert len(a) == 50 and {s["id"] for s in a} != {s["id"] for s in b}
    assert PC.week_salt(NOW) == "2026-W45"


def test_rates(wire):
    pub, session = wire
    rep = run_fixture(pub, session)
    t = rep["totals"]
    assert t["checked"] == len(DESTS) + 3
    assert t["flagged"] == len(SEEDED) + 1
    assert t["flag_rate"] == round(t["flagged"] / t["checked"], 4)
    # Fur, Tiverton, Appenzell, Palermo, Kirkenes, Frankfurt (Oder) and Sa Font
    # have an ok candidate; Sluis and Sao Jorge do not.
    assert t["replaced"] == 7


# ---- the D2 rule ----

def test_the_flag_rate_is_a_hard_d2_rule(wire, tmp_path):
    pub, session = wire
    rep = run_fixture(pub, session)
    path = tmp_path / "check.json"
    path.write_text(json.dumps(rep))
    assert VR.LAYERS["photos"] == "layer_photos" and VR.plugin("photos").NAME == "photos"
    chk = {c["metric"]: c for c in layer_photos.CHECKS}
    assert chk["flagged"]["kind"] == "hard" and chk["flagged"]["direction"] == "lower"
    res = VR.run(layer_photos, {"report": str(path)}, now=NOW)
    flagged = res["metrics"]["flagged"]
    assert flagged["k"] == len(SEEDED) + 1 and flagged["n"] == len(DESTS) + 3
    # A baseline 10 points under today's rate: the rise fails the hard check,
    # and gate_from_disk hands it to the D2 engine.
    valid = tmp_path / "valid"
    (valid / "photos").mkdir(parents=True)
    base = {"metrics": {"flagged": round(flagged["value"] - 0.10, 4), "unsure": 1.0, "coverage": 0.0}}
    (valid / "photos" / "baseline.json").write_text(json.dumps(base))
    res["checks"] = [dict(c, min_n=1) for c in layer_photos.CHECKS]
    (valid / "photos" / f"{res['date']}.json").write_text(json.dumps(res))
    fails, _ = VR.gate_from_disk(valid)
    assert [f["id"] for f in fails] == ["validation.photos.flagged"]
    # At the baseline's own rate it passes.
    base["metrics"]["flagged"] = flagged["value"]
    (valid / "photos" / "baseline.json").write_text(json.dumps(base))
    assert VR.gate_from_disk(valid)[0] == []


def test_validate_waits_for_the_baseline(wire, tmp_path):
    pub, session = wire
    path = tmp_path / "check.json"
    path.write_text(json.dumps(run_fixture(pub, session)))
    valid = tmp_path / "valid"
    assert PC.validate(path, valid) == 0
    assert not (valid / "photos").exists()


def test_cli_writes_the_report(wire, tmp_path):
    pub, session = wire
    meta = tmp_path / "meta.json"
    meta.write_text(json.dumps(META))
    out = tmp_path / "reports"
    rc = PC.main(["--public", str(pub), "--layers", "dest,beaches", "--all", "--meta", str(meta),
                  "--vision", f"session:{session}", "--out", str(out), "--now", "2026-11-07T12:00:00Z",
                  "--vision-prompts", str(tmp_path / "prompts")])
    assert rc == 0
    rep = json.loads((out / "2026-11-07.json").read_text())
    assert rep["schema"] == PC.SCHEMA and rep["vision"]["backend"] == "session"
    man = json.loads((tmp_path / "prompts" / "manifest.json").read_text())
    assert man["prompt"] == "photo-check" and man["items"]
    # Nothing in the wire changed without --apply.
    assert "Grizzly" in json.loads((pub / "app_data.json").read_text())["destinations"]["gem:fur"]["image"]["url"]


def test_the_task_runs_before_photo_sources():
    import run_pipeline as RP
    keys = [t["key"] for t in RP.TASKS]
    assert "photo_check" in keys and keys.index("photo_check") < keys.index("photo_sources")
    assert keys[-2:] == ["photo_sources", "trailslab_worker"]
