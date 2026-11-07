"""Back-translation check on the T1170 machine-drafted strings (T1196, ROADMAP D23 and I8).

Before a native speaker reads the drafted nl, de, fr, es and it strings, every
one goes through four steps, so the native review starts with the worst:

1. Deterministic checks on every string (stdlib): the same {placeholders} as
   English (none invented, none dropped unless an older translation already
   dropped it), digits kept, not left in English, length 0.4 to 2.8 times the
   English, no em or en dash, not empty.
2. A blind back-translation into English. A separate pass sees only the target
   strings under opaque ids (never the English, never the key) and translates
   literally (`prompts` writes its files; a session or Gemini answers them).
3. chrF++ (character n-grams to 6, word n-grams to 2, beta 2; the sacrebleu
   definition) between the back-translation and the English, ranked inside
   each language. A string is flagged when a check fails, when its chrF++ is
   under CHRF_MIN or in the bottom FLAG_SHARE of its language, or when it is
   3 words or shorter or holds a placeholder (chrF is noise there).
4. The judge (prompt judge-text, kind translation) on every flagged string
   plus a seeded control share of the unflagged ones (`judge-items`). A string
   holds when its checks pass and the judge marks it supported, or, unflagged
   and not in the control, when its round trip passes.

Research and reasons: Execution/P15/T1196-texts-validation.md.

    python -I scripts/validation/texts_backtranslation.py keys          # once: the drafted keys from the T1170 commit
    python -I scripts/validation/texts_backtranslation.py prompts --out DIR
    python -I scripts/validation/texts_backtranslation.py judge-items --back FILE... --out FILE
    python -I scripts/validation/texts_backtranslation.py score --back FILE... [--verdicts FILE]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

APP = ROOT / "continent-app"
OUT_DIR = ROOT / "data" / "reports" / "validation" / "texts"
KEYS_PATH = OUT_DIR / "drafted_keys.json"
LANGS = ("nl", "de", "fr", "es", "it")
LANG_NAMES = {"nl": "Dutch", "de": "German", "fr": "French", "es": "Spanish", "it": "Italian"}
T1170_COMMIT = "f2edad347d"
SEED = "t1196-bt"
CHRF_MIN = 45.0
FLAG_SHARE = 0.15
CONTROL_SHARE = 0.05
BATCH = 170
PLACEHOLDER = re.compile(r"\{(\w+)\}")
DIGITS = re.compile(r"\d+")
DASHES = ("\u2013", "\u2014")
THOUSANDS = re.compile(r"(?<=\d)[.,\u00a0\u202f ](?=\d{3}(?!\d))")
# A failed hard check fails the string outright; a soft one only sends it to the judge.
HARD_CHECKS = ("empty", "placeholder_invented", "placeholder_dropped", "digits_changed", "dash")


def h(s: str) -> str:
    return hashlib.sha1(f"{SEED}:{s}".encode()).hexdigest()


# ---- chrF++ (sacrebleu's definition, sentence level) ----

def _char_ngrams(s: str, n: int) -> Counter:
    s = s.replace(" ", "")
    return Counter(s[i:i + n] for i in range(len(s) - n + 1))


def _word_ngrams(words: list, n: int) -> Counter:
    return Counter(tuple(words[i:i + n]) for i in range(len(words) - n + 1))


def _words(s: str) -> list:
    """sacrebleu chrF++ word split: punctuation at a word's end or start is its own token."""
    out = []
    for w in s.split():
        if len(w) > 1 and not w[-1].isalnum():
            out += [w[:-1], w[-1]]
        elif len(w) > 1 and not w[0].isalnum():
            out += [w[0], w[1:]]
        else:
            out.append(w)
    return out


def chrf(hyp: str, ref: str, char_order: int = 6, word_order: int = 2, beta: float = 2.0) -> float:
    """chrF++ in 0..100 of one hypothesis against one reference (lower-cased).
    The average of the per-order F-scores (sacrebleu's eps smoothing aside)."""
    hyp, ref = (hyp or "").lower().strip(), (ref or "").lower().strip()
    if not hyp or not ref:
        return 0.0
    stats = []
    for n in range(1, char_order + 1):
        stats.append((_char_ngrams(hyp, n), _char_ngrams(ref, n)))
    hw, rw = _words(hyp), _words(ref)
    for n in range(1, word_order + 1):
        stats.append((_word_ngrams(hw, n), _word_ngrams(rw, n)))
    precs, recs = [], []
    for hc, rc in stats:
        th, tr = sum(hc.values()), sum(rc.values())
        if not th or not tr:
            continue
        m = sum((hc & rc).values())
        precs.append(m / th)
        recs.append(m / tr)
    if not precs:
        return 0.0
    p, r = sum(precs) / len(precs), sum(recs) / len(recs)
    if p + r == 0:
        return 0.0
    b2 = beta * beta
    return round(100 * (1 + b2) * p * r / (b2 * p + r), 2)


