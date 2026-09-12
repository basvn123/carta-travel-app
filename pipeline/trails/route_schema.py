"""The two route record shapes, as a MAPPING onto fields the lab already has.

ROUTES.md R1. RouteSummary is what a country file row and a destination
attach row carry; RouteDetail is the trip/{id}.json file. Neither is a new
store: the trailslab lab (tools/trailslab) stays the store of record and
export_wire.py stays the wire. What this module adds is

  1. the migration 09_hierarchy.sql, applied through schema.ensure so an
     already-migrated lab takes no lock at all,
  2. two dataclasses naming every field ROUTES.md promises, each mapped from
     the columns that hold it today or marked None until the pass that fills
     it has run (R2 members and tags, R3 hierarchy and co_located, R6
     attach fields),
  3. the handful of NEW wire keys those fields add, kept apart from the keys
     the app reads today so a diff of the wire before and after R1 shows
     additions only. Nothing here renames or reshapes an existing key.

Wire keys added to the country row:  osm, net, descent_m, sf, h
Wire keys added to the detail file:  osm, sf, h, stages, variants,
                                     member_way_ids, huts, water_points,
                                     gaps, tags_raw

The surface summary `sf` is the one derivation with any judgement in it, so
the bucket table is written out below and the unknown share is never hidden.

ASCII clean, no em dashes, per project convention.
"""

import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from schema import ensure  # noqa: E402

HIERARCHY_SQL = ROOT / "tools" / "trailslab" / "initdb" / "09_hierarchy.sql"

# trips carries hikes; cycle_routes carries cycle routes. route_relations and
# the dataclasses name the ACTIVITY, because that is what a reader filters by.
ACTIVITY_OF_TABLE = {"trips": "hiking", "cycle_routes": "cycling"}
TABLE_OF_ACTIVITY = {v: k for k, v in ACTIVITY_OF_TABLE.items()}

# Member roles that make a child relation a variant rather than a stage: the
# set ingest_osm_routes.VARIANT_ROLES drops from the main line, plus the two
# cycling adds. Stage roles are what the R2 graph actually holds on relation
# members (25,044 hiking members with "", 562 "main", then part / part1..5 /
# route segment / forward / reverse); anything else ("guidepost", "future")
# is neither and the classify step logs it.
VARIANT_ROLES = frozenset({"alternative", "alternate", "variant", "variante",
                           "variation", "excursion", "approach", "connection",
                           "link", "shortcut", "detour", "diversion",
                           "deviation", "bypass", "branch", "spur",
                           "backward_alternative"})
STAGE_ROLES = frozenset({"", "main", "primary", "forward", "backward",
                         "reverse", "part", "route", "route segment",
                         "section", "segment", "stage", "etappe", "etape",
                         "tappa", "hiking trail"})
_ROLE_RES = None


def role_kind(role):
    """'stage', 'variant' or None for one relation-member role. The two
    tables carry the spellings the graph holds; the regexes catch
    "part3", "umleitung wegen flut" and the like without a table entry
    per mapper."""
    global _ROLE_RES
    r = (role or "").strip().lower()
    if r in STAGE_ROLES:
        return "stage"
    if r in VARIANT_ROLES:
        return "variant"
    if _ROLE_RES is None:
        import re
        _ROLE_RES = (
            # "part3", "stage 12", and a bare "3": mappers number the
            # members of a superroute in the role field
            re.compile(r"^(?:(?:part|section|segment|stage|etappe|etape|tappa|leg)"
                       r"[\s_#-]*)?\d{1,3}$"),
            re.compile(r"^(alternativ|variant|umleitung|detour|diversion|"
                       r"deviation|bypass|branch|abstecher|zubringer)"),
        )
    if _ROLE_RES[0].match(r):
        return "stage"
    if _ROLE_RES[1].match(r):
        return "variant"
    return None


HIERARCHY_VALUES = ("parent", "stage", "variant", "standalone")


