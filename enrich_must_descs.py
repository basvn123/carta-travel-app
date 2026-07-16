"""
enrich_must_descs.py - upgrade the description (and fill missing images) of
every POI the app SHOWS as a top pick: the "Must see" tier, plus the far
"Worth the detour" sights (20-90 km, score >= 3.4).

Why: item.desc was the first Wikipedia sentence trimmed to 160 chars, which
reads generic ("Square and UNESCO World Heritage Site in Brussels, Belgium").
Travellers asked for specific, substantive text on every must-see. This pass
re-fetches the ENGLISH Wikipedia summary for each surfaced POI and stores the
first 1-2 sentences (up to ~340 chars, whole sentences only), preferring the
en edition via langlinks when the harvested article is a local edition.
It also fills `img` (640px lead thumbnail) and `wiki` when missing.

Selection mirrors continent-app/src/planner/dayDraft.js EXACTLY:
  poiScore = rate + 0.6*heritage + 0.35*wiki + 0.15*img + min(1, log10(pop+1)/3.3)
  must tier = rate>=3 sights ranked by score, top min(8, max(3, round(n*0.18)))
  far worthy = non-active, 20 < km <= 90 from the city centre, score >= 3.4

Politeness: same UA/backoff as enrich_activities.py, <= 8 workers.
Resumable: app_data/must_desc_cache.json (keyed destId||name), incremental.

Run:  python enrich_must_descs.py          # fetch (resumes) then apply
      python enrich_must_descs.py apply    # only write cache -> app_data.json
      python enrich_must_descs.py stats    # coverage report, no network
ASCII-clean per project convention.
"""
import json
import math
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).parent
DATA = ROOT / "app_data" / "app_data.json"
CACHE = ROOT / "app_data" / "must_desc_cache.json"

UA = ("CartaTravelApp-enrich/1.0 "
      "(https://github.com/basvn123; contact: bas.vannieuwenhuyse123@gmail.com)")
HEADERS = {"User-Agent": UA, "Accept": "application/json"}

DESC_MAX = 340
THUMB_PX = 640
MAX_WORKERS = 8
WIKI_MATCH_KM = 30
MAX_POI_KM_FROM_CITY = 20
FAR_POI_MAX_KM = 90
SAVE_EVERY = 100

_cache_lock = threading.Lock()
_dirty = 0


# ---------------------------------------------------------------------------
# plumbing
# ---------------------------------------------------------------------------
def get_json(url):
    delays = [0, 5, 15, 45]
    for dl in delays:
        if dl:
            time.sleep(dl)
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {"_404": True}
            if e.code == 429 or e.code >= 500:
                ra = e.headers.get("Retry-After")
                if ra:
                    try:
                        time.sleep(min(float(ra), 90))
                    except ValueError:
                        pass
                continue
            return None
        except Exception:
            continue
    return None


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def load_cache():
    if CACHE.exists():
        return json.loads(CACHE.read_text(encoding="utf-8"))
    return {}


def save_cache(cache):
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")


# ---------------------------------------------------------------------------
# selection: mirror dayDraft.js
# ---------------------------------------------------------------------------
def poi_score(it):
    s = it.get("rate") or 0
    if it.get("heritage"):
        s += 0.6
    if it.get("wiki"):
        s += 0.35
    if it.get("img"):
        s += 0.15
    p = it.get("pop") or 0
    if isinstance(p, (int, float)) and p > 0:
        s += min(1.0, math.log10(p + 1) / 3.3)
    return s


def city_coords(dest):
    lat = dest.get("city_lat", dest.get("lat"))
    lon = dest.get("city_lon", dest.get("lon"))
    return lat, lon


