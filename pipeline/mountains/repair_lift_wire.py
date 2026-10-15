"""Apply the T454 lift rule to the published mountain wire, in place.

Tier: One-off repair (idempotent; safe to re-run)

T454 tightened peak_index.lift_of(): an OSM top station counts as this
mountain's lift only within SUMMIT_LIFT_M of the summit (was 700 m, now
250 m), and a curated lift counts as one to the top only where its seed says
`"top": True`. The full rebuild that would apply that rule needs the enrich
cache (cache/mountains/rich_*.json), which is not on this machine. Until it
runs, this script applies the same rule to what is already published, so the
app stops claiming a lift to the summit of Mont Blanc, the Eiger or Etna.

A summit lift that fails the rule becomes "liftsNearby" (lifts on the
mountain): the row's lift kind, its access code (liftTop -> liftMountain) and
its why entry all change together. The score is left as it is; the next full
rebuild recomputes it with the access the rule allows.

    python pipeline/mountains/repair_lift_wire.py --dry-run
    python pipeline/mountains/repair_lift_wire.py
"""
from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from peak_index import LIFT_TOP_CONFIRMED, SUMMIT_LIFT_M  # noqa: E402
from seed_peaks import SEED  # noqa: E402

ROOT = HERE.parents[1]
WIRE = ROOT / "continent-app" / "public" / "mountains"
SUMMIT_KINDS = {"cableCar", "gondola", "chairlift", "funicular", "rackRailway"}
# Letters NFKD does not decompose (memory: nfkd-undecomposed-letters).
FOLD = str.maketrans({"ø": "o", "æ": "ae", "œ": "oe", "ß": "ss", "ł": "l", "đ": "d", "ð": "d", "þ": "th"})


def fold(name: str) -> str:
    s = unicodedata.normalize("NFKD", (name or "").lower().translate(FOLD))
    return "".join(c for c in s if not unicodedata.combining(c)).strip()


def top_seeds() -> set:
    out = set()
    for s in SEED:
        if s.get("top"):
            for n in [s["n"], *(s.get("alt") or [])]:
                out.add((fold(n), s["cc"]))
    return out


def failing(row: dict, tops: set) -> bool:
    lift = row.get("lift") or {}
    if lift.get("kind") not in SUMMIT_KINDS:
        return False
    if lift.get("src") == "osm":
        if row.get("wd") in LIFT_TOP_CONFIRMED:
            return False
        return lift.get("m") is not None and lift["m"] > SUMMIT_LIFT_M
    if lift.get("src") == "curated":
        return (fold(row.get("name")), row.get("cc")) not in tops
    return False


def demote(row: dict) -> None:
    row["lift"]["kind"] = "liftsNearby"
    acc = row.get("acc")
    if isinstance(acc, list) and "liftTop" in acc:
        row["acc"] = list(dict.fromkeys("liftMountain" if a == "liftTop" else a for a in acc))
    for w in row.get("why") or []:
        if isinstance(w, dict) and w.get("k") == "lift":
            w["kind"] = "liftsNearby"


def repair_file(path: Path, tops: set, dry_run: bool) -> list:
    data = json.loads(path.read_text(encoding="utf-8"))
    hits = []
    for key in ("mountains", "listed"):
        for row in data.get(key) or []:
            if failing(row, tops):
                hits.append(f'{row.get("cc")} {row.get("name")} ({row["lift"].get("kind")}, '
                            f'{row["lift"].get("src")}, {row["lift"].get("m", "no distance")})')
                demote(row)
    if hits and not dry_run:
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return hits


def main() -> int:
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--dir", default=str(WIRE))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    tops = top_seeds()
    wire = Path(args.dir)
    total = 0
    for path in sorted(wire.glob("*.json")):
        if path.name == "index.json":
            continue
        hits = repair_file(path, tops, args.dry_run)
        if hits and path.name != "top.json":
            for h in hits:
                print("  " + h)
        total += len(hits) if path.name != "top.json" else 0
        if path.name == "top.json":
            print(f"  top.json: {len(hits)} row(s)")
    print(f"{'would demote' if args.dry_run else 'demoted'} {total} summit lift claim(s) "
          f"to lifts on the mountain")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
