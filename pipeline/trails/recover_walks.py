"""How many lost walks each T1094 rule can recover, from the files on disk.

Tier: On demand (T1094, ROADMAP D7). Reads, never writes the lab.

The 2026-09-18 sweep lost 8,893 walk candidates as `way_only_not_derived`
and 3,518 as `failed_continuity` (the committed coverage report of
2026-10-02 reads 8,891 and 4,555). The real recovery is a run on the box:
re-harvest the registry, derive, splice, curate, export, re-run coverage.
This sizes it BEFORE that run, from the two committed files alone
(data/trails/famous_registry.json, data/reports/trails_coverage.json) plus
the published wire, so the owner knows what the run should move and the run
can be checked against it.

What it can and cannot say:

  way_only_not_derived  Every row is triaged by its own registry evidence.
                        Most carry NO trail signal at all (no grade, no
                        network, no trail class, no human seed): Via Roma,
                        Schulweg, Ketelmeer. Those were filed as trails by the
                        Phase 1 classifier, which Phase 2 fixed
                        (famous_registry.kind_of), but the committed registry
                        predates the fix, so they leave the gate only when the
                        registry is re-harvested. The rows WITH walk evidence
                        are the ones derivation is for; they are split by the
                        rule that can carry them.
  failed_continuity     The registry knows a relation exists and the wire does
                        not publish it. WHY (a break, the length band, the
                        quota) lives in the lab, not on disk, so this splits
                        off only what the files prove: the same relation
                        filed twice (once per extract), parents of a published
                        stage (the parent-page work, exempt from continuity),
                        and relations already published under another row.
                        The rest is sized by `splice.py --dry-run` on the box.
  famous fixtures       smoke_test.FAMOUS_FIXTURES, each with its status, its
                        reason code and the rule that can recover it, if any.

Usage, from the repo root:
    python pipeline/trails/recover_walks.py            # print and write
    python pipeline/trails/recover_walks.py --no-write # print only

Writes data/reports/trails_recovery.json and trails_recovery.md.
"""

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from names import base_name, squash  # noqa: E402

REGISTRY = ROOT / "data" / "trails" / "famous_registry.json"
COVERAGE = ROOT / "data" / "reports" / "trails_coverage.json"
WIRE = ROOT / "continent-app" / "public" / "trails"
OUT_JSON = ROOT / "data" / "reports" / "trails_recovery.json"
OUT_MD = ROOT / "data" / "reports" / "trails_recovery.md"

# The sweep of 2026-09-18 (HANDBOOK, trails data quality): the baseline every
# number here is read against.
SWEEP = {"candidates": 15943, "published": 1630,
         "way_only_not_derived": 8893, "failed_continuity": 3518,
         "famous_published": 14}

# famous_registry.TRAIL_CLASSES, repeated rather than imported: importing the
# registry module pulls its harvest dependencies, and this tool must run on a
# laptop with nothing but the repo.
TRAIL_CLASSES = {"Q2143825", "Q17008256", "Q1826691"}

# Words that name a structure rather than a walk. Used only to ESTIMATE how
# many lone famous ways are bridges or tunnels (the lone-way rule refuses
# those on their OSM tags, which the committed registry does not carry); it
# never decides anything in the pipeline.
STRUCTURE_RE = re.compile(
    r"br(u|ue|ü)cke|bridge|\bmost\b|\bpont\b|\bponte\b|\bpuente\b|viadu|"
    r"tunnel|tunel|galleria|\bsteg\b|lávka|lavka|kładka|passerelle|"
    r"pasarela|skywalk|sky bridge", re.I)


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def triage_way_only(reg_row):
    """One bucket for a way_only_not_derived row, from its own evidence.

    walk_multi    graded, trail class or seeded, and two or more named ways:
                  the fame and base-name chains, with the T1094 article-pair
                  and spine rules when the chain branches.
    walk_lone     the same evidence on ONE named way: the T1094 lone-way rule,
                  if the way is at least 600 m and not a bridge or tunnel.
    also_relation a relation exists as well; the relation path carries it.
    network_only  a hiking network tag and nothing else.
    no_signal     no grade, network, trail class or seed: a street, square,
                  bridge or lake the Phase 1 classifier filed as a trail.
                  Leaves the gate as not_a_walk when the registry is
                  re-harvested; no derivation rule is meant to publish it."""
    osm = (reg_row.get("evidence") or {}).get("osm") or {}
    seed = (reg_row.get("evidence") or {}).get("seed")
    if osm.get("relation_id"):
        return "also_relation"
    walkish = (osm.get("sac_scale") or reg_row.get("wd_class") in TRAIL_CLASSES
               or seed)
    if walkish:
        return "walk_multi" if (osm.get("named_ways") or 0) >= 2 \
            else "walk_lone"
    if osm.get("network"):
        return "network_only"
    return "no_signal"


