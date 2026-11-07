"""Refuses a data blog draft that is not fit to publish (ROADMAP K14, T1178).

Tier: Scheduled

A post under content/blog/<slug>.md is refused when any of these hold:

  numbers     a number in the post (title, description, prose, table) is not in
              the data file it cites, a table cell differs from its row in that
              file, or the file's hash is not the one in `snapshot_sha256`
  snapshot    `snapshot` is not the data file's `source.generated_at`; with
              `--wire`, the wire is another snapshot or a row differs from it;
              a post that compares (what changed, new on Carta) or cites a fares
              file also needs that earlier snapshot or file, unchanged, and its
              rows must follow from it (T1174)
  copy        an em or en dash, a middot separator, an exclamation mark, a
              banned word (PRODUCT.md), or a superlative or hype word
  images      an image in the text that is not in the data file's `images`, or
              an entry with no licence on the allowed list, no credit, no alt
              text or no file
  original    fewer than 5 rows of Carta's own numbers, or no table that shows
              them (a post must add data nobody else has)
  duplicate   another post asks the same question (same type, month and year,
              or 70 percent of the same words)

Usage, from the repo root:
    python scripts/blog/check_draft.py                       # every post in content/blog
    python scripts/blog/check_draft.py content/blog/x.md --wire continent-app/public/app_data.json
Exit 0 when every post passes, 1 otherwise. `check_file` returns the problem list.
"""
from __future__ import annotations

import argparse
import glob
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
BLOG = os.path.join(ROOT, "content", "blog")

REQUIRED = ("title", "slug", "type", "question", "description", "status", "date", "data", "snapshot",
            "snapshot_sha256", "author")
STATUSES = ("draft", "published")
MIN_ROWS = 5
LICENCES = {"cc0", "cc-by", "cc-by-sa", "public-domain", "own", "pexels", "unsplash"}
BANNED = re.compile(r"\b(seamless|unlock|effortless|elevate|leverage|empower|curated|simply|just|easy)\b", re.I)
HYPE = re.compile(
    r"\b(best|cheapest|greatest|finest|top|ultimate|perfect|unmissable|incredible|amazing|stunning|"
    r"breathtaking|vibrant|nestled|must-see|number one|world'?s|ever|always|never|everyone|"
    r"hidden gems?|paradise|dream|bucket list)\b", re.I)
SEASON_TERM = re.compile(r"\bbest months?\b", re.I)  # Carta's own term (climate.best)
DASH = re.compile("[\u2013\u2014]")
MIDDOT = re.compile(r"\s[·•]\s")
# Table headers the check compares with the data file's rows, per post type.
COLUMNS = {
    "where-to-go": {"High C": "high_c", "Rain mm": "rain_mm", "Day EUR": "day_eur", "Rating": "rating"},
    "what-changed": {"Before EUR": "bed_before", "Now EUR": "bed_now", "Change pct": "change_pct",
                     "Direction": "direction"},
    "new-on-carta": {"Rating": "rating", "Day EUR": "day_eur"},
    "cheapest-week": {"Week from": "week_from", "Fare EUR": "fare_eur", "Median week EUR": "median_week_eur",
                      "Saving EUR": "saving_eur"},
}
STOP = set("a an and are at best by for from how in is it of on or the to what when where which with".split())


def parse(text):
    """(front matter dict, body) of a post; raises ValueError on a bad header."""
    lines = text.replace("\r", "").split("\n")
    if not lines or lines[0] != "---":
        raise ValueError("no front matter")
    try:
        end = lines.index("---", 1)
    except ValueError:
        raise ValueError("front matter not closed") from None
    fm = {}
    for ln in lines[1:end]:
        m = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", ln)
        if m:
            fm[m.group(1)] = m.group(2).strip()
    return fm, "\n".join(lines[end + 1:])


def snapshot_hash(obj):
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def numbers_in(text):
    return {n.replace(",", "") for n in re.findall(r"\d[\d,]*(?:\.\d+)?", text)}


def _walk(v, out):
    if isinstance(v, bool):
        return
    if isinstance(v, (int, float)):
        out.add(("%g" % v) if isinstance(v, float) else str(v))
        out.add(str(v))
    elif isinstance(v, dict):
        for x in v.values():
            _walk(x, out)
    elif isinstance(v, list):
        for x in v:
            _walk(x, out)
    elif isinstance(v, str):
        out |= numbers_in(v)


def allowed_numbers(data):
    out = set()
    _walk(data, out)
    out.add("10")  # "out of 10", the rating scale
    return out


def is_year(n):
    return re.fullmatch(r"(19|20)\d\d", n) is not None


def table_rows(body):
    """The data rows of the first Markdown table: list of cell lists."""
    rows, header = [], None
    for ln in body.split("\n"):
        s = ln.strip()
        if s.startswith("|") and s.endswith("|"):
            cells = [c.strip() for c in s.strip("|").split("|")]
            if header is None:
                header = cells
            elif not all(re.fullmatch(r":?-{3,}:?", c) for c in cells):
                rows.append(cells)
        elif header is not None:
            break
    return header, rows


