"""harvest_place_signals.py - resolve the place registers, and measure fame.

Two network phases against Wikidata (CC0; WDQS allows 60s of processing per
60s and 5 parallel queries per IP, so this stays serial and caches everything):

  1. designations  For every place-level register in place_registries.py, pull
                   its members with coordinates, population and sitelink count.
                   Each member is then matched to a candidate from
                   build_place_candidates.py by name and distance, so a
                   designation lands on the row the coverage report ranks.

  2. attention     Sitelink count for every matched place, plus Wikipedia
                   pageviews for the ones that reach the shortlist. Sitelinks
                   are the language-neutral notability proxy; pageviews are
                   the honest one but cost a request each, so they are only
                   fetched where they can change a decision.

  3. undesignated  The same pageview measurement for the best candidates that
                   belong to NO register. Phase 2 alone could only ever
                   reinforce places a jury had already found, which left the
                   founding case of this whole exercise unmeasured: Mougins
                   is in no register, so it carried no notability at all and
                   ranked 359th in France despite having a Wikipedia article
                   in 58 languages. Undesignated does not mean unknown.

The titles for phase 3 are resolved on the LOCAL-language Wikipedia and each
one is coordinate-checked against the candidate before its views are counted,
because half the villages in Europe share a name with somewhere else.

Writes:
  data/derived/place_registry.json   {"places": [{key, qid, designations[]}]}
  cache/place_signals.json           {key: {qid, sitelinks, views}}

Both are re-read by build_place_candidates.py and score_place_candidates.py,
so the order is: build -> harvest -> build again -> score. The first build has
no designations, which is fine and is reported as such.

A note on sitelinks: they are inflated for FR/IT/ES/PL/SE by bot-generated
Cebuano and Waray articles, which create a page for every commune. The count
is therefore never used as a threshold, only as a bounded ranking term, and
pageviews outrank it wherever both exist.

Usage:
    python pipeline/harvest_place_signals.py --verify     # count members only
    python pipeline/harvest_place_signals.py              # full harvest
    python pipeline/harvest_place_signals.py --no-views   # skip pageviews
"""
import argparse
import json
import math
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

import place_registries
from pipeline_io import atomic_write_json, load_json

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
CANDIDATES = ROOT / "data" / "derived" / "place_candidates.json"
OUT_REGISTRY = ROOT / "data" / "derived" / "place_registry.json"
OUT_SIGNALS = ROOT / "cache" / "place_signals.json"

WDQS = "https://query.wikidata.org/sparql"
UA = {"User-Agent": "CartaTravelApp/1.0 (portfolio project; "
                    "data@carta-europetravel.com)",
      "Accept": "application/sparql-results+json"}
TIMEOUT_S = 180
RETRIES = 4
DELAY_S = 1.0

# How close a Wikidata member must be to a candidate to be the same place.
MATCH_KM = 4.0
MATCH_KM_NAMED = 12.0   # ...or further, if the names also agree
CELL = 0.1

VIEWS_API = ("https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
             "{proj}/all-access/user/{title}/monthly/{start}/{end}")

# ISO2 -> the Wikipedia a local would write the article on. A village's own
# language edition carries the real readership; en.wikipedia under-counts
# continental places badly and would rank every French village by how many
# English speakers happened to look it up.
COUNTRY_WIKI = {
    "AD": "ca", "AL": "sq", "AT": "de", "BA": "bs", "BE": "nl", "BG": "bg",
    "CH": "de", "CY": "el", "CZ": "cs", "DE": "de", "DK": "da", "EE": "et",
    "ES": "es", "FI": "fi", "FO": "fo", "FR": "fr", "GB": "en", "GR": "el",
    "HR": "hr", "HU": "hu", "IE": "en", "IS": "is", "IT": "it", "LI": "de",
    "LT": "lt", "LU": "fr", "LV": "lv", "MC": "fr", "MD": "ro", "ME": "sr",
    "MK": "mk", "MT": "en", "NL": "nl", "NO": "no", "PL": "pl", "PT": "pt",
    "RO": "ro", "RS": "sr", "SE": "sv", "SI": "sl", "SK": "sk", "SM": "it",
    "XK": "sq",
}
TITLES_PER_REQ = 50
TITLE_MATCH_KM = 12.0     # an article this far from the candidate is a homonym


