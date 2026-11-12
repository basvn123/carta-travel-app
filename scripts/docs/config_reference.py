"""Generate docs/reference/config.md: every config key, its value and its readers
(ROADMAP B4, T1165).

The config files are the ones the app and the pipeline tune Carta with:

    continent-app/config/pricing.json         every rule that moves a price
    continent-app/config/rating.json          every number that moves a rating
    continent-app/config/rating_anchors.json  the hand-scored rubric anchors
    continent-app/config/recommend.json       the trip finder's numbers
    continent-app/config/slots.json           the price lines of a found trip
    continent-app/config/slo.json             the service level objectives
    continent-app/config/access-ladder.json   the data access ladder (I16)
    scripts/quality/rules.yaml                the data quality gate of a run

The pipeline has no config file of its own: pipeline/pricing_config.py and
pipeline/rating_config.py read pricing.json and rating.json, and
run_pipeline.py's quality hook reads rules.yaml through
scripts/quality/engine.py.

What a key is:
- pricing.json: one rule under "rules" (`stay.fees`); its value may be an
  object, shown compact.
- the other JSON files and rules.yaml: a top-level key, or one level down
  when the top level is a block (`tiers.cutoffs`). Arrays named in ROWS are
  listed one row per id (`slots[flight]`, `rules[core.tier]`). Keys that
  start with "_" or end in "_about" are notes for people and not listed.
- NOTES are keys written for people, not code: provenance (`created`,
  `version`), prose (`sources.*`) and the rubric a scoring session reads
  (rating_anchors.json `bands`, `calibration`). They are listed with the
  reason and never counted dead (T1217).
- BOUNDS are keys that hold a limit another key must respect
  (`match.lambda_range`); this script's --check enforces them, so a value
  moved out of its bound fails CI. MIRRORS are copies that must equal their
  source (rating_anchors.json `bands` against rating.json `bands.cutoffs`).
- A key no code line reads but a test names is listed as "tests only", not
  dead: the test is its reader (the stability gate, T1217).

Readers are found by reading the code, not by running it (see find_readers):
a pricing rule by its quoted key (`rule('stay.fees')`); any other key by
`section.key` on one line, by an alias of the section (`const M =
RATING.match` then `M.lambda`), or by the whole section being iterated
(`Object.entries(RATING.weights_v5)`), in files that load that config. A
config handed on as an argument is followed (T1217): a default parameter
(`cfg = config`) or a call that passes the root to an imported function
(`evaluateAll(cfg, snapshot)`) makes that function's parameter a root in its
file. Tests, archive/ and the docs scripts are not readers. A key with no
reader is listed as dead; the check never deletes anything.

    python -I scripts/docs/config_reference.py            # write the doc
    python -I scripts/docs/config_reference.py --check    # exit 1 when the doc's
                                                          # keys differ from the config
    python -I scripts/docs/config_reference.py --json out.json

The check compares keys, plus the BOUNDS and MIRRORS: a key added or
removed without regenerating fails, and so does a value outside its bound or
a mirror that drifted; a changed value or a moved line does not, so an
unrelated code edit never turns CI red. CARTA_REPO_ROOT points it at another
tree.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
ROOT = Path(os.environ.get("CARTA_REPO_ROOT") or HERE.parents[1]).resolve()
DOC = "docs/reference/config.md"
HANDBOOK = "docs/HANDBOOK.md"

# path, the words that mark a file as loading it, arrays listed by row id
SOURCES = [
    ("continent-app/config/pricing.json", ("pricing.json", "pricing_config", "PRICING_RULES"), ()),
    ("continent-app/config/rating.json", ("rating.json", "rating_config"), ()),
    ("continent-app/config/rating_anchors.json", ("rating_anchors.json",), ()),
    ("continent-app/config/recommend.json", ("recommend.json",), ()),
    ("continent-app/config/slots.json", ("slots.json",), ("slots",)),
    ("continent-app/config/slo.json", ("slo.json",), ("slos",)),
    ("continent-app/config/access-ladder.json", ("access-ladder.json",), ("sources",)),
    ("scripts/quality/rules.yaml", ("rules.yaml",), ("rules",)),
]
# keys written for people: {file: {key or "section.*": who reads it}}
_PROV = "provenance, read by people"
_RUBRIC = "the rubric session reads it by hand (HANDBOOK, Appeal)"
NOTES = {
    "continent-app/config/pricing.json": {"version": _PROV},
    "continent-app/config/rating.json": {"depth.categories_from": "provenance in words (T761)"},
    "continent-app/config/rating_anchors.json": {
        "created": _PROV, "task": _PROV, "rule": "the rubric rule in words", "shortfalls": "known gaps, in words",
        "version": _PROV, "bands": _RUBRIC, "calibration": _RUBRIC},
    "continent-app/config/recommend.json": {"version": _PROV},
    "continent-app/config/slots.json": {"version": _PROV},
    "continent-app/config/slo.json": {"version": _PROV, "sources.*": "where each number comes from, in words"},
    "continent-app/config/access-ladder.json": {
        "version": _PROV, "terms_checked": "the date of the terms check (docs/data/access-ladder.md)",
        "metrics.*": "where the admin reads each unlock number, in words"},
    "scripts/quality/rules.yaml": {"version": _PROV},
}


def note_of(rel, key):
    notes = NOTES.get(rel, {})
    if key in notes:
        return notes[key]
    for n, why in notes.items():
        if n.endswith(".*") and key.startswith(n[:-1]):
            return why
    return None


def _get(data, dotted):
    for part in dotted.split("."):
        data = data[part]
    return data


def _within(rng, v):
    return isinstance(v, (int, float)) and rng[0] <= v <= rng[1]


def _lambda_in_range(cfgs):
    m = cfgs["continent-app/config/rating.json"]["match"]
    return [] if _within(m["lambda_range"], m["lambda"]) else [f"match.lambda {m['lambda']} is outside match.lambda_range {m['lambda_range']}"]


def _conflicts_in_range(cfgs):
    m = cfgs["continent-app/config/rating.json"]["match"]
    return [f"match.conflicts.{k} {v} is outside match.conflict_range {m['conflict_range']}"
            for k, v in m["conflicts"].items() if not _within(m["conflict_range"], v)]


def _anchor_bands_mirror(cfgs):
    cut = cfgs["continent-app/config/rating.json"]["bands"]["cutoffs"]
    bands = cfgs["continent-app/config/rating_anchors.json"]["bands"]
    have = {re.sub(r"\W+", "_", b["band"].lower()): b["min"] for b in bands}
    return [] if have == cut else [f"rating_anchors.json bands {have} differ from rating.json bands.cutoffs {cut}"]


# keys whose value this script checks: (file, key, what the check is, check)
BOUNDS = [
    ("continent-app/config/rating.json", "match.lambda_range", "bound on `match.lambda`", _lambda_in_range),
    ("continent-app/config/rating.json", "match.conflict_range", "bound on every `match.conflicts` factor",
     _conflicts_in_range),
    ("continent-app/config/rating_anchors.json", "bands", "mirror of rating.json `bands.cutoffs`", _anchor_bands_mirror),
]


def bound_of(rel, key):
    return next((what for f, k, what, _ in BOUNDS if f == rel and k == key), None)


def bound_failures():
    cfgs = {rel: load(rel) for rel, _, _ in SOURCES}
    out = []
    for _, _, _, fn in BOUNDS:
        out += fn(cfgs)
    return out

CODE_DIRS = ("continent-app/src", "continent-app/functions", "continent-app/workers",
             "continent-app/scripts", "pipeline", "scripts", "src", "supabase/functions")
CODE_FILES = ("run_pipeline.py",)
CODE_EXT = {".py", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx"}
SKIP_PARTS = {"node_modules", "archive", "__pycache__", "dist", ".fastbuild"}
NOT_READERS = {"scripts/docs/config_reference.py", "scripts/docs/drift.py"}
TEST_DIRS = ("tests", "continent-app/tests")
MAX_READERS = 3

COMMENT = re.compile(r"^\s*(?:#|//|\*|/\*)")


# ---------------------------------------------------------------- keys

def load(rel):
    text = (ROOT / rel).read_text(encoding="utf-8")
    return yaml.safe_load(text) if rel.endswith((".yaml", ".yml")) else json.loads(text)


def skip_name(k):
    return str(k).startswith("_") or str(k).endswith("_about")


def keys_of(rel, data, rows):
    """[(display key, path tuple, value, note)] in file order."""
    out = []
    if rel.endswith("pricing.json"):
        for k, r in data["rules"].items():
            out.append((k, ("rules", k), r, None))
        out.insert(0, ("version", ("version",), data.get("version"), note_of(rel, "version")))
        return out
    for k, v in data.items():
        if skip_name(k):
            continue
        if note_of(rel, k):
            out.append((k, (k,), v, note_of(rel, k)))
        elif k in rows and isinstance(v, list):
            for i, row in enumerate(v):
                rid = row.get("id", i) if isinstance(row, dict) else i
                out.append((f"{k}[{rid}]", (k, f"[{rid}]"), row, None))
        elif isinstance(v, dict) and any(not skip_name(c) for c in v):
            for c, cv in v.items():
                if not skip_name(c):
                    out.append((f"{k}.{c}", (k, c), cv, note_of(rel, f"{k}.{c}")))
        else:
            out.append((k, (k,), v, None))
    return out


def all_keys():
    """{source path: [(key, path, value, note)]}"""
    return {rel: keys_of(rel, load(rel), rows) for rel, _, rows in SOURCES}


# ---------------------------------------------------------------- code

def code_files():
    files = []
    for d in CODE_DIRS:
        base = ROOT / d
        if not base.exists():
            continue
        for p in base.rglob("*"):
            if p.suffix in CODE_EXT and p.is_file() and not (SKIP_PARTS & set(p.relative_to(ROOT).parts)):
                files.append(p)
    files += [ROOT / f for f in CODE_FILES if (ROOT / f).exists()]
    out = {}
    for p in sorted(set(files)):
        rel = p.relative_to(ROOT).as_posix()
        if rel in NOT_READERS or "/test_" in rel or ".test." in rel:
            continue
        try:
            out[rel] = p.read_text(encoding="utf-8").splitlines()
        except (UnicodeDecodeError, OSError):
            continue
    return out


def test_files():
    out = {}
    for d in TEST_DIRS:
        base = ROOT / d
        if base.exists():
            for p in base.rglob("*"):
                if p.suffix in CODE_EXT and p.is_file() and "node_modules" not in p.parts:
                    out[p.relative_to(ROOT).as_posix()] = p.read_text(encoding="utf-8", errors="replace")
    return out


_CL = {}


def tests_naming(rel, key, path, tests):
    """Test files that name the key: the quoted pricing rule, `s0.s1` or both on one
    line, or a one-part key next to the config's file name."""
    if rel.endswith("pricing.json") and len(path) == 2:
        pat = re.compile(r"""['"`]""" + re.escape(key) + r"""['"`]""")
    elif len(path) == 2 and not path[1].startswith("["):
        pat = re.compile(acc(path[0]) + r".*?" + acc(path[1]))
    elif len(path) == 2:
        pat = re.compile(re.escape(path[1].strip("[]")))
    else:
        base = Path(rel).name
        return sorted(t for t, txt in tests.items() if base in txt and re.search(acc(key), txt))[:3]
    return sorted(t for t, txt in tests.items() if pat.search(txt))[:3]


