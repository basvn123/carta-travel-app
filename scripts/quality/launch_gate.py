"""Launch gate: the ROADMAP section 4 marketing-surface table, measured (D2, D9, wave 1 item 0.7).

Read-only over a wire tree (default continent-app/public). Two tables:

- Places (top 300): TOP300_RULE below picks the places; one row per bar of
  the "Places (top 300)" line of ROADMAP section 4.
- Trails (top band): every hike whose v5 band is exceptional or excellent
  (summaries.TOP_BANDS, T1179); one row per bar of the "Trails (top band)" line.

Every row is have of n against a target share. The one pass rule is
`passes(row)`: n > 0 and have / n >= target, so an empty surface never
passes. Rows reuse the pipeline's own rules: a bed is measured by
bed_rules.is_measured, a name is clean when names.name_problems finds
nothing, an intro meets the bar by harvest_place_intros' word count and
MIN_WORDS, a summary is templated by trailStory.js TEMPLATE_MARKS (read from
the app source).

    python -I scripts/quality/launch_gate.py [--public DIR] [--json] [--strict]

Exit 0 (a report), or with --strict exit 1 when any row fails.
Adapted from the research's gate_surface.py (.work/2026-11-17-data-quality-research).
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "continent-app" / "public"
TRAIL_STORY = ROOT / "continent-app" / "src" / "lib" / "trailStory.js"

TOP300_RULE = ("Top 300 places: every shipped dossier with a place, sorted by "
               "verdict.score (highest first, no score last), ties by id; the first 300.")
TOP_BANDS = ("exceptional", "excellent")


def _load(name, rel):
    spec = importlib.util.spec_from_file_location(name, ROOT / rel)
    mod = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str((ROOT / rel).parent))
    # Two modules in this repo are named `common` (pipeline/dossier and
    # pipeline/stays/tests): a cached one made this load, or the next test
    # collection, import the wrong file.
    saved = sys.modules.pop("common", None)
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.modules.pop("common", None)
        if saved is not None:
            sys.modules["common"] = saved
    return mod


bed_rules = _load("bed_rules", "pipeline/stays/bed_rules.py")
names = _load("trail_names", "pipeline/trails/names.py")
difficulty = _load("trail_difficulty", "pipeline/trails/difficulty.py")
intros = _load("harvest_place_intros", "pipeline/dossier/harvest_place_intros.py")


@dataclass
class Row:
    name: str
    have: int
    n: int
    target: float


def passes(row: Row) -> bool:
    return row.n > 0 and row.have / row.n >= row.target


# -- the surface --------------------------------------------------------------

def _json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def surface_key(dossier: dict):
    score = (dossier.get("verdict") or {}).get("score")
    return (-(score if score is not None else -1), str(dossier.get("id")))


def top_places(dossiers: list[dict], n: int = 300) -> list[dict]:
    return sorted((d for d in dossiers if d.get("place")), key=surface_key)[:n]


def load_dossiers(public: Path) -> list[dict]:
    out = []
    for f in sorted((public / "dossier").glob("*.json")):
        if f.name == "index.json":
            continue
        d = _json(f)
        if isinstance(d, dict) and d.get("place"):
            out.append(d)
    return out


def load_trips(public: Path) -> list[dict]:
    rows = []
    for f in sorted((public / "trails").glob("[A-Z][A-Z].json")):
        rows += [r for r in _json(f).get("trips") or [] if isinstance(r, dict)]
    return rows


def load_beaches(public: Path) -> dict:
    out = {}
    for f in sorted((public / "beaches").glob("[A-Z][A-Z].json")):
        d = _json(f)
        for key in ("beaches", "listed"):
            for b in d.get(key) or []:
                if isinstance(b, dict):
                    out[b.get("id")] = b
    return out


def load_pois(public: Path, pid: str) -> list:
    p = public / "poi" / (str(pid).replace(":", "_3A") + ".json")
    if not p.exists():
        return []
    d = _json(p)
    return d if isinstance(d, list) else (d.get("items") or d.get("pois") or [])


# -- place rows (Places (top 300)) --------------------------------------------

def row_hero_photos(places, app):
    have = sum(1 for d in places
               if ((app.get(d["id"]) or {}).get("image") or {}).get("url")
               and len(d.get("gallery") or []) >= 5)
    return Row("Hero and 5+ photos", have, len(places), 1.0)


def row_intro(places, app):
    have = sum(1 for d in places
               if intros.words((d.get("intro") or {}).get("body")) >= intros.MIN_WORDS)
    return Row(f"Full intro ({intros.MIN_WORDS}+ words)", have, len(places), 1.0)


def row_must_see(places, pois_of):
    # Pooled over every must-see POI of the surface, as the bar reads.
    must = [p for d in places for p in pois_of(d["id"]) if p.get("label") == "must_see"]
    return Row("Must-see POIs described", sum(1 for p in must if p.get("desc")), len(must), 0.95)


def row_bed(places, app):
    have = sum(1 for d in places
               if bed_rules.is_measured((app.get(d["id"]) or {}).get("accommodation")))
    return Row("Measured bed price", have, len(places), 0.95)


def row_fare(places, app):
    towns = [app.get(d["id"]) or {} for d in places
             if ((app.get(d["id"]) or {}).get("place") or d.get("place") or {}).get("class") in ("metro", "city")]
    have = sum(1 for a in towns if any("fare" in k for k in (a.get("local_transport") or {})))
    return Row("Local fare (metro and city)", have, len(towns), 1.0)


def row_crowds(places, app):
    have = sum(1 for d in places
               if len((((app.get(d["id"]) or {}).get("crowding") or {}).get("monthly") or {}).get("share") or []) == 12)
    return Row("Crowds by month", have, len(places), 1.0)


def row_sea_temp(places, beaches):
    near = {b.get("id") for d in places for b in ((d.get("nearby") or {}).get("beaches") or [])}
    rows = [beaches[i] for i in near if i in beaches]
    return Row("Sea temperature (nearby beaches)", sum(1 for b in rows if b.get("sea_temp")), len(rows), 1.0)


def place_gate(places, app, beaches, pois_of):
    return [row_hero_photos(places, app), row_intro(places, app), row_must_see(places, pois_of),
            row_bed(places, app), row_fare(places, app), row_crowds(places, app),
            row_sea_temp(places, beaches)]


# -- trail rows (Trails (top band)) -------------------------------------------

def template_marks(src: Path = TRAIL_STORY) -> list:
    """trailStory.js TEMPLATE_MARKS, so the gate and the app agree on what
    a boilerplate summary is."""
    text = src.read_text(encoding="utf-8")
    block = text.split("const TEMPLATE_MARKS = [", 1)[1].split("];", 1)[0]
    return [re.compile(m.group(1), re.IGNORECASE if "i" in m.group(2) else 0)
            for m in re.finditer(r"^\s*/(.+)/([a-z]*),\s*$", block, re.MULTILINE)]


def top_band(trips):
    return [r for r in trips if r.get("category") == "hike"
            and (r.get("v5") or {}).get("band") in TOP_BANDS]


def row_photo(rows):
    return Row("Photo", sum(1 for r in rows if (r.get("img") or {}).get("u")), len(rows), 0.95)


def row_summary(rows, marks):
    def ok(r):
        s = r.get("summary") or r.get("description_md")
        return bool(s) and not any(m.search(s) for m in marks)
    return Row("Summary (not templated)", sum(1 for r in rows if ok(r)), len(rows), 1.0)


def row_name(rows):
    return Row("Clean display name", sum(1 for r in rows if not names.name_problems(r.get("name"))),
               len(rows), 1.0)


def row_difficulty(rows):
    # Climb-based difficulty per day only applies to walks of two days or
    # more (T1092): those must carry f.d.
    multi = [r for r in rows if difficulty.day_effort(r)["days"] >= 2]
    return Row("Climb-based difficulty (multi-day f.d)",
               sum(1 for r in multi if (r.get("f") or {}).get("d") is not None), len(multi), 1.0)


def row_time_climb(rows):
    have = sum(1 for r in rows if r.get("duration_min") is not None and r.get("ascent_m") is not None)
    return Row("Time and climb on the card", have, len(rows), 1.0)


def row_url(rows):
    have = sum(1 for r in rows if r.get("id") and r.get("country"))
    return Row("Own URL", have, len(rows), 1.0)


def trail_gate(rows, marks):
    return [row_photo(rows), row_summary(rows, marks), row_name(rows), row_difficulty(rows),
            row_time_climb(rows), row_url(rows)]


# -- report -------------------------------------------------------------------

def measure(public: Path) -> dict:
    places = top_places(load_dossiers(public))
    app_path = public / "app_data.json"
    app = (_json(app_path).get("destinations") or {}) if app_path.exists() else {}
    beaches = load_beaches(public)
    cache = {}

    def pois_of(pid):
        if pid not in cache:
            cache[pid] = load_pois(public, pid)
        return cache[pid]

    return {"public": str(public), "top300_rule": TOP300_RULE,
            "places": place_gate(places, app, beaches, pois_of),
            "trails": trail_gate(top_band(load_trips(public)), template_marks())}


def _pct(row):
    return f"{100 * row.have / row.n:.1f}%" if row.n else "n/a"


def markdown(res: dict) -> str:
    out = []
    for title, key in (("Places (top 300)", "places"), ("Trails (top band)", "trails")):
        out += [f"### {title}", "", "| Gate row | Today | Target | Pass |", "|---|---|---|---|"]
        for r in res[key]:
            out.append(f"| {r.name} | {_pct(r)} ({r.have} of {r.n}) | {r.target:.0%} | "
                       f"{'yes' if passes(r) else 'no'} |")
        out.append("")
    out.append(res["top300_rule"])
    return "\n".join(out)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="ROADMAP section 4 launch gate (D2, D9)")
    ap.add_argument("--public", default=str(PUBLIC))
    ap.add_argument("--json", action="store_true", help="print JSON instead of markdown")
    ap.add_argument("--strict", action="store_true", help="exit 1 when any row fails")
    a = ap.parse_args(argv)
    res = measure(Path(a.public))
    if a.json:
        print(json.dumps({**res, "places": [dict(asdict(r), passes=passes(r)) for r in res["places"]],
                          "trails": [dict(asdict(r), passes=passes(r)) for r in res["trails"]]},
                         ensure_ascii=False, indent=1))
    else:
        print(markdown(res))
    failed = not all(passes(r) for r in res["places"] + res["trails"])
    return 1 if a.strict and failed else 0


if __name__ == "__main__":
    sys.exit(main())
