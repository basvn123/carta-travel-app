"""The fix for fog and bare trees: prefer the season the category sells.

Burfelt's card was fog. Fuussefeld's was bare winter woodland. Naaktstrand
Texel's was a grey beach under what looks like snow. All three are correct
photographs of the right place, and all three are wrong for a card, and no
relevance gate can catch them because relevance is exactly what they have.

Two readings, both soft:

  month      when the photograph was taken, from EXIF DateTimeOriginal
             first, then Commons' own metadata, then a date written into
             the file name. When nothing knows, the preference is a
             neutral 0.5 and never a zero nobody earned (invariant 6).
  condition  a cheap read of the top of the frame. Very low saturation
             plus low contrast is overcast or fog. Beach, lake and cycling
             cards lose by it; mountains do not, cloud inversion sells.

The condition multiplier ships DISABLED until it has been validated on the
labelled evaluation set (evalset.py). This is exactly the kind of pixel
heuristic that failed three times in the lake layer before the one water
measure survived, so it is written, tested, and not trusted with a live
weight until the labels say it earns one.

ASCII clean, no em dashes, per project convention.
"""

import io
import re

# Per category, month -> preference in [0, 1]. `None` is the month nobody
# knows. Months absent from a table take the `"else"` value: low, not zero,
# because a February photograph of a beach is a bad card and still a card.
SEASON_PREF = {
    "beach": {5: 0.8, 6: 1.0, 7: 1.0, 8: 1.0, 9: 0.8, 4: 0.5, 10: 0.4,
              None: 0.5, "else": 0.15},
    "lake": {5: 0.8, 6: 1.0, 7: 1.0, 8: 1.0, 9: 0.9, 10: 0.6,
             None: 0.5, "else": 0.25},
    # Winter is allowed on a mountain, it sells.
    "mountain": {6: 0.9, 7: 1.0, 8: 1.0, 9: 1.0, 2: 0.7, 3: 0.7,
                 None: 0.6, "else": 0.5},
    "trail": {5: 1.0, 6: 0.9, 9: 1.0, 10: 0.9, 7: 0.8, 8: 0.8,
              None: 0.6, "else": 0.4},
    "cycling": {5: 1.0, 6: 1.0, 7: 0.9, 8: 0.9, 9: 1.0,
                None: 0.6, "else": 0.4},
}

# The months a hero is EXPECTED to come from, per category. verify_*.mjs
# asks that at least 80 per cent of rated beach and lake heroes fall inside
# this set; the preference table above is what makes that come true.
PREFERRED_MONTHS = {
    "beach": {5, 6, 7, 8, 9},
    "lake": {5, 6, 7, 8, 9, 10},
    "mountain": {2, 3, 6, 7, 8, 9},
    "trail": {5, 6, 7, 8, 9, 10},
    "cycling": {5, 6, 7, 8, 9},
}


def season_fit(month, category):
    """Preference in [0, 1] for a photograph taken in `month` on this
    category's card. `month` may be None, which is neutral by design."""
    table = SEASON_PREF.get(category) or SEASON_PREF["lake"]
    if month is None:
        return table[None]
    return table.get(month, table["else"])


# ---------------------------------------------------------------------------
# When was it taken
# ---------------------------------------------------------------------------

# "2019-07-14", "2019:07:14 16:20:11" (EXIF writes colons), "20190714",
# "2019_07", "July 2019" is deliberately not attempted: month names appear
# in file names for reasons that have nothing to do with capture dates.
_DATE_RE = re.compile(
    r"\b((?:19|20)\d{2})[:_ -]?(0[1-9]|1[012])(?:[:_ -]?[0-3]\d)?\b")


def _month_from_text(text):
    match = _DATE_RE.search(text or "")
    if not match:
        return None
    return int(match.group(2))


