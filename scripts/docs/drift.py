"""Fail when the docs no longer say what the code does (ROADMAP B7, T1134).

Four checks, each one a way the docs drifted before:

1. logic   Every constant named in docs/logic/*.md still exists in the file
           the entry names, and where the entry gives a plain value
           (`= 7`, `= 0.6`, `= [5, 6]`, `= "priority"`) the code holds the
           same value. Config keys (`request.default_nights` in pricing.json)
           are looked up as JSON paths or as `rules[key].value`.
2. tests   Every test named in docs/logic/*.md (`path` :: "name") is still in
           that file.
3. schema  docs/SCHEMA.md's wire table matches docs/wire.schema.json (reuses
           continent-app/scripts/ci/wire-table.mjs; needs node).
4. entry   CLAUDE.md and MAP.md name only existing paths (reuses
           scripts/docs/check_entry_points.py).

Known drift on 2026-11-06 is listed in scripts/docs/drift_baseline.json so the
gate starts green; a finding not in the baseline fails, and a baseline entry
that no longer drifts fails too (remove it with --update-baseline), so the
list only shrinks. Line numbers in the catalogue are not checked: they move
with every edit and the constant name is the stable handle.

    python -I scripts/docs/drift.py                 # all checks, exit 1 on new drift
    python -I scripts/docs/drift.py --only logic,tests
    python -I scripts/docs/drift.py --json out.json # every finding, for the report
    python -I scripts/docs/drift.py --update-baseline

CARTA_REPO_ROOT points the script at another tree (the tests use a seeded copy).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = Path(os.environ.get("CARTA_REPO_ROOT") or HERE.parents[1]).resolve()
LOGIC_DIR = "docs/logic"
BASELINE = "scripts/docs/drift_baseline.json"
CHECKS = ("logic", "tests", "schema", "entry")

IDENT = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$")
FILE_REF = re.compile(r"^(?P<path>[A-Za-z0-9_./\[\]-]+\.(?:js|mjs|jsx|ts|tsx|py|json|sql|toml|yaml|yml))(?::\d+)?$")
RULE_HEAD = re.compile(r"^###\s+([A-Z]+-\d+[a-z]?)\b")
TEST_LINE = re.compile(r"`(?P<path>[^`]+)`\s*::\s*\"(?P<name>.+)\"\s*$")
CODE_EXT = (".js", ".mjs", ".jsx", ".ts", ".tsx", ".py", ".sql")


@dataclass
class Finding:
    check: str
    rule: str
    detail: str
    key: str = ""

    def __post_init__(self):
        if not self.key:
            self.key = f"{self.check}|{self.rule}|{self.detail}"


@dataclass
class Tally:
    names: int = 0
    names_ok: int = 0
    values: int = 0
    values_ok: int = 0
    values_unchecked: int = 0
    tests: int = 0
    tests_ok: int = 0
    findings: list = field(default_factory=list)


# ---------------------------------------------------------------- literals

def parse_literal(text: str):
    """A plain doc or code value as Python, or raise ValueError.

    Numbers (with _ separators and `x` or `*` products), quoted strings,
    booleans and flat lists of those. Anything richer is not compared.
    """
    t = text.strip()
    if not t.startswith(("'", '"')):
        t = re.sub(r"\s*(//|#).*$", "", t)
    t = t.strip().rstrip(";,").strip()
    if not t:
        raise ValueError("empty")
    if t in ("true", "True"):
        return True
    if t in ("false", "False"):
        return False
    m = re.fullmatch(r"(['\"])(.*)\1", t)
    if m and m.group(1) not in m.group(2):
        return m.group(2)
    if t.startswith("[") and t.endswith("]"):
        inner = t[1:-1].strip()
        if not inner:
            return []
        parts = split_top(inner)
        return [parse_literal(p) for p in parts]
    if re.fullmatch(r"-?[\d_.]+(\s*[x*]\s*-?[\d_.]+)*", t):
        val = 1.0
        for p in re.split(r"\s*[x*]\s*", t):
            val *= float(p.replace("_", ""))
        return val
    raise ValueError(f"not a plain literal: {t}")


def split_top(s: str) -> list[str]:
    """Split on commas that are not inside brackets or quotes."""
    out, depth, cur, q = [], 0, "", None
    for c in s:
        if q:
            cur += c
            if c == q:
                q = None
            continue
        if c in "'\"":
            q = c
        elif c in "[{(":
            depth += 1
        elif c in "]})":
            depth -= 1
        elif c == "," and depth == 0:
            out.append(cur.strip())
            cur = ""
            continue
        cur += c
    if cur.strip():
        out.append(cur.strip())
    return out


def same(a, b) -> bool:
    if isinstance(a, bool) or isinstance(b, bool):
        return a is b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(float(a) - float(b)) <= 1e-9 * max(1.0, abs(float(a)))
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    return a == b


# ---------------------------------------------------------------- lookups

_text_cache: dict[Path, str] = {}
_json_cache: dict[Path, object] = {}


def read_text(p: Path) -> str:
    if p not in _text_cache:
        _text_cache[p] = p.read_text(encoding="utf-8", errors="replace")
    return _text_cache[p]


def json_lookup(p: Path, key: str):
    """(found, value) for a dotted key in a JSON config file."""
    if p not in _json_cache:
        try:
            _json_cache[p] = json.loads(read_text(p))
        except ValueError:
            _json_cache[p] = None
    data = _json_cache[p]
    if not isinstance(data, dict):
        return False, None
    rules = data.get("rules")
    if isinstance(rules, dict):
        segs = key.split(".")
        for i in range(len(segs), 0, -1):
            head = ".".join(segs[:i])
            if head in rules:
                r = rules[head]
                node = r.get("value") if isinstance(r, dict) and "value" in r else r
                for seg in segs[i:]:
                    if isinstance(node, dict) and seg in node:
                        node = node[seg]
                    else:
                        return False, None
                return True, node
    node = data
    for seg in key.split("."):
        if isinstance(node, dict) and seg in node:
            node = node[seg]
        else:
            return deep_key(data, key.split(".")[-1])
    return True, node


def deep_key(node, key: str):
    """(found, value) for a key anywhere in the tree (a key inside a list row)."""
    if isinstance(node, dict):
        if key in node:
            return True, node[key]
        node = list(node.values())
    if isinstance(node, list):
        for x in node:
            ok, v = deep_key(x, key)
            if ok:
                return ok, v
    return False, None


def code_has(p: Path, name: str) -> bool:
    last = name.split(".")[-1]
    return re.search(r"(?<![\w$])" + re.escape(last) + r"(?![\w$])", read_text(p)) is not None


def code_value(p: Path, name: str):
    """The literal a constant is set to in code, or raise ValueError."""
    last = re.escape(name.split(".")[-1])
    pat = re.compile(
        r"^\s*(?:export\s+)?(?:const\s+|let\s+|var\s+|final\s+)?" + last
        + r"\s*(?::\s*[\w\[\], |.]+)?\s*(?:=(?!=)|:)\s*(?P<v>[^\n]+)$", re.MULTILINE)
    for m in pat.finditer(read_text(p)):
        v = m.group("v").strip()
        try:
            return parse_literal(v)
        except ValueError:
            continue
    raise ValueError("no plain literal")


# ---------------------------------------------------------------- parsing

_basenames: dict[str, list[Path]] | None = None


def by_basename(name: str) -> list[Path]:
    global _basenames
    if _basenames is None:
        _basenames = {}
        try:
            out = subprocess.run(["git", "-C", str(ROOT), "ls-files"], capture_output=True, text=True, check=False).stdout
        except OSError:
            out = ""
        for rel in out.splitlines():
            _basenames.setdefault(rel.rsplit("/", 1)[-1], []).append(ROOT / rel)
    return [p for p in _basenames.get(name, []) if p.is_file()]


def resolve(ref: str, last_full: Path | None) -> Path | None:
    """A doc file reference as a path, or None when it does not exist."""
    m = FILE_REF.match(ref)
    if not m:
        return None
    rel = m.group("path")
    if rel.startswith("app/"):
        rel = "continent-app/" + rel[4:]
    for cand in (ROOT / rel, ROOT / "continent-app" / rel):
        if cand.is_file():
            return cand
    if "/" not in rel and last_full is not None:
        hit = last_full.parent / rel
        if hit.is_file():
            return hit
    if "/" not in rel:
        for d in _doc_dirs:
            if (d / rel).is_file():
                return d / rel
        hits = by_basename(rel)
        if len(hits) == 1:
            return hits[0]
    return None


def clauses(body: str):
    """Yield (names, file_refs, value_text, named_values) per `;` clause."""
    for clause in re.split(r";\s+", body):
        spans = list(re.finditer(r"`([^`]+)`", clause))
        names, files = [], []
        for s in spans:
            tok = s.group(1).strip()
            if tok.startswith(":") or FILE_REF.match(tok):
                if not tok.startswith(":"):
                    files.append(tok)
            elif IDENT.match(tok):
                names.append(tok)
        named = dict(re.findall(r"`([A-Za-z_$][\w$.]*)`\s*=\s*([^,`;]+?)(?=,\s*`|\s+in\s+`|$)", clause))
        tail = None
        if spans:
            after = clause[spans[-1].end():]
            m = re.match(r"^(?:\s*,?\s*`?:\d+`?)*(?:\s+to\s+`?[\w./]*:\d+`?)?\s*=\s*(.+)$", after.strip())
            if m:
                tail = m.group(1).strip()
        yield names, files, tail, named


def parse_catalogue():
    """Yield (rule_id, kind, line_body) for every Constant and Test line."""
    for md in sorted((ROOT / LOGIC_DIR).glob("*.md")):
        if md.name == "README.md":
            continue
        _doc_dirs.clear()
        rule = md.stem
        for line in read_text(md).splitlines():
            h = RULE_HEAD.match(line)
            if h:
                rule = h.group(1)
                continue
            if line.startswith("- Constant:"):
                yield rule, "constant", line[len("- Constant:"):].strip()
            elif line.startswith("- Test:"):
                yield rule, "test", line[len("- Test:"):].strip()


# ---------------------------------------------------------------- checks

_last_full: dict[str, Path] = {}
_doc_dirs: list[Path] = []  # folders of full paths seen in the current doc file, newest first


def check_constant(rule: str, body: str, t: Tally):
    if body.lower().startswith("none"):
        return
    last_full: Path | None = _last_full.get(rule)
    for names, refs, tail, named in clauses(body):
        paths, missing_files = [], []
        for r in refs:
            p = resolve(r, last_full)
            if p is None:
                missing_files.append(r)
            else:
                paths.append(p)
                if "/" in r:
                    last_full = _last_full[rule] = p
                    if p.parent in _doc_dirs:
                        _doc_dirs.remove(p.parent)
                    _doc_dirs.insert(0, p.parent)
        for r in missing_files:
            t.findings.append(Finding("logic", rule, f"file {r.split(':')[0]} is gone"))
        if not paths and last_full is not None and names and not refs:
            paths = [last_full]
        if not paths:
            continue
        # `a.b` / `c` / `d`: the later names are siblings of a.b (JSON keys).
        full, parent = [], ""
        for n in names:
            if "." in n:
                parent = n.rsplit(".", 1)[0]
                full.append(n)
            elif parent and any(p.suffix == ".json" for p in paths):
                full.append(parent + "." + n)
            else:
                full.append(n)
        names = full
        values: dict[str, str] = dict(named)
        if tail and not named:
            parts = split_top(tail)
            if len(parts) != len(names) and " / " in tail:
                parts = [x.strip() for x in tail.split(" / ")]
            if len(names) == 1:
                values[names[0]] = tail
            elif len(parts) == len(names):
                values.update(zip(names, parts))
        for i, name in enumerate(names):
            t.names += 1
            found, got = False, None
            for p in paths:
                if p.suffix == ".json":
                    ok, val = json_lookup(p, name)
                    for prev in names[:i]:  # `slots`; `byPriority` at `:13`
                        if ok:
                            break
                        ok, val = json_lookup(p, prev + "." + name)
                    if ok:
                        found, got = True, ("json", val)
                        break
                elif code_has(p, name):
                    found, got = True, ("code", p)
                    break
            if not found:
                where = ", ".join(str(p.relative_to(ROOT)) for p in paths)
                t.findings.append(Finding("logic", rule, f"{name} not found in {where}"))
                continue
            t.names_ok += 1
            if name not in values:
                continue
            t.values += 1
            try:
                want = parse_literal(values[name])
            except ValueError:
                t.values_unchecked += 1
                continue
            try:
                have = got[1] if got[0] == "json" else code_value(got[1], name)
            except ValueError:
                t.values_unchecked += 1
                continue
            if isinstance(have, (dict,)) or (isinstance(have, list) and any(isinstance(x, dict) for x in have)):
                t.values_unchecked += 1
                continue
            if same(want, have):
                t.values_ok += 1
            else:
                t.findings.append(Finding("logic", rule, f"{name} is {json.dumps(have)} in code, the doc says {values[name].strip()}"))


def check_test(rule: str, body: str, t: Tally):
    if body.lower().startswith("no test"):
        return
    m = TEST_LINE.search(body)
    if not m:  # a whole test file, no test name
        f = re.match(r"`([^`]+)`", body)
        if f and FILE_REF.match(f.group(1)):
            t.tests += 1
            if resolve(f.group(1), None) is None:
                t.findings.append(Finding("tests", rule, f"test file {f.group(1)} is gone"))
            else:
                t.tests_ok += 1
        return
    t.tests += 1
    p = resolve(m.group("path"), None)
    if p is None:
        t.findings.append(Finding("tests", rule, f"test file {m.group('path')} is gone"))
        return
    name = m.group("name")
    text = read_text(p)
    variants = {name, name.replace('"', '\\"'), name.replace("'", "\\'"), name.replace("\\", "")}
    if any(v in text for v in variants) or re.sub(r"\s+", " ", name) in re.sub(r"\s+", " ", text):
        t.tests_ok += 1
    else:
        t.findings.append(Finding("tests", rule, f'test "{name}" is not in {m.group("path")}'))


def check_schema(t: Tally):
    script = ROOT / "continent-app/scripts/ci/wire-table.mjs"
    node = shutil.which("node")
    if not node or not script.is_file():
        t.findings.append(Finding("schema", "SCHEMA", "node or wire-table.mjs missing: schema check not run"))
        return
    env = dict(os.environ, CARTA_REPO_ROOT=str(ROOT))
    r = subprocess.run([node, str(script)], capture_output=True, text=True, env=env, check=False)
    if r.returncode != 0:
        for line in (r.stderr or r.stdout).splitlines():
            if line.strip():
                t.findings.append(Finding("schema", "SCHEMA", line.strip()))


def check_entry(t: Tally):
    script = ROOT / "scripts/docs/check_entry_points.py"
    r = subprocess.run([sys.executable, "-I", str(script)], capture_output=True, text=True, check=False)
    if r.returncode != 0:
        for line in r.stdout.splitlines():
            line = line.strip()
            if line.startswith(("CLAUDE.md", "MAP.md")) or "missing" in line.lower():
                t.findings.append(Finding("entry", "ENTRY", line))
        if not any(f.check == "entry" for f in t.findings):
            t.findings.append(Finding("entry", "ENTRY", (r.stdout + r.stderr).strip()[:300]))


def run(only=CHECKS) -> Tally:
    t = Tally()
    if "logic" in only or "tests" in only:
        for rule, kind, body in parse_catalogue():
            if kind == "constant" and "logic" in only:
                check_constant(rule, body, t)
            elif kind == "test" and "tests" in only:
                check_test(rule, body, t)
    if "schema" in only:
        check_schema(t)
    if "entry" in only:
        check_entry(t)
    return t


def load_baseline() -> set[str]:
    p = ROOT / BASELINE
    if not p.is_file():
        return set()
    return set(json.loads(read_text(p)).get("known", []))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", default=",".join(CHECKS))
    ap.add_argument("--json", dest="json_out")
    ap.add_argument("--update-baseline", action="store_true")
    ap.add_argument("--no-baseline", action="store_true")
    a = ap.parse_args(argv)
    only = tuple(x.strip() for x in a.only.split(",") if x.strip())
    t = run(only)
    keys = {f.key for f in t.findings}
    base = set() if a.no_baseline else load_baseline()
    # Only judge baseline entries for the checks that ran.
    base_run = {k for k in base if k.split("|", 1)[0] in only}
    new = [f for f in t.findings if f.key not in base_run]
    fixed = sorted(base_run - keys)

    print(f"logic: {t.names_ok}/{t.names} constants found, {t.values_ok}/{t.values} values match "
          f"({t.values_unchecked} not plain, not compared); tests: {t.tests_ok}/{t.tests} found; "
          f"{len(t.findings)} drift ({len(t.findings) - len(new)} known), {len(new)} new, {len(fixed)} fixed")
    if a.json_out:
        Path(a.json_out).write_text(json.dumps({
            "constants": [t.names_ok, t.names], "values": [t.values_ok, t.values, t.values_unchecked],
            "tests": [t.tests_ok, t.tests],
            "findings": [f.__dict__ for f in t.findings], "new": [f.key for f in new], "fixed": fixed,
        }, indent=1), encoding="utf-8")
    if a.update_baseline:
        p = ROOT / BASELINE
        p.parent.mkdir(parents=True, exist_ok=True)
        keep = sorted((base - base_run) | keys)
        p.write_text(json.dumps({
            "_about": "Known doc drift (T1134). scripts/docs/drift.py fails on drift not listed here and on "
                      "entries that no longer drift. Fix the doc or code, then run "
                      "`python -I scripts/docs/drift.py --update-baseline`. This list only shrinks.",
            "known": keep}, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"baseline written: {len(keep)} known")
        return 0
    for f in new:
        print(f"DRIFT  [{f.check}] {f.rule}: {f.detail}")
    for k in fixed:
        print(f"FIXED  {k}  (no longer drifts: run --update-baseline)")
    return 1 if (new or fixed) else 0


if __name__ == "__main__":
    sys.exit(main())
