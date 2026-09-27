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

Usage:

    python pipeline/photos/derive.py plan beaches [--published-only]
    python pipeline/photos/derive.py run beaches --out DIR [--upload none|dry-run|r2]
        [--held FILE_OR_DIR] [--prior DIR] [--work DIR] [--encoders N]
        [--countries NL,BE] [--limit N] [--sample N --seed S] [--run-id ID]
        [--budget-s SECONDS]
    python pipeline/photos/derive.py key "File:Some beach.jpg"
    python pipeline/photos/derive.py selfcheck

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
    lic = (img.get("license") or img.get("lic") or "").strip()
    if not lic:
        return "licence-missing"
    if NOT_STORABLE.search(lic):
        return "licence-not-storable"
    if credit.owes_credit(img):
        return "credit-missing"
    return None


def _is_raster(title, img):
    if title.startswith("geograph:"):
        return True
    ext = title.rsplit(".", 1)[-1].lower() if "." in title else ""
    return ext in RASTER_EXT


class Source:
    __slots__ = ("title", "sha1", "kind", "lic", "by", "rank_v", "fetch",
                 "cc", "uses", "order")

    def __init__(self, title, img, cc, order):
        self.title = title
        self.sha1 = sha1_of(title)
        self.kind = "geograph" if title.startswith("geograph:") else "commons"
        self.lic = (img.get("license") or img.get("lic") or "").strip()
        self.by = (img.get("author") or img.get("by") or "").strip(" ,;")
        self.rank_v = img.get("rank_v")
        # Geograph has no imageinfo API; the cached URL is its largest size.
        self.fetch = (img.get("full") or img.get("url")) \
            if self.kind == "geograph" else None
        self.cc = cc
        self.uses = 1
        self.order = order


def iter_layer(layer, countries=None):
    """(cc, row_index, image_index, record) for every image in the layer's
    rich cache, hero first: all image 0s, then all image 1s, and so on."""
    cache_dir, row_key = LAYERS[layer]
    base = ROOT / "cache" / cache_dir
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


def published_titles(layer):
    """Canonical titles the layer's wire publishes (continent-app/public/
    <layer>/*.json), for --published-only and the plan's counts."""
    out = set()
    base = ROOT / "continent-app" / "public" / layer
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


def collect(layer, countries=None, published=None):
    """(sources in hero-first order, stats). One Source per canonical title;
    a file used by several rows is one object in R2."""
    ledger = takedown.load_ledger()
    stats = {"records": 0, "rejected": {}, "unique": 0}
    by_title = {}
    order = 0

    def reject(reason):
        stats["rejected"][reason] = stats["rejected"].get(reason, 0) + 1

    for cc, _ri, _ii, img in iter_layer(layer, countries):
        stats["records"] += 1
        title = canonical_title(img)
        if not title:
            reject("no-title")
            continue
        if not _is_raster(title, img):
            reject("not-raster")
            continue
        why = storable(img)
        if why:
            reject(why)
            continue
        if ledger and (takedown.is_taken_down(title, ledger) or any(
                takedown.is_taken_down(img.get(k), ledger)
                for k in ("url", "full", "page", "u", "big"))):
            reject("taken-down")
            continue
        if published is not None and title not in published:
            reject("not-published")
            continue
        if title in by_title:
            by_title[title].uses += 1
            continue
        by_title[title] = Source(title, img, cc, order)
        order += 1
    stats["unique"] = len(by_title)
    return list(by_title.values()), stats


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
    """title -> {h, d, src_sha1} from every manifest and journal under
    `path` (any layer: a file shared by two layers is derived once), plus
    the prior manifest of `layer` itself when there is one."""
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
            for title, e in (data.get("files") or {}).items():
                known.setdefault(title, {"h": e["h"], "d": e["d"],
                                         "s": e.get("s")})
            if layer and data.get("layer") == layer and (
                    own is None or str(data.get("generated_at", ""))
                    > str(own.get("generated_at", ""))):
                own = data
        elif data.get("schema") == MANIFEST_SCHEMA + ".journal":
            if data.get("ladder") != LADDER_V:
                continue
            for e in data.get("entries") or []:
                known[e["title"]] = {"h": e["h"], "d": e["d"],
                                     "s": e.get("s")}
    return known, own


# ---------------------------------------------------------------------------
# Resolve and fetch, through the harvest's own politeness
# ---------------------------------------------------------------------------