def tests_reading(rel, hints, key, path, tests):
    """Tests that read the key from the config itself: the test loads the config
    (one of its hint words) and names the key, or, for a row of a list, names the
    list (a test that loops over `sources` reads every row). Stricter than
    tests_naming, which only finds a mention."""
    loading = {t: txt for t, txt in tests.items() if any(h in txt for h in hints)}
    if len(path) == 2 and path[1].startswith("["):
        rx = re.compile(acc(path[0]))
        return sorted(t for t, txt in loading.items() if rx.search(txt))[:3]
    return tests_naming(rel, key, path, loading)


def code_lines(lines):
    k = id(lines)
    if k not in _CL:
        out, doc = [], False
        for i, ln in enumerate(lines, 1):
            quotes = ln.count('"""') + ln.count("\'\'\'")
            if doc or (quotes and ln.lstrip().startswith(('"""', "\'\'\'", 'r"""'))):
                if quotes % 2:
                    doc = not doc
                continue
            if ln.strip() and not COMMENT.match(ln):
                out.append((i, ln))
        _CL[k] = out
    return _CL[k]


QUOTED = re.compile(r"""['"`]([A-Za-z_][\w.]*)['"`]""")
_QIDX = {}


def quoted_index(s_files):
    """{quoted string: [(file, line)]} over every code line, built once."""
    if not _QIDX:
        for f, lines in s_files.items():
            for i, ln in code_lines(lines):
                for m in QUOTED.finditer(ln):
                    _QIDX.setdefault(m.group(1), []).append((f, i))
    return _QIDX


