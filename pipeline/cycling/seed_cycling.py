"""The famous cycle routes the wire lacks, handed to the harvest (D25 d).

Tier: Scheduled (read by run_pipeline task cycling_harvest)

pipeline/famous/coverage.py --handoff writes data/famous/seed_cycling.json:
the famous (tier A) cycle routes from Wikidata that the cycling wire does
not carry, keyed by Wikidata id, why "famous". This module reads that file
and finds each route in the same source the harvest already reads, the
country's OSM extract:

  by relation  the route's OSM relations (Wikidata P402 and the trails
               famous registry). A relation id means one thing everywhere,
               so it is pinned in whatever extract holds it.
  by name      when none of its relations is in this extract: a
               route=bicycle relation whose name (or name:en) folds equal to
               one of the route's names, and only in one of its countries.
               Equality, not "contains": "Donauradweg" must not pin every
               local loop with "Donau" in its name.

A superroute (EuroVelo, the long national routes) has no ways of its own,
so it is not pinned; its child sections are, each marked as a section of
the famous route. The export then ships them as one route with stages:
every section carries the route's Wikidata id and name.

Unlike the lakes and mountains seeds there is no hand seed here: every
entry is generated, and none is an editorial pick.
"""

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FAMOUS_FILE = ROOT / "data" / "famous" / "seed_cycling.json"

# Nested superroutes go EuroVelo -> national section -> stage; four levels is
# the same depth limit the harvest's way expansion uses.
MAX_DEPTH = 4


def _load_fold():
    # The coverage report's own fold, so "found by name" here and "matched
    # by name" there mean the same thing. Loaded by path: putting
    # pipeline/famous on sys.path would shadow the `coverage` package.
    spec = importlib.util.spec_from_file_location(
        "famous_match", ROOT / "pipeline" / "famous" / "match.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.fold


fold = _load_fold()


def famous_entries(path=None):
    """Generated seed entries, or [] when the file is absent or broken."""
    try:
        rows = json.loads(Path(path or FAMOUS_FILE)
                          .read_text(encoding="utf-8"))["rows"]
    except (OSError, ValueError, KeyError, TypeError):
        return []
    return [r for r in rows if isinstance(r, dict) and r.get("wd")
            and r.get("n") and (r.get("cc") or r.get("countries"))]


def countries_of(entry):
    return list(entry.get("countries") or []) or [entry["cc"]]


def by_country(entries=None):
    """{cc: [entry, ...]}: every country a famous route runs through, in
    file order. A route through five countries is looked up in five."""
    out = {}
    for entry in famous_entries() if entries is None else entries:
        for cc in countries_of(entry):
            out.setdefault(cc, []).append(entry)
    return out


def relations_of(entry):
    rels = set(entry.get("osm_rels") or [])
    if entry.get("osm_rel"):
        rels.add(entry["osm_rel"])
    return sorted(int(r) for r in rels)


def names_of(entry):
    return {fold(n) for n in [entry.get("n")] + list(entry.get("names") or [])
            } - {""}


def _is_node_network(tags):
    return tags.get("network:type") == "node_network"


def _children(info, skip_roles):
    return [ref for mtype, ref, role in info["members"]
            if mtype == "r" and role not in skip_roles]


def _is_parent(info):
    """A relation that holds sections rather than ways: a superroute, or a
    route=bicycle made only of child relations."""
    if info["tags"].get("type") == "superroute":
        return True
    kinds = {m[0] for m in info["members"]}
    return "r" in kinds and "w" not in kinds


def routes_under(rid, pool, skip_roles=(), seen=None, depth=0):
    """[(relation id, is_section)] that ride the relation: itself when it has
    ways, else its child sections, depth first."""
    seen = set() if seen is None else seen
    if rid in seen or rid not in pool or depth > MAX_DEPTH:
        return []
    seen.add(rid)
    info = pool[rid]
    if _is_node_network(info["tags"]):
        return []
    if not _is_parent(info):
        return [(rid, depth > 0)]
    out = []
    for child in _children(info, skip_roles):
        out.extend(routes_under(child, pool, skip_roles, seen, depth + 1))
    return out


def find_by_name(pool, entry):
    """Relations in this extract whose folded name equals one of the famous
    route's names."""
    want = names_of(entry)
    out = []
    for rid, info in pool.items():
        tags = info["tags"]
        if _is_node_network(tags):
            continue
        if {fold(tags.get("name")), fold(tags.get("name:en"))} & want:
            out.append(rid)
    return sorted(out)


def famous_pins(pool, entries, country=None, skip_roles=()):
    """{relation id: mark} for the famous routes in one extract's pool.

    `pool` is the harvest's {rid: {"tags", "members"}}; `entries` the famous
    seed; `country` the extract's ISO2, which limits the name lookup to the
    routes that run through it (a relation id is found in any extract).
    The mark is stamped on the row as raw_tags["carta:famous"]:
    {"why": "famous", "wd", "name", "how": "osm"|"name", "section"}.
    A route pinned whole beats the same relation pinned as a section."""
    pins = {}
    for entry in entries:
        hits = [r for r in relations_of(entry) if r in pool]
        how = "osm"
        if not hits and country and country in countries_of(entry):
            hits, how = find_by_name(pool, entry), "name"
        if not hits:
            continue
        found, seen = [], set()
        for rid in hits:
            found.extend(routes_under(rid, pool, skip_roles, seen))
        # Several name hits are the sections a route is mapped as
        # ("Elberadweg" in five relations): one route with stages.
        several = len(found) > 1
        for rid, section in found:
            mark = {"why": "famous", "wd": entry["wd"], "name": entry["n"],
                    "how": how, "section": bool(section or several)}
            old = pins.get(rid)
            if old is None or (old["section"] and not mark["section"]):
                pins[rid] = mark
    return pins


if __name__ == "__main__":
    groups = by_country()
    entries = famous_entries()
    print(f"{len(entries)} famous cycle routes to find across "
          f"{len(groups)} countries")
    for cc in sorted(groups):
        rows = groups[cc]
        with_rel = sum(1 for r in rows if relations_of(r))
        print(f"  {cc}: {len(rows):>3}  ({with_rel} with an OSM relation)")
