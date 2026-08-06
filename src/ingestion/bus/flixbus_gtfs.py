"""FlixBus GTFS network graph: schedules and network only, no fares.

Downloads the public Flix GTFS feed (primary gtfs.gis.flix.tech; CC0 mirror
on NDOV loket), stores the raw zip like every other collector, then derives
contract E: which Carta destination pairs have a DIRECT coach connection and
the typical ride duration in minutes. Direct means both stops appear on the
same trip (A then B then C yields A-B, A-C, B-C); duration is the median
over trips per stop pair, then the median across the contributing stop
pairs per destination pair.

Output: data/derived/flix_network.json, exact shape
  {"meta": {"source": ..., "license": ..., "fetched_at": iso},
   "pairs": [["<destIdA>", "<destIdB>", minutes]]}
sorted by (destIdA, destIdB), destIdA < destIdB, no self pairs. Downstream
this gates per pair price crawling and informs bus vs train mode choice.

This collector deviates from raw-only on purpose: the derived graph is the
contract other chunks consume, and deriving it here keeps the zip parse next
to the fetch. The dest master (continent-app/public/app_data.json) is READ
ONLY here: each GTFS stop snaps to the nearest destination within
FLIXBUS_MATCH_KM (default 25 km) of the city centre (city_lat/city_lon,
falling back to lat/lon), by haversine.

Licensing honesty: the primary endpoint publishes no explicit license (it is
a public feed, catalogued by transport.data.gouv.fr among others); the NDOV
loket mirror is CC0. Whichever source actually served the zip is recorded in
both the raw manifest note and contract E's meta.
"""
import csv
import io
import json
import math
import statistics
import zipfile
from collections import defaultdict
from io import TextIOWrapper
from pathlib import Path
from urllib.parse import urlparse

from ..core import config
from ..core.collector import Collector
from ..core.registry import register
from ..core.storage import utcnow

PRIMARY_URL = config.env("FLIXBUS_GTFS_URL",
                         "https://gtfs.gis.flix.tech/gtfs_generic_eu.zip")
PRIMARY_LICENSE = ("no explicit license at source (public Flix GTFS endpoint, "
                   "catalogued on transport.data.gouv.fr)")
MIRROR_URL = config.env("FLIXBUS_GTFS_MIRROR",
                        "https://data.ndovloket.nl/flixbus/flixbus-eu.zip")
MIRROR_LICENSE = "CC0 1.0 (NDOV loket)"
MATCH_KM = float(config.env("FLIXBUS_MATCH_KM", "25"))
DEST_MASTER = Path(config.env("FLIXBUS_DEST_MASTER",
                              str(config.ROOT / "continent-app" / "public" / "app_data.json")))
DERIVED_PATH = Path(config.env("FLIXBUS_DERIVED_PATH",
                               str(config.ROOT / "data" / "derived" / "flix_network.json")))

MAX_RIDE_MIN = 48 * 60          # sanity cap; longer implies feed noise
_EARTH_KM = 6371.0088
# route_type filter: keep coaches, drop FlixTrain rail legs if present.
# 3 = bus, 200-299 = extended coach codes, 700-799 = extended bus codes.
_RAIL_HINT = "rail (2, 100-199)"


def _is_bus_route_type(rt):
    if rt is None:
        return True  # unparseable: assume coach, this is a bus feed
    return rt == 3 or 200 <= rt <= 299 or 700 <= rt <= 799


def _finite(v):
    return isinstance(v, (int, float)) and math.isfinite(v)


def _haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * _EARTH_KM * math.asin(math.sqrt(a))


def _gtfs_seconds(text):
    """GTFS times routinely exceed 24:00:00; hours parse as a plain int."""
    if not text:
        return None
    parts = text.strip().split(":")
    if len(parts) < 2:
        return None
    try:
        h, m = int(parts[0]), int(parts[1])
        s = int(parts[2]) if len(parts) > 2 else 0
    except ValueError:
        return None
    return h * 3600 + m * 60 + s


def _weighted_median(counts):
    """Median of a {value: count} distribution without expanding it."""
    total = sum(counts.values())
    lo_idx, hi_idx = (total - 1) // 2, total // 2
    lo = hi = None
    seen = 0
    for value in sorted(counts):
        seen += counts[value]
        if lo is None and seen > lo_idx:
            lo = value
        if seen > hi_idx:
            hi = value
            break
    return (lo + hi) / 2


