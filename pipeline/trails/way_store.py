"""Compact per-way storage for derive_routes.py (T1223).

derive_routes used to hold every walkable way of a country as Python objects:
a dict of one numpy array per way, a dict of one tag dict per way, a dict of
lists for the endpoint graph, a dict of folded names for every way. Spain is
2.9 million walkable ways, and those objects, plus osmium's IdFilter (a
bitmap over the span of the ids it is given: about 1.6 GB for a country,
whose nodes run from the oldest ids to the newest), took 3.35 GB and the box's out-of-memory killer stopped the
quarterly run on 2026-11-11. France and Germany are three times Spain.

Everything here keeps the read interface derive_routes already used
(`ways.nodes[wid]`, `ways.tags.get(wid, {})`, `ends.get(node, [])`,
`lengths.get(wid, 0.0)`, iteration in scan order), so the clustering code and
its results are unchanged: tests/test_trail_derive_memory.py runs the old and
the new store on the same extract and asserts identical records.

  node refs     one int32 array of positions into the sorted unique node ids
                of the extract, plus an offsets array. A way's refs are
                `node_ids[pos[off[i]:off[i + 1]]]`, a fresh small array.
  tags          interned: each distinct tag set is stored once, as a
                read-only mapping, and each way holds the index of its set.
                Most walkable ways share a handful of sets
                ({highway: footway}, {highway: track, tracktype: grade2}).
  per-tag-set   anything computed from a way's tags alone (the folded name,
  values        the base name) is computed once per tag set.
  endpoints     a sorted array of end positions and a stable argsort, in
                place of a dict of lists; same ways, same order.
  locations     x/y aligned with the unique node ids plus a found flag,
                loaded in passes over slices of the id range so the osmium
                IdFilter bitmap of one pass (one bit per id of SPAN) stays
                under CARTA_DERIVE_IDSET_MB.
"""

import os
from array import array
from bisect import bisect_left
from types import MappingProxyType

import numpy as np

# IdFilter keeps a bitmap over the SPAN of the ids it is given, one bit per
# id from the lowest to the highest, however few ids that is. Measured with
# pyosmium 4.3 (T1223): 1,000 ids over a span of 1e8 took 12.6 MB, over 1e9
# 130 MB, wherever the span starts; 30 M ids over the whole node id range
# (about 1.3e10) took 1,630 MB. So a pass covers at most this many MB of
# bitmap, i.e. budget * 8e6 ids of span, and the passes skip empty ranges.
IDSET_BUDGET_MB = float(os.environ.get("CARTA_DERIVE_IDSET_MB", "400"))
IDS_PER_MB = 8_000_000

# Refs are buffered in chunks of this many ids during the scan, so the scan
# never holds one growing array that has to be copied when it reallocates.
REF_CHUNK = 4_000_000

_MISSING = object()


class WayIndex:
    """Way id -> position in scan order. Geofabrik extracts are sorted by
    id, so the common case keeps one array and searches it directly."""

    def __init__(self, wids):
        self.wids = wids                      # array('q'), scan order
        arr = np.frombuffer(wids, dtype=np.int64) if len(wids) else \
            np.zeros(0, dtype=np.int64)
        self.sorted_scan = bool(len(arr) < 2 or np.all(arr[1:] > arr[:-1]))
        if self.sorted_scan:
            self._keys, self._order = wids, None
        else:
            order = np.argsort(arr, kind="stable")
            self._keys = array("q", arr[order].tobytes())
            self._order = array("q", order.astype(np.int64).tobytes())

    def __len__(self):
        return len(self.wids)

    def pos(self, wid):
        keys = self._keys
        i = bisect_left(keys, wid)
        if i < len(keys) and keys[i] == wid:
            return i if self._order is None else self._order[i]
        return -1


class _PerWay:
    """Read-only mapping protocol over ways, by way id, in scan order."""

    def __init__(self, index):
        self.index = index

    def _value(self, p):
        raise NotImplementedError

    def __len__(self):
        return len(self.index)

    def __iter__(self):
        return iter(self.index.wids)

    def keys(self):
        return iter(self.index.wids)

    def __contains__(self, wid):
        return self.index.pos(wid) >= 0

    def __getitem__(self, wid):
        p = self.index.pos(wid)
        if p < 0:
            raise KeyError(wid)
        return self._value(p)

    def get(self, wid, default=None):
        p = self.index.pos(wid)
        return default if p < 0 else self._value(p)

    def items(self):
        for p, wid in enumerate(self.index.wids):
            yield wid, self._value(p)

    def values(self):
        for p in range(len(self.index.wids)):
            yield self._value(p)