def ask(query, label=""):
    """One SPARQL query, retried, returning a list of flat dicts."""
    url = WDQS + "?" + urllib.parse.urlencode({"query": query, "format": "json"})
    last = None
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
                data = json.loads(r.read().decode("utf-8"))
            return [{k: v["value"] for k, v in b.items()}
                    for b in data["results"]["bindings"]]
        except Exception as e:
            last = e
            time.sleep(2 ** attempt * 2)
    print(f"    ! {label}: giving up after {RETRIES} tries ({last})")
    return None


def parse_point(wkt):
    """'Point(lon lat)' -> (lat, lon)."""
    m = re.match(r"Point\(([-\d.eE]+) ([-\d.eE]+)\)", wkt or "")
    if not m:
        return None
    return float(m.group(2)), float(m.group(1))


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "", s.replace("ł", "l"))


def haversine(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2)
         * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(a))


def member_query(reg, count_only=False):
    prop, qid = reg["prop"], reg["qid"]
    if count_only:
        return f"SELECT (COUNT(DISTINCT ?p) AS ?n) WHERE {{ ?p wdt:{prop} wd:{qid} }}"
    return f"""SELECT ?p ?pLabel ?coord ?pop ?sl WHERE {{
  ?p wdt:{prop} wd:{qid} ; wdt:P625 ?coord ; wikibase:sitelinks ?sl .
  OPTIONAL {{ ?p wdt:P1082 ?pop }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language
    "en,fr,de,it,es,pt,nl,pl,cs,sv,da,no,fi,hu,ro,hr,el" }}
}}"""


def verify():
    """Live member counts for every register in the table."""
    print("place-level registers (counts measured now):")
    total = 0
    for reg in place_registries.PLACE_REGISTRIES:
        if not reg.get("qid"):
            print(f"  {'-':>7}  {reg['id']:28s} no QID          {reg['name']}")
            continue
        rows = ask(member_query(reg, count_only=True), reg["id"])
        n = int(rows[0]["n"]) if rows else -1
        total += max(0, n)
        flag = "" if reg.get("modelled") == (n > 0) else "   <-- table disagrees"
        print(f"  {n:>7}  {reg['id']:28s} {reg['prop']:>5s} {reg['qid']:>11s}"
              f"  {reg['name'][:44]}{flag}")
        time.sleep(DELAY_S)
    print(f"\n{total:,} member rows across {len(place_registries.PLACE_REGISTRIES)} "
          f"registers")
    gaps = place_registries.scrape_targets()
    if gaps:
        print(f"\n{len(gaps)} known blind spots (real registers Wikidata does "
              f"not model):")
        for r in gaps:
            print(f"  {r['id']:28s} {r['name'][:44]}")
            if r.get("fallback"):
                print(f"  {'':28s}   -> {r['fallback'][:80]}")


def load_candidate_index():
    cands = load_json(CANDIDATES)
    if not cands:
        raise SystemExit(f"missing {CANDIDATES} - run build_place_candidates.py")
    rows = cands["candidates"]
    idx = defaultdict(list)
    for j, c in enumerate(rows):
        idx[(int(math.floor(c["lat"] / CELL)),
             int(math.floor(c["lon"] / CELL)))].append(j)
    return rows, idx


def cells_within(lat, lon, km):
    dlat = km / 111.0
    dlon = km / max(1e-6, 111.0 * math.cos(math.radians(lat)))
    for a in range(int(math.floor((lat - dlat) / CELL)),
                   int(math.floor((lat + dlat) / CELL)) + 1):
        for o in range(int(math.floor((lon - dlon) / CELL)),
                       int(math.floor((lon + dlon) / CELL)) + 1):
            yield (a, o)


def match_candidate(lat, lon, label, rows, idx):
    """Nearest candidate to a Wikidata member; name agreement widens the net."""
    want = norm(label)
    best, best_d = None, 1e9
    for cell in cells_within(lat, lon, MATCH_KM_NAMED):
        for j in idx.get(cell, ()):
            c = rows[j]
            d = haversine(lat, lon, c["lat"], c["lon"])
            named = want and (norm(c["name"]) == want
                              or want in {norm(a) for a in (c.get("alt") or [])})
            limit = MATCH_KM_NAMED if named else MATCH_KM
            if d <= limit and d < best_d:
                best, best_d = j, d
    return best, best_d