def resolve_commons(batch):
    """imageinfo for up to 50 Sources: sets .fetch, returns
    {title: (status, info)} with status ok / missing / not-raster / error."""
    out = {}
    titles = [s.title for s in batch]
    try:
        res = sources.mediawiki(commons.with_maxlag({
            "prop": "imageinfo", "titles": "|".join(titles),
            "iiprop": "url|size|mime|sha1", "iiurlwidth": SOURCE_WIDTH,
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
        src.fetch = ii.get("thumburl") or ii.get("url")
        out[src.title] = ("ok", {"w": ii.get("width"), "h": ii.get("height"),
                                 "sha1": ii.get("sha1"),
                                 "bytes": ii.get("size")})
    for t in titles:
        out.setdefault(t, ("missing", None))
    return out


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
    return dims, sizes, source_dims


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

def build_manifest(layer, sources_, entries, run_id):
    """The per-layer manifest (MANIFEST_SCHEMA). `files` maps the canonical
    source title to:

        h   sha1 hex of the title; the objects are {base}/{h[0:2]}/{h[2:4]}/
            {h}/{w}.{fmt} for every rung in `rungs`
        d   [[w, h], [w, h], [w, h]]: the real pixel size of the 320, 640
            and 1280 rungs (a source narrower than a rung is not upscaled,
            so "1280" can be 900 px wide; the WebP rungs share these sizes)
        c   index into `credits`, [licence, author]; the page to link is
            PAGE_URL by kind (commons: the title, geograph: the id)
        r   rank_v of the record the source was taken from, when scored

    Sorted, compact, and hashed without the run fields, so a run that
    changes nothing produces the same inputs_hash and uploads nothing."""
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


def cmd_plan(args):
    published = published_titles(args.layer) if args.published_only else None
    if args.published_only and published is None:
        print(f"no wire under continent-app/public/{args.layer}")
        return 2
    srcs, stats = collect(args.layer, _countries(args.countries), published)
    held = load_held(args.held)
    known, own = load_prior(args.prior, args.layer)
    n_held = sum(1 for s in srcs if is_held(held, s.sha1) and s.title in known)
    wire = published_titles(args.layer)
    print(f"layer {args.layer}: {stats['records']} image records, "
          f"{stats['unique']} unique sources after the gates")
    for k, v in sorted(stats["rejected"].items()):
        print(f"  rejected {k}: {v}")
    if wire is not None:
        in_wire = sum(1 for s in srcs if s.title in wire)
        print(f"  wire publishes {len(wire)} unique titles; "
              f"{in_wire} of the sources are among them")
    print(f"  held in R2 with known dims: {n_held}; to derive: "
          f"{len(srcs) - n_held}; objects to write: {(len(srcs) - n_held) * len(LADDER)}")
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

    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: (STOP.set(), print(
            "stop requested: finishing the batch in hand", flush=True)))

    t0 = time.time()
    if args.budget_s:
        BUDGET["until"] = t0 + args.budget_s
    published = published_titles(args.layer) if args.published_only else None
    srcs, stats = collect(args.layer, _countries(args.countries), published)
    if args.sample:
        rnd = random.Random(args.seed)
        srcs = sorted(rnd.sample(srcs, min(args.sample, len(srcs))),
                      key=lambda s: s.order)
    if args.limit:
        srcs = srcs[:args.limit]
    held = load_held(args.held)
    known, own = load_prior(args.prior, args.layer)

    entries, todo = {}, []
    for s in srcs:
        k = known.get(s.title)
        if k and k["h"] == s.sha1 and is_held(held, s.sha1):
            entries[s.title] = {"h": k["h"], "d": _dims_dict(k["d"])}
        else:
            todo.append(s)
    print(f"{args.layer}: {len(srcs)} sources, {len(entries)} held, "
          f"{len(todo)} to derive (run {run_id}, upload {args.upload})",
          flush=True)

    report = {"run": run_id, "layer": args.layer, "upload": args.upload,
              "started_at": now_utc(), "gates": stats,
              "sources": len(srcs), "held": len(entries),
              "to_derive": len(todo), "derived": 0, "dead": [],
              "not_raster": [], "failed": [], "bytes": {}, "src_dims": [],
              "timings_s": {}}

    # resolve: Commons imageinfo in batches of 50, through the 0.4 s pacer
    t = time.time()
    resolved, meta = [], {}
    commons_todo = [s for s in todo if s.kind == "commons"]
    for i in range(0, len(commons_todo), commons.TITLES_PER_REQ):
        if STOP.is_set():
            break
        batch = commons_todo[i:i + commons.TITLES_PER_REQ]
        for title, (status, info) in resolve_commons(batch).items():
            if status == "ok":
                meta[title] = info
            elif status == "missing":
                report["dead"].append(title)
            elif status == "not-raster":
                report["not_raster"].append([title, info])
            else:
                report["failed"].append([title, f"resolve: {info}"])
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
            dims, sizes, source_dims = result
            entry = {"title": src.title, "h": src.sha1, "d": dims,
                     "s": meta.get(src.title, {}).get("sha1"),
                     "lic": src.lic, "by": src.by, "r": src.rank_v,
                     "bytes": sizes}
            batch_entries.append(entry)
            entries[src.title] = {"h": src.sha1, "d": dims}
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
        manifest = build_manifest(args.layer, srcs, entries, run_id)
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
        attempted = report["to_derive"] - report["dead_n"] - len(report["not_raster"])
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
          f"{report['held']}, dead {report['dead_n']}, failed "
          f"{report['failed_n']}, {report['elapsed_s']}s, exit {rc}")
    return rc


def _dims_dict(d):
    if isinstance(d, dict):
        return d
    return {str(w): v for w, v in zip(WIDTHS, d)}


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
        p.add_argument("layer", choices=sorted(LAYERS))
        p.add_argument("--countries", help="comma list, e.g. NL,BE")
        p.add_argument("--published-only", action="store_true",
                       help="only titles the layer's wire publishes today")
        p.add_argument("--held", help="rclone lsf -R listing of img/, or a "
                                      "local img/ tree")
        p.add_argument("--prior", help="directory of earlier manifests and "
                                       "journals (img/manifest in R2)")
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
    key = sub.add_parser("key")
    key.add_argument("source", help="title, page URL or image URL")
    sub.add_parser("selfcheck")
    args = ap.parse_args(argv)
    if args.cmd == "plan":
        return cmd_plan(args)
    if args.cmd == "run":
        return cmd_run(args)
    if args.cmd == "key":
        return cmd_key(args)
    return selfcheck()


if __name__ == "__main__":
    sys.exit(main())
