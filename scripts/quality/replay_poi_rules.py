"""Replay the POI kind, non-place and dossier filters on the shipped wire (D15, D23).

Read only. It reads the shipped POI shards and dossiers (a directory you pass,
normally the main checkout's continent-app/public), applies the pipeline rules
to a deep copy, and prints the numbers the wave is judged on. Nothing is
written except the --out JSON.

    python -I scripts/quality/replay_poi_rules.py --public <public dir> \
        --rules before|after --out <json> [--dropped-sample <json>]

--rules before   no rule applied: the shipped state (the snapshot to beat)
--rules after    pipeline.pois.normalize_poi_kinds.normalize_items on every
                 shard row, and the dossier predicates when they exist

What it measures, per country (iso2) and per place class:
  * must-sees filed Square whose name has no square word (research regex)
  * must-sees that still match the research event, org, shop and Fondali
    patterns without being a visitable site (heritage or a site word in desc)
  * must-sees dropped as non-places (the sample goes to --dropped-sample so a
    person can read it: a real sight dropped is worse than junk kept)
  * the must-keep list: never noise
  * dossier highlights and festivals the research patterns call banned

Must-sees after the rules: a shard has no `rate` and no config, so labels cannot
be recomputed. A dropped must-see is replaced by the next non-noise
`recommended` row by `sig`, which is what poi_labels does when the next row is
national. That is an approximation and the report says so.

ASCII only. Exit code 1 when a must-keep row is dropped.
"""
import argparse
import copy
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "pois"))
sys.path.insert(0, str(ROOT / "pipeline" / "dossier"))

# Research lists (2026-11-17 data quality research), used as the INDEPENDENT
# check: the classifier in the pipeline is tuned by hand, these are not.
SQ = re.compile(r"(square|place|plaza|piazza|piazzetta|platz|plein|rynek|trg|n[aá]m[eě]st|markt|torget|torv|tori|pra[cç]a|largo|campo|agora|plateia|pia[tț]a|t[eé]r\b|squa|market|forum|ring\b)", re.I)
EVENT = re.compile(r"^(battle|siege|bombing|raid|massacre|treaty|ruhr pocket)\b|\b(battle|siege|war of|massacre|disaster|bombing|shooting|election|treaty)\b", re.I)
ORG = re.compile(r"\b(football club|sports club|company|corporation|political party|school district|association football|supermarket|retailer|bank|record label|newspaper|band\b|organization|organisation)\b", re.I)
SHOP = re.compile(r"^(waitrose|tesco|lidl|aldi|carrefour|sainsbury|mcdonald|starbucks|primark|ikea|asda|morrisons|spar|co-op)\b", re.I)
FONDALI = re.compile(r"^Fondali\b")
SITE = re.compile(r"\b(museum|memorial|battlefield|monument|fort|fortress|castle|ruins?|site|park|palace|cathedral|church|abbey|temple|tower|bridge|gate|wall|camp|cemetery)\b", re.I)
BAD_HL = re.compile(r"(disaster|massacre|bombing|shooting|crash|prison|cemetery|stadium|stadion|stade|arena)", re.I)
BAD_FEST = re.compile(r"(erotic|porn|adult|\bsex|fetish|trade fair|trade show|arms fair)", re.I)

# name pattern, shard it must be in (None = any shard), what it must stay
MUST_KEEP = [
    ("Colosseum", r"^(colosseum|colosseo|flavian amphitheat)", None),
    ("Parthenon", r"^parthenon$", None),
    ("Waterloo", r"(waterloo|lion'?s mound|butte du lion)", None),
    ("Berlin Wall Memorial", r"berlin wall (memorial|documentation)|gedenkst.tte berliner mauer", None),
    ("Auschwitz", r"auschwitz", None),
    ("Pere Lachaise", r"p.re[- ]lachaise", None),
    ("Atomium", r"^atomium$", "BRU"),
    ("Manneken Pis", r"^manneken pis$", "BRU"),
    ("Dam", r"^dam( square)?$", "AMS"),
]


def sid(path):
    return Path(path).stem.replace("_3A", ":")


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def visitable(it):
    return bool(it.get("heritage")) or bool(SITE.search(it.get("desc") or ""))


def research_hits(it):
    """Which research patterns a row matches (event/org/shop/fondali)."""
    nm, ds = it.get("name") or "", it.get("desc") or ""
    hits = []
    if EVENT.search(nm + " | " + ds):
        hits.append("event")
    if ORG.search(ds):
        hits.append("org")
    if SHOP.search(nm):
        hits.append("shop")
    if FONDALI.search(nm):
        hits.append("fondali")
    return hits