def acc(name):
    """`name` read as an attribute or a quoted key: .name ?.name "name" 'name'"""
    return r"""(?:[.'"`]|\[\s*['"])""" + re.escape(name) + r"\b"


LOADS = re.compile(r"\b(?:json\.loads?|yaml\.safe_load|JSON\.parse|readFileSync|require|import)\b")
ASSIGN = re.compile(r"^\s*(?:export\s+)?(?:const|let|var)?\s*([A-Za-z_$][\w$]*)\s*(?::\s*[\w\[\]]+\s*)?=(?!=)")
ITER_OVER = r"(?:Object\.(?:entries|keys|values)\(\s*{x}\s*\)|{x}\s*\.(?:items|values|keys)\(\)" \
            r"|\b(?:in|of)\s+{x}\s*[:)\]]|\b(?:sorted|list|sum|max|min|set|tuple|enumerate)\(\s*{x}\s*[),]" \
            r"|JSON\.stringify\(\s*{x}|{x}\s*\.(?:map|filter|forEach|some|every|find|reduce|flatMap)\()"


def file_roots(lines, base):
    """How a file reaches the config: (root variables, call prefixes)."""
    cl = code_lines(lines)
    paths, roots = set(), set()
    for _, ln in cl:
        if base in ln:
            m = re.search(r"\bimport\s+([A-Za-z_$][\w$]*)\s+from\b", ln)
            if m:
                roots.add(m.group(1))
                continue
            m = ASSIGN.match(ln)
            if m:
                (roots if LOADS.search(ln) else paths).add(m.group(1))
    defaults = any(re.search(r"\bdef\s+\w+\(.*=\s*" + re.escape(pv) + r"\b", ln) for pv in paths for _, ln in cl)
    for _, ln in cl:
        m = ASSIGN.match(ln)
        if m and LOADS.search(ln) and (any(re.search(r"\b" + re.escape(pv) + r"\b", ln) for pv in paths)
                                       or (defaults and re.search(r"\bpath\b", ln))):
            roots.add(m.group(1))
    text = "\n".join(ln for _, ln in cl)
    calls = []
    if re.search(r"\brating_config\b|\bdef cfg\(", text) and base == "rating.json":
        calls = ["cfg", "section"]
    if re.search(r"\bpricing_config\b|\bPRICING\b", text) and base == "pricing.json":
        roots.add("PRICING")
    return roots, calls


DEF = re.compile(r"^\s*(?:export\s+)?(?:async\s+)?(?:function\s+|def\s+)([A-Za-z_$][\w$]*)\s*\(([^)]*)\)")
CALL = re.compile(r"\b([A-Za-z_$][\w$]*)\(([^()]*)\)")
_DEFS = {}


def def_index(s_files):
    """{function name: [(file, [parameter names])]} over every code line, built once."""
    if not _DEFS:
        for f, lines in s_files.items():
            for _, ln in code_lines(lines):
                m = DEF.match(ln)
                if m:
                    params = [re.split(r"[=:]", a)[0].strip().lstrip("*") for a in m.group(2).split(",")]
                    _DEFS.setdefault(m.group(1), []).append((f, params))
    return _DEFS


def imports_name(lines, name):
    rx = re.compile(r"\b(?:import|from)\b.*\b" + re.escape(name) + r"\b")
    return any(rx.search(ln) for _, ln in code_lines(lines))


