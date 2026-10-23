"""T641: the practical keys harvested from open sources, as dossier additions.

Tier: Library (called by build_dossier.py; kept out of that file so the two
stay mergeable)

Reads the overlays the T641 harvests write under cache/ (explore_overlay):
    dest_emergency          harvest_emergency.py
    dest_transit            transit/gtfs_lines.py
    dest_transit_ferry      transit/osm_ferry_legs.py
    dest_swim_bans          harvest_swim_bans.py
    poi_fees                harvest_poi_fees.py

and answers, per destination:
    practical_extras(did)   -> {"emergency": {...}, "transit": {"train": [...], ...}}
    water_bans(did)         -> [ {site, reason, ...} ] or None
    poi_facts(lat, lon)     -> {"fee": "yes"|"no", "price": {...}} or {}

A key is returned only when its overlay has a row; a missing file or row gives
nothing, so the dossier is unchanged until a harvest ran. Each transit mode is
a list of lines `{name, from, to, minutes?, operator?, freq_per_day?, source,
date, method}`; an empty mode is omitted, never written as an empty list.

ASCII clean, no em dashes, per project convention.
"""
from __future__ import annotations

import os
import sys

_PIPELINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PIPELINE not in sys.path:
    sys.path.insert(0, _PIPELINE)
import explore_overlay as ov  # noqa: E402

MODES = ("train", "bus", "ferry")


def practical_extras(did: str) -> dict:
    out: dict = {}
    em = ov.load_rows("dest_emergency").get(did)
    if em:
        block = {k: em[k] for k in ("numbers", "general", "hospital", "src") if em.get(k)}
        if block:
            out["emergency"] = block
    transit: dict = {}
    for name in ("dest_transit", "dest_transit_ferry"):
        row = ov.load_rows(name).get(did) or {}
        for mode in MODES:
            legs = [dict(leg) for leg in row.get(mode) or [] if leg.get("from") and leg.get("to")]
            if legs:
                transit.setdefault(mode, []).extend(legs)
    for mode in list(transit):
        seen, kept = set(), []
        for leg in transit[mode]:
            k = (leg["name"], leg["from"], leg["to"])
            if k not in seen:
                seen.add(k)
                kept.append(leg)
        transit[mode] = kept[:8]
    if transit:
        out["transit"] = transit
    return out


def water_bans(did: str):
    rows = ov.load_rows("dest_swim_bans").get(did)
    return list(rows) if rows else None


def poi_facts(lat, lon) -> dict:
    if lat is None or lon is None:
        return {}
    row = ov.load_rows("poi_fees").get(f"{lat:.4f},{lon:.4f}") or {}
    out = {}
    if row.get("fee") in ("yes", "no"):
        out["fee"] = row["fee"]
    if row.get("price"):
        out["price"] = row["price"]
    return out
