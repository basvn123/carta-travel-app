"""augment_wikidata.py - the national sweep, so the famous ones can not be missed.

Stage 2b of the natural-features pipeline. Stage 1 builds its spine from the
app's POI layer, and that layer was harvested in a radius around the 1,570
priced destinations. It is therefore a sweep around towns, not a sweep of a
country, and the per-country review found exactly the hole that implies: the
United Kingdom's file has Glastonbury Tor but no Snowdon, Ireland has three
rows for one Kerry massif but no Carrauntoohil, Iceland has a Reykjavik street
in the mountain layer but neither Hekla nor Kirkjufell. Measured, no feature in
those four countries sits further than 11.8 km from a catalogue town, which is
the shape of the bug rather than the shape of the countries.

enrich_wikidata.py already asks the query service, per country, for every item
of the kind's class tree that carries coordinates. That answer is a national
inventory and it is sitting in cache/features_wikidata.json unused beyond
matching. This stage adds the notable rows it holds that the POI spine never
saw, so the mountain of a country is in the country's file whether or not a
budget airline flies near it.

What gets added, and what does not. Wikidata knows about a quarter of a million
European summits, and shipping them all would bury the ones that matter, so a
row must clear a notability floor built from evidence rather than height alone:

    mountain   5+ sitelinks, or 500 m of prominence, or 1500 m with a photo
               and 2 sitelinks
    beach      3+ sitelinks, or a photo and 2 sitelinks

then a per-country cap, applied on the same evidence, so a research-heavy
country cannot swamp the tab. Everything added carries provenance.spine
"wikidata_sweep" so the wire can always say where a row came from, and runs
through the same filters and the same joins (bathing water, protected areas,
nearest priced city) as the POI spine.

Reads   data/derived/features_raw.json, cache/features_wikidata.json
Writes  data/derived/features_raw.json (in place), plus a report of what it
        added to data/reports/features_sweep.json

Usage:
    python pipeline/features/augment_wikidata.py
    python pipeline/features/augment_wikidata.py --country GB,IE --verbose
    python pipeline/features/augment_wikidata.py --dry
"""
import argparse
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone

from features_common import (APP_DATA, RAW_FEATURES, REPORTS,
                             WIKIDATA_FEATURE_CACHE, blank_feature,
                             catalogue_countries, country_at, feature_id,
                             haversine_km, load_json, log, name_core, save_json)
from build_features import (dest_index, designations_of, gate_reason,
                            protected_index, romanise, water_index,
                            NEAR_DEST_KM, WATER_KM)
from validate_features import country_boxes, outside_box
from filters import apply_filters

SWEEP_REPORT = REPORTS / "features_sweep.json"

# How close a swept row has to be to an existing feature before it is treated
# as the same thing. Tighter than the POI dedupe because both sides carry real
# coordinates here, not a POI centroid.
SAME_KM = 1.2
SAME_NAME_KM = 3.0

# Per-country ceilings. A country's tab shows tiers 1 and 2; anything past a
# few hundred rows is tail the ranking will bury anyway, and every extra row
# costs an image lookup.
CAP = {"mountain": 400, "beach": 300}

PROTECTED_KM = 5.0


def notable(kind, row):
    """The floor. Evidence, not height: a 3,000 m unnamed shoulder nobody has
    ever written about is not a place to send somebody."""
    sl = row.get("sl") or 0
    ele = row.get("ele") or 0
    prom = row.get("prom") or 0
    img = bool(row.get("img"))
    if kind == "mountain":
        return sl >= 5 or prom >= 500 or (ele >= 1500 and img and sl >= 2)
    return sl >= 3 or (img and sl >= 2)


def evidence(kind, row):
    """Ordering for the per-country cap: the same evidence the floor uses."""
    sl = row.get("sl") or 0
    prom = row.get("prom") or 0
    ele = row.get("ele") or 0
    return (sl * 10) + (prom / 100.0) + (ele / 1000.0) + (2 if row.get("img") else 0)


def row_name(row, langs):
    """Prefer the local language, fall back to English, then anything. The
    review asked for local names: Jungfrau, not "Jungfrau mountain"."""
    names = row.get("names") or {}
    for lang in langs:
        if names.get(lang):
            return names[lang]
    return row.get("en") or names.get("en") or next(iter(names.values()), None)


def existing_index(features):
    """(iso2, kind) -> list of features, plus the set of QIDs already held."""
    by_key = defaultdict(list)
    qids = set()
    for f in features:
        by_key[(f["iso2"], f["kind"])].append(f)
        if f.get("wikidata"):
            qids.add(f["wikidata"])
    return by_key, qids


