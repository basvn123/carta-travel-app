"""City trip composer: curated one-day sightseeing days for in-demand cities.

City selection rests on actual market demand, never on the app's internal
fame signals alone: market_demand.py must have run first, and the top cities
per pilot country by official visitor nights are composed in that order.
rating_v2 and fame only step in as the documented fallback for cities the
statistics do not cover, and the basis that picked each city is logged and
stored. A demand-ranked city that is not in the catalogue (Ullensaker is
real Gardermoen airport-hotel demand, but not a sightseeing city we cover)
is skipped out loud and the next one taken.

Per city the composer:
  1. shortlists the destination's POIs exactly the way compose_daytrips.py
     does (same ranking, same commercial-noise and transport exclusions,
     same dedupe), but keeps only POIs with coordinates, a description AND
     an image whose licence checks out;
  2. resolves each candidate image's licence live against the Wikimedia
     API (cached in cache/citytrip_image_licenses.json) and drops POIs
     whose file is NC/ND licensed, unresolvable or outside the known open
     families, the same families the images table enforces at insert;
  3. clusters the survivors to the largest walkable area with a faithful
     port of the plan-day walking budget (walkableSubset in
     supabase/functions/plan-day/logic.mjs: every stop seeds, others join
     nearest-first while every leg stays under the leg cap and the
     straight-line path under the budget);
  4. sequences the cluster into a timed day through compose_daytrips.py's
     own solver, so dwell times (dayDraft.js KIND_DWELL), the 09:30 clock,
     the lunch rule and the assumed opening hours are shared with daytrips
     and the app's planner;
  5. computes walking legs via the local Valhalla (pedestrian costing) with
     the documented straight-line fallback at 4.5 km/h street walking when
     the tiles for that country are not loaded, always flagged as an
     estimate;
  6. stores a trips row (category='citytrip', geom = the walking line) with
     trip_stops referencing catalogue POI ids, one images row per stop
     (the table rejects NC/ND at insert), and the demand basis in raw_tags;
  7. runs validate.py's citytrip checks, which write validation_runs rows
     and move a fully passing draft to needs_review. Approval stays human,
     in the review UI; descriptions come later from describe.py; export via
     export_wire.py ships category so the app can shelve city trips apart.

Usage, from the repo root (DB up; market_demand.py run; Valhalla optional):
    python pipeline/trails/compose_citytrips.py                  # top 5 per pilot country
    python pipeline/trails/compose_citytrips.py --countries CH --top 3
    python pipeline/trails/compose_citytrips.py --dry-run
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import connect  # noqa: E402  (also puts pipeline/ on sys.path)
import compose_daytrips as cd  # noqa: E402
from market_demand import (  # noqa: E402
    DDL_FILE, city_key, demand_ranking, fetch)
from validate import (  # noqa: E402
    CITYTRIP_CONFIG, img_license_ok, validate_citytrips)

LICENSE_CACHE = ROOT / "cache" / "citytrip_image_licenses.json"

PILOTS = ["CH", "FR", "NO", "AT"]

# The plan-day walking budget, mirrored from
# supabase/functions/plan-day/logic.mjs so a composed city day and a planned
# one agree on what "walkable" means.
DEFAULT_MAX_WALK_KM = 12.0     # DEFAULT_MAX_WALK_KM
MAX_LEG_KM = 6.5               # MAX_LEG_KM: past this a hop is a transfer

WIKI_BATCH = 30
WIKI_PACE_S = 0.15

# ---------------------------------------------------------------------------
# Catalogue: city index and POI pool
# ---------------------------------------------------------------------------


def catalogue_city(name):
    """Catalogue city names carry airport qualifiers: 'Paris (Orly)'."""
    return re.sub(r"\s*\([^)]*\)\s*$", "", name or "").strip()


def load_catalogue_index():
    """(iso2, city key) -> best dest id, judged by usable POI count.

    Reads app_data once and leaves the parsed catalogue in
    compose_daytrips' module cache so the per-city loads are free.
    """
    dests = json.loads(cd.APP_DATA.read_text(encoding="utf-8"))["destinations"]
    pop = (json.loads(cd.ENRICH_CACHE.read_text(encoding="utf-8")).get("pop", {})
           if cd.ENRICH_CACHE.exists() else {})
    cd._CATALOGUE["dests"] = dests
    cd._CATALOGUE["pop"] = pop

    index = {}
    for dest_id, dest in dests.items():
        iso2 = (dest.get("iso2") or "").upper()
        city = catalogue_city(dest.get("city"))
        if not iso2 or not city:
            continue
        if dest.get("city_lat", dest.get("lat")) is None:
            continue
        items = (dest.get("activities") or {}).get("items_full") or []
        usable = sum(1 for it in items
                     if it.get("img") and it.get("desc")
                     and it.get("lat") is not None)
        key = (iso2, city_key(city))
        if key not in index or usable > index[key][1]:
            index[key] = (dest_id, usable)
    return {key: dest_id for key, (dest_id, _) in index.items()}


# Civic buildings a big-city harvest ranks highly because they are famous
# and photographed, but that nobody crosses Europe to stand in front of: a
# university hospital, the central library, a working railway station. The
# daytrip composer's transport filter waves heritage stations through, which
# is right for a village and wrong for a city day; here they all go,
# stations included. Kept deliberately blunt for the pilot countries; a
# future catalogue city whose genuine sight IS a library (Stockholm's
# Stadsbiblioteket) earns this a whitelist.
CIVIC_RE = re.compile(
    r"\b(hospitals?|h[oô]pital|clinic|klinik|universit(?:y|e|a[et])|"
    r"universiteit|universitet|polytechni|campus|colleges?|"
    r"coll[eè]ge|schools?|schule|gymnasium|institut[e]?|librar(?:y|ies)|"
    r"biblioth[eè]que|conservatoi?re|"
    r"(?:railway|train|bus|tram|metro) station|"
    r"gare(?:\s|$)|stazione|stasjon|town hall|city hall|rathaus|"
    r"h[oô]tel de ville|courthouse|tribunal|ministry|parliament annex|"
    r"piscine|swimming pool|swimming baths|lido)\b",
    re.I)
# Germanic compounds never expose a word boundary (Zentralbibliothek,
# Hauptbahnhof, Universitaetsspital), so these terms match anywhere.
CIVIC_COMPOUND_RE = re.compile(
    r"bibliothek|bibliotek|bahnhof|spital|hochschule|universitaet|"
    r"universit[äa]t|gymnasium|realschule|schwimmbad|schwimmhalle|"
    r"sv[oø]mmehall", re.I)


def is_civic_noise(item):
    text = f"{item.get('kind') or ''} {item.get('name') or ''}"
    return bool(CIVIC_RE.search(text) or CIVIC_COMPOUND_RE.search(text))


def is_commercial_name(item):
    """The daytrip filter only distrusts commercial words on vague kinds;
    a city harvest also ships a museum SHOP classed as a Museum (Boutique
    Georges Pompidou, 90 assumed minutes of it), so on a citytrip the
    name test applies to every kind."""
    return bool(cd.COMMERCIAL_RE.search(item.get("name") or ""))


def poi_pool(items, centre, radius_km, city):
    """Ranked, deduped sightseeing POIs that could carry a citytrip stop.

    compose_daytrips.shortlist's ranking with three extra gates: a citytrip
    stop must ship a description and an image, working civic buildings
    (CIVIC_RE) are out however famous they are, and so is the harvest's
    entry for the city itself (a stop named "Zurich" on a Zurich day).
    """
    city_folded = city_key(city)
    pool = []
    for it in items:
        if not (it.get("img") and it.get("desc")):
            continue
        if city_key(it.get("name")) == city_folded:
            continue
        if is_commercial_name(it) or cd.is_transport_infra(it) \
                or is_civic_noise(it):
            continue
        km = cd.haversine_km(centre[0], centre[1], it["lat"], it["lon"])
        if km > radius_km:
            continue
        it = dict(it)
        it["_km"] = km
        it["_score"] = cd.poi_score(it)
        it["_must"] = cd.is_must_see(it)
        pool.append(it)
    pool.sort(key=lambda x: (not x["_must"], -x["_score"], x["_km"]))
    return cd.dedupe_pois(pool)


# ---------------------------------------------------------------------------
# Image licences via the Wikimedia API
# ---------------------------------------------------------------------------

_UPLOAD_RE = re.compile(
    r"upload\.wikimedia\.org/wikipedia/([^/]+)/(?:thumb/)?"
    r"[0-9a-f]/[0-9a-f]{2}/([^/?#]+)")
_FILEPATH_RE = re.compile(
    r"commons\.wikimedia\.org/wiki/Special:(?:FilePath|Redirect/file)/"
    r"([^?#]+)", re.I)


def wiki_file(url):
    """Image URL -> (api endpoint, 'File:...') or None when unrecognised."""
    m = _UPLOAD_RE.search(url or "")
    if m:
        wiki, name = m.group(1), m.group(2)
        api = ("https://commons.wikimedia.org/w/api.php" if wiki == "commons"
               else f"https://{wiki}.wikipedia.org/w/api.php")
        return api, "File:" + urllib.parse.unquote(name).replace("_", " ")
    m = _FILEPATH_RE.search(url or "")
    if m:
        name = urllib.parse.unquote(m.group(1)).replace("_", " ")
        return "https://commons.wikimedia.org/w/api.php", "File:" + name
    return None


def _load_license_cache():
    if LICENSE_CACHE.exists():
        try:
            return json.loads(LICENSE_CACHE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return {}


def _save_license_cache(cache):
    LICENSE_CACHE.parent.mkdir(parents=True, exist_ok=True)
    LICENSE_CACHE.write_text(json.dumps(cache, separators=(",", ":")),
                             encoding="utf-8")


def _strip_html(text):
    return re.sub(r"<[^>]+>", "", text or "").strip()


def resolve_image_licenses(urls, cache, offline=False):
    """url -> {status, license, author, source_url} via the Wikimedia API.

    Batched (50 URLs of one wiki per request is allowed; we stay at 30),
    politely paced, cached on disk so a recompose is free. Unrecognised
    hosts and API misses come back status 'unresolved': the POI is then
    dropped rather than shipped with an unverified file.
    """
    todo = {}
    for url in urls:
        if url in cache:
            continue
        parsed = wiki_file(url)
        if parsed is None:
            cache[url] = {"status": "unresolved", "reason": "unrecognised host"}
            continue
        todo.setdefault(parsed[0], {})[parsed[1]] = url

    if offline:
        for api, batch in todo.items():
            for url in batch.values():
                cache.setdefault(url, {"status": "unresolved",
                                       "reason": "offline, not cached"})
        return cache

    for api, by_title in todo.items():
        titles = list(by_title)
        for start in range(0, len(titles), WIKI_BATCH):
            chunk = titles[start:start + WIKI_BATCH]
            qs = urllib.parse.urlencode({
                "action": "query", "format": "json",
                "titles": "|".join(chunk),
                "prop": "imageinfo", "iiprop": "extmetadata|url",
                "iiextmetadatafilter": "LicenseShortName|Artist|LicenseUrl",
            })
            try:
                payload = json.loads(fetch(f"{api}?{qs}", timeout=60))
            except (RuntimeError, json.JSONDecodeError) as exc:
                for title in chunk:
                    cache[by_title[title]] = {
                        "status": "unresolved",
                        "reason": f"api error: {type(exc).__name__}"}
                continue
            query = payload.get("query") or {}
            back = {}      # normalized title -> requested title
            for norm in query.get("normalized") or []:
                back[norm["to"]] = norm["from"]
            seen = set()
            for page in (query.get("pages") or {}).values():
                title = page.get("title") or ""
                requested = back.get(title, title)
                url = by_title.get(requested)
                if url is None:
                    continue
                seen.add(requested)
                infos = page.get("imageinfo") or []
                if not infos:
                    cache[url] = {"status": "unresolved",
                                  "reason": "file not found"}
                    continue
                meta = infos[0].get("extmetadata") or {}
                lic = (meta.get("LicenseShortName") or {}).get("value") or ""
                cache[url] = {
                    "status": "ok" if lic else "unresolved",
                    **({} if lic else {"reason": "no licence metadata"}),
                    "license": _strip_html(lic),
                    "author": _strip_html(
                        (meta.get("Artist") or {}).get("value"))[:200],
                    "source_url": infos[0].get("descriptionurl"),
                }
            for title in chunk:
                if title not in seen and by_title[title] not in cache:
                    cache[by_title[title]] = {"status": "unresolved",
                                              "reason": "no page in reply"}
            time.sleep(WIKI_PACE_S)
    return cache


def licensed_pois(pool, want, cache, offline):
    """The first `want` POIs whose image carries an approved licence.

    Licences resolve in ranking order, batch by batch, so a city with 40
    good candidates never queries more than it needs.
    """
    kept, dropped = [], []
    for start in range(0, len(pool), WIKI_BATCH):
        batch = pool[start:start + WIKI_BATCH]
        resolve_image_licenses([it["img"] for it in batch], cache, offline)
        for it in batch:
            info = cache.get(it["img"]) or {}
            lic = info.get("license")
            if info.get("status") == "ok" and img_license_ok(lic):
                it = dict(it)
                it["_img_license"] = lic
                it["_img_author"] = info.get("author")
                it["_img_source"] = info.get("source_url")
                kept.append(it)
            else:
                dropped.append((it["name"],
                                lic or info.get("reason") or "unresolved"))
        if len(kept) >= want:
            break
    return kept[:want], dropped


# ---------------------------------------------------------------------------
# The plan-day walkable cluster, ported from logic.mjs walkableSubset
# ---------------------------------------------------------------------------

def nn_order(pois, centre):
    """Greedy nearest-neighbour walking order from the city centre,
    the same chronology optimizeOrder and the daytrip solver produce."""
    remaining = list(pois)
    here = centre                  # (lat, lon)
    ordered = []
    while remaining:
        nxt = min(remaining, key=lambda it: cd.haversine_km(
            here[0], here[1], it["lat"], it["lon"]) or 1e9)
        ordered.append(nxt)
        remaining.remove(nxt)
        here = (nxt["lat"], nxt["lon"])
    return ordered


def walkable_cluster(ordered, centre, budget_km, leg_cap_km):
    """The biggest subset that can honestly be walked in one day.

    Faithful port of plan-day's walkableSubset: each stop is tried as a
    seed, the others join nearest-first for as long as the path (in the
    given order, anchored at the centre) keeps every leg under leg_cap_km
    and the straight-line total under budget_km. The seed keeping the most
    stops wins, shortest path breaking ties. Distances are straight-line,
    exactly what plan-day charges against the same budget.
    """
    if len(ordered) <= 1:
        return list(ordered), 0.0

    def path_km(stops):
        total = 0.0
        prev = centre
        for it in stops:
            km = cd.haversine_km(prev[0], prev[1], it["lat"], it["lon"]) or 0.0
            if km > leg_cap_km:
                return None
            total += km
            if total > budget_km:
                return None
            prev = (it["lat"], it["lon"])
        return total

    best, best_km = None, float("inf")
    for seed in ordered:
        chosen = {id(seed)}
        others = sorted(
            (it for it in ordered if it is not seed),
            key=lambda it: cd.haversine_km(seed["lat"], seed["lon"],
                                           it["lat"], it["lon"]) or 1e9)
        for cand in others:
            trial = [it for it in ordered
                     if id(it) in chosen or it is cand]
            if path_km(trial) is not None:
                chosen.add(id(cand))
        kept = [it for it in ordered if id(it) in chosen]
        km = path_km(kept)
        if km is None:
            continue
        if best is None or len(kept) > len(best) or \
                (len(kept) == len(best) and km < best_km):
            best, best_km = kept, km
    if best is None:                 # every seed failed its first leg
        return [ordered[0]], 0.0
    return best, best_km


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------

def store(conn, plan, args, router, pick, straight_km):
    """Upsert the citytrip, its stops and its stop images in one transaction.

    Same conventions as compose_daytrips.store: trips.geom holds the leg
    geometry, a recompose of an approved or published citytrip demotes it
    to needs_review, and the stop rows are rewritten wholesale. On top of
    that, one images row per stop records the resolved file licence; the
    table's own constraint rejects NC/ND, so a licence that slipped the
    filter would fail loudly here instead of shipping.
    """
    from psycopg.types.json import Jsonb

    stops = plan["stops"]
    parts = [s["leg"]["coords"] for s in stops
             if len(s["leg"]["coords"] or []) >= 2]
    if not plan["country"] or not parts:
        print("  not stored: no country or no leg geometry")
        return None
    travel_km = sum(s["leg"]["km"] for s in stops)
    source_ref = f"citytrip:{plan['dest_id']}"
    rating = pick["rating"]
    raw_tags = {
        "anchor_dest": plan["dest_id"],
        "anchor_city": plan["city"],
        "anchor_centre": {"lat": plan["centre"][0], "lon": plan["centre"][1]},
        "composed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "demand": {
            "basis": pick["basis"],
            "rank": pick.get("demand_rank"),
            "nights": pick.get("nights"),
            "year": pick.get("year"),
            "source": pick.get("stat_source"),
            "license": pick.get("stat_license"),
        },
        "city_rating": {"score": rating.get("score"),
                        "fame": rating.get("fame"),
                        "tier": rating.get("tier")},
        "params": {
            "start": cd.fmt_clock(plan["start"]),
            "budget_min": args.budget_min, "stops_max": args.stops,
            "visit": args.visit, "radius_km": args.radius_km,
            "max_walk_km": args.max_walk_km, "leg_cap_km": MAX_LEG_KM,
        },
        "assumptions": {
            "hours_assumed": True,
            "hours_note": "KIND_HOURS in compose_daytrips.py, European high "
                          "season; the catalogue carries no opening hours",
            "dwell_source": "continent-app dayDraft.js KIND_DWELL",
            "clock_source": "continent-app daySchedule.js",
            "cluster_source": "plan-day logic.mjs walkableSubset port",
        },
        "walk_straight_km": round(straight_km, 2),
        "stops": [{
            "seq": i + 1, "name": s["name"], "kind": s["kind"],
            "lat": s["lat"], "lon": s["lon"],
            "img": s["img"], "img_license": s["img_license"],
            "img_author": s["img_author"], "img_source": s["img_source"],
            "has_desc": bool(s["desc"]),
            "desc": (s["desc"] or "")[:500],
            "arrive": cd.fmt_clock(s["arrive"]),
            "depart": cd.fmt_clock(s["depart"]),
            "dwell_min": s["dwell"],
        } for i, s in enumerate(stops)],
        "lunch": plan["lunch"],
        "skipped": [{"name": n, "why": w} for n, w in plan["skipped"][:20]],
        "dropped_no_licence": [{"name": n, "why": w}
                               for n, w in pick["dropped_license"][:20]],
        "legs_estimated": sum(1 for s in stops
                              if s["leg"]["source"] == "estimate"),
        "router_notes": router.notes[:20],
    }
    attribution = ("Route geometry (c) OpenStreetMap contributors, ODbL. "
                   "Stop data via OpenTripMap, Overture Maps and Wikidata. "
                   "Images from Wikimedia Commons, per-file licences on "
                   "record. City ranking from official tourism statistics "
                   f"({pick.get('stat_source') or 'rating fallback'}).")

    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO trips (country, category, title, geom, distance_m,
                               duration_min, source, source_ref, license,
                               attribution_text, raw_tags)
            VALUES (%(country)s, 'citytrip', %(title)s,
                    ST_Force3D(ST_GeomFromText(%(wkt)s, 4326)),
                    %(distance_m)s, %(duration_min)s, 'carta_compose',
                    %(source_ref)s, %(license)s, %(attribution)s, %(raw_tags)s)
            ON CONFLICT (source, source_ref) WHERE source_ref IS NOT NULL
            DO UPDATE SET
                country = EXCLUDED.country, title = EXCLUDED.title,
                geom = EXCLUDED.geom, distance_m = EXCLUDED.distance_m,
                duration_min = EXCLUDED.duration_min,
                license = EXCLUDED.license,
                attribution_text = EXCLUDED.attribution_text,
                raw_tags = EXCLUDED.raw_tags,
                -- A recompose rewrites the itinerary under whoever approved
                -- the old one, so reviewed content goes back to the queue.
                status = CASE WHEN trips.status IN ('approved', 'published')
                              THEN 'needs_review'::trip_status
                              ELSE trips.status END
            RETURNING id, status::text""",
            {"country": plan["country"],
             "title": f"{plan['city']} in a day",
             "wkt": cd.multiline_wkt(parts),
             "distance_m": int(round(travel_km * 1000)),
             "duration_min": int(plan["end"] - plan["start"]),
             "source_ref": source_ref, "license": "ODbL 1.0",
             "attribution": attribution, "raw_tags": Jsonb(raw_tags)})
        trip_id, status = cur.fetchone()

        cur.execute("DELETE FROM trip_stops WHERE trip_id = %s", (trip_id,))
        for seq, s in enumerate(stops, start=1):
            leg = s["leg"]
            coords = leg["coords"] if len(leg["coords"] or []) >= 2 else None
            cur.execute("""
                INSERT INTO trip_stops (trip_id, seq, poi_ref, dwell_min,
                                        leg_mode, leg_duration_min, leg_geom)
                VALUES (%s, %s, %s, %s, %s, %s,
                        ST_GeomFromText(%s, 4326))""",
                (trip_id, seq, s["poi_ref"], s["dwell"], leg["mode"],
                 leg["minutes"],
                 cd.linestring_wkt(coords) if coords else None))

        cur.execute("DELETE FROM images WHERE subject_type = 'trip' "
                    "AND subject_id = %s", (trip_id,))
        for s in stops:
            cur.execute("""
                INSERT INTO images (subject_type, subject_id, url, title,
                                    author, source_url, license,
                                    attribution_text)
                VALUES ('trip', %s, %s, %s, %s, %s, %s, %s)""",
                (trip_id, s["img"], s["name"], s["img_author"] or None,
                 s["img_source"], s["img_license"],
                 (f"{s['img_author']}, {s['img_license']}, via Wikimedia "
                  f"Commons" if s["img_author"] else
                  f"{s['img_license']}, via Wikimedia Commons")))
    conn.commit()
    print(f"  stored trip id={trip_id} ({status}), {len(stops)} stops, "
          f"{len(stops)} images, source_ref={source_ref}")
    return trip_id


