#!/usr/bin/env python3
"""Fill the numeric slots of typeSpecific from the text the master already holds (T151, spec D3).

typeSpecific.distanceKm, elevationM and verticalM were filled at ingest by taking the
first number found in a matching key. That grabbed base altitudes, depths and counts
(a ski trip with distanceKm 1050 is Engelberg's base altitude). This module re-derives
the three slots from the record's own words under one stated rule per trip type, writes
them back, and writes a basis file saying where each figure came from.

Nothing is invented and nothing is fetched. A slot stays null when the text does not
state the figure and the day lines cannot be summed into it.

    python pipeline/fill_type_specific.py report      # measure, write nothing
    python pipeline/fill_type_specific.py apply       # master, data/trips/*.json, basis file
    python pipeline/fill_type_specific.py check       # exit 1 if the files disagree with a fresh derivation
    python pipeline/fill_type_specific.py self-test
"""
from __future__ import annotations

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MASTER = os.path.join(ROOT, "data", "trips.master.json")
TRIPS_DIR = os.path.join(ROOT, "data", "trips")
BASIS = os.path.join(ROOT, "data", "type_specific_basis.json")

SLOTS = ("distanceKm", "elevationM", "verticalM")

# What each slot means, per trip type (SCHEMA.md carries the same table).
#   distanceKm : km covered over the week by the mode the trip is built around
#   elevationM : highest point the week reaches, metres above sea level
#   verticalM  : cumulative ascent over the week; for winter sports the vertical
#                drop of the main ski area
# A type missing from a slot's list never gets that slot, even if a number is nearby.
APPLIES = {
    "distanceKm": {"cycling", "trail-running", "hiking", "road-trip", "city", "cozy-towns",
                   "culinary", "nature-escape", "water-sports", "winter-sports"},
    "elevationM": {"cycling", "trail-running", "hiking", "road-trip", "winter-sports",
                   "nature-escape"},
    "verticalM": {"cycling", "trail-running", "hiking", "winter-sports", "nature-escape",
                  "city", "cozy-towns", "culinary"},
}

NUM = r"(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?"
RNG = rf"({NUM})(?:\s*(?:–|-|to)\s*({NUM}))?"


def _n(s):
    return float(s.replace(",", ""))


def low(a, b=None):
    """The figure a stated range stands for: its low end, as a whole number.

    "330-370 km" gives 330. The low end is what the ingest already used for the 114
    figures that were right, so keeping it leaves those unchanged, and it never
    overstates a week. The basis file keeps the full text, so the range is recoverable.
    """
    return int(round(_n(a)))


def clean(s):
    return re.sub(r"\s+", " ", str(s).replace("**", "").replace("*", "")).strip()


# ------------------------------------------------------------------ headline

def headline(t):
    """The one line each source wrote for 'distance and terrain', wherever it was kept."""
    ts = t["typeSpecific"]
    raw = ts.get("raw") or {}
    for key in ("Total Distance / Terrain", "Total distance"):
        if raw.get(key):
            return clean(raw[key])
        if (t.get("snapshot") or {}).get(key):
            return clean(t["snapshot"][key])
    return clean(ts["surface"]) if ts.get("surface") else ""


# ----------------------------------------------------------------- structured

KEYED = {
    "distanceKm": ("total_distance_km", "weekly_distance_km", "route_distance_km",
                   "total_driving_km", "nordic_network_km"),
    "elevationM": ("max_elevation_m", "top_elevation_m", "summit_elevation_m"),
    "verticalM": ("weekly_vertical_m", "vertical_drop_m", "elevation_gain_m"),
}


def keyed(t, slot):
    raw = t["typeSpecific"].get("raw") or {}
    for k in KEYED[slot]:
        v = raw.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return int(v), k
    if slot == "distanceKm" and t["tripTypeSlug"] == "road-trip":
        v = raw.get("Total distance")
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return int(v), "Total distance"
    return None


# ------------------------------------------------------------------- distance

_KM = rf"{RNG}\s*km\b"
_NM = rf"{RNG}\s*nautical miles"