def ensure_schema(conn, verbose=False):
    """Apply 09_hierarchy.sql only if something it adds is missing.

    lock_timeout is set LOCAL to the transaction the ALTER runs in: if another
    session holds trips open, this fails in ten seconds with a clear error
    instead of queueing an ACCESS EXCLUSIVE lock that freezes every reader
    behind it (the failure mode schema.py exists to prevent)."""
    conn.execute("SET LOCAL lock_timeout = '10s'")
    return ensure(conn, HIERARCHY_SQL, verbose=verbose)


# ---------------------------------------------------------------------------
# Surface summary: OSM surface values into five honest buckets
# ---------------------------------------------------------------------------

# The bucket a surface=* value lands in. Anything not listed is `other`, and
# the share of length with no surface tag at all is `unknown`. Generic
# "unpaved" is deliberately `other`, not `gravel` or `path`: it says only
# what the surface is not.
SURFACE_BUCKET = {}
for _v in ("asphalt", "paved", "concrete", "concrete:plates", "concrete:lanes",
           "paving_stones", "sett", "cobblestone", "unhewn_cobblestone",
           "cobblestone:flattened", "metal", "wood", "bricks", "brick",
           "chipseal", "tartan", "rubber", "acrylic", "metal_grid"):
    SURFACE_BUCKET[_v] = "paved"
for _v in ("gravel", "fine_gravel", "compacted", "pebblestone", "shells",
           "crushed_limestone"):
    SURFACE_BUCKET[_v] = "gravel"
for _v in ("ground", "dirt", "earth", "grass", "sand", "mud", "rock", "stone",
           "woodchips", "snow", "ice", "soil", "clay", "grass_paver", "turf",
           "peat", "scree", "bare_rock", "roots", "salt", "stepping_stones"):
    SURFACE_BUCKET[_v] = "path"

SURFACE_KEYS = ("paved", "gravel", "path", "other", "unknown")


def _bucket(value):
    first = str(value or "").split(";")[0].strip().lower()
    return SURFACE_BUCKET.get(first, "other")


def _finish_surface(shares, unknown):
    out = {k: round(max(0.0, shares.get(k, 0.0)), 3) for k in SURFACE_KEYS[:-1]}
    out["unknown"] = round(max(0.0, min(1.0, unknown)), 3)
    return out


def surface_summary(way_tags):
    """Hiking: from way_tags.py's per-route surface shares.

    way_tags.surface holds shares of TOTAL length per surface value, and
    way_tags.cover.surface is the share of length that carried any surface
    tag, so unknown is 1 minus the cover rather than 1 minus the sum (the
    two agree to rounding; the cover is the authoritative figure)."""
    if not way_tags or not isinstance(way_tags, dict):
        return None
    surf = way_tags.get("surface") or {}
    if not surf and not (way_tags.get("cover") or {}).get("surface"):
        return None
    shares = {}
    for value, share in surf.items():
        try:
            shares[_bucket(value)] = shares.get(_bucket(value), 0.0) + float(share)
        except (TypeError, ValueError):
            continue
    cover = (way_tags.get("cover") or {}).get("surface")
    known = float(cover) if cover is not None else sum(shares.values())
    return _finish_surface(shares, 1.0 - known)


def surface_summary_spans(way_spans):
    """Cycling: from harvest_cycling.py's positioned way_spans, which keep a
    tagset per span so the share can be measured in metres rather than read
    off a precomputed number."""
    if not way_spans or not isinstance(way_spans, dict):
        return None
    spans = way_spans.get("spans") or []
    tagsets = way_spans.get("tagsets") or []
    if not spans:
        return None
    metres = {}
    total = 0.0
    untagged = 0.0
    for start, end, idx in spans:
        length = max(0.0, float(end) - float(start))
        total += length
        tags = tagsets[idx] if 0 <= idx < len(tagsets) else {}
        value = (tags or {}).get("surface")
        if value is None:
            untagged += length
            continue
        metres[_bucket(value)] = metres.get(_bucket(value), 0.0) + length
    untagged += float(way_spans.get("untagged_m") or 0.0)
    total += float(way_spans.get("untagged_m") or 0.0)
    if total <= 0:
        return None
    shares = {k: v / total for k, v in metres.items()}
    return _finish_surface(shares, untagged / total)


