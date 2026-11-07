"""catalogue_gaps.py - D15 part 1: work D6's place gaps into a review list.

Tier: Manual (ROADMAP D15, T1146). Report only: it never writes the master,
the wire or anything the app reads. S63 applies the list after the owner has
reviewed it, through the existing promote_place_candidates.py --approve path.

What it does, in four steps, all offline:

  1. Gaps. Reads the place gaps D6 ranked (docs/data/coverage-parity.csv,
     kind "country places" and "region places", item D15): a country or a
     NUTS 2 region and how many places it is short.

  2. Add. Scores every candidate in data/derived/place_candidates.json (built
     by build_place_candidates.py from GeoNames cities500, the Overture POI
     corpus and the designation registry) with score_place_candidates.py's
     own score_candidate and coverage radius, then passes it through
     promote_place_candidates.py's own gates in the same order (worth floor
     MIN_WORTH, no POI cluster, no slug clash, no district name, no district
     of a shipped city, MIN_SEPARATION_KM from another pick, an anchor
     airport within ANCHOR_MAX_KM). The same functions, imported, not
     copied: a change to the selection rules moves this list too.
     Each survivor is turned into the spec promote would write and checked
     against D2 (scripts/quality/rules.yaml, the per-place fields the spec
     carries, and the wire schema for each). Region gaps are filled first,
     best worth first, up to their shortfall; a country gap then takes what
     its regions did not already cover.

  3. Merge. Finds shipped places that are one place twice. Four layers, in
     the order the T1146 research recommends: a shared Wikidata QID or
     GeoNames id; a GeoNames alternate name (Rodos for Rhodes, Koln for
     Cologne) or the same folded name, within ALIAS_KM (ALIAS_KM_BIG when
     either side has 300,000 people or more); folded string similarity of
     SIMILAR_MIN or more within SIMILAR_KM, which goes to review rather than
     merge. Candidates are checked the same way against the catalogue, so a
     second spelling never comes back in as an add.

  4. Remove or fix. Every shipped place is checked against D2: each field
     whose rule floor is PER_PLACE_FLOOR or more (the catalogue expects
     nearly every place to carry it) must be present and valid against the
     wire schema. An identity field missing or invalid (city, country, iso2,
     lat, lon, tier) or coordinates outside Europe means remove; any other
     missing field means fix, naming the layer that fills it.

Outputs:
  data/catalogue/d15/review.json         the whole list, machine readable;
                                         per country "approve" keys in the
                                         shape promote --approve reads
  docs/data/catalogue-gaps/README.md     counts per gap and per country
  docs/data/catalogue-gaps/<CC>.md       one review sheet per country

Usage:
    python pipeline/build_place_candidates.py          # if the file is absent
    python -I pipeline/catalogue_gaps.py
    python -I pipeline/catalogue_gaps.py --master continent-app/public/app_data.json
"""
from __future__ import annotations

import argparse
import csv
import difflib
import importlib.util
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PIPE = ROOT / "pipeline"
if str(PIPE) not in sys.path:
    sys.path.insert(0, str(PIPE))

import promote_place_candidates as promote
import score_place_candidates as scorer
from pipeline_io import atomic_write_json, load_json

MASTER = ROOT / "app_data" / "app_data.json"
WIRE = ROOT / "continent-app" / "public" / "app_data.json"
PARITY = ROOT / "docs" / "data" / "coverage-parity.csv"
CANDIDATES = ROOT / "data" / "derived" / "place_candidates.json"
SIGNALS = ROOT / "cache" / "place_signals.json"
GEONAMES = ROOT / "cache" / "geonames_cities500.txt"
RULES = ROOT / "scripts" / "quality" / "rules.yaml"
SCHEMA = ROOT / "docs" / "wire.schema.json"
OUT_JSON = ROOT / "data" / "catalogue" / "d15" / "review.json"
OUT_DOCS = ROOT / "docs" / "data" / "catalogue-gaps"

# Duplicate thresholds (T1146 research: Mapbox's 10 km settlement match,
# Pelias concordance ids, reclin2 and the Lancaster toponym study for the
# similarity cut, which is tuned on the fixture in tests/).
ALIAS_KM = 10.0
ALIAS_KM_BIG = 25.0
BIG_POP = 300_000
SIMILAR_KM = 5.0
SIMILAR_MIN = 0.90
RESOLVE_KM = 10.0       # how far a shipped place may sit from its GeoNames row
PAIR_GRID_DEG = 0.5     # grid for the pairwise search, wider than ALIAS_KM_BIG

# D2: a field whose rule floor is this or more is one nearly every place
# carries, so a single place without it fails. Lower floors (designations,
# nature, guide, bathing water) are partial by design.
PER_PLACE_FLOOR = 0.90

# The stretch list: score_place_candidates.py's own review-queue floor
# (--min-worth default), under promote's MIN_WORTH. Listed apart, never on
# the approve list: adding below MIN_WORTH changes the selection rule.
STRETCH_FLOOR = 0.30
TIER_SHARE = 0.50       # a tier "carries" a field when half its rows have it
IDENTITY_FIELDS = ("tier", "city", "country", "iso2", "lat", "lon")
EUROPE_LAT, EUROPE_LON = (27.0, 81.0), (-32.0, 45.0)

