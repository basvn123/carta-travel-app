"""Every tag vocabulary Carta uses today, read live from code and shipped data (T1149, ROADMAP F1).

`collect()` returns {source_id: {value: count}}. The mapping test
(tests/test_taxonomy.py) checks that every value of every source has a row
in pipeline/taxonomy/mapping.yaml, so a new tag in the data or the code fails
the test until it is mapped. Counts are uses in the shipped data; a value
defined only in code counts 0.

Out of scope on purpose (see docs/ai/taxonomy.md, "What the mapping covers"):
the 1,057 free-text journey tags (editorial keywords, reported as a coverage
share by `journey_tag_coverage()`, not gated), numeric bands (distance,
ascent, elevation), hazards and services.

The trail detail files (trails/trip/<id>.json highlights[].kind, 17,670
files) are covered through the code that writes the kinds: pipeline/trails/
scenic.py KINDS, read without importing it (T1215, row T1149-h). Reading the
files themselves takes seconds per run; the test checks a sample of them
against KINDS so a kind written outside it still fails.
"""
from __future__ import annotations

import ast
import json
import re
import warnings
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "continent-app"
PUB = APP / "public"


def _json(p: Path):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def _py_const(path: Path, name: str):
    """A literal constant from a Python file, without importing it."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", SyntaxWarning)
        tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == name for t in node.targets):
            if isinstance(node.value, ast.Dict):
                return [ast.literal_eval(k) for k in node.value.keys]
            return ast.literal_eval(node.value)
    raise KeyError(f"{name} not in {path}")


def _js_block(path: Path, start: str) -> str:
    text = path.read_text(encoding="utf-8")
    i = text.index(start)
    depth = 0
    for j in range(i, len(text)):
        c = text[j]
        if c in "[{":
            depth += 1
        elif c in "]}":
            depth -= 1
            if depth == 0:
                return text[i:j + 1]
    raise ValueError(f"unbalanced block {start} in {path}")


def _country_files(folder: str):
    d = PUB / folder
    return sorted(p for p in d.glob("*.json") if re.fullmatch(r"[A-Z]{2}\.json", p.name))


def _count(values) -> dict:
    return dict(Counter(values))


def collect() -> dict[str, dict[str, int]]:
    out: dict[str, dict[str, int]] = {}
    app = _json(PUB / "app_data.json")
    dests = list(app["destinations"].values())

    cats = Counter(c for d in dests for c in (d.get("categories") or []))
    for c in app.get("meta", {}).get("categories") or []:
        cats.setdefault(c, 0)
    out["place.categories"] = dict(cats)
    out["place.tags"] = _count(t for d in dests for t in (d.get("tags") or []))
    out["place.class"] = _count((d.get("place") or {}).get("class") for d in dests if (d.get("place") or {}).get("class"))
    out["place.designations"] = _count(x.get("kind") for d in dests for x in (d.get("designations") or []))
    out["place.activity_kinds"] = _count(
        it.get("kind") for d in dests for it in ((d.get("activities") or {}).get("items") or []) if it.get("kind"))

    guided = _json(PUB / "search" / "guided.json")
    out["vibes"] = {v["id"]: sum(1 for x in guided.get("d", {}).values() if v["id"] in (x.get("v") or {})) for v in guided["vibes"]}
    out["likes"] = {k: 0 for k in _py_const(ROOT / "pipeline" / "place_taste_profile.py", "LIKES")}
    kinds_block = _js_block(APP / "src" / "lib" / "trip_kinds.js", "TRIP_KIND_MAP")
    out["explore.trip_kinds"] = {k: 0 for k in re.findall(r"^\s*(\w+)\s*:", kinds_block, re.MULTILINE)}
    out["trip.themes"] = {k: 0 for k in _py_const(ROOT / "pipeline" / "trips" / "trip_model.py", "THEME_ORDER")}
    types_block = _js_block(APP / "src" / "lib" / "countryMatch.js", "TRIP_TYPES = [")
    out["match.trip_types"] = {k: 0 for k in re.findall(r"key:\s*'(\w+)'", types_block)}
    out["journey.types"] = {t["slug"]: t.get("n", 0) for t in _json(PUB / "journeys" / "index.json")["types"]}
    out["persona"] = {k: 0 for k in _json(APP / "config" / "recommend.json")["persona"]["ids"]}
    out["poi.categories"] = {k: 0 for k in _json(APP / "config" / "rating.json")["poi_categories"]["categories"]}

    hl = Counter()
    for p in sorted((PUB / "dossier").glob("*.json")):
        try:
            for h in _json(p).get("highlights") or []:
                if h.get("kind"):
                    hl[h["kind"]] += 1
        except (ValueError, OSError):
            continue
    out["dossier.highlight_kinds"] = dict(hl)

    tr = {k: Counter() for k in ("grade", "route_type", "highlights", "suitability", "reasons", "category")}
    for p in _country_files("trails"):
        for r in _json(p).get("trips") or []:
            f = r.get("f") or {}
            tr["category"][r.get("category")] += 1
            if f.get("g"):
                tr["grade"][f["g"]] += 1
            if f.get("rt"):
                tr["route_type"][f["rt"]] += 1
            tr["highlights"].update(f.get("hl") or [])
            tr["suitability"].update((f.get("su") or []) + (f.get("sd") or []))
            tr["reasons"].update(x.get("code") for x in (r.get("reasons") or []) if x.get("code"))
    fm = _json(PUB / "trails" / "index.json").get("filter_model", {})
    for v in fm.get("highlights", {}).get("values", []):
        tr["highlights"].setdefault(v, 0)
    for v in fm.get("suitability", {}).get("values", []):
        tr["suitability"].setdefault(v, 0)
    for k, c in tr.items():
        out[f"trail.{k}"] = {x: n for x, n in c.items() if x}

    for layer, key, fields in (("beaches", "beaches", ("tags", "bestFor", "size", "surface")),
                               ("lakes", "lakes", ("tags", "bestFor", "kind")),
                               ("mountains", "mountains", ("tags", "bestFor", "kind", "acc"))):
        acc = {f: Counter() for f in fields}
        for p in _country_files(layer):
            for r in _json(p).get(key) or []:
                for f in fields:
                    v = r.get(f)
                    if isinstance(v, list):
                        acc[f].update(v)
                    elif v:
                        acc[f][v] += 1
        for f, c in acc.items():
            out[f"{layer[:-1] if layer != 'beaches' else 'beach'}.{f}"] = dict(c)

    out["trail.detail_highlights"] = {k: 0 for k in _py_const(ROOT / "pipeline" / "trails" / "scenic.py", "KINDS")}

    bikes = Counter()
    for p in _country_files("cycling"):
        for r in _json(p).get("routes") or []:
            if r.get("bike"):
                bikes[r["bike"]] += 1
    out["cycling.bike"] = dict(bikes)
    return out


def detail_highlight_kinds(every: int = 1) -> dict[str, int]:
    """Kinds in the trail detail files, counted (every Nth file; 1 reads all 17,670, a few seconds)."""
    c = Counter()
    for k, p in enumerate(sorted((PUB / "trails" / "trip").glob("*.json"))):
        if k % every:
            continue
        try:
            c.update(h.get("kind") for h in _json(p).get("highlights") or [] if h.get("kind"))
        except (ValueError, OSError):
            continue
    return dict(c)


def journey_tags() -> dict[str, int]:
    c = Counter()
    for p in sorted((PUB / "journeys" / "journey").glob("*.json")):
        try:
            c.update(_json(p).get("tags") or [])
        except (ValueError, OSError):
            continue
    return dict(c)


if __name__ == "__main__":
    for k, v in collect().items():
        print(k, len(v), sorted(v))
