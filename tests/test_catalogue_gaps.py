"""pipeline/catalogue_gaps.py: the D15 review list on fixtures (T1146)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import catalogue_gaps as cg

RULES = [
    {"id": "core.tier", "layer": "core", "field": "tier", "min": 0.98},
    {"id": "core.city", "layer": "core", "field": "city", "min": 0.98},
    {"id": "core.country", "layer": "core", "field": "country", "min": 0.98},
    {"id": "core.iso2", "layer": "core", "field": "iso2", "min": 0.98},
    {"id": "core.lat", "layer": "core", "field": "lat", "min": 0.98},
    {"id": "core.lon", "layer": "core", "field": "lon", "min": 0.98},
    {"id": "core.categories", "layer": "core", "field": "categories", "min": 0.98},
    {"id": "core.blurb", "layer": "core", "field": "blurb", "min": 0.91},
    {"id": "flights.anchor_airport", "layer": "flights", "field": "anchor_airport", "min": 0.94},
    {"id": "imagery.image", "layer": "imagery", "field": "image", "min": 0.97},
    {"id": "place.guide", "layer": "place", "field": "guide", "min": 0.24},
    {"id": "trails.name", "layer": "trails", "field": "name", "min": 0.97},
]


def dest(did, city, lat, lon, tier="gem", iso2="GR", **extra):
    base = {"id": did, "tier": tier, "city": city, "country": "Greece", "iso2": iso2,
            "lat": lat, "lon": lon, "categories": ["town"], "blurb": None if tier == "airport" else "A town.",
            "anchor_airport": "RHO", "image": {"url": "x"}, "geonames": {"population": 50000},
            "rating": {"score": 6.0}}
    return {**base, **extra}


def gn(gid, name, lat, lon, pop, alts=(), iso2="GR"):
    names = {name, *alts}
    return {"gid": gid, "name": name, "iso2": iso2, "lat": lat, "lon": lon, "pop": pop,
            "keys": {cg.fold(n) for n in names}}


def cand(key, name, lat, lon, worth_parts=None, **extra):
    base = {"key": key, "name": name, "iso2": "GR", "lat": lat, "lon": lon, "pop": 4000,
            "track": "settlement", "own": 40.0, "n_own": 30, "near_id": "RHO", "near_city": "Rhodes",
            "near_km": 30.0, "top_cats": [{"cat": "castle", "w": 9}, {"cat": "museum", "w": 3}],
            "cat_top_share": 0.4, "n_cats": 5, "coastal": False, "designations": [],
            "geonameid": int(key[3:]) if key.startswith("gn:") else None, "alt": []}
    return {**base, **extra}


# ------------------------------------------------------------ names

def test_fold_strips_accents_case_and_brackets():
    assert cg.fold("Ródos") == "rodos"
    assert cg.fold("Köln") == "koln"
    assert cg.fold("Straße") == "strasse"
    assert cg.fold("Chios (Mastic Villages)") == "chios"
    assert cg.fold("Мирковци") == ""


def test_gazetteer_resolves_by_alias_within_distance():
    gaz = cg.Gazetteer([gn(400666, "Rhodes", 36.43, 28.22, 50000, ["Rodos", "Ródos"])])
    assert gaz.resolve("Ródos", "GR", 36.44, 28.22)["gid"] == 400666
    assert gaz.resolve("Rodos", "GR", 37.5, 28.22) is None        # 120 km away
    assert gaz.resolve("Rodos", "CY", 36.44, 28.22) is None        # other country


# ------------------------------------------------------------ merge

def test_rhodes_and_rodos_merge_keeping_the_airport():
    dests = {"RHO": dest("RHO", "Rhodes", 36.44, 28.22, tier="airport"),
             "gem:rodos": dest("gem:rodos", "Ródos", 36.43, 28.22)}
    gaz = cg.Gazetteer([gn(400666, "Rhodes", 36.43, 28.22, 50000, ["Rodos"])])
    dups = cg.find_duplicates(dests, gaz)
    assert len(dups) == 1
    assert dups[0]["action"] == "merge" and dups[0]["keep"] == "RHO" and dups[0]["drop"] == "gem:rodos"


def test_bracketed_part_of_a_place_goes_to_review():
    dests = {"gem:chios": dest("gem:chios", "Chios", 38.37, 26.13),
             "gem:chios-mastic": dest("gem:chios-mastic", "Chios (Mastic Villages)", 38.33, 26.10)}
    gaz = cg.Gazetteer([gn(259973, "Chios", 38.37, 26.13, 26000)])
    dups = cg.find_duplicates(dests, gaz)
    assert [d["action"] for d in dups] == ["review"]


def test_same_name_far_apart_is_not_a_duplicate():
    dests = {"gem:a": dest("gem:a", "Neustadt", 49.35, 8.14, iso2="DE"),
             "gem:b": dest("gem:b", "Neustadt", 49.55, 8.14, iso2="DE")}     # 22 km
    assert cg.find_duplicates(dests, None) == []


def test_similar_spelling_close_by_is_review():
    dests = {"gem:a": dest("gem:a", "Castelrotto", 45.49, 10.61, iso2="IT"),
             "gem:b": dest("gem:b", "Castelrotta", 45.50, 10.61, iso2="IT")}
    dups = cg.find_duplicates(dests, None)
    assert [d["action"] for d in dups] == ["review"]


def test_shared_qid_merges_whatever_the_names():
    dests = {"gem:a": dest("gem:a", "Bozen", 46.50, 11.35, iso2="IT", wikidata={"qid": "Q6669"}),
             "gem:b": dest("gem:b", "Bolzano", 46.49, 11.33, iso2="IT", wikidata={"qid": "Q6669"})}
    dups = cg.find_duplicates(dests, None)
    assert dups[0]["action"] == "merge" and "Q6669" in dups[0]["reason"]


# ------------------------------------------------------------ D2 prune

def test_tier_required_drops_fields_a_tier_lacks_by_design():
    places = {f"A{i}": dest(f"A{i}", f"Air{i}", 36, 28, tier="airport") for i in range(3)}
    places.update({f"g{i}": dest(f"g{i}", f"Gem{i}", 36, 28) for i in range(3)})
    req = cg.tier_required(places, cg.per_place_fields(RULES))
    assert "blurb" not in req["airport"] and "blurb" in req["gem"]
    assert "guide" not in req["gem"]          # floor 0.24, partial by design
    assert "name" not in req["gem"]           # trails rule, not an app_data field


def test_prune_fixes_a_missing_field_and_removes_a_broken_identity():
    places = {f"g{i}": dest(f"g{i}", f"Gem{i}", 36, 28) for i in range(4)}
    places["g1"]["image"] = None
    places["g2"]["lat"] = 10.0                 # outside Europe
    places["g3"]["city"] = "Мирковци"
    out = {p["id"]: p for p in cg.prune_d2(places, RULES, {})}
    assert out["g1"]["action"] == "fix" and out["g1"]["missing"] == ["image"]
    assert out["g2"]["action"] == "remove"
    assert out["g3"]["action"] == "fix" and "Latin" in out["g3"]["invalid"][0]
    assert "g0" not in out


# ------------------------------------------------------------ add

@pytest.fixture()
def world():
    dests = {"RHO": dest("RHO", "Rhodes", 36.44, 28.22, tier="airport", no_ryanair_route=False),
             "gem:place": dest("gem:place", "Мирковци", 42.0, 22.0, iso2="MK")}
    gaz = cg.Gazetteer([gn(400666, "Rhodes", 36.43, 28.22, 50000, ["Rodos"]),
                        gn(1, "Lindos", 36.09, 28.09, 4000), gn(2, "Kamiros", 36.33, 27.92, 4000),
                        gn(3, "Lindos Beach", 36.10, 28.09, 4000)])
    return dests, gaz


def gate_for(dests, gaz):
    ident = cg.identities(cg.shipped_points(dests), gaz)
    return cg.Gate(dests, ident, gaz, {}, RULES)


def test_candidate_without_parent_is_not_taken_for_a_district(world):
    dests, gaz = world
    gate = gate_for(dests, gaz)
    assert "" in gate.shipped_cities           # the Cyrillic name folds to ""
    row = cg.score_rows([cand("gn:1", "Lindos", 36.09, 28.09)], {}, dests)[0]
    spec, why = gate.check(row)
    assert why is None and spec["anchor_airport"] == "RHO" and spec["tier"] == "gem"


def test_second_spelling_of_a_shipped_place_is_rejected(world):
    dests, gaz = world
    gate = gate_for(dests, gaz)
    row = cg.score_rows([cand("gn:400666", "Rodos", 36.43, 28.22, near_km=20.0)], {}, dests)[0]
    spec, why = gate.check(row)
    assert spec is None and why.startswith("duplicate of shipped RHO")


def test_fill_region_first_then_country_net_and_stretch_off_the_approve_list(world, monkeypatch):
    dests, gaz = world
    cands = [cand("gn:1", "Lindos", 36.09, 28.09), cand("gn:2", "Kamiros", 36.33, 27.92),
             cand("gn:3", "Lindos Beach", 36.10, 28.09),            # 1 km from Lindos
             cand("gn:4", "Quiet", 36.20, 27.80, own=1.0, n_own=1, n_cats=1, cat_top_share=1.0)]
    rows = cg.score_rows(cands, {}, dests)
    worth = {r["key"]: r["worth"] for r in rows}
    assert worth["gn:1"] >= cg.promote.MIN_WORTH > worth["gn:4"]

    class CP:
        @staticmethod
        def find_nuts3(nuts, cc, lon, lat):
            return ("EL421" if lon > 28.0 else "EL422"), "polygon"

    gaps = [{"id": "D6-001", "rank": 1, "kind": "country", "cc": "GR", "code": "GR", "scope": "Greece",
             "actual": 1, "expected": 5.0, "short": 3},
            {"id": "D6-011", "rank": 11, "kind": "region", "cc": "GR", "code": "EL42", "scope": "EL42 Notio Aigaio",
             "actual": 0, "expected": 2.0, "short": 1}]
    monkeypatch.setattr(cg, "nuts2_of", lambda nuts, cc, lat, lon, cp: "EL42")
    res = cg.build({"destinations": dests}, cands, {}, gaps, RULES, {}, gaz, {"x": 1}, CP)
    by = {g["id"]: g for g in res["gaps"]}
    assert by["D6-011"]["adds"] == ["gn:1"]                  # best worth, region first
    assert by["D6-001"]["need"] == 2                          # 3 short minus the region's add
    assert by["D6-001"]["adds"] == ["gn:2"]                   # Lindos Beach is within 6 km
    assert sorted(res["countries"]["GR"]["approve"]) == ["gn:1", "gn:2"]
    stretch = [a["key"] for a in res["countries"]["GR"]["stretch"]]
    assert "gn:1" not in stretch and "gn:2" not in stretch
    for a in res["countries"]["GR"]["add"]:
        assert a["reason"] and "GeoNames" in a["source"]

    files = cg.render(res)
    assert "README.md" in files and "GR.md" in files
    text = "".join(files.values())
    assert chr(0x2014) not in text and chr(0x2013) not in text


def test_load_gaps_reads_only_d15_place_lines(tmp_path):
    p = tmp_path / "parity.csv"
    p.write_text(
        "id,rank,kind,item,cc,scope,actual,expected,places,note\n"
        "D6-001,1,country places,D15,DE,Germany,248,443.8,196,x\n"
        "D6-011,11,region places,D15,FR,FR10 Ile-de-France,16,63.7,48,x\n"
        "D6-037,37,field,D8,DE,Germany,1,2,0,x\n", encoding="utf-8")
    gaps = cg.load_gaps(p)
    assert [(g["id"], g["kind"], g["code"], g["short"]) for g in gaps] == [
        ("D6-001", "country", "DE", 196), ("D6-011", "region", "FR10", 48)]
