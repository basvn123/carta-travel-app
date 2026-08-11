"""Hiking route ingestion: Geofabrik extracts -> trailslab trips staging table.

Downloads per-country Geofabrik .osm.pbf extracts into the data/raw/geofabrik/
raw store (manifest.jsonl per day, same conventions as the src/ingestion
collectors) and ingests OSM route relations into the trips table of the local
trailslab PostGIS DB (tools/trailslab, port 5433). The public Overpass API is
deliberately never queried: extracts are the bulk channel.

What gets ingested:
  relations with type=route or type=superroute, route=hiking/foot/walking,
  that additionally carry network iwn/nwn/rwn or a name (first-pass filter).
  Superroute members of type relation are resolved recursively against the
  scanned pool, so stage relations and their parent both ingest.

How geometry is assembled, memory-safely for the 4 GB France extract:
  pass 1 scans relations only (KeyFilter runs in C++), pass 2 loads member
  way node refs via IdFilter, pass 3 loads only the needed node locations
  into flat numpy arrays (8+4+4 bytes per node). Member ways are stitched in
  relation order, flipping ways so consecutive ends meet; every break starts
  a new segment. A second pass merges segments that share an endpoint where
  exactly two segment ends meet (ST_LineMerge semantics), which both heals
  relations whose members are stored unordered and leaves genuine gaps and
  junctions alone. ordered vs merged segment counts, missing ways and
  duplicate members land in gap_info for the later continuity check.

Cross-border relations appear in every extract that clips them; the row is
keyed on (source, source_ref) and the longest assembled geometry wins.

Usage, from the repo root (DB must be up: cd tools/trailslab && docker compose up -d):
    python pipeline/trails/ingest_osm_routes.py
    python pipeline/trails/ingest_osm_routes.py --countries switzerland --limit 50 --dry-run
    python pipeline/trails/ingest_osm_routes.py --refresh
"""

import argparse
import json
import os
import sys
import time
from array import array
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import osmium
import requests

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))                              # src.ingestion imports
sys.path.insert(0, str(Path(__file__).resolve().parent))   # db.py

from db import connect  # noqa: E402
from src.ingestion.core import config as ingest_config  # noqa: E402
from src.ingestion.core.errors import HTTPFailed  # noqa: E402
from src.ingestion.core.http import PoliteSession  # noqa: E402
from src.ingestion.core.storage import RawStore  # noqa: E402

GEOFABRIK_BASE = "https://download.geofabrik.de/europe"
COUNTRIES = {"switzerland": "CH", "france": "FR", "norway": "NO", "austria": "AT"}

ROUTE_VALUES = {"hiking", "foot", "walking"}
MAJOR_NETWORKS = {"iwn", "nwn", "rwn"}
# Roles marking variants and access spurs; excluded from the main line, counted.
VARIANT_ROLES = {"alternative", "alternate", "variant", "excursion", "approach",
                 "connection", "link", "shortcut", "detour"}
# The prompt's core tag set plus what later steps feed on: wikipedia/wikidata
# anchor the popularity ranking, from/to/description feed the describe step.
KEEP_TAGS = ("type", "route", "name", "name:en", "ref", "network",
             "osmc:symbol", "osmc:status", "sac_scale", "distance", "ascent",
             "descent", "roundtrip", "from", "to", "via", "symbol",
             "wikipedia", "wikidata", "website", "operator", "description")

LICENSE = "ODbL 1.0"
ATTRIBUTION = "Trail data (c) OpenStreetMap contributors, ODbL"
EARTH_RADIUS_M = 6371008.8

SPOT_CHECKS = {
    "CH": ["%via alpina%"],
    "FR": ["GR%"],
    "NO": ["%olavsleden%", "%besseggen%"],
    "AT": ["%adlerweg%", "%zentralalpenweg%"],
}


# ---------------------------------------------------------------------------
# Raw store: fetch or reuse the per-country extract
# ---------------------------------------------------------------------------

def cached_extract(slug):
    """Newest previously downloaded extract for the country, if any."""
    hits = [p for p in (ingest_config.DATA_DIR / "geofabrik").glob(
        f"*/{slug}-latest*.osm.pbf") if not p.name.endswith(".part")]
    return max(hits, key=lambda p: p.stat().st_mtime) if hits else None


