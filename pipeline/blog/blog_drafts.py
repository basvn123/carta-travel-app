"""Data blog drafts: "Where to go in <month>" (ROADMAP K14, T1178).

Tier: Scheduled

Writes one structured draft per run from the current wire
(continent-app/public/app_data.json):

    content/blog/data/<slug>.json   the numbers: rows, chart data, counts, the
                                    snapshot it cites (file, generated_at, hash)
    content/blog/<slug>.md          Markdown from a template, front matter
                                    status: draft

A draft is never published by this script. The owner reads it, edits it and
changes `status` to `published` in a pull request; the next deploy builds it
(continent-app/scripts/blog/build.mjs). `scripts/blog/check_draft.py` refuses a
draft whose numbers do not match the data it cites, that breaks a copy rule,
uses an unlicensed image, adds no original data or repeats another post's
question; this task runs it on its own output and fails when it refuses.

Selection for month M (all from the wire, no network):
  in season   M is in `climate.best` (the comfort rule in docs/HANDBOOK.md)
  quiet       crowd tier of M is 1 or 2 (`crowding.monthly.tier`)
  rated       `rating.score` of 7.0 or more
  ranked by   an indicative day for one person, lowest first: half a mid-range
              hotel room, one cheap meal and one mid-range meal
  listed      ten places, at most two a country

Prose: the template sentences only, unless `--prose` is given: then the
opening paragraph goes through the gateway (feature `blog_intro`, prompt
registry id `blog-intro`, Gemini by default, never the Claude API) and must
pass `guard_prose`: only numbers present in the draft's data, no banned words,
no dashes, 400 characters at most. On any refusal the template sentence stays.

Part 2 (T1174): `pipeline/blog/blog_drafts_more.py` adds what-changed, new-on-carta and
cheapest-week (needs `--fares`), and writes a price snapshot each run so the next
month can compare. `--types` picks a subset; the default is all four.

Usage, from the repo root:
    python pipeline/blog/blog_drafts.py                     # next month, written to content/blog
    python pipeline/blog/blog_drafts.py --month 12 --year 2026
    python pipeline/blog/blog_drafts.py --month 12 --year 2026 --prose
    python pipeline/blog/blog_drafts.py --wire path/to/app_data.json --out-dir /tmp/x --dry-run
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.dirname(HERE))  # pipeline/: ai_gateway, env_local, prompt_registry (T1207)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "scripts", "blog"))

WIRE = os.path.join(ROOT, "continent-app", "public", "app_data.json")
OUT_DIR = os.path.join(ROOT, "content", "blog")

MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]
MIN_RATING = 7.0
MAX_TIER = 1
LIST_N = 10
MIN_SEASON = 30
PER_COUNTRY = 2
CROWD_WORD = {0: "quiet", 1: "moderate", 2: "busy", 3: "crowded"}  # crowding.tier scale, lib/crowdMonth.js
BANNED = re.compile(r"\b(seamless|unlock|effortless|elevate|leverage|empower|curated|simply|just|easy)\b", re.I)
DASH = re.compile("[\u2013\u2014]")
MAX_PROSE = 400


def snapshot_hash(obj):
    """sha256 of a JSON value in canonical form (sorted keys, no spaces)."""
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def day_eur(dest):
    """An indicative day for one person, or None: half of a mid-range hotel
    room, one cheap meal and one mid-range meal (wire `accommodation.beds`,
    `costs`). Rounded to whole euros."""
    beds = (dest.get("accommodation") or {}).get("beds") or {}
    costs = dest.get("costs") or {}
    hotel, cheap, mid = beds.get("hotel3"), costs.get("meal_cheap_eur"), costs.get("meal_mid_eur")
    if not all(isinstance(x, (int, float)) for x in (hotel, cheap, mid)):
        return None
    return int(round(hotel / 2 + cheap + mid))


def month_row(did, d, month):
    """The table row of one place for a month, or None when the wire lacks a figure."""
    clim = d.get("climate") or {}
    m = clim.get("m") or []
    tiers = ((d.get("crowding") or {}).get("monthly") or {}).get("tier") or []
    rating = (d.get("rating") or {}).get("score")
    day = day_eur(d)
    if len(m) != 12 or len(tiers) != 12 or rating is None or day is None:
        return None
    t_high, t_low, rain, comfort = m[month - 1]
    return {
        "id": did,
        "place": d.get("city") or did,
        "country": d.get("country"),
        "iso2": d.get("iso2"),
        "high_c": round(t_high),
        "low_c": round(t_low),
        "rain_mm": round(rain),
        "comfort": round(comfort),
        "crowd_tier": int(tiers[month - 1]),
        "day_eur": day,
        "rating": round(float(rating), 1),
        "_best": month in (clim.get("best") or []),
    }


def select(wire, month):
    """(rows, counts) for a month from a loaded wire."""
    dests = wire["destinations"]
    scored = [r for did, d in sorted(dests.items()) if (r := month_row(did, d, month))]
    in_season = [r for r in scored if r["_best"]]
    rule = "best_months"
    if len(in_season) < MIN_SEASON:
        # A winter month has no place in its best months. Say so and use the
        # places in the top tenth for weather comfort that month instead.
        rule = "top_comfort"
        cut = sorted(r["comfort"] for r in scored)[int(len(scored) * 0.9)] if scored else 0
        in_season = [r for r in scored if r["comfort"] >= cut]
    quiet = [r for r in in_season if r["crowd_tier"] <= MAX_TIER]
    rated = [r for r in quiet if r["rating"] >= MIN_RATING]
    rated.sort(key=lambda r: (r["day_eur"], -r["rating"], r["id"]))
    rows, per = [], {}
    for r in rated:
        if per.get(r["iso2"], 0) >= PER_COUNTRY:
            continue
        per[r["iso2"]] = per.get(r["iso2"], 0) + 1
        rows.append({k: v for k, v in r.items() if not k.startswith("_")})
        if len(rows) == LIST_N:
            break
    for r in rows:
        r["crowd"] = CROWD_WORD.get(r["crowd_tier"], "unknown")
    counts = {"with_figures": len(scored), "in_season": len(in_season), "quiet": len(quiet),
              "rated": len(rated), "listed": len(rows)}
    counts["season_rule"] = rule
    return rows, counts


def build_data(wire, month, year, wire_name="continent-app/public/app_data.json"):
    rows, counts = select(wire, month)
    name = MONTHS[month - 1]
    slug = f"where-to-go-in-{name.lower()}-{year}"
    body = {
        "type": "where-to-go",
        "slug": slug,
        "month": month,
        "month_name": name,
        "year": year,
        "source": {"file": wire_name, "generated_at": wire["meta"]["generated_at"],
                   "n_destinations": wire["meta"]["n_destinations"]},
        "criteria": {"min_rating": MIN_RATING, "max_crowd_tier": MAX_TIER, "list_n": LIST_N,
                     "per_country": PER_COUNTRY,
                     "season": (f"{name} is one of its best months"
                                if counts["season_rule"] == "best_months" else
                                f"its weather comfort in {name} is in the highest tenth of all places"),
                     "day": "half a mid-range hotel room, one cheap meal and one mid-range meal, one person"},
        "counts": counts,
        "rows": rows,
        "chart": {"title": f"An indicative day for one person in {name}", "unit": "EUR",
                  "bars": [{"label": r["place"], "value": r["day_eur"]} for r in rows]},
        "images": [],
    }
    body["rows_sha256"] = snapshot_hash({"rows": rows, "counts": counts})
    return body


def facts_block(data):
    c = data["counts"]
    return "\n".join([
        f"month: {data['month_name']} {data['year']}",
        f"places with weather, crowd, rating and price figures: {c['with_figures']}",
        f"in their best months: {c['in_season']}",
        f"of those, quiet or moderate crowds: {c['quiet']}",
        f"of those, rated {data['criteria']['min_rating']} or more: {c['rated']}",
        f"places listed: {c['listed']}",
        "ranked by an indicative day for one person, lowest first",
    ])


def template_intro(data):
    c, name = data["counts"], data["month_name"]
    when = (f"are in their best months for {name}" if c["season_rule"] == "best_months"
            else f"have weather comfort in the highest tenth of all places in {name}, a month when few places reach their best months")
    return (f"Of the {c['with_figures']:,} places in Carta with weather, crowd, rating and price figures, "
            f"{c['in_season']:,} {when}. {c['quiet']:,} of those are quiet or "
            f"moderate, and {c['rated']:,} also have a Carta rating of {data['criteria']['min_rating']} or more. "
            f"The table lists the {c['listed']} with the lowest indicative day.")


def _numbers(text):
    return {n.replace(",", "") for n in re.findall(r"\d[\d,]*(?:\.\d+)?", text)}


def guard_prose(text, data):
    """The model's paragraph, or None when it breaks a rule."""
    t = (text or "").strip()
    if not t or len(t) > MAX_PROSE or BANNED.search(t) or DASH.search(t) or "!" in t:
        return None
    allowed = _numbers(facts_block(data))
    if not _numbers(t) <= allowed:
        return None
    return t


