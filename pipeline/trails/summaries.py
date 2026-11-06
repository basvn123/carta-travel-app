"""Trail summaries written from each trail's own facts (ROADMAP D24, T1179).

Tier: Pipeline step (offline, no lab, no network)

Most published walks reach the traveller as a line on a map and a row of
figures: 17,161 of the 17,619 rated rows on the 2026-09-13 wire carry no
summary at all, and the 458 that do carry the retired describe.py lead
("Based on its distance and ascent, the route is classified as easy" on a
walk with 1,949 m of climb). This step writes two to four short sentences per
walk from the fields the wire already holds, and nothing else:

    length, climb (read uphill, the app's trailClimb rule), walking time,
    days on foot (difficulty.py), route shape, start and end (the OSM from
    and to tags), the stage it belongs to, the highest point, the ground
    underfoot (surface shares, the mapped SAC scale), named sights along
    the line, towns it passes, and the snow-free season estimate.

Templates, not a model. The facts read well enough in plain sentences, so
there is no Gemini batch and never a Claude API call (CLAUDE.md).

Every summary passes check() before it is written:

  fact match   a closed vocabulary. Each word of the text is a template word,
               a month, a unit, a number the facts hold, or a name the facts
               hold. An invented place, a wrong figure or a season month the
               row does not carry fails the row.
  consistency  "loop" only for a loop whose start and end heights agree,
               "out and back" only for one, "days" only for a multi-day walk,
               the months exactly the season's.
  house rules  no em or en dash, no spaced hyphen, no middle dot or bullet,
               none of PRODUCT.md's banned words, no superlatives, a full
               stop at the end, MIN_CHARS to MAX_CHARS characters.

A row that fails is not written; the report says why. The output is a
sidecar (data/trails/summaries.json) and does not touch the wire: the app
shows `summary` as English prose on the trail page and in the planner, so
putting it on the wire is a traveller facing change with an i18n decision
behind it (T1179-a). Each summary also carries `parts`, the clause codes and
their values, so the app can render the same sentences through t() in all
six languages instead of shipping the English.

    python pipeline/trails/summaries.py                 # top band, all countries
    python pipeline/trails/summaries.py --all           # every rated walk
    python pipeline/trails/summaries.py --country AT --print 5

Pure functions above the CLI: facts_of(), compose(), check(). No imports
outside the standard library and the two sibling modules.

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import difficulty  # noqa: E402
import names  # noqa: E402

ROOT = HERE.parents[1]
WIRE_DIR = ROOT / "continent-app" / "public" / "trails"
OUT_PATH = ROOT / "data" / "trails" / "summaries.json"
REPORT_PATH = ROOT / "data" / "reports" / "trails_summaries.json"

# The top band: the two highest v5 bands (nature_tiers.py: top 3%
# Exceptional, next 9% Excellent). On the 2026-09-13 wire that is 2,089 rows;
# ROADMAP D24 says 2,348, a count this wire does not reproduce (T1179 report).
TOP_BANDS = ("exceptional", "excellent")

MIN_CHARS = 40
MAX_CHARS = 320
MAX_SIGHTS = 3
MAX_PASSES = 2
NAME_MAX = 40

# trailStory.js DOWNHILL_MIN_M: a line stored downhill is read uphill, so the
# climb a summary states is the climb the card and the page print.
DOWNHILL_MIN_M = 300
# A loop is claimed only when its two ends sit at about the same height. The
# OSM roundtrip tag says loop on lines that end 260 m lower than they start.
LOOP_END_TOLERANCE_M = 100
# A peak this far above the route's highest point is beside the path, not on it.
PEAK_ON_ROUTE_M = 30
# How close a passed town has to be to be named.
PASSES_MAX_M = 500
# Surface shares that make "mostly on ..." true.
MOSTLY = 0.5

MONTHS = {
    "jan": "January", "feb": "February", "mar": "March", "apr": "April",
    "may": "May", "jun": "June", "jul": "July", "aug": "August",
    "sep": "September", "oct": "October", "nov": "November", "dec": "December",
}

# Sight kinds: the noun the sentence uses, and how much a walker cares. Higher
# first; a kind not listed is not named.
SIGHT_KINDS = {
    "waterfall": ("waterfall", 9), "gorge": ("gorge", 9),
    "glacier": ("glacier", 9), "volcano": ("volcano", 9),
    "peak": ("peak", 8), "castle": ("castle", 8),
    "lake": ("lake", 7), "monastery": ("monastery", 7),
    "arch": ("rock arch", 7), "lighthouse": ("lighthouse", 7),
    "hot_spring": ("hot spring", 6), "ruins": ("ruin", 6),
    "cave": ("cave", 5), "beach": ("beach", 5), "hut": ("hut", 4),
    "viewpoint": ("viewpoint", 3),
}
PLURAL = {"rock arch": "rock arches", "hot spring": "hot springs",
          "beach": "beaches", "volcano": "volcanoes",
          "monastery": "monasteries"}

SAC_MOUNTAIN = {"demanding_mountain_hiking", "alpine_hiking",
                "demanding_alpine_hiking", "difficult_alpine_hiking"}
SAC_MOUNTAIN_SHARE = 0.05

BANNED = {"seamless", "unlock", "effortless", "elevate", "leverage",
          "empower", "curated", "simply", "just", "easy",
          # superlatives and brochure words: a summary states, it does not sell
          "best", "most", "stunning", "breathtaking", "spectacular",
          "amazing", "beautiful", "perfect", "ultimate", "famous",
          "hidden", "gem", "must"}

DASH_RE = re.compile(r"[\u2012\u2013\u2014\u2015\u2212]|\s-\s|\s-$|^-\s")
SEPARATOR_RE = re.compile(r"[\u00b7\u2022\u2027\u2219]")

# Every word a template can write. check() refuses any other word that is not
# a fact's name, a month or a number.
TEMPLATE_WORDS = set("""
a an the of and to from with on at in it its
km m h min
loop out back walk walking way on foot about day days
climbing stage tops reaches
mostly footpaths paths tracks paved roads steep mountain path places some runs has
past near close passes goes through above below over
usually clear snow walkable all year
""".split()) | {w for noun, _ in SIGHT_KINDS.values() for w in noun.split()} \
    | {w for p in PLURAL.values() for w in p.split()} \
    | {"peaks", "waterfalls", "gorges", "glaciers", "volcanoes", "castles",
       "lakes", "monasteries", "lighthouses", "ruins", "caves", "huts",
       "viewpoints"}


# ---------------------------------------------------------------------------
# Small formatting, one place
# ---------------------------------------------------------------------------

def km_text(distance_m):
    """16419 -> "16.4", 5000 -> "5". One decimal, the app's kmText."""
    s = f"{float(distance_m) / 1000:.1f}"
    return s.removesuffix(".0")


