"""The EEA WISE bathing water register, read as a SPINE rather than as an
enrichment.

The layer already read this file. It read the CLASS: for each beach we had
found some other way, the bathing water quality of the nearest official site.
What it never read was the LIST.

There are 22,289 of them, and every one is a place a European government has
designated for swimming, monitored weekly through the season, and classified
on a four season rolling window under the Bathing Water Directive 2006/7/EC.
14,861 are coastal or transitional, 7,428 are lake or river. Each carries a
name, a coordinate, a registry identifier and up to ten years of class
history.

Most of them are not tagged `natural=beach` in OpenStreetMap. That is not a
gap in the register, it is a gap in the map: a municipal bathing beach in
Calabria with a lido, a lifeguard and a decade of Excellent readings can be
entirely absent from OSM and from Wikidata, and under the old harvest it was
therefore absent from the catalogue. Reading the register as a candidate
source roughly doubles the pool at zero network cost, and it is the highest
quality beach registry that exists for Europe.

What this module does NOT do:

  It does not invent a beach where a beach was already found. A site within
  MERGE_KM of a harvested beach whose name agrees is that beach, and it folds
  in as a water reading exactly as before. Only the sites nothing else knew
  about become rows.

  It does not pretend a registry name is a beach name. Member states register
  these under whatever local convention they use, and a good many are the
  municipality in capitals ("POGRADEC") rather than the beach. The name is
  title cased for display, the row records `name_src: "eea"` so the claim is
  auditable from the wire, and the export's name test still applies: a site
  whose name carries no word beyond the local word for beach is dropped like
  any other row.

  It does not carry a class into a country the register does not cover. The
  register is EU-27 plus Albania and Switzerland. Everywhere else, the water
  component is DROPPED and the weights renormalised (invariant 6), never
  defaulted to a class nobody measured. `covers()` is what the index asks.

ASCII clean, no em dashes, per project convention.
"""

import json
import re
import sys
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

ROOT = Path(__file__).resolve().parents[2]
REGISTER = ROOT / "cache" / "eea_bathing_water.json"

# Coastal and Transitional are the sea; Lake and River are the inland beaches
# the layer already publishes (Ohrid, the Masurian lakes, the Loire's plages).
SEA_TYPES = ("Coastal", "Transitional")
INLAND_TYPES = ("Lake", "River")

# How close an EEA site has to be to a beach we already hold before it is
# taken to be the same place. Wider than the harvest's own MERGE_KM of 0.6:
# a member state registers the sampling point, which is in the water and can
# sit a few hundred metres off the sand, while OSM maps the polygon. Names
# still have to agree at this distance, so a wider radius costs nothing but
# catches the offset.
MERGE_KM = 1.2
# Without name agreement, a site this close is still the same beach: two
# bathing sites 120 m apart are two ends of one strand, not two destinations.
SAME_PLACE_KM = 0.2

CLASSES = ("Excellent", "Good", "Sufficient", "Poor")

# The register speaks the EU statistical code, not ISO 3166-1. Greece is EL
# and the United Kingdom is UK, and both are silent failures rather than
# errors: a lookup for "GR" simply returns nothing, and Greece, which has
# 1,734 registered sites and is one of the two countries this layer exists
# for, would have contributed none of them. The coordinate join in
# enrich_beaches never noticed because it never asked for a country.
_ISO_ALIAS = {"EL": "GR", "UK": "GB"}


def _iso2(code):
    code = (code or "").strip().upper()
    return _ISO_ALIAS.get(code, code)


_register = None


