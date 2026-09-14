"""Offline basecamp geocoding for Carta records.

Uses the `geonamescache` package (bundled GeoNames extract, no network) so the
pipeline stays reproducible. Every coordinate carries a `precision` field:

  source   — latitude/longitude stated in the source record
  city     — matched a named basecamp or sub-region town in the trip's country
  gateway  — matched only the gateway airport's city, which can be hours away
  country  — fell back to the country's capital; a map pin, not a location
"""
from __future__ import annotations

import re
import unicodedata

try:
    import geonamescache
except ImportError:  # pragma: no cover
    geonamescache = None

_CACHE = None
_CITY_INDEX = None
_CAPITALS = None


def _fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", str(text))
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z ]+", " ", text.lower()).strip()


def _load():
    global _CACHE, _CITY_INDEX, _CAPITALS
    if _CITY_INDEX is not None or geonamescache is None:
        return
    _CACHE = geonamescache.GeonamesCache()
    index = {}
    for city in _CACHE.get_cities().values():
        key = (city["countrycode"], _fold(city["name"]))
        best = index.get(key)
        if best is None or city["population"] > best["population"]:
            index[key] = city
        for alt in city.get("alternatenames") or []:
            akey = (city["countrycode"], _fold(alt))
            if akey not in index:
                index[akey] = city
    _CITY_INDEX = index

    capitals = {}
    for code, country in _CACHE.get_countries().items():
        cap = country.get("capital")
        if cap:
            hit = index.get((code, _fold(cap)))
            if hit:
                capitals[code] = (hit["latitude"], hit["longitude"], cap)
    # microstates and territories GeoNames does not resolve by capital name
    capitals.setdefault("MC", (43.7325, 7.4197, "Monaco"))
    capitals.setdefault("SM", (43.9357, 12.4475, "San Marino"))
    capitals.setdefault("LI", (47.1410, 9.5209, "Vaduz"))
    capitals.setdefault("XK", (42.6629, 21.1655, "Pristina"))
    capitals.setdefault("FO", (62.0079, -6.7900, "Tórshavn"))
    capitals.setdefault("AD", (42.5078, 1.5211, "Andorra la Vella"))
    _CAPITALS = capitals


def _clean_place(part):
    part = re.sub(r"\(.*?\)", "", part).strip()
    part = re.sub(r"^(the|a)\s+", "", part, flags=re.I).strip()
    part = re.sub(r"\b(nights?|days?)\s*\d.*$", "", part, flags=re.I).strip()
    return part


def _basecamp_places(trip):
    out = []
    for base in trip.get("basecamps") or []:
        for part in re.split(r"\s*(?:,|/| and | & |\bthen\b|\bto\b|\bvia\b)\s*", base):
            part = _clean_place(part)
            if 2 < len(part) < 40:
                out.append(part)
    return out


def _subregion_places(trip):
    out = []
    for part in re.split(r"\s*(?:—|–|,|&| and )\s*", trip.get("subRegion") or ""):
        part = _clean_place(part)
        if 2 < len(part) < 40:
            out.append(part)
    return out


def _gateway_places(trip):
    gateway = trip.get("gatewayAirport") or ""
    if not gateway:
        return []
    head = re.split(r"[—–;,(]", gateway)[0]
    head = re.sub(r"\b[A-Z]{3}\b", "", head).strip()
    head = _clean_place(head)
    return [head] if 2 < len(head) < 40 else []


def geocode_trip(trip):
    """Return a coordinates dict, or None when nothing can be resolved.

    Tiers, best first: coordinates stated in the source; a named basecamp town;
    a town named in the sub-region; the gateway airport's city (which can be far
    from the trip itself, so it is labelled `gateway`); the country capital.
    """
    existing = trip.get("coordinates")
    if existing and existing.get("lat") is not None:
        return {"lat": round(float(existing["lat"]), 4),
                "lon": round(float(existing["lon"]), 4),
                "precision": "source",
                "matchedPlace": (trip.get("basecamps") or [None])[0],
                "source": "source record"}
    _load()
    if _CITY_INDEX is None:
        return None
    codes = [c["code"] for c in trip.get("countries") or []] or [trip.get("countryCode")]
    tiers = (
        ("city", _basecamp_places(trip)),
        ("city", _subregion_places(trip)),
        ("gateway", _gateway_places(trip)),
    )
    for precision, places in tiers:
        for place in places:
            for code in codes:
                hit = _CITY_INDEX.get((code, _fold(place)))
                if hit:
                    return {"lat": round(float(hit["latitude"]), 4),
                            "lon": round(float(hit["longitude"]), 4),
                            "precision": precision,
                            "matchedPlace": hit["name"],
                            "source": "geonames (geonamescache, cities > 15k)"}
    code = codes[0]
    if code in _CAPITALS:
        lat, lon, name = _CAPITALS[code]
        return {"lat": round(lat, 4), "lon": round(lon, 4),
                "precision": "country",
                "matchedPlace": name,
                "source": "country capital fallback"}
    return None
