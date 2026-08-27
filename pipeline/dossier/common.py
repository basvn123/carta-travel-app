"""
Shared plumbing for the destination dossier pipeline.

The dossier layer builds one contract file per destination at
continent-app/public/dossier/{base}.json, where {base} is dossier_file_base()
of the destination id. Both the full-screen destination page and the PDF
export render from that file, so the two can never drift apart.

Everything here is offline: loaders for the shipped wire files, the existing
image licence caches, name folding, and small geometry helpers. Network work
lives in fill_licences.py (Commons extmetadata) and research_do.py (web
evidence) only.

ASCII clean, no em dashes, per project convention.
"""

from __future__ import annotations

import json
import math
import os
import re
import sys
import tempfile
import unicodedata
from urllib.parse import unquote, quote

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PUB = os.path.join(ROOT, "continent-app", "public")
CACHE = os.path.join(ROOT, "cache")
DCACHE = os.path.join(CACHE, "dossier")
REPORTS = os.path.join(ROOT, "data", "reports")

os.makedirs(DCACHE, exist_ok=True)

# ---------------------------------------------------------------- file names

# Windows resolves DOS device names anywhere a path is parsed, and git's
# core.protectNTFS refuses to index them; see continent-app/src/lib/fareFile.js
# for the long version. Same escape here, applied to IATA-style ids. The
# "gem:" prefix carries a colon, which is illegal in NTFS names outright, so
# it folds to "gem-". src/lib/dossier.js mirrors this exactly.
RESERVED = {"CON", "PRN", "AUX", "NUL"} | {f"COM{i}" for i in range(10)} | {
    f"LPT{i}" for i in range(10)
}


def dossier_file_base(dest_id: str) -> str:
    if dest_id.startswith("gem:"):
        return "gem-" + dest_id[4:]
    code = dest_id.upper()
    return code + "_" if code in RESERVED else code


# ---------------------------------------------------------------- json io


def load_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def atomic_write_json(path, data, indent=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=indent,
                      separators=(",", ":") if indent is None else None)
            f.flush()
            os.fsync(f.fileno())
        for attempt in range(6):
            try:
                os.replace(tmp, path)
                return
            except PermissionError:
                import time
                time.sleep(1.5 * (attempt + 1))
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


# ---------------------------------------------------------------- names

# NFKD leaves these letters alone; they need an explicit fold table.
FOLD = str.maketrans({
    "ø": "o", "Ø": "O",   # o-slash
    "ł": "l", "Ł": "L",   # l-stroke
    "æ": "ae", "Æ": "AE",
    "œ": "oe", "Œ": "OE",
    "ð": "d", "Ð": "D",
    "þ": "th", "Þ": "Th",
    "ß": "ss",
    "đ": "d", "Đ": "D",   # d-stroke
})

ARTICLES = {
    "the", "le", "la", "els", "el", "il", "lo", "los", "las", "les", "gli",
    "de", "het", "der", "die", "das", "den", "a", "o", "os", "as",
}

_WS_RE = re.compile(r"\s+")


def fold(s: str) -> str:
    s = (s or "").translate(FOLD)
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c))


def norm_name(s: str) -> str:
    """Comparable form of a name, punctuation and diacritics removed.

    Punctuation is stripped by testing isalnum(), NOT by an [^a-z0-9] class.
    The ASCII class erased every non-Latin script outright: "Мирковци" and
    "Ακροπολη Αθηνων" both normalised to the empty string, so every Cyrillic
    and Greek name compared equal to every other one and was dropped by the
    empty-name guards downstream. That silently emptied the things-to-do
    section across Bulgaria, Serbia, North Macedonia and Greece.
    """
    s = fold(s).lower()
    s = "".join(c if (c.isalnum() or c.isspace()) else " " for c in s)
    words = [w for w in _WS_RE.split(s) if w]
    while words and words[0] in ARTICLES:
        words = words[1:]
    return " ".join(words)


# Words that carry no identity, so "Cathedral of Notre Dame" and "Notre Dame
# Cathedral" are the same place and "Louvre" is the same place as "Louvre
# Museum". Matching on the exact normalised string missed both.
_STOP = {"of", "the", "de", "la", "le", "du", "des", "di", "del", "della",
         "der", "die", "das", "van", "von", "el", "los", "las", "il", "lo",
         "a", "and", "et", "und", "y", "e", "in", "at", "on",
         # Cyrillic and Greek carry their own, and norm_name now preserves
         # both scripts, so the token sets need them to match usefully.
         "на", "и", "у", "во", "од", "за", "с", "со", "the",
         "του", "της", "των", "στο", "στη", "και", "το", "η", "ο"}