def roots_map(aware, s_files, base):
    """{file: (roots, calls)} for the files that load the config, plus the files
    the config is handed to as an argument (T1217, closes T1211-d): a default
    parameter (`cfg = config`) and a call that passes a root to an imported
    function (`evaluateAll(cfg, snapshot)`), followed for three hops."""
    out = {f: file_roots(s_files[f], base) for f in aware}
    defs = def_index(s_files)
    for _ in range(3):
        grew = False
        for f in list(out):
            roots = out[f][0]
            if not roots:
                continue
            rx = "|".join(map(re.escape, sorted(roots)))
            for _, ln in code_lines(s_files[f]):
                for m in re.finditer(r"[(,]\s*([A-Za-z_$][\w$]*)\s*=\s*(?:" + rx + r")\s*[,)]", ln):
                    if m.group(1) not in roots:
                        roots.add(m.group(1))
                        grew = True
                for m in CALL.finditer(ln):
                    args = [a.strip() for a in m.group(2).split(",")]
                    hits = [i for i, a in enumerate(args) if a in roots]
                    if not hits or m.group(1) not in defs or not imports_name(s_files[f], m.group(1)):
                        continue
                    for g, params in defs[m.group(1)]:
                        if g == f:
                            continue
                        new = {params[i] for i in hits if i < len(params) and re.fullmatch(r"[A-Za-z_$][\w$]*", params[i])}
                        if g not in out:
                            out[g] = (set(), [])
                        if new - out[g][0]:
                            out[g][0].update(new)
                            grew = True
        if not grew:
            break
    return out


def rooted(s0, roots, calls, exact=False):
    """`s0` reached from the config itself: ROOT.s0, ROOT["s0"], cfg("s0"), cfg("s0.x").
    exact: the section itself, not a key inside it (for aliases and iteration)."""
    alts = []
    tail = r"""(?!\s*(?:\??\.\s*\w|\[\s*['"]|\.get\())""" if exact else ""
    if roots:
        alts.append(r"\b(?:" + "|".join(map(re.escape, sorted(roots))) + r")\s*(?:\??\.|\[\s*['\"]|\.get\(\s*['\"])\s*"
                    + re.escape(s0) + r"\b['\"]?\s*\]?\)?" + tail)
    if calls:
        sub = "" if exact else r"(?:\.[\w.]+)?"
        alts.append(r"\b(?:\w+\.)?(?:" + "|".join(calls) + r")\(\s*['\"]" + re.escape(s0) + sub + r"['\"]\s*\)" + tail)
    return re.compile("(?:" + "|".join(alts) + ")") if alts else None


def find_readers(path, s_files, aware, pricing=False, base="", roots_of=None):
    """Readers of one key: [(file, line, how)]. roots_of: roots_map() for this config."""
    if pricing and len(path) == 2:                                    # a pricing rule
        return sorted({(f, i, "rule") for f, i in quoted_index(s_files).get(path[1], [])})
    hits = []
    s0 = path[0]
    s1 = path[1] if len(path) > 1 else None
    rows = s1 is not None and s1.startswith("[")
    for f in (roots_of or aware):
        lines = s_files[f]
        cl = code_lines(lines)
        roots, calls = roots_of[f] if roots_of else file_roots(lines, base)
        r0 = rooted(s0, roots, calls)
        if r0 is None:
            continue
        acc_lines = [(i, ln) for i, ln in cl if s0 in ln and r0.search(ln)]
        if not acc_lines:
            continue
        if s1 is None or rows:
            hits += [(f, i, "key" if s1 is None else "rows") for i, _ in acc_lines]
            # a list read through an alias counts too (rows = d.get("rules"))
            continue
        a1 = re.compile(acc(s1))
        dotted = re.compile(r"""['"]""" + re.escape(s0) + r"\." + re.escape(s1) + r"""\b""")
        for i, ln in acc_lines:
            m = r0.search(ln)
            chained = re.match(r"\s*(?:\??\.|\[\s*['\"]|\.get\(\s*['\"])\s*" + re.escape(s1) + r"\b", ln[m.end():])
            destructured = re.search(r"\{[^}]*\b" + re.escape(s1) + r"\b[^}]*\}\s*=", ln[:m.start()])
            if dotted.search(ln) or a1.match(ln, m.end()) or chained or destructured:
                hits.append((f, i, "key"))
        rx = rooted(s0, roots, calls, exact=True)
        for i, ln in acc_lines:
            mx = rx.search(ln)
            if not mx:
                continue
            rest = ln[mx.end():]
            if re.match(r"""\s*\[\s*[A-Za-z_$][\w$.]*\s*\]""", rest):
                hits.append((f, i, "whole block"))
            if re.search(ITER_OVER.replace("{x}", rx.pattern), ln):
                hits.append((f, i, "whole block"))
            m = ASSIGN.match(ln)
            if m and re.match(r"""\s*(?:\)|\]|\}|;|,|\|\||\?\?|\bor\b|$)""", rest):
                alias = m.group(1)
                ea = re.escape(alias)
                use = re.compile(r"\b" + ea + r"""\s*(?:\??\.|\[\s*['"]|\.get\(\s*['"])\s*""" + re.escape(s1) + r"\b")
                dst = re.compile(r"\{[^}]*\b" + re.escape(s1) + r"\b[^}]*\}\s*=\s*" + ea + r"\b")
                itr = re.compile(ITER_OVER.replace("{x}", r"\b" + ea + r"\b")
                                 + r"|\b" + ea + r"""\s*\[\s*[A-Za-z_$][\w$]*\s*\]""")
                scope = s_files.items() if ln.lstrip().startswith("export") else [(f, lines)]
                for g, glines in scope:
                    if alias not in "\n".join(glines):
                        continue
                    for j, gl in code_lines(glines):
                        if alias in gl and (use.search(gl) or dst.search(gl)):
                            hits.append((g, j, "alias"))
                for j, gl in cl:
                    if alias in gl and itr.search(gl):
                        hits.append((f, j, "whole block"))
    return sorted(set(hits))


# ---------------------------------------------------------------- describe

def jtype(v):
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, int):
        return "integer"
    if isinstance(v, float):
        return "number"
    if isinstance(v, str):
        return "string"
    if isinstance(v, list):
        return f"list ({len(v)})"
    if isinstance(v, dict):
        return f"object ({len([k for k in v if not skip_name(k)])})"
    return "null"


