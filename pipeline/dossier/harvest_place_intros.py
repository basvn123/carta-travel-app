"""Grounded Wikipedia and Wikivoyage intros for the top places (ROADMAP D9, T1095).

Tier: Manual

The dossier intro (`intro.body`) used to be the Wikivoyage lead cut at 700
characters, which is about 110 words: below the 120-word bar the prerender
quality gate sets for an indexable place page (continent-app/scripts/prerender/
quality.mjs, PLACE_MIN_WORDS). FR, RS and IT also had a body for only 27, 29
and 31 percent of places. This pass fetches the full lead of the place's
Wikivoyage article and its Wikipedia article and builds ONE intro from whole
source sentences, so the text is grounded by construction and needs no model:

  grounding  every sentence of the output is a verbatim sentence of a stored
             source extract (after one declared clean-up: citation marks and
             pronunciation brackets removed). check_grounded() proves it.
  provenance each record keeps, per source: title, URL, revision id, licence
             (CC BY-SA 4.0, both sites), fetch date, and which sentences came
             from it.
  checks     length (word count; `meets_bar` is words >= 120), language
             (English), no boilerplate (disambiguation, stub, airport, list),
             no wrong-place match (title, coordinates within 30 km, country).
             A record that fails a check is stored with `status: rejected` and
             its reasons, never merged.

The merge is build_dossier.compose_intro: a record with status ok and more
words than the existing body replaces it, and the grounding list carries both
sources. Nothing here calls a model; CLAUDE.md forbids the Claude API.

  python pipeline/dossier/harvest_place_intros.py [--top 300]
        [--countries FR,RS,IT] [--limit N] [--refresh] [--report]
  python pipeline/dossier/harvest_place_intros.py --fixtures DIR   # offline

Keyless, paced, resumable: a cached id is never refetched without --refresh.
Needs en.wikipedia.org and en.wikivoyage.org (owner run, not the cloud box).
Cache: cache/dossier/place_intros.json
ASCII clean, no em dashes, per project convention.
"""

from __future__ import annotations

import argparse
import glob
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date

sys.path.insert(0, os.path.dirname(__file__))
from common import DCACHE, PUB, atomic_write_json, load_json, norm_name  # noqa: E402

OUT = os.path.join(DCACHE, "place_intros.json")
APIS = (
    ("wikivoyage", "https://en.wikivoyage.org/w/api.php", "https://en.wikivoyage.org/wiki/"),
    ("wikipedia", "https://en.wikipedia.org/w/api.php", "https://en.wikipedia.org/wiki/"),
)
UA = {"User-Agent": "CartaDossier/1.0 (https://carta-europetravel.com; "
                    "bas.vannieuwenhuyse123@gmail.com)"}
PACE_S = 0.4
LICENCE = "CC BY-SA 4.0"

MIN_WORDS = 120          # the SEO bar (PLACE_MIN_WORDS in quality.mjs)
TARGET_WORDS = 135       # stop adding Wikipedia sentences once past this
MAX_WORDS = 230          # never print a wall of text
MIN_USABLE_WORDS = 25    # below this a record is not worth merging
MAX_KM = 30.0            # article coordinates must be this close to the place

PAREN_RE = re.compile(r"\s*\([^)]*\)\s*$")
CITE_RE = re.compile(r"\[(?:\d+|[a-z]|citation needed|note \d+)\]", re.I)
PRON_RE = re.compile(
    r"\s*\((?:[^()]*?(?:pronounced|IPA|listen|\bpronunciation\b|/[^/()]{2,}/|"
    r"\[[^\]]{2,}\]))[^()]*\)", re.I)
BOILER_RE = re.compile(
    r"may refer to|can refer to|disambiguation|this article is|is a stub|"
    r"this is a list|^list of |wikipedia|wikivoyage|please help|"
    r"travel guide|guide to|plunge forward|"
    r"under construction|outline article|usable article|guide article|"
    r"star article|no content", re.I)
AIRPORTY_RE = re.compile(r"\bairport\b|\baerodrome\b|\bairfield\b", re.I)
ABBREV = ("St", "Mt", "Dr", "Mr", "Mrs", "Ms", "Sr", "Jr", "No", "Fr", "Gen",
          "Col", "Lt", "Sta", "Ste", "approx", "ca", "c", "vs", "etc", "e.g",
          "i.e", "Prof", "Rev", "Fig", "Vol", "Op")
EN_STOP = frozenset(
    "the of and a an in is it to for with as on by at from that this which are "
    "was were be has have its their also but or not one two most more than "
    "into between over under around about city town village region known "
    "located situated population".split())


# ---------------------------------------------------------------- text

