"""The image ladder: every published photograph as 3 AVIF + 2 WebP on R2.

Tier: Manual (a CAX41 job: infra/hetzner/jobs/image_transcode.sh)

CARTA_CLOUD_ARCHITECTURE.md section 4.2, migration step 4. Every photograph
the app shows today is a 500 px JPEG hotlinked from Wikimedia: one format,
one width for every context, an origin we do not control. This stage
pre-generates the ladder once, never at request time:

    img/{ab}/{cd}/{sha1}/320.avif    list thumbnails, map popups
    img/{ab}/{cd}/{sha1}/640.avif    cards, gallery strip
    img/{ab}/{cd}/{sha1}/1280.avif   hero, lightbox
    img/{ab}/{cd}/{sha1}/320.webp    fallback
    img/{ab}/{cd}/{sha1}/640.webp    fallback

sha1 is the SHA-1 of the canonical source title (canonical_title below):
"File:<Name>" for a Commons file, "geograph:<id>" for a Geograph photo. The
path never changes for a given source, so the one-year immutable
Cache-Control is honest, a re-run is idempotent, and a rescore that
reorders a gallery rewrites the manifest (a small JSON), never an image.

How a run goes, for one layer:

  sources   the layer's rich cache (cache/<layer>/rich_*.json), every image
            record, hero-first order across rows so an interrupted run has
            covered the leads. Gates, in order: a canonical title, a raster
            file, a storable licence (T010: no NC, no ND, not empty), a
            credit that is owed only when it is present (credit.owes_credit,
            the same gate the exports apply), and not in the takedown ledger
            (takedown.is_taken_down). A gated-out file never reaches R2.
  held      what R2 already holds (an `rclone lsf -R` listing of img/) AND a
            prior manifest or journal knows the dimensions of. Held files
            cost nothing: no request to Wikimedia, no encode, no upload.
  resolve   one Commons imageinfo call per 50 titles, maxlag=5, through the
            shared pacer: the 1920 px thumbnail URL, the true size, the mime
            type (SVG, audio and video drop out here) and Commons' own
            content sha1, recorded so a re-upload can be detected later.
  fetch     HARVEST_WORKERS (2) threads through pipeline/beaches/sources.py
            request(): the per-host pacer (0.4 s on the Commons API), the
            backoff, the contact user agent. Unchanged from the harvest.
            Originals land in the work dir and are deleted after encoding.
  encode    libvips (pyvips) on every core: thumbnail with shrink-on-load,
            never upscaled, sRGB, metadata stripped. AVIF Q=50 (cq-level 32,
            T008's calibration), effort 4, 4:2:0; WebP Q=75, effort 4.
  upload    per batch, two `rclone copy` calls (one per format, so each
            object gets its Content-Type) with Cache-Control public,
            max-age=31536000, immutable; then a journal object naming what
            the batch put there, so a run killed by its ceiling loses no
            finished work.
  manifest  img/manifest/<layer>.json: source title -> sha1, the real pixel
            size of each rung, a credit pointer and rank_v. Written only
            when its content changed (inputs_hash), so a second run over an
            unchanged layer uploads nothing at all.

Why the worker writes img/ directly when every other CAX41 job stages its
output for the orchestrator to promote: a content-addressed object is either
absent or right. Nothing references it until the manifest does, and the
manifest is written last, after every object it names is in R2. Staging
would push the whole ladder twice (once to archive/runs/, once by server-side
copy) and lose the per-object Content-Type and Cache-Control on the copy.

What T269 added (stage 9 D5 of _OPEN-MASTER):

  sources   `derive.py sources <layer>...` writes the published list of a
            layer, hero first, to img/manifest/_sources/<layer>.json. The
            worker has no wire; the job already copies img/manifest/ as
            --prior, so a run that finds the file there derives the
            published titles first (T049-f: 12,823 beach titles before the
            cache's other 25,000).
  wire      the other Tier A layers (WIRE_LAYERS: trails, cycling, region,
  layers    dossier, poi, dest, trips, journeys) read their sources from the
            wire or its sources file, and take a photograph's credit from
            Commons' extmetadata at resolve time when the wire row does not
            carry the photograph's own (T049-k, T007's wire orphans).
  manifest  each entry may carry `n` (nothing owed, T051-c), `p` (the hero
            placeholder, T052-c) and `s` (Commons' content sha1), and the
            manifest records how many takedown rows its run saw.
  re-upload --recheck asks Commons for the content sha1 of held files; a
            changed file gets a new address (revision_key), never an
            in-place rewrite (T049-i).
  gc        `derive.py gc` deletes journals a later manifest has folded and
            objects no manifest names, plus any object of a taken-down
            title (T049-j, T050-c). Dry run unless --apply.
  probe     `derive.py probe <layer>...` asks imageinfo for a sample of
            names: the dead rate before a big run (T008).
  ledger    a run refuses when the takedown ledger has fewer rows than an
            earlier manifest saw (T050-c).

Usage:

    python pipeline/photos/derive.py plan beaches [--published-only]
        [--held FILE_OR_DIR] [--prior DIR] [--sources FILE]
    python pipeline/photos/derive.py run beaches --out DIR [--upload none|dry-run|r2]
        [--held FILE_OR_DIR] [--prior DIR] [--sources FILE] [--work DIR]
        [--encoders N] [--countries NL,BE] [--limit N] [--sample N --seed S]
        [--run-id ID] [--budget-s SECONDS] [--recheck]
    python pipeline/photos/derive.py sources beaches trails --out DIR
    python pipeline/photos/derive.py probe beaches lakes --sample 500 [--json F]
    python pipeline/photos/derive.py gc --held LISTING --prior DIR --out DIR
        [--grace-days 14] [--max-delete-frac 0.25] [--force] [--apply]
    python pipeline/photos/derive.py key "File:Some beach.jpg"
    python pipeline/photos/derive.py selfcheck

CARTA_DATA_ROOT reads cache/ and continent-app/public/ from another
checkout (a sparse worktree has neither); nothing is ever written there.

On Windows, set CARTA_VIPS_BIN to libvips' bin directory (T008 unpacked
8.15.3 to C:\\Users\\Gebruiker\\vips\\vips-dev-8.15\\bin); pyvips 3.x loads the
DLLs from there. On the CAX41, worker.sh installs libvips-dev and the libheif
aomenc plugin from apt (the "vips" need) and pyvips into the venv.

Entry points other tasks use: canonical_title, sha1_of, base_key, keys_for,
cdn_url, r2_purge_cmd (T050, takedown reaching R2) and the manifest format
(T052, the app's <picture>). See MANIFEST_SCHEMA.

ASCII clean, no em dashes, per project convention.
"""

import argparse
import hashlib
import json
import os
import random
import re
import shutil
import signal
import statistics
import subprocess
import sys
import threading
import time
import unicodedata
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed, wait
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
# Where cache/ and continent-app/public/ are read from. The repo root by
# default; CARTA_DATA_ROOT points a sparse worktree (or a test) at a full
# checkout's data without copying it. Read only: derive never writes there.
DATA_ROOT = Path(os.environ.get("CARTA_DATA_ROOT") or ROOT)
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "pipeline"))

import commons  # noqa: E402
import credit  # noqa: E402
import takedown  # noqa: E402
from beaches import sources  # noqa: E402  the shared pacer, user agent, backoff

# ---------------------------------------------------------------------------
# The ladder. Changing any encoder setting here is a NEW ladder: bump
# LADDER_V and move it to a new path scheme, never re-encode in place, or the
# immutable header starts lying to every cache that holds the old bytes.
# ---------------------------------------------------------------------------

LADDER_V = "ladder_v1"
LADDER = (("avif", 320), ("avif", 640), ("avif", 1280),
          ("webp", 320), ("webp", 640))
WIDTHS = (320, 640, 1280)
AVIF_Q = 50            # libvips Q 50 = AOM cq-level 32 (T008 swept it)
AVIF_EFFORT = 4        # 6 saved 0.6 per cent, 9 nothing (T008)
WEBP_Q = 75
WEBP_EFFORT = 4
SOURCE_WIDTH = 1920    # what is fetched: 1.5x the top rung, on Commons' list

HARVEST_WORKERS = 2    # as enrich_beaches.IMAGE_WORKERS; do not raise
ORIGINALS_IN_FLIGHT = 64
BATCH = 200            # images per upload batch and journal object

MANIFEST_SCHEMA = "carta.img-manifest.v1"
BUCKET = os.environ.get("CARTA_R2_BUCKET", "carta")
REMOTE = os.environ.get("CARTA_R2_REMOTE", "r2")
CDN_BASE = "https://cdn.carta-europetravel.com"
IMG_PREFIX = "img"
MANIFEST_DIR = "manifest"               # under img/
JOURNAL_DIR = "manifest/_journal"       # under img/
IMMUTABLE = "public, max-age=31536000, immutable"
MANIFEST_CACHE = "public, max-age=300"
CONTENT_TYPE = {"avif": "image/avif", "webp": "image/webp"}
PAGE_URL = {"commons": "https://commons.wikimedia.org/wiki/{title}",
            "geograph": "https://www.geograph.org.uk/photo/{id}"}

RASTER_EXT = {"jpg", "jpeg", "jpe", "png", "webp", "tif", "tiff", "gif"}
RASTER_MIME = {"image/jpeg", "image/png", "image/webp", "image/tiff",
               "image/gif"}
# A licence that forbids commercial use or derivatives cannot be stored as a
# resized copy on a commercial product (T010). Commons does not accept these,
# so a hit means a harvester outside Commons let one through.
NOT_STORABLE = re.compile(r"\bnc\b|non[- ]?commercial|\bnd\b|no[- ]?deriv"
                          r"|fair use|non[- ]?free|all rights reserved", re.I)

LAYERS = {
    # cache dir, the row list key in rich_<CC>.json (as rescore.LAYERS)
    "beaches": ("beaches", "beaches"),
    "lakes": ("lakes", "lakes"),
    "mountains": ("mountains", "peaks"),
}

