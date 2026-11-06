"""Grounded descriptions for must-see and recommended POIs (T1096, D9).

Tier: Scheduled (owner run; needs Wikipedia)

The POI labels (poi_labels.py) mark a few sights per place as must_see and
the next few as recommended. Those are the cards a traveller reads, and many
carry a template blurb or nothing. This pass harvests a description for each
from the POI's own English Wikipedia article. Nothing is written by a model:
the description is the first whole sentences of the article lead, verbatim
(the one declared clean-up is the citation and pronunciation strip of
dossier/harvest_place_intros.clean), and check_grounded proves every
sentence is in the source. Each record keeps the article title, URL, revision
id, licence (CC BY-SA 4.0) and fetch date, so the credit can be printed.

A record is rejected, with reasons, and never merged when the article is a
disambiguation page, a list, boilerplate, not English, too short, or sits
more than MAX_KM from the POI's coordinates. A POI with a stored wiki link
is trusted on the title; one found by search must also match the title.

Usage, from the repo root:
    python pipeline/poi_descriptions.py --report          # coverage, no network
    python pipeline/poi_descriptions.py                   # harvest (owner box)
    python pipeline/poi_descriptions.py apply             # cache -> master items_full
    python pipeline/poi_descriptions.py --fixtures DIR    # offline test run

Reads app_data/app_data.json (activities.items_full with label). Resumable
cache: cache/poi_descriptions.json keyed "destId||name". ASCII only.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import time
import urllib.parse
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(HERE, "dossier"))

import harvest_place_intros as hpi  # noqa: E402
from common import atomic_write_json, load_json, norm_name  # noqa: E402

MASTER = os.path.join(ROOT, "app_data", "app_data.json")
OUT = os.path.join(ROOT, "cache", "poi_descriptions.json")
EN_API = "https://en.wikipedia.org/w/api.php"
EN_URL = "https://en.wikipedia.org/wiki/"
LICENCE = "CC BY-SA 4.0"
LABELS = ("must_see", "recommended")
COUNTRIES = ("GB", "RO", "FR", "IT")
PACE_S = 0.4
MAX_KM = 30.0
DESC_MAX = 340           # characters, whole sentences only
DESC_MIN_WORDS = 12
MAX_SENTENCES = 3
LIST_RE = re.compile(r"^(list of|lists of|outline of)\b", re.I)


# ------------------------------------------------------------- selection

def select_pois(master, countries=COUNTRIES, labels=LABELS):
    """Labelled POIs of the countries: [{key, dest, name, label, lat, lon,
    wiki, country, iso2, desc}]. Needs the master (LFS may hide it)."""
    out = []
    for did, dest in (master.get("destinations") or {}).items():
        if dest.get("iso2") not in countries:
            continue
        for it in (dest.get("activities") or {}).get("items_full") or []:
            if it.get("label") not in labels or not it.get("name"):
                continue
            out.append({
                "key": f"{did}||{it['name']}", "dest": did, "name": it["name"],
                "label": it["label"], "lat": it.get("lat"), "lon": it.get("lon"),
                "wiki": it.get("wiki"), "country": dest.get("country"),
                "iso2": dest.get("iso2"), "desc": it.get("desc") or "",
            })
    return out


def coverage(pois, cache=None):
    """Per country and label: how many POIs, how many have a description
    today, how many a grounded harvested one (when `cache` is given)."""
    rows = {}
    for p in pois:
        r = rows.setdefault((p["iso2"], p["label"]),
                            {"n": 0, "with_desc": 0, "harvested": 0})
        r["n"] += 1
        r["with_desc"] += bool(p["desc"].strip())
        rec = (cache or {}).get(p["key"])
        r["harvested"] += bool(rec and rec.get("status") == "ok")
        if not p["desc"].strip() and rec and rec.get("status") == "ok":
            r["with_desc"] += 1
    return rows


# ------------------------------------------------------------- article

def wiki_title(url):
    """(lang, title) from a Wikipedia URL, or (None, None)."""
    m = re.match(r"https?://([a-z\-]+)\.(?:m\.)?wikipedia\.org/wiki/([^#?]+)", url or "")
    if not m:
        return None, None
    return m.group(1), urllib.parse.unquote(m.group(2)).replace("_", " ")


def en_title_via_langlinks(lang, title, api=hpi.api):
    d = api(f"https://{lang}.wikipedia.org/w/api.php", {
        "action": "query", "format": "json", "prop": "langlinks",
        "lllang": "en", "redirects": 1, "titles": title})
    for page in (d.get("query", {}).get("pages") or {}).values():
        for ll in page.get("langlinks") or []:
            return ll.get("*") or ll.get("title")
    return None


def lead_sentences(extract, max_chars=DESC_MAX, max_sentences=MAX_SENTENCES):
    """The first whole sentences of the cleaned lead, verbatim. Stops before
    the cap; a first sentence that alone exceeds it is refused (not cut)."""
    out, size = [], 0
    for para in hpi.clean(extract or "").split("\n"):
        for s in hpi.split_sentences(para):
            if len(out) >= max_sentences or size + len(s) + (1 if out else 0) > max_chars:
                return out
            out.append(s)
            size += len(s) + (1 if size else 0)
        break                       # the first paragraph only
    return out


def check_poi_source(art, poi, trusted):
    """Reasons the article is the wrong thing to quote ([] = fine)."""
    why = []
    ext = hpi.clean(art.get("extract") or "")
    if not ext:
        return ["empty"]
    if art.get("disambiguation"):
        why.append("disambiguation")
    if LIST_RE.search(art.get("title") or "") or hpi.BOILER_RE.search(ext[:300]):
        why.append("boilerplate")
    if hpi.english_ratio(ext) < 0.45:
        why.append("language")
    if not trusted and not hpi.title_matches(art.get("title"), poi["name"]):
        why.append("title_mismatch")
    c = art.get("coords")
    if c and poi.get("lat") is not None and poi.get("lon") is not None:
        d = hpi.haversine_km(c[0], c[1], poi["lat"], poi["lon"])
        if d > MAX_KM:
            why.append(f"wrong_place_{int(d)}km")
    elif not trusted:
        why.append("no_coordinates")
    return why


def build_record(poi, fetch, search, resolve_en, pace=0.0, today=None):
    """One POI -> a stored record. Never raises on a bad article."""
    today = today or date.today().isoformat()
    rejected = []
    tried = set()
    lang, title = wiki_title(poi.get("wiki"))
    plans = []
    if title:
        plans.append((title if lang == "en" else None, lang, title, True))
    plans.append((None, None, None, False))        # search fallback
    for direct, lg, tt, trusted in plans:
        if trusted:
            cand = direct or resolve_en(lg, tt)
        else:
            cand = search(poi["name"], poi.get("country") or "")
        if not cand or cand in tried:
            continue
        tried.add(cand)
        if pace:
            time.sleep(pace)
        art = fetch(cand)
        if not art:
            continue
        why = check_poi_source(art, poi, trusted)
        if why:
            rejected.append({"title": art.get("title"), "why": why})
            continue
        sents = lead_sentences(art["extract"])
        desc = hpi.finish_text(" ".join(sents))
        problems = []
        if hpi.words(desc) < DESC_MIN_WORDS:
            problems.append(f"too_short_{hpi.words(desc)}")
        ok, bad = hpi.check_grounded(" ".join(sents), [art])
        if not ok:
            problems.append(f"ungrounded_{len(bad)}")
        if problems:
            rejected.append({"title": art.get("title"), "why": problems})
            continue
        return {
            "status": "ok", "label": poi["label"], "desc": desc,
            "source": {
                "title": art["title"],
                "url": EN_URL + urllib.parse.quote(art["title"].replace(" ", "_")),
                "revid": art.get("revid"), "licence": LICENCE, "fetched": today,
            },
            "rejected": rejected,
        }
    return {"status": "rejected" if rejected else "miss", "label": poi["label"],
            "rejected": rejected}


# ------------------------------------------------------------- merge

def apply_cache(master, cache):
    """Write ok records into items_full: desc (only over a missing or a
    shorter, non-grounded one) and desc_src for the credit. -> counts."""
    set_new = replaced = 0
    for did, dest in (master.get("destinations") or {}).items():
        for it in (dest.get("activities") or {}).get("items_full") or []:
            rec = cache.get(f"{did}||{it.get('name')}")
            if not rec or rec.get("status") != "ok":
                continue
            old = (it.get("desc") or "").strip()
            if it.get("desc_src") and old:
                continue                      # already a grounded description
            if not old:
                set_new += 1
            elif len(rec["desc"]) > len(old) + 20:
                replaced += 1
            else:
                continue
            it["desc"] = rec["desc"]
            it["desc_src"] = {k: rec["source"][k] for k in
                              ("title", "url", "licence")}
    return {"set": set_new, "replaced": replaced}


# ------------------------------------------------------------- fixtures

def fixture_fetchers(dirpath):
    store = load_json(os.path.join(dirpath, "wikipedia.json"), {}) or {}
    langlinks = load_json(os.path.join(dirpath, "langlinks.json"), {}) or {}

    def fetch(title):
        art = store.get(title)
        return dict(art, title=art.get("title", title)) if art else None

    def search(name, country):
        for t in store:
            if norm_name(name) in norm_name(t):
                return t
        return None

    def resolve_en(lang, title):
        return langlinks.get(f"{lang}:{title}")

    return fetch, search, resolve_en


def live_fetchers():
    def fetch(title):
        return hpi.fetch_article(EN_API, title)

    def search(name, country):
        return hpi.search_title(EN_API, name, country)

    def resolve_en(lang, title):
        return en_title_via_langlinks(lang, title)

    return fetch, search, resolve_en


# ------------------------------------------------------------- main

def print_coverage(pois, cache):
    rows = coverage(pois, cache)
    print(f"{'':4}{'label':12}{'POIs':>7}{'with desc':>11}{'%':>6}{'harvested':>11}")
    for (cc, lab), r in sorted(rows.items()):
        print(f"{cc:4}{lab:12}{r['n']:>7}{r['with_desc']:>11}"
              f"{round(100 * r['with_desc'] / max(1, r['n'])):>5}%{r['harvested']:>11}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", nargs="?", default="run", choices=("run", "apply"))
    ap.add_argument("--countries", default=",".join(COUNTRIES))
    ap.add_argument("--master", default=MASTER)
    ap.add_argument("--limit", type=int)
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--fixtures")
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()

    master = load_json(args.master, None)
    if not isinstance(master, dict) or "destinations" not in master:
        sys.exit(f"[poi-desc] master not readable at {args.master} "
                 "(an LFS pointer or missing): run on the owner box")
    pois = select_pois(master, tuple(args.countries.split(",")))
    cache = {} if args.refresh else (load_json(args.out, {}) or {})
    print(f"[poi-desc] {len(pois)} must-see and recommended POIs, "
          f"{len(cache)} stored")

    if args.report:
        print_coverage(pois, cache)
        return
    if args.mode == "apply":
        res = apply_cache(master, cache)
        atomic_write_json(args.master, master)
        print(f"[poi-desc] applied: {res}")
        return

    fetch, search, resolve_en = (fixture_fetchers(args.fixtures) if args.fixtures
                                 else live_fetchers())
    pace = 0 if args.fixtures else PACE_S
    todo = [p for p in pois if p["key"] not in cache]
    if args.limit:
        todo = todo[: args.limit]
    print(f"[poi-desc] {len(todo)} to fetch")
    for n, p in enumerate(todo):
        try:
            cache[p["key"]] = build_record(p, fetch, search, resolve_en, pace)
        except Exception as e:  # noqa: BLE001 - resumable
            print(f"  {p['key']}: {e}")
            time.sleep(2)
            continue
        if (n + 1) % 50 == 0:
            atomic_write_json(args.out, cache)
            print(f"  {n + 1}/{len(todo)}", flush=True)
    atomic_write_json(args.out, cache)
    print_coverage(pois, cache)


if __name__ == "__main__":
    main()
