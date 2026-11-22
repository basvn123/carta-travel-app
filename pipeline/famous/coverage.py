"""Famous coverage per outdoor kind: how many famous items are in Carta, and
why each missing one is missing.

D23/D24 famous coverage (2026-11-20). Usage:

    python pipeline/famous/coverage.py --kind all [--sample 20]
        [--wire continent-app/public] [--out data/reports/famous]

Reads data/famous/<kind>.json (build_reference.py) and the published wire;
writes coverage.json and coverage.md. Statuses: in (rated), in_listed (on
the map and in lists, not rated), in_as_stages, in_as_piece, missing.
Headline = tier A rows that are in or in_listed or in_as_stages.

Reasons for a miss (fixed list, the next step follows from each):
- out_of_scope:under_2km / out_of_scope:over_400km (trails);
- matcher_miss: a same-kind row next to it under another name; review it
  before counting it as a gap;
- no_osm_relation (trails): OSM has no route for it; closable by a routed
  seed (pipeline/trails/seed_routes.py) or a derived route;
- osm_relation_not_published (trails): OSM has it, curation or a gate did
  not ship it (curate's dry run names the gate);
- not_in_catalogue / not_enriched / dropped_at_export (beaches, lakes,
  mountains, where the kind's stored stages are on this machine, i.e. on the
  box): never harvested; harvested and cut by the shortlist before
  enrichment; enriched and then dropped by an export gate;
- not_in_wire: the same, where the stages are not here to tell;
- unlocated: no coordinate and no id to look it up by."""

import argparse
import json
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

import match as m  # noqa: E402

REF_DIR = ROOT / "data" / "famous"
OUT_DIR = ROOT / "data" / "reports" / "famous"
WIRE = ROOT / "continent-app" / "public"
REGISTRY = ROOT / "data" / "trails" / "famous_registry.json"
KINDS = ["trails", "cycling", "beaches", "lakes", "mountains"]
IN_STATUSES = ("in", "in_listed", "in_as_stages")


def center(bb):
    return ((bb[1] + bb[3]) / 2, (bb[0] + bb[2]) / 2) if bb else (None, None)


def wire_rows(kind, wire=WIRE):
    """Every published row of a kind, flattened to the matcher's shape."""
    rows = []
    folder = Path(wire) / kind
    for f in sorted(folder.glob("*.json")):
        if len(f.stem) != 2:
            continue
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except ValueError:
            continue
        cc = d.get("country") or f.stem
        if kind == "trails":
            groups = (("rated", d.get("trips")), ("listed", d.get("listed")))
        elif kind == "cycling":
            groups = (("rated", d.get("routes")), ("listed", d.get("listed")))
        else:
            groups = (("rated", d.get(kind)), ("listed", d.get("listed")))
        for tier, items in groups:
            for it in items or []:
                if not isinstance(it, dict):
                    continue
                r = {"kind": kind, "id": it.get("id"), "tier": tier,
                     "cc": it.get("cc") or it.get("country") or cc,
                     "name": it.get("name"), "nameLocal": it.get("nameLocal"),
                     "wd": it.get("wd"), "osm": it.get("osm")}
                if kind in ("trails", "cycling"):
                    r["bbox"] = it.get("bbox")
                    r["lat"], r["lon"] = center(it.get("bbox"))
                    r["km"] = (it.get("km") if kind == "cycling" else
                               (it.get("distance_m") or 0) / 1000.0)
                else:
                    r["lat"], r["lon"] = it.get("lat"), it.get("lon")
                if kind == "cycling" and not r["osm"]:
                    r["osm"] = cycling_osm(folder, it.get("id"))
                rows.append(r)
    return rows


def cycling_osm(folder, rid):
    p = folder / "route" / f"{rid}.json"
    if rid is None or not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8")).get("osm")
    except ValueError:
        return None


def registry_rels():
    """{QID: [OSM relation ids]} from the trails famous registry."""
    if not REGISTRY.exists():
        return {}
    d = json.loads(REGISTRY.read_text(encoding="utf-8"))
    out = {}
    for r in d.get("rows", []):
        ev = r.get("evidence") or {}
        q = ev.get("wikidata")
        if isinstance(q, dict):
            q = q.get("qid") or q.get("id")
        rel = (ev.get("osm") or {}).get("relation_id")
        wm = (ev.get("waymarked") or {}).get("relation_id")
        for x in (rel, wm):
            if q and x:
                out.setdefault(q, set()).add(int(x))
    return {q: sorted(v) for q, v in out.items()}


