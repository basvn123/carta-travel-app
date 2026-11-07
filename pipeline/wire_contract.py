"""The wire contract, checked before the pipeline writes the wire (T1133, D1).

Tier: Library

One machine-readable contract, ``docs/wire.schema.json``, is read by three
places: this module (every pipeline write of the served wire), the app sync
(``continent-app/scripts/sync-data.mjs``) and the CI gate
(``continent-app/scripts/ci/contract.mjs``). The JS twin of this file is
``continent-app/scripts/ci/wireSchema.mjs``: both interpret the same JSON
Schema subset and word every problem the same way, so a seeded bad value
fails pytest and npm test with the same field path
(``tests/fixtures/wire_contract_cases.json`` holds the shared cases).

Keywords (JSON Schema 2020-12 subset): type, enum, const, pattern,
minLength, minimum, maximum, items, prefixItems, minItems, maxItems,
properties, required, additionalProperties, minProperties, $ref (local
``#/$defs/...`` only). Plus one of ours, ``x-presence``: ``required`` (the key
is on the object), ``every`` (on every record of the map), ``some`` (on at
least one) or ``pending`` (listed before its first run, T1202: never
required), checked only with ``catalogue=True`` on a full catalogue.

The pipeline checks shape, not presence: a layer run part way through a fresh
build may not have filled every key yet, but it must never write a key the
contract does not list or a value of the wrong type.

Usage:
    from wire_contract import check_wire
    check_wire(path, data)       # no-op unless path is the served wire
"""
import json
import math
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "docs" / "wire.schema.json"
SCHEMA_NAME = "docs/wire.schema.json"


class WireContractError(ValueError):
    """The payload breaks docs/wire.schema.json; ``problems`` lists each one."""

    def __init__(self, path, problems):
        self.problems = problems
        head = "\n  ".join(problems[:12])
        more = f"\n  ... {len(problems) - 12} more" if len(problems) > 12 else ""
        super().__init__(
            f"refusing to write {path}: the payload breaks {SCHEMA_NAME}\n  {head}{more}")


_cache = {}


def load_schema(path=SCHEMA_PATH):
    key = os.fspath(path)
    if key not in _cache:
        with open(key, encoding="utf-8") as f:
            _cache[key] = json.load(f)
    return _cache[key]


def is_wire_path(path):
    """True for ``.../continent-app/public/app_data.json``, the served wire."""
    p = Path(os.fspath(path))
    return (p.name == "app_data.json" and p.parent.name == "public"
            and p.parent.parent.name == "continent-app")


def _show(v):
    """JSON for a message, the same text JS's JSON.stringify gives."""
    if isinstance(v, float) and v.is_integer() and abs(v) < 1e21:
        v = int(v)
    s = json.dumps(v, ensure_ascii=False, separators=(",", ":"))
    return s if len(s) <= 80 else s[:77] + "..."


def _num(v):
    return (isinstance(v, (int, float)) and not isinstance(v, bool)
            and math.isfinite(v))


