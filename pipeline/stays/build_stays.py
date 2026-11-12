"""Build the stays wire (layer since schema v18) from the Booking + Hostelworld scrape alone.

T1021 (owner 2026-11-03): the scrape journal is the single source of truth.
The laptop scrapes (Booking turns away datacenter addresses) and uploads
journal_scrape.sqlite to the private R2 bucket; the box downloads it each month,
runs this build and publishes the country files to data/stays-live/v1/, which
the app already reads. Xotelo, Inside Airbnb, the Eurostat season fill, the
star ratios and the nearby / country / Europe fallbacks are gone.

Input (STATE): journal_scrape.sqlite, table obs, one row per property, bed and
check-in date (source booking | hostelworld).

Method, per destination and bed type:
  1. Rows that break the observation contract are dropped (T643): a currency
     other than EUR, not one night, not the searched adults, no price, an
     unknown unit. A Hostelworld private price per person is one of two in the
     room, so it is doubled to the room.
  2. Each property's prices are divided by that property's own median: the
     monthly medians of those ratios are the season curve. The median of the
     properties' medians is the level. One vote per source (T644).
  3. A month the scrape did not price takes the nearest scraped month before
     or after it in the same year (a tie goes to the earlier month); season_q
     marks the scraped months 'm' and the borrowed ones 'f'.
  4. Weekend factor: Friday vs the Tuesday of the same week, same property.
  5. Hotels by star: hotel2..5 where at least MIN_STAR_PROPS hotels of that
     class were priced, else no figure for that class.
  6. Entire place: Booking apartments searched for two, as bnb_home {"2": ...}.
     The app books as many places as the group needs.
  7. A destination the scrape did not reach gets no record: the app shows
     "Not available yet" rather than a borrowed price.

Writes OUT/v1/{iso2}.json and OUT/v1/manifest.json. Refuses fixture rows.
With --gate it compares against the previous build and exits 2 on a failed
gate, so the previous files stay live.

Usage:  python pipeline/stays/build_stays.py [--gate]
"""

import argparse
import hashlib
import os
import sys
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (BED_TYPES, CONTRACT_COLUMNS, JOURNAL_SCRAPE, OUT, ROOT,  # noqa: E402
                    STATE, UNITS, journal, load_destinations, median, now_iso,
                    read_json, write_json)
from booking.page import per_ok  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pricing_config import rule  # noqa: E402
from provenance import SCHEMA_VERSION  # noqa: E402  the manifest says the contract it was built under

# T693: the model and gate numbers come from continent-app/config/pricing.json
# (stays.model, gate.stays), the file the app reads too.
_MODEL = rule("stays.model")
_GATE = rule("gate.stays")

V = OUT / "v1"
SOURCES = ("booking", "hostelworld")
MAX_AGE_DAYS = _MODEL["max_age_days"]
# One OTA rate can be a typo or a suite: a price this far from the property's
# own median is dropped, and a month can move a price at most this far.
OUTLIER = _MODEL["outlier"]
CURVE_MIN, CURVE_MAX = _MODEL["curve_min"], _MODEL["curve_max"]
# Observation contract (T643). A row journalled before the contract columns
# existed takes its source's known behaviour, and counts as legacy:
#   booking      selected_currency=EUR is in every search URL; 12 cards sampled
#                on 2026-10-23 (Bergen, Kotor) all said "Includes taxes and
#                charges" and "1 night, 2 adults"
#   hostelworld  this laptop's pages showed euros without a currency in the URL
#                (2026-10-23); list prices are "From" prices and do not say
#                whether city tax is in (a Lisbon hostel page says it is not)
LEGACY = {"booking": {"currency": "EUR", "tax_included": 1, "from_or_discount": None},
          "hostelworld": {"currency": "EUR", "tax_included": None, "from_or_discount": 1}}