class WayNodes(_PerWay):
    """`ways.nodes[wid]` -> int64 array of the way's node ids."""

    def __init__(self, index, node_ids, pos, offs):
        super().__init__(index)
        self.node_ids = node_ids              # sorted unique int64
        self.pos = pos                        # int32 positions, all ways
        self.offs = offs                      # array('q'), len n + 1

    def _value(self, p):
        return self.node_ids[self.pos[self.offs[p]:self.offs[p + 1]]]

    def positions(self, p):
        """The way at scan position p, as positions into node_ids."""
        return self.pos[self.offs[p]:self.offs[p + 1]]


class WayTags(_PerWay):
    """`ways.tags[wid]` -> the way's (shared, read-only) tag mapping."""

    def __init__(self, index, sid, sets):
        super().__init__(index)
        self.sid = sid                        # array('i'), set id per way
        self.sets = sets                      # list of MappingProxyType

    def _value(self, p):
        return self.sets[self.sid[p]]


class PerTagSet(_PerWay):
    """A value computed from a way's tags alone, computed once per tag set.

    `fn(tags)` returns the value; returning `skip` leaves the way out of the
    mapping, which is how a dict filled only for named ways is reproduced
    (iteration, `in` and `get` all agree with that dict)."""

    def __init__(self, tags, fn, skip=_MISSING):
        super().__init__(tags.index)
        self.tags = tags
        self.vals = [fn(t) for t in tags.sets]
        self.skip = skip
        self.sparse = skip is not _MISSING
        # Counted once: `keys_by_rule or {}` in _grow asks for truthiness on
        # every call, and a walk over every way there cost Luxembourg 53 s.
        if self.sparse:
            keep = [v is not skip for v in self.vals]
            self._len = sum(1 for s in tags.sid if keep[s])
        else:
            self._len = len(self.index)

    def _present(self, p):
        return not self.sparse or self.vals[self.tags.sid[p]] is not self.skip

    def _value(self, p):
        return self.vals[self.tags.sid[p]]

    def __contains__(self, wid):
        p = self.index.pos(wid)
        return p >= 0 and self._present(p)

    def __getitem__(self, wid):
        p = self.index.pos(wid)
        if p < 0 or not self._present(p):
            raise KeyError(wid)
        return self._value(p)

    def get(self, wid, default=None):
        p = self.index.pos(wid)
        if p < 0 or not self._present(p):
            return default
        return self._value(p)

    def __iter__(self):
        if not self.sparse:
            return iter(self.index.wids)
        return (w for p, w in enumerate(self.index.wids) if self._present(p))

    keys = __iter__

    def __len__(self):
        return self._len

    def __bool__(self):
        return self._len > 0

    def items(self):
        for p, wid in enumerate(self.index.wids):
            if self._present(p):
                yield wid, self._value(p)

    def values(self):
        for _w, v in self.items():
            yield v


class WayFloats(_PerWay):
    """`lengths.get(wid, 0.0)` over a float64 array in scan order."""

    def __init__(self, index, arr):
        super().__init__(index)
        self.arr = arr

    def _value(self, p):
        return float(self.arr[p])


class EndIndex:
    """`ends.get(node, [])`: the ways starting or ending at a node id, in the
    order the old dict of lists held them (scan order, start before end; a
    closed way appears twice, as it did)."""

    def __init__(self, nodes):
        self.nodes = nodes
        n = len(nodes)
        pos, offs = nodes.pos, np.frombuffer(nodes.offs, dtype=np.int64)
        keys = np.empty(2 * n, dtype=np.int32)
        if n:
            keys[0::2] = pos[offs[:-1]]
            keys[1::2] = pos[offs[1:] - 1]
        order = np.argsort(keys, kind="stable").astype(np.int32)
        self.keys = keys[order]
        self.way_of = order >> 1              # interleaved slot -> way
        del order

    def get(self, node, default=None):
        node_ids = self.nodes.node_ids
        i = int(np.searchsorted(node_ids, node))
        if i >= len(node_ids) or node_ids[i] != node:
            return [] if default is None else default
        # Search with the array's own dtype: a Python int against an int32
        # array makes numpy cast the whole array on every call.
        key = np.int32(i)
        lo = int(self.keys.searchsorted(key, side="left"))
        hi = int(self.keys.searchsorted(key, side="right"))
        if lo == hi:
            return [] if default is None else default
        wids = self.nodes.index.wids
        return [wids[int(p)] for p in self.way_of[lo:hi]]


class AlignedLocations:
    """Coordinates aligned with the unique node ids; drop-in for the
    ingest's NodeLocations (`coords_for` returns ok, xs, ys and every caller
    reads xs/ys only where ok is set)."""

    def __init__(self, ids, xs, ys, found):
        self.ids, self.xs, self.ys, self.found = ids, xs, ys, found

    @property
    def n_found(self):
        return int(self.found.sum())

    def coords_for(self, refs):
        refs = np.asarray(refs, dtype=np.int64)
        if not len(self.ids):
            zero = np.zeros(len(refs))
            return np.zeros(len(refs), dtype=bool), zero, zero
        pos = np.minimum(np.searchsorted(self.ids, refs), len(self.ids) - 1)
        ok = (self.ids[pos] == refs) & self.found[pos]
        return ok, self.xs[pos], self.ys[pos]

    def coords_at(self, positions):
        """Same as coords_for, for positions into ids (no search)."""
        return self.found[positions], self.xs[positions], self.ys[positions]