def published_index():
    """Relation ids and family names on the wire, rated and listed tiers."""
    rels, parents = set(), set()
    for path in sorted(WIRE.glob("*.json")):
        if path.stem in ("index", "top"):
            continue
        blob = load(path)
        for t in (blob.get("trips") or []) + (blob.get("listed") or []):
            if isinstance(t.get("osm"), int):
                rels.add(t["osm"])
            h = t.get("h") or {}
            for k in ("of", "top"):
                if h.get(k):
                    parents.add(squash(h[k]))
    return rels, parents


def triage_continuity(rows, reg, rels, parents):
    """Buckets for failed_continuity rows; see the module docstring."""
    out, seen = Counter(), set()
    sample = defaultdict(list)
    for r in sorted(rows, key=lambda r: -r.get("fame_score", 0)):
        rid = ((reg[r["id"]].get("evidence") or {}).get("osm")
               or {}).get("relation_id")
        if rid in seen:
            key = "same_relation_other_country"
        else:
            seen.add(rid)
            if rid in rels:
                key = "already_published"
            elif squash(r["name"]) in parents:
                key = "parent_of_published_stage"
            else:
                key = "needs_lab_split"
        out[key] += 1
        if len(sample[key]) < 8:
            sample[key].append(f"{r['name']} ({r['country']})")
    return out, sample


def famous_rule(cov_row, reg_row):
    """(expected outcome, rule) for one famous fixture."""
    if cov_row is None:
        return "no registry row", "-"
    reason = cov_row["reason"]
    if reason == "matched":
        return "published", "-"
    if reason == "way_only_not_derived":
        bucket = triage_way_only(reg_row)
        if bucket == "walk_multi":
            return ("recovered by derivation",
                    "fame chain, with the T1094 spine rule if it branches")
        if bucket == "walk_lone":
            return ("recovered if its one way is 600 m or more",
                    "T1094 lone famous way")
        return "not recovered", f"way_only, {bucket}"
    if reason == "failed_continuity":
        return ("recovered only if its breaks are order artefacts",
                "T1094 reorder pass (splice.py)")
    return "not recovered", f"no rule: {reason}"


def wire_names():
    """{country: [folded published name]}, rated and listed tiers."""
    out = defaultdict(list)
    for path in sorted(WIRE.glob("*.json")):
        if path.stem in ("index", "top"):
            continue
        blob = load(path)
        for t in (blob.get("trips") or []) + (blob.get("listed") or []):
            out[t.get("country") or path.stem.upper()].append(
                (squash(t.get("name") or ""), t.get("name") or ""))
    return out


def word_in(needle, hay):
    return bool(needle and hay) and f" {needle} " in f" {hay} "


def famous_table(cov_rows, reg):
    """The 30 fixtures. Published is decided on the WIRE, the way
    smoke_test.famous_check decides it; the reason and the evidence for a
    miss come from the coverage row of the same name."""
    from smoke_test import FAMOUS_FIXTURES
    by_cc = defaultdict(list)
    for r in cov_rows:
        by_cc[r["country"]].append(r)
    pub = wire_names()
    out = []
    for cc, name in FAMOUS_FIXTURES:
        key = squash(base_name(name))
        on_wire = next((orig for hay, orig in pub.get(cc, [])
                        if hay == key or word_in(key, hay)), None)
        # Registry row: the name contains the fixture as whole words, or is
        # contained in it as whole words and is not a fragment (Greek names
        # fold to nothing, "Samar" is not "Samaria").
        hits = [r for r in by_cc.get(cc, [])
                if word_in(key, squash(r["name"]))
                or (len(squash(r["name"])) >= 5
                    and word_in(squash(r["name"]), key))]
        hits.sort(key=lambda r: -r.get("fame_score", 0))
        row = hits[0] if hits else None
        reg_row = reg.get(row["id"]) if row else None
        if on_wire:
            outcome, rule = "published", "-"
        else:
            outcome, rule = famous_rule(row, reg_row)
        osm = ((reg_row or {}).get("evidence") or {}).get("osm") or {}
        out.append({
            "country": cc, "fixture": name,
            "published_as": on_wire,
            "registry_name": row["name"] if row else None,
            "reason": ("matched" if on_wire
                       else (row["reason"] if row else None)),
            "named_ways": osm.get("named_ways"),
            "relation_id": osm.get("relation_id"),
            "sac_scale": osm.get("sac_scale"),
            "outcome": outcome, "rule": rule,
        })
    return out


