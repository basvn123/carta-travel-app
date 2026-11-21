"""Match famous reference rows to published wire rows, one kind at a time.

D23/D24 famous coverage (2026-11-20). Order of evidence, strongest first:
1. QID: the wire row's `wd` equals the reference QID (mountains, lakes,
   beaches ship `wd`);
2. OSM relation: the wire row's `osm` equals the reference's relation, from
   Wikidata P402 or the trails famous registry (relation <-> QID);
3. name and place: a folded name equal to one of the reference's names (or,
   for trails, cycling and beaches, one containing the other when the
   shorter has at least 6 letters), with the wire row near the reference.

Guards, each with a test in tests/test_famous_match.py:
- one wire row answers at most one reference (greedy by evidence, then
  distance);
- rows are only looked up in the reference's own kind;
- a generic name ("Schwarzsee", "Main Beach") always needs the distance;
- mountains and lakes match names exactly ("Matterhorn" is not "Klein
  Matterhorn");
- a side trail or variant ("Rheinsteig Zuweg", "Kungsleden winter route")
  never answers the main trail;
- a trail or cycling row shorter than half the reference length is
  `in_as_piece`, never `in`."""

import math
import re
import unicodedata

PIECE_SHARE = 0.5
STAGES_SHARE = 0.6
CONTAINS_MIN = 6

# km: how near a wire row must be to count by name, and to count as a
# "matcher_miss" candidate (a same-kind row nearby under another name).
NEAR_KM = {"mountains": 1.5, "beaches": 1.5, "lakes": 2.0, "trails": 3.0,
           "cycling": 10.0}
CONTAINS_KINDS = {"trails", "cycling", "beaches"}

SIDE_WORDS = {"zuweg", "zubringer", "variante", "variant", "verbindungsweg",
              "verbindung", "alternative", "alternativ", "winter", "link",
              "spur", "abzweig", "anbindung", "zugang", "access", "connector",
              "bypass", "umgehung", "rundweg", "loop", "extension"}
GENERIC = {"schwarzsee", "weissensee", "lago nero", "lac noir", "main beach",
           "town beach", "beach", "plage", "playa", "praia", "spiaggia",
           "strand", "lake", "see", "lago", "lac", "hochkopf", "rotstock",
           "schwarzhorn", "grosser see", "long beach", "sandy beach",
           "golden beach", "blue lagoon", "plage centrale", "playa grande",
           "praia grande", "spiaggia grande"}
COMPASS = {"north", "south", "east", "west", "nord", "sud", "süd", "ost",
           "west", "est", "ouest", "norte", "sur", "este", "oeste"}
# A wire name with one of these the reference lacks is a section of it
# ("Drauradweg, Teil 2"), counted as a piece even when the length is unknown
# (judgement 1: 13 of 59 cycling matches were sections counted as in).
SECTION_WORDS = {"etappe", "etape", "teil", "teilstrecke", "abschnitt",
                 "nebenroute", "odcinek", "stage", "section", "tappa",
                 "tramo", "troncon", "part", "deel", "osa", "faza"}


def fold(s, keep_brackets=False):
    """Lowercase, accents off, punctuation to spaces. Bracketed text is
    dropped for name equality ("Grossglockner (Glocknerwand)"), and kept
    with keep_brackets for the side and section words, which brackets
    often carry ("Rheinsteig (Zuweg Bad Hönningen)")."""
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = s.replace("ß", "ss").replace("ø", "o").replace("æ", "ae")
    if not keep_brackets:
        s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"[^a-z0-9α-ω]+", " ", s)
    return " ".join(s.split())


def raw_tokens(names):
    out = set()
    for n in names:
        out |= set(fold(n, keep_brackets=True).split())
    return out


def km_between(a_lat, a_lon, b_lat, b_lon):
    if None in (a_lat, a_lon, b_lat, b_lon):
        return None
    r = 6371.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = p2 - p1, math.radians(b_lon - a_lon)
    h = (math.sin(dp / 2) ** 2 +
         math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(h))


def km_to_row(ref, row):
    """Distance from the reference point to the row: to its point, or to its
    bounding box for routes (0 when inside)."""
    lat, lon = ref.get("lat"), ref.get("lon")
    if lat is None or lon is None:
        return None
    bb = row.get("bbox")
    if bb:
        w, s, e, n = bb
        clat = min(max(lat, s), n)
        clon = min(max(lon, w), e)
        return km_between(lat, lon, clat, clon)
    return km_between(lat, lon, row.get("lat"), row.get("lon"))


def names_of(ref):
    out = {fold(n) for n in ([ref.get("name")] + list(ref.get("names") or []))}
    return {n for n in out if n}


def name_hit(kind, ref_names, row_name):
    """'exact', 'contains' or None for one wire name."""
    w = fold(row_name)
    if not w:
        return None
    if w in ref_names:
        return "exact"
    if kind not in CONTAINS_KINDS:
        return None
    wt = set(w.split())
    for n in ref_names:
        short, long_ = (n, w) if len(n) <= len(w) else (w, n)
        if len(short) < CONTAINS_MIN or short not in long_:
            continue
        if not re.search(r"(^| )" + re.escape(short) + r"( |$)", long_):
            continue
        extra = set(long_.split()) - set(short.split())
        if long_ == w and extra & (SIDE_WORDS | COMPASS):
            continue
        if long_ == w and wt & SIDE_WORDS:
            continue
        return "contains"
    return None


def osm_relation(value):
    """The OSM relation id in a wire `osm` field, or None: beaches and lakes
    also carry ways ("w6593464") and nodes, which no reference names."""
    if isinstance(value, int):
        return value
    v = str(value or "").strip().lower()
    if v.startswith("r"):
        v = v[1:]
    return int(v) if v.isdigit() else None