# ---- catalogues ----

def catalogues(langs=("en",) + LANGS) -> dict:
    """Every catalogue as a dict, read by node (the files are ES modules)."""
    js = ("const out={};for(const l of " + json.dumps(list(langs))
          + "){const m=await import('./src/i18n/'+l+'.js');out[l]=m[l]||m.default}"
          + "process.stdout.write(JSON.stringify(out))")
    res = subprocess.run(["node", "--input-type=module", "-e", js], cwd=APP, capture_output=True, text=True,
                         encoding="utf-8", check=True)
    return json.loads(res.stdout)


def drafted_keys_from_git(commit=T1170_COMMIT) -> dict:
    out = {}
    for lang in LANGS:
        diff = subprocess.run(["git", "show", commit, "--", f"continent-app/src/i18n/{lang}.js"], cwd=ROOT,
                              capture_output=True, text=True, encoding="utf-8", check=True).stdout
        out[lang] = [m.group(1) for m in re.finditer(r'^\+\s+"([^"]+)":', diff, re.MULTILINE)]
    return out


def drafted(keys=None, cats=None) -> dict:
    """{lang: {key: {"en": ..., "target": ...}}} for every drafted key still in both catalogues."""
    keys = keys or json.loads(KEYS_PATH.read_text(encoding="utf-8"))["keys"]
    cats = cats or catalogues()
    out = {}
    for lang in LANGS:
        out[lang] = {k: {"en": cats["en"][k], "target": cats[lang][k]}
                     for k in keys.get(lang, []) if k in cats["en"] and k in cats[lang]}
    return out


# ---- step 1: deterministic checks ----

def checks(en: str, target: str) -> list:
    """The names of the checks a drafted string fails."""
    bad = []
    en, target = en if isinstance(en, str) else "", target if isinstance(target, str) else ""
    if not target.strip():
        return ["empty"]
    pe, pt = set(PLACEHOLDER.findall(en)), set(PLACEHOLDER.findall(target))
    if pt - pe:
        bad.append("placeholder_invented")
    if pe - pt:
        bad.append("placeholder_dropped")
    if sorted(DIGITS.findall(THOUSANDS.sub("", en))) != sorted(DIGITS.findall(THOUSANDS.sub("", target))):
        bad.append("digits_changed")
    letters = re.sub(r"\{\w+\}|[^A-Za-z]", "", en)
    if target.strip() == en.strip() and len(letters) >= 12 and len(en.split()) >= 3:
        bad.append("left_in_english")
    le, lt = len(PLACEHOLDER.sub("x", en)), len(PLACEHOLDER.sub("x", target))
    if le >= 15 and not (0.4 <= lt / le <= 2.8):
        bad.append("length_ratio")
    if any(d in target for d in DASHES):
        bad.append("dash")
    return bad


# ---- step 2: blind back-translation prompts ----

def opaque_ids(strings: dict) -> dict:
    """{lang: {opaque_id: key}}: ids that give nothing away (not the key, not the English)."""
    out = {}
    for lang, rows in strings.items():
        keys = sorted(rows, key=lambda k: h(f"{lang}:{k}"))
        out[lang] = {f"{lang}-{i:04d}": k for i, k in enumerate(keys, 1)}
    return out


BT_PROMPT = "backtranslate"


def _bt_prompt():
    from pipeline.prompt_registry import prompt
    return prompt(BT_PROMPT)


def write_prompts(out_dir: Path, strings=None, batch=BATCH) -> dict:
    strings = strings or drafted()
    ids = opaque_ids(strings)
    out_dir.mkdir(parents=True, exist_ok=True)
    p = _bt_prompt()
    files = []
    for lang in LANGS:
        rows = list(ids[lang].items())
        for b in range(0, len(rows), batch):
            part = {oid: strings[lang][k]["target"] for oid, k in rows[b:b + batch]}
            f = out_dir / f"bt-{lang}-{b // batch + 1:02d}.txt"
            f.write_text(p.text("blind", lang=LANG_NAMES[lang], body=json.dumps(part, ensure_ascii=False, indent=0)),
                         encoding="utf-8")
            files.append(f.name)
    manifest = {"task": "T1196", "prompt": p.id, "prompt_version": p.version, "langs": list(LANGS), "files": files, "ids": ids,
                "counts": {lang: len(ids[lang]) for lang in LANGS}}
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    return manifest


