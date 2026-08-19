"""filters.py - the curation rules, applied.

Stage 1b of the natural-features pipeline. build_features.py can tell a beach
POI from a peak POI, but it can not tell a beach from the beach bar standing on
it, one cove from the four private concessions carved out of it, or a mountain
from the ski lift that climbs it. A per-country human review of the first wire
(43 files under data/curation/research/*_review.json) named 648 such rows, and
the rules distilled from them live in data/curation/features_filter_rules.json:
38 rules, each with the test that catches it, the action to take, and a real
count of what it removes from the shipped wire.

This module reads that file and applies it. The rules are DATA, not code, so a
new finding is a JSON edit rather than a patch here, and every rule carries its
own measured blast radius, which is what makes it safe to ship a name pattern
that deletes rows.

Actions understood here (the ledger's vocabulary):

    drop              delete the row: a hotel is not a beach
    merge             collapse into the best row of a cluster, union the
                      evidence, keep the surviving name and photo
    quarantine_image  the photo is of something else: keep the row, drop the
                      picture, and let enrich_images.py look again
    reroute           wrong kind, not wrong row: a spoil tip is not a summit
    fold_into_parent  a sub-top is not a mountain of its own
    rename_or_drop    repair the string first, delete only if nothing survives

Tier actions (cap_tier2, cap_tier3, demote_band) are NOT applied here: they
belong to rank_features.py, which owns tiers, and this module only marks the
rows so that stage can act. A filter that silently rewrote a tier would make
the two stages disagree about what tier means.

Reads   data/curation/features_filter_rules.json
Writes  nothing: it transforms the feature list in memory and returns a report,
        which build_features.py folds into data/reports/features_build_drops.json

Usage as a script, to measure a rule set against the shipped wire without
touching the pipeline:

    python pipeline/features/filters.py                 # measure, print, no writes
    python pipeline/features/filters.py --rule hosp.trading_token
"""
import argparse
import re
import sys
from collections import Counter, defaultdict

from features_common import (ROOT, fold, haversine_km, load_json, log,
                             name_core, save_json)

RULES_FILE = ROOT / "data" / "curation" / "features_filter_rules.json"
WIRE_SNAPSHOT = ROOT / "data" / "curation" / "wire_snapshot"

# Actions this module performs. Anything else in the file is a tier action,
# recorded on the row for rank_features.py rather than executed here.
APPLIED = {"drop", "merge", "quarantine_image", "reroute", "fold_into_parent",
           "rename_or_drop", "strip_then_dedupe", "renormalise",
           "merge_or_drop", "resolve_to_highest_peak"}
TIER_ACTIONS = {"cap_tier2", "cap_tier3", "demote_band", "flag_for_p31"}

# Rules whose test is a geometry cluster rather than a string. Each is
# implemented by name below, because "union-find rows within 250 m" is not
# expressible as data and pretending otherwise would hide the logic.
CLUSTER_RULES = {"dup.geo_250m", "dup.geo_name_2km", "dup.cross_country",
                 "dup.shared_article", "dup.numbered_segment"}


def load_rules():
    doc = load_json(RULES_FILE)
    if not doc:
        return []
    out = []
    for cls, rules in (doc.get("rules_by_class") or {}).items():
        for r in (rules if isinstance(rules, list) else [rules]):
            r.setdefault("class", cls)
            out.append(r)
    # Rank 1 ships first: highest removal for the lowest good-entry loss.
    out.sort(key=lambda r: r.get("rank", 999))
    return out


def compile_rule(rule):
    """The name test, compiled once. Rules with no name test are geometry or
    tag rules and return None here."""
    pat = (rule.get("test") or {}).get("name_regex")
    if not pat:
        return None
    flags = re.I | re.U
    try:
        return re.compile(pat, flags)
    except re.error as e:                       # a bad pattern must not
        log(f"  rule {rule.get('id')}: bad regex, skipped ({e})")
        return None


def rule_applies(rule, f):
    """Kind and country scoping, before any expensive test."""
    kinds = rule.get("kinds") or []
    if kinds and f["kind"] not in kinds:
        return False
    scope = rule.get("scope_iso2")
    if scope and f["iso2"] not in scope:
        return False
    return True