def load_refs(kind, ref_dir=REF_DIR):
    p = Path(ref_dir) / f"{kind}.json"
    if not p.exists():
        return None
    doc = json.loads(p.read_text(encoding="utf-8"))
    return doc


STAGE_DIR = ROOT / "cache"
STAGE_KEY = {"lakes": "lakes", "mountains": "peaks", "beaches": "beaches"}
_STAGES = {}


def stage_ids(kind, stage, cc):
    """QIDs in one of a kind's stored stages for a country (raw: harvested,
    rich: enriched), or None when that file is not on this machine (the
    stages live on the box)."""
    key = (kind, stage, cc)
    if key not in _STAGES:
        path = STAGE_DIR / kind / f"{stage}_{cc}.json"
        try:
            d = json.loads(path.read_text(encoding="utf-8"))
            _STAGES[key] = {r.get("wd") for r in d.get(STAGE_KEY[kind]) or []
                            if isinstance(r, dict) and r.get("wd")}
        except (OSError, ValueError):
            _STAGES[key] = None
    return _STAGES[key]


def stage_reason(kind, ref):
    """Where a missing beach, lake or mountain was lost, from the kind's own
    stages: not_in_catalogue (never harvested), not_enriched (harvested, cut
    before enrichment by the shortlist), dropped_at_export (enriched, then a
    score, photo, dedupe or quota gate). None when no stage file is here."""
    if kind not in STAGE_KEY or not ref.get("qid"):
        return None
    seen_any = False
    for cc in ref.get("countries") or []:
        raw, rich = stage_ids(kind, "raw", cc), stage_ids(kind, "rich", cc)
        if raw is None and rich is None:
            continue
        seen_any = True
        if rich and ref["qid"] in rich:
            return "dropped_at_export"
        if raw and ref["qid"] in raw:
            return "not_enriched"
    return "not_in_catalogue" if seen_any else None


def reason_for(kind, ref, rows, rels):
    km = ref.get("length_km")
    if kind == "trails" and km:
        if km < 2:
            return "out_of_scope:under_2km"
        if km > 400:
            return "out_of_scope:over_400km"
    names = m.names_of(ref)
    tokens = {t for n in names for t in n.split() if len(t) >= 5}
    for d, row in m.nearby(kind, ref, rows):
        w = set(m.fold(row.get("name")).split())
        if (tokens & w) or (kind in ("mountains", "beaches", "lakes")
                            and d <= 0.5):
            return "matcher_miss"
    if ref.get("lat") is None and not ref.get("qid"):
        return "unlocated"
    if kind in ("trails", "cycling"):
        return ("osm_relation_not_published" if ref.get("osm_rels")
                else "no_osm_relation")
    return stage_reason(kind, ref) or "not_in_wire"


def trails_hits(refs, wire):
    """{ref id: hit} for trails through the D24 trails external check's own
    matcher (scripts/validation/trails_external.py: registry ids, family and
    parent names, refs, nearby starts, day walks on longer routes), so the
    two reports never disagree about a trail. Wikidata's P402 is added as one
    more id. A trail with only side trails is missing; a trail whose best
    row is under half its length is a piece, or stages when the matched rows
    together cover most of it."""
    sys.path.insert(0, str(ROOT / "scripts" / "validation"))
    import trails_external as te
    rows, _ = te.load_carta(Path(wire) / "trails")
    reg = te.load_registry()
    idx = te.Index(rows)
    out = {}
    for ref in refs:
        head = ref.get("trailhead") or (
            {"lat": ref.get("lat"), "lon": ref.get("lon")}
            if ref.get("lat") is not None else None)
        km = ref.get("length_km")
        tref = {"id": ref["id"], "name": ref.get("name"),
                "aliases": ref.get("names") or [],
                "countries": ref.get("countries") or [],
                "start": head, "wikidata": ref.get("qid"),
                "length_km": km,
                "kind": ref.get("trail_kind") or (
                    "day" if km and km <= 30 else "multi-day")}
        matched, hits = te.match_ref(tref, idx, reg)
        ccs = set(tref["countries"])
        for rel in ref.get("osm_rels") or []:
            for r in idx.by_osm.get(rel, []):
                if r["cc"] in ccs and all(r is not x for x, _ in matched):
                    matched.append((r, "osm id"))
        ref["_registry"] = hits[0] if hits else None
        real = [(r, how) for r, how in matched if how != "side trail"]
        if not real:
            continue
        best_rank = min(te.METHOD_RANK[how] for _, how in real)
        tops = [(r, how) for r, how in real
                if te.METHOD_RANK[how] == best_rank]
        tops.sort(key=lambda x: (x[0]["tier"] != "rated", -(x[0]["km"] or 0)))
        row, how = tops[0]
        status = "in" if row["tier"] == "rated" else "in_listed"
        if km and (row["km"] or 0) < m.PIECE_SHARE * km:
            got = sum(r["km"] or 0 for r, _ in real)
            status = ("in_as_stages" if got >= m.STAGES_SHARE * km
                      else "in_as_piece")
        out[ref["id"]] = {"status": status, "by": how, "km": 0.0,
                          "row": {"id": row["id"], "name": row["name"],
                                  "cc": row["cc"], "tier": row["tier"]}}
    return out


