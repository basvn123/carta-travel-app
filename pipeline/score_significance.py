"""score_significance.py - composite POI significance -> recalibrated rate.

Replaces blind trust in the harvest-time `rate` (OpenTripMap's generous 0-3,
Overture's cap-2, sitelink backfills) with a composite score built from
independent open signals, per the 2026-08 open-data playbook:

  s_views      log avg daily Wikipedia pageviews (attention), z-scored
  s_sitelinks  log Wikidata sitelink count (language-neutral notability)
  s_heritage   heritage designation (Wikidata P1435 or the OTM register flag)
  s_wv         Wikivoyage See/Do listing membership, weighted by how early
               the editor placed it (expert curation, counters popularity bias)
  s_prior      the old rate as a weak prior (keeps harvest knowledge alive
               for POIs no external source corroborates)

2026-09 (A2): POIs without a wiki URL - 84% of the catalogue - used to fall
through to prior-plus-heritage only, which collapsed them into six giant tie
blocks and made the destination rating's highlights component nearly modal.
They now pick up sitelink evidence from cache/wikidata_landmarks.json (the
backfill_landmarks WDQS box harvest: every entity with >= 10 sitelinks near
each destination): an item matches a landmark row by shared name token within
160 m, or within 70 m regardless of name, blacklisted types and
settlement-describing shortdescs excluded. Unmatched no-wiki POIs still score
prior-only - unmeasured stays low; it just no longer drags measured places
into its tie block.

  blend = 0.6 * per-destination percentile + 0.4 * catalogue-wide percentile

Per-city normalisation is the playbook's key trick: the best sight of a small
town keeps its local tier-1 even though Paris would crush it globally.

New rate is assigned by LOCAL quota so the "top sight" tier discriminates
again (the audit found 29% of the whole catalogue at rate-3, and 192 dests
where over 45% of the list was "top"):

  rate 3   top ~12% of the dest's live items (min 1 for dests with >= 6
           items, max 12), corroboration required (wiki/heritage/WV listing)
  rate 2   next ~28%
  rate 1   the rest
  rate 0   untouched (noise demotions stay demoted)

dup-tagged and noise-tagged items are excluded from quotas and never scored.

Modes:
    python score_significance.py             # report + validation, no writes
    python score_significance.py apply       # gate must pass, then write
                                             # it.rate, it.sig (+ it.pop)
    python score_significance.py apply --sig-only
                                             # write ONLY it.sig - the absolute
                                             # 0-3 significance (catalogue-wide
                                             # percentile of the composite
                                             # score) the destination rating's
                                             # highlights component reads.
                                             # Leaves the town-relative rate,
                                             # and everything downstream of it
                                             # (planner deck, place.depth),
                                             # untouched.
Artifacts:
    cache/poi_significance.json      compact per-POI ledger [i, old, new, blend]
    logs/significance_report.json    distributions, movers, validation
"""
import argparse
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

from pipeline_io import atomic_write_json, load_json
from dedupe_pois import name_core, haversine_km
from backfill_landmarks import TYPE_BLACKLIST, BAD_DESC_RE, tokens

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "app_data" / "app_data.json"
ENRICH_CACHE = ROOT / "app_data" / "enrich_cache.json"
WD_CACHE = ROOT / "cache" / "poi_wikidata.json"
LM_CACHE = ROOT / "cache" / "wikidata_landmarks.json"
WV_CACHE = ROOT / "cache" / "wikivoyage_listings.json"
OUT_LEDGER = ROOT / "cache" / "poi_significance.json"
OUT_REPORT = ROOT / "logs" / "significance_report.json"

WEIGHTS = {"views": 0.30, "sitelinks": 0.30, "heritage": 0.15,
           "wv": 0.15, "prior": 0.10,
           # 2026-09 (A2): documentation presence - the enrichers found a
           # Commons image and/or a Wikipedia description for this POI by
           # geosearch + name match. Weak but INDEPENDENT evidence that the
           # sight is documentable at all, and the only signal that varies
           # inside the no-wiki mass (84% of POIs), which otherwise collapses
           # into six giant prior-x-heritage tie blocks. Kept small so it can
           # break ties without ever outranking sitelinks or pageviews.
           "docum": 0.06}