def model_intro(data):
    """The gateway paragraph for the opening, or None. Never raises."""
    try:
        from ai_gateway import AIRefusal, Gateway
        from env_local import load_env
        from prompt_registry import prompt
        load_env()
        pr = prompt("blog-intro")
        gw = Gateway("blog_intro")
        res = gw.call(pr.text("user", facts=facts_block(data)), system=pr.text("system"), json=True,
                      temperature=0.2, max_tokens=1024)
        raw = res.text.strip()
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw)
        return guard_prose(json.loads(raw).get("intro", ""), data)
    except (ImportError, AIRefusal, ValueError, KeyError, OSError, SystemExit):
        return None
    except Exception:  # noqa: BLE001 - a draft must never fail on the optional prose
        return None


def render_markdown(data, intro):
    name, year = data["month_name"], data["year"]
    crit = data["criteria"]
    rows = data["rows"]
    table = ["| Place | Country | High C | Rain mm | Crowds | Day EUR | Rating |",
             "|---|---|---|---|---|---|---|"]
    for r in rows:
        table.append(f"| {r['place']} | {r['country']} | {r['high_c']} | {r['rain_mm']} | {r['crowd']} | "
                     f"{r['day_eur']} | {r['rating']} |")
    cheapest, dearest = rows[0], rows[-1]
    fm = [
        "---",
        f"title: Where to go in {name} {year}: {len(rows)} quiet places in season, with the price of a day",
        f"slug: {data['slug']}",
        "type: where-to-go",
        f"question: Where in Europe is it in season, quiet and good value in {name}?",
        f"description: {len(rows)} places with high weather comfort in {name}, quiet crowds and a Carta rating of {crit['min_rating']} or more, "
        f"from {cheapest['day_eur']} EUR a day for one person.",
        "status: draft",
        f"date: {dt.date.today().isoformat()}",
        f"data: data/{data['slug']}.json",
        f"snapshot: {data['source']['generated_at']}",
        f"snapshot_sha256: {data['rows_sha256']}",
        "author: Carta",
        "---",
    ]
    body = [
        f"# Where to go in {name} {year}",
        "",
        intro,
        "",
        "{{chart}}",
        "",
        f"## The {len(rows)} places",
        "",
        *table,
        "",
        "## How to read it",
        "",
        f"High C is the usual daytime high in {name} and Rain mm the usual rain for the month, both from "
        "NASA POWER normals for 2001 to 2020. Crowds is the month's tier from Eurostat and JRC overnight stays "
        f"per square kilometre. Rating is Carta's rating out of 10. Day EUR is an indicative day for one person: "
        f"{crit['day']}.",
        "",
        "## What the numbers say",
        "",
        f"The lowest day on the list is {cheapest['place']} at {cheapest['day_eur']} EUR, and the highest is "
        f"{dearest['place']} at {dearest['day_eur']} EUR. These are estimates from Carta's price model, "
        "not quotes: open a place to see the sources behind its bed and food figures.",
        "",
        "## How we chose them",
        "",
        f"A place is listed when {crit['season']}, its crowd tier for {name} is quiet or moderate, "
        f"and its Carta rating is {crit['min_rating']} or more. The list is ranked by the indicative day, lowest first, "
        f"with at most {crit['per_country']} places a country. The data is Carta's catalogue as of "
        f"{data['source']['generated_at'][:10]}.",
        "",
    ]
    return "\n".join(fm + [""] + body)


