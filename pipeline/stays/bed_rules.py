"""What counts as a measured bed price, and which bed figures are doubtful (D10, wave 1 item 0.1).

One rule, imported by every caller: build_stays and apply_stays (clean the
figures), the D2 scorecard and the publish guard (count measured places) and
the launch gate (the beds row). Two paths that each kept their own idea of a
bed rule is how the box master kept 3,544 pre-T1021 "modelled" blocks without
anyone noticing (`.work/2026-11-19-fix-data-w1/cause.md`).

Pure and stdlib only, so the box, CI and the scorecard can import it by path.
"""


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def is_measured(acc):
    """True for a block the current scrape build wrote.

    `captured` is required: the builder since T1021 always sets it, and a
    legacy block (pre-T1021 ladder, q "measured" but captured null) is not a
    measurement we can date, whatever its q says.
    """
    if not isinstance(acc, dict):
        return False
    return acc.get("q") == "measured" and bool(acc.get("beds")) and bool(acc.get("captured"))


def dorm_above_hotel3(beds):
    """A dorm bed dearer than a 3-star room: one of the two figures is wrong."""
    if not isinstance(beds, dict):
        return False
    dorm, hotel3 = beds.get("dorm"), beds.get("hotel3")
    return _num(dorm) and _num(hotel3) and dorm > hotel3


def clean_beds(beds, month=None):
    """(beds, month, dropped): drop the dorm figure when it is above hotel3.

    The dorm figure is the doubtful one: Hostelworld lists few dorms in small
    places, and a handful of dear ones set the median, while the 3-star
    median rests on Booking's much larger sample.
    """
    if not dorm_above_hotel3(beds):
        return beds, month, []
    beds = {k: v for k, v in beds.items() if k != "dorm"}
    if isinstance(month, dict) and "dorm" in month:
        month = {k: v for k, v in month.items() if k != "dorm"}
    return beds, month, ["dorm"]


def bed_stats(dests):
    """Counts over places a traveller can open (gateways are skipped).

    `dests` is the master's destinations dict (or any iterable of records).
    """
    rows = dests.values() if isinstance(dests, dict) else dests
    places = measured = dorm = legacy = ooo = floor = 0
    for d in rows:
        if d.get("gateway_of"):
            continue
        places += 1
        acc = d.get("accommodation")
        if is_measured(acc):
            measured += 1
        elif isinstance(acc, dict) and acc.get("beds"):
            legacy += 1
        if isinstance(acc, dict) and dorm_above_hotel3(acc.get("beds")):
            dorm += 1
        if isinstance(acc, dict):
            ooo += bool(order_violations(acc.get("beds")))
            floor += bool(under_floor(acc.get("beds")))
    return {"places": places, "measured": measured,
            "measured_share": round(measured / places, 4) if places else 0.0,
            "dorm_above_hotel3": dorm, "legacy": legacy,
            "out_of_order": ooo, "under_floor": floor}


# ---------------------------------------------------------------------------
# D10 (wave 2, 1.4): bed sanity beyond dorm against hotel3. One function,
# clean_all, runs in build_stays.build() and in apply_stays.apply_build(), so
# the build and the master cannot disagree about which tier is doubtful.
# ---------------------------------------------------------------------------

FLOOR_EUR = 10          # a bed or room under this is a parse error, not a price
MIN_PROPS = 3           # properties behind a tier; fewer is a thin sample
OUTLIER_X = 3.0         # a tier this many times the country median is wrong
MIN_COUNTRY_PLACES = 5  # no country median from fewer places
STARS = ("hotel2", "hotel3", "hotel4", "hotel5")
# The dorm figure is the doubtful one against these (wave 1: Hostelworld lists
# few dorms in small places and a handful of dear ones set the median), so
# only the dorm goes. Two star tiers out of order drop both: nothing says
# which of the two is right. A private room is a room for two and can undercut
# a 2-star, and bnb_home is a whole home: neither is ordered against hotels.
DORM_PAIRS = (("dorm", "private"), ("dorm", "hotel3"))


def _tier_value(v):
    """The euro figure of a tier: bnb_home is {"2": n, ...}, the rest a number."""
    if isinstance(v, dict):
        v = v.get("2")
    return v if _num(v) else None


def order_violations(beds):
    """[(cheaper tier, dearer tier)] where the cheaper one costs more (strict)."""
    if not isinstance(beds, dict):
        return []
    out = []
    for lo, hi in DORM_PAIRS:
        a, b = _tier_value(beds.get(lo)), _tier_value(beds.get(hi))
        if a is not None and b is not None and a > b:
            out.append((lo, hi))
    present = [t for t in STARS if _tier_value(beds.get(t)) is not None]
    for i, lo in enumerate(present):
        for hi in present[i + 1:]:
            if beds[lo] > beds[hi]:
                out.append((lo, hi))
    return out


