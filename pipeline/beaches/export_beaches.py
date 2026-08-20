"""Stage 3: score the enriched beaches and publish the ones worth showing.

This is the gate. Everything upstream collects; this decides what a traveller
sees, and it is deliberately strict, because the promise on the tab is "the
most beautiful beaches in Europe" and a list padded with municipal strands
breaks that promise on the first screen.

A beach is published when all of these hold:

  it has photographs        at least MIN_IMAGES freely licensed pictures that
                            passed the relevance filter. A beach we cannot
                            show is a row of text, and the tab is not a
                            gazetteer.
  it has a real name        something beyond the local word for "beach". "Plage"
                            is not a destination.
  it clears the floor       MIN_SCORE on the beauty index, so the tail of
                            car park strands never reaches the wire.
  there is something to say at least one reason code. A beach with no
                            surface, no water reading, no article and no
                            ground survey is a name on a photograph.
  it is not a duplicate     of a better scoring beach 150 m up the same bay.

Then each country keeps its best PUBLISH_MAX. Countries whose whole list fails
the gate simply do not appear, which is exactly the behaviour the tab needs:
Andorra has no beaches and should not be offered as though it had ten.

The output is a produced work, not a database extract: selected, scored,
described through reason codes and cut to a few hundred rows a country. The
ODbL layer (OpenStreetMap tags) travels with its credit on every row that used
it, the same arrangement pipeline/trails/export_wire.py ships trails under.

Writes:
  continent-app/public/beaches/index.json   which countries have beaches
  continent-app/public/beaches/{CC}.json    the published beaches of one

Usage, from the repo root:
    python pipeline/beaches/export_beaches.py
    python pipeline/beaches/export_beaches.py --dry-run --verbose
    python pipeline/beaches/export_beaches.py --countries GR,HR
"""

import argparse
import json
import re
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from sources import haversine_km, load_cache  # noqa: E402
from harvest_beaches import COUNTRIES, name_tokens  # noqa: E402
import beauty_index as bi  # noqa: E402

ROOT = HERE.parents[1]
OUT_DIR = ROOT / "continent-app" / "public" / "beaches"

MIN_IMAGES = 2
MIN_SCORE = 5.6
PUBLISH_MAX = 120
DUPLICATE_KM = 0.15

# The Europe wide file the tab opens on. Capped per country on purpose: the
# raw top 240 of Europe is most of the Greek islands and a little of Croatia,
# which is a true ranking and a useless first page. Twelve a country makes it
# a tour of the continent, and typing a country's name still opens its full
# list.
TOP_N = 240
TOP_PER_COUNTRY = 12

ATTRIBUTION = {
    "wikidata": "Beach names and locations from Wikidata (CC0)",
    "osm": "Beach detail (c) OpenStreetMap contributors, ODbL",
    "eea": "Bathing water quality: European Environment Agency, WISE Bathing "
           "Water Directive data",
    "commons": "Photographs from Wikimedia Commons, each under the licence "
               "shown on the picture",
}


def clean_url(url):
    """Strip the Commons API's own tracking parameters.

    imageinfo hands back thumbnails with ?utm_source=commons.wikimedia.org
    stapled on. They are harmless in a browser and poison anywhere the URL is
    treated as a path: the hero image audit spliced a width into one of these
    and produced a 404, which is why every Commons URL in this repo gets its
    query string removed before it is stored (see the hero image notes)."""
    return str(url or "").split("?", 1)[0]


# Card width. NOT a free choice: upload.wikimedia.org now serves only a fixed
# list of thumbnail widths and answers anything else with a 400 and "Use
# thumbnail sizes listed on https://w.wiki/GHai". 640, 800 and 320 are all
# refused; 500 and 960 are not, and 500 is the width the rest of this repo
# already ships (the POI thumbnails). Changing it needs a curl, not an
# opinion.
CARD_PX = 500


def small_url(url):
    """A card sized variant of a Commons thumbnail.

    Commons thumbnails carry their width in the path, so the small twin of a
    1280 px thumb is a string edit rather than another API call. Anything that
    is not a thumb (an original small enough that the API did not scale it) is
    returned unchanged, which is correct: there is no smaller version to ask
    for, and the file is already small."""
    if not url or "/thumb/" not in url:
        return url
    return re.sub(r"/\d+px-", f"/{CARD_PX}px-", url, count=1)