DIST_AFTER = {
    # the figure must be followed by the mode the type is about
    "city": r"(?:on foot|walking|walked)",
    "cozy-towns": r"(?:walked|walking|on foot)",
    "nature-escape": r"(?:walking|walked|on foot|by bicycle|by bike|cycling|hiking)",
    "water-sports": r"(?:of (?:sailing|paddling|kayak\w*|coastline covered|coastal passages)|"
                    r"sailing|paddling|by kayak)",
}


def distance_from_text(t, text, extra=""):
    slug = t["tripTypeSlug"]
    if slug in ("cycling", "trail-running", "hiking", "road-trip", "culinary"):
        # approx. 330-370 km ...  / ~1,050 km over 7 days.  A culinary headline leads with
        # the km between villages and venues (rail, road, boat); walked km come second.
        m = re.search(_KM, text, re.I)
        return (low(m.group(1), m.group(2)), m.group(0)) if m else None
    if slug == "winter-sports":
        for pat in (rf"{_KM}\s*(?:of\s+)?(?:piste|pistes|skiable|marked piste)",
                    rf"(?:piste|pistes)\s*(?:network\s*)?(?:of\s*)?(?:approx\.?\s*)?{RNG}\s*km"):
            m = re.search(pat, text, re.I)
            if m:
                return low(m.group(1), m.group(2)), m.group(0)
        m = re.search(rf"({NUM})\s*km of (?:skiable terrain|piste|pistes|marked piste)", extra, re.I)
        return (low(m.group(1)), m.group(0)) if m else None
    if slug == "water-sports":
        m = re.search(rf"{_NM}\s*{DIST_AFTER[slug]}", text, re.I)
        if m:
            return int(round(low(m.group(1), m.group(2)) * 1.852)), m.group(0) + " (nautical miles x 1.852)"
        m = re.search(rf"{_KM}\s*{DIST_AFTER[slug]}", text, re.I)
        return (low(m.group(1), m.group(2)), m.group(0)) if m else None
    after = DIST_AFTER.get(slug)
    if after:
        m = re.search(rf"{_KM}\s*{after}", text, re.I)
        if m:
            return low(m.group(1), m.group(2)), m.group(0)
    return None


# Day lines that can be summed into a week figure. Only for types whose day line
# is a measured line of the route itself.
SUMMABLE = {"cycling", "trail-running", "hiking", "road-trip", "city"}


def day_km(text, lead=False):
    """First km figure of a day line, as a float (low end of a range). With lead=True the
    line must open with the figure, which is how a city day line reads ("6.3 km, 110 m ascent")
    and keeps "Sofia, 20 km round trip + 4 km walking" out."""
    s = (text or "").strip()
    m = re.match(rf"~?{_KM}", s, re.I) if lead else re.search(_KM, s, re.I)
    return _n(m.group(1)) if m else None


def day_km_lead(text):
    return day_km(text, lead=True)


def day_ascent(text):
    s = text or ""
    for pat in (rf"\+\s*{RNG}\s*m\b(?!\s*(?:descent|desc))",
                rf"{RNG}\s*m\s*(?:of\s+)?(?:ascent|climb|climbing|gain|vert|D\+)(?![a-z])",
                rf"(?:ascent|climb|climbing|gain)\s*(?:of\s*)?(?:approx\.?\s*)?{RNG}\s*m\b",
                rf"{RNG}\s*m up\b",
                rf"\+\s*{RNG}(?=\s*(?:/|$))"):
        m = re.search(pat, s, re.I)
        if m:
            return low(m.group(1), m.group(2))
    return None


def summed(t, fn):
    days = t.get("itinerary") or []
    vals = [fn(d.get("dayStats")) for d in days]
    got = [v for v in vals if v is not None]
    if len(days) < 5 or len(got) < len(days) - 1:      # at most one day may be silent
        return None
    return int(round(sum(got))), len(got)


# ------------------------------------------------------------------- vertical

