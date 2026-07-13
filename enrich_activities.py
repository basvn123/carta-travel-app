"""
enrich_activities.py - fill img/desc/wiki gaps in destinations[*].activities
.items_full and add `pop` (avg daily Wikipedia pageviews, last 12 months) to
every item with a resolved article.

Resolution order per POI (mirrors harvest_activities.py's local-language
fallback):
  0. Items that already have a `wiki` URL but miss img/desc: re-fetch the card
     straight from that article (its own language edition).
  1. en.wikipedia title lookup (batched, redirects followed), coordinate-
     validated: article coords must sit within WIKI_MATCH_KM of the POI.
  2. The destination country's own Wikipedia edition(s) (COUNTRY_LANG),
     same validation.
  3. Wikipedia GeoSearch within ~1 km of the POI coords (en, then local
     langs), best name match wins; by construction within 30 km.

Card fields: img = 640px lead thumbnail, desc = first sentence of the intro
extract trimmed to ~160 chars (plain text), wiki = canonical article URL.

pop: Wikimedia pageviews REST API, per-article monthly, all-access/user,
last 12 full months, averaged per day, int.

Politeness: single User-Agent with contact address, <= 8 concurrent workers
(and only for the per-item phases; title lookups are batched + serial),
backoff on 429/5xx honoring Retry-After.

Resumable: app_data/enrich_cache.json, keyed destId||name (resolve) and
wiki URL (pop). Written incrementally.

Run:  python enrich_activities.py           # full run (resumes from cache)
      python enrich_activities.py apply     # only write cache -> app_data.json
ASCII-clean per project convention.
"""
import json
import math
import os
import re
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).parent
DATA = ROOT / "app_data" / "app_data.json"
CACHE = ROOT / "app_data" / "enrich_cache.json"

UA = ("CartaTravelApp-enrich/1.0 "
      "(https://github.com/basvn123; contact: bas.vannieuwenhuyse123@gmail.com)")
HEADERS = {"User-Agent": UA, "Accept": "application/json"}

WIKI_MATCH_KM = 30          # POI <-> article max distance for a name match
GEO_RADIUS_M = 1000         # geosearch radius around the POI itself
THUMB_PX = 640
DESC_MAX = 160
MAX_WORKERS = 8             # hard politeness cap
BATCH_DELAY_S = 0.15        # between batched action-API calls
ITEM_DELAY_S = 0.05         # jitter inside threaded per-item calls
SAVE_EVERY = 200

# Same map as harvest_activities.py - local-language Wikipedia fallbacks.
COUNTRY_LANG = {
    "Albania": ["sq"], "Andorra": ["ca"], "Austria": ["de"],
    "Belgium": ["nl", "fr"], "Bosnia and Herzegovina": ["bs", "hr", "sr"],
    "Bulgaria": ["bg"], "Croatia": ["hr"], "Cyprus": ["el"],
    "Czechia": ["cs"], "Denmark": ["da"], "Estonia": ["et"],
    "Faroe Islands": ["fo", "da"], "Finland": ["fi"], "France": ["fr"],
    "Germany": ["de"], "Greece": ["el"], "Hungary": ["hu"],
    "Iceland": ["is"], "Ireland": [], "Italy": ["it"],
    "Kosovo": ["sq", "sr"], "Latvia": ["lv"], "Liechtenstein": ["de"],
    "Lithuania": ["lt"], "Luxembourg": ["fr", "de"], "Malta": ["mt"],
    "Moldova": ["ro"], "Monaco": ["fr"], "Montenegro": ["sr", "hr"],
    "Netherlands": ["nl"], "North Macedonia": ["mk"], "Norway": ["no"],
    "Poland": ["pl"], "Portugal": ["pt"], "Romania": ["ro"],
    "San Marino": ["it"], "Serbia": ["sr"], "Slovakia": ["sk"],
    "Slovenia": ["sl"], "Spain": ["es", "ca"], "Sweden": ["sv"],
    "Switzerland": ["de", "fr", "it"], "United Kingdom": [],
}

_cache_lock = threading.Lock()
_dirty = 0


# ---------------------------------------------------------------------------
# plumbing
# ---------------------------------------------------------------------------
def get_json(url):
    """GET JSON with retry/backoff on 429/5xx (honors Retry-After).
    Returns dict/list, {'_404': True} on 404, or None on hard failure."""
    delays = [0, 5, 15, 45]
    for i, dl in enumerate(delays):
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


def save_cache(cache, force=False):
    global _dirty
    with _cache_lock:
        if not force and _dirty < SAVE_EVERY:
            return
        tmp = CACHE.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, CACHE)
        _dirty = 0