def load_rules(mode):
    if mode == "before":
        return None, None, None
    import normalize_poi_kinds as n
    hl = fest = None
    try:
        import build_dossier as bd
        hl = getattr(bd, "is_highlight_ok", None)
    except Exception as e:  # the dossier module may not carry the predicate yet
        print("  dossier predicate not importable:", e)
    try:
        import dossier_filters as df
        fest = getattr(df, "is_festival_ok", None)
        hl = hl or getattr(df, "is_highlight_ok", None)
    except Exception:
        pass
    return n, hl, fest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--public", required=True)
    ap.add_argument("--rules", choices=("before", "after"), required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--dropped-sample", default="")
    ap.add_argument("--repo", default="", help="checkout whose cache dir holds poi_wikidata.json (sitelinks, admin and station flags)")
    ap.add_argument("--limit", type=int, default=0, help="first N shards (debug)")
    a = ap.parse_args()
    pub = Path(a.public)
    norm, is_hl_ok, is_fest_ok = load_rules(a.rules)
    wikidata = load(Path(a.repo) / "cache" / "poi_wikidata.json") if a.repo else {}

    # place meta from the dossiers (iso2, class) and the dossier checks
    meta, hl_all, hl_bad, hl_left = {}, Counter(), Counter(), Counter()
    fest_all = fest_bad = fest_left = 0
    fest_samples, hl_samples, bru = [], [], {}
    for f in sorted((pub / "dossier").glob("*.json")):
        d = load(f)
        p = d.get("place") or {}
        meta[f.stem] = (p.get("iso2") or "??", p.get("class") or "?")
        iso = meta[f.stem][0]
        for h in d.get("highlights") or []:
            hl_all[iso] += 1
            bad = bool(BAD_HL.search(h.get("name") or ""))
            hl_bad[iso] += bad
            ok = True
            if is_hl_ok is not None:
                ok = bool(is_hl_ok({"name": h.get("name"), "kind": h.get("kind")}))
            if bad and ok:
                hl_left[iso] += 1
            if bad and len(hl_samples) < 40:
                hl_samples.append([sid(f), h.get("name"), h.get("kind"), "kept" if ok else "dropped"])
        if sid(f) == "BRU":
            bru["highlights"] = [(h.get("name"), bool(is_hl_ok({"name": h.get("name"), "kind": h.get("kind")})) if is_hl_ok else True) for h in d.get("highlights") or []]
        evs = [("festivals", e.get("name"), e.get("what")) for e in d.get("festivals") or []]
        evs += [("do", e.get("name"), e.get("detail")) for e in d.get("do") or [] if e.get("type") == "festival"]
        for src, nm, ds in evs:
            fest_all += 1
            bad = bool(BAD_FEST.search((nm or "") + " | " + (ds or "")))
            fest_bad += bad
            ok = True
            if is_fest_ok is not None:
                ok = bool(is_fest_ok({"name": nm, "desc": ds}))
            if bad and ok:
                fest_left += 1
            if bad and len(fest_samples) < 20:
                fest_samples.append([sid(f), src, nm, "kept" if ok else "dropped"])

    # POI shards
    total = Counter()
    must = Counter()          # effective must-sees, by country
    must_by_class = Counter()
    sq_no_word = Counter()
    sq_no_word_class = Counter()
    hits_left = Counter()
    hits_left_samples = []
    dropped_by_country, dropped_by_class = Counter(), Counter()
    dropped = []
    kept_report = defaultdict(list)
    breach = []
    kind_before = Counter()
    n_rows = n_noise_new = n_kind_changed = 0
    files = sorted((pub / "poi").glob("*.json"))
    if a.limit:
        files = files[:a.limit]
    for f in files:
        rows = load(f)
        iso, cls = meta.get(sid(f).replace(":", "-"), ("??", "?"))
        before = rows
        rows = copy.deepcopy(rows)
        if norm is not None:
            norm.normalize_items(rows, wikidata)
        n_rows += len(rows)
        keys = [(r.get("kind"), b.get("kind")) for r, b in zip(rows, before)]
        n_kind_changed += sum(1 for x, y in keys if x != y)
        # effective must-sees
        eff = []
        lost = 0
        for r, b in zip(rows, before):
            was_live = b.get("label") is not None
            if b.get("label") == "must_see":
                if r.get("noise") and not b.get("noise"):
                    lost += 1
                    dropped_by_country[iso] += 1
                    dropped_by_class[cls] += 1
                    dropped.append({"shard": sid(f), "name": r.get("name"), "kind": b.get("kind"),
                                    "desc": r.get("desc"), "heritage": bool(r.get("heritage")),
                                    "sig": r.get("sig"), "why": norm.classify_poi(b, wikidata.get(b.get("wiki") or ""))["noise_reason"]})
                else:
                    eff.append(r)
            elif r.get("noise") and was_live:
                n_noise_new += 1
        if lost:
            pool = sorted((r for r, b in zip(rows, before)
                           if b.get("label") == "recommended" and not r.get("noise")),
                          key=lambda r: -(r.get("sig") or 0))
            eff.extend(pool[:lost])
        for r in eff:
            must[iso] += 1
            must_by_class[cls] += 1
            if r.get("kind") == "Square" and not SQ.search(r.get("name") or ""):
                sq_no_word[iso] += 1
                sq_no_word_class[cls] += 1
            h = research_hits(r)
            if h and not visitable(r):
                hits_left[iso] += 1
                if len(hits_left_samples) < 40:
                    hits_left_samples.append([sid(f), r.get("name"), r.get("desc"), h])
        # must-keep
        for label, rx, shard in MUST_KEEP:
            if shard and sid(f) != shard:
                continue
            for r, b in zip(rows, before):
                if re.search(rx, r.get("name") or "", re.I):
                    kept_report[label].append([sid(f), r.get("name"), b.get("kind"), r.get("kind"),
                                               b.get("label"), bool(r.get("noise")) and not b.get("noise")])
                    if r.get("noise") and not b.get("noise") and b.get("label") in ("must_see", "recommended"):
                        breach.append([label, sid(f), r.get("name")])

    tm = sum(must.values())
    res = {
        "rules": a.rules, "shards": len(files), "rows": n_rows,
        "must_sees_effective": tm,
        "kind_changed": n_kind_changed, "newly_noise_live_rows": n_noise_new,
        "must_square_no_square_word": sum(sq_no_word.values()),
        "must_square_no_square_word_pct": round(100.0 * sum(sq_no_word.values()) / tm, 2) if tm else None,
        "must_matching_research_not_visitable": sum(hits_left.values()),
        "must_dropped": len(dropped),
        "must_dropped_by_class": dict(dropped_by_class.most_common()),
        "must_dropped_by_country": dict(dropped_by_country.most_common()),
        "must_by_class": dict(must_by_class.most_common()),
        "sq_no_word_by_class": dict(sq_no_word_class.most_common()),
        "sq_no_word_by_country": dict(sq_no_word.most_common()),
        "research_hits_by_country": dict(hits_left.most_common()),
        "research_hits_samples": hits_left_samples,
        "must_keep": {k: v[:6] for k, v in kept_report.items()},
        "must_keep_missing": [lbl for lbl, _r, _s in MUST_KEEP if lbl not in kept_report],
        "must_keep_breaches": breach,
        "dossier": {
            "highlights": sum(hl_all.values()), "banned_by_research_regex": sum(hl_bad.values()),
            "banned_left": sum(hl_left.values()), "banned_left_by_country": dict(hl_left.most_common(15)),
            "banned_samples": hl_samples, "brussels_highlights": bru.get("highlights"),
            "festival_rows": fest_all, "festival_banned": fest_bad, "festival_left": fest_left,
            "festival_samples": fest_samples,
        },
        "note": "must-sees after the rules approximate relabelling: a dropped one is replaced by the next recommended row by sig",
    }
    Path(a.out).write_text(json.dumps(res, indent=1, ensure_ascii=True), encoding="utf-8", newline="\n")
    if a.dropped_sample:
        Path(a.dropped_sample).write_text(json.dumps(dropped, indent=1, ensure_ascii=True),
                                          encoding="utf-8", newline="\n")
    head = {k: res[k] for k in ("rules", "rows", "must_sees_effective", "must_square_no_square_word",
                                "must_square_no_square_word_pct", "must_matching_research_not_visitable",
                                "must_dropped", "must_keep_missing", "must_keep_breaches")}
    print(json.dumps(head, indent=1))
    print(json.dumps(res["dossier"]["brussels_highlights"][:5] if res["dossier"]["brussels_highlights"] else None))
    print("dossier highlights banned/left:", res["dossier"]["banned_by_research_regex"], res["dossier"]["banned_left"],
          "festivals banned/left:", fest_bad, fest_left)
    return 1 if breach else 0


if __name__ == "__main__":
    sys.exit(main())