# ---------------------------------------------------------------------------
# City selection: demand first, rating only as documented fallback
# ---------------------------------------------------------------------------

def pick_cities(conn, country, top_n, index, dests):
    ranking = demand_ranking(conn, [country]).get(country) or []
    picks, skipped = [], []
    used = set()
    for rank, row in enumerate(ranking, start=1):
        if len(picks) >= top_n:
            break
        key = city_key(row["city"])
        dest_id = index.get((country, key))
        if dest_id is None:
            skipped.append((row["city"], row["nights"]))
            continue
        used.add(key)
        picks.append({
            "dest_id": dest_id, "city": row["city"],
            "basis": (f"market demand rank {rank}: {row['nights']:,} nights "
                      f"({row['year']}, {row['source']})"),
            "demand_rank": rank, "nights": row["nights"], "year": row["year"],
            "stat_source": row["source"], "stat_license": row["license"],
        })

    if len(picks) < top_n:
        # The statistics do not cover enough catalogue cities; only now do
        # rating_v2 and fame get a say, and they say so on the record.
        rated = []
        for (iso2, key), dest_id in index.items():
            if iso2 != country or key in used:
                continue
            rating = (dests[dest_id].get("rating") or {})
            rated.append((rating.get("score") or 0, dest_id, key))
        rated.sort(reverse=True)
        for score, dest_id, key in rated[:top_n - len(picks)]:
            picks.append({
                "dest_id": dest_id,
                "city": catalogue_city(dests[dest_id].get("city")),
                "basis": (f"rating_v2 fallback (score {score:.1f}); no "
                          f"official statistics cover this city"),
                "demand_rank": None, "nights": None, "year": None,
                "stat_source": None, "stat_license": None,
            })
    return picks, skipped


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def print_itinerary(plan, pick, straight_km, args):
    print(f"\n{plan['city']} in a day  [{plan['country']}, "
          f"anchor {plan['dest_id']}]")
    print(f"  picked by {pick['basis']}")
    print(f"  {len(plan['stops'])} stops, {straight_km:.1f} km straight-line "
          f"walking against the {args.max_walk_km:g} km budget, "
          f"visit pace {args.visit}")
    print(f"  {cd.fmt_clock(plan['start'])}  set off from the centre of "
          f"{plan['city']}")
    for i, s in enumerate(plan["stops"]):
        lunch = plan["lunch"]
        if lunch and lunch["after_index"] == i - 1:
            print(f"  {cd.fmt_clock(lunch['start'])}  lunch, "
                  f"{cd.LUNCH_BREAK_MIN} min")
        wait = f", wait {cd.fmt_dur(s['wait'])}" if s.get("wait") else ""
        print(f"  {cd.fmt_clock(s['arrive'])}  {cd.leg_label(s['leg'])}{wait}")
        print(f"         -> {s['name']} ({s['kind'] or 'sight'}), "
              f"{cd.fmt_dur(s['dwell'])} until {cd.fmt_clock(s['depart'])}")
    print(f"  {cd.fmt_clock(plan['end'])}  day ends "
          f"({cd.fmt_dur(plan['end'] - plan['start'])} on its feet)")
    legs = [s["leg"] for s in plan["stops"]]
    est = sum(1 for leg in legs if leg["source"] == "estimate")
    print(f"  totals: {cd.fmt_dur(sum(l['minutes'] for l in legs))} walking "
          f"over {sum(l['km'] for l in legs):.1f} routed km, "
          f"{est} leg(s) estimated")
    if plan["skipped"]:
        shown = "; ".join(f"{n} ({why})" for n, why in plan["skipped"][:3])
        print(f"  left out: {shown}"
              + (f" and {len(plan['skipped']) - 3} more"
                 if len(plan["skipped"]) > 3 else ""))