# What Hostelworld's "Privates From" is per when the journal row does not say
# (B4 sample, scripts/hw_unit_sample.py, 2026-10-23: per person, list prices
# ignore the guest count). A per-person private price is one of two sharing.
HW_PRIVATE_UNIT = _MODEL["hw_private_unit"]
HW_PRIVATE_GUESTS = _MODEL["hw_private_guests"]
# Rows that may not set a hotel level (T644): a price that says it is without
# taxes, or a "from" or discounted price, would put the level under what a
# traveller pays.
HOTEL_LEVEL_EXCLUDES = {"tax_included": 0, "from_or_discount": 1}
# Weekend factors need this many same-property pairs.
MIN_PAIRS = _GATE["min_pairs"]
# The publish gate (T645, owner decision B2), in config/pricing.json gate.stays.
REJECT_MAX = _GATE["reject_max"]              # contract rejections per source
JUMP_COUNTRY = _GATE["jump_country"]          # country x bed tier median move
JUMP_DEST = _GATE["jump_dest"]                # one destination's bed tier move
COVERAGE_DROP = _GATE["coverage_drop"]        # destinations priced per bed tier
MIN_STAR_PROPS = _GATE["min_star_props"]      # hotels behind a star class
EXPLAIN_TOLERANCE = _GATE["explain_tolerance"]
# The fixed test set (plan F0/F1): three named, plus one city, beach and mountain.
TEST_SET = {"gem:como": "Lake Como", "gem:kotor": "Kotor", "BGO": "Bergen",
            "OPO": "Porto (city)", "gem:lagos-pt": "Lagos (beach)",
            "gem:chamonix": "Chamonix (mountain)"}
EXPLAIN = Path(__file__).resolve().parent / "gate_explain.json"
# The last published build: the copy the app ships (apply_stays bakes it).
PUBLISHED = ROOT / "continent-app" / "public" / "stays" / "v1"


# ------------------------------------------------------------------ inputs -- #

def legacy_fields(src, bed, hw_unit):
    """Contract fields for a row journalled before T643, from what the source
    is known to do. None in `unit` or `currency` means unknown: rejected."""
    known = LEGACY.get(src)
    if not known:
        return {"currency": None, "unit": None, "tax_included": None, "from_or_discount": None}
    unit = "bed" if bed == "dorm" else "room"
    if src == "hostelworld" and bed == "private":
        unit = hw_unit
    return dict(known, unit=unit)


def contract(r, hw_unit):
    """(row, None) when the row meets the observation contract, else (None, reason)."""
    if r.get("currency") is None and r.get("unit") is None:
        r.update(legacy_fields(r["source"], r["bed"], hw_unit), legacy=True)
    elif r["source"] == "hostelworld" and r["bed"] == "private" and not r.get("unit"):
        r.update(unit=hw_unit, legacy=True)          # scraped before the B4 verdict
    if r.get("unit") not in UNITS:
        return None, "unit unknown"
    if r.get("currency") != "EUR":
        return None, f"currency {r.get('currency') or 'unknown'}"
    if r.get("nights") != 1:
        return None, "not one night"
    if r["source"] == "booking" and r.get("per_text") and not per_ok(r["per_text"], r["adults"]):
        return None, "not the searched adults"
    if not r.get("price_eur") or r["price_eur"] <= 0:
        return None, "no price"
    return r, None


def load_obs(con, iso_of, stats=None, hw_unit=HW_PRIVATE_UNIT):
    """Scrape observations newer than MAX_AGE_DAYS that meet the contract, per
    room (dorm: per bed). `stats` counts per source: rows read, legacy rows,
    and rejections by reason (T643)."""
    stats = {} if stats is None else stats
    have = {r[1] for r in con.execute("pragma table_info(obs)")}
    cols = ["source", "dest_id", "prop_key", "kind", "stars", "bed", "adults", "chk_in",
            "nights", "price_eur", "captured"] + [c for c, _ in CONTRACT_COLUMNS if c in have]
    cutoff = date.today().toordinal() - MAX_AGE_DAYS
    out = []
    for vals in con.execute(f"select {','.join(cols)} from obs"):
        r = dict(zip(cols, vals))
        src, did = r["source"], r["dest_id"]
        if src not in SOURCES or did not in iso_of:
            continue
        cap_d = datetime.fromisoformat(r["captured"].replace("Z", "")).date()
        if cap_d.toordinal() < cutoff:
            continue
        st = stats.setdefault(src, {"rows": 0, "legacy": 0, "rejected": defaultdict(int)})
        st["rows"] += 1
        r, why = contract(r, hw_unit)
        if why:
            st["rejected"][why] += 1
            continue
        st["legacy"] += bool(r.get("legacy"))
        price = r["price_eur"]
        if r["unit"] == "person":
            price *= HW_PRIVATE_GUESTS       # per person in a shared room -> the room
        out.append({"src": src, "dest": did, "key": f"{src}:{r['prop_key']}", "kind": r["kind"],
                    "stars": r["stars"], "bed": r["bed"], "adults": r["adults"],
                    "day": date.fromisoformat(r["chk_in"]), "price": price, "cap": cap_d,
                    "tax_included": r.get("tax_included"),
                    "from_or_discount": r.get("from_or_discount")})
    return out


