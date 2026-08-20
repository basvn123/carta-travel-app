"""Photographs of the walk itself, from Wikimedia Commons.

Until now a trail card borrowed the hero image of the nearest catalogue town,
which is why Bulgaria's hiking list showed a red townhouse in Septemvri and a
beach at Sozopol on routes that pass neither. A photograph of a town 30 km
away is not a picture of the trail, and on a page whose whole job is "should I
walk this", it is worse than no picture at all.

So every photograph here is anchored on the ROUTE LINE. Commons is searched by
coordinate at points spaced along the walk, plus at the named features
scenic.py found on it, and a candidate is kept only when the camera stood
within CANDIDATE_M of the line. What comes out is:

  the hero      rank 0, the best-scoring shot on the route, which is what the
                card and the top of the trail page show
  the views     ranks 1..N, deliberately spread ALONG the route rather than
                taken globally best-first, so the gallery answers "what will I
                see" instead of showing six angles on the same trailhead

Licensing is the same posture as the rest of the layer: Commons only, the
per-file licence and author captured on the row, and the images table's own
CHECK constraint rejects anything NC or ND before it can reach the app.

Two passes on purpose. The network pass collects candidates with the
coordinate the photograph was taken at; the database pass then measures each
one against the real geometry (ST_LineLocatePoint for where along the walk,
ST_Distance for how far off it) and only then scores and ranks. Measuring
against the sample point that happened to find a file would rank a photograph
by which probe caught it rather than by where it was taken.

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/trails/trail_images.py
    python pipeline/trails/trail_images.py --countries SI --verbose
    python pipeline/trails/trail_images.py --refresh --countries MT
"""

import argparse
import re
import sys
import time
import urllib.parse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(ROOT / "pipeline"))

from db import connect  # noqa: E402
from beaches.sources import COMMONS_API, SourceError, mediawiki  # noqa: E402

# How many photographs a route ships. One hero plus a short gallery: past
# about six the marginal shot is another view of the same ridge.
IMAGES_WANTED = 6
# The camera has to have stood this close to the line. 400 m is generous
# enough for a shot taken from the slope above the path and tight enough that
# the next village square never qualifies.
CANDIDATE_M = 400
# Commons geosearch radius per probe. Slightly wider than CANDIDATE_M so the
# exact measurement in the database pass has something to reject.
PROBE_M = 600
# Probes along the line, before the highlight probes are added. A 6 km loop
# does not need eight and a 90 km trek is not served by three.
PROBES_MIN, PROBES_MAX, PROBE_EVERY_M = 4, 10, 3_500
# Named features from scenic.py are the places people actually photograph, so
# they get their own probes on top of the evenly spaced ones.
HIGHLIGHT_PROBES = 6
WORKERS = 6

IMAGE_PROPS = {
    "prop": "imageinfo",
    "iiprop": "url|size|extmetadata",
    "iiurlwidth": 1280,
    "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|ImageDescription"
                           "|GPSLatitude|GPSLongitude",
}

# Files that are not photographs of a landscape. Same shape as the beach
# layer's filter, plus the things that specifically pollute a trail search:
# waymark symbols, signposts, route profile diagrams and church interiors.
BAD_FILE_RE = re.compile(
    r"\.(svg|pdf|tif|tiff|ogv|webm|ogg|mid|djvu|gif)$|"
    r"\b(map|karte|carte|mappa|mapa|plan|blazon|coat[ _]of[ _]arms|wappen|"
    r"flag|logo|diagram|chart|graph|profile|elevation[ _]profile|"
    r"sign|signpost|schild|wegweiser|panneau|marker|blaze|waymark|"
    r"stamp|briefmarke|poster|screenshot|portrait|grave|tomb|gravestone|"
    r"memorial[ _]plaque|plaque|inscription|interior|innenraum|altar|"
    r"fresco|mosaic|museum|exhibit)\b", re.I)

