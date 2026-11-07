"""Load, check and use the Carta travel taxonomy (T1149, ROADMAP F1).

    python -I pipeline/taxonomy/taxonomy.py check      validate the taxonomy and the mapping, print counts
    python -I pipeline/taxonomy/taxonomy.py coverage   every live tag value and the nodes it maps to

`baseline_predictions(items)` is the "today's tags" baseline the eval scores
(continent-app/scripts/eval/adapters/taxonomy.mjs): for each item it maps the
tags Carta already holds through mapping.yaml and ranks the nodes by how many
old tags point at them. It is the number the S66 tagger has to beat. No model
is called anywhere in this module.
"""
from __future__ import annotations

import json
import os
import re
import sys
from collections import Counter
from functools import lru_cache
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
TAXONOMY = HERE / "carta_taxonomy.yaml"
MAPPING = HERE / "mapping.yaml"
LANGS = ("en", "de", "fr", "es", "it", "nl")
APPLIES = ("place", "trail", "beach", "lake", "mountain")
SOURCES = ("text", "data", "both")
ID_RE = re.compile(r"^(activity|setting|vibe|traveller|practical|(act|set|vibe|trav|prac)\.[a-z0-9]+(-[a-z0-9]+)*)$")
DASHES = (chr(0x2013), chr(0x2014))  # en and em dash


def default_public() -> Path:
    """The shipped data root: CARTA_PUBLIC when set, else continent-app/public under the repo (T1154-d)."""
    return Path(os.environ.get("CARTA_PUBLIC") or ROOT / "continent-app" / "public")


@lru_cache(maxsize=1)
def load() -> dict:
    with open(TAXONOMY, encoding="utf-8") as f:
        return yaml.safe_load(f)


@lru_cache(maxsize=1)
def load_mapping() -> dict:
    with open(MAPPING, encoding="utf-8") as f:
        return yaml.safe_load(f)


def nodes() -> dict[str, dict]:
    return {n["id"]: n for n in load()["nodes"]}


def validate(tax: dict | None = None) -> list[str]:
    """Problems with the taxonomy, as strings; empty means valid."""
    tax = tax or load()
    bad: list[str] = []
    ns = tax.get("nodes") or []
    by_id: dict[str, dict] = {}
    for n in ns:
        if n["id"] in by_id:
            bad.append(f"duplicate id {n['id']}")
        by_id[n["id"]] = n
    prefix = {f["id"]: f["prefix"] for f in tax.get("facets", [])}
    for n in ns:
        i = n["id"]
        if not ID_RE.match(i):
            bad.append(f"{i}: id does not match <prefix>.<slug>")
        if n.get("parent") is None:
            if n.get("level") != 0 or n.get("facet") != i:
                bad.append(f"{i}: a root must be level 0 and its own facet")
        else:
            p = by_id.get(n["parent"])
            if not p:
                bad.append(f"{i}: parent {n['parent']} missing")
            else:
                if n.get("level") != p.get("level", -9) + 1:
                    bad.append(f"{i}: level {n.get('level')} is not parent level + 1")
                if i not in (p.get("children") or []):
                    bad.append(f"{i}: not listed in {p['id']}.children")
                if n.get("facet") != p.get("facet"):
                    bad.append(f"{i}: facet differs from its parent")
            if prefix.get(n.get("facet")) and not i.startswith(prefix[n["facet"]] + "."):
                bad.append(f"{i}: id prefix does not match facet {n.get('facet')}")
        if not 0 <= (n.get("level") or 0) <= 3:
            bad.append(f"{i}: level {n.get('level')} outside 0 to 3")
        for c in n.get("children") or []:
            if by_id.get(c, {}).get("parent") != i:
                bad.append(f"{i}: child {c} does not name it as parent")
        lab = n.get("label") or {}
        if not lab.get("en"):
            bad.append(f"{i}: no English label")
        for l in LANGS:
            if l not in lab:
                bad.append(f"{i}: label has no {l} key (null is fine)")
        if not (n.get("definition") or "").strip():
            bad.append(f"{i}: no definition")
        for x in n.get("not_to_be_confused_with") or []:
            if x not in by_id:
                bad.append(f"{i}: not_to_be_confused_with {x} missing")
            if x == i:
                bad.append(f"{i}: confused with itself")
        if not n.get("applies_to") or any(a not in APPLIES for a in n["applies_to"]):
            bad.append(f"{i}: applies_to must be a subset of {APPLIES}")
        if n.get("source") not in SOURCES:
            bad.append(f"{i}: source must be one of {SOURCES}")
        text = json.dumps(n, ensure_ascii=False)
        if any(d in text for d in DASHES):
            bad.append(f"{i}: holds an en or em dash")
    labels = Counter((n["facet"], (n.get("label") or {}).get("en", "").lower()) for n in ns)
    for (facet, lab), k in labels.items():
        if k > 1:
            bad.append(f"label '{lab}' used {k} times in facet {facet}")
    return bad


