"""The truth set scorer (T1144, ROADMAP D4).

Scores the shipped data against hand-verified answers, once per release.

    python -I evals/run_truth.py                  print the score table
    python -I evals/run_truth.py --json           print the result as JSON
    python -I evals/run_truth.py --seed-wrong     plant one wrong value in memory: the score must fall
    python -I evals/run_truth.py --write-baseline move evals/truth/baseline.json to this run

Inputs, all in evals/truth/:
    sample.json   the frozen stratified sample (build_sample.py): 100 places,
                  25 trails, 25 beaches and lakes, each with its stratum and weight
    sheet.csv     one row per item and field: the answer (verified_value),
                  its status and its source. The owner fills it (GUIDE.md).
    fields.json   what each field means, how to read it from the wire and how
                  the current value is compared with the answer
    baseline.json the score of the last accepted release (optional)

Row status in the sheet:
    verified      the owner checked it against the source named in source_url
    seeded        derived in the repo from a cited source field already in the
                  data (an OSM tag, the shipped country shapes); counts in the
                  score, shown apart, and the owner confirms it like any row
    unverified    no answer yet: not scored
    unverifiable  the owner could not find a source: not scored
    skip          the field does not apply to this item: not scored

Text fields (a blurb, a trail summary) carry a verdict, not a value:
supported, unsupported or contradicted against the cited source. The row
pins the sha of the text it judged (text_sha); when the shipped text changes,
the row is stale and leaves the score until it is judged again.

Standard library only. No model is called here; the text judge is
evals/truth/judge/judge.mjs, run apart. The Claude API is never used.
"""
from __future__ import annotations

import argparse
import copy
import csv
import hashlib
import json
import math
import re
import sys
import unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
TRUTH_DIR = REPO / "evals" / "truth"
PUBLIC = REPO / "continent-app" / "public"
SAMPLE_PATH = TRUTH_DIR / "sample.json"
SHEET_PATH = TRUTH_DIR / "sheet.csv"
FIELDS_PATH = TRUTH_DIR / "fields.json"
BASELINE_PATH = TRUTH_DIR / "baseline.json"

SHEET_COLUMNS = ["item_id", "kind", "name", "cc", "field", "current_value", "verified_value",
                 "status", "source_url", "evidence", "text_sha", "by", "verified_on", "note"]
SCORED = ("verified", "seeded")
STATUSES = ("verified", "seeded", "unverified", "unverifiable", "skip")
VERDICTS = ("supported", "unsupported", "contradicted")


# ---------------------------------------------------------------- helpers

