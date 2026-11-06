"""Data quality scorecard per pipeline run (ROADMAP D2, T1134).

For each layer of the shipped data, four numbers between 0 and 1:

- completeness  share of records that carry the layer's fields (a field that
                is present but empty, "", [] or {}, counts as missing);
- validity      contract pass rate: share of present field values that pass
                docs/wire.schema.json (app_data layers, through
                pipeline/wire_contract.py), or the basic checks below for
                wires that have no contract yet (T1133-d);
- freshness     1 when the wire is inside its cadence, else cadence / age,
                from scripts/freshness_report.py (same stamps, same cadences);
- accuracy      where an eval set exists: today the 200 hand-checked pairwise
                orders in tests/golden_ratings.json for the rating layer.
                Every other layer reads null until the D4 truth set exists.

`score` is the mean of the numbers a layer has. It is a summary for the trend,
not a gate: no threshold fails a run yet (the D2 hard and soft rules are open,
T1134 register rows).

    python -I scripts/quality/scorecard.py                    # print the table
    python -I scripts/quality/scorecard.py --write            # data/reports/quality/<date>.json and .md,
                                                              # plus one line in quality_history.jsonl
    python -I scripts/quality/scorecard.py --public DIR --now 2026-11-06T00:00:00Z --out DIR

Reads only what is on disk (continent-app/public by default); no network.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "continent-app" / "public"
OUT = ROOT / "data" / "reports" / "quality"
GOLDEN = ROOT / "tests" / "golden_ratings.json"
SCORECARD_VERSION = 1

# app_data.json destination fields, grouped by the layer that writes them.
# Fields that are on some records by design (gateways, gateway_of, members,
# anchor_estimated, city_lat/lon, driving_toll, and iata, which only airport
# rows carry) are left out of completeness.
APP_LAYERS = {
    "core":    ["tier", "city", "country", "iso2", "lat", "lon", "categories", "tags", "blurb"],
    "flights": ["anchor_airport", "transfer"],
    "prices":  ["costs", "accommodation", "local_transport"],
    "rating":  ["rating", "taste", "beauty", "country_rank", "country_percentile", "class_percentile"],
    "climate": ["climate", "bathing_water", "crowding"],
    "place":   ["place", "geonames", "wikidata", "designations", "nature", "guide"],
    "imagery": ["image", "activities"],
}

# Wires sharded per country: (folder, record list key, freshness wire, fields, score key).
SHARD_LAYERS = {
    "trails":    ("trails", "trips", "trails",
                  ["name", "summary", "distance_m", "ascent_m", "duration_min", "difficulty", "rating", "img", "rg"],
                  None),
    "beaches":   ("beaches", "beaches", "beaches",
                  ["name", "lat", "lon", "score", "tier", "why", "images", "region", "wiki"], "score"),
    "lakes":     ("lakes", "lakes", "lakes",
                  ["name", "lat", "lon", "score", "tier", "why", "images", "region", "wiki"], "score"),
    "mountains": ("mountains", "mountains", "mountains",
                  ["name", "lat", "lon", "score", "tier", "why", "images", "ele", "wd"], "score"),
    "cycling":   ("cycling", "routes", "cycling",
                  ["name", "km", "score", "why", "img", "paved", "safe", "rg"], "score"),
}

# Europe and its islands, generously (Canaries, Azores, Svalbard, Cyprus).
LAT, LON = (27.0, 81.0), (-32.0, 45.0)


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def present(v) -> bool:
    return v is not None and v != "" and v != [] and v != {}


def ratio(a: int, b: int):
    return round(a / b, 4) if b else None


def freshness_rows(public: Path, now: datetime) -> dict:
    fr = _load_module("freshness_report", ROOT / "scripts" / "freshness_report.py")
    return {name: fr.check_wire(name, public, now) for name in fr.WIRES}


def fresh_score(row: dict | None):
    if not row or row.get("age_days") is None:
        return None
    age, cad = row["age_days"], row["cadence_days"]
    return 1.0 if age <= cad else round(cad / age, 4)


def golden_accuracy(dests: dict):
    if not GOLDEN.is_file():
        return None, {}
    pairs = json.loads(GOLDEN.read_text(encoding="utf-8")).get("pairs", [])

    def score(i):
        r = (dests.get(i) or {}).get("rating") or {}
        s = r.get("score")
        return s if isinstance(s, (int, float)) else None

    ok = scored = 0
    for p in pairs:
        w, lo = score(p.get("winner")), score(p.get("loser"))
        if w is None or lo is None:
            continue
        scored += 1
        ok += w > lo
    return ratio(ok, scored), {"eval_set": "tests/golden_ratings.json", "pairs": len(pairs),
                               "pairs_scored": scored, "pairs_right": ok}


def app_layers(public: Path, fresh: dict) -> list[dict]:
    wc = _load_module("wire_contract", ROOT / "pipeline" / "wire_contract.py")
    schema = wc.load_schema()
    data = json.loads((public / "app_data.json").read_text(encoding="utf-8"))
    dests = data.get("destinations", {})
    places = {k: v for k, v in dests.items() if isinstance(v, dict) and not v.get("gateway_of")}
    props = schema["$defs"]["destination"]["properties"]
    # One sub-schema per field, sharing the root $defs.
    subs = {f: {**props[f], "$defs": schema["$defs"]} for f in props}
    whole = wc.validate(data, schema, catalogue=True)
    acc, acc_meta = golden_accuracy(dests)
    f_row = fresh.get("app_data")
    out = []
    for layer, fields in APP_LAYERS.items():
        have = checked = passed = 0
        per_field = {}
        for f in fields:
            n = 0
            for rec in places.values():
                v = rec.get(f)
                if present(v):
                    n += 1
                if f in rec and f in subs:
                    checked += 1
                    passed += not wc.validate(v, subs[f])
            have += n
            per_field[f] = ratio(n, len(places))
        row = {
            "layer": layer, "wire": "app_data", "records": len(places),
            "completeness": ratio(have, len(places) * len(fields)),
            "validity": ratio(passed, checked), "validity_source": "docs/wire.schema.json",
            "freshness": fresh_score(f_row), "age_days": f_row and f_row.get("age_days"),
            "accuracy": acc if layer == "rating" else None,
            "fields": per_field,
        }
        if layer == "rating":
            row["accuracy_source"] = acc_meta
        out.append(row)
    out[0]["wire_contract_problems"] = len(whole)
    return out


def basic_problems(rec: dict, score_key: str | None) -> int:
    bad = 0
    if not isinstance(rec.get("name"), str) or not rec.get("name").strip():
        bad += 1
    lat, lon = rec.get("lat"), rec.get("lon")
    in_europe = (isinstance(lat, (int, float)) and isinstance(lon, (int, float))
                 and LAT[0] <= lat <= LAT[1] and LON[0] <= lon <= LON[1])
    if (lat is not None or lon is not None) and not in_europe:
        bad += 1
    if score_key and rec.get(score_key) is not None:
        s = rec[score_key]
        if not (isinstance(s, (int, float)) and 0 <= s <= 10):
            bad += 1
    if not present(rec.get("id")):
        bad += 1
    return bad


def shard_layers(public: Path, fresh: dict) -> list[dict]:
    out = []
    for layer, (folder, key, wire, fields, score_key) in SHARD_LAYERS.items():
        recs = []
        for f in sorted((public / folder).glob("*.json")):
            if f.name == "index.json":
                continue
            try:
                d = json.loads(f.read_text(encoding="utf-8"))
            except ValueError:
                continue
            recs += [r for r in d.get(key, []) if isinstance(r, dict)]
        per_field = {fld: ratio(sum(present(r.get(fld)) for r in recs), len(recs)) for fld in fields}
        have = sum(present(r.get(fld)) for r in recs for fld in fields)
        valid = sum(basic_problems(r, score_key) == 0 for r in recs)
        f_row = fresh.get(wire)
        out.append({
            "layer": layer, "wire": wire, "records": len(recs),
            "completeness": ratio(have, len(recs) * len(fields)),
            "validity": ratio(valid, len(recs)),
            "validity_source": "basic checks (id, name, coordinates in Europe, score 0-10); no contract yet (T1133-d)",
            "freshness": fresh_score(f_row), "age_days": f_row and f_row.get("age_days"),
            "accuracy": None, "fields": per_field,
        })
    return out


def build(public: Path = PUBLIC, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    fresh = freshness_rows(public, now)
    layers = app_layers(public, fresh) + shard_layers(public, fresh)
    for row in layers:
        nums = [row[k] for k in ("completeness", "validity", "freshness", "accuracy") if row[k] is not None]
        row["score"] = round(sum(nums) / len(nums), 4) if nums else None
    return {
        "version": SCORECARD_VERSION,
        "generated_at": now.isoformat(timespec="seconds").replace("+00:00", "Z"),
        "public": str(public.relative_to(ROOT)) if public.is_relative_to(ROOT) else str(public),
        "layers": layers,
        "freshness": {k: {kk: v.get(kk) for kk in ("built_at", "age_days", "cadence_days", "status")}
                      for k, v in fresh.items()},
    }


def pct(v) -> str:
    return "n/a" if v is None else f"{v * 100:.1f}%"


def markdown(card: dict) -> str:
    lines = [f"Quality scorecard, {card['generated_at']} (scorecard v{card['version']}, data in `{card['public']}`)", "",
             "| Layer | Wire | Records | Completeness | Validity | Freshness (age d) | Accuracy | Score |",
             "|---|---|---:|---:|---:|---:|---:|---:|"]
    for r in card["layers"]:
        age = "n/a" if r["age_days"] is None else f"{r['age_days']:.0f}"
        lines.append(f"| {r['layer']} | {r['wire']} | {r['records']} | {pct(r['completeness'])} | {pct(r['validity'])} "
                     f"| {pct(r['freshness'])} ({age}) | {pct(r['accuracy'])} | {pct(r['score'])} |")
    lines += ["", ("Completeness: share of records with each layer field filled. Validity: app_data fields against "
                   "docs/wire.schema.json; other wires basic checks only. Freshness: 1 inside the wire's cadence, else "
                   "cadence / age. Accuracy: rating pairwise order against tests/golden_ratings.json; "
                   "n/a where no eval set exists.")]
    return "\n".join(lines) + "\n"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Data quality scorecard (D2)")
    ap.add_argument("--public", default=str(PUBLIC))
    ap.add_argument("--now", help="ISO time to age the wires against (tests)")
    ap.add_argument("--write", action="store_true", help="write <date>.json, <date>.md and a history line")
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--json", action="store_true", help="print JSON instead of the table")
    a = ap.parse_args(argv)
    now = datetime.fromisoformat(a.now.replace("Z", "+00:00")) if a.now else None
    card = build(Path(a.public).resolve(), now)
    md = markdown(card)
    print(json.dumps(card, indent=1) if a.json else md, end="")
    if a.write:
        out = Path(a.out)
        out.mkdir(parents=True, exist_ok=True)
        day = card["generated_at"][:10]
        (out / f"{day}.json").write_text(json.dumps(card, indent=1) + "\n", encoding="utf-8")
        (out / f"{day}.md").write_text(md, encoding="utf-8")
        hist = {"generated_at": card["generated_at"],
                "layers": {r["layer"]: {k: r[k] for k in ("completeness", "validity", "freshness", "accuracy", "score")}
                           for r in card["layers"]}}
        with (out / "quality_history.jsonl").open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(hist) + "\n")
        print(f"written {out / (day + '.json')}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