def surfaced_pois(dest):
    """The POIs the app shows as top picks: must tier + far worthy."""
    items = (dest.get("activities") or {}).get("items_full") or []
    sights = [it for it in items if not it.get("active")]
    out = []
    if sights and any(it.get("rate") is not None for it in sights):
        ranked = sorted(sights, key=poi_score, reverse=True)
        must_n = min(8, max(3, round(len(sights) * 0.18)))
        out.extend([it for it in ranked if (it.get("rate") or 0) >= 3][:must_n])
    else:
        out.extend(sights[:6])
    clat, clon = city_coords(dest)
    if clat is not None:
        for it in sights:
            if it in out or it.get("lat") is None:
                continue
            km = haversine_km(clat, clon, it["lat"], it["lon"])
            if MAX_POI_KM_FROM_CITY < km <= FAR_POI_MAX_KM \
                    and (poi_score(it) >= 3.4 or (it.get("rate") or 0) >= 3):
                out.append(it)
    return out


# ---------------------------------------------------------------------------
# wiki summary resolution (English first)
# ---------------------------------------------------------------------------
def parse_wiki_url(url):
    m = re.match(r"https?://([a-z\-]+)\.(?:m\.)?wikipedia\.org/wiki/(.+)$", url or "")
    if not m:
        return None, None
    return m.group(1), urllib.parse.unquote(m.group(2))


def en_title_via_langlinks(lang, title):
    url = (f"https://{lang}.wikipedia.org/w/api.php?action=query&format=json"
           f"&prop=langlinks&lllang=en&redirects=1&titles={urllib.parse.quote(title)}")
    data = get_json(url)
    if not data or "_404" in data:
        return None
    pages = (data.get("query") or {}).get("pages") or {}
    for p in pages.values():
        for ll in p.get("langlinks") or []:
            if ll.get("lang") == "en":
                return ll.get("*") or ll.get("title")
    return None


def rest_summary(lang, title):
    url = (f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/"
           f"{urllib.parse.quote(title.replace(' ', '_'))}")
    data = get_json(url)
    if not data or data.get("_404") or data.get("type", "").endswith("not_found"):
        return None
    return data


def en_search(name, city):
    q = urllib.parse.quote(f"{name} {city}")
    url = (f"https://en.wikipedia.org/w/api.php?action=query&format=json&list=search"
           f"&srlimit=1&srsearch={q}")
    data = get_json(url)
    if not data or "_404" in data:
        return None
    hits = ((data.get("query") or {}).get("search")) or []
    return hits[0]["title"] if hits else None


# Common abbreviations that end with '.' but do NOT end a sentence.
_ABBR = r"(?<!\bSt)(?<!\bMt)(?<!\bDr)(?<!\bMr)(?<!\bMrs)(?<!\bNo)(?<!\bc)(?<!\bca)(?<!\bkm)(?<!\bft)"
_SENT_SPLIT = re.compile(_ABBR + r"(?<=[.!?])\s+(?=[A-Z0-9À-ſ])")


def two_sentences(extract):
    """First 1-2 whole sentences of the intro, capped at DESC_MAX chars."""
    text = re.sub(r"\s+", " ", (extract or "").strip())
    if not text:
        return ""
    parts = _SENT_SPLIT.split(text)
    out = parts[0].strip()
    if len(parts) > 1 and len(out) + 1 + len(parts[1]) <= DESC_MAX:
        out = f"{out} {parts[1].strip()}"
    if len(out) > DESC_MAX:
        cut = out[:DESC_MAX]
        cut = cut[: cut.rfind(" ")] if " " in cut else cut
        out = cut.rstrip(",;: ") + "..."
    return out


def scaled_thumb(summary):
    thumb = (summary or {}).get("thumbnail") or {}
    src = thumb.get("source")
    if not src:
        return None
    return re.sub(r"/(\d+)px-", f"/{THUMB_PX}px-", src)


def resolve(it, dest):
    """Return {desc, img, wiki} best-effort English card for one POI."""
    lang, title = parse_wiki_url(it.get("wiki"))
    summary = None
    if lang == "en" and title:
        summary = rest_summary("en", title)
    elif lang and title:
        en_t = en_title_via_langlinks(lang, title)
        if en_t:
            summary = rest_summary("en", en_t)
        if summary is None:
            # Keep the local-edition thumbnail at least; skip desc (wrong lang).
            local = rest_summary(lang, title)
            if local:
                return {"img": scaled_thumb(local), "wiki": it.get("wiki")}
    else:
        found = en_search(it.get("name") or "", dest.get("city") or "")
        if found:
            cand = rest_summary("en", found)
            if cand:
                co = cand.get("coordinates") or {}
                plat, plon = it.get("lat"), it.get("lon")
                ok = True
                if co and plat is not None:
                    ok = haversine_km(co.get("lat"), co.get("lon"), plat, plon) <= WIKI_MATCH_KM
                if ok:
                    summary = cand
    if not summary:
        return None
    desc = two_sentences(summary.get("extract"))
    return {
        "desc": desc or None,
        "img": scaled_thumb(summary),
        "wiki": (summary.get("content_urls") or {}).get("desktop", {}).get("page") or it.get("wiki"),
    }


