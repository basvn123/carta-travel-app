"""Audit every image the app ships, across every layer at once.

Each vertical already polices itself at export time (beaches will not publish
without evidenced photographs, trails carry their licence CHECK constraint in
the database), but nothing ever looked across the whole shop window: the same
checks with the same thresholds over destinations, explore features, beaches,
lakes, mountains, trips and trails, plus the things only a cross layer pass
can see, like one Commons file standing for two places 400 km apart, or a
country whose tab cover went missing.

This audit reads the published wires under continent-app/public, so it judges
exactly what a traveller receives, not the master. It is read only: it writes
a report and a contact sheet, never a wire. Fixing what it finds stays the job
of each layer's own harvester and exporter.

Checks per image (pipeline/images/checks.py):
  URL shape      https, known host, no query string, a thumbnail width
                 Wikimedia will actually render, no SVG or Special:FilePath
  frame fit      stored dimensions against the exact card frame the CSS crops
                 into, with the crop survival cut points the app already uses
  size floor     per layer minimum dimensions
  contract       licence / credit / evidence fields the layer promises
Checks per entry and per layer:
  coverage       entries with no image at all (trails borrow a nearby town's
                 hero in the app; the borrow is counted, not hidden)
  covers         every country in a tab index carries a cover picture
  duplicates     one Commons file fronting entries more than 30 km apart

Usage, from the repo root:
    python pipeline/images/audit_all.py
    python pipeline/images/audit_all.py --layers beaches,lakes --verbose
    python pipeline/images/audit_all.py --details          # trip/trail detail pages too
    python pipeline/images/audit_all.py --probe 40         # HTTP check a sample
    python pipeline/images/audit_all.py --strict           # exit 1 on hard flags

Writes:
    data/reports/image_audit.json
    data/reports/image_audit_sheet.html   (flagged entries, eyeballable)
"""

import argparse
import json
import math
import random
import re
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from checks import SPECS, check_image, file_title, hard, soft  # noqa: E402

ROOT = HERE.parents[1]
PUB = ROOT / "continent-app" / "public"
REPORT = ROOT / "data" / "reports" / "image_audit.json"
SHEET = ROOT / "data" / "reports" / "image_audit_sheet.html"

DUPE_KM = 30.0
SHEET_MAX = 400
UA = "CartaImageAudit/1.0 (data quality audit; run from the Carta pipeline)"