def clean(s):
    return s.replace("|", "\\|").replace("\n", " ").replace("\u2013", "-").replace("\u2014", "-")


def compact(v, limit=90):
    if isinstance(v, dict):
        v = {k: x for k, x in v.items() if not skip_name(k)}
    s = json.dumps(v, ensure_ascii=False, separators=(", ", ": "))
    if len(s) > limit:
        s = s[: limit - 4].rstrip() + " ..."
    return "`" + clean(s).replace("`", "'") + "`"


UNIT_SUFFIX = [
    (re.compile(r"(?:_km|Km|_kms)$"), "km"), (re.compile(r"(?:_kmh|Kmh)$"), "km/h"),
    (re.compile(r"(?:_c|C)$"), "degrees C"), (re.compile(r"(?:_days|Days)$"), "days"),
    (re.compile(r"(?:Months|_months)$"), "months"), (re.compile(r"(?:_pct|Pct)$"), "percent"),
    (re.compile(r"(?:_eur|Eur)$"), "EUR"), (re.compile(r"(?:share|_share|Share|_frac)$"), "share 0 to 1"),
    (re.compile(r"(?:weight|_w|W|weights)$"), "weight"), (re.compile(r"Per100$"), "per 100 EUR"),
    (re.compile(r"(?:Min)$"), "minutes"), (re.compile(r"(?:_pctl|_pctl_by_tier)$"), "percentile"),
    (re.compile(r"(?:_n|_items|_count|Count)$"), "count"), (re.compile(r"(?:nights)$"), "nights"),
]
UNIT_FIXED = {
    "recommend.json": {"reasons.airportCloseMin": "minutes", "catch.longTransferMin": "minutes",
                       "catch.longFlightMin": "minutes", "persona.minScore": "score 0 to 1",
                       "persona.reasonMin": "score 0 to 1", "rank.mainLikeMin": "score 0 to 1",
                       "kept.dropMin": "match points", "persona.aroundMin": "minutes"},
}


def unit_of(rel, key, value):
    if rel.endswith("pricing.json"):
        return value.get("unit") if isinstance(value, dict) else None
    fixed = UNIT_FIXED.get(Path(rel).name, {}).get(key)
    if fixed:
        return fixed
    leaf = key.split(".")[-1]
    if leaf.startswith("["):
        return None
    if leaf == "version" or isinstance(value, (str, bool)):
        return None
    for pat, unit in UNIT_SUFFIX:
        if pat.search(leaf):
            return unit + " (from the name)"
    return None


