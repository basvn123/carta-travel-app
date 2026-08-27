"""
audit_hero_images.py - the hero image gate.

Every destination panel opens on one photo, and the panel's whole job is to
make a place look worth the fare. Wikipedia's lead image is usually exactly
that (a skyline, a harbour, a square), but for small towns it is often the
thing an encyclopaedia leads with instead: a locator map, a coat of arms, a
flag, a topographic diagram. Those are correct and useless. This script finds
them and swaps them for a photograph.

Three phases, each resumable and each safe to run on its own:

  check  read every dest.image, resolve the Commons file behind it, and
         classify it from its name, MIME type, pixel size and Commons
         categories. Writes data/reports/hero_images_audit.json.
  fix    for every flagged (or missing) hero, look for a real photograph: the
         images used in the place's own Wikipedia article first, then a
         Commons geosearch around its coordinates. Candidates go through the
         same classifier, so a fix can never be another map. The winner is
         written into cache/wiki_images.json, the SAME cache harvest_images.py
         patches from, so there is one source of truth for dest.image and a
         later `harvest_images.py patch` keeps the fix. (`harvest_images.py
         refresh` drops the cache and would undo it: re-run this after.)
  patch  hand over to harvest_images.patch() so both app_data files pick the
         new images up.

  dupes  a fourth pass, independent of the other three: one photograph
         standing for two DIFFERENT places. Not the same thing as a repeat,
         because four London airport records sharing one skyline is correct.
         See dupes() for how the two are told apart.

Run:  python audit_hero_images.py            # check -> fix -> patch
      python audit_hero_images.py check      # classify only, no writes to data
      python audit_hero_images.py fix        # replace what the last check flagged
      python audit_hero_images.py dupes      # re-photograph the wrong-place repeats
      python audit_hero_images.py fix --only ID --by-coord   # repair by coordinate
      python audit_hero_images.py patch      # cache -> app_data
      python audit_hero_images.py stats      # last report, no network

Flags: --limit N (stop after N dests), --only ID[,ID] (just these),
       --dry-run (fix without writing the cache).

Sibling stage: pipeline/features/enrich_images.py does the same job one layer
down, for feature photos (beaches, summits), with its own candidate ladder and
its own reject vocabulary (junk_shape / aspect_unusable / too_small). This one
covers destination heroes, where the candidates come from the place's own
article rather than from a feature's coordinates. The reasons here are finer
grained on purpose: "map" and "collage" and "satellite" are all junk_shape, but
a report that says which one is a report you can act on.

Everything ASCII-clean (no emoji/dingbats) per project convention.
"""
import json
import math
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

from pipeline_io import atomic_write_json, load_json

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
PRIMARY = ROOT / "app_data" / "app_data.json"
IMG_CACHE = ROOT / "cache" / "wiki_images.json"          # shared with harvest_images.py
META_CACHE = ROOT / "cache" / "hero_image_meta.json"     # file title -> Commons metadata
REPORT = ROOT / "data" / "reports" / "hero_images_audit.json"

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
EN_API = "https://en.wikipedia.org/w/api.php"
THUMB_PX = 960
DELAY_S = 0.25
BACKOFFS = [5, 15, 30]
BATCH = 50                      # titles per API call (the anonymous limit)

HEADERS = {
    "User-Agent": "CartaTravelApp/1.0 (portfolio project; contact data@carta-europetravel.com)",
    "Accept": "application/json",
}

# ── What disqualifies a hero ────────────────────────────────────────────────
# Matched against the file name AND the Commons categories, so a map called
# "Gemeente_Sluis.png" is still caught by its "Maps of ..." category, and a
# photograph filed under nothing useful is still caught by its name.
BAD_PATTERNS = [
    ("map", r"(map|maps|mapa|mappa|karte|kaart|kort|kartta|carte|mapy|mapka|"
            r"harta|zemljevid|terkep|mapo|locator|orthophoto|topograph\w*|"
            r"relief map|blank map|road map|cadastral)"),
    ("satellite", r"(satellite|sentinel[- ]?\d|landsat|spot ?\d{1,2}|copernicus|"
                  r"from space|seen from orbit|iss\d{3}[- ]?\w?|astronaut photograph|"
                  r"nasa earth observatory|esa\d{4,})"),
    ("emblem", r"(coat of arms|coats of arms|coa|wappen|blason|blazon|escudo|"
               r"herb|stemma|grb|erb|znak|vaakuna|vapen|flag|flags|flaga|"
               r"bandera|bandiera|vlag|drapeau|lippu|seal|seals|emblem|logo|"
               r"insignia|crest)"),
    ("diagram", r"(diagram|chart|graph|schema|scheme|blueprint|floor ?plan|"
                r"site plan|cross[- ]section|timeline|infographic)"),
    ("collage", r"(collage|montage|photomontage)"),
    ("document", r"(manuscript|charter|document|scan of|title page|coin|"
                 r"banknote|stamp|postage|signature)"),
]
# Two readings of the same word list. On the FILE NAME anything goes: the word
# can sit anywhere ("Position of Vagar on Faroe map"). On a CATEGORY it has to
# lead ("Maps of Italy", "Flags of Spain"), because Commons files photographs
# under categories like "Buildings with flags in Italy", and a facade of La
# Scala is not a flag.
BAD_NAME_RE = [(tag, re.compile(r"\b" + pat + r"\b", re.I)) for tag, pat in BAD_PATTERNS]
# Emblems are excluded from the category pass entirely. Commons files a
# photograph that merely SHOWS a flag under "Flags in Gloucestershire", and
# that caught a street in Cirencester, a city hall in Hull and a theme park in
# Kaatsheuvel. A file that IS a flag or a coat of arms says so in its name.
BAD_CAT_RE = [(tag, re.compile(r"^(svg |png |historical |old )?" + pat + r"\b", re.I))
              for tag, pat in BAD_PATTERNS if tag != "emblem"]
# A hero sells what a place looks like now. Commons is full of what it looked
# like in 1890, and of paintings of what it looked like in 1806, and those win
# on every other signal: they name the town, they are large, they are the
# article's lead. A four-digit year before 1980 in the file name, or a category
# that says painting, is enough to say "true, and not what we are selling".
# A hotel called 1900 loses its photo to this rule. That costs one candidate
# out of a ladder; shipping a Turner as a holiday photo costs the panel.
HISTORICAL = re.compile(
    r"\b(1[5-9]\d{2}|19[0-7]\d)\b|"
    r"\b(painting|paintings|engraving|etching|lithograph|woodcut|drawing|"
    r"watercolou?r|gemalde|gemaelde|oil on canvas|photochrom|glass plate|"
    r"postcard|ansichtskarte|carte postale|daguerreotype|"
    r"historical (photo|image|picture)s?|old photographs?|"
    r"19[0-7]0s|19[0-7]0er|19[0-7]0-es|[2-9]0-tallet|annees 19[0-7]0)\b", re.I)