def copy_problems(label, text):
    out = []
    if DASH.search(text):
        out.append(f"{label}: em or en dash")
    if MIDDOT.search(text):
        out.append(f"{label}: middot separator")
    if "!" in text.replace("![", "["):
        out.append(f"{label}: exclamation mark")
    for m in sorted({m.group(0).lower() for m in BANNED.finditer(text)}):
        out.append(f"{label}: banned word '{m}'")
    for m in sorted({m.group(0).lower() for m in HYPE.finditer(SEASON_TERM.sub("", text))}):
        out.append(f"{label}: superlative or hype word '{m}'")
    return out


def words(q):
    return {w for w in re.findall(r"[a-z0-9]+", q.lower()) if w not in STOP}


def duplicate_problems(fm, path, blog_dir):
    out = []
    mine = words(fm.get("question", ""))
    for other in sorted(glob.glob(os.path.join(blog_dir, "*.md"))):
        if os.path.abspath(other) == os.path.abspath(path) or os.path.basename(other).startswith(("_", "README")):
            continue
        try:
            ofm, _ = parse(open(other, encoding="utf-8").read())
        except (ValueError, OSError):
            continue
        name = os.path.basename(other)
        if ofm.get("slug") == fm.get("slug"):
            out.append(f"duplicate: slug already used by {name}")
        theirs = words(ofm.get("question", ""))
        if mine and theirs and len(mine & theirs) / len(mine | theirs) >= 0.7:
            out.append(f"duplicate: asks the same question as {name}")
    return out


def check_images(data, body, blog_dir, fm):
    out = []
    known = {i.get("src"): i for i in data.get("images", [])}
    for alt, src in re.findall(r"!\[([^\]]*)\]\(([^)]+)\)", body):
        if src not in known:
            out.append(f"images: '{src}' is not listed in the data file's images")
    for i in data.get("images", []):
        src = i.get("src", "?")
        if str(i.get("license", "")).lower() not in LICENCES:
            out.append(f"images: '{src}' has no licence on the allowed list")
        if not i.get("credit"):
            out.append(f"images: '{src}' has no credit")
        if not i.get("alt"):
            out.append(f"images: '{src}' has no alt text")
        local = os.path.join(blog_dir, src) if not src.startswith(("http://", "https://", "/")) else None
        if local and not os.path.exists(local):
            out.append(f"images: file '{src}' is missing")
    return out


def _cell(v):
    return ("%g" % v) if isinstance(v, float) else str(v)


def check_wire(data, wire_path, blog_dir=None):
    """Rows against the wire (and, per type, the snapshot or fares file the post cites)."""
    out = []
    with open(wire_path, encoding="utf-8") as fh:
        wire = json.load(fh)
    if wire["meta"]["generated_at"] != data["source"]["generated_at"]:
        return [f"snapshot: the wire is {wire['meta']['generated_at']}, the draft cites {data['source']['generated_at']}; regenerate"]
    sys.path.insert(0, os.path.join(ROOT, "pipeline"))
    import blog_drafts  # noqa: PLC0415
    typ = data.get("type", "where-to-go")
    for r in data["rows"]:
        d = wire["destinations"].get(r["id"])
        if typ == "where-to-go":
            w = blog_drafts.month_row(r["id"], d, data["month"]) if d else None
            keys = ("high_c", "low_c", "rain_mm", "comfort", "crowd_tier", "day_eur", "rating")
        elif typ == "what-changed":
            beds = ((d or {}).get("accommodation") or {}).get("beds") or {}
            w = {"bed_now": int(round(beds["hotel3"]))} if isinstance(beds.get("hotel3"), (int, float)) else None
            keys = ("bed_now",)
        elif typ == "new-on-carta":
            sc = ((d or {}).get("rating") or {}).get("score")
            day = blog_drafts.day_eur(d) if d else None
            w = {"rating": round(float(sc), 1), "day_eur": day} if sc is not None and day is not None else None
            keys = ("rating", "day_eur")
        else:
            w = {} if d else None
            keys = ()
        if w is None:
            out.append(f"numbers: {r['id']} has no figures in the wire")
            continue
        for k in keys:
            if w[k] != r[k]:
                out.append(f"numbers: {r['id']} {k} is {r[k]} in the draft and {w[k]} in the wire")
    out += check_inputs(data, blog_dir or BLOG)
    return out


