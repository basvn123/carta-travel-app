"""Publish the validated trips to continent-app/public/trips/.

Four artifacts, and the split between them is the whole performance story:

    /trips/index.json        which countries have trips, how many, which day
                             counts are covered, the best score in each and one
                             cover photograph. What the browser loads first.
    /trips/top.json          the best trips in Europe, capped per country so
                             the opening page is a tour of the continent and
                             not a page of French ones.
    /trips/{CC}.json         every trip in that country as a CARD: enough to
                             rank, filter and draw, and nothing more.
    /trips/trip/{id}.json    one trip in full: every stop, every leg, every
                             day, every photograph, every check it passed.

A card is about six hundred bytes and a detail is about twelve kilobytes, so
folding the detail into the country file would have made picking a country a
one megabyte download. Opening a trip costs one request, which is the same
contract the trails layer ships under.

A trip that visits three countries is written into all three country files. A
Vienna to Prague route is an Austrian trip and a Czech one, and a traveller
browsing either country should be offered it.

The gate. Only trips that pass every hard check in validate_trips.py are
written, and the index records how many were dropped and why, per country, so
a rule that starts quietly deleting a country is visible in the artifact
rather than in the app as an empty page.

Usage, from the repo root:
    python pipeline/trips/export_trips.py                     # from the cache
    python pipeline/trips/export_trips.py --countries AT,CH
    python pipeline/trips/export_trips.py --dry-run
"""

import argparse
import shutil
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import compose_trips as C  # noqa: E402
import validate_trips as V  # noqa: E402
from trip_sources import (  # noqa: E402
    ATTRIBUTION, MODEL_VERSION, TRIP_CACHE, WIRE_DIR, load_catalogue,
    load_json, write_json)

TOP_PER_COUNTRY = 6
TOP_TOTAL = 240
GALLERY_MAX = 5


# ------------------------------------------------------------------- the card

def hero_of(trip):
    """The photograph a card leads with: the town the trip OPENS in.

    Leading with the best rated stop instead put the Trevi Fountain on both
    "Naples and Rome" and "Florence and Rome", and a grid with the same
    photograph twice reads as a template rather than as a catalogue. The first
    stop is also the one a reader is deciding whether to fly to.
    """
    for s in trip["stops"]:
        if s.get("img"):
            return {"url": s["img"], "credit": s.get("img_credit"),
                    "page": s.get("img_page"), "city": s["city"]}
    return None


def gallery_of(trip):
    """A handful of photographs, one per stop first, then the best sights.

    One per stop before any second picture of the first stop: a five day trip
    whose gallery is five views of the same square has told the reader nothing
    about days two to five.
    """
    out, seen = [], set()
    for s in trip["stops"]:
        if s.get("img") and s["img"] not in seen:
            seen.add(s["img"])
            out.append({"url": s["img"], "credit": s.get("img_credit"),
                        "page": s.get("img_page"), "city": s["city"]})
    for t in trip["daytrips"]:
        if t.get("img") and t["img"] not in seen and len(out) < GALLERY_MAX:
            seen.add(t["img"])
            out.append({"url": t["img"], "city": t["city"]})
    for s in trip["stops"]:
        for h in s["highlights"]:
            if h.get("img") and h["img"] not in seen and len(out) < GALLERY_MAX:
                seen.add(h["img"])
                out.append({"url": h["img"], "name": h["name"], "city": s["city"]})
    return out[:GALLERY_MAX]


def headline_sights(trip, want=3):
    """The named sights a card leads with, one per stop before any second.

    A card used to carry two composed sentences, and because the reason
    vocabulary is small those sentences came out identical on every Italian
    trip: "2 UNESCO World Heritage sites on the route." three times in a row.
    What actually differs between two trips is what you would stand in front
    of, so that is what the card says instead. The sentences still open the
    page, where there is room for them to earn their place.
    """
    out, seen = [], set()
    pools = [s["highlights"] for s in trip["stops"]]
    pools += [t["highlights"] for t in trip["daytrips"]]
    for depth in range(3):
        for pool in pools:
            if len(out) >= want:
                return out
            if depth >= len(pool):
                continue
            name = pool[depth].get("name")
            if name and name not in seen:
                seen.add(name)
                out.append(name)
    return out[:want]


def centre_of(trip):
    lats = [s["lat"] for s in trip["stops"]]
    lons = [s["lon"] for s in trip["stops"]]
    return round(sum(lats) / len(lats), 4), round(sum(lons) / len(lons), 4)


def to_card(trip):
    """What a grid of trips needs, and nothing that only the page needs."""
    lat, lon = centre_of(trip)
    return {
        "id": trip["id"],
        "cc": trip["cc"],
        "countries": trip["countries"],
        "abroad": trip.get("daytrip_countries") or [],
        "archetype": trip["archetype"],
        "days": trip["days"],
        "nights": trip["nights"],
        "score": trip["score"],
        "quality": trip["checks"]["quality"],
        "themes": trip["themes"],
        "season": trip["season"]["best"],
        "seasonBasis": trip["season"]["basis"],
        "transport": trip["transport"],
        "lat": lat, "lon": lon,
        "km": sum(lg["km"] for lg in trip["legs"]) or None,
        "cities": [{"city": s["city"], "cc": s["iso2"], "n": s["nights"]}
                   for s in trip["stops"]],
        "outs": [{"city": t["city"], "cc": t["iso2"], "min": t["minutes"],
                  "mode": t["mode"]} for t in trip["daytrips"]],
        "img": hero_of(trip),
        "sights": headline_sights(trip),
        "why": trip["why"][:4],
        "warned": trip["checks"]["warned"],
        "cost": trip["cost"],
        "follows": trip.get("follows"),
        "detail": "/trips/trip/%s.json" % trip["id"],
    }


