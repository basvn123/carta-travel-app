"""More data blog post types: what changed, new on Carta, lowest fare week (ROADMAP K14, T1174).

Tier: Scheduled

Part 2 of the data blog. `pipeline/blog/blog_drafts.py` calls `run()` here after the
monthly "Where to go" draft. Each type writes the same pair of files as part 1
(`content/blog/<slug>.md` with `status: draft`, `content/blog/data/<slug>.json`)
and is refused or passed by `scripts/blog/check_draft.py`. Nothing is published.

Types
  what-changed   the biggest moves in the price of a three star hotel room since
                 the last monthly snapshot (D5 drift, as the wire shows it)
  new-on-carta   places in the wire that were not in the last snapshot
  cheapest-week  the week with the lowest fare from one airport, per place, in a
                 window (Easter, May, summer, autumn); reads a fares file the
                 flight sweep export writes, `--fares`

The snapshot: every run writes `content/blog/data/snapshots/places-<date>.json`,
a small copy of the figures a later post compares against (id, name, country,
bed price, meal prices, rating). It is committed with the drafts, so a month later
the previous one is in the repository. With no earlier snapshot the two
comparison types are skipped, and say so; they are not failures.

Fares file (`content/blog/data/inputs/fares-<origin>-<window>.json`):
    {"generated_at": ISO, "origin": "AMS", "origin_name": "Amsterdam",
     "window": {"label": "May 2027", "slug": "may-2027"},
     "fares": [{"dest": "BCN", "depart": "2027-05-01", "price_eur": 62}, ...]}
`depart` is the first day of a Saturday to Friday week; `price_eur` the lowest
return fare found for that week. A place is listed when at least MIN_WEEKS weeks
have a fare, so one lucky week does not make a row.

Copy rules are the ones the check script enforces: none of its hype words, so
the posts say "lowest", not the superlative.
"""
from __future__ import annotations

import datetime as dt
import glob
import hashlib
import json
import os
import re
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import blog_drafts as bd  # noqa: E402

LIST_N = 10
MIN_ROWS = 5
MIN_CHANGE_PCT = 5.0
PER_COUNTRY = 2
MIN_WEEKS = 3
SNAP_DIR = "snapshots"
TYPES = ("where-to-go", "what-changed", "new-on-carta", "cheapest-week")


# ---------------------------------------------------------------- snapshots

def snapshot_of(wire):
    """The compact figures a later post compares against."""
    places = {}
    for did, d in sorted(wire["destinations"].items()):
        beds = (d.get("accommodation") or {}).get("beds") or {}
        costs = d.get("costs") or {}
        rating = (d.get("rating") or {}).get("score")
        places[did] = {
            "city": d.get("city") or did, "country": d.get("country"), "iso2": d.get("iso2"),
            "bed": beds.get("hotel3") if isinstance(beds.get("hotel3"), (int, float)) else None,
            "day": bd.day_eur(d),
            "rating": round(float(rating), 1) if rating is not None else None,
        }
    return {"generated_at": wire["meta"]["generated_at"], "n_destinations": len(places), "places": places}


def snapshot_path(out_dir, generated_at):
    return os.path.join(out_dir, "data", SNAP_DIR, f"places-{generated_at[:10]}.json")


def write_snapshot(out_dir, snap):
    path = snapshot_path(out_dir, snap["generated_at"])
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write('{"generated_at": %s, "n_destinations": %d, "places": {\n' % (json.dumps(snap["generated_at"]), snap["n_destinations"]))
        items = [f"{json.dumps(k)}: {json.dumps(v, ensure_ascii=False, separators=(',', ':'))}" for k, v in snap["places"].items()]
        fh.write(",\n".join(items) + "\n}}\n")
    return path