# What a key changes for a traveller. Pricing by rule key, the rest by section.
PRICE_EFFECT = {
    "version": "None directly: the version of the price rules.",
    "stay.fees": "The service and cleaning fees and the weekly discount added to an entire-place stay price.",
    "stay.home_caps": "How many people an entire home sleeps, so which home size a party is priced on.",
    "stay.people_per_room": "How many rooms a party needs, so the bed price per person.",
    "stay.dorm_child_weight": "How many dorm beds children take, so a family's hostel price.",
    "stay.thin_obs": "When a bed price is based on too few properties and flagged as thin.",
    "stay.weekend_nights": "Which nights get the weekend bed price.",
    "stay.peaks": "Which dates get the peak season bed price.",
    "stay.bounds_pp_night": "The lowest and highest believable bed price per person; one outside is repaired.",
    "stay.repair": "How a bed price outside its bounds is replaced (the country median).",
    "bands.cuts": "Where the five price bands (budget to luxury) cut on a card.",
    "bands.ref_prices": "The reference prices a place's prices are compared with for its band.",
    "bands.ref_stay": "The reference bed price per tier, and the stay tiers a found trip offers.",
    "bands.scale_clamp": "How far a lifestyle level can scale the band of a place.",
    "when.guide": "When a month reads as too hot or when bed prices count as flat in When to go.",
    "bands.feel": "When a price reads as cheap or dear for its place (price feel labels).",
    "lifestyle.default": "The daily food, drink and coffee basket priced when no lifestyle is chosen.",
    "lifestyle.profiles": "The baskets of the lifestyle levels (Backpacker to Foodie) behind every day price.",
    "lifestyle.club_drinks_per_night": "How many drinks a night out adds to the day price.",
    "party.shares": "How much a child or baby costs compared with an adult.",
    "party.baby_lap_fee_leg": "The lap fee added for a baby on each flight leg.",
    "party.limits": "The most adults, children and babies a party can have on every screen.",
    "transport.rides_per_day": "How many local rides a day are priced, by place size.",
    "request.default_nights": "The number of nights priced when the traveller gave none.",
    "request.default_bag": "The bag every flight price includes by default.",
    "car.model": "The car behind a driving price: consumption, speed, seats.",
    "car.toll_corridor_start_km": "From what distance tolls are added to a drive.",
    "ground.transfer_public": "The public transport price and time from the airport to a place.",
    "ground.overland_floors": "The lowest train or bus fare shown between two places.",
    "ground.sea_bands": "The fares of sea and tunnel crossings (ferry, Eurostar, LeShuttle).",
    "ground.country_profiles": "Train and bus fares and speeds per country.",
    "ground.rail_score_bonus": "How much the train is preferred when the modes are ranked.",
    "ground.calibration": "The measured fare per country and mode that corrects train and bus prices.",
    "ground.plane_reach_km": "How far from an airport a place still counts as reached by plane.",
    "flights.max_age_days": "How old a swept fare may be before it is not shown.",
    "flights.nearest_day_spread": "How many days from the wanted date a swept fare may come from.",
    "origins.airport_access": "The drive, parking and time to the traveller's home airport.",
    "flights.bag_fees": "The bag fee each airline adds to a flight price.",
    "stays.model": "How scraped stay prices are aged, cleaned and spread over the year.",
    "car.fuel_by_country": "The fuel price per country in a driving price.",
    "car.rental_by_country": "The car hire day rate per country.",
    "gate.stays": "None directly: stops a stays scrape that moved too much, so the last good prices stay live.",
    "gate.food": "None directly: stops a food price run that jumped too much.",
    "gate.routes": "None directly: stops a route list that lost too many routes.",
    "gate.sweep": "Which swept fares are too high to be believed and are dropped.",
    "way.choice": "Whether a card opens on flying or on going overland.",
}
SECTION_EFFECT = {
    "rating.json": {
        "version": "None directly: the rating model version a run must match.",
        "reference": "None directly: where the frozen rating reference lives.",
        "reference_versions": "None directly: the reference part a run must match; a mismatch stops the run.",
        "formula": "Which rating formula scores every place.",
        "weights_v5": "How much appeal, beauty, depth and recognition count in the 0 to 10 rating.",
        "class_curve": "How each place class's ratings are spread so the best of a class reach the top.",
        "estimated": "The cap on a rating nobody scored by hand, shown as estimated.",
        "bands": "The band word (Exceptional to Pleasant) a rating earns; not on the wire yet.",
        "match": "The personal match percentage and the For you order.",
        "weights": "The old v4 blend; read only when formula is v4.",
        "tiers": "The tier label on a card (Worth a visit, a detour, the journey).",
        "hidden_gem": "Which places carry the hidden gem mark.",
        "recognition": "How much UNESCO and other designations lift a rating.",
        "depth": "How much there is to do counts in the rating.",
        "beauty": "How the scenery around a place counts in the rating.",
        "highlights": "The old v4 highlights part; used only while depth is off.",
        "confidence": "When a rating is shown as less certain.",
        "fallback": "The rating of a place with no hand or rubric appeal.",
        "appeal_scale": "How hand appeal is opened up per place class before it enters the rating.",
        "significance": "Which sights rank highest inside a place.",
        "fame": "The fame breakpoints behind the hidden gem mark.",
        "stability": "None directly: a gate that stops a run when adding places moves existing ratings.",
        "nature": "The 0 to 10 ratings of beaches, lakes, peaks, walks and cycle routes.",
        "poi_categories": "Which category a sight is filed under for depth and the day planner.",
        "poi_labels": "Which sights are labelled must-see, recommended or worth a look.",
    },
    "rating_anchors.json": {
        "version": "None directly: the version of the anchor set.",
        "bands": "The band floors a rubric score is placed against.",
        "anchors": "The hand-scored places a rubric score is placed against, which sets appeal for places nobody scored.",
        "calibration": "Well-known Good and Pleasant places that keep rubric scores from running high.",
        "created": "None: provenance note.", "task": "None: provenance note.",
        "rule": "None: the rubric rule in words.", "shortfalls": "None: known gaps in the anchor set.",
    },
    "recommend.json": {
        "version": "None directly: the version of the trip finder's numbers.",
        "candidates": "How many trips Trips for you builds, and from how many countries, places and distances.",
        "gateway": "Which nearby airports count as a trip's gateway.",
        "dates": "The trip length and start day used when the setup gave none.",
        "month": "The month picked for a trip when the setup gave none, by the weather asked for.",
        "rank": "The order of Trips for you and the match badge on each trip.",
        "budget": "How far a trip over budget sinks in the list.",
        "reasons": "The reasons shown under a found trip.",
        "catch": "The catches flagged on a found trip (long transfer, long flight, crowds).",
        "levers": "The quick switches on a found trip (flight, food, bases).",
        "kept": "When a kept trip drops off the list after the setup changes.",
        "persona": "How the chosen travel personas move places and trips up the list.",
    },
    "slots.json": {
        "version": "None directly: the version of the slot list.",
        "slots": "One price line on a found trip's receipt and cost bar, and whether question 7 offers it.",
    },
    "slo.json": {
        "version": "None directly: the version of the SLO file.",
        "window_days": "The days of history each error budget is counted over in the admin SLO panel.",
        "burn": "When an SLO in the admin SLO panel shows as budget low.",
        "sources": "None directly: where each SLO's numbers come from, in words.",
        "slos": "One SLO in the admin SLO panel: its target or latency threshold and its error budget.",
    },
    "access-ladder.json": {
        "version": "None directly: the version of the ladder.",
        "terms_checked": "None directly: when the partner terms were last read.",
        "metrics": "None directly: where each unlock number is read, in words.",
        "sources": ("None directly today: one commercial data source's route, unlock number and stop flag; "
                    "every flag is off until the owner sets its variable."),
    },
    "rules.yaml": {
        "version": "None directly: the version of the rule file.",
        "gate": "None directly: when a pipeline run fails; a failed run keeps the previous data live.",
    },
}
HANDBOOK_SECTION = {
    "pricing.json": [
        ("stay.", "Bed price per night"), ("bands.feel", "Price map and price feel labels"),
        ("bands.", "The day price and the five price bands"),
        ("when.", "When logic (the traveller's month) and When to go"),
        ("lifestyle.", "Lifestyle levels"), ("party.", "Group size and the party"),
        ("transport.", "Local transport"),
        ("request.", "The price request (one question for every screen)"),
        ("car.rental", "Car hire"), ("car.", "Driving your own car: fuel and tolls"),
        ("ground.transfer_public", "Airport transfer per mode (airport to the place)"),
        ("ground.plane_reach_km", "Airport transfer per mode (airport to the place)"),
        ("ground.", "Train, bus and travel between places"),
        ("flights.", "Flights and fares in the app (swept and live)"),
        ("origins.", "Airports in reach from home and the way to the airport"),
        ("stays.", "Stays: the Booking and Hostelworld scrape"),
        ("gate.stays", "Stays: the Booking and Hostelworld scrape"),
        ("gate.food", "Food and drink prices (pipeline) and the Eat and drink section"),
        ("gate.", "Flight sweep (the Worker)"),
        ("way.", "The way there: which mode a card opens on (D13)"),
        ("version", "The price request (one question for every screen)"),
    ],
    "rating.json": [
        ("beauty", "Beauty"), ("depth", "Depth"), ("recognition", "Designations and recognition"),
        ("hidden_gem", "Fame and hidden gems"), ("fame", "Fame and hidden gems"),
        ("match", "Personal match and \"For you\""),
        ("significance", "POI significance and labels (must-see, recommended, worth a look)"),
        ("poi_", "POI significance and labels (must-see, recommended, worth a look)"),
        ("nature", "Nature ratings on the place ladder (beaches, lakes, peaks, walks, cycle routes)"),
        ("appeal_scale", "Appeal: hand scores and the rubric"),
        ("", "Place rating (Carta rating v5)"),
    ],
    "rating_anchors.json": [("", "Appeal: hand scores and the rubric")],
    "recommend.json": [("", "Trip finder (\"Trips for you\")")],
    "slots.json": [("", "Trip finder (\"Trips for you\")")],
    "rules.yaml": [("", "Data quality scorecard and gate")],
}