def check_inputs(data, blog_dir):
    """The earlier snapshot or the fares file a post cites must be on disk, unchanged, and agree with its rows."""
    out = []
    typ = data.get("type")
    if typ in ("what-changed", "new-on-carta"):
        ref = data.get("source_prev") or {}
        p = os.path.join(blog_dir, ref.get("file", ""))
        try:
            prev = json.load(open(p, encoding="utf-8"))
        except (OSError, ValueError):
            return [f"snapshot: earlier snapshot {ref.get('file')} is missing or unreadable"]
        if snapshot_hash(prev["places"]) != ref.get("sha256") or prev.get("generated_at") != ref.get("generated_at"):
            out.append("snapshot: the earlier snapshot does not match the one the post cites")
        if typ == "what-changed":
            for r in data["rows"]:
                b = (prev["places"].get(r["id"]) or {}).get("bed")
                if b is None or int(round(b)) != r["bed_before"]:
                    out.append(f"numbers: {r['id']} bed_before is {r['bed_before']} in the draft and {b} in the earlier snapshot")
                elif r["bed_before"] and abs(round((r["bed_now"] - b) / b * 100, 1) - r["change_pct"]) > 0.05:
                    out.append(f"numbers: {r['id']} change_pct does not follow from its two prices")
        else:
            for r in data["rows"]:
                if r["id"] in prev["places"]:
                    out.append(f"numbers: {r['id']} is in the earlier snapshot, so it is not new")
    elif typ == "cheapest-week":
        ref = data.get("source_fares") or {}
        p = os.path.join(blog_dir, ref.get("file", ""))
        try:
            raw = open(p, "rb").read()
        except OSError:
            return [f"snapshot: fares file {ref.get('file')} is missing"]
        if hashlib.sha256(raw).hexdigest() != ref.get("sha256"):
            out.append("snapshot: the fares file does not match the hash the post cites")
        else:
            by = {}
            for f in json.loads(raw)["fares"]:
                by.setdefault(f["dest"], []).append(f)
            for r in data["rows"]:
                lows = [f["price_eur"] for f in by.get(r["id"], [])]
                if not lows or int(round(min(lows))) != r["fare_eur"]:
                    out.append(f"numbers: {r['id']} fare_eur is {r['fare_eur']} in the draft and {min(lows) if lows else None} in the fares file")
    return out


def check_file(path, wire_path=None, blog_dir=None):
    blog_dir = blog_dir or os.path.dirname(os.path.abspath(path))
    try:
        text = open(path, encoding="utf-8").read()
        fm, body = parse(text)
    except (OSError, ValueError) as e:
        return [f"header: {e}"]
    out = [f"header: missing '{k}'" for k in REQUIRED if not fm.get(k)]
    if fm.get("status") not in STATUSES:
        out.append("header: status must be draft or published")
    if out:
        return out
    dpath = os.path.join(blog_dir, fm["data"])
    try:
        data = json.load(open(dpath, encoding="utf-8"))
    except (OSError, ValueError) as e:
        return [f"numbers: data file {fm['data']} unreadable ({e})"]

    # numbers: the hash, the snapshot, the table and every figure in the text
    if snapshot_hash({"rows": data.get("rows"), "counts": data.get("counts")}) != fm["snapshot_sha256"] \
            or data.get("rows_sha256") != fm["snapshot_sha256"]:
        out.append("numbers: the data file does not match snapshot_sha256")
    if fm["snapshot"] != data.get("source", {}).get("generated_at"):
        out.append("snapshot: front matter snapshot is not the data file's source.generated_at")
    rows = data.get("rows", [])
    header, cells = table_rows(body)
    if len(rows) < MIN_ROWS or len(cells) < MIN_ROWS:
        out.append(f"original: needs a table of at least {MIN_ROWS} rows of Carta's own numbers "
                   f"(data {len(rows)}, table {len(cells)})")
    elif len(cells) != len(rows):
        out.append(f"numbers: the table has {len(cells)} rows and the data {len(rows)}")
    else:
        cols = COLUMNS.get(data.get("type"), COLUMNS["where-to-go"])
        for r, row in zip(rows, cells):
            if row[0] != r["place"]:
                out.append(f"numbers: table row '{row[0]}' is '{r['place']}' in the data")
            for h, key in cols.items():
                if h in header:
                    cell = row[header.index(h)]
                    if cell not in (str(r[key]), _cell(r[key])):
                        out.append(f"numbers: {r['place']} {h} is {cell} in the table and {r[key]} in the data")
    allowed = allowed_numbers(data)
    prose = [("title", fm["title"]), ("description", fm["description"])]
    prose += [(f"line {i + 1}", ln) for i, ln in enumerate(body.split("\n"))
              if ln.strip() and not ln.strip().startswith("|")]
    for label, line in prose:
        for n in sorted(numbers_in(line)):
            if n not in allowed and not is_year(n):
                out.append(f"numbers: {label}: {n} is not in the data file")
    if wire_path:
        out += check_wire(data, wire_path, blog_dir)
    else:
        out += check_inputs(data, blog_dir)

    # copy rules over everything a reader sees
    out += copy_problems("copy", "\n".join([fm["title"], fm["description"], fm["question"], body]))
    out += check_images(data, body, blog_dir, fm)
    out += duplicate_problems(fm, path, blog_dir)
    return sorted(set(out), key=out.index)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("files", nargs="*")
    ap.add_argument("--wire")
    args = ap.parse_args(argv)
    files = args.files or sorted(f for f in glob.glob(os.path.join(BLOG, "*.md"))
                                 if not os.path.basename(f).startswith(("_", "README")))
    bad = 0
    for f in files:
        problems = check_file(f, wire_path=args.wire)
        print(f"{'FAIL' if problems else 'ok  '} {os.path.relpath(f, ROOT)}")
        for p in problems:
            print(f"     {p}")
        bad += bool(problems)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
