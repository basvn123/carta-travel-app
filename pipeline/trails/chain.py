"""Order, orient and choose the parts of a broken walk (T1094, D7).

Pure: no database, no OSM reader, no numpy. Both places that meet a walk in
pieces call it:

  splice.py        a relation whose stored parts are out of order or stored
                   backwards. splice.py measures every break from the END of
                   part i to the START of part i+1, in the order the relation
                   lists them. A part stored backwards, or listed late, then
                   reads as a break of kilometres when the two ends are in
                   fact a few metres apart, and the walk is refused. This
                   finds the order and the direction in which the breaks are
                   real breaks, and measures those.
  derive_routes.py a famous walk mapped as named ways (no relation) whose
                   chain branches: the main line plus a short parallel
                   variant, or a spur down to a hut. The strict passes refused
                   every branching chain, so Orla Perc's one-way section was
                   enough to lose it. This picks the longest continuous line
                   through the pieces and lets it ship only when it carries
                   almost all of the chain (SPINE_SHARE_MIN).

What it never does: invent a leg. Every join it draws is between two ends
within `max_gap_m` of each other, the caller's bound (300 m in splice.py, the
50 m chaining tolerance in derive_routes.py), and every limit the caller
already applies to the total still applies to the result.

A part is a dict with at least:
    start, end   (lon, lat) of its first and last point
    len_m        its length in metres
Anything else in it rides through untouched.
"""

import math

EARTH_RADIUS_M = 6371008.8

# The longest continuous line has to carry this share of the chain's length
# before it may stand for the chain. 0.80 is "the main line plus a variant or
# a spur", which is what the rule exists for. Below it the pieces are not one
# walk with an extra, they are two walks, and the strict passes keep refusing
# them: publishing half of a famous walk under its full name turns the
# coverage report green over a real miss.
SPINE_SHARE_MIN = 0.80

# Search budget. A relation has at most a few dozen parts once splice.py's
# own limits apply; exhaustive search is exact there and this cap only stops
# a pathological input from running for minutes. When the cap is hit the best
# path found so far is returned, which is still a valid path, only perhaps not
# the longest one.
MAX_EXPANSIONS = 200_000


def haversine_m(a, b):
    """Great-circle metres between two (lon, lat) points."""
    lon1, lat1 = math.radians(a[0]), math.radians(a[1])
    lon2, lat2 = math.radians(b[0]), math.radians(b[1])
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(h)))


def _ends(part, flipped):
    return (part["end"], part["start"]) if flipped else (part["start"],
                                                         part["end"])


def best_chain(parts, max_gap_m, require_all=False,
               max_expansions=MAX_EXPANSIONS):
    """The longest line through `parts`, each used once, either direction.

    Consecutive parts may join only where the leaving end and the arriving
    start are within `max_gap_m`. Among paths of equal covered length the one
    with the smaller total gap wins, so a reordering never prefers a longer
    straight connector to a shorter one.

    Returns a dict, or None when `parts` is empty:
        order     [(index, flipped), ...] in walking order
        gaps      metres of each join, len(order) - 1 entries
        len_m     length covered by the chosen parts
        share     len_m over the length of all parts
        complete  every part is in the chain

    With require_all=True a chain that leaves any part out returns None: the
    splice rule, where every part of a relation is part of the walk."""
    n = len(parts)
    if not n:
        return None
    total = sum(float(p["len_m"]) for p in parts) or 1.0

    # Every legal join, precomputed: (i, fi) -> [(j, fj, gap)], nearest first.
    joins = {}
    for i in range(n):
        for fi in (False, True):
            _s, leave = _ends(parts[i], fi)
            out = []
            for j in range(n):
                if j == i:
                    continue
                for fj in (False, True):
                    arrive, _e = _ends(parts[j], fj)
                    gap = haversine_m(leave, arrive)
                    if gap <= max_gap_m:
                        out.append((j, fj, gap))
            out.sort(key=lambda x: x[2])
            joins[(i, fi)] = out

    best = {"len": -1.0, "gap": 0.0, "order": [], "gaps": []}
    budget = [max_expansions]
    # Longest parts first: the first complete paths found are long ones, so
    # the bound below prunes early.
    starts = sorted(((i, f) for i in range(n) for f in (False, True)),
                    key=lambda x: -float(parts[x[0]]["len_m"]))

    def better(length, gap):
        if length > best["len"] + 1e-6:
            return True
        return abs(length - best["len"]) <= 1e-6 and gap < best["gap"] - 1e-6

    def walk(node, used, length, gap, order, gaps, remaining):
        if budget[0] <= 0:
            return
        budget[0] -= 1
        if better(length, gap):
            best.update(len=length, gap=gap, order=list(order),
                        gaps=list(gaps))
        # Bound: even taking every unused part cannot beat the best.
        if length + remaining < best["len"] - 1e-6:
            return
        for j, fj, g in joins[node]:
            if j in used:
                continue
            used.add(j)
            order.append((j, fj))
            gaps.append(g)
            pl = float(parts[j]["len_m"])
            walk((j, fj), used, length + pl, gap + g, order, gaps,
                 remaining - pl)
            order.pop()
            gaps.pop()
            used.discard(j)

    for i, f in starts:
        pl = float(parts[i]["len_m"])
        walk((i, f), {i}, pl, 0.0, [(i, f)], [], total - pl)
        if budget[0] <= 0:
            break

    used = {i for i, _f in best["order"]}
    result = {
        "order": best["order"],
        "gaps": best["gaps"],
        "len_m": best["len"],
        "share": best["len"] / total,
        "complete": len(used) == n,
        "searched": max_expansions - budget[0],
    }
    if require_all and not result["complete"]:
        return None
    return result


def apply_order(coord_parts, order):
    """Concatenate coordinate lists in the chain's order and direction.

    `coord_parts[i]` is a list of points: coordinate tuples, or OSM node ids
    (derive_routes chains node-id segments). A flipped part is reversed.
    Where a part starts on the point the previous one ended on, the repeated
    point is dropped, so a chain of parts that already touch comes out
    exactly as the stitched line would."""
    line = []
    for i, flipped in order:
        pts = list(coord_parts[i])
        if flipped:
            pts.reverse()
        if line and pts and line[-1] == pts[0]:
            pts = pts[1:]
        line.extend(pts)
    return line


def spine(parts, max_gap_m, share_min=SPINE_SHARE_MIN):
    """The main line of a branching chain, or None when there is none.

    best_chain without require_all, held to `share_min`: the longest line
    through the pieces may stand for the whole only when it carries nearly
    all of it. What it leaves out is reported so the caller can record it:
        set_aside      indices of the parts not on the line
        set_aside_m    their total length"""
    got = best_chain(parts, max_gap_m)
    if not got or got["share"] < share_min:
        return None
    on = {i for i, _f in got["order"]}
    got["set_aside"] = [i for i in range(len(parts)) if i not in on]
    got["set_aside_m"] = sum(float(parts[i]["len_m"])
                             for i in got["set_aside"])
    return got
