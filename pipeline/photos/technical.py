"""Cheap hard rejects, run first, so nothing expensive looks at junk.

Order matters for cost: these checks are metadata reads and one small
thumbnail, so they run before a CLIP embedding is ever computed. What they
reject is not "bad photographs" in any aesthetic sense, it is files that
cannot make a card whatever else is right about them: too small to print,
too blurred to read, shaped so the crop keeps a ribbon.

The one pixel measure this module keeps is the water fraction of the lower
frame, re-exported from lake_images because it EARNED its place over three
dead rivals (texture, overcast, ink saturation, all documented in
lake_images.py). Nothing else pixel-based is added here without first
surviving the labelled evaluation set.

ASCII clean, no em dashes, per project convention.
"""

import importlib.util
import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# The shared shape and water lore, loaded by path the way every layer loads
# it: module names live inside layer folders, so a bare import would mean
# whatever directory happened to be first on sys.path.
_LAKE_IMAGES = ROOT / "pipeline" / "lakes" / "lake_images.py"
if "carta_lake_images" in sys.modules:
    lake_images = sys.modules["carta_lake_images"]
else:
    _spec = importlib.util.spec_from_file_location("carta_lake_images",
                                                   _LAKE_IMAGES)
    lake_images = importlib.util.module_from_spec(_spec)
    sys.modules["carta_lake_images"] = lake_images
    _spec.loader.exec_module(lake_images)

# Re-exported so callers depend on pipeline/photos and not on a lake path.
aspect_term = lake_images.aspect_term
aspect_fit = lake_images.aspect_fit
probe_pixels = lake_images.probe_pixels
water_verdict = lake_images.water_verdict
FRAME_AR = lake_images.FRAME_AR

# Size floors. A hero is cropped to the 25/12 card at up to 1280 wide, so
# a short edge under 800 is already interpolating; a gallery tile forgives
# more. Below the gallery floor a file is not published at all.
HERO_MIN_EDGE = 800
GALLERY_MIN_EDGE = 500

# Blur, as the variance of a 3x3 Laplacian over a fixed-size grayscale
# render. Fixed size because the measure scales with resolution: the same
# photograph probed at 96 px and 1280 px gives numbers an order of
# magnitude apart, so every file is asked at the same width and the
# threshold means one thing. The floor is deliberately LOW: this exists to
# reject the unreadably soft file, not to rank sharpness, which the
# aesthetic model already sees.
BLUR_PROBE_W = 256
BLUR_REJECT_BELOW = 25.0

# A panorama is only wanted where the row asked for one (the P4640 slot),
# so the default gate is the shared card-crop shape from lake_images and
# the panorama slot passes `allow_panorama=True` instead of a looser bar
# for everybody.
PANORAMA_AR_MAX = 8.0


def laplacian_variance(data):
    """Sharpness proxy, or None when the bytes cannot be read."""
    try:
        import numpy as np
        from PIL import Image
        img = Image.open(io.BytesIO(data)).convert("L")
        h = max(8, round(img.height * BLUR_PROBE_W / max(1, img.width)))
        img = img.resize((BLUR_PROBE_W, min(h, 1024)))
        arr = np.asarray(img, dtype="float32")
    except Exception:
        return None
    lap = (-4.0 * arr[1:-1, 1:-1]
           + arr[:-2, 1:-1] + arr[2:, 1:-1]
           + arr[1:-1, :-2] + arr[1:-1, 2:])
    return round(float(lap.var()), 1)


def technical_verdict(width, height, data=None, *, for_hero=False,
                      allow_panorama=False):
    """(accepted, why). The hard gate, cheapest checks first.

    `data` is optional: with no bytes in hand only the metadata checks run,
    and an unmeasurable file is not rejected for being unmeasured
    (invariant 6). Callers that DO hold the thumbnail pass it so the blur
    check gets its say."""
    floor = HERO_MIN_EDGE if for_hero else GALLERY_MIN_EDGE
    if width and height and min(width, height) < floor:
        return False, f"short edge {min(width, height)} under {floor}"
    if width and height:
        ratio = width / height
        if allow_panorama:
            if ratio < 1.0 or ratio > PANORAMA_AR_MAX:
                return False, "not a panorama shape"
        else:
            reject, _ = aspect_term(width, height)
            if reject:
                return False, "crops to garbage on the card"
    if data is not None:
        sharp = laplacian_variance(data)
        if sharp is not None and sharp < BLUR_REJECT_BELOW:
            return False, f"blurred (laplacian var {sharp})"
    return True, ""


def technical_norm(width, height, data=None):
    """Headroom above the floor, 0..1, for the beauty score's small
    technical term. Resolution first, sharpness margin second; a file
    nobody measured sits at the neutral middle, never at zero."""
    parts = []
    if width and height:
        edge = min(width, height)
        parts.append(max(0.0, min(1.0, (edge - GALLERY_MIN_EDGE) / 1500.0)))
    if data is not None:
        sharp = laplacian_variance(data)
        if sharp is not None:
            parts.append(max(0.0, min(1.0, (sharp - BLUR_REJECT_BELOW)
                                      / 400.0)))
    if not parts:
        return 0.5
    return round(sum(parts) / len(parts), 3)