def mark_dirty(n=1):
    global _dirty
    _dirty += n


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _chunks(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


def _resolve_map(requested, normalized, redirects):
    step = {}
    for n in (normalized or []):
        step[n["from"]] = n["to"]
    for r in (redirects or []):
        step[r["from"]] = r["to"]
    out = {}
    for t in requested:
        cur, seen = t, set()
        while cur in step and cur not in seen:
            seen.add(cur)
            cur = step[cur]
        out[t] = cur
    return out


def trim_desc(text):
    s = re.sub(r"\s+", " ", (text or "")).strip()
    if not s or s.startswith("!"):
        return ""
    if len(s) > DESC_MAX:
        cut = s[:DESC_MAX - 3]
        sp = cut.rfind(" ")
        if sp > 80:
            cut = cut[:sp]
        s = cut.rstrip(" ,;:") + "..."
    return s


def card_from_page(p):
    """{img?, desc?, wiki?, lat?, lon?} from an action-API page object."""
    if p.get("missing"):
        return None
    card = {}
    thumb = (p.get("thumbnail") or {}).get("source")
    if thumb and thumb.startswith("https://"):
        card["img"] = thumb
    d = trim_desc(p.get("extract"))
    if d:
        card["desc"] = d
    if p.get("fullurl"):
        card["wiki"] = p["fullurl"]
    c = (p.get("coordinates") or [{}])[0]
    if c.get("lat") is not None:
        card["lat"], card["lon"] = c["lat"], c["lon"]
    return card if card.get("wiki") else None


CARD_PROPS = {
    "action": "query", "format": "json", "formatversion": "2",
    "prop": "pageimages|extracts|coordinates|info", "inprop": "url",
    "piprop": "thumbnail", "pithumbsize": str(THUMB_PX),
    "exintro": "1", "exsentences": "1", "explaintext": "1", "exlimit": "max",
    "redirects": "1",
}


def batch_cards(titles, lang):
    """{requested title -> card} - 20 titles per call (extracts exlimit cap)."""
    api = f"https://{lang}.wikipedia.org/w/api.php"
    out = {}
    for chunk in _chunks(list(titles), 20):
        params = dict(CARD_PROPS)
        params["titles"] = "|".join(chunk)
        d = get_json(api + "?" + urllib.parse.urlencode(params))
        q = (d or {}).get("query", {})
        rmap = _resolve_map(chunk, q.get("normalized"), q.get("redirects"))
        final = {}
        for p in q.get("pages", []):
            card = card_from_page(p)
            if card:
                final[p.get("title")] = card
        for t in chunk:
            c = final.get(rmap.get(t, t))
            if c:
                out[t] = c
        time.sleep(BATCH_DELAY_S)
    return out


# ---------------------------------------------------------------------------
# name matching for the geosearch pass
# ---------------------------------------------------------------------------
STOP = {"the", "of", "a", "an", "and", "in", "at", "de", "la", "le", "el",
        "los", "las", "di", "del", "della", "delle", "dei", "degli", "st",
        "saint", "sankt", "san", "santa", "santo", "sao", "do", "da", "dos",
        "das", "van", "der", "den", "het", "und", "zu", "zum", "zur", "na",
        "u", "i", "v", "ve", "y", "e", "sur", "sous", "aux", "au", "des",
        "du", "les", "ul", "im", "am", "sv", "sveti", "sveta", "agios",
        "agia", "szent", "sw"}


def _norm_tokens(s):
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9 ]", " ", s.lower())
    return [t for t in s.split() if t not in STOP]


def name_match_score(name, title):
    a, b = _norm_tokens(name), _norm_tokens(title)
    if not a or not b:
        return 0.0
    sa, sb = set(a), set(b)
    inter = len(sa & sb)
    base = inter / min(len(sa), len(sb))
    ja, jb = " ".join(a), " ".join(b)
    if ja == jb:
        return 2.0
    if ja in jb or jb in ja:
        return max(base, 1.0)
    return base


def geosearch_card(lat, lon, name, lang):
    """Best name-matching article within GEO_RADIUS_M of the POI, with its
    card, or None. Articles found this way are within 1 km, so the 30 km
    verification holds by construction (double-checked when coords present)."""
    api = f"https://{lang}.wikipedia.org/w/api.php"
    params = dict(CARD_PROPS)
    params.update({
        "generator": "geosearch", "ggscoord": f"{lat}|{lon}",
        "ggsradius": str(GEO_RADIUS_M), "ggslimit": "20", "ggsnamespace": "0",
    })
    d = get_json(api + "?" + urllib.parse.urlencode(params))
    pages = (d or {}).get("query", {}).get("pages", [])
    best, best_score = None, 0.0
    for p in sorted(pages, key=lambda x: x.get("index", 99)):
        card = card_from_page(p)
        if not card:
            continue
        if card.get("lat") is not None and \
                haversine_km(lat, lon, card["lat"], card["lon"]) > WIKI_MATCH_KM:
            continue
        score = name_match_score(name, p.get("title") or "")
        if score >= 0.6 and score > best_score:
            best, best_score = card, score
            if score >= 2.0:
                break
    return best