_ASC = (
    rf"\+?\s*{RNG}\s*m\s*(?:of\s+)?(?:cumulative|total|combined)\s*(?:stair\s+)?(?:gain|ascent|climb|climbing|elevation gain)?",
    rf"(?:cumulative|total|combined)\s*(?:gain|ascent|climb|climbing)\s*(?:of\s*)?{RNG}\s*m",
    rf"{RNG}\s*m\s*(?:of\s+)?(?:ascent|climb|climbing|gain)\s*/\s*{NUM}\s*m\s*descent",
    rf"\+\s*{RNG}\s*m\s*(?:total|over the week|for the week)",
    rf"{RNG}\s*m\s*vert\b",
)


def winter_vertical(t, text):
    """Vertical drop of the main ski area: stated outright, else base to top in one segment."""
    ts = t["typeSpecific"]
    pool = " ; ".join([text, clean(ts.get("liftNetwork") or ""), clean(ts.get("snowReliability") or "")])
    for pat in (rf"{RNG}\s*m\s*(?:of\s+)?vertical(?:\s+drop)?\b", rf"vertical(?:\s+drop)?\s*(?:of\s*)?(?:approx\.?\s*|about\s*|~)?{RNG}\s*m\b"):
        m = re.search(pat, pool, re.I)
        if m:
            return low(m.group(1), m.group(2)), m.group(0), "stated"
    first = text.split(";")[0]
    m = re.search(rf"\bbase\b[^;]*?({NUM})\s*m\b[^;]*?\b(?:to|top)\b[^;]*?({NUM})\s*m\b", first, re.I)
    if m and "only" not in first.lower():
        lo, hi = int(_n(m.group(1))), int(_n(m.group(2)))
        if hi > lo:
            return hi - lo, m.group(0) + f" (top {hi} less base {lo})", "derived"
    return None


def vertical_from_text(t, text):
    slug = t["tripTypeSlug"]
    if slug == "winter-sports":
        return winter_vertical(t, text)
    for pat in _ASC:
        m = re.search(pat, text, re.I)
        if m:
            if not re.search(r"cumulative|total|combined|/|over the week|for the week|vert", m.group(0), re.I):
                continue
            return low(m.group(1), m.group(2)), m.group(0)
    # hiking and trail running state a bare "N m ascent" for the week
    if slug in ("hiking", "trail-running", "nature-escape"):
        m = re.search(rf"{RNG}\s*m\s*(?:of\s+)?(?:ascent|climb|climbing|gain)\b", text, re.I)
        if m:
            return low(m.group(1), m.group(2)), m.group(0)
    return None


# ------------------------------------------------------------------ elevation

_ELEV = (
    rf"max(?:imum)?\.?\s*(?:altitude|elevation)\s*(?:of\s*|about\s*|approx\.?\s*|~)?{RNG}\s*m",
    rf"(?:highest|high)\s*(?:point|pass|summit|col)?\s*(?:at|of|is|:)?\s*(?:approx\.?\s*|about\s*|~)?{RNG}\s*m\b",
    rf"(?:up to|peaks? (?:to|at)|tops? (?:at|out at)|ringed by [\w ]+? to|to a (?:high )?(?:point|summit) of)\s*(?:approx\.?\s*|about\s*|~)?{RNG}\s*m\b",
    rf"(?:summit|peak)\s*(?:at\s*|of\s*)?(?:approx\.?\s*)?{RNG}\s*m\b",
    rf"(?:over|above)\s*{RNG}\s*m\s*(?:pass|passes)",
)


