"""T1199 (ROADMAP D19): entry rules per country and traveller group."""
import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import entry_rules as er

SHIPPED = ROOT / "continent-app" / "public" / "entry_rules.json"
COUNTRIES = ["AD", "AL", "CY", "FO", "GB", "IE", "IT", "NO", "RS"]


def doc():
    return er.build(COUNTRIES, today="2026-11-07")


def test_build_is_valid_and_covers_every_group():
    d = doc()
    assert er.validate(d) == []
    for c in d["countries"].values():
        assert set(c["rules"]) == set(er.GROUPS)
        assert c["_src"] == "entry_rules" and c["_asof"] == "2026-11-07"


def test_zones_pick_the_right_codes():
    c = doc()["countries"]
    assert c["IT"]["rules"]["visa_free"]["needs"] == ["passport", "ees", "etias_tba"]
    assert c["IT"]["rules"]["visa"]["needs"] == ["schengen_visa", "ees"]
    assert c["NO"]["zone"] == "schengen"  # outside the EU, inside Schengen
    assert "ees" not in c["CY"]["rules"]["visa_free"]["needs"]  # Cyprus runs no EES
    assert c["IE"]["rules"]["uk"]["needs"] == ["cta_id"]
    assert c["GB"]["rules"]["eu"]["needs"] == ["passport", "uk_eta"]
    assert c["GB"]["rules"]["uk"]["needs"] == ["own_country"]
    assert c["GB"]["advice"] is None
    assert c["AD"]["zone"] == "open_border"
    assert c["FO"]["advice"]["url"].endswith("/denmark")


def test_no_line_claims_etias_is_live():
    for c in doc()["countries"].values():
        for line in c["rules"].values():
            assert "etias" not in line["needs"]  # only etias_tba until a start date is set


def test_validate_names_the_broken_field():
    d = doc()
    bad = copy.deepcopy(d)
    bad["countries"]["IT"]["rules"]["uk"]["needs"] = ["made_up"]
    del bad["countries"]["RS"]["_asof"]
    bad["countries"]["AL"]["rules"]["eu"]["src"] = "nowhere"
    problems = er.validate(bad)
    assert any("IT.rules.uk.needs" in p for p in problems)
    assert any("RS lacks _src or _asof" in p for p in problems)
    assert any("AL.rules.eu.src" in p for p in problems)


def test_unknown_country_is_loud():
    try:
        er.zone_of("ZZ")
    except KeyError as e:
        assert "ZZ" in str(e)
    else:
        raise AssertionError("an unknown country must raise")


def test_refresh_reads_govuk_fixture_and_keeps_cache_on_failure(tmp_path):
    cache = tmp_path / "govuk.json"
    cache.write_text(json.dumps({"serbia": {"updated": "2026-01-02", "entry_part": True, "checked": "2026-10-01"}}))
    page = {"public_updated_at": "2026-11-03T09:00:00.000+00:00",
            "details": {"parts": [{"slug": "summary"}, {"slug": "entry-requirements"}]}}

    def fetch(url):
        if url.endswith("/serbia"):
            raise OSError("blocked")
        return page

    out = er.refresh(["italy", "serbia", None], cache_path=cache, fetch=fetch, today="2026-11-08")
    assert out["italy"] == {"updated": "2026-11-03", "entry_part": True, "checked": "2026-11-08"}
    assert out["serbia"]["checked"] == "2026-10-01"  # kept, not invented
    built = er.build(["IT", "RS"], out, today="2026-11-08")["countries"]
    assert built["IT"]["advice"]["updated"] == "2026-11-03"
    assert built["IT"]["rules"]["uk"]["checked"] == "2026-11-08"
    assert built["RS"]["rules"]["uk"]["checked"] == er.RULES_CHECKED


def test_shipped_file_covers_the_catalogue():
    shipped = json.loads(SHIPPED.read_text(encoding="utf-8"))
    assert er.validate(shipped) == []
    assert set(shipped["countries"]) == set(er.catalogue_countries())