LOCAL_BLEND = 0.6                 # vs catalogue-wide percentile
RATE3_SHARE = 0.12
RATE2_SHARE = 0.28
RATE3_MIN_ITEMS = 6               # dests smaller than this get no forced 3
RATE3_CAP = 12
WV_MATCH_KM = 1.5                 # listing-to-POI geo tolerance

# Validation gate (playbook: tier precision >= ~0.8 on a gold set).
GATE_MIN_ANCHOR_RECALL = 0.80


def zlog(values):
    """log1p then z-score; zeros stay meaningfully low."""
    logs = [math.log1p(max(0.0, v)) for v in values]
    n = len(logs)
    if not n:
        return []
    mean = sum(logs) / n
    var = sum((x - mean) ** 2 for x in logs) / n
    sd = math.sqrt(var) or 1.0
    return [(x - mean) / sd for x in logs]


def percentile_ranks(values):
    """value list -> percentile 0..1, average rank on ties."""
    order = sorted(range(len(values)), key=lambda i: values[i])
    pct = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        avg = (i + j) / 2.0 / max(1, len(order) - 1)
        for k in range(i, j + 1):
            pct[order[k]] = avg
        i = j + 1
    return pct


def build_wv_index(wv):
    """dest id -> (qid set, [(name_core, lat, lon, weight)], status)."""
    out = {}
    for did, rec in wv.items():
        listings = rec.get("listings") or []
        if not listings and not rec.get("status"):
            continue
        n = len(listings) or 1
        qids = {}
        named = []
        for L in listings:
            # earlier in the See/Do section = more prominent (playbook B):
            # first listing weight 1.0, tail approaches 0.5
            w = 1.0 - 0.5 * (L.get("order", 0) / max(1, n - 1) if n > 1 else 0)
            if L.get("qid"):
                qids[L["qid"]] = max(w, qids.get(L["qid"], 0))
            for nm in filter(None, (L.get("name"), L.get("alt"))):
                core = name_core(nm)
                if core:
                    named.append((core, L.get("lat"), L.get("lon"), w))
        out[did] = (qids, named, rec.get("status"))
    return out


def wv_weight_for(item, qid, wv_entry):
    if not wv_entry:
        return 0.0
    qids, named, _status = wv_entry
    if qid and qid in qids:
        return qids[qid]
    core = name_core(item.get("name"))
    if not core:
        return 0.0
    best = 0.0
    for lcore, lat, lon, w in named:
        if lcore != core:
            continue
        if lat is not None and isinstance(item.get("lat"), (int, float)):
            if haversine_km(item["lat"], item["lon"], lat, lon) > WV_MATCH_KM:
                continue
        best = max(best, w)
    return best


LM_MATCH_M = 0.160     # km: shared-name-token acceptance radius
LM_TIGHT_M = 0.070     # km: same-place acceptance radius, name or not


def build_lm_index(lm):
    """dest id -> [(qid, lat, lon, sl, art, label_tokens)] worth matching."""
    out = {}
    for did, rows in lm.items():
        keep = []
        for row in rows:
            try:
                qid, lat, lon, sl, _img, art, label, sdesc, types = row
            except (TypeError, ValueError):
                continue
            if any(t in TYPE_BLACKLIST for t in types or ()):
                continue
            if sdesc and BAD_DESC_RE.search(sdesc):
                continue
            if label and BAD_DESC_RE.search(label):
                continue
            keep.append((qid, lat, lon, sl, art, tokens(label or "")))
        if keep:
            out[did] = keep
    return out