def write_draft(wire, month, year, out_dir=OUT_DIR, prose=False, wire_name="continent-app/public/app_data.json", dry_run=False):
    """Builds the draft; returns (slug, md, data). Writes unless dry_run."""
    data = build_data(wire, month, year, wire_name)
    if not data["rows"]:
        raise SystemExit(f"blog_drafts: no place passes the rules for {data['month_name']}; nothing written")
    intro = (model_intro(data) if prose else None) or template_intro(data)
    md = render_markdown(data, intro)
    if not dry_run:
        os.makedirs(os.path.join(out_dir, "data"), exist_ok=True)
        with open(os.path.join(out_dir, f"{data['slug']}.md"), "w", encoding="utf-8", newline="\n") as fh:
            fh.write(md)
        with open(os.path.join(out_dir, "data", f"{data['slug']}.json"), "w", encoding="utf-8", newline="\n") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
    return data["slug"], md, data


def next_month(today=None):
    t = today or dt.date.today()
    return (t.year + 1, 1) if t.month == 12 else (t.year, t.month + 1)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    y, m = next_month()
    ap.add_argument("--month", type=int, default=m)
    ap.add_argument("--year", type=int, default=y)
    ap.add_argument("--wire", default=WIRE)
    ap.add_argument("--out-dir", default=OUT_DIR)
    ap.add_argument("--prose", action="store_true", help="opening paragraph through the gateway (blog-intro prompt)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--types", default="all",
                    help="comma list of where-to-go, what-changed, new-on-carta, cheapest-week; default all")
    ap.add_argument("--fares", action="append", default=[],
                    help="fares file for a cheapest-week post (repeatable; see pipeline/blog/blog_drafts_more.py)")
    args = ap.parse_args(argv)
    if not 1 <= args.month <= 12:
        raise SystemExit("blog_drafts: --month must be 1 to 12")
    with open(args.wire, encoding="utf-8") as fh:
        wire = json.load(fh)
    import blog_drafts_more as more
    types = more.TYPES if args.types == "all" else tuple(t.strip() for t in args.types.split(",") if t.strip())
    bad = [t for t in types if t not in more.TYPES]
    if bad:
        raise SystemExit(f"blog_drafts: unknown type {', '.join(bad)}; choose from {', '.join(more.TYPES)}")
    slugs = []
    if "where-to-go" in types:
        slug, _, data = write_draft(wire, args.month, args.year, args.out_dir, args.prose, dry_run=args.dry_run)
        slugs.append(slug)
        print(f"blog_drafts: {slug}: {data['counts']['listed']} places of {data['counts']['rated']} that pass "
              f"({'dry run' if args.dry_run else 'written to ' + args.out_dir})")
    extra, notes = more.run(wire, args.month, args.year, args.out_dir, types, args.fares, dry_run=args.dry_run)
    slugs += extra
    for s_ in extra:
        print(f"blog_drafts: {s_} ({'dry run' if args.dry_run else 'written to ' + args.out_dir})")
    for n in notes:
        print(f"blog_drafts: {n}")
    if args.dry_run:
        return 0
    import check_draft
    failed = 0
    for s_ in slugs:
        problems = check_draft.check_file(os.path.join(args.out_dir, f"{s_}.md"), wire_path=args.wire)
        for p in problems:
            print(f"blog_drafts: CHECK FAILED: {s_}: {p}")
        failed += bool(problems)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