def article(number_text):
    """"an" before a figure spoken with a vowel sound: 8, 11, 18, 80 to 89,
    800 to 899 and so on; "a" otherwise."""
    head = number_text.split(".")[0].replace(",", "")
    return "an" if head.startswith("8") or head in ("11", "18") else "a"


def int_text(n):
    """1544.3 -> "1,544"."""
    return f"{int(round(float(n))):,}"


def clock_text(minutes):
    """The app's clock(): 470 -> "7 h 50 min", 45 -> "45 min"."""
    r = int(round(float(minutes)))
    if r < 60:
        return f"{r} min"
    h, rest = divmod(r, 60)
    return f"{h} h {rest:02d} min" if rest else f"{h} h"


def fold(text):
    s = unicodedata.normalize("NFKD", str(text or "").lower())
    return "".join(c for c in s if not unicodedata.combining(c)).strip()


def clean_name(raw, country=None):
    """A name a summary may print, or None. Readable (transliterated), at
    most NAME_MAX characters, no dash of any kind used as punctuation, and
    something more than a code or a bare number."""
    if not raw:
        return None
    s = names.readable(str(raw).strip(), country)
    s = re.sub(r"\s+", " ", s or "").strip(" ,;:.")
    if not s or len(s) > NAME_MAX:
        return None
    if DASH_RE.search(s) or SEPARATOR_RE.search(s):
        return None
    if not any(c.isalpha() for c in s) or names.is_code(s):
        return None
    if re.search(r"[()\[\]{}\"/;|<>]", s):
        return None
    return s


def sight_name(raw, country=None):
    """A sight's name, stricter than a place's: no digits. A digit in a sight
    name is a navigation light's character ("Gale Warning Burgau Iso Y 2s"),
    a survey point or a counter, never what a walker would call it."""
    s = clean_name(raw, country)
    return None if s is None or re.search(r"\d", s) else s


# ---------------------------------------------------------------------------
# Facts
# ---------------------------------------------------------------------------