def name_tokens(s: str) -> frozenset:
    return frozenset(w for w in norm_name(s).split() if w and w not in _STOP)


def name_matches(name: str, others: set) -> bool:
    """True when `name` is the same place as any name in `others`.

    `others` is a set of token frozensets (build it with name_tokens). One
    token set containing the other counts: a listing called "Louvre" and a POI
    called "Louvre Museum" are one thing, and so are "Notre Dame Cathedral"
    and "Cathedral of Notre Dame".
    """
    mine = name_tokens(name)
    if not mine:
        return False
    for other in others:
        if not other:
            continue
        if mine == other or mine <= other or other <= mine:
            return True
    return False


# Words that only restate what kind of geography a place is. "Terceira
# Island" is the island called Terceira; "Valbona Valley National Park" is a
# national park, which is a different thing from the valley you are staying
# in. Only the first is the destination talking about itself.
# Deliberately excludes "old", "town", "historic" and "centre": the old town
# of a city is somewhere you actually go and is often the UNESCO listing, so
# "Old Town of Bern" must survive as a highlight of Bern.
_GEO_SUFFIX = {"island", "islands", "isle", "city", "village",
               "municipality", "commune", "region", "area", "province",
               "county", "district", "valley", "bay", "peninsula", "coast"}


def is_self_reference(name: str, place_name: str) -> bool:
    """True when `name` is just the destination named again.

    Token containment alone is too blunt for this: it throws away the
    national park because the park's name contains the valley's.
    """
    mine, theirs = name_tokens(name), name_tokens(place_name)
    if not mine or not theirs:
        return False
    if mine == theirs:
        return True
    if theirs <= mine:
        return (mine - theirs) <= _GEO_SUFFIX
    return False


def slugify(s: str) -> str:
    s = fold(s).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "x"


# ---------------------------------------------------------------- geometry


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def bearing8(lat1, lon1, lat2, lon2):
    dl = math.radians(lon2 - lon1)
    p1, p2 = math.radians(lat1), math.radians(lat2)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    deg = (math.degrees(math.atan2(y, x)) + 360) % 360
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][round(deg / 45) % 8]