def wire_images(beach):
    out = []
    for img in beach.get("images") or []:
        url = clean_url(img.get("url"))
        if not url:
            continue
        out.append({
            "u": small_url(url),
            "big": url,
            "w": img.get("w"),
            "h": img.get("h"),
            "by": (img.get("author") or "").strip(" ,;"),
            "lic": (img.get("license") or "").strip(),
            "licUrl": img.get("license_url") or "",
            "page": img.get("page") or "",
        })
    return out


def access_of(beach):
    """How you get there, and ONLY when something actually says so.

    A car park within 400 m used to count as road access. It does not: the car
    park above Navagio sits on the clifftop 200 m over a cove reachable only by
    boat, and the page told people to drive there. Proximity is not a route, so
    the parking stays in `services` (where "within a few minutes of the sand"
    is true) and this field answers only what the article states."""
    facts = set((beach.get("article") or {}).get("facts") or [])
    if "boat_only" in facts:
        return "boat"
    if "steps" in facts:
        return "steps"
    if "hike_in" in facts:
        return "hike"
    return ""


def services_of(beach):
    ctx = beach.get("context") or {}
    out = []
    if ctx.get("parking"):
        out.append("parking")
    if ctx.get("toilets"):
        out.append("toilets")
    if ctx.get("shower"):
        out.append("showers")
    if ctx.get("drinking_water"):
        out.append("water")
    if any(ctx.get(t) for t in ("cafe", "restaurant", "bar", "ice_cream")):
        out.append("food")
    if ctx.get("camp_site"):
        out.append("camping")
    return out


def wire_beach(beach, comps, score10, tier, reasons):
    tags = beach.get("osm_tags") or {}
    water = beach.get("water") or {}
    area = bi.protected_of(beach)
    base = beach.get("base") or {}
    wiki = beach.get("enwiki") or beach.get("localwiki") or ""
    row = {
        "id": bi.beach_id(beach),
        "name": beach["name"],
        "cc": beach["iso2"],
        "lat": beach["lat"],
        "lon": beach["lon"],
        "score": score10,
        "tier": tier,
        "comp": {k: round(v, 3) for k, v in comps.items()},
        "why": reasons[:bi.REASON_MAX],
        "tags": [r["k"] for r in bi.highlights_for(reasons)],
        "bestFor": bi.best_for(comps, reasons),
        "images": wire_images(beach),
        "src": beach.get("sources") or [],
    }
    if beach.get("name_local") and beach["name_local"] != beach["name"]:
        row["nameLocal"] = beach["name_local"]
    if beach.get("adm"):
        row["region"] = beach["adm"]
    surface = bi._surface_code(beach)
    if surface:
        row["surface"] = surface
    if 60 <= (beach.get("length_m") or 0) <= 30000:   # see reasons_for
        row["lengthM"] = int(beach["length_m"])
    if water.get("class"):
        row["water"] = {"class": water["class"], "site": water.get("site") or ""}
    if area.get("name"):
        row["protected"] = {"name": area["name"], "kind": area.get("kind") or "",
                            "np": bool(area.get("national_park"))}
    access = access_of(beach)
    if access:
        row["access"] = access
    services = services_of(beach)
    if services:
        row["services"] = services
    if tags.get("supervised") == "yes" or tags.get("lifeguard") == "yes":
        row["lifeguard"] = True
    if tags.get("nudism") in ("yes", "designated", "customary"):
        row["nudism"] = True
    if tags.get("wheelchair") in ("yes", "designated"):
        row["wheelchair"] = True
    if base.get("id"):
        row["base"] = {"id": base["id"], "city": base["city"], "km": base["km"]}
    if wiki:
        row["wiki"] = wiki
    if beach.get("wd"):
        row["wd"] = beach["wd"]
    if beach.get("osm_id"):
        row["osm"] = beach["osm_id"]
    credits = [ATTRIBUTION["wikidata"] if "wikidata" in row["src"] else None,
               ATTRIBUTION["osm"] if "osm" in row["src"] else None,
               ATTRIBUTION["eea"] if row.get("water") else None,
               ATTRIBUTION["commons"] if row["images"] else None]
    row["credit"] = [c for c in credits if c]
    return row


def publishable(beach):
    """The gate, minus the score (which needs the whole country first)."""
    if len(beach.get("images") or []) < MIN_IMAGES:
        return False
    if not name_tokens(beach.get("name")):
        return False
    return True


