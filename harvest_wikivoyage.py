"""harvest_wikivoyage.py - narrative travel-guide blurbs from Wikivoyage.

Wikivoyage is the human-curated open travel guide (CC BY-SA). Its lead section
is a warm, tourist-facing "why go here" paragraph that the app's Wikipedia /
OSM-derived text does not have. This harvester pulls the intro extract for every
destination and caches it; apply_wikivoyage.py folds it into the dataset later.

Cache-only by design (writes only cache/wikivoyage.json, never app_data.json) so
it is safe to run alongside the apply_* layer scripts and the other harvesters.
Idempotent + resumable: destinations already resolved (hit or confirmed miss)
are skipped, so a rate-limited run just needs re-running to finish.

Method:
  * Batched primary pass - up to TITLES_PER_REQ destination names per API call
    (prop=extracts|coordinates, exintro, explaintext, redirects), mapping each
    input title back through the normalized/redirect chains to its page.
  * A page is accepted only if it has a real extract AND (no coordinates, or its
    coordinates are within COORD_TOL_KM of our centre) - this rejects wrong-city
    and disambiguation hits. Rejected/absent titles are recorded as misses.
  * A miss falls back to opensearch to find the most likely article, which is
    then re-fetched and coordinate-checked the same way.

Per hit we cache, keyed by destination id:
    {"title","url","extract","coord":[lat,lon]|None,"source":"wikivoyage"}
A confirmed miss caches {"miss": true} so it is not retried every run.

Wikimedia throttles shared IPs hard (HTTP 429); requests retry with backoff and
a global cooldown. ASCII-clean, no em dashes, per project style.

Usage:
    python harvest_wikivoyage.py             # every unresolved destination
    python harvest_wikivoyage.py --limit 40  # pilot: first 40 unresolved
    python harvest_wikivoyage.py --force     # re-resolve everything
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from math import radians, sin, cos, asin, sqrt
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "app_data" / "app_data.json"
CACHE = ROOT / "cache" / "wikivoyage.json"

API = "https://en.wikivoyage.org/w/api.php"
UA = {"User-Agent": "CartaTravelApp/1.0 (portfolio project; bas.vannieuwenhuyse123@gmail.com)"}

TITLES_PER_REQ = 20              # MediaWiki extracts cap with exlimit=max
COORD_TOL_KM = 90.0             # accept a guide whose centre is within this range
MAX_EXTRACT = 800              # keep app_data lean; trim overly long intros
CHECKPOINT_EVERY = 5           # batches between cache writes
RETRIES = 5
TIMEOUT_S = 45


def _load(p):
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _haversine(a, b):
    R = 6371.0
    p1, p2 = radians(a[0]), radians(b[0])
    dphi = radians(b[0] - a[0]); dl = radians(b[1] - a[1])
    h = sin(dphi / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2
    return 2 * R * asin(sqrt(h))


def _get(params):
    """One GET with retry/backoff through Wikimedia's 429 throttling."""
    params = {**params, "format": "json", "formatversion": "2"}
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 30 * (attempt + 1)
                print(f"    HTTP 429; cooling down {wait}s "
                      f"(attempt {attempt + 1}/{RETRIES})...")
                time.sleep(wait); continue
            if e.code in (500, 502, 503) and attempt < RETRIES - 1:
                time.sleep(5 * (attempt + 1)); continue
            return None
        except (urllib.error.URLError, TimeoutError):
            if attempt < RETRIES - 1:
                time.sleep(5 * (attempt + 1)); continue
            return None
    return None


def _trim(text):
    text = (text or "").strip()
    if len(text) <= MAX_EXTRACT:
        return text
    cut = text[:MAX_EXTRACT]
    dot = cut.rfind(". ")
    return (cut[:dot + 1] if dot > 400 else cut).strip()


