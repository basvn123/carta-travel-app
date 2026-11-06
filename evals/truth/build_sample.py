"""Build the truth set sample and the hand-verification sheet (T1144, ROADMAP D4).

    python -I evals/truth/build_sample.py            build sample.json and sheet.csv (keeps filled rows)
    python -I evals/truth/build_sample.py --check    exit 1 when a rebuild would change sample.json

The sample is a stratified draw from the shipped data in continent-app/public:

    100 places   strata: five European regions x three fame bands (v5 rating
                 band exceptional/excellent/very_good, good/pleasant, unrated);
                 proportional allocation, at least 3 per stratum
    25 trails    rated walks with a detail file; strata: grade group x length
                 band; proportional, at least 2 per stratum; at most 2 per country
    25 waters    13 rated beaches and 12 rated lakes; strata: kind x region;
                 proportional, at least 1 per stratum; at most 2 per country

Inside a stratum items are ordered by sha256(SEED + id) and the first k are
taken, so the draw is reproducible and does not move when other items are
added. Each item keeps its stratum and weight (stratum size / items drawn),
so the scorer can report a weighted accuracy next to the plain one.

Seeds. Answers that can be checked from the repo itself, from a cited source
field already in the data, are filled with status "seeded":
    place.country      the place's point inside the shipped country shapes
                       (continent-app/public/country_shapes.json)
    trail.distance_km  the OSM relation's distance tag (tags_raw.distance)
    trail.ascent_m     the OSM relation's ascent tag (tags_raw.ascent)
    trail.loop         the OSM relation's roundtrip tag (tags_raw.roundtrip)
Every other row is "unverified" until the owner fills it (GUIDE.md).
A rebuild keeps every row the owner touched (status verified, unverifiable or skip).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import run_truth as rt

SEED = "carta-truth-2026-11"
VERSION = "truth-sample/1"
N_PLACES, N_TRAILS, N_BEACHES, N_LAKES = 100, 25, 13, 12

REGIONS = {
    "north": "IS NO SE FI DK EE LV LT FO AX",
    "west": "GB IE FR BE NL LU MC",
    "central": "DE AT CH CZ PL SK HU SI LI",
    "south": "PT ES IT MT GR CY AD SM VA GI",
    "southeast": "HR BA RS ME MK AL BG RO MD UA TR XK",
}
REGION_OF = {cc: r for r, ccs in REGIONS.items() for cc in ccs.split()}

FIELDS = {
    "place": ["country", "coords", "population", "image_depicts", "blurb"],
    "trail": ["distance_km", "ascent_m", "loop", "difficulty", "trailhead", "summary"],
    "beach": ["coords", "name", "water_quality", "surface"],
    "lake": ["coords", "name", "water_quality", "swim", "area_km2"],
}
TEXT_FIELDS = {("place", "blurb"), ("trail", "summary")}


def h(s):
    return hashlib.sha256(f"{SEED}:{s}".encode()).hexdigest()


def region(cc):
    return REGION_OF.get(cc, "other")


def allocate(sizes, total, minimum):
    """Proportional allocation with a floor, largest remainder; never more than a stratum holds."""
    keys = [k for k, n in sizes.items() if n > 0]
    alloc = {k: min(minimum, sizes[k]) for k in keys}
    left = total - sum(alloc.values())
    if left < 0:
        raise ValueError("the floor is larger than the sample")
    room = {k: sizes[k] - alloc[k] for k in keys}
    pool = sum(room.values())
    if pool and left:
        raw = {k: left * room[k] / pool for k in keys}
        for k in keys:
            alloc[k] += min(int(raw[k]), room[k])
        rest = total - sum(alloc.values())
        for k in sorted(keys, key=lambda k: (-(raw[k] - int(raw[k])), k)):
            if rest <= 0:
                break
            if alloc[k] < sizes[k]:
                alloc[k] += 1
                rest -= 1
    return alloc


def draw(pool, strata_of, total, minimum, cap_per_country=None):
    strata = {}
    for it in pool:
        strata.setdefault(strata_of(it), []).append(it)
    sizes = {k: len(v) for k, v in strata.items()}
    alloc = allocate(sizes, total, minimum)
    picked = []
    per_cc = {}
    for k in sorted(alloc):
        got = 0
        for it in sorted(strata[k], key=lambda x: h(x["key"])):
            if got >= alloc[k]:
                break
            if cap_per_country and per_cc.get(it["cc"], 0) >= cap_per_country:
                continue
            per_cc[it["cc"]] = per_cc.get(it["cc"], 0) + 1
            it = {**it, "stratum": k, "stratum_size": sizes[k], "drawn_in_stratum": alloc[k],
                  "weight": round(sizes[k] / alloc[k], 3)}
            picked.append(it)
            got += 1
    return picked


# ---------------------------------------------------------------- pools

def place_pool(wire):
    out = []
    for pid, v in wire.places().items():
        band = (v.get("rating") or {}).get("band")
        fame = "top" if band in ("exceptional", "excellent", "very_good") else ("mid" if band else "unrated")
        out.append({"key": f"place:{pid}", "kind": "place", "ref": pid, "cc": v.get("iso2"),
                    "name": v.get("city"), "_strat": (region(v.get("iso2")), fame)})
    return out


def trail_pool(public):
    out = []
    for path in sorted((public / "trails").glob("[A-Z][A-Z].json")):
        blob = rt.load_json(path, {}) or {}
        for r in blob.get("trips") or []:
            if r.get("category") != "hike" or not r.get("v5"):
                continue
            if not (public / "trails" / "trip" / f"{r['id']}.json").exists():
                continue
            g = r.get("difficulty") or "unknown"
            grade = "easy" if g in ("easy", "moderate") else ("hard" if g == "hard" else "steep")
            km = (r.get("distance_m") or 0) / 1000
            length = "short" if km < 10 else ("mid" if km < 20 else "long")
            out.append({"key": f"trail:{r['id']}", "kind": "trail", "ref": str(r["id"]), "cc": r.get("country") or path.stem,
                        "name": r.get("name"), "_strat": (grade, length)})
    return out


def water_pool(public, folder, key, kind):
    out = []
    for path in sorted((public / folder).glob("[A-Z][A-Z].json")):
        blob = rt.load_json(path, {}) or {}
        for r in blob.get(key) or []:
            out.append({"key": f"{kind}:{r['id']}", "kind": kind, "ref": str(r["id"]), "cc": r.get("cc") or path.stem,
                        "name": r.get("name"), "_strat": (kind, region(r.get("cc") or path.stem))})
    return out


# ---------------------------------------------------------------- seeds

def point_in_ring(lon, lat, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def load_shapes(public):
    blob = rt.load_json(public / "country_shapes.json", {}) or {}
    shapes = []
    for f in blob.get("features") or []:
        g = f.get("geometry") or {}
        polys = g.get("coordinates") or []
        if g.get("type") == "Polygon":
            polys = [polys]
        shapes.append((f["properties"].get("iso2"), polys))
    return shapes


def country_at(shapes, lat, lon, buffer_deg=0.05):
    """The one country whose shape holds the point and the four points about
    5 km around it, or None (near a border the simplified shapes are not
    a source)."""
    found = {_country_at(shapes, lat + dy, lon + dx) for dy, dx in ((0, 0), (buffer_deg, 0), (-buffer_deg, 0), (0, buffer_deg), (0, -buffer_deg))}
    return found.pop() if len(found) == 1 else None


def _country_at(shapes, lat, lon):
    hits = []
    for iso2, polys in shapes:
        for poly in polys:
            if poly and point_in_ring(lon, lat, poly[0]) and not any(point_in_ring(lon, lat, hole) for hole in poly[1:]):
                hits.append(iso2)
                break
    return hits[0] if len(hits) == 1 else None


def osm_number(v):
    if v is None:
        return None
    s = str(v).strip().lower().replace(",", ".")
    m = re.match(r"^(\d+(?:\.\d+)?)\s*(km|m)?$", s)
    if not m:
        return None
    return float(m.group(1)), m.group(2)


def seeds_for(item, rec, shapes):
    """{field: (value, source, evidence)} for the answers the repo can check."""
    out = {}
    if rec is None:
        return out
    if item["kind"] == "place":
        lat, lon = rec.get("city_lat") or rec.get("lat"), rec.get("city_lon") or rec.get("lon")
        if lat is not None and lon is not None:
            cc = country_at(shapes, lat, lon)
            if cc:
                out["country"] = (cc, "continent-app/public/country_shapes.json", f"the point {lat}, {lon} and 5 km around it lie inside the {cc} shape")
    if item["kind"] == "trail":
        tags = (rec.get("_detail") or {}).get("tags_raw") or {}
        d = osm_number(tags.get("distance"))
        if d:
            km = d[0] / 1000 if d[1] == "m" else d[0]
            out["distance_km"] = (f"{km:g}", "osm tags_raw.distance", f"distance={tags['distance']}")
        a = osm_number(tags.get("ascent"))
        if a and a[1] != "km":
            out["ascent_m"] = (f"{a[0]:g}", "osm tags_raw.ascent", f"ascent={tags['ascent']}")
        rtag = str(tags.get("roundtrip") or "").strip().lower()
        if rtag in ("yes", "no"):
            out["loop"] = (rtag, "osm tags_raw.roundtrip", f"roundtrip={rtag}")
    return out


def source_url(item, rec, field):
    if rec is None:
        return ""
    k = item["kind"]
    if k == "place":
        if field == "blurb" and (rec.get("guide") or {}).get("url"):
            return rec["guide"]["url"]
        return (rec.get("image") or {}).get("page") or ""
    if k == "trail":
        osm = rec.get("osm")
        return f"https://www.openstreetmap.org/relation/{osm}" if osm else ""
    if k == "beach" and field == "water_quality":
        return "https://www.eea.europa.eu/en/topics/in-depth/bathing-water"
    if k == "lake" and field == "water_quality":
        return "https://www.eea.europa.eu/en/topics/in-depth/bathing-water"
    osm = rec.get("osm")
    if osm:
        return f"https://www.openstreetmap.org/{osm}"
    m = re.search(r"-(Q\d+)$", item["ref"])
    if m:
        return f"https://www.wikidata.org/wiki/{m.group(1)}"
    return f"https://www.openstreetmap.org/?mlat={rec.get('lat')}&mlon={rec.get('lon')}#map=16/{rec.get('lat')}/{rec.get('lon')}"


# ---------------------------------------------------------------- build

def build(public=rt.PUBLIC):
    public = Path(public)
    wire = rt.Wire(public)
    places = draw(place_pool(wire), lambda it: "/".join(it["_strat"]), N_PLACES, 3)
    trails = draw(trail_pool(public), lambda it: "/".join(it["_strat"]), N_TRAILS, 2, cap_per_country=2)
    beaches = draw(water_pool(public, "beaches", "beaches", "beach"), lambda it: "/".join(it["_strat"]), N_BEACHES, 1, cap_per_country=2)
    lakes = draw(water_pool(public, "lakes", "lakes", "lake"), lambda it: "/".join(it["_strat"]), N_LAKES, 1, cap_per_country=2)
    items = []
    for it in places + trails + beaches + lakes:
        it = {k: v for k, v in it.items() if not k.startswith("_")}
        it["item_id"] = it.pop("key")
        items.append(it)
    gen = (rt.load_json(public / "app_data.json", {}) or {}).get("meta", {}).get("generated_at")
    sample = {
        "version": VERSION, "seed": SEED, "built_from": "continent-app/public", "wire_generated_at": gen,
        "counts": {"place": len(places), "trail": len(trails), "beach": len(beaches), "lake": len(lakes)},
        "strata": {k: sorted({it["stratum"] for it in items if it["kind"] == k}) for k in ("place", "trail", "beach", "lake")},
        "items": items,
    }
    return sample, wire


def sheet_rows(sample, wire, old_rows=None):
    shapes = load_shapes(wire.public)
    keep = {}
    for r in old_rows or []:
        if (r.get("status") or "").strip().lower() in ("verified", "unverifiable", "skip"):
            keep[(r["item_id"], r["field"])] = r
    rows = []
    for it in sample["items"]:
        rec = wire.record(it)
        seeds = seeds_for(it, rec, shapes)
        for f in FIELDS[it["kind"]]:
            if (it["item_id"], f) in keep:
                rows.append(keep[(it["item_id"], f)])
                continue
            cur = rt.current_value(it["kind"], f, rec)
            row = {"item_id": it["item_id"], "kind": it["kind"], "name": it["name"] or "", "cc": it["cc"] or "",
                   "field": f, "current_value": rt.display(cur), "verified_value": "", "status": "unverified",
                   "source_url": source_url(it, rec, f), "evidence": "", "text_sha": "", "by": "", "verified_on": "", "note": ""}
            if (it["kind"], f) in TEXT_FIELDS:
                if not cur:
                    row["status"] = "skip"
                    row["note"] = "no text shipped"
                else:
                    row["text_sha"] = rt.text_sha(cur)
            if f in seeds:
                v, src, ev = seeds[f]
                row.update(verified_value=v, status="seeded", evidence=f"{src}: {ev}", by="repo seed (T1144)")
            rows.append(row)
    return rows


# ---------------------------------------------------------------- text sample

JUDGE_DIR = rt.TRUTH_DIR / "judge"
TEXT_SAMPLE_PATH = JUDGE_DIR / "text-sample.json"
TEXT_KEY_PATH = JUDGE_DIR / "text-sample-key.json"
N_TEXT_PLACES, N_TEXT_TRAILS, N_PLANTED_EACH = 25, 25, 10
TRAIL_TAGS = ("name", "name:en", "ref", "from", "to", "roundtrip", "distance", "ascent", "descent", "operator",
              "network", "osmc:symbol", "description", "website", "wikidata", "sac_scale")


def trail_facts(rec):
    d = rec.get("_detail") or {}
    tags = d.get("tags_raw") or {}
    return {
        "name": rec.get("name"), "country": rec.get("country"),
        "distance_km": round((rec.get("distance_m") or 0) / 1000, 1), "ascent_m": rec.get("ascent_m"),
        "descent_m": rec.get("descent_m"), "is_loop": rec.get("is_loop"), "difficulty": rec.get("difficulty"),
        "sac_scale": d.get("sac_scale"), "network": d.get("network"), "waymark_ref": d.get("waymark_ref"),
        "osm_relation": rec.get("osm"),
        "osm_tags": {k: tags[k] for k in TRAIL_TAGS if k in tags},
        "named_along_the_way": [x.get("name") for x in (rec.get("reasons") or []) if x.get("name")],
    }


def plant_trail(text):
    m = re.search(r"(\d+(?:\.\d+)?) km", text)
    if m:
        wrong = round(float(m.group(1)) * 1.7 + 3, 1)
        return text[:m.start(1)] + f"{wrong:g}" + text[m.end(1):], f"distance changed from {m.group(1)} km to {wrong:g} km"
    if "starts and finishes at the same place" in text:
        return text.replace("starts and finishes at the same place", "runs from one village to another"), "loop claim flipped"
    return text + " It passes a famous glacier halfway.", "an invented glacier added"


def build_text_sample(sample, wire):
    """50 texts for the judge calibration: 25 place blurbs against their cited
    Wikivoyage text and the 25 sample trails' summaries against their OSM
    facts. In 10 of each a fault is planted (a wrong number, another place's
    blurb); which ones is in text-sample-key.json, which the human labeller
    and a session judge never open."""
    places = wire.places()
    sampled = [it["ref"] for it in sample["items"] if it["kind"] == "place"]
    pool = [pid for pid, v in places.items() if v.get("blurb") and (v.get("guide") or {}).get("text")]
    first = [pid for pid in sampled if pid in pool]
    rest = sorted((pid for pid in pool if pid not in first), key=lambda x: h(f"text:{x}"))
    chosen = (first + rest)[:N_TEXT_PLACES]
    plant_places = set(sorted(chosen, key=lambda x: h(f"plant:{x}"))[:N_PLANTED_EACH])
    donors = sorted(pool, key=lambda x: h(f"donor:{x}"))
    texts, key = [], {}
    for pid in chosen:
        v = places[pid]
        blurb, fault = v["blurb"], None
        if pid in plant_places:
            donor = next(d for d in donors if places[d]["iso2"] != v["iso2"] and places[d]["blurb"] != blurb)
            donors.remove(donor)
            blurb, fault = places[donor]["blurb"], f"blurb of {places[donor]['city']} ({donor})"
        texts.append({"ref": f"place:{pid}", "kind": "place_blurb", "subject": f"{v.get('city')}, {v.get('country')}",
                      "text": blurb, "source": {"cited": v["guide"]["url"], "text": v["guide"]["text"]}})
        key[f"place:{pid}"] = fault
    trails = [it for it in sample["items"] if it["kind"] == "trail" and (wire.record(it) or {}).get("summary")]
    if len(trails) < N_TEXT_TRAILS:
        seen = {it["ref"] for it in trails}
        extra = [it for it in sorted(trail_pool(wire.public), key=lambda x: h(f"text:{x['key']}")) if it["ref"] not in seen]
        for it in extra:
            if len(trails) >= N_TEXT_TRAILS:
                break
            it = {"item_id": it["key"], "kind": "trail", "ref": it["ref"], "cc": it["cc"], "name": it["name"]}
            if (wire.record(it) or {}).get("summary"):
                trails.append(it)
    trails = trails[:N_TEXT_TRAILS]
    plant_trails = set(sorted((it["ref"] for it in trails), key=lambda x: h(f"plant:{x}"))[:N_PLANTED_EACH])
    for it in trails:
        rec = wire.record(it)
        text, fault = rec.get("summary") or "", None
        if it["ref"] in plant_trails:
            text, fault = plant_trail(text)
        texts.append({"ref": it["item_id"], "kind": "trail_summary", "subject": rec.get("name"), "text": text,
                      "source": {"cited": f"https://www.openstreetmap.org/relation/{rec.get('osm')}", "facts": trail_facts(rec)}})
        key[it["item_id"]] = fault
    order = sorted(texts, key=lambda t: h(f"order:{t['ref']}"))
    for i, t in enumerate(order, 1):
        t["text_id"] = f"t{i:02d}"
    sample_out = {"version": "truth-text-sample/1", "seed": SEED, "n": len(order),
                  "items": [{"text_id": t["text_id"], **{k: v for k, v in t.items() if k != "text_id"}} for t in order]}
    key_out = {"version": "truth-text-sample/1", "note": "Do not open before labelling. planted: the fault planted in the text, or null for the shipped text.",
               "planted": {t["text_id"]: key[t["ref"]] for t in order}}
    return sample_out, key_out


def main(argv=None):
    ap = argparse.ArgumentParser(description="Build the truth set sample and sheet")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args(argv)
    sample, wire = build()
    text = json.dumps(sample, indent=1, ensure_ascii=False) + "\n"
    if a.check:
        same = rt.SAMPLE_PATH.exists() and rt.SAMPLE_PATH.read_text(encoding="utf-8") == text
        print("sample unchanged" if same else "a rebuild would change sample.json")
        return 0 if same else 1
    old = rt.read_sheet() if rt.SHEET_PATH.exists() else []
    rows = sheet_rows(sample, wire, old)
    rt.SAMPLE_PATH.write_text(text, encoding="utf-8")
    rt.write_sheet(rows)
    ts, tk = build_text_sample(sample, wire)
    JUDGE_DIR.mkdir(parents=True, exist_ok=True)
    TEXT_SAMPLE_PATH.write_text(json.dumps(ts, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    TEXT_KEY_PATH.write_text(json.dumps(tk, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"text sample: {ts['n']} texts, {sum(1 for v in tk['planted'].values() if v)} with a planted fault")
    st = {}
    for r in rows:
        st[r["status"]] = st.get(r["status"], 0) + 1
    print(f"{len(sample['items'])} items {sample['counts']}, {len(rows)} sheet rows {st}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
