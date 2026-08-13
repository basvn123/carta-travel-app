"""harvest_wikivoyage_listings.py - See/Do listings as a POI significance signal.

Wikivoyage's See and Do sections are hand-curated shortlists: a human editor
decided these specific sights are what a visitor should know about, and put
the most important ones first. That is exactly the expert corroboration the
pageview/sitelink signals lack (attention is not merit). This harvester pulls,
per destination with a resolved Wikivoyage article (cache/wikivoyage.json):

  * every {{see}} and {{do}} listing template: name, alt, lat/long, wikidata
    QID and its position within the section;
  * the article status class ({{guidecity}}, {{starcity}}, ...) - Star and
    Guide are rare, rigorously reviewed levels, a strong quality signal for
    the destination itself.

Cache-only (cache/wikivoyage_listings.json); score_significance.py matches
listings to items_full offline by QID first, then name core + proximity.
Content licence note: we store listing NAMES/coords/order (facts) and derive
a numeric signal; no prose is copied. Wikivoyage is CC BY-SA and is already
credited in the app footer.

Usage:
    python harvest_wikivoyage_listings.py            # all unresolved dests
    python harvest_wikivoyage_listings.py --limit 40
    python harvest_wikivoyage_listings.py --force    # refetch everything
"""
import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from pipeline_io import atomic_write_json, load_json

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
WV_CACHE = ROOT / "cache" / "wikivoyage.json"
CACHE = ROOT / "cache" / "wikivoyage_listings.json"

API = "https://en.wikivoyage.org/w/api.php"
UA = {"User-Agent": "CartaTravelApp/1.0 (portfolio project; "
                    "data@carta-europetravel.com)"}
DELAY_S = 0.6
RETRIES = 5
TIMEOUT_S = 60
CHECKPOINT_EVERY = 25

STATUS_RE = re.compile(
    r"\{\{\s*(outline|usable|guide|star)"
    r"(city|district|region|park|topic|itinerary|diveguide|airport)\b",
    re.IGNORECASE)
LISTING_OPEN_RE = re.compile(r"\{\{\s*(see|do)\s*\|", re.IGNORECASE)


def _get(params):
    url = API + "?" + urllib.parse.urlencode(params)
    last = None
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            last = e
            time.sleep(2 ** attempt * 2)
    print(f"    ! giving up: {last}")
    return None


def template_spans(text):
    """Yield (kind, body) for every top-level {{see|...}} / {{do|...}}."""
    for m in LISTING_OPEN_RE.finditer(text):
        start = m.start()
        depth = 0
        i = start
        n = len(text)
        while i < n - 1:
            two = text[i:i + 2]
            if two == "{{":
                depth += 1
                i += 2
            elif two == "}}":
                depth -= 1
                i += 2
                if depth == 0:
                    yield m.group(1).lower(), text[start + 2:i - 2]
                    break
            else:
                i += 1


def split_top_level(body):
    """Split a template body on pipes not nested in {{ }} or [[ ]]."""
    parts, buf, depth = [], [], 0
    i, n = 0, len(body)
    while i < n:
        two = body[i:i + 2]
        if two in ("{{", "[["):
            depth += 1
            buf.append(two)
            i += 2
        elif two in ("}}", "]]"):
            depth = max(0, depth - 1)
            buf.append(two)
            i += 2
        elif body[i] == "|" and depth == 0:
            parts.append("".join(buf))
            buf = []
            i += 1
        else:
            buf.append(body[i])
            i += 1
    parts.append("".join(buf))
    return parts


def parse_listing(kind, body, order):
    rec = {"type": kind, "order": order}
    for part in split_top_level(body)[1:]:
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        k, v = k.strip().lower(), v.strip()
        if not v:
            continue
        if k == "name":
            rec["name"] = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1",
                                 v).strip("'\" ")
        elif k == "alt":
            rec["alt"] = v
        elif k == "wikidata":
            rec["qid"] = v
        elif k in ("lat", "long"):
            try:
                rec["lat" if k == "lat" else "lon"] = float(v)
            except ValueError:
                pass
    return rec if rec.get("name") else None


def harvest_article(title):
    """-> dict on success, "gone" when the page truly has no content,
    None on network failure (NOT cached, so a rerun retries it)."""
    d = _get({"action": "parse", "page": title, "prop": "wikitext",
              "format": "json", "redirects": 1})
    if d is None:
        return None
    if "parse" not in d:
        return "gone"
    text = ((d["parse"].get("wikitext") or {}).get("*")) or ""
    status = None
    m = STATUS_RE.search(text)
    if m:
        status = m.group(1).lower()
    listings = []
    for order, (kind, body) in enumerate(template_spans(text)):
        rec = parse_listing(kind, body, order)
        if rec:
            listings.append(rec)
    return {"status": status, "listings": listings}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    wv = load_json(WV_CACHE)
    cache = {} if args.force else load_json(CACHE)
    todo = []
    for did, rec in wv.items():
        if rec.get("miss") or not rec.get("title"):
            continue
        if did in cache:
            continue
        todo.append((did, rec["title"]))
    if args.limit:
        todo = todo[:args.limit]
    print(f"{len(todo)} Wikivoyage articles to parse ({len(cache)} cached)")

    done = 0
    for did, title in todo:
        time.sleep(DELAY_S)
        res = harvest_article(title)
        if res is None:
            continue                      # network failure: retry next run
        if res == "gone":
            cache[did] = {"miss": True}
        else:
            cache[did] = {"title": title, **res}
        done += 1
        if done % CHECKPOINT_EVERY == 0:
            atomic_write_json(CACHE, cache, indent=None,
                              separators=(",", ":"))
            n_list = sum(len(v.get("listings") or []) for v in cache.values())
            print(f"    {done}/{len(todo)} articles, {n_list} listings")
    atomic_write_json(CACHE, cache, indent=None, separators=(",", ":"))
    n_list = sum(len(v.get("listings") or []) for v in cache.values())
    n_status = sum(1 for v in cache.values() if v.get("status"))
    print(f"done: {len(cache)} articles cached, {n_list} listings, "
          f"{n_status} with a status class")


if __name__ == "__main__":
    main()