def climb_up(row):
    """(up, down): the stored climb, read uphill when the line is stored
    downhill. trailStory.js trailClimb, same rule and same threshold."""
    asc, desc = row.get("ascent_m"), row.get("descent_m")
    if asc is not None and desc is not None \
            and desc - asc >= DOWNHILL_MIN_M and desc >= 2 * asc:
        return desc, asc
    return asc, desc


def shape_of(row):
    """"loop", "out_back", "one_way" or None when the facts disagree."""
    f = row.get("f") or {}
    rt = f.get("rt")
    ele = row.get("ele") or {}
    start, end = ele.get("start"), ele.get("end")
    ends_agree = start is None or end is None \
        or abs(float(start) - float(end)) <= LOOP_END_TOLERANCE_M
    if rt in ("loop", "figure8") and row.get("is_loop"):
        return "loop" if ends_agree else None
    if rt == "out_back":
        return "out_back" if ends_agree else None
    if rt == "point" and row.get("is_loop") is False:
        return "one_way"
    return None


def sights_of(detail, top_m, country, taken):
    """Named sights along the line, the most worth naming first, then put in
    walking order. [(kind, noun, name, ele_or_None, beside)]"""
    seen, out = set(taken), []
    for h in detail.get("highlights") or []:
        kind = h.get("kind")
        if kind not in SIGHT_KINDS:
            continue
        name = sight_name(h.get("name"), country)
        if not name or fold(name) in seen:
            continue
        seen.add(fold(name))
        ele = h.get("ele_m")
        ele = int(round(float(ele))) if ele is not None and kind == "peak" else None
        beside = bool(ele is not None and top_m is not None
                      and ele > top_m + PEAK_ON_ROUTE_M)
        weight = SIGHT_KINDS[kind][1] + (ele or 0) / 10000.0
        out.append((weight, h.get("along_m") or 0,
                    (kind, SIGHT_KINDS[kind][0], name, ele, beside)))
    best = sorted(out, key=lambda x: (-x[0], x[1]))[:MAX_SIGHTS]
    return [s for _, _, s in sorted(best, key=lambda x: x[1])]


def facts_of(row, detail=None):
    """Everything a summary may say about one walk, as plain values. A key is
    present only when the wire holds the fact."""
    detail = detail or {}
    cc = row.get("country")
    facts = {"id": row.get("id"), "country": cc}
    if row.get("distance_m"):
        facts["km"] = km_text(row["distance_m"])
    up, _down = climb_up(row)
    if up is not None and up >= 10:
        facts["climb_m"] = int(round(float(up)))
    if row.get("duration_min"):
        facts["minutes"] = int(round(float(row["duration_min"])))
    if row.get("distance_m"):
        days = difficulty.day_effort(row)["days"]
        if difficulty.is_long(days):
            facts["days"] = days
    shape = shape_of(row)
    if shape:
        facts["shape"] = shape

    tags = detail.get("tags_raw") or {}
    if shape == "one_way":
        a, b = clean_name(tags.get("from"), cc), clean_name(tags.get("to"), cc)
        if a and b and fold(a) != fold(b):
            facts["from"], facts["to"] = a, b

    h = row.get("h") or {}
    if h.get("cls") == "stage" and h.get("of") and isinstance(h.get("i"), int):
        of = clean_name(h["of"], cc)
        if of:
            facts["stage"] = {"i": h["i"], "of": of}

    ele = row.get("ele") or {}
    top = ele.get("max")
    top_m = int(round(float(top))) if top is not None else None
    if top_m is not None and top_m >= 1:
        facts["top_m"] = top_m

    sf = row.get("sf") or {}
    gp = detail.get("grade_parts") or {}
    if sf.get("path") is not None and sf["path"] >= MOSTLY:
        facts["ground"] = "path"
    elif sf.get("gravel") is not None and sf["gravel"] >= MOSTLY:
        facts["ground"] = "track"
    elif sf.get("paved") is not None and sf["paved"] >= MOSTLY:
        facts["ground"] = "paved"
    if gp.get("sac_worst") in SAC_MOUNTAIN \
            and (gp.get("sac_worst_share") or 0) >= SAC_MOUNTAIN_SHARE:
        facts["mountain_path"] = True

    taken = {fold(facts[k]) for k in ("from", "to") if k in facts}
    if "stage" in facts:
        taken.add(fold(facts["stage"]["of"]))
    sights = sights_of(detail, top_m, cc, taken)
    if sights:
        facts["sights"] = [{"kind": k, "noun": n, "name": nm, "ele": e,
                            "beside": b} for k, n, nm, e, b in sights]
        taken |= {fold(s[2]) for s in sights}

    passes = []
    for p in detail.get("passes") or []:
        if (p.get("m") or 0) > PASSES_MAX_M:
            continue
        name = clean_name(p.get("name"), cc)
        if name and fold(name) not in taken:
            taken.add(fold(name))
            passes.append(name)
        if len(passes) >= MAX_PASSES:
            break
    if passes:
        facts["passes"] = passes

    se = (row.get("f") or {}).get("se") or {}
    if se.get("from") in MONTHS and se.get("to") in MONTHS:
        facts["season"] = {"from": se["from"], "to": se["to"],
                           "n": se.get("n"), "est": bool(se.get("est"))}
    return facts