# Spec fields a new place carries before the enrichment chain runs; the D2
# check on a candidate reads these (the rest arrive through the pipeline).
SPEC_FIELDS = ("tier", "city", "country", "iso2", "lat", "lon", "categories",
               "blurb", "anchor_airport")

FOLD_MAP = str.maketrans({"ß": "ss", "ø": "o", "Ø": "o", "æ": "ae", "Æ": "ae",
                          "ł": "l", "Ł": "l", "đ": "d", "Đ": "d", "þ": "th",
                          "ð": "d", "ı": "i", "œ": "oe"})

COVERAGE = ROOT / "scripts" / "coverage" / "coverage_parity.py"


def _load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


# ---------------------------------------------------------------- names

def fold(name):
    """Name key for matching: no accents, no case, no punctuation."""
    s = re.sub(r"\(.*?\)", " ", name or "").translate(FOLD_MAP)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).casefold()
    return re.sub(r"[^a-z0-9]+", "", s)


def similarity(a, b):
    return difflib.SequenceMatcher(None, fold(a), fold(b)).ratio()


def haversine(lat1, lon1, lat2, lon2):
    return promote.haversine(lat1, lon1, lat2, lon2)


def point(d):
    lat = d.get("city_lat") if d.get("city_lat") is not None else d.get("lat")
    lon = d.get("city_lon") if d.get("city_lon") is not None else d.get("lon")
    return lat, lon


# ---------------------------------------------------------------- inputs