def _page_record(page, want_coord):
    """Turn an API page into a cache record if it is a real, on-location guide."""
    extract = page.get("extract")
    if not extract or len(extract.strip()) < 40:
        return None
    coords = page.get("coordinates") or []
    coord = None
    if coords:
        coord = [coords[0]["lat"], coords[0]["lon"]]
        if want_coord and _haversine(coord, want_coord) > COORD_TOL_KM:
            return None            # right name, wrong place
    title = page["title"]
    return {
        "title": title,
        "url": "https://en.wikivoyage.org/wiki/" + urllib.parse.quote(title.replace(" ", "_")),
        "extract": _trim(extract),
        "coord": coord,
        "source": "wikivoyage",
    }


def _resolve_map(query):
    """input title -> final page title, following normalized then redirect hops."""
    step = {}
    for n in query.get("normalized", []):
        step[n["from"]] = n["to"]
    for r in query.get("redirects", []):
        step[r["from"]] = r["to"]

    def final(t):
        seen = set()
        while t in step and t not in seen:
            seen.add(t); t = step[t]
        return t
    return final


def batch_lookup(titles):
    """titles -> {input_title: page_dict or None}. page_dict has extract/coords."""
    data = _get({
        "action": "query",
        "prop": "extracts|coordinates",
        "exintro": "1", "explaintext": "1", "exlimit": "max",
        "redirects": "1",
        "titles": "|".join(titles),
    })
    if not data or "query" not in data:
        return {t: None for t in titles}
    query = data["query"]
    final = _resolve_map(query)
    by_title = {p["title"]: p for p in query.get("pages", []) if "missing" not in p}
    return {t: by_title.get(final(t)) for t in titles}


def opensearch(name):
    """Best-guess article title for a name that missed the direct lookup."""
    data = _get({"action": "opensearch", "search": name, "limit": "1", "namespace": "0"})
    if isinstance(data, list) and len(data) >= 2 and data[1]:
        return data[1][0]
    return None


def fetch_single(title, want_coord):
    res = batch_lookup([title])
    page = res.get(title)
    return _page_record(page, want_coord) if page else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="only N unresolved dests")
    ap.add_argument("--force", action="store_true", help="re-resolve everything")
    args = ap.parse_args()

    data = json.loads(DATA.read_text(encoding="utf-8"))
    cache = {} if args.force else _load(CACHE)

    todo = []
    for did, d in data["destinations"].items():
        if did in cache:
            continue
        name = (d.get("city") or d.get("name") or "").strip()
        if not name:
            continue
        lat = d.get("city_lat") or d.get("lat")
        lon = d.get("city_lon") or d.get("lon")
        want = [lat, lon] if lat is not None and lon is not None else None
        todo.append((did, name, want))
    if args.limit:
        todo = todo[:args.limit]

    print(f"[wikivoyage] {len(todo)} destinations to resolve "
          f"({len(cache)} already cached)")

    hits = misses = 0
    for bi in range(0, len(todo), TITLES_PER_REQ):
        batch = todo[bi:bi + TITLES_PER_REQ]
        want_by_name = {}
        for _, name, want in batch:
            want_by_name.setdefault(name, want)
        pages = batch_lookup([name for _, name, _ in batch])

        for did, name, want in batch:
            rec = _page_record(pages.get(name), want) if pages.get(name) else None
            if rec is None:
                # fallback: search for a better title, then verify
                alt = opensearch(name)
                if alt and alt.lower() != name.lower():
                    rec = fetch_single(alt, want)
            if rec:
                cache[did] = rec; hits += 1
            else:
                cache[did] = {"miss": True}; misses += 1

        if (bi // TITLES_PER_REQ) % CHECKPOINT_EVERY == 0:
            CACHE.parent.mkdir(exist_ok=True)
            CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
            print(f"    {bi + len(batch)}/{len(todo)} done "
                  f"({hits} hits, {misses} misses this run)")
        time.sleep(1.0)            # be gentle on the shared-IP rate limit

    CACHE.parent.mkdir(exist_ok=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    total_hits = sum(1 for v in cache.values() if not v.get("miss"))
    print(f"[wikivoyage] done: {hits} new hits, {misses} new misses; "
          f"{total_hits} guides cached total -> cache/{CACHE.name}")


if __name__ == "__main__":
    main()
