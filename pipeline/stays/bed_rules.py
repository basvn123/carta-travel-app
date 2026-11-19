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
    places = measured = dorm = legacy = 0
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
    return {"places": places, "measured": measured,
            "measured_share": round(measured / places, 4) if places else 0.0,
            "dorm_above_hotel3": dorm, "legacy": legacy}