# ---------------------------------------------------------------------------
# The records
# ---------------------------------------------------------------------------

@dataclass
class RouteSummary:
    """One route as a list, a card or an attach row needs it."""
    route_id: int
    name: str
    activity: str                       # hiking | cycling
    osm_relation_id: int | None = None  # source_ref when source is osm
    network_tier: str | None = None     # iwn nwn rwn lwn / icn ncn rcn lcn
    distance_km: float | None = None
    ascent_m: int | None = None
    descent_m: int | None = None
    loop: bool | None = None
    shape: str | None = None            # loop | out_back | point | figure8
    difficulty: str | None = None       # easy moderate hard very_hard alpine
    difficulty_source: str | None = None   # tagged | derived
    waymarked: bool | None = None
    surface_summary: dict | None = None    # paved gravel path other unknown
    hierarchy: str | None = None        # parent stage variant standalone
    hierarchy_source: str | None = None
    is_stage_of: int | None = None      # the chosen parent's OSM relation id
    parent_ref: int | str | None = None   # parent wire id, else its name
    top_of: int | None = None           # root of the parent chain (the path)
    top_ref: int | str | None = None
    stage_index: int | None = None
    stage_count: int | None = None
    rating: float | None = None         # 0-10, rate.py
    quality_score: float | None = None  # 0-100, validate.py
    thumbnail_hint: str | None = None
    # Attach row only (ROUTES.md R6). None on a country row.
    distance_from_destination_km: float | None = None
    direction: dict | None = None       # {bearing, key}
    access_point: dict | None = None    # {name, lat, lon, transit_reachable}
    transit_reachable: bool | None = None


@dataclass
class RouteDetail:
    """Everything RouteSummary has, plus what only the page needs."""
    summary: RouteSummary
    geometry: dict | None = None            # full 3D MultiLineString, export's
    elevation_profile: list | None = None   # [[along_m, ele_m], ...]
    member_way_ids: list | None = None      # R2, from route_relations.members
    stages: list | None = None              # [{osm, id, i}] in member order
    variants: list | None = None            # [{osm, id, role}]
    huts: list | None = None                # [{name, lat, lon, along_m, off_m, ele_m}]
    water_points: list | None = None
    transit_access: list | None = None      # R6
    gaps: dict | None = None                # {n} today; positions are not stored
    tags_raw: dict | None = None            # R2, route_relations.tags_all
    co_located: list | None = None          # R3c


# ---------------------------------------------------------------------------
# Mapping from lab rows
# ---------------------------------------------------------------------------

def osm_id_of(row):
    """The relation id, only when the row IS an OSM relation. Derived routes
    (source osm_ways) and composed trips carry other kinds of source_ref."""
    if row.get("source") != "osm":
        return None
    ref = str(row.get("source_ref") or "").strip()
    return int(ref) if ref.lstrip("-").isdigit() else None


def _first_image_url(row):
    for img in row.get("images") or []:
        if isinstance(img, dict) and img.get("u"):
            return img["u"]
    return None