def load_register():
    """Every site in the register, or [] when the cache has not been built.

    Cache first and cache only: this module never reaches the network. The
    file is written by pipeline/harvest_bathing_water.py --sites-only."""
    global _register
    if _register is None:
        try:
            _register = json.loads(REGISTER.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            _register = []
    return _register


def covers(iso2):
    """Whether the register has any site at all in this country.

    This is the question the water component asks, and the answer decides
    between two very different treatments. A country the register covers can
    have its unmeasured coves scored at the country median: no reading is not
    a bad reading. A country the register does not cover has no median to
    take, and defaulting there would be inventing a class for Norway out of
    Italy's samples. There the component is dropped and the remaining weights
    are renormalised."""
    iso2 = _iso2(iso2)
    return any(_iso2(s.get("iso2")) == iso2 for s in load_register())


def countries():
    """Every ISO2 the register carries, for the audit and the docs."""
    return sorted({_iso2(s.get("iso2"))
                   for s in load_register() if s.get("iso2")})


def sites_in(iso2, kinds=None):
    """The register's rows for one country, optionally by water category."""
    iso2 = _iso2(iso2)
    out = []
    for site in load_register():
        if _iso2(site.get("iso2")) != iso2:
            continue
        if kinds and site.get("type") not in kinds:
            continue
        if site.get("lat") is None or site.get("lon") is None:
            continue
        out.append(site)
    return out


# ---------------------------------------------------------------------------
# Names
# ---------------------------------------------------------------------------

# Registry decoration that is not part of the place's name. Member states
# prefix and suffix these freely: "PLAGE DE - LA CONCHE", "Spiaggia libera
# 200 m a nord del pontile". Stripped for display only; the original stays in
# the row as `name_registry` so the wire can be checked against the register.
_DECOR_RE = re.compile(
    r"^\s*(?:bw|zone de baignade|zona di balneazione|zona de ba[nñ]o|"
    r"badestelle|badeplass|strandbad|praia de|playa de|plage de|spiaggia di)"
    r"\s*[-:]?\s*", re.I)
_TRAILING_RE = re.compile(r"\s*[-,]\s*(?:nord|sud|est|ouest|centro|centre|"
                          r"north|south|east|west)\s*$", re.I)
# The sampling point number, not part of the name. Spain writes "punto de
# muestreo" as a PM1/PM2/PM3 suffix on 2,249 of its 2,296 registered sites,
# so "PLAYA RETORTA PM1" is Playa Retorta sampled at its first point. A bare
# trailing digit or roman numeral is NOT stripped: those distinguish adjacent
# registered stretches of one long strand, and folding them together would
# collide two real rows into one name.
_SAMPLE_POINT_RE = re.compile(r"\s+(?:pm|pt|p)\s*\d{1,2}\s*$", re.I)
# A code the register uses as a name, e.g. "IT_BW_0123" or a bare number.
_CODE_ONLY_RE = re.compile(r"^[\W\d_]*$|^[A-Z]{2}[_\-][A-Z0-9_\-]+$")


def display_name(site):
    """The registry name, made readable, or "" when there is nothing to show.

    Two transforms and no invention. A name in block capitals is title cased,
    because the register stores "CALA GONONE" and a card cannot shout. A name
    that is only a code is refused outright rather than shown: "IT_BW_0123" is
    an identifier wearing a name's clothes, and a catalogue that lists it has
    listed nothing."""
    raw = (site.get("name") or "").strip()
    if not raw or _CODE_ONLY_RE.match(raw):
        return ""
    name = _SAMPLE_POINT_RE.sub("", raw)
    name = _TRAILING_RE.sub("", _DECOR_RE.sub("", name)).strip(" -,`")
    if not name:
        return ""
    # Block capitals, or nearly: title case it. A name that already carries
    # lower case letters is left exactly as the member state wrote it, which
    # keeps "Cala d'Or" and "Praia da Rocha" from becoming "Cala D'Or".
    letters = [c for c in name if c.isalpha()]
    if letters and sum(1 for c in letters if c.isupper()) / len(letters) > 0.85:
        name = " ".join(w.capitalize() if w.isupper() else w
                        for w in name.split())
    return name


def site_id(site):
    """The stable key for a spine row: the register's own identifier.

    Never the coordinate and never the name. A member state may move a
    sampling point or fix a spelling between seasons, and either would orphan
    every saved favourite if the id were derived from them."""
    bwid = (site.get("bwid") or "").strip()
    if bwid:
        return bwid
    # A register row that predates the identifier field. Deterministic, and
    # only ever a fallback: re-run harvest_bathing_water.py --sites-only and
    # the real key returns.
    return "{}-{:.4f}-{:.4f}".format((_iso2(site.get("iso2")) or "xx").lower(),
                                     site.get("lat") or 0.0,
                                     site.get("lon") or 0.0)


# ---------------------------------------------------------------------------
# Water history
# ---------------------------------------------------------------------------

def water_block(site, km=0.0):
    """The `water` block a beach row carries, from one register row.

    `years` is how many of the ten recorded seasons hold a class at all. It is
    what separates a site classified once from one with a decade behind it,
    and it is the difference between a reading and a record."""
    seen = [site.get(k) for k in ("q", "q1", "q3", "q10")]
    years = sum(1 for value in seen if value in CLASSES)
    block = {
        "class": site.get("q") or "",
        "class_prev": site.get("q1") or site.get("q3") or "",
        "site": display_name(site) or (site.get("name") or ""),
        "type": site.get("type") or "",
        "km": round(km, 2),
        "id": site_id(site),
        "years": years,
    }
    if site.get("profile"):
        block["profile"] = site["profile"]
    return block


# ---------------------------------------------------------------------------
# Candidate rows
# ---------------------------------------------------------------------------

def candidate_rows(iso2, coastal_only=False):
    """The register's sites for one country, in the harvest's row shape.

    These are CANDIDATES. harvest_beaches.merge_spine folds every one that
    matches a beach already found into that beach, and only the remainder
    become rows of their own."""
    kinds = SEA_TYPES if coastal_only else (SEA_TYPES + INLAND_TYPES)
    out = []
    for site in sites_in(iso2, kinds):
        name = display_name(site)
        if not name:
            continue
        out.append({
            "eea_id": site_id(site),
            "name": name,
            "name_registry": (site.get("name") or "").strip(),
            "name_src": "eea",
            "lat": round(float(site["lat"]), 6),
            "lon": round(float(site["lon"]), 6),
            "iso2": _iso2(site.get("iso2")) or iso2,
            "coastal": site.get("type") in SEA_TYPES,
            "water": water_block(site),
        })
    return out


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--country", default="")
    args = ap.parse_args()
    if args.country:
        rows = candidate_rows(args.country.upper())
        print(f"{args.country.upper()}: {len(rows)} candidate rows")
        for row in rows[:12]:
            print(f"  {row['name']:<40} {row['water']['class']:<11} "
                  f"{'sea' if row['coastal'] else 'inland'}")
    else:
        reg = load_register()
        print(f"{len(reg)} sites in the register, "
              f"{len(countries())} countries")
        named = sum(1 for s in reg if display_name(s))
        print(f"  {named} carry a usable name")
        for kind in SEA_TYPES + INLAND_TYPES:
            print(f"  {kind}: {sum(1 for s in reg if s.get('type') == kind)}")
