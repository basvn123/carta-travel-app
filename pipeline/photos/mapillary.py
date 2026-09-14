"""Mapillary: existence proof only, and marked so it can never lead.

CC BY-SA and storable, so it passes invariant 8, and that is where its
virtues end for a card: it is dashcam and action-cam capture, and its
quality_score measures focus and exposure, not beauty. The rule, enforced
by evidence tier rather than by convention:

  - used ONLY when a row would otherwise ship with zero images, as the
    last step before the generated map card
  - every image it returns carries evidence tier `street`, which
    select.NEVER_HERO contains, so no path exists by which one becomes a
    hero

API notes that shaped the shape: the radius search is capped at 50 m and
a bbox at about 0.01 degrees, so covering a shoreline is many calls; that
is affordable precisely because this only ever runs for the rows with
nothing.

Token from CARTA_MAPILLARY_TOKEN (a client token from a registered app).
No token, no candidates, no error.

ASCII clean, no em dashes, per project convention.
"""

import json
import os
import urllib.parse
import urllib.request

API = "https://graph.mapillary.com/images"
TOKEN_ENV = "CARTA_MAPILLARY_TOKEN"
BBOX_DEG = 0.005          # half the documented ceiling, on purpose
FIELDS = "id,geometry,captured_at,is_pano,quality_score,thumb_1024_url"
UA = ("CartaPhotos/1.0 (https://carta-europetravel.com; "
      "bas.vannieuwenhuyse123@gmail.com)")


def existence_proof(lat, lon, limit=8, token=None):
    """[{id, thumb, lat, lon, captured_at, quality_score, evidence}]
    near one point, best quality_score first. quality_score orders the
    handful returned; it never argues with a real photograph, because a
    `street` image only appears where there is no real photograph."""
    token = token or os.environ.get(TOKEN_ENV, "").strip()
    if not token:
        return []
    bbox = (f"{lon - BBOX_DEG},{lat - BBOX_DEG},"
            f"{lon + BBOX_DEG},{lat + BBOX_DEG}")
    params = urllib.parse.urlencode({
        "access_token": token, "bbox": bbox, "fields": FIELDS,
        "limit": max(1, min(limit * 3, 50)),
    })
    req = urllib.request.Request(f"{API}?{params}",
                                 headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.load(resp)
    except Exception:
        return []
    out = []
    for item in data.get("data") or []:
        coords = ((item.get("geometry") or {}).get("coordinates")
                  or [None, None])
        out.append({
            "id": item.get("id"),
            "thumb": item.get("thumb_1024_url") or "",
            "lat": coords[1], "lon": coords[0],
            "captured_at": item.get("captured_at"),
            "quality_score": item.get("quality_score"),
            "is_pano": bool(item.get("is_pano")),
            "evidence": "street",
            "licence": "CC BY-SA 4.0",
            "licence_url":
                "https://creativecommons.org/licenses/by-sa/4.0/",
        })
    out.sort(key=lambda r: -(r.get("quality_score") or 0.0))
    return out[:limit]
