"""T631 field stubs: climate, lakes and beaches (explore completeness).

Tier: On demand (listed by pipeline/field_stubs/report.py)

Each row is a field the Explore sheets have a slot for and no source wired.
The function named by "stub" writes nothing and returns None. T641 wired
sunshine hours, beach and destination water temperature, lake ferry lines,
water sport zones, lifeguards, swimming bans, the lake wind profile, and
beach walks (see docs/SCHEMA.md, T641 section); what is left here has no open
source, or no licence that allows it.
"""
from __future__ import annotations

STUBS = [
    {
        "field": "thermal_winds",
        "layer": "lakes",
        "wire_key": "wind.thermal",
        "source": "no open source names a lake's thermal winds (Ora, Breva, Vento). Best candidate: windsurf and sailing spot guides, which are not open data. The monthly mean wind is wired as wind.profile.",
        "stub": "harvest_lake_thermal_winds",
        "task": "T631",
    },
    {
        "field": "lake_currents",
        "layer": "lakes",
        "wire_key": "currents",
        "source": "no open source: the `currents` hazard code exists on 38 lakes, no description or location. Best candidate: national lifeguard or boating authority notices, not structured",
        "stub": "harvest_lake_currents",
        "task": "T631",
    },
    {
        "field": "lido_price",
        "layer": "beaches",
        "wire_key": "lido.price",
        "source": "no open source: entry, sunbed and umbrella prices and reservation are per lido and appear only on operator sites. Best candidate: OSM `charge` and `fee` on leisure=beach_resort (rarely tagged); price rule: not shown in this batch",
        "stub": "harvest_lido_prices",
        "task": "T631",
    },
    {
        "field": "surface_at_water_entry",
        "layer": "beaches",
        "wire_key": "entrySurface",
        "source": "no open source: OSM surface describes the sand, not the sea bed at the entry. Best candidate: OSM natural=beach + `surface` on the water edge way, or photo classification",
        "stub": "harvest_beach_entry_surface",
        "task": "T631",
    },
    {
        "field": "beach_audience_luxury",
        "layer": "beaches",
        "wire_key": "audience.luxury",
        "source": "no exact open source: needs hotel star and lido tier near the beach; never derived from the word luxury or the town. Best candidate: OSM tourism=hotel stars within 300 m, not claimed as the audience",
        "stub": "harvest_beach_audience_luxury",
        "task": "T631",
    },
]

def _none():
    """A stub writes nothing and returns nothing."""
    return None


def harvest_lake_thermal_winds():
    return _none()


def harvest_lake_currents():
    return _none()


def harvest_lido_prices():
    return _none()


def harvest_beach_entry_surface():
    return _none()


def harvest_beach_audience_luxury():
    return _none()