# A photo of a real thing whose name happens to carry a bad word: a street
# called "Kortestraat", a hotel called "The Map Room". Checked before flagging.
SAFE_HINTS = re.compile(
    r"\b(panorama|skyline|view|vista|aerial|beach|harbou?r|castle|church|"
    r"cathedral|bridge|square|street|old town|sunset|sunrise|photo)\b", re.I)

# Things that are genuinely photographed at a destination and genuinely wrong
# as its one photo. An airport terminal names the city in every filename, and a
# butterfly caught inside the search radius scores as well as a skyline unless
# somebody says otherwise. These do not disqualify a hero that is already in
# place, they only lose the competition to replace one.
OFF_SUBJECT = re.compile(
    r"\b(airport|aeropuerto|aeroporto|flughafen|luchthaven|lufthavn|terminal|"
    r"runway|taxiway|apron|aircraft|airbus|boeing|embraer|cockpit|"
    r"butterfly|moth|beetle|insect|spider|snail|lizard|orchid|fungus|"
    r"mushroom|lichen|caterpillar|bird of|passerine|"
    r"plaque|street sign|signpost|road sign|number plate|"
    r"interior of|exhibit|showcase|display case|"
    r"grave|tombstone|cemetery|gravestone|"
    r"bomber|fighter aircraft|warplane|biplane|helicopter|"
    r"locomotive|steam engine)\b", re.I)

# Subjects that are never a destination hero, recognised from the file's
# CATEGORIES rather than its name, because the name is often just a code
# ("11.07.16 Rovaniemi Sr1 3022" is a locomotive and says so nowhere).
#
# Every phrase here was read off a file this pipeline actually mis-picked.
# The tempting general rule, "a category shaped like a Latin binomial is a
# species", was measured against the 90,285 categories in the cache and
# matched 1,657 of them: "With insignia", "Extracted images", "Pirot
# fortress", "Antiparos castle". It is not in here for that reason.
OFF_CATS = re.compile(
    r"\b(air force|aviation museum|aircraft|bomber|squadron|airliner|"
    r"rail transport|trains at|train stations|locomotive|railcar|"
    r"rolling stock|multiple units|class sr\d|"
    r"flora of|fauna of|insects of|birds of|fungi of|"
    r"taxa |species of )", re.I)

# Real photographs of the place that still make a poor first impression: a bus
# in service, a golf course, a retail park. These lose to any postcard, but a
# soft penalty keeps them ahead of the map they would be replacing, so a town
# with nothing better still gets something true.
WEAK_SUBJECT = re.compile(
    r"\b(bus (line|stop|station|depot|terminal)|trolleybus|coach station|"
    r"tram (line|stop|depot)|locomotive|freight|shunting|"
    r"railway station|train station|bahnhof|estacion de tren|gare de |"
    r"golf course|campo de golf|driving range|stadium|sports (hall|centre|center)|"
    r"swimming pool|leisure centre|"
    r"car park|parking lot|roundabout|petrol station|gas station|"
    r"shopping (centre|center|mall)|supermarket|retail park|"
    r"industrial (estate|park|zone)|warehouse|power station|substation)\b", re.I)

# Below this a 960px hero is upscaled mush.
MIN_W, MIN_H = 800, 450
# A 5:1 strip or a tall portrait both crop badly into the panel's 16:9 band.
MAX_AR, MIN_AR = 3.2, 0.62

# The frame the RANKING prefers, which is wider than the band the flags
# tolerate: the .places-dcard hero crops to 12/5, and best_replacement should
# hand it a photograph that fills that crop. The flags above are untouched on
# purpose: 0.62 and 3.2 decide what is broken, this only decides what is
# preferred among candidates that are not.
HERO_FRAME_AR = 12 / 5

# Squarer than this and the 12/5 crop keeps under 55% of the frame's shape,
# the same crop survival cut the country cover picker refuses at. Not broken
# the way a portrait is, so it gets its own reason: fix() only swaps a hero
# flagged narrow alone when the replacement actually clears this bar.
NARROW_AR = HERO_FRAME_AR * 0.55

PHOTO_MIME = {"image/jpeg", "image/png", "image/webp"}


# ── Small helpers ───────────────────────────────────────────────────────────
def fold(s):
    """Accent- and case-free key, so 'Málaga' matches 'malaga'."""
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def readable(file_title):
    """'File:Old_town_of_Sibiu_(cropped).jpg' -> 'Old town of Sibiu (cropped)'."""
    t = re.sub(r"^File:", "", file_title or "")
    t = re.sub(r"\.\w{3,4}$", "", t)
    return t.replace("_", " ").strip()


def file_title_from_url(url):
    """The Commons file behind a thumbnail or original URL, as 'File:Name.jpg'.

    Both shapes appear in the data:
      .../wikipedia/commons/thumb/2/2a/NAME.JPG/960px-NAME.JPG
      .../wikipedia/commons/2/2a/NAME.JPG
    """
    if not url:
        return None
    path = urllib.parse.urlparse(url).path
    # The REST/local-language pass writes Special:FilePath links, where the
    # file name is the last segment and there are no hash directories.
    if "Special:FilePath" in path:
        name = urllib.parse.unquote(path.split("Special:FilePath/")[-1]).strip("/")
        return ("File:" + name.replace("_", " ")) if name else None
    parts = [p for p in path.split("/") if p]
    # upload.wikimedia.org/wikipedia/<project>/... where project is "commons"
    # or a language edition holding a local upload (Casa de la Vall lives on
    # en.wikipedia, not Commons).
    if "wikipedia" not in parts:
        return None
    project = parts[parts.index("wikipedia") + 1] if len(parts) > parts.index("wikipedia") + 1 else None
    if not project:
        return None
    rest = parts[parts.index("wikipedia") + 2:]
    if rest and rest[0] == "thumb":
        rest = rest[1:]
    # rest = [hash1, hash2, NAME.EXT, (thumbname)]
    if len(rest) < 3:
        return None
    name = urllib.parse.unquote(rest[2])
    # Spaces, not underscores: the API normalises titles that way and answers
    # under the normalised form, so asking with underscores means every lookup
    # misses its own reply. A local upload is tagged so the metadata pass knows
    # to ask that wiki instead of Commons.
    title = "File:" + name.replace("_", " ")
    return title if project == "commons" else f"{project}@{title}"


def fetch(api, params):
    url = api + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    for i, back in enumerate([0] + BACKOFFS):
        if back:
            time.sleep(back)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            if i == len(BACKOFFS):
                print(f"    ! give up: {e}")
                return None
    return None