def summary_from_row(row, activity="hiking", resolve_parent=None):
    """A trips or cycle_routes row (dict, export_wire TRIP_COLS naming, or
    load_rows below) into a RouteSummary.

    resolve_parent(osm_id) -> wire id | name | None lets the export name a
    parent that is itself published (by id) or only staged (by name)."""
    raw = row.get("raw_tags") or {}
    parents = list(row.get("parent_refs") or [])
    # stage_of is the parent the classify step chose; before R3 has run the
    # first of parent_refs is the only candidate there is.
    parent_osm = row.get("stage_of") or (parents[0] if parents else None)
    top_osm = row.get("top_of")
    if activity == "cycling":
        surface = surface_summary_spans(row.get("way_spans"))
        loop = row.get("roundtrip")
        name = row.get("name") or row.get("title") or row.get("ref")
    else:
        surface = surface_summary(row.get("way_tags"))
        loop = row.get("is_loop")
        name = row.get("title") or row.get("name")
    rating = row.get("rating")
    quality = row.get("quality_score", row.get("quality"))
    return RouteSummary(
        route_id=row["id"],
        name=name,
        activity=activity,
        osm_relation_id=osm_id_of(row),
        network_tier=row.get("network") or None,
        distance_km=(round(row["distance_m"] / 1000.0, 1)
                     if row.get("distance_m") is not None else None),
        ascent_m=row.get("ascent_m"),
        descent_m=row.get("descent_m"),
        loop=(bool(loop) if loop is not None else None),
        shape=row.get("route_type"),
        difficulty=row.get("grade"),
        difficulty_source=row.get("grade_src") if row.get("grade") else None,
        # osmc:symbol is the painted waymark; its presence is the claim.
        # Same rule as export_wire.filters_of, so `f.way` and this agree.
        waymarked=(True if raw.get("osmc:symbol") else None),
        surface_summary=surface,
        hierarchy=row.get("hierarchy"),
        hierarchy_source=row.get("hierarchy_src"),
        is_stage_of=parent_osm,
        parent_ref=(resolve_parent(parent_osm)
                    if parent_osm is not None and resolve_parent else None),
        top_of=top_osm,
        top_ref=(resolve_parent(top_osm)
                 if top_osm is not None and resolve_parent else None),
        stage_index=row.get("stage_index"),
        stage_count=row.get("stage_count"),
        rating=(float(rating) if rating is not None else None),
        quality_score=(float(quality) if quality is not None else None),
        thumbnail_hint=_first_image_url(row),
    )


def _points_of_kind(highlights, kinds):
    feats = (highlights or {}).get("features") or []
    out = [{
        "name": f.get("name"),
        "lat": f.get("lat"),
        "lon": f.get("lon"),
        "along_m": f.get("along_m"),
        "off_m": f.get("off_m"),
        "ele_m": f.get("ele_m"),
    } for f in feats if f.get("kind") in kinds]
    out.sort(key=lambda p: (p["along_m"] is None, p["along_m"] or 0))
    return out or None


def detail_from_row(row, relation=None, activity="hiking", resolve_parent=None,
                    resolve_route=None):
    """The full record. `relation` is the route_relations row for this
    route (dict with members, child_refs, tags_all), None until R2 has
    scanned; `resolve_route(osm_id) -> wire id | None` turns child relation
    ids into route ids where the child is itself published."""
    summary = summary_from_row(row, activity, resolve_parent)
    stages = variants = member_ways = tags_raw = None
    if relation:
        members = relation.get("members") or []
        member_ways = [int(ref) for mtype, ref, _role in members if mtype == "w"]
        stages, variants = [], []
        seen = set()
        for mtype, ref, role in members:
            if mtype != "r" or int(ref) in seen:
                continue
            ref = int(ref)
            seen.add(ref)
            role = (role or "").lower()
            target = resolve_route(ref) if resolve_route else None
            kind = role_kind(role)
            if kind == "variant":
                variants.append({"osm": ref, "id": target, "role": role})
            elif kind == "stage":
                stages.append({"osm": ref, "id": target, "i": len(stages) + 1})
            # any other role ("guidepost", "future") is neither and is not
            # a stage the page should count
        stages = stages or None
        variants = variants or None
        tags_raw = relation.get("tags_all") or None
    gap_info = row.get("gap_info") or {}
    gaps = ({"n": int(gap_info["gap_count"])}
            if gap_info.get("gap_count") is not None else None)
    profile = ((row.get("elevation") or {}).get("profile")
               if (row.get("elevation") or {}).get("status") == "ok" else None)
    co = row.get("co_located")
    return RouteDetail(
        summary=summary,
        geometry=row.get("full"),
        elevation_profile=profile,
        member_way_ids=member_ways,
        stages=stages,
        variants=variants,
        huts=_points_of_kind(row.get("highlights"), {"hut"}),
        water_points=_points_of_kind(row.get("highlights"), {"spring"}),
        transit_access=None,
        gaps=gaps,
        tags_raw=tags_raw,
        co_located=(list(co) if co else None),
    )


# ---------------------------------------------------------------------------
# The new wire keys, and only those
# ---------------------------------------------------------------------------

