"""Offline basecamp geocoding for Carta records.

Uses the `geonamescache` package (bundled GeoNames extract, no network) so the
pipeline stays reproducible. Every coordinate carries a `precision` field:

  source: latitude/longitude stated in the source record
  city: matched a named basecamp or sub-region town in the trip's country,
    or derived from the places the itinerary names (see below)
  gateway: matched only the gateway airport's city, which can be hours away
  country: fell back to the country's capital; a map pin, not a location

Itinerary derivation (T090, trips spec J1). geonamescache only knows towns
over 15,000 people, so most basecamps (Motovun, Capileira, Zabljak) never
resolved and 61 trips fell back to the capital and 54 to the gateway city.
When the GeoNames cities500 dump is available (every populated place over 500
people; `cache/geonames_cities500.txt` or the CARTA_GAZETTEER variable), the
coordinate is instead taken from the places the itinerary itself names: the
basecamps, the town in each night's sleep line, the day titles and the
sub-region. Each name is looked up inside the trip's stated countries only,
and the pin goes on the named place with the most support, meaning the most
weight of other named places within SUPPORT_KM of it. A sleep line counts
for more than a title because it is where the week is actually spent, and the
cluster rule is what keeps the arrival city ("Land at Tivat") or a homonym at
the other end of the country from winning on its own. Ties go to the place
named first.

Run as a script it re-derives the coordinates of the records whose pin is a
gateway or capital fallback and rewrites them in place (see main()).
"""
from __future__ import annotations

import collections
import json
import math
import os
import re
import sys
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


# --- itinerary derivation against GeoNames cities500 (T090) ---------------

HERE = os.path.dirname(os.path.abspath(__file__))
# pipeline/ -> carta-unified/carta-unified -> carta-unified -> Trips -> repo root
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(HERE))))
DEFAULT_GAZETTEER = os.path.join(REPO_ROOT, "cache", "geonames_cities500.txt")
# lat_min, lat_max, lon_min, lon_max; the south edge takes in Madeira (32.6 N)
# and the Canaries (27.6 N), which are Portugal and Spain
EUROPE_BBOX = (27.0, 72.5, -32.0, 45.0)

SUPPORT_KM = 20       # named places this close to a candidate count as support
SPREAD_CAP_KM = 500   # one far homonym adds at most this to a candidate's spread
GRID_DEG = 0.5        # cell size of the nearest-place lookup

# How much one mention counts. A basecamp and a night's sleep line say where
# the week is spent; a day title may be a day trip or the arrival airport.
W_BASECAMP = 3
W_SLEEP = 2
W_TITLE = 1
W_SUBREGION = 1

# Split a title, a sleep line or a basecamp into the place names it carries.
NAME_SPLIT_RE = re.compile(
    r"\s*(?:,|:|;|/|\||\u2014|\u2013|\(|\)|\band\b|\bor\b|\bthen\b|\bto\b|\bvia\b|"
    r"\binto\b|\bfrom\b|\bthrough\b|\bover\b|\bacross\b|\bon\b|\bat\b|\bin\b|"
    r"\bnear\b|\bback\b|\bout\b|\bup\b|\bdown\b|\babove\b|\bbelow\b|\bunder\b|"
    r"\bbeyond\b|\balong\b|\baround\b|\bbetween\b|\bpast\b|&|->|\u2192|\+)\s*", re.I)
