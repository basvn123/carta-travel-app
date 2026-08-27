"""Remove references to Commons files that no longer exist.

Files get deleted from Commons after we have stored them: a licence review
concludes, a duplicate is merged, an uploader withdraws. What is left behind
is a URL that answers 404, which in the app is a blank card, and nothing
upstream ever notices because every stored field still looks perfectly valid.
The HTTP probe in audit_all.py is what finds them, and this is what clears
them out.

Deliberately conservative. A 404 can also mean a bad thumbnail width or a
transient error, so nothing is removed on the strength of the probe alone:
every candidate is confirmed against the Commons API first, and only files the
API reports as `missing` are touched. Confirmed-dead URLs are then nulled
wherever they are stored, including cache/trips (which the trips wire is
written FROM, so clearing only the wire would let the next export put them
back). Nulled rather than replaced: the app's fallback chains already handle a
missing picture, and choosing a substitute here would be guessing at a layer
that has no idea what the place looks like.

Usage, from the repo root:
    python pipeline/images/drop_dead_files.py --from-audit --dry-run
    python pipeline/images/drop_dead_files.py --from-audit
    python pipeline/images/drop_dead_files.py --files "File:Foo.jpg,File:Bar.jpg"
"""

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

from checks import file_title  # noqa: E402

REPORT = ROOT / "data" / "reports" / "image_audit.json"
API = "https://commons.wikimedia.org/w/api.php"
UA = "CartaImageAudit/1.0 (dead file sweep; run from the Carta pipeline)"

TARGETS = [
    ROOT / "app_data" / "app_data.json",
    ROOT / "continent-app" / "public" / "app_data.json",
]
SCAN_DIRS = [
    ROOT / "cache" / "trips",
    ROOT / "continent-app" / "public" / "trips",
    ROOT / "continent-app" / "public" / "trips" / "trip",
]


def api_titles(titles):
    """{title: exists?} in batches of 50."""
    out = {}
    titles = sorted(set(titles))
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        url = (API + "?action=query&format=json&formatversion=2"
               "&prop=imageinfo&iiprop=url&titles="
               + urllib.parse.quote("|".join(chunk)))
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                pages = json.load(resp)["query"]["pages"]
        except Exception as exc:  # noqa: BLE001
            print("  API call failed, treating the batch as alive: %s"
                  % str(exc)[:90])
            for t in chunk:
                out[t] = True
            continue
        for page in pages:
            out[page.get("title")] = not page.get("missing")
        time.sleep(0.4)
    return out


def title_of(url):
    name = file_title(url)
    if not name:
        return None
    return "File:" + urllib.parse.unquote(name).replace("_", " ")


def collect_candidates(urls):
    return {t for t in (title_of(u) for u in urls) if t}


def scan_files():
    files = [p for p in TARGETS if p.exists()]
    for folder in SCAN_DIRS:
        if folder.is_dir():
            files += sorted(folder.glob("*.json"))
    return files


def scrub(node, dead_titles):
    """Null every string field pointing at a dead file."""
    n = 0
    if isinstance(node, dict):
        for key in list(node.keys()):
            val = node[key]
            if isinstance(val, str) and "wikimedia.org" in val:
                t = title_of(val)
                if t and t in dead_titles:
                    node[key] = None
                    n += 1
                    continue
            n += scrub(val, dead_titles)
    elif isinstance(node, list):
        for item in node:
            n += scrub(item, dead_titles)
    return n


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--from-audit", action="store_true",
                    help="take the candidates from the last image audit's "
                         "probe failures")
    ap.add_argument("--files", default="",
                    help="comma separated File: titles to check as well")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    candidates = set()
    if args.from_audit:
        if not REPORT.exists():
            ap.error("no %s; run audit_all.py --probe N first" % REPORT)
        report = json.loads(REPORT.read_text(encoding="utf-8"))
        candidates |= collect_candidates(
            f.get("url") for f in report.get("probe_failures") or [])
    for raw in args.files.split(","):
        raw = raw.strip()
        if raw:
            candidates.add(raw if raw.startswith("File:") else "File:" + raw)
    if not candidates:
        print("nothing to check")
        return

    print("checking %d file(s) against Commons" % len(candidates))
    alive = api_titles(candidates)
    dead = {t for t in candidates if alive.get(t) is False}
    for t in sorted(candidates):
        print("  %-9s %s" % ("DEAD" if t in dead else "alive", t))
    if not dead:
        print("nothing to remove")
        return
    if args.dry_run:
        print("[dry run] would null references to %d file(s)" % len(dead))
        return

    total = 0
    for path in scan_files():
        text = path.read_text(encoding="utf-8")
        if not any(urllib.parse.quote(t[5:].replace(" ", "_")) in text
                   or t[5:].replace(" ", "_") in text for t in dead):
            continue
        data = json.loads(text)
        n = scrub(data, dead)
        if n:
            tmp = path.with_suffix(".tmp")
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
            tmp.replace(path)
            print("  %-52s %d" % (path.name, n))
            total += n
    print("nulled %d reference(s); re-export the layers that hold them"
          % total)


if __name__ == "__main__":
    main()
