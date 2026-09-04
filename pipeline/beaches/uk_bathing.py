"""Bathing water quality for Great Britain, which the EEA register stopped
covering after Brexit.

The EEA WISE register is EU-27 plus Albania and Switzerland. Great Britain
publishes 120 beaches in this catalogue at the old cap and not one of them
carries a water class, because the register the rest of Europe is read from
no longer has a UK section. The data still exists; it is published by the
national regulators instead, and it is Open Government Licence v3.0, which is
storable and commercially usable.

Four regulators, four feeds, and only two of them are settled:

  England    Environment Agency, environment.data.gov.uk/bwq/. A linked data
             service with REST, JSON, CSV and SPARQL, weekly in season, and
             an api-reference document. This is the feed 03-BEACHES.md names.
  Wales      Natural Resources Wales, published through the same Defra
             service under a Wales section.
  Scotland   SEPA. bathingwaters.sepa.org.uk carries the classifications for
             80-odd designated waters and marine.gov.scot republishes them as
             JSON and XML with a WMS for the geometry. NOT wired here: the
             brief flags it unverified and it needs a portal read first.
  N Ireland  DAERA. Same status, and the smaller of the two holes.

STATE OF PLAY, recorded rather than hidden: every path under
environment.data.gov.uk/bwq/ answers HTTP 403 from this network, served by an
Azure Application Gateway, while the same host's root page answers 200. That
is a gateway rule rather than a retired service: the API reference is still
published and data.gov.uk still points every bathing water dataset at it. So
the client below is written to the documented interface and is exercised the
moment the block lifts or the code runs from somewhere it does not apply,
and until then GB beaches take the honest path that Norway and Iceland take:
the water component is DROPPED and the remaining weights renormalised, never
defaulted to a class nobody measured.

Usage, from the repo root:
    python pipeline/beaches/uk_bathing.py --fetch
    python pipeline/beaches/uk_bathing.py            # what is cached
"""

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# Windows consoles default to cp1252, and this layer prints beach names:
# "Ir-Ramla tal-Mixquqa" and "Plaza Zlatni Rat" both raise UnicodeEncodeError
# on the way to a terminal that cannot spell them. Replacing the character is
# right for a progress line and wrong for a data file, which is why this
# touches stdout only; every cache and wire write goes through an explicit
# encoding="utf-8".
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

ROOT = HERE.parents[1]
CACHE = ROOT / "cache" / "uk_bathing_water.json"

CONTACT = "bas.vannieuwenhuyse123@gmail.com"
UA = f"CartaBeaches/1.0 (https://carta-europetravel.com; {CONTACT})"

# The documented entry points. `_pageSize` is the service's own paging
# parameter and 500 is its published ceiling.
BASE = "https://environment.data.gov.uk/doc"
ENDPOINTS = {
    "GB-ENG": f"{BASE}/bathing-water.json",
    "GB-WLS": f"{BASE}/bathing-water.json",
}
PAGE = 500

# The Directive classes, spelled as the Defra service spells them, mapped to
# the spelling the rest of this layer speaks.
CLASS_MAP = {
    "excellent": "Excellent", "good": "Good",
    "sufficient": "Sufficient", "poor": "Poor",
}

_cache = None


def load():
    """Everything cached, or {} when the fetch has never succeeded."""
    global _cache
    if _cache is None:
        try:
            _cache = json.loads(CACHE.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            _cache = {}
    return _cache


def sites():
    return (load().get("sites") or [])


def covers(iso2):
    """Whether a real reading exists for this country.

    False is a complete answer and the caller must treat it as one: it means
    "no source publishes here", which drops the water component rather than
    defaulting it."""
    iso2 = (iso2 or "").upper()
    return any((s.get("iso2") or "").upper() == iso2 for s in sites())


def _get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA,
                                               "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _row(item):
    """One Defra bathing water, in the shape the EEA rows already use, so
    everything downstream reads one format."""
    name = (item.get("name") or {})
    label = item.get("label") or name.get("_value") or ""
    if isinstance(label, list):
        label = label[0] if label else ""
    point = item.get("samplingPoint") or {}
    lat = point.get("lat", item.get("lat"))
    lon = point.get("long", item.get("long"))
    if lat is None or lon is None:
        return None
    grade = ((item.get("latestComplianceAssessment") or {})
             .get("complianceClassification") or {}).get("name")
    if isinstance(grade, dict):
        grade = grade.get("_value")
    country = (item.get("country") or {}).get("_value") or ""
    return {
        "bwid": str(item.get("eubwidNotation") or item.get("_about") or "")
                .rsplit("/", 1)[-1],
        "name": str(label).strip(),
        "country": "Wales" if "wales" in country.lower() else "England",
        "iso2": "GB",
        "type": "Coastal",
        "lat": float(lat),
        "lon": float(lon),
        "q": CLASS_MAP.get(str(grade or "").strip().lower(), ""),
        "q1": "", "q3": "", "q10": "",
        "profile": item.get("_about") or "",
    }


def fetch(verbose=True):
    """Pull the register and cache it. Returns (rows, error)."""
    rows, seen = [], set()
    for label, url in ENDPOINTS.items():
        page = 0
        while True:
            query = urllib.parse.urlencode({"_pageSize": PAGE, "_page": page})
            try:
                payload = _get(f"{url}?{query}")
            except urllib.error.HTTPError as exc:
                note = (f"{label}: HTTP {exc.code} from "
                        f"{urllib.parse.urlsplit(url).netloc}")
                if exc.code == 403:
                    note += (" (Azure Application Gateway; the host's root "
                             "answers 200, so this is a gateway rule rather "
                             "than a retired service)")
                return rows, note
            except Exception as exc:
                return rows, f"{label}: {type(exc).__name__}: {exc}"
            items = ((payload.get("result") or {}).get("items") or [])
            if not items:
                break
            for item in items:
                row = _row(item)
                if row and row["bwid"] and row["bwid"] not in seen:
                    seen.add(row["bwid"])
                    rows.append(row)
            if verbose:
                print(f"  {label}: {len(rows)} sites so far")
            if len(items) < PAGE:
                break
            page += 1
    return rows, ""


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--fetch", action="store_true")
    args = ap.parse_args()
    if not args.fetch:
        rows = sites()
        print(f"{len(rows)} UK bathing waters cached "
              f"({'GB covered' if covers('GB') else 'GB NOT covered'})")
        if not rows:
            print("  run with --fetch. If it returns 403, that is the "
                  "documented gateway block: GB beaches then publish with "
                  "the water component dropped, which is the correct "
                  "behaviour and not a failure.")
        return
    rows, error = fetch()
    if error:
        print(f"  fetch failed: {error}")
    if not rows:
        # Nothing replaces something: a failed fetch must never overwrite a
        # cache that already holds readings.
        print("  no rows, cache left as it was")
        return
    CACHE.write_text(json.dumps({
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "Environment Agency and Natural Resources Wales, OGL v3.0",
        "sites": rows,
    }, ensure_ascii=False), encoding="utf-8")
    print(f"  {len(rows)} UK bathing waters -> {CACHE}")


if __name__ == "__main__":
    main()
