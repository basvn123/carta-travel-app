"""Places near a destination where OpenStreetMap says swimming is not allowed.

Tier: On demand (T641; feeds `water.bans` through
pipeline/dossier/derive_practical.py)

Source: OpenStreetMap contributors, ODbL 1.0 (commercial use allowed, credit
required): objects tagged swimming=no or bathing=no within RADIUS_KM of the
destination centre or of one of its member towns, one Overpass union query per
batch. The EEA bathing-water layer carries a quality class only; it has no
prohibition field (checked 2026-10-23 on BathingWater_Dyna_WM_2025 layer 3:
values Good, Excellent, Sufficient, Poor, Not classified), so it cannot supply
bans.

Absence of a row means "nothing mapped", never "swimming is allowed". The
reason says what the source is, so a reader can weigh it.

Output cache/dest_swim_bans.json rows[destination id] = [
    {"site": name or "", "reason": "swimming not allowed, as mapped in OpenStreetMap",
     "lat", "lon", "src": "OpenStreetMap contributors (ODbL 1.0)", "date", "method": "measured"}]
at most 6 per destination, nearest first.

Usage, from the repo root:
    python pipeline/harvest_swim_bans.py --dests gem:como --out-dir DIR
    python pipeline/harvest_swim_bans.py                      # all destinations, about 20 min

ASCII clean, no em dashes, per project convention.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT = Path(os.environ.get("CARTA_INPUT_ROOT", ROOT))
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "beaches"))
import explore_overlay as ov  # noqa: E402
import sources  # noqa: E402

RADIUS_KM = 5.0
BATCH = 20
KEEP = 6


def hav(a, b, c, d):
    p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dests")
    ap.add_argument("--out-dir")
    a = ap.parse_args()
    doc = json.loads((INPUT / "continent-app" / "public" / "app_data.json").read_text(encoding="utf-8"))["destinations"]
    want = set(a.dests.split(",")) if a.dests else None
    pts = {}
    for did, d in doc.items():
        if want and did not in want:
            continue
        la, lo = d.get("city_lat", d.get("lat")), d.get("city_lon", d.get("lon"))
        if la is None:
            continue
        pts[did] = [(la, lo)] + [(m["lat"], m["lon"]) for m in d.get("members") or []
                                 if m.get("lat") is not None and m.get("lon") is not None]
    ordered = sorted(pts.items(), key=lambda kv: kv[1][0])
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    r = int(RADIUS_KM * 1000)
    rows = {}
    for i in range(0, len(ordered), BATCH):
        batch = ordered[i:i + BATCH]
        clauses = "".join(f'nwr(around:{r},{la},{lo})["{k}"="no"];' for _, ps in batch for la, lo in ps
                          for k in ("swimming", "bathing"))
        q = f"[out:json][timeout:240];({clauses});out tags center;"
        els = None
        for ep in sources.OVERPASS_ENDPOINTS:
            try:
                els = json.loads(sources.request(ep, data={"data": q}, timeout=280, tries=2))["elements"]
                break
            except Exception:
                continue
        if els is None:
            print(f"  batch {i} failed", flush=True)
            continue
        for did, ps in batch:
            found = []
            for e in els:
                t = e.get("tags") or {}
                c = e.get("center") or {}
                la, lo = e.get("lat", c.get("lat")), e.get("lon", c.get("lon"))
                if la is None:
                    continue
                km = min(hav(la, lo, p[0], p[1]) for p in ps)
                if km <= RADIUS_KM:
                    found.append((km, {"site": (t.get("name") or "")[:60],
                                       "reason": "swimming not allowed, as mapped in OpenStreetMap",
                                       "lat": round(la, 5), "lon": round(lo, 5),
                                       "src": "OpenStreetMap contributors (ODbL 1.0)", "date": today,
                                       "method": "measured"}))
            found.sort(key=lambda x: x[0])
            if found:
                rows[did] = [f[1] for f in found[:KEEP]]
        print(f"  {min(i + BATCH, len(ordered))}/{len(ordered)} destinations, {len(rows)} with a mapped ban", flush=True)
    meta = {"source": "OpenStreetMap contributors (ODbL 1.0) swimming=no, bathing=no", "date": today, "method": "measured"}
    ov.save("dest_swim_bans", rows, meta, Path(a.out_dir) if a.out_dir else None)
    print("wrote dest_swim_bans", len(rows))


if __name__ == "__main__":
    main()