class Index:
    """Folded names of the wire rows, by exact name and by token, built once
    per kind so a reference costs a few lookups, not a scan."""

    def __init__(self, rows):
        self.by_qid, self.by_osm = {}, {}
        self.exact, self.token = {}, {}
        for row in rows:
            if row.get("wd"):
                self.by_qid.setdefault(row["wd"], []).append(row)
            rel = osm_relation(row.get("osm"))
            if rel:
                self.by_osm.setdefault(rel, []).append(row)
            names = {fold(row.get("name")), fold(row.get("nameLocal"))} - {""}
            row["_names"] = names
            row["_raw"] = raw_tokens([row.get("name"), row.get("nameLocal")])
            for n in names:
                self.exact.setdefault(n, []).append(row)
                for t in set(n.split()):
                    self.token.setdefault(t, []).append(row)

    def by_name(self, kind, ref_names):
        """{id(row): (row, 'exact'|'contains')} for the reference's names."""
        out = {}
        for n in ref_names:
            for row in self.exact.get(n, []):
                out[id(row)] = (row, "exact")
        if kind not in CONTAINS_KINDS:
            return out
        for n in ref_names:
            if len(n) < CONTAINS_MIN:
                continue
            toks = n.split()
            pool = self.token.get(max(toks, key=len), []) if toks else []
            for row in pool:
                if id(row) in out:
                    continue
                for w in row["_names"]:
                    if name_hit(kind, {n}, w) == "contains":
                        out[id(row)] = (row, "contains")
                        break
        # A short wire name inside a long reference name ("Malerweg" in
        # "Malerweg Saxon Switzerland"): look the wire names up by token.
        for n in ref_names:
            for t in set(n.split()):
                if len(t) < 4:      # "via", "de": the whole wire
                    continue
                for row in self.token.get(t, []):
                    if id(row) in out:
                        continue
                    for w in row["_names"]:
                        if len(w) < len(n) and \
                                name_hit(kind, {n}, w) == "contains":
                            out[id(row)] = (row, "contains")
                            break
        return out


def candidates(kind, ref, index):
    """[(rank, km, row, by)] for one reference; rank 0 is strongest."""
    out = []
    q = ref.get("qid")
    if q and q in index.by_qid:
        for row in index.by_qid[q]:
            out.append((0, 0.0, row, "qid"))
    for rel in ref.get("osm_rels") or []:
        for row in index.by_osm.get(rel, []):
            out.append((1, 0.0, row, "osm"))
    if out:
        return out
    ref_names = names_of(ref)
    ref_raw = raw_tokens([ref.get("name")] + list(ref.get("names") or []))
    ref_cc = set(ref.get("countries") or [])
    near = NEAR_KM[kind]
    generic_ref = bool(ref_names & GENERIC)
    for row, how in index.by_name(kind, ref_names).values():
        if ref_cc and row.get("cc") and row["cc"] not in ref_cc:
            continue
        extra = row.get("_raw", set()) - ref_raw
        if extra & (SIDE_WORDS | COMPASS):
            continue
        if extra & SECTION_WORDS:
            how = "section"
        d = km_to_row(ref, row)
        generic = generic_ref or bool(row["_names"] & GENERIC)
        if d is None:
            # No point to check: only an exact, non-generic name counts.
            if how != "exact" or generic:
                continue
        elif d > near:
            continue
        out.append((2 if how == "exact" else 3, d or 0.0, row,
                    "section" if how == "section" else "name"))
    return out


def status_of(kind, ref, row, all_rows, by=None):
    """in / in_listed / in_as_piece / in_as_stages for a matched row. A row
    named as a section of the reference is a piece whatever the length."""
    want = ref.get("length_km")
    if by == "section" and not (want and row.get("km")
                                and row["km"] >= PIECE_SHARE * want):
        return "in_as_piece"
    if kind in ("trails", "cycling") and want and row.get("km"):
        if row["km"] < PIECE_SHARE * want:
            got = sum(r.get("km") or 0 for r in all_rows)
            return "in_as_stages" if got >= STAGES_SHARE * want \
                else "in_as_piece"
    return "in" if row.get("tier") == "rated" else "in_listed"


def match(kind, refs, rows):
    """{ref id: {"status", "by", "row"}} for the matched references; a ref
    left out of the result is missing. One wire row answers one reference."""
    index = Index(rows)
    offers = []
    per_ref = {}
    for ref in refs:
        c = candidates(kind, ref, index)
        per_ref[ref["id"]] = c
        for rank, d, row, by in c:
            # A rated row beats a listed one at equal evidence.
            offers.append((rank, 0 if row.get("tier") == "rated" else 1, d,
                           ref["id"], id(row), row, by))
    offers.sort(key=lambda o: o[:3])
    taken_row, out = set(), {}
    refs_by_id = {r["id"]: r for r in refs}
    for rank, _t, d, rid, rkey, row, by in offers:
        if rid in out or rkey in taken_row:
            continue
        taken_row.add(rkey)
        ref = refs_by_id[rid]
        same = [x[2] for x in per_ref[rid]]
        out[rid] = {"status": status_of(kind, ref, row, same, by), "by": by,
                    "row": row, "km": round(d, 2)}
    return out


def nearby(kind, ref, rows, limit=3):
    """Same-kind rows near a missing reference, for the matcher_miss check."""
    near = NEAR_KM[kind]
    got = []
    for row in rows:
        d = km_to_row(ref, row)
        if d is not None and d <= near:
            got.append((d, row))
    got.sort(key=lambda x: x[0])
    return got[:limit]