# The other Tier A layers (T049-k). None of them keeps a rich cache whose
# image records carry the credit, the way the three above do: trails picks
# its heroes at export, cycling and region have none behind 88 per cent of
# what they publish (T007's 3,983 orphans), and the POI, hero, trip and
# journey thumbnails are bare URLs. What they all have is the wire, which is
# exactly what the app shows, so the wire is their source reader. Their
# credit comes from Commons itself at resolve time (extmetadata, the same
# fields the harvests ask for), never from the wire row: a cycling route's
# `lic` is the route's ODbL, not the photograph's licence.
#   layer -> paths under continent-app/public (directories or files)
WIRE_LAYERS = {
    "trails": ("trails",),
    "cycling": ("cycling",),
    "region": ("region",),
    "dossier": ("dossier",),
    "poi": ("poi",),
    "dest": ("app_data.json", "boot.json", "dest"),
    "trips": ("trips",),
    "journeys": ("journeys",),
}
ALL_LAYERS = {**{k: "cache" for k in LAYERS},
              **{k: "wire" for k in WIRE_LAYERS}}
SOURCES_SCHEMA = "carta.img-sources.v1"
SOURCES_DIR = "manifest/_sources"       # under img/; the job copies it as --prior

STOP = threading.Event()
# The time budget: past it no new fetch starts, the batch in hand finishes and
# the manifest is written for what exists. A run that cannot finish the layer
# (the first beaches run cannot; see the T049 report) still ends ok and
# useful, and the next run continues from what R2 holds.
BUDGET = {"until": None, "hit": False}


def over_budget():
    if BUDGET["until"] is not None and time.time() > BUDGET["until"]:
        BUDGET["hit"] = True
        return True
    return False
# Seconds per fetch and per encode, for the run report: which of the two
# bounds a run is the number section 4.6 guessed at.
TIMES = {"fetch": [], "encode": []}


def now_utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# Identity: canonical title, sha1, keys. T050 and T052 use these.
# ---------------------------------------------------------------------------

GEOGRAPH_ID = re.compile(
    r"geograph\.org\.uk/(?:photo/|geophotos/(?:[0-9a-f]+/)*)(\d+)", re.I)
NS_PREFIX = re.compile(r"^(?:file|image)\s*:\s*", re.I)


def _fold_name(name):
    """Commons' own title normalisation: percent-decoded, underscores as
    spaces, runs of space collapsed, NFC, first letter upper-cased."""
    if "%" in name:
        name = urllib.parse.unquote(name)
    name = re.sub(r"[\s_]+", " ", name).strip()
    name = unicodedata.normalize("NFC", name)
    if name:
        first = name[0].upper()
        if len(first) == 1:
            name = first + name[1:]
    return name


def _host(url):
    return urllib.parse.urlparse(url or "").netloc.lower()


def _title_from_url(url):
    parsed = urllib.parse.urlparse(url or "")
    host = parsed.netloc.lower()
    if host.endswith("geograph.org.uk"):
        m = GEOGRAPH_ID.search(url)
        return f"geograph:{m.group(1)}" if m else None
    path = parsed.path
    if "/wiki/" in path:
        tail = path.split("/wiki/", 1)[1]
        tail = urllib.parse.unquote(tail)
        if NS_PREFIX.match(tail):
            return "File:" + _fold_name(NS_PREFIX.sub("", tail))
        return None
    if "wikimedia.org" in host:
        segs = [s for s in path.split("/") if s]
        # /wikipedia/commons/[thumb/]a/ab/<Name>[/<n>px-<Name>]
        if "commons" in segs:
            i = segs.index("commons") + 1
            if i < len(segs) and segs[i] == "thumb":
                i += 1
            i += 2
            if i < len(segs):
                return "File:" + _fold_name(segs[i])
        return None
    if "Special:FilePath" in url:
        name = url.split("Special:FilePath/", 1)[-1]
        return "File:" + _fold_name(name.split("?", 1)[0])
    return None


def canonical_title(value):
    """The identity a derivative is addressed by, or None.

    Accepts a bare Commons title ("File:X.jpg" or "X.jpg"), a Commons page,
    upload, thumb or Special:FilePath URL, a Geograph page or image URL, or an
    image record from a cache (file/url/full/page/source) or the wire
    (u/big/page). Commons: "File:<folded name>". Geograph: "geograph:<id>"
    (its cached `file` field is the photo's caption, not unique, so the id
    from the page or image URL is the identity)."""
    if isinstance(value, dict):
        urls = [value.get(k) for k in ("page", "url", "full", "u", "big")
                if isinstance(value.get(k), str)]
        # By host, never by substring: Commons holds thousands of Geograph
        # imports named "... - geograph.org.uk - 4680616.jpg", and those are
        # Commons files with Commons titles.
        if value.get("source") == "geograph" or any(
                _host(u).endswith("geograph.org.uk") for u in urls):
            for u in urls:
                t = _title_from_url(u)
                if t and t.startswith("geograph:"):
                    return t
            return None
        f = value.get("file")
        if isinstance(f, str) and f.strip():
            return canonical_title(f)
        for u in urls:
            t = _title_from_url(u)
            if t:
                return t
        return None
    text = str(value or "").strip()
    if not text:
        return None
    if text.lower().startswith("geograph:"):
        return "geograph:" + text.split(":", 1)[1].strip()
    if "://" in text:
        return _title_from_url(text)
    name = _fold_name(NS_PREFIX.sub("", text))
    return f"File:{name}" if name else None


def sha1_of(title):
    """SHA-1 hex of the canonical title, UTF-8. The whole address."""
    return hashlib.sha1(title.encode("utf-8")).hexdigest()


def revision_key(title, content_sha1):
    """The address of a re-uploaded file (T049-i).

    The address is the title, and the objects under it are served as
    immutable for a year, so a Commons re-upload under the same title can
    never be written over the old ladder: every edge and browser that holds
    the old bytes would keep them, and the new ones would be served beside
    them under one URL. A changed file therefore gets a NEW address, the
    SHA-1 of "<title>#<Commons content sha1>". The manifest's `h` (and the
    wire's `ih`) carry whichever address is current, so the app follows
    without knowing; the old objects stop being named and `gc` removes them.
    The first derivation of a title keeps the plain sha1_of(title)."""
    return sha1_of(f"{title}#{content_sha1}")


def address_ok(title, entry):
    """Is a prior manifest or journal entry's `h` a legitimate address for
    `title`: the plain one, or the revision of the content sha1 it records."""
    h = (entry or {}).get("h")
    if not h:
        return False
    if h == sha1_of(title):
        return True
    s = entry.get("s")
    return bool(s) and h == revision_key(title, s)


def base_key(title_or_sha1):
    """img/{ab}/{cd}/{sha1}, from a canonical title or a sha1 hex."""
    h = title_or_sha1 if re.fullmatch(r"[0-9a-f]{40}", title_or_sha1 or "") \
        else sha1_of(title_or_sha1)
    return f"{IMG_PREFIX}/{h[:2]}/{h[2:4]}/{h}"


def keys_for(title_or_sha1):
    """The five object keys of one source, in LADDER order."""
    base = base_key(title_or_sha1)
    return [f"{base}/{w}.{fmt}" for fmt, w in LADDER]


def cdn_url(title_or_sha1, width, fmt):
    return f"{CDN_BASE}/{base_key(title_or_sha1)}/{width}.{fmt}"


def r2_purge_cmd(title_or_sha1, remote=REMOTE, bucket=BUCKET):
    """The command that removes one source's five objects from R2 (T050).

    A purge in R2 is not the end of it: the objects were served with a
    one-year immutable header, so the edge and every browser that fetched
    one may still hold it. T050 has to follow this with a Cloudflare cache
    purge of the five cdn_url()s."""
    return ["rclone", "purge", f"{remote}:{bucket}/{base_key(title_or_sha1)}"]


def rung_dims(src_w, src_h, width):
    """What libvips thumbnail(size=down) makes of a src_w x src_h source at
    `width`: never upscaled, height by aspect. Used only to state dims for a
    held source whose prior entry predates the dims field."""
    w = min(width, src_w)
    return [w, max(1, round(src_h * w / src_w))]


# ---------------------------------------------------------------------------
# Sources and the gates
# ---------------------------------------------------------------------------

def storable(img):
    """None when this file may be stored as a resized copy, else the reason.
    T010's storable-copy rule plus the export's credit gate."""
    lic = (img.get("license") or img.get("lic") or img.get("licence")
           or "").strip()
    if not lic:
        return "licence-missing"
    if NOT_STORABLE.search(lic):
        return "licence-not-storable"
    if credit.owes_credit(img):
        return "credit-missing"
    return None


def _is_raster(title, img=None):
    """By extension, before anything is fetched. T007 found 4,280 Tier A
    files that are not photographs (3,953 SVG flags and locator maps, 290
    ogg and wav, 26 webm and ogv, 4 PDF); none of them may reach the
    encoder. The resolve step checks Commons' mime type as well."""
    if title.startswith("geograph:"):
        return True
    ext = title.rsplit(".", 1)[-1].lower() if "." in title else ""
    return ext in RASTER_EXT


class Source:
    __slots__ = ("title", "sha1", "kind", "lic", "by", "nao", "pending",
                 "rank_v", "fetch", "cc", "uses", "order", "rank")

    def __init__(self, title, img, cc, order, pending=False):
        self.title = title
        self.sha1 = sha1_of(title)
        self.kind = "geograph" if title.startswith("geograph:") else "commons"
        self.lic = (img.get("license") or img.get("lic")
                    or img.get("licence") or "").strip()
        self.by = (img.get("author") or img.get("by") or "").strip(" ,;")
        # Commons said no credit is owed (credit.stamp). The manifest keeps
        # it as `n` (T051-c), so an empty author on a CC BY file reads as
        # complete from the manifest alone.
        self.nao = bool(img.get("no_attribution_required"))
        # True when nothing local carries this file's credit: it is read
        # from Commons at resolve time and the gate runs then.
        self.pending = pending
        self.rank_v = img.get("rank_v")
        # Geograph has no imageinfo API; the cached URL is its largest size.
        self.fetch = (img.get("full") or img.get("url") or img.get("f")) \
            if self.kind == "geograph" else None
        self.cc = cc
        self.uses = 1
        self.order = order
        self.rank = None              # position in the published list