def elevation_from_text(t, text):
    slug = t["tripTypeSlug"]
    if slug == "winter-sports":
        # base 1,304 m to top 2,811 m / base 1,050 m at Engelberg, top 3,020 m at Titlis /
        # Zugspitze glacier, 2,000 m to 2,962 m.  Read only the segments that talk about a
        # base or a glacier, so a day trip's "up to 2,222 m" is not taken for the resort's top,
        # and skip a top marked "only" (a ridge tour the lifts do not reach).
        tops = []
        for seg in text.split(";"):
            if not re.search(r"base|glacier", seg, re.I):
                continue
            for m in re.finditer(rf"(?:\btop\b[^;,()]{{0,25}}?|\bto\s*(?:approx\.?\s*)?){RNG}\s*m\b(?![^;]{{0,40}}only)", seg, re.I):
                tops.append((low(m.group(1), m.group(2)), m.group(0)))
        if not tops:
            lift = clean(t["typeSpecific"].get("liftNetwork") or "")
            for m in re.finditer(rf"top station[^;.]{{0,30}}?({NUM})\s*m\b|\btops? (?:at|out at)\s*({NUM})\s*m\b", lift, re.I):
                tops.append((int(_n(m.group(1) or m.group(2))), m.group(0)))
        return max(tops) if tops else None
    for pat in _ELEV:
        m = re.search(pat, text, re.I)
        if m:
            return low(m.group(1), m.group(2)), m.group(0)
    return None


MENTION_TYPES = {"cycling", "trail-running", "hiking", "road-trip", "nature-escape"}
_ALT_NOUN = r"(?:peak|summit|pass|col|top|saddle|scharte|joch|sattel|altitude|a\.s\.l\.?)"
_MENTION = (
    # a name followed by its height in brackets: Grosser Priel (2,515 m)
    re.compile(rf"[A-Z][^\W\d_]+[^(;]{{0,30}}\(~?\s*({NUM})\s*m\b\)"),
    # a high-point word, then the figure: summit 2,811 m / pass at 1,920 m
    re.compile(rf"{_ALT_NOUN}\s*(?:at|of|is|:)?\s*(?:approx\.?\s*|about\s*|~)?({NUM})\s*m\b", re.I),
)


def mentioned_elevation(t):
    """Highest altitude the day lines and day titles give for a place on the route.

    Only the measured line and the title are read, never the prose, because prose names
    peaks that are seen from the route and not reached by it. A figure counts only with an
    high-point cue beside it (a name and its height in brackets, or a peak, summit, pass, col,
    top or saddle word). "At 860 m" can be a hut or a bail-out and a bare "800 m" is as likely
    to be a climb as a height, so both are skipped. The result can still understate the week's
    true high point, which is why the basis file marks it "mentioned" and not "stated".
    """
    best = None
    for d in t.get("itinerary") or []:
        for field in ("dayStats", "title"):
            text = clean(d.get(field) or "")
            for rx in _MENTION:
                for m in rx.finditer(text):
                    v = int(round(_n(m.group(1))))
                    if 200 <= v <= 6000 and (best is None or v > best[0]):
                        best = (v, m.group(0))
    return best


# ----------------------------------------------------------------- derivation

def derive(t):
    """slot -> {value, basis, text}. Absent slot = not stated, left null."""
    slug = t["tripTypeSlug"]
    head = headline(t)
    out = {}

    for slot in SLOTS:
        if slug not in APPLIES[slot]:
            continue
        k = keyed(t, slot)
        if k:
            out[slot] = {"value": k[0], "basis": "key", "text": k[1]}
            continue
        hit = None
        if slot == "distanceKm":
            ts = t["typeSpecific"]
            hit = distance_from_text(t, head, clean(ts.get("liftNetwork") or "") + " " + clean(ts.get("snowReliability") or ""))
        elif slot == "verticalM":
            hit = vertical_from_text(t, head)
        elif slot == "elevationM":
            hit = elevation_from_text(t, head)
        if hit and slug in SUMMABLE and slot == "distanceKm":
            # A headline that opens with one day's km ("Day 1 ..., 40 km") is not the week.
            # When the day lines add to more than twice the figure, the sum is the week.
            s = summed(t, day_km_lead if slug == "city" else day_km)
            if s and hit[0] * 2 < s[0]:
                hit = None
        if hit:
            out[slot] = {"value": hit[0], "basis": hit[2] if len(hit) > 2 else "stated", "text": hit[1]}
            continue
        if slot == "elevationM" and slug in MENTION_TYPES:
            h = mentioned_elevation(t)
            if h:
                out[slot] = {"value": h[0], "basis": "mentioned", "text": clean(h[1])}
                continue
        if slug in SUMMABLE and slot in ("distanceKm", "verticalM"):
            s = summed(t, (day_km_lead if slug == "city" else day_km) if slot == "distanceKm" else day_ascent)
            if s and s[0] > 0:
                out[slot] = {"value": s[0], "basis": "summed", "text": f"sum of {s[1]} day lines"}
    return out