def read_back(paths, manifest) -> dict:
    """{lang: {key: back_translation}} from one or more answer files keyed by opaque id."""
    rev = {oid: (lang, k) for lang, m in manifest["ids"].items() for oid, k in m.items()}
    out = {lang: {} for lang in LANGS}
    for p in paths:
        blob = json.loads(Path(p).read_text(encoding="utf-8"))
        blob = blob.get("back") or blob if isinstance(blob, dict) else {}
        for oid, text in blob.items():
            if oid in rev and isinstance(text, str):
                lang, k = rev[oid]
                out[lang][k] = text
    return out


# ---- step 3: rank and flag ----

def is_short(en: str) -> bool:
    return len(PLACEHOLDER.sub("", en).split()) <= 3


def score_rows(strings, back) -> dict:
    """{lang: [row]}: checks, chrF++ and the flag for every drafted string."""
    out = {}
    for lang in LANGS:
        rows = []
        for k, s in strings[lang].items():
            b = back.get(lang, {}).get(k)
            rows.append({"key": k, "en": s["en"], "target": s["target"], "back": b,
                         "checks": checks(s["en"], s["target"]),
                         "chrf": chrf(b, s["en"]) if b is not None else None})
        scored = sorted(r["chrf"] for r in rows if r["chrf"] is not None)
        cut = scored[int(len(scored) * FLAG_SHARE)] if scored else None
        for r in rows:
            why = []
            if r["checks"]:
                why.append("checks")
            if r["chrf"] is None:
                why.append("no_back_translation")
            elif r["chrf"] < CHRF_MIN:
                why.append("chrf_low")
            elif cut is not None and r["chrf"] < cut:
                why.append("chrf_bottom_share")
            if is_short(r["en"]):
                why.append("short")
            if PLACEHOLDER.search(r["en"]):
                why.append("placeholder")
            r["flag"] = why
            r["control"] = (not why) and int(h(f"control:{lang}:{r['key']}")[:8], 16) / 0xFFFFFFFF < CONTROL_SHARE
        out[lang] = rows
    return out


def judge_items(rows_by_lang) -> list:
    """judge-text items (kind translation) for the flagged and the control strings."""
    items = []
    for lang, rows in rows_by_lang.items():
        for r in rows:
            if r["flag"] or r["control"]:
                items.append({"text_id": f"{lang}:{r['key']}", "kind": "translation",
                              "subject": f"{LANG_NAMES[lang]} interface string", "lang": lang,
                              "text": r["target"], "source": {"lang": "en", "text": r["en"]}})
    return items


# ---- step 4 for a session: batched judge prompts and the merged verdicts file ----

JUDGE_BATCH = 100


def write_judge_prompts(items, out_dir: Path, batch=JUDGE_BATCH) -> dict:
    """The judge-text rubric and its translation rule once per batch of items
    (the same prompt as one file per item, batched so a session can judge
    thousands of short strings). Ids stay opaque to nothing: the judge sees the
    English, as the rubric requires."""
    from pipeline.judge import core
    p, bp = core.judge_prompt(), _bt_prompt()
    out_dir.mkdir(parents=True, exist_ok=True)
    files = []
    for b in range(0, len(items), batch):
        part = {it["text_id"]: {"text": it["text"], "source": it["source"]["text"]} for it in items[b:b + batch]}
        f = out_dir / f"jt-{b // batch + 1:03d}.txt"
        f.write_text(bp.text("judge_batch", rubric=p.text("rubric").strip(), rule=p.text("source.translation").strip(),
                             body=json.dumps(part, ensure_ascii=False, indent=0)), encoding="utf-8")
        files.append(f.name)
    man = {"task": "T1196", "prompt": p.id, "prompt_version": p.version, "prompt_sha": core.prompt_sha(p),
           "batch": batch, "files": files, "ids": [it["text_id"] for it in items]}
    (out_dir.parent / f"{out_dir.name}-manifest.json").write_text(json.dumps(man, indent=1), encoding="utf-8")
    return man


def merge_verdicts(paths, manifest, model, out):
    """One carta-judge-verdicts/1 file (backend session) from the batch answers."""
    from pipeline.judge import core
    vs = {}
    for p in paths:
        blob = json.loads(Path(p).read_text(encoding="utf-8"))
        vs.update(blob.get("verdicts") or blob)
    vs = {k: v for k, v in vs.items() if k in set(manifest["ids"])}
    missing = [i for i in manifest["ids"] if not core.normalise_verdict(vs.get(i))]
    doc = core.verdicts_file("session", model, vs, "T1196 back-translation flagged and control strings (batched)")
    core.write_json(out, doc)
    return len(vs), missing