def _month_from_exif(data):
    """EXIF DateTimeOriginal from the encoded bytes, or None. Never raises:
    a truncated file or a stripped header is an answer, not an error."""
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(data))
        exif = img.getexif()
        # 36867 DateTimeOriginal lives in the Exif IFD; 306 DateTime is the
        # file's own stamp and a weaker claim, taken second.
        raw = None
        try:
            raw = exif.get_ifd(0x8769).get(36867)
        except Exception:
            pass
        raw = raw or exif.get(306)
        return _month_from_text(str(raw)) if raw else None
    except Exception:
        return None


def capture_month(cand=None, data=None):
    """Best known capture month, 1..12, or None.

    In falling order of trust: EXIF DateTimeOriginal in the bytes, Commons
    extmetadata (DateTimeOriginal, then DateTime, which is often the upload
    stamp), then a date written into the file title or description. The
    upload stamp and the title date are weak evidence and both are only a
    month, which is all the preference table wants."""
    if data is not None:
        month = _month_from_exif(data)
        if month:
            return month
    if cand:
        meta = ((cand.get("info") or {}).get("extmetadata")) or {}
        for key in ("DateTimeOriginal", "DateTime"):
            value = (meta.get(key) or {}).get("value") or ""
            month = _month_from_text(re.sub(r"<[^>]+>", " ", str(value)))
            if month:
                return month
        title = str(cand.get("title") or "")
        month = _month_from_text(title)
        if month:
            return month
        desc = (meta.get("ImageDescription") or {}).get("value") or ""
        month = _month_from_text(re.sub(r"<[^>]+>", " ", str(desc))[:300])
        if month:
            return month
    return None


# ---------------------------------------------------------------------------
# Condition: is the sky in this frame selling anything
# ---------------------------------------------------------------------------

TOP_FRACTION = 0.30       # the band the sky usually owns
OVERCAST_SAT = 0.10       # below this the top of the frame has no colour
OVERCAST_SPREAD = 22.0    # and below this it has no contrast either
OVERCAST_MULT = 0.7       # applied to beach / lake / cycling heroes only

# Which categories pay for an overcast sky. Mountains are exempt on
# purpose: a cloud inversion under a summit is a selling point, and fog on
# a beach is not.
CONDITION_APPLIES = {"beach": True, "lake": True, "cycling": True,
                     "mountain": False, "trail": False}

# OFF until the labelled evaluation set has measured it. See the module
# docstring: this heuristic's three predecessors all died on real files.
CONDITION_ENABLED = False


def sky_reading(data):
    """{'lum': .., 'sat': .., 'spread': ..} for the top of the frame, or
    None when the bytes cannot be read. Mean luminance 0..255, mean
    saturation 0..1, channel spread as a contrast proxy."""
    try:
        import numpy as np
        from PIL import Image
        img = Image.open(io.BytesIO(data)).convert("RGB")
        h = max(1, round(img.height * 96 / max(1, img.width)))
        img = img.resize((96, max(8, min(h, 300))))
        arr = np.asarray(img, dtype="float32")
    except Exception:
        return None
    top = arr[: max(1, int(arr.shape[0] * TOP_FRACTION))]
    red, grn, blu = top[..., 0], top[..., 1], top[..., 2]
    peak = np.maximum(np.maximum(red, grn), blu)
    floor = np.minimum(np.minimum(red, grn), blu)
    sat = np.where(peak > 0, (peak - floor) / np.maximum(peak, 1.0), 0.0)
    return {
        "lum": round(float((red + grn + blu).mean() / 3.0), 1),
        "sat": round(float(sat.mean()), 3),
        "spread": round(float(top.reshape(-1, 3).std(axis=0).mean()), 1),
    }


def condition_multiplier(reading, category):
    """1.0, or OVERCAST_MULT for a grey flat sky on a category that pays
    for one. Neutral whenever the reading is missing, the category is
    exempt, or the switch is off."""
    if not CONDITION_ENABLED or reading is None:
        return 1.0
    if not CONDITION_APPLIES.get(category, False):
        return 1.0
    if (reading["sat"] < OVERCAST_SAT
            and reading["spread"] < OVERCAST_SPREAD):
        return OVERCAST_MULT
    return 1.0