def agreement(t, d):
    """Where a stated total and the summed day lines both exist, how far apart are they."""
    gaps = {}
    for slot, fn in (("distanceKm", day_km_lead if t["tripTypeSlug"] == "city" else day_km), ("verticalM", day_ascent)):
        if slot in d and d[slot]["basis"] == "stated" and t["tripTypeSlug"] in SUMMABLE:
            s = summed(t, fn)
            if s and d[slot]["value"]:
                gaps[slot] = round(s[0] / d[slot]["value"], 2)
    return gaps


# ------------------------------------------------------------------- file io

def _read(path):
    with open(path, "rb") as fh:
        return json.loads(fh.read().decode("utf-8"))


def _dump(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2).replace("\n", "\r\n").encode("utf-8")


def apply_to(t, derived):
    """Set the three slots on one record from a derivation. Returns the slots that changed."""
    ts = t["typeSpecific"]
    changed = []
    for slot in SLOTS:
        new = derived[slot]["value"] if slot in derived else None
        if ts.get(slot) != new:
            ts[slot] = new
            changed.append(slot)
    return changed


def build(master):
    basis, rows = {}, {}
    for t in master["trips"]:
        d = derive(t)
        rows[t["id"]] = d
        if d:
            basis[t["id"]] = {s: d[s] for s in SLOTS if s in d}
    return basis, rows


def counts(trips):
    out = {}
    for t in trips:
        slug = t["tripTypeSlug"]
        c = out.setdefault(slug, {"n": 0, **{s: 0 for s in SLOTS}})
        c["n"] += 1
        for s in SLOTS:
            if t["typeSpecific"].get(s) is not None:
                c[s] += 1
    return out


def cmd_report():
    master = _read(MASTER)
    basis, rows = build(master)
    before = counts(master["trips"])
    changed = {s: 0 for s in SLOTS}
    wrong_before = []
    for t in master["trips"]:
        d = rows[t["id"]]
        for s in SLOTS:
            old = t["typeSpecific"].get(s)
            new = d[s]["value"] if s in d else None
            if old != new:
                changed[s] += 1
                if old is not None:
                    wrong_before.append((t["id"], s, old, new))
    for t in master["trips"]:
        apply_to(t, rows[t["id"]])
    after = counts(master["trips"])
    print("slot, before -> after, per type")
    for slug in sorted(before):
        print(f"{slug:15} n={before[slug]['n']:2}  " + "  ".join(
            f"{s[:5]} {before[slug][s]:2}->{after[slug][s]:2}" for s in SLOTS))
    tot_b = {s: sum(v[s] for v in before.values()) for s in SLOTS}
    tot_a = {s: sum(v[s] for v in after.values()) for s in SLOTS}
    print("totals", tot_b, "->", tot_a)
    print("changed values", changed)
    print("previously populated, now different:", len(wrong_before))
    for r in wrong_before:
        print("   ", r)
    return 0


def cmd_apply():
    master = _read(MASTER)
    basis, rows = build(master)
    n = 0
    for t in master["trips"]:
        ch = apply_to(t, rows[t["id"]])
        if ch:
            n += 1
            path = os.path.join(TRIPS_DIR, t["id"] + ".json")
            single = _read(path)
            apply_to(single, rows[t["id"]])
            with open(path, "wb") as fh:
                fh.write(_dump(single))
    with open(MASTER, "wb") as fh:
        fh.write(_dump(master))
    with open(BASIS, "wb") as fh:
        fh.write(_dump({"note": "Where each filled typeSpecific numeric came from. Written by "
                                "pipeline/fill_type_specific.py; do not edit by hand.",
                        "trips": basis}))
    print(f"{n} records changed")
    return 0