# ---------------------------------------------------------------------------
# pageviews
# ---------------------------------------------------------------------------
def _pv_window():
    today = date.today()
    end = today.replace(day=1) - timedelta(days=1)      # last day, prev month
    y, m = end.year, end.month - 11
    if m <= 0:
        m += 12
        y -= 1
    start = date(y, m, 1)
    days = (end - start).days + 1
    return start.strftime("%Y%m%d"), end.strftime("%Y%m%d"), days


PV_START, PV_END, PV_DAYS = _pv_window()
_WIKI_URL_RE = re.compile(r"https?://([a-z\-]+)\.(?:m\.)?wikipedia\.org/wiki/(.+)$")


def pageviews_avg(url):
    """Average daily views over the last 12 full months, int.
    Returns 0 when the API has no data (404), None on hard failure."""
    m = _WIKI_URL_RE.match(url or "")
    if not m:
        return 0
    project = f"{m.group(1)}.wikipedia"
    title = urllib.parse.quote(urllib.parse.unquote(m.group(2).split("#")[0]),
                               safe="")
    u = (f"https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
         f"{project}/all-access/user/{title}/monthly/{PV_START}/{PV_END}")
    d = get_json(u)
    if d is None:
        return None
    if d.get("_404"):
        return 0
    items = d.get("items")
    if items is None:
        return None
    total = sum(x.get("views", 0) for x in items)
    return int(round(total / PV_DAYS))


# ---------------------------------------------------------------------------
# work inventory
# ---------------------------------------------------------------------------
def item_key(did, it):
    return f"{did}||{it.get('name')}"


def load_all():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    cache = {"resolve": {}, "pop": {}}
    if CACHE.exists():
        try:
            c = json.loads(CACHE.read_text(encoding="utf-8"))
            cache["resolve"] = c.get("resolve", {})
            cache["pop"] = c.get("pop", {})
        except Exception:
            print("  ! cache unreadable, starting fresh")
    return data, cache


def iter_items(data):
    for did, dd in (data.get("destinations") or {}).items():
        act = (dd or {}).get("activities") or {}
        for it in act.get("items_full") or []:
            yield did, (dd.get("country") or "").strip(), it


def effective_card(it, cached):
    """The item's current + cached wiki fields merged (cached fills gaps)."""
    out = {}
    for k in ("img", "desc", "wiki"):
        v = it.get(k) or (cached or {}).get(k)
        if v:
            out[k] = v
    return out


def needs_resolve(it, cached):
    eff = effective_card(it, cached)
    return not (eff.get("img") and eff.get("desc") and eff.get("wiki"))


# ---------------------------------------------------------------------------
# passes
# ---------------------------------------------------------------------------
def pass0_known_wiki(data, cache):
    """Items that already have a wiki URL but miss img/desc: fetch the card
    from that exact article (grouped per language, batched)."""
    res = cache["resolve"]
    by_lang = {}
    for did, _cty, it in iter_items(data):
        k = item_key(did, it)
        if not needs_resolve(it, res.get(k)):
            continue
        url = it.get("wiki") or (res.get(k) or {}).get("wiki")
        m = _WIKI_URL_RE.match(url or "")
        if not m:
            continue
        lang = m.group(1)
        title = urllib.parse.unquote(m.group(2).split("#")[0]).replace("_", " ")
        by_lang.setdefault(lang, {}).setdefault(title, []).append(k)
    total = sum(len(v) for v in by_lang.values())
    print(f"[pass 0] known-wiki items missing img/desc: "
          f"{sum(len(ks) for v in by_lang.values() for ks in v.values())} "
          f"items, {total} unique titles across {len(by_lang)} langs")
    for lang, wanted in sorted(by_lang.items()):
        titles = sorted(wanted)
        print(f"  {lang}.wikipedia: {len(titles)} titles "
              f"(~{(len(titles) + 19) // 20} calls)")
        got = 0
        for group in _chunks(titles, 400):
            cards = batch_cards(group, lang)
            with _cache_lock:
                for t, card in cards.items():
                    card = {k: v for k, v in card.items()
                            if k in ("img", "desc", "wiki")}
                    for key in wanted[t]:
                        merged = dict(res.get(key) or {})
                        merged.update(card)
                        res[key] = merged
                    got += 1
            mark_dirty(len(cards))
            save_cache(cache)
        save_cache(cache, force=True)
        print(f"    -> {got}/{len(titles)} cards")