def bed_key(o):
    """Observation -> the bed type it measures (None: not a bed we price)."""
    k, b = o["kind"], o["bed"]
    if b == "dorm":
        return "dorm"
    if k == "hostel" or (k == "guesthouse" and o["adults"] == 2):
        return "private"
    if k == "apartment":
        return "apt"
    if k == "hotel" and o["adults"] == 2:
        return f"hotel{min(max(o['stars'], 2), 5)}" if o["stars"] else "hotel"
    if k == "hotel" and o["adults"] == 1:
        return "single"
    return None


# ------------------------------------------------------------ per bed type -- #

def is_weekend_probe(day):
    return day.weekday() == 4


def curve_and_level(obs):
    """obs of one destination and bed type -> (level, rel[12] or None, n_props).

    One vote per source (T644): each source's median of its property medians,
    then the median of those, so Booking's 25 to 50 cards a page do not outvote
    Hostelworld's few. The month curve is weighted the same way."""
    base = [o for o in obs if not is_weekend_probe(o["day"])]
    by_src = defaultdict(lambda: defaultdict(list))
    for o in base:
        by_src[o["src"]][o["key"]].append(o)
    if not by_src:
        return None, [None] * 12, 0
    src_levels, src_curves, n = [], [], 0
    for by_prop in by_src.values():
        levels, rel = [], [[] for _ in range(12)]
        for ps in by_prop.values():
            med = median([p["price"] for p in ps])
            ps = [p for p in ps if med / OUTLIER <= p["price"] <= med * OUTLIER]
            med = median([p["price"] for p in ps])
            levels.append(med)
            for p in ps:
                rel[p["day"].month - 1].append(p["price"] / med)
        src_levels.append(median(levels))
        src_curves.append([median(r) if r else None for r in rel])
        n += len(by_prop)
    curve = [median([c[i] for c in src_curves if c[i]]) if any(c[i] for c in src_curves) else None
             for i in range(12)]
    return median(src_levels), curve, n


def normalise(curve):
    vals = [c for c in curve if c]
    if not vals:
        return curve
    mean = sum(vals) / len(vals)
    return [round(min(max(c / mean, CURVE_MIN), CURVE_MAX), 3) if c else None for c in curve]


def nearest_fill(curve):
    """Each month without a value takes the nearest month that has one, before
    or after it in the same year; a tie goes to the earlier month (owner,
    2026-11-03). Returns (filled curve, measured flags)."""
    flags = [c is not None for c in curve]
    known = [i for i, f in enumerate(flags) if f]
    if not known:
        return list(curve), flags
    out = [curve[min(known, key=lambda k: (abs(k - i), k))] for i in range(12)]
    return out, flags


def pair_ratio(obs, pick):
    """Median ratio of special-day prices to the same property's same-month
    base price (weekend: Friday vs the Tuesday of that month)."""
    base = defaultdict(list)
    for o in obs:
        if not is_weekend_probe(o["day"]):
            base[(o["key"], o["day"].year, o["day"].month)].append(o["price"])
    rs = []
    for o in obs:
        if pick(o["day"]):
            b = base.get((o["key"], o["day"].year, o["day"].month))
            if b:
                rs.append(o["price"] / median(b))
    return (round(median(rs), 3), len(rs)) if rs else (None, 0)


# ---------------------------------------------------------------- the build -- #

