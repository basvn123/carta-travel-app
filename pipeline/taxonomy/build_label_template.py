"""Build the 400-item hand-label template for the taxonomy eval (T1149, ROADMAP F1).

    python -I pipeline/taxonomy/build_label_template.py [--check]

Writes continent-app/scripts/eval/taxonomy/gold.csv: 400 rows with empty
`labels`, for the owner to fill (docs/ai/taxonomy-labelling-guide.md). With
--check it rebuilds in memory and fails if the committed file's item list
differs (a filled `labels` column is kept and never compared).

The draw is deterministic (seeded by item id hashes, no RNG state):
  layer quota   places 240, trails 100, beaches 20, lakes 20, mountains 20
  places        rated places only (the Explore catalogue, airports included);
                quota per country proportional to its places, at least 1 per
                country that has any, by largest remainder; inside a country,
                spread over place.class (metro, city, town, village, area)
                toward a global class target proportional to the square root
                of each class's size, so rare classes are seen and common
                ones still lead
  trails        rated hikes (citytrip walks included as a kind), quota per
                country the same way, spread over the grade
  beach, lake, mountain   rated rows, quota per country the same way, spread
                over size, kind and kind
The owner never sees today's tags in the template: that would anchor the
labels on the very thing the eval compares against.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUB = ROOT / "continent-app" / "public"
OUT = ROOT / "continent-app" / "scripts" / "eval" / "taxonomy" / "gold.csv"
QUOTA = {"place": 240, "trail": 100, "beach": 20, "lake": 20, "mountain": 20}
COLUMNS = ["item_id", "layer", "kind", "country", "name", "context", "labels", "unsure", "note", "by", "at"]


def _h(s: str) -> str:
    return hashlib.sha1(f"carta-taxonomy-v1:{s}".encode()).hexdigest()


def _plain(s: str) -> str:
    """House rule: no en or em dashes in text; an OSM name's "A \u2013 B" reads "A to B"."""
    for d in (chr(0x2013), chr(0x2014)):
        s = s.replace(f" {d} ", " to ").replace(d, "-")
    return s