def fetch_views(title, project="en.wikipedia"):
    """Average daily pageviews over the last full 12 months, or None."""
    end = time.strftime("%Y%m01", time.gmtime(time.time() - 86400 * 30))
    start = time.strftime("%Y%m01", time.gmtime(time.time() - 86400 * 395))
    url = VIEWS_API.format(proj=project, start=start, end=end,
                           title=urllib.parse.quote(title.replace(" ", "_"), safe=""))
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA["User-Agent"]})
        with urllib.request.urlopen(req, timeout=30) as r:
            items = json.loads(r.read().decode("utf-8")).get("items") or []
        if not items:
            return None
        days = 30.4 * len(items)
        return int(sum(i.get("views", 0) for i in items) / max(1, days))
    except Exception:
        return None


def resolve_titles(names, lang):
    """Batch title -> (lat, lon) on one Wikipedia, following redirects.

    Returns {requested title: (resolved title, lat, lon)}. Articles with no
    coordinates are dropped: without them a homonym cannot be ruled out, and
    a wrong article's readership is worse than no readership at all.
    """
    out = {}
    for i in range(0, len(names), TITLES_PER_REQ):
        chunk = [n for n in names[i:i + TITLES_PER_REQ] if n]
        if not chunk:
            continue
        url = (f"https://{lang}.wikipedia.org/w/api.php?"
               + urllib.parse.urlencode({
                   "action": "query", "format": "json", "redirects": "1",
                   "prop": "coordinates", "coprop": "type", "colimit": "max",
                   "titles": "|".join(chunk)}))
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA["User-Agent"]})
            with urllib.request.urlopen(req, timeout=45) as r:
                data = json.loads(r.read().decode("utf-8"))
        except Exception:
            continue
        q = data.get("query") or {}
        # Map any redirect/normalisation back to what we asked for.
        back = {}
        for norm in (q.get("normalized") or []):
            back[norm["to"]] = norm["from"]
        for red in (q.get("redirects") or []):
            back[red["to"]] = back.get(red["from"], red["from"])
        for page in (q.get("pages") or {}).values():
            title = page.get("title")
            coords = page.get("coordinates") or []
            if not title or not coords:
                continue
            asked = back.get(title, title)
            out[asked] = (title, coords[0]["lat"], coords[0]["lon"])
        time.sleep(0.12)
    return out


