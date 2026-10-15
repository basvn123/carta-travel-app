"""Apply the T455 cycling rules (wire_truth.py) to the published wire, in place.

Tier: One-off repair (idempotent; safe to re-run)

The rebuild that would apply them needs the trailslab database and the
harvest caches, neither on this machine (row T297-a). This rewrites what is
published, with the same functions export_cycling.py now calls:

  - route names: bracketed refs, arrows and spaced dashes cleaned; a name that
    is only a ref becomes null, and the app composes "Regional route 45";
  - `sec: 1` on every route that is one stretch of a longer one, so the card
    can say so;
  - tours: the title cleaned (a ref-only title becomes its first and last
    town), the pace label set from the distance actually ridden a day, and
    one tour per route and length;
  - EuroVelo families: the route's official name, and no total length or
    country count in the index (they were the sum of our sections, not the
    route).

    python pipeline/cycling/repair_cycling_wire.py --dry-run
    python pipeline/cycling/repair_cycling_wire.py
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import wire_truth as W  # noqa: E402

ROOT = HERE.parents[1]
WIRE = ROOT / "continent-app" / "public" / "cycling"


def load(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def save(p: Path, data, dry: bool):
    if not dry:
        p.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def fix_tour(t: dict) -> None:
    title = W.clean_route_name(t.get("title"))
    if not title:
        towns = [x for x in (t.get("towns") or []) if x]
        title = f"{towns[0]}, {towns[-1]}" if len(towns) >= 2 else (t.get("title") or "")
    t["title"] = title
    t["pace"] = W.pace_for(t.get("km"), t.get("days"))


def main() -> int:
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--dir", default=str(WIRE))
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    wire, dry = Path(a.dir), a.dry_run
    stats = {"renamed": 0, "nulled": 0, "sections": 0, "tours_relabelled": 0, "tours_dropped": 0}
    by_id: dict = {}
    tour_slugs_kept: set = set()

    for p in sorted(wire.glob("*.json")):
        if len(p.stem) != 2 or not p.stem.isupper():
            continue
        data = load(p)
        rows = (data.get("routes") or []) + (data.get("listed") or [])
        stats["sections"] += W.mark_sections(rows)
        for r in rows:
            new = W.clean_route_name(r.get("name"))
            if new != r.get("name"):
                stats["nulled" if new is None else "renamed"] += 1
                r["name"] = new
            by_id[r["id"]] = r
        tours = data.get("tours") or []
        for t in tours:
            before = t.get("pace")
            fix_tour(t)
            stats["tours_relabelled"] += before != t["pace"]
        kept = W.dedupe_tours(tours)
        stats["tours_dropped"] += len(tours) - len(kept)
        data["tours"] = kept
        tour_slugs_kept.update(t["slug"] for t in kept)
        save(p, data, dry)

    top_p = wire / "top.json"
    if top_p.exists():
        top = load(top_p)
        top["routes"] = [by_id.get(r["id"], r) for r in top.get("routes") or []]
        tours = top.get("tours") or []
        for t in tours:
            fix_tour(t)
        top["tours"] = [t for t in W.dedupe_tours(tours) if t["slug"] in tour_slugs_kept]
        top["n_tours"] = len(top["tours"])
        save(top_p, top, dry)

    # The route and tour detail files carry the same name and labels.
    for p in (wire / "route").glob("*.json"):
        d = load(p)
        new = W.clean_route_name(d.get("name"))
        if new != d.get("name"):
            d["name"] = new
            save(p, d, dry)
    for p in (wire / "tour").glob("*.json"):
        d = load(p)
        old = (d.get("title"), d.get("pace"))
        fix_tour(d)
        if (d.get("title"), d.get("pace")) != old:
            save(p, d, dry)

    fam_dir = wire / "family"
    idx_p = wire / "index.json"
    idx = load(idx_p)
    for f in idx.get("families") or []:
        f["name"] = W.EV_NAMES.get(f.get("ref"))
        f.pop("km", None)
    if "n_tours" in idx:
        idx["n_tours"] = len(tour_slugs_kept)
    save(idx_p, idx, dry)
    for p in fam_dir.glob("EV*.json"):
        d = load(p)
        d["name"] = W.EV_NAMES.get(d.get("ref"))
        for s in d.get("sections") or []:
            s["name"] = W.clean_route_name(s.get("name")) or s.get("name")
        save(p, d, dry)

    print(("would change: " if dry else "changed: ") + ", ".join(f"{k} {v}" for k, v in stats.items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