# ---------------------------------------------------------------------------
# Sentences
# ---------------------------------------------------------------------------

def join_list(items):
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def sight_phrases(sights):
    """Group by noun, walking order kept for the first of each group."""
    groups, order = {}, []
    for s in sights:
        if s["noun"] not in groups:
            order.append(s["noun"])
            groups[s["noun"]] = []
        groups[s["noun"]].append(s)
    out = []
    for noun in order:
        items = groups[noun]
        label = noun if len(items) == 1 else PLURAL.get(noun, noun + "s")
        if noun == "ruin" and len(items) > 1:
            label = "ruins"
        named = []
        for s in items:
            text = s["name"]
            if s["ele"] is not None:
                text += f" ({int_text(s['ele'])} m)"
            named.append(text)
        out.append(f"the {label} {join_list(named)}")
    return out


def join_groups(groups):
    """Groups that hold their own "and" are closed with a comma first, so
    "the peaks A and B, and the glacier C" reads as two groups."""
    if len(groups) > 1 and any(" and " in g for g in groups):
        return ", ".join(groups[:-1]) + ", and " + groups[-1]
    return join_list(groups)


def compose(facts):
    """(text, parts) or (None, parts) when the facts cannot carry a lead.

    parts is the language neutral form: [{"c": clause code, ...values}], in
    reading order, so the app can render the same sentences through t()."""
    parts = []
    if "km" not in facts:
        return None, parts

    lead = {"c": "lead", "km": facts["km"], "shape": facts.get("shape")}
    if "from" in facts:
        lead["from"], lead["to"] = facts["from"], facts["to"]
    if "climb_m" in facts:
        lead["climb_m"] = facts["climb_m"]
    for k in ("minutes", "days"):
        if k in facts:
            lead[k] = facts[k]
    parts.append(lead)
    if "stage" in facts:
        parts.insert(0, {"c": "stage", **facts["stage"]})
    if "top_m" in facts or "ground" in facts or facts.get("mountain_path"):
        parts.append({"c": "ground", "top_m": facts.get("top_m"),
                      "ground": facts.get("ground"),
                      "mountain_path": bool(facts.get("mountain_path"))})
    if facts.get("sights"):
        parts.append({"c": "sights", "items": facts["sights"]})
    if facts.get("passes"):
        parts.append({"c": "passes", "names": facts["passes"]})
    if facts.get("season"):
        parts.append({"c": "season", **facts["season"]})

    # Drop the least needed clause until the text fits.
    drop_order = ["passes", "season", "ground", "stage", "sights"]
    while True:
        text = render(parts)
        if len(text) <= MAX_CHARS:
            return text, parts
        for code in drop_order:
            if any(p["c"] == code for p in parts):
                parts = [p for p in parts if p["c"] != code]
                break
        else:
            return text, parts