def download_resumable(session, store, url, name, note, max_attempts=8):
    """Multi-GB download that survives dropped connections.

    The first response resolves the -latest redirect; resumes go to that
    dated, immutable URL with a Range header, so a daily republish mid
    download can never splice two different files together. The temp name
    carries the PID so concurrent sessions never share a .part.
    """
    dest = store.path_for(name)
    tmp = dest.with_suffix(dest.suffix + f".{os.getpid()}.part")
    fetch_url, expected, got, last_err = url, None, 0, None
    try:
        for attempt in range(max_attempts):
            if attempt:
                time.sleep(min(60, 10 * attempt))
            headers = {"Range": f"bytes={got}-"} if got else None
            try:
                resp = session.get(fetch_url, headers=headers, stream=True)
                if got and resp.status_code != 206:
                    got = 0    # no partial support after all; restart clean
                if expected is None:
                    fetch_url = resp.url
                    expected = got + int(resp.headers["Content-Length"])
                with open(tmp, "ab" if got else "wb") as fh:
                    for chunk in resp.iter_content(chunk_size=1 << 20):
                        if chunk:
                            fh.write(chunk)
                            got += len(chunk)
            except (requests.RequestException, HTTPFailed, OSError) as exc:
                last_err = f"{type(exc).__name__}: {exc}"
                got = tmp.stat().st_size if tmp.exists() else 0
                print(f"  resume {attempt + 1}/{max_attempts} at "
                      f"{got / 1e9:.2f} GB after {last_err}")
                continue
            if got == expected:
                break
            last_err = f"size mismatch: {got} of {expected} bytes"
            print(f"  resume {attempt + 1}/{max_attempts}: {last_err}")
        else:
            raise RuntimeError(f"download failed after {max_attempts} "
                               f"attempts: {last_err}")
        # Same transient sharing violations as storage.save_response.
        for wait in (0, 1, 2, 5, 10, 20, 40, 60):
            time.sleep(wait)
            try:
                tmp.replace(dest)
                break
            except PermissionError:
                continue
        else:
            tmp.replace(dest)
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
    store.register_existing(dest, url=url, note=note + f"; served {fetch_url}")
    return dest


def fetch_extract(slug, refresh):
    if not refresh:
        cached = cached_extract(slug)
        if cached:
            print(f"[{slug}] extract: {cached} "
                  f"({cached.stat().st_size / 1e9:.2f} GB, cached)")
            return cached
    url = f"{GEOFABRIK_BASE}/{slug}-latest.osm.pbf"
    store = RawStore("geofabrik")
    session = PoliteSession()
    print(f"[{slug}] downloading {url}")
    started = time.time()
    path = download_resumable(
        session, store, url, f"{slug}-latest.osm.pbf",
        note="Geofabrik per-country extract; data (c) OpenStreetMap "
             "contributors, ODbL 1.0")
    print(f"[{slug}] extract: {path} ({path.stat().st_size / 1e9:.2f} GB, "
          f"{time.time() - started:.0f}s)")
    return path


# ---------------------------------------------------------------------------
# Pass 1: route relations
# ---------------------------------------------------------------------------

def scan_relations(pbf_path):
    """All hiking/foot/walking route and superroute relations in the extract.

    The pool keeps every match regardless of the first-pass filter so that
    superroutes can resolve unnamed stage relations from it.
    """
    pool = {}
    fp = osmium.FileProcessor(str(pbf_path), osmium.osm.RELATION) \
        .with_filter(osmium.filter.KeyFilter("route"))
    for rel in fp:
        tags = rel.tags
        if tags.get("type") not in ("route", "superroute"):
            continue
        if tags.get("route") not in ROUTE_VALUES:
            continue
        pool[rel.id] = {
            "tags": {k: tags[k] for k in KEEP_TAGS if k in tags},
            "members": [(m.type, m.ref, (m.role or "").lower())
                        for m in rel.members],
        }
    return pool


def passes_first_filter(tags):
    network = tags.get("network", "")
    tokens = {t.strip() for t in network.replace(";", ",").split(",")}
    return bool(tokens & MAJOR_NETWORKS) or bool(tags.get("name"))


