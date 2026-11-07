"""The Python engines: the F1 tagger and taxonomy (imported, not copied) and
the similarity index over the tagger's tags.

The tagger reads the shipped wires (continent-app/public) through its own
Corpus; the taxonomy is pipeline/taxonomy/carta_taxonomy.yaml.
"""
from __future__ import annotations

import json
import math
import sys
import threading
from collections import defaultdict
from pathlib import Path

from .config import ROOT

for p in (ROOT / "pipeline" / "taxonomy", ROOT / "pipeline"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

import tagger  # noqa: E402
import taxonomy as tx  # noqa: E402

LAYERS = tagger.LAYERS
USES = tagger.USES


# ---------------------------------------------------------------- taxonomy
def taxonomy_doc(facet: str | None = None) -> dict:
    t = tx.load()
    nodes = []
    for nid, n in sorted(tx.nodes().items()):
        if facet and n.get("facet") != facet:
            continue
        nodes.append({
            "id": nid, "facet": n.get("facet"), "parent": n.get("parent"), "level": n.get("level"),
            "label": {k: v for k, v in (n.get("label") or {}).items() if v}, "definition": n.get("definition"),
            "synonyms": n.get("synonyms") or {}, "applies_to": n.get("applies_to") or [],
            "source": n.get("source"), "children": n.get("children") or [],
        })
    return {"version": t["version"], "facets": sorted({n["facet"] for n in tx.nodes().values() if n.get("facet")}),
            "count": len(nodes), "nodes": nodes}


# ---------------------------------------------------------------- tagging
FREE_TEXT_LEAD = 2   # sentences of free text weighed as a lead (a blurb), the rest as body
class Tagger:
    """Wraps tagger.tag_item. One Corpus, loaded on first use."""

    def __init__(self, public: Path):
        self.public = Path(public)
        self._corpus = None
        self._lock = threading.Lock()

    @property
    def corpus(self):
        with self._lock:
            if self._corpus is None:
                self._corpus = tagger.Corpus(self.public)
            return self._corpus

    def item(self, layer: str, item_id: str, country: str | None = None) -> dict | None:
        """The catalogue item, or None when the id is unknown."""
        c = self.corpus
        if layer == "place":
            d = c.dests.get(item_id)
            if not d:
                return None
            return {"item_id": item_id, "layer": "place", "country": d.get("iso2") or "",
                    "kind": (d.get("place") or {}).get("class") or "", "name": d.get("city") or item_id}
        row = c.layer_rows(layer).get(str(item_id))
        if not row:
            return None
        cc, r = row
        kind = r.get("category") if layer == "trail" else (r.get("kind") or r.get("size") or layer)
        return {"item_id": str(item_id), "layer": layer, "country": country or cc, "kind": kind or "", "name": r.get("name") or item_id}

    def tag_catalogue(self, layer: str, item_id: str) -> tuple[dict, list[dict], int] | None:
        it = self.item(layer, item_id)
        if it is None:
            return None
        ps = self.corpus.passages(it)
        return it, tagger.tag_item(it, ps), len(ps)

    @staticmethod
    def tag_text(layer: str, name: str, text: str) -> tuple[list[dict], int]:
        """Free text read like a catalogue blurb: the name and the first FREE_TEXT_LEAD
        sentences are the lead, the rest the body."""
        ps = [{"field": "lead", "src": "name", "text": name}] if name else []
        ps += [{"field": "lead" if k < FREE_TEXT_LEAD else "body", "src": "text", "text": s}
               for k, s in enumerate(tagger.sentences(text))]
        it = {"item_id": "_text", "layer": layer, "country": "", "kind": "", "name": name or ""}
        return tagger.tag_item(it, ps), len(ps)


# ---------------------------------------------------------------- similarity
PARENT_SHARE = 0.5    # share of a tag's weight that also counts for its parent
MIN_SCORE = USES["search"]   # tags under the search threshold are not evidence


class SimilarityIndex:
    """TF-IDF weighted cosine over tag vectors (research in the T1154 report).

    weight(item, tag) = tagger score x idf(tag), idf = log(N / df) + 1, with
    PARENT_SHARE of it rolled up to the tag's parent so near misses still
    meet; L2 normalised. Implied ancestors in the tag file are skipped (the
    roll-up stands for them). Candidates come from an inverted index.
    """

    def __init__(self, items: dict[str, dict]):
        nodes = tx.nodes()
        raw: dict[str, dict[str, float]] = {}
        self.meta: dict[str, dict] = {}
        for key, row in items.items():
            vec: dict[str, float] = defaultdict(float)
            for t in row.get("tags") or []:
                if t.get("implied") or t.get("score", 0) < MIN_SCORE or t["tag"] not in nodes:
                    continue
                vec[t["tag"]] = max(vec[t["tag"]], t["score"])
                par = nodes[t["tag"]].get("parent")
                if par and par in nodes:
                    vec[par] = max(vec[par], t["score"] * PARENT_SHARE)
            if vec:
                raw[key] = dict(vec)
                self.meta[key] = {"layer": row.get("layer"), "id": str(row.get("id")), "name": row.get("name"),
                                  "country": row.get("cc")}
        df: dict[str, int] = defaultdict(int)
        for vec in raw.values():
            for t in vec:
                df[t] += 1
        n = max(1, len(raw))
        self.idf = {t: math.log(n / c) + 1.0 for t, c in df.items()}
        self.n = len(raw)
        self.vecs = {k: self._norm(v) for k, v in raw.items()}
        self.post: dict[str, list[str]] = defaultdict(list)
        for k, v in self.vecs.items():
            for t in v:
                self.post[t].append(k)

    @classmethod
    def from_file(cls, path: Path | None) -> SimilarityIndex:
        if not path or not Path(path).is_file():
            return cls({})
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(data.get("items") or {})

    def _norm(self, raw: dict[str, float]) -> dict[str, float]:
        v = {t: w * self.idf.get(t, 1.0) for t, w in raw.items()}
        s = math.sqrt(sum(x * x for x in v.values())) or 1.0
        return {t: x / s for t, x in v.items()}

    def vector_for_tags(self, tags: list[dict]) -> dict[str, float]:
        nodes = tx.nodes()
        raw: dict[str, float] = defaultdict(float)
        for t in tags:
            if t.get("implied") or t.get("score", 0) < MIN_SCORE or t["tag"] not in nodes:
                continue
            raw[t["tag"]] = max(raw[t["tag"]], t["score"])
            par = nodes[t["tag"]].get("parent")
            if par and par in nodes:
                raw[par] = max(raw[par], t["score"] * PARENT_SHARE)
        return self._norm(dict(raw)) if raw else {}

    def query(self, vec: dict[str, float], k: int = 10, exclude: str | None = None, layers: set[str] | None = None,
              among: set[str] | None = None, min_shared: int = 1) -> list[dict]:
        acc: dict[str, float] = defaultdict(float)
        shared: dict[str, list[tuple[float, str]]] = defaultdict(list)
        for t, w in vec.items():
            for key in self.post.get(t, ()):
                if key == exclude or (among is not None and key not in among):
                    continue
                if layers and self.meta[key]["layer"] not in layers:
                    continue
                c = w * self.vecs[key][t]
                acc[key] += c
                shared[key].append((c, t))
        ranked = sorted(((s, key) for key, s in acc.items() if len(shared[key]) >= min_shared), key=lambda x: (-x[0], x[1]))
        out = []
        for s, key in ranked[:k]:
            top = [t for _, t in sorted(shared[key], key=lambda x: (-x[0], x[1]))[:3]]
            out.append({**self.meta[key], "key": key, "score": round(s, 4), "shared": top})
        return out
