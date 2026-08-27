"""Audit every built dossier against the contract, and say what is wrong.

This is the acceptance-test set from the build spec, written as assertions
over the shipped files rather than as prose in a document. Each check
corresponds to a specific way the destination page or the exported PDF fails
in public, so a regression shows up here before a reader finds it.

  python pipeline/dossier/audit.py              summary + the worst offenders
  python pipeline/dossier/audit.py --strict     exit 1 if any HARD check fails
  python pipeline/dossier/audit.py --full       list every failing destination

Checks, and why each one exists:

  IMG-1  a gallery of five or more, for tier 1+          the panel swipes it
  IMG-2  no attribution-required image with no author    a licence breach
  IMG-3  every image on a Wikimedia host                 no hotlinking a CDN
  IMG-4  no photographer more than twice per gallery     one uploader is not a place
  IMG-5  no crest, map, diagram or period piece          Paris shipped its city crest
  HL-1   no highlight typed "Square" by default          the OpenTripMap bucket
  HL-2   no near-duplicate pair in one destination       "Berat Castle" twice
  HL-3   every highlight carries a coordinate            it has to be mappable
  HL-4   no kind over 60 percent of a highlight set      a valley of twelve peaks
  HL-5   the place is not its own highlight              "Paris" ranked first
  DO-1   web items cite 3+ distinct domains              the corroboration gate
  DO-2   open items cite 2+ institutions, or are curated same gate, open data
  DO-3   tier 1+ destinations have something to do       the 466 empty sections
  TRIP-1 every trip carries a travel time and a mode     "somewhere 84 km away"
  TRIP-2 no trip is the destination itself
  INT-1  no gateway record describes its airport         CDG opened with the hub
  FEST-1 festivals carry a month where one is known
  CRD-1  credits resolve, and cover what the file shows
  SCH-1  required keys present, no empty section shipped

ASCII clean, no em dashes, per project convention.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from common import (  # noqa: E402
    PUB, REPORTS, atomic_write_json, commons_filename, haversine_km, image_ok,
    licence_verdict, load_json, norm_name, usable_desc,
)

DOSSIER = os.path.join(PUB, "dossier")
WIKI_HOSTS = ("upload.wikimedia.org", "commons.wikimedia.org",
              "wikimedia.org", "wikipedia.org")
AIRPORTY = re.compile(r"\bairport\b|\baerodrome\b|\bairfield\b", re.I)

# A failing HARD check is a bug; a failing SOFT one is a coverage gap that
# depends on how much of the catalogue has been harvested, and it is reported
# without failing the run.
HARD = {"IMG-2", "IMG-3", "IMG-4", "IMG-5", "HL-2", "HL-3", "HL-5",
        "DO-1", "DO-2", "TRIP-1", "TRIP-2", "INT-1", "SCH-1", "LNG-1"}


def audit_one(d, dest, fail):
    """Record every failure for one dossier into `fail[check][id] = detail`."""
    did = d.get("id", "?")
    tier = (dest.get("rating") or {}).get("tier", 0)

    def bad(code, detail):
        fail[code][did] = detail

    # ---- schema
    for key in ("id", "slug", "schema", "place", "credits", "content_hash"):
        if not d.get(key):
            bad("SCH-1", f"missing {key}")
    for key, val in d.items():
        if isinstance(val, (list, dict)) and len(val) == 0:
            bad("SCH-1", f"empty section shipped: {key}")

    # ---- gallery
    gallery = d.get("gallery") or []
    if tier >= 1 and len(gallery) < 5:
        bad("IMG-1", f"{len(gallery)} images")
    authors = Counter()
    for g in gallery:
        url = g.get("url") or ""
        if url and not any(h in url for h in WIKI_HOSTS):
            bad("IMG-3", url[:70])
        if g.get("ok_print") and licence_verdict(g.get("licence"),
                                                 g.get("author")) != "ok":
            bad("IMG-2", f"{commons_filename(url)}: {g.get('licence')}")
        if not image_ok(url, g.get("w"), g.get("h")):
            bad("IMG-5", str(commons_filename(url))[:60])
        if g.get("author"):
            authors[g["author"]] += 1
    for author, n in authors.items():
        if n > 2:
            bad("IMG-4", f"{author} x{n}")

    # ---- highlights
    hl = d.get("highlights") or []
    kinds = Counter()
    for h in hl:
        if h.get("lat") is None or h.get("lon") is None:
            bad("HL-3", h.get("name", "?"))
        if h.get("kind") == "Square" and h.get("resolved_by") != "retyped":
            bad("HL-1", h.get("name", "?"))
        kinds[h.get("kind")] += 1
        if h.get("image") and not image_ok(h["image"].get("url"),
                                           h["image"].get("w"),
                                           h["image"].get("h")):
            bad("IMG-5", "highlight " + str(h.get("name"))[:40])
    if hl:
        top_kind, n = kinds.most_common(1)[0]
        if len(hl) >= 5 and n / len(hl) > 0.6:
            bad("HL-4", f"{n}/{len(hl)} {top_kind}")
    place_n = norm_name(d.get("place", {}).get("name") or "")
    for h in hl:
        # The empty guard matters: before norm_name became Unicode-aware,
        # every Cyrillic name folded to "" and matched every other one.
        hn = norm_name(h.get("name", ""))
        if hn and place_n and hn == place_n:
            bad("HL-5", h.get("name", "?"))
    # near-duplicates: name containment plus centroids within 300 m
    for i in range(len(hl)):
        for j in range(i + 1, len(hl)):
            a, b = hl[i], hl[j]
            na, nb = norm_name(a.get("name", "")), norm_name(b.get("name", ""))
            if not na or not nb or na == nb:
                continue
            if (na in nb or nb in na) and None not in (a.get("lat"), b.get("lat")):
                if haversine_km(a["lat"], a["lon"], b["lat"], b["lon"]) <= 0.3:
                    bad("HL-2", f"{a['name']} / {b['name']}")

    # ---- things to do
    do = d.get("do") or []
    for item in do:
        ev = item.get("evidence") or {}
        if ev.get("method") == "web":
            if (ev.get("n_sources") or 0) < 3:
                bad("DO-1", f"{item.get('name')}: {ev.get('n_sources')}")
        elif ev.get("method") == "open":
            if (ev.get("n_sources") or 0) < 2 and not ev.get("curated"):
                bad("DO-2", f"{item.get('name')}: {ev.get('n_sources')}")
        elif ev:
            bad("DO-2", f"{item.get('name')}: unknown method {ev.get('method')}")
    if tier >= 1 and not do:
        bad("DO-3", "no things to do")

    # ---- trips
    for tr in d.get("trips") or []:
        if tr.get("kind") == "destination":
            travel = tr.get("travel") or {}
            if not travel.get("minutes") or not travel.get("mode"):
                bad("TRIP-1", tr.get("name", "?"))
            if tr.get("id") == did:
                bad("TRIP-2", tr.get("name", "?"))

    # ---- intro
    body = (d.get("intro") or {}).get("body") or ""
    if body and AIRPORTY.search(body[:220]):
        bad("INT-1", body[:60])

    # ---- language: an English page must not print a foreign description
    for row in (hl + do):
        text = row.get("fact") or row.get("detail") or ""
        if text and usable_desc(text) is None:
            bad("LNG-1", f"{row.get('name')}: {text[:50]}")

    # ---- festivals
    fests = d.get("festivals") or []
    undated = sum(1 for f in fests if not f.get("months"))
    if fests and undated == len(fests) and len(fests) >= 3:
        bad("FEST-1", f"{undated} festivals, none dated")

    # ---- credits
    keys = {c.get("key") for c in d.get("credits") or []}
    if not keys:
        bad("CRD-1", "no credits")
    if gallery and "commons" not in keys:
        bad("CRD-1", "photographs without a Commons credit")
    if d.get("parking") and "osm" not in keys:
        bad("CRD-1", "parking without an OSM credit")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--full", action="store_true")
    args = ap.parse_args()

    dests = (load_json(os.path.join(PUB, "app_data.json")) or {}).get(
        "destinations", {})
    files = [f for f in os.listdir(DOSSIER)
             if f.endswith(".json") and f != "index.json"]
    print(f"auditing {len(files)} dossiers...")

    fail = defaultdict(dict)
    stats = Counter()
    hist = defaultdict(Counter)
    per_cc = defaultdict(Counter)
    for fn in files:
        d = load_json(os.path.join(DOSSIER, fn))
        if not d:
            fail["SCH-1"][fn] = "unreadable"
            continue
        dest = dests.get(d.get("id")) or {}
        audit_one(d, dest, fail)
        stats["n"] += 1
        tier = (dest.get("rating") or {}).get("tier", 0)
        for key, section in (("gallery", d.get("gallery")),
                             ("highlights", d.get("highlights")),
                             ("do", d.get("do")),
                             ("trips", d.get("trips")),
                             ("festivals", d.get("festivals"))):
            n = len(section or [])
            stats[key] += n
            if n:
                stats["has_" + key] += 1
            hist[key][min(n, 10)] += 1
        stats["print_clean"] += sum(1 for g in d.get("gallery") or []
                                    if g.get("ok_print"))
        cc = d.get("place", {}).get("iso2") or "??"
        per_cc[cc]["n"] += 1
        per_cc[cc]["gallery"] += len(d.get("gallery") or [])
        per_cc[cc]["highlights"] += len(d.get("highlights") or [])
        per_cc[cc]["do"] += len(d.get("do") or [])
        per_cc[cc]["fests"] += len(d.get("festivals") or [])
        if not d.get("do"):
            per_cc[cc]["no_do"] += 1
        for item in d.get("do") or []:
            stats["do_" + ((item.get("evidence") or {}).get("method") or "none")] += 1
        if tier >= 1:
            stats["tier1"] += 1
            if d.get("do"):
                stats["tier1_has_do"] += 1

    n = max(stats["n"], 1)
    print(f"\n{'-' * 62}\nCOVERAGE")
    print(f"  dossiers                {stats['n']}")
    print(f"  gallery images          {stats['gallery']} "
          f"({stats['gallery'] / n:.1f} avg, {stats['print_clean'] / n:.1f} print-clean)")
    print(f"  highlights              {stats['highlights']} ({stats['highlights'] / n:.1f} avg)")
    print(f"  things to do            {stats['do']} "
          f"({stats['has_do']} destinations, {100 * stats['has_do'] / n:.1f}%)")
    print(f"     web-evidenced        {stats['do_web']}")
    print(f"     open-evidenced       {stats['do_open']}")
    print(f"  day trips               {stats['trips']} ({stats['has_trips']} destinations)")
    print(f"  festivals               {stats['festivals']} ({stats['has_festivals']} destinations)")
    print(f"  tier 1+ with things to do   {stats['tier1_has_do']}/{stats['tier1']}")

    # Where the gaps concentrate. A country with a lot of empty sections is
    # usually one whose feature layers or Wikivoyage coverage are thin, which
    # is a harvest to run rather than a bug to fix.
    worst_cc = sorted(per_cc.items(),
                      key=lambda kv: -(kv[1]["no_do"] / max(kv[1]["n"], 1)))
    weak = [(cc, s) for cc, s in worst_cc if s["no_do"]][:8]
    if weak:
        print("\n  thinnest countries (share with no things to do)")
        for cc, s in weak:
            print(f"    {cc}  {s['no_do']:>4}/{s['n']:<4} "
                  f"({100 * s['no_do'] / s['n']:4.0f}%)   "
                  f"gallery {s['gallery'] / max(s['n'], 1):4.1f}  "
                  f"highlights {s['highlights'] / max(s['n'], 1):4.1f}")

    print(f"\n{'-' * 62}\nCHECKS")
    worst = []
    for code in sorted(set(list(fail) + ["IMG-1", "IMG-2", "IMG-3", "IMG-4",
                                         "IMG-5", "HL-1", "HL-2", "HL-3",
                                         "HL-4", "HL-5", "DO-1", "DO-2",
                                         "DO-3", "TRIP-1", "TRIP-2", "INT-1",
                                         "FEST-1", "CRD-1", "SCH-1", "LNG-1"])):
        hits = fail.get(code) or {}
        tag = "HARD" if code in HARD else "soft"
        mark = "ok  " if not hits else ("FAIL" if code in HARD else "warn")
        print(f"  {mark} {code:7} {tag}  {len(hits)} destination(s)")
        if hits:
            worst.append((code, len(hits)))
            shown = list(hits.items())[: (None if args.full else 3)]
            for did, detail in shown:
                print(f"          {did}: {str(detail)[:76]}")
            if not args.full and len(hits) > 3:
                print(f"          ... and {len(hits) - 3} more")

    os.makedirs(REPORTS, exist_ok=True)
    atomic_write_json(os.path.join(REPORTS, "dossier_audit.json"), {
        "stats": dict(stats),
        "by_country": {cc: dict(s) for cc, s in sorted(per_cc.items())},
        "histograms": {k: dict(v) for k, v in hist.items()},
        "failures": {k: dict(list(v.items())[:200]) for k, v in fail.items()},
        "failure_counts": {k: len(v) for k, v in fail.items()},
    }, indent=1)
    print(f"\nwrote {os.path.join(REPORTS, 'dossier_audit.json')}")

    hard_fails = [c for c, _ in worst if c in HARD]
    if args.strict and hard_fails:
        print(f"\nSTRICT: {len(hard_fails)} hard check(s) failing: "
              f"{', '.join(hard_fails)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
