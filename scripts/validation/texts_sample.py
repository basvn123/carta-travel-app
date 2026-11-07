"""The D23 texts run (T1196): a stratified sample of the texts Carta ships, each
with the source it cites, for the judge (pipeline/judge, prompt judge-text).

Strata (kind, then country inside the kind, seeded by a hash so the draw is
the same on every machine):

  place_blurb         app_data.json `blurb` against the Wikivoyage text it
                      cites (`guide.text`, `guide.url`). Blurbs with no cited
                      text are counted, not judged (nothing to judge against).
  trail_summary/wire  the `summary` the trail wire ships today, against the
                      trail's OSM tags and Carta's measured numbers.
  trail_summary/t1179 the T1179 summaries (data/trails/summaries.json, not on
                      the wire yet) against the raw wire facts they are built
                      from (row, elevation, surface, highlights, passes).
  trip_text           the curated journey `summary` against the journey's own
                      verified-sources note and its own data (itinerary,
                      season, budget, difficulty). The outside check of the
                      journey data itself is the trips layer (S111).

The 50 D4 calibration texts are left out, so the run never judges its own
calibration set.

    python -I scripts/validation/texts_sample.py build [--out FILE]
    python -I scripts/validation/texts_sample.py report --items FILE --verdicts FILE [--out DIR]

`report` writes `provisional-<date>.json` and `.md` (not a dated runner
result: the texts layer has no baseline and the judge is not calibrated, so
nothing here may reach the D2 gate yet).
"""
from __future__ import annotations

import argparse
import glob
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline.judge import calibrate as cal
from pipeline.judge import core

PUBLIC = ROOT / "continent-app" / "public"
SUMMARIES = ROOT / "data" / "trails" / "summaries.json"
OUT_DIR = ROOT / "data" / "reports" / "validation" / "texts"
SEED = "t1196"
SIZES = {"place_blurb": 40, "trail_summary/wire": 20, "trail_summary/t1179": 20, "trip_text": 40}
TRAIL_TAGS = ("name", "name:en", "ref", "from", "to", "roundtrip", "distance", "ascent", "descent", "operator",
              "network", "osmc:symbol", "description", "website", "sac_scale")
Z95 = 1.959963984540054


def h(s: str) -> str:
    return hashlib.sha1(f"{SEED}:{s}".encode()).hexdigest()


