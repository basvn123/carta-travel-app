"""T630 field stubs: routes and peaks (see report.py for the format).

Each function writes nothing and returns None. They exist so the next scrape
knows exactly which gap a sheet slot is waiting on. Fields whose pipeline
code is written but not yet run (sac_scale on country rows, sac_segments,
technique, exposure, cycle route shape, peak huts, slope, range rank) are not
stubs: they have code, and wait for a run.
"""

STUBS = [
    {
        "field": "reachable by public transport or ferry",
        "layer": "trails",
        "wire_key": "transit {rail, bus, ferry}",
        "source": "OSM ferry terminals and public_transport bus stops near the "
                  "trailhead; pipeline/trails/transit_stops.py holds rail and "
                  "bus stations only",
        "stub": "harvest_trail_ferry_and_bus_stops",
        "task": "T630",
    },
    {
        "field": "cable car and mountain railway price",
        "layer": "mountains",
        "wire_key": "lift.price",
        "source": "none known (operator websites, no open feed)",
        "stub": "harvest_lift_prices",
        "task": "T630",
    },
    {
        "field": "cable car and mountain railway opening hours",
        "layer": "mountains",
        "wire_key": "lift.hours",
        "source": "OSM opening_hours on the aerialway, where tagged",
        "stub": "harvest_lift_hours",
        "task": "T630",
    },
]


def harvest_trail_ferry_and_bus_stops():
    """Would find ferry piers and bus stops within 500 m of the trailhead and
    write trips.transit. Writes nothing."""
    return None


def harvest_lift_prices():
    """Would read a ticket price per lift operator. Writes nothing."""
    return None


def harvest_lift_hours():
    """Would read opening_hours (and a season) per aerialway. Writes nothing."""
    return None