def load_json(path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def fold(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def text_sha(s):
    return hashlib.sha256(str(s or "").encode("utf-8")).hexdigest()[:12]


def haversine_m(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(a))


def wilson(k, n, z=1.96):
    """Wilson score interval for k successes in n, as [low, high] rounded."""
    if not n:
        return None
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [round(max(0.0, c - h), 4), round(min(1.0, c + h), 4)]


def parse_coords(v):
    if v is None:
        return None
    if isinstance(v, (list, tuple)) and len(v) == 2:
        return float(v[0]), float(v[1])
    m = re.match(r"^\s*(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)\s*$", str(v))
    return (float(m.group(1)), float(m.group(2))) if m else None


def to_number(v):
    if v is None or v == "":
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = re.match(r"^\s*(-?\d+(?:[.,]\d+)?)", str(v))
    return float(m.group(1).replace(",", ".")) if m else None


def to_bool(v):
    if isinstance(v, bool):
        return v
    s = fold(v)
    if s in ("yes", "true", "1", "y"):
        return True
    if s in ("no", "false", "0", "n"):
        return False
    return None


# ---------------------------------------------------------------- the wire

class Wire:
    """Reads the current value of every sampled item from the shipped data."""

    def __init__(self, public=PUBLIC):
        self.public = Path(public)
        self._places = None
        self._country = {}

    def places(self):
        if self._places is None:
            self._places = (load_json(self.public / "app_data.json", {}) or {}).get("destinations", {})
        return self._places

    def country_rows(self, folder, cc, key):
        k = (folder, cc)
        if k not in self._country:
            blob = load_json(self.public / folder / f"{cc}.json", {}) or {}
            self._country[k] = {str(r.get("id")): r for r in (blob.get(key) or [])}
        return self._country[k]

    def trail_detail(self, tid):
        return load_json(self.public / "trails" / "trip" / f"{tid}.json")

    def record(self, item):
        """The raw shipped record of a sample item, or None when it left the data."""
        kind, cc, rid = item["kind"], item["cc"], str(item["ref"])
        if kind == "place":
            return self.places().get(rid)
        if kind == "trail":
            row = self.country_rows("trails", cc, "trips").get(rid)
            if row is None:
                return None
            return {**row, "_detail": self.trail_detail(rid) or {}}
        if kind == "beach":
            return self.country_rows("beaches", cc, "beaches").get(rid)
        if kind == "lake":
            return self.country_rows("lakes", cc, "lakes").get(rid)
        return None


def why_of(rec, key):
    for w in rec.get("why") or []:
        if w.get("k") == key:
            return w
    return None


def current_value(kind, field, rec):
    """The value the shipped data shows a traveller for one field (None when absent)."""
    if rec is None:
        return None
    if kind == "place":
        if field == "country":
            return rec.get("iso2")
        if field == "coords":
            return [rec.get("city_lat") or rec.get("lat"), rec.get("city_lon") or rec.get("lon")]
        if field == "population":
            return (rec.get("geonames") or {}).get("population")
        if field == "image_depicts":
            return (rec.get("image") or {}).get("url")
        if field == "blurb":
            return rec.get("blurb")
    if kind == "trail":
        d = rec.get("_detail") or {}
        if field == "distance_km":
            m = rec.get("distance_m")
            return round(m / 1000, 1) if m is not None else None
        if field == "ascent_m":
            return rec.get("ascent_m")
        if field == "loop":
            return rec.get("is_loop")
        if field == "difficulty":
            return rec.get("difficulty")
        if field == "trailhead":
            s = d.get("start") or {}
            return [s.get("lat"), s.get("lon")] if s.get("lat") is not None else None
        if field == "summary":
            return rec.get("summary")
    if kind in ("beach", "lake"):
        if field == "coords":
            return [rec.get("lat"), rec.get("lon")]
        if field == "name":
            return rec.get("name")
        if field == "water_quality":
            w = rec.get("water") or {}
            if w.get("class"):
                return w["class"].lower()
            for k, v in (("waterExcellent", "excellent"), ("waterGood", "good"), ("waterSufficient", "sufficient"), ("waterPoor", "poor")):
                if why_of(rec, k):
                    return v
            return "none"
        if field == "surface":
            w = why_of(rec, "surface")
            return w.get("surface") if w else None
        if field == "swim":
            for k, v in (("swimYes", "yes"), ("swimLimited", "limited"), ("swimNo", "no"), ("swimUnknown", "unknown")):
                if why_of(rec, k):
                    return v
            return None
        if field == "area_km2":
            w = why_of(rec, "area")
            return w.get("km2") if w else None
    return None


def display(v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return "yes" if v else "no"
    if isinstance(v, list):
        return ", ".join("" if x is None else str(x) for x in v)
    return str(v)


# ---------------------------------------------------------------- comparing

def compare(spec, current, answer, row_text_sha=None):
    """(outcome, detail): outcome is "right", "wrong" or "stale".

    `answer` is the verified_value string from the sheet. The rule is the
    field's `compare` in fields.json."""
    rule = spec["compare"]
    tol = spec.get("tolerance") or {}
    if current is None or current == "" or current == []:
        return "wrong", "the shipped data has no value"
    if rule == "exact":
        a, c = fold(answer), fold(current)
        return ("right" if a == c else "wrong"), f"{display(current)} vs {answer}"
    if rule == "bool":
        a, c = to_bool(answer), to_bool(current)
        if a is None:
            return "wrong", f"answer {answer!r} is not yes or no"
        return ("right" if a == c else "wrong"), f"{display(current)} vs {answer}"
    if rule == "number":
        a, c = to_number(answer), to_number(current)
        if a is None or c is None:
            return "wrong", f"not a number: {display(current)} vs {answer}"
        allowed = max(abs(a) * float(tol.get("rel", 0)), float(tol.get("abs", 0)))
        diff = abs(c - a)
        return ("right" if diff <= allowed + 1e-9 else "wrong"), f"{c:g} vs {a:g} (off {diff:g}, allowed {allowed:g})"
    if rule == "coords":
        a, c = parse_coords(answer), parse_coords(current)
        if a is None or c is None or None in c:
            return "wrong", f"not coordinates: {display(current)} vs {answer}"
        d = haversine_m(a[0], a[1], c[0], c[1])
        return ("right" if d <= float(tol.get("m", 0)) else "wrong"), f"{round(d)} m apart (allowed {tol.get('m')} m)"
    if rule == "category":
        a, c = fold(answer), fold(current)
        order = spec.get("order")
        if a == c:
            return "right", f"{display(current)}"
        if order and a in order and c in order:
            return "wrong", f"{display(current)} vs {answer} ({abs(order.index(a) - order.index(c))} band off)"
        return "wrong", f"{display(current)} vs {answer}"
    if rule == "verdict":
        if row_text_sha and row_text_sha != text_sha(current):
            return "stale", "the text changed since it was judged"
        v = fold(answer)
        if v not in VERDICTS:
            return "wrong", f"verdict {answer!r} is not one of {', '.join(VERDICTS)}"
        return ("right" if v == "supported" else "wrong"), v
    if rule == "yes":
        b = to_bool(answer)
        return ("right" if b else "wrong"), f"owner says {answer}"
    raise ValueError(f"unknown compare rule {rule}")


# ---------------------------------------------------------------- sheet

def read_sheet(path=SHEET_PATH):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def write_sheet(rows, path=SHEET_PATH):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=SHEET_COLUMNS, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in SHEET_COLUMNS})


# ---------------------------------------------------------------- scoring

def plant_wrong(rows, sample_items, fields, wire_records):
    """Change the shipped value of the first scored numeric or exact row in
    memory so that it no longer matches its answer. Returns the planted row."""
    for r in rows:
        if r["status"] not in SCORED:
            continue
        spec = fields[r["kind"]][r["field"]]
        rec = wire_records.get(r["item_id"])
        if rec is None:
            continue
        kind, field = r["kind"], r["field"]
        if kind == "place" and field == "country":
            rec["iso2"] = "ZZ"
        elif kind == "trail" and field == "distance_km" and rec.get("distance_m"):
            rec["distance_m"] = rec["distance_m"] * 2 + 5000
        elif kind == "trail" and field == "loop":
            rec["is_loop"] = not to_bool(r["verified_value"])
        elif kind == "trail" and field == "ascent_m" and rec.get("ascent_m") is not None:
            rec["ascent_m"] = rec["ascent_m"] * 3 + 500
        else:
            continue
        return {"item_id": r["item_id"], "field": r["field"], "rule": spec["compare"]}
    return None


def score(sample=None, rows=None, fields=None, wire=None, seed_wrong=False, baseline=None):
    sample = sample if sample is not None else load_json(SAMPLE_PATH)
    rows = rows if rows is not None else read_sheet()
    fields = fields if fields is not None else load_json(FIELDS_PATH)["fields"]
    wire = wire or Wire()
    items = {it["item_id"]: it for it in sample["items"]}
    records = {iid: copy.deepcopy(wire.record(it)) for iid, it in items.items()}
    planted = plant_wrong(rows, items, fields, records) if seed_wrong else None

    out_rows = []
    agg = {}

    def bump(key, outcome, weight):
        a = agg.setdefault(key, {"n": 0, "right": 0, "stale": 0, "w": 0.0, "w_right": 0.0})
        if outcome == "stale":
            a["stale"] += 1
            return
        a["n"] += 1
        a["w"] += weight
        if outcome == "right":
            a["right"] += 1
            a["w_right"] += weight

    status_counts = {s: 0 for s in STATUSES}
    unknown_rows = 0
    for r in rows:
        st = (r.get("status") or "unverified").strip().lower()
        if st not in STATUSES:
            st = "unverified"
        status_counts[st] += 1
        it = items.get(r["item_id"])
        if it is None:
            unknown_rows += 1
            continue
        if st not in SCORED:
            continue
        kind, field = it["kind"], r["field"]
        spec = fields[kind][field]
        rec = records.get(r["item_id"])
        if rec is None:
            outcome, detail = "wrong", "the item left the shipped data"
        else:
            outcome, detail = compare(spec, current_value(kind, field, rec), r.get("verified_value"), r.get("text_sha") or None)
        w = float(it.get("weight") or 1.0)
        for key in ("all", f"status.{st}", f"kind.{kind}", f"field.{kind}.{field}"):
            bump(key, outcome, w)
        out_rows.append({"item_id": r["item_id"], "kind": kind, "field": field, "status": st,
                         "outcome": outcome, "detail": detail})

    def share(a):
        return round(a["right"] / a["n"], 4) if a and a["n"] else None

    def wshare(a):
        return round(a["w_right"] / a["w"], 4) if a and a["w"] else None

    total = agg.get("all")
    metrics = {
        "accuracy": share(total),
        "scored_rows": total["n"] if total else 0,
        "right_rows": total["right"] if total else 0,
        "stale_rows": sum(a["stale"] for k, a in agg.items() if k == "all"),
        "sheet_rows": len(rows),
        "verified_share": round(status_counts["verified"] / len(rows), 4) if rows else 0,
        "answered_share": round((status_counts["verified"] + status_counts["seeded"]) / len(rows), 4) if rows else 0,
        **{f"rows.{k}": v for k, v in status_counts.items()},
    }
    for key, a in sorted(agg.items()):
        if key == "all":
            continue
        metrics[f"{key}.accuracy"] = share(a)
        metrics[f"{key}.n"] = a["n"]
        if key.startswith("kind."):
            metrics[f"{key}.accuracy_weighted"] = wshare(a)
    ci = wilson(total["right"], total["n"]) if total else None

    failures = [{"key": f"{x['item_id']}.{x['field']}", "was": None, "now": None, "why": x["detail"]}
                for x in out_rows if x["outcome"] == "wrong"]
    gate_fail = []
    base = baseline if baseline is not None else load_json(BASELINE_PATH)
    if base and base.get("accuracy") is not None and metrics["accuracy"] is not None:
        low = (base.get("ci95") or [base["accuracy"], base["accuracy"]])[0]
        if metrics["accuracy"] < low:
            gate_fail.append(f"accuracy {metrics['accuracy']} below the baseline's lower bound {low} (baseline {base['accuracy']}, {base.get('at')})")
    if not metrics["scored_rows"]:
        gate_fail.append("no row is verified or seeded")
    gated = metrics["verified_share"] >= 0.8
    return {
        "metrics": metrics,
        "ci95": ci,
        "rows": out_rows,
        "failures": failures,
        "gate": {"ok": not gate_fail, "failures": gate_fail, "baseline": base, "gated": gated},
        "planted": planted,
        "sample": {"version": sample.get("version"), "seed": sample.get("seed"), "items": len(sample["items"]),
                   "by_kind": sample.get("counts"), "wire_generated_at": sample.get("wire_generated_at")},
        "unknown_rows": unknown_rows,
    }


# ---------------------------------------------------------------- main

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--seed-wrong", action="store_true", help="plant one wrong value in memory")
    ap.add_argument("--write-baseline", action="store_true")
    ap.add_argument("--check", action="store_true", help="exit 1 when the gate fails")
    a = ap.parse_args(argv)
    res = score(seed_wrong=a.seed_wrong)
    if a.json:
        print(json.dumps({k: v for k, v in res.items() if k != "rows"}))
    else:
        m = res["metrics"]
        print(f"truth set {res['sample']['version']}: {m['right_rows']} of {m['scored_rows']} answered rows right "
              f"({m['accuracy']}, 95% {res['ci95']}); "
              f"verified {m['rows.verified']}, seeded {m['rows.seeded']}, unverified {m['rows.unverified']} of {m['sheet_rows']} rows")
        for k in sorted(x for x in m if x.endswith(".accuracy")):
            print(f"  {k[:-9]:32} {m[k]}  (n {m[k[:-9] + '.n']})")
        for f in res["failures"][:20]:
            print(f"  wrong {f['key']}: {f['why']}")
        if res["planted"]:
            print(f"  planted wrong value: {res['planted']}")
        for g in res["gate"]["failures"]:
            print(f"  gate: {g}")
    if a.write_baseline and not a.seed_wrong:
        m = res["metrics"]
        BASELINE_PATH.write_text(json.dumps({"accuracy": m["accuracy"], "ci95": res["ci95"], "scored_rows": m["scored_rows"],
                                             "verified_rows": m["rows.verified"], "sample": res["sample"]["version"],
                                             "at": res["sample"]["wire_generated_at"]}, indent=1) + "\n", encoding="utf-8")
        print(f"baseline written to {BASELINE_PATH.relative_to(REPO)}")
    if a.check and res["gate"]["gated"] and not res["gate"]["ok"]:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