# A part is dropped when its first word says it is not a town ("Hotel ...",
# "Rest day", "Departure"); the rest of a name may still carry such a word
# ("Lac Blanc" fails only if no populated place carries it).
NAME_STOP = {
    "hotel", "hostel", "pension", "guesthouse", "guest", "house", "refuge",
    "refugio", "rifugio", "hut", "huette", "cabin", "camp", "camping",
    "apartment", "apartments", "room", "rooms", "airport", "airport-side",
    "station", "day", "rest", "recovery", "night", "nights", "morning",
    "afternoon", "evening", "arrival", "arrive", "arriving", "land", "landing",
    "departure", "depart", "transfer", "return", "home", "out", "flight",
    "summit", "lake", "valley", "pass", "peak", "ridge", "coast", "bay",
    "island", "islands", "national", "park", "the", "a", "an", "old", "town",
    "city", "centre", "center", "north", "south", "east", "west", "upper",
    "lower", "small", "big", "long", "short", "easy", "hard", "full", "half",
    "first", "last", "loop", "circuit", "ring", "stage", "queen", "drive",
    "ride", "run", "walk", "hike", "climb", "descent", "traverse", "free",
    "local", "same", "your", "our", "one", "two", "three", "back", "final",
    "optional", "alternative", "spare", "buffer", "weather", "wild",
    # lodging words the sleep lines open with in other languages
    "quinta", "estalagem", "masseria", "agriturismo", "finca", "chalet",
    "chata", "penzion", "gasthof", "gasthaus", "albergue", "parador",
    "posada", "inn", "lodge", "aparthotel", "residence", "self-catering",
    # basecamp lines that describe a shape, not a town
    "point", "point-to-point", "multi", "multi-base", "various", "rotating",
    "see",
}
NAME_MIN_LEN = 4
NAME_MAX_WORDS = 4


def _rad_km(lat1, lon1, lat2, lon2):
    """Great-circle distance in kilometres."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371.0 * 2 * math.asin(min(1.0, math.sqrt(a)))


Place = collections.namedtuple("Place", "name lat lon cc pop src")


def _dump_label(path):
    """'cities500' for the cities500 dump, 'CZ dump' for a GeoNames country
    file such as CZ.txt; used in the coordinate's `source` string."""
    stem = os.path.splitext(os.path.basename(path))[0]
    if "cities500" in stem:
        return "cities500"
    return f"{stem} dump" if re.fullmatch(r"[A-Z]{2}", stem) else stem


