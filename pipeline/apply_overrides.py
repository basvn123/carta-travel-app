"""Hand corrections to the catalogue, applied last in every pipeline run.

Tier: Step (ROADMAP I13, T1173)

WHAT. `data/overrides/{layer}.json` holds the deliberate corrections a person
made on top of what the pipeline computes: a better blurb for a place, a fixed
name for a lake, a photograph chosen by hand. The files are versioned in git,
so every correction has a commit, a reviewer and a revert. This step reads
them and writes each patch into the pipeline's output for that layer:

    dest      app_data/app_data.json (the master; sync-data ships it)
    beach     continent-app/public/beaches/*.json
    lake      continent-app/public/lakes/*.json
    mountain  continent-app/public/mountains/*.json
    trail     continent-app/public/trails/*.json and trails/trip/{id}.json
    cycle     continent-app/public/cycling/*.json

WHY LAST. A layer task rewrites its output from its sources and knows nothing
about the corrections. `run_pipeline.py` calls this step after the task loop
and before the ship, so whatever a task rewrote, the correction is written
over it again. That is how an override survives a rerun: it is never stored in
the output, it is re-applied to every new output.

HOW THIS RELATES TO content_overrides (migrations 018 and 043). That table is
the live path: an admin patches an item in the admin Content tab and the app
merges it at load, without a deploy. This file is the durable path: the
correction goes through a pull request and lands in the shipped data itself.
The layer names and the keying by wire id are the same, so a live patch that
should be permanent is promoted by copying it here and clearing the live row.
Trails and cycle routes are layers here since T1214 (register row T1173-b): a
trail entry patches the walk in its country file and, where the field exists
there, in its detail file trails/trip/{id}.json, so a text fix survives every
trails_* rerun. `pipeline/trails/curate.py` stays the place for rules that
pick or drop walks; this file is for one item's text or photo.

ONE ENTRY.

    {"id": "hallstatt",                       the wire id of the item
     "patch": {"blurb": "...",                dotted paths set to values;
               "place.visit_h": 3},           a parent must already exist
     "who": "bas",                            who made the correction
     "when": "2026-11-06",                    the day it was made (YYYY-MM-DD)
     "why": "Wikipedia intro named the ...",  10 to 500 characters
     "source": "https://...",                 where the fact comes from
     "review_by": "2027-05-01"}               optional: look at it again by then

A file that breaks a rule is refused whole and the run fails: a half-applied
set of corrections is worse than none. An entry whose id no longer exists in
the output is an orphan: reported, never fatal, because the pipeline may have
dropped the item for a good reason, and the admin Overrides tab lists it.

USAGE.

    python pipeline/apply_overrides.py              apply, print a summary
    python pipeline/apply_overrides.py --check      validate the files only
    python pipeline/apply_overrides.py --snapshot   also write the admin snapshot
    --layers dest                                   only these layers (run_pipeline.py,
                                                    before the tasks that read the master)
    --root DIR                                      another tree (tests, worktrees)

Exit 0 when every file is valid (orphans included), 2 when a file is invalid.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import re
import sys
from pathlib import Path

if __package__ in (None, ""):          # run as a script, even with python -I
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from pipeline_io import atomic_write_json
else:                                  # imported as pipeline.apply_overrides
    from .pipeline_io import atomic_write_json

ROOT = Path(os.environ.get("CARTA_REPO_ROOT") or Path(__file__).resolve().parents[1])

LAYERS = ("dest", "beach", "lake", "mountain", "trail", "cycle")
# Layer folder under continent-app/public, the list keys of its country files,
# and the folder of one-file-per-item detail records where the layer has one.
LAYER_DIRS = {"beach": "beaches", "lake": "lakes", "mountain": "mountains",
              "trail": "trails", "cycle": "cycling"}
LIST_KEYS = {"beach": ("beaches",), "lake": ("lakes",), "mountain": ("mountains",),
             "trail": ("trips", "listed"), "cycle": ("routes", "listed", "tours")}
DETAIL_DIRS = {"trail": "trip"}

OVERRIDES_DIR = Path("data") / "overrides"
MASTER = Path("app_data") / "app_data.json"
PUBLIC = Path("continent-app") / "public"
SNAPSHOT = Path("continent-app") / "src" / "admin" / "pipelineOverrides.json"

REQUIRED = ("id", "patch", "who", "when", "why", "source")
OPTIONAL = ("review_by",)
PATH_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DASHES = ("\u2013", "\u2014")
WHY_MIN, WHY_MAX = 10, 500
# Computed numbers a hand edit must not set: prices come from the price
# engine and its config (continent-app/config/pricing.json), scores and tiers
# from the rating layer and its frozen calibration. A wrong one is fixed at
# its source, never patched over (honest numbers, PRODUCT.md).
COMPUTED = ("costs", "accommodation", "rating", "score", "v5", "comp", "tier")


class OverrideError(ValueError):
    """An overrides file breaks a rule; the message names file, entry and rule."""


# ---------------------------------------------------------------------------
# Reading and checking the files
# ---------------------------------------------------------------------------

def _strings(value):
    """Every string inside a JSON value, for the dash check."""
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for v in value.values():
            yield from _strings(v)
    elif isinstance(value, list):
        for v in value:
            yield from _strings(v)


def _date(value):
    if not isinstance(value, str) or not DATE_RE.match(value):
        return None
    try:
        return _dt.date.fromisoformat(value)
    except ValueError:
        return None


def entry_problems(entry):
    """The rules one entry breaks, as short sentences (empty when it is fine)."""
    if not isinstance(entry, dict):
        return ["is not an object"]
    out = []
    for key in REQUIRED:
        if key not in entry:
            out.append(f"has no {key}")
    unknown = sorted(set(entry) - set(REQUIRED) - set(OPTIONAL))
    if unknown:
        out.append(f"has unknown keys {unknown}")
    item = entry.get("id")
    if "id" in entry and (not isinstance(item, str) or not item.strip() or len(item) > 200):
        out.append("id must be a non-empty string of at most 200 characters")
    patch = entry.get("patch")
    if "patch" in entry:
        if not isinstance(patch, dict) or not patch:
            out.append("patch must be a non-empty object")
        else:
            for path in patch:
                if not PATH_RE.match(path):
                    out.append(f"patch path {path!r} is not a dotted field name")
                elif path.split(".")[0] == "id":
                    out.append("patch may not change the id")
                elif path.split(".")[0] in COMPUTED:
                    out.append(f"patch may not set the computed field {path.split('.')[0]!r}; fix it at its source")
    for key, cap in (("who", 80), ("source", 500)):
        v = entry.get(key)
        if key in entry and (not isinstance(v, str) or not v.strip() or len(v) > cap):
            out.append(f"{key} must be a non-empty string of at most {cap} characters")
    why = entry.get("why")
    if "why" in entry and (not isinstance(why, str) or not WHY_MIN <= len(why.strip()) <= WHY_MAX):
        out.append(f"why must be {WHY_MIN} to {WHY_MAX} characters")
    if "when" in entry and _date(entry.get("when")) is None:
        out.append("when must be a date written YYYY-MM-DD")
    if "review_by" in entry and _date(entry.get("review_by")) is None:
        out.append("review_by must be a date written YYYY-MM-DD")
    if any(d in s for s in _strings(entry) for d in DASHES):
        out.append("contains an en or em dash (write 'to' for a range)")
    return out


def load_layer(root, layer):
    """The checked entries of one layer's file ([] when the file is absent).

    Raises OverrideError naming every broken rule, so one run shows them all.
    """
    path = Path(root) / OVERRIDES_DIR / f"{layer}.json"
    if not path.exists():
        return []
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as e:
        raise OverrideError(f"{path}: not valid JSON ({e})") from e
    if not isinstance(doc, dict) or doc.get("layer") != layer:
        raise OverrideError(f"{path}: must be an object with \"layer\": \"{layer}\"")
    entries = doc.get("overrides")
    if not isinstance(entries, list):
        raise OverrideError(f"{path}: \"overrides\" must be a list")
    problems = []
    seen = {}
    for i, entry in enumerate(entries):
        label = f"{path.name} entry {i}" + (f" ({entry.get('id')})" if isinstance(entry, dict) else "")
        problems += [f"{label}: {p}" for p in entry_problems(entry)]
        if isinstance(entry, dict) and isinstance(entry.get("patch"), dict):
            for p in entry["patch"]:
                key = (entry.get("id"), p)
                if key in seen:
                    problems.append(f"{label}: {p} is also set by entry {seen[key]}")
                seen[key] = i
    if problems:
        raise OverrideError("\n".join(problems))
    return entries


def load_all(root):
    """{layer: entries} for every layer; raises OverrideError on any bad file."""
    out, problems = {}, []
    for layer in LAYERS:
        try:
            out[layer] = load_layer(root, layer)
        except OverrideError as e:
            problems.append(str(e))
    if problems:
        raise OverrideError("\n".join(problems))
    return out


# ---------------------------------------------------------------------------
# Writing a patch into one record
# ---------------------------------------------------------------------------

def set_path(record, path, value, *, create_leaf=True):
    """Set a dotted path in a dict. Returns 'set', 'same' or 'no_parent'
    (or 'no_leaf' when create_leaf is False and the leaf key is absent)."""
    parts = path.split(".")
    node = record
    for part in parts[:-1]:
        node = node.get(part) if isinstance(node, dict) else None
        if not isinstance(node, dict):
            return "no_parent"
    leaf = parts[-1]
    if leaf in node and node[leaf] == value:
        return "same"
    if leaf not in node and not create_leaf:
        return "no_leaf"
    node[leaf] = value
    return "set"


def patch_record(record, patch, *, create_leaf=True):
    """Apply a patch to one record. Returns {path: outcome}."""
    return {p: set_path(record, p, v, create_leaf=create_leaf) for p, v in patch.items()}


def _records_with_id(node, item_id):
    """Every dict below `node` whose id equals item_id (ids are text on the wire
    for slugs, so the compare is on str)."""
    if isinstance(node, dict):
        if "id" in node and str(node["id"]) == item_id:
            yield node
        for v in node.values():
            yield from _records_with_id(v, item_id)
    elif isinstance(node, list):
        for v in node:
            yield from _records_with_id(v, item_id)


def _status(outcomes_primary):
    vals = set(outcomes_primary.values())
    if "no_parent" in vals:
        return "bad_path"
    if "set" in vals:
        return "applied"
    return "unchanged"


# ---------------------------------------------------------------------------
# Applying a layer
# ---------------------------------------------------------------------------

def _apply_dest(root, entries, *, write):
    path = Path(root) / MASTER
    if not entries:
        return []
    if not path.exists():
        return [{"id": e["id"], "status": "no_output", "file": str(MASTER)} for e in entries]
    data = json.loads(path.read_text(encoding="utf-8"))
    dests = data.get("destinations") if isinstance(data, dict) else data
    by_id = {}
    if isinstance(dests, dict):
        for k, rec in dests.items():
            if isinstance(rec, dict):
                by_id[str(rec.get("id", k))] = rec
    elif isinstance(dests, list):
        for rec in dests:
            if isinstance(rec, dict) and "id" in rec:
                by_id[str(rec["id"])] = rec
    results, changed = [], False
    for e in entries:
        rec = by_id.get(e["id"])
        if rec is None:
            results.append({"id": e["id"], "status": "orphan", "file": str(MASTER)})
            continue
        outcomes = patch_record(rec, e["patch"])
        status = _status(outcomes)
        changed |= status == "applied"
        results.append({"id": e["id"], "status": status, "file": str(MASTER),
                        "paths": outcomes})
    if changed and write:
        atomic_write_json(path, data)
    return results


def _apply_layer_files(root, layer, entries, *, write):
    folder = Path(root) / PUBLIC / LAYER_DIRS[layer]
    if not entries:
        return []
    if not folder.is_dir():
        return [{"id": e["id"], "status": "no_output", "file": str(PUBLIC / LAYER_DIRS[layer])}
                for e in entries]
    list_keys = LIST_KEYS[layer]
    state = {e["id"]: {"primary": None, "copies": 0, "outcomes": {}} for e in entries}
    for f in sorted(folder.glob("*.json")):
        doc = json.loads(f.read_text(encoding="utf-8"))
        # The country files ({CC}.json) hold the full record; index.json and
        # top.json hold summary copies, which get only the fields they carry.
        primary_file = re.fullmatch(r"[A-Z]{2}\.json", f.name) is not None
        changed = False
        for e in entries:
            s = state[e["id"]]
            if primary_file:
                for rec in (r for k in list_keys for r in (doc.get(k) or []) if isinstance(r, dict)
                            and str(r.get("id")) == e["id"]):
                    out = patch_record(rec, e["patch"])
                    s["primary"] = str(f.relative_to(Path(root)))
                    s["outcomes"] = out
                    changed |= "set" in out.values()
            else:
                for rec in _records_with_id(doc, e["id"]):
                    out = patch_record(rec, e["patch"], create_leaf=False)
                    if "set" in out.values():
                        s["copies"] += 1
                        changed = True
        if changed and write:
            # Served files are compact, as the layer exporters write them.
            atomic_write_json(f, doc, indent=None, separators=(",", ":"))
    detail = DETAIL_DIRS.get(layer)
    if detail:
        # The detail file is a second copy of the record with more fields: it
        # gets the fields it already carries (T1214, from T1173-b).
        for e in entries:
            f = folder / detail / f"{e['id']}.json"
            if not f.is_file():
                continue
            doc = json.loads(f.read_text(encoding="utf-8"))
            out = patch_record(doc, e["patch"], create_leaf=False)
            if "set" in out.values():
                state[e["id"]]["copies"] += 1
                if write:
                    atomic_write_json(f, doc, indent=None, separators=(",", ":"))
    results = []
    for e in entries:
        s = state[e["id"]]
        if s["primary"] is None:
            results.append({"id": e["id"], "status": "orphan", "file": str(PUBLIC / LAYER_DIRS[layer])})
            continue
        status = _status(s["outcomes"])
        if status == "unchanged" and s["copies"]:
            status = "applied"
        results.append({"id": e["id"], "status": status, "file": s["primary"],
                        "paths": s["outcomes"], "copies": s["copies"]})
    return results


def apply_all(root=ROOT, *, write=True, layers=None):
    """Check every file, then apply every layer (or only ``layers``).
    Returns {layer: [result]}.

    Raises OverrideError before writing anything when any file is invalid.
    """
    all_entries = load_all(root)
    out = {}
    for layer in layers or LAYERS:
        entries = all_entries[layer]
        if layer == "dest":
            out[layer] = _apply_dest(root, entries, write=write)
        else:
            out[layer] = _apply_layer_files(root, layer, entries, write=write)
    return out


# ---------------------------------------------------------------------------
# The admin snapshot
# ---------------------------------------------------------------------------

def build_snapshot(root=ROOT, results=None, *, now=None):
    """What the admin Overrides tab lists: every entry with its layer, file
    and the outcome of the last apply (or 'not run')."""
    entries = load_all(root)
    status = {}
    for layer, rows in (results or {}).items():
        for r in rows:
            status[(layer, r["id"])] = r["status"]
    rows = []
    for layer in LAYERS:
        for e in entries[layer]:
            rows.append({
                "layer": layer, "id": e["id"], "patch": e["patch"], "who": e["who"],
                "when": e["when"], "why": e["why"], "source": e["source"],
                "review_by": e.get("review_by"),
                "status": status.get((layer, e["id"]), "not run"),
            })
    about = {}
    for layer in LAYERS:
        path = Path(root) / OVERRIDES_DIR / f"{layer}.json"
        if path.exists():
            about[layer] = json.loads(path.read_text(encoding="utf-8")).get("about")
    return {
        "generated_at": (now or _dt.datetime.now(_dt.timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")
        if results is not None else None,
        "files": {layer: str(OVERRIDES_DIR / f"{layer}.json").replace(os.sep, "/") for layer in LAYERS},
        "about": about,
        "counts": {layer: len(entries[layer]) for layer in LAYERS},
        "overrides": rows,
    }


def write_snapshot(root=ROOT, results=None):
    snap = build_snapshot(root, results)
    (Path(root) / SNAPSHOT).parent.mkdir(parents=True, exist_ok=True)
    atomic_write_json(Path(root) / SNAPSHOT, snap, indent=1)
    return snap


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _summary(results):
    lines = []
    for layer, rows in results.items():
        if not rows:
            continue
        counts = {}
        for r in rows:
            counts[r["status"]] = counts.get(r["status"], 0) + 1
        lines.append(f"  {layer}: " + ", ".join(f"{n} {k}" for k, n in sorted(counts.items())))
        for r in rows:
            if r["status"] in ("orphan", "bad_path", "no_output"):
                lines.append(f"    ! {r['id']}: {r['status']} ({r['file']})")
    return lines or ["  no overrides"]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--root", default=str(ROOT))
    ap.add_argument("--check", action="store_true", help="validate the files only")
    ap.add_argument("--snapshot", action="store_true", help="write the admin snapshot")
    ap.add_argument("--layers", help="apply only these layers, comma separated (run_pipeline.py "
                    "applies dest before the tasks that read the master, T1214)")
    args = ap.parse_args(argv)
    layers = [x.strip() for x in args.layers.split(",") if x.strip()] if args.layers else None
    if layers and any(x not in LAYERS for x in layers):
        print(f"--layers must name layers of {', '.join(LAYERS)}", file=sys.stderr)
        return 2
    root = Path(args.root)
    try:
        if args.check:
            entries = load_all(root)
            print(f"overrides OK: {sum(len(v) for v in entries.values())} entries in {len(LAYERS)} layers")
            return 0
        results = apply_all(root, layers=layers)
    except OverrideError as e:
        print(f"overrides REFUSED, nothing applied:\n{e}", file=sys.stderr)
        return 2
    print("overrides applied:")
    for line in _summary(results):
        print(line)
    if args.snapshot:
        write_snapshot(root, results)
    return 0


if __name__ == "__main__":
    sys.exit(main())
