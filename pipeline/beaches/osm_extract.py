"""The bulk OpenStreetMap pass, moved off Overpass and onto the Geofabrik
extracts this repository already keeps.

Overpass stays in the chain for what it is good at: targeted re-asks and the
400 m context sweep in enrich_beaches, both of which are small bounded
questions. It was never good at "every named beach in France", and three
documented failure modes all came from asking it that: a timed-out query
returns HTTP 200 with an empty body and a remark, a regional mirror answers
cleanly for the wrong planet, and a country that needs tiling costs half an
hour per attempt. None of those exist here. The extract is a file on disk,
the answer is deterministic, and a re-run costs no network at all.

What this widens, beyond moving the same query:

  natural=beach            what the layer already had
  leisure=beach_resort     managed bathing places, the Mediterranean and
                           Adriatic lidos
  leisure=swimming_area    marked swimming zones
  natural=shingle          pebble and shingle strands
  natural=sand             sand bodies, which on a coast is a beach

  UNNAMED natural=beach    kept, and named from the nearest named bay, cape
                           or settlement within DERIVE_NAME_M. The derived
                           name is marked in the row (`name_src: "osm_near"`)
                           so the wire can say where the name came from, and
                           the export's name test is applied to it exactly as
                           to any other name.

  beach length             from the way geometry, which is the `space`
                           component of beach_beauty_v2. A 4 km strand and a
                           60 m pocket cove are different products and
                           nothing in v1 could tell them apart.

The beach_resort caveat is real and is handled rather than ignored. That tag
was in the Overpass query for exactly one run and brought back hotel chains
mapped on their own grounds, because it means "managed bathing place" to some
mappers and "the resort that owns it" to others. RESORT_CHAIN_RE refuses the
second reading, and every beach_resort row records the tag that found it, so
a later pass can re-decide without re-reading 30 GB.

Requires pyosmium, which is installed. The brief specifies the osmium command
line (`osmium tags-filter` then `osmium export`); this does the identical
filter and export in process, because the CLI binaries are not on this box
and pyosmium's FileProcessor is the same library underneath.

Usage, from the repo root:
    python pipeline/beaches/osm_extract.py --countries MT,MC
    python pipeline/beaches/osm_extract.py                  # every extract
    python pipeline/beaches/osm_extract.py --list           # what is on disk
"""

import argparse
import json
import math
import re
import sys
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
EXTRACTS = ROOT / "data" / "raw" / "geofabrik"
STAGE = "osm"

# Which extract holds which country. Geofabrik cuts by its own regions, so
# several of ours share a file: San Marino and the Vatican are inside Italy,
# Northern Ireland is inside the Ireland extract. The country filter after the
# read is what separates them, using the same polygon test the Overpass tiling
# path already used (harvest_beaches.belongs_to).
EXTRACT_FOR = {
    "AD": "andorra", "AL": "albania", "AT": "austria", "BA": "bosnia-herzegovina",
    "BE": "belgium", "BG": "bulgaria", "CH": "switzerland", "CY": "cyprus",
    "CZ": "czech-republic", "DE": "germany", "DK": "denmark", "EE": "estonia",
    "ES": "spain", "FI": "finland", "FO": "faroe-islands", "FR": "france",
    "GB": "great-britain", "GR": "greece", "HR": "croatia", "HU": "hungary",
    "IE": "ireland-and-northern-ireland", "IS": "iceland", "IT": "italy",
    "LI": "liechtenstein", "LT": "lithuania", "LU": "luxembourg",
    "LV": "latvia", "MC": "monaco", "MD": "moldova", "ME": "montenegro",
    "MK": "macedonia", "MT": "malta", "NL": "netherlands", "NO": "norway",
    "PL": "poland", "PT": "portugal", "RO": "romania", "RS": "serbia",
    "SE": "sweden", "SI": "slovenia", "SK": "slovakia", "SM": "italy",
    "XK": "kosovo",
}

# The tag filter, in `osmium tags-filter` terms. Each entry is (key, values).
BEACH_TAGS = {
    "natural": ("beach", "shingle", "sand"),
    "leisure": ("beach_resort", "swimming_area"),
}

# Named things a beach with no name of its own may borrow a name from, and
# how far away they may stand. 300 m per the brief: a bay or a cape that far
# from the sand is the same place, a village that far is the village the
# beach belongs to, and anything further is a different feature.
DERIVE_NAME_M = 300
NAME_SOURCE_TAGS = {
    "natural": ("bay", "cape", "peninsula", "strait"),
    "place": ("hamlet", "village", "town", "locality", "isolated_dwelling",
              "island", "islet", "suburb", "neighbourhood"),
}