def render(parts):
    """English sentences from parts."""
    out = []
    for p in parts:
        c = p["c"]
        if c == "stage":
            out.append(f"Stage {p['i']} of the {p['of']}.")
        elif c == "lead":
            shape = p.get("shape")
            noun = {"loop": "loop", "out_back": "out and back walk"}.get(shape, "walk")
            s = f"{article(p['km'])} {p['km']} km {noun}"
            if p.get("from"):
                s += f" from {p['from']} to {p['to']}"
            if p.get("climb_m"):
                s += f" with {int_text(p['climb_m'])} m of climbing"
            if p.get("minutes"):
                s += f", about {clock_text(p['minutes'])} of walking"
                if p.get("days"):
                    s += f" over {p['days']} days"
            elif p.get("days"):
                s += f", about {p['days']} days on foot"
            out.append(s + ".")
        elif c == "ground":
            bits = []
            if p.get("top_m") is not None:
                bits.append(f"It tops out at {int_text(p['top_m'])} m")
            ground = {"path": "mostly on footpaths", "track": "mostly on tracks",
                      "paved": "mostly on paved roads"}.get(p.get("ground"))
            if ground:
                bits.append(ground if bits else f"It runs {ground}")
            if p.get("mountain_path"):
                bits.append("with steep mountain paths in places" if bits
                            else "It has steep mountain paths in places")
            if bits:
                out.append(", ".join(bits) + ".")
        elif c == "sights":
            on = [s for s in p["items"] if not s.get("beside")]
            beside = [s for s in p["items"] if s.get("beside")]
            if on:
                out.append("On the way: " + join_groups(sight_phrases(on)) + ".")
            if beside:
                label = "peak" if len(beside) == 1 else "peaks"
                out.append(f"It passes below the {label} "
                           + join_list([f"{s['name']} ({int_text(s['ele'])} m)"
                                        for s in beside]) + ".")
        elif c == "passes":
            out.append(f"It goes close to {join_list(p['names'])}.")
        elif c == "season":
            if p.get("n") == 12 or (p["from"] == "jan" and p["to"] == "dec"):
                out.append("Usually walkable all year." if p.get("est")
                           else "Walkable all year.")
            else:
                pre = "Usually clear of snow" if p.get("est") else "Clear of snow"
                out.append(f"{pre} from {MONTHS[p['from']]} to {MONTHS[p['to']]}.")
    return " ".join(x[0].upper() + x[1:] for x in out if x)


# ---------------------------------------------------------------------------
# The check
# ---------------------------------------------------------------------------

def allowed_names(facts):
    out = [facts.get(k) for k in ("from", "to")]
    if facts.get("stage"):
        out.append(facts["stage"]["of"])
    out += [s["name"] for s in facts.get("sights") or []]
    out += list(facts.get("passes") or [])
    return sorted({n for n in out if n}, key=len, reverse=True)


def allowed_numbers(facts):
    nums = set()
    if "km" in facts:
        nums.add(facts["km"])
    for k in ("climb_m", "top_m"):
        if facts.get(k) is not None:
            nums.add(int_text(facts[k]))
    if facts.get("minutes") is not None:
        nums |= set(re.findall(r"\d+", clock_text(facts["minutes"])))
    if facts.get("days"):
        nums.add(str(facts["days"]))
    if facts.get("stage"):
        nums.add(str(facts["stage"]["i"]))
    for s in facts.get("sights") or []:
        if s.get("ele") is not None:
            nums.add(int_text(s["ele"]))
    return nums


def check(text, facts):
    """[] when the summary holds only what the facts hold and follows the
    house copy rules; else a list of reasons."""
    bad = []
    if not text:
        return ["empty"]
    if not (MIN_CHARS <= len(text) <= MAX_CHARS):
        bad.append(f"length {len(text)}")
    if DASH_RE.search(text):
        bad.append("dash")
    if SEPARATOR_RE.search(text):
        bad.append("separator")
    if not text.endswith("."):
        bad.append("no full stop")

    # Names out first, so a sight called "Best View" cannot trip the banned
    # list and a stage numbered in its name cannot pass as a figure.
    rest = text
    for name in allowed_names(facts):
        rest = rest.replace(name, " ")
    words = re.findall(r"[^\W\d_]+(?:'[^\W\d_]+)?", rest)
    for w in words:
        if fold(w) in BANNED:
            bad.append(f"banned word {w}")
    months = {v.lower(): k for k, v in MONTHS.items()}
    season = facts.get("season") or {}
    for w in words:
        lw = w.lower()
        if lw in months:
            if months[lw] not in (season.get("from"), season.get("to")):
                bad.append(f"month {w} not in season")
        elif lw not in TEMPLATE_WORDS:
            bad.append(f"unknown word {w}")

    numbers = re.findall(r"\d[\d,]*(?:\.\d+)?", rest)
    allowed = allowed_numbers(facts)
    for n in numbers:
        if n not in allowed:
            bad.append(f"number {n} not in facts")

    low = f" {rest.lower()} "
    shape = facts.get("shape")
    if " loop" in low and shape != "loop":
        bad.append("loop claimed")
    if "out and back" in low and shape != "out_back":
        bad.append("out and back claimed")
    if " days " in low and not facts.get("days"):
        bad.append("days claimed")
    if "snow" in low and not season:
        bad.append("season claimed")
    if "footpaths" in low and facts.get("ground") != "path":
        bad.append("footpaths claimed")
    if "paved roads" in low and facts.get("ground") != "paved":
        bad.append("paved claimed")
    if "mountain path" in low and not facts.get("mountain_path"):
        bad.append("mountain path claimed")
    return bad