def _json(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def _countries(folder):
    return sorted(p.stem for p in (PUB / folder).glob("*.json") if len(p.stem) == 2 and p.stem.isupper())


def pool() -> dict[str, list[dict]]:
    items: dict[str, list[dict]] = defaultdict(list)
    for d in _json(PUB / "app_data.json")["destinations"].values():
        cls = (d.get("place") or {}).get("class")
        if not cls or not d.get("iso2"):
            continue
        items["place"].append({"item_id": d["id"], "layer": "place", "kind": cls, "country": d["iso2"],
                               "name": d.get("city") or d["id"], "context": (d.get("blurb") or "")[:240]})
    for cc in _countries("trails"):
        for r in _json(PUB / "trails" / f"{cc}.json").get("trips") or []:
            kind = "citytrip" if r.get("category") == "citytrip" else (r.get("f") or {}).get("g") or "ungraded"
            km = round((r.get("distance_m") or 0) / 1000, 1)
            items["trail"].append({"item_id": str(r["id"]), "layer": "trail", "kind": kind, "country": cc,
                                   "name": r.get("name") or str(r["id"]),
                                   "context": f"{km} km, {r.get('ascent_m') or 0} m up; https://www.openstreetmap.org/relation/{r.get('osm') or r['id']}"})
    for layer, folder, kind_of in (("beach", "beaches", "size"), ("lake", "lakes", "kind"), ("mountain", "mountains", "kind")):
        for cc in _countries(folder):
            for r in _json(PUB / folder / f"{cc}.json").get(folder) or []:
                items[layer].append({"item_id": r["id"], "layer": layer, "kind": r.get(kind_of) or "unknown", "country": cc,
                                     "name": r.get("name") or r["id"], "context": ""})
    return items


def _apportion(counts: dict[str, int], total: int) -> dict[str, int]:
    """At least one per key that has items (while the total allows), the rest proportional, largest remainder."""
    keys = sorted(counts, key=lambda k: (-counts[k], k))
    q = {k: 0 for k in keys}
    if total <= 0:
        return q
    base = keys[:total]
    for k in base:
        q[k] = 1
    left = total - len(base)
    n = sum(counts.values())
    raw = {k: counts[k] / n * left for k in keys}
    for k in keys:
        q[k] += int(raw[k])
    rest = total - sum(q.values())
    for k in sorted(keys, key=lambda k: (-(raw[k] - int(raw[k])), k))[:rest]:
        q[k] += 1
    for k in keys:
        q[k] = min(q[k], counts[k])
    short = total - sum(q.values())
    while short > 0:
        k = next((k for k in keys if q[k] < counts[k]), None)
        if k is None:
            break
        q[k] += 1
        short -= 1
    return q


def draw(items: list[dict], total: int) -> list[dict]:
    """Countries get a proportional quota (at least one each); kinds get a global target proportional
    to the square root of their size, so rare kinds are seen without swamping the common ones. Each
    pick inside a country takes the kind furthest behind its target that the country still has."""
    by_cc: dict[str, list[dict]] = defaultdict(list)
    kind_n: dict[str, int] = defaultdict(int)
    for it in items:
        by_cc[it["country"]].append(it)
        kind_n[it["kind"]] += 1
    quota = _apportion({c: len(v) for c, v in by_cc.items()}, total)
    target = _apportion({k: max(1, round(n ** 0.5 * 100)) for k, n in kind_n.items()}, total)
    taken: dict[str, int] = defaultdict(int)
    left: dict[str, dict[str, list[dict]]] = {}
    for cc, its in by_cc.items():
        left[cc] = defaultdict(list)
        for it in sorted(its, key=lambda x: _h(x["item_id"])):
            left[cc][it["kind"]].append(it)
    picked: list[dict] = []
    order = sorted(by_cc, key=lambda c: (quota[c], c))
    while True:
        moved = False
        for cc in order:
            if quota[cc] <= 0:
                continue
            kinds = [k for k, v in left[cc].items() if v]
            if not kinds:
                continue
            k = min(kinds, key=lambda k: ((taken[k] + 1) / max(target.get(k, 0), 0.5), k))
            picked.append(left[cc][k].pop(0))
            taken[k] += 1
            quota[cc] -= 1
            moved = True
        if not moved:
            break
    return sorted(picked, key=lambda x: (x["country"], x["kind"], x["item_id"]))


def build() -> list[dict]:
    p = pool()
    rows = []
    for layer, n in QUOTA.items():
        rows += draw(p[layer], n)
    for r in rows:
        r["name"], r["context"] = _plain(r["name"]), _plain(r["context"])
        for c in COLUMNS:
            r.setdefault(c, "")
    return rows


def to_csv(rows: list[dict]) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=COLUMNS, lineterminator="\n")
    w.writeheader()
    for r in rows:
        w.writerow({c: r.get(c, "") for c in COLUMNS})
    return buf.getvalue()


def read(path: Path = OUT) -> list[dict]:
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


if __name__ == "__main__":
    rows = build()
    if "--check" in sys.argv:
        have = [(r["item_id"], r["layer"]) for r in read()]
        want = [(r["item_id"], r["layer"]) for r in rows]
        if have != want:
            print(f"gold.csv item list differs from a fresh draw ({len(have)} vs {len(want)} rows)")
            sys.exit(1)
        print(f"gold.csv matches the draw: {len(rows)} rows")
        sys.exit(0)
    if OUT.exists() and any((r.get("labels") or "").strip() for r in read()):
        print("gold.csv already holds labels; not overwritten")
        sys.exit(1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(to_csv(rows), encoding="utf-8")
    print(f"wrote {OUT} ({len(rows)} rows)")