def to_detail(trip):
    """The full trip, as the page reads it."""
    out = dict(trip)
    out["gallery"] = gallery_of(trip)
    out["hero"] = hero_of(trip)
    lat, lon = centre_of(trip)
    out["lat"], out["lon"] = lat, lon
    out["model"] = MODEL_VERSION
    return out


# ----------------------------------------------------------------- the export

def export(trips, dropped, stats, *, dry_run=False, only=None):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    by_cc = defaultdict(list)
    for t in trips:
        for cc in t["countries"]:
            by_cc[cc].append(t)

    if not dry_run:
        WIRE_DIR.mkdir(parents=True, exist_ok=True)
        (WIRE_DIR / "trip").mkdir(parents=True, exist_ok=True)
        # A country that no longer qualifies has to lose its file, or the app
        # keeps serving a build that the model has already disowned.
        if not only:
            for old in WIRE_DIR.glob("*.json"):
                if old.name not in ("index.json", "top.json"):
                    old.unlink()
            shutil.rmtree(WIRE_DIR / "trip", ignore_errors=True)
            (WIRE_DIR / "trip").mkdir(parents=True, exist_ok=True)

    countries = []
    for cc in sorted(by_cc):
        rows = sorted(by_cc[cc], key=lambda t: (-t["score"], t["days"], t["id"]))
        cards = [to_card(t) for t in rows]
        cover = next((c["img"] for c in cards if c["img"]), None)
        countries.append({
            "cc": cc,
            "n": len(cards),
            "best": max(c["score"] for c in cards),
            "cover": cover,
            "days": sorted({c["days"] for c in cards}),
            "shapes": dict(Counter(c["archetype"] for c in cards)),
            "dropped": stats.get(cc, {}).get("dropped", 0),
        })
        if not dry_run:
            write_json(WIRE_DIR / ("%s.json" % cc), {
                "country": cc, "generated_at": now, "model": MODEL_VERSION,
                "n": len(cards), "trips": cards,
            }, compact=True)

    if not dry_run:
        for t in trips:
            write_json(WIRE_DIR / "trip" / ("%s.json" % t["id"]),
                       to_detail(t), compact=True)

    # The Europe wide opening page, capped per country.
    per_cc = Counter()
    top = []
    for t in sorted(trips, key=lambda x: (-x["score"], x["id"])):
        if per_cc[t["cc"]] >= TOP_PER_COUNTRY:
            continue
        per_cc[t["cc"]] += 1
        top.append(to_card(t))
        if len(top) >= TOP_TOTAL:
            break

    index = {
        "generated_at": now,
        "model": MODEL_VERSION,
        "n_trips": len(trips),
        "n_dropped": len(dropped),
        "shapes": dict(Counter(t["archetype"] for t in trips)),
        "days": sorted({t["days"] for t in trips}),
        "countries": countries,
        "absent": {},
        "attribution": ATTRIBUTION,
    }
    if not dry_run:
        write_json(WIRE_DIR / "top.json",
                   {"generated_at": now, "model": MODEL_VERSION,
                    "n": len(top), "trips": top}, compact=True)
        write_json(WIRE_DIR / "index.json", index)
    return index, top


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--source", default=str(TRIP_CACHE / "composed.json"))
    ap.add_argument("--countries", help="only publish these, leave the rest alone")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    payload = load_json(args.source)
    if not payload:
        raise SystemExit("no composed trips at %s, run compose_trips.py first"
                         % args.source)
    only = None
    if args.countries:
        only = {c.strip().upper() for c in args.countries.split(",") if c.strip()}

    cat = load_catalogue()
    ctx = C.build_context(cat, verbose=False)
    raw = payload["trips"]
    if only:
        raw = [t for t in raw if set(t["countries"]) & only]

    kept, dropped, reasons = V.validate(raw, cat, ctx)
    print("validated: %s in, %s ship, %s dropped" % (len(raw), len(kept), len(dropped)))
    for why, n in reasons.most_common(12):
        print("  dropped  %-44s %s" % (why, n))

    per_cc_dropped = Counter()
    kept_ids = {t["id"] for t in kept}
    for t in raw:
        if t["id"] not in kept_ids:
            per_cc_dropped[t["cc"]] += 1
    stats = {cc: {"dropped": n} for cc, n in per_cc_dropped.items()}

    index, top = export(kept, dropped, stats, dry_run=args.dry_run, only=only)
    print("published %s trips across %s countries, %s in the Europe list"
          % (index["n_trips"], len(index["countries"]), len(top)))
    thin = [c["cc"] for c in index["countries"] if c["n"] < 4]
    if thin:
        print("thin coverage (fewer than four trips): %s" % ", ".join(thin))
    missing = sorted({d["iso2"] for d in cat.values() if d["iso2"]}
                     - {c["cc"] for c in index["countries"]})
    if missing:
        print("no trips at all: %s" % ", ".join(missing))
    if args.dry_run:
        print("dry run, nothing written")


if __name__ == "__main__":
    main()