def build(dests, obs):
    """{dest_id: record} for every destination the scrape priced."""
    by_dest = defaultdict(lambda: defaultdict(list))
    for o in obs:
        k = bed_key(o)
        if k and (k.startswith("hotel") or k == "single") and any(
                o.get(f) == v for f, v in HOTEL_LEVEL_EXCLUDES.items()):
            continue
        if k:
            by_dest[o["dest"]][k].append(o)

    records = {}
    for d in dests:
        groups = by_dest.get(d["id"])
        if not groups:
            continue
        rec = {"id": d["id"], "beds": {}, "month": {}, "src": {}, "single": {}}
        flags_any = [False] * 12

        def put(wire, lvl, cur, n):
            nonlocal flags_any
            filled, fl = nearest_fill(normalise(cur))
            flags_any = [a or b for a, b in zip(flags_any, fl)]
            rec["month"][wire] = [round(lvl * (c or 1.0)) for c in filled]
            rec["src"][wire] = {"q": "measured", "n": n}

        for k in ("dorm", "private"):
            lvl, cur, n = curve_and_level(groups.get(k, []))
            if lvl:
                rec["beds"][k] = round(lvl)
                put(k, lvl, cur, n)

        for s in (2, 3, 4, 5):
            k = f"hotel{s}"
            lvl, cur, n = curve_and_level(groups.get(k, []))
            if lvl and n >= MIN_STAR_PROPS:
                rec["beds"][k] = round(lvl)
                put(k, lvl, cur, n)

        hotels = [o for k, v in groups.items() if k.startswith("hotel") for o in v]
        h_lvl, _, _ = curve_and_level(hotels)
        s_lvl, _, _ = curve_and_level(groups.get("single", []))
        if h_lvl and s_lvl:
            rec["single"]["hotel"] = round(s_lvl / h_lvl, 3)

        lvl, cur, n = curve_and_level(groups.get("apt", []))
        if lvl:
            rec["beds"]["bnb_home"] = {"2": round(lvl)}
            put("bnb_home", lvl, cur, n)

        if not rec["beds"]:
            continue
        pooled = [o for k, v in groups.items() if k != "single" for o in v]
        wk, wn = pair_ratio(pooled, is_weekend_probe)
        rec["weekend"] = wk if wk and wn >= MIN_PAIRS else None
        rec["peak"] = {}
        rec["season_q"] = "".join("m" if f else "f" for f in flags_any)
        rec["supply"] = {
            "hostel": "dorm" in rec["beds"] or "private" in rec["beds"],
            "hotel": any(k.startswith("hotel") for k in rec["beds"]),
            "hotel5": "hotel5" in rec["beds"],
            "bnb": "bnb_home" in rec["beds"],
        }
        rec["q"] = "measured"
        rec["captured"] = max(o["cap"] for v in groups.values() for o in v).isoformat()
        records[d["id"]] = rec
    return records


# ------------------------------------------------------------ gate + write -- #

def coverage(records):
    cov = defaultdict(lambda: defaultdict(int))
    for r in records.values():
        for k in BED_TYPES:
            q = (r["src"].get(k) or {}).get("q")
            cov[k][q or "none"] += 1
    return {k: dict(v) for k, v in cov.items()}


def bed_value(rec, k):
    """A record's annual price for one bed type (bnb_home: the place for two)."""
    v = ((rec or {}).get("beds") or {}).get(k)
    return (v.get("2") or v.get("4")) if isinstance(v, dict) else v


def summarise(records, iso_of):
    """{cc: {bed: median price}} and {cc: {bed: priced towns}} for the manifest,
    so the next build can compare against this one without its country files."""
    vals, cov = defaultdict(lambda: defaultdict(list)), defaultdict(lambda: defaultdict(int))
    for did, r in records.items():
        cc = iso_of.get(did)
        for k in BED_TYPES:
            v = bed_value(r, k)
            if cc and v:
                vals[cc][k].append(v)
                cov[cc][k] += (r["src"].get(k) or {}).get("q") == "measured"
    return ({cc: {k: round(median(v), 1) for k, v in kk.items()} for cc, kk in vals.items()},
            {cc: dict(kk) for cc, kk in cov.items()})


def load_prev():
    """(records or None, manifest or None, where) of the last PUBLISHED build:
    STAYS_PREV if set, else the copy the app ships (apply_stays bakes it), else
    the manifest alone (the box downloads only the live one)."""
    dirs = [Path(os.environ["STAYS_PREV"])] if os.environ.get("STAYS_PREV") else [PUBLISHED]
    for d in dirs:
        files = [f for f in d.glob("*.json") if f.name != "manifest.json"] if d.exists() else []
        if files:
            recs = {}
            for f in files:
                recs.update((read_json(f) or {}).get("dests") or {})
            return recs, read_json(d / "manifest.json"), str(d)
    m = read_json(V / "manifest.json")
    return None, m, str(V / "manifest.json") if m else None


def explained(explain, key, new):
    """A move passes when the explain file names it: same key, same new value (2%)."""
    return any(e.get("key") == key and e.get("new") is not None
               and abs(e["new"] - new) <= EXPLAIN_TOLERANCE * max(abs(new), 1) for e in explain)