def previous_snapshot(out_dir, generated_at):
    """(path, snapshot) of the newest snapshot older than `generated_at`, or (None, None)."""
    best = None
    for p in sorted(glob.glob(os.path.join(out_dir, "data", SNAP_DIR, "places-*.json"))):
        try:
            s = json.load(open(p, encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if s.get("generated_at", "") < generated_at:
            best = (p, s)
    return best or (None, None)


def file_sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        h.update(fh.read())
    return h.hexdigest()


# ------------------------------------------------------------------ helpers

def _front(data, title, question, description, extra_status="draft"):
    return [
        "---",
        f"title: {title}",
        f"slug: {data['slug']}",
        f"type: {data['type']}",
        f"question: {question}",
        f"description: {description}",
        f"status: {extra_status}",
        f"date: {dt.date.today().isoformat()}",
        f"data: data/{data['slug']}.json",
        f"snapshot: {data['source']['generated_at']}",
        f"snapshot_sha256: {data['rows_sha256']}",
        "author: Carta",
        "---",
    ]


def _per_country(rows, key, n=LIST_N, per=PER_COUNTRY):
    out, seen = [], {}
    for r in sorted(rows, key=key):
        if seen.get(r["iso2"], 0) >= per:
            continue
        seen[r["iso2"]] = seen.get(r["iso2"], 0) + 1
        out.append(r)
        if len(out) == n:
            break
    return out


def _finish(data):
    data["rows_sha256"] = bd.snapshot_hash({"rows": data["rows"], "counts": data["counts"]})
    return data


def _source(wire, wire_name):
    return {"file": wire_name, "generated_at": wire["meta"]["generated_at"], "n_destinations": wire["meta"]["n_destinations"]}


def _pct(a, b):
    return round((b - a) / a * 100, 1)


def _num(x):
    return f"{x:,}" if isinstance(x, int) else str(x)


# -------------------------------------------------------------- what changed

def build_changed(wire, prev, prev_name, month, year, wire_name="continent-app/public/app_data.json"):
    cur = snapshot_of(wire)["places"]
    both, rows_all = 0, []
    for did, p in prev["places"].items():
        c = cur.get(did)
        if not c or not isinstance(p.get("bed"), (int, float)) or not isinstance(c.get("bed"), (int, float)) or p["bed"] <= 0:
            continue
        both += 1
        pct = _pct(p["bed"], c["bed"])
        if abs(pct) >= MIN_CHANGE_PCT:
            rows_all.append({"id": did, "place": c["city"], "country": c["country"], "iso2": c["iso2"],
                             "bed_before": int(round(p["bed"])), "bed_now": int(round(c["bed"])),
                             "change_pct": pct, "direction": "up" if pct > 0 else "down"})
    rows = _per_country(rows_all, key=lambda r: (-abs(r["change_pct"]), r["id"]))
    rows.sort(key=lambda r: (-abs(r["change_pct"]), r["id"]))
    name = bd.MONTHS[month - 1]
    pcts = [_pct(p["bed"], cur[i]["bed"]) for i, p in prev["places"].items()
            if i in cur and isinstance(p.get("bed"), (int, float)) and isinstance(cur[i].get("bed"), (int, float)) and p["bed"] > 0]
    counts = {"compared": both, "moved_5_pct_or_more": len(rows_all),
              "up": sum(1 for r in rows_all if r["direction"] == "up"),
              "down": sum(1 for r in rows_all if r["direction"] == "down"),
              "median_change_pct": round(statistics.median(pcts), 1) if pcts else 0.0,
              "listed": len(rows)}
    data = {
        "type": "what-changed", "slug": f"what-changed-in-{name.lower()}-{year}", "month": month,
        "month_name": name, "year": year,
        "source": _source(wire, wire_name),
        "source_prev": {"file": prev_name, "generated_at": prev["generated_at"], "sha256": file_sha256_obj(prev)},
        "criteria": {"min_change_pct": MIN_CHANGE_PCT, "list_n": LIST_N, "per_country": PER_COUNTRY,
                     "price": "a double room in a three star hotel, per night"},
        "counts": counts, "rows": rows,
        "chart": {"title": "Change in the price of a three star room, percent",
                  "unit": "percent", "bars": [{"label": r["place"], "value": abs(r["change_pct"])} for r in rows]},
        "images": [],
    }
    return _finish(data)


def file_sha256_obj(snap):
    """Hash of a snapshot as the check script re-computes it: canonical JSON of the places."""
    return bd.snapshot_hash(snap["places"])


def render_changed(data):
    c, name, year, rows = data["counts"], data["month_name"], data["year"], data["rows"]
    prev, cur = data["source_prev"]["generated_at"][:10], data["source"]["generated_at"][:10]
    intro = (f"Between the Carta snapshots of {prev} and {cur}, {c['compared']:,} places had a three star hotel price in both. "
             f"{c['moved_5_pct_or_more']:,} moved by {data['criteria']['min_change_pct']:g} percent or more: "
             f"{c['up']:,} up and {c['down']:,} down. The median change was {c['median_change_pct']:g} percent. "
             f"The table lists the {c['listed']} with the largest move.")
    table = ["| Place | Country | Before EUR | Now EUR | Change pct | Direction |", "|---|---|---|---|---|---|"]
    for r in rows:
        table.append(f"| {r['place']} | {r['country']} | {r['bed_before']} | {r['bed_now']} | {r['change_pct']:g} | {r['direction']} |")
    first = rows[0]
    fm = _front(data, f"What changed in {name} {year}: {len(rows)} places where hotel prices moved most",
                f"Which places changed most in hotel price since the last Carta snapshot, {name} {year}?",
                f"{len(rows)} places where the price of a three star room moved most between {prev} and {cur}, led by "
                f"{first['place']} at {first['change_pct']:g} percent.")
    body = [
        f"# What changed in {name} {year}", "", intro, "", "{{chart}}", "", f"## The {len(rows)} biggest moves", "", *table, "",
        "## How to read it", "",
        f"Before EUR and Now EUR are Carta's price for {data['criteria']['price']}, from the bed price layer of each snapshot. "
        "Change pct is the move between the two. A move can come from a new scrape, a change in the season Carta is pricing or a real "
        "change at the hotels, so read it as a pointer to look at a place, not as a verdict on its prices.", "",
        "## How we chose them", "",
        f"A place is listed when it has a three star price in both snapshots and the price moved by "
        f"{data['criteria']['min_change_pct']:g} percent or more. The list is sorted by the size of the move, "
        f"with at most {data['criteria']['per_country']} places a country.", "",
    ]
    return "\n".join(fm + [""] + body)


# ------------------------------------------------------------- new on Carta

def build_new(wire, prev, prev_name, month, year, wire_name="continent-app/public/app_data.json"):
    cur = snapshot_of(wire)["places"]
    new_all = [dict(id=i, place=c["city"], country=c["country"], iso2=c["iso2"], rating=c["rating"], day_eur=c["day"])
               for i, c in cur.items() if i not in prev["places"] and c["rating"] is not None and c["day"] is not None]
    new_ids = [i for i in cur if i not in prev["places"]]
    rows = _per_country(new_all, key=lambda r: (-r["rating"], r["day_eur"], r["id"]), per=3)
    name = bd.MONTHS[month - 1]
    counts = {"in_wire": len(cur), "in_previous": len(prev["places"]), "new": len(new_ids),
              "new_with_figures": len(new_all), "listed": len(rows)}
    data = {
        "type": "new-on-carta", "slug": f"new-on-carta-{name.lower()}-{year}", "month": month,
        "month_name": name, "year": year, "source": _source(wire, wire_name),
        "source_prev": {"file": prev_name, "generated_at": prev["generated_at"], "sha256": file_sha256_obj(prev)},
        "criteria": {"list_n": LIST_N, "per_country": 3,
                     "day": "half a mid-range hotel room, one cheap meal and one mid-range meal, one person"},
        "counts": counts, "rows": rows,
        "chart": {"title": "An indicative day for one person in the new places", "unit": "EUR",
                  "bars": [{"label": r["place"], "value": r["day_eur"]} for r in rows]},
        "images": [],
    }
    return _finish(data)


def render_new(data):
    c, name, year, rows = data["counts"], data["month_name"], data["year"], data["rows"]
    prev, cur = data["source_prev"]["generated_at"][:10], data["source"]["generated_at"][:10]
    intro = (f"Carta held {c['in_previous']:,} places in its snapshot of {prev} and holds {c['in_wire']:,} in the snapshot of {cur}. "
             f"{c['new']:,} places are new, and {c['new_with_figures']:,} of them already have a rating and a price. "
             f"The table lists {c['listed']} of those, by Carta rating.")
    table = ["| Place | Country | Rating | Day EUR |", "|---|---|---|---|"]
    for r in rows:
        table.append(f"| {r['place']} | {r['country']} | {r['rating']} | {r['day_eur']} |")
    fm = _front(data, f"New on Carta in {name} {year}: {len(rows)} places added since {prev}",
                f"Which places were added to Carta since the last snapshot, {name} {year}?",
                f"{len(rows)} of the {c['new']} places added to Carta between {prev} and {cur}, with a rating and the price of a day.")
    body = [
        f"# New on Carta in {name} {year}", "", intro, "", "{{chart}}", "", f"## The {len(rows)} places", "", *table, "",
        "## How to read it", "",
        "Rating is Carta's rating out of 10. Day EUR is an indicative day for one person: " + data["criteria"]["day"] + ". "
        "A new place has fewer sources behind its figures than an older one, so open the place to see what they are.", "",
        "## How we chose them", "",
        f"A place is new when its id is in the snapshot of {cur} and not in the snapshot of {prev}. It is listed when it has a rating "
        f"and a price. The list is sorted by rating, with at most {data['criteria']['per_country']} places a country.", "",
    ]
    return "\n".join(fm + [""] + body)


# ------------------------------------------------------------- lowest fare week

def build_fares(fares, fares_name, fares_sha, wire, origin_ok=True, wire_name="continent-app/public/app_data.json"):
    """Rows from a fares file: per place, the week with the lowest fare against its median week."""
    by = {}
    for f in fares["fares"]:
        if isinstance(f.get("price_eur"), (int, float)) and f.get("dest"):
            by.setdefault(f["dest"], []).append((int(round(f["price_eur"])), f["depart"]))
    rows_all = []
    for dest, wk in by.items():
        d = wire["destinations"].get(dest)
        if not d or len(wk) < MIN_WEEKS:
            continue
        low = min(wk)
        med = int(round(statistics.median(p for p, _ in wk)))
        rows_all.append({"id": dest, "place": d.get("city") or dest, "country": d.get("country"), "iso2": d.get("iso2"),
                         "week_from": low[1], "fare_eur": low[0], "median_week_eur": med,
                         "saving_eur": med - low[0], "weeks": len(wk)})
    rows = _per_country(rows_all, key=lambda r: (r["fare_eur"], -r["saving_eur"], r["id"]))
    win = fares["window"]
    counts = {"routes_with_fares": len(by), "places_listed_pool": len(rows_all), "listed": len(rows),
              "fares": len(fares["fares"])}
    data = {
        "type": "cheapest-week", "slug": f"lowest-fare-week-from-{fares['origin'].lower()}-{win['slug']}",
        "month": None, "month_name": win["label"], "year": int(win["slug"][-4:]) if win["slug"][-4:].isdigit() else None,
        "origin": fares["origin"], "origin_name": fares.get("origin_name") or fares["origin"],
        "window": win,
        "source": _source(wire, wire_name),
        "source_fares": {"file": fares_name, "generated_at": fares["generated_at"], "sha256": fares_sha},
        "criteria": {"min_weeks": MIN_WEEKS, "list_n": LIST_N, "per_country": PER_COUNTRY,
                     "fare": "the lowest return fare found for a week from Saturday to Friday"},
        "counts": counts, "rows": rows,
        "chart": {"title": f"Lowest return fare from {fares.get('origin_name') or fares['origin']}, {win['label']}", "unit": "EUR",
                  "bars": [{"label": r["place"], "value": r["fare_eur"]} for r in rows]},
        "images": [],
    }
    return _finish(data)


def render_fares(data):
    c, rows, win = data["counts"], data["rows"], data["window"]
    o = data["origin_name"]
    intro = (f"Carta searched {c['fares']:,} weekly fares from {o} for {win['label']}, on {c['routes_with_fares']:,} routes. "
             f"{c['places_listed_pool']:,} places have fares for at least {data['criteria']['min_weeks']} weeks. "
             f"The table lists the {c['listed']} with the lowest fare, the week it falls in and how far it sits below the median week.")
    table = ["| Place | Country | Week from | Fare EUR | Median week EUR | Saving EUR |", "|---|---|---|---|---|---|"]
    for r in rows:
        table.append(f"| {r['place']} | {r['country']} | {r['week_from']} | {r['fare_eur']} | {r['median_week_eur']} | {r['saving_eur']} |")
    first = rows[0]
    fm = _front(data, f"Lowest fare week from {o} in {win['label']}: {len(rows)} places",
                f"Which week in {win['label']} has the lowest fare from {o}?",
                f"{len(rows)} places reachable from {o} in {win['label']}, with the week of the lowest return fare, from {first['fare_eur']} EUR.")
    body = [
        f"# Lowest fare week from {o} in {win['label']}", "", intro, "", "{{chart}}", "", f"## The {len(rows)} places", "", *table, "",
        "## How to read it", "",
        f"Week from is the first day of a week that runs Saturday to Friday. Fare EUR is {data['criteria']['fare']}. Median week EUR is "
        "the median of the weekly lowest fares Carta found for that place, and Saving EUR is the median minus the lowest. "
        "A fare is a search result on the day Carta looked, not a quote: it can change before you book.", "",
        "## How we chose them", "",
        f"A place is listed when it has a fare in at least {data['criteria']['min_weeks']} weeks of the window. The list is sorted by the lowest fare, "
        f"with at most {data['criteria']['per_country']} places a country. The fares file is dated {data['source_fares']['generated_at'][:10]}.", "",
    ]
    return "\n".join(fm + [""] + body)


# ---------------------------------------------------------------------- run

def _write(out_dir, data, md):
    os.makedirs(os.path.join(out_dir, "data"), exist_ok=True)
    with open(os.path.join(out_dir, f"{data['slug']}.md"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(md)
    with open(os.path.join(out_dir, "data", f"{data['slug']}.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def run(wire, month, year, out_dir, types=TYPES, fares_paths=(), wire_name="continent-app/public/app_data.json", dry_run=False):
    """Writes the extra drafts; returns (slugs written, notes for types that were skipped).
    The snapshot of this wire is written last, after the comparison with the previous one."""
    slugs, notes = [], []
    prev_path, prev = previous_snapshot(out_dir, wire["meta"]["generated_at"])
    prev_name = os.path.relpath(prev_path, out_dir).replace(os.sep, "/") if prev_path else None
    for t in types:
        if t in ("what-changed", "new-on-carta"):
            if not prev:
                notes.append(f"{t}: skipped, no earlier snapshot in {os.path.join(out_dir, 'data', SNAP_DIR)} "
                             "(this run writes the first one; the next monthly run can compare)")
                continue
            data = (build_changed if t == "what-changed" else build_new)(wire, prev, prev_name, month, year, wire_name)
            if len(data["rows"]) < MIN_ROWS:
                notes.append(f"{t}: skipped, only {len(data['rows'])} rows (needs {MIN_ROWS})")
                continue
            md = (render_changed if t == "what-changed" else render_new)(data)
        elif t == "cheapest-week":
            if not fares_paths:
                notes.append("cheapest-week: skipped, no --fares file (the flight sweep export; see content/blog/README.md)")
                continue
            for fp in fares_paths:
                fares = json.load(open(fp, encoding="utf-8"))
                name = "data/inputs/" + os.path.basename(fp)
                data = build_fares(fares, name, file_sha256(fp), wire, wire_name=wire_name)
                if len(data["rows"]) < MIN_ROWS:
                    notes.append(f"cheapest-week {fares['origin']}: skipped, only {len(data['rows'])} rows (needs {MIN_ROWS})")
                    continue
                if not dry_run:
                    dst = os.path.join(out_dir, "data", "inputs")
                    os.makedirs(dst, exist_ok=True)
                    if os.path.abspath(os.path.join(dst, os.path.basename(fp))) != os.path.abspath(fp):
                        with open(fp, "rb") as a, open(os.path.join(dst, os.path.basename(fp)), "wb") as b:
                            b.write(a.read())
                    _write(out_dir, data, render_fares(data))
                slugs.append(data["slug"])
            continue
        else:
            continue
        if not dry_run:
            _write(out_dir, data, md)
        slugs.append(data["slug"])
    if not dry_run:
        write_snapshot(out_dir, snapshot_of(wire))
    return slugs, notes