def iter_layer(layer, countries=None):
    """(cc, row_index, image_index, record) for every image in the layer's
    rich cache, hero first: all image 0s, then all image 1s, and so on."""
    cache_dir, row_key = LAYERS[layer]
    base = DATA_ROOT / "cache" / cache_dir
    grid = []
    for path in sorted(base.glob("rich_*.json")):
        cc = path.stem.split("_", 1)[1].upper()
        if countries and cc not in countries:
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        for ri, row in enumerate(data.get(row_key) or []):
            for ii, img in enumerate(row.get("images") or []):
                if isinstance(img, dict):
                    grid.append((ii, cc, ri, img))
    grid.sort(key=lambda t: (t[0], t[1], t[2]))
    for ii, cc, ri, img in grid:
        yield cc, ri, ii, img


def _wire_base():
    return DATA_ROOT / "continent-app" / "public"


def _wire_files(paths):
    base = _wire_base()
    out = []
    for rel in paths:
        p = base / rel
        if p.is_dir():
            out.extend(sorted(p.rglob("*.json")))
        elif p.is_file():
            out.append(p)
    return out


# A wire record's credit is the photograph's own only when the record names
# an author itself. A cycling or trail row carries `lic: ODbL 1.0` for its
# geometry beside an `img` URL, and that licence is not the photograph's.
WIRE_AUTHOR_KEYS = ("by", "author")


def _wire_record(node):
    """(title, credit dict or None, Geograph fetch URL or None) for one wire
    dict that is, or carries, a Commons or Geograph photograph; else None."""
    title = None
    if any(isinstance(node.get(k), str) for k in ("u", "url", "big",
                                                   "full", "page")):
        title = canonical_title(node)
    if not title:
        for k in ("img", "thumb"):
            v = node.get(k)
            if isinstance(v, str):
                title = canonical_title(v)
                if title:
                    break
    if not title:
        return None
    cred = None
    if any(k in node for k in WIRE_AUTHOR_KEYS):
        cred = {"lic": (node.get("lic") or node.get("license")
                        or node.get("licence") or ""),
                "by": node.get("by") or node.get("author") or ""}
        if node.get("no_attribution_required"):
            cred["no_attribution_required"] = True
    fetch_url = None
    if title.startswith("geograph:"):
        for k in ("full", "big", "url", "u", "img"):
            v = node.get(k)
            if isinstance(v, str) and _host(v).endswith("geograph.org.uk") \
                    and "/photo/" not in v:
                fetch_url = v
                break
    return title, cred, fetch_url


def _coordinates(node):
    """A list of numbers, or of lists of numbers at any depth: a trail or
    route geometry. Walking one element by element is most of the cost of
    reading the trails and cycling wires, and it never holds a photograph."""
    x = node
    while isinstance(x, list) and x:
        x = x[0]
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def iter_wire(layer):
    """(position, where, title, credit or None, fetch URL) for every photo
    record the layer's wire publishes, hero first: a record's position is
    its index in the nearest enclosing list (0 for a row's lead image or a
    lone `img`), so all leads come before all second images."""
    base = _wire_base()
    grid = []
    seq = 0
    for f in _wire_files(WIRE_LAYERS[layer]):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            continue
        where = f.relative_to(base).as_posix()
        stack = [(data, 0)]
        while stack:
            node, pos = stack.pop()
            if isinstance(node, list):
                if _coordinates(node):
                    continue          # a geometry: millions of numbers, no photo
                for i, x in enumerate(node):
                    if isinstance(x, (list, dict)):
                        stack.append((x, i))
            elif isinstance(node, dict):
                rec = _wire_record(node)
                if rec:
                    seq += 1
                    grid.append((pos, where, seq) + rec)
                for v in node.values():
                    if isinstance(v, (list, dict)):
                        stack.append((v, 0))
    grid.sort(key=lambda t: (t[0], t[1], t[2]))
    for pos, where, _seq, title, cred, fetch_url in grid:
        yield pos, where, title, cred, fetch_url


def published_titles(layer):
    """Canonical titles the layer's wire publishes (continent-app/public/
    <layer>/*.json), for --published-only and the plan's counts."""
    if layer in WIRE_LAYERS:
        if not _wire_files(WIRE_LAYERS[layer]):
            return None
        return {t for _p, _w, t, _c, _f in iter_wire(layer)}
    out = set()
    base = _wire_base() / layer
    if not base.exists():
        return None

    def walk(node):
        if isinstance(node, list):
            for x in node:
                walk(x)
        elif isinstance(node, dict):
            if any(k in node for k in takedown.IMAGE_KEYS):
                t = canonical_title(node)
                if t:
                    out.add(t)
            for v in node.values():
                if isinstance(v, (list, dict)):
                    walk(v)
    for path in sorted(base.glob("*.json")):
        try:
            walk(json.loads(path.read_text(encoding="utf-8")))
        except ValueError:
            continue
    return out


# ---------------------------------------------------------------------------
# The sources file (T049-f, T049-k): what the app shows, for a worker that
# has no wire
# ---------------------------------------------------------------------------

def _cache_layer_wire(layer):
    """(title, credit, fetch) for the wire of a cache layer, hero first."""
    grid = []
    base = _wire_base() / layer
    paths = sorted(base.glob("*.json")) if base.exists() else []
    for path in paths:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except ValueError:
            continue
        if not isinstance(data, dict):
            continue
        for key in (layer, "peaks", "listed"):
            for ri, row in enumerate(data.get(key) or []):
                if not isinstance(row, dict):
                    continue
                for ii, img in enumerate(row.get("images") or []):
                    if isinstance(img, dict):
                        rec = _wire_record(img)
                        if rec:
                            grid.append((ii, path.name, ri) + rec)
    grid.sort(key=lambda t: (t[0], t[1], t[2]))
    for _ii, _f, _ri, title, cred, fetch_url in grid:
        yield title, cred, fetch_url


def build_sources(layer):
    """The published list of one layer, hero first, with what a worker needs
    to derive a file its cache does not hold: the credit when the wire
    carries the photograph's own, and Geograph's image URL.

    Written on a box that has the wire (after an export) and pushed to
    img/manifest/_sources/<layer>.json, which image_transcode.sh already
    copies with the rest of img/manifest/ as --prior. A run that finds it
    derives the published files first (the app's 12,823 beach titles before
    the cache's other 25,000) and, for a wire layer, has a source list at
    all."""
    titles, records = [], {}
    if layer in WIRE_LAYERS:
        it = ((t, c, f) for _p, _w, t, c, f in iter_wire(layer))
    else:
        it = _cache_layer_wire(layer)
    for title, cred, fetch_url in it:
        if title in records:
            continue
        rec = {}
        if cred:
            rec.update({k: v for k, v in cred.items() if v})
        if fetch_url:
            rec["f"] = fetch_url
        records[title] = rec
        titles.append(title)
    return {"schema": SOURCES_SCHEMA, "layer": layer,
            "kind": ALL_LAYERS[layer], "generated_at": now_utc(),
            "count": len(titles), "titles": titles, "records": records}


