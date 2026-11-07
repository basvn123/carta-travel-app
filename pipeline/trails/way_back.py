"""The way back to the start for a one-way walk (T1185, ROADMAP D24).

Tier: Scheduled (runs inside export_wire.py; no lab of its own)

A walk that ends somewhere else than it starts leaves the walker with a
question the page used to answer with one sentence ("plan the way back").
This answers it from data already on the wire row and in the lab's
transit_stops table, with no timetable and no routing service:

  walk   the way back on foot along the route itself: its own distance and
         its own time (the walk reversed; downhill and uphill are not told
         apart, the time is the forward time).
  taxi   a road estimate from the straight line between the two ends:
         km = straight line * CIRCUITY, minutes = km / TAXI_KMH, rounded up
         to 5. It is an estimate and is shipped as one (`est`), beyond
         TAXI_MAX_KM it is left out because nobody takes a taxi that far.
  pt     the public transport modes found within 500 m of each end
         (transit_stops: rail, bus, ferry). Where a mode is at both ends the
         walker can plausibly ride back; the time is NOT known (there is no
         timetable feed in the repo), so none is shipped. A database without
         the transit table ships no `pt` at all: "not looked at" and "looked
         and found none" (an empty list) are different statements.

A loop has no way back and gets no record. A trek (treks.py) is walked as a
whole, so its way back runs from the end of its last stage to the start of
its first, with the walk time of every stage added.

Every record carries `_src` and `_asof` (T1143).

ASCII clean, no em dashes, per project convention.
"""

import math

SRC = "osm"             # pipeline/config/sources.yaml id (ends from the route, stops from OSM)
LOOP_KM = 0.5           # ends closer than this: a loop, no way back (treks.LOOP_KM)
CIRCUITY = 1.3          # road distance over straight line, rural Europe
TAXI_KMH = 50.0         # average over mixed rural and village roads
TAXI_ROUND_MIN = 5      # a taxi time is quoted in 5 minute steps
TAXI_MAX_KM = 150.0     # straight line; beyond this no taxi is offered
MODES = ("rail", "bus", "ferry")


def km_between(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 6371.0 * 2 * math.asin(min(1.0, math.sqrt(h)))


def endpoints(geometry):
    """First and last vertex of a wire line as [lon, lat], or None."""
    g = geometry or {}
    coords = g.get("coordinates") or []
    if g.get("type") == "MultiLineString":
        parts = [p for p in coords if p]
        if not parts:
            return None
        return parts[0][0], parts[-1][-1]
    if not coords:
        return None
    return coords[0], coords[-1]


def modes_of(flags):
    """['rail', 'bus', ...] from a {"rail": true} flag dict, in MODES order;
    None when the flags were not looked up at all (the dict is None)."""
    if flags is None:
        return None
    return [m for m in MODES if flags.get(m)]


def taxi_of(straight_km):
    """{km, min, est: true} from the straight line, or None when too far."""
    if straight_km is None or straight_km > TAXI_MAX_KM:
        return None
    road = straight_km * CIRCUITY
    minutes = road / TAXI_KMH * 60.0
    step = TAXI_ROUND_MIN
    return {"km": round(road, 1),
            "min": max(step, int(math.ceil(minutes / step) * step)),
            "est": True}


def record(start, end, walk_km=None, walk_min=None, flags_start=None,
           flags_end=None, asof=None):
    """The way-back record for a walk from `start` to `end` ([lon, lat]), or
    None when it is a loop or an end is missing.

    flags_start / flags_end are {"rail": true, ...} dicts as export_wire's
    transit_of gives them, or None when transit was not looked up (then no
    `pt` is shipped). {} means looked up and nothing found."""
    if not start or not end:
        return None
    straight = km_between(start, end)
    if straight <= LOOP_KM:
        return None
    rec = {"km": round(straight, 1)}
    walk = {}
    if walk_km is not None:
        walk["km"] = round(float(walk_km), 1)
    if walk_min is not None:
        walk["min"] = int(walk_min)
    if walk:
        rec["walk"] = walk
    taxi = taxi_of(straight)
    if taxi:
        rec["taxi"] = taxi
    s, e = modes_of(flags_start), modes_of(flags_end)
    if s is not None and e is not None:
        rec["pt"] = {"s": s, "e": e, "both": [m for m in s if m in e]}
    rec["_src"] = SRC
    rec["_asof"] = asof
    return rec


def _km(item):
    d = item.get("distance_m")
    return None if d is None else d / 1000.0


def of_item(item, flags_end, asof):
    """The record for one wire item (before treks are applied). `flags_end`
    is the end-of-line transit dict from the SQL, or None if not looked up.
    The start flags are the item's own `transit` (absent means none found
    when the end was looked up, because the same table answered both)."""
    ends = endpoints(item.get("geometry"))
    if not ends:
        return None
    looked = flags_end is not None
    return record(ends[0], ends[1], _km(item), item.get("duration_min"),
                  (item.get("transit") or {}) if looked else None,
                  flags_end, asof)


def of_trek(first, last, flags_first, flags_last, total_km, total_min, asof):
    """A trek's record: from the end of its last stage to the start of its
    first. `first` and `last` are wire items; flags_* as in `of_item`
    (start of the first stage, end of the last)."""
    a, b = endpoints(first.get("geometry")), endpoints(last.get("geometry"))
    if not a or not b:
        return None
    looked = flags_last is not None
    return record(a[0], b[1], total_km, total_min,
                  (flags_first or {}) if looked else None, flags_last, asof)


def apply(items_by_country, trek_list, ends, asof):
    """Stamp `wb` on the wire items and the treks, in place.

    ends: {item id: end-of-line transit dict or None} from the lab.
    A stage that belongs to a trek gets no `wb` of its own: the trek is
    walked as a whole and carries the record. Returns counts for the log."""
    by_id = {i["id"]: i for items in items_by_country.values() for i in items}
    n_row = n_trek = n_unknown = 0
    for trek in trek_list:
        stages = trek.get("stages") or []
        first, last = by_id.get(stages[0]["id"]) if stages else None, \
            by_id.get(stages[-1]["id"]) if stages else None
        if not first or not last:
            continue
        rec = of_trek(first, last, first.get("transit"),
                      ends.get(last["id"]), trek.get("km"), trek.get("min") or None,
                      asof)
        if rec:
            trek["wb"] = rec
            n_trek += 1
    for items in items_by_country.values():
        for item in items:
            if item.get("trek") or item.get("t") == "l":
                continue
            rec = of_item(item, ends.get(item["id"]), asof)
            if rec:
                item["wb"] = rec
                n_row += 1
                if "pt" not in rec:
                    n_unknown += 1
    return {"rows": n_row, "treks": n_trek, "pt_unknown": n_unknown}
