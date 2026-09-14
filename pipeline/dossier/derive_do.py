"""Derive "best things to do" for EVERY destination from open data alone.

The web sweep (research_do.py) produces the strongest evidence there is, but
it needs a search credential and a human-scale budget, so it will always lead
the famous places and trail the long tail. This module is the floor under it:
a keyless, deterministic pass that gives all 3,038 destinations a real things
to do section, and it runs in seconds off files already on disk.

The corroboration principle is unchanged, only the attesting bodies differ.
The web sweep ships an item when three independent PUBLISHERS name it. This
pass ships an item when independent INSTITUTIONS attest it, and they are
genuinely independent of each other:

  wikivoyage   a human editor put it in the article's See or Do section
  wikipedia    it has its own encyclopedia article (strength = sitelinks)
  heritage     a heritage register or UNESCO lists it
  osm          OpenStreetMap and OpenTripMap mapped and rated it must-see
  layer        it is a published trail, beach, lake or mountain that passed
               its own harvest, enrich, validate and export gates
  wikidata     a recurring event with its own item

A Wikivoyage editor, the Wikipedia community, a national heritage register
and OSM mappers are not each other's sources. Two of them agreeing on a place
is a fact about the world in exactly the way three blog domains is, and it is
reproducible, which a listicle sweep never is.

What this pass will NOT do is pretend to be the other one. Items carry
evidence.method = "open" and the renderers say "3 independent sources list
this", never "named by 3 of 40 guides". A reader can tell which is which.

Candidates favour ACTIVITIES over sights on purpose: the highlights section
already carries the churches and museums, so this section wants the hike, the
swim, the thermal bath, the festival, the cable car and the market.

ASCII clean, no em dashes, per project convention.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from common import (  # noqa: E402
    is_self_reference, name_matches, name_tokens, norm_name, usable_desc,
)

# POI kinds that are an activity rather than a sight, mapped to the do-type
# the renderers colour-code.
ACTIVE_TYPE = {
    "Swimming": "swim", "Water park": "swim", "Diving": "swim",
    "Surfing": "activity", "Skiing": "activity", "Climbing": "activity",
    "Canyon": "activity", "Glacier": "activity", "Theme park": "activity",
    "Ferris wheel": "activity", "Activity": "activity", "Attraction": "activity",
    "Sauna & baths": "experience", "Market": "experience",
    "Peak": "activity", "Nature reserve": "activity", "Viewpoint": "activity",
    "Cave": "activity", "Waterfall": "activity",
}

# Kinds that are sights, not things to do: the highlights section owns them.
SIGHT_KINDS = {
    "Church", "Cathedral", "Basilica", "Monastery", "Mosque", "Synagogue",
    "Museum", "Palace", "Castle", "Tower", "Monument", "Gate", "Square",
    "Bridge", "Theatre", "Ruins", "Landmark", "Old town",
}

MIN_SOURCES = 2      # two independent institutions, or one validated layer entity
CAP = 10

# A name that is only a route code ("(SH-MR-011)", "E4", "GR 11") tells a
# reader nothing, and neither does a bare category word: a Wikivoyage listing
# called "Cinema" is a category with a marker on it, not a thing to do.
import re  # noqa: E402

JUNK_NAME_RE = re.compile(
    r"^[\s(\[]*(?:[a-z]{0,3}[\s.-]?\d{1,4}[a-z]?|[a-z]{1,3}[-\s]?[a-z]{1,3}[-\s]?\d{1,4})"
    r"[\s)\]]*$", re.I)

GENERIC_NAMES = {
    "cinema", "theatre", "theater", "museum", "park", "beach", "market",
    "castle", "church", "cathedral", "library", "stadium", "restaurant",
    "bar", "cafe", "pub", "swimming pool", "pool", "spa", "zoo", "aquarium",
    "gallery", "monastery", "mosque", "synagogue", "harbour", "harbor",
    "port", "square", "town hall", "city hall", "bus station", "train station",
    "shopping", "shopping centre", "shopping center", "casino", "nightlife",
    "hiking", "cycling", "swimming", "skiing", "walking", "old town",
}


# OSM files public transport relations alongside walking routes, and they come
# through named by their line code: "ST701 Sofia - Mladost3" is a bus, not a
# hike. A leading letter-and-number code is the reliable tell.
ROUTE_CODE_RE = re.compile(r"^[A-Z]{1,3}\s?\d{2,4}\b")


def usable_name(name):
    n = (name or "").strip()
    if len(n) < 3 or JUNK_NAME_RE.match(n) or ROUTE_CODE_RE.match(n):
        return False
    return norm_name(n) not in GENERIC_NAMES


def _sitelinks(poi_wd, wiki_url):
    rec = poi_wd.get(wiki_url or "") if wiki_url else None
    return rec.get("sitelinks", 0) if isinstance(rec, dict) else 0


def _fmt_km(km):
    return f"{km:.0f} km" if km >= 1 else f"{km * 1000:.0f} m"


def derive(dest, items, highlights, nearby, listings, events, poi_wd,
           taken=(), landmarks=()):
    """Open-data things to do. `taken` are names the web sweep already shipped."""
    seen = {norm_name(n) for n in taken}
    seen |= {norm_name(h["name"]) for h in highlights or []}
    # Exact names dedupe cheaply above; these catch the same place spelled
    # differently by a different body, which exact matching misses entirely
    # ("Cathedral of Notre Dame" in the highlights, "Notre Dame Cathedral" in
    # the Wikivoyage listing). Includes the destination itself: a place is
    # not a thing to do in itself, and Terceira's landmarks offer "Terceira
    # Island", which is the island the reader is already standing on.
    self_name = re.sub(r"\s*\([^)]*\)\s*$", "", dest.get("city") or "")
    dup_tokens = {name_tokens(h["name"]) for h in highlights or []}
    dup_tokens |= {name_tokens(n) for n in taken}
    out = []

    def push(entry, sources, curated=False):
        """`curated` marks a Wikivoyage Do listing: an editor explicitly
        recommending an activity, which ships on its own. The count still
        reports only the distinct bodies attesting it, never an inflated one:
        a source that says the same thing twice is one source."""
        n = norm_name(entry["name"])
        if not n or n in seen or not usable_name(entry["name"]):
            return
        if is_self_reference(entry["name"], self_name):
            return
        if name_matches(entry["name"], dup_tokens):
            return
        if len(sources) < MIN_SOURCES and not curated:
            return
        seen.add(n)
        dup_tokens.add(name_tokens(entry["name"]))
        entry["sources"] = sorted(sources)
        ev = {"method": "open", "n_sources": len(sources),
              "sources": sorted(sources)}
        if curated:
            ev["curated"] = "wikivoyage_do"
        entry["evidence"] = ev
        out.append({k: v for k, v in entry.items() if v is not None})

    # ---- the Wikivoyage Do section: an editor naming an activity outright.
    rec = listings.get(dest["id"]) if isinstance(listings, dict) else None
    wv_do, wv_see = [], []
    for li in (rec or {}).get("listings", []):
        if not li.get("name"):
            continue
        (wv_do if li.get("type") == "do" else wv_see).append(li)

    poi_by_norm = {}
    for it in items or []:
        if it.get("name"):
            poi_by_norm.setdefault(norm_name(it["name"]), it)

    for li in wv_do[:6]:
        srcs = {"wikivoyage"}
        poi = poi_by_norm.get(norm_name(li["name"]))
        if li.get("qid"):
            srcs.add("wikidata")
        if poi:
            srcs.add("osm")
            if poi.get("wiki"):
                srcs.add("wikipedia")
            if poi.get("heritage"):
                srcs.add("heritage")
        push({
            "name": li["name"],
            "type": ACTIVE_TYPE.get((poi or {}).get("kind"), "activity"),
            "detail": usable_desc((poi or {}).get("desc")),
        }, srcs, curated=True)

    # ---- published feature layers: each entity passed its own pipeline.
    for tr in (nearby or {}).get("trails", [])[:3]:
        # A named 1 km loop round a city park is a path, not a day out. Length
        # is the cheapest honest filter for that, and it keeps the section from
        # reading like an OSM dump in metros.
        if (tr.get("tier") or 0) < 2 or (tr.get("km_len") or 0) < 3:
            continue
        bits = []
        if tr.get("km_len"):
            bits.append(f"{tr['km_len']:.0f} km")
        if tr.get("duration_min"):
            h = tr["duration_min"] / 60
            bits.append(f"about {h:.0f} h" if h >= 1.5 else "under 90 min")
        if tr.get("difficulty"):
            bits.append(str(tr["difficulty"]))
        push({
            "name": tr["name"], "type": "trail",
            "detail": ", ".join(bits) or None,
            "ref": {"layer": "trails", "cc": tr["cc"], "id": tr["id"]},
        }, {"layer", "osm"})

    for layer in ("beaches", "lakes"):
        for f in (nearby or {}).get(layer, [])[:2]:
            if (f.get("tier") or 0) < 2:
                continue
            detail = f"{_fmt_km(f['km'])} away"
            # The beaches wire gives `water` as a string ("Excellent"); the
            # lakes wire gives a dict. Interpolating the dict printed a Python
            # repr into an English sentence.
            water = f.get("water")
            if isinstance(water, dict):
                water = water.get("class") or water.get("rating")
            if isinstance(water, str) and water:
                detail += f", water rated {water}"
            push({
                "name": f["name"], "type": "swim", "detail": detail,
                "ref": {"layer": layer, "cc": f["cc"], "id": f["id"]},
            }, {"layer", "eea" if f.get("water") else "osm"})

    for f in (nearby or {}).get("mountains", [])[:2]:
        if (f.get("tier") or 0) < 3:
            continue
        detail = f"{_fmt_km(f['km'])} away"
        if f.get("elev_m"):
            detail = f"{f['elev_m']} m summit, {detail}"
        push({
            "name": f["name"], "type": "activity", "detail": detail,
            "ref": {"layer": "mountains", "cc": f["cc"], "id": f["id"]},
        }, {"layer", "wikidata"})

    # ---- recurring events with their own Wikidata item.
    for ev in sorted(events or [], key=lambda e: -(e.get("links") or 0))[:3]:
        if not ev.get("name"):
            continue
        srcs = {"wikidata"}
        if (ev.get("links") or 0) >= 5:
            srcs.add("wikipedia")
        push({
            "name": ev["name"], "type": "festival",
            "detail": usable_desc(ev.get("desc")),
            "season": ev.get("months") or None,
            "link": ev.get("web") or ev.get("wp") or None,
        }, srcs)

    # ---- the active POIs: swims, baths, ski areas, viewpoints, caves.
    actives = []
    for it in items or []:
        kind = it.get("kind")
        if kind in SIGHT_KINDS or not it.get("name"):
            continue
        if not (it.get("active") or kind in ACTIVE_TYPE):
            continue
        srcs = {"osm"}
        if it.get("wiki"):
            srcs.add("wikipedia")
        if it.get("heritage"):
            srcs.add("heritage")
        if _sitelinks(poi_wd, it.get("wiki")) >= 3:
            srcs.add("wikidata")
        if norm_name(it["name"]) in {norm_name(x["name"]) for x in wv_see + wv_do}:
            srcs.add("wikivoyage")
        actives.append((len(srcs), it.get("rate") or 0, it, srcs))
    actives.sort(key=lambda t: (-t[0], -t[1]))
    for _, _, it, srcs in actives[:6]:
        push({
            "name": it["name"],
            "type": ACTIVE_TYPE.get(it.get("kind"), "activity"),
            "detail": usable_desc(it.get("desc")),
        }, srcs)

    # ---- Wikidata landmarks: the backstop that gives a remote village
    # something true to say. A place with its own article in eight languages
    # is attested by eight editorial communities, which is why it can ship on
    # the strength of that alone. Sights are still excluded: the highlights
    # section owns those, and what is wanted here is somewhere to go.
    VISITABLE = {"Cave", "Waterfall", "Canyon", "Glacier", "Peak", "Lake",
                 "Beach", "Island", "Viewpoint", "Nature reserve",
                 "National park", "Park", "Theme park", "Water park",
                 "Sauna & baths", "Swimming", "Market", "Old town", "Zoo",
                 "Aquarium", "Ruins", "Monastery"}
    for lm in sorted(landmarks or [], key=lambda x: -(x.get("sitelinks") or 0)):
        if lm.get("kind") not in VISITABLE:
            continue
        sl = lm.get("sitelinks") or 0
        srcs = {"wikidata", "wikipedia"} if sl >= 8 else {"wikidata"}
        if lm.get("img"):
            srcs.add("commons")
        detail = None
        if lm.get("km") is not None and lm["km"] >= 1:
            detail = f"{_fmt_km(lm['km'])} away"
        push({
            "name": lm["name"],
            "type": ("swim" if lm["kind"] in ("Beach", "Swimming", "Water park")
                     else "experience" if lm["kind"] in ("Sauna & baths", "Market")
                     else "activity"),
            "detail": detail,
        }, srcs)

    # Wikivoyage SEE listings are deliberately not a candidate source here.
    # They are sights, the highlights section already carries them, and the
    # brief for this page was explicit that the old "sights and areas" block
    # goes away rather than reappearing under a new heading. A section called
    # best things to do that lists three squares and a boulevard has lost the
    # thread, however well corroborated each one is.

    out.sort(key=lambda e: (-e["evidence"]["n_sources"],
                            0 if e["evidence"].get("curated") else 1))
    return out[:CAP]
