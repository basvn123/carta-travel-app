"""Check and merge the translations of the hand-scored reasons (T758).

Tier: Manual (after each translation shard)

The 1,570 hand scores in app_data/curated_appeal.json carry one English
`why`. Rating v5 shows a reason in six languages for every place, so the
English notes are translated in four translation-only shards
(data/rating/translate/shard_XX.json -> out_XX/part_*.json).

Checks per shard: every input id exactly once, five languages present and
non-empty, at most 25 words each, no em dash. With --write, merges all four
shards into app_data/curated_why_i18n.json ({id: {en, nl, de, fr, es, it}});
curated_appeal.json itself is left as it is.

Usage:
    python check_why_translations.py 02
    python check_why_translations.py --all --write
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "data" / "rating" / "translate"
OUT = ROOT / "app_data" / "curated_why_i18n.json"
N_SHARDS = 4
LANGS = ("nl", "de", "fr", "es", "it")
MAX_WORDS = 25
EM_DASH = "—"


def check(shard):
    src = json.loads((DIR / f"shard_{shard:02d}.json").read_text(encoding="utf-8"))
    rows = []
    for p in sorted((DIR / f"out_{shard:02d}").glob("part_*.json")):
        rows += json.loads(p.read_text(encoding="utf-8"))
    problems = []
    want = [r["id"] for r in src]
    got = [r.get("id") for r in rows]
    missing = sorted(set(want) - set(got))
    extra = sorted(set(got) - set(want))
    dup = sorted({i for i in got if got.count(i) > 1})
    if missing:
        problems.append(f"{len(missing)} ids not translated: {missing[:10]}")
    if extra:
        problems.append(f"ids not in the shard: {extra[:10]}")
    if dup:
        problems.append(f"ids translated more than once: {dup[:10]}")
    for r in rows:
        for lang in LANGS:
            t = r.get(lang)
            if not isinstance(t, str) or not t.strip():
                problems.append(f"{r.get('id')}: {lang} missing")
            elif len(t.split()) > MAX_WORDS:
                problems.append(f"{r.get('id')}: {lang} has {len(t.split())} words")
            elif EM_DASH in t:
                problems.append(f"{r.get('id')}: {lang} has an em dash")
    en = {r["id"]: r["en"] for r in src}
    merged = {r["id"]: dict({"en": en[r["id"]]}, **{k: r[k] for k in LANGS})
              for r in rows if r.get("id") in en}
    return problems, merged


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("shard", nargs="?", type=int)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()
    shards = range(1, N_SHARDS + 1) if args.all else [args.shard]
    failed, merged = 0, {}
    for s in shards:
        problems, rows = check(s)
        print(f"translate shard_{s:02d}: {'FAIL' if problems else 'pass'}  {len(rows)} rows")
        for p in problems[:40]:
            print("   ", p)
        failed += bool(problems)
        merged.update(rows)
    if args.write:
        if failed:
            print(f"{failed} shard(s) fail: not writing {OUT.name}")
        else:
            OUT.write_text(json.dumps(merged, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                           encoding="utf-8")
            print(f"{len(merged)} reasons in six languages -> {OUT.relative_to(ROOT)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