def country_water_default(beaches):
    """What an unmeasured beach in this country is worth: the median class of
    the beaches around it that DO have a reading. A country whose measured
    water is mostly Excellent should not punish the cove nobody sampled."""
    values = [bi.WATER_VALUE[b["water"]["class"]] for b in beaches
              if (b.get("water") or {}).get("class") in bi.WATER_VALUE]
    if len(values) < 5:
        return bi.WATER_DEFAULT
    return statistics.median(values)


def score_country(cc, verbose=False):
    rich = load_cache("rich", cc)
    if not rich or not rich.get("beaches"):
        return []
    beaches = rich["beaches"]
    water_default = country_water_default(beaches)
    fames = [bi.fame_raw(b) for b in beaches] or [1.0]
    country_max = max(fames) or 1.0
    scored = []
    for beach in beaches:
        comps, _score01, score10 = bi.score_beach(beach, country_max,
                                                  GLOBAL_MAX, water_default)
        scored.append((beach, comps, score10))
    return scored


def provenance(countries):
    """Which snapshot of each source this build stands on."""
    eea = ROOT / "cache" / "eea_bathing_water.json"
    out = {
        "eea_bathing_water": (
            datetime.fromtimestamp(eea.stat().st_mtime, timezone.utc)
            .isoformat(timespec="seconds") if eea.exists() else None),
        "harvested": {},
        "enriched": {},
    }
    for cc in countries:
        raw = load_cache("raw", cc)
        rich = load_cache("rich", cc)
        if raw and raw.get("harvested_at"):
            out["harvested"][cc] = raw["harvested_at"]
        if rich and rich.get("enriched_at"):
            out["enriched"][cc] = rich["enriched_at"]
    return out


def validate(rows):
    """The gate's own self-check, run over what is about to be written.

    The rules above decide what gets published; this decides whether the file
    is fit to ship at all. It is here rather than in a separate script for the
    same reason pipeline/features/validate_features.py is a separate one: that
    layer has six stages sharing one artifact and needs a verdict between two
    of them, while this one writes in a single pass and can simply refuse.

    Returns a list of failures. A non-empty list stops the export, because a
    beach with no credit or a broken image URL is worse than no beach."""
    bad = []
    seen = set()
    for row in rows:
        where = f"{row['cc']}/{row['id']}"
        if row["id"] in seen:
            bad.append(f"{where}: duplicate id")
        seen.add(row["id"])
        if not row["name"].strip():
            bad.append(f"{where}: no name")
        if not (0 <= row["score"] <= 10):
            bad.append(f"{where}: score {row['score']} is off the scale")
        if len(row["images"]) < MIN_IMAGES:
            bad.append(f"{where}: {len(row['images'])} images")
        for img in row["images"]:
            if not str(img.get("u", "")).startswith("https://"):
                bad.append(f"{where}: image is not https")
            if not img.get("lic"):
                bad.append(f"{where}: an image carries no licence")
        if not row["credit"]:
            bad.append(f"{where}: no attribution")
        if not row["why"]:
            bad.append(f"{where}: nothing to say about it (gate leak)")
        if not (-90 <= row["lat"] <= 90) or not (-180 <= row["lon"] <= 180):
            bad.append(f"{where}: coordinates off the earth")
    return bad