def commons_meta(titles, cache, use_cache=True):
    """{file title -> {mime,width,height,cats,name}} for up to any number of
    files, batched 50 at a time and memoised in cache/hero_image_meta.json.

    A title may be prefixed "<lang>@" for a file uploaded to that language
    edition rather than Commons; those are asked of their own wiki."""
    todo = [t for t in dict.fromkeys(titles)
            if t and (not use_cache or t not in cache
                      # A record written before coordinates were collected
                      # cannot answer the place question, so it is re-asked.
                      or (cache.get(t) is not None and "co" not in cache[t]))]
    by_api = {}
    for t in todo:
        lang, sep, bare = t.partition("@")
        # File names carry "@" of their own ("File:Village@dusk.jpg"), so a
        # prefix only counts when it looks like a language code AND what
        # follows is a file title.
        if sep and re.fullmatch(r"[a-z]{2,3}", lang) and bare.startswith("File:"):
            by_api.setdefault(f"https://{lang}.wikipedia.org/w/api.php", []).append((t, bare))
        else:
            by_api.setdefault(COMMONS_API, []).append((t, t))
    for api, pairs in by_api.items():
        _meta_batch(api, pairs, cache)
    return cache


def _denorm(norm, title):
    """The name we asked with, given the one the API answered under."""
    for src, dst in norm.items():
        if dst == title:
            return src
    return title


def _meta_batch(api, pairs, cache):
    """pairs = [(cache key, wiki title)] for ONE api endpoint."""
    keyed = {bare: key for key, bare in pairs}
    todo = [bare for _, bare in pairs]
    for i in range(0, len(todo), BATCH):
        chunk = todo[i:i + BATCH]
        data = fetch(api, {
            "action": "query", "format": "json", "formatversion": "2",
            "titles": "|".join(chunk),
            "prop": "imageinfo|coordinates",
            "iiprop": "size|mime|extmetadata|url",
            "iiextmetadatafilter": "Categories|ObjectName|Assessments",
            # Both the camera position and the object position, when the
            # uploader gave either. This is the only evidence on Commons that
            # answers "is this photograph OF this place" rather than "is it
            # NAMED like this place", which is the question name collisions
            # sail straight through.
            "coprop": "type|globe",
            "coprimary": "all",
            "colimit": "max",
        })
        query = (data or {}).get("query") or {}
        # The API answers under its own normalisation ("File:A b.jpg"), so keep
        # a from -> to map and store the result under BOTH names.
        norm = {n.get("from"): n.get("to") for n in (query.get("normalized") or [])}
        got = set()
        for p in query.get("pages") or []:
            title = p.get("title")
            got.add(title)
            info = (p.get("imageinfo") or [{}])[0]
            ext = info.get("extmetadata") or {}
            cats = (ext.get("Categories") or {}).get("value") or ""
            # Earth coordinates only: Commons also carries Moon and Mars.
            coords = [[c.get("lat"), c.get("lon")] for c in (p.get("coordinates") or [])
                      if c.get("globe", "earth") == "earth"
                      and isinstance(c.get("lat"), (int, float))
                      and isinstance(c.get("lon"), (int, float))]
            rec = {
                "mime": info.get("mime"),
                "width": info.get("width"),
                "height": info.get("height"),
                "cats": cats.replace("|", "; "),
                "name": (ext.get("ObjectName") or {}).get("value") or readable(title),
                "descurl": info.get("descriptionurl"),
                "url": info.get("url"),
                # [] means "asked, none published"; a missing key means the
                # record predates this field and must be asked again.
                "co": coords,
                "assess": (ext.get("Assessments") or {}).get("value") or "",
            }
            # Store under the cache key the caller asked with (which carries
            # the "<lang>@" prefix for a local upload), plus the raw and
            # normalised wiki titles.
            for name in {title, keyed.get(title), keyed.get(_denorm(norm, title))}:
                if name:
                    cache[name] = rec
        for miss in chunk:
            key = keyed.get(miss, miss)
            if miss not in got and key not in cache:
                cache[key] = None       # unknown file: do not ask again this run
        time.sleep(DELAY_S)
    return cache


# How far a photograph may sit from its destination and still be a
# photograph OF it. A town's own pictures cluster inside a couple of km; the
# allowance is wide because a destination's coordinate is one point and a
# place is not, and because a hilltop view of a town is taken from outside it.
# `area` destinations (the Amalfi Coast, the Dolomites) are whole regions.
PLACE_KM = 30.0
AREA_KM = 70.0

# Past this, the photograph is not of this place and no destination is big
# enough to argue otherwise. The split matters because the two bands need
# different handling, which a single threshold got wrong:
#
#   30 to 300 km   ambiguous, and mostly innocent. The catalogue's areas,
#                  counties and gateway airports really do spread this far:
#                  the Cotswolds, Kerry, Val d'Orcia and Tenerife North all
#                  flagged at 34 to 64 km with perfectly good photographs.
#                  Reported as `far_coord`, never auto-replaced.
#   over 300 km    certain. Guadalajara in Spain was showing Guadalajara in
#                  Mexico (9,344 km), Camp Adventure Forest in Denmark was
#                  showing the Canton Tower (8,595 km), Edessa in Greece was
#                  showing Urfa Castle, Frankfurt an der Oder was showing
#                  Frankfurt am Main. Auto-replaced.
#
# Commons carries wrong coordinates too (Venezia aerial view is geotagged in
# Zakynthos, 1,110 km out), so this band will occasionally re-pick a photo
# that was fine. That costs little: the replacement is drawn from the
# destination's OWN curated view pool, so Venice gets another Venice.
CERTAIN_KM = 300.0


def dest_km_limit(d):
    return AREA_KM if (d.get("place") or {}).get("class") == "area" else PLACE_KM


def dest_point(d):
    lat = d.get("city_lat") if d.get("city_lat") is not None else d.get("lat")
    lon = d.get("city_lon") if d.get("city_lon") is not None else d.get("lon")
    return lat, lon


def photo_km(meta, d):
    """Km from the destination to the nearest coordinate the file publishes,
    or None when the file publishes none (about three files in four)."""
    if not meta:
        return None
    co = meta.get("co")
    if not co:
        return None
    lat, lon = dest_point(d)
    if lat is None or lon is None:
        return None
    best = None
    for c in co:
        k = _km_pts(lat, lon, c[0], c[1])
        if best is None or k < best:
            best = k
    return best


