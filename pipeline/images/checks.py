"""Shared per-image checks for the cross-layer image audit.

Every published surface crops its pictures into a known frame, and Wikimedia
only renders a fixed list of thumbnail widths, so most of what makes an image
"valid and nice" is checkable offline from the wire alone: the URL shape, the
stored dimensions against the frame it must fill, the licence and evidence
fields the layer's contract promises. This module holds those checks as pure
functions over one image record plus a layer spec; pipeline/images/audit_all.py
walks the wires and calls them.

The frame numbers are not opinions, they mirror continent-app/src/styles.css:
  .places-dcard   12/5   destination cards        (styles.css ~20055)
  .places-ccard   2.6/1  country covers           (~20062)
  .places-tcard   9/4    trail and day trip cards (~20063)
  .places-bcard   25/12  beach, lake, peak cards  (~20405)
  .itin-card-media 30/11 multi day itinerary card (~23971)
  .xcard-media    16/9.6 explore cards, 4/3 desktop (~22966)
  .bpage-shot     3/2    beach/lake/peak detail shot (~20522)
Change the CSS and these constants must follow, which is why each spec names
its class.

Fit is min(ar, frame)/max(ar, frame), the same crop survival measure the
country cover picker in DestinationsTab.jsx already uses, with the same cut
points: below 0.62 the crop starts to hurt, below 0.55 it is a different
picture after object-fit: cover gets done with it.
"""

import re
import unicodedata
from urllib.parse import urlsplit

# The widths upload.wikimedia.org will actually render. Anything else answers
# 400. Mirrors WIKI_WIDTHS in continent-app/src/lib/heroImage.js.
WIKI_WIDTHS = {250, 330, 500, 960, 1280, 1920}

ALLOWED_HOSTS = {
    "upload.wikimedia.org",
    "commons.wikimedia.org",
    "images.wikimedia.org",
}

FIT_WEAK = 0.62
FIT_BAD = 0.55

# The commonest shape a photograph is actually taken in. It matters because
# the fit bar cannot be an absolute number across frames of different widths:
# a 3:2 photograph scores 0.62 in the 12/5 destination card and 0.55 in the
# 30/11 itinerary strip, so a fixed 0.62 would call 41 per cent of the trip
# heroes defective for being ordinary photographs. They are not defective;
# that frame is simply wider than a camera. The bar is therefore whatever a
# 3:2 photograph achieves in THIS frame, never stricter: what gets flagged is
# a picture that crops worse than the median photograph would, which is the
# question worth asking.
REFERENCE_AR = 1.5


def fit_bars(frame_ar):
    """(weak, bad) fit thresholds for one frame."""
    baseline = min(REFERENCE_AR, frame_ar) / max(REFERENCE_AR, frame_ar)
    return min(FIT_WEAK, baseline), min(FIT_BAD, baseline * 0.9)

# Per layer contract: the frame the hero slot must fill, the floor under its
# stored dimensions, and which fields every image record owes the reader.
SPECS = {
    "destinations": {
        "frame": 12 / 5, "css": ".places-dcard",
        "min_w": 800, "min_h": 450,
        "require": ("credit", "page"), "evidence": None,
    },
    "features": {
        "frame": 3 / 2, "css": ".xcard-media (mobile 16/9.6, desktop 4/3)",
        "min_w": 500, "min_h": 330,
        "require": ("licence",), "evidence": None,
    },
    "beaches": {
        "frame": 25 / 12, "css": ".places-bcard",
        "min_w": 640, "min_h": 400,
        "require": ("lic",), "evidence": "ev",
    },
    "lakes": {
        "frame": 25 / 12, "css": ".places-bcard.places-lcard",
        "min_w": 640, "min_h": 400,
        "require": ("lic",), "evidence": "why",
    },
    "mountains": {
        "frame": 25 / 12, "css": ".places-bcard.places-mcard",
        "min_w": 640, "min_h": 400,
        "require": ("lic",), "evidence": "ev",
    },
    # No "page" here: a trip photo borrowed from a POI highlight carries only
    # a credit, by design (pipeline/trips/export_trips.py hero_candidates).
    "trips": {
        "frame": 30 / 11, "css": ".itin-card-media",
        "min_w": 800, "min_h": 400,
        "require": ("credit",), "evidence": None,
    },
    "trails": {
        "frame": 9 / 4, "css": ".places-tcard",
        "min_w": 500, "min_h": 300,
        "require": (), "evidence": None,
    },
}