# ---- step 4: verdicts and the result ----

def wilson(k, n, z=1.959963984540054):
    if not n:
        return None, None
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    m = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5) / d
    return round(max(0.0, c - m), 4), round(min(1.0, c + m), 4)


TRAVELLER_FACING_SKIP = ("admin.",)


def result(rows_by_lang, verdicts=None, worst_n=15) -> dict:
    verdicts = verdicts or {}
    langs, worst = {}, []
    for lang, rows in rows_by_lang.items():
        judged = flagged = failed_checks = control_n = control_ok = 0
        for r in rows:
            v = (verdicts.get(f"{lang}:{r['key']}") or {})
            r["verdict"] = v.get("verdict")
            r["reason"] = v.get("reason")
            r["claims"] = [c for c in v.get("claims") or [] if c.get("verdict") != "supported"][:3]
            if r["flag"]:
                flagged += 1
            if set(r["checks"]) & set(HARD_CHECKS):
                failed_checks += 1
            if r["verdict"]:
                judged += 1
            if r["control"] and r["verdict"]:
                control_n += 1
                control_ok += r["verdict"] == "supported"
            if set(r["checks"]) & set(HARD_CHECKS):
                r["holds"] = False
            elif r["flag"] or r["control"]:
                r["holds"] = (r["verdict"] == "supported") if r["verdict"] else None
            else:
                r["holds"] = True
        known = [r for r in rows if r["holds"] is not None]
        k = sum(r["holds"] for r in known)
        lo, hi = wilson(k, len(known))
        tf = [r for r in known if not r["key"].startswith(TRAVELLER_FACING_SKIP)]
        ktf = sum(r["holds"] for r in tf)
        chrfs = sorted(r["chrf"] for r in rows if r["chrf"] is not None)
        langs[lang] = {
            "strings": len(rows), "back_translated": len(chrfs), "flagged": flagged, "failed_checks": failed_checks,
            "judged": judged, "holds": {"k": k, "n": len(known), "value": round(k / len(known), 4) if known else None,
                                        "low": lo, "high": hi},
            "holds_traveller_facing": {"k": ktf, "n": len(tf), "value": round(ktf / len(tf), 4) if tf else None},
            "control": {"n": control_n, "supported": control_ok},
            "chrf_median": chrfs[len(chrfs) // 2] if chrfs else None,
            "checks": dict(Counter(c for r in rows for c in r["checks"])),
            "verdicts": dict(Counter(r["verdict"] for r in rows if r["verdict"])),
        }
        sev = {"contradicted": 0, "unsupported": 1}
        bad = [r for r in rows if r["holds"] is False]
        bad.sort(key=lambda r: (r["key"].startswith(TRAVELLER_FACING_SKIP), sev.get(r["verdict"], 2),
                                r["chrf"] if r["chrf"] is not None else 0))
        worst += [{"lang": lang, **{x: r[x] for x in ("key", "en", "target", "back", "chrf", "checks", "verdict",
                                                       "reason", "claims")}} for r in bad[:worst_n]]
    tot_k = sum(v["holds"]["k"] for v in langs.values())
    tot_n = sum(v["holds"]["n"] for v in langs.values())
    lo, hi = wilson(tot_k, tot_n)
    return {"schema": "carta-backtranslation/1", "task": "T1196", "provisional": True,
            "why_provisional": "the judge counts only once calibrated on the owner's labels (T1144-b, T1188-a), "
                               "and the native review (T1170-a) is the real check",
            "method": {"chrf": "chrF++ char 6 word 2 beta 2", "chrf_min": CHRF_MIN, "flag_share": FLAG_SHARE,
                       "control_share": CONTROL_SHARE},
            "strings": sum(v["strings"] for v in langs.values()),
            "holds": {"k": tot_k, "n": tot_n, "value": round(tot_k / tot_n, 4) if tot_n else None, "low": lo, "high": hi},
            "langs": langs, "worst": worst}


def write_md(res, path):
    L = ["# Back-translation check of the T1170 drafted strings (T1196, ROADMAP D23 and I8)", "",
         f"PROVISIONAL: {res['why_provisional']}.", "",
         (f"{res['strings']} drafted strings. Holds: {res['holds']['k']} of {res['holds']['n']} "
          f"({res['holds']['value']:.1%}, 95% {res['holds']['low']:.1%} to {res['holds']['high']:.1%})."), "",
         "| Language | Strings | Back-translated | Flagged | Failed checks | Judged | Holds | Holds, traveller-facing | Control supported | chrF++ median |",
         "|---|---|---|---|---|---|---|---|---|---|"]
    for lang, v in res["langs"].items():
        hv, tf = v["holds"], v["holds_traveller_facing"]
        L.append(f"| {lang} | {v['strings']} | {v['back_translated']} | {v['flagged']} | {v['failed_checks']} | {v['judged']} "
                 f"| {hv['k']} of {hv['n']} ({hv['value']:.1%}) | {tf['k']} of {tf['n']} ({tf['value']:.1%}) "
                 f"| {v['control']['supported']} of {v['control']['n']} | {v['chrf_median']} |")
    L += ["", "## Worst cases per language (traveller-facing first)", ""]
    for w in res["worst"]:
        what = ", ".join(w["checks"]) if w["checks"] else w["verdict"]
        L.append(f"- {w['lang']} `{w['key']}` ({what}, chrF++ {w['chrf']}): EN \"{w['en']}\" / {w['lang']} \"{w['target']}\" "
                 f"/ back \"{w['back']}\". {w['reason'] or ''}")
    Path(path).write_text("\n".join(L) + "\n", encoding="utf-8")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    k = sub.add_parser("keys")
    k.add_argument("--commit", default=T1170_COMMIT)
    p = sub.add_parser("prompts")
    p.add_argument("--out", required=True)
    for name in ("judge-items", "score"):
        s = sub.add_parser(name)
        s.add_argument("--back", nargs="+", required=True)
        s.add_argument("--manifest", required=True)
        s.add_argument("--out", default=None)
        if name == "score":
            s.add_argument("--verdicts", default=None)
            s.add_argument("--date", default=None)
    jp = sub.add_parser("judge-prompts")
    jp.add_argument("--items", required=True)
    jp.add_argument("--out", required=True)
    mg = sub.add_parser("merge-verdicts")
    mg.add_argument("--answers", nargs="+", required=True)
    mg.add_argument("--manifest", required=True)
    mg.add_argument("--model", default="claude-code-session")
    mg.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    if a.cmd == "judge-prompts":
        items = json.loads(Path(a.items).read_text(encoding="utf-8"))["items"]
        m = write_judge_prompts(items, Path(a.out))
        print(json.dumps({"files": len(m["files"]), "items": len(m["ids"])}))
        return 0
    if a.cmd == "merge-verdicts":
        n, missing = merge_verdicts(a.answers, json.loads(Path(a.manifest).read_text(encoding="utf-8")), a.model, a.out)
        print(json.dumps({"verdicts": n, "missing": len(missing), "first_missing": missing[:10]}))
        return 1 if missing else 0
    if a.cmd == "keys":
        keys = drafted_keys_from_git(a.commit)
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        KEYS_PATH.write_text(json.dumps({"task": "T1196", "from_commit": a.commit,
                                         "note": "the keys T1170 added to each catalogue (machine-drafted)",
                                         "counts": {lang: len(v) for lang, v in keys.items()}, "keys": keys},
                                        ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(json.dumps({lang: len(v) for lang, v in keys.items()}))
        return 0
    if a.cmd == "prompts":
        m = write_prompts(Path(a.out))
        print(json.dumps({"files": len(m["files"]), "counts": m["counts"]}))
        return 0
    manifest = json.loads(Path(a.manifest).read_text(encoding="utf-8"))
    strings = drafted()
    rows = score_rows(strings, read_back(a.back, manifest))
    if a.cmd == "judge-items":
        items = judge_items(rows)
        Path(a.out).write_text(json.dumps({"version": "carta-texts-bt-items/1", "n": len(items), "items": items},
                                          ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(json.dumps({"items": len(items)}))
        return 0
    verdicts = {}
    if a.verdicts:
        from pipeline.judge import core
        verdicts = core.read_verdicts(a.verdicts)["verdicts"]
    res = result(rows, verdicts)
    out = Path(a.out or OUT_DIR)
    out.mkdir(parents=True, exist_ok=True)
    date = a.date or __import__("datetime").date.today().isoformat()
    (out / f"backtranslation-{date}.json").write_text(json.dumps(res, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    full = {lang: [{x: r[x] for x in ("key", "chrf", "checks", "flag", "control", "verdict", "holds", "back")} for r in rs]
            for lang, rs in rows.items()}
    (out / f"backtranslation-rows-{date}.json").write_text(json.dumps(full, ensure_ascii=False) + "\n", encoding="utf-8")
    write_md(res, out / f"backtranslation-{date}.md")
    print(json.dumps({"holds": res["holds"], **{lang: v["holds"]["value"] for lang, v in res["langs"].items()}}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
