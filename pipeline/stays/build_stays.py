"""Build the stays wire (schema v18): one bed price per destination, bed type, month.

Inputs (STATE, pulled from R2 on Actions):
  journal.sqlite   dated observations: xotelo (monthly, Actions)
  journal_scrape.sqlite  booking + hostelworld (owner's laptop, twice a year)
  iab.json         Inside Airbnb medians per destination
  supply.json      OSM counts per destination
  eurostat.json    HICP CP112 (drift), nights (season fill-in), PLI (ladder)
  spike.json       hw_private_unit: person | room (B4 sample, T643; else HW_PRIVATE_UNIT)
  calibration.json SerpApi free-tier error (gate)

Method, per destination and bed type:
  1. Each observation is moved to today's price level with the country's HICP
     accommodation index, year on year (rate ** (months since capture / 12)),
     so the index's own seasonality is never added to ours.
  2. Each property's prices are divided by that property's own median: the
     monthly medians of those ratios are the season curve (normalised to mean
     1). The median of the properties' medians is the level.
  3. A month with no measurement takes the destination's pooled curve, then the
     country curve for that bed type, then Eurostat nights (damped ** 0.35).
     season_q says which months were measured.
  4. Weekend factor: Friday vs the Tuesday of the same week, same property.
     Peak factors: 14 Aug / 28 Dec / Easter Saturday vs that month's level.
  5. Stars: hotel2..5 are measured where >= 2 properties of that class were
     priced (class from Booking cards, or OSM stars matched to Xotelo hotels);
     otherwise the town's hotel level x the country's star ratio (q scaled).
  6. Airbnb: Inside Airbnb medians where the town has listings; else apartment
     prices scaled by the country's Airbnb/apartment ratio.
  7. A bed type with no measurement at all: the nearest measured destination of
     the same size within 30 km (q nearby, from, km), else the country median for
     that size (q modelled), else the European median x Eurostat price level.

Writes OUT/v1/{iso2}.json and OUT/v1/manifest.json. Refuses fixture rows.
With --gate it compares against the previous manifest and exits 2 on a failed
gate, so the workflow keeps the previous files live.

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
from common import (BED_TYPES, CONTRACT_COLUMNS, HOME_CAPS, JOURNAL_SCRAPE, OUT, ROOT,  # noqa: E402
                    STATE, UNITS, haversine_km, journal, load_destinations, median, now_iso,
                    read_json, write_json)
from booking.page import per_ok  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pricing_config import int_keys, rule  # noqa: E402

# T693: the model and gate numbers come from continent-app/config/pricing.json
# (stays.model, gate.stays), the file the app reads too.
_MODEL = rule("stays.model")
_GATE = rule("gate.stays")

V = OUT / "v1"
MAX_AGE_DAYS = _MODEL["max_age_days"]
NEAR_KM = _MODEL["near_km"]
PEAKS = {"aug15": (8, 14), "xmas": (12, 28)}
PLI_PROXY = _MODEL["pli_proxy"]
PLI_DEFAULT = _MODEL["pli_default"]
# Last-resort star ratios to the town's hotel level, used only when no country
# in Europe has measured both (never expected after the first runs).
STAR_DEFAULT = int_keys(_MODEL["star_default"])
SEASONAL_CHECK = ["PMI", "JTR", "DBV", "EDI"]
# One OTA rate can be a typo or a suite: a price this far from the property's
# own median is dropped, and a month can move a price at most this far.
OUTLIER = _MODEL["outlier"]
CURVE_MIN, CURVE_MAX = _MODEL["curve_min"], _MODEL["curve_max"]
# Star classes never come out cheaper than the class below (the T536 first
# build had Vienna's 4-star under its 3-star from 26 classed hotels).
STAR_STEP = _MODEL["star_step"]
# A country's season curve needs this many measured towns behind it; with
# fewer, one city's calendar (Barcelona's trade fairs) would become the
# country's, so the country's own Eurostat tourism season stands in.
MIN_CURVE_TOWNS = _GATE["min_curve_towns"]
SEASON_DAMP = _MODEL["season_damp"]
HOME_CAP_RATIOS = int_keys(_MODEL["home_cap_ratios"])
AIRBNB_HOME_RATIO = _MODEL["airbnb_home_ratio"]
AIRBNB_ROOM_RATIO = _MODEL["airbnb_room_ratio"]
# Observation contract (T643). A row journalled before the contract columns
# existed takes its source's known behaviour, and counts as legacy:
#   booking      selected_currency=EUR is in every search URL; 12 cards sampled
#                on 2026-10-23 (Bergen, Kotor) all said "Includes taxes and
#                charges" and "1 night, 2 adults"
#   hostelworld  this laptop's pages showed euros without a currency in the URL
#                (2026-10-23); list prices are "From" prices and do not say
#                whether city tax is in (a Lisbon hostel page says it is not)
#   xotelo       currency=EUR is requested; the OTAs' rates do not say
LEGACY = {"booking": {"currency": "EUR", "tax_included": 1, "from_or_discount": None},
          "hostelworld": {"currency": "EUR", "tax_included": None, "from_or_discount": 1},
          "xotelo": {"currency": "EUR", "tax_included": None, "from_or_discount": 0}}
# What Hostelworld's "Privates From" is per when the journal row does not say.
# B4 sample (scripts/hw_unit_sample.py, 2026-10-23): 259 hostels in 10 cities,
# private / dorm bed median 1.14 for 2 guests, so per person; the 2-guest and
# 1-guest list prices were the same (median ratio 1.0), so the list ignores the
# guest count. Without a verdict a private row with no unit is rejected.
HW_PRIVATE_UNIT = _MODEL["hw_private_unit"]
# A per-person private price is for one of two sharing the room.
HW_PRIVATE_GUESTS = _MODEL["hw_private_guests"]
# Rows that may not set a hotel level (T644): a price that says it is without
# taxes, or a "from" or discounted price, would put the level under what a
# traveller pays. Excluded, not adjusted: Booking already adds a "+€X taxes"
# line at scrape time, so a remaining 0 has no known factor, and a deal says
# nothing about the normal rate. NULL (the source does not say: Xotelo) stays
# in. Moves to config/pricing.json in F3.
HOTEL_LEVEL_EXCLUDES = {"tax_included": 0, "from_or_discount": 1}
# Weekend and peak factors need this many same-property pairs.
MIN_PAIRS = _GATE["min_pairs"]
# The publish gate (T645, owner decision B2), in config/pricing.json gate.stays.
REJECT_MAX = _GATE["reject_max"]              # contract rejections per source
JUMP_COUNTRY = _GATE["jump_country"]          # country x bed tier median move
JUMP_DEST = _GATE["jump_dest"]                # one destination's bed tier move
COVERAGE_DROP = _GATE["coverage_drop"]        # measured + nearby destinations per bed tier
MIN_STAR_PROPS = _GATE["min_star_props"]      # hotels behind a measured star class
SERPAPI_MAPE_MAX, SERPAPI_MIN_N = _GATE["serpapi_mape_max"], _GATE["serpapi_min_n"]
EXPLAIN_TOLERANCE = _GATE["explain_tolerance"]
# The fixed test set (plan F0/F1): three named, plus one city, beach and mountain.
TEST_SET = {"gem:como": "Lake Como", "gem:kotor": "Kotor", "BGO": "Bergen",
            "OPO": "Porto (city)", "gem:lagos-pt": "Lagos (beach)",
            "gem:chamonix": "Chamonix (mountain)"}
EXPLAIN = Path(__file__).resolve().parent / "gate_explain.json"
# The last published build: the copy the app ships (apply_stays bakes it).
PUBLISHED = ROOT / "continent-app" / "public" / "stays" / "v1"


def size_bucket(pop):
    return 0 if pop >= 250_000 else 1 if pop >= 50_000 else 2 if pop >= 10_000 else 3


def month_add(y, m, k):
    m += k
    return y + (m - 1) // 12, (m - 1) % 12 + 1


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


def load_obs(con, hicp, iso_of, stats=None, hw_unit=None):
    """Observations newer than MAX_AGE_DAYS that meet the contract, per room
    (dorm: per bed), levelled to today's prices. `stats` counts per source:
    rows read, legacy rows, and rejections by reason (T643)."""
    stats = {} if stats is None else stats
    have = {r[1] for r in con.execute("pragma table_info(obs)")}
    cols = ["source", "dest_id", "prop_key", "kind", "stars", "bed", "adults", "chk_in",
            "nights", "price_eur", "captured"] + [c for c, _ in CONTRACT_COLUMNS if c in have]
    cutoff = date.today().toordinal() - MAX_AGE_DAYS
    out = []
    for vals in con.execute(f"select {','.join(cols)} from obs"):
        r = dict(zip(cols, vals))
        src, did = r["source"], r["dest_id"]
        if src == "fixture" or did not in iso_of:
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
        price *= drift(hicp, iso_of[did], cap_d)
        out.append({"src": src, "dest": did, "key": f"{src}:{r['prop_key']}", "kind": r["kind"],
                    "stars": r["stars"], "bed": r["bed"], "adults": r["adults"],
                    "day": date.fromisoformat(r["chk_in"]), "price": price, "cap": cap_d,
                    "tax_included": r.get("tax_included"),
                    "from_or_discount": r.get("from_or_discount")})
    return out


def drift(hicp, cc, cap_d):
    series = hicp.get(cc) or hicp.get("EU") or {}
    if not series:
        return 1.0
    last = max(series)
    y, m = int(last[:4]), int(last[5:7])
    prev = f"{y - 1}-{m:02d}"
    if prev not in series or not series[prev]:
        return 1.0
    yoy = series[last] / series[prev]
    months = (y - cap_d.year) * 12 + (m - cap_d.month)
    return yoy ** (max(months, 0) / 12)


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


def is_peak(day):
    if (day.month, day.day) in PEAKS.values():
        return True
    return day.weekday() == 5 and day.month in (3, 4)


def curve_and_level(obs):
    """obs of one destination and bed type -> (level, rel[12] or None, n_props).

    One vote per source (T644): each source's median of its property medians,
    then the median of those, so Booking's 25 to 50 cards a page no longer
    outvote Xotelo's 4 anchors a town. The month curve is weighted the same
    way: per source, then the median across sources. One source alone gives
    its own median, as before."""
    base = [o for o in obs if not is_weekend_probe(o["day"]) and not is_peak(o["day"])]
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
    curve = [median([c[i] for c in src_curves]) for i in range(12)]
    return median(src_levels), curve, n


def normalise(curve):
    vals = [c for c in curve if c]
    if not vals:
        return curve
    mean = sum(vals) / len(vals)
    return [round(min(max(c / mean, CURVE_MIN), CURVE_MAX), 3) if c else None for c in curve]


def fill(curve, *fallbacks):
    """Fill gaps from fallbacks; returns (curve, measured flags).

    A fallback is on its own scale (a country curve averages 1.0 over its own
    year), so before it fills a gap it is scaled to the months already known:
    the median of known / fallback over those months (T539). With the lean
    scrape measuring 5 months, the other 7 then follow the fallback's shape at
    the town's own level instead of jumping to the country's."""
    flags = [c is not None for c in curve]
    out = list(curve)
    for fb in fallbacks:
        if not fb:
            continue
        both = [out[i] / fb[i] for i in range(12) if out[i] and fb[i]]
        k = median(both) if both else 1.0
        for i in range(12):
            if out[i] is None and fb[i]:
                out[i] = fb[i] * k
    out = [c if c else 1.0 for c in out]
    mean = sum(out) / 12
    return [round(c / mean, 3) for c in out], flags


def pair_ratio(obs, pick):
    """Median ratio of special-day prices to the same property's same-month
    base price (weekend: Friday vs Tuesday; peak: peak day vs month level)."""
    base = defaultdict(list)
    for o in obs:
        if not is_weekend_probe(o["day"]) and not is_peak(o["day"]):
            base[(o["key"], o["day"].year, o["day"].month)].append(o["price"])
    rs = []
    for o in obs:
        if pick(o["day"]):
            b = base.get((o["key"], o["day"].year, o["day"].month))
            if b:
                rs.append(o["price"] / median(b))
    return (round(median(rs), 3), len(rs)) if rs else (None, 0)


# ---------------------------------------------------------------- the build -- #

def build(dests, obs, iab, supply, euro):
    by_dest = defaultdict(lambda: defaultdict(list))
    for o in obs:
        k = bed_key(o)
        if k and (k.startswith("hotel") or k == "single") and any(
                o.get(f) == v for f, v in HOTEL_LEVEL_EXCLUDES.items()):
            continue
        if k:
            by_dest[o["dest"]][k].append(o)
    nights = euro.get("nights") or {}
    pli = euro.get("pli") or {}

    # Pass 1: measured levels and raw curves per destination and bed.
    meas = {}
    for d in dests:
        m = {}
        for k, os_ in by_dest[d["id"]].items():
            lvl, cur, n = curve_and_level(os_)
            if lvl:
                m[k] = {"level": lvl, "curve": normalise(cur), "n": n}
        hotels_all = [o for k, v in by_dest[d["id"]].items()
                      if k.startswith("hotel") for o in v]
        lvl, cur, n = curve_and_level(hotels_all)
        if lvl:
            m["hotel_all"] = {"level": lvl, "curve": normalise(cur), "n": n}
        pooled = [o for k, v in by_dest[d["id"]].items() if k != "single" for o in v]
        _, pc, _ = curve_and_level(pooled)
        m["_pooled"] = normalise(pc)
        m["_weekend"] = pair_ratio(pooled, is_weekend_probe)
        # A peak factor needs MIN_PAIRS pairs, like the weekend factor (T644):
        # one property's 14 August used to set the town's.
        peaks = {name: pair_ratio(pooled, lambda day, mm=mm, dd=dd:
                                  (day.month, day.day) == (mm, dd))
                 for name, (mm, dd) in PEAKS.items()}
        peaks["easter"] = pair_ratio(pooled, lambda day: day.weekday() == 5 and day.month in (3, 4))
        m["_peaks"] = {name: r for name, (r, n) in peaks.items() if n >= MIN_PAIRS}
        meas[d["id"]] = m

    # Country aggregates: curves, star ratios, Airbnb ratios, levels by size.
    cc_curve = defaultdict(lambda: defaultdict(lambda: [[] for _ in range(12)]))
    curve_towns = defaultdict(lambda: defaultdict(int))
    star_ratio = defaultdict(lambda: defaultdict(list))
    bnb_ratio = defaultdict(lambda: defaultdict(list))
    lvl_by = defaultdict(lambda: defaultdict(list))
    cap_ratio = defaultdict(list)
    for d in dests:
        m, cc = meas[d["id"]], d["iso2"]
        for k, v in m.items():
            if k.startswith("_"):
                continue
            curve_towns[cc][k] += 1
            for i, c in enumerate(v["curve"]):
                if c:
                    cc_curve[cc][k][i].append(c)
            lvl_by[(cc, k)][size_bucket(d["pop"])].append(v["level"])
            lvl_by[("EU", k)][size_bucket(d["pop"])].append(v["level"] / (pli.get(cc, PLI_DEFAULT) / 100))
        if "hotel_all" in m:
            for s in (2, 3, 4, 5):
                if f"hotel{s}" in m and m[f"hotel{s}"]["n"] >= 2:
                    r = m[f"hotel{s}"]["level"] / m["hotel_all"]["level"]
                    star_ratio[cc][s].append(r)
                    star_ratio["EU"][s].append(r)
        ia = (iab.get(d["id"]) or {})
        h4 = (ia.get("home") or {}).get("4")
        if h4 and "apt" in m:
            bnb_ratio[cc]["home"].append(h4 / m["apt"]["level"])
        if ia.get("room") and "private" in m:
            bnb_ratio[cc]["room"].append(ia["room"] / m["private"]["level"])
        if h4:
            lvl_by[(cc, "iab_home")][size_bucket(d["pop"])].append(h4)
            lvl_by[("EU", "iab_home")][size_bucket(d["pop"])].append(h4 / (pli.get(cc, PLI_DEFAULT) / 100))
            for c in HOME_CAPS:
                v = (ia.get("home") or {}).get(str(c))
                if v:
                    cap_ratio[c].append(v / h4)
    cc_curve = {cc: {k: [median(x) if x else None for x in v] for k, v in kk.items()
                     if curve_towns[cc][k] >= MIN_CURVE_TOWNS}
                for cc, kk in cc_curve.items()}
    ratio = lambda table, cc, k, default: (median(table[cc][k]) if table[cc][k] else  # noqa: E731
                                          median(table["EU"][k]) if table["EU"][k] else default)
    caps = {c: (median(v) if v else HOME_CAP_RATIOS[c]) for c, v in cap_ratio.items()}
    for c in HOME_CAPS:
        caps.setdefault(c, HOME_CAP_RATIOS[c])

    # Europe's season, the mean of the countries Eurostat covers: the last
    # fallback for a country it does not (the UK, Bosnia).
    eu_nights = ([round(sum(v[i] for v in nights.values()) / len(nights), 3)
                  for i in range(12)] if nights else None)

    def nights_curve(cc):
        n = nights.get(cc) or eu_nights
        return [round(x ** SEASON_DAMP, 3) for x in n] if n else None

    # Pass 2: every bed type for every destination.
    records = {}
    measured_index = defaultdict(list)       # bed -> [(dest, level)] measured
    for d in dests:
        m = meas[d["id"]]
        for k in ("dorm", "private", "hotel_all", "apt", "hotel2", "hotel3",
                  "hotel4", "hotel5"):
            if k in m:
                measured_index[k].append((d, m[k]["level"]))
        if (iab.get(d["id"]) or {}).get("home", {}).get("4"):
            measured_index["iab_home"].append((d, iab[d["id"]]["home"]["4"]))

    for d in dests:
        cc, m = d["iso2"], meas[d["id"]]
        rec = {"id": d["id"], "beds": {}, "month": {}, "src": {}, "single": {}}
        flags_any = [False] * 12

        def curve_for(k, raw):
            nonlocal flags_any
            c, fl = fill(raw or [None] * 12, m.get("_pooled"),
                         (cc_curve.get(cc) or {}).get(k),
                         (cc_curve.get(cc) or {}).get("hotel_all"),
                         nights_curve(cc))
            flags_any = [a or b for a, b in zip(flags_any, fl)]
            return c

        def ladder(k):
            """(level, src) for a bed type with no own measurement."""
            near = None
            for od, lvl in measured_index.get(k, []):
                if od["id"] == d["id"] or size_bucket(od["pop"]) != size_bucket(d["pop"]):
                    continue
                if abs(od["lat"] - d["lat"]) > 0.4 or abs(od["lon"] - d["lon"]) > 0.6:
                    continue
                km = haversine_km(d["lat"], d["lon"], od["lat"], od["lon"])
                if km <= NEAR_KM and (near is None or km < near[2]):
                    near = (od, lvl, km)
            if near:
                od, lvl, km = near
                a = (iab.get(d["id"]) or {}).get("home", {}).get("4")
                b = (iab.get(od["id"]) or {}).get("home", {}).get("4")
                scale = min(max(a / b, 0.6), 1.6) if a and b else 1.0
                return lvl * scale, {"q": "nearby", "from": od["city"], "km": round(km)}
            sb = size_bucket(d["pop"])
            own = lvl_by.get((cc, k)) or {}
            vals = own.get(sb) or [x for v in own.values() for x in v]
            if vals:
                return median(vals), {"q": "modelled", "n": len(vals)}
            eu = lvl_by.get(("EU", k)) or {}
            vals = eu.get(sb) or [x for v in eu.values() for x in v]
            if vals:
                p = pli.get(cc) or pli.get(PLI_PROXY.get(cc, ""), PLI_DEFAULT)
                return median(vals) * p / 100, {"q": "modelled", "eu": True}
            return None, None

        # Hostel beds and guesthouse rooms.
        for k in ("dorm", "private"):
            if k in m:
                lvl, src = m[k]["level"], {"q": "measured", "n": m[k]["n"]}
            else:
                lvl, src = ladder(k)
            if lvl:
                rec["beds"][k] = round(lvl)
                rec["src"][k] = src
                rec["month"][k] = [round(lvl * c) for c in curve_for(k, (m.get(k) or {}).get("curve"))]

        # Hotels by star.
        h_lvl, h_src = (m["hotel_all"]["level"], {"q": "measured", "n": m["hotel_all"]["n"]}) \
            if "hotel_all" in m else ladder("hotel_all")
        h_curve = curve_for("hotel_all", (m.get("hotel_all") or {}).get("curve"))
        for s in (2, 3, 4, 5):
            k = f"hotel{s}"
            if k in m and m[k]["n"] >= 2:
                lvl, src = m[k]["level"], {"q": "measured", "n": m[k]["n"]}
                cur = curve_for(k, m[k]["curve"])
            elif h_lvl:
                lvl = h_lvl * ratio(star_ratio, cc, s, STAR_DEFAULT[s])
                src = dict(h_src, scaled=True)
                cur = h_curve
            else:
                continue
            rec["beds"][k] = round(lvl)
            rec["src"][k] = src
            rec["month"][k] = [round(lvl * c) for c in cur]
        # Stars rise: a class is never cheaper than the class below it.
        for s in (3, 4, 5):
            lo, k = rec["beds"].get(f"hotel{s - 1}"), f"hotel{s}"
            if lo and rec["beds"].get(k) and rec["beds"][k] < lo * STAR_STEP:
                f = lo * STAR_STEP / rec["beds"][k]
                rec["beds"][k] = round(rec["beds"][k] * f)
                rec["month"][k] = [round(v * f) for v in rec["month"][k]]
                rec["src"][k] = dict(rec["src"][k], scaled=True)
        if "single" in m and h_lvl:
            rec["single"]["hotel"] = round(m["single"]["level"] / h_lvl, 3)

        # Airbnb.
        ia = iab.get(d["id"]) or {}
        apt_curve = curve_for("apt", (m.get("apt") or {}).get("curve"))
        if ia.get("home"):
            homes = {c: ia["home"].get(str(c)) for c in HOME_CAPS}
            base4 = homes.get(4) or median([v / caps[c] for c, v in homes.items() if v])
            homes = {str(c): round(v if v else base4 * caps[c]) for c, v in homes.items()}
            src = {"q": "measured", "n": ia.get("n"), "iab": ia.get("snapshot")}
        else:
            if "apt" in m:
                base4 = m["apt"]["level"] * ratio(bnb_ratio, cc, "home", AIRBNB_HOME_RATIO)
                src = {"q": "measured", "n": m["apt"]["n"], "via": "apartments"}
            else:
                base4, src = ladder("iab_home")
            homes = {str(c): round(base4 * caps[c]) for c in HOME_CAPS} if base4 else None
        if homes:
            rec["beds"]["bnb_home"] = homes
            rec["src"]["bnb_home"] = src
            rec["month"]["bnb_home"] = [round(homes["4"] * c) for c in apt_curve]
        room = ia.get("room")
        if room:
            rsrc = {"q": "measured", "n": ia.get("n"), "iab": ia.get("snapshot")}
        elif "private" in rec["beds"]:
            room = rec["beds"]["private"] * ratio(bnb_ratio, cc, "room", AIRBNB_ROOM_RATIO)
            rsrc = dict(rec["src"]["private"], via="private")
        if room:
            rec["beds"]["bnb_room"] = round(room)
            rec["src"]["bnb_room"] = rsrc
            rec["month"]["bnb_room"] = [round(room * c) for c in apt_curve]

        wk, wn = m["_weekend"]
        rec["weekend"] = wk if wk and wn >= MIN_PAIRS else None
        rec["peak"] = {k: v for k, v in m["_peaks"].items() if v}
        rec["season_q"] = "".join("m" if f else "f" for f in flags_any)
        sup = supply.get(d["id"]) or {}
        rec["supply"] = {
            "hostel": bool(sup.get("hostel") or "dorm" in m),
            "hotel": bool(sup.get("hotel") or "hotel_all" in m),
            "hotel5": bool(sup.get("hotel5") or "hotel5" in m or d["pop"] >= 100_000),
            "bnb": bool(ia or "apt" in m or sup.get("apartment")),
        }
        qs = [v.get("q") for v in rec["src"].values()]
        rec["q"] = "measured" if "measured" in qs else "nearby" if "nearby" in qs else "modelled"
        dates = [o["cap"] for k in by_dest[d["id"]].values() for o in k]
        rec["captured"] = max(dates).isoformat() if dates else None
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
    """A record's annual price for one bed type (bnb_home: the 4-person place)."""
    v = ((rec or {}).get("beds") or {}).get(k)
    return v.get("4") if isinstance(v, dict) else v


