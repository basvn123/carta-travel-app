"""T630 field stubs: routes and peaks (see report.py for the format).

Each function writes nothing and returns None. T641 wired the trail transit
flags (ferry terminals and bus stops in transit_stops.py, read by
export_wire.py) and the lift opening hours (harvest_lift_hours.py). What is
left is the lift price.
"""
from __future__ import annotations

STUBS = [
    {
        "field": "cable car and mountain railway price",
        "layer": "mountains",
        "wire_key": "lift.price",
        "source": "no open price feed. OSM `charge` on lifts is harvested into lift.fare (a price record for plan phase F9, with value, unit, currency, source, date, quality) but no price is shown in this batch, so the slot stays. Best candidate: operator tariff pages",
        "stub": "harvest_lift_prices",
        "task": "T630",
    },
]

def _none():
    """A stub writes nothing and returns nothing."""
    return None


def harvest_lift_prices():
    return _none()

