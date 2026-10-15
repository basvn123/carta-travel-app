"""Where a place is, said from our own spine (T456).

The T451 fact check found place lines that were wrong:
  - "Lake Constance, Vorarlberg, Switzerland" (Vorarlberg is Austria);
  - "lake Bolsena, Province of Rome" (it is Viterbo);
  - "Preveli Beach, Άγιος Βασίλειος Κορινθίας" (Preveli is on Crete, and the
    line was in Greek script on a Latin screen);
  - walks round Mützenich, a German village, filed under Belgium;
  - a sea bay, a ria, an estuary and some thirty car parks listed as lakes.

The lake and beach `region` was the first Wikidata P131 label of the item,
whichever came first, and a lake on a border was published once per country
with the same label. Every row already carries `rg`, the NUTS 3 region its
point falls in (pipeline/regions), so the region a reader sees is that
region's Latin name whenever it lies in the row's own country. The Wikidata
label stays only where NUTS has nothing (the UK, outside 2021 NUTS) or the
point falls across the border, and then only if it is in Latin script and
belongs to the row's country.

export_lakes.py, export_beaches.py, export_peaks.py and the trail
export_wire.py call these when they build the wire; repair_places_wire.py
applies them to the wire already published.
"""
from __future__ import annotations

import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NUTS_FILE = ROOT / "cache" / "nuts3_2021.geojson"

# NUTS writes Greece as EL; the wire writes GR. The UK left NUTS: its rows
# carry the ITL codes (TL...), Northern Ireland among them, which is GB.
NUTS_CC = {"EL": "GR", "TL": "GB", "UK": "GB"}


@lru_cache(maxsize=1)
def nuts3() -> dict:
    try:
        feats = json.loads(NUTS_FILE.read_text(encoding="utf-8"))["features"]
    except (OSError, ValueError, KeyError):
        return {}
    return {f["properties"]["NUTS_ID"]: f["properties"] for f in feats}


def nuts_country(code: str | None) -> str | None:
    if not code or len(code) < 2:
        return None
    return NUTS_CC.get(code[:2], code[:2])


def nuts_name(n3: str | None) -> str | None:
    """A NUTS 3 region's Latin name as a reader says it: "Arr. Bastogne" is
    Bastogne, "München, Kreisfreie Stadt" is München."""
    props = nuts3().get(n3 or "")
    if not props:
        return None
    name = (props.get("NAME_LATN") or "").strip()
    name = re.sub(r"^Arr\.\s+", "", name)
    name = re.sub(r",\s*(Kreisfreie Stadt|Landkreis|Stadtkreis|Statutarstadt)$", "", name)
    return name or None


def is_latin(text: str) -> bool:
    letters = [c for c in text if c.isalpha()]
    return all("LATIN" in unicodedata.name(c, "") for c in letters)


def region_owners(rows: list[dict]) -> dict:
    """Which country each region label belongs to, read off the rows whose
    own point agrees: the label's most common country among them."""
    votes: dict = {}
    for r in rows:
        label = r.get("region")
        if not label:
            continue
        if nuts_country((r.get("rg") or {}).get("n3") or (r.get("rg") or {}).get("n2")) == r.get("cc"):
            votes.setdefault(label, {}).setdefault(r["cc"], 0)
            votes[label][r["cc"]] += 1
    return {label: max(v, key=v.get) for label, v in votes.items()}


def region_for(row: dict, owners: dict) -> str | None:
    """The region a lake or beach card prints, or None."""
    rg = row.get("rg") or {}
    n3 = rg.get("n3")
    if n3 and nuts_country(n3) == row.get("cc"):
        name = nuts_name(n3)
        if name and is_latin(name):
            return name
    label = row.get("region")
    if not label or not is_latin(label):
        return None
    owner = owners.get(label)
    if owner and owner != row.get("cc"):
        return None
    return label


# What the lakes harvest let in that is not a lake: sea bays, rias, estuaries,
# fjords, tidal pools, beaches, car parks, viewpoints.
NOT_LAKE_RE = re.compile(
    r"\b(bay|estuary|estuario|fjord|fiord|ria|tidal pool|car ?park|carpark|parking|"
    r"view ?point|beach|beach club|sea|gulf|golfo|firth|sound|baie|bucht|zatoka)\b",
    re.IGNORECASE,
)


def is_lake(row: dict) -> bool:
    return not NOT_LAKE_RE.search(row.get("name") or "")


# Hand corrections the fact check found, by wire id: a field to set (None
# drops it) or `drop: True` for a row that is not what its layer says.
BEACH_FIXES = {
    "fr-calanques-de-piana-Q1026237": {"drop": True},          # a cliff coast, no beach
    "ie-inch-beach-Q111417107": {"lengthM": 5000},              # the OSM relation is the peninsula
    "cy-nissi-beach-Q7041122": {"drop_tags": ["cliffs", "surf"]},  # a flat, calm bay
    "gr-navagio-Q2460851": {"surface": "pebble"},               # white shingle
}
MOUNTAIN_FIXES = {
    "fi-aavasaksa-Q303806": {"range": None},                    # a Tornio valley hill
}


def apply_fixes(row: dict, fixes: dict) -> bool:
    """Apply a row's hand fix; False when the row should be dropped."""
    fix = fixes.get(row.get("id"))
    if not fix:
        return True
    if fix.get("drop"):
        return False
    for key, value in fix.items():
        if key == "drop_tags":
            row["tags"] = [t for t in row.get("tags") or [] if t not in value]
        elif value is None:
            row.pop(key, None)
        else:
            row[key] = value
    return True


# A walk is filed under the country its line runs in. A long route crosses
# borders and stays where the lab put it; a short walk whose midpoint lies in
# another catalogue country belongs to that country.
SHORT_WALK_M = 30_000


def trail_country(rg: dict | None, filed: str, distance_m: float | None, known: set) -> str:
    n2 = (rg or {}).get("n2")
    there = nuts_country(n2)
    if there and there != filed and there in known and (distance_m or 0) < SHORT_WALK_M:
        return there
    return filed