def dedupe(rows):
    """One row per beach, and one photograph per row.

    Two things get dropped here, both of which show up as the same beach twice
    in a list. The first is a row stage 1 could not merge: a Wikidata point
    150 m off the OSM polygon under a name that shares no token because one of
    them is transliterated.

    The second is subtler and comes from the photograph fallback. A cove with
    no file named after it borrows any Commons photograph taken within 300 m,
    which is right for a lone cove and wrong for Ksamil, where eight named
    beaches sit inside one bay and all eight end up with the same picture. So
    a lead photograph already used by a better scoring beach retires the row.
    The best of the cluster keeps the picture and the name; the rest were
    never going to be told apart on a card anyway."""
    kept, leads = [], set()
    for row in rows:
        lead = row["images"][0]["u"] if row["images"] else None
        if lead and lead in leads:
            continue
        if any(haversine_km(row["lat"], row["lon"], other["lat"], other["lon"])
               <= DUPLICATE_KM for other in kept):
            continue
        if lead:
            leads.add(lead)
        kept.append(row)
    return kept


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--countries", default="")
    parser.add_argument("--out", default=str(OUT_DIR))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--min-score", type=float, default=MIN_SCORE)
    parser.add_argument("--max-per-country", type=int, default=PUBLISH_MAX)
    args = parser.parse_args()

    wanted = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    countries = wanted or COUNTRIES

    # The Europe wide fame ceiling has to be known before any country can be
    # scored, so fame is read once over everything that was enriched.
    global GLOBAL_MAX
    GLOBAL_MAX = 1.0
    pools = {}
    for cc in countries:
        rich = load_cache("rich", cc)
        if not rich or not rich.get("beaches"):
            continue
        pools[cc] = rich["beaches"]
        for beach in rich["beaches"]:
            GLOBAL_MAX = max(GLOBAL_MAX, bi.fame_raw(beach))

    out_dir = Path(args.out)
    generated = datetime.now(timezone.utc).isoformat(timespec="seconds")
    index = []
    published = []
    by_country = {}
    total = 0
    credits = set()

    for cc in countries:
        if cc not in pools:
            continue
        scored = score_country(cc, args.verbose)
        rows = []
        for beach, comps, score10 in sorted(scored, key=lambda t: -t[2]):
            if score10 < args.min_score or not publishable(beach):
                continue
            reasons = bi.reasons_for(beach, comps)
            # A beach the data cannot say one sentence about is a name on a
            # photograph. It is not published, and that is a gate rather than
            # a build failure: the tail of unsurveyed strands is expected.
            if not reasons:
                continue
            rows.append(wire_beach(beach, comps, score10,
                                   bi.tier_for(score10), reasons))
        rows = dedupe(rows)[:args.max_per_country]
        if not rows:
            if args.verbose:
                print(f"  {cc}: nothing clears the gate")
            continue
        for row in rows:
            credits.update(row["credit"])
        published.extend(rows)
        total += len(rows)
        cover = next((r["images"][0]["u"] for r in rows if r["images"]), "")
        index.append({
            "cc": cc,
            "n": len(rows),
            "best": rows[0]["score"],
            "cover": cover,
            "top": [r["name"] for r in rows[:3]],
        })
        by_country[cc] = rows
        if args.dry_run or args.verbose:
            print(f"  {cc}: {len(rows)} beaches, best {rows[0]['score']} "
                  f"({rows[0]['name']})")

    # Validate BEFORE anything is written. Scoring every country first and
    # writing afterwards is the whole point: a gate that fires after half the
    # files are on disk has not gated anything, it has just made the wire
    # inconsistent in a new way.
    failures = validate(published)
    if failures:
        for line in failures[:20]:
            print(f"  FAIL {line}")
        print(f"[beaches] {len(failures)} validation failures, nothing written")
        raise SystemExit(1)

    # The Europe wide opening page, taken from what was just published so it
    # can never disagree with the country files.
    top = []
    per_country = {}
    for row in sorted(published, key=lambda r: (-r["score"], r["id"])):
        if per_country.get(row["cc"], 0) >= TOP_PER_COUNTRY:
            continue
        per_country[row["cc"]] = per_country.get(row["cc"], 0) + 1
        top.append(row)
        if len(top) >= TOP_N:
            break

    index.sort(key=lambda c: -c["n"])
    payload = {
        "generated_at": generated,
        "n_beaches": total,
        "model": {
            "version": bi.MODEL_VERSION,
            "weights": bi.WEIGHTS,
            "standout_bonus": bi.STANDOUT_BONUS,
            "tier_cutoffs": bi.TIER_CUTOFFS,
            "min_score": args.min_score,
            "min_images": MIN_IMAGES,
        },
        "countries": index,
        "attribution": sorted(credits),
        # What this build read, and when. Two wire files that differ can then
        # be told apart: same sources and same model means the code moved,
        # different dates means the world did.
        "sources": provenance(countries),
    }
    if args.dry_run:
        print(f"[beaches] {total} publishable across {len(index)} countries")
        return
    out_dir.mkdir(parents=True, exist_ok=True)
    for cc, rows in by_country.items():
        path = out_dir / f"{cc}.json"
        path.write_text(json.dumps(
            {"country": cc, "generated_at": generated, "n": len(rows),
             "beaches": rows}, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8")
        if args.verbose:
            print(f"  {cc}: -> {path.name} ({path.stat().st_size // 1024} KB)")
    (out_dir / "index.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")
    (out_dir / "top.json").write_text(
        json.dumps({"generated_at": generated, "n": len(top),
                    "per_country_cap": TOP_PER_COUNTRY, "beaches": top},
                   ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")
    print(f"[beaches] published {total} beaches across {len(index)} countries "
          f"into {out_dir} (top.json holds {len(top)})")


GLOBAL_MAX = 1.0

if __name__ == "__main__":
    main()
