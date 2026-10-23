"""Field stubs for T632 (Explore completeness: practical, things to do, export).

Tier: On demand (python pipeline/field_stubs/report.py)

Each function below writes nothing and returns None. T641 wired train and
ferry lines, emergency numbers, swimming bans and the entry fee flag (see
docs/SCHEMA.md, T641 section); the rows left have no open structured source.
The app shows its "Not available yet" placeholder for every field here.
"""
from __future__ import annotations

STUBS = [
    {
        "field": "bus services between the towns",
        "layer": "destinations",
        "wire_key": "practical.transit.bus",
        "source": "code reads bus route types from any GTFS feed in pipeline/transit/feeds.json, but no regional bus feed with a verified commercial licence is registered. Best candidates: Mobility Database feeds with CC BY terms (Trentino Trasporti, TPL FVG, Regione Sardegna), licence to verify per feed",
        "stub": "harvest_local_transit_bus",
        "task": "T632",
    },
    {
        "field": "local rules (traffic zones, alcohol, dress, drone, fire)",
        "layer": "destinations",
        "wire_key": "practical.local_rules",
        "source": "no structured open source; Wikivoyage Respect sections are free text (CC BY-SA, would need extraction we do not trust). Best candidate: national tourism board pages, not open data",
        "stub": "harvest_local_rules",
        "task": "T632",
    },
    {
        "field": "thing to do: visit duration",
        "layer": "destinations",
        "wire_key": "do[].duration_min",
        "source": "no structured open source: OSM has no visit duration and Wikivoyage listings carry none (the place layer visit_h is used where present). Best candidate: operator pages, not open",
        "stub": "harvest_do_duration",
        "task": "T632",
    },
    {
        "field": "offline map in the destination PDF",
        "layer": "destinations",
        "wire_key": "pdf.offline_map",
        "source": "not a data source: needs rendered map tiles or an OsmAnd/Organic Maps link per destination; T632-g offline map is outside this batch (data part only)",
        "stub": "build_pdf_offline_map",
        "task": "T632",
    },
]

def _none():
    """A stub writes nothing and returns nothing."""
    return None


def harvest_local_transit_bus():
    return _none()


def harvest_local_rules():
    return _none()


def harvest_do_duration():
    return _none()


def build_pdf_offline_map():
    return _none()