def load_sources(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("schema") != SOURCES_SCHEMA:
        raise ValueError(f"{path}: not a {SOURCES_SCHEMA} file")
    return data


def find_sources(layer, explicit=None, prior=None):
    """The sources file to use: --sources, else <prior>/_sources/<layer>.json
    (the job's copy of img/manifest), else None."""
    if explicit:
        return load_sources(explicit)
    if prior:
        for cand in (Path(prior) / "_sources" / f"{layer}.json",
                     Path(prior) / IMG_PREFIX / SOURCES_DIR / f"{layer}.json"):
            if cand.exists():
                return load_sources(cand)
    return None


def collect(layer, countries=None, published=None, sources_doc=None):
    """(sources in derive order, stats). One Source per canonical title;
    a file used by several rows is one object in R2.

    Order: with a sources file, every published title first, in its
    published hero-first order, then the rest of the cache hero-first;
    without one, the cache's hero-first order (T049). A wire layer with no
    sources file reads the local wire."""
    ledger = takedown.load_ledger()
    stats = {"records": 0, "rejected": {}, "unique": 0, "pending_credit": 0}
    by_title = {}
    seen = set()
    order = 0

    def reject(reason):
        stats["rejected"][reason] = stats["rejected"].get(reason, 0) + 1

    def gate(title, img, cc, pending):
        nonlocal order
        if title in seen:
            if title in by_title:
                by_title[title].uses += 1
                # Commons' "nothing owed" is a fact about the file: any row
                # that recorded it speaks for every row (T051-c).
                if img.get("no_attribution_required"):
                    by_title[title].nao = True
            return
        seen.add(title)
        if not _is_raster(title, img):
            reject("not-raster")
            return
        if not pending:
            why = storable(img)
            if why:
                reject(why)
                return
        if ledger and (takedown.is_taken_down(title, ledger) or any(
                takedown.is_taken_down(img.get(k), ledger)
                for k in ("url", "full", "page", "u", "big", "f"))):
            reject("taken-down")
            return
        if published is not None and title not in published:
            reject("not-published")
            return
        by_title[title] = Source(title, img, cc, order, pending=pending)
        stats["pending_credit"] += pending
        order += 1

    if layer in LAYERS:
        for cc, _ri, _ii, img in iter_layer(layer, countries):
            stats["records"] += 1
            title = canonical_title(img)
            if not title:
                reject("no-title")
                continue
            gate(title, img, cc, False)
    doc_titles = (sources_doc or {}).get("titles") or []
    doc_records = (sources_doc or {}).get("records") or {}
    if sources_doc is not None:
        # Published files the cache does not hold (T007's wire orphans), and
        # for a wire layer every file. A title the cache already gated, in
        # or out, is never re-admitted from the wire.
        for title in doc_titles:
            if layer in LAYERS and title in seen:
                continue
            stats["records"] += 1
            rec = dict(doc_records.get(title) or {})
            pending = title.startswith("File:") and not (
                rec.get("lic") or rec.get("license"))
            gate(title, rec, None, pending)
    elif layer in WIRE_LAYERS:
        for _p, _w, title, cred, fetch_url in iter_wire(layer):
            stats["records"] += 1
            rec = dict(cred or {})
            if fetch_url:
                rec["f"] = fetch_url
            pending = title.startswith("File:") and not rec.get("lic")
            gate(title, rec, None, pending)
    srcs = list(by_title.values())
    if doc_titles:
        rank = {t: i for i, t in enumerate(doc_titles)}
        for s in srcs:
            s.rank = rank.get(s.title)
        srcs.sort(key=lambda s: (s.rank is None,
                                 s.rank if s.rank is not None else s.order))
    stats["unique"] = len(srcs)
    stats["published_first"] = sum(1 for s in srcs if s.rank is not None)
    return srcs, stats


# ---------------------------------------------------------------------------
# What R2 already holds, and what earlier runs recorded about it
# ---------------------------------------------------------------------------

def load_held(path):
    """Keys under img/ that exist, as a set of 'ab/cd/<sha1>/<w>.<fmt>'.
    `path` is an `rclone lsf -R --files-only r2:carta/img` listing, or a
    local directory laid out like img/ (the --upload none/dry-run output)."""
    held = set()
    if not path:
        return held
    p = Path(path)
    if p.is_dir():
        for f in p.rglob("*"):
            if f.is_file() and f.suffix in (".avif", ".webp"):
                held.add(f.relative_to(p).as_posix())
        return held
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip().lstrip("/")
            if line.startswith(IMG_PREFIX + "/"):
                line = line[len(IMG_PREFIX) + 1:]
            if line:
                held.add(line)
    return held


def is_held(held, sha1):
    rel = f"{sha1[:2]}/{sha1[2:4]}/{sha1}"
    return all(f"{rel}/{w}.{fmt}" in held for fmt, w in LADDER)


def load_manifest(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("schema") != MANIFEST_SCHEMA:
        raise ValueError(f"{path}: not a {MANIFEST_SCHEMA} manifest")
    return data


def load_prior(path, layer=None):
    """title -> {h, d, s, p, lic, by, n} from every manifest and journal
    under `path` (any layer: a file shared by two layers is derived once),
    plus the prior manifest of `layer` itself when there is one. A journal
    is newer than any manifest built before it, so its entry wins."""
    known, own = {}, None
    if not path or not Path(path).exists():
        return known, own
    for f in sorted(Path(path).rglob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except ValueError:
            continue
        if data.get("schema") == MANIFEST_SCHEMA:
            if data.get("ladder") != LADDER_V:
                continue
            credits = data.get("credits") or []
            for title, e in (data.get("files") or {}).items():
                pair = credits[e["c"]] if isinstance(e.get("c"), int) and \
                    e["c"] < len(credits) else ["", ""]
                known.setdefault(title, {"h": e["h"], "d": e["d"],
                                         "s": e.get("s"), "p": e.get("p"),
                                         "lic": pair[0], "by": pair[1],
                                         "n": e.get("n")})
            if layer and data.get("layer") == layer and (
                    own is None or str(data.get("generated_at", ""))
                    > str(own.get("generated_at", ""))):
                own = data
        elif data.get("schema") == MANIFEST_SCHEMA + ".journal":
            if data.get("ladder") != LADDER_V:
                continue
            for e in data.get("entries") or []:
                known[e["title"]] = {"h": e["h"], "d": e["d"],
                                     "s": e.get("s"), "p": e.get("p"),
                                     "lic": e.get("lic"), "by": e.get("by"),
                                     "n": e.get("n")}
    return known, own


def ledger_floor(path):
    """The most takedown-ledger rows any prior manifest was built against.

    T050-c: the backstop that keeps a taken-down file out of R2 is the
    ledger, read by collect(). A ledger that was lost or reset would let a
    re-run derive the file again. Every manifest records how many rows its
    run saw, so a run that now sees fewer refuses to upload."""
    floor = 0
    if not path or not Path(path).exists():
        return floor
    for f in Path(path).rglob("*.json"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except ValueError:
            continue
        if data.get("schema") == MANIFEST_SCHEMA:
            floor = max(floor, int((data.get("ledger") or {}).get("rows")
                                   or 0))
    return floor


# ---------------------------------------------------------------------------
# Resolve and fetch, through the harvest's own politeness
# ---------------------------------------------------------------------------

def resolve_commons(batch):
    """imageinfo for up to 50 Sources: sets .fetch, returns
    {title: (status, info)} with status ok / missing / not-raster / error.

    extmetadata comes in the same request (no extra call): a source whose
    credit nothing local carries (`pending`, the wire layers) takes its
    licence, author and AttributionRequired from it, the same fields and the
    same credit.author_of rule the harvests use."""
    out = {}
    titles = [s.title for s in batch]
    try:
        res = sources.mediawiki(commons.with_maxlag({
            "prop": "imageinfo", "titles": "|".join(titles),
            "iiprop": "url|size|mime|sha1|extmetadata",
            "iiextmetadatafilter": credit.EXTMETA_CREDIT,
            "iiurlwidth": SOURCE_WIDTH,
        })) or {}
    except sources.SourceError as exc:
        return {t: ("error", str(exc)) for t in titles}
    q = res.get("query") or {}
    alias = {n["to"]: n["from"] for n in q.get("normalized") or []}
    by_src = {s.title: s for s in batch}
    for page in q.get("pages") or []:
        title = alias.get(page.get("title"), page.get("title"))
        src = by_src.get(title) or by_src.get(canonical_title(title) or "")
        if src is None:
            continue
        if page.get("missing") or not page.get("imageinfo"):
            out[src.title] = ("missing", None)
            continue
        ii = page["imageinfo"][0]
        if ii.get("mime") not in RASTER_MIME:
            out[src.title] = ("not-raster", ii.get("mime"))
            continue
        meta = ii.get("extmetadata") or {}
        out[src.title] = ("ok", {
            "w": ii.get("width"), "h": ii.get("height"),
            "sha1": ii.get("sha1"), "bytes": ii.get("size"),
            "url": ii.get("thumburl") or ii.get("url"),
            "lic": credit.clean((meta.get("LicenseShortName") or {})
                                .get("value", "")),
            "by": credit.author_of(meta),
            "nao": not credit.attribution_required(meta) if meta else False})
    for t in titles:
        out.setdefault(t, ("missing", None))
    return out


def apply_credit(src, info):
    """Fill a pending source's credit from Commons and gate it. Returns
    None when it may be stored, else the reason (storable's)."""
    src.lic = info.get("lic") or ""
    src.by = (info.get("by") or "").strip(" ,;")
    src.nao = bool(info.get("nao"))
    src.pending = False
    rec = {"license": src.lic, "author": src.by}
    if src.nao:
        rec["no_attribution_required"] = True
    return storable(rec)


def fetch(src, work, sem):
    """Download one original to the work dir. Returns (src, path, error)."""
    if STOP.is_set() or over_budget():
        return src, None, "stopped"
    sem.acquire()
    if STOP.is_set() or over_budget():
        sem.release()
        return src, None, "stopped"
    t = time.time()
    try:
        raw = sources.request(src.fetch, headers={"Accept": "image/*"},
                              timeout=120, quiet=True)
    except sources.SourceError as exc:
        sem.release()
        return src, None, f"fetch: {exc}"
    except Exception as exc:  # noqa: BLE001  one file never stops the run
        sem.release()
        return src, None, f"fetch: {exc!r}"
    TIMES["fetch"].append(time.time() - t)
    path = work / f"{src.sha1}.src"
    path.write_bytes(raw)
    return src, path, None


# ---------------------------------------------------------------------------
# libvips
# ---------------------------------------------------------------------------

_pyvips = None


def vips():
    """pyvips, loaded once. On Windows the DLLs come from CARTA_VIPS_BIN."""
    global _pyvips
    if _pyvips is None:
        bin_dir = os.environ.get("CARTA_VIPS_BIN")
        if bin_dir:
            os.environ["PATH"] = bin_dir + os.pathsep + os.environ["PATH"]
            if hasattr(os, "add_dll_directory"):
                os.add_dll_directory(bin_dir)
        import pyvips  # noqa: PLC0415
        pyvips.cache_set_max(0)       # every source is seen once
        _pyvips = pyvips
    return _pyvips


def _save_opts(fmt):
    if fmt == "avif":
        return {"Q": AVIF_Q, "compression": "av1", "effort": AVIF_EFFORT,
                "subsample_mode": "auto"}
    return {"Q": WEBP_Q, "effort": WEBP_EFFORT}


def _encode_one(image, fmt):
    """Bytes of one rung, metadata stripped. `keep` is libvips 8.15's name
    for what 8.14 called `strip`."""
    pv = vips()
    saver = image.heifsave_buffer if fmt == "avif" else image.webpsave_buffer
    try:
        return saver(keep=pv.enums.ForeignKeep.NONE, **_save_opts(fmt))
    except (pv.Error, AttributeError):
        return saver(strip=True, **_save_opts(fmt))


def _check_magic(buf, fmt):
    if fmt == "avif":
        return len(buf) > 16 and buf[4:8] == b"ftyp" and b"avif" in buf[8:32]
    return len(buf) > 16 and buf[:4] == b"RIFF" and buf[8:12] == b"WEBP"


def encode(src, path, stage):
    """The five rungs of one source into stage/{ab}/{cd}/{sha1}/.
    Returns (dims, bytes_by_rung, source_dims). Every output is checked for
    its magic bytes: T008 found vipsthumbnail exiting 0 with no file."""
    pv = vips()
    out_dir = stage / src.sha1[:2] / src.sha1[2:4] / src.sha1
    out_dir.mkdir(parents=True, exist_ok=True)
    dims, sizes = {}, {}
    probe = pv.Image.new_from_file(str(path), access="sequential")
    source_dims = [probe.width, probe.height]
    del probe
    for width in WIDTHS:
        image = pv.Image.thumbnail(str(path), width, height=10_000_000,
                                   size="down")
        if image.interpretation != "srgb":
            image = image.colourspace("srgb")
        if image.format != "uchar":
            image = image.cast("uchar")
        # thumbnail() streams the source sequentially, so the pipeline can
        # be evaluated once; two savers on it fail with "out of order read".
        # The rung is small, render it to memory and save from there.
        image = image.copy_memory()
        dims[str(width)] = [image.width, image.height]
        for fmt, w in LADDER:
            if w != width:
                continue
            buf = _encode_one(image, fmt)
            if not _check_magic(buf, fmt):
                raise RuntimeError(f"{fmt} {width}: encoder returned no image")
            target = out_dir / f"{width}.{fmt}"
            tmp = target.with_name(target.name + ".part")
            tmp.write_bytes(buf)
            os.replace(tmp, target)
            sizes[f"{width}.{fmt}"] = len(buf)
    return dims, sizes, source_dims, placeholder(out_dir / "320.webp")


def placeholder(path):
    """The hero placeholder (T052-c): wire_ladder's six flat colours, encoded
    here while the pixels are on disk, so the manifest carries it as `p` and
    the export box (which has no img/ tree) can join it without --img-root.
    The same function the export used, so the 24 characters are identical."""
    import wire_ladder  # noqa: PLC0415  (wire_ladder loads derive lazily)
    return wire_ladder.encode_placeholder(path)


def selfcheck():
    """Can this libvips write AVIF and WebP? Ubuntu's libheif ships its AV1
    encoder as a separate package (libheif-plugin-aomenc); without it
    heifsave fails, and a ladder with no AVIF is not the ladder."""
    pv = vips()
    image = (pv.Image.black(96, 64, bands=3) + [40, 120, 200]).cast("uchar")
    report = {"libvips": ".".join(str(pv.version(i)) for i in range(3)),
              "pyvips": getattr(pv, "__version__", "?")}
    ok = True
    for fmt in ("avif", "webp"):
        try:
            buf = _encode_one(image, fmt)
            good = _check_magic(buf, fmt)
            report[fmt] = f"{len(buf)} bytes" if good else "NO IMAGE"
            ok = ok and good
        except Exception as exc:  # noqa: BLE001
            report[fmt] = f"FAILED: {exc}".splitlines()[0]
            ok = False
    for k, v in report.items():
        print(f"  {k}: {v}")
    print("selfcheck", "ok" if ok else "FAILED")
    return 0 if ok else 1


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

def rclone_image_cmds(stage):
    """The two commands that put one batch in R2, one per format so each
    object carries its own Content-Type. --no-check-dest: everything in the
    batch is by construction not held, so no per-object HEAD is spent."""
    cmds = []
    for fmt in ("avif", "webp"):
        cmds.append([
            os.environ.get("CARTA_RCLONE", "rclone"), "copy", str(stage),
            f"{REMOTE}:{BUCKET}/{IMG_PREFIX}",
            "--include", f"*.{fmt}",
            "--header-upload", f"Cache-Control: {IMMUTABLE}",
            "--header-upload", f"Content-Type: {CONTENT_TYPE[fmt]}",
            "--s3-no-check-bucket", "--no-check-dest",
            "--transfers", "16", "--checkers", "16",
            "--retries", "3", "--low-level-retries", "10",
            "--stats", "0",
        ])
    return cmds


def rclone_json_cmd(local, key, cache_control):
    return [os.environ.get("CARTA_RCLONE", "rclone"), "copyto", str(local),
            f"{REMOTE}:{BUCKET}/{key}",
            "--header-upload", f"Cache-Control: {cache_control}",
            "--header-upload", "Content-Type: application/json",
            "--s3-no-check-bucket", "--retries", "3"]


def show(cmd):
    print("+ " + " ".join(_q(c) for c in cmd), flush=True)


def _q(arg):
    return arg if re.fullmatch(r"[A-Za-z0-9_./:=,+-]+", arg) \
        else "'" + arg.replace("'", "'\\''") + "'"


class Uploader:
    """none: keep everything under out/ (img/ laid out as in R2).
    dry-run: the same, and print every rclone command a real run would run.
    r2: run them, then delete the staged batch (the disk is ephemeral)."""

    def __init__(self, mode, out, layer, run_id):
        self.mode, self.out, self.layer, self.run_id = mode, out, layer, run_id
        self.n = 0

    def _run(self, cmd):
        if self.mode == "none":
            return
        show(cmd)
        if self.mode != "r2":
            return
        proc = subprocess.run(cmd, check=False)
        if proc.returncode != 0:
            raise RuntimeError(f"rclone exited {proc.returncode}")

    def batch(self, stage, entries):
        """Images first, then the journal naming them: a journal entry
        always means its five objects are in place."""
        self.n += 1
        for cmd in rclone_image_cmds(stage):
            self._run(cmd)
        journal = {"schema": MANIFEST_SCHEMA + ".journal", "ladder": LADDER_V,
                   "layer": self.layer, "run": self.run_id, "batch": self.n,
                   "at": now_utc(), "entries": entries}
        rel = f"{JOURNAL_DIR}/{self.layer}/{self.run_id}-{self.n:05d}.json"
        local = self.out / IMG_PREFIX / rel
        local.parent.mkdir(parents=True, exist_ok=True)
        local.write_text(json.dumps(journal, ensure_ascii=False,
                                    separators=(",", ":")), encoding="utf-8")
        self._run(rclone_json_cmd(local, f"{IMG_PREFIX}/{rel}", "no-store"))
        if self.mode == "r2":
            shutil.rmtree(stage, ignore_errors=True)
        else:
            _merge_tree(stage, self.out / IMG_PREFIX)

    def manifest(self, local):
        key = f"{IMG_PREFIX}/{MANIFEST_DIR}/{self.layer}.json"
        self._run(rclone_json_cmd(local, key, MANIFEST_CACHE))


def _merge_tree(src, dst):
    for f in src.rglob("*"):
        if f.is_file():
            target = dst / f.relative_to(src)
            target.parent.mkdir(parents=True, exist_ok=True)
            os.replace(f, target)
    shutil.rmtree(src, ignore_errors=True)


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------

def build_manifest(layer, sources_, entries, run_id, ledger_rows=None):
    """The per-layer manifest (MANIFEST_SCHEMA). `files` maps the canonical
    source title to:

        h   the address: sha1 hex of the title, or of "<title>#<s>" for a
            re-upload (revision_key); the objects are {base}/{h[0:2]}/
            {h[2:4]}/{h}/{w}.{fmt} for every rung in `rungs`
        d   [[w, h], [w, h], [w, h]]: the real pixel size of the 320, 640
            and 1280 rungs (a source narrower than a rung is not upscaled,
            so "1280" can be 900 px wide; the WebP rungs share these sizes)
        c   index into `credits`, [licence, author]; the page to link is
            PAGE_URL by kind (commons: the title, geograph: the id)
        n   1 when Commons says no credit is owed (AttributionRequired
            false), so an empty author is complete, not a gap (T051-c).
            Absent means a credit is owed, the safe reading
        p   the 24 character hero placeholder (wire_ladder), when known
            (T052-c)
        s   Commons' content sha1 of the file derived, when known: the
            baseline a later --recheck compares a re-upload against
            (T049-i)
        r   rank_v of the record the source was taken from, when scored

    Sorted, compact, and hashed without the run fields, so a run that
    changes nothing produces the same inputs_hash and uploads nothing.
    `ledger` (outside the hash) is how many takedown rows the run saw;
    ledger_floor() reads it back (T050-c)."""
    credits, credit_ix, files = [], {}, {}
    rank = {}
    for src in sorted(sources_, key=lambda s: s.title):
        e = entries.get(src.title)
        if not e:
            continue
        pair = (src.lic, src.by)
        if pair not in credit_ix:
            credit_ix[pair] = len(credits)
            credits.append(list(pair))
        row = {"h": e["h"], "d": [e["d"][str(w)] for w in WIDTHS],
               "c": credit_ix[pair]}
        if src.nao or e.get("n"):
            row["n"] = 1
        if e.get("p"):
            row["p"] = e["p"]
        if e.get("s"):
            row["s"] = e["s"]
        if src.rank_v:
            row["r"] = src.rank_v
        files[src.title] = row
        rank[src.rank_v or "none"] = rank.get(src.rank_v or "none", 0) + 1
    body = {"files": files, "credits": credits}
    inputs_hash = hashlib.sha1(json.dumps(
        body, ensure_ascii=False, sort_keys=True,
        separators=(",", ":")).encode("utf-8")).hexdigest()
    return {
        "schema": MANIFEST_SCHEMA,
        "layer": layer,
        "ladder": LADDER_V,
        "base": f"{CDN_BASE}/{IMG_PREFIX}",
        "path": "{h0_2}/{h2_4}/{h}/{w}.{fmt}",
        "rungs": {"avif": [320, 640, 1280], "webp": [320, 640]},
        "encoder": {"avif": {"Q": AVIF_Q, "effort": AVIF_EFFORT,
                             "subsample": "4:2:0"},
                    "webp": {"Q": WEBP_Q, "effort": WEBP_EFFORT},
                    "source_width": SOURCE_WIDTH},
        "page": PAGE_URL,
        "generated_at": now_utc(),
        "run": run_id,
        "inputs_hash": inputs_hash,
        "ledger": {"rows": int(ledger_rows if ledger_rows is not None
                               else len(takedown.load_ledger()))},
        "count": len(files),
        "rank_v": rank,
        "credits": credits,
        "files": files,
    }


# ---------------------------------------------------------------------------
# plan / run
# ---------------------------------------------------------------------------

def _countries(arg):
    return {c.strip().upper() for c in arg.split(",") if c.strip()} \
        if arg else None


def _published_for(args, sources_doc):
    """The published set for --published-only: the sources file's titles
    when there is one (the worker has no wire), else the local wire."""
    if not args.published_only:
        return None, None
    if sources_doc is not None:
        return set(sources_doc.get("titles") or []), None
    published = published_titles(args.layer)
    if published is None:
        return None, (f"no wire under continent-app/public/ for "
                      f"{args.layer} and no sources file")
    return published, None


def _entry_from_known(k):
    e = {"h": k["h"], "d": _dims_dict(k["d"])}
    for key in ("s", "p", "n"):
        if k.get(key):
            e[key] = k[key]
    return e


def cmd_plan(args):
    sources_doc = find_sources(args.layer, args.sources, args.prior)
    published, err = _published_for(args, sources_doc)
    if err:
        print(err)
        return 2
    srcs, stats = collect(args.layer, _countries(args.countries), published,
                          sources_doc)
    held = load_held(args.held)
    known, own = load_prior(args.prior, args.layer)
    n_held = sum(1 for s in srcs if s.title in known
                 and address_ok(s.title, known[s.title])
                 and is_held(held, known[s.title]["h"]))
    print(f"layer {args.layer} ({ALL_LAYERS[args.layer]}): "
          f"{stats['records']} image records, {stats['unique']} unique "
          f"sources after the gates")
    for k, v in sorted(stats["rejected"].items()):
        print(f"  rejected {k}: {v}")
    if stats["pending_credit"]:
        print(f"  credit read from Commons at resolve: "
              f"{stats['pending_credit']} (gated then)")
    if sources_doc is not None:
        print(f"  sources file: {sources_doc.get('count')} published titles "
              f"({sources_doc.get('generated_at')}); derived first: "
              f"{stats['published_first']}")
    else:
        wire = published_titles(args.layer)
        if wire is not None:
            in_wire = sum(1 for s in srcs if s.title in wire)
            print(f"  wire publishes {len(wire)} unique titles; "
                  f"{in_wire} of the sources are among them")
    print(f"  held in R2 with known dims: {n_held}; to derive: "
          f"{len(srcs) - n_held}; objects to write: "
          f"{(len(srcs) - n_held) * len(LADDER)}")
    if own:
        print(f"  prior manifest: {own.get('count')} files, "
              f"inputs_hash {own.get('inputs_hash', '')[:12]}")
    return 0


def _stats(values):
    if not values:
        return {}
    values = sorted(values)
    return {"n": len(values), "sum": sum(values),
            "mean": round(statistics.fmean(values)),
            "median": round(statistics.median(values)),
            "p90": values[min(len(values) - 1, int(0.9 * len(values)))],
            "min": values[0], "max": values[-1]}


def cmd_run(args):
    run_id = args.run_id or datetime.now(timezone.utc).strftime(
        "%Y%m%dt%H%M%Sz-local")
    out = Path(args.out).resolve()
    work = Path(args.work).resolve() if args.work else out / "_work"
    orig_dir, stage_root = work / "orig", work / "stage"
    for d in (out, orig_dir, stage_root):
        d.mkdir(parents=True, exist_ok=True)
    if args.upload == "r2" and not os.environ.get("RCLONE_CONFIG_R2_ENDPOINT") \
            and not os.environ.get("CARTA_RCLONE"):
        print("--upload r2 needs the RCLONE_CONFIG_R2_* remote in the "
              "environment (T045-a); nothing was done")
        return 2
    # T050-c: a ledger with fewer rows than an earlier run saw has been lost
    # or reset, and the gate that keeps taken-down files out would be open.
    floor = ledger_floor(args.prior)
    rows = len(takedown.load_ledger())
    if rows < floor and not args.allow_ledger_shrink:
        print(f"REFUSED: the takedown ledger has {rows} rows, an earlier "
              f"manifest was built against {floor}. Restore "
              f"cache/photos/takedowns.json from git before deriving "
              f"(--allow-ledger-shrink only after a deliberate removal)")
        return 2

    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: (STOP.set(), print(
            "stop requested: finishing the batch in hand", flush=True)))

    t0 = time.time()
    if args.budget_s:
        BUDGET["until"] = t0 + args.budget_s
    sources_doc = find_sources(args.layer, args.sources, args.prior)
    if args.layer in WIRE_LAYERS and sources_doc is None and \
            published_titles(args.layer) is None:
        print(f"{args.layer} is a wire layer: it needs its wire or a sources "
              f"file (derive.py sources {args.layer}, pushed to "
              f"img/{SOURCES_DIR}/{args.layer}.json)")
        return 2
    published, err = _published_for(args, sources_doc)
    if err:
        print(err)
        return 2
    srcs, stats = collect(args.layer, _countries(args.countries), published,
                          sources_doc)
    if args.sample:
        rnd = random.Random(args.seed)
        pos = {id(s): i for i, s in enumerate(srcs)}
        srcs = sorted(rnd.sample(srcs, min(args.sample, len(srcs))),
                      key=lambda s: pos[id(s)])
    if args.limit:
        srcs = srcs[:args.limit]
    held = load_held(args.held)
    known, own = load_prior(args.prior, args.layer)

    entries, todo, recheck = {}, [], []
    for s in srcs:
        k = known.get(s.title)
        if k and address_ok(s.title, k) and is_held(held, k["h"]) and (
                not s.pending or k.get("lic")):
            s.sha1 = k["h"]
            if s.pending:
                s.lic, s.by = k.get("lic") or "", k.get("by") or ""
                s.nao, s.pending = bool(k.get("n")), False
            entries[s.title] = _entry_from_known(k)
            if args.recheck and s.kind == "commons" and k.get("s"):
                recheck.append(s)
        else:
            todo.append(s)
    print(f"{args.layer}: {len(srcs)} sources, {len(entries)} held, "
          f"{len(todo)} to derive (run {run_id}, upload {args.upload})",
          flush=True)

    report = {"run": run_id, "layer": args.layer, "upload": args.upload,
              "started_at": now_utc(), "gates": stats,
              "sources": len(srcs), "held": len(entries),
              "to_derive": len(todo), "derived": 0, "dead": [],
              "not_raster": [], "failed": [], "refused": [],
              "reuploaded": [], "rechecked": len(recheck), "bytes": {},
              "src_dims": [], "timings_s": {}}

    # resolve: Commons imageinfo in batches of 50, through the 0.4 s pacer.
    # --recheck sends the held Commons sources through it too (one request
    # per 50, no download): a changed content sha1 is a re-upload, which
    # gets a new address and is derived again (T049-i).
    t = time.time()
    meta = {}
    commons_todo = [s for s in todo if s.kind == "commons"] + recheck
    in_recheck = {id(s) for s in recheck}
    for i in range(0, len(commons_todo), commons.TITLES_PER_REQ):
        if STOP.is_set():
            break
        batch = commons_todo[i:i + commons.TITLES_PER_REQ]
        by_title = {s.title: s for s in batch}
        for title, (status, info) in resolve_commons(batch).items():
            src = by_title[title]
            rechecking = id(src) in in_recheck
            if status != "ok":
                if rechecking:
                    continue          # a held copy stays; the next run asks again
                if status == "missing":
                    report["dead"].append(title)
                elif status == "not-raster":
                    report["not_raster"].append([title, info])
                else:
                    report["failed"].append([title, f"resolve: {info}"])
                continue
            k = known.get(title)
            old_s = (k or {}).get("s")
            changed = bool(old_s and info.get("sha1")
                           and info["sha1"] != old_s)
            if rechecking and not changed:
                continue
            if src.pending:
                why = apply_credit(src, info)
                if why:
                    report["refused"].append([title, why])
                    continue
            if k and address_ok(title, k) and not changed:
                src.sha1 = k["h"]             # same bytes, same address
            elif changed:
                src.sha1 = revision_key(title, info["sha1"])
                report["reuploaded"].append([title, k["h"], src.sha1])
                if rechecking:
                    entries.pop(title, None)
                    todo.append(src)
            meta[title] = info
            src.fetch = info.get("url")
    resolved = [s for s in todo if s.fetch]
    report["timings_s"]["resolve"] = round(time.time() - t, 1)

    # fetch (2 workers, the harvest's pacer) feeding encode (every core)
    t = time.time()
    sem = threading.Semaphore(ORIGINALS_IN_FLIGHT)
    sizes_by_rung = {f"{w}.{fmt}": [] for fmt, w in LADDER}
    uploader = Uploader(args.upload, out, args.layer, run_id)
    batch_entries, batch_n = [], [0]
    stage = [stage_root / f"b{batch_n[0]:05d}"]

    def flush():
        if not batch_entries:
            return
        uploader.batch(stage[0], list(batch_entries))
        batch_entries.clear()
        batch_n[0] += 1
        stage[0] = stage_root / f"b{batch_n[0]:05d}"

    def do_encode(src, path):
        try:
            t_enc = time.time()
            result = encode(src, path, stage[0])
            TIMES["encode"].append(time.time() - t_enc)
            return src, result, None
        except Exception as exc:  # noqa: BLE001
            return src, None, f"encode: {exc}".splitlines()[0]
        finally:
            try:
                path.unlink()
            except OSError:
                pass
            sem.release()

    encoders = max(1, args.encoders or os.cpu_count() or 1)
    enc_futs = set()
    upload_error = None

    def drain(block=False):
        nonlocal upload_error
        done = [f for f in enc_futs if f.done()] if not block else \
            list(wait(enc_futs).done)
        for f in done:
            enc_futs.discard(f)
            src, result, err = f.result()
            if err:
                report["failed"].append([src.title, err])
                continue
            dims, sizes, source_dims, ph = result
            entry = {"title": src.title, "h": src.sha1, "d": dims,
                     "s": meta.get(src.title, {}).get("sha1"),
                     "lic": src.lic, "by": src.by, "r": src.rank_v,
                     "bytes": sizes}
            if ph:
                entry["p"] = ph
            if src.nao:
                entry["n"] = 1
            batch_entries.append(entry)
            entries[src.title] = {k: entry[k] for k in ("h", "d", "s", "p",
                                                         "n") if entry.get(k)}
            report["derived"] += 1
            report["src_dims"].append(source_dims)
            for k, v in sizes.items():
                sizes_by_rung[k].append(v)
        # A batch is uploaded only when no encode is writing into its stage
        # directory, so every batch that goes up is complete.
        if len(batch_entries) >= BATCH and not enc_futs and upload_error is None:
            try:
                flush()
            except RuntimeError as exc:
                upload_error = str(exc)
                STOP.set()

    with ThreadPoolExecutor(HARVEST_WORKERS) as fetch_pool, \
            ThreadPoolExecutor(encoders) as enc_pool:
        fetch_futs = [fetch_pool.submit(fetch, s, orig_dir, sem)
                      for s in resolved]
        for n, f in enumerate(as_completed(fetch_futs), 1):
            src, path, err = f.result()
            if err:
                if err != "stopped":
                    report["failed"].append([src.title, err])
            else:
                enc_futs.add(enc_pool.submit(do_encode, src, path))
            if len(batch_entries) + len(enc_futs) >= BATCH:
                drain(block=True)
            else:
                drain()
            if n % 100 == 0:
                print(f"  {n}/{len(resolved)} fetched, {report['derived']} "
                      f"derived, {len(report['failed'])} failed, "
                      f"{time.time() - t:.0f}s", flush=True)
        drain(block=True)
    if upload_error is None:
        try:
            flush()
        except RuntimeError as exc:
            upload_error = str(exc)
    report["timings_s"]["fetch_encode_upload"] = round(time.time() - t, 1)
    shutil.rmtree(stage_root, ignore_errors=True)
    shutil.rmtree(orig_dir, ignore_errors=True)

    report["bytes"] = {k: _stats(v) for k, v in sizes_by_rung.items()}
    report["ms_each"] = {k: _stats([round(x * 1000) for x in v])
                         for k, v in TIMES.items()}
    report["dead_n"] = len(report["dead"])
    report["failed_n"] = len(report["failed"])
    report["refused_n"] = len(report["refused"])

    # the manifest: last; not after a signal or a failed upload (the journals
    # carry that progress), but yes after the time budget, for what exists
    rc = 0
    report_dir = out / "report"
    report_dir.mkdir(parents=True, exist_ok=True)
    if upload_error:
        print(f"upload failed: {upload_error}; journal kept, no manifest")
        rc = 4
    elif STOP.is_set():
        print("stopped before the end: journals hold the finished batches, "
              "the manifest was not written; run again to continue")
        rc = 75
    else:
        if BUDGET["hit"]:
            left = len(srcs) - len(entries)
            print(f"time budget reached: {left} sources left for the next "
                  f"run; the manifest lists the {len(entries)} that exist")
            report["partial"] = True
            report["left"] = left
        manifest = build_manifest(args.layer, srcs, entries, run_id, rows)
        report["manifest_count"] = manifest["count"]
        report["inputs_hash"] = manifest["inputs_hash"]
        local = out / IMG_PREFIX / MANIFEST_DIR / f"{args.layer}.json"
        local.parent.mkdir(parents=True, exist_ok=True)
        if own and own.get("inputs_hash") == manifest["inputs_hash"]:
            print(f"manifest unchanged ({manifest['count']} files, "
                  f"inputs_hash {manifest['inputs_hash'][:12]}): not uploaded")
            report["manifest"] = "unchanged"
        else:
            text = json.dumps(manifest, ensure_ascii=False,
                              separators=(",", ":"))
            local.write_text(text, encoding="utf-8")
            try:
                uploader.manifest(local)
                report["manifest"] = "written"
                report["manifest_bytes"] = len(text.encode("utf-8"))
            except RuntimeError as exc:
                print(f"manifest upload failed: {exc}")
                rc = 4
        attempted = (report["to_derive"] - report["dead_n"]
                     - len(report["not_raster"]) - report["refused_n"])
        if rc == 0 and attempted and report["failed_n"] / attempted > 0.05:
            print(f"{report['failed_n']} of {attempted} failed (over 5 per "
                  f"cent): exiting 1 so the run is looked at")
            rc = 1
    report["finished_at"] = now_utc()
    report["elapsed_s"] = round(time.time() - t0, 1)
    report["exit"] = rc
    (report_dir / f"{args.layer}-{run_id}.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{args.layer}: derived {report['derived']}, held "
          f"{report['held']}, dead {report['dead_n']}, refused "
          f"{report['refused_n']}, re-uploaded {len(report['reuploaded'])}, "
          f"failed {report['failed_n']}, {report['elapsed_s']}s, exit {rc}")
    return rc


def _dims_dict(d):
    if isinstance(d, dict):
        return d
    return {str(w): v for w, v in zip(WIDTHS, d)}


# ---------------------------------------------------------------------------
# sources: the published list for the worker (T049-f, T049-k)
# ---------------------------------------------------------------------------

def cmd_sources(args):
    out = Path(args.out).resolve()
    rc = 0
    for layer in args.layers:
        if layer not in ALL_LAYERS:
            print(f"unknown layer {layer}")
            return 2
        doc = build_sources(layer)
        if not doc["count"]:
            print(f"{layer}: no wire under continent-app/public; nothing "
                  f"written")
            rc = 2
            continue
        rel = f"{SOURCES_DIR}/{layer}.json"
        local = out / IMG_PREFIX / rel
        local.parent.mkdir(parents=True, exist_ok=True)
        text = json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
        local.write_text(text, encoding="utf-8")
        credited = sum(1 for r in doc["records"].values() if r.get("lic"))
        print(f"{layer}: {doc['count']} published titles, {credited} with "
              f"the photograph's own credit on the wire, "
              f"{len(text.encode('utf-8')) // 1024} KB -> {local}")
        show(rclone_json_cmd(local, f"{IMG_PREFIX}/{rel}", MANIFEST_CACHE))
    return rc


# ---------------------------------------------------------------------------
# probe: how many names are dead before a big run (T008)
# ---------------------------------------------------------------------------

def cmd_probe(args):
    """imageinfo for a sample of a layer's Commons sources, nothing fetched
    but the metadata: one request per 50 names at the harvest's pace. T008
    met one 404 in 200 fetches and asked for a few thousand names to be
    probed before the first transcode, because 900 dead references is a log
    line and 9,000 is a data-quality problem."""
    rnd = random.Random(args.seed)
    totals = {"probed": 0, "ok": 0, "missing": 0, "not_raster": 0,
              "error": 0, "would_refuse": 0}
    per_layer, dead = {}, []
    for layer in args.layers:
        sources_doc = find_sources(layer, None, args.prior)
        srcs, _stats_ = collect(layer, None, None, sources_doc)
        commons_srcs = [s for s in srcs if s.kind == "commons"]
        pick = rnd.sample(commons_srcs, min(args.sample, len(commons_srcs)))
        counts = {"sources": len(srcs), "commons": len(commons_srcs),
                  "probed": 0, "ok": 0, "missing": 0, "not_raster": 0,
                  "error": 0, "would_refuse": 0}
        for i in range(0, len(pick), commons.TITLES_PER_REQ):
            batch = pick[i:i + commons.TITLES_PER_REQ]
            for title, (status, info) in resolve_commons(batch).items():
                counts["probed"] += 1
                key = status.replace("-", "_")
                counts[key] = counts.get(key, 0) + 1
                if status == "missing":
                    dead.append([layer, title])
                elif status == "ok":
                    src = next(s for s in batch if s.title == title)
                    if src.pending and apply_credit(src, info):
                        counts["would_refuse"] += 1
        per_layer[layer] = counts
        for k in totals:
            totals[k] += counts.get(k, 0)
        print(f"{layer}: probed {counts['probed']} of {counts['commons']} "
              f"Commons sources; missing {counts['missing']}, not raster "
              f"{counts['not_raster']}, errors {counts['error']}, credit "
              f"refused {counts['would_refuse']}", flush=True)
    rate = totals["missing"] / totals["probed"] if totals["probed"] else 0
    print(f"all: {totals['missing']} of {totals['probed']} names dead "
          f"({rate:.2%}), {totals['not_raster']} not raster, "
          f"{totals['error']} errors")
    if args.json:
        Path(args.json).write_text(json.dumps(
            {"at": now_utc(), "seed": args.seed, "totals": totals,
             "dead_rate": rate, "layers": per_layer, "dead": dead},
            ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


# ---------------------------------------------------------------------------
# gc: journals and objects no manifest names (T049-j, T050-c)
# ---------------------------------------------------------------------------

OBJECT_KEY = re.compile(r"^([0-9a-f]{2})/([0-9a-f]{2})/([0-9a-f]{40})/"
                        r"(\d+)\.(avif|webp)$")


class GcRefused(RuntimeError):
    pass


def _age_days(stamp, now):
    try:
        then = datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ").replace(
            tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return 0.0
    return (now - then).total_seconds() / 86400


def plan_gc(held, prior, ledger=None, now=None, grace_days=14):
    """What a sweep would delete, and why, from a listing of img/ and a
    full copy of img/manifest/ (manifests, journals, sources).

    Kept: every address any layer's newest manifest names, and every address
    a journal names while that journal is kept. A journal is kept until a
    manifest of its layer was written after it AND it is older than the
    grace period; only then is its progress folded and the journal goes.
    So a run cut short by its ceiling (journals, no manifest yet) keeps its
    objects until a later run's manifest takes them over, and an object is
    deleted at the earliest one sweep after the journal that named it.

    Deleted: any object no kept manifest or journal names (a source that
    left its layer, a re-upload's old address), and any object of a title in
    the takedown ledger, whatever names it: takedown.py purges those at the
    time, and this is the backstop the T050 report said was missing.

    Refused (GcRefused): no manifest at all. An empty keep set would
    otherwise delete everything, and "every object is unnamed" is the
    vacuous answer a missing copy of img/manifest/ gives."""
    now = now or datetime.now(timezone.utc)
    ledger = takedown.load_ledger() if ledger is None else ledger
    prior = Path(prior) if prior else None
    if not prior or not prior.exists():
        raise GcRefused("no copy of img/manifest/ to read (--prior)")
    manifests, journals = {}, []
    for f in sorted(prior.rglob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except ValueError:
            continue
        if data.get("schema") == MANIFEST_SCHEMA:
            layer = data.get("layer")
            cur = manifests.get(layer)
            if cur is None or str(data.get("generated_at", "")) > str(
                    cur.get("generated_at", "")):
                manifests[layer] = data
        elif data.get("schema") == MANIFEST_SCHEMA + ".journal":
            journals.append((f.relative_to(prior).as_posix(), data))
    if not manifests:
        raise GcRefused("img/manifest/ holds no manifest: refusing to treat "
                        "every object as unnamed")
    keep = set()
    for m in manifests.values():
        keep.update(e.get("h") for e in (m.get("files") or {}).values())
    drop_journals = []
    for rel, j in journals:
        m = manifests.get(j.get("layer"))
        folded = m is not None and str(m.get("generated_at", "")) >= str(
            j.get("at", ""))
        if folded and _age_days(j.get("at"), now) > grace_days:
            drop_journals.append(f"{MANIFEST_DIR}/{rel}")
        else:
            keep.update(e.get("h") for e in j.get("entries") or [])
    taken = set()
    taken_named = []
    for row in ledger or []:
        t = canonical_title(row.get("needle"))
        if t:
            taken.add(sha1_of(t))
        taken.update(h for h in row.get("h") or [] if isinstance(h, str))
    for layer, m in manifests.items():
        for title, e in (m.get("files") or {}).items():
            if e.get("h") in taken or (ledger and takedown.is_taken_down(
                    title, ledger)):
                taken.add(e.get("h"))
                taken_named.append([layer, title])
    objects, unnamed, taken_objs, foreign = [], 0, 0, 0
    for key in sorted(held):
        m = OBJECT_KEY.match(key)
        if not m:
            foreign += 1              # not ours to judge: left alone
            continue
        h = m.group(3)
        if h in taken:
            objects.append(key)
            taken_objs += 1
        elif h not in keep:
            objects.append(key)
            unnamed += 1
    return {"manifests": {k: v.get("generated_at") for k, v in
                          manifests.items()},
            "journals": len(journals), "drop_journals": drop_journals,
            "keep_addresses": len(keep - {None}),
            "held_objects": len(held) - foreign, "foreign_keys": foreign,
            "objects": objects, "unnamed_objects": unnamed,
            "taken_down_objects": taken_objs, "taken_named": taken_named}


def cmd_gc(args):
    held = load_held(args.held)
    try:
        plan = plan_gc(held, args.prior, grace_days=args.grace_days)
    except GcRefused as exc:
        print(f"REFUSED: {exc}")
        return 2
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    objects_txt, journals_txt = out / "gc-objects.txt", out / "gc-journals.txt"
    objects_txt.write_text("".join(k + "\n" for k in plan["objects"]),
                           encoding="utf-8")
    journals_txt.write_text("".join(k + "\n" for k in plan["drop_journals"]),
                            encoding="utf-8")
    summary = {k: v for k, v in plan.items() if k not in ("objects",)}
    summary["objects_n"] = len(plan["objects"])
    summary["drop_journals"] = len(plan["drop_journals"])
    (out / "gc-plan.json").write_text(json.dumps(
        summary, ensure_ascii=False, indent=1), encoding="utf-8")
    held_n = plan["held_objects"]
    frac = len(plan["objects"]) / held_n if held_n else 0.0
    print(f"gc: {held_n} objects under img/, {plan['keep_addresses']} "
          f"addresses named by {len(plan['manifests'])} manifests and the "
          f"kept journals; delete {len(plan['objects'])} objects "
          f"({plan['unnamed_objects']} unnamed, "
          f"{plan['taken_down_objects']} taken down) and "
          f"{len(plan['drop_journals'])} of {plan['journals']} journals")
    for layer, title in plan["taken_named"]:
        print(f"  WARNING: the {layer} manifest still names taken-down "
              f"{title}; run takedown.py reach for it (edge purge too)")
    if frac > args.max_delete_frac and not args.force:
        print(f"REFUSED: that is {frac:.1%} of what R2 holds, over "
              f"--max-delete-frac {args.max_delete_frac:.0%}. Read "
              f"{objects_txt} and pass --force if it is right")
        return 3
    remote = f"{REMOTE}:{BUCKET}/{IMG_PREFIX}"
    rclone = os.environ.get("CARTA_RCLONE", "rclone")
    cmds = []
    if plan["objects"]:
        cmds.append([rclone, "delete", remote, "--files-from",
                     str(objects_txt), "--s3-no-check-bucket",
                     "--retries", "3"])
    if plan["drop_journals"]:
        cmds.append([rclone, "delete", remote, "--files-from",
                     str(journals_txt), "--s3-no-check-bucket",
                     "--retries", "3"])
    for cmd in cmds:
        show(cmd)
    if not args.apply:
        print("dry run: nothing deleted (--apply runs the commands above)")
        return 0
    if not os.environ.get("RCLONE_CONFIG_R2_ENDPOINT") \
            and not os.environ.get("CARTA_RCLONE"):
        print("--apply needs the RCLONE_CONFIG_R2_* remote in the "
              "environment; nothing was deleted")
        return 2
    for cmd in cmds:
        proc = subprocess.run(cmd, check=False)
        if proc.returncode != 0:
            print(f"rclone exited {proc.returncode}")
            return 4
    return 0


def cmd_key(args):
    title = canonical_title(args.source)
    if not title:
        print("not a Commons or Geograph source")
        return 2
    print(f"title  {title}")
    print(f"sha1   {sha1_of(title)}")
    for k in keys_for(title):
        print(f"key    {k}")
    print("url    " + cdn_url(title, 640, "avif"))
    print("purge  " + " ".join(_q(c) for c in r2_purge_cmd(title)))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("plan", "run"):
        p = sub.add_parser(name)
        p.add_argument("layer", choices=sorted(ALL_LAYERS))
        p.add_argument("--countries", help="comma list, e.g. NL,BE")
        p.add_argument("--published-only", action="store_true",
                       help="only titles the layer's wire (or sources file) "
                            "publishes")
        p.add_argument("--held", help="rclone lsf -R listing of img/, or a "
                                      "local img/ tree")
        p.add_argument("--prior", help="directory of earlier manifests and "
                                       "journals (img/manifest in R2); its "
                                       "_sources/<layer>.json is used when "
                                       "present")
        p.add_argument("--sources", help="a sources file (derive.py sources)"
                                         "; default: the one under --prior")
    run = sub.choices["run"]
    run.add_argument("--out", required=True)
    run.add_argument("--work")
    run.add_argument("--upload", choices=("none", "dry-run", "r2"),
                     default="none")
    run.add_argument("--encoders", type=int, default=0)
    run.add_argument("--limit", type=int, default=0)
    run.add_argument("--sample", type=int, default=0)
    run.add_argument("--seed", type=int, default=49)
    run.add_argument("--run-id")
    run.add_argument("--budget-s", type=int, default=0,
                     help="stop starting fetches after this many seconds, "
                          "finish, and write the manifest for what exists")
    run.add_argument("--recheck", action="store_true",
                     help="ask Commons for the content sha1 of held files "
                          "too; a re-upload is derived at a new address")
    run.add_argument("--allow-ledger-shrink", action="store_true",
                     help="derive although the takedown ledger has fewer "
                          "rows than an earlier manifest saw")
    src = sub.add_parser("sources", help="write the published list of each "
                                         "layer for img/manifest/_sources/")
    src.add_argument("layers", nargs="+")
    src.add_argument("--out", required=True)
    probe = sub.add_parser("probe", help="imageinfo for a sample of names: "
                                         "the dead rate before a big run")
    probe.add_argument("layers", nargs="+", choices=sorted(ALL_LAYERS))
    probe.add_argument("--sample", type=int, default=500)
    probe.add_argument("--seed", type=int, default=8)
    probe.add_argument("--prior")
    probe.add_argument("--json")
    gc = sub.add_parser("gc", help="delete journals and objects no manifest "
                                   "names (dry run unless --apply)")
    gc.add_argument("--held", required=True)
    gc.add_argument("--prior", required=True)
    gc.add_argument("--out", required=True)
    gc.add_argument("--grace-days", type=float, default=14)
    gc.add_argument("--max-delete-frac", type=float, default=0.25)
    gc.add_argument("--force", action="store_true")
    gc.add_argument("--apply", action="store_true")
    key = sub.add_parser("key")
    key.add_argument("source", help="title, page URL or image URL")
    sub.add_parser("selfcheck")
    args = ap.parse_args(argv)
    if args.cmd == "plan":
        return cmd_plan(args)
    if args.cmd == "run":
        return cmd_run(args)
    if args.cmd == "sources":
        return cmd_sources(args)
    if args.cmd == "probe":
        return cmd_probe(args)
    if args.cmd == "gc":
        return cmd_gc(args)
    if args.cmd == "key":
        return cmd_key(args)
    return selfcheck()


if __name__ == "__main__":
    sys.exit(main())
