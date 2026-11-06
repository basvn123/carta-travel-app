"""Multi-stage treks: one parent record per trek, its stages in order.

Tier: Library (called by export_wire.py), plus a report CLI

ROADMAP D24, T1184. The 2026-09-13 wire publishes 1,635 rows the relation
graph classified as a stage, in 580 groups by their parent, and only 56 of
those parents are themselves published rows. A traveller who opens
"Adlerweg Etappe 12" learned nothing about the other stages, how far the
whole walk is, or how many days it takes. This module builds the missing
record from evidence already on the export's rows, strongest first:

  1. OSM superroutes  the row's `h` block (route_schema.hierarchy_block):
                      `h.cls == "stage"`, `h.of` the parent relation (a wire
                      id when the parent is published, its name when it is
                      only staged), `h.i` the stage's member position. The
                      parent's own relation id comes from the lab row
                      (`stage_of`) when the export passes it in.
  2. Stage names      "Adlerweg Etappe 12", "Green Link Walk (Section 4)",
                      "BergeSeen Trail 15: Gosau - Hallstatt", "Rivas loki
                      (1. posms)". Used to group stages no superroute ties
                      together, to merge them into a superroute group of the
                      same name, and as the stage number shown.
  3. The registry     data/trails/famous_registry.json: a trek whose parent
                      relation or folded name is a registry row takes the
                      registry's name and Wikidata id.

Grouping is refused, with a reason, rather than guessed:

  single_stage     fewer than MIN_STAGES published stages
  order_conflict   two stages claim the same position and the names do
                   not separate them
  loop_network     half or more of the stages are loops by their own line (numbered loops round one village are a
                   network, not one walk)
  not_one_path     in every candidate order, consecutive stages lie more
                   than MAX_JUMP_KM apart per missing stage (two different
                   paths with one name, or a superroute whose member order
                   is not the walking order); a group tied only by names
                   must also share an end (TOUCH_KM) on most neighbours
  too_many         more than MAX_STAGES stages (a network, not a trek)

and a row is left out of a group, with a reason, when it is a variant
(`h.cls == "variant"`), not a walk (category other than hike) or has no
position from either source (`no_order`).

What the wire gets (docs/SCHEMA.md "Multi-stage treks", T1184):

  country file  `treks[]`, each trek in the file of the country its first
                stage is filed under, with `_src` and `_asof` (T1143)
  stage row     `trek {id, cc, i, n}`: the trek's id, the country file that
                holds it, this stage's number and the published count

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import math
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from itertools import pairwise
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

import names  # noqa: E402

REGISTRY = ROOT / "data" / "trails" / "famous_registry.json"
WIRE_DIR = ROOT / "continent-app" / "public" / "trails"
REPORT = ROOT / "data" / "reports" / "trails_treks.json"

MIN_STAGES = 2
MAX_STAGES = 120          # Sormlandsleden maps 100+ stages; a node network more
MAX_JUMP_KM = 40.0        # per missing stage between consecutive endpoints
TOUCH_KM = 3.0            # two stages "share an end" within this
LOOP_KM = 0.5             # a stage whose own ends are this close is a loop
SRC = "osm"               # pipeline/config/sources.yaml id

REFUSALS = ("single_stage", "order_conflict", "loop_network", "not_one_path",
            "too_many")
ROW_SKIPS = ("variant", "not_a_walk", "no_order")

# Stage markers in the catalogue's languages. Kept beside names.SECTION_RE
# rather than inside it: that one strips a marker at the END of a name for
# matching, this one has to find it anywhere and keep the number.
MARKERS = (r"stage|etappe|etape|tappa|etapa|etapp|leg|section|sector|secteur|"
           r"abschnitt|teil|deel|odcinek|szakasz|dio|osa|dalis|posms|tramo|"
           r"troncon|day|tag|dag|den|dzien|nap|paiva|giorno|jour|dia")


def _fold_keep_length(text):
    """Accents off, one character for one, so a match on the folded text
    cuts the original at the same place ("HRP \u00c9tape 32")."""
    out = []
    for c in text:
        d = unicodedata.normalize("NFKD", c)
        out.append(d[0] if d and d[0].isascii() else c)
    return "".join(out)


# "Adlerweg Etappe 12", "Green Link Walk (Section 4)", "HRP Etape 32",
# "Eesti Jaakobitee Day 4: Rapla - Marjamaa"
_MARKER_N = re.compile(
    r"^(?P<base>.*?)[\s\-,:(\[]*\b(?:" + MARKERS + r")\.?\s*(?P<n>\d{1,3})"
    r"(?P<sfx>[a-z])?\b", re.IGNORECASE)
# "Rivas loki (1. posms)": the number before the marker
_N_MARKER = re.compile(
    r"^(?P<base>.*?)[\s\-,:(\[]*\b(?P<n>\d{1,3})\.\s*(?:" + MARKERS + r")\b",
    re.IGNORECASE)
# "BergeSeen Trail 15: Gosau - Hallstatt", "Via Apsyrtides #9: Cunski"
_N_COLON = re.compile(
    r"^(?P<base>.*?\D)\s+#?(?P<n>\d{1,3})(?P<sfx>[a-z])?\s*:\s*\S")


def parse_stage_name(name):
    """(base, number, suffix) when the name carries a stage number, else
    None. The base is what is left before the marker, unfolded; it may be
    empty ("Etape 09"), and then only a superroute can place the row."""
    text = str(name or "").strip()
    if not text:
        return None
    folded = _fold_keep_length(text)
    for rx in (_MARKER_N, _N_MARKER, _N_COLON):
        m = rx.match(folded)
        if m:
            base = text[:m.end("base")].strip(" -,:([#")
            sfx = (m.groupdict().get("sfx") or "").lower()
            return base, int(m.group("n")), sfx
    return None


def key_of(text):
    """The folded name two groups are compared by."""
    return names.squash(names.base_name(text or ""))


# ---------------------------------------------------------------------------
# Geometry helpers on the wire's simplified line
# ---------------------------------------------------------------------------

def endpoints(geometry):
    """First and last vertex of a wire line, [lon, lat] each, or None."""
    g = geometry or {}
    coords = g.get("coordinates") or []
    if not coords:
        return None
    if g.get("type") == "MultiLineString":
        parts = [p for p in coords if p]
        if not parts:
            return None
        return parts[0][0], parts[-1][-1]
    return coords[0], coords[-1]


def is_loop(row):
    """A stage that ends where it starts (within LOOP_KM), by its own line.
    The row's `is_loop` flag is not used: it is set on many A to B stages
    (all of the BergeSeen Trail), so only the geometry decides."""
    e = endpoints(row.get("geometry"))
    return bool(e) and km_between(*e) <= LOOP_KM


def km_between(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 6371.0 * 2 * math.asin(min(1.0, math.sqrt(h)))


def nearest_end_km(a, b):
    """The closest pair of endpoints between two stages, in km. Direction is
    not trusted: mappers draw stages either way round."""
    ea, eb = endpoints(a.get("geometry")), endpoints(b.get("geometry"))
    if not ea or not eb:
        return None
    return min(km_between(p, q) for p in ea for q in eb)


# ---------------------------------------------------------------------------
# The registry
# ---------------------------------------------------------------------------

class Registry:
    """Lookups into famous_registry.json by relation id and folded name."""

    def __init__(self, rows=()):
        self.by_rel, self.by_name = {}, {}
        for r in rows:
            osm = ((r.get("evidence") or {}).get("osm") or {}).get("relation_id")
            if osm:
                self.by_rel.setdefault(int(osm), r)
            for n in [r.get("name")] + list(r.get("aliases") or []):
                k = key_of(n)
                if k and len(k) > 3:
                    self.by_name.setdefault(k, r)

    @classmethod
    def load(cls, path=REGISTRY):
        try:
            doc = json.loads(Path(path).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return cls()
        return cls(doc.get("rows") or [])

    def find(self, osm=None, name=None):
        if osm is not None and int(osm) in self.by_rel:
            return self.by_rel[int(osm)]
        k = key_of(name)
        return self.by_name.get(k) if k else None


# ---------------------------------------------------------------------------
# Grouping
# ---------------------------------------------------------------------------

def _slug_id(name, cc, osm=None):
    if osm:
        return f"trek-r{int(osm)}"
    return f"trek-{cc.lower()}-{names.slugify(name)[:48]}"


def _days(row):
    """Days a stage takes: its own `f.d` when the export says it is a multi
    day walk, else one. A stage is a day by definition of the word."""
    d = ((row.get("f") or {}).get("d"))
    return int(d) if isinstance(d, (int, float)) and d >= 2 else 1


def _order(members):
    """The ways a group's stages can be put in order, best first.

    Returns (candidates, dropped, conflict): each candidate is (ordered,
    label, how) where label maps a row id to the stage number shown. One
    candidate sorts by superroute position (when every stage has a distinct
    one), one by the number in the names (when every stage has a distinct
    one); the caller keeps the first that passes the continuity check. A
    stage with neither is dropped (`no_order`). The number shown is the
    name's own when the names number every stage distinctly and agree with
    the order (so "Adlerweg Etappe 12" reads stage 12 even where the
    relation lists a prologue first), else the position in the order."""
    pos = {m["id"]: (m.get("h") or {}).get("i") for m in members}
    num = {}
    for m in members:
        p = parse_stage_name(m.get("name")) or parse_stage_name(m.get("src_name"))
        if p:
            num[m["id"]] = (p[1], p[2])
    dropped = [m for m in members if pos.get(m["id"]) is None and m["id"] not in num]
    rows = [m for m in members if m not in dropped]
    if not rows:
        return [], dropped, None
    sorts = []
    by_pos = [pos.get(m["id"]) for m in rows]
    by_num = [num.get(m["id"]) for m in rows]
    if all(p is not None for p in by_pos) and len(set(by_pos)) == len(by_pos):
        sorts.append(("position", sorted(rows, key=lambda m: pos[m["id"]])))
    if all(n is not None for n in by_num) and len(set(by_num)) == len(by_num):
        sorts.append(("name", sorted(rows, key=lambda m: num[m["id"]])))
    if not sorts:
        return [], dropped, "order_conflict"
    candidates = []
    for how, ordered in sorts:
        nums = [num.get(m["id"]) for m in ordered]
        names_number = (all(n is not None for n in nums)
                        and len({n[0] for n in nums}) == len(nums)
                        and nums == sorted(nums))
        label = {m["id"]: (nums[i][0] if names_number else i + 1)
                 for i, m in enumerate(ordered)}
        candidates.append((ordered, label, how))
    return candidates, dropped, None


def _continuity(ordered, label):
    """The worst jump between consecutive stages, scaled by how many stages
    are missing between them, the stage numbers missing, and how many
    neighbouring pairs share an end (within TOUCH_KM)."""
    worst, missing, touching = 0.0, [], 0
    for a, b in pairwise(ordered):
        gap = max(1, label[b["id"]] - label[a["id"]])
        missing.extend(range(label[a["id"]] + 1, label[b["id"]]))
        km = nearest_end_km(a, b)
        if km is not None:
            worst = max(worst, km / gap)
            if km <= TOUCH_KM:
                touching += 1
    return worst, missing, touching


def build(rows, parent_osm=None, registry=None, asof=None):
    """Group a run's wire rows into treks.

    rows        wire items from every country of the run (export_wire.wire_item
                shape): id, name, country, category, h, src_name, f,
                distance_m, ascent_m, descent_m, duration_min, geometry
    parent_osm  {row id: parent relation id} from the lab (`stage_of`, else
                the first `parent_refs`), optional
    registry    a Registry, optional

    Returns (treks, refs, report): treks is a list of trek records, refs maps
    a stage row id to its `trek` block, report counts every decision."""
    parent_osm = parent_osm or {}
    registry = registry or Registry()
    asof = asof or datetime.now(timezone.utc).date().isoformat()
    by_id = {r["id"]: r for r in rows}
    skips = Counter()
    groups = {}          # key -> {"of", "name", "osm", "row", "src", "members"}

    def group(key, **kw):
        g = groups.get(key)
        if g is None:
            g = groups[key] = {"members": [], "src": set(), **kw}
        return g

    named_keys = {}      # folded parent name -> group key
    loose = []
    for r in rows:
        h = r.get("h") or {}
        cls = h.get("cls")
        if cls == "variant":
            if h.get("of") is not None:
                skips["variant"] += 1
            continue
        if cls not in ("stage", "standalone", None):
            continue       # a parent is the trek's own row, not a stage
        if cls == "stage" and h.get("of") is not None:
            if r.get("category") != "hike":
                skips["not_a_walk"] += 1
                continue
            of = h["of"]
            if isinstance(of, int) or (isinstance(of, str) and of.isdigit()
                                       and int(of) in by_id):
                parent = by_id.get(int(of))
                pname = parent["name"] if parent else str(of)
                key = ("row", int(of))
                g = group(key, name=pname, row=int(of),
                          osm=(parent or {}).get("osm"), cc=None)
            else:
                pname = str(of)
                key = ("of", pname)
                g = group(key, name=pname, row=None,
                          osm=parent_osm.get(r["id"]), cc=None)
            g["members"].append(r)
            g["src"].add("superroute")
            named_keys.setdefault(key_of(g["name"]), key)
        elif cls in ("stage", "standalone", None):
            loose.append(r)

    # Stage names, for rows no superroute placed.
    for r in loose:
        if r.get("category") != "hike":
            continue
        p = parse_stage_name(r.get("name")) or parse_stage_name(r.get("src_name"))
        if not p or not key_of(p[0]):
            continue
        k = key_of(p[0])
        key = named_keys.get(k)
        if key is None:
            key = ("name", r.get("country"), k)
            g = group(key, name=p[0], row=None, osm=None, cc=r.get("country"))
        else:
            g = groups[key]
        g["members"].append(r)
        g["src"].add("name")

    treks, refs, refused = [], {}, Counter()
    kept_keys = []       # the group key behind each trek, same order
    refused_groups = []
    for key, g in groups.items():
        members = g["members"]
        if len(members) > MAX_STAGES:
            refused["too_many"] += 1
            refused_groups.append({"name": g["name"], "reason": "too_many",
                                   "n": len(members)})
            continue
        candidates, dropped, conflict = _order(members)
        skips["no_order"] += len(dropped)

        def refuse(reason, g=g, key=key, members=members, **extra):
            refused[reason] += 1
            refused_groups.append({"name": g["name"], "reason": reason,
                                   "n": len(members), "by": key[0], **extra})

        if conflict:
            refuse(conflict)
            continue
        if len(candidates[0][0]) < MIN_STAGES:
            refuse("single_stage")
            continue
        name_only = "superroute" not in g["src"]
        ordered = candidates[0][0]
        if sum(1 for m in ordered if is_loop(m)) * 2 >= len(ordered):
            # Numbered loops round one village ("Rundwanderweg Birkenau 8",
            # "Wanderwegenetz Pommelsbrunn") are a local network, not one
            # walk in stages, whether names or a superroute tie them.
            refuse("loop_network")
            continue
        best = None
        for ordered, label, how in candidates:
            worst, missing, touching = _continuity(ordered, label)
            if worst > MAX_JUMP_KM:
                continue
            if name_only and touching * 2 < len(ordered) - 1:
                # No relation ties these together, so the line must: most
                # neighbouring stages share an end.
                continue
            best = (ordered, label, missing, how)
            break
        if best is None:
            refuse("not_one_path", km=round(_continuity(*candidates[0][:2])[0], 1))
            continue
        ordered, label, missing, order_how = best
        reg = registry.find(g.get("osm"), g["name"])
        name = g["name"]
        src = sorted(g["src"])
        if reg:
            src.append("registry")
            name = reg.get("name") or name
        cc = ordered[0].get("country") or g.get("cc")
        tid = _slug_id(name, cc or "xx", g.get("osm"))
        stages = [{
            "id": m["id"], "i": label[m["id"]], "name": m.get("name"),
            "cc": m.get("country"),
            "km": (round(m["distance_m"] / 1000.0, 1)
                   if m.get("distance_m") is not None else None),
            "up": m.get("ascent_m"),
            "min": m.get("duration_min"),
        } for m in ordered]
        km = sum(s["km"] or 0 for s in stages)
        trek = {
            "id": tid,
            "name": names.wire_name(name, cc),
            "cc": cc,
            "countries": sorted({s["cc"] for s in stages if s["cc"]}),
            "how": src,
            "order": order_how,
            "n": len(stages),
            "km": round(km, 1),
            "up": sum(m.get("ascent_m") or 0 for m in ordered),
            "down": sum(m.get("descent_m") or 0 for m in ordered),
            "min": sum(m.get("duration_min") or 0 for m in ordered),
            "days": sum(_days(m) for m in ordered),
            "stages": stages,
            "_src": SRC,
            "_asof": asof,
        }
        if g.get("row") is not None:
            trek["row"] = g["row"]
        if g.get("osm"):
            trek["osm"] = int(g["osm"])
        if missing:
            trek["missing"] = missing[:40]
        if reg and (reg.get("evidence") or {}).get("wikidata"):
            trek["wd"] = reg["evidence"]["wikidata"]
        treks.append(trek)
        kept_keys.append(key)
        for s in stages:
            refs[s["id"]] = {"id": tid, "cc": cc, "i": s["i"], "n": len(stages)}

    # Two groups can fold onto one id (the same name in one country from a
    # name group and an unrelated superroute); the later one is renamed so
    # ids stay unique and nothing is silently merged.
    seen = Counter()
    for t in treks:
        seen[t["id"]] += 1
        if seen[t["id"]] > 1:
            new = f"{t['id']}-{seen[t['id']]}"
            for s in t["stages"]:
                refs[s["id"]]["id"] = new
            t["id"] = new

    treks.sort(key=lambda t: (t["cc"] or "", -t["n"], t["id"]))
    stage_rows = [r for r in rows if (r.get("h") or {}).get("cls") == "stage"]
    report = {
        "rows": len(rows),
        "stage_rows": len(stage_rows),
        "stage_groups_superroute": sum(1 for k in groups if k[0] in ("row", "of")),
        "stage_groups_superroute_with_parent_row":
            sum(1 for k in groups if k[0] == "row"),
        "stage_rows_without_parent":
            sum(1 for r in stage_rows if (r.get("h") or {}).get("of") is None),
        "groups": len(groups),
        "groups_by_name_only": sum(1 for k in groups if k[0] == "name"),
        "treks": len(treks),
        "treks_without_parent_row": sum(1 for t in treks if "row" not in t),
        "treks_cross_border": sum(1 for t in treks if len(t["countries"]) > 1),
        "treks_with_registry": sum(1 for t in treks if "registry" in t["how"]),
        "stages_in_treks": len(refs),
        "stage_rows_in_treks":
            sum(1 for r in stage_rows if r["id"] in refs),
        "refused": {k: refused.get(k, 0) for k in REFUSALS},
        "refused_superroute": {k: sum(1 for g in refused_groups
                                      if g["reason"] == k and g["by"] != "name")
                               for k in REFUSALS},
        "superroute_groups_with_parent_record": len(
            {k for k in groups if k[0] == "row"}
            | {k for k in kept_keys if k[0] in ("row", "of")}),
        "rows_left_out": {k: skips.get(k, 0) for k in ROW_SKIPS},
        "largest": [{"id": t["id"], "name": t["name"], "n": t["n"],
                     "km": t["km"], "days": t["days"]}
                    for t in sorted(treks, key=lambda t: -t["n"])[:15]],
        "refused_sample": sorted(refused_groups,
                                 key=lambda g: -g["n"])[:30],
    }
    return treks, refs, report


def apply(files, treks, refs):
    """Stamp a run's country files: `trek` on each stage row, `treks[]` on
    the file of the country that holds each trek. `files` maps a country to
    its parsed file and is changed in place."""
    by_cc = defaultdict(list)
    for t in treks:
        by_cc[t["cc"]].append(t)
    for cc, doc in files.items():
        for key in ("trips", "listed"):
            for r in doc.get(key) or []:
                ref = refs.get(r["id"])
                if ref:
                    r["trek"] = ref
                else:
                    r.pop("trek", None)
        if by_cc.get(cc):
            doc["treks"] = by_cc[cc]
        else:
            doc.pop("treks", None)
    return files


def read_wire(wire_dir):
    files = {}
    for p in sorted(Path(wire_dir).glob("[A-Z][A-Z].json")):
        files[p.stem] = json.loads(p.read_text(encoding="utf-8"))
    return files


def main(argv=None):
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=(
        "Group published stages into treks. Without --apply it reads a "
        "trails wire and reports what the export would build."))
    ap.add_argument("--wire", default=str(WIRE_DIR))
    ap.add_argument("--report", default=str(REPORT))
    ap.add_argument("--apply", action="store_true",
                    help="write treks[] and trek{} into the wire in place")
    args = ap.parse_args(argv)
    files = read_wire(args.wire)
    rows = [r for doc in files.values()
            for k in ("trips", "listed") for r in doc.get(k) or []]
    treks, refs, report = build(rows, registry=Registry.load())
    report["wire"] = str(args.wire)
    Path(args.report).parent.mkdir(parents=True, exist_ok=True)
    Path(args.report).write_text(json.dumps(report, indent=1, ensure_ascii=False),
                                 encoding="utf-8")
    for k, v in report.items():
        if k not in ("largest", "refused_sample"):
            print(f"  {k}: {v}")
    if args.apply:
        apply(files, treks, refs)
        for cc, doc in files.items():
            (Path(args.wire) / f"{cc}.json").write_text(
                json.dumps(doc, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8")
        print(f"  wrote treks into {len(files)} country file(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