def _same(a, b):
    """JSON equality: unlike ==, True is not 1 (JS's twin agrees)."""
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(_same(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(_same(a[k], b[k]) for k in a)
    if isinstance(a, (list, dict)) or isinstance(b, (list, dict)):
        return False
    return a == b


def _is_type(v, t):
    if t == "null":
        return v is None
    if t == "boolean":
        return isinstance(v, bool)
    if t == "string":
        return isinstance(v, str)
    if t == "number":
        return _num(v)
    if t == "integer":
        return _num(v) and float(v).is_integer()
    if t == "array":
        return isinstance(v, list)
    if t == "object":
        return isinstance(v, dict)
    raise ValueError(f"{SCHEMA_NAME}: unknown type {t!r}")


def _join(path, key):
    return f"{path}.{key}" if path else str(key)


def validate(data, schema=None, *, catalogue=False):
    """Return the list of problems (strings, each starting with the field
    path); empty means the payload satisfies the contract."""
    root = schema if schema is not None else load_schema()
    problems = []

    def resolve(s):
        while "$ref" in s:
            ref = s["$ref"]
            if not ref.startswith("#/$defs/"):
                raise ValueError(f"{SCHEMA_NAME}: only local $defs refs, got {ref!r}")
            target = root["$defs"][ref[len("#/$defs/"):]]
            s = {**target, **{k: v for k, v in s.items() if k != "$ref"}}
        return s

    def walk(v, s, path):
        s = resolve(s)
        if "type" in s:
            types = s["type"] if isinstance(s["type"], list) else [s["type"]]
            if not any(_is_type(v, t) for t in types):
                problems.append(f"{path} is {_show(v)}, expected {' or '.join(types)}")
                return
        if "const" in s and not _same(v, s["const"]):
            problems.append(f"{path} is {_show(v)}, expected {_show(s['const'])}")
            return
        if "enum" in s and not any(_same(v, e) for e in s["enum"]):
            problems.append(f"{path} is {_show(v)}, expected one of {_show(s['enum'])}")
            return
        if isinstance(v, str):
            if "minLength" in s and len(v) < s["minLength"]:
                problems.append(f"{path} is {_show(v)}, shorter than {s['minLength']}")
            if "pattern" in s and not re.search(s["pattern"], v):
                problems.append(f"{path} is {_show(v)}, does not match {s['pattern']}")
        if _num(v):
            if "minimum" in s and v < s["minimum"]:
                problems.append(f"{path} is {_show(v)}, below the minimum {s['minimum']}")
            if "maximum" in s and v > s["maximum"]:
                problems.append(f"{path} is {_show(v)}, above the maximum {s['maximum']}")
        if isinstance(v, list):
            if "minItems" in s and len(v) < s["minItems"]:
                problems.append(f"{path} has {len(v)} items, expected at least {s['minItems']}")
            if "maxItems" in s and len(v) > s["maxItems"]:
                problems.append(f"{path} has {len(v)} items, expected at most {s['maxItems']}")
            prefix = s.get("prefixItems", [])
            for i, item in enumerate(v):
                sub = prefix[i] if i < len(prefix) else s.get("items")
                if sub is not None:
                    walk(item, sub, f"{path}[{i}]")
        if isinstance(v, dict):
            walk_object(v, s, path)

    def walk_object(v, s, path):
        props = s.get("properties", {})
        for k in s.get("required", []):
            if k not in v:
                problems.append(f"{_join(path, k)} is missing")
        if catalogue:
            for k, ps in props.items():
                if ps.get("x-presence") == "required" and k not in v and k not in s.get("required", []):
                    problems.append(f"{_join(path, k)} is missing")
        if "minProperties" in s and len(v) < s["minProperties"]:
            problems.append(f"{path} has {len(v)} entries, expected at least {s['minProperties']}")
        extra = s.get("additionalProperties", True)
        for k, item in v.items():
            if k in props:
                walk(item, props[k], _join(path, k))
            elif extra is False:
                problems.append(f"{_join(path, k)} is not in the wire contract; "
                                f"add it to {SCHEMA_NAME} or put the old name back")
            elif isinstance(extra, dict):
                walk(item, extra, _join(path, k))
        if catalogue and isinstance(extra, dict):
            records(v, resolve(extra), path)

    def records(v, rs, path):
        # A map of records (destinations): "every" and "some" across them.
        rows = [r for r in v.values() if isinstance(r, dict)]
        for k, ps in rs.get("properties", {}).items():
            pres = ps.get("x-presence")
            n = sum(1 for r in rows if k in r)
            if pres == "every" and n < len(rows):
                problems.append(f"{path}.*.{k} is \"every\" in {SCHEMA_NAME} but "
                                f"{len(rows) - n} of {len(rows)} records lack it")
            elif pres == "some" and rows and n == 0:
                problems.append(f"{path}.*.{k} is listed in {SCHEMA_NAME} but no record "
                                f"carries it (renamed or dropped?)")

    walk(data, root, "")
    return [p.removeprefix(".") for p in problems]


def check_wire(path, data, *, schema=None):
    """Raise WireContractError if ``path`` is the served wire and ``data``
    breaks the contract. Any other path passes untouched."""
    if not is_wire_path(path):
        return
    problems = validate(data, schema)
    if problems:
        raise WireContractError(os.fspath(path), problems)