def effect_of(rel, key, value):
    name = Path(rel).name
    if name == "pricing.json":
        return PRICE_EFFECT.get(key, "Not described yet.")
    if name == "rules.yaml" and key.startswith("rules["):
        level, kind = value.get("level"), value.get("kind")
        what = "a field a traveller sees on a card or page" if level == "must_see" else "a field the app reads"
        act = "a breach stops the run, so the last good data stays live" if kind == "hard" else "a breach only warns"
        return f"Floor {value.get('min')} on {what} ({value.get('layer')}.{value.get('field')}); {act}."
    sec = key.split(".")[0].split("[")[0]
    return SECTION_EFFECT.get(name, {}).get(sec, "Not described yet.")


def handbook_index():
    lines = (ROOT / HANDBOOK).read_text(encoding="utf-8").splitlines()
    heads, cur = set(), None
    where = []
    for ln in lines:
        if ln.startswith("### "):
            cur = ln[4:].strip()
            heads.add(cur)
        elif cur:
            where.append((cur, ln))
    return heads, where


def handbook_of(rel, key, heads, where):
    name = Path(rel).name
    if "[" not in key and "." in key:
        tok = "`" + key + "`"
        found = Counter(h for h, ln in where if tok in ln)
        if found:
            return found.most_common(1)[0][0]
    for prefix, head in HANDBOOK_SECTION.get(name, []):
        if key.startswith(prefix):
            if head not in heads:
                raise SystemExit(f"HANDBOOK has no section '### {head}' (fix HANDBOOK_SECTION)")
            return head
    return None


def anchor(head):
    a = head.lower()
    a = re.sub(r"[^\w\s-]", "", a)
    return re.sub(r"\s", "-", a.strip())


# ---------------------------------------------------------------- build

def build():
    keys = all_keys()
    files = code_files()
    tests = test_files()
    heads, where = handbook_index()
    rows = []
    for rel, hints, _ in SOURCES:
        aware = [f for f, lines in files.items()
                 if any(h in ln for _, ln in code_lines(lines) for h in hints)]
        aware = [f for f in aware if f != rel]
        roots_of = roots_map(aware, files, Path(rel).name)
        for key, path, value, note in keys[rel]:
            shown = value.get("value") if rel.endswith("pricing.json") and isinstance(value, dict) and "value" in value else value
            if note:
                readers = []
            else:
                readers = find_readers(path, files, aware, pricing=rel.endswith("pricing.json"), base=Path(rel).name,
                                       roots_of=roots_of)
            in_tests = tests_naming(rel, key, path, tests)
            t_read = tests_reading(rel, hints, key, path, tests)
            bound = bound_of(rel, key)
            rows.append({
                "file": rel, "key": key, "type": jtype(shown), "value": shown,
                "unit": unit_of(rel, key, value), "note": note,
                "readers": [{"file": f, "line": i, "how": how} for f, i, how in readers],
                "tests_naming_it": in_tests[:3],
                "effect": effect_of(rel, key, value),
                "handbook": handbook_of(rel, key, heads, where),
                "bound": bound,
                "tests_reading_it": t_read,
                "tests_only": not note and not readers and not bound and bool(t_read),
                "dead": not note and not readers and not bound and not t_read,
            })
    return rows