def lm_match(item, lm_rows):
    """Best landmark row for one POI: (sitelinks, article) or (0, None).

    Shared name token within LM_MATCH_M, or LM_TIGHT_M on distance alone -
    the same acceptance rule backfill_landmarks uses to decide two records
    are the same place, so join and harvest cannot drift apart.
    """
    ilat, ilon = item.get("lat"), item.get("lon")
    if not isinstance(ilat, (int, float)) or not lm_rows:
        return 0, None
    itoks = tokens(item.get("name") or "")
    best = (0, None)
    for qid, lat, lon, sl, art, ltoks in lm_rows:
        km = haversine_km(ilat, ilon, lat, lon)
        if km > LM_MATCH_M:
            continue
        if (itoks & ltoks) or km <= LM_TIGHT_M:
            if sl > best[0]:
                best = (sl, art)
    return best


def compute(data):
    pop = (load_json(ENRICH_CACHE).get("pop")) or {}
    wd = load_json(WD_CACHE)
    lm_index = build_lm_index(load_json(LM_CACHE) if LM_CACHE.exists() else {})
    wv_index = build_wv_index(load_json(WV_CACHE))

    rows = []                      # one per live POI
    for did, d in data["destinations"].items():
        items = (d.get("activities") or {}).get("items_full") or []
        wv_entry = wv_index.get(did)
        for i, it in enumerate(items):
            if it.get("dup") or it.get("noise"):
                continue
            url = it.get("wiki")
            wrec = wd.get(url) or {} if url else {}
            qid = wrec.get("qid")
            views = pop.get(url) or 0
            sl = wrec.get("sitelinks") or 0
            lm_hit = False
            if not sl:
                # no direct Wikidata identity: try the landmark box harvest
                sl, lm_art = lm_match(it, lm_index.get(did))
                if sl:
                    lm_hit = True
                    if not views and lm_art:
                        views = pop.get(lm_art) or 0
            heritage = bool(wrec.get("heritage") or it.get("heritage"))
            # An article about an admin area / settlement / railway station
            # lends the POI the TOWN's fame, not the sight's: a district
            # filed as a sight, or a statue whose link resolves to the city
            # article, would inherit 100+ sitelinks. Zero the attention
            # signals and do not let the link count as corroboration.
            misattributed = bool(wrec.get("admin") or wrec.get("station"))
            if misattributed:
                views = 0
                sl = 0
            wvw = wv_weight_for(it, qid, wv_entry)
            visitors = wrec.get("visitors") or 0
            docum = 0.5 * bool(it.get("img")) + 0.5 * bool(it.get("desc"))
            rows.append({
                "did": did, "i": i, "it": it, "mis": misattributed,
                "views": views, "sl": sl, "heritage": heritage,
                "wv": wvw, "visitors": visitors, "docum": docum,
                "prior": (it.get("rate") or 0) / 3.0,
                "corroborated": bool((url and not misattributed)
                                     or heritage or wvw > 0 or lm_hit),
            })

    zs_views = zlog([r["views"] for r in rows])
    zs_sl = zlog([r["sl"] for r in rows])
    for r, zv, zs in zip(rows, zs_views, zs_sl):
        her = 1.0 if r["heritage"] else 0.0
        if r["visitors"] > 0:      # direct visitor counts are rare but decisive
            her = max(her, min(1.5, 0.5 + math.log10(r["visitors"]) / 6))
        r["score"] = (WEIGHTS["views"] * zv
                      + WEIGHTS["sitelinks"] * zs
                      + WEIGHTS["heritage"] * her
                      + WEIGHTS["wv"] * r["wv"]
                      + WEIGHTS["prior"] * r["prior"]
                      + WEIGHTS["docum"] * r["docum"])

    # percentiles: catalogue-wide and per destination
    euro = percentile_ranks([r["score"] for r in rows])
    for r, e in zip(rows, euro):
        r["euro_pct"] = e
        # Absolute significance, 0-3: where this sight stands against every
        # live POI in Europe, on the same composite evidence the quota tiers
        # read. This is the signal `rate` deliberately is NOT: rate answers
        # "top of THIS town?" for the day planner's deck, sig answers "how
        # big a deal is this anywhere?" for the destination rating. The
        # rating's highlights component (rating_layer.highlights01) collapsed
        # to a constant precisely because it read the town-relative rate as
        # if it were this number.
        r["sig"] = round(3.0 * e, 3)
    by_dest = defaultdict(list)
    for r in rows:
        by_dest[r["did"]].append(r)
    for did, rs in by_dest.items():
        local = percentile_ranks([r["score"] for r in rs])
        for r, L in zip(rs, local):
            r["blend"] = LOCAL_BLEND * L + (1 - LOCAL_BLEND) * r["euro_pct"]

    # local quota re-tiering
    for did, rs in by_dest.items():
        n = len(rs)
        rs_sorted = sorted(rs, key=lambda r: -r["blend"])
        n3 = min(RATE3_CAP, max(1 if n >= RATE3_MIN_ITEMS else 0,
                                round(RATE3_SHARE * n)))
        n2 = round(RATE2_SHARE * n)
        given3 = 0
        for r in rs_sorted:
            if given3 < n3 and r["corroborated"]:
                r["new_rate"] = 3
                given3 += 1
            else:
                r["new_rate"] = None
        rest = [r for r in rs_sorted if r["new_rate"] is None]
        for k, r in enumerate(rest):
            r["new_rate"] = 2 if k < n2 else 1

    # Expert-designation floor (playbook: weight heritage alongside
    # popularity so quotas in POI-dense cities cannot bury a designated,
    # internationally notable monument - e.g. a UNESCO ensemble ranking
    # 60th in Brussels' 150-item list).
    HERITAGE_FLOOR_SL = 15
    for r in rows:
        if (r["heritage"] and r["sl"] >= HERITAGE_FLOOR_SL
                and r["new_rate"] < 2):
            r["new_rate"] = 2
    return rows, by_dest