def _km_pts(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def classify(file_title, meta, url=None, dest=None):
    """Empty list = a usable hero. Otherwise the reasons it is not."""
    reasons = []
    name = readable(file_title)
    if re.search(r"\.svg$", file_title or "", re.I):
        reasons.append("svg")
    if not meta:
        return reasons or ["unknown_file"]
    # A TIFF or a GIF served through the thumbnailer arrives as a PNG and looks
    # like any other photo; it is only unusable when the raw file is linked.
    rendered = bool(url) and "/thumb/" in url and re.search(r"\.(png|jpe?g)($|\?)", url, re.I)
    if meta.get("mime") and meta["mime"] not in PHOTO_MIME and not rendered:
        reasons.append("not_photo")
    label = re.sub(r"[_/]+", " ", f"{name} ; {meta.get('name') or ''}")
    cats = [c.strip() for c in re.split(r"[;|]", meta.get("cats") or "") if c.strip()]
    safe = SAFE_HINTS.search(name)
    for tag, rx in BAD_NAME_RE:
        if rx.search(label) and not (tag in ("emblem", "document") and safe):
            reasons.append(tag)
    for tag, rx in BAD_CAT_RE:
        if any(rx.match(c) for c in cats):
            reasons.append(tag)
    if HISTORICAL.search(label) or any(HISTORICAL.search(c) for c in cats):
        reasons.append("historical")
    # A flower, an insect or a locomotive is a true photograph taken at the
    # right coordinate and still the wrong picture of a town.
    if any(OFF_CATS.search(c) for c in cats):
        reasons.append("off_subject")
    w, h = meta.get("width") or 0, meta.get("height") or 0
    if w and h:
        if w < MIN_W or h < MIN_H:
            reasons.append("tiny")
        ar = w / h
        if ar > MAX_AR:
            reasons.append("strip")
        elif ar < MIN_AR:
            reasons.append("portrait")
        elif ar < NARROW_AR:
            reasons.append("narrow")
    # The place test. Only ever fires when the file publishes a coordinate, so
    # it never guesses: silence here means "not proven wrong", not "verified".
    if dest is not None:
        km = photo_km(meta, dest)
        if km is not None and km > dest_km_limit(dest):
            reasons.append("wrong_place" if km > CERTAIN_KM else "far_coord")
    return sorted(set(reasons))


# ── check ───────────────────────────────────────────────────────────────────
def check(dests, limit=None, only=None):
    meta_cache = load_json(META_CACHE, {}) or {}
    items = list(dests.items())
    if only:
        items = [(i, d) for i, d in items if i in only]
    if limit:
        items = items[:limit]

    titles, per_dest = [], {}
    missing = []
    for did, d in items:
        url = (d.get("image") or {}).get("url")
        title = file_title_from_url(url)
        if not url:
            missing.append(did)
            continue
        per_dest[did] = title
        if title:
            titles.append(title)

    print(f"Checking {len(per_dest)} heroes ({len(missing)} dests have none)")
    before = len(meta_cache)
    commons_meta(titles, meta_cache)
    atomic_write_json(META_CACHE, meta_cache)
    print(f"  Commons metadata: {len(meta_cache) - before} fetched, {len(meta_cache)} cached")

    flagged, by_reason = [], {}
    for did, title in per_dest.items():
        d = dests[did]
        meta = meta_cache.get(title) if title else None
        url = (d.get("image") or {}).get("url")
        reasons = classify(title, meta, url, dest=d) if title else ["not_wikimedia"]
        if not reasons:
            continue
        for r in reasons:
            by_reason[r] = by_reason.get(r, 0) + 1
        flagged.append({
            "id": did,
            "city": d.get("city"),
            "country": d.get("country"),
            "file": readable(title) if title else None,
            "reasons": reasons,
            "width": (meta or {}).get("width"),
            "height": (meta or {}).get("height"),
            "url": (d.get("image") or {}).get("url"),
            "km": (lambda k: None if k is None else round(k))(photo_km(meta, d)),
        })
    flagged.sort(key=lambda r: (r["reasons"], r["city"] or ""))

    report = {
        "generated": date.today().isoformat(),
        "counts": {
            "destinations": len(items),
            "with_image": len(per_dest),
            "missing": len(missing),
            "flagged": len(flagged),
            "by_reason": dict(sorted(by_reason.items(), key=lambda kv: -kv[1])),
        },
        "missing": missing,
        "flagged": flagged,
        "fixed": (load_json(REPORT, {}) or {}).get("fixed", []),
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_json(REPORT, report)
    print(f"  flagged {len(flagged)} of {len(per_dest)}: {report['counts']['by_reason']}")
    print(f"  report: {REPORT}")
    return report


# ── fix ─────────────────────────────────────────────────────────────────────
# Commons category conventions for "photographs of this place worth looking
# at", best first. These are human-curated: somebody decided each member is a
# VIEW of the place rather than a detail inside it, which is the judgement no
# keyword heuristic makes reliably. Coverage is good (13 of 16 sampled European
# places had "Views of X", several with over a hundred files).
VIEW_CATS = [
    "Views of {}",
    "Aerial photographs of {}",
    "Panoramics of {}",
    "Cityscape of {}",
    "Skylines of {}",
]

# How many files to pull from each category. Commons returns category members
# in ALPHABETICAL order, which carries no quality information at all, so the
# pool has to be deep enough that the good photograph is inside it and the
# scorer can find it. Ronda's "Views of" category holds 139 files and its
# first dozen alphabetically are somebody's 1971 holiday slides.
CAT_LIMIT = 140


def category_images(cat_title, limit=CAT_LIMIT):
    """File titles in a Commons category, or [] when it does not exist."""
    data = fetch(COMMONS_API, {
        "action": "query", "format": "json", "formatversion": "2",
        "list": "categorymembers",
        "cmtitle": cat_title,
        "cmtype": "file",
        "cmlimit": str(limit),
    })
    return [m["title"] for m in ((data or {}).get("query") or {}).get("categorymembers", [])]


def view_candidates(city, limit=CAT_LIMIT):
    """Everything the curated view categories hold for this place name."""
    base = re.sub(r"\s*\(.*?\)\s*", "", city or "").strip()
    if not base:
        return []
    out = []
    for pat in VIEW_CATS:
        for t in category_images("Category:" + pat.format(base), limit):
            if t not in out:
                out.append(t)
        if len(out) >= limit:
            break
    return out[:limit]


def article_images(page_url, city):
    """Every file used in the destination's own Wikipedia article. The lead
    photo is nearly always among them, and everything here is at least about
    the right place."""
    if not page_url:
        return []
    title = urllib.parse.unquote(urllib.parse.urlparse(page_url).path.split("/wiki/")[-1])
    if not title:
        return []
    data = fetch(EN_API, {
        "action": "query", "format": "json", "formatversion": "2",
        "titles": title.replace("_", " "), "redirects": "1",
        "prop": "images", "imlimit": "60",
    })
    pages = ((data or {}).get("query") or {}).get("pages") or []
    if not pages:
        return []
    return [im.get("title") for im in (pages[0].get("images") or []) if im.get("title")]


def geosearch_images(lat, lon, radius=8000, limit=40):
    """Commons files photographed near the place. Second choice: coordinates
    are honest but say nothing about whether a file is any good."""
    if lat is None or lon is None:
        return []
    data = fetch(COMMONS_API, {
        "action": "query", "format": "json", "formatversion": "2",
        "generator": "geosearch",
        "ggscoord": f"{lat}|{lon}", "ggsradius": str(radius),
        "ggslimit": str(limit), "ggsnamespace": "6",
    })
    pages = ((data or {}).get("query") or {}).get("pages") or []
    return [p.get("title") for p in pages if p.get("title")]


def score_candidate(title, meta, city, country, rank=None, lead=False,
                    dest=None, view=False):
    """Higher is better. Nothing here is clever: it prefers big landscape
    photographs that name the place, from the position an editor already
    chose. `rank` is the file's position in the article (0 = first), `lead`
    marks the article's own lead image.

    `view` marks a candidate that came out of a curated "Views of X" category,
    which is a human saying this photograph shows the place rather than
    something inside it. `dest` turns on the distance term: a photograph whose
    published coordinate sits in the town is worth more than one that names the
    town, because names collide and coordinates do not."""
    label = readable(title) + " " + (meta.get("name") or "")
    # "SaynBendorfBahnhof3" hides every word from a -anchored pattern: no
    # boundary before the hump, none before the sequence number either.
    # Commons is full of that filename, so split both before matching.
    label = re.sub(r"(?<=[a-z])(?=[A-Z])|(?<=[A-Za-z])(?=\d)", " ", label)
    name = fold(label)
    cats = fold(meta.get("cats") or "")
    city_key = fold(re.sub(r"\s*\(.*?\)", "", city or ""))
    s = 0.0
    if city_key and city_key in name:
        s += 4
    elif city_key and city_key in cats:
        s += 2
    if fold(country or "") in cats:
        s += 0.5
    # Commons' own assessments, from the Assessments field or the categories
    # that back it. A featured picture went through a community vote.
    assess = fold(meta.get("assess") or "")
    if "featured" in assess or "featured pictures" in cats:
        s += 3
    elif "quality" in assess or "quality images" in cats:
        s += 2
    elif "valued" in assess or "valued images" in cats:
        s += 1
    w, h = meta.get("width") or 0, meta.get("height") or 0
    if w >= 2400:
        s += 1.5
    elif w >= 1600:
        s += 1
    ar = (w / h) if h else 0
    # How much of the photograph survives the 12/5 card crop: a strong
    # preference near the frame's own shape, a little credit for any other
    # landscape, a real penalty for portraits. classify() already rejected the
    # extremes, so no shape is disqualified here.
    if ar >= 1.0:
        fit = min(ar, HERO_FRAME_AR) / max(ar, HERO_FRAME_AR)
        s += 1.5 if fit >= 0.62 else 0.5
    elif ar:
        s -= 1.5
    if SAFE_HINTS.search(label):
        s += 1
    # Somebody filed this under "Views of <place>". That is the exact
    # judgement a hero needs and no keyword can make.
    if view:
        s += 3.5
    if VIEW_WORDS.search(label):
        s += 1.5
    # Distance, when the file says where it was taken. Inside the place beats
    # naming the place; far outside it is disqualifying rather than merely
    # unattractive, which _rank_and_pick enforces separately.
    if dest is not None:
        km = photo_km(meta, dest)
        if km is not None:
            if km <= 2:
                s += 3
            elif km <= 8:
                s += 2
            elif km <= dest_km_limit(dest):
                s += 0.5
            else:
                s -= 12
    # Somebody already decided this photo introduces the place. That beats
    # every heuristic below it.
    if lead:
        s += 5
    elif rank is not None:
        s += max(0.0, 2.5 - rank * 0.35)
    if OFF_SUBJECT.search(label) or any(
            OFF_SUBJECT.search(c) for c in re.split(r"[;|]", meta.get("cats") or "")):
        s -= 6
    # Categories as well as the name: a bus depot rarely says so in its
    # filename, and the whole reason this file has a category vocabulary is
    # that filenames on Commons are frequently just a camera's serial number.
    if WEAK_SUBJECT.search(label) or any(
            WEAK_SUBJECT.search(c) for c in re.split(r"[;|]", meta.get("cats") or "")):
        s -= 3.5
    return s


# Words that mark a photograph as a view OF a place rather than a detail
# inside it. Deliberately small: the curated categories do the real work, this
# only helps where they do not exist.
VIEW_WORDS = re.compile(
    r"\b(view|views|vista|panorama|panoramic|panoramica|skyline|cityscape|"
    r"townscape|aerial|from above|overlook|seen from|vue|vista de|ansicht|"
    r"uitzicht|widok|vy over)\b", re.I)


# country iso2 -> the Wikipedia edition that writes about it best. Same table
# as enrich_images_web.py: a small Spanish town's es.wikipedia article leads
# with a photograph long before en.wikipedia has one at all.
ISO_LANG = {
    "ES": "es", "IT": "it", "FR": "fr", "DE": "de", "AT": "de", "CH": "de",
    "PT": "pt", "NL": "nl", "BE": "nl", "PL": "pl", "CZ": "cs", "SK": "sk",
    "HU": "hu", "GR": "el", "HR": "hr", "SI": "sl", "RO": "ro", "BG": "bg",
    "RS": "sr", "BA": "bs", "MK": "mk", "AL": "sq", "ME": "sr", "SE": "sv",
    "NO": "no", "DK": "da", "FI": "fi", "EE": "et", "LV": "lv", "LT": "lt",
    "IE": "en", "GB": "en", "MT": "mt", "CY": "el", "LU": "fr", "TR": "tr",
    "MA": "fr", "IS": "is", "UA": "uk",
}


def lead_image(lang, en_title):
    """The lead photo of this place's article in `lang`, as a Commons file
    title. Editors put a postcard at the top of a town's article; that is the
    picture we want, and no ranking of ours beats it."""
    if not en_title:
        return None
    title = en_title
    if lang != "en":
        data = fetch(EN_API, {
            "action": "query", "format": "json", "formatversion": "2",
            "titles": en_title, "redirects": "1",
            "prop": "langlinks", "lllang": lang, "lllimit": "1",
        })
        pages = ((data or {}).get("query") or {}).get("pages") or []
        links = (pages[0].get("langlinks") or []) if pages else []
        if not links:
            return None
        title = links[0].get("title")
    quoted = urllib.parse.quote((title or "").replace(" ", "_"), safe="")
    url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{quoted}"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            data = json.loads(r.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
        return None
    if data.get("type") == "disambiguation":
        return None
    src = (data.get("originalimage") or {}).get("source") \
        or (data.get("thumbnail") or {}).get("source")
    return file_title_from_url(src)


def best_replacement(d, meta_cache, exclude=(), coords_only=False):
    """The best photograph we can find for this destination, or None.

    `exclude` is a set of File: titles this destination may not be given. It
    is how the dupes pass stops a place being handed back the photograph it is
    being taken off, and stops it minting a fresh duplicate on the way out.

    `coords_only` throws away the article ladder and searches the destination's
    own coordinates instead. The dupes pass needs it, and the reason is worth
    stating: a destination that ended up with another place's photograph got
    there through an ambiguous NAME, so its article association is the one
    thing about it that is known to be wrong. Devil's Bridge in Wales and
    Devil's Bridge in Bulgaria share a Wikipedia disambiguation page, and Spa
    in Belgium had a Commons file page for a Bath photograph where its article
    should be. Asked the normal way they are offered "Devil's Bridge
    Nettleden" and "Couples Bath Spa": the same collision, twice. Asked by
    coordinate they are offered "Pontarfynach - Devil's Bridge, Powys, Wales"
    and "Thermes de Spa"."""
    city, country = d.get("city"), d.get("country")
    page = (d.get("image") or {}).get("page")
    stored_title = None
    if page and "/wiki/" in page:
        stored_title = urllib.parse.unquote(page.split("/wiki/")[-1]).replace("_", " ")
    # The place's OWN article as well as whatever the harvester settled on: a
    # dozen destinations point at a region (Alghero -> Sardinia) because their
    # own article had no API-exposed lead image, and a region's photographs are
    # of somewhere else in it.
    own_title = re.sub(r"\s*\(.*?\)\s*", "", city or "").strip()
    titles = [t for t in dict.fromkeys([own_title, stored_title]) if t]
    lat = d.get("city_lat") if d.get("city_lat") is not None else d.get("lat")
    lon = d.get("city_lon") if d.get("city_lon") is not None else d.get("lon")

    if coords_only:
        # Distance order IS the ranking here, so it is passed as `rank`: the
        # nearest photograph of a place is the likeliest to be of that place.
        # Deliberately not a wide net. Widening it to 9 km and 120 files was
        # tried and measured worse: Venice fell from a San Marco panorama to a
        # monument to Carlo Goldoni, Rovaniemi to a locomotive. More noise
        # reaches the scorer than signal, and the nearest hundred photographs
        # of a town centre are mostly doorways.
        near = geosearch_images(lat, lon, radius=6000, limit=40)
        ordered = [(t, {"rank": i}) for i, t in enumerate(near)]
        return _rank_and_pick(ordered, d, meta_cache, exclude)

    # 0. The curated view categories. A photograph somebody filed under
    #    "Views of Ronda" is a view of Ronda, decided by a human, and that is
    #    the whole question a hero has to get right. This did not exist before
    #    and it is why the ladder starts at 0.
    views = view_candidates(city)

    # 1. The lead image of the local-language article, then the English one.
    leads = []
    for en_title in titles:
        for lang in dict.fromkeys([ISO_LANG.get(d.get("iso2"), "en"), "en"]):
            t = lead_image(lang, en_title)
            if t and t not in leads:
                leads.append(t)
    # 2. Everything else those articles illustrate, in article order.
    article = []
    for en_title in titles:
        for t in article_images(f"https://en.wikipedia.org/wiki/{en_title}", city):
            if t not in leads and t not in article:
                article.append(t)
    # 3. Only if those come up empty: whatever was photographed nearby.
    thin = len(views) + len(leads) + len(article) < 4
    nearby = geosearch_images(lat, lon) if thin else []

    seen = set()
    ordered = []
    for t in views:
        # No `rank`: these arrive alphabetically, and pretending that is a
        # preference order would hand the hero to whoever titled their file
        # with a leading digit. The scorer decides among them on merit.
        ordered.append((t, {"view": True}))
        seen.add(t)
    for t in leads:
        if t not in seen:
            ordered.append((t, {"lead": True}))
            seen.add(t)
    for i, t in enumerate(article):
        if t not in seen:
            ordered.append((t, {"rank": i}))
            seen.add(t)
    for t in nearby:
        if t not in seen:
            ordered.append((t, {}))
            seen.add(t)
    return _rank_and_pick(ordered, d, meta_cache, exclude)


def _rank_and_pick(ordered, d, meta_cache, exclude=()):
    """Score a candidate list, reject the junk, return the winner or None."""
    city, country = d.get("city"), d.get("country")
    if not ordered:
        return None

    commons_meta([t for t, _ in ordered], meta_cache)
    excl = {fold(re.sub(r"^File:", "", x)) for x in (exclude or ())}
    ranked = []
    for c, how in ordered:
        if fold(re.sub(r"^File:", "", c)) in excl:
            continue                      # already someone else's photograph
        meta = meta_cache.get(c)
        # `dest=d` makes the place test binding on CANDIDATES too, not only on
        # the hero already in the file: a replacement that publishes a
        # coordinate in the wrong country is rejected outright rather than
        # merely scored down, which is how Urfa Castle reached Edessa.
        if not meta or classify(c, meta, dest=d):
            continue                      # a fix may never be another map
        ranked.append((score_candidate(c, meta, city, country,
                                       rank=how.get("rank"), lead=how.get("lead", False),
                                       dest=d, view=how.get("view", False)),
                       c, meta))
    if not ranked:
        return None
    ranked.sort(key=lambda r: -r[0])
    score, title, meta = ranked[0]
    # A candidate that names neither the city nor its country is a coordinate
    # coincidence more often than a postcard; leave the flag standing instead.
    # The floor sits above the score a bare name match earns, because that is
    # what put a band called Alphabeat on Silkeborg and St Peter's dome on
    # St. Wolfgang. A flagged hero is a better outcome than a wrong one.
    if score < 5.5:
        return None
    fname = re.sub(r"^File:", "", title).replace(" ", "_")
    quoted = urllib.parse.quote(fname)
    return {
        "title": meta.get("name") or readable(title),
        "url": _clean(meta.get("descurl")) or f"https://commons.wikimedia.org/wiki/{quoted}",
        "thumb": (f"https://commons.wikimedia.org/w/thumb.php?f={quoted}&w={THUMB_PX}"
                  if not meta.get("url") else _thumb_url(meta["url"], fname)),
        "original": _clean(meta.get("url")),
        "source": "commons_audit",
        "score": round(score, 2),
        # The winner's shape, carried out so fix() can hold a narrow-only
        # swap to the fit bar without a cache lookup: "title" above is the
        # readable name, not the File: key the meta cache is filed under.
        "w": meta.get("width") or 0,
        "h": meta.get("height") or 0,
    }


def _clean(url):
    """The imageinfo API returns file URLs with campaign tracking glued on
    (?utm_source=commons.wikimedia.org&utm_campaign=imageinfo...). Harmless at
    the end of a URL, fatal in the middle of one, and the thumb path splices a
    segment INTO the middle. Drop it at the door."""
    return (url or "").split("?", 1)[0]


def _thumb_url(original_url, fname):
    """.../commons/2/2a/NAME.JPG -> .../commons/thumb/2/2a/NAME.JPG/960px-NAME.JPG"""
    m = re.match(r"(https://upload\.wikimedia\.org/wikipedia/commons)/(\w+)/(\w+)/(.+)$",
                 _clean(original_url))
    if not m:
        return _clean(original_url) or original_url
    base, h1, h2, name = m.groups()
    return f"{base}/thumb/{h1}/{h2}/{name}/{THUMB_PX}px-{name}"


def fix(dests, report, dry_run=False, limit=None, only=None, force_coord=False):
    meta_cache = load_json(META_CACHE, {}) or {}
    img_cache = load_json(IMG_CACHE, {}) or {}

    # `far_coord` on its own is a question, not a verdict: it is how the
    # areas, counties and gateway airports flag (the Cotswolds at 47 km, Kerry
    # at 64, Val d'Orcia at 34), and their photographs are fine. Replacing a
    # good hero on that evidence would do more harm than the flag prevents, so
    # those wait for human eyes. Anything flagged for a second reason as well
    # is still a target.
    # An explicit --only is an operator naming destinations by hand, so the
    # far_coord hold-back does not apply to it: that band exists to stop
    # UNATTENDED replacement, not to argue with somebody who has looked.
    hold_far = not only
    targets = [f["id"] for f in report.get("flagged", [])
               if not (hold_far and f.get("reasons") == ["far_coord"])]         + list(report.get("missing", []))
    reasons_of = {f["id"]: f.get("reasons") or []
                  for f in report.get("flagged", [])}
    if only:
        # An --only that names a destination the last check did NOT flag is
        # still a target. The classifier answers "is this a photograph", and a
        # photograph can be perfectly valid and still be the wrong one: a shed
        # in the Madriu valley is a real photo of a real place and a poor
        # picture of Andorra. Naming it by hand is how that gets repaired.
        named = [t for t in only if t in dests]
        targets = [t for t in targets if t in only] + [
            t for t in named if t not in targets]
    if limit:
        targets = targets[:limit]
    print(f"Looking for better heroes: {len(targets)} destinations")

    # Which targets got here because the photograph was of somewhere else.
    # For those the place NAME is the thing that is broken, so the name-based
    # ladder must not be used to repair it: asked the normal way, Guadalajara
    # in Spain was offered the Hospicio Cabanas in Guadalajara MEXICO, Fano in
    # Denmark was offered the Malatestiana fortress in Fano ITALY, and Scilla
    # was offered Scilla bifolia, the plant, for a second time. Coordinates
    # cannot be fooled by a name, so those are repaired by coordinate.
    by_coord = {f["id"] for f in report.get("flagged", [])
                if "wrong_place" in (f.get("reasons") or [])}
    # --by-coord forces the coordinate ladder for whatever --only names. The
    # 30-to-300 km band is reviewed by hand rather than auto-fixed (a photo of
    # the Cliffs of Moher is 43 km from Galway and entirely correct), so when
    # that review does find a real error, this is how it gets repaired.
    if force_coord and only:
        by_coord |= set(only)

    fixed, kept = [], []
    for n, did in enumerate(targets, 1):
        d = dests.get(did)
        if not d:
            continue
        old = (d.get("image") or {}).get("url")
        rep = best_replacement(d, meta_cache, coords_only=did in by_coord)
        if not rep:
            kept.append(did)
            print(f"  [{n}/{len(targets)}] --   {d.get('city')}: nothing better found")
            continue
        # A hero whose only sin is being squarish keeps its place unless the
        # replacement genuinely fills the 12/5 crop: trading one narrow
        # photograph for another is churn, not repair.
        if reasons_of.get(did) == ["narrow"]:
            rw, rh = rep.get("w") or 0, rep.get("h") or 0
            if not (rw and rh) or (rw / rh) < NARROW_AR:
                kept.append(did)
                print(f"  [{n}/{len(targets)}] --   {d.get('city')}: "
                      "no wider photograph found, narrow hero kept")
                continue
        img_cache[did] = {k: rep[k] for k in ("title", "url", "thumb", "original", "source")}
        fixed.append({
            "id": did, "city": d.get("city"), "country": d.get("country"),
            "from": old, "to": rep["thumb"], "file": rep["title"], "score": rep["score"],
        })
        print(f"  [{n}/{len(targets)}] fix  {d.get('city')} -> {rep['title']} ({rep['score']})")
        if not dry_run and n % 20 == 0:
            atomic_write_json(META_CACHE, meta_cache)
            atomic_write_json(IMG_CACHE, img_cache)

    if not dry_run:
        atomic_write_json(META_CACHE, meta_cache)
        atomic_write_json(IMG_CACHE, img_cache)
    # --only/--limit re-runs cover part of the queue; everything the previous
    # pass decided about other destinations stays in the report.
    touched = set(targets)
    prior_fixed = [f for f in (report.get("fixed") or []) if f["id"] not in touched]
    prior_kept = [i for i in (report.get("unfixed") or []) if i not in touched]
    report["fixed"] = prior_fixed + fixed
    report["unfixed"] = prior_kept + kept
    report["counts"]["fixed"] = len(report["fixed"])
    report["counts"]["unfixed"] = len(report["unfixed"])
    if not dry_run:
        atomic_write_json(REPORT, report)
    print(f"Replaced {len(fixed)}, left standing {len(kept)}"
          + (" (dry run, nothing written)" if dry_run else ""))
    return report


# Two records this close together are one place under two names (Rhodes and
# Rodos are one harbour), whatever they are called, and they may share a
# photograph. Comfortably wider than any city's spread of airports.
SAME_PLACE_KM = 30.0


def _place_key(d):
    city = re.sub(r"\s*\([^)]*\)\s*$", "", d.get("city") or "").strip().lower()
    return fold(city) + "|" + (d.get("iso2") or "")


def _km(a, b):
    def pt(d):
        return (d.get("city_lat", d.get("lat")), d.get("city_lon", d.get("lon")))
    lat1, lon1 = pt(a)
    lat2, lon2 = pt(b)
    if None in (lat1, lon1, lat2, lon2):
        return 1e9
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def dupes(dests, dry_run=False, only=None):
    """One photograph standing for two DIFFERENT places.

    Most repeats in the catalogue are not errors. London's skyline fronts
    Heathrow, Gatwick, Luton and Stansted because those are four airport
    records for one city, and the app's grid merges them into one card anyway.
    What IS an error is one file fronting two places: the shipped catalogue has
    the Roman Baths at Bath fronting the Belgian town of Spa (a name match, not
    a photograph of Spa), and one Devil's Bridge borrowing the other's picture
    across Bulgaria and Wales.

    A repeat is only called an error when the two records differ by BOTH the
    place key the app's own gateway merge uses AND by more than SAME_PLACE_KM,
    so a town carried under two spellings keeps its photograph.

    The best-known claimant keeps the file, because a photograph that has to
    stand for one of several places should stand for the one a reader will
    recognise it as. Everyone else goes back through best_replacement with that
    file excluded.
    """
    meta_cache = load_json(META_CACHE, {}) or {}
    img_cache = load_json(IMG_CACHE, {}) or {}

    by_url = {}
    for did, d in dests.items():
        url = (d.get("image") or {}).get("url")
        if url:
            by_url.setdefault(url, []).append(did)

    losers = []
    for url, ids in by_url.items():
        if len(ids) < 2:
            continue
        if len({_place_key(dests[i]) for i in ids}) < 2:
            continue                       # one city, several gateways: fine
        keeper = max(ids, key=lambda i: ((dests[i].get("rating") or {}).get("fame") or 0))
        for i in ids:
            if i == keeper:
                continue
            if _place_key(dests[i]) == _place_key(dests[keeper]):
                continue
            if _km(dests[i], dests[keeper]) < SAME_PLACE_KM:
                continue                   # same place, two spellings
            losers.append((i, keeper, url))

    if only:
        losers = [row for row in losers if row[0] in only]
    if not losers:
        print("No photograph is standing for two different places.")
        return

    print("%d destination(s) are showing another place's photograph:" % len(losers))
    fixed, kept = [], []
    for n, (did, keeper, url) in enumerate(losers, 1):
        d = dests[did]
        held = file_title_from_url(url)
        print("  [%d/%d] %s (%s) is using %s's %s"
              % (n, len(losers), d.get("city"), d.get("country"),
                 dests[keeper].get("city"), readable(held) if held else url))
        rep = best_replacement(d, meta_cache, exclude={held} if held else (),
                               coords_only=True)
        if not rep:
            kept.append(did)
            print("          nothing better found; the app shows the placeholder")
            continue
        img_cache[did] = {k: rep[k] for k in ("title", "url", "thumb", "original", "source")}
        fixed.append({"id": did, "city": d.get("city"), "country": d.get("country"),
                      "from": url, "to": rep["thumb"], "file": rep["title"],
                      "score": rep["score"], "shared_with": keeper})
        print("          -> %s (%s)" % (rep["title"], rep["score"]))

    if not dry_run:
        atomic_write_json(META_CACHE, meta_cache)
        atomic_write_json(IMG_CACHE, img_cache)
        report = load_json(REPORT, None) or {}
        report["dupes"] = {"generated": date.today().isoformat(),
                           "fixed": fixed, "unfixed": kept}
        atomic_write_json(REPORT, report)
    print("Replaced %d, left standing %d%s"
          % (len(fixed), len(kept), " (dry run, nothing written)" if dry_run else ""))


def stats():
    report = load_json(REPORT, None)
    if not report:
        print("No report yet. Run: python audit_hero_images.py check")
        return
    c = report.get("counts", {})
    print(f"Hero image audit, {report.get('generated')}")
    print(f"  destinations: {c.get('destinations')}, with an image: {c.get('with_image')}, "
          f"missing: {c.get('missing')}")
    print(f"  flagged: {c.get('flagged')}  {c.get('by_reason')}")
    if c.get("fixed") is not None:
        print(f"  replaced: {c.get('fixed')}, still flagged: {c.get('unfixed')}")
    for row in (report.get("flagged") or [])[:15]:
        print(f"    {row['city']}, {row['country']}: {','.join(row['reasons'])} - {row['file']}")


SHEET = ROOT / "data" / "reports" / "hero_images_contact_sheet.html"


def sheet(report=None):
    """A local page that puts every swap side by side, old on the left, new on
    the right. Written to disk rather than published, because the photos load
    from upload.wikimedia.org and any hosted page worth its salt blocks that."""
    report = report or load_json(REPORT, None)
    if not report:
        print("Nothing to show: run check first.")
        return
    fixed = report.get("fixed") or []
    standing = [f for f in report.get("flagged", [])
                if f["id"] in set(report.get("unfixed") or [])]

    def card(city, country, old, new, note, page):
        old_img = (f'<img src="{old}" loading="lazy">' if old
                   else '<div class="none">no image</div>')
        new_img = (f'<img src="{new}" loading="lazy">' if new
                   else '<div class="none">nothing better found</div>')
        link = f' <a href="{page}" target="_blank">file</a>' if page else ""
        return (f'<figure><div class="pair">{old_img}{new_img}</div>'
                f'<figcaption><b>{city}</b> <span>{country}</span>'
                f'<br>{note}{link}</figcaption></figure>')

    cards = [card(f.get("city"), f.get("country"), f.get("from"), f.get("to"),
                  f'{f.get("file", "")} ({f.get("score")})', None)
             for f in fixed]
    left = [card(f.get("city"), f.get("country"), f.get("url"), None,
                 'still flagged: ' + ', '.join(f.get('reasons') or []), None)
            for f in standing]

    html = f"""<!doctype html><meta charset="utf-8">
<title>Hero image audit {date.today().isoformat()}</title>
<style>
 body{{font:14px/1.4 system-ui,sans-serif;margin:24px;background:#faf9f7;color:#1c1b19}}
 h1{{font-size:20px;margin:0 0 4px}} h2{{font-size:15px;margin:28px 0 10px;font-weight:600}}
 p.lede{{color:#6b6864;margin:0 0 8px}}
 .grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}}
 figure{{margin:0;background:#fff;border:1px solid #e7e4df;border-radius:10px;overflow:hidden}}
 .pair{{display:grid;grid-template-columns:1fr 1fr;gap:2px;background:#e7e4df}}
 .pair img{{width:100%;height:120px;object-fit:cover;display:block;background:#f2f0ed}}
 .none{{height:120px;display:grid;place-items:center;color:#a09c96;background:#f2f0ed;font-size:12px}}
 figcaption{{padding:8px 10px;font-size:12px;color:#4a4742}}
 figcaption span{{color:#9a958e}} a{{color:#8a5a2b}}
</style>
<h1>Hero images: {len(fixed)} replaced, {len(left)} left standing</h1>
<p class="lede">Left photo is what the panel showed, right photo is what it shows now.</p>
<h2>Replaced</h2><div class="grid">{''.join(cards)}</div>
<h2>Left standing (flagged, nothing better found)</h2><div class="grid">{''.join(left)}</div>
"""
    SHEET.write_text(html, encoding="utf-8")
    print(f"  contact sheet: {SHEET}")


def main():
    args = [a for a in sys.argv[1:]]
    cmd = next((a for a in args if not a.startswith("-")), "all")
    limit = None
    only = None
    for a in args:
        if a.startswith("--limit"):
            limit = int(a.split("=", 1)[1] if "=" in a else args[args.index(a) + 1])
        if a.startswith("--only"):
            val = a.split("=", 1)[1] if "=" in a else args[args.index(a) + 1]
            only = set(val.split(","))
    dry = "--dry-run" in args
    force_coord = "--by-coord" in args

    if cmd == "stats":
        stats()
        return
    if cmd == "sheet":
        sheet()
        return

    data = load_json(PRIMARY)
    dests = data.get("destinations", {})

    if cmd == "dupes":
        dupes(dests, dry_run=dry, only=only)
        if not dry:
            sys.path.insert(0, str(Path(__file__).resolve().parent))
            import harvest_images
            harvest_images.patch()
        return

    report = None
    if cmd in ("all", "check"):
        report = check(dests, limit=limit, only=only)
    if cmd in ("all", "fix"):
        report = report or load_json(REPORT, None)
        if not report:
            print("Nothing to fix: run check first.")
            return
        report = fix(dests, report, dry_run=dry, limit=limit, only=only,
                     force_coord=force_coord)
    if cmd in ("all", "fix") and not dry:
        sheet(report)
    if cmd in ("all", "patch") and not dry:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import harvest_images
        harvest_images.patch()


if __name__ == "__main__":
    main()
