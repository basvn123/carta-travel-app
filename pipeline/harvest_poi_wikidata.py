"""harvest_poi_wikidata.py - Wikidata significance signals for POIs.

The catalogue's ~34k wiki-linked POIs carry no Wikidata identity, so the
scorer has only pageviews (attention) and the OTM heritage flag. Sitelink
count is the standard language-neutral notability proxy (how many Wikipedias
bothered to cover it), and Wikidata also holds direct significance boosters:
heritage designation (P1435), UNESCO WHS class, and yearly visitors (P1174).

Two batched, cached, resumable network phases (cache-only: never touches
app_data.json; score_significance.py consumes the cache offline):

  1. wiki URL -> QID    MediaWiki action API per language project,
                        prop=pageprops ppprop=wikibase_item, 50 titles/req,
                        redirects followed.
  2. QID -> signals     WDQS SPARQL, VALUES batches of 200:
                        wikibase:sitelinks, EXISTS wdt:P1435, MAX wdt:P1174.
                        (Wikidata is CC0; WDQS limits: 60s processing/60s,
                        5 parallel per IP - we stay serial.)

Cache: cache/poi_wikidata.json
  { "<wiki url>": {"qid": "Q243", "sitelinks": 234, "heritage": true,
                   "visitors": 6200000} | {"miss": true} }

Usage:
    python harvest_poi_wikidata.py            # everything unresolved
    python harvest_poi_wikidata.py --limit 500
"""
import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

from pipeline_io import atomic_write_json, load_json

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "app_data" / "app_data.json"
CACHE = ROOT / "cache" / "poi_wikidata.json"

UA = {"User-Agent": "CartaTravelApp/1.0 (portfolio project; "
                    "data@carta-europetravel.com)"}
TITLES_PER_REQ = 50
QIDS_PER_QUERY = 200
DELAY_S = 0.15
SPARQL_DELAY_S = 1.0
RETRIES = 4
TIMEOUT_S = 60
CHECKPOINT_EVERY = 20          # batches between cache writes

WDQS = "https://query.wikidata.org/sparql"


def _get(url, data=None):
    last = None
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(url, data=data, headers=UA)
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:            # 429s, timeouts, transient 5xx
            last = e
            time.sleep(2 ** attempt * 2)
    print(f"    ! giving up after {RETRIES} tries: {last}")
    return None


def parse_wiki_url(url):
    """-> (lang, title) for a *.wikipedia.org/wiki/ URL, else None."""
    try:
        u = urllib.parse.urlparse(url)
    except Exception:
        return None
    host = u.netloc.lower().replace(".m.", ".")
    if not host.endswith(".wikipedia.org"):
        return None
    lang = host.split(".")[0]
    if not u.path.startswith("/wiki/"):
        return None
    title = urllib.parse.unquote(u.path[len("/wiki/"):]).split("#")[0]
    title = title.replace("_", " ").strip()
    return (lang, title) if lang and title else None


def collect_urls(data):
    urls = set()
    for d in data["destinations"].values():
        for it in (d.get("activities") or {}).get("items_full") or []:
            if it.get("dup") or it.get("noise"):
                continue
            w = it.get("wiki")
            if w and parse_wiki_url(w):
                urls.add(w)
    return sorted(urls)


def phase1_qids(urls, cache):
    """Resolve titles to QIDs per language project, batched."""
    by_lang = defaultdict(list)
    for url in urls:
        if url in cache:
            continue
        lang, title = parse_wiki_url(url)
        by_lang[lang].append((url, title))
    todo = sum(len(v) for v in by_lang.values())
    print(f"[qids] {todo} URLs to resolve across {len(by_lang)} languages "
          f"({len(cache)} cached)")
    batches_done = 0
    for lang, entries in sorted(by_lang.items()):
        api = f"https://{lang}.wikipedia.org/w/api.php"
        for i in range(0, len(entries), TITLES_PER_REQ):
            chunk = entries[i:i + TITLES_PER_REQ]
            params = {
                "action": "query", "format": "json", "redirects": 1,
                "prop": "pageprops", "ppprop": "wikibase_item",
                "titles": "|".join(t for _u, t in chunk),
            }
            time.sleep(DELAY_S)
            d = _get(api + "?" + urllib.parse.urlencode(params))
            if d is None:
                continue
            q = d.get("query") or {}
            # map input title -> final title through normalization + redirects
            fwd = {}
            for r in (q.get("normalized") or []) + (q.get("redirects") or []):
                fwd[r["from"]] = r["to"]
            def final(t):
                seen = set()
                while t in fwd and t not in seen:
                    seen.add(t)
                    t = fwd[t]
                return t
            by_title = {}
            for p in (q.get("pages") or {}).values():
                qid = (p.get("pageprops") or {}).get("wikibase_item")
                by_title[p.get("title")] = qid
            for url, title in chunk:
                qid = by_title.get(final(title))
                cache[url] = {"qid": qid} if qid else {"miss": True}
            batches_done += 1
            if batches_done % CHECKPOINT_EVERY == 0:
                atomic_write_json(CACHE, cache, indent=None,
                                  separators=(",", ":"))
                print(f"    [qids] {lang}: checkpoint at batch {batches_done}")
    atomic_write_json(CACHE, cache, indent=None, separators=(",", ":"))
    hits = sum(1 for v in cache.values() if v.get("qid"))
    print(f"[qids] done: {hits} QIDs, "
          f"{sum(1 for v in cache.values() if v.get('miss'))} misses")