def validate(rows):
    """Anchor checks standing in for a hand-labelled gold set."""
    checks = {}
    # 1. Unmissable anchors: heritage-designated AND >= 25 sitelinks (a
    #    world-famous protected monument) must land rate >= 2.
    anchors = [r for r in rows if r["heritage"] and r["sl"] >= 25]
    ok = sum(1 for r in anchors if r["new_rate"] >= 2)
    checks["famous_heritage_rate2plus"] = {
        "total": len(anchors), "pass": ok,
        "recall": round(ok / len(anchors), 3) if anchors else None}
    # 2. Wikivoyage editors' top picks (first third of See listings) >= 2.
    picks = [r for r in rows if r["wv"] >= 0.85]
    ok2 = sum(1 for r in picks if r["new_rate"] >= 2)
    checks["wv_top_listings_rate2plus"] = {
        "total": len(picks), "pass": ok2,
        "recall": round(ok2 / len(picks), 3) if picks else None}
    # 3. Anti-noise: nothing uncorroborated may hold rate 3.
    bad3 = sum(1 for r in rows if r["new_rate"] == 3 and not r["corroborated"])
    checks["uncorroborated_rate3"] = {"count": bad3, "pass": bad3 == 0}
    # gate
    recalls = [c["recall"] for c in
               (checks["famous_heritage_rate2plus"],
                checks["wv_top_listings_rate2plus"]) if c["recall"] is not None]
    checks["gate_passed"] = (bool(recalls)
                             and min(recalls) >= GATE_MIN_ANCHOR_RECALL
                             and bad3 == 0)
    return checks