def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(
        description="Compose one-day city sightseeing trips for the most "
                    "in-demand cities per pilot country.")
    ap.add_argument("--countries", default=",".join(PILOTS),
                    help=f"comma-separated ISO codes (default {','.join(PILOTS)})")
    ap.add_argument("--top", type=int, default=5,
                    help="cities per country, demand-ranked (default 5)")
    ap.add_argument("--start", type=cd.parse_clock, default=cd.DAY_START_MIN,
                    metavar="HH:MM", help="day start (default 09:30)")
    ap.add_argument("--budget-min", type=int, default=8 * 60,
                    help="minutes the day may run (default 480; validation "
                         "wants 300 to 540)")
    ap.add_argument("--stops", type=int, default=10,
                    help="max stops in the day (default 10; the day budget, "
                         "not this, is what usually ends the day, so a city "
                         "of quick sights still fills its five hours)")
    ap.add_argument("--visit", choices=sorted(cd.VISIT_FACTORS),
                    default="standard",
                    help="visit pace, scales every dwell (default standard)")
    ap.add_argument("--radius-km", type=float, default=8.0,
                    help="how far from the centre POIs may sit (default 8)")
    ap.add_argument("--candidates", type=int, default=16,
                    help="licensed POIs handed to the cluster (default 16)")
    ap.add_argument("--max-walk-km", type=float, default=DEFAULT_MAX_WALK_KM,
                    help="straight-line walking budget for the day "
                         "(default %(default)s, plan-day's)")
    ap.add_argument("--max-leg-min", type=int, default=110,
                    help="longest single walking leg the day accepts "
                         "(default 110, the 6.5 km cluster cap on streets)")
    ap.add_argument("--valhalla-url", default=None,
                    help="Valhalla base URL (default TRAILSLAB_VALHALLA_URL "
                         "or http://localhost:8002)")
    ap.add_argument("--offline-images", action="store_true",
                    help="no Wikimedia requests; cached licences only")
    ap.add_argument("--no-validate", action="store_true",
                    help="store but skip the validation pass")
    ap.add_argument("--dry-run", action="store_true",
                    help="compose and print only, no DB writes")
    args = ap.parse_args()

    if args.valhalla_url is None:
        args.valhalla_url = os.environ.get("TRAILSLAB_VALHALLA_URL",
                                           "http://localhost:8002")
    # Fields the shared daytrip solver expects on args.
    args.transport = "walk"
    args.offline = False
    args.utc_offset = 2
    args.max_return_min = args.max_leg_min

    countries = [c.strip().upper() for c in args.countries.split(",")
                 if c.strip()]

    conn = connect()
    license_cache = _load_license_cache()
    stored_ids = []
    try:
        with conn.cursor() as cur:
            cur.execute(DDL_FILE.read_text(encoding="utf-8"))
        conn.commit()   # the citytrip enum value must be visible before use
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM market_demand WHERE city IS NOT NULL")
            if cur.fetchone()[0] == 0:
                sys.exit("market_demand is empty; run "
                         "pipeline/trails/market_demand.py first")
        conn.commit()

        print("loading the catalogue index...")
        index = load_catalogue_index()
        dests = cd._CATALOGUE["dests"]

        for country in countries:
            picks, skipped = pick_cities(conn, country, args.top, index, dests)
            print(f"\n=== [{country}] top {len(picks)} cities ===")
            for n, why in ((c, f"{v:,} nights but not in the catalogue")
                           for c, v in skipped):
                print(f"  passed over: {n} ({why})")
            for pick in picks:
                dest, items = cd.load_catalogue(pick["dest_id"])
                pick["rating"] = dest.get("rating") or {}
                centre = (dest.get("city_lat", dest.get("lat")),
                          dest.get("city_lon", dest.get("lon")))

                pool = poi_pool(items, centre, args.radius_km, pick["city"])
                kept, dropped = licensed_pois(
                    pool, args.candidates, license_cache, args.offline_images)
                pick["dropped_license"] = dropped
                if len(kept) < 2:
                    print(f"\n{pick['city']}: only {len(kept)} licensed POIs "
                          f"({len(pool)} in the pool), not composed")
                    continue

                ordered = nn_order(kept, centre)
                cluster, _ = walkable_cluster(
                    ordered, centre, args.max_walk_km, MAX_LEG_KM)
                # The solver sequences by proximity, so a wide cluster of
                # sixteen would happily fill the day with the eight weakest
                # stops that happen to sit closest. Handing it only the
                # best-ranked few keeps the day about the sights the city
                # is actually visited for.
                cluster.sort(key=lambda it: (not it["_must"], -it["_score"]))
                cluster = cluster[:args.stops + 4]

                router = cd.Router(args, None, {})
                plan = cd.compose(pick["dest_id"], dest, cluster, [],
                                  router, args, None)
                # "Paris (Orly) in a day" is an airport, not a product name.
                plan["city"] = catalogue_city(plan["city"])
                # The solver keeps only its stop fields; the citytrip needs
                # each stop's image, licence and description back on board.
                by_name = {it["name"]: it for it in cluster}
                for s in plan["stops"]:
                    it = by_name.get(s["name"], {})
                    s["img"] = it.get("img")
                    s["desc"] = it.get("desc")
                    s["img_license"] = it.get("_img_license")
                    s["img_author"] = it.get("_img_author")
                    s["img_source"] = it.get("_img_source")
                # The straight-line path over the SCHEDULED stops is what
                # the walking budget is charged against, plan-day style.
                path = [(plan["centre"][0], plan["centre"][1])] + \
                    [(s["lat"], s["lon"]) for s in plan["stops"]]
                straight_km = sum(
                    cd.haversine_km(a[0], a[1], b[0], b[1]) or 0.0
                    for a, b in zip(path, path[1:]))

                print_itinerary(plan, pick, straight_km, args)
                if router.notes:
                    seen = list(dict.fromkeys(router.notes))
                    print(f"  router fallbacks: {'; '.join(seen[:3])}")
                if dropped:
                    shown = "; ".join(f"{n} ({why})" for n, why in dropped[:3])
                    print(f"  dropped for image licence: {shown}"
                          + (f" and {len(dropped) - 3} more"
                             if len(dropped) > 3 else ""))
                if not plan["stops"]:
                    print("  nothing fitted the day; not stored")
                    continue
                if args.dry_run:
                    print("  dry run: not stored")
                    continue
                trip_id = store(conn, plan, args, router, pick, straight_km)
                if trip_id:
                    stored_ids.append(trip_id)

        if stored_ids and not args.no_validate:
            print(f"\nvalidating {len(stored_ids)} citytrips:")
            validate_citytrips(conn, ids=stored_ids)
    finally:
        _save_license_cache(license_cache)
        conn.close()


if __name__ == "__main__":
    main()
