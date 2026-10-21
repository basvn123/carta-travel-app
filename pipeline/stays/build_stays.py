"""Build the stays wire (schema v18): one bed price per destination, bed type, month.

Inputs (STATE, pulled from R2 on Actions):
  journal.sqlite   dated observations: xotelo (monthly, Actions)
  journal_scrape.sqlite  booking + hostelworld (owner's laptop, twice a year)
  iab.json         Inside Airbnb medians per destination
  supply.json      OSM counts per destination
  eurostat.json    HICP CP112 (drift), nights (season fill-in), PLI (ladder)
  spike.json       hw_private_per_person (T530)
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
import sys
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (BED_TYPES, HOME_CAPS, JOURNAL_SCRAPE, OUT, STATE, haversine_km, journal,  # noqa: E402
                    load_destinations, median, now_iso, read_json, write_json)

V = OUT / "v1"
MAX_AGE_DAYS = 400
NEAR_KM = 30
PEAKS = {"aug15": (8, 14), "xmas": (12, 28)}
PLI_PROXY = {"GB": "IE", "FO": "DK", "AD": "ES", "LI": "CH", "MC": "FR",
             "SM": "IT", "MD": "RO"}
# Last-resort star ratios to the town's hotel level, used only when no country
# in Europe has measured both (never expected after the first runs).
STAR_DEFAULT = {2: 0.72, 3: 0.92, 4: 1.25, 5: 2.1}
SEASONAL_CHECK = ["PMI", "JTR", "DBV", "EDI"]


def size_bucket(pop):
    return 0 if pop >= 250_000 else 1 if pop >= 50_000 else 2 if pop >= 10_000 else 3


def month_add(y, m, k):
    m += k
    return y + (m - 1) // 12, (m - 1) % 12 + 1


# ------------------------------------------------------------------ inputs -- #

def load_obs(con, hicp, iso_of, hw_pp):
    """Observations newer than MAX_AGE_DAYS, levelled to today's prices."""
    rows = con.execute(
        "select source, dest_id, prop_key, kind, stars, bed, adults, chk_in, "
        "price_eur, captured from obs").fetchall()
    cutoff = date.today().toordinal() - MAX_AGE_DAYS
    out = []
    for src, did, key, kind, stars, bed, adults, chk, price, cap in rows:
        if src == "fixture" or did not in iso_of:
            continue
        cap_d = datetime.fromisoformat(cap.replace("Z", "")).date()
        if cap_d.toordinal() < cutoff:
            continue
        if src == "hostelworld" and bed == "private" and hw_pp:
            price = price * 2            # per person on the site -> per room
        price *= drift(hicp, iso_of[did], cap_d)
        out.append({"src": src, "dest": did, "key": f"{src}:{key}", "kind": kind,
                    "stars": stars, "bed": bed, "adults": adults,
                    "day": date.fromisoformat(chk), "price": price, "cap": cap_d})
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
    """obs of one destination and bed type -> (level, rel[12] or None, n_props)."""
    base = [o for o in obs if not is_weekend_probe(o["day"]) and not is_peak(o["day"])]
    by_prop = defaultdict(list)
    for o in base:
        by_prop[o["key"]].append(o)
    if not by_prop:
        return None, [None] * 12, 0
    levels, rel = [], [[] for _ in range(12)]
    for ps in by_prop.values():
        med = median([p["price"] for p in ps])
        levels.append(med)
        for p in ps:
            rel[p["day"].month - 1].append(p["price"] / med)
    curve = [median(r) if r else None for r in rel]
    return median(levels), curve, len(by_prop)


def normalise(curve):
    vals = [c for c in curve if c]
    if not vals:
        return curve
    mean = sum(vals) / len(vals)
    return [round(c / mean, 3) if c else None for c in curve]