def summarise(records, iso_of):
    """{cc: {bed: median price}} and {cc: {bed: measured towns}} for the manifest,
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
    the manifest alone (on Actions the workflow downloads only the live one)."""
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


def gates(records, iso_of, stats=None, prev=None, prev_manifest=None, calib=None, explain=()):
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
        line = f"- {s}: {v['rows']} rows, {v['legacy']} legacy, {rej} rejected ({share:.1%}) {v['rejected']}"
        rep.append(line)
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

    # 3. Nothing measured goes missing.
    rep.append("\n## 3. Losses (a country loses all measured data, or a measured bed tier)")
    lost = 0
    for cc, kk in sorted((p_cov or {}).items()):
        had = {k for k, n in kk.items() if n}
        now = {k for k, n in (cc_cov.get(cc) or {}).items() if n}
        if had and not now:
            lost += 1
            fails.append(f"loss {cc}: had measured {sorted(had)}, now nothing measured")
            continue
        for k in sorted(had - now):
            lost += 1
            fails.append(f"loss {cc} {k}: measured before, not now")
    rep.append(f"- {lost} losses")

    # 4. Minimum samples behind every measured value.
    rep.append(f"\n## 4. Minimum samples (a measured star class needs {MIN_STAR_PROPS} "
               f"hotels, weekend and peak factors {MIN_PAIRS} pairs, a country curve "
               f"{MIN_CURVE_TOWNS} towns)")
    thin = 0
    for did, r in records.items():
        for k, src in r["src"].items():
            if (k.startswith("hotel") and src.get("q") == "measured" and not src.get("scaled")
                    and (src.get("n") or 0) < MIN_STAR_PROPS):
                thin += 1
                fails.append(f"thin {did} {k}: measured from {src.get('n')} hotels")
    rep.append(f"- {thin} measured values under their minimum")

    # 5. The fixed test set, in euros.
    rep.append("\n## 5. Fixed test set (euros per night; destination threshold applies)\n")
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

    # 6. SerpApi: Google Hotels medians against THIS build.
    rep.append(f"\n## 6. SerpApi (Google Hotels median error, block above {SERPAPI_MAPE_MAX:.0%} "
               f"from {SERPAPI_MIN_N} references)")
    errs = []
    for ref in (calib or {}).get("refs") or []:
        mine = None
        r = records.get(ref.get("dest"))
        if r:
            cur = (r.get("month") or {}).get(ref["bed"])
            mine = cur[ref["month"] - 1] if cur and cur[ref["month"] - 1] else bed_value(r, ref["bed"])
        if mine and ref.get("google"):
            errs.append(abs(mine - ref["google"]) / ref["google"])
    if len(errs) >= SERPAPI_MIN_N:
        mape = median(errs)
        rep.append(f"- {len(errs)} references, median error {mape:.0%}")
        if mape > SERPAPI_MAPE_MAX:
            fails.append(f"SerpApi median error {mape:.0%} > {SERPAPI_MAPE_MAX:.0%} over {len(errs)} references")
    else:
        rep.append(f"- {len(errs)} references: too few to judge (no SERPAPI_KEY, or a calibration from before T645)")
        notes.append(f"SerpApi: {len(errs)} references, not judged")

    # Coverage (the T531 check, kept).
    if prev_manifest:
        for k, v in coverage(records).items():
            now = v.get("measured", 0) + v.get("nearby", 0)
            before = sum(prev_manifest.get("coverage", {}).get(k, {}).get(q, 0) for q in ("measured", "nearby"))
            if before and now < before * (1 - COVERAGE_DROP):
                fails.append(f"coverage {k}: measured+nearby fell {before} -> {now}")
    for i in SEASONAL_CHECK:
        r = records.get(i)
        cur = (r or {}).get("month", {}).get("hotel3")
        if cur and min(cur) and max(cur) / min(cur) < 1.4:
            notes.append(f"{i}: hotel3 peak/low only x{max(cur) / min(cur):.2f}")
    flat = [i for i, r in records.items()
            if sum(1 for c in r["month"].values() if min(c) and max(c) / min(c) < 1.05) > 2]
    if flat:
        notes.append(f"{len(flat)} destinations with flat curves on >2 bed types")
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
    a = ap.parse_args()
    dests = load_destinations()
    iso_of = {d["id"]: d["iso2"] for d in dests}
    euro = read_json(STATE / "eurostat.json", {}) or {}
    spike = read_json(STATE / "spike.json", {}) or read_json(STATE / "spike" / "spike.json", {}) or {}
    hw_unit = spike.get("hw_private_unit") or HW_PRIVATE_UNIT
    stats = {}
    obs = load_obs(journal(), euro.get("hicp") or {}, iso_of, stats, hw_unit)
    if JOURNAL_SCRAPE.exists():
        obs += load_obs(journal(JOURNAL_SCRAPE), euro.get("hicp") or {}, iso_of, stats, hw_unit)
    stats = {s: dict(v, rejected=dict(v["rejected"])) for s, v in stats.items()}
    for s, v in stats.items():
        print(f"contract {s}: {v['rows']} rows, {v['legacy']} legacy, rejected {v['rejected']}")
    iab = (read_json(STATE / "iab.json", {}) or {}).get("dests", {})
    supply = (read_json(STATE / "supply.json", {}) or {}).get("dests", {})
    records = build(dests, obs, iab, supply, euro)
    from live_keys import attach
    live_keys = attach(records, dests)
    print("live keys:", live_keys, "destinations")
    prev_recs, prev, where = load_prev()
    fails, notes, rep = gates(records, iso_of, stats, prev_recs, prev,
                              read_json(STATE / "calibration.json"),
                              read_json(EXPLAIN, []) or [])
    # T559: a build without the Xotelo pool writes no `xk`, and the newer live
    # copy would switch live bed prices off everywhere. Refuse to publish that.
    if live_keys == 0 and (prev or {}).get("live_keys", 1) > 0:
        fails.append("no live keys (xotelo_props.json missing from the state?)")
    write_report(fails, notes, rep, where)
    levels, cc_cov = summarise(records, iso_of)
    manifest = {
        "v": 1, "schema": 18, "built": now_iso(), "n": len(records),
        "coverage": coverage(records),
        "sources": {s: sum(1 for o in obs if o["src"] == s)
                    for s in ("xotelo", "booking", "hostelworld")},
        "contract": stats,
        "iab_dests": len(iab), "live_keys": live_keys, "hicp_latest": max((max(v) for v in (euro.get("hicp") or {}).values()), default=None),
        "levels": levels, "cc_cov": cc_cov,
        "gate": {"passed": not fails, "fails": fails[:300], "n_fails": len(fails),
                 "notes": notes, "against": where},
    }
    print("coverage:", manifest["coverage"])
    print("observations:", manifest["sources"], "IAB destinations:", len(iab))
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
        by_cc[d["iso2"]][d["id"]] = records[d["id"]]
    for cc, recs in by_cc.items():
        write_json(V / f"{cc}.json", {"v": 1, "cc": cc, "built": manifest["built"],
                                      "dests": recs}, compact=True)
    # The gate stamp (T646): apply_stays publishes only files whose hash is the
    # one a passed gate stamped here, so a build run without --gate, or files
    # changed after the build, never reach the app.
    h = files_hash(V)
    manifest["build"] = h[:12]
    manifest["gate"]["hash"] = h
    write_json(V / "manifest.json", manifest)
    print(f"wrote {len(by_cc)} country files to {V}")


if __name__ == "__main__":
    main()