def clean(text):
    """The single declared clean-up between source and output."""
    t = text or ""
    t = CITE_RE.sub("", t)
    for _ in range(3):
        t2 = PRON_RE.sub("", t)
        if t2 == t:
            break
        t = t2
    t = re.sub(r"[ \t\f\v]+", " ", t)
    t = re.sub(r" +([,.;:!?])", r"\1", t)
    t = re.sub(r"\n\s*\n+", "\n", t)
    return "\n".join(p.strip() for p in t.split("\n") if p.strip())


def words(text):
    return len(re.findall(r"\S+", text or ""))


def split_sentences(paragraph):
    """Sentence split that keeps St. / Mt. / U.S. style abbreviations whole."""
    p = re.sub(r"\s+", " ", paragraph or "").strip()
    if not p:
        return []
    guard = "|".join(re.escape(a) for a in ABBREV)
    p = re.sub(rf"\b({guard})\.", lambda m: m.group(1) + "\x00", p)
    p = re.sub(r"\b([A-Z])\.(?=[A-Z]\.)", lambda m: m.group(1) + "\x00", p)
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z\"'(À-Þ])", p)
    return [s.replace("\x00", ".").strip() for s in parts if s.strip()]


def _bag(s):
    return set(re.findall(r"[a-z]{3,}", norm_name(s)))


def near_duplicate(a, b, thr=0.6):
    x, y = _bag(a), _bag(b)
    if not x or not y:
        return False
    return len(x & y) / len(x | y) >= thr


# ---------------------------------------------------------------- compose

def compose(sources):
    """sources: [{source, extract, ...}] in priority order (Wikivoyage first).

    Whole sentences only. The first source supplies its lead up to MAX_WORDS /2;
    later sources add sentences that are not near-duplicates until the text
    passes TARGET_WORDS. Returns (body, picked) where picked is a list of
    {source, n} counts and body paragraphs are joined by newline."""
    chosen = []          # (source, sentence)
    paragraphs = []      # one per source, in order
    total = 0
    for idx, src in enumerate(sources):
        text = clean(src.get("extract") or "")
        sents = []
        for para in text.split("\n"):
            sents.extend(split_sentences(para))
        used = []
        for s in sents:
            n = words(s)
            if total + n > MAX_WORDS:
                break
            if any(near_duplicate(s, c) for _, c in chosen):
                continue
            if idx > 0 and total >= TARGET_WORDS:
                break
            if idx == 0 and total >= TARGET_WORDS:
                break
            used.append(s)
            chosen.append((src["source"], s))
            total += n
        if used:
            paragraphs.append(" ".join(used))
    picked = {}
    for s, _ in chosen:
        picked[s] = picked.get(s, 0) + 1
    return "\n".join(paragraphs), picked


def check_grounded(body, sources):
    """True when every sentence of body is a verbatim sentence of some
    source's cleaned extract. The proof that nothing was written or edited."""
    pool = set()
    for src in sources:
        for para in clean(src.get("extract") or "").split("\n"):
            pool.update(split_sentences(para))
    out = []
    for para in (body or "").split("\n"):
        out.extend(split_sentences(para))
    bad = [s for s in out if s not in pool]
    return (not bad), bad


# ---------------------------------------------------------------- checks