class Gazetteer:
    """GeoNames populated places in Europe, from one or more dumps.

    The base is cities500 (every populated place over 500 people). GeoNames
    country files (download.geonames.org/export/dump/CZ.zip and so on) share
    its column layout and also list the hamlets and resort villages under 500
    people that many basecamps are (Malbun, Hrensko, Torla); only their
    populated places (feature class P) are read, so a hut, a peak or a hotel
    never becomes a pin. A place listed in two files is kept once.

    `by_name` maps a folded name (the official name, the ASCII name and every
    alternate name) to the places that carry it, so a lookup returns every
    homonym of the first file that knows the name. `nearest()` answers "which populated place is closest to this
    point", which is the validator's offline reverse geocode.
    """

    def __init__(self, source):
        self.source = source
        self.by_name = collections.defaultdict(list)
        self.grid = collections.defaultdict(list)
        self._seen = set()

    @classmethod
    def from_files(cls, paths):
        gaz = cls(", ".join(_dump_label(p) for p in paths))
        for tier, path in enumerate(paths):
            gaz._read(path, tier)
        return gaz

    @classmethod
    def from_cities500(cls, path):
        return cls.from_files([path])

    def _read(self, path, tier):
        label = _dump_label(path)
        lat_min, lat_max, lon_min, lon_max = EUROPE_BBOX
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                f = line.rstrip("\n").split("\t")
                if len(f) < 15 or f[6] != "P" or f[0] in self._seen:
                    continue
                try:
                    lat, lon = float(f[4]), float(f[5])
                    pop = int(f[14] or 0)
                except ValueError:
                    continue
                if not (lat_min <= lat <= lat_max and lon_min <= lon <= lon_max):
                    continue
                self._seen.add(f[0])
                place = Place(f[1], lat, lon, f[8], pop, label)
                keys = {_fold(n) for n in [f[1], f[2]] + (f[3].split(",") if f[3] else [])}
                for key in keys:
                    if key:
                        self.by_name[key].append((tier, place))
                self.grid[(int(lat // GRID_DEG), int(lon // GRID_DEG))].append(place)

    def lookup(self, name, codes):
        """Every place called `name` inside the given countries, from the
        first file that has one. cities500 is read first, so a name that a
        town of 500 people carries never resolves to a hamlet of the same
        name from a country file ("Zabljak" is the Durmitor town, not Zabljak
        Crnojevica by Lake Skadar); the country files answer only for names
        cities500 does not know."""
        hits = [(tier, p) for tier, p in self.by_name.get(_fold(name), ()) if p.cc in codes]
        if not hits:
            return []
        first = min(tier for tier, _ in hits)
        return [p for tier, p in hits if tier == first]

    def nearest(self, lat, lon, codes=None, max_rings=6):
        """(distance_km, place) of the closest populated place, optionally only
        among `codes`; None when nothing lies within max_rings grid cells."""
        ci, cj = int(lat // GRID_DEG), int(lon // GRID_DEG)
        best, hit_ring = None, None
        for ring in range(max_rings + 1):
            for i in range(ci - ring, ci + ring + 1):
                for j in range(cj - ring, cj + ring + 1):
                    if max(abs(i - ci), abs(j - cj)) != ring:
                        continue
                    for p in self.grid.get((i, j), ()):
                        if codes is not None and p.cc not in codes:
                            continue
                        d = _rad_km(lat, lon, p.lat, p.lon)
                        if best is None or d < best[0]:
                            best = (d, p)
            # one ring past the first hit, because a cell is not a circle
            if best is not None:
                if hit_ring is None:
                    hit_ring = ring
                elif ring > hit_ring:
                    break
        return best


_DEFAULT_GAZ = []


def default_gazetteer():
    """cities500 from CARTA_GAZETTEER or the repo cache, loaded once; None when
    neither exists (build.py then keeps the geonamescache tiers).
    CARTA_GAZETTEER may list several dumps separated by os.pathsep, cities500
    first and any GeoNames country files after it."""
    if not _DEFAULT_GAZ:
        raw = os.environ.get("CARTA_GAZETTEER") or DEFAULT_GAZETTEER
        paths = [p for p in raw.split(os.pathsep) if p and os.path.isfile(p)]
        _DEFAULT_GAZ.append(Gazetteer.from_files(paths) if paths else None)
    return _DEFAULT_GAZ[0]


def stated_countries(trip):
    """The countries the record says the trip is in."""
    codes = {c.get("code") for c in trip.get("countries") or [] if c.get("code")}
    if trip.get("countryCode"):
        codes.add(trip["countryCode"])
    return codes


def _name_parts(text):
    text = re.sub(r"\[VERIFY:[^\]]*\]", "", str(text or ""))
    text = re.sub(r"\*+", "", text)
    out = []
    for part in NAME_SPLIT_RE.split(text):
        part = (part or "").strip(" .'\"!?")
        part = re.sub(r"^(the|a|an)\s+", "", part, flags=re.I)
        if not part or not part[0].isupper() or len(part) < NAME_MIN_LEN:
            continue
        words = part.split()
        if len(words) > NAME_MAX_WORDS or any(ch.isdigit() for ch in part):
            continue
        if _fold(words[0]) in NAME_STOP:
            continue
        out.append(part)
    return out


def gateway_names(trip):
    """Folded names of the gateway airport cities. The record lists them as
    'ZAZ Zaragoza, 3 h 15 min to Torla; TLS Toulouse ...'; only the head of
    each segment (before a comma, a bracket or a figure) is the airport city,
    and the destination after 'to' is deliberately not one."""
    out = set()
    for seg in re.split(r"[;\n]", str(trip.get("gatewayAirport") or "")):
        head = re.split(r"[,(\d.]", seg)[0]
        head = re.sub(r"\b[A-Z]{3}\b", "", head)
        head = _fold(head)
        if head:
            out.add(head)
    return out


def _is_gateway(name, gateways):
    key = _fold(name)
    return any(re.search(rf"(?:^| ){re.escape(key)}(?: |$)", g) for g in gateways)


# Where a name came from. The pin is chosen among the basecamps when any of
# them resolves (they are, by definition, the towns the week is run from),
# else among every named place; support always counts every named place.
KIND_BASECAMP, KIND_SLEEP, KIND_OTHER = 0, 1, 2


def named_places(trip):
    """[(name, weight, is_gateway, kind)] in the order the record names them,
    one entry per distinct folded name: its weight summed over every mention,
    its kind the strongest of them."""
    mentions = []
    for base in trip.get("basecamps") or []:
        mentions += [(n, W_BASECAMP, KIND_BASECAMP) for n in _name_parts(base)]
    for d in trip.get("itinerary") or []:
        mentions += [(n, W_TITLE, KIND_OTHER) for n in _name_parts(d.get("title"))]
        mentions += [(n, W_SLEEP, KIND_SLEEP) for n in _name_parts(d.get("sleep"))]
    mentions += [(n, W_SUBREGION, KIND_OTHER) for n in _name_parts(trip.get("subRegion"))]
    gateways = gateway_names(trip)
    order, weight, label, kind = [], collections.Counter(), {}, {}
    for name, w, k in mentions:
        key = _fold(name)
        if key not in weight:
            order.append(key)
            label[key] = name
            kind[key] = k
        weight[key] += w
        kind[key] = min(kind[key], k)
    return [(label[k], weight[k], _is_gateway(label[k], gateways), kind[k]) for k in order]


def itinerary_resolutions(trip, gaz):
    """[(name, weight, is_gateway, kind, [Place])] for every named place that
    resolves inside the trip's stated countries."""
    codes = stated_countries(trip)
    out = []
    for name, w, gw, kind in named_places(trip):
        hits = gaz.lookup(name, codes)
        if hits:
            out.append((name, w, gw, kind, hits))
    return out


def derive_from_itinerary(trip, gaz):
    """The coordinate of the best-supported place the itinerary names, or None.

    The gateway airport's city is left out whenever any other named place
    resolves: it is where the week starts ("Land at Sarajevo, and up to the
    mountain"), and pinning it is the defect this replaces. When nothing but
    the gateway city resolves, None is returned so the caller's gateway tier
    labels the pin honestly instead of calling it a basecamp.

    On a trip that crosses a border the pin stays in the primary country
    (`countryCode`, the record's own country) whenever a named place resolves
    there; the other countries still lend support.
    """
    resolved = [r for r in itinerary_resolutions(trip, gaz) if not r[2]]
    if not resolved:
        return None
    basecamps_resolve = any(r[3] == KIND_BASECAMP for r in resolved)
    eligible = [r for r in resolved if not basecamps_resolve or r[3] == KIND_BASECAMP]
    primary = trip.get("countryCode")
    in_primary = any(p.cc == primary for r in eligible for p in r[4])
    best = None
    for rank, (name, w, _gw, kind, hits) in enumerate(resolved):
        if basecamps_resolve and kind != KIND_BASECAMP:
            continue
        for p in hits:
            if in_primary and p.cc != primary:
                continue
            support, spread = 0, 0.0
            for other_name, other_w, _ogw, _okind, other_hits in resolved:
                if other_name == name:
                    support += other_w
                    continue
                near = min(_rad_km(p.lat, p.lon, q.lat, q.lon) for q in other_hits)
                if near <= SUPPORT_KM:
                    support += other_w
                spread += min(near, SPREAD_CAP_KM)
            # most support, then the most-mentioned place inside that cluster,
            # then the place nearest the rest of the itinerary (so a homonym
            # on Tenerife loses to the Extremadura village), then the place
            # named first, then the bigger homonym
            key = (support, w, -round(spread), -rank, p.pop)
            if best is None or key > best[0]:
                best = (key, p)
    p = best[1]
    return {"lat": round(p.lat, 4), "lon": round(p.lon, 4),
            "precision": "city", "matchedPlace": p.name,
            "source": f"itinerary places (geonames {p.src})"}


def geocode_trip(trip, gazetteer=None):
    """Return a coordinates dict, or None when nothing can be resolved.

    Tiers, best first: coordinates stated in the source; a named basecamp
    town; a town named in the sub-region; the itinerary's named places against
    cities500 and any country files (when a gazetteer is available, see
    derive_from_itinerary); the gateway airport's city (which can be far from
    the trip itself, so it is labelled `gateway`); the country capital.
    `trip["coordinates"]` must be the parser's own value (stated in the
    source, or None), not an earlier geocode.

    The itinerary tier sits after the two geonamescache town tiers so that a
    rebuild reproduces the 108 basecamp pins already shipped; it replaces only
    what used to fall through to a gateway or capital pin (T090).
    """
    existing = trip.get("coordinates")
    if existing and existing.get("lat") is not None:
        return {"lat": round(float(existing["lat"]), 4),
                "lon": round(float(existing["lon"]), 4),
                "precision": "source",
                "matchedPlace": (trip.get("basecamps") or [None])[0],
                "source": "source record"}
    _load()
    gaz = gazetteer if gazetteer is not None else default_gazetteer()
    if _CITY_INDEX is None:
        return derive_from_itinerary(trip, gaz) if gaz is not None else None
    codes = [c["code"] for c in trip.get("countries") or []] or [trip.get("countryCode")]
    tiers = (
        ("city", _basecamp_places(trip)),
        ("city", _subregion_places(trip)),
        ("itinerary", None),
        ("gateway", _gateway_places(trip)),
    )
    for precision, places in tiers:
        if precision == "itinerary":
            derived = derive_from_itinerary(trip, gaz) if gaz is not None else None
            if derived:
                return derived
            continue
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


# --- re-derive the stored coordinates (T090) ---------------------------------

def _dump_json(path, obj):
    """Write `obj` the way build.py does (indent 2, UTF-8 kept), keeping the
    file's own line endings, so only the changed coordinates show in a diff."""
    with open(path, encoding="utf-8", newline="") as fh:
        old = fh.read()
    text = json.dumps(obj, ensure_ascii=False, indent=2)
    if old.endswith("\n") and not text.endswith("\n"):
        text += "\n"
    if "\r\n" in old:
        text = text.replace("\n", "\r\n")
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(text)


def main(argv=None):
    """Re-derive the coordinates of the records whose pin is a weak tier.

        python pipeline/geocode.py                      # dry run, prints the table
        python pipeline/geocode.py --write              # rewrites data/ in place

    The raw source batches build.py parses are not in the repository, so the
    dataset in data/ is the source of truth and this rewrites it in place:
    trips.master.json and the matching data/trips/<id>.json, coordinates only.
    Set CARTA_GAZETTEER to cities500 followed by the GeoNames country files
    (os.pathsep between them) for the run that produced the shipped pins; see
    Execution/P5/T090-j1-geolocation.md.
    """
    import argparse

    here = os.path.dirname(HERE)
    ap = argparse.ArgumentParser(description=main.__doc__.splitlines()[0])
    ap.add_argument("--data", default=os.path.join(here, "data"))
    ap.add_argument("--tiers", default="country,gateway",
                    help="precisions to re-derive (default: country,gateway)")
    ap.add_argument("--write", action="store_true", help="rewrite the data files")
    args = ap.parse_args(argv)

    gaz = default_gazetteer()
    if gaz is None:
        print("no gazetteer: put cities500 at cache/geonames_cities500.txt "
              "or set CARTA_GAZETTEER", file=sys.stderr)
        return 2
    tiers = set(args.tiers.split(","))
    master_path = os.path.join(args.data, "trips.master.json")
    with open(master_path, encoding="utf-8") as fh:
        master = json.load(fh)

    changed, kept = [], []
    for t in master["trips"]:
        old = t.get("coordinates") or {}
        if old.get("precision") not in tiers:
            continue
        new = derive_from_itinerary(t, gaz)
        if not new:
            kept.append(t["id"])
            continue
        moved = _rad_km(old["lat"], old["lon"], new["lat"], new["lon"]) if old.get("lat") is not None else None
        changed.append((t, old, new, moved))
        t["coordinates"] = new

    print(f"gazetteer: {gaz.source}")
    for t, old, new, moved in changed:
        print(f"{t['id']:55} {old.get('precision', '-'):8} {old.get('matchedPlace') or '-':20} "
              f"-> {new['matchedPlace']:28} {new['lat']:9.4f} {new['lon']:9.4f} "
              f"{'' if moved is None else f'{moved:6.0f} km'}  {new['source']}")
    for tid in kept:
        print(f"{tid:55} unchanged: no named place resolves outside the gateway city")
    print(f"{len(changed)} re-derived, {len(kept)} left as they were")

    if args.write and changed:
        _dump_json(master_path, master)
        for t, _old, _new, _moved in changed:
            path = os.path.join(args.data, "trips", f"{t['id']}.json")
            if os.path.isfile(path):
                with open(path, encoding="utf-8") as fh:
                    rec = json.load(fh)
                rec["coordinates"] = t["coordinates"]
                _dump_json(path, rec)
        print(f"wrote {master_path} and {len(changed)} files in data/trips")
    return 0


if __name__ == "__main__":
    sys.exit(main())