def build():
    reg_blob, cov = load(REGISTRY), load(COVERAGE)
    reg = {r["id"]: r for r in reg_blob["rows"]}
    rows = cov["rows"]
    rels, parents = published_index()

    wo = [r for r in rows if r["reason"] == "way_only_not_derived"]
    fc = [r for r in rows if r["reason"] == "failed_continuity"]

    wo_buckets, wo_sample = Counter(), defaultdict(list)
    lone_structure = 0
    for r in sorted(wo, key=lambda r: -r.get("fame_score", 0)):
        b = triage_way_only(reg[r["id"]])
        wo_buckets[b] += 1
        if b == "walk_lone" and STRUCTURE_RE.search(r["name"]):
            lone_structure += 1
        if len(wo_sample[b]) < 10:
            wo_sample[b].append(f"{r['name']} ({r['country']}, "
                                f"{r.get('fame_score', 0):.2f})")
    fc_buckets, fc_sample = triage_continuity(fc, reg, rels, parents)
    famous = famous_table(rows, reg)
    fam = Counter(f["outcome"] for f in famous)

    walk_rows = (wo_buckets["walk_multi"] + wo_buckets["walk_lone"]
                 - lone_structure)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "task": "T1094",
        "inputs": {"registry_generated_at": reg_blob.get("generated_at"),
                   "coverage_generated_at": cov.get("generated_at")},
        "sweep_2026_09_18": SWEEP,
        "coverage_file": {k: cov["counts"].get(k) for k in
                          ("trail_rows", "matched", "missing",
                           "published_rows")},
        "way_only_not_derived": {
            "rows": len(wo),
            "buckets": dict(wo_buckets),
            "lone_named_like_a_structure": lone_structure,
            "derivation_ceiling": walk_rows,
            "sample": dict(wo_sample),
        },
        "failed_continuity": {
            "rows": len(fc),
            "buckets": dict(fc_buckets),
            "sample": dict(fc_sample),
        },
        "famous": famous,
        "famous_outcomes": dict(fam),
    }


def render_md(p):
    wo, fc = p["way_only_not_derived"], p["failed_continuity"]
    b = wo["buckets"]
    lines = [
        "# Trails recovery sizing (T1094, D7)",
        "",
        f"Generated {p['generated_at']} by `pipeline/trails/recover_walks.py` "
        f"from the committed registry ({p['inputs']['registry_generated_at']}) "
        f"and coverage report ({p['inputs']['coverage_generated_at']}).",
        "",
        "## way_only_not_derived",
        "",
        "| Bucket | Rows | What carries it |",
        "|---|---|---|",
        f"| no trail signal (streets, squares, bridges, lakes) | "
        f"{b.get('no_signal', 0):,} | registry re-harvest reclassifies them "
        f"`not_a_walk`; no derivation should publish them |",
        f"| walk evidence, 2+ named ways | {b.get('walk_multi', 0):,} | fame "
        f"or base-name chain; T1094 article-pair and spine rules |",
        f"| walk evidence, 1 named way | {b.get('walk_lone', 0):,} | T1094 "
        f"lone famous way, if 600 m or more and not a structure "
        f"({wo['lone_named_like_a_structure']} are named like one) |",
        f"| a relation exists too | {b.get('also_relation', 0):,} | the "
        f"relation path (ingest, splice, curate) |",
        f"| network tag only | {b.get('network_only', 0):,} | none yet |",
        "",
        f"Ceiling for derivation: **{wo['derivation_ceiling']:,}** rows "
        f"(walk evidence, less the lone ways named like a structure). The "
        f"box run gives the real number.",
        "",
        "## failed_continuity",
        "",
        "| Bucket | Rows |",
        "|---|---|",
    ]
    for k, v in sorted(fc["buckets"].items(), key=lambda kv: -kv[1]):
        lines.append(f"| {k.replace('_', ' ')} | {v:,} |")
    lines += [
        "",
        "`needs lab split` is sized by `python pipeline/trails/splice.py "
        "--dry-run` on the box: it prints how many more relations the T1094 "
        "reorder pass bridges, and why the rest are refused.",
        "",
        "## The 30 famous test routes",
        "",
        "| Country | Route | Reason now | Evidence | Expected after the run | Rule |",
        "|---|---|---|---|---|---|",
    ]
    for f in p["famous"]:
        ev = []
        if f["relation_id"]:
            ev.append(f"relation {f['relation_id']}")
        if f["named_ways"]:
            ev.append(f"{f['named_ways']} named ways")
        if f["sac_scale"]:
            ev.append(f["sac_scale"])
        lines.append(f"| {f['country']} | {f['fixture']} | "
                     f"`{f['reason']}` | {', '.join(ev) or '-'} | "
                     f"{f['outcome']} | {f['rule']} |")
    lines.append("")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()
    payload = build()
    md = render_md(payload)
    print(md)
    if not args.no_write:
        OUT_JSON.write_text(json.dumps(payload, indent=1, ensure_ascii=False)
                            + "\n", encoding="utf-8")
        OUT_MD.write_text(md, encoding="utf-8")
        print(f"wrote {OUT_JSON.relative_to(ROOT)} and "
              f"{OUT_MD.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