# ---------------------------------------------------------------------------
# The batch
# ---------------------------------------------------------------------------

def in_top_band(row):
    return (row.get("v5") or {}).get("band") in TOP_BANDS


def load_detail(wire_dir, row):
    path = Path(wire_dir) / "trip" / f"{row['id']}.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def summarise_row(row, detail):
    """{"text", "parts"} and [] or None and the reasons it failed."""
    if row.get("category") != "hike":
        return None, ["not a walk"]
    facts = facts_of(row, detail)
    text, parts = compose(facts)
    if not text:
        return None, ["no length"]
    bad = check(text, facts)
    if bad:
        return None, bad
    return {"text": text, "parts": parts}, []


def run(wire_dir=WIRE_DIR, countries=None, top_only=True):
    wire_dir = Path(wire_dir)
    items, report = {}, Counter()
    fails, per_cc, clauses = Counter(), Counter(), Counter()
    lengths = []
    files = sorted(wire_dir.glob("[A-Z][A-Z].json"))
    generated_at = None
    for path in files:
        cc = path.stem
        if countries and cc not in countries:
            continue
        wire = json.loads(path.read_text(encoding="utf-8"))
        generated_at = generated_at or wire.get("generated_at")
        for row in wire.get("trips") or []:
            report["rated_rows"] += 1
            if row.get("summary"):
                report["rated_rows_with_wire_summary"] += 1
            if top_only and not in_top_band(row):
                continue
            report["candidates"] += 1
            detail = load_detail(wire_dir, row)
            if detail is None:
                report["no_detail_file"] += 1
            out, bad = summarise_row(row, detail)
            if out is None:
                report["failed"] += 1
                for b in bad:
                    fails[re.sub(r"\d[\d,.]*", "N", b)] += 1
                continue
            items[str(row["id"])] = {"cc": cc, **out}
            per_cc[cc] += 1
            lengths.append(len(out["text"]))
            for p in out["parts"]:
                clauses[p["c"]] += 1
    report["written"] = len(items)
    lengths.sort()
    stats = {
        "counts": dict(report),
        "failures": dict(fails.most_common()),
        "per_country": dict(sorted(per_cc.items())),
        "clauses": dict(clauses.most_common()),
        "chars": {"min": lengths[0], "median": lengths[len(lengths) // 2],
                  "max": lengths[-1]} if lengths else None,
    }
    return items, stats, generated_at


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--wire", default=str(WIRE_DIR))
    ap.add_argument("--all", action="store_true", help="every rated walk, not the top band")
    ap.add_argument("--country", action="append", help="ISO2, repeatable")
    ap.add_argument("--out", default=str(OUT_PATH))
    ap.add_argument("--report", default=str(REPORT_PATH))
    ap.add_argument("--print", type=int, default=0, metavar="N",
                    help="print N summaries and write nothing")
    args = ap.parse_args(argv)

    items, stats, wire_at = run(args.wire, set(args.country or []) or None,
                                top_only=not args.all)
    if args.print:
        for k, v in list(items.items())[:args.print]:
            print(f"{v['cc']} {k}: {v['text']}")
        print(json.dumps(stats["counts"]))
        return 0

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    scope = "all rated walks" if args.all else "top band (v5 " + ", ".join(TOP_BANDS) + ")"
    out = {"generated_at": now, "wire_generated_at": wire_at, "scope": scope,
           "method": "templates from the wire's own facts, checked by summaries.check()",
           "n": len(items), "items": items}
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":"),
                                         sort_keys=True) + "\n", encoding="utf-8")
    Path(args.report).parent.mkdir(parents=True, exist_ok=True)
    Path(args.report).write_text(json.dumps({"generated_at": now, "scope": scope, **stats},
                                            ensure_ascii=False, indent=1) + "\n",
                                 encoding="utf-8")
    print(f"{len(items)} summaries written to {args.out}")
    print(json.dumps(stats["counts"]))
    if stats["failures"]:
        print("failures:", json.dumps(stats["failures"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
