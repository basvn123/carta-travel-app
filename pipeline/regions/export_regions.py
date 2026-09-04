"""Write the region wire: continent-app/public/region/{ID}.json + index.

Usage, from the repo root:

    python pipeline/regions/export_regions.py --all
    python pipeline/regions/export_regions.py --regions ES61,COAST:ES-LUZ-CADIZ

One file per NUTS2 region, per coastal stretch and per European GMBA range,
each holding the published rows of every layer that fall inside it:

    { "region":     {"id","name","kind","country"},
      "rated":      [cards, ranked by score, each tagged "layer"],
      "listed":     [cards with NO score key, separate array on purpose:
                     a screen has to opt in to showing them],
      "editorial":  [seed picks, pinned; empty until the layer briefs land],
      "neighbours": ["ES612", ...] }

Rules the export keeps, learned elsewhere and enforced here:

  Always write the empty file. Under public/ a missing JSON is served as
  the SPA index with status 200, so "no file" reads as HTML, not as
  "nothing here". A region with nothing gets {"rated":[],"listed":[],...}.

  Delete the file of a region that drops out of the spine (same as San
  Marino's lakes), but ONLY on an --all run: a targeted export must never
  de-index the rest, which is why --regions and --all are explicit and
  there is no default.

  The gate runs before the write. Every file is composed and validated
  first; a validation failure leaves the previous wire standing.

  Windows cannot put a colon in a filename, so COAST:ES-LUZ-CADIZ ships as
  COAST_ES-LUZ-CADIZ.json. file_for() is the one place that mapping lives;
  the app mirrors it in lib/regions.js. Reserved device names (PRN, CON,
  the fare layer paid for this lesson) get an R_ prefix.

  Trail cards drop their geometry: a region page card needs the name, the
  photo and the rating, not four thousand vertices.

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "pipeline"))

from pipeline_io import load_json  # noqa: E402
import quotas  # noqa: E402

WIRE = ROOT / "continent-app" / "public"
OUT_DIR = WIRE / "region"
GPKG = ROOT / "cache" / "regions" / "regions.gpkg"

LAYER_WIRES = {
    "beach": ("beaches", "beaches"),
    "lake": ("lakes", "lakes"),
    "mountain": ("mountains", "mountains"),
    "trail": ("trails", "trips"),
    "cycling": ("cycling", "routes"),
}

# Every layer ships its listed and editorial rows in a SEPARATE array, so a
# screen has to opt in to showing them (master spec section 3). This pass has
# always had a `listed` bucket to route them into and only ever read the rated
# key, so listed rows reached no region page at all. Reading both keys is what
# makes the coverage floor mean something: a region whose rated rows are zero
# is exactly the region whose page is filled by listed ones.
LISTED_KEY = "listed"

RESERVED = {"con", "prn", "aux", "nul", "com1", "com2", "com3", "com4",
            "com5", "com6", "com7", "com8", "com9", "lpt1", "lpt2", "lpt3",
            "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9"}


def log(msg):
    print(f"[regions] {msg}")


def file_for(region_id):
    base = region_id.replace(":", "_")
    if base.split(".")[0].lower() in RESERVED:
        base = "R_" + base
    return f"{base}.json"


# ---------------------------------------------------------------------------
# The region set: NUTS2 + coast stretches + GMBA ranges
# ---------------------------------------------------------------------------

def region_set():
    import geopandas as gpd
    regions = {}

    admin = gpd.read_file(GPKG, layer="admin")
    n2 = admin[admin["level"] == 2].reset_index(drop=True)
    n2m = n2.to_crs("EPSG:3035")
    tree_geoms = list(n2m.geometry.values)
    import shapely
    tree = shapely.STRtree(tree_geoms)
    for i, row in n2.iterrows():
        hits = tree.query(tree_geoms[i].buffer(500.0), predicate="intersects")
        neigh = [str(n2.iloc[int(j)]["id"]) for j in hits if int(j) != i]
        regions[row["id"]] = {
            "id": row["id"], "name": row["name"], "kind": "nuts2",
            "country": row["country"], "neighbours": sorted(neigh)[:8],
        }

    try:
        coast = gpd.read_file(GPKG, layer="coast")
    except Exception:
        coast = None
    if coast is not None:
        for _, row in coast.iterrows():
            regions[row["id"]] = {
                "id": row["id"], "name": row["name"], "kind": "coast",
                "country": row["cc"],
                "neighbours": [x for x in str(row.get("neighbours") or "").split(",") if x],
            }

    rng = gpd.read_file(GPKG, layer="range")
    kids = defaultdict(list)
    parents = {}
    for _, row in rng.iterrows():
        if row["parent"]:
            kids[row["parent"]].append(row["id"])
            parents[row["id"]] = row["parent"]
    for _, row in rng.iterrows():
        neigh = [x for x in ([row["parent"]] + kids.get(row["id"], [])) if x]
        regions[row["id"]] = {
            "id": row["id"], "name": row["name"], "kind": "range",
            "country": (str(row.get("countries") or "").split(",") or [""])[0],
            "neighbours": neigh[:8],
        }
    return regions, parents


# ---------------------------------------------------------------------------
# Cards
# ---------------------------------------------------------------------------

def _rank_of(card):
    """What a rated card is ranked by. Beaches, lakes and mountains carry
    `score`; trails carry `rating` on the same 0..10 scale. A card with
    neither sorts last rather than crashing the mixed list."""
    for key in ("score", "rating"):
        value = card.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return 0.0


# What a region card is allowed to carry. A region page is a browse
# surface: it renders a picture, a name, a place and a rating, and taps
# through to the layer's own page for everything else. Shipping the whole
# source row instead put a 316 kB file behind the Croatian coast, mostly
# score breakdowns and galleries nothing on this screen reads.
#
# `credit` and the image's `by`/`lic`/`licUrl`/`page` are not optional
# trimming candidates: the per-file Commons credit obligation travels with
# the photograph, so a card that shows a picture ships the fields that
# credit it. Dropping the picture would be allowed; dropping its author
# would not.
#
# What stays OFF a card is a rule, not an oversight. Provenance that
# changes what a reader should expect on the ground (a trail's
# `derived_route`, its bridged `gap_info`) belongs on the layer's page,
# where there is room to say it as a sentence: on a card the same fact
# reads as a defect rather than as honesty. Provenance that only records
# how WE decided something belongs nowhere a reader can see it at all.
CARD_KEEP = (
    "id", "name", "nameLocal", "cc", "country", "lat", "lon", "t",
    "score", "rating", "tier", "kind", "region", "range", "why", "tags",
    "credit", "gem", "difficulty", "distance_m", "is_loop",
    # The trail layer credits differently from the other three: its rows
    # carry the ODbL data notice as `attribution_text` rather than a
    # `credit` array. A trail card that shipped neither would be the one
    # card on the page with no licence line behind it. (Its photograph's
    # own credit lives on the trail detail file, which is where the
    # existing trails list sends a reader too.)
    "attribution_text", "license", "source",
)
IMAGE_KEEP = ("u", "by", "lic", "licUrl", "page", "ev")


def _card(layer, row):
    card = {k: row[k] for k in CARD_KEEP if k in row}
    card["layer"] = layer
    images = row.get("images") or []
    if images:
        # One picture, with its credit. The gallery lives on the layer page.
        card["images"] = [{k: images[0][k] for k in IMAGE_KEEP
                           if k in images[0]}]
    elif row.get("img"):
        # Trails ship a single `img`, and it is an OBJECT of the same shape
        # as one gallery entry, not a URL string. Both are projected the
        # same way so a card only ever has to understand one shape.
        img = row["img"]
        card["img"] = ({k: img[k] for k in IMAGE_KEEP if k in img}
                       if isinstance(img, dict) else img)
    return card


def collect_cards(regions, range_parents):
    """Every published row, routed to each region file it belongs to. A
    row assigned to a range also lands on every ancestor range page: a
    Dolomites peak is an Alps peak too."""
    routed = defaultdict(lambda: {"rated": [], "listed": []})
    counts = defaultdict(lambda: defaultdict(int))

    spine = None
    for layer, (folder, key) in LAYER_WIRES.items():
        for path in sorted((WIRE / folder).glob("[A-Z][A-Z].json")):
            data = load_json(path)
            # BOTH arrays. The country file keeps listed rows in their own
            # `listed` key precisely so a screen has to opt into them, and
            # reading only the main array is how the first cut of this
            # export shipped 208 listed rows to nowhere: the coverage fill
            # existed in the layer wires and no region page showed it.
            rows = list((data or {}).get(key) or [])
            rows += list((data or {}).get("listed") or [])
            for row in rows:
                rg = row.get("rg") or {}
                if not rg:
                    # No stored assignment yet (wire predates the backfill):
                    # assign on the fly so the region wire can ship first.
                    if spine is None:
                        import assign as assign_mod
                        spine = assign_mod
                    lat, lon = _latlon(layer, row)
                    if lat is None:
                        continue
                    ids = spine.assign_point(lat, lon)
                    rg = spine.wire_rg(ids)
                targets = []
                for key2 in ("n2", "co", "ra"):
                    rid = rg.get(key2)
                    if rid and rid in regions:
                        targets.append(rid)
                        if key2 == "ra":
                            seen = {rid}
                            up = range_parents.get(rid)
                            while up and up in regions and up not in seen:
                                targets.append(up)
                                seen.add(up)
                                up = range_parents.get(up)
                tier = row.get("t") or "r"
                card = _card(layer, row)
                for rid in targets:
                    if tier == "l":
                        routed[rid]["listed"].append(card)
                    else:
                        routed[rid]["rated"].append(card)
                    counts[rid][layer] += 1
    return routed, counts


def _latlon(layer, row):
    if layer in ("trail", "cycling"):
        bbox = row.get("bbox")
        if bbox and len(bbox) == 4:
            return (bbox[1] + bbox[3]) / 2.0, (bbox[0] + bbox[2]) / 2.0
        return None, None
    return row.get("lat"), row.get("lon")


# ---------------------------------------------------------------------------
# Validate, then write
# ---------------------------------------------------------------------------

def validate(files):
    failures = []
    for rid, payload in files.items():
        for card in payload["listed"]:
            if "score" in card:
                failures.append(f"{rid}: listed card {card.get('id')} carries a score")
        scores = [c.get("score") for c in payload["rated"] if c.get("score") is not None]
        if scores != sorted(scores, reverse=True):
            failures.append(f"{rid}: rated cards not ranked")
        for n in payload["neighbours"]:
            if not isinstance(n, dict) or not n.get("id") or not n.get("name"):
                failures.append(f"{rid}: bad neighbour entry {n!r}")
    return failures


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--all", action="store_true",
                       help="write every region file and prune the dropped")
    group.add_argument("--regions", default=None,
                       help="comma separated region ids, targeted rewrite")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    regions, range_parents = region_set()
    log(f"region set: {len(regions)} regions")

    wanted = set(regions)
    if args.regions:
        wanted = {x.strip() for x in args.regions.split(",") if x.strip()}
        unknown = wanted - set(regions)
        if unknown:
            print(f"[regions] unknown region ids: {sorted(unknown)[:8]}")
            raise SystemExit(1)

    routed, counts = collect_cards(regions, range_parents)

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    files = {}
    for rid in sorted(wanted):
        got = routed.get(rid, {"rated": [], "listed": []})
        rated = sorted(got["rated"], key=lambda c: -_rank_of(c))
        files[rid] = {
            "region": {k: regions[rid][k] for k in ("id", "name", "kind", "country")},
            "generated_at": stamp,
            "rated": rated,
            "listed": got["listed"],
            "editorial": [],
            # Names, not just ids. A region file is self sufficient: the
            # page renders "the Zeeland delta" without fetching a 650 kB
            # index to look up six labels.
            "neighbours": [
                {"id": nid, "name": regions[nid]["name"],
                 "kind": regions[nid]["kind"]}
                for nid in regions[rid]["neighbours"] if nid in regions
            ],
        }

    failures = validate(files)
    if failures:
        for line in failures[:20]:
            print(f"  FAIL {line}")
        print(f"[regions] {len(failures)} validation failures, nothing written")
        raise SystemExit(1)

    if args.dry_run:
        n_cards = sum(len(f["rated"]) + len(f["listed"]) for f in files.values())
        log(f"dry run: {len(files)} files, {n_cards} cards, nothing written")
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for rid, payload in files.items():
        path = OUT_DIR / file_for(rid)
        path.write_text(json.dumps(payload, ensure_ascii=False,
                                   separators=(",", ":")), encoding="utf-8")

    index = {
        "generated_at": stamp,
        "version": "regions_v1",
        "model": quotas.model_block(),
        "coverage_version": "coverage_v1",
        "n_regions": len(regions),
        "regions": [
            dict({k: regions[rid][k] for k in ("id", "name", "kind", "country")},
                 counts=dict(sorted(counts.get(rid, {}).items())),
                 file=f"/region/{file_for(rid)}")
            for rid in sorted(regions)
        ],
    }
    (OUT_DIR / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")

    if args.all:
        keep = {file_for(rid) for rid in regions} | {"index.json"}
        pruned = 0
        for path in OUT_DIR.glob("*.json"):
            if path.name not in keep:
                path.unlink()
                pruned += 1
        if pruned:
            log(f"pruned {pruned} region files that left the spine")

    n_cards = sum(len(f["rated"]) + len(f["listed"]) for f in files.values())
    log(f"wrote {len(files)} region files, {n_cards} cards, index.json")


if __name__ == "__main__":
    main()
