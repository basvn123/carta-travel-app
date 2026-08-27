"""Put a month on the festivals.

cache/events_wikidata.json ships 975 events and only 109 of them carry a
month, so the dossier's festival list mostly said "there is a film festival"
without answering the one question a traveller has: when. Every event already
has a QID, and Wikidata usually knows the date under one of a handful of
properties. This pass fetches them 50 items per call, keyless, and writes the
months back into the cache the destinfo export already reads.

Properties consulted, in order of how well they answer "when is it":
  P837  day in year for periodic occurrence  (the recurring date itself)
  P585  point in time                         (a dated edition)
  P580  start time                            (a dated edition's first day)
  P582  end time                              (spans a month boundary)
Where an item is a SERIES with no date of its own, its editions (P527 has
part, P31 instance of pointing back) carry the dates instead, so a second
pass resolves one level of that.

  python pipeline/dossier/harvest_event_dates.py [--limit N] [--refresh]

Writes: cache/events_wikidata.json (months filled in place, atomic), plus a
memo at cache/dossier/event_dates.json so a re-run costs nothing.
ASCII clean, no em dashes, per project convention.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter

sys.path.insert(0, os.path.dirname(__file__))
from common import CACHE, DCACHE, atomic_write_json, load_json  # noqa: E402

EVENTS = os.path.join(CACHE, "events_wikidata.json")
MEMO = os.path.join(DCACHE, "event_dates.json")
API = "https://www.wikidata.org/w/api.php"
UA = {"User-Agent": "CartaDossier/1.0 (https://carta-europetravel.com; "
                    "bas.vannieuwenhuyse123@gmail.com)"}
PACE_S = 0.35
DATE_PROPS = ["P837", "P585", "P580", "P582"]
TIME_RE = re.compile(r"^[+-](\d{4})-(\d{2})-(\d{2})")


def get_entities(qids):
    params = {
        "action": "wbgetentities", "format": "json", "ids": "|".join(qids),
        "props": "claims", "languages": "en",
    }
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(params),
                                 headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r).get("entities", {})


def months_from_claims(claims):
    """Months named by any date property, plus the QIDs of any editions."""
    months, editions = set(), set()
    for prop in DATE_PROPS:
        for claim in claims.get(prop, []):
            dv = (claim.get("mainsnak", {}).get("datavalue") or {}).get("value")
            if not isinstance(dv, dict):
                continue
            m = TIME_RE.match(dv.get("time") or "")
            if not m:
                continue
            prec = dv.get("precision", 11)
            if prec < 10:                     # year or coarser says nothing
                continue
            month = int(m.group(2))
            if 1 <= month <= 12:
                months.add(month)
    for prop in ("P527", "P1811"):            # has part / has list
        for claim in claims.get(prop, []):
            dv = (claim.get("mainsnak", {}).get("datavalue") or {}).get("value")
            if isinstance(dv, dict) and dv.get("id"):
                editions.add(dv["id"])
    return sorted(months), sorted(editions)[:6]


def resolve(qids, memo, depth=0):
    """qid -> months, filling the memo. One level of edition-following."""
    todo = [q for q in qids if q not in memo]
    for i in range(0, len(todo), 50):
        batch = todo[i:i + 50]
        try:
            ents = get_entities(batch)
        except Exception as e:  # noqa: BLE001 - resumable
            print(f"  batch {i // 50}: {e}")
            time.sleep(5)
            continue
        follow = {}
        for qid, ent in ents.items():
            months, editions = months_from_claims(ent.get("claims", {}) or {})
            memo[qid] = {"months": months}
            if not months and editions and depth == 0:
                follow[qid] = editions
        if follow and depth == 0:
            child_ids = sorted({c for v in follow.values() for c in v})
            child_memo = {}
            resolve(child_ids, child_memo, depth=1)
            for qid, editions in follow.items():
                ms = Counter()
                for c in editions:
                    for m in (child_memo.get(c) or {}).get("months") or []:
                        ms[m] += 1
                if ms:
                    # The month its editions agree on, not every month any
                    # edition ever fell in.
                    top = max(ms.values())
                    memo[qid] = {"months": sorted(m for m, n in ms.items()
                                                  if n >= max(top, 2) - 1)[:3],
                                 "via": "editions"}
        time.sleep(PACE_S)


# ------------------------------------------------------------ Wikipedia pass

WP_API = "https://en.wikipedia.org/w/api.php"
MONTHS = ["january", "february", "march", "april", "may", "june", "july",
          "august", "september", "october", "november", "december"]
MONTH_ALT = "|".join(MONTHS)
# "held annually in July", "takes place each August", "runs from June to July".
# The recurrence word is required: without it "founded in March 1952" would
# read as a festival date, which is exactly the wrong answer confidently given.
RECUR_RE = re.compile(
    r"(annual|annually|every year|each year|yearly|takes place|held|runs|"
    r"celebrated|staged|organised|organized)\b[^.]{0,90}?\b(" + MONTH_ALT + r")\b",
    re.I)
RANGE_RE = re.compile(r"\b(" + MONTH_ALT + r")\b\s*(?:to|and|until|through|[-])\s*\b("
                      + MONTH_ALT + r")\b", re.I)
# A month glued to a year is an edition or a founding, not the recurring date.
DATED_RE = re.compile(r"\b(" + MONTH_ALT + r")\b\s+\d{4}", re.I)


def wp_titles_from(events):
    out = {}
    for ev in events:
        url = ev.get("wp") or ""
        m = re.search(r"/wiki/([^#?]+)", url)
        if m and "en.wikipedia.org" in url:
            out[urllib.parse.unquote(m.group(1)).replace("_", " ")] = ev["qid"]
    return out


def fetch_extracts(titles):
    params = {
        "action": "query", "format": "json", "prop": "extracts",
        "exintro": 1, "explaintext": 1, "redirects": 1,
        "titles": "|".join(titles),
    }
    req = urllib.request.Request(WP_API + "?" + urllib.parse.urlencode(params),
                                 headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.load(r)
    norm = {}
    for item in d.get("query", {}).get("normalized", []) or []:
        norm[item["to"]] = item["from"]
    for item in d.get("query", {}).get("redirects", []) or []:
        norm[item["to"]] = norm.get(item["from"], item["from"])
    out = {}
    for page in (d.get("query", {}).get("pages", {}) or {}).values():
        title = page.get("title")
        out[norm.get(title, title)] = page.get("extract") or ""
    return out


def months_from_text(text):
    if not text:
        return []
    body = text[:900]
    masked = DATED_RE.sub(" ", body)
    found = []
    m = RECUR_RE.search(masked)
    if m:
        found.append(MONTHS.index(m.group(2).lower()) + 1)
        tail = masked[m.end() - 12:m.end() + 40]
        r = RANGE_RE.search(tail)
        if r:
            a = MONTHS.index(r.group(1).lower()) + 1
            b = MONTHS.index(r.group(2).lower()) + 1
            found = list(range(a, b + 1)) if a <= b else [a, b]
    return sorted(set(found))[:3]


def wikipedia_pass(dests, memo):
    pending = [ev for evs in dests.values() for ev in (evs or [])
               if ev.get("qid") and not ev.get("months")
               and not (memo.get(ev["qid"]) or {}).get("wp_done")]
    by_title = wp_titles_from(pending)
    titles = sorted(by_title)
    print(f"[dates] Wikipedia pass over {len(titles)} articles")
    filled = 0
    for i in range(0, len(titles), 20):
        batch = titles[i:i + 20]
        try:
            extracts = fetch_extracts(batch)
        except Exception as e:  # noqa: BLE001 - resumable
            print(f"  wp batch {i // 20}: {e}")
            time.sleep(5)
            continue
        for title, text in extracts.items():
            qid = by_title.get(title)
            if not qid:
                continue
            rec = memo.setdefault(qid, {})
            rec["wp_done"] = True
            ms = months_from_text(text)
            if ms:
                rec["months"] = ms
                rec["via"] = "wikipedia_lead"
                filled += 1
        time.sleep(PACE_S)
        if (i // 20) % 10 == 0:
            atomic_write_json(MEMO, memo)
    print(f"[dates] Wikipedia lead gave {filled} more months")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()

    data = load_json(EVENTS, {}) or {}
    dests = data.get("dests") or {}
    memo = {} if args.refresh else (load_json(MEMO, {}) or {})

    qids = []
    for evs in dests.values():
        for ev in evs or []:
            if ev.get("qid") and not ev.get("months"):
                qids.append(ev["qid"])
    qids = sorted(set(qids))
    if args.limit:
        qids = qids[: args.limit]
    print(f"[dates] {len(qids)} undated events, {len(memo)} already memoised")

    resolve(qids, memo)
    atomic_write_json(MEMO, memo)
    wikipedia_pass(dests, memo)
    atomic_write_json(MEMO, memo)

    filled = 0
    for evs in dests.values():
        for ev in evs or []:
            if ev.get("months"):
                continue
            ms = (memo.get(ev.get("qid")) or {}).get("months")
            if ms:
                ev["months"] = ms
                filled += 1
    atomic_write_json(EVENTS, data)
    total = sum(len(v or []) for v in dests.values())
    dated = sum(1 for v in dests.values() for e in (v or []) if e.get("months"))
    print(f"[dates] filled {filled}; {dated}/{total} events now carry a month")


if __name__ == "__main__":
    main()