BOUNDS = {"distanceKm": (1, 3000), "elevationM": (0, 5000), "verticalM": (0, 60000)}


def cmd_check():
    master = _read(MASTER)
    basis, rows = build(master)
    bad = 0
    for t in master["trips"]:
        for s in SLOTS:
            v = t["typeSpecific"].get(s)
            lo, hi = BOUNDS[s]
            if v is not None and (isinstance(v, bool) or not isinstance(v, int) or not lo <= v <= hi):
                bad += 1
                print("out of bounds", t["id"], s, v)
        for s in SLOTS:
            want = rows[t["id"]][s]["value"] if s in rows[t["id"]] else None
            if t["typeSpecific"].get(s) != want:
                bad += 1
                print("master differs", t["id"], s, t["typeSpecific"].get(s), want)
        single = _read(os.path.join(TRIPS_DIR, t["id"] + ".json"))
        if single["typeSpecific"] != t["typeSpecific"]:
            bad += 1
            print("single file differs from master", t["id"])
    if os.path.exists(BASIS):
        if _read(BASIS)["trips"] != json.loads(json.dumps(basis)):
            bad += 1
            print("basis file is stale")
    else:
        bad += 1
        print("basis file missing")
    print("ok" if not bad else f"{bad} problems")
    return 1 if bad else 0


def cmd_self_test():
    def trip(slug, head, days=None, raw=None):
        return {"tripTypeSlug": slug, "snapshot": {"Total Distance / Terrain": head},
                "typeSpecific": {"raw": raw or {}, "surface": None},
                "itinerary": [{"dayStats": d} for d in (days or [])]}

    cases = [
        (trip("cycling", "approx. 330–370 km, roughly 1,100 m cumulative gain; ~95% asphalt"),
         {"distanceKm": 330, "verticalM": 1100}),
        (trip("hiking", "approx. 60–68 km, 5,600 m ascent / 5,600 m descent; scree"),
         {"distanceKm": 60, "verticalM": 5600}),
        (trip("winter-sports", "Ski Arlberg: approx. 305 km piste, base 1,304 m to top 2,811 m"),
         {"distanceKm": 305, "elevationM": 2811, "verticalM": 1507}),
        (trip("winter-sports", "4 Vallees network; base 820 m at Le Chable, top 3,330 m at Mont-Fort"),
         {"elevationM": 3330}),
        (trip("road-trip", "approx. 1,350 km; hairpins, gradients to 14%, max altitude 2,829 m"),
         {"distanceKm": 1350, "elevationM": 2829}),
        (trip("city", "65–80 km on foot over seven days, flat"), {"distanceKm": 65}),
        (trip("water-sports", "Roughly 70 nautical miles of coastal passages over the week"),
         {"distanceKm": 130}),
        (trip("water-sports", "Four lakes, roughly 25–65 m deep, ringed by peaks to 1,800 m"), {}),
        (trip("cozy-towns", "Approx. 260 km of driving; 30–35 km walked"), {"distanceKm": 30}),
        (trip("cycling", "no figures here", days=["40 km · +60 m", "46 km, +50 m", "45 km, +60 m",
                                                 "50 km, +10 m", "30 km, +0 m", "20 km, +5 m", "20 km, +5 m"]),
         {"distanceKm": 251, "verticalM": 190}),
        (trip("trail-running", "x", raw={"weekly_vertical_m": 5200}), {"verticalM": 5200}),
    ]
    bad = 0
    for t, want in cases:
        got = {s: v["value"] for s, v in derive(t).items()}
        if got != want:
            bad += 1
            print("FAIL", t["tripTypeSlug"], t["snapshot"]["Total Distance / Terrain"][:50], got, want)
    print("self-test:", len(cases) - bad, "of", len(cases))
    return 1 if bad else 0


if __name__ == "__main__":
    cmds = {"report": cmd_report, "apply": cmd_apply, "check": cmd_check, "self-test": cmd_self_test}
    sys.exit(cmds[sys.argv[1] if len(sys.argv) > 1 else "report"]())