class GridIndex:
    """0.5 degree bucket index over point rows for cheap radius queries."""

    def __init__(self, cell=0.5):
        self.cell = cell
        self.buckets = {}

    def add(self, lat, lon, row):
        key = (int(lat // self.cell), int(lon // self.cell))
        self.buckets.setdefault(key, []).append((lat, lon, row))

    def near(self, lat, lon, radius_km):
        # 0.5 deg lat is ~55 km; span enough cells to cover the radius.
        span = max(1, int(radius_km / (self.cell * 55)) + 1)
        ky, kx = int(lat // self.cell), int(lon // self.cell)
        out = []
        for dy in range(-span, span + 1):
            for dx in range(-span, span + 1):
                for plat, plon, row in self.buckets.get((ky + dy, kx + dx), []):
                    km = haversine_km(lat, lon, plat, plon)
                    if km <= radius_km:
                        out.append((km, row))
        out.sort(key=lambda t: t[0])
        return out


# ---------------------------------------------------------------- commons urls

WIKI_WIDTHS = [250, 330, 500, 960, 1280, 1920]
_THUMB_RE = re.compile(r"/thumb/(.+?)/(\d+)px-")
_FILEPATH_RE = re.compile(r"Special:FilePath/([^?]+)", re.I)


def commons_filename(url: str) -> str | None:
    """File name (no File: prefix) from a Commons/upload URL, or None."""
    if not url:
        return None
    m = _FILEPATH_RE.search(url)
    if m:
        return unquote(m.group(1)).replace("_", " ")
    if "/thumb/" in url:
        # .../thumb/a/ab/Name.jpg/500px-Name.jpg -> Name.jpg
        part = url.split("/thumb/", 1)[1]
        segs = part.split("/")
        if len(segs) >= 3:
            return unquote(segs[2]).replace("_", " ")
        return None
    if "upload.wikimedia.org" in url:
        return unquote(url.rsplit("/", 1)[-1]).replace("_", " ")
    return None


def file_page_url(filename: str) -> str:
    return "https://commons.wikimedia.org/wiki/File:" + quote(
        filename.replace(" ", "_"), safe="()_,.-'!&"
    )


def filepath_thumb(url: str, width: int = 960) -> str:
    """A Wikidata P18 value is a Special:FilePath link to the ORIGINAL file,
    which for a Commons photograph is routinely 8 MB. The same endpoint
    resizes on request, and unlike /thumb/ URLs it accepts any width."""
    if not url:
        return url
    if "Special:FilePath" in url:
        base = url.split("?", 1)[0].replace("http://", "https://")
        return f"{base}?width={width}"
    return url


def thumb_at(url: str, width: int) -> str:
    """Rewrite a Wikimedia image URL to a given width.

    Two URL shapes reach here. A /thumb/ URL only serves the fixed width list
    probed in src/lib/heroImage.js, so the request is snapped to the nearest
    one. A Special:FilePath URL (what Wikidata P18 gives) resizes to any width
    on request, so it takes the width as asked.
    """
    if not url:
        return url
    if "Special:FilePath" in url:
        return filepath_thumb(url, width)
    if width not in WIKI_WIDTHS:
        width = min(WIKI_WIDTHS, key=lambda w: abs(w - width))
    if "/thumb/" in url and re.search(r"/(\d+)px-", url):
        return re.sub(r"/(\d+)px-", f"/{width}px-", url)
    return url


BAD_LICENCE_RE = re.compile(r"\b(nc|nd)\b|non[- ]?commercial|no[- ]?deriv|permission", re.I)
FREE_NO_AUTHOR_OK_RE = re.compile(r"public domain|^pd\b|cc0|no restrictions", re.I)


def licence_verdict(licence: str | None, author: str | None) -> str:
    """'ok' | 'refuse'. Attribution-required with no author is a refusal:
    'CC BY-SA 3.0' with nobody credited is not a credit."""
    if not licence:
        return "refuse"
    lic = licence.strip()
    if BAD_LICENCE_RE.search(lic):
        return "refuse"
    if FREE_NO_AUTHOR_OK_RE.search(lic):
        return "ok"
    return "ok" if (author or "").strip() else "refuse"


class TaslStore:
    """Unified lookup over every licence cache the repo already has.

    Sources, in order of preference:
      cache/dossier/licences.json      filename -> extmetadata fill (ours)
      cache/poi_image_licenses.json    filename -> {license, license_url, author, credit}
      cache/features_images.json .files filename -> {licence, licence_url, author, ...}
      cache/citytrip_image_licenses.json  full thumb URL -> {license, author, source_url}
    Dimensions come from cache/hero_image_meta.json and features_images.files
    when known.
    """

    def __init__(self):
        self.fill = load_json(os.path.join(DCACHE, "licences.json"), {}) or {}
        self.poi = load_json(os.path.join(CACHE, "poi_image_licenses.json"), {}) or {}
        feats = load_json(os.path.join(CACHE, "features_images.json"), {}) or {}
        self.files = feats.get("files", {}) if isinstance(feats, dict) else {}
        self.citytrip = load_json(
            os.path.join(CACHE, "citytrip_image_licenses.json"), {}) or {}
        hero = load_json(os.path.join(CACHE, "hero_image_meta.json"), {}) or {}
        self.dims = {}
        for key, meta in hero.items():
            name = key[5:] if key.startswith("File:") else key
            if isinstance(meta, dict) and meta.get("width"):
                self.dims[name] = (meta.get("width"), meta.get("height"))

    def lookup(self, url: str):
        """-> dict(author, licence, licence_url, page, w, h) or None."""
        name = commons_filename(url)
        rec = None
        if name:
            for store, lk, lku, au in (
                (self.fill, "licence", "licence_url", "author"),
                (self.poi, "license", "license_url", "author"),
                (self.files, "licence", "licence_url", "author"),
            ):
                r = store.get(name)
                if isinstance(r, dict) and r.get(lk):
                    rec = {
                        "author": r.get(au) or None,
                        "licence": r.get(lk),
                        "licence_url": r.get(lku) or None,
                        "w": r.get("width"), "h": r.get("height"),
                    }
                    break
        if rec is None:
            r = self.citytrip.get(url)
            if isinstance(r, dict) and r.get("license"):
                rec = {
                    "author": r.get("author") or None,
                    "licence": r.get("license"),
                    "licence_url": None,
                    "w": None, "h": None,
                }
        if rec is None:
            return None
        rec["author"] = clean_author(rec.get("author"))
        if name:
            rec["page"] = file_page_url(name)
            if not rec.get("w") and name in self.dims:
                rec["w"], rec["h"] = self.dims[name]
        return rec


# ---------------------------------------------------------------- image gate

# Commons leads a place's article with whatever is most encyclopaedic, which
# for a city is often a coat of arms, a locator map or a 19th century
# engraving. Those are correct and useless in a travel guide: Paris shipped
# its city crest as the third gallery photograph. Same rule set as
# pipeline/audit_hero_images.py, kept short here because the dossier only has
# a filename and a size to judge from.
_BAD_IMAGE_RE = re.compile(
    r"\b(coat of arms|coats of arms|wappen|blason|blazon|escudo|stemma|grb|"
    r"vaakuna|vapen|flag|flags|flaga|bandera|bandiera|vlag|drapeau|seal|"
    r"emblem|logo|insignia|crest|"
    r"map|maps|karte|mapa|carte|kaart|plan|locator|location map|topographic|"
    r"diagram|chart|graph|schema|blueprint|floor ?plan|cross[- ]section|"
    r"infographic|collage|montage|manuscript|charter|document|title page|"
    r"coin|banknote|stamp|postage|signature|"
    r"painting|engraving|etching|lithograph|woodcut|drawing|watercolour|"
    r"watercolor|postcard|ansichtskarte|carte postale|daguerreotype)\b", re.I)
# A four-digit year before 1980 in the name is a period piece, not a holiday
# photograph. Costs the occasional hotel called 1900; worth it.
_HISTORICAL_RE = re.compile(r"\b(1[5-9]\d{2}|19[0-7]\d)\b")


def image_ok(url, w=None, h=None):
    """False when a Commons file is an emblem, a map, a document or a period
    piece, or is too small or too tall to sit in a gallery frame."""
    name = commons_filename(url) or ""
    if not name:
        return True                       # not a Commons file; nothing to judge
    if re.search(r"\.(svg|pdf|tif|tiff|ogv|webm)$", name, re.I):
        return False
    label = re.sub(r"[_/]+", " ", name)
    if _BAD_IMAGE_RE.search(label) or _HISTORICAL_RE.search(label):
        return False
    if w and h:
        # Size: judged on area and the short edge, not on width alone. A
        # 500x900 portrait is a perfectly good photograph and a width test
        # threw it away.
        if min(w, h) < 400 or w * h < 350_000:
            return False
        # Aspect: only the genuinely unusable. The first cut here rejected
        # anything taller than 1.45, which threw out the canonical Eiffel
        # Tower photograph (2900x5367) because the subject is a tall thing
        # and its best photographs are portrait. Cropping a portrait in a
        # landscape frame costs some sky; refusing it costs the landmark.
        if h > w * 2.6 or w > h * 3.5:
            return False
    return True


# ---------------------------------------------------------------- language

# Wikidata descriptions are supposed to arrive in English and about four
# percent do not, so an English page was printing "chiesa nel comune italiano
# di Alghero". These are function words that are common in the neighbouring
# languages and effectively absent from English prose. "commune" is
# deliberately NOT here: "Commune in Bacau, Romania" is an English sentence.
_NOT_ENGLISH = re.compile(
    r"\b(ancienne|ancien|situe|situee|située|situé|eglise|église|batiment|"
    r"bâtiment|dans le|dans la|d'une|"
    r"gelegen|gemeinde|kirche|ehemalige|einer|eines|zwischen|"
    r"iglesia|situado|situada|edificio|municipio|"
    r"chiesa|situato|situata|comune|frazione|"
    r"kerk|gemeente|plaats in)\b", re.I)


def usable_desc(text):
    """The description if it reads as English, else None.

    Dropping it is the right call: a reader who cannot read the sentence
    learns nothing from it, and an empty line is honest where a foreign one
    looks like a bug."""
    if not text or not isinstance(text, str):
        return None
    return None if _NOT_ENGLISH.search(text) else text


# ---------------------------------------------------------------- text hygiene

# Some Commons Artist fields carry a whole reuse notice instead of a name.
# Strip the boilerplate, keep the human; a credit line is a name, not a EULA.
_AUTHOR_NOISE = re.compile(
    r"(you may re-?use this image[^.]*\.?|the licen[cs]e must be a link[^.]*\.?"
    r"|under the terms of the licen[cs]e[^.]*\.?|using the following reference:?)",
    re.I)


def clean_author(s):
    if not s:
        return s
    s = _AUTHOR_NOISE.sub(" ", s)
    s = re.sub(r"\s+", " ", s).strip(" .;:/,")
    if len(s) > 120:
        s = s[:117].rsplit(" ", 1)[0] + "..."
    return s or None


# The app-wide no-em-dash rule: continent-app/scripts/sync-data.mjs scrubs
# every wire string, but dossier files are written here, not there, so the
# same three rewrites apply on this side. URLs are left alone: an en dash in
# a Commons filename is part of the address.
def strip_dashes(s):
    if not isinstance(s, str) or s.startswith("http"):
        return s
    s = re.sub(r"(\d)\s*[—–]\s*(\d)", r"\1-\2", s)
    s = re.sub(r"(\w)[—–](\w)", r"\1-\2", s)
    return re.sub(r"\s*[—–]\s*", ", ", s)


def sanitize_strings(obj):
    if isinstance(obj, list):
        return [sanitize_strings(x) for x in obj]
    if isinstance(obj, dict):
        return {k: sanitize_strings(v) for k, v in obj.items()}
    return strip_dashes(obj)


# ------------------------------------------------- what counts as a publisher
#
# The corroboration gate counts publishers, so both halves of the sweep have to
# agree on what one is. web_sweep.py had this to itself while the rest of the
# pass was written by hand, and the two drifted: hand-written files were
# counting domains web_sweep would have thrown away. One definition, imported
# by the harvester and by the validator that judges its output.

# Content farms and aggregators: high volume, no independent observation. An
# aggregator republishing what its users typed is not a second opinion.
BLOCKED_DOMAINS = {
    "pinterest.com", "quora.com", "facebook.com", "instagram.com", "x.com",
    "twitter.com", "youtube.com", "reddit.com", "tripadvisor.com",
    "booking.com", "expedia.com", "agoda.com", "hotels.com", "trip.com",
}
_TLD2 = {"co", "com", "org", "net", "gov", "ac", "edu"}


def registrable(host):
    """example.co.uk -> example.co.uk ; a.b.example.com -> example.com.

    The prefix strip is a slice, not lstrip: lstrip("www.") removes any
    leading w or dot, which turns wien.info into ien.info and silently
    splits one publisher's votes across two domains."""
    host = (host or "").lower().split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    parts = [p for p in host.split(".") if p]
    if len(parts) < 2:
        return ".".join(parts)
    if len(parts) >= 3 and parts[-2] in _TLD2 and len(parts[-1]) == 2:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def is_blocked(domain):
    """A blocked aggregator stays blocked in its country editions.

    tripadvisor.co.za is the same company as tripadvisor.com, so matching the
    literal list would let a .co.za or .de edition back in as a second voice.
    Match on the brand label instead, but only for brands long enough that a
    collision is implausible: "x" (x.com) and "trip" (trip.com) would
    otherwise blacklist any unlucky domain that happens to start that way."""
    if domain in BLOCKED_DOMAINS:
        return True
    brand = domain.split(".")[0]
    return len(brand) >= 5 and brand in {b.split(".")[0] for b in BLOCKED_DOMAINS}


def publisher(url):
    """The registrable domain of a URL, or "" if it is one we do not count."""
    from urllib.parse import urlsplit
    dom = registrable(urlsplit(url).netloc)
    return "" if is_blocked(dom) else dom


# ---------------------------------------------------------------- app links


def nav_links(lat, lon):
    return {
        "gmaps": f"https://www.google.com/maps/dir/?api=1&destination={lat:.5f},{lon:.5f}",
        "waze": f"https://www.waze.com/ul?ll={lat:.5f},{lon:.5f}&navigate=yes",
        "apple": f"https://maps.apple.com/?daddr={lat:.5f},{lon:.5f}&dirflg=d",
    }