def expand_ways(rid, pool, stats, seen, depth=0):
    """Ordered member way refs, resolving child relations depth-first."""
    if rid in seen:
        stats["relation_cycles"] += 1
        return []
    if depth > 4:
        stats["depth_capped"] += 1
        return []
    seen.add(rid)
    out = []
    for mtype, ref, role in pool[rid]["members"]:
        if role in VARIANT_ROLES:
            stats["variant_ways" if mtype == "w" else "variant_relations"] += 1
            continue
        if mtype == "w":
            out.append(ref)
        elif mtype == "r":
            if ref in pool:
                out.extend(expand_ways(ref, pool, stats, seen, depth + 1))
            else:
                stats["missing_relations"] += 1
    return out


# ---------------------------------------------------------------------------
# Passes 2 and 3: member ways and node locations
# ---------------------------------------------------------------------------

def load_ways(pbf_path, way_ids):
    ids = np.fromiter(way_ids, dtype=np.int64, count=len(way_ids))
    fp = osmium.FileProcessor(str(pbf_path), osmium.osm.WAY) \
        .with_filter(osmium.filter.IdFilter(ids))
    way_nodes = {}
    for way in fp:
        way_nodes[way.id] = array("q", (n.ref for n in way.nodes))
    return way_nodes


class NodeLocations:
    """Sorted id -> nano-degree coordinate lookup on flat numpy arrays."""

    def __init__(self, ids, xs, ys):
        order = np.argsort(ids, kind="stable")
        self.ids, self.xs, self.ys = ids[order], xs[order], ys[order]

    def coords_for(self, refs):
        refs = np.asarray(refs, dtype=np.int64)
        if not len(self.ids):
            zero = np.zeros(len(refs))
            return np.zeros(len(refs), dtype=bool), zero, zero
        pos = np.minimum(np.searchsorted(self.ids, refs), len(self.ids) - 1)
        ok = self.ids[pos] == refs
        return ok, self.xs[pos], self.ys[pos]


def load_locations(pbf_path, node_ids):
    fp = osmium.FileProcessor(str(pbf_path), osmium.osm.NODE) \
        .with_filter(osmium.filter.IdFilter(node_ids))
    ids, xs, ys = array("q"), array("i"), array("i")
    for node in fp:
        loc = node.location
        if not loc.valid():
            continue
        ids.append(node.id)
        xs.append(loc.x)
        ys.append(loc.y)
    return NodeLocations(np.frombuffer(ids, dtype=np.int64).copy(),
                         np.frombuffer(xs, dtype=np.int32).copy(),
                         np.frombuffer(ys, dtype=np.int32).copy())


# ---------------------------------------------------------------------------
# Geometry assembly
# ---------------------------------------------------------------------------

def assemble_ordered(way_refs, way_nodes, stats):
    """Stitch member ways in relation order into node-id segments.

    Ways flip so consecutive ends meet; the current segment may flip too
    while it still holds a single way. Any way that cannot attach starts a
    new segment. Duplicate member ways attach normally, which is exactly
    right for out-and-back routes.
    """
    segments, cur, cur_single = [], None, False
    for wref in way_refs:
        nds = way_nodes.get(wref)
        if nds is None:
            stats["missing_ways"] += 1
            continue
        if len(nds) < 2:
            stats["degenerate_ways"] += 1
            continue
        way = list(nds)
        if cur is None:
            cur, cur_single = way, True
            continue
        if way[0] == cur[-1]:
            cur.extend(way[1:])
        elif way[-1] == cur[-1]:
            cur.extend(way[-2::-1])
        elif cur_single and way[0] == cur[0]:
            cur.reverse()
            cur.extend(way[1:])
        elif cur_single and way[-1] == cur[0]:
            cur.reverse()
            cur.extend(way[-2::-1])
        else:
            segments.append(cur)
            cur, cur_single = way, True
            continue
        cur_single = False
    if cur:
        segments.append(cur)
    return segments


def stitch_segments(segments):
    """Merge segments at endpoints where exactly two segment ends meet.

    Mirrors ST_LineMerge: junctions of three or more ends never merge, so
    the count drop vs the ordered assembly cleanly flags relations whose
    members were merely stored out of order.
    """
    segs = list(segments)
    while True:
        ends = defaultdict(list)
        for i, seg in enumerate(segs):
            if seg is not None:
                ends[seg[0]].append((i, 0))
                ends[seg[-1]].append((i, 1))
        joined = False
        for node, touches in ends.items():
            if len(touches) != 2:
                continue
            (i, end_a), (j, end_b) = touches
            if i == j:
                continue
            a, b = segs[i], segs[j]
            # A join earlier in this pass may have consumed or re-ended one
            # of the two; stale entries retry on the next pass.
            if a is None or b is None:
                continue
            if (a[0] if end_a == 0 else a[-1]) != node:
                continue
            if (b[0] if end_b == 0 else b[-1]) != node:
                continue
            if end_a == 1 and end_b == 0:
                merged = a + b[1:]
            elif end_a == 1 and end_b == 1:
                merged = a + b[-2::-1]
            elif end_a == 0 and end_b == 0:
                merged = a[::-1] + b[1:]
            else:
                merged = b + a[1:]
            segs[i], segs[j] = merged, None
            joined = True
        segs = [s for s in segs if s is not None]
        if not joined:
            return segs