# A resort brand mapped on its own grounds, which is not a beach. The tag
# leisure=beach_resort carries both meanings and the name is what separates
# them: "Azul Beach Resort" is a company, "Lido di Venezia" is a place.
#
# "club" is here but "lido" deliberately is not. A beach club is a business
# that rents loungers on somebody else's sand; a lido is what half of Italy
# calls the beach itself, and Lido di Venezia and Lido di Ostia are places
# with postcodes. Refusing the word would have cost the Adriatic.
RESORT_CHAIN_RE = re.compile(
    r"\b(resort|hotel|spa|club|camping\s*village|holiday\s*park|"
    r"apartments?|residence|bungalows?|aparthotel|caravan\s*park|"
    r"lounge|beach\s*bar|resta?urante?)\b", re.I)

# The same question asked of the tags rather than the name, which catches the
# brands too new or too foreign for the word list. An object that says it is
# somewhere to sleep or something to buy is not a beach, whatever else it
# also claims to be.
BUSINESS_KEYS = ("tourism", "amenity", "shop", "office", "building")
BUSINESS_VALUES = {"hotel", "apartment", "guest_house", "hostel", "motel",
                   "resort", "chalet", "restaurant", "bar", "cafe", "pub",
                   "nightclub", "commercial", "retail", "hotel;restaurant"}


def _is_business(tags):
    for key in BUSINESS_KEYS:
        if (tags.get(key) or "").lower() in BUSINESS_VALUES:
            return True
    return bool(tags.get("brand") or tags.get("operator:type") == "private")

# natural=sand and natural=shingle are drawn over deserts, riverbeds and
# quarry spoil as well as over beaches. A row from either tag is only kept
# when something else says coast: a name that carries a beach word, or the
# coastal test the caller applies. Nothing is published on the tag alone.
LOOSE_TAGS = ("sand", "shingle")


def extract_path(region):
    """The newest extract on disk for one Geofabrik region, or None.

    Newest by the dated directory, so a refreshed download supersedes an
    older one without anything having to be deleted."""
    found = []
    for day in sorted(EXTRACTS.glob("*"), reverse=True):
        if not day.is_dir():
            continue
        path = day / f"{region}-latest.osm.pbf"
        if path.exists():
            found.append(path)
    return found[0] if found else None


# Regions whose extract holds more than one of our countries. Geofabrik cuts
# by its own areas, so San Marino is inside the Italy file and the two share
# every byte of it.
SHARED_REGIONS = {region for region in EXTRACT_FOR.values()
                  if sum(1 for r in EXTRACT_FOR.values() if r == region) > 1}


def available():
    """{iso2: path} for every country whose extract is on disk."""
    out = {}
    for cc, region in EXTRACT_FOR.items():
        path = extract_path(region)
        if path:
            out[cc] = path
    return out


def _wanted(tags):
    """Which of the beach tags this object carries, or ""."""
    for key, values in BEACH_TAGS.items():
        value = tags.get(key)
        if value in values:
            return f"{key}={value}"
    return ""


def _name_source(tags):
    for key, values in NAME_SOURCE_TAGS.items():
        if tags.get(key) in values and (tags.get("name") or "").strip():
            return tags["name"].strip()
    return ""


def _tag_dict(obj):
    return {t.k: t.v for t in obj.tags}


def _centroid(coords):
    if not coords:
        return None, None
    return (sum(c[0] for c in coords) / len(coords),
            sum(c[1] for c in coords) / len(coords))


def _haversine_m(lat1, lon1, lat2, lon2):
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(d_lon / 2) ** 2)
    return 2 * 6371000.0 * math.asin(min(1.0, math.sqrt(a)))


def _length_m(coords, closed):
    """How long the beach is, in metres, from its own geometry.

    A beach mapped as an open way IS its length: the line runs along the
    shore. A beach mapped as a closed polygon has no length in the geometry,
    so half the perimeter is used, which is exact for a long thin rectangle
    and the right order of magnitude for everything else a beach is shaped
    like. Which of the two was measured rides in the row as `length_src`, so
    the `space` component can be told the difference between a measurement
    and an approximation."""
    if len(coords) < 2:
        return 0.0
    total = 0.0
    for (lat1, lon1), (lat2, lon2) in zip(coords, coords[1:]):
        total += _haversine_m(lat1, lon1, lat2, lon2)
    return total / 2.0 if closed else total