def move(old, new):
    return (new / old - 1) if old and new else None


def gates(records, iso_of, stats=None, prev=None, prev_manifest=None, explain=()):
    """The publish gate (T645). Returns (fails, notes, report lines). Every
    check writes its lines; a fail blocks the publish unless explained."""
    fails, notes, rep = [], [], []
    levels, cc_cov = summarise(records, iso_of)
    if prev is not None:
        p_levels, p_cov = summarise(prev, iso_of)
    elif prev_manifest and prev_manifest.get("levels"):
        p_levels, p_cov = prev_manifest["levels"], prev_manifest.get("cc_cov") or {}
    else:
        p_levels, p_cov = None, None

    # 1. Contract.
    rep.append("## 1. Contract (rejected rows per source, block above "
               f"{REJECT_MAX:.0%})")
    for s, v in sorted((stats or {}).items()):
        rej = sum(v["rejected"].values())
        share = rej / v["rows"] if v["rows"] else 0
        rep.append(f"- {s}: {v['rows']} rows, {v['legacy']} legacy, {rej} rejected ({share:.1%}) {v['rejected']}")
        if share > REJECT_MAX:
            fails.append(f"contract: {s} rejected {share:.1%} of its rows {v['rejected']}")

    # 2. Jumps against the previous published version (B2).
    rep.append(f"\n## 2. Jumps (country x bed tier above {JUMP_COUNTRY:.0%}, "
               f"destination above {JUMP_DEST:.0%})")
    if p_levels is None:
        notes.append("no previous published version: jump and loss checks skipped")
        rep.append("- no previous published version: skipped")
    else:
        n_cc = n_dest = 0
        for cc, kk in sorted(p_levels.items()):
            for k, old in kk.items():
                new = (levels.get(cc) or {}).get(k)
                mv = move(old, new)
                if mv is not None and abs(mv) > JUMP_COUNTRY and not explained(explain, f"{cc}:{k}", new):
                    n_cc += 1
                    fails.append(f"jump {cc} {k}: {old:.0f} -> {new:.0f} ({mv:+.0%})")
        if prev is not None:
            for did, r in sorted(records.items()):
                for k in BED_TYPES:
                    old, new = bed_value(prev.get(did), k), bed_value(r, k)
                    mv = move(old, new)
                    if mv is not None and abs(mv) > JUMP_DEST and not explained(explain, f"{did}:{k}", new):
                        n_dest += 1
                        fails.append(f"jump {did} {k}: {old:.0f} -> {new:.0f} ({mv:+.0%})")
        else:
            notes.append("previous country files not available: per-destination jumps skipped")
        rep.append(f"- {n_cc} country x bed tier moves and {n_dest} destination moves over "
                   "the thresholds without an explain entry")

    # 3. Nothing priced goes missing.
    rep.append("\n## 3. Losses (a country loses all its prices, or a priced bed tier)")
    lost = 0
    for cc, kk in sorted((p_cov or {}).items()):
        had = {k for k, n in kk.items() if n}
        now = {k for k, n in (cc_cov.get(cc) or {}).items() if n}
        if had and not now:
            lost += 1
            fails.append(f"loss {cc}: had {sorted(had)}, now nothing priced")
            continue
        for k in sorted(had - now):
            lost += 1
            fails.append(f"loss {cc} {k}: priced before, not now")
    rep.append(f"- {lost} losses")

    # 4. The fixed test set, in euros.
    rep.append("\n## 4. Fixed test set (euros per night; destination threshold applies)\n")
    rep.append("| Destination | Bed | Before | After | Move | Status |")
    rep.append("|---|---|---|---|---|---|")
    for did, name in TEST_SET.items():
        r = records.get(did)
        for k in BED_TYPES:
            old, new = bed_value((prev or {}).get(did), k), bed_value(r, k)
            if old is None and new is None:
                continue
            mv = move(old, new)
            status = ("new" if old is None else "gone" if new is None else
                      "explained" if mv is not None and abs(mv) > JUMP_DEST and explained(explain, f"{did}:{k}", new)
                      else "BLOCKED" if mv is not None and abs(mv) > JUMP_DEST else "ok")
            rep.append(f"| {name} | {k} | {'' if old is None else round(old)} | "
                       f"{'' if new is None else round(new)} | "
                       f"{'' if mv is None else f'{mv:+.0%}'} | {status} |")

    # Coverage: destinations priced per bed tier (the T531 check, kept).
    if prev_manifest:
        for k, v in coverage(records).items():
            now = v.get("measured", 0)
            before = prev_manifest.get("coverage", {}).get(k, {}).get("measured", 0)
            if before and now < before * (1 - COVERAGE_DROP):
                fails.append(f"coverage {k}: priced destinations fell {before} -> {now}")
    return fails, notes, rep


