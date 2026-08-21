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
    python pipeline/trails/trail_images.py --rescore    # offline re-rank
"""

import argparse
import json
import os
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

# Every candidate a route's probes turned up, kept on disk.
#
# Scoring is the part that gets tuned, and tuning it used to mean asking
# Commons for 30,000 files again: two and a half hours of somebody else's
# bandwidth to answer a question we already had the data for. With this, a
# scoring change is `--rescore` and costs nothing but local CPU. Only the
# fields the scorer and the writer read are stored, so the whole cache is
# tens of megabytes rather than hundreds.
CACHE_DIR = ROOT / "cache" / "trails" / "photos"
# title -> [category names]. One shared file rather than per route, because a
# popular file turns up in a dozen routes' candidate lists and its categories
# are a property of the file, not of the walk.
CATEGORY_CACHE = ROOT / "cache" / "trails" / "photo_categories.json"
CACHE_KEEP = ("url", "thumburl", "thumbwidth", "thumbheight", "width", "height")
CACHE_META = ("LicenseShortName", "LicenseUrl", "Artist", "ImageDescription")


def cache_path(tid):
    return CACHE_DIR / f"{int(tid)}.json"


def cache_read(tid):
    try:
        return json.loads(cache_path(tid).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def cache_write(tid, cands):
    """Store the candidates, trimmed to what scoring and writing need."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    slim = []
    for c in cands:
        info = c.get("info") or {}
        meta = info.get("extmetadata") or {}
        slim.append({
            "title": c["title"],
            "lat": c.get("lat"), "lon": c.get("lon"),
            "info": {
                **{k: info.get(k) for k in CACHE_KEEP if info.get(k) is not None},
                # Truncated: the scorer reads the first 200 characters of the
                # description and the writer ships 280, but Commons hands back
                # whole HTML paragraphs, which took the cache from the tens of
                # megabytes intended to about 50 KB per route.
                "extmetadata": {
                    k: {"value": str((meta.get(k) or {}).get("value") or "")[:400]}
                    for k in CACHE_META if meta.get(k)},
            },
        })
    tmp = cache_path(tid).with_suffix(".json.tmp")
    tmp.write_text(json.dumps(slim, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, cache_path(tid))


# How many titles one categories request may ask about. 50 is the MediaWiki
# limit for anonymous clients, and it turns 122,000 candidate files into 2,446
# requests: about eight minutes, once, against a cache that then answers every
# later scoring change for free.
CATEGORY_BATCH = 50


def load_categories():
    try:
        return json.loads(CATEGORY_CACHE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_categories(table):
    CATEGORY_CACHE.parent.mkdir(parents=True, exist_ok=True)
    tmp = CATEGORY_CACHE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(table, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, CATEGORY_CACHE)


# Pace for the categories endpoint, seconds between batches.
#
# The shared MediaWiki client paces at 0.2 s, which is right for a geosearch
# and far too fast for this: fifty titles with cllimit=max is a much heavier
# query and Commons answered with a wall of 429s. Half a second turns 2,446
# batches into about twenty minutes, which is the polite price of asking one
# big question once instead of many small ones forever.
CATEGORY_PACE_S = 1.2
# Only the candidates actually in contention get a category lookup. Asking
# about all 122,256 cached files was both slow and rude: Commons answered with
# a wall of 429s, and the great majority of those files cannot reach a gallery
# slot on any other signal, so their categories would never change a pick. The
# top dozen per route covers every file a category bonus could realistically
# lift into the hero slot, and cuts the work by roughly two thirds.
CATEGORY_TOP_N = 12
# Save this often, so a run interrupted at batch 2,000 does not start again
# at batch zero.
CATEGORY_SAVE_EVERY = 100


def fetch_categories(titles, table, verbose=False):
    """Fill `table` with the Commons categories of every title not in it.

    Categories are the best subject signal Commons has. A filename can be
    IMG_4821 and a description can be empty, but somebody has almost always
    filed the photograph under "Category:Hiking trails in Tyrol" or
    "Category:Churches in Wallonia", and that is exactly the distinction this
    pass exists to make. The peer-reviewed quality categories ride along:
    "Quality images" and "Featured pictures on Wikimedia Commons" are the
    closest thing to an objective "this is a good photograph" that free data
    offers."""
    todo = [t for t in titles if t not in table]
    if not todo:
        return 0
    done = 0
    for start in range(0, len(todo), CATEGORY_BATCH):
        batch = todo[start:start + CATEGORY_BATCH]
        time.sleep(CATEGORY_PACE_S)
        try:
            data = mediawiki({"titles": "|".join(batch),
                              "prop": "categories", "cllimit": "max",
                              "clshow": "!hidden"}, api=COMMONS_API)
        except (SourceError, ValueError, KeyError):
            continue
        for page in (data.get("query") or {}).get("pages") or []:
            title = page.get("title")
            if not title:
                continue
            table[title] = [c["title"].replace("Category:", "")
                            for c in (page.get("categories") or [])]
        for t in batch:
            table.setdefault(t, [])       # asked and answered, even if empty
        done += len(batch)
        batch_no = start // CATEGORY_BATCH
        if batch_no and batch_no % CATEGORY_SAVE_EVERY == 0:
            save_categories(table)
        if verbose or batch_no % 100 == 0:
            print(f"  categories {done}/{len(todo)}", flush=True)
    return done


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
    r"\b(view|views|vista|panorama|panoramic|aussicht|ausblick|blick|utsikt|"
    r"vue|paesaggio|landscape|landschaft|paysage|scenery|scenic|"
    r"valley|tal|vallee|valle|dolina|"
    r"summit|peak|gipfel|sommet|cima|vrh|szczyt|ridge|grat|crete|arete|"
    r"trail|path|weg|pfad|sentier|sentiero|senda|pot|staza|track|"
    r"hike|hiking|wandern|wanderweg|randonnee|"
    r"lake|see|lac|lago|jezero|jezioro|waterfall|wasserfall|cascade|cascata|"
    r"gorge|schlucht|canyon|coast|coastline|cliff|cliffs|klippen|"
    r"glacier|gletscher|mountain|mountains|berg|berge|montagne|montagna|"
    r"fjord|moor|heath|heide|forest|wald|foret|bosco|meadow|alm|"
    r"sunrise|sunset|dawn|dusk)\b",
    re.I)

# Words that say the frame is one built thing, photographed as the subject.
#
# This is the fix for France showing a WALL for the Trophee d'Auguste and a
# village procession for Via Alpina R161: both were genuinely shot on the
# route, so proximity alone cleared them, and nothing in the scoring knew the
# difference between "the view from the path" and "the object beside it".
#
# A penalty, never a veto. A castle or a monastery IS a reason to walk a
# route, and scenic.py already treats them as highlights; the name-match and
# highlight bonuses can still outweigh this. What it stops is an anonymous
# church winning the hero slot over a valley.
OBJECT_WORDS = re.compile(
    r"\b(church|chapel|kirche|kapelle|kostel|kaple|cerkev|crkva|kirke|kyrka|"
    r"iglesia|ermita|chiesa|eglise|kosciol|cerkiew|basilica|cathedral|dom|"
    r"monument|statue|denkmal|memorial|pomnik|spomenik|bust|"
    r"fountain|brunnen|fontaine|fontana|well|"
    r"gate|portal|door|tuer|window|fenster|facade|fassade|wall|mauer|mur|"
    r"roof|dach|staircase|treppe|stairs|balcony|"
    r"house|haus|maison|casa|villa|farm|hof|barn|scheune|mill|muehle|moulin|"
    r"hotel|restaurant|cafe|inn|gasthaus|shop|laden|"
    r"museum|exhibit|gallery|library|school|schule|"
    r"station|bahnhof|gare|stazione|airport|bridge|bruecke|pont|tunnel|"
    r"cemetery|friedhof|cimetiere|grave|tombstone)\b", re.I)

# People, events and machines. A parade on the route is a photograph of the
# day rather than of the walk, and it dates badly. Vehicles are here because
# the first tightened run put an "Alfa Romeo Giulia Spider" in a French
# gallery: it was photographed on the road the trail crosses, which satisfies
# proximity and says nothing whatever about walking there.
PEOPLE_WORDS = re.compile(
    r"\b(procession|parade|festival|fest|fiesta|feria|market|markt|marche|"
    r"wedding|hochzeit|concert|race|marathon|rally|competition|"
    r"crowd|group|team|portrait|selfie|children|kinder|dancers|"
    r"ceremony|celebration|protest|demonstration|"
    r"car|cars|auto|voiture|automobile|alfa|ferrari|porsche|mercedes|"
    r"motorcycle|motorrad|scooter|bus|tram|lorry|truck|lkw|"
    r"locomotive|wagon|aircraft|airplane|helicopter|boat|yacht|ferry)\b", re.I)


# Commons categories that say the photograph IS the landscape.
CATEGORY_GOOD = re.compile(
    r"(hiking|hiking trails|trails|footpaths|wanderweg|sentiers|"
    r"mountains|mountain|peaks|summits|gipfel|"
    r"landscapes|landscape|landschaften|paysages|paesaggi|"
    r"views |views of|viewpoints|panoramas|aussichts|"
    r"valleys|glaciers|gorges|canyons|waterfalls|"
    r"lakes|rivers of|coast|coastline|cliffs|beaches|"
    r"national park|nature reserve|natural park|naturpark|"
    r"forests|moorland|heathland|alpine|"
    r"sunrises|sunsets)", re.I)

# Categories that say the photograph is a thing beside the path.
CATEGORY_BAD = re.compile(
    r"(church|churches|chapel|chapels|cathedral|basilica|monaster|abbey|"
    r"interiors|altars|stained glass|frescoes|"
    r"buildings|houses|architecture|facades|doors|windows|roofs|"
    r"monuments|statues|sculptures|memorials|plaques|"
    r"museums|libraries|schools|hospitals|"
    r"railway stations|bus stations|airports|"
    r"automobiles|cars |motorcycles|buses|trams|locomotives|aircraft|"
    r"cemeteries|graves|tombs|"
    r"people of|men |women |children|portraits|festivals|processions|"
    r"street|streets|signs|signage|maps of|coats of arms)", re.I)

# Peer review, and the only objective quality signal free data offers.
CATEGORY_QUALITY = re.compile(
    r"(quality images|featured pictures|valued images|"
    r"pictures of the year|wiki loves earth|wiki loves monuments)", re.I)

# Classes of image that can NEVER be a photograph of a walk, whatever else
# they score. Vetoes rather than penalties, because no combination of other
# signals should be able to rescue them.
#
# This is the single worst thing the layer was shipping and it took the
# category pass to see it. Commons holds thousands of ISS Earth-observation
# frames, and every one carries the coordinates of the ground it shows, so a
# geosearch along an alpine path returns photographs taken from orbit. They
# then scored WELL: "ISS053-E-58586 - View of Earth.jpg" is landscape framed,
# enormous, and the word "View" earned it the view bonus. 415 of 12,170
# published frames were these, orthophoto rasters, or 360 degree spherical
# panoramas that render as a distorted smear in a card.
#
# Ordinary panoramas are deliberately NOT here: a wide shot from a ridge is
# exactly what this layer wants. Only the equirectangular and spherical ones,
# which are a projection rather than a picture, are refused.
JUNK_CATEGORY = re.compile(
    r"(earth (viewed|seen|observed) from space|"
    r"iss expedition|crew earth observations|astronaut photography|"
    r"satellite (images|imagery|pictures)|images by nasa|"
    r"orthophoto|aerial survey|"
    r"from mapillary|mapillary$|"
    r"360.{0,4} panoramas?|spherical panoramas?|equirectangular)", re.I)

# The same classes recognised from the file name, for the files Commons has
# not categorised. "ISS065-E-295085" is the ISS frame naming scheme and
# "DOP20" is the German orthophoto product code.
JUNK_FILE_RE = re.compile(
    r"^iss\d{3}-e-\d+|"
    r"\bdop_?\d{2}\w*|\b(orthophoto|luftbild[- ]senkrecht)\b|"
    r"\b(spherical|equirectangular)\b|"
    r"\b360.{0,3}(panorama|photo|view)\b|"
    r"\bview of earth\b", re.I)


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

# The scenic kinds whose presence makes a photograph likely to BE a view
# rather than to contain an object. A camera standing on a summit or at a
# marked viewpoint is pointed at the landscape; that is what the tag is for.
VIEW_KINDS = ("peak", "volcano", "viewpoint", "waterfall", "glacier",
              "gorge", "arch", "lake", "beach")
# Envelope for the nearest-landmark lookup, in degrees. Generous on purpose:
# the exact metric distance comes back with the row and scoring decides.
VIEW_PAD_DEG = 0.01

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
           ST_LineLocatePoint(r.line, s.geom) * r.len AS along_m,
           v.kind AS view_kind,
           v.dist AS view_m
    FROM shot s
    CROSS JOIN route r
    LEFT JOIN LATERAL (
        SELECT p.kind,
               ST_Distance(p.geom::geography, s.geom::geography) AS dist
        FROM scenic_pois p
        WHERE p.geom && ST_Expand(s.geom, %(pad)s)
          AND p.kind = ANY(%(kinds)s)
        ORDER BY p.geom <-> s.geom
        LIMIT 1
    ) v ON true
"""


def measure(conn, tid, cands):
    """Exact distance off the line and distance along it, per candidate."""
    import json
    pts = [{"k": i, "lat": c["lat"], "lon": c["lon"]}
           for i, c in enumerate(cands) if c["lat"] is not None]
    if not pts:
        return
    with conn.cursor() as cur:
        cur.execute(MEASURE_SQL, {"tid": tid, "pts": json.dumps(pts),
                                  "pad": VIEW_PAD_DEG,
                                  "kinds": list(VIEW_KINDS)})
        for k, off_m, along_m, view_kind, view_m in cur.fetchall():
            cands[k]["off_m"] = off_m
            cands[k]["along_m"] = along_m
            cands[k]["view_kind"] = view_kind
            cands[k]["view_m"] = view_m


# How close the camera has to have stood to a summit, viewpoint or waterfall
# for that to say anything about where it was pointed.
VIEW_NEAR_M = 180
VIEW_FAR_M = 400
# For the last-resort evidence rule: close enough that the camera was standing
# on the path rather than merely in the same field.
VIEW_ON_PATH_M = 120


def view_evidence(cand, row, cats):
    """Is there any positive reason to believe this frame is a VIEW?

    Four independent claims, any one of which counts: Commons filed it under a
    landscape category, the file name or caption says so, the camera stood at a
    summit or viewpoint, or the file is named after this route or a landmark on
    it. A photograph with none of these may still be perfectly good, and it can
    still fill a gallery slot; what it cannot do is become the hero, because
    the hero is what the card claims the walk looks like."""
    bare = cand["title"][5:] if cand["title"].startswith("File:") else cand["title"]
    folded = fold(bare)
    if JUNK_FILE_RE.search(bare) or any(JUNK_CATEGORY.search(c) for c in cats):
        return False
    if any(CATEGORY_GOOD.search(c) for c in cats):
        return True
    if GOOD_WORDS.search(folded):
        return True
    view_m = cand.get("view_m")
    if view_m is not None and view_m <= VIEW_FAR_M:
        return True
    tokens = {w for w in re.split(r"[^a-z0-9]+", fold(row.get("title") or ""))
              if len(w) >= 4}
    if tokens and any(w in folded for w in tokens):
        return True

    # Last resort, and the one that keeps coverage honest rather than merely
    # high: a landscape-shaped frame taken right ON the path, whose name and
    # caption say nothing about a building, a vehicle or a crowd, and which
    # Commons has not filed under one either. Most of Europe's forest and
    # moorland walks are photographed by people who name the file IMG_2231 and
    # add no category at all, and refusing every one of those cost 605 routes
    # their picture for no gain in truthfulness.
    info = cand.get("info") or {}
    width, height = info.get("width") or 0, info.get("height") or 0
    off_m = cand.get("off_m")
    caption = fold(strip_html(((info.get("extmetadata") or {})
                               .get("ImageDescription") or {}).get("value", "")))
    text = folded + " " + caption[:200]
    clean = not (OBJECT_WORDS.search(text) or PEOPLE_WORDS.search(text)
                 or any(CATEGORY_BAD.search(c) for c in cats))
    on_path = off_m is not None and off_m <= VIEW_ON_PATH_M
    landscape = height and (width / height) >= 1.3
    return bool(clean and on_path and landscape)


def score_image(cand, row, categories=None):
    """How likely this file is to be a usable photograph OF this walk."""
    title = cand["title"]
    bare = title[5:] if title.startswith("File:") else title
    info = cand["info"]
    if (BAD_FILE_RE.search(bare) or SPECIES_RE.match(bare)
            or BINOMIAL_RE.search(bare) or JUNK_FILE_RE.search(bare)):
        return -1
    if any(JUNK_CATEGORY.search(c) for c in (categories or [])):
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
    # candidate limit. Slightly below its original weight, because proximity
    # alone was letting a wall on the path beat a valley just off it.
    score += 2.0 * max(0.0, 1.0 - (off_m / CANDIDATE_M)) ** 0.7

    # Framing. Aspect ratio is the cheapest honest signal for "is this a view
    # or a thing": a photographer framing a landscape turns the camera
    # sideways, and a photographer framing a church tower does not. Graded
    # rather than a flat "wider than tall", so a 16:9 panorama outranks a
    # barely-landscape 5:4 snapshot, and portrait is actively penalised.
    ratio = width / height if height else 1.0
    if ratio >= 1.7:
        score += 1.3
    elif ratio >= 1.25:
        score += 0.85
    elif ratio >= 0.95:
        score += 0.05                     # square, says nothing either way
    else:
        score -= 0.9                      # portrait: an object, a person or a tower

    folded = fold(bare)
    caption = fold(strip_html(((info.get("extmetadata") or {})
                               .get("ImageDescription") or {}).get("value", "")))
    text = folded + " " + caption[:200]

    name_tokens = {w for w in re.split(r"[^a-z0-9]+", fold(row.get("title") or ""))
                   if len(w) >= 4}
    if name_tokens and any(w in folded for w in name_tokens):
        score += 1.6
    if GOOD_WORDS.search(text):
        score += 1.3
    for f in ((row.get("highlights") or {}).get("features") or []):
        token = fold(f.get("name") or "")
        if len(token) >= 4 and token in folded:
            score += 0.9
            break

    # Subject penalties. Read on the file name AND the uploader's description,
    # because plenty of files are named "IMG_4821" and described "the parish
    # church seen from the square".
    if OBJECT_WORDS.search(text):
        score -= 1.1
    if PEOPLE_WORDS.search(text):
        score -= 1.4

    # Where the camera stood. A frame shot at a summit, a marked viewpoint or a
    # waterfall is pointed at the landscape almost by definition, and unlike
    # every word-based signal this one cannot be fooled by a filename. The
    # landmarks come from scenic.py, so this costs nothing but a spatial join.
    view_m = cand.get("view_m")
    if view_m is not None:
        if view_m <= VIEW_NEAR_M:
            score += 1.1
        elif view_m <= VIEW_FAR_M:
            score += 0.5

    # Commons categories: the strongest subject signal available, because a
    # human filed the photograph under what it shows rather than under what
    # the uploader happened to call the file.
    cats = categories or []
    if any(CATEGORY_QUALITY.search(c) for c in cats):
        score += 1.5                      # peer reviewed as a good photograph
    if any(CATEGORY_GOOD.search(c) for c in cats):
        score += 1.4
    if any(CATEGORY_BAD.search(c) for c in cats):
        score -= 1.6

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

# The two acceptance bars, swept against the cached French candidates rather
# than guessed (that is what --rescore and the candidate cache are for):
#
#   bar    routes with a photo   hero is an object   hero is a view
#   0.6 / 0.0     138 / 144            6%                 59%
#   1.2 / 2.0     134 / 144            4%                 60%
#   1.2 / 2.4     129 / 144            4%                 63%
#
# 1.2 / 2.0 is where the curve turns: it removes a third of the object heroes
# for four routes of coverage, and everything past it costs five routes per
# three points. The hero bar is the stricter of the two on purpose. A weak
# picture in the gallery is a weak picture; a weak picture as the hero is what
# the whole card says the walk looks like, and no picture is better than a
# misleading one.
MIN_SCORE = 1.2
MIN_HERO_SCORE = 2.0


def pick(cands, row, categories=None):
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
    cats = categories or {}
    scored = []
    seen_subjects = {}
    for c in cands:
        c_cats = cats.get(c["title"]) or []
        s = score_image(c, row, c_cats)
        if s < MIN_SCORE:
            continue
        c["score"] = s
        c["is_view"] = view_evidence(c, row, c_cats)
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
    # The hero has to be a view, not merely the best-scoring frame near the
    # path. Prefer the strongest candidate that carries view evidence; if none
    # does, the card keeps its route glyph and says nothing, which is the
    # honest answer to "what does this walk look like".
    scored.sort(key=lambda c: (not c["is_view"], -c["score"]))
    if not scored[0]["is_view"] or scored[0]["score"] < MIN_HERO_SCORE:
        return []
    hero = scored[0]
    # Everything after the hero ranks on score alone, so a good frame with no
    # view wording still fills a gallery slot.
    scored[1:] = sorted(scored[1:], key=lambda c: -c["score"])
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


def contested_titles(conn, countries, verbose=False):
    """The candidate files that could plausibly win a slot on some route.

    Scored WITHOUT categories (that is the thing being fetched), so this is
    the pre-category ranking; the top CATEGORY_TOP_N of each route is kept.
    A file below that cannot be lifted into the hero slot by the category
    bonus alone, so its categories would be bought and never read."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id FROM trips
            WHERE category = 'hike' AND status IN ('approved', 'published')
              AND country = ANY(%s)""", (countries,))
        ids = [r[0] for r in cur.fetchall()]
    ids = [i for i in ids if cache_path(i).exists()]
    rows = {r["id"]: r for r in load_rows(conn, ids)}
    titles = set()
    for n, tid in enumerate(ids, 1):
        row = rows.get(tid)
        cands = cache_read(tid)
        if not row or not cands:
            continue
        measure(conn, tid, cands)
        ranked = sorted(((score_image(c, row), c) for c in cands),
                        key=lambda pair: -pair[0])[:CATEGORY_TOP_N]
        titles.update(c["title"] for sc, c in ranked if sc > 0)
        if verbose and n % 500 == 0:
            print(f"  shortlisted {n}/{len(ids)} routes, "
                  f"{len(titles):,} files", flush=True)
    return sorted(titles)


def rescore(conn, countries, limit=0, verbose=False):
    """Re-rank every route that has cached candidates, offline.

    Deliberately re-picks from the FULL candidate list rather than reordering
    what was published: a scoring change that demotes the old hero has to be
    able to promote a file that never made the gallery."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT t.id FROM trips t
            WHERE t.category = 'hike' AND t.status IN ('approved', 'published')
              AND t.country = ANY(%s)
            ORDER BY t.country, t.id""", (countries,))
        ids = [r[0] for r in cur.fetchall()]
    ids = [i for i in ids if cache_path(i).exists()]
    if limit:
        ids = ids[:limit]
    if not ids:
        print("no cached candidates yet; run the harvest once first")
        return
    cat_table = load_categories()
    print(f"re-scoring {len(ids):,} route(s) from cache "
          f"({len(cat_table):,} files have categories)")
    rows = {r["id"]: r for r in load_rows(conn, ids)}
    counts = Counter()
    for n, tid in enumerate(ids, 1):
        row = rows.get(tid)
        cands = cache_read(tid)
        if not row or not cands:
            continue
        measure(conn, tid, cands)
        picked = pick(cands, row, cat_table)
        # Always store, even with nothing picked: store() clears the route's
        # existing rows first, and a stricter pass has to be able to REMOVE a
        # photograph it no longer endorses. Skipping the call on an empty pick
        # left 758 routes showing frames the new rules had just rejected.
        wrote = store(conn, tid, picked)
        counts["images"] += wrote
        counts["with_photos" if wrote else "no_photo"] += 1
        if n % 500 == 0 or n == len(ids):
            print(f"  {n}/{len(ids)}, {counts['images']:,} photographs",
                  flush=True)
    print(f"\n{counts['images']:,} photographs on {counts['with_photos']:,} "
          f"routes; {counts['no_photo']:,} routes had nothing that scored")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", help="comma separated ISO2")
    ap.add_argument("--refresh", action="store_true",
                    help="re-shoot routes that already have photographs")
    ap.add_argument("--categories", action="store_true",
                    help="fetch Commons categories for every cached candidate "
                         "and stop. One pass, then every later --rescore reads "
                         "them for free.")
    ap.add_argument("--rescore", action="store_true",
                    help="re-rank from the cached candidates, no Commons "
                         "traffic at all. Use after changing score_image().")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    sys.stdout.reconfigure(errors="replace")
    with connect() as conn:
        countries = ([c.strip().upper() for c in args.countries.split(",") if c.strip()]
                     if args.countries else curated_countries(conn))
        if args.categories:
            titles = contested_titles(conn, countries, args.verbose)
            table = load_categories()
            print(f"{len(titles):,} unique candidate files, "
                  f"{len(table):,} already known")
            try:
                fetch_categories(sorted(titles), table, args.verbose)
            finally:
                save_categories(table)
            got = sum(1 for t in titles if table.get(t))
            print(f"categories on {got:,} of {len(titles):,} files")
            return
        if args.rescore:
            rescore(conn, countries, args.limit, args.verbose)
            return
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
        cat_table = load_categories()

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
                cache_write(row["id"], cands)
                measure(conn, row["id"], cands)
                picked = pick(cands, row, cat_table)
                n = store(conn, row["id"], picked)
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