def mapping_problems(collected: dict[str, dict[str, int]]) -> list[str]:
    """Every live value of every source must have a mapping row; rows must name real nodes."""
    m = load_mapping()["sources"]
    ids = set(nodes())
    bad: list[str] = []
    for src, values in collected.items():
        block = m.get(src)
        if block is None:
            bad.append(f"source {src} has no block in mapping.yaml")
            continue
        rows = block.get("map") or {}
        nac = block.get("not_a_concept") or {}
        for v in values:
            if v not in rows:
                bad.append(f"{src}: value '{v}' is not mapped")
            elif not rows[v] and v not in nac:
                bad.append(f"{src}: value '{v}' maps to nothing and has no not_a_concept reason")
    for src, block in m.items():
        for v, targets in (block.get("map") or {}).items():
            for t in targets or []:
                if t not in ids:
                    bad.append(f"{src}: '{v}' maps to unknown node {t}")
        for v in block.get("not_a_concept") or {}:
            if (block.get("map") or {}).get(v):
                bad.append(f"{src}: '{v}' is both mapped and not_a_concept")
    return bad


def map_value(source: str, value) -> list[str]:
    row = (load_mapping()["sources"].get(source) or {}).get("map") or {}
    return list(row.get(value) or [])


# ---- the baseline: today's tags, mapped ----

def _root(public) -> str:
    return str(Path(public) if public else default_public())


@lru_cache(maxsize=256)
def _country_rows(folder: str, key: str, cc: str, public: str) -> list[dict]:
    p = Path(public) / folder / f"{cc}.json"
    if not p.exists():
        return []
    with open(p, encoding="utf-8") as f:
        return json.load(f).get(key) or []


@lru_cache(maxsize=4)
def _app(public: str) -> dict:
    p = Path(public) / "app_data.json"
    if not p.exists():
        return {}
    with open(p, encoding="utf-8") as f:
        d = json.load(f).get("destinations") or {}
    return {x["id"]: x for x in d} if isinstance(d, list) else d


@lru_cache(maxsize=4)
def _guided(public: str) -> dict:
    p = Path(public) / "search" / "guided.json"
    if not p.exists():
        return {}
    with open(p, encoding="utf-8") as f:
        return json.load(f).get("d", {})


VIBE_MIN = 50  # a vibe score at or over this counts as the place holding the vibe (0 to 100)