def _load_dests():
    """Carta dest ids with centre coords: city_lat/city_lon first (the true
    downtown centre), lat/lon (airport) as fallback. Sorted by id so nearest
    ties break deterministically (strict < keeps the first seen)."""
    with open(DEST_MASTER, encoding="utf-8") as fh:
        master = json.load(fh)
    dests = []
    for did, rec in master["destinations"].items():
        lat, lon = rec.get("city_lat"), rec.get("city_lon")
        if not (_finite(lat) and _finite(lon)):
            lat, lon = rec.get("lat"), rec.get("lon")
        if _finite(lat) and _finite(lon):
            dests.append((did, float(lat), float(lon)))
    dests.sort()
    return dests


def _open_csv(zf, member):
    return csv.DictReader(TextIOWrapper(zf.open(member), encoding="utf-8-sig"))


def _match_stops(zf, dests):
    """stop_id -> index into dests for every stop within MATCH_KM of its
    nearest destination centre. Returns (mapping, total_stops, matched)."""
    max_dlat = MATCH_KM / 111.0 + 0.01  # cheap latitude prefilter
    mapping = {}
    total = 0
    for row in _open_csv(zf, "stops.txt"):
        total += 1
        try:
            slat, slon = float(row["stop_lat"]), float(row["stop_lon"])
        except (KeyError, TypeError, ValueError):
            continue
        if not (math.isfinite(slat) and math.isfinite(slon)):
            continue
        best_km, best_idx = MATCH_KM, None
        for idx, (_did, dlat, dlon) in enumerate(dests):
            if abs(dlat - slat) > max_dlat:
                continue
            km = _haversine_km(slat, slon, dlat, dlon)
            if km < best_km:
                best_km, best_idx = km, idx
        if best_idx is not None:
            mapping[row["stop_id"]] = best_idx
    return mapping, total, len(mapping)


def _excluded_trips(zf):
    """Trip ids on non coach routes (FlixTrain legs), plus the trip total."""
    route_types = {}
    for row in _open_csv(zf, "routes.txt"):
        rt = None
        raw = (row.get("route_type") or "").strip()
        if raw:
            try:
                rt = int(raw)
            except ValueError:
                rt = None
        route_types[row.get("route_id", "")] = rt
    excluded = set()
    total = 0
    for row in _open_csv(zf, "trips.txt"):
        total += 1
        if not _is_bus_route_type(route_types.get(row.get("route_id", ""))):
            excluded.add(row.get("trip_id", ""))
    return excluded, total, len(route_types)


def _flush_trip(buf, stop_dest, pair_counts):
    """One trip's matched stop rows -> every ordered later pair on the ride."""
    buf.sort(key=lambda r: r[0])
    n = len(buf)
    for i in range(n):
        _seq_i, _arr_i, dep_i, stop_i = buf[i]
        if dep_i is None:
            continue
        dest_i = stop_dest[stop_i]
        for j in range(i + 1, n):
            _seq_j, arr_j, _dep_j, stop_j = buf[j]
            if arr_j is None or stop_dest[stop_j] == dest_i:
                continue  # missing time, or a self pair at dest level
            minutes = int((arr_j - dep_i) / 60 + 0.5)
            if 1 <= minutes <= MAX_RIDE_MIN:
                pair_counts[(stop_i, stop_j)][minutes] += 1


def _collect_pairs(zf, stop_to_dest, excluded_trips):
    """Stream stop_times.txt row by row (it is by far the biggest member and
    must never be materialised); trips are flushed on trip_id change, which
    holds for grouped files (the GTFS norm). Regrouped trips are counted and
    processed per contiguous block, still yielding valid within block pairs."""
    stop_index = {}          # stop_id -> compact int
    stop_dest = []           # compact int -> dest index
    pair_counts = defaultdict(lambda: defaultdict(int))
    cur_trip, buf = None, []
    flushed_hashes = set()
    rows = reordered = 0
    with zf.open("stop_times.txt") as raw:
        reader = csv.reader(TextIOWrapper(raw, encoding="utf-8-sig"))
        header = {name: i for i, name in enumerate(next(reader))}
        i_trip = header["trip_id"]
        i_stop = header["stop_id"]
        i_seq = header["stop_sequence"]
        i_arr = header.get("arrival_time")
        i_dep = header.get("departure_time")
        for row in reader:
            rows += 1
            trip_id = row[i_trip]
            if trip_id != cur_trip:
                if len(buf) > 1:
                    _flush_trip(buf, stop_dest, pair_counts)
                if cur_trip is not None:
                    flushed_hashes.add(hash(cur_trip))
                if hash(trip_id) in flushed_hashes:
                    reordered += 1
                cur_trip, buf = trip_id, []
            if trip_id in excluded_trips:
                continue
            dest_idx = stop_to_dest.get(row[i_stop])
            if dest_idx is None:
                continue
            sidx = stop_index.get(row[i_stop])
            if sidx is None:
                sidx = stop_index[row[i_stop]] = len(stop_dest)
                stop_dest.append(dest_idx)
            try:
                seq = int(row[i_seq])
            except ValueError:
                continue
            arr = _gtfs_seconds(row[i_arr]) if i_arr is not None else None
            dep = _gtfs_seconds(row[i_dep]) if i_dep is not None else None
            buf.append((seq, arr if arr is not None else dep,
                        dep if dep is not None else arr, sidx))
        if len(buf) > 1:
            _flush_trip(buf, stop_dest, pair_counts)
    return pair_counts, stop_dest, rows, reordered