class WayStoreBuilder:
    """Collects ways during the scan; finish() returns the compact store."""

    def __init__(self):
        self.wids = array("q")
        self.offs = array("q", [0])
        self.sid = array("i")
        self._chunks, self._cur = [], array("q")
        self._set_ids, self.sets = {}, []
        self.structure = set()
        self._n_refs = 0

    def add(self, wid, refs, tags):
        self.wids.append(wid)
        self._cur.extend(refs)
        self._n_refs += len(refs)
        self.offs.append(self._n_refs)
        key = tuple(tags.items())
        s = self._set_ids.get(key)
        if s is None:
            s = self._set_ids[key] = len(self.sets)
            self.sets.append(MappingProxyType(dict(key)))
        self.sid.append(s)
        if len(self._cur) >= REF_CHUNK:
            self._chunks.append(np.frombuffer(self._cur, dtype=np.int64))
            self._cur = array("q")

    def finish(self, ways):
        """Fill `ways` (a WalkWays) with the compact store."""
        if len(self._cur):
            self._chunks.append(np.frombuffer(self._cur, dtype=np.int64))
        self._cur = None
        if self._chunks:
            flat = np.concatenate(self._chunks)
        else:
            flat = np.zeros(0, dtype=np.int64)
        self._chunks = None
        node_ids = np.unique(flat)
        pos = np.empty(len(flat), dtype=np.int32)
        step = REF_CHUNK
        for i in range(0, len(flat), step):
            pos[i:i + step] = np.searchsorted(node_ids, flat[i:i + step])
        del flat
        index = WayIndex(self.wids)
        ways.index = index
        ways.nodes = WayNodes(index, node_ids, pos, self.offs)
        ways.tags = WayTags(index, self.sid, self.sets)
        ways.structure = self.structure
        self._set_ids = None
        return ways


def load_aligned_locations(pbf_path, node_ids, budget_mb=None, osmium=None):
    """Locations for `node_ids` (sorted unique), in passes over slices of the
    id range so one IdFilter bitmap stays under `budget_mb`.

    The result is identical to one pass: each node id is found or not
    regardless of which pass asks for it."""
    if osmium is None:
        import osmium as osmium_mod
        osmium = osmium_mod
    budget_mb = IDSET_BUDGET_MB if budget_mb is None else budget_mb
    n = len(node_ids)
    xs = np.zeros(n, dtype=np.int32)
    ys = np.zeros(n, dtype=np.int32)
    found = np.zeros(n, dtype=bool)
    if not n:
        return AlignedLocations(node_ids, xs, ys, found), 0
    span = max(1, int(budget_mb * IDS_PER_MB))
    slices, lo = [], 0
    while lo < n:
        hi = int(np.searchsorted(node_ids, int(node_ids[lo]) + span,
                                 side="left"))
        slices.append((lo, hi))
        lo = hi
    passes = 0
    for lo, hi in slices:
        sub = node_ids[lo:hi]
        fp = osmium.FileProcessor(str(pbf_path), osmium.osm.NODE) \
            .with_filter(osmium.filter.IdFilter(sub))
        ids, gx, gy = array("q"), array("i"), array("i")
        for node in fp:
            loc = node.location
            if not loc.valid():
                continue
            ids.append(node.id)
            gx.append(loc.x)
            gy.append(loc.y)
        del fp
        passes += 1
        if not len(ids):
            continue
        got = np.frombuffer(ids, dtype=np.int64)
        p = lo + np.searchsorted(sub, got)
        xs[p] = np.frombuffer(gx, dtype=np.int32)
        ys[p] = np.frombuffer(gy, dtype=np.int32)
        found[p] = True
    return AlignedLocations(node_ids, xs, ys, found), passes


def peak_rss_mb():
    """Peak resident memory of this process in MB, or None where unknown."""
    try:
        import resource
        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return peak / 1024.0                  # Linux reports KiB
    except ImportError:
        pass
    try:
        import psutil
        info = psutil.Process().memory_info()
        return getattr(info, "peak_wset", info.rss) / 1e6
    except Exception:
        return None


def mem_available_mb():
    """MemAvailable plus free swap, in MB, on Linux; None elsewhere."""
    try:
        with open("/proc/meminfo", encoding="ascii") as fh:
            info = {line.split(":")[0]: int(line.split()[1])
                    for line in fh if ":" in line}
    except OSError:
        return None
    return (info.get("MemAvailable", 0) + info.get("SwapFree", 0)) / 1024.0