# ---------------------------------------------------------------------------
# main phases
# ---------------------------------------------------------------------------
def collect_targets(data):
    targets = []
    for dest_id, dest in data["destinations"].items():
        for it in surfaced_pois(dest):
            targets.append((dest_id, dest, it))
    return targets


def fetch_all(data, cache):
    global _dirty
    targets = collect_targets(data)
    todo = [(d_id, dest, it) for d_id, dest, it in targets
            if f"{d_id}||{it.get('name')}" not in cache]
    print(f"surfaced POIs: {len(targets)}, to fetch: {len(todo)}")

    def work(entry):
        d_id, dest, it = entry
        key = f"{d_id}||{it.get('name')}"
        time.sleep(0.05)
        card = resolve(it, dest)
        return key, (card or {"_miss": True})

    done = 0
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = [ex.submit(work, e) for e in todo]
        for fut in as_completed(futures):
            key, card = fut.result()
            with _cache_lock:
                cache[key] = card
                _dirty += 1
                done += 1
                if _dirty >= SAVE_EVERY:
                    save_cache(cache)
                    _dirty = 0
            if done % 250 == 0:
                print(f"  {done}/{len(todo)} fetched")
    save_cache(cache)
    print(f"fetch complete: {len(todo)} new, cache {len(cache)} entries")


def apply_cache(data, cache):
    upgraded_desc = filled_img = filled_wiki = 0
    for dest_id, dest in data["destinations"].items():
        items = (dest.get("activities") or {}).get("items_full") or []
        by_name = {it.get("name"): it for it in items}
        for it in surfaced_pois(dest):
            card = cache.get(f"{dest_id}||{it.get('name')}")
            if not card or card.get("_miss"):
                continue
            target = by_name.get(it.get("name"))
            if target is None:
                continue
            new_desc = card.get("desc")
            # Only replace when the new text is meaningfully richer.
            if new_desc and len(new_desc) > len(target.get("desc") or "") + 20:
                target["desc"] = new_desc
                upgraded_desc += 1
            elif new_desc and not target.get("desc"):
                target["desc"] = new_desc
                upgraded_desc += 1
            if card.get("img") and not target.get("img"):
                target["img"] = card["img"]
                filled_img += 1
            if card.get("wiki") and not target.get("wiki"):
                target["wiki"] = card["wiki"]
                filled_wiki += 1
    DATA.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(f"applied: {upgraded_desc} descriptions upgraded, "
          f"{filled_img} images filled, {filled_wiki} wiki links filled")


def stats(data):
    targets = collect_targets(data)
    n = len(targets)
    with_desc = sum(1 for _, _, it in targets if it.get("desc"))
    rich = sum(1 for _, _, it in targets if len(it.get("desc") or "") >= 180)
    with_img = sum(1 for _, _, it in targets if it.get("img"))
    with_wiki = sum(1 for _, _, it in targets if it.get("wiki"))
    print(f"surfaced POIs: {n}")
    print(f"  desc: {with_desc} ({100*with_desc//max(1,n)}%), rich(>=180ch): {rich}")
    print(f"  img:  {with_img} ({100*with_img//max(1,n)}%)")
    print(f"  wiki: {with_wiki} ({100*with_wiki//max(1,n)}%)")


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "run"
    data = json.loads(DATA.read_text(encoding="utf-8"))
    if mode == "stats":
        stats(data)
        return
    cache = load_cache()
    if mode != "apply":
        fetch_all(data, cache)
    apply_cache(data, cache)


if __name__ == "__main__":
    main()