def fill(curve, *fallbacks):
    """Fill gaps from fallbacks; returns (curve, measured flags)."""
    flags = [c is not None for c in curve]
    out = list(curve)
    for fb in fallbacks:
        if not fb:
            continue
        for i in range(12):
            if out[i] is None and fb[i]:
                out[i] = fb[i]
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
        m["_peaks"] = {name: pair_ratio(pooled, lambda day, mm=mm, dd=dd:
                                        (day.month, day.day) == (mm, dd))[0]
                       for name, (mm, dd) in PEAKS.items()}
        m["_peaks"]["easter"] = pair_ratio(
            pooled, lambda day: day.weekday() == 5 and day.month in (3, 4))[0]
        meas[d["id"]] = m

    # Country aggregates: curves, star ratios, Airbnb ratios, levels by size.
    cc_curve = defaultdict(lambda: defaultdict(lambda: [[] for _ in range(12)]))
    star_ratio = defaultdict(lambda: defaultdict(list))
    bnb_ratio = defaultdict(lambda: defaultdict(list))
    lvl_by = defaultdict(lambda: defaultdict(list))
    cap_ratio = defaultdict(list)
    for d in dests:
        m, cc = meas[d["id"]], d["iso2"]
        for k, v in m.items():
            if k.startswith("_"):
                continue
            for i, c in enumerate(v["curve"]):
                if c:
                    cc_curve[cc][k][i].append(c)
            lvl_by[(cc, k)][size_bucket(d["pop"])].append(v["level"])
            lvl_by[("EU", k)][size_bucket(d["pop"])].append(v["level"] / (pli.get(cc, 100) / 100))
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
            lvl_by[("EU", "iab_home")][size_bucket(d["pop"])].append(h4 / (pli.get(cc, 100) / 100))
            for c in HOME_CAPS:
                v = (ia.get("home") or {}).get(str(c))
                if v:
                    cap_ratio[c].append(v / h4)
    cc_curve = {cc: {k: [median(x) if x else None for x in v] for k, v in kk.items()}
                for cc, kk in cc_curve.items()}
    ratio = lambda table, cc, k, default: (median(table[cc][k]) if table[cc][k] else  # noqa: E731
                                          median(table["EU"][k]) if table["EU"][k] else default)
    caps = {c: (median(v) if v else {2: 0.8, 4: 1.0, 6: 1.35, 8: 1.7}[c]) for c, v in cap_ratio.items()}
    for c in HOME_CAPS:
        caps.setdefault(c, {2: 0.8, 4: 1.0, 6: 1.35, 8: 1.7}[c])

    def nights_curve(cc):
        n = nights.get(cc) or nights.get("EU")
        return [round(x ** 0.35, 3) for x in n] if n else None

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
                p = pli.get(cc) or pli.get(PLI_PROXY.get(cc, ""), 100)
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
                base4 = m["apt"]["level"] * ratio(bnb_ratio, cc, "home", 1.15)
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
            room = rec["beds"]["private"] * ratio(bnb_ratio, cc, "room", 0.95)
            rsrc = dict(rec["src"]["private"], via="private")
        if room:
            rec["beds"]["bnb_room"] = round(room)
            rec["src"]["bnb_room"] = rsrc
            rec["month"]["bnb_room"] = [round(room * c) for c in apt_curve]

        wk, wn = m["_weekend"]
        rec["weekend"] = wk if wk and wn >= 2 else None
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


def gates(records, prev, calib):
    fails, notes = [], []
    if prev:
        for k, v in coverage(records).items():
            now = v.get("measured", 0) + v.get("nearby", 0)
            before = sum(prev.get("coverage", {}).get(k, {}).get(q, 0) for q in ("measured", "nearby"))
            if before and now < before * 0.98:
                fails.append(f"{k}: measured+nearby fell {before} -> {now}")
    if calib and calib.get("mape") and calib["mape"] > 0.25:
        fails.append(f"SerpApi median error {calib['mape']:.0%} > 25%")
    for i in SEASONAL_CHECK:
        r = records.get(i)
        cur = (r or {}).get("month", {}).get("hotel3")
        if cur and min(cur) and max(cur) / min(cur) < 1.4:
            notes.append(f"{i}: hotel3 peak/low only x{max(cur) / min(cur):.2f}")
    flat = [i for i, r in records.items()
            if sum(1 for c in r["month"].values() if min(c) and max(c) / min(c) < 1.05) > 2]
    if flat:
        notes.append(f"{len(flat)} destinations with flat curves on >2 bed types")
    return fails, notes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gate", action="store_true")
    a = ap.parse_args()
    dests = load_destinations()
    iso_of = {d["id"]: d["iso2"] for d in dests}
    euro = read_json(STATE / "eurostat.json", {}) or {}
    spike = read_json(STATE / "spike.json", {}) or read_json(STATE / "spike" / "spike.json", {}) or {}
    obs = load_obs(journal(), euro.get("hicp") or {}, iso_of,
                   spike.get("hw_private_per_person"))
    if JOURNAL_SCRAPE.exists():
        obs += load_obs(journal(JOURNAL_SCRAPE), euro.get("hicp") or {}, iso_of,
                        spike.get("hw_private_per_person"))
    iab = (read_json(STATE / "iab.json", {}) or {}).get("dests", {})
    supply = (read_json(STATE / "supply.json", {}) or {}).get("dests", {})
    records = build(dests, obs, iab, supply, euro)
    prev = read_json(V / "manifest.json")
    fails, notes = gates(records, prev, read_json(STATE / "calibration.json"))
    manifest = {
        "v": 1, "schema": 18, "built": now_iso(), "n": len(records),
        "coverage": coverage(records),
        "sources": {s: sum(1 for o in obs if o["src"] == s)
                    for s in ("xotelo", "booking", "hostelworld")},
        "iab_dests": len(iab), "hicp_latest": max((max(v) for v in (euro.get("hicp") or {}).values()), default=None),
        "gate": {"fails": fails, "notes": notes},
    }
    print("coverage:", manifest["coverage"])
    print("observations:", manifest["sources"], "IAB destinations:", len(iab))
    for n in notes:
        print("note:", n)
    if a.gate and fails:
        for f in fails:
            print("GATE FAILED:", f)
        sys.exit(2)
    by_cc = defaultdict(dict)
    for d in dests:
        by_cc[d["iso2"]][d["id"]] = records[d["id"]]
    for cc, recs in by_cc.items():
        write_json(V / f"{cc}.json", {"v": 1, "cc": cc, "built": manifest["built"],
                                      "dests": recs}, compact=True)
    write_json(V / "manifest.json", manifest)
    print(f"wrote {len(by_cc)} country files to {V}")


if __name__ == "__main__":
    main()