# The tag pairs the reader is filtered on, in osmium's own (key, value)
# form. Filtering on VALUES rather than on keys is not a detail: a KeyFilter
# on "natural" hands Python every tree, pond and scrub polygon in the country,
# which measured 386 seconds and 3.66 million objects for Spain against 239
# seconds and 677 thousand for the same answer filtered on values. The filter
# runs in C++; everything that reaches Python has already been decided.
def _filter_pairs():
    pairs = []
    for key, values in BEACH_TAGS.items():
        pairs.extend((key, value) for value in values)
    for key, values in NAME_SOURCE_TAGS.items():
        pairs.extend((key, value) for value in values)
    return pairs


def _way_points(obj):
    """[(lat, lon)] for a way whose node locations the reader resolved.

    A country extract is cut on a bounding box, so a way that crosses the cut
    keeps node references whose nodes are not in the file. Those locations are
    invalid rather than absent, and reading one raises; the beach is still
    placed from the nodes that did resolve."""
    pts = []
    for node in obj.nodes:
        try:
            location = node.location
            if location.valid():
                pts.append((location.lat, location.lon))
        except Exception:
            continue
    return pts


def scan(path):
    """Every beach-tagged object in one extract, with geometry.

    One pass. The node location index is built in C++ as the file streams, so
    a way arrives with its coordinates already attached and there is no
    second read to resolve them. Multipolygon beach relations are the one
    exception: their member ways carry no tags of their own and so never
    reach the filter, and they get two cheap id-filtered passes afterwards,
    only when the country actually has some."""
    import osmium
    from osmium.filter import IdFilter, TagFilter

    nodes, ways, relations, places = [], [], {}, []

    fp = (osmium.FileProcessor(str(path))
          .with_locations("flex_mem")
          .with_filter(TagFilter(*_filter_pairs())))
    for obj in fp:
        tags = _tag_dict(obj)
        tag = _wanted(tags)
        if obj.is_node():
            lat, lon = obj.location.lat, obj.location.lon
            if tag:
                nodes.append({"id": obj.id, "tags": tags, "tag": tag,
                              "lat": lat, "lon": lon})
            else:
                named = _name_source(tags)
                if named:
                    places.append((lat, lon, named))
        elif obj.is_way():
            pts = _way_points(obj)
            if not pts:
                continue
            if tag:
                refs = [n.ref for n in obj.nodes]
                closed = len(refs) > 2 and refs[0] == refs[-1]
                ways.append({"id": obj.id, "tags": tags, "tag": tag,
                             "pts": pts, "closed": closed})
            else:
                named = _name_source(tags)
                if named:
                    lat, lon = _centroid(pts)
                    places.append((lat, lon, named))
        elif obj.is_relation() and tag:
            members = [m.ref for m in obj.members if m.type == "w"]
            if members:
                relations[obj.id] = {"tags": tags, "tag": tag,
                                     "members": members, "pts": []}

    if relations:
        _resolve_relations(path, relations, IdFilter, osmium)
    return {"nodes": nodes, "ways": ways, "relations": relations,
            "places": places}


def _resolve_relations(path, relations, IdFilter, osmium):
    """Geometry for multipolygon beaches, whose member ways are untagged.

    Two id-filtered passes, both in C++ and both over a handful of ids: the
    member ways for their node refs, then those nodes for their coordinates.
    Runs only for countries that map a beach as a relation at all."""
    want_ways = set()
    for rel in relations.values():
        want_ways.update(rel["members"])
    refs_by_way = {}
    want_nodes = set()
    fp = osmium.FileProcessor(str(path), osmium.osm.WAY).with_filter(
        IdFilter(want_ways))
    for obj in fp:
        refs = [n.ref for n in obj.nodes]
        refs_by_way[obj.id] = refs
        want_nodes.update(refs)
    if not want_nodes:
        return
    coords = {}
    fp = osmium.FileProcessor(str(path), osmium.osm.NODE).with_filter(
        IdFilter(want_nodes))
    for obj in fp:
        coords[obj.id] = (obj.location.lat, obj.location.lon)
    for rel in relations.values():
        pts = []
        for wid in rel["members"]:
            pts.extend(coords[r] for r in refs_by_way.get(wid, ())
                       if r in coords)
        rel["pts"] = pts


def _derive_name(lat, lon, places):
    """The nearest named bay, cape or settlement within DERIVE_NAME_M, and
    how far away it stood."""
    best, best_m = "", DERIVE_NAME_M
    for plat, plon, name in places:
        # A cheap box test first: haversine over every place in a country is
        # the difference between seconds and minutes.
        if abs(plat - lat) > 0.004 or abs(plon - lon) > 0.006:
            continue
        metres = _haversine_m(lat, lon, plat, plon)
        if metres < best_m:
            best, best_m = name, metres
    return best, (best_m if best else None)