def _dest_pairs(pair_counts, stop_dest, dests):
    """Stop pair medians -> destination pair medians, deterministic order."""
    grouped = defaultdict(list)
    for (a, b), counts in pair_counts.items():
        ida, idb = dests[stop_dest[a]][0], dests[stop_dest[b]][0]
        key = (ida, idb) if ida < idb else (idb, ida)
        grouped[key].append(_weighted_median(counts))
    pairs = [[ida, idb, int(statistics.median(medians) + 0.5)]
             for (ida, idb), medians in grouped.items()]
    pairs.sort()
    return pairs


def _write_contract(pairs, source_host, license_text):
    DERIVED_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {"meta": {"source": source_host, "license": license_text,
                        "fetched_at": utcnow()},
               "pairs": pairs}
    with open(DERIVED_PATH, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
    return DERIVED_PATH


@register
class FlixbusGtfs(Collector):
    name = "flixbus_gtfs"
    group = "bus"
    description = "Flix EU GTFS feed -> direct dest pair coach graph (contract E)"
    static_urls = {"gtfs_zip": PRIMARY_URL, "ndov_mirror": MIRROR_URL}

    def collect(self, store, session):
        zip_path = self.grab(session, store, PRIMARY_URL,
                             name="gtfs_generic_eu.zip",
                             note=f"license: {PRIMARY_LICENSE}")
        source_host, license_text = urlparse(PRIMARY_URL).netloc, PRIMARY_LICENSE
        if zip_path is None:
            zip_path = self.grab(session, store, MIRROR_URL,
                                 name="flixbus-eu.zip",
                                 note=f"license: {MIRROR_LICENSE}")
            source_host, license_text = urlparse(MIRROR_URL).netloc, MIRROR_LICENSE
        if zip_path is None:
            raise RuntimeError("both the primary Flix feed and the NDOV mirror failed")

        dests = _load_dests()
        with zipfile.ZipFile(zip_path) as zf:
            stop_to_dest, total_stops, matched = _match_stops(zf, dests)
            excluded, total_trips, n_routes = _excluded_trips(zf)
            pair_counts, stop_dest, rows, reordered = _collect_pairs(
                zf, stop_to_dest, excluded)
        pairs = _dest_pairs(pair_counts, stop_dest, dests)
        edged = len({d for p in pairs for d in (p[0], p[1])})
        out = _write_contract(pairs, source_host, license_text)

        report = {
            "source": source_host, "license": license_text,
            "stops_total": total_stops, "stops_matched": matched,
            "match_rate": round(matched / total_stops, 4) if total_stops else 0,
            "match_km": MATCH_KM, "routes": n_routes,
            "trips_total": total_trips, "trips_excluded_non_bus": len(excluded),
            "stop_time_rows": rows, "reordered_trips": reordered,
            "stop_pairs": len(pair_counts), "dest_pairs": len(pairs),
            "dests_with_edge": edged, "dests_total": len(dests),
            "derived": str(out),
        }
        store.save_json("match_report.json", report,
                        note="stop matching and pair derivation stats")
        if reordered:
            self.fail(f"{reordered} trips were not contiguous in stop_times.txt; "
                      "their cross block pairs were not joined")
        return (f"{source_host}: {matched}/{total_stops} stops matched, "
                f"{len(pairs)} dest pairs, {edged}/{len(dests)} dests with an edge")