def _title_pass(data, cache, lang, entries, tag):
    """Batched title lookup on `lang`.wikipedia for (key, name, lat, lon)
    entries; coordinate-validated merge into cache. Marks misses so later
    passes know they were tried."""
    res = cache["resolve"]
    wanted = {}
    for key, name, lat, lon in entries:
        wanted.setdefault(name, []).append((key, lat, lon))
    names = sorted(wanted)
    if not names:
        return 0
    print(f"[{tag}] {lang}.wikipedia: {len(names)} unique names "
          f"(~{(len(names) + 19) // 20} calls)")
    hits = 0
    done = 0
    for group in _chunks(names, 400):
        cards = batch_cards(group, lang)
        with _cache_lock:
            for name in group:
                card = cards.get(name)
                for key, lat, lon in wanted[name]:
                    rec = dict(res.get(key) or {})
                    tried = rec.get("_tried", [])
                    if card and card.get("lat") is not None and \
                            lat is not None and \
                            haversine_km(lat, lon, card["lat"], card["lon"]) <= WIKI_MATCH_KM:
                        for k in ("img", "desc", "wiki"):
                            if card.get(k) and not rec.get(k):
                                rec[k] = card[k]
                        hits += 1
                    if lang not in tried:
                        tried = tried + [lang]
                    rec["_tried"] = tried
                    res[key] = rec
        done += len(group)
        mark_dirty(len(group))
        save_cache(cache)
        print(f"    {done}/{len(names)} names, {hits} item hits")
    save_cache(cache, force=True)
    return hits


def resolve_entries(data, cache, need_untried=None):
    """(key, name, lat, lon) for items still lacking a full card. If
    `need_untried` is a lang code, only items that haven't tried it yet."""
    res = cache["resolve"]
    out = []
    seen = set()
    for did, cty, it in iter_items(data):
        if it.get("lat") is None:
            continue
        k = item_key(did, it)
        if k in seen:
            continue
        seen.add(k)
        rec = res.get(k)
        if not needs_resolve(it, rec):
            continue
        if it.get("wiki") or (rec or {}).get("wiki"):
            continue  # pass 0 territory (known article)
        if need_untried and need_untried in (rec or {}).get("_tried", []):
            continue
        out.append((k, it["name"], it["lat"], it["lon"]))
    return out


def pass3_geosearch(data, cache):
    """Per-item geosearch (en + local langs), threaded, <= MAX_WORKERS."""
    res = cache["resolve"]
    todo = []
    seen = set()
    for did, cty, it in iter_items(data):
        if it.get("lat") is None:
            continue
        k = item_key(did, it)
        if k in seen:
            continue
        seen.add(k)
        rec = res.get(k)
        if not needs_resolve(it, rec):
            continue
        if it.get("wiki") or (rec or {}).get("wiki"):
            continue
        if (rec or {}).get("_geo"):
            continue  # already geosearched
        langs = ["en"] + COUNTRY_LANG.get(cty, [])
        todo.append((k, it["name"], it["lat"], it["lon"], langs))
    print(f"[pass 3] geosearch fallback: {len(todo)} items")
    if not todo:
        return

    memo = {}
    memo_lock = threading.Lock()

    def work(entry):
        k, name, lat, lon, langs = entry
        mk = (name, round(lat, 4), round(lon, 4), tuple(langs))
        with memo_lock:
            if mk in memo:
                return k, memo[mk]
        card = None
        for lang in langs:
            card = geosearch_card(lat, lon, name, lang)
            if card:
                break
            time.sleep(ITEM_DELAY_S)
        with memo_lock:
            memo[mk] = card
        return k, card

    done = hits = 0
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = [ex.submit(work, e) for e in todo]
        for f in as_completed(futs):
            k, card = f.result()
            with _cache_lock:
                rec = dict(res.get(k) or {})
                rec["_geo"] = True
                if card:
                    for kk in ("img", "desc", "wiki"):
                        if card.get(kk) and not rec.get(kk):
                            rec[kk] = card[kk]
                    hits += 1
                res[k] = rec
            done += 1
            mark_dirty()
            save_cache(cache)
            if done % 500 == 0:
                print(f"    {done}/{len(todo)} items, {hits} hits")
    save_cache(cache, force=True)
    print(f"    geosearch done: {hits}/{len(todo)} resolved")