def render(rows):
    by_file = {}
    for r in rows:
        by_file.setdefault(r["file"], []).append(r)
    total = len(rows)
    notes = sum(1 for r in rows if r["note"])
    bounds = sum(1 for r in rows if r["bound"])
    tonly = sum(1 for r in rows if r["tests_only"])
    dead = [r for r in rows if r["dead"]]
    out = [
        "# Config reference",
        "",
        ("Generated by `scripts/docs/config_reference.py` (ROADMAP B4, T1165). Never edit by hand: change the config, "
        "then run `python -I scripts/docs/config_reference.py`. CI runs it with `--check` and fails when a key was added "
        "or removed without regenerating this file."),
        "",
        (f"{total} keys in {len(by_file)} files: {total - notes - bounds - tonly - len(dead)} with a reader in the code, "
        f"{tonly} read by tests only, {bounds} bounds checked by this script, {len(dead)} dead (no reader found), "
        f"{notes} notes for people."),
        "",
        "How to read it:",
        "",
        ("- **Key**: a pricing rule (`stay.fees`), a top-level key, or one level into a block (`tiers.cutoffs`). "
        "Rows of a list are listed by id (`slots[flight]`). Keys starting with `_` or ending in `_about` are notes and not listed."),
        "- **Value**: the value today, cut at 90 characters. Pricing values come from the rule's `value`.",
        "- **Unit**: the rule's own `unit` in pricing.json; elsewhere read from the key's name, marked \"(from the name)\", or blank when the name says nothing.",
        ("- **Read by**: the first code lines that read the key (file and line on the day it was generated), found by reading the code: "
        "the quoted rule key, `section.key` on one line, an alias of the section, or the whole section iterated (\"whole block\"). "
        "A config handed on as an argument is followed into the function that takes it. "
        "Tests, `archive/` and the docs scripts do not count as code readers: a key only tests name is marked \"tests only\". "
        "\"Note for people\" marks provenance and prose; \"bound\" marks a limit `--check` enforces. "
        "Line numbers move with every edit; regenerate to refresh them."),
        "- **For a traveller**: what changing the key changes for someone using Carta. \"None directly\" marks a pipeline or bookkeeping key.",
        "- **Handbook**: the section in `docs/HANDBOOK.md` that explains the rule, found by the key in backticks, else by the key's section.",
        "",
        ("The pipeline has no config file of its own: `pipeline/pricing_config.py` and `pipeline/rating_config.py` read "
        "pricing.json and rating.json, and `run_pipeline.py`'s quality hook reads `scripts/quality/rules.yaml` through "
        "`scripts/quality/engine.py`."),
        "",
        "## Contents",
        "",
    ]
    for rel, rs in by_file.items():
        out.append(f"- [{rel}](#{anchor(rel)}): {len(rs)} keys, {sum(1 for r in rs if r['dead'])} dead")
    out += ["- [Dead keys](#dead-keys)", ""]
    for rel, rs in by_file.items():
        out += [f"## {rel}", "", "| Key | Type | Value | Unit | Read by | For a traveller | Handbook |",
                "|---|---|---|---|---|---|---|"]
        for r in rs:
            if r["note"]:
                read = f"note for people: {clean(r['note'])}"
            elif r["bound"]:
                read = f"{r['bound']}, checked by `config_reference.py --check`"
            elif r["tests_only"]:
                read = "tests only: " + ", ".join(f"`{x}`" for x in r["tests_reading_it"])
            elif r["dead"]:
                read = "**dead**: no reader found"
            else:
                rd = r["readers"]
                parts = []
                for x in rd[:MAX_READERS]:
                    how = f" ({x['how']})" if x["how"] in ("whole block", "rows") else ""
                    parts.append(f"`{x['file']}:{x['line']}`{how}")
                more = len({(x["file"], x["line"]) for x in rd}) - len(parts)
                read = ", ".join(parts) + (f", +{more} more" if more > 0 else "")
            hb = r["handbook"]
            hb_cell = f"[{clean(hb)}](../HANDBOOK.md#{anchor(hb)})" if hb else ""
            out.append("| " + " | ".join([
                f"`{clean(r['key'])}`", r["type"], compact(r["value"]), clean(r["unit"] or ""),
                read, clean(r["effect"]), hb_cell]) + " |")
        out.append("")
    out += ["## Dead keys", "",
            ("Keys no code line and no test reads (the docs scripts do not count). They are kept, not deleted: each has a "
            "register row in `docs/owner/` for a task to wire it or remove it."), ""]
    if dead:
        out += ["| File | Key | Tests that name it |", "|---|---|---|"]
        for r in dead:
            t = ", ".join(f"`{x}`" for x in r["tests_naming_it"]) or "none"
            out.append(f"| {r['file']} | `{clean(r['key'])}` | {t} |")
    else:
        out.append("None.")
    out.append("")
    return "\n".join(out)


def doc_keys(text):
    keys, cur = set(), None
    for ln in text.splitlines():
        if ln.startswith("## ") and ln[3:].strip() not in ("Contents", "Dead keys"):
            cur = ln[3:].strip()
        elif ln.startswith("## "):
            cur = None
        elif cur and ln.startswith("| `"):
            k = ln.split("|")[1].strip().strip("`").replace("\\|", "|")
            keys.add((cur, k))
    return keys


def check():
    path = ROOT / DOC
    if not path.exists():
        print(f"FAIL: {DOC} is missing; run python -I scripts/docs/config_reference.py")
        return 1
    want = {(rel, k) for rel, ks in all_keys().items() for k, *_ in ks}
    text = path.read_text(encoding="utf-8")
    have = doc_keys(text)
    added, removed = sorted(want - have), sorted(have - want)
    for rel, k in added:
        print(f"FAIL: {rel} key {k} is not in {DOC}")
    for rel, k in removed:
        print(f"FAIL: {DOC} lists {rel} key {k}, which the config no longer has")
    if added or removed:
        print("Regenerate: python -I scripts/docs/config_reference.py")
    fails = bound_failures()
    for msg in fails:
        print(f"FAIL: {msg}")
    if added or removed or fails:
        return 1
    print(f"Config reference OK: {len(want)} keys in {len(SOURCES)} files match {DOC}")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true", help="fail when the doc's keys differ from the config")
    ap.add_argument("--json", help="also write every row as JSON to this path")
    a = ap.parse_args(argv)
    if a.check:
        return check()
    rows = build()
    (ROOT / DOC).parent.mkdir(parents=True, exist_ok=True)
    (ROOT / DOC).write_text(render(rows), encoding="utf-8")
    if a.json:
        Path(a.json).write_text(json.dumps(rows, indent=1, ensure_ascii=False), encoding="utf-8")
    dead = sum(1 for r in rows if r["dead"])
    print(f"Wrote {DOC}: {len(rows)} keys, {dead} dead")
    for msg in bound_failures():
        print(f"WARN: {msg}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
