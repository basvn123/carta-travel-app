"""Entry rules and official advice per country (T1199, ROADMAP D19).

Tier: Scheduled (run_pipeline task entry_rules)

For every country in the catalogue and four traveller groups

    eu         EU, EEA or Swiss citizens
    uk         British citizens
    visa_free  US citizens and other nationals who need no Schengen visa
    visa       nationals who need a visa (Regulation (EU) 2018/1806, Annex I)

the layer writes what to carry and what to do before the trip, as short
neutral codes (`passport`, `ees`, `uk_eta` ...). The app turns a code into
one short line in six languages and prints the official page it rests on
and the date it was checked. Nothing here restates a legal rule: a line is a
pointer to the official page, never a paraphrase of it, and no text of any
source is copied.

Where the codes come from. The country's zone (Schengen, EU outside
Schengen, the open-border micro states, the UK, the Western Balkans and
Moldova, the Faroe Islands) fixes the codes per group, from the official
pages in SOURCES. The research behind the table is in
Execution/P15/T1199-entry-rules.md. RULES_CHECKED is the date the table was
last checked against those pages; a person moves it after checking again.

Official advice. Each country also links the GOV.UK foreign travel advice
page (Open Government Licence v3.0). `--refresh` reads the GOV.UK Content
API (www.gov.uk/api/content/foreign-travel-advice/<slug>) for every country
into cache/entry_rules/govuk_fta.json: the page's own update date and
whether it has an entry requirements part. The build reads that cache; with
no cache the advice carries the link and RULES_CHECKED only, never a date it
was not seen on.

Provenance (T1143): each country block carries `_src` (this layer's id) and
`_asof` (the build date); each line carries its own `src`, `url` and
`checked`.

Usage:
    python pipeline/entry_rules.py              # build from the table + cache
    python pipeline/entry_rules.py --refresh    # read GOV.UK first, then build
    python pipeline/entry_rules.py --check      # validate the shipped file
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from pipeline_io import atomic_write_json

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "continent-app" / "public" / "entry_rules.json"
CACHE = ROOT / "cache" / "entry_rules" / "govuk_fta.json"
WIRE = ROOT / "continent-app" / "public" / "app_data.json"

SCHEMA_VERSION = 1
LAYER_SRC = "entry_rules"
# The day the table below was last checked against the pages in SOURCES.
RULES_CHECKED = "2026-11-07"
GROUPS = ("eu", "uk", "visa_free", "visa")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# What a line can say. The app holds the words (entry.need.<code>, six
# languages); the pipeline only picks codes.
CODES = (
    "id_or_passport",   # ID card or passport
    "passport",         # passport
    "ees",              # fingerprints and photo at the border (Entry/Exit System)
    "etias_tba",        # ETIAS: not yet required, start date to be announced
    "schengen_visa",    # Schengen visa
    "uk_eta",           # UK electronic travel authorisation before you go
    "uk_visa",          # UK visa
    "cta_id",           # photo ID (Common Travel Area)
    "national_visa",    # a visa of the country itself
    "own_country",      # the traveller's own country
    "check_official",   # national rules: see the official page
)

OGL = "OGL-UK-3.0"
EC = "CC-BY-4.0"            # Commission content, Decision 2011/833/EU and C(2019) 1655
EU_REUSE = "LicenseRef-eu-reuse-2011-833"
PD_US = "LicenseRef-us-gov-public-domain"

SOURCES = {
    "eu_your_europe": {
        "title": "European Commission, Your Europe: travel documents for EU citizens",
        "url": "https://europa.eu/youreurope/citizens/travel/entry-exit/eu-citizen/index_en.htm",
        "licence": EC,
    },
    "eu_ees": {
        "title": "European Commission, Travel to Europe: Entry/Exit System",
        "url": "https://travel-europe.europa.eu/ees_en",
        "licence": EC,
    },
    "eu_etias": {
        "title": "European Commission, Travel to Europe: ETIAS",
        "url": "https://travel-europe.europa.eu/etias_en",
        "licence": EC,
    },
    "eu_visa_list": {
        "title": "EUR-Lex, Regulation (EU) 2018/1806 (the EU visa list)",
        "url": "https://eur-lex.europa.eu/eli/reg/2018/1806/oj",
        "licence": EU_REUSE,
    },
    "govuk_fta": {
        "title": "GOV.UK foreign travel advice (FCDO)",
        "url": "https://www.gov.uk/foreign-travel-advice",
        "licence": OGL,
    },
    "govuk_eta": {
        "title": "GOV.UK: apply for an electronic travel authorisation (ETA)",
        "url": "https://www.gov.uk/guidance/apply-for-an-electronic-travel-authorisation-eta",
        "licence": OGL,
    },
    "govuk_visa": {
        "title": "GOV.UK: check if you need a UK visa",
        "url": "https://www.gov.uk/check-uk-visa",
        "licence": OGL,
    },
    "us_state": {
        "title": "US Department of State, travel advisories",
        "url": "https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html",
        "licence": PD_US,
    },
}

# GOV.UK foreign travel advice slugs. GB has no page (it is home for the
# advice); the Faroe Islands sit under Denmark's.
GOVUK_SLUG = {
    "AD": "andorra", "AL": "albania", "AT": "austria", "BA": "bosnia-and-herzegovina",
    "BE": "belgium", "BG": "bulgaria", "CH": "switzerland", "CY": "cyprus",
    "CZ": "czech-republic", "DE": "germany", "DK": "denmark", "EE": "estonia",
    "ES": "spain", "FI": "finland", "FO": "denmark", "FR": "france", "GB": None,
    "GR": "greece", "HR": "croatia", "HU": "hungary", "IE": "ireland",
    "IS": "iceland", "IT": "italy", "LI": "liechtenstein", "LT": "lithuania",
    "LU": "luxembourg", "LV": "latvia", "MC": "monaco", "MD": "moldova",
    "ME": "montenegro", "MK": "north-macedonia", "MT": "malta", "NL": "netherlands",
    "NO": "norway", "PL": "poland", "PT": "portugal", "RO": "romania",
    "RS": "serbia", "SE": "sweden", "SI": "slovenia", "SK": "slovakia",
    "SM": "san-marino", "XK": "kosovo",
}

# The zones. Schengen has 29 members since BG and RO joined fully on
# 2025-01-01; all 29 run the Entry/Exit System (full operation 2026-04-10).
# Cyprus and Ireland are in the EU but not in Schengen and run no EES.
SCHENGEN = frozenset((
    "AT", "BE", "BG", "HR", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IT",
    "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
    "CH", "NO", "IS", "LI"))
EU_OUTSIDE_SCHENGEN = frozenset(("CY", "IE"))
# No border control with their Schengen neighbour: a traveller enters
# through France, Spain or Italy, so the Schengen lines apply on the way in.
OPEN_BORDER = frozenset(("AD", "MC", "SM"))
OWN_RULES = frozenset(("AL", "BA", "ME", "MK", "RS", "XK", "MD"))
NORDIC_OWN = frozenset(("FO",))
ZONES = ("schengen", "eu_outside_schengen", "open_border", "uk", "own_rules", "nordic_own")


def zone_of(iso2: str) -> str:
    if iso2 in SCHENGEN:
        return "schengen"
    if iso2 in EU_OUTSIDE_SCHENGEN:
        return "eu_outside_schengen"
    if iso2 in OPEN_BORDER:
        return "open_border"
    if iso2 == "GB":
        return "uk"
    if iso2 in OWN_RULES:
        return "own_rules"
    if iso2 in NORDIC_OWN:
        return "nordic_own"
    raise KeyError(f"no entry zone for {iso2}: add it to a zone in pipeline/entry_rules.py")


def govuk_url(iso2: str, part: str = "entry-requirements") -> str | None:
    slug = GOVUK_SLUG.get(iso2)
    if not slug:
        return None
    return f"https://www.gov.uk/foreign-travel-advice/{slug}" + (f"/{part}" if part else "")


def _line(needs, src, url=None):
    return {"needs": list(needs), "src": src,
            "url": url or (SOURCES[src]["url"] if src else None)}


def rules_for(iso2: str) -> dict:
    """The four group lines of one country, before dates are added."""
    z = zone_of(iso2)
    fta = ("govuk_fta", govuk_url(iso2))
    if z in ("schengen", "open_border"):
        return {
            "eu": _line(["id_or_passport"], "eu_your_europe"),
            "uk": _line(["passport", "ees", "etias_tba"], *fta),
            "visa_free": _line(["passport", "ees", "etias_tba"], "eu_ees"),
            "visa": _line(["schengen_visa", "ees"], "eu_visa_list"),
        }
    if iso2 == "CY":
        return {
            "eu": _line(["id_or_passport"], "eu_your_europe"),
            "uk": _line(["passport", "etias_tba"], *fta),
            "visa_free": _line(["passport", "etias_tba"], "eu_etias"),
            "visa": _line(["national_visa"], "eu_visa_list"),
        }
    if iso2 == "IE":
        return {
            "eu": _line(["id_or_passport"], "eu_your_europe"),
            "uk": _line(["cta_id"], *fta),
            "visa_free": _line(["passport"], "us_state"),
            "visa": _line(["national_visa"], "eu_visa_list"),
        }
    if z == "uk":
        return {
            "eu": _line(["passport", "uk_eta"], "govuk_eta"),
            "uk": _line(["own_country"], None),
            "visa_free": _line(["passport", "uk_eta"], "govuk_eta"),
            "visa": _line(["uk_visa"], "govuk_visa"),
        }
    if z == "own_rules":
        return {
            "eu": _line(["check_official"], "eu_your_europe"),
            "uk": _line(["passport"], *fta),
            "visa_free": _line(["passport"], "us_state"),
            "visa": _line(["check_official"], None),
        }
    # Faroe Islands: outside the EU and Schengen, own entry rules.
    return {
        "eu": _line(["check_official"], "eu_your_europe"),
        "uk": _line(["check_official"], *fta),
        "visa_free": _line(["check_official"], "us_state"),
        "visa": _line(["check_official"], None),
    }


def catalogue_countries(wire: Path = WIRE) -> list[str]:
    """The ISO codes the catalogue holds (the shipped wire), sorted."""
    data = json.loads(wire.read_text(encoding="utf-8"))
    return sorted({d.get("iso2") for d in data.get("destinations", {}).values() if d.get("iso2")})


def load_cache(path: Path = CACHE) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def build(countries, cache=None, today=None) -> dict:
    today = today or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    cache = cache or {}
    out = {}
    for iso2 in countries:
        rules = rules_for(iso2)
        for line in rules.values():
            line["checked"] = RULES_CHECKED
        advice = None
        if GOVUK_SLUG.get(iso2):
            seen = cache.get(GOVUK_SLUG[iso2]) or {}
            advice = {
                "src": "govuk_fta",
                "url": govuk_url(iso2, part=None),
                "checked": seen.get("checked") or RULES_CHECKED,
                "updated": seen.get("updated"),
            }
            # A line that rests on the GOV.UK entry page takes the date the
            # pipeline last read that page, when it is newer than the table.
            if seen.get("checked") and seen["checked"] > RULES_CHECKED:
                rules["uk"]["checked"] = seen["checked"]
        out[iso2] = {"zone": zone_of(iso2), "rules": rules, "advice": advice,
                     "_src": LAYER_SRC, "_asof": today}
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": today,
        "groups": list(GROUPS),
        "codes": list(CODES),
        "sources": SOURCES,
        "countries": out,
    }


def validate(doc) -> list[str]:
    """The contract of entry_rules.json; the app's check (scripts/ci/
    contract.mjs validateEntryRules) words the same rules."""
    bad = []
    if not isinstance(doc, dict):
        return ["entry_rules.json is not an object"]
    if doc.get("schema_version") != SCHEMA_VERSION:
        bad.append(f"entry_rules.json schema_version is {doc.get('schema_version')!r}, expected {SCHEMA_VERSION}")
    sources = doc.get("sources")
    if not isinstance(sources, dict) or not sources:
        bad.append("entry_rules.json sources is missing")
        sources = {}
    for sid, s in sources.items():
        if not (isinstance(s, dict) and str(s.get("url", "")).startswith("https://") and s.get("licence")):
            bad.append(f"sources.{sid} needs an https url and a licence")
    countries = doc.get("countries")
    if not isinstance(countries, dict) or not countries:
        return bad + ["entry_rules.json countries is missing or empty"]
    for iso2, c in countries.items():
        at = f"countries.{iso2}"
        if not re.fullmatch(r"[A-Z]{2}", iso2) or not isinstance(c, dict):
            bad.append(f"{at} is not a country block")
            continue
        if c.get("_src") != LAYER_SRC or not DATE_RE.match(str(c.get("_asof", ""))):
            bad.append(f"{at} lacks _src or _asof")
        rules = c.get("rules") or {}
        for g in GROUPS:
            line = rules.get(g)
            if not isinstance(line, dict):
                bad.append(f"{at}.rules.{g} is missing")
                continue
            needs = line.get("needs")
            if not isinstance(needs, list) or not needs or any(n not in CODES for n in needs):
                bad.append(f"{at}.rules.{g}.needs {needs!r} is not a list of known codes")
            if not DATE_RE.match(str(line.get("checked", ""))):
                bad.append(f"{at}.rules.{g}.checked is not a date")
            src = line.get("src")
            if src is not None and src not in sources:
                bad.append(f"{at}.rules.{g}.src {src!r} is not in sources")
            if src is not None and not str(line.get("url", "")).startswith("https://"):
                bad.append(f"{at}.rules.{g}.url is not an https link")
            if src is None and needs not in (["own_country"], ["check_official"]):
                bad.append(f"{at}.rules.{g} has no source")
        adv = c.get("advice")
        if adv is not None and (adv.get("src") not in sources
                                or not str(adv.get("url", "")).startswith("https://")
                                or not DATE_RE.match(str(adv.get("checked", "")))):
            bad.append(f"{at}.advice needs a known src, an https url and a checked date")
    return bad


# --------------------------------------------------------------------- refresh

API = "https://www.gov.uk/api/content/foreign-travel-advice/{slug}"
UA = "CartaEntryRules/1.0 (+https://carta-europetravel.com)"


def parse_govuk(payload: dict) -> dict:
    """The two facts the layer keeps from a GOV.UK Content API page: its own
    update date and whether it has an entry requirements part."""
    stamp = payload.get("public_updated_at") or payload.get("updated_at") or ""
    parts = (payload.get("details") or {}).get("parts") or []
    return {
        "updated": stamp[:10] if DATE_RE.match(stamp[:10]) else None,
        "entry_part": any(p.get("slug") == "entry-requirements" for p in parts if isinstance(p, dict)),
    }


def refresh(slugs, cache_path: Path = CACHE, fetch=None, today=None) -> dict:
    """Read each GOV.UK page; a page that fails keeps what the cache had."""
    today = today or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    cache = load_cache(cache_path)

    def _get(url):
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)

    fetch = fetch or _get
    ok = failed = 0
    for slug in sorted({s for s in slugs if s}):
        try:
            facts = parse_govuk(fetch(API.format(slug=slug)))
        except (urllib.error.URLError, OSError, ValueError) as e:
            print(f"  [skip] {slug}: {type(e).__name__}")
            failed += 1
            continue
        cache[slug] = {**facts, "checked": today}
        ok += 1
        time.sleep(0.2)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_json(cache_path, cache, indent=1)
    print(f"[entry_rules] GOV.UK pages read {ok}, failed {failed}")
    return cache


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--refresh", action="store_true", help="read the GOV.UK Content API first")
    ap.add_argument("--check", action="store_true", help="validate the shipped file and stop")
    a = ap.parse_args(argv)
    if a.check:
        problems = validate(json.loads(OUT.read_text(encoding="utf-8")))
        for p in problems:
            print("  FAIL", p)
        return 1 if problems else 0
    countries = catalogue_countries()
    cache = refresh([GOVUK_SLUG.get(c) for c in countries]) if a.refresh else load_cache()
    doc = build(countries, cache)
    problems = validate(doc)
    if problems:
        for p in problems:
            print("  FAIL", p)
        return 1
    atomic_write_json(OUT, doc, indent=None, separators=(",", ":"))
    print(f"[entry_rules] {len(doc['countries'])} countries x {len(GROUPS)} groups -> {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