def already_present(row, kind, iso2, by_key):
    """True when the sweep row is a feature we already carry, by position or by
    name plus proximity. Name alone is never enough: the Faroes have two
    mountains called Heyggjurin Mikli 60 km apart."""
    core = name_core(row.get("_name") or "")
    for f in by_key.get((iso2, kind), ()):
        km = haversine_km(row["lat"], row["lon"], f["lat"], f["lon"])
        if km <= SAME_KM:
            return f
        if km <= SAME_NAME_KM and core and core == name_core(f["name"]):
            return f
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--country", help="ISO2 list, default all")
    ap.add_argument("--dry", action="store_true", help="report, write nothing")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    doc = load_json(RAW_FEATURES)
    if not doc:
        log("no data/derived/features_raw.json, run build_features.py first")
        return 1
    features = doc["features"]
    cache = load_json(WIKIDATA_FEATURE_CACHE) or {}
    tiles = cache.get("tiles") or {}
    if not tiles:
        log("no cached Wikidata sweep, run enrich_wikidata.py first")
        return 1

    countries = catalogue_countries(load_json(APP_DATA) or {})
    want = {c.strip().upper() for c in args.country.split(",")} if args.country else None

    water = water_index()
    prot = protected_index()
    dests = (load_json(APP_DATA) or {}).get("destinations") or {}
    cities = dest_index(dests)
    boxes = country_boxes(dests)
    by_key, held_qids = existing_index(features)
    # Every id the spine has already handed out. A swept feature may not
    # take one of them: the image ledger is keyed by id, so a collision
    # does not just fail the gate, it hands one mountain another's photo.
    used_ids = {f["id"] for f in features}

    # Local language per country, for the name choice. The catalogue does not
    # carry it, so the sweep uses the languages Wikidata returned for the
    # country's own items, most common first.
    lang_pref = defaultdict(Counter)
    for key, tile in tiles.items():
        iso2 = key.split("|")[0]
        for row in tile.get("rows", []):
            for lang in (row.get("names") or {}):
                lang_pref[iso2][lang] += 1

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    candidates = defaultdict(list)
    seen_q = set()
    for key, tile in tiles.items():
        parts = key.split("|")
        if len(parts) < 2:
            continue
        iso2, kind = parts[0], parts[1]
        if kind not in ("beach", "mountain"):
            continue
        if want and iso2 not in want:
            continue
        if iso2 not in countries:
            continue
        for row in tile.get("rows", []):
            q = row.get("q")
            if not q or q in held_qids or q in seen_q:
                continue
            if row.get("lat") is None or row.get("lon") is None:
                continue
            if not notable(kind, row):
                continue
            seen_q.add(q)
            candidates[(iso2, kind)].append(row)

    added, skipped = [], Counter()
    for (iso2, kind), rows in sorted(candidates.items()):
        langs = [lang for lang, _ in lang_pref[iso2].most_common(4)]
        rows.sort(key=lambda r: evidence(kind, r), reverse=True)
        kept = 0
        for row in rows:
            if kept >= CAP[kind]:
                skipped["over_cap"] += 1
                continue
            name = row_name(row, langs)
            if not name:
                skipped["no_name"] += 1
                continue
            row["_name"] = name
            # The coordinate decides the country, exactly as the border fix in
            # build_features does: a Wikidata item filed under a country can
            # still sit across the line.
            actual = country_at(row["lat"], row["lon"])
            if actual and actual != iso2:
                skipped["other_country"] += 1
                continue
            if not actual and boxes.get(iso2) and outside_box(
                    {"lat": row["lat"], "lon": row["lon"]}, boxes[iso2]):
                # No polygon answered, which is normal just offshore, but the
                # coarse box still has to agree. Gibraltar is not in the
                # shapes, so without this two of its beaches shipped as GB.
                skipped["outside_box"] += 1
                continue
            twin = already_present(row, kind, iso2, by_key)
            if twin is not None:
                # The sweep knows things the POI spine did not: a QID, a
                # height, a prominence. Give them to the row we already have.
                if not twin.get("wikidata"):
                    twin["wikidata"] = row["q"]
                if kind == "mountain":
                    if twin.get("elevation_m") is None and row.get("ele"):
                        twin["elevation_m"] = row["ele"]
                    if twin.get("prominence_m") is None and row.get("prom"):
                        twin["prominence_m"] = row["prom"]
                sig = twin.setdefault("signals", {})
                if (row.get("sl") or 0) > (sig.get("sitelinks") or 0):
                    sig["sitelinks"] = row["sl"]
                skipped["already_held"] += 1
                continue

            f = blank_feature(kind, iso2, countries[iso2], name,
                              row["lat"], row["lon"])
            base = feature_id(kind, iso2, romanise(name))
            fid, n = base, 1
            while fid in used_ids:
                n += 1
                fid = f"{base}-{n}"
            f["id"] = fid
            f["wikidata"] = row["q"]
            if (row.get("names") or {}).get("en") and row["names"]["en"] != name:
                f["wikipedia"] = f"en:{row['names']['en']}"
            f["name_local"] = name
            if kind == "mountain":
                f["elevation_m"] = row.get("ele")
                f["prominence_m"] = row.get("prom")
            f["signals"] = {
                "poi_rate": 0,
                "has_wiki": bool(row.get("sl")),
                "pageviews": None,
                "sitelinks": row.get("sl"),
                "commons_assessed": False,
            }
            f["sources"] = [{"name": "Wikidata", "url": f"https://www.wikidata.org/wiki/{row['q']}"}]
            f["provenance"] = {"spine": "wikidata_sweep", "harvested": stamp,
                               "p18": row.get("img")}

            # Same joins as the POI spine, so a swept row is not a second-class
            # citizen in the ranking.
            if kind == "beach":
                km, site = water.nearest(f["lat"], f["lon"], WATER_KM)
                if site:
                    f["water"] = {"class": site.get("class"), "site": site.get("name"),
                                  "dist_km": round(km, 2), "year": site.get("year"),
                                  "profile_url": site.get("url")}
            hits = prot.near(f["lat"], f["lon"], PROTECTED_KM)
            if hits:
                km, area = hits[0]
                f["protected"] = {"name": area.get("name"), "kind": area.get("kind"),
                                  "dist_km": round(km, 2),
                                  "wikidata": area.get("wikidata")}
                f["designations"] = designations_of(hits)
            km, c = cities.nearest(f["lat"], f["lon"], NEAR_DEST_KM)
            if c:
                f["near"] = {"dest_id": c["id"], "city": c["city"], "km": round(km, 1)}
            else:
                # No priced city within 60 km: the wire's own rule says we can
                # not place it, so it is not shippable however famous it is.
                skipped["no_priced_city"] += 1
                continue

            # The POI spine asks this of every candidate it keeps; a swept
            # row is not exempt. It runs here, after the join, because the
            # settlement clause reads the destination record: without it a
            # monastery, a castle and a town shipped as summits.
            reason = gate_reason(kind, name, iso2,
                                 dests.get(f["near"]["dest_id"]) or {})
            if reason:
                skipped[f"gated_{reason}"] += 1
                continue

            used_ids.add(f["id"])
            by_key[(iso2, kind)].append(f)
            added.append(f)
            kept += 1

    # The same curation rules the POI spine gets: Wikidata has its own junk.
    if added:
        added, rep = apply_filters(added)
        skipped["filtered"] = len(rep["removed"]) + len(rep["merged"])

    log(f"sweep: {len(added)} features added, "
        f"{sum(skipped.values())} candidates skipped "
        f"({', '.join(f'{k} {v}' for k, v in skipped.most_common())})")

    by_country = Counter((f["iso2"], f["kind"]) for f in added)
    if args.verbose:
        for (iso2, kind), n in sorted(by_country.items()):
            names = [f["name"] for f in added
                     if f["iso2"] == iso2 and f["kind"] == kind][:6]
            log(f"  {iso2} {kind:<9} +{n:<4} {', '.join(names)}")

    if args.dry:
        log("(dry run, nothing written)")
        return 0

    doc["features"] = features + added
    doc["counts"] = doc.get("counts") or {}
    doc["counts"]["sweep_added"] = len(added)
    save_json(RAW_FEATURES, doc)
    save_json(SWEEP_REPORT, {
        "generated_at": stamp,
        "added": len(added),
        "skipped": dict(skipped),
        "per_country": {f"{k[0]}|{k[1]}": v for k, v in sorted(by_country.items())},
        "names": [{"iso2": f["iso2"], "kind": f["kind"], "name": f["name"],
                   "qid": f["wikidata"], "elevation_m": f.get("elevation_m"),
                   "sitelinks": (f.get("signals") or {}).get("sitelinks")}
                  for f in added],
    }, indent=1)
    log(f"wrote {RAW_FEATURES} ({len(doc['features'])} features) "
        f"and {SWEEP_REPORT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