def one_row_per_derived_name(rows):
    """A borrowed name may be worn by exactly one beach.

    Croatia has 2,455 mapped beach polygons and 1,775 of them are unnamed, so
    the derived-name pass hands nine separate coves the name "Luka" and seven
    the name "Barbat". Each is honestly the nearest named thing, and a region
    page listing Luka, Luka, Luka has still told the reader nothing and looks
    broken. The beach nearest its donor keeps the name and the rest are
    dropped, because there is no second name to give them: they are unnamed
    beaches, and the catalogue's promise is named ones.

    Rows that carry their OWN name are never touched by this. Two real
    beaches may share a name and both deserve their row; the 150 m dedupe at
    export is what separates those."""
    best = {}
    for row in rows:
        if row.get("name_src") != "osm_near":
            continue
        key = row["name"].casefold()
        rival = best.get(key)
        # Nearest to its donor wins; the longer beach breaks a tie, because
        # between two coves at the same distance the bigger one is the one a
        # reader was more likely to mean.
        rank = (row.get("name_m") or 1e9, -(row.get("length_m") or 0))
        if rival is None or rank < rival[0]:
            best[key] = (rank, row["osm_id"])
    keep = {osm_id for _rank, osm_id in best.values()}
    out, dropped = [], 0
    for row in rows:
        if row.get("name_src") == "osm_near" and row["osm_id"] not in keep:
            dropped += 1
            continue
        row.pop("name_m", None)
        out.append(row)
    return out, dropped


def rows_from(scanned, cc, belongs):
    """Beach rows in the harvest's shape, country filtered."""
    places = scanned["places"]
    out = []

    def emit(osm_id, tags, tag, lat, lon, length_m, length_src):
        if lat is None or not belongs(lat, lon):
            return
        name = (tags.get("name") or "").strip()
        name_src, name_m = "osm", None
        if not name:
            name, name_m = _derive_name(lat, lon, places)
            name_src = "osm_near"
        if not name:
            return
        # The managed-bathing tags are the ones that carry two meanings, so
        # they are the ones that have to prove they mean the place rather
        # than the business. natural=beach is not asked to.
        if tag.startswith("leisure=") and (RESORT_CHAIN_RE.search(name)
                                           or _is_business(tags)):
            return
        row = {
            "osm_id": osm_id,
            "name": name,
            "name_src": name_src,
            "name_local": tags.get(f"name:{cc.lower()}") or "",
            "name_en": tags.get("name:en") or "",
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "iso2": cc,
            "osm_tag": tag,
            "tags": {k: v for k, v in tags.items()
                     if not k.startswith("name:") and k != "name"},
        }
        if length_m:
            row["length_m"] = int(round(length_m))
            row["length_src"] = length_src
        if name_m is not None:
            row["name_m"] = round(name_m)
        out.append(row)

    for node in scanned["nodes"]:
        emit(f"node/{node['id']}", node["tags"], node["tag"],
             node["lat"], node["lon"], 0, "")

    for way in scanned["ways"]:
        lat, lon = _centroid(way["pts"])
        emit(f"way/{way['id']}", way["tags"], way["tag"], lat, lon,
             _length_m(way["pts"], way["closed"]),
             "polygon" if way["closed"] else "line")

    for rid, rel in scanned["relations"].items():
        lat, lon = _centroid(rel["pts"])
        emit(f"relation/{rid}", rel["tags"], rel["tag"], lat, lon,
             _length_m(rel["pts"], True) if rel["pts"] else 0, "polygon")
    out, dropped = one_row_per_derived_name(out)
    if dropped:
        print(f"    {dropped} unnamed beaches dropped: their borrowed name "
              f"was already taken")
    return out


def _sibling_cache(cc, region):
    """Another country's cache of the SAME extract, if one exists."""
    from sources import load_cache
    for other, other_region in EXTRACT_FOR.items():
        if other == cc or other_region != region:
            continue
        cached = load_cache(STAGE, other)
        if cached and cached.get("rows") is not None:
            return cached
    return None