def hierarchy_block(s):
    """`h` as the wire carries it: None until R3 has classified, then
    {cls, of, top, i, n}. `of` is the chosen parent and `top` the root of
    the chain, each as a wire id when that relation is published, its name
    when it is only staged, None when unknown."""
    if not s.hierarchy:
        return None
    return {"cls": s.hierarchy, "of": s.parent_ref, "top": s.top_ref,
            "i": s.stage_index, "n": s.stage_count}


WIRE_KEYS = ("osm", "net", "descent_m", "sf", "h")
DETAIL_KEYS = ("osm", "sf", "h", "stages", "variants", "member_way_ids",
               "huts", "water_points", "gaps", "tags_raw")


def wire_keys(s):
    """Country-row additions. Every key present, null when the pass that
    fills it has not run, so a consumer can tell "not yet" from "never"."""
    return {
        "osm": s.osm_relation_id,
        "net": s.network_tier,
        "descent_m": s.descent_m,
        "sf": s.surface_summary,
        "h": hierarchy_block(s),
    }


def detail_keys(d):
    """Detail-file additions. network and descent_m are already in the
    detail file under those names, so they are not repeated here."""
    s = d.summary
    return {
        "osm": s.osm_relation_id,
        "sf": s.surface_summary,
        "h": hierarchy_block(s),
        "stages": d.stages,
        "variants": d.variants,
        "member_way_ids": d.member_way_ids,
        "huts": d.huts,
        "water_points": d.water_points,
        "gaps": d.gaps,
        "tags_raw": d.tags_raw,
    }


def fill_report(key_dicts, keys):
    """How many rows carry a value for each new key: the dry-run line."""
    n = len(key_dicts)
    return {k: (sum(1 for kd in key_dicts if kd.get(k) is not None), n)
            for k in keys}


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------

def fetch_relations(conn, activity, osm_ids):
    """route_relations rows for these relation ids, keyed by osm_id. Empty
    until R2 has scanned, which is the normal state on an R1 lab."""
    ids = sorted({int(i) for i in osm_ids if i is not None})
    if not ids:
        return {}
    with conn.cursor() as cur:
        cur.execute("""
            SELECT osm_id, country, tags_all, members, parent_refs,
                   child_refs, hierarchy, hierarchy_src, stage_index,
                   stage_count, in_store, duplicate_in, stage_of, top_of
            FROM route_relations
            WHERE activity = %s AND osm_id = ANY(%s)""", (activity, ids))
        cols = ("osm_id", "country", "tags_all", "members", "parent_refs",
                "child_refs", "hierarchy", "hierarchy_src", "stage_index",
                "stage_count", "in_store", "duplicate_in", "stage_of", "top_of")
        return {r[0]: dict(zip(cols, r)) for r in cur.fetchall()}


ROW_COLS = ("id", "title", "network", "source", "source_ref", "distance_m",
            "ascent_m", "descent_m", "is_loop", "route_type", "grade",
            "grade_src", "raw_tags", "way_tags", "gap_info", "elevation",
            "highlights", "rating", "quality_score", "hierarchy",
            "hierarchy_src", "parent_refs", "stage_of", "top_of",
            "stage_index", "stage_count", "co_located")


def load_rows(conn, ids, table="trips"):
    """The columns the mapping reads, for a handful of rows. The export has
    its own wider SELECT; this is for tests and spot checks."""
    if table != "trips":
        raise NotImplementedError("load_rows covers trips; cycle_routes rows "
                                  "come through export_cycling's own SELECT")
    with conn.cursor() as cur:
        cur.execute(f"SELECT {', '.join(ROW_COLS)} FROM trips WHERE id = ANY(%s) "
                    f"ORDER BY id", (list(ids),))
        return [dict(zip(ROW_COLS, r)) for r in cur.fetchall()]


def as_dict(record):
    return asdict(record)


if __name__ == "__main__":
    import argparse
    from db import connect
    ap = argparse.ArgumentParser(description="Apply 09_hierarchy.sql through "
                                             "the schema guard.")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()
    conn = connect()
    gaps = ensure_schema(conn, verbose=True)
    print("applied for: " + (", ".join(gaps) if gaps else "nothing, schema already current"))
    conn.close()