_PX_RE = re.compile(r"/(\d+)px-")

# NFKD leaves these letters alone, so fold them by hand before comparing a
# name against a filename (same table the lake and trail pipelines carry).
_FOLD = str.maketrans({
    "ø": "o", "Ø": "o", "æ": "ae", "Æ": "ae", "å": "a", "Å": "a",
    "ł": "l", "Ł": "l", "ð": "d", "Ð": "d", "þ": "th", "Þ": "th",
    "ß": "ss", "œ": "oe", "Œ": "oe", "đ": "d", "Đ": "d",
})


def fold(text):
    text = str(text or "").translate(_FOLD)
    text = unicodedata.normalize("NFKD", text)
    return "".join(c for c in text if not unicodedata.combining(c)).lower()


def file_title(url):
    """The Commons file name a URL points at, thumb or original alike.

    Thumb URLs repeat the name twice (.../thumb/5/56/Name.jpg/960px-Name.jpg);
    the stable identity is the path segment before the px- variant."""
    path = urlsplit(str(url or "")).path
    parts = [p for p in path.split("/") if p]
    if not parts:
        return ""
    if "thumb" in parts:
        i = parts.index("thumb")
        # thumb/h/hh/Name.ext/NNNpx-Name.ext
        if len(parts) >= i + 4:
            return parts[i + 3]
    return parts[-1]


def fit_of(w, h, frame):
    if not w or not h:
        return None
    ar = w / h
    return min(ar, frame) / max(ar, frame)


def check_image(img, spec, slot=0):
    """Flags for one image record. Returns a list of short reason codes,
    hard problems first. Warnings are prefixed with "~"."""
    flags = []
    url = str(img.get("url") or img.get("u") or "")
    if not url:
        return ["no_url"]

    parts = urlsplit(url)
    if parts.scheme != "https":
        flags.append("not_https")
    if parts.netloc not in ALLOWED_HOSTS:
        flags.append("odd_host:" + (parts.netloc or "?"))
    if parts.query:
        # Query strings poison every place the URL is treated as a path,
        # the srcset splicer first of all.
        flags.append("query_string")
    m = _PX_RE.search(parts.path)
    if m and int(m.group(1)) not in WIKI_WIDTHS:
        flags.append("bad_thumb_width:" + m.group(1))
    if parts.path.lower().endswith(".svg"):
        flags.append("svg")
    if "Special:FilePath" in parts.path:
        flags.append("special_filepath")

    for field in spec["require"]:
        if not img.get(field):
            flags.append("no_" + field)

    ev_key = spec["evidence"]
    if ev_key is not None and not img.get(ev_key):
        flags.append("~no_evidence")

    w, h = img.get("w"), img.get("h")
    if not (w and h):
        flags.append("~no_dims")
        return flags
    if w < spec["min_w"] or h < spec["min_h"]:
        flags.append("tiny:%dx%d" % (w, h))
    fit = fit_of(w, h, spec["frame"])
    ar = w / h
    if fit is not None and slot == 0:
        weak_bar, bad_bar = fit_bars(spec["frame"])
        if fit < bad_bar:
            flags.append("poor_fit:%.2f" % fit)
        elif fit < weak_bar:
            flags.append("~weak_fit:%.2f" % fit)
    if ar < 0.62:
        flags.append("portrait:%.2f" % ar)
    elif ar > 3.6:
        flags.append("strip:%.2f" % ar)
    return flags


def hard(flags):
    return [f for f in flags if not f.startswith("~")]


def soft(flags):
    return [f[1:] for f in flags if f.startswith("~")]