# --------------------------------------------------------------------------- #
# the P31 test: what Wikidata says this thing IS
# --------------------------------------------------------------------------- #
# The reviewers' single biggest bucket after names was "the row is a real
# place, just not this kind of place": 19 islands and 17 viewpoints filed as
# mountains, 25 parks filed as features. A name can not settle that; the
# class tree can, and enrich_wikidata.py already records it.
P31_BLOCK = {
    "mountain": {
        "Q23442": "island", "Q34763": "peninsula", "Q22698": "park",
        "Q46169": "national park", "Q473972": "protected area",
        "Q1107656": "garden", "Q41176": "building", "Q3947": "house",
        "Q17106017": "mountain hut", "Q1076486": "sports venue",
        "Q10861252": "railway station", "Q55488": "railway station",
        "Q11презент": "",  # placeholder ignored
        "Q4830453": "business", "Q11707": "restaurant", "Q27686": "hotel",
        "Q1248784": "airport", "Q205495": "filling station",
        "Q179700": "statue", "Q4989906": "monument", "Q39715": "lighthouse",
        "Q23413": "castle", "Q751876": "chateau",
    },
    "beach": {
        "Q515": "city", "Q3957": "town", "Q532": "village",
        "Q486972": "human settlement", "Q23442": "island",
        "Q27686": "hotel", "Q11707": "restaurant", "Q4830453": "business",
        "Q1076486": "sports venue", "Q1195942": "swimming pool",
        "Q2416723": "lido", "Q39715": "lighthouse", "Q23413": "castle",
    },
}
P31_BLOCK["mountain"].pop("Q11презент", None)


def p31_blocked(f):
    """(True, label) when Wikidata calls this something the tab must not show."""
    classes = ((f.get("provenance") or {}).get("wikidata") or {}).get("p31") or []
    block = P31_BLOCK.get(f["kind"], {})
    for qid in classes:
        if qid in block:
            return True, block[qid]
    return False, None


