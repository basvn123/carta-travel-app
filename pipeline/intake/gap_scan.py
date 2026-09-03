"""Geographic gap scan (B4, 2026-09): the misses no register can name.

Mougins is in no register (the 2026-08 research measured this), so B3's
register diff can never surface it. But Mougins sits 5 km from Cannes with
a Wikipedia article in 58 languages - "half a micro-region present" is the
signature of a pipeline artifact, and proximity plus notability is
measurable without any register.

Method: every catalogue destination already has a WDQS landmark box on disk
(cache/wikidata_landmarks.json, +-9 km). This scan walks the settlement-
typed rows of every box whose OWNER scores >= ANCHOR_MIN, keeps the ones
with SITELINKS_MIN+ sitelinks that match no catalogue destination and no B1
member, and ranks them by

    gap_score = sitelinks x (anchor score / 10) x (2 - km/10)

so a famous village NEXT DOOR to a famous place leads the list - the
proximity factor is the whole point: half a micro-region present is the
signature of a miss, and Valbonne at 3 km from Biot outranks an equally
notable town nine kilometres from anywhere. One row per
entity, attributed to its best anchor. Deviation from PLAN.md's sketch,
disclosed: the 25 km OSM grid pass is replaced by these boxes - same
question, data already on disk, and Wikidata sitelinks are a stricter
notability screen than raw OSM tourism tags; the OSM variant remains open
if this screen proves too coarse.

Emits reports/gap_candidates.csv. Ingests nothing, ever.

Usage:
    python pipeline/intake/gap_scan.py
"""

import csv
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "intake"))

from harvest_place_signals import norm, haversine       # noqa: E402
from member_layer import SETTLEMENT_TYPES               # noqa: E402
from register_intake import catalogue_index, lookup     # noqa: E402

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# The wire, not the master: these tools read only fields both files carry
# (identically - the rating mirror guarantees it), and the 64 MB master
# needs ~2 GB to parse, which a loaded workstation does not always have.
MASTER = ROOT / "continent-app" / "public" / "app_data.json"
LM_CACHE = ROOT / "cache" / "wikidata_landmarks.json"
OUT = ROOT / "reports" / "gap_candidates.csv"
OUT_FULL = ROOT / "reports" / "gap_candidates_full.csv"

ANCHOR_MIN = 5.5       # capture-maximal (checkpoint decision 2026-09-03):
                       # Frigiliana's only anchor is Nerja at 5.8, and a miss
                       # beside a middling place is still a miss
SITELINKS_MIN = 40     # the notability screen; proximity does the ranking
MAX_CANDIDATES = 2500  # PLAN.md said 800; the user chose capture over the
                       # ceiling - the list stays ranked and the floor stated,
                       # so actionability survives the size
OSM_POP_MIN = 5000     # the population stream: a settlement the sitelink
                       # cache has never met still counts when OSM's own
                       # population tag says it is a real town (Sirmione:
                       # outside every landmark box, 8,000 people)
OSM_CACHE = ROOT / "cache" / "osm_settlements.json"
SITELINKS_CACHE = ROOT / "cache" / "wikidata_sitelinks.json"
OSM_SITELINKS_MIN = 25  # OSM rows: village mappers tag sparsely; the joined
                        # sitelink count still does the screening
OSM_REACH_KM = 25.0     # PLAN.md's own grid cell scale


def anchor_grid(dests):
    """0.25-degree buckets of (lat, lon, city, score) for nearest-anchor."""
    g = {}
    for d in dests.values():
        score = (d.get("rating") or {}).get("score") or 0
        if score < ANCHOR_MIN:
            continue
        lat = d.get("city_lat") if d.get("city_lat") is not None else d.get("lat")
        lon = d.get("city_lon") if d.get("city_lon") is not None else d.get("lon")
        if lat is None:
            continue
        g.setdefault((int(lat / 0.25), int(lon / 0.25)), []).append(
            (lat, lon, d.get("city"), score))
    return g


def nearest_anchor(g, lat, lon, km_max):
    bi, bj = int(lat / 0.25), int(lon / 0.25)
    best = None
    for i in range(bi - 2, bi + 3):
        for j in range(bj - 2, bj + 3):
            for (la, lo, city, score) in g.get((i, j), ()):
                km = haversine(lat, lon, la, lo)
                if km <= km_max and (best is None or km < best[0]):
                    best = (km, city, score)
    return best