def load_gaps(path=PARITY):
    """D6 place gaps worked by D15, in rank order."""
    out = []
    with open(path, encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            if r["item"] != "D15" or r["kind"] not in ("country places", "region places"):
                continue
            kind = "country" if r["kind"] == "country places" else "region"
            code = r["cc"] if kind == "country" else r["scope"].split(" ", 1)[0]
            out.append({
                "id": r["id"], "rank": int(r["rank"]), "kind": kind, "cc": r["cc"],
                "code": code, "scope": r["scope"], "actual": int(r["actual"]),
                "expected": float(r["expected"]), "short": int(r["places"]),
            })
    out.sort(key=lambda g: g["rank"])
    return out


def read_geonames(path, countries):
    """GeoNames rows (all alternate names) for the catalogue's countries."""
    rows = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            p = line.rstrip("\n").split("\t")
            if len(p) < 15 or p[8] not in countries:
                continue
            try:
                lat, lon, pop = float(p[4]), float(p[5]), int(p[14] or 0)
            except ValueError:
                continue
            names = {p[1], p[2]}
            names.update(a for a in (p[3] or "").split(",")
                         if len(a) >= 3 and not a.isdigit() and not a.isupper())
            rows.append({"gid": int(p[0]), "name": p[1], "iso2": p[8], "lat": lat,
                         "lon": lon, "pop": pop,
                         "keys": {k for k in (fold(n) for n in names) if len(k) >= 3}})
    return rows


class Gazetteer:
    """Folded name -> GeoNames rows, for aliases and identity."""

    def __init__(self, rows):
        self.rows = rows
        self.by_key = defaultdict(list)
        self.by_gid = {}
        for r in rows:
            self.by_gid[r["gid"]] = r
            for k in r["keys"]:
                self.by_key[k].append(r)

    def resolve(self, name, iso2, lat, lon, km=RESOLVE_KM):
        """The GeoNames row this named point is: same name, same country, near."""
        best = None
        for r in self.by_key.get(fold(name), ()):
            if r["iso2"] != iso2:
                continue
            d = haversine(lat, lon, r["lat"], r["lon"])
            if d <= km and (best is None or (r["pop"], -d) > (best[0]["pop"], -best[1])):
                best = (r, d)
        return best[0] if best else None


def load_rules(path=RULES):
    import yaml
    with open(path, encoding="utf-8") as fh:
        doc = yaml.safe_load(fh)
    return doc["rules"]


def per_place_fields(rules, floor=PER_PLACE_FLOOR):
    """Fields of the app_data layers that every place must carry, with their layer."""
    out = {}
    for r in rules:
        if r["id"].split(".", 1)[0] in ("trails", "beaches", "lakes", "mountains", "cycling"):
            continue
        if float(r["min"]) >= floor:
            out[r["field"]] = r["layer"]
    return out


def field_validators(schema_path=SCHEMA):
    """One validator per destination field, from the wire schema (or none)."""
    try:
        wc = _load_module("wire_contract", PIPE / "wire_contract.py")
        schema = wc.load_schema(schema_path)
    except Exception:  # noqa: BLE001 - a missing schema only skips validity
        return {}
    props = schema["$defs"]["destination"]["properties"]
    subs = {f: {**props[f], "$defs": schema["$defs"]} for f in props}
    return {f: (lambda v, s=s: not wc.validate(v, s)) for f, s in subs.items()}


def present(v):
    return v is not None and v != "" and v != [] and v != {}


def in_europe(lat, lon):
    return (isinstance(lat, (int, float)) and isinstance(lon, (int, float))
            and EUROPE_LAT[0] <= lat <= EUROPE_LAT[1]
            and EUROPE_LON[0] <= lon <= EUROPE_LON[1])


# ---------------------------------------------------------------- D2

def d2_problems(rec, required, valid):
    """(missing, invalid) field lists for one record under the D2 rules."""
    missing, invalid = [], []
    for f in required:
        v = rec.get(f)
        if not present(v):
            missing.append(f)
        elif f in valid and not valid[f](v):
            invalid.append(f)
    if "lat" in required and present(rec.get("lat")) and not in_europe(rec.get("lat"), rec.get("lon")):
        invalid.append("lat/lon outside Europe")
    return missing, invalid


def tier_required(places, required, share=TIER_SHARE):
    """Per tier, the required fields that tier carries on at least ``share``.

    The rules are set over every record; a field one tier lacks by design
    (an airport row has no blurb: its town is told elsewhere) is not a
    defect of each airport.
    """
    n = Counter(d.get("tier") for d in places.values())
    have = Counter((d.get("tier"), f) for d in places.values() for f in required if present(d.get(f)))
    return {t: {f: lay for f, lay in required.items() if have[(t, f)] >= share * cnt}
            for t, cnt in n.items()}


def prune_d2(dests, rules, valid):
    """Shipped places failing D2 on a per-place field: remove or fix."""
    required = per_place_fields(rules)
    places = {k: d for k, d in dests.items() if isinstance(d, dict) and not d.get("gateway_of")}
    by_tier = tier_required(places, required)
    out = []
    for did, d in sorted(places.items()):
        missing, invalid = d2_problems(d, by_tier.get(d.get("tier"), required), valid)
        if present(d.get("city")) and not re.search(r"[A-Za-z]", fold(d.get("city"))):
            invalid.append("city (no Latin form, so its name key and slug are empty)")
        if not missing and not invalid:
            continue
        identity = [f for f in missing + invalid
                    if f in IDENTITY_FIELDS or f.startswith("lat/lon")]
        action = "remove" if identity else "fix"
        layers = sorted({required.get(f, "core") for f in missing + invalid if f in required})
        reason = []
        if missing:
            reason.append("missing " + ", ".join(missing))
        if invalid:
            reason.append("invalid " + ", ".join(invalid))
        out.append({
            "id": did, "name": d.get("city"), "iso2": d.get("iso2"), "action": action,
            "missing": missing, "invalid": invalid, "layers": layers,
            "reason": "; ".join(reason) + (
                " (identity field, so the record cannot stand)" if identity
                else f" (refill through the {', '.join(layers)} layer)"),
            "source": "D2 rules (scripts/quality/rules.yaml, floor "
                      f"{PER_PLACE_FLOOR:.2f} or more) and docs/wire.schema.json",
        })
    return out


# ---------------------------------------------------------------- merge

def shipped_points(dests):
    out = []
    for did, d in dests.items():
        if not isinstance(d, dict) or d.get("gateway_of"):
            continue
        lat, lon = point(d)
        if lat is None or lon is None:
            continue
        out.append((did, d, float(lat), float(lon)))
    return out


def identities(pts, gaz):
    """Per shipped place: its QID, its GeoNames row and its alias keys."""
    ident = {}
    for did, d, lat, lon in pts:
        qid = (d.get("wikidata") or {}).get("qid")
        row = gaz.resolve(d.get("city"), d.get("iso2"), lat, lon) if gaz else None
        keys = {fold(d.get("city"))}
        if row:
            keys |= row["keys"]
        ident[did] = {"qid": qid, "gid": row["gid"] if row else None,
                      "pop": max(row["pop"] if row else 0,
                                 (d.get("geonames") or {}).get("population") or 0),
                      "keys": keys}
    return ident


def _keep_first(a, b):
    """Which of two duplicate records survives: airport, then rating, then fields."""
    def rank(d):
        return (d.get("tier") == "airport",
                ((d.get("rating") or {}).get("score") or 0),
                sum(1 for v in d.values() if present(v)))
    return (a, b) if rank(a[1]) >= rank(b[1]) else (b, a)


def find_duplicates(dests, gaz):
    """Pairs of shipped places that are one place: merge (sure) or review."""
    pts = shipped_points(dests)
    ident = identities(pts, gaz)
    grid = defaultdict(list)
    for i, (_, _, lat, lon) in enumerate(pts):
        grid[(int(lat // PAIR_GRID_DEG), int(lon // PAIR_GRID_DEG))].append(i)
    out = []
    for i, (aid, a, alat, alon) in enumerate(pts):
        gy, gx = int(alat // PAIR_GRID_DEG), int(alon // PAIR_GRID_DEG)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for j in grid.get((gy + dy, gx + dx), ()):
                    if j <= i:
                        continue
                    bid, b, blat, blon = pts[j]
                    if a.get("iso2") != b.get("iso2"):
                        continue
                    km = haversine(alat, alon, blat, blon)
                    if km > ALIAS_KM_BIG:
                        continue
                    hit = match_pair(a, ident[aid], b, ident[bid], km)
                    if not hit:
                        continue
                    kind, why = hit
                    (kid, k), (gid_, g) = _keep_first((aid, a), (bid, b))
                    out.append({
                        "keep": kid, "keep_name": k.get("city"),
                        "drop": gid_, "drop_name": g.get("city"),
                        "iso2": a.get("iso2"), "km": round(km, 2),
                        "action": kind, "reason": why,
                        "source": "GeoNames cities500 (CC BY 4.0) and the shipped catalogue"
                                  if "GeoNames" in why else "the shipped catalogue",
                    })
    out.sort(key=lambda r: (r["iso2"] or "", r["action"], r["keep"], r["drop"]))
    return out


def match_pair(a, ia, b, ib, km):
    """("merge" | "review", reason) when two named points are one place."""
    sure = match_sure(a, ia, b, ib, km)
    if sure and ("(" in (a.get("city") or "") or "(" in (b.get("city") or "")):
        # "Chios (Mastic Villages)" is a deliberate part of Chios, not a
        # second spelling: the owner decides.
        return "review", sure[1] + "; one name carries a qualifier in brackets"
    if sure:
        return sure
    if km <= SIMILAR_KM and similarity(a.get("city"), b.get("city")) >= SIMILAR_MIN:
        return "review", (f"names {similarity(a.get('city'), b.get('city')):.2f} "
                          f"alike, {km:.1f} km apart")
    return None


def match_sure(a, ia, b, ib, km):
    """("merge", reason) on a shared id, the same folded name or an alias."""
    if ia["qid"] and ia["qid"] == ib["qid"]:
        return "merge", f"same Wikidata item {ia['qid']}"
    if ia["gid"] and ia["gid"] == ib["gid"]:
        return "merge", f"same GeoNames place {ia['gid']}"
    big = max(ia["pop"], ib["pop"]) >= BIG_POP
    limit = ALIAS_KM_BIG if big else ALIAS_KM
    fa, fb = fold(a.get("city")), fold(b.get("city"))
    if km <= limit and fa and fa == fb:
        return "merge", f"same name after folding, {km:.1f} km apart"
    if km <= limit and (fa in ib["keys"] or fb in ia["keys"]):
        return "merge", (f"'{a.get('city')}' and '{b.get('city')}' are GeoNames "
                         f"alternate names of one place, {km:.1f} km apart")
    return None


# ---------------------------------------------------------------- add

def score_rows(cands, signals, dests):
    """Every candidate scored and tested for coverage, as score_place_candidates does."""
    dest_pop = {did: ((d.get("geonames") or {}).get("population")) or 0
                for did, d in dests.items()}
    rows = []
    for c in cands:
        sig = signals.get(c["key"])
        worth, parts, inten = scorer.score_candidate(dict(c), sig)
        near_km = c.get("near_km")
        cover = scorer.cover_radius_km(dest_pop.get(c.get("near_id"), 0))
        rows.append({
            **{k: c.get(k) for k in ("key", "name", "iso2", "admin1", "lat", "lon",
                                     "pop", "track", "own", "n_own", "parent_city",
                                     "near_id", "near_city", "near_km", "alt",
                                     "geonameid")},
            "worth": worth, "parts": parts, "intensity": inten,
            "top_cats": [t["cat"] for t in (c.get("top_cats") or [])[:3]],
            "designations": c.get("designations") or [],
            "qid": c.get("qid") or (sig or {}).get("qid"),
            "sitelinks": (sig or {}).get("sitelinks"), "views": (sig or {}).get("views"),
            "cover_km": round(cover, 2),
            "covered": near_km is not None and near_km <= cover,
        })
    rows.sort(key=lambda r: (-r["worth"], r["key"]))
    return rows


class Gate:
    """promote_place_candidates' gates, in its order, with the D15 extras."""

    def __init__(self, dests, ident, gaz, valid, rules):
        self.dests = dests
        self.anchors = promote.anchors_from(dests)
        self.existing_slugs = {did.split(":", 1)[1] for did in dests if did.startswith("gem:")}
        self.shipped_cities = {promote.norm_city(d.get("city")) for d in dests.values()}
        self.ident = ident
        self.gaz = gaz
        self.valid = valid
        self.required = [f for f in per_place_fields(rules) if f in SPEC_FIELDS]
        self.vocab = None
        self.iso_country = {}
        for d in dests.values():
            if d.get("iso2") and d.get("country"):
                self.iso_country.setdefault(d["iso2"], d["country"])
        self.gids = {v["gid"]: did for did, v in ident.items() if v["gid"]}
        self.qids = {v["qid"]: did for did, v in ident.items() if v["qid"]}
        pts = shipped_points(dests)
        self.grid = defaultdict(list)
        for did, d, lat, lon in pts:
            self.grid[(int(lat // PAIR_GRID_DEG), int(lon // PAIR_GRID_DEG))].append((did, d, lat, lon))
        self.seen = set()
        self.accepted = []
        self.taken = set()

    def near_shipped(self, lat, lon):
        gy, gx = int(lat // PAIR_GRID_DEG), int(lon // PAIR_GRID_DEG)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                yield from self.grid.get((gy + dy, gx + dx), ())

    def duplicate_of(self, r):
        """A shipped place this candidate already is, under another spelling."""
        if r.get("geonameid") in self.gids:
            return self.gids[r["geonameid"]], "same GeoNames place"
        if r.get("qid") and r["qid"] in self.qids:
            return self.qids[r["qid"]], "same Wikidata item"
        row = self.gaz.by_gid.get(r.get("geonameid")) if self.gaz else None
        keys = (row["keys"] if row else {fold(n) for n in (r.get("alt") or [])}) | {fold(r["name"])}
        for did, d, lat, lon in self.near_shipped(r["lat"], r["lon"]):
            if d.get("iso2") != r["iso2"]:
                continue
            km = haversine(r["lat"], r["lon"], lat, lon)
            big = max(self.ident[did]["pop"], r.get("pop") or 0) >= BIG_POP
            if km <= (ALIAS_KM_BIG if big else ALIAS_KM) and (
                    fold(d.get("city")) in keys or fold(r["name"]) in self.ident[did]["keys"]):
                return did, f"alternate name of {d.get('city')}, {km:.1f} km"
        return None

    def check(self, r, floor=None):
        """(spec, None) when the candidate passes, else (None, reason)."""
        floor = promote.MIN_WORTH if floor is None else floor
        if r["covered"]:
            return None, f"covered by {r['near_city']} ({r['near_km']} km, radius {r['cover_km']} km)"
        if r["worth"] < floor:
            return None, f"worth {r['worth']:.3f} under the floor {floor}"
        if r["track"] == "cluster":
            return None, "cluster track has no place name"
        slug = promote.slugify(r["name"])
        if slug in self.existing_slugs or slug in self.seen:
            return None, f"slug '{slug}' already exists"
        if promote.norm_city(r["name"]) in promote.DISTRICT_NAME_WORDS or any(
                w in promote.DISTRICT_NAME_WORDS
                for w in re.findall(r"[a-z]+", (r["name"] or "").lower())):
            return None, "names a district, not a place"
        # promote's own test reads norm_city(None) == "" as shipped whenever a
        # shipped city folds to "" (a name in Cyrillic or Greek), which drops
        # every candidate without a parent. Only a real parent is tested
        # (register row T1146-b).
        parent = promote.norm_city(r.get("parent_city"))
        if promote.SKIP_PARENT_ALREADY_SHIPPED and parent and parent in self.shipped_cities:
            return None, f"is a district of {r['parent_city']}, already shipped"
        dup = self.duplicate_of(r)
        if dup:
            return None, f"duplicate of shipped {dup[0]} ({dup[1]})"
        near = next((p for p in self.accepted
                     if haversine(r["lat"], r["lon"], p[0], p[1]) < promote.MIN_SEPARATION_KM), None)
        if near:
            return None, f"within {promote.MIN_SEPARATION_KM:.0f} km of {near[2]}"
        best = promote.pick_anchor(r["lat"], r["lon"], r["iso2"], self.anchors)
        if not best:
            return None, f"no anchor within {promote.ANCHOR_MAX_KM:.0f} km"
        _cost, anchor_id, km, reachable = best
        size = promote.size_class_for(r["pop"])
        spec = {
            "tier": "gem", "slug": slug, "city": r["name"],
            "country": self.iso_country.get(r["iso2"]) or r["iso2"], "iso2": r["iso2"],
            "lat": r["lat"], "lon": r["lon"],
            "categories": promote.categories_for(r, size),
            "blurb": promote.blurb_for(r), "anchor_airport": anchor_id,
            "anchor_km": round(km, 1), "anchor_reachable": bool(reachable),
        }
        missing, invalid = d2_problems(spec, self.required, self.valid)
        if missing or invalid:
            return None, "fails D2 on " + ", ".join(missing + invalid)
        return spec, None

    def accept(self, r, spec):
        self.seen.add(spec["slug"])
        self.accepted.append((r["lat"], r["lon"], r["name"]))


REASON_CODES = (
    ("covered by", "covered"), ("worth", "under the worth floor"),
    ("cluster", "no place name"), ("slug", "name already shipped"),
    ("names a district", "district name"), ("is a district", "district of a shipped city"),
    ("duplicate of", "second spelling of a shipped place"),
    ("within", "too close to another add"), ("no anchor", "no anchor airport"),
    ("fails D2", "fails D2"),
)


def reason_code(reason):
    return next((code for pre, code in REASON_CODES if reason.startswith(pre)), reason)


def nuts2_of(nuts, cc, lat, lon, cp):
    nid, _how = cp.find_nuts3(nuts, cc, lon, lat)
    return nid[:4] if nid else None


def add_reason(r):
    why = []
    kinds = sorted({d.get("kind") for d in r["designations"] if d.get("kind")})
    if kinds:
        why.append("registers: " + ", ".join(kinds))
    if r["intensity"] >= 3:
        why.append(f"{r['intensity']:.0f}x the sights of a place its size")
    if r["top_cats"]:
        why.append("sights: " + ", ".join(c.replace("_", " ") for c in r["top_cats"][:2]))
    if r.get("views"):
        why.append(f"{r['views']} Wikipedia views a day")
    why.append(f"nearest shipped {r['near_city']} {r['near_km']:.0f} km")
    return "; ".join(why)


def add_source(r):
    src = []
    if r["key"].startswith("gn:"):
        src.append(f"GeoNames {r['key'][3:]} (cities500, CC BY 4.0)")
    src.append(f"Overture Places, {r.get('n_own') or 0} sights won (CDLA-Permissive 2.0)")
    if r.get("qid"):
        src.append(f"Wikidata {r['qid']} (CC0)")
    if r["designations"]:
        src.append("data/derived/place_registry.json")
    return "; ".join(src)


def fill_gaps(gaps, rows, gate, nuts, cp, floor=None, needs=None, reserve=5):
    """Region gaps first, then country gaps net of their regions' adds.

    ``floor`` defaults to promote's MIN_WORTH (today's rule). ``needs`` maps a
    gap id to the places still wanted, for the stretch pass that runs after
    the main one on what it left.
    """
    floor = promote.MIN_WORTH if floor is None else floor
    by_cc = defaultdict(list)
    for r in rows:
        by_cc[r["iso2"]].append(r)
    region_cache = {}

    def region(r):
        if r["key"] not in region_cache:
            region_cache[r["key"]] = nuts2_of(nuts, r["iso2"], r["lat"], r["lon"], cp) if nuts else None
        return region_cache[r["key"]]

    taken = gate.taken
    boxes = {}
    for nid, n in (nuts or {}).items():
        if not isinstance(n, dict) or "bbox" not in n:
            continue
        b = boxes.get(nid[:4])
        x0, y0, x1, y1 = n["bbox"]
        boxes[nid[:4]] = (x0, y0, x1, y1) if not b else (
            min(b[0], x0), min(b[1], y0), max(b[2], x1), max(b[3], y1))
    added_in = Counter()
    results = []
    order = [g for g in gaps if g["kind"] == "region"] + [g for g in gaps if g["kind"] == "country"]
    for g in order:
        if needs is not None:
            need = needs.get(g["id"], 0)
        else:
            need = g["short"] if g["kind"] == "region" else max(0, g["short"] - added_in[g["cc"]])
        picks, spare, why_not = [], [], Counter()
        eligible = 0
        for r in by_cc.get(g["cc"], ()) if need else ():
            if r["key"] in taken:
                continue
            # Cheap tests first: most rows fall to coverage or the worth floor.
            # A region gap only counts the rows that lie in the region, and
            # the region is looked up only for rows that pass the cheap tests.
            cheap = "covered" if r["covered"] else (
                "under the worth floor" if r["worth"] < floor else None)
            if g["kind"] == "region":
                box = boxes.get(g["code"])
                if box and not (box[0] <= r["lon"] <= box[2] and box[1] <= r["lat"] <= box[3]):
                    continue
                if region(r) != g["code"]:
                    continue
            if cheap:
                why_not[cheap] += 1
                continue
            spec, reason = gate.check(r, floor)
            if not spec:
                why_not[reason_code(reason)] += 1
                continue
            eligible += 1
            if len(picks) < need:
                gate.accept(r, spec)
                taken.add(r["key"])
                picks.append(entry(r, spec, g, region(r)))
            elif len(spare) < reserve:
                spare.append(entry(r, spec, g, region(r)))
        added_in[g["cc"]] += len(picks)
        results.append({**g, "need": need, "added": len(picks), "eligible": eligible,
                        "left": need - len(picks), "adds": picks, "reserve": spare,
                        "rejected": dict(why_not.most_common())})
    results.sort(key=lambda x: x["rank"])
    return results


def entry(r, spec, g, nuts2):
    return {"key": r["key"], "name": r["name"], "iso2": r["iso2"], "nuts2": nuts2,
            "gap": g["id"], "worth": r["worth"], "pop": r["pop"],
            "lat": round(r["lat"], 5), "lon": round(r["lon"], 5),
            "qid": r.get("qid"), "anchor": spec["anchor_airport"],
            "anchor_km": spec["anchor_km"], "categories": spec["categories"],
            "reason": add_reason(r), "source": add_source(r)}


# ---------------------------------------------------------------- output

def build(master, cands, signals, gaps, rules, valid, gaz, nuts, cp):
    dests = master.get("destinations") or {}
    pts = shipped_points(dests)
    ident = identities(pts, gaz)
    rows = score_rows(cands, signals or {}, dests)
    gate = Gate(dests, ident, gaz, valid, rules)
    filled = fill_gaps(gaps, rows, gate, nuts, cp)
    # Stretch: what the scorer's own queue floor would add on top. Not on the
    # approve list: taking it is a rule change, the owner's call.
    stretch = fill_gaps(gaps, rows, gate, nuts, cp, floor=STRETCH_FLOOR,
                        needs={g["id"]: g["left"] for g in filled}, reserve=0)
    by_id = {g["id"]: g for g in stretch}
    for g in filled:
        s = by_id[g["id"]]
        g["stretch"] = s["adds"]
        g["stretch_left"] = s["left"]
    dups = find_duplicates(dests, gaz)
    prune = prune_d2(dests, rules, valid)

    countries = defaultdict(lambda: {"add": [], "stretch": [], "merge": [], "remove": [], "fix": []})
    for g in filled:
        countries[g["cc"]]["add"] += g["adds"]
        countries[g["cc"]]["stretch"] += g["stretch"]
    for d in dups:
        countries[d["iso2"]]["merge"].append(d)
    for p in prune:
        countries[p["iso2"]][p["action"]].append(p)
    for c in countries.values():
        c["approve"] = [a["key"] for a in c["add"]]
    return {
        "meta": {
            "task": "T1146", "roadmap": "D15",
            "catalogue": len(dests),
            "candidates": len(rows),
            "gaps": len(gaps),
            "rules": {
                "min_worth": promote.MIN_WORTH,
                "stretch_floor": STRETCH_FLOOR,
                "min_separation_km": promote.MIN_SEPARATION_KM,
                "anchor_max_km": promote.ANCHOR_MAX_KM,
                "alias_km": ALIAS_KM, "alias_km_big": ALIAS_KM_BIG,
                "similar_km": SIMILAR_KM, "similar_min": SIMILAR_MIN,
                "per_place_floor": PER_PLACE_FLOOR,
            },
            "gazetteer": bool(gaz),
            "regions": bool(nuts),
        },
        "gaps": [{k: v for k, v in g.items() if k not in ("adds", "reserve", "stretch")}
                 | {"adds": [a["key"] for a in g["adds"]],
                    "reserve": [a["key"] for a in g["reserve"]],
                    "stretch": [a["key"] for a in g["stretch"]]} for g in filled],
        "reserve": {a["key"]: a for g in filled for a in g["reserve"]},
        "countries": {cc: countries[cc] for cc in sorted(countries)},
    }


def md_escape(s):
    return str(s if s is not None else "").replace("|", "/")


def render(res):
    """README plus one sheet per country, as {filename: text}."""
    files = {}
    m = res["meta"]
    lines = ["# Catalogue gaps, part 1 (D15): the review list", "",
             "Generated by `pipeline/catalogue_gaps.py` (T1146). Nothing here is applied: "
             "the owner reviews each country's add list, then S63 applies it with "
             "`promote_place_candidates.py --approve`. Machine-readable copy: "
             "`data/catalogue/d15/review.json`.", "",
             f"Catalogue {m['catalogue']:,} places; {m['candidates']:,} candidates scored; "
             f"{m['gaps']} D6 place gaps.", "",
             "## Per gap", "",
             "| Gap | Scope | Short | Need | Added | Eligible | Left | Stretch | Left after stretch |",
             "|---|---|--:|--:|--:|--:|--:|--:|--:|"]
    for g in res["gaps"]:
        lines.append(f"| {g['id']} | {g['cc']} {md_escape(g['scope'])} | {g['short']} | "
                     f"{g['need']} | {g['added']} | {g['eligible']} | {g['left']} | "
                     f"{len(g['stretch'])} | {g['stretch_left']} |")
    tg = Counter()
    for g in res["gaps"]:
        tg["short"] += g["short"]
        tg["added"] += g["added"]
        tg["stretch"] += len(g["stretch"])
        tg["left"] += g["stretch_left"]
    lines.append(f"| All | | {tg['short']} | | {tg['added']} | | | {tg['stretch']} | {tg['left']} |")
    lines += ["", "Short is D6's shortfall; Need is what is left after the country's region "
              "gaps; Eligible counts candidates that pass every rule; Left is the shortfall "
              "the candidates could not fill under today's rules. Stretch is what the scorer's "
              f"own queue floor ({m['rules']['stretch_floor']}) would add on top: listed for the "
              "owner, never on the approve list, because it lowers the selection floor.", "",
              "## Per country", "",
              "| Country | Add | Stretch | Merge | Merge (review) | Remove | Fix |",
              "|---|--:|--:|--:|--:|--:|--:|"]
    for cc, c in res["countries"].items():
        merges = sum(1 for d in c["merge"] if d["action"] == "merge")
        lines.append(f"| [{cc}]({cc}.md) | {len(c['add'])} | {len(c['stretch'])} | {merges} | "
                     f"{len(c['merge']) - merges} | {len(c['remove'])} | {len(c['fix'])} |")
    tot = Counter()
    for c in res["countries"].values():
        tot["add"] += len(c["add"])
        tot["stretch"] += len(c["stretch"])
        tot["merge"] += sum(1 for d in c["merge"] if d["action"] == "merge")
        tot["review"] += sum(1 for d in c["merge"] if d["action"] == "review")
        tot["remove"] += len(c["remove"])
        tot["fix"] += len(c["fix"])
    lines.append(f"| All | {tot['add']} | {tot['stretch']} | {tot['merge']} | {tot['review']} | "
                 f"{tot['remove']} | {tot['fix']} |")
    r = m["rules"]
    lines += ["", "## Rules", "",
              f"- Add: the scorer and gates of `score_place_candidates.py` and "
              f"`promote_place_candidates.py` (worth {r['min_worth']} or more, not covered, "
              f"{r['min_separation_km']:.0f} km apart, anchor within {r['anchor_max_km']:.0f} km), "
              "then the D2 check on the spec's core fields.",
              f"- Merge: same QID or GeoNames id; same folded name or a GeoNames alternate "
              f"name within {r['alias_km']:.0f} km ({r['alias_km_big']:.0f} km for 300,000 "
              f"people or more). Review: names {r['similar_min']:.2f} alike within "
              f"{r['similar_km']:.0f} km.",
              f"- Remove or fix: D2 fields with a rule floor of {r['per_place_floor']:.2f} or "
              "more, present and valid against the wire schema; an identity field means remove.",
              "", "Sources: GeoNames cities500 (CC BY 4.0), Overture Places (CDLA-Permissive "
              "2.0), Wikidata (CC0), the designation registry, the shipped catalogue."]
    files["README.md"] = "\n".join(lines) + "\n"

    gaps_by_cc = defaultdict(list)
    for g in res["gaps"]:
        gaps_by_cc[g["cc"]].append(g)
    adds_by_key = {}
    for c in res["countries"].values():
        for a in c["add"]:
            adds_by_key[a["key"]] = a
    for cc, c in res["countries"].items():
        out = [f"# {cc}: catalogue gaps review (D15)", ""]
        if gaps_by_cc.get(cc):
            out += ["## Gaps", "", "| Gap | Scope | Need | Added | Left | Main reasons candidates fell out |",
                    "|---|---|--:|--:|--:|---|"]
            for g in gaps_by_cc[cc]:
                rej = ", ".join(f"{k} {v}" for k, v in list(g["rejected"].items())[:3])
                out.append(f"| {g['id']} | {md_escape(g['scope'])} | {g['need']} | {g['added']} | "
                           f"{g['left']} | {md_escape(rej)} |")
            out.append("")
        out += [f"## Add ({len(c['add'])})", ""]
        if c["add"]:
            out += ["| Place | Gap | Region | Worth | People | Anchor | Why | Source |",
                    "|---|---|---|--:|--:|---|---|---|"]
            for a in c["add"]:
                out.append(f"| {md_escape(a['name'])} | {a['gap']} | {a['nuts2'] or ''} | "
                           f"{a['worth']:.3f} | {a['pop'] or 0:,} | {a['anchor']} {a['anchor_km']:.0f} km | "
                           f"{md_escape(a['reason'])} | {md_escape(a['source'])} |")
        else:
            out.append("None.")
        spare = [res["reserve"][k] for g in gaps_by_cc.get(cc, []) for k in g["reserve"]]
        if spare:
            out += ["", "Reserve (next in line if the owner strikes an add): " +
                    ", ".join(f"{md_escape(s['name'])} ({s['worth']:.3f})" for s in spare)]
        out += ["", f"## Stretch, below today's floor ({len(c['stretch'])})", "",
                "Not on the approve list: these pass every rule except the worth floor of "
                f"{res['meta']['rules']['min_worth']}, and score {res['meta']['rules']['stretch_floor']} "
                "or more. Taking them is an owner decision on the rule.", ""]
        if c["stretch"]:
            out += ["| Place | Gap | Region | Worth | People | Anchor | Why | Source |",
                    "|---|---|---|--:|--:|---|---|---|"]
            for a in c["stretch"]:
                out.append(f"| {md_escape(a['name'])} | {a['gap']} | {a['nuts2'] or ''} | "
                           f"{a['worth']:.3f} | {a['pop'] or 0:,} | {a['anchor']} {a['anchor_km']:.0f} km | "
                           f"{md_escape(a['reason'])} | {md_escape(a['source'])} |")
        else:
            out.append("None.")
        out += ["", f"## Merge ({len(c['merge'])})", ""]
        if c["merge"]:
            out += ["| Keep | Drop | Action | Reason | Source |", "|---|---|---|---|---|"]
            for d in c["merge"]:
                out.append(f"| {md_escape(d['keep_name'])} `{d['keep']}` | {md_escape(d['drop_name'])} "
                           f"`{d['drop']}` | {d['action']} | {md_escape(d['reason'])} | {d['source']} |")
        else:
            out.append("None.")
        for act in ("remove", "fix"):
            out += ["", f"## {act.title()} ({len(c[act])})", ""]
            if c[act]:
                out += ["| Place | Reason | Source |", "|---|---|---|"]
                for p in c[act]:
                    out.append(f"| {md_escape(p['name'])} `{p['id']}` | {md_escape(p['reason'])} | "
                               f"{p['source']} |")
            else:
                out.append("None.")
        files[f"{cc}.md"] = "\n".join(out) + "\n"
    return files


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--master", default="", help="catalogue file (default: master, else the wire)")
    ap.add_argument("--candidates", default=str(CANDIDATES))
    ap.add_argument("--out-json", default=str(OUT_JSON))
    ap.add_argument("--out-docs", default=str(OUT_DOCS))
    ap.add_argument("--no-gazetteer", action="store_true", help="skip GeoNames aliases")
    args = ap.parse_args(argv)

    master_path = Path(args.master) if args.master else (MASTER if MASTER.exists() else WIRE)
    master = load_json(master_path)
    if not master:
        raise SystemExit(f"missing catalogue {master_path}")
    cands = load_json(Path(args.candidates))
    if not cands:
        raise SystemExit(f"missing {args.candidates}: run pipeline/build_place_candidates.py first")
    signals = load_json(SIGNALS) or {}
    gaps = load_gaps()
    rules = load_rules()
    valid = field_validators()
    countries = {d.get("iso2") for d in master["destinations"].values()}
    gaz = None
    if not args.no_gazetteer and GEONAMES.exists() and GEONAMES.stat().st_size > 1000:
        gaz = Gazetteer(read_geonames(GEONAMES, countries))
    cp = _load_module("coverage_parity", COVERAGE)
    nuts = cp.load_nuts()

    res = build(master, cands["candidates"], signals, gaps, rules, valid, gaz, nuts, cp)
    res["meta"]["catalogue_file"] = str(master_path.relative_to(ROOT)) \
        if master_path.is_relative_to(ROOT) else str(master_path)
    res["meta"]["candidates_built"] = cands.get("meta", {}).get("built")

    out_json = Path(args.out_json)
    out_json.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_json(out_json, res)
    out_docs = Path(args.out_docs)
    out_docs.mkdir(parents=True, exist_ok=True)
    for old in out_docs.glob("*.md"):
        old.unlink()
    for name, text in render(res).items():
        (out_docs / name).write_text(text, encoding="utf-8")

    tot = Counter()
    for c in res["countries"].values():
        for k in ("add", "stretch", "merge", "remove", "fix"):
            tot[k] += len(c[k])
    print(f"{len(res['gaps'])} gaps, {res['meta']['candidates']:,} candidates; "
          f"add {tot['add']}, stretch {tot['stretch']}, merge {tot['merge']}, remove {tot['remove']}, fix {tot['fix']}")
    print(f"  -> {out_json}")
    print(f"  -> {out_docs}/ ({len(res['countries'])} country sheets)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
