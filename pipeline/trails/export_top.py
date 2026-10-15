"""Write the Europe-wide trails list: the walks the Trails section opens on.

Tier: Scheduled (the last step of export_wire.py; also runs on its own)

Beaches, lakes, mountains and cycling each publish a top.json, and the
Destinations tab opens those sections on rails drawn from it. Trails had none,
so the section opened on nothing but a country picker (T451, design review
P1: "Trails, the hiker-first section, opens without a single walk"). This
file is that list (T453).

    /trails/top.json   { generated_at, n_trips, per_country, trips: [...] }

A walk's rating is scored within its own country (rate.py), so a single
Europe-wide sort would only compare unlike scales. The selection is therefore
per country, then pooled: each country gives its best rated walks with a
photograph, and its best few in each of the cuts the app's rails draw at rest
(a walk over several days, a day walk with a view, past a waterfall, by a
lake). The app orders every rail round-robin across countries, so no one
country fills a rail. Rows are the country file's own trip objects, unchanged,
so a tile opens the same trail page a country list does.

Read from the published country files, so it needs no trailslab database and
no network:

    python pipeline/trails/export_top.py
    python pipeline/trails/export_top.py --dir /some/scratch/trails --dry-run
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "continent-app" / "public" / "trails"

# The country's best walks, whatever they are.
BEST_PER_COUNTRY = 4
# The best few in each rail's cut, per country. Over-selected on purpose: the
# app refuses some photographs at render time (src/lib/photoVeto.js), and a
# rail needs four tiles to show at all.
CUT_PER_COUNTRY = 3

# The rails' cuts, in the app's own terms (src/lib/openingScreen.js
# OPENING_RAILS.trailEurope and trailCards.js DISTANCE_BANDS).
TREK_MIN_M = 40_000
DAY_MIN_M, DAY_MAX_M = 5_000, 20_000


def _highlights(tr: dict) -> list:
    return list((tr.get("f") or {}).get("hl") or [])


CUTS = {
    "trek": lambda tr: (tr.get("distance_m") or 0) >= TREK_MIN_M,
    "view": lambda tr: DAY_MIN_M <= (tr.get("distance_m") or 0) < DAY_MAX_M
    and any(h in _highlights(tr) for h in ("viewpoint", "summit")),
    "waterfall": lambda tr: "waterfall" in _highlights(tr),
    "lake": lambda tr: "lake" in _highlights(tr),
}


def eligible(tr: dict) -> bool:
    """A rated walk with a name and a photograph; never a city day."""
    if tr.get("category") == "citytrip":
        return False
    # A name a walker can read: a bare route number ("6668") is a ref, not a
    # name, and a rail of photographs is no place for it.
    if tr.get("rating") is None or not re.search(r"[^\W\d_]{3}", tr.get("name") or ""):
        return False
    img = tr.get("img")
    url = img.get("u") if isinstance(img, dict) else img
    return bool(url)


def _rank(tr: dict) -> tuple:
    # Best first; among equals the longer walk, then the id, so a re-run
    # writes the same file.
    return (-(tr.get("rating") or 0), -(tr.get("distance_m") or 0), tr.get("id") or 0)


def select(country_files: list[dict]) -> tuple[list[dict], dict]:
    chosen: dict = {}
    per_country: dict = {}
    for data in country_files:
        cc = data.get("country")
        pool = sorted((t for t in data.get("trips") or [] if eligible(t)), key=_rank)
        picks = list(pool[:BEST_PER_COUNTRY])
        for test in CUTS.values():
            picks.extend([t for t in pool if test(t)][:CUT_PER_COUNTRY])
        n = 0
        for t in picks:
            if t["id"] not in chosen:
                chosen[t["id"]] = t
                n += 1
        if n:
            per_country[cc] = n
    rows = sorted(chosen.values(), key=lambda t: (t.get("country") or "", *_rank(t)))
    return rows, per_country


def build(out_dir: Path = OUT_DIR, dry_run: bool = False) -> int:
    files = sorted(p for p in out_dir.glob("*.json") if len(p.stem) == 2 and p.stem.isupper())
    country_files = []
    for p in files:
        with p.open(encoding="utf-8") as fh:
            country_files.append(json.load(fh))
    rows, per_country = select(country_files)
    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "n_trips": len(rows),
        "per_country": per_country,
        "trips": rows,
    }
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    cuts = {k: sum(1 for t in rows if test(t)) for k, test in CUTS.items()}
    print(f"trails top: {len(rows)} walk(s) from {len(per_country)} countr(ies), "
          f"{len(text) / 1024:.0f} KB; per cut {cuts}")
    if not dry_run:
        (out_dir / "top.json").write_text(text, encoding="utf-8")
    return 0


def main() -> int:
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description="Write continent-app/public/trails/top.json "
                                             "from the published country files.")
    ap.add_argument("--dir", default=str(OUT_DIR), help="the trails wire directory")
    ap.add_argument("--dry-run", action="store_true", help="select and report, write nothing")
    args = ap.parse_args()
    return build(Path(args.dir), args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