def osm_rows(dests, grid, seen_qids):
    """Candidates from the Geofabrik settlement scan, sitelinks joined
    offline; only what the box scan has not already found."""
    if not OSM_CACHE.exists() or not SITELINKS_CACHE.exists():
        print("  (osm settlement cache not present yet - box scan only)")
        return []
    osm = json.loads(OSM_CACHE.read_text(encoding="utf-8"))
    sl_of = json.loads(SITELINKS_CACHE.read_text(encoding="utf-8"))
    anchors = anchor_grid(dests)
    out = []
    for cc, rows in osm.items():
        if cc == "_countries":
            continue
        for (name, lat, lon, place, qid, pop) in rows:
            if qid in seen_qids:
                continue
            sl = sl_of.get(qid) or 0
            source = "osm_grid"
            if sl < OSM_SITELINKS_MIN:
                # unknown to the sitelink cache: fall back to OSM's own
                # population tag as the notability screen, on a comparable
                # pseudo-scale (10 x log10(pop): 8,000 people ~ 39)
                if sl or pop < OSM_POP_MIN:
                    continue
                import math
                sl = round(10 * math.log10(pop))
                source = "osm_pop"
            a = nearest_anchor(anchors, lat, lon, OSM_REACH_KM)
            if not a:
                continue
            status, _m = lookup(grid, lat, lon, name)
            if status == "held":
                continue
            km, anchor_city, anchor_score = a
            gap = sl * anchor_score / 10.0 * (2.0 - min(km, 10.0) / 10.0)
            seen_qids.add(qid)
            out.append({
                "name": name, "qid": qid,
                "lat": lat, "lon": lon, "sitelinks": sl,
                "status": status,
                "anchor": anchor_city, "anchor_score": anchor_score,
                "km_to_anchor": round(km, 1),
                "gap_score": round(gap, 1),
                "desc": f"osm place={place}" + (f", pop {pop}" if pop else ""),
                "wiki": "",
                "source": source,
                "queued": str(date.today()),
            })
    return out


def main():
    data = json.loads(MASTER.read_text(encoding="utf-8"))
    dests = data["destinations"]
    lm = json.loads(LM_CACHE.read_text(encoding="utf-8"))
    grid = catalogue_index(dests)

    best = {}   # qid -> candidate row (keep the strongest anchor)
    for did, d in dests.items():
        score = (d.get("rating") or {}).get("score") or 0
        if score < ANCHOR_MIN:
            continue
        alat = d.get("city_lat") if d.get("city_lat") is not None else d.get("lat")
        alon = d.get("city_lon") if d.get("city_lon") is not None else d.get("lon")
        for row in lm.get(did) or []:
            try:
                qid, lat, lon, sl, _img, art, label, sdesc, types = row
            except (TypeError, ValueError):
                continue
            if sl < SITELINKS_MIN or not label or label == qid:
                continue
            if not any(t in SETTLEMENT_TYPES for t in types or ()):
                continue
            status, _match = lookup(grid, lat, lon, label)
            if status == "held":
                continue
            km = haversine(lat, lon, alat, alon)
            gap = sl * score / 10.0 * (2.0 - min(km, 10.0) / 10.0)
            prev = best.get(qid)
            if prev and prev["gap_score"] >= gap:
                continue
            best[qid] = {
                "name": label, "qid": qid,
                "lat": round(lat, 5), "lon": round(lon, 5),
                "sitelinks": sl,
                "status": status,          # missing, or member_of (B1 only)
                "anchor": d.get("city"), "anchor_score": score,
                "km_to_anchor": round(km, 1),
                "gap_score": round(gap, 1),
                "desc": (sdesc or "")[:80],
                "wiki": art or "",
                "source": "wdq_box",
                "queued": str(date.today()),
            }

    rows = list(best.values())
    rows += osm_rows(dests, grid, set(best.keys()))
    rows.sort(key=lambda r: -r["gap_score"])
    if len(rows) > MAX_CANDIDATES:
        floor = rows[MAX_CANDIDATES - 1]["gap_score"]
        print(f"{len(rows)} raw candidates; emitting the top "
              f"{MAX_CANDIDATES} (gap_score floor {floor}) - the plan's "
              "actionability ceiling is the emitted list, and the floor is "
              "stated so the cut is a threshold, not a mystery.")
    # Capture-maximal (user decision): the FULL ranked list also ships, so
    # nothing the scan saw is ever lost to the cap - the top file is the
    # actionable review queue, the full file is the archive to grep.
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT_FULL.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    full_rows = rows
    rows = rows[:MAX_CANDIDATES]
    with OUT.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {OUT.name}: {len(rows)} candidates "
          f"({sum(1 for r in rows if r['status'] == 'member_of')} already "
          f"reachable as area members); {OUT_FULL.name}: {len(full_rows)}")

    for probe in ("Mougins", "Valbonne", "Vence", "Tourrettes-sur-Loup",
                  "Gourdon", "Peillon", "Frigiliana", "Sirmione"):
        hit = next((r for r in full_rows if norm(r["name"]) == norm(probe)), None)
        print(f"  probe {probe}: "
              + (f"rank {full_rows.index(hit) + 1}, via {hit['anchor']} "
                 f"({hit['km_to_anchor']} km, {hit['sitelinks']} sitelinks)"
                 if hit else "not flagged"))


if __name__ == "__main__":
    main()