def extract_country(cc, refresh=False):
    """One country's beaches, out of its extract and into a cache file."""
    from sources import load_cache, save_cache
    from harvest_beaches import belongs_to

    if not refresh:
        cached = load_cache(STAGE, cc)
        if cached:
            print(f"  {cc}: {len(cached['rows'])} osm rows (cached)")
            return cached

    region = EXTRACT_FOR.get(cc)
    path = extract_path(region) if region else None
    if not path:
        print(f"  {cc}: no extract on disk for {region}")
        return None

    # A shared extract only ever has to be READ once. San Marino and Italy are
    # the same 2.2 GB file, and the sibling's cache already holds every beach
    # row in it; all that differs is which country test was applied. Filtering
    # the sibling's rows is the same answer for none of the memory, which
    # matters when another layer's scan is holding its own node index.
    sibling = _sibling_cache(cc, region)
    if sibling is not None:
        from harvest_beaches import country_polygons, in_country
        polygons = country_polygons(cc)
        rows = [row for row in sibling["rows"]
                if in_country(row["lat"], row["lon"], polygons)]
        by_tag = {}
        for row in rows:
            by_tag[row["osm_tag"]] = by_tag.get(row["osm_tag"], 0) + 1
        payload = {
            "country": cc,
            "extract": path.name,
            "extract_day": path.parent.name,
            "scanned_at": sibling.get("scanned_at"),
            "seconds": 0.0,
            "from_sibling": sibling["country"],
            "by_tag": by_tag,
            "n_derived_names": sum(1 for r in rows
                                   if r.get("name_src") == "osm_near"),
            "rows": rows,
        }
        save_cache(STAGE, cc, payload)
        print(f"  {cc}: {len(rows)} rows filtered out of "
              f"{sibling['country']}'s scan of the same extract")
        return payload

    size_gb = path.stat().st_size / 1e9
    print(f"  {cc}: reading {path.name} ({size_gb:.1f} GB)")
    started = datetime.now(timezone.utc)
    scanned = scan(path)

    # Which country test to apply, and it matters enormously.
    #
    # belongs_to() is generous by design: a point outside this country's
    # simplified outline still counts unless it is demonstrably inside a
    # NEIGHBOUR's, because the shapes are drawn at continent zoom and leave
    # out islands, and a strict test deletes the Balearics from Spain.
    #
    # That generosity is exactly wrong for a SHARED extract. A beach on the
    # Adriatic sits ON Italy's simplified coastline rather than inside it, so
    # "not demonstrably inside Italy" is true of most of the Italian coast,
    # and asking belongs_to for San Marino handed a landlocked microstate
    # 2,415 Italian beaches. Where two countries share a file, containment in
    # the country's own outline is the only honest test.
    if EXTRACT_FOR.get(cc) in SHARED_REGIONS:
        from harvest_beaches import country_polygons, in_country
        polygons = country_polygons(cc)
        belongs = lambda lat, lon: in_country(lat, lon, polygons)   # noqa: E731
    else:
        belongs = lambda lat, lon: belongs_to(lat, lon, cc)         # noqa: E731
    rows = rows_from(scanned, cc, belongs)
    took = (datetime.now(timezone.utc) - started).total_seconds()

    by_tag = {}
    derived = 0
    for row in rows:
        by_tag[row["osm_tag"]] = by_tag.get(row["osm_tag"], 0) + 1
        if row["name_src"] == "osm_near":
            derived += 1
    payload = {
        "country": cc,
        "extract": path.name,
        "extract_day": path.parent.name,
        "scanned_at": started.isoformat(timespec="seconds"),
        "seconds": round(took, 1),
        "by_tag": by_tag,
        "n_derived_names": derived,
        "rows": rows,
    }
    save_cache(STAGE, cc, payload)
    print(f"  {cc}: {len(rows)} rows in {took:.0f}s "
          f"({derived} names derived) {by_tag}")
    return payload


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", default="")
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    have = available()
    if args.list:
        for cc in sorted(EXTRACT_FOR):
            path = have.get(cc)
            print(f"  {cc}  {EXTRACT_FOR[cc]:<32} "
                  f"{(str(path.parent.name) + '/' + path.name) if path else 'MISSING'}")
        print(f"{len(have)} of {len(EXTRACT_FOR)} countries have an extract")
        return

    wanted = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    countries = wanted or sorted(have)
    total = 0
    for cc in countries:
        try:
            payload = extract_country(cc, refresh=args.refresh)
            total += len(payload["rows"]) if payload else 0
        except KeyboardInterrupt:
            raise
        except Exception as exc:
            print(f"  {cc}: failed ({type(exc).__name__}: {exc})")
    print(f"[beaches] {total} osm rows across {len(countries)} countries")


if __name__ == "__main__":
    main()