def part_geometry(part, locator, stats):
    """One segment -> (wkt coordinate list, haversine length in metres)."""
    ok, xs, ys = locator.coords_for(part)
    missing = int(len(part) - ok.sum())
    if missing:
        stats["missing_node_locations"] += missing
        xs, ys = xs[ok], ys[ok]
    if len(xs) < 2:
        stats["dropped_parts"] += 1
        return None, 0.0
    lon, lat = xs / 1e7, ys / 1e7
    lam, phi = np.radians(lon), np.radians(lat)
    h = (np.sin(np.diff(phi) / 2) ** 2
         + np.cos(phi[:-1]) * np.cos(phi[1:]) * np.sin(np.diff(lam) / 2) ** 2)
    length = float(2 * EARTH_RADIUS_M * np.sum(np.arcsin(np.sqrt(h))))
    coords = ",".join(f"{x:.7f} {y:.7f}" for x, y in zip(lon, lat))
    return "(" + coords + ")", length


def build_record(rid, info, way_refs, rstats, way_nodes, locator):
    """Assemble one relation into an insertable record, or None if empty."""
    ordered = assemble_ordered(way_refs, way_nodes, rstats)
    merged = stitch_segments(ordered) if len(ordered) > 1 else ordered
    parts, length_m = [], 0.0
    for seg in merged:
        wkt_part, part_len = part_geometry(seg, locator, rstats)
        if wkt_part:
            parts.append(wkt_part)
            length_m += part_len
    if not parts:
        return None
    tags = info["tags"]
    gap_info = {
        "member_ways": len(way_refs),
        "missing_ways": rstats["missing_ways"],
        "duplicate_ways": len(way_refs) - len(set(way_refs)),
        "ordered_segments": len(ordered),
        "merged_segments": len(merged),
        "gap_count": len(parts) - 1,
        "unordered_members": len(ordered) > len(merged),
    }
    for extra in ("variant_ways", "variant_relations", "missing_relations",
                  "degenerate_ways", "missing_node_locations", "dropped_parts",
                  "relation_cycles", "depth_capped"):
        if rstats[extra]:
            gap_info[extra] = rstats[extra]
    if rstats["missing_ways"]:
        gap_info["clipped"] = True   # extract border is the usual culprit
    return {
        "source_ref": str(rid),
        "title": tags.get("name") or tags.get("ref") or f"OSM route {rid}",
        "wkt": "MULTILINESTRING(" + ",".join(parts) + ")",
        "length_m": int(round(length_m)),
        "network": tags.get("network"),
        "sac_scale": tags.get("sac_scale"),
        "raw_tags": tags,
        "gap_info": gap_info,
    }


# ---------------------------------------------------------------------------
# DB
# ---------------------------------------------------------------------------

INSERT_SQL = """
    INSERT INTO trips (country, category, title, geom, distance_m, sac_scale,
                       network, source, source_ref, license, attribution_text,
                       raw_tags, gap_info)
    VALUES (%(country)s, 'hike', %(title)s,
            ST_Force3D(ST_GeomFromText(%(wkt)s, 4326)),
            %(length_m)s, %(sac_scale)s, %(network)s, 'osm', %(source_ref)s,
            %(license)s, %(attribution)s, %(raw_tags)s, %(gap_info)s)
    ON CONFLICT (source, source_ref) WHERE source_ref IS NOT NULL
    DO UPDATE SET
        country = EXCLUDED.country, title = EXCLUDED.title,
        geom = EXCLUDED.geom, distance_m = EXCLUDED.distance_m,
        sac_scale = EXCLUDED.sac_scale, network = EXCLUDED.network,
        license = EXCLUDED.license,
        attribution_text = EXCLUDED.attribution_text,
        raw_tags = EXCLUDED.raw_tags, gap_info = EXCLUDED.gap_info
    RETURNING id
"""

