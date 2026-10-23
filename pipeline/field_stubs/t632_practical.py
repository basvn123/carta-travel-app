"""Field stubs for T632 (Explore completeness: practical, things to do, export).

Tier: On demand (python pipeline/field_stubs/report.py)

Each function below writes nothing and returns None. It names the harvest a
later task fills in. The app shows its "Not available yet" placeholder for
every field here until then.
"""
from __future__ import annotations

STUBS = [
    {"field": "train services between the towns", "layer": "destinations",
     "wire_key": "practical.transit.train", "source": "open GTFS feeds (national rail operators, Transitland)",
     "stub": "harvest_local_transit_train", "task": "T632"},
    {"field": "bus services between the towns", "layer": "destinations",
     "wire_key": "practical.transit.bus", "source": "open GTFS feeds (regional bus operators, Transitland)",
     "stub": "harvest_local_transit_bus", "task": "T632"},
    {"field": "ferry services between the towns", "layer": "destinations",
     "wire_key": "practical.transit.ferry", "source": "ferry operator timetables, OSM route=ferry relations, GTFS where published",
     "stub": "harvest_local_transit_ferry", "task": "T632"},
    {"field": "local rules (traffic zones, alcohol, dress, drone, fire)", "layer": "destinations",
     "wire_key": "practical.local_rules", "source": "none known as open data; national tourism boards and Wikivoyage Respect sections",
     "stub": "harvest_local_rules", "task": "T632"},
    {"field": "swimming bans", "layer": "destinations",
     "wire_key": "water.bans", "source": "EEA bathing water prohibition flags, regional authority notices (T631 owns the field on beach and lake pages)",
     "stub": "harvest_swimming_bans", "task": "T632"},
    {"field": "thing to do: entry price", "layer": "destinations",
     "wire_key": "do[].fee / do[].fee_eur", "source": "OSM fee and charge tags (not in the POI shards today), Wikidata admission P2555",
     "stub": "harvest_do_fee", "task": "T632"},
    {"field": "thing to do: visit duration", "layer": "destinations",
     "wire_key": "do[].duration_min", "source": "Wikivoyage listings, operator pages (not in the POI shards today)",
     "stub": "harvest_do_duration", "task": "T632"},
    {"field": "offline map in the destination PDF", "layer": "destinations",
     "wire_key": "pdf.offline_map", "source": "static map tiles rendered per destination, or an OsmAnd/Organic Maps deep link",
     "stub": "build_pdf_offline_map", "task": "T632"},
    {"field": "emergency contacts in the destination PDF", "layer": "destinations",
     "wire_key": "practical.emergency", "source": "112 and national numbers per country (open reference lists), nearest hospital from OSM",
     "stub": "harvest_emergency_contacts", "task": "T632"},
]


def _stub() -> None:
    return None


def harvest_local_transit_train() -> None:
    return _stub()


def harvest_local_transit_bus() -> None:
    return _stub()


def harvest_local_transit_ferry() -> None:
    return _stub()


def harvest_local_rules() -> None:
    return _stub()


def harvest_swimming_bans() -> None:
    return _stub()


def harvest_do_fee() -> None:
    return _stub()


def harvest_do_duration() -> None:
    return _stub()


def build_pdf_offline_map() -> None:
    return _stub()


def harvest_emergency_contacts() -> None:
    return _stub()