def load(path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def allocate(sizes: dict, total: int) -> dict:
    """Proportional allocation with at least one per country while the total
    allows (largest remainder), the countries ordered by hash for the ties."""
    keys = sorted(sizes, key=lambda c: (-sizes[c], h(c)))
    if total <= len(keys):
        picked = sorted(keys, key=h)[:total]
        return {c: (1 if c in picked else 0) for c in keys}
    out = {c: 1 for c in keys}
    left = total - len(keys)
    pop = sum(sizes.values())
    raw = {c: left * sizes[c] / pop for c in keys}
    for c in keys:
        out[c] += int(raw[c])
    rest = total - sum(out.values())
    for c in sorted(keys, key=lambda c: (-(raw[c] - int(raw[c])), h(c)))[:rest]:
        out[c] += 1
    return {c: min(out[c], sizes[c]) for c in keys}


def draw(pool: list, n: int) -> list:
    """pool: [(country, key, item)] -> n items stratified by country."""
    by = {}
    for cc, key, it in pool:
        by.setdefault(cc, []).append((key, it))
    alloc = allocate({c: len(v) for c, v in by.items()}, n)
    out = []
    for cc in sorted(by):
        rows = sorted(by[cc], key=lambda r: h(r[0]))[:alloc.get(cc, 0)]
        out += [it for _, it in rows]
    return out


def calibration_refs() -> set:
    blob = load(ROOT / core.config()["labels"]["sample"], {}) or {}
    return {str(it.get("ref")) for it in blob.get("items") or []}


def strip_md(s: str) -> str:
    return re.sub(r"\*\*?([^*]+)\*\*?", r"\1", s or "").strip()


# ---- pools ----

def place_pool(skip):
    places = (load(PUBLIC / "app_data.json", {}) or {}).get("destinations", {})
    pool, counts = [], {"blurbs": 0, "with_cited_text": 0}
    for pid, v in places.items():
        if not v.get("blurb"):
            continue
        counts["blurbs"] += 1
        g = v.get("guide") or {}
        if not g.get("text"):
            continue
        counts["with_cited_text"] += 1
        if f"place:{pid}" in skip:
            continue
        cc = v.get("iso2") or "??"
        pool.append((cc, f"place:{pid}", {
            "ref": f"place:{pid}", "kind": "place_blurb", "stratum": "place_blurb", "country": cc,
            "subject": f"{v.get('city')}, {v.get('country')}", "text": v["blurb"],
            "source": {"cited": g.get("url"), "text": g["text"]}}))
    return pool, counts


def trail_rows():
    for f in sorted(glob.glob(str(PUBLIC / "trails" / "??.json"))):
        blob = load(f, {}) or {}
        yield from blob.get("trips") or []


def trail_detail(tid):
    return load(PUBLIC / "trails" / "trip" / f"{tid}.json", {}) or {}


def wire_facts(row, d):
    tags = d.get("tags_raw") or {}
    return {
        "name": row.get("name"), "country": row.get("country"),
        "distance_km": round((row.get("distance_m") or 0) / 1000, 1), "ascent_m": row.get("ascent_m"),
        "descent_m": row.get("descent_m"), "walking_time_min": row.get("duration_min"),
        "is_loop": row.get("is_loop"), "route_shape": (row.get("f") or {}).get("rt"),
        "difficulty": row.get("difficulty"), "sac_scale": d.get("sac_scale"), "network": d.get("network"),
        "waymark_ref": d.get("waymark_ref"), "osm_relation": row.get("osm"),
        "osm_tags": {k: tags[k] for k in TRAIL_TAGS if k in tags},
    }


def t1179_facts(row, d):
    f = wire_facts(row, d)
    gp = d.get("grade_parts") or {}
    f.update({
        "note": "climb is read uphill: when descent is much larger than ascent the line is stored downhill and the larger figure is the climb; days are worked out from distance and climb",
        "elevation_m": {k: (row.get("ele") or {}).get(k) for k in ("start", "end", "max", "min")},
        "stage": row.get("h"), "surface_shares": row.get("sf"),
        "sac_worst": gp.get("sac_worst"), "sac_worst_share": gp.get("sac_worst_share"),
        "highlights": [{k: x.get(k) for k in ("kind", "name", "ele_m", "along_m")} for x in (d.get("highlights") or [])][:25],
        "passes": d.get("passes"), "snow_free_season": (row.get("f") or {}).get("se"),
    })
    return f


def trail_pools(skip):
    summaries = (load(SUMMARIES, {}) or {}).get("items") or {}
    wire, new, counts = [], [], {"wire_summaries": 0, "t1179_summaries": len(summaries)}
    rows = {}
    for r in trail_rows():
        rows[str(r.get("id"))] = r
        if r.get("summary"):
            counts["wire_summaries"] += 1
            if str(r.get("id")) not in skip:
                wire.append((r.get("country") or "??", f"wire:{r['id']}", r))
    for tid, s in summaries.items():
        if tid in rows and tid not in skip:
            new.append((s.get("cc") or rows[tid].get("country") or "??", f"t1179:{tid}", (rows[tid], s)))
    return wire, new, counts


def trail_item(row, text, stratum, facts_fn):
    d = trail_detail(row["id"])
    return {"ref": f"{stratum}:{row['id']}", "kind": "trail_summary", "stratum": stratum, "country": row.get("country"),
            "subject": row.get("name"), "text": text,
            "source": {"cited": f"https://www.openstreetmap.org/relation/{row.get('osm')}", "facts": facts_fn(row, d)}}


def journey_pool(skip):
    pool = []
    for f in sorted(glob.glob(str(PUBLIC / "journeys" / "journey" / "*.json"))):
        j = load(f, {}) or {}
        if not j.get("summary") or j.get("id") in skip:
            continue
        bp, b, p = j.get("bestPeriod") or {}, j.get("budget") or {}, j.get("profile") or {}
        data = {
            "title": j.get("title"), "country": j.get("country"), "days": j.get("durationDays"),
            "best_period": bp.get("window"), "avoid": bp.get("avoid"),
            "budget": b.get("totalNote"), "difficulty": p.get("difficultyNote"),
            "gateway": j.get("gatewayAirport"),
            "itinerary": [{k: strip_md(str(day.get(k) or "")) for k in ("day", "title", "morning", "afternoon", "evening", "dayStats")}
                          for day in j.get("itinerary") or []],
        }
        src = j.get("sources") or {}
        pool.append((j.get("countryCode") or "??", f"journey:{j['id']}", {
            "ref": f"journey:{j['id']}", "kind": "trip_text", "stratum": "trip_text", "country": j.get("countryCode"),
            "subject": j.get("title"), "text": strip_md(j["summary"]),
            "summary_generated": bool(j.get("summaryGenerated")),
            "source": {"cited": (j.get("provenance") or {}).get("sourceFile"), "verified": src.get("verified"),
                       "trip_data": data}}))
    return pool


def build():
    skip = calibration_refs() | {r.split(":", 1)[1] for r in calibration_refs() if ":" in r}
    places, pc = place_pool(skip)
    wire, new, tc = trail_pools(skip)
    trips = journey_pool(skip)
    items = draw(places, SIZES["place_blurb"])
    items += [trail_item(r, r["summary"], "wire", wire_facts) for r in draw(wire, SIZES["trail_summary/wire"])]
    items += [trail_item(r, s["text"], "t1179", t1179_facts) for r, s in draw(new, SIZES["trail_summary/t1179"])]
    items += draw(trips, SIZES["trip_text"])
    for i, it in enumerate(sorted(items, key=lambda x: h("order:" + x["ref"])), 1):
        it["text_id"] = f"x{i:03d}"
    items.sort(key=lambda x: x["text_id"])
    for it in items:
        if it["stratum"] in ("wire", "t1179"):
            it["stratum"] = f"trail_summary/{it['stratum']}"
    pops = {"place_blurb": len(places), "trail_summary/wire": len(wire), "trail_summary/t1179": len(new),
            "trip_text": len(trips)}
    return {"version": "carta-texts-sample/1", "task": "T1196", "seed": SEED, "n": len(items),
            "population": pops, "counts": {**pc, **tc, "journeys_with_summary": len(trips)},
            "excluded": "the 50 D4 calibration texts", "items": items}


# ---- report ----

def wilson(k, n):
    if not n:
        return None, None
    p = k / n
    d = 1 + Z95 ** 2 / n
    c = (p + Z95 ** 2 / (2 * n)) / d
    m = Z95 * ((p * (1 - p) / n + Z95 ** 2 / (4 * n * n)) ** 0.5) / d
    return round(max(0.0, c - m), 4), round(min(1.0, c + m), 4)


def share(rows, verdict):
    k, n = sum(r["verdict"] == verdict for r in rows), len(rows)
    lo, hi = wilson(k, n)
    return {"value": round(k / n, 4) if n else None, "k": k, "n": n, "low": lo, "high": hi}


def report(items_path, verdicts_path):
    items = core.load_items(items_path)
    blob = load(items_path, {}) or {}
    v = core.read_verdicts(verdicts_path)
    calib = cal.calibration_for(core.newest_verdicts(core.JUDGMENTS_DIR, backend=v.get("backend")))
    rows = []
    for it in items:
        got = (v["verdicts"].get(core.item_id(it)) or {})
        rows.append({"id": core.item_id(it), "ref": it.get("ref"), "stratum": it.get("stratum") or core.kind_of(it),
                     "country": it.get("country"), "subject": it.get("subject"), "verdict": got.get("verdict"),
                     "reason": got.get("reason"),
                     "claims": [c for c in got.get("claims") or [] if c.get("verdict") != "supported"][:6]})
    judged = [r for r in rows if r["verdict"] in core.VERDICTS]
    strata = sorted({r["stratum"] for r in rows})
    pops = blob.get("population") or {}
    per = {}
    for s in strata:
        rs = [r for r in judged if r["stratum"] == s]
        per[s] = {"population": pops.get(s), "n": len(rs), **{k: share(rs, k) for k in core.VERDICTS}}
    tot_pop = sum(pops.get(s) or 0 for s in strata)
    weighted = None
    if tot_pop and all(per[s]["n"] for s in strata):
        weighted = round(sum((pops[s] / tot_pop) * per[s]["supported"]["value"] for s in strata), 4)
    shipped = [st for st in strata if st != "trail_summary/t1179" and per[st]["n"]]
    sp = sum(pops.get(st) or 0 for st in shipped)
    weighted_shipped = round(sum((pops[st] / sp) * per[st]["supported"]["value"] for st in shipped), 4) if sp else None
    order = {"contradicted": 0, "unsupported": 1}
    worst = sorted((r for r in judged if r["verdict"] in order), key=lambda r: (order[r["verdict"]], r["stratum"], r["id"]))
    calib = calib or {}
    return {
        "schema": "carta-texts-validation/1", "task": "T1196", "layer": "texts", "provisional": True,
        "why_provisional": "the judge counts only once calibrated on the owner's labels (T1144-a, T1144-b, T1188-a); "
                           + "; ".join(calib.get("reasons") or ["no calibration"]),
        "items": core.rel(core.abspath(str(items_path))), "verdicts": v.get("file"),
        "judge": {"backend": v.get("backend"), "model": v.get("model"), "prompt": v.get("prompt"),
                  "prompt_sha": v.get("prompt_sha"), "stale": v.get("stale")},
        "calibration": {"counts": bool(calib.get("counts")), "labels": calib.get("labels"),
                        "kappa": (calib.get("kappa") or {}).get("kappa"), "kappa_low95": calib.get("kappa_low95")},
        "n": len(rows), "judged": len(judged),
        "overall": {k: share(judged, k) for k in core.VERDICTS},
        "supported_weighted_by_population": weighted,
        "supported_shipped_weighted": weighted_shipped,
        "per_stratum": per,
        "worst": worst[:30],
    }


def write_md(res, path):
    L = [f"# Texts validation, provisional ({res['task']}, ROADMAP D23)", "",
         f"PROVISIONAL: {res['why_provisional']}.", "",
         (f"Judge: {res['judge']['backend']} ({res['judge']['model']}), prompt {res['judge']['prompt']} {res['judge']['prompt_sha']}. "
          f"Items: `{res['items']}`. Judged {res['judged']} of {res['n']}."), "",
         "| Stratum | Population | n | Supported | 95% | Unsupported | Contradicted |", "|---|---|---|---|---|---|---|"]
    for s, p in res["per_stratum"].items():
        sp = p["supported"]
        L.append(f"| {s} | {p['population']} | {p['n']} | {sp['k']} ({sp['value']:.0%}) | {sp['low']:.0%} to {sp['high']:.0%} "
                 f"| {p['unsupported']['k']} | {p['contradicted']['k']} |")
    o = res["overall"]["supported"]
    L += [(f"| all | | {o['n']} | {o['k']} ({o['value']:.0%}) | {o['low']:.0%} to {o['high']:.0%} | "
           f"{res['overall']['unsupported']['k']} | {res['overall']['contradicted']['k']} |"), "",
          (f"Supported share weighted by stratum population: {res['supported_weighted_by_population']} "
           f"(the T1179 summaries are not shipped yet; over the shipped strata only: {res['supported_shipped_weighted']})."), "",
          "## Worst cases (contradicted first)", ""]
    for r in res["worst"]:
        L.append(f"- `{r['id']}` {r['stratum']}, {r['subject']} ({r['country']}): **{r['verdict']}**. {r['reason']}")
        for c in r["claims"][:3]:
            L.append(f"  - {c['verdict']}: {c['claim']}")
    Path(path).write_text("\n".join(L) + "\n", encoding="utf-8")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("--out", default=str(OUT_DIR / "items.json"))
    r = sub.add_parser("report")
    r.add_argument("--items", default=str(OUT_DIR / "items.json"))
    r.add_argument("--verdicts", required=True)
    r.add_argument("--out", default=str(OUT_DIR))
    r.add_argument("--date", default=None)
    a = ap.parse_args(argv)
    if a.cmd == "build":
        res = build()
        core.write_json(a.out, res)
        print(json.dumps({"n": res["n"], "population": res["population"], "counts": res["counts"]}))
        return 0
    res = report(a.items, a.verdicts)
    date = a.date or core.now_iso()[:10]
    out = Path(a.out)
    core.write_json(out / f"provisional-{date}.json", res)
    write_md(res, out / f"provisional-{date}.md")
    print(json.dumps({"judged": res["judged"], "overall": res["overall"]["supported"],
                      "weighted": res["supported_weighted_by_population"]}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