UPDATE_SQL = """
    UPDATE trips
    SET country = %(country)s, title = %(title)s,
        geom = ST_Force3D(ST_GeomFromText(%(wkt)s, 4326)),
        distance_m = %(length_m)s, sac_scale = %(sac_scale)s,
        network = %(network)s, license = %(license)s,
        attribution_text = %(attribution)s,
        raw_tags = %(raw_tags)s, gap_info = %(gap_info)s
    WHERE id = %(id)s
"""


def load_db_index(conn):
    """source_ref -> [trip id, country, geodesic length] for prior osm rows."""
    with conn.cursor() as cur:
        cur.execute("""SELECT source_ref, id, country,
                              COALESCE(ST_Length(geom::geography), 0)
                       FROM trips WHERE source = 'osm'""")
        return {ref: [tid, country, float(length)]
                for ref, tid, country, length in cur.fetchall()}


def upsert(cur, index, country, rec, counts):
    from psycopg.types.json import Jsonb
    hit = index.get(rec["source_ref"])
    if hit and hit[1] != country and hit[2] >= rec["length_m"]:
        counts["skipped_cross_border"] += 1
        return
    params = {**rec, "country": country, "license": LICENSE,
              "attribution": ATTRIBUTION, "raw_tags": Jsonb(rec["raw_tags"]),
              "gap_info": Jsonb(rec["gap_info"])}
    if hit:
        params["id"] = hit[0]
        cur.execute(UPDATE_SQL, params)
        counts["updated"] += 1
        index[rec["source_ref"]] = [hit[0], country, float(rec["length_m"])]
    else:
        cur.execute(INSERT_SQL, params)
        new_id = cur.fetchone()[0]
        counts["inserted"] += 1
        index[rec["source_ref"]] = [new_id, country, float(rec["length_m"])]


def spot_check(conn, country):
    """Acceptance probe: do the famous routes actually show up?"""
    with conn.cursor() as cur:
        for pattern in SPOT_CHECKS.get(country, []):
            cur.execute(
                """SELECT title, distance_m FROM trips
                   WHERE source = 'osm' AND country = %s
                     AND (title ILIKE %s OR raw_tags->>'ref' ILIKE %s)
                   ORDER BY distance_m DESC NULLS LAST LIMIT 4""",
                (country, pattern, pattern))
            rows = cur.fetchall()
            cur.execute(
                """SELECT count(*) FROM trips
                   WHERE source = 'osm' AND country = %s
                     AND (title ILIKE %s OR raw_tags->>'ref' ILIKE %s)""",
                (country, pattern, pattern))
            total = cur.fetchone()[0]
            sample = "; ".join(
                f"{title} ({dist / 1000:.0f} km)" if dist else title
                for title, dist in rows)
            print(f"  spot check {pattern!r}: {total} routes"
                  + (f", top: {sample}" if sample else ""))


# ---------------------------------------------------------------------------
# Per-country drive
# ---------------------------------------------------------------------------