def trails_reason(ref):
    km = ref.get("length_km")
    if km and km < 2:
        return "out_of_scope:under_2km"
    if km and km > 400:
        return "out_of_scope:over_400km"
    hit = ref.get("_registry") or {}
    if ref.get("osm_rels") or hit.get("osm"):
        return "osm_relation_not_published"
    if ref.get("lat") is None and not ref.get("qid"):
        return "unlocated"
    return "no_osm_relation"


def run_kind(kind, ref_dir=REF_DIR, wire=WIRE, rels=None, sample=0,
             seed=20261120):
    doc = load_refs(kind, ref_dir)
    if doc is None:
        return None
    refs = doc["rows"]
    for r in refs:
        r["osm_rels"] = sorted({x for x in ([r.get("osm_rel")] +
                                            (rels or {}).get(r.get("qid"), []))
                                if x})
    if kind == "trails":
        rows = []
        hits = trails_hits(refs, wire)
    else:
        rows = wire_rows(kind, wire)
        hits = m.match(kind, refs, rows)
    covered = {f.stem for f in (Path(wire) / kind).glob("*.json")
               if len(f.stem) == 2}
    out_rows = []
    for ref in refs:
        h = hits.get(ref["id"])
        ccs = set(ref.get("countries") or [])
        if not h and ccs and not ccs & covered:
            out_rows.append({"id": ref["id"], "name": ref.get("name"),
                             "tier": ref["tier"], "countries": sorted(ccs),
                             "sitelinks": ref.get("sitelinks"),
                             "sources": ref.get("sources"),
                             "status": "missing",
                             "reason": "out_of_scope:country"})
            continue
        o = {"id": ref["id"], "name": ref.get("name"), "tier": ref["tier"],
             "countries": ref.get("countries"),
             "sitelinks": ref.get("sitelinks"), "sources": ref.get("sources")}
        if h:
            o.update(status=h["status"], by=h["by"], km=h["km"],
                     carta={"id": h["row"]["id"], "name": h["row"]["name"],
                            "cc": h["row"]["cc"], "tier": h["row"]["tier"]})
        else:
            o.update(status="missing",
                     reason=(trails_reason(ref) if kind == "trails" else
                             reason_for(kind, ref, rows, ref["osm_rels"])))
            reg = ref.get("_registry")
            if reg and reg.get("reason"):
                o["registry_reason"] = reg["reason"]
        out_rows.append(o)
    summary = {}
    for tier in ("A", "B"):
        # Items in countries this kind's wire does not cover are counted
        # apart, not in the share: Carta has no beach pages for Turkey.
        tr = [r for r in out_rows if r["tier"] == tier
              and r.get("reason") != "out_of_scope:country"]
        outside = sum(1 for r in out_rows if r["tier"] == tier
                      and r.get("reason") == "out_of_scope:country")
        st = {}
        for r in tr:
            st[r["status"]] = st.get(r["status"], 0) + 1
        reasons = {}
        for r in tr:
            if r["status"] == "missing":
                reasons[r["reason"]] = reasons.get(r["reason"], 0) + 1
        n_in = sum(st.get(s, 0) for s in IN_STATUSES)
        summary[tier] = {"n": len(tr), "in": n_in,
                         "outside_countries": outside,
                         "share": round(n_in / len(tr), 4) if tr else None,
                         "by_status": st, "missing_by_reason": reasons}
    res = {"kind": kind, "reference_at": doc.get("generated_at"),
           "_refs": {r["id"]: r for r in refs}, "_covered": covered,
           "wire_rows": len(rows), "summary": summary, "rows": out_rows}
    if sample:
        rnd = random.Random(seed)
        matched = [r for r in out_rows if r["status"] != "missing"]
        by_name = [r for r in matched if r["by"] == "name"]
        rest = [r for r in matched if r["by"] != "name"]
        rnd.shuffle(by_name)
        rnd.shuffle(rest)
        res["sample"] = (by_name + rest)[:sample]
    return res