def _km(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = (0.5 - math.cos((lat2 - lat1) * p) / 2
         + math.cos(lat1 * p) * math.cos(lat2 * p)
         * (1 - math.cos((lon2 - lon1) * p)) / 2)
    return 12742 * math.asin(math.sqrt(a))


def _load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _cc_files(folder):
    """The per country wires of one layer, index and top files excluded."""
    if not folder.is_dir():
        return []
    return sorted(p for p in folder.glob("*.json")
                  if re.fullmatch(r"[A-Z]{2}", p.stem))


# Every adapter yields one record per published entry:
#   {id, name, cc, lat, lon, images: [dict, ...]}
# with image dicts left in their native wire shape; checks.py reads both the
# url/u and licence key spellings.

def iter_destinations():
    data = _load(PUB / "app_data.json")
    for did, d in data.get("destinations", {}).items():
        img = d.get("image")
        yield {
            "id": did,
            "name": d.get("city") or d.get("name") or did,
            "cc": d.get("cc") or d.get("iso2") or "",
            "lat": d.get("city_lat") or d.get("lat"),
            "lon": d.get("city_lon") or d.get("lon"),
            "images": [img] if img and img.get("url") else [],
        }


def iter_features():
    # A feature's rendered URL is image.thumb (a real upload.wikimedia
    # thumbnail); image.url is the Special:FilePath original kept as a
    # pointer. Audit what the app draws.
    for path in _cc_files(PUB / "features"):
        for f in _load(path).get("features", []):
            img = f.get("image")
            shown = None
            if img and (img.get("thumb") or img.get("url")):
                shown = dict(img, url=img.get("thumb") or img.get("url"))
            yield {
                "id": f.get("id") or f.get("qid") or f.get("name"),
                "name": f.get("name"),
                "cc": path.stem,
                "lat": f.get("lat"), "lon": f.get("lon"),
                "images": [shown] if shown else [],
            }


def _iter_vertical(layer):
    for path in _cc_files(PUB / layer):
        for row in _load(path).get(layer, []):
            yield {
                "id": row.get("id") or row.get("qid") or row.get("name"),
                "name": row.get("name"),
                "cc": path.stem,
                "lat": row.get("lat"), "lon": row.get("lon"),
                "images": list(row.get("images") or []),
            }


def iter_trips(details=False):
    for path in _cc_files(PUB / "trips"):
        for t in _load(path).get("trips", []):
            img = t.get("img")
            yield {
                "id": t.get("id"),
                "name": (t.get("img") or {}).get("city") or t.get("id"),
                "cc": path.stem,
                "lat": t.get("lat"), "lon": t.get("lon"),
                "images": [img] if img and img.get("url") else [],
            }
    if not details:
        return
    for path in sorted((PUB / "trips" / "trip").glob("*.json")):
        d = _load(path)
        imgs = []
        if d.get("hero"):
            imgs.append(d["hero"])
        imgs += [g for g in d.get("gallery") or [] if g]
        for s in d.get("stops") or []:
            if s.get("img"):
                imgs.append({"url": s["img"], "credit": s.get("img_credit"),
                             "page": s.get("img_page")})
        for t in d.get("daytrips") or []:
            if t.get("img"):
                imgs.append({"url": t["img"],
                             "credit": t.get("img_credit") or t.get("city")})
        # The trips "credit" is a caption, not a licence line; gallery items
        # sourced from POI highlights carry it as "name" instead.
        for img in imgs:
            if not img.get("credit"):
                img["credit"] = img.get("name") or img.get("city")
        yield {"id": "detail:" + path.stem, "name": path.stem, "cc": "",
               "lat": d.get("lat"), "lon": d.get("lon"), "images": imgs}


def iter_trails(details=False):
    for path in _cc_files(PUB / "trails"):
        for t in _load(path).get("trips", []):
            img = t.get("img")
            yield {
                "id": t.get("id"),
                "name": t.get("name"),
                "cc": path.stem,
                "lat": t.get("lat"), "lon": t.get("lon"),
                "images": [img] if img and img.get("u") else [],
            }
    if not details:
        return
    for path in sorted((PUB / "trails" / "trip").glob("*.json")):
        d = _load(path)
        yield {"id": "detail:" + path.stem, "name": d.get("name") or path.stem,
               "cc": d.get("cc") or "", "lat": d.get("lat"),
               "lon": d.get("lon"), "images": list(d.get("images") or [])}


LAYERS = {
    "destinations": iter_destinations,
    "features": iter_features,
    "beaches": lambda: _iter_vertical("beaches"),
    "lakes": lambda: _iter_vertical("lakes"),
    "mountains": lambda: _iter_vertical("mountains"),
    "trips": iter_trips,
    "trails": iter_trails,
}

# Tabs whose index.json promises a cover per country.
COVERED_TABS = ("beaches", "lakes", "mountains", "trips")


def hero_dims_index():
    """Trip cards borrow destination heroes but drop their dimensions on the
    way; recover them by file identity so trips get real fit checks too."""
    dims = {}
    try:
        data = _load(PUB / "app_data.json")
    except OSError:
        return dims
    for d in data.get("destinations", {}).values():
        img = d.get("image") or {}
        if img.get("url") and img.get("w") and img.get("h"):
            dims[file_title(img["url"])] = (img["w"], img["h"])
    return dims


def audit_layer(layer, records, dims_index, verbose=False):
    spec = SPECS[layer]
    out = {
        "entries": 0, "images": 0, "no_image": 0,
        "hard": Counter(), "soft": Counter(),
        # The hero is the card. A gallery thumbnail three slots down being
        # small is a blemish on a detail page; the same fault in slot 0 is
        # what every reader sees of the place, so they are counted apart.
        "hero_hard": Counter(), "hero_flagged": 0,
        "flagged": [], "no_image_ids": [],
    }
    titles = defaultdict(list)
    for rec in records:
        out["entries"] += 1
        if not rec["images"]:
            out["no_image"] += 1
            if len(out["no_image_ids"]) < 800:
                out["no_image_ids"].append(rec["id"])
            continue
        rec_flags = []
        for slot, img in enumerate(rec["images"]):
            out["images"] += 1
            if not (img.get("w") and img.get("h")):
                url = img.get("url") or img.get("u") or ""
                wh = dims_index.get(file_title(url))
                if wh:
                    img = dict(img, w=wh[0], h=wh[1])
            flags = check_image(img, spec, slot=slot)
            for f in hard(flags):
                out["hard"][f.split(":", 1)[0]] += 1
                if slot == 0:
                    out["hero_hard"][f.split(":", 1)[0]] += 1
            for f in soft(flags):
                out["soft"][f.split(":", 1)[0]] += 1
            if hard(flags):
                if slot == 0:
                    out["hero_flagged"] += 1
                rec_flags.append({
                    "slot": slot, "flags": flags,
                    "url": img.get("url") or img.get("u"),
                })
            if slot == 0 and rec["lat"] is not None and rec["lon"] is not None:
                t = file_title(img.get("url") or img.get("u"))
                if t:
                    titles[t].append((rec["id"], rec["name"], rec["lat"],
                                      rec["lon"]))
        if rec_flags:
            out["flagged"].append({
                "id": rec["id"], "name": rec["name"], "cc": rec["cc"],
                "images": rec_flags,
            })
            if verbose:
                print("  %-42s %s" % (str(rec["id"])[:42],
                                      rec_flags[0]["flags"]))
    # One file fronting far apart entries inside the layer.
    dupes = []
    for t, users in titles.items():
        if len(users) < 2:
            continue
        far = max(_km(a[2], a[3], b[2], b[3])
                  for i, a in enumerate(users) for b in users[i + 1:])
        if far > DUPE_KM:
            dupes.append({"file": t, "km": round(far, 1),
                          "entries": [{"id": u[0], "name": u[1]}
                                      for u in users]})
    out["dupes"] = sorted(dupes, key=lambda d: -d["km"])
    out["titles"] = titles
    return out


def audit_covers():
    missing = {}
    for tab in COVERED_TABS:
        idx = PUB / tab / "index.json"
        if not idx.exists():
            missing[tab] = ["index.json absent"]
            continue
        rows = _load(idx).get("countries", [])
        bad = [c.get("cc") or "?" for c in rows if not c.get("cover")]
        if bad:
            missing[tab] = bad
    return missing


def cross_layer_dupes(per_layer):
    """The same Commons file fronting entries of different layers is fine
    when they share a shore; over DUPE_KM apart it is a borrowed picture."""
    merged = defaultdict(list)
    for layer, out in per_layer.items():
        for t, users in out["titles"].items():
            for u in users:
                merged[t].append((layer,) + u)
    found = []
    for t, users in merged.items():
        layers = {u[0] for u in users}
        if len(layers) < 2:
            continue
        far = max(_km(a[3], a[4], b[3], b[4])
                  for i, a in enumerate(users) for b in users[i + 1:])
        if far > DUPE_KM:
            found.append({"file": t, "km": round(far, 1),
                          "entries": [{"layer": u[0], "id": u[1],
                                       "name": u[2]} for u in users]})
    return sorted(found, key=lambda d: -d["km"])[:200]


def _probe_one(url):
    """One ranged GET. Returns None when healthy, an error string otherwise,
    or "throttled" for a 429 that survives a retry (a statement about us,
    not about the image)."""
    req = urllib.request.Request(
        url, headers={"User-Agent": UA, "Range": "bytes=0-0"})
    for attempt in (0, 1):
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                ctype = resp.headers.get("Content-Type", "")
                if resp.status not in (200, 206):
                    return "status %s" % resp.status
                if not ctype.startswith("image/"):
                    return "content type %s" % (ctype or "?")
                return None
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt == 0:
                time.sleep(10)
                continue
            return "throttled" if exc.code == 429 else "HTTP %d" % exc.code
        except Exception as exc:  # noqa: BLE001
            return str(exc)[:160]
    return None


def probe(per_layer, n, verbose=False):
    """HTTP check a deterministic sample per layer. A 200 with a text/html
    body is the SPA fallback lying to you, so the content type is the real
    assertion, not the status. upload.wikimedia.org rate limits scripted
    clients hard, hence the ranged GETs, the full second between them and
    the retry before a 429 counts for anything."""
    rng = random.Random(20260825)
    failures = []
    for layer, out in per_layer.items():
        pool = sorted(out["title_url"].items())
        sample = rng.sample(pool, min(n, len(pool)))
        throttled = 0
        for _t, url in sample:
            verdict = _probe_one(url)
            if verdict == "throttled":
                throttled += 1
            elif verdict:
                failures.append({"layer": layer, "url": url,
                                 "error": verdict})
            time.sleep(1.0)
        if verbose or throttled:
            print("probe %-12s %d checked, %d throttled"
                  % (layer, len(sample), throttled))
    return failures


def thumb_250(url):
    return re.sub(r"/\d+px-", "/250px-", str(url or ""), count=1)


def write_sheet(per_layer):
    rows = []
    for layer, out in per_layer.items():
        for rec in out["flagged"][:SHEET_MAX]:
            img = rec["images"][0]
            rows.append(
                "<div class=card><img loading=lazy src='%s'>"
                "<div><b>%s</b> %s <span class=cc>%s</span>"
                "<div class=flags>%s</div></div></div>"
                % (escape(thumb_250(img.get("url"))), escape(layer),
                   escape(str(rec.get("name") or rec["id"])),
                   escape(rec.get("cc") or ""),
                   escape(", ".join(img["flags"]))))
    SHEET.parent.mkdir(parents=True, exist_ok=True)
    head = (
        "<!doctype html><meta charset=utf-8><title>Image audit</title>"
        "<style>body{font:14px system-ui;margin:20px;background:#faf7f2}"
        ".card{display:inline-block;width:270px;margin:6px;vertical-align:top;"
        "background:#fff;border:1px solid #e5ddd0;border-radius:10px;"
        "padding:8px}.card img{width:100%;aspect-ratio:25/12;object-fit:cover;"
        "border-radius:6px}.flags{color:#a4373a;font-size:12px}"
        ".cc{color:#8a8073}</style>"
        "<h1>Flagged images (" + str(len(rows)) + ")</h1>")
    SHEET.write_text(head + "".join(rows), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--layers", default=",".join(LAYERS))
    ap.add_argument("--details", action="store_true",
                    help="include trip and trail detail pages")
    ap.add_argument("--probe", type=int, default=0, metavar="N",
                    help="HTTP check N sampled images per layer")
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    wanted = [l.strip() for l in args.layers.split(",") if l.strip()]
    unknown = [l for l in wanted if l not in LAYERS]
    if unknown:
        ap.error("unknown layers: %s" % ", ".join(unknown))

    dims_index = hero_dims_index()
    per_layer = {}
    for layer in wanted:
        if args.verbose:
            print("== " + layer)
        if layer in ("trips", "trails"):
            records = LAYERS[layer](details=args.details)
        else:
            records = LAYERS[layer]()
        out = audit_layer(layer, records, dims_index, verbose=args.verbose)
        # keep one representative url per file for the probe
        out["title_url"] = {}
        per_layer[layer] = out

    # second cheap walk for probe urls only when probing
    if args.probe:
        for layer in wanted:
            it = (LAYERS[layer](details=args.details)
                  if layer in ("trips", "trails") else LAYERS[layer]())
            tu = per_layer[layer]["title_url"]
            for rec in it:
                for img in rec["images"][:1]:
                    url = img.get("url") or img.get("u")
                    t = file_title(url)
                    if t and t not in tu:
                        tu[t] = url

    covers = audit_covers()
    cross = cross_layer_dupes(per_layer)
    probe_failures = probe(per_layer, args.probe,
                           args.verbose) if args.probe else []

    print("\n%-13s %8s %8s %9s %8s %8s  top hero flags" %
          ("layer", "entries", "images", "no image", "flagged", "HERO bad"))
    total_hard = 0
    total_hero = 0
    for layer in wanted:
        out = per_layer[layer]
        n_flagged = len(out["flagged"])
        total_hard += sum(out["hard"].values())
        total_hero += out["hero_flagged"]
        tops = ", ".join("%s %d" % kv for kv in out["hero_hard"].most_common(3))
        print("%-13s %8d %8d %9d %8d %8d  %s" %
              (layer, out["entries"], out["images"], out["no_image"],
               n_flagged, out["hero_flagged"], tops))
    print("(HERO bad = the picture on the card itself; 'flagged' counts an "
          "entry when any of its pictures, gallery included, has a fault)")
    if covers:
        print("covers missing: " + json.dumps(covers))
    if cross:
        print("%d cross layer duplicate files over %g km" %
              (len(cross), DUPE_KM))
    if probe_failures:
        print("%d probe failures" % len(probe_failures))

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "details_included": bool(args.details),
        "layers": {
            layer: {
                "entries": out["entries"], "images": out["images"],
                "no_image": out["no_image"],
                "no_image_ids": out["no_image_ids"],
                "hero_flagged": out["hero_flagged"],
                "hero_flags": dict(out["hero_hard"]),
                "hard_flags": dict(out["hard"]),
                "soft_flags": dict(out["soft"]),
                "flagged": out["flagged"][:2000],
                "dupes": out["dupes"][:200],
            } for layer, out in per_layer.items()
        },
        "covers_missing": covers,
        "cross_layer_dupes": cross,
        "probe_failures": probe_failures,
    }
    REPORT.write_text(json.dumps(payload, ensure_ascii=False, indent=1),
                      encoding="utf-8")
    write_sheet(per_layer)
    print("report  %s\nsheet   %s" % (REPORT, SHEET))

    if args.strict and (total_hard or covers or probe_failures):
        sys.exit(1)


if __name__ == "__main__":
    main()