def ingest_country(slug, country, args, conn, index):
    counts = Counter()
    pbf = fetch_extract(slug, args.refresh)

    t0 = time.time()
    pool = scan_relations(pbf)
    selected = [rid for rid in sorted(pool)
                if passes_first_filter(pool[rid]["tags"])]
    if args.limit:
        selected = selected[:args.limit]
    counts["pool"], counts["selected"] = len(pool), len(selected)
    print(f"[{slug}] relations: {len(pool)} hiking/foot/walking routes, "
          f"{len(selected)} pass the first filter ({time.time() - t0:.0f}s)")

    expansions, needed_ways = {}, set()
    for rid in selected:
        rstats = Counter()
        way_refs = expand_ways(rid, pool, rstats, seen=set())
        expansions[rid] = (way_refs, rstats)
        needed_ways.update(way_refs)

    t0 = time.time()
    way_nodes = load_ways(pbf, needed_ways)
    counts["ways_needed"], counts["ways_found"] = len(needed_ways), len(way_nodes)
    print(f"[{slug}] ways: {len(way_nodes)}/{len(needed_ways)} member ways "
          f"loaded ({time.time() - t0:.0f}s)")

    t0 = time.time()
    if way_nodes:
        node_ids = np.unique(np.concatenate(
            [np.frombuffer(a, dtype=np.int64) for a in way_nodes.values()]))
    else:
        node_ids = np.empty(0, dtype=np.int64)
    locator = load_locations(pbf, node_ids)
    counts["nodes"] = len(locator.ids)
    print(f"[{slug}] nodes: {len(locator.ids)}/{len(node_ids)} locations "
          f"loaded ({time.time() - t0:.0f}s)")

    t0 = time.time()
    records = []
    for rid in selected:
        way_refs, rstats = expansions[rid]
        rec = build_record(rid, pool[rid], way_refs, rstats, way_nodes, locator)
        counts["ways_missing"] += rstats["missing_ways"]
        if rec is None:
            counts["no_geometry"] += 1
            continue
        gi = rec["gap_info"]
        counts["with_gaps"] += 1 if gi["gap_count"] else 0
        counts["unordered"] += 1 if gi["unordered_members"] else 0
        counts["clipped"] += 1 if gi.get("clipped") else 0
        records.append(rec)

    if args.dry_run:
        counts["assembled"] = len(records)
        longest = sorted(records, key=lambda r: -r["length_m"])[:3]
        print(f"[{slug}] dry run: {len(records)} routes assembled "
              f"({time.time() - t0:.0f}s), longest: "
              + "; ".join(f"{r['title']} ({r['length_m'] / 1000:.0f} km)"
                          for r in longest))
    else:
        with conn.cursor() as cur:
            for rec in records:
                upsert(cur, index, country, rec, counts)
        conn.commit()
        print(f"[{slug}] db: {counts['inserted']} inserted, "
              f"{counts['updated']} updated, "
              f"{counts['skipped_cross_border']} skipped (longer in another "
              f"extract), {counts['no_geometry']} without geometry "
              f"({time.time() - t0:.0f}s)")
        spot_check(conn, country)
        conn.commit()   # release the spot-check read locks before the next country
    print(f"[{slug}] quality: {counts['with_gaps']} with gaps, "
          f"{counts['unordered']} unordered member lists, "
          f"{counts['clipped']} clipped at the extract border, "
          f"{counts['ways_missing']} member ways missing")
    return counts


def main():
    sys.stdout.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(
        description="Ingest OSM hiking route relations from Geofabrik "
                    "extracts into the trailslab trips table.")
    parser.add_argument("--countries", default=",".join(COUNTRIES),
                        help="comma-separated Geofabrik country slugs "
                             f"(default: {','.join(COUNTRIES)})")
    parser.add_argument("--refresh", action="store_true",
                        help="re-download extracts even when cached")
    parser.add_argument("--dry-run", action="store_true",
                        help="parse and assemble only, no DB writes")
    parser.add_argument("--limit", type=int, default=0,
                        help="cap selected relations per country (testing)")
    args = parser.parse_args()

    slugs = [s.strip().lower() for s in args.countries.split(",") if s.strip()]
    unknown = [s for s in slugs if s not in COUNTRIES]
    if unknown:
        parser.error(f"unknown countries: {', '.join(unknown)} "
                     f"(known: {', '.join(COUNTRIES)})")

    conn, index = None, {}
    if not args.dry_run:
        conn = connect()
        index = load_db_index(conn)
        # End the implicit read transaction: holding even an ACCESS SHARE
        # lock through a multi-GB download queues any concurrent ALTER TABLE
        # (and everything behind it) for the whole ingest.
        conn.commit()

    failures = []
    totals = Counter()
    for slug in slugs:
        try:
            totals += ingest_country(slug, COUNTRIES[slug], args, conn, index)
        except Exception as exc:  # keep going: coverage beats fail-fast
            failures.append(f"{slug}: {type(exc).__name__}: {exc}")
            print(f"[{slug}] FAILED: {type(exc).__name__}: {exc}")

    if conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE data_sources SET last_refreshed_at = now() "
                        "WHERE name = 'osm'")
        conn.commit()
        conn.close()

    print(f"\ntotal: {totals['selected']} routes selected, "
          f"{totals['inserted']} inserted, {totals['updated']} updated, "
          f"{totals['skipped_cross_border']} cross-border skips, "
          f"{totals['no_geometry']} without geometry")
    if failures:
        print("failures: " + " | ".join(failures))
        sys.exit(1)


if __name__ == "__main__":
    main()
