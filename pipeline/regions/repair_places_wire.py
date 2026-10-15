"""Apply the T456 place rules (place_truth.py) to the published wire, in place.

Tier: One-off repair (idempotent; safe to re-run)

The rebuilds that would apply them need the harvest caches (lakes, beaches,
mountains) and the trailslab database (trails), none of them on this
machine. This rewrites what is published, with the same functions the
exports now call:

  lakes, beaches   `region` from the NUTS 3 region the point lies in (Latin
                   name) when it is in the row's own country; otherwise the
                   Wikidata label only if Latin and of that country
  lakes            rows that are not lakes (bays, rias, estuaries, beaches,
                   car parks) dropped
  beaches          the hand fixes (Calanques de Piana dropped, Inch Beach's
                   length, Nissi's tags, Navagio's surface)
  mountains        Aavasaksa's range
  trails           a short walk whose midpoint lies in another catalogue
                   country moves to that country's file (and its detail file
                   says so); both files' counts and the index follow

    python pipeline/regions/repair_places_wire.py --dry-run
    python pipeline/regions/repair_places_wire.py
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import place_truth as P  # noqa: E402

PUB = P.ROOT / "continent-app" / "public"


def load(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def save(p: Path, data, dry: bool):
    if not dry:
        p.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def country_files(layer: str, pub: Path = PUB):
    return [p for p in sorted((pub / layer).glob("*.json")) if len(p.stem) == 2 and p.stem.isupper()]


def repair_regions(layer: str, list_keys: tuple, dry: bool, stats: Counter, pub: Path = PUB) -> None:
    files = {p: load(p) for p in country_files(layer, pub)}
    rows = [r for d in files.values() for k in list_keys for r in d.get(k) or []]
    owners = P.region_owners(rows)
    dropped_ids = set()
    for p, d in files.items():
        for k in list_keys:
            keep = []
            for r in d.get(k) or []:
                if layer == "lakes" and not P.is_lake(r):
                    stats[f"{layer} not a lake, dropped"] += 1
                    dropped_ids.add(r.get("id"))
                    continue
                if layer == "beaches" and not P.apply_fixes(r, P.BEACH_FIXES):
                    stats[f"{layer} dropped by hand fix"] += 1
                    dropped_ids.add(r.get("id"))
                    continue
                before = r.get("region")
                after = P.region_for(r, owners)
                if after != before:
                    stats[f"{layer} region changed" if after else f"{layer} region dropped"] += 1
                    if after:
                        r["region"] = after
                    else:
                        r.pop("region", None)
                keep.append(r)
            d[k] = keep
        if "n" in d:
            d["n"] = len(d.get(list_keys[0]) or [])
        save(p, d, dry)
    # The index counts each country's rows; a dropped row leaves its count.
    idx_p = pub / layer / "index.json"
    if idx_p.exists():
        idx = load(idx_p)
        by_cc = {p.stem: d for p, d in files.items()}
        names_gone = {r_id for r_id in dropped_ids}
        for e in idx.get("countries") or []:
            d = by_cc.get(e.get("cc"))
            if not d:
                continue
            e["n"] = len(d.get(list_keys[0]) or [])
            if "listed" in e:
                e["listed"] = len(d.get("listed") or [])
            live = {r.get("name") for r in d.get(list_keys[0]) or []}
            if isinstance(e.get("top"), list):
                e["top"] = [n for n in e["top"] if n in live]
        total_key = f"n_{layer}"
        if total_key in idx:
            old_total = idx[total_key]
            idx[total_key] = sum(e.get("n") or 0 for e in idx.get("countries") or [])
            # The photo-reading tally counted the dropped rows too; they were
            # read like the rest (share 1 before), so they leave it with them.
            model = idx.get("model") or {}
            if isinstance(model.get("photo_read_rows"), int) and idx[total_key]:
                model["photo_read_rows"] = max(0, model["photo_read_rows"] - (old_total - idx[total_key]))
                model["photo_read_share"] = round(model["photo_read_rows"] / idx[total_key], 3)
        if "n_listed" in idx:
            idx["n_listed"] = sum(e.get("listed") or 0 for e in idx.get("countries") or [])
        if names_gone:
            stats[f"{layer} index recounted"] += 1
        save(idx_p, idx, dry)
    # The top file carries the same rows; it is rebuilt from the repaired ones.
    top_p = pub / layer / "top.json"
    if top_p.exists():
        by_id = {r.get("id"): r for d in files.values() for k in list_keys for r in d.get(k) or []}
        top = load(top_p)
        key = next((k for k in list_keys if k in top), list_keys[0])
        top[key] = [by_id.get(r.get("id"), r) for r in top.get(key) or [] if r.get("id") not in dropped_ids]
        save(top_p, top, dry)


def repair_mountains(dry: bool, stats: Counter, pub: Path = PUB) -> None:
    for p in country_files("mountains", pub) + [pub / "mountains" / "top.json"]:
        d = load(p)
        hit = False
        for k in ("mountains", "listed"):
            for r in d.get(k) or []:
                if r.get("id") in P.MOUNTAIN_FIXES and r.get("range") is not None:
                    P.apply_fixes(r, P.MOUNTAIN_FIXES)
                    hit = True
                    stats["mountains range fixed"] += 1
        if hit:
            save(p, d, dry)


def repair_trails(dry: bool, stats: Counter, pub: Path = PUB) -> None:
    files = {p.stem: load(p) for p in country_files("trails", pub)}
    known = set(files)
    moves = []
    for cc, d in files.items():
        keep = []
        for t in d.get("trips") or []:
            there = P.trail_country(t.get("rg"), cc, t.get("distance_m"), known)
            if there != cc:
                moves.append((cc, there, t))
            else:
                keep.append(t)
        d["trips"] = keep
    for src, dst, t in moves:
        t["country"] = dst
        files[dst].setdefault("trips", []).append(t)
        stats[f"trails moved {src} to {dst}"] += 1
        detail = pub / "trails" / "trip" / f"{t['id']}.json"
        if detail.exists():
            dd = load(detail)
            dd["country"] = dst
            save(detail, dd, dry)
    touched = {s for s, _, _ in moves} | {d for _, d, _ in moves}
    idx_p = pub / "trails" / "index.json"
    idx = load(idx_p)
    entries = {e["country"]: e for e in idx.get("countries") or []}
    for cc in touched:
        d = files[cc]
        trips = d.get("trips") or []
        d["n_trips"] = len(trips)
        d["counts"] = dict(Counter(t.get("category") for t in trips))
        d["n_loops"] = sum(1 for t in trips if t.get("is_loop"))
        save(pub / "trails" / f"{cc}.json", d, dry)
        if cc in entries:
            entries[cc]["n_trips"] = d["n_trips"]
            entries[cc]["counts"] = d["counts"]
    if touched:
        save(idx_p, idx, dry)


def place_pass(layer: str, layer_dir: Path) -> None:
    """The exports' last step (T456): the same rules on the files just
    written, so an export and this repair cannot disagree."""
    stats: Counter = Counter()
    pub = Path(layer_dir).parent
    if layer in ("lakes", "beaches"):
        repair_regions(layer, (layer, "listed"), False, stats, pub)
    elif layer == "mountains":
        repair_mountains(False, stats, pub)
    elif layer == "trails":
        repair_trails(False, stats, pub)
    for k, v in sorted(stats.items()):
        print(f"  place pass: {v} {k}")


def main() -> int:
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--layers", default="lakes,beaches,mountains,trails")
    a = ap.parse_args()
    stats: Counter = Counter()
    layers = a.layers.split(",")
    if "lakes" in layers:
        repair_regions("lakes", ("lakes", "listed"), a.dry_run, stats)
    if "beaches" in layers:
        repair_regions("beaches", ("beaches", "listed"), a.dry_run, stats)
    if "mountains" in layers:
        repair_mountains(a.dry_run, stats)
    if "trails" in layers:
        repair_trails(a.dry_run, stats)
    head = "would change" if a.dry_run else "changed"
    print(f"{head}:")
    for k, v in sorted(stats.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  {v:6d}  {k}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