HANDOFF_REASONS = ("not_in_wire", "not_in_catalogue", "not_enriched",
                   "dropped_at_export", "osm_relation_not_published",
                   "no_osm_relation")
HANDOFF_KINDS = ("mountains", "lakes", "beaches", "cycling")


def seed_sane(kind, ref):
    """A famous item fit to seed: a mountain stands above the sea and its
    prominence is not more than its height (Ferdinandea, a submarine
    volcano at -8 m, came through the class query)."""
    if kind != "mountains":
        return True
    ele, prom = ref.get("elev_m"), ref.get("prom_m")
    if ele is not None and ele <= 0:
        return False
    if ele is not None and prom is not None and prom > ele:
        return False
    return True


def handoff(kind, res, path=None):
    """data/famous/seed_<kind>.json for mountains, lakes, beaches and
    cycling: the famous (tier A) items the wire lacks, as seed entries the
    kind's pipeline reads (pipeline/mountains/seed_peaks.py,
    pipeline/lakes/seed_lakes.py; beaches and cycling: D25 c and d), keyed
    by Wikidata id, why "famous". Only plain misses: a matcher_miss is reviewed first, and an
    item outside the covered countries stays out.

    Idempotent: an entry from the last file stays while its item is still a
    famous (tier A) item, whether the wire has it now or not. Without that,
    a seeded lake would be found "in" on the next run, leave the file, and
    drop off the wire the run after."""
    path = Path(path or REF_DIR / f"seed_{kind}.json")
    try:
        before = json.loads(path.read_text(encoding="utf-8")).get("rows", [])
    except (OSError, ValueError):
        before = []
    tier_a = {r["qid"]: r for r in res["_refs"].values()
              if r.get("tier") == "A" and r.get("qid")}
    out = {r["wd"]: r for r in before if r.get("wd") in tier_a
           and seed_sane(kind, tier_a[r["wd"]])}
    for row in res["rows"]:
        if (row["tier"] != "A" or row["status"] != "missing"
                or row.get("reason") not in HANDOFF_REASONS):
            continue
        ref = res["_refs"][row["id"]]
        # Points for the place kinds; a cycle route may have none (its OSM
        # relation or its name finds it).
        if not ref.get("qid") or ref["qid"] in out or (
                kind != "cycling" and ref.get("lat") is None):
            continue
        if not seed_sane(kind, ref):
            continue
        ccs = [c for c in ref.get("countries") or [] if c in res["_covered"]]
        if not ccs:
            continue
        if kind == "mountains":
            extra = {"kind": "volcano" if "Q8072" in (ref.get("classes")
                                                      or []) else "peak",
                     "lift": ""}
        elif kind == "lakes":
            extra = {"kind": "lake"}
        elif kind == "cycling":
            extra = {"countries": ccs, "osm_rel": ref.get("osm_rel"),
                     "osm_rels": ref.get("osm_rels") or [],
                     "length_km": ref.get("length_km"),
                     "names": ref.get("names") or []}
        else:
            extra = {}
        entry = {"n": ref["name"], "cc": ccs[0], **extra,
                 "wd": ref["qid"], "why": "famous",
                 "note": f"famous coverage: {ref.get('sitelinks')} "
                         f"Wikipedia languages, missing from the wire"}
        if ref.get("lat") is not None:
            entry["lat"] = round(ref["lat"], 4)
            entry["lon"] = round(ref["lon"], 4)
        out[ref["qid"]] = entry
    rows = sorted(out.values(), key=lambda r: (r["cc"], r["n"]))
    path.write_text(json.dumps(
        {"schema": "carta-famous-seed/1", "kind": kind,
         "generated_by": "pipeline/famous/coverage.py --handoff",
         "rows": rows}, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8")
    return len(rows)


def write_md(report, path):
    lines = ["# Famous coverage", "",
             f"Generated {report['generated_at']}. Headline: tier A rows that "
             "are in Carta (rated, listed, or as stages). Built by "
             "`pipeline/famous/coverage.py`; reference rule in "
             "`pipeline/famous/wikidata.py`.", "",
             "| Kind | Famous (A) | In | Share | Rated | Listed | Stages | "
             "Piece only | Missing | Near (B) in |",
             "|---|---|---|---|---|---|---|---|---|---|"]
    for kind, k in report["kinds"].items():
        a, b = k["summary"]["A"], k["summary"]["B"]
        st = a["by_status"]
        lines.append(
            f"| {kind} | {a['n']} | {a['in']} | "
            f"{(a['share'] or 0) * 100:.0f}% | {st.get('in', 0)} | "
            f"{st.get('in_listed', 0)} | {st.get('in_as_stages', 0)} | "
            f"{st.get('in_as_piece', 0)} | {st.get('missing', 0)} | "
            f"{b['in']} of {b['n']} |")
    for kind, k in report["kinds"].items():
        a = k["summary"]["A"]
        lines += ["", f"## {kind}", "",
                  "Missing famous (A) by reason: " + (", ".join(
                      f"{r} {n}" for r, n in sorted(
                          a["missing_by_reason"].items(),
                          key=lambda x: -x[1])) or "none"), ""]
        miss = [r for r in k["rows"] if r["tier"] == "A"
                and r["status"] in ("missing", "in_as_piece")
                and r.get("reason") != "out_of_scope:country"]
        miss.sort(key=lambda r: -(r.get("sitelinks") or 0))
        if miss:
            lines += ["| Name | Countries | Sitelinks | Status | Reason |",
                      "|---|---|---|---|---|"]
            for r in miss:
                lines.append(
                    f"| {r['name']} | {','.join(r.get('countries') or [])} | "
                    f"{r.get('sitelinks') or ''} | {r['status']} | "
                    f"{r.get('reason', '')} |")
    Path(path).write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv=None):
    global STAGE_DIR
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--kind", default="all", choices=["all", *KINDS])
    ap.add_argument("--refs", default=str(REF_DIR))
    ap.add_argument("--wire", default=str(WIRE))
    ap.add_argument("--out", default=str(OUT_DIR))
    ap.add_argument("--sample", type=int, default=0)
    ap.add_argument("--stages", default=str(STAGE_DIR),
                    help="folder of the beaches, lakes and mountains stages")
    ap.add_argument("--handoff", action="store_true",
                    help="write data/famous/seed_<kind>.json for "
                         "mountains, lakes, beaches and cycling")
    a = ap.parse_args(argv)
    kinds = KINDS if a.kind == "all" else [a.kind]
    STAGE_DIR = Path(a.stages)
    rels = registry_rels()
    report = {"schema": "carta-famous-coverage/1",
              "generated_at": datetime.now(timezone.utc).strftime(
                  "%Y-%m-%dT%H:%M:%SZ"), "kinds": {}}
    for kind in kinds:
        res = run_kind(kind, a.refs, a.wire, rels if kind == "trails"
                       else None, a.sample)
        if res is None:
            print(f"  {kind}: no reference file, skipped")
            continue
        if a.handoff and kind in HANDOFF_KINDS:
            n = handoff(kind, res, Path(a.refs) / f"seed_{kind}.json")
            print(f"  {kind} hand-off: {n} famous item(s) to seed")
        res.pop("_refs", None)
        res.pop("_covered", None)
        report["kinds"][kind] = res
        s = res["summary"]["A"]
        print(f"  {kind}: {s['in']} of {s['n']} famous in "
              f"({(s['share'] or 0) * 100:.0f}%); missing by reason "
              f"{s['missing_by_reason']}")
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "coverage.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8")
    write_md(report, out / "coverage.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
