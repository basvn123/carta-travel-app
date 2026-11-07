"""The judge's shared parts (T1188): items, the prompt, verdicts and verdict files.

An item is one text Carta shows with the source it cites:

    {"text_id": "t01", "kind": "place_blurb", "subject": "Ios, Greece",
     "text": "...", "source": {"cited": "https://...", "text": "..."}}

kind is one of KINDS (an alias in KIND_ALIASES is accepted). The prompt is
the registry prompt `judge-text` (prompts/judge-text/v<N>.md): its `rubric`,
the `source.<kind>` fragment and `item` with the text and source as JSON.
No prompt text lives here (the prompt registry rule, T1140).

A verdicts file, written by either backend:

    {"schema": "carta-judge-verdicts/1", "backend": "session" | "gemini",
     "model": "...", "prompt": "judge-text", "prompt_version": 1,
     "prompt_sha": "<12 hex>", "at": ISO, "items": "<path or label>",
     "verdicts": {"t01": {"verdict": "supported", "claims": [...], "reason": "..."}}}

A verdict made on another prompt hash is stale: it is read but marked, and
the calibration and the runner leave it out.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
PIPELINE = os.path.dirname(HERE)
ROOT = os.path.dirname(PIPELINE)
if PIPELINE not in sys.path:
    sys.path.insert(0, PIPELINE)

from prompt_registry import prompt as _registry_prompt

CONFIG_PATH = os.path.join(HERE, "config.json")
CALIBRATION_DIR = os.path.join(HERE, "calibration")
JUDGMENTS_DIR = os.path.join(CALIBRATION_DIR, "judgments")
VERDICTS_SCHEMA = "carta-judge-verdicts/1"
VERDICTS = ("supported", "unsupported", "contradicted")
KINDS = ("place_blurb", "trail_summary", "trip_text", "ask_answer", "translation")
KIND_ALIASES = {"place_intro": "place_blurb", "intro": "place_blurb", "summary": "trail_summary",
                "trip": "trip_text", "ask": "ask_answer"}

# Gemini responseSchema for one verdict (the shape the rubric asks for).
JUDGE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "verdict": {"type": "STRING", "enum": list(VERDICTS)},
        "claims": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {"claim": {"type": "STRING"}, "verdict": {"type": "STRING", "enum": list(VERDICTS)},
                               "evidence": {"type": "STRING"}},
                "required": ["claim", "verdict"],
            },
        },
        "reason": {"type": "STRING"},
    },
    "required": ["verdict", "claims"],
}


def rel(path):
    try:
        return os.path.relpath(path, ROOT).replace(os.sep, "/")
    except ValueError:
        return str(path)


def abspath(path):
    return path if os.path.isabs(path) else os.path.join(ROOT, path)


def load_json(path, default=None):
    try:
        with open(abspath(path), encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return default


def write_json(path, obj):
    path = abspath(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps(obj, ensure_ascii=False, indent=1) + "\n")
    return path


def config(path=CONFIG_PATH):
    return load_json(path, {}) or {}


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


# ---- items and the prompt ----

def kind_of(item):
    k = str(item.get("kind") or "").strip().lower()
    k = KIND_ALIASES.get(k, k)
    if k not in KINDS:
        raise ValueError(f"judge: item {item.get('text_id')!r} has unknown kind {item.get('kind')!r}")
    return k


def item_id(item):
    return str(item.get("text_id") or item.get("id"))


def load_items(path):
    """Items from a file: a list, or {"items": [...]} (the D4 text sample's shape)."""
    blob = load_json(path)
    if blob is None:
        raise FileNotFoundError(f"judge: no items at {path}")
    items = blob.get("items") if isinstance(blob, dict) else blob
    return [it for it in items or [] if isinstance(it, dict)]


def judge_prompt(pid=None):
    return _registry_prompt(pid or config().get("prompt") or "judge-text")


def prompt_sha(p=None):
    p = p or judge_prompt()
    return p.sha256[:12]


def build_prompt(item, p=None):
    """The judge's whole input for one item: rubric, the kind's source rule, the item as data."""
    p = p or judge_prompt()
    body = {"subject": item.get("subject"), "kind": kind_of(item), "text": item.get("text"),
            "source": item.get("source")}
    return "\n\n".join([p.text("rubric").strip(), p.text(f"source.{kind_of(item)}").strip(),
                        p.text("item", body=json.dumps(body, ensure_ascii=False, indent=1)).strip()]) + "\n"


# ---- verdicts ----

def normalise_verdict(v):
    """A checked verdict dict, or None when it is unusable. The whole-text verdict
    may not be milder than its worst claim (the rubric's step 4)."""
    if not isinstance(v, dict):
        return None
    verdict = str(v.get("verdict") or "").strip().lower()
    if verdict not in VERDICTS:
        return None
    claims = []
    for c in v.get("claims") or []:
        if isinstance(c, dict) and isinstance(c.get("claim"), str):
            cv = str(c.get("verdict") or "").strip().lower()
            claims.append({"claim": c["claim"], "verdict": cv if cv in VERDICTS else "unsupported",
                           "evidence": str(c.get("evidence") or "")})
    cvs = {c["verdict"] for c in claims}
    worst = "contradicted" if "contradicted" in cvs else None
    fixed = worst if worst and verdict != worst else verdict
    out = {"verdict": fixed, "claims": claims, "reason": str(v.get("reason") or "")[:400]}
    if fixed != verdict:
        out["raised_from"] = verdict
    return out


def binary(v):
    """The two classes kappa is taken over: supported or not."""
    if v is None:
        return None
    v = str(v).strip().lower()
    if v not in VERDICTS:
        return None
    return "supported" if v == "supported" else "not"


def majority(verdicts):
    """The most common verdict of several votes; a tie goes to the stricter one."""
    good = [v for v in verdicts if v]
    if not good:
        return None
    order = {"contradicted": 2, "unsupported": 1, "supported": 0}
    counts = {}
    for v in good:
        counts[v["verdict"]] = counts.get(v["verdict"], 0) + 1
    best = max(counts, key=lambda k: (counts[k], order[k]))
    pick = next(v for v in good if v["verdict"] == best)
    return {**pick, "votes": {k: counts[k] for k in sorted(counts)}} if len(good) > 1 else pick


def verdicts_file(backend, model, verdicts, items_label, p=None, at=None):
    p = p or judge_prompt()
    return {"schema": VERDICTS_SCHEMA, "backend": backend, "model": model, "prompt": p.id,
            "prompt_version": p.version, "prompt_sha": prompt_sha(p), "at": at or now_iso(),
            "items": items_label, "verdicts": verdicts}


def read_verdicts(path, p=None):
    """A verdicts file with every verdict normalised; `stale` is True when it was
    made on another version of the prompt (its verdicts must not count)."""
    blob = load_json(path)
    if not isinstance(blob, dict) or not isinstance(blob.get("verdicts"), dict):
        raise ValueError(f"judge: {path} is not a verdicts file")  # noqa: TRY004
    vs = {str(k): normalise_verdict(v) for k, v in blob["verdicts"].items()}
    cur = prompt_sha(p)
    return {**blob, "file": rel(abspath(path)), "verdicts": vs,
            "stale": blob.get("prompt_sha") != cur, "current_sha": cur}


def newest_verdicts(dir_path=JUDGMENTS_DIR, backend=None, current_only=True, p=None):
    """The newest verdicts file in a folder (by name), optionally of one backend
    and made on the current prompt; None when there is none."""
    d = abspath(dir_path)
    if not os.path.isdir(d):
        return None
    for f in sorted((f for f in os.listdir(d) if f.endswith(".json")), reverse=True):
        try:
            v = read_verdicts(os.path.join(d, f), p)
        except ValueError:
            continue
        if backend and v.get("backend") != backend:
            continue
        if current_only and v["stale"]:
            continue
        return v
    return None