def spearman(old, new):
    if len(old) < 3:
        return None
    ro, rn = percentile_ranks(old), percentile_ranks(new)
    mo, mn = sum(ro) / len(ro), sum(rn) / len(rn)
    num = sum((a - mo) * (b - mn) for a, b in zip(ro, rn))
    da = math.sqrt(sum((a - mo) ** 2 for a in ro))
    db = math.sqrt(sum((b - mn) ** 2 for b in rn))
    return num / (da * db) if da and db else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", nargs="?", default="report",
                    choices=["report", "apply"])
    ap.add_argument("--sig-only", action="store_true",
                    help="apply: write it.sig only; never touch rate or pop")
    args = ap.parse_args()

    data = json.loads(DATA.read_text(encoding="utf-8"))
    rows, by_dest = compute(data)
    checks = validate(rows)

    old_dist = defaultdict(int)
    new_dist = defaultdict(int)
    movers = []
    cors = []
    for did, rs in by_dest.items():
        cor = spearman([r["it"].get("rate") or 0 for r in rs],
                       [r["new_rate"] for r in rs])
        if cor is not None:
            cors.append((did, round(cor, 3)))
    for r in rows:
        old = r["it"].get("rate") or 0
        old_dist[old] += 1
        new_dist[r["new_rate"]] += 1
        if abs(old - r["new_rate"]) >= 2:
            movers.append((r["did"], r["it"].get("name"), old, r["new_rate"],
                           round(r["blend"], 3)))
    movers.sort(key=lambda m: -abs(m[2] - m[3]))
    cors.sort(key=lambda c: c[1])

    n = len(rows)
    print(f"{n} live POIs scored ({len(by_dest)} dests)")
    print(f"old rate dist: {dict(sorted(old_dist.items()))}")
    print(f"new rate dist: {dict(sorted(new_dist.items()))}")
    print(f"rate-3 share: {old_dist[3] / n:.1%} -> {new_dist[3] / n:.1%}")
    print("validation:")
    for k, v in checks.items():
        print(f"   {k}: {v}")
    med = sorted(c for _d, c in cors)[len(cors) // 2] if cors else None
    print(f"median per-dest Spearman(old,new): {med}")
    print(f"least-agreeing dests: {cors[:8]}")
    print(f"biggest movers ({len(movers)} with |delta| >= 2), sample:")
    for m in movers[:12]:
        print(f"   {m[0]}: '{m[1]}' {m[2]} -> {m[3]} (blend {m[4]})")

    report = {"checks": checks,
              "old_dist": dict(old_dist), "new_dist": dict(new_dist),
              "median_spearman": med,
              "movers_sample": movers[:200],
              "least_agreeing": cors[:50]}
    OUT_REPORT.parent.mkdir(exist_ok=True)
    atomic_write_json(OUT_REPORT, report)
    ledger = defaultdict(list)
    for r in rows:
        ledger[r["did"]].append([r["i"], r["it"].get("rate") or 0,
                                 r["new_rate"], round(r["blend"], 4)])
    atomic_write_json(OUT_LEDGER, ledger, indent=None, separators=(",", ":"))
    print(f"report -> {OUT_REPORT}\nledger -> {OUT_LEDGER}")

    if args.mode == "apply":
        if not checks["gate_passed"]:
            print("GATE FAILED: not writing the master.")
            sys.exit(1)
        pop = (load_json(ENRICH_CACHE).get("pop")) or {}
        n_rate = n_pop = n_sig = 0
        for r in rows:
            it = r["it"]
            if it.get("sig") != r["sig"]:
                it["sig"] = r["sig"]
                n_sig += 1
            if args.sig_only:
                continue
            if (it.get("rate") or 0) != r["new_rate"]:
                it["rate"] = r["new_rate"]
                n_rate += 1
            url = it.get("wiki")
            if r["mis"]:
                # town/station article fame is not this POI's fame; the UI
                # orders same-rate sights by pop, so a poisoned value would
                # float the knockoffs.
                if "pop" in it:
                    del it["pop"]
            elif url and url in pop and it.get("pop") != int(pop[url]):
                it["pop"] = int(pop[url])
                n_pop += 1
        atomic_write_json(DATA, data)
        print(f"applied: {n_rate} rates rewritten, {n_pop} pop set, "
              f"{n_sig} sig written -> {DATA}")


if __name__ == "__main__":
    main()
