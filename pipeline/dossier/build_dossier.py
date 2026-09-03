"""
Build the per-destination dossier contract: continent-app/public/dossier/{base}.json.

One file per destination, rendered by BOTH the full-screen destination page and
the PDF export, so the two can never drift apart. Sections are independently
absent: a destination with no bathing water has no "water" key, and both
renderers skip it rather than printing an empty shell.

Stages (all offline; network fills live in sibling scripts):
  S1 resolve_highlights  dedupe + type + rank activities_full items
  S2 compose_gallery     5+ images from hero + highlight + nearby-feature photos,
                         TASL resolved from the existing licence caches
  S3 compose_intro       lead (blurb) + body (Wikivoyage extract, attributed)
  S4 compose_do          things to do from trails/events/listings/active POIs,
                         plus web evidence from cache/dossier/research/{base}.json
  S5 join_nearby         spatial join onto beaches/lakes/mountains/trails wires
  S6 compose_trips       best day trips: catalogue neighbours, features, composed
                         trips, Wikivoyage go-next; travel time from trip_model
  S7 parking             re-rank cache/parking_osm.json spots + nav deeplinks
  S8 compose_tips        rule codes + args, rendered through t() in the app
  S9 assemble + gate     licence gate refuses unprintable images, writes wire

Usage (from repo root):
  python pipeline/dossier/build_dossier.py --cc AL          one country
  python pipeline/dossier/build_dossier.py --only gem:valbona
  python pipeline/dossier/build_dossier.py --all            everything

Idempotent; unchanged input produces the same content_hash (built_at excluded).
ASCII clean, no em dashes, per project convention.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import os
import re
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(__file__))
from common import (  # noqa: E402
    PUB, CACHE, DCACHE, REPORTS, GridIndex, TaslStore, atomic_write_json,
    bearing8, commons_filename, dossier_file_base, file_page_url,
    filepath_thumb, haversine_km, image_ok, is_self_reference, licence_verdict,
    load_json, name_matches, name_tokens, nav_links, norm_name, usable_desc,
    sanitize_strings, slugify, thumb_at,
)
from derive_do import derive  # noqa: E402

SCHEMA = "dossier_v1"
OUT_DIR = os.path.join(PUB, "dossier")

# ---------------------------------------------------------------- trip model


def _load_trip_model():
    trips_dir = os.path.join(os.path.dirname(__file__), "..", "trips")
    if trips_dir not in sys.path:
        sys.path.insert(0, trips_dir)  # trip_model does `from trip_sources import ...`
    path = os.path.join(trips_dir, "trip_model.py")
    spec = importlib.util.spec_from_file_location("carta_trip_model", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ---------------------------------------------------------------- S1 highlights

# Items typed "Square" are the leaky OpenTripMap "interesting_places" bucket
# (45,817 of 124,940). Retype from name + description before display.
KIND_PATTERNS = [
    ("Cathedral", r"cathedral|duomo|catedral|dom\b|kathedrale"),
    ("Basilica", r"basilica|basilika"),
    ("Church", r"\bchurch\b|kirche|iglesia|chiesa|eglise|kerk|crkva|kisha|biserica"),
    ("Monastery", r"monastery|abbey|kloster|monasterio|abbaye|manastir"),
    ("Mosque", r"mosque|xhamia|dzamija|camii"),
    ("Synagogue", r"synagog"),
    ("Castle", r"\bcastle\b|kalaja|castillo|castello|chateau|burg\b|hrad|zamek|kasteel|fortress|citadel|fort\b|fortifi"),
    ("Palace", r"palace|palazzo|palacio|palais|schloss"),
    ("Museum", r"museum|museo|musee|muzeu|galerie|gallery"),
    ("Bridge", r"bridge|ponte|puente|pont\b|brucke|most\b"),
    ("Tower", r"tower|torre|tour\b|turm|kula"),
    ("Lighthouse", r"lighthouse|faro\b|phare"),
    ("Theatre", r"theatre|theater|teatro|amphitheatre|amphitheater|arena"),
    ("Ruins", r"ruin|archaeolog|ancient|roman site"),
    ("Monument", r"monument|memorial|statue|obelisk"),
    ("Old town", r"old town|historic cent|altstadt|centro storico|stari grad"),
    ("Market", r"market|mercado|mercato|bazaar|bazar"),
    ("Square", r"square|plaza|piazza|platz|place\b|trg\b|sheshi"),
    ("Park", r"\bpark\b|garden|jardin|giardino|botanic"),
    ("Waterfall", r"waterfall|cascade|cascata|ujevara|vodopad"),
    ("Cave", r"\bcave\b|grotto|grotte|cueva|shpella|jama\b|pecina|pećina|pestera|hohle|höhle"),
    ("Lake", r"\blake\b|lago\b|lac\b|liqeni|jezero"),
    ("Beach", r"beach|playa|plage|spiaggia|plazh|strand"),
    ("Viewpoint", r"viewpoint|lookout|belvedere|panorama|mirador"),
    ("Gate", r"\bgate\b|porta\b|puerta|porte\b|tor\b"),
    ("National park", r"national park|parku komb|parc national|nationalpark"),
    ("Peak", r"\bmount\b|\bpeak\b|\bmaja\b|\bmont\b|\bmonte\b|summit"),
]
KIND_RES = [(k, re.compile(p, re.I)) for k, p in KIND_PATTERNS]


def infer_kind(name, desc):
    hay = f"{name} {desc or ''}"
    for kind, rx in KIND_RES:
        if rx.search(hay):
            return kind
    return "Landmark"


class UnionFind:
    def __init__(self, n):
        self.p = list(range(n))

    def find(self, i):
        while self.p[i] != i:
            self.p[i] = self.p[self.p[i]]
            i = self.p[i]
        return i

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[rb] = ra


def landmarks_as_items(landmarks):
    """Wikidata landmarks in the same shape as an activities_full row, so one
    dedupe and one ranking cover both sources.

    These carry the two things the OpenTripMap layer lacks: a real P31 type
    (rather than the 'Square' bucket) and a sitelink count that is a true fame
    measure. They are the reason Paris can show the Eiffel Tower at all.
    """
    out = []
    for lm in landmarks or []:
        out.append({
            "name": lm["name"],
            "kind": lm.get("kind") or "Landmark",
            "lat": lm["lat"], "lon": lm["lon"],
            "rate": 3 if lm.get("sitelinks", 0) >= 25 else 2,
            "img": filepath_thumb(lm["img"], 960) if lm.get("img") else None,
            "wiki": None,
            "_qid": lm.get("qid"),
            "_sitelinks": lm.get("sitelinks", 0),
            "_from": "wikidata",
        })
    return out


def resolve_highlights(dest, items, poi_wd, cap=12, listed=()):
    """Dedupe, retype, rank. Returns (highlights, n_merged).

    `listed` are normalised names a Wikivoyage editor put in the article's See
    or Do section. That signal carries real weight here because sitelinks
    measure ENCYCLOPEDIC notability, not tourist draw: the College de France
    (71 sitelinks) and the Arc de Triomphe (85) are neck and neck on fame, and
    only one of them is what a visitor came for. A human editor shortlisting
    it is the closest thing to that judgement in open data.
    """
    if not items:
        return [], 0
    rows = []
    # The town itself turns up in its own POI list ("Paris", 365 sitelinks)
    # and would win the ranking outright. A place is not its own highlight.
    self_name = PAREN_TAIL_RE.sub("", dest.get("city") or "")
    for it in items:
        if not isinstance(it.get("lat"), (int, float)) or not isinstance(
                it.get("lon"), (int, float)):
            continue  # gate: an item with no coordinate cannot be mapped
        if is_self_reference(it.get("name") or "", self_name):
            continue
        rows.append(it)
    norms = [norm_name(it.get("name", "")) for it in rows]
    qids = []
    for it in rows:
        if it.get("_qid"):
            qids.append(it["_qid"])
            continue
        wd = poi_wd.get(it.get("wiki") or "")
        qids.append(wd.get("qid") if isinstance(wd, dict) else None)

    uf = UnionFind(len(rows))
    by_norm = {}
    by_qid = {}
    for i, n in enumerate(norms):
        if n:
            if n in by_norm:
                uf.union(by_norm[n], i)
            else:
                by_norm[n] = i
        q = qids[i]
        if q:
            if q in by_qid:
                uf.union(by_qid[q], i)
            else:
                by_qid[q] = i
    # containment + centroids within 300 m
    for i in range(len(rows)):
        ni = norms[i]
        if not ni:
            continue
        for j in range(i + 1, len(rows)):
            nj = norms[j]
            if not nj or ni == nj:
                continue
            if ni in nj or nj in ni:
                km = haversine_km(rows[i]["lat"], rows[i]["lon"],
                                  rows[j]["lat"], rows[j]["lon"])
                if km <= 0.3:
                    uf.union(i, j)

    clusters = {}
    for i in range(len(rows)):
        clusters.setdefault(uf.find(i), []).append(i)
    n_merged = sum(len(v) - 1 for v in clusters.values())

    clat = dest.get("city_lat", dest["lat"])
    clon = dest.get("city_lon", dest["lon"])
    out = []
    for members in clusters.values():
        def info_score(i):
            it = rows[i]
            sl = it.get("_sitelinks") or 0
            if not sl:
                wd = poi_wd.get(it.get("wiki") or "")
                sl = wd.get("sitelinks", 0) if isinstance(wd, dict) else 0
            return (
                (2 if it.get("img") else 0) + (1 if it.get("desc") else 0)
                + (1 if it.get("wiki") else 0) + (it.get("rate") or 0)
                + min(sl, 40) / 20.0
                # A Wikidata row wins the tie: its P31 type is real, where the
                # catalogue's would be the "Square" bucket.
                + (1.5 if it.get("_from") == "wikidata" else 0)
            )
        best = max(members, key=info_score)
        it = rows[best]
        kind = it.get("kind") or "Square"
        resolved_by = "catalogue"
        if kind == "Square":
            kind = infer_kind(it.get("name"), it.get("desc"))
            resolved_by = "retyped"
        sitelinks = it.get("_sitelinks") or 0
        if not sitelinks:
            wd = poi_wd.get(it.get("wiki") or "")
            sitelinks = wd.get("sitelinks", 0) if isinstance(wd, dict) else 0
        # A cluster inherits the best evidence any of its members carried: the
        # Wikidata row usually has the photo and the fame, the catalogue row
        # the description, and the survivor should keep both.
        for m in members:
            other = rows[m]
            sitelinks = max(sitelinks, other.get("_sitelinks") or 0)
            if not it.get("img") and other.get("img"):
                it = dict(it, img=other["img"])
            if not it.get("desc") and other.get("desc"):
                it = dict(it, desc=other["desc"])
            if not it.get("wiki") and other.get("wiki"):
                it = dict(it, wiki=other["wiki"])
        merged = sorted({rows[m]["name"] for m in members} - {it["name"]})
        hl = {
            "id": "hl-" + slugify(it["name"]),
            "name": it["name"],
            "kind": kind,
            "lat": round(it["lat"], 5),
            "lon": round(it["lon"], 5),
            "dist_km": round(haversine_km(clat, clon, it["lat"], it["lon"]), 1),
            # D5: the absolute significance (score_significance.py, 0-3)
            # rides along so the renderer can mark WHY the ordering is what
            # it is, not just apply it.
            **({"sig": it["sig"]} if isinstance(it.get("sig"), (int, float)) else {}),
            # Fame dominates, curation breaks the ties fame cannot. The old
            # term was min(sitelinks, 60)/20, which SATURATED at 60: every
            # famous thing scored an identical 3.0 and the ranking fell
            # through to the heritage flag, so Paris shipped College de France
            # and dropped the Louvre (169 sitelinks, no heritage flag). Log
            # scaling separates the top; the Wikivoyage term then decides
            # between two things of equal encyclopedic weight where only one
            # is a sight. Heritage and photo stay as small tie-breakers, well
            # below the fame spread they used to swamp.
            "rank_score": round(
                math.log10(1 + sitelinks) / math.log10(400) * 10
                + (it.get("rate") or 0) * 1.2
                # A tie-breaker, deliberately smaller than the fame spread it
                # sits inside. At 3.0 it stopped breaking ties and started
                # deciding: Barcelona put the Palau Sant Jordi arena above the
                # Sagrada Familia purely because an editor had listed it.
                + (1.5 if name_matches(it.get("name", ""), listed) else 0)
                + (0.4 if it.get("heritage") else 0)
                + (0.3 if it.get("img") else 0), 2),
            "resolved_by": resolved_by,
        }
        fact = usable_desc(it.get("desc"))
        if fact:
            hl["fact"] = fact
        if it.get("img"):
            hl["image"] = {"url": it["img"]}
        if it.get("wiki"):
            hl["wikipedia"] = it["wiki"]
        if it.get("heritage"):
            hl["heritage"] = True
        if merged:
            hl["merged_from"] = merged[:4]
        out.append(hl)

    out.sort(key=lambda h: -h["rank_score"])
    # kind diversity: a valley must not ship a wall of peaks (HL-4 says 60
    # percent max; we cut earlier, at a third, because twelve rows of the
    # same kind reads like a list even when it technically passes the gate)
    max_per_kind = max(2, int(cap * 0.34))
    picked, per_kind = [], Counter()
    for h in out:
        if per_kind[h["kind"]] >= max_per_kind:
            continue
        picked.append(h)
        per_kind[h["kind"]] += 1
        if len(picked) >= cap:
            break
    seen_ids = set()
    final = []
    for h in picked:
        if h["id"] in seen_ids:
            h = dict(h, id=h["id"] + "-" + str(len(final)))
        seen_ids.add(h["id"])
        final.append(h)
    return final, n_merged


# ---------------------------------------------------------------- S2 gallery


def attach_tasl(img, tasl, refusals):
    """Mutates an {url: ...} image dict with TASL + ok_print flag."""
    rec = tasl.lookup(img["url"])
    if rec:
        for k in ("author", "licence", "licence_url", "page", "w", "h"):
            if rec.get(k):
                img[k] = rec[k]
    name = commons_filename(img["url"])
    if name and "page" not in img:
        img["page"] = file_page_url(name)
    verdict = licence_verdict(img.get("licence"), img.get("author"))
    img["ok_print"] = verdict == "ok"
    if verdict != "ok":
        refusals.append({"url": img["url"], "why": "licence"})
    return img


def compose_gallery(dest, highlights, nearby, tasl, refusals, target=8,
                    landmarks=()):
    cands = []
    hero = (dest.get("image") or {}).get("url")
    if hero:
        cands.append({"url": hero, "caption": dest.get("city"), "role": "hero"})
    for h in sorted(highlights, key=lambda x: -(x.get("rank_score") or 0)):
        u = (h.get("image") or {}).get("url")
        if u:
            cands.append({"url": u, "caption": h["name"], "role": "highlight"})
    for layer in ("beaches", "lakes", "mountains", "trails"):
        for f in (nearby or {}).get(layer, []):
            if f.get("thumb") and (f.get("tier") or 0) >= 2:
                cands.append({"url": f["thumb"], "caption": f["name"], "role": layer})
    # Top-ups, in descending order of how well they represent the place. Only
    # reached when the good candidates ran out, which is why the tier bar and
    # the highlight cap are relaxed here and nowhere else: a five-photo
    # gallery of real nearby places beats a two-photo one that was stricter.
    for lm in sorted(landmarks or [], key=lambda x: -(x.get("sitelinks") or 0)):
        if lm.get("img"):
            cands.append({"url": filepath_thumb(lm["img"], 960),
                          "caption": lm["name"], "role": "landmark"})
    for layer in ("beaches", "lakes", "mountains", "trails"):
        for f in (nearby or {}).get(layer, []):
            if f.get("thumb") and (f.get("tier") or 0) < 2:
                cands.append({"url": f["thumb"], "caption": f["name"], "role": layer})

    out, seen, per_author = [], set(), Counter()
    for c in cands:
        name = commons_filename(c["url"]) or c["url"]
        if name in seen:
            continue
        seen.add(name)
        img = {"url": thumb_at(c["url"], 960), "thumb": thumb_at(c["url"], 500)}
        if c.get("caption"):
            img["caption"] = c["caption"]
        attach_tasl(img, tasl, refusals)
        # A crest or a locator map is a correct illustration and a useless
        # photograph; judged after TASL so the size is known.
        if not image_ok(c["url"], img.get("w"), img.get("h")):
            refusals.append({"url": c["url"], "why": "not_a_photograph"})
            continue
        author = img.get("author") or ""
        if author and per_author[author] >= 2 and c.get("role") != "hero":
            continue  # one prolific uploader must not become the gallery
        if author:
            per_author[author] += 1
        out.append(img)
        if len(out) >= target + 2:
            break
    return out[:target]


# ---------------------------------------------------------------- S3 intro

TEMPLATE_BLURB_RE = re.compile(r"known for its|worth a look for", re.I)
PAREN_TAIL_RE = re.compile(r"\s*\([^)]*\)\s*$")
SENT_RE = re.compile(r"(?<=[.!?])\s+")


def trim_sentences(text, max_chars):
    text = re.sub(r"\s+", " ", text or "").strip()
    if len(text) <= max_chars:
        return text
    parts = SENT_RE.split(text)
    out = ""
    for p in parts:
        if len(out) + len(p) + 1 > max_chars:
            break
        out = (out + " " + p).strip()
    return out or text[:max_chars].rsplit(" ", 1)[0]


AIRPORTY_RE = re.compile(r"\bairport\b|\baerodrome\b|\bairfield\b", re.I)


def compose_intro(dest, wv, city_intros=None):
    """What this PLACE is, never what its airport is.

    A gateway record carries the airport's article, so CDG opened with the
    hub's passenger numbers on a page about Paris. harvest_city_intros.py
    resolves the base city's own article for those 260 records, and an
    airport-sounding first line is dropped even when nothing replaces it: a
    missing description is better than a confidently wrong one.
    """
    lead = (dest.get("blurb") or "").strip()
    body = ""
    grounding = []
    rec = wv.get(dest["id"]) if isinstance(wv, dict) else None
    city_rec = (city_intros or {}).get(dest["id"])
    if isinstance(city_rec, dict) and city_rec.get("extract"):
        rec = city_rec
    if isinstance(rec, dict) and rec.get("extract"):
        text = rec["extract"]
        if not AIRPORTY_RE.search(text[:220]):
            body = trim_sentences(text, 700)
            grounding.append({
                "source": rec.get("source") or "wikivoyage",
                "title": rec.get("title"), "url": rec.get("url"),
                "licence": "CC BY-SA 4.0",
            })
    if not lead or (TEMPLATE_BLURB_RE.search(lead) and body):
        lead = ""
    intro = {}
    if lead:
        intro["lead"] = lead
    if body:
        intro["body"] = body
        intro["grounding"] = grounding
    facts = {}
    pop = (dest.get("geonames") or {}).get("population")
    if pop:
        facts["population"] = pop
    vh = (dest.get("place") or {}).get("visit_h")
    if vh:
        facts["visit_h"] = vh
    if facts:
        intro["facts"] = facts
    return intro or None


# ---------------------------------------------------------------- S4 do


def compose_do(dest, items, highlights, nearby, listings, events, poi_wd,
               research, landmarks=(), cap=10):
    """Web-swept items first, then the open-data derivation fills the rest.

    Two tiers with two different evidence models, and both say which they are:
    a web item carries evidence.method "web" and a count of publishers, a
    derived item carries "open" and a count of institutions. Every destination
    gets the second tier; the famous ones also get the first. See
    derive_do.py for why the open sources count as corroboration.
    """
    out, taken = [], []

    for r in (research or {}).get("do", []):
        e = {k: r[k] for k in ("name", "type", "detail", "season", "link")
             if r.get(k)}
        ev = dict(r.get("evidence") or {})
        ev["method"] = "web"
        e["evidence"] = ev
        e["sources"] = r.get("sources") or ["web"]
        out.append(e)
        taken.append(r["name"])

    room = cap - len(out)
    derived = []
    if room > 0:
        derived = derive(dest, items, highlights, nearby, listings, events,
                         poi_wd, taken=taken, landmarks=landmarks)[:room]

    # A web item outranks a derived one because more publishers is stronger
    # evidence, but only when the pool it was drawn from was real. Where the
    # search budget ran out and a place was worked from six fetched pages,
    # "named by 3 of 6" is not better evidence than three independent
    # institutions, and it should not push them off the list.
    def strength(e):
        ev = e.get("evidence") or {}
        n = ev.get("n_sources") or 0
        if ev.get("method") != "web":
            return n + 0.5           # institutions, ranked just under a real sweep
        pool = ev.get("of") or 0
        return n + (2.0 if pool >= 12 else 0.0)

    out.extend(derived)
    out.sort(key=lambda e: -strength(e))
    return [{k: v for k, v in e.items() if v is not None} for e in out][:cap]


# ---------------------------------------------------------------- S5 nearby

# metres of radius by feature layer and place class; cap per layer (spec table)
NEARBY_RULES = {
    "beaches": ({"village": 15, "town": 15, "city": 25, "metro": 35, "area": 35}, 6),
    "lakes": ({"village": 20, "town": 20, "city": 30, "metro": 40, "area": 40}, 4),
    "trails": ({"village": 20, "town": 20, "city": 30, "metro": 45, "area": 45}, 6),
    "mountains": ({"village": 25, "town": 25, "city": 40, "metro": 60, "area": 60}, 5),
}
INSIDE_KM = 0.8  # a feature this close is a highlight, not a neighbour


def join_nearby(dest, layer_index):
    clat = dest.get("city_lat", dest["lat"])
    clon = dest.get("city_lon", dest["lon"])
    cls = (dest.get("place") or {}).get("class", "town")
    out = {}
    for layer, (radii, cap) in NEARBY_RULES.items():
        idx = layer_index.get(layer)
        if not idx:
            continue
        radius = radii.get(cls, radii["town"])
        rows = []
        for km, f in idx.near(clat, clon, radius):
            if km < INSIDE_KM:
                continue
            rows.append((km, f))
        # tier first, then score, then distance: never distance alone
        rows.sort(key=lambda t: (-(t[1].get("tier") or 0),
                                 -(t[1].get("score") or 0), t[0]))
        picked = []
        # OSM ships the same route under several relations ("GRP Bois de
        # Vincennes" and "GRP Bois de Vincennes (boucle)"), and a list that
        # prints both looks broken. Fold on the name minus any bracketed
        # qualifier, keeping the best-ranked of each group.
        name_seen = set()
        for km, f in rows[: cap * 4]:
            key = norm_name(PAREN_TAIL_RE.sub("", f.get("name") or ""))
            if not key or key in name_seen:
                continue
            name_seen.add(key)
            entry = {
                "layer": layer, "cc": f["cc"], "id": f["id"], "name": f["name"],
                "km": round(km, 1),
                "bearing": bearing8(clat, clon, f["lat"], f["lon"]),
                "lat": round(f["lat"], 5), "lon": round(f["lon"], 5),
            }
            for k in ("tier", "score", "thumb", "elev_m", "km_len",
                      "duration_min", "difficulty", "water"):
                if f.get(k) is not None:
                    entry[k] = f[k]
            picked.append(entry)
            if len(picked) >= cap:
                break
        if picked:
            out[layer] = picked
    return out or None


# ---------------------------------------------------------------- S6 trips

TRIP_RADIUS_KM = 110
TRIP_CAP = 8


def compose_trips(dest, ctx):
    clat = dest.get("city_lat", dest["lat"])
    clon = dest.get("city_lon", dest["lon"])
    my_score = (dest.get("rating") or {}).get("score") or 0
    gonext = {norm_name(n) for n in ctx["gonext"].get(dest["id"], [])}
    cands = []
    for km, other in ctx["dest_index"].near(clat, clon, TRIP_RADIUS_KM):
        if other["id"] == dest["id"] or km < 3:
            continue
        r = other.get("rating") or {}
        score = r.get("score") or 0
        is_gonext = norm_name(other.get("city", "")) in gonext
        if (r.get("tier") or 0) < 1 and score < 6.5 and not is_gonext:
            continue
        leg = ctx["trip_model"].leg(
            {"lat": clat, "lon": clon, "iso2": dest.get("iso2")},
            {"lat": other["lat"], "lon": other["lon"], "iso2": other.get("iso2")},
        )
        if not leg.get("ok"):
            continue  # no trip without a travel time
        options = [(v["hours"] * 60, mode) for mode, v in leg["modes"].items()
                   if v.get("hours")]
        if not options:
            continue
        minutes, mode = min(options)
        if minutes > 210:
            continue
        why = []
        if is_gonext:
            why.append("editorialRoute")
        if score > my_score + 0.4:
            why.append("higherRated")
        cats = set(other.get("categories") or [])
        if cats & {"beaches", "coast", "islands"} and \
                set(dest.get("categories") or []) & {"beaches", "coast", "islands"}:
            why.append("coastHop")
        rank = score * (0.5 ** (minutes / 70.0)) * (1.6 if is_gonext else 1.0)
        entry = {
            "kind": "destination", "id": other["id"],
            "name": PAREN_TAIL_RE.sub("", other.get("city") or "").strip(),
            "country": other.get("country"),
            "dist_km": round(km),
            "travel": {"minutes": round(minutes), "mode": mode,
                       "source": "trip_model"},
            "why": why or ["worthTheRide"],
            "lat": round(other["lat"], 5), "lon": round(other["lon"], 5),
        }
        # A day trip card that says only "58 min by train" asks the reader to
        # take the suggestion on faith. The score, its label and the one line
        # the catalogue already holds are what make it a recommendation.
        if score:
            entry["rating"] = {"score": round(score, 1)}
            if r.get("label"):
                entry["rating"]["label"] = r["label"]
            if r.get("hidden_gem"):
                entry["rating"]["hidden_gem"] = True
        blurb = (other.get("blurb") or "").strip()
        if blurb and not TEMPLATE_BLURB_RE.search(blurb):
            entry["blurb"] = trim_sentences(blurb, 160)
        else:
            # No hand-written line: name what is actually there instead. Two
            # POI names is a weaker sentence than an editor's, and a truer one
            # than "known for its historical building".
            sights = [i["name"] for i in (ctx["acts"].get(other["id"]) or [])
                      if (i.get("rate") or 0) >= 3 and i.get("name")][:2]
            if len(sights) == 2:
                entry["blurb"] = f"{sights[0]} and {sights[1]}."
            elif sights:
                entry["blurb"] = f"{sights[0]}."
        if other.get("place", {}).get("visit_h"):
            entry["visit_h"] = other["place"]["visit_h"]
        img = (other.get("image") or {}).get("url")
        if img:
            entry["image"] = {"url": thumb_at(img, 500)}
        cands.append((rank, cats, entry))

    cands.sort(key=lambda t: -t[0])
    # An adaptive quality floor. Paris has dozens of candidates, so shipping a
    # 6.5-rated village alongside Versailles and Chartres wastes a slot that a
    # better place wanted. Where enough strong options exist, the weak ones go;
    # where they do not, a 6.5 is the best honest answer and it stays.
    strong = [c for c in cands if (c[2].get("rating") or {}).get("score", 0) >= 7.0]
    if len(strong) >= TRIP_CAP - 1:
        cands = strong

    picked, cat_seen = [], Counter()
    for rank, cats, entry in cands:
        main = next(iter(cats), "other")
        if cat_seen[main] >= 3:
            continue
        cat_seen[main] += 1
        picked.append(entry)
        if len(picked) >= TRIP_CAP - 1:
            break

    # one composed multi-day trip that passes through here, if any
    best_trip = None
    for tr in ctx["trips_by_cc"].get(dest.get("iso2"), []):
        km = haversine_km(clat, clon, tr.get("lat") or 0, tr.get("lon") or 0)
        if km <= 30 and (best_trip is None or (tr.get("score") or 0) > (best_trip.get("score") or 0)):
            best_trip = tr
    if best_trip:
        # Summary rows carry no display name; compose one from the cities.
        cities = [c.get("city") for c in best_trip.get("cities", []) if c.get("city")]
        name = best_trip.get("name") or ", ".join(cities[:3]) or dest.get("city")
        entry = {
            "kind": "composed_trip", "id": best_trip["id"],
            "name": name,
            "days": best_trip.get("days"),
            "why": ["editorialRoute"],
        }
        if len(cities) > 1:
            entry["blurb"] = ", ".join(cities[:-1]) + " and " + cities[-1] + "."
        elif best_trip.get("outs"):
            outs = [o.get("city") for o in best_trip["outs"][:2] if o.get("city")]
            if outs:
                entry["blurb"] = "Based here, out to " + " and ".join(outs) + "."
        if best_trip.get("score"):
            entry["rating"] = {"score": round(best_trip["score"], 1)}
        img = ((best_trip.get("img") or {}).get("url"))
        if img:
            entry["image"] = {"url": thumb_at(img, 500)}
        picked.append(entry)
    return picked or None


# ---------------------------------------------------------------- S7 parking

PARK_RADIUS_M = {"metro": 1500, "city": 1500, "town": 3000,
                 "village": 8000, "area": 8000}


def spot_score(s):
    sc = 0.0
    if s.get("name"):
        sc += 1.8
    cap = s.get("cap")
    if cap:
        sc += min(math.log10(max(cap, 1)) * 0.9, 2.2)
    fee = s.get("fee")
    sc += 1.2 if fee == "no" else (0.4 if fee is None else 0.0)
    sc -= (s.get("dist_m") or 0) / 1000.0 * 1.5
    return sc


def compose_parking(dest, spots):
    if not spots:
        return None
    cls = (dest.get("place") or {}).get("class", "town")
    radius = PARK_RADIUS_M.get(cls, 3000)
    usable = [s for s in spots if (s.get("dist_m") or 0) <= radius
              and isinstance(s.get("lat"), (int, float))]
    if not usable:
        return None
    regular = [s for s in usable if not s.get("pr")]
    prs = [s for s in usable if s.get("pr")]
    regular.sort(key=spot_score, reverse=True)
    prs.sort(key=spot_score, reverse=True)

    def emit(s):
        row = {
            "name": s.get("name") or None,
            "lat": round(s["lat"], 5), "lon": round(s["lon"], 5),
            "dist_m": s.get("dist_m"),
            "walk_min": max(1, round((s.get("dist_m") or 0) * 1.3 / 80)),
            "fee": s.get("fee"), "type": s.get("type"),
            "capacity": s.get("cap"),
            "nav": nav_links(s["lat"], s["lon"]),
        }
        return {k: v for k, v in row.items() if v is not None}

    out = {"spots": [emit(s) for s in regular[:3]]}
    if prs:
        out["park_ride"] = emit(prs[0])
    return out if out.get("spots") or out.get("park_ride") else None


# ---------------------------------------------------------------- S8 tips


def month_span(best):
    if not best:
        return None
    return max(best) - min(best) + 1


def compose_tips(dest, sections):
    tips = []

    def add(code, **args):
        tip = {"code": code}
        if args:
            tip["args"] = args
        tips.append(tip)

    lt = dest.get("local_transport") or {}
    if lt.get("car_needed"):
        add("carNeeded", rental_eur=round(lt.get("rental_eur_per_day") or 30))
    elif lt.get("transit_quality") in ("good", "excellent"):
        add("transitEasy")

    # Pair it with the neighbour: the single most useful planning fact a
    # destination page can hand over, and it is already computed above.
    for tr in (sections.get("trips") or []):
        if tr.get("kind") != "destination":
            continue
        mins = (tr.get("travel") or {}).get("minutes")
        if mins and mins <= 75 and ("higherRated" in (tr.get("why") or [])
                                    or "editorialRoute" in (tr.get("why") or [])):
            add("pairWith", name=tr["name"], minutes=int(mins))
            break

    # Time it with a festival the research sweep or Wikidata actually found.
    for item in (sections.get("do") or []):
        if item.get("type") == "festival" and item.get("season"):
            add("timeItWith", name=item["name"],
                month=int(item["season"][0]))
            break

    if any(g.get("kind") == "unesco_whc"
           for g in (dest.get("designations") or [])):
        add("wholeCentreListed")

    beaches = (sections.get("nearby") or {}).get("beaches") or []
    if len(beaches) >= 3:
        add("beachDays", n=len(beaches), km=int(round(beaches[0]["km"])))

    visit_h = (dest.get("place") or {}).get("visit_h")
    if visit_h and visit_h >= 14:
        add("worthTwoDays")
    elif visit_h and visit_h <= 2.5:
        add("halfDayEnough")

    toll = dest.get("driving_toll") or {}
    if lt.get("car_needed") and toll.get("vignettes"):
        add("vignetteNeeded")

    cl = dest.get("climate") or {}
    if cl.get("m") and len(cl["m"]) == 12 and (cl["m"][0][0] or 0) >= 18:
        add("warmWinter", t=int(round(cl["m"][0][0])))
    best = (dest.get("climate") or {}).get("best") or []
    span = month_span(best)
    if span and span <= 4 and len(best) >= 2:
        add("seasonWindow", from_m=min(best), to_m=max(best))
    crowd = dest.get("crowding") or {}
    if crowd.get("tier") == 3 and (7 in best or 8 in best):
        add("crowdWarning")
    if crowd.get("tier", 9) <= 1 and 9 in best:
        add("shoulderBeatsPeak", month=9)
    bw = dest.get("bathing_water") or {}
    if bw.get("rating") == "Excellent" and bw.get("n_sites"):
        add("bathingExcellent", n=bw["n_sites"])
    tr = dest.get("transfer") or {}
    if (tr.get("transfer_minutes_one_way") or 0) > 90:
        add("transferPain", minutes=tr["transfer_minutes_one_way"])
    nearby = sections.get("nearby") or {}
    place_score = (dest.get("rating") or {}).get("score") or 0
    for layer in ("trails", "mountains", "beaches"):
        for f in nearby.get(layer, []):
            if (f.get("tier") or 0) >= 3 and f["km"] <= 15 and place_score < 8.5:
                add("gatewayFor", name=f["name"])
                break
        else:
            continue
        break
    if (dest.get("rating") or {}).get("hidden_gem"):
        add("hiddenGem")
    park = sections.get("parking") or {}
    if any(s.get("fee") == "no" for s in park.get("spots", [])):
        add("freeParking")

    # Ordered by what a reader deciding a trip actually needs, not by the
    # order the rules happened to fire. Six survive the cut, so a place with
    # a lot to say leads with why you come and what to pair it with, and
    # loses the free-parking footnote rather than the other way round.
    RANK = {
        "gatewayFor": 0, "pairWith": 1, "timeItWith": 2, "seasonWindow": 3,
        "crowdWarning": 4, "shoulderBeatsPeak": 5, "carNeeded": 6,
        "transitEasy": 7, "worthTwoDays": 8, "halfDayEnough": 9,
        "warmWinter": 10, "beachDays": 11, "bathingExcellent": 12,
        "wholeCentreListed": 13, "hiddenGem": 14, "transferPain": 15,
        "vignetteNeeded": 16, "freeParking": 17,
    }
    tips.sort(key=lambda t: RANK.get(t["code"], 99))
    return tips[:6] or None


# ---------------------------------------------------------------- practical


def compose_practical(dest):
    city = dest.get("city") or ""
    country = dest.get("country") or ""
    q = f"{city}, {country}"
    iata = dest.get("anchor_airport") or (dest.get("iata") if dest.get("tier") == "airport" else None)
    lat = dest.get("city_lat", dest["lat"])
    lon = dest.get("city_lon", dest["lon"])
    links = {
        "flights_google": "https://www.google.com/travel/flights?q=" +
            ("Flights%20to%20" + iata if iata else "Flights%20to%20" + slugify(city)),
        "skyscanner": "https://www.skyscanner.net/transport/flights-to/" +
            (iata.lower() if iata else slugify(city)) + "/",
        "booking": f"https://www.booking.com/searchresults.html?ss={q.replace(' ', '+')}",
        "airbnb": f"https://www.airbnb.com/s/{slugify(city)}--{slugify(country)}/homes",
        "getyourguide": f"https://www.getyourguide.com/s/?q={q.replace(' ', '+')}",
        "viator": f"https://www.viator.com/searchResults/all?text={q.replace(' ', '+')}",
    }
    practical = {"links": links}
    tr = dest.get("transfer") or {}
    lt = dest.get("local_transport") or {}
    # D3: the fields travellers decide on, all in one block - 1,344 places
    # are rated poor transit and the reader must be told, not left to infer.
    getting = {}
    if iata:
        getting["airport"] = iata
        if tr.get("transfer_minutes_one_way") is not None:
            getting["transfer_min"] = tr.get("transfer_minutes_one_way")
        if tr.get("transfer_mode"):
            getting["transfer_mode"] = tr.get("transfer_mode")
    for src_key, out_key in (("transit_quality", "transit"),
                             ("car_needed", "car_needed"),
                             ("reason", "why"),
                             ("rental_eur_per_day", "rental_eur_day")):
        if lt.get(src_key) is not None:
            getting[out_key] = lt[src_key]
    if getting:
        practical["getting_there"] = getting
    return practical


# ---------------------------------------------------------------- credits

CREDIT_DEFS = {
    "osm": {"name": "OpenStreetMap contributors", "licence": "ODbL 1.0",
            "url": "https://www.openstreetmap.org/copyright"},
    "wikidata": {"name": "Wikidata", "licence": "CC0",
                 "url": "https://www.wikidata.org"},
    "wikivoyage": {"name": "Wikivoyage", "licence": "CC BY-SA 4.0",
                   "url": "https://www.wikivoyage.org"},
    "commons": {"name": "Wikimedia Commons photographers",
                "licence": "per image", "url": "https://commons.wikimedia.org"},
    "opentripmap": {"name": "OpenTripMap", "licence": "CC BY-SA 4.0",
                    "url": "https://opentripmap.io"},
    "eea": {"name": "European Environment Agency", "licence": "CC BY 4.0",
            "url": "https://www.eea.europa.eu"},
    "eurostat": {"name": "JRC / Eurostat", "licence": "CC BY 4.0",
                 "url": "https://ec.europa.eu/eurostat"},
    "carto": {"name": "CARTO basemap, OpenStreetMap data", "licence": "see site",
              "url": "https://carto.com/attributions"},
    "unesco": {"name": "UNESCO World Heritage Centre", "licence": "WHC terms of use",
               "url": "https://whc.unesco.org/en/list/"},
    "power": {"name": "NASA POWER project (climate normals)",
              "licence": "US Government work",
              "url": "https://power.larc.nasa.gov"},
}


def compose_credits(sections, designations=None):
    used = {"carto": "map"}
    if any(d.get("kind", "").startswith("unesco") for d in designations or []):
        used["unesco"] = "designations"
    if (sections.get("when") or {}).get("normals"):
        used["power"] = "climate normals"
    if sections.get("parking") or (sections.get("nearby") or {}).get("trails"):
        used["osm"] = "parking, trails"
    if sections.get("highlights"):
        used["opentripmap"] = "highlights"
        used["wikidata"] = "facts"
    if (sections.get("intro") or {}).get("body"):
        used["wikivoyage"] = "description"
    if sections.get("gallery"):
        used["commons"] = "photographs"
    if sections.get("water"):
        used["eea"] = "bathing water"
    if (sections.get("when") or {}).get("crowding"):
        used["eurostat"] = "crowding"
    if sections.get("festivals"):
        used["wikidata"] = "highlights, festivals"
    out = []
    for key, used_for in used.items():
        d = dict(CREDIT_DEFS[key])
        d["key"] = key
        d["used_for"] = used_for
        out.append(d)
    return out


# ---------------------------------------------------------------- context


def load_layer_index():
    """One GridIndex per feature layer across every country file."""
    index = {}

    def add(layer, cc, rows):
        idx = index.setdefault(layer, GridIndex())
        for r in rows:
            if isinstance(r.get("lat"), (int, float)) and isinstance(
                    r.get("lon"), (int, float)):
                idx.add(r["lat"], r["lon"], r)

    for layer, list_key in (("beaches", "beaches"), ("lakes", "lakes"),
                            ("mountains", "mountains")):
        folder = os.path.join(PUB, layer)
        if not os.path.isdir(folder):
            continue
        for fn in os.listdir(folder):
            if not re.fullmatch(r"[A-Z]{2}\.json", fn):
                continue
            data = load_json(os.path.join(folder, fn), {})
            rows = []
            for f in data.get(list_key, []):
                img = (f.get("images") or [{}])[0]
                # The beaches wire gives `water` as a string ("Excellent");
                # the lakes wire gives a dict. Normalise here so nothing
                # downstream can interpolate a Python repr into a sentence.
                water = f.get("water")
                if isinstance(water, dict):
                    water = water.get("class") or water.get("rating")
                rows.append({
                    "cc": fn[:2], "id": f.get("id"), "name": f.get("name"),
                    "lat": f.get("lat"), "lon": f.get("lon"),
                    "tier": f.get("tier"), "score": f.get("score"),
                    "thumb": img.get("u"),
                    "elev_m": f.get("elev_m"),
                    "water": water if isinstance(water, str) else None,
                })
            add(layer, fn[:2], rows)

    folder = os.path.join(PUB, "trails")
    if os.path.isdir(folder):
        for fn in os.listdir(folder):
            if not re.fullmatch(r"[A-Z]{2}\.json", fn):
                continue
            data = load_json(os.path.join(folder, fn), {})
            rows = []
            for t in data.get("trips", []):
                bbox = t.get("bbox") or []
                if len(bbox) != 4:
                    continue
                # A bare route number ("747") is a ref, not a name a reader
                # can do anything with; it has no place in a guide.
                if re.fullmatch(r"[\d\s./-]+", str(t.get("name") or "")):
                    continue
                lat = (bbox[1] + bbox[3]) / 2
                lon = (bbox[0] + bbox[2]) / 2
                img = t.get("img") or {}
                rows.append({
                    "cc": fn[:2], "id": str(t.get("id")), "name": t.get("name"),
                    "lat": lat, "lon": lon,
                    "tier": t.get("tier") or (3 if (t.get("score") or 0) >= 8 else 2),
                    "score": t.get("score"),
                    "thumb": img.get("u"),
                    "km_len": round((t.get("distance_m") or 0) / 1000, 1) or None,
                    "duration_min": t.get("duration_min"),
                    "difficulty": t.get("difficulty"),
                })
            add("trails", fn[:2], rows)
    return index


def load_context():
    print("loading wires...")
    app = load_json(os.path.join(PUB, "app_data.json"))
    dests = app["destinations"]
    acts = load_json(os.path.join(PUB, "activities_full.json"), {})
    wv = load_json(os.path.join(CACHE, "wikivoyage.json"), {})
    city_intros = load_json(os.path.join(DCACHE, "city_intros.json"), {}) or {}
    landmarks = load_json(os.path.join(DCACHE, "landmarks.json"), {}) or {}
    listings = load_json(os.path.join(CACHE, "wikivoyage_listings.json"), {})
    poi_wd = load_json(os.path.join(CACHE, "poi_wikidata.json"), {})
    parking = (load_json(os.path.join(CACHE, "parking_osm.json"), {}) or {}).get(
        "dests", {})
    routes = load_json(os.path.join(CACHE, "trips", "routes.json"), {})
    gonext = routes.get("gonext", {}) if isinstance(routes, dict) else {}

    destinfo = {}
    di_dir = os.path.join(PUB, "destinfo")
    if os.path.isdir(di_dir):
        for fn in os.listdir(di_dir):
            if re.fullmatch(r"[A-Z]{2}\.json", fn):
                d = load_json(os.path.join(di_dir, fn), {})
                destinfo[fn[:2]] = d.get("dests", {})

    trips_by_cc = {}
    tr_dir = os.path.join(PUB, "trips")
    if os.path.isdir(tr_dir):
        for fn in os.listdir(tr_dir):
            if re.fullmatch(r"[A-Z]{2}\.json", fn):
                d = load_json(os.path.join(tr_dir, fn), {})
                trips_by_cc[fn[:2]] = d.get("trips", [])

    dest_index = GridIndex()
    for d in dests.values():
        lat = d.get("city_lat", d.get("lat"))
        lon = d.get("city_lon", d.get("lon"))
        if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
            dest_index.add(lat, lon, d)

    print("indexing feature layers...")
    layer_index = load_layer_index()

    return {
        "dests": dests, "acts": acts, "wv": wv, "city_intros": city_intros,
        "landmarks": landmarks, "listings": listings,
        "poi_wd": poi_wd, "parking": parking, "gonext": gonext,
        "destinfo": destinfo, "trips_by_cc": trips_by_cc,
        "dest_index": dest_index, "layer_index": layer_index,
        "trip_model": _load_trip_model(), "tasl": TaslStore(),
        "meta": app.get("meta", {}),
    }


# ---------------------------------------------------------------- assemble


def canonical_hash(body):
    blob = json.dumps(body, sort_keys=True, ensure_ascii=False,
                      separators=(",", ":")).encode("utf-8")
    return "sha256:" + hashlib.sha256(blob).hexdigest()[:24]


def build_one(dest, ctx, refusal_log):
    did = dest["id"]
    items = ctx["acts"].get(did) or []
    refusals = []

    landmarks = ctx["landmarks"].get(did) or []
    wv_rec = ctx["listings"].get(did) if isinstance(ctx["listings"], dict) else None
    listed = {name_tokens(li["name"]) for li in (wv_rec or {}).get("listings", [])
              if li.get("name")}
    highlights, n_merged = resolve_highlights(
        dest, items + landmarks_as_items(landmarks), ctx["poi_wd"],
        listed=listed)
    nearby = join_nearby(dest, ctx["layer_index"])
    for h in highlights:
        if h.get("image"):
            attach_tasl(h["image"], ctx["tasl"], refusals)
            if not image_ok(h["image"]["url"], h["image"].get("w"),
                            h["image"].get("h")):
                h.pop("image")
    if nearby:
        for rows in nearby.values():
            for f in rows:
                if f.get("thumb"):
                    rec = ctx["tasl"].lookup(f["thumb"])
                    f["thumb_ok_print"] = bool(rec) and licence_verdict(
                        rec.get("licence"), rec.get("author")) == "ok"

    gallery = compose_gallery(dest, highlights, nearby, ctx["tasl"], refusals,
                              landmarks=landmarks)
    intro = compose_intro(dest, ctx["wv"], ctx["city_intros"])
    events = (ctx["destinfo"].get(dest.get("iso2"), {}).get(did) or {}).get(
        "events") or []
    research = load_json(os.path.join(
        DCACHE, "research", dossier_file_base(did) + ".json"))
    do = compose_do(dest, items, highlights, nearby, ctx["listings"], events,
                    ctx["poi_wd"], research, landmarks=landmarks)
    trips = compose_trips(dest, ctx)
    parking = compose_parking(dest, ctx["parking"].get(did))

    # Festivals get a section of their own rather than a footnote under the
    # climate strip: "when is it" is the whole reason a reader cares, and a
    # list with no month answers nothing. Undated events are kept but sorted
    # last, and the renderers say "date varies" instead of implying one.
    festivals = []
    for e in sorted(events or [], key=lambda x: (
            0 if x.get("months") else 1, -(x.get("links") or 0)))[:8]:
        if not e.get("name"):
            continue
        row = {"name": e["name"]}
        if e.get("months"):
            row["months"] = e["months"]
        if e.get("desc"):
            row["what"] = e["desc"]
        if e.get("km") is not None:
            row["km"] = e["km"]
        url = e.get("web") or e.get("wp")
        if url:
            row["url"] = url
        if e.get("links"):
            row["fame"] = e["links"]
        festivals.append(row)

    when = {}
    cl = dest.get("climate") or {}
    if cl.get("m"):
        when["normals"] = cl["m"]
    if cl.get("best"):
        when["best"] = cl["best"]
    crowd = dest.get("crowding") or {}
    if crowd.get("tier") is not None:
        when["crowding"] = {k: crowd[k] for k in ("tier", "label", "year")
                            if crowd.get(k) is not None}
    water = None
    bw = dest.get("bathing_water") or {}
    if bw.get("rating"):
        water = {k: bw[k] for k in ("rating", "excellent_pct", "n_sites",
                                    "nearest", "year") if bw.get(k) is not None}

    # D2: the verdict, shown honestly - the score, its parts, its
    # confidence, and where the place stands in its country. The earlier
    # brief hid the rating from this page; PLAN.md D2 reverses that call.
    r = dest.get("rating") or {}
    verdict = None
    if r.get("score") is not None:
        verdict = {k: r[k] for k in
                   ("score", "tier", "label", "hidden_gem", "confidence",
                    "inputs_present", "components") if r.get(k) is not None}
        for k in ("country_rank", "country_n", "country_badge",
                  "country_percentile", "class_percentile"):
            if dest.get(k) is not None:
                verdict[k] = dest[k]

    # D3: where to sleep - the neighbourhood prices the wire always carried
    # and no renderer ever spent, cheapest first, plus the tiers and the
    # 12-month price curve.
    ac = dest.get("accommodation") or {}
    sleep = {}
    if ac.get("neighbourhoods"):
        sleep["neighbourhoods"] = sorted(
            ac["neighbourhoods"],
            key=lambda n: n.get("night_eur") if n.get("night_eur") is not None else 1e9,
        )[:8]
    for k in ("per_person_night_eur", "seasonality", "tiers"):
        if ac.get(k):
            sleep[k] = ac[k]

    # D7: the members B1 attached, passed through for the parent page.
    members = [{k: m[k] for k in ("name", "lat", "lon", "desc", "wiki",
                                  "visit_h") if m.get(k) is not None}
               for m in dest.get("members") or []] or None

    sections = {
        "verdict": verdict,
        "sleep": sleep or None,
        "members": members,
        "gallery": gallery or None,
        "intro": intro,
        "highlights": highlights or None,
        "do": do or None,
        "nearby": nearby,
        "trips": trips,
        "when": when or None,
        "festivals": festivals or None,
        "water": water,
        "parking": parking,
        "practical": compose_practical(dest),
    }
    tips = compose_tips(dest, sections)
    if tips:
        sections["tips"] = tips
    sections = {k: v for k, v in sections.items() if v}
    # Designations, ordered by weight: a World Heritage listing is a reason to
    # come, a market-town charter is a footnote. Capped so the place block
    # stays a header, not a trophy cabinet.
    DESIG_RANK = {"unesco_whc": 0, "national_park": 1, "beautiful_village": 2,
                  "heritage_town": 3, "capital_of_culture": 4,
                  "unesco_tentative": 5, "spa_town": 6, "market_town": 7}
    desigs = sorted((dest.get("designations") or []),
                    key=lambda g: DESIG_RANK.get(g.get("kind"), 9))[:3]
    desigs = [{"kind": g.get("kind"), "name": g.get("name")}
              for g in desigs if g.get("kind")]
    sections["credits"] = compose_credits(sections, desigs)

    body = {
        "id": did,
        "slug": slugify(dest.get("country", "")) + "/" + slugify(dest.get("city", "")),
        "schema": SCHEMA,
        "place": {
            "name": dest.get("city"), "country": dest.get("country"),
            "iso2": dest.get("iso2"),
            "class": (dest.get("place") or {}).get("class"),
            "lat": dest.get("city_lat", dest["lat"]),
            "lon": dest.get("city_lon", dest["lon"]),
            "visit_h": (dest.get("place") or {}).get("visit_h"),
            "categories": dest.get("categories") or [],
            **({"designations": desigs} if desigs else {}),
        },
        **sections,
    }
    body = sanitize_strings(body)
    body["content_hash"] = canonical_hash(
        {k: v for k, v in body.items() if k != "content_hash"})
    if refusals:
        refusal_log[did] = refusals
    stats = {
        "gallery": len(gallery or []),
        "gallery_print": sum(1 for g in gallery or [] if g.get("ok_print")),
        "highlights": len(highlights or []),
        "merged": n_merged,
        "do": len(do or []),
        "trips": len(trips or []) if trips else 0,
        "nearby": sum(len(v) for v in (nearby or {}).values()),
    }
    return body, stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cc")
    ap.add_argument("--only")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--limit", type=int)
    args = ap.parse_args()
    if not (args.cc or args.only or args.all):
        ap.error("pass --cc, --only or --all")

    ctx = load_context()
    dests = ctx["dests"]
    todo = []
    for did, d in dests.items():
        if args.only and did != args.only:
            continue
        if args.cc and d.get("iso2") != args.cc.upper():
            continue
        todo.append(d)
    if args.limit:
        todo = todo[: args.limit]
    print(f"building {len(todo)} dossiers...")

    os.makedirs(OUT_DIR, exist_ok=True)
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    refusal_log = {}
    index_path = os.path.join(OUT_DIR, "index.json")
    index = load_json(index_path, {}) or {}
    entries = index.get("dests", {})
    agg = Counter()
    for i, d in enumerate(todo):
        body, stats = build_one(d, ctx, refusal_log)
        base = dossier_file_base(d["id"])
        prev = entries.get(d["id"])
        if not prev or prev.get("h") != body["content_hash"]:
            body["built_at"] = now
            atomic_write_json(os.path.join(OUT_DIR, base + ".json"), body)
            entries[d["id"]] = {"f": base, "h": body["content_hash"]}
            agg["written"] += 1
        for k, v in stats.items():
            agg[k] += v
        agg["n"] += 1
        if (i + 1) % 200 == 0:
            print(f"  {i + 1}/{len(todo)}")

    atomic_write_json(index_path, {
        "generated_at": now, "schema": SCHEMA, "n": len(entries),
        "dests": entries,
    }, indent=0)
    os.makedirs(REPORTS, exist_ok=True)
    atomic_write_json(os.path.join(REPORTS, "dossier_build.json"), {
        "generated_at": now,
        "built": agg["n"], "written": agg["written"],
        "avg_gallery": round(agg["gallery"] / max(agg["n"], 1), 2),
        "avg_gallery_print": round(agg["gallery_print"] / max(agg["n"], 1), 2),
        "avg_highlights": round(agg["highlights"] / max(agg["n"], 1), 2),
        "merged_duplicates": agg["merged"],
        "avg_do": round(agg["do"] / max(agg["n"], 1), 2),
        "n_with_licence_refusals": len(refusal_log),
        "refusals_sample": dict(list(refusal_log.items())[:20]),
    }, indent=1)
    print(f"done: {agg['n']} built, {agg['written']} written, "
          f"{agg['merged']} duplicate highlights merged, "
          f"avg gallery {agg['gallery'] / max(agg['n'], 1):.1f} "
          f"(print-clean {agg['gallery_print'] / max(agg['n'], 1):.1f})")


if __name__ == "__main__":
    main()