def files_hash(folder):
    """sha256 over the country files of a build, in name order (not the manifest)."""
    h = hashlib.sha256()
    for f in sorted(Path(folder).glob("*.json")):
        if f.name != "manifest.json":
            h.update(f.name.encode())
            h.update(f.read_bytes())
    return h.hexdigest()


def write_report(fails, notes, rep, where):
    lines = [f"# Stays gate report, {now_iso()}", "",
             f"**{'PASSED' if not fails else 'FAILED'}**: {len(fails)} blocking, "
             f"{len(notes)} notes. Compared against: {where or 'nothing (first build)'}.", ""]
    lines += rep
    lines += ["", "## Blocking", ""] + [f"- {f}" for f in fails[:300]]
    if len(fails) > 300:
        lines.append(f"- ... and {len(fails) - 300} more")
    lines += ["", "## Notes", ""] + [f"- {n}" for n in notes]
    lines += ["", "A move that is right is listed in pipeline/stays/gate_explain.json "
              "(key, old, new, reason, who, date); key is CC:bed or destination:bed."]
    (STATE / "gate_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gate", action="store_true")
    ap.add_argument("--fresh", action="store_true",
                    help="judge against nothing (the first scrape-only build, T1021)")
    a = ap.parse_args()
    if not JOURNAL_SCRAPE.exists():
        sys.exit(f"no scrape journal at {JOURNAL_SCRAPE}")
    dests = load_destinations()
    iso_of = {d["id"]: d["iso2"] for d in dests}
    stats = {}
    obs = load_obs(journal(JOURNAL_SCRAPE), iso_of, stats)
    stats = {s: dict(v, rejected=dict(v["rejected"])) for s, v in stats.items()}
    for s, v in stats.items():
        print(f"contract {s}: {v['rows']} rows, {v['legacy']} legacy, rejected {v['rejected']}")
    records = build(dests, obs)
    prev_recs, prev, where = (None, None, None) if a.fresh else load_prev()
    fails, notes, rep = gates(records, iso_of, stats, prev_recs, prev, read_json(EXPLAIN, []) or [])
    write_report(fails, notes, rep, where)
    levels, cc_cov = summarise(records, iso_of)
    manifest = {
        "v": 1, "schema": SCHEMA_VERSION, "built": now_iso(), "n": len(records),
        "coverage": coverage(records),
        "sources": {s: sum(1 for o in obs if o["src"] == s) for s in SOURCES},
        "contract": stats,
        "levels": levels, "cc_cov": cc_cov,
        "gate": {"passed": not fails, "fails": fails[:300], "n_fails": len(fails),
                 "notes": notes, "against": where},
    }
    print("coverage:", manifest["coverage"])
    print("observations:", manifest["sources"], "destinations priced:", len(records), "of", len(dests))
    for n in notes:
        print("note:", n)
    print(f"gate {'passed' if not fails else 'FAILED'}: {len(fails)} blocking, "
          f"report at {STATE / 'gate_report.md'}")
    if a.gate and fails:
        for f in fails[:20]:
            print("GATE FAILED:", f)
        sys.exit(2)
    by_cc = defaultdict(dict)
    for d in dests:
        if d["id"] in records:
            by_cc[d["iso2"]][d["id"]] = records[d["id"]]
    for old in V.glob("*.json"):
        if old.name != "manifest.json":
            old.unlink()
    for cc, recs in by_cc.items():
        write_json(V / f"{cc}.json", {"v": 1, "cc": cc, "built": manifest["built"],
                                      "dests": recs}, compact=True)
    # The gate stamp (T646): apply_stays and the box publish only files whose
    # hash is the one a passed gate stamped here.
    h = files_hash(V)
    manifest["build"] = h[:12]
    manifest["gate"]["hash"] = h
    write_json(V / "manifest.json", manifest)
    print(f"wrote {len(by_cc)} country files to {V}")


if __name__ == "__main__":
    main()