# Two capitalised Latin-looking words at the head of a file name is a species
# page filed under wherever it was photographed. Trails collect these badly:
# a search along an alpine path returns beetles and gentians.
#
# The second pattern catches the same thing when the file is named in the
# local language and only carries the binomial in brackets, which is how
# "Зелен гуштер, Western Green Lizard (Lacerta bilineata).jpg" reached a
# Macedonian route's gallery: the head of that name is Cyrillic, so anchoring
# on the start missed it.
SPECIES_RE = re.compile(r"^[A-Z][a-z]{3,}\s+[a-z]{4,}\b")
BINOMIAL_RE = re.compile(r"\(\s*[A-Z][a-z]{3,}\s+[a-z]{4,}\s*\)")

# Words that say the frame is the landscape rather than an object in it.
GOOD_WORDS = re.compile(
    r"\b(view|vista|panorama|aussicht|blick|utsikt|vue|vista|paesaggio|"
    r"landscape|landschaft|paysage|scenery|valley|tal|vallee|valle|"
    r"summit|peak|gipfel|sommet|cima|vrh|ridge|grat|crete|"
    r"trail|path|weg|pfad|sentier|sentiero|senda|pot|staza|track|"
    r"hike|wandern|randonnee|lake|see|lac|lago|jezero|waterfall|"
    r"wasserfall|cascade|cascata|gorge|schlucht|canyon|coast|cliff|"
    r"glacier|gletscher|mountain|berg|montagne|montagna|fjord|hut|huette)\b",
    re.I)