def pass4_pageviews(data, cache):
    res, pop = cache["resolve"], cache["pop"]
    urls = set()
    for did, _cty, it in iter_items(data):
        k = item_key(did, it)
        url = it.get("wiki") or (res.get(k) or {}).get("wiki")
        if url and url not in pop:
            urls.add(url)
    urls = sorted(urls)
    print(f"[pass 4] pageviews: {len(urls)} unique articles to fetch "
          f"({len(pop)} cached), window {PV_START}..{PV_END}")
    if not urls:
        return

    def work(url):
        time.sleep(ITEM_DELAY_S)
        return url, pageviews_avg(url)

    done = fails = 0
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futs = [ex.submit(work, u) for u in urls]
        for f in as_completed(futs):
            url, v = f.result()
            if v is None:
                fails += 1
            else:
                with _cache_lock:
                    pop[url] = v
                mark_dirty()
                save_cache(cache)
            done += 1
            if done % 1000 == 0:
                print(f"    {done}/{len(urls)} articles ({fails} failures)")
    save_cache(cache, force=True)
    print(f"    pageviews done: {len(urls) - fails} fetched, {fails} failed")


# ---------------------------------------------------------------------------
# apply + report
# ---------------------------------------------------------------------------
def apply_to_data(data, cache):
    res, pop = cache["resolve"], cache["pop"]
    n_img = n_desc = n_wiki = n_pop = 0
    for did, _cty, it in iter_items(data):
        k = item_key(did, it)
        rec = res.get(k) or {}
        if rec.get("img") and not it.get("img"):
            it["img"] = rec["img"]; n_img += 1
        if rec.get("desc") and not it.get("desc"):
            it["desc"] = rec["desc"]; n_desc += 1
        if rec.get("wiki") and not it.get("wiki"):
            it["wiki"] = rec["wiki"]; n_wiki += 1
        url = it.get("wiki")
        if url and url in pop:
            it["pop"] = int(pop[url]); n_pop += 1
    print(f"[apply] filled img +{n_img}, desc +{n_desc}, wiki +{n_wiki}; "
          f"pop set on {n_pop} items")
    return data


def coverage(data):
    tot = img = desc = wiki = popn = 0
    for _d, _c, it in iter_items(data):
        tot += 1
        img += 1 if it.get("img") else 0
        desc += 1 if it.get("desc") else 0
        wiki += 1 if it.get("wiki") else 0
        popn += 1 if isinstance(it.get("pop"), int) else 0
    return dict(items=tot, img=img, desc=desc, wiki=wiki, pop=popn)


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    data, cache = load_all()
    before = coverage(data)
    print(f"before: {before}")

    if cmd != "apply":
        t0 = time.time()
        pass0_known_wiki(data, cache)
        # pass 1: en titles
        _title_pass(data, cache, "en",
                    resolve_entries(data, cache, need_untried="en"), "pass 1")
        # pass 2: local-language rounds
        max_rounds = max(len(v) for v in COUNTRY_LANG.values())
        for rnd in range(max_rounds):
            by_lang = {}
            for did, cty, it in iter_items(data):
                langs = COUNTRY_LANG.get(cty, [])
                if rnd < len(langs):
                    by_lang.setdefault(langs[rnd], None)
            for lang in sorted(by_lang):
                entries = []
                for did, cty, it in iter_items(data):
                    langs = COUNTRY_LANG.get(cty, [])
                    if rnd >= len(langs) or langs[rnd] != lang:
                        continue
                    if it.get("lat") is None:
                        continue
                    k = item_key(did, it)
                    rec = cache["resolve"].get(k)
                    if not needs_resolve(it, rec):
                        continue
                    if it.get("wiki") or (rec or {}).get("wiki"):
                        continue
                    if lang in (rec or {}).get("_tried", []):
                        continue
                    entries.append((k, it["name"], it["lat"], it["lon"]))
                # de-dup keys
                seenk = set()
                entries = [e for e in entries
                           if not (e[0] in seenk or seenk.add(e[0]))]
                _title_pass(data, cache, lang, entries, f"pass 2.{rnd}")
        pass3_geosearch(data, cache)
        pass4_pageviews(data, cache)
        print(f"network phases took {time.time() - t0:.0f}s")

    data = apply_to_data(data, cache)
    DATA.write_text(json.dumps(data, indent=1, ensure_ascii=False),
                    encoding="utf-8")
    save_cache(cache, force=True)
    after = coverage(data)
    print(f"after:  {after}")
    print(f"wrote {DATA}")


if __name__ == "__main__":
    main()