def old_tags(layer: str, item_id: str, country: str, public: Path | str | None = None) -> list[tuple[str, str]]:
    """(source, value) pairs Carta holds today for one item, read from `public` (default: default_public())."""
    out: list[tuple[str, str]] = []
    pub = _root(public)
    if layer == "place":
        d = _app(pub).get(item_id) or {}
        out += [("place.categories", c) for c in d.get("categories") or []]
        out += [("place.tags", t) for t in d.get("tags") or []]
        if (d.get("place") or {}).get("class"):
            out.append(("place.class", d["place"]["class"]))
        out += [("place.designations", x.get("kind")) for x in d.get("designations") or []]
        out += [("vibes", v) for v, s in ((_guided(pub).get(item_id) or {}).get("v") or {}).items() if (s or 0) >= VIBE_MIN]
        return out
    folder, key, fields = {
        "trail": ("trails", "trips", ()),
        "beach": ("beaches", "beaches", ("tags", "bestFor", "size", "surface")),
        "lake": ("lakes", "lakes", ("tags", "bestFor", "kind")),
        "mountain": ("mountains", "mountains", ("tags", "bestFor", "kind", "acc")),
    }[layer]
    row = next((r for r in _country_rows(folder, key, country, pub) if str(r.get("id")) == str(item_id)), None)
    if not row:
        return out
    if layer == "trail":
        f = row.get("f") or {}
        out += [("trail.category", row.get("category"))]
        if f.get("g"):
            out.append(("trail.grade", f["g"]))
        if f.get("rt"):
            out.append(("trail.route_type", f["rt"]))
        out += [("trail.highlights", h) for h in f.get("hl") or []]
        out += [("trail.suitability", s) for s in (f.get("su") or []) + (f.get("sd") or [])]
        out += [("trail.reasons", r.get("code")) for r in row.get("reasons") or [] if r.get("code")]
        return out
    for fld in fields:
        v = row.get(fld)
        for x in (v if isinstance(v, list) else [v] if v else []):
            out.append((f"{layer}.{fld}", x))
    return out


def baseline_predictions(items: list[dict], public: Path | str | None = None) -> dict[str, list[dict]]:
    """{item_id: [{tag, score}]}, best first. Score = share of the item's old tags that point at the node."""
    out = {}
    for it in items:
        pairs = old_tags(it["layer"], it["item_id"], it["country"], public)
        c = Counter()
        for src, v in pairs:
            for t in map_value(src, v):
                c[t] += 1
        n = max(1, len(pairs))
        ranked = sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))
        out[it["item_id"]] = [{"tag": t, "score": round(k / n, 4)} for t, k in ranked]
    return out


def summary() -> dict:
    ns = load()["nodes"]
    return {
        "version": load()["version"],
        "nodes": len(ns),
        "by_facet": dict(Counter(n["facet"] for n in ns)),
        "by_level": dict(Counter(n["level"] for n in ns)),
        "labelled_six_languages": sum(1 for n in ns if all((n.get("label") or {}).get(l) for l in LANGS)),
        "by_source": dict(Counter(n["source"] for n in ns)),
    }


if __name__ == "__main__":
    sys.path.insert(0, str(HERE))
    from tag_sources import collect

    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    got = collect()
    if cmd == "coverage":
        for src, values in got.items():
            for v, k in sorted(values.items(), key=lambda kv: -kv[1]):
                print(f"{src}\t{v}\t{k}\t{','.join(map_value(src, v)) or '(not a concept)'}")
        sys.exit(0)
    problems = validate() + mapping_problems(got)
    s = summary()
    s["sources"] = len(got)
    s["values"] = sum(len(v) for v in got.values())
    s["values_not_a_concept"] = sum(1 for src, vs in got.items() for v in vs if not map_value(src, v))
    print(json.dumps(s))
    for p in problems:
        print("PROBLEM", p)
    sys.exit(1 if problems else 0)


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def lexical_index() -> dict[str, set[str]]:
    """Normalised English label, synonym and slug -> node ids (for free-text tags, not a tagger)."""
    idx: dict[str, set[str]] = {}
    for n in load()["nodes"]:
        if n["level"] == 0:
            continue
        keys = {n["label"]["en"], n["id"].split(".", 1)[1]} | set((n.get("synonyms") or {}).get("en") or [])
        for k in keys:
            idx.setdefault(_norm(k), set()).add(n["id"])
            if _norm(k).endswith("s"):
                idx.setdefault(_norm(k)[:-1], set()).add(n["id"])
    return idx


def free_tag_coverage(tags: dict[str, int]) -> dict:
    """Share of free-text tags (journey tags) whose words name a node. Reported, not gated."""
    idx = lexical_index()
    hit = {}
    for t in tags:
        k = _norm(t)
        found = idx.get(k) or idx.get(k.removesuffix("s"))
        if found:
            hit[t] = sorted(found)
    uses = sum(tags.values()) or 1
    return {"distinct": len(tags), "matched": len(hit), "share_distinct": round(len(hit) / max(1, len(tags)), 4),
            "share_uses": round(sum(tags[t] for t in hit) / uses, 4)}