# --------------------------------------------------------------------------- #
# clusters: the same feature under several names
# --------------------------------------------------------------------------- #
class Union:
    def __init__(self, n):
        self.p = list(range(n))

    def find(self, i):
        while self.p[i] != i:
            self.p[i] = self.p[self.p[i]]
            i = self.p[i]
        return i

    def join(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[rb] = ra


def _jaccard(a, b):
    sa, sb = set(a.split()), set(b.split())
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


SITE_JOIN_KM = 2.0


def water_site(f):
    """The official bathing water this row sits on, when it is close enough to
    BE that water rather than merely near it."""
    w = f.get("water")
    if not isinstance(w, dict):
        return None
    # An official bathing water is a STRETCH of coast, and the concessions
    # along it log their own point: Ksamil's five rows spread over a kilometre
    # of the same strand. Group generously, because sharing an EEA site is the
    # regulator's own statement that this is one bathing water.
    if (w.get("dist_km") or 9) > SITE_JOIN_KM:
        return None
    site = (w.get("site") or "").strip()
    return site or None


_SMALL_WORDS = {"de", "del", "della", "di", "da", "das", "dos", "la", "le",
                "les", "el", "los", "las", "il", "lo", "i", "y", "e", "a",
                "an", "the", "of", "und", "et", "sur", "am", "aan", "op"}


def titlecase_site(site):
    """EEA site names are shouted ("KSAMIL", "PLAZHI I VJETER"). Title-case
    them the way a place name reads, small words left small."""
    parts = []
    for i, word in enumerate(site.lower().replace(",", " ").split()):
        if i and word in _SMALL_WORDS:
            parts.append(word)
        else:
            parts.append(word[:1].upper() + word[1:])
    return " ".join(parts)


def cluster_duplicates(features, near_m=250, name_km=2.0, name_overlap=0.60):
    """Union-find over (iso2, kind): the review found one Bulgarian beach under
    four names and Ksamil under five. Two joins, both from the rules file:
    anything within 250 m is the same strand whatever it is called, and within
    2 km it is the same strand when the names agree."""
    idx = defaultdict(list)
    for i, f in enumerate(features):
        idx[(f["iso2"], f["kind"])].append(i)

    uf = Union(len(features))
    for group in idx.values():
        # Small groups are O(n^2) and fine; big ones bucket by 0.02 deg first.
        buckets = defaultdict(list)
        for i in group:
            f = features[i]
            buckets[(round(f["lat"] / 0.02), round(f["lon"] / 0.02))].append(i)
        for (bi, bj), members in buckets.items():
            neighbours = []
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    neighbours.extend(buckets.get((bi + di, bj + dj), ()))
            for i in members:
                fi = features[i]
                ci = name_core(fi["name"])
                for j in neighbours:
                    if j <= i:
                        continue
                    fj = features[j]
                    km = haversine_km(fi["lat"], fi["lon"], fj["lat"], fj["lon"])
                    if km * 1000 <= near_m:
                        uf.join(i, j)
                    elif km <= name_km and _jaccard(ci, name_core(fj["name"])) >= name_overlap:
                        uf.join(i, j)
    # One official bathing water is one beach. Ksamil's strand is logged five
    # times because five concessions each named their stretch (Bora Bora, King,
    # Coco, Lori, Paradise), and no distance rule joins them reliably along a
    # kilometre of sand. The EEA site does.
    by_site = defaultdict(list)
    for i, f in enumerate(features):
        site = water_site(f)
        if site:
            by_site[(f["iso2"], f["kind"], fold(site))].append(i)
    for members in by_site.values():
        for j in members[1:]:
            uf.join(members[0], j)

    groups = defaultdict(list)
    for i in range(len(features)):
        groups[uf.find(i)].append(i)
    return [g for g in groups.values() if len(g) > 1]


def water_class(f):
    """The bathing class, from either shape: the pipeline record carries a
    dict, the shipped wire slims it to the class string."""
    w = f.get("water")
    if isinstance(w, dict):
        return w.get("class")
    return w or None


def evidence_rank(f):
    """Which row of a cluster survives: the one a reader would recognise. An
    article beats a photo beats a water class beats a longer name, because the
    name is the weakest evidence and the one most often a concession's."""
    sig = f.get("signals") or {}
    return (
        1 if f.get("wikipedia") or f.get("wikidata") else 0,
        sig.get("sitelinks") or 0,
        1 if f.get("image") else 0,
        1 if water_class(f) else 0,
        -len(f["name"]),
    )


def canonical_name(members, site):
    """What the surviving row should be CALLED. Evidence picks the row; the
    name is a separate question, because the best-evidenced row is often a
    concession: Ksamil's photographed row is "Bora Bora beach". Prefer a member
    whose name agrees with the official bathing water, and fall back to the
    site's own toponym rather than to a bar."""
    if not site:
        return None
    site_tokens = set(name_core(site).split())
    if not site_tokens:
        return None
    for f in members:
        if set(name_core(f["name"]).split()) & site_tokens:
            return None                     # a member already names the place
    return titlecase_site(site)


def merge_cluster(features, idxs):
    """Keep the best row, union the evidence onto it, return the losers."""
    ranked = sorted(idxs, key=lambda i: evidence_rank(features[i]), reverse=True)
    keep, losers = ranked[0], ranked[1:]
    k = features[keep]
    site = next((water_site(features[i]) for i in ranked if water_site(features[i])), None)
    better = canonical_name([features[i] for i in idxs], site)
    if better and not k.get("wikidata") and not k.get("wikipedia"):
        k.setdefault("provenance", {})["renamed_from"] = k["name"]
        if not k.get("name_local"):
            k["name_local"] = k["name"]
        k["name"] = better
    for i in losers:
        o = features[i]
        if not k.get("image") and o.get("image"):
            k["image"] = o["image"]
        if not water_class(k) and water_class(o):
            k["water"] = o["water"]
        if not k.get("wikidata") and o.get("wikidata"):
            k["wikidata"] = o["wikidata"]
        if not k.get("wikipedia") and o.get("wikipedia"):
            k["wikipedia"] = o["wikipedia"]
        ks, os_ = k.setdefault("signals", {}), o.get("signals") or {}
        for key in ("poi_rate", "sitelinks", "pageviews"):
            if (os_.get(key) or 0) > (ks.get(key) or 0):
                ks[key] = os_[key]
        prov = k.setdefault("provenance", {})
        prov.setdefault("merged", []).append(o["name"])
    return losers


# --------------------------------------------------------------------------- #
# apply
# --------------------------------------------------------------------------- #
def apply_filters(features, rules=None, verbose=False):
    """Returns (kept_features, report). Nothing is written here."""
    rules = rules if rules is not None else load_rules()
    report = {"removed": [], "rerouted": [], "image_quarantined": [],
              "merged": [], "tier_flags": [], "by_rule": Counter()}

    compiled = [(r, compile_rule(r)) for r in rules]

    kept = []
    for f in features:
        verdict = None
        for rule, rx in compiled:
            action = rule.get("action")
            if action in TIER_ACTIONS:
                continue                       # rank_features.py owns tiers
            if action not in APPLIED or rule.get("id") in CLUSTER_RULES:
                continue
            if not rule_applies(rule, f):
                continue
            if rx is None:
                continue                       # tag-only rule, needs OSM tags
            if not rx.search(f["name"]):
                continue
            verdict = (rule, action)
            break

        # Wikidata's own classification, after the name rules: it is the
        # stronger signal but it is only present on the rows that resolved.
        if verdict is None:
            blocked, label = p31_blocked(f)
            if blocked:
                verdict = ({"id": "p31.wrong_class", "class": "wrong_class",
                            "what_it_catches": f"Wikidata calls this a {label}"},
                           "drop")

        if verdict is None:
            kept.append(f)
            continue

        rule, action = verdict
        report["by_rule"][rule.get("id")] += 1
        row = {"id": f["id"], "name": f["name"], "iso2": f["iso2"],
               "kind": f["kind"], "rule": rule.get("id"),
               "why": rule.get("what_it_catches")}
        if action == "quarantine_image":
            f["image"] = None
            report["image_quarantined"].append(row)
            kept.append(f)
        elif action == "reroute":
            # A spoil tip is not a summit, but it is a real place: it leaves
            # the mountain tab rather than the dataset.
            report["rerouted"].append(row)
        else:
            report["removed"].append(row)

    # Clusters run on the survivors, so a dropped concession can not win one.
    losers = set()
    for group in cluster_duplicates(kept):
        for i in merge_cluster(kept, group):
            losers.add(i)
            report["merged"].append({"id": kept[i]["id"], "name": kept[i]["name"],
                                     "iso2": kept[i]["iso2"], "kind": kept[i]["kind"]})
    kept = [f for i, f in enumerate(kept) if i not in losers]

    # A lone concession is still a concession: "Dhrale Beach" is a bar on the
    # sand at Palase and no cluster partner exists to out-vote it. When a row
    # sits ON an official bathing water (tight radius here, not the cluster's
    # generous one), has no article of its own, and shares not one token with
    # the water's name, the regulator's toponym is the better name.
    for f in kept:
        w = f.get("water")
        if not isinstance(w, dict) or f.get("wikidata") or f.get("wikipedia"):
            continue
        if (w.get("dist_km") or 9) > 0.35:
            continue
        site = (w.get("site") or "").strip()
        if not site:
            continue
        if set(name_core(site).split()) & set(name_core(f["name"]).split()):
            continue
        prov = f.setdefault("provenance", {})
        if prov.get("renamed_from"):
            continue
        prov["renamed_from"] = f["name"]
        if not f.get("name_local"):
            f["name_local"] = f["name"]
        f["name"] = titlecase_site(site)
        report["by_rule"]["water.site_toponym"] += 1

    if verbose:
        for rule_id, n in report["by_rule"].most_common():
            log(f"    {rule_id:<32} {n}")
    return kept, report


# --------------------------------------------------------------------------- #
# measure against the shipped wire, without touching the pipeline
# --------------------------------------------------------------------------- #
def _load_wire():
    out = []
    if not WIRE_SNAPSHOT.exists():
        return out
    for p in sorted(WIRE_SNAPSHOT.glob("*.json")):
        if p.name.startswith("_") or p.name == "index.json":
            continue
        doc = load_json(p) or {}
        for f in doc.get("features", []):
            f.setdefault("iso2", doc.get("country"))
            f.setdefault("signals", {})
            out.append(f)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--rule", help="measure one rule id only")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    rules = load_rules()
    if args.rule:
        rules = [r for r in rules if r.get("id") == args.rule]
        if not rules:
            log(f"no rule with id {args.rule}")
            return 1
    log(f"{len(rules)} rules loaded")

    wire = _load_wire()
    if not wire:
        log("no wire snapshot to measure against "
            "(data/curation/wire_snapshot/), nothing to do")
        return 0
    log(f"measuring against {len(wire)} shipped rows")

    kept, rep = apply_filters(wire, rules, verbose=not args.quiet)
    log(f"\n  kept      {len(kept)}")
    log(f"  removed   {len(rep['removed'])}")
    log(f"  merged    {len(rep['merged'])}")
    log(f"  rerouted  {len(rep['rerouted'])}")
    log(f"  image out {len(rep['image_quarantined'])}")

    for label, rows in (("removed", rep["removed"]), ("merged", rep["merged"])):
        log(f"\n  {label} examples:")
        for r in rows[:12]:
            log(f"    {r['iso2']} {r['kind']:<8} {r['name'][:44]:<46}"
                f" {r.get('rule', 'cluster')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