def harvest_undesignated(rows, signals, limit):
    """Pageviews for the best candidates that carry no designation.

    Ranked by the scorer's OWN verdict (worth, computed with no attention
    term), not by raw POI weight. That distinction decides where the request
    budget goes, and getting it wrong wasted the whole budget the first time:
    ranking by mass plus intensity put Indre By, Kolonaki, City of London,
    Innere Stadt, Paris 01 Louvre, Mala Strana and Gamla Stan at the top,
    because a city-centre district is by definition the densest POI cluster
    for its population. Those are not destinations, and the scorer already
    knows it - the shadow and section penalties are inside score_candidate.
    Mougins, the case this phase exists for, sat at #6,727 under the naive
    ranking and never got measured.
    """
    import score_place_candidates as S

    pool = []
    for i, c in enumerate(rows):
        if c["key"] in signals or c.get("designations"):
            continue
        if c["track"] != "settlement" or not c.get("iso2"):
            continue
        # Anything sitting inside a much larger place's built-up area is out
        # of the request budget. Worth alone was not enough: the scorer lets a
        # district off its shadow penalty when intensity is high, and a
        # city-centre district has enormous intensity BY CONSTRUCTION, being
        # the densest POI cluster for its population that exists. Under worth
        # alone the top of this pool was Holborn, five Paris arrondissements,
        # the City of London, Etterbeek and the Giudecca.
        #
        # `parent_city` draws the line exactly where it belongs, and Mougins
        # is why: it has NO parent, because a parent must be five times your
        # size and Cannes is only four times Mougins. Paris 01 has Paris.
        # Parented places that really are destinations (Versailles) are found
        # by their designations instead, which cost no requests at all.
        if c.get("parent_city") or c.get("is_section"):
            continue
        worth, _parts, _inten = S.score_candidate(dict(c), None)
        pool.append((worth, i))
    pool.sort(reverse=True)
    pool = pool[:limit]
    lo = pool[-1][0] if pool else 0
    print(f"phase 3: {len(pool)} undesignated candidates, worth {pool[0][0]:.3f} "
          f"down to {lo:.3f}")

    by_country = defaultdict(list)
    for _rank, i in pool:
        by_country[rows[i]["iso2"]].append(i)

    hits = 0
    for iso2, idxs in sorted(by_country.items(), key=lambda kv: -len(kv[1])):
        lang = COUNTRY_WIKI.get(iso2)
        if not lang:
            continue
        names = [rows[i]["name"] for i in idxs]
        resolved = resolve_titles(names, lang)
        got = 0
        for i in idxs:
            c = rows[i]
            hit = resolved.get(c["name"])
            if not hit:
                continue
            title, lat, lon = hit
            if haversine(c["lat"], c["lon"], lat, lon) > TITLE_MATCH_KM:
                continue                      # a homonym somewhere else
            views = fetch_views(title, project=f"{lang}.wikipedia")
            if views is None:
                continue
            signals.setdefault(c["key"], {})["views"] = views
            signals[c["key"]]["label"] = title
            signals[c["key"]]["wiki"] = f"{lang}.wikipedia"
            got += 1
        hits += got
        print(f"  {iso2} ({lang}): {len(idxs):>4} asked -> {got:>4} measured")
    return hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", action="store_true",
                    help="count members of every register and exit")
    ap.add_argument("--no-views", action="store_true",
                    help="skip the pageviews phase (sitelinks only)")
    ap.add_argument("--views-top", type=int, default=1200,
                    help="how many designated places get real pageviews")
    ap.add_argument("--undesignated-top", type=int, default=2500,
                    help="how many register-less candidates get pageviews too")
    args = ap.parse_args()

    if args.verify:
        verify()
        return

    rows, idx = load_candidate_index()
    print(f"{len(rows):,} candidates loaded")

    designations = defaultdict(list)     # candidate key -> [designation]
    signals = {}
    unmatched = defaultdict(int)

    for reg in place_registries.modelled_registries():
        res = ask(member_query(reg), reg["id"])
        time.sleep(DELAY_S)
        if res is None:
            continue
        hit = 0
        for row in res:
            pt = parse_point(row.get("coord"))
            if not pt:
                continue
            j, d = match_candidate(pt[0], pt[1], row.get("pLabel"), rows, idx)
            if j is None:
                unmatched[reg["id"]] += 1
                continue
            key = rows[j]["key"]
            designations[key].append({
                "kind": reg["kind"], "registry": reg["id"],
                "name": reg["name"], "qid": row.get("p", "").rsplit("/", 1)[-1],
                "match_km": round(d, 2),
            })
            sig = signals.setdefault(key, {})
            sig["qid"] = row.get("p", "").rsplit("/", 1)[-1]
            try:
                sig["sitelinks"] = max(int(sig.get("sitelinks") or 0),
                                       int(row.get("sl") or 0))
            except ValueError:
                pass
            sig.setdefault("label", row.get("pLabel"))
            hit += 1
        miss = unmatched.get(reg["id"], 0)
        tail = f", {miss} unmatched" if miss else ""
        print(f"  {reg['id']:28s} {len(res):>6} members -> {hit:>6} matched{tail}")

    print(f"\n{len(designations):,} candidates carry at least one designation")

    if not args.no_views:
        # Pageviews only where they can move a ranking: the most-designated,
        # best-known places. Every call is a request, so this is deliberately
        # bounded rather than run over 90k candidates.
        ranked = sorted(signals.items(),
                        key=lambda kv: -(kv[1].get("sitelinks") or 0))[:args.views_top]
        print(f"fetching pageviews for the top {len(ranked)} by sitelinks ...")
        for n, (key, sig) in enumerate(ranked, 1):
            label = sig.get("label")
            if not label:
                continue
            v = fetch_views(label)
            if v is not None:
                sig["views"] = v
            if n % 100 == 0:
                print(f"  {n}/{len(ranked)}")

    if not args.no_views and args.undesignated_top:
        n = harvest_undesignated(rows, signals, args.undesignated_top)
        print(f"phase 3: {n} undesignated candidates now carry pageviews")

    OUT_REGISTRY.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_json(OUT_REGISTRY, {
        "meta": {
            "built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "registries": [r["id"] for r in place_registries.modelled_registries()],
            "blind_spots": [r["id"] for r in place_registries.scrape_targets()],
            "n_places": len(designations),
        },
        "places": [{"key": k, "designations": v} for k, v in designations.items()],
    })
    atomic_write_json(OUT_SIGNALS, signals)
    print(f"wrote {OUT_REGISTRY.relative_to(ROOT)} ({len(designations):,} places)")
    print(f"wrote {OUT_SIGNALS.relative_to(ROOT)} ({len(signals):,} signal rows)")
    print("next: re-run build_place_candidates.py, then score_place_candidates.py")


if __name__ == "__main__":
    main()