def under_floor(beds):
    """Tiers priced under FLOOR_EUR."""
    if not isinstance(beds, dict):
        return []
    return [t for t, v in beds.items() if _tier_value(v) is not None and _tier_value(v) < FLOOR_EUR]


def thin_tiers(src):
    """Tiers whose own record says fewer than MIN_PROPS properties priced them.
    Only the build's records carry `src` (the master block drops it), which is
    why the rule can only act where the sample size is still known."""
    if not isinstance(src, dict):
        return []
    return [t for t, s in src.items()
            if isinstance(s, dict) and _num(s.get("n")) and s["n"] < MIN_PROPS]


def country_medians(beds_by_id, country_of):
    """{country: {tier: median}} over the places of each country that have the
    tier; a tier with fewer than MIN_COUNTRY_PLACES places has no median."""
    vals = {}
    for pid, beds in beds_by_id.items():
        cc = country_of.get(pid)
        if not cc or not isinstance(beds, dict):
            continue
        for t, v in beds.items():
            v = _tier_value(v)
            if v is not None:
                vals.setdefault(cc, {}).setdefault(t, []).append(v)
    out = {}
    for cc, tiers in vals.items():
        for t, xs in tiers.items():
            if len(xs) >= MIN_COUNTRY_PLACES:
                xs = sorted(xs)
                mid = len(xs) // 2
                out.setdefault(cc, {})[t] = xs[mid] if len(xs) % 2 else (xs[mid - 1] + xs[mid]) / 2
    return out


def clean_all(rec_or_beds, medians=None):
    """(cleaned, dropped): a record {"beds", "month", "src", ...} or a bare
    beds dict with every doubtful tier removed, `dropped` as [(tier, why)].

    In order: thin sample (from `src`, when the record has it), under the
    floor, above OUTLIER_X times `medians` (the country's {tier: median}),
    then tiers out of order (dorm_pairs and the star chain, see above). A
    dropped tier also leaves `month` and `src`. Pure: the input is not
    changed, and cleaning the output again drops nothing."""
    is_rec = isinstance(rec_or_beds, dict) and isinstance(rec_or_beds.get("beds"), dict)
    beds = dict(rec_or_beds["beds"]) if is_rec else dict(rec_or_beds or {})
    month = dict(rec_or_beds.get("month") or {}) if is_rec else {}
    src = dict(rec_or_beds.get("src") or {}) if is_rec else {}
    dropped = []

    def drop(tier, why):
        if tier in beds:
            beds.pop(tier)
            month.pop(tier, None)
            src.pop(tier, None)
            dropped.append((tier, why))

    for t in thin_tiers(src):
        drop(t, "thin")
    for t in under_floor(beds):
        drop(t, "floor")
    for t, m in (medians or {}).items():
        v = _tier_value(beds.get(t))
        if v is not None and _num(m) and m > 0 and v > OUTLIER_X * m:
            drop(t, "country_x3")
    for lo, hi in order_violations(beds):
        if lo not in beds or hi not in beds:
            continue        # an earlier pair already took one: the other is not in doubt
        drop(lo, "order")
        if (lo, hi) not in DORM_PAIRS:
            drop(hi, "order")
    if not is_rec:
        return beds, dropped
    out = dict(rec_or_beds)
    out["beds"] = beds
    if "month" in rec_or_beds:
        out["month"] = month
    if "src" in rec_or_beds:
        out["src"] = src
    return out, dropped


def clean_many(records, country_of):
    """({id: cleaned record}, {id: [(tier, why)]}) over a whole build.

    clean_all per record with the country medians, repeated until nothing
    more drops (a dropped outlier moves its country's median), so the build
    and the master apply, which both call this, end on the same figures.
    Records left without a tier stay in the result with empty `beds`; the
    caller decides what "Not available yet" means for them."""
    cur = {i: r for i, r in records.items()}
    why = {}
    for _ in range(6):
        med = country_medians({i: r["beds"] for i, r in cur.items() if isinstance(r.get("beds"), dict)}, country_of)
        changed = False
        for i, r in list(cur.items()):
            cleaned, dropped = clean_all(r, med.get(country_of.get(i)))
            if dropped:
                cur[i] = cleaned
                why.setdefault(i, []).extend(dropped)
                changed = True
        if not changed:
            break
    return cur, why