def phase2_signals(cache):
    """Fetch sitelinks/heritage/class-flags/visitors for QIDs missing them.

    The class flags matter as much as the counts: a POI whose article is
    really the MUNICIPALITY (a knockoff statue linking to the Brussels
    article, a district filed as a sight) inherits the town's massive
    sitelink/pageview numbers and poisons the significance ranking, so the
    scorer needs to know the entity is an admin area / settlement / station
    and zero those signals. Selecting on the `admin` key (not `sitelinks`)
    upgrades caches written before the flags existed."""
    todo = sorted({v["qid"] for v in cache.values()
                   if v.get("qid") and "admin" not in v})
    print(f"[wdqs] {len(todo)} QIDs to enrich")
    by_qid_urls = defaultdict(list)
    for url, v in cache.items():
        if v.get("qid"):
            by_qid_urls[v["qid"]].append(url)
    for i in range(0, len(todo), QIDS_PER_QUERY):
        chunk = todo[i:i + QIDS_PER_QUERY]
        values = " ".join(f"wd:{q}" for q in chunk)
        sparql = (
            "SELECT ?item ?sitelinks ?heritage ?admin ?station "
            "(MAX(?v) AS ?visitors) WHERE { "
            f"VALUES ?item {{ {values} }} "
            "?item wikibase:sitelinks ?sitelinks . "
            "BIND(EXISTS { ?item wdt:P1435 [] } AS ?heritage) "
            # Q56061 administrative territorial entity, Q486972 human
            # settlement: the article is a place-of-residence, not a sight
            "BIND(EXISTS { ?item wdt:P31/wdt:P279* wd:Q56061 } || "
            "EXISTS { ?item wdt:P31/wdt:P279* wd:Q486972 } AS ?admin) "
            # Q55488 railway station (transport infra, the UI filters these)
            "BIND(EXISTS { ?item wdt:P31/wdt:P279* wd:Q55488 } AS ?station) "
            "OPTIONAL { ?item wdt:P1174 ?v . } } "
            "GROUP BY ?item ?sitelinks ?heritage ?admin ?station")
        time.sleep(SPARQL_DELAY_S)
        d = _get(WDQS + "?" + urllib.parse.urlencode(
            {"query": sparql, "format": "json"}))
        if d is None:
            continue
        for b in ((d.get("results") or {}).get("bindings") or []):
            qid = b["item"]["value"].rsplit("/", 1)[-1]
            rec = {
                "qid": qid,
                "sitelinks": int(b["sitelinks"]["value"]),
                "heritage": b.get("heritage", {}).get("value") == "true",
                "admin": b.get("admin", {}).get("value") == "true",
                "station": b.get("station", {}).get("value") == "true",
            }
            if "visitors" in b and b["visitors"].get("value"):
                try:
                    rec["visitors"] = int(float(b["visitors"]["value"]))
                except ValueError:
                    pass
            for url in by_qid_urls.get(qid, []):
                cache[url].update(rec)
        if (i // QIDS_PER_QUERY) % 10 == 9:
            atomic_write_json(CACHE, cache, indent=None,
                              separators=(",", ":"))
            print(f"    [wdqs] {i + len(chunk)}/{len(todo)}")
    atomic_write_json(CACHE, cache, indent=None, separators=(",", ":"))
    done = sum(1 for v in cache.values() if "sitelinks" in v)
    print(f"[wdqs] done: {done} URLs carry sitelinks")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    args = ap.parse_args()

    data = json.loads(DATA.read_text(encoding="utf-8"))
    cache = load_json(CACHE)
    urls = collect_urls(data)
    if args.limit:
        urls = [u for u in urls if u not in cache][:args.limit] \
            + [u for u in urls if u in cache]
    print(f"{len(urls)} unique wiki URLs on scored POIs")
    phase1_qids(urls, cache)
    phase2_signals(cache)


if __name__ == "__main__":
    main()
