"""Error per month and per country for the climate, sea and crowds layers (T1194).

The runner reports overall metrics; D23 also wants the error by month and by
country and the largest gaps with a verdict. This reads the same layer
plugin, matches the whole reference list, and writes
data/reports/validation/<layer>/tables-<date>.json and .md. Gap verdicts come
from an owner-kept data/reports/validation/<layer>/gap_reviews.json
({id: {verdict, note}}), merged in by id.

    python -I scripts/validation/layer_tables.py climate|sea|crowds [--now ISO]
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import runner


def _stats(rows):
    d = [r["diff"] for r in rows]
    return {"n": len(d), "mae": round(statistics.mean(abs(x) for x in d), 2),
            "bias": round(statistics.mean(d), 2), "median_abs": round(statistics.median(abs(x) for x in d), 2)}


def tables(results):
    got = [r for r in results if r.get("diff") is not None]
    by_m, by_c = {}, {}
    for r in got:
        by_m.setdefault(r["month"], []).append(r)
        by_c.setdefault(r["country"], []).append(r)
    cell = {}
    for r in got:
        cell.setdefault(r["country"], {}).setdefault(r["month"], []).append(r["diff"])
    return {
        "all": _stats(got) if got else None,
        "by_month": {f"{m:02d}": _stats(v) for m, v in sorted(by_m.items())},
        "by_country": {c: _stats(v) for c, v in sorted(by_c.items())},
        "country_month_bias": {c: {f"{m:02d}": round(statistics.mean(v), 2) for m, v in sorted(ms.items())}
                               for c, ms in sorted(cell.items())},
    }


def markdown(layer, date, t, gaps):
    L = [f"# {layer} error by month and country ({date})", ""]
    if not t["all"]:
        return "\n".join(L + ["No reference rows matched: owner step pending.", ""])
    L += [f"All: n {t['all']['n']}, MAE {t['all']['mae']}, bias {t['all']['bias']}", "",
          "| Month | n | MAE | bias |", "|---|---|---|---|"]
    L += [f"| {m} | {s['n']} | {s['mae']} | {s['bias']} |" for m, s in t["by_month"].items()]
    L += ["", "| Country | n | MAE | bias |", "|---|---|---|---|"]
    L += [f"| {c} | {s['n']} | {s['mae']} | {s['bias']} |" for c, s in t["by_country"].items()]
    L += ["", "## Largest gaps", "", "| id | diff | cause | verdict |", "|---|---|---|---|"]
    for g in gaps:
        v = g.get("review") or {}
        L.append(f"| {g['id']} | {g.get('diff_c', g.get('diff_points'))} | {g['cause_code']} | {v.get('verdict', 'unreviewed')} |")
    return "\n".join(L + [""])


def build(mod, ctx=None, reviews=None):
    ctx = ctx or {}
    refs = mod.references(ctx)
    results = mod.match(refs, mod.load(ctx)) if refs else []
    gaps = mod.gaps(results) if results else []
    for g in gaps:
        if reviews and g["id"] in reviews:
            g["review"] = reviews[g["id"]]
    return {"layer": mod.NAME, "references": len(refs), "tables": tables(results), "gaps": gaps}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("layer", choices=["climate", "sea", "crowds"])
    ap.add_argument("--now")
    ap.add_argument("--out", default=str(runner.VALID_DIR))
    a = ap.parse_args(argv)
    mod = runner.plugin(a.layer)
    out = Path(a.out) / mod.NAME
    now = datetime.fromisoformat(a.now.replace("Z", "+00:00")) if a.now else datetime.now(timezone.utc)
    date = now.date().isoformat()
    res = build(mod, {}, runner.load_json(out / "gap_reviews.json", {}))
    res["date"] = date
    out.mkdir(parents=True, exist_ok=True)
    (out / f"tables-{date}.json").write_text(json.dumps(res, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (out / f"tables-{date}.md").write_text(markdown(mod.NAME, date, res["tables"], res["gaps"]), encoding="utf-8")
    print(f"{mod.NAME}: {res['references']} references, tables written to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
