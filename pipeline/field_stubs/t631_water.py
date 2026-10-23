"""T631 field stubs: climate, lakes and beaches (explore completeness).

Tier: On demand (listed by pipeline/field_stubs/report.py)

Each row is a field the Explore sheets have a slot for and no source wired
yet. The function named by "stub" writes nothing and returns None; the row is
the to-do for the next data update. Fields whose code is written but not yet
run (rain days, wind, altitude, lake zones, lake beaches, beach access model)
are NOT here: they are in harvest_climate_power.py, apply_climate.py,
lakes/export_lakes.py and beaches/export_beaches.py, and are documented in
docs/SCHEMA.md under the T631 section.
"""
from __future__ import annotations

STUBS = [
    {
        "field": "sunshine_hours",
        "layer": "destinations",
        "wire_key": "climate.sun_h",
        "source": "none in NASA POWER (radiation only, no duration); ERA5 or E-OBS sunshine duration, or national met services",
        "stub": "harvest_sunshine_hours",
        "task": "T631",
    },
    {
        "field": "thermal_winds",
        "layer": "lakes",
        "wire_key": "wind.profile",
        "source": "none known (open data): per-lake wind profile for watersports, e.g. ERA5 hourly wind by month at the lake, or windsurf spot guides",
        "stub": "harvest_lake_wind_profile",
        "task": "T631",
    },
    {
        "field": "water_temperature_beach",
        "layer": "beaches",
        "wire_key": "sst",
        "source": "monthly sea surface temperature climatology per beach (Copernicus Marine); the export already forwards `sst` when a beach carries it",
        "stub": "harvest_beach_water_temperature",
        "task": "T631",
    },
    {
        "field": "water_temperature_destination",
        "layer": "destinations",
        "wire_key": "climate.water_c",
        "source": "none known: nearest coast or lake sea surface temperature climatology per destination",
        "stub": "harvest_destination_water_temperature",
        "task": "T631",
    },
    {
        "field": "ferry_line_names",
        "layer": "lakes",
        "wire_key": "ferry.lines",
        "source": "OSM route=ferry relations touching the lake, or national operator timetables (GTFS)",
        "stub": "harvest_lake_ferry_lines",
        "task": "T631",
    },
    {
        "field": "watersport_zones",
        "layer": "lakes",
        "wire_key": "sportZones",
        "source": "OSM sport=windsurfing/sailing/water_ski polygons with geometry (the context sweep keeps counts only)",
        "stub": "harvest_lake_sport_zones",
        "task": "T631",
    },
    {
        "field": "lake_lifeguards",
        "layer": "lakes",
        "wire_key": "lifeguards",
        "source": "OSM lifeguard=* and supervised=* on swimming areas on the lake; no lake level source",
        "stub": "harvest_lake_lifeguards",
        "task": "T631",
    },
    {
        "field": "lake_swimming_bans",
        "layer": "lakes",
        "wire_key": "swim.ban",
        "source": "municipal or national bathing ordinances; only the swim.rule verdict exists today",
        "stub": "harvest_lake_swim_bans",
        "task": "T631",
    },
    {
        "field": "lake_currents",
        "layer": "lakes",
        "wire_key": "currents",
        "source": "none known: the `currents` hazard code exists on 38 lakes, no description or location",
        "stub": "harvest_lake_currents",
        "task": "T631",
    },
    {
        "field": "lido_price",
        "layer": "beaches",
        "wire_key": "lido.price",
        "source": "none known (open data): entry, sunbed and umbrella prices and reservation need per lido",
        "stub": "harvest_lido_prices",
        "task": "T631",
    },
    {
        "field": "surface_at_water_entry",
        "layer": "beaches",
        "wire_key": "entrySurface",
        "source": "OSM surface on the beach is for the sand; the sea bed at the entry needs a survey or photo classification",
        "stub": "harvest_beach_entry_surface",
        "task": "T631",
    },
    {
        "field": "walk_from_ferry_pier",
        "layer": "beaches",
        "wire_key": "walkFrom.pier",
        "source": "routing from the nearest ferry pier to the beach (pedestrian router); base.km is straight line to a town, not a walk",
        "stub": "harvest_beach_walk_from_pier",
        "task": "T631",
    },
    {
        "field": "walk_from_centre",
        "layer": "beaches",
        "wire_key": "walkFrom.centre",
        "source": "routing from the base town centre to the beach (pedestrian router)",
        "stub": "harvest_beach_walk_from_centre",
        "task": "T631",
    },
    {
        "field": "beach_audience_luxury",
        "layer": "beaches",
        "wire_key": "audience.luxury",
        "source": "none exact: would need hotel star and lido tier near the beach",
        "stub": "harvest_beach_audience_luxury",
        "task": "T631",
    },
    {
        "field": "gorge_wet_rock_flag",
        "layer": "trails",
        "wire_key": "gorge",
        "source": "OSM natural=gorge or name words on the route; no flag in the trails wire today (T630 owns the trail schema)",
        "stub": "harvest_route_gorge_flag",
        "task": "T631",
    },
]


def _none():
    """A stub writes nothing and returns nothing."""
    return None


def harvest_sunshine_hours():
    return _none()


def harvest_lake_wind_profile():
    return _none()


def harvest_beach_water_temperature():
    return _none()


def harvest_destination_water_temperature():
    return _none()


def harvest_lake_ferry_lines():
    return _none()


def harvest_lake_sport_zones():
    return _none()


def harvest_lake_lifeguards():
    return _none()


def harvest_lake_swim_bans():
    return _none()


def harvest_lake_currents():
    return _none()


def harvest_lido_prices():
    return _none()


def harvest_beach_entry_surface():
    return _none()


def harvest_beach_walk_from_pier():
    return _none()


def harvest_beach_walk_from_centre():
    return _none()


def harvest_beach_audience_luxury():
    return _none()


def harvest_route_gorge_flag():
    return _none()
