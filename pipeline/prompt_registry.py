"""The prompt registry for the pipeline jobs (T1140, ROADMAP E5).

The Python twin of scripts/prompts/lib.mjs: it reads prompts/registry.json
and the prompt's current version file (prompts/<id>/v<N>.md, or a Trips
generator prompt in its own header format) and fills a fragment's
{{name}} slots in one pass. Both must parse a file to the same fragments and
the same hash; tests/test_prompt_registry.py checks that against
registry.json, which the JS side writes.

    from prompt_registry import prompt
    P = prompt("intros")
    P.text("system")
    P.text("user.entry", id="LIS", facts=..., context=...)

The format (fenced fragments, front matter, carriage returns dropped) is
described in prompts/README.md. Nothing here calls a model.
"""
from __future__ import annotations

import hashlib
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTRY = os.path.join(ROOT, "prompts", "registry.json")
FENCE = "~~~"
_NAME = re.compile(r"^[A-Za-z0-9_.-]+$")
_SLOT = re.compile(r"\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}")


def parse_prompt_file(text, file="prompt"):
    """(meta, frags) from a registry prompt file; the rules of lib.mjs parsePromptFile."""
    lines = text.replace("\r", "").split("\n")
    meta, i = {}, 0
    if lines and lines[0] == "---":
        i = 1
        while i < len(lines) and lines[i] != "---":
            m = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", lines[i])
            if m:
                meta[m.group(1)] = m.group(2).strip()
            i += 1
        if i >= len(lines):
            raise ValueError(f"{file}: front matter not closed")
        i += 1
    if "version" in meta:
        meta["version"] = int(meta["version"])
    frags = {}
    while i < len(lines):
        h = re.match(r"^### (.+)$", lines[i])
        if not h or i + 1 >= len(lines) or lines[i + 1] != FENCE:
            i += 1
            continue
        name = h.group(1).strip()
        if not _NAME.match(name):
            raise ValueError(f'{file}: bad fragment name "{name}"')
        if name in frags:
            raise ValueError(f'{file}: fragment "{name}" twice')
        body, j = [], i + 2
        while j < len(lines) and lines[j] != FENCE:
            body.append(lines[j])
            j += 1
        if j >= len(lines):
            raise ValueError(f'{file}: fragment "{name}" has no closing fence')
        frags[name] = "\n".join(body)
        i = j + 1
    return meta, frags


def parse_trips_header(text, file="prompt"):
    """A Trips generator prompt: header lines, a blank line, the body (one fragment, "body")."""
    t = text.replace("\r", "")
    head, sep, body = t.partition("\n\n")
    if not sep:
        raise ValueError(f"{file}: no header")
    meta = {}
    for line in head.split("\n"):
        k, _, v = line.partition(":")
        meta[k.strip()] = v.strip()
    meta["version"] = int(meta["version"])
    return meta, {"body": body}


def parse_by_format(text, fmt, file="prompt"):
    return parse_trips_header(text, file) if fmt == "trips-header" else parse_prompt_file(text, file)


def fragments_sha(frags):
    """sha256 over the fragments in name order, each as name NUL text NUL (lib.mjs fragmentsSha)."""
    h = hashlib.sha256()
    for name in sorted(frags):
        h.update(f"{name}\0{frags[name]}\0".encode())
    return h.hexdigest()


class Prompt:
    """The current version of one registry prompt."""

    def __init__(self, pid, version, frags):
        self.id, self.version, self.frags = pid, version, frags
        self.sha256 = fragments_sha(frags)

    def text(self, name, **values):
        """One fragment with its {{name}} slots filled in one pass; a missing slot raises."""
        if name not in self.frags:
            raise KeyError(f'prompt {self.id} v{self.version}: no fragment "{name}"')

        def sub(m):
            k = m.group(1)
            if k not in values:
                raise KeyError(f'prompt {self.id} v{self.version}: fragment "{name}" needs {{{{{k}}}}}')
            return str(values[k])
        return _SLOT.sub(sub, self.frags[name])


_cache = {}


def prompt(pid):
    """The current version of prompt pid, from prompts/registry.json (read once per process)."""
    if pid not in _cache:
        with open(REGISTRY, encoding="utf-8") as fh:
            entry = json.load(fh)["prompts"].get(pid)
        if not entry:
            raise KeyError(f'prompt registry: no prompt "{pid}"')
        with open(os.path.join(ROOT, entry["file"]), encoding="utf-8", newline="") as fh:
            _, frags = parse_by_format(fh.read(), entry.get("format"), entry["file"])
        _cache[pid] = Prompt(pid, entry["version"], frags)
    return _cache[pid]