def haversine_km(la1, lo1, la2, lo2):
    r = 6371.0
    p1, p2 = math.radians(la1), math.radians(la2)
    dp, dl = p2 - p1, math.radians(lo2 - lo1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def english_ratio(text):
    ws = re.findall(r"[A-Za-z']+", text or "")
    allw = re.findall(r"\S+", text or "")
    if not allw:
        return 0.0
    stop = sum(1 for w in ws if w.lower() in EN_STOP)
    latin = sum(len(w) for w in ws) / max(1, len(re.sub(r"\s", "", text)))
    return min(stop / len(allw) * 3.0, 1.0) * (1.0 if latin > 0.7 else 0.3)


def title_matches(title, name):
    """The article title and the place name share the folded base name."""
    t = norm_name(PAREN_RE.sub("", title or ""))
    n = norm_name(PAREN_RE.sub("", name or ""))
    if not t or not n:
        return False
    return t == n or n in t.split(", ")[0] or t in n or (
        len(n) >= 5 and t.startswith(n))


def check_source(src, place):
    """Reasons a single fetched article is the wrong thing to quote ([] = fine).
    place: {name, country, lat, lon}."""
    why = []
    ext = clean(src.get("extract") or "")
    if not ext:
        return ["empty"]
    if src.get("disambiguation"):
        why.append("disambiguation")
    if (BOILER_RE.search(ext[:400]) or BOILER_RE.search(src.get("title") or "")
            or AIRPORTY_RE.search(ext[:220]) or AIRPORTY_RE.search(src.get("title") or "")):
        why.append("boilerplate")
    if english_ratio(ext) < 0.45:
        why.append("language")
    if not title_matches(src.get("title"), place["name"]):
        why.append("title_mismatch")
    c = src.get("coords")
    if c and place.get("lat") is not None:
        d = haversine_km(c[0], c[1], place["lat"], place["lon"])
        if d > MAX_KM:
            why.append(f"wrong_place_{int(d)}km")
    elif "title_mismatch" not in why:
        # no coordinates: the lead must name the place or its country
        head = norm_name(ext[:600])
        if norm_name(place["name"]) not in head and norm_name(
                place.get("country") or "~") not in head:
            why.append("no_place_in_lead")
    return why


def check_record(body, sources, place):
    """Reasons the composed intro must not be merged ([] = ok)."""
    why = []
    n = words(body)
    if n < MIN_USABLE_WORDS:
        why.append(f"too_short_{n}")
    if n > MAX_WORDS + 40:
        why.append(f"too_long_{n}")
    ok, bad = check_grounded(body, sources)
    if not ok:
        why.append(f"ungrounded_{len(bad)}")
    if BOILER_RE.search(body):
        why.append("boilerplate")
    if english_ratio(body) < 0.45:
        why.append("language")
    if re.search(r"—|–", body):
        # dash rule applies to what the app prints; swap rather than reject
        pass
    return why


def finish_text(body):
    """Em and en dashes never ship (project rule): swap for a comma-space
    form. Applied after grounding, so check_grounded runs on the pre-swap
    text and the swap is the one other declared edit."""
    return re.sub(r"\s*[—–]\s*", ", ", body)


# ---------------------------------------------------------------- network

def api(url, params):
    q = url + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(q, headers=UA)
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.load(r)


def fetch_article(base, title):
    """One article's lead, coordinates, revision and disambiguation flag."""
    d = api(base, {
        "action": "query", "format": "json", "redirects": 1, "titles": title,
        "prop": "extracts|coordinates|info|pageprops",
        "exintro": 1, "explaintext": 1, "inprop": "url",
        "ppprop": "disambiguation", "colimit": 1,
    })
    for page in (d.get("query", {}).get("pages", {}) or {}).values():
        if "missing" in page:
            return None
        co = (page.get("coordinates") or [None])[0]
        return {
            "title": page.get("title"),
            "extract": (page.get("extract") or "").strip(),
            "coords": [co["lat"], co["lon"]] if co else None,
            "revid": page.get("lastrevid"),
            "disambiguation": "pageprops" in page and "disambiguation" in page["pageprops"],
        }
    return None


def search_title(base, name, country):
    d = api(base, {"action": "query", "format": "json", "list": "search",
                   "srsearch": f"{name} {country}", "srlimit": 3})
    for hit in d.get("query", {}).get("search", []):
        t = hit.get("title") or ""
        if not BOILER_RE.search(t):
            return t
    return None


def resolve(fetch, search, key, base, url_base, place):
    """Best acceptable article for one site, or None, plus the rejections."""
    rejected = []
    tried = set()
    for attempt in (place["name"], None):
        title = attempt or search(base, place["name"], place.get("country") or "")
        if not title or title in tried:
            continue
        tried.add(title)
        art = fetch(base, title)
        if not art:
            continue
        art["source"] = key
        art["url"] = url_base + urllib.parse.quote(art["title"].replace(" ", "_"))
        why = check_source(art, place)
        if not why:
            return art, rejected
        rejected.append({"source": key, "title": art["title"], "why": why})
    return None, rejected


def build_record(place, fetch=fetch_article, search=search_title, pace=0.0,
                 today=None):
    """One place -> a stored record (never raises on bad articles)."""
    srcs, rejected = [], []
    for key, base, url_base in APIS:
        art, rej = resolve(fetch, search, key, base, url_base, place)
        rejected += rej
        if pace:
            time.sleep(pace)
        if art:
            srcs.append(art)
    if not srcs:
        return {"status": "rejected", "why": ["no_acceptable_article"],
                "rejected": rejected, "words": 0}
    body, _ = compose(srcs)
    why = check_record(body, srcs, place)
    used = []
    for s in srcs:
        sents = set()
        for para in clean(s["extract"]).split("\n"):
            sents.update(split_sentences(para))
        if any(x in sents for para in body.split("\n") for x in split_sentences(para)):
            used.append(s)
    final = finish_text(body)
    rec = {
        "status": "ok" if not why else "rejected",
        "body": final,
        "words": words(final),
        "meets_bar": words(final) >= MIN_WORDS,
        "grounding": [{
            "source": s["source"], "title": s["title"], "url": s["url"],
            "revid": s.get("revid"), "licence": LICENCE,
            "fetched": (today or date.today()).isoformat(),
        } for s in used],
    }
    if why:
        rec["why"] = why
    if rejected:
        rec["rejected"] = rejected
    return rec


# ---------------------------------------------------------------- targets

def select_targets(countries=("FR", "RS", "IT"), top=300, pub=PUB):
    """Top places of the countries by Carta score, from the shipped dossiers,
    an equal share per country.
    Returns [{id, name, country, iso2, lat, lon, score}] best first."""
    rows = []
    for f in glob.glob(os.path.join(pub, "dossier", "*.json")):
        if os.path.basename(f) == "index.json":
            continue
        d = load_json(f, {}) or {}
        p = d.get("place") or {}
        if p.get("iso2") not in countries:
            continue
        sc = (d.get("verdict") or {}).get("score")
        rows.append({"id": d.get("id"), "name": PAREN_RE.sub("", p.get("name") or ""),
                     "country": p.get("country"), "iso2": p.get("iso2"),
                     "lat": p.get("lat"), "lon": p.get("lon"),
                     "score": sc if sc is not None else -1})
    rows.sort(key=lambda r: (-r["score"], r["id"] or ""))
    # Equal share per country; a small country (RS has 28 places) gives its
    # unused share to the others, so 300 means about 136 each for FR and IT.
    by = {c: [r for r in rows if r["iso2"] == c] for c in countries}
    quota = {c: 0 for c in countries}
    left = top
    live = [c for c in countries if by[c]]
    while left > 0 and live:
        share = max(1, left // len(live))
        for c in list(live):
            give = min(share, len(by[c]) - quota[c], left)
            quota[c] += give
            left -= give
            if quota[c] >= len(by[c]):
                live.remove(c)
            if left <= 0:
                break
    picked = [r for c in countries for r in by[c][: quota[c]]]
    picked.sort(key=lambda r: (-r["score"], r["id"] or ""))
    return picked


def fixture_fetchers(dirpath):
    """Offline fetch/search over {dir}/{site}.json = {title: article}."""
    store = {}
    for key, base, _ in APIS:
        store[base] = load_json(os.path.join(dirpath, f"{key}.json"), {}) or {}

    def fetch(base, title):
        art = store[base].get(title)
        return dict(art, title=art.get("title", title)) if art else None

    def search(base, name, country):
        for t in store[base]:
            if norm_name(name) in norm_name(t):
                return t
        return None

    return fetch, search


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=300)
    ap.add_argument("--countries", default="FR,RS,IT")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--fixtures", help="offline: dir with wikivoyage.json, wikipedia.json")
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--report", action="store_true",
                    help="print coverage from the stored cache and exit")
    args = ap.parse_args()

    targets = select_targets(tuple(args.countries.split(",")), args.top)
    cache = {} if args.refresh else (load_json(args.out, {}) or {})
    if args.report:
        ok = [r for r in cache.values() if r.get("status") == "ok"]
        print(f"[place-intros] {len(cache)} stored, {len(ok)} ok, "
              f"{sum(1 for r in ok if r.get('meets_bar'))} meet {MIN_WORDS} words")
        return
    fetch, search = (fixture_fetchers(args.fixtures) if args.fixtures
                     else (fetch_article, search_title))
    pace = 0 if args.fixtures else PACE_S
    todo = [t for t in targets if t["id"] not in cache]
    if args.limit:
        todo = todo[: args.limit]
    print(f"[place-intros] {len(todo)} to fetch of {len(targets)} targets "
          f"({len(cache)} cached)")
    for n, t in enumerate(todo):
        try:
            cache[t["id"]] = build_record(t, fetch, search, pace)
        except Exception as e:  # noqa: BLE001 - resumable, retry next run
            print(f"  {t['id']}: {e}")
            time.sleep(2)
            continue
        if (n + 1) % 25 == 0:
            atomic_write_json(args.out, cache)
            print(f"  {n + 1}/{len(todo)}", flush=True)
    atomic_write_json(args.out, cache)
    mine = [cache[t["id"]] for t in targets if t["id"] in cache]
    ok = [r for r in mine if r.get("status") == "ok"]
    print(f"[place-intros] done: {len(ok)}/{len(mine)} ok, "
          f"{sum(1 for r in ok if r.get('meets_bar'))} meet {MIN_WORDS} words "
          f"-> {args.out}")


if __name__ == "__main__":
    main()