def fold(text):
    import unicodedata
    s = unicodedata.normalize("NFD", str(text or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def strip_html(text):
    return re.sub(r"<[^>]+>", "", text or "").strip()


# ---------------------------------------------------------------------------
# Where to look: probes along the route
# ---------------------------------------------------------------------------

# ST_LineInterpolatePoint on the single-part line curate.py guarantees.
PROBES_SQL = """
    SELECT t.id, t.title, t.country, t.distance_m, t.highlights,
           ST_AsText(ST_Points(ST_LineInterpolatePoints(
               ST_Force2D(ST_GeometryN(t.geom, 1)), %(frac)s, true))) AS probes
    FROM trips t
    WHERE t.id = ANY(%(ids)s)
"""

POINT_RE = re.compile(r"(-?\d+\.?\d*)\s+(-?\d+\.?\d*)")


def probe_points(row):
    """Sample coordinates for one route: evenly spaced, plus its highlights."""
    pts = [(float(la), float(lo))
           for lo, la in POINT_RE.findall(row["probes"] or "")]
    seen = {(round(a, 4), round(b, 4)) for a, b in pts}
    features = ((row.get("highlights") or {}).get("features") or [])
    for f in features[:HIGHLIGHT_PROBES]:
        key = (round(f["lat"], 4), round(f["lon"], 4))
        if key not in seen:
            seen.add(key)
            pts.append((f["lat"], f["lon"]))
    return pts


def n_probes(distance_m):
    n = int((distance_m or 0) / PROBE_EVERY_M)
    return max(PROBES_MIN, min(PROBES_MAX, n))


def fetch_targets(conn, countries, refresh):
    """Curated routes this run should search, longest first so the big treks
    (which need the most probes) are not left to the tail of the run.

    Two exclusions, not one. Skipping routes that HAVE photographs is obvious;
    skipping routes a previous run already searched and found nothing for is
    the one that matters. Commons simply has no free photograph of most
    anonymous forest loops, and without a record of the empty answer every
    re-run spends its first hour re-asking about them: a resumed run opened
    with "100 routes, 3 photographs, 99 without", which was not a failure rate
    but the previous run's misses being retried in country order.

    --refresh ignores both, which is how you re-shoot after changing the
    scoring or after Commons has had time to gain new uploads."""
    having = "" if refresh else """
        AND NOT EXISTS (SELECT 1 FROM images i
                        WHERE i.subject_type = 'trip' AND i.subject_id = t.id
                          AND i.rank IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM validation_runs v
                        WHERE v.subject_type = 'trip' AND v.subject_id = t.id
                          AND v.check_name = 'trail_photos')"""
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT t.id FROM trips t
            WHERE t.category = 'hike' AND t.status IN ('approved', 'published')
              AND t.country = ANY(%s)
              {having}
            ORDER BY t.country, t.distance_m DESC""", (countries,))
        return [r[0] for r in cur.fetchall()]


EMPTY_SQL = """
    INSERT INTO validation_runs
        (subject_type, subject_id, check_name, passed, score, details)
    VALUES ('trip', %s, 'trail_photos', false, 0, %s)
"""


def mark_empty(conn, tid, n_candidates, n_probes_used):
    """Record that Commons was searched for this route and had nothing usable.

    Append-only, like every other check in this table, and cleared by the
    --refresh path rather than by deletion, so the ledger keeps saying what
    was tried and when."""
    from psycopg.types.json import Jsonb
    with conn.cursor() as cur:
        cur.execute(EMPTY_SQL, (tid, Jsonb({
            "candidates": n_candidates,
            "probes": n_probes_used,
            "radius_m": CANDIDATE_M,
            "reason": ("no candidate scored above the bar" if n_candidates
                       else "no Commons file near the line"),
        })))
    conn.commit()


def load_rows(conn, ids):
    out = []
    with conn.cursor() as cur:
        for start in range(0, len(ids), 200):
            batch = ids[start:start + 200]
            # One fraction list per distance would need a query each, so the
            # probe count is applied per row: ask for the maximum and thin it.
            cur.execute(PROBES_SQL, {"ids": batch,
                                     "frac": 1.0 / (PROBES_MAX - 1)})
            for (tid, title, cc, dist, highlights, probes) in cur.fetchall():
                row = {"id": tid, "title": title, "country": cc,
                       "distance_m": dist, "highlights": highlights,
                       "probes": probes}
                pts = probe_points(row)
                want = n_probes(dist)
                # Thin the evenly spaced probes down to what this length
                # warrants, keeping the ends and spreading the rest.
                spaced = pts[:PROBES_MAX]
                extra = pts[PROBES_MAX:]
                if len(spaced) > want:
                    step = (len(spaced) - 1) / max(1, want - 1)
                    spaced = [spaced[min(len(spaced) - 1, round(i * step))]
                              for i in range(want)]
                row["points"] = spaced + extra
                out.append(row)
    return out


# ---------------------------------------------------------------------------
# Network pass: candidates from Commons
# ---------------------------------------------------------------------------

def coords_of(info):
    """Where the photograph was taken, from the file's GPS metadata."""
    meta = info.get("extmetadata") or {}

    def val(key):
        raw = (meta.get(key) or {}).get("value")
        if raw in (None, ""):
            return None
        try:
            return float(str(raw))
        except ValueError:
            return None

    return val("GPSLatitude"), val("GPSLongitude")


def candidates_for(row, verbose=False):
    """Commons files photographed near this route, deduped by title.

    Two kinds of probe. The coordinate probes are what find pictures of an
    anonymous forest loop, which is most of the list and which nobody has ever
    named a file after. The name probe is what finds the good photographs of a
    route that IS known by name, where somebody titled the file 'Tour du Mont
    Blanc' from a viewpoint the coordinate probes might miss; nearcoord keeps
    it from returning the same-named path in another country."""
    found = {}

    def collect(params, probe):
        try:
            data = mediawiki(params, api=COMMONS_API)
        except (SourceError, ValueError, KeyError):
            return
        for page in (data.get("query") or {}).get("pages") or []:
            title = page.get("title") or ""
            if title in found:
                continue
            info = (page.get("imageinfo") or [{}])[0]
            if not info.get("url"):
                continue
            lat, lon = coords_of(info)
            if lat is None:
                lat, lon = probe            # geosearch hit with no EXIF GPS
            found[title] = {"title": title, "info": info,
                            "lat": lat, "lon": lon}

    for (lat, lon) in row["points"]:
        collect({"generator": "geosearch", "ggsnamespace": 6,
                 "ggscoord": f"{lat}|{lon}", "ggsradius": PROBE_M,
                 "ggslimit": 16, **IMAGE_PROPS}, (lat, lon))

    name = (row.get("title") or "").strip()
    if name and len(name) > 4 and row["points"]:
        lat, lon = row["points"][len(row["points"]) // 2]
        collect({"generator": "search", "gsrnamespace": 6, "gsrlimit": 12,
                 "gsrsearch": f'"{name}" filetype:bitmap '
                              f"nearcoord:20km,{lat},{lon}",
                 **IMAGE_PROPS}, (lat, lon))
    if verbose:
        print(f"    {row['id']}: {len(found)} candidates "
              f"from {len(row['points'])} probes")
    return list(found.values())


# ---------------------------------------------------------------------------
# Database pass: measure against the line, then score
# ---------------------------------------------------------------------------

MEASURE_SQL = """
    WITH route AS (
        SELECT ST_Force2D(ST_GeometryN(geom, 1)) AS line,
               GREATEST(distance_m, 1) AS len
        FROM trips WHERE id = %(tid)s
    ), shot AS (
        SELECT (v->>'k')::int AS k,
               ST_SetSRID(ST_MakePoint((v->>'lon')::float,
                                       (v->>'lat')::float), 4326) AS geom
        FROM jsonb_array_elements(%(pts)s::jsonb) v
    )
    SELECT s.k,
           ST_Distance(s.geom::geography, r.line::geography) AS off_m,
           ST_LineLocatePoint(r.line, s.geom) * r.len AS along_m
    FROM shot s CROSS JOIN route r
"""


def measure(conn, tid, cands):
    """Exact distance off the line and distance along it, per candidate."""
    import json
    pts = [{"k": i, "lat": c["lat"], "lon": c["lon"]}
           for i, c in enumerate(cands) if c["lat"] is not None]
    if not pts:
        return
    with conn.cursor() as cur:
        cur.execute(MEASURE_SQL, {"tid": tid, "pts": json.dumps(pts)})
        for k, off_m, along_m in cur.fetchall():
            cands[k]["off_m"] = off_m
            cands[k]["along_m"] = along_m


def score_image(cand, row):
    """How likely this file is to be a usable photograph OF this walk."""
    title = cand["title"]
    bare = title[5:] if title.startswith("File:") else title
    info = cand["info"]
    if (BAD_FILE_RE.search(bare) or SPECIES_RE.match(bare)
            or BINOMIAL_RE.search(bare)):
        return -1
    width, height = info.get("width") or 0, info.get("height") or 0
    if width < 800 or height < 500:
        return -1
    off_m = cand.get("off_m")
    if off_m is None or off_m > CANDIDATE_M:
        return -1

    score = 0.0
    # Proximity is the whole claim: this is a picture of the trail because it
    # was taken on the trail. Full marks within 80 m, fading to nothing at the
    # candidate limit.
    score += 2.4 * max(0.0, 1.0 - (off_m / CANDIDATE_M)) ** 0.7
    folded = fold(bare)
    name_tokens = {w for w in re.split(r"[^a-z0-9]+", fold(row.get("title") or ""))
                   if len(w) >= 4}
    if name_tokens and any(w in folded for w in name_tokens):
        score += 1.6
    if GOOD_WORDS.search(folded):
        score += 1.0
    for f in ((row.get("highlights") or {}).get("features") or []):
        token = fold(f.get("name") or "")
        if len(token) >= 4 and token in folded:
            score += 0.9
            break
    if width > height:
        score += 0.8                      # a hero card is a landscape crop
    if width >= 2000:
        score += 0.4
    if "panoramio" in folded:
        score -= 0.5                      # bulk import, mostly mediocre
    if re.search(r"\b(20[01]\d)\b", folded):
        score -= 0.1                      # a bare year is usually a snapshot
    return score


# Commons names a series of shots of one thing "Foo.jpg", "Foo 2.jpg",
# "Foo III.jpg". Six of those is not a gallery of the walk, it is one subject
# photographed six times, so they collapse to their best member.
SERIES_SUFFIX_RE = re.compile(
    r"[\s_-]*(?:\(?\d{1,3}\)?|[ivx]{1,4})$", re.I)


def subject_key(title):
    """The thing a file name is about, with any series counter removed."""
    bare = title[5:] if title.startswith("File:") else title
    bare = re.sub(r"\.[a-z0-9]{2,4}$", "", bare, flags=re.I)
    folded = fold(bare)
    folded = SERIES_SUFFIX_RE.sub("", folded).strip()
    return re.sub(r"[^a-z0-9]+", " ", folded).strip()


# Below this a gallery is padded from the best remaining shots even when they
# repeat a stretch of the walk: two pictures is thin enough that another angle
# still earns its place. At three or more, spread beats quantity.
MIN_GALLERY = 3


def pick(cands, row):
    """Hero plus a gallery that walks the route.

    Best-first would hand back six photographs of the same famous viewpoint,
    because that is where everybody stops. Instead the route is cut into as
    many slices as there are gallery slots and each slice contributes its best
    shot, so the gallery reads as a walk rather than as a carousel.

    Macedonia's first run showed why both guards are needed: one route came
    back with all six shots at 0 m (a village at the trailhead, photographed
    from every side) and another with four at 410 m. Slice diversity alone did
    not stop it, because an unconditional pad filled the leftover slots with
    exactly the duplicates the slices had just rejected."""
    scored = []
    seen_subjects = {}
    for c in cands:
        s = score_image(c, row)
        if s <= 0.6:
            continue
        c["score"] = s
        key = subject_key(c["title"])
        # One frame per subject, the best one.
        if key and key in seen_subjects:
            if s > seen_subjects[key]["score"]:
                scored.remove(seen_subjects[key])
                seen_subjects[key] = c
                scored.append(c)
            continue
        if key:
            seen_subjects[key] = c
        scored.append(c)
    if not scored:
        return []
    scored.sort(key=lambda c: -c["score"])
    hero = scored[0]
    picked = [hero]
    total = max(1.0, float(row.get("distance_m") or 1))
    slots = IMAGES_WANTED - 1
    slice_of = lambda c: int(min(slots - 1,  # noqa: E731
                                 max(0, (c.get("along_m") or 0)) / total * slots))
    used_slices = {slice_of(hero)}
    for c in scored[1:]:
        if len(picked) >= IMAGES_WANTED:
            break
        slice_i = slice_of(c)
        if slice_i in used_slices:
            continue
        used_slices.add(slice_i)
        picked.append(c)
    # Only a genuinely thin result is padded, and never past MIN_GALLERY.
    if len(picked) < MIN_GALLERY:
        for c in scored:
            if len(picked) >= MIN_GALLERY:
                break
            if c not in picked:
                picked.append(c)
    picked[1:] = sorted(picked[1:], key=lambda c: c.get("along_m") or 0)
    return picked


UPSERT_SQL = """
    INSERT INTO images (subject_type, subject_id, url, title, author,
                        source_url, license, attribution_text, is_approved,
                        rank, score, width, height, caption, license_url,
                        taken_lat, taken_lon, along_m)
    VALUES ('trip', %s, %s, %s, %s, %s, %s, %s, true,
            %s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (subject_type, subject_id, url) DO UPDATE SET
        rank = EXCLUDED.rank, score = EXCLUDED.score,
        along_m = EXCLUDED.along_m, is_approved = true
"""

NC_ND_RE = re.compile(r"(^|[^a-z])(nc|nd)([^a-z]|$)|non-?commercial|no-?deriv",
                      re.I)


def store(conn, tid, picked):
    with conn.cursor() as cur:
        cur.execute("DELETE FROM images WHERE subject_type = 'trip' "
                    "AND subject_id = %s AND rank IS NOT NULL", (tid,))
        written = 0
        for rank, c in enumerate(picked):
            info = c["info"]
            meta = info.get("extmetadata") or {}

            def val(key):
                return strip_html((meta.get(key) or {}).get("value", ""))

            licence = val("LicenseShortName") or "unknown"
            # The table's CHECK would refuse these anyway; refusing here keeps
            # one bad file from aborting a whole route's insert.
            if NC_ND_RE.search(licence):
                continue
            page = ("https://commons.wikimedia.org/wiki/"
                    + urllib.parse.quote(c["title"].replace(" ", "_")))
            # Commons' Artist field is free-form wikitext and a good number
            # of uploads put the licence in it instead of a name. Stored as
            # given so nothing is lost; export_wire.clean_author() decides
            # what is printable, which also repairs rows already harvested.
            author = val("Artist")[:160]
            attribution = ", ".join(
                x for x in (c["title"].replace("File:", ""), author, licence) if x
            )[:400]
            cur.execute(UPSERT_SQL, (
                tid, info.get("thumburl") or info.get("url"),
                c["title"][:250], author, page, licence, attribution,
                rank, round(float(c.get("score") or 0), 3),
                info.get("thumbwidth") or info.get("width"),
                info.get("thumbheight") or info.get("height"),
                val("ImageDescription")[:280], val("LicenseUrl"),
                c.get("lat"), c.get("lon"),
                int(c["along_m"]) if c.get("along_m") is not None else None,
            ))
            written += 1
    conn.commit()
    return written


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def curated_countries(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT country FROM trips
            WHERE category = 'hike' AND status IN ('approved', 'published')
            ORDER BY country""")
        return [r[0] for r in cur.fetchall()]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", help="comma separated ISO2")
    ap.add_argument("--refresh", action="store_true",
                    help="re-shoot routes that already have photographs")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    sys.stdout.reconfigure(errors="replace")
    with connect() as conn:
        countries = ([c.strip().upper() for c in args.countries.split(",") if c.strip()]
                     if args.countries else curated_countries(conn))
        if args.refresh:
            with conn.cursor() as cur:
                cur.execute("""
                    DELETE FROM validation_runs v
                    USING trips t
                    WHERE v.subject_type = 'trip' AND v.subject_id = t.id
                      AND v.check_name = 'trail_photos'
                      AND t.country = ANY(%s)""", (countries,))
                cleared = cur.rowcount
            conn.commit()
            if cleared:
                print(f"cleared {cleared:,} previous empty-search markers")
        ids = fetch_targets(conn, countries, args.refresh)
        if args.limit:
            ids = ids[:args.limit]
        if not ids:
            print("every curated route already has photographs "
                  "(use --refresh to re-shoot)")
            return
        print(f"{len(ids):,} routes to photograph across {len(countries)} "
              f"countries")
        rows = load_rows(conn, ids)

        counts = Counter()
        by_country = defaultdict(lambda: [0, 0])
        t0 = time.time()
        done = 0
        # The network pass is threaded and the database pass is not: psycopg
        # connections are not shared across threads, and the measure/score/
        # store step is fast enough that serialising it costs nothing.
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            futures = {pool.submit(candidates_for, row, args.verbose): row
                       for row in rows}
            for fut in as_completed(futures):
                row = futures[fut]
                done += 1
                try:
                    cands = fut.result()
                except Exception as exc:                  # noqa: BLE001
                    print(f"    {row['id']} failed: {str(exc)[:90]}")
                    counts["failed"] += 1
                    continue
                measure(conn, row["id"], cands)
                picked = pick(cands, row)
                n = store(conn, row["id"], picked) if picked else 0
                counts["images"] += n
                by_country[row["country"]][1] += 1
                if n:
                    counts["with_photos"] += 1
                    by_country[row["country"]][0] += 1
                else:
                    counts["no_photo"] += 1
                    mark_empty(conn, row["id"], len(cands), len(row["points"]))
                if done % 100 == 0 or done == len(rows):
                    rate = done / max(time.time() - t0, 1e-9)
                    print(f"  {done}/{len(rows)} routes ({rate:.1f}/s), "
                          f"{counts['images']:,} photographs, "
                          f"{counts['no_photo']} without")

        print("\n" + "=" * 58)
        print(f"{counts['images']:,} photographs on {counts['with_photos']:,} "
              f"routes; {counts['no_photo']:,} routes found nothing usable")
        for cc in sorted(by_country):
            got, tot = by_country[cc]
            print(f"  {cc}: {got}/{tot} routes with a photograph")


if __name__ == "__main__":
    main()
